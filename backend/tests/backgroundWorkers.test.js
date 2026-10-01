jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));
jest.mock('../src/jobs/producers', () => ({
  enqueueLowStockAlert: jest.fn(),
}));

const { query } = require('../src/config/db');
const { enqueueLowStockAlert } = require('../src/jobs/producers');
const { processLowStockSweep } = require('../src/workers/backgroundWorkers');

describe('Background worker jobs', () => {
  afterEach(() => jest.clearAllMocks());

  it('queues low-stock alerts once per inventory item and day', async () => {
    query.mockResolvedValue({
      rowCount: 1,
      rows: [{
        id: 'inventory-1',
        available_quantity: 2,
        reorder_level: 5,
        supplier_user_id: 'supplier-1',
        product_name: 'Rice',
        email: 'supplier@example.com',
      }],
    });

    await expect(processLowStockSweep()).resolves.toBe(1);

    expect(enqueueLowStockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'supplier@example.com',
        subject: 'Low stock alert: Rice',
      }),
      expect.stringMatching(/^low-stock-inventory-1-\d{4}-\d{2}-\d{2}$/)
    );
  });
});
