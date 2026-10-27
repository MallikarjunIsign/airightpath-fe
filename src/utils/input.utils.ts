/** Strips non-digit characters and caps length. Use for phone/OTP-style inputs. */
export function digitsOnly(value: string, maxLength = 10): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}
