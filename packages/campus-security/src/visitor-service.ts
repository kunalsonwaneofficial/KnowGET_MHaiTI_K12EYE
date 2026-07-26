import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { VisitorType } from "./campus-security-value";
import {
  visitorArchived,
  visitorBlocked,
  visitorContactUpdated,
  visitorRegistered,
  visitorTypeSet,
  visitorUnblocked,
} from "./campus-security-events";
import {
  DuplicateVisitorCodeError,
  OrganizationNotFoundForSecurityError,
  VisitorNotFoundError,
} from "./errors";
import type { OrganizationDirectory, VisitorRepository } from "./ports";
import {
  archiveVisitor,
  blockVisitor,
  type RegisterVisitorParams,
  registerVisitor,
  setVisitorType,
  unblockVisitor,
  updateVisitorContact,
  type Visitor,
  type VisitorContact,
} from "./visitor";

export interface VisitorServiceDeps {
  readonly repository: VisitorRepository;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for visitors — the visitor master. Registers a visitor (validating the organization
 * and a unique code), edits type and contact, and drives the `active ↔ blocked` / `→ archived` lifecycle,
 * publishing the visitor events.
 */
export class VisitorService {
  private readonly repository: VisitorRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: VisitorServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async register(input: RegisterVisitorParams): Promise<Visitor> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSecurityError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateVisitorCodeError(input.code.trim());
    }
    const visitor = registerVisitor(input);
    await this.repository.save(visitor);
    await this.emit(visitorRegistered(visitor));
    return visitor;
  }

  async setType(tenantId: TenantId, id: Uuid, type: VisitorType): Promise<Visitor> {
    const updated = setVisitorType(await this.require(tenantId, id), type);
    await this.repository.save(updated);
    await this.emit(visitorTypeSet(updated));
    return updated;
  }

  async updateContact(tenantId: TenantId, id: Uuid, contact: VisitorContact): Promise<Visitor> {
    const updated = updateVisitorContact(await this.require(tenantId, id), contact);
    await this.repository.save(updated);
    await this.emit(visitorContactUpdated(updated));
    return updated;
  }

  async block(tenantId: TenantId, id: Uuid): Promise<Visitor> {
    const updated = blockVisitor(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(visitorBlocked(updated));
    return updated;
  }

  async unblock(tenantId: TenantId, id: Uuid): Promise<Visitor> {
    const updated = unblockVisitor(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(visitorUnblocked(updated));
    return updated;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<Visitor> {
    const updated = archiveVisitor(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(visitorArchived(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Visitor> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Visitor> {
    const visitor = await this.repository.findByCode(tenantId, code);
    if (!visitor) {
      throw new VisitorNotFoundError(code);
    }
    return visitor;
  }

  async list(tenantId: TenantId): Promise<Visitor[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Visitor[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Visitor> {
    const visitor = await this.repository.findById(tenantId, id);
    if (!visitor) {
      throw new VisitorNotFoundError(id);
    }
    return visitor;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
