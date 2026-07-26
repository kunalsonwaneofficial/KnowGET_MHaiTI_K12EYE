import type { TenantId, Uuid } from "@knowget/types";
import type { Appointment } from "./appointment";
import type { ClinicalEncounter } from "./clinical-encounter";
import type { Clinician } from "./clinician";
import type { HealthCentre } from "./health-centre";
import { OPEN_APPOINTMENT_STATUSES } from "./health-centre-value";

const OPEN_ENCOUNTER: readonly string[] = ["draft", "in_progress"];

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Health centres, clinicians and encounters attach to it; the domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a clinician is an Employee. `exists` answers presence;
 * `organizationOf` resolves the employee's organization (or `null` if unknown) so a clinician derives its
 * organization from the staff member it links to. The domain links to workforce and never depends on
 * `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant? A patient is a
 * Person (a student, staff member, …); the domain validates existence and never duplicates the person, and
 * never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for health centres. Tenant-scoped (explicit argument + RLS). */
export interface HealthCentreRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<HealthCentre | null>;
  findByCode(tenantId: TenantId, code: string): Promise<HealthCentre | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthCentre[]>;
  listByTenant(tenantId: TenantId): Promise<HealthCentre[]>;
  save(centre: HealthCentre): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link HealthCentreRepository} — the default for tests and bootstrap. */
export class InMemoryHealthCentreRepository implements HealthCentreRepository {
  private readonly byId = new Map<string, HealthCentre>();

  async findById(tenantId: TenantId, id: Uuid): Promise<HealthCentre | null> {
    const centre = this.byId.get(id);
    return centre && centre.tenantId === tenantId ? centre : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<HealthCentre | null> {
    return [...this.byId.values()].find((c) => c.tenantId === tenantId && c.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthCentre[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<HealthCentre[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(centre: HealthCentre): Promise<void> {
    this.byId.set(centre.id, centre);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const centre = this.byId.get(id);
    if (centre && centre.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for clinicians. Tenant-scoped (explicit argument + RLS). */
export interface ClinicianRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Clinician | null>;
  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Clinician | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Clinician[]>;
  listByTenant(tenantId: TenantId): Promise<Clinician[]>;
  save(clinician: Clinician): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ClinicianRepository} — the default for tests and bootstrap. */
export class InMemoryClinicianRepository implements ClinicianRepository {
  private readonly byId = new Map<string, Clinician>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Clinician | null> {
    const clinician = this.byId.get(id);
    return clinician && clinician.tenantId === tenantId ? clinician : null;
  }

  async findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Clinician | null> {
    return (
      [...this.byId.values()].find((c) => c.tenantId === tenantId && c.employeeId === employeeId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Clinician[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Clinician[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(clinician: Clinician): Promise<void> {
    this.byId.set(clinician.id, clinician);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const clinician = this.byId.get(id);
    if (clinician && clinician.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for appointments. Tenant-scoped (explicit argument + RLS). */
export interface AppointmentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Appointment | null>;
  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<Appointment[]>;
  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]>;
  listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Appointment[]>;
  listByTenant(tenantId: TenantId): Promise<Appointment[]>;
  save(appointment: Appointment): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AppointmentRepository} — the default for tests and bootstrap. */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly byId = new Map<string, Appointment>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Appointment | null> {
    const appt = this.byId.get(id);
    return appt && appt.tenantId === tenantId ? appt : null;
  }

  async listByPatient(tenantId: TenantId, patientId: Uuid): Promise<Appointment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.patientId === patientId,
    );
  }

  async listByCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.centreId === centreId,
    );
  }

  async listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]> {
    return [...this.byId.values()].filter(
      (a) =>
        a.tenantId === tenantId &&
        a.centreId === centreId &&
        OPEN_APPOINTMENT_STATUSES.includes(a.status as (typeof OPEN_APPOINTMENT_STATUSES)[number]),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Appointment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Appointment[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(appointment: Appointment): Promise<void> {
    this.byId.set(appointment.id, appointment);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const appt = this.byId.get(id);
    if (appt && appt.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for clinical encounters. Tenant-scoped (explicit argument + RLS). */
export interface EncounterRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter | null>;
  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<ClinicalEncounter[]>;
  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]>;
  listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ClinicalEncounter[]>;
  listByTenant(tenantId: TenantId): Promise<ClinicalEncounter[]>;
  save(encounter: ClinicalEncounter): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EncounterRepository} — the default for tests and bootstrap. */
export class InMemoryEncounterRepository implements EncounterRepository {
  private readonly byId = new Map<string, ClinicalEncounter>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter | null> {
    const encounter = this.byId.get(id);
    return encounter && encounter.tenantId === tenantId ? encounter : null;
  }

  async listByPatient(tenantId: TenantId, patientId: Uuid): Promise<ClinicalEncounter[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.patientId === patientId,
    );
  }

  async listByCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.centreId === centreId,
    );
  }

  async listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]> {
    return [...this.byId.values()].filter(
      (e) =>
        e.tenantId === tenantId && e.centreId === centreId && OPEN_ENCOUNTER.includes(e.status),
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ClinicalEncounter[]> {
    return [...this.byId.values()].filter(
      (e) => e.tenantId === tenantId && e.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ClinicalEncounter[]> {
    return [...this.byId.values()].filter((e) => e.tenantId === tenantId);
  }

  async save(encounter: ClinicalEncounter): Promise<void> {
    this.byId.set(encounter.id, encounter);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const encounter = this.byId.get(id);
    if (encounter && encounter.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
