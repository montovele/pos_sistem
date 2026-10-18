import test from 'node:test'
import assert from 'node:assert/strict'

import { saveSession, readSession, getStoredToken } from './session.ts'

const createMemoryStorage = () => {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    }
  } as Storage
}

test('saveSession persists token and organization context in the active session', () => {
  const storage = createMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true
  })

  const session = {
    token: 'abc123',
    user: {
      id: 12,
      username: 'cajero.ventas',
      organizationId: 7,
      organizationName: 'Comercializadora Norte',
      role: 'cashier',
      active: true,
      nombreEmpleado: 'Cajero ventas',
      numeroEmpleado: 12
    }
  }

  saveSession(session)

  assert.deepEqual(readSession(), session)
  assert.equal(getStoredToken(), 'abc123')
})
