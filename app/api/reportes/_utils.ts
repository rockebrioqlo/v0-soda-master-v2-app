import { fechaHoyZonaNegocio, normalizarFechaZonaNegocio } from '@/lib/fechas'

export function parseRango(searchParams: URLSearchParams) {
  // "Hoy" se interpreta en la zona horaria del negocio (Chile), porque
  // todas las consultas de reportes filtran con
  // `AT TIME ZONE 'America/Santiago'`. Si calculamos "hoy" en UTC, las
  // ventas hechas de noche aparecen fuera de rango y desaparecen del
  // Dashboard. Ver `lib/fechas.ts`.
  const hoy = fechaHoyZonaNegocio()
  const desde = normalizarFechaZonaNegocio(searchParams.get('desde'), hoy)
  const hasta = normalizarFechaZonaNegocio(searchParams.get('hasta'), hoy)
  if (desde > hasta) {
    return { desde: hasta, hasta: desde }
  }
  return { desde, hasta }
}
