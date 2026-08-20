import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { prisma } from "../../infrastructure/database/prisma.js";
import { UnauthorizedError, ForbiddenError } from "../errors/app-error.js";
import { AuthenticatedRequest, AuthenticatedUser } from "../types/index.js";
import { UserRole } from "@prisma/client";

interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string;
  sessionId?: string;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Bearer authorization token is missing or malformed");
    }

    const token = authHeader.split(" ")[1];
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "swiftdoc.co.ke",
        audience: "swiftdoc-app",
      }) as JwtPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired authorization token");
    }

    // Verify user exists and is active in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        clientProfile: {
          select: { id: true },
        },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedError("User account is inactive or no longer exists");
    }

    // Require valid sessionId claim in access token payload
    if (!payload.sessionId) {
      throw new UnauthorizedError("Authorization token is missing session context");
    }

    // Verify server session state and expiration limits
    const activeSession = await prisma.refreshToken.findFirst({
      where: {
        sessionId: payload.sessionId,
        userId: user.id,
        isRevoked: false,
      },
    });

    if (!activeSession) {
      throw new UnauthorizedError("Session has been revoked or signed out");
    }

    const now = Date.now();

    // Check 12-hour absolute session expiration limit
    if (activeSession.absoluteExpiresAt && now > activeSession.absoluteExpiresAt.getTime()) {
      await prisma.refreshToken.updateMany({
        where: { sessionId: payload.sessionId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedError("Session absolute lifetime expired. Please sign in again.");
    }

    // Check 5-minute idle timeout (300,000 ms)
    const idleTimeoutMs = 5 * 60 * 1000;
    const lastActivity = activeSession.lastActivityAt ? activeSession.lastActivityAt.getTime() : activeSession.createdAt.getTime();

    if (now - lastActivity > idleTimeoutMs) {
      // Mark session revoked on server
      await prisma.refreshToken.updateMany({
        where: { sessionId: payload.sessionId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedError("Session expired due to 5-minute inactivity");
    }

    // Throttled DB write: Update lastActivityAt at most once every 60 seconds
    if (now - lastActivity > 60 * 1000) {
      void prisma.refreshToken.updateMany({
        where: { sessionId: payload.sessionId, isRevoked: false },
        data: { lastActivityAt: new Date() },
      });
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      clientId: user.clientProfile?.id || null,
    };

    req.user = authenticatedUser;
    next();
  } catch (error) {
    next(error);
  }
}

// Alias for authenticateToken
export const authenticateToken = authenticate;

export function requireRole(...allowedRoles: (UserRole | UserRole[])[]) {
  const flattenedRoles: UserRole[] = allowedRoles.flat();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    if (!flattenedRoles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `Access restricted to roles: [${flattenedRoles.join(", ")}]. Current role: '${req.user.role}'`
        )
      );
      return;
    }

    next();
  };
}

export function requireClientAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(new UnauthorizedError("Authentication required"));
    return;
  }

  if (req.user.role !== UserRole.CLIENT) {
    next(new ForbiddenError("Access restricted to CLIENT accounts"));
    return;
  }

  if (!req.user.clientId) {
    next(new ForbiddenError("Client profile is missing for this account"));
    return;
  }

  next();
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { clientProfile: { select: { id: true } } },
    });

    if (user && user.isActive && !user.deletedAt) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        clientId: user.clientProfile?.id || null,
      };
    }
  } catch {
    // Ignore invalid tokens in optionalAuth
  }

  next();
}
