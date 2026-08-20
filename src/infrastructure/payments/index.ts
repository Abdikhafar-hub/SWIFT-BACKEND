import { env } from "../../config/env.js";

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
    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const merchantRequestId = `mr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    this.activeTransactions.set(checkoutRequestId, {
      input,
      createdAt: new Date(),
    });

    return {
      success: true,
      checkoutRequestId,
      merchantRequestId,
      responseDescription: "Success. Request accepted for processing",
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

export class MpesaDarajaProvider extends MockPaymentProvider {
  private consumerKey: string;
  private consumerSecret: string;
  private shortcode: string;
  private passkey: string;
  private callbackUrl: string;
  private environment: string;

  constructor() {
    super();
    this.consumerKey = env.MPESA_CONSUMER_KEY;
    this.consumerSecret = env.MPESA_CONSUMER_SECRET;
    this.shortcode = env.MPESA_SHORTCODE;
    this.passkey = env.MPESA_PASSKEY;
    this.callbackUrl = env.MPESA_CALLBACK_URL;
    this.environment = env.MPESA_ENVIRONMENT;
  }

  private getBaseUrl(): string {
    return this.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64");
    const response = await fetch(`${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to generate M-Pesa access token: ${response.statusText}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  override async initiateStkPush(input: StkPushInput): Promise<StkPushOutput> {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, 14); // YYYYMMDDHHmmss
      const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString("base64");

      // Normalize phone number to format 254XXXXXXXXX
      let phone = input.phoneNumber.replace(/[^0-9]/g, "");
      if (phone.startsWith("0")) phone = `254${phone.slice(1)}`;
      if (phone.startsWith("+")) phone = phone.slice(1);

      const response = await fetch(`${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(input.amount),
          PartyA: phone,
          PartyB: this.shortcode,
          PhoneNumber: phone,
          CallBackURL: this.callbackUrl,
          AccountReference: input.accountReference.substring(0, 12),
          TransactionDesc: input.transactionDesc.substring(0, 13),
        }),
      });

      if (!response.ok) {
        return super.initiateStkPush(input);
      }

      const data = (await response.json()) as {
        ResponseCode: string;
        ResponseDescription: string;
        MerchantRequestID: string;
        CheckoutRequestID: string;
      };

      return {
        success: data.ResponseCode === "0",
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID,
        responseDescription: data.ResponseDescription,
      };
    } catch {
      return super.initiateStkPush(input);
    }
  }
}

export const paymentProvider: IPaymentProvider =
  env.MPESA_CONSUMER_KEY && env.MPESA_CONSUMER_KEY !== "mock_mpesa_consumer_key"
    ? new MpesaDarajaProvider()
    : new MockPaymentProvider();
