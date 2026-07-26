import { Module } from "@nestjs/common";
import { AcademicSchedulingModule } from "./domains/academic-scheduling/academic-scheduling.module";
import { AcademicStructureModule } from "./domains/academic-structure/academic-structure.module";
import { AssessmentEvaluationModule } from "./domains/assessment-evaluation/assessment-evaluation.module";
import { AttendancePresenceModule } from "./domains/attendance-presence/attendance-presence.module";
import { GovernanceModule } from "./domains/governance/governance.module";
import { FamilyGuardianModule } from "./domains/family-guardian/family-guardian.module";
import { HealthCentreModule } from "./domains/health-centre/health-centre.module";
import { IdentityModule } from "./domains/identity/identity.module";
import { LearnerWellbeingModule } from "./domains/learner-wellbeing/learner-wellbeing.module";
import { LearningIntelligenceModule } from "./domains/learning-intelligence/learning-intelligence.module";
import { LibraryModule } from "./domains/library/library.module";
import { MembershipModule } from "./domains/membership/membership.module";
import { OrganizationModule } from "./domains/organization/organization.module";
import { PersonModule } from "./domains/person/person.module";
import { RelationshipModule } from "./domains/relationship/relationship.module";
import { ResidentialModule } from "./domains/residential/residential.module";
import { ResourceModule } from "./domains/resource/resource.module";
import { RolesModule } from "./domains/roles/roles.module";
import { FacultyExcellenceModule } from "./domains/faculty-excellence/faculty-excellence.module";
import { FinancialModule } from "./domains/financial/financial.module";
import { StudentLifecycleModule } from "./domains/student-lifecycle/student-lifecycle.module";
import { TeachingLearningModule } from "./domains/teaching-learning/teaching-learning.module";
import { TransportModule } from "./domains/transport/transport.module";
import { WorkforceModule } from "./domains/workforce/workforce.module";
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
 * committees, policies, delegations, resolutions and the governance calendar);
 * D03 adds the Student Lifecycle Intelligence Platform (prospect → applicant →
 * student → alumni, with educational journey, intelligence profile and timeline);
 * D04 adds the Family & Guardian Intelligence Platform; D05 adds the Learner
 * Wellbeing, Safety & Success Platform (wellbeing profile, health, behaviour,
 * counselling, safeguarding, support and intervention plans) under fine-grained
 * per-area permission scopes; D06 opens the Academic Excellence Platform program
 * with the Academic Structure & Curriculum Platform (calendars, programs,
 * curricula, grades, classes, sections, subjects and learning outcomes); D07 adds
 * the Academic Scheduling & Resource Orchestration Platform (timetables, schedule
 * slots, resources, allocations, scheduling policies and substitutions with the
 * conflict/workload engines); D08 adds the Attendance & Presence Intelligence
 * Platform (immutable attendance sessions and records, leave, attendance policies,
 * co-curricular participation and the AI-ready presence profile); D09 adds the
 * Teaching, Learning & Instruction Intelligence Platform (academic/unit/lesson
 * planning, learning resources, classroom sessions with planned-vs-actual
 * delivery, assignments, learning evidence and instructional analytics). Live
 * security hardening wires the persisted identity/principal→role stores behind
 * `SECURITY_STORE=persisted`.
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
    StudentLifecycleModule,
    FamilyGuardianModule,
    LearnerWellbeingModule,
    AcademicStructureModule,
    AcademicSchedulingModule,
    AttendancePresenceModule,
    TeachingLearningModule,
    AssessmentEvaluationModule,
    LearningIntelligenceModule,
    WorkforceModule,
    FacultyExcellenceModule,
    FinancialModule,
    ResourceModule,
    TransportModule,
    ResidentialModule,
    LibraryModule,
    HealthCentreModule,
    ...persistedSecurity,
    ...persistedServices,
  ],
})
export class AppModule {}
