import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateActiveSensorError,
  DuplicateSensorCodeError,
  SensorNotFoundError,
  SpaceNotFoundError,
} from "./errors";
import {
  sensorDeactivated,
  sensorInstalled,
  sensorReactivated,
  sensorRetired,
  sensorUnitSet,
} from "./facilities-events";
import type { SensorRepository, SpaceRepository } from "./ports";
import {
  deactivateSensor,
  type InstallSensorParams,
  installSensor,
  reactivateSensor,
  retireSensor,
  type Sensor,
  setSensorUnit,
} from "./sensor";

/** The install input — the organization and building are derived from the space, not supplied. */
export type InstallSensorInput = Omit<InstallSensorParams, "organizationId" | "buildingId">;

export interface SensorServiceDeps {
  readonly repository: SensorRepository;
  readonly spaces: SpaceRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for sensors — smart-environment devices installed in a space. Installs a sensor
 * (deriving org and building from the space, enforcing a code unique within the tenant and at most one
 * active sensor per space+metric), edits its unit, and drives the `active ↔ inactive → retired` lifecycle,
 * publishing the sensor events. Readings from active sensors feed the pure comfort engine.
 */
export class SensorService {
  private readonly repository: SensorRepository;
  private readonly spaces: SpaceRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: SensorServiceDeps) {
    this.repository = deps.repository;
    this.spaces = deps.spaces;
    this.events = deps.events;
  }

  async install(input: InstallSensorInput): Promise<Sensor> {
    const space = await this.spaces.findById(input.tenantId, input.spaceId);
    if (!space) {
      throw new SpaceNotFoundError(input.spaceId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateSensorCodeError(input.code.trim());
    }
    if (
      await this.repository.findActiveBySpaceAndMetric(input.tenantId, input.spaceId, input.metric)
    ) {
      throw new DuplicateActiveSensorError(input.spaceId, input.metric);
    }
    const sensor = installSensor({
      ...input,
      organizationId: space.organizationId,
      buildingId: space.buildingId,
    });
    await this.repository.save(sensor);
    await this.emit(sensorInstalled(sensor));
    return sensor;
  }

  async setUnit(tenantId: TenantId, id: Uuid, unit: string | null): Promise<Sensor> {
    const updated = setSensorUnit(await this.require(tenantId, id), unit);
    await this.repository.save(updated);
    await this.emit(sensorUnitSet(updated));
    return updated;
  }

  async deactivate(tenantId: TenantId, id: Uuid): Promise<Sensor> {
    const updated = deactivateSensor(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(sensorDeactivated(updated));
    return updated;
  }

  async reactivate(tenantId: TenantId, id: Uuid): Promise<Sensor> {
    const current = await this.require(tenantId, id);
    const active = await this.repository.findActiveBySpaceAndMetric(
      tenantId,
      current.spaceId,
      current.metric,
    );
    if (active && active.id !== current.id) {
      throw new DuplicateActiveSensorError(current.spaceId, current.metric);
    }
    const updated = reactivateSensor(current);
    await this.repository.save(updated);
    await this.emit(sensorReactivated(updated));
    return updated;
  }

  async retire(tenantId: TenantId, id: Uuid): Promise<Sensor> {
    const updated = retireSensor(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(sensorRetired(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Sensor> {
    return this.require(tenantId, id);
  }

  async listForSpace(tenantId: TenantId, spaceId: Uuid): Promise<Sensor[]> {
    return this.repository.listBySpace(tenantId, spaceId);
  }

  async listForBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Sensor[]> {
    return this.repository.listByBuilding(tenantId, buildingId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Sensor[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Sensor> {
    const sensor = await this.repository.findById(tenantId, id);
    if (!sensor) {
      throw new SensorNotFoundError(id);
    }
    return sensor;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
