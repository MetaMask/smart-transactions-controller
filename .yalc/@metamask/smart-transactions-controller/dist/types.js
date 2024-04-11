"use strict";
/** API */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancellationReasonToStatusMap = exports.SmartTransactionStatuses = exports.SmartTransactionCancellationReason = exports.SmartTransactionMinedTx = exports.APIType = void 0;
var APIType;
(function (APIType) {
    APIType[APIType["GET_FEES"] = 0] = "GET_FEES";
    APIType[APIType["ESTIMATE_GAS"] = 1] = "ESTIMATE_GAS";
    APIType[APIType["SUBMIT_TRANSACTIONS"] = 2] = "SUBMIT_TRANSACTIONS";
    APIType[APIType["CANCEL"] = 3] = "CANCEL";
    APIType[APIType["BATCH_STATUS"] = 4] = "BATCH_STATUS";
    APIType[APIType["LIVENESS"] = 5] = "LIVENESS";
})(APIType = exports.APIType || (exports.APIType = {}));
/** SmartTransactions */
var SmartTransactionMinedTx;
(function (SmartTransactionMinedTx) {
    SmartTransactionMinedTx["NOT_MINED"] = "not_mined";
    SmartTransactionMinedTx["SUCCESS"] = "success";
    SmartTransactionMinedTx["CANCELLED"] = "cancelled";
    SmartTransactionMinedTx["REVERTED"] = "reverted";
    SmartTransactionMinedTx["UNKNOWN"] = "unknown";
})(SmartTransactionMinedTx = exports.SmartTransactionMinedTx || (exports.SmartTransactionMinedTx = {}));
var SmartTransactionCancellationReason;
(function (SmartTransactionCancellationReason) {
    SmartTransactionCancellationReason["WOULD_REVERT"] = "would_revert";
    SmartTransactionCancellationReason["TOO_CHEAP"] = "too_cheap";
    SmartTransactionCancellationReason["DEADLINE_MISSED"] = "deadline_missed";
    SmartTransactionCancellationReason["INVALID_NONCE"] = "invalid_nonce";
    SmartTransactionCancellationReason["USER_CANCELLED"] = "user_cancelled";
    SmartTransactionCancellationReason["NOT_CANCELLED"] = "not_cancelled";
    SmartTransactionCancellationReason["PREVIOUS_TX_CANCELLED"] = "previous_tx_cancelled";
})(SmartTransactionCancellationReason = exports.SmartTransactionCancellationReason || (exports.SmartTransactionCancellationReason = {}));
var SmartTransactionStatuses;
(function (SmartTransactionStatuses) {
    SmartTransactionStatuses["PENDING"] = "pending";
    SmartTransactionStatuses["SUCCESS"] = "success";
    SmartTransactionStatuses["REVERTED"] = "reverted";
    SmartTransactionStatuses["UNKNOWN"] = "unknown";
    SmartTransactionStatuses["CANCELLED"] = "cancelled";
    SmartTransactionStatuses["CANCELLED_WOULD_REVERT"] = "cancelled_would_revert";
    SmartTransactionStatuses["CANCELLED_TOO_CHEAP"] = "cancelled_too_cheap";
    SmartTransactionStatuses["CANCELLED_DEADLINE_MISSED"] = "cancelled_deadline_missed";
    SmartTransactionStatuses["CANCELLED_INVALID_NONCE"] = "cancelled_invalid_nonce";
    SmartTransactionStatuses["CANCELLED_USER_CANCELLED"] = "cancelled_user_cancelled";
    SmartTransactionStatuses["CANCELLED_PREVIOUS_TX_CANCELLED"] = "cancelled_previous_tx_cancelled";
    SmartTransactionStatuses["RESOLVED"] = "resolved";
})(SmartTransactionStatuses = exports.SmartTransactionStatuses || (exports.SmartTransactionStatuses = {}));
exports.cancellationReasonToStatusMap = {
    [SmartTransactionCancellationReason.WOULD_REVERT]: SmartTransactionStatuses.CANCELLED_WOULD_REVERT,
    [SmartTransactionCancellationReason.TOO_CHEAP]: SmartTransactionStatuses.CANCELLED_TOO_CHEAP,
    [SmartTransactionCancellationReason.DEADLINE_MISSED]: SmartTransactionStatuses.CANCELLED_DEADLINE_MISSED,
    [SmartTransactionCancellationReason.INVALID_NONCE]: SmartTransactionStatuses.CANCELLED_INVALID_NONCE,
    [SmartTransactionCancellationReason.USER_CANCELLED]: SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
    [SmartTransactionCancellationReason.PREVIOUS_TX_CANCELLED]: SmartTransactionStatuses.CANCELLED_PREVIOUS_TX_CANCELLED,
};
//# sourceMappingURL=types.js.map