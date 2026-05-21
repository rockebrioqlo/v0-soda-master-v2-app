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
  // API functions for persistence
  updateMesa: (id: string, updates: any) => Promise<void>
  crearOrden: (orden: any) => Promise<any>
  updateOrden: (id: string, updates: any) => Promise<void>
  enviarOrdenACocina: (ordenId: string) => Promise<void>
  crearItemOrden: (item: any) => Promise<any>
  actualizarItemOrden: (id: string, updates: any) => Promise<void>
  eliminarItemOrden: (id: string) => Promise<void>
  recargarOrdenes: () => Promise<void>
  recargarMesas: () => Promise<void>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

// Helper to map DB orden to frontend Comanda format
function mapOrdenToComanda(orden: any, mesas: any[]): any {
  const mesa = mesas.find(m => m.id === orden.mesa_id)
  return {
    id: orden.id,
    mesaId: orden.mesa_id,
    mesaNombre: mesa?.nombre || `Mesa ${mesa?.numero || '?'}`,
    usuarioId: orden.usuario_id,
    estado: orden.estado,
    items: orden.items || [],
    subtotal: parseFloat(orden.subtotal) || 0,
    impuesto: parseFloat(orden.impuesto) || 0,
    total: parseFloat(orden.total) || 0,
    descuento: 0,
    propina: 0,
    notas: orden.notas || '',
    creadoAt: orden.created_at ? new Date(orden.created_at).getTime() : Date.now(),
    actualizadoAt: orden.updated_at ? new Date(orden.updated_at).getTime() : Date.now(),
    enviadoACocina: orden.enviado_a_cocina || false,
    horaEnvio: orden.hora_envio ? new Date(orden.hora_envio).getTime() : null
  }
}

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

        // Load productos from Neon - only if valid data with categories
        const productosRes = await fetch('/api/productos')
        if (productosRes.ok) {
          const productos = await productosRes.json()
          // Only update if products have proper category field (not empty array or malformed)
          if (Array.isArray(productos) && productos.length > 0 && productos[0].categoria) {
            dispatch({ type: 'SET_PRODUCTOS', payload: productos })
          }
          // Otherwise keep initialProductos from initialState
        }

        // Load mesas from Neon
        let loadedMesas: any[] = []
        const mesasRes = await fetch('/api/mesas')
        if (mesasRes.ok) {
          const mesas = await mesasRes.json()
          if (Array.isArray(mesas) && mesas.length > 0) {
            // Add nombre field if missing and normalize estado
            loadedMesas = mesas.map(m => ({
              ...m,
              nombre: m.nombre || `Mesa ${m.numero}`,
              estado: m.estado === 'disponible' ? 'libre' : m.estado
            }))
            dispatch({ type: 'SET_MESAS', payload: loadedMesas })
          }
        }

        // Load ordenes/comandas from Neon
        const ordenesRes = await fetch('/api/ordenes')
        if (ordenesRes.ok) {
          const ordenes = await ordenesRes.json()
          if (Array.isArray(ordenes) && ordenes.length > 0) {
            const comandas = ordenes.map(o => mapOrdenToComanda(o, loadedMesas))
            dispatch({ type: 'SET_COMANDAS', payload: comandas })
          }
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

  // API functions for persistence
  const updateMesa = useCallback(async (id: string, updates: any) => {
    try {
      const res = await fetch('/api/mesas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      if (res.ok) {
        const mesa = await res.json()
        dispatch({ type: 'UPDATE_MESA', payload: mesa })
      }
    } catch (error) {
      console.error('Error updating mesa:', error)
    }
  }, [])

  const recargarMesas = useCallback(async () => {
    try {
      const res = await fetch('/api/mesas')
      if (res.ok) {
        const mesas = await res.json()
        dispatch({ type: 'SET_MESAS', payload: mesas })
      }
    } catch (error) {
      console.error('Error loading mesas:', error)
    }
  }, [])

  const crearOrden = useCallback(async (orden: any) => {
    try {
      const res = await fetch('/api/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orden),
      })
      if (res.ok) {
        const newOrden = await res.json()
        dispatch({ type: 'ADD_COMANDA', payload: newOrden })
        return newOrden
      }
    } catch (error) {
      console.error('Error creating orden:', error)
    }
    return null
  }, [])

  const updateOrden = useCallback(async (id: string, updates: any) => {
    try {
      const res = await fetch('/api/ordenes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      if (res.ok) {
        const orden = await res.json()
        dispatch({ type: 'UPDATE_COMANDA', payload: orden })
      }
    } catch (error) {
      console.error('Error updating orden:', error)
    }
  }, [])

  const enviarOrdenACocina = useCallback(async (ordenId: string) => {
    try {
      const res = await fetch('/api/ordenes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ordenId, action: 'enviar_cocina' }),
      })
      if (res.ok) {
        const orden = await res.json()
        dispatch({ type: 'UPDATE_COMANDA', payload: orden })
        showToast('Orden enviada a cocina', 'success')
      }
    } catch (error) {
      console.error('Error sending to kitchen:', error)
    }
  }, [])

  const recargarOrdenes = useCallback(async () => {
    try {
      const [ordenesRes, mesasRes] = await Promise.all([
        fetch('/api/ordenes'),
        fetch('/api/mesas')
      ])
      
      if (ordenesRes.ok && mesasRes.ok) {
        const ordenes = await ordenesRes.json()
        const mesas = await mesasRes.json()
        
        if (Array.isArray(ordenes) && ordenes.length > 0) {
          const comandas = ordenes.map(o => mapOrdenToComanda(o, mesas))
          dispatch({ type: 'SET_COMANDAS', payload: comandas })
        }
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
    }
  }, [])

  const crearItemOrden = useCallback(async (item: any) => {
    try {
      const res = await fetch('/api/items-orden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (res.ok) {
        return await res.json()
      }
    } catch (error) {
      console.error('Error creating item:', error)
    }
    return null
  }, [])

  const actualizarItemOrden = useCallback(async (id: string, updates: any) => {
    try {
      await fetch('/api/items-orden', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }, [])

  const eliminarItemOrden = useCallback(async (id: string) => {
    try {
      await fetch('/api/items-orden', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch (error) {
      console.error('Error deleting item:', error)
    }
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
      clearPOSNavigation,
      updateMesa,
      crearOrden,
      updateOrden,
      enviarOrdenACocina,
      crearItemOrden,
      actualizarItemOrden,
      eliminarItemOrden,
      recargarOrdenes,
      recargarMesas,
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
