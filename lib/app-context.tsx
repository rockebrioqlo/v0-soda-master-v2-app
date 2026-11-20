'use client'

import React, { createContext, useContext, useReducer, useEffect, useState, useCallback, useRef } from 'react'

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
import { errorDeRespuesta } from '@/lib/api-error'
import { enPausaPorLimite, registrarLimite, segundosDePausa } from '@/lib/pausa-limite'

type PageType = 'dashboard' | 'mesas' | 'pos' | 'kds' | 'inventario' | 'finanzas' | 'usuarios' | 'pagos' | 'caja' | 'mermas' | 'reportes' | 'configuracion'

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
    case 'SET_USUARIOS': {
      // Si el usuario logueado figura en la nueva lista, refrescamos
      // sus datos (nombre, rol, roles_adicionales, activo). De lo
      // contrario, los cambios hechos por el admin no se reflejan
      // hasta cerrar/abrir sesión, y eso es lo que hace que cambiar
      // el nombre/rol "parezca romper" cosas.
      const nuevaLista = action.payload
      const refrescado = state.usuarioActual
        ? nuevaLista.find((u) => u.id === state.usuarioActual!.id)
        : null
      return {
        ...state,
        usuarios: nuevaLista,
        usuarioActual: refrescado
          ? { ...state.usuarioActual!, ...refrescado }
          : state.usuarioActual,
      }
    }
    case 'ADD_USUARIO':
      return { ...state, usuarios: [...state.usuarios, action.payload] }
    case 'UPDATE_USUARIO': {
      // Mismo razonamiento: si están editando al usuario que está
      // logueado, hay que reflejarlo en usuarioActual o pierde los
      // permisos hasta cerrar sesión.
      const actualizado = action.payload
      return {
        ...state,
        usuarios: state.usuarios.map((u) => (u.id === actualizado.id ? actualizado : u)),
        usuarioActual:
          state.usuarioActual && state.usuarioActual.id === actualizado.id
            ? { ...state.usuarioActual, ...actualizado }
            : state.usuarioActual,
      }
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
  enviarComandaApi: (payload: any) => Promise<{ orden: any; items: any[] }>
  crearItemOrden: (item: any) => Promise<any>
  actualizarItemOrden: (id: string, updates: any) => Promise<any>
  eliminarItemOrden: (id: string) => Promise<{ orden_cerrada: boolean }>
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
    motivo?: string | null
  }) => Promise<{
    id: string
    pago_id: string
    monto: number
    monto_registrado: number
    monto_condonado: number
  }>
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
    autorizacion?: string | null
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

// Cadencia del sondeo central (sesión 10, P6): KDS 6 s ≈ 10 peticiones/min; resto 15 s ≈ 4/min;
// pestaña oculta 1/min. Tope del servidor: 240/min por sesión.
const SONDEO_KDS_MS = 6_000
const SONDEO_GENERAL_MS = 15_000
const SONDEO_OCULTO_MS = 60_000
const SONDEO_ESPACIO_MIN_MS = 2_000

const UUID_RE_COMANDA = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Comandas del servidor + las pendientes que solo existen en este navegador (id no UUID) y
// cuya mesa aún no tiene comanda remota. Lo comparten `recargarOrdenes` y el sondeo central.
function fusionarComandas(ordenes: any[], mesas: any[], comandasActuales: any[]): any[] {
  const comandas = ordenes
    .map((o: any) => mapOrdenToComanda(o, mesas))
    .filter((c: any) => c.items.length > 0)
  const mesasConComandaRemota = new Set(comandas.map((c: any) => c.mesaId))
  const comandasLocalesPendientes = comandasActuales.filter(
    (c: any) =>
      c.estado === 'pendiente' &&
      !UUID_RE_COMANDA.test(c.id) &&
      !mesasConComandaRemota.has(c.mesaId)
  )
  return [...comandasLocalesPendientes, ...comandas]
}

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
    // El descuento vive en la tabla `descuentos`; el servidor lo une a la
    // orden (descuento_tipo / descuento_valor) para que cualquier pantalla,
    // también tras recargar, vea el mismo descuento que usa el cobro.
    descuento: Number(orden.descuento_valor) || 0,
    tipoDescuento: orden.descuento_tipo || null,
    motivoDescuento: orden.descuento_motivo || undefined,
    descuentoDado: Number(orden.descuento_dado) || 0,
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
  caja: ['administrador', 'admin', 'cajero'],
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

  // Sesión 10 (A4): copia viva de las comandas para que `recargarOrdenes` y el sondeo central las
  // lean sin depender de `state.comandas` (que cambia con cada respuesta).
  const comandasRef = useRef(state.comandas)
  useEffect(() => {
    comandasRef.current = state.comandas
  }, [state.comandas])

  // Carga los datos de la app desde Neon. Desde la sesión 3 la API exige
  // sesión, así que se llama después de restaurar la sesión (cookie) o de
  // un login correcto, nunca antes.
  const cargarDatosApp = useCallback(async () => {
      try {
        // Ya no se llama POST /api/seed en cada carga (sesión 2, R6).
        // Una base vacía se inicializa a mano: ver README, "Base de datos vacía".

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

      } catch (error) {
        console.error('Error cargando datos:', error)
      }
  }, [])

  // Al cargar: la sesión vive en una cookie httpOnly del servidor
  // (sesión 3). sessionStorage solo recuerda la página abierta.
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        const res = await fetch('/api/auth/sesion', { cache: 'no-store' })
        if (res.ok) {
          const user = await res.json()
          dispatch({ type: 'SET_USUARIO', payload: user })
          let paginaGuardada: PageType | null = null
          try {
            paginaGuardada = JSON.parse(sessionStorage.getItem('soda_master_session') || 'null')?.currentPage ?? null
          } catch {
            paginaGuardada = null
          }
          const userRole: unknown = user.rol
          setCurrentPage(paginaGuardada || (isRol(userRole) ? defaultPageByRole[userRole] : 'dashboard'))
          await cargarDatosApp()
        }
      } catch (error) {
        console.error('Database initialization error:', error)
      }

      setIsInitialized(true)
    }

    initializeDatabase()
  }, [cargarDatosApp])

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
      sessionStorage.setItem('soda_master_session', JSON.stringify({ currentPage }))
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
        const data = await response.json().catch(() => null)
        // 429 = bloqueo temporal por PIN fallidos (el mensaje dice cuánto falta).
        if (response.status === 429 && data?.error) {
          return { success: false, message: String(data.error) }
        }
        return { success: false, message: 'Credenciales inválidas' }
      }

      // El servidor dejó la cookie de sesión httpOnly; acá solo llega el usuario.
      const usuario = await response.json()
      dispatch({ type: 'UPDATE_USUARIO', payload: { ...usuario, intentosFallidos: 0, bloqueadoHasta: null } })
      dispatch({ type: 'SET_USUARIO', payload: usuario })
      void recargarPermisosDescuento()
      
      // Set default page based on role
      const usuarioRole: unknown = usuario.rol
      const defaultPage = isRol(usuarioRole) ? defaultPageByRole[usuarioRole] : 'dashboard'
      setCurrentPage(defaultPage)
      
      sessionStorage.setItem('soda_master_session', JSON.stringify({ currentPage: defaultPage }))
      await cargarDatosApp()

      return { success: true, message: 'Inicio de sesión exitoso' }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: 'Error en servidor' }
    }
  }, [cargarDatosApp])

  const logout = useCallback(() => {
    // Revoca la sesión en el servidor y borra la cookie.
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    dispatch({ type: 'RESET_SESSION_DATA' })
    setPosNavigation({ mesaId: null, comandaId: null })
    setCurrentPage('dashboard')
    sessionStorage.removeItem('soda_master_session')
  }, [])

  const usuarioActualId = state.usuarioActual?.id ?? null
  useEffect(() => {
    if (!usuarioActualId) return
    let cancelled = false

    // La sesión vive en el servidor: si /api/auth/sesion responde 401
    // (sesión revocada, vencida o usuario desactivado) se vuelve al login.
    // Errores de red no cierran la sesión.
    const verifyActiveUser = async () => {
      if (enPausaPorLimite()) return
      try {
        const res = await fetch('/api/auth/sesion', { cache: 'no-store' })
        if (cancelled) return
        if (res.status === 401) {
          console.warn('[auth] Sesión cerrada por el servidor', { id: usuarioActualId })
          showToast('Tu sesión se cerró (venció o ingresaste desde otro dispositivo). Vuelve a ingresar.', 'error')
          logout()
        }
      } catch {
        // Silencioso: si la red falla, mantenemos la sesión.
      }
    }

    window.addEventListener('focus', verifyActiveUser)
    // Sesión 10: con la pestaña oculta no se pide (el sondeo central ya autentica y cualquier 401
    // cierra la sesión); al volver a la pestaña, `focus` lo revisa.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void verifyActiveUser()
    }, 60000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', verifyActiveUser)
      window.clearInterval(interval)
    }
  }, [usuarioActualId, logout])

  // Si cualquier llamada a la API responde 401 (sesión vencida o
  // revocada), se vuelve al login una sola vez.
  const sesionActivaRef = useRef(false)
  const logoutRef = useRef(logout)
  useEffect(() => {
    sesionActivaRef.current = !!usuarioActualId
    logoutRef.current = logout
  }, [usuarioActualId, logout])
  useEffect(() => {
    const fetchOriginal = window.fetch
    const fetchConSesion: typeof window.fetch = async (input, init) => {
      const res = await fetchOriginal(input, init)
      if (res.status === 401 && sesionActivaRef.current) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        let ruta = url
        try {
          ruta = new URL(url, window.location.origin).pathname
        } catch {}
        if (ruta.startsWith('/api/') && !ruta.startsWith('/api/auth/')) {
          sesionActivaRef.current = false
          showToast('Tu sesión se cerró (venció o ingresaste desde otro dispositivo). Vuelve a ingresar.', 'error')
          logoutRef.current()
        }
      }
      // 429 del límite general de la API (sesión 4): aviso único y se
      // pausan los sondeos hasta que pase el Retry-After. No se reintentan
      // escrituras solas. El 429 del login (/api/auth/) tiene su propio mensaje.
      if (res.status === 429) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        let ruta = url
        try {
          ruta = new URL(url, window.location.origin).pathname
        } catch {}
        if (ruta.startsWith('/api/') && !ruta.startsWith('/api/auth/')) {
          const seg = Number(res.headers.get('Retry-After'))
          if (registrarLimite(seg)) {
            showToast(`Muchas peticiones seguidas. Espera ${segundosDePausa()} s e intenta de nuevo.`, 'error')
          }
        }
      }
      return res
    }
    window.fetch = fetchConSesion
    return () => {
      window.fetch = fetchOriginal
    }
  }, [])

  const hasPermission = useCallback((modulo: string): boolean => {
    if (!state.usuarioActual) return false
    const allowedRoles = permisosModulo[modulo] || []
    if (allowedRoles.includes(state.usuarioActual.rol)) return true
    // Roles adicionales permanentes: si están configurados, también
    // habilitan el módulo. Ej: un cocinero con rol adicional `cajero`
    // puede entrar a Pagos sin necesidad de permiso especial temporal.
    const extras = state.usuarioActual.roles_adicionales || []
    return extras.some((r) => allowedRoles.includes(r as Rol))
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

  // Falla con `ErrorApi` (mensaje real, estado y código del servidor): quien
  // llama decide el aviso (el POS muestra uno accionable si falta el permiso).
  const crearOrden = useCallback(async (orden: any) => {
    const res = await fetch('/api/ordenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orden),
    })
    if (!res.ok) throw await errorDeRespuesta(res, 'Error al crear orden')
    // Don't dispatch ADD_COMANDA here — pos-page.tsx manages comanda state
    // after getting back the Neon id and doing UPDATE_COMANDA itself
    return await res.json()
  }, [])

  const updateOrden = useCallback(async (id: string, updates: any) => {
    const res = await fetch('/api/ordenes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const err = await errorDeRespuesta(res, 'No se pudo actualizar la orden')
      console.error('Error updating orden:', err.message)
      throw err
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
      if (!res.ok) throw await errorDeRespuesta(res, 'No se pudo enviar la orden a cocina')
      const orden = await res.json()
      dispatch({ type: 'UPDATE_COMANDA', payload: orden })
      showToast('Orden enviada a cocina', 'success')
    } catch (error) {
      console.error('Error sending to kitchen:', error)
      showToast(error instanceof Error ? error.message : 'No se pudo enviar la orden a cocina', 'error')
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
          dispatch({ type: 'SET_COMANDAS', payload: fusionarComandas(ordenes, mesas, comandasRef.current) })
        }
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
    }
    // Sesión 10 (A4): estable. Lee las comandas actuales desde `comandasRef`; si dependiera de
    // `state.comandas`, cada respuesta cambiaría la función y reiniciaría el efecto del sondeo.
  }, [])

  // Sesión 8 (#11): la comanda completa (orden + ítems) en una sola llamada y una sola
  // transacción en el servidor. `{ mesa_id, items }` abre la comanda; `{ orden_id, items }` agrega
  // ítems a una existente. Devuelve la orden y los ítems con el precio que calculó el servidor.
  const enviarComandaApi = useCallback(async (payload: any) => {
    const res = await fetch('/api/ordenes/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw await errorDeRespuesta(res, 'No se pudo enviar la comanda')
    return (await res.json()) as { orden: any; items: any[] }
  }, [])

  // Devuelve el ítem tal como quedó en la base: `precio_unitario` es el que
  // calculó el servidor (el navegador ya no manda precio).
  const crearItemOrden = useCallback(async (item: any) => {
    const res = await fetch('/api/items-orden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
    if (!res.ok) throw await errorDeRespuesta(res, 'Error al crear item')
    return await res.json()
  }, [])

  const actualizarItemOrden = useCallback(async (id: string, updates: any) => {
    const res = await fetch('/api/items-orden', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const err = await errorDeRespuesta(res, 'No se pudo actualizar el ítem')
      console.error('Error updating item:', err.message)
      throw err
    }
    // El ítem como quedó en la base (con el precio calculado por el servidor).
    return await res.json().catch(() => null)
  }, [])

  const eliminarItemOrden = useCallback(async (id: string) => {
    const res = await fetch('/api/items-orden', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) throw await errorDeRespuesta(res, 'No se pudo eliminar el ítem')
    // Sesión 9 (F20): si era el último ítem sin pagar de una orden con cobros parciales, el servidor la cerró.
    const data = await res.json().catch(() => null)
    return { orden_cerrada: data?.orden_cerrada === true }
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
      // `codigo` (ORDEN_YA_PAGADA, MONTO_DISTINTO, CAJA_CERRADA…) deja que la
      // pantalla de Pagos decida si debe recargar el estado.
      throw Object.assign(new Error(data?.error || 'Error al registrar pago'), {
        codigo: data?.codigo as string | undefined,
        status: res.status,
      })
    }
    return await res.json()
  }, [])

  const registrarPerdidaApi = useCallback(async (payload: {
    orden_id: string
    motivo: string
  }) => {
    // Quien autoriza y el monto (IVA y descuento incluidos) los pone el servidor.
    const res = await fetch('/api/perdidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden_id: payload.orden_id, motivo: payload.motivo }),
    })
    if (!res.ok) throw await errorDeRespuesta(res, 'Error al registrar la pérdida')
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
    if (!res.ok) throw await errorDeRespuesta(res, 'Error al asignar items')
  }, [])

  const resolverPerdidaApi = useCallback(async (payload: {
    perdida_id: string
    monto?: number
    metodo?: string
    referencia?: string | null
    motivo?: string | null
  }) => {
    // Quién cobra lo toma el servidor de la sesión.
    const res = await fetch('/api/perdidas/resolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        perdida_id: payload.perdida_id,
        monto: payload.monto,
        metodo: payload.metodo,
        referencia: payload.referencia ?? undefined,
        motivo: payload.motivo || undefined,
      }),
    })
    if (!res.ok) throw await errorDeRespuesta(res, 'Error al cobrar retroactivamente')
    return (await res.json()) as {
      id: string
      pago_id: string
      monto: number
      monto_registrado: number
      monto_condonado: number
    }
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
    async (payload: { orden_id: string; tipo: string; valor: number; motivo: string; autorizacion?: string | null }) => {
      const usuarioId = state.usuarioActual?.id
      if (!usuarioId) return null
      try {
        // El servidor toma a quien aplica desde la sesión; `autorizacion` es
        // el token firmado de 5 min que entrega verificar-pin al admin.
        const res = await fetch('/api/descuentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  // Sondeo central (sesión 10, A4/B7). Un solo temporizador y una sola petición agrupada
  // (`GET /api/sondeo`) reemplazan al efecto del KDS y al de notificaciones:
  //  - KDS: órdenes + mesas + notificaciones cada 6 s. Resto de pantallas: notificaciones cada 15 s.
  //  - Pestaña oculta: 1 por minuto; al volver a visible se sondea al instante.
  //  - El candado `running`, la marca del último sondeo y `knownIds` viven en un ref: un reinicio
  //    del efecto (cambio de página) no los pierde, así ningún reinicio puede encadenar peticiones.
  //  - Nunca sondea dos veces con menos de 2 s de diferencia ni durante una pausa por 429.
  const usuarioIdRef = useRef<string | null>(null)
  const sondeoRef = useRef({ running: false, ultimo: 0, knownIds: new Set<string>() })
  useEffect(() => {
    usuarioIdRef.current = usuarioActualId
    sondeoRef.current.knownIds.clear()
    sondeoRef.current.ultimo = 0
  }, [usuarioActualId])

  useEffect(() => {
    if (!usuarioActualId) return
    const estado = sondeoRef.current
    const esKds = currentPage === 'kds'
    const secciones = esKds ? 'ordenes,mesas,notificaciones' : 'notificaciones'
    let cancelled = false
    let timer: number | undefined

    const ejecutar = async () => {
      const ahora = Date.now()
      if (cancelled || estado.running || enPausaPorLimite() || ahora - estado.ultimo < SONDEO_ESPACIO_MIN_MS) return
      estado.running = true
      estado.ultimo = ahora
      try {
        const res = await fetch(`/api/sondeo?secciones=${secciones}`, { cache: 'no-store' })
        if (!res.ok) return
        const datos = await res.json()
        // Si mientras tanto se cerró la sesión o entró otro usuario, la respuesta ya no sirve.
        if (usuarioIdRef.current !== usuarioActualId) return
        if (Array.isArray(datos?.ordenes) && Array.isArray(datos?.mesas)) {
          dispatch({ type: 'SET_COMANDAS', payload: fusionarComandas(datos.ordenes, datos.mesas, comandasRef.current) })
        }
        // El servidor filtra las notificaciones por el usuario y rol de la sesión; `null` = falló allá.
        if (Array.isArray(datos?.notificaciones)) {
          for (const row of datos.notificaciones) {
            if (!row?.id || estado.knownIds.has(row.id)) continue
            estado.knownIds.add(row.id)
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
        }
      } catch {
        // silenciar para no spamear la consola en redes inestables
      } finally {
        estado.running = false
      }
    }

    const programar = () => {
      window.clearTimeout(timer)
      const oculto = document.visibilityState !== 'visible'
      const espera = oculto ? SONDEO_OCULTO_MS : esKds ? SONDEO_KDS_MS : SONDEO_GENERAL_MS
      timer = window.setTimeout(async () => {
        await ejecutar()
        if (!cancelled) programar()
      }, espera)
    }

    const alCambiarVisibilidad = () => {
      programar()
      if (document.visibilityState === 'visible') void ejecutar()
    }

    void ejecutar()
    programar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [usuarioActualId, currentPage])

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
      enviarComandaApi,
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
