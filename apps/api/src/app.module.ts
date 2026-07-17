import { Module } from "@nestjs/common";
import { OrganizationModule } from "./domains/organization/organization.module";
import { PersonModule } from "./domains/person/person.module";
import { ObservabilityModule } from "./platform/observability/observability.module";
import { PlatformModule } from "./platform/platform.module";
import { SecurityModule } from "./platform/security/security.module";
import { ServicesModule } from "./platform/services/services.module";

/**
 * Root application module. Builds on the Phase-1 platform core (kernel, data,
 * security, shared services, observability); Phase-2 enterprise domain modules
 * are imported under `domains/` as they are engineered — the Identity &
 * Organization sub-domain: Organization (M01), Person (M02).
 */
@Module({
  imports: [
    PlatformModule,
    SecurityModule,
    ServicesModule,
    ObservabilityModule,
    OrganizationModule,
    PersonModule,
  ],
})
export class AppModule {}
