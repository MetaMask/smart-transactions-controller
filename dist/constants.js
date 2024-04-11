"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaMetricsEventCategory = exports.MetaMetricsEventName = exports.CHAIN_IDS = exports.API_BASE_URL = void 0;
exports.API_BASE_URL = 'https://transaction.metaswap.codefi.network';
exports.CHAIN_IDS = {
    ETHEREUM: '0x1',
    GOERLI: '0x5',
    RINKEBY: '0x4',
    BSC: '0x38',
};
var MetaMetricsEventName;
(function (MetaMetricsEventName) {
    MetaMetricsEventName["StxStatusUpdated"] = "STX Status Updated";
    MetaMetricsEventName["StxConfirmed"] = "STX Confirmed";
    MetaMetricsEventName["StxConfirmationFailed"] = "STX Confirmation Failed";
})(MetaMetricsEventName = exports.MetaMetricsEventName || (exports.MetaMetricsEventName = {}));
var MetaMetricsEventCategory;
(function (MetaMetricsEventCategory) {
    MetaMetricsEventCategory["Transactions"] = "Transactions";
})(MetaMetricsEventCategory = exports.MetaMetricsEventCategory || (exports.MetaMetricsEventCategory = {}));
//# sourceMappingURL=constants.js.map