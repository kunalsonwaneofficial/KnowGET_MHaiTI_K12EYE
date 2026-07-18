import { PrismaService } from "@knowget/database";
import type {
  IdentityAccountRepository,
  IdentityAccountService,
} from "@knowget/enterprise-identity";
import { ConfigurationError } from "@knowget/exceptions";
import type { MembershipRepository, MembershipService } from "@knowget/membership";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import type { RoleService } from "@knowget/roles";
import type { KeyRing, SecurityAuditLogger, SecurityConfig } from "@knowget/security";
import type { TenantId } from "@knowget/types";
import { Global, Inject, Module, type OnModuleInit, type Provider } from "@nestjs/common";
import { IdentityModule } from "../../domains/identity/identity.module";
import {
  IDENTITY_ACCOUNT_REPOSITORY,
  IDENTITY_ACCOUNT_SERVICE,
} from "../../domains/identity/identity.tokens";
import { MembershipModule } from "../../domains/membership/membership.module";
import {
  MEMBERSHIP_REPOSITORY,
  MEMBERSHIP_SERVICE,
} from "../../domains/membership/membership.tokens";
import { OrganizationModule } from "../../domains/organization/organization.module";
import { ORGANIZATION_SERVICE } from "../../domains/organization/organization.tokens";
import { PersonModule } from "../../domains/person/person.module";
import { PERSON_SERVICE } from "../../domains/person/person.tokens";
import { RolesModule } from "../../domains/roles/roles.module";
import { ROLE_SERVICE } from "../../domains/roles/roles.tokens";
import { DATABASE } from "../tokens";
import { buildPersistedSecurity, type PersistedSecurity } from "./persisted/persisted-security";
import { PrismaRevocationStore } from "./persisted/prisma-revocation.store";
import { PrismaSessionStore } from "./persisted/prisma-session.store";
import { type BootstrapAdmin, SecuritySeeder } from "./persisted/security-seeder";
import { loadSecurityEnv } from "./security.env";
import {
  KEY_RING,
  PERSISTED_AUTHENTICATOR,
  PERSISTED_PRINCIPAL_RESOLVER,
  SECURITY_AUDIT,
  SECURITY_CONFIG,
  SESSION_ENFORCER,
} from "./security.tokens";

const PERSISTED_SECURITY = Symbol("PERSISTED_SECURITY");
const SECURITY_SEEDER = Symbol("SECURITY_SEEDER");

/** Resolve the bootstrap admin from env, requiring it in persisted mode. */
function resolveBootstrapAdmin(): BootstrapAdmin {
  const env = loadSecurityEnv();
  if (
    !env.SECURITY_BOOTSTRAP_EMAIL ||
    !env.SECURITY_BOOTSTRAP_PASSWORD ||
    !env.SECURITY_BOOTSTRAP_TENANT
  ) {
    throw new ConfigurationError(
      "SECURITY_STORE=persisted requires SECURITY_BOOTSTRAP_EMAIL, SECURITY_BOOTSTRAP_PASSWORD and SECURITY_BOOTSTRAP_TENANT",
    );
  }
  return {
    tenantId: env.SECURITY_BOOTSTRAP_TENANT as TenantId,
    email: env.SECURITY_BOOTSTRAP_EMAIL,
    password: env.SECURITY_BOOTSTRAP_PASSWORD,
  };
}

const providers: Provider[] = [
  {
    provide: PERSISTED_SECURITY,
    useFactory: (
      accounts: IdentityAccountRepository,
      memberships: MembershipRepository,
      roles: RoleService,
      audit: SecurityAuditLogger,
      config: SecurityConfig,
      keyRing: KeyRing,
      db: PrismaService,
    ): PersistedSecurity =>
      buildPersistedSecurity({
        accounts,
        memberships,
        rolePermissions: (tenantId, names) => roles.permissionsForRoleNames(tenantId, names),
        sessionStore: new PrismaSessionStore(db),
        revocations: new PrismaRevocationStore(db),
        audit,
        config,
        signingKey: keyRing.current().material,
      }),
    inject: [
      IDENTITY_ACCOUNT_REPOSITORY,
      MEMBERSHIP_REPOSITORY,
      ROLE_SERVICE,
      SECURITY_AUDIT,
      SECURITY_CONFIG,
      KEY_RING,
      DATABASE,
    ],
  },
  {
    provide: PERSISTED_AUTHENTICATOR,
    useFactory: (security: PersistedSecurity) => security.authenticator,
    inject: [PERSISTED_SECURITY],
  },
  {
    provide: PERSISTED_PRINCIPAL_RESOLVER,
    useFactory: (security: PersistedSecurity) => security.principals,
    inject: [PERSISTED_SECURITY],
  },
  {
    provide: SESSION_ENFORCER,
    useFactory: (security: PersistedSecurity) => security.enforcer,
    inject: [PERSISTED_SECURITY],
  },
  {
    provide: SECURITY_SEEDER,
    useFactory: (
      persons: PersonService,
      organizations: OrganizationService,
      roles: RoleService,
      identities: IdentityAccountService,
      memberships: MembershipService,
      accounts: IdentityAccountRepository,
    ) => new SecuritySeeder({ persons, organizations, roles, identities, memberships, accounts }),
    inject: [
      PERSON_SERVICE,
      ORGANIZATION_SERVICE,
      ROLE_SERVICE,
      IDENTITY_ACCOUNT_SERVICE,
      MEMBERSHIP_SERVICE,
      IDENTITY_ACCOUNT_REPOSITORY,
    ],
  },
];

/**
 * Opt-in persisted security wiring (SECURITY_STORE=persisted). Imported by the
 * root module only in persisted mode, so memory mode never pulls the Prisma
 * repositories in. It provides the persisted authenticator, principal resolver
 * and per-request session enforcer (the security module + guard pick them up via
 * `@Optional` injection, overriding the in-memory bootstrap) and idempotently
 * seeds the bootstrap administrator on boot. Global so its exports override the
 * security module's defaults app-wide.
 */
@Global()
@Module({
  imports: [PersonModule, OrganizationModule, RolesModule, IdentityModule, MembershipModule],
  providers,
  exports: [PERSISTED_AUTHENTICATOR, PERSISTED_PRINCIPAL_RESOLVER, SESSION_ENFORCER],
})
export class PersistedSecurityModule implements OnModuleInit {
  constructor(@Inject(SECURITY_SEEDER) private readonly seeder: SecuritySeeder) {}

  async onModuleInit(): Promise<void> {
    await this.seeder.seed(resolveBootstrapAdmin());
  }
}
