import { createEvent } from "@knowget/events";

export const identityCreated = (payload: { identityId: string }) =>
  createEvent("identity.created", payload);

export const identityActivated = (payload: { identityId: string }) =>
  createEvent("identity.activated", payload);

export const identityLocked = (payload: { identityId: string; until: string }) =>
  createEvent("identity.locked", payload);

export const identityCredentialChanged = (payload: { identityId: string }) =>
  createEvent("identity.credential.changed", payload);

export const identityArchived = (payload: { identityId: string }) =>
  createEvent("identity.archived", payload);
