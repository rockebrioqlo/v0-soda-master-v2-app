import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'
import { verificarAutorizacionAdmin } from '@/lib/autorizacion-admin'

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
    // Quien aplica el descuento es el usuario de la sesión, no un id del body.
    const s = await requireSesion(request, ['admin', 'mesero', 'cajero'])
    if (!s.ok) return s.respuesta
    const aplicador = s.usuario
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
    const aplicado_por = aplicador.id
    const motivo = String(body.motivo || '').trim()
    if (!motivo) {
      return Response.json({ error: 'motivo requerido' }, { status: 400 })
    }
    let autorizado_por: string | null = null

    const permisos = await db.getPermisosDescuento()
    const permiso = permisos.find((p) => p.rol === aplicador.rol)
    const esAdmin = aplicador.rol === 'admin' || aplicador.rol === 'administrador'
    const limite = esAdmin ? 100 : Number(permiso?.limite_maximo) || 0
    const puede = esAdmin || permiso?.puede_aplicar === true

    const requiereAutorizacion =
      !puede || (tipo === 'porcentaje' && valor > limite) || tipo === 'cortesia_total'

    if (requiereAutorizacion) {
      // Se exige la autorización firmada que entrega /api/auth/verificar-pin
      // cuando el admin escribe su PIN (5 minutos). Un id suelto ya no sirve.
      const autorizador = await verificarAutorizacionAdmin(body.autorizacion)
      if (!autorizador) {
        return Response.json(
          { error: 'Este descuento requiere autorización del administrador' },
          { status: 403 }
        )
      }
      autorizado_por = autorizador.id
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
