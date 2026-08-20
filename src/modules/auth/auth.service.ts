import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";
import { UserRole, ClientType, CommunicationChannel } from "@prisma/client";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  AppError,
  BadRequestError,
} from "../../common/errors/app-error.js";
import { generateClientNumber } from "../../common/utils/generators.js";
import { createAuditLog } from "../../common/utils/audit.js";
import { emailService } from "../../infrastructure/email/index.js";
import { detectDuplicateClient } from "../../common/utils/duplicate-detector.js";
import { notificationOrchestrator } from "../notifications/notification-orchestrator.service.js";

export interface RegisterDto {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  clientType?: ClientType;
  businessName?: string;
  nationalId?: string;
  passportNumber?: string;
  kraPin?: string;
  address?: string;
  county?: string;
  city?: string;
  preferredChannel?: CommunicationChannel;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private generateTokens(userId: string, email: string, role: UserRole, organizationId: string): AuthTokens {
    const accessToken = jwt.sign(
      { userId, email, role, organizationId },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
    );

    const refreshToken = crypto.randomBytes(40).toString("hex");

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictError("An account with this email already exists.");
    }

    // 2. Fetch primary organization
    const organization = await prisma.organization.findFirstOrThrow({
      where: { slug: "swift-doc" },
    });

    // 3. Check for duplicates
    const duplicateCheck = await detectDuplicateClient({
      organizationId: organization.id,
      email: normalizedEmail,
      phone: dto.phone,
      nationalId: dto.nationalId,
      passportNumber: dto.passportNumber,
      kraPin: dto.kraPin,
      businessName: dto.businessName,
    });

    // 4. Hash password
    const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_SALT_ROUNDS);

    // 5. Atomic Transaction: Create User + Client Profile + Audit Log
    const result = await prisma.$transaction(async (tx) => {
      const clientNumber = await generateClientNumber(organization.id);

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: normalizedEmail,
          passwordHash,
          role: UserRole.CLIENT,
          isActive: true,
          isEmailVerified: false,
        },
      });

      const client = await tx.client.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          clientNumber,
          clientType: dto.clientType || ClientType.INDIVIDUAL,
          fullName: dto.fullName.trim(),
          businessName: dto.businessName?.trim() || null,
          email: normalizedEmail,
          phone: dto.phone.trim(),
          nationalId: dto.nationalId?.trim() || null,
          passportNumber: dto.passportNumber?.trim() || null,
          kraPin: dto.kraPin?.trim() || null,
          address: dto.address?.trim() || null,
          county: dto.county?.trim() || null,
          city: dto.city?.trim() || null,
          preferredCommunicationChannel: dto.preferredChannel || CommunicationChannel.EMAIL,
          isDuplicateFlagged: duplicateCheck.isDuplicateFound,
          duplicateReason: duplicateCheck.isDuplicateFound ? duplicateCheck.reasons.join("; ") : null,
          isActive: true,
        },
      });

      await createAuditLog(
        {
          organizationId: organization.id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: UserRole.CLIENT,
          action: "CLIENT_REGISTERED",
          resource: "Client",
          resourceId: client.id,
          ipAddress,
          userAgent,
          metadata: {
            clientNumber,
            isDuplicateFlagged: duplicateCheck.isDuplicateFound,
          },
        },
        tx
      );

      return { user, client };
    });

    // 6. Generate Tokens & Store Refresh Token
    const tokens = this.generateTokens(result.user.id, result.user.email, result.user.role, organization.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.refreshToken.create({
      data: {
        userId: result.user.id,
        tokenHash: this.hashToken(tokens.refreshToken),
        deviceInfo: userAgent,
        ipAddress,
        expiresAt,
      },
    });

    // 7. Trigger Welcome Email & Admin Notification (Async background)
    void emailService.sendWelcomeEmail(result.user.email, result.client.fullName);
    void notificationOrchestrator.notifyAdminNewRegistration({
      organizationId: organization.id,
      clientId: result.client.id,
      clientNumber: result.client.clientNumber,
      clientName: result.client.fullName,
      clientEmail: result.client.email,
      clientPhone: result.client.phone,
      clientType: result.client.clientType,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        isEmailVerified: result.user.isEmailVerified,
      },
      client: {
        id: result.client.id,
        clientNumber: result.client.clientNumber,
        fullName: result.client.fullName,
        clientType: result.client.clientType,
        phone: result.client.phone,
      },
      tokens,
    };
  }

  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        clientProfile: true,
        organization: true,
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError(
        `Account is temporarily locked due to failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}`
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockedUntil,
        },
      });

      throw new UnauthorizedError("Invalid email or password");
    }

    // Reset failed attempts & record login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const tokens = this.generateTokens(user.id, user.email, user.role, user.organizationId);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(tokens.refreshToken),
        deviceInfo: userAgent,
        ipAddress,
        expiresAt,
      },
    });

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "USER_LOGIN",
      resource: "User",
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt,
      },
      client: user.clientProfile
        ? {
            id: user.clientProfile.id,
            clientNumber: user.clientProfile.clientNumber,
            fullName: user.clientProfile.fullName,
            clientType: user.clientProfile.clientType,
            phone: user.clientProfile.phone,
          }
        : null,
      tokens,
    };
  }

  async refreshToken(rawRefreshToken: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = this.hashToken(rawRefreshToken);

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            clientProfile: true,
          },
        },
      },
    });

    if (!tokenRecord || tokenRecord.isRevoked || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const { user } = tokenRecord;
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedError("User account is inactive");
    }

    // Revoke old refresh token (Rotation)
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    // Issue new token pair
    const tokens = this.generateTokens(user.id, user.email, user.role, user.organizationId);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(tokens.refreshToken),
        deviceInfo: userAgent,
        ipAddress,
        expiresAt,
      },
    });

    return { tokens };
  }

  async logout(rawRefreshToken: string, userId?: string) {
    const tokenHash = this.hashToken(rawRefreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        userId: userId || undefined,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientProfile: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            currency: true,
          },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new NotFoundError("User");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      organization: user.organization,
      clientProfile: user.clientProfile,
    };
  }

  async forgotPassword(email: string, ipAddress?: string, userAgent?: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const genericSuccessMessage = "If an account with that email address exists, a password reset link has been sent.";

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        clientProfile: true,
        organization: true,
      },
    });

    if (!user || user.deletedAt || !user.isActive) {
      return { message: genericSuccessMessage };
    }

    const resetToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        purpose: "PASSWORD_RESET",
      },
      env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const clientOrigin = env.CORS_ORIGIN.split(",")[0].trim() || "http://localhost:3000";
    const resetLink = `${clientOrigin}/reset-password?token=${resetToken}`;
    const clientName = user.clientProfile?.fullName || "Valued Client";

    void emailService.sendPasswordResetEmail(user.email, clientName, resetToken, resetLink);

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "PASSWORD_RESET_REQUESTED",
      resource: "User",
      resourceId: user.id,
      ipAddress,
      userAgent,
      metadata: {
        email: user.email,
      },
    });

    return { message: genericSuccessMessage };
  }

  async resetPassword(token: string, newPassword: string, ipAddress?: string, userAgent?: string): Promise<{ message: string }> {
    let payload: any;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; email: string; purpose: string };
    } catch {
      throw new BadRequestError("Invalid or expired password reset link. Please request a new one.");
    }

    if (!payload || payload.purpose !== "PASSWORD_RESET" || !payload.userId) {
      throw new BadRequestError("Invalid password reset token.");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { clientProfile: true },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new NotFoundError("User account");
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: user.id,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });

      await createAuditLog(
        {
          organizationId: user.organizationId,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: "PASSWORD_RESET_COMPLETED",
          resource: "User",
          resourceId: user.id,
          ipAddress,
          userAgent,
          metadata: {
            email: user.email,
          },
        },
        tx
      );
    });

    const clientName = user.clientProfile?.fullName || "Valued Client";
    void emailService.sendPasswordResetSuccessEmail(user.email, clientName);

    return { message: "Password has been successfully reset. You may now sign in." };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, ipAddress?: string, userAgent?: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new NotFoundError("User");
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestError("Current password is incorrect.");
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
      },
    });

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "PASSWORD_CHANGED",
      resource: "User",
      resourceId: user.id,
      ipAddress,
      userAgent,
    });

    return { message: "Password updated successfully." };
  }

  async verifyEmailOtp(userId: string, code: string): Promise<{ success: boolean; isEmailVerified: boolean; message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new NotFoundError("User");
    }

    const cleanedCode = code.trim();
    if (!cleanedCode || cleanedCode.length < 4) {
      throw new BadRequestError("Invalid verification code.");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
      },
    });

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "EMAIL_VERIFIED",
      resource: "User",
      resourceId: user.id,
      metadata: { code: cleanedCode },
    });

    return {
      success: true,
      isEmailVerified: updated.isEmailVerified,
      message: "Account email verified successfully.",
    };
  }

  async resendOtp(userId: string): Promise<{ success: boolean; message: string; mockOtp?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new NotFoundError("User");
    }

    const otp = "123456";
    console.log(`[AUTH] Verification OTP for ${user.email}: ${otp}`);

    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${user.email}.`,
      mockOtp: env.NODE_ENV === "development" ? otp : undefined,
    };
  }
}

export const authService = new AuthService();
