import { Hex } from './types';

export const API_BASE_URL = 'https://transaction.metaswap.codefi.network';
export const CHAIN_IDS: {
  ETHEREUM: Hex;
  GOERLI: Hex;
  RINKEBY: Hex;
  BSC: Hex;
} = {
  ETHEREUM: '0x1',
  GOERLI: '0x5',
  RINKEBY: '0x4',
  BSC: '0x38',
};
