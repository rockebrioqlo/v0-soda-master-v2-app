import { db } from '@/lib/db'

const TIPOS = ['porcentaje', 'monto_fijo', 'cortesia_parcial', 'cortesia_total']

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde') || undefined
    const hasta = searchParams.get('hasta') || undefined
    const orden_id = searchParams.get('orden_id') || undefined
    const data = await db.getDescuentos({ desde, hasta, orden_id })
    return Response.json(data)
  } catch (error) {
    console.error('Get descuentos error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tipo = String(body.tipo || '')
    if (!TIPOS.includes(tipo)) {
      return Response.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    const valor = Number(body.valor)
    if (!Number.isFinite(valor) || valor < 0) {
      return Response.json({ error: 'Valor inválido' }, { status: 400 })
    }
    if (tipo === 'porcentaje' && valor > 100) {
      return Response.json({ error: 'Porcentaje no puede superar 100' }, { status: 400 })
    }
    const orden_id = String(body.orden_id || '')
    if (!orden_id) {
      return Response.json({ error: 'orden_id requerido' }, { status: 400 })
    }
    const aplicado_por = String(body.aplicado_por || '')
    if (!aplicado_por) {
      return Response.json({ error: 'aplicado_por requerido' }, { status: 400 })
    }
    const motivo = String(body.motivo || '').trim()
    if (!motivo) {
      return Response.json({ error: 'motivo requerido' }, { status: 400 })
    }
    const autorizado_por = body.autorizado_por ? String(body.autorizado_por) : null

    const aplicador = await db.getUsuarioById(aplicado_por)
    if (!aplicador) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 401 })
    }
    const permisos = await db.getPermisosDescuento()
    const permiso = permisos.find((p) => p.rol === aplicador.rol)
    const esAdmin = aplicador.rol === 'admin' || aplicador.rol === 'administrador'
    const limite = esAdmin ? 100 : Number(permiso?.limite_maximo) || 0
    const puede = esAdmin || permiso?.puede_aplicar === true

    const requiereAutorizacion =
      !puede || (tipo === 'porcentaje' && valor > limite) || tipo === 'cortesia_total'

    if (requiereAutorizacion) {
      if (!autorizado_por) {
        return Response.json(
          { error: 'Este descuento requiere autorización del administrador' },
          { status: 403 }
        )
      }
      const autorizador = await db.getUsuarioById(autorizado_por)
      if (!autorizador || (autorizador.rol !== 'admin' && autorizador.rol !== 'administrador')) {
        return Response.json(
          { error: 'autorizado_por debe ser un administrador' },
          { status: 403 }
        )
      }
    }

    const created = await db.crearDescuento({
      orden_id,
      tipo,
      valor,
      aplicado_por,
      autorizado_por,
      motivo,
    })
    return Response.json(created, { status: 201 })
  } catch (error) {
    console.error('Create descuento error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
