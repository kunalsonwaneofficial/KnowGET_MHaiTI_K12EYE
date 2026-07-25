import type {
  AcademicClassService,
  GradeService,
  SectionService,
  SubjectService,
} from "@knowget/academic-structure";
import {
  AllocationService,
  type AllocationRepository,
  type ClassDirectory,
  type GradeDirectory,
  type OrganizationDirectory,
  ResourceService,
  type ResourceDirectory,
  type ResourceRepository,
  ScheduleSlotService,
  type ScheduleSlotRepository,
  type SectionDirectory,
  SchedulingPolicyService,
  type SchedulingPolicyRepository,
  type SubjectDirectory,
  SubstitutionService,
  type SubstitutionRepository,
  type TeacherDirectory,
  TimetableService,
  type TimetableRepository,
} from "@knowget/academic-scheduling";
import type { PrismaService } from "@knowget/database";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import {
  AS_CLASS_SERVICE,
  AS_GRADE_SERVICE,
  AS_SECTION_SERVICE,
  AS_SUBJECT_SERVICE,
} from "../academic-structure/academic-structure.tokens";
import { AcademicStructureModule } from "../academic-structure/academic-structure.module";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { AllocationController } from "./allocation.controller";
import {
  SCHED_ALLOCATION_REPOSITORY,
  SCHED_ALLOCATION_SERVICE,
  SCHED_CLASS_DIRECTORY,
  SCHED_GRADE_DIRECTORY,
  SCHED_ORGANIZATION_DIRECTORY,
  SCHED_POLICY_REPOSITORY,
  SCHED_POLICY_SERVICE,
  SCHED_RESOURCE_DIRECTORY,
  SCHED_RESOURCE_REPOSITORY,
  SCHED_RESOURCE_SERVICE,
  SCHED_SECTION_DIRECTORY,
  SCHED_SLOT_REPOSITORY,
  SCHED_SLOT_SERVICE,
  SCHED_SUBJECT_DIRECTORY,
  SCHED_SUBSTITUTION_REPOSITORY,
  SCHED_SUBSTITUTION_SERVICE,
  SCHED_TEACHER_DIRECTORY,
  SCHED_TIMETABLE_REPOSITORY,
  SCHED_TIMETABLE_SERVICE,
} from "./academic-scheduling.tokens";
import {
  ClassServiceDirectory,
  GradeServiceDirectory,
  OrganizationServiceDirectory,
  ResourceRepositoryDirectory,
  SectionServiceDirectory,
  SubjectServiceDirectory,
  TeacherPersonDirectory,
} from "./directory.adapters";
import { PrismaAllocationRepository } from "./prisma-allocation.repository";
import { PrismaResourceRepository } from "./prisma-resource.repository";
import { PrismaScheduleSlotRepository } from "./prisma-schedule-slot.repository";
import { PrismaSchedulingPolicyRepository } from "./prisma-scheduling-policy.repository";
import { PrismaSubstitutionRepository } from "./prisma-substitution.repository";
import { PrismaTimetableRepository } from "./prisma-timetable.repository";
import { ResourceController } from "./resource.controller";
import { ScheduleSlotController } from "./schedule-slot.controller";
import { SchedulingPolicyController } from "./scheduling-policy.controller";
import { SubstitutionController } from "./substitution.controller";
import { TimetableController } from "./timetable.controller";

const repositories: Provider[] = [
  {
    provide: SCHED_TIMETABLE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaTimetableRepository(db),
    inject: [DATABASE],
  },
  {
    provide: SCHED_SLOT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaScheduleSlotRepository(db),
    inject: [DATABASE],
  },
  {
    provide: SCHED_RESOURCE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaResourceRepository(db),
    inject: [DATABASE],
  },
  {
    provide: SCHED_ALLOCATION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaAllocationRepository(db),
    inject: [DATABASE],
  },
  {
    provide: SCHED_POLICY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSchedulingPolicyRepository(db),
    inject: [DATABASE],
  },
  {
    provide: SCHED_SUBSTITUTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSubstitutionRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: SCHED_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: SCHED_GRADE_DIRECTORY,
    useFactory: (grades: GradeService) => new GradeServiceDirectory(grades),
    inject: [AS_GRADE_SERVICE],
  },
  {
    provide: SCHED_CLASS_DIRECTORY,
    useFactory: (classes: AcademicClassService) => new ClassServiceDirectory(classes),
    inject: [AS_CLASS_SERVICE],
  },
  {
    provide: SCHED_SECTION_DIRECTORY,
    useFactory: (sections: SectionService) => new SectionServiceDirectory(sections),
    inject: [AS_SECTION_SERVICE],
  },
  {
    provide: SCHED_SUBJECT_DIRECTORY,
    useFactory: (subjects: SubjectService) => new SubjectServiceDirectory(subjects),
    inject: [AS_SUBJECT_SERVICE],
  },
  {
    provide: SCHED_TEACHER_DIRECTORY,
    useFactory: (people: PersonService) => new TeacherPersonDirectory(people),
    inject: [PERSON_SERVICE],
  },
  {
    provide: SCHED_RESOURCE_DIRECTORY,
    useFactory: (resources: ResourceRepository) => new ResourceRepositoryDirectory(resources),
    inject: [SCHED_RESOURCE_REPOSITORY],
  },
];

const services: Provider[] = [
  {
    provide: SCHED_TIMETABLE_SERVICE,
    useFactory: (
      repository: TimetableRepository,
      slots: ScheduleSlotRepository,
      organizations: OrganizationDirectory,
      grades: GradeDirectory,
      classes: ClassDirectory,
      sections: SectionDirectory,
      allocations: AllocationRepository,
      policies: SchedulingPolicyRepository,
      events: EventBus,
    ) =>
      new TimetableService({
        repository,
        slots,
        organizations,
        grades,
        classes,
        sections,
        allocations,
        policies,
        events,
      }),
    inject: [
      SCHED_TIMETABLE_REPOSITORY,
      SCHED_SLOT_REPOSITORY,
      SCHED_ORGANIZATION_DIRECTORY,
      SCHED_GRADE_DIRECTORY,
      SCHED_CLASS_DIRECTORY,
      SCHED_SECTION_DIRECTORY,
      SCHED_ALLOCATION_REPOSITORY,
      SCHED_POLICY_REPOSITORY,
      EVENT_BUS,
    ],
  },
  {
    provide: SCHED_SLOT_SERVICE,
    useFactory: (
      repository: ScheduleSlotRepository,
      timetables: TimetableRepository,
      subjects: SubjectDirectory,
      teachers: TeacherDirectory,
      sections: SectionDirectory,
      classes: ClassDirectory,
      resources: ResourceDirectory,
      events: EventBus,
    ) =>
      new ScheduleSlotService({
        repository,
        timetables,
        subjects,
        teachers,
        sections,
        classes,
        resources,
        events,
      }),
    inject: [
      SCHED_SLOT_REPOSITORY,
      SCHED_TIMETABLE_REPOSITORY,
      SCHED_SUBJECT_DIRECTORY,
      SCHED_TEACHER_DIRECTORY,
      SCHED_SECTION_DIRECTORY,
      SCHED_CLASS_DIRECTORY,
      SCHED_RESOURCE_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: SCHED_RESOURCE_SERVICE,
    useFactory: (repository: ResourceRepository, organizations: OrganizationDirectory) =>
      new ResourceService({ repository, organizations }),
    inject: [SCHED_RESOURCE_REPOSITORY, SCHED_ORGANIZATION_DIRECTORY],
  },
  {
    provide: SCHED_ALLOCATION_SERVICE,
    useFactory: (
      repository: AllocationRepository,
      organizations: OrganizationDirectory,
      resources: ResourceRepository,
      teachers: TeacherDirectory,
      slots: ScheduleSlotRepository,
      sections: SectionDirectory,
      events: EventBus,
    ) =>
      new AllocationService({
        repository,
        organizations,
        resources,
        teachers,
        slots,
        sections,
        events,
      }),
    inject: [
      SCHED_ALLOCATION_REPOSITORY,
      SCHED_ORGANIZATION_DIRECTORY,
      SCHED_RESOURCE_REPOSITORY,
      SCHED_TEACHER_DIRECTORY,
      SCHED_SLOT_REPOSITORY,
      SCHED_SECTION_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: SCHED_POLICY_SERVICE,
    useFactory: (repository: SchedulingPolicyRepository, organizations: OrganizationDirectory) =>
      new SchedulingPolicyService({ repository, organizations }),
    inject: [SCHED_POLICY_REPOSITORY, SCHED_ORGANIZATION_DIRECTORY],
  },
  {
    provide: SCHED_SUBSTITUTION_SERVICE,
    useFactory: (
      repository: SubstitutionRepository,
      slots: ScheduleSlotRepository,
      teachers: TeacherDirectory,
      resources: ResourceRepository,
      events: EventBus,
    ) => new SubstitutionService({ repository, slots, teachers, resources, events }),
    inject: [
      SCHED_SUBSTITUTION_REPOSITORY,
      SCHED_SLOT_REPOSITORY,
      SCHED_TEACHER_DIRECTORY,
      SCHED_RESOURCE_REPOSITORY,
      EVENT_BUS,
    ],
  },
];

/**
 * The Enterprise Academic Scheduling & Resource Orchestration Platform (P2-D07) — the
 * authoritative scheduling engine. Follows the domain architecture pattern (ADR-0010): the
 * pure `@knowget/academic-scheduling` package (six aggregates plus the conflict / workload /
 * intelligence engines) behind repository ports, Prisma/RLS adapters, application services
 * on the platform event bus, and permission-gated (`scheduling:read`/`:write`), tenant-scoped
 * REST controllers. Organization, grade, class, section, subject and teacher existence enter
 * through injected directory ports (backed by the Organization, Academic-Structure and Person
 * modules); the allocation and scheduling-policy repositories feed the timetable service's
 * conflict engine so publication is gated on the full conflict picture. Second contract of
 * the Academic Excellence Platform program; exports every service token.
 */
@Module({
  imports: [OrganizationModule, AcademicStructureModule, PersonModule],
  controllers: [
    TimetableController,
    ScheduleSlotController,
    ResourceController,
    AllocationController,
    SchedulingPolicyController,
    SubstitutionController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    SCHED_TIMETABLE_SERVICE,
    SCHED_SLOT_SERVICE,
    SCHED_RESOURCE_SERVICE,
    SCHED_ALLOCATION_SERVICE,
    SCHED_POLICY_SERVICE,
    SCHED_SUBSTITUTION_SERVICE,
  ],
})
export class AcademicSchedulingModule {}
