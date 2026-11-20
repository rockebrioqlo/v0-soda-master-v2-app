/**
 * Módulo `cobro` (sesión 5): monto calculado por el servidor, efectivo con vuelto, tarjeta, propina,
 * descuento, cobro parcial por ítems y por cantidad, doble cobro, cobros simultáneos, roles y caja
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
