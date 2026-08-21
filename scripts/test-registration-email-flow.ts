import { prisma } from "../src/infrastructure/database/prisma.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { clientService } from "../src/modules/clients/clients.service.js";
import { MockEmailProvider, emailService } from "../src/infrastructure/email/index.js";
import crypto from "crypto";

async function runRegistrationEmailFlowTest() {
  console.log("==================================================");
  console.log("STARTING SWIFT DOC REGISTRATION & EMAIL LIFECYCLE TEST");
  console.log("==================================================");

  const mockEmailService = emailService as MockEmailProvider;
  mockEmailService.sentEmails = []; // Reset email log

  const testEmail = `verify_test_${Date.now()}@swiftdoc.test`;
  const testName = "Registration Test User";
  const testPhone = "07" + Math.floor(10000000 + Math.random() * 90000000).toString();

  // ----------------------------------------------------
  // STEP 1: REGISTER ACCOUNT
  // ----------------------------------------------------
  console.log("\n[TEST 1] Registering new account identity...");
  const regResult = await authService.register({
    fullName: testName,
    email: testEmail,
    phone: testPhone,
    password: "Password123!",
  });

  await new Promise((r) => setTimeout(r, 300));

  const userId = regResult.user.id;
  const clientId = regResult.client.id;

  // Query DB state
  const userStep1 = await prisma.user.findUnique({ where: { id: userId } });
  console.log(` -> User Created ID: ${userId}`);
  console.log(` -> DB isEmailVerified: ${userStep1?.isEmailVerified}`);
  console.log(` -> DB onboardingCompleted: ${userStep1?.onboardingCompleted}`);
  console.log(` -> DB otpHash Present: ${!!userStep1?.otpHash}`);
  console.log(` -> DB otpExpiresAt: ${userStep1?.otpExpiresAt?.toISOString()}`);
  console.log(` -> DB otpResendAfter: ${userStep1?.otpResendAfter?.toISOString()}`);

  if (userStep1?.isEmailVerified !== false) {
    throw new Error("FAIL: User should have isEmailVerified = false on registration!");
  }
  if (userStep1?.onboardingCompleted !== false) {
    throw new Error("FAIL: User should have onboardingCompleted = false on registration!");
  }

  // Verify Sent Emails
  console.log(` -> Total Emails Sent: ${mockEmailService.sentEmails.length}`);
  const verificationEmail = mockEmailService.sentEmails.find((e) =>
    e.subject.includes("Verify your Swift Doc account")
  );
  const prematureWelcomeEmail = mockEmailService.sentEmails.find((e) =>
    e.subject.includes("Welcome")
  );

  if (!verificationEmail) {
    throw new Error("FAIL: Verification email was NOT dispatched!");
  }
  if (prematureWelcomeEmail) {
    throw new Error("FAIL: Welcome email was prematurely sent during initial registration!");
  }
  console.log(" ✅ TEST 1 PASSED: Unverified account created, OTP email sent, NO welcome email dispatched.");

  // Extract raw OTP from email HTML using regex
  const otpMatch = verificationEmail.html.match(/(\d{6})/);
  if (!otpMatch || !otpMatch[1]) {
    throw new Error("FAIL: Could not extract 6-digit OTP from verification email HTML!");
  }
  const rawOtp = otpMatch[1];
  console.log(` -> Extracted Real OTP from Email: ${rawOtp}`);

  // ----------------------------------------------------
  // STEP 2: INVALID OTP SUBMISSION
  // ----------------------------------------------------
  console.log("\n[TEST 2] Submitting invalid OTP ('000000')...");
  try {
    await authService.verifyEmailOtp(userId, "000000");
    throw new Error("FAIL: Invalid OTP should have been rejected!");
  } catch (err: any) {
    console.log(` -> Expected Rejection Message: "${err.message}"`);
    const userFailed = await prisma.user.findUnique({ where: { id: userId } });
    console.log(` -> DB otpAttempts: ${userFailed?.otpAttempts}`);
    if (userFailed?.otpAttempts !== 1) {
      throw new Error("FAIL: otpAttempts counter was not incremented!");
    }
  }
  console.log(" ✅ TEST 2 PASSED: Invalid OTP rejected and attempts counter updated.");

  // ----------------------------------------------------
  // STEP 3: RESEND COOLDOWN ENFORCEMENT
  // ----------------------------------------------------
  console.log("\n[TEST 3] Testing OTP resend 60s cooldown limit...");
  try {
    await authService.resendOtp(userId);
    throw new Error("FAIL: Resend OTP should be blocked by 60s cooldown!");
  } catch (err: any) {
    console.log(` -> Expected Cooldown Error: "${err.message}"`);
  }
  console.log(" ✅ TEST 3 PASSED: Resend cooldown enforced.");

  // ----------------------------------------------------
  // STEP 4: SUBMIT CORRECT OTP
  // ----------------------------------------------------
  console.log("\n[TEST 4] Submitting correct OTP...");
  const verifyRes = await authService.verifyEmailOtp(userId, rawOtp);
  console.log(` -> Verify Response Message: "${verifyRes.message}"`);

  const userStep4 = await prisma.user.findUnique({ where: { id: userId } });
  console.log(` -> DB isEmailVerified: ${userStep4?.isEmailVerified}`);
  console.log(` -> DB emailVerifiedAt: ${userStep4?.emailVerifiedAt?.toISOString()}`);
  console.log(` -> DB otpHash: ${userStep4?.otpHash}`);
  console.log(` -> DB onboardingCompleted: ${userStep4?.onboardingCompleted}`);

  if (userStep4?.isEmailVerified !== true) {
    throw new Error("FAIL: isEmailVerified was not set to true!");
  }
  if (!userStep4?.emailVerifiedAt) {
    throw new Error("FAIL: emailVerifiedAt timestamp missing!");
  }
  if (userStep4?.otpHash !== null) {
    throw new Error("FAIL: otpHash was not invalidated after successful verification!");
  }

  // Check email log (Welcome email still should NOT be sent!)
  const welcomeAfterOtp = mockEmailService.sentEmails.find((e) => e.subject.includes("Welcome"));
  if (welcomeAfterOtp) {
    throw new Error("FAIL: Welcome email was sent after OTP verification before profile setup!");
  }
  console.log(" ✅ TEST 4 PASSED: Email verified, OTP invalidated, NO welcome email sent yet.");

  // ----------------------------------------------------
  // STEP 5: COMPLETE CLIENT PROFILE ONBOARDING
  // ----------------------------------------------------
  console.log("\n[TEST 5] Submitting Client Profile onboarding data...");
  await clientService.updateClientProfile(clientId, {
    kraPin: "A019988776Z",
    nationalId: "33445566",
    county: "Nairobi",
    city: "Nairobi",
    address: "Westlands, Nairobi",
  });

  await new Promise((r) => setTimeout(r, 300));

  const userStep5 = await prisma.user.findUnique({ where: { id: userId } });
  console.log(` -> DB onboardingCompleted: ${userStep5?.onboardingCompleted}`);
  console.log(` -> DB onboardingCompletedAt: ${userStep5?.onboardingCompletedAt?.toISOString()}`);

  if (userStep5?.onboardingCompleted !== true) {
    throw new Error("FAIL: onboardingCompleted was not set to true!");
  }

  // Check for Welcome Email NOW!
  const finalWelcomeEmail = mockEmailService.sentEmails.find((e) =>
    e.subject.includes("Welcome to Swift Doc")
  );

  if (!finalWelcomeEmail) {
    throw new Error("FAIL: Welcome email was NOT sent after profile onboarding completion!");
  }

  console.log(` -> Final Welcome Email Subject: "${finalWelcomeEmail.subject}"`);
  console.log(" ✅ TEST 5 PASSED: Welcome Email dispatched ONLY after profile onboarding completion!");

  console.log("\n==================================================");
  console.log("ALL REGISTRATION & EMAIL LIFECYCLE TESTS PASSED! 🎉");
  console.log("==================================================");

  // Cleanup test user
  await prisma.user.delete({ where: { id: userId } });
}

runRegistrationEmailFlowTest()
  .catch((err) => {
    console.error("\n❌ TEST FAILED WITH ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
