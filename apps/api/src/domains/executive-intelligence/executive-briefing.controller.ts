import type { Principal } from "@knowget/auth";
import { type ExecutiveBriefing, ExecutiveBriefingService } from "@knowget/executive-intelligence";
import type { Uuid } from "@knowget/types";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CurrentPrincipal, RequirePermissions } from "../../platform/security/decorators";
import {
  COMMAND_BRIEF,
  COMMAND_READ,
  parseBody,
  scopesOf,
  tenantOf,
} from "./executive-intelligence-http";
import {
  draftBriefingSchema,
  reviseBriefingSchema,
  setBriefingFindingsSchema,
  withdrawBriefingSchema,
} from "./executive-intelligence.dto";
import { EI_BRIEFING_SERVICE } from "./executive-intelligence.tokens";

/**
 * REST surface for executive briefings (P2-D29) — what the institution told its leadership, and when.
 *
 * A briefing is a document an institution stood behind on a date, which is why it has its own scope. Computing
 * a score and telling a board about it are different acts: the first is arithmetic the platform can check, the
 * second is a statement the institution answers for, and the ability to run an assessment is not the ability to
 * report one under the institution's name.
 *
 * The figure is pinned at drafting rather than read back through the assessment. That is the single most
 * important thing about this aggregate. A board pack whose numbers were resolved live would silently restate
 * itself when the assessment behind it was later invalidated — the minute would keep saying "as reported to the
 * board" while displaying a figure the board never saw. So the recorded index is copied in, and `assessmentId`
 * says which arithmetic it came from without making the document depend on that arithmetic still standing.
 *
 * Reads are filtered by audience rather than composed down, which is the opposite of what dashboards do and is
 * deliberate. A dashboard whose panels a reader is withheld composes to an empty page, and an empty page is a
 * coherent thing to be served; a briefing with its unreachable findings stripped out would be an argument
 * presented without the evidence it rests on — worse than being told the document is not for you.
 *
 * Nothing is deleted. A briefing the institution no longer stands behind is withdrawn, because the minute that
 * cites it still has to resolve: to the document, and to the fact that it was taken back.
 */
@Controller("command/briefings")
export class ExecutiveBriefingController {
  constructor(@Inject(EI_BRIEFING_SERVICE) private readonly service: ExecutiveBriefingService) {}

  /**
   * Open a briefing against a filed assessment, pinning its figure.
   *
   * Nothing about the score is restated on the wire — the assessment is named by id and the document copies what
   * that assessment recorded, so a board pack cannot quietly disagree with the arithmetic it claims to report.
   * The domain refuses an assessment that is not final, because drafting a board pack from a figure still being
   * argued about is exactly how a provisional number becomes a reported one.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Post()
  @HttpCode(201)
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<ExecutiveBriefing> {
    const dto = parseBody(draftBriefingSchema, body);
    return this.service.draft(tenantOf(principal), dto.assessmentId as Uuid, {
      briefingKey: dto.briefingKey,
      title: dto.title,
      narrative: dto.narrative ?? null,
      audienceScope: dto.audienceScope,
      findings: dto.findings,
    });
  }

  /**
   * Restate the title or the narrative of a draft. The cited figure is not among them: it was pinned at
   * drafting, and a route that let the prose and the number move independently would be a way to say something
   * other than what the assessment found while still citing it.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Post(":id/revise")
  @HttpCode(200)
  async revise(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ExecutiveBriefing> {
    const dto = parseBody(reviseBriefingSchema, body);
    return this.service.revise(tenantOf(principal), id as Uuid, dto);
  }

  /**
   * Replace the findings, whole. What a document leads with is one editorial judgement rather than several, and
   * the domain checks the set against the assessment it cites — a finding about a period the briefing does not
   * report would be an alarm attached to the wrong evidence.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Post(":id/findings")
  @HttpCode(200)
  async setFindings(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ExecutiveBriefing> {
    const dto = parseBody(setBriefingFindingsSchema, body);
    return this.service.setFindings(tenantOf(principal), id as Uuid, dto.findings);
  }

  /** Issue the document. From here it is something the institution has said, and revision is closed. */
  @RequirePermissions(COMMAND_BRIEF)
  @Post(":id/issue")
  @HttpCode(200)
  async issue(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutiveBriefing> {
    return this.service.issue(tenantOf(principal), id as Uuid);
  }

  /**
   * Take back a briefing the institution no longer stands behind.
   *
   * The reason is optional, unlike a reading withdrawal, because a withdrawn briefing keeps its whole text and
   * its pinned figure — the record can still show precisely what was said, and often why it no longer holds is
   * visible in the assessment beside it. A withdrawn reading leaves nothing behind that explains itself.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Post(":id/withdraw")
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ExecutiveBriefing> {
    const dto = parseBody(withdrawBriefingSchema, body);
    return this.service.withdraw(tenantOf(principal), id as Uuid, dto.reason ?? null);
  }

  @RequirePermissions(COMMAND_READ)
  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<readonly ExecutiveBriefing[]> {
    return this.service.list(tenantOf(principal));
  }

  /**
   * The reader's path: an issued briefing this principal is actually among the audience for.
   *
   * The granted set comes from the authenticated principal and never from the request, for the same reason it
   * does on a dashboard — an audience a caller could nominate is not an audience. A document outside the
   * reader's audience answers as absent rather than as forbidden, because "there is a board briefing about this
   * quarter that you may not read" is itself a disclosure about the institution's state.
   */
  @RequirePermissions(COMMAND_READ)
  @Get("view/:briefingKey")
  async view(
    @CurrentPrincipal() principal: Principal,
    @Param("briefingKey") briefingKey: string,
  ): Promise<ExecutiveBriefing> {
    return this.service.view(tenantOf(principal), briefingKey, scopesOf(principal));
  }

  /** The issued briefings this principal is among the audience for, most recent period first. */
  @RequirePermissions(COMMAND_READ)
  @Get("visible/:organizationId")
  async listVisible(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ExecutiveBriefing[]> {
    return this.service.listVisible(
      tenantOf(principal),
      organizationId as Uuid,
      scopesOf(principal),
    );
  }

  /**
   * Every issued briefing an organization stands behind, audience filtering aside. Gated by `command:brief`
   * because it is the author's and archivist's read: knowing which documents exist and who each was addressed
   * to is the map of an institution's reporting that {@link listVisible} deliberately does not hand out.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Get("issued/:organizationId")
  async listIssued(
    @CurrentPrincipal() principal: Principal,
    @Param("organizationId") organizationId: string,
  ): Promise<readonly ExecutiveBriefing[]> {
    return this.service.listIssued(tenantOf(principal), organizationId as Uuid);
  }

  /**
   * Every briefing drawn from one assessment, whatever became of it — the read that answers "what did we tell
   * people about this figure". Withdrawals are included on purpose: a document that was issued and taken back is
   * part of that answer rather than an erasure of it.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Get("by-assessment/:assessmentId")
  async listByAssessment(
    @CurrentPrincipal() principal: Principal,
    @Param("assessmentId") assessmentId: string,
  ): Promise<readonly ExecutiveBriefing[]> {
    return this.service.listByAssessment(tenantOf(principal), assessmentId as Uuid);
  }

  /** The briefing a tenant keeps under a key, at any status — the author's lookup, not the reader's. */
  @RequirePermissions(COMMAND_BRIEF)
  @Get("by-key/:briefingKey")
  async getByKey(
    @CurrentPrincipal() principal: Principal,
    @Param("briefingKey") briefingKey: string,
  ): Promise<ExecutiveBriefing> {
    return this.service.getByKey(tenantOf(principal), briefingKey);
  }

  /**
   * The document by id, unfiltered by audience. Gated by `command:brief` rather than the read scope: a briefing
   * fetched this way bypasses the audience check entirely, so the route belongs to the people who write and keep
   * these documents and not to everyone permitted to read the ones addressed to them.
   */
  @RequirePermissions(COMMAND_BRIEF)
  @Get(":id")
  async getById(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
  ): Promise<ExecutiveBriefing> {
    return this.service.get(tenantOf(principal), id as Uuid);
  }
}
