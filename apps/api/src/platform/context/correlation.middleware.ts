import { createRuntimeContext, type RuntimeContextStore } from "@knowget/context";
import { newCorrelationId, toCorrelationId } from "@knowget/shared";

interface RequestLike {
  readonly headers: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  setHeader(name: string, value: string): void;
}
type NextFn = () => void;

/**
 * Framework-agnostic correlation middleware factory. Adopts an incoming
 * `x-correlation-id` (for distributed tracing) or mints a new one, echoes it on
 * the response, and runs the rest of the request inside the given context store
 * so every downstream log and error can be correlated.
 */
export function createCorrelationMiddleware(contextStore: RuntimeContextStore) {
  return (req: RequestLike, res: ResponseLike, next: NextFn): void => {
    const header = req.headers["x-correlation-id"];
    const incoming = Array.isArray(header) ? header[0] : header;
    const correlationId = incoming ? toCorrelationId(incoming) : newCorrelationId();
    res.setHeader("x-correlation-id", correlationId);
    contextStore.run(createRuntimeContext({ correlationId }), () => next());
  };
}
