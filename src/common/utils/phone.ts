import { ValidationError } from "../errors/app-error.js";

/**
 * Normalizes and validates a Kenyan Safaricom/mobile phone number into standard format (2547XXXXXXXX or 2541XXXXXXXX).
 * Supported inputs:
 *  - "0712345678" -> "254712345678"
 *  - "712345678" -> "254712345678"
 *  - "+254712345678" -> "254712345678"
 *  - "254712345678" -> "254712345678"
 *  - "0112345678" -> "254112345678"
 */
export function normalizeKenyanPhone(phone: string): string {
  if (!phone || typeof phone !== "string") {
    throw new ValidationError("Phone number is required");
  }

  // Remove whitespace and any formatting characters except leading '+'
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, "");

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Check if non-numeric characters exist
  if (!/^\d+$/.test(cleaned)) {
    throw new ValidationError("Phone number must contain only numeric digits after normalization");
  }

  // Format 1: "0712345678" or "0112345678" (10 digits starting with 0)
  if (cleaned.length === 10 && cleaned.startsWith("0")) {
    cleaned = `254${cleaned.substring(1)}`;
  }
  // Format 2: "712345678" or "112345678" (9 digits starting with 7 or 1)
  else if (cleaned.length === 9 && (cleaned.startsWith("7") || cleaned.startsWith("1"))) {
    cleaned = `254${cleaned}`;
  }

  // Validation check: Must be 12 digits long starting with 2547 or 2541
  if (cleaned.length !== 12) {
    throw new ValidationError(`Invalid phone number length (${cleaned.length} digits). Expected 10 digits (e.g. 0712345678) or 12 digits (e.g. 254712345678).`);
  }

  if (!cleaned.startsWith("2547") && !cleaned.startsWith("2541")) {
    throw new ValidationError("Invalid Kenyan mobile number prefix. Must begin with 07, 01, +2547, or +2541.");
  }

  return cleaned;
}
