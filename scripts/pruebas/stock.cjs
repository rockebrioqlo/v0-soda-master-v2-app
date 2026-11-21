/**
 * Módulo `stock` (sesión 8: R7, #11, F10): descuento todo-o-nada, ráfagas paralelas, devolución al
 * borrar, cancelar y editar, merma de lo ya preparado, montos dentro de la transacción y carreras.
 * Invariante clave: K = stock + (ventas − devoluciones del registro) no cambia nunca por una operación.
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'stock'

exports.correr = async function (ctx) {
  const { f, mesa, admin, maria, carlos, ezio, db, MESAS } = ctx
  const extra = L.extraX(ctx)

  console.log('\n[stock] todo o nada')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx)
  let k0 = await L.K(ctx)
  const m0 = await L.movCount(ctx)
  const base = await L.stocks(ctx)
  const r3 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 1), it(f.pR, 1), it(f.pR, 99)] })
  check('3.er ítem sin stock: 409 STOCK_INSUFICIENTE con lo que falta', r3.status === 409 && r3.json.codigo === 'STOCK_INSUFICIENTE' && /faltan/.test(r3.json.error || ''), r3)
  check('no queda orden, el stock está intacto y no hay movimientos nuevos', (await L.activasMesa(ctx, 3)).length === 0 && eq(await L.stocks(ctx), base) && (await L.movCount(ctx)) === m0)
  const r4 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 1), it(f.pRP, 4)] })
  check('producto vendible sin stock después de los ingredientes: 409 y los ingredientes intactos', r4.status === 409 && eq(await L.stocks(ctx), base) && (await L.activasMesa(ctx, 3)).length === 0)
  const r4b = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 1), it(f.pRP, 2)] })
  const sh = await L.stocks(ctx)
  check('con stock alcanzante: descuenta ingredientes y producto (A 7, B 8, RP 1)', r4b.status === 200 && eq([sh.A, sh.B, sh.RP], [7, 8, 1]), sh)
  const filaProd = await db`SELECT count(*)::int AS n FROM soda_master.movimientos_inventario WHERE orden_id=${r4b.json.orden.id}::uuid AND ingrediente_id IS NULL AND producto_id=${f.pRP}::uuid AND tipo='venta'`
  check('el descuento del producto vendible queda en el registro; K constante', filaProd[0].n === 1 && eq(await L.K(ctx), k0))
  await L.limpiarMesas(ctx, [3])

  console.log('\n[stock] ráfagas paralelas (2 rondas)')
  for (const ronda of [1, 2]) {
    await L.limpiarMesas(ctx)
    await L.reponer(ctx)
    const kk = await L.K(ctx)
    const rs = await Promise.all(MESAS.map((n, i) => sleep(i * (ronda === 1 ? 0 : 40)).then(() => enviar(maria, { mesa_id: mesa[n], items: [it(f.pR)] }))))
    const ok = rs.filter((r) => r.status === 200).length
    const sin = rs.filter((r) => r.status === 409 && r.json.codigo === 'STOCK_INSUFICIENTE').length
    const sx = await L.stocks(ctx)
    check(`ronda ${ronda}: 8 envíos con stock para 5 → ganan 5 y 3 sin stock (${ok}/${sin}), A 5, B 0, nunca negativo`, ok === 5 && sin === 3 && sx.A === 5 && sx.B === 0, [rs.map((r) => r.status), sx])
    check(`ronda ${ronda}: K constante`, eq(await L.K(ctx), kk))
  }
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const kk2 = await L.K(ctx)
  const ob = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pR)] })
  const rp = await Promise.all(Array.from({ length: 4 }, (_, i) => sleep(i * 15).then(() => enviar(maria, { orden_id: ob.json.orden.id, items: [it(f.pR), it(f.pP)] }))))
  const okp = rp.filter((r) => r.status === 200).length
  const tot = await L.totalesOk(ctx, ob.json.orden.id)
  check(`4 altas paralelas a una orden: ${okp} ok, el resto 409 explícito (nunca 500)`, rp.every((r) => r.status === 200 || r.status === 409) && okp >= 3, rp.map((r) => r.status))
  check('ítems = 1 + 2 por alta exitosa; subtotal = suma de ítems; K constante', (await L.itemsDe(ctx, ob.json.orden.id)).length === 1 + 2 * okp && tot.ok && eq(await L.K(ctx), kk2), tot)
  await L.limpiarMesas(ctx)

  console.log('\n[stock] devolución y ajuste (F10) y montos dentro de la transacción')
  await L.reponer(ctx)
  const bs = await L.stocks(ctx)
  k0 = await L.K(ctx)
  const r = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 2), it(f.pR, 1, extra), it(f.pP, 2), it(f.pRP, 1)] })
  const O = r.json.orden.id
  const [i1, i2] = r.json.items
  let s = await L.stocks(ctx)
  check('tras enviar: A 6, B 4, X 9, P 4, RP 2', eq([s.A, s.B, s.X, s.P, s.RP], [6, 4, 9, 4, 2]), s)
  const d2 = await api(maria, 'DELETE', '/api/items-orden', { id: i2.id })
  s = await L.stocks(ctx)
  const t = await L.totalesOk(ctx, O)
  check('borrar el ítem con extra: A 7, B 6, X vuelve a 10; montos recalculados (7000)', d2.status === 200 && eq([s.A, s.B, s.X], [7, 6, 10]) && t.ok && t.total === 7000, [s, t])
  const e1 = await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, cantidad: 1 })
  s = await L.stocks(ctx)
  check('bajar cantidad 2→1 devuelve A 1 y B 2', e1.status === 200 && eq([s.A, s.B], [8, 8]), s)
  const e2 = await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, cantidad: 3 })
  s = await L.stocks(ctx)
  check('subir 1→3 descuenta A 2 y B 4; neto del ítem 9', e2.status === 200 && eq([s.A, s.B], [6, 4]) && (await L.netoItem(ctx, i1.id)).n === 9, s)
  const e3 = await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, cantidad: 100 })
  s = await L.stocks(ctx)
  check('subir sin stock: 409 STOCK_INSUFICIENTE y todo igual', e3.status === 409 && e3.json.codigo === 'STOCK_INSUFICIENTE' && eq([s.A, s.B], [6, 4]), e3)
  const conX = await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, notas_especiales: JSON.stringify({ ingredientesEspeciales: [{ id: f.ingX }] }) })
  s = await L.stocks(ctx)
  check('agregar un extra a un ítem ya enviado: X −3 y el precio sube a 1500', conX.status === 200 && s.X === 7 && Number(conX.json.precio_unitario) === 1500, [conX.status, s.X])
  const sinX = await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, notas_especiales: JSON.stringify({ ingredientesEspeciales: [] }) })
  s = await L.stocks(ctx)
  check('quitar el extra: X vuelve a 10 y el precio a 1000', sinX.status === 200 && s.X === 10 && Number(sinX.json.precio_unitario) === 1000)
  const op = await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, modificadores: ['Opcional de prueba'] })
  check('modificador opcional descuenta O ×3 y quitarlo lo devuelve', op.status === 200 && (await L.stocks(ctx)).O === 7 && (await api(maria, 'PATCH', '/api/items-orden', { id: i1.id, modificadores: [] })).status === 200 && (await L.stocks(ctx)).O === 10)
  check('montos = suma de ítems y K constante tras editar', (await L.totalesOk(ctx, O)).ok && eq(await L.K(ctx), k0))
  const dsc = await api(admin, 'POST', '/api/descuentos', { orden_id: O, tipo: 'porcentaje', valor: 10, motivo: ctx.marca })
  const add = await enviar(maria, { orden_id: O, items: [it(f.pP, 1)] })
  const mp = await api(carlos, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: 1 })
  check('con descuento del 10 %: el total de la orden = monto del servidor en Pagos', [200, 201].includes(dsc.status) && mp.status === 409 && Number(add.json.orden.total) === Number(mp.json.monto_servidor), [add.json.orden && add.json.orden.total, mp.json])
  await L.limpiarMesas(ctx, [2])
  check('al borrar la orden el stock vuelve exactamente a la base', eq(await L.stocks(ctx), bs) && eq(await L.K(ctx), k0), await L.stocks(ctx))

  const rc = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 2, extra), it(f.pR, 1)] })
  const [, c2] = rc.json.items
  await api(ezio, 'PATCH', '/api/items-orden', { id: c2.id, estado_item: 'en_preparacion' })
  const kc = await L.K(ctx)
  const sc = await L.stocks(ctx)
  const canc = await api(admin, 'PATCH', '/api/ordenes', { id: rc.json.orden.id, estado: 'cancelado', notas: ctx.marca })
  s = await L.stocks(ctx)
  check('cancelar devuelve el ítem pendiente y NO el que ya está en preparación', canc.status === 200 && s.A === sc.A + 2 && s.B === sc.B + 4 && s.X === sc.X + 2, [sc, s])
  const merma = await db`SELECT ingrediente_id::text AS i, cantidad::float AS q FROM soda_master.movimientos_inventario WHERE item_orden_id=${c2.id}::uuid AND tipo='merma'`
  check('lo ya preparado queda como movimiento merma (A 1, B 2); K constante', merma.length === 2 && eq(await L.K(ctx), kc), merma)
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const kc2 = await L.K(ctx)
  const rd = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pR, 2), it(f.pR, 1)] })
  const [x1] = rd.json.items
  await api(ezio, 'PATCH', '/api/items-orden', { id: x1.id, estado_item: 'en_preparacion' })
  const sd0 = await L.stocks(ctx)
  const del = await api(maria, 'DELETE', '/api/items-orden', { id: x1.id })
  const sd1 = await L.stocks(ctx)
  check('borrar un ítem en preparación: 200, el stock NO vuelve y queda merma', del.status === 200 && sd1.A === sd0.A && sd1.B === sd0.B, [sd0, sd1])
  const y1 = (await enviar(maria, { orden_id: rd.json.orden.id, items: [it(f.pR, 3)] })).json.items[0]
  await api(ezio, 'PATCH', '/api/items-orden', { id: y1.id, estado_item: 'en_preparacion' })
  const sy0 = await L.stocks(ctx)
  // Sesión 13 (F11): con la cocina preparando, el ítem ya no se edita (antes bajar no devolvía y subir descontaba la diferencia).
  const eb = await api(maria, 'PATCH', '/api/items-orden', { id: y1.id, cantidad: 1 })
  const es = await api(maria, 'PATCH', '/api/items-orden', { id: y1.id, cantidad: 4 })
  const sy1 = await L.stocks(ctx)
  check('ítem en preparación: bajar o subir la cantidad → 409 ITEM_YA_PREPARADO y el stock no se mueve', eb.status === 409 && es.status === 409 && eb.json.codigo === 'ITEM_YA_PREPARADO' && eq(sy1, sy0) && eq(await L.K(ctx), kc2), [eb.status, es.status, sy0, sy1])
  await L.limpiarMesas(ctx, [5])
  await L.reponer(ctx)
  const kb = await L.K(ctx)
  const bb = await L.stocks(ctx)
  const rm = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR, 2, extra), it(f.pP, 1), it(f.pRP, 1)] })
  check('el mesero borra su orden pendiente: stock exacto de vuelta', (await api(maria, 'DELETE', '/api/ordenes', { id: rm.json.orden.id })).status === 200 && eq(await L.stocks(ctx), bb) && eq(await L.K(ctx), kb))
  const srBase = await L.stocks(ctx)
  const krBase = await L.K(ctx)
  const rs = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pR, 2)] })
  const pa = await api(carlos, 'POST', '/api/pagos', { orden_id: rs.json.orden.id, metodo: 'tarjeta', monto_esperado: 1000, item_partials: [{ id: rs.json.items[0].id, cantidad: 1 }] })
  const resto = (await L.itemsDe(ctx, rs.json.orden.id)).find((i) => !i.pagado)
  const sr0 = await L.stocks(ctx)
  const ed = await api(maria, 'PATCH', '/api/items-orden', { id: resto.id, cantidad: 3 })
  const sr1 = await L.stocks(ctx)
  const dr = await api(maria, 'DELETE', '/api/items-orden', { id: resto.id })
  // Sesión 14b (F19): el resto de un cobro parcial lleva su parte del registro, así que editar y borrar sí mueven el stock (exacto).
  check('resto de un cobro parcial (F19, sesión 14b): subir 1→3 descuenta A 2 y B 4; borrarlo devuelve todo y queda solo la unidad cobrada (A 1, B 2); K constante',
    pa.status === 201 && ed.status === 200 && dr.status === 200 && eq([sr1.A, sr1.B], [sr0.A - 2, sr0.B - 4]) &&
      eq([(await L.stocks(ctx)).A, (await L.stocks(ctx)).B], [srBase.A - 1, srBase.B - 2]) && eq(await L.K(ctx), krBase), [pa.status, ed.status, dr.status, sr0, sr1])
  await L.cerrarOrden(ctx, rs.json.orden.id)
  await L.limpiarMesas(ctx)

  console.log('\n[stock] carreras (3 rondas cada una)')
  await L.reponer(ctx, L.BIG)
  let incons = 0, ambos = 0
  for (let k = 0; k < 3; k++) {
    const d = [0, 150, 350][k]
    await L.reponer(ctx, L.BIG)
    const kk = await L.K(ctx)
    const rr = await enviar(maria, { mesa_id: mesa[9], items: [it(f.pR, 2), it(f.pP, 1)] })
    const Ord = rr.json.orden.id
    const a = rr.json.items[0]
    const edita = () => api(maria, 'PATCH', '/api/items-orden', { id: a.id, cantidad: 5 })
    const borra = () => api(maria, 'DELETE', '/api/items-orden', { id: a.id })
    const [e, b] = await Promise.all(k % 2 ? [edita(), sleep(d).then(borra)] : [sleep(d).then(edita), borra()])
    const aDb = (await L.itemsDe(ctx, Ord)).find((i) => i.id === a.id)
    const neto = (await L.netoItem(ctx, a.id)).n
    const tt = await L.totalesOk(ctx, Ord)
    if (!((aDb ? neto === Number(aDb.cantidad) * 3 : neto === 0) && tt.ok && eq(await L.K(ctx), kk))) incons++
    if (e.status === 200 && b.status === 200) ambos++
    await L.limpiarMesas(ctx, [9])
  }
  check(`editar vs borrar el mismo ítem: stock, registro y montos siempre coherentes (ambas aplicadas en ${ambos})`, incons === 0, incons)
  await L.reponer(ctx, L.BIG)
  const b6 = await L.stocks(ctx)
  const k6 = await L.K(ctx)
  const ms = [2, 3, 5, 6, 7, 8]
  const creadas = await Promise.all(ms.map((n) => enviar(maria, { mesa_id: mesa[n], items: [it(f.pR, 2, extra), it(f.pP, 1)] })))
  const borradas = await Promise.all(creadas.map((x) => api(maria, 'DELETE', '/api/ordenes', { id: x.json.orden.id })))
  check('6 borrados paralelos con ingredientes compartidos: todos 200, sin deadlock, stock exacto', borradas.every((x) => x.status === 200) && eq(await L.stocks(ctx), b6) && eq(await L.K(ctx), k6), borradas.map((x) => x.status))
  let malo2 = 0
  for (let k = 0; k < 3; k++) {
    const d = [0, 600, 1300][k]
    const kk = await L.K(ctx)
    const bsn = await L.stocks(ctx)
    const rr = await enviar(maria, { mesa_id: mesa[10], items: [it(f.pR, 1)] })
    const Ord = rr.json.orden.id
    const agrega = () => enviar(maria, { orden_id: Ord, items: [it(f.pR, 1), it(f.pP, 1)] })
    const borra = () => api(maria, 'DELETE', '/api/ordenes', { id: Ord })
    const [, bo] = await Promise.all(k % 2 ? [agrega(), sleep(d).then(borra)] : [sleep(d).then(agrega), borra()])
    let ok = (await L.huerfanos(ctx)) === 0 && eq(await L.K(ctx), kk)
    if (bo.status === 200) ok = ok && !(await L.ordenRow(ctx, Ord)) && eq(await L.stocks(ctx), bsn)
    if (!ok) malo2++
    await L.limpiarMesas(ctx, [10])
  }
  check('enviar ítems vs borrar la orden: sin huérfanos ni stock a medias', malo2 === 0, malo2)

  // Sesión 14b (F19): el registro de stock se reparte cuando una línea se corta por un cobro parcial.
  await require('./registro-corte.cjs').cortes(ctx)

  // Sesión 11: unidad de compra y de consumo, factor por compra, rendimiento y ajuste de stock.
  await require('./unidades.cjs').correr(ctx)

  // Sesión 14c (F21): la merma de un ítem ya preparado que se borra o cancela queda en la tabla `mermas`.
  await require('./mermas-item.cjs').correr(ctx)
}
