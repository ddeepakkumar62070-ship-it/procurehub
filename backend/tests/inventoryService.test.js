jest.mock('../src/config/db', () => ({
  pool: { connect: jest.fn() },
  query: jest.fn(),
}));

const { pool } = require('../src/config/db');
const { updateInventory } = require('../src/services/catalogService');

describe('Inventory service', () => {
  let client;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => jest.clearAllMocks());

  it('locks inventory and preserves reserved quantities when changing total stock', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          total_quantity: 10,
          available_quantity: 7,
          reserved_quantity: 3,
          reorder_level: 1,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          supplier_product_id: 'supplier-product-id',
          total_quantity: 8,
          available_quantity: 5,
          reserved_quantity: 3,
          reorder_level: 2,
        }],
      })
      .mockResolvedValueOnce({});

    const result = await updateInventory('supplier-id', 'supplier-product-id', {
      totalQuantity: 8,
      reorderLevel: 2,
    });

    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE OF i');
    expect(client.query.mock.calls[2][1]).toEqual([8, 5, 2, 'inventory-id']);
    expect(result.available_quantity + result.reserved_quantity).toBe(result.total_quantity);
    expect(client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back changes that would put total stock below reservations', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'inventory-id',
          total_quantity: 10,
          available_quantity: 7,
          reserved_quantity: 3,
          reorder_level: 1,
        }],
      })
      .mockResolvedValueOnce({});

    await expect(updateInventory('supplier-id', 'supplier-product-id', {
      totalQuantity: 2,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVENTORY_BELOW_RESERVED',
    });

    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
