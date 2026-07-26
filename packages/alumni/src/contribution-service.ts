import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Contribution,
  type RecordContributionParams,
  recordContribution,
} from "./contribution";
import { contributionRecorded } from "./alumni-events";
import { AlumniProfileNotFoundError } from "./errors";
import type { AlumniProfileRepository, ContributionRepository } from "./ports";

/** The record input — the organization is derived from the alumni profile, not supplied. */
export type RecordContributionInput = Omit<RecordContributionParams, "organizationId">;

export interface ContributionServiceDeps {
  readonly repository: ContributionRepository;
  readonly profiles: AlumniProfileRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for contributions — the append-only giving log. Records a contribution (validating the
 * alumni profile exists and deriving the organization from it), and publishes the recorded event. Contributions
 * are immutable and carry **no money** — the amount is Finance's (P2-D14) — so there is no update or delete.
 */
export class ContributionService {
  private readonly repository: ContributionRepository;
  private readonly profiles: AlumniProfileRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ContributionServiceDeps) {
    this.repository = deps.repository;
    this.profiles = deps.profiles;
    this.events = deps.events;
  }

  async record(input: RecordContributionInput): Promise<Contribution> {
    const profile = await this.profiles.findById(input.tenantId, input.alumniProfileId);
    if (!profile) {
      throw new AlumniProfileNotFoundError(input.alumniProfileId);
    }
    const contribution = recordContribution({
      ...input,
      organizationId: profile.organizationId,
    });
    await this.repository.save(contribution);
    await this.emit(contributionRecorded(contribution));
    return contribution;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Contribution | null> {
    return this.repository.findById(tenantId, id);
  }

  async listForAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<Contribution[]> {
    return this.repository.listByAlumnus(tenantId, alumniProfileId);
  }

  async countForAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return this.repository.countByAlumnus(tenantId, alumniProfileId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
