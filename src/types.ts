/** API */

export enum APIType {
  'GET_TRANSACTIONS',
  'SUBMIT_TRANSACTIONS',
  'CANCEL',
  'STATUS',
  'LIVENESS',
}

/** SmartTransactions */

export enum SmartTransactionMinedTx {
  NOT_MINED = 'not_mined',
  SUCCESS = 'success',
  CANCELLED = 'cancelled',
  REVERTED = 'reverted',
  UNKNOWN = 'unknown',
}

export enum SmartTransactionCancellationReason {
  NOT_CANCELLED = 'not_cancelled',
}

export interface SmartTransactionsStatus {
  error?: string;
  cancellationFeeWei: number;
  cancellationReason: SmartTransactionCancellationReason;
  deadlineRatio: number;
  minedHash: string | undefined;
  minedTx: SmartTransactionMinedTx;
}

export interface SmartTransaction {
  UUID: string;
  status?: SmartTransactionsStatus;
}

// TODO: maybe grab the type from transactions controller?
export type UnsignedTransaction = any;

// TODO
export type SignedTransaction = any;

// TODO
export type SignedCancellation = any;
