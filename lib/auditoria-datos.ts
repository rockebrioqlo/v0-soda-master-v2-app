/**
 * Registro de accesos y cambios a datos personales (sesión 17, K1), sobre `auditoria_admin` (sin tabla nueva).
 * Módulo sin acceso a la base: arma el texto SQL con el esquema como parámetro, para que `lib/db.ts` lo
 * ejecute con `soda_master` y la prueba (`scripts/pruebas/datos-personales.cjs`) ejecute EL MISMO TEXTO contra
 * un esquema temporal `prueba_datos_personales_*` (así se prueba el fallo del registro sin parámetros de
 * prueba en las rutas). Mismo patrón que `usuarios-sql.ts`.
 *
 * Qué se registra (entidad `empleado`, `proveedor` o `usuario`):
 * - `ver_datos_personales`: una entrada por consulta de lista (con la cantidad de filas) y una por detalle
 *   abierto. La vista básica (`id`, `nombre`, `activo`) NO se registra.
 * - `crear`, `modificar`, `desactivar` (y `eliminar` para usuarios): solo el admin. `modificar` lista solo los campos
 *   que CAMBIARON de valor: el mismo statement compara la fila anterior (la que ve su instantánea; un `FOR UPDATE`
 *   no sirve: la fila ya la actualiza el mismo statement) con la nueva, así que un
 *   formulario que reenvía todos los campos no ensucia el registro y un cambio sin diferencias no deja entrada.
 * - En `detalles` van los NOMBRES de los campos tocados (`{"campos":["sueldo_base","telefono"]}`), la cantidad
 *   de filas o la vista; NUNCA un valor (ni documento, ni sueldo, ni PIN, ni correo). `detallesSeguros` lo
 *   comprueba y los constructores de este módulo no aceptan otra cosa.
 *
 * Decisión del usuario (21-11-2026):
 * - El registro de una LECTURA que falla solo se anota en el log y la respuesta sigue (`leerConAuditoria`).
 * - El registro de una MODIFICACIÓN va en el MISMO statement del cambio (CTE con `INSERT … SELECT … FROM <cambio>`):
 *   Postgres lo ejecuta de forma atómica y, si el registro falla, el cambio se revierte con él. (El driver
 *   HTTP de Neon no mantiene transacciones entre `await`: un solo statement es la forma correcta.)
 */
export type EntidadPersonal = 'empleado' | 'proveedor' | 'usuario'
export type AccionPersonal = 'ver_datos_personales' | 'crear' | 'modificar' | 'desactivar' | 'eliminar'

export interface ActorAuditoria {
  id: string
  nombre: string
  rol: string
}

/** Los únicos campos que puede tener `detalles` de estas acciones. */
export type DetallesAcceso = { campos: string[] } | { filas: number; vista: 'detalle' } | { vista: 'detalle' }

// Sesión 18 (ARCOP): las entradas de las solicitudes y de la anonimización llevan, además, el id de la solicitud, su tipo, el
// resultado y los NOMBRES de lo conservado (nunca un valor). Las arma `lib/arco-sql.ts` y `detallesSeguros` las acepta.

const ESQUEMA_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/
const NOMBRE_CAMPO = /^[a-z_][a-z0-9_]{0,40}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS_ARCO = ['acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad']

/** Campos que se pueden tocar en un empleado, un proveedor o un usuario (nombres, nunca valores). */
export const CAMPOS_EMPLEADO_EDITABLES = [
  'nombre', 'cargo', 'documento', 'telefono', 'email', 'sueldo_base', 'periodicidad',
  'fecha_ingreso', 'fecha_egreso', 'activo', 'usuario_id', 'notas',
] as const
export const CAMPOS_PROVEEDOR_EDITABLES = [
  'nombre', 'rut', 'contacto', 'telefono', 'email', 'direccion', 'notas', 'activo',
] as const
export const CAMPOS_USUARIO_EDITABLES = [
  'nombre', 'email', 'rol', 'roles_adicionales', 'activo', 'pin',
] as const

/**
 * Nombres de los campos que el cambio realmente aplica: solo los que traen valor (el servidor usa
 * `COALESCE(nuevo, actual)`, así que `null` o ausente no cambia nada). Nunca los valores.
 */
export function camposAplicados(cambio: Record<string, unknown>, permitidos: readonly string[]): string[] {
  return permitidos.filter((c) => cambio[c] !== undefined && cambio[c] !== null)
}

export function detallesLista(filas: number): { filas: number; vista: 'detalle' } {
  return { filas: Math.max(0, Math.trunc(filas)), vista: 'detalle' }
}

export function detallesDetalle(): { vista: 'detalle' } {
  return { vista: 'detalle' }
}

/**
 * Comprueba que unos `detalles` no llevan valores: solo `campos` (lista de nombres de columna), `filas`
 * (entero) y `vista` (`detalle`). Lo usa la prueba sobre lo que quedó guardado.
 */
export function detallesSeguros(detalles: unknown): boolean {
  if (detalles === null || detalles === undefined) return true
  if (typeof detalles !== 'object' || Array.isArray(detalles)) return false
  for (const [k, v] of Object.entries(detalles as Record<string, unknown>)) {
    if (k === 'campos') {
      if (!Array.isArray(v) || !v.every((c) => typeof c === 'string' && NOMBRE_CAMPO.test(c))) return false
    } else if (k === 'filas') {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false
    } else if (k === 'vista') {
      if (v !== 'detalle') return false
    } else if (k === 'solicitud') {
      // sesión 18 (ARCOP): el id de la solicitud, nunca un valor del titular
      if (typeof v !== 'string' || !UUID.test(v)) return false
    } else if (k === 'tipo') {
      if (typeof v !== 'string' || !TIPOS_ARCO.includes(v)) return false
    } else if (k === 'resultado') {
      if (v !== 'atendida' && v !== 'rechazada' && v !== 'anonimizada') return false
    } else if (k === 'conservado') {
      if (!Array.isArray(v) || !v.every((c) => typeof c === 'string' && NOMBRE_CAMPO.test(c))) return false
    } else {
      return false
    }
  }
  return true
}

/**
 * Lee y registra el acceso. Si el REGISTRO falla, solo se anota en el log y la lectura se devuelve igual
 * (decisión del 21-11-2026). Si falla la lectura misma, el error sube como siempre.
 */
export async function leerConAuditoria<T>(
  leer: () => Promise<T>,
  registrar: (datos: T) => Promise<unknown>,
  log: (mensaje: string, error: unknown) => void = (m, e) => console.error(m, e),
): Promise<T> {
  const datos = await leer()
  try {
    await registrar(datos)
  } catch (error: any) {
    log('Auditoría: no se pudo registrar el acceso a datos personales (la lectura sigue)', {
      codigo: error?.code ?? null,
      mensaje: String(error?.message ?? error),
    })
  }
  return datos
}

interface Tabla {
  tabla: string
  entidad: EntidadPersonal
  salida: readonly string[]
  /** Columnas que entran en el INSERT, con su tipo SQL. */
  insertables: ReadonlyArray<readonly [string, string]>
  /**
   * Columnas que cambia el UPDATE, con su tipo SQL y si admiten NULL (sesión 18, rectificación). El cambio llega como UN
   * json con SOLO las claves presentes: una clave ausente no se toca; una clave con `null` o texto vacío VACÍA la columna
   * (si admite NULL). Una columna que no admite NULL (nombre, sueldo, periodicidad, activo) ignora `null`.
   */
  actualizables: ReadonlyArray<readonly [string, string, boolean]>
}

const TABLAS: Record<'empleados' | 'proveedores', Omit<Tabla, 'salida'>> = {
  empleados: {
    tabla: 'empleados',
    entidad: 'empleado',
    insertables: [
      ['nombre', 'text'], ['cargo', 'text'], ['documento', 'text'], ['telefono', 'text'], ['email', 'text'],
      ['sueldo_base', 'numeric'], ['periodicidad', 'text'], ['fecha_ingreso', 'date'], ['usuario_id', 'uuid'],
      ['notas', 'text'],
    ],
    actualizables: [
      ['nombre', 'text', false], ['cargo', 'text', true], ['documento', 'text', true], ['telefono', 'text', true], ['email', 'text', true],
      ['sueldo_base', 'numeric', false], ['periodicidad', 'text', false], ['fecha_ingreso', 'date', true], ['fecha_egreso', 'date', true],
      ['activo', 'boolean', false], ['usuario_id', 'uuid', true], ['notas', 'text', true],
    ],
  },
  proveedores: {
    tabla: 'proveedores',
    entidad: 'proveedor',
    insertables: [
      ['nombre', 'text'], ['rut', 'text'], ['contacto', 'text'], ['telefono', 'text'], ['email', 'text'],
      ['direccion', 'text'], ['notas', 'text'],
    ],
    actualizables: [
      ['nombre', 'text', false], ['rut', 'text', true], ['contacto', 'text', true], ['telefono', 'text', true], ['email', 'text', true],
      ['direccion', 'text', true], ['notas', 'text', true], ['activo', 'boolean', false],
    ],
  },
}

const COLUMNAS_AUDITORIA =
  'usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre, detalles'

export interface SentenciasPersonal {
  /** $1 solo_activos (boolean). Devuelve la lista completa (detalle) de la entidad. */
  listar: string
  /** $1 solo_activos (boolean). Vista básica: id, nombre, activo. */
  listarBasico: string
  /** $1 id (uuid). */
  porId: string
  /**
   * Crea la fila y registra `crear` en el mismo statement. Parámetros: los insertables en orden
   * (`parametrosCrear`), luego actor (id, nombre, rol) y `detalles` (json).
   */
  crear: string
  /**
   * Cambia la fila y registra `modificar` (solo los campos que cambiaron de valor) y/o `desactivar` (si `activo` pasa de
   * true a false) en el mismo statement. $1 id, $2 el cambio como json (SOLO las claves presentes; `null` o texto vacío en una
   * columna que admite NULL la vacía; sesión 18), $3 a $5 el actor (id, nombre, rol).
   */
  actualizar: string
  insertables: readonly string[]
  actualizables: readonly string[]
}

function sentenciasDe(esquema: string, t: Tabla): SentenciasPersonal {
  if (!ESQUEMA_VALIDO.test(esquema)) throw new Error('Esquema inválido')
  const S = esquema
  const out = t.salida.join(', ')

  const nIns = t.insertables.length
  const valores = t.insertables.map(([, tipo], i) => `$${i + 1}::${tipo}`).join(', ')
  const a = nIns + 1 // $a actor id, $a+1 nombre, $a+2 rol, $a+3 detalles
  const crear = `
    WITH ins AS (
      INSERT INTO ${S}.${t.tabla} (${t.insertables.map(([c]) => c).join(', ')})
      VALUES (${valores})
      RETURNING ${out}
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin (${COLUMNAS_AUDITORIA})
      SELECT $${a}::uuid, $${a + 1}::text, $${a + 2}::text, 'crear', '${t.entidad}', ins.id, ins.nombre, $${a + 3}::jsonb
      FROM ins
    )
    SELECT ${out} FROM ins`

  const sets = t.actualizables
    .map(([c, tipo, anulable]) => {
      const valor = `$2::jsonb->>'${c}'`
      if (!anulable) return `${c} = COALESCE((${valor})::${tipo}, ${c})`
      // clave presente: se aplica (vacío o null = NULL); clave ausente: no se toca
      return `${c} = CASE WHEN $2::jsonb ? '${c}' THEN NULLIF(btrim(${valor}), '')::${tipo} ELSE ${c} END`
    })
    .join(',\n          ')
  const b = 3 // $b actor id, $b+1 nombre, $b+2 rol
  const comparaciones = t.actualizables
    .map(([c]) => `CASE WHEN old.${c} IS DISTINCT FROM upd.${c} THEN '${c}'::text END`)
    .join(',\n          ')
  const actualizar = `
    WITH old AS (
      SELECT ${out} FROM ${S}.${t.tabla} WHERE id = $1::uuid
    ),
    upd AS (
      UPDATE ${S}.${t.tabla} SET
          ${sets},
          updated_at = now()
      WHERE id = $1::uuid
      RETURNING ${out}
    ),
    dif AS (
      SELECT upd.id, upd.nombre,
        array_remove(ARRAY[
          ${comparaciones}
        ]::text[], NULL) AS campos,
        (COALESCE(old.activo, false) AND NOT COALESCE(upd.activo, true)) AS desactiva
      FROM upd JOIN old ON old.id = upd.id
    ),
    cambios AS (
      SELECT id, nombre, desactiva,
             CASE WHEN desactiva THEN array_remove(campos, 'activo') ELSE campos END AS campos_modificar
      FROM dif
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin (${COLUMNAS_AUDITORIA})
      SELECT $${b}::uuid, $${b + 1}::text, $${b + 2}::text, v.accion, '${t.entidad}', c.id, c.nombre, v.detalles
      FROM cambios c
      CROSS JOIN LATERAL (VALUES
        ('modificar'::text, CASE WHEN cardinality(c.campos_modificar) > 0 THEN jsonb_build_object('campos', to_jsonb(c.campos_modificar)) END),
        ('desactivar'::text, CASE WHEN c.desactiva THEN jsonb_build_object('campos', jsonb_build_array('activo')) END)
      ) AS v(accion, detalles)
      WHERE v.detalles IS NOT NULL
    )
    SELECT ${out} FROM upd`

  return {
    listar: `SELECT ${out} FROM ${S}.${t.tabla} WHERE ($1::boolean IS NOT TRUE OR activo) ORDER BY nombre`,
    listarBasico: `SELECT id, nombre, activo FROM ${S}.${t.tabla} WHERE ($1::boolean IS NOT TRUE OR activo) ORDER BY nombre`,
    porId: `SELECT ${out} FROM ${S}.${t.tabla} WHERE id = $1::uuid`,
    crear,
    actualizar,
    insertables: t.insertables.map(([c]) => c),
    actualizables: t.actualizables.map(([c]) => c),
  }
}

/**
 * `columnas` es la lista blanca de salida (`COLUMNAS_EMPLEADO` de `personal-map.ts`; se pasa como parámetro
 * para que este módulo no importe otro y la prueba lo cargue solo con el type stripping de Node).
 */
export function sentenciasEmpleados(esquema: string, columnas: readonly string[]): SentenciasPersonal {
  return sentenciasDe(esquema, { ...TABLAS.empleados, salida: columnas })
}

/** Ver `sentenciasEmpleados`: `columnas` es `COLUMNAS_PROVEEDOR`. */
export function sentenciasProveedores(esquema: string, columnas: readonly string[]): SentenciasPersonal {
  return sentenciasDe(esquema, { ...TABLAS.proveedores, salida: columnas })
}

/**
 * INSERT de una entrada de acceso (lectura). Parámetros: $1 usuario_id, $2 nombre, $3 rol, $4 acción,
 * $5 entidad, $6 entidad_id (o null), $7 entidad_nombre (o null), $8 detalles (json).
 */
export function sentenciaRegistrarAcceso(esquema: string): string {
  if (!ESQUEMA_VALIDO.test(esquema)) throw new Error('Esquema inválido')
  return `
    INSERT INTO ${esquema}.auditoria_admin (${COLUMNAS_AUDITORIA})
    VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::uuid, $7::text, $8::jsonb)
    RETURNING id`
}

/**
 * Lectura de la auditoría (`GET /api/auditoria`). Parámetros: $1 entidad, $2 acción, $3 desde (YYYY-MM-DD),
 * $4 hasta (YYYY-MM-DD, inclusive), $5 límite; todos opcionales salvo el límite. Fechas en America/Santiago.
 * Columnas explícitas.
 */
export function sentenciaLeerAuditoria(esquema: string): string {
  if (!ESQUEMA_VALIDO.test(esquema)) throw new Error('Esquema inválido')
  return `
    SELECT id, usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre, detalles, created_at
    FROM ${esquema}.auditoria_admin
    WHERE ($1::text IS NULL OR entidad = $1::text)
      AND ($2::text IS NULL OR accion = $2::text)
      AND ($3::date IS NULL OR created_at >= ($3::date)::timestamp AT TIME ZONE 'America/Santiago')
      AND ($4::date IS NULL OR created_at < (($4::date) + 1)::timestamp AT TIME ZONE 'America/Santiago')
    ORDER BY created_at DESC, id
    LIMIT $5::int`
}
