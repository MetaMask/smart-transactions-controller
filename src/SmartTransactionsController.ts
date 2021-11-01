import {
  BaseConfig,
  BaseController,
  BaseState,
  NetworkState,
  util,
} from '@metamask/controllers';
import { BigNumber } from 'bignumber.js';
import { ethers } from 'ethers';
import mapValues from 'lodash/mapValues';
import cloneDeep from 'lodash/cloneDeep';
import {
  APIType,
  SmartTransaction,
  SignedTransaction,
  SignedCanceledTransaction,
  UnsignedTransaction,
  SmartTransactionsStatus,
  SmartTransactionCancellationReason,
} from './types';
import {
  getAPIRequestURL,
  isSmartTransactionPending,
  isSmartTransactionStatusResolved,
} from './utils';
import { CHAIN_IDS } from './constants';

const { handleFetch, safelyExecute } = util;

const calculateStatus = (status: SmartTransactionsStatus) => {
  const cancellations = [
    SmartTransactionCancellationReason.WOULD_REVERT,
    SmartTransactionCancellationReason.TOO_CHEAP,
    SmartTransactionCancellationReason.DEADLINE_MISSED,
    SmartTransactionCancellationReason.INVALID_NONCE,
    SmartTransactionCancellationReason.USER_CANCELLED,
  ];
  if (status?.minedTx === 'not_mined') {
    if (
      status.cancellationReason ===
      SmartTransactionCancellationReason.NOT_CANCELLED
    ) {
      return 'pending';
    }

    const isCancellation =
      cancellations.findIndex(
        (cancellation) => cancellation === status.cancellationReason,
      ) > -1;
    if (isCancellation) {
      return `cancelled_${status.cancellationReason}`;
    }
  } else if (status?.minedTx === 'success') {
    return 'success';
  } else if (status?.minedTx === 'reverted') {
    return 'reverted';
  } else if (status?.minedTx === 'unknown') {
    return 'unknown';
  }
  return '';
};

// TODO: JSDoc all methods
// TODO: Remove all comments (* ! ?)

export const DEFAULT_INTERVAL = 10 * 1000;

export interface SmartTransactionsControllerConfig extends BaseConfig {
  interval: number;
  clientId: string;
  chainId: string;
  supportedChainIds: string[];
}

export interface SmartTransactionsControllerState extends BaseState {
  smartTransactions: Record<string, SmartTransaction[]>;
  userOptIn: boolean | undefined;
}

export default class SmartTransactionsController extends BaseController<
  SmartTransactionsControllerConfig,
  SmartTransactionsControllerState
> {
  private timeoutHandle?: NodeJS.Timeout;

  private nonceTracker: any;

  private getNetwork: any;

  private ethersProvider: any;

  private txController: any;

  private updateSmartTransaction(smartTransaction: SmartTransaction): void {
    const { chainId } = this.config;
    const currentIndex = this.state.smartTransactions[chainId]?.findIndex(
      (st) => st.uuid === smartTransaction.uuid,
    );
    if (currentIndex === -1 || currentIndex === undefined) {
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [chainId]: [
            ...this.state.smartTransactions?.[chainId],
            smartTransaction,
          ],
        },
      });
    } else {
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [chainId]: this.state.smartTransactions[chainId].map(
            (item, index) => {
              return index === currentIndex
                ? { ...item, ...smartTransaction }
                : item;
            },
          ),
        },
      });
    }
  }

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
      nonceTracker,
      getNetwork,
      provider,
      txController,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      nonceTracker: any;
      getNetwork: any;
      provider: any;
      txController: any;
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
      smartTransactions: {},
      userOptIn: undefined,
    };

    this.nonceTracker = nonceTracker;
    this.getNetwork = getNetwork;
    this.ethersProvider = new ethers.providers.Web3Provider(provider);
    this.txController = txController;

    this.initialize();
    this.initializeSmartTransactionsForChainId();

    onNetworkStateChange(({ provider: newProvider }) => {
      const { chainId } = newProvider;
      this.configure({ chainId });
      this.initializeSmartTransactionsForChainId();
      this.poll();
      this.ethersProvider = new ethers.providers.Web3Provider(provider);
    });

    this.poll();
  }

  initializeSmartTransactionsForChainId() {
    if (this.config.supportedChainIds.includes(this.config.chainId)) {
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [this.config.chainId]:
            this.state.smartTransactions[this.config.chainId] ?? [],
        },
      });
    }
  }

  async poll(interval?: number): Promise<void> {
    const { chainId, supportedChainIds } = this.config;
    interval && this.configure({ interval }, false, false);
    this.timeoutHandle && clearTimeout(this.timeoutHandle);
    if (!supportedChainIds.includes(chainId)) {
      return;
    }
    await safelyExecute(() => this.updateSmartTransactions());
    this.timeoutHandle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  async stop() {
    this.timeoutHandle && clearTimeout(this.timeoutHandle);
  }

  setOptInState(state: boolean | undefined): void {
    this.update({ userOptIn: state });
  }

  async updateSmartTransactions() {
    const { smartTransactions } = this.state;
    const { chainId } = this.config;

    const smartTransactionsWStatus: any[] = smartTransactions[chainId]?.map(
      (smartTransaction) => ({
        ...smartTransaction,
        state: smartTransaction.status
          ? calculateStatus(smartTransaction.status)
          : undefined,
      }),
    );

    const successfulSTX = smartTransactionsWStatus.filter(
      (stx) =>
        (stx.state === 'success' || stx.state === 'reverted') && !stx.confirmed,
    );

    if (successfulSTX.length > 0) {
      await Promise.all(
        successfulSTX.map((stx) => this.confirmSmartTransaction(stx)),
      );
    }

    const transactionsToUpdate: string[] = smartTransactionsWStatus
      .filter((smartTransaction) => isSmartTransactionPending(smartTransaction))
      .map((smartTransaction) => smartTransaction.uuid);

    if (transactionsToUpdate.length > 0) {
      this.fetchSmartTransactionsStatus(transactionsToUpdate);
    } else {
      this.stop();
    }
  }

  async confirmSmartTransaction(smartTransaction: SmartTransaction) {
    const txHash = smartTransaction.status?.minedHash;
    try {
      const transactionReceipt = await this.ethersProvider.getTransactionReceipt(
        txHash,
      );
      if (transactionReceipt?.blockNumber) {
        const blockData = await this.ethersProvider.getBlock(
          transactionReceipt?.blockNumber,
          false,
        );
        const baseFeePerGas = blockData?.baseFeePerGas.toHexString();
        const txReceipt = mapValues(transactionReceipt, (value) => {
          if (value instanceof ethers.BigNumber) {
            return value.toHexString();
          }
          return value;
        });
        // call confirmExternalTransaction
        const originalTxMeta = {
          ...smartTransaction,
          id: smartTransaction.uuid,
          status: 'confirmed',
          hash: txHash,
        };
        const snapshot = cloneDeep(originalTxMeta);
        const history = [snapshot];
        const txMeta = { ...originalTxMeta, history };
        this.txController.confirmExternalTransaction(
          txMeta,
          txReceipt,
          baseFeePerGas,
        );

        this.updateSmartTransaction({
          ...smartTransaction,
          confirmed: true,
        });
      }
    } catch (e) {
      console.error('confirm error', e);
    }
  }

  removeSmartTransaction(uuid: string) {
    const { chainId } = this.config;
    const currentSmartTransactions = this.state.smartTransactions[chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (st) => st.uuid === uuid,
    );
    const smartTransaction = currentSmartTransactions?.[currentIndex];
    const status: string | undefined = smartTransaction?.status
      ? calculateStatus(smartTransaction.status)
      : undefined;
    if (status === 'success' || status === 'reverted') {
      // if confirmed (success or reverted), save it to transactions controller
      this.confirmSmartTransaction(smartTransaction);
    }
    // always remove it
    const nextSmartTransactions = currentSmartTransactions
      .slice(0, currentIndex)
      .concat(currentSmartTransactions.slice(currentIndex + 1));
    this.update({
      smartTransactions: {
        ...this.state.smartTransactions,
        [chainId]: nextSmartTransactions,
      },
    });
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

    Object.entries(data).forEach(([uuid, smartTransaction]) => {
      if (
        isSmartTransactionStatusResolved(
          smartTransaction as SmartTransactionsStatus | string,
        )
      ) {
        this.removeSmartTransaction(uuid);
      } else {
        this.updateSmartTransaction({
          status: smartTransaction as SmartTransactionsStatus,
          uuid,
        });
      }
    });

    return data;
  }

  async addNonceToTransaction(
    transaction: UnsignedTransaction,
  ): Promise<UnsignedTransaction> {
    const nonceLock = await this.nonceTracker.getNonceLock(transaction.from);
    const nonce = nonceLock.nextNonce;
    nonceLock.releaseLock();
    return {
      ...transaction,
      nonce,
    };
  }

  async getUnsignedTransactionsAndEstimates(
    unsignedTransaction: UnsignedTransaction,
  ): Promise<{
    transactions: UnsignedTransaction[];
    cancelTransactions: UnsignedTransaction[];
    estimates: {
      maxFee: number; // GWEI number
      estimatedFee: number; // GWEI number
    };
  }> {
    const { chainId } = this.config;

    const unsignedTransactionWithNonce = await this.addNonceToTransaction(
      unsignedTransaction,
    );
    const data = await this.fetch(
      getAPIRequestURL(APIType.GET_TRANSACTIONS, chainId),
      {
        method: 'POST',
        body: JSON.stringify({ tx: unsignedTransactionWithNonce }),
      },
    );

    return data;
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
    const metamaskNetworkId = this.getNetwork();
    const preTxBalanceBN = await this.ethersProvider.getBalance(txParams?.from);
    const preTxBalance = new BigNumber(preTxBalanceBN.toHexString()).toString(
      16,
    );
    const nonceLock = await this.nonceTracker.getNonceLock(txParams?.from);
    const nonce = ethers.utils.hexlify(nonceLock.nextNonce);
    if (!txParams?.nonce) {
      txParams.nonce = nonce;
    }
    const { nonceDetails } = nonceLock;

    this.updateSmartTransaction({
      chainId,
      nonceDetails,
      metamaskNetworkId,
      preTxBalance,
      time,
      txParams,
      uuid: data.uuid,
    });
    nonceLock.releaseLock();
    // poll transactions until it is resolved somehow
    this.poll();
    return data;
  }

  // ! This should return if the cancellation was on chain or not (for nonce management)
  // * After this successful call client must update nonce representative
  // * in transaction controller external transactions list
  // ! Ask backend API to make this endpoint a POST
  async cancelSmartTransaction(uuid: string): Promise<void> {
    const { chainId } = this.config;
    await this.fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
      method: 'POST',
      body: JSON.stringify({ uuid }),
    });
  }

  async fetchLiveness(): Promise<boolean> {
    const { chainId } = this.config;
    const response = await this.fetch(
      getAPIRequestURL(APIType.LIVENESS, chainId),
    );
    return Boolean(response.lastBlock);
  }
}
