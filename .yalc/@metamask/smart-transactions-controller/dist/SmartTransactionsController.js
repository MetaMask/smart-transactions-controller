"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _SmartTransactionsController_instances, _SmartTransactionsController_updateSmartTransaction, _SmartTransactionsController_confirmSmartTransaction, _SmartTransactionsController_getChainId, _SmartTransactionsController_getEthQuery;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_INTERVAL = void 0;
const events_1 = __importDefault(require("events"));
const controller_utils_1 = require("@metamask/controller-utils");
const eth_query_1 = __importDefault(require("@metamask/eth-query"));
const polling_controller_1 = require("@metamask/polling-controller");
const bignumber_js_1 = require("bignumber.js");
const bytes_1 = require("@ethersproject/bytes");
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const types_1 = require("./types");
const utils_1 = require("./utils");
const constants_1 = require("./constants");
const SECOND = 1000;
exports.DEFAULT_INTERVAL = SECOND * 5;
class SmartTransactionsController extends polling_controller_1.StaticIntervalPollingControllerV1 {
    constructor({ onNetworkStateChange, getNonceLock, provider, confirmExternalTransaction, trackMetaMetricsEvent, getNetworkClientById, }, config, state) {
        super(config, state);
        _SmartTransactionsController_instances.add(this);
        this.defaultConfig = {
            interval: exports.DEFAULT_INTERVAL,
            chainId: constants_1.CHAIN_IDS.ETHEREUM,
            clientId: 'default',
            supportedChainIds: [constants_1.CHAIN_IDS.ETHEREUM, constants_1.CHAIN_IDS.GOERLI],
        };
        this.defaultState = {
            smartTransactionsState: {
                smartTransactions: {},
                userOptIn: undefined,
                userOptInV2: undefined,
                fees: {
                    approvalTxFees: undefined,
                    tradeTxFees: undefined,
                },
                liveness: true,
                livenessByChainId: {
                    [constants_1.CHAIN_IDS.ETHEREUM]: true,
                    [constants_1.CHAIN_IDS.GOERLI]: true,
                },
                feesByChainId: {
                    [constants_1.CHAIN_IDS.ETHEREUM]: {
                        approvalTxFees: undefined,
                        tradeTxFees: undefined,
                    },
                    [constants_1.CHAIN_IDS.GOERLI]: {
                        approvalTxFees: undefined,
                        tradeTxFees: undefined,
                    },
                },
            },
        };
        this.initialize();
        this.setIntervalLength(this.config.interval);
        this.getNonceLock = getNonceLock;
        this.ethQuery = new eth_query_1.default(provider);
        this.confirmExternalTransaction = confirmExternalTransaction;
        this.trackMetaMetricsEvent = trackMetaMetricsEvent;
        this.getNetworkClientById = getNetworkClientById;
        this.initializeSmartTransactionsForChainId();
        onNetworkStateChange(({ providerConfig: newProvider }) => {
            const { chainId } = newProvider;
            this.configure({ chainId });
            this.initializeSmartTransactionsForChainId();
            this.checkPoll(this.state);
            this.ethQuery = new eth_query_1.default(provider);
        });
        this.subscribe((currentState) => this.checkPoll(currentState));
        this.eventEmitter = new events_1.default();
    }
    /* istanbul ignore next */
    async fetch(request, options) {
        const { clientId } = this.config;
        const fetchOptions = Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Content-Type': 'application/json' }, (clientId && { 'X-Client-Id': clientId })) });
        return (0, utils_1.handleFetch)(request, fetchOptions);
    }
    _executePoll(networkClientId) {
        // if this is going to be truly UI driven polling we shouldn't really reach here
        // with a networkClientId that is not supported, but for now I'll add a check in case
        // wondering if we should add some kind of predicate to the polling controller to check whether
        // we should poll or not
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        if (!this.config.supportedChainIds.includes(chainId)) {
            return Promise.resolve();
        }
        return this.updateSmartTransactions({ networkClientId });
    }
    checkPoll(state) {
        const { smartTransactions } = state.smartTransactionsState;
        const currentSmartTransactions = smartTransactions[this.config.chainId];
        const pendingTransactions = currentSmartTransactions === null || currentSmartTransactions === void 0 ? void 0 : currentSmartTransactions.filter(utils_1.isSmartTransactionPending);
        if (!this.timeoutHandle && (pendingTransactions === null || pendingTransactions === void 0 ? void 0 : pendingTransactions.length) > 0) {
            this.poll();
        }
        else if (this.timeoutHandle && (pendingTransactions === null || pendingTransactions === void 0 ? void 0 : pendingTransactions.length) === 0) {
            this.stop();
        }
    }
    initializeSmartTransactionsForChainId() {
        var _a;
        if (this.config.supportedChainIds.includes(this.config.chainId)) {
            const { smartTransactionsState } = this.state;
            this.update({
                smartTransactionsState: Object.assign(Object.assign({}, smartTransactionsState), { smartTransactions: Object.assign(Object.assign({}, smartTransactionsState.smartTransactions), { [this.config.chainId]: (_a = smartTransactionsState.smartTransactions[this.config.chainId]) !== null && _a !== void 0 ? _a : [] }) }),
            });
        }
    }
    async poll(interval) {
        const { chainId, supportedChainIds } = this.config;
        interval && this.configure({ interval }, false, false);
        this.timeoutHandle && clearInterval(this.timeoutHandle);
        if (!supportedChainIds.includes(chainId)) {
            return;
        }
        await (0, controller_utils_1.safelyExecute)(() => this.updateSmartTransactions());
        this.timeoutHandle = setInterval(() => {
            (0, controller_utils_1.safelyExecute)(() => this.updateSmartTransactions());
        }, this.config.interval);
    }
    async stop() {
        this.timeoutHandle && clearInterval(this.timeoutHandle);
        this.timeoutHandle = undefined;
    }
    setOptInState(state) {
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, this.state.smartTransactionsState), { userOptInV2: state }),
        });
    }
    trackStxStatusChange(smartTransaction, prevSmartTransaction) {
        if (!prevSmartTransaction) {
            return; // Don't track the first STX, because it doesn't have all necessary params.
        }
        let updatedSmartTransaction = (0, cloneDeep_1.default)(smartTransaction);
        updatedSmartTransaction = Object.assign(Object.assign({}, (0, cloneDeep_1.default)(prevSmartTransaction)), updatedSmartTransaction);
        if (!updatedSmartTransaction.swapMetaData ||
            (updatedSmartTransaction.status === prevSmartTransaction.status &&
                prevSmartTransaction.swapMetaData)) {
            return; // If status hasn't changed, don't track it again.
        }
        const sensitiveProperties = {
            stx_status: updatedSmartTransaction.status,
            token_from_symbol: updatedSmartTransaction.sourceTokenSymbol,
            token_to_symbol: updatedSmartTransaction.destinationTokenSymbol,
            processing_time: (0, utils_1.getStxProcessingTime)(updatedSmartTransaction.time),
            stx_enabled: true,
            current_stx_enabled: true,
            stx_user_opt_in: true,
        };
        this.trackMetaMetricsEvent({
            event: 'STX Status Updated',
            category: 'swaps',
            sensitiveProperties,
        });
    }
    isNewSmartTransaction(smartTransactionUuid) {
        const { chainId } = this.config;
        const { smartTransactionsState } = this.state;
        const { smartTransactions } = smartTransactionsState;
        const currentSmartTransactions = smartTransactions[chainId];
        const currentIndex = currentSmartTransactions === null || currentSmartTransactions === void 0 ? void 0 : currentSmartTransactions.findIndex((stx) => stx.uuid === smartTransactionUuid);
        return currentIndex === -1 || currentIndex === undefined;
    }
    updateSmartTransaction(smartTransaction, { networkClientId } = {}) {
        let { ethQuery, config: { chainId }, } = this;
        if (networkClientId) {
            const networkClient = this.getNetworkClientById(networkClientId);
            chainId = networkClient.configuration.chainId;
            ethQuery = new eth_query_1.default(networkClient.provider);
        }
        __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_updateSmartTransaction).call(this, smartTransaction, {
            chainId,
            ethQuery,
        });
    }
    async updateSmartTransactions({ networkClientId, } = {}) {
        const { smartTransactions } = this.state.smartTransactionsState;
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        const smartTransactionsForChainId = smartTransactions[chainId];
        const transactionsToUpdate = smartTransactionsForChainId
            .filter(utils_1.isSmartTransactionPending)
            .map((smartTransaction) => smartTransaction.uuid);
        if (transactionsToUpdate.length > 0) {
            this.fetchSmartTransactionsStatus(transactionsToUpdate, {
                networkClientId,
            });
        }
    }
    // ! Ask backend API to accept list of uuids as params
    async fetchSmartTransactionsStatus(uuids, { networkClientId } = {}) {
        const params = new URLSearchParams({
            uuids: uuids.join(','),
        });
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        const ethQuery = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getEthQuery).call(this, { networkClientId });
        const url = `${(0, utils_1.getAPIRequestURL)(types_1.APIType.BATCH_STATUS, chainId)}?${params.toString()}`;
        const data = (await this.fetch(url));
        Object.entries(data).forEach(([uuid, stxStatus]) => {
            const transactionHash = stxStatus === null || stxStatus === void 0 ? void 0 : stxStatus.minedHash;
            this.eventEmitter.emit(`${uuid}:status`, stxStatus);
            if (transactionHash) {
                this.eventEmitter.emit(`${uuid}:transaction-hash`, transactionHash);
            }
            __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_updateSmartTransaction).call(this, {
                statusMetadata: stxStatus,
                status: (0, utils_1.calculateStatus)(stxStatus),
                cancellable: (0, utils_1.isSmartTransactionCancellable)(stxStatus),
                uuid,
            }, { chainId, ethQuery });
        });
        return data;
    }
    async addNonceToTransaction(transaction) {
        const nonceLock = await this.getNonceLock(transaction.from);
        const nonce = nonceLock.nextNonce;
        nonceLock.releaseLock();
        return Object.assign(Object.assign({}, transaction), { nonce: `0x${nonce.toString(16)}` });
    }
    clearFees() {
        const fees = {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
        };
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, this.state.smartTransactionsState), { fees }),
        });
        return fees;
    }
    async getFees(tradeTx, approvalTx, { networkClientId } = {}) {
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        const transactions = [];
        let unsignedTradeTransactionWithNonce;
        if (approvalTx) {
            const unsignedApprovalTransactionWithNonce = await this.addNonceToTransaction(approvalTx);
            transactions.push(unsignedApprovalTransactionWithNonce);
            unsignedTradeTransactionWithNonce = Object.assign(Object.assign({}, tradeTx), { 
                // If there is an approval tx, the trade tx's nonce is increased by 1.
                nonce: (0, utils_1.incrementNonceInHex)(unsignedApprovalTransactionWithNonce.nonce) });
        }
        else if (tradeTx.nonce) {
            unsignedTradeTransactionWithNonce = tradeTx;
        }
        else {
            unsignedTradeTransactionWithNonce = await this.addNonceToTransaction(tradeTx);
        }
        transactions.push(unsignedTradeTransactionWithNonce);
        const data = await this.fetch((0, utils_1.getAPIRequestURL)(types_1.APIType.GET_FEES, chainId), {
            method: 'POST',
            body: JSON.stringify({
                txs: transactions,
            }),
        });
        let approvalTxFees;
        let tradeTxFees;
        if (approvalTx) {
            approvalTxFees = data === null || data === void 0 ? void 0 : data.txs[0];
            tradeTxFees = data === null || data === void 0 ? void 0 : data.txs[1];
        }
        else {
            tradeTxFees = data === null || data === void 0 ? void 0 : data.txs[0];
        }
        this.update({
            smartTransactionsState: Object.assign(Object.assign(Object.assign({}, this.state.smartTransactionsState), (chainId === this.config.chainId && {
                fees: {
                    approvalTxFees,
                    tradeTxFees,
                },
            })), { feesByChainId: Object.assign(Object.assign({}, this.state.smartTransactionsState.feesByChainId), { [chainId]: {
                        approvalTxFees,
                        tradeTxFees,
                    } }) }),
        });
        return {
            approvalTxFees,
            tradeTxFees,
        };
    }
    // * After this successful call client must add a nonce representative to
    // * transaction controller external transactions list
    async submitSignedTransactions({ txParams, signedTransactions, signedCanceledTransactions, networkClientId, skipConfirm, }) {
        var _a;
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        const ethQuery = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getEthQuery).call(this, { networkClientId });
        const data = await this.fetch((0, utils_1.getAPIRequestURL)(types_1.APIType.SUBMIT_TRANSACTIONS, chainId), {
            method: 'POST',
            body: JSON.stringify({
                rawTxs: signedTransactions,
                rawCancelTxs: signedCanceledTransactions,
            }),
        });
        const time = Date.now();
        let preTxBalance;
        try {
            const preTxBalanceBN = await (0, controller_utils_1.query)(ethQuery, 'getBalance', [
                txParams === null || txParams === void 0 ? void 0 : txParams.from,
            ]);
            preTxBalance = new bignumber_js_1.BigNumber(preTxBalanceBN).toString(16);
        }
        catch (e) {
            console.error('provider error', e);
        }
        const requiresNonce = !txParams.nonce;
        let nonce;
        let nonceLock;
        let nonceDetails = {};
        if (requiresNonce) {
            nonceLock = await this.getNonceLock(txParams === null || txParams === void 0 ? void 0 : txParams.from);
            nonce = (0, bytes_1.hexlify)(nonceLock.nextNonce);
            nonceDetails = nonceLock.nonceDetails;
            if (txParams) {
                (_a = txParams.nonce) !== null && _a !== void 0 ? _a : (txParams.nonce = nonce);
            }
        }
        try {
            __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_updateSmartTransaction).call(this, {
                chainId,
                nonceDetails,
                preTxBalance,
                status: types_1.SmartTransactionStatuses.PENDING,
                time,
                txParams,
                uuid: data.uuid,
                cancellable: true,
                skipConfirm: skipConfirm !== null && skipConfirm !== void 0 ? skipConfirm : false,
            }, { chainId, ethQuery });
        }
        finally {
            nonceLock === null || nonceLock === void 0 ? void 0 : nonceLock.releaseLock();
        }
        return data;
    }
    // TODO: This should return if the cancellation was on chain or not (for nonce management)
    // After this successful call client must update nonce representative
    // in transaction controller external transactions list
    async cancelSmartTransaction(uuid, { networkClientId, } = {}) {
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        await this.fetch((0, utils_1.getAPIRequestURL)(types_1.APIType.CANCEL, chainId), {
            method: 'POST',
            body: JSON.stringify({ uuid }),
        });
    }
    async fetchLiveness({ networkClientId, } = {}) {
        const chainId = __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_getChainId).call(this, { networkClientId });
        let liveness = false;
        try {
            const response = await this.fetch((0, utils_1.getAPIRequestURL)(types_1.APIType.LIVENESS, chainId));
            liveness = Boolean(response.lastBlock);
        }
        catch (e) {
            console.log('"fetchLiveness" API call failed');
        }
        this.update({
            smartTransactionsState: Object.assign(Object.assign(Object.assign({}, this.state.smartTransactionsState), (chainId === this.config.chainId && { liveness })), { livenessByChainId: Object.assign(Object.assign({}, this.state.smartTransactionsState.livenessByChainId), { [chainId]: liveness }) }),
        });
        return liveness;
    }
    async setStatusRefreshInterval(interval) {
        if (interval !== this.config.interval) {
            this.configure({ interval }, false, false);
        }
    }
    getTransactions({ addressFrom, status, }) {
        const { smartTransactions } = this.state.smartTransactionsState;
        const { chainId } = this.config;
        const currentSmartTransactions = smartTransactions === null || smartTransactions === void 0 ? void 0 : smartTransactions[chainId];
        if (!currentSmartTransactions || currentSmartTransactions.length === 0) {
            return [];
        }
        return currentSmartTransactions.filter((stx) => {
            var _a;
            return stx.status === status && ((_a = stx.txParams) === null || _a === void 0 ? void 0 : _a.from) === addressFrom;
        });
    }
}
exports.default = SmartTransactionsController;
_SmartTransactionsController_instances = new WeakSet(), _SmartTransactionsController_updateSmartTransaction = function _SmartTransactionsController_updateSmartTransaction(smartTransaction, { chainId = this.config.chainId, ethQuery = this.ethQuery, }) {
    var _a;
    const { smartTransactionsState } = this.state;
    const { smartTransactions } = smartTransactionsState;
    const currentSmartTransactions = (_a = smartTransactions[chainId]) !== null && _a !== void 0 ? _a : [];
    const currentIndex = currentSmartTransactions === null || currentSmartTransactions === void 0 ? void 0 : currentSmartTransactions.findIndex((stx) => stx.uuid === smartTransaction.uuid);
    const isNewSmartTransaction = this.isNewSmartTransaction(smartTransaction.uuid);
    this.trackStxStatusChange(smartTransaction, isNewSmartTransaction
        ? undefined
        : currentSmartTransactions[currentIndex]);
    if (isNewSmartTransaction) {
        // add smart transaction
        const cancelledNonceIndex = currentSmartTransactions === null || currentSmartTransactions === void 0 ? void 0 : currentSmartTransactions.findIndex((stx) => {
            var _a, _b, _c;
            return ((_a = stx.txParams) === null || _a === void 0 ? void 0 : _a.nonce) === ((_b = smartTransaction.txParams) === null || _b === void 0 ? void 0 : _b.nonce) &&
                ((_c = stx.status) === null || _c === void 0 ? void 0 : _c.startsWith('cancelled'));
        });
        const snapshot = (0, cloneDeep_1.default)(smartTransaction);
        const history = [snapshot];
        const historifiedSmartTransaction = Object.assign(Object.assign({}, smartTransaction), { history });
        const nextSmartTransactions = cancelledNonceIndex > -1
            ? currentSmartTransactions
                .slice(0, cancelledNonceIndex)
                .concat(currentSmartTransactions.slice(cancelledNonceIndex + 1))
                .concat(historifiedSmartTransaction)
            : currentSmartTransactions.concat(historifiedSmartTransaction);
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, smartTransactionsState), { smartTransactions: Object.assign(Object.assign({}, smartTransactionsState.smartTransactions), { [chainId]: nextSmartTransactions }) }),
        });
        return;
    }
    if ((smartTransaction.status === types_1.SmartTransactionStatuses.SUCCESS ||
        smartTransaction.status === types_1.SmartTransactionStatuses.REVERTED) &&
        !smartTransaction.confirmed) {
        // confirm smart transaction
        const currentSmartTransaction = currentSmartTransactions[currentIndex];
        const nextSmartTransaction = Object.assign(Object.assign({}, currentSmartTransaction), smartTransaction);
        if (!smartTransaction.skipConfirm) {
            __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_confirmSmartTransaction).call(this, nextSmartTransaction, {
                chainId,
                ethQuery,
            });
        }
    }
    this.update({
        smartTransactionsState: Object.assign(Object.assign({}, smartTransactionsState), { smartTransactions: Object.assign(Object.assign({}, smartTransactionsState.smartTransactions), { [chainId]: smartTransactionsState.smartTransactions[chainId].map((item, index) => {
                    return index === currentIndex
                        ? Object.assign(Object.assign({}, item), smartTransaction) : item;
                }) }) }),
    });
}, _SmartTransactionsController_confirmSmartTransaction = async function _SmartTransactionsController_confirmSmartTransaction(smartTransaction, { chainId = this.config.chainId, ethQuery = this.ethQuery, }) {
    var _a;
    if (smartTransaction.skipConfirm) {
        return;
    }
    const txHash = (_a = smartTransaction.statusMetadata) === null || _a === void 0 ? void 0 : _a.minedHash;
    try {
        const transactionReceipt = await (0, controller_utils_1.query)(ethQuery, 'getTransactionReceipt', [txHash]);
        const transaction = await (0, controller_utils_1.query)(ethQuery, 'getTransactionByHash', [txHash]);
        const maxFeePerGas = transaction === null || transaction === void 0 ? void 0 : transaction.maxFeePerGas;
        const maxPriorityFeePerGas = transaction === null || transaction === void 0 ? void 0 : transaction.maxPriorityFeePerGas;
        if (transactionReceipt === null || transactionReceipt === void 0 ? void 0 : transactionReceipt.blockNumber) {
            const blockData = await (0, controller_utils_1.query)(ethQuery, 'getBlockByNumber', [transactionReceipt === null || transactionReceipt === void 0 ? void 0 : transactionReceipt.blockNumber, false]);
            const baseFeePerGas = blockData === null || blockData === void 0 ? void 0 : blockData.baseFeePerGas;
            const updatedTxParams = Object.assign(Object.assign({}, smartTransaction.txParams), { maxFeePerGas,
                maxPriorityFeePerGas });
            // call confirmExternalTransaction
            const originalTxMeta = Object.assign(Object.assign({}, smartTransaction), { id: smartTransaction.uuid, status: 'confirmed', hash: txHash, txParams: updatedTxParams });
            // create txMeta snapshot for history
            const snapshot = (0, utils_1.snapshotFromTxMeta)(originalTxMeta);
            // recover previous tx state obj
            const previousState = (0, utils_1.replayHistory)(originalTxMeta.history);
            // generate history entry and add to history
            const entry = (0, utils_1.generateHistoryEntry)(previousState, snapshot, 'txStateManager: setting status to confirmed');
            const txMeta = entry.length > 0
                ? Object.assign(Object.assign({}, originalTxMeta), { history: originalTxMeta.history.concat(entry) }) : originalTxMeta;
            this.confirmExternalTransaction(txMeta, transactionReceipt, baseFeePerGas);
            this.trackMetaMetricsEvent({
                event: 'STX Confirmed',
                category: 'swaps',
            });
            __classPrivateFieldGet(this, _SmartTransactionsController_instances, "m", _SmartTransactionsController_updateSmartTransaction).call(this, Object.assign(Object.assign({}, smartTransaction), { confirmed: true }), { chainId, ethQuery });
        }
    }
    catch (e) {
        this.trackMetaMetricsEvent({
            event: 'STX Confirmation Failed',
            category: 'swaps',
        });
        console.error('confirm error', e);
    }
}, _SmartTransactionsController_getChainId = function _SmartTransactionsController_getChainId({ networkClientId, } = {}) {
    return networkClientId
        ? this.getNetworkClientById(networkClientId).configuration.chainId
        : this.config.chainId;
}, _SmartTransactionsController_getEthQuery = function _SmartTransactionsController_getEthQuery({ networkClientId, } = {}) {
    return networkClientId
        ? new eth_query_1.default(this.getNetworkClientById(networkClientId).provider)
        : this.ethQuery;
};
//# sourceMappingURL=SmartTransactionsController.js.map