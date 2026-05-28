// Types for Soda Master V2 POS System

export type Rol = 'administrador' | 'admin' | 'mesero' | 'cocina' | 'bar' | 'cajero'

export type EstadoMesa = 'libre' | 'ocupada' | 'reservada'

export type EstadoComanda =
  | 'pendiente'
  | 'en_cocina'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'problema'
  | 'pagado'
  | 'cancelado'
  // "Perro muerto": cliente consumió pero se fue sin pagar. La diferencia
  // con `cancelado` es que en este caso los insumos sí se gastaron y la
  // pérdida queda registrada en `perdidas_comanda` para reportes.
  | 'perdida'

export type EstadoItem = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'problema'

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

/** Cómo se descuenta inventario al vender el producto */
export type ModoStock = 'producto' | 'receta' | 'producto_y_receta'

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
  modoStock?: ModoStock
  variantes?: { nombre: string; precio: number }[]
}

/** Insumo real en inventario (tabla soda_master.ingredientes) */
export interface IngredienteInsumo {
  id: string
  nombre: string
  categoria: string
  unidad_medida: string
  stock_actual: number
  stock_minimo: number
  costo_unitario: number
  activo: boolean
}

export interface RecetaIngredienteLinea {
  id?: string
  ingrediente_id: string
  ingrediente_nombre?: string
  cantidad: number
  opcional: boolean
  extra: boolean
  costo_adicional: number
  /** Si se define, el POS matchea modificadores por este nombre */
  nombre_display?: string | null
}

export interface RecetaProducto {
  id: string
  producto_id: string
  nombre: string
  activo: boolean
  ingredientes: RecetaIngredienteLinea[]
}

/** @deprecated Usar IngredienteInsumo — conservado por compatibilidad */
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
  categoria?: Producto['categoria'] | string
  cantidad: number
  ingredientesEstandar: string[]
  ingredientesEspeciales: IngredienteEspecialItem[]
  salsaSeleccionada?: string
  notas: string
  notaEspecial: string
  precio: number
  variante?: string
  estado: EstadoItem
  /** True si este item ya fue pagado (en un pago parcial previo). */
  pagado?: boolean
  /** Id del pago que cubrió este item (cuando pagado=true). */
  pagoId?: string | null
  /** Persona (cuenta_persona) que paga este item (null = compartido). */
  cuentaPersonaId?: string | null
}

export interface CuentaPersona {
  id: string
  ordenId: string
  idx: number
  nombre?: string | null
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
  /** Personas asociadas a esta comanda (división por productos). */
  cuentasPersona?: CuentaPersona[]
}

export interface Pago {
  id: string
  comandaId: string
  orden_id?: string
  metodo: MetodoPago
  monto: number
  total?: number
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
  nombre_negocio?: string
  logoUrl: string
  fuenteTicket: string
  tamañoFuente: number
  encabezadoTicket: string
  pieTicket: string
  stockMinimoPorDefecto: number
  modoMantenimiento: boolean
  tasa_impuesto?: number
  impuesto_habilitado?: boolean
  propinas_habilitadas?: boolean
  propina_default?: number
  // Impresión configurable de tickets (ver lib/print-ticket.ts)
  impresora_ancho_mm?: number
  impresora_fuente?: string
  impresora_tamano_fuente_pt?: number
  impresora_margen_mm?: number
  impresora_encabezado?: string
  impresora_pie?: string
  impresora_mostrar_logo?: boolean
  /**
   * Si es `true` (default), al enviar a cocina desde el POS se abre
   * automáticamente la vista de impresión con la copia física para cocina
   * y/o bar (KDS doble). Si la impresora no está disponible, esto puede
   * deshabilitarse desde Configuración → Impresión.
   */
  impresora_copias_auto?: boolean
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
  | { type: 'RESET_SESSION_DATA' }
  | { type: 'ADD_NOTIFICACION'; payload: Notificacion }
  | { type: 'MARCAR_NOTIFICACION_VISTA'; payload: string }
  | { type: 'LIMPIAR_NOTIFICACIONES'; payload?: void }
