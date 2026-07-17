/**
 * Contract for a data-platform connection. Implemented in P1-M03 (Enterprise
 * Data Platform) with pooling, tenancy (RLS), transactions and Prisma. Domains
 * depend on this abstraction rather than on any ORM directly.
 */
export interface DatabaseConnection {
  /** Verify connectivity to the database. */
  isHealthy(): Promise<boolean>;
}
