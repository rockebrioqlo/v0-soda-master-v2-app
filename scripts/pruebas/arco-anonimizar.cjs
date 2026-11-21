/**
 * Bloque C del módulo `arco` (sesión 18, K1): el MISMO texto SQL que ejecuta `lib/db.ts` (`lib/arco-sql.ts`), contra un
 * esquema temporal `prueba_arco_*` con COPIAS de las tablas (`CREATE TABLE … (LIKE soda_master.t INCLUDING ALL)`):
 * nunca se toca una fila de `soda_master` ni se siembra nada en las tablas reales. Así se prueba, sin parámetros de
 * prueba en las rutas, lo que por HTTP no se puede (o dejaría usuarios imposibles de borrar):
 *   - las 10 columnas de nombre copiado en 6 tablas (+ `auditoria_admin.entidad_nombre`) se anonimizan por id y la
 *     de otra persona no se toca; los montos y totales no cambian;
 *   - el reemplazo de nombres en texto libre escapa el nombre (punto, paréntesis, comilla, tilde, corchetes, barra…);
 *   - la regla de retención del proveedor (6 años) y la opción `anonimizarSueldo`;
 *   - las guardas (uno mismo, último admin, ya anonimizado) y que ante un 409 NO cambia nada, ni siquiera el empleado
 *     cuyo usuario vinculado no se puede anonimizar;
 *   - la atomicidad (si falla la entrada de auditoría no queda ningún cambio) y la carrera ×3;
 *   - `vence_en` (+30 días de Santiago), la prórroga única y el vencimiento;
 *   - la cobertura: toda columna `*_nombre` de la base está decidida.
 * Al iniciar elimina los `prueba_arco_*` de corridas abortadas y al terminar (`finally`) el suyo.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const L = require('./lib.cjs')
const { check } = L

exports.nombre = 'arco-anonimizar'

const RAIZ = path.resolve(__dirname, '..', '..')
const importar = (...p) => import('file:///' + path.join(RAIZ, ...p).split(path.sep).join('/'))
const uuid = () => crypto.randomUUID()
const j = (o) => JSON.stringify(o)
const mismoConjunto = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

/** El reemplazo esperado, escrito aquí (la especificación): el nombre completo entre límites de palabra, sin distinguir mayúsculas. */
function esperado(texto, nombre) {
  const esc = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}($|[^\\p{L}\\p{N}_])`, 'giu')
  return texto.replace(re, '$1[persona anonimizada]$2').replace(re, '$1[persona anonimizada]$2')
}

exports.correr = async function (ctx) {
  const { db } = ctx
  console.log('\n[arco] C: el mismo SQL en un esquema temporal prueba_arco_* (10 columnas, montos, guardas, atomicidad, carrera, regex)')
  let AS, RG, M
  try {
    AS = await importar('lib', 'arco-sql.ts')
    RG = await importar('lib', 'arco-reglas.ts')
    M = await importar('lib', 'personal-map.ts')
  } catch (e) {
    check('existen lib/arco-sql.ts, lib/arco-reglas.ts y lib/personal-map.ts', false, String(e.message).slice(0, 200))
    return
  }
  const viejos = await db`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'prueba\_arco\_%'`
  for (const e of viejos) await db.query(`DROP SCHEMA IF EXISTS ${e.schema_name} CASCADE`)
  if (viejos.length) console.log(`  (se eliminaron ${viejos.length} esquema(s) prueba_arco_* de corridas anteriores)`)
  const ES = `prueba_arco_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  const q = (t, p) => db.query(t, p)
  const actor = { id: uuid(), nombre: 'Admin Prueba', rol: 'admin' }
  try {
    await q(`CREATE SCHEMA ${ES}`)
    for (const t of ['usuarios', 'empleados', 'proveedores', 'ordenes', 'pagos', 'cajas', 'movimientos_caja', 'movimientos_inventario', 'perdidas_comanda', 'permisos_especiales', 'auditoria_admin', 'gastos', 'compras', 'activos', 'sesiones', 'intentos_login']) {
      await q(`CREATE TABLE ${ES}.${t} (LIKE soda_master.${t} INCLUDING ALL)`)
    }
    for (const s of AS.sentenciasTablaSolicitudes(ES)) await q(s)
    const SQ = AS.sentenciasArco(ES, { columnasEmpleado: M.COLUMNAS_EMPLEADO, columnasProveedor: M.COLUMNAS_PROVEEDOR, columnasNombre: RG.COLUMNAS_NOMBRE_COPIADO })
    const SQS = AS.sentenciasArco(ES, { columnasEmpleado: M.COLUMNAS_EMPLEADO, columnasProveedor: M.COLUMNAS_PROVEEDOR, columnasNombre: RG.COLUMNAS_NOMBRE_COPIADO, anonimizarSueldo: true })
    const PH = AS.PLACEHOLDER

    // ───────── ayudas ─────────
    const nuevoUsuario = async (nombre, extra = {}) => {
      const id = uuid()
      await q(`INSERT INTO ${ES}.usuarios (id, email, nombre, pin_hash, rol, activo) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, extra.email || `${id.slice(0, 8)}@prueba.invalid`, nombre, '$2b$10$hashdeprueba000000000000000000000000000000000000000', extra.rol || 'mesero', extra.activo ?? true])
      return id
    }
    const nuevaSolicitud = async (tipo, titular_tipo, titular_id) => {
      const r = await q(SQ.crear, [tipo, titular_tipo, titular_id, 'presencial', actor.id, actor.nombre, actor.rol])
      return r[0] && r[0].id
    }
    const suprimir = async (S, tipoTitular, solicitud, actorId = actor.id) => (await q(S.suprimir[tipoTitular], [solicitud, actorId, actor.nombre, actor.rol]))[0]
    const estado = async (id) => (await q(`SELECT estado, resultado FROM ${ES}.solicitudes_arco WHERE id = $1`, [id]))[0]
    const hash = async () => {
      const out = {}
      const defs = {
        pagos: 'id, orden_id, metodo, monto, propina, cobrado_por',
        cajas: 'id, usuario_apertura_id, usuario_cierre_id, fondo_inicial, efectivo_contado, estado',
        movimientos_caja: 'id, caja_id, tipo, monto, usuario_id',
        ordenes: 'id, usuario_id, estado, subtotal, impuesto, total',
        perdidas_comanda: 'id, orden_id, monto_perdido, autorizado_por, responsable_id, resuelto_por_id',
        permisos_especiales: 'id, usuario_id, tipo, otorgado_por, revocado_por',
        gastos: 'id, fecha, tipo, monto, empleado_id, proveedor_id',
        compras: 'id, fecha, total, proveedor_id',
      }
      for (const [t, cols] of Object.entries(defs)) {
        out[t] = (await q(`SELECT md5(COALESCE(string_agg(concat_ws('|', ${cols}), ',' ORDER BY id), '')) AS h, count(*)::int AS n FROM ${ES}.${t}`))[0]
      }
      return out
    }
    const contar = async (tabla, where, params = []) => (await q(`SELECT count(*)::int AS n FROM ${ES}.${tabla} WHERE ${where}`, params))[0].n

    // ───────── C0. el diseño de las columnas ─────────
    const cols = RG.COLUMNAS_NOMBRE_COPIADO
    check('C0: las 10 columnas de nombre copiado existen en las tablas copiadas (y son las de la sección 2.2 del inventario)',
      cols.length === 10 && (await Promise.all(cols.map(async (c) => (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`, [ES, c.tabla, c.nombre])).length + (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`, [ES, c.tabla, c.id])).length))).every((n) => n === 2), cols)
    check('C0: los placeholders son "Usuario anonimizado", "Empleado anonimizado" y "Proveedor anonimizado"', PH.usuario === 'Usuario anonimizado' && PH.empleado === 'Empleado anonimizado' && PH.proveedor === 'Proveedor anonimizado')

    // ───────── C1. vence_en, prórroga y vencimiento ─────────
    console.log('  C1: plazos')
    const titularPlazo = await nuevoUsuario('Titular Plazos')
    const sPl = (await q(SQ.crear, ['acceso', 'usuario', titularPlazo, 'correo', actor.id, actor.nombre, actor.rol]))[0]
    const v30 = (await q(`SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date + 30, 'YYYY-MM-DD') AS v`))[0].v
    check('C1: crear deja `vence_en` = hoy (Santiago) + 30 días corridos y estado pendiente', sPl && String(sPl.vence_en).slice(0, 10) === v30 && sPl.estado === 'pendiente' && sPl.prorrogada === false, sPl)
    check('C1: ingresar para un titular que no existe no devuelve fila (el servidor responde 404)', (await q(SQ.crear, ['acceso', 'usuario', uuid(), 'correo', actor.id, actor.nombre, actor.rol])).length === 0)
    const dupl = await q(SQ.crear, ['acceso', 'usuario', titularPlazo, 'correo', actor.id, actor.nombre, actor.rol]).then(() => null, (e) => e)
    check('C1: la misma solicitud pendiente otra vez viola el índice único (23505) y no deja entrada de auditoría extra', dupl && dupl.code === '23505' && (await contar('auditoria_admin', `entidad = 'solicitud_arco' AND accion = 'crear'`)) === 1, dupl && dupl.code)
    const pr = (await q(SQ.prorrogar, [sPl.id, 'Motivo suficientemente largo para prorrogar', actor.id, actor.nombre, actor.rol]))[0]
    const v60 = (await q(`SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date + 60, 'YYYY-MM-DD') AS v`))[0].v
    check('C1: prorrogar suma 30 días más una sola vez (hoy + 60), con motivo y fecha', pr && pr.aplicado === 1 && String(pr.vence_en).slice(0, 10) === v60 && pr.prorrogada === true, pr)
    const pr2 = (await q(SQ.prorrogar, [sPl.id, 'Segundo motivo suficientemente largo', actor.id, actor.nombre, actor.rol]))[0]
    check('C1: una segunda prórroga no se aplica (aplicado 0, ya prorrogada) y el plazo sigue en hoy + 60', pr2.aplicado === 0 && pr2.prorrogada === true && String((await q(`SELECT to_char(vence_en,'YYYY-MM-DD') AS v FROM ${ES}.solicitudes_arco WHERE id = $1`, [sPl.id]))[0].v) === v60)
    const sVenc = (await q(SQ.crear, ['portabilidad', 'usuario', titularPlazo, 'correo', actor.id, actor.nombre, actor.rol]))[0]
    await q(`UPDATE ${ES}.solicitudes_arco SET vence_en = (now() AT TIME ZONE 'America/Santiago')::date - 1 WHERE id = $1`, [sVenc.id])
    const prV = (await q(SQ.prorrogar, [sVenc.id, 'Motivo suficientemente largo para prorrogar', actor.id, actor.nombre, actor.rol]))[0]
    check('C1: una solicitud ya vencida no se prorroga (aplicado 0 y el hecho `vence_pasada` lo dice)', prV.aplicado === 0 && prV.vence_pasada === true && prV.prorrogada === false)
    const resu = (await q(SQ.resolver, [sPl.id, 'atendida', 'Se entregó la copia de los datos.', actor.id, actor.nombre, actor.rol]))[0]
    check('C1: resolver deja estado resuelta, quién y cuándo; una segunda vez no se aplica', resu.aplicado === 1 && resu.estado_nuevo === 'resuelta' && (await q(SQ.resolver, [sPl.id, 'rechazada', 'Otra resolución que no debe aplicarse', actor.id, actor.nombre, actor.rol]))[0].aplicado === 0)
    const prR = (await q(SQ.prorrogar, [sPl.id, 'Motivo suficientemente largo para prorrogar', actor.id, actor.nombre, actor.rol]))[0]
    check('C1: una solicitud resuelta no se prorroga', prR.aplicado === 0 && prR.estado === 'resuelta')

    // ───────── C2. usuario: las 10 columnas, los montos y los decoys ─────────
    console.log('  C2: las 10 columnas de nombre copiado, montos y decoys')
    const NU = "O'Brien (Ñandú) Pérez."
    const U = await nuevoUsuario(NU, { email: 'obrien.p@prueba.invalid', rol: 'cajero' })
    const V = await nuevoUsuario('Vera Decoy Rojas', { email: 'vera@prueba.invalid', rol: 'cajero' })
    const ADM = await nuevoUsuario('Admin Uno Activo', { rol: 'admin' })
    const nombres = { [U]: NU, [V]: 'Vera Decoy Rojas' }
    const ord = async (usuario, notas) => (await q(`INSERT INTO ${ES}.ordenes (usuario_id, estado, subtotal, impuesto, total, notas) VALUES ($1, 'pagado', 10924, 2066, 12990, $2) RETURNING id`, [usuario, notas]))[0].id
    const oU = await ord(U, `[PERRO MUERTO] se fue — autorizó ${NU} — responsable ${NU}. ${NU}${NU}`)
    const oV = await ord(V, `[ORDEN CERRADA] ... — por Vera Decoy Rojas`)
    for (const [uid, nombre, orden] of [[U, NU, oU], [V, 'Vera Decoy Rojas', oV]]) {
      await q(`INSERT INTO ${ES}.pagos (orden_id, metodo, monto, propina, cobrado_por, cobrado_por_nombre) VALUES ($1, 'efectivo', 12990, 1000, $2, $3)`, [orden, uid, nombre])
    }
    const cajaA = (await q(`INSERT INTO ${ES}.cajas (usuario_apertura_id, usuario_apertura_nombre, fondo_inicial, usuario_cierre_id, usuario_cierre_nombre, estado, efectivo_contado) VALUES ($1, $2, 50000, $3, $4, 'cerrada', 62990) RETURNING id`, [U, NU, V, 'Vera Decoy Rojas']))[0].id
    const cajaB = (await q(`INSERT INTO ${ES}.cajas (usuario_apertura_id, usuario_apertura_nombre, fondo_inicial, usuario_cierre_id, usuario_cierre_nombre, estado, efectivo_contado) VALUES ($1, $2, 30000, $3, $4, 'cerrada', 31000) RETURNING id`, [V, 'Vera Decoy Rojas', U, NU]))[0].id
    for (const [uid, nombre, caja] of [[U, NU, cajaA], [V, 'Vera Decoy Rojas', cajaB]]) {
      await q(`INSERT INTO ${ES}.movimientos_caja (caja_id, tipo, monto, usuario_id, usuario_nombre) VALUES ($1, 'venta_efectivo', 12990, $2, $3)`, [caja, uid, nombre])
    }
    // una pérdida por orden (índice único por orden_id)
    const per = async (aut, resp, res) => q(`INSERT INTO ${ES}.perdidas_comanda (orden_id, monto_perdido, motivo, autorizado_por, autorizado_por_nombre, responsable_id, responsable_nombre, resuelto_por_id, resuelto_por_nombre) VALUES ($1, 5000, 'motivo', $2, $3, $4, $5, $6, $7)`, [await ord(V, 'orden de una pérdida'), aut && aut[0], aut && aut[1], resp && resp[0], resp && resp[1], res && res[0], res && res[1]])
    await per([U, NU], [V, 'Vera Decoy Rojas'], null)
    await per([V, 'Vera Decoy Rojas'], [U, NU], null)
    await per([V, 'Vera Decoy Rojas'], null, [U, NU])
    await per([V, 'Vera Decoy Rojas'], [V, 'Vera Decoy Rojas'], [V, 'Vera Decoy Rojas'])
    await q(`INSERT INTO ${ES}.permisos_especiales (usuario_id, tipo, valido_hasta, otorgado_por, otorgado_por_nombre, revocado_por, revocado_por_nombre) VALUES ($1, 'apertura_mesa', now() + interval '1 day', $2, $3, NULL, NULL)`, [V, U, NU])
    await q(`INSERT INTO ${ES}.permisos_especiales (usuario_id, tipo, valido_hasta, otorgado_por, otorgado_por_nombre, revocado_por, revocado_por_nombre) VALUES ($1, 'apertura_mesa', now() + interval '1 day', $2, $3, $4, $5)`, [V, V, 'Vera Decoy Rojas', U, NU])
    await q(`INSERT INTO ${ES}.permisos_especiales (usuario_id, tipo, valido_hasta, otorgado_por, otorgado_por_nombre, revocado_por, revocado_por_nombre) VALUES ($1, 'apertura_mesa', now() + interval '1 day', $2, $3, $2, $3)`, [V, V, 'Vera Decoy Rojas'])
    const aud = (uid, nombre, entidad, entidadId, entidadNombre) => q(`INSERT INTO ${ES}.auditoria_admin (usuario_id, usuario_nombre, usuario_rol, accion, entidad, entidad_id, entidad_nombre) VALUES ($1, $2, 'admin', 'crear', $3, $4, $5)`, [uid, nombre, entidad, entidadId, entidadNombre])
    await aud(U, NU, 'producto', null, 'Producto cualquiera')
    await aud(ADM, 'Admin Uno Activo', 'usuario', U, NU)
    await aud(V, 'Vera Decoy Rojas', 'producto', null, 'Otro producto')
    await aud(ADM, 'Admin Uno Activo', 'usuario', V, 'Vera Decoy Rojas')
    await q(`INSERT INTO ${ES}.movimientos_inventario (tipo, cantidad, notas) VALUES ('ajuste', 1, $1), ('ajuste', 1, $2)`, [`Ajuste manual por ${NU}: conteo de la semana`, 'Ajuste manual por Vera Decoy Rojas: conteo'])
    for (const uid of [U, V]) await q(`INSERT INTO ${ES}.sesiones (token_hash, usuario_id, expira) VALUES ($1, $2, now() + interval '1 hour'), ($3, $2, now() + interval '2 hours')`, [uuid(), uid, uuid()])
    const correoU = 'obrien.p@prueba.invalid'
    for (const k of [`ug:${correoU}`, `ui:${correoU}|10.0.0.1`, `ui:${correoU}|10.0.0.2`, `u:${correoU}|9.9.9.9`, 'ug:vera@prueba.invalid', 'ui:vera@prueba.invalid|10.0.0.1', 'ip:10.0.0.1']) {
      await q(`INSERT INTO ${ES}.intentos_login (clave, fallidos) VALUES ($1, 1)`, [k])
    }
    const h0 = await hash()
    const sU = await nuevaSolicitud('supresion', 'usuario', U)
    const r = await suprimir(SQ, 'usuario', sU)
    check('C2: anonimizar un usuario → aplicado 1, sin guardas, con resultado (campos anonimizados y lo conservado)', r.aplicado === 1 && r.sol_existe === 1 && r.existe === 1 && !r.ya && !r.self && !r.ultimo && r.resultado && r.resultado.anonimizado.includes('nombre') && r.resultado.conservado.includes('ventas_pagos_y_caja'), r)
    const u = (await q(`SELECT nombre, email, activo, rol, pin_hash FROM ${ES}.usuarios WHERE id = $1`, [U]))[0]
    check('C2: usuario con el nombre anonimizado, el correo con su uuid COMPLETO, inactivo, rol conservado y PIN inutilizable', u.nombre === PH.usuario && u.email === `anonimizado-${U}@anonimizado.invalid` && u.activo === false && u.rol === 'cajero' && !/^\$2[aby]\$/.test(u.pin_hash), u)
    check('C2: sus sesiones quedaron revocadas y las del decoy siguen vigentes', (await contar('sesiones', 'usuario_id = $1 AND revocada_at IS NULL', [U])) === 0 && (await contar('sesiones', 'usuario_id = $1 AND revocada_at IS NULL', [V])) === 2)
    check('C2: se borraron sus filas de intentos_login (correo + IP) y quedan las del decoy y la clave solo de IP', (await q(`SELECT clave FROM ${ES}.intentos_login ORDER BY clave`)).map((x) => x.clave).join() === ['ip:10.0.0.1', 'ug:vera@prueba.invalid', 'ui:vera@prueba.invalid|10.0.0.1'].join())
    // las 10 columnas, una por una
    const malas = []
    for (const c of cols) {
      const quedan = await contar(c.tabla, `${c.nombre} = $1`, [NU])
      const anon = await contar(c.tabla, `${c.id} = $1 AND ${c.nombre} = $2`, [U, PH.usuario])
      const sinId = await contar(c.tabla, `${c.id} = $1 AND ${c.nombre} IS DISTINCT FROM $2`, [U, PH.usuario])
      const decoy = await contar(c.tabla, `${c.id} = $1 AND ${c.nombre} = $2`, [V, 'Vera Decoy Rojas'])
      if (quedan !== 0 || anon < 1 || sinId !== 0 || decoy < 1) malas.push({ c: `${c.tabla}.${c.nombre}`, quedan, anon, sinId, decoy })
    }
    check('C2: las 10 columnas de nombre copiado en 6 tablas quedan en "Usuario anonimizado" SOLO donde el id es el del titular (ninguna conserva su nombre y la del decoy no se toca)', malas.length === 0, malas)
    check('C2: auditoria_admin.entidad_nombre (la 11.ª columna): las entradas SOBRE el usuario se anonimizan y las de otro no', (await contar('auditoria_admin', `entidad = 'usuario' AND entidad_id = $1 AND entidad_nombre = $2`, [U, PH.usuario])) === 1 && (await contar('auditoria_admin', `entidad = 'usuario' AND entidad_id = $1 AND entidad_nombre = 'Vera Decoy Rojas'`, [V])) === 1 && (await contar('auditoria_admin', `entidad_nombre = $1`, [NU])) === 0)
    const hu = await hash()
    check('C2: los montos y totales NO cambian (pagos, cajas, movimientos de caja, órdenes, pérdidas, permisos: misma huella y mismas filas)', j(hu) === j(h0), { antes: h0, despues: hu })
    const notas = (await q(`SELECT id, notas FROM ${ES}.ordenes ORDER BY id`)).reduce((m, x) => ({ ...m, [x.id]: x.notas }), {})
    check('C2: el nombre en ordenes.notas se reemplaza por "[persona anonimizada]" (varias veces, pegado, al final) y la nota del decoy queda igual', notas[oU] === esperado(`[PERRO MUERTO] se fue — autorizó ${NU} — responsable ${NU}. ${NU}${NU}`, NU) && !notas[oU].includes('Brien') && notas[oV] === '[ORDEN CERRADA] ... — por Vera Decoy Rojas', notas)
    const mi = (await q(`SELECT notas FROM ${ES}.movimientos_inventario ORDER BY notas`)).map((x) => x.notas)
    check('C2: "Ajuste manual por <nombre>" en movimientos_inventario también (y el de otra persona no)', mi.includes('Ajuste manual por [persona anonimizada]: conteo de la semana') && mi.includes('Ajuste manual por Vera Decoy Rojas: conteo'), mi)
    const sol = await estado(sU)
    check('C2: la solicitud quedó resuelta con el resultado guardado y una entrada "anonimizar" + una "resolver" SIN nombres ni valores', sol.estado === 'resuelta' && (await contar('auditoria_admin', `accion = 'anonimizar' AND entidad = 'usuario' AND entidad_id = $1 AND entidad_nombre IS NULL`, [U])) === 1 && (await contar('auditoria_admin', `accion = 'resolver' AND entidad = 'solicitud_arco' AND entidad_id = $1`, [sU])) === 1 && (await q(`SELECT detalles FROM ${ES}.auditoria_admin WHERE accion IN ('anonimizar', 'resolver')`)).every((e) => !j(e.detalles).includes('Brien') && !j(e.detalles).includes('prueba.invalid')))
    const rYa = await suprimir(SQ, 'usuario', await nuevaSolicitud('supresion', 'usuario', U))
    check('C2: una nueva supresión del mismo usuario → `ya` (TITULAR_YA_ANONIMIZADO) y no aplica nada', rYa.ya === true && rYa.aplicado === 0)

    // ───────── C3. guardas: uno mismo y último admin (nada cambia) ─────────
    console.log('  C3: guardas')
    const adminSolo = await nuevoUsuario('Único Admin Activo', { rol: 'admin', email: 'unico.admin@prueba.invalid' })
    await q(`UPDATE ${ES}.usuarios SET activo = false WHERE id = $1`, [ADM]) // ADM deja de ser admin activo: el único activo es adminSolo
    const sSolo = await nuevaSolicitud('supresion', 'usuario', adminSolo)
    const hAntes = await hash()
    const rSelf = await suprimir(SQ, 'usuario', sSolo, adminSolo)
    check('C3: un admin no se anonimiza a sí mismo (`self`) y no cambia nada; la solicitud sigue pendiente', rSelf.self === true && rSelf.aplicado === 0 && (await estado(sSolo)).estado === 'pendiente' && (await q(`SELECT nombre FROM ${ES}.usuarios WHERE id = $1`, [adminSolo]))[0].nombre === 'Único Admin Activo')
    const rUlt = await suprimir(SQ, 'usuario', sSolo, actor.id)
    check('C3: el ÚLTIMO admin activo no se anonimiza (`ultimo`) aunque lo pida otro actor, y no cambia nada', rUlt.ultimo === true && rUlt.aplicado === 0 && (await q(`SELECT nombre, activo FROM ${ES}.usuarios WHERE id = $1`, [adminSolo]))[0].nombre === 'Único Admin Activo' && j(await hash()) === j(hAntes))
    // empleado vinculado al último admin: el 409 de la guarda deja TODO igual, también el empleado
    const E = (await q(`INSERT INTO ${ES}.empleados (nombre, documento, telefono, email, sueldo_base, cargo, fecha_ingreso, notas, usuario_id) VALUES ('Empleada Con Usuario', '12.345.678-5', '+56 9 1', 'e@prueba.invalid', 700000, 'Cajera', '2025-01-01', 'nota', $1) RETURNING id`, [adminSolo]))[0].id
    const sEV = await nuevaSolicitud('supresion', 'empleado', E)
    const rEV = await suprimir(SQ, 'empleado', sEV, actor.id)
    const eIgual = (await q(`SELECT nombre, documento, telefono, email, notas, activo FROM ${ES}.empleados WHERE id = $1`, [E]))[0]
    check('C3: empleado vinculado al último admin → `ultimo`, y NO cambia nada: ni el empleado, ni el usuario, ni la solicitud (todo o nada)', rEV.ultimo === true && rEV.aplicado === 0 && eIgual.nombre === 'Empleada Con Usuario' && eIgual.documento === '12.345.678-5' && eIgual.activo === true && (await estado(sEV)).estado === 'pendiente' && (await q(`SELECT nombre FROM ${ES}.usuarios WHERE id = $1`, [adminSolo]))[0].nombre === 'Único Admin Activo')
    // con otro admin activo la misma solicitud se aplica a AMBOS en la misma operación
    await q(`UPDATE ${ES}.usuarios SET activo = true WHERE id = $1`, [ADM])
    const rEV2 = await suprimir(SQ, 'empleado', sEV, actor.id)
    const eAn = (await q(`SELECT nombre, documento, telefono, email, notas, activo, sueldo_base, cargo, fecha_ingreso::text AS fi FROM ${ES}.empleados WHERE id = $1`, [E]))[0]
    const uAn = (await q(`SELECT nombre, email, activo FROM ${ES}.usuarios WHERE id = $1`, [adminSolo]))[0]
    check('C3: con otro admin activo, el empleado y su usuario vinculado se anonimizan juntos; el empleado conserva sueldo, cargo y fecha de ingreso (opción por defecto)', rEV2.aplicado === 1 && eAn.nombre === PH.empleado && eAn.documento === null && eAn.telefono === null && eAn.email === null && eAn.notas === null && eAn.activo === false && Number(eAn.sueldo_base) === 700000 && eAn.cargo === 'Cajera' && eAn.fi === '2025-01-01' && uAn.nombre === PH.usuario && uAn.email === `anonimizado-${adminSolo}@anonimizado.invalid` && uAn.activo === false && rEV2.resultado.conservado.includes('sueldo_y_fechas_laborales') && rEV2.resultado.anonimizado.includes('usuario_vinculado'), { rEV2, eAn, uAn })
    // opción reversible: anonimizar también el sueldo
    const E2 = (await q(`INSERT INTO ${ES}.empleados (nombre, documento, sueldo_base, cargo, fecha_ingreso, fecha_egreso) VALUES ('Empleado Sueldo Anónimo', '1-9', 800000, 'Cocinero', '2024-01-01', '2025-01-01') RETURNING id`))[0].id
    const rS = await suprimir(SQS, 'empleado', await nuevaSolicitud('supresion', 'empleado', E2))
    const eS = (await q(`SELECT sueldo_base, cargo, fecha_ingreso, fecha_egreso FROM ${ES}.empleados WHERE id = $1`, [E2]))[0]
    check('C3: con anonimizarSueldo activo el sueldo queda en 0 y se quitan cargo y fechas (la decisión es reversible desde `ANONIMIZAR_SUELDO`)', rS.aplicado === 1 && Number(eS.sueldo_base) === 0 && eS.cargo === null && eS.fecha_ingreso === null && eS.fecha_egreso === null && !rS.resultado.conservado.includes('sueldo_y_fechas_laborales'), { rS, eS })
    check('C3: la solicitud de un tipo que no es supresión no se aplica (`sol_tipo`) y un solicitud inexistente no cambia nada', (await suprimir(SQ, 'empleado', await nuevaSolicitud('acceso', 'empleado', E))).aplicado === 0 && (await suprimir(SQ, 'empleado', uuid())).sol_existe === 0)

    // ───────── C4. proveedor: retención de 6 años ─────────
    console.log('  C4: proveedor y retención')
    const prov = async (nombre, rut) => (await q(`INSERT INTO ${ES}.proveedores (nombre, rut, contacto, telefono, email, direccion, notas) VALUES ($1, $2, 'Contacto', '+56 9 2', 'p@prueba.invalid', 'Calle 1', 'nota') RETURNING id`, [nombre, rut]))[0].id
    const casos = [
      ['compra de hace 1 año', async (p) => q(`INSERT INTO ${ES}.compras (proveedor_id, fecha, total, notas) VALUES ($1, current_date - interval '1 year', 5000, 'compra a Pedro Proveedor')`, [p]), true],
      ['solo una compra de hace 7 años', async (p) => q(`INSERT INTO ${ES}.compras (proveedor_id, fecha, total) VALUES ($1, current_date - interval '7 years', 5000)`, [p]), false],
      ['un gasto de hace 2 años', async (p) => q(`INSERT INTO ${ES}.gastos (proveedor_id, fecha, monto, tipo, descripcion) VALUES ($1, current_date - interval '2 years', 8000, 'operativo', 'pago a Pedro Proveedor')`, [p]), true],
      ['un activo comprado hace 3 años', async (p) => q(`INSERT INTO ${ES}.activos (nombre, proveedor_id, fecha_compra, costo_compra, notas) VALUES ('Freidora', $1, current_date - interval '3 years', 90000, 'comprada a Pedro Proveedor')`, [p]), true],
      ['un gasto de hace 8 años', async (p) => q(`INSERT INTO ${ES}.gastos (proveedor_id, fecha, monto, tipo) VALUES ($1, current_date - interval '8 years', 8000, 'operativo')`, [p]), false],
      ['nada', async () => {}, false],
    ]
    const malasP = []
    for (const [desc, sembrar, retiene] of casos) {
      const p = await prov('Pedro Proveedor', '12.345.678-5')
      await sembrar(p)
      const h = await hash()
      const r = await suprimir(SQ, 'proveedor', await nuevaSolicitud('supresion', 'proveedor', p))
      const f = (await q(`SELECT nombre, rut, contacto, telefono, email, direccion, notas, activo FROM ${ES}.proveedores WHERE id = $1`, [p]))[0]
      const ok = r.aplicado === 1 && f.nombre === PH.proveedor && f.contacto === null && f.telefono === null && f.email === null && f.direccion === null && f.notas === null && f.activo === false && (retiene ? f.rut === '12.345.678-5' && r.resultado.conservado.includes('rut') : f.rut === null && !r.resultado.conservado.includes('rut')) && j(await hash()) === j(h)
      if (!ok) malasP.push({ desc, retiene, f, r: r.resultado })
    }
    check(`C4: retención del RUT (${casos.length} casos: compra, gasto o activo de los últimos 6 años lo conserva; de hace 7 u 8 años o nada lo borra) y el resto del proveedor se anonimiza sin cambiar montos`, malasP.length === 0, malasP)
    const textos = (await q(`SELECT (SELECT string_agg(notas, '|') FROM ${ES}.compras) AS c, (SELECT string_agg(descripcion, '|') FROM ${ES}.gastos WHERE descripcion IS NOT NULL) AS g, (SELECT string_agg(notas, '|') FROM ${ES}.activos) AS a`))[0]
    check('C4: el nombre del proveedor en notas de compras, descripción de gastos y notas de activos se reemplaza', !/Pedro Proveedor/.test(textos.c + textos.g + textos.a) && /\[persona anonimizada\]/.test(textos.c) && /\[persona anonimizada\]/.test(textos.g) && /\[persona anonimizada\]/.test(textos.a), textos)

    // ───────── C5. el reemplazo escapa el nombre ─────────
    console.log('  C5: nombres con caracteres especiales')
    const NOMBRES = [
      "O'Brien (Ñandú) Pérez.", 'María José [Soto] {X}', 'A+B | C^D $E * F ? G', 'Back\\slash Ñuñoa', 'Ana.', 'Eve (a)', '(.*)', 'Joaquín  Müller-Ñ', 'Zoë',
    ]
    const malosN = []
    for (const n of NOMBRES) {
      const uN = await nuevoUsuario(n)
      const texto = `Autorizó ${n}, responsable ${n} y ${n} ${n}. Otro: ${n}x pegado, ${n.replace(/[a-z]/g, (c) => c.toUpperCase())} fin ${n}`
      const o = await ord(uN, texto)
      const rN = await suprimir(SQ, 'usuario', await nuevaSolicitud('supresion', 'usuario', uN))
      const despues = (await q(`SELECT notas FROM ${ES}.ordenes WHERE id = $1`, [o]))[0].notas
      const esp = esperado(texto, n)
      if (rN.aplicado !== 1 || despues !== esp) malosN.push({ n, despues, esp })
    }
    check(`C5: ${NOMBRES.length} nombres con punto, paréntesis, comilla, tilde, corchetes, llaves, barra, circunflejo, dólar, asterisco, interrogación y barra invertida se reemplazan EXACTAMENTE como la especificación (escapados: ".*" no borra todo el texto)`, malosN.length === 0, malosN.slice(0, 2))
    const uCorto = await nuevoUsuario('Al')
    const oC = await ord(uCorto, 'Autorizó Al y Alberto')
    const rC = await suprimir(SQ, 'usuario', await nuevaSolicitud('supresion', 'usuario', uCorto))
    check('C5: un nombre de menos de 3 letras no se reemplaza en texto libre (evita borrar "Alberto"), pero el usuario sí se anonimiza', rC.aplicado === 1 && (await q(`SELECT notas FROM ${ES}.ordenes WHERE id = $1`, [oC]))[0].notas === 'Autorizó Al y Alberto')

    // ───────── C6. atomicidad: si falla la entrada de auditoría no queda NADA ─────────
    console.log('  C6: atomicidad y carrera')
    const UA = await nuevoUsuario('Atómico Prueba Uno', { rol: 'cajero' })
    const oA = await ord(UA, 'Autorizó Atómico Prueba Uno')
    await q(`INSERT INTO ${ES}.pagos (orden_id, metodo, monto, cobrado_por, cobrado_por_nombre) VALUES ($1, 'tarjeta', 1000, $2, 'Atómico Prueba Uno')`, [oA, UA])
    const sA = await nuevaSolicitud('supresion', 'usuario', UA)
    const hA = await hash()
    const snap = async () => j([await q(`SELECT nombre, email, activo, pin_hash FROM ${ES}.usuarios WHERE id = $1`, [UA]), await q(`SELECT cobrado_por_nombre FROM ${ES}.pagos WHERE cobrado_por = $1`, [UA]), await q(`SELECT notas FROM ${ES}.ordenes WHERE id = $1`, [oA]), await q(`SELECT estado FROM ${ES}.solicitudes_arco WHERE id = $1`, [sA]), await q(`SELECT count(*)::int AS n FROM ${ES}.auditoria_admin`), await q(`SELECT count(*)::int AS n FROM ${ES}.sesiones WHERE revocada_at IS NULL`)])
    const antes = await snap()
    await q(`ALTER TABLE ${ES}.auditoria_admin ADD CONSTRAINT prueba_rechaza CHECK (accion <> 'anonimizar') NOT VALID`)
    let err = null
    try { await suprimir(SQ, 'usuario', sA) } catch (e) { err = e }
    check('C6: si la entrada "anonimizar" falla (23514), el statement lanza y NO queda ningún cambio: ni el usuario, ni el pago, ni la nota, ni la solicitud, ni las sesiones', err && err.code === '23514' && (await snap()) === antes && j(await hash()) === j(hA), err && err.code)
    await q(`ALTER TABLE ${ES}.auditoria_admin DROP CONSTRAINT prueba_rechaza`)
    const rCtl = await suprimir(SQ, 'usuario', sA)
    check('CONTROL: sin el CHECK la misma operación sí se aplica (la prueba distingue el fallo del éxito)', rCtl.aplicado === 1 && (await snap()) !== antes)

    // carrera ×3: 4 supresiones simultáneas de la misma solicitud
    const resCarrera = []
    for (let ronda = 0; ronda < 3; ronda++) {
      const uc = await nuevoUsuario(`Carrera Ronda ${ronda}`, { rol: 'mesero' })
      const sc = await nuevaSolicitud('supresion', 'usuario', uc)
      const rs = await Promise.all([0, 1, 2, 3].map(() => suprimir(SQ, 'usuario', sc).then((x) => ({ a: x.aplicado }), (e) => ({ e: e.code }))))
      resCarrera.push({ aplicados: rs.filter((x) => x.a === 1).length, ceros: rs.filter((x) => x.a === 0).length, errores: rs.filter((x) => x.e).length, entradas: await contar('auditoria_admin', `accion = 'anonimizar' AND entidad_id = $1`, [uc]), estado: (await estado(sc)).estado })
    }
    check('C6: CARRERA ×3: 4 supresiones simultáneas → exactamente UNA se aplica (las demás aplicado 0), una sola entrada "anonimizar" y la solicitud resuelta', resCarrera.every((c) => c.aplicados === 1 && c.ceros === 3 && c.errores === 0 && c.entradas === 1 && c.estado === 'resuelta'), resCarrera)

    // ───────── C7. cobertura contra la base real (solo lectura) ─────────
    console.log('  C7: cobertura')
    const reales = (await db`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'soda_master' AND column_name LIKE '%\_nombre'`).map((r) => `${r.table_name}.${r.column_name}`)
    const decididas = new Set([...cols.map((c) => `${c.tabla}.${c.nombre}`), 'auditoria_admin.entidad_nombre', ...RG.COLUMNAS_NOMBRE_NO_PERSONALES])
    const sinDecidir = reales.filter((k) => !decididas.has(k))
    check('C7: toda columna `*_nombre` de la base real está decidida (anonimizada, o declarada como no personal): una columna nueva sin decidir hace fallar esta prueba', sinDecidir.length === 0, sinDecidir)
    const fantasma = [...decididas].filter((k) => !reales.includes(k))
    check('C7: toda columna de la lista existe en la base real (sin errores de escritura)', fantasma.length === 0, fantasma)
  } finally {
    try { await q(`DROP SCHEMA IF EXISTS ${ES} CASCADE`) } catch (e) { console.log('  AVISO: no se pudo eliminar el esquema temporal ' + ES + ': ' + e.message) }
  }
  const restos = await db`SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name LIKE 'prueba\_arco\_%'`
  check('el esquema temporal se eliminó (no queda ningún prueba_arco_*)', restos[0].n === 0, restos[0])
}
