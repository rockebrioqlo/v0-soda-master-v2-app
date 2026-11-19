/**
 * Candado para las rutas de carga de datos de ejemplo (/api/seed*).
 *
 * Las rutas solo responden si:
 *   1. PERMITIR_SEED === 'true' (variable de entorno, apagada por defecto), y
 *   2. el despliegue NO es producción en Vercel (VERCEL_ENV === 'production'
 *      bloquea siempre, aunque alguien active PERMITIR_SEED por error).
 *
 * Devuelve una respuesta 403 si el seed está bloqueado, o null si se permite.
 * Se llama antes de cualquier consulta a la base.
 */
export function bloquearSeedSiNoPermitido(): Response | null {
  if (process.env.VERCEL_ENV === 'production') {
    return Response.json(
      { error: 'Carga de datos de ejemplo deshabilitada en producción' },
      { status: 403 },
    )
  }
  if (process.env.PERMITIR_SEED !== 'true') {
    return Response.json(
      { error: 'Carga de datos de ejemplo deshabilitada en este entorno (PERMITIR_SEED no está activa)' },
      { status: 403 },
    )
  }
  return null
}
