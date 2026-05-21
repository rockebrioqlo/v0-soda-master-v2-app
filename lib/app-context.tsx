'use client'

import React, { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react'
import { hash } from 'bcryptjs'
import { 
  AppState, 
  AppAction, 
  Usuario,
  Rol
} from './types'
import {
  initialMesas,
  initialUsuarios,
  initialProductos,
  initialIngredientes,
  initialComandas,
  initialPermisosDescuento,
  initialConfiguracion,
  userPins
} from './initial-data'

const initialState: AppState = {
  mesas: initialMesas,
  usuarios: [],
  productos: initialProductos,
  ingredientes: initialIngredientes,
  comandas: initialComandas,
  pagos: [],
  mermas: [],
  comandasNoPagadas: [],
  descuentos: [],
  conflictLog: [],
  permisosDescuento: initialPermisosDescuento,
  configuracion: initialConfiguracion,
  usuarioActual: null,
  isOnline: true,
  sincronizando: false,
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USUARIO':
      return { ...state, usuarioActual: action.payload }
    case 'SET_MESAS':
      return { ...state, mesas: action.payload }
    case 'ADD_MESA':
      return { ...state, mesas: [...state.mesas, action.payload] }
    case 'UPDATE_MESA':
      return { 
        ...state, 
        mesas: state.mesas.map(m => m.id === action.payload.id ? action.payload : m) 
      }
    case 'DELETE_MESA':
      return { ...state, mesas: state.mesas.filter(m => m.id !== action.payload) }
    case 'SET_PRODUCTOS':
      return { ...state, productos: action.payload }
    case 'ADD_PRODUCTO':
      return { ...state, productos: [...state.productos, action.payload] }
    case 'UPDATE_PRODUCTO':
      return { 
        ...state, 
        productos: state.productos.map(p => p.id === action.payload.id ? action.payload : p) 
      }
    case 'DELETE_PRODUCTO':
      return { ...state, productos: state.productos.filter(p => p.id !== action.payload) }
    case 'SET_COMANDAS':
      return { ...state, comandas: action.payload }
    case 'ADD_COMANDA':
      return { ...state, comandas: [...state.comandas, action.payload] }
    case 'UPDATE_COMANDA':
      return { 
        ...state, 
        comandas: state.comandas.map(c => c.id === action.payload.id ? action.payload : c) 
      }
    case 'DELETE_COMANDA':
      return { ...state, comandas: state.comandas.filter(c => c.id !== action.payload) }
    case 'SET_USUARIOS':
      return { ...state, usuarios: action.payload }
    case 'ADD_USUARIO':
      return { ...state, usuarios: [...state.usuarios, action.payload] }
    case 'UPDATE_USUARIO':
      return { 
        ...state, 
        usuarios: state.usuarios.map(u => u.id === action.payload.id ? action.payload : u) 
      }
    case 'DELETE_USUARIO':
      return { ...state, usuarios: state.usuarios.filter(u => u.id !== action.payload) }
    case 'ADD_PAGO':
      return { ...state, pagos: [...state.pagos, action.payload] }
    case 'ADD_MERMA':
      return { ...state, mermas: [...state.mermas, action.payload] }
    case 'UPDATE_MERMA':
      return { 
        ...state, 
        mermas: state.mermas.map(m => m.id === action.payload.id ? action.payload : m) 
      }
    case 'ADD_DESCUENTO':
      return { ...state, descuentos: [...state.descuentos, action.payload] }
    case 'SET_PERMISOS_DESCUENTO':
      return { ...state, permisosDescuento: action.payload }
    case 'SET_CONFIGURACION':
      return { ...state, configuracion: action.payload }
    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload }
    case 'SET_SINCRONIZANDO':
      return { ...state, sincronizando: action.payload }
    case 'LOAD_STATE':
      return { ...state, ...action.payload }
    default:
      return state
  }
}

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  login: (email: string, pin: string) => Promise<{ success: boolean; message: string }>
  logout: () => void
  hasPermission: (modulo: string) => boolean
  isInitialized: boolean
}

const AppContext = createContext<AppContextType | undefined>(undefined)

// Permission matrix by role
const permisosModulo: Record<string, Rol[]> = {
  dashboard: ['administrador', 'cajero'],
  mesas: ['administrador', 'mesero', 'cajero'],
  pos: ['administrador', 'mesero', 'cajero'],
  kds: ['administrador', 'cocina', 'bar'],
  inventario: ['administrador'],
  usuarios: ['administrador'],
  pagos: ['administrador', 'cajero'],
  mermas: ['administrador', 'mesero', 'cocina', 'bar'],
  reportes: ['administrador', 'cajero'],
  configuracion: ['administrador'],
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize users with hashed PINs
  useEffect(() => {
    const initializeUsers = async () => {
      // Check if we have users in sessionStorage
      const savedSession = sessionStorage.getItem('soda_master_session')
      
      // Hash PINs for initial users
      const usersWithHash: Usuario[] = await Promise.all(
        initialUsuarios.map(async (user) => {
          const pin = userPins[user.id]
          const pinHash = await hash(pin, 10)
          return { ...user, pinHash }
        })
      )
      
      dispatch({ type: 'SET_USUARIOS', payload: usersWithHash })
      
      // Restore session if exists
      if (savedSession) {
        try {
          const sessionData = JSON.parse(savedSession)
          const user = usersWithHash.find(u => u.id === sessionData.userId)
          if (user && user.activo) {
            dispatch({ type: 'SET_USUARIO', payload: user })
          }
        } catch {
          sessionStorage.removeItem('soda_master_session')
        }
      }
      
      setIsInitialized(true)
    }

    initializeUsers()
  }, [])

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_ONLINE', payload: true })
    const handleOffline = () => dispatch({ type: 'SET_ONLINE', payload: false })

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const login = useCallback(async (email: string, pin: string): Promise<{ success: boolean; message: string }> => {
    // Import bcryptjs dynamically to avoid issues
    const { compare } = await import('bcryptjs')
    
    const user = state.usuarios.find(u => u.email.toLowerCase() === email.toLowerCase())
    
    // Generic error message for security
    const genericError = 'Credenciales incorrectas'
    
    if (!user) {
      return { success: false, message: genericError }
    }
    
    // Check if user is blocked
    if (user.bloqueadoHasta && user.bloqueadoHasta > Date.now()) {
      const remainingTime = Math.ceil((user.bloqueadoHasta - Date.now()) / 1000 / 60)
      return { 
        success: false, 
        message: `Usuario bloqueado. Intente en ${remainingTime} minutos.` 
      }
    }
    
    // Check if user is active
    if (!user.activo) {
      return { success: false, message: genericError }
    }
    
    // Verify PIN with bcrypt
    const isValid = await compare(pin, user.pinHash)
    
    if (!isValid) {
      // Increment failed attempts
      const newAttempts = user.intentosFallidos + 1
      const updatedUser: Usuario = {
        ...user,
        intentosFallidos: newAttempts,
        bloqueadoHasta: newAttempts >= 3 ? Date.now() + 5 * 60 * 1000 : null
      }
      dispatch({ type: 'UPDATE_USUARIO', payload: updatedUser })
      
      if (newAttempts >= 3) {
        return { 
          success: false, 
          message: 'Usuario bloqueado por 5 minutos debido a múltiples intentos fallidos.' 
        }
      }
      
      return { success: false, message: genericError }
    }
    
    // Reset failed attempts on successful login
    const loggedInUser: Usuario = {
      ...user,
      intentosFallidos: 0,
      bloqueadoHasta: null
    }
    
    dispatch({ type: 'UPDATE_USUARIO', payload: loggedInUser })
    dispatch({ type: 'SET_USUARIO', payload: loggedInUser })
    
    // Save session to sessionStorage
    sessionStorage.setItem('soda_master_session', JSON.stringify({ userId: user.id }))
    
    return { success: true, message: 'Inicio de sesión exitoso' }
  }, [state.usuarios])

  const logout = useCallback(() => {
    dispatch({ type: 'SET_USUARIO', payload: null })
    sessionStorage.removeItem('soda_master_session')
  }, [])

  const hasPermission = useCallback((modulo: string): boolean => {
    if (!state.usuarioActual) return false
    const allowedRoles = permisosModulo[modulo] || []
    return allowedRoles.includes(state.usuarioActual.rol)
  }, [state.usuarioActual])

  return (
    <AppContext.Provider value={{ state, dispatch, login, logout, hasPermission, isInitialized }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
