import { create } from 'zustand';
import { authApi } from '../api/authApi';

let bootstrapRequest;

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  profile: null,
  isLoading: true,

  setSession: ({ user, accessToken }) => set({ user, accessToken }),
  clearSession: () => set({ user: null, accessToken: null, profile: null }),

  bootstrap: async () => {
    try {
      bootstrapRequest ||= authApi.refresh().finally(() => {
        bootstrapRequest = undefined;
      });
      const session = await bootstrapRequest;
      set({ user: session.user, accessToken: session.accessToken });
    } catch (error) {
      set({ user: null, accessToken: null, profile: null });
      if (error.response?.status !== 401) throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (input) => {
    const session = await authApi.login(input);
    set({ user: session.user, accessToken: session.accessToken });
  },

  register: async (input) => {
    const session = await authApi.register(input);
    set({ user: session.user, accessToken: session.accessToken });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, accessToken: null, profile: null });
    }
  },

  loadProfile: async () => {
    const profile = await authApi.getProfile();
    set({ profile });
    return profile;
  },

  updateProfile: async (input) => {
    const profile = await authApi.updateProfile(input);
    set({ profile });
    set((state) => ({
      user: {
        ...state.user,
        firstName: profile.firstName,
        lastName: profile.lastName,
      },
    }));
    return profile;
  },
}));
