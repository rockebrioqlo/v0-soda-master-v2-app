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
    lista: 'bg-green-500',
    pagada: 'bg-blue-500'
  }
  return colors[estado] || 'bg-gray-500'
}

export function getEstadoComandaLabel(estado: string): string {
  const labels: Record<string, string> = {
    pendiente: 'Pendiente',
    en_cocina: 'En Cocina',
    lista: 'Lista',
    pagada: 'Pagada'
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
