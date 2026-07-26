import type { TenantId, Uuid } from "@knowget/types";
import { computeComfortIndex } from "./comfort";
import { SpaceNotFoundError } from "./errors";
import type { ComfortAssessment, ComfortThreshold, MetricReadingView } from "./facilities-view";
import type {
  ComfortPolicyRepository,
  EnvironmentReadingRepository,
  SpaceRepository,
} from "./ports";

export interface ComfortAssessmentServiceDeps {
  readonly readings: EnvironmentReadingRepository;
  readonly policies: ComfortPolicyRepository;
  readonly spaces: SpaceRepository;
}

/**
 * The integration spine of the smart-environment side: assess a space's live comfort. It resolves the
 * space's organization, reads its organization's active comfort policy (its per-metric thresholds), pulls
 * the latest reading per metric in the space, and runs the pure comfort engine over the two. When no policy
 * is active, there are no thresholds to breach, so the space reads `comfortable`. A pure read — no events,
 * no writes.
 */
export class ComfortAssessmentService {
  private readonly readings: EnvironmentReadingRepository;
  private readonly policies: ComfortPolicyRepository;
  private readonly spaces: SpaceRepository;

  constructor(deps: ComfortAssessmentServiceDeps) {
    this.readings = deps.readings;
    this.policies = deps.policies;
    this.spaces = deps.spaces;
  }

  async assessSpace(tenantId: TenantId, spaceId: Uuid): Promise<ComfortAssessment> {
    const space = await this.spaces.findById(tenantId, spaceId);
    if (!space) {
      throw new SpaceNotFoundError(spaceId);
    }
    const policy = await this.policies.findActiveByOrganization(tenantId, space.organizationId);
    const thresholds: readonly ComfortThreshold[] = policy?.thresholds ?? [];
    const latest = await this.readings.latestBySpace(tenantId, spaceId);
    const readingViews: readonly MetricReadingView[] = latest.map((r) => ({
      metric: r.metric,
      value: r.value,
    }));
    return computeComfortIndex(readingViews, thresholds);
  }
}
