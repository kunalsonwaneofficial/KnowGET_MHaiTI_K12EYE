import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { CompetencyRatingInput } from "./competency";
import { hasCompetency, isFrameworkActive } from "./competency-framework";
import {
  EmployeeNotFoundForFacultyError,
  FrameworkNotActiveError,
  FrameworkNotFoundError,
  ObservationNotFoundError,
  UnknownCompetencyError,
} from "./errors";
import { observationAcknowledged, observationConducted, observationShared } from "./faculty-events";
import {
  acknowledgeObservation,
  type ConductObservationParams,
  conductObservation,
  type Observation,
  reviseObservation,
  type ScheduleObservationParams,
  scheduleObservation,
  shareObservation,
} from "./observation";
import type {
  CompetencyFrameworkRepository,
  EmployeeDirectory,
  ObservationRepository,
} from "./ports";

/** The service schedule input — the organization is derived from the framework, not supplied. */
export type ScheduleObservationInput = Omit<ScheduleObservationParams, "organizationId">;

export interface ObservationServiceDeps {
  readonly repository: ObservationRepository;
  readonly frameworks: CompetencyFrameworkRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for observations — the classroom/practice evidence artifact. Schedules an
 * observation against an **active** framework (validating the observed employee and observer, and
 * deriving the organization from the framework), records ratings validated against the framework's
 * competencies, and drives the `scheduled → conducted → shared → acknowledged` lifecycle, publishing
 * the observation events.
 */
export class ObservationService {
  private readonly repository: ObservationRepository;
  private readonly frameworks: CompetencyFrameworkRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ObservationServiceDeps) {
    this.repository = deps.repository;
    this.frameworks = deps.frameworks;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async schedule(input: ScheduleObservationInput): Promise<Observation> {
    const framework = await this.frameworks.findById(input.tenantId, input.frameworkId);
    if (!framework) {
      throw new FrameworkNotFoundError(input.frameworkId);
    }
    if (!isFrameworkActive(framework)) {
      throw new FrameworkNotActiveError(framework.id);
    }
    await this.assertEmployeeExists(input.tenantId, input.employeeId);
    await this.assertEmployeeExists(input.tenantId, input.observerId);
    const observation = scheduleObservation({
      ...input,
      organizationId: framework.organizationId,
    });
    await this.repository.save(observation);
    return observation;
  }

  async conduct(
    tenantId: TenantId,
    id: Uuid,
    params: ConductObservationParams,
  ): Promise<Observation> {
    const observation = await this.require(tenantId, id);
    await this.assertRatingsInFramework(tenantId, observation.frameworkId, params.ratings);
    const updated = conductObservation(observation, params);
    await this.repository.save(updated);
    await this.emit(observationConducted(updated));
    return updated;
  }

  async revise(
    tenantId: TenantId,
    id: Uuid,
    params: ConductObservationParams,
  ): Promise<Observation> {
    const observation = await this.require(tenantId, id);
    await this.assertRatingsInFramework(tenantId, observation.frameworkId, params.ratings);
    const updated = reviseObservation(observation, params);
    await this.repository.save(updated);
    return updated;
  }

  async share(tenantId: TenantId, id: Uuid): Promise<Observation> {
    const updated = shareObservation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(observationShared(updated));
    return updated;
  }

  async acknowledge(tenantId: TenantId, id: Uuid): Promise<Observation> {
    const updated = acknowledgeObservation(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(observationAcknowledged(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Observation> {
    return this.require(tenantId, id);
  }

  async listForEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Observation[]> {
    return this.repository.listByEmployee(tenantId, employeeId);
  }

  async listForObserver(tenantId: TenantId, observerId: Uuid): Promise<Observation[]> {
    return this.repository.listByObserver(tenantId, observerId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Observation[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  async list(tenantId: TenantId): Promise<Observation[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async assertEmployeeExists(tenantId: TenantId, employeeId: Uuid): Promise<void> {
    if (!(await this.employees.exists(tenantId, employeeId))) {
      throw new EmployeeNotFoundForFacultyError(employeeId);
    }
  }

  private async assertRatingsInFramework(
    tenantId: TenantId,
    frameworkId: Uuid,
    ratings: readonly CompetencyRatingInput[],
  ): Promise<void> {
    const framework = await this.frameworks.findById(tenantId, frameworkId);
    if (!framework) {
      throw new FrameworkNotFoundError(frameworkId);
    }
    for (const rating of ratings) {
      if (!hasCompetency(framework, rating.competencyKey)) {
        throw new UnknownCompetencyError(rating.competencyKey);
      }
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Observation> {
    const observation = await this.repository.findById(tenantId, id);
    if (!observation) {
      throw new ObservationNotFoundError(id);
    }
    return observation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
