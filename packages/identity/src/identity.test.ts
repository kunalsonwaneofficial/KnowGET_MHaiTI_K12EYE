import type { ISODateString } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { setCredential, verifyCredential } from "./credential";
import {
  activateIdentity,
  clearFailedAttempts,
  createIdentity,
  isLockedOut,
  lockIdentity,
  recordFailedAttempt,
} from "./identity";
import { InMemoryIdentityRepository } from "./identity-repository";

describe("identity lifecycle", () => {
  it("creates a pending identity and activates it", () => {
    const identity = createIdentity({ identifiers: [{ type: "email", value: "a@b.com" }] });
    expect(identity.status).toBe("pending");
    expect(activateIdentity(identity).status).toBe("active");
  });

  it("tracks failed attempts, locks, and clears", () => {
    let identity = createIdentity({ identifiers: [{ type: "username", value: "u" }] });
    identity = recordFailedAttempt(recordFailedAttempt(identity));
    expect(identity.failedLoginAttempts).toBe(2);

    identity = lockIdentity(identity, "2999-01-01T00:00:00.000Z" as ISODateString);
    expect(isLockedOut(identity, "2026-01-01T00:00:00.000Z" as ISODateString)).toBe(true);

    identity = clearFailedAttempts(identity);
    expect(identity.failedLoginAttempts).toBe(0);
    expect(identity.status).toBe("active");
  });
});

describe("credentials", () => {
  it("sets and verifies passwords", () => {
    const hash = setCredential("Str0ng!Passphrase");
    expect(verifyCredential("Str0ng!Passphrase", hash)).toBe(true);
    expect(verifyCredential("wrong", hash)).toBe(false);
    expect(verifyCredential("x", null)).toBe(false);
  });
});

describe("InMemoryIdentityRepository", () => {
  it("finds by id and identifier", async () => {
    const repo = new InMemoryIdentityRepository();
    const identity = createIdentity({ identifiers: [{ type: "email", value: "x@y.com" }] });
    await repo.save(identity);
    expect((await repo.findById(identity.id))?.id).toBe(identity.id);
    expect((await repo.findByIdentifier("email", "x@y.com"))?.id).toBe(identity.id);
    expect(await repo.findByIdentifier("email", "none@y.com")).toBeNull();
  });
});
