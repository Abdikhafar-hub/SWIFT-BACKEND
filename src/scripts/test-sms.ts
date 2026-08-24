import { env } from "../config/env.js";
import { formatKenyanPhone, isValidKenyanPhone } from "../common/utils/phone-formatter.js";
import { smsService, getSmsProviderStatus } from "../infrastructure/sms/index.js";

async function main() {
  console.log("=================================================");
  console.log(" AFRICAS TALKING SMS DEEP INTEGRATION AUDIT TOOL");
  console.log("=================================================\n");

  // 1. Configuration Diagnostic
  const status = getSmsProviderStatus();
  console.log("--- 1. CONFIGURATION DIAGNOSTICS ---");
  console.log(`Active Provider: ${status.providerName}`);
  console.log(`Configured:      ${status.isConfigured ? "YES" : "NO"}`);
  console.log(`Username:        ${status.username}`);
  console.log(`Sender ID:       ${status.senderId}`);
  console.log(`API Key Set:     ${status.apiKeyConfigured ? "YES (hidden)" : "NO"}\n`);

  // 2. Phone Normalization Verification
  console.log("--- 2. PHONE NORMALIZATION UNIT CHECKS ---");
  const testCases = [
    { input: "0712345678", expected: "+254712345678" },
    { input: "0112345678", expected: "+254112345678" },
    { input: "+254 712 345 678", expected: "+254712345678" },
    { input: "254712345678", expected: "+254712345678" },
    { input: "invalid_phone", expected: "invalid_phone" },
  ];

  let normalizationPassed = true;
  for (const tc of testCases) {
    const formatted = formatKenyanPhone(tc.input);
    const valid = isValidKenyanPhone(formatted);
    const match = formatted === tc.expected;
    if (!match && tc.input !== "invalid_phone") normalizationPassed = false;
    console.log(` Input: "${tc.input}" -> Normalized: "${formatted}" | Valid: ${valid} | Pass: ${match}`);
  }
  console.log(`Normalization Result: ${normalizationPassed ? "PASSED" : "FAILED"}\n`);

  // 3. Dispatch Live SMS Test
  const testRecipient = process.env.SMS_TEST_RECIPIENT || env.SMS_TEST_RECIPIENT || "+254712345678";
  const normalizedRecipient = formatKenyanPhone(testRecipient);
  const testMessage = `Swift Doc SMS Audit Test Code: ${Math.floor(100000 + Math.random() * 900000)} at ${new Date().toISOString()}`;

  console.log("--- 3. END-TO-END SMS DISPATCH TEST ---");
  console.log(`Target Recipient: ${testRecipient} -> Normalized: ${normalizedRecipient}`);
  console.log(`Message Content:  "${testMessage}"`);
  console.log(`Dispatching via ${smsService.getProviderName()}...`);

  const result = await smsService.sendSms({
    to: normalizedRecipient,
    message: testMessage,
  });

  console.log("\n--- 4. DISPATCH RESULT BREAKDOWN ---");
  console.log(`Success:    ${result.success ? "✅ TRUE" : "❌ FALSE"}`);
  console.log(`Status:     ${result.status}`);
  console.log(`Message ID: ${result.messageId || "NONE"}`);
  console.log(`Recipient:  ${result.recipient}`);
  if (result.cost) console.log(`Cost:       ${result.cost}`);
  if (result.error) console.log(`Error Msg:  ${result.error}`);
  if (result.rawResponse) console.log(`Raw Body:   ${JSON.stringify(result.rawResponse)}`);

  console.log("\n=================================================");
  if (result.success) {
    console.log(" SMS AUDIT COMPLETE: SUCCESSFUL DISPATCH RECORDED");
  } else {
    console.log(" SMS AUDIT COMPLETE: DISPATCH FAILED (SEE REASON ABOVE)");
  }
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("Fatal audit execution error:", err);
  process.exit(1);
});
