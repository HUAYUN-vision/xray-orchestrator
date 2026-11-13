/** Balance currencies. Values are stored in Postgres enum `currency`. */
export enum Currency {
  RUB = 'rub',
  CNY = 'cny',
  USDT = 'usdt',
}

/** Credit — money came in, debit — money went out. */
export enum TransactionType {
  Credit = 'credit',
  Debit = 'debit',
}

export enum TransactionKind {
  /** Top-up from a payment provider. */
  Deposit = 'deposit',
  /** Key purchase or extension. */
  Payment = 'payment',
  /** Money returned to the balance (e.g. key creation failed). */
  Refund = 'refund',
  /** Conversion between currencies. */
  Exchange = 'exchange',
  /** Manual correction by an admin. */
  Adjustment = 'adjustment',
}

export enum TransactionStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
}

export enum UserKeyStatus {
  Active = 'active',
  Expired = 'expired',
}
