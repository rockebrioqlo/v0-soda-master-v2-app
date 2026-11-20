/**
 * Módulo `ordenes` (sesiones 6 y 8): envío atómico de comandas, validaciones, roles y estados,
 * reglas de PATCH y DELETE, B1 (apertura de mesa), pestaña vieja y carrera borrar ítem vs cobro.
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'ordenes'

exports.correr = async function (ctx) {
  const { f, mesa, admin, maria, carlos, ezio, db } = ctx
  const extra = L.extraX(ctx)
  console.log('\n[ordenes] envío atómico de la comanda (#11)')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx)
  let k0 = await L.K(ctx)
  const r1 = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 2), it(f.pR, 1, extra), it(f.pP, 2)] })
  check('comanda nueva con 3 ítems: 200', r1.status === 200, r1)
  const o1 = r1.json.orden
  const its1 = r1.json.items
  check('orden en_cocina, enviada, con hora de envío', o1.estado === 'en_cocina' && o1.enviado_a_cocina === true && !!o1.hora_envio, o1)
  check('3 ítems pendientes en el orden enviado', its1.length === 3 && its1.every((i) => i.estado_item === 'pendiente') && its1[0].cantidad === 2 && its1[2].cantidad === 2)
  check('precios del servidor (1000, 1500 con extra, 1500)', [1000, 1500, 1500].every((p, i) => Number(its1[i].precio_unitario) === p), its1.map((i) => i.precio_unitario))
  check('subtotal y total = 6500', Number(o1.subtotal) === 6500 && Number(o1.total) === 6500, o1)
  let s = await L.stocks(ctx)
  check('stock descontado: A 7, B 4, X 9, producto 4', eq([s.A, s.B, s.X, s.P], [7, 4, 9, 4]), s)
  check('registro del ítem con extra: A1 + B2 + X1', eq(await L.netoItem(ctx, its1[1].id), { n: 4, c: 3 }))
  check('invariante K (stock + registro) constante', eq(await L.K(ctx), k0))
  const r2 = await enviar(maria, { orden_id: o1.id, items: [it(f.pR, 1)] })
  check('agregar a la orden existente: 200 y total 7500', r2.status === 200 && Number(r2.json.orden.total) === 7500, r2)
  await L.limpiarMesas(ctx, [2])

  console.log('\n[ordenes] validaciones, roles y estados')
  await L.reponer(ctx)
  const base = await L.stocks(ctx)
  const m0 = await L.movCount(ctx)
  const casos = [
    ['campo extra (precio_unitario) → 400', { mesa_id: mesa[5], items: [{ ...it(f.pR), precio_unitario: 1 }] }, 400],
    ['campo extra en el body (usuario_id) → 400', { mesa_id: mesa[5], usuario_id: L.UUID_FALSO, items: [it(f.pR)] }, 400],
    ['monto en el body (total) → 400', { mesa_id: mesa[5], total: 5, items: [it(f.pR)] }, 400],
    ['mesa y orden a la vez → 400', { mesa_id: mesa[5], orden_id: L.UUID_FALSO, items: [it(f.pR)] }, 400],
    ['sin mesa ni orden → 400', { items: [it(f.pR)] }, 400],
    ['items vacío → 400', { mesa_id: mesa[5], items: [] }, 400],
    ['cantidad 0 → 400', { mesa_id: mesa[5], items: [it(f.pR, 0)] }, 400],
    ['cantidad decimal → 400', { mesa_id: mesa[5], items: [it(f.pR, 1.5)] }, 400],
    ['producto_id no uuid → 400', { mesa_id: mesa[5], items: [it('hola')] }, 400],
    ['producto inexistente → 404', { mesa_id: mesa[5], items: [it(L.UUID_FALSO)] }, 404],
    ['mesa inexistente → 404', { mesa_id: L.UUID_FALSO, items: [it(f.pR)] }, 404],
    ['orden inexistente → 404', { orden_id: L.UUID_FALSO, items: [it(f.pR)] }, 404],
    ['extra no válido → 400', { mesa_id: mesa[5], items: [it(f.pR, 1, { extras_ingredientes: [{ ingrediente_id: L.UUID_FALSO, cantidad: 1 }] })] }, 400],
  ]
  for (const [nombre, body, st] of casos) check(nombre, (await enviar(maria, body)).status === st, nombre)
  const sv = await L.stocks(ctx)
  check('ninguna validación tocó el stock, dejó movimientos ni órdenes', eq(sv, base) && (await L.movCount(ctx)) === m0 && (await L.activasMesa(ctx, 5)).length === 0)
  check('cocina → 403', (await enviar(ezio, { mesa_id: mesa[5], items: [it(f.pR)] })).status === 403)
  check('sin sesión → 401', (await enviar(null, { mesa_id: mesa[5], items: [it(f.pR)] })).status === 401)
  const rc = await enviar(carlos, { mesa_id: mesa[5], items: [it(f.pR)] })
  check('cajero sin permiso de apertura → 403 PERMISO_APERTURA_MESA (200 si tiene permiso vigente)', (rc.status === 403 && rc.json.codigo === 'PERMISO_APERTURA_MESA') || rc.status === 200, rc)
  await L.limpiarMesas(ctx, [5])
  const rcx = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pR)] })
  const cancel = await api(admin, 'PATCH', '/api/ordenes', { id: rcx.json.orden.id, estado: 'cancelado', notas: ctx.marca })
  const rcan = await enviar(maria, { orden_id: rcx.json.orden.id, items: [it(f.pR)] })
  check('agregar a una orden cancelada → 409 ORDEN_NO_ACTIVA', cancel.status === 200 && rcan.status === 409 && rcan.json.codigo === 'ORDEN_NO_ACTIVA', [cancel.status, rcan])
  check('cancelar devolvió el stock del ítem pendiente', eq(await L.stocks(ctx), base))
  const rpg = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR)] })
  const pago = await api(carlos, 'POST', '/api/pagos', { orden_id: rpg.json.orden.id, metodo: 'tarjeta', monto_esperado: 1000 })
  check('agregar a una orden pagada → 409', pago.status === 201 && (await enviar(maria, { orden_id: rpg.json.orden.id, items: [it(f.pR)] })).status === 409)

  console.log('\n[ordenes] PATCH y DELETE por rol (sesión 6)')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const ro = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pP, 2)] })
  const O = ro.json.orden.id
  const itemP = ro.json.items[0]
  const parchar = (ses, body) => api(ses, 'PATCH', '/api/ordenes', body)
  check('mesero cambiando el total → 400', (await parchar(maria, { id: O, total: 5 })).status === 400)
  check('mesero fijando estado pagado → 400', (await parchar(maria, { id: O, estado: 'pagado' })).status === 400)
  check('mesero pidiendo estado listo → 403', (await parchar(maria, { id: O, estado: 'listo' })).status === 403)
  check('cocina pasa la orden a en_preparacion → 200', (await parchar(ezio, { id: O, estado: 'en_preparacion' })).status === 200)
  check('cocina cancelando → 403 y mesero cancelando → 403', (await parchar(ezio, { id: O, estado: 'cancelado', notas: 'x' })).status === 403 && (await parchar(maria, { id: O, estado: 'cancelado', notas: 'x' })).status === 403)
  check('admin cancelando sin motivo → 400', (await parchar(admin, { id: O, estado: 'cancelado' })).status === 400)
  check('ítem con campo extra → 400', (await api(maria, 'PATCH', '/api/items-orden', { id: itemP.id, foo: 1 })).status === 400)
  check('precio manual: mesero 403', (await api(maria, 'PATCH', '/api/items-orden', { id: itemP.id, precio_manual: true, precio_unitario: 10, motivo: 'x' })).status === 403)
  check('precio manual: admin sin motivo → 400', (await api(admin, 'PATCH', '/api/items-orden', { id: itemP.id, precio_manual: true, precio_unitario: 10 })).status === 400)
  const pm = await api(admin, 'PATCH', '/api/items-orden', { id: itemP.id, precio_manual: true, precio_unitario: 1777, motivo: ctx.marca })
  check('precio manual: admin con motivo → 200 y total recalculado', pm.status === 200 && Number(pm.json.precio_unitario) === 1777 && (await L.totalesOk(ctx, O)).subtotal === 3554)
  check('cocina cambiando cantidad → 403; cambiando estado del ítem → 200', (await api(ezio, 'PATCH', '/api/items-orden', { id: itemP.id, cantidad: 5 })).status === 403 && (await api(ezio, 'PATCH', '/api/items-orden', { id: itemP.id, estado_item: 'en_preparacion' })).status === 200)
  const px = await api(carlos, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: 1777, item_partials: [{ id: itemP.id, cantidad: 1 }] })
  const pagadoItem = (await L.itemsDe(ctx, O)).find((i) => i.pagado)
  check('cobro parcial de 1 unidad: 201', px.status === 201 && !!pagadoItem, px)
  check('ítem pagado intocable: editar y borrar → 409', (await api(maria, 'PATCH', '/api/items-orden', { id: pagadoItem.id, cantidad: 9 })).status === 409 && (await api(maria, 'DELETE', '/api/items-orden', { id: pagadoItem.id })).status === 409)
  check('orden con ítem pagado: cancelar y borrar → 409', (await parchar(admin, { id: O, estado: 'cancelado', notas: ctx.marca })).status === 409 && (await api(admin, 'DELETE', '/api/ordenes', { id: O })).status === 409)
  await L.cerrarOrden(ctx, O)
  await L.limpiarMesas(ctx)

  const rb = await enviar(admin, { mesa_id: mesa[3], items: [it(f.pP)] })
  check('DELETE de una orden ajena (mesero) → 403', (await api(maria, 'DELETE', '/api/ordenes', { id: rb.json.orden.id })).status === 403)
  const rc2 = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pP)] })
  await api(ezio, 'PATCH', '/api/items-orden', { id: rc2.json.items[0].id, estado_item: 'en_preparacion' })
  check('DELETE con cocina ya preparando: mesero 409, admin 200', (await api(maria, 'DELETE', '/api/ordenes', { id: rc2.json.orden.id })).status === 409 && (await api(admin, 'DELETE', '/api/ordenes', { id: rc2.json.orden.id })).status === 200)
  check('DELETE: cocina 403, sin sesión 401, id inválido 400, inexistente 404', (await api(ezio, 'DELETE', '/api/ordenes', { id: rb.json.orden.id })).status === 403 && (await api(null, 'DELETE', '/api/ordenes', { id: rb.json.orden.id })).status === 401 && (await api(admin, 'DELETE', '/api/ordenes', { id: 'hola' })).status === 400 && (await api(admin, 'DELETE', '/api/ordenes', { id: L.UUID_FALSO })).status === 404)
  await L.limpiarMesas(ctx)

  console.log('\n[ordenes] B1: apertura de mesa')
  const lo = await api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[2], estado: 'en_cocina', notas: ctx.marca })
  const lb = await api(admin, 'POST', '/api/ordenes', { mesa_id: mesa[2], estado: 'en_cocina' })
  check('abrir la misma mesa sobre una orden vacía recién creada → 409 COMANDA_ACTIVA', lo.status === 200 && lb.status === 409 && lb.json.codigo === 'COMANDA_ACTIVA', [lo.status, lb])
  check('la orden de A sigue viva y acepta su ítem', (await api(maria, 'POST', '/api/items-orden', { orden_id: lo.json.id, producto_id: f.pP, cantidad: 1 })).status === 200)
  check('el flujo nuevo también recibe 409 con comanda activa', (await enviar(admin, { mesa_id: mesa[2], items: [it(f.pP)] })).status === 409)
  await L.limpiarMesas(ctx, [2])
  for (const [titulo, mesaN, hacer] of [
    ['3 aperturas simultáneas (antiguo vs antiguo)', 3, (off) => [api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[3], estado: 'en_cocina' }), sleep(off).then(() => api(admin, 'POST', '/api/ordenes', { mesa_id: mesa[3], estado: 'en_cocina' }))]],
    ['3 envíos nuevos simultáneos a la misma mesa', 5, (off) => [enviar(maria, { mesa_id: mesa[5], items: [it(f.pP, 2)] }), sleep(off).then(() => enviar(admin, { mesa_id: mesa[5], items: [it(f.pP, 3)] }))]],
  ]) {
    let bien = 0
    for (let k = 0; k < 3; k++) {
      await L.limpiarMesas(ctx, [mesaN])
      const [a, b] = await Promise.all(hacer([0, 40, 90][k]))
      const act = await L.activasMesa(ctx, mesaN)
      if (act.length === 1 && [a.status, b.status].sort().join('/') === '200/409') bien++
    }
    check(`${titulo}: siempre una sola orden activa, un 200 y un 409 (${bien}/3)`, bien === 3)
  }
  await L.limpiarMesas(ctx, [3, 5])
  const ab = await api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[7], estado: 'en_cocina', notas: ctx.marca + ' abandonada' })
  await db`UPDATE soda_master.ordenes SET created_at = now() - interval '3 minutes' WHERE id = ${ab.json.id}::uuid AND notas LIKE 'prueba %abandonada'`
  const ab2 = await enviar(admin, { mesa_id: mesa[7], items: [it(f.pP)] })
  check('una comanda vacía de más de 2 minutos se limpia y la mesa se abre', ab2.status === 200 && !(await L.ordenRow(ctx, ab.json.id)), ab2.status)
  const idx = await db`SELECT 1 FROM pg_indexes WHERE schemaname='soda_master' AND indexname='ordenes_mesa_activa_uk'`
  check('índice único parcial ordenes_mesa_activa_uk existe', idx.length === 1)
  let rechazo = null
  try {
    await db`INSERT INTO soda_master.ordenes (mesa_id, usuario_id, estado, subtotal, impuesto, total, notas) VALUES (${mesa[7]}::uuid, ${admin.id}::uuid, 'pendiente', 0, 0, 0, ${ctx.marca + ' indice'})`
    await db`DELETE FROM soda_master.ordenes WHERE notas = ${ctx.marca + ' indice'}`
  } catch (e) { rechazo = e.code || e.message }
  check('una segunda orden activa en la misma mesa se rechaza en la base (23505)', rechazo === '23505', rechazo)
  await L.limpiarMesas(ctx, [7])

  console.log('\n[ordenes] pestaña vieja (endpoints antiguos)')
  await L.reponer(ctx); k0 = await L.K(ctx)
  const b3 = await L.stocks(ctx)
  const lo2 = await api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[8], estado: 'en_cocina' })
  const li1 = await api(maria, 'POST', '/api/items-orden', { orden_id: lo2.json.id, producto_id: f.pR, cantidad: 1, precio_unitario: 1, estado_item: 'listo' })
  const li2 = await api(maria, 'POST', '/api/items-orden', { orden_id: lo2.json.id, producto_id: f.pR, cantidad: 1, ...extra })
  check('ítems (antiguo): 200, precio del servidor, estado pendiente', li1.status === 200 && Number(li1.json.precio_unitario) === 1000 && li1.json.estado_item === 'pendiente' && Number(li2.json.precio_unitario) === 1500)
  const li3 = await api(maria, 'POST', '/api/items-orden', { orden_id: lo2.json.id, producto_id: f.pR, cantidad: 99 })
  check('3.er ítem sin stock (antiguo): 409 y nada descontado', li3.status === 409 && li3.json.codigo === 'STOCK_INSUFICIENTE')
  check('el rollback del POS antiguo (DELETE orden) devuelve todo el stock', (await api(maria, 'DELETE', '/api/ordenes', { id: lo2.json.id })).status === 200 && eq(await L.stocks(ctx), b3) && eq(await L.K(ctx), k0))
  check('antiguo con campo extra → 400', (await api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[9], total: 5 })).status === 400)
  await L.limpiarMesas(ctx)

  console.log('\n[ordenes] carrera: borrar un ítem contra el cobro parcial de ese ítem (3 rondas)')
  await L.reponer(ctx, L.BIG)
  let gPago = 0, gBorra = 0, malos = 0
  const retardos = [0, 300, 700]
  for (let k = 0; k < 3; k++) {
    const kk = await L.K(ctx)
    const r = await enviar(maria, { mesa_id: mesa[8], items: [it(f.pR, 1), it(f.pP, 1)] })
    const Ord = r.json.orden.id
    const a = r.json.items[0]
    const pagar = () => api(carlos, 'POST', '/api/pagos', { orden_id: Ord, metodo: 'tarjeta', monto_esperado: 1000, item_orden_ids: [a.id] })
    const borrar = () => api(maria, 'DELETE', '/api/items-orden', { id: a.id })
    const [p, q] = await Promise.all(k % 2 === 0 ? [pagar(), sleep(retardos[k]).then(borrar)] : [sleep(retardos[k]).then(pagar), borrar()])
    const aDb = (await L.itemsDe(ctx, Ord)).find((i) => i.id === a.id)
    const pagos = Number((await db`SELECT count(*)::int AS n FROM soda_master.pagos WHERE orden_id=${Ord}::uuid`)[0].n)
    let ok = !(p.status === 201 && q.status === 200)
    if (p.status === 201) { ok = ok && !!aDb && aDb.pagado === true && pagos === 1; gPago++ }
    else if (q.status === 200) { ok = ok && !aDb && pagos === 0; gBorra++ }
    ok = ok && eq(await L.K(ctx), kk)
    if (!ok) malos++
    await L.cerrarOrden(ctx, Ord)
    await L.limpiarMesas(ctx, [8])
  }
  check(`nunca borrado y pagado a la vez, stock coherente (pago ${gPago}, borrar ${gBorra})`, malos === 0, malos)
  check('sin ítems huérfanos', (await L.huerfanos(ctx)) === 0)
}
