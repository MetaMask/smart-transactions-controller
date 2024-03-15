import {
  BaseConfig,
  BaseController,
  BaseState,
} from '@metamask/base-controller';
import { safelyExecute } from '@metamask/controller-utils';
import { NetworkState } from '@metamask/network-controller';
import { BigNumber } from 'bignumber.js';
import { BigNumber as ethersBigNumber } from '@ethersproject/bignumber';
import { Web3Provider } from '@ethersproject/providers';
import { hexlify } from '@ethersproject/bytes';
import mapValues from 'lodash/mapValues';
import cloneDeep from 'lodash/cloneDeep';

import {
  APIType,
  SmartTransaction,
  SignedTransaction,
  SignedCanceledTransaction,
  UnsignedTransaction,
  SmartTransactionsStatus,
  SmartTransactionStatuses,
  Fees,
  IndividualTxFees,
} from './types';
import {
  getAPIRequestURL,
  isSmartTransactionPending,
  calculateStatus,
  snapshotFromTxMeta,
  replayHistory,
  generateHistoryEntry,
  getStxProcessingTime,
  handleFetch,
  isSmartTransactionCancellable,
  incrementNonceInHex,
} from './utils';
import { CHAIN_IDS } from './constants';

const MISSING_PROVIDER_ERROR_MSG =
  '`ethersProvider` is not defined on SmartTransactionsController';
const SECOND = 1000;
export const DEFAULT_INTERVAL = SECOND * 5;

export type SmartTransactionsControllerConfig = BaseConfig & {
  interval: number;
  clientId: string;
  chainId: string;
  supportedChainIds: string[];
};

export type SmartTransactionsControllerState = BaseState & {
  smartTransactionsState: {
    smartTransactions: Record<string, SmartTransaction[]>;
    userOptIn: boolean | undefined;
    userOptInV2: boolean | undefined;
    liveness: boolean | undefined;
    fees: {
      approvalTxFees: IndividualTxFees | undefined;
      tradeTxFees: IndividualTxFees | undefined;
    };
  };
};

export default class SmartTransactionsController extends BaseController<
  SmartTransactionsControllerConfig,
  SmartTransactionsControllerState
> {
  public timeoutHandle?: NodeJS.Timeout;

  private getNonceLock: any;

  public ethersProvider: any;

  public confirmExternalTransaction: any;

  private trackMetaMetricsEvent: any;

  /* istanbul ignore next */
  private async fetch(request: string, options?: RequestInit) {
    const { clientId } = this.config;
    const fetchOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(clientId && { 'X-Client-Id': clientId }),
      },
    };

    return handleFetch(request, fetchOptions);
  }

  constructor(
    {
      onNetworkStateChange,
      getNonceLock,
      provider,
      confirmExternalTransaction,
      trackMetaMetricsEvent,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getNonceLock: any;
      provider: any;
      confirmExternalTransaction: any;
      trackMetaMetricsEvent: any;
    },
    config?: Partial<SmartTransactionsControllerConfig>,
    state?: Partial<SmartTransactionsControllerState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: CHAIN_IDS.ETHEREUM,
      clientId: 'default',
      supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.RINKEBY],
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
      },
    };

    this.getNonceLock = getNonceLock;
    this.ethersProvider = new Web3Provider(provider);
    this.confirmExternalTransaction = confirmExternalTransaction;
    this.trackMetaMetricsEvent = trackMetaMetricsEvent;

    this.initialize();
    this.initializeSmartTransactionsForChainId();

    onNetworkStateChange(({ providerConfig: newProvider }) => {
      const { chainId } = newProvider;
      this.configure({ chainId });
      this.initializeSmartTransactionsForChainId();
      this.checkPoll(this.state);
      this.ethersProvider = new Web3Provider(provider);
    });

    this.subscribe((currentState: any) => this.checkPoll(currentState));
  }

  checkPoll(state: any) {
    const { smartTransactions } = state.smartTransactionsState;
    const currentSmartTransactions = smartTransactions[this.config.chainId];
    const pendingTransactions = currentSmartTransactions?.filter(
      isSmartTransactionPending,
    );
    if (!this.timeoutHandle && pendingTransactions?.length > 0) {
      this.poll();
    } else if (this.timeoutHandle && pendingTransactions?.length === 0) {
      this.stop();
    }
  }

  initializeSmartTransactionsForChainId() {
    if (this.config.supportedChainIds.includes(this.config.chainId)) {
      const { smartTransactionsState } = this.state;
      this.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            ...smartTransactionsState.smartTransactions,
            [this.config.chainId]:
              smartTransactionsState.smartTransactions[this.config.chainId] ??
              [],
          },
        },
      });
    }
  }

  async poll(interval?: number): Promise<void> {
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

  setOptInState(state: boolean | undefined): void {
    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        userOptInV2: state,
      },
    });
  }

  trackStxStatusChange(
    smartTransaction: SmartTransaction,
    prevSmartTransaction?: SmartTransaction,
  ) {
    if (!prevSmartTransaction) {
      return; // Don't track the first STX, because it doesn't have all necessary params.
    }

    let updatedSmartTransaction = cloneDeep(smartTransaction);
    updatedSmartTransaction = {
      ...cloneDeep(prevSmartTransaction),
      ...updatedSmartTransaction,
    };

    if (
      !updatedSmartTransaction.swapMetaData ||
      (updatedSmartTransaction.status === prevSmartTransaction.status &&
        prevSmartTransaction.swapMetaData)
    ) {
      return; // If status hasn't changed, don't track it again.
    }

    const sensitiveProperties = {
      stx_status: updatedSmartTransaction.status,
      token_from_symbol: updatedSmartTransaction.sourceTokenSymbol,
      token_to_symbol: updatedSmartTransaction.destinationTokenSymbol,
      processing_time: getStxProcessingTime(updatedSmartTransaction.time),
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

  isNewSmartTransaction(smartTransactionUuid: string): boolean {
    const { chainId } = this.config;
    const { smartTransactionsState } = this.state;
    const { smartTransactions } = smartTransactionsState;
    const currentSmartTransactions = smartTransactions[chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransactionUuid,
    );
    return currentIndex === -1 || currentIndex === undefined;
  }

  updateSmartTransaction(smartTransaction: SmartTransaction): void {
    if (this.ethersProvider === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR_MSG);
    }
    const { chainId } = this.config;
    const { smartTransactionsState } = this.state;
    const { smartTransactions } = smartTransactionsState;
    const currentSmartTransactions = smartTransactions[chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );
    const isNewSmartTransaction = this.isNewSmartTransaction(
      smartTransaction.uuid,
    );

    this.trackStxStatusChange(
      smartTransaction,
      isNewSmartTransaction
        ? undefined
        : currentSmartTransactions[currentIndex],
    );

    if (isNewSmartTransaction) {
      // add smart transaction
      const cancelledNonceIndex = currentSmartTransactions.findIndex(
        (stx: SmartTransaction) =>
          stx.txParams?.nonce === smartTransaction.txParams?.nonce &&
          stx.status?.startsWith('cancelled'),
      );
      const snapshot = cloneDeep(smartTransaction);
      const history = [snapshot];
      const historifiedSmartTransaction = { ...smartTransaction, history };
      const nextSmartTransactions =
        cancelledNonceIndex > -1
          ? currentSmartTransactions
              .slice(0, cancelledNonceIndex)
              .concat(currentSmartTransactions.slice(cancelledNonceIndex + 1))
              .concat(historifiedSmartTransaction)
          : currentSmartTransactions.concat(historifiedSmartTransaction);
      this.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            ...smartTransactionsState.smartTransactions,
            [chainId]: nextSmartTransactions,
          },
        },
      });
      return;
    }

    if (
      (smartTransaction.status === SmartTransactionStatuses.SUCCESS ||
        smartTransaction.status === SmartTransactionStatuses.REVERTED) &&
      !smartTransaction.confirmed
    ) {
      // confirm smart transaction
      const currentSmartTransaction = currentSmartTransactions[currentIndex];
      const nextSmartTransaction = {
        ...currentSmartTransaction,
        ...smartTransaction,
      };
      this.confirmSmartTransaction(nextSmartTransaction);
    }

    this.update({
      smartTransactionsState: {
        ...smartTransactionsState,
        smartTransactions: {
          ...smartTransactionsState.smartTransactions,
          [chainId]: smartTransactionsState.smartTransactions[chainId].map(
            (item, index) => {
              return index === currentIndex
                ? { ...item, ...smartTransaction }
                : item;
            },
          ),
        },
      },
    });
  }

  async updateSmartTransactions() {
    const { smartTransactions } = this.state.smartTransactionsState;
    const { chainId } = this.config;

    const currentSmartTransactions = smartTransactions?.[chainId];

    const transactionsToUpdate: string[] = currentSmartTransactions
      .filter(isSmartTransactionPending)
      .map((smartTransaction) => smartTransaction.uuid);

    if (transactionsToUpdate.length > 0) {
      this.fetchSmartTransactionsStatus(transactionsToUpdate);
    }
  }

  async confirmSmartTransaction(smartTransaction: SmartTransaction) {
    if (this.ethersProvider === undefined) {
      throw new Error(MISSING_PROVIDER_ERROR_MSG);
    }
    const txHash = smartTransaction.statusMetadata?.minedHash;
    try {
      const transactionReceipt =
        await this.ethersProvider.getTransactionReceipt(txHash);
      const transaction = await this.ethersProvider.getTransaction(txHash);
      const maxFeePerGas = transaction.maxFeePerGas?.toHexString();
      const maxPriorityFeePerGas =
        transaction.maxPriorityFeePerGas?.toHexString();
      if (transactionReceipt?.blockNumber) {
        const blockData = await this.ethersProvider.getBlock(
          transactionReceipt?.blockNumber,
          false,
        );
        const baseFeePerGas = blockData?.baseFeePerGas.toHexString();
        const txReceipt = mapValues(transactionReceipt, (value) => {
          if (value instanceof ethersBigNumber) {
            return value.toHexString();
          }
          return value;
        });
        const updatedTxParams = {
          ...smartTransaction.txParams,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };
        // call confirmExternalTransaction
        const originalTxMeta = {
          ...smartTransaction,
          id: smartTransaction.uuid,
          status: 'confirmed',
          hash: txHash,
          txParams: updatedTxParams,
        };
        // create txMeta snapshot for history
        const snapshot = snapshotFromTxMeta(originalTxMeta);
        // recover previous tx state obj
        const previousState = replayHistory(originalTxMeta.history);
        // generate history entry and add to history
        const entry = generateHistoryEntry(
          previousState,
          snapshot,
          'txStateManager: setting status to confirmed',
        );
        const txMeta =
          entry.length > 0
            ? {
                ...originalTxMeta,
                history: originalTxMeta.history.concat(entry),
              }
            : originalTxMeta;
        this.confirmExternalTransaction(txMeta, txReceipt, baseFeePerGas);

        this.trackMetaMetricsEvent({
          event: 'STX Confirmed',
          category: 'swaps',
        });

        this.updateSmartTransaction({
          ...smartTransaction,
          confirmed: true,
        });
      }
    } catch (e) {
      this.trackMetaMetricsEvent({
        event: 'STX Confirmation Failed',
        category: 'swaps',
      });
      console.error('confirm error', e);
    }
  }

  // ! Ask backend API to accept list of uuids as params
  async fetchSmartTransactionsStatus(
    uuids: string[],
  ): Promise<SmartTransaction[]> {
    const { chainId } = this.config;

    const params = new URLSearchParams({
      uuids: uuids.join(','),
    });

    const url = `${getAPIRequestURL(
      APIType.BATCH_STATUS,
      chainId,
    )}?${params.toString()}`;

    const data = await this.fetch(url);

    Object.entries(data).forEach(([uuid, stxStatus]) => {
      this.updateSmartTransaction({
        statusMetadata: stxStatus as SmartTransactionsStatus,
        status: calculateStatus(stxStatus as SmartTransactionsStatus),
        cancellable: isSmartTransactionCancellable(
          stxStatus as SmartTransactionsStatus,
        ),
        uuid,
      });
    });

    return data;
  }

  async addNonceToTransaction(
    transaction: UnsignedTransaction,
  ): Promise<UnsignedTransaction> {
    const nonceLock = await this.getNonceLock(transaction.from);
    const nonce = nonceLock.nextNonce;
    nonceLock.releaseLock();
    return {
      ...transaction,
      nonce: `0x${nonce.toString(16)}`,
    };
  }

  clearFees(): Fees {
    const fees = {
      approvalTxFees: undefined,
      tradeTxFees: undefined,
    };
    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        fees,
      },
    });
    return fees;
  }

  async getFees(
    tradeTx: UnsignedTransaction,
    approvalTx: UnsignedTransaction,
  ): Promise<Fees> {
    const { chainId } = this.config;
    const transactions = [];
    let unsignedTradeTransactionWithNonce;
    if (approvalTx) {
      const unsignedApprovalTransactionWithNonce =
        await this.addNonceToTransaction(approvalTx);
      transactions.push(unsignedApprovalTransactionWithNonce);
      unsignedTradeTransactionWithNonce = {
        ...tradeTx,
        // If there is an approval tx, the trade tx's nonce is increased by 1.
        nonce: incrementNonceInHex(unsignedApprovalTransactionWithNonce.nonce),
      };
    } else {
      unsignedTradeTransactionWithNonce = await this.addNonceToTransaction(
        tradeTx,
      );
    }
    transactions.push(unsignedTradeTransactionWithNonce);
    const data = await this.fetch(getAPIRequestURL(APIType.GET_FEES, chainId), {
      method: 'POST',
      body: JSON.stringify({
        txs: transactions,
      }),
    });
    let approvalTxFees;
    let tradeTxFees;
    if (approvalTx) {
      approvalTxFees = data?.txs[0];
      tradeTxFees = data?.txs[1];
    } else {
      tradeTxFees = data?.txs[0];
    }

    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        fees: {
          approvalTxFees,
          tradeTxFees,
        },
      },
    });
    return {
      approvalTxFees,
      tradeTxFees,
    };
  }

  // * After this successful call client must add a nonce representative to
  // * transaction controller external transactions list
  async submitSignedTransactions({
    txParams,
    signedTransactions,
    signedCanceledTransactions,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions: SignedCanceledTransaction[];
    txParams?: any;
  }) {
    const { chainId } = this.config;
    const data = await this.fetch(
      getAPIRequestURL(APIType.SUBMIT_TRANSACTIONS, chainId),
      {
        method: 'POST',
        body: JSON.stringify({
          rawTxs: signedTransactions,
          rawCancelTxs: signedCanceledTransactions,
        }),
      },
    );
    const time = Date.now();
    let preTxBalance;
    try {
      const preTxBalanceBN = await this.ethersProvider.getBalance(
        txParams?.from,
      );
      preTxBalance = new BigNumber(preTxBalanceBN.toHexString()).toString(16);
    } catch (e) {
      console.error('ethers error', e);
    }
    const nonceLock = await this.getNonceLock(txParams?.from);
    try {
      const nonce = hexlify(nonceLock.nextNonce);
      if (txParams && !txParams?.nonce) {
        txParams.nonce = nonce;
      }
      const { nonceDetails } = nonceLock;

      this.updateSmartTransaction({
        chainId,
        nonceDetails,
        preTxBalance,
        status: SmartTransactionStatuses.PENDING,
        time,
        txParams,
        uuid: data.uuid,
        cancellable: true,
      });
    } finally {
      nonceLock.releaseLock();
    }

    return data;
  }

  // TODO: This should return if the cancellation was on chain or not (for nonce management)
  // After this successful call client must update nonce representative
  // in transaction controller external transactions list
  async cancelSmartTransaction(uuid: string): Promise<void> {
    const { chainId } = this.config;
    await this.fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
      method: 'POST',
      body: JSON.stringify({ uuid }),
    });
  }

  async fetchLiveness(): Promise<boolean> {
    const { chainId } = this.config;
    let liveness = false;
    try {
      const response = await this.fetch(
        getAPIRequestURL(APIType.LIVENESS, chainId),
      );
      liveness = Boolean(response.lastBlock);
    } catch (e) {
      console.log('"fetchLiveness" API call failed');
    }

    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        liveness,
      },
    });
    return liveness;
  }

  async setStatusRefreshInterval(interval: number): Promise<void> {
    if (interval !== this.config.interval) {
      this.configure({ interval }, false, false);
    }
  }

  getTransactions({
    addressFrom,
    status,
  }: {
    addressFrom: string;
    status: SmartTransactionStatuses;
  }): SmartTransaction[] {
    const { smartTransactions } = this.state.smartTransactionsState;
    const { chainId } = this.config;
    const currentSmartTransactions = smartTransactions?.[chainId];
    if (!currentSmartTransactions || currentSmartTransactions.length === 0) {
      return [];
    }

    return currentSmartTransactions.filter((stx) => {
      return stx.status === status && stx.txParams?.from === addressFrom;
    });
  }
}
