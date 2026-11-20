import { z } from 'zod'
import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { leerBody, respuestaDeError, validarBody } from '@/lib/ordenes-http'
import {
  CuentaPersonaDeleteSchema,
  CuentaPersonaPatchSchema,
  CuentaPersonaPostSchema,
} from '@/lib/cuentas-http'

/**
 * CRUD de personas que comparten una mesa/comanda (sesión 7: zod `.strict()`,
 * sesión obligatoria y errores con código).
 *
 * - GET ?orden_id=X      → lista las personas de esa orden.
 * - POST { orden_id, nombre? } → crea Persona N (idx autoasignado, con la orden bloqueada).
 * - PATCH { id, nombre } → renombra.
 * - DELETE { id }        → elimina (items vuelven a compartido).
 */

const SALON = ['admin', 'mesero', 'cajero'] as const

function falloServidor(error: unknown, etiqueta: string): Response {
  const r = respuestaDeError(error)
  if (r) return r
  console.error(`${etiqueta} error:`, error)
  return Response.json({ error: 'Error en servidor' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const { searchParams } = new URL(request.url)
    const v = validarBody({ orden_id: searchParams.get('orden_id') }, z.object({ orden_id: z.string().uuid() }), 'Consulta')
    if (!v.ok) return v.respuesta
    const rows = await db.getCuentasPersona(v.datos.orden_id)
    return Response.json(rows)
  } catch (error) {
    return falloServidor(error, 'GET /api/cuentas-persona')
  }
}

export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, SALON)
    if (!s.ok) return s.respuesta
    const v = await leerBody(request, CuentaPersonaPostSchema, 'Datos de la persona')
    if (!v.ok) return v.respuesta
    const nombre = v.datos.nombre && v.datos.nombre.length > 0 ? v.datos.nombre : null
    const row = await db.crearCuentaPersona({ orden_id: v.datos.orden_id, nombre })
    return Response.json(row, { status: 201 })
  } catch (error) {
    return falloServidor(error, 'POST /api/cuentas-persona')
  }
}

export async function PATCH(request: Request) {
  try {
    const s = await requireSesion(request, SALON)
    if (!s.ok) return s.respuesta
    const v = await leerBody(request, CuentaPersonaPatchSchema, 'Datos de la persona')
    if (!v.ok) return v.respuesta
    const nombre = v.datos.nombre && v.datos.nombre.length > 0 ? v.datos.nombre : null
    const row = await db.renombrarCuentaPersona(v.datos.id, nombre)
    return Response.json(row)
  } catch (error) {
    return falloServidor(error, 'PATCH /api/cuentas-persona')
  }
}

export async function DELETE(request: Request) {
  try {
    const s = await requireSesion(request, SALON)
    if (!s.ok) return s.respuesta
    const cuerpo = await request.json().catch(() => ({}))
    const { searchParams } = new URL(request.url)
    const crudo = cuerpo && typeof cuerpo === 'object' && 'id' in cuerpo ? cuerpo : { id: searchParams.get('id') }
    const v = validarBody(crudo, CuentaPersonaDeleteSchema, 'Datos de la persona')
    if (!v.ok) return v.respuesta
    await db.eliminarCuentaPersona(v.datos.id)
    return Response.json({ ok: true })
  } catch (error) {
    return falloServidor(error, 'DELETE /api/cuentas-persona')
  }
}
