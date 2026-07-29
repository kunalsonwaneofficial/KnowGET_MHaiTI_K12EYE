import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type CapabilityArea,
  type Lesson,
  type LessonCategory,
  type LessonOrigin,
  type LessonRepository,
  type LessonRetention,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** The one retention that means a conclusion actually reached institutional memory. */
const RETAINED_RETENTION = "retained";

interface LessonRow {
  id: string;
  tenantId: string;
  organizationId: string;
  lessonKey: string;
  statement: string;
  category: string;
  origin: string;
  originRef: string;
  retention: string;
  areas: unknown;
  retainedAtPeriod: number | null;
  recordedBy: string | null;
  retainedAt: string | null;
  supersededAt: string | null;
  supersedingLessonKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LessonRow): Lesson {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    lessonKey: row.lessonKey,
    statement: row.statement,
    category: row.category as LessonCategory,
    origin: row.origin as LessonOrigin,
    originRef: row.originRef,
    retention: row.retention as LessonRetention,
    areas: (row.areas as CapabilityArea[]) ?? [],
    retainedAtPeriod: row.retainedAtPeriod,
    recordedBy: (row.recordedBy as Uuid | null) ?? null,
    retainedAt: (row.retainedAt as ISODateString | null) ?? null,
    supersededAt: (row.supersededAt as ISODateString | null) ?? null,
    supersedingLessonKey: row.supersedingLessonKey,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(lesson: Lesson) {
  return {
    tenantId: lesson.tenantId,
    organizationId: lesson.organizationId,
    lessonKey: lesson.lessonKey,
    statement: lesson.statement,
    category: lesson.category,
    origin: lesson.origin,
    originRef: lesson.originRef,
    retention: lesson.retention,
    areas: JSON.parse(JSON.stringify(lesson.areas)),
    retainedAtPeriod: lesson.retainedAtPeriod,
    recordedBy: lesson.recordedBy,
    retainedAt: lesson.retainedAt,
    supersededAt: lesson.supersededAt,
    supersedingLessonKey: lesson.supersedingLessonKey,
  };
}

/**
 * Prisma-backed {@link LessonRepository} (RLS via {@link withTenant}).
 *
 * This is the table the contract's first clause lands in — lessons feed institutional memory — and the schema
 * says something the phrase alone does not: a lesson is not the memory, it is a record of a conclusion that may
 * or may not have reached one. `retention` is a stored column rather than a derived flag because the answer
 * comes from outside this domain entirely, from whether the knowledge graph carries a grounded claim about the
 * lesson's key, and that answer was true at a moment somebody can be held to.
 *
 * `supersedingLessonKey` is a key rather than a foreign key, and deliberately. A lesson names its replacement in
 * the same vocabulary everything else in this domain uses to address a lesson, so supersession still resolves
 * when the replacement is recorded later, in a different cycle, by somebody who never saw the original row. A
 * referential constraint would make the ordinary case — concluding something better before writing down that it
 * replaces something older — the case the database refuses.
 *
 * There is no `remove`. A lesson is superseded, never deleted, because the institution's earlier conclusion is
 * the thing that explains its earlier decisions, and a memory that quietly drops what it used to believe cannot
 * account for anything it did while believing it.
 */
export class PrismaLessonRepository implements LessonRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Lesson | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.lesson.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The key lookup behind the one-lesson-per-key rule, and the same door supersession comes through — a lesson
   * names its replacement by key, so this read is what turns that name back into a record.
   */
  findByKey(tenantId: TenantId, lessonKey: string): Promise<Lesson | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.lesson.findFirst({ where: { lessonKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * Everything one thing taught the institution — a cycle's retrospective, an initiative's outcome, an incident
   * review — matched on the origin and its reference together. The pair is the filter rather than the reference
   * alone because references are only unique within their own scheme, and a cycle key and an initiative key that
   * happened to coincide would otherwise pool two unrelated retrospectives into one.
   *
   * Key order, which is an address order rather than a ranking. Nothing in this domain says one conclusion drawn
   * from a review outranks another drawn from the same review, and a read that presented them in some order
   * carrying the shape of importance would be inventing a judgement the institution never made.
   */
  listByOrigin(tenantId: TenantId, origin: LessonOrigin, originRef: string): Promise<Lesson[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lesson.findMany({
        where: { origin, originRef },
        orderBy: { lessonKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /**
   * Institutional memory as this contract can report it — the lessons that actually reached the graph, in the
   * order they got there.
   *
   * Retention order rather than key order, because what this read is for is the accumulation. An institution
   * looking at its own memory needs to see when each conclusion was committed, and the period a lesson entered
   * memory is also the period its review falls due from; sorted by it, the top of this list is the memory that
   * has gone longest without being revisited.
   */
  listRetained(tenantId: TenantId, organizationId: Uuid): Promise<Lesson[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lesson.findMany({
        where: { organizationId, retention: RETAINED_RETENTION },
        orderBy: [{ retainedAtPeriod: "asc" }, { lessonKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Lesson[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.lesson.findMany({ orderBy: { lessonKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(lesson: Lesson): Promise<void> {
    return withTenant(this.db, lesson.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(lesson);
      await tx.lesson.upsert({
        where: { id: lesson.id },
        create: { id: lesson.id, ...fields },
        update: fields,
      });
    });
  }
}
