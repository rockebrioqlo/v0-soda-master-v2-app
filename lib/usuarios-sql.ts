/**
 * Statements de `db.actualizarUsuario` y `db.eliminarUsuario` con la guarda de administradores y de
 * historial (sesión 14.5b-3: F49 y F50). Módulo sin acceso a la base: solo arma el texto SQL, con el
 * esquema como parámetro, para que `lib/db.ts` lo ejecute con `soda_master` y la prueba
 * (`scripts/pruebas/usuarios.cjs`) lo ejecute EL MISMO TEXTO contra un esquema temporal con una copia de
 * `usuarios` (así se prueba el último admin y la carrera sin tocar al admin real).
 *
 * El driver HTTP de Neon no mantiene transacciones entre `await`: la comprobación y el cambio van en UN
 * statement. El CTE `admins` toma `FOR NO KEY UPDATE` sobre todos los admins activos en orden de `id`
 * (mismo orden en todos los statements: no hay interbloqueos; no choca con las claves foráneas de
 * `sesiones`). En READ COMMITTED, quien llega segundo espera, vuelve a evaluar las filas que el primero
 * ya cambió y ve un admin menos: dos admins que se desactivan entre sí a la vez no pueden dejar al local
 * sin administrador.
 *
 * Parámetros de `actualizar`: $1 id, $2 nombre, $3 email, $4 rol (ya normalizado), $5 roles_adicionales,
 * $6 activo, $7 pin_hash, $8 sesión que se conserva al revocar; sesión 17 (K1): $9 a $11 el actor (id,
 * nombre, rol). La auditoría compara la fila anterior con la nueva dentro del statement: `modificar` lista solo
 * los NOMBRES de los campos que cambiaron (y `pin` si vino un hash nuevo) y `desactivar` sale si `activo` pasa de
 * true a false. Parámetros de `eliminar`: $1 id, $2 a $4 el actor. La entrada de auditoría va en el MISMO
 * statement: si falla, el cambio se revierte con ella.
 */
/**
 * Columnas que apuntan a un usuario y cuentan como HISTORIAL: con una fila así el usuario no se borra
 * (F50). Las 7 primeras tienen clave foránea sin cascada; el resto son columnas UUID sin clave foránea
 * (hallazgo F51: evaluar agregarles la clave) que `DELETE` dejaría huérfanas sin avisar.
 * `empleados.usuario_id` cuenta como historial (decidido el 21-11-2026).
 */
export const REFERENCIAS_HISTORIAL: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['ordenes', 'usuario_id'],
  ['mermas', 'registrado_por'],
  ['mermas', 'responsable_id'],
  ['movimientos_inventario', 'usuario_id'],
  ['descuentos', 'aplicado_por'],
  ['descuentos', 'autorizado_por'],
  ['comandas_no_pagadas', 'autorizado_por'],
  ['pagos', 'cobrado_por'],
  ['cajas', 'usuario_apertura_id'],
  ['cajas', 'usuario_cierre_id'],
  ['movimientos_caja', 'usuario_id'],
  ['auditoria_admin', 'usuario_id'],
  ['compras', 'usuario_id'],
  ['gastos', 'usuario_id'],
  ['empleados', 'usuario_id'],
  ['perdidas_comanda', 'responsable_id'],
  ['perdidas_comanda', 'autorizado_por'],
  ['permisos_especiales', 'otorgado_por'],
  ['permisos_especiales', 'revocado_por'],
]

/**
 * Referencias que NO son historial y se limpian al borrar un usuario sin historial: `sesiones` y
 * `permisos_especiales.usuario_id` (clave foránea con `ON DELETE CASCADE`) y las notificaciones que
 * le llegaban (sin clave foránea; las borra el mismo statement del `DELETE`).
 */
export const REFERENCIAS_LIMPIABLES: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['sesiones', 'usuario_id'],
  ['permisos_especiales', 'usuario_id'],
  ['notificaciones', 'destinatario_usuario_id'],
]

const ESQUEMA_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/

export function sentenciasUsuarios(esquema: string): { crear: string; actualizar: string; eliminar: string } {
  if (!ESQUEMA_VALIDO.test(esquema)) throw new Error('Esquema inválido')
  const S = esquema

  const admins = `
    admins AS MATERIALIZED (
      SELECT id FROM ${S}.usuarios
      WHERE activo = true AND rol IN ('admin', 'administrador')
      ORDER BY id
      FOR NO KEY UPDATE
    ),
    objetivo AS (
      SELECT id, rol, activo, nombre, email, COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales
      FROM ${S}.usuarios WHERE id = $1::uuid
    )`

  const actualizar = `
    WITH ${admins},
    decision AS (
      SELECT (SELECT count(*) FROM objetivo)::int AS existe,
             (SELECT rol FROM objetivo) AS actual_rol,
             (SELECT activo FROM objetivo) AS actual_activo,
             (SELECT count(*) FROM admins WHERE id <> $1::uuid)::int AS otros
    ),
    upd AS (
      UPDATE ${S}.usuarios u
      SET nombre = COALESCE($2::text, u.nombre),
          email = COALESCE(lower(btrim($3::text)), u.email),
          rol = COALESCE($4::text, u.rol),
          roles_adicionales = COALESCE($5::text[], u.roles_adicionales),
          activo = COALESCE($6::boolean, u.activo),
          pin_hash = COALESCE($7::text, u.pin_hash),
          updated_at = CURRENT_TIMESTAMP
      FROM decision d
      WHERE u.id = $1::uuid
        AND d.existe = 1
        AND NOT (
          COALESCE(d.actual_activo, false) AND d.actual_rol IN ('admin', 'administrador')
          AND ($6::boolean IS FALSE OR ($4::text IS NOT NULL AND $4::text NOT IN ('admin', 'administrador')))
          AND d.otros = 0
        )
      RETURNING u.id, u.email, u.nombre, u.rol,
                COALESCE(u.roles_adicionales, '{}'::text[]) AS roles_adicionales,
                u.activo, u.created_at, u.updated_at
    ),
    dif AS (
      SELECT upd.id, upd.nombre,
        array_remove(ARRAY[
          CASE WHEN o.nombre IS DISTINCT FROM upd.nombre THEN 'nombre'::text END,
          CASE WHEN o.email IS DISTINCT FROM upd.email THEN 'email'::text END,
          CASE WHEN o.rol IS DISTINCT FROM upd.rol THEN 'rol'::text END,
          CASE WHEN o.roles_adicionales IS DISTINCT FROM upd.roles_adicionales THEN 'roles_adicionales'::text END,
          CASE WHEN o.activo IS DISTINCT FROM upd.activo THEN 'activo'::text END,
          CASE WHEN $7::text IS NOT NULL THEN 'pin'::text END
        ]::text[], NULL) AS campos,
        (COALESCE(o.activo, false) AND NOT COALESCE(upd.activo, true)) AS desactiva
      FROM upd JOIN objetivo o ON o.id = upd.id
    ),
    cambios AS (
      SELECT id, nombre, desactiva,
             CASE WHEN desactiva THEN array_remove(campos, 'activo') ELSE campos END AS campos_modificar
      FROM dif
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin
        (usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre, detalles)
      SELECT $9::uuid, $10::text, $11::text, v.accion, 'usuario', c.id, c.nombre, v.detalles
      FROM cambios c
      CROSS JOIN LATERAL (VALUES
        ('modificar'::text, CASE WHEN cardinality(c.campos_modificar) > 0 THEN jsonb_build_object('campos', to_jsonb(c.campos_modificar)) END),
        ('desactivar'::text, CASE WHEN c.desactiva THEN jsonb_build_object('campos', jsonb_build_array('activo')) END)
      ) AS v(accion, detalles)
      WHERE v.detalles IS NOT NULL
    ),
    rev AS (
      UPDATE ${S}.sesiones SET revocada_at = now()
      WHERE usuario_id = $1::uuid AND revocada_at IS NULL
        AND ($7::text IS NOT NULL OR $6::boolean IS FALSE)
        AND ($8::uuid IS NULL OR id <> $8::uuid)
        AND EXISTS (SELECT 1 FROM upd)
      RETURNING id
    )
    SELECT d.existe, d.actual_rol, d.actual_activo, d.otros,
           (SELECT count(*) FROM upd)::int AS aplicado,
           (SELECT count(*) FROM rev)::int AS sesiones_revocadas,
           u.id, u.email, u.nombre, u.rol, u.roles_adicionales, u.activo, u.created_at, u.updated_at
    FROM decision d LEFT JOIN upd u ON true`

  const historial = REFERENCIAS_HISTORIAL.map(
    ([tabla, columna]) => `EXISTS (SELECT 1 FROM ${S}.${tabla} WHERE ${columna} = $1::uuid)`,
  ).join('\n        OR ')

  const eliminar = `
    WITH ${admins},
    decision AS (
      SELECT (SELECT count(*) FROM objetivo)::int AS existe,
             (SELECT rol FROM objetivo) AS actual_rol,
             (SELECT activo FROM objetivo) AS actual_activo,
             (SELECT count(*) FROM admins WHERE id <> $1::uuid)::int AS otros,
             (${historial}) AS historial
    ),
    borrar AS (
      DELETE FROM ${S}.usuarios u
      USING decision d
      WHERE u.id = $1::uuid
        AND d.existe = 1
        AND NOT d.historial
        AND NOT (
          COALESCE(d.actual_activo, false) AND d.actual_rol IN ('admin', 'administrador') AND d.otros = 0
        )
      RETURNING u.id, u.nombre
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin
        (usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre, detalles)
      SELECT $2::uuid, $3::text, $4::text, 'eliminar', 'usuario', borrar.id, borrar.nombre, NULL::jsonb
      FROM borrar
    ),
    notif AS (
      DELETE FROM ${S}.notificaciones
      WHERE destinatario_usuario_id = $1::uuid AND EXISTS (SELECT 1 FROM borrar)
      RETURNING id
    )
    SELECT d.existe, d.actual_rol, d.actual_activo, d.otros, d.historial,
           (SELECT count(*) FROM borrar)::int AS aplicado,
           (SELECT count(*) FROM notif)::int AS notificaciones_borradas
    FROM decision d`

  // Sesión 17 (K1): el alta también deja su entrada de auditoría en el mismo statement.
  // $1 email, $2 nombre, $3 pin_hash, $4 rol, $5 roles_adicionales, $6 activo, $7 actor id, $8 actor nombre,
  // $9 actor rol, $10 detalles (json: solo nombres de campo).
  const crear = `
    WITH ins AS (
      INSERT INTO ${S}.usuarios (email, nombre, pin_hash, rol, roles_adicionales, activo)
      VALUES (lower(btrim($1::text)), $2::text, $3::text, $4::text, $5::text[], $6::boolean)
      RETURNING id, email, nombre, rol, COALESCE(roles_adicionales, '{}'::text[]) AS roles_adicionales,
                activo, created_at, updated_at
    ),
    aud AS (
      INSERT INTO ${S}.auditoria_admin
        (usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre, detalles)
      SELECT $7::uuid, $8::text, $9::text, 'crear', 'usuario', ins.id, ins.nombre, $10::jsonb
      FROM ins
    )
    SELECT id, email, nombre, rol, roles_adicionales, activo, created_at, updated_at FROM ins`

  return { crear, actualizar, eliminar }
}
