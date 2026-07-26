import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { SensorNotActiveError, SensorNotFoundError } from "./errors";
import { type EnvironmentReading, recordReading } from "./environment-reading";
import { readingRecorded } from "./facilities-events";
import { isSensorActive } from "./sensor";
import type { EnvironmentReadingRepository, SensorRepository } from "./ports";

/** The record input — the organization, building, space, metric are derived from the sensor. */
export interface RecordReadingInput {
  readonly tenantId: TenantId;
  readonly sensorId: Uuid;
  readonly value: number;
  readonly unit?: string | null;
  readonly recordedAt: string;
}

export interface EnvironmentReadingServiceDeps {
  readonly repository: EnvironmentReadingRepository;
  readonly sensors: SensorRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for environment readings — the smart-environment telemetry log. Records a reading
 * against an active sensor (deriving the org, building, space and metric from the sensor, defaulting the
 * unit to the sensor's), and exposes the latest reading per metric in a space — the input the pure comfort
 * engine consumes. Readings are immutable: there is no edit or delete path.
 */
export class EnvironmentReadingService {
  private readonly repository: EnvironmentReadingRepository;
  private readonly sensors: SensorRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EnvironmentReadingServiceDeps) {
    this.repository = deps.repository;
    this.sensors = deps.sensors;
    this.events = deps.events;
  }

  async record(input: RecordReadingInput): Promise<EnvironmentReading> {
    const sensor = await this.sensors.findById(input.tenantId, input.sensorId);
    if (!sensor) {
      throw new SensorNotFoundError(input.sensorId);
    }
    if (!isSensorActive(sensor)) {
      throw new SensorNotActiveError(input.sensorId);
    }
    const reading = recordReading({
      tenantId: input.tenantId,
      organizationId: sensor.organizationId,
      buildingId: sensor.buildingId,
      spaceId: sensor.spaceId,
      sensorId: sensor.id,
      metric: sensor.metric,
      value: input.value,
      unit: input.unit === undefined ? sensor.unit : input.unit,
      recordedAt: input.recordedAt,
    });
    await this.repository.save(reading);
    await this.emit(readingRecorded(reading));
    return reading;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EnvironmentReading | null> {
    return this.repository.findById(tenantId, id);
  }

  async listForSpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]> {
    return this.repository.listBySpace(tenantId, spaceId);
  }

  async listForSensor(tenantId: TenantId, sensorId: Uuid): Promise<EnvironmentReading[]> {
    return this.repository.listBySensor(tenantId, sensorId);
  }

  /** The latest reading per metric in a space — the comfort engine's input. */
  async latestForSpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]> {
    return this.repository.latestBySpace(tenantId, spaceId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
