import axios, { AxiosHeaders } from 'axios'
import { clearSession, getStoredToken } from '@/utils/session'

const runtimeApiUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL.trim()
  : '/'

const rawApiUrl = runtimeApiUrl.replace(/\/$/, '')
const apiBaseUrl = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: Number((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_TIMEOUT) || 30000),
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: false
})

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers = AxiosHeaders.from(config.headers || {})
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    const message = error?.response?.data?.message || error?.message || 'Error al conectar con el servidor'
    const normalizedError = new Error(message) as Error & { status?: number; code?: string }
    normalizedError.status = error?.response?.status
    normalizedError.code = error?.code
    return Promise.reject(normalizedError)
  }
)

export { api }
export default api
