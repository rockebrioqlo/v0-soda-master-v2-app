/**
 * Módulo `datos-personales` (sesión 17, K1): datos sensibles solo admin, registro de accesos y cambios en
 * `auditoria_admin`, purga oportunista en el login y retiro de Vercel Analytics.
 *
 *  A. Pruebas UNITARIAS (sin servidor): la lista blanca (`mapEmpleado`, `mapProveedor`, vista básica), los
 *     detalles seguros (solo nombres de campo, nunca valores), el plan de entradas de un cambio, el envoltorio
 *     de las lecturas (`leerConAuditoria`) y el de la purga (`purgarSinFallar`); más comprobaciones estáticas
 *     del código (sin `SELECT *`, vistas básicas, purga en el login, Analytics retirado).
 *  B. Por la API (servidor de la corrida): 401 y 403 para cada rol en lista, detalle y vista básica; la lista
 *     blanca de lo que sale; una entrada de auditoría por acción (lista, detalle, crear, modificar, desactivar,
 *     eliminar) sobre empleado, proveedor y usuario, sin valores en `detalles`; `GET /api/auditoria` solo admin
 *     con sus filtros y sus 400. Los empleados y proveedores que crea llevan la marca de la corrida y se
 *     borran al terminar (no hay ruta de borrado); las entradas de auditoría que dejan no se tocan (es un
 *     registro de solo adición).
 *  C. El MISMO texto SQL que ejecuta `lib/db.ts` contra un esquema temporal `prueba_datos_personales_*` con
 *     copias de las tablas (nunca se toca una fila de `soda_master` ni se siembra nada en las tablas reales):
 *       (a) una LECTURA cuyo registro falla responde igual y deja el log;
 *       (b) una MODIFICACIÓN cuyo registro falla se revierte (el cambio no queda);
 *       (c) la purga: borra solo lo viejo, acotada por el LIMIT, sin tocar lo vigente ni lo reciente, y su
 *           fallo no se propaga.
 *     Al iniciar elimina los esquemas `prueba_datos_personales_*` de corridas abortadas y al terminar
 *     (`finally`) el suyo.
 *  D. Login y purga por HTTP: levanta un servidor propio (puerto 3014, `PRUEBAS_PUERTO_DATOS`) con el mismo
 *     build y su salida capturada. Un login correcto de un usuario temporal responde 200 y la purga deja su
 *     línea `[purga] sesiones=N notificaciones=M` en el log del servidor; un PIN errado no la dispara. No
 *     siembra filas viejas en las tablas reales: eso solo se prueba en C.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, spawnSync } = require('child_process')
const L = require('./lib.cjs')
const { check, api, UUID_FALSO, sleep } = L

exports.nombre = 'datos-personales'

const RAIZ = path.resolve(__dirname, '..', '..')
const importar = (...p) => import('file:///' + path.join(RAIZ, ...p).split(path.sep).join('/'))
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const uuid = () => crypto.randomUUID()
const j = (o) => JSON.stringify(o)
const mismoConjunto = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
const P_DATOS = Number(process.env.PRUEBAS_PUERTO_DATOS || 3014)

function archivos(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) archivos(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina, db, marca } = ctx
  // Los módulos puros de la sesión 17. Si faltan (código anterior a la sesión), A y C no corren y se anota el
  // fallo; B (por la API) y D (login) no dependen de ellos: usan la especificación escrita aquí abajo.
  let M, AD, PG
  try {
    M = await importar('lib', 'personal-map.ts')
    AD = await importar('lib', 'auditoria-datos.ts')
    PG = await importar('lib', 'purga-sql.ts')
  } catch (e) {
    check('existen los módulos lib/personal-map.ts, lib/auditoria-datos.ts y lib/purga-sql.ts', false, String(e.message).slice(0, 160))
  }
  // La especificación (independiente del código): lo que PUEDE salir de la API y qué es un "detalle seguro".
  const COLS_EMPLEADO = ['id', 'nombre', 'cargo', 'documento', 'telefono', 'email', 'sueldo_base', 'periodicidad', 'fecha_ingreso', 'fecha_egreso', 'activo', 'usuario_id', 'notas', 'created_at', 'updated_at']
  const COLS_PROVEEDOR = ['id', 'nombre', 'rut', 'contacto', 'telefono', 'email', 'direccion', 'notas', 'activo', 'created_at', 'updated_at']
  const detallesSeguros = (d) => {
    if (d === null || d === undefined) return true
    if (typeof d !== 'object' || Array.isArray(d)) return false
    return Object.entries(d).every(([k, v]) => (k === 'campos' && Array.isArray(v) && v.every((c) => typeof c === 'string' && /^[a-z_][a-z0-9_]{0,40}$/.test(c))) || (k === 'filas' && Number.isInteger(v) && v >= 0) || (k === 'vista' && v === 'detalle'))
  }
  const etiqueta = Date.now().toString(36) + Math.floor(Math.random() * 1000)

  // ───────────────────────── A. unitarias y estáticas ─────────────────────────
  if (M && AD && PG) {
  console.log('\n[datos-personales] A: lista blanca, detalles seguros, plan de entradas y envoltorios')
  const conExtras = (cols) => ({ ...Object.fromEntries(cols.map((c) => [c, 'v_' + c])), pin_hash: 'h', secreto: 's', password: 'p', token: 't' })
  const me = M.mapEmpleado(conExtras(COLS_EMPLEADO))
  check('mapEmpleado: sale exactamente la lista blanca (una columna extra como pin_hash o secreto no sale)', mismoConjunto(Object.keys(me), COLS_EMPLEADO) && !('pin_hash' in me) && !('secreto' in me) && !('password' in me), Object.keys(me))
  const mp = M.mapProveedor(conExtras(COLS_PROVEEDOR))
  check('mapProveedor: sale exactamente la lista blanca (una columna extra no sale)', mismoConjunto(Object.keys(mp), COLS_PROVEEDOR) && !('secreto' in mp) && !('token' in mp), Object.keys(mp))
  const mb = M.mapPersonalBasico(conExtras(COLS_EMPLEADO))
  check('vista básica: solo id, nombre y activo (nada de documento, sueldo, teléfono ni email)', mismoConjunto(Object.keys(mb), ['id', 'nombre', 'activo']) && mb.id === 'v_id', Object.keys(mb))
  check('una columna ausente sale null y `activo: false` se conserva (no se pierde por el ?? null)', M.mapEmpleado({ id: 'x', nombre: 'n', activo: false }).cargo === null && M.mapEmpleado({ id: 'x', nombre: 'n', activo: false }).activo === false)
  check('los campos básicos son un subconjunto de la lista de empleados y de la de proveedores', M.COLUMNAS_BASICAS.every((c) => M.COLUMNAS_EMPLEADO.includes(c) && M.COLUMNAS_PROVEEDOR.includes(c)))

  // la lista blanca existe de verdad en las tablas (una errata no pasa); lectura del esquema real, sin tocar filas
  for (const [tabla, cols] of [['empleados', M.COLUMNAS_EMPLEADO], ['proveedores', M.COLUMNAS_PROVEEDOR]]) {
    const reales = (await db`SELECT column_name FROM information_schema.columns WHERE table_schema = 'soda_master' AND table_name = ${tabla}`).map((c) => c.column_name)
    check(`${tabla}: cada columna de la lista blanca existe en la tabla real`, cols.every((c) => reales.includes(c)), cols.filter((c) => !reales.includes(c)))
    const sinLista = reales.filter((c) => !cols.includes(c))
    check(`${tabla}: toda columna de la tabla está decidida (en la lista blanca o aquí declarada como oculta a propósito)`, sinLista.length === 0, sinLista)
  }

  const SE0 = AD.sentenciasEmpleados('soda_master', COLS_EMPLEADO)
  const SP0 = AD.sentenciasProveedores('soda_master', COLS_PROVEEDOR)
  check('los SELECT de empleados y proveedores llevan columnas explícitas (ningún `*`)', ![SE0.listar, SE0.listarBasico, SE0.porId, SP0.listar, SP0.listarBasico, SP0.porId].some((t) => /\*/.test(t)) && M.COLUMNAS_EMPLEADO.every((c) => SE0.listar.includes(c)))
  const dbSrc = leer('lib', 'db.ts')
  check('db.ts no usa `SELECT *` ni `RETURNING *` sobre empleados ni proveedores', !/SELECT \* FROM soda_master\.(empleados|proveedores)/.test(dbSrc) && !/INSERT INTO soda_master\.(empleados|proveedores)[\s\S]{0,500}RETURNING \*/.test(dbSrc) && !/UPDATE soda_master\.(empleados|proveedores)[\s\S]{0,900}RETURNING \*/.test(dbSrc))
  check('getAuditoriaAdmin usa columnas explícitas (sin SELECT *)', !/SELECT \* FROM soda_master\.auditoria_admin/.test(dbSrc) && !/SELECT \*/.test(AD.sentenciaLeerAuditoria('soda_master')))

  // detalles seguros: solo nombres de campo, cantidades y vista
  check('detallesSeguros acepta {campos}, {filas, vista}, {vista} y null', AD.detallesSeguros({ campos: ['sueldo_base', 'telefono'] }) && AD.detallesSeguros(AD.detallesLista(5)) && AD.detallesSeguros(AD.detallesDetalle()) && AD.detallesSeguros(null))
  check('detallesSeguros rechaza valores (un documento, un correo, un sueldo, una clave desconocida, texto en campos)',
    !AD.detallesSeguros({ documento: '12.345.678-9' }) && !AD.detallesSeguros({ campos: ['12.345.678-9'] }) && !AD.detallesSeguros({ campos: ['a@b.cl'] }) && !AD.detallesSeguros({ filas: '5' }) && !AD.detallesSeguros({ sueldo_base: 500000 }) && !AD.detallesSeguros({ campos: [{ sueldo_base: 1 }] }) && !AD.detallesSeguros([1]) && !AD.detallesSeguros('texto'))
  check('camposAplicados devuelve solo los NOMBRES de los campos con valor (sin valores; null y ausente no cuentan)', j(AD.camposAplicados({ nombre: 'Ana', sueldo_base: 0, telefono: null, documento: undefined, activo: false }, AD.CAMPOS_EMPLEADO_EDITABLES)) === j(['nombre', 'sueldo_base', 'activo']))
  // leerConAuditoria: un registro que falla no tumba la lectura (decisión del 21-11-2026)
  const registros = []
  const datosLeidos = [{ a: 1 }, { a: 2 }]
  let regLlamado = 0
  const okR = await AD.leerConAuditoria(async () => datosLeidos, async (d) => { regLlamado++; registros.push(d.length) }, (m, e) => registros.push('LOG ' + m))
  check('leerConAuditoria: con el registro bien, devuelve los datos y registra una vez con ellos', okR === datosLeidos && regLlamado === 1 && registros[0] === 2)
  const logs = []
  const malR = await AD.leerConAuditoria(async () => datosLeidos, async () => { const e = new Error('falla el registro'); e.code = 'XX999'; throw e }, (m, e) => logs.push([m, e]))
  check('leerConAuditoria: si el REGISTRO lanza, devuelve los datos igual y deja una línea en el log con el código', malR === datosLeidos && logs.length === 1 && logs[0][1].codigo === 'XX999' && /no se pudo registrar/.test(logs[0][0]), logs)
  let propagado = null
  try { await AD.leerConAuditoria(async () => { throw new Error('falla la lectura') }, async () => {}, () => {}) } catch (e) { propagado = e }
  check('leerConAuditoria: si falla la LECTURA el error sí sube (no se oculta)', propagado && propagado.message === 'falla la lectura')

  // purgarSinFallar: nunca lanza
  const spy = { info: [], error: [] }
  const logPurga = { info: (m) => spy.info.push(m), error: (m, e) => spy.error.push([m, e]) }
  const rOk = await PG.purgarSinFallar(async () => [{ sesiones: 3, notificaciones: 7 }], 'soda_master', {}, logPurga)
  check('purgarSinFallar: devuelve lo borrado y deja siempre una línea "[purga] sesiones=N notificaciones=M"', rOk && rOk.sesiones === 3 && rOk.notificaciones === 7 && spy.info[0] === '[purga] sesiones=3 notificaciones=7', spy)
  const rMal = await PG.purgarSinFallar(async () => { const e = new Error('se cayó Neon'); e.code = '57P01'; throw e }, 'soda_master', {}, logPurga)
  check('purgarSinFallar: si el SQL falla no lanza, devuelve null y lo anota en el log', rMal === null && spy.error.length === 1 && spy.error[0][1].codigo === '57P01')
  const rEsq = await PG.purgarSinFallar(async () => [], 'x; DROP TABLE y', {}, logPurga)
  check('purgarSinFallar: un esquema inválido tampoco lanza (null) y nada llega a la base', rEsq === null && spy.error.length === 2)
  check('límites de la purga: 200 filas por tabla y por pasada, 90 días', PG.LIMITE_PURGA === 200 && PG.DIAS_PURGA === 90)
  const sqlPurga = PG.sentenciaPurga('soda_master')
  check('el SQL de la purga acota con LIMIT y no toca una sesión vigente (solo revocada_at o expira anteriores al corte)', /LIMIT \$1::int/.test(sqlPurga) && (sqlPurga.match(/LIMIT \$1::int/g) || []).length === 2 && /revocada_at < now\(\) - make_interval\(days => \$2::int\)/.test(sqlPurga) && /expira < now\(\) - make_interval/.test(sqlPurga) && /creado_at < now\(\)/.test(sqlPurga))

  // estáticas: login, vistas básicas, Analytics
  const login = leer('app', 'api', 'auth', 'login', 'route.ts')
  check('el login corre la purga DESPUÉS de responder (after) y solo tras un ingreso correcto', /after\(\(\) => db\.purgarVencidos\(\)\)/.test(login) && login.indexOf('after(') > login.indexOf('crearSesion(usuario.id)') && login.indexOf('after(') < login.lastIndexOf('return Response.json(usuario'))
  const lim = leer('lib', 'intentos-login.ts')
  check('la purga no va en iniciarIntento (lo comparten verificar-pin y el cambio de PIN)', !/purgar/i.test(lim))
  check('Gastos, Compras y Activos piden la vista básica (solo el nombre)', /api\/proveedores\?vista=basica/.test(leer('components', 'gastos-tab.tsx')) && /api\/empleados\?vista=basica/.test(leer('components', 'gastos-tab.tsx')) && /api\/proveedores\?vista=basica/.test(leer('components', 'compras-tab.tsx')) && /api\/proveedores\?vista=basica/.test(leer('components', 'activos-tab.tsx')))
  check('los diálogos de Empleados y Proveedores piden el detalle por id (queda su entrada de auditoría)', /api\/empleados\/\$\{fila\.id\}/.test(leer('components', 'empleados-tab.tsx')) && /api\/proveedores\/\$\{fila\.id\}/.test(leer('components', 'proveedores-tab.tsx')))
  const pkg = JSON.parse(leer('package.json'))
  const usaAnalytics = archivos(RAIZ, ['.ts', '.tsx', '.js', '.mjs', '.cjs']).filter((f) => !f.includes(path.join('scripts', 'pruebas')) && leer(path.relative(RAIZ, f)).includes('@vercel/analytics'))
  check('Vercel Analytics retirado: sin la dependencia, sin imports y sin <Analytics /> en el layout', !('@vercel/analytics' in (pkg.dependencies || {})) && !('@vercel/analytics' in (pkg.devDependencies || {})) && usaAnalytics.length === 0 && !/Analytics/.test(leer('app', 'layout.tsx')) && !/@vercel\/analytics/.test(leer('pnpm-lock.yaml')), usaAnalytics)

  }

  // ───────────────────────── B. por la API ─────────────────────────
  console.log('\n[datos-personales] B: por la API (401, 403, lista blanca, una entrada por acción, sin valores)')
  const t0 = new Date((await db`SELECT now() AS t`)[0].t)
  const bar = await L.crearUsuarioPrueba(ctx, 'bar')
  const sinSesion = null
  const roles = [['sin sesión', sinSesion, 401], ['mesero', mesero, 403], ['cajero', cajero, 403], ['cocina', cocina, 403], ['bar', bar.sesion, 403]]
  const entradas = async (extra = '') => {
    const r = await api(admin, 'GET', '/api/auditoria?limite=500' + extra)
    return Array.isArray(r.json) ? r.json.filter((e) => new Date(e.created_at) >= t0) : []
  }
  const lecturasDe = async (entidad) => (await entradas()).filter((e) => e.accion === 'ver_datos_personales' && e.entidad === entidad)
  const antes403 = (await entradas()).length
  const rutas403 = [
    ['GET', '/api/empleados'], ['GET', '/api/empleados?vista=basica'], ['GET', '/api/empleados/' + UUID_FALSO], ['POST', '/api/empleados', {}], ['PATCH', '/api/empleados/' + UUID_FALSO, {}],
    ['GET', '/api/proveedores'], ['GET', '/api/proveedores?vista=basica'], ['GET', '/api/proveedores/' + UUID_FALSO], ['POST', '/api/proveedores', {}], ['PATCH', '/api/proveedores/' + UUID_FALSO, {}],
    ['GET', '/api/auditoria'], ['GET', '/api/auditoria?limite=1'],
  ]
  for (const [rol, ses, esperado] of roles) {
    const malos = []
    for (const [m, ruta, cuerpo] of rutas403) {
      const r = await api(ses, m, ruta, cuerpo)
      if (r.status !== esperado) malos.push(`${m} ${ruta} → ${r.status}`)
    }
    check(`${rol}: las ${rutas403.length} rutas de datos personales y de auditoría responden ${esperado} (lista, detalle, vista básica, alta, cambio y auditoría)`, malos.length === 0, malos)
  }
  check('los 401 y 403 no dejan ninguna entrada de auditoría', (await entradas()).length === antes403)

  // 400 y 404
  const adm = (m, r, c) => api(admin, m, r, c)
  check('empleados y proveedores: vista inválida o parámetro desconocido → 400; id mal escrito → 400; id que no existe → 404', (await adm('GET', '/api/empleados?vista=otra')).status === 400 && (await adm('GET', '/api/empleados?foo=1')).status === 400 && (await adm('GET', '/api/proveedores?vista=otra')).status === 400 && (await adm('GET', '/api/proveedores?foo=1')).status === 400 && (await adm('GET', '/api/empleados/no-es-uuid')).status === 400 && (await adm('GET', '/api/proveedores/no-es-uuid')).status === 400 && (await adm('GET', '/api/empleados/' + UUID_FALSO)).status === 404 && (await adm('GET', '/api/proveedores/' + UUID_FALSO)).status === 404)

  // fixtures: un empleado y un proveedor con valores inconfundibles (la marca los hace reconocibles y se borran al final)
  const V = { doc: '99.888.777-6', tel: '+56 9 5555 4321', mail: `prueba-dp-${etiqueta}@prueba.invalid`, sueldo: 1234567, nota: 'nota reservada prueba', rut: '77.666.555-4', contacto: 'Contacto Reservado Prueba', dir: 'Calle Reservada 123', sueldo2: 7654321, tel2: '+56 9 1111 2222' }
  const creados = { empleados: [], proveedores: [] }
  const limpiarDatos = async () => {
    for (const id of creados.empleados) await db`DELETE FROM soda_master.empleados WHERE id = ${id}::uuid AND starts_with(nombre, ${marca})`
    for (const id of creados.proveedores) await db`DELETE FROM soda_master.proveedores WHERE id = ${id}::uuid AND starts_with(nombre, ${marca})`
  }
  const idsDe = (arr) => arr.map((e) => e.entidad_id)
  const porId = async (id, filtro = () => true) => (await entradas()).filter((e) => e.entidad_id === id && filtro(e))
  const sinValores = (e) => detallesSeguros(e.detalles)
  try {
    // ── empleado ──
    const e1 = await adm('POST', '/api/empleados', { nombre: `${marca} empleado`, cargo: 'Cargo prueba', documento: V.doc, telefono: V.tel, email: V.mail, sueldo_base: V.sueldo, notas: V.nota })
    check('POST empleado → 201 con la lista blanca completa', e1.status === 201 && mismoConjunto(Object.keys(e1.json), COLS_EMPLEADO), e1)
    const eid = e1.json.id
    creados.empleados.push(eid)
    let ent = await porId(eid)
    check('crear empleado deja UNA entrada "crear" del admin, con nombres de campo y sin ningún valor',
      ent.length === 1 && ent[0].accion === 'crear' && ent[0].entidad === 'empleado' && ent[0].usuario_rol && ent[0].entidad_nombre === `${marca} empleado` && mismoConjunto(ent[0].detalles.campos, ['nombre', 'cargo', 'documento', 'telefono', 'email', 'sueldo_base', 'periodicidad', 'notas']) && sinValores(ent[0])
      && ![V.doc, V.tel, V.mail, String(V.sueldo), V.nota].some((v) => JSON.stringify(ent[0].detalles).includes(v)), ent)

    let n0 = (await lecturasDe('empleado')).length
    const lista = await adm('GET', '/api/empleados?incluir_inactivos=true')
    const filaLista = Array.isArray(lista.json) ? lista.json.find((x) => x.id === eid) : null
    check('GET lista de empleados (detalle): todas las filas traen exactamente la lista blanca y llevan documento y sueldo', lista.status === 200 && Array.isArray(lista.json) && lista.json.length > 0 && lista.json.every((x) => mismoConjunto(Object.keys(x), COLS_EMPLEADO)) && filaLista && filaLista.documento === V.doc && Number(filaLista.sueldo_base) === V.sueldo)
    let lec = await lecturasDe('empleado')
    check('la consulta de lista deja UNA entrada "ver_datos_personales" con la cantidad de filas', lec.length === n0 + 1 && lec[0].detalles.filas === lista.json.length && lec[0].detalles.vista === 'detalle' && lec[0].entidad_id === null && sinValores(lec[0]), lec[0])
    n0 = lec.length
    const basica = await adm('GET', '/api/empleados?vista=basica&incluir_inactivos=true')
    const filaBasica = Array.isArray(basica.json) ? basica.json.find((x) => x.id === eid) : null
    check('vista básica de empleados: solo id, nombre y activo (sin documento, sueldo, teléfono ni email) y NO deja entrada', basica.status === 200 && basica.json.every((x) => mismoConjunto(Object.keys(x), ['id', 'nombre', 'activo'])) && filaBasica && !JSON.stringify(basica.json).includes(V.doc) && !JSON.stringify(basica.json).includes(V.mail) && (await lecturasDe('empleado')).length === n0)
    const det = await adm('GET', '/api/empleados/' + eid)
    lec = await lecturasDe('empleado')
    check('GET detalle de un empleado: lista blanca y UNA entrada "ver_datos_personales" con su id y nombre', det.status === 200 && mismoConjunto(Object.keys(det.json), COLS_EMPLEADO) && det.json.documento === V.doc && lec.length === n0 + 1 && lec[0].entidad_id === eid && lec[0].entidad_nombre === `${marca} empleado` && sinValores(lec[0]), lec[0])
    n0 = lec.length
    await adm('GET', '/api/empleados/' + UUID_FALSO)
    check('un detalle que no existe (404) no deja entrada', (await lecturasDe('empleado')).length === n0)

    // modificar, desactivar
    let r = await adm('PATCH', '/api/empleados/' + eid, { sueldo_base: V.sueldo2, telefono: V.tel2 })
    ent = await porId(eid, (e) => e.accion === 'modificar')
    check('PATCH empleado (sueldo y teléfono) → 200, el cambio queda y deja UNA entrada "modificar" con los campos tocados y ningún valor', r.status === 200 && Number(r.json.sueldo_base) === V.sueldo2 && r.json.documento === V.doc && ent.length === 1 && mismoConjunto(ent[0].detalles.campos, ['sueldo_base', 'telefono']) && sinValores(ent[0]) && ![V.sueldo2, V.tel2, V.sueldo].some((v) => JSON.stringify(ent[0].detalles).includes(String(v))), ent)
    r = await adm('PATCH', '/api/empleados/' + eid, { sueldo_base: V.sueldo2, telefono: V.tel2, cargo: 'Cargo prueba', documento: V.doc, nombre: `${marca} empleado` })
    check('reenviar los mismos valores (el formulario manda todos los campos) se guarda pero NO deja entrada: solo se registran los campos que cambiaron', r.status === 200 && (await porId(eid, (e) => e.accion === 'modificar')).length === 1)
    r = await adm('PATCH', '/api/empleados/' + eid, { cargo: 'Cargo prueba 2', documento: V.doc, telefono: V.tel2 })
    ent = await porId(eid, (e) => e.accion === 'modificar')
    check('si de varios campos reenviados solo uno cambia, la entrada lista solo ese (cargo; no documento ni teléfono)', r.status === 200 && ent.length === 2 && ent.some((e) => mismoConjunto(e.detalles.campos, ['cargo'])), ent)
    r = await adm('PATCH', '/api/empleados/' + eid, { cargo: 'Cargo prueba' })
    r = await adm('PATCH', '/api/empleados/' + eid, { activo: false })
    check('PATCH {activo: false} deja UNA entrada "desactivar" y ninguna "modificar" nueva', r.status === 200 && r.json.activo === false && (await porId(eid, (e) => e.accion === 'desactivar')).length === 1 && (await porId(eid, (e) => e.accion === 'modificar')).length === 3)
    r = await adm('PATCH', '/api/empleados/' + eid, { activo: true, cargo: 'Otro cargo' })
    ent = await porId(eid, (e) => e.accion === 'modificar')
    check('reactivar con otro cambio es una "modificar" que incluye el campo activo (y no una desactivación)', r.status === 200 && ent.length === 4 && ent.some((e) => mismoConjunto(e.detalles.campos, ['activo', 'cargo'])) && (await porId(eid, (e) => e.accion === 'desactivar')).length === 1)
    r = await adm('PATCH', '/api/empleados/' + eid, { activo: false, notas: 'otra nota reservada' })
    check('desactivar junto con otro campo deja DOS entradas ("modificar" con las notas y "desactivar")', r.status === 200 && (await porId(eid, (e) => e.accion === 'desactivar')).length === 2 && (await porId(eid, (e) => e.accion === 'modificar')).some((e) => mismoConjunto(e.detalles.campos, ['notas'])))
    const nTotal = (await porId(eid)).length
    r = await adm('PATCH', '/api/empleados/' + eid, {})
    check('un PATCH sin campos no cambia nada y no deja entrada', r.status === 200 && (await porId(eid)).length === nTotal)
    const bad = await adm('PATCH', '/api/empleados/' + eid, { nombre: 'x', pin_hash: 'x' })
    check('el esquema estricto sigue rechazando campos desconocidos (400) sin dejar entrada', bad.status === 400 && (await porId(eid)).length === nTotal)
    r = await adm('PATCH', '/api/empleados/' + UUID_FALSO, { cargo: 'x' })
    check('PATCH de un empleado que no existe → 404 y ninguna entrada para ese id', r.status === 404 && (await porId(UUID_FALSO)).length === 0)

    // ── proveedor ──
    const p1 = await adm('POST', '/api/proveedores', { nombre: `${marca} proveedor`, rut: V.rut, contacto: V.contacto, telefono: V.tel, email: V.mail, direccion: V.dir })
    check('POST proveedor → 201 con la lista blanca completa', p1.status === 201 && mismoConjunto(Object.keys(p1.json), COLS_PROVEEDOR), p1)
    const pid = p1.json.id
    creados.proveedores.push(pid)
    ent = await porId(pid)
    check('crear proveedor deja UNA entrada "crear" con nombres de campo y sin valores', ent.length === 1 && ent[0].accion === 'crear' && ent[0].entidad === 'proveedor' && mismoConjunto(ent[0].detalles.campos, ['nombre', 'rut', 'contacto', 'telefono', 'email', 'direccion']) && sinValores(ent[0]) && ![V.rut, V.contacto, V.dir].some((v) => JSON.stringify(ent[0].detalles).includes(v)), ent)
    n0 = (await lecturasDe('proveedor')).length
    const lp = await adm('GET', '/api/proveedores?incluir_inactivos=true')
    lec = await lecturasDe('proveedor')
    check('lista de proveedores: lista blanca en cada fila y UNA entrada con la cantidad de filas', lp.status === 200 && lp.json.length > 0 && lp.json.every((x) => mismoConjunto(Object.keys(x), COLS_PROVEEDOR)) && lec.length === n0 + 1 && lec[0].detalles.filas === lp.json.length && sinValores(lec[0]))
    n0 = lec.length
    const bp = await adm('GET', '/api/proveedores?vista=basica')
    check('vista básica de proveedores: solo id, nombre y activo, sin RUT ni contacto, y NO deja entrada', bp.status === 200 && bp.json.length > 0 && bp.json.every((x) => mismoConjunto(Object.keys(x), ['id', 'nombre', 'activo'])) && !JSON.stringify(bp.json).includes(V.rut) && (await lecturasDe('proveedor')).length === n0)
    const dp = await adm('GET', '/api/proveedores/' + pid)
    lec = await lecturasDe('proveedor')
    check('detalle de un proveedor: lista blanca, y UNA entrada con su id', dp.status === 200 && dp.json.rut === V.rut && lec.length === n0 + 1 && lec[0].entidad_id === pid && sinValores(lec[0]))
    r = await adm('PATCH', '/api/proveedores/' + pid, { contacto: 'Otro contacto reservado', direccion: 'Otra dirección reservada' })
    ent = await porId(pid, (e) => e.accion === 'modificar')
    check('PATCH proveedor deja UNA entrada "modificar" con los campos tocados y sin valores', r.status === 200 && ent.length === 1 && mismoConjunto(ent[0].detalles.campos, ['contacto', 'direccion']) && sinValores(ent[0]) && !JSON.stringify(ent[0].detalles).includes('reservad'))
    r = await adm('PATCH', '/api/proveedores/' + pid, { activo: false })
    check('desactivar un proveedor deja UNA entrada "desactivar"', r.status === 200 && r.json.activo === false && (await porId(pid, (e) => e.accion === 'desactivar')).length === 1)

    // ── usuario ──
    const nU0 = (await lecturasDe('usuario')).length
    const tmp = await L.crearUsuarioPrueba(ctx, 'mesero', {}, false)
    const uid = tmp.usuario.id
    ent = await porId(uid)
    check('crear un usuario deja UNA entrada "crear" con nombres de campo; ni el PIN ni el correo ni un hash están en los detalles',
      ent.length === 1 && ent[0].accion === 'crear' && ent[0].entidad === 'usuario' && mismoConjunto(ent[0].detalles.campos, ['nombre', 'email', 'rol', 'activo', 'pin']) && sinValores(ent[0]) && !JSON.stringify(ent[0].detalles).includes(tmp.usuario.pin) && !JSON.stringify(ent[0].detalles).includes('@') && ent[0].entidad_nombre === tmp.usuario.nombre && ent[0].entidad_nombre !== tmp.usuario.email, ent)
    r = await adm('PATCH', '/api/usuarios/' + uid, { nombre: `${marca} mesero 2` })
    check('PATCH usuario (nombre) deja una entrada "modificar" solo con el campo nombre', r.status === 200 && (await porId(uid, (e) => e.accion === 'modificar')).some((e) => mismoConjunto(e.detalles.campos, ['nombre'])))
    const pinNuevo = String(1000 + Math.floor(Math.random() * 9000))
    r = await adm('PATCH', '/api/usuarios/' + uid, { pin: pinNuevo })
    ent = await porId(uid, (e) => e.accion === 'modificar')
    check('cambiar el PIN de otro usuario deja una "modificar" con el NOMBRE del campo (pin) y nunca su valor', r.status === 200 && ent.some((e) => mismoConjunto(e.detalles.campos, ['pin'])) && ent.every((e) => !JSON.stringify(e.detalles).includes(pinNuevo) && !JSON.stringify(e.detalles).includes(tmp.usuario.pin)))
    r = await adm('PATCH', '/api/usuarios/' + uid, { activo: false })
    check('desactivar un usuario deja una entrada "desactivar"', r.status === 200 && (await porId(uid, (e) => e.accion === 'desactivar')).length === 1)
    r = await adm('PATCH', '/api/usuarios/' + uid, { rol: 'admin', nombre: 'x', pin_hash: 'x' })
    check('un PATCH de usuario rechazado (400) no deja entrada nueva', r.status === 400 && (await porId(uid)).length === 4)
    r = await adm('DELETE', '/api/usuarios/' + uid)
    ent = await porId(uid, (e) => e.accion === 'eliminar')
    check('borrar el usuario deja UNA entrada "eliminar" (sin detalles) con su id y su nombre', r.status === 200 && ent.length === 1 && ent[0].detalles === null && ent[0].entidad_nombre === `${marca} mesero 2`, ent)

    // lecturas de la lista de usuarios
    let nu = (await lecturasDe('usuario')).length
    const lu = await adm('GET', '/api/usuarios')
    lec = await lecturasDe('usuario')
    check('la lista de usuarios pedida por el admin deja UNA entrada "ver_datos_personales" con la cantidad de filas', lu.status === 200 && Array.isArray(lu.json) && lec.length === nu + 1 && lec[0].detalles.filas === lu.json.length && sinValores(lec[0]), lec[0])
    nu = lec.length
    const sondeo = await api({ ...admin, cabeceras: { 'x-sm-sondeo': '1' } }, 'GET', '/api/usuarios')
    check('la recarga de fondo de la pantalla Usuarios (cabecera de sondeo) NO se registra', sondeo.status === 200 && (await lecturasDe('usuario')).length === nu)
    const unico = await adm('GET', '/api/usuarios?id=' + lu.json[0].id)
    check('consultar un solo usuario (verificación de sesión) NO se registra', unico.status === 200 && (await lecturasDe('usuario')).length === nu)
    const luM = await api(mesero, 'GET', '/api/usuarios')
    check('la lista de usuarios de un no admin no se registra y sigue trayendo el correo (el POS y las mermas lo usan para el PIN del admin: hallazgo F59, sin cambio)', luM.status === 200 && Array.isArray(luM.json) && luM.json.every((u) => typeof u.email === 'string' && u.intentosFallidos === 0 && u.bloqueadoHasta === null) && (await lecturasDe('usuario')).length === nu)

    // ── GET /api/auditoria ──
    const todas = await api(admin, 'GET', '/api/auditoria')
    const CLAVES = ['id', 'usuario_id', 'usuario_nombre', 'usuario_rol', 'accion', 'entidad', 'entidad_id', 'entidad_nombre', 'detalles', 'created_at']
    check('GET /api/auditoria (admin) → 200, columnas exactas, de la más nueva a la más vieja y por defecto hasta 200', todas.status === 200 && Array.isArray(todas.json) && todas.json.length > 0 && todas.json.length <= 200 && todas.json.every((e) => mismoConjunto(Object.keys(e), CLAVES)) && todas.json.every((e, i, a) => i === 0 || new Date(a[i - 1].created_at) >= new Date(e.created_at)))
    const fe = await api(admin, 'GET', '/api/auditoria?entidad=empleado&limite=500')
    check('filtro por entidad: solo esa entidad', fe.status === 200 && fe.json.length > 0 && fe.json.every((e) => e.entidad === 'empleado'))
    const fa = await api(admin, 'GET', '/api/auditoria?accion=desactivar&limite=500')
    check('filtro por acción: solo esa acción', fa.status === 200 && fa.json.length > 0 && fa.json.every((e) => e.accion === 'desactivar'))
    const fea = await api(admin, 'GET', '/api/auditoria?entidad=proveedor&accion=crear&limite=500')
    check('entidad y acción juntas', fea.status === 200 && fea.json.some((e) => e.entidad_id === pid) && fea.json.every((e) => e.entidad === 'proveedor' && e.accion === 'crear'))
    check('límite: limite=1 devuelve a lo más una entrada', (await api(admin, 'GET', '/api/auditoria?limite=1')).json.length === 1)
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
    const fh = await api(admin, 'GET', `/api/auditoria?desde=${hoy}&hasta=${hoy}&entidad=empleado&limite=500`)
    check('fechas: desde y hasta de hoy (hora de Santiago, hasta inclusive) incluyen lo recién hecho; el futuro y el pasado lejano dan lista vacía', fh.status === 200 && fh.json.some((e) => e.entidad_id === eid) && (await api(admin, 'GET', '/api/auditoria?desde=2099-01-01')).json.length === 0 && (await api(admin, 'GET', '/api/auditoria?hasta=2000-01-01')).json.length === 0)
    const malas = ['?foo=1', '?desde=2026-13-45', '?desde=21-11-2026', '?hasta=ayer', '?limite=0', '?limite=501', '?limite=abc', '?desde=2026-11-21&hasta=2026-11-20', '?entidad=' + 'x'.repeat(41)]
    const no400 = []
    for (const q of malas) if ((await api(admin, 'GET', '/api/auditoria' + q)).status !== 400) no400.push(q)
    check(`parámetros inválidos → 400 (${malas.length} casos: desconocido, fecha irreal o mal escrita, límite fuera de 1 a 500, desde posterior a hasta, entidad larga)`, no400.length === 0, no400)
    const vistas = await entradas()
    check('todas las entradas de esta corrida sobre empleado, proveedor y usuario tienen detalles seguros (solo campos, filas o vista)', vistas.length > 0 && vistas.filter((e) => ['empleado', 'proveedor', 'usuario'].includes(e.entidad)).every(sinValores), vistas.filter((e) => !sinValores(e)).slice(0, 3))
    const todas500 = (await api(admin, 'GET', '/api/auditoria?limite=500')).json
    const texto = JSON.stringify(todas500)
    // un PIN de 4 dígitos puede coincidir por azar con dígitos de un id o una hora: se busca solo en lo que guarda el registro (detalles y nombres)
    const textoGuardado = JSON.stringify(todas500.map((e) => [e.detalles, e.entidad_nombre, e.usuario_nombre]))
    const fugas = [V.doc, V.tel, V.tel2, V.mail, String(V.sueldo), String(V.sueldo2), V.nota, V.rut, V.contacto, V.dir, tmp.usuario.email].filter((v) => texto.includes(v)).concat([pinNuevo, tmp.usuario.pin].filter((v) => textoGuardado.includes(v)))
    check('ni la respuesta de la auditoría ni lo guardado contienen un solo valor de los datos tocados (documento, sueldo, teléfono, correo, RUT, contacto, dirección, PIN)', fugas.length === 0, fugas)
  } finally {
    await limpiarDatos().catch((e) => console.log('  AVISO: no se pudieron borrar los empleados y proveedores de prueba: ' + e.message))
  }
  // (solo los que creó ESTE módulo: otros módulos, como `rutas`, dejan los suyos desactivados y no son de esta prueba)
  const restantes = await db`SELECT (SELECT count(*)::int FROM soda_master.empleados WHERE id = ANY(${creados.empleados}::uuid[])) AS e, (SELECT count(*)::int FROM soda_master.proveedores WHERE id = ANY(${creados.proveedores}::uuid[])) AS p`
  check('los empleados y proveedores que creó este módulo se borraron al terminar', creados.empleados.length > 0 && restantes[0].e === 0 && restantes[0].p === 0, restantes[0])

  // ───────────────────────── C. el mismo SQL en un esquema temporal ─────────────────────────
  if (M && AD && PG) {
  console.log('\n[datos-personales] C: el mismo SQL en un esquema temporal prueba_datos_personales_* (fallos del registro y purga)')
  const viejos = await db`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'prueba\_datos\_personales\_%'`
  for (const e of viejos) await db.query(`DROP SCHEMA IF EXISTS ${e.schema_name} CASCADE`)
  if (viejos.length) console.log(`  (se eliminaron ${viejos.length} esquema(s) prueba_datos_personales_* de corridas anteriores)`)
  const ES = `prueba_datos_personales_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  try {
    await db.query(`CREATE SCHEMA ${ES}`)
    for (const t of ['empleados', 'proveedores', 'auditoria_admin', 'sesiones', 'notificaciones']) {
      await db.query(`CREATE TABLE ${ES}.${t} (LIKE soda_master.${t} INCLUDING ALL)`)
    }
    // una columna que nadie decidió exponer: tiene que NO salir (lista blanca)
    await db.query(`ALTER TABLE ${ES}.empleados ADD COLUMN secreto text DEFAULT 'no debe salir'`)
    await db.query(`ALTER TABLE ${ES}.proveedores ADD COLUMN secreto text DEFAULT 'no debe salir'`)
    const SE = AD.sentenciasEmpleados(ES, COLS_EMPLEADO)
    const SP = AD.sentenciasProveedores(ES, COLS_PROVEEDOR)
    const actor = { id: uuid(), nombre: 'Admin Prueba', rol: 'admin' }
    const q = (t, p) => db.query(t, p)
    const aud = () => db.query(`SELECT accion, entidad, entidad_id, entidad_nombre, usuario_id, detalles FROM ${ES}.auditoria_admin ORDER BY accion, entidad_nombre`)
    const vaciar = () => db.query(`TRUNCATE ${ES}.empleados, ${ES}.proveedores, ${ES}.auditoria_admin`)
    const crear = (S, vals, campos = Object.keys(vals)) => {
      const todo = S === SE ? { sueldo_base: 0, periodicidad: 'mensual', ...vals } : vals
      return q(S.crear, [...S.insertables.map((c) => todo[c] ?? null), actor.id, actor.nombre, actor.rol, j({ campos })])
    }
    const cambiar = (S, id, vals) => q(S.actualizar, [id, ...S.actualizables.map((c) => vals[c] ?? null), actor.id, actor.nombre, actor.rol])
    const regLectura = (extra = {}) => q(AD.sentenciaRegistrarAcceso(ES), [actor.id, actor.nombre, actor.rol, 'ver_datos_personales', 'empleado', null, null, j(extra.detalles ?? AD.detallesLista(2))])

    // C1. lista blanca en el SQL (columna extra) y vistas
    await vaciar()
    const a = (await crear(SE, { nombre: 'Ana', documento: '1-9', sueldo_base: 500000, periodicidad: 'mensual' }))[0]
    await crear(SE, { nombre: 'Beto', sueldo_base: 1, periodicidad: 'semanal' })
    await cambiar(SE, (await q(`SELECT id FROM ${ES}.empleados WHERE nombre = 'Beto'`))[0].id, { activo: false })
    const raw = await q(SE.listar, [false])
    check('SQL listar empleados: devuelve solo las columnas de la lista blanca aunque la tabla tenga otra (secreto no sale), también con el mapa', raw.length === 2 && raw.every((x) => mismoConjunto(Object.keys(x), COLS_EMPLEADO)) && raw.every((x) => !('secreto' in M.mapEmpleado(x))), Object.keys(raw[0]))
    check('SQL listar con solo_activos: sin el desactivado; vista básica: id, nombre y activo', (await q(SE.listar, [true])).length === 1 && (await q(SE.listarBasico, [false])).every((x) => mismoConjunto(Object.keys(x), ['id', 'nombre', 'activo'])))
    check('SQL por id: una fila con la lista blanca; id que no existe: ninguna', mismoConjunto(Object.keys((await q(SE.porId, [a.id]))[0]), COLS_EMPLEADO) && (await q(SE.porId, [uuid()])).length === 0)
    const pv = (await crear(SP, { nombre: 'Prov', rut: '7-1' }))[0]
    check('SQL de proveedores: lista blanca (secreto no sale) y vista básica', mismoConjunto(Object.keys(pv), COLS_PROVEEDOR) && mismoConjunto(Object.keys((await q(SP.listar, [false]))[0]), COLS_PROVEEDOR) && mismoConjunto(Object.keys((await q(SP.listarBasico, [false]))[0]), ['id', 'nombre', 'activo']))

    // C2. el cambio y su entrada van juntos
    await vaciar()
    const e2 = (await crear(SE, { nombre: 'Cami', sueldo_base: 100, documento: 'doc-x' }, ['nombre', 'sueldo_base', 'documento']))[0]
    let ent2 = await aud()
    check('SQL crear empleado: la fila y su entrada "crear" (actor, entidad, id, nombre, solo nombres de campo)', ent2.length === 1 && ent2[0].accion === 'crear' && ent2[0].entidad === 'empleado' && ent2[0].entidad_id === e2.id && ent2[0].entidad_nombre === 'Cami' && ent2[0].usuario_id === actor.id && AD.detallesSeguros(ent2[0].detalles), ent2)
    const c2 = (await cambiar(SE, e2.id, { sueldo_base: 200, activo: false }))[0]
    ent2 = await aud()
    check('SQL actualizar: COALESCE (lo no enviado queda), dos entradas (modificar y desactivar) y la fila devuelta con la lista blanca', Number(c2.sueldo_base) === 200 && c2.documento === 'doc-x' && c2.activo === false && ent2.map((x) => x.accion).join() === 'crear,desactivar,modificar' && mismoConjunto(Object.keys(c2), COLS_EMPLEADO), ent2)
    const ultimaMod = async () => (await q(`SELECT detalles FROM ${ES}.auditoria_admin WHERE accion = 'modificar' ORDER BY created_at DESC LIMIT 1`))[0]
    const n1 = (await aud()).length
    await cambiar(SE, e2.id, { nombre: 'Cami', documento: 'doc-x', sueldo_base: 200, activo: false })
    check('SQL actualizar con los mismos valores (todo reenviado, nada cambia): la fila se guarda y NO deja entrada (ni siquiera "desactivar": ya estaba inactivo)', (await aud()).length === n1)
    await cambiar(SE, e2.id, { nombre: 'Cami', documento: 'doc-x', sueldo_base: 300, activo: false })
    check('SQL actualizar: de todo lo reenviado, la entrada lista SOLO el campo que cambió (sueldo_base)', j((await ultimaMod()).detalles) === j({ campos: ['sueldo_base'] }) && (await aud()).length === n1 + 1)
    await cambiar(SE, e2.id, { nombre: 'Cami', activo: true })
    check('reactivar es una modificación del campo activo (la entrada lo dice y no es "desactivar")', j((await ultimaMod()).detalles) === j({ campos: ['activo'] }) && (await aud()).filter((x) => x.accion === 'desactivar').length === 1)
    const nAntes = (await aud()).length
    const ninguno = await cambiar(SE, uuid(), { nombre: 'Nadie' })
    check('SQL actualizar de un id que no existe: ninguna fila y ninguna entrada', ninguno.length === 0 && (await aud()).length === nAntes)

    // C3. (b) si el REGISTRO de una modificación falla, el cambio se revierte
    const rechazar = (acciones) => db.query(`ALTER TABLE ${ES}.auditoria_admin ADD CONSTRAINT prueba_rechaza CHECK (accion NOT IN (${acciones.map((x) => `'${x}'`).join(', ')})) NOT VALID`)
    const permitir = () => db.query(`ALTER TABLE ${ES}.auditoria_admin DROP CONSTRAINT prueba_rechaza`)
    await vaciar()
    const f0 = (await crear(SE, { nombre: 'Original', sueldo_base: 111, documento: 'doc-orig' }))[0]
    await rechazar(['modificar', 'desactivar', 'crear'])
    let err = null
    try { await cambiar(SE, f0.id, { nombre: 'Cambiado', sueldo_base: 999, activo: false }) } catch (e) { err = e }
    const fila0 = (await q(`SELECT nombre, sueldo_base, activo, documento FROM ${ES}.empleados WHERE id = $1`, [f0.id]))[0]
    check('(b) EMPLEADO: si la entrada "modificar"/"desactivar" falla (23514), el statement lanza y el cambio NO queda (nombre, sueldo y activo intactos)', err && err.code === '23514' && fila0.nombre === 'Original' && Number(fila0.sueldo_base) === 111 && fila0.activo === true, { code: err && err.code, fila0 })
    err = null
    const nEmp = (await q(`SELECT count(*)::int AS n FROM ${ES}.empleados`))[0].n
    try { await crear(SE, { nombre: 'No debe crearse', sueldo_base: 5 }) } catch (e) { err = e }
    check('(b) EMPLEADO: si la entrada "crear" falla, la fila NO se crea', err && err.code === '23514' && (await q(`SELECT count(*)::int AS n FROM ${ES}.empleados`))[0].n === nEmp, err && err.code)
    err = null
    await permitir()
    const pr0 = (await crear(SP, { nombre: 'Prov orig', rut: '1-1', contacto: 'orig' }))[0]
    await rechazar(['modificar', 'desactivar', 'crear'])
    try { await cambiar(SP, pr0.id, { contacto: 'cambiado', activo: false }) } catch (e) { err = e }
    const pfila = (await q(`SELECT contacto, activo FROM ${ES}.proveedores WHERE id = $1`, [pr0.id]))[0]
    check('(b) PROVEEDOR: si la entrada falla, el cambio NO queda', err && err.code === '23514' && pfila.contacto === 'orig' && pfila.activo === true, { code: err && err.code, pfila })
    err = null
    const nProv = (await q(`SELECT count(*)::int AS n FROM ${ES}.proveedores`))[0].n
    try { await crear(SP, { nombre: 'Prov no creado' }) } catch (e) { err = e }
    check('(b) PROVEEDOR: si la entrada "crear" falla, el proveedor NO se crea', err && err.code === '23514' && (await q(`SELECT count(*)::int AS n FROM ${ES}.proveedores`))[0].n === nProv)
    await permitir()
    const ctl = (await cambiar(SP, pr0.id, { contacto: 'control' }))[0]
    check('CONTROL: sin el CHECK el mismo cambio sí se aplica y deja su entrada (la prueba distingue el fallo del éxito)', ctl.contacto === 'control' && (await aud()).some((x) => x.accion === 'modificar' && x.entidad === 'proveedor'))

    // C4. (a) una LECTURA cuyo registro falla responde igual y deja el log
    await vaciar()
    await crear(SE, { nombre: 'L1' }); await crear(SE, { nombre: 'L2' })
    await db.query(`TRUNCATE ${ES}.auditoria_admin`)
    await rechazar(['ver_datos_personales'])
    const log4 = []
    const leidos = await AD.leerConAuditoria(
      async () => (await q(SE.listar, [true])).map(M.mapEmpleado),
      (filas) => regLectura({ detalles: AD.detallesLista(filas.length) }),
      (m, e) => log4.push([m, e]),
    )
    check('(a) LECTURA: si el registro falla (error real 23514 de Postgres), la respuesta con los datos sigue y queda UNA línea en el log; no quedó entrada', leidos.length === 2 && leidos.every((x) => mismoConjunto(Object.keys(x), COLS_EMPLEADO)) && log4.length === 1 && log4[0][1].codigo === '23514' && (await aud()).length === 0, { log4, n: (await aud()).length })
    await permitir()
    const log4b = []
    const leidos2 = await AD.leerConAuditoria(async () => (await q(SE.listar, [true])).map(M.mapEmpleado), (filas) => regLectura({ detalles: AD.detallesLista(filas.length) }), (m, e) => log4b.push([m, e]))
    const e4 = await aud()
    check('CONTROL de (a): con el registro sano la misma lectura deja UNA entrada con la cantidad de filas y sin log', leidos2.length === 2 && log4b.length === 0 && e4.length === 1 && e4[0].accion === 'ver_datos_personales' && e4[0].detalles.filas === 2 && AD.detallesSeguros(e4[0].detalles), e4)
    let errLect = null
    try { await AD.leerConAuditoria(async () => q(`SELECT 1 FROM ${ES}.no_existe`), async () => {}, () => {}) } catch (e) { errLect = e }
    check('(a) si falla la lectura misma (tabla inexistente) el error sí sube', errLect && errLect.code === '42P01', errLect && errLect.code)

    // C5. lectura de la auditoría: filtros, fechas de Santiago, límite
    await db.query(`TRUNCATE ${ES}.auditoria_admin`)
    const ins = (accion, entidad, ts) => db.query(`INSERT INTO ${ES}.auditoria_admin (usuario_id, usuario_nombre, usuario_rol, accion, entidad, created_at) VALUES ($1, 'u', 'admin', $2, $3, ($4::timestamp) AT TIME ZONE 'America/Santiago')`, [actor.id, accion, entidad, ts])
    await ins('crear', 'empleado', '2026-11-20 23:59:59')
    await ins('crear', 'proveedor', '2026-11-21 00:00:00')
    await ins('modificar', 'empleado', '2026-11-21 12:00:00')
    await ins('desactivar', 'usuario', '2026-11-21 23:59:59')
    await ins('crear', 'usuario', '2026-11-22 00:00:00')
    const leerAud = (e, a, d, h, l = 200) => q(AD.sentenciaLeerAuditoria(ES), [e, a, d, h, l])
    check('SQL de auditoría: sin filtros devuelve todo, de lo más nuevo a lo más viejo', (await leerAud(null, null, null, null)).length === 5 && (await leerAud(null, null, null, null))[0].entidad === 'usuario' && (await leerAud(null, null, null, null))[0].accion === 'crear')
    check('SQL de auditoría: desde y hasta son días de Santiago y hasta es inclusive (21-11 trae las 3 del día, no la de las 23:59:59 del 20 ni la de las 00:00 del 22)', (await leerAud(null, null, '2026-11-21', '2026-11-21')).length === 3 && (await leerAud(null, null, '2026-11-21', null)).length === 4 && (await leerAud(null, null, null, '2026-11-20')).length === 1)
    check('SQL de auditoría: filtros por entidad y acción y límite', (await leerAud('empleado', null, null, null)).length === 2 && (await leerAud(null, 'crear', null, null)).length === 3 && (await leerAud('usuario', 'crear', null, null)).length === 1 && (await leerAud(null, null, null, null, 2)).length === 2)
    check('SQL de auditoría: columnas explícitas (la tabla no expone nada fuera de la lista)', mismoConjunto(Object.keys((await leerAud(null, null, null, null, 1))[0]), ['id', 'usuario_id', 'usuario_nombre', 'usuario_rol', 'accion', 'entidad', 'entidad_id', 'entidad_nombre', 'detalles', 'created_at']))

    // C6. (c) la purga
    const ejecutar = (t, p) => db.query(t, p)
    const espia = { info: [], error: [] }
    const logP = { info: (m) => espia.info.push(m), error: (m, e) => espia.error.push([m, e]) }
    const sembrar = async () => {
      await db.query(`TRUNCATE ${ES}.sesiones, ${ES}.notificaciones`)
      const ses = (n, expira, revocada) => db.query(`INSERT INTO ${ES}.sesiones (token_hash, usuario_id, expira, revocada_at) SELECT md5(random()::text || g::text || clock_timestamp()::text), gen_random_uuid(), ${expira}, ${revocada} FROM generate_series(1, ${n}) g`)
      await ses(12, `now() - interval '120 days'`, `now() - interval '100 days'`) // viejas revocadas (se borran)
      await ses(3, `now() - interval '95 days'`, 'NULL') // vencidas hace más de 90 días, sin revocar (se borran)
      await ses(3, `now() + interval '10 hours'`, 'NULL') // VIGENTES (nunca)
      await ses(2, `now() + interval '5 hours'`, `now() - interval '10 days'`) // revocadas hace poco (se quedan)
      await ses(2, `now() - interval '89 days'`, 'NULL') // vencidas hace 89 días (se quedan)
      await ses(2, `now() - interval '89 days'`, `now() - interval '89 days'`) // revocadas y vencidas hace 89 días (se quedan)
      const not = (n, hace) => db.query(`INSERT INTO ${ES}.notificaciones (tipo, mensaje, destinatario_rol, creado_at) SELECT 'listo', 'prueba', 'cajero', now() - interval '${hace}' FROM generate_series(1, ${n})`)
      await not(11, '100 days')
      await not(3, '89 days')
      await not(4, '1 hour')
    }
    const cuenta = async () => ({ s: (await q(`SELECT count(*)::int AS n FROM ${ES}.sesiones`))[0].n, n: (await q(`SELECT count(*)::int AS n FROM ${ES}.notificaciones`))[0].n, vigentes: (await q(`SELECT count(*)::int AS n FROM ${ES}.sesiones WHERE expira > now() AND revocada_at IS NULL`))[0].n })
    await sembrar()
    const sec = []
    for (let i = 0; i < 4; i++) sec.push(await PG.purgarSinFallar(ejecutar, ES, { limite: 5 }, logP))
    const fin = await cuenta()
    check('(c) la purga se acota por el LIMIT: con límite 5 y 15 sesiones y 11 notificaciones viejas, borra 5+5, 5+5, 5+1 y 0+0 (no todo de una vez)', j(sec.map((x) => [x.sesiones, x.notificaciones])) === j([[5, 5], [5, 5], [5, 1], [0, 0]]), sec)
    check('(c) solo borra lo viejo: quedan las 3 vigentes, las 2 revocadas hace poco, las 2 vencidas y las 2 revocadas hace 89 días (9 sesiones) y las 3 notificaciones de 89 días y las 4 recientes (7)', fin.s === 9 && fin.n === 7 && fin.vigentes === 3, fin)
    check('(c) cada pasada deja su línea en el log, también la de 0 y 0', espia.info.length === 4 && espia.info[3] === '[purga] sesiones=0 notificaciones=0' && espia.info[0] === '[purga] sesiones=5 notificaciones=5', espia.info)
    await sembrar()
    await db.query(`INSERT INTO ${ES}.sesiones (token_hash, usuario_id, expira, revocada_at) SELECT md5(random()::text || g::text), gen_random_uuid(), now() - interval '200 days', now() - interval '190 days' FROM generate_series(1, 250) g`)
    const p1 = await PG.purgarSinFallar(ejecutar, ES, {}, logP)
    const restoViejas = (await q(`SELECT count(*)::int AS n FROM ${ES}.sesiones WHERE revocada_at < now() - interval '90 days' OR expira < now() - interval '90 days'`))[0].n
    check('(c) con los valores de producción (200 por pasada, 90 días): 265 sesiones viejas → borra 200 y quedan 65; la siguiente pasada las demás', p1.sesiones === 200 && restoViejas === 65 && (await PG.purgarSinFallar(ejecutar, ES, {}, logP)).sesiones === 65 && (await cuenta()).vigentes === 3, { p1, restoViejas })
    // un fallo no se propaga y es atómico (un solo statement)
    await db.query(`ALTER TABLE ${ES}.notificaciones RENAME TO notificaciones_x`)
    await db.query(`INSERT INTO ${ES}.sesiones (token_hash, usuario_id, expira, revocada_at) VALUES (md5('x1'), gen_random_uuid(), now() - interval '300 days', now() - interval '300 days')`)
    const nErr = espia.error.length
    let lanzo = false
    let rFallo
    try { rFallo = await PG.purgarSinFallar(ejecutar, ES, { limite: 5 }, logP) } catch { lanzo = true }
    const tras = (await q(`SELECT count(*)::int AS n FROM ${ES}.sesiones WHERE expira < now() - interval '90 days'`))[0].n
    check('(c) si el SQL de la purga falla (error real 42P01: falta una tabla) NO lanza, devuelve null, queda una línea de error en el log y no se borró nada a medias (las sesiones viejas siguen)', !lanzo && rFallo === null && espia.error.length === nErr + 1 && espia.error[nErr][1].codigo === '42P01' && tras >= 1, { lanzo, rFallo, err: espia.error.slice(nErr) })
    const rNoEsq = await PG.purgarSinFallar(ejecutar, 'prueba_no_existe_' + Date.now().toString(36), {}, logP)
    check('(c) con un esquema que no existe tampoco lanza (null)', rNoEsq === null)
    await db.query(`ALTER TABLE ${ES}.notificaciones_x RENAME TO notificaciones`)
  } finally {
    try { await db.query(`DROP SCHEMA IF EXISTS ${ES} CASCADE`) } catch (e) { console.log('  AVISO: no se pudo eliminar el esquema temporal ' + ES + ': ' + e.message) }
  }
  const restos = await db`SELECT count(*)::int AS n FROM information_schema.schemata WHERE schema_name LIKE 'prueba\_datos\_personales\_%'`
  check('el esquema temporal se eliminó (no queda ningún prueba_datos_personales_*)', restos[0].n === 0, restos[0])

  }

  // ───────────────────────── D. login y purga por HTTP (servidor propio con la salida capturada) ─────────────────────────
  console.log('\n[datos-personales] D: un login correcto dispara la purga (línea en el log del servidor); un PIN errado no')
  const BASE_D = `http://localhost:${P_DATOS}`
  let salida = ''
  const proc = spawn(process.execPath, [path.join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(P_DATOS)], {
    cwd: RAIZ, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  proc.stdout.on('data', (d) => { salida += d.toString() })
  proc.stderr.on('data', (d) => { salida += d.toString() })
  try {
    const fin = Date.now() + 120000
    let listo = false
    while (Date.now() < fin && !listo) {
      listo = await fetch(BASE_D + '/api/hora').then((r) => r.status === 200).catch(() => false)
      if (!listo) await sleep(500)
    }
    check(`el servidor propio de la prueba (puerto ${P_DATOS}) responde`, listo)
    if (listo) {
      const lineas = () => (salida.match(/\[purga\] sesiones=\d+ notificaciones=\d+/g) || []).length
      const esperarLineas = async (n, ms = 20000) => {
        const t = Date.now() + ms
        while (Date.now() < t && lineas() < n) await sleep(300)
        return lineas()
      }
      const u = await L.crearUsuarioPrueba(ctx, 'mesero', {}, false)
      const antes = lineas()
      const ses = await u.reingresar(BASE_D)
      check('login correcto en el servidor propio → sesión válida (200)', (await api(ses, 'GET', '/api/auth/sesion')).status === 200, ses && Object.keys(ses))
      const n1 = await esperarLineas(antes + 1)
      check('la purga se ejecutó tras el login: una línea "[purga] sesiones=N notificaciones=M" en el log del servidor', n1 === antes + 1, salida.slice(-400))
      const r401 = await api({ base: BASE_D, cookie: '' }, 'POST', '/api/auth/login', { email: u.usuario.email, pin: 'no-es-el-pin' })
      await sleep(2500)
      check('un PIN errado (401) NO dispara la purga', r401.status === 401 && lineas() === antes + 1, { status: r401.status, lineas: lineas() })
      await u.reingresar(BASE_D)
      check('cada login correcto deja su propia línea (2 en total) y no hay error de purga en el log', (await esperarLineas(antes + 2)) === antes + 2 && !/\[purga\] falló/.test(salida), salida.slice(-400))
    }
  } finally {
    try { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill('SIGKILL') } catch { /* nada */ }
  }
}
