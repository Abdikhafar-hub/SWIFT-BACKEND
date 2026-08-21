import { env } from "../../config/env.js";
import { normalizeKenyanPhone } from "../../common/utils/phone.js";
import { ExternalServiceError, BadRequestError } from "../../common/errors/app-error.js";

export interface StkPushInput {
  phoneNumber: string; // e.g. "254712345678"
  amount: number;
  accountReference: string; // Application Number e.g. "SD-APP-2026-000001"
  transactionDesc: string;
  idempotencyKey: string;
}

export interface StkPushOutput {
  success: boolean;
  checkoutRequestId: string;
  merchantRequestId: string;
  responseDescription: string;
}

export interface CallbackProcessOutput {
  isSuccess: boolean;
  checkoutRequestId: string;
  merchantRequestId?: string;
  mpesaReceiptNumber?: string;
  amount?: number;
  phoneNumber?: string;
  transactionDate?: Date;
  resultCode: number;
  resultDesc: string;
}

export interface IPaymentProvider {
  initiateStkPush(input: StkPushInput): Promise<StkPushOutput>;
  queryTransactionStatus(checkoutRequestId: string): Promise<CallbackProcessOutput>;
  processCallback(callbackBody: unknown): Promise<CallbackProcessOutput>;
}

export class MockPaymentProvider implements IPaymentProvider {
  private activeTransactions = new Map<string, { input: StkPushInput; createdAt: Date }>();

  async initiateStkPush(input: StkPushInput): Promise<StkPushOutput> {
    const normalizedPhone = normalizeKenyanPhone(input.phoneNumber);
    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const merchantRequestId = `mr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    this.activeTransactions.set(checkoutRequestId, {
      input: { ...input, phoneNumber: normalizedPhone },
      createdAt: new Date(),
    });

    return {
      success: true,
      checkoutRequestId,
      merchantRequestId,
      responseDescription: "Success. Request accepted for processing (Mock Sandbox)",
    };
  }

  async queryTransactionStatus(checkoutRequestId: string): Promise<CallbackProcessOutput> {
    const tx = this.activeTransactions.get(checkoutRequestId);
    if (!tx) {
      return {
        isSuccess: false,
        checkoutRequestId,
        resultCode: 1,
        resultDesc: "The service request is rejected (Transaction not found)",
      };
    }

    return {
      isSuccess: true,
      checkoutRequestId,
      mpesaReceiptNumber: `MOCK_MPESA_${Date.now().toString().slice(-6)}`,
      amount: tx.input.amount,
      phoneNumber: tx.input.phoneNumber,
      transactionDate: new Date(),
      resultCode: 0,
      resultDesc: "The service request is processed successfully.",
    };
  }

  async processCallback(callbackBody: unknown): Promise<CallbackProcessOutput> {
    // Safely parse Safaricom Daraja STK callback format
    const body = callbackBody as {
      Body?: {
        stkCallback?: {
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: {
            Item?: Array<{ Name: string; Value: unknown }>;
          };
        };
      };
    };

    const stk = body?.Body?.stkCallback;
    const checkoutRequestId = stk?.CheckoutRequestID || `unknown_${Date.now()}`;
    const resultCode = stk?.ResultCode ?? 0;
    const resultDesc = stk?.ResultDesc ?? "Callback received";
    const isSuccess = resultCode === 0;

    let mpesaReceiptNumber: string | undefined;
    let amount: number | undefined;
    let phoneNumber: string | undefined;

    if (stk?.CallbackMetadata?.Item) {
      for (const item of stk.CallbackMetadata.Item) {
        if (item.Name === "MpesaReceiptNumber") mpesaReceiptNumber = String(item.Value);
        if (item.Name === "Amount") amount = Number(item.Value);
        if (item.Name === "PhoneNumber") phoneNumber = String(item.Value);
      }
    }

    return {
      isSuccess,
      checkoutRequestId,
      merchantRequestId: stk?.MerchantRequestID,
      mpesaReceiptNumber: mpesaReceiptNumber || (isSuccess ? `MOCK_${Date.now()}` : undefined),
      amount,
      phoneNumber,
      transactionDate: new Date(),
      resultCode,
      resultDesc,
    };
  }
}

export class MpesaDarajaProvider implements IPaymentProvider {
  private consumerKey: string;
  private consumerSecret: string;
  private shortcode: string;
  private passkey: string;
  private callbackUrl: string;
  private environment: string;

  private tokenCache: { accessToken: string; expiresAt: number } | null = null;
  private mockFallback: MockPaymentProvider;

  constructor() {
    this.consumerKey = env.MPESA_CONSUMER_KEY;
    this.consumerSecret = env.MPESA_CONSUMER_SECRET;
    this.shortcode = env.MPESA_SHORTCODE;
    this.passkey = env.MPESA_PASSKEY;
    this.callbackUrl = env.MPESA_CALLBACK_URL;
    this.environment = env.MPESA_ENVIRONMENT;
    this.mockFallback = new MockPaymentProvider();
  }

  private getBaseUrl(): string {
    return this.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  }

  /**
   * Safaricom Daraja OAuth Token Generator with in-memory caching
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Return cached token if valid for at least another 60 seconds
    if (this.tokenCache && now < this.tokenCache.expiresAt - 60000) {
      return this.tokenCache.accessToken;
    }

    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64");
    const endpoint = `${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      });
    } catch (err: any) {
      throw new ExternalServiceError("M-Pesa Daraja", `OAuth network error: ${err.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new ExternalServiceError("M-Pesa Daraja", `OAuth authentication failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in?: string };
    if (!data.access_token) {
      throw new ExternalServiceError("M-Pesa Daraja", "OAuth response did not contain access_token.");
    }

    const expiresInSeconds = Number(data.expires_in) || 3599;
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + expiresInSeconds * 1000,
    };

    return data.access_token;
  }

  /**
   * Real Daraja STK Push Initiation
   */
  async initiateStkPush(input: StkPushInput): Promise<StkPushOutput> {
    const phone = normalizeKenyanPhone(input.phoneNumber);
    const accessToken = await this.getAccessToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss

    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString("base64");
    const roundedAmount = Math.round(input.amount);

    const payload = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: roundedAmount,
      PartyA: phone,
      PartyB: this.shortcode,
      PhoneNumber: phone,
      CallBackURL: this.callbackUrl,
      AccountReference: input.accountReference.substring(0, 12),
      TransactionDesc: input.transactionDesc.substring(0, 13),
    };

    const endpoint = `${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new ExternalServiceError("M-Pesa Daraja", `STK Push connection failed: ${err.message}`);
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new ExternalServiceError("M-Pesa Daraja", `Invalid JSON from STK Push: ${responseText}`);
    }

    if (!response.ok || data.ResponseCode !== "0") {
      return {
        success: false,
        checkoutRequestId: data.CheckoutRequestID || "",
        merchantRequestId: data.MerchantRequestID || "",
        responseDescription: data.ResponseDescription || data.errorMessage || `STK Push Failed (${response.status})`,
      };
    }

    return {
      success: true,
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      responseDescription: data.ResponseDescription || "Success. Request accepted for processing",
    };
  }

  /**
   * Real Daraja STK Push Query API
   */
  async queryTransactionStatus(checkoutRequestId: string): Promise<CallbackProcessOutput> {
    const accessToken = await this.getAccessToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString("base64");

    const payload = {
      BusinessShortCode: this.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const endpoint = `${this.getBaseUrl()}/mpesa/stkpushquery/v1/query`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw new ExternalServiceError("M-Pesa Daraja", `STK Push Query connection failed: ${err.message}`);
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new ExternalServiceError("M-Pesa Daraja", `Invalid JSON from STK Query: ${responseText}`);
    }

    const resultCode = Number(data.ResultCode ?? data.ResponseCode ?? 1);
    const resultDesc = data.ResultDesc || data.ResponseDescription || "Query processed";
    const isSuccess = resultCode === 0;

    return {
      isSuccess,
      checkoutRequestId,
      merchantRequestId: data.MerchantRequestID,
      resultCode,
      resultDesc,
    };
  }

  /**
   * Process Callback Body (re-uses standard callback parser)
   */
  async processCallback(callbackBody: unknown): Promise<CallbackProcessOutput> {
    return this.mockFallback.processCallback(callbackBody);
  }
}

/**
 * Single Payment Provider Factory / Instance
 */
export const paymentProvider: IPaymentProvider =
  env.MPESA_CONSUMER_KEY &&
  env.MPESA_CONSUMER_KEY !== "mock_mpesa_consumer_key" &&
  env.MPESA_CONSUMER_KEY.trim().length > 0
    ? new MpesaDarajaProvider()
    : new MockPaymentProvider();
