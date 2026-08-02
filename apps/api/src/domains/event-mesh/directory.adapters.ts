import type {
  OrganizationDirectory,
  PersonDirectory,
  TransportAdapterRegistry,
  TransportKind,
} from "@knowget/event-mesh";
import { OrganizationNotFoundError, type OrganizationService } from "@knowget/organization";
import { PersonNotFoundError, type PersonService } from "@knowget/person";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * {@link OrganizationDirectory} backed by the organization service (P2-D01-M01).
 *
 * Every event type, stream, binding and subscription in the mesh names the institution it belongs to, and every
 * message, checkpoint, dead letter and replay inherits that institution from the declaration it came from rather
 * than from its caller. The node is therefore checked once, at the four points where it first enters the mesh,
 * and never again — which is only sound if the check is real. A stream declared against an organization that does
 * not exist is a stream nothing can ever be scoped to, discovered when somebody asks which institution is behind
 * the traffic and the answer is an identifier that resolves to nothing.
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
 * The mesh attributes eight decisions to a person: publishing an event type, activating a stream, activating a
 * binding, activating a subscription, resetting a checkpoint, discarding a dead letter, and requesting and
 * approving a replay. Those are the whole of the accountability on a surface where the consequences are a
 * consumer silently starved, a fact deliberately lost, or a month of enrolments re-delivered — and in every case
 * the record long outlives the incident it documents. An attribution that resolves to nobody is worse than an
 * absent one, because the field is populated and reads as answered.
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
 * Every message backbone this deployment can actually carry a fact over.
 *
 * Two entries, and both are honest. `in_process` is the event bus from P1-M05, which fans out to subscribers
 * inside one process. `outbox` is the transactional outbox and relay from the same milestone, which writes a
 * publication in the transaction that caused it and hands it on afterwards. Between them they are the whole of
 * what `@knowget/events` implements, and therefore the whole of what this build can bind a stream to.
 *
 * The four brokers named by {@link TRANSPORT_KINDS} are absent because nothing in this repository speaks to one.
 * There is no Kafka producer, no NATS connection, no Redpanda client and no AMQP channel — a search for a broker
 * dependency in any workspace returns nothing at all. Naming them here would let an institution declare a
 * binding, activate it, watch a stream go live, and never have a single message leave the process: an outage that
 * looks like a working configuration, discovered by whoever downstream stopped receiving facts. Refusing the
 * binding is a refusal with a reason, delivered while somebody is still looking at the configuration screen.
 *
 * The set is not tenant-scoped and the port is deliberately shaped that way. Which backbones exist is a property
 * of what this deployment was built with, not of what a school has bought: a tenant cannot bind to a transport
 * the binary cannot speak, and cannot be stopped from binding to one it can.
 *
 * When a broker adapter lands it adds one member here and the mesh carries traffic over it with no change to
 * `@knowget/event-mesh`, which is the point of the port. The domain never learns which vendor sits behind a
 * transport, so swapping one for another is a change to an adapter and to a binding's `transportRef` — never a
 * change to the package that governs the mesh.
 */
const SERVED_TRANSPORTS: ReadonlySet<TransportKind> = new Set<TransportKind>([
  "in_process",
  "outbox",
]);

/**
 * {@link TransportAdapterRegistry} declared in code at the composition root.
 *
 * It is code and not configuration for the reason the gateway's adapter manifest is: a transport is served
 * because somebody wrote the code that serves it, so the manifest and the adapters belong in the same commit,
 * changed by the same person. A table an operator can insert into is a way of promising a backbone by accident,
 * and the mesh has no way to tell such a promise from a real one until the first message fails to arrive.
 *
 * The answer is not cached, because there is nothing to cache: the set is a compile-time constant and the lookup
 * is a hash probe. The promise is returned rather than the boolean only because the port is asynchronous, which
 * it has to be for the implementations that will one day ask an adapter whether it is actually connected.
 */
export class DeclaredTransportRegistry implements TransportAdapterRegistry {
  serves(transport: TransportKind): Promise<boolean> {
    return Promise.resolve(SERVED_TRANSPORTS.has(transport));
  }
}
