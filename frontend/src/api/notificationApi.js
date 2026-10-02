import api from './client';

export const notificationApi = {
  async list(params = {}) {
    const response = await api.get('/notifications', { params: { limit: 30, ...params } });
    return response.data;
  },
  async markRead(id) {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data.data;
  },
  async markAllRead() {
    const response = await api.patch('/notifications/read-all');
    return response.data.data;
  },
};
