export interface SessionUser {
  id?: number
  username?: string
  email?: string
  role?: 'admin' | 'cashier' | 'manager' | string
  nombreEmpleado?: string
  numeroEmpleado?: number
  organizationId?: number | null
  organizationName?: string | null
  active?: boolean
  [key: string]: unknown
}

export interface SessionData {
  token: string | null
  user: SessionUser | null
}

const SESSION_STORAGE_KEY = 'pos.session'

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null
  const storage = globalThis.localStorage
  return storage ?? null
}

export function clearSession(): void {
  const storage = getStorage()
  if (!storage) return

  storage.removeItem(SESSION_STORAGE_KEY)
  storage.removeItem('auth_token')
  storage.removeItem('access_token')
  storage.removeItem('user')
  storage.removeItem('user_session')
}

export function getStoredToken(): string | null {
  const storage = getStorage()
  const token = storage ? storage.getItem('auth_token') || storage.getItem('access_token') : null
  if (token) return token

  try {
    const session = readSession()
    return session?.token || null
  } catch {
    return null
  }
}

export function saveSession(session: Partial<SessionData> | null): void {
  const storage = getStorage()
  if (!storage) return

  if (!session) {
    clearSession()
    return
  }

  const normalizedSession: SessionData = {
    token: session.token || getStoredToken() || null,
    user: session.user || null
  }

  if (normalizedSession.token) {
    storage.setItem('auth_token', normalizedSession.token)
    storage.setItem('access_token', normalizedSession.token)
  }

  if (normalizedSession.user) {
    storage.setItem('user', JSON.stringify(normalizedSession.user))
    storage.setItem('user_session', JSON.stringify(normalizedSession.user))
  }

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalizedSession))
}

export function readSession(): SessionData | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<SessionData>
    if (!parsed || typeof parsed !== 'object') return null

    const session: SessionData = {
      token: typeof parsed.token === 'string' ? parsed.token : getStoredToken(),
      user: parsed.user || null
    }

    if (session.token) {
      storage.setItem('auth_token', session.token)
      storage.setItem('access_token', session.token)
    }

    if (session.user) {
      storage.setItem('user', JSON.stringify(session.user))
      storage.setItem('user_session', JSON.stringify(session.user))
    }

    return session
  } catch {
    clearSession()
    return null
  }
}
