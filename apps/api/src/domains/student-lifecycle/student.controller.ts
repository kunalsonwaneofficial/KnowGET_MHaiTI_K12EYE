import type { Principal } from "@knowget/auth";
import { type Student, StudentService } from "@knowget/student-lifecycle";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  academicStatusSchema,
  administrativeStatusSchema,
  assignRollNumberSchema,
  assignSectionSchema,
  enrollStudentSchema,
  exitStudentSchema,
  promoteStudentSchema,
} from "./student-lifecycle.dto";
import { parseBody, STUDENT_READ, STUDENT_WRITE, tenantOf } from "./student-lifecycle-http";
import { STUDENT_SERVICE } from "./student-lifecycle.tokens";

/**
 * REST surface for students (P2-D03) — enrollment, profile, lifecycle and search.
 * Permission-gated; tenant-scoped.
 */
@Controller("student-lifecycle/students")
export class StudentController {
  constructor(@Inject(STUDENT_SERVICE) private readonly service: StudentService) {}

  @RequirePermissions(STUDENT_WRITE)
  @Post()
  @HttpCode(201)
  async enroll(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<Student> {
    const dto = parseBody(enrollStudentSchema, body);
    return this.service.enroll({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      studentNumber: dto.studentNumber,
      ...(dto.membershipId !== undefined ? { membershipId: dto.membershipId as Uuid } : {}),
      ...(dto.applicantId !== undefined ? { applicantId: dto.applicantId as Uuid } : {}),
      ...(dto.programId !== undefined ? { programId: dto.programId as Uuid } : {}),
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
      ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
      ...(dto.rollNumber !== undefined ? { rollNumber: dto.rollNumber } : {}),
      ...(dto.enrolledOn !== undefined ? { enrolledOn: dto.enrolledOn } : {}),
    });
  }

  @RequirePermissions(STUDENT_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Student[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Student[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-person/:personId")
  async listForPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<Student[]> {
    return this.service.listForPerson(tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(STUDENT_READ)
  @Get("by-number/:studentNumber")
  async getByStudentNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("studentNumber") studentNumber: string,
  ): Promise<Student> {
    return this.service.getByStudentNumber(tenantOf(principal), studentNumber);
  }

  @RequirePermissions(STUDENT_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Student> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Student> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/leave")
  @HttpCode(200)
  async placeOnLeave(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Student> {
    return this.service.placeOnLeave(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/return")
  @HttpCode(200)
  async returnFromLeave(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Student> {
    return this.service.returnFromLeave(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/promote")
  @HttpCode(200)
  async promote(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(promoteStudentSchema, body);
    return this.service.promote(tenantOf(principal), id as Uuid, {
      ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear } : {}),
      ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId as Uuid } : {}),
    });
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/transfer")
  @HttpCode(200)
  async transfer(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(exitStudentSchema, body);
    return this.service.transfer(
      tenantOf(principal),
      id as Uuid,
      dto.exitedOn !== undefined ? dto.exitedOn : null,
    );
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(exitStudentSchema, body);
    return this.service.withdraw(
      tenantOf(principal),
      id as Uuid,
      dto.exitedOn !== undefined ? dto.exitedOn : null,
    );
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/graduate")
  @HttpCode(200)
  async graduate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(exitStudentSchema, body);
    return this.service.graduate(
      tenantOf(principal),
      id as Uuid,
      dto.exitedOn !== undefined ? dto.exitedOn : null,
    );
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/alumni")
  @HttpCode(200)
  async becomeAlumni(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Student> {
    return this.service.becomeAlumni(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/section")
  @HttpCode(200)
  async assignSection(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(assignSectionSchema, body);
    return this.service.assignSection(
      tenantOf(principal),
      id as Uuid,
      dto.sectionId as Uuid | null,
    );
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/roll-number")
  @HttpCode(200)
  async assignRollNumber(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(assignRollNumberSchema, body);
    return this.service.assignRollNumber(tenantOf(principal), id as Uuid, dto.rollNumber);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/academic-status")
  @HttpCode(200)
  async setAcademicStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(academicStatusSchema, body);
    return this.service.setAcademicStatus(tenantOf(principal), id as Uuid, dto.status);
  }

  @RequirePermissions(STUDENT_WRITE)
  @Post(":id/administrative-status")
  @HttpCode(200)
  async setAdministrativeStatus(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Student> {
    const dto = parseBody(administrativeStatusSchema, body);
    return this.service.setAdministrativeStatus(tenantOf(principal), id as Uuid, dto.status);
  }
}
