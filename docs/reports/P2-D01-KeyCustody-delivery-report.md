# Engineering Delivery Report — KMS Key Custody & Token-Signer Seam (closes TD-11)

**Live security wiring** · Phase 2 · Program A (Identity & Organization) · post-certification hardening

|                |                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Contract**   | TD-11 — signing-key custody (HSM/KMS behind `KeyRing`/`SecretsProvider`)                                     |
| **Status**     | 🔄 Implemented; verification green in-sandbox (149 API tests). CI pending on the feature branch (pre-merge). |
| **Depends on** | P1-M04 (`KeyRing`, crypto services, `signJwt`), ADR-0015/0016 (persisted auth)                               |
| **Scope**      | Envelope key custody + async token-signer seam (HMAC active, RS256 ready), **env-gated**. Closes TD-11.      |
| **Date**       | 18 July 2026                                                                                                 |

---

## 1. Mission recap

The JWT signing key came from `SECURITY_JWT_SECRET` — plaintext in the environment —
into an in-memory `KeyRing`, signed via the frozen HS256 `signJwt`, and the guard
verified with the single current key. TD-11 asks for HSM/KMS custody behind the
frozen `KeyRing`/`SecretsProvider` ports. This milestone delivers envelope key
custody and an async token-signer seam, env-gated with the in-memory/plaintext
default unchanged — the established hardening pattern.

## 2. What was engineered

| Piece                         | Delivered                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Envelope custody (KMS)**    | `KmsClient` port (`wrap`/`unwrap`) + `LocalKmsClient` (AES-256-GCM under a KEK). `SECURITY_KEY_CUSTODY=envelope` unwraps a wrapped signing key at boot to seed the `KeyRing` |
| **Token-signer seam**         | `TokenSigner` async port; `HmacTokenSigner` (active) composes the frozen `signJwt`/`verifyJwt`, signing with the current key and **verifying across retained versions**      |
| **Asymmetric signer (ready)** | `KmsSigner` port + `LocalKmsSigner` (in-process RSA-2048 double) + `AsymmetricTokenSigner` (RS256) — private key stays in the KMS; verification is local via the public key  |
| **Wiring**                    | `TOKEN_SIGNER` provider (HMAC over the `KeyRing`); the persisted authenticator issues access tokens through it; envelope unwrap runs in `buildSecurityGraph`                 |

## 3. How it works

- **Envelope custody:** a KEK (from `SECURITY_KMS_MASTER_KEY`) wraps the signing key;
  `SECURITY_JWT_KEY_WRAPPED` holds the ciphertext. At boot the `KmsClient` unwraps it
  and seeds the `KeyRing`, so signer, guard and the frozen engine all use the
  custodied material with no change. Default `plaintext` mode is untouched.
- **Signer seam:** token issuance runs through `TokenSigner`. The HMAC default keeps
  HS256 but adds multi-version verification (rotation overlap). The asymmetric RS256
  signer delegates signing to a `KmsSigner` so the private key never leaves the
  device; it is built and tested but not the active signer.
- **Fail-closed:** envelope mode refuses to boot without both the KEK and the wrapped
  key; plaintext mode still requires `SECURITY_JWT_SECRET` in production.

## 4. Verification

- **In-sandbox (green): 149 API tests** (130 prior, **19 new**) — the envelope KMS
  (wrap/unwrap round-trip, wrong-KEK and tamper rejection, KEK length), key custody
  (provision → unwrap → `KeyRing`; wrapped blob hides the material), the HMAC signer
  (sign/verify, **cross-rotation verify**, foreign-key and malformed rejection,
  expiry), the RS256 asymmetric signer (sign/verify, public-key mismatch, tampered
  payload, expiry/issuer, public-key-only exposure), and `buildSecurityGraph` booting
  in both custody modes (envelope fails closed without its inputs).
- **No regression:** all prior security specs (guard, persisted authenticator,
  session enforcer, refresh rotation) stay green with issuance routed through the
  signer seam.
- **Typecheck / lint / format:** apps/api `tsc --noEmit` clean against the generated
  client (generated offline via the WASM schema parser); ESLint 0 warnings; Prettier
  clean. No schema change, so no migration.

## 5. Decisions

Recorded in **ADR-0019**. In brief: envelope key custody (`KmsClient` wrap/unwrap,
`LocalKmsClient` default) unwraps a KMS-wrapped signing key at boot; an async
`TokenSigner` seam carries issuance (HMAC active, multi-version verify); an RS256
`AsymmetricTokenSigner` over a `KmsSigner` port is ready behind the seam; env-gated
(`SECURITY_KEY_CUSTODY`) with the plaintext default unchanged; no frozen change.

## 6. Technical debt

- **TD-11 — resolved.** The signing key is KMS-custodiable (never plaintext at rest),
  issuance runs through a signer seam, verify is multi-version, and both symmetric and
  asymmetric custody sit behind ports — env-gated, default unchanged.
- **Noted / future drop-ins:** `LocalKmsClient`'s KEK is itself env-sourced, so
  envelope mode moves the plaintext-at-rest concern from the signing key to the KEK;
  a real **cloud-KMS/HSM adapter** (AWS KMS, GCP KMS, Azure Key Vault, PKCS#11) behind
  `KmsClient`/`KmsSigner` moves the root of trust into hardware and activates the RS256
  path. `SecretsProvider` remains env-backed (the same KMS adapter can source secrets).

## 7. Recommendation

Set `SECURITY_KEY_CUSTODY=envelope` with a wrapped key + KEK in production to stop
storing the signing key in plaintext; leave it `plaintext` for local/dev. Prioritize a
cloud-KMS `KmsClient` adapter (KEK in hardware) and, when asymmetric custody is
wanted, activate `AsymmetricTokenSigner` by swapping the `TOKEN_SIGNER` provider and
pointing the guard at its `verify`.
