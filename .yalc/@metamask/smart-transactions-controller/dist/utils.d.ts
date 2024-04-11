import { APIType, SmartTransaction, SmartTransactionsStatus, SmartTransactionStatuses } from './types';
export declare function isSmartTransactionPending(smartTransaction: SmartTransaction): boolean;
export declare const isSmartTransactionStatusResolved: (stxStatus: SmartTransactionsStatus | string) => boolean;
export declare function getAPIRequestURL(apiType: APIType, chainId: string): string;
export declare const calculateStatus: (stxStatus: SmartTransactionsStatus) => SmartTransactionStatuses;
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
export declare function generateHistoryEntry(previousState: any, newState: any, note: string): any;
/**
  Recovers previous txMeta state obj
  @returns
*/
export declare function replayHistory(_shortHistory: any): any;
/**
 * Snapshot {@code txMeta}
 * @param txMeta - the tx metadata object
 * @returns a deep clone without history
 */
export declare function snapshotFromTxMeta(txMeta: any): any;
/**
 * Returns processing time for an STX in seconds.
 * @param smartTransactionSubmittedtime
 * @returns Processing time in seconds.
 */
export declare const getStxProcessingTime: (smartTransactionSubmittedtime: number | undefined) => number | undefined;
export declare const mapKeysToCamel: (obj: Record<string, any>) => Record<string, any>;
export declare function handleFetch(request: string, options?: RequestInit): Promise<any>;
export declare const isSmartTransactionCancellable: (stxStatus: SmartTransactionsStatus) => boolean;
export declare const incrementNonceInHex: (nonceInHex: string) => string;
