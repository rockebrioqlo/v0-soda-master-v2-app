import { db } from '@/lib/db'
import { fechaHoyZonaNegocio, normalizarFechaZonaNegocio } from '@/lib/fechas'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    // "Hoy" en zona del negocio (Chile). Si usamos fecha UTC, las
    // mermas registradas de noche caen en otro día y desaparecen del
    // dashboard. Ver `lib/fechas.ts`.
    const hoy = fechaHoyZonaNegocio()
    let desde = normalizarFechaZonaNegocio(searchParams.get('desde'), hoy)
    let hasta = normalizarFechaZonaNegocio(searchParams.get('hasta'), hoy)
    if (desde > hasta) [desde, hasta] = [hasta, desde]
    const data = await db.getResumenMermas(desde, hasta)
    return Response.json(data)
  } catch (error) {
    console.error('Resumen mermas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
