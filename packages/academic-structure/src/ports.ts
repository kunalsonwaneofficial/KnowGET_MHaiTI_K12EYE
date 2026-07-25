import type { TenantId, Uuid } from "@knowget/types";
import type { AcademicCalendar } from "./academic-calendar";
import type { AcademicProgram } from "./academic-program";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization exist in
 * the tenant? Every academic-structure record is owned by an Organization; the platform
 * validates it through this port and never depends on `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Storage contract for academic calendars (one per organization + academic year). */
export interface AcademicCalendarRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar | null>;
  findByYear(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<AcademicCalendar | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicCalendar[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicCalendar[]>;
  save(calendar: AcademicCalendar): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicCalendarRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicCalendarRepository implements AcademicCalendarRepository {
  private readonly byId = new Map<string, AcademicCalendar>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar | null> {
    const calendar = this.byId.get(id);
    return calendar && calendar.tenantId === tenantId ? calendar : null;
  }

  async findByYear(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<AcademicCalendar | null> {
    return (
      [...this.byId.values()].find(
        (c) =>
          c.tenantId === tenantId &&
          c.organizationId === organizationId &&
          c.academicYear === academicYear,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicCalendar[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicCalendar[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(calendar: AcademicCalendar): Promise<void> {
    this.byId.set(calendar.id, calendar);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const calendar = this.byId.get(id);
    if (calendar && calendar.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for academic programs (one per organization + code). */
export interface AcademicProgramRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AcademicProgram | null>;
  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicProgram | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicProgram[]>;
  listByTenant(tenantId: TenantId): Promise<AcademicProgram[]>;
  save(program: AcademicProgram): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AcademicProgramRepository} — the default for tests and bootstrap. */
export class InMemoryAcademicProgramRepository implements AcademicProgramRepository {
  private readonly byId = new Map<string, AcademicProgram>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AcademicProgram | null> {
    const program = this.byId.get(id);
    return program && program.tenantId === tenantId ? program : null;
  }

  async findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicProgram | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.organizationId === organizationId && p.code === code,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicProgram[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<AcademicProgram[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(program: AcademicProgram): Promise<void> {
    this.byId.set(program.id, program);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const program = this.byId.get(id);
    if (program && program.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
