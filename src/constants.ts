import { CaipChainId } from '@metamask/utils';

export const API_BASE_URL = 'https://transaction.metaswap.codefi.network';
export const CAIP_CHAIN_IDS: Record<string, CaipChainId> = {
  ETHEREUM: 'eip155:1',
  RINKEBY: 'eip155:4',
  BSC: 'eip155:56',
};
