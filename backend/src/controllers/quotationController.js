const quotationService = require('../services/quotationService');

function paginatedResponse(result) {
  return {
    success: true,
    data: result.data,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  };
}

async function submit(req, res) {
  const quotation = await quotationService.submitQuotation(
    req.user.id,
    req.validatedParams.id,
    req.body
  );
  return res.status(201).json({ success: true, data: quotation });
}

async function listForRequest(req, res) {
  const quotations = await quotationService.listBuyerQuotations(
    req.user.id,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: quotations });
}

async function listMine(req, res) {
  const result = await quotationService.listSupplierQuotations(
    req.user.id,
    req.validatedQuery
  );
  return res.status(200).json(paginatedResponse(result));
}

async function getOne(req, res) {
  const quotation = await quotationService.getQuotationForUser(
    req.user,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: quotation });
}

async function accept(req, res) {
  const quotation = await quotationService.acceptQuotation(
    req.user.id,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: quotation });
}

async function reject(req, res) {
  const quotation = await quotationService.rejectQuotation(
    req.user.id,
    req.validatedParams.id
  );
  return res.status(200).json({ success: true, data: quotation });
}

module.exports = {
  submit,
  listForRequest,
  listMine,
  getOne,
  accept,
  reject,
};
