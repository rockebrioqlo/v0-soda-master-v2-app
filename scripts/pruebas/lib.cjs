/**
 * Biblioteca común de las pruebas de integración de Sodamaster (scripts/pruebas).
 *
 * Qué hacen: hablan con un servidor YA levantado (`pnpm build` + `pnpm start -p 3011`) por HTTP
 * con login real, y leen la base (Neon) con `DATABASE_URL` para verificar el estado.
 *
 * Reglas:
 *  - Los PINs se resuelven EN MEMORIA en cada corrida (se comparan los números que muestra
 *    `components/login-form.tsx` contra los hashes de la base). Nunca se escriben en archivos
 *    ni se imprimen.
 *  - Todo lo que se crea queda marcado "prueba <comando> <dd-mm-aaaa>" (ver `marca`).
 *  - Al terminar, `limpiar` cancela o borra las órdenes de prueba, libera las mesas, desactiva los
 *    productos e ingredientes creados y cierra las sesiones.
 *  - Configuración: `PRUEBAS_URL` (URL base completa) o `PRUEBAS_PUERTO` (por defecto 3011).
 *
 * No toca las mesas 1 y 4. Usa las mesas 2, 3, 5, 6, 7, 8, 9 y 10: tienen que estar libres.
 */
const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')

const RAIZ = path.resolve(__dirname, '..', '..')
const req = createRequire(path.join(RAIZ, 'package.json'))
const { neon } = req('@neondatabase/serverless')
const bcrypt = req('bcryptjs')

const BASE = process.env.PRUEBAS_URL || `http://localhost:${process.env.PRUEBAS_PUERTO || 3011}`
const MESAS = [2, 3, 5, 6, 7, 8, 9, 10]
const UUID_FALSO = '11111111-1111-4111-8111-111111111111'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** dd-mm-aaaa en la zona de Chile. */
function fechaHoy() {
  return new Date().toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

let sql = null
function getSql() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta DATABASE_URL: corre las pruebas con `pnpm prueba:humo` o `pnpm prueba:completa` (cargan .env.local).')
    }
    sql = neon(process.env.DATABASE_URL)
  }
  return sql
}

// ───────────── contadores de resultados ─────────────
const res = { pass: 0, fail: 0, fallos: [] }
function check(nombre, cond, detalle) {
  if (cond) {
    res.pass++
    console.log('  PASS', nombre)
  } else {
    res.fail++
    res.fallos.push(nombre)
    console.log('  FAIL', nombre, detalle !== undefined ? '→ ' + JSON.stringify(detalle).slice(0, 400) : '')
  }
}

// ───────────── HTTP ─────────────
async function fetchReintento(url, opts, n = 3) {
  let ultimo
  for (let i = 0; i < n; i++) {
    try {
      return await fetch(url, opts)
    } catch (e) {
      ultimo = e
      await sleep(400)
    }
  }
  throw ultimo
}

/** `ses.base` (opcional) apunta la petición a otro servidor (el módulo `sesion` levanta los suyos). `ses.cabeceras` agrega cabeceras. */
async function api(ses, metodo, ruta, body) {
  const r = await fetchReintento(((ses && ses.base) || BASE) + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', cookie: ses ? ses.cookie : '', ...((ses && ses.cabeceras) || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const txt = await r.text()
  let json = null
  try {
    json = JSON.parse(txt)
  } catch {
    json = txt
  }
  return { status: r.status, json }
}

// ───────────── PINs en memoria ─────────────
async function resolverUsuarios() {
  const db = getSql()
  const src = fs.readFileSync(path.join(RAIZ, 'components', 'login-form.tsx'), 'utf8')
  const linea = src.split('\n').find((l) => l.includes('PINs:')) || ''
  const candidatos = Array.from(new Set(linea.match(/\b\d{4,8}\b/g) || []))
  const usuarios = await db`SELECT id, nombre, email, rol, pin_hash FROM soda_master.usuarios WHERE activo = true ORDER BY created_at`
  const porRol = {}
  for (const u of usuarios) {
    const rol = String(u.rol || '').toLowerCase().replace('administrador', 'admin')
    if (porRol[rol] || !u.pin_hash) continue
    for (const pin of candidatos) {
      if (await bcrypt.compare(pin, u.pin_hash)) {
        porRol[rol] = { id: u.id, nombre: u.nombre, email: u.email, rol, pin }
        break
      }
    }
  }
  return porRol
}

async function iniciarSesion(u, base) {
  const r = await fetchReintento((base || BASE) + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, pin: u.pin }),
  })
  if (r.status !== 200) throw new Error(`login de ${u.rol} respondió ${r.status}`)
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]
  return { cookie, id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, base: base || undefined, setCookie: r.headers.get('set-cookie') || '' }
}

/**
 * Usuario de prueba propio (sesión 14.5a): se crea con la API de admin, con un PIN aleatorio que vive
 * solo en memoria (nunca se imprime ni se guarda), queda marcado con la marca de la corrida y se
 * borra en `limpiar`. Sirve para probar sin tocar las sesiones de los usuarios reales (una sola
 * sesión por usuario) y para roles que la base real no tiene. Con `base === false` no inicia sesión.
 */
async function crearUsuarioPrueba(ctx, rol, extra = {}, base) {
  const pin = String(1000 + Math.floor(Math.random() * 9000))
  const email = `prueba-${rol}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@prueba.invalid`
  const r = await api(ctx.admin, 'POST', '/api/usuarios', { email, nombre: `${ctx.marca} ${rol}`, rol, pin, activo: true, ...extra })
  if (r.status !== 201) throw new Error(`no se pudo crear el usuario de prueba ${rol} (${r.status})`)
  ;(ctx.usuariosPrueba = ctx.usuariosPrueba || []).push(r.json.id)
  const u = { id: r.json.id, email, pin, rol, nombre: r.json.nombre }
  return { usuario: u, sesion: base === false ? null : await iniciarSesion(u, base), reingresar: (b) => iniciarSesion(u, b) }
}

// ───────────── contexto de una corrida ─────────────
async function crearContexto(comando) {
  const db = getSql()
  const marca = `prueba ${comando} ${fechaHoy()}`
  const alcanzable = await fetch(BASE + '/api/hora').then((r) => r.status === 200).catch(() => false)
  if (!alcanzable) {
    throw new Error(`No hay servidor en ${BASE}. Levántalo con \`pnpm build\` y \`pnpm start -p 3011\` (o define PRUEBAS_URL / PRUEBAS_PUERTO).`)
  }
  const usuarios = await resolverUsuarios()
  for (const rol of ['admin', 'mesero', 'cajero', 'cocina']) {
    if (!usuarios[rol]) throw new Error(`No se pudo resolver el PIN de un usuario con rol ${rol} (¿cambió el texto de PINs en login-form.tsx?).`)
  }
  const [admin, mesero, cajero, cocina] = await Promise.all(
    ['admin', 'mesero', 'cajero', 'cocina'].map((r) => iniciarSesion(usuarios[r])),
  ).catch(async () => {
    // el login revoca la sesión anterior del mismo usuario: se hace en serie si hubo conflicto
    const out = []
    for (const r of ['admin', 'mesero', 'cajero', 'cocina']) out.push(await iniciarSesion(usuarios[r]))
    return out
  })
  const mesa = {}
  for (const n of MESAS) {
    const f = await db`SELECT id, estado FROM soda_master.mesas WHERE numero = ${n}`
    if (!f[0]) throw new Error(`No existe la mesa ${n}`)
    mesa[n] = f[0].id
  }
  const act = await db`
    SELECT m.numero FROM soda_master.ordenes o JOIN soda_master.mesas m ON m.id = o.mesa_id
    WHERE m.numero = ANY(${MESAS}) AND o.estado NOT IN ('pagado','cancelado','perdida')`
  const limpiarRestos = process.env.PRUEBAS_LIMPIAR_MESAS === '1'
  if (act.length > 0 && !limpiarRestos) {
    throw new Error(`Las mesas de prueba tienen órdenes activas (mesas ${act.map((a) => a.numero).join(', ')}). Libéralas, o si son restos de una corrida abortada corre con PRUEBAS_LIMPIAR_MESAS=1 para que se cancelen o cobren.`)
  }
  const caja = await api(cajero, 'GET', '/api/caja')
  const cajaAjena = caja.json && caja.json.abierta === true
  const ctx = { comando, marca, db, admin, mesero, cajero, cocina, maria: mesero, carlos: cajero, ezio: cocina, mesa, MESAS, cajaAjena, f: null, usuarios }
  if (act.length > 0 && limpiarRestos) await limpiarMesas(ctx)
  return ctx
}

// ───────────── fixtures ─────────────
/** Ingredientes y productos de prueba con stock chico, creados por la API de admin. */
async function crearFixtures(ctx) {
  const { admin, marca } = ctx
  const ing = async (nombre, stock) => {
    const r = await api(admin, 'POST', '/api/ingredientes', { nombre: `${marca} ${nombre}`, stock_actual: stock, unidad_medida: 'unidad', costo_unitario: 100 })
    if (r.status !== 201) throw new Error(`no se pudo crear el ingrediente (${r.status})`)
    return r.json.id
  }
  const ingA = await ing('ing A', 10)
  const ingB = await ing('ing B', 10)
  const ingX = await ing('ing extra', 10)
  const ingO = await ing('ing opcional', 10)
  const lista = await api(admin, 'GET', '/api/productos')
  // Sesión 14.5a (F39): los fixtures normales son de COCINA y `pBar` es de BAR (la estación sale de la
  // categoría del producto, ver lib/estaciones.ts); así las matrices por rol se prueban con las dos.
  const CATEGORIAS_BAR = ['bebidas', 'cervezas', 'jugos_bebidas', 'tragos']
  const categoria = (lista.json.find((p) => p.categoria && !CATEGORIAS_BAR.includes(p.categoria)) || {}).categoria
  const categoriaBar = (lista.json.find((p) => CATEGORIAS_BAR.includes(p.categoria)) || {}).categoria || 'cervezas'
  const prod = async (nombre, precio, cat = categoria) => {
    const r = await api(admin, 'POST', '/api/productos', { nombre: `${marca} ${nombre}`, categoria: cat, precio, descripcion: marca })
    if (r.status !== 200) throw new Error(`no se pudo crear el producto (${r.status})`)
    return r.json.id
  }
  const pR = await prod('receta', 1000)
  const pRP = await prod('receta+producto', 2000)
  const pP = await prod('solo producto', 1500)
  const pEsp = await prod('extra especial', 0)
  const pBar = await prod('bar', 1200, categoriaBar)
  await api(admin, 'PATCH', '/api/productos/' + pEsp, { es_ingrediente_especial: true, costo_adicional: 700 })
  await api(admin, 'POST', '/api/recetas', {
    producto_id: pR, nombre: marca, modo_stock: 'receta',
    ingredientes: [
      { ingrediente_id: ingA, cantidad: 1 },
      { ingrediente_id: ingB, cantidad: 2 },
      { ingrediente_id: ingX, cantidad: 1, extra: true, costo_adicional: 500, nombre_display: 'Extra de prueba' },
      { ingrediente_id: ingO, cantidad: 1, opcional: true, nombre_display: 'Opcional de prueba' },
    ],
  })
  await api(admin, 'POST', '/api/recetas', {
    producto_id: pRP, nombre: marca, modo_stock: 'producto_y_receta',
    ingredientes: [{ ingrediente_id: ingA, cantidad: 1 }],
  })
  ctx.f = { ingA, ingB, ingX, ingO, pR, pRP, pP, pEsp, pBar }
  await reponer(ctx)
}

/** Repone el stock de los fixtures (siempre por la API de admin, nunca por SQL). */
async function reponer(ctx, v = {}) {
  const { f, admin } = ctx
  const d = { A: 10, B: 10, X: 10, O: 10, RP: 3, P: 6, ...v }
  // Sesión 11: el stock ya no se fija por PATCH; el ajuste deja un movimiento `ajuste` (no entra en K).
  for (const [k, id] of [['A', f.ingA], ['B', f.ingB], ['X', f.ingX], ['O', f.ingO]]) {
    const r = await api(admin, 'POST', `/api/ingredientes/${id}/ajuste`, { stock_nuevo: d[k], motivo: ctx.marca })
    if (r.status !== 200) throw new Error(`no se pudo reponer el stock (${k}: ${r.status})`)
  }
  await api(admin, 'PATCH', '/api/inventario', { producto_id: f.pRP, stock_actual: d.RP })
  await api(admin, 'PATCH', '/api/inventario', { producto_id: f.pP, stock_actual: d.P })
  return d
}

// ───────────── consultas de verificación (solo lectura) ─────────────
const BIG = { A: 60, B: 60, X: 60, O: 60, P: 60 }

async function stocks(ctx) {
  const { f, db } = ctx
  const ing = await db`SELECT id::text AS id, stock_actual::float AS s FROM soda_master.ingredientes WHERE id = ANY(${[f.ingA, f.ingB, f.ingX, f.ingO]}::uuid[])`
  const inv = await db`SELECT producto_id::text AS id, stock_actual::float AS s FROM soda_master.inventario WHERE producto_id = ANY(${[f.pRP, f.pP]}::uuid[])`
  const g = (rows, id) => rows.find((r) => r.id === id).s
  return { A: g(ing, f.ingA), B: g(ing, f.ingB), X: g(ing, f.ingX), O: g(ing, f.ingO), RP: g(inv, f.pRP), P: g(inv, f.pP) }
}

/** K = stock + neto del registro (ventas − devoluciones): constante en cualquier operación. */
async function K(ctx) {
  const { f, db } = ctx
  const ing = await db`
    SELECT i.id::text AS id, (i.stock_actual + COALESCE((SELECT SUM(CASE WHEN m.tipo='venta' THEN m.cantidad WHEN m.tipo='devolucion' THEN -m.cantidad ELSE 0 END)
      FROM soda_master.movimientos_inventario m WHERE m.ingrediente_id = i.id), 0))::float AS k
    FROM soda_master.ingredientes i WHERE i.id = ANY(${[f.ingA, f.ingB, f.ingX, f.ingO]}::uuid[])`
  const prod = await db`
    SELECT v.producto_id::text AS id, (v.stock_actual + COALESCE((SELECT SUM(CASE WHEN m.tipo='venta' THEN m.cantidad WHEN m.tipo='devolucion' THEN -m.cantidad ELSE 0 END)
      FROM soda_master.movimientos_inventario m WHERE m.ingrediente_id IS NULL AND m.producto_id = v.producto_id), 0))::float AS k
    FROM soda_master.inventario v WHERE v.producto_id = ANY(${[f.pRP, f.pP]}::uuid[])`
  const g = (rows, id) => Math.round(rows.find((r) => r.id === id).k * 1000) / 1000
  return { A: g(ing, f.ingA), B: g(ing, f.ingB), X: g(ing, f.ingX), O: g(ing, f.ingO), RP: g(prod, f.pRP), P: g(prod, f.pP) }
}
async function movCount(ctx) {
  return Number((await ctx.db`SELECT count(*)::int AS n FROM soda_master.movimientos_inventario`)[0].n)
}
async function huerfanos(ctx) {
  return Number((await ctx.db`SELECT count(*)::int AS n FROM soda_master.items_orden i LEFT JOIN soda_master.ordenes o ON o.id = i.orden_id WHERE o.id IS NULL`)[0].n)
}
async function totalesOk(ctx, ordenId) {
  const r = await ctx.db`SELECT o.subtotal::float AS s, o.total::float AS t, COALESCE((SELECT SUM(precio_unitario*cantidad) FROM soda_master.items_orden WHERE orden_id=o.id),0)::float AS suma FROM soda_master.ordenes o WHERE o.id=${ordenId}::uuid`
  if (!r[0]) return { existe: false, ok: false }
  return { existe: true, subtotal: r[0].s, total: r[0].t, suma: r[0].suma, ok: Math.abs(r[0].s - r[0].suma) < 0.01 }
}
async function netoItem(ctx, itemId) {
  return (await ctx.db`SELECT COALESCE(SUM(CASE WHEN tipo='venta' THEN cantidad WHEN tipo='devolucion' THEN -cantidad ELSE 0 END),0)::float AS n, count(*)::int AS c FROM soda_master.movimientos_inventario WHERE item_orden_id=${itemId}::uuid`)[0]
}
async function activasMesa(ctx, n) {
  return ctx.db`SELECT id, estado, created_at FROM soda_master.ordenes WHERE mesa_id = ${ctx.mesa[n]}::uuid AND estado NOT IN ('pagado','cancelado','perdida')`
}
async function itemsDe(ctx, ordenId) {
  return ctx.db`SELECT id, cantidad, precio_unitario, estado_item, pagado FROM soda_master.items_orden WHERE orden_id = ${ordenId}::uuid`
}
async function ordenRow(ctx, id) {
  return (await ctx.db`SELECT id, estado, subtotal, impuesto, total FROM soda_master.ordenes WHERE id = ${id}::uuid`)[0] || null
}

// ───────────── atajos de uso común ─────────────
const enviar = (ses, body) => api(ses, 'POST', '/api/ordenes/enviar', body)
const it = (producto_id, cantidad = 1, extra = {}) => ({ producto_id, cantidad, ...extra })
const extraX = (ctx) => ({
  extras_ingredientes: [{ ingrediente_id: ctx.f.ingX, cantidad: 1 }],
  notas_especiales: JSON.stringify({ salsa: '', ingredientesEspeciales: [{ id: ctx.f.ingX }] }),
})

/** Cancela o borra las órdenes activas de las mesas indicadas (por defecto todas las de prueba). */
async function limpiarMesas(ctx, numeros = MESAS) {
  for (const n of numeros) {
    for (const o of await activasMesa(ctx, n)) {
      const d = await api(ctx.admin, 'DELETE', '/api/ordenes', { id: o.id })
      if (d.status === 200) continue
      const c = await api(ctx.admin, 'PATCH', '/api/ordenes', { id: o.id, estado: 'cancelado', notas: ctx.marca + ' (limpieza)' })
      // con ítems ya pagados no se puede borrar ni cancelar: se cobra lo que quede (flujo normal)
      if (c.status !== 200) await cerrarOrden(ctx, o.id)
    }
  }
}

/** Cobra con tarjeta lo que quede sin pagar (flujo normal) para cerrar una orden de prueba. */
async function cerrarOrden(ctx, ordenId) {
  let its = await itemsDe(ctx, ordenId)
  let pend = its.filter((i) => !i.pagado)
  if (pend.length === 0) {
    const est = await ordenRow(ctx, ordenId)
    if (!est || ['pagado', 'cancelado', 'perdida'].includes(est.estado)) return
    // orden abierta con todo pagado (F20): se agrega un ítem y se cobra para cerrarla
    if (!ctx.f) return
    await enviar(ctx.mesero, { orden_id: ordenId, items: [it(ctx.f.pP, 1)] })
    its = await itemsDe(ctx, ordenId)
    pend = its.filter((i) => !i.pagado)
  }
  const monto = pend.reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0)
  await api(ctx.cajero, 'POST', '/api/pagos', { orden_id: ordenId, metodo: 'tarjeta', monto_esperado: monto })
}

/** Cierre final: libera mesas, desactiva fixtures, cierra sesiones. Siempre se llama, aun con fallos. */
async function limpiar(ctx) {
  const avisos = []
  try {
    await limpiarMesas(ctx)
    const mesas = await api(ctx.admin, 'GET', '/api/mesas')
    for (const m of Array.isArray(mesas.json) ? mesas.json : []) {
      if (MESAS.includes(Number(m.numero)) && m.estado !== 'libre') {
        await api(ctx.admin, 'PATCH', '/api/mesas', { id: m.id, estado: 'libre' })
      }
    }
    // sesión 15 (#23): mesas que creó una prueba (se borran) y mesas de prueba renombradas (vuelven a su nombre original)
    for (const id of ctx.mesasPrueba || []) {
      const d = await api(ctx.admin, 'DELETE', '/api/mesas/' + id)
      if (d.status !== 200 && d.status !== 404) avisos.push(`no se pudo borrar la mesa de prueba ${id} (${d.status})`)
    }
    const mesas2 = await api(ctx.admin, 'GET', '/api/mesas')
    for (const m of Array.isArray(mesas2.json) ? mesas2.json : []) {
      if (MESAS.includes(Number(m.numero)) && m.nombre !== 'Mesa ' + m.numero) {
        await api(ctx.admin, 'PATCH', '/api/mesas', { id: m.id, nombre: 'Mesa ' + m.numero })
        avisos.push('se restauró el nombre de la mesa ' + m.numero)
      }
    }
    if (ctx.f) {
      for (const id of [ctx.f.pR, ctx.f.pRP, ctx.f.pP, ctx.f.pEsp, ctx.f.pBar]) await api(ctx.admin, 'PATCH', '/api/productos/' + id, { activo: false })
      for (const id of [ctx.f.ingA, ctx.f.ingB, ctx.f.ingX, ctx.f.ingO]) await api(ctx.admin, 'PATCH', '/api/ingredientes/' + id, { activo: false })
    }
    // insumos y productos de módulos que crean los suyos (unidades)
    for (const id of ctx.limpiezaProd || []) await api(ctx.admin, 'PATCH', '/api/productos/' + id, { activo: false })
    for (const id of ctx.limpiezaIng || []) await api(ctx.admin, 'PATCH', '/api/ingredientes/' + id, { activo: false })
    // mermas que registraron las pruebas (14.5b-2, F45): llevan la marca de la corrida en la descripción. Sesión 14c (F21):
    // las de ítems preparados que se borran o cancelan (tipo item_preparado) llevan una descripción generada por el servidor;
    // se reconocen por el producto (o insumo) de la marca. Van ANTES de borrar los usuarios temporales: `registrado_por` los dejaría con historial (F50).
    try { await ctx.db`DELETE FROM soda_master.mermas WHERE descripcion = ${ctx.marca}
      OR producto_id IN (SELECT id FROM soda_master.productos WHERE starts_with(nombre, ${ctx.marca}))
      OR ingrediente_id IN (SELECT id FROM soda_master.ingredientes WHERE starts_with(nombre, ${ctx.marca}))` } catch (e) { avisos.push('no se pudieron borrar las mermas de prueba: ' + e.message) }
    // sesión 18 (K1, derechos ARCOP): las solicitudes, empleados, proveedores y gastos que creó el módulo `arco` se borran por los
    // ids que guardó en `ctx.arco` (tras anonimizarlos el nombre ya no empieza con la marca). Guarda doble, como en la sesión 17:
    // el id guardado Y que la fila sea de prueba (titular de la lista; nombre con la marca o ya anonimizado). Las solicitudes van
    // ANTES de los usuarios temporales: `ingresada_por` y `resuelta_por` cuentan como historial y los dejarían sin poder borrarse (F50).
    if (ctx.arco) {
      try {
        const A = ctx.arco
        const titulares = [...(A.empleados || []), ...(A.proveedores || []), ...(ctx.usuariosPrueba || []), ...(A.extraTitulares || [])]
        await ctx.db`DELETE FROM soda_master.solicitudes_arco WHERE id = ANY(${A.solicitudes || []}::uuid[]) AND titular_id = ANY(${titulares}::uuid[])`
        await ctx.db`DELETE FROM soda_master.gastos WHERE id = ANY(${A.gastos || []}::uuid[]) AND (empleado_id = ANY(${A.empleados || []}::uuid[]) OR proveedor_id = ANY(${A.proveedores || []}::uuid[]))`
        await ctx.db`DELETE FROM soda_master.empleados WHERE id = ANY(${A.empleados || []}::uuid[]) AND (starts_with(nombre, ${ctx.marca}) OR nombre = 'Empleado anonimizado')`
        await ctx.db`DELETE FROM soda_master.proveedores WHERE id = ANY(${A.proveedores || []}::uuid[]) AND (starts_with(nombre, ${ctx.marca}) OR nombre = 'Proveedor anonimizado')`
        const quedan = await ctx.db`SELECT (SELECT count(*)::int FROM soda_master.solicitudes_arco WHERE id = ANY(${A.solicitudes || []}::uuid[])) AS s, (SELECT count(*)::int FROM soda_master.empleados WHERE id = ANY(${A.empleados || []}::uuid[])) AS e, (SELECT count(*)::int FROM soda_master.proveedores WHERE id = ANY(${A.proveedores || []}::uuid[])) AS p`
        if (quedan[0].s + quedan[0].e + quedan[0].p > 0) avisos.push(`quedaron filas de prueba de ARCOP (solicitudes ${quedan[0].s}, empleados ${quedan[0].e}, proveedores ${quedan[0].p})`)
      } catch (e) { avisos.push('no se pudieron borrar las solicitudes ARCOP y los titulares de prueba: ' + e.message) }
    }
    // sesión 17 (K1): un admin temporal que modificó usuarios dejó entradas en auditoria_admin (`usuario_id` cuenta como historial y
    // impide borrarlo, F50). Excepción explícita del usuario (21-11-2026) a que auditoria_admin sea de solo adición: se borran SOLO las que
    // dejaron los usuarios temporales de esta corrida (por id Y con el nombre "prueba …" que tenían al actuar), antes de borrarlos.
    try { await ctx.db`DELETE FROM soda_master.auditoria_admin WHERE usuario_id = ANY(${ctx.usuariosPrueba || []}::uuid[]) AND starts_with(usuario_nombre, 'prueba ')` } catch (e) { avisos.push('no se pudieron borrar las entradas de auditoría de los usuarios de prueba: ' + e.message) }
    // usuarios de prueba (sesión 14.5a): se borran (sus sesiones caen en cascada)
    for (const id of ctx.usuariosPrueba || []) {
      const d = await api(ctx.admin, 'DELETE', '/api/usuarios/' + id)
      if (d.status !== 200 && d.status !== 404) {
        await api(ctx.admin, 'PATCH', '/api/usuarios/' + id, { activo: false })
        avisos.push(`no se pudo borrar el usuario de prueba ${id} (quedó desactivado)`)
      }
    }
    const abiertas = await ctx.db`SELECT count(*)::int AS n FROM soda_master.cajas WHERE estado = 'abierta'`
    if (!ctx.cajaAjena && Number(abiertas[0].n) > 0) avisos.push('quedó una caja abierta por la prueba (ciérrala desde Caja)')
    const act = await ctx.db`SELECT m.numero FROM soda_master.ordenes o JOIN soda_master.mesas m ON m.id = o.mesa_id WHERE m.numero = ANY(${MESAS}) AND o.estado NOT IN ('pagado','cancelado','perdida')`
    if (act.length > 0) avisos.push(`quedaron órdenes activas en las mesas ${act.map((a) => a.numero).join(', ')}`)
    if ((await huerfanos(ctx)) > 0) avisos.push('hay ítems huérfanos')
  } catch (e) {
    avisos.push('error al limpiar: ' + e.message)
  }
  for (const ses of [ctx.admin, ctx.mesero, ctx.cajero, ctx.cocina]) {
    try { await api(ses, 'POST', '/api/auth/logout', {}) } catch { /* nada */ }
  }
  return avisos
}

function resumen(titulo) {
  console.log(`\n== ${titulo}: ${res.pass} PASS, ${res.fail} FAIL ==`)
  if (res.fail) console.log('Fallos:\n - ' + res.fallos.join('\n - '))
  return res.fail === 0
}

module.exports = {
  BASE, MESAS, UUID_FALSO, iniciarSesion, BIG, sleep, eq, check, res, api, crearContexto, crearFixtures, reponer,
  stocks, K, movCount, huerfanos, totalesOk, netoItem, activasMesa, itemsDe, ordenRow,
  enviar, it, extraX, limpiarMesas, cerrarOrden, limpiar, resumen, fechaHoy, crearUsuarioPrueba,
}
