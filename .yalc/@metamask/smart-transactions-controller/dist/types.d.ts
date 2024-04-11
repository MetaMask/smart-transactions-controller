/** API */
export declare enum APIType {
    'GET_FEES' = 0,
    'ESTIMATE_GAS' = 1,
    'SUBMIT_TRANSACTIONS' = 2,
    'CANCEL' = 3,
    'BATCH_STATUS' = 4,
    'LIVENESS' = 5
}
/** SmartTransactions */
export declare enum SmartTransactionMinedTx {
    NOT_MINED = "not_mined",
    SUCCESS = "success",
    CANCELLED = "cancelled",
    REVERTED = "reverted",
    UNKNOWN = "unknown"
}
export declare enum SmartTransactionCancellationReason {
    WOULD_REVERT = "would_revert",
    TOO_CHEAP = "too_cheap",
    DEADLINE_MISSED = "deadline_missed",
    INVALID_NONCE = "invalid_nonce",
    USER_CANCELLED = "user_cancelled",
    NOT_CANCELLED = "not_cancelled",
    PREVIOUS_TX_CANCELLED = "previous_tx_cancelled"
}
export declare enum SmartTransactionStatuses {
    PENDING = "pending",
    SUCCESS = "success",
    REVERTED = "reverted",
    UNKNOWN = "unknown",
    CANCELLED = "cancelled",
    CANCELLED_WOULD_REVERT = "cancelled_would_revert",
    CANCELLED_TOO_CHEAP = "cancelled_too_cheap",
    CANCELLED_DEADLINE_MISSED = "cancelled_deadline_missed",
    CANCELLED_INVALID_NONCE = "cancelled_invalid_nonce",
    CANCELLED_USER_CANCELLED = "cancelled_user_cancelled",
    CANCELLED_PREVIOUS_TX_CANCELLED = "cancelled_previous_tx_cancelled",
    RESOLVED = "resolved"
}
export declare const cancellationReasonToStatusMap: {
    would_revert: SmartTransactionStatuses;
    too_cheap: SmartTransactionStatuses;
    deadline_missed: SmartTransactionStatuses;
    invalid_nonce: SmartTransactionStatuses;
    user_cancelled: SmartTransactionStatuses;
    previous_tx_cancelled: SmartTransactionStatuses;
};
export declare type SmartTransactionsStatus = {
    error?: string;
    cancellationFeeWei: number;
    cancellationReason?: SmartTransactionCancellationReason;
    deadlineRatio: number;
    minedHash: string | undefined;
    minedTx: SmartTransactionMinedTx;
    isSettled: boolean;
};
export declare type SmartTransaction = {
    uuid: string;
    chainId?: string;
    destinationTokenAddress?: string;
    destinationTokenDecimals?: string;
    destinationTokenSymbol?: string;
    history?: any;
    nonceDetails?: any;
    origin?: string;
    preTxBalance?: string;
    status?: string;
    statusMetadata?: SmartTransactionsStatus;
    sourceTokenSymbol?: string;
    swapMetaData?: any;
    swapTokenValue?: string;
    time?: number;
    txParams?: any;
    type?: string;
    confirmed?: boolean;
    cancellable?: boolean;
    skipConfirm?: boolean;
};
export declare type Fee = {
    maxFeePerGas: number;
    maxPriorityFeePerGas: number;
};
export declare type IndividualTxFees = {
    fees: Fee[];
    cancelFees: Fee[];
    feeEstimate: number;
    gasLimit: number;
    gasUsed: number;
};
export declare type Fees = {
    approvalTxFees: IndividualTxFees | undefined;
    tradeTxFees: IndividualTxFees | undefined;
};
export declare type UnsignedTransaction = any;
export declare type SignedTransaction = any;
export declare type SignedCanceledTransaction = any;
export declare type Hex = `0x${string}`;
