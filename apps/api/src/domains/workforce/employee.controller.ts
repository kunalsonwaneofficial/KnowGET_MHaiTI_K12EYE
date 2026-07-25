import type { Principal } from "@knowget/auth";
import { type Employee, EmployeeService } from "@knowget/workforce";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  assignDepartmentSchema,
  assignPositionSchema,
  exitSchema,
  onboardEmployeeSchema,
  setEmploymentTypeSchema,
} from "./workforce.dto";
import { parseBody, tenantOf, WORKFORCE_READ, WORKFORCE_WRITE } from "./workforce-http";
import { WF_EMPLOYEE_SERVICE } from "./workforce.tokens";

/** REST surface for employees (P2-D12) — the workforce system of record. Gated by workforce:*. */
@Controller("workforce/employees")
export class EmployeeController {
  constructor(@Inject(WF_EMPLOYEE_SERVICE) private readonly service: EmployeeService) {}

  @RequirePermissions(WORKFORCE_WRITE)
  @Post()
  @HttpCode(201)
  async onboard(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(onboardEmployeeSchema, body);
    return this.service.onboard({
      tenantId: tenantOf(principal),
      organizationId: dto.organizationId as Uuid,
      personId: dto.personId as Uuid,
      employeeNumber: dto.employeeNumber,
      employmentType: dto.employmentType,
      ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId as Uuid | null } : {}),
      ...(dto.positionId !== undefined ? { positionId: dto.positionId as Uuid | null } : {}),
      ...(dto.hireDate !== undefined ? { hireDate: dto.hireDate } : {}),
    });
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/activate")
  @HttpCode(200)
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.activate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/place-on-leave")
  @HttpCode(200)
  async placeOnLeave(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.placeOnLeave(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/return-from-leave")
  @HttpCode(200)
  async returnFromLeave(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.returnFromLeave(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/suspend")
  @HttpCode(200)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.suspend(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/reinstate")
  @HttpCode(200)
  async reinstate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.reinstate(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/give-notice")
  @HttpCode(200)
  async giveNotice(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.giveNotice(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/resign")
  @HttpCode(200)
  async resign(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(exitSchema, body);
    return this.service.resign(tenantOf(principal), id as Uuid, dto.exitDate ?? null);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/terminate")
  @HttpCode(200)
  async terminate(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(exitSchema, body);
    return this.service.terminate(tenantOf(principal), id as Uuid, dto.exitDate ?? null);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/retire")
  @HttpCode(200)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(exitSchema, body);
    return this.service.retire(tenantOf(principal), id as Uuid, dto.exitDate ?? null);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/become-alumni")
  @HttpCode(200)
  async becomeAlumni(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.becomeAlumni(tenantOf(principal), id as Uuid);
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/department")
  @HttpCode(200)
  async assignDepartment(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(assignDepartmentSchema, body);
    return this.service.assignDepartment(
      tenantOf(principal),
      id as Uuid,
      dto.departmentId as Uuid | null,
    );
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/position")
  @HttpCode(200)
  async assignPosition(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(assignPositionSchema, body);
    return this.service.assignPosition(
      tenantOf(principal),
      id as Uuid,
      dto.positionId as Uuid | null,
    );
  }

  @RequirePermissions(WORKFORCE_WRITE)
  @Post(":id/employment-type")
  @HttpCode(200)
  async setEmploymentType(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Employee> {
    const dto = parseBody(setEmploymentTypeSchema, body);
    return this.service.setEmploymentType(tenantOf(principal), id as Uuid, dto.employmentType);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<Employee[]> {
    return this.service.list(tenantOf(principal));
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-organization/:organizationId")
  async listForOrganization(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<Employee[]> {
    return this.service.listForOrganization(tenantOf(principal), organizationId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-department/:departmentId")
  async listForDepartment(
    @CurrentPrincipal() principal: Principal,
    @Param("departmentId") departmentId: string,
  ): Promise<Employee[]> {
    return this.service.listForDepartment(tenantOf(principal), departmentId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get("by-person/:personId")
  async listForPerson(
    @CurrentPrincipal() principal: Principal,
    @Param("personId") personId: string,
  ): Promise<Employee[]> {
    return this.service.listForPerson(tenantOf(principal), personId as Uuid);
  }

  @RequirePermissions(WORKFORCE_READ)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<Employee> {
    return this.service.getById(tenantOf(principal), id as Uuid);
  }
}
