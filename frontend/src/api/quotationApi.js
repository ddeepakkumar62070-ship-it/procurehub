import api from './client';

function responseData(response) {
  return response.data.data;
}

export const quotationApi = {
  async submit(purchaseRequestId, input) {
    return responseData(await api.post(`/purchase-requests/${purchaseRequestId}/quotations`, input));
  },
  async listForRequest(purchaseRequestId) {
    return responseData(await api.get(`/purchase-requests/${purchaseRequestId}/quotations`));
  },
  async listMine(params = {}) {
    const response = await api.get('/quotations', { params });
    return {
      data: response.data.data,
      page: response.data.page,
      limit: response.data.limit,
      total: response.data.total,
      totalPages: response.data.totalPages,
    };
  },
  async get(id) {
    return responseData(await api.get(`/quotations/${id}`));
  },
  async accept(id) {
    return responseData(await api.post(`/quotations/${id}/accept`));
  },
  async reject(id) {
    return responseData(await api.post(`/quotations/${id}/reject`));
  },
};
