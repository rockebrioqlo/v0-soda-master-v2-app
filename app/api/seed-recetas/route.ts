import { runSeedRecetasBase } from '@/lib/seed-recetas'
import { bloquearSeedSiNoPermitido } from '@/lib/seed-guard'

/** POST /api/seed-recetas — crea insumos y recetas base sin borrar datos existentes */
export async function POST() {
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
