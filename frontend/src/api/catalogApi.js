import api from './client';

function responseData(response) {
  return response.data.data;
}

export const catalogApi = {
  async getCategories() {
    return responseData(await api.get('/catalog/categories'));
  },
  async createCategory(input) {
    return responseData(await api.post('/admin/categories', input));
  },
  async createProduct(input) {
    return responseData(await api.post('/admin/products', input));
  },
  async getProducts(params) {
    const response = await api.get('/catalog/products', { params });
    return {
      data: response.data.data,
      page: response.data.page,
      limit: response.data.limit,
      total: response.data.total,
      totalPages: response.data.totalPages,
    };
  },
  async getProduct(id) {
    return responseData(await api.get(`/catalog/products/${id}`));
  },
  async getSupplierProducts() {
    return responseData(await api.get('/supplier-products/mine'));
  },
  async createSupplierProduct(input) {
    return responseData(await api.post('/supplier-products', input));
  },
  async updateSupplierProduct(id, input) {
    return responseData(await api.patch(`/supplier-products/${id}`, input));
  },
  async updateInventory(supplierProductId, input) {
    return responseData(await api.patch(`/inventory/${supplierProductId}`, input));
  },
  async getInventory(lowStock = false) {
    return responseData(await api.get('/inventory', {
      params: lowStock ? { lowStock: 'true' } : {},
    }));
  },
};
