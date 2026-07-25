import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AcademicCalendar,
  addExaminationPeriod,
  type AddExaminationPeriodInput,
  addHoliday,
  type AddHolidayInput,
  addSpecialEvent,
  type AddAcademicEventInput,
  addTerm,
  type AddTermInput,
  archiveCalendar,
  createAcademicCalendar,
  publishCalendar,
  removeExaminationPeriod,
  removeHoliday,
  removeSpecialEvent,
  removeTerm,
  setWorkingDays,
} from "./academic-calendar";
import type { AcademicEvent, ExaminationPeriod, Holiday, Term, Weekday } from "./calendar";
import {
  AcademicCalendarNotFoundError,
  DuplicateAcademicCalendarError,
  OrganizationNotFoundForAcademicError,
} from "./errors";
import { academicCalendarPublished, academicYearCreated } from "./academic-structure-events";
import type { AcademicCalendarRepository, OrganizationDirectory } from "./ports";

export interface AcademicCalendarServiceDeps {
  readonly repository: AcademicCalendarRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAcademicCalendarInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly academicYear: string;
  readonly startDate: string;
  readonly endDate: string;
}

/**
 * Application service for academic calendars. Creates at most one calendar per
 * (organization, academic year) against a validated Organization, and manages terms,
 * holidays, examination periods, special events and working days across the draft →
 * published lifecycle. Publishes {@link academicYearCreated} on creation and
 * {@link academicCalendarPublished} on publish.
 */
export class AcademicCalendarService {
  private readonly repository: AcademicCalendarRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AcademicCalendarServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async create(input: CreateAcademicCalendarInput): Promise<AcademicCalendar> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertNoCalendar(input.tenantId, input.organizationId, input.academicYear);
    const calendar = createAcademicCalendar(input);
    await this.repository.save(calendar);
    await this.emit(academicYearCreated(calendar));
    return calendar;
  }

  async addTerm(
    tenantId: TenantId,
    id: Uuid,
    input: AddTermInput,
  ): Promise<{ calendar: AcademicCalendar; term: Term }> {
    const { calendar, term } = addTerm(await this.require(tenantId, id), input);
    await this.repository.save(calendar);
    return { calendar, term };
  }

  async removeTerm(tenantId: TenantId, id: Uuid, termId: Uuid): Promise<AcademicCalendar> {
    return this.mutate(tenantId, id, (c) => removeTerm(c, termId));
  }

  async addHoliday(
    tenantId: TenantId,
    id: Uuid,
    input: AddHolidayInput,
  ): Promise<{ calendar: AcademicCalendar; holiday: Holiday }> {
    const { calendar, holiday } = addHoliday(await this.require(tenantId, id), input);
    await this.repository.save(calendar);
    return { calendar, holiday };
  }

  async removeHoliday(tenantId: TenantId, id: Uuid, holidayId: Uuid): Promise<AcademicCalendar> {
    return this.mutate(tenantId, id, (c) => removeHoliday(c, holidayId));
  }

  async addExaminationPeriod(
    tenantId: TenantId,
    id: Uuid,
    input: AddExaminationPeriodInput,
  ): Promise<{ calendar: AcademicCalendar; period: ExaminationPeriod }> {
    const { calendar, period } = addExaminationPeriod(await this.require(tenantId, id), input);
    await this.repository.save(calendar);
    return { calendar, period };
  }

  async removeExaminationPeriod(
    tenantId: TenantId,
    id: Uuid,
    periodId: Uuid,
  ): Promise<AcademicCalendar> {
    return this.mutate(tenantId, id, (c) => removeExaminationPeriod(c, periodId));
  }

  async addSpecialEvent(
    tenantId: TenantId,
    id: Uuid,
    input: AddAcademicEventInput,
  ): Promise<{ calendar: AcademicCalendar; event: AcademicEvent }> {
    const { calendar, event } = addSpecialEvent(await this.require(tenantId, id), input);
    await this.repository.save(calendar);
    return { calendar, event };
  }

  async removeSpecialEvent(tenantId: TenantId, id: Uuid, eventId: Uuid): Promise<AcademicCalendar> {
    return this.mutate(tenantId, id, (c) => removeSpecialEvent(c, eventId));
  }

  async setWorkingDays(
    tenantId: TenantId,
    id: Uuid,
    weekdays: readonly Weekday[],
  ): Promise<AcademicCalendar> {
    return this.mutate(tenantId, id, (c) => setWorkingDays(c, weekdays));
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar> {
    const calendar = publishCalendar(await this.require(tenantId, id));
    await this.repository.save(calendar);
    await this.emit(academicCalendarPublished(calendar));
    return calendar;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar> {
    return this.mutate(tenantId, id, (c) => archiveCalendar(c));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar> {
    return this.require(tenantId, id);
  }

  async getByYear(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<AcademicCalendar | null> {
    return this.repository.findByYear(tenantId, organizationId, academicYear);
  }

  async list(tenantId: TenantId): Promise<AcademicCalendar[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicCalendar[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (calendar: AcademicCalendar) => AcademicCalendar,
  ): Promise<AcademicCalendar> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForAcademicError(organizationId);
    }
  }

  private async assertNoCalendar(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<void> {
    if (await this.repository.findByYear(tenantId, organizationId, academicYear)) {
      throw new DuplicateAcademicCalendarError(organizationId, academicYear);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar> {
    const calendar = await this.repository.findById(tenantId, id);
    if (!calendar) {
      throw new AcademicCalendarNotFoundError(id);
    }
    return calendar;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
