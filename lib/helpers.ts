// Utility functions for Soda Master V2

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-CL').format(num)
}

/** Cantidad con hasta `max` decimales (stock y cantidades de insumos: 3). */
export function formatDecimal(num: number, max = 3): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: max }).format(num)
}

/** Costo por unidad de consumo: CLP con hasta 4 decimales ($0,45 por gramo no se ve como $0). */
export function formatCostoUnitario(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(amount)
}

/** Unidades de consumo y de compra que ofrece el formulario de insumos. */
export const UNIDADES_CONSUMO = ['unidad', 'porción', 'g', 'ml'] as const
export const UNIDADES_COMPRA_SUGERIDAS = [
  'paquete', 'caja', 'bolsa', 'saco', 'kg', 'litro', 'botella', 'bidón', 'docena', 'pack', 'rollo', 'unidad',
]

/** Factor sugerido al elegir las dos unidades (kg → g, litro → ml, docena → unidad). */
export function factorSugerido(compra: string, consumo: string): number | null {
  const c = compra.trim().toLowerCase()
  const u = consumo.trim().toLowerCase()
  if (c === 'kg' && u === 'g') return 1000
  if ((c === 'litro' || c === 'l' || c === 'lt') && u === 'ml') return 1000
  if (c === 'docena' && u === 'unidad') return 12
  if (c === u) return 1
  return null
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

export function getElapsedTime(startTime: number): string {
  const elapsed = Date.now() - startTime
  const minutes = Math.floor(elapsed / 60000)
  const seconds = Math.floor((elapsed % 60000) / 1000)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

export function getRolLabel(rol: string): string {
  const labels: Record<string, string> = {
    administrador: 'Administrador',
    admin: 'Administrador',
    mesero: 'Mesero',
    cocina: 'Cocina',
    bar: 'Bar',
    cajero: 'Cajero'
  }
  return labels[rol] || rol
}

export function getEstadoMesaColor(estado: string): string {
  const colors: Record<string, string> = {
    libre: 'bg-green-500',
    ocupada: 'bg-red-500',
    reservada: 'bg-yellow-500'
  }
  return colors[estado] || 'bg-gray-500'
}

export function getEstadoMesaLabel(estado: string): string {
  const labels: Record<string, string> = {
    libre: 'Libre',
    ocupada: 'Ocupada',
    reservada: 'Reservada'
  }
  return labels[estado] || estado
}

export function getEstadoComandaColor(estado: string): string {
  const colors: Record<string, string> = {
    pendiente: 'bg-gray-500',
    en_cocina: 'bg-orange-500',
    en_preparacion: 'bg-yellow-500',
    listo: 'bg-green-500',
    entregado: 'bg-emerald-600',
    problema: 'bg-red-500',
    pagado: 'bg-blue-500',
    cancelado: 'bg-zinc-500',
    perdida: 'bg-rose-700',
  }
  return colors[estado] || 'bg-gray-500'
}

export function getEstadoComandaLabel(estado: string): string {
  const labels: Record<string, string> = {
    pendiente: 'Pendiente',
    en_cocina: 'En Cocina',
    en_preparacion: 'En Preparación',
    listo: 'Listo',
    entregado: 'Entregado',
    problema: 'Problema',
    pagado: 'Pagado',
    cancelado: 'Cancelada',
    perdida: 'Perro muerto',
  }
  return labels[estado] || estado
}

export function getTipoMermaLabel(tipo: string): string {
  const labels: Record<string, string> = {
    accidente: 'Accidente',
    vencido: 'Vencido',
    perdida_sin_explicacion: 'Pérdida sin explicación',
    consumo_interno: 'Consumo interno',
    comanda_no_pagada: 'Comanda no pagada',
    error_preparacion: 'Error de preparación',
    robo: 'Robo'
  }
  return labels[tipo] || tipo
}

export function getConsecuenciaLabel(consecuencia: string): string {
  const labels: Record<string, string> = {
    descuento_liquidacion: 'Descuento en liquidación',
    solo_registro: 'Solo registro',
    amonestacion: 'Amonestación'
  }
  return labels[consecuencia] || consecuencia
}
