import { runSeedRecetasBase } from '@/lib/seed-recetas'

/** POST /api/seed-recetas — crea insumos y recetas base sin borrar datos existentes */
export async function POST() {
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
