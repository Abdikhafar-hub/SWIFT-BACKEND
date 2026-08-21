import puppeteer from "puppeteer-core";
import { prisma } from "../src/infrastructure/database/prisma.js";

async function typeIntoReactInput(page: any, selector: string, value: string) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 20 });
}

async function auditRegistrationInBrowser() {
  console.log("==================================================");
  console.log("STARTING SWIFT DOC REAL BROWSER REGISTRATION AUDIT");
  console.log("==================================================");

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1440,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const testEmail = `browser_client_${Date.now()}@swiftdoc.test`;
  const testFirstName = "Audited";
  const testLastName = "User";

  try {
    // ----------------------------------------------------
    // STEP 1: LOAD REGISTER PAGE & SUBMIT IDENTITY
    // ----------------------------------------------------
    console.log("\n[BROWSER 1] Navigating to http://localhost:3000/register...");
    await page.goto("http://localhost:3000/register", { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1000));

    const inputList = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      return inputs.map((i) => ({ name: i.name, id: i.id, placeholder: i.placeholder, type: i.type }));
    });
    console.log(" -> Found Inputs on Page:", JSON.stringify(inputList, null, 2));

    console.log(" -> Filling Account Identity details...");
    await typeIntoReactInput(page, 'input[name="firstName"]', testFirstName);
    await typeIntoReactInput(page, 'input[name="lastName"]', testLastName);
    await typeIntoReactInput(page, 'input[name="email"]', testEmail);
    await typeIntoReactInput(page, 'input[name="phone"]', "0712345678");
    await typeIntoReactInput(page, 'input[name="password"]', "Password123!");
    await typeIntoReactInput(page, 'input[name="confirmPassword"]', "Password123!");

    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_01_filled.png" });

    // Click submit
    console.log(" -> Clicking submit button...");
    await page.click('button[type="submit"]');

    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_01_after_submit_click.png" });

    // ----------------------------------------------------
    // STEP 2: VERIFY STEP 2 OTP PAGE
    // ----------------------------------------------------
    console.log("\n[BROWSER 2] Waiting for Step 2 (OTP Verification)...");
    await page.waitForSelector('input[name="code"]', { timeout: 15000 });
    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_02_otp_page.png" });

    // Fetch user from DB to verify initial state & retrieve raw OTP hash candidate or raw OTP
    const userInDb = await prisma.user.findUnique({ where: { email: testEmail } });
    if (!userInDb) throw new Error("User not created in PostgreSQL!");

    console.log(` -> DB User ID: ${userInDb.id}`);
    console.log(` -> DB isEmailVerified: ${userInDb.isEmailVerified}`);
    console.log(` -> DB onboardingCompleted: ${userInDb.onboardingCompleted}`);

    if (userInDb.isEmailVerified || userInDb.onboardingCompleted) {
      throw new Error("FAIL: User should not be verified or onboarded yet!");
    }

    // ----------------------------------------------------
    // STEP 3: TEST INVALID OTP REJECTION IN BROWSER
    // ----------------------------------------------------
    console.log("\n[BROWSER 3] Testing Invalid OTP Submission ('999999')...");
    await typeIntoReactInput(page, 'input[name="code"]', "999999");
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_03_invalid_otp_err.png" });

    const dbUserAfterInvalid = await prisma.user.findUnique({ where: { email: testEmail } });
    console.log(` -> DB otpAttempts: ${dbUserAfterInvalid?.otpAttempts}`);
    if (dbUserAfterInvalid?.otpAttempts !== 1) {
      throw new Error("FAIL: otpAttempts was not incremented in DB!");
    }

    // ----------------------------------------------------
    // STEP 4: TRIGGER NEW OTP & GET VALID OTP
    // ----------------------------------------------------
    console.log("\n[BROWSER 4] Resending OTP to get fresh code...");

    // Clear cooldown in DB to allow immediate resend for test
    await prisma.user.update({
      where: { id: userInDb.id },
      data: { otpResendAfter: new Date(Date.now() - 1000) },
    });

    // We can compute the matching 6-digit code for the user's otpHash in DB
    const crypto = await import("crypto");
    const freshDbUser = await prisma.user.findUnique({ where: { email: testEmail } });
    let matchingOtp = "";
    for (let i = 100000; i <= 999999; i++) {
      const candidate = i.toString();
      const hash = crypto.createHash("sha256").update(candidate).digest("hex");
      if (hash === freshDbUser?.otpHash) {
        matchingOtp = candidate;
        break;
      }
    }

    console.log(` -> Computed Matching 6-Digit OTP: ${matchingOtp}`);
    if (!matchingOtp) throw new Error("Could not find matching OTP for DB hash!");

    // Enter valid OTP
    console.log(" -> Typing valid OTP in browser...");
    await typeIntoReactInput(page, 'input[name="code"]', matchingOtp);
    await page.click('button[type="submit"]');

    // ----------------------------------------------------
    // STEP 5: VERIFY STEP 3 PROFILE ONBOARDING PAGE
    // ----------------------------------------------------
    console.log("\n[BROWSER 5] Waiting for Step 3 (Client Profile Setup)...");
    await page.waitForSelector('input[name="kraPin"]', { timeout: 10000 });
    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_04_profile_onboarding.png" });

    const userVerifiedInDb = await prisma.user.findUnique({ where: { email: testEmail } });
    console.log(` -> DB isEmailVerified: ${userVerifiedInDb?.isEmailVerified}`);
    console.log(` -> DB onboardingCompleted: ${userVerifiedInDb?.onboardingCompleted}`);

    if (!userVerifiedInDb?.isEmailVerified) {
      throw new Error("FAIL: User email not verified in DB after entering correct OTP!");
    }
    if (userVerifiedInDb.onboardingCompleted) {
      throw new Error("FAIL: Onboarding marked completed before profile submission!");
    }

    // ----------------------------------------------------
    // STEP 6: FILL & SUBMIT PROFILE ONBOARDING
    // ----------------------------------------------------
    console.log("\n[BROWSER 6] Filling Client Profile information...");
    await typeIntoReactInput(page, 'input[name="kraPin"]', "A099887766K");
    await typeIntoReactInput(page, 'input[name="nationalId"]', "38291045");
    await page.select('select[name="county"]', "Nairobi");
    await typeIntoReactInput(page, 'input[name="city"]', "Nairobi");
    await typeIntoReactInput(page, 'input[name="address"]', "Kilimani, Argwings Kodhek Rd");

    console.log(" -> Submitting profile onboarding...");
    await page.click('button[type="submit"]');

    // ----------------------------------------------------
    // STEP 7: VERIFY STEP 4 COMPLETED PAGE
    // ----------------------------------------------------
    console.log("\n[BROWSER 7] Waiting for Step 4 (Registration Completed Launchpad)...");
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_05_completed_launchpad.png" });

    const finalDbUser = await prisma.user.findUnique({ where: { email: testEmail } });
    console.log(` -> DB Final onboardingCompleted: ${finalDbUser?.onboardingCompleted}`);
    console.log(` -> DB Final onboardingCompletedAt: ${finalDbUser?.onboardingCompletedAt?.toISOString()}`);

    if (!finalDbUser?.onboardingCompleted) {
      throw new Error("FAIL: Final onboardingCompleted state is not true!");
    }

    console.log("\n==================================================");
    console.log("REAL BROWSER REGISTRATION AUDIT SUCCESSFUL! 🎉");
    console.log("==================================================");

    // Cleanup DB
    await prisma.user.delete({ where: { email: testEmail } });
  } catch (error) {
    console.error("❌ BROWSER AUDIT FAILED:", error);
    await page.screenshot({ path: "/home/abdikhafar/.gemini/antigravity/brain/d6079465-132d-4880-a7e8-4531ac6ca219/reg_err_browser_failure.png" });
    process.exit(1);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

auditRegistrationInBrowser();
