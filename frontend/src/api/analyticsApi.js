import api from './client';

export const analyticsApi = {
  async mine() {
    return (await api.get('/analytics/me')).data.data;
  },
};
