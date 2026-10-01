import api from './client';

function responseData(response) {
  return response.data.data;
}

export const orderApi = {
  async list(params = {}) {
    const response = await api.get('/orders', { params });
    return {
      data: response.data.data,
      page: response.data.page,
      limit: response.data.limit,
      total: response.data.total,
      totalPages: response.data.totalPages,
    };
  },
  async get(id) {
    return responseData(await api.get(`/orders/${id}`));
  },
  async transition(id, input) {
    return responseData(await api.post(`/orders/${id}/transitions`, input));
  },
};
