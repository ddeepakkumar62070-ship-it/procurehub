import api from './client';

export const adminApi = {
  async dashboard() {
    return (await api.get('/admin/dashboard')).data.data;
  },
  async users(params = {}) {
    return (await api.get('/admin/users', { params })).data;
  },
  async updateUser(id, isActive) {
    return (await api.patch(`/admin/users/${id}`, { isActive })).data.data;
  },
  async suppliers(params = {}) {
    return (await api.get('/admin/suppliers', { params })).data;
  },
  async updateSupplier(id, verificationStatus) {
    return (await api.patch(`/admin/suppliers/${id}`, { verificationStatus })).data.data;
  },
  async updateSupplierSuspension(id, isSuspended, reason) {
    return (await api.patch(`/admin/suppliers/${id}/suspension`, {
      isSuspended,
      ...(reason && { reason }),
    })).data.data;
  },
  async categories() {
    return (await api.get('/admin/categories')).data.data;
  },
  async createCategory(input) {
    return (await api.post('/admin/categories', input)).data.data;
  },
  async updateCategory(id, input) {
    return (await api.patch(`/admin/categories/${id}`, input)).data.data;
  },
  async deactivateCategory(id) {
    return (await api.delete(`/admin/categories/${id}`)).data.data;
  },
  async createProduct(input) {
    return (await api.post('/admin/products', input)).data.data;
  },
  async orders(params = {}) {
    return (await api.get('/admin/orders', { params })).data;
  },
  async getOrder(id) {
    return (await api.get(`/admin/orders/${id}`)).data.data;
  },
  async auditLogs(params = {}) {
    return (await api.get('/admin/audit-logs', { params })).data;
  },
  async disputes(params = {}) {
    return (await api.get('/admin/disputes', { params })).data;
  },
  async updateDispute(id, input) {
    return (await api.patch(`/admin/disputes/${id}`, input)).data.data;
  },
};
