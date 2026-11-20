import { z } from 'zod'
import { db } from '@/lib/db'
import { requireSesion } from '@/lib/sesion'

/**
 * GET /api/sondeo?secciones=ordenes,mesas,notificaciones   (sesión 10, A4/B7)
 *
 * Sondeo agrupado: reemplaza las 3 peticiones del polling (órdenes del KDS,
 * mesas y notificaciones) por una sola, así cuenta una vez contra el límite
 * de 240/min y paga una sola validación de sesión en el proxy. Lo llama
 * únicamente el sondeo central de `AppProvider`; los endpoints originales
 * siguen vivos para la carga inicial y las acciones de cada pantalla.
 *
 * - Acceso 'sesion' (cualquier usuario logueado), igual que los 3 endpoints
 *   que agrupa (ver lib/permisos-api.ts), así que no existe un 403 propio.
 * - Datos idénticos a `GET /api/ordenes?kds=true`, `GET /api/mesas` y
 *   `GET /api/notificaciones?solo_pendientes=true`; las notificaciones salen
 *   del usuario y rol de la sesión.
 * - Solo se devuelven las secciones pedidas. Si no se pide ninguna, las tres.
 * - Si falla la sección de notificaciones, se devuelve `null` (se registra
 *   en el servidor) y el resto del sondeo sigue; si fallan órdenes o mesas,
 *   500 con código SONDEO_ERROR.
 */
const SECCIONES = ['ordenes', 'mesas', 'notificaciones'] as const
type Seccion = (typeof SECCIONES)[number]

const QuerySchema = z.object({ secciones: z.string().max(100).optional() }).strict()
const SeccionSchema = z.enum(SECCIONES)

function parsearSecciones(request: Request): Seccion[] | null {
  const { searchParams } = new URL(request.url)
  const query = QuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!query.success) return null
  if (query.data.secciones === undefined) return [...SECCIONES]
  const partes = query.data.secciones.split(',').map((p) => p.trim())
  const secciones: Seccion[] = []
  for (const parte of partes) {
    const seccion = SeccionSchema.safeParse(parte)
    if (!seccion.success) return null
    if (!secciones.includes(seccion.data)) secciones.push(seccion.data)
  }
  return secciones
}

export async function GET(request: Request) {
  try {
    const s = await requireSesion(request)
    if (!s.ok) return s.respuesta

    const secciones = parsearSecciones(request)
    if (!secciones) {
      return Response.json(
        {
          error: `Parámetros inválidos: "secciones" admite solo ${SECCIONES.join(', ')} separadas por coma`,
          codigo: 'SECCIONES_INVALIDAS',
        },
        { status: 400 },
      )
    }

    const [ordenes, mesas, notificaciones] = await Promise.all([
      secciones.includes('ordenes') ? db.getOrdenesParaKDS() : undefined,
      secciones.includes('mesas') ? db.getMesas() : undefined,
      secciones.includes('notificaciones')
        ? db
            .listarNotificacionesPara({
              usuario_id: s.usuario.id,
              rol: s.usuario.rol,
              solo_pendientes: true,
              limite: 100,
            })
            .catch((error) => {
              console.error(
                `[GET /api/sondeo] falló la sección notificaciones (usuario ${s.usuario.id}, rol ${s.usuario.rol}); se devuelve null:`,
                error,
              )
              return null
            })
        : undefined,
    ])

    const cuerpo: Record<string, unknown> = {}
    if (ordenes !== undefined) cuerpo.ordenes = ordenes
    if (mesas !== undefined) cuerpo.mesas = mesas
    if (notificaciones !== undefined) cuerpo.notificaciones = notificaciones

    return Response.json(cuerpo, {
      // Es un sondeo: no debe cachearse en intermediarios.
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    })
  } catch (error) {
    console.error('[GET /api/sondeo] error:', error)
    return Response.json({ error: 'Error en servidor', codigo: 'SONDEO_ERROR' }, { status: 500 })
  }
}
