import { sha256 } from '@noble/hashes/sha2.js';

/** Same digest in secure contexts and internal HTTP pages without SubtleCrypto. */
export async function browserSha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const digest = subtle
    ? new Uint8Array(await subtle.digest('SHA-256', new Uint8Array(bytes).buffer))
    : sha256(bytes);
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
