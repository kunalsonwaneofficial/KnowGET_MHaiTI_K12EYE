import { PrismaClient } from "@prisma/client";
import type { DatabaseConnection } from "./connection";

export interface PrismaServiceOptions {
  /** Override the datasource URL (defaults to `DATABASE_URL`). */
  readonly datasourceUrl?: string;
}

/**
 * Owns the Prisma client and its connection lifecycle. This is the single
 * infrastructure surface for persistence; domains never import Prisma directly.
 */
export class PrismaService implements DatabaseConnection {
  readonly client: PrismaClient;
  private connected = false;

  constructor(options: PrismaServiceOptions = {}) {
    this.client = options.datasourceUrl
      ? new PrismaClient({ datasourceUrl: options.datasourceUrl })
      : new PrismaClient();
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    await this.client.$connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.client.$disconnect();
    this.connected = false;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
