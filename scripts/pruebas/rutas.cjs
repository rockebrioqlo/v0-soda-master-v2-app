/**
 * Módulo `rutas` (sesión 14.5b-1: F13, F14, F31 y los esquemas zod de las rutas sin campos heredados).
 *
 *  1. ESTÁTICA (sin servidor): todo handler de `app/api/**` que no es público llama `requireAcceso` o
 *     `requireSesion` (o delega en `manejarPatchOrden`, que llama `requireSesion`). Se puede correr sola:
 *     `node scripts/pruebas/rutas.cjs`. Las rutas públicas de la lista tienen que coincidir con las
 *     marcadas `'publico'` en `lib/permisos-api.ts`.
 *  2. MATRIZ de acceso: cada handler contra cada rol (admin, mesero, cajero, cocina, bar) y sin sesión;
 *     lo esperado sale de `accesoParaRuta` (la MISMA tabla del proxy y de `requireAcceso`): 401 sin
 *     sesión, 403 si el rol no está, y nunca 401/403 si está. Los cuerpos llevan un campo desconocido
 *     para que las rutas con `.strict()` respondan 400 sin hacer nada.
 *  3. Parámetros de consulta y de ruta inválidos (uuid, fecha, límite) → 400 `DATOS_INVALIDOS` (F14).
 *  4. Esquemas `.strict()`, recetas (F31), mesas de salón (solo estado) y notificaciones ajenas.
 * Todo lo que crea queda marcado con la marca de la corrida.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib.cjs')
const { check, api, UUID_FALSO } = L

exports.nombre = 'rutas'

const RAIZ = path.resolve(__dirname, '..', '..')
const API = path.join(RAIZ, 'app', 'api')

// Rutas públicas por diseño (sin sesión). Tiene que coincidir con `acceso: 'publico'` de lib/permisos-api.ts.
const PUBLICAS = ['auth/accesos-rapidos', 'auth/login', 'auth/logout', 'auth/sesion', 'hora', 'menu-publico', 'seed']
// El seed de demo y el de recetas siembran datos si PERMITIR_SEED está activa: el admin no los llama.
const NO_LLAMAR_COMO_ADMIN = ['seed-demo', 'seed-recetas']
const PROTEGE = /requireSesion|requireAcceso|manejarPatchOrden/

function archivosRuta(dir = API) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? archivosRuta(p) : e.name === 'route.ts' ? [p] : []
  })
}

function escanear() {
  const out = []
  for (const f of archivosRuta().sort()) {
    const rel = path.relative(API, path.dirname(f)).split(path.sep).join('/')
    const s = fs.readFileSync(f, 'utf8')
    const re = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g
    const pos = []
    let m
    while ((m = re.exec(s))) pos.push([m[1], m.index])
    pos.forEach(([metodo, ini], k) => {
      const cuerpo = s.slice(ini, k + 1 < pos.length ? pos[k + 1][1] : s.length)
      out.push({ rel, metodo, protegido: PROTEGE.test(cuerpo) })
    })
  }
  return out
}

function publicasDeLaTabla() {
  const src = fs.readFileSync(path.join(RAIZ, 'lib', 'permisos-api.ts'), 'utf8')
  return src
    .split('\n')
    .filter((l) => l.includes("acceso: 'publico'") && l.includes('ruta: r('))
    .map((l) => /r\('([^']+)'\)/.exec(l)[1])
}

/** Parte estática: devuelve la lista de problemas (vacía = todo bien). */
function estatica() {
  const problemas = []
  const tabla = publicasDeLaTabla().sort().join(',')
  if (tabla !== [...PUBLICAS].sort().join(',')) problemas.push(`las rutas públicas de la tabla (${tabla}) no coinciden con la lista de la prueba`)
  const handlers = escanear()
  for (const h of handlers) {
    if (PUBLICAS.includes(h.rel)) continue
    if (!h.protegido) problemas.push(`${h.metodo} /api/${h.rel} no llama requireAcceso ni requireSesion`)
  }
  return { problemas, handlers }
}

exports.estatica = estatica

function rutaConcreta(rel) {
  return '/api/' + rel.replace(/\[[^\]]+\]/g, UUID_FALSO)
}

let _acceso = null
async function cargarTabla() {
  if (_acceso) return _acceso
  const w = process.emitWarning
  process.emitWarning = () => {}
  try {
    _acceso = await import('file:///' + path.join(RAIZ, 'lib', 'permisos-api.ts').split(path.sep).join('/'))
  } finally {
    process.emitWarning = w
  }
  return _acceso
}

const sinCodigo = (r) => r.json && r.json.codigo
const es400 = (r) => r.status === 400 && sinCodigo(r) === 'DATOS_INVALIDOS'

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina, marca, db } = ctx
  ctx.limpiezaProd = ctx.limpiezaProd || []
  ctx.limpiezaIng = ctx.limpiezaIng || []

  // ─────────────────────────── 1. estática ───────────────────────────
  console.log('\n[rutas] estática: todo handler no público llama requireAcceso o requireSesion')
  const { problemas, handlers } = estatica()
  check(`los ${handlers.filter((h) => !PUBLICAS.includes(h.rel)).length} handlers no públicos validan sesión y rol dentro de la ruta`, problemas.length === 0, problemas.slice(0, 8))

  // ─────────────────────────── 2. matriz de acceso ───────────────────────────
  console.log('\n[rutas] matriz: cada handler contra cada rol y sin sesión (acceso según la tabla del proxy)')
  const tabla = await cargarTabla()
  const bar = (await L.crearUsuarioPrueba(ctx, 'bar')).sesion
  const roles = [['admin', admin], ['mesero', mesero], ['cajero', cajero], ['cocina', cocina], ['bar', bar]]
  const objetivos = handlers.filter((h) => !PUBLICAS.includes(h.rel)).map((h) => ({ ...h, ruta: rutaConcreta(h.rel) }))
  const cuerpo = (m) => (m === 'GET' ? undefined : { zz_campo_desconocido: 1 })
  const falsa = { cookie: 'sm_sesion=cookie-falsa.firma-falsa' }

  const sin = []
  for (const o of objetivos) {
    const a = await api(null, o.metodo, o.ruta, cuerpo(o.metodo))
    const b = await api(falsa, o.metodo, o.ruta, cuerpo(o.metodo))
    if (a.status !== 401 || b.status !== 401) sin.push(`${o.metodo} ${o.ruta}: ${a.status}/${b.status}`)
  }
  check(`sin sesión y con cookie falsa: ${objetivos.length} handlers → 401`, sin.length === 0, sin.slice(0, 6))

  const malos = []
  await Promise.all(
    roles.map(async ([rol, ses]) => {
      for (const o of objetivos) {
        if (rol === 'admin' && NO_LLAMAR_COMO_ADMIN.includes(o.rel)) continue
        const acceso = tabla.accesoParaRuta(o.ruta, o.metodo)
        const permitido = acceso === 'sesion' || (Array.isArray(acceso) && acceso.includes(rol))
        const r = await api(ses, o.metodo, o.ruta, cuerpo(o.metodo))
        const bien = permitido ? r.status !== 401 && r.status !== 403 && r.status !== 429 : r.status === 403
        if (!bien) malos.push(`${rol} ${o.metodo} ${o.ruta}: ${r.status} (esperado ${permitido ? 'ni 401 ni 403' : '403'})`)
      }
    }),
  )
  check(`matriz de ${roles.length} roles × ${objetivos.length} handlers: 403 si el rol no está en la tabla y nunca 401/403 si está`, malos.length === 0, malos.slice(0, 8))

  // ─────────────────────────── 3. parámetros inválidos (F14) ───────────────────────────
  console.log('\n[rutas] parámetros de consulta y de ruta inválidos → 400 DATOS_INVALIDOS (antes 500)')
  const consultas = [
    '/api/items-orden?orden_id=hola', '/api/cuentas-persona?orden_id=hola', '/api/descuentos?orden_id=hola',
    '/api/ordenes?mesa_id=hola', '/api/compras?proveedor_id=hola', '/api/recetas?producto_id=hola',
    '/api/permisos-especiales?usuario_id=hola', '/api/mermas?responsable_id=hola',
    '/api/pagos?fecha=2026-13-45', '/api/perdidas?fecha=ayer', '/api/kds/historial?fecha=2026-02-31', '/api/ordenes?fecha=hola',
    '/api/gastos?desde=hola', '/api/gastos?hasta=2026-1-1', '/api/mermas?hasta=2026-99-99', '/api/descuentos?desde=x',
    '/api/gastos?limite=abc', '/api/gastos?limite=0', '/api/gastos?limite=100000', '/api/kds/historial?limite=-1',
    '/api/caja/historial?limite=abc', '/api/compras?limite=abc', '/api/ordenes?limite=abc', '/api/notificaciones?limite=abc',
    '/api/activos?incluir_baja=quizas', '/api/recetas?producto_id=' + UUID_FALSO + '&zz=1',
  ]
  const malas = []
  for (const q of consultas) {
    const r = await api(admin, 'GET', q)
    if (!es400(r)) malas.push(`${q}: ${r.status}`)
  }
  check(`${consultas.length} consultas inválidas (uuid, fecha, límite, booleano, parámetro desconocido) → 400 DATOS_INVALIDOS`, malas.length === 0, malas)

  const hoy = new Date().toISOString().slice(0, 10)
  const validas = ['/api/pagos?fecha=hoy', `/api/pagos?fecha=${hoy}`, '/api/kds/historial?fecha=hoy&limite=5', '/api/ordenes?limite=5&orden=desc', `/api/gastos?desde=${hoy}&hasta=${hoy}`, `/api/gastos?resumen=true&desde=${hoy}&hasta=${hoy}`, '/api/caja/historial?limite=5', '/api/compras?limite=5', '/api/notificaciones?solo_pendientes=true', `/api/mermas?desde=${hoy}&hasta=${hoy}`, '/api/activos?incluir_baja=true', '/api/empleados?incluir_inactivos=true', `/api/recetas?producto_id=${UUID_FALSO}`]
  const nok = []
  for (const q of validas) {
    const r = await api(admin, 'GET', q)
    if (r.status !== 200) nok.push(`${q}: ${r.status}`)
  }
  check(`${validas.length} consultas válidas (hoy, AAAA-MM-DD, límites, booleanos) siguen en 200`, nok.length === 0, nok)

  const rutasId = [
    ['PATCH', '/api/activos/'], ['DELETE', '/api/activos/'], ['GET', '/api/compras/'], ['GET', '/api/caja/'], ['PATCH', '/api/empleados/'],
    ['DELETE', '/api/gastos/'], ['PATCH', '/api/inventario/'], ['PATCH', '/api/mermas/'], ['PATCH', '/api/mesas/'], ['DELETE', '/api/mesas/'],
    ['PATCH', '/api/productos/'], ['DELETE', '/api/productos/'], ['POST', '/api/productos/{id}/clonar'], ['PATCH', '/api/proveedores/'],
    ['PATCH', '/api/usuarios/'], ['DELETE', '/api/usuarios/'], ['PATCH', '/api/notificaciones/'], ['PATCH', '/api/ingredientes/'],
    ['DELETE', '/api/ingredientes/'], ['POST', '/api/ingredientes/{id}/ajuste'],
  ]
  const malasId = []
  for (const [m, base] of rutasId) {
    const url = base.includes('{id}') ? base.replace('{id}', 'hola') : base + 'hola'
    const r = await api(admin, m, url, m === 'GET' ? undefined : {})
    if (r.status !== 400) malasId.push(`${m} ${url}: ${r.status}`)
  }
  check(`id de ruta que no es uuid ("hola") en ${rutasId.length} rutas → 400 (antes 500)`, malasId.length === 0, malasId)
  check('uuid válido que no existe → 404 (caja, compra, notificación)',
    (await api(admin, 'GET', '/api/caja/' + UUID_FALSO)).status === 404 &&
    (await api(admin, 'GET', '/api/compras/' + UUID_FALSO)).status === 404 &&
    (await api(admin, 'PATCH', '/api/notificaciones/' + UUID_FALSO, { vista: true })).status === 404)

  // ─────────────────────────── 4. esquemas .strict() con lo que manda la interfaz ───────────────────────────
  console.log('\n[rutas] esquemas .strict(): lo que manda cada pantalla pasa; un campo desconocido o heredado → 400')
  const zz = { zz_campo_desconocido: 1 }
  const rechaza = async (nombre, metodo, ruta, bodyValido, ses = admin) => {
    const r = await api(ses, metodo, ruta, { ...bodyValido, ...zz })
    check(`${nombre}: campo desconocido → 400 y nombra el campo`, es400(r) && String(r.json.error).includes('zz_campo_desconocido'), [r.status, r.json])
  }

  // Finanzas: el payload exacto de las pestañas (con null y con los campos de edición también al crear)
  const prov = await api(admin, 'POST', '/api/proveedores', { nombre: `${marca} proveedor`, rut: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true })
  check('proveedores: la pestaña crea con su payload (incluye activo)', prov.status === 201, [prov.status, prov.json])
  await rechaza('POST /api/proveedores', 'POST', '/api/proveedores', { nombre: 'x' })
  if (prov.status === 201) {
    check('proveedores: editar con su payload', (await api(admin, 'PATCH', '/api/proveedores/' + prov.json.id, { nombre: `${marca} proveedor`, rut: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true })).status === 200)
    await rechaza('PATCH /api/proveedores/[id]', 'PATCH', '/api/proveedores/' + prov.json.id, { nombre: 'x' })
    await api(admin, 'PATCH', '/api/proveedores/' + prov.json.id, { activo: false })
  }
  const act = await api(admin, 'POST', '/api/activos', { nombre: `${marca} activo`, categoria: 'maquinaria', descripcion: null, fecha_compra: hoy, costo_compra: 1000, vida_util_meses: 12, valor_residual: 0, metodo_depreciacion: 'lineal', proveedor_id: null, ubicacion: null, numero_serie: null, estado: 'activo', notas: null })
  check('activos: la pestaña crea con su payload (incluye estado)', act.status === 201, [act.status, act.json])
  await rechaza('POST /api/activos', 'POST', '/api/activos', { nombre: 'x', costo_compra: 1, vida_util_meses: 1 })
  check('activos: costo negativo, vida útil 0 y fecha inexistente → 400', (await Promise.all([{ costo_compra: -1, vida_util_meses: 1 }, { costo_compra: 1, vida_util_meses: 0 }, { costo_compra: 1, vida_util_meses: 1, fecha_compra: '2026-02-31' }].map((b) => api(admin, 'POST', '/api/activos', { nombre: 'x', ...b })))).every(es400))
  if (act.status === 201) {
    check('activos: editar con su payload', (await api(admin, 'PATCH', '/api/activos/' + act.json.id, { nombre: `${marca} activo`, estado: 'reparacion', notas: null })).status === 200)
    await rechaza('PATCH /api/activos/[id]', 'PATCH', '/api/activos/' + act.json.id, { nombre: 'x' })
    check('activos: estado fuera de la lista → 400', es400(await api(admin, 'PATCH', '/api/activos/' + act.json.id, { estado: 'roto' })))
    await api(admin, 'DELETE', '/api/activos/' + act.json.id)
  }
  const emp = await api(admin, 'POST', '/api/empleados', { nombre: `${marca} empleado`, cargo: null, documento: null, telefono: null, email: null, sueldo_base: 1000, periodicidad: 'mensual', fecha_ingreso: null, fecha_egreso: null, activo: true, notas: null })
  check('empleados: la pestaña crea con su payload (incluye activo y fecha_egreso)', emp.status === 201, [emp.status, emp.json])
  await rechaza('POST /api/empleados', 'POST', '/api/empleados', { nombre: 'x', sueldo_base: 1 })
  check('empleados: periodicidad inválida y sueldo negativo → 400', (await Promise.all([{ periodicidad: 'anual' }, { sueldo_base: -5 }].map((b) => api(admin, 'POST', '/api/empleados', { nombre: 'x', sueldo_base: 1, ...b })))).every(es400))
  if (emp.status === 201) {
    check('empleados: editar con su payload', (await api(admin, 'PATCH', '/api/empleados/' + emp.json.id, { nombre: `${marca} empleado`, activo: false, fecha_egreso: hoy })).status === 200)
    await rechaza('PATCH /api/empleados/[id]', 'PATCH', '/api/empleados/' + emp.json.id, { nombre: 'x' })
  }
  const gas = await api(admin, 'POST', '/api/gastos', { fecha: hoy, categoria: 'general', descripcion: `${marca} gasto`, monto: 1, tipo: 'operativo', recurrente: false, periodicidad: null, proveedor_id: null, empleado_id: null, activo_id: null, notas: null })
  check('gastos: la pestaña crea con su payload', gas.status === 201, [gas.status, gas.json])
  await rechaza('POST /api/gastos', 'POST', '/api/gastos', { monto: 1 })
  check('gastos: monto 0, tipo inválido y fecha inexistente → 400', (await Promise.all([{ monto: 0 }, { tipo: 'regalo' }, { fecha: '2026-02-30' }, { usuario_id: UUID_FALSO }].map((b) => api(admin, 'POST', '/api/gastos', { monto: 1, ...b })))).every(es400))
  if (gas.status === 201) await api(admin, 'DELETE', '/api/gastos/' + gas.json.id)
  check('finanzas: mesero, cajero, cocina y bar no tocan proveedores, activos, empleados ni gastos (403)',
    (await Promise.all([mesero, cajero, cocina, bar].flatMap((s) => [api(s, 'POST', '/api/proveedores', { nombre: 'x' }), api(s, 'POST', '/api/activos', { nombre: 'x' }), api(s, 'POST', '/api/empleados', { nombre: 'x' }), api(s, 'POST', '/api/gastos', { monto: 1 })]))).every((r) => r.status === 403))

  // Productos
  const lista = await api(admin, 'GET', '/api/productos')
  const categoria = (lista.json.find((p) => p.categoria) || {}).categoria
  const mk = async (nombre) => {
    const r = await api(admin, 'POST', '/api/productos', { nombre: `${marca} ${nombre}`, categoria, precio: 1000, descripcion: marca })
    if (r.status === 200) ctx.limpiezaProd.push(r.json.id)
    return r
  }
  const p1 = await mk('rutas p1')
  check('productos: crear con nombre, categoría, precio y descripción (lo que usan las pruebas)', p1.status === 200, [p1.status, p1.json])
  await rechaza('POST /api/productos', 'POST', '/api/productos', { nombre: 'x', categoria: 'x', precio: 1 })
  check('productos: precio negativo y alias camelCase (esIngredienteEspecial) → 400', (await Promise.all([api(admin, 'POST', '/api/productos', { nombre: 'x', categoria: 'x', precio: -1 }), api(admin, 'PATCH', '/api/productos/' + p1.json.id, { esIngredienteEspecial: true })])).every(es400))
  check('productos: editar como lo hace Inventario (es_ingrediente_especial y costo_adicional)', (await api(admin, 'PATCH', '/api/productos/' + p1.json.id, { es_ingrediente_especial: false, costo_adicional: 0 })).status === 200)
  await rechaza('PATCH /api/productos/[id]', 'PATCH', '/api/productos/' + p1.json.id, { nombre: 'x' })
  check('productos: PATCH vacío → 400', es400(await api(admin, 'PATCH', '/api/productos/' + p1.json.id, {})))
  const clon = await api(admin, 'POST', `/api/productos/${p1.json.id}/clonar`, { nombre: `${marca} rutas clon`, precio: 1200 })
  if (clon.status === 201 && clon.json?.producto?.id) ctx.limpiezaProd.push(clon.json.producto.id)
  check('productos: clonar con nombre y precio como el editor de recetas', clon.status === 201, [clon.status, clon.json])
  await rechaza('POST /api/productos/[id]/clonar', 'POST', `/api/productos/${p1.json.id}/clonar`, { nombre: 'x' })
  check('productos: clonar un producto que no existe → 404', (await api(admin, 'POST', `/api/productos/${UUID_FALSO}/clonar`, { nombre: 'x' })).status === 404)

  // Mesas: salón solo cambia el estado
  console.log('\n[rutas] mesas: salón (mesero y cajero) solo cambia el estado; capacidad, área y número son del admin')
  const mesaId = ctx.mesa[2]
  const mesas = (await api(admin, 'GET', '/api/mesas')).json
  const m2 = mesas.find((m) => m.id === mesaId)
  const r1 = await api(mesero, 'PATCH', '/api/mesas', { id: mesaId, capacidad: 3 })
  const r2 = await api(cajero, 'PATCH', '/api/mesas', { id: mesaId, area: 'prueba' })
  const r3 = await api(mesero, 'PATCH', '/api/mesas', { id: mesaId, numero: 99 })
  check('mesero y cajero: capacidad, área o número → 403 ROL_SIN_PERMISO', [r1, r2, r3].every((r) => r.status === 403 && r.json.codigo === 'ROL_SIN_PERMISO'), [r1.status, r2.status, r3.status])
  const e1 = await api(mesero, 'PATCH', '/api/mesas', { id: mesaId, estado: 'ocupada' })
  const e2 = await api(cajero, 'PATCH', '/api/mesas', { id: mesaId, estado: 'libre' })
  check('mesero y cajero: cambiar el estado sigue en 200', e1.status === 200 && e1.json.estado === 'ocupada' && e2.status === 200 && e2.json.estado === 'libre', [e1.status, e2.status])
  const nuevaCap = Number(m2.capacidad) === 6 ? 4 : 6
  const a1 = await api(admin, 'PATCH', '/api/mesas', { id: mesaId, capacidad: nuevaCap })
  const a2 = await api(admin, 'PATCH', '/api/mesas', { id: mesaId, capacidad: Number(m2.capacidad) })
  check('admin: cambia la capacidad (y se restaura)', a1.status === 200 && Number(a1.json.capacidad) === nuevaCap && a2.status === 200 && Number(a2.json.capacidad) === Number(m2.capacidad), [a1.status, a2.status])
  check('mesas: capacidad 0, estado inválido, id inválido y campo desconocido → 400', (await Promise.all([{ id: mesaId, capacidad: 0 }, { id: mesaId, estado: 'rota' }, { id: 'hola', estado: 'libre' }, { id: mesaId, estado: 'libre', ...zz }].map((b) => api(admin, 'PATCH', '/api/mesas', b)))).every(es400))
  check('mesas: POST con campo desconocido y nombre vacío → 400 (no crea mesa)', (await Promise.all([api(admin, 'POST', '/api/mesas', zz), api(admin, 'POST', '/api/mesas', { nombre: '' })])).every(es400))

  // Notificaciones
  console.log('\n[rutas] notificaciones: solo las marca vistas su destinatario o un admin; el POST valida enums y largos')
  const mensaje = `${marca} rutas`
  const crear = await api(admin, 'POST', '/api/notificaciones', { tipo: 'listo', orden_id: null, mesa_nombre: 'Mesa de prueba', mensaje, destinatario_usuario_id: ctx.usuarios.cocina.id })
  check('crear una notificación dirigida a cocina (payload del KDS)', crear.status === 201 && crear.json?.id, [crear.status, crear.json])
  if (crear.status === 201) {
    const nid = crear.json.id
    const ajena = await api(mesero, 'PATCH', '/api/notificaciones/' + nid, { vista: true })
    check('el mesero no puede marcar vista la notificación de cocina → 403 NOTIFICACION_AJENA', ajena.status === 403 && ajena.json.codigo === 'NOTIFICACION_AJENA', [ajena.status, ajena.json])
    const propia = await api(cocina, 'PATCH', '/api/notificaciones/' + nid, { vista: true })
    check('su destinatario (cocina) la marca vista → 200', propia.status === 200 && propia.json.actualizado === true, [propia.status, propia.json])
  }
  const porRol = await api(admin, 'POST', '/api/notificaciones', { tipo: 'problema', mensaje: mensaje + ' rol', destinatario_rol: 'bar' })
  check('notificación por rol (bar)', porRol.status === 201, [porRol.status, porRol.json])
  if (porRol.status === 201) {
    const noBar = await api(cocina, 'PATCH', '/api/notificaciones/' + porRol.json.id, { vista: true })
    const barOk = await api(bar, 'PATCH', '/api/notificaciones/' + porRol.json.id, { vista: true })
    check('la de rol bar: cocina → 403 y el bar → 200', noBar.status === 403 && barOk.status === 200, [noBar.status, barOk.status])
  }
  const otra = await api(mesero, 'POST', '/api/notificaciones', { tipo: 'listo', mensaje: mensaje + ' 3', destinatario_usuario_id: ctx.usuarios.mesero.id })
  if (otra.status === 201) {
    const adm = await api(admin, 'PATCH', '/api/notificaciones/' + otra.json.id, { vista: true })
    check('un admin marca vista la de otro usuario → 200', adm.status === 200, adm.status)
  }
  check('notificaciones: tipo inválido, sin destinatario, mensaje largo, rol inventado y campo desconocido → 400', (await Promise.all([
    { tipo: 'urgente', mensaje: 'x', destinatario_rol: 'bar' }, { tipo: 'listo', mensaje: 'x' }, { tipo: 'listo', mensaje: 'x'.repeat(301), destinatario_rol: 'bar' },
    { tipo: 'listo', mensaje: 'x', destinatario_rol: 'dios' }, { tipo: 'listo', mensaje: 'x', destinatario_rol: 'bar', ...zz },
  ].map((b) => api(admin, 'POST', '/api/notificaciones', b)))).every(es400))
  check('notificaciones: PATCH con {vista:false} o un campo más → 400', (await Promise.all([{ vista: false }, { vista: true, ...zz }].map((b) => api(admin, 'PATCH', '/api/notificaciones/' + UUID_FALSO, b)))).every(es400))

  // Permisos
  console.log('\n[rutas] permisos: sin usuario_id ni otorgado_por/revocado_por (salen de la sesión)')
  const pd = await api(admin, 'GET', '/api/permisos-descuento')
  const permisos = pd.json.map((p) => ({ rol: p.rol, puede_aplicar: p.puede_aplicar, limite_maximo: p.limite_maximo, requiere_motivo: p.requiere_motivo }))
  const guardar = await api(admin, 'PATCH', '/api/permisos-descuento', { permisos })
  check('permisos de descuento: guardar lo mismo que muestra la pantalla → 200 (no cambia nada)', guardar.status === 200, [guardar.status, guardar.json])
  check('permisos de descuento: usuario_id heredado, límite 101 y rol inventado → 400', (await Promise.all([{ permisos, usuario_id: UUID_FALSO }, { permisos: [{ ...permisos[0], limite_maximo: 101 }] }, { permisos: [{ ...permisos[0], rol: 'dios' }] }, { permisos: [] }].map((b) => api(admin, 'PATCH', '/api/permisos-descuento', b)))).every(es400))
  const tmp = await L.crearUsuarioPrueba(ctx, 'cajero', {}, false)
  const futuro = new Date(Date.now() + 3600e3).toISOString()
  const og = await api(admin, 'POST', '/api/permisos-especiales', { usuario_id: tmp.usuario.id, tipo: 'apertura_mesa', valido_hasta: futuro, motivo: marca })
  check('permiso especial: otorgar con el payload de la pantalla (sin otorgado_por) → 201', og.status === 201, [og.status, og.json])
  check('permiso especial: otorgado_por heredado, tipo inventado y fecha mala → 400', (await Promise.all([{ usuario_id: tmp.usuario.id, tipo: 'apertura_mesa', valido_hasta: futuro, otorgado_por: UUID_FALSO }, { usuario_id: tmp.usuario.id, tipo: 'todo', valido_hasta: futuro }, { usuario_id: tmp.usuario.id, tipo: 'apertura_mesa', valido_hasta: 'mañana' }].map((b) => api(admin, 'POST', '/api/permisos-especiales', b)))).every(es400))
  if (og.status === 201) {
    check('permiso especial: revocado_por heredado → 400', es400(await api(admin, 'PATCH', '/api/permisos-especiales', { id: og.json.id, revocado_por: UUID_FALSO })))
    check('permiso especial: revocar con su payload → 200', (await api(admin, 'PATCH', '/api/permisos-especiales', { id: og.json.id })).status === 200)
  }
  check('permisos: mesero y cajero no otorgan ni cambian permisos (403)', (await Promise.all([mesero, cajero].flatMap((s) => [api(s, 'POST', '/api/permisos-especiales', {}), api(s, 'PATCH', '/api/permisos-descuento', {})]))).every((r) => r.status === 403))

  // ─────────────────────────── 5. recetas (F31) ───────────────────────────
  console.log('\n[rutas] recetas (F31): cantidad mayor que 0, insumos que existen y están activos, guardado atómico')
  const f = ctx.f
  const pr = await mk('rutas receta')
  const idp = pr.json.id
  const lineas = (r) => (r.json?.ingredientes || []).map((i) => ({ id: i.ingrediente_id, cantidad: Number(i.cantidad) })).sort((a, b) => a.id.localeCompare(b.id))
  const ok = await api(admin, 'POST', '/api/recetas', { producto_id: idp, modo_stock: 'receta', ingredientes: [{ ingrediente_id: f.ingA, cantidad: 2, opcional: false, extra: false, costo_adicional: 0, nombre_display: null }, { ingrediente_id: f.ingB, cantidad: 1.5, opcional: true, extra: false, costo_adicional: 0, nombre_display: 'B opcional' }] })
  check('guardar una receta como la hace el editor → 200 con 2 líneas', ok.status === 200 && lineas(ok).length === 2, [ok.status, ok.json])
  const antes = lineas(await api(admin, 'GET', '/api/recetas?producto_id=' + idp))
  const base = { producto_id: idp, modo_stock: 'receta' }
  const casos = {
    'cantidad 0': { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: 0 }] },
    'cantidad negativa': { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: -1 }] },
    'cantidad como texto': { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: '2' }] },
    'insumo que no es uuid': { ...base, ingredientes: [{ ingrediente_id: 'hola', cantidad: 1 }] },
    'campo desconocido en una línea': { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: 1, zz: 1 }] },
    'campo desconocido en el cuerpo': { ...base, ingredientes: [], ...zz },
    'modo de stock inventado': { ...base, modo_stock: 'magia', ingredientes: [] },
  }
  const resultados = {}
  for (const [k, b] of Object.entries(casos)) resultados[k] = await api(admin, 'POST', '/api/recetas', b)
  for (const [k, r] of Object.entries(resultados)) check(`receta con ${k} → 400 DATOS_INVALIDOS`, es400(r), [r.status, r.json])
  const noExiste = await api(admin, 'POST', '/api/recetas', { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: 1 }, { ingrediente_id: UUID_FALSO, cantidad: 1 }] })
  check('insumo que no existe → 404 INSUMO_NO_ENCONTRADO', noExiste.status === 404 && noExiste.json.codigo === 'INSUMO_NO_ENCONTRADO', [noExiste.status, noExiste.json])
  const ingInactivo = await api(admin, 'POST', '/api/ingredientes', { nombre: `${marca} rutas inactivo`, unidad_medida: 'unidad', costo_unitario: 1 })
  if (ingInactivo.status === 201) {
    ctx.limpiezaIng.push(ingInactivo.json.id)
    await api(admin, 'PATCH', '/api/ingredientes/' + ingInactivo.json.id, { activo: false })
    const inact = await api(admin, 'POST', '/api/recetas', { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: 1 }, { ingrediente_id: ingInactivo.json.id, cantidad: 1 }] })
    check('insumo dado de baja → 404 INSUMO_NO_ENCONTRADO y el mensaje dice cuál', inact.status === 404 && inact.json.codigo === 'INSUMO_NO_ENCONTRADO' && String(inact.json.error).includes('rutas inactivo'), [inact.status, inact.json])
  }
  const dup = await api(admin, 'POST', '/api/recetas', { ...base, ingredientes: [{ ingrediente_id: f.ingA, cantidad: 1 }, { ingrediente_id: f.ingA, cantidad: 2, extra: true }] })
  check('el mismo insumo dos veces → 400 INSUMO_DUPLICADO (antes 500 con la receta ya borrada)', dup.status === 400 && dup.json.codigo === 'INSUMO_DUPLICADO', [dup.status, dup.json])
  const sinProd = await api(admin, 'POST', '/api/recetas', { producto_id: UUID_FALSO, ingredientes: [] })
  check('producto que no existe → 404 PRODUCTO_NO_ENCONTRADO', sinProd.status === 404 && sinProd.json.codigo === 'PRODUCTO_NO_ENCONTRADO', [sinProd.status, sinProd.json])
  const despues = lineas(await api(admin, 'GET', '/api/recetas?producto_id=' + idp))
  check('después de 11 intentos rechazados la receta quedó EXACTAMENTE como estaba (nada se borró a medias)', JSON.stringify(antes) === JSON.stringify(despues) && despues.length === 2, [antes, despues])
  const cambia = await api(admin, 'POST', '/api/recetas', { ...base, ingredientes: [{ ingrediente_id: f.ingB, cantidad: 3 }] })
  check('reemplazar la receta por una línea (3 de B) → 200 y solo queda esa', cambia.status === 200 && JSON.stringify(lineas(cambia)) === JSON.stringify([{ id: f.ingB, cantidad: 3 }]), [cambia.status, lineas(cambia)])
  const vacia = await api(admin, 'POST', '/api/recetas', { ...base, ingredientes: [] })
  check('guardar la receta sin líneas → 200 y queda vacía', vacia.status === 200 && lineas(vacia).length === 0, [vacia.status, vacia.json])
  check('recetas: mesero, cajero, cocina y bar no guardan recetas (403) y sin sesión 401', (await Promise.all([mesero, cajero, cocina, bar].map((s) => api(s, 'POST', '/api/recetas', { ...base, ingredientes: [] })))).every((r) => r.status === 403) && (await api(null, 'POST', '/api/recetas', {})).status === 401)

  // GET de insumos, compras y márgenes: admin sí, el resto 403
  console.log('\n[rutas] GET de ingredientes, compras, compras/[id] y márgenes (F31): solo admin')
  for (const ruta of ['/api/ingredientes', '/api/compras', '/api/compras/' + UUID_FALSO, '/api/margenes']) {
    const rs = await Promise.all([mesero, cajero, cocina, bar].map((s) => api(s, 'GET', ruta)))
    const sa = await api(null, 'GET', ruta)
    const ad = await api(admin, 'GET', ruta)
    check(`GET ${ruta.replace(UUID_FALSO, '[id]')}: sin sesión 401, mesero/cajero/cocina/bar 403, admin ${ruta.includes(UUID_FALSO) ? '404' : '200'}`, sa.status === 401 && rs.every((r) => r.status === 403) && ad.status === (ruta.includes(UUID_FALSO) ? 404 : 200), [sa.status, rs.map((r) => r.status), ad.status])
  }
}

if (require.main === module) {
  const { problemas, handlers } = estatica()
  console.log(`${handlers.length} handlers revisados, ${problemas.length} sin protección`)
  problemas.forEach((p) => console.log(' -', p))
  process.exit(problemas.length ? 1 : 0)
}
