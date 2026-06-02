import { create } from 'zustand'
import client from '../api/client'
import { getGoogleIdToken } from '../firebase'

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),

  login: async (email, password) => {
    const form = new URLSearchParams({ username: email, password })
    const { data } = await client.post('/auth/login', form)
    localStorage.setItem('token', data.access_token)
    const me = await client.get('/auth/me')
    set({ token: data.access_token, user: me.data })
  },

  register: async (email, name, password) => {
    const { data } = await client.post('/auth/register', { email, name, password })
    localStorage.setItem('token', data.access_token)
    const me = await client.get('/auth/me')
    set({ token: data.access_token, user: me.data })
  },

  loginWithGoogle: async () => {
    const idToken = await getGoogleIdToken()
    const { data } = await client.post('/auth/google', { id_token: idToken })
    localStorage.setItem('token', data.access_token)
    const me = await client.get('/auth/me')
    set({ token: data.access_token, user: me.data })
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },

  fetchMe: async () => {
    try {
      const { data } = await client.get('/auth/me')
      set({ user: data })
    } catch (err) {
      // Only clear token if server explicitly rejects it (401)
      // Network errors or server cold-start (5xx) keep the token so the user stays logged in
      if (err.response?.status === 401) {
        localStorage.removeItem('token')
        set({ user: null, token: null })
      }
    }
  },
}))
