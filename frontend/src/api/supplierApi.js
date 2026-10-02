import api from './client';

export const supplierApi = {
  async list(params = {}) {
    const response = await api.get('/suppliers', { params });
    return response.data;
  },
  async get(id) {
    const response = await api.get(`/suppliers/${id}`);
    return response.data.data;
  },
};
