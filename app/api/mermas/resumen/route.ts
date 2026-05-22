import { db } from '@/lib/db'

function toIsoDate(value: string | null, fallback: string): string {
  if (!value) return fallback
  if (value === 'hoy') return new Date().toISOString().slice(0, 10)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return m ? m[1] : fallback
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const hoy = new Date().toISOString().slice(0, 10)
    let desde = toIsoDate(searchParams.get('desde'), hoy)
    let hasta = toIsoDate(searchParams.get('hasta'), hoy)
    if (desde > hasta) [desde, hasta] = [hasta, desde]
    const data = await db.getResumenMermas(desde, hasta)
    return Response.json(data)
  } catch (error) {
    console.error('Resumen mermas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
