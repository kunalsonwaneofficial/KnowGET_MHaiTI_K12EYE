import { nowIso, toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import {
  CannotModifyIdentityAccountError,
  DuplicateIdentifierError,
  InvalidIdentityStatusTransitionError,
} from "./errors";
import {
  addAccountIdentifier,
  archiveAccount,
  changeCredentialHash,
  clearFailedAttempts,
  disableAccount,
  isLockedOut,
  lockAccount,
  provisionIdentityAccount,
  recordFailedAttempt,
  removeAccountIdentifier,
  suspendAccount,
  transitionAccountStatus,
  activateAccount,
} from "./identity-account";
import { identifierKey } from "./identifier";
import type { LoginIdentifier } from "./identifier";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const PERSON = "22222222-2222-2222-2222-222222222222" as Uuid;
const email: LoginIdentifier = { type: "email", value: "Ada@School.edu" };

const provision = (identifiers: readonly LoginIdentifier[] = [email]) =>
  provisionIdentityAccount({ tenantId: TENANT, personId: PERSON, identifiers });

describe("identity account — provisioning", () => {
  it("provisions a pending account linked to a person", () => {
    const account = provision();
    expect(account.status).toBe("pending");
    expect(account.personId).toBe(PERSON);
    expect(account.tenantId).toBe(TENANT);
    expect(account.credentialHash).toBeNull();
    expect(account.failedLoginAttempts).toBe(0);
  });

  it("requires at least one identifier", () => {
    expect(() => provision([])).toThrow(CannotModifyIdentityAccountError);
  });

  it("rejects normalized-duplicate identifiers", () => {
    expect(() => provision([email, { type: "email", value: "ada@school.edu" }])).toThrow(
      DuplicateIdentifierError,
    );
  });
});

describe("identifier normalization", () => {
  it("compares emails case-insensitively", () => {
    expect(identifierKey({ type: "email", value: "A@B.com" })).toBe(
      identifierKey({ type: "email", value: "a@b.com" }),
    );
  });

  it("normalizes mobile numbers to digits (keeping a leading +)", () => {
    expect(identifierKey({ type: "mobile", value: "+1 (415) 555-0100" })).toBe(
      "mobile:+14155550100",
    );
  });
});

describe("identity account — lifecycle", () => {
  it("activates a pending account", () => {
    expect(activateAccount(provision()).status).toBe("active");
  });

  it("suspends and reactivates", () => {
    const suspended = suspendAccount(activateAccount(provision()));
    expect(suspended.status).toBe("suspended");
    expect(activateAccount(suspended).status).toBe("active");
  });

  it("rejects illegal transitions", () => {
    const archived = archiveAccount(provision());
    expect(() => transitionAccountStatus(archived, "active")).toThrow(
      InvalidIdentityStatusTransitionError,
    );
  });

  it("never enters locked administratively", () => {
    expect(() => transitionAccountStatus(activateAccount(provision()), "locked")).toThrow(
      InvalidIdentityStatusTransitionError,
    );
  });

  it("re-enables a disabled account", () => {
    const disabled = disableAccount(activateAccount(provision()));
    expect(disabled.status).toBe("disabled");
    expect(activateAccount(disabled).status).toBe("active");
  });
});

describe("identity account — identifiers", () => {
  it("adds a new identifier and rejects a duplicate", () => {
    const withMobile = addAccountIdentifier(provision(), { type: "mobile", value: "+14155550100" });
    expect(withMobile.identifiers).toHaveLength(2);
    expect(() =>
      addAccountIdentifier(withMobile, { type: "email", value: "ADA@school.edu" }),
    ).toThrow(DuplicateIdentifierError);
  });

  it("removes an identifier but keeps at least one", () => {
    const two = addAccountIdentifier(provision(), { type: "username", value: "ada" });
    const one = removeAccountIdentifier(two, { type: "username", value: "ada" });
    expect(one.identifiers).toHaveLength(1);
    expect(() => removeAccountIdentifier(one, email)).toThrow(CannotModifyIdentityAccountError);
  });

  it("is a no-op when removing an identifier the account does not have", () => {
    const account = provision();
    expect(removeAccountIdentifier(account, { type: "username", value: "nobody" })).toBe(account);
  });
});

describe("identity account — credentials & lockout", () => {
  it("sets a credential hash", () => {
    expect(changeCredentialHash(provision(), "hash").credentialHash).toBe("hash");
  });

  it("records failed attempts and reports lockout windows", () => {
    const attempted = recordFailedAttempt(recordFailedAttempt(provision()));
    expect(attempted.failedLoginAttempts).toBe(2);

    const future = toIso(new Date(Date.now() + 60_000));
    const locked = lockAccount(attempted, future);
    expect(locked.status).toBe("locked");
    expect(isLockedOut(locked, nowIso())).toBe(true);

    const past = toIso(new Date(Date.now() - 1_000));
    expect(isLockedOut(lockAccount(attempted, past), nowIso())).toBe(false);
  });

  it("clears attempts and unlocks a locked account", () => {
    const locked = lockAccount(
      recordFailedAttempt(provision()),
      toIso(new Date(Date.now() + 1_000)),
    );
    const cleared = clearFailedAttempts(locked);
    expect(cleared.status).toBe("active");
    expect(cleared.failedLoginAttempts).toBe(0);
    expect(cleared.lockedUntil).toBeNull();
  });
});
