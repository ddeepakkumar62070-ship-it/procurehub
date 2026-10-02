import api from './client';

export const invoiceApi = {
  async list(params = {}) {
    const response = await api.get('/invoices', { params });
    return response.data;
  },
  async get(id) {
    const response = await api.get(`/invoices/${id}`);
    return response.data.data;
  },
  async pay(id, amount) {
    const response = await api.post(`/invoices/${id}/payments`, amount ? { amount: Number(amount) } : {});
    return response.data.data;
  },
  async downloadPdf(id) {
    const response = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
    return response.data;
  },
};
