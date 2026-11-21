/**
 * SQL de los derechos ARCOP (sesión 18, K1): la tabla `solicitudes_arco`, el ingreso, la prórroga, la resolución, la
 * exportación y la anonimización por titular. Módulo sin acceso a la base y SIN imports en tiempo de ejecución: arma
 * el texto con el esquema como parámetro, para que `lib/db.ts` lo ejecute con `soda_master` y la prueba
 * (`scripts/pruebas/arco-anonimizar.cjs`) ejecute EL MISMO TEXTO contra un esquema temporal `prueba_arco_*` con copias
 * de las tablas (así se prueba sin parámetros de prueba en las rutas y sin dejar usuarios imposibles de borrar).
 *
 * Atomicidad: el driver HTTP de Neon no mantiene transacciones entre `await`; por eso cada operación va en UN solo
 * statement con CTE (como `lib/usuarios-sql.ts` y `lib/auditoria-datos.ts`). Si algo falla (por ejemplo la entrada de
 * auditoria), Postgres revierte el statement entero. En `suprimir`, el CTE `claim` marca la solicitud como resuelta
 * solo si todas las guardas pasan, y TODOS los demás cambios dependen de que ese `claim` haya prosperado: quien llega
 * segundo espera el bloqueo de la fila, la vuelve a evaluar y no cambia nada (`aplicado` = 0).
 *
 * Un detalle de Postgres que condiciona el diseño: dos CTE que actualizan la MISMA fila en un statement no son
 * compatibles (solo una modificación se aplica). Por eso las tablas con varias columnas de nombre (`cajas`,
 * `perdidas_comanda`, `permisos_especiales`, `auditoria_admin`) se actualizan con UN solo `UPDATE` con `CASE` por columna.
 *
 * Excepción documentada a que `auditoria_admin` sea de solo adición (decidida el 21-11-2026): SOLO este statement
 * actualiza `usuario_nombre` y `entidad_nombre` de las entradas del titular; no borra ninguna fila.
 */

export const PLACEHOLDER = {
  usuario: 'Usuario anonimizado',
  empleado: 'Empleado anonimizado',
  proveedor: 'Proveedor anonimizado',
} as const

/** Reemplazo del nombre dentro de texto libre. */
export const TEXTO_REEMPLAZO = '[persona anonimizada]'

/** Un nombre de menos de 3 letras no se busca en texto libre (borraría palabras que lo contienen). */
export const LARGO_MINIMO_NOMBRE = 3

/** Plazo de conservación tributaria en años. */
export const ANIOS_RETENCION = 6

const ESQUEMA_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/
const COLUMNA_VALIDA = /^[a-z_][a-z0-9_]{0,62}$/

// Barras invertidas armadas con una constante: lo que se escribe aquí es lo que ve Postgres (standard_conforming_strings
// activo, sin E''). RE_ESCAPAR es la clase de caracteres especiales de una expresión regular, REEMPLAZO_ESCAPE antepone una
// barra al carácter encontrado (grupo 1) y REEMPLAZO_NOMBRE conserva los límites (grupos 1 y 2) y pone el texto de reemplazo.
const BS = String.fromCharCode(92)
const RE_ESCAPAR = '([.^$*+?(){}|' + BS + '[' + BS + ']' + BS + BS + '])'
const REEMPLAZO_ESCAPE = BS + BS + BS + '1'
const REEMPLAZO_NOMBRE = BS + '1' + TEXTO_REEMPLAZO + BS + '2'

export type TipoTitular = 'usuario' | 'empleado' | 'proveedor'

export interface ColumnaNombre {
  tabla: string
  nombre: string
  id: string
}

export interface OpcionesArco {
  /** Lista blanca de columnas de `empleados` (`COLUMNAS_EMPLEADO`) y de `proveedores` (`COLUMNAS_PROVEEDOR`). */
  columnasEmpleado: readonly string[]
  columnasProveedor: readonly string[]
  /** Las 10 columnas de nombre copiado (`COLUMNAS_NOMBRE_COPIADO` de `arco-reglas.ts`). */
  columnasNombre: readonly ColumnaNombre[]
  /** `ANONIMIZAR_SUELDO` de `arco-reglas.ts` (por defecto `false`: el sueldo y las fechas se conservan). */
  anonimizarSueldo?: boolean
}

function esquemaOk(esquema: string): string {
  if (!ESQUEMA_VALIDO.test(esquema)) throw new Error('Esquema inválido')
  return esquema
}

/** DDL idempotente de `solicitudes_arco` (lo ejecuta `ensureSolicitudesArcoSchema` y la prueba). */
export function sentenciasTablaSolicitudes(esquema: string): string[] {
  const S = esquemaOk(esquema)
  return [
    `CREATE TABLE IF NOT EXISTS ${S}.solicitudes_arco (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo TEXT NOT NULL CHECK (tipo IN ('acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad')),
      titular_tipo TEXT NOT NULL CHECK (titular_tipo IN ('usuario', 'empleado', 'proveedor')),
      titular_id UUID NOT NULL,
      canal TEXT NOT NULL CHECK (canal IN ('presencial', 'correo', 'formulario', 'telefono', 'otro')),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelta', 'rechazada')),
      ingresada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      ingresada_por UUID NULL,
      vence_en DATE NOT NULL,
      prorrogada BOOLEAN NOT NULL DEFAULT FALSE,
      motivo_prorroga TEXT NULL,
      prorrogada_en TIMESTAMPTZ NULL,
      resolucion TEXT NULL,
      resultado JSONB NULL,
      resuelta_por UUID NULL,
      resuelta_en TIMESTAMPTZ NULL,
      CONSTRAINT solicitudes_arco_prorroga_ck CHECK (NOT prorrogada OR (motivo_prorroga IS NOT NULL AND length(btrim(motivo_prorroga)) >= 10 AND prorrogada_en IS NOT NULL)),
      CONSTRAINT solicitudes_arco_resuelta_ck CHECK (estado = 'pendiente' OR resuelta_en IS NOT NULL)
    )`,
    // una sola solicitud pendiente por titular y tipo (409 SOLICITUD_DUPLICADA)
    `CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_arco_pendiente_uk
       ON ${S}.solicitudes_arco (titular_tipo, titular_id, tipo) WHERE estado = 'pendiente'`,
    `CREATE INDEX IF NOT EXISTS solicitudes_arco_vence_idx ON ${S}.solicitudes_arco (estado, vence_en)`,
  ]
}

const HOY = `(now() AT TIME ZONE 'America/Santiago')::date`
const COLUMNAS_AUDITORIA = 'usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre, detalles'

/** Columnas de una solicitud (la fecha de vencimiento como texto AAAA-MM-DD). */
function colsSol(alias: string): string {
  const a = alias
  return `${a}.id, ${a}.tipo, ${a}.titular_tipo, ${a}.titular_id, ${a}.canal, ${a}.estado, ${a}.ingresada_en, ${a}.ingresada_por,
      to_char(${a}.vence_en, 'YYYY-MM-DD') AS vence_en, ${a}.prorrogada, ${a}.motivo_prorroga, ${a}.prorrogada_en,
      ${a}.resolucion, ${a}.resultado, ${a}.resuelta_por, ${a}.resuelta_en`
}

export interface SentenciasExportar {
  usuario: { ficha: string; empleado_vinculado: string; actividad: string; auditoria: string; sesiones: string; intentos_login: string }
  empleado: { ficha: string; gastos: string }
  proveedor: { ficha: string; compras: string; gastos: string; activos: string }
}

export interface SentenciasArco {
  /** $1 tipo, $2 titular_tipo, $3 titular_id, $4 canal, $5 a $7 actor (id, nombre, rol). Cero filas = el titular no existe. */
  crear: string
  /** $1 estado (o null), $2 límite. */
  listar: string
  /** $1 id. */
  porId: string
  /** $1 id, $2 motivo, $3 a $5 actor. Devuelve hechos: `existe`, `aplicado`, `estado`, `prorrogada`, `vence_pasada`, `vence_en`. */
  prorrogar: string
  /** $1 id, $2 resultado ('atendida' o 'rechazada'), $3 respuesta, $4 a $6 actor. Devuelve `existe`, `aplicado`, `tipo`, `estado`, `estado_nuevo`. */
  resolver: string
  /** $1 solicitud, $2 a $4 actor. Una sentencia por tipo de titular. */
  suprimir: Record<TipoTitular, string>
  /** $1 id del titular. */
  exportar: SentenciasExportar
}

export function sentenciasArco(esquema: string, opciones: OpcionesArco): SentenciasArco {
  const S = esquemaOk(esquema)
  for (const c of opciones.columnasNombre) {
    if (![c.tabla, c.nombre, c.id].every((x) => COLUMNA_VALIDA.test(x))) throw new Error('Columna inválida')
  }
  for (const c of [...opciones.columnasEmpleado, ...opciones.columnasProveedor]) {
    if (!COLUMNA_VALIDA.test(c)) throw new Error('Columna inválida')
  }

  // ───────── ingreso ─────────
  const crear = `
    WITH titular AS (
      SELECT id FROM ${S}.usuarios WHERE $2::text = 'usuario' AND id = $3::uuid
      UNION ALL SELECT id FROM ${S}.empleados WHERE $2::text = 'empleado' AND id = $3::uuid
      UNION ALL SELECT id FROM ${S}.proveedores WHERE $2::text = 'proveedor' AND id = $3::uuid
    ),
    ins AS (
      INSERT INTO ${S}.solicitudes_arco (tipo, titular_tipo, titular_id, canal, ingresada_por, vence_en)
      SELECT $1::text, $2::text, t.id, $4::text, $5::uuid, (${HOY} + 30)
      FROM titular t
      RETURNING *
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin (${COLUMNAS_AUDITORIA})
      SELECT $5::uuid, $6::text, $7::text, 'crear', 'solicitud_arco', ins.id, NULL,
             jsonb_build_object('solicitud', ins.id, 'tipo', ins.tipo)
      FROM ins
    )
    SELECT ${colsSol('ins')} FROM ins`

  const nombreTitular = (a: string) => `CASE ${a}.titular_tipo
        WHEN 'usuario' THEN (SELECT nombre FROM ${S}.usuarios WHERE id = ${a}.titular_id)
        WHEN 'empleado' THEN (SELECT nombre FROM ${S}.empleados WHERE id = ${a}.titular_id)
        ELSE (SELECT nombre FROM ${S}.proveedores WHERE id = ${a}.titular_id) END`
  const vista = `
    SELECT ${colsSol('s')}, (s.vence_en - ${HOY})::int AS dias_restantes, ${nombreTitular('s')} AS titular_nombre
    FROM ${S}.solicitudes_arco s`
  const listar = `${vista}
    WHERE ($1::text IS NULL OR s.estado = $1::text)
    ORDER BY (s.estado = 'pendiente') DESC, s.vence_en, s.ingresada_en DESC
    LIMIT $2::int`
  const porId = `${vista} WHERE s.id = $1::uuid`

  // ───────── prórroga: una sola vez, solo pendiente y antes del vencimiento ─────────
  const prorrogar = `
    WITH s AS (SELECT * FROM ${S}.solicitudes_arco WHERE id = $1::uuid),
    upd AS (
      UPDATE ${S}.solicitudes_arco t
      SET prorrogada = TRUE, motivo_prorroga = btrim($2::text), prorrogada_en = now(), vence_en = t.vence_en + 30
      WHERE t.id = $1::uuid AND t.estado = 'pendiente' AND NOT t.prorrogada AND t.vence_en >= ${HOY}
      RETURNING t.*
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin (${COLUMNAS_AUDITORIA})
      SELECT $3::uuid, $4::text, $5::text, 'prorrogar', 'solicitud_arco', upd.id, NULL,
             jsonb_build_object('solicitud', upd.id, 'tipo', upd.tipo)
      FROM upd
    )
    SELECT (SELECT count(*) FROM s)::int AS existe,
           (SELECT count(*) FROM upd)::int AS aplicado,
           COALESCE((SELECT estado FROM upd), (SELECT estado FROM s)) AS estado,
           COALESCE((SELECT prorrogada FROM upd), (SELECT prorrogada FROM s)) AS prorrogada,
           COALESCE((SELECT vence_en < ${HOY} FROM s), FALSE) AS vence_pasada,
           to_char(COALESCE((SELECT vence_en FROM upd), (SELECT vence_en FROM s)), 'YYYY-MM-DD') AS vence_en`

  // ───────── resolución (acceso, portabilidad, rectificación, oposición; una supresión solo se rechaza aquí) ─────────
  const resolver = `
    WITH s AS (SELECT * FROM ${S}.solicitudes_arco WHERE id = $1::uuid),
    upd AS (
      UPDATE ${S}.solicitudes_arco t
      SET estado = CASE WHEN $2::text = 'atendida' THEN 'resuelta' ELSE 'rechazada' END,
          resolucion = $3::text, resuelta_por = $4::uuid, resuelta_en = now()
      WHERE t.id = $1::uuid AND t.estado = 'pendiente' AND ($2::text = 'rechazada' OR t.tipo <> 'supresion')
      RETURNING t.*
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin (${COLUMNAS_AUDITORIA})
      SELECT $4::uuid, $5::text, $6::text, 'resolver', 'solicitud_arco', upd.id, NULL,
             jsonb_build_object('solicitud', upd.id, 'tipo', upd.tipo, 'resultado', $2::text)
      FROM upd
    )
    SELECT (SELECT count(*) FROM s)::int AS existe,
           (SELECT count(*) FROM upd)::int AS aplicado,
           (SELECT tipo FROM s) AS tipo,
           (SELECT estado FROM s) AS estado,
           (SELECT estado FROM upd) AS estado_nuevo`

  // ───────── anonimización ─────────
  const ph = PLACEHOLDER
  const claim = `EXISTS (SELECT 1 FROM claim)`
  // patrón del nombre completo entre límites de palabra, con los caracteres especiales escapados
  const patron = (origen: string) => `
      nom_${origen} AS (
        SELECT CASE WHEN length(btrim(n.nombre)) >= ${LARGO_MINIMO_NOMBRE}
                    THEN '(^|[^[:alnum:]_])' || regexp_replace(btrim(n.nombre), '${RE_ESCAPAR}', '${REEMPLAZO_ESCAPE}', 'g') || '($|[^[:alnum:]_])'
               END AS p
        FROM ${origen} n
      )`
  // reemplazo (dos pasadas: el límite consume el carácter vecino y dos menciones pegadas no se alcanzarían en una)
  const reemplazar = (col: string, nom: string) =>
    `CASE WHEN (SELECT p FROM ${nom}) IS NULL THEN ${col}
          ELSE regexp_replace(regexp_replace(${col}, (SELECT p FROM ${nom}), '${REEMPLAZO_NOMBRE}', 'gi'), (SELECT p FROM ${nom}), '${REEMPLAZO_NOMBRE}', 'gi') END`
  const contiene = (col: string, nom: string) => `((SELECT p FROM ${nom}) IS NOT NULL AND ${col} ~* (SELECT p FROM ${nom}))`

  const jsonLista = (items: string[]) => `'${JSON.stringify(items)}'::jsonb`

  function suprimirDe(tt: TipoTitular): string {
    const ctes: string[] = []
    const conUsuario = tt === 'usuario' || tt === 'empleado'
    ctes.push(`sol AS (SELECT id, tipo, estado, titular_tipo, titular_id FROM ${S}.solicitudes_arco WHERE id = $1::uuid AND titular_tipo = '${tt}')`)
    if (conUsuario) {
      // mismo patrón que `usuarios-sql.ts`: todos los admins activos bloqueados en orden de id, para no dejar al local sin administrador
      ctes.push(`admins AS MATERIALIZED (
        SELECT id FROM ${S}.usuarios WHERE activo = true AND rol IN ('admin', 'administrador') ORDER BY id FOR NO KEY UPDATE
      )`)
    }
    if (tt === 'usuario') {
      ctes.push(`tit AS (SELECT id, nombre, email FROM ${S}.usuarios WHERE id = (SELECT titular_id FROM sol))`)
      ctes.push(`uobj AS (SELECT id, nombre, email, rol, activo FROM ${S}.usuarios WHERE id = (SELECT id FROM tit))`)
    } else if (tt === 'empleado') {
      ctes.push(`tit AS (SELECT id, nombre, usuario_id FROM ${S}.empleados WHERE id = (SELECT titular_id FROM sol))`)
      ctes.push(`uobj AS (SELECT id, nombre, email, rol, activo FROM ${S}.usuarios WHERE id = (SELECT usuario_id FROM tit))`)
    } else {
      ctes.push(`tit AS (SELECT id, nombre FROM ${S}.proveedores WHERE id = (SELECT titular_id FROM sol))`)
    }
    const yaCond =
      tt === 'usuario' ? `nombre = '${ph.usuario}' AND starts_with(email, 'anonimizado-')` : tt === 'empleado' ? `nombre = '${ph.empleado}'` : `nombre = '${ph.proveedor}'`
    ctes.push(`decision AS (
        SELECT (SELECT count(*) FROM sol)::int AS sol_existe,
               (SELECT tipo FROM sol) AS sol_tipo,
               (SELECT estado FROM sol) AS sol_estado,
               (SELECT count(*) FROM tit)::int AS existe,
               COALESCE((SELECT ${yaCond} FROM tit), FALSE) AS ya,
               ${conUsuario ? `COALESCE((SELECT id FROM uobj) = $2::uuid, FALSE)` : 'FALSE'} AS self,
               ${conUsuario
                 ? `(COALESCE((SELECT activo AND rol IN ('admin', 'administrador') FROM uobj), FALSE)
                   AND (SELECT count(*) FROM admins WHERE id IS DISTINCT FROM (SELECT id FROM uobj)) = 0)`
                 : 'FALSE'} AS ultimo
      )`)
    ctes.push(`go AS (
        SELECT (sol_existe = 1 AND sol_tipo = 'supresion' AND sol_estado = 'pendiente' AND existe = 1 AND NOT ya AND NOT self AND NOT ultimo) AS ok
        FROM decision
      )`)

    // lo anonimizado y lo conservado (solo nombres de campo)
    let anonimizado: string[]
    let conservadoBase: string[]
    let extraAnon = ''
    let extraCons = ''
    if (tt === 'usuario') {
      anonimizado = ['nombre', 'email', 'pin', 'sesiones', 'intentos_login', 'nombre_en_registros', 'nombre_en_notas']
      conservadoBase = ['ventas_pagos_y_caja', 'registro_de_auditoria']
    } else if (tt === 'empleado') {
      anonimizado = ['nombre', 'documento', 'telefono', 'email', 'notas']
      conservadoBase = []
      if (opciones.anonimizarSueldo) anonimizado.push('sueldo_y_fechas_laborales')
      else conservadoBase.push('sueldo_y_fechas_laborales')
      extraAnon = ` || CASE WHEN (SELECT count(*) FROM uobj) = 1 THEN '["usuario_vinculado","nombre_en_registros","nombre_en_notas"]'::jsonb ELSE '[]'::jsonb END`
      extraCons = ` || CASE WHEN (SELECT count(*) FROM uobj) = 1 THEN '["ventas_pagos_y_caja"]'::jsonb ELSE '[]'::jsonb END`
    } else {
      anonimizado = ['nombre', 'contacto', 'telefono', 'email', 'direccion', 'notas']
      conservadoBase = []
      ctes.push(`ret AS (
        SELECT (EXISTS (SELECT 1 FROM ${S}.compras c WHERE c.proveedor_id = (SELECT id FROM tit) AND c.fecha >= ${HOY} - interval '${ANIOS_RETENCION} years')
             OR EXISTS (SELECT 1 FROM ${S}.gastos g WHERE g.proveedor_id = (SELECT id FROM tit) AND g.fecha >= ${HOY} - interval '${ANIOS_RETENCION} years')
             OR EXISTS (SELECT 1 FROM ${S}.activos a WHERE a.proveedor_id = (SELECT id FROM tit) AND a.fecha_compra >= ${HOY} - interval '${ANIOS_RETENCION} years')) AS rut_retenido,
               (EXISTS (SELECT 1 FROM ${S}.compras c WHERE c.proveedor_id = (SELECT id FROM tit))
             OR EXISTS (SELECT 1 FROM ${S}.gastos g WHERE g.proveedor_id = (SELECT id FROM tit))
             OR EXISTS (SELECT 1 FROM ${S}.activos a WHERE a.proveedor_id = (SELECT id FROM tit))) AS tiene_registros
      )`)
      extraAnon = ` || CASE WHEN (SELECT rut_retenido FROM ret) THEN '[]'::jsonb ELSE '["rut"]'::jsonb END`
      extraCons = ` || CASE WHEN (SELECT tiene_registros FROM ret) THEN '["compras_y_gastos"]'::jsonb ELSE '[]'::jsonb END || CASE WHEN (SELECT rut_retenido FROM ret) THEN '["rut"]'::jsonb ELSE '[]'::jsonb END`
    }
    ctes.push(`res AS (SELECT jsonb_build_object(
        'anonimizado', ${jsonLista(anonimizado)}${extraAnon},
        'conservado', ${jsonLista(conservadoBase)}${extraCons}) AS j)`)
    ctes.push(`claim AS (
        UPDATE ${S}.solicitudes_arco t
        SET estado = 'resuelta', resultado = (SELECT j FROM res), resuelta_por = $2::uuid, resuelta_en = now()
        WHERE t.id = $1::uuid AND t.titular_tipo = '${tt}' AND t.tipo = 'supresion' AND t.estado = 'pendiente' AND (SELECT ok FROM go)
        RETURNING t.id
      )`)

    // nombres para el texto libre
    ctes.push(patron('tit').trim())
    if (tt === 'empleado') ctes.push(patron('uobj').trim())
    const nomUsuario = tt === 'usuario' ? 'nom_tit' : 'nom_uobj'

    const cambios: string[] = [] // nombres de CTE de cambio (para contarlos al final)
    const add = (nombre: string, texto: string) => {
      ctes.push(`${nombre} AS (${texto})`)
      cambios.push(nombre)
    }

    // ── la cuenta de usuario (el titular, o el usuario vinculado al empleado) ──
    if (conUsuario) {
      const em = `(SELECT lower(btrim(email)) FROM uobj)`
      add('u_upd', `UPDATE ${S}.usuarios u
        SET nombre = '${ph.usuario}', email = 'anonimizado-' || u.id::text || '@anonimizado.invalid', pin_hash = '!anonimizado',
            activo = FALSE, updated_at = now()
        WHERE u.id = (SELECT id FROM uobj) AND ${claim} RETURNING u.id`)
      add('u_ses', `UPDATE ${S}.sesiones SET revocada_at = now()
        WHERE usuario_id = (SELECT id FROM uobj) AND revocada_at IS NULL AND ${claim} RETURNING id`)
      add('u_int', `DELETE FROM ${S}.intentos_login
        WHERE ${claim} AND (clave = 'ug:' || ${em} OR starts_with(clave, 'ui:' || ${em} || '|') OR starts_with(clave, 'u:' || ${em} || '|'))
        RETURNING clave`)
      // una sola UPDATE por tabla (las columnas de nombre de una misma fila se cambian juntas)
      const porTabla = new Map<string, ColumnaNombre[]>()
      for (const c of opciones.columnasNombre) porTabla.set(c.tabla, [...(porTabla.get(c.tabla) ?? []), c])
      for (const [tabla, cols] of porTabla) {
        const sets = cols.map((c) => `${c.nombre} = CASE WHEN t.${c.id} = (SELECT id FROM uobj) THEN '${ph.usuario}' ELSE t.${c.nombre} END`)
        const cond = cols.map((c) => `t.${c.id} = (SELECT id FROM uobj)`)
        if (tabla === 'auditoria_admin') {
          // las entradas SOBRE el titular (entidad_nombre, la 11.ª columna) en la misma UPDATE
          sets.push(`entidad_nombre = CASE
              WHEN t.entidad_nombre IS NOT NULL AND t.entidad = 'usuario' AND t.entidad_id = (SELECT id FROM uobj) THEN '${ph.usuario}'
              ${tt === 'empleado' ? `WHEN t.entidad_nombre IS NOT NULL AND t.entidad = 'empleado' AND t.entidad_id = (SELECT id FROM tit) THEN '${ph.empleado}'` : ''}
              ELSE t.entidad_nombre END`)
          cond.push(`(t.entidad = 'usuario' AND t.entidad_id = (SELECT id FROM uobj))`)
          if (tt === 'empleado') cond.push(`(t.entidad = 'empleado' AND t.entidad_id = (SELECT id FROM tit))`)
        }
        add(`n_${tabla}`, `UPDATE ${S}.${tabla} t SET ${sets.join(', ')} WHERE ${claim} AND (${cond.join(' OR ')}) RETURNING 1`)
      }
      if (tt === 'empleado' && !porTabla.has('auditoria_admin')) throw new Error('Falta auditoria_admin en las columnas de nombre')
      // texto libre generado por la app: "autorizó X", "responsable X", "por X", "Ajuste manual por X"
      add('t_ordenes', `UPDATE ${S}.ordenes o SET notas = ${reemplazar('o.notas', nomUsuario)}
        WHERE ${claim} AND ${contiene('o.notas', nomUsuario)} RETURNING o.id`)
      add('t_movinv', `UPDATE ${S}.movimientos_inventario m SET notas = ${reemplazar('m.notas', nomUsuario)}
        WHERE ${claim} AND ${contiene('m.notas', nomUsuario)} RETURNING m.id`)
    }

    // ── la ficha del titular ──
    if (tt === 'empleado') {
      const sueldo = opciones.anonimizarSueldo ? `, sueldo_base = 0, cargo = NULL, fecha_ingreso = NULL, fecha_egreso = NULL` : ''
      add('e_upd', `UPDATE ${S}.empleados e
        SET nombre = '${ph.empleado}', documento = NULL, telefono = NULL, email = NULL, notas = NULL, activo = FALSE${sueldo}, updated_at = now()
        WHERE e.id = (SELECT id FROM tit) AND ${claim} RETURNING e.id`)
      add('e_gas', `UPDATE ${S}.gastos g SET descripcion = ${reemplazar('g.descripcion', 'nom_tit')}, notas = ${reemplazar('g.notas', 'nom_tit')}
        WHERE g.empleado_id = (SELECT id FROM tit) AND ${claim} AND (${contiene('g.descripcion', 'nom_tit')} OR ${contiene('g.notas', 'nom_tit')}) RETURNING g.id`)
    }
    if (tt === 'proveedor') {
      add('p_upd', `UPDATE ${S}.proveedores p
        SET nombre = '${ph.proveedor}', contacto = NULL, telefono = NULL, email = NULL, direccion = NULL, notas = NULL,
            rut = CASE WHEN (SELECT rut_retenido FROM ret) THEN p.rut ELSE NULL END, activo = FALSE, updated_at = now()
        WHERE p.id = (SELECT id FROM tit) AND ${claim} RETURNING p.id`)
      add('p_gas', `UPDATE ${S}.gastos g SET descripcion = ${reemplazar('g.descripcion', 'nom_tit')}, notas = ${reemplazar('g.notas', 'nom_tit')}
        WHERE g.proveedor_id = (SELECT id FROM tit) AND ${claim} AND (${contiene('g.descripcion', 'nom_tit')} OR ${contiene('g.notas', 'nom_tit')}) RETURNING g.id`)
      add('p_com', `UPDATE ${S}.compras c SET notas = ${reemplazar('c.notas', 'nom_tit')}
        WHERE c.proveedor_id = (SELECT id FROM tit) AND ${claim} AND ${contiene('c.notas', 'nom_tit')} RETURNING c.id`)
      add('p_act', `UPDATE ${S}.activos a SET descripcion = ${reemplazar('a.descripcion', 'nom_tit')}, notas = ${reemplazar('a.notas', 'nom_tit')}
        WHERE a.proveedor_id = (SELECT id FROM tit) AND ${claim} AND (${contiene('a.descripcion', 'nom_tit')} OR ${contiene('a.notas', 'nom_tit')}) RETURNING a.id`)
    }

    // ── auditoría: la entrada del titular, la de la cuenta vinculada y la resolución de la solicitud (solo nombres de campo) ──
    ctes.push(`aud AS (
        INSERT INTO ${S}.auditoria_admin (${COLUMNAS_AUDITORIA})
        SELECT $2::uuid, $3::text, $4::text, 'anonimizar', '${tt}', tit.id, NULL,
               jsonb_build_object('solicitud', $1::uuid, 'campos', (SELECT j FROM res) -> 'anonimizado', 'conservado', (SELECT j FROM res) -> 'conservado')
        FROM tit WHERE ${claim}
        ${tt === 'empleado'
          ? `UNION ALL
        SELECT $2::uuid, $3::text, $4::text, 'anonimizar', 'usuario', uobj.id, NULL,
               jsonb_build_object('solicitud', $1::uuid, 'campos', '["nombre","email","pin","sesiones","intentos_login","nombre_en_registros","nombre_en_notas"]'::jsonb, 'conservado', '["ventas_pagos_y_caja","registro_de_auditoria"]'::jsonb)
        FROM uobj WHERE ${claim}`
          : ''}
        UNION ALL
        SELECT $2::uuid, $3::text, $4::text, 'resolver', 'solicitud_arco', $1::uuid, NULL,
               jsonb_build_object('solicitud', $1::uuid, 'tipo', 'supresion', 'resultado', 'anonimizada')
        WHERE ${claim}
      )`)

    const conteos = cambios.map((c) => `'${c}', (SELECT count(*) FROM ${c})`).join(', ')
    return `
    WITH ${ctes.join(',\n    ')}
    SELECT d.sol_existe, d.sol_tipo, d.sol_estado, d.existe, d.ya, d.self, d.ultimo,
           (SELECT count(*) FROM claim)::int AS aplicado,
           (SELECT j FROM res) AS resultado,
           jsonb_build_object(${conteos}) AS conteos
    FROM decision d`
  }

  // ───────── exportación (lecturas; las consultas se ejecutan después de registrar la auditoría) ─────────
  const colsE = opciones.columnasEmpleado.join(', ')
  const colsP = opciones.columnasProveedor.join(', ')
  const cuentaUsuario = (tabla: string, cond: string, etiqueta = tabla) => `SELECT '${etiqueta}' AS tabla, count(*)::int AS n FROM ${S}.${tabla} WHERE ${cond}`
  const correoDe = `(SELECT lower(btrim(email)) FROM ${S}.usuarios WHERE id = $1::uuid)`
  const exportar: SentenciasExportar = {
    usuario: {
      ficha: `SELECT id, email, nombre, rol, roles_adicionales, activo, created_at, updated_at FROM ${S}.usuarios WHERE id = $1::uuid`,
      empleado_vinculado: `SELECT ${colsE} FROM ${S}.empleados WHERE usuario_id = $1::uuid ORDER BY created_at`,
      actividad: [
        cuentaUsuario('ordenes', 'usuario_id = $1::uuid'),
        cuentaUsuario('pagos', 'cobrado_por = $1::uuid'),
        cuentaUsuario('cajas', 'usuario_apertura_id = $1::uuid OR usuario_cierre_id = $1::uuid'),
        cuentaUsuario('movimientos_caja', 'usuario_id = $1::uuid'),
        cuentaUsuario('movimientos_inventario', 'usuario_id = $1::uuid'),
        cuentaUsuario('descuentos', 'aplicado_por = $1::uuid OR autorizado_por = $1::uuid'),
        cuentaUsuario('mermas', 'registrado_por = $1::uuid OR responsable_id = $1::uuid'),
        cuentaUsuario('compras', 'usuario_id = $1::uuid'),
        cuentaUsuario('gastos', 'usuario_id = $1::uuid'),
        cuentaUsuario('perdidas_comanda', 'autorizado_por = $1::uuid OR responsable_id = $1::uuid OR resuelto_por_id = $1::uuid'),
        cuentaUsuario('permisos_especiales', 'usuario_id = $1::uuid OR otorgado_por = $1::uuid OR revocado_por = $1::uuid'),
        cuentaUsuario('notificaciones', 'destinatario_usuario_id = $1::uuid'),
        cuentaUsuario('sesiones', 'usuario_id = $1::uuid'),
      ].join('\n      UNION ALL '),
      auditoria: `SELECT accion, entidad, created_at FROM ${S}.auditoria_admin WHERE usuario_id = $1::uuid OR entidad_id = $1::uuid ORDER BY created_at DESC LIMIT 2000`,
      sesiones: `SELECT creada, expira, revocada_at, ultima_actividad FROM ${S}.sesiones WHERE usuario_id = $1::uuid ORDER BY creada DESC LIMIT 2000`,
      intentos_login: `SELECT clave, fallidos, bloqueos, actualizado, ultimo_exito FROM ${S}.intentos_login
        WHERE clave = 'ug:' || ${correoDe} OR starts_with(clave, 'ui:' || ${correoDe} || '|') OR starts_with(clave, 'u:' || ${correoDe} || '|')
        ORDER BY actualizado DESC LIMIT 2000`,
    },
    empleado: {
      ficha: `SELECT ${colsE} FROM ${S}.empleados WHERE id = $1::uuid`,
      gastos: `SELECT id, fecha, tipo, categoria, monto, descripcion FROM ${S}.gastos WHERE empleado_id = $1::uuid ORDER BY fecha DESC, created_at DESC LIMIT 2000`,
    },
    proveedor: {
      ficha: `SELECT ${colsP} FROM ${S}.proveedores WHERE id = $1::uuid`,
      compras: `SELECT id, fecha, tipo_documento, numero_documento, total FROM ${S}.compras WHERE proveedor_id = $1::uuid ORDER BY fecha DESC, created_at DESC LIMIT 2000`,
      gastos: `SELECT id, fecha, tipo, categoria, monto, descripcion FROM ${S}.gastos WHERE proveedor_id = $1::uuid ORDER BY fecha DESC, created_at DESC LIMIT 2000`,
      activos: `SELECT id, nombre, fecha_compra, costo_compra FROM ${S}.activos WHERE proveedor_id = $1::uuid ORDER BY fecha_compra DESC LIMIT 2000`,
    },
  }

  return {
    crear,
    listar,
    porId,
    prorrogar,
    resolver,
    suprimir: { usuario: suprimirDe('usuario'), empleado: suprimirDe('empleado'), proveedor: suprimirDe('proveedor') },
    exportar,
  }
}
