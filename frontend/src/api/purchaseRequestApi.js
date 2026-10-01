import api from './client';

function responseData(response) {
  return response.data.data;
}

export const purchaseRequestApi = {
  async create(input) {
    return responseData(await api.post('/purchase-requests', input));
  },
  async listMine(params = {}) {
    const response = await api.get('/purchase-requests', { params });
    return {
      data: response.data.data,
      page: response.data.page,
      limit: response.data.limit,
      total: response.data.total,
      totalPages: response.data.totalPages,
    };
  },
  async getMine(id) {
    return responseData(await api.get(`/purchase-requests/${id}`));
  },
  async cancel(id) {
    return responseData(await api.post(`/purchase-requests/${id}/cancel`));
  },
  async listEligible(params = {}) {
    const response = await api.get('/purchase-requests/eligible', { params });
    return {
      data: response.data.data,
      page: response.data.page,
      limit: response.data.limit,
      total: response.data.total,
      totalPages: response.data.totalPages,
    };
  },
  async getEligible(id) {
    return responseData(await api.get(`/purchase-requests/eligible/${id}`));
  },
};
