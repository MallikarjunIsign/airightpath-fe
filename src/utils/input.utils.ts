/** Strips non-digit characters and caps length. Use for phone/OTP-style inputs. */
export function digitsOnly(value: string, maxLength = 10): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

/**
 * Strips what a person's name cannot contain: digits and symbols. Letters (any alphabet), spaces, apostrophes,
 * hyphens and full stops stay, so "Mary-Jane O'Neil" and "S. Kumar" are left as typed.
 */
export function namesOnly(value: string, maxLength = 50): string {
  return value.replace(/[^\p{L}\p{M}\s'.-]/gu, '').slice(0, maxLength);
}
