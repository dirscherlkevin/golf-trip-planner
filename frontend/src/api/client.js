import axios from 'axios'

const client = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/google']

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const isPublic = PUBLIC_AUTH_PATHS.some(p => config.url?.startsWith(p))
  if (token && !isPublic) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
