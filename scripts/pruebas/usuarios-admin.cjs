/**
 * Sesión 14.5b-3 (F49 y F50), parte del módulo `usuarios`: proteger a los administradores y el borrado de
 * usuarios.
 *
 *  A. Prueba UNITARIA de la regla (`lib/usuarios-reglas.ts`): uno mismo, último admin, estado resultante,
 *     historial y el orden de las reglas.
 *  B. Por la API, con usuarios temporales (nunca el admin real ni usuarios reales): 401, 403, 400, 404 y los
 *     409 con su código (`AUTO_MODIFICACION`, `USUARIO_CON_HISTORIAL`) por PATCH y DELETE, el caso "mismo
 *     usuario", lo que sigue permitido (nombre, PIN propio con `pin_actual`), un usuario con historial que no se
 *     borra y uno sin historial que sí (con sus sesiones y notificaciones).
 *  C. El MISMO texto SQL que ejecuta `lib/db.ts` (`lib/usuarios-sql.ts`) contra un esquema temporal
 *     `prueba_usuarios_*` con una copia de `usuarios` (nunca se toca una fila ni una tabla de `soda_master`):
 *     la matriz de la regla contra la especificación pura, `ULTIMO_ADMIN`, la carrera de dos admins que se
 *     desactivan o se borran entre sí (con una pausa dentro del statement, para que el solape sea seguro) y un
 *     control sin el bloqueo que demuestra que la prueba sí detecta la carrera, y cada columna de historial.
 *     Al iniciar elimina los esquemas `prueba_usuarios_*` de corridas anteriores y al terminar (`finally`) el suyo.
 *  D. Cobertura: todo lo que referencia a `usuarios` en la base (claves foráneas y columnas UUID con nombre de
 *     usuario) está en la lista del código; una tabla nueva sin registrar hace fallar la prueba.
 *
 * `ULTIMO_ADMIN` NO se prueba por la ruta HTTP de punta a punta (con el admin real activo siempre queda otro
 * admin y la ruta no admite parámetros de prueba): se prueba el statement y la regla.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const L = require('./lib.cjs')
const { check, api, UUID_FALSO } = L

const RAIZ = path.resolve(__dirname, '..', '..')
const importar = (...p) => import('file:///' + path.join(RAIZ, ...p).split(path.sep).join('/'))
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const pinAl = () => String(Math.floor(Math.random() * 10 ** 4)).padStart(4, '5')
const uuid = () => crypto.randomUUID()

exports.correr = async function (ctx, { login } = {}) {
  const { admin, mesero, db, marca } = ctx
  const R = await importar('lib', 'usuarios-reglas.ts')
  const S = await importar('lib', 'usuarios-sql.ts')

  // ───────────────────────── A. la regla pura ─────────────────────────
  console.log('\n[usuarios] F49/F50 (A): la regla pura decidirCambioUsuario')
  const A = uuid(), B = uuid()
  const admA = { rol: 'admin', activo: true }
  const MSG_HIST = 'Tiene historial; desactívalo en su lugar'
  const dec = (o) => R.decidirCambioUsuario({ actorId: A, objetivoId: B, actual: admA, cambio: {}, otrosAdminsActivos: 1, ...o })
  const cod = (x) => (x ? x.codigo : null)
  check('quitaAdmin: desactivar, borrar o bajar el rol de un admin activo quita admin',
    R.quitaAdmin(admA, { activo: false }) && R.quitaAdmin(admA, { eliminar: true }) && R.quitaAdmin(admA, { rol: 'mesero' }) && R.quitaAdmin({ rol: 'administrador', activo: true }, { rol: 'cajero' }))
  check('quitaAdmin mira el estado resultante: mismo rol (admin o administrador), activo true, nombre o sin cambios NO quitan admin',
    !R.quitaAdmin(admA, {}) && !R.quitaAdmin(admA, { activo: true }) && !R.quitaAdmin(admA, { rol: 'admin' }) && !R.quitaAdmin(admA, { rol: 'administrador' }) && !R.quitaAdmin(admA, { activo: null, rol: null }))
  check('quitaAdmin: un usuario que no es admin activo no tiene qué perder (inactivo, mesero)',
    !R.quitaAdmin({ rol: 'admin', activo: false }, { eliminar: true }) && !R.quitaAdmin({ rol: 'mesero', activo: true }, { activo: false, eliminar: true }))
  check('AUTO_MODIFICACION (409): uno mismo no se desactiva, no se borra y no se quita el rol admin',
    cod(R.autoModificacion(A, A, { activo: false })) === 'AUTO_MODIFICACION' && cod(R.autoModificacion(A, A, { eliminar: true })) === 'AUTO_MODIFICACION' && cod(R.autoModificacion(A, A, { rol: 'mesero' })) === 'AUTO_MODIFICACION' && R.autoModificacion(A, A, { eliminar: true }).status === 409)
  check('uno mismo sigue pudiendo editar nombre, email, PIN, activo true y su rol admin o administrador',
    R.autoModificacion(A, A, {}) === null && R.autoModificacion(A, A, { activo: true }) === null && R.autoModificacion(A, A, { rol: 'admin' }) === null && R.autoModificacion(A, A, { rol: 'administrador' }) === null)
  check('sobre OTRO usuario no hay AUTO_MODIFICACION', R.autoModificacion(A, B, { activo: false }) === null && R.autoModificacion(A, B, { eliminar: true }) === null)
  check('ULTIMO_ADMIN (409): sin otros admins activos no se desactiva, no se borra ni se baja el rol del admin', ['activo', 'eliminar', 'rol'].every((c) => cod(dec({ otrosAdminsActivos: 0, cambio: c === 'activo' ? { activo: false } : c === 'eliminar' ? { eliminar: true } : { rol: 'mesero' } })) === 'ULTIMO_ADMIN'))
  check('con otro admin activo esas mismas acciones sí se permiten (null)', dec({ otrosAdminsActivos: 1, cambio: { activo: false } }) === null && dec({ otrosAdminsActivos: 2, cambio: { eliminar: true } }) === null && dec({ otrosAdminsActivos: 1, cambio: { rol: 'cajero' } }) === null)
  check('el último admin SÍ puede cambiar de nombre o de PIN (sin cambio de estado)', dec({ otrosAdminsActivos: 0, cambio: {} }) === null && dec({ otrosAdminsActivos: 0, cambio: { activo: true } }) === null)
  check('un usuario que no es admin se desactiva o se borra aunque no queden admins', dec({ actual: { rol: 'mesero', activo: true }, otrosAdminsActivos: 0, cambio: { activo: false } }) === null && dec({ actual: { rol: 'admin', activo: false }, otrosAdminsActivos: 0, cambio: { eliminar: true } }) === null)
  check('objetivo que no existe → USUARIO_NO_ENCONTRADO (404)', dec({ actual: null }).codigo === 'USUARIO_NO_ENCONTRADO' && dec({ actual: null }).status === 404)
  const h = dec({ actual: { rol: 'mesero', activo: true }, cambio: { eliminar: true }, tieneHistorial: true })
  check('con historial, borrar → USUARIO_CON_HISTORIAL (409) con el mensaje "Tiene historial; desactívalo en su lugar"', cod(h) === 'USUARIO_CON_HISTORIAL' && h.status === 409 && h.mensaje === MSG_HIST, h)
  check('el historial no impide desactivar ni editar (solo borrar)', dec({ actual: { rol: 'mesero', activo: true }, cambio: { activo: false }, tieneHistorial: true }) === null)
  check('orden: uno mismo antes que último admin; último admin antes que historial', cod(R.decidirCambioUsuario({ actorId: A, objetivoId: A, actual: admA, cambio: { eliminar: true }, otrosAdminsActivos: 0, tieneHistorial: true })) === 'AUTO_MODIFICACION' && cod(dec({ otrosAdminsActivos: 0, cambio: { eliminar: true }, tieneHistorial: true })) === 'ULTIMO_ADMIN')
  check('los mensajes dicen qué pasó y qué hacer (nunca vacíos)', [R.MSG_ULTIMO_ADMIN, R.MSG_USUARIO_CON_HISTORIAL, R.autoModificacion(A, A, { activo: false }).mensaje, R.autoModificacion(A, A, { eliminar: true }).mensaje, R.autoModificacion(A, A, { rol: 'cajero' }).mensaje].every((m) => typeof m === 'string' && m.length > 20) && R.MSG_USUARIO_CON_HISTORIAL === MSG_HIST)

  // ───────────────────────── B. por la API ─────────────────────────
  console.log('\n[usuarios] F49/F50 (B): por la API, con usuarios temporales (PATCH y DELETE)')
  const nuevo = (rol = 'mesero', extra = {}) => L.crearUsuarioPrueba(ctx, rol, extra, false)
  const x = await nuevo('admin')   // actor
  const y = await nuevo('admin')   // otro admin
  const m = await nuevo('mesero')
  const sx = await x.reingresar()
  const sm = await m.reingresar()
  const sesionVale = async (ses) => (await api(ses, 'GET', '/api/auth/sesion')).status === 200
  const estadoDe = async (id) => (await api(admin, 'GET', '/api/usuarios?id=' + id)).json
  const ruta = (id) => '/api/usuarios/' + id

  const sin = await api(null, 'PATCH', ruta(m.usuario.id), { nombre: 'x' })
  const sinD = await api(null, 'DELETE', ruta(m.usuario.id))
  check('sin sesión: PATCH y DELETE → 401', sin.status === 401 && sinD.status === 401, [sin.status, sinD.status])
  const noAdminP = await api(mesero, 'PATCH', ruta(m.usuario.id), { nombre: 'x' })
  const noAdminD = await api(mesero, 'DELETE', ruta(m.usuario.id))
  check('un mesero no puede ni PATCH ni DELETE (403)', noAdminP.status === 403 && noAdminD.status === 403, [noAdminP.status, noAdminD.status])
  const idMalo = await api(admin, 'DELETE', '/api/usuarios/no-es-un-uuid')
  const sinCampos = await api(sx, 'PATCH', ruta(m.usuario.id), {})
  const campoRaro = await api(sx, 'PATCH', ruta(m.usuario.id), { activo: false, es_admin: true })
  check('id mal escrito, cuerpo vacío o campo desconocido → 400 DATOS_INVALIDOS', idMalo.status === 400 && sinCampos.status === 400 && campoRaro.status === 400 && [idMalo, sinCampos, campoRaro].every((r) => r.json.codigo === 'DATOS_INVALIDOS'), [idMalo.status, sinCampos.status, campoRaro.status])
  const p404 = await api(sx, 'PATCH', ruta(UUID_FALSO), { activo: false })
  const d404 = await api(sx, 'DELETE', ruta(UUID_FALSO))
  check('un usuario que no existe → 404 por PATCH y por DELETE', p404.status === 404 && d404.status === 404, [p404.status, d404.status])
  check('y no mandan ni el `actor` ni un `usuario_id` en el body: la ruta lo toma de la sesión', (await api(sx, 'PATCH', ruta(m.usuario.id), { activo: false, usuario_id: x.usuario.id })).status === 400)

  // mismo usuario (el actor es un admin temporal)
  const noDesact = await api(sx, 'PATCH', ruta(x.usuario.id), { activo: false })
  const noRol = await api(sx, 'PATCH', ruta(x.usuario.id), { rol: 'mesero' })
  const noRol2 = await api(sx, 'PATCH', ruta(x.usuario.id), { rol: 'cajero', roles_adicionales: ['mesero'] })
  const noDel = await api(sx, 'DELETE', ruta(x.usuario.id))
  check('PATCH a uno mismo con activo:false → 409 AUTO_MODIFICACION con mensaje claro', noDesact.status === 409 && noDesact.json.codigo === 'AUTO_MODIFICACION' && /desactivar tu propio usuario/.test(noDesact.json.error), noDesact)
  check('PATCH a uno mismo quitándose el rol admin (también con roles adicionales) → 409 AUTO_MODIFICACION', noRol.status === 409 && noRol.json.codigo === 'AUTO_MODIFICACION' && /rol de administrador/.test(noRol.json.error) && noRol2.status === 409 && noRol2.json.codigo === 'AUTO_MODIFICACION', [noRol, noRol2])
  check('DELETE a uno mismo → 409 AUTO_MODIFICACION con mensaje claro', noDel.status === 409 && noDel.json.codigo === 'AUTO_MODIFICACION' && /borrar tu propio usuario/.test(noDel.json.error), noDel)
  const ex = await estadoDe(x.usuario.id)
  check('después de los tres 409 el admin temporal sigue activo, sigue siendo admin y su sesión sigue viva', ex.activo === true && ex.rol === 'admin' && (await sesionVale(sx)))
  const okNombre = await api(sx, 'PATCH', ruta(x.usuario.id), { nombre: `${marca} actor` })
  const okSame = await api(sx, 'PATCH', ruta(x.usuario.id), { activo: true, rol: 'administrador' })
  check('uno mismo SÍ puede cambiar su nombre y mandar los mismos activo y rol (200)', okNombre.status === 200 && okNombre.json.nombre === `${marca} actor` && okSame.status === 200 && okSame.json.activo === true && okSame.json.rol === 'admin', [okNombre.status, okSame.status, okSame.json])
  const pinNuevo = pinAl()
  const sinActual = await api(sx, 'PATCH', ruta(x.usuario.id), { pin: pinNuevo })
  const conActual = await api(sx, 'PATCH', ruta(x.usuario.id), { pin: pinNuevo, pin_actual: x.usuario.pin })
  check('el PIN propio sigue igual: sin pin_actual → 400 PIN_ACTUAL_REQUERIDO; con pin_actual → 200 y la sesión actual se conserva', sinActual.status === 400 && sinActual.json.codigo === 'PIN_ACTUAL_REQUERIDO' && conActual.status === 200 && (await sesionVale(sx)), [sinActual.status, conActual.status])
  x.usuario.pin = pinNuevo

  // sobre otros (hay más admins activos: el real y los temporales)
  const sy = await y.reingresar()
  const desY = await api(sx, 'PATCH', ruta(y.usuario.id), { activo: false })
  check('un admin desactiva a OTRO admin (queda el real) → 200 y las sesiones del desactivado caen en el mismo statement', desY.status === 200 && desY.json.activo === false && !(await sesionVale(sy)), [desY.status, desY.json])
  const actY = await api(sx, 'PATCH', ruta(y.usuario.id), { activo: true })
  const bajaY = await api(sx, 'PATCH', ruta(y.usuario.id), { rol: 'cajero' })
  check('lo reactiva (200) y le baja el rol a cajero (200): hay otros admins', actY.status === 200 && actY.json.activo === true && bajaY.status === 200 && bajaY.json.rol === 'cajero', [actY.status, bajaY.status])
  const desM = await api(sx, 'PATCH', ruta(m.usuario.id), { activo: false })
  check('desactivar a un mesero → 200, sus sesiones caen y ya no puede ingresar', desM.status === 200 && !(await sesionVale(sm)) && (await login(m.usuario.email, m.usuario.pin)).status === 401, [desM.status])
  const actM = await api(sx, 'PATCH', ruta(m.usuario.id), { activo: true })
  check('y se reactiva (200)', actM.status === 200 && actM.json.activo === true)
  const pinM = pinAl()
  const cambiaPinM = await api(sx, 'PATCH', ruta(m.usuario.id), { pin: pinM })
  m.usuario.pin = pinM
  check('el admin sigue pudiendo cambiar el PIN de otro usuario (200, sin pin_actual) y el usuario ingresa con el nuevo', cambiaPinM.status === 200 && (await login(m.usuario.email, pinM)).status === 200, cambiaPinM.status)

  // F50: con historial no se borra
  const perm = await api(sx, 'POST', '/api/permisos-especiales', { usuario_id: m.usuario.id, tipo: 'apertura_mesa', valido_hasta: new Date(Date.now() + 3600e3).toISOString(), motivo: marca })
  check('el admin temporal otorga un permiso al mesero: queda en el historial de quien lo otorgó (permisos_especiales.otorgado_por)', perm.status === 201, perm)
  const delHist = await api(admin, 'DELETE', ruta(x.usuario.id))
  check('DELETE de un usuario con historial → 409 USUARIO_CON_HISTORIAL y "Tiene historial; desactívalo en su lugar" (antes 500)', delHist.status === 409 && delHist.json.codigo === 'USUARIO_CON_HISTORIAL' && delHist.json.error === MSG_HIST, delHist)
  const aunExiste = await estadoDe(x.usuario.id)
  check('el usuario con historial sigue existiendo, activo y con su sesión', aunExiste && aunExiste.id === x.usuario.id && aunExiste.activo === true && (await sesionVale(sx)))
  const desHist = await api(admin, 'PATCH', ruta(x.usuario.id), { activo: false })
  check('desactivarlo SÍ se puede (200): es lo que dice el mensaje', desHist.status === 200 && desHist.json.activo === false && !(await sesionVale(sx)), desHist)

  // un usuario sin historial sí se borra, con sus sesiones y sus notificaciones
  const z = await nuevo('mesero')
  const sz = await z.reingresar()
  const notif = await api(admin, 'POST', '/api/notificaciones', { tipo: 'listo', mensaje: marca, destinatario_usuario_id: z.usuario.id })
  const otra = await api(admin, 'POST', '/api/notificaciones', { tipo: 'listo', mensaje: marca + ' ajena', destinatario_usuario_id: m.usuario.id })
  const antes = await db`SELECT (SELECT count(*)::int FROM soda_master.notificaciones WHERE destinatario_usuario_id = ${z.usuario.id}) AS n, (SELECT count(*)::int FROM soda_master.sesiones WHERE usuario_id = ${z.usuario.id}) AS s`
  check('un usuario recién creado tiene sesión y una notificación (no son historial)', notif.status === 201 && otra.status === 201 && antes[0].n === 1 && antes[0].s === 1, [notif.status, antes[0]])
  const delZ = await api(admin, 'DELETE', ruta(z.usuario.id))
  const despues = await db`SELECT (SELECT count(*)::int FROM soda_master.notificaciones WHERE destinatario_usuario_id = ${z.usuario.id}) AS n, (SELECT count(*)::int FROM soda_master.sesiones WHERE usuario_id = ${z.usuario.id}) AS s, (SELECT count(*)::int FROM soda_master.usuarios WHERE id = ${z.usuario.id}) AS u, (SELECT count(*)::int FROM soda_master.notificaciones WHERE destinatario_usuario_id = ${m.usuario.id}) AS ajenas`
  check('DELETE de un usuario sin historial → 200; se borran el usuario, sus sesiones y sus notificaciones (y no las ajenas)', delZ.status === 200 && despues[0].u === 0 && despues[0].n === 0 && despues[0].s === 0 && despues[0].ajenas >= 1, [delZ.status, despues[0]])
  check('el usuario borrado ya no puede usar su sesión (401) y el DELETE repetido da 404', !(await sesionVale(sz)) && (await api(admin, 'DELETE', ruta(z.usuario.id))).status === 404)

  // al borrar a quien referencia el historial, el historial desaparece (cascada del permiso) y el otro se puede borrar
  const delM = await api(admin, 'DELETE', ruta(m.usuario.id))
  // Sesión 17 (K1): el admin temporal que modificó usuarios dejó entradas en auditoria_admin (`usuario_id` es historial, F50): no se borra.
  const delX0 = await api(admin, 'DELETE', ruta(x.usuario.id))
  check('el admin temporal que modificó usuarios dejó entradas de auditoría: cuenta como historial y no se borra (409 USUARIO_CON_HISTORIAL)', delX0.status === 409 && delX0.json.codigo === 'USUARIO_CON_HISTORIAL', delX0)
  // limpieza de las entradas de la propia prueba (el actor es un usuario temporal; mismo criterio que las mermas de prueba en lib.cjs)
  await db`DELETE FROM soda_master.auditoria_admin WHERE usuario_id = ${x.usuario.id}::uuid AND starts_with(usuario_nombre, 'prueba ')`
  const delX = await api(admin, 'DELETE', ruta(x.usuario.id))
  const delY = await api(admin, 'DELETE', ruta(y.usuario.id))
  check('al borrar al mesero cae su permiso (cascada) y, sin entradas de auditoría, el admin temporal queda sin historial: los tres se borran (200)', delM.status === 200 && delX.status === 200 && delY.status === 200, [delM.status, delX.status, delY.status])

  // estático
  const ruta_ = leer('app', 'api', 'usuarios', '[id]', 'route.ts')
  check('la ruta toma el actor de la sesión (actor: actorDe(s.usuario)) en PATCH y DELETE', (ruta_.match(/actor: actorDe\(s\.usuario\)/g) || []).length === 2 && /respuestaCambioUsuario/.test(ruta_))
  const pagina = leer('components', 'usuarios-page.tsx')
  check('usuarios-page ya no corta en el cliente el borrado ni la desactivación propios: el mensaje sale del servidor', !/No puedes eliminar tu propio usuario|No puedes desactivar tu propio usuario/.test(pagina))
  check('db.ts: actualizarUsuario y eliminarUsuario usan los statements de lib/usuarios-sql.ts (un solo statement, sin SELECT aparte)', /SQL_USUARIOS\.actualizar/.test(leer('lib', 'db.ts')) && /SQL_USUARIOS\.eliminar/.test(leer('lib', 'db.ts')) && !/DELETE FROM soda_master\.usuarios\s+WHERE id = \$\{id\}/.test(leer('lib', 'db.ts')))

  // ───────────────────────── C. el mismo SQL en un esquema temporal ─────────────────────────
  console.log('\n[usuarios] F49/F50 (C): el mismo SQL en un esquema temporal prueba_usuarios_* (sin tocar soda_master)')
  const esquemasViejos = await db`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'prueba\_usuarios\_%'`
  for (const e of esquemasViejos) await db.query(`DROP SCHEMA IF EXISTS ${e.schema_name} CASCADE`)
  if (esquemasViejos.length) console.log(`  (se eliminaron ${esquemasViejos.length} esquema(s) prueba_usuarios_* de corridas anteriores)`)
  const ES = `prueba_usuarios_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  try {
    await db.query(`CREATE SCHEMA ${ES}`)
    await db.query(`CREATE TABLE ${ES}.usuarios (LIKE soda_master.usuarios INCLUDING DEFAULTS)`)
    await db.query(`CREATE TABLE ${ES}.sesiones (id uuid DEFAULT gen_random_uuid(), usuario_id uuid, revocada_at timestamptz)`)
    await db.query(`CREATE TABLE ${ES}.notificaciones (id uuid DEFAULT gen_random_uuid(), destinatario_usuario_id uuid)`)
    const columnasPorTabla = {}
    for (const [t, c] of S.REFERENCIAS_HISTORIAL) (columnasPorTabla[t] = columnasPorTabla[t] || new Set()).add(c)
    for (const [t, cols] of Object.entries(columnasPorTabla)) {
      // Sesión 17 (K1): las sentencias escriben en auditoria_admin, así que el esquema lleva una copia completa de la tabla.
      if (t === 'auditoria_admin') await db.query(`CREATE TABLE ${ES}.auditoria_admin (LIKE soda_master.auditoria_admin INCLUDING ALL)`)
      else await db.query(`CREATE TABLE ${ES}.${t} (${[...cols].map((c) => `${c} uuid`).join(', ')})`)
    }
    const SQLS = S.sentenciasUsuarios(ES)
    const conPausa = (t) => {
      if (!t.includes('::int AS otros')) throw new Error('texto de otros no encontrado')
      return t.replace('::int AS otros', '::int + (SELECT 0 FROM pg_sleep(0.5)) AS otros')
    }
    const sinBloqueo = (t) => t.replace('FOR NO KEY UPDATE', '')
    const fila = (id, rol, activo) => `('${id}', '${id}@prueba.invalid', 'prueba', 'x', '${rol}', ${activo})`
    const INS = (filas) => `INSERT INTO ${ES}.usuarios (id, email, nombre, pin_hash, rol, activo) VALUES ${filas.join(', ')}`
    // Sesión 17 (K1): $9 a $11 el actor y $12 y $13 los detalles de la auditoría (null = sin entrada).
    const params = (id, c = {}) => [id, c.nombre ?? null, null, c.rol ?? null, null, c.activo ?? null, null, null, null, null, null]
    const pDel = (id) => [id, null, null, null]
    const pDel5 = (id) => [id, actor, 'Admin Prueba', 'admin']
    const vaciar = `TRUNCATE ${ES}.usuarios, ${ES}.sesiones, ${ES}.notificaciones` + Object.keys(columnasPorTabla).map((t) => `, ${ES}.${t}`).join('')

    // C1. matriz contra la especificación pura
    const estados = [['admin', true], ['administrador', true], ['admin', false], ['mesero', true], ['mesero', false]]
    const cambios = [{}, { nombre: 'otro' }, { activo: false }, { activo: true }, { rol: 'mesero' }, { rol: 'admin' }, { rol: 'administrador' }, { activo: false, rol: 'cajero' }]
    let casos = 0, mal = []
    for (const [rol, activo] of estados) {
      for (const otros of [0, 1]) {
        for (const c of cambios) {
          const id = uuid()
          const filas = [fila(id, rol, activo), ...(otros ? [fila(uuid(), 'admin', true)] : [])]
          const r = await db.transaction([db.query(vaciar), db.query(INS(filas)), db.query(SQLS.actualizar, params(id, c))])
          const f = r[2][0]
          const esperado = R.decidirCambioUsuario({ actorId: uuid(), objetivoId: id, actual: { rol, activo }, cambio: c, otrosAdminsActivos: otros })
          const aplicado = f.aplicado > 0
          const final = (await db.query(`SELECT rol, activo, nombre FROM ${ES}.usuarios WHERE id = $1`, [id]))[0]
          const ok = aplicado === (esperado === null) && f.otros === otros
            && (aplicado || (final.rol === rol && final.activo === activo && final.nombre === 'prueba'))
            && (!aplicado || (c.activo === undefined || final.activo === c.activo))
            && (esperado === null || esperado.codigo === 'ULTIMO_ADMIN')
          casos++
          if (!ok) mal.push({ rol, activo, otros, c, aplicado, esperado: esperado && esperado.codigo, f })
        }
      }
    }
    check(`PATCH: el SQL y la regla pura coinciden en los ${casos} casos (5 estados × 0 o 1 otro admin × 8 cambios); lo rechazado no cambia ninguna fila`, mal.length === 0, mal.slice(0, 3))

    // C2. último admin
    const u1 = uuid(), u2 = uuid(), me = uuid()
    let r = await db.transaction([db.query(vaciar), db.query(INS([fila(u1, 'admin', true), fila(me, 'mesero', true)])), db.query(SQLS.actualizar, params(u1, { activo: false }))])
    check('SQL actualizar: el único admin activo no se desactiva (otros = 0, aplicado = 0)', r[2][0].otros === 0 && r[2][0].aplicado === 0)
    r = await db.transaction([db.query(vaciar), db.query(INS([fila(u1, 'admin', true), fila(u2, 'admin', false)])), db.query(SQLS.actualizar, params(u1, { rol: 'cajero' }))])
    check('SQL actualizar: un admin inactivo no cuenta como "otro admin": el único activo no pierde el rol', r[2][0].otros === 0 && r[2][0].aplicado === 0)
    r = await db.transaction([db.query(vaciar), db.query(INS([fila(u1, 'admin', true), fila(me, 'mesero', true)])), db.query(SQLS.eliminar, pDel(u1))])
    check('SQL eliminar: el único admin activo no se borra (ULTIMO_ADMIN, aunque no tenga historial)', r[2][0].otros === 0 && r[2][0].aplicado === 0 && r[2][0].historial === false && R.decidirCambioUsuario({ actorId: uuid(), objetivoId: u1, actual: { rol: r[2][0].actual_rol, activo: r[2][0].actual_activo }, cambio: { eliminar: true }, otrosAdminsActivos: r[2][0].otros, tieneHistorial: false }).codigo === 'ULTIMO_ADMIN')
    r = await db.transaction([db.query(vaciar), db.query(INS([fila(u1, 'admin', true), fila(u2, 'administrador', true)])), db.query(SQLS.eliminar, pDel(u1))])
    const quedan = await db.query(`SELECT count(*)::int AS n FROM ${ES}.usuarios`)
    check('SQL eliminar: con otro admin activo el admin se borra (aplicado = 1) y queda el otro', r[2][0].aplicado === 1 && quedan[0].n === 1)

    // C3. carrera con una pausa dentro del statement (el solape es seguro)
    const par = async (sqlA, pA, sqlB, pB, usuarios) => {
      await db.transaction([db.query(vaciar), db.query(INS(usuarios))])
      const t0 = Date.now()
      const [ra, rb] = await Promise.all([db.query(sqlA, pA), db.query(sqlB, pB)])
      const activos = (await db.query(`SELECT count(*)::int AS n FROM ${ES}.usuarios WHERE activo AND rol IN ('admin','administrador')`))[0].n
      return { a: ra[0], b: rb[0], activos, ms: Date.now() - t0 }
    }
    const resumen = (p) => [p.a.aplicado, p.b.aplicado].sort().join('')
    const P_ACT = conPausa(SQLS.actualizar), P_DEL = conPausa(SQLS.eliminar)
    for (let ronda = 1; ronda <= 3; ronda++) {
      const a = uuid(), b = uuid()
      const dd = await par(P_ACT, params(a, { activo: false }), P_ACT, params(b, { activo: false }), [fila(a, 'admin', true), fila(b, 'admin', true)])
      check(`carrera ${ronda}/3: dos admins se desactivan entre sí a la vez → solo uno lo logra y queda 1 admin activo`, resumen(dd) === '01' && dd.activos === 1 && dd.ms > 800, { r: resumen(dd), activos: dd.activos, ms: dd.ms })
      const el = await par(P_DEL, pDel(a), P_DEL, pDel(b), [fila(a, 'admin', true), fila(b, 'admin', true)])
      check(`carrera ${ronda}/3: dos admins se borran entre sí a la vez → solo uno lo logra y queda 1`, resumen(el) === '01' && el.activos === 1, { r: resumen(el), activos: el.activos })
      const mx = await par(P_ACT, params(a, { rol: 'cajero' }), P_DEL, pDel(b), [fila(a, 'admin', true), fila(b, 'admin', true)])
      check(`carrera ${ronda}/3: uno le baja el rol al otro mientras el otro lo borra → solo uno lo logra y queda 1 admin activo`, resumen(mx) === '01' && mx.activos === 1, { r: resumen(mx), activos: mx.activos })
    }
    const a1 = uuid(), b1 = uuid()
    const ctl = await par(sinBloqueo(P_ACT), params(a1, { activo: false }), sinBloqueo(P_ACT), params(b1, { activo: false }), [fila(a1, 'admin', true), fila(b1, 'admin', true)])
    check('CONTROL: el mismo statement SIN el bloqueo FOR NO KEY UPDATE deja al local sin admin (ambos aplican, 0 activos): la prueba de la carrera sí detecta el problema', ctl.a.aplicado + ctl.b.aplicado === 2 && ctl.activos === 0, { r: resumen(ctl), activos: ctl.activos })

    // C4. historial: cada columna impide borrar; sin filas se borra; las notificaciones propias se limpian
    let fallos = []
    for (const [t, c] of S.REFERENCIAS_HISTORIAL) {
      const id = uuid()
      const rr = await db.transaction([db.query(vaciar), db.query(INS([fila(id, 'mesero', true), fila(uuid(), 'admin', true)])), db.query(t === 'auditoria_admin' ? `INSERT INTO ${ES}.auditoria_admin (usuario_id, accion, entidad) VALUES ($1, 'prueba', 'prueba')` : `INSERT INTO ${ES}.${t} (${c}) VALUES ($1)`, [id]), db.query(SQLS.eliminar, pDel(id))])
      const f = rr[3][0]
      const dec2 = R.decidirCambioUsuario({ actorId: uuid(), objetivoId: id, actual: { rol: f.actual_rol, activo: f.actual_activo }, cambio: { eliminar: true }, otrosAdminsActivos: f.otros, tieneHistorial: f.historial })
      if (!(f.historial === true && f.aplicado === 0 && dec2 && dec2.codigo === 'USUARIO_CON_HISTORIAL')) fallos.push(`${t}.${c}`)
    }
    check(`cada una de las ${S.REFERENCIAS_HISTORIAL.length} columnas de historial impide borrar (USUARIO_CON_HISTORIAL) y el usuario sigue en la tabla`, fallos.length === 0, fallos)
    const sid = uuid(), otroId = uuid()
    r = await db.transaction([
      db.query(vaciar),
      db.query(INS([fila(sid, 'mesero', true), fila(otroId, 'mesero', true), fila(uuid(), 'admin', true)])),
      db.query(`INSERT INTO ${ES}.notificaciones (destinatario_usuario_id) VALUES ($1), ($1), ($2)`, [sid, otroId]),
      db.query(`INSERT INTO ${ES}.ordenes (usuario_id) VALUES ($1)`, [otroId]),
      db.query(SQLS.eliminar, pDel(sid)),
    ])
    const nrest = (await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE destinatario_usuario_id = $1)::int AS ajenas FROM ${ES}.notificaciones`, [otroId]))[0]
    check('sin historial: aplicado = 1, se borran SUS 2 notificaciones y queda la ajena', r[4][0].aplicado === 1 && r[4][0].notificaciones_borradas === 2 && nrest.n === 1 && nrest.ajenas === 1, [r[4][0], nrest])
    const hist = uuid()
    r = await db.transaction([db.query(vaciar), db.query(INS([fila(hist, 'mesero', true), fila(uuid(), 'admin', true)])), db.query(`INSERT INTO ${ES}.notificaciones (destinatario_usuario_id) VALUES ($1)`, [hist]), db.query(`INSERT INTO ${ES}.pagos (cobrado_por) VALUES ($1)`, [hist]), db.query(SQLS.eliminar, pDel(hist))])
    const nh = (await db.query(`SELECT count(*)::int AS n FROM ${ES}.notificaciones`))[0].n
    check('con historial las notificaciones NO se borran (no se hace nada)', r[4][0].aplicado === 0 && r[4][0].notificaciones_borradas === 0 && nh === 1)
    const mixto = uuid()
    r = await db.transaction([db.query(vaciar), db.query(INS([fila(mixto, 'admin', true)])), db.query(`INSERT INTO ${ES}.ordenes (usuario_id) VALUES ($1)`, [mixto]), db.query(SQLS.eliminar, pDel(mixto))])
    check('último admin con historial: el SQL no borra y la regla responde ULTIMO_ADMIN antes que USUARIO_CON_HISTORIAL', r[3][0].aplicado === 0 && r[3][0].historial === true && R.decidirCambioUsuario({ actorId: uuid(), objetivoId: mixto, actual: { rol: 'admin', activo: true }, cambio: { eliminar: true }, otrosAdminsActivos: r[3][0].otros, tieneHistorial: true }).codigo === 'ULTIMO_ADMIN')
    const ses = uuid(), sesOtra = uuid(), uid = uuid()
    await db.transaction([db.query(vaciar), db.query(INS([fila(uid, 'mesero', true), fila(uuid(), 'admin', true)])), db.query(`INSERT INTO ${ES}.sesiones (id, usuario_id) VALUES ($1, $3), ($2, $3)`, [ses, sesOtra, uid])])
    r = await db.query(SQLS.actualizar, [uid, null, null, null, null, false, null, ses, null, null, null])
    const rev = await db.query(`SELECT id, revocada_at IS NOT NULL AS rev FROM ${ES}.sesiones`)
    check('desactivar revoca las sesiones del usuario en el mismo statement (conservando la que se pida)', r[0].aplicado === 1 && r[0].sesiones_revocadas === 1 && rev.find((s) => s.id === sesOtra).rev === true && rev.find((s) => s.id === ses).rev === false, [r[0], rev])
    r = await db.query(SQLS.actualizar, [uid, null, null, null, null, null, 'hash-nuevo', null, null, null, null])
    const rev2 = await db.query(`SELECT count(*)::int AS n FROM ${ES}.sesiones WHERE revocada_at IS NULL`)
    check('cambiar el PIN revoca todas las sesiones restantes; un cambio rechazado (ULTIMO_ADMIN) no revoca nada', r[0].aplicado === 1 && rev2[0].n === 0)
    const solo = uuid(), sS = uuid()
    await db.transaction([db.query(vaciar), db.query(INS([fila(solo, 'admin', true)])), db.query(`INSERT INTO ${ES}.sesiones (id, usuario_id) VALUES ($1, $2)`, [sS, solo])])
    r = await db.query(SQLS.actualizar, [solo, null, null, null, null, false, null, null, null, null, null])
    const revS = (await db.query(`SELECT revocada_at IS NULL AS viva FROM ${ES}.sesiones`))[0].viva
    check('el último admin rechazado conserva sus sesiones (la revocación depende de que el UPDATE se aplique)', r[0].aplicado === 0 && revS === true)

    // C5. Sesión 17 (K1): la entrada de auditoría va en el MISMO statement del cambio (alta, cambio, baja)
    console.log('\n[usuarios] K1 (C5): la auditoría de usuarios va en el mismo statement; si falla, el cambio se revierte')
    const j = (o) => JSON.stringify(o)
    const mismoConj = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
    const actor = uuid(), objetivo = uuid(), otroAdmin = uuid()
    const base5 = () => db.transaction([db.query(vaciar), db.query(INS([fila(objetivo, 'mesero', true), fila(actor, 'admin', true), fila(otroAdmin, 'admin', true)]))])
    const entradas5 = () => db.query(`SELECT accion, entidad, entidad_id, entidad_nombre, usuario_id, usuario_nombre, usuario_rol, detalles FROM ${ES}.auditoria_admin ORDER BY accion`)
    await base5()
    r = await db.query(SQLS.actualizar, [objetivo, 'Nombre nuevo', null, null, null, false, null, null, actor, 'Admin Prueba', 'admin'])
    let aud = await entradas5()
    check('actualizar con cambio aplicado deja una entrada por acción (desactivar y modificar), con el actor, la entidad y solo los nombres de campo',
      r[0].aplicado === 1 && aud.length === 2 && aud.map((a) => a.accion).join() === 'desactivar,modificar'
      && aud.every((a) => a.entidad === 'usuario' && a.entidad_id === objetivo && a.entidad_nombre === 'Nombre nuevo' && a.usuario_id === actor && a.usuario_nombre === 'Admin Prueba' && a.usuario_rol === 'admin')
      && j(aud.find((a) => a.accion === 'modificar').detalles) === j({ campos: ['nombre'] }) && j(aud.find((a) => a.accion === 'desactivar').detalles) === j({ campos: ['activo'] }), aud)
    await base5()
    r = await db.query(SQLS.actualizar, [objetivo, 'Solo nombre', null, null, null, null, null, null, actor, 'Admin Prueba', 'admin'])
    aud = await entradas5()
    check('sin desactivar: solo la entrada modificar con el campo que cambió', r[0].aplicado === 1 && aud.length === 1 && aud[0].accion === 'modificar' && j(aud[0].detalles) === j({ campos: ['nombre'] }), aud)
    await base5()
    r = await db.query(SQLS.actualizar, [objetivo, 'prueba', 'otro@prueba.invalid', 'cajero', ['bar'], true, 'hash-nuevo', null, actor, 'Admin Prueba', 'admin'])
    aud = await entradas5()
    check('modificar lista SOLO los campos que cambiaron: nombre igual y activo igual no salen; email, rol, roles_adicionales y pin sí', r[0].aplicado === 1 && aud.length === 1 && mismoConj(aud[0].detalles.campos, ['email', 'rol', 'roles_adicionales', 'pin']) && !JSON.stringify(aud[0].detalles).includes('hash') && !JSON.stringify(aud[0].detalles).includes('otro@'), aud)
    await base5()
    r = await db.query(SQLS.actualizar, [objetivo, 'prueba', null, null, null, true, null, null, actor, 'Admin Prueba', 'admin'])
    check('un cambio sin diferencias reales (mismo nombre, mismo activo) se aplica pero no deja entrada', r[0].aplicado === 1 && (await entradas5()).length === 0)
    await base5()
    r = await db.query(SQLS.actualizar, [objetivo, 'Otro nombre', null, null, null, true, null, null, actor, 'Admin Prueba', 'admin'])
    await db.query(SQLS.actualizar, [objetivo, null, null, null, null, false, null, null, actor, 'Admin Prueba', 'admin'])
    await db.query(SQLS.actualizar, [objetivo, null, null, null, null, false, null, null, actor, 'Admin Prueba', 'admin'])
    await db.query(SQLS.actualizar, [objetivo, null, null, null, null, true, null, null, actor, 'Admin Prueba', 'admin'])
    aud = await entradas5()
    check('desactivar es solo la transición activo true → false (desactivar dos veces deja una entrada); reactivar es una modificación del campo activo', aud.filter((a) => a.accion === 'desactivar').length === 1 && aud.filter((a) => a.accion === 'modificar').some((a) => j(a.detalles) === j({ campos: ['activo'] })) && aud.length === 3, aud)
    const unico = uuid()
    await db.transaction([db.query(vaciar), db.query(INS([fila(unico, 'admin', true)]))])
    r = await db.query(SQLS.actualizar, [unico, null, null, null, null, false, null, null, actor, 'Admin Prueba', 'admin'])
    check('un cambio rechazado (ULTIMO_ADMIN) no deja entrada de auditoría', r[0].aplicado === 0 && (await entradas5()).length === 0)
    await base5()
    r = await db.query(SQLS.eliminar, pDel5(objetivo))
    aud = await entradas5()
    check('eliminar con la baja aplicada deja la entrada "eliminar" (sin detalles) con el nombre del usuario borrado', r[0].aplicado === 1 && aud.length === 1 && aud[0].accion === 'eliminar' && aud[0].entidad_id === objetivo && aud[0].entidad_nombre === 'prueba' && aud[0].detalles === null && aud[0].usuario_id === actor, aud)
    await db.transaction([db.query(vaciar), db.query(INS([fila(objetivo, 'mesero', true), fila(actor, 'admin', true)])), db.query(`INSERT INTO ${ES}.ordenes (usuario_id) VALUES ($1)`, [objetivo])])
    r = await db.query(SQLS.eliminar, pDel5(objetivo))
    check('un borrado rechazado (USUARIO_CON_HISTORIAL) no deja entrada de auditoría', r[0].aplicado === 0 && (await entradas5()).length === 0)
    await db.query(vaciar)
    const nuevo = (await db.query(SQLS.crear, ['  Alta@Prueba.INVALID ', 'Alta', 'hash', 'mesero', ['mesero'], true, actor, 'Admin Prueba', 'admin', j({ campos: ['email', 'nombre', 'rol', 'pin'] })]))[0]
    aud = await entradas5()
    check('crear: el alta (email normalizado, sin hash en la respuesta) y su entrada "crear" van juntos, con nombres de campo y sin valores',
      nuevo.email === 'alta@prueba.invalid' && !('pin_hash' in nuevo) && aud.length === 1 && aud[0].accion === 'crear' && aud[0].entidad_id === nuevo.id && !JSON.stringify(aud[0].detalles).includes('hash') && !JSON.stringify(aud[0].detalles).includes('Alta'), [nuevo, aud])
    // si el registro falla, el cambio se revierte
    await base5()
    await db.query(`ALTER TABLE ${ES}.auditoria_admin ADD CONSTRAINT prueba_rechaza CHECK (accion = 'ver_datos_personales')`)
    let err = null
    try { await db.query(SQLS.actualizar, [objetivo, 'No debe quedar', null, null, null, false, null, null, actor, 'Admin Prueba', 'admin']) } catch (e) { err = e }
    const intacto = (await db.query(`SELECT nombre, activo FROM ${ES}.usuarios WHERE id = $1`, [objetivo]))[0]
    check('actualizar: si la entrada de auditoría falla (CHECK 23514) el statement lanza y el cambio NO queda (nombre y activo intactos)', err && err.code === '23514' && intacto.nombre === 'prueba' && intacto.activo === true, { code: err && err.code, intacto })
    err = null
    try { await db.query(SQLS.eliminar, pDel5(objetivo)) } catch (e) { err = e }
    check('eliminar: si la auditoría falla el usuario NO se borra', err && err.code === '23514' && (await db.query(`SELECT count(*)::int AS n FROM ${ES}.usuarios WHERE id = $1`, [objetivo]))[0].n === 1, err && err.code)
    err = null
    const antes = (await db.query(`SELECT count(*)::int AS n FROM ${ES}.usuarios`))[0].n
    try { await db.query(SQLS.crear, ['otra@prueba.invalid', 'Otra', 'hash', 'mesero', ['mesero'], true, actor, 'Admin Prueba', 'admin', j({ campos: ['email'] })]) } catch (e) { err = e }
    check('crear: si la auditoría falla el usuario NO se crea', err && err.code === '23514' && (await db.query(`SELECT count(*)::int AS n FROM ${ES}.usuarios`))[0].n === antes, err && err.code)
    await db.query(`ALTER TABLE ${ES}.auditoria_admin DROP CONSTRAINT prueba_rechaza`)
    r = await db.query(SQLS.actualizar, [objetivo, 'Control', null, null, null, null, null, null, actor, 'Admin Prueba', 'admin'])
    check('CONTROL: sin el CHECK el mismo cambio sí se aplica y deja su entrada', r[0].aplicado === 1 && (await entradas5()).length === 1)
  } finally {
    try { await db.query(`DROP SCHEMA IF EXISTS ${ES} CASCADE`) } catch (e) { console.log('  AVISO: no se pudo eliminar el esquema temporal ' + ES + ': ' + e.message) }
  }
  const restos = await db`SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name LIKE 'prueba\_usuarios\_%'`
  check('el esquema temporal se eliminó (no queda ningún prueba_usuarios_*)', restos[0].n === 0, restos[0])

  // ───────────────────────── D. cobertura contra la base real (solo lectura) ─────────────────────────
  console.log('\n[usuarios] F50 (D): todo lo que referencia a usuarios está en la lista del código')
  const hist = new Set(S.REFERENCIAS_HISTORIAL.map(([t, c]) => `${t}.${c}`))
  const limp = new Set(S.REFERENCIAS_LIMPIABLES.map(([t, c]) => `${t}.${c}`))
  const fks = await db`
    SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna, c.confdeltype AS al_borrar
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'soda_master.usuarios'::regclass`
  const clave = (r) => `${r.tabla.replace('soda_master.', '')}.${r.columna}`
  const sinRegistrar = fks.filter((f) => !hist.has(clave(f)) && !limp.has(clave(f))).map(clave)
  check('toda clave foránea hacia usuarios está registrada (historial o limpiable)', sinRegistrar.length === 0, sinRegistrar)
  const mal = fks.filter((f) => (f.al_borrar === 'a' && !hist.has(clave(f))) || (f.al_borrar === 'c' && !limp.has(clave(f)))).map(clave)
  check('las claves sin cascada están en historial (si no, el DELETE daría 500) y las de ON DELETE CASCADE en limpiables', mal.length === 0, mal)
  const cols = await db`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'soda_master' AND data_type = 'uuid'
      AND column_name ~ '(usuario|_por$|responsable|cajero|mesero|creado_por|autorizado|registrado|otorgado|revocado|destinatario)'`
  const candidatas = cols.map((r) => `${r.table_name}.${r.column_name}`).filter((k) => !hist.has(k) && !limp.has(k))
  check('ninguna columna UUID con nombre de usuario (…_por, usuario_id, responsable…) queda fuera de la lista: una tabla nueva sin registrar hace fallar esta prueba', candidatas.length === 0, candidatas)
  const existentes = new Set((await db`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'soda_master'`).map((r) => `${r.table_name}.${r.column_name}`))
  const fantasmas = [...hist, ...limp].filter((k) => !existentes.has(k))
  check('toda columna de la lista existe en la base (sin errores de escritura)', fantasmas.length === 0, fantasmas)
  check('REFERENCIAS_HISTORIAL tiene las 21 columnas decididas (19 de la sesión 14.5b-3 y las 2 de solicitudes_arco de la 18) y notificaciones.destinatario_usuario_id NO cuenta como historial', S.REFERENCIAS_HISTORIAL.length === 21 && !hist.has('notificaciones.destinatario_usuario_id') && hist.has('empleados.usuario_id') && limp.has('notificaciones.destinatario_usuario_id'))
}
