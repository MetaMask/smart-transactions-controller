/// <reference types="node" />
/// <reference types="node" />
import type { BaseConfig, BaseState } from '@metamask/base-controller';
import type { Provider } from '@metamask/eth-query';
import type { NetworkClientId, NetworkController, NetworkState } from '@metamask/network-controller';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import EventEmitter from 'events';
import type { Fees, Hex, IndividualTxFees, SignedCanceledTransaction, SignedTransaction, SmartTransaction, SmartTransactionsStatus, UnsignedTransaction, GetTransactionsOptions } from './types';
import { SmartTransactionStatuses } from './types';
export declare const DEFAULT_INTERVAL: number;
export declare type SmartTransactionsControllerConfig = BaseConfig & {
    interval: number;
    clientId: string;
    chainId: Hex;
    supportedChainIds: string[];
};
declare type FeeEstimates = {
    approvalTxFees: IndividualTxFees | undefined;
    tradeTxFees: IndividualTxFees | undefined;
};
export declare type SmartTransactionsControllerState = BaseState & {
    smartTransactionsState: {
        smartTransactions: Record<Hex, SmartTransaction[]>;
        userOptIn: boolean | undefined;
        userOptInV2: boolean | undefined;
        liveness: boolean | undefined;
        fees: FeeEstimates;
        feesByChainId: Record<Hex, FeeEstimates>;
        livenessByChainId: Record<Hex, boolean>;
    };
};
export default class SmartTransactionsController extends StaticIntervalPollingControllerV1<SmartTransactionsControllerConfig, SmartTransactionsControllerState> {
    #private;
    /**
     * Name of this controller used during composition
     */
    name: string;
    timeoutHandle?: NodeJS.Timeout;
    private readonly getNonceLock;
    private ethQuery;
    confirmExternalTransaction: any;
    getRegularTransactions: (options?: GetTransactionsOptions) => TransactionMeta[];
    private readonly trackMetaMetricsEvent;
    eventEmitter: EventEmitter;
    private readonly getNetworkClientById;
    private fetch;
    constructor({ onNetworkStateChange, getNonceLock, provider, confirmExternalTransaction, getTransactions, trackMetaMetricsEvent, getNetworkClientById, }: {
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        getNonceLock: any;
        provider: Provider;
        confirmExternalTransaction: any;
        getTransactions: (options?: GetTransactionsOptions) => TransactionMeta[];
        trackMetaMetricsEvent: any;
        getNetworkClientById: NetworkController['getNetworkClientById'];
    }, config?: Partial<SmartTransactionsControllerConfig>, state?: Partial<SmartTransactionsControllerState>);
    _executePoll(networkClientId: string): Promise<void>;
    checkPoll(state: any): void;
    initializeSmartTransactionsForChainId(): void;
    poll(interval?: number): Promise<void>;
    stop(): Promise<void>;
    setOptInState(state: boolean | undefined): void;
    trackStxStatusChange(smartTransaction: SmartTransaction, prevSmartTransaction?: SmartTransaction): void;
    isNewSmartTransaction(smartTransactionUuid: string): boolean;
    updateSmartTransaction(smartTransaction: SmartTransaction, { networkClientId }?: {
        networkClientId?: NetworkClientId;
    }): void;
    updateSmartTransactions({ networkClientId, }?: {
        networkClientId?: NetworkClientId;
    }): Promise<void>;
    fetchSmartTransactionsStatus(uuids: string[], { networkClientId }?: {
        networkClientId?: NetworkClientId;
    }): Promise<Record<string, SmartTransactionsStatus>>;
    addNonceToTransaction(transaction: UnsignedTransaction): Promise<UnsignedTransaction>;
    clearFees(): Fees;
    getFees(tradeTx: UnsignedTransaction, approvalTx?: UnsignedTransaction, { networkClientId }?: {
        networkClientId?: NetworkClientId;
    }): Promise<Fees>;
    submitSignedTransactions({ transactionMeta, transaction, signedTransactions, signedCanceledTransactions, networkClientId, }: {
        signedTransactions: SignedTransaction[];
        signedCanceledTransactions: SignedCanceledTransaction[];
        transactionMeta?: any;
        transaction?: any;
        networkClientId?: NetworkClientId;
    }): Promise<any>;
    cancelSmartTransaction(uuid: string, { networkClientId, }?: {
        networkClientId?: NetworkClientId;
    }): Promise<void>;
    fetchLiveness({ networkClientId, }?: {
        networkClientId?: NetworkClientId;
    }): Promise<boolean>;
    setStatusRefreshInterval(interval: number): Promise<void>;
    getTransactions({ addressFrom, status, }: {
        addressFrom: string;
        status: SmartTransactionStatuses;
    }): SmartTransaction[];
}
export {};
