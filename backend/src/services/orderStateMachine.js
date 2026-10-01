const { ConflictError, ForbiddenError, ValidationError } = require('../utils/errors');

const ORDER_STATES = Object.freeze([
  'REQUESTED',
  'QUOTATION_RECEIVED',
  'QUOTATION_ACCEPTED',
  'PO_CREATED',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'INVOICE_GENERATED',
  'PAYMENT_PENDING',
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUNDED',
]);

const TRANSITIONS = Object.freeze({
  REQUESTED: ['QUOTATION_RECEIVED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  QUOTATION_RECEIVED: ['QUOTATION_ACCEPTED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  QUOTATION_ACCEPTED: ['PO_CREATED', 'CANCELLED'],
  PO_CREATED: ['CONFIRMED', 'CANCELLED', 'REJECTED', 'EXPIRED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED', 'REJECTED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'RETURN_REQUESTED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['INVOICE_GENERATED', 'RETURN_REQUESTED'],
  INVOICE_GENERATED: ['PAYMENT_PENDING', 'RETURN_REQUESTED'],
  PAYMENT_PENDING: ['PAID', 'RETURN_REQUESTED'],
  PAID: ['COMPLETED', 'RETURN_REQUESTED'],
  COMPLETED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  REFUNDED: [],
});

const TRANSITION_ROLES = Object.freeze({
  QUOTATION_RECEIVED: ['SUPPLIER'],
  QUOTATION_ACCEPTED: ['BUYER'],
  PO_CREATED: ['BUYER'],
  CONFIRMED: ['SUPPLIER'],
  PROCESSING: ['SUPPLIER'],
  SHIPPED: ['SUPPLIER'],
  OUT_FOR_DELIVERY: ['SUPPLIER'],
  DELIVERED: ['SUPPLIER'],
  INVOICE_GENERATED: ['SUPPLIER'],
  PAYMENT_PENDING: ['SUPPLIER'],
  PAID: ['BUYER'],
  COMPLETED: ['BUYER'],
  CANCELLED: ['BUYER'],
  REJECTED: ['BUYER', 'SUPPLIER'],
  EXPIRED: ['SUPPLIER', 'SYSTEM'],
  RETURN_REQUESTED: ['BUYER'],
  RETURNED: ['SUPPLIER'],
  REFUNDED: ['SUPPLIER'],
});

function assertTransition(currentStatus, nextStatus) {
  if (!ORDER_STATES.includes(nextStatus)) {
    throw new ValidationError('Unknown purchase order status');
  }
  if (!TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    throw new ConflictError(
      `Purchase order cannot transition from ${currentStatus} to ${nextStatus}`,
      'INVALID_ORDER_TRANSITION'
    );
  }
}

function assertPermission(nextStatus, role) {
  if (!TRANSITION_ROLES[nextStatus]?.includes(role)) {
    throw new ForbiddenError(
      `${role} users cannot transition a purchase order to ${nextStatus}`,
    );
  }
}

function availableTransitions(currentStatus) {
  return [...(TRANSITIONS[currentStatus] || [])];
}

const OrderStateMachine = Object.freeze({
  ORDER_STATES,
  TRANSITIONS,
  TRANSITION_ROLES,
  assertTransition,
  assertPermission,
  availableTransitions,
});

module.exports = OrderStateMachine;
