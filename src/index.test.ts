import SmartTransactionsController from './SmartTransactionsController';
import DefaultExport from '.';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    const unsupportedChainId = '99999';
    expect(
      new DefaultExport(
        {
          onNetworkStateChange: jest.fn(),
          nonceTracker: null,
        },
        {
          chainId: unsupportedChainId, // This is needed so our code wouldn't do polling in this test.
        },
      ),
    ).toBeInstanceOf(SmartTransactionsController);
  });
});
