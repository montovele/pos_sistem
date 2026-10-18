import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, AuthResponse } from '@/types'
import authService from '@/services/authService'
import { readSession } from '@/utils/session'

export const useAuthStore = defineStore('auth', () => {
  const session = readSession()
  const user = ref<User | null>(session?.user ?? null)
  const token = ref<string | null>(session?.token ?? null)
  const organization = ref<{ id: number | null; name: string | null }>({
    id: session?.user?.organizationId ?? null,
    name: session?.user?.organizationName ?? null
  })
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const currentUser = computed(() => user.value)
  const currentOrganization = computed(() => organization.value)

  const login = async (username: string, password: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await authService.login({ username, password })
      user.value = response.user
      token.value = response.token
      organization.value = {
        id: response.user.organizationId ?? null,
        name: response.user.organizationName ?? null
      }
      return true
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  const logout = async () => {
    isLoading.value = true
    try {
      await authService.logout()
      user.value = null
      token.value = null
      organization.value = { id: null, name: null }
    } catch (err: any) {
      error.value = err.message || 'Logout failed'
    } finally {
      isLoading.value = false
    }
  }

  const loadCurrentUser = async () => {
    isLoading.value = true
    try {
      const currentUserData = await authService.getCurrentUser()
      user.value = currentUserData
      token.value = token.value || readSession()?.token || null
      organization.value = {
        id: currentUserData?.organizationId ?? organization.value.id,
        name: currentUserData?.organizationName ?? organization.value.name
      }
      return !!currentUserData
    } catch (err: any) {
      error.value = err.message
      return false
    } finally {
      isLoading.value = false
    }
  }

  const refreshOrganization = async () => {
    try {
      const activeOrganization = await authService.getActiveOrganization()
      if (activeOrganization) {
        organization.value = {
          id: activeOrganization.id,
          name: activeOrganization.name
        }
      }
      return activeOrganization
    } catch (err: any) {
      error.value = err.message || 'Error al cargar la organización activa'
      return null
    }
  }

  return {
    user,
    token,
    organization,
    isLoading,
    error,
    isAuthenticated,
    currentUser,
    currentOrganization,
    login,
    logout,
    loadCurrentUser,
    refreshOrganization
  }
})
