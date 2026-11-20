/**
 * Módulo `cobro` (sesión 5): monto calculado por el servidor, efectivo con vuelto, tarjeta, propina,
 * descuento (sesión 12: prorrateo exacto, F17 y F25), cobro parcial por ítems y por cantidad, doble cobro, cobros simultáneos, roles y caja
 * cuadrada (cierre con diferencia 0). Si ya hay una caja abierta ajena, se omiten las partes de efectivo.
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'cobro'

exports.correr = async function (ctx) {
  const { f, mesa, admin, maria, carlos, ezio, db } = ctx
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const pagar = (ses, body) => api(ses, 'POST', '/api/pagos', body)
  const orden = async (n, items) => (await enviar(maria, { mesa_id: mesa[n], items })).json
  const montoServidor = async (id) => {
    const r = await pagar(carlos, { orden_id: id, metodo: 'tarjeta', monto_esperado: 1 })
    return r.status === 409 ? Number(r.json.monto_servidor) : null
  }
  const sinCaja = !ctx.cajaAjena
  let efectivoNeto = 0

  console.log('\n[cobro] sin caja abierta')
  if (sinCaja) {
    const o = await orden(2, [it(f.pP, 1)])
    const ef = await pagar(carlos, { orden_id: o.orden.id, metodo: 'efectivo', monto_esperado: 1500 })
    check('efectivo sin caja abierta → 409 CAJA_CERRADA', ef.status === 409 && ef.json.codigo === 'CAJA_CERRADA', ef)
    const tj = await pagar(carlos, { orden_id: o.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })
    check('tarjeta sin caja abierta → 201 y orden cerrada', tj.status === 201 && tj.json.orden_cerrada === true, tj)
  } else {
    check('(omitido: hay una caja abierta ajena, no se toca)', true)
  }

  let cajaId = null
  if (sinCaja) {
    const caja = await api(carlos, 'POST', '/api/caja', { fondo_inicial: 50000, notas: ctx.marca })
    cajaId = (caja.json.caja && caja.json.caja.id) || caja.json.id
    check('abrir caja con fondo 50.000', [200, 201].includes(caja.status) && !!cajaId, caja)
    check('abrir una segunda caja → 409', (await api(carlos, 'POST', '/api/caja', { fondo_inicial: 1 })).status === 409)
  }

  console.log('\n[cobro] efectivo, tarjeta, propina y descuento')
  if (sinCaja) {
    const o = await orden(3, [it(f.pP, 1)])
    const ef = await pagar(carlos, { orden_id: o.orden.id, metodo: 'efectivo', monto_esperado: 1500 })
    check('efectivo exacto (sin monto recibido): 201, vuelto 0, orden cerrada', ef.status === 201 && Number(ef.json.vuelto) === 0 && ef.json.orden_cerrada === true, ef)
    efectivoNeto += 1500
    const o2 = await orden(5, [it(f.pP, 2)])
    const ev = await pagar(carlos, { orden_id: o2.orden.id, metodo: 'efectivo', monto_esperado: 3000, efectivo_recibido: 5000 })
    check('efectivo con vuelto: 201 y vuelto 2000', ev.status === 201 && Number(ev.json.vuelto) === 2000, ev)
    efectivoNeto += 3000
    const o3 = await orden(6, [it(f.pP, 1)])
    const ei = await pagar(carlos, { orden_id: o3.orden.id, metodo: 'efectivo', monto_esperado: 1500, efectivo_recibido: 1000 })
    check('efectivo insuficiente → 4xx EFECTIVO_INSUFICIENTE', ei.status >= 400 && ei.json.codigo === 'EFECTIVO_INSUFICIENTE', ei)
    await L.cerrarOrden(ctx, o3.orden.id)
  }
  const op = await orden(7, [it(f.pP, 1)])
  const pr = await pagar(carlos, { orden_id: op.orden.id, metodo: 'tarjeta', monto_esperado: 1500, propina: { tipo: 'porcentaje', valor: 10 } })
  check('tarjeta con propina 10 %: 201 y propina 150', pr.status === 201 && Number(pr.json.propina) === 150, pr)
  const od = await orden(8, [it(f.pP, 2)])
  await api(admin, 'POST', '/api/descuentos', { orden_id: od.orden.id, tipo: 'porcentaje', valor: 10, motivo: ctx.marca })
  const ms = await montoServidor(od.orden.id)
  check('con descuento del 10 % el monto del servidor es 2700', ms === 2700, ms)
  check('cobro con ese monto: 201', (await pagar(carlos, { orden_id: od.orden.id, metodo: 'tarjeta', monto_esperado: ms })).status === 201)

  console.log('\n[cobro] parcial por ítems y por cantidad, cuentas divididas')
  const op2 = await orden(9, [it(f.pP, 2), it(f.pR, 1)])
  const [iP, iR] = op2.items
  const p1 = await pagar(carlos, { orden_id: op2.orden.id, metodo: 'tarjeta', monto_esperado: 1000, item_orden_ids: [iR.id] })
  check('pago parcial por ítem completo: 201 y la orden sigue abierta', p1.status === 201 && p1.json.orden_cerrada === false, p1)
  const p2 = await pagar(carlos, { orden_id: op2.orden.id, metodo: 'tarjeta', monto_esperado: 1500, item_partials: [{ id: iP.id, cantidad: 1 }] })
  check('pago parcial por cantidad (1 de 2): 201 y la orden sigue abierta', p2.status === 201 && p2.json.orden_cerrada === false, p2)
  const demas = await pagar(carlos, { orden_id: op2.orden.id, metodo: 'tarjeta', monto_esperado: 4500, item_partials: [{ id: (await L.itemsDe(ctx, op2.orden.id)).find((i) => !i.pagado).id, cantidad: 3 }] })
  check('cobrar de más (3 de una línea de 1) → rechazado con ITEM_INVALIDO', demas.status >= 400 && demas.json.codigo === 'ITEM_INVALIDO', demas)
  const p3 = await pagar(carlos, { orden_id: op2.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })
  check('cobrar el resto: 201 y la orden se cierra', p3.status === 201 && p3.json.orden_cerrada === true, p3)
  const od2 = await orden(10, [it(f.pP, 2), it(f.pR, 1)])
  const dv = await pagar(carlos, { orden_id: od2.orden.id, metodo: 'tarjeta', monto_esperado: 4000, dividido_en: 3 })
  const suma = Array.isArray(dv.json.cuotas) ? dv.json.cuotas.reduce((s, c) => s + Number(c), 0) : -1
  check('pago dividido en 3: 201 y las cuotas suman el total (la última absorbe el resto)', dv.status === 201 && dv.json.cuotas.length === 3 && suma === Number(dv.json.total_a_pagar), dv.json.cuotas)

  // ───── Sesión 12 (B4, F17, F25): el descuento se prorratea sobre lo vigente y la suma de los cobros es exacta ─────
  console.log('\n[cobro] B4: prorrateo del descuento (Σ pagos exacta)')
  const categoriaB4 = ((await api(admin, 'GET', '/api/productos')).json.find((p) => p.categoria) || {}).categoria
  ctx.limpiezaProd = ctx.limpiezaProd || []
  const preciosB4 = {}
  const prodPrecio = async (precio) => {
    if (!preciosB4[precio]) {
      const r = await api(admin, 'POST', '/api/productos', { nombre: `${ctx.marca} p${precio}`, categoria: categoriaB4, precio, descripcion: ctx.marca })
      if (r.status !== 200) throw new Error(`no se pudo crear el producto de ${precio} (${r.status})`)
      ctx.limpiezaProd.push(r.json.id)
      preciosB4[precio] = r.json.id
    }
    return preciosB4[precio]
  }
  const descuento = (ses, body) => api(ses, 'POST', '/api/descuentos', { motivo: ctx.marca, ...body })
  const SIN_ESPERADO = 99999999
  /** Cobra con tarjeta lo que dice el servidor para esa selección (probe 409 → pago). */
  const cobrarSel = async (O, sel = {}) => {
    const probe = await pagar(carlos, { orden_id: O, metodo: 'tarjeta', monto_esperado: SIN_ESPERADO, ...sel })
    if (probe.status !== 409 || probe.json.codigo !== 'MONTO_DISTINTO') return probe
    return pagar(carlos, { orden_id: O, metodo: 'tarjeta', monto_esperado: Number(probe.json.monto_servidor), ...sel })
  }
  const pagosDe = async (O) => db`SELECT monto::float AS m, descuento::float AS d FROM soda_master.pagos WHERE orden_id = ${O}::uuid ORDER BY created_at`
  const sumaM = (rows) => rows.reduce((t, r) => t + r.m, 0)
  const sumaD = (rows) => rows.reduce((t, r) => t + r.d, 0)
  const pendientesDe = async (O) => (await L.itemsDe(ctx, O)).filter((i) => !i.pagado).sort((a, b) => Number(b.precio_unitario) - Number(a.precio_unitario))
  const abrirB4 = async (n, items) => {
    const r = await enviar(maria, { mesa_id: mesa[n], items })
    return { O: r.json.orden.id, items: r.json.items }
  }
  const auditoriaCierre = async (O) => db`SELECT detalles FROM soda_master.auditoria_admin WHERE accion = 'cierre_orden_descuadre' AND entidad_id = ${O}::uuid`
  const p3333 = await prodPrecio(3333)
  const p1001 = await prodPrecio(1001)
  const p1000 = await prodPrecio(1000)
  const p4000 = await prodPrecio(4000)
  const p100 = await prodPrecio(100)
  const p5000 = await prodPrecio(5000)

  // cobro total con cada tipo de descuento
  let o = await abrirB4(2, [it(p3333, 1), it(p3333, 1), it(p3333, 1)])
  check('descuento porcentual 10 % se aplica (201)', (await descuento(admin, { orden_id: o.O, tipo: 'porcentaje', valor: 10 })).status === 201)
  let r = await cobrarSel(o.O)
  let pg = await pagosDe(o.O)
  check('porcentaje 10 % y cobro total: un pago de 9.999 − 1.000 = 8.999 y la orden cerrada', r.status === 201 && r.json.orden_cerrada === true && pg.length === 1 && sumaM(pg) === 8999 && sumaD(pg) === 1000, [r.status, pg])
  o = await abrirB4(3, [it(p1000, 1), it(p1000, 1), it(p1000, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 1000 })
  r = await cobrarSel(o.O)
  pg = await pagosDe(o.O)
  check('monto fijo 1.000 y cobro total: un pago de 3.000 − 1.000 = 2.000', r.status === 201 && sumaM(pg) === 2000 && sumaD(pg) === 1000, [r.status, pg])

  // parciales encadenados por ítems: antes la suma se desviaba en 1
  o = await abrirB4(5, [it(p3333, 1), it(p3333, 1), it(p3333, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'porcentaje', valor: 10 })
  for (const li of o.items) r = await cobrarSel(o.O, { item_orden_ids: [li.id] })
  pg = await pagosDe(o.O)
  check('10 % sobre 3 ítems de 3.333 cobrados uno por uno: Σ pagos = 8.999 exacta, Σ descuento = 1.000, orden cerrada', r.status === 201 && r.json.orden_cerrada === true && pg.length === 3 && sumaM(pg) === 8999 && sumaD(pg) === 1000, pg)
  check('ordenes.total coincide (8.999) y no hubo evento de descuadre', Number((await L.ordenRow(ctx, o.O)).total) === 8999 && (await auditoriaCierre(o.O)).length === 0)
  o = await abrirB4(6, [it(p1001, 1), it(p1001, 1), it(p1001, 1), it(p1001, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'porcentaje', valor: 15 })
  for (const li of o.items) r = await cobrarSel(o.O, { item_orden_ids: [li.id] })
  pg = await pagosDe(o.O)
  check('15 % sobre 4 ítems de 1.001 uno por uno: Σ pagos = 3.403 (4.004 − 601) exacta', r.status === 201 && sumaM(pg) === 3403 && sumaD(pg) === 601, pg)
  o = await abrirB4(7, [it(p1000, 1), it(p1000, 1), it(p1000, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 1000 })
  for (const li of o.items) r = await cobrarSel(o.O, { item_orden_ids: [li.id] })
  pg = await pagosDe(o.O)
  check('monto fijo 1.000 sobre 3 ítems de 1.000 uno por uno: Σ pagos = 2.000 exacta (antes 2.001)', r.status === 201 && sumaM(pg) === 2000 && sumaD(pg) === 1000, pg)

  // parciales por cantidad (se corta la línea)
  o = await abrirB4(8, [it(p1001, 4)])
  await descuento(admin, { orden_id: o.O, tipo: 'porcentaje', valor: 15 })
  for (let k = 0; k < 4; k++) {
    const pend = await pendientesDe(o.O)
    r = Number(pend[0].cantidad) === 1 ? await cobrarSel(o.O, { item_orden_ids: [pend[0].id] }) : await cobrarSel(o.O, { item_partials: [{ id: pend[0].id, cantidad: 1 }] })
  }
  pg = await pagosDe(o.O)
  check('15 % sobre 4 unidades de 1.001 cobradas de a una (cortes de línea): Σ pagos = 3.403 exacta y orden cerrada', r.status === 201 && r.json.orden_cerrada === true && pg.length === 4 && sumaM(pg) === 3403, pg)

  // F25: borrar un ítem sin pagar entre cobros
  o = await abrirB4(9, [it(p4000, 1), it(p4000, 1), it(p4000, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 3000 })
  const [A, B, C] = o.items
  await cobrarSel(o.O, { item_orden_ids: [A.id] })
  const delC = await api(maria, 'DELETE', '/api/items-orden', { id: C.id })
  r = await cobrarSel(o.O, { item_orden_ids: [B.id] })
  pg = await pagosDe(o.O)
  check('F25: fijo 3.000 sobre A, B y C de 4.000; cobro A, borro C, cobro B → Σ pagos = 5.000 exacta (antes 5.500) y orden cerrada', delC.status === 200 && r.status === 201 && r.json.orden_cerrada === true && sumaM(pg) === 5000 && sumaD(pg) === 3000, [delC.status, pg])
  check('F25: ordenes.total = 5.000 y sin evento de descuadre', Number((await L.ordenRow(ctx, o.O)).total) === 5000 && (await auditoriaCierre(o.O)).length === 0)

  // F20 + F25: borrar el último ítem sin pagar tras un cobro parcial → la orden queda con lo realmente cobrado
  o = await abrirB4(10, [it(p4000, 1), it(p4000, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 3000 })
  await cobrarSel(o.O, { item_orden_ids: [o.items[0].id] })
  const delUlt = await api(maria, 'DELETE', '/api/items-orden', { id: o.items[1].id })
  pg = await pagosDe(o.O)
  const ordCerrada = await L.ordenRow(ctx, o.O)
  const audF20 = await auditoriaCierre(o.O)
  check('F20/F25: borrar el último ítem sin pagar cierra la orden y ordenes.total = Σ pagos (2.500), con un evento de auditoría (total calculado 1.000)', delUlt.status === 200 && delUlt.json.orden_cerrada === true && ordCerrada.estado === 'pagado' && Number(ordCerrada.total) === sumaM(pg) && sumaM(pg) === 2500 && audF20.length === 1 && Number(audF20[0].detalles.total_calculado) === 1000 && Number(audF20[0].detalles.suma_pagos) === 2500, [delUlt.json, ordCerrada, pg, audF20])
  await L.limpiarMesas(ctx)

  // el descuento que se pierde por el tope del pago (documentado en el ROADMAP)
  o = await abrirB4(2, [it(p4000, 1), it(p100, 1), it(p4000, 1)])
  await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 3000 })
  const itA = o.items.find((x) => Number(x.precio_unitario) === 4000)
  const itB = o.items.find((x) => Number(x.precio_unitario) === 100)
  const itC = o.items.filter((x) => Number(x.precio_unitario) === 4000)[1]
  await cobrarSel(o.O, { item_orden_ids: [itA.id] })
  await api(maria, 'DELETE', '/api/items-orden', { id: itC.id })
  r = await cobrarSel(o.O, { item_orden_ids: [itB.id] })
  pg = await pagosDe(o.O)
  const audTope = await auditoriaCierre(o.O)
  check('tope: fijo 3.000 sobre A 4.000, B 100, C 4.000; cobro A, borro C, cobro B → A paga 2.519, B paga 0 (tope: su subtotal) y Σ pagos = 2.519', r.status === 201 && pg.length === 2 && pg[0].m === 2519 && pg[1].m === 0 && pg[1].d === 100 && sumaM(pg) === 2519, pg)
  check('tope: se pierden 1.419 de descuento; ordenes.total = Σ pagos (2.519) y queda el evento de auditoría (calculado 1.100)', 3000 - sumaD(pg) === 1419 && Number((await L.ordenRow(ctx, o.O)).total) === 2519 && audTope.length === 1 && Number(audTope[0].detalles.total_calculado) === 1100, [await L.ordenRow(ctx, o.O), audTope])
  await L.limpiarMesas(ctx)

  // descuento DESPUÉS de un cobro parcial
  o = await abrirB4(3, [it(p5000, 1), it(p5000, 1)])
  await cobrarSel(o.O, { item_orden_ids: [o.items[0].id] })
  const pctTarde = await descuento(admin, { orden_id: o.O, tipo: 'porcentaje', valor: 10 })
  check('porcentaje después de un cobro parcial → 409 ORDEN_CON_COBROS con el mensaje pedido, sin descuento guardado', pctTarde.status === 409 && pctTarde.json.codigo === 'ORDEN_CON_COBROS' && pctTarde.json.error === 'La orden ya tiene cobros; usa un descuento de monto fijo' && Number((await db`SELECT count(*)::int AS n FROM soda_master.descuentos WHERE orden_id = ${o.O}::uuid`)[0].n) === 0, pctTarde)
  const fijoTarde = await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 2000 })
  r = await cobrarSel(o.O, { item_orden_ids: [o.items[1].id] })
  pg = await pagosDe(o.O)
  check('monto fijo 2.000 después de cobrar A (5.000 sin descuento): se acepta y B paga 3.000; Σ pagos = 8.000 exacta', fijoTarde.status === 201 && r.status === 201 && pg.length === 2 && pg[0].m === 5000 && pg[1].m === 3000 && sumaM(pg) === 8000, [fijoTarde.status, pg])
  o = await abrirB4(5, [it(p5000, 1), it(p5000, 1)])
  await cobrarSel(o.O, { item_orden_ids: [o.items[0].id] })
  const cortTarde = await descuento(admin, { orden_id: o.O, tipo: 'cortesia_parcial', valor: 1000 })
  r = await cobrarSel(o.O, { item_orden_ids: [o.items[1].id] })
  pg = await pagosDe(o.O)
  check('cortesía parcial 1.000 después de un cobro parcial: se acepta y Σ pagos = 9.000 exacta', cortTarde.status === 201 && r.status === 201 && sumaM(pg) === 9000, [cortTarde.status, pg])
  await L.limpiarMesas(ctx)

  console.log('\n[cobro] F17: descuentos (validación, estados, permisos y carreras)')
  o = await abrirB4(6, [it(p1000, 2)])
  check('sin sesión → 401; cocina → 403', (await descuento(null, { orden_id: o.O, tipo: 'monto_fijo', valor: 100 })).status === 401 && (await descuento(ezio, { orden_id: o.O, tipo: 'monto_fijo', valor: 100 })).status === 403)
  const malos = await Promise.all([
    { orden_id: o.O, tipo: 'monto_fijo', valor: 100, aplicado_por: admin.id },
    { orden_id: o.O, tipo: 'regalo', valor: 100 },
    { orden_id: o.O, tipo: 'porcentaje', valor: 101 },
    { orden_id: o.O, tipo: 'monto_fijo', valor: -5 },
    { orden_id: o.O, tipo: 'monto_fijo', valor: '100' },
    { orden_id: 'no-es-uuid', tipo: 'monto_fijo', valor: 100 },
    { orden_id: o.O, tipo: 'monto_fijo', valor: 100, motivo: '' },
  ].map((b) => descuento(admin, b)))
  check('campo extra (aplicado_por), tipo inválido, porcentaje > 100, valor negativo o texto, orden_id inválido y motivo vacío → 400', malos.every((x) => x.status === 400), malos.map((x) => x.status))
  check('cortesía total sin autorización firmada → 403', (await descuento(admin, { orden_id: o.O, tipo: 'cortesia_total', valor: 0 })).status === 403)
  check('orden inexistente → 404', (await descuento(admin, { orden_id: L.UUID_FALSO, tipo: 'monto_fijo', valor: 100 })).status === 404)
  check('ningún intento inválido dejó un descuento', Number((await db`SELECT count(*)::int AS n FROM soda_master.descuentos WHERE orden_id = ${o.O}::uuid`)[0].n) === 0)
  await cobrarSel(o.O)
  const sobrePagada = await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 100 })
  check('descuento sobre una orden pagada → 409 ORDEN_NO_ACTIVA, sin descuento guardado', sobrePagada.status === 409 && sobrePagada.json.codigo === 'ORDEN_NO_ACTIVA' && Number((await db`SELECT count(*)::int AS n FROM soda_master.descuentos WHERE orden_id = ${o.O}::uuid`)[0].n) === 0, sobrePagada)
  o = await abrirB4(7, [it(p1000, 2)])
  await api(admin, 'POST', '/api/perdidas', { orden_id: o.O, motivo: ctx.marca })
  check('descuento sobre una orden perdida → 409 ORDEN_NO_ACTIVA', (await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 100 })).json.codigo === 'ORDEN_NO_ACTIVA')
  o = await abrirB4(8, [it(p1000, 1)])
  const re = await Promise.all([100, 200, 300].map((v, i) => sleep(i * 15).then(() => descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: v }))))
  const filas = await db`SELECT valor::float AS v FROM soda_master.descuentos WHERE orden_id = ${o.O}::uuid`
  const totOrd = Number((await L.ordenRow(ctx, o.O)).total)
  check('3 descuentos en paralelo sobre la misma orden: queda una sola fila y ordenes.total la refleja', re.every((x) => x.status === 201) && filas.length === 1 && totOrd === 1000 - filas[0].v, [re.map((x) => x.status), filas, totOrd])
  await L.limpiarMesas(ctx)

  console.log('\n[cobro] B4: cobros concurrentes con descuento y descuento en paralelo con un cobro (3 rondas)')
  let rondasOk = 0
  let rondasF17 = 0
  for (let k = 0; k < 3; k++) {
    o = await abrirB4(9, [it(p3333, 1), it(p3333, 1), it(p3333, 1)])
    await descuento(admin, { orden_id: o.O, tipo: 'porcentaje', valor: 10 })
    // cada línea la intentan cobrar 2 cajeros a la vez: nadie paga dos veces la misma línea
    const rs = await Promise.all(o.items.flatMap((li, i) => [0, 1].map((j) => sleep((i * 2 + j) * 12 * k).then(() => pagar(carlos, { orden_id: o.O, metodo: 'tarjeta', monto_esperado: 3000, item_orden_ids: [li.id] })))))
    let guardia = 0
    while ((await pendientesDe(o.O)).length > 0 && guardia++ < 6) await cobrarSel(o.O, { item_orden_ids: [(await pendientesDe(o.O))[0].id] })
    pg = await pagosDe(o.O)
    const unaVez = Number((await db`SELECT count(*)::int AS n FROM (SELECT pago_id FROM soda_master.items_orden WHERE orden_id = ${o.O}::uuid GROUP BY pago_id HAVING count(*) > 1) x`)[0].n) === 0
    if (pg.length === 3 && unaVez && sumaM(pg) === 8999 && sumaD(pg) === 1000 && (await L.ordenRow(ctx, o.O)).estado === 'pagado' && rs.some((x) => x.status === 201)) rondasOk++
    await L.limpiarMesas(ctx)

    // F17: un cambio de descuento en paralelo con el cobro de una línea
    o = await abrirB4(10, [it(p4000, 1), it(p4000, 1)])
    await descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 1000 })
    const [cobro1, desc2] = await Promise.all([
      pagar(carlos, { orden_id: o.O, metodo: 'tarjeta', monto_esperado: 3500, item_orden_ids: [o.items[0].id] }),
      sleep(10 * k).then(() => descuento(admin, { orden_id: o.O, tipo: 'monto_fijo', valor: 2000 })),
    ])
    let g2 = 0
    while ((await pendientesDe(o.O)).length > 0 && g2++ < 4) await cobrarSel(o.O, { item_orden_ids: [(await pendientesDe(o.O))[0].id] })
    pg = await pagosDe(o.O)
    const nDesc = Number((await db`SELECT count(*)::int AS n FROM soda_master.descuentos WHERE orden_id = ${o.O}::uuid`)[0].n)
    // un solo descuento y: o el cobro entró con el viejo (3.500) y el descuento nuevo dejó Σ = 6.000, o el cobro se rechazó (409) y todo se cobró con el nuevo
    if (desc2.status === 201 && nDesc === 1 && [201, 409].includes(cobro1.status) && sumaM(pg) === 6000 && sumaD(pg) === 2000) rondasF17++
    await L.limpiarMesas(ctx)
  }
  check(`3 cajeros por línea en paralelo con 10 %: sin doble cobro y Σ pagos = 8.999 exacta (${rondasOk}/3)`, rondasOk === 3)
  check(`cambio de descuento en paralelo con un cobro: un solo descuento y Σ pagos = 6.000 exacta (${rondasF17}/3)`, rondasF17 === 3)

  console.log('\n[cobro] doble cobro, monto manipulado y roles')
  const od3 = await orden(2, [it(f.pP, 1)])
  check('doble cobro → 409 ORDEN_YA_PAGADA', (await pagar(carlos, { orden_id: od3.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })).status === 201 && (await pagar(carlos, { orden_id: od3.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })).json.codigo === 'ORDEN_YA_PAGADA')
  const od4 = await orden(3, [it(f.pP, 1)])
  check('monto distinto (1 en vez de 1500) → 409 MONTO_DISTINTO con el monto del servidor', (await pagar(carlos, { orden_id: od4.orden.id, metodo: 'tarjeta', monto_esperado: 1 })).json.monto_servidor === 1500)
  check('mesero cobrando → 403; cocina → 403; sin sesión → 401', (await pagar(maria, { orden_id: od4.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })).status === 403 && (await pagar(ezio, { orden_id: od4.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })).status === 403 && (await pagar(null, { orden_id: od4.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })).status === 401)
  check('campos que ya no existen (monto, usuario_id) → 400', (await pagar(carlos, { orden_id: od4.orden.id, metodo: 'tarjeta', monto_esperado: 1500, monto: 5 })).status === 400 && (await pagar(carlos, { orden_id: od4.orden.id, metodo: 'tarjeta', monto_esperado: 1500, usuario_id: L.UUID_FALSO })).status === 400)
  check('orden inexistente → 4xx y sin crashear', (await pagar(carlos, { orden_id: L.UUID_FALSO, metodo: 'tarjeta', monto_esperado: 1500 })).status >= 400)
  console.log('\n[cobro] cobros simultáneos del mismo ítem (2 rondas)')
  let bien = 0
  let ordenSim = od4.orden.id
  for (let k = 0; k < 2; k++) {
    const rs = await Promise.all([0, 1, 2].map((i) => sleep(i * 25 * k).then(() => pagar(carlos, { orden_id: ordenSim, metodo: 'tarjeta', monto_esperado: 1500 }))))
    const ok = rs.filter((r) => r.status === 201).length
    const pagos = Number((await db`SELECT count(*)::int AS n FROM soda_master.pagos WHERE orden_id=${ordenSim}::uuid`)[0].n)
    if (ok === 1 && pagos === 1) bien++
    ordenSim = (await orden(3, [it(f.pP, 1)])).orden.id
  }
  check(`3 cobros simultáneos: gana exactamente uno y queda un solo pago (${bien}/2)`, bien === 2)
  await L.cerrarOrden(ctx, ordenSim)

  if (sinCaja && cajaId) {
    console.log('\n[cobro] cierre de caja cuadrado')
    const cierre = await api(carlos, 'POST', '/api/caja/cerrar', { caja_id: cajaId, efectivo_contado: 50000 + efectivoNeto, notas: ctx.marca })
    check('cierre con el efectivo exacto: esperado = fondo + efectivo − vuelto y diferencia 0', cierre.status === 200 && Number(cierre.json.diferencia) === 0 && Number(cierre.json.esperado) === 50000 + efectivoNeto, cierre.json)
  }
  await L.limpiarMesas(ctx)
}
