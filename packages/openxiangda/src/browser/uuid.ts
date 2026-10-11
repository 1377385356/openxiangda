/**
 * Creates a UUID in browser contexts, including private HTTP deployments where
 * the Web Crypto randomUUID convenience method is unavailable. getRandomValues
 * remains available in those contexts and provides the entropy required here.
 */
export function createBrowserUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues !== 'function') {
    throw new Error('OPENXIANGDA_BROWSER_CRYPTO_UNAVAILABLE');
  }
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
