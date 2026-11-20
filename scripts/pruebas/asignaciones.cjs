/**
 * Módulo `asignaciones` (sesión 7): asignaciones de ítems por persona (todo-o-nada con lock de la
 * orden) y pérdidas ("perro muerto") con cobro retroactivo. Incluye carreras de 3 rondas.
 */
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'asignaciones'

const idDe = (r) => r.json && (r.json.id || (r.json.persona && r.json.persona.id))

exports.correr = async function (ctx) {
  const { f, mesa, admin, maria, carlos, ezio, db } = ctx
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const asignar = (ses, body) => api(ses, 'POST', '/api/cuentas-persona/asignaciones', body)

  console.log('\n[asignaciones] por persona')
  const r = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pR, 2), it(f.pP, 1)] })
  const O = r.json.orden.id
  const [linea, itemP] = r.json.items
  const pA = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O, nombre: 'A' }))
  const pB = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O, nombre: 'B' }))
  check('crear 2 personas', !!pA && !!pB)
  const a1 = await asignar(maria, { orden_id: O, asignaciones: [{ item_orden_id: linea.id, cantidad: 1, cuenta_persona_id: pA }] })
  const filas = await L.itemsDe(ctx, O)
  check('asignar 1 de 2 unidades parte la línea y conserva las 3 unidades', a1.status === 200 && filas.reduce((s, i) => s + Number(i.cantidad), 0) === 3 && filas.length === 3, [a1.status, filas.length])
  const o2 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pP, 1)] })
  const pAjena = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: o2.json.orden.id, nombre: 'Z' }))
  check('persona de OTRA orden → 400', (await asignar(maria, { orden_id: O, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1, cuenta_persona_id: pAjena }] })).status === 400)
  check('ítem de OTRA orden → 400', (await asignar(maria, { orden_id: O, asignaciones: [{ item_orden_id: o2.json.items[0].id, cantidad: 1, cuenta_persona_id: pA }] })).status === 400)
  check('cantidad decimal, campo extra y lista vacía → 400', (await asignar(maria, { orden_id: O, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1.5, cuenta_persona_id: pA }] })).status === 400 && (await asignar(maria, { orden_id: O, foo: 1, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1, cuenta_persona_id: pA }] })).status === 400 && (await asignar(maria, { orden_id: O, asignaciones: [] })).status === 400)
  check('cocina → 403 y sin sesión → 401', (await asignar(ezio, { orden_id: O, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1, cuenta_persona_id: pA }] })).status === 403 && (await asignar(null, { orden_id: O, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1, cuenta_persona_id: pA }] })).status === 401)
  const lote = await asignar(maria, { orden_id: O, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1, cuenta_persona_id: pB }, { item_orden_id: o2.json.items[0].id, cantidad: 1, cuenta_persona_id: pA }] })
  check('lote con un ítem ajeno: todo o nada (nada se asigna)', lote.status === 400 && (await db`SELECT cuenta_persona_id FROM soda_master.items_orden WHERE id=${itemP.id}::uuid`)[0].cuenta_persona_id === null)
  const pagadoPrimero = await api(carlos, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: 1500, item_orden_ids: [itemP.id] })
  check('ítem pagado no se reasigna → 409', pagadoPrimero.status === 201 && (await asignar(maria, { orden_id: O, asignaciones: [{ item_orden_id: itemP.id, cantidad: 1, cuenta_persona_id: pB }] })).status === 409)
  await L.limpiarMesas(ctx, [3])

  console.log('\n[asignaciones] carreras (3 rondas)')
  let ganan = 0, malos = 0
  for (let k = 0; k < 3; k++) {
    await L.limpiarMesas(ctx, [5])
    const rr = await enviar(maria, { mesa_id: mesa[5], items: [it(f.pR, 2)] })
    const Ord = rr.json.orden.id
    const ln = rr.json.items[0]
    const pa = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: Ord, nombre: 'A' }))
    const pb = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: Ord, nombre: 'B' }))
    const mismo = () => asignar(maria, { orden_id: Ord, asignaciones: [{ item_orden_id: ln.id, cantidad: 1, cuenta_persona_id: pa }] })
    const [s1, s2] = await Promise.all([mismo(), sleep(30 * k).then(mismo)])
    const un = (await L.itemsDe(ctx, Ord)).reduce((s, i) => s + Number(i.cantidad), 0)
    if ([s1.status, s2.status].sort().join('/') === '200/409' && un === 2) ganan++
    else if (!(s1.status === 200 && s2.status === 200 && un === 2)) malos++
    const elimina = () => api(maria, 'DELETE', '/api/cuentas-persona', { id: pb })
    const reasigna = () => asignar(maria, { orden_id: Ord, asignaciones: [{ item_orden_id: ln.id, cantidad: 1, cuenta_persona_id: pb }] })
    await Promise.all(k % 2 ? [elimina(), sleep(60).then(reasigna)] : [reasigna(), sleep(60).then(elimina)])
    const huerf = await db`SELECT count(*)::int AS n FROM soda_master.items_orden i WHERE i.orden_id=${Ord}::uuid AND i.cuenta_persona_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM soda_master.cuentas_persona c WHERE c.id = i.cuenta_persona_id)`
    const un2 = (await L.itemsDe(ctx, Ord)).reduce((s, i) => s + Number(i.cantidad), 0)
    if (huerf[0].n !== 0 || un2 !== 2) malos++
  }
  check(`cortes simultáneos de la misma línea: gana uno y el otro 409 (${ganan}/3); asignar vs eliminar persona sin huérfanos ni unidades perdidas`, malos === 0 && ganan >= 1, { ganan, malos })
  await L.limpiarMesas(ctx, [5])

  console.log('\n[asignaciones] pérdidas (perro muerto) y cobro retroactivo')
  await L.reponer(ctx, L.BIG)
  const rp = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pR, 2), it(f.pP, 1)] })
  const Op = rp.json.orden.id
  const kp1 = await L.K(ctx)
  const sp1 = await L.stocks(ctx)
  const probe = await api(carlos, 'POST', '/api/pagos', { orden_id: Op, metodo: 'tarjeta', monto_esperado: 1 })
  const ms = Number(probe.json.monto_servidor)
  check('registrar pérdida: mesero → 403, cajero → 403, sin motivo → 400, campo extra → 400', (await api(maria, 'POST', '/api/perdidas', { orden_id: Op, motivo: 'prueba' })).status === 403 && (await api(carlos, 'POST', '/api/perdidas', { orden_id: Op, motivo: 'prueba' })).status === 403 && (await api(admin, 'POST', '/api/perdidas', { orden_id: Op })).status === 400 && (await api(admin, 'POST', '/api/perdidas', { orden_id: Op, motivo: 'prueba', monto: 5 })).status === 400)
  const pp = await Promise.all([0, 20, 40].map((d) => sleep(d).then(() => api(admin, 'POST', '/api/perdidas', { orden_id: Op, motivo: ctx.marca }))))
  const ok = pp.filter((x) => x.status === 200 || x.status === 201)
  check('3 pérdidas en paralelo: solo una se registra, las otras 409', ok.length === 1 && pp.filter((x) => x.status === 409).length === 2, pp.map((x) => x.status))
  check('el monto de la pérdida = lo que cobraría Pagos', ok[0] && Object.values(ok[0].json).some((v) => Number(v) === ms), [ms, ok[0] && ok[0].json])
  check('la pérdida no devuelve stock (se consumió) y K constante', eq(await L.K(ctx), kp1) && eq(await L.stocks(ctx), sp1))
  const pid = idDe(ok[0])
  check('la orden perdida ya no se modifica: borrar, editar, agregar y cobrar → 409', (await api(maria, 'DELETE', '/api/items-orden', { id: rp.json.items[0].id })).status === 409 && (await api(maria, 'PATCH', '/api/items-orden', { id: rp.json.items[0].id, cantidad: 4 })).status === 409 && (await enviar(maria, { orden_id: Op, items: [it(f.pP)] })).status === 409 && (await api(carlos, 'POST', '/api/pagos', { orden_id: Op, metodo: 'tarjeta', monto_esperado: ms })).status >= 400)
  check('resolver: mesero → 403; cajero cobra → 200/201', (await api(maria, 'POST', '/api/perdidas/resolver', { perdida_id: pid, metodo: 'tarjeta' })).status === 403 && [200, 201].includes((await api(carlos, 'POST', '/api/perdidas/resolver', { perdida_id: pid, metodo: 'tarjeta' })).status))
  check('resolver otra vez → 409 (ya resuelta)', (await api(carlos, 'POST', '/api/perdidas/resolver', { perdida_id: pid, metodo: 'tarjeta' })).status === 409)
  const rpg = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pP)] })
  await api(carlos, 'POST', '/api/pagos', { orden_id: rpg.json.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })
  check('pérdida sobre una orden pagada → 409', (await api(admin, 'POST', '/api/perdidas', { orden_id: rpg.json.orden.id, motivo: ctx.marca })).status === 409)
  await L.limpiarMesas(ctx)
}
