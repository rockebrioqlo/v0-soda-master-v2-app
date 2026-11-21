/**
 * Módulo `mesas` (sesión 15): #23, F23 y F56.
 *
 *  1. #23: nombre personalizado de mesa, guardado y único (sin distinguir mayúsculas ni espacios de más);
 *     los nombres con forma "mesa <número>" solo valen con el número de la propia mesa (400 si no);
 *     choque de nombre o de número → 409 (nunca 500), también en la creación y entre dos peticiones a la vez.
 *  2. F23: `mesas.estado = 'ocupada'` se escribe DENTRO de la transacción del envío de la comanda (el POS ya no
 *     hace una segunda llamada): una comanda enviada nunca deja la mesa libre, y un envío rechazado no la toca.
 *  3. F56: pasar una mesa a `libre` con una comanda activa con ítems → 409 `MESA_CON_COMANDA` (servidor, cualquier rol);
 *     la carrera "enviar contra liberar" nunca deja una mesa libre con comanda activa, y el candado de `actualizarMesa`
 *     usa EXACTAMENTE la misma clave de lock advisory que el envío (se comprueba tomando esa clave desde la prueba).
 *
 * Las mesas que crea la prueba (nombre con la marca de la corrida) se borran en `limpiar`; las mesas de prueba reales que se
 * renombran (la 10) se restauran en el `finally` y `limpiar` lo garantiza. No toca las mesas 1 y 4.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib.cjs')
const { check, api, sleep, eq, enviar, it } = L

exports.nombre = 'mesas'

const RAIZ = path.resolve(__dirname, '..', '..')
const sorted = (a) => [...a].sort((x, y) => x - y)

exports.correr = async function (ctx) {
  const { f, mesa, admin, mesero, cajero, db, marca } = ctx
  const maria = mesero
  const carlos = cajero
  const N = (s) => `${marca} ${s}`
  const listar = async () => (await api(admin, 'GET', '/api/mesas')).json
  const nombreApi = async (id) => (await listar()).find((m) => m.id === id)?.nombre
  // `to_jsonb(m)->>'nombre'` funciona con y sin la columna nueva (sin ella da null): así la prueba falla en vez de romperse.
  const nombreCrudo = async (id) => (await db`SELECT to_jsonb(m)->>'nombre' AS n FROM soda_master.mesas m WHERE id = ${id}::uuid`)[0]?.n ?? null
  const estadoDe = async (n) => (await db`SELECT estado FROM soda_master.mesas WHERE id = ${mesa[n]}::uuid`)[0].estado
  const patch = (ses, id, body) => api(ses, 'PATCH', '/api/mesas', { id, ...body })
  const libre = (n) => patch(admin, mesa[n], { estado: 'libre' })
  const crear = async (nombre, extra = {}) => {
    const r = await api(admin, 'POST', '/api/mesas', { ...(nombre === undefined ? {} : { nombre }), capacidad: 2, ...extra })
    if (r.status === 201 && r.json?.id) (ctx.mesasPrueba = ctx.mesasPrueba || []).push(r.json.id)
    return r
  }
  const maxNumero = async () => Math.max(...(await listar()).map((m) => Number(m.numero)))
  const cod = (r) => r.json?.codigo
  const es409Nombre = (r) => r.status === 409 && cod(r) === 'NOMBRE_DUPLICADO'
  const es400Reservado = (r) => r.status === 400 && cod(r) === 'NOMBRE_RESERVADO'
  const n0 = (await listar()).length

  // ───────────────────────── 1. #23: nombre personalizado ─────────────────────────
  console.log('\n[mesas] #23: crear con nombre personalizado')
  const a = await crear(N('alfa'))
  check('crear con nombre → 201 y el nombre pedido (antes salía "Mesa N")', a.status === 201 && a.json?.nombre === N('alfa'), [a.status, a.json])
  check('GET /api/mesas trae el nombre guardado', (await nombreApi(a.json?.id)) === N('alfa'))
  const b = await crear(`  ${marca}   Beta   X  `)
  check('espacios de más: se guardan normalizados (bordes recortados, internos a uno)', b.status === 201 && b.json?.nombre === `${marca} Beta X`, [b.status, b.json?.nombre])
  const c0 = await crear(undefined)
  check('sin nombre: 201 y el nombre por defecto "Mesa <número>"', c0.status === 201 && c0.json?.nombre === `Mesa ${c0.json?.numero}`, [c0.status, c0.json])
  const cantes = (await listar()).length
  const duplicados = [N('alfa'), N('alfa').toUpperCase(), `  ${N('alfa').replace(' ', '    ')}  `]
  const rd = []
  for (const d of duplicados) rd.push(await crear(d))
  check('crear con un nombre ya usado (igual, con otras mayúsculas o con espacios de más) → 409 NOMBRE_DUPLICADO', rd.every(es409Nombre), rd.map((r) => [r.status, cod(r)]))
  check('los rechazos no crearon mesas', (await listar()).length === cantes)

  console.log('\n[mesas] #23: forma "mesa <número>" reservada para la propia mesa')
  const rr = []
  for (const x of ['mesa 5', '  MESA    5 ', 'Mesa5', 'mesa 05', 'mesa 0']) rr.push(await crear(x))
  check('"mesa 5" (sin importar mayúsculas, espacios o ceros) → 400 NOMBRE_RESERVADO: no es el número de la mesa que se crea', rr.every(es400Reservado), rr.map((r) => [r.status, cod(r)]))
  const M = await maxNumero()
  const prop = await crear(`  MESA  ${M + 1} `)
  check('"mesa <siguiente libre>" sí vale: queda con ese número y su nombre por defecto', prop.status === 201 && Number(prop.json?.numero) === M + 1 && prop.json?.nombre === `Mesa ${M + 1}`, [prop.status, prop.json])
  const M2 = await maxNumero()
  const ajena = await crear(`mesa ${M2 + 5}`, { numero: M2 + 1 })
  check('con número explícito, "mesa <otro número>" → 400', es400Reservado(ajena), [ajena.status, cod(ajena)])
  const igual = await crear(`MESA ${M2 + 1}`, { numero: M2 + 1 })
  check('con número explícito, "mesa <ese número>" → 201', igual.status === 201 && igual.json?.nombre === `Mesa ${M2 + 1}`, [igual.status, igual.json])
  const largo = await crear('x'.repeat(61))
  const vacio = await crear('   ')
  check('crear con nombre de 61 caracteres o solo espacios → 400', largo.status === 400 && vacio.status === 400, [largo.status, vacio.status])

  console.log('\n[mesas] #23: editar el nombre')
  const e1 = await patch(admin, a.json.id, { nombre: N('alfa2') })
  check('editar el nombre → 200 y se guarda (antes se ignoraba)', e1.status === 200 && e1.json?.nombre === N('alfa2') && (await nombreApi(a.json.id)) === N('alfa2'), [e1.status, e1.json])
  const e2 = await patch(admin, a.json.id, { nombre: N('alfa2') })
  const e3 = await patch(admin, a.json.id, { nombre: N('ALFA2') })
  check('renombrarse a sí misma: el mismo nombre → 200; solo cambiar las mayúsculas → 200 y queda como se escribió', e2.status === 200 && e3.status === 200 && e3.json?.nombre === N('ALFA2'), [e2.status, e3.status, e3.json?.nombre])
  const antes = await nombreApi(a.json.id)
  const choques = [await patch(admin, a.json.id, { nombre: `${marca} Beta X` }), await patch(admin, a.json.id, { nombre: `${marca} BETA X`.toLowerCase() }), await patch(admin, a.json.id, { nombre: `  ${marca}  beta   x ` })]
  check('editar al nombre de otra mesa (otras mayúsculas, espacios de más) → 409 NOMBRE_DUPLICADO y no cambia', choques.every(es409Nombre) && (await nombreApi(a.json.id)) === antes, choques.map((r) => [r.status, cod(r)]))
  const rs = [await patch(admin, a.json.id, { nombre: 'mesa 5' }), await patch(admin, a.json.id, { nombre: 'MESA   7' }), await patch(admin, a.json.id, { nombre: `mesa ${Number(a.json.numero) + 1}` })]
  check('editar a "mesa <número que no es el suyo>" → 400 NOMBRE_RESERVADO', rs.every(es400Reservado) && (await nombreApi(a.json.id)) === antes, rs.map((r) => [r.status, cod(r)]))
  const eProp = await patch(admin, a.json.id, { nombre: ` MESA  ${a.json.numero}` })
  check('editar a "Mesa <su propio número>" → 200: vuelve al nombre por defecto', eProp.status === 200 && eProp.json?.nombre === `Mesa ${a.json.numero}` && (await nombreCrudo(a.json.id)) === null, [eProp.status, eProp.json?.nombre, await nombreCrudo(a.json.id)])
  await patch(admin, a.json.id, { nombre: N('alfa') })
  const inval = [await patch(admin, a.json.id, { nombre: '' }), await patch(admin, a.json.id, { nombre: '    ' }), await patch(admin, a.json.id, { nombre: 'y'.repeat(61) }), await patch(admin, a.json.id, { nombre: 'x', zz: 1 }), await patch(admin, a.json.id, { nombre: 5 })]
  check('editar con nombre vacío, solo espacios, de 61 caracteres, campo desconocido o no texto → 400', inval.every((r) => r.status === 400), inval.map((r) => r.status))
  const r403 = [await patch(maria, a.json.id, { nombre: N('hack') }), await patch(carlos, a.json.id, { nombre: N('hack') })]
  check('mesero y cajero: cambiar el nombre → 403 ROL_SIN_PERMISO y no cambia', r403.every((r) => r.status === 403 && cod(r) === 'ROL_SIN_PERMISO') && (await nombreApi(a.json.id)) === N('alfa'), r403.map((r) => [r.status, cod(r)]))
  const pid1 = await api(admin, 'PATCH', '/api/mesas/' + a.json.id, { nombre: N('alfa3') })
  const pid2 = await api(admin, 'PATCH', '/api/mesas/' + a.json.id, { nombre: `${marca} beta x` })
  check('PATCH /api/mesas/[id]: renombra (200) y el duplicado da 409 NOMBRE_DUPLICADO', pid1.status === 200 && pid1.json?.nombre === N('alfa3') && es409Nombre(pid2), [pid1.status, pid2.status, cod(pid2)])
  const num = await patch(admin, a.json.id, { numero: 5 })
  check('cambiar el número a uno que ya existe → 409 (no 500) y no cambia', num.status === 409 && cod(num) === 'NUMERO_DUPLICADO' && (await listar()).find((m) => m.id === a.json.id)?.numero === a.json.numero, [num.status, cod(num), num.json])
  const numOk = await patch(admin, a.json.id, { numero: M2 + 50 })
  check('cambiar el número a uno libre → 200; el nombre personalizado se conserva', numOk.status === 200 && Number(numOk.json?.numero) === M2 + 50 && numOk.json?.nombre === N('alfa3'), [numOk.status, numOk.json])

  console.log('\n[mesas] #23: carreras (3 rondas)')
  const cA = await crear(N('carrera A'))
  const cB = await crear(N('carrera B'))
  for (let r = 1; r <= 3; r++) {
    const nombre = N(`gana ${r}`)
    const [x, y] = await Promise.all([patch(admin, cA.json.id, { nombre }), patch(admin, cB.json.id, { nombre })])
    const duenos = (await listar()).filter((m) => m.nombre === nombre).length
    check(`ronda ${r}: dos renombres a la vez al mismo nombre → un 200 y un 409, una sola mesa lo tiene`, eq(sorted([x.status, y.status]), [200, 409]) && duenos === 1 && [x, y].filter((q) => q.status === 409).every(es409Nombre), [x.status, y.status, duenos])
  }
  for (let r = 1; r <= 3; r++) {
    const nombre = N(`crea ${r}`)
    const [x, y] = await Promise.all([crear(nombre), crear(nombre)])
    const duenos = (await listar()).filter((m) => m.nombre === nombre).length
    check(`ronda ${r}: dos creaciones a la vez con el mismo nombre → un 201 y un 409 NOMBRE_DUPLICADO, una sola mesa`, eq(sorted([x.status, y.status]), [201, 409]) && duenos === 1 && [x, y].filter((q) => q.status === 409).every(es409Nombre), [x.status, y.status, duenos])
  }

  // nombre personalizado en los pagos (la mesa de prueba 10 se renombra y se restaura)
  console.log('\n[mesas] #23: el nombre llega a los pagos (mesa de prueba 10 renombrada y restaurada)')
  await L.limpiarMesas(ctx, [10])
  await L.reponer(ctx, L.BIG)
  try {
    const rn = await patch(admin, mesa[10], { nombre: N('pagos') })
    check('renombrar la mesa 10 de prueba → 200', rn.status === 200 && rn.json?.nombre === N('pagos'), [rn.status, rn.json])
    const ro = await enviar(maria, { mesa_id: mesa[10], items: [it(f.pP, 1)] })
    const pg = await api(carlos, 'POST', '/api/pagos', { orden_id: ro.json?.orden?.id, metodo: 'tarjeta', monto_esperado: 1500 })
    const lp = (await api(admin, 'GET', '/api/pagos')).json
    const mio = Array.isArray(lp) ? lp.find((p) => p.id === pg.json?.id) : null
    check('el pago de esa mesa trae `mesa_nombre` con el nombre personalizado', ro.status === 200 && pg.status === 201 && mio?.mesa_nombre === N('pagos'), [ro.status, pg.status, mio?.mesa_nombre])
  } finally {
    await L.limpiarMesas(ctx, [10])
    const rest = await patch(admin, mesa[10], { nombre: 'Mesa 10' })
    check('la mesa 10 vuelve a su nombre original', rest.status === 200 && rest.json?.nombre === 'Mesa 10' && (await nombreCrudo(mesa[10])) === null, [rest.status, rest.json?.nombre])
  }

  // ───────────────────────── 2. F23: la mesa pasa a ocupada dentro del envío ─────────────────────────
  console.log('\n[mesas] F23: enviar la comanda deja la mesa ocupada, en la misma transacción')
  await L.limpiarMesas(ctx)
  await L.reponer(ctx, L.BIG)
  await libre(2)
  await libre(3)
  check('punto de partida: mesas 2 y 3 libres', (await estadoDe(2)) === 'disponible' && (await estadoDe(3)) === 'disponible')
  const ev1 = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pP, 1)] })
  check('enviar a una mesa libre → 200 y la mesa queda ocupada SIN otra llamada (antes quedaba libre)', ev1.status === 200 && (await estadoDe(2)) === 'ocupada', [ev1.status, await estadoDe(2)])
  const OA = ev1.json?.orden?.id
  const ev2 = await enviar(maria, { orden_id: OA, items: [it(f.pP, 1)] })
  check('agregar ítems a la orden existente → 200 y la mesa sigue ocupada', ev2.status === 200 && (await estadoDe(2)) === 'ocupada', [ev2.status])
  await patch(admin, mesa[3], { estado: 'reservada' })
  const ev3 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pP, 1)] })
  check('una mesa reservada pasa a ocupada al enviar', ev3.status === 200 && (await estadoDe(3)) === 'ocupada', [ev3.status, await estadoDe(3)])
  await L.limpiarMesas(ctx, [3])
  await libre(3)
  // rechazos: todo o nada, la mesa no cambia
  await L.reponer(ctx, { ...L.BIG, P: 0 })
  const rech1 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pP, 1)] })
  check('envío rechazado por stock (409) → la mesa sigue libre y no queda orden', rech1.status === 409 && (await estadoDe(3)) === 'disponible' && (await L.activasMesa(ctx, 3)).length === 0, [rech1.status, await estadoDe(3)])
  await L.reponer(ctx, L.BIG)
  const rech2 = await enviar(maria, { mesa_id: mesa[3], items: [] })
  const rech3 = await enviar(null, { mesa_id: mesa[3], items: [it(f.pP, 1)] })
  const rech4 = await enviar(maria, { mesa_id: L.UUID_FALSO, items: [it(f.pP, 1)] })
  check('envío sin ítems (400), sin sesión (401) o a una mesa que no existe (404) → la mesa sigue libre', rech2.status === 400 && rech3.status === 401 && rech4.status === 404 && (await estadoDe(3)) === 'disponible', [rech2.status, rech3.status, rech4.status])

  console.log('\n[mesas] F23: carreras con el envío (3 rondas)')
  for (let r = 1; r <= 3; r++) {
    await L.limpiarMesas(ctx, [5])
    await libre(5)
    const [x, y] = await Promise.all([enviar(maria, { mesa_id: mesa[5], items: [it(f.pP, 1)] }), enviar(maria, { mesa_id: mesa[5], items: [it(f.pP, 1)] })])
    const act = await L.activasMesa(ctx, 5)
    check(`ronda ${r}: dos envíos a la vez a una mesa libre → un 200 y un 409 COMANDA_ACTIVA; una sola orden y la mesa ocupada`, eq(sorted([x.status, y.status]), [200, 409]) && [x, y].filter((q) => q.status === 409).every((q) => cod(q) === 'COMANDA_ACTIVA') && act.length === 1 && (await estadoDe(5)) === 'ocupada', [x.status, y.status, act.length, await estadoDe(5)])
  }
  for (let r = 1; r <= 3; r++) {
    await L.limpiarMesas(ctx, [6])
    await libre(6)
    const o = await enviar(maria, { mesa_id: mesa[6], items: [it(f.pP, 1)] })
    const O = o.json.orden.id
    const monto = 1500
    const [env, pago] = await Promise.all([enviar(maria, { orden_id: O, items: [it(f.pP, 1)] }), api(carlos, 'POST', '/api/pagos', { orden_id: O, metodo: 'tarjeta', monto_esperado: monto })])
    const t = await L.totalesOk(ctx, O)
    const items = await L.itemsDe(ctx, O)
    const coherente = [200, 409].includes(env.status) && [201, 409].includes(pago.status) && t.ok && (await estadoDe(6)) === 'ocupada' && (await L.huerfanos(ctx)) === 0
    check(`ronda ${r}: enviar a una orden contra un cobro de esa orden → resultado coherente, mesa ocupada, totales cuadran (envío ${env.status}, cobro ${pago.status}, ${items.length} ítems)`, coherente, [env.status, pago.status, t, await estadoDe(6)])
  }
  for (let r = 1; r <= 3; r++) {
    await L.limpiarMesas(ctx, [7])
    await libre(7)
    const o = await enviar(maria, { mesa_id: mesa[7], items: [it(f.pP, 1)] })
    const O = o.json.orden.id
    const [env, del] = await Promise.all([enviar(maria, { orden_id: O, items: [it(f.pP, 1)] }), api(admin, 'DELETE', '/api/ordenes', { id: O })])
    const existe = await L.ordenRow(ctx, O)
    const items = existe ? await L.itemsDe(ctx, O) : []
    const coherente = [200, 404, 409].includes(env.status) && [200, 409].includes(del.status) && (await L.huerfanos(ctx)) === 0 && (existe ? items.length >= 1 : true) && (await estadoDe(7)) === 'ocupada'
    check(`ronda ${r}: enviar a una orden contra borrarla → sin ítems huérfanos y mesa ocupada (envío ${env.status}, borrado ${del.status}, orden ${existe ? 'sigue' : 'borrada'})`, coherente, [env.status, del.status, !!existe, items.length])
  }

  // ───────────────────────── 3. F56: candado de "liberar" en el servidor ─────────────────────────
  console.log('\n[mesas] F56: pasar a libre con una comanda activa con ítems → 409 MESA_CON_COMANDA')
  await L.limpiarMesas(ctx)
  await libre(2)
  const o56 = await enviar(maria, { mesa_id: mesa[2], items: [it(f.pP, 1)] })
  const O56 = o56.json.orden.id
  const l1 = await patch(maria, mesa[2], { estado: 'libre' })
  const l2 = await patch(carlos, mesa[2], { estado: 'libre' })
  const l3 = await patch(admin, mesa[2], { estado: 'libre' })
  const l4 = await api(admin, 'PATCH', '/api/mesas/' + mesa[2], { estado: 'libre' })
  check('mesero, cajero y admin (por las dos rutas) → 409 MESA_CON_COMANDA, y la mesa sigue ocupada', [l1, l2, l3, l4].every((r) => r.status === 409 && cod(r) === 'MESA_CON_COMANDA') && (await estadoDe(2)) === 'ocupada', [l1, l2, l3, l4].map((r) => [r.status, cod(r)]))
  const l5 = await patch(maria, mesa[2], { estado: 'reservada' })
  const l6 = await patch(admin, mesa[2], { estado: 'ocupada' })
  check('pasarla a reservada u ocupada con comanda activa sigue en 200', l5.status === 200 && l6.status === 200, [l5.status, l6.status])
  const cap2 = Number((await listar()).find((m) => m.id === mesa[2]).capacidad)
  const l7 = await patch(admin, mesa[2], { capacidad: cap2 })
  const l8 = await patch(admin, mesa[2], { capacidad: cap2, estado: 'libre' })
  check('cambiar solo la capacidad → 200; pedir libre junto con otro campo → 409 igual', l7.status === 200 && l8.status === 409, [l7.status, l8.status])
  const can = await api(admin, 'PATCH', '/api/ordenes', { id: O56, estado: 'cancelado', notas: marca })
  const l9 = await patch(maria, mesa[2], { estado: 'libre' })
  check('con la comanda cancelada → 200 y la mesa queda libre (la liberación forzada del admin cancela primero)', can.status === 200 && l9.status === 200 && (await estadoDe(2)) === 'disponible', [can.status, l9.status])
  // pagada
  await L.limpiarMesas(ctx, [3])
  await libre(3)
  const o57 = await enviar(maria, { mesa_id: mesa[3], items: [it(f.pP, 1)] })
  const pg57 = await api(carlos, 'POST', '/api/pagos', { orden_id: o57.json.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })
  check('tras el cobro total la mesa NO se libera sola (la libera una persona desde Mesas)', pg57.status === 201 && (await estadoDe(3)) === 'ocupada', [pg57.status, await estadoDe(3)])
  const l10 = await patch(maria, mesa[3], { estado: 'libre' })
  check('con la comanda pagada → 200 y la mesa queda libre ("Pagada — listo para liberar")', l10.status === 200 && (await estadoDe(3)) === 'disponible', [l10.status])
  // activa sin ítems
  await L.limpiarMesas(ctx, [7])
  await libre(7)
  const vacia = await api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[7] })
  const l11 = await patch(maria, mesa[7], { estado: 'libre' })
  check('con una orden activa SIN ítems → no bloquea: 200', vacia.status < 300 && l11.status === 200, [vacia.status, l11.status])

  console.log('\n[mesas] F56: carreras "enviar contra liberar" (3 rondas con comanda nueva y 3 con orden existente)')
  const invariante = async (n) => !((await L.activasMesa(ctx, n)).length > 0 && (await estadoDe(n)) === 'disponible')
  for (let r = 1; r <= 3; r++) {
    await L.limpiarMesas(ctx, [8])
    await patch(admin, mesa[8], { estado: r === 3 ? 'libre' : 'ocupada' })
    const [e, l] = await Promise.all([enviar(maria, { mesa_id: mesa[8], items: [it(f.pP, 1)] }), patch(admin, mesa[8], { estado: 'libre' })])
    const ok = e.status === 200 && [200, 409].includes(l.status) && (await invariante(8)) && (l.status === 409 ? cod(l) === 'MESA_CON_COMANDA' : true)
    check(`ronda ${r}: envío (${e.status}) contra liberar (${l.status}) con comanda nueva → nunca queda la mesa libre con comanda activa`, ok, [e.status, l.status, await estadoDe(8), (await L.activasMesa(ctx, 8)).length])
  }
  for (let r = 1; r <= 3; r++) {
    await L.limpiarMesas(ctx, [9])
    await patch(admin, mesa[9], { estado: 'ocupada' })
    const v = await api(maria, 'POST', '/api/ordenes', { mesa_id: mesa[9] })
    const [e, l] = await Promise.all([enviar(maria, { orden_id: v.json?.id, items: [it(f.pP, 1)] }), patch(admin, mesa[9], { estado: 'libre' })])
    const ok = v.status < 300 && e.status === 200 && [200, 409].includes(l.status) && (await invariante(9))
    check(`ronda ${r}: envío (${e.status}) contra liberar (${l.status}) sobre una orden existente → nunca queda libre con comanda activa`, ok, [v.status, e.status, l.status, await estadoDe(9)])
  }

  console.log('\n[mesas] F23/F56: el candado de actualizarMesa y el envío usan la MISMA clave de lock advisory')
  const src = fs.readFileSync(path.join(RAIZ, 'lib', 'db.ts'), 'utf8')
  const defs = (src.match(/pg_advisory_xact_lock\(hashtext\(/g) || []).length
  const usos = (src.match(/sentenciaLockMesa\(/g) || []).length
  check('lib/db.ts define la clave en UN solo lugar (`sentenciaLockMesa`) y la usan al menos la apertura/envío y `actualizarMesa`', defs === 1 && usos >= 4, [defs, usos])
  await L.limpiarMesas(ctx)
  await libre(5)
  await libre(6)
  await libre(7)
  await L.reponer(ctx, L.BIG)
  const vO = await enviar(maria, { mesa_id: mesa[10], items: [it(f.pP, 1)] })
  const idOrdenExistente = vO.json?.orden?.id
  const sostener = (id, ms) => db.transaction([db`SELECT pg_advisory_xact_lock(hashtext(${id}::uuid::text)::bigint)`, db`SELECT pg_sleep(${ms / 1000}::float8)`])
  const medir = async (fn) => {
    const t = Date.now()
    const r = await fn()
    return { ms: Date.now() - t, r }
  }
  // la clave la toma la propia prueba con la fórmula del servidor; si la petición tarda lo que dura la espera, comparte la clave
  const h5 = sostener(mesa[5], 5000)
  const h6 = sostener(mesa[6], 5000)
  const h10 = sostener(mesa[10], 5000)
  await sleep(1500)
  const [mLibre, mEnviar, mOrden, mControl] = await Promise.all([
    medir(() => patch(admin, mesa[5], { estado: 'libre' })),
    medir(() => enviar(maria, { mesa_id: mesa[6], items: [it(f.pP, 1)] })),
    medir(() => enviar(maria, { orden_id: idOrdenExistente, items: [it(f.pP, 1)] })),
    medir(() => patch(admin, mesa[7], { estado: 'libre' })),
  ])
  await Promise.all([h5, h6, h10])
  check(`con la clave de la mesa tomada: actualizarMesa espera (${mLibre.ms} ms), el envío de comanda nueva espera (${mEnviar.ms} ms) y el envío a una orden existente espera (${mOrden.ms} ms)`, mLibre.ms >= 1800 && mEnviar.ms >= 1800 && mOrden.ms >= 1800 && mLibre.r.status === 200 && mEnviar.r.status === 200 && mOrden.r.status === 200, [mLibre.ms, mEnviar.ms, mOrden.ms, mLibre.r.status, mEnviar.r.status, mOrden.r.status])
  check(`una mesa distinta no espera (${mControl.ms} ms)`, mControl.ms < 1800 && mControl.r.status === 200, [mControl.ms, mControl.r.status])
  await L.limpiarMesas(ctx)
  check('sin ítems huérfanos ni órdenes activas de prueba al terminar', (await L.huerfanos(ctx)) === 0 && (await Promise.all(ctx.MESAS.map((n) => L.activasMesa(ctx, n)))).every((x) => x.length === 0))
  check('las mesas creadas por esta prueba están registradas para borrarse', Array.isArray(ctx.mesasPrueba) && ctx.mesasPrueba.length >= 8 && (await listar()).length >= n0)
}
