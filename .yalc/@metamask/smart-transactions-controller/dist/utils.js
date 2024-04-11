"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementNonceInHex = exports.isSmartTransactionCancellable = exports.handleFetch = exports.mapKeysToCamel = exports.getStxProcessingTime = exports.snapshotFromTxMeta = exports.replayHistory = exports.generateHistoryEntry = exports.calculateStatus = exports.getAPIRequestURL = exports.isSmartTransactionStatusResolved = exports.isSmartTransactionPending = void 0;
const fast_json_patch_1 = __importDefault(require("fast-json-patch"));
const lodash_1 = __importDefault(require("lodash"));
const bignumber_js_1 = require("bignumber.js");
const bytes_1 = require("@ethersproject/bytes");
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const package_json_1 = __importDefault(require("../package.json"));
const types_1 = require("./types");
const constants_1 = require("./constants");
function isSmartTransactionPending(smartTransaction) {
    return smartTransaction.status === types_1.SmartTransactionStatuses.PENDING;
}
exports.isSmartTransactionPending = isSmartTransactionPending;
const isSmartTransactionStatusResolved = (stxStatus) => stxStatus === 'uuid_not_found';
exports.isSmartTransactionStatusResolved = isSmartTransactionStatusResolved;
// TODO use actual url once API is defined
function getAPIRequestURL(apiType, chainId) {
    const chainIdDec = parseInt(chainId, 16);
    switch (apiType) {
        case types_1.APIType.GET_FEES: {
            return `${constants_1.API_BASE_URL}/networks/${chainIdDec}/getFees`;
        }
        case types_1.APIType.ESTIMATE_GAS: {
            return `${constants_1.API_BASE_URL}/networks/${chainIdDec}/estimateGas`;
        }
        case types_1.APIType.SUBMIT_TRANSACTIONS: {
            return `${constants_1.API_BASE_URL}/networks/${chainIdDec}/submitTransactions?stxControllerVersion=${package_json_1.default.version}`;
        }
        case types_1.APIType.CANCEL: {
            return `${constants_1.API_BASE_URL}/networks/${chainIdDec}/cancel`;
        }
        case types_1.APIType.BATCH_STATUS: {
            return `${constants_1.API_BASE_URL}/networks/${chainIdDec}/batchStatus`;
        }
        case types_1.APIType.LIVENESS: {
            return `${constants_1.API_BASE_URL}/networks/${chainIdDec}/health`;
        }
        default: {
            throw new Error(`Invalid APIType`); // It can never get here thanks to TypeScript.
        }
    }
}
exports.getAPIRequestURL = getAPIRequestURL;
const calculateStatus = (stxStatus) => {
    if ((0, exports.isSmartTransactionStatusResolved)(stxStatus)) {
        return types_1.SmartTransactionStatuses.RESOLVED;
    }
    const cancellations = [
        types_1.SmartTransactionCancellationReason.WOULD_REVERT,
        types_1.SmartTransactionCancellationReason.TOO_CHEAP,
        types_1.SmartTransactionCancellationReason.DEADLINE_MISSED,
        types_1.SmartTransactionCancellationReason.INVALID_NONCE,
        types_1.SmartTransactionCancellationReason.USER_CANCELLED,
        types_1.SmartTransactionCancellationReason.PREVIOUS_TX_CANCELLED,
    ];
    if ((stxStatus === null || stxStatus === void 0 ? void 0 : stxStatus.minedTx) === types_1.SmartTransactionMinedTx.NOT_MINED) {
        if (stxStatus.cancellationReason ===
            types_1.SmartTransactionCancellationReason.NOT_CANCELLED) {
            return types_1.SmartTransactionStatuses.PENDING;
        }
        const isCancellation = cancellations.findIndex((cancellation) => cancellation === stxStatus.cancellationReason) > -1;
        if (stxStatus.cancellationReason && isCancellation) {
            if (!stxStatus.isSettled) {
                return types_1.SmartTransactionStatuses.PENDING;
            }
            return types_1.cancellationReasonToStatusMap[stxStatus.cancellationReason];
        }
    }
    else if ((stxStatus === null || stxStatus === void 0 ? void 0 : stxStatus.minedTx) === types_1.SmartTransactionMinedTx.SUCCESS) {
        return types_1.SmartTransactionStatuses.SUCCESS;
    }
    else if ((stxStatus === null || stxStatus === void 0 ? void 0 : stxStatus.minedTx) === types_1.SmartTransactionMinedTx.CANCELLED) {
        return types_1.SmartTransactionStatuses.CANCELLED;
    }
    else if ((stxStatus === null || stxStatus === void 0 ? void 0 : stxStatus.minedTx) === types_1.SmartTransactionMinedTx.REVERTED) {
        return types_1.SmartTransactionStatuses.REVERTED;
    }
    else if ((stxStatus === null || stxStatus === void 0 ? void 0 : stxStatus.minedTx) === types_1.SmartTransactionMinedTx.UNKNOWN) {
        return types_1.SmartTransactionStatuses.UNKNOWN;
    }
    return types_1.SmartTransactionStatuses.UNKNOWN;
};
exports.calculateStatus = calculateStatus;
/**
  Generates an array of history objects sense the previous state.
  The object has the keys
    op (the operation performed),
    path (the key and if a nested object then each key will be separated with a `/`)
    value
  with the first entry having the note and a timestamp when the change took place
  @param previousState - the previous state of the object
  @param newState - the update object
  @param [note] - a optional note for the state change
  @returns
*/
function generateHistoryEntry(previousState, newState, note) {
    const entry = fast_json_patch_1.default.compare(previousState, newState);
    // Add a note to the first op, since it breaks if we append it to the entry
    if (entry[0]) {
        if (note) {
            entry[0].note = note;
        }
        entry[0].timestamp = Date.now();
    }
    return entry;
}
exports.generateHistoryEntry = generateHistoryEntry;
/**
  Recovers previous txMeta state obj
  @returns
*/
function replayHistory(_shortHistory) {
    const shortHistory = lodash_1.default.cloneDeep(_shortHistory);
    return shortHistory.reduce((val, entry) => fast_json_patch_1.default.applyPatch(val, entry).newDocument);
}
exports.replayHistory = replayHistory;
/**
 * Snapshot {@code txMeta}
 * @param txMeta - the tx metadata object
 * @returns a deep clone without history
 */
function snapshotFromTxMeta(txMeta) {
    const shallow = Object.assign({}, txMeta);
    delete shallow.history;
    return lodash_1.default.cloneDeep(shallow);
}
exports.snapshotFromTxMeta = snapshotFromTxMeta;
/**
 * Returns processing time for an STX in seconds.
 * @param smartTransactionSubmittedtime
 * @returns Processing time in seconds.
 */
const getStxProcessingTime = (smartTransactionSubmittedtime) => {
    if (!smartTransactionSubmittedtime) {
        return undefined;
    }
    return Math.round((Date.now() - smartTransactionSubmittedtime) / 1000);
};
exports.getStxProcessingTime = getStxProcessingTime;
const mapKeysToCamel = (obj) => {
    if (!lodash_1.default.isObject(obj)) {
        return obj;
    }
    const mappedValues = lodash_1.default.mapValues(obj, (val) => {
        if (lodash_1.default.isArray(val)) {
            return val.map(exports.mapKeysToCamel);
        }
        else if (lodash_1.default.isObject(val)) {
            return (0, exports.mapKeysToCamel)(val);
        }
        return val;
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return lodash_1.default.mapKeys(mappedValues, (value, key) => lodash_1.default.camelCase(key));
};
exports.mapKeysToCamel = mapKeysToCamel;
async function handleFetch(request, options) {
    const response = await fetch(request, options);
    const json = await response.json();
    if (!response.ok) {
        console.log(`response`, response);
        throw new Error(`Fetch error:${JSON.stringify(Object.assign({ status: response.status }, (0, exports.mapKeysToCamel)(json)))}`);
    }
    return json;
}
exports.handleFetch = handleFetch;
const isSmartTransactionCancellable = (stxStatus) => {
    return (stxStatus.minedTx === types_1.SmartTransactionMinedTx.NOT_MINED &&
        (!stxStatus.cancellationReason ||
            stxStatus.cancellationReason ===
                types_1.SmartTransactionCancellationReason.NOT_CANCELLED));
};
exports.isSmartTransactionCancellable = isSmartTransactionCancellable;
const incrementNonceInHex = (nonceInHex) => {
    const nonceInDec = new bignumber_js_1.BigNumber(nonceInHex, 16).toString(10);
    return (0, bytes_1.hexlify)(Number(nonceInDec) + 1);
};
exports.incrementNonceInHex = incrementNonceInHex;
//# sourceMappingURL=utils.js.map