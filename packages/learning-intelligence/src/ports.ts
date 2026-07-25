import type { TenantId, Uuid } from "@knowget/types";
import type { LearnerInsightProfile } from "./learner-insight-profile";
import type { LearningSignal } from "./learning-signal";

// --- Cross-domain directory ports ------------------------------------------------
// Existence checks over other bounded contexts, so the pure package never imports them.

/** Does this organization exist in the tenant? (P2-D01-M01) */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/** Does this student exist in the tenant? (P2-D03) */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
}

// --- Learning signal repository --------------------------------------------------

/**
 * Storage contract for learning signals. `listByStudent` feeds the synthesis engine; the feed is
 * append-only (signals are immutable once captured).
 */
export interface LearningSignalRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LearningSignal | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningSignal[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningSignal[]>;
  listByTenant(tenantId: TenantId): Promise<LearningSignal[]>;
  save(signal: LearningSignal): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LearningSignalRepository} — the default for tests and bootstrap. */
export class InMemoryLearningSignalRepository implements LearningSignalRepository {
  private readonly byId = new Map<string, LearningSignal>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LearningSignal | null> {
    const signal = this.byId.get(id);
    return signal && signal.tenantId === tenantId ? signal : null;
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningSignal[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.studentId === studentId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningSignal[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LearningSignal[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(signal: LearningSignal): Promise<void> {
    this.byId.set(signal.id, signal);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const signal = this.byId.get(id);
    if (signal && signal.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

// --- Learner insight profile repository ------------------------------------------

/** Storage contract for learner insight profiles (one per student). */
export interface LearnerInsightProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile | null>;
  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerInsightProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearnerInsightProfile[]>;
  listByTenant(tenantId: TenantId): Promise<LearnerInsightProfile[]>;
  save(profile: LearnerInsightProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LearnerInsightProfileRepository} — the default for tests and bootstrap. */
export class InMemoryLearnerInsightProfileRepository implements LearnerInsightProfileRepository {
  private readonly byId = new Map<string, LearnerInsightProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LearnerInsightProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearnerInsightProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.studentId === studentId) ??
      null
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<LearnerInsightProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LearnerInsightProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: LearnerInsightProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
