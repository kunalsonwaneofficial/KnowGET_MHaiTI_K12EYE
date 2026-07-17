import { secureToken, type SessionPolicy } from "@knowget/security";

export interface Session {
  readonly id: string;
  readonly identityId: string;
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly expiresAt: number;
  readonly device: string | null;
  readonly revoked: boolean;
}

export interface SessionRepository {
  create(session: Session): Promise<void>;
  findById(id: string): Promise<Session | null>;
  findByIdentity(identityId: string): Promise<Session[]>;
  update(session: Session): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly byId = new Map<string, Session>();

  async create(session: Session): Promise<void> {
    this.byId.set(session.id, session);
  }

  async findById(id: string): Promise<Session | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdentity(identityId: string): Promise<Session[]> {
    return [...this.byId.values()].filter((s) => s.identityId === identityId);
  }

  async update(session: Session): Promise<void> {
    this.byId.set(session.id, session);
  }
}

export type Clock = () => number;

/**
 * Manages session lifecycle: creation with concurrent-session limits, validation
 * with idle and absolute timeouts, and revocation.
 */
export class SessionManager {
  constructor(
    private readonly repository: SessionRepository,
    private readonly policy: SessionPolicy,
    private readonly clock: Clock = Date.now,
  ) {}

  async create(identityId: string, options: { device?: string } = {}): Promise<Session> {
    const now = this.clock();
    const active = (await this.repository.findByIdentity(identityId))
      .filter((s) => !s.revoked && s.expiresAt > now)
      .sort((a, b) => a.createdAt - b.createdAt);

    while (active.length >= this.policy.maxConcurrentSessions) {
      const oldest = active.shift();
      if (oldest) {
        await this.repository.update({ ...oldest, revoked: true });
      }
    }

    const session: Session = {
      id: secureToken(24),
      identityId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + this.policy.absoluteTimeoutMs,
      device: options.device ?? null,
      revoked: false,
    };
    await this.repository.create(session);
    return session;
  }

  /** Return the session if valid (updating its activity), else null. */
  async validate(sessionId: string): Promise<Session | null> {
    const session = await this.repository.findById(sessionId);
    if (!session || session.revoked) {
      return null;
    }
    const now = this.clock();
    if (session.expiresAt <= now || now - session.lastActivityAt > this.policy.idleTimeoutMs) {
      return null;
    }
    const refreshed: Session = { ...session, lastActivityAt: now };
    await this.repository.update(refreshed);
    return refreshed;
  }

  async revoke(sessionId: string): Promise<void> {
    const session = await this.repository.findById(sessionId);
    if (session) {
      await this.repository.update({ ...session, revoked: true });
    }
  }

  async activeCount(identityId: string): Promise<number> {
    const now = this.clock();
    return (await this.repository.findByIdentity(identityId)).filter(
      (s) => !s.revoked && s.expiresAt > now,
    ).length;
  }
}
