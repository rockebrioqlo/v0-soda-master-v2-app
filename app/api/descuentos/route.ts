import { z } from 'zod'
import { db, ErrorOrden } from '@/lib/db'
import { requireAcceso, requireSesion } from '@/lib/sesion'
import { fechaYmd, leerConsulta, uuid } from '@/lib/validacion-http'
import { verificarAutorizacionAdmin } from '@/lib/autorizacion-admin'

// Sesión 12 (F17): el body se valida con zod `.strict()`: cualquier campo extra (por ejemplo
// un `aplicado_por` del navegador) se rechaza. Quien aplica es el usuario de la sesión.
const DescuentoSchema = z
  .object({
    orden_id: z.string().uuid(),
    tipo: z.enum(['porcentaje', 'monto_fijo', 'cortesia_parcial', 'cortesia_total']),
    valor: z.number().finite().min(0).max(100_000_000),
    motivo: z.string().trim().min(1).max(300),
    autorizacion: z.string().max(2000).nullish(),
  })
  .strict()
  .refine((d) => d.tipo !== 'porcentaje' || d.valor <= 100, {
    message: 'Porcentaje no puede superar 100',
    path: ['valor'],
  })

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(
      request,
      z.object({ desde: fechaYmd.optional(), hasta: fechaYmd.optional(), orden_id: uuid.optional() }).strict(),
    )
    if (!q.ok) return q.respuesta
    const { desde, hasta, orden_id } = q.datos
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
    const parsed = DescuentoSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      const motivo = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ')
      return Response.json(
        { error: `Datos de descuento inválidos (${motivo})`, codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }
    const { orden_id, tipo, valor, motivo, autorizacion } = parsed.data
    const aplicado_por = aplicador.id
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
      const autorizador = await verificarAutorizacionAdmin(autorizacion)
      if (!autorizador) {
        return Response.json(
          {
            error: 'Este descuento requiere autorización del administrador',
            codigo: 'AUTORIZACION_REQUERIDA',
          },
          { status: 403 },
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
    if (error instanceof ErrorOrden) {
      return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status })
    }
    console.error('Create descuento error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
