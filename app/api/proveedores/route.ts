import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAcceso } from '@/lib/sesion'
import { ProveedorSchema } from '@/lib/finanzas-http'
import { booleanoConsulta, leerBody, leerConsulta } from '@/lib/validacion-http'

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(request, z.object({ incluir_inactivos: booleanoConsulta.optional() }).strict())
    if (!q.ok) return q.respuesta
    const data = await db.getProveedores(q.datos.incluir_inactivos !== 'true')
    return Response.json(data)
  } catch (error) {
    console.error('GET proveedores error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ProveedorSchema, 'Datos del proveedor')
    if (!parsed.ok) return parsed.respuesta
    const d = parsed.datos
    const row = await db.crearProveedor({
      nombre: d.nombre,
      rut: d.rut || undefined,
      contacto: d.contacto || undefined,
      telefono: d.telefono || undefined,
      email: d.email || undefined,
      direccion: d.direccion || undefined,
      notas: d.notas || undefined,
    })
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error('POST proveedores error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
