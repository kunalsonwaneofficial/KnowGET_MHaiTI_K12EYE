import type { PrismaService } from "@knowget/database";
import {
  type DeadLetterRepository,
  DeadLetterService,
  type EventStreamRepository,
  EventStreamService,
  type EventTypeDefinitionRepository,
  EventTypeDefinitionService,
  type MeshMessageRepository,
  MeshMessageService,
  type MeshSubscriptionRepository,
  MeshSubscriptionService,
  type OrganizationDirectory,
  type PersonDirectory,
  type ReplayRequestRepository,
  ReplayRequestService,
  type StreamBindingRepository,
  StreamBindingService,
  type SubscriptionCheckpointRepository,
  SubscriptionCheckpointService,
  type TransportAdapterRegistry,
} from "@knowget/event-mesh";
import type { EventBus } from "@knowget/events";
import type { OrganizationService } from "@knowget/organization";
import type { PersonService } from "@knowget/person";
import { Module, type Provider } from "@nestjs/common";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { OrganizationModule } from "../organization/organization.module";
import { ORGANIZATION_SERVICE } from "../organization/organization.tokens";
import { PersonModule } from "../person/person.module";
import { PERSON_SERVICE } from "../person/person.tokens";
import { DeadLetterController } from "./dead-letter.controller";
import {
  DeclaredTransportRegistry,
  OrganizationServiceDirectory,
  PersonServiceDirectory,
} from "./directory.adapters";
import {
  EM_BINDING_REPOSITORY,
  EM_BINDING_SERVICE,
  EM_CHECKPOINT_REPOSITORY,
  EM_CHECKPOINT_SERVICE,
  EM_DEAD_LETTER_REPOSITORY,
  EM_DEAD_LETTER_SERVICE,
  EM_EVENT_TYPE_REPOSITORY,
  EM_EVENT_TYPE_SERVICE,
  EM_MESSAGE_REPOSITORY,
  EM_MESSAGE_SERVICE,
  EM_ORGANIZATION_DIRECTORY,
  EM_PERSON_DIRECTORY,
  EM_REPLAY_REPOSITORY,
  EM_REPLAY_SERVICE,
  EM_STREAM_REPOSITORY,
  EM_STREAM_SERVICE,
  EM_SUBSCRIPTION_REPOSITORY,
  EM_SUBSCRIPTION_SERVICE,
  EM_TRANSPORT_REGISTRY,
} from "./event-mesh.tokens";
import { EventStreamController } from "./event-stream.controller";
import { EventTypeDefinitionController } from "./event-type-definition.controller";
import { MeshMessageController } from "./mesh-message.controller";
import { MeshSubscriptionController } from "./mesh-subscription.controller";
import { PrismaDeadLetterRepository } from "./prisma-dead-letter.repository";
import { PrismaEventStreamRepository } from "./prisma-event-stream.repository";
import { PrismaEventTypeDefinitionRepository } from "./prisma-event-type-definition.repository";
import { PrismaMeshMessageRepository } from "./prisma-mesh-message.repository";
import { PrismaMeshSubscriptionRepository } from "./prisma-mesh-subscription.repository";
import { PrismaReplayRequestRepository } from "./prisma-replay-request.repository";
import { PrismaStreamBindingRepository } from "./prisma-stream-binding.repository";
import { PrismaSubscriptionCheckpointRepository } from "./prisma-subscription-checkpoint.repository";
import { ReplayRequestController } from "./replay-request.controller";
import { StreamBindingController } from "./stream-binding.controller";
import { SubscriptionCheckpointController } from "./subscription-checkpoint.controller";

const repositories: Provider[] = [
  {
    provide: EM_EVENT_TYPE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEventTypeDefinitionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_STREAM_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaEventStreamRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_BINDING_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaStreamBindingRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_SUBSCRIPTION_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMeshSubscriptionRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_MESSAGE_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaMeshMessageRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_CHECKPOINT_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaSubscriptionCheckpointRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_DEAD_LETTER_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaDeadLetterRepository(db),
    inject: [DATABASE],
  },
  {
    provide: EM_REPLAY_REPOSITORY,
    useFactory: (db: PrismaService) => new PrismaReplayRequestRepository(db),
    inject: [DATABASE],
  },
];

const directories: Provider[] = [
  {
    provide: EM_ORGANIZATION_DIRECTORY,
    useFactory: (organizations: OrganizationService) =>
      new OrganizationServiceDirectory(organizations),
    inject: [ORGANIZATION_SERVICE],
  },
  {
    provide: EM_PERSON_DIRECTORY,
    useFactory: (people: PersonService) => new PersonServiceDirectory(people),
    inject: [PERSON_SERVICE],
  },
  {
    provide: EM_TRANSPORT_REGISTRY,
    useFactory: () => new DeclaredTransportRegistry(),
  },
];

const services: Provider[] = [
  {
    provide: EM_EVENT_TYPE_SERVICE,
    useFactory: (
      repository: EventTypeDefinitionRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new EventTypeDefinitionService({ repository, organizations, people, events }),
    inject: [EM_EVENT_TYPE_REPOSITORY, EM_ORGANIZATION_DIRECTORY, EM_PERSON_DIRECTORY, EVENT_BUS],
  },
  {
    provide: EM_STREAM_SERVICE,
    useFactory: (
      repository: EventStreamRepository,
      eventTypes: EventTypeDefinitionRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new EventStreamService({ repository, eventTypes, organizations, people, events }),
    inject: [
      EM_STREAM_REPOSITORY,
      EM_EVENT_TYPE_REPOSITORY,
      EM_ORGANIZATION_DIRECTORY,
      EM_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EM_BINDING_SERVICE,
    useFactory: (
      repository: StreamBindingRepository,
      streams: EventStreamRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      transports: TransportAdapterRegistry,
      events: EventBus,
    ) =>
      new StreamBindingService({ repository, streams, organizations, people, transports, events }),
    inject: [
      EM_BINDING_REPOSITORY,
      EM_STREAM_REPOSITORY,
      EM_ORGANIZATION_DIRECTORY,
      EM_PERSON_DIRECTORY,
      EM_TRANSPORT_REGISTRY,
      EVENT_BUS,
    ],
  },
  {
    provide: EM_SUBSCRIPTION_SERVICE,
    useFactory: (
      repository: MeshSubscriptionRepository,
      streams: EventStreamRepository,
      organizations: OrganizationDirectory,
      people: PersonDirectory,
      events: EventBus,
    ) => new MeshSubscriptionService({ repository, streams, organizations, people, events }),
    inject: [
      EM_SUBSCRIPTION_REPOSITORY,
      EM_STREAM_REPOSITORY,
      EM_ORGANIZATION_DIRECTORY,
      EM_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EM_MESSAGE_SERVICE,
    useFactory: (
      repository: MeshMessageRepository,
      streams: EventStreamRepository,
      eventTypes: EventTypeDefinitionRepository,
      events: EventBus,
    ) => new MeshMessageService({ repository, streams, eventTypes, events }),
    inject: [EM_MESSAGE_REPOSITORY, EM_STREAM_REPOSITORY, EM_EVENT_TYPE_REPOSITORY, EVENT_BUS],
  },
  {
    provide: EM_CHECKPOINT_SERVICE,
    useFactory: (
      repository: SubscriptionCheckpointRepository,
      subscriptions: MeshSubscriptionRepository,
      streams: EventStreamRepository,
      messages: MeshMessageRepository,
      people: PersonDirectory,
      events: EventBus,
    ) =>
      new SubscriptionCheckpointService({
        repository,
        subscriptions,
        streams,
        messages,
        people,
        events,
      }),
    inject: [
      EM_CHECKPOINT_REPOSITORY,
      EM_SUBSCRIPTION_REPOSITORY,
      EM_STREAM_REPOSITORY,
      EM_MESSAGE_REPOSITORY,
      EM_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EM_DEAD_LETTER_SERVICE,
    useFactory: (
      repository: DeadLetterRepository,
      subscriptions: MeshSubscriptionRepository,
      messages: MeshMessageRepository,
      replays: ReplayRequestRepository,
      people: PersonDirectory,
      events: EventBus,
    ) => new DeadLetterService({ repository, subscriptions, messages, replays, people, events }),
    inject: [
      EM_DEAD_LETTER_REPOSITORY,
      EM_SUBSCRIPTION_REPOSITORY,
      EM_MESSAGE_REPOSITORY,
      EM_REPLAY_REPOSITORY,
      EM_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
  {
    provide: EM_REPLAY_SERVICE,
    useFactory: (
      repository: ReplayRequestRepository,
      subscriptions: MeshSubscriptionRepository,
      streams: EventStreamRepository,
      messages: MeshMessageRepository,
      people: PersonDirectory,
      events: EventBus,
    ) =>
      new ReplayRequestService({
        repository,
        subscriptions,
        streams,
        messages,
        people,
        events,
      }),
    inject: [
      EM_REPLAY_REPOSITORY,
      EM_SUBSCRIPTION_REPOSITORY,
      EM_STREAM_REPOSITORY,
      EM_MESSAGE_REPOSITORY,
      EM_PERSON_DIRECTORY,
      EVENT_BUS,
    ],
  },
];

/**
 * Event Mesh, Streaming & Messaging (P3-D02) — the composition root for how institutional facts travel.
 *
 * Eight aggregates in three layers. The vocabulary is an event type and the stream that carries it: what the
 * platform is willing to say about itself, and the channel it says it on. The arrangement is a binding, naming
 * the backbone a stream is carried over, and a subscription, naming who reads from it and under what filter. The
 * traffic is a message, the checkpoint each consumer holds on each partition, the dead letter recorded when a
 * delivery cannot be made, and the replay request that asks for a window of history to happen a second time.
 *
 * Three ports are bound here and all three are reads. Organizations and people are the usual node checks
 * (P2-D01-M01, P2-D03) — every declaration hangs off an institution, and every publication, activation, reset,
 * discard and replay approval is attributed to somebody who has to still exist when the record is read back. The
 * transport registry is the third, and it is declared in code rather than read from a table: this build speaks
 * `in_process` and `outbox` because `@knowget/events` implements both, and naming a broker nothing in the
 * repository connects to would let an institution activate a binding and then watch its facts go nowhere.
 *
 * Nothing in this module moves a byte. Fan-out inside a process and the transactional outbox belong to
 * `@knowget/events`, delivery mechanics and scheduling to `@knowget/jobs`, retry, timeout and circuit control to
 * `@knowget/reliability`, and the outward-facing edge to `@knowget/gateway` (P3-D01). What is here is the mesh's
 * account of itself: which facts exist, where they go, who is reading them, how far behind that reader is, what
 * failed, and what somebody asked to have delivered again.
 *
 * Exports every service token, so a producing capability can record a fact and a delivery worker can move a
 * checkpoint without either importing this domain's adapters.
 */
@Module({
  imports: [OrganizationModule, PersonModule],
  controllers: [
    EventTypeDefinitionController,
    EventStreamController,
    StreamBindingController,
    MeshSubscriptionController,
    MeshMessageController,
    SubscriptionCheckpointController,
    DeadLetterController,
    ReplayRequestController,
  ],
  providers: [...repositories, ...directories, ...services],
  exports: [
    EM_EVENT_TYPE_SERVICE,
    EM_STREAM_SERVICE,
    EM_BINDING_SERVICE,
    EM_SUBSCRIPTION_SERVICE,
    EM_MESSAGE_SERVICE,
    EM_CHECKPOINT_SERVICE,
    EM_DEAD_LETTER_SERVICE,
    EM_REPLAY_SERVICE,
  ],
})
export class EventMeshModule {}
