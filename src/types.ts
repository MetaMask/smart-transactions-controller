/** API */

export enum APIType {
  'GET_TRANSACTIONS',
  'SUBMIT_TRANSACTIONS',
  'CANCEL',
  'BATCH_STATUS',
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
  WOULD_REVERT = 'would_revert',
  TOO_CHEAP = 'too_cheap',
  DEADLINE_MISSED = 'deadline_missed',
  INVALID_NONCE = 'invalid_nonce',
  USER_CANCELLED = 'user_cancelled',
  NOT_CANCELLED = 'not_cancelled',
}

export interface SmartTransactionsStatus {
  error?: string;
  cancellationFeeWei: number;
  cancellationReason?: SmartTransactionCancellationReason;
  deadlineRatio: number;
  minedHash: string | undefined;
  minedTx: SmartTransactionMinedTx;
}

export interface SmartTransaction {
  uuid: string;
  chainId?: string;
  destinationTokenAddress?: string;
  destinationTokenDecimals?: string;
  destinationTokenSymbol?: string;
  metamaskNetworkId?: string;
  nonceDetails?: any;
  origin?: string;
  preTxBalance?: string;
  status?: SmartTransactionsStatus;
  sourceTokenSymbol?: string;
  swapMetaData?: any;
  swapTokenValue?: string;
  time?: number;
  txParams?: any;
  type?: string;
}

// TODO: maybe grab the type from transactions controller?
export type UnsignedTransaction = any;

// TODO
export type SignedTransaction = any;

// TODO
export type SignedCanceledTransaction = any;
