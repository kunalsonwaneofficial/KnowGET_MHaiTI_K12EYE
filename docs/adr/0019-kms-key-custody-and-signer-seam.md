# 19. KMS key custody (envelope) and an async token-signer seam

- **Status:** Accepted
- **Date:** 2026-07-18
- **Contract:** TD-11 — signing-key custody (HSM/KMS behind `KeyRing`/`SecretsProvider`)

## Context

The JWT signing key was taken from `SECURITY_JWT_SECRET` — a **plaintext secret in
the environment** — into an in-memory `KeyRing`, and every token was signed with it
via the frozen HS256 `signJwt` (symmetric HMAC). Two frozen ports were explicitly
designed to absorb this debt: `KeyRing` ("an HSM/KMS provider slots in behind this
API") and `SecretsProvider` ("can supply a KMS/HSM-backed implementation behind this
same interface"). The guard verified with the **single current key**, so a key
rotation would instantly invalidate every outstanding token.

This sandbox (and CI) have no real cloud KMS or HSM, so — as with the Prisma and
object-store adapters — the verifiable default is an in-process double and the real
provider is a drop-in behind the port.

## Decision

All changes are at the composition root (`apps/api/src/platform/security`); no frozen
package changed.

1. **Envelope key custody (`KmsClient`).** A `KmsClient` port with `wrap`/`unwrap`
   models a KMS's Encrypt/Decrypt over a key-encryption-key (KEK). `LocalKmsClient`
   implements it with AES-256-GCM via the frozen crypto services. Under
   `SECURITY_KEY_CUSTODY=envelope`, the signing key is stored **wrapped**
   (`SECURITY_JWT_KEY_WRAPPED`) and unwrapped at boot to seed the `KeyRing`, so it is
   never held in plaintext at rest. `buildSecurityGraph` (already async) performs the
   unwrap; every downstream consumer — signer, guard, frozen engine — uses the
   custodied material transparently. Default stays `plaintext` (`SECURITY_JWT_SECRET`
   or a dev-ephemeral key), unchanged.

2. **Async token-signer seam (`TokenSigner`).** A `TokenSigner` port (`sign`/`verify`)
   sits over token issuance. `HmacTokenSigner` — the active default — composes the
   frozen `signJwt`/`verifyJwt` over the `KeyRing`, signing with the current key and
   **verifying against the current key and any retained prior version**, giving a
   rotation overlap window (resolving the single-current-key limit). The persisted
   authenticator issues access tokens through this port.

3. **Asymmetric signer, ready behind the port.** `AsymmetricTokenSigner` produces and
   verifies RS256 JWTs, delegating the signature to a `KmsSigner` port so the private
   key never leaves the KMS/HSM; verification is local against the public key
   (JWKS-style). `LocalKmsSigner` is an in-process RSA-2048 software-key double that
   makes the asymmetric path fully verifiable in-sandbox. It is **not the active
   signer** — activating it is swapping the `TOKEN_SIGNER` provider and pointing the
   guard at its `verify`; a cloud-KMS `KmsSigner` adapter is the production drop-in.

4. **Env-gated, fail-closed.** `SECURITY_KEY_CUSTODY=envelope` requires both
   `SECURITY_KMS_MASTER_KEY` (a base64 32-byte KEK) and `SECURITY_JWT_KEY_WRAPPED`, or
   boot is refused. The plaintext path keeps its existing production guard
   (`SECURITY_JWT_SECRET` required in production).

## Consequences

- **TD-11 resolved (capability + ports).** The signing key can be KMS-custodied
  (never in plaintext at rest), token issuance runs through a signer seam, verify is
  multi-version, and both symmetric and asymmetric custody sit behind ports. Default
  behavior is unchanged.
- A multi-instance deployment sharing one wrapped key + one KEK derives an identical
  `KeyRing` on every replica; rotation is possible with an overlap window.
- **Root-of-trust note.** `LocalKmsClient`'s KEK is itself sourced from a secret, so
  envelope mode moves the plaintext-at-rest problem from the signing key to the KEK.
  Moving the root of trust into hardware is exactly the drop-in the `KmsClient` /
  `KmsSigner` ports exist for: an AWS KMS / GCP KMS / Azure Key Vault / PKCS#11 HSM
  adapter, where wrap/unwrap and sign are device calls and no key leaves the module.
- No frozen code changed; the sync `signJwt`/`verifyJwt` and `KeyRing` are composed
  behind async app-level seams (the established pattern).
