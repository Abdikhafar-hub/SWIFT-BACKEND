import { env } from "../../config/env.js";
import { formatKenyanPhone, isValidKenyanPhone } from "../../common/utils/phone-formatter.js";

export interface SendSmsInput {
  to: string; // e.g. "0712345678" or "+254712345678"
  message: string;
}

export type SmsErrorClassification =
  | "PROVIDER_AUTHENTICATION_FAILURE"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_SERVER_ERROR"
  | "PROVIDER_REQUEST_ERROR"
  | "PROVIDER_ACCEPTED"
  | "PROVIDER_SMS_REJECTED"
  | "INVALID_PHONE"
  | "EMPTY_MESSAGE"
  | "NOT_CONFIGURED"
  | "NETWORK_ERROR";

export interface SendSmsOutput {
  success: boolean;
  messageId: string;
  recipient: string;
  status: string;
  errorClassification?: SmsErrorClassification;
  cost?: string;
  error?: string;
  provider: string;
  providerHttpStatus?: number;
  rawResponse?: unknown;
}

export interface ISmsService {
  sendSms(input: SendSmsInput): Promise<SendSmsOutput>;
  sendBulkSms(recipients: string[], message: string): Promise<SendSmsOutput[]>;
  isConfigured(): boolean;
  getProviderName(): string;
}

export class MockSmsProvider implements ISmsService {
  public sentMessages: Array<SendSmsInput & { messageId: string; sentAt: Date }> = [];

  isConfigured(): boolean {
    return true;
  }

  getProviderName(): string {
    return "Mock SMS Provider";
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsOutput> {
    const recipient = formatKenyanPhone(input.to);
    const messageId = `mock_sms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentMessages.push({ ...input, to: recipient, messageId, sentAt: new Date() });
    return {
      success: true,
      messageId,
      recipient,
      status: "Sent",
      errorClassification: "PROVIDER_ACCEPTED",
      cost: "KES 0.00",
      provider: "mock",
      providerHttpStatus: 200,
    };
  }

  async sendBulkSms(recipients: string[], message: string): Promise<SendSmsOutput[]> {
    const results: SendSmsOutput[] = [];
    for (const to of recipients) {
      results.push(await this.sendSms({ to, message }));
    }
    return results;
  }
}

export class AfricasTalkingSmsProvider implements ISmsService {
  private apiKey: string;
  private username: string;
  private senderId: string;

  constructor() {
    this.apiKey = env.AT_API_KEY;
    this.username = env.AT_USERNAME;
    this.senderId = env.AT_SENDER_ID;
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey !== "mock_at_api_key" &&
      this.username &&
      this.username !== "mock_at_username"
    );
  }

  getProviderName(): string {
    return `Africa's Talking (${this.username === "sandbox" ? "Sandbox" : "Production"})`;
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsOutput> {
    const recipient = formatKenyanPhone(input.to);

    if (!isValidKenyanPhone(recipient)) {
      console.error(`[SMS_SERVICE] Invalid recipient phone number format: ${input.to} -> ${recipient}`);
      return {
        success: false,
        messageId: "",
        recipient: recipient || input.to,
        status: "InvalidPhoneNumber",
        errorClassification: "INVALID_PHONE",
        error: "Recipient phone number is invalid for Kenyan format (+254XXXXXXXXX)",
        provider: "africas_talking",
      };
    }

    if (!input.message || !input.message.trim()) {
      return {
        success: false,
        messageId: "",
        recipient,
        status: "EmptyMessage",
        errorClassification: "EMPTY_MESSAGE",
        error: "SMS message content cannot be empty",
        provider: "africas_talking",
      };
    }

    if (!this.isConfigured()) {
      console.warn("[SMS_SERVICE] Africa's Talking API key or username missing. SMS dispatch rejected.");
      return {
        success: false,
        messageId: "",
        recipient,
        status: "NotConfigured",
        errorClassification: "NOT_CONFIGURED",
        error: "Africa's Talking SMS credentials are not configured",
        provider: "africas_talking",
      };
    }

    try {
      const url =
        this.username === "sandbox"
          ? "https://api.sandbox.africastalking.com/version1/messaging"
          : "https://api.africastalking.com/version1/messaging";

      const formData = new URLSearchParams();
      formData.append("username", this.username);
      formData.append("to", recipient);
      formData.append("message", input.message.trim());
      
      // Custom sender IDs (e.g. SWIFTDOC) must be pre-registered on Africa's Talking dashboard before passing 'from'
      if (this.senderId && this.senderId !== "SWIFTDOC" && this.username !== "sandbox") {
        formData.append("from", this.senderId);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          apiKey: this.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData.toString(),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let classification: SmsErrorClassification = "PROVIDER_REQUEST_ERROR";
        if (response.status === 401) {
          classification = "PROVIDER_AUTHENTICATION_FAILURE";
        } else if (response.status === 429) {
          classification = "PROVIDER_RATE_LIMIT";
        } else if (response.status >= 500) {
          classification = "PROVIDER_SERVER_ERROR";
        }

        console.error(`[SMS_SERVICE] AT API HTTP Error (${response.status}): ${responseText}`);
        return {
          success: false,
          messageId: "",
          recipient,
          status: `HTTP_${response.status}`,
          errorClassification: classification,
          error: response.status === 401
            ? "SMS provider authentication rejected the request."
            : `Provider HTTP error ${response.status}: ${responseText.slice(0, 150)}`,
          provider: "africas_talking",
          providerHttpStatus: response.status,
          rawResponse: { 
            httpStatus: response.status, 
            headers: response.headers && typeof response.headers.entries === "function" 
              ? Object.fromEntries(response.headers.entries()) 
              : {}, 
            body: responseText 
          },
        };
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        return {
          success: false,
          messageId: "",
          recipient,
          status: "InvalidResponse",
          errorClassification: "PROVIDER_SERVER_ERROR",
          error: `Provider returned non-JSON body: ${responseText.slice(0, 100)}`,
          provider: "africas_talking",
          providerHttpStatus: response.status,
        };
      }

      const globalMessage = data.SMSMessageData?.Message;
      const recipientData = data.SMSMessageData?.Recipients?.[0];

      if (globalMessage === "InvalidSenderId") {
        console.error(`[SMS_SERVICE] AT InvalidSenderId: Sender ID '${this.senderId}' is not registered.`);
        return {
          success: false,
          messageId: "",
          recipient,
          status: "InvalidSenderId",
          errorClassification: "PROVIDER_SMS_REJECTED",
          error: `Sender ID '${this.senderId}' is not registered on your Africa's Talking account.`,
          provider: "africas_talking",
          providerHttpStatus: response.status,
          rawResponse: data,
        };
      }

      const statusStr = recipientData?.status || globalMessage || "Unknown";
      const messageId = recipientData?.messageId && recipientData.messageId !== "None" ? recipientData.messageId : "";
      const isSuccess = statusStr === "Success" || statusStr === "Sent";

      let errorMessage: string | undefined = undefined;
      let classification: SmsErrorClassification = "PROVIDER_ACCEPTED";

      if (!isSuccess) {
        classification = "PROVIDER_SMS_REJECTED";
        if (statusStr === "InsufficientBalance") {
          errorMessage = "Africa's Talking account balance is insufficient (KES 0.00). Top up balance on AT dashboard.";
        } else {
          errorMessage = `Africa's Talking returned status: ${statusStr}`;
        }
        console.error(`[SMS_SERVICE] AT Dispatch Not Completed for ${recipient}: Status=${statusStr}`);
      }

      return {
        success: isSuccess,
        messageId,
        recipient,
        status: statusStr,
        errorClassification: classification,
        cost: recipientData?.cost,
        error: errorMessage,
        provider: "africas_talking",
        providerHttpStatus: response.status,
        rawResponse: data,
      };
    } catch (err: any) {
      console.error("[SMS_SERVICE] Network error calling Africa's Talking API:", err.message || err);
      return {
        success: false,
        messageId: "",
        recipient,
        status: "NetworkError",
        errorClassification: "NETWORK_ERROR",
        error: err.message || "Network error occurred while calling Africa's Talking API",
        provider: "africas_talking",
      };
    }
  }

  async sendBulkSms(recipients: string[], message: string): Promise<SendSmsOutput[]> {
    const results: SendSmsOutput[] = [];
    for (const to of recipients) {
      results.push(await this.sendSms({ to, message }));
    }
    return results;
  }
}

// Export singleton instance based on configuration
const isAtConfigured = Boolean(
  env.AT_API_KEY &&
  env.AT_API_KEY !== "mock_at_api_key" &&
  env.AT_USERNAME &&
  env.AT_USERNAME !== "mock_at_username"
);

export const smsService: ISmsService = isAtConfigured
  ? new AfricasTalkingSmsProvider()
  : new MockSmsProvider();

export function getSmsProviderStatus() {
  return {
    providerName: smsService.getProviderName(),
    isConfigured: smsService.isConfigured(),
    username: env.AT_USERNAME === "mock_at_username" ? "NOT_CONFIGURED" : env.AT_USERNAME,
    senderId: env.AT_SENDER_ID || "DEFAULT",
    apiKeyConfigured: Boolean(env.AT_API_KEY && env.AT_API_KEY !== "mock_at_api_key"),
  };
}

export async function getSmsHealthDiagnostics() {
  const isConfigured = Boolean(
    env.AT_API_KEY &&
    env.AT_API_KEY !== "mock_at_api_key" &&
    env.AT_USERNAME &&
    env.AT_USERNAME !== "mock_at_username"
  );

  const username = env.AT_USERNAME;
  const environment = username === "sandbox" ? "sandbox" : "production";

  if (!isConfigured) {
    return {
      provider: "africas_talking",
      environment,
      configured: false,
      credentialsAccepted: false,
      balance: "N/A",
      smsDispatchAvailable: false,
      smsDispatchReason: "NOT_CONFIGURED",
      checkedAt: new Date().toISOString(),
    };
  }

  const baseUrl = username === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

  try {
    const res = await fetch(`${baseUrl}/version1/user?username=${username}`, {
      method: "GET",
      headers: {
        apiKey: env.AT_API_KEY,
        Accept: "application/json",
      },
    });

    if (res.status === 200) {
      const data = (await res.json()) as any;
      const balance = data.UserData?.balance || "UNKNOWN";
      return {
        provider: "africas_talking",
        environment,
        configured: true,
        credentialsAccepted: true,
        balance,
        smsDispatchAvailable: false, // Dispatches are blocked by AT API HTTP 401 on /messaging
        smsDispatchReason: "PROVIDER_HTTP_401",
        checkedAt: new Date().toISOString(),
      };
    } else {
      return {
        provider: "africas_talking",
        environment,
        configured: true,
        credentialsAccepted: false,
        balance: "N/A",
        smsDispatchAvailable: false,
        smsDispatchReason: `HTTP_${res.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
  } catch (err: any) {
    return {
      provider: "africas_talking",
      environment,
      configured: true,
      credentialsAccepted: false,
      balance: "N/A",
      smsDispatchAvailable: false,
      smsDispatchReason: "NETWORK_ERROR",
      checkedAt: new Date().toISOString(),
    };
  }
}
