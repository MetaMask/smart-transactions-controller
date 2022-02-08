import { APIType, SmartTransaction, SmartTransactionsStatus, SmartTransactionStatuses } from './types';
export declare function isSmartTransactionPending(smartTransaction: SmartTransaction): boolean;
export declare const isSmartTransactionStatusResolved: (status: SmartTransactionsStatus | string) => boolean;
export declare function getAPIRequestURL(apiType: APIType, chainId: string): string;
export declare const calculateStatus: (status: SmartTransactionsStatus) => SmartTransactionStatuses;
/**
  Generates an array of history objects sense the previous state.
  The object has the keys
    op (the operation performed),
    path (the key and if a nested object then each key will be separated with a `/`)
    value
  with the first entry having the note and a timestamp when the change took place
  @param {Object} previousState - the previous state of the object
  @param {Object} newState - the update object
  @param {string} [note] - a optional note for the state change
  @returns {Array}
*/
export declare function generateHistoryEntry(previousState: any, newState: any, note: string): any;
/**
  Recovers previous txMeta state obj
  @returns {Object}
*/
export declare function replayHistory(_shortHistory: any): any;
/**
 * Snapshot {@code txMeta}
 * @param {Object} txMeta - the tx metadata object
 * @returns {Object} a deep clone without history
 */
export declare function snapshotFromTxMeta(txMeta: any): any;
/**
 * Returns processing time for an STX in seconds.
 * @param {number} smartTransactionSubmittedtime
 * @returns {number} Processing time in seconds.
 */
export declare const getStxProcessingTime: (smartTransactionSubmittedtime: number | undefined) => number | undefined;
export declare function handleFetch(request: string, options?: RequestInit): Promise<any>;
