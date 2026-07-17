import { nowIso } from "@knowget/shared";
import type { ISODateString } from "@knowget/types";
import { nodeRuntimeSource, type RuntimeInfo, type RuntimeSource } from "./runtime-source";

/** A named contributor that supplies one section of a diagnostics snapshot. */
export type DiagnosticContributor = () => unknown;

export interface DiagnosticsSnapshot {
  readonly timestamp: ISODateString;
  readonly runtime: RuntimeInfo;
  /** Contributed sections keyed by name (health, metrics summary, build info, …). */
  readonly sections: Readonly<Record<string, unknown>>;
}

export interface DiagnosticsOptions {
  readonly source?: RuntimeSource;
  readonly now?: () => ISODateString;
}

/**
 * Assembles a point-in-time diagnostics snapshot: live runtime facts (versions,
 * uptime, memory) plus any registered contributor sections (health, metrics
 * summary, build metadata, …). Contributors decouple the diagnostics surface
 * from the subsystems it reports on.
 */
export class DiagnosticsProvider {
  private readonly contributors = new Map<string, DiagnosticContributor>();
  private readonly source: RuntimeSource;
  private readonly now: () => ISODateString;

  constructor(options: DiagnosticsOptions = {}) {
    this.source = options.source ?? nodeRuntimeSource;
    this.now = options.now ?? nowIso;
  }

  register(name: string, contributor: DiagnosticContributor): void {
    this.contributors.set(name, contributor);
  }

  snapshot(): DiagnosticsSnapshot {
    const sections: Record<string, unknown> = {};
    for (const [name, contributor] of this.contributors) {
      sections[name] = contributor();
    }
    return {
      timestamp: this.now(),
      runtime: this.source.read(),
      sections,
    };
  }
}
