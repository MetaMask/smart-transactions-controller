export const API_BASE_URL = 'https://transaction.api.cx.metamask.io';
export const CHAIN_IDS = {
  ETHEREUM: '0x1',
  SEPOLIA: '0xaa36a7',
  RINKEBY: '0x4',
  BSC: '0x38',
} as const;

export enum MetaMetricsEventName {
  StxStatusUpdated = 'STX Status Updated',
  StxConfirmed = 'STX Confirmed',
  StxConfirmationFailed = 'STX Confirmation Failed',
}

export enum MetaMetricsEventCategory {
  Transactions = 'Transactions',
}

export enum NetworkClientId {
  Mainnet = 'mainnet',
  Sepolia = 'sepolia',
}
