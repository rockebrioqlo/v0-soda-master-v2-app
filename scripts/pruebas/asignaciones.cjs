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

  // ───── Sesión 9 (A3): eliminar una persona con ítems pagados ─────
  console.log('\n[asignaciones] A3: eliminar una persona')
  await L.reponer(ctx, L.BIG)
  const delPersona = (ses, id) => api(ses, 'DELETE', '/api/cuentas-persona', { id })
  const codigo = (x) => x.json && x.json.codigo
  const personaDe = async (id) => (await db`SELECT id FROM soda_master.cuentas_persona WHERE id = ${id}::uuid`).length
  const cuentaDeItem = async (id) => (await db`SELECT cuenta_persona_id::text AS c, pagado FROM soda_master.items_orden WHERE id = ${id}::uuid`)[0]
  const ra3 = await enviar(maria, { mesa_id: mesa[9], items: [it(f.pP, 1), it(f.pR, 1)] })
  const O3 = ra3.json.orden.id
  const [x1, x2] = ra3.json.items
  const qa = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O3, nombre: 'Paga' }))
  const qb = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O3, nombre: 'Pendiente' }))
  const qc = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O3, nombre: 'Vacía' }))
  await asignar(maria, { orden_id: O3, asignaciones: [{ item_orden_id: x1.id, cantidad: 1, cuenta_persona_id: qa }, { item_orden_id: x2.id, cantidad: 1, cuenta_persona_id: qb }] })
  await api(carlos, 'POST', '/api/pagos', { orden_id: O3, metodo: 'tarjeta', monto_esperado: 1500, item_orden_ids: [x1.id] })
  const dA = await delPersona(maria, qa)
  check('eliminar una persona con ítems pagados → 409 PERSONA_CON_ITEMS_PAGADOS y el historial intacto', dA.status === 409 && codigo(dA) === 'PERSONA_CON_ITEMS_PAGADOS' && /ya pagó 1 ítem/.test(dA.json.error) && (await personaDe(qa)) === 1 && (await cuentaDeItem(x1.id)).c === qa && (await cuentaDeItem(x1.id)).pagado === true, dA)
  check('eliminar con cocina → 403, sin sesión → 401, id inválido y campo extra → 400', (await delPersona(ezio, qb)).status === 403 && (await delPersona(null, qb)).status === 401 && (await delPersona(maria, 'x')).status === 400 && (await api(maria, 'DELETE', '/api/cuentas-persona', { id: qb, foo: 1 })).status === 400 && (await personaDe(qb)) === 1)
  const dB = await delPersona(maria, qb)
  const itB = await cuentaDeItem(x2.id)
  check('persona con solo ítems pendientes: se elimina y sus ítems quedan compartidos (sin pagar)', dB.status === 200 && (await personaDe(qb)) === 0 && itB.c === null && itB.pagado === false, [dB.status, itB])
  check('persona sin ítems: 200, y repetir (doble clic) también', (await delPersona(maria, qc)).status === 200 && (await delPersona(maria, qc)).status === 200 && (await personaDe(qc)) === 0)
  check('persona renombrable aunque tenga ítems pagados', (await api(maria, 'PATCH', '/api/cuentas-persona', { id: qa, nombre: 'Ya pagó' })).status === 200)
  await L.limpiarMesas(ctx, [9])

  console.log('\n[asignaciones] A3: carrera eliminar persona contra el cobro de su ítem (3 rondas)')
  let buenasA3 = 0, ganaCobro = 0
  for (let k = 0; k < 3; k++) {
    await L.limpiarMesas(ctx, [9])
    const rr = await enviar(maria, { mesa_id: mesa[9], items: [it(f.pP, 1)] })
    const Ord = rr.json.orden.id
    const itm = rr.json.items[0]
    const pp = idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: Ord, nombre: 'Carrera' }))
    await asignar(maria, { orden_id: Ord, asignaciones: [{ item_orden_id: itm.id, cantidad: 1, cuenta_persona_id: pp }] })
    const pagar = () => api(carlos, 'POST', '/api/pagos', { orden_id: Ord, metodo: 'tarjeta', monto_esperado: 1500, item_orden_ids: [itm.id] })
    const elimina = () => delPersona(maria, pp)
    const demora = [0, 300, 700][k]
    const [c, d] = await Promise.all(k % 2 === 0 ? [pagar(), sleep(demora).then(elimina)] : [sleep(demora).then(pagar), elimina()])
    const existe = await personaDe(pp)
    const it2 = await cuentaDeItem(itm.id)
    // o el cobro llegó primero (persona e historial intactos, 409) o la persona se eliminó antes de pagar
    const coherente = c.status === 201 && it2.pagado === true &&
      ((d.status === 409 && existe === 1 && it2.c === pp) || (d.status === 200 && existe === 0 && it2.c === null))
    if (coherente) { buenasA3++; if (d.status === 409) ganaCobro++ }
  }
  check(`el historial de quién pagó nunca se pierde: o 409 con la persona intacta o eliminada antes del cobro (${buenasA3}/3, cobro primero ${ganaCobro})`, buenasA3 === 3, buenasA3)
  await L.limpiarMesas(ctx, [9])

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

  // ───── Sesión 9 (B3, F24): monto y motivo del cobro retroactivo, y su paso por la caja ─────
  console.log('\n[asignaciones] B3: el monto del cobro retroactivo contra lo registrado')
  await L.reponer(ctx, L.BIG)
  const resolver = (ses, body) => api(ses, 'POST', '/api/perdidas/resolver', body)
  const nuevaPerdida = async (n, items, conPersona) => {
    const r = await enviar(maria, { mesa_id: mesa[n], items })
    const O = r.json.orden.id
    const persona = conPersona ? idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: O, nombre: 'P' })) : null
    const probe = await api(carlos, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: 1 })
    const reg = await api(admin, 'POST', '/api/perdidas', { orden_id: O, motivo: ctx.marca })
    return { O, persona, ms: Number(probe.json.monto_servidor), pid: idDe(reg), st: reg.status }
  }
  const perdidaDb = async (pid) => (await db`SELECT resuelto, monto_perdido::float AS reg, monto_cobrado::float AS cobrado, monto_condonado::float AS condonado, motivo_condonacion, pago_id::text AS pago_id FROM soda_master.perdidas_comanda WHERE id = ${pid}::uuid`)[0]
  const nPagos = async (O) => Number((await db`SELECT count(*)::int AS n FROM soda_master.pagos WHERE orden_id = ${O}::uuid`)[0].n)
  const auditoria = async (pid) => db`SELECT usuario_id::text AS u, usuario_rol, detalles FROM soda_master.auditoria_admin WHERE accion = 'perdida_cobro_parcial' AND entidad_id = ${pid}::uuid`

  const b1 = await nuevaPerdida(8, [it(f.pR, 2), it(f.pP, 1)], true)
  check('pérdida registrada con el monto de Pagos', b1.st === 201 && b1.ms >= 1000 && (await perdidaDb(b1.pid)).reg === b1.ms, b1)
  check('persona de una orden ya perdida: eliminar → 409 ORDEN_NO_ACTIVA', codigo(await delPersona(maria, b1.persona)) === 'ORDEN_NO_ACTIVA')
  const exceso = await resolver(carlos, { perdida_id: b1.pid, metodo: 'tarjeta', monto: b1.ms + 1 })
  check('monto mayor que lo registrado → 400 MONTO_EXCEDE_PERDIDA, sin pago y sin resolver', exceso.status === 400 && codigo(exceso) === 'MONTO_EXCEDE_PERDIDA' && (await nPagos(b1.O)) === 0 && !(await perdidaDb(b1.pid)).resuelto, exceso)
  const sinMotivo = await resolver(carlos, { perdida_id: b1.pid, metodo: 'tarjeta', monto: b1.ms - 100 })
  check('monto menor sin motivo → 400 MOTIVO_REQUERIDO, sin pago y sin resolver', sinMotivo.status === 400 && codigo(sinMotivo) === 'MOTIVO_REQUERIDO' && (await nPagos(b1.O)) === 0 && !(await perdidaDb(b1.pid)).resuelto, sinMotivo)
  const invalidos = await Promise.all([
    { monto: b1.ms - 0.5, motivo: 'xxx' }, { monto: 0 }, { monto: -5 }, { monto: b1.ms - 100, motivo: 'ab' }, { cobrado_por: admin.id }, { usuario_id: admin.id },
  ].map((extra) => resolver(carlos, { perdida_id: b1.pid, metodo: 'tarjeta', ...extra })))
  check('monto decimal, cero, negativo, motivo corto y campos ajenos (cobrado_por, usuario_id) → 400', invalidos.every((x) => x.status === 400), invalidos.map((x) => x.status))
  check('mesero → 403, sin sesión → 401, id inválido → 400, pérdida inexistente → 404', (await resolver(maria, { perdida_id: b1.pid, metodo: 'tarjeta' })).status === 403 && (await resolver(null, { perdida_id: b1.pid, metodo: 'tarjeta' })).status === 401 && (await resolver(carlos, { perdida_id: 'x' })).status === 400 && (await resolver(carlos, { perdida_id: L.UUID_FALSO, metodo: 'tarjeta' })).status === 404)
  check('nada de lo anterior dejó pagos ni resolvió la pérdida', (await nPagos(b1.O)) === 0 && !(await perdidaDb(b1.pid)).resuelto)

  const cuerpos = [
    { perdida_id: b1.pid, metodo: 'tarjeta' },
    { perdida_id: b1.pid, metodo: 'tarjeta', monto: b1.ms - 100, motivo: 'carrera A' },
    { perdida_id: b1.pid, metodo: 'tarjeta', monto: b1.ms - 200, motivo: 'carrera B' },
  ]
  const carrera = await Promise.all(cuerpos.map((c, i) => sleep(i * 20).then(() => resolver(carlos, c))))
  const gano = carrera.filter((x) => x.status === 200 || x.status === 201)
  const dbB1 = await perdidaDb(b1.pid)
  const pagoB1 = (await db`SELECT monto::float AS m FROM soda_master.pagos WHERE orden_id = ${b1.O}::uuid`)
  check('3 cobros retroactivos en paralelo con montos distintos: uno gana, los otros 409 y un solo pago', gano.length === 1 && carrera.filter((x) => x.status === 409).length === 2 && pagoB1.length === 1, carrera.map((x) => x.status))
  check('lo cobrado, lo condonado y la auditoría coinciden con el pago ganador', dbB1.resuelto && pagoB1[0].m === dbB1.cobrado && dbB1.condonado === b1.ms - dbB1.cobrado && (dbB1.condonado > 0 ? (await auditoria(b1.pid)).length === 1 && !!dbB1.motivo_condonacion : (await auditoria(b1.pid)).length === 0), { dbB1, pagoB1 })

  const b2 = await nuevaPerdida(8, [it(f.pR, 2), it(f.pP, 1)])
  const parcial = await resolver(carlos, { perdida_id: b2.pid, metodo: 'tarjeta', monto: b2.ms - 500, motivo: 'Cliente reclamó un plato frío' })
  const dbB2 = await perdidaDb(b2.pid)
  const pagoB2 = (await db`SELECT monto::float AS m, cobrado_por::text AS por, metodo FROM soda_master.pagos WHERE id = ${dbB2.pago_id}::uuid`)[0]
  const audB2 = await auditoria(b2.pid)
  check('cobro parcial con motivo: 201 y la respuesta informa lo condonado', parcial.status === 201 && parcial.json.monto === b2.ms - 500 && parcial.json.monto_condonado === 500 && parcial.json.monto_registrado === b2.ms, parcial)
  check('el parcial queda resuelto con cobrado, condonado y motivo; el pago es el parcial y lo cobra la sesión', dbB2.resuelto && dbB2.cobrado === b2.ms - 500 && dbB2.condonado === 500 && dbB2.motivo_condonacion === 'Cliente reclamó un plato frío' && pagoB2.m === b2.ms - 500 && pagoB2.por === carlos.id && pagoB2.metodo === 'tarjeta', [dbB2, pagoB2])
  check('el parcial deja UNA fila de auditoría con el usuario de la sesión, el motivo y las cifras', audB2.length === 1 && audB2[0].u === carlos.id && audB2[0].usuario_rol === 'cajero' && audB2[0].detalles.motivo === 'Cliente reclamó un plato frío' && Number(audB2[0].detalles.monto_condonado) === 500 && Number(audB2[0].detalles.monto_registrado) === b2.ms, audB2)
  check('la nota de la orden menciona la diferencia condonada y resolver de nuevo → 409', /condonada \$500/.test((await db`SELECT notas FROM soda_master.ordenes WHERE id = ${b2.O}::uuid`)[0].notas || '') && (await resolver(carlos, { perdida_id: b2.pid, metodo: 'tarjeta' })).status === 409)

  const b3 = await nuevaPerdida(8, [it(f.pP, 1)])
  const total = await resolver(carlos, { perdida_id: b3.pid, metodo: 'tarjeta', monto: b3.ms, motivo: 'no hace falta' })
  const dbB3 = await perdidaDb(b3.pid)
  check('cobro del total (monto explícito): sin condonación y sin fila de auditoría, aunque venga un motivo', total.status === 201 && dbB3.cobrado === b3.ms && dbB3.condonado === 0 && dbB3.motivo_condonacion === null && (await auditoria(b3.pid)).length === 0, dbB3)

  console.log('\n[asignaciones] F24: el cobro retroactivo en efectivo entra a la caja')
  if (ctx.cajaAjena) {
    console.log('  (hay una caja abierta ajena: se omiten las pruebas de efectivo y de cierre de caja)')
  } else {
    const c1 = await nuevaPerdida(8, [it(f.pP, 1)])
    const sinCaja = await resolver(carlos, { perdida_id: c1.pid, metodo: 'efectivo' })
    check('efectivo sin caja abierta → 409 CAJA_CERRADA, sin pago y la pérdida sigue pendiente', sinCaja.status === 409 && codigo(sinCaja) === 'CAJA_CERRADA' && (await nPagos(c1.O)) === 0 && !(await perdidaDb(c1.pid)).resuelto, sinCaja)
    const tarj = await resolver(carlos, { perdida_id: c1.pid, metodo: 'tarjeta' })
    check('tarjeta se permite sin caja y no mueve la caja', tarj.status === 201 && Number((await db`SELECT count(*)::int AS n FROM soda_master.movimientos_caja WHERE pago_id = ${tarj.json.pago_id}::uuid`)[0].n) === 0, tarj)

    const caja = await api(carlos, 'POST', '/api/caja', { fondo_inicial: 50000, notas: ctx.marca })
    const cajaId = (caja.json.caja && caja.json.caja.id) || caja.json.id
    check('abrir caja con fondo 50.000', [200, 201].includes(caja.status) && !!cajaId, caja)
    let efectivo = 0
    try {
      const c2 = await nuevaPerdida(8, [it(f.pP, 1), it(f.pR, 1)])
      const ef = await resolver(carlos, { perdida_id: c2.pid, metodo: 'efectivo' })
      efectivo += c2.ms
      const mv = await db`SELECT tipo, monto::float AS m, usuario_id::text AS u, caja_id::text AS caja FROM soda_master.movimientos_caja WHERE pago_id = ${ef.json.pago_id}::uuid`
      check('efectivo con caja abierta: un solo movimiento venta_efectivo con el monto, la caja abierta y el usuario de la sesión', ef.status === 201 && mv.length === 1 && mv[0].tipo === 'venta_efectivo' && mv[0].m === c2.ms && mv[0].u === carlos.id && mv[0].caja === cajaId, [ef.status, mv])

      const c3 = await nuevaPerdida(8, [it(f.pR, 2), it(f.pP, 1)])
      const ef3 = await resolver(carlos, { perdida_id: c3.pid, metodo: 'efectivo', monto: c3.ms - 300, motivo: 'Descuento de cortesía' })
      efectivo += c3.ms - 300
      const mv3 = await db`SELECT tipo, monto::float AS m FROM soda_master.movimientos_caja WHERE pago_id = ${ef3.json.pago_id}::uuid`
      check('efectivo parcial: el movimiento es lo cobrado, no lo registrado', ef3.status === 201 && mv3.length === 1 && mv3[0].m === c3.ms - 300, [ef3.status, mv3])

      const c4 = await nuevaPerdida(8, [it(f.pP, 1)])
      const dos = await Promise.all([0, 20].map((d) => sleep(d).then(() => resolver(carlos, { perdida_id: c4.pid, metodo: 'efectivo' }))))
      const g4 = dos.filter((x) => x.status === 201)
      if (g4.length === 1) efectivo += c4.ms
      const mv4 = await db`SELECT count(*)::int AS n FROM soda_master.movimientos_caja m JOIN soda_master.pagos p ON p.id = m.pago_id WHERE p.orden_id = ${c4.O}::uuid`
      check('2 cobros en efectivo en paralelo: uno gana, el otro 409 y un solo movimiento de caja', g4.length === 1 && dos.filter((x) => x.status === 409).length === 1 && Number(mv4[0].n) === 1, dos.map((x) => x.status))
    } finally {
      const cierre = await api(carlos, 'POST', '/api/caja/cerrar', { caja_id: cajaId, efectivo_contado: 50000 + efectivo, notas: ctx.marca })
      check('cierre de caja con el efectivo retroactivo contado: diferencia 0', cierre.status === 200 && Number(cierre.json.diferencia) === 0, cierre.json)
    }
  }
  // ───── Sesión 12 (B4, F18): el descuento por persona y en las pérdidas suma exacto ─────
  console.log('\n[asignaciones] B4: cuentas por persona y pérdidas con descuento (Σ exacta)')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  const b4_categoria = ((await api(admin, 'GET', '/api/productos')).json.find((p) => p.categoria) || {}).categoria
  ctx.limpiezaProd = ctx.limpiezaProd || []
  const b4_prodPrecio = async (precio) => {
    const rp = await api(admin, 'POST', '/api/productos', { nombre: `${ctx.marca} asig p${precio}`, categoria: b4_categoria, precio, descripcion: ctx.marca })
    if (rp.status !== 200) throw new Error(`no se pudo crear el producto de ${precio} (${rp.status})`)
    ctx.limpiezaProd.push(rp.json.id)
    return rp.json.id
  }
  const b4_q3333 = await b4_prodPrecio(3333)
  const b4_q4000 = await b4_prodPrecio(4000)
  const b4_descuentoB4 = (body) => api(admin, 'POST', '/api/descuentos', { motivo: ctx.marca, ...body })
  const b4_cobrarSel = async (Ord, sel) => {
    const probe = await api(carlos, 'POST', '/api/pagos', { orden_id: Ord, metodo: 'tarjeta', monto_esperado: 99999999, ...sel })
    if (probe.status !== 409 || probe.json.codigo !== 'MONTO_DISTINTO') return probe
    return api(carlos, 'POST', '/api/pagos', { orden_id: Ord, metodo: 'tarjeta', monto_esperado: Number(probe.json.monto_servidor), ...sel })
  }
  const b4_pagosB4 = async (Ord) => db`SELECT monto::float AS m, descuento::float AS d FROM soda_master.pagos WHERE orden_id = ${Ord}::uuid ORDER BY created_at`
  const b4_sumaM = (rows) => rows.reduce((t, x) => t + x.m, 0)
  const b4_perdidaDe = async (Ord) => (await db`SELECT id::text AS id, monto_perdido::float AS m FROM soda_master.perdidas_comanda WHERE orden_id = ${Ord}::uuid`)[0]

  // por persona: 3 b4_personas, una línea de 3 unidades asignada de a una; 10 % cobrado persona por persona
  const b4_rpp = await enviar(maria, { mesa_id: mesa[2], items: [it(b4_q3333, 3)] })
  const b4_Opp = b4_rpp.json.orden.id
  const b4_personas = []
  for (const nombre of ['A', 'B', 'C']) b4_personas.push(idDe(await api(maria, 'POST', '/api/cuentas-persona', { orden_id: b4_Opp, nombre })))
  await b4_descuentoB4({ orden_id: b4_Opp, tipo: 'porcentaje', valor: 10 })
  for (const pid of b4_personas) {
    const lineas = await db`SELECT id::text AS id, cantidad FROM soda_master.items_orden WHERE orden_id = ${b4_Opp}::uuid AND pagado = FALSE AND cuenta_persona_id IS NULL ORDER BY created_at`
    await asignar(maria, { orden_id: b4_Opp, asignaciones: [{ item_orden_id: lineas[0].id, cantidad: 1, cuenta_persona_id: pid }] })
  }
  let b4_ult = null
  for (const pid of b4_personas) {
    const suyos = await db`SELECT id::text AS id FROM soda_master.items_orden WHERE orden_id = ${b4_Opp}::uuid AND pagado = FALSE AND cuenta_persona_id = ${pid}::uuid`
    b4_ult = await b4_cobrarSel(b4_Opp, { item_orden_ids: suyos.map((x) => x.id) })
  }
  const b4_pgPP = await b4_pagosB4(b4_Opp)
  check('10 % por persona (3 b4_personas de 3.333, una línea asignada de a una): Σ pagos = 8.999 exacta y orden cerrada', b4_ult.status === 201 && b4_ult.json.orden_cerrada === true && b4_pgPP.length === 3 && b4_sumaM(b4_pgPP) === 8999, b4_pgPP)
  await L.limpiarMesas(ctx)

  // pérdida con descuento: lo que cobraría Pagos por lo que falta, y su cobro retroactivo completa el total
  const b4_r1 = await enviar(maria, { mesa_id: mesa[5], items: [it(b4_q4000, 1), it(b4_q4000, 1), it(b4_q4000, 1)] })
  const b4_O1 = b4_r1.json.orden.id
  await b4_descuentoB4({ orden_id: b4_O1, tipo: 'monto_fijo', valor: 3000 })
  await b4_cobrarSel(b4_O1, { item_orden_ids: [b4_r1.json.items[0].id] })
  const b4_reg1 = await api(admin, 'POST', '/api/perdidas', { orden_id: b4_O1, motivo: ctx.marca })
  const b4_per1 = await b4_perdidaDe(b4_O1)
  check('pérdida tras un cobro parcial con fijo 3.000: monto_perdido = 6.000 (lo que falta menos el descuento restante) y Σ pagos + pérdida = 9.000', [200, 201].includes(b4_reg1.status) && b4_per1 && b4_per1.m === 6000 && b4_sumaM(await b4_pagosB4(b4_O1)) + b4_per1.m === 9000, [b4_reg1.status, b4_per1])
  const b4_res1 = await api(carlos, 'POST', '/api/perdidas/resolver', { perdida_id: b4_per1.id, metodo: 'tarjeta' })
  const b4_pgR1 = await b4_pagosB4(b4_O1)
  check('cobro retroactivo del total: un pago de 6.000 y Σ pagos de la orden = 9.000 exacta', b4_res1.status === 201 && b4_pgR1.length === 2 && b4_sumaM(b4_pgR1) === 9000, [b4_res1.status, b4_pgR1])

  // F18: borrar un ítem sin pagar entre el cobro parcial y la pérdida
  const b4_r2 = await enviar(maria, { mesa_id: mesa[6], items: [it(b4_q4000, 1), it(b4_q4000, 1), it(b4_q4000, 1)] })
  const b4_O2 = b4_r2.json.orden.id
  await b4_descuentoB4({ orden_id: b4_O2, tipo: 'monto_fijo', valor: 3000 })
  await b4_cobrarSel(b4_O2, { item_orden_ids: [b4_r2.json.items[0].id] })
  await api(maria, 'DELETE', '/api/items-orden', { id: b4_r2.json.items[2].id })
  const b4_reg2 = await api(admin, 'POST', '/api/perdidas', { orden_id: b4_O2, motivo: ctx.marca })
  const b4_per2 = await b4_perdidaDe(b4_O2)
  check('F18: cobro A, borro C, pérdida de B → monto_perdido = 2.000 (antes 2.500) y Σ pagos + pérdida = 5.000 = 8.000 − 3.000', [200, 201].includes(b4_reg2.status) && b4_per2 && b4_per2.m === 2000 && b4_sumaM(await b4_pagosB4(b4_O2)) + b4_per2.m === 5000, [b4_reg2.status, b4_per2])

  // pérdida con porcentaje sin cobros previos: igual a lo que cobraría Pagos
  const b4_r3 = await enviar(maria, { mesa_id: mesa[7], items: [it(b4_q3333, 1), it(b4_q3333, 1)] })
  const b4_O3 = b4_r3.json.orden.id
  await b4_descuentoB4({ orden_id: b4_O3, tipo: 'porcentaje', valor: 10 })
  const b4_probe3 = await api(carlos, 'POST', '/api/pagos', { orden_id: b4_O3, metodo: 'tarjeta', monto_esperado: 99999999 })
  const b4_reg3 = await api(admin, 'POST', '/api/perdidas', { orden_id: b4_O3, motivo: ctx.marca })
  const b4_per3 = await b4_perdidaDe(b4_O3)
  check('pérdida con 10 % y sin cobros: monto_perdido = 5.999 = lo que cobraría Pagos', [200, 201].includes(b4_reg3.status) && Number(b4_probe3.json.monto_servidor) === 5999 && b4_per3 && b4_per3.m === 5999, [b4_probe3.json, b4_per3])

  // pérdida concurrente con un cobro y con un descuento en la misma orden (3 rondas): cada operación gana o pierde por completo
  let rondasP = 0
  for (let k = 0; k < 3; k++) {
    const b4_rr = await enviar(maria, { mesa_id: mesa[8], items: [it(b4_q4000, 1), it(b4_q4000, 1)] })
    const b4_Oc = b4_rr.json.orden.id
    await b4_descuentoB4({ orden_id: b4_Oc, tipo: 'monto_fijo', valor: 1000 })
    const [b4_rp1, b4_rp2] = await Promise.all([
      api(admin, 'POST', '/api/perdidas', { orden_id: b4_Oc, motivo: ctx.marca }),
      sleep(15 * k).then(() => b4_descuentoB4({ orden_id: b4_Oc, tipo: 'monto_fijo', valor: 2000 })),
    ])
    const per = await b4_perdidaDe(b4_Oc)
    const fila = await db`SELECT valor::float AS v FROM soda_master.descuentos WHERE orden_id = ${b4_Oc}::uuid`
    const est = (await L.ordenRow(ctx, b4_Oc)).estado
    // o la pérdida se registró con el descuento viejo (7.000) y el nuevo se rechazó (409), o el descuento nuevo entró antes y la pérdida se calculó con él (6.000)
    const coherente = (b4_rp2.status === 201 && fila[0].v === 2000 && per && per.m === 6000 && est === 'perdida') || (b4_rp2.status === 409 && fila[0].v === 1000 && per && per.m === 7000 && est === 'perdida') || (b4_rp1.status === 409 && per === undefined)
    if (coherente && fila.length === 1) rondasP++
    await L.limpiarMesas(ctx)
  }
  check(`pérdida y cambio de descuento en paralelo: un resultado coherente con una sola fila de descuento (${rondasP}/3)`, rondasP === 3)

  await L.limpiarMesas(ctx)
}
