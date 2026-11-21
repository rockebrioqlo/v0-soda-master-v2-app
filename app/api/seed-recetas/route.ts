import { runSeedRecetasBase } from '@/lib/seed-recetas'
import { bloquearSeedSiNoPermitido } from '@/lib/seed-guard'
import { requireAcceso } from '@/lib/sesion'

/** POST /api/seed-recetas — crea insumos y recetas base sin borrar datos existentes */
export async function POST(request: Request) {
  // F13 (14.5b-1): sesión y rol (solo admin, por la tabla del proxy) también dentro de la ruta.
  const s = await requireAcceso(request)
  if (!s.ok) return s.respuesta
  const bloqueo = bloquearSeedSiNoPermitido()
  if (bloqueo) return bloqueo

  try {
    const result = await runSeedRecetasBase()
    return Response.json({
      message: 'Insumos y recetas base creados/actualizados',
      ...result,
    })
  } catch (error) {
    console.error('[seed-recetas] error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
