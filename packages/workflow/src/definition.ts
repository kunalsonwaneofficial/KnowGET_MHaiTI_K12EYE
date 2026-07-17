import { ValidationError } from "@knowget/exceptions";

/** Context passed to a transition guard. */
export interface TransitionContext<TData> {
  readonly data: TData;
  readonly event: string;
  readonly from: string;
}

/** A predicate gating whether a transition may fire. */
export type Guard<TData> = (context: TransitionContext<TData>) => boolean;

export interface Transition<TData> {
  readonly from: string;
  /** The event name that triggers this transition. */
  readonly on: string;
  readonly to: string;
  readonly guard?: Guard<TData>;
}

export interface StateDefinition {
  readonly name: string;
  /** Terminal states have no outgoing transitions; reaching one completes the instance. */
  readonly final?: boolean;
}

export interface WorkflowDefinition<TData = Record<string, unknown>> {
  readonly name: string;
  readonly initial: string;
  readonly states: readonly StateDefinition[];
  readonly transitions: readonly Transition<TData>[];
}

/**
 * Validate that a definition is internally consistent: the initial state and
 * every transition endpoint must reference a declared state. Throws
 * {@link ValidationError} otherwise.
 */
export function validateDefinition<TData>(definition: WorkflowDefinition<TData>): void {
  const names = new Set(definition.states.map((s) => s.name));
  if (!names.has(definition.initial)) {
    throw new ValidationError(`Initial state "${definition.initial}" is not declared`, {
      details: { workflow: definition.name },
    });
  }
  for (const transition of definition.transitions) {
    for (const endpoint of [transition.from, transition.to]) {
      if (!names.has(endpoint)) {
        throw new ValidationError(`Transition references unknown state "${endpoint}"`, {
          details: { workflow: definition.name, on: transition.on },
        });
      }
    }
  }
}
