const invoiceService = require('../services/invoiceService');

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

async function listMine(req, res) {
  const result = await invoiceService.listInvoices(req.user, req.validatedQuery);
  return res.status(200).json(paginatedResponse(result));
}

async function getOne(req, res) {
  const invoice = await invoiceService.getInvoice(req.validatedParams.id, req.user);
  return res.status(200).json({ success: true, data: invoice });
}

async function getPdf(req, res) {
  const invoice = await invoiceService.getInvoice(req.validatedParams.id, req.user);
  const pdf = await invoiceService.getInvoicePdf(req.validatedParams.id, req.user);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'private, no-store',
  });
  return res.status(200).send(pdf);
}

async function pay(req, res) {
  const payment = await invoiceService.payInvoice(
    req.validatedParams.id,
    req.user,
    req.body.amount
  );
  return res.status(200).json({ success: true, data: payment });
}

module.exports = {
  listMine,
  getOne,
  getPdf,
  pay,
};
