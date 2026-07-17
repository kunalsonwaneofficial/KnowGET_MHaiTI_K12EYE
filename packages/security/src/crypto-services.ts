import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** Hash a password with salted scrypt. Returns a self-describing string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** Verify a password against a stored scrypt hash, in constant time. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) {
    return false;
  }
  const derived = scryptSync(password, salt, expected.length, { N: n, r, p });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Cryptographically secure random token (base64url). */
export function secureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Generate a random 32-byte key (AES-256 / HMAC). */
export function generateKey(): Buffer {
  return randomBytes(32);
}

/** Encrypt UTF-8 plaintext with AES-256-GCM. Output: `iv.tag.ciphertext` (base64). */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/** Decrypt a value produced by {@link encrypt}. */
export function decrypt(ciphertext: string, key: Buffer): string {
  const [ivB, tagB, encB] = ciphertext.split(".");
  if (!ivB || !tagB || !encB) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** HMAC-SHA256 signature (base64url). */
export function hmacSign(data: string, key: Buffer): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/** Verify an HMAC-SHA256 signature in constant time. */
export function hmacVerify(data: string, signature: string, key: Buffer): boolean {
  const expected = Buffer.from(hmacSign(data, key));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
