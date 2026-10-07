const {
  reserveForOrder,
  confirmForOrder,
  releaseForOrder,
  consumeForOrder,
  restoreReturnedInventory,
} = require('../src/services/inventoryReservationService');

describe('InventoryReservationService', () => {
  it('locks inventory before decrementing available and creating a reservation', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'item-id', product_id: 'product-id', quantity: 4 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id', available_quantity: 10 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-id', status: 'ACTIVE' }] });

    const result = await reserveForOrder(client, {
      orderId: 'order-id',
      supplierUserId: 'supplier-id',
      currency: 'USD',
    });

    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE OF i');
    expect(client.query.mock.calls[2][0]).toContain('available_quantity = available_quantity - $1');
    expect(client.query.mock.calls[2][0]).toContain('reserved_quantity = reserved_quantity + $1');
    expect(client.query.mock.calls[2][1]).toEqual([4, 'inventory-id']);
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO inventory_reservations');
    expect(result).toHaveLength(1);
  });

  it('refuses reservations above the locked available quantity', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'item-id', product_id: 'product-id', quantity: 7 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id', available_quantity: 5 }] });

    await expect(reserveForOrder(client, {
      orderId: 'order-id',
      supplierUserId: 'supplier-id',
      currency: 'USD',
    })).rejects.toMatchObject({ code: 'INVENTORY_RESERVATION_UNAVAILABLE' });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('confirms active reservations when a supplier confirms an order', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rowCount: 2 }),
    };
    await expect(confirmForOrder(client, 'order-id')).resolves.toBe(2);
    expect(client.query.mock.calls[0][0]).toContain("status = 'CONFIRMED'");
    expect(client.query.mock.calls[0][0]).toContain("status = 'ACTIVE'");
  });

  it('restores stock and closes reservations when an order is cancelled', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-id', inventory_id: 'inventory-id', quantity: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    await expect(releaseForOrder(client, 'order-id')).resolves.toBe(1);
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[2][0]).toContain('available_quantity = available_quantity + $1');
    expect(client.query.mock.calls[2][0]).toContain('reserved_quantity = reserved_quantity - $1');
    expect(client.query.mock.calls[3][1]).toEqual(['RELEASED', 'reservation-id']);
  });

  it('consumes confirmed inventory when the supplier ships the order', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'reservation-id', inventory_id: 'inventory-id', quantity: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    await expect(consumeForOrder(client, 'order-id')).resolves.toBe(1);
    expect(client.query.mock.calls[0][1]).toEqual(['order-id', ['CONFIRMED']]);
    expect(client.query.mock.calls[2][0]).toContain('total_quantity = total_quantity - $1');
    expect(client.query.mock.calls[3][0]).toContain("status = 'CONSUMED'");
  });

  it('restores consumed inventory once and marks its reservation returned', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'reservation-id', inventory_id: 'inventory-id', quantity: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'inventory-id' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    await expect(restoreReturnedInventory(client, 'order-id')).resolves.toBe(1);
    expect(client.query.mock.calls[0][0]).toContain("status = 'CONSUMED'");
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[2][0]).toContain('total_quantity = total_quantity + $1');
    expect(client.query.mock.calls[2][0]).toContain('available_quantity = available_quantity + $1');
    expect(client.query.mock.calls[3][0]).toContain("status = 'RETURNED'");
    expect(client.query.mock.calls[3][0]).toContain('consumed_at = NULL');
  });
});
