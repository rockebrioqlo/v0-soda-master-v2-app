/**
 * Purga oportunista de `sesiones` y `notificaciones` (sesión 17, K1; decidida el 21-11-2026). Módulo sin
 * acceso a la base: arma el texto SQL con el esquema como parámetro (la prueba ejecuta el MISMO texto en un
 * esquema temporal `prueba_datos_personales_*`) y trae el envoltorio que no deja que un fallo de la purga
 * llegue al login.
 *
 * - `sesiones`: se borran las revocadas o vencidas hace MÁS de 90 días (`revocada_at` o `expira` anteriores a
 *   ahora menos 90 días). Una sesión vigente nunca cumple eso (`expira` es el tope absoluto, futuro).
 * - `notificaciones`: las de más de 90 días (`creado_at`).
 * - Cada pasada borra a lo más `LIMITE_PURGA` filas por tabla (Postgres no admite `LIMIT` en `DELETE`: va como
 *   `DELETE … WHERE id IN (SELECT id … LIMIT n)`); una purga grande se reparte entre varios logins. Un solo
 *   statement para las dos tablas. `FOR UPDATE SKIP LOCKED` evita esperar si dos logins purgan a la vez.
 * - Se ejecuta tras un ingreso correcto, después de enviar la respuesta (`after()` en la ruta de login): ni
 *   bloquea ni demora el login, y un fallo solo queda en el log.
 */

export const LIMITE_PURGA = 200
export const DIAS_PURGA = 90

const ESQUEMA_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/

/** Parámetros: $1 límite por tabla, $2 días. Devuelve una fila `{ sesiones, notificaciones }` con lo borrado. */
export function sentenciaPurga(esquema: string): string {
  if (!ESQUEMA_VALIDO.test(esquema)) throw new Error('Esquema inválido')
  const S = esquema
  return `
    WITH s AS (
      DELETE FROM ${S}.sesiones
      WHERE id IN (
        SELECT id FROM ${S}.sesiones
        WHERE revocada_at < now() - make_interval(days => $2::int)
           OR expira < now() - make_interval(days => $2::int)
        ORDER BY id
        LIMIT $1::int
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    ),
    n AS (
      DELETE FROM ${S}.notificaciones
      WHERE id IN (
        SELECT id FROM ${S}.notificaciones
        WHERE creado_at < now() - make_interval(days => $2::int)
        ORDER BY id
        LIMIT $1::int
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    )
    SELECT (SELECT count(*) FROM s)::int AS sesiones, (SELECT count(*) FROM n)::int AS notificaciones`
}

export type EjecutarSql = (texto: string, parametros: unknown[]) => Promise<any[]>

export interface ResultadoPurga {
  sesiones: number
  notificaciones: number
}

/**
 * Corre la purga y NUNCA lanza: un fallo se anota en el log y devuelve `null`. Siempre deja una línea en el
 * log con lo borrado (también cuando es 0), así se puede comprobar sin leer datos.
 */
export async function purgarSinFallar(
  ejecutar: EjecutarSql,
  esquema: string,
  opciones: { limite?: number; dias?: number } = {},
  log: { info: (m: string) => void; error: (m: string, e: unknown) => void } = {
    info: (m) => console.info(m),
    error: (m, e) => console.error(m, e),
  },
): Promise<ResultadoPurga | null> {
  try {
    const filas = await ejecutar(sentenciaPurga(esquema), [opciones.limite ?? LIMITE_PURGA, opciones.dias ?? DIAS_PURGA])
    const r = { sesiones: Number(filas[0]?.sesiones) || 0, notificaciones: Number(filas[0]?.notificaciones) || 0 }
    log.info(`[purga] sesiones=${r.sesiones} notificaciones=${r.notificaciones}`)
    return r
  } catch (error: any) {
    log.error('[purga] falló y se ignora (el login no se ve afectado)', { codigo: error?.code ?? null, mensaje: String(error?.message ?? error) })
    return null
  }
}
