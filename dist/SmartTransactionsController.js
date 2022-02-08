"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANCELLABLE_INTERVAL = exports.DEFAULT_INTERVAL = void 0;
const controllers_1 = require("@metamask/controllers");
const bignumber_js_1 = require("bignumber.js");
const ethers_1 = require("ethers");
const mapValues_1 = __importDefault(require("lodash/mapValues"));
const cloneDeep_1 = __importDefault(require("lodash/cloneDeep"));
const types_1 = require("./types");
const utils_1 = require("./utils");
const constants_1 = require("./constants");
const { safelyExecute } = controllers_1.util;
// TODO: JSDoc all methods
// TODO: Remove all comments (* ! ?)
const SECOND = 1000;
const MINUTE = SECOND * 60;
exports.DEFAULT_INTERVAL = SECOND * 10;
exports.CANCELLABLE_INTERVAL = MINUTE;
class SmartTransactionsController extends controllers_1.BaseController {
    constructor({ onNetworkStateChange, getNonceLock, getNetwork, provider, txController, trackMetaMetricsEvent, }, config, state) {
        super(config, state);
        this.defaultConfig = {
            interval: exports.DEFAULT_INTERVAL,
            chainId: constants_1.CHAIN_IDS.ETHEREUM,
            clientId: 'default',
            supportedChainIds: [constants_1.CHAIN_IDS.ETHEREUM, constants_1.CHAIN_IDS.RINKEBY],
        };
        this.defaultState = {
            smartTransactionsState: {
                smartTransactions: {},
                userOptIn: undefined,
                fees: undefined,
                liveness: true,
                estimatedGas: {
                    txData: undefined,
                    approvalTxData: undefined,
                },
            },
        };
        this.getNonceLock = getNonceLock;
        this.getNetwork = getNetwork;
        this.ethersProvider = new ethers_1.ethers.providers.Web3Provider(provider);
        this.txController = txController;
        this.trackMetaMetricsEvent = trackMetaMetricsEvent;
        this.initialize();
        this.initializeSmartTransactionsForChainId();
        onNetworkStateChange(({ provider: newProvider }) => {
            const { chainId } = newProvider;
            this.configure({ chainId });
            this.initializeSmartTransactionsForChainId();
            this.checkPoll(this.state);
            this.ethersProvider = new ethers_1.ethers.providers.Web3Provider(provider);
        });
        this.subscribe((currentState) => this.checkPoll(currentState));
    }
    /* istanbul ignore next */
    async fetch(request, options) {
        const { clientId } = this.config;
        const fetchOptions = Object.assign(Object.assign({}, options), { headers: Object.assign({ 'Content-Type': 'application/json' }, (clientId && { 'X-Client-Id': clientId })) });
        return utils_1.handleFetch(request, fetchOptions);
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
        await safelyExecute(() => this.updateSmartTransactions());
        this.timeoutHandle = setInterval(() => {
            safelyExecute(() => this.updateSmartTransactions());
        }, this.config.interval);
    }
    async stop() {
        this.timeoutHandle && clearInterval(this.timeoutHandle);
        this.timeoutHandle = undefined;
    }
    setOptInState(state) {
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, this.state.smartTransactionsState), { userOptIn: state }),
        });
    }
    trackStxStatusChange(smartTransaction, prevSmartTransaction) {
        var _a, _b;
        if (!prevSmartTransaction) {
            return; // Don't track the first STX, because it doesn't have all necessary params.
        }
        let updatedSmartTransaction = cloneDeep_1.default(smartTransaction);
        updatedSmartTransaction = Object.assign(Object.assign({}, cloneDeep_1.default(prevSmartTransaction)), updatedSmartTransaction);
        if (!updatedSmartTransaction.swapMetaData ||
            (updatedSmartTransaction.status === prevSmartTransaction.status &&
                prevSmartTransaction.swapMetaData)) {
            return; // If status hasn't changed, don't track it again.
        }
        const sensitiveProperties = {
            stx_status: updatedSmartTransaction.status,
            token_from_address: (_a = updatedSmartTransaction.txParams) === null || _a === void 0 ? void 0 : _a.from,
            token_from_symbol: updatedSmartTransaction.sourceTokenSymbol,
            token_to_address: (_b = updatedSmartTransaction.txParams) === null || _b === void 0 ? void 0 : _b.to,
            token_to_symbol: updatedSmartTransaction.destinationTokenSymbol,
            processing_time: utils_1.getStxProcessingTime(updatedSmartTransaction.time),
            stx_enabled: true,
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
    updateSmartTransaction(smartTransaction) {
        const { chainId } = this.config;
        const { smartTransactionsState } = this.state;
        const { smartTransactions } = smartTransactionsState;
        const currentSmartTransactions = smartTransactions[chainId];
        const currentIndex = currentSmartTransactions === null || currentSmartTransactions === void 0 ? void 0 : currentSmartTransactions.findIndex((stx) => stx.uuid === smartTransaction.uuid);
        const isNewSmartTransaction = this.isNewSmartTransaction(smartTransaction.uuid);
        this.trackStxStatusChange(smartTransaction, isNewSmartTransaction
            ? undefined
            : currentSmartTransactions[currentIndex]);
        if (isNewSmartTransaction) {
            // add smart transaction
            const cancelledNonceIndex = currentSmartTransactions.findIndex((stx) => {
                var _a, _b, _c;
                return ((_a = stx.txParams) === null || _a === void 0 ? void 0 : _a.nonce) === ((_b = smartTransaction.txParams) === null || _b === void 0 ? void 0 : _b.nonce) &&
                    ((_c = stx.status) === null || _c === void 0 ? void 0 : _c.startsWith('cancelled'));
            });
            const snapshot = cloneDeep_1.default(smartTransaction);
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
            this.confirmSmartTransaction(nextSmartTransaction);
        }
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, smartTransactionsState), { smartTransactions: Object.assign(Object.assign({}, smartTransactionsState.smartTransactions), { [chainId]: smartTransactionsState.smartTransactions[chainId].map((item, index) => {
                        return index === currentIndex
                            ? Object.assign(Object.assign({}, item), smartTransaction) : item;
                    }) }) }),
        });
    }
    async updateSmartTransactions() {
        const { smartTransactions } = this.state.smartTransactionsState;
        const { chainId } = this.config;
        const currentSmartTransactions = smartTransactions === null || smartTransactions === void 0 ? void 0 : smartTransactions[chainId];
        const transactionsToUpdate = currentSmartTransactions
            .filter(utils_1.isSmartTransactionPending)
            .map((smartTransaction) => smartTransaction.uuid);
        if (transactionsToUpdate.length > 0) {
            this.fetchSmartTransactionsStatus(transactionsToUpdate);
        }
    }
    async confirmSmartTransaction(smartTransaction) {
        var _a, _b, _c;
        const txHash = (_a = smartTransaction.statusMetadata) === null || _a === void 0 ? void 0 : _a.minedHash;
        try {
            const transactionReceipt = await this.ethersProvider.getTransactionReceipt(txHash);
            const transaction = await this.ethersProvider.getTransaction(txHash);
            const maxFeePerGas = (_b = transaction.maxFeePerGas) === null || _b === void 0 ? void 0 : _b.toHexString();
            const maxPriorityFeePerGas = (_c = transaction.maxPriorityFeePerGas) === null || _c === void 0 ? void 0 : _c.toHexString();
            if (transactionReceipt === null || transactionReceipt === void 0 ? void 0 : transactionReceipt.blockNumber) {
                const blockData = await this.ethersProvider.getBlock(transactionReceipt === null || transactionReceipt === void 0 ? void 0 : transactionReceipt.blockNumber, false);
                const baseFeePerGas = blockData === null || blockData === void 0 ? void 0 : blockData.baseFeePerGas.toHexString();
                const txReceipt = mapValues_1.default(transactionReceipt, (value) => {
                    if (value instanceof ethers_1.ethers.BigNumber) {
                        return value.toHexString();
                    }
                    return value;
                });
                const updatedTxParams = Object.assign(Object.assign({}, smartTransaction.txParams), { maxFeePerGas,
                    maxPriorityFeePerGas });
                // call confirmExternalTransaction
                const originalTxMeta = Object.assign(Object.assign({}, smartTransaction), { id: smartTransaction.uuid, status: 'confirmed', hash: txHash, txParams: updatedTxParams });
                // create txMeta snapshot for history
                const snapshot = utils_1.snapshotFromTxMeta(originalTxMeta);
                // recover previous tx state obj
                const previousState = utils_1.replayHistory(originalTxMeta.history);
                // generate history entry and add to history
                const entry = utils_1.generateHistoryEntry(previousState, snapshot, 'txStateManager: setting status to confirmed');
                const txMeta = entry.length > 0
                    ? Object.assign(Object.assign({}, originalTxMeta), { history: originalTxMeta.history.concat(entry) }) : originalTxMeta;
                this.txController.confirmExternalTransaction(txMeta, txReceipt, baseFeePerGas);
                this.trackMetaMetricsEvent({
                    event: 'STX Confirmed',
                    category: 'swaps',
                });
                this.updateSmartTransaction(Object.assign(Object.assign({}, smartTransaction), { confirmed: true }));
            }
        }
        catch (e) {
            this.trackMetaMetricsEvent({
                event: 'STX Confirmation Failed',
                category: 'swaps',
            });
            console.error('confirm error', e);
        }
    }
    // ! Ask backend API to accept list of uuids as params
    async fetchSmartTransactionsStatus(uuids) {
        const { chainId } = this.config;
        const params = new URLSearchParams({
            uuids: uuids.join(','),
        });
        const url = `${utils_1.getAPIRequestURL(types_1.APIType.BATCH_STATUS, chainId)}?${params.toString()}`;
        const data = await this.fetch(url);
        Object.entries(data).forEach(([uuid, smartTransaction]) => {
            this.updateSmartTransaction({
                statusMetadata: smartTransaction,
                status: utils_1.calculateStatus(smartTransaction),
                uuid,
            });
        });
        return data;
    }
    async addNonceToTransaction(transaction) {
        const nonceLock = await this.getNonceLock(transaction.from);
        const nonce = nonceLock.nextNonce;
        nonceLock.releaseLock();
        return Object.assign(Object.assign({}, transaction), { nonce: `0x${nonce.toString(16)}` });
    }
    async getFees(unsignedTransaction) {
        const { chainId } = this.config;
        const unsignedTransactionWithNonce = await this.addNonceToTransaction(unsignedTransaction);
        const data = await this.fetch(utils_1.getAPIRequestURL(types_1.APIType.GET_FEES, chainId), {
            method: 'POST',
            body: JSON.stringify({
                tx: unsignedTransactionWithNonce,
            }),
        });
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, this.state.smartTransactionsState), { fees: data }),
        });
        return data;
    }
    async estimateGas(unsignedTransaction, approveTxParams) {
        const { chainId } = this.config;
        let approvalTxData;
        if (approveTxParams) {
            const unsignedApprovalTransactionWithNonce = await this.addNonceToTransaction(approveTxParams);
            approvalTxData = await this.fetch(utils_1.getAPIRequestURL(types_1.APIType.ESTIMATE_GAS, chainId), {
                method: 'POST',
                body: JSON.stringify({
                    tx: unsignedApprovalTransactionWithNonce,
                }),
            });
        }
        const unsignedTransactionWithNonce = await this.addNonceToTransaction(unsignedTransaction);
        const data = await this.fetch(utils_1.getAPIRequestURL(types_1.APIType.ESTIMATE_GAS, chainId), {
            method: 'POST',
            body: JSON.stringify(Object.assign({ tx: unsignedTransactionWithNonce }, (approveTxParams && { pending_txs: [approveTxParams] }))),
        });
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, this.state.smartTransactionsState), { estimatedGas: {
                    txData: data,
                    approvalTxData,
                } }),
        });
        return data;
    }
    // * After this successful call client must add a nonce representative to
    // * transaction controller external transactions list
    async submitSignedTransactions({ txParams, signedTransactions, signedCanceledTransactions, }) {
        const { chainId } = this.config;
        const data = await this.fetch(utils_1.getAPIRequestURL(types_1.APIType.SUBMIT_TRANSACTIONS, chainId), {
            method: 'POST',
            body: JSON.stringify({
                rawTxs: signedTransactions,
                rawCancelTxs: signedCanceledTransactions,
            }),
        });
        const time = Date.now();
        const metamaskNetworkId = this.getNetwork();
        let preTxBalance;
        try {
            const preTxBalanceBN = await this.ethersProvider.getBalance(txParams === null || txParams === void 0 ? void 0 : txParams.from);
            preTxBalance = new bignumber_js_1.BigNumber(preTxBalanceBN.toHexString()).toString(16);
        }
        catch (e) {
            console.error('ethers error', e);
        }
        const nonceLock = await this.getNonceLock(txParams === null || txParams === void 0 ? void 0 : txParams.from);
        const nonce = ethers_1.ethers.utils.hexlify(nonceLock.nextNonce);
        if (txParams && !(txParams === null || txParams === void 0 ? void 0 : txParams.nonce)) {
            txParams.nonce = nonce;
        }
        const { nonceDetails } = nonceLock;
        this.updateSmartTransaction({
            chainId,
            nonceDetails,
            metamaskNetworkId,
            preTxBalance,
            status: types_1.SmartTransactionStatuses.PENDING,
            time,
            txParams,
            uuid: data.uuid,
            cancellable: true,
        });
        setTimeout(() => {
            if (!this.isNewSmartTransaction(data.uuid)) {
                // Only do this for an existing smart transaction. If an STX is not in the list anymore
                // (e.g. because it was cancelled and a new one was submitted, which deletes the first one),
                // do not try to update the old one, because it would create a new one with most
                // of the required STX params missing. It would only have "uuid" and "cancellable" params.
                this.updateSmartTransaction({
                    uuid: data.uuid,
                    cancellable: false,
                });
            }
        }, exports.CANCELLABLE_INTERVAL);
        nonceLock.releaseLock();
        return data;
    }
    // ! This should return if the cancellation was on chain or not (for nonce management)
    // * After this successful call client must update nonce representative
    // * in transaction controller external transactions list
    // ! Ask backend API to make this endpoint a POST
    async cancelSmartTransaction(uuid) {
        const { chainId } = this.config;
        await this.fetch(utils_1.getAPIRequestURL(types_1.APIType.CANCEL, chainId), {
            method: 'POST',
            body: JSON.stringify({ uuid }),
        });
        this.updateSmartTransaction({
            uuid,
            status: types_1.SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
        });
    }
    async fetchLiveness() {
        const { chainId } = this.config;
        let liveness = false;
        try {
            const response = await this.fetch(utils_1.getAPIRequestURL(types_1.APIType.LIVENESS, chainId));
            liveness = Boolean(response.lastBlock);
        }
        catch (e) {
            console.log('"fetchLiveness" API call failed');
        }
        this.update({
            smartTransactionsState: Object.assign(Object.assign({}, this.state.smartTransactionsState), { liveness }),
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
//# sourceMappingURL=SmartTransactionsController.js.map