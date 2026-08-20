import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { jobQueueService } from "./infrastructure/jobs/job-queue.service.js";

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Swift Doc Backend running at http://localhost:${env.PORT}`);
  console.log(`📡 API Prefix: ${env.API_PREFIX}`);
  console.log(`🌍 Environment: ${env.NODE_ENV}`);

  // Start background job queue runner & SLA sweeps
  jobQueueService.start(60000);
  console.log(`⏱️ Background SLA & Job Queue worker started.`);
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

  // Force close after 10s if graceful fails
  setTimeout(() => {
    console.error("⚠️ Forceful shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
