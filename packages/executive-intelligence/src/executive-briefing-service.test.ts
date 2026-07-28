import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  BRIEFING_DRAFTED,
  BRIEFING_FINDINGS_SET,
  BRIEFING_ISSUED,
  BRIEFING_REVISED,
  BRIEFING_WITHDRAWN,
} from "./command-events";
import type { AttentionSeverity } from "./command-value";
import type {
  AttentionSignal,
  EvidenceCitation,
  PillarInput,
  PillarWeight,
  TracedReading,
} from "./command-view";
import {
  BriefingNotDraftingError,
  BriefingNotIssuedError,
  DuplicateBriefingKeyError,
  EmptyBriefingAudienceScopeError,
  ExecutiveBriefingNotFoundError,
  HealthIndexAssessmentNotFoundError,
  UncitableAssessmentError,
} from "./errors";
import type { DraftBriefingParams, ExecutiveBriefing } from "./executive-briefing";
import { ExecutiveBriefingService } from "./executive-briefing-service";
import {
  type HealthIndexAssessment,
  assessHealthIndex,
  finalizeAssessment,
  invalidateAssessment,
} from "./health-index-assessment";
import { defineHealthIndex, publishHealthIndex } from "./health-index-definition";
import {
  type ExecutiveBriefingRepository,
  type HealthIndexAssessmentRepository,
  InMemoryExecutiveBriefingRepository,
  InMemoryHealthIndexAssessmentRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const MISSING = "briefing-nowhere" as Uuid;
const ABSENT = "assessment-nowhere" as Uuid;
const KEY = "board.summer-term";
const AUDIENCE = "command:brief";
const PERIOD = 7;

const WEIGHTS: readonly PillarWeight[] = [
  { pillar: "academic_outcomes", weight: 0.25 },
  { pillar: "teaching_quality", weight: 0.2 },
  { pillar: "attendance_engagement", weight: 0.2 },
  { pillar: "financial_health", weight: 0.15 },
  { pillar: "learner_wellbeing", weight: 0.1 },
  { pillar: "workforce_capacity", weight: 0.1 },
];

/** Every declared pillar reporting its one indicator, so the composite is covered enough to be cited. */
const INPUTS: readonly PillarInput[] = WEIGHTS.map((entry) => ({
  pillar: entry.pillar,
  score: 72,
  kpisRead: 1,
  kpisDeclared: 1,
}));

const cite = (sourceRef: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "attendance",
  sourceRef,
  attestedBy: null,
});

const readingsAt = (period: number): readonly TracedReading[] =>
  WEIGHTS.map((entry) => ({
    kpiKey: `${entry.pillar}.headline`,
    period,
    citations: [cite(`${entry.pillar}-${period}`)],
  }));

const computed = (period = PERIOD): HealthIndexAssessment =>
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
    { period, inputs: INPUTS, readings: readingsAt(period) },
  );

/** A figure the institution stands behind, which is the only kind a briefing may be written about. */
const stoodBehind = (period = PERIOD): HealthIndexAssessment =>
  finalizeAssessment(computed(period));

const signal = (
  key: string,
  severity: AttentionSeverity,
  overrides: Partial<AttentionSignal> = {},
): AttentionSignal => ({
  key,
  reason: "band_fall",
  severity,
  subjectKind: "pillar",
  subject: "financial_health",
  observed: 1,
  ...overrides,
});

/** Deliberately out of rank order, so the pinning can be seen to do the ranking. */
const FINDINGS: readonly AttentionSignal[] = [
  signal("wellbeing.coverage", "advisory", {
    reason: "coverage_gap",
    subject: "learner_wellbeing",
  }),
  signal("finance.band", "critical"),
  signal("attendance.target", "urgent", {
    reason: "target_miss",
    subjectKind: "kpi",
    subject: "attendance.rate",
  }),
];

const params = (overrides: Partial<DraftBriefingParams> = {}): DraftBriefingParams => ({
  briefingKey: KEY,
  title: "Summer term board summary",
  narrative: "Attendance held; the surplus did not",
  audienceScope: AUDIENCE,
  findings: FINDINGS,
  ...overrides,
});

class Recorder {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  get types(): string[] {
    return this.published.map((event) => event.type);
  }
}

interface Harness {
  readonly service: ExecutiveBriefingService;
  readonly repository: ExecutiveBriefingRepository;
  readonly assessments: HealthIndexAssessmentRepository;
  readonly events: Recorder;
}

const harness = (): Harness => {
  const repository = new InMemoryExecutiveBriefingRepository();
  const assessments = new InMemoryHealthIndexAssessmentRepository();
  const events = new Recorder();
  return {
    service: new ExecutiveBriefingService({ repository, assessments, events }),
    repository,
    assessments,
    events,
  };
};

/** A harness holding one final assessment, ready to be written about. */
const cleared = async (): Promise<Harness & { assessment: HealthIndexAssessment }> => {
  const built = harness();
  const assessment = stoodBehind();
  await built.assessments.save(assessment);
  return { ...built, assessment };
};

/** A briefing that has gone out, and the harness it lives in. */
const circulated = async (): Promise<
  Harness & { assessment: HealthIndexAssessment; briefing: ExecutiveBriefing }
> => {
  const built = await cleared();
  const draft = await built.service.draft(TENANT, built.assessment.id, params());
  const briefing = await built.service.issue(TENANT, draft.id);
  return { ...built, briefing };
};

describe("starting a document about a figure", () => {
  it("stores the briefing and announces it", async () => {
    const { service, repository, assessment, events } = await cleared();

    const briefing = await service.draft(TENANT, assessment.id, params());

    expect(briefing.briefingKey).toBe(KEY);
    expect(briefing.status).toBe("drafting");
    expect(await repository.findByKey(TENANT, KEY)).toEqual(briefing);
    expect(events.types).toEqual([BRIEFING_DRAFTED]);
  });

  it("takes the institution, the series and the period off the assessment, not off the caller", async () => {
    const { service, assessment } = await cleared();

    const briefing = await service.draft(TENANT, assessment.id, params());

    expect(briefing.tenantId).toBe(assessment.tenantId);
    expect(briefing.organizationId).toBe(assessment.organizationId);
    expect(briefing.indexKey).toBe(assessment.indexKey);
    expect(briefing.period).toBe(PERIOD);
    expect(briefing.assessmentId).toBe(assessment.id);
  });

  it("pins the figure, so it keeps saying what it said after the assessment is taken back", async () => {
    const { service, assessments, assessment } = await cleared();
    const briefing = await service.draft(TENANT, assessment.id, params());

    await assessments.save(invalidateAssessment(assessment, "A reading was double counted"));

    const held = await service.get(TENANT, briefing.id);
    expect(held.cited).toEqual(briefing.cited);
    expect(held.cited.fingerprint).toBe(assessment.fingerprint);
  });

  it("ranks the findings on the way in rather than trusting the order they arrived in", async () => {
    const { service, assessment } = await cleared();

    const briefing = await service.draft(TENANT, assessment.id, params());

    expect(briefing.findings.map((finding) => finding.severity)).toEqual([
      "critical",
      "urgent",
      "advisory",
    ]);
  });

  it("refuses a figure the institution does not yet stand behind, and stores nothing", async () => {
    const { service, repository, assessments, events } = harness();
    const provisional = computed();
    await assessments.save(provisional);

    let thrown: unknown;
    try {
      await service.draft(TENANT, provisional.id, params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UncitableAssessmentError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });

  it("refuses a figure the institution has taken back", async () => {
    const { service, assessments, assessment } = await cleared();
    await assessments.save(invalidateAssessment(assessment));

    let thrown: unknown;
    try {
      await service.draft(TENANT, assessment.id, params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UncitableAssessmentError);
  });

  it("answers a 404 about the figure when the record a briefing would depend on is not there", async () => {
    const { service } = harness();

    let thrown: unknown;
    try {
      await service.draft(TENANT, ABSENT, params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HealthIndexAssessmentNotFoundError);
    expect((thrown as Error).message).toContain(ABSENT);
  });

  it("holds a key a withdrawn briefing still owns, so a citation of it cannot be redirected", async () => {
    const { service, assessment, briefing } = await circulated();
    await service.withdraw(TENANT, briefing.id, "Superseded by the corrected pack");

    let thrown: unknown;
    try {
      await service.draft(TENANT, assessment.id, params());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DuplicateBriefingKeyError);
  });

  it("refuses a document with no audience, because a blank scope would fail open", async () => {
    const { service, repository, assessment, events } = await cleared();

    let thrown: unknown;
    try {
      await service.draft(TENANT, assessment.id, params({ audienceScope: "   " }));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EmptyBriefingAudienceScopeError);
    expect(await repository.listByTenant(TENANT)).toEqual([]);
    expect(events.published).toEqual([]);
  });
});

describe("writing it before it goes out", () => {
  it("re-words the title and leaves the narrative alone when none is offered", async () => {
    const { service, repository, assessment, events } = await cleared();
    const briefing = await service.draft(TENANT, assessment.id, params());

    const next = await service.revise(TENANT, briefing.id, { title: "Summer term: board pack" });

    expect(next.title).toBe("Summer term: board pack");
    expect(next.narrative).toBe(briefing.narrative);
    expect(await repository.findById(TENANT, briefing.id)).toEqual(next);
    expect(events.types).toEqual([BRIEFING_DRAFTED, BRIEFING_REVISED]);
  });

  it("clears the narrative when null is passed for it", async () => {
    const { service, assessment } = await cleared();
    const briefing = await service.draft(TENANT, assessment.id, params());

    const next = await service.revise(TENANT, briefing.id, {
      title: briefing.title,
      narrative: null,
    });

    expect(next.narrative).toBeNull();
  });

  it("replaces what leadership is pointed at wholesale, re-ranking as it pins", async () => {
    const { service, assessment, events } = await cleared();
    const briefing = await service.draft(TENANT, assessment.id, params());

    const next = await service.setFindings(TENANT, briefing.id, [
      signal("wellbeing.coverage", "informational", { reason: "coverage_gap" }),
      signal("finance.band", "urgent"),
    ]);

    expect(next.findings.map((finding) => finding.key)).toEqual([
      "finance.band",
      "wellbeing.coverage",
    ]);
    expect(events.types).toEqual([BRIEFING_DRAFTED, BRIEFING_FINDINGS_SET]);
  });

  it("refuses to re-word a document that has circulated, leaving it exactly as it went out", async () => {
    const { service, repository, briefing } = await circulated();

    let thrown: unknown;
    try {
      await service.revise(TENANT, briefing.id, { title: "A quieter title" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotDraftingError);
    expect(await repository.findById(TENANT, briefing.id)).toEqual(briefing);
  });

  it("refuses to re-point it either, so the findings a board read stay the findings", async () => {
    const { service, briefing } = await circulated();

    let thrown: unknown;
    try {
      await service.setFindings(TENANT, briefing.id, []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotDraftingError);
  });
});

describe("sending it", () => {
  it("issues it and announces it", async () => {
    const { briefing, events } = await circulated();

    expect(briefing.status).toBe("issued");
    expect(briefing.issuedAt).not.toBeNull();
    expect(events.types).toEqual([BRIEFING_DRAFTED, BRIEFING_ISSUED]);
  });

  it("re-checks the figure at the moment of issue and refuses one taken back since drafting", async () => {
    const { service, repository, assessments, assessment } = await cleared();
    const briefing = await service.draft(TENANT, assessment.id, params());

    await assessments.save(invalidateAssessment(assessment, "The attendance feed double counted"));

    let thrown: unknown;
    try {
      await service.issue(TENANT, briefing.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UncitableAssessmentError);
    expect((await repository.findById(TENANT, briefing.id))?.status).toBe("drafting");
  });

  it("sends what was pinned rather than anything recomputed at the moment of issue", async () => {
    const { service, assessment } = await cleared();
    const draft = await service.draft(TENANT, assessment.id, params());

    const issued = await service.issue(TENANT, draft.id);

    expect(issued.cited).toEqual(draft.cited);
    expect(issued.findings).toEqual(draft.findings);
    expect(issued.createdAt).toBe(draft.createdAt);
  });

  it("refuses a second issue", async () => {
    const { service, briefing } = await circulated();

    let thrown: unknown;
    try {
      await service.issue(TENANT, briefing.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotDraftingError);
  });
});

describe("retracting it", () => {
  it("withdraws an issued briefing, recording why and announcing it", async () => {
    const { service, briefing, events } = await circulated();

    const next = await service.withdraw(TENANT, briefing.id, "  Cited a reading since withdrawn  ");

    expect(next.status).toBe("withdrawn");
    expect(next.withdrawnAt).not.toBeNull();
    expect(next.withdrawalReason).toBe("Cited a reading since withdrawn");
    expect(events.types).toEqual([BRIEFING_DRAFTED, BRIEFING_ISSUED, BRIEFING_WITHDRAWN]);
  });

  it("keeps an absent reason as no reason rather than as whitespace", async () => {
    const { service, briefing } = await circulated();

    expect((await service.withdraw(TENANT, briefing.id)).withdrawalReason).toBeNull();
  });

  it("refuses to retract a draft nobody has seen", async () => {
    const { service, assessment } = await cleared();
    const briefing = await service.draft(TENANT, assessment.id, params());

    let thrown: unknown;
    try {
      await service.withdraw(TENANT, briefing.id, "Thought better of it");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BriefingNotIssuedError);
  });

  it("leaves the document readable while dropping it from what the institution stands behind", async () => {
    const { service, assessment, briefing } = await circulated();
    const withdrawn = await service.withdraw(TENANT, briefing.id, "Superseded");

    expect(await service.get(TENANT, briefing.id)).toEqual(withdrawn);
    expect(await service.listIssued(TENANT, ORG)).toEqual([]);
    expect(await service.listByAssessment(TENANT, assessment.id)).toEqual([withdrawn]);
  });
});

describe("serving a reader a document they are an audience for", () => {
  it("serves an issued briefing to a reader holding its audience scope", async () => {
    const { service, briefing } = await circulated();

    expect(await service.view(TENANT, KEY, ["command:read", AUDIENCE])).toEqual(briefing);
  });

  it("answers as absent to a reader outside the audience rather than as withheld", async () => {
    const { service } = await circulated();

    let thrown: unknown;
    try {
      await service.view(TENANT, KEY, ["command:read"]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExecutiveBriefingNotFoundError);
    expect((thrown as Error).message).toContain(KEY);
  });

  it("answers a draft as absent even to a reader who would be its audience", async () => {
    const { service, assessment } = await cleared();
    await service.draft(TENANT, assessment.id, params());

    let thrown: unknown;
    try {
      await service.view(TENANT, KEY, [AUDIENCE]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExecutiveBriefingNotFoundError);
  });

  it("still resolves a withdrawn briefing, because a minute citing one must reach it", async () => {
    const { service, briefing } = await circulated();
    const withdrawn = await service.withdraw(TENANT, briefing.id, "Superseded");

    expect(await service.view(TENANT, KEY, [AUDIENCE])).toEqual(withdrawn);
  });

  it("resolves the key however the reader typed it", async () => {
    const { service, briefing } = await circulated();

    expect(await service.view(TENANT, "  BOARD.Summer-Term ", [AUDIENCE])).toEqual(briefing);
  });

  it("narrows the list to this reader, while the institution's own list keeps everything", async () => {
    const { service, assessment, briefing } = await circulated();
    const other = await service.draft(
      TENANT,
      assessment.id,
      params({ briefingKey: "staff.summer-term", audienceScope: "command:read" }),
    );
    await service.issue(TENANT, other.id);

    expect(await service.listVisible(TENANT, ORG, [AUDIENCE])).toEqual([briefing]);
    expect(await service.listIssued(TENANT, ORG)).toHaveLength(2);
  });
});

describe("reading briefings back", () => {
  it("answers a 404 naming the id nobody holds", async () => {
    const { service } = harness();

    let thrown: unknown;
    try {
      await service.get(TENANT, MISSING);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExecutiveBriefingNotFoundError);
    expect((thrown as Error).message).toContain(MISSING);
  });

  it("resolves by key, and the refusal names the normalized form rather than what was typed", async () => {
    const { service, briefing } = await circulated();

    expect(await service.getByKey(TENANT, "  BOARD.Summer-Term ")).toEqual(briefing);

    let thrown: unknown;
    try {
      await service.getByKey(TENANT, "  Staff.Summer-Term ");
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).message).toContain("staff.summer-term");
  });

  it("does not serve another tenant's briefing", async () => {
    const { service, briefing } = await circulated();

    let thrown: unknown;
    try {
      await service.get(OTHER, briefing.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExecutiveBriefingNotFoundError);
  });

  it("lists every document written about one figure, and everything in the tenant", async () => {
    const { service, assessment, briefing } = await circulated();
    await service.draft(TENANT, assessment.id, params({ briefingKey: "staff.summer-term" }));

    expect(await service.listByAssessment(TENANT, assessment.id)).toHaveLength(2);
    expect(await service.list(TENANT)).toHaveLength(2);
    expect(await service.listIssued(TENANT, ORG)).toEqual([briefing]);
  });
});

describe("announcing without a bus", () => {
  it("works with no event bus wired at all", async () => {
    const repository = new InMemoryExecutiveBriefingRepository();
    const assessments = new InMemoryHealthIndexAssessmentRepository();
    const assessment = stoodBehind();
    await assessments.save(assessment);
    const service = new ExecutiveBriefingService({ repository, assessments });

    const draft = await service.draft(TENANT, assessment.id, params());
    const issued = await service.issue(TENANT, draft.id);

    expect(issued.status).toBe("issued");
    expect(await service.view(TENANT, KEY, [AUDIENCE])).toEqual(issued);
  });
});
