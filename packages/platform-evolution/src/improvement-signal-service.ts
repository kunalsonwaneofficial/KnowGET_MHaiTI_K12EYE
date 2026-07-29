import type { EventBus } from "@knowget/events";
import { isUuid, toUuid } from "@knowget/shared";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSignalKeyError,
  EvidenceRecordNotFoundError,
  ImprovementSignalNotFoundError,
  OrganizationNotFoundForEvolutionError,
  PersonNotFoundForEvolutionError,
} from "./errors";
import {
  signalAccepted,
  signalCorroborated,
  signalDeclined,
  signalMerged,
  signalRaised,
  signalRestated,
  signalTriaged,
} from "./evolution-events";
import { normalizeKey } from "./evolution-value";
import type { EvidenceCitation, SignalAccount } from "./evolution-view";
import {
  type ImprovementSignal,
  type RaiseSignalParams,
  acceptSignal,
  corroborateSignal,
  declineSignal,
  mergeSignal,
  raiseSignal,
  reviseSignalSummary,
  triageSignal,
} from "./improvement-signal";
import type {
  EvidenceRecordDirectory,
  ImprovementSignalRepository,
  OrganizationDirectory,
  PersonDirectory,
} from "./ports";

/**
 * Application service for improvement signals — the queue of everything the institution has been told is not
 * working.
 *
 * Four rules live here because none of them is decidable from a single signal in hand.
 *
 * **The key is free.** A signal key is how recurrence is answered: a problem raised again three years later
 * arrives at a key that is already taken, and the settled signal wearing it carries what the institution decided
 * last time. Two signals under one key would destroy exactly that, so the check runs tenant-wide and includes
 * settled signals, whose keys stay taken permanently. The aggregate cannot do this — it holds one signal and has
 * no directory of the others — and a uniqueness check invented inside it would be a second opinion about what
 * exists.
 *
 * **The citations resolve.** A signal must stand on evidence, and evidence is worth what its references
 * resolving is worth. The walk happens as the signal is raised, while the person filing still knows what they
 * meant to point at, rather than two years later when a reader following the citation arrives nowhere — by which
 * time the signal has been triaged, accepted, and built into a change whose justification now traces to an empty
 * reference.
 *
 * **The people are real.** Whoever raised it, whoever corroborated it, whoever triaged or disposed of it. A
 * `null` actor is permitted throughout and is checked against nothing, because anonymity is a legitimate way to
 * report something the reporter cannot safely put their name to; an identifier that resolves to nobody is a
 * different thing entirely, and it is the one that makes a queue look attended when it is not.
 *
 * **A merge points at a signal that exists.** The aggregate refuses a self-merge, which is decidable in hand,
 * and stops there. Whether the target is real needs the store, and a signal folded into nothing is worse than an
 * open one: it leaves the queue while the problem it described arrives nowhere.
 *
 * Order in {@link ImprovementSignalService.raise} is deliberate. The aggregate is built **first**, so a
 * malformed request — an unusable summary, a citation set the intake engine rejects — is refused without
 * touching the store at all. Then the organization, then the key, which is one lookup and makes every remaining
 * check moot when it fails. The citation walk is last because it is the only check whose cost scales with the
 * request.
 */
export interface ImprovementSignalServiceDeps {
  readonly repository: ImprovementSignalRepository;
  readonly organizations: OrganizationDirectory;
  readonly people: PersonDirectory;
  readonly evidence: EvidenceRecordDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class ImprovementSignalService {
  private readonly repository: ImprovementSignalRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly people: PersonDirectory;
  private readonly evidence: EvidenceRecordDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ImprovementSignalServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.people = deps.people;
    this.evidence = deps.evidence;
    this.events = deps.events;
  }

  // --- Raising ---------------------------------------------------------------------

  /** Say that something is not working, and show the records that say so. */
  async raise(params: RaiseSignalParams): Promise<ImprovementSignal> {
    const signal = raiseSignal(params);
    await this.requireOrganization(params.tenantId, params.organizationId);
    await this.requireKeyFree(params.tenantId, signal.signalKey);
    await this.requireActor(params.tenantId, params.raisedBy, "person raising the signal");
    await this.requireCitations(params.tenantId, signal.citations);
    await this.repository.save(signal);
    await this.emit(signalRaised(signal));
    return signal;
  }

  /** Restate what the signal is about. Permitted right up to disposal, and never after it. */
  async restate(tenantId: TenantId, id: Uuid, summary: string): Promise<ImprovementSignal> {
    return this.transition(tenantId, id, reviseSignalSummary, signalRestated, summary);
  }

  /**
   * Add another person's account of the same problem, and let the priority follow.
   *
   * An account carries its raiser as an opaque string because an anonymous one carries the empty string, so the
   * directory is only asked about accounts that name somebody. A malformed identifier is refused as a person who
   * does not exist rather than being passed to whatever store backs the directory.
   */
  async corroborate(
    tenantId: TenantId,
    id: Uuid,
    account: SignalAccount,
  ): Promise<ImprovementSignal> {
    await this.requireAccountHolder(tenantId, account.raisedBy);
    return this.transition(tenantId, id, corroborateSignal, signalCorroborated, account);
  }

  // --- Disposal --------------------------------------------------------------------

  /** Record that somebody has read this and judged it. The only route to any of the three disposals. */
  async triage(tenantId: TenantId, id: Uuid, actor: Uuid | null): Promise<ImprovementSignal> {
    await this.requireActor(tenantId, actor, "person triaging the signal");
    return this.transition(tenantId, id, triageSignal, signalTriaged, actor);
  }

  /** Agree this is a problem worth addressing. Terminal here; what follows is an initiative. */
  async accept(tenantId: TenantId, id: Uuid, actor: Uuid | null): Promise<ImprovementSignal> {
    await this.requireActor(tenantId, actor, "person accepting the signal");
    return this.transition(tenantId, id, acceptSignal, signalAccepted, actor);
  }

  /**
   * Fold the signal into another one describing the same problem.
   *
   * The target is loaded rather than merely referenced, and it is loaded in this tenant, so a merge cannot point
   * across a tenant boundary at a signal the caller could not otherwise see.
   */
  async merge(
    tenantId: TenantId,
    id: Uuid,
    mergedIntoSignalId: Uuid,
    actor: Uuid | null,
  ): Promise<ImprovementSignal> {
    await this.requireActor(tenantId, actor, "person merging the signal");
    if (!(await this.repository.findById(tenantId, mergedIntoSignalId))) {
      throw new ImprovementSignalNotFoundError(mergedIntoSignalId);
    }
    return this.transition(tenantId, id, mergeSignal, signalMerged, mergedIntoSignalId, actor);
  }

  /** Decline it, with the reason that makes the decline legible to whoever raises it again. */
  async decline(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null,
    reason: string,
  ): Promise<ImprovementSignal> {
    await this.requireActor(tenantId, actor, "person declining the signal");
    return this.transition(tenantId, id, declineSignal, signalDeclined, actor, reason);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One signal, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<ImprovementSignal> {
    return this.require(tenantId, id);
  }

  /**
   * One signal by the key recurrence is answered under, or a 404.
   *
   * The key is normalized before the lookup and the refusal names the normalized form, so a caller who typed a
   * stray capital is told which key was actually searched for rather than the one they sent.
   */
  async getByKey(tenantId: TenantId, signalKey: string): Promise<ImprovementSignal> {
    const wanted = normalizeKey(signalKey);
    const signal = await this.repository.findByKey(tenantId, wanted);
    if (!signal) {
      throw new ImprovementSignalNotFoundError(wanted);
    }
    return signal;
  }

  /** The improvement queue itself — everything raised or triaged and not yet disposed of. */
  async listOpen(tenantId: TenantId, organizationId: Uuid): Promise<readonly ImprovementSignal[]> {
    return this.repository.listOpen(tenantId, organizationId);
  }

  /** Every signal in the tenant, settled ones included. */
  async list(tenantId: TenantId): Promise<readonly ImprovementSignal[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The signal under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<ImprovementSignal> {
    const signal = await this.repository.findById(tenantId, id);
    if (!signal) {
      throw new ImprovementSignalNotFoundError(id);
    }
    return signal;
  }

  /** The institution this signal hangs off, checked through the directory port. */
  private async requireOrganization(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForEvolutionError(organizationId);
    }
  }

  /**
   * No other signal already answers to this key.
   *
   * Tenant-wide rather than per organization, and settled signals count. A key whose signal was declined last
   * year is exactly the key the institution needs to collide with when the same problem is raised again.
   */
  private async requireKeyFree(tenantId: TenantId, signalKey: string): Promise<void> {
    if (await this.repository.findByKey(tenantId, signalKey)) {
      throw new DuplicateSignalKeyError(signalKey);
    }
  }

  /** An actor, when one is named. `null` is anonymous, which this contract permits everywhere. */
  private async requireActor(
    tenantId: TenantId,
    personId: Uuid | null,
    role: string,
  ): Promise<void> {
    if (personId === null) return;
    await this.requirePerson(tenantId, personId, role);
  }

  /** The person on a corroborating account, which arrives as an opaque string and may be empty. */
  private async requireAccountHolder(tenantId: TenantId, raisedBy: string): Promise<void> {
    const holder = raisedBy.trim();
    if (holder.length === 0) return;
    if (!isUuid(holder)) {
      throw new PersonNotFoundForEvolutionError(holder, "person corroborating the signal");
    }
    await this.requirePerson(tenantId, toUuid(holder), "person corroborating the signal");
  }

  /** One person, checked against the directory. */
  private async requirePerson(tenantId: TenantId, personId: Uuid, role: string): Promise<void> {
    if (!(await this.people.exists(tenantId, personId))) {
      throw new PersonNotFoundForEvolutionError(personId, role);
    }
  }

  /**
   * Every cited record resolves.
   *
   * Sequential rather than concurrent, and the first unresolved citation is the refusal. A signal with four
   * broken references is fixed the same way as one with a single broken reference — by the person filing it
   * going and finding what they meant — and reporting all four costs four round trips on every successful raise
   * to save round trips on failing ones.
   */
  private async requireCitations(
    tenantId: TenantId,
    citations: readonly EvidenceCitation[],
  ): Promise<void> {
    for (const citation of citations) {
      if (!(await this.evidence.exists(tenantId, citation))) {
        throw new EvidenceRecordNotFoundError(
          citation.kind,
          citation.sourceDomain,
          citation.sourceRef,
        );
      }
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (signal: ImprovementSignal, ...args: TArgs) => ImprovementSignal,
    announce: (signal: ImprovementSignal) => DomainEvent,
    ...args: TArgs
  ): Promise<ImprovementSignal> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
