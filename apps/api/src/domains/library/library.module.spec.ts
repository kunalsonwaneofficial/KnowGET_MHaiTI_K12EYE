import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { EVENT_BUS } from "../../platform/services/services.tokens";
import { DATABASE } from "../../platform/tokens";
import { CirculationPolicyController } from "./circulation-policy.controller";
import { CollectionProfileController } from "./collection-profile.controller";
import { CopyController } from "./copy.controller";
import { DigitalAssetController } from "./digital-asset.controller";
import { LibraryMemberController } from "./library-member.controller";
import { LibraryModule } from "./library.module";
import {
  LB_COPY_SERVICE,
  LB_DIGITAL_ASSET_SERVICE,
  LB_LOAN_SERVICE,
  LB_MEMBER_SERVICE,
  LB_POLICY_SERVICE,
  LB_PROFILE_SERVICE,
  LB_RESERVATION_SERVICE,
  LB_TITLE_SERVICE,
} from "./library.tokens";
import { LoanController } from "./loan.controller";
import { ReservationController } from "./reservation.controller";
import { TitleController } from "./title.controller";

/**
 * Stands in for the global platform providers (database handle, event bus) the domain modules inject, so
 * the library DI graph — including the imported Organization and Person modules — compiles without a live
 * database. The Prisma adapters only store the handle at construction.
 */
@Global()
@Module({
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: EVENT_BUS, useValue: { publish: async () => undefined } },
  ],
  exports: [DATABASE, EVENT_BUS],
})
class MockGlobalsModule {}

describe("LibraryModule (integration)", () => {
  it("compiles the full library DI graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, LibraryModule],
    }).compile();

    expect(moduleRef.get(TitleController)).toBeInstanceOf(TitleController);
    expect(moduleRef.get(CopyController)).toBeInstanceOf(CopyController);
    expect(moduleRef.get(DigitalAssetController)).toBeInstanceOf(DigitalAssetController);
    expect(moduleRef.get(CollectionProfileController)).toBeInstanceOf(CollectionProfileController);
    expect(moduleRef.get(LibraryMemberController)).toBeInstanceOf(LibraryMemberController);
    expect(moduleRef.get(LoanController)).toBeInstanceOf(LoanController);
    expect(moduleRef.get(ReservationController)).toBeInstanceOf(ReservationController);
    expect(moduleRef.get(CirculationPolicyController)).toBeInstanceOf(CirculationPolicyController);

    await moduleRef.close();
  });

  it("exposes each aggregate's application service for cross-domain use", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MockGlobalsModule, LibraryModule],
    }).compile();

    for (const token of [
      LB_TITLE_SERVICE,
      LB_COPY_SERVICE,
      LB_DIGITAL_ASSET_SERVICE,
      LB_MEMBER_SERVICE,
      LB_LOAN_SERVICE,
      LB_RESERVATION_SERVICE,
      LB_POLICY_SERVICE,
      LB_PROFILE_SERVICE,
    ]) {
      expect(moduleRef.get(token)).toBeDefined();
    }

    await moduleRef.close();
  });
});
