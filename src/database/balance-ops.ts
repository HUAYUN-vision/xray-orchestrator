import type { EntityManager } from 'typeorm';
import { BalanceAccount, Transaction, type TransactionMeta } from './entities';
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
  userId: number;
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
async function lockAccount(manager: EntityManager, userId: number): Promise<BalanceAccount> {
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
  const column = movement.currency;
  const result = await manager
    .createQueryBuilder()
    .update(BalanceAccount)
    .set({ [column]: () => `"${column}" + :amount` })
    .where('user_id = :userId', { userId: movement.userId, amount: movement.amount })
    .execute();
  if (result.affected !== 1) throw new Error(`No balance account for user ${movement.userId}`);

  return insertTransaction(manager, movement, TransactionType.Credit);
}

function insertTransaction(
  manager: EntityManager,
  movement: BalanceMovement,
  type: TransactionType,
): Promise<Transaction> {
  return manager.save(
    manager.create(Transaction, {
      userId: movement.userId,
      amount: movement.amount,
      currency: movement.currency,
      type,
      kind: movement.kind,
      status: TransactionStatus.Completed,
      meta: movement.meta ?? null,
    }),
  );
}
