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
    req.body.verificationStatus,
    req.user.id
  );
  return res.json({ success: true, data: result });
}

async function updateSupplierSuspension(req, res) {
  const result = await adminService.updateSupplierSuspension(
    req.validatedParams.id,
    req.body.isSuspended,
    req.body.reason,
    req.user.id
  );
  return res.json({ success: true, data: result });
}

async function categories(req, res) {
  return res.json({ success: true, data: await adminService.listCategories() });
}

async function createCategory(req, res) {
  return res.status(201).json({
    success: true,
    data: await adminService.createCategory(req.body, req.user.id),
  });
}

async function updateCategory(req, res) {
  return res.json({
    success: true,
    data: await adminService.updateCategory(req.validatedParams.id, req.body, req.user.id),
  });
}

async function deactivateCategory(req, res) {
  return res.json({
    success: true,
    data: await adminService.deactivateCategory(req.validatedParams.id, req.user.id),
  });
}

async function createProduct(req, res) {
  return res.status(201).json({
    success: true,
    data: await adminService.createProduct(req.body, req.user.id),
  });
}

async function updateProduct(req, res) {
  return res.json({
    success: true,
    data: await adminService.updateProduct(req.validatedParams.id, req.body, req.user.id),
  });
}

async function deactivateProduct(req, res) {
  return res.json({
    success: true,
    data: await adminService.deactivateProduct(req.validatedParams.id, req.user.id),
  });
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
  updateSupplierSuspension,
  categories,
  createCategory,
  updateCategory,
  deactivateCategory,
  createProduct,
  updateProduct,
  deactivateProduct,
  orders,
  order,
  auditLogs,
  disputes,
  updateDispute,
};
