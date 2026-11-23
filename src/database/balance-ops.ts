import type { EntityManager } from 'typeorm';
import { BalanceAccount, type DepositMeta, Transaction, type TransactionMeta } from './entities';
import { Currency, TransactionKind, TransactionStatus, TransactionType } from './enums';

/** Not enough money on the balance in the requested currency. */
export class InsufficientFundsError extends Error {
  constructor(
    readonly currency: Currency,
    readonly required: string,
    readonly available: string,
  ) {
    super(`Insufficient ${currency}: required ${required}, available ${available}`);
    this.name = 'InsufficientFundsError';
  }
}

/** The balance changed since the user saw it (double tap, second device). */
export class StaleBalanceError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Balance seqno is ${actual}, expected ${expected}`);
    this.name = 'StaleBalanceError';
  }
}

export interface BalanceMovement {
  userId: string;
  currency: Currency;
  /** Positive decimal string. */
  amount: string;
  kind: TransactionKind;
  meta?: TransactionMeta | null;
}

export interface DebitMovement extends BalanceMovement {
  /** Seqno the user saw; the debit fails with StaleBalanceError if it changed. */
  expectedSeqno?: number;
}

const POSITIVE_DECIMAL = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

const CURRENCIES = new Set<string>(Object.values(Currency));

/** The currency is used as a column name in SQL, so only enum values are allowed. */
function assertMovement({ amount, currency }: BalanceMovement): void {
  if (!CURRENCIES.has(currency)) throw new RangeError(`Invalid currency: ${String(currency)}`);
  if (!POSITIVE_DECIMAL.test(amount) || /^0(?:\.0*)?$/.test(amount)) {
    throw new RangeError(`Invalid amount: ${amount}`);
  }
}

/**
 * Locks the account row until the end of the transaction.
 * Every balance change goes through here, so concurrent operations of one user run one by one.
 */
async function lockAccount(manager: EntityManager, userId: string): Promise<BalanceAccount> {
  return manager.findOneOrFail(BalanceAccount, {
    where: { userId },
    lock: { mode: 'pessimistic_write' },
  });
}

/**
 * Takes money off the balance and records it in the ledger. Must run inside a transaction.
 * Comparison and arithmetic are done by Postgres on `numeric`, never in JS floats.
 */
export async function debitBalance(
  manager: EntityManager,
  movement: DebitMovement,
): Promise<Transaction> {
  assertMovement(movement);
  const account = await lockAccount(manager, movement.userId);
  if (movement.expectedSeqno !== undefined && movement.expectedSeqno !== account.seqno) {
    throw new StaleBalanceError(movement.expectedSeqno, account.seqno);
  }

  const column = movement.currency;
  const result = await manager
    .createQueryBuilder()
    .update(BalanceAccount)
    .set({ [column]: () => `"${column}" - :amount`, seqno: () => 'seqno + 1' })
    .where(`user_id = :userId AND "${column}" >= :amount`, {
      userId: movement.userId,
      amount: movement.amount,
    })
    .execute();
  if (result.affected !== 1) {
    throw new InsufficientFundsError(column, movement.amount, account[column]);
  }

  return insertTransaction(manager, movement, TransactionType.Debit);
}

/**
 * Adds money to the balance and records it in the ledger. Must run inside a transaction.
 * Does not bump seqno: a top-up must not invalidate a purchase the user is about to confirm.
 */
export async function creditBalance(
  manager: EntityManager,
  movement: BalanceMovement,
): Promise<Transaction> {
  assertMovement(movement);
  await addToAccount(manager, movement.userId, movement.currency, movement.amount);
  return insertTransaction(manager, movement, TransactionType.Credit);
}

/**
 * Records a top-up the user has not paid yet: a `pending` credit, the balance is unchanged.
 * Its id is the `orderId` at payments-service (D20).
 */
export async function createPendingDeposit(
  manager: EntityManager,
  movement: Omit<BalanceMovement, 'kind'>,
): Promise<Transaction> {
  const deposit = { ...movement, kind: TransactionKind.Deposit };
  assertMovement(deposit);
  return insertTransaction(manager, deposit, TransactionType.Credit, TransactionStatus.Pending);
}

export interface DepositResult {
  deposit: Transaction;
  /** `true` only for the call that moved the deposit out of `pending`. */
  applied: boolean;
}

/**
 * Pays a pending deposit: credits the balance and marks it `completed`. Must run inside a transaction.
 * Idempotent: the row is locked and only a `pending` deposit is applied, so a repeated
 * callback does nothing. `null` if there is no such deposit.
 */
export async function completeDeposit(
  manager: EntityManager,
  depositId: string,
  meta: Partial<DepositMeta> = {},
): Promise<DepositResult | null> {
  const deposit = await lockDeposit(manager, depositId);
  if (!deposit) return null;
  if (deposit.status !== TransactionStatus.Pending) return { deposit, applied: false };

  await addToAccount(manager, deposit.userId, deposit.currency, deposit.amount);
  deposit.status = TransactionStatus.Completed;
  deposit.meta = { ...(deposit.meta as DepositMeta), ...meta };
  return { deposit: await manager.save(deposit), applied: true };
}

/** Marks a pending deposit `failed` (payment canceled); a paid one is never touched. */
export async function failDeposit(
  manager: EntityManager,
  depositId: string,
): Promise<DepositResult | null> {
  const deposit = await lockDeposit(manager, depositId);
  if (!deposit) return null;
  if (deposit.status !== TransactionStatus.Pending) return { deposit, applied: false };
  deposit.status = TransactionStatus.Failed;
  return { deposit: await manager.save(deposit), applied: true };
}

function lockDeposit(manager: EntityManager, id: string): Promise<Transaction | null> {
  return manager.findOne(Transaction, {
    where: { id, kind: TransactionKind.Deposit, type: TransactionType.Credit },
    lock: { mode: 'pessimistic_write' },
  });
}

async function addToAccount(
  manager: EntityManager,
  userId: string,
  currency: Currency,
  amount: string,
): Promise<void> {
  const result = await manager
    .createQueryBuilder()
    .update(BalanceAccount)
    .set({ [currency]: () => `"${currency}" + :amount` })
    .where('user_id = :userId', { userId, amount })
    .execute();
  if (result.affected !== 1) throw new Error(`No balance account for user ${userId}`);
}

function insertTransaction(
  manager: EntityManager,
  movement: BalanceMovement,
  type: TransactionType,
  status = TransactionStatus.Completed,
): Promise<Transaction> {
  return manager.save(
    manager.create(Transaction, {
      userId: movement.userId,
      amount: movement.amount,
      currency: movement.currency,
      type,
      kind: movement.kind,
      status,
      meta: movement.meta ?? null,
    }),
  );
}
