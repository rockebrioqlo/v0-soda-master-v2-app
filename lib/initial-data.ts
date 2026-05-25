// initial-data.ts — UI constants only.
// All business data (productos, mesas, usuarios, inventario) lives in Neon DB.
// Do NOT add mock arrays here.

import type { PermisosDescuento, Configuracion, Rol } from './types'

// ── Permisos de descuento por rol ────────────────────────────────────────────
// These are config values; in a future version they can be persisted in
// soda_master.configuracion but for now they live here.
export const initialPermisosDescuento: Record<Rol, PermisosDescuento> = {
  administrador: { puede: true,  limiteMax: 100, requiereMotivo: false },
  admin:         { puede: true,  limiteMax: 100, requiereMotivo: false },
  cajero:        { puede: true,  limiteMax: 15,  requiereMotivo: true  },
  mesero:        { puede: false, limiteMax: 0,   requiereMotivo: true  },
  cocina:        { puede: false, limiteMax: 0,   requiereMotivo: true  },
  bar:           { puede: false, limiteMax: 0,   requiereMotivo: true  },
}

// ── Configuración inicial del sistema ────────────────────────────────────────
export const initialConfiguracion: Configuracion = {
  nombreRestaurante: 'Soda Master V2',
  logoUrl: '',
  fuenteTicket: 'monospace',
  tamañoFuente: 12,
  encabezadoTicket: '¡Gracias por su visita!',
  pieTicket: 'Vuelva pronto - Soda Master V2',
  stockMinimoPorDefecto: 10,
  modoMantenimiento: false,
  impresora_ancho_mm: 80,
  impresora_fuente: 'monospace',
  impresora_tamano_fuente_pt: 11,
  impresora_margen_mm: 4,
  impresora_encabezado: '¡Gracias por su visita!',
  impresora_pie: 'Vuelva pronto - Soda Master',
  impresora_mostrar_logo: true,
  impresora_copias_auto: true,
}

// ── Opciones para el dialog de personalización de burgers ────────────────────
// These lists are menu-level UI data; they can later come from soda_master.modificadores
export const quesosDisponibles = [
  'Queso Cheddar',
  'Queso Mozzarella',
  'Queso Azul',
  'Queso Gouda',
]

export const ingredientesEstandar = [
  'Tomate',
  'Lechuga',
  'Tocino',
  'Cebolla',
  'Palta',
  'Champiñones',
  'Jalapeño',
  'Cebolla Caramelizada',
]

export const salsasDisponibles = [
  'Mayonesa',
  'Ketchup',
  'Mostaza',
  'BBQ',
  'Salsa Picante',
  'Chimichurri',
  'Cheddar',
]
