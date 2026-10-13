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
  async listReviews(id) {
    const response = await api.get(`/suppliers/${id}/reviews`);
    return response.data.data;
  },
  async getOrderReview(orderId) {
    const response = await api.get(`/orders/${orderId}/review`);
    return response.data.data;
  },
  async createOrderReview(orderId, input) {
    const response = await api.post(`/orders/${orderId}/review`, input);
    return response.data.data;
  },
  async listMyReviews() {
    const response = await api.get('/suppliers/mine/reviews');
    return response.data.data;
  },
};
