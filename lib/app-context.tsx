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
import { showToast } from '@/components/toast'

type PageType = 'dashboard' | 'mesas' | 'pos' | 'kds' | 'inventario' | 'usuarios' | 'pagos' | 'mermas' | 'reportes' | 'configuracion'

// POS navigation state
interface POSNavigationState {
  mesaId: string | null
  comandaId: string | null
}

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
  currentPage: PageType
  setCurrentPage: (page: PageType) => void
  navigateTo: (page: PageType) => void
  posNavigation: POSNavigationState
  navigateToPOS: (mesaId: string, comandaId?: string) => void
  clearPOSNavigation: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

// Permission matrix by role
const permisosModulo: Record<string, Rol[]> = {
  dashboard: ['administrador', 'admin', 'cajero'],
  mesas: ['administrador', 'admin', 'mesero', 'cajero'],
  pos: ['administrador', 'admin', 'mesero', 'cajero'],
  kds: ['administrador', 'admin', 'cocina', 'bar'],
  inventario: ['administrador', 'admin'],
  usuarios: ['administrador', 'admin'],
  pagos: ['administrador', 'admin', 'cajero'],
  mermas: ['administrador', 'admin', 'mesero', 'cocina', 'bar'],
  reportes: ['administrador', 'admin', 'cajero'],
  configuracion: ['administrador', 'admin'],
}

// Default pages by role
const defaultPageByRole: Record<Rol, PageType> = {
  administrador: 'dashboard',
  admin: 'dashboard',
  cajero: 'mesas',
  mesero: 'mesas',
  cocina: 'kds',
  bar: 'kds',
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [isInitialized, setIsInitialized] = useState(false)
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard')
  const [posNavigation, setPosNavigation] = useState<POSNavigationState>({ mesaId: null, comandaId: null })

  // Initialize database and users from Neon
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        // Initialize seed data
        await fetch('/api/seed', { method: 'POST' })

        // Load usuarios from Neon
        const usuariosRes = await fetch('/api/usuarios')
        if (usuariosRes.ok) {
          const usuarios = await usuariosRes.json()
          dispatch({ type: 'SET_USUARIOS', payload: usuarios })
        }

        // Load productos from Neon
        const productosRes = await fetch('/api/productos')
        if (productosRes.ok) {
          const productos = await productosRes.json()
          dispatch({ type: 'SET_PRODUCTOS', payload: productos })
        }

        // Load mesas from Neon
        const mesasRes = await fetch('/api/mesas')
        if (mesasRes.ok) {
          const mesas = await mesasRes.json()
          dispatch({ type: 'SET_MESAS', payload: mesas })
        }

        // Restore session if exists
        const savedSession = sessionStorage.getItem('soda_master_session')
        if (savedSession) {
          try {
            const sessionData = JSON.parse(savedSession)
            const usuariosRes = await fetch('/api/usuarios')
            const usuarios = await usuariosRes.json()
            const user = usuarios.find((u: any) => u.id === sessionData.userId)
            if (user && user.activo) {
              dispatch({ type: 'SET_USUARIO', payload: user })
              setCurrentPage(sessionData.currentPage || defaultPageByRole[user.rol])
            }
          } catch {
            sessionStorage.removeItem('soda_master_session')
          }
        }
      } catch (error) {
        console.error('Database initialization error:', error)
      }

      setIsInitialized(true)
    }

    initializeDatabase()
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

  // Save session when page changes
  useEffect(() => {
    if (state.usuarioActual) {
      sessionStorage.setItem('soda_master_session', JSON.stringify({
        userId: state.usuarioActual.id,
        currentPage
      }))
    }
  }, [currentPage, state.usuarioActual])

  const login = useCallback(async (email: string, pin: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin }),
      })

      if (!response.ok) {
        return { success: false, message: 'Credenciales inválidas' }
      }

      const usuario = await response.json()
      dispatch({ type: 'UPDATE_USUARIO', payload: { ...usuario, intentosFallidos: 0, bloqueadoHasta: null } })
      dispatch({ type: 'SET_USUARIO', payload: usuario })
      
      // Set default page based on role
      const defaultPage = defaultPageByRole[usuario.rol]
      setCurrentPage(defaultPage)
      
      // Save session to sessionStorage
      sessionStorage.setItem('soda_master_session', JSON.stringify({ 
        userId: usuario.id,
        currentPage: defaultPage
      }))
      
      return { success: true, message: 'Inicio de sesión exitoso' }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: 'Error en servidor' }
    }
  }, [])

  const logout = useCallback(() => {
    dispatch({ type: 'SET_USUARIO', payload: null })
    setCurrentPage('dashboard')
    sessionStorage.removeItem('soda_master_session')
  }, [])

  const hasPermission = useCallback((modulo: string): boolean => {
    if (!state.usuarioActual) return false
    const allowedRoles = permisosModulo[modulo] || []
    return allowedRoles.includes(state.usuarioActual.rol)
  }, [state.usuarioActual])

  const navigateTo = useCallback((page: PageType) => {
    if (hasPermission(page)) {
      setCurrentPage(page)
    } else {
      showToast('No tienes permisos para acceder a esta sección', 'error')
    }
  }, [hasPermission])

  const navigateToPOS = useCallback((mesaId: string, comandaId?: string) => {
    if (hasPermission('pos')) {
      setPosNavigation({ mesaId, comandaId: comandaId || null })
      setCurrentPage('pos')
    } else {
      showToast('No tienes permisos para acceder al POS', 'error')
    }
  }, [hasPermission])

  const clearPOSNavigation = useCallback(() => {
    setPosNavigation({ mesaId: null, comandaId: null })
  }, [])

  return (
    <AppContext.Provider value={{ 
      state, 
      dispatch, 
      login, 
      logout, 
      hasPermission, 
      isInitialized,
      currentPage,
      setCurrentPage,
      navigateTo,
      posNavigation,
      navigateToPOS,
      clearPOSNavigation
    }}>
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
