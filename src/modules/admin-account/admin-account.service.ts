import bcrypt from "bcryptjs";
import { prisma } from "../../infrastructure/database/prisma.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { emailService } from "../../infrastructure/email/index.js";
import { UserRole } from "@prisma/client";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ConflictError,
} from "../../common/errors/app-error.js";
import {
  UpdateAdminProfileInput,
  UploadProfileImageInput,
  UpdateNotificationPreferencesInput,
} from "./admin-account.schema.js";

export interface RequestInfo {
  ipAddress?: string;
  userAgent?: string;
}

export class AdminAccountService {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        notificationPreference: true,
      },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user profile not found");
    }

    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, input: UpdateAdminProfileInput, reqInfo: RequestInfo) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user not found");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName !== undefined ? input.firstName : user.firstName,
        lastName: input.lastName !== undefined ? input.lastName : user.lastName,
        phone: input.phone !== undefined ? input.phone : user.phone,
        jobTitle: input.jobTitle !== undefined ? input.jobTitle : user.jobTitle,
        department: input.department !== undefined ? input.department : user.department,
      },
      include: {
        organization: true,
        notificationPreference: true,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_PROFILE_UPDATED",
        resource: "AdminAccount",
        resourceId: user.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
        metadata: { updatedFields: Object.keys(input) },
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  async uploadProfileImage(userId: string, input: UploadProfileImageInput, reqInfo: RequestInfo) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user not found");
    }

    // Process base64 buffer
    const base64Clean = input.base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const buffer = Buffer.from(base64Clean, "base64");

    // Validate size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new BadRequestError("Profile image must be less than 5MB in size");
    }

    // Normalize mimeType
    let mimeType = input.mimeType.toLowerCase();
    if (mimeType === "image/jpg" || mimeType === "image/pjpeg") {
      mimeType = "image/jpeg";
    }

    // Upload using storage service abstraction
    const uploadResult = await storageService.upload({
      buffer,
      fileName: input.fileName,
      mimeType,
      folder: "avatars",
    });

    // Update user avatarUrl in database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: uploadResult.secureUrl,
      },
      include: {
        organization: true,
        notificationPreference: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_PROFILE_IMAGE_UPLOADED",
        resource: "AdminAccount",
        resourceId: user.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
        metadata: { secureUrl: uploadResult.secureUrl, fileSize: buffer.length },
      },
    });

    return {
      user: this.sanitizeUser(updatedUser),
      avatarUrl: uploadResult.secureUrl,
    };
  }

  async deleteProfileImage(userId: string, reqInfo: RequestInfo) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user not found");
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: null,
      },
      include: {
        organization: true,
        notificationPreference: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_PROFILE_IMAGE_REMOVED",
        resource: "AdminAccount",
        resourceId: user.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
      },
    });

    return this.sanitizeUser(updatedUser);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    reqInfo: RequestInfo
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user not found");
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Current password entered is incorrect");
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password hash in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_PASSWORD_CHANGED",
        resource: "AdminAccount",
        resourceId: user.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
      },
    });

    // Send security notification email
    const name = user.firstName ? `${user.firstName} ${user.lastName || ""}` : "Operations Admin";
    await emailService.sendAdminPasswordChangedEmail(user.email, name);

    return { message: "Password updated successfully" };
  }

  async requestEmailChange(
    userId: string,
    currentPassword: string,
    newEmail: string,
    reqInfo: RequestInfo
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user not found");
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Current password entered is incorrect");
    }

    if (newEmail === user.email) {
      throw new BadRequestError("New email address cannot be the same as your current email");
    }

    // Check if new email is already taken by another user
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new ConflictError("An account with this email address already exists");
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: newEmail,
        pendingEmailOtpHash: otpHash,
        pendingEmailOtpExpiresAt: expiresAt,
        pendingEmailOtpAttempts: 0,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_EMAIL_CHANGE_REQUESTED",
        resource: "AdminAccount",
        resourceId: user.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
        metadata: { requestedEmail: newEmail },
      },
    });

    // Send OTP to new email address
    const name = user.firstName ? `${user.firstName} ${user.lastName || ""}` : "Operations Admin";
    await emailService.sendEmailChangeOtpEmail(newEmail, name, newEmail, otp, 10);

    return {
      message: `Verification code sent to ${newEmail}. Please enter the code to confirm email update.`,
      pendingEmail: newEmail,
      expiresAt,
    };
  }

  async verifyEmailChange(userId: string, code: string, reqInfo: RequestInfo) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new NotFoundError("Admin user not found");
    }

    if (
      !user.pendingEmail ||
      !user.pendingEmailOtpHash ||
      !user.pendingEmailOtpExpiresAt
    ) {
      throw new BadRequestError("No pending email change request found. Please request an email change first.");
    }

    if (new Date() > user.pendingEmailOtpExpiresAt) {
      throw new BadRequestError("Verification code has expired. Please request a new email change code.");
    }

    if (user.pendingEmailOtpAttempts >= 5) {
      throw new BadRequestError("Maximum verification attempts exceeded. Please request a new email change.");
    }

    const isMatch = await bcrypt.compare(code, user.pendingEmailOtpHash);
    if (!isMatch) {
      await prisma.user.update({
        where: { id: userId },
        data: { pendingEmailOtpAttempts: { increment: 1 } },
      });
      throw new BadRequestError("Invalid verification code. Please check and try again.");
    }

    const oldEmail = user.email;
    const newEmail = user.pendingEmail;

    // Confirm email update
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
        isEmailVerified: true,
        pendingEmail: null,
        pendingEmailOtpHash: null,
        pendingEmailOtpExpiresAt: null,
        pendingEmailOtpAttempts: 0,
      },
      include: {
        organization: true,
        notificationPreference: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: newEmail,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_EMAIL_CHANGE_VERIFIED",
        resource: "AdminAccount",
        resourceId: user.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
        metadata: { oldEmail, newEmail },
      },
    });

    return {
      message: "Email address updated successfully",
      user: this.sanitizeUser(updatedUser),
    };
  }

  async getNotificationPreferences(userId: string) {
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: {
          userId,
          emailEnabled: true,
          smsEnabled: true,
          inAppEnabled: true,
          emailOperationalAlerts: true,
          emailClientRegistrations: true,
          emailApplicationAlerts: true,
          emailPaymentNotifications: true,
          emailClientActions: true,
          emailSlaAlerts: true,
          emailSecurityNotifications: true,
          inAppOperationalAlerts: true,
          inAppAssignments: true,
          inAppClientActions: true,
          inAppSlaAlerts: true,
        },
      });
    }

    return prefs;
  }

  async updateNotificationPreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
    reqInfo: RequestInfo
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...input,
      },
      update: {
        ...input,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: UserRole.ADMIN,
        action: "ADMIN_NOTIFICATION_PREFERENCES_UPDATED",
        resource: "NotificationPreference",
        resourceId: prefs.id,
        ipAddress: reqInfo.ipAddress,
        userAgent: reqInfo.userAgent,
        metadata: input as any,
      },
    });

    return prefs;
  }

  private sanitizeUser(user: any) {
    const {
      passwordHash,
      otpHash,
      pendingEmailOtpHash,
      pendingEmailOtpExpiresAt,
      ...safeUser
    } = user;

    const fullName = safeUser.firstName && safeUser.lastName
      ? `${safeUser.firstName} ${safeUser.lastName}`
      : safeUser.firstName || safeUser.lastName || "Operations Admin";

    return {
      ...safeUser,
      fullName,
    };
  }
}

export const adminAccountService = new AdminAccountService();
