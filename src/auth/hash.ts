/**
 * SHA-256 hex, byte-for-byte identical to the hash the legacy app stores in the
 * `users` collection. Only used by the legacy auth mode, which exists so the
 * team can keep working while Firebase Auth accounts are created.
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
