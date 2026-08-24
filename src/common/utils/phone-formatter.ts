/**
 * Centralized Phone Normalization Utility for Kenya
 * Standardizes Kenyan phone numbers to E.164 (+254XXXXXXXXX) format required by Africa's Talking.
 */

export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return "";
  // Remove whitespace, hyphens, parentheses, dots
  return phone.replace(/[\s\-\(\)\.]/g, "").trim();
}

export function formatKenyanPhone(phone: string): string {
  const cleaned = sanitizePhoneNumber(phone);
  if (!cleaned) return "";

  // Already E.164 format with +254
  if (cleaned.startsWith("+254")) {
    return cleaned;
  }

  // Starts with 254 (no plus)
  if (cleaned.startsWith("254")) {
    return `+${cleaned}`;
  }

  // Starts with 07 or 01 (standard local mobile)
  if (cleaned.startsWith("0")) {
    return `+254${cleaned.slice(1)}`;
  }

  // Starts directly with 7 or 1 (9 digits local mobile)
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) {
    return `+254${cleaned}`;
  }

  // International format starting with +
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  return cleaned;
}

export function isValidKenyanPhone(phone: string): boolean {
  const formatted = formatKenyanPhone(phone);
  // Valid Kenyan E.164 format: +254 7XX XXX XXX or +254 1XX XXX XXX (13 chars total)
  return /^\+254[17]\d{8}$/.test(formatted);
}
