import { Prisma } from "@prisma/client";

export interface FeeBreakdown {
  subtotal: Prisma.Decimal;
  governmentFee: Prisma.Decimal;
  serviceFee: Prisma.Decimal;
  otherFee: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  amountDue: Prisma.Decimal;
}

export function toDecimal(value: number | string | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

export function calculateLineItemTotal(
  quantity: number,
  unitAmount: number | string | Prisma.Decimal
): Prisma.Decimal {
  const qty = Math.max(1, Math.floor(quantity));
  const unit = toDecimal(unitAmount);
  return unit.mul(qty);
}

export function calculateInvoiceTotals(params: {
  lineItems: Array<{
    quantity: number;
    unitAmount: number | string | Prisma.Decimal;
    category?: string;
    isGovernmentFee?: boolean;
    isTaxable?: boolean;
  }>;
  discount?: number | string | Prisma.Decimal;
  tax?: number | string | Prisma.Decimal;
  amountPaid?: number | string | Prisma.Decimal;
}): FeeBreakdown {
  let governmentFee = new Prisma.Decimal(0);
  let serviceFee = new Prisma.Decimal(0);
  let otherFee = new Prisma.Decimal(0);
  let subtotal = new Prisma.Decimal(0);

  for (const item of params.lineItems) {
    const itemTotal = calculateLineItemTotal(item.quantity, item.unitAmount);
    subtotal = subtotal.add(itemTotal);

    if (item.isGovernmentFee || item.category === "GOVERNMENT_FEE") {
      governmentFee = governmentFee.add(itemTotal);
    } else if (item.category === "SERVICE_FEE" || item.category === "EXPEDITED_FEE" || item.category === "DOCUMENT_AUTHENTICATION") {
      serviceFee = serviceFee.add(itemTotal);
    } else {
      otherFee = otherFee.add(itemTotal);
    }
  }

  const discount = toDecimal(params.discount);
  const tax = toDecimal(params.tax);
  const amountPaid = toDecimal(params.amountPaid);

  // totalAmount = subtotal + tax - discount
  const totalAmount = subtotal.add(tax).sub(discount);
  const effectiveTotal = totalAmount.lessThan(0) ? new Prisma.Decimal(0) : totalAmount;

  // amountDue = max(0, effectiveTotal - amountPaid)
  const remaining = effectiveTotal.sub(amountPaid);
  const amountDue = remaining.lessThan(0) ? new Prisma.Decimal(0) : remaining;

  return {
    subtotal,
    governmentFee,
    serviceFee,
    otherFee,
    discount,
    tax,
    totalAmount: effectiveTotal,
    amountPaid,
    amountDue,
  };
}

export function calculatePaymentBreakdown(params: {
  governmentFee?: number | string | Prisma.Decimal;
  serviceFee?: number | string | Prisma.Decimal;
  otherFee?: number | string | Prisma.Decimal;
  discount?: number | string | Prisma.Decimal;
  tax?: number | string | Prisma.Decimal;
  amountPaid?: number | string | Prisma.Decimal;
}): FeeBreakdown {
  const governmentFee = toDecimal(params.governmentFee);
  const serviceFee = toDecimal(params.serviceFee);
  const otherFee = toDecimal(params.otherFee);
  const discount = toDecimal(params.discount);
  const tax = toDecimal(params.tax);
  const amountPaid = toDecimal(params.amountPaid);

  // subtotal = governmentFee + serviceFee + otherFee
  const subtotal = governmentFee.add(serviceFee).add(otherFee);
  // totalAmount = subtotal + tax - discount
  const totalAmount = subtotal.add(tax).sub(discount);
  const effectiveTotal = totalAmount.lessThan(0) ? new Prisma.Decimal(0) : totalAmount;

  // amountDue = max(0, totalAmount - amountPaid)
  const remaining = effectiveTotal.sub(amountPaid);
  const amountDue = remaining.lessThan(0) ? new Prisma.Decimal(0) : remaining;

  return {
    subtotal,
    governmentFee,
    serviceFee,
    otherFee,
    discount,
    tax,
    totalAmount: effectiveTotal,
    amountPaid,
    amountDue,
  };
}

export function formatKes(amount: Prisma.Decimal | number | string): string {
  const dec = toDecimal(amount);
  return `KES ${dec.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
