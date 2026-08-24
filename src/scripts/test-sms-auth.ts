import { env } from "../config/env.js";

async function runAuthDiagnostic() {
  console.log("=========================================");
  console.log("AFRICA'S TALKING AUTH DIAGNOSTIC");
  console.log("=========================================\n");

  const rawApiKey = (env.AT_API_KEY || "").trim();
  const username = (env.AT_USERNAME || "").trim();

  const isConfigured = Boolean(rawApiKey && rawApiKey !== "mock_at_api_key");
  const keyLength = rawApiKey.length;
  
  let maskedKey = "NOT_CONFIGURED";
  if (keyLength > 8) {
    const prefix = rawApiKey.substring(0, 5);
    const suffix = rawApiKey.substring(keyLength - 4);
    maskedKey = `${prefix}****${suffix}`;
  }

  const isSandbox = username.toLowerCase() === "sandbox";
  const baseUrl = isSandbox ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const userEndpoint = `${baseUrl}/version1/user?username=${encodeURIComponent(username)}`;

  console.log(`Environment: ${isSandbox ? "SANDBOX" : "PRODUCTION"}`);
  console.log(`Username: ${username}`);
  console.log(`API Key configured: ${isConfigured ? "YES" : "NO"}`);
  console.log(`API Key length: ${keyLength}`);
  console.log(`API Key masked: ${maskedKey}`);
  console.log(`Endpoint: ${userEndpoint}\n`);

  if (!isConfigured) {
    console.log("Authentication:\nFAIL\n");
    console.log("HTTP Status:\nN/A\n");
    console.log("Provider Response:\nAPI key not set in .env\n");
    console.log("Likely Cause:\nAT_API_KEY is missing or set to default mock value.\n");
    return;
  }

  try {
    const response = await fetch(userEndpoint, {
      method: "GET",
      headers: {
        apiKey: rawApiKey,
        Accept: "application/json",
      },
    });

    const responseText = await response.text();

    if (response.ok) {
      console.log("Authentication:\nPASS\n");
      console.log(`HTTP Status:\n${response.status} ${response.statusText}\n`);
      console.log(`Provider Response:\n${responseText.trim()}\n`);
      console.log(`Likely Cause:\nAfrica's Talking API successfully authenticated username '${username}' with key ${maskedKey}.\n`);
    } else {
      console.log("Authentication:\nFAIL\n");
      console.log(`HTTP Status:\n${response.status} ${response.statusText}\n`);
      console.log(`Provider Response:\n${responseText.trim()}\n`);
      if (response.status === 401) {
        console.log(`Likely Cause:\nThe API Key (${maskedKey}) does not match username '${username}' on Africa's Talking ${isSandbox ? "Sandbox" : "Production"} servers.\n`);
      } else {
        console.log(`Likely Cause:\nHTTP ${response.status} error returned by Africa's Talking API.\n`);
      }
    }
  } catch (err: any) {
    console.log("Authentication:\nFAIL\n");
    console.log(`HTTP Status:\nERROR\n`);
    console.log(`Provider Response:\n${err.message}\n`);
    console.log(`Likely Cause:\nNetwork connection failure to ${baseUrl}\n`);
  }
}

runAuthDiagnostic().catch((err) => {
  console.error("Diagnostic execution error:", err);
  process.exit(1);
});
