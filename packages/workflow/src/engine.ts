import { PlatformError } from "@knowget/exceptions";
import { newUuid, nowIso } from "@knowget/shared";
import { type TransitionContext, type WorkflowDefinition, validateDefinition } from "./definition";
import type { WorkflowInstance } from "./instance";

/** Raised when an event does not correspond to a permitted transition (HTTP 409). */
export class IllegalTransitionError extends PlatformError {
  constructor(state: string, event: string) {
    super(`No transition for event "${event}" from state "${state}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { state, event },
    });
  }
}

/**
 * Deterministic workflow engine over a {@link WorkflowDefinition}. Instances are
 * immutable snapshots; {@link send} evaluates the transitions leaving the current
 * state (in declaration order), applies the first whose guard passes, and returns
 * a new snapshot. Reaching a `final` state completes the instance. The optional
 * `patch` carries event data, merged before guard evaluation so guards can
 * inspect the incoming decision.
 */
export class WorkflowEngine<TData = Record<string, unknown>> {
  constructor(private readonly definition: WorkflowDefinition<TData>) {
    validateDefinition(definition);
  }

  start(data: TData): WorkflowInstance<TData> {
    return {
      id: newUuid(),
      definition: this.definition.name,
      state: this.definition.initial,
      data,
      history: [],
      status: this.isFinal(this.definition.initial) ? "completed" : "running",
    };
  }

  /** Events that could fire from the instance's current state (guards permitting). */
  availableEvents(instance: WorkflowInstance<TData>): string[] {
    return this.definition.transitions
      .filter(
        (t) =>
          t.from === instance.state &&
          this.guardPasses(t.guard, { data: instance.data, event: t.on, from: t.from }),
      )
      .map((t) => t.on);
  }

  can(instance: WorkflowInstance<TData>, event: string): boolean {
    return this.availableEvents(instance).includes(event);
  }

  send(
    instance: WorkflowInstance<TData>,
    event: string,
    patch?: Partial<TData>,
  ): WorkflowInstance<TData> {
    const data = patch ? { ...instance.data, ...patch } : instance.data;
    const context: TransitionContext<TData> = { data, event, from: instance.state };
    const transition = this.definition.transitions.find(
      (t) => t.from === instance.state && t.on === event && this.guardPasses(t.guard, context),
    );
    if (!transition) {
      throw new IllegalTransitionError(instance.state, event);
    }
    return {
      ...instance,
      state: transition.to,
      data,
      history: [
        ...instance.history,
        { from: transition.from, to: transition.to, event, at: nowIso() },
      ],
      status: this.isFinal(transition.to) ? "completed" : "running",
    };
  }

  private guardPasses(
    guard: WorkflowDefinition<TData>["transitions"][number]["guard"],
    context: TransitionContext<TData>,
  ): boolean {
    return guard === undefined || guard(context);
  }

  private isFinal(state: string): boolean {
    return this.definition.states.some((s) => s.name === state && s.final === true);
  }
}
