/**
 * Connection configuration for the PostgreSQL data platform. The concrete
 * connection/pooling and Prisma integration are engineered in P1-M03; this
 * milestone establishes the typed configuration contract only.
 */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly schema?: string;
  readonly ssl?: boolean;
}

/** Build a PostgreSQL connection string from typed configuration. */
export function buildConnectionString(config: DatabaseConfig): string {
  const params = new URLSearchParams();
  if (config.schema) {
    params.set("schema", config.schema);
  }
  if (config.ssl) {
    params.set("sslmode", "require");
  }
  const query = params.toString();
  const auth = `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}`;
  return `postgresql://${auth}@${config.host}:${config.port}/${config.database}${query ? `?${query}` : ""}`;
}

/** Mask the password in a connection string for safe logging. */
export function redactConnectionString(url: string): string {
  return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1[REDACTED]$3");
}
