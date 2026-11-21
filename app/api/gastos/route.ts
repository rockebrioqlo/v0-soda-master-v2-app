import { db } from '@/lib/db'
import { requireAcceso, requireSesion } from '@/lib/sesion'
import { GastoPostSchema, GastosConsultaSchema } from '@/lib/finanzas-http'
import { leerBody, leerConsulta } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, GastosConsultaSchema)
    if (!q.ok) return q.respuesta
    const { desde, hasta, tipo, limite, resumen } = q.datos
    if (resumen === 'true') {
      const r = await db.getResumenGastos({ desde, hasta })
      return Response.json(r)
    }
    const data = await db.getGastos({ desde, hasta, tipo, limite })
    return Response.json(data)
  } catch (error) {
    console.error('GET gastos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, GastoPostSchema, 'Datos del gasto')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const row = await db.crearGasto({
      fecha: d.fecha,
      categoria: d.categoria || 'otros',
      descripcion: d.descripcion ?? undefined,
      monto: d.monto,
      tipo: d.tipo || 'operativo',
      recurrente: !!d.recurrente,
      periodicidad: d.periodicidad ?? undefined,
      proveedor_id: d.proveedor_id || null,
      empleado_id: d.empleado_id || null,
      activo_id: d.activo_id || null,
      usuario_id: s.usuario.id, // de la sesión, no del body
      notas: d.notas ?? undefined,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST gastos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
