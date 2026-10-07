const {
  ORDER_STATES,
  assertTransition,
  assertPermission,
  availableTransitions,
} = require('../src/services/orderStateMachine');

describe('OrderStateMachine', () => {
  it('allows only the declared next step in the normal order lifecycle', () => {
    expect(availableTransitions('PO_CREATED')).toEqual([
      'CONFIRMED', 'CANCELLED', 'REJECTED', 'EXPIRED',
    ]);
    expect(() => assertTransition('PO_CREATED', 'CONFIRMED')).not.toThrow();
    expect(() => assertTransition('PO_CREATED', 'SHIPPED')).toThrow(
      'Purchase order cannot transition from PO_CREATED to SHIPPED'
    );
  });

  it('supports defined exceptional paths without permitting arbitrary status changes', () => {
    expect(() => assertTransition('SHIPPED', 'RETURN_REQUESTED')).not.toThrow();
    expect(() => assertTransition('RETURN_REQUESTED', 'REFUNDED')).toThrow();
    expect(() => assertTransition('RETURNED', 'REFUNDED')).not.toThrow();
    expect(() => assertTransition('PO_CREATED', 'UNKNOWN')).toThrow(
      'Unknown purchase order status'
    );
    expect(ORDER_STATES).toContain('EXPIRED');
  });

  it('checks the role authorized to perform a transition', () => {
    expect(() => assertPermission('SHIPPED', 'SUPPLIER')).not.toThrow();
    expect(() => assertPermission('SHIPPED', 'BUYER')).toThrow(
      'BUYER users cannot transition a purchase order to SHIPPED'
    );
    expect(() => assertPermission('RETURNED', 'SUPPLIER')).not.toThrow();
    expect(() => assertPermission('RETURNED', 'BUYER')).toThrow(
      'BUYER users cannot transition a purchase order to RETURNED'
    );
  });
});
