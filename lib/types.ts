// Types for Soda Master V2 POS System

export type Rol = 'administrador' | 'admin' | 'mesero' | 'cocina' | 'bar' | 'cajero'

export type EstadoMesa = 'libre' | 'ocupada' | 'reservada'

export type EstadoComanda = 'pendiente' | 'en_cocina' | 'en_preparacion' | 'listo' | 'problema' | 'pagada'

export type EstadoItem = 'pendiente' | 'en_preparacion' | 'listo' | 'problema'

export type MetodoPago = 'efectivo' | 'tarjeta'

export type TipoMerma = 
  | 'accidente' 
  | 'vencido' 
  | 'perdida_sin_explicacion' 
  | 'consumo_interno' 
  | 'comanda_no_pagada' 
  | 'error_preparacion' 
  | 'robo'

export type TipoDescuento = 'porcentaje' | 'monto_fijo' | 'cortesia_parcial' | 'cortesia_total'

export type Consecuencia = 'descuento_liquidacion' | 'solo_registro' | 'amonestacion'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  pinHash?: string
  pin_hash?: string
  activo: boolean
  intentosFallidos: number
  bloqueadoHasta: number | null
}

export interface Mesa {
  id: string
  nombre: string
  numero?: number
  capacidad: number
  estado: EstadoMesa
  area?: string
}

export interface Producto {
  id: string
  nombre: string
  categoria: 'burgers' | 'entradas' | 'acompañamientos' | 'postres' | 'bebidas' | 'salsas' | 'cervezas' | 'jugos_bebidas' | 'tragos'
  precio: number
  stock: number
  stockMinimo: number
  formato: string
  esIngredienteEspecial: boolean
  costoAdicional: number
  variantes?: { nombre: string; precio: number }[]
}

export interface Ingrediente {
  id: string
  nombre: string
  stock: number
  stockMinimo: number
}

export interface IngredienteEspecialItem {
  id: string
  nombre: string
  costoAdicional: number
}

export interface ItemComanda {
  id: string
  productoId: string
  productoNombre: string
  cantidad: number
  ingredientesEstandar: string[]
  ingredientesEspeciales: IngredienteEspecialItem[]
  salsaSeleccionada?: string
  notas: string
  notaEspecial: string
  precio: number
  variante?: string
  estado: EstadoItem
}

export interface Comanda {
  id: string
  mesaId: string
  mesaNombre: string
  usuarioId: string
  usuarioNombre: string
  estado: EstadoComanda
  creadoAt: number
  items: ItemComanda[]
  descuento: number
  tipoDescuento: TipoDescuento | null
  propina: number
  tipoPropina: 'porcentaje' | 'monto_fijo'
  motivoDescuento?: string
  descuentoAplicadoPor?: string
  descuentoAutorizadoPor?: string
}

export interface Pago {
  id: string
  comandaId: string
  orden_id?: string
  metodo: MetodoPago
  total: number
  monto?: number
  propina: number
  descuento: number
  vuelto?: number
  referencia?: string
  aprobado?: boolean
  divididoEn: number
  fecha: number
}

export interface Orden {
  id: string
  mesa_id: string
  usuario_id: string
  estado: EstadoComanda
  subtotal: number
  impuesto: number
  total: number
  notas?: string
  enviado_a_cocina?: boolean
  hora_envio?: string | null
  numero_orden?: number
  created_at?: string
  updated_at?: string
  items?: ItemOrden[]
}

export interface ItemOrden {
  id: string
  orden_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  modificadores: string[]
  notas_especiales?: string
  estado_item: EstadoItem
  created_at?: string
}

export interface Inventario {
  id: string
  producto_id: string
  stock_actual: number
  stock_minimo: number
  unidad_medida?: string
  created_at?: string
  updated_at?: string
}

export interface Merma {
  id: string
  tipo: TipoMerma
  productoId: string
  productoNombre: string
  cantidad: number
  descripcion: string
  registradoPor: string
  registradoPorNombre: string
  responsable?: string
  responsableNombre?: string
  consecuencia?: Consecuencia
  fecha: number
  comandaId?: string
}

export interface ComandaNoPagada {
  id: string
  comandaId: string
  motivo: string
  autorizadoPor?: string
  fecha: number
}

export interface RegistroDescuento {
  id: string
  comandaId: string
  tipo: TipoDescuento
  valor: number
  aplicadoPor: string
  aplicadoPorNombre: string
  autorizadoPor?: string
  autorizadoPorNombre?: string
  motivo: string
  fecha: number
}

export interface ConflictLog {
  id: string
  tabla: string
  registroId: string
  valorLocal: string
  valorNeon: string
  resolucion: 'local' | 'neon' | 'manual'
  resueltoPor: string
  fecha: number
}

export interface PermisosDescuento {
  puede: boolean
  limiteMax: number
  requiereMotivo: boolean
}

export interface Configuracion {
  nombreRestaurante: string
  logoUrl: string
  fuenteTicket: string
  tamañoFuente: number
  encabezadoTicket: string
  pieTicket: string
  stockMinimoPorDefecto: number
  modoMantenimiento: boolean
}

export interface Notificacion {
  id: string
  tipo: 'problema' | 'listo' | 'nueva_orden'
  ordenId: string
  mesaNombre: string
  mensaje: string
  timestamp: number
  vista: boolean
}

export interface AppState {
  mesas: Mesa[]
  usuarios: Usuario[]
  productos: Producto[]
  ingredientes: Ingrediente[]
  comandas: Comanda[]
  pagos: Pago[]
  mermas: Merma[]
  comandasNoPagadas: ComandaNoPagada[]
  descuentos: RegistroDescuento[]
  conflictLog: ConflictLog[]
  permisosDescuento: Record<Rol, PermisosDescuento>
  configuracion: Configuracion
  usuarioActual: Usuario | null
  isOnline: boolean
  sincronizando: boolean
  notificaciones: Notificacion[]
}

export type AppAction =
  | { type: 'SET_USUARIO'; payload: Usuario | null }
  | { type: 'SET_MESAS'; payload: Mesa[] }
  | { type: 'ADD_MESA'; payload: Mesa }
  | { type: 'UPDATE_MESA'; payload: Mesa }
  | { type: 'DELETE_MESA'; payload: string }
  | { type: 'SET_PRODUCTOS'; payload: Producto[] }
  | { type: 'ADD_PRODUCTO'; payload: Producto }
  | { type: 'UPDATE_PRODUCTO'; payload: Producto }
  | { type: 'DELETE_PRODUCTO'; payload: string }
  | { type: 'SET_COMANDAS'; payload: Comanda[] }
  | { type: 'ADD_COMANDA'; payload: Comanda }
  | { type: 'UPDATE_COMANDA'; payload: Comanda }
  | { type: 'DELETE_COMANDA'; payload: string }
  | { type: 'SET_USUARIOS'; payload: Usuario[] }
  | { type: 'ADD_USUARIO'; payload: Usuario }
  | { type: 'UPDATE_USUARIO'; payload: Usuario }
  | { type: 'DELETE_USUARIO'; payload: string }
  | { type: 'ADD_PAGO'; payload: Pago }
  | { type: 'SET_PAGOS'; payload: Pago[] }
  | { type: 'ADD_MERMA'; payload: Merma }
  | { type: 'UPDATE_MERMA'; payload: Merma }
  | { type: 'ADD_DESCUENTO'; payload: RegistroDescuento }
  | { type: 'SET_PERMISOS_DESCUENTO'; payload: Record<Rol, PermisosDescuento> }
  | { type: 'SET_CONFIGURACION'; payload: Configuracion }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_SINCRONIZANDO'; payload: boolean }
  | { type: 'LOAD_STATE'; payload: Partial<AppState> }
  | { type: 'ADD_NOTIFICACION'; payload: Notificacion }
  | { type: 'MARCAR_NOTIFICACION_VISTA'; payload: string }
  | { type: 'LIMPIAR_NOTIFICACIONES'; payload?: void }
