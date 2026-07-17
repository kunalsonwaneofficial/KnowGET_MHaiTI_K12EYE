import { hashPassword, verifyPassword } from "@knowget/security";

/** Hash a plaintext password for storage on an identity. */
export const setCredential = (password: string): string => hashPassword(password);

/** Verify a plaintext password against a stored credential hash. */
export const verifyCredential = (password: string, credentialHash: string | null): boolean =>
  credentialHash !== null && verifyPassword(password, credentialHash);
