import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error.js";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // 1. Custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || undefined,
      },
    });
    return;
  }

  // 2. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta?.target.join(", ") : "resource";
      res.status(409).json({
        success: false,
        error: {
          code: "DUPLICATE_RESOURCE",
          message: `A unique constraint violation occurred on field: ${target}`,
          details: err.meta,
        },
      });
      return;
    }

    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "The requested database record was not found.",
        },
      });
      return;
    }

    if (err.code === "P2003") {
      res.status(400).json({
        success: false,
        error: {
          code: "FOREIGN_KEY_VIOLATION",
          message: "A related reference does not exist in the database.",
          details: err.meta,
        },
      });
      return;
    }
  }

  // 3. Prisma Validation Error
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: "DATABASE_VALIDATION_ERROR",
        message: "Invalid database query parameters.",
      },
    });
    return;
  }

  // 4. Unhandled Internal Server Errors
  console.error("💥 Unhandled Error:", err);

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: env.NODE_ENV === "production" ? "An internal server error occurred" : err.message,
      ...(env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    },
  });
}
