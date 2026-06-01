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
    // Use raw fetch to avoid axios XHR issues on mobile Safari
    const apiUrl = import.meta.env.VITE_API_URL || ''
    const res = await fetch(`${apiUrl}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Auth failed (${res.status})`)
    }
    const data = await res.json()
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
    } catch {
      localStorage.removeItem('token')
      set({ user: null, token: null })
    }
  },
}))
