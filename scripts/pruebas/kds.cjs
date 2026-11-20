/**
 * Módulo `kds` (sesión 13): estado de la orden según el peor estado de sus ítems (B5), matriz de
 * `estado_item` por rol (F11), edición bloqueada de ítems ya preparados, recálculo al agregar o
 * quitar ítems y carreras entre dos estaciones sobre la misma orden.
 *
 * El fallo de `handleMarkReady` en el navegador (B6: toast y recarga) se prueba en la interfaz.
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'kds'

/** Misma regla que `soda_master.recalcular_estado_orden`, escrita aparte para contrastar la base. */
function derivar(estados) {
  if (estados.length === 0) return null
  if (estados.includes('problema')) return 'problema'
  if (estados.includes('en_preparacion')) return 'en_preparacion'
  if (estados.includes('pendiente')) return 'en_cocina'
  if (estados.every((e) => e === 'entregado')) return 'entregado'
  return 'listo'
}

exports.correr = async function (ctx) {
  const { f, mesa, admin, maria, carlos, ezio, db } = ctx
  const cambiar = (ses, id, estado_item) => api(ses, 'PATCH', '/api/items-orden', { id, estado_item })
  const bulk = (ses, orden_id, item_ids, estado_item) => api(ses, 'POST', '/api/items-orden/estado', { orden_id, item_ids, estado_item })
  const estadoOrden = async (id) => (await L.ordenRow(ctx, id)).estado
  const estadosItems = async (id) => (await L.itemsDe(ctx, id)).map((i) => i.estado_item)
  const coherente = async (id) => {
    const o = await estadoOrden(id)
    return o === derivar(await estadosItems(id))
  }
  // Segunda estación: el usuario de bar si existe; si no, el admin (la matriz del admin lo permite todo).
  let bar = null
  if (ctx.usuarios.bar) {
    try { bar = await L.iniciarSesion(ctx.usuarios.bar) } catch { bar = null }
  }
  const estacionB = bar || admin

  console.log('\n[kds] B5: el estado de la orden es el del peor ítem')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const r1 = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 1), it(f.pR, 1), it(f.pP, 1)] })
  const O1 = r1.json.orden.id
  const [a1, a2, a3] = r1.json.items
  check('orden nueva en_cocina con 3 ítems pendientes', r1.status === 200 && r1.json.orden.estado === 'en_cocina' && r1.json.items.length === 3, r1)
  const p1 = await cambiar(ezio, a1.id, 'en_preparacion')
  check('un ítem en preparación → la orden queda en_preparacion', p1.status === 200 && (await estadoOrden(O1)) === 'en_preparacion', p1)
  const p2 = await cambiar(ezio, a1.id, 'listo')
  check('uno listo y dos pendientes → la orden es en_cocina (prioridad estricta: pendiente gana a listo)', p2.status === 200 && (await estadoOrden(O1)) === 'en_cocina', p2)
  const p3 = await cambiar(ezio, a2.id, 'problema')
  check('un ítem en problema → la orden queda en problema', p3.status === 200 && (await estadoOrden(O1)) === 'problema', p3)
  check('el problema NO marca los demás ítems: a1 listo, a3 sigue pendiente', eq((await estadosItems(O1)).slice().sort(), ['listo', 'pendiente', 'problema']))
  const sond = await api(ezio, 'GET', '/api/sondeo?secciones=ordenes')
  const enSondeo = (sond.json.ordenes || []).find((o) => o.id === O1)
  check('la orden con problema sigue llegando al KDS (el sondeo la trae con sus 3 ítems)', sond.status === 200 && !!enSondeo && enSondeo.estado === 'problema' && enSondeo.items.length === 3)
  const p4 = await cambiar(ezio, a3.id, 'en_preparacion')
  check('otro ítem avanza mientras hay problema: la orden sigue en problema', p4.status === 200 && (await estadoOrden(O1)) === 'problema')
  const p5 = await cambiar(ezio, a2.id, 'en_preparacion')
  check('volver de problema a en_preparacion → la orden vuelve a en_preparacion', p5.status === 200 && (await estadoOrden(O1)) === 'en_preparacion', p5)
  await cambiar(ezio, a2.id, 'listo')
  const p6 = await cambiar(ezio, a3.id, 'listo')
  check('todos listos → la orden queda listo', p6.status === 200 && (await estadoOrden(O1)) === 'listo' && (await coherente(O1)), p6)
  const p7 = await api(maria, 'PATCH', '/api/items-orden', { id: a1.id, estado_item: 'entregado' })
  check('uno entregado y dos listos → la orden sigue listo', p7.status === 200 && (await estadoOrden(O1)) === 'listo')
  await cambiar(maria, a2.id, 'entregado')
  const p8 = await cambiar(carlos, a3.id, 'entregado')
  check('todos entregados → la orden queda entregado (mesero y cajero pueden entregar)', p8.status === 200 && (await estadoOrden(O1)) === 'entregado' && (await coherente(O1)), p8)
  await L.cerrarOrden(ctx, O1)
  await L.limpiarMesas(ctx, [2])

  console.log('\n[kds] POST /api/items-orden/estado: varios ítems, todo o nada')
  const r2 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 1), it(f.pP, 2), it(f.pRP, 1)] })
  const O2 = r2.json.orden.id
  const ids2 = r2.json.items.map((i) => i.id)
  const b1 = await bulk(ezio, O2, ids2, 'en_preparacion')
  check('bulk a en_preparacion: 200, 3 ítems y orden en_preparacion (estado_anterior en_cocina)', b1.status === 200 && b1.json.items.length === 3 && b1.json.orden.estado === 'en_preparacion' && b1.json.orden.estado_anterior === 'en_cocina' && (await estadoOrden(O2)) === 'en_preparacion', b1)
  const b2 = await bulk(ezio, O2, ids2, 'listo')
  check('bulk a listo: la orden pasa a listo y la respuesta trae estado_anterior en_preparacion y cocina_lista (antes: no)', b2.status === 200 && b2.json.orden.estado === 'listo' && b2.json.orden.estado_anterior === 'en_preparacion' && b2.json.orden.cocina_lista === true && b2.json.orden.cocina_lista_antes === false && (await estadoOrden(O2)) === 'listo', b2)
  const b3 = await bulk(ezio, O2, ids2, 'listo')
  check('repetir el mismo bulk es idempotente (200, estado_anterior listo y cocina ya lista antes → no se vuelve a avisar)', b3.status === 200 && b3.json.orden.estado === 'listo' && b3.json.orden.estado_anterior === 'listo' && b3.json.orden.cocina_lista === true && b3.json.orden.cocina_lista_antes === true, b3)
  // todo o nada: un ítem entregado no puede volver a listo para cocina → 409 y los demás no cambian
  await cambiar(maria, ids2[0], 'entregado')
  await cambiar(admin, ids2[1], 'pendiente')
  const antes = await estadosItems(O2)
  const b4 = await bulk(ezio, O2, ids2, 'listo')
  check('bulk con un ítem en origen inválido → 409 TRANSICION_ITEM_INVALIDA y NADA cambia', b4.status === 409 && b4.json.codigo === 'TRANSICION_ITEM_INVALIDA' && eq(await estadosItems(O2), antes), [b4.status, b4.json])
  const rOtra = await enviar(admin, { mesa_id: mesa[5], items: [it(f.pP, 1)] })
  const b5 = await bulk(ezio, O2, [ids2[2], rOtra.json.items[0].id], 'en_preparacion')
  check('bulk con un ítem de otra orden → 400 ITEM_AJENO y nada cambia', b5.status === 400 && b5.json.codigo === 'ITEM_AJENO' && eq(await estadosItems(O2), antes), b5)
  check('bulk con un ítem inexistente → 404; con orden inexistente → 404', (await bulk(ezio, O2, [ids2[2], L.UUID_FALSO], 'en_preparacion')).status === 404 && (await bulk(ezio, L.UUID_FALSO, [ids2[2]], 'en_preparacion')).status === 404)
  check('bulk: campo extra, ítems vacíos, id no uuid, estado desconocido, sin orden_id → 400', (await api(ezio, 'POST', '/api/items-orden/estado', { orden_id: O2, item_ids: [ids2[2]], estado_item: 'listo', total: 1 })).status === 400 && (await bulk(ezio, O2, [], 'listo')).status === 400 && (await bulk(ezio, O2, ['x'], 'listo')).status === 400 && (await bulk(ezio, O2, [ids2[2]], 'cancelado')).status === 400 && (await api(ezio, 'POST', '/api/items-orden/estado', { item_ids: [ids2[2]], estado_item: 'listo' })).status === 400)
  check('bulk sin sesión → 401', (await bulk(null, O2, [ids2[2]], 'listo')).status === 401)
  await L.limpiarMesas(ctx, [3, 5])

  console.log('\n[kds] F11: matriz de estado_item por rol')
  const rm = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pP, 1), it(f.pP, 1), it(f.pP, 1)] })
  const Om = rm.json.orden.id
  const [m1, m2, m3] = rm.json.items
  check('cocina no puede entregar (403 ROL_SIN_PERMISO) ni devolver a pendiente (403)', (await cambiar(ezio, m1.id, 'entregado')).status === 403 && (await cambiar(ezio, m1.id, 'pendiente')).json.codigo === 'ROL_SIN_PERMISO')
  check('mesero y cajero no pueden marcar listo, en_preparacion ni problema (403)', (await cambiar(maria, m1.id, 'listo')).status === 403 && (await cambiar(carlos, m1.id, 'en_preparacion')).status === 403 && (await cambiar(maria, m1.id, 'problema')).status === 403)
  check('mesero entregando un ítem que no está listo → 409 TRANSICION_ITEM_INVALIDA', (await cambiar(maria, m1.id, 'entregado')).json.codigo === 'TRANSICION_ITEM_INVALIDA')
  check('estado desconocido → 400 y campo extra en el PATCH → 400', (await cambiar(ezio, m1.id, 'cancelado')).status === 400 && (await api(ezio, 'PATCH', '/api/items-orden', { id: m1.id, estado_item: 'listo', foo: 1 })).status === 400)
  check('ítem inexistente → 404; sin sesión → 401', (await cambiar(ezio, L.UUID_FALSO, 'listo')).status === 404 && (await cambiar(null, m1.id, 'listo')).status === 401)
  await cambiar(ezio, m1.id, 'listo')
  await cambiar(maria, m1.id, 'entregado')
  check('cocina no toca un ítem ya entregado (409)', (await cambiar(ezio, m1.id, 'en_preparacion')).status === 409 && (await cambiar(ezio, m1.id, 'listo')).status === 409)
  await cambiar(ezio, m2.id, 'problema')
  check('cocina puede volver de problema a en_preparacion y a listo', (await cambiar(ezio, m2.id, 'en_preparacion')).status === 200 && (await cambiar(ezio, m2.id, 'problema')).status === 200 && (await cambiar(ezio, m2.id, 'listo')).status === 200)
  check('listo → en_preparacion (corregir un listo por error) lo permite cocina; el admin corrige entregado → listo y problema → pendiente', (await cambiar(ezio, m2.id, 'en_preparacion')).status === 200 && (await cambiar(admin, m1.id, 'listo')).status === 200 && (await cambiar(admin, m1.id, 'entregado')).status === 200 && (await cambiar(admin, m3.id, 'problema')).status === 200 && (await cambiar(admin, m3.id, 'pendiente')).status === 200)
  check('orden de prueba coherente con sus ítems', await coherente(Om))

  console.log('\n[kds] F11: editar ítems según su estado (ITEM_YA_PREPARADO)')
  const editar = (ses, id, body) => api(ses, 'PATCH', '/api/items-orden', { id, ...body })
  await cambiar(ezio, m3.id, 'en_preparacion')
  const eP = await editar(maria, m3.id, { cantidad: 2 })
  check('ítem en_preparacion: mesero cambia cantidad → 409 ITEM_YA_PREPARADO', eP.status === 409 && eP.json.codigo === 'ITEM_YA_PREPARADO', eP)
  check('ítem en_preparacion: notas y modificadores también → 409; el admin tampoco', (await editar(maria, m3.id, { notas_especiales: JSON.stringify({ ingredientesEspeciales: [] }) })).status === 409 && (await editar(maria, m3.id, { modificadores: ['Sin sal'] })).status === 409 && (await editar(admin, m3.id, { cantidad: 3 })).json.codigo === 'ITEM_YA_PREPARADO')
  const pm = await editar(admin, m3.id, { precio_manual: true, precio_unitario: 1777, motivo: ctx.marca })
  check('el precio manual del admin no se bloquea por la preparación (200)', pm.status === 200 && Number(pm.json.precio_unitario) === 1777, pm)
  await cambiar(ezio, m3.id, 'listo')
  check('ítem listo: editar → 409 ITEM_YA_PREPARADO', (await editar(maria, m3.id, { cantidad: 2 })).json.codigo === 'ITEM_YA_PREPARADO')
  await cambiar(admin, m3.id, 'problema')
  check('ítem en problema: se puede editar (200: el mesero corrige el pedido)', (await editar(maria, m3.id, { cantidad: 2 })).status === 200)
  await cambiar(admin, m3.id, 'pendiente')
  check('ítem pendiente: se puede editar (200)', (await editar(maria, m3.id, { cantidad: 1 })).status === 200 && (await L.totalesOk(ctx, Om)).ok)
  check('editar sigue sin tocar el estado de la orden: coherente', await coherente(Om))
  await L.limpiarMesas(ctx, [6])

  console.log('\n[kds] B5: recalcular al agregar, quitar y reenviar ítems')
  const rl = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pR, 1), it(f.pP, 1)] })
  const Ol = rl.json.orden.id
  const [l1, l2] = rl.json.items
  await bulk(ezio, Ol, [l1.id, l2.id], 'listo')
  check('orden con todo listo está en listo (sale del KDS)', (await estadoOrden(Ol)) === 'listo')
  const add = await enviar(maria, { orden_id: Ol, items: [it(f.pP, 1)] })
  check('agregar un ítem pendiente a una orden listo → vuelve a en_cocina (la respuesta ya lo trae)', add.status === 200 && add.json.orden.estado === 'en_cocina' && (await estadoOrden(Ol)) === 'en_cocina', add)
  const sond2 = await api(ezio, 'GET', '/api/sondeo?secciones=ordenes')
  check('y reaparece en el KDS: el sondeo la trae en_cocina con 3 ítems', (sond2.json.ordenes || []).some((o) => o.id === Ol && o.estado === 'en_cocina' && o.items.length === 3))
  const del = await api(maria, 'DELETE', '/api/items-orden', { id: add.json.items[0].id })
  check('quitar ese ítem pendiente → la orden queda listo otra vez', del.status === 200 && (await estadoOrden(Ol)) === 'listo' && (await coherente(Ol)), del)
  const viejo = await api(maria, 'POST', '/api/items-orden', { orden_id: Ol, producto_id: f.pP, cantidad: 1 })
  check('el POST antiguo de ítems también la reabre (en_cocina)', viejo.status === 200 && (await estadoOrden(Ol)) === 'en_cocina')
  await api(maria, 'DELETE', '/api/items-orden', { id: viejo.json.id })
  await cambiar(admin, l1.id, 'problema')
  const add2 = await enviar(maria, { orden_id: Ol, items: [it(f.pP, 1)] })
  check('agregar un ítem a una orden con problema → conserva problema (peor estado)', add2.status === 200 && add2.json.orden.estado === 'problema' && (await estadoOrden(Ol)) === 'problema', add2.json.orden)
  await api(maria, 'DELETE', '/api/items-orden', { id: l1.id })
  check('quitar el ítem con problema → la orden toma el peor de los que quedan (en_cocina por el ítem nuevo)', (await estadoOrden(Ol)) === 'en_cocina' && (await coherente(Ol)))
  await L.limpiarMesas(ctx, [7])
  const rs = await enviar(maria, { mesa_id: mesa[8], items: [it(f.pP, 1)] })
  const dUno = await api(maria, 'DELETE', '/api/items-orden', { id: rs.json.items[0].id })
  check('orden sin ítems tras borrar el único: no cambia su estado (en_cocina) y no falla', dUno.status === 200 && (await estadoOrden(rs.json.orden.id)) === 'en_cocina')
  await L.limpiarMesas(ctx, [8])

  console.log('\n[kds] ítems pagados y órdenes no activas')
  const rp = await enviar(maria, { mesa_id: mesa[9], items: [it(f.pP, 1), it(f.pP, 1)] })
  const Op = rp.json.orden.id
  const [q1, q2] = rp.json.items
  const pg = await api(carlos, 'POST', '/api/pagos', { orden_id: Op, metodo: 'tarjeta', monto_esperado: 1500, item_orden_ids: [q1.id] })
  check('cobro parcial del primer ítem: 201 y la orden sigue abierta', pg.status === 201 && (await estadoOrden(Op)) !== 'pagado')
  await cambiar(ezio, q1.id, 'listo')
  check('un ítem pagado igual cuenta por su estado de cocina: [listo pagado, pendiente] → en_cocina', (await estadoOrden(Op)) === 'en_cocina')
  await cambiar(ezio, q2.id, 'listo')
  check('ambos listos → listo', (await estadoOrden(Op)) === 'listo')
  await cambiar(maria, q1.id, 'entregado')
  check('el ítem pagado se entrega (200) y la orden sigue listo con el otro pendiente de entrega', (await estadoOrden(Op)) === 'listo')
  await cambiar(maria, q2.id, 'entregado')
  check('todo entregado con uno pagado y otro sin pagar → la orden queda entregado (no se confunde con el pago)', (await estadoOrden(Op)) === 'entregado')
  await L.cerrarOrden(ctx, Op)
  check('al cobrar lo que quedaba, la orden queda pagado', (await estadoOrden(Op)) === 'pagado')
  await L.limpiarMesas(ctx, [9])
  const rc = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pP, 1)] })
  await api(admin, 'PATCH', '/api/ordenes', { id: rc.json.orden.id, estado: 'cancelado', notas: ctx.marca })
  const sobreCancelada = await cambiar(ezio, rc.json.items[0].id, 'listo')
  check('cambiar el estado de un ítem de una orden cancelada → 409 ORDEN_NO_ACTIVA', sobreCancelada.status === 409 && sobreCancelada.json.codigo === 'ORDEN_NO_ACTIVA', sobreCancelada)
  await L.limpiarMesas(ctx, [2])

  console.log('\n[kds] carrera: dos estaciones cambian ítems de la misma orden (3 rondas)')
  await L.reponer(ctx, L.BIG)
  const retardos = [0, 70, 180]
  let malos = 0
  let unaSolaTransicion = 0
  for (let k = 0; k < 3; k++) {
    const kk = await L.K(ctx)
    const r = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pR, 1), it(f.pR, 1), it(f.pP, 1), it(f.pP, 1)] })
    const Ord = r.json.orden.id
    const [c1, c2, d1, d2] = r.json.items
    // ronda par: las dos estaciones marcan listo lo suyo; ronda impar: una listo y la otra problema
    const destinoB = k % 2 === 0 ? 'listo' : 'problema'
    const [x, y] = await Promise.all([
      bulk(ezio, Ord, [c1.id, c2.id], 'listo'),
      sleep(retardos[k]).then(() => bulk(estacionB, Ord, [d1.id, d2.id], destinoB)),
    ])
    const ests = await estadosItems(Ord)
    let ok = x.status === 200 && y.status === 200 && (await coherente(Ord))
    ok = ok && ests.filter((e) => e === 'listo').length === (destinoB === 'listo' ? 4 : 2)
    if (destinoB === 'listo') {
      // exactamente una de las dos respuestas produjo la transición a listo (quien avisa al mesero)
      const produjeron = [x, y].filter((z) => z.json.orden.cocina_lista === true && z.json.orden.cocina_lista_antes === false).length
      if (produjeron === 1) unaSolaTransicion++
      ok = ok && (await estadoOrden(Ord)) === 'listo'
    } else {
      ok = ok && (await estadoOrden(Ord)) === 'problema'
    }
    ok = ok && eq(await L.K(ctx), kk)
    if (!ok) malos++
    await L.limpiarMesas(ctx, [3])
  }
  check(`las dos estaciones no se pisan: estado final = peor ítem y sin 409/500 (${3 - malos}/3)`, malos === 0, malos)
  check(`en las rondas "listo + listo" una sola respuesta produce la transición a listo (${unaSolaTransicion}/2)`, unaSolaTransicion === 2)

  console.log('\n[kds] carrera: el PATCH antiguo de 3 ítems en paralelo (Promise.all) y un ítem nuevo a la vez')
  let malosB = 0
  for (let k = 0; k < 3; k++) {
    const r = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pP, 1), it(f.pP, 1), it(f.pP, 1)] })
    const Ord = r.json.orden.id
    const resp = await Promise.all(r.json.items.map((i, idx) => sleep(idx * [0, 20, 60][k]).then(() => cambiar(ezio, i.id, 'listo'))))
    let ok = resp.every((x) => x.status === 200) && (await estadoOrden(Ord)) === 'listo'
    // un ítem nuevo entra justo cuando cocina marca el último
    const [u, v] = await Promise.all([
      enviar(maria, { orden_id: Ord, items: [it(f.pP, 1)] }),
      sleep([0, 40, 120][k]).then(() => cambiar(ezio, r.json.items[0].id, 'en_preparacion')),
    ])
    ok = ok && u.status === 200 && v.status === 200 && (await coherente(Ord)) && (await estadoOrden(Ord)) === 'en_preparacion'
    if (!ok) malosB++
    await L.limpiarMesas(ctx, [5])
  }
  check(`3 PATCH simultáneos terminan en listo; un ítem nuevo y un ítem de vuelta a preparación a la vez dejan el estado del peor ítem (${3 - malosB}/3)`, malosB === 0, malosB)

  console.log('\n[kds] F37: orden pagada por adelantado con ítems sin terminar')
  await L.reponer(ctx, L.BIG)
  const enSondeoKds = async (ses, id) => {
    const r = await api(ses, 'GET', '/api/sondeo?secciones=ordenes')
    return (r.json.ordenes || []).find((o) => o.id === id) || null
  }
  const rf = await enviar(maria, { mesa_id: mesa[2], notas: ctx.marca, items: [it(f.pP, 1), it(f.pP, 1)] })
  const Of = rf.json.orden.id
  const [f1, f2] = rf.json.items
  const pagoF = await api(carlos, 'POST', '/api/pagos', { orden_id: Of, metodo: 'tarjeta', monto_esperado: 3000 })
  check('se paga la orden completa con los dos ítems pendientes: 201 y la orden queda pagado (el cobro no cambió)', pagoF.status === 201 && (await estadoOrden(Of)) === 'pagado', pagoF)
  const visF = await enSondeoKds(ezio, Of)
  check('el KDS la sigue recibiendo: el sondeo trae la orden pagada reciente con sus 2 ítems pendientes', !!visF && visF.estado === 'pagado' && visF.items.length === 2 && visF.items.every((i) => i.estado_item === 'pendiente'), visF && visF.estado)
  const lista = await api(ezio, 'GET', '/api/ordenes?kds=true')
  check('GET /api/ordenes?kds=true (carga inicial y recarga) también la trae', Array.isArray(lista.json) && lista.json.some((o) => o.id === Of && o.estado === 'pagado'))
  const g1 = await bulk(ezio, Of, [f1.id], 'listo')
  check('cocina marca el primer ítem: 200, la orden sigue pagado y aún no está terminada (sin aviso)', g1.status === 200 && (await estadoOrden(Of)) === 'pagado' && g1.json.orden.estado === 'pagado' && g1.json.orden.cocina_lista === false, g1.json)
  check('con un ítem pendiente sigue visible en el KDS', !!(await enSondeoKds(ezio, Of)))
  const g2 = await bulk(ezio, Of, [f2.id], 'listo')
  check('al marcar el último ítem: 200, cocina_lista true y antes false (una sola notificación), la orden sigue pagado', g2.status === 200 && g2.json.orden.cocina_lista === true && g2.json.orden.cocina_lista_antes === false && g2.json.orden.estado === 'pagado' && (await estadoOrden(Of)) === 'pagado', g2.json)
  check('y sale del KDS (el sondeo ya no la trae)', (await enSondeoKds(ezio, Of)) === null)
  const g3 = await bulk(ezio, Of, [f2.id], 'listo')
  check('repetir la marca no vuelve a avisar (cocina_lista_antes true)', g3.status === 200 && g3.json.orden.cocina_lista === true && g3.json.orden.cocina_lista_antes === true)
  const otroPago = await api(carlos, 'POST', '/api/pagos', { orden_id: Of, metodo: 'tarjeta', monto_esperado: 3000 })
  check('Pagos no la ofrece para cobrar: un segundo cobro → 409 y la orden sigue pagado', otroPago.status === 409 && (await estadoOrden(Of)) === 'pagado', otroPago.status)
  check('las órdenes activas de la mesa no la incluyen (Mesas ve lo mismo que antes)', (await L.activasMesa(ctx, 2)).length === 0)
  await L.limpiarMesas(ctx, [2])

  const rh = await enviar(maria, { mesa_id: mesa[3], notas: ctx.marca, items: [it(f.pP, 1)] })
  const Oh = rh.json.orden.id
  await cambiar(ezio, rh.json.items[0].id, 'listo')
  await api(carlos, 'POST', '/api/pagos', { orden_id: Oh, metodo: 'tarjeta', monto_esperado: 1500 })
  check('pagada con todo listo: no aparece en el KDS', (await estadoOrden(Oh)) === 'pagado' && (await enSondeoKds(ezio, Oh)) === null)
  await L.limpiarMesas(ctx, [3])

  // F41: ventana de 2 horas. Sin tocar datos: se busca (solo lectura) una orden pagada con ítems sin terminar
  // cuyo último pago es de hace más de 2 horas (las dejan las corridas anteriores de las pruebas) y se
  // comprueba que el sondeo no la trae; la fecha que cuenta es la del pago (`pagos.created_at`), no `updated_at`.
  const vieja = await db`
    SELECT o.id::text AS id FROM soda_master.ordenes o JOIN soda_master.pagos pg ON pg.orden_id = o.id
    WHERE o.estado = 'pagado'
      AND EXISTS (SELECT 1 FROM soda_master.items_orden x WHERE x.orden_id = o.id AND COALESCE(x.estado_item, 'pendiente') NOT IN ('listo', 'entregado'))
    GROUP BY o.id HAVING MAX(pg.created_at) < now() - interval '2 hours'
    ORDER BY MAX(pg.created_at) DESC LIMIT 1`
  if (vieja[0]) {
    const sd = await api(ezio, 'GET', '/api/sondeo?secciones=ordenes')
    check('ventana de 2 horas: una orden pagada con ítems sin terminar cobrada hace más de 2 horas NO llega al KDS', sd.status === 200 && !(sd.json.ordenes || []).some((o) => o.id === vieja[0].id), vieja[0].id)
  } else {
    console.log('  (sin datos viejos en la base: se omite la comprobación de la ventana contra una orden anterior)')
  }

  console.log('\n[kds] F41: tope de 30 órdenes pagadas (31 pagadas por adelantado seguidas)')
  await L.reponer(ctx, L.BIG)
  const creadas = []
  for (let k = 0; k < 31; k++) {
    const r = await enviar(maria, { mesa_id: mesa[8], notas: ctx.marca, items: [it(f.pP, 1)] })
    const pg = await api(carlos, 'POST', '/api/pagos', { orden_id: r.json.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })
    if (r.status !== 200 || pg.status !== 201) { check('crear y pagar la orden ' + (k + 1), false, [r.status, pg.status]); break }
    creadas.push(r.json.orden.id)
  }
  check('31 órdenes pagadas por adelantado, todas con su ítem pendiente', creadas.length === 31)
  const sdT = await api(ezio, 'GET', '/api/sondeo?secciones=ordenes')
  const pagadasKds = (sdT.json.ordenes || []).filter((o) => o.estado === 'pagado')
  check(`el sondeo trae como máximo 30 órdenes pagadas (trajo ${pagadasKds.length})`, sdT.status === 200 && pagadasKds.length === 30, pagadasKds.length)
  const idsKds = pagadasKds.map((o) => o.id)
  check('son las más recientes: la última creada está y la primera de las 31 no', idsKds.includes(creadas[30]) && !idsKds.includes(creadas[0]))
  const esperadas = await db`
    SELECT o.id::text AS id FROM soda_master.ordenes o JOIN soda_master.pagos pg ON pg.orden_id = o.id
    WHERE o.estado = 'pagado'
      AND EXISTS (SELECT 1 FROM soda_master.items_orden x WHERE x.orden_id = o.id AND COALESCE(x.estado_item, 'pendiente') NOT IN ('listo', 'entregado'))
    GROUP BY o.id HAVING MAX(pg.created_at) >= now() - interval '2 hours'
    ORDER BY MAX(pg.created_at) DESC LIMIT 30`
  check('coinciden con las 30 cobradas más recientes dentro de las 2 horas (lectura directa de la base)', eq([...idsKds].sort(), esperadas.map((e) => e.id).sort()))
  check('todas traen al menos un ítem sin terminar', pagadasKds.every((o) => o.items.some((i) => i.estado_item !== 'listo' && i.estado_item !== 'entregado')))
  const lectura = await api(ezio, 'GET', '/api/ordenes?kds=true')
  check('GET /api/ordenes?kds=true (carga inicial y recarga) respeta el mismo tope', Array.isArray(lectura.json) && lectura.json.filter((o) => o.estado === 'pagado').length === 30)
  await L.limpiarMesas(ctx, [8])

  console.log('\n[kds] F37: carrera — dos estaciones terminan los dos últimos ítems de una orden pagada (3 rondas)')
  let malosP = 0, unaSolaP = 0
  for (let k = 0; k < 3; k++) {
    const r = await enviar(maria, { mesa_id: mesa[6], notas: ctx.marca, items: [it(f.pP, 1), it(f.pP, 1)] })
    const Ord = r.json.orden.id
    const [c1, c2] = r.json.items
    await api(carlos, 'POST', '/api/pagos', { orden_id: Ord, metodo: 'tarjeta', monto_esperado: 3000 })
    const [x, y] = await Promise.all([
      bulk(ezio, Ord, [c1.id], 'listo'),
      sleep([0, 60, 150][k]).then(() => bulk(estacionB, Ord, [c2.id], 'listo')),
    ])
    const produjeron = [x, y].filter((z) => z.json.orden && z.json.orden.cocina_lista === true && z.json.orden.cocina_lista_antes === false).length
    if (produjeron === 1) unaSolaP++
    const ok = x.status === 200 && y.status === 200 && produjeron === 1 && (await estadoOrden(Ord)) === 'pagado' && (await enSondeoKds(ezio, Ord)) === null
    if (!ok) malosP++
    await L.limpiarMesas(ctx, [6])
  }
  check(`una sola respuesta produce el aviso y la orden sigue pagado y fuera del KDS (${3 - malosP}/3, avisos únicos ${unaSolaP}/3)`, malosP === 0 && unaSolaP === 3)
  check('sin ítems huérfanos', (await L.huerfanos(ctx)) === 0)
  if (bar) await api(bar, 'POST', '/api/auth/logout', {}).catch(() => {})
}
