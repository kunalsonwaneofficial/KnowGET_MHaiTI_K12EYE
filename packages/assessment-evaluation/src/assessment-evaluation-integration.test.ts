import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { AcademicRecordService } from "./academic-record-service";
import type { GradeEntry } from "./academic-record-value";
import { AssessmentAnalyticsService } from "./assessment-analytics-service";
import { AssessmentFrameworkService } from "./assessment-framework-service";
import { AssessmentService } from "./assessment-service";
import { CompetencyProfileService } from "./competency-profile-service";
import { EvaluationService } from "./evaluation-service";
import { gradeMarks } from "./grading";
import {
  InMemoryAcademicRecordRepository,
  InMemoryAssessmentFrameworkRepository,
  InMemoryAssessmentRepository,
  InMemoryCompetencyProfileRepository,
  InMemoryEvaluationRepository,
  type OrganizationDirectory,
  type StudentDirectory,
  type SubjectDirectory,
} from "./ports";
import { ReportingService } from "./reporting-service";

const TENANT = "t1" as TenantId;
const ORG = "org-1" as Uuid;
const SUBJECT = "subj-1" as Uuid;
const STUDENT = "stu-1" as Uuid;
const OUTCOME = "o1" as Uuid;

const allow = (allowed: readonly string[]) => ({
  exists: async (_t: TenantId, id: Uuid) => allowed.includes(id),
});

/**
 * End-to-end: define a governing framework with grade bands, run an assessment to completion,
 * evaluate the learner, grow a competency, then grade the term into a published academic record —
 * and read the report card, transcript, competency report and analytics indicators back. Grades
 * flow through the same pure grading engine that produces the record, so the report card's GPA,
 * the transcript's cumulative GPA and the analytics' average performance are consistent end to
 * end. Competency mastery is tracked independently of the raw marks.
 */
describe("assessment-evaluation integration", () => {
  it("frameworks, assesses, evaluates, records and reports consistently", async () => {
    const frameworkRepo = new InMemoryAssessmentFrameworkRepository();
    const assessmentRepo = new InMemoryAssessmentRepository();
    const evaluationRepo = new InMemoryEvaluationRepository();
    const competencyRepo = new InMemoryCompetencyProfileRepository();
    const recordRepo = new InMemoryAcademicRecordRepository();
    const organizations = allow([ORG]) as OrganizationDirectory;
    const subjects = allow([SUBJECT]) as SubjectDirectory;
    const students = allow([STUDENT]) as StudentDirectory;

    const frameworks = new AssessmentFrameworkService({ repository: frameworkRepo, organizations });
    const assessments = new AssessmentService({
      repository: assessmentRepo,
      organizations,
      subjects,
      frameworks: frameworkRepo,
    });
    const evaluations = new EvaluationService({
      repository: evaluationRepo,
      assessments: assessmentRepo,
      students,
    });
    const competencies = new CompetencyProfileService({
      repository: competencyRepo,
      organizations,
      students,
    });
    const records = new AcademicRecordService({ repository: recordRepo, organizations, students });
    const reporting = new ReportingService({
      academicRecords: recordRepo,
      competencyProfiles: competencyRepo,
    });
    const analytics = new AssessmentAnalyticsService({
      assessments: assessmentRepo,
      evaluations: evaluationRepo,
      competencyProfiles: competencyRepo,
    });

    // Governing framework with a simple grade band model.
    const bands = [
      { label: "A", minPercentage: 80, gpa: 9 },
      { label: "B", minPercentage: 60, gpa: 8 },
      { label: "C", minPercentage: 40, gpa: 6 },
    ];
    const framework = await frameworks.create({
      tenantId: TENANT,
      organizationId: ORG,
      code: "CBSE-2026",
      name: "CBSE 2026",
      assessmentModel: "cce",
      gradeBands: bands,
    });
    await frameworks.activate(TENANT, framework.id);

    // Assessment targeting one outcome, run to completion.
    const assessment = await assessments.create({
      tenantId: TENANT,
      organizationId: ORG,
      subjectId: SUBJECT,
      assessmentType: "summative",
      title: "Term 1 Exam",
      frameworkId: framework.id,
      learningOutcomeIds: [OUTCOME],
      maximumMarks: 50,
    });
    await assessments.publish(TENANT, assessment.id);
    await assessments.start(TENANT, assessment.id);
    await assessments.complete(TENANT, assessment.id);

    // Evaluate the learner: 40 / 50 = 80% (grade A), approved.
    const evaluation = await evaluations.create({
      tenantId: TENANT,
      assessmentId: assessment.id,
      studentId: STUDENT,
    });
    const marked = await evaluations.recordMarks(TENANT, evaluation.id, 40);
    expect(marked.percentage).toBe(80);
    await evaluations.submit(TENANT, evaluation.id);
    await evaluations.approve(TENANT, evaluation.id);

    // Grow a competency to proficient (independent of the raw marks).
    const profile = await competencies.ensure(TENANT, ORG, STUDENT);
    await competencies.setMastery(TENANT, profile.id, {
      competencyId: "c1",
      name: "Problem solving",
      masteryLevel: "proficient",
    });

    // Grade the term into an academic record through the same grading engine.
    const graded = gradeMarks(marked.marksAwarded ?? 0, assessment.maximumMarks, bands);
    const entry: GradeEntry = {
      subjectId: SUBJECT,
      marks: marked.marksAwarded ?? 0,
      maxMarks: assessment.maximumMarks,
      percentage: graded.percentage,
      grade: graded.grade,
      gpa: graded.gpa,
      credits: 5,
    };
    const record = await records.create({
      tenantId: TENANT,
      organizationId: ORG,
      studentId: STUDENT,
      academicYear: "2026-27",
      term: "Term 1",
      gradeEntries: [entry],
    });
    expect(record.gpa).toBe(9);
    await records.setPromotionDecision(TENANT, record.id, "promoted");
    await records.publish(TENANT, record.id);

    // Report card projects the record faithfully.
    const reportCard = await reporting.generateReportCard(TENANT, STUDENT, "2026-27", "Term 1");
    expect(reportCard.subjects).toHaveLength(1);
    expect(reportCard.subjects[0]?.grade).toBe("A");
    expect(reportCard.gpa).toBe(9);
    expect(reportCard.promotionDecision).toBe("promoted");
    expect(reportCard.status).toBe("published");

    // Transcript's cumulative GPA is consistent with the term GPA.
    const transcript = await reporting.generateTranscript(TENANT, STUDENT);
    expect(transcript.terms).toHaveLength(1);
    expect(transcript.cumulativeGpa).toBe(9);
    expect(transcript.totalCredits).toBe(5);

    // Competency report is driven by mastery, not marks.
    const competencyReport = await reporting.generateCompetencyReport(TENANT, STUDENT);
    expect(competencyReport.competenciesTracked).toBe(1);
    expect(competencyReport.masteredCompetencies).toBe(1);
    expect(competencyReport.competencies[0]?.proficient).toBe(true);

    // Analytics: subject coverage and performance line up with the completed, approved work.
    const subjectIndicators = await analytics.forSubject(TENANT, SUBJECT);
    expect(subjectIndicators.assessmentsCompleted).toBe(1);
    expect(subjectIndicators.evaluationsApproved).toBe(1);
    expect(subjectIndicators.evaluationApprovalRate).toBe(100);
    expect(subjectIndicators.averagePerformance).toBe(80);
    expect(subjectIndicators.curriculumCoverage).toBe(100);

    // Analytics: learner mastery reflects the proficient competency (60 on the 0–1 scale × 100).
    const studentIndicators = await analytics.forStudent(TENANT, STUDENT);
    expect(studentIndicators.competenciesTracked).toBe(1);
    expect(studentIndicators.masteredCompetencies).toBe(1);
    expect(studentIndicators.competencyMastery).toBe(60);
    expect(studentIndicators.averagePerformance).toBe(80);

    // Organization rollup sees the same single record set.
    const orgIndicators = await analytics.forOrganization(TENANT, ORG);
    expect(orgIndicators.assessmentsCompleted).toBe(1);
    expect(orgIndicators.evaluationsApproved).toBe(1);
    expect(orgIndicators.competenciesTracked).toBe(1);
  });
});
