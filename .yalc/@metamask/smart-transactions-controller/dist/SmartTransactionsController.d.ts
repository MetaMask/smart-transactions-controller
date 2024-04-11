/// <reference types="node" />
import { BaseConfig, BaseState } from '@metamask/base-controller';
import { NetworkState, NetworkController, NetworkClientId } from '@metamask/network-controller';
import { Provider } from '@metamask/eth-query';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import { SmartTransaction, SignedTransaction, SignedCanceledTransaction, UnsignedTransaction, SmartTransactionsStatus, SmartTransactionStatuses, Fees, IndividualTxFees, Hex } from './types';
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
    timeoutHandle?: NodeJS.Timeout;
    private getNonceLock;
    private ethQuery;
    confirmExternalTransaction: any;
    private trackMetaMetricsEvent;
    private eventEmitter;
    private getNetworkClientById;
    private fetch;
    constructor({ onNetworkStateChange, getNonceLock, provider, confirmExternalTransaction, trackMetaMetricsEvent, getNetworkClientById, }: {
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        getNonceLock: any;
        provider: Provider;
        confirmExternalTransaction: any;
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
    submitSignedTransactions({ txParams, signedTransactions, signedCanceledTransactions, networkClientId, skipConfirm, }: {
        signedTransactions: SignedTransaction[];
        signedCanceledTransactions: SignedCanceledTransaction[];
        txParams?: any;
        networkClientId?: NetworkClientId;
        skipConfirm?: boolean;
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
