import { Module } from "@nestjs/common";
import { GovernanceModule } from "./domains/governance/governance.module";
import { IdentityModule } from "./domains/identity/identity.module";
import { MembershipModule } from "./domains/membership/membership.module";
import { OrganizationModule } from "./domains/organization/organization.module";
import { PersonModule } from "./domains/person/person.module";
import { RelationshipModule } from "./domains/relationship/relationship.module";
import { RolesModule } from "./domains/roles/roles.module";
import { KeyValueModule } from "./platform/keyvalue/keyvalue.module";
import { ObservabilityModule } from "./platform/observability/observability.module";
import { PlatformModule } from "./platform/platform.module";
import { PersistedSecurityModule } from "./platform/security/persisted-security.module";
import { loadSecurityEnv } from "./platform/security/security.env";
import { SecurityModule } from "./platform/security/security.module";
import { loadServicesEnv } from "./platform/services/backends/services.env";
import { PersistedServicesModule } from "./platform/services/persisted-services.module";
import { ServicesModule } from "./platform/services/services.module";

/**
 * The persisted security wiring is opt-in (SECURITY_STORE=persisted): only then
 * is `PersistedSecurityModule` imported, so the default (memory) build never
 * pulls the Prisma-backed security stores in.
 */
const persistedSecurity =
  loadSecurityEnv().SECURITY_STORE === "persisted" ? [PersistedSecurityModule] : [];

/** Postgres-backed shared services (blob store, full-text search) are opt-in via
 * SERVICES_STORE=persisted, so the default build stays Prisma-free (TD-12). */
const persistedServices =
  loadServicesEnv().SERVICES_STORE === "persisted" ? [PersistedServicesModule] : [];

/**
 * Root application module. Builds on the Phase-1 platform core (kernel, data,
 * security, shared services, observability); Phase-2 enterprise domain modules
 * are imported under `domains/` as they are engineered — the Identity &
 * Organization sub-domain: Organization (M01), Person (M02), Enterprise
 * Identity (M03), Membership (M04), Authorization/Roles (M05), Relationship (M06).
 * Phase-2 D02 adds the Institutional Governance Platform (governance bodies,
 * committees, policies, delegations, resolutions and the governance calendar).
 * Live security hardening wires the persisted identity/principal→role stores
 * behind `SECURITY_STORE=persisted`.
 */
@Module({
  imports: [
    PlatformModule,
    KeyValueModule,
    SecurityModule,
    ServicesModule,
    ObservabilityModule,
    OrganizationModule,
    PersonModule,
    IdentityModule,
    RolesModule,
    MembershipModule,
    RelationshipModule,
    GovernanceModule,
    ...persistedSecurity,
    ...persistedServices,
  ],
})
export class AppModule {}
