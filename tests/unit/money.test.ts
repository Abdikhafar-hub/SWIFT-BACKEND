import { describe, it, expect } from "vitest";
import {
  calculatePaymentBreakdown,
  calculateInvoiceTotals,
  calculateLineItemTotal,
  formatKes,
  toDecimal,
} from "../../src/common/utils/money.js";
import { Prisma } from "@prisma/client";

describe("Financial Precision & Money Calculations", () => {
  describe("toDecimal conversion", () => {
    it("converts numbers, strings, and Prisma.Decimal instances correctly", () => {
      expect(toDecimal(100).toString()).toBe("100");
      expect(toDecimal("250.50").toString()).toBe("250.5");
      expect(toDecimal(new Prisma.Decimal(99.99)).toString()).toBe("99.99");
    });

    it("safely handles null and undefined by returning Decimal(0)", () => {
      expect(toDecimal(null).toString()).toBe("0");
      expect(toDecimal(undefined).toString()).toBe("0");
    });
  });

  describe("calculateLineItemTotal", () => {
    it("multiplies quantity by unit price with exact decimal precision", () => {
      const total = calculateLineItemTotal(3, "1500.50");
      expect(total.toString()).toBe("4501.5");
    });

    it("defaults invalid/zero quantity to 1", () => {
      const total = calculateLineItemTotal(0, 500);
      expect(total.toString()).toBe("500");
    });
  });

  describe("calculatePaymentBreakdown", () => {
    it("calculates breakdown correctly with government, service, and other fees", () => {
      const breakdown = calculatePaymentBreakdown({
        governmentFee: 10650,
        serviceFee: 5500,
        otherFee: 350,
        tax: 880,
        discount: 1000,
        amountPaid: 5000,
      });

      expect(breakdown.governmentFee.toString()).toBe("10650");
      expect(breakdown.serviceFee.toString()).toBe("5500");
      expect(breakdown.otherFee.toString()).toBe("350");
      expect(breakdown.subtotal.toString()).toBe("16500"); // 10650 + 5500 + 350
      expect(breakdown.discount.toString()).toBe("1000");
      expect(breakdown.tax.toString()).toBe("880");
      // totalAmount = 16500 + 880 - 1000 = 16380
      expect(breakdown.totalAmount.toString()).toBe("16380");
      // amountDue = 16380 - 5000 = 11380
      expect(breakdown.amountDue.toString()).toBe("11380");
    });

    it("handles full payment and overpayment safely without negative dues", () => {
      const breakdown = calculatePaymentBreakdown({
        governmentFee: 1000,
        serviceFee: 2000,
        amountPaid: 4000,
      });

      expect(breakdown.totalAmount.toString()).toBe("3000");
      expect(breakdown.amountDue.toString()).toBe("0");
    });

    it("prevents negative total when discount exceeds subtotal", () => {
      const breakdown = calculatePaymentBreakdown({
        governmentFee: 500,
        serviceFee: 500,
        discount: 2000,
        amountPaid: 0,
      });

      expect(breakdown.totalAmount.toString()).toBe("0");
      expect(breakdown.amountDue.toString()).toBe("0");
    });
  });

  describe("calculateInvoiceTotals", () => {
    it("accurately sums multi-item invoice lines with exact categories", () => {
      const totals = calculateInvoiceTotals({
        lineItems: [
          {
            quantity: 1,
            unitAmount: "10650.00",
            category: "GOVERNMENT_FEE",
            isGovernmentFee: true,
          },
          {
            quantity: 2,
            unitAmount: "2500.00",
            category: "SERVICE_FEE",
            isGovernmentFee: false,
          },
          {
            quantity: 1,
            unitAmount: "350.00",
            category: "DISBURSEMENT",
            isGovernmentFee: false,
          },
        ],
        tax: "800.00",
        discount: "500.00",
        amountPaid: "10000.00",
      });

      expect(totals.governmentFee.toString()).toBe("10650");
      expect(totals.serviceFee.toString()).toBe("5000"); // 2 * 2500
      expect(totals.otherFee.toString()).toBe("350");
      expect(totals.subtotal.toString()).toBe("16000"); // 10650 + 5000 + 350
      expect(totals.tax.toString()).toBe("800");
      expect(totals.discount.toString()).toBe("500");
      // totalAmount = 16000 + 800 - 500 = 16300
      expect(totals.totalAmount.toString()).toBe("16300");
      // amountDue = 16300 - 10000 = 6300
      expect(totals.amountDue.toString()).toBe("6300");
    });

    it("handles zero items safely", () => {
      const totals = calculateInvoiceTotals({ lineItems: [] });
      expect(totals.subtotal.toString()).toBe("0");
      expect(totals.totalAmount.toString()).toBe("0");
      expect(totals.amountDue.toString()).toBe("0");
    });
  });

  describe("formatKes", () => {
    it("formats currency to Kenyan Shillings string with commas and decimals", () => {
      expect(formatKes(15000)).toBe("KES 15,000.00");
      expect(formatKes(new Prisma.Decimal(1250050.75))).toBe("KES 1,250,050.75");
      expect(formatKes(0)).toBe("KES 0.00");
      expect(formatKes("99.9")).toBe("KES 99.90");
    });
  });
});

