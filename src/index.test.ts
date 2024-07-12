import DefaultExport from '.';
import SmartTransactionsController from './SmartTransactionsController';
import { getFakeProvider } from './test-helpers';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    jest.useFakeTimers();
    const controller = new DefaultExport({
      onNetworkStateChange: jest.fn(),
      getNonceLock: null,
      provider: getFakeProvider(),
      confirmExternalTransaction: jest.fn(),
      getTransactions: jest.fn(),
      trackMetaMetricsEvent: jest.fn(),
      getNetworkClientById: jest.fn(),
    });
    expect(controller).toBeInstanceOf(SmartTransactionsController);
    jest.clearAllTimers();
  });
});
