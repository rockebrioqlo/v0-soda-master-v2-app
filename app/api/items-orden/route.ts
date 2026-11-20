import { db } from '@/lib/db'
import { esAdminSesion, requireSesion } from '@/lib/sesion'
import {
  IdSchema,
  ItemPatchSchema,
  ItemPostSchema,
  leerBody,
  respuestaDeError,
} from '@/lib/ordenes-http'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ordenId = searchParams.get('orden_id')

    if (!ordenId) {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }

    const items = await db.getItemsOrden(ordenId)
    return Response.json(items)
  } catch (error) {
    console.error('Get items error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

// Crear un ítem (sesión 6, F8): el precio lo calcula el servidor desde el
// producto y los extras. Un `precio_unitario` del navegador se ignora; la
// respuesta trae el precio real y el cliente lo adopta.
export async function POST(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ItemPostSchema, 'Datos del ítem')
    if (!parsed.ok) return parsed.respuesta
    const { precio_unitario: _precioIgnorado, estado_item: _estadoIgnorado, ...item } = parsed.datos
    const newItem = await db.crearItemOrden(item)
    return Response.json(newItem)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Create item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    // El proxy ya filtró por rol; aquí hace falta saber quién es: solo el
    // admin fija precios a mano, y nadie toca ítems ya pagados (sesión 5).
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, ItemPatchSchema, 'Datos del ítem')
    if (!parsed.ok) return parsed.respuesta
    const { id, ...updates } = parsed.datos
    // Cocina y bar solo avanzan el estado de preparación: cantidad, extras,
    // notas y precio son del salón (mesero, cajero) y del admin.
    const esSalon = s.usuario.roles.some((r) => ['admin', 'mesero', 'cajero'].includes(r))
    if (!esSalon && Object.keys(updates).some((k) => k !== 'estado_item')) {
      return Response.json(
        { error: 'Tu rol solo puede cambiar el estado de preparación del ítem.', codigo: 'ROL_SIN_PERMISO' },
        { status: 403 },
      )
    }
    // Sin `precio_manual`, el precio que mande el navegador no cuenta.
    if (updates.precio_manual === undefined) delete updates.precio_unitario
    const item = await db.actualizarItemOrden(id, updates, {
      esAdmin: esAdminSesion(s.usuario),
      usuario: { id: s.usuario.id, nombre: s.usuario.nombre, rol: s.usuario.rol },
    })
    return Response.json(item)
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Update item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const parsed = await leerBody(request, IdSchema, 'Datos del ítem')
    if (!parsed.ok) return parsed.respuesta
    const r = await db.eliminarItemOrden(parsed.datos.id, {
      usuario: { id: s.usuario.id, nombre: s.usuario.nombre },
    })
    // `orden_cerrada`: era el último ítem sin pagar de una orden con cobros parciales (F20).
    return Response.json({ success: true, orden_cerrada: r.orden_cerrada })
  } catch (error) {
    const resp = respuestaDeError(error)
    if (resp) return resp
    console.error('Delete item error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
