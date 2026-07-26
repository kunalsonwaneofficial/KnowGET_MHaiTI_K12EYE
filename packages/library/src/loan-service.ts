import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isCopyAvailable, issueCopy, markCopyLost, returnCopy } from "./copy";
import {
  BorrowingLimitReachedError,
  CopyNotAvailableError,
  CopyNotFoundError,
  LoanNotFoundError,
  MemberNotActiveError,
  MemberNotFoundError,
} from "./errors";
import { isMemberActive } from "./library-member";
import {
  copyIssued,
  copyLost,
  copyReturned,
  loanIssued,
  loanLost,
  loanRenewed,
  loanReturned,
} from "./library-events";
import {
  issueLoan,
  type IssueLoanParams,
  type Loan,
  loanDueStatus,
  markLoanLost,
  renewLoan,
  returnLoan,
} from "./loan";
import type { CopyRepository, LibraryMemberRepository, LoanRepository } from "./ports";
import type { LoanDueStatus } from "./library-view";

/**
 * The issue input — the organization and title are derived from the copy; the loan terms (loan period,
 * renewal limit) and the borrowing limit are resolved by the caller from the circulation policy for the
 * member's category, so the loan captures them and this service stays decoupled from the policy.
 */
export type IssueLoanInput = Omit<IssueLoanParams, "organizationId" | "titleId"> & {
  readonly borrowingLimit: number;
};

export interface LoanServiceDeps {
  readonly repository: LoanRepository;
  readonly copies: CopyRepository;
  readonly members: LibraryMemberRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for loans — the circulation core. Issues an **available** copy to an **active**
 * member (enforcing the borrowing limit and flipping the copy to on-loan), renews within the captured
 * limit, returns (flipping the copy back to available) and marks lost (losing the copy too), and answers
 * a loan's due status via the pure engine. Publishes the loan and copy events. Money is not here: overdue
 * is in days (fines are Finance, P2-D14).
 */
export class LoanService {
  private readonly repository: LoanRepository;
  private readonly copies: CopyRepository;
  private readonly members: LibraryMemberRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LoanServiceDeps) {
    this.repository = deps.repository;
    this.copies = deps.copies;
    this.members = deps.members;
    this.events = deps.events;
  }

  async issue(input: IssueLoanInput): Promise<Loan> {
    const copy = await this.copies.findById(input.tenantId, input.copyId);
    if (!copy) {
      throw new CopyNotFoundError(input.copyId);
    }
    if (!isCopyAvailable(copy)) {
      throw new CopyNotAvailableError(input.copyId);
    }
    const member = await this.members.findById(input.tenantId, input.memberId);
    if (!member) {
      throw new MemberNotFoundError(input.memberId);
    }
    if (!isMemberActive(member)) {
      throw new MemberNotActiveError(input.memberId);
    }
    const activeLoans = await this.repository.listActiveByMember(input.tenantId, input.memberId);
    if (activeLoans.length >= input.borrowingLimit) {
      throw new BorrowingLimitReachedError(input.memberId, input.borrowingLimit);
    }
    const loan = issueLoan({
      tenantId: input.tenantId,
      organizationId: copy.organizationId,
      copyId: copy.id,
      titleId: copy.titleId,
      memberId: input.memberId,
      issueDate: input.issueDate,
      loanPeriodDays: input.loanPeriodDays,
      renewalLimit: input.renewalLimit,
    });
    const onLoanCopy = issueCopy(copy);
    await this.repository.save(loan);
    await this.copies.save(onLoanCopy);
    await this.emit(loanIssued(loan));
    await this.emit(copyIssued(onLoanCopy));
    return loan;
  }

  async renew(tenantId: TenantId, id: Uuid): Promise<Loan> {
    const updated = renewLoan(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(loanRenewed(updated));
    return updated;
  }

  async returnItem(tenantId: TenantId, id: Uuid, returnedDate?: string): Promise<Loan> {
    const updated = returnLoan(await this.require(tenantId, id), returnedDate);
    await this.repository.save(updated);
    await this.emit(loanReturned(updated));
    const copy = await this.copies.findById(tenantId, updated.copyId);
    if (copy && copy.status === "on_loan") {
      const returnedCopy = returnCopy(copy);
      await this.copies.save(returnedCopy);
      await this.emit(copyReturned(returnedCopy));
    }
    return updated;
  }

  async markLost(tenantId: TenantId, id: Uuid): Promise<Loan> {
    const updated = markLoanLost(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(loanLost(updated));
    const copy = await this.copies.findById(tenantId, updated.copyId);
    if (copy && (copy.status === "on_loan" || copy.status === "available")) {
      const lostCopy = markCopyLost(copy);
      await this.copies.save(lostCopy);
      await this.emit(copyLost(lostCopy));
    }
    return updated;
  }

  async dueStatus(tenantId: TenantId, id: Uuid, asOfDate: string): Promise<LoanDueStatus> {
    return loanDueStatus(await this.require(tenantId, id), asOfDate);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Loan> {
    return this.require(tenantId, id);
  }

  async listActiveForMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]> {
    return this.repository.listActiveByMember(tenantId, memberId);
  }

  async listForMember(tenantId: TenantId, memberId: Uuid): Promise<Loan[]> {
    return this.repository.listByMember(tenantId, memberId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Loan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Loan> {
    const loan = await this.repository.findById(tenantId, id);
    if (!loan) {
      throw new LoanNotFoundError(id);
    }
    return loan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
