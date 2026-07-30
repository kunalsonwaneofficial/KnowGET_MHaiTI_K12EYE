import {
  APPLICATION_OFFERED,
  APPLICATION_REJECTED,
  ENROLLMENT_CONFIRMED,
  OFFER_ACCEPTED,
  OFFER_DECLINED,
} from "@knowget/admissions";
import { ToolNotFoundError, type ToolService } from "@knowget/agent-orchestration";
import { ASSESSMENT_PUBLISHED, REPORT_CARD_GENERATED } from "@knowget/assessment-evaluation";
import { ATTENDANCE_THRESHOLD_REACHED } from "@knowget/attendance-presence";
import {
  INVOICE_CANCELLED,
  INVOICE_ISSUED,
  INVOICE_OVERDUE,
  INVOICE_PAID,
  PAYMENT_CLEARED,
  PAYMENT_FAILED,
  PAYMENT_RECORDED,
  PAYMENT_REFUNDED,
} from "@knowget/financial";
import {
  type AdapterRegistry,
  type CapabilityTargetDirectory,
  type EventTypeCatalogue,
  type IntegrationProtocol,
  type OrganizationDirectory,
  type PersonDirectory,
  type ScopeCatalogue,
  normalizeKey,
} from "@knowget/gateway";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { RoleService } from "@knowget/roles";
import {
  STUDENT_ENROLLED,
  STUDENT_GRADUATED,
  STUDENT_PROMOTED,
  STUDENT_TRANSFERRED,
  STUDENT_WITHDRAWN,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01). Every consumer, contract, route,
 * policy, endpoint, subscription, delivery and ledger row in the fabric hangs off an organization node, and the
 * directory answers existence so the gateway validates it without depending on `@knowget/organization`.
 */
export class OrganizationServiceDirectory implements OrganizationDirectory {
  constructor(private readonly organizations: OrganizationService) {}

  async exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean> {
    try {
      await this.organizations.getById(tenantId, organizationId);
      return true;
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link PersonDirectory} backed by the person service (P2-D01-M02).
 *
 * An owner is the one field on a consumer that may never be null, because every integration reaching into an
 * institution is somebody's responsibility. An identifier that satisfies the field and resolves to nobody defeats
 * the reason the field exists, and it is discovered at the worst possible moment — when somebody is trying to find
 * out who authorised the integration that is currently misbehaving. The same check runs over whoever registered a
 * consumer and whoever published a contract version, for the same reason at lower stakes.
 */
export class PersonServiceDirectory implements PersonDirectory {
  constructor(private readonly people: PersonService) {}

  async exists(tenantId: TenantId, personId: Uuid): Promise<boolean> {
    try {
      await this.people.getById(tenantId, personId);
      return true;
    } catch (error) {
      if (error instanceof PersonNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * {@link ScopeCatalogue} backed by the roles domain (P2-D01-M04).
 *
 * The platform has no separate register of scopes, and inventing one here would be inventing a second
 * authorization vocabulary that could disagree with the first. What it has is roles, whose permissions are the
 * opaque action strings the authorization engine actually checks — so a scope exists when some role in the tenant
 * declares it. That makes the answer to *is this a scope* the same answer as *is there anything in this
 * institution that grants it*, which is the question both callers of this port are really asking: a grant naming a
 * string no role declares is a permission that can never be satisfied, and a route requiring one is an address
 * nobody can ever hold the credential for.
 *
 * Archived roles contribute nothing. An archived role grants nothing to anybody, so a scope surviving only in one
 * is a scope the institution has withdrawn, and honouring it would let a route be published requiring a credential
 * the platform no longer issues — the quiet failure this port exists to prevent, arriving by the back door.
 *
 * The comparison is made over normalized permission strings because the two domains normalize differently and the
 * difference is exactly the size of this bug. The roles domain trims a permission and leaves its case alone; the
 * gateway lowercases every key, so a scope reaches this method already lowercased. A role declaring `Student.Read`
 * would therefore never match a route requiring `student.read`, and the registration would be refused with a
 * message saying the platform does not define a scope the platform does define.
 *
 * The wildcard needs no special handling and it is worth saying why, because its absence from the code is easy to
 * read as an oversight. A role holding `*` grants everything, and `*` is not a valid gateway key, so it can never
 * arrive as the argument here — the package's own grammar refuses it several layers up. What it does mean is that
 * a wildcard role declares no scope *names*: this catalogue reports what an institution's roles enumerate rather
 * than what they effectively permit, so a tenant whose only administrator role is a wildcard has an empty
 * catalogue and cannot publish routes until somebody writes down what the integrations are allowed to do. That is
 * the intended shape. Enumerating the permissions an external integration will hold is the review the wildcard
 * exists to skip, and it is not a review a gateway should let anybody skip.
 *
 * The answer is deliberately not cached, and both directions of staleness are live. A cached miss refuses a
 * legitimate grant seconds after an administrator defined the scope for it; a cached hit publishes a route
 * requiring a scope whose last declaring role was archived this morning. Each is one of the two failures the port
 * describes. The read is bounded by how many roles an institution defines, and it runs on a write path an
 * administrator is already waiting on.
 */
export class RoleScopeCatalogue implements ScopeCatalogue {
  constructor(private readonly roles: RoleService) {}

  async exists(tenantId: TenantId, scope: string): Promise<boolean> {
    const wanted = normalizeKey(scope);
    const roles = await this.roles.list(tenantId);
    return roles.some(
      (role) =>
        role.status === "active" &&
        role.permissions.some((permission) => normalizeKey(permission) === wanted),
    );
  }
}

/**
 * {@link CapabilityTargetDirectory} backed by the AI capability catalog (P2-D26).
 *
 * A route's `internalTarget` is the one field the fabric holds and never discloses, and precisely because nobody
 * outside sees it, nobody outside will notice it is wrong. The catalog is the platform's register of addressable
 * capabilities and the only place a target can be checked against something that answers, so a target resolves
 * when the catalog holds it *and* it is active: a draft has never been cleared to run and a deprecated one has
 * been withdrawn, so both answer `false` even though the key still resolves.
 *
 * Checking at registration puts the cost on whoever is publishing the route, who still has the correct target to
 * hand. Skipping it moves that cost onto an integrator who has pinned to a published contract, written code
 * against it, and is now receiving a failure they cannot see the cause of and cannot fix from their side.
 *
 * As with every other resolution behind this fabric the answer is not cached, because a capability can be
 * deprecated between the registration of a route and the revision of it, and a stale `true` is how a withdrawn
 * capability ends up with a public address pointing at it.
 */
export class ToolCatalogTargetDirectory implements CapabilityTargetDirectory {
  constructor(private readonly tools: ToolService) {}

  async resolves(tenantId: TenantId, internalTarget: string): Promise<boolean> {
    try {
      const tool = await this.tools.getByKey(tenantId, internalTarget);
      return tool.status === "active";
    } catch (error) {
      if (error instanceof ToolNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

/**
 * Every adapter this deployment has built, and the protocols each one speaks.
 *
 * It is empty, and that is the honest state of the platform rather than a stub. No code anywhere in this
 * repository opens an outbound socket: there is no HTTPS client, no mail transport, no message-broker producer and
 * no file-transfer client, and the notification domain ships its channel contract ahead of a transport for the
 * same reason. An adapter key here is a claim that something on this side can hold a conversation with a vendor,
 * and there is currently nothing to claim.
 */
const ADAPTER_MANIFEST: ReadonlyMap<string, readonly IntegrationProtocol[]> = new Map();

/**
 * {@link AdapterRegistry} declared in code at the composition root.
 *
 * The registry is code and not configuration because an adapter *is* code: a key that no shipped adapter answers
 * to is a promise the deployment cannot keep, and a table an operator can type into is a way of making that
 * promise by accident. Declaring it beside the module that wires the fabric means the manifest and the adapters
 * are changed in the same commit by the same person.
 *
 * The consequence of an empty manifest is that registering an integration endpoint fails, and therefore that no
 * webhook subscription can be created and no delivery attempted. That is the check working rather than the fabric
 * being broken. The alternative — declaring a plausible key for an adapter nobody has written — would let an
 * institution register an endpoint, arrange subscriptions against it, watch deliveries accumulate as pending, and
 * never receive one: a silently broken integration, which is precisely the failure this whole domain exists to
 * make impossible. An endpoint that cannot be registered is a refusal with a reason at the moment somebody is
 * looking at the configuration; an endpoint that can be registered and never called is an outage discovered weeks
 * later by a third party.
 *
 * Both halves of the question are answered together because either alone lets through the failure the other
 * catches. An unknown key fails on first use; a known key under a protocol its adapter does not speak fails on
 * first use too, and looks like a network problem rather than a configuration one.
 *
 * When a transport lands, it adds one entry here and the fabric comes alive with no change to
 * `@knowget/gateway` — which is the point of the port. The fabric never learns which vendor is behind a key, so
 * replacing one vendor with another is a change to an adapter and a change to an endpoint's `adapterKey`, and
 * never a change to the domain.
 */
export class DeclaredAdapterRegistry implements AdapterRegistry {
  supports(adapterKey: string, protocol: IntegrationProtocol): Promise<boolean> {
    const protocols = ADAPTER_MANIFEST.get(normalizeKey(adapterKey));
    return Promise.resolve(protocols?.includes(protocol) ?? false);
  }
}

/**
 * The event types this platform publishes to the outside world.
 *
 * Each member is imported from the domain that emits it rather than written as a string here, so a rename in the
 * emitting package cannot silently empty somebody's subscription — it breaks this file at compile time, where the
 * decision about what to do belongs.
 */
const PUBLISHED_EVENT_TYPES: ReadonlySet<string> = new Set([
  STUDENT_ENROLLED,
  STUDENT_PROMOTED,
  STUDENT_TRANSFERRED,
  STUDENT_WITHDRAWN,
  STUDENT_GRADUATED,
  APPLICATION_OFFERED,
  APPLICATION_REJECTED,
  OFFER_ACCEPTED,
  OFFER_DECLINED,
  ENROLLMENT_CONFIRMED,
  INVOICE_ISSUED,
  INVOICE_PAID,
  INVOICE_OVERDUE,
  INVOICE_CANCELLED,
  PAYMENT_RECORDED,
  PAYMENT_CLEARED,
  PAYMENT_FAILED,
  PAYMENT_REFUNDED,
  ATTENDANCE_THRESHOLD_REACHED,
  ASSESSMENT_PUBLISHED,
  REPORT_CARD_GENERATED,
]);

/**
 * {@link EventTypeCatalogue} over a curated list of the platform's own event types.
 *
 * This catalogue is a published surface and not an index, which is the whole of the design decision. The platform
 * declares hundreds of event types across its domains, and the obvious implementation — accept anything anything
 * emits — would make every one of them a public contract by accident. An internal refactor that renamed an event
 * or split it in two would then be a breaking change to somebody's webhook, discovered by them and not by us, and
 * the platform would have committed itself to hundreds of names it never intended to promise anybody.
 *
 * So membership is a decision, and the test applied is whether the event names an institutional fact an outside
 * system's own records depend on, in language that would survive the internals being rewritten. Who is enrolled,
 * promoted, transferred, withdrawn or graduated is the roster every downstream system keeps a copy of. An
 * admissions offer, rejection, acceptance, declination or confirmed enrolment is the decision an applicant-facing
 * portal has to reflect. An invoice issued, paid, overdue or cancelled and a payment recorded, cleared, failed or
 * refunded are the money movements a reconciliation on the other side is built around. An attendance threshold
 * being reached, an assessment being published and a report card being generated are the three academic facts that
 * are somebody's cue to act rather than a step in the institution's own process.
 *
 * What is deliberately absent is as considered as what is present. Internal workflow steps — a campaign created, a
 * cycle opened, a lead contacted, a review started — are the institution's process, and exposing them would let a
 * change to how a school runs admissions break a third party's integration. Recomputations — a funnel profile
 * refreshed, an account refreshed, an attendance policy evaluated — are not facts about the institution but
 * announcements that a derived number moved, and the shape of what is derived is exactly what internal work
 * changes. Payroll runs and payslips are settled facts and are still excluded: every subscription is an egress
 * path, no third-party integration in a K-12 institution needs staff compensation events, and a payslip event on
 * a wire is a salary disclosure waiting for one misconfigured endpoint.
 *
 * The list is tenant-independent because it is a property of the platform's build rather than of a school's
 * configuration, which is why the port takes no tenant. A tenant cannot subscribe to something this deployment
 * does not emit, and cannot be prevented from subscribing to something it does.
 *
 * Membership is checked against the normalized form because a subscription stores its event types normalized and
 * matches them exactly, with no wildcards. Exactness is deliberate in the package and it has a cost that belongs
 * here: a mistyped event type is not a subscription that misbehaves, it is one that is silently, permanently
 * empty. Nothing is refused, nothing errors, no delivery is dead-lettered — the consumer simply never hears about
 * the thing they asked for, and finds out weeks later when somebody notices a downstream system is stale.
 */
export class PublishedEventTypeCatalogue implements EventTypeCatalogue {
  exists(eventType: string): Promise<boolean> {
    return Promise.resolve(PUBLISHED_EVENT_TYPES.has(normalizeKey(eventType)));
  }
}
