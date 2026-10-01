import api from './client';

function responseData(response) {
  return response.data.data;
}

export const authApi = {
  async register(input) {
    return responseData(await api.post('/auth/register', input));
  },
  async login(input) {
    return responseData(await api.post('/auth/login', input));
  },
  async refresh() {
    return responseData(await api.post('/auth/refresh'));
  },
  async logout() {
    return responseData(await api.post('/auth/logout'));
  },
  async getProfile() {
    return responseData(await api.get('/profiles/me'));
  },
  async updateProfile(input) {
    return responseData(await api.patch('/profiles/me', input));
  },
};
