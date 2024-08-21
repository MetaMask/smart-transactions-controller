import { hexlify } from '@ethersproject/bytes';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  query,
  safelyExecute,
  ChainId,
  isSafeDynamicKey,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  TransactionController,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';
import cloneDeep from 'lodash/cloneDeep';

import { MetaMetricsEventCategory, MetaMetricsEventName } from './constants';
import type {
  Fees,
  Hex,
  IndividualTxFees,
  SignedCanceledTransaction,
  SignedTransaction,
  SmartTransaction,
  SmartTransactionsStatus,
  UnsignedTransaction,
  GetTransactionsOptions,
  MetaMetricsProps,
} from './types';
import { APIType, SmartTransactionStatuses } from './types';
import {
  calculateStatus,
  generateHistoryEntry,
  getAPIRequestURL,
  handleFetch,
  incrementNonceInHex,
  isSmartTransactionCancellable,
  isSmartTransactionPending,
  replayHistory,
  snapshotFromTxMeta,
  getTxHash,
  getSmartTransactionMetricsProperties,
  getSmartTransactionMetricsSensitiveProperties,
} from './utils';

const SECOND = 1000;
export const DEFAULT_INTERVAL = SECOND * 5;
const DEFAULT_CLIENT_ID = 'default';
const ETH_QUERY_ERROR_MSG =
  '`ethQuery` is not defined on SmartTransactionsController';

/**
 * The name of the {@link SmartTransactionsController}
 */
const controllerName = 'SmartTransactionsController';

const controllerMetadata = {
  smartTransactionsState: {
    persist: false,
    anonymous: true,
  },
};

type FeeEstimates = {
  approvalTxFees: IndividualTxFees | null;
  tradeTxFees: IndividualTxFees | null;
};

export type SmartTransactionsControllerState = {
  smartTransactionsState: {
    smartTransactions: Record<Hex, SmartTransaction[]>;
    userOptIn: boolean | null;
    userOptInV2: boolean | null;
    liveness: boolean | null;
    fees: FeeEstimates;
    feesByChainId: Record<Hex, FeeEstimates>;
    livenessByChainId: Record<Hex, boolean>;
  };
};

/**
 * Get the default {@link SmartTransactionsController} state.
 *
 * @returns The default {@link SmartTransactionsController} state.
 */
export function getDefaultSmartTransactionsControllerState(): SmartTransactionsControllerState {
  return {
    smartTransactionsState: {
      smartTransactions: {},
      userOptIn: null,
      userOptInV2: null,
      fees: {
        approvalTxFees: null,
        tradeTxFees: null,
      },
      liveness: true,
      livenessByChainId: {
        [ChainId.mainnet]: true,
        [ChainId.sepolia]: true,
      },
      feesByChainId: {
        [ChainId.mainnet]: {
          approvalTxFees: null,
          tradeTxFees: null,
        },
        [ChainId.sepolia]: {
          approvalTxFees: null,
          tradeTxFees: null,
        },
      },
    },
  };
}

export type SmartTransactionsControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    SmartTransactionsControllerState
  >;

/**
 * The actions that can be performed using the {@link SmartTransactionsController}.
 */
export type SmartTransactionsControllerActions =
  SmartTransactionsControllerGetStateAction;

export type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

export type SmartTransactionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SmartTransactionsControllerState
  >;

export type SmartTransactionsControllerSmartTransactionEvent = {
  type: 'SmartTransactionsController:smartTransaction';
  payload: [SmartTransaction];
};

/**
 * The events that {@link SmartTransactionsController} can emit.
 */
export type SmartTransactionsControllerEvents =
  | SmartTransactionsControllerStateChangeEvent
  | SmartTransactionsControllerSmartTransactionEvent;

export type AllowedEvents = NetworkControllerStateChangeEvent;

/**
 * The messenger of the {@link SmartTransactionsController}.
 */
export type SmartTransactionsControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    SmartTransactionsControllerActions | AllowedActions,
    SmartTransactionsControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

type SmartTransactionsControllerOptions = {
  interval?: number;
  clientId?: string;
  chainId?: Hex;
  supportedChainIds?: Hex[];
  getNonceLock: TransactionController['getNonceLock'];
  confirmExternalTransaction: TransactionController['confirmExternalTransaction'];
  trackMetaMetricsEvent: any;
  state?: Partial<SmartTransactionsControllerState>;
  messenger: SmartTransactionsControllerMessenger;
  getTransactions: (options?: GetTransactionsOptions) => TransactionMeta[];
  getMetaMetricsProps: () => Promise<MetaMetricsProps>;
};

export default class SmartTransactionsController extends StaticIntervalPollingController<
  typeof controllerName,
  SmartTransactionsControllerState,
  SmartTransactionsControllerMessenger
> {
  #interval: number;

  #clientId: string;

  #chainId: Hex;

  #supportedChainIds: Hex[];

  timeoutHandle?: NodeJS.Timeout;

  readonly #getNonceLock: SmartTransactionsControllerOptions['getNonceLock'];

  #ethQuery: EthQuery | undefined;

  #confirmExternalTransaction: SmartTransactionsControllerOptions['confirmExternalTransaction'];

  #getRegularTransactions: (
    options?: GetTransactionsOptions,
  ) => TransactionMeta[];

  readonly #trackMetaMetricsEvent: SmartTransactionsControllerOptions['trackMetaMetricsEvent'];

  readonly #getMetaMetricsProps: () => Promise<MetaMetricsProps>;

  /* istanbul ignore next */
  async #fetch(request: string, options?: RequestInit) {
    const fetchOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.#clientId && { 'X-Client-Id': this.#clientId }),
      },
    };

    return handleFetch(request, fetchOptions);
  }

  constructor({
    interval = DEFAULT_INTERVAL,
    clientId = DEFAULT_CLIENT_ID,
    chainId: InitialChainId = ChainId.mainnet,
    supportedChainIds = [ChainId.mainnet, ChainId.sepolia],
    getNonceLock,
    confirmExternalTransaction,
    trackMetaMetricsEvent,
    state = {},
    messenger,
    getTransactions,
    getMetaMetricsProps,
  }: SmartTransactionsControllerOptions) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      messenger,
      state: {
        ...getDefaultSmartTransactionsControllerState(),
        ...state,
      },
    });
    this.#interval = interval;
    this.#clientId = clientId;
    this.#chainId = InitialChainId;
    this.#supportedChainIds = supportedChainIds;
    this.setIntervalLength(interval);
    this.#getNonceLock = getNonceLock;
    this.#ethQuery = undefined;
    this.#confirmExternalTransaction = confirmExternalTransaction;
    this.#getRegularTransactions = getTransactions;
    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;
    this.#getMetaMetricsProps = getMetaMetricsProps;

    this.initializeSmartTransactionsForChainId();
    this.#ensureUniqueSmartTransactions();

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      ({ selectedNetworkClientId }) => {
        const {
          configuration: { chainId },
          provider,
        } = this.messagingSystem.call(
          'NetworkController:getNetworkClientById',
          selectedNetworkClientId,
        );
        const isNewChainId = chainId !== this.#chainId;
        this.#chainId = chainId;
        this.initializeSmartTransactionsForChainId();
        if (isNewChainId) {
          this.#ensureUniqueSmartTransactions();
        }
        this.checkPoll(this.state);
        this.#ethQuery = new EthQuery(provider);
      },
    );

    this.messagingSystem.subscribe(
      `${controllerName}:stateChange`,
      (currentState) => this.checkPoll(currentState),
    );
  }

  async _executePoll(networkClientId: string): Promise<void> {
    // if this is going to be truly UI driven polling we shouldn't really reach here
    // with a networkClientId that is not supported, but for now I'll add a check in case
    // wondering if we should add some kind of predicate to the polling controller to check whether
    // we should poll or not
    const chainId = this.#getChainId({ networkClientId });
    if (!this.#supportedChainIds.includes(chainId)) {
      return Promise.resolve();
    }
    return this.updateSmartTransactions({ networkClientId });
  }

  checkPoll({
    smartTransactionsState: { smartTransactions },
  }: SmartTransactionsControllerState) {
    const currentSmartTransactions = smartTransactions[this.#chainId];
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
    if (this.#supportedChainIds.includes(this.#chainId)) {
      this.update((state) => {
        state.smartTransactionsState.smartTransactions[this.#chainId] =
          state.smartTransactionsState.smartTransactions[this.#chainId] ?? [];
      });
    }
  }

  // We fixed having duplicate smart transactions with the same uuid in a very rare edge case.
  // This function resolves it for a few users who have this issue and once we see in logs
  // that everything is fine, we can remove this function.
  #ensureUniqueSmartTransactions() {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const chainId = ChainId.mainnet; // Smart Transactions are only available on Ethereum mainnet at the moment.
    const smartTransactionsForChainId = smartTransactions[chainId];
    if (!smartTransactionsForChainId) {
      return;
    }
    const uniqueUUIDs = new Set();
    const uniqueSmartTransactionsForChainId: SmartTransaction[] = [];
    for (const transaction of smartTransactionsForChainId) {
      if (!uniqueUUIDs.has(transaction.uuid)) {
        uniqueUUIDs.add(transaction.uuid);
        uniqueSmartTransactionsForChainId.push(transaction);
      }
    }
    this.update((state) => {
      state.smartTransactionsState.smartTransactions[chainId] =
        uniqueSmartTransactionsForChainId;
    });
  }

  async poll(interval?: number): Promise<void> {
    if (interval) {
      this.#interval = interval;
    }

    this.timeoutHandle && clearInterval(this.timeoutHandle);

    if (!this.#supportedChainIds.includes(this.#chainId)) {
      return;
    }

    this.timeoutHandle = setInterval(() => {
      safelyExecute(async () => this.updateSmartTransactions());
    }, this.#interval);
    await safelyExecute(async () => this.updateSmartTransactions());
  }

  async stop() {
    this.timeoutHandle && clearInterval(this.timeoutHandle);
    this.timeoutHandle = undefined;
  }

  setOptInState(optInState: boolean | null): void {
    this.update((state) => {
      state.smartTransactionsState.userOptInV2 = optInState;
    });
  }

  trackStxStatusChange(
    smartTransaction: SmartTransaction,
    prevSmartTransaction?: SmartTransaction,
  ) {
    let updatedSmartTransaction = cloneDeep(smartTransaction);
    updatedSmartTransaction = {
      ...cloneDeep(prevSmartTransaction),
      ...updatedSmartTransaction,
    };

    if (updatedSmartTransaction.status === prevSmartTransaction?.status) {
      return; // If status hasn't changed, don't track it again.
    }

    this.#trackMetaMetricsEvent({
      event: MetaMetricsEventName.StxStatusUpdated,
      category: MetaMetricsEventCategory.Transactions,
      properties: getSmartTransactionMetricsProperties(updatedSmartTransaction),
      sensitiveProperties: getSmartTransactionMetricsSensitiveProperties(
        updatedSmartTransaction,
      ),
    });
  }

  isNewSmartTransaction(smartTransactionUuid: string): boolean {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions = smartTransactions[this.#chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransactionUuid,
    );
    return currentIndex === -1 || currentIndex === undefined;
  }

  updateSmartTransaction(
    smartTransaction: SmartTransaction,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ) {
    let ethQuery = this.#ethQuery;
    let chainId = this.#chainId;
    if (networkClientId) {
      const { configuration, provider } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      chainId = configuration.chainId;
      ethQuery = new EthQuery(provider);
    }

    this.#createOrUpdateSmartTransaction(smartTransaction, {
      chainId,
      ethQuery,
    });
  }

  #updateSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.#chainId,
    }: {
      chainId: Hex;
    },
  ) {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions = smartTransactions[chainId] ?? [];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );

    if (currentIndex === -1) {
      return; // Smart transaction not found, don't update anything.
    }

    if (!isSafeDynamicKey(chainId)) {
      return;
    }

    this.update((state) => {
      state.smartTransactionsState.smartTransactions[chainId][currentIndex] = {
        ...state.smartTransactionsState.smartTransactions[chainId][
          currentIndex
        ],
        ...smartTransaction,
      };
    });
  }

  async #addMetaMetricsPropsToNewSmartTransaction(
    smartTransaction: SmartTransaction,
  ) {
    const metaMetricsProps = await this.#getMetaMetricsProps();
    smartTransaction.accountHardwareType =
      metaMetricsProps?.accountHardwareType;
    smartTransaction.accountType = metaMetricsProps?.accountType;
    smartTransaction.deviceModel = metaMetricsProps?.deviceModel;
  }

  async #createOrUpdateSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.#chainId,
      ethQuery = this.#ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery | undefined;
    },
  ): Promise<void> {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions = smartTransactions[chainId] ?? [];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );
    const isNewSmartTransaction = this.isNewSmartTransaction(
      smartTransaction.uuid,
    );
    if (this.#ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }

    if (isNewSmartTransaction) {
      await this.#addMetaMetricsPropsToNewSmartTransaction(smartTransaction);
    }

    this.trackStxStatusChange(
      smartTransaction,
      isNewSmartTransaction
        ? undefined
        : currentSmartTransactions[currentIndex],
    );

    if (isNewSmartTransaction) {
      // add smart transaction
      const cancelledNonceIndex = currentSmartTransactions?.findIndex(
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

      this.update((state) => {
        state.smartTransactionsState.smartTransactions[this.#chainId] =
          nextSmartTransactions;
      });
      return;
    }

    // We have to emit this event here, because then a txHash is returned to the TransactionController once it's available
    // and the #doesTransactionNeedConfirmation function will work properly, since it will find the txHash in the regular transactions list.
    this.messagingSystem.publish(
      `SmartTransactionsController:smartTransaction`,
      smartTransaction,
    );

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
      await this.#confirmSmartTransaction(nextSmartTransaction, {
        chainId,
        ethQuery,
      });
    } else {
      this.#updateSmartTransaction(smartTransaction, {
        chainId,
      });
    }
  }

  async updateSmartTransactions({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): Promise<void> {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const chainId = this.#getChainId({ networkClientId });
    const smartTransactionsForChainId = smartTransactions[chainId];

    const transactionsToUpdate: string[] = smartTransactionsForChainId
      .filter(isSmartTransactionPending)
      .map((smartTransaction) => smartTransaction.uuid);

    if (transactionsToUpdate.length > 0) {
      this.fetchSmartTransactionsStatus(transactionsToUpdate, {
        networkClientId,
      });
    }
  }

  #doesTransactionNeedConfirmation(txHash: string | undefined): boolean {
    if (!txHash) {
      return true;
    }
    const transactions = this.#getRegularTransactions();
    const foundTransaction = transactions?.find((tx) => {
      return tx.hash?.toLowerCase() === txHash.toLowerCase();
    });
    if (!foundTransaction) {
      return true;
    }
    // If a found transaction is either confirmed or submitted, it doesn't need confirmation from the STX controller.
    // When it's in the submitted state, the TransactionController checks its status and confirms it,
    // so no need to confirm it again here.
    return ![TransactionStatus.confirmed, TransactionStatus.submitted].includes(
      foundTransaction.status,
    );
  }

  async #confirmSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.#chainId,
      ethQuery = this.#ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery | undefined;
    },
  ) {
    if (ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }
    const txHash = smartTransaction.statusMetadata?.minedHash;
    try {
      const transactionReceipt: {
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        blockNumber: string;
      } | null = await query(ethQuery, 'getTransactionReceipt', [txHash]);
      const transaction: {
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      } | null = await query(ethQuery, 'getTransactionByHash', [txHash]);

      const maxFeePerGas = transaction?.maxFeePerGas;
      const maxPriorityFeePerGas = transaction?.maxPriorityFeePerGas;
      if (transactionReceipt?.blockNumber) {
        const blockData: { baseFeePerGas?: Hex } | null = await query(
          ethQuery,
          'getBlockByNumber',
          [transactionReceipt?.blockNumber, false],
        );
        const baseFeePerGas = blockData?.baseFeePerGas;
        const updatedTxParams = {
          ...smartTransaction.txParams,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };
        // call confirmExternalTransaction
        const originalTxMeta = {
          ...smartTransaction,
          id: smartTransaction.uuid,
          status: TransactionStatus.confirmed,
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

        if (this.#doesTransactionNeedConfirmation(txHash)) {
          this.#confirmExternalTransaction(
            // TODO: Replace 'as' assertion with correct typing for `txMeta`
            txMeta as TransactionMeta,
            transactionReceipt,
            // TODO: Replace 'as' assertion with correct typing for `baseFeePerGas`
            baseFeePerGas as Hex,
          );
        }
        this.#trackMetaMetricsEvent({
          event: MetaMetricsEventName.StxConfirmed,
          category: MetaMetricsEventCategory.Transactions,
          properties: getSmartTransactionMetricsProperties(smartTransaction),
          sensitiveProperties:
            getSmartTransactionMetricsSensitiveProperties(smartTransaction),
        });
        this.#updateSmartTransaction(
          { ...smartTransaction, confirmed: true },
          {
            chainId,
          },
        );
      }
    } catch (error) {
      this.#trackMetaMetricsEvent({
        event: MetaMetricsEventName.StxConfirmationFailed,
        category: MetaMetricsEventCategory.Transactions,
      });
      console.error('confirm error', error);
    }
  }

  // ! Ask backend API to accept list of uuids as params
  async fetchSmartTransactionsStatus(
    uuids: string[],
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ): Promise<Record<string, SmartTransactionsStatus>> {
    const params = new URLSearchParams({
      uuids: uuids.join(','),
    });
    const chainId = this.#getChainId({ networkClientId });
    const ethQuery = this.#getEthQuery({ networkClientId });
    const url = `${getAPIRequestURL(
      APIType.BATCH_STATUS,
      chainId,
    )}?${params.toString()}`;

    const data = (await this.#fetch(url)) as Record<
      string,
      SmartTransactionsStatus
    >;

    for (const [uuid, stxStatus] of Object.entries(data)) {
      const smartTransaction: SmartTransaction = {
        statusMetadata: stxStatus,
        status: calculateStatus(stxStatus),
        cancellable: isSmartTransactionCancellable(stxStatus),
        uuid,
      };
      await this.#createOrUpdateSmartTransaction(smartTransaction, {
        chainId,
        ethQuery,
      });
    }

    return data;
  }

  async addNonceToTransaction(
    transaction: UnsignedTransaction,
  ): Promise<UnsignedTransaction> {
    const nonceLock = await this.#getNonceLock(transaction.from);
    const nonce = nonceLock.nextNonce;
    nonceLock.releaseLock();
    return {
      ...transaction,
      nonce: `0x${nonce.toString(16)}`,
    };
  }

  clearFees(): Fees {
    const fees = {
      approvalTxFees: null,
      tradeTxFees: null,
    };
    this.update((state) => {
      state.smartTransactionsState.fees = fees;
    });

    return fees;
  }

  async getFees(
    tradeTx: UnsignedTransaction,
    approvalTx?: UnsignedTransaction,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ): Promise<Fees> {
    const chainId = this.#getChainId({ networkClientId });
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
    } else if (tradeTx.nonce) {
      unsignedTradeTransactionWithNonce = tradeTx;
    } else {
      unsignedTradeTransactionWithNonce = await this.addNonceToTransaction(
        tradeTx,
      );
    }
    transactions.push(unsignedTradeTransactionWithNonce);
    const data = await this.#fetch(
      getAPIRequestURL(APIType.GET_FEES, chainId),
      {
        method: 'POST',
        body: JSON.stringify({
          txs: transactions,
        }),
      },
    );
    let approvalTxFees: IndividualTxFees | null;
    let tradeTxFees: IndividualTxFees | null;
    if (approvalTx) {
      approvalTxFees = data?.txs[0];
      tradeTxFees = data?.txs[1];
    } else {
      approvalTxFees = null;
      tradeTxFees = data?.txs[0];
    }

    this.update((state) => {
      if (chainId === this.#chainId) {
        state.smartTransactionsState.fees = {
          approvalTxFees,
          tradeTxFees,
        };
      }
      state.smartTransactionsState.feesByChainId[chainId] = {
        approvalTxFees,
        tradeTxFees,
      };
    });

    return {
      approvalTxFees,
      tradeTxFees,
    };
  }

  // * After this successful call client must add a nonce representative to
  // * transaction controller external transactions list
  async submitSignedTransactions({
    transactionMeta,
    txParams,
    signedTransactions,
    signedCanceledTransactions,
    networkClientId,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions: SignedCanceledTransaction[];
    transactionMeta?: TransactionMeta;
    txParams?: TransactionParams;
    networkClientId?: NetworkClientId;
  }) {
    const chainId = this.#getChainId({ networkClientId });
    const ethQuery = this.#getEthQuery({ networkClientId });
    const data = await this.#fetch(
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
      const preTxBalanceBN = await query(ethQuery, 'getBalance', [
        txParams?.from,
      ]);
      preTxBalance = new BigNumber(preTxBalanceBN).toString(16);
    } catch (error) {
      console.error('provider error', error);
    }

    const requiresNonce = txParams && !txParams.nonce;
    let nonce;
    let nonceLock;
    let nonceDetails = {};

    if (requiresNonce) {
      nonceLock = await this.#getNonceLock(txParams.from);
      nonce = hexlify(nonceLock.nextNonce);
      nonceDetails = nonceLock.nonceDetails;
      txParams.nonce ??= nonce;
    }
    const submitTransactionResponse = {
      ...data,
      txHash: getTxHash(signedTransactions[0]),
    };

    try {
      await this.#createOrUpdateSmartTransaction(
        {
          chainId,
          nonceDetails,
          preTxBalance,
          status: SmartTransactionStatuses.PENDING,
          time,
          txParams,
          uuid: submitTransactionResponse.uuid,
          txHash: submitTransactionResponse.txHash,
          cancellable: true,
          type: transactionMeta?.type ?? 'swap',
        },
        { chainId, ethQuery },
      );
    } finally {
      nonceLock?.releaseLock();
    }

    return submitTransactionResponse;
  }

  #getChainId({
    networkClientId,
  }: { networkClientId?: NetworkClientId } = {}): Hex {
    if (networkClientId) {
      return this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      ).configuration.chainId;
    }

    return this.#chainId;
  }

  #getEthQuery({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): EthQuery {
    if (networkClientId) {
      const { provider } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      return new EthQuery(provider);
    }

    if (this.#ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }

    return this.#ethQuery;
  }

  // TODO: This should return if the cancellation was on chain or not (for nonce management)
  // After this successful call client must update nonce representative
  // in transaction controller external transactions list
  async cancelSmartTransaction(
    uuid: string,
    {
      networkClientId,
    }: {
      networkClientId?: NetworkClientId;
    } = {},
  ): Promise<void> {
    const chainId = this.#getChainId({ networkClientId });
    await this.#fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
      method: 'POST',
      body: JSON.stringify({ uuid }),
    });
  }

  async fetchLiveness({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): Promise<boolean> {
    const chainId = this.#getChainId({ networkClientId });
    let liveness = false;
    try {
      const response = await this.#fetch(
        getAPIRequestURL(APIType.LIVENESS, chainId),
      );
      liveness = Boolean(response.lastBlock);
    } catch (error) {
      console.log('"fetchLiveness" API call failed');
    }

    this.update((state) => {
      if (chainId === this.#chainId) {
        state.smartTransactionsState.liveness = liveness;
      }
      state.smartTransactionsState.livenessByChainId[chainId] = liveness;
    });

    return liveness;
  }

  async setStatusRefreshInterval(interval: number): Promise<void> {
    if (interval !== this.#interval) {
      this.#interval = interval;
    }
  }

  #getCurrentSmartTransactions(): SmartTransaction[] {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions = smartTransactions?.[this.#chainId];
    if (!currentSmartTransactions || currentSmartTransactions.length === 0) {
      return [];
    }
    return currentSmartTransactions;
  }

  getTransactions({
    addressFrom,
    status,
  }: {
    addressFrom: string;
    status: SmartTransactionStatuses;
  }): SmartTransaction[] {
    const currentSmartTransactions = this.#getCurrentSmartTransactions();
    return currentSmartTransactions.filter((stx) => {
      return stx.status === status && stx.txParams?.from === addressFrom;
    });
  }

  getSmartTransactionByMinedTxHash(
    txHash: string | undefined,
  ): SmartTransaction | undefined {
    if (!txHash) {
      return undefined;
    }
    const currentSmartTransactions = this.#getCurrentSmartTransactions();
    return currentSmartTransactions.find((smartTransaction) => {
      return (
        smartTransaction.statusMetadata?.minedHash?.toLowerCase() ===
        txHash.toLowerCase()
      );
    });
  }

  wipeSmartTransactions({
    address,
    ignoreNetwork,
  }: {
    address: string;
    ignoreNetwork?: boolean;
  }): void {
    if (!address) {
      return;
    }
    const addressLowerCase = address.toLowerCase();
    if (ignoreNetwork) {
      const {
        smartTransactionsState: { smartTransactions },
      } = this.state;
      (Object.keys(smartTransactions) as Hex[]).forEach((chainId) => {
        this.#wipeSmartTransactionsPerChainId({
          chainId,
          addressLowerCase,
        });
      });
    } else {
      this.#wipeSmartTransactionsPerChainId({
        chainId: this.#chainId,
        addressLowerCase,
      });
    }
  }

  #wipeSmartTransactionsPerChainId({
    chainId,
    addressLowerCase,
  }: {
    chainId: Hex;
    addressLowerCase: string;
  }): void {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const smartTransactionsForSelectedChain: SmartTransaction[] =
      smartTransactions?.[chainId];
    if (
      !smartTransactionsForSelectedChain ||
      smartTransactionsForSelectedChain.length === 0
    ) {
      return;
    }
    const newSmartTransactionsForSelectedChain =
      smartTransactionsForSelectedChain.filter(
        (smartTransaction: SmartTransaction) =>
          smartTransaction.txParams?.from !== addressLowerCase,
      );
    this.update((state) => {
      state.smartTransactionsState.smartTransactions[chainId] =
        newSmartTransactionsForSelectedChain;
    });
  }
}
