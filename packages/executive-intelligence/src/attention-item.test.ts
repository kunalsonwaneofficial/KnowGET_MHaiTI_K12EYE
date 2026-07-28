import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { attentionKeyFor } from "./attention";
import {
  ATTENTION_STATUSES,
  type AttentionReason,
  type AttentionSeverity,
  type HealthPillar,
} from "./command-value";
import type {
  AttentionSignal,
  AttentionSubjectKind,
  EvidenceCitation,
  PillarInput,
  PillarWeight,
  TracedReading,
} from "./command-view";
import {
  type AttentionItem,
  acknowledgeAttentionItem,
  dismissAttentionItem,
  isAttentionItemAcknowledged,
  isAttentionItemDismissed,
  isAttentionItemOpen,
  openAttentionItems,
  raiseAttentionItem,
  rankAttentionItems,
  resolveAttentionItem,
  restateAttentionItem,
  toAttentionSignal,
} from "./attention-item";
import {
  AttentionItemClosedError,
  AttentionItemNotOpenError,
  AttentionSignalMismatchError,
  EmptyDismissalReasonError,
} from "./errors";
import { type HealthIndexAssessment, assessHealthIndex } from "./health-index-assessment";
import { defineHealthIndex, publishHealthIndex } from "./health-index-definition";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const ACTOR = "user-1" as Uuid;

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

const reported = (pillar: HealthPillar, score: number): PillarInput => ({
  pillar,
  score,
  kpisRead: 4,
  kpisDeclared: 5,
});

const FULL: readonly PillarInput[] = [
  reported("academic_outcomes", 80),
  reported("teaching_quality", 70),
  reported("attendance_engagement", 90),
  reported("financial_health", 60),
  reported("learner_wellbeing", 50),
  reported("workforce_capacity", 40),
];

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef: ref,
  attestedBy: null,
});

const GROUNDED: readonly TracedReading[] = [
  { kpiKey: "attendance.rate", period: 7, citations: [cite("attendance.rate")] },
];

const assessment = (): HealthIndexAssessment =>
  assessHealthIndex(
    publishHealthIndex(
      defineHealthIndex({
        tenantId: TENANT,
        organizationId: ORG,
        indexKey: "institutional.health",
        name: "Institutional health",
        grain: "term",
        weights: WEIGHTS,
      }),
    ),
    { period: 7, inputs: FULL, readings: GROUNDED },
  );

const finding = (
  reason: AttentionReason,
  severity: AttentionSeverity,
  subjectKind: AttentionSubjectKind,
  subject: string,
  observed: number | null,
): AttentionSignal => ({
  key: attentionKeyFor(reason, subjectKind, subject),
  reason,
  severity,
  subjectKind,
  subject,
  observed,
});

const BREACH = finding("band_breach", "advisory", "pillar", "financial_health", 1);
const COVERAGE = finding("coverage_gap", "urgent", "index", "", 0.5);
const DECLINE = finding("sustained_decline", "urgent", "pillar", "teaching_quality", 3);
const MISS = finding("target_miss", "informational", "kpi", "attendance.rate", 4.5);

const raised = (signal: AttentionSignal = BREACH): AttentionItem =>
  raiseAttentionItem(assessment(), signal);

/** The same finding, come back worse within the period. */
const WORSE: AttentionSignal = { ...BREACH, severity: "critical", observed: 2 };

describe("raising a finding into the queue", () => {
  it("takes tenancy, series and period from the assessment rather than from a parameter", () => {
    const source = assessment();
    const item = raiseAttentionItem(source, COVERAGE);

    expect(item.tenantId).toBe(TENANT);
    expect(item.organizationId).toBe(ORG);
    expect(item.assessmentId).toBe(source.id);
    expect(item.indexKey).toBe(source.indexKey);
    expect(item.period).toBe(source.period);
  });

  it("copies the finding onto the record as columns", () => {
    const item = raised(COVERAGE);

    expect(item.key).toBe(COVERAGE.key);
    expect(item.reason).toBe("coverage_gap");
    expect(item.severity).toBe("urgent");
    expect(item.subjectKind).toBe("index");
    expect(item.subject).toBe("");
    expect(item.observed).toBe(0.5);
  });

  it("opens with every lifecycle column empty", () => {
    const item = raised();

    expect(item.status).toBe("open");
    expect(item.acknowledgedAt).toBeNull();
    expect(item.acknowledgedBy).toBeNull();
    expect(item.closedAt).toBeNull();
    expect(item.closedBy).toBeNull();
    expect(item.closureNote).toBeNull();
  });

  it("gives each raising its own identity", () => {
    expect(raised().id).not.toBe(raised().id);
  });
});

describe("restating a finding that came back worse", () => {
  it("moves the severity and the quantity and nothing else", () => {
    const item = raised();
    const restated = restateAttentionItem(item, WORSE);

    expect(restated.severity).toBe("critical");
    expect(restated.observed).toBe(2);
    expect(restated.key).toBe(item.key);
    expect(restated.reason).toBe(item.reason);
    expect(restated.subject).toBe(item.subject);
    expect(restated.createdAt).toBe(item.createdAt);
    expect(restated.id).toBe(item.id);
  });

  it("keeps an acknowledgement that was already made", () => {
    const acknowledged = acknowledgeAttentionItem(raised(), ACTOR);
    const restated = restateAttentionItem(acknowledged, WORSE);

    expect(restated.status).toBe("acknowledged");
    expect(restated.acknowledgedBy).toBe(ACTOR);
    expect(restated.acknowledgedAt).toBe(acknowledged.acknowledgedAt);
  });

  it("refuses a signal about a different finding", () => {
    const item = raised();
    let thrown: unknown;
    try {
      restateAttentionItem(item, COVERAGE);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionSignalMismatchError);
    expect((thrown as AttentionSignalMismatchError).details).toEqual({
      id: item.id,
      key: BREACH.key,
      signalKey: COVERAGE.key,
    });
    expect((thrown as AttentionSignalMismatchError).httpStatus).toBe(422);
  });

  it("refuses to quietly reopen a finding somebody already closed", () => {
    const closed = [
      resolveAttentionItem(raised(), ACTOR),
      dismissAttentionItem(raised(), ACTOR, "Known and accepted"),
    ];

    for (const item of closed) {
      let thrown: unknown;
      try {
        restateAttentionItem(item, WORSE);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AttentionItemClosedError);
      expect((thrown as AttentionItemClosedError).details).toEqual({
        id: item.id,
        status: item.status,
      });
      expect((thrown as AttentionItemClosedError).httpStatus).toBe(409);
    }
  });
});

describe("picking a finding up", () => {
  it("records who acknowledged it and when", () => {
    const item = acknowledgeAttentionItem(raised(), ACTOR);

    expect(item.status).toBe("acknowledged");
    expect(item.acknowledgedBy).toBe(ACTOR);
    expect(item.acknowledgedAt).not.toBeNull();
  });

  it("records an automated acknowledgement as having no person behind it", () => {
    const item = acknowledgeAttentionItem(raised(), null);

    expect(item.acknowledgedBy).toBeNull();
    expect(item.acknowledgedAt).not.toBeNull();
  });

  it("refuses a second acknowledgement, so the interval it measures stays true", () => {
    const acknowledged = acknowledgeAttentionItem(raised(), ACTOR);
    let thrown: unknown;
    try {
      acknowledgeAttentionItem(acknowledged, ACTOR);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionItemNotOpenError);
    expect((thrown as AttentionItemNotOpenError).details).toEqual({
      id: acknowledged.id,
      status: "acknowledged",
    });
    expect((thrown as AttentionItemNotOpenError).httpStatus).toBe(409);
  });

  it("refuses to acknowledge something already closed", () => {
    let thrown: unknown;
    try {
      acknowledgeAttentionItem(resolveAttentionItem(raised(), ACTOR), ACTOR);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AttentionItemNotOpenError);
  });
});

describe("closing a finding out", () => {
  it("resolves straight from open, without a ceremonial acknowledgement first", () => {
    const item = resolveAttentionItem(raised(), ACTOR, "  Reconciled the feed  ");

    expect(item.status).toBe("resolved");
    expect(item.closedBy).toBe(ACTOR);
    expect(item.closedAt).not.toBeNull();
    expect(item.closureNote).toBe("Reconciled the feed");
  });

  it("resolves from acknowledged as well", () => {
    const item = resolveAttentionItem(acknowledgeAttentionItem(raised(), ACTOR), ACTOR);

    expect(item.status).toBe("resolved");
    expect(item.acknowledgedBy).toBe(ACTOR);
    expect(item.closureNote).toBeNull();
  });

  it("dismisses with the reason it was given", () => {
    const item = dismissAttentionItem(raised(), ACTOR, "  Expected during the transfer window  ");

    expect(item.status).toBe("dismissed");
    expect(item.closedBy).toBe(ACTOR);
    expect(item.closureNote).toBe("Expected during the transfer window");
  });

  it("refuses a dismissal nobody explained", () => {
    for (const reason of ["", "   "]) {
      let thrown: unknown;
      try {
        dismissAttentionItem(raised(), ACTOR, reason);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(EmptyDismissalReasonError);
      expect((thrown as EmptyDismissalReasonError).httpStatus).toBe(422);
    }
  });

  it("refuses to close something already closed", () => {
    const resolved = resolveAttentionItem(raised(), ACTOR);

    for (const close of [
      () => resolveAttentionItem(resolved, ACTOR),
      () => dismissAttentionItem(resolved, ACTOR, "Second thoughts"),
    ]) {
      let thrown: unknown;
      try {
        close();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AttentionItemClosedError);
    }
  });

  it("reaches every attention status the vocabulary declares", () => {
    const open = raised();
    const reached = [
      open.status,
      acknowledgeAttentionItem(open, ACTOR).status,
      resolveAttentionItem(open, ACTOR).status,
      dismissAttentionItem(open, ACTOR, "Not worth raising").status,
    ];

    expect(new Set(reached)).toEqual(new Set(ATTENTION_STATUSES));
  });
});

describe("what the queue shows the rest of the contract", () => {
  it("counts open and acknowledged alike as still asking for something", () => {
    const open = raised();
    const acknowledged = acknowledgeAttentionItem(open, ACTOR);
    const resolved = resolveAttentionItem(open, ACTOR);
    const dismissed = dismissAttentionItem(open, ACTOR, "Not worth raising");

    expect([open, acknowledged].map(isAttentionItemOpen)).toEqual([true, true]);
    expect([resolved, dismissed].map(isAttentionItemOpen)).toEqual([false, false]);
    expect([open, acknowledged].map(isAttentionItemAcknowledged)).toEqual([false, true]);
    expect([resolved, dismissed].map(isAttentionItemDismissed)).toEqual([false, true]);
  });

  it("keeps only what is still asking, in the order it was given", () => {
    const first = raised(COVERAGE);
    const second = raised(BREACH);
    const third = raised(MISS);

    expect(
      openAttentionItems([first, resolveAttentionItem(second, ACTOR), third]).map(
        (item) => item.key,
      ),
    ).toEqual([COVERAGE.key, MISS.key]);
  });

  it("maps a record back to the finding the engine raised", () => {
    const item = restateAttentionItem(raised(), WORSE);

    expect(toAttentionSignal(item)).toEqual({
      key: BREACH.key,
      reason: "band_breach",
      severity: "critical",
      subjectKind: "pillar",
      subject: "financial_health",
      observed: 2,
    });
  });

  it("says nothing about status when it maps a finding back", () => {
    const item = raised(COVERAGE);

    expect(toAttentionSignal(dismissAttentionItem(item, ACTOR, "Known"))).toEqual(
      toAttentionSignal(item),
    );
  });

  it("ranks the queue loudest first, routed through the engine that defines loudest", () => {
    const ranked = rankAttentionItems([raised(MISS), raised(COVERAGE), raised(BREACH)]);

    expect(ranked.map((item) => item.key)).toEqual([COVERAGE.key, BREACH.key, MISS.key]);
  });

  it("keeps the order findings were raised in within one severity", () => {
    const ranked = rankAttentionItems([raised(COVERAGE), raised(DECLINE), raised(MISS)]);

    expect(ranked.map((item) => item.key)).toEqual([COVERAGE.key, DECLINE.key, MISS.key]);
  });

  it("emits an item at most once even when a caller hands in the same finding twice", () => {
    const ranked = rankAttentionItems([raised(BREACH), raised(BREACH), raised(COVERAGE)]);

    expect(ranked).toHaveLength(2);
    expect(ranked.map((item) => item.key)).toEqual([COVERAGE.key, BREACH.key]);
  });

  it("ranks nothing into nothing", () => {
    expect(rankAttentionItems([])).toEqual([]);
  });
});
