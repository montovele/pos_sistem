import axios, { AxiosInstance, AxiosError, AxiosHeaders } from 'axios'
import { clearSession, getStoredToken } from '@/utils/session'

const runtimeApiUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL.trim()
  : '/'

const rawApiUrl = runtimeApiUrl.replace(/\/$/, '')
const apiBaseUrl = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api'

class HttpClient {
  private instance: AxiosInstance
  private baseURL = apiBaseUrl

  constructor() {
    this.instance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      },
      withCredentials: false
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    this.instance.interceptors.request.use(
      (config) => {
        const token = getStoredToken()
        if (token) {
          config.headers = AxiosHeaders.from(config.headers || {})
          config.headers.set('Authorization', `Bearer ${token}`)
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    this.instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          clearSession()
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }

        const errorData = error.response?.data as any
        const message = errorData?.message || errorData?.error || error.message || 'An error occurred'
        const apiError = new Error(message) as Error & { status?: number; body?: unknown }
        apiError.status = error.response?.status
        apiError.body = errorData
        throw apiError
      }
    )
  }

  async get<T = any>(url: string, config = {}): Promise<T> {
    const response = await this.instance.get<T>(url, config)
    return response.data as T
  }

  async post<T = any>(url: string, data?: any, config = {}): Promise<T> {
    const response = await this.instance.post<T>(url, data, config)
    return response.data as T
  }

  async put<T = any>(url: string, data?: any, config = {}): Promise<T> {
    const response = await this.instance.put<T>(url, data, config)
    return response.data as T
  }

  async patch<T = any>(url: string, data?: any, config = {}): Promise<T> {
    const response = await this.instance.patch<T>(url, data, config)
    return response.data as T
  }

  async delete<T = any>(url: string, config = {}): Promise<T> {
    const response = await this.instance.delete<T>(url, config)
    return response.data as T
  }
}

export default new HttpClient()
