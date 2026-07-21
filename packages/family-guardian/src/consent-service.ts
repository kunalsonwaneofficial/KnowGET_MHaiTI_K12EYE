import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { type Consent, isConsentActive, recordConsent } from "./consent";
import type { ConsentType } from "./consent-type";
import {
  ConsentAlreadyWithdrawnError,
  ConsentNotFoundError,
  GuardianNotFoundError,
  NoConsentToWithdrawError,
  PolicyNotFoundForConsentError,
  StudentNotFoundForFamilyError,
} from "./errors";
import { consentGranted, consentWithdrawn } from "./family-guardian-events";
import type { Guardian } from "./guardian";
import type {
  ConsentRepository,
  GuardianRepository,
  PolicyDirectory,
  StudentDirectory,
} from "./ports";

export interface ConsentServiceDeps {
  readonly repository: ConsentRepository;
  readonly guardians: GuardianRepository;
  readonly students: StudentDirectory;
  readonly policies: PolicyDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface GrantConsentInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly consentType: ConsentType;
  readonly policyId?: Uuid | null;
  readonly note?: string | null;
  readonly effectiveOn?: string | null;
  readonly expiresOn?: string | null;
}

export interface WithdrawConsentInput {
  readonly tenantId: TenantId;
  readonly studentId: Uuid;
  readonly guardianId: Uuid;
  readonly consentType: ConsentType;
  readonly note?: string | null;
  readonly effectiveOn?: string | null;
}

/** The current standing of one consent type for a learner. */
export interface ConsentVerification {
  readonly consentType: ConsentType;
  readonly active: boolean;
  readonly latest: Consent | null;
}

/**
 * Application service for institutional consents. Records grants and withdrawals as
 * immutable, monotonically-versioned entries per `(student, consentType)` — validating
 * the granting guardian (whose organization the record derives), the learner and any
 * linked governance policy — and verifies current standing (granted, in effect, not
 * expired). Publishes `family.consent.granted` and `family.consent.withdrawn`. History
 * is append-only and never mutated.
 */
export class ConsentService {
  private readonly repository: ConsentRepository;
  private readonly guardians: GuardianRepository;
  private readonly students: StudentDirectory;
  private readonly policies: PolicyDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ConsentServiceDeps) {
    this.repository = deps.repository;
    this.guardians = deps.guardians;
    this.students = deps.students;
    this.policies = deps.policies;
    this.events = deps.events;
  }

  async grant(input: GrantConsentInput): Promise<Consent> {
    const guardian = await this.requireGuardian(input.tenantId, input.guardianId);
    await this.assertStudentExists(input.tenantId, input.studentId);
    if (input.policyId) {
      await this.assertPolicyExists(input.tenantId, input.policyId);
    }
    const latest = await this.repository.findLatest(
      input.tenantId,
      input.studentId,
      input.consentType,
    );
    const consent = recordConsent({
      tenantId: input.tenantId,
      organizationId: guardian.organizationId,
      studentId: input.studentId,
      guardianId: input.guardianId,
      consentType: input.consentType,
      decision: "granted",
      version: (latest?.version ?? 0) + 1,
      policyId: input.policyId ?? null,
      note: input.note ?? null,
      effectiveOn: input.effectiveOn ?? null,
      expiresOn: input.expiresOn ?? null,
    });
    await this.repository.save(consent);
    await this.emit(consentGranted(consent));
    return consent;
  }

  async withdraw(input: WithdrawConsentInput): Promise<Consent> {
    const guardian = await this.requireGuardian(input.tenantId, input.guardianId);
    await this.assertStudentExists(input.tenantId, input.studentId);
    const latest = await this.repository.findLatest(
      input.tenantId,
      input.studentId,
      input.consentType,
    );
    if (!latest) {
      throw new NoConsentToWithdrawError(input.consentType);
    }
    if (latest.decision === "withdrawn") {
      throw new ConsentAlreadyWithdrawnError(input.consentType);
    }
    const consent = recordConsent({
      tenantId: input.tenantId,
      organizationId: guardian.organizationId,
      studentId: input.studentId,
      guardianId: input.guardianId,
      consentType: input.consentType,
      decision: "withdrawn",
      version: latest.version + 1,
      policyId: latest.policyId,
      note: input.note ?? null,
      effectiveOn: input.effectiveOn ?? null,
      expiresOn: null,
    });
    await this.repository.save(consent);
    await this.emit(consentWithdrawn(consent));
    return consent;
  }

  async verify(
    tenantId: TenantId,
    studentId: Uuid,
    consentType: ConsentType,
    asOf?: string,
  ): Promise<ConsentVerification> {
    const latest = await this.repository.findLatest(tenantId, studentId, consentType);
    return {
      consentType,
      active: latest ? isConsentActive(latest, asOf) : false,
      latest,
    };
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Consent> {
    return this.require(tenantId, id);
  }

  async history(
    tenantId: TenantId,
    studentId: Uuid,
    consentType?: ConsentType,
  ): Promise<Consent[]> {
    return consentType
      ? this.repository.listByStudentAndType(tenantId, studentId, consentType)
      : this.repository.listByStudent(tenantId, studentId);
  }

  async list(tenantId: TenantId): Promise<Consent[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async requireGuardian(tenantId: TenantId, guardianId: Uuid): Promise<Guardian> {
    const guardian = await this.guardians.findById(tenantId, guardianId);
    if (!guardian) {
      throw new GuardianNotFoundError(guardianId);
    }
    return guardian;
  }

  private async assertStudentExists(tenantId: TenantId, studentId: Uuid): Promise<void> {
    if (!(await this.students.exists(tenantId, studentId))) {
      throw new StudentNotFoundForFamilyError(studentId);
    }
  }

  private async assertPolicyExists(tenantId: TenantId, policyId: Uuid): Promise<void> {
    if (!(await this.policies.exists(tenantId, policyId))) {
      throw new PolicyNotFoundForConsentError(policyId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Consent> {
    const consent = await this.repository.findById(tenantId, id);
    if (!consent) {
      throw new ConsentNotFoundError(id);
    }
    return consent;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
