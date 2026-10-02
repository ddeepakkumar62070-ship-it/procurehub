const catalogService = require('../services/catalogService');
const adminService = require('../services/adminService');
const { successResponse } = require('../utils/response');

async function listCategories(req, res) {
  return res.status(200).json(successResponse(await catalogService.listCategories()));
}

async function createCategory(req, res) {
  return res.status(201).json(successResponse(await adminService.createCategory(req.body, req.user.id)));
}

async function updateCategory(req, res) {
  return res.status(200).json(successResponse(
    await adminService.updateCategory(req.validatedParams.id, req.body, req.user.id)
  ));
}

async function deactivateCategory(req, res) {
  return res.status(200).json(successResponse(
    await adminService.deactivateCategory(req.validatedParams.id, req.user.id)
  ));
}

async function listProducts(req, res) {
  const result = await catalogService.listProducts(req.validatedQuery);
  return res.status(200).json({
    success: true,
    data: result.data,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  });
}

async function getProduct(req, res) {
  return res.status(200).json(successResponse(
    await catalogService.getProduct(req.validatedParams.id)
  ));
}

async function createProduct(req, res) {
  return res.status(201).json(successResponse(await adminService.createProduct(req.body, req.user.id)));
}

async function updateProduct(req, res) {
  return res.status(200).json(successResponse(
    await adminService.updateProduct(req.validatedParams.id, req.body, req.user.id)
  ));
}

async function deactivateProduct(req, res) {
  return res.status(200).json(successResponse(
    await adminService.deactivateProduct(req.validatedParams.id, req.user.id)
  ));
}

async function listSupplierProducts(req, res) {
  return res.status(200).json(successResponse(
    await catalogService.listSupplierProducts(req.user.id)
  ));
}

async function createSupplierProduct(req, res) {
  return res.status(201).json(successResponse(
    await catalogService.createSupplierProduct(req.user.id, req.body)
  ));
}

async function updateSupplierProduct(req, res) {
  return res.status(200).json(successResponse(
    await catalogService.updateSupplierProduct(
      req.user.id,
      req.validatedParams.id,
      req.body
    )
  ));
}

async function listInventory(req, res) {
  return res.status(200).json(successResponse(
    await catalogService.listInventory(req.user.id, req.validatedQuery.lowStock === 'true')
  ));
}

async function updateInventory(req, res) {
  return res.status(200).json(successResponse(
    await catalogService.updateInventory(
      req.user.id,
      req.validatedParams.supplierProductId,
      req.body
    )
  ));
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  listSupplierProducts,
  createSupplierProduct,
  updateSupplierProduct,
  listInventory,
  updateInventory,
};
