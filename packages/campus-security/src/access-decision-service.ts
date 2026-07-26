import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { evaluateAccess } from "./access";
import { type AccessEvent, recordAccessEvent } from "./access-event";
import { accessRecorded } from "./campus-security-events";
import { AccessCredentialNotFoundError, AccessZoneNotFoundError } from "./errors";
import type {
  AccessCredentialRepository,
  AccessEventRepository,
  AccessZoneRepository,
} from "./ports";

export interface DecideAccessInput {
  readonly tenantId: TenantId;
  readonly credentialId: Uuid;
  readonly zoneId: Uuid;
  readonly pointLabel?: string | null;
  readonly occurredAt: string;
  readonly asOfDate?: string | null;
}

export interface AccessDecisionServiceDeps {
  readonly credentials: AccessCredentialRepository;
  readonly zones: AccessZoneRepository;
  readonly accessEvents: AccessEventRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * The integration spine of the access-control side: decide a credential's access to a zone and record it. It
 * resolves the credential and the zone, runs the pure access engine over them (the credential's status,
 * granted zones and expiry against the zone's status, as of a date — defaulting to the moment it occurred),
 * appends the resulting decision to the immutable access log, and publishes the access-recorded event. The
 * returned {@link AccessEvent} carries the granted/denied decision and its reason.
 */
export class AccessDecisionService {
  private readonly credentials: AccessCredentialRepository;
  private readonly zones: AccessZoneRepository;
  private readonly accessEvents: AccessEventRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AccessDecisionServiceDeps) {
    this.credentials = deps.credentials;
    this.zones = deps.zones;
    this.accessEvents = deps.accessEvents;
    this.events = deps.events;
  }

  async decide(input: DecideAccessInput): Promise<AccessEvent> {
    const credential = await this.credentials.findById(input.tenantId, input.credentialId);
    if (!credential) {
      throw new AccessCredentialNotFoundError(input.credentialId);
    }
    const zone = await this.zones.findById(input.tenantId, input.zoneId);
    if (!zone) {
      throw new AccessZoneNotFoundError(input.zoneId);
    }
    // The engine compares a date-only `expiresOn` against the as-of date; default it to the DATE portion
    // of `occurredAt` (a timestamp) so a credential is not falsely expired on its own expiry day.
    const asOfDate = input.asOfDate ?? input.occurredAt.slice(0, 10);
    const evaluation = evaluateAccess(
      {
        status: credential.status,
        grantedZoneIds: credential.grantedZoneIds,
        expiresOn: credential.expiresOn,
      },
      { id: zone.id, status: zone.status },
      asOfDate,
    );
    const event = recordAccessEvent({
      tenantId: input.tenantId,
      organizationId: zone.organizationId,
      credentialId: input.credentialId,
      zoneId: input.zoneId,
      pointLabel: input.pointLabel ?? null,
      decision: evaluation.decision,
      reason: evaluation.reason,
      occurredAt: input.occurredAt,
    });
    await this.accessEvents.save(event);
    await this.emit(accessRecorded(event));
    return event;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
