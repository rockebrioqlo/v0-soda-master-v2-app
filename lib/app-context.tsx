'use client'

import React, { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react'

import { 
  AppState, 
  AppAction, 
  Usuario,
  Rol
} from './types'
import {
  initialPermisosDescuento,
  initialConfiguracion,
} from './initial-data'
import { showToast } from '@/components/toast'

type PageType = 'dashboard' | 'mesas' | 'pos' | 'kds' | 'inventario' | 'finanzas' | 'usuarios' | 'pagos' | 'mermas' | 'reportes' | 'configuracion'

// POS navigation state
interface POSNavigationState {
  mesaId: string | null
  comandaId: string | null
}

const initialState: AppState = {
  mesas: [],
  usuarios: [],
  productos: [],
  ingredientes: [],
  comandas: [],
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
  notificaciones: [],
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
        comandas: state.comandas.map(c =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
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
    case 'SET_PAGOS':
      return { ...state, pagos: action.payload }
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
    case 'RESET_SESSION_DATA':
      return {
        ...state,
        usuarioActual: null,
        comandas: [],
        pagos: [],
        mermas: [],
        comandasNoPagadas: [],
        descuentos: [],
        conflictLog: [],
        notificaciones: [],
        sincronizando: false,
      }
    case 'ADD_NOTIFICACION':
      return { ...state, notificaciones: [...state.notificaciones, action.payload].slice(-50) }
    case 'MARCAR_NOTIFICACION_VISTA':
      return {
        ...state,
        notificaciones: state.notificaciones.map(n =>
          n.id === action.payload ? { ...n, vista: true } : n
        )
      }
    case 'LIMPIAR_NOTIFICACIONES':
      return { ...state, notificaciones: state.notificaciones.filter(n => n.vista) }
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
  crearMesaApi: (mesa: any) => Promise<any>
  eliminarMesaApi: (id: string) => Promise<boolean>
  crearOrden: (orden: any) => Promise<any>
  updateOrden: (id: string, updates: any) => Promise<void>
  enviarOrdenACocina: (ordenId: string) => Promise<void>
  crearItemOrden: (item: any) => Promise<any>
  actualizarItemOrden: (id: string, updates: any) => Promise<void>
  eliminarItemOrden: (id: string) => Promise<void>
  recargarOrdenes: () => Promise<void>
  recargarMesas: () => Promise<void>
  crearUsuarioApi: (payload: any) => Promise<any>
  actualizarUsuarioApi: (id: string, updates: any) => Promise<any>
  eliminarUsuarioApi: (id: string) => Promise<boolean>
  recargarUsuarios: () => Promise<void>
  crearPagoApi: (pago: any) => Promise<any>
  registrarPerdidaApi: (payload: {
    orden_id: string
    motivo: string
    autorizado_por: string
    autorizado_por_nombre: string
    tasa_impuesto?: number
    impuesto_habilitado?: boolean
  }) => Promise<{
    id: string
    monto_perdido: number
    cantidad_items: number
    responsable_id?: string | null
    responsable_nombre?: string | null
    responsable_rol?: string | null
  }>
  getPerdidasApi: (filtro?: { fecha?: string }) => Promise<any[]>
  resolverPerdidaApi: (payload: {
    perdida_id: string
    monto?: number
    metodo?: string
    referencia?: string | null
    resuelto_por_id: string
    resuelto_por_nombre: string
  }) => Promise<{ id: string; pago_id: string; monto: number }>
  getPermisosEspecialesApi: (filtro?: {
    usuario_id?: string
    tipo?: string
    solo_vigentes?: boolean
  }) => Promise<any[]>
  otorgarPermisoEspecialApi: (payload: {
    usuario_id: string
    tipo: string
    valido_hasta: string
    motivo?: string | null
    otorgado_por: string
    otorgado_por_nombre: string
  }) => Promise<any>
  revocarPermisoEspecialApi: (payload: {
    id: string
    revocado_por: string
    revocado_por_nombre: string
  }) => Promise<any>
  // Cuentas por persona (división por productos persistida en BD)
  getCuentasPersonaApi: (ordenId: string) => Promise<any[]>
  crearCuentaPersonaApi: (payload: { orden_id: string; nombre?: string | null }) => Promise<any>
  renombrarCuentaPersonaApi: (payload: { id: string; nombre: string | null }) => Promise<any>
  eliminarCuentaPersonaApi: (id: string) => Promise<void>
  asignarItemsACuentasApi: (payload: {
    orden_id: string
    asignaciones: Array<{
      item_orden_id: string
      cantidad: number
      cuenta_persona_id: string | null
    }>
  }) => Promise<void>
  recargarPagos: (fecha?: string) => Promise<any[]>
  cargarConfiguracion: () => Promise<Record<string, any>>
  guardarConfiguracion: (data: Record<string, any>) => Promise<boolean>
  recargarPermisosDescuento: () => Promise<void>
  guardarPermisosDescuento: (
    items: Array<{ rol: string; puede_aplicar: boolean; limite_maximo: number; requiere_motivo: boolean }>
  ) => Promise<boolean>
  crearDescuentoApi: (payload: {
    orden_id: string
    tipo: string
    valor: number
    motivo: string
    autorizado_por?: string | null
  }) => Promise<any | null>
  crearNotificacionApi: (payload: {
    tipo: 'problema' | 'listo' | 'nueva_orden'
    orden_id?: string | null
    mesa_nombre?: string | null
    mensaje: string
    destinatario_usuario_id?: string | null
    destinatario_rol?: string | null
  }) => Promise<any | null>
  marcarNotificacionVistaApi: (id: string) => Promise<void>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

// Helper to map DB orden to frontend Comanda format
function mapOrdenToComanda(orden: any, mesas: any[]): any {
  const mesa = mesas.find(m => m.id === orden.mesa_id)

  // Map Neon items_orden rows → ItemComanda shape expected by the frontend
  const rawItems: any[] = Array.isArray(orden.items) ? orden.items : []
  const mappedItems = rawItems
    .filter((i: any) => i && i.id)
    .map((i: any) => {
      let salsa = ''
      let notas = ''
      let notaEspecial = ''
      let ingredientesEspeciales: Array<{ id: string; nombre: string; costoAdicional: number }> = []
      const raw = i.notas_especiales
      if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
          const meta = JSON.parse(raw)
          salsa = meta.salsa || ''
          notas = meta.notas || ''
          notaEspecial = meta.notaEspecial || ''
          ingredientesEspeciales = Array.isArray(meta.ingredientesEspeciales)
            ? meta.ingredientesEspeciales.map((esp: any) => ({
                id: String(esp.id ?? ''),
                nombre: String(esp.nombre ?? ''),
                costoAdicional: Number(esp.costoAdicional) || 0,
              }))
            : []
        } catch {
          notas = raw
        }
      } else if (typeof raw === 'string') {
        notas = raw
      }

      return {
        id: i.id,
        productoId: i.producto_id,
        productoNombre: i.producto_nombre || i.nombre || '',
        categoria: i.categoria || '',
        cantidad: i.cantidad || 1,
        precio: parseFloat(i.precio_unitario) || 0,
        ingredientesEstandar: Array.isArray(i.modificadores) ? i.modificadores : [],
        ingredientesEspeciales,
        salsaSeleccionada: salsa,
        notas,
        notaEspecial,
        estado: i.estado_item || 'pendiente',
        pagado: i.pagado === true,
        pagoId: i.pago_id || null,
        cuentaPersonaId: i.cuenta_persona_id || null,
      }
    })

  const cuentasRaw: any[] = Array.isArray(orden.cuentas_persona)
    ? orden.cuentas_persona
    : []
  const cuentasPersona = cuentasRaw.map((c: any) => ({
    id: String(c.id),
    ordenId: orden.id,
    idx: Number(c.idx) || 0,
    nombre: c.nombre || null,
  }))

  return {
    id: orden.id,
    mesaId: orden.mesa_id,
    mesaNombre: mesa?.nombre || `Mesa ${mesa?.numero || '?'}`,
    usuarioId: orden.usuario_id,
    estado: orden.estado,
    items: mappedItems,
    subtotal: parseFloat(orden.subtotal) || 0,
    impuesto: parseFloat(orden.impuesto) || 0,
    total: parseFloat(orden.total) || 0,
    descuento: 0,
    propina: 0,
    notas: orden.notas || '',
    creadoAt: orden.created_at ? new Date(orden.created_at).getTime() : Date.now(),
    actualizadoAt: orden.updated_at ? new Date(orden.updated_at).getTime() : Date.now(),
    enviadoACocina: orden.enviado_a_cocina || false,
    horaEnvio: orden.hora_envio ? new Date(orden.hora_envio).getTime() : null,
    cuentasPersona,
  }
}

const permisosModulo: Record<string, Rol[]> = {
  dashboard: ['administrador', 'admin', 'cajero'],
  mesas: ['administrador', 'admin', 'mesero', 'cajero'],
  pos: ['administrador', 'admin', 'mesero', 'cajero'],
  kds: ['administrador', 'admin', 'cocina', 'bar'],
  inventario: ['administrador', 'admin'],
  finanzas: ['administrador', 'admin'],
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

const isRol = (rol: unknown): rol is Rol => typeof rol === 'string' && rol in defaultPageByRole

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
          if (Array.isArray(productos)) {
            dispatch({ type: 'SET_PRODUCTOS', payload: productos })
          }
        }

        // Load mesas from Neon
        let loadedMesas: any[] = []
        const mesasRes = await fetch('/api/mesas')
        if (mesasRes.ok) {
          const mesas = await mesasRes.json()
          if (Array.isArray(mesas) && mesas.length > 0) {
            // Normalize estado and ensure nombre exists
            loadedMesas = mesas.map(m => ({
              ...m,
              nombre: m.nombre || `Mesa ${m.numero || m.id}`,
              estado: m.estado === 'disponible' ? 'libre' : (m.estado || 'libre')
            }))
            dispatch({ type: 'SET_MESAS', payload: loadedMesas })
          }
        }

        // Load ordenes/comandas from Neon — use ?kds=true to get items via JOIN
        const ordenesRes = await fetch('/api/ordenes?kds=true')
        if (ordenesRes.ok) {
          const ordenes = await ordenesRes.json()
          if (Array.isArray(ordenes)) {
            const comandas = ordenes
              .map((o: any) => mapOrdenToComanda(o, loadedMesas))
              // Never load a comanda with 0 items — it is corrupted/incomplete data
              .filter((c: any) => c.items.length > 0)
            dispatch({ type: 'SET_COMANDAS', payload: comandas })

            // NOTA: ya no auto-liberamos mesas. Una mesa marcada como ocupada
            // en la BD se respeta hasta que el mesero/admin la libere a mano,
            // incluso si su comanda ya fue pagada. Esto coincide con el flujo
            // real (los clientes pueden seguir en la mesa después de pagar).
          }
        }

        try {
          const permisosRes = await fetch('/api/permisos-descuento')
          if (permisosRes.ok) {
            const permisosData = await permisosRes.json()
            if (Array.isArray(permisosData)) {
              const permisos = { ...initialPermisosDescuento }
              for (const item of permisosData) {
                const rol = String(item.rol) as Rol
                permisos[rol] = {
                  puede: !!item.puede_aplicar,
                  limiteMax: Number(item.limite_maximo) || 0,
                  requiereMotivo: !!item.requiere_motivo,
                }
              }
              if (!permisos.administrador) permisos.administrador = permisos.admin
              if (!permisos.admin) permisos.admin = permisos.administrador
              dispatch({ type: 'SET_PERMISOS_DESCUENTO', payload: permisos })
            }
          }
        } catch {}

        // Restore session if exists
        const savedSession = sessionStorage.getItem('soda_master_session')
        if (savedSession) {
          try {
            const sessionData = JSON.parse(savedSession)
            const usuariosRes = await fetch('/api/usuarios')
            const usuarios = await usuariosRes.json()
            const user = usuarios.find((u: any) => u.id === sessionData.userId)
            if (user && user.activo) {
              const userRole: unknown = user.rol
              dispatch({ type: 'SET_USUARIO', payload: user })
              setCurrentPage(sessionData.currentPage || (isRol(userRole) ? defaultPageByRole[userRole] : 'dashboard'))
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
      void recargarPermisosDescuento()
      
      // Set default page based on role
      const usuarioRole: unknown = usuario.rol
      const defaultPage = isRol(usuarioRole) ? defaultPageByRole[usuarioRole] : 'dashboard'
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
    dispatch({ type: 'RESET_SESSION_DATA' })
    setPosNavigation({ mesaId: null, comandaId: null })
    setCurrentPage('dashboard')
    sessionStorage.removeItem('soda_master_session')
  }, [])

  useEffect(() => {
    if (!state.usuarioActual) return
    let cancelled = false

    const verifyActiveUser = async () => {
      try {
        const res = await fetch('/api/usuarios', { cache: 'no-store' })
        if (!res.ok) return
        const usuarios = await res.json()
        if (!Array.isArray(usuarios) || cancelled) return
        const current = usuarios.find((u: any) => u.id === state.usuarioActual?.id)
        if (!current || current.activo === false) {
          showToast('Tu usuario fue desactivado. Sesión cerrada.', 'error')
          logout()
        }
      } catch {
        // If the network fails, keep the current session and let API errors surface.
      }
    }

    window.addEventListener('focus', verifyActiveUser)
    const interval = window.setInterval(verifyActiveUser, 60000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', verifyActiveUser)
      window.clearInterval(interval)
    }
  }, [state.usuarioActual, logout])

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
        const mesasNormalizadas = mesas.map((m: any) => ({
          ...m,
          nombre: m.nombre || `Mesa ${m.numero || m.id}`,
          estado: m.estado === 'disponible' ? 'libre' : (m.estado || 'libre')
        }))
        dispatch({ type: 'SET_MESAS', payload: mesasNormalizadas })
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
        // Don't dispatch ADD_COMANDA here — pos-page.tsx manages comanda state
        // after getting back the Neon id and doing UPDATE_COMANDA itself
        return newOrden
      }
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Error al crear orden')
    } catch (error) {
      console.error('Error creating orden:', error)
      if (error instanceof Error) {
        showToast(error.message, 'error')
      }
      throw error
    }
  }, [])

  const updateOrden = useCallback(async (id: string, updates: any) => {
    const res = await fetch('/api/ordenes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const msg = data?.error || `Error ${res.status} actualizando orden`
      console.error('Error updating orden:', msg, data)
      throw new Error(msg)
    }
    dispatch({
      type: 'UPDATE_COMANDA',
      payload: { id, ...updates } as any,
    })
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
      // Use ?kds=true so the API returns ordenes with items via JOIN
      const [ordenesRes, mesasRes] = await Promise.all([
        fetch('/api/ordenes?kds=true'),
        fetch('/api/mesas')
      ])

      if (ordenesRes.ok && mesasRes.ok) {
        const ordenes = await ordenesRes.json()
        const mesas = await mesasRes.json()

        if (Array.isArray(ordenes)) {
          const comandas = ordenes
            .map((o: any) => mapOrdenToComanda(o, mesas))
            .filter((c: any) => c.items.length > 0)
          const mesasConComandaRemota = new Set(comandas.map((c: any) => c.mesaId))
          const comandasLocalesPendientes = state.comandas.filter(
            (c: any) =>
              c.estado === 'pendiente' &&
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.id) &&
              !mesasConComandaRemota.has(c.mesaId)
          )
          dispatch({ type: 'SET_COMANDAS', payload: [...comandasLocalesPendientes, ...comandas] })
        }
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
    }
  }, [state.comandas])

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
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Error al crear item')
    } catch (error) {
      console.error('Error creating item:', error)
      if (error instanceof Error) {
        showToast(error.message, 'error')
      }
      throw error
    }
  }, [])

  const actualizarItemOrden = useCallback(async (id: string, updates: any) => {
    const res = await fetch('/api/items-orden', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const msg = data?.error || `Error ${res.status} actualizando ítem`
      console.error('Error updating item:', msg, data)
      throw new Error(msg)
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

  const recargarUsuarios = useCallback(async () => {
    try {
      const res = await fetch('/api/usuarios')
      if (res.ok) {
        const usuarios = await res.json()
        if (Array.isArray(usuarios)) {
          dispatch({ type: 'SET_USUARIOS', payload: usuarios as Usuario[] })
        }
      }
    } catch (error) {
      console.error('Error loading usuarios:', error)
    }
  }, [])

  const crearUsuarioApi = useCallback(async (payload: any) => {
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al crear usuario')
    }
    const usuario = await res.json()
    dispatch({ type: 'ADD_USUARIO', payload: usuario })
    return usuario
  }, [])

  const actualizarUsuarioApi = useCallback(async (id: string, updates: any) => {
    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al actualizar usuario')
    }
    const usuario = await res.json()
    dispatch({ type: 'UPDATE_USUARIO', payload: usuario })
    return usuario
  }, [])

  const eliminarUsuarioApi = useCallback(async (id: string) => {
    const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al eliminar usuario')
    }
    dispatch({ type: 'DELETE_USUARIO', payload: id })
    return true
  }, [])

  const crearMesaApi = useCallback(async (mesa: any) => {
    const res = await fetch('/api/mesas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mesa),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al crear mesa')
    }
    const nueva = await res.json()
    dispatch({ type: 'ADD_MESA', payload: nueva })
    return nueva
  }, [])

  const eliminarMesaApi = useCallback(async (id: string) => {
    const res = await fetch(`/api/mesas/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al eliminar mesa')
    }
    dispatch({ type: 'DELETE_MESA', payload: id })
    return true
  }, [])

  const crearPagoApi = useCallback(async (pago: any) => {
    const res = await fetch('/api/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pago),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al registrar pago')
    }
    return await res.json()
  }, [])

  const registrarPerdidaApi = useCallback(async (payload: {
    orden_id: string
    motivo: string
    autorizado_por: string
    autorizado_por_nombre: string
    tasa_impuesto?: number
    impuesto_habilitado?: boolean
  }) => {
    const res = await fetch('/api/perdidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al registrar la pérdida')
    }
    return (await res.json()) as {
      id: string
      monto_perdido: number
      cantidad_items: number
      responsable_id?: string | null
      responsable_nombre?: string | null
      responsable_rol?: string | null
    }
  }, [])

  const getPerdidasApi = useCallback(async (filtro?: { fecha?: string }) => {
    const url = filtro?.fecha
      ? `/api/perdidas?fecha=${encodeURIComponent(filtro.fecha)}`
      : '/api/perdidas'
    const res = await fetch(url)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al cargar pérdidas')
    }
    const json = await res.json()
    return Array.isArray(json) ? json : []
  }, [])

  const getPermisosEspecialesApi = useCallback(async (filtro?: {
    usuario_id?: string
    tipo?: string
    solo_vigentes?: boolean
  }) => {
    const params = new URLSearchParams()
    if (filtro?.usuario_id) params.set('usuario_id', filtro.usuario_id)
    if (filtro?.tipo) params.set('tipo', filtro.tipo)
    if (filtro?.solo_vigentes) params.set('solo_vigentes', 'true')
    const qs = params.toString()
    const res = await fetch(qs ? `/api/permisos-especiales?${qs}` : '/api/permisos-especiales')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al cargar permisos especiales')
    }
    const json = await res.json()
    return Array.isArray(json) ? json : []
  }, [])

  const otorgarPermisoEspecialApi = useCallback(async (payload: {
    usuario_id: string
    tipo: string
    valido_hasta: string
    motivo?: string | null
    otorgado_por: string
    otorgado_por_nombre: string
  }) => {
    const res = await fetch('/api/permisos-especiales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al otorgar permiso')
    }
    return await res.json()
  }, [])

  const revocarPermisoEspecialApi = useCallback(async (payload: {
    id: string
    revocado_por: string
    revocado_por_nombre: string
  }) => {
    const res = await fetch('/api/permisos-especiales', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al revocar permiso')
    }
    return await res.json()
  }, [])

  // --- Cuentas por persona (BD) ---
  const getCuentasPersonaApi = useCallback(async (ordenId: string) => {
    const res = await fetch(`/api/cuentas-persona?orden_id=${encodeURIComponent(ordenId)}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al cargar personas')
    }
    const json = await res.json()
    return Array.isArray(json) ? json : []
  }, [])

  const crearCuentaPersonaApi = useCallback(async (payload: {
    orden_id: string
    nombre?: string | null
  }) => {
    const res = await fetch('/api/cuentas-persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al crear persona')
    }
    return await res.json()
  }, [])

  const renombrarCuentaPersonaApi = useCallback(async (payload: {
    id: string
    nombre: string | null
  }) => {
    const res = await fetch('/api/cuentas-persona', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al renombrar persona')
    }
    return await res.json()
  }, [])

  const eliminarCuentaPersonaApi = useCallback(async (id: string) => {
    const res = await fetch('/api/cuentas-persona', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al eliminar persona')
    }
  }, [])

  const asignarItemsACuentasApi = useCallback(async (payload: {
    orden_id: string
    asignaciones: Array<{
      item_orden_id: string
      cantidad: number
      cuenta_persona_id: string | null
    }>
  }) => {
    const res = await fetch('/api/cuentas-persona/asignaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al asignar items')
    }
  }, [])

  const resolverPerdidaApi = useCallback(async (payload: {
    perdida_id: string
    monto?: number
    metodo?: string
    referencia?: string | null
    resuelto_por_id: string
    resuelto_por_nombre: string
  }) => {
    const res = await fetch('/api/perdidas/resolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Error al cobrar retroactivamente')
    }
    return (await res.json()) as { id: string; pago_id: string; monto: number }
  }, [])

  const recargarPagos = useCallback(async (fecha?: string) => {
    try {
      const url = fecha ? `/api/pagos?fecha=${encodeURIComponent(fecha)}` : '/api/pagos'
      const res = await fetch(url)
      if (!res.ok) return []
      const pagos = await res.json()
      if (Array.isArray(pagos)) {
        dispatch({ type: 'SET_PAGOS', payload: pagos as any })
      }
      return Array.isArray(pagos) ? pagos : []
    } catch (error) {
      console.error('Error loading pagos:', error)
      return []
    }
  }, [])

  const cargarConfiguracion = useCallback(async () => {
    try {
      const res = await fetch('/api/configuracion')
      if (!res.ok) return {}
      const data = await res.json()
      if (data && typeof data === 'object') {
        dispatch({ type: 'SET_CONFIGURACION', payload: data as any })
      }
      return data || {}
    } catch (error) {
      console.error('Error loading configuracion:', error)
      return {}
    }
  }, [])

  const recargarPermisosDescuento = useCallback(async () => {
    try {
      const res = await fetch('/api/permisos-descuento', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data)) return
      const permisos = { ...initialPermisosDescuento }
      for (const item of data) {
        const rol = String(item.rol) as Rol
        permisos[rol] = {
          puede: !!item.puede_aplicar,
          limiteMax: Number(item.limite_maximo) || 0,
          requiereMotivo: !!item.requiere_motivo,
        }
      }
      if (!permisos.administrador) permisos.administrador = permisos.admin
      if (!permisos.admin) permisos.admin = permisos.administrador
      dispatch({ type: 'SET_PERMISOS_DESCUENTO', payload: permisos })
    } catch (error) {
      console.error('Error loading permisos-descuento:', error)
    }
  }, [])

  const guardarPermisosDescuento = useCallback(
    async (
      items: Array<{ rol: string; puede_aplicar: boolean; limite_maximo: number; requiere_motivo: boolean }>
    ) => {
      const usuarioId = state.usuarioActual?.id
      if (!usuarioId) return false
      try {
        const res = await fetch('/api/permisos-descuento', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario_id: usuarioId, permisos: items }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          showToast(err?.error || 'Error al guardar permisos', 'error')
          return false
        }
        await recargarPermisosDescuento()
        return true
      } catch (error) {
        console.error('Error saving permisos-descuento:', error)
        return false
      }
    },
    [state.usuarioActual?.id, recargarPermisosDescuento]
  )

  const crearDescuentoApi = useCallback(
    async (payload: { orden_id: string; tipo: string; valor: number; motivo: string; autorizado_por?: string | null }) => {
      const usuarioId = state.usuarioActual?.id
      if (!usuarioId) return null
      try {
        const res = await fetch('/api/descuentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, aplicado_por: usuarioId }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          showToast(data?.error || 'Error al aplicar descuento', 'error')
          return null
        }
        return data
      } catch (error) {
        console.error('Error creating descuento:', error)
        return null
      }
    },
    [state.usuarioActual?.id]
  )

  // ── Notificaciones cross-device ────────────────────────────────────────────
  // Cuando cocina marca "problema" o "listo", se persiste en BD una
  // notificación dirigida al mesero dueño de la orden. Este cliente hace
  // polling cada N segundos para traer las pendientes y dispatcharlas, así
  // el toast aparece aunque el mesero esté en otra pestaña/dispositivo.

  const crearNotificacionApi = useCallback(
    async (payload: {
      tipo: 'problema' | 'listo' | 'nueva_orden'
      orden_id?: string | null
      mesa_nombre?: string | null
      mensaje: string
      destinatario_usuario_id?: string | null
      destinatario_rol?: string | null
    }) => {
      try {
        const res = await fetch('/api/notificaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          console.error('Error creating notificacion:', data?.error)
          return null
        }
        return await res.json()
      } catch (error) {
        console.error('Error creating notificacion:', error)
        return null
      }
    },
    [],
  )

  const marcarNotificacionVistaApi = useCallback(async (id: string) => {
    dispatch({ type: 'MARCAR_NOTIFICACION_VISTA', payload: id })
    // Las notificaciones locales (ej. fallback antiguo) usan ids "notif_<ts>"
    // que no son UUID válidos. Sólo persistimos las que vienen de la BD.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(id)) return
    try {
      await fetch(`/api/notificaciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vista: true }),
      })
    } catch (error) {
      console.error('Error marking notificacion vista:', error)
    }
  }, [])

  // Polling de notificaciones para el usuario activo.
  useEffect(() => {
    const usuario = state.usuarioActual
    if (!usuario?.id) return
    let cancelled = false
    let running = false
    const knownIds = new Set<string>()

    const fetchNotificaciones = async () => {
      if (cancelled || running) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      running = true
      try {
        const params = new URLSearchParams()
        params.set('usuario_id', usuario.id)
        if (usuario.rol) params.set('rol', usuario.rol)
        params.set('solo_pendientes', 'true')
        const res = await fetch(`/api/notificaciones?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const rows = await res.json()
        if (!Array.isArray(rows) || cancelled) return
        for (const row of rows) {
          if (!row?.id || knownIds.has(row.id)) continue
          knownIds.add(row.id)
          dispatch({
            type: 'ADD_NOTIFICACION',
            payload: {
              id: String(row.id),
              tipo: row.tipo,
              ordenId: row.orden_id || '',
              mesaNombre: row.mesa_nombre || '',
              mensaje: row.mensaje || '',
              timestamp: Number(row.creado_ts) || Date.now(),
              vista: false,
            },
          })
        }
      } catch {
        // silenciar para no spamear la consola en redes inestables
      } finally {
        running = false
      }
    }

    void fetchNotificaciones()
    const interval = window.setInterval(fetchNotificaciones, 10000)
    const onFocus = () => fetchNotificaciones()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [state.usuarioActual])

  const guardarConfiguracion = useCallback(async (data: Record<string, any>) => {
    try {
      const res = await fetch('/api/configuracion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}))
        throw new Error(errPayload?.error || 'Error al guardar configuración')
      }
      const updated = await res.json()
      if (updated && typeof updated === 'object') {
        dispatch({ type: 'SET_CONFIGURACION', payload: updated as any })
      }
      return true
    } catch (error) {
      console.error('Error saving configuracion:', error)
      return false
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
      crearMesaApi,
      eliminarMesaApi,
      crearOrden,
      updateOrden,
      enviarOrdenACocina,
      crearItemOrden,
      actualizarItemOrden,
      eliminarItemOrden,
      recargarOrdenes,
      recargarMesas,
      crearUsuarioApi,
      actualizarUsuarioApi,
      eliminarUsuarioApi,
      recargarUsuarios,
      crearPagoApi,
      registrarPerdidaApi,
      getPerdidasApi,
      resolverPerdidaApi,
      getPermisosEspecialesApi,
      otorgarPermisoEspecialApi,
      revocarPermisoEspecialApi,
      getCuentasPersonaApi,
      crearCuentaPersonaApi,
      renombrarCuentaPersonaApi,
      eliminarCuentaPersonaApi,
      asignarItemsACuentasApi,
      recargarPagos,
      cargarConfiguracion,
      guardarConfiguracion,
      recargarPermisosDescuento,
      guardarPermisosDescuento,
      crearDescuentoApi,
      crearNotificacionApi,
      marcarNotificacionVistaApi,
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
