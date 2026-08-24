import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { jobQueueService } from "./infrastructure/jobs/job-queue.service.js";

const port = Number(env.PORT) || 5000;

function listen() {
  const server = app.listen(port, () => {
    console.log(`🚀 Swift Doc Backend running at http://localhost:${port}`);
    console.log(`📡 API Prefix: ${env.API_PREFIX}`);
    console.log(`🌍 Environment: ${env.NODE_ENV}`);

    // Start background job queue runner & SLA sweeps
    jobQueueService.start(60000);
    console.log(`⏱️ Background SLA & Job Queue worker started.`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️ Port ${port} is currently busy. Retrying in 1.5s...`);
      setTimeout(() => {
        server.close();
        listen();
      }, 1500);
    } else {
      console.error("❌ HTTP Server Error:", err);
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    jobQueueService.stop();

    server.close(async () => {
      console.log("🔒 HTTP server closed.");
      try {
        await prisma.$disconnect();
        console.log("🔌 Database connections closed.");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error during database disconnect:", err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error("⚠️ Forceful shutdown after timeout.");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGUSR2", () => {
    jobQueueService.stop();
    server.close(() => {
      process.kill(process.pid, "SIGUSR2");
    });
  });

  return server;
}

listen();
