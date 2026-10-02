import api from './client';

export const disputeApi = {
  async list(params = {}) {
    return (await api.get('/disputes', { params })).data;
  },
  async create(input) {
    return (await api.post('/disputes', input)).data.data;
  },
};
