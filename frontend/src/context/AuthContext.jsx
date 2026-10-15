/**
 * AuthContext — Authentication State Management
 * ==============================================
 * Manages user authentication, token hydration, profile fetching (/auth/me),
 * automatic 401 handling, and login/register/logout workflows.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authEndpoints } from '../api/endpoints/auth.js'
import { onUnauthorized } from '../api/client.js'
import { isMocked } from '../api/mocks/config.js'

const AuthContext = createContext(null)

const TOKEN_KEY = 'qm_token'
const USER_ID_KEY = 'qm_user_id'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_ID_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Listen for 401 Unauthorized signals from API client
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      clearAuth()
    })
    return unsubscribe
  }, [clearAuth])

  // Hydrate user on mount if token exists
  useEffect(() => {
    let active = true

    async function hydrate() {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (!storedToken) {
        if (active) setLoading(false)
        return
      }

      try {
        const userData = await authEndpoints.getMe()
        if (active) {
          setUser(userData)
          if (userData?.user_id) {
            localStorage.setItem(USER_ID_KEY, userData.user_id)
          }
        }
      } catch (err) {
        console.warn('Token hydration failed:', err.message)
        if (active) {
          clearAuth()
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [clearAuth])

  const login = async (credentials) => {
    setLoading(true)
    try {
      const data = await authEndpoints.login(credentials)
      localStorage.setItem(TOKEN_KEY, data.access_token)
      if (data.user_id) {
        localStorage.setItem(USER_ID_KEY, data.user_id)
      }
      setToken(data.access_token)

      // In mock mode or real mode, resolve user details
      if (isMocked('auth')) {
        const mockUser = {
          user_id: data.user_id,
          email: data.email,
          full_name: 'Ada Lovelace',
        }
        setUser(mockUser)
      } else {
        const userData = await authEndpoints.getMe()
        setUser(userData)
      }

      return data
    } finally {
      setLoading(false)
    }
  }

  const register = async (payload) => {
    setLoading(true)
    try {
      const data = await authEndpoints.register(payload)
      localStorage.setItem(TOKEN_KEY, data.access_token)
      if (data.user_id) {
        localStorage.setItem(USER_ID_KEY, data.user_id)
      }
      setToken(data.access_token)

      if (isMocked('auth')) {
        const mockUser = {
          user_id: data.user_id,
          email: data.email,
          full_name: payload.full_name || 'Ada Lovelace',
        }
        setUser(mockUser)
      } else {
        const userData = await authEndpoints.getMe()
        setUser(userData)
      }

      return data
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    clearAuth()
  }

  const value = {
    token,
    user,
    userId: user?.user_id || localStorage.getItem(USER_ID_KEY),
    isAuthenticated: Boolean(token && user),
    loading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
