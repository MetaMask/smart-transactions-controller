/// <reference types="node" />
import { BaseConfig, BaseController, BaseState, NetworkState } from '@metamask/controllers';
import { SmartTransaction, SignedTransaction, SignedCanceledTransaction, UnsignedTransaction, SmartTransactionStatuses, Fees, EstimatedGas } from './types';
export declare const DEFAULT_INTERVAL: number;
export declare const CANCELLABLE_INTERVAL: number;
export interface SmartTransactionsControllerConfig extends BaseConfig {
    interval: number;
    clientId: string;
    chainId: string;
    supportedChainIds: string[];
}
export interface SmartTransactionsControllerState extends BaseState {
    smartTransactionsState: {
        smartTransactions: Record<string, SmartTransaction[]>;
        userOptIn: boolean | undefined;
        liveness: boolean | undefined;
        fees: Fees | undefined;
        estimatedGas: {
            txData: EstimatedGas | undefined;
            approvalTxData: EstimatedGas | undefined;
        };
    };
}
export default class SmartTransactionsController extends BaseController<SmartTransactionsControllerConfig, SmartTransactionsControllerState> {
    timeoutHandle?: NodeJS.Timeout;
    private getNonceLock;
    private getNetwork;
    ethersProvider: any;
    txController: any;
    private trackMetaMetricsEvent;
    private fetch;
    constructor({ onNetworkStateChange, getNonceLock, getNetwork, provider, txController, trackMetaMetricsEvent, }: {
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        getNonceLock: any;
        getNetwork: any;
        provider: any;
        txController: any;
        trackMetaMetricsEvent: any;
    }, config?: Partial<SmartTransactionsControllerConfig>, state?: Partial<SmartTransactionsControllerState>);
    checkPoll(state: any): void;
    initializeSmartTransactionsForChainId(): void;
    poll(interval?: number): Promise<void>;
    stop(): Promise<void>;
    setOptInState(state: boolean | undefined): void;
    trackStxStatusChange(smartTransaction: SmartTransaction, prevSmartTransaction?: SmartTransaction): void;
    isNewSmartTransaction(smartTransactionUuid: string): boolean;
    updateSmartTransaction(smartTransaction: SmartTransaction): void;
    updateSmartTransactions(): Promise<void>;
    confirmSmartTransaction(smartTransaction: SmartTransaction): Promise<void>;
    fetchSmartTransactionsStatus(uuids: string[]): Promise<SmartTransaction[]>;
    addNonceToTransaction(transaction: UnsignedTransaction): Promise<UnsignedTransaction>;
    getFees(unsignedTransaction: UnsignedTransaction): Promise<Fees>;
    estimateGas(unsignedTransaction: UnsignedTransaction, approveTxParams: UnsignedTransaction): Promise<EstimatedGas>;
    submitSignedTransactions({ txParams, signedTransactions, signedCanceledTransactions, }: {
        signedTransactions: SignedTransaction[];
        signedCanceledTransactions: SignedCanceledTransaction[];
        txParams?: any;
    }): Promise<any>;
    cancelSmartTransaction(uuid: string): Promise<void>;
    fetchLiveness(): Promise<boolean>;
    setStatusRefreshInterval(interval: number): Promise<void>;
    getTransactions({ addressFrom, status, }: {
        addressFrom: string;
        status: SmartTransactionStatuses;
    }): SmartTransaction[];
}
