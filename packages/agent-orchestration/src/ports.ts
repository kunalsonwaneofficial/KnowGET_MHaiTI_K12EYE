import type { TenantId, Uuid } from "@knowget/types";
import type { AgentDefinition } from "./agent";
import type { ApprovalRequest } from "./approval-request";
import type { ExecutionPlan } from "./execution-plan";
import type { ReasoningSession } from "./reasoning-session";
import type { ToolDefinition } from "./tool";
import type { ToolInvocation } from "./tool-invocation";

/**
 * The storage and directory contracts the AI operating system depends on, and nothing more.
 *
 * Every method takes the tenant explicitly and every read filters on it, on top of the row-level security the
 * adapters run under. Two independent barriers is the platform's standing position: RLS is the one that cannot
 * be forgotten, and the explicit argument is the one that shows up in a code review.
 *
 * Nothing here reaches beyond the AI runtime's own records except {@link OrganizationDirectory}, which is a
 * read model rather than a dependency — this domain never imports another domain package.
 */

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant? Every
 * agent, capability, plan, approval, invocation and session hangs off one.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Storage contract for the agent registry. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-agent-per-key rule.
 */
export interface AgentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<AgentDefinition | null>;
  findByKey(tenantId: TenantId, key: string): Promise<AgentDefinition | null>;
  listByTenant(tenantId: TenantId): Promise<AgentDefinition[]>;
  save(agent: AgentDefinition): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link AgentRepository} — the default for tests and bootstrap. */
export class InMemoryAgentRepository implements AgentRepository {
  private readonly byId = new Map<string, AgentDefinition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<AgentDefinition | null> {
    const agent = this.byId.get(id);
    return agent && agent.tenantId === tenantId ? agent : null;
  }

  async findByKey(tenantId: TenantId, key: string): Promise<AgentDefinition | null> {
    return [...this.byId.values()].find((a) => a.tenantId === tenantId && a.key === key) ?? null;
  }

  async listByTenant(tenantId: TenantId): Promise<AgentDefinition[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(agent: AgentDefinition): Promise<void> {
    this.byId.set(agent.id, agent);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const agent = this.byId.get(id);
    if (agent && agent.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for the capability catalog. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-capability-per-key rule and every "is this key actually in the catalog?" check the runtime makes;
 * `findManyByKeys` loads the entries a plan names so inspection can run in one read rather than one per step.
 */
export interface ToolRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ToolDefinition | null>;
  findByKey(tenantId: TenantId, key: string): Promise<ToolDefinition | null>;
  findManyByKeys(tenantId: TenantId, keys: readonly string[]): Promise<ToolDefinition[]>;
  listByTenant(tenantId: TenantId): Promise<ToolDefinition[]>;
  save(tool: ToolDefinition): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ToolRepository} — the default for tests and bootstrap. */
export class InMemoryToolRepository implements ToolRepository {
  private readonly byId = new Map<string, ToolDefinition>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ToolDefinition | null> {
    const tool = this.byId.get(id);
    return tool && tool.tenantId === tenantId ? tool : null;
  }

  async findByKey(tenantId: TenantId, key: string): Promise<ToolDefinition | null> {
    return [...this.byId.values()].find((t) => t.tenantId === tenantId && t.key === key) ?? null;
  }

  async findManyByKeys(tenantId: TenantId, keys: readonly string[]): Promise<ToolDefinition[]> {
    const wanted = new Set(keys);
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId && wanted.has(t.key));
  }

  async listByTenant(tenantId: TenantId): Promise<ToolDefinition[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async save(tool: ToolDefinition): Promise<void> {
    this.byId.set(tool.id, tool);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const tool = this.byId.get(id);
    if (tool && tool.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for execution plans. Tenant-scoped (explicit argument + RLS). Steps are entities of the plan
 * and are stored with it — a step is never loaded or saved on its own, because the invariants worth having are
 * invariants across steps. `listBySession` answers "what did this reasoning produce?" from the reasoning end.
 */
export interface ExecutionPlanRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan | null>;
  listByAgent(tenantId: TenantId, agentId: string): Promise<ExecutionPlan[]>;
  listBySession(tenantId: TenantId, reasoningSessionId: string): Promise<ExecutionPlan[]>;
  listByTenant(tenantId: TenantId): Promise<ExecutionPlan[]>;
  save(plan: ExecutionPlan): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ExecutionPlanRepository} — the default for tests and bootstrap. */
export class InMemoryExecutionPlanRepository implements ExecutionPlanRepository {
  private readonly byId = new Map<string, ExecutionPlan>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ExecutionPlan | null> {
    const plan = this.byId.get(id);
    return plan && plan.tenantId === tenantId ? plan : null;
  }

  async listByAgent(tenantId: TenantId, agentId: string): Promise<ExecutionPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId && p.agentId === agentId);
  }

  async listBySession(tenantId: TenantId, reasoningSessionId: string): Promise<ExecutionPlan[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.reasoningSessionId === reasoningSessionId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ExecutionPlan[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(plan: ExecutionPlan): Promise<void> {
    this.byId.set(plan.id, plan);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const plan = this.byId.get(id);
    if (plan && plan.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for human approval requests. Tenant-scoped (explicit argument + RLS).
 *
 * `findOpenForSubject` is what makes the gate usable rather than merely present: it is how an approver's queue
 * finds the request a plan is waiting on, and how the runtime avoids raising a second request for something
 * already sitting in front of a person. `listPending` is the queue itself, and the sweep that expires requests
 * nobody answered. Approvals are never removed — a decided request is the audit record of who allowed what.
 */
export interface ApprovalRequestRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ApprovalRequest | null>;
  findOpenForSubject(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest | null>;
  listBySubject(tenantId: TenantId, subject: string, subjectId: string): Promise<ApprovalRequest[]>;
  listPending(tenantId: TenantId): Promise<ApprovalRequest[]>;
  listByTenant(tenantId: TenantId): Promise<ApprovalRequest[]>;
  save(request: ApprovalRequest): Promise<void>;
}

/** In-memory {@link ApprovalRequestRepository} — the default for tests and bootstrap. */
export class InMemoryApprovalRequestRepository implements ApprovalRequestRepository {
  private readonly byId = new Map<string, ApprovalRequest>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ApprovalRequest | null> {
    const request = this.byId.get(id);
    return request && request.tenantId === tenantId ? request : null;
  }

  async findOpenForSubject(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest | null> {
    return (
      [...this.byId.values()].find(
        (r) =>
          r.tenantId === tenantId &&
          r.subject === subject &&
          r.subjectId === subjectId &&
          r.decision === "pending",
      ) ?? null
    );
  }

  async listBySubject(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.subject === subject && r.subjectId === subjectId,
    );
  }

  async listPending(tenantId: TenantId): Promise<ApprovalRequest[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.decision === "pending",
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ApprovalRequest[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(request: ApprovalRequest): Promise<void> {
    this.byId.set(request.id, request);
  }
}

/**
 * Storage contract for tool invocations. Tenant-scoped (explicit argument + RLS). `listByPlan` is what a
 * rollback reads — the compensation plan is derived from what a plan's invocations actually did, in the order
 * they did it. Invocations are never removed: the record of what an agent did to an institution is the point.
 */
export interface ToolInvocationRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ToolInvocation | null>;
  listByPlan(tenantId: TenantId, planId: string): Promise<ToolInvocation[]>;
  listByAgent(tenantId: TenantId, agentId: string): Promise<ToolInvocation[]>;
  listByTenant(tenantId: TenantId): Promise<ToolInvocation[]>;
  save(invocation: ToolInvocation): Promise<void>;
}

/** In-memory {@link ToolInvocationRepository} — the default for tests and bootstrap. */
export class InMemoryToolInvocationRepository implements ToolInvocationRepository {
  private readonly byId = new Map<string, ToolInvocation>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ToolInvocation | null> {
    const invocation = this.byId.get(id);
    return invocation && invocation.tenantId === tenantId ? invocation : null;
  }

  async listByPlan(tenantId: TenantId, planId: string): Promise<ToolInvocation[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId && i.planId === planId);
  }

  async listByAgent(tenantId: TenantId, agentId: string): Promise<ToolInvocation[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId && i.agentId === agentId);
  }

  async listByTenant(tenantId: TenantId): Promise<ToolInvocation[]> {
    return [...this.byId.values()].filter((i) => i.tenantId === tenantId);
  }

  async save(invocation: ToolInvocation): Promise<void> {
    this.byId.set(invocation.id, invocation);
  }
}

/**
 * Storage contract for reasoning sessions. Tenant-scoped (explicit argument + RLS). Traces are entities of the
 * session and are stored with it: a trace has no meaning outside the chain it belongs to, and loading one alone
 * would invite editing one alone. Sessions are never removed — an agent's reasoning is the audit trail behind
 * everything it then did.
 */
export interface ReasoningSessionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ReasoningSession | null>;
  listByAgent(tenantId: TenantId, agentId: string): Promise<ReasoningSession[]>;
  listByTenant(tenantId: TenantId): Promise<ReasoningSession[]>;
  save(session: ReasoningSession): Promise<void>;
}

/** In-memory {@link ReasoningSessionRepository} — the default for tests and bootstrap. */
export class InMemoryReasoningSessionRepository implements ReasoningSessionRepository {
  private readonly byId = new Map<string, ReasoningSession>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ReasoningSession | null> {
    const session = this.byId.get(id);
    return session && session.tenantId === tenantId ? session : null;
  }

  async listByAgent(tenantId: TenantId, agentId: string): Promise<ReasoningSession[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId && s.agentId === agentId);
  }

  async listByTenant(tenantId: TenantId): Promise<ReasoningSession[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(session: ReasoningSession): Promise<void> {
    this.byId.set(session.id, session);
  }
}
