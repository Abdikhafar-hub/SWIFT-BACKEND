import { Router, Request, Response } from "express";
import { prisma } from "../../infrastructure/database/prisma.js";
import { env } from "../../config/env.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get("/live", (req: Request, res: Response) => {
  res.status(200).json({ status: "alive" });
});

router.get("/ready", async (req: Request, res: Response) => {
  try {
    // Test PostgreSQL database connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ready",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: "not_ready",
      database: "disconnected",
      error: error.message,
    });
  }
});

export const healthRoutes = router;
