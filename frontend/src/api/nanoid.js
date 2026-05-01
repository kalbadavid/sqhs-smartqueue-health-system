const ALPHA = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';
export function nanoid(n = 6) {
  let out = '';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < n; i++) out += ALPHA[bytes[i] % ALPHA.length];
  return out;
}
