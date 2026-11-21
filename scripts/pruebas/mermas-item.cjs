/**
 * Módulo `mermas` (sesión 14c, F21): la merma de un ítem YA PREPARADO (en preparación, listo, entregado o
 * en problema) que se borra o cuya orden se borra o cancela se anota en la tabla `mermas` (tipo
 * `item_preparado`, una fila por ítem), además del movimiento `merma` de `movimientos_inventario` que ya
 * existía (que ahora apunta a ella con `merma_id`). Antes solo existía el movimiento: la pantalla de Mermas
 * y sus reportes no la veían.
 *
 * Lo corre `stock.cjs` al final, y también solo (`--modulo=mermas`).
 * Invariantes: el stock NO vuelve por lo preparado y K = stock + neto del registro no cambia; una sola fila
 * por ítem (nunca duplicada, ni en carreras); lo pendiente devuelve stock y no deja merma; quién registra
 * sale de la sesión.
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'mermas'

const casi = (a, b, tol = 0.0004) => Math.abs(Number(a) - Number(b)) <= tol
const hoyYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
const TIPO = 'item_preparado'

exports.correr = async function (ctx) {
  const { f, mesa, admin, maria, carlos, ezio, db } = ctx
  const mermasDe = (ids) => db`
    SELECT id::text AS id, tipo, producto_id::text AS producto_id, ingrediente_id::text AS ingrediente_id,
           cantidad::float AS cantidad, descripcion, registrado_por::text AS registrado_por,
           responsable_id::text AS responsable_id, orden_id::text AS orden_id, item_orden_id::text AS item_orden_id
    FROM soda_master.mermas WHERE item_orden_id = ANY(${ids}::uuid[]) ORDER BY created_at, id`
  const mermasOrden = (O) => db`SELECT id::text AS id, item_orden_id::text AS item_orden_id FROM soda_master.mermas WHERE orden_id = ${O}::uuid`
  const movsMerma = (itemId) => db`
    SELECT ingrediente_id::text AS ing, producto_id::text AS prod, cantidad::float AS q, merma_id::text AS merma_id
    FROM soda_master.movimientos_inventario WHERE item_orden_id = ${itemId}::uuid AND tipo = 'merma'`
  const estado = async (ses, id, e) => (await api(ses, 'PATCH', '/api/items-orden', { id, estado_item: e })).status
  /** Lleva un ítem de pendiente a `listo` (cocina) o `entregado` (cocina y luego el mesero). */
  const llevar = async (id, hasta) => {
    const pasos = { en_preparacion: ['en_preparacion'], listo: ['en_preparacion', 'listo'], entregado: ['en_preparacion', 'listo', 'entregado'] }[hasta]
    for (const p of pasos) {
      if ((await estado(p === 'entregado' ? maria : ezio, id, p)) !== 200) return false
    }
    return true
  }
  const resumenHoy = async () => (await api(admin, 'GET', `/api/mermas/resumen?desde=${hoyYmd()}&hasta=${hoyYmd()}`)).json
  const porTipo = (r, tipo) => (r.por_tipo || []).find((t) => t.tipo === tipo) || { cantidad_registros: 0, unidades: 0, perdida_estimada: 0 }

  console.log('\n[mermas] borrar un ítem ya preparado: merma en la tabla, stock sin devolver')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const res0 = await resumenHoy()
  const base = await L.stocks(ctx)
  const k0 = await L.K(ctx)
  const r1 = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 2), it(f.pRP, 1), it(f.pP, 1), it(f.pR, 1)] })
  const O1 = r1.json.orden.id
  const [a1, a2, a3, a4] = r1.json.items
  const s1 = await L.stocks(ctx)
  const okEst = (await llevar(a1.id, 'en_preparacion')) && (await llevar(a2.id, 'listo')) && (await llevar(a3.id, 'entregado'))
  check('los ítems llegan a en preparación, listo y entregado', okEst)
  const d1 = await api(maria, 'DELETE', '/api/items-orden', { id: a1.id })
  const d2 = await api(maria, 'DELETE', '/api/items-orden', { id: a2.id })
  const d3 = await api(maria, 'DELETE', '/api/items-orden', { id: a3.id })
  check('borrar los 3 ítems preparados: 200 y el stock NO vuelve; K constante', d1.status === 200 && d2.status === 200 && d3.status === 200 && eq(await L.stocks(ctx), s1) && eq(await L.K(ctx), k0), [d1.status, d2.status, d3.status, await L.stocks(ctx), s1])
  const m1 = await mermasDe([a1.id, a2.id, a3.id, a4.id])
  const dm = (id) => m1.find((m) => m.item_orden_id === id)
  check('una fila de mermas por ítem preparado (3) y ninguna por el pendiente', m1.length === 3 && !dm(a4.id), m1)
  const x1 = dm(a1.id) || {}
  check('la del ítem en preparación: tipo item_preparado, producto, 2 unidades, orden e ítem de origen', x1.tipo === TIPO && x1.producto_id === f.pR && x1.cantidad === 2 && x1.orden_id === O1 && x1.item_orden_id === a1.id && x1.ingrediente_id === null, x1)
  check('quién registra es el usuario de la sesión (el mesero); sin responsable asignado', m1.every((m) => m.registrado_por === maria.id && m.responsable_id === null), m1)
  check('la descripción dice qué se perdió: "Ítem eliminado: 2 × <producto> (en preparación)"', /^Ítem eliminado: 2 × .*receta \(en preparación\)$/.test(x1.descripcion || ''), x1.descripcion)
  check('listo y entregado también: producto vendible y 1 unidad cada uno', (dm(a2.id) || {}).producto_id === f.pRP && (dm(a2.id) || {}).cantidad === 1 && (dm(a3.id) || {}).producto_id === f.pP && (dm(a3.id) || {}).cantidad === 1 && /\(listo\)/.test((dm(a2.id) || {}).descripcion || '') && /\(entregado\)/.test((dm(a3.id) || {}).descripcion || ''))
  const mv1 = await movsMerma(a1.id)
  const mv2 = await movsMerma(a2.id)
  const mv3 = await movsMerma(a3.id)
  check('el movimiento merma de stock sigue (A 2, B 4; A y producto; producto) y apunta a su merma con merma_id',
    mv1.length === 2 && mv1.every((x) => x.merma_id === x1.id) && mv2.length === 2 && mv2.every((x) => x.merma_id === (dm(a2.id) || {}).id) && mv3.length === 1 && mv3[0].merma_id === (dm(a3.id) || {}).id, [mv1, mv2, mv3])
  const dp = await api(maria, 'DELETE', '/api/items-orden', { id: a4.id })
  check('borrar el pendiente devuelve su stock y no crea merma', dp.status === 200 && (await mermasDe([a4.id])).length === 0 && eq(await L.K(ctx), k0))

  console.log('\n[mermas] listado y reportes')
  const hoy = hoyYmd()
  const lista = await api(admin, 'GET', `/api/mermas?tipo=${TIPO}&desde=${hoy}&hasta=${hoy}`)
  const filas = Array.isArray(lista.json) ? lista.json.filter((m) => [a1.id, a2.id, a3.id].includes(m.item_orden_id) || [x1.id, (dm(a2.id) || {}).id, (dm(a3.id) || {}).id].includes(m.id)) : []
  check('GET /api/mermas con el filtro del tipo nuevo las lista con producto, cantidad, registrado por y descripción', lista.status === 200 && filas.length === 3 && filas.every((m) => m.tipo === TIPO && m.producto_nombre && m.registrado_por_nombre && m.descripcion) && filas.find((m) => m.id === x1.id).cantidad === 2, lista.json && lista.json.length)
  const otro = await api(admin, 'GET', `/api/mermas?tipo=accidente&desde=${hoy}&hasta=${hoy}`)
  check('el filtro por otro tipo no las incluye y un tipo desconocido sigue dando 400', otro.status === 200 && !otro.json.some((m) => m.tipo === TIPO) && (await api(admin, 'GET', '/api/mermas?tipo=inexistente')).status === 400)
  const res1 = await resumenHoy()
  const pt0 = porTipo(res0, TIPO)
  const pt1 = porTipo(res1, TIPO)
  // pérdida estimada = unidades × precio de venta (pR 1000, pRP 2000, pP 1500): 2×1000 + 1×2000 + 1×1500
  check('el reporte suma 3 registros y 4 unidades del tipo nuevo; la pérdida estimada sube 5.500',
    res1.total.registros - res0.total.registros === 3 && pt1.cantidad_registros - pt0.cantidad_registros === 3 && casi(pt1.unidades - pt0.unidades, 4) && casi(pt1.perdida_estimada - pt0.perdida_estimada, 5500) && casi(res1.total.perdida_estimada - res0.total.perdida_estimada, 5500), [res0.total, res1.total, pt0, pt1])

  console.log('\n[mermas] no se crea a mano; el admin asigna responsable sin cambiar lo demás')
  const pm = await api(admin, 'POST', '/api/mermas', { tipo: TIPO, producto_id: f.pP, cantidad: 1, descripcion: ctx.marca })
  check('POST /api/mermas con el tipo item_preparado → 400', pm.status === 400, pm)
  const asg = await api(admin, 'PATCH', '/api/mermas/' + x1.id, { responsable_id: maria.id, consecuencia: 'solo_registro' })
  const trasAsg = ((await mermasDe([a1.id]))[0]) || {}
  check('PATCH del admin asigna responsable y consecuencia; tipo, producto, cantidad y origen no cambian', asg.status === 200 && trasAsg.responsable_id === maria.id && trasAsg.tipo === TIPO && trasAsg.cantidad === 2 && trasAsg.producto_id === f.pR && trasAsg.item_orden_id === a1.id, [asg.status, trasAsg])
  check('el mesero no puede asignar (403)', (await api(maria, 'PATCH', '/api/mermas/' + x1.id, { responsable_id: maria.id })).status === 403)
  await L.limpiarMesas(ctx, [2])

  console.log('\n[mermas] cancelar una orden con ítems pendientes y preparados mezclados')
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const kc = await L.K(ctx)
  const rc = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 1), it(f.pR, 2), it(f.pP, 1), it(f.pRP, 1)] })
  const OC = rc.json.orden.id
  const [c1, c2, c3, c4] = rc.json.items
  await llevar(c2.id, 'en_preparacion')
  await llevar(c3.id, 'listo')
  const sc0 = await L.stocks(ctx)
  const canc = await api(admin, 'PATCH', '/api/ordenes', { id: OC, estado: 'cancelado', notas: ctx.marca })
  const sc1 = await L.stocks(ctx)
  const mc = await mermasDe([c1.id, c2.id, c3.id, c4.id])
  check('cancelar: devuelve los 2 pendientes (A 2, B 2, RP 1) y NO los preparados; K constante', canc.status === 200 && sc1.A === sc0.A + 2 && sc1.B === sc0.B + 2 && sc1.RP === sc0.RP + 1 && eq(await L.K(ctx), kc), [sc0, sc1])
  check('quedan 2 mermas (en preparación 2 u y listo 1 u), una por ítem preparado y ninguna por los pendientes', mc.length === 2 && mc.some((m) => m.item_orden_id === c2.id && m.cantidad === 2 && m.producto_id === f.pR) && mc.some((m) => m.item_orden_id === c3.id && m.cantidad === 1 && m.producto_id === f.pP), mc)
  check('registrada por el admin de la sesión; la descripción lleva el texto "Orden cancelada"', mc.every((m) => m.registrado_por === admin.id && /^Orden cancelada: /.test(m.descripcion || '')), mc)
  check('sus movimientos merma apuntan a ellas', (await movsMerma(c2.id)).every((x) => x.merma_id === (mc.find((m) => m.item_orden_id === c2.id) || {}).id) && (await movsMerma(c3.id)).every((x) => x.merma_id === (mc.find((m) => m.item_orden_id === c3.id) || {}).id))

  console.log('\n[mermas] borrar una orden con varios ítems preparados y uno pendiente')
  const kd = await L.K(ctx)
  const rd = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pR, 1), it(f.pR, 3), it(f.pP, 2), it(f.pP, 1)] })
  const OD = rd.json.orden.id
  const [e1, e2, e3, e4] = rd.json.items
  await llevar(e1.id, 'en_preparacion')
  await llevar(e2.id, 'listo')
  await llevar(e3.id, 'entregado')
  const sd0 = await L.stocks(ctx)
  const delO = await api(admin, 'DELETE', '/api/ordenes', { id: OD })
  const sd1 = await L.stocks(ctx)
  const md = await mermasDe([e1.id, e2.id, e3.id, e4.id])
  check('borrar la orden (admin): 200, solo vuelve el pendiente (P 1) y K constante', delO.status === 200 && sd1.P === sd0.P + 1 && sd1.A === sd0.A && sd1.B === sd0.B && eq(await L.K(ctx), kd), [sd0, sd1])
  check('hay una merma por cada ítem preparado (1, 3 y 2 unidades) aunque la orden y los ítems ya no existen; ninguna por el pendiente',
    md.length === 3 && [[e1.id, 1], [e2.id, 3], [e3.id, 2]].every(([id, q]) => (md.find((m) => m.item_orden_id === id) || {}).cantidad === q) && md.every((m) => m.orden_id === OD && /^Orden borrada por el administrador: /.test(m.descripcion || '')), md)

  console.log('\n[mermas] sin ítems preparados no hay merma')
  const kn = await L.K(ctx)
  const rn = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR, 1), it(f.pP, 1)] })
  const ON = rn.json.orden.id
  const rn2 = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pR, 1), it(f.pP, 1)] })
  const ON2 = rn2.json.orden.id
  const rn3 = await enviar(maria, { mesa_id: mesa[8], items: [it(f.pR, 1), it(f.pP, 1)] })
  const ON3 = rn3.json.orden.id
  const dn = await api(maria, 'DELETE', '/api/ordenes', { id: ON })
  const cn = await api(admin, 'PATCH', '/api/ordenes', { id: ON2, estado: 'cancelado', notas: ctx.marca })
  const din = await api(maria, 'DELETE', '/api/items-orden', { id: rn3.json.items[0].id })
  check('borrar una orden, cancelar otra y borrar un ítem, todo pendiente: 200 y ninguna merma', dn.status === 200 && cn.status === 200 && din.status === 200 && (await mermasOrden(ON)).length === 0 && (await mermasOrden(ON2)).length === 0 && (await mermasOrden(ON3)).length === 0 && eq(await L.K(ctx), kn), [dn.status, cn.status, din.status])
  await L.limpiarMesas(ctx)

  console.log('\n[mermas] resto de un cobro parcial y clones de una asignación, ya preparados')
  await L.reponer(ctx, { ...L.BIG, RP: 60 })
  const kr = await L.K(ctx)
  const sr0 = await L.stocks(ctx)
  const rr = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR, 3)] })
  const OR = rr.json.orden.id
  const ir = rr.json.items[0]
  await llevar(ir.id, 'en_preparacion')
  const probe = await api(carlos, 'POST', '/api/pagos', { orden_id: OR, metodo: 'tarjeta', monto_esperado: 99999999, item_partials: [{ id: ir.id, cantidad: 1 }] })
  const cob = await api(carlos, 'POST', '/api/pagos', { orden_id: OR, metodo: 'tarjeta', monto_esperado: Number(probe.json.monto_servidor), item_partials: [{ id: ir.id, cantidad: 1 }] })
  const resto = (await L.itemsDe(ctx, OR)).find((i) => !i.pagado)
  const dr = await api(maria, 'DELETE', '/api/items-orden', { id: resto.id })
  const mr = await mermasDe([resto.id])
  check('el resto (2 de 3 unidades, ya en preparación) borrado deja UNA merma de 2 unidades; K y stock sin devolver', cob.status === 201 && dr.status === 200 && mr.length === 1 && mr[0].cantidad === 2 && mr[0].producto_id === f.pR && eq(await L.K(ctx), kr) && eq(await L.stocks(ctx), { ...sr0, A: sr0.A - 3, B: sr0.B - 6 }), [cob.status, dr.status, mr])
  await L.limpiarMesas(ctx, [6])
  const sa0 = await L.stocks(ctx)
  const ra = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pR, 4)] })
  const OA = ra.json.orden.id
  const lin = ra.json.items[0]
  const persona = async (nombre) => {
    const p = await api(maria, 'POST', '/api/cuentas-persona', { orden_id: OA, nombre })
    return p.json && (p.json.id || (p.json.persona && p.json.persona.id))
  }
  const pa = await persona('A')
  const pb = await persona('B')
  const as = await api(maria, 'POST', '/api/cuentas-persona/asignaciones', { orden_id: OA, asignaciones: [{ item_orden_id: lin.id, cantidad: 1, cuenta_persona_id: pa }, { item_orden_id: lin.id, cantidad: 1, cuenta_persona_id: pb }] })
  const piezas = await L.itemsDe(ctx, OA)
  const clonB = piezas.find((i) => i.id !== lin.id && Number(i.cantidad) === 1)
  const clonC = piezas.find((i) => i.id !== lin.id && Number(i.cantidad) === 2)
  await llevar(clonB.id, 'listo')
  await llevar(clonC.id, 'en_preparacion')
  const kA = await L.K(ctx)
  const dB = await api(maria, 'DELETE', '/api/items-orden', { id: clonB.id })
  const dC = await api(maria, 'DELETE', '/api/items-orden', { id: clonC.id })
  const dOrig = await api(maria, 'DELETE', '/api/items-orden', { id: lin.id })
  const ma = await mermasDe([lin.id, clonB.id, clonC.id])
  check('clones preparados (1 u y 2 u) borrados dejan una merma cada uno; la original pendiente devuelve stock y no deja merma',
    as.status === 200 && dB.status === 200 && dC.status === 200 && dOrig.status === 200 && ma.length === 2 && (ma.find((m) => m.item_orden_id === clonB.id) || {}).cantidad === 1 && (ma.find((m) => m.item_orden_id === clonC.id) || {}).cantidad === 2 && eq(await L.K(ctx), kA), [as.status, ma])
  check('el stock de lo preparado no volvió (A −3, B −6 respecto del inicio)', eq(await L.stocks(ctx), { ...sa0, A: sa0.A - 3, B: sa0.B - 6 }), [sa0, await L.stocks(ctx)])
  await L.limpiarMesas(ctx)

  console.log('\n[mermas] cantidades con decimales: el registro de stock no se redondea')
  const { fixtureInsumo } = require('./registro-corte.cjs')
  const carne = await fixtureInsumo(ctx, 'carne 70 merma', 70, 150)
  const rdec = await enviar(maria, { mesa_id: mesa[8], items: [it(carne.prod, 3)] })
  const idec = rdec.json.items[0]
  await llevar(idec.id, 'en_preparacion')
  const sIng = async () => Number((await db`SELECT stock_actual::float AS s FROM soda_master.ingredientes WHERE id = ${carne.ing}::uuid`)[0].s)
  const sBefore = await sIng()
  const ddec = await api(maria, 'DELETE', '/api/items-orden', { id: idec.id })
  const mdec = await mermasDe([idec.id])
  const mvd = await movsMerma(idec.id)
  check('150 g al 70 % × 3 = 642,857 g: el movimiento merma lo guarda con 3 decimales y apunta a la merma de 3 unidades; el stock no vuelve',
    ddec.status === 200 && mdec.length === 1 && mdec[0].cantidad === 3 && mvd.length === 1 && casi(mvd[0].q, 642.857) && mvd[0].merma_id === mdec[0].id && casi(await sIng(), sBefore), [ddec.status, mdec, mvd])
  await L.limpiarMesas(ctx)

  console.log('\n[mermas] el listado muestra el nombre del insumo en las mermas de insumos (antes "—")')
  const ing = await api(admin, 'POST', '/api/ingredientes', { nombre: `${ctx.marca} insumo merma`, stock_actual: 5, unidad_medida: 'unidad', costo_unitario: 100 })
  ctx.limpiezaIng = ctx.limpiezaIng || []
  if (ing.status === 201) ctx.limpiezaIng.push(ing.json.id)
  const baja = await api(admin, 'DELETE', '/api/ingredientes/' + ing.json.id, { motivo: 'merma', motivo_merma: 'accidente', descripcion: ctx.marca, cantidad: 2 })
  const lst = await api(admin, 'GET', `/api/mermas?tipo=accidente&desde=${hoy}&hasta=${hoy}`)
  const filaIng = (Array.isArray(lst.json) ? lst.json : []).find((m) => m.ingrediente_id === ing.json.id)
  check('la merma del insumo trae su nombre (ingrediente_nombre) y la cantidad; sin producto', baja.status === 200 && !!filaIng && /insumo merma$/.test(filaIng.ingrediente_nombre || '') && filaIng.producto_id === null && filaIng.cantidad === 2, [baja.status, filaIng])

  console.log('\n[mermas] carreras (3 rondas)')
  let malA = 0
  let malB = 0
  let malC = 0
  for (let k = 0; k < 3; k++) {
    const d = [0, 80, 200][k]
    await L.reponer(ctx, { ...L.BIG, RP: 60 })
    // (a) dos borrados paralelos del mismo ítem preparado: gana uno, una sola merma
    {
      const kk = await L.K(ctx)
      const rx = await enviar(maria, { mesa_id: mesa[9], items: [it(f.pR, 2), it(f.pP, 1)] })
      const [p1] = rx.json.items
      await llevar(p1.id, 'en_preparacion')
      const sx = await L.stocks(ctx)
      const borra = () => api(maria, 'DELETE', '/api/items-orden', { id: p1.id })
      const [u, v] = await Promise.all([borra(), sleep(d).then(borra)])
      const est = [u.status, v.status].sort((a, b) => a - b)
      const mm = await mermasDe([p1.id])
      if (!(est[0] === 200 && est[1] !== 200 && est[1] < 500 && mm.length === 1 && mm[0].cantidad === 2 && eq(await L.stocks(ctx), sx) && eq(await L.K(ctx), kk))) malA++
      await L.limpiarMesas(ctx, [9])
    }
    // (b) cancelar la orden contra borrar uno de sus ítems preparados: una fila por ítem, nunca dos
    {
      const kk = await L.K(ctx)
      const rx = await enviar(maria, { mesa_id: mesa[10], items: [it(f.pR, 1), it(f.pR, 2)] })
      const OX = rx.json.orden.id
      const [q1, q2] = rx.json.items
      await llevar(q1.id, 'en_preparacion')
      await llevar(q2.id, 'listo')
      const cancela = () => api(admin, 'PATCH', '/api/ordenes', { id: OX, estado: 'cancelado', notas: ctx.marca })
      const borra = () => api(maria, 'DELETE', '/api/items-orden', { id: q1.id })
      const [u, v] = await Promise.all(k % 2 ? [borra(), sleep(d).then(cancela)] : [sleep(d).then(borra), cancela()])
      const mm = await mermasOrden(OX)
      const unicos = new Set(mm.map((m) => m.item_orden_id))
      const cancelo = v.status === 200 // u = el borrado, v = la cancelación (en cualquier orden de llegada)
      // si canceló, están las dos (la del ítem borrado antes o por la cancelación); si no, nada se perdió a medias
      if (!(cancelo && mm.length === 2 && unicos.size === 2 && unicos.has(q2.id) && unicos.has(q1.id) && eq(await L.K(ctx), kk))) malB++
      await L.limpiarMesas(ctx, [10])
    }
    // (c) cobro parcial contra borrado del mismo ítem preparado: o se cobra (sin merma) o se borra (una merma)
    {
      const kk = await L.K(ctx)
      const rx = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 2)] })
      const OX = rx.json.orden.id
      const [q1] = rx.json.items
      await llevar(q1.id, 'en_preparacion')
      const pr = await api(carlos, 'POST', '/api/pagos', { orden_id: OX, metodo: 'tarjeta', monto_esperado: 99999999 })
      const monto = Number(pr.json.monto_servidor)
      const cobra = () => api(carlos, 'POST', '/api/pagos', { orden_id: OX, metodo: 'tarjeta', monto_esperado: monto })
      const borra = () => api(maria, 'DELETE', '/api/items-orden', { id: q1.id })
      const [u, v] = await Promise.all(k % 2 ? [borra(), sleep(d).then(cobra)] : [sleep(d).then(borra), cobra()])
      const borrado = u.status === 200 // u = el borrado, v = el cobro (en cualquier orden de llegada)
      const cobrado = v.status === 201
      const mm = await mermasDe([q1.id])
      if (!((borrado !== cobrado) && mm.length === (borrado ? 1 : 0) && eq(await L.K(ctx), kk))) malC++
      await L.limpiarMesas(ctx, [2])
    }
  }
  check('borrar dos veces el mismo ítem preparado: gana uno y queda una sola merma (3 rondas)', malA === 0, malA)
  check('cancelar la orden contra borrar un ítem preparado: una merma por ítem, sin duplicar (3 rondas)', malB === 0, malB)
  check('cobrar contra borrar el mismo ítem preparado: o se cobra sin merma o se borra con una sola (3 rondas)', malC === 0, malC)
  await L.limpiarMesas(ctx)
  await L.reponer(ctx)
}
