// Types for Soda Master V2 POS System

export type Rol = 'administrador' | 'mesero' | 'cocina' | 'bar' | 'cajero'

export type EstadoMesa = 'libre' | 'ocupada' | 'reservada'

export type EstadoComanda = 'pendiente' | 'en_cocina' | 'lista' | 'pagada'

export type MetodoPago = 'efectivo' | 'tarjeta' | 'qr'

export type TipoMerma = 
  | 'accidente' 
  | 'vencido' 
  | 'perdida_sin_explicacion' 
  | 'consumo_interno' 
  | 'comanda_no_pagada' 
  | 'error_preparacion' 
  | 'robo'

export type TipoDescuento = 'porcentaje' | 'monto_fijo'

export type Consecuencia = 'descuento_liquidacion' | 'solo_registro' | 'amonestacion'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  pinHash: string
  activo: boolean
  intentosFallidos: number
  bloqueadoHasta: number | null
}

export interface Mesa {
  id: string
  nombre: string
  capacidad: number
  estado: EstadoMesa
}

export interface Producto {
  id: string
  nombre: string
  categoria: 'burgers' | 'entradas' | 'acompañamientos' | 'postres' | 'bebidas' | 'salsas'
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

export interface ItemComanda {
  id: string
  productoId: string
  productoNombre: string
  cantidad: number
  ingredientesEstandar: string[]
  ingredientesEspeciales: string[]
  salsaSeleccionada?: string
  notas: string
  precio: number
  variante?: string
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
  metodo: MetodoPago
  total: number
  propina: number
  descuento: number
  divididoEn: number
  fecha: number
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
  | { type: 'ADD_MERMA'; payload: Merma }
  | { type: 'UPDATE_MERMA'; payload: Merma }
  | { type: 'ADD_DESCUENTO'; payload: RegistroDescuento }
  | { type: 'SET_PERMISOS_DESCUENTO'; payload: Record<Rol, PermisosDescuento> }
  | { type: 'SET_CONFIGURACION'; payload: Configuracion }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_SINCRONIZANDO'; payload: boolean }
  | { type: 'LOAD_STATE'; payload: Partial<AppState> }
