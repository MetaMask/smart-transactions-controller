export declare const API_BASE_URL = "https://transaction.metaswap.codefi.network";
export declare const CHAIN_IDS: {
    readonly ETHEREUM: "0x1";
    readonly GOERLI: "0x5";
    readonly RINKEBY: "0x4";
    readonly BSC: "0x38";
};
export declare enum MetaMetricsEventName {
    StxStatusUpdated = "STX Status Updated",
    StxConfirmed = "STX Confirmed",
    StxConfirmationFailed = "STX Confirmation Failed"
}
export declare enum MetaMetricsEventCategory {
    Transactions = "Transactions"
}
