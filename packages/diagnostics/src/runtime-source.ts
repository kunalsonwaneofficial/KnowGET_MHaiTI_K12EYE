export interface MemoryInfo {
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
}

export interface RuntimeInfo {
  readonly nodeVersion: string;
  readonly platform: string;
  readonly pid: number;
  readonly uptimeSeconds: number;
  readonly memory: MemoryInfo;
}

/** Source of process/runtime facts — injectable so snapshots are testable. */
export interface RuntimeSource {
  read(): RuntimeInfo;
}

/** Reads live runtime facts from the Node.js `process`. */
export const nodeRuntimeSource: RuntimeSource = {
  read(): RuntimeInfo {
    const memory = process.memoryUsage();
    return {
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
    };
  },
};
