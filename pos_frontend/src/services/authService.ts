import type { LoginRequest, AuthResponse, User } from '@/types'
import { clearSession, getStoredToken, readSession, saveSession } from '@/utils/session'
import http from './http'

class AuthService {
  private unwrapPayload<T = any>(response: any): T {
    const payload = response?.data ?? response

    if (payload && typeof payload === 'object' && 'success' in payload) {
      if (payload.success === false) {
        throw new Error(payload.message || 'Error en la operación')
      }
      return (payload.data ?? payload) as T
    }

    return payload as T
  }

  /**
   * Iniciar sesión
   * @param credentials Número de empleado y contraseña
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response: any = await http.post('/auth/login', {
      username: credentials.username,
      password: credentials.password
    })

    const payload = this.unwrapPayload<AuthResponse>(response)
    if (!payload || (!payload.token && !payload.user)) {
      throw new Error(response?.message || 'Error al iniciar sesión')
    }

    const user = payload.user as User
    saveSession({ token: payload.token, user })

    return payload as AuthResponse
  }

  /**
   * Cerrar sesión
   */
  async logout(): Promise<void> {
    try {
      await http.post('/auth/logout')
    } finally {
      clearSession()
    }
  }

  /**
   * Obtener usuario actual
   */
  private persistUser(user: User | null): void {
    const session = readSession() || { token: getStoredToken(), user: null }
    saveSession({ token: session.token, user })
  }

  private readCachedUser(): User | null {
    const session = readSession()
    const user = session?.user ?? null

    if (!user) return null

    this.persistUser(user)
    return user
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const response: any = await http.get('/auth/me')
      const payload = this.unwrapPayload<User>(response)
      if (payload) {
        this.persistUser(payload as User)
        return payload as User
      }
    } catch (error) {
      try {
        const response: any = await http.get('/auth/current-user')
        const payload = this.unwrapPayload<User>(response)
        if (payload) {
          this.persistUser(payload as User)
          return payload as User
        }
      } catch (fallbackError) {
        console.warn('No se pudo refrescar el usuario desde la sesión activa:', fallbackError)
      }
    }

    return this.readCachedUser()
  }

  async getActiveOrganization(): Promise<{ id: number; name: string } | null> {
    try {
      const response: any = await http.get('/organization')
      const payload = this.unwrapPayload<{ id?: number; name?: string }>(response)
      const organization = payload && typeof payload === 'object' ? payload : null

      if (!organization || typeof organization.id !== 'number') {
        return null
      }

      const session = readSession()
      const sessionUser = session?.user
      if (sessionUser?.organizationId && Number(sessionUser.organizationId) !== Number(organization.id)) {
        throw new Error('La sesión no coincide con la organización activa')
      }

      if (sessionUser) {
        const mergedUser: User = { ...sessionUser, organizationId: Number(organization.id), organizationName: organization.name || sessionUser.organizationName || null }
        saveSession({ token: session?.token || getStoredToken(), user: mergedUser })
      }

      return {
        id: Number(organization.id),
        name: String(organization.name || 'Empresa activa')
      }
    } catch (error: any) {
      if (error?.message) {
        console.warn('No se pudo consultar la organización activa:', error.message)
      }
      return null
    }
  }

  /**
   * Verificar validez del token
   */
  async verifyToken(): Promise<boolean> {
    const token = getStoredToken()
    if (!token) return false

    try {
      const response: any = await http.get('/auth/verify-token')
      const payload = this.unwrapPayload<{ valid?: boolean; user?: User }>(response)
      return !!(payload?.valid ?? payload)
    } catch {
      return false
    }
  }
}

export default new AuthService()
