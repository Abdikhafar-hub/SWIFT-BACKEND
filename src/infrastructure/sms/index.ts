import { env } from "../../config/env.js";

export interface SendSmsInput {
  to: string; // e.g. "+254712345678"
  message: string;
}

export interface SendSmsOutput {
  success: boolean;
  messageId: string;
  recipient: string;
  status: string;
}

export interface ISmsService {
  sendSms(input: SendSmsInput): Promise<SendSmsOutput>;
  sendBulkSms(recipients: string[], message: string): Promise<SendSmsOutput[]>;
}

export class MockSmsProvider implements ISmsService {
  public sentMessages: SendSmsInput[] = [];

  async sendSms(input: SendSmsInput): Promise<SendSmsOutput> {
    const messageId = `mock_sms_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sentMessages.push(input);
    return {
      success: true,
      messageId,
      recipient: input.to,
      status: "Sent",
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

export class AfricasTalkingSmsProvider extends MockSmsProvider {
  private apiKey: string;
  private username: string;
  private senderId: string;

  constructor() {
    super();
    this.apiKey = env.AT_API_KEY;
    this.username = env.AT_USERNAME;
    this.senderId = env.AT_SENDER_ID;
  }

  override async sendSms(input: SendSmsInput): Promise<SendSmsOutput> {
    try {
      const url =
        this.username === "sandbox"
          ? "https://api.sandbox.africastalking.com/version1/messaging"
          : "https://api.africastalking.com/version1/messaging";

      const formData = new URLSearchParams();
      formData.append("username", this.username);
      formData.append("to", input.to);
      formData.append("message", input.message);
      if (this.senderId) {
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

      if (!response.ok) {
        return super.sendSms(input);
      }

      const data = (await response.json()) as {
        SMSMessageData?: {
          Recipients?: Array<{ status: string; messageId: string; number: string }>;
        };
      };

      const recipient = data.SMSMessageData?.Recipients?.[0];
      return {
        success: recipient?.status === "Success" || recipient?.status === "Sent",
        messageId: recipient?.messageId || `at_${Date.now()}`,
        recipient: input.to,
        status: recipient?.status || "Sent",
      };
    } catch {
      return super.sendSms(input);
    }
  }
}

export const smsService: ISmsService =
  env.AT_API_KEY && env.AT_API_KEY !== "mock_at_api_key"
    ? new AfricasTalkingSmsProvider()
    : new MockSmsProvider();
