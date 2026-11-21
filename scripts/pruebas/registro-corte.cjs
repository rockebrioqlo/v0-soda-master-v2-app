/**
 * Módulo `registro` (sesión 14b, F19): el registro de stock (`movimientos_inventario`) se reparte, por la
 * proporción de unidades, cuando una línea se parte: el corte por cobro parcial (el "resto") y los clones
 * de una asignación por persona. Antes las piezas nuevas nacían sin registro (editar o borrar no movía
 * stock) y la fila original conservaba el registro de TODAS las unidades (borrar solo esa pieza devolvía de más).
 *
 * Lo corren `stock.cjs` (`cortes`) y `asignaciones.cjs` (`clones`), y también solo (`--modulo=registro`).
 * Invariantes: K = stock + neto del registro no cambia nunca; la suma del neto de las piezas de una orden es
 * la de la línea original; el neto de cada pieza pendiente es (unidades × lo que consume una unidad).
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'registro'

const r3 = (n) => Math.round(n * 1000) / 1000
const casi = (a, b, tol = 0.0004) => Math.abs(Number(a) - Number(b)) <= tol
const mismo = (a, b) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return eq(ka, kb) && ka.every((k) => casi(a[k], b[k]))
}

/** Neto (ventas − devoluciones) del registro de un ítem, con rótulos cortos por insumo o producto. */
async function neto(ctx, itemId, rotulos) {
  const rows = await ctx.db`
    SELECT ingrediente_id::text AS ing, producto_id::text AS prod,
           SUM(CASE WHEN tipo = 'venta' THEN cantidad ELSE -cantidad END)::float AS n
    FROM soda_master.movimientos_inventario
    WHERE item_orden_id = ${itemId}::uuid AND tipo IN ('venta', 'devolucion')
    GROUP BY ingrediente_id, producto_id`
  const out = {}
  for (const r of rows) {
    const k = r.ing ? rotulos[r.ing] : rotulos[r.prod]
    if (Math.abs(r.n) > 0.0004) out[k || (r.ing || r.prod)] = r3(r.n)
  }
  return out
}

const itemsC = (ctx, O) => ctx.db`
  SELECT id::text AS id, cantidad::int AS cantidad, pagado, cuenta_persona_id::text AS cuenta, estado_item
  FROM soda_master.items_orden WHERE orden_id = ${O}::uuid ORDER BY created_at, id`

/** Suma el neto de todas las piezas de una orden. */
async function netoOrden(ctx, O, rotulos) {
  const tot = {}
  for (const i of await itemsC(ctx, O)) {
    const n = await neto(ctx, i.id, rotulos)
    for (const [k, v] of Object.entries(n)) tot[k] = r3((tot[k] || 0) + v)
  }
  return tot
}

/** Ítems cuyo neto no es (unidades × consumo de una unidad). Vacío = coherente. */
async function incoherentes(ctx, O, porUnidad, rotulos) {
  const malos = []
  for (const i of await itemsC(ctx, O)) {
    const esp = {}
    for (const [k, v] of Object.entries(porUnidad)) esp[k] = r3(v * i.cantidad)
    const n = await neto(ctx, i.id, rotulos)
    if (!mismo(n, esp)) malos.push({ id: i.id.slice(0, 8), cantidad: i.cantidad, neto: n, esperado: esp })
  }
  return malos
}

/** Cobra lo seleccionado con tarjeta: el monto sale de la respuesta MONTO_DISTINTO del servidor. */
async function cobrarSel(ctx, O, sel) {
  const probe = await api(ctx.cajero, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: 99999999, ...sel })
  if (probe.status !== 409 || probe.json.codigo !== 'MONTO_DISTINTO') return probe
  return api(ctx.cajero, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: Number(probe.json.monto_servidor), ...sel })
}
async function montoDe(ctx, O, sel) {
  const probe = await api(ctx.cajero, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: 99999999, ...sel })
  return Number(probe.json.monto_servidor)
}

/** Insumo en gramos con rendimiento propio y un producto con una receta de un solo insumo. */
async function fixtureInsumo(ctx, nombre, rendimiento, receta, stock = 3000) {
  const { admin, marca } = ctx
  ctx.limpiezaIng = ctx.limpiezaIng || []
  ctx.limpiezaProd = ctx.limpiezaProd || []
  const ing = await api(admin, 'POST', '/api/ingredientes', { nombre: `${marca} ${nombre}`, unidad_medida: 'g', stock_actual: stock, costo_unitario: 1, rendimiento_pct: rendimiento })
  if (ing.status !== 201) throw new Error(`no se pudo crear el insumo ${nombre} (${ing.status})`)
  ctx.limpiezaIng.push(ing.json.id)
  const lista = await api(admin, 'GET', '/api/productos')
  const categoria = (lista.json.find((p) => p.categoria) || {}).categoria
  const prod = await api(admin, 'POST', '/api/productos', { nombre: `${marca} ${nombre} plato`, categoria, precio: 5000, descripcion: marca })
  if (prod.status !== 200) throw new Error(`no se pudo crear el producto ${nombre} (${prod.status})`)
  ctx.limpiezaProd.push(prod.json.id)
  await api(admin, 'POST', '/api/recetas', { producto_id: prod.json.id, nombre: marca, modo_stock: 'receta', ingredientes: [{ ingrediente_id: ing.json.id, cantidad: receta }] })
  return { ing: ing.json.id, prod: prod.json.id }
}
const stockIng = async (ctx, id) => Number((await ctx.db`SELECT stock_actual::float AS s FROM soda_master.ingredientes WHERE id = ${id}::uuid`)[0].s)

// ════════════════════════════════════════════════════════════════════
// Cortes por cobro parcial
// ════════════════════════════════════════════════════════════════════
exports.cortes = async function (ctx) {
  const { f, mesa, maria, ezio, db } = ctx
  const extra = L.extraX(ctx)
  const rot = { [f.ingA]: 'A', [f.ingB]: 'B', [f.ingX]: 'X', [f.ingO]: 'O', [f.pRP]: 'RP', [f.pP]: 'P' }
  const consume = (s0, d) => ({ ...s0, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, s0[k] - v])) })

  console.log('\n[registro] corte por cobro parcial: el resto y la original se reparten el registro')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const base = await L.stocks(ctx)
  const k0 = await L.K(ctx)
  const r = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 3, extra)] })
  const O = r.json.orden.id
  const orig = r.json.items[0]
  const s1 = await L.stocks(ctx)
  check('línea de 3 con extra: el registro del ítem dice A 3, B 6, X 3', mismo(await neto(ctx, orig.id, rot), { A: 3, B: 6, X: 3 }) && eq(s1, consume(base, { A: 3, B: 6, X: 3 })), [await neto(ctx, orig.id, rot), s1])
  const pg = await cobrarSel(ctx, O, { item_partials: [{ id: orig.id, cantidad: 1 }] })
  const resto = (await itemsC(ctx, O)).find((i) => !i.pagado)
  check('cobro parcial de 1 de 3: 201 y el resto queda con 2 unidades', pg.status === 201 && resto && resto.cantidad === 2, [pg.status, resto])
  const nOrig = await neto(ctx, orig.id, rot)
  const nResto = await neto(ctx, resto.id, rot)
  check('el registro se reparte: la pagada A 1, B 2, X 1 y el resto A 2, B 4, X 2 (sin duplicar)', mismo(nOrig, { A: 1, B: 2, X: 1 }) && mismo(nResto, { A: 2, B: 4, X: 2 }), [nOrig, nResto])
  check('el corte no mueve stock y K es constante', eq(await L.stocks(ctx), s1) && eq(await L.K(ctx), k0))
  const filasResto = await db`SELECT tipo, notas, created_at FROM soda_master.movimientos_inventario WHERE item_orden_id = ${resto.id}::uuid`
  check('las filas del resto son de tipo venta y dicen "Corte de línea: parte del ítem <id original>"', filasResto.length === 3 && filasResto.every((x) => x.tipo === 'venta' && x.notas === `Corte de línea: parte del ítem ${orig.id}`), filasResto)
  const filasOrig = await db`SELECT ingrediente_id::text AS ing, notas FROM soda_master.movimientos_inventario WHERE item_orden_id = ${orig.id}::uuid ORDER BY ingrediente_id`
  const nota = (ing) => (filasOrig.find((x) => x.ing === ing) || {}).notas || ''
  check('las filas reducidas de la original conservan su nota y agregan "Corte de línea: reducida de X a Y por el ítem <id>"',
    filasOrig.length === 3 &&
      nota(f.ingA).startsWith('Venta item') && nota(f.ingA).includes(`Corte de línea: reducida de 3 a 1 por el ítem ${resto.id}`) &&
      nota(f.ingB).includes(`Corte de línea: reducida de 6 a 2 por el ítem ${resto.id}`) &&
      nota(f.ingX).includes(`Corte de línea: reducida de 3 a 1 por el ítem ${resto.id}`), filasOrig)
  const e1 = await api(maria, 'PATCH', '/api/items-orden', { id: resto.id, cantidad: 4 })
  const s2 = await L.stocks(ctx)
  check('editar el resto 2→4 descuenta A 2, B 4, X 2 (antes no movía stock)', e1.status === 200 && eq(s2, consume(s1, { A: 2, B: 4, X: 2 })) && mismo(await neto(ctx, resto.id, rot), { A: 4, B: 8, X: 4 }) && eq(await L.K(ctx), k0), [e1.status, s2])
  const dp = await api(maria, 'DELETE', '/api/items-orden', { id: orig.id })
  check('la parte ya pagada no se borra (409 ITEM_PAGADO) y el stock no se mueve', dp.status === 409 && dp.json.codigo === 'ITEM_PAGADO' && eq(await L.stocks(ctx), s2), [dp.status, dp.json])
  const dr = await api(maria, 'DELETE', '/api/items-orden', { id: resto.id })
  check('borrar el resto devuelve todo lo suyo: queda descontada solo la unidad cobrada (A 1, B 2, X 1)', dr.status === 200 && eq(await L.stocks(ctx), consume(base, { A: 1, B: 2, X: 1 })) && eq(await L.K(ctx), k0), [dr.status, await L.stocks(ctx)])
  await L.limpiarMesas(ctx)

  console.log('\n[registro] cortes sucesivos de la misma línea')
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const baseS = await L.stocks(ctx)
  const kS = await L.K(ctx)
  const rs = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 5)] })
  const OS = rs.json.orden.id
  const o1 = rs.json.items[0]
  const c1 = await cobrarSel(ctx, OS, { item_partials: [{ id: o1.id, cantidad: 2 }] })
  const r1 = (await itemsC(ctx, OS)).find((i) => !i.pagado)
  const c2 = await cobrarSel(ctx, OS, { item_partials: [{ id: r1.id, cantidad: 1 }] })
  const its = await itemsC(ctx, OS)
  const r2 = its.find((i) => !i.pagado)
  check('5 → cobro de 2 (resto 3) → cobro de 1 del resto (resto 2)', c1.status === 201 && c2.status === 201 && r1.cantidad === 3 && r2.cantidad === 2 && its.length === 3, [c1.status, c2.status, its.map((i) => i.cantidad)])
  check('cada pieza lleva lo suyo (A 2/B 4, A 1/B 2, A 2/B 4) y la suma es la de la línea original (A 5, B 10)',
    mismo(await neto(ctx, o1.id, rot), { A: 2, B: 4 }) && mismo(await neto(ctx, r1.id, rot), { A: 1, B: 2 }) && mismo(await neto(ctx, r2.id, rot), { A: 2, B: 4 }) && mismo(await netoOrden(ctx, OS, rot), { A: 5, B: 10 }), await netoOrden(ctx, OS, rot))
  check('los cortes no mueven stock y K es constante', eq(await L.stocks(ctx), consume(baseS, { A: 5, B: 10 })) && eq(await L.K(ctx), kS))
  const eS = await api(maria, 'PATCH', '/api/items-orden', { id: r2.id, cantidad: 1 })
  const dS = await api(maria, 'DELETE', '/api/items-orden', { id: r2.id })
  check('el último resto: bajar 2→1 devuelve A 1 y B 2, borrarlo devuelve lo demás; quedan descontadas las 3 cobradas', eS.status === 200 && dS.status === 200 && eq(await L.stocks(ctx), consume(baseS, { A: 3, B: 6 })) && eq(await L.K(ctx), kS), [eS.status, dS.status, await L.stocks(ctx)])
  await L.limpiarMesas(ctx)

  console.log('\n[registro] producto + receta: el registro del producto vendible también se reparte')
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const baseP = await L.stocks(ctx)
  const kP = await L.K(ctx)
  const rp = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pRP, 3)] })
  const OP = rp.json.orden.id
  const op = rp.json.items[0]
  const cp = await cobrarSel(ctx, OP, { item_partials: [{ id: op.id, cantidad: 1 }] })
  const restoP = (await itemsC(ctx, OP)).find((i) => !i.pagado)
  check('línea producto+receta ×3 y cobro de 1: el resto lleva A 2 y RP 2; la pagada A 1 y RP 1', cp.status === 201 && mismo(await neto(ctx, restoP.id, rot), { A: 2, RP: 2 }) && mismo(await neto(ctx, op.id, rot), { A: 1, RP: 1 }), [cp.status, await neto(ctx, restoP.id, rot)])
  const ep = await api(maria, 'PATCH', '/api/items-orden', { id: restoP.id, cantidad: 1 })
  const sp1 = await L.stocks(ctx)
  check('bajar el resto 2→1 devuelve A 1 y RP 1', ep.status === 200 && eq(sp1, consume(baseP, { A: 2, RP: 2 })), [ep.status, sp1])
  const dp2 = await api(maria, 'DELETE', '/api/items-orden', { id: restoP.id })
  check('borrar el resto devuelve el resto; K constante', dp2.status === 200 && eq(await L.stocks(ctx), consume(baseP, { A: 1, RP: 1 })) && eq(await L.K(ctx), kP))
  await L.limpiarMesas(ctx)

  console.log('\n[registro] ítem ya en preparación: el resto no devuelve stock y deja la merma en su proporción')
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const baseM = await L.stocks(ctx)
  const kM = await L.K(ctx)
  const rm = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR, 3)] })
  const OM = rm.json.orden.id
  const im = rm.json.items[0]
  await api(ezio, 'PATCH', '/api/items-orden', { id: im.id, estado_item: 'en_preparacion' })
  const cm = await cobrarSel(ctx, OM, { item_partials: [{ id: im.id, cantidad: 1 }] })
  const restoM = (await itemsC(ctx, OM)).find((i) => !i.pagado)
  const dm = await api(maria, 'DELETE', '/api/items-orden', { id: restoM.id })
  const mermas = await db`SELECT ingrediente_id::text AS ing, cantidad::float AS q FROM soda_master.movimientos_inventario WHERE item_orden_id = ${restoM.id}::uuid AND tipo = 'merma' ORDER BY ingrediente_id`
  const mq = Object.fromEntries(mermas.map((m) => [rot[m.ing], m.q]))
  check('el resto copia el estado en_preparacion; borrarlo no devuelve stock y la merma es A 2, B 4', cm.status === 201 && restoM.estado_item === 'en_preparacion' && dm.status === 200 && mismo(mq, { A: 2, B: 4 }) && eq(await L.stocks(ctx), consume(baseM, { A: 3, B: 6 })) && eq(await L.K(ctx), kM), [mq, await L.stocks(ctx)])
  await L.limpiarMesas(ctx)

  console.log('\n[registro] cantidades con decimales (F29): suma exacta, la original recibe el resto')
  const carne = await fixtureInsumo(ctx, 'carne 70', 70, 150)
  const rotC = { [carne.ing]: 'C' }
  const dec = await enviar(maria, { mesa_id: mesa[7], items: [it(carne.prod, 3)] })
  const OD = dec.json.orden.id
  const iD = dec.json.items[0]
  const sD1 = await stockIng(ctx, carne.ing)
  check('150 g al 70 % × 3 descuenta 642,857 g (3.000 → 2.357,143) y el registro dice 642,857', casi(sD1, 3000 - 642.857) && mismo(await neto(ctx, iD.id, rotC), { C: 642.857 }), [sD1, await neto(ctx, iD.id, rotC)])
  const cd = await cobrarSel(ctx, OD, { item_partials: [{ id: iD.id, cantidad: 1 }] })
  const restoD = (await itemsC(ctx, OD)).find((i) => !i.pagado)
  const nD1 = await neto(ctx, iD.id, rotC)
  const nD2 = await neto(ctx, restoD.id, rotC)
  check('cobro de 1 de 3: el resto 428,571 g, la pagada 214,286 g y la suma exacta 642,857', cd.status === 201 && mismo(nD2, { C: 428.571 }) && mismo(nD1, { C: 214.286 }) && casi(nD1.C + nD2.C, 642.857, 0.00001), [nD1, nD2])
  const eD = await api(maria, 'PATCH', '/api/items-orden', { id: restoD.id, cantidad: 1 })
  const dD = await api(maria, 'DELETE', '/api/items-orden', { id: restoD.id })
  check('bajar el resto 2→1 y borrarlo devuelve exactamente lo suyo: quedan descontados 214,286 g (stock 2.785,714)', eD.status === 200 && dD.status === 200 && casi(await stockIng(ctx, carne.ing), 3000 - 214.286, 0.00001), [eD.status, dD.status, await stockIng(ctx, carne.ing)])
  await L.limpiarMesas(ctx)

  // redondeo en el .5: 1,001 g para 2 unidades → la pieza nueva ROUND(0,5005) = 0,501 y la original queda con 0,500 (no 0,501)
  const medio = await fixtureInsumo(ctx, 'redondeo', 200, 1.001, 100)
  const rotM = { [medio.ing]: 'M' }
  const rr = await enviar(maria, { mesa_id: mesa[8], items: [it(medio.prod, 2)] })
  const OR = rr.json.orden.id
  const iR = rr.json.items[0]
  const cr = await cobrarSel(ctx, OR, { item_partials: [{ id: iR.id, cantidad: 1 }] })
  const restoR = (await itemsC(ctx, OR)).find((i) => !i.pagado)
  const nR1 = await neto(ctx, iR.id, rotM)
  const nR2 = await neto(ctx, restoR.id, rotM)
  check('1,001 g para 2 unidades: la pieza nueva 0,501 y la original recibe el resto 0,500 (suma exacta 1,001, sin ROUND propio)', cr.status === 201 && mismo(nR2, { M: 0.501 }) && mismo(nR1, { M: 0.5 }), [nR1, nR2])
  await L.limpiarMesas(ctx)

  console.log('\n[registro] carrera: dos cobros parciales sobre la misma línea (3 rondas)')
  let malos = 0
  let unGanador = 0
  for (let k = 0; k < 3; k++) {
    await L.reponer(ctx, { ...L.BIG, RP: 60 })
    const kk = await L.K(ctx)
    const sb = await L.stocks(ctx)
    const rc = await enviar(maria, { mesa_id: mesa[9], items: [it(f.pR, 3)] })
    const OC = rc.json.orden.id
    const lin = rc.json.items[0]
    const m1 = await montoDe(ctx, OC, { item_partials: [{ id: lin.id, cantidad: 1 }] })
    const m2 = await montoDe(ctx, OC, { item_partials: [{ id: lin.id, cantidad: 2 }] })
    const pagar = (cant, monto) => api(ctx.cajero, 'POST', '/api/pagos', { orden_id: OC, metodo: 'tarjeta', monto_esperado: monto, item_partials: [{ id: lin.id, cantidad: cant }] })
    const d = [0, 40, 120][k]
    const [a, b] = await Promise.all(k % 2 ? [pagar(1, m1), sleep(d).then(() => pagar(2, m2))] : [sleep(d).then(() => pagar(1, m1)), pagar(2, m2)])
    const estados = [a.status, b.status].sort().join('/')
    const total = (await itemsC(ctx, OC)).reduce((s, i) => s + i.cantidad, 0)
    const mal = await incoherentes(ctx, OC, { A: 1, B: 2 }, rot)
    if (estados === '201/409') unGanador++
    if (!(estados === '201/409' && total === 3 && mal.length === 0 && eq(await L.stocks(ctx), consume(sb, { A: 3, B: 6 })) && eq(await L.K(ctx), kk))) malos++
    await L.limpiarMesas(ctx)
  }
  check(`gana un solo cobro y el otro 409 (${unGanador}/3); unidades, registro por pieza, stock y K siempre coherentes`, malos === 0 && unGanador === 3, { malos, unGanador })
  await L.limpiarMesas(ctx)
  await L.reponer(ctx)
}

// ════════════════════════════════════════════════════════════════════
// Clones de una asignación por persona
// ════════════════════════════════════════════════════════════════════
exports.clones = async function (ctx) {
  const { f, mesa, maria, db } = ctx
  const rot = { [f.ingA]: 'A', [f.ingB]: 'B', [f.ingX]: 'X', [f.ingO]: 'O', [f.pRP]: 'RP', [f.pP]: 'P' }
  const consume = (s0, d) => ({ ...s0, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, s0[k] - v])) })
  const persona = async (O, nombre) => {
    const r = await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O, nombre })
    return r.json && (r.json.id || (r.json.persona && r.json.persona.id))
  }
  const asignar = (O, asignaciones) => api(maria, 'POST', '/api/cuentas-persona/asignaciones', { orden_id: O, asignaciones })

  console.log('\n[registro] asignación por persona: cada pieza lleva su parte del registro')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const base = await L.stocks(ctx)
  const k0 = await L.K(ctx)
  const r = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 4)] })
  const O = r.json.orden.id
  const lin = r.json.items[0]
  const pa = await persona(O, 'A')
  const pb = await persona(O, 'B')
  const as = await asignar(O, [{ item_orden_id: lin.id, cantidad: 1, cuenta_persona_id: pa }, { item_orden_id: lin.id, cantidad: 1, cuenta_persona_id: pb }])
  const its = await itemsC(ctx, O)
  const piezaA = its.find((i) => i.cuenta === pa)
  const piezaB = its.find((i) => i.cuenta === pb)
  const comp = its.find((i) => !i.cuenta)
  check('4 unidades: 1 a A (la original), 1 a B (clon) y 2 compartidas (clon)', as.status === 200 && its.length === 3 && piezaA.id === lin.id && piezaA.cantidad === 1 && piezaB.cantidad === 1 && comp.cantidad === 2, [as.status, its])
  check('el registro se reparte: A 1/B 2, A 1/B 2 y A 2/B 4; la suma es la original (A 4, B 8)',
    mismo(await neto(ctx, piezaA.id, rot), { A: 1, B: 2 }) && mismo(await neto(ctx, piezaB.id, rot), { A: 1, B: 2 }) && mismo(await neto(ctx, comp.id, rot), { A: 2, B: 4 }) && mismo(await netoOrden(ctx, O, rot), { A: 4, B: 8 }), await netoOrden(ctx, O, rot))
  check('asignar no mueve stock y K es constante', eq(await L.stocks(ctx), consume(base, { A: 4, B: 8 })) && eq(await L.K(ctx), k0))
  const filas = await db`SELECT notas FROM soda_master.movimientos_inventario WHERE item_orden_id = ${piezaB.id}::uuid`
  const reducidas = await db`SELECT ingrediente_id::text AS ing, notas FROM soda_master.movimientos_inventario WHERE item_orden_id = ${lin.id}::uuid`
  const notaDe = (ing) => (reducidas.find((x) => x.ing === ing) || {}).notas || ''
  check('las piezas nuevas dicen "Corte de línea: parte del ítem <id original>" y la original deja el rastro de cada reducción (4→3 por B, 3→1 por la compartida)',
    filas.length === 2 && filas.every((x) => x.notas === `Corte de línea: parte del ítem ${lin.id}`) &&
      reducidas.length === 2 && notaDe(f.ingA).startsWith('Venta item') &&
      notaDe(f.ingA).includes(`reducida de 4 a 3 por el ítem ${piezaB.id}`) && notaDe(f.ingA).includes(`reducida de 3 a 1 por el ítem ${comp.id}`) &&
      notaDe(f.ingB).includes(`reducida de 8 a 6 por el ítem ${piezaB.id}`) && notaDe(f.ingB).includes(`reducida de 6 a 2 por el ítem ${comp.id}`), [filas, reducidas])
  const dA = await api(maria, 'DELETE', '/api/items-orden', { id: piezaA.id })
  check('borrar SOLO la pieza original devuelve solo lo suyo (A 1, B 2); antes devolvía el registro de las 4 unidades', dA.status === 200 && eq(await L.stocks(ctx), consume(base, { A: 3, B: 6 })) && eq(await L.K(ctx), k0), [dA.status, await L.stocks(ctx)])
  const eB = await api(maria, 'PATCH', '/api/items-orden', { id: piezaB.id, cantidad: 3 })
  check('editar el clon 1→3 descuenta A 2 y B 4 (antes no movía stock)', eB.status === 200 && eq(await L.stocks(ctx), consume(base, { A: 5, B: 10 })) && mismo(await neto(ctx, piezaB.id, rot), { A: 3, B: 6 }) && eq(await L.K(ctx), k0), [eB.status, await L.stocks(ctx)])
  const dC = await api(maria, 'DELETE', '/api/items-orden', { id: comp.id })
  check('borrar el clon compartido devuelve A 2 y B 4', dC.status === 200 && eq(await L.stocks(ctx), consume(base, { A: 3, B: 6 })) && eq(await L.K(ctx), k0), [dC.status, await L.stocks(ctx)])
  await L.limpiarMesas(ctx, [2])
  check('borrar la orden devuelve exactamente todo: el stock queda como al empezar y K constante', eq(await L.stocks(ctx), base) && eq(await L.K(ctx), k0), [await L.stocks(ctx), base])

  console.log('\n[registro] reasignar una pieza ya partida, y cobrar parcialmente un clon')
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const base2 = await L.stocks(ctx)
  const k2 = await L.K(ctx)
  const r2 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 4, L.extraX(ctx))] })
  const O2 = r2.json.orden.id
  const l2 = r2.json.items[0]
  const p2 = await persona(O2, 'A')
  await asignar(O2, [{ item_orden_id: l2.id, cantidad: 1, cuenta_persona_id: p2 }])
  const compartida = (await itemsC(ctx, O2)).find((i) => !i.cuenta)
  const q2 = await persona(O2, 'B')
  const as2 = await asignar(O2, [{ item_orden_id: compartida.id, cantidad: 2, cuenta_persona_id: q2 }])
  const its2 = await itemsC(ctx, O2)
  const mal2 = await incoherentes(ctx, O2, { A: 1, B: 2, X: 1 }, rot)
  check('4 unidades con extra: asignar 1, y luego 2 de las 3 compartidas; cada pieza queda en su proporción y la suma es la original', as2.status === 200 && its2.length === 3 && mal2.length === 0 && mismo(await netoOrden(ctx, O2, rot), { A: 4, B: 8, X: 4 }), [its2.map((i) => i.cantidad), mal2])
  const pieza2 = its2.find((i) => i.cuenta === q2)
  const cp = await cobrarSel(ctx, O2, { item_partials: [{ id: pieza2.id, cantidad: 1 }] })
  const its3 = await itemsC(ctx, O2)
  const mal3 = await incoherentes(ctx, O2, { A: 1, B: 2, X: 1 }, rot)
  check('cobrar 1 de las 2 unidades de un clon: el corte reparte el registro del clon y todo sigue en proporción', cp.status === 201 && its3.length === 4 && mal3.length === 0 && mismo(await netoOrden(ctx, O2, rot), { A: 4, B: 8, X: 4 }) && eq(await L.K(ctx), k2), [cp.status, its3.map((i) => [i.cantidad, i.pagado]), mal3])
  await L.limpiarMesas(ctx, [3])
  check('al cerrar la orden (cobrando lo pendiente) K sigue constante y el stock queda con las 4 unidades vendidas', eq(await L.K(ctx), k2) && eq(await L.stocks(ctx), consume(base2, { A: 4, B: 8, X: 4 })), await L.stocks(ctx))

  console.log('\n[registro] clones con decimales (F29)')
  const carne = await fixtureInsumo(ctx, 'carne 70 asig', 70, 150)
  const rotC = { [carne.ing]: 'C' }
  const rd = await enviar(maria, { mesa_id: mesa[5], items: [it(carne.prod, 3)] })
  const OD = rd.json.orden.id
  const lD = rd.json.items[0]
  const pd1 = await persona(OD, 'A')
  const pd2 = await persona(OD, 'B')
  const asd = await asignar(OD, [{ item_orden_id: lD.id, cantidad: 1, cuenta_persona_id: pd1 }, { item_orden_id: lD.id, cantidad: 1, cuenta_persona_id: pd2 }])
  const itsD = await itemsC(ctx, OD)
  const nums = {}
  for (const i of itsD) nums[i.cuenta === pd1 ? 'orig' : i.cuenta === pd2 ? 'b' : 'comp'] = (await neto(ctx, i.id, rotC)).C
  check('150 g al 70 % × 3 en 1+1+1: los clones 214,286 y 214,286 y la original recibe el resto 214,285; suma exacta 642,857', asd.status === 200 && casi(nums.b, 214.286, 0.00001) && casi(nums.comp, 214.286, 0.00001) && casi(nums.orig, 214.285, 0.00001) && casi(nums.orig + nums.b + nums.comp, 642.857, 0.00001), nums)
  await L.limpiarMesas(ctx, [5])
  check('borrar la orden devuelve exactamente 642,857 g (stock 3.000 otra vez)', casi(await stockIng(ctx, carne.ing), 3000, 0.00001), await stockIng(ctx, carne.ing))

  console.log('\n[registro] carrera: asignar contra el cobro parcial de la misma línea (3 rondas)')
  let malos = 0
  let ambos = 0
  for (let k = 0; k < 3; k++) {
    await L.reponer(ctx, { ...L.BIG, RP: 60 })
    const kk = await L.K(ctx)
    const rc = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR, 4)] })
    const OC = rc.json.orden.id
    const li = rc.json.items[0]
    const pc = await persona(OC, 'A')
    const m1 = await montoDe(ctx, OC, { item_partials: [{ id: li.id, cantidad: 1 }] })
    const asigna = () => asignar(OC, [{ item_orden_id: li.id, cantidad: 2, cuenta_persona_id: pc }])
    const paga = () => api(ctx.cajero, 'POST', '/api/pagos', { orden_id: OC, metodo: 'tarjeta', monto_esperado: m1, item_partials: [{ id: li.id, cantidad: 1 }] })
    const d = [0, 40, 120][k]
    const [a, b] = await Promise.all(k % 2 ? [asigna(), sleep(d).then(paga)] : [sleep(d).then(asigna), paga()])
    const total = (await itemsC(ctx, OC)).reduce((s, i) => s + i.cantidad, 0)
    const mal = await incoherentes(ctx, OC, { A: 1, B: 2 }, rot)
    if (a.status === 200 && b.status === 201) ambos++
    const algunoGana = a.status === 200 || b.status === 201
    if (!(algunoGana && [200, 409].includes(a.status) && [201, 409].includes(b.status) && total === 4 && mal.length === 0 && eq(await L.K(ctx), kk))) malos++
    await L.limpiarMesas(ctx)
  }
  check(`asignar y cobrar parcial en paralelo: gana al menos uno, el otro 409 explícito (ambos ${ambos}/3); unidades, registro por pieza y K siempre coherentes`, malos === 0, malos)
  await L.limpiarMesas(ctx)
  await L.reponer(ctx)
}

// Solo (`--modulo=registro`): las dos partes.
exports.correr = async function (ctx) {
  await exports.cortes(ctx)
  await exports.clones(ctx)
}
