import { describe, expect, it } from "vitest";
import {
  AFFIRMATIVE_VERDICTS,
  ATTESTED_EVIDENCE_KIND,
  BENEFIT_DIRECTIONS,
  CAPABILITY_AREAS,
  CAPABILITY_AREA_COUNT,
  CHANGE_CLASSES,
  CYCLE_STAGES,
  DECISION_VERDICTS,
  EVIDENCE_KINDS,
  EVOLUTION_SCOPES,
  GATE_OUTCOMES,
  GOVERNANCE_GATES,
  INITIAL_LESSON_RETENTION,
  INITIATIVE_STATUSES,
  LESSON_CATEGORIES,
  LESSON_ORIGINS,
  LESSON_RETENTIONS,
  LESSON_REVIEW_PERIODS,
  LEVEL_FLOORS,
  MATURITY_LEVELS,
  MATURITY_PRECISION,
  MAX_AREA_WEIGHT,
  MAX_DECISION_CONDITIONS,
  MAX_KEY_LENGTH,
  MAX_LESSON_APPLICABILITY,
  MAX_LESSON_STATEMENT_LENGTH,
  MAX_MATURITY_SCORE,
  MAX_PERIOD,
  MAX_RATIONALE_LENGTH,
  MIN_AREA_COVERAGE,
  MIN_AREA_WEIGHT,
  MIN_CORROBORATION_FOR_ELEVATED,
  MIN_CORROBORATION_FOR_URGENT,
  MIN_EVIDENCE_PER_AREA,
  MIN_KEY_LENGTH,
  MIN_LESSONS_FOR_CLOSURE,
  MIN_LESSON_STATEMENT_LENGTH,
  MIN_MATURITY_SCORE,
  MIN_PERIOD,
  MIN_PILOT_PERIODS,
  MIN_RATIONALE_LENGTH,
  MIN_REQUIRED_DECIDERS,
  REALIZATION_VERDICTS,
  REQUIRED_DECIDERS,
  SELF_EVIDENT_SOURCES,
  SIGNAL_PRIORITIES,
  SIGNAL_SOURCES,
  SIGNAL_STATUSES,
  TERMINAL_CYCLE_STAGES,
  TERMINAL_INITIATIVE_STATUSES,
  TERMINAL_SIGNAL_STATUSES,
  VARIANCE_BANDS,
  VARIANCE_FLOORS,
  WEIGHT_PRECISION,
  WEIGHT_SUM,
  WEIGHT_TOLERANCE,
  changeClassRank,
  clampMaturityScore,
  isBenefitDirection,
  isCapabilityArea,
  isChangeClass,
  isCycleStage,
  isDecisionVerdict,
  isEvidenceKind,
  isEvolutionScope,
  isFiniteMeasure,
  isGovernanceGate,
  isInitiativeStatus,
  isLessonCategory,
  isLessonOrigin,
  isLessonRetention,
  isMaturityLevel,
  isRealizationVerdict,
  isSignalSource,
  isSignalStatus,
  isTerminalCycleStage,
  isTerminalInitiativeStatus,
  isTerminalSignalStatus,
  isValidKey,
  isValidPeriod,
  isVarianceBand,
  levelRank,
  normalizeKey,
  normalizeScope,
  priorityRank,
  roundMaturity,
  roundWeight,
} from "./evolution-value";

describe("keys", () => {
  it("trims and lower-cases a key", () => {
    expect(normalizeKey("  Academic.Marking-Turnaround  ")).toBe("academic.marking-turnaround");
  });

  it("is idempotent", () => {
    const once = normalizeKey(" Transport.Route_Audit ");
    expect(normalizeKey(once)).toBe(once);
  });

  it("leaves an already-canonical key untouched", () => {
    expect(normalizeKey("staff-onboarding")).toBe("staff-onboarding");
  });

  it("does not collapse interior whitespace, so a key with a space stays distinct and invalid", () => {
    expect(normalizeKey(" marking turnaround ")).toBe("marking turnaround");
    expect(isValidKey("marking turnaround")).toBe(false);
  });

  it("accepts the three separators between alphanumeric segments", () => {
    expect(isValidKey("academic.marking-turnaround")).toBe(true);
    expect(isValidKey("staff_capability")).toBe(true);
    expect(isValidKey("cycle-2026-t1")).toBe(true);
    expect(isValidKey("a1b2c3")).toBe(true);
  });

  it("rejects a key that is not in canonical form", () => {
    expect(isValidKey("Academic.Marking")).toBe(false);
    expect(isValidKey(" academic.marking")).toBe(false);
    expect(isValidKey("academic.marking ")).toBe(false);
  });

  it("rejects a key that opens, closes or doubles a separator", () => {
    expect(isValidKey(".academic")).toBe(false);
    expect(isValidKey("academic.")).toBe(false);
    expect(isValidKey("academic..marking")).toBe(false);
    expect(isValidKey("academic-_marking")).toBe(false);
    expect(isValidKey("-academic")).toBe(false);
    expect(isValidKey("academic_")).toBe(false);
  });

  it("rejects characters outside the grammar", () => {
    expect(isValidKey("academic/marking")).toBe(false);
    expect(isValidKey("academic marking")).toBe(false);
    expect(isValidKey("académic")).toBe(false);
    expect(isValidKey("academic:marking")).toBe(false);
  });

  it("bounds key length at both ends", () => {
    expect(MIN_KEY_LENGTH).toBe(3);
    expect(MAX_KEY_LENGTH).toBe(120);
    expect(isValidKey("ab")).toBe(false);
    expect(isValidKey("abc")).toBe(true);
    expect(isValidKey("a".repeat(MAX_KEY_LENGTH))).toBe(true);
    expect(isValidKey("a".repeat(MAX_KEY_LENGTH + 1))).toBe(false);
  });

  it("rejects the empty key rather than treating it as unnamed", () => {
    expect(isValidKey("")).toBe(false);
    expect(normalizeKey("   ")).toBe("");
  });
});

describe("permission scopes", () => {
  it("declares five scopes, each once", () => {
    expect(EVOLUTION_SCOPES).toHaveLength(5);
    expect(new Set(EVOLUTION_SCOPES).size).toBe(EVOLUTION_SCOPES.length);
  });

  it("separates consent from participation", () => {
    expect(EVOLUTION_SCOPES).toContain("evolution:read");
    expect(EVOLUTION_SCOPES).toContain("evolution:contribute");
    expect(EVOLUTION_SCOPES).toContain("evolution:manage");
    expect(EVOLUTION_SCOPES).toContain("evolution:assess");
    expect(EVOLUTION_SCOPES).toContain("evolution:govern");
  });

  it("namespaces every scope under this contract", () => {
    for (const scope of EVOLUTION_SCOPES) {
      expect(scope.startsWith("evolution:")).toBe(true);
    }
  });

  it("trims and lower-cases a scope", () => {
    expect(normalizeScope("  Evolution:Govern  ")).toBe("evolution:govern");
  });

  it("recognizes every declared scope", () => {
    for (const scope of EVOLUTION_SCOPES) {
      expect(isEvolutionScope(scope)).toBe(true);
    }
  });

  it("recognizes a scope offered in non-canonical form", () => {
    expect(isEvolutionScope(" EVOLUTION:ASSESS ")).toBe(true);
  });

  it("rejects a scope this contract does not declare", () => {
    expect(isEvolutionScope("evolution:approve")).toBe(false);
    expect(isEvolutionScope("evolution:admin")).toBe(false);
    expect(isEvolutionScope("command:govern")).toBe(false);
    expect(isEvolutionScope("")).toBe(false);
  });

  it("exposes no implication between scopes, so governing is granted and never inferred", () => {
    // The module offers nothing that derives one scope from another; a caller holding `manage`
    // has to be granted `govern` separately, and there is no helper here that would say otherwise.
    expect(Object.keys({ EVOLUTION_SCOPES })).toHaveLength(1);
    expect(EVOLUTION_SCOPES.filter((scope) => scope === "evolution:govern")).toHaveLength(1);
  });
});

describe("evidence kinds", () => {
  it("declares eight kinds, each once", () => {
    expect(EVIDENCE_KINDS).toHaveLength(8);
    expect(new Set(EVIDENCE_KINDS).size).toBe(EVIDENCE_KINDS.length);
  });

  it("recognizes every declared kind", () => {
    for (const kind of EVIDENCE_KINDS) {
      expect(isEvidenceKind(kind)).toBe(true);
    }
  });

  it("rejects an origin nobody can answer for", () => {
    expect(isEvidenceKind("unknown")).toBe(false);
    expect(isEvidenceKind("common_knowledge")).toBe(false);
    expect(isEvidenceKind("anecdote")).toBe(false);
    expect(isEvidenceKind("Domain_Record")).toBe(false);
  });

  it("names the one kind that must carry an attestor", () => {
    expect(ATTESTED_EVIDENCE_KIND).toBe("attested_return");
    expect(EVIDENCE_KINDS).toContain(ATTESTED_EVIDENCE_KIND);
  });

  it("draws the other seven kinds from records another contract wrote", () => {
    expect(EVIDENCE_KINDS).toContain("decision_record");
    expect(EVIDENCE_KINDS).toContain("forecast_run");
    expect(EVIDENCE_KINDS).toContain("attention_item");
    expect(EVIDENCE_KINDS).toContain("knowledge_assertion");
  });
});

describe("signal sources", () => {
  it("declares eight sources, each once", () => {
    expect(SIGNAL_SOURCES).toHaveLength(8);
    expect(new Set(SIGNAL_SOURCES).size).toBe(SIGNAL_SOURCES.length);
  });

  it("recognizes every declared source", () => {
    for (const source of SIGNAL_SOURCES) {
      expect(isSignalSource(source)).toBe(true);
    }
  });

  it("rejects a source it does not declare", () => {
    expect(isSignalSource("hunch")).toBe(false);
    expect(isSignalSource("meeting")).toBe(false);
    expect(isSignalSource("")).toBe(false);
  });

  it("keeps the human channel alongside the machine-visible ones", () => {
    expect(SIGNAL_SOURCES).toContain("stakeholder_feedback");
    expect(SIGNAL_SOURCES).toContain("attention_item");
    expect(SIGNAL_SOURCES).toContain("decision_outcome");
    expect(SIGNAL_SOURCES).toContain("forecast_variance");
  });

  it("draws every self-evident source from the declared set", () => {
    for (const source of SELF_EVIDENT_SOURCES) {
      expect(SIGNAL_SOURCES).toContain(source);
    }
  });

  it("treats an incident and an audit finding as already established", () => {
    expect(SELF_EVIDENT_SOURCES).toContain("incident");
    expect(SELF_EVIDENT_SOURCES).toContain("audit_finding");
  });

  it("does not make an opinion self-evident, however strongly held", () => {
    expect(SELF_EVIDENT_SOURCES).not.toContain("stakeholder_feedback");
    expect(SELF_EVIDENT_SOURCES).not.toContain("operational_review");
  });
});

describe("signal statuses", () => {
  it("declares five statuses, each once", () => {
    expect(SIGNAL_STATUSES).toHaveLength(5);
    expect(new Set(SIGNAL_STATUSES).size).toBe(SIGNAL_STATUSES.length);
  });

  it("recognizes every declared status", () => {
    for (const status of SIGNAL_STATUSES) {
      expect(isSignalStatus(status)).toBe(true);
    }
  });

  it("rejects a status it does not declare", () => {
    expect(isSignalStatus("open")).toBe(false);
    expect(isSignalStatus("ignored")).toBe(false);
  });

  it("gives triage exactly three destinations", () => {
    expect(TERMINAL_SIGNAL_STATUSES).toHaveLength(3);
    expect(TERMINAL_SIGNAL_STATUSES).toContain("accepted");
    expect(TERMINAL_SIGNAL_STATUSES).toContain("merged");
    expect(TERMINAL_SIGNAL_STATUSES).toContain("declined");
  });

  it("draws every terminal status from the declared set", () => {
    for (const status of TERMINAL_SIGNAL_STATUSES) {
      expect(SIGNAL_STATUSES).toContain(status);
    }
  });

  it("leaves an untriaged signal visibly unfinished", () => {
    expect(isTerminalSignalStatus("raised")).toBe(false);
    expect(isTerminalSignalStatus("triaged")).toBe(false);
  });

  it("settles a signal the institution chose not to act on", () => {
    expect(isTerminalSignalStatus("declined")).toBe(true);
    expect(isTerminalSignalStatus("accepted")).toBe(true);
    expect(isTerminalSignalStatus("merged")).toBe(true);
  });
});

describe("signal priorities", () => {
  it("declares three priorities, ascending with urgency", () => {
    expect(SIGNAL_PRIORITIES).toEqual(["routine", "elevated", "urgent"]);
    expect(priorityRank("routine")).toBe(0);
    expect(priorityRank("elevated")).toBe(1);
    expect(priorityRank("urgent")).toBe(2);
  });

  it("ranks each priority strictly above the one below it", () => {
    expect(priorityRank("elevated")).toBeGreaterThan(priorityRank("routine"));
    expect(priorityRank("urgent")).toBeGreaterThan(priorityRank("elevated"));
  });

  it("asks for more corroboration as the claim gets louder", () => {
    expect(MIN_CORROBORATION_FOR_ELEVATED).toBe(2);
    expect(MIN_CORROBORATION_FOR_URGENT).toBe(4);
    expect(MIN_CORROBORATION_FOR_URGENT).toBeGreaterThan(MIN_CORROBORATION_FOR_ELEVATED);
  });

  it("needs more than one report before a routine claim rises", () => {
    expect(MIN_CORROBORATION_FOR_ELEVATED).toBeGreaterThan(1);
  });
});

describe("change classes", () => {
  it("declares four classes, ordered by reach", () => {
    expect(CHANGE_CLASSES).toEqual(["clarification", "process", "policy", "structural"]);
    expect(changeClassRank("clarification")).toBe(0);
    expect(changeClassRank("structural")).toBe(CHANGE_CLASSES.length - 1);
  });

  it("recognizes every declared class", () => {
    for (const changeClass of CHANGE_CLASSES) {
      expect(isChangeClass(changeClass)).toBe(true);
    }
  });

  it("rejects a class it does not declare", () => {
    expect(isChangeClass("minor")).toBe(false);
    expect(isChangeClass("emergency")).toBe(false);
    expect(isChangeClass("Policy")).toBe(false);
  });
});

describe("required deciders", () => {
  it("covers every change class, leaving none to fall through to nothing", () => {
    for (const changeClass of CHANGE_CLASSES) {
      expect(REQUIRED_DECIDERS[changeClass]).toBeTypeOf("number");
    }
    expect(Object.keys(REQUIRED_DECIDERS).sort()).toEqual([...CHANGE_CLASSES].sort());
  });

  it("never requires zero people, for any class of change", () => {
    expect(MIN_REQUIRED_DECIDERS).toBe(1);
    for (const changeClass of CHANGE_CLASSES) {
      expect(REQUIRED_DECIDERS[changeClass]).toBeGreaterThanOrEqual(MIN_REQUIRED_DECIDERS);
    }
  });

  it("requires a whole number of people, because half a decider is nobody", () => {
    for (const changeClass of CHANGE_CLASSES) {
      expect(Number.isSafeInteger(REQUIRED_DECIDERS[changeClass])).toBe(true);
    }
  });

  it("never asks for fewer people as the change reaches further", () => {
    for (let index = 1; index < CHANGE_CLASSES.length; index += 1) {
      const previous = CHANGE_CLASSES[index - 1]!;
      const current = CHANGE_CLASSES[index]!;
      expect(REQUIRED_DECIDERS[current]).toBeGreaterThanOrEqual(REQUIRED_DECIDERS[previous]);
    }
  });

  it("escalates rather than applying one uniform number", () => {
    expect(REQUIRED_DECIDERS.clarification).toBe(1);
    expect(REQUIRED_DECIDERS.process).toBe(1);
    expect(REQUIRED_DECIDERS.policy).toBe(2);
    expect(REQUIRED_DECIDERS.structural).toBe(3);
    expect(REQUIRED_DECIDERS.structural).toBeGreaterThan(REQUIRED_DECIDERS.clarification);
  });

  it("freezes the map, so no caller can lower a gate at runtime", () => {
    expect(Object.isFrozen(REQUIRED_DECIDERS)).toBe(true);
    expect(() => {
      (REQUIRED_DECIDERS as Record<string, number>).structural = 0;
    }).toThrow(TypeError);
    expect(REQUIRED_DECIDERS.structural).toBe(3);
  });

  it("admits no class the platform could clear on arithmetic", () => {
    const requirements = CHANGE_CLASSES.map((changeClass) => REQUIRED_DECIDERS[changeClass]);
    expect(Math.min(...requirements)).toBeGreaterThan(0);
  });
});

describe("initiative statuses", () => {
  it("declares eight statuses, each once", () => {
    expect(INITIATIVE_STATUSES).toHaveLength(8);
    expect(new Set(INITIATIVE_STATUSES).size).toBe(INITIATIVE_STATUSES.length);
  });

  it("recognizes every declared status", () => {
    for (const status of INITIATIVE_STATUSES) {
      expect(isInitiativeStatus(status)).toBe(true);
    }
  });

  it("rejects a status it does not declare", () => {
    expect(isInitiativeStatus("open")).toBe(false);
    expect(isInitiativeStatus("cancelled")).toBe(false);
  });

  it("puts a pilot between approval and adoption", () => {
    expect(INITIATIVE_STATUSES).toContain("approved");
    expect(INITIATIVE_STATUSES).toContain("piloting");
    expect(INITIATIVE_STATUSES).toContain("adopted");
    expect(INITIATIVE_STATUSES.indexOf("piloting")).toBeGreaterThan(
      INITIATIVE_STATUSES.indexOf("approved"),
    );
    expect(INITIATIVE_STATUSES.indexOf("adopted")).toBeGreaterThan(
      INITIATIVE_STATUSES.indexOf("piloting"),
    );
  });

  it("draws every terminal status from the declared set", () => {
    for (const status of TERMINAL_INITIATIVE_STATUSES) {
      expect(INITIATIVE_STATUSES).toContain(status);
    }
  });

  it("treats adoption as terminal, so undoing it is a new initiative", () => {
    expect(isTerminalInitiativeStatus("adopted")).toBe(true);
    expect(isTerminalInitiativeStatus("rejected")).toBe(true);
    expect(isTerminalInitiativeStatus("withdrawn")).toBe(true);
  });

  it("leaves everything before a gate open", () => {
    expect(isTerminalInitiativeStatus("draft")).toBe(false);
    expect(isTerminalInitiativeStatus("submitted")).toBe(false);
    expect(isTerminalInitiativeStatus("under_review")).toBe(false);
    expect(isTerminalInitiativeStatus("approved")).toBe(false);
    expect(isTerminalInitiativeStatus("piloting")).toBe(false);
  });

  it("declares no reverted state, because reversion is itself a governed change", () => {
    expect(INITIATIVE_STATUSES).not.toContain("reverted");
    expect(isInitiativeStatus("reverted")).toBe(false);
    expect(GOVERNANCE_GATES).toContain("reversion");
  });

  it("makes an initiative pilot for at least one whole period", () => {
    expect(MIN_PILOT_PERIODS).toBe(1);
    expect(MIN_PILOT_PERIODS).toBeGreaterThan(0);
  });
});

describe("governance gates", () => {
  it("declares four gates, each once", () => {
    expect(GOVERNANCE_GATES).toHaveLength(4);
    expect(new Set(GOVERNANCE_GATES).size).toBe(GOVERNANCE_GATES.length);
  });

  it("recognizes every declared gate", () => {
    for (const gate of GOVERNANCE_GATES) {
      expect(isGovernanceGate(gate)).toBe(true);
    }
  });

  it("rejects a gate it does not declare", () => {
    expect(isGovernanceGate("deployment")).toBe(false);
    expect(isGovernanceGate("release")).toBe(false);
    expect(isGovernanceGate("")).toBe(false);
  });

  it("gates leaving a pilot separately from entering one", () => {
    expect(GOVERNANCE_GATES).toContain("approval");
    expect(GOVERNANCE_GATES).toContain("pilot_exit");
  });

  it("gates closing a cycle, which is when its lessons become the institution's account", () => {
    expect(GOVERNANCE_GATES).toContain("cycle_closure");
  });
});

describe("decision verdicts", () => {
  it("declares four verdicts, each once", () => {
    expect(DECISION_VERDICTS).toHaveLength(4);
    expect(new Set(DECISION_VERDICTS).size).toBe(DECISION_VERDICTS.length);
  });

  it("recognizes every declared verdict", () => {
    for (const verdict of DECISION_VERDICTS) {
      expect(isDecisionVerdict(verdict)).toBe(true);
    }
  });

  it("rejects a verdict it does not declare", () => {
    expect(isDecisionVerdict("abstained")).toBe(false);
    expect(isDecisionVerdict("noted")).toBe(false);
  });

  it("lets a decider say yes with conditions rather than forcing a bare yes", () => {
    expect(DECISION_VERDICTS).toContain("approved_with_conditions");
  });

  it("records a deferral as a decision rather than as silence", () => {
    expect(DECISION_VERDICTS).toContain("deferred");
  });

  it("counts both forms of yes toward the decider requirement", () => {
    expect(AFFIRMATIVE_VERDICTS).toHaveLength(2);
    expect(AFFIRMATIVE_VERDICTS).toContain("approved");
    expect(AFFIRMATIVE_VERDICTS).toContain("approved_with_conditions");
  });

  it("draws every affirmative verdict from the declared set", () => {
    for (const verdict of AFFIRMATIVE_VERDICTS) {
      expect(DECISION_VERDICTS).toContain(verdict);
    }
  });

  it("counts neither a refusal nor a deferral toward agreement", () => {
    expect(AFFIRMATIVE_VERDICTS).not.toContain("rejected");
    expect(AFFIRMATIVE_VERDICTS).not.toContain("deferred");
  });

  it("stands a gate in exactly one of three ways", () => {
    expect(GATE_OUTCOMES).toEqual(["pending", "satisfied", "refused"]);
  });

  it("bounds a rationale at both ends, so a decision carries a reason and not a report", () => {
    expect(MIN_RATIONALE_LENGTH).toBe(10);
    expect(MAX_RATIONALE_LENGTH).toBe(2000);
    expect(MIN_RATIONALE_LENGTH).toBeLessThan(MAX_RATIONALE_LENGTH);
    expect(MIN_RATIONALE_LENGTH).toBeGreaterThan(0);
  });

  it("caps the conditions one decider may attach", () => {
    expect(MAX_DECISION_CONDITIONS).toBe(10);
    expect(MAX_DECISION_CONDITIONS).toBeGreaterThan(0);
  });
});

describe("lessons", () => {
  it("declares six categories, each once", () => {
    expect(LESSON_CATEGORIES).toHaveLength(6);
    expect(new Set(LESSON_CATEGORIES).size).toBe(LESSON_CATEGORIES.length);
  });

  it("recognizes every declared category", () => {
    for (const category of LESSON_CATEGORIES) {
      expect(isLessonCategory(category)).toBe(true);
    }
  });

  it("rejects a category it does not declare", () => {
    expect(isLessonCategory("general")).toBe(false);
    expect(isLessonCategory("other")).toBe(false);
  });

  it("declares five origins, each once", () => {
    expect(LESSON_ORIGINS).toHaveLength(5);
    expect(new Set(LESSON_ORIGINS).size).toBe(LESSON_ORIGINS.length);
  });

  it("recognizes every declared origin", () => {
    for (const origin of LESSON_ORIGINS) {
      expect(isLessonOrigin(origin)).toBe(true);
    }
  });

  it("puts every lesson downstream of something that happened", () => {
    expect(isLessonOrigin("observation")).toBe(false);
    expect(isLessonOrigin("insight")).toBe(false);
    expect(isLessonOrigin("suggestion")).toBe(false);
    expect(LESSON_ORIGINS).toContain("initiative_outcome");
    expect(LESSON_ORIGINS).toContain("incident_review");
  });

  it("declares three retention states, each once", () => {
    expect(LESSON_RETENTIONS).toEqual(["provisional", "retained", "superseded"]);
    expect(new Set(LESSON_RETENTIONS).size).toBe(LESSON_RETENTIONS.length);
  });

  it("recognizes every declared retention state", () => {
    for (const retention of LESSON_RETENTIONS) {
      expect(isLessonRetention(retention)).toBe(true);
    }
  });

  it("offers no state meaning written down somewhere", () => {
    expect(isLessonRetention("recorded")).toBe(false);
    expect(isLessonRetention("documented")).toBe(false);
    expect(isLessonRetention("filed")).toBe(false);
    expect(isLessonRetention("complete")).toBe(false);
  });

  it("starts a lesson provisional, so reaching memory is something that has to happen", () => {
    expect(INITIAL_LESSON_RETENTION).toBe("provisional");
    expect(LESSON_RETENTIONS).toContain(INITIAL_LESSON_RETENTION);
    expect(INITIAL_LESSON_RETENTION).not.toBe("retained");
  });

  it("keeps a corrected lesson readable rather than deleting it", () => {
    expect(LESSON_RETENTIONS).toContain("superseded");
  });

  it("makes a retained lesson due for review without expiring it", () => {
    expect(LESSON_REVIEW_PERIODS).toBe(8);
    expect(LESSON_REVIEW_PERIODS).toBeGreaterThan(0);
    expect(isValidPeriod(LESSON_REVIEW_PERIODS)).toBe(true);
  });

  it("bounds a lesson statement at both ends", () => {
    expect(MIN_LESSON_STATEMENT_LENGTH).toBe(20);
    expect(MAX_LESSON_STATEMENT_LENGTH).toBe(1000);
    expect(MIN_LESSON_STATEMENT_LENGTH).toBeLessThan(MAX_LESSON_STATEMENT_LENGTH);
  });

  it("caps how many capability areas one lesson may claim", () => {
    expect(MAX_LESSON_APPLICABILITY).toBe(5);
    expect(MAX_LESSON_APPLICABILITY).toBeGreaterThan(0);
    expect(MAX_LESSON_APPLICABILITY).toBeLessThan(CAPABILITY_AREA_COUNT);
  });
});

describe("improvement cycles", () => {
  it("declares five stages, each once", () => {
    expect(CYCLE_STAGES).toEqual(["planning", "executing", "reviewing", "closed", "abandoned"]);
    expect(new Set(CYCLE_STAGES).size).toBe(CYCLE_STAGES.length);
  });

  it("recognizes every declared stage", () => {
    for (const stage of CYCLE_STAGES) {
      expect(isCycleStage(stage)).toBe(true);
    }
  });

  it("rejects a stage it does not declare", () => {
    expect(isCycleStage("open")).toBe(false);
    expect(isCycleStage("done")).toBe(false);
  });

  it("separates reviewing from closed, so a cycle cannot finish without lessons", () => {
    expect(CYCLE_STAGES).toContain("reviewing");
    expect(CYCLE_STAGES.indexOf("closed")).toBeGreaterThan(CYCLE_STAGES.indexOf("reviewing"));
  });

  it("draws every terminal stage from the declared set", () => {
    for (const stage of TERMINAL_CYCLE_STAGES) {
      expect(CYCLE_STAGES).toContain(stage);
    }
  });

  it("lets a cycle be abandoned honestly rather than forced into closure", () => {
    expect(isTerminalCycleStage("abandoned")).toBe(true);
    expect(isTerminalCycleStage("closed")).toBe(true);
    expect(isTerminalCycleStage("planning")).toBe(false);
    expect(isTerminalCycleStage("executing")).toBe(false);
    expect(isTerminalCycleStage("reviewing")).toBe(false);
  });

  it("requires a closing cycle to have produced at least one lesson", () => {
    expect(MIN_LESSONS_FOR_CLOSURE).toBe(1);
    expect(MIN_LESSONS_FOR_CLOSURE).toBeGreaterThan(0);
  });
});

describe("capability areas", () => {
  it("declares exactly ten areas", () => {
    expect(CAPABILITY_AREAS).toHaveLength(10);
    expect(CAPABILITY_AREA_COUNT).toBe(10);
    expect(CAPABILITY_AREA_COUNT).toBe(CAPABILITY_AREAS.length);
  });

  it("names every area uniquely", () => {
    expect(new Set(CAPABILITY_AREAS).size).toBe(CAPABILITY_AREAS.length);
  });

  it("recognizes every declared area", () => {
    for (const area of CAPABILITY_AREAS) {
      expect(isCapabilityArea(area)).toBe(true);
    }
  });

  it("rejects a string that does not name an area, including near-misses and casing", () => {
    expect(isCapabilityArea("governance")).toBe(false);
    expect(isCapabilityArea("Academic_Practice")).toBe(false);
    expect(isCapabilityArea("")).toBe(false);
  });

  it("spans the institution rather than one part of it", () => {
    expect(CAPABILITY_AREAS).toContain("governance_and_leadership");
    expect(CAPABILITY_AREAS).toContain("academic_practice");
    expect(CAPABILITY_AREAS).toContain("learner_support");
    expect(CAPABILITY_AREAS).toContain("financial_stewardship");
    expect(CAPABILITY_AREAS).toContain("safeguarding_and_compliance");
  });

  it("assesses this domain's own capability, exempting nothing", () => {
    expect(CAPABILITY_AREAS).toContain("continuous_improvement");
  });
});

describe("maturity levels", () => {
  it("declares five levels, ascending", () => {
    expect(MATURITY_LEVELS).toEqual(["initial", "developing", "defined", "managed", "optimizing"]);
  });

  it("recognizes every declared level", () => {
    for (const level of MATURITY_LEVELS) {
      expect(isMaturityLevel(level)).toBe(true);
    }
  });

  it("rejects a level it does not declare", () => {
    expect(isMaturityLevel("advanced")).toBe(false);
    expect(isMaturityLevel("Optimizing")).toBe(false);
  });

  it("ranks a level by its position, lowest at zero", () => {
    expect(levelRank("initial")).toBe(0);
    expect(levelRank("optimizing")).toBe(MATURITY_LEVELS.length - 1);
  });

  it("ranks each level strictly above the one below it", () => {
    for (let index = 1; index < MATURITY_LEVELS.length; index += 1) {
      const previous = MATURITY_LEVELS[index - 1]!;
      const current = MATURITY_LEVELS[index]!;
      expect(levelRank(current)).toBeGreaterThan(levelRank(previous));
    }
  });

  it("bounds the score scale at one and five", () => {
    expect(MIN_MATURITY_SCORE).toBe(1);
    expect(MAX_MATURITY_SCORE).toBe(5);
  });

  it("gives every level a floor", () => {
    for (const level of MATURITY_LEVELS) {
      expect(LEVEL_FLOORS[level]).toBeTypeOf("number");
    }
    expect(Object.keys(LEVEL_FLOORS).sort()).toEqual([...MATURITY_LEVELS].sort());
  });

  it("keeps every floor on the score scale", () => {
    for (const level of MATURITY_LEVELS) {
      expect(LEVEL_FLOORS[level]).toBeGreaterThanOrEqual(MIN_MATURITY_SCORE);
      expect(LEVEL_FLOORS[level]).toBeLessThanOrEqual(MAX_MATURITY_SCORE);
    }
  });

  it("raises each floor strictly above the level below it", () => {
    for (let index = 1; index < MATURITY_LEVELS.length; index += 1) {
      const previous = MATURITY_LEVELS[index - 1]!;
      const current = MATURITY_LEVELS[index]!;
      expect(LEVEL_FLOORS[current]).toBeGreaterThan(LEVEL_FLOORS[previous]);
    }
  });

  it("starts the lowest level at the bottom of the scale and the highest at the top", () => {
    expect(LEVEL_FLOORS.initial).toBe(MIN_MATURITY_SCORE);
    expect(LEVEL_FLOORS.optimizing).toBe(MAX_MATURITY_SCORE);
  });

  it("freezes the floors, so no caller can move a level under everyone else", () => {
    expect(Object.isFrozen(LEVEL_FLOORS)).toBe(true);
    expect(() => {
      (LEVEL_FLOORS as Record<string, number>).managed = 1;
    }).toThrow(TypeError);
    expect(LEVEL_FLOORS.managed).toBe(4);
  });
});

describe("assessment coverage and weighting", () => {
  it("requires most of the areas to have reported before a score can be published", () => {
    expect(MIN_AREA_COVERAGE).toBe(0.7);
    expect(MIN_AREA_COVERAGE).toBeGreaterThan(0.5);
    expect(MIN_AREA_COVERAGE).toBeLessThanOrEqual(1);
  });

  it("requires an area to cite something before it counts as having reported", () => {
    expect(MIN_EVIDENCE_PER_AREA).toBe(1);
    expect(MIN_EVIDENCE_PER_AREA).toBeGreaterThan(0);
  });

  it("fixes the derived precision so a reassessment is checkable against its prior", () => {
    expect(MATURITY_PRECISION).toBe(2);
    expect(MATURITY_PRECISION).toBeGreaterThan(0);
  });

  it("rounds declared weights more finely than derived values", () => {
    expect(WEIGHT_PRECISION).toBe(4);
    expect(WEIGHT_PRECISION).toBeGreaterThan(MATURITY_PRECISION);
  });

  it("caps any single capability below a majority of the score", () => {
    expect(MAX_AREA_WEIGHT).toBe(0.5);
    expect(MAX_AREA_WEIGHT).toBeLessThan(WEIGHT_SUM);
  });

  it("keeps a present area from weighing nothing", () => {
    expect(MIN_AREA_WEIGHT).toBe(0.01);
    expect(MIN_AREA_WEIGHT).toBeGreaterThan(0);
    expect(MIN_AREA_WEIGHT).toBeLessThan(MAX_AREA_WEIGHT);
  });

  it("leaves a balanced weight set reachable across ten areas", () => {
    expect(MIN_AREA_WEIGHT * CAPABILITY_AREA_COUNT).toBeLessThanOrEqual(WEIGHT_SUM);
    expect(MAX_AREA_WEIGHT * CAPABILITY_AREA_COUNT).toBeGreaterThanOrEqual(WEIGHT_SUM);
  });

  it("allows an equal split without tripping either bound", () => {
    const equal = WEIGHT_SUM / CAPABILITY_AREA_COUNT;
    expect(equal).toBeGreaterThanOrEqual(MIN_AREA_WEIGHT);
    expect(equal).toBeLessThanOrEqual(MAX_AREA_WEIGHT);
  });

  it("sums weights to one within a rounding allowance rather than a licence", () => {
    expect(WEIGHT_SUM).toBe(1);
    expect(WEIGHT_TOLERANCE).toBe(1e-6);
    expect(WEIGHT_TOLERANCE).toBeGreaterThan(0);
    expect(WEIGHT_TOLERANCE).toBeLessThan(MIN_AREA_WEIGHT);
  });
});

describe("benefit realization", () => {
  it("declares two directions, each once", () => {
    expect(BENEFIT_DIRECTIONS).toEqual(["increase", "decrease"]);
  });

  it("recognizes every declared direction", () => {
    for (const direction of BENEFIT_DIRECTIONS) {
      expect(isBenefitDirection(direction)).toBe(true);
    }
    expect(isBenefitDirection("maintain")).toBe(false);
  });

  it("declares four variance bands, each once", () => {
    expect(VARIANCE_BANDS).toEqual(["exceeded", "met", "shortfall", "missed"]);
    expect(new Set(VARIANCE_BANDS).size).toBe(VARIANCE_BANDS.length);
  });

  it("recognizes every declared band", () => {
    for (const band of VARIANCE_BANDS) {
      expect(isVarianceBand(band)).toBe(true);
    }
    expect(isVarianceBand("partial")).toBe(false);
  });

  it("gives a floor to every band except the one everything else falls into", () => {
    expect(Object.keys(VARIANCE_FLOORS).sort()).toEqual(["exceeded", "met", "shortfall"].sort());
    expect(VARIANCE_FLOORS).not.toHaveProperty("missed");
  });

  it("orders the floors strictly downward as the outcome worsens", () => {
    expect(VARIANCE_FLOORS.exceeded).toBeGreaterThan(VARIANCE_FLOORS.met);
    expect(VARIANCE_FLOORS.met).toBeGreaterThan(VARIANCE_FLOORS.shortfall);
  });

  it("counts ninety per cent of a promised benefit as met, so nobody learns to promise less", () => {
    expect(VARIANCE_FLOORS.met).toBe(0.9);
    expect(VARIANCE_FLOORS.met).toBeLessThan(1);
    expect(VARIANCE_FLOORS.exceeded).toBeGreaterThan(1);
  });

  it("freezes the floors", () => {
    expect(Object.isFrozen(VARIANCE_FLOORS)).toBe(true);
    expect(() => {
      (VARIANCE_FLOORS as Record<string, number>).met = 0.1;
    }).toThrow(TypeError);
    expect(VARIANCE_FLOORS.met).toBe(0.9);
  });

  it("declares four realization verdicts, each once", () => {
    expect(REALIZATION_VERDICTS).toEqual(["sustained", "adjust", "revert", "inconclusive"]);
    expect(new Set(REALIZATION_VERDICTS).size).toBe(REALIZATION_VERDICTS.length);
  });

  it("recognizes every declared verdict", () => {
    for (const verdict of REALIZATION_VERDICTS) {
      expect(isRealizationVerdict(verdict)).toBe(true);
    }
    expect(isRealizationVerdict("reverted")).toBe(false);
  });

  it("lets a review say the answer is not yet known", () => {
    expect(REALIZATION_VERDICTS).toContain("inconclusive");
  });

  it("recommends reversion rather than performing it, which is what the gate is for", () => {
    expect(REALIZATION_VERDICTS).toContain("revert");
    expect(GOVERNANCE_GATES).toContain("reversion");
  });
});

describe("periods", () => {
  it("bounds the period index at both ends", () => {
    expect(MIN_PERIOD).toBe(0);
    expect(MAX_PERIOD).toBe(1_000_000);
    expect(isValidPeriod(MIN_PERIOD)).toBe(true);
    expect(isValidPeriod(MAX_PERIOD)).toBe(true);
  });

  it("rejects a period outside the bounds", () => {
    expect(isValidPeriod(MIN_PERIOD - 1)).toBe(false);
    expect(isValidPeriod(MAX_PERIOD + 1)).toBe(false);
  });

  it("rejects anything that is not a safe whole number", () => {
    expect(isValidPeriod(4.5)).toBe(false);
    expect(isValidPeriod(Number.NaN)).toBe(false);
    expect(isValidPeriod(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidPeriod(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isValidPeriod(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
  });

  it("accepts an ordinary period", () => {
    expect(isValidPeriod(1)).toBe(true);
    expect(isValidPeriod(24)).toBe(true);
  });
});

describe("numeric helpers", () => {
  it("admits only finite numbers as measures", () => {
    expect(isFiniteMeasure(0)).toBe(true);
    expect(isFiniteMeasure(-3.25)).toBe(true);
    expect(isFiniteMeasure(Number.NaN)).toBe(false);
    expect(isFiniteMeasure(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteMeasure(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("rounds a derived maturity value to two places", () => {
    expect(roundMaturity(1 / 3)).toBe(0.33);
    expect(roundMaturity(2 / 3)).toBe(0.67);
    expect(roundMaturity(3.14159)).toBe(3.14);
  });

  it("rounds a declared weight to four places", () => {
    expect(roundWeight(1 / 6)).toBe(0.1667);
    expect(roundWeight(0.12345)).toBe(0.1235);
  });

  it("resolves the halfway case away from zero, symmetrically", () => {
    expect(roundMaturity(0.005)).toBe(0.01);
    expect(roundMaturity(-0.005)).toBe(-0.01);
    expect(roundWeight(0.00005)).toBe(0.0001);
    expect(roundWeight(-0.00005)).toBe(-0.0001);
  });

  it("avoids floating-point drift on a value that would otherwise round short", () => {
    expect(roundMaturity(1.005)).toBe(1.01);
    expect(roundMaturity(4.345)).toBe(4.35);
  });

  it("is stable under repeated rounding", () => {
    const maturity = roundMaturity(Math.PI);
    expect(roundMaturity(maturity)).toBe(maturity);
    const weight = roundWeight(1 / 7);
    expect(roundWeight(weight)).toBe(weight);
  });

  it("normalizes a rounded zero, so a delta of nothing serializes identically either way", () => {
    expect(Object.is(roundMaturity(-0), 0)).toBe(true);
    expect(Object.is(roundMaturity(-0.0001), 0)).toBe(true);
    expect(Object.is(roundWeight(-0.000001), 0)).toBe(true);
  });

  it("rounds a non-finite value to zero rather than propagating it", () => {
    expect(roundMaturity(Number.NaN)).toBe(0);
    expect(roundMaturity(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundWeight(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("leaves a score already on the scale untouched", () => {
    expect(clampMaturityScore(MIN_MATURITY_SCORE)).toBe(MIN_MATURITY_SCORE);
    expect(clampMaturityScore(MAX_MATURITY_SCORE)).toBe(MAX_MATURITY_SCORE);
    expect(clampMaturityScore(3.4)).toBe(3.4);
  });

  it("clamps a score off either end of the scale", () => {
    expect(clampMaturityScore(0)).toBe(MIN_MATURITY_SCORE);
    expect(clampMaturityScore(-12)).toBe(MIN_MATURITY_SCORE);
    expect(clampMaturityScore(9)).toBe(MAX_MATURITY_SCORE);
  });

  it("floors a non-finite score rather than ceilinging it, so nothing scores top by accident", () => {
    expect(clampMaturityScore(Number.NaN)).toBe(MIN_MATURITY_SCORE);
    expect(clampMaturityScore(Number.POSITIVE_INFINITY)).toBe(MIN_MATURITY_SCORE);
    expect(clampMaturityScore(Number.NEGATIVE_INFINITY)).toBe(MIN_MATURITY_SCORE);
  });
});

describe("deliberate absences", () => {
  const vocabulary: readonly string[] = [
    ...EVOLUTION_SCOPES,
    ...EVIDENCE_KINDS,
    ...SIGNAL_SOURCES,
    ...SIGNAL_STATUSES,
    ...SIGNAL_PRIORITIES,
    ...CHANGE_CLASSES,
    ...INITIATIVE_STATUSES,
    ...GOVERNANCE_GATES,
    ...DECISION_VERDICTS,
    ...GATE_OUTCOMES,
    ...LESSON_CATEGORIES,
    ...LESSON_ORIGINS,
    ...LESSON_RETENTIONS,
    ...CYCLE_STAGES,
    ...CAPABILITY_AREAS,
    ...MATURITY_LEVELS,
    ...BENEFIT_DIRECTIONS,
    ...VARIANCE_BANDS,
    ...REALIZATION_VERDICTS,
  ];

  // Compared as whole segments rather than as substrings, because `reversion` legitimately contains
  // "version" — and the gate that undoes an institutional change is the opposite of a platform version.
  const segments = new Set(vocabulary.flatMap((word) => word.split(/[:_]/)));

  it("names nothing that enacts a change", () => {
    for (const term of [
      "deploy",
      "deployment",
      "release",
      "rollout",
      "flag",
      "schedule",
      "publish",
    ]) {
      expect(segments.has(term)).toBe(false);
    }
  });

  it("names nothing about the platform modifying itself", () => {
    for (const term of ["version", "config", "schema", "migration", "runtime", "model"]) {
      expect(segments.has(term)).toBe(false);
    }
    expect(GOVERNANCE_GATES).toContain("reversion");
  });

  it("names no governance body, because a decision record outlives the committee", () => {
    for (const term of ["committee", "board", "meeting", "minutes", "quorum", "panel"]) {
      expect(segments.has(term)).toBe(false);
    }
  });

  it("names no job title, because authority is a granted scope and not a role", () => {
    for (const term of ["principal", "head", "teacher", "trustee", "admin", "manager"]) {
      expect(segments.has(term)).toBe(false);
    }
  });
});
