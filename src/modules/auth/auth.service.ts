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

  private generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    organizationId: string,
    sessionId: string
  ): AuthTokens {
    const accessToken = jwt.sign(
      { userId, email, role, organizationId, sessionId },
      env.JWT_SECRET,
      {
        expiresIn: (env.JWT_EXPIRES_IN || "15m") as jwt.SignOptions["expiresIn"],
        issuer: "swiftdoc.co.ke",
        audience: "swiftdoc-app",
      }
    );

    const refreshToken = crypto.randomBytes(40).toString("hex");

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_EXPIRES_IN || "15m",
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

    // 5. Generate 6-digit Email Verification OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = this.hashToken(rawOtp);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const otpResendAfter = new Date(Date.now() + 60 * 1000); // 60 seconds cooldown

    // 6. Atomic Transaction: Create User + Client Profile + Audit Log
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
          otpHash,
          otpExpiresAt,
          otpAttempts: 0,
          otpResendAfter,
          onboardingCompleted: false,
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

    // 7. Generate Tokens & Store Session Refresh Token
    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const tokens = this.generateTokens(
      result.user.id,
      result.user.email,
      result.user.role,
      organization.id,
      sessionId
    );
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const absoluteExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours absolute limit

    await prisma.refreshToken.create({
      data: {
        userId: result.user.id,
        sessionId,
        familyId,
        tokenHash: this.hashToken(tokens.refreshToken),
        deviceInfo: userAgent,
        ipAddress,
        expiresAt,
        absoluteExpiresAt,
        lastActivityAt: new Date(),
      },
    });

    // 8. Send Verification OTP Email & Admin Notification (Async background)
    // NOTE: Welcome Email MUST NOT be sent here! It is sent ONLY after email verification and client onboarding.
    void emailService.sendEmailVerificationEmail(result.user.email, result.client.fullName, rawOtp);
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

    const actorName = user?.clientProfile?.fullName || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email || normalizedEmail);

    if (!user || user.deletedAt || !user.isActive) {
      if (user) {
        await createAuditLog({
          organizationId: user.organizationId,
          actorId: user.id,
          actorName,
          actorEmail: user.email,
          actorRole: user.role,
          action: "USER_LOGIN_FAILED",
          actionCategory: "AUTH",
          description: `Failed login attempt for inactive or deleted user (${normalizedEmail})`,
          entityType: "User",
          entityId: user.id,
          entityReference: normalizedEmail,
          status: "FAILURE",
          ipAddress,
          userAgent,
        });
      }
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await createAuditLog({
        organizationId: user.organizationId,
        actorId: user.id,
        actorName,
        actorEmail: user.email,
        actorRole: user.role,
        action: "USER_LOGIN_LOCKED",
        actionCategory: "AUTH",
        description: `Blocked login attempt for locked account (${user.email})`,
        entityType: "User",
        entityId: user.id,
        entityReference: user.email,
        status: "WARNING",
        ipAddress,
        userAgent,
      });
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

      await createAuditLog({
        organizationId: user.organizationId,
        actorId: user.id,
        actorName,
        actorEmail: user.email,
        actorRole: user.role,
        action: "USER_LOGIN_FAILED",
        actionCategory: "AUTH",
        description: `Failed login password verification for ${user.email} (Attempt ${failedAttempts})`,
        entityType: "User",
        entityId: user.id,
        entityReference: user.email,
        status: "FAILURE",
        ipAddress,
        userAgent,
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

    const sessionId = crypto.randomUUID();
    const familyId = crypto.randomUUID();
    const tokens = this.generateTokens(user.id, user.email, user.role, user.organizationId, sessionId);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const absoluteExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId,
        familyId,
        tokenHash: this.hashToken(tokens.refreshToken),
        deviceInfo: userAgent,
        ipAddress,
        expiresAt,
        absoluteExpiresAt,
        lastActivityAt: new Date(),
      },
    });

    await createAuditLog({
      organizationId: user.organizationId,
      actorId: user.id,
      actorName,
      actorEmail: user.email,
      actorRole: user.role,
      action: "USER_LOGIN",
      actionCategory: "AUTH",
      description: `${user.role === UserRole.ADMIN ? "Admin" : "Client"} ${actorName} (${user.email}) successfully logged into the Swift Doc platform.`,
      entityType: "User",
      entityId: user.id,
      entityReference: user.email,
      status: "SUCCESS",
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

    if (!tokenRecord) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Refresh Token Reuse Detection
    if (tokenRecord.isRevoked) {
      if (tokenRecord.familyId) {
        await prisma.refreshToken.updateMany({
          where: { familyId: tokenRecord.familyId },
          data: { isRevoked: true, revokedAt: new Date() },
        });
      }
      await createAuditLog({
        organizationId: tokenRecord.user.organizationId,
        actorId: tokenRecord.userId,
        actorEmail: tokenRecord.user.email,
        actorRole: tokenRecord.user.role,
        action: "REFRESH_TOKEN_REUSE_DETECTED",
        resource: "RefreshToken",
        resourceId: tokenRecord.id,
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedError("Suspicious refresh token reuse detected. All sessions revoked.");
    }

    // Expiration Checks (Refresh Token & Absolute Lifetime)
    if (
      tokenRecord.expiresAt < new Date() ||
      (tokenRecord.absoluteExpiresAt && tokenRecord.absoluteExpiresAt < new Date())
    ) {
      await prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedError("Session has expired. Please sign in again.");
    }

    // 5-Minute Inactivity Timeout Check on Refresh
    const idleTimeoutMs = 5 * 60 * 1000;
    if (tokenRecord.lastActivityAt && Date.now() - tokenRecord.lastActivityAt.getTime() > idleTimeoutMs) {
      await prisma.refreshToken.updateMany({
        where: { sessionId: tokenRecord.sessionId || undefined, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      await createAuditLog({
        organizationId: tokenRecord.user.organizationId,
        actorId: tokenRecord.userId,
        actorEmail: tokenRecord.user.email,
        actorRole: tokenRecord.user.role,
        action: "SESSION_EXPIRED_IDLE",
        resource: "User",
        resourceId: tokenRecord.userId,
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedError("Session expired due to inactivity. Please sign in again.");
    }

    const { user } = tokenRecord;
    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedError("User account is inactive");
    }

    const sessionId = tokenRecord.sessionId || crypto.randomUUID();
    const familyId = tokenRecord.familyId || crypto.randomUUID();
    const absoluteExpiresAt = tokenRecord.absoluteExpiresAt || new Date(Date.now() + 12 * 60 * 60 * 1000);

    // Revoke old refresh token (Rotation)
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    // Issue new rotated token pair
    const tokens = this.generateTokens(user.id, user.email, user.role, user.organizationId, sessionId);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        sessionId,
        familyId,
        tokenHash: this.hashToken(tokens.refreshToken),
        deviceInfo: userAgent,
        ipAddress,
        expiresAt,
        absoluteExpiresAt,
        lastActivityAt: new Date(),
      },
    });

    return { tokens };
  }

  async logout(rawRefreshToken?: string, userId?: string, sessionId?: string) {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      const token = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (token?.sessionId) {
        await prisma.refreshToken.updateMany({
          where: { sessionId: token.sessionId, isRevoked: false },
          data: { isRevoked: true, revokedAt: new Date() },
        });
      } else {
        await prisma.refreshToken.updateMany({
          where: { tokenHash, isRevoked: false },
          data: { isRevoked: true, revokedAt: new Date() },
        });
      }
    } else if (sessionId) {
      await prisma.refreshToken.updateMany({
        where: { sessionId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    } else if (userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
    }

    return { success: true };
  }

  async logoutAll(userId: string, ipAddress?: string, userAgent?: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await createAuditLog({
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "USER_LOGOUT_ALL",
        resource: "User",
        resourceId: user.id,
        ipAddress,
        userAgent,
      });
    }

    return { success: true, message: "Logged out from all active devices." };
  }

  async pingSession(userId: string, sessionId?: string) {
    const whereCondition = sessionId
      ? { sessionId, userId, isRevoked: false }
      : { userId, isRevoked: false };

    const activeSession = await prisma.refreshToken.findFirst({
      where: whereCondition,
    });

    if (!activeSession) {
      throw new UnauthorizedError("Active session not found or has been revoked.");
    }

    const idleTimeoutMs = 5 * 60 * 1000;
    const now = Date.now();
    const lastActivity = activeSession.lastActivityAt
      ? activeSession.lastActivityAt.getTime()
      : activeSession.createdAt.getTime();

    if (now - lastActivity > idleTimeoutMs) {
      await prisma.refreshToken.updateMany({
        where: { sessionId: activeSession.sessionId!, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedError("Session expired due to 5-minute inactivity.");
    }

    await prisma.refreshToken.updateMany({
      where: { sessionId: activeSession.sessionId!, isRevoked: false },
      data: { lastActivityAt: new Date() },
    });

    return { success: true, message: "Session activity renewed successfully." };
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

    const fullName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.lastName || user.clientProfile?.fullName || "Operations Admin";

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      jobTitle: user.jobTitle,
      department: user.department,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
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

    const resetLink = `${env.APP_URL}/reset-password?token=${resetToken}`;
    const clientName = user.clientProfile?.fullName || "Valued Client";

    void emailService.sendPasswordResetEmail(user.email, clientName, resetLink, 60);

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

    if (user.isEmailVerified) {
      return {
        success: true,
        isEmailVerified: true,
        message: "Account email is already verified.",
      };
    }

    const cleanedCode = code.trim();
    if (!cleanedCode || cleanedCode.length !== 6 || !/^\d{6}$/.test(cleanedCode)) {
      throw new BadRequestError("Please enter a valid 6-digit verification code.");
    }

    // Check OTP Expiration
    if (!user.otpHash || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new BadRequestError("Verification code has expired. Please request a new code.");
    }

    // Check Maximum Attempt Limit (5 max)
    if (user.otpAttempts >= 5) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
      });
      throw new BadRequestError("Too many failed attempts. Please request a new verification code.");
    }

    // Cryptographic Hash Comparison
    const submittedHash = this.hashToken(cleanedCode);
    if (submittedHash !== user.otpHash) {
      const nextAttempts = user.otpAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { otpAttempts: nextAttempts },
      });
      const remainingAttempts = 5 - nextAttempts;
      throw new BadRequestError(
        `Incorrect verification code. ${remainingAttempts > 0 ? `${remainingAttempts} attempt(s) remaining.` : "Please request a new code."}`
      );
    }

    // Verification Success: Transition state & clear OTP metadata
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpResendAfter: null,
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
    });

    const clientProfile = await prisma.client.findFirst({ where: { userId: user.id } });
    if (clientProfile) {
      void emailService.sendWelcomeEmail(user.email, clientProfile.fullName, clientProfile.clientNumber);
    }

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

    if (user.isEmailVerified) {
      return {
        success: true,
        message: "Email is already verified.",
      };
    }

    // Enforce 60-Second Cooldown Limit
    if (user.otpResendAfter && user.otpResendAfter > new Date()) {
      const remainingSecs = Math.ceil((user.otpResendAfter.getTime() - Date.now()) / 1000);
      throw new BadRequestError(`Please wait ${remainingSecs} second(s) before requesting another verification code.`);
    }

    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = this.hashToken(rawOtp);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const otpResendAfter = new Date(Date.now() + 60 * 1000); // 60 seconds

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        otpResendAfter,
      },
    });

    const clientName = user.clientProfile?.fullName || "Valued Client";
    void emailService.sendEmailVerificationEmail(user.email, clientName, rawOtp);

    return {
      success: true,
      message: `A new 6-digit verification code has been sent to ${user.email}.`,
      mockOtp: env.NODE_ENV === "development" ? rawOtp : undefined,
    };
  }
}

export const authService = new AuthService();
