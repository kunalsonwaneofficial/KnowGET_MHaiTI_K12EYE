import type { UnitOfWork } from "@knowget/persistence";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "./prisma-service";

/** The transactional client handed to work inside a transaction. */
export type TransactionClient = Prisma.TransactionClient;

/**
 * Unit-of-Work implementation over Prisma interactive transactions: `work` runs
 * atomically and rolls back automatically if it throws.
 */
export class TransactionManager implements UnitOfWork<TransactionClient> {
  constructor(private readonly service: PrismaService) {}

  run<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return this.service.client.$transaction((tx) => work(tx));
  }
}
