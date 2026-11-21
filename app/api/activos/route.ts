import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { ActivoSchema } from '@/lib/finanzas-http'
import { booleanoConsulta, leerBody, leerConsulta } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, z.object({ incluir_baja: booleanoConsulta.optional() }).strict())
    if (!q.ok) return q.respuesta
    const data = await db.getActivos(q.datos.incluir_baja !== 'true')
    return Response.json(data)
  } catch (error) {
    console.error('GET activos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ActivoSchema, 'Datos del activo')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const row = await db.crearActivo({
      nombre: d.nombre,
      categoria: d.categoria || 'maquinaria',
      descripcion: d.descripcion ?? undefined,
      fecha_compra: d.fecha_compra,
      costo_compra: d.costo_compra,
      vida_util_meses: d.vida_util_meses,
      valor_residual: d.valor_residual ?? 0,
      metodo_depreciacion: d.metodo_depreciacion || 'lineal',
      proveedor_id: d.proveedor_id || null,
      ubicacion: d.ubicacion ?? undefined,
      numero_serie: d.numero_serie ?? undefined,
      notas: d.notas ?? undefined,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST activos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
