import { getServerTimeInfo } from '@/lib/server-time'
import { fechaHoyZonaNegocio, ZONA_HORARIA_NEGOCIO } from '@/lib/fechas'

// Hora autoritativa del sistema. El frontend la consulta para no
// depender del reloj del computador del cajero.
//
// Es de paso "lectura barata": el servicio cachea por 10 minutos la
// sincronización contra `ntp.shoa.cl` (con fallback HTTPS), así que
// la mayoría de las llamadas resuelven en memoria.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const forzar = searchParams.get('forzar') === 'true' || searchParams.get('forzar') === '1'
    const info = await getServerTimeInfo({ forzar })

    // Fecha local del negocio (no del usuario). Útil para que la UI
    // sepa "qué día es hoy según el sistema" sin tener que parsear
    // el ISO en zona.
    const fechaNegocio = fechaHoyZonaNegocio()

    return Response.json({
      ok: true,
      now_ms: info.now_ms,
      now_iso: info.now_iso,
      zona_negocio: ZONA_HORARIA_NEGOCIO,
      fecha_hoy: fechaNegocio,
      sync: {
        source: info.source,
        endpoint: info.endpoint,
        offset_ms: Math.round(info.offset_ms),
        synced_at_ms: info.synced_at_ms,
        cache_age_ms: Math.round(info.cache_age_ms),
      },
    })
  } catch (error) {
    console.error('GET /api/hora error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
