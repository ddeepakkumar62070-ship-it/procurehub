const adminService = require('../services/adminService');
const disputeService = require('../services/disputeService');

async function dashboard(req, res) {
  return res.json({ success: true, data: await adminService.getDashboard() });
}

async function users(req, res) {
  return res.json({ success: true, ...(await adminService.listUsers(req.validatedQuery)) });
}

async function updateUser(req, res) {
  const result = await adminService.updateUserActive(
    req.validatedParams.id,
    req.body.isActive,
    req.user.id
  );
  return res.json({ success: true, data: result });
}

async function suppliers(req, res) {
  return res.json({ success: true, ...(await adminService.listSuppliers(req.validatedQuery)) });
}

async function updateSupplier(req, res) {
  const result = await adminService.updateSupplierVerification(
    req.validatedParams.id,
    req.body.verificationStatus
  );
  return res.json({ success: true, data: result });
}

async function orders(req, res) {
  return res.json({ success: true, ...(await adminService.listOrders(req.validatedQuery)) });
}

async function order(req, res) {
  return res.json({ success: true, data: await adminService.getOrder(req.validatedParams.id) });
}

async function auditLogs(req, res) {
  return res.json({ success: true, ...(await adminService.listAuditLogs(req.validatedQuery)) });
}

async function disputes(req, res) {
  return res.json({ success: true, ...(await disputeService.list(req.user, req.validatedQuery, true)) });
}

async function updateDispute(req, res) {
  return res.json({
    success: true,
    data: await disputeService.updateStatus(req.user, req.validatedParams.id, req.body),
  });
}

module.exports = {
  dashboard,
  users,
  updateUser,
  suppliers,
  updateSupplier,
  orders,
  order,
  auditLogs,
  disputes,
  updateDispute,
};
