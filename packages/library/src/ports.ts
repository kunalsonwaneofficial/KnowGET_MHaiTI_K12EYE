import type { TenantId, Uuid } from "@knowget/types";
import type { CirculationPolicy } from "./circulation-policy";
import type { CollectionProfile } from "./collection-profile";
import type { Copy } from "./copy";
import type { DigitalAsset } from "./digital-asset";
import type { LibraryMember } from "./library-member";
import type { Loan } from "./loan";
import type { Reservation } from "./reservation";
import type { Title } from "./title";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Titles, copies, members and loans attach to it; the library domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the person domain (P2-D01-M02): does this person exist in the tenant? A library member
 * is a Person (a student, staff member, alumnus, …); the domain validates existence and never duplicates
 * the person, and never depends on `@knowget/person` directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** Storage contract for catalog titles. Tenant-scoped (explicit argument + RLS). */
export interface TitleRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Title | null>;
  findByIsbn(tenantId: TenantId, isbn: string): Promise<Title | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Title[]>;
  listByTenant(tenantId: TenantId): Promise<Title[]>;
  save(title: Title): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link TitleRepository} — the default for tests and bootstrap. */
export class InMemoryTitleRepository implements TitleRepository {
  private readonly byId = new Map<string, Title>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Title | null> {
    const title = this.byId.get(id);
    return title && title.tenantId === tenantId ? title : null;
  }

  async findByIsbn(tenantId: TenantId, isbn: string): Promise<Title | null> {
    return [...this.byId.values()].find((t) => t.tenantId === tenantId && t.isbn === isbn) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Title[]> {
    return [...this.byId.values()].filter(
      (t) => t.tenantId === tenantId && t.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Title[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async save(title: Title): Promise<void> {
    this.byId.set(title.id, title);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const title = this.byId.get(id);
    if (title && title.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for physical copies. Tenant-scoped (explicit argument + RLS). */
export interface CopyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Copy | null>;
  findByBarcode(tenantId: TenantId, barcode: string): Promise<Copy | null>;
  listByTitle(tenantId: TenantId, titleId: Uuid): Promise<Copy[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Copy[]>;
  listByTenant(tenantId: TenantId): Promise<Copy[]>;
  save(copy: Copy): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CopyRepository} — the default for tests and bootstrap. */
export class InMemoryCopyRepository implements CopyRepository {
  private readonly byId = new Map<string, Copy>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Copy | null> {
    const copy = this.byId.get(id);
    return copy && copy.tenantId === tenantId ? copy : null;
  }

  async findByBarcode(tenantId: TenantId, barcode: string): Promise<Copy | null> {
    return (
      [...this.byId.values()].find((c) => c.tenantId === tenantId && c.barcode === barcode) ?? null
    );
  }

  async listByTitle(tenantId: TenantId, titleId: Uuid): Promise<Copy[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId && c.titleId === titleId);
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Copy[]> {
    return [...this.byId.values()].filter(
      (c) => c.tenantId === tenantId && c.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Copy[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async save(copy: Copy): Promise<void> {
    this.byId.set(copy.id, copy);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const copy = this.byId.get(id);
    if (copy && copy.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for digital assets. Tenant-scoped (explicit argument + RLS). */
export interface DigitalAssetRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<DigitalAsset | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<DigitalAsset[]>;
  listByTenant(tenantId: TenantId): Promise<DigitalAsset[]>;
  save(asset: DigitalAsset): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link DigitalAssetRepository} — the default for tests and bootstrap. */
export class InMemoryDigitalAssetRepository implements DigitalAssetRepository {
  private readonly byId = new Map<string, DigitalAsset>();

  async findById(tenantId: TenantId, id: Uuid): Promise<DigitalAsset | null> {
    const asset = this.byId.get(id);
    return asset && asset.tenantId === tenantId ? asset : null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<DigitalAsset[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<DigitalAsset[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(asset: DigitalAsset): Promise<void> {
    this.byId.set(asset.id, asset);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const asset = this.byId.get(id);
    if (asset && asset.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for library members. Tenant-scoped (explicit argument + RLS). */
export interface LibraryMemberRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<LibraryMember | null>;
  findByMembershipNumber(
    tenantId: TenantId,
    membershipNumber: string,
  ): Promise<LibraryMember | null>;
  findByPersonAndOrganization(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<LibraryMember | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LibraryMember[]>;
  listByTenant(tenantId: TenantId): Promise<LibraryMember[]>;
  save(member: LibraryMember): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LibraryMemberRepository} — the default for tests and bootstrap. */
export class InMemoryLibraryMemberRepository implements LibraryMemberRepository {
  private readonly byId = new Map<string, LibraryMember>();

  async findById(tenantId: TenantId, id: Uuid): Promise<LibraryMember | null> {
    const member = this.byId.get(id);
    return member && member.tenantId === tenantId ? member : null;
  }

  async findByMembershipNumber(
    tenantId: TenantId,
    membershipNumber: string,
  ): Promise<LibraryMember | null> {
    return (
      [...this.byId.values()].find(
        (m) => m.tenantId === tenantId && m.membershipNumber === membershipNumber,
      ) ?? null
    );
  }

  async findByPersonAndOrganization(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<LibraryMember | null> {
    return (
      [...this.byId.values()].find(
        (m) =>
          m.tenantId === tenantId && m.personId === personId && m.organizationId === organizationId,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LibraryMember[]> {
    return [...this.byId.values()].filter(
      (m) => m.tenantId === tenantId && m.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<LibraryMember[]> {
    return [...this.byId.values()].filter((m) => m.tenantId === tenantId);
  }

  async save(member: LibraryMember): Promise<void> {
    this.byId.set(member.id, member);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const member = this.byId.get(id);
    if (member && member.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for loans. Tenant-scoped (explicit argument + RLS). */
export interface LoanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Loan | null>;
  findActiveByCopy(tenantId: TenantId, copyId: Uuid): Promise<Loan | null>;
  listActiveByMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]>;
  listByMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]>;
  listByCopy(tenantId: TenantId, copyId: Uuid): Promise<Loan[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Loan[]>;
  listByTenant(tenantId: TenantId): Promise<Loan[]>;
  save(loan: Loan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link LoanRepository} — the default for tests and bootstrap. */
export class InMemoryLoanRepository implements LoanRepository {
  private readonly byId = new Map<string, Loan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Loan | null> {
    const loan = this.byId.get(id);
    return loan && loan.tenantId === tenantId ? loan : null;
  }

  async findActiveByCopy(tenantId: TenantId, copyId: Uuid): Promise<Loan | null> {
    return (
      [...this.byId.values()].find(
        (l) => l.tenantId === tenantId && l.copyId === copyId && l.status === "active",
      ) ?? null
    );
  }

  async listActiveByMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.memberId === memberId && l.status === "active",
    );
  }

  async listByMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.memberId === memberId,
    );
  }

  async listByCopy(tenantId: TenantId, copyId: Uuid): Promise<Loan[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId && l.copyId === copyId);
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Loan[]> {
    return [...this.byId.values()].filter(
      (l) => l.tenantId === tenantId && l.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Loan[]> {
    return [...this.byId.values()].filter((l) => l.tenantId === tenantId);
  }

  async save(loan: Loan): Promise<void> {
    this.byId.set(loan.id, loan);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const loan = this.byId.get(id);
    if (loan && loan.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for reservations. Tenant-scoped (explicit argument + RLS). */
export interface ReservationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Reservation | null>;
  findOpenByMemberAndTitle(
    tenantId: TenantId,
    memberId: Uuid,
    titleId: Uuid,
  ): Promise<Reservation | null>;
  listOpenByTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]>;
  listByTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]>;
  listByMember(tenantId: TenantId, memberId: Uuid): Promise<Reservation[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Reservation[]>;
  listByTenant(tenantId: TenantId): Promise<Reservation[]>;
  save(reservation: Reservation): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

const OPEN_RESERVATION: readonly string[] = ["requested", "ready"];

/** In-memory {@link ReservationRepository} — the default for tests and bootstrap. */
export class InMemoryReservationRepository implements ReservationRepository {
  private readonly byId = new Map<string, Reservation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Reservation | null> {
    const reservation = this.byId.get(id);
    return reservation && reservation.tenantId === tenantId ? reservation : null;
  }

  async findOpenByMemberAndTitle(
    tenantId: TenantId,
    memberId: Uuid,
    titleId: Uuid,
  ): Promise<Reservation | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.memberId === memberId &&
          r.titleId === titleId &&
          OPEN_RESERVATION.includes(r.status),
      ) ?? null
    );
  }

  async listOpenByTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]> {
    return [...this.byId.values()].filter(
      (r) =>
        r.tenantId === tenantId && r.titleId === titleId && OPEN_RESERVATION.includes(r.status),
    );
  }

  async listByTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId && r.titleId === titleId);
  }

  async listByMember(tenantId: TenantId, memberId: Uuid): Promise<Reservation[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.memberId === memberId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Reservation[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Reservation[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(reservation: Reservation): Promise<void> {
    this.byId.set(reservation.id, reservation);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const reservation = this.byId.get(id);
    if (reservation && reservation.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for circulation policies. Tenant-scoped (explicit argument + RLS). */
export interface CirculationPolicyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy | null>;
  findActiveByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CirculationPolicy | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CirculationPolicy[]>;
  listByTenant(tenantId: TenantId): Promise<CirculationPolicy[]>;
  save(policy: CirculationPolicy): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CirculationPolicyRepository} — the default for tests and bootstrap. */
export class InMemoryCirculationPolicyRepository implements CirculationPolicyRepository {
  private readonly byId = new Map<string, CirculationPolicy>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy | null> {
    const policy = this.byId.get(id);
    return policy && policy.tenantId === tenantId ? policy : null;
  }

  async findActiveByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CirculationPolicy | null> {
    return (
      [...this.byId.values()].find(
        (p) =>
          p.tenantId === tenantId && p.organizationId === organizationId && p.status === "active",
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CirculationPolicy[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CirculationPolicy[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(policy: CirculationPolicy): Promise<void> {
    this.byId.set(policy.id, policy);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const policy = this.byId.get(id);
    if (policy && policy.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for collection profiles (one per organization). Tenant-scoped (argument + RLS). */
export interface CollectionProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<CollectionProfile | null>;
  findByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CollectionProfile | null>;
  listByTenant(tenantId: TenantId): Promise<CollectionProfile[]>;
  save(profile: CollectionProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link CollectionProfileRepository} — the default for tests and bootstrap. */
export class InMemoryCollectionProfileRepository implements CollectionProfileRepository {
  private readonly byId = new Map<string, CollectionProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<CollectionProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CollectionProfile | null> {
    return (
      [...this.byId.values()].find(
        (p) => p.tenantId === tenantId && p.organizationId === organizationId,
      ) ?? null
    );
  }

  async listByTenant(tenantId: TenantId): Promise<CollectionProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: CollectionProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
