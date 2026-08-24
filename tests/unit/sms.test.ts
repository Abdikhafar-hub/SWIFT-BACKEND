import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatKenyanPhone, isValidKenyanPhone, sanitizePhoneNumber } from "../../src/common/utils/phone-formatter.js";
import { MockSmsProvider, AfricasTalkingSmsProvider } from "../../src/infrastructure/sms/index.js";

describe("SMS Infrastructure & Utility Audit Tests", () => {
  describe("Phone Formatter & E.164 Normalization", () => {
    it("should sanitize whitespace, hyphens and dots", () => {
      expect(sanitizePhoneNumber("+254 712-345.678")).toBe("+254712345678");
    });

    it("should format Kenyan local 07XXXXXXXX to +2547XXXXXXXX", () => {
      expect(formatKenyanPhone("0712345678")).toBe("+254712345678");
      expect(isValidKenyanPhone("0712345678")).toBe(true);
    });

    it("should format Kenyan local 01XXXXXXXX to +2541XXXXXXXX", () => {
      expect(formatKenyanPhone("0112345678")).toBe("+254112345678");
      expect(isValidKenyanPhone("0112345678")).toBe(true);
    });

    it("should handle 254XXXXXXXXX without plus prefix", () => {
      expect(formatKenyanPhone("254712345678")).toBe("+254712345678");
      expect(isValidKenyanPhone("254712345678")).toBe(true);
    });

    it("should preserve existing valid +254 format", () => {
      expect(formatKenyanPhone("+254712345678")).toBe("+254712345678");
      expect(isValidKenyanPhone("+254712345678")).toBe(true);
    });

    it("should reject invalid or non-Kenyan phone formats", () => {
      expect(isValidKenyanPhone("12345")).toBe(false);
      expect(isValidKenyanPhone("abc")).toBe(false);
      expect(isValidKenyanPhone("071234")).toBe(false);
    });
  });

  describe("Mock SMS Provider Implementation", () => {
    let mockProvider: MockSmsProvider;

    beforeEach(() => {
      mockProvider = new MockSmsProvider();
    });

    it("should send SMS and return structured output with mock ID", async () => {
      const result = await mockProvider.sendSms({
        to: "0712345678",
        message: "Test message",
      });

      expect(result.success).toBe(true);
      expect(result.recipient).toBe("+254712345678");
      expect(result.messageId).toContain("mock_sms_");
      expect(result.status).toBe("Sent");
      expect(result.errorClassification).toBe("PROVIDER_ACCEPTED");
      expect(mockProvider.sentMessages).toHaveLength(1);
    });

    it("should handle bulk SMS dispatches", async () => {
      const results = await mockProvider.sendBulkSms(
        ["0712345678", "0798765432"],
        "Bulk test message"
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe("Africa's Talking Provider Validation", () => {
    let atProvider: AfricasTalkingSmsProvider;

    beforeEach(() => {
      atProvider = new AfricasTalkingSmsProvider();
    });

    it("should reject invalid recipient before sending API request", async () => {
      const result = await atProvider.sendSms({
        to: "invalid_phone",
        message: "Hello world",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("InvalidPhoneNumber");
      expect(result.errorClassification).toBe("INVALID_PHONE");
      expect(result.error).toContain("Recipient phone number is invalid");
    });

    it("should reject empty SMS content", async () => {
      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "   ",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("EmptyMessage");
      expect(result.errorClassification).toBe("EMPTY_MESSAGE");
      expect(result.error).toContain("SMS message content cannot be empty");
    });

    it("should handle HTTP 401 Unauthorized with PROVIDER_AUTHENTICATION_FAILURE", async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "The supplied authentication is invalid",
      } as any);

      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("HTTP_401");
      expect(result.errorClassification).toBe("PROVIDER_AUTHENTICATION_FAILURE");
      expect(result.error).toBe("SMS provider authentication rejected the request.");

      global.fetch = globalFetch;
    });

    it("should handle HTTP 429 Rate Limit with PROVIDER_RATE_LIMIT", async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "Rate limit exceeded",
      } as any);

      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("HTTP_429");
      expect(result.errorClassification).toBe("PROVIDER_RATE_LIMIT");

      global.fetch = globalFetch;
    });

    it("should handle HTTP 500 Server Error with PROVIDER_SERVER_ERROR", async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Internal error",
      } as any);

      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("HTTP_500");
      expect(result.errorClassification).toBe("PROVIDER_SERVER_ERROR");

      global.fetch = globalFetch;
    });

    it("should handle network failure with NETWORK_ERROR", async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("NetworkError");
      expect(result.errorClassification).toBe("NETWORK_ERROR");
      expect(result.error).toContain("Connection refused");

      global.fetch = globalFetch;
    });

    it("should parse InsufficientBalance provider response with PROVIDER_SMS_REJECTED", async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            SMSMessageData: {
              Message: "Sent to 0/1 Total Cost: 0",
              Recipients: [
                {
                  cost: "0",
                  messageId: "None",
                  number: "+254712345678",
                  status: "InsufficientBalance",
                  statusCode: 405,
                },
              ],
            },
          }),
      } as any);

      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "Test message",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("InsufficientBalance");
      expect(result.errorClassification).toBe("PROVIDER_SMS_REJECTED");
      expect(result.error).toContain("insufficient");

      global.fetch = globalFetch;
    });

    it("should parse successful Africa's Talking API JSON response", async () => {
      const globalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            SMSMessageData: {
              Message: "Sent to 1/1 Recipients",
              Recipients: [
                {
                  cost: "KES 0.8000",
                  messageId: "ATXid_test_12345",
                  number: "+254712345678",
                  status: "Success",
                  statusCode: 101,
                },
              ],
            },
          }),
      } as any);

      const result = await atProvider.sendSms({
        to: "+254712345678",
        message: "Valid test message",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("ATXid_test_12345");
      expect(result.status).toBe("Success");
      expect(result.errorClassification).toBe("PROVIDER_ACCEPTED");
      expect(result.cost).toBe("KES 0.8000");

      global.fetch = globalFetch;
    });
  });
});
