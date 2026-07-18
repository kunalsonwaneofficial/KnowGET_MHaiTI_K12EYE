import type {
  IdentityAccountRepository,
  IdentityAccountService,
} from "@knowget/enterprise-identity";
import type { MembershipService } from "@knowget/membership";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import type { RoleService } from "@knowget/roles";
import type { TenantId } from "@knowget/types";

/** The bootstrap administrator to ensure exists on first boot (persisted mode). */
export interface BootstrapAdmin {
  readonly tenantId: TenantId;
  readonly email: string;
  readonly password: string;
}

export interface SecuritySeederDeps {
  readonly persons: PersonService;
  readonly organizations: OrganizationService;
  readonly roles: RoleService;
  readonly identities: IdentityAccountService;
  readonly memberships: MembershipService;
  /** Used only for the idempotency probe (does the admin account already exist?). */
  readonly accounts: IdentityAccountRepository;
}

/**
 * Idempotently seeds the bootstrap administrator for persisted mode: a root
 * organization, an `administrator` system role (all permissions), a Person, an
 * identity account, and the membership that grants the person the administrator
 * role. Composes the domain services exactly as an operator would — no direct
 * table writes. Safe to run on every boot: it is a no-op once the admin account
 * exists.
 */
export class SecuritySeeder {
  constructor(private readonly deps: SecuritySeederDeps) {}

  async seed(admin: BootstrapAdmin): Promise<{ readonly seeded: boolean }> {
    const { tenantId, email, password } = admin;
    if (await this.deps.accounts.findByIdentifier(tenantId, "email", email)) {
      return { seeded: false };
    }

    const person = await this.deps.persons.register({
      tenantId,
      name: { given: "System", family: "Administrator" },
    });
    const org = await this.deps.organizations.create({
      tenantId,
      type: "trust",
      name: "Institution Root",
      code: "ROOT",
    });
    // Define the administrator role before granting it (membership validates
    // role names against the catalogue).
    await this.deps.roles.define({
      tenantId,
      name: "administrator",
      description: "Full access (bootstrap system role).",
      permissions: ["*"],
      isSystem: true,
    });
    await this.deps.identities.provision({
      tenantId,
      personId: person.id,
      identifiers: [{ type: "email", value: email }],
      password,
      activate: true,
    });
    await this.deps.memberships.grant({
      tenantId,
      personId: person.id,
      organizationId: org.id,
      roles: ["administrator"],
    });
    return { seeded: true };
  }
}
