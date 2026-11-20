/**
 * Módulo `unidades` (sesión 11): inventario con unidad de compra y de consumo, factor real por compra,
 * costo promedio ponderado en SQL, rendimiento, `crearCompra` atómico, ajuste de stock con movimiento
 * y validaciones. Lo corre `stock.cjs` al final (`--modulo=stock`) y también solo (`--modulo=unidades`).
 * Todo lo que crea queda marcado con la marca de la corrida y se desactiva al limpiar.
 */
const L = require('./lib.cjs')
const { check, api, eq, enviar, it, sleep } = L

exports.nombre = 'unidades'

const UUID_FALSO = L.UUID_FALSO || '00000000-0000-4000-8000-000000000001'
const casi = (a, b, tol = 0.00015) => Math.abs(Number(a) - Number(b)) <= tol

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina, db, marca, mesa } = ctx
  ctx.limpiezaIng = ctx.limpiezaIng || []
  ctx.limpiezaProd = ctx.limpiezaProd || []

  const mkIng = async (nombre, extra = {}) => {
    const r = await api(admin, 'POST', '/api/ingredientes', { nombre: `${marca} ${nombre}`, ...extra })
    if (r.status !== 201) throw new Error(`no se pudo crear el insumo ${nombre} (${r.status}) ${JSON.stringify(r.json)}`)
    ctx.limpiezaIng.push(r.json.id)
    return r.json.id
  }
  const lista = await api(admin, 'GET', '/api/productos')
  const categoria = (lista.json.find((p) => p.categoria) || {}).categoria
  const mkProd = async (nombre, lineas) => {
    const r = await api(admin, 'POST', '/api/productos', { nombre: `${marca} ${nombre}`, categoria, precio: 5000, descripcion: marca })
    if (r.status !== 200) throw new Error(`no se pudo crear el producto ${nombre} (${r.status})`)
    ctx.limpiezaProd.push(r.json.id)
    await api(admin, 'POST', '/api/recetas', { producto_id: r.json.id, nombre: marca, modo_stock: 'receta', ingredientes: lineas })
    return r.json.id
  }
  const fila = async (id) =>
    (await db`SELECT stock_actual::float AS s, costo_unitario::float AS c, unidad_medida AS um, unidad_compra AS uc,
                     factor_compra::float AS f, rendimiento_pct::float AS r, activo
              FROM soda_master.ingredientes WHERE id = ${id}::uuid`)[0]
  const compra = (items, extra = {}) =>
    api(admin, 'POST', '/api/compras', { numero_documento: 'P-' + Date.now().toString().slice(-6), notas: marca, items, ...extra })
  const cuentas = async () => ({
    compras: Number((await db`SELECT count(*)::int AS n FROM soda_master.compras`)[0].n),
    items: Number((await db`SELECT count(*)::int AS n FROM soda_master.compra_items`)[0].n),
    movs: await L.movCount(ctx),
  })
  const movs = (id, tipo) =>
    db`SELECT cantidad::float AS cantidad, notas, compra_id::text AS compra_id FROM soda_master.movimientos_inventario
       WHERE ingrediente_id = ${id}::uuid AND tipo = ${tipo} ORDER BY created_at, id`

  await L.limpiarMesas(ctx)

  // ───────────── compra con factor por defecto y corregido ─────────────
  console.log('\n[unidades] compra: factor por defecto y factor corregido')
  const sal = await mkIng('salchicha', { unidad_medida: 'unidad', unidad_compra: 'paquete', factor_compra: 20 })
  const s0 = await fila(sal)
  check('insumo nuevo: unidad de consumo, de compra, factor 20 y rendimiento 100 por defecto', s0.um === 'unidad' && s0.uc === 'paquete' && s0.f === 20 && s0.r === 100 && s0.s === 0, s0)
  const c1 = await compra([{ ingrediente_id: sal, cantidad: 2, precio_unitario: 9000 }])
  const s1 = await fila(sal)
  check('2 paquetes a $9.000 con el factor por defecto: 201, stock 40 y costo $450 por unidad (18.000 / 40)', c1.status === 201 && s1.s === 40 && casi(s1.c, 450), [c1.status, s1])
  const ci1 = await db`SELECT factor::float AS f, cantidad_consumo::float AS q, unidad_compra AS uc, unidad_consumo AS um, subtotal::float AS sub
                       FROM soda_master.compra_items WHERE compra_id = ${c1.json.id}::uuid`
  check('compra_items guarda factor 20, cantidad_consumo 40 y las unidades', ci1.length === 1 && ci1[0].f === 20 && ci1[0].q === 40 && ci1[0].uc === 'paquete' && ci1[0].um === 'unidad' && ci1[0].sub === 18000, ci1)
  check('la cabecera suma lo pagado (subtotal y total 18.000) y el movimiento `compra` es de 40 unidades', Number(c1.json.subtotal) === 18000 && Number(c1.json.total) === 18000 && eq((await movs(sal, 'compra')).map((m) => m.cantidad), [40]))
  const c2 = await compra([{ ingrediente_id: sal, cantidad: 1, precio_unitario: 9000, factor: 18 }])
  const s2 = await fila(sal)
  const esp2 = Math.round(((40 * 450 + 9000) / 58) * 1e4) / 1e4
  check(`factor corregido a 18: stock 58 y costo promedio ponderado ${esp2} (dos compras de factor distinto)`, c2.status === 201 && s2.s === 58 && casi(s2.c, esp2), [c2.status, s2, esp2])
  const det = await api(admin, 'GET', '/api/compras/' + c2.json.id)
  check('el detalle de la compra trae el factor real (18) y lo que entró (18 unidad)', det.status === 200 && Number(det.json.items[0].factor) === 18 && Number(det.json.items[0].cantidad_consumo) === 18, det.json)
  const c2b = await compra([{ ingrediente_id: sal, cantidad: 1, precio_unitario: 9000, factor: null }])
  check('factor null usa el del insumo (20): stock 78', c2b.status === 201 && (await fila(sal)).s === 78)
  const antes3 = await fila(sal)
  const c3 = await compra([
    { ingrediente_id: sal, cantidad: 1, precio_unitario: 10000, factor: 22 },
    { ingrediente_id: sal, cantidad: 1, precio_unitario: 9000, factor: 18 },
  ])
  const s3 = await fila(sal)
  const esp3 = (antes3.s * antes3.c + 19000) / (antes3.s + 40)
  check('dos líneas del mismo insumo con factores distintos en una compra: stock +40 y promedio ponderado correcto', c3.status === 201 && s3.s === antes3.s + 40 && casi(s3.c, esp3, 0.0002), [s3, esp3])
  // las dos filas comparten created_at (misma transacción): se comparan sin depender del orden
  check('una línea = un movimiento `compra` (22 y 18)', eq((await movs(sal, 'compra')).slice(-2).map((m) => m.cantidad).sort((a, b) => a - b), [18, 22]))

  // ───────────── insumo antiguo: factor 1 y rendimiento 100 ─────────────
  console.log('\n[unidades] insumo antiguo (factor 1, rendimiento 100%) sin cambios')
  const leg = await mkIng('antiguo', { stock_actual: 10, costo_unitario: 100 })
  const l0 = await fila(leg)
  check('un insumo creado como antes (solo unidad, stock y costo): unidad de compra NULL, factor 1, rendimiento 100', l0.uc === null && l0.f === 1 && l0.r === 100 && l0.s === 10 && l0.c === 100, l0)
  const lista2 = await api(admin, 'GET', '/api/ingredientes')
  const legApi = lista2.json.find((i) => i.id === leg)
  check('la API devuelve unidad_compra = unidad de consumo, factor_compra 1 y rendimiento_pct 100', legApi && legApi.unidad_compra === 'unidad' && legApi.factor_compra === 1 && legApi.rendimiento_pct === 100, legApi)
  const cl = await compra([{ ingrediente_id: leg, cantidad: 5, precio_unitario: 130 }])
  const l1 = await fila(leg)
  check('compra sin factor sobre un insumo antiguo: +5 y costo (10×100 + 5×130)/15 = 110, igual que antes', cl.status === 201 && l1.s === 15 && casi(l1.c, 110), l1)
  const cil = await db`SELECT factor::float AS f, cantidad_consumo::float AS q FROM soda_master.compra_items WHERE compra_id = ${cl.json.id}::uuid`
  check('compra_items del insumo antiguo: factor 1 y cantidad_consumo igual a la cantidad', cil[0].f === 1 && cil[0].q === 5)
  const ent = await movs(leg, 'entrada')
  check('el stock inicial al crear el insumo dejó un movimiento `entrada` de 10', eq(ent.map((m) => m.cantidad), [10]))

  // ───────────── recetas en unidad, en g y con rendimiento ─────────────
  console.log('\n[unidades] descuento por receta: unidad, gramos y rendimiento')
  const pSal = await mkProd('completo', [{ ingrediente_id: sal, cantidad: 1 }])
  const carne = await mkIng('carne cruda', { unidad_medida: 'g', unidad_compra: 'kg', factor_compra: 1000 })
  const cc = await compra([{ ingrediente_id: carne, cantidad: 2, precio_unitario: 8000 }])
  const k0 = await fila(carne)
  check('2 kg a $8.000 (factor 1000 por defecto): stock 2.000 g y costo $8 por gramo', cc.status === 201 && k0.s === 2000 && casi(k0.c, 8), k0)
  const pCarne = await mkProd('hamburguesa 150 g', [{ ingrediente_id: carne, cantidad: 150 }])
  const sBase = (await fila(sal)).s
  const r1 = await enviar(mesero, { mesa_id: mesa[2], items: [it(pSal, 2)] })
  check('receta en unidad (1 salchicha por completo): 2 completos descuentan 2 unidades', r1.status === 200 && (await fila(sal)).s === sBase - 2, r1.status)
  const r2 = await enviar(mesero, { mesa_id: mesa[3], items: [it(pCarne, 2)] })
  check('receta en gramos (150 g): 2 hamburguesas descuentan 300 g (2.000 → 1.700)', r2.status === 200 && (await fila(carne)).s === 1700, r2.status)
  await L.limpiarMesas(ctx, [2, 3])
  check('borrar las órdenes devuelve las unidades y los gramos', (await fila(sal)).s === sBase && (await fila(carne)).s === 2000)

  const rp = await api(admin, 'PATCH', '/api/ingredientes/' + carne, { rendimiento_pct: 75 })
  check('rendimiento 75% se puede cambiar en un insumo con stock y recetas (200)', rp.status === 200 && rp.json.rendimiento_pct === 75, rp)
  const r3 = await enviar(mesero, { mesa_id: mesa[5], items: [it(pCarne, 1)] })
  const itemCarne = (await L.itemsDe(ctx, r3.json.orden.id))[0]
  const mv = await db`SELECT cantidad::float AS c FROM soda_master.movimientos_inventario WHERE item_orden_id = ${itemCarne.id}::uuid AND ingrediente_id = ${carne}::uuid AND tipo = 'venta'`
  check('rendimiento 75%: 150 g pedidos descuentan 200 g (2.000 → 1.800) y el movimiento de venta dice 200', r3.status === 200 && (await fila(carne)).s === 1800 && eq(mv.map((m) => m.c), [200]), [r3.status, mv])
  const r4 = await enviar(mesero, { orden_id: r3.json.orden.id, items: [it(pCarne, 3)] })
  check('3 hamburguesas más: 450 g pedidos → 600 g descontados (1.800 → 1.200)', r4.status === 200 && (await fila(carne)).s === 1200)
  const pm = await api(admin, 'GET', '/api/margenes')
  const mCarne = (pm.json || []).find((m) => m.producto_id === pCarne)
  check('márgenes: costo de la receta con rendimiento = 150 × 100 / 75 × $8 = $1.600', pm.status === 200 && mCarne && casi(mCarne.costo_receta, 1600, 0.01), mCarne)
  const mSal = (pm.json || []).find((m) => m.producto_id === pSal)
  check('márgenes: la receta en unidad cuesta 1 × costo por unidad de la salchicha', mSal && casi(mSal.costo_receta, (await fila(sal)).c, 0.006), [mSal, (await fila(sal)).c])

  // devolución con rendimiento: usa lo registrado, aunque el rendimiento cambie después
  await api(admin, 'PATCH', '/api/ingredientes/' + carne, { rendimiento_pct: 50 })
  const its = await L.itemsDe(ctx, r3.json.orden.id)
  const dels = await api(mesero, 'DELETE', '/api/items-orden', { id: its.find((i) => Number(i.cantidad) === 1).id })
  check('borrar un ítem pendiente devuelve los 200 g registrados, no los 300 g del rendimiento nuevo (50%)', dels.status === 200 && (await fila(carne)).s === 1400, [dels.status, (await fila(carne)).s])
  const canc = await api(admin, 'PATCH', '/api/ordenes', { id: r3.json.orden.id, estado: 'cancelado', notas: marca })
  check('cancelar devuelve los 600 g registrados: el stock vuelve a 2.000', canc.status === 200 && (await fila(carne)).s === 2000, [canc.status, (await fila(carne)).s])
  await api(admin, 'PATCH', '/api/ingredientes/' + carne, { rendimiento_pct: 75 })

  const arroz = await mkIng('arroz', { unidad_medida: 'g', rendimiento_pct: 250, stock_actual: 1000 })
  const pArroz = await mkProd('arroz 200 g cocido', [{ ingrediente_id: arroz, cantidad: 200 }])
  const r5 = await enviar(mesero, { mesa_id: mesa[6], items: [it(pArroz, 1)] })
  check('rendimiento 250% (el arroz sube al cocinarse): 200 g cocidos descuentan 80 g crudos (1.000 → 920)', r5.status === 200 && (await fila(arroz)).s === 920, [r5.status, (await fila(arroz)).s])
  await L.limpiarMesas(ctx, [6])

  // cantidades con decimales: el registro de movimientos las guarda exactas y la devolución las repite
  await api(admin, 'PATCH', '/api/ingredientes/' + carne, { rendimiento_pct: 70 })
  const r6 = await enviar(mesero, { mesa_id: mesa[7], items: [it(pCarne, 1)] })
  const it6 = (await L.itemsDe(ctx, r6.json.orden.id))[0]
  const mv6 = await db`SELECT cantidad::float AS c FROM soda_master.movimientos_inventario WHERE item_orden_id = ${it6.id}::uuid AND ingrediente_id = ${carne}::uuid AND tipo = 'venta'`
  check('rendimiento 70%: 150 g descuentan 214,286 g y el movimiento guarda los 3 decimales', r6.status === 200 && casi((await fila(carne)).s, 2000 - 214.286, 0.0005) && eq(mv6.map((m) => m.c), [214.286]), [r6.status, mv6, (await fila(carne)).s])
  await L.limpiarMesas(ctx, [7])
  check('borrar la orden devuelve exactamente 214,286 g (stock 2.000 otra vez)', (await fila(carne)).s === 2000, (await fila(carne)).s)
  await api(admin, 'PATCH', '/api/ingredientes/' + carne, { rendimiento_pct: 75 })

  // ───────────── carreras ─────────────
  console.log('\n[unidades] carreras (3 rondas)')
  const conc = await mkIng('carrera', { unidad_medida: 'unidad', unidad_compra: 'caja', factor_compra: 10, stock_actual: 5, costo_unitario: 50 })
  const defs = [
    { cantidad: 1, precio_unitario: 1000, factor: 10 },
    { cantidad: 2, precio_unitario: 1500, factor: 12 },
    { cantidad: 1, precio_unitario: 800, factor: 8 },
    { cantidad: 3, precio_unitario: 2000, factor: 10 },
  ]
  let malas = 0
  for (let ronda = 1; ronda <= 3; ronda++) {
    const a = await fila(conc)
    const rs = await Promise.all(defs.map((d, i) => sleep(i * (ronda === 1 ? 0 : 25)).then(() => compra([{ ingrediente_id: conc, ...d }]))))
    const b = await fila(conc)
    const q = defs.reduce((s, d) => s + d.cantidad * d.factor, 0)
    const pagado = defs.reduce((s, d) => s + d.cantidad * d.precio_unitario, 0)
    const esp = (a.s * a.c + pagado) / (a.s + q)
    const ok = rs.every((r) => r.status === 201) && b.s === a.s + q && casi(b.c, esp, 0.001)
    if (!ok) malas++
    check(`ronda ${ronda}: 4 compras simultáneas del mismo insumo → stock ${a.s}+${q} y costo promedio ${esp.toFixed(4)} (quedó ${b.c})`, ok, [rs.map((r) => r.status), a, b])
  }
  const pConc = await mkProd('carrera', [{ ingrediente_id: conc, cantidad: 1 }])
  for (let ronda = 1; ronda <= 3; ronda++) {
    const a = await fila(conc)
    const ms = [2, 3, 5]
    const [c1r, c2r, c3r, ...ventas] = await Promise.all([
      compra([{ ingrediente_id: conc, cantidad: 1, precio_unitario: 1100, factor: 10 }]),
      sleep(20).then(() => compra([{ ingrediente_id: conc, cantidad: 2, precio_unitario: 1900, factor: 9 }])),
      sleep(40).then(() => compra([{ ingrediente_id: conc, cantidad: 1, precio_unitario: 900, factor: 11 }])),
      ...ms.map((n, i) => sleep(i * 15).then(() => enviar(mesero, { mesa_id: mesa[n], items: [it(pConc, 1)] }))),
    ])
    const b = await fila(conc)
    const q = 10 + 18 + 11
    const ok = [c1r, c2r, c3r].every((r) => r.status === 201) && ventas.every((r) => r.status === 200) && b.s === a.s + q - 3
    if (!ok) malas++
    check(`ronda ${ronda}: 3 compras y 3 ventas simultáneas del mismo insumo → stock exacto (${a.s}+${q}−3 = ${a.s + q - 3}, quedó ${b.s})`, ok, [[c1r, c2r, c3r].map((r) => r.status), ventas.map((r) => r.status), a, b])
    await L.limpiarMesas(ctx, ms)
  }

  // ───────────── ajuste de stock con movimiento ─────────────
  console.log('\n[unidades] ajuste de stock')
  const aj0 = await fila(sal)
  const nm0 = (await movs(sal, 'ajuste')).length
  const aj = await api(admin, 'POST', `/api/ingredientes/${sal}/ajuste`, { stock_nuevo: 90, motivo: 'conteo físico ' + marca })
  const mAj = await movs(sal, 'ajuste')
  check(`ajustar a 90: 200 con anterior ${aj0.s} y nuevo 90`, aj.status === 200 && aj.json.anterior === aj0.s && aj.json.nuevo === 90 && (await fila(sal)).s === 90, aj.json)
  check('queda un movimiento `ajuste` con la diferencia con signo, el motivo y quién lo hizo', mAj.length === nm0 + 1 && mAj[mAj.length - 1].cantidad === 90 - aj0.s && /conteo físico/.test(mAj[mAj.length - 1].notas) && /Ajuste manual por/.test(mAj[mAj.length - 1].notas), mAj.slice(-1))
  await api(admin, 'POST', `/api/ingredientes/${sal}/ajuste`, { stock_nuevo: 90, motivo: 'sin cambio' })
  check('ajustar al mismo valor no crea movimiento', (await movs(sal, 'ajuste')).length === nm0 + 1)
  const mal = [
    ['motivo muy corto', { stock_nuevo: 5, motivo: 'ab' }],
    ['stock negativo', { stock_nuevo: -1, motivo: 'conteo' }],
    ['campo no permitido', { stock_nuevo: 5, motivo: 'conteo', costo_unitario: 1 }],
    ['sin motivo', { stock_nuevo: 5 }],
    ['stock como texto', { stock_nuevo: '5', motivo: 'conteo' }],
  ]
  for (const [nombre, body] of mal) {
    const r = await api(admin, 'POST', `/api/ingredientes/${sal}/ajuste`, body)
    check(`ajuste inválido (${nombre}): 400 y el stock sigue en 90`, r.status === 400 && (await fila(sal)).s === 90, [r.status, r.json])
  }
  const aj404 = await api(admin, 'POST', `/api/ingredientes/${UUID_FALSO}/ajuste`, { stock_nuevo: 5, motivo: 'conteo' })
  check('ajustar un insumo inexistente: 404 INSUMO_NO_ENCONTRADO', aj404.status === 404 && aj404.json.codigo === 'INSUMO_NO_ENCONTRADO', aj404)
  const aj400 = await api(admin, 'POST', `/api/ingredientes/no-es-uuid/ajuste`, { stock_nuevo: 5, motivo: 'conteo' })
  check('id que no es uuid: 400', aj400.status === 400, aj400)

  // ───────────── PATCH sin stock y unidad en uso ─────────────
  console.log('\n[unidades] PATCH de insumos: sin stock y UNIDAD_EN_USO')
  const pst = await api(admin, 'PATCH', '/api/ingredientes/' + sal, { stock_actual: 999 })
  check('PATCH con stock_actual: 400 (campo no permitido) y el stock no cambia', pst.status === 400 && /stock_actual/.test(pst.json.error || '') && (await fila(sal)).s === 90, pst)
  const uso = await api(admin, 'PATCH', '/api/ingredientes/' + sal, { unidad_medida: 'g' })
  check('cambiar la unidad de consumo de un insumo con stock, recetas y compras: 409 UNIDAD_EN_USO', uso.status === 409 && uso.json.codigo === 'UNIDAD_EN_USO' && (await fila(sal)).um === 'unidad', uso)
  const mismo = await api(admin, 'PATCH', '/api/ingredientes/' + sal, { unidad_medida: 'unidad', nombre: `${marca} salchicha` })
  check('mandar la misma unidad no es un cambio (200)', mismo.status === 200)
  const nuevo = await mkIng('sin historial')
  const libre = await api(admin, 'PATCH', '/api/ingredientes/' + nuevo, { unidad_medida: 'ml' })
  check('un insumo recién creado, sin stock ni recetas ni movimientos, sí cambia de unidad (200)', libre.status === 200 && libre.json.unidad_medida === 'ml', libre)
  const uc = await api(admin, 'PATCH', '/api/ingredientes/' + sal, { unidad_compra: 'caja', factor_compra: 24, rendimiento_pct: 90 })
  check('unidad de compra, factor y rendimiento se editan libremente en un insumo con historial', uc.status === 200 && uc.json.unidad_compra === 'caja' && uc.json.factor_compra === 24 && uc.json.rendimiento_pct === 90, uc.json)
  const ucNull = await api(admin, 'PATCH', '/api/ingredientes/' + sal, { unidad_compra: null, factor_compra: 20, rendimiento_pct: 100 })
  check('unidad_compra null vuelve a "igual a la de consumo"', ucNull.status === 200 && ucNull.json.unidad_compra === 'unidad', ucNull.json)

  // ───────────── validaciones (400) y atomicidad ─────────────
  console.log('\n[unidades] validaciones y todo-o-nada')
  const base = await cuentas()
  const sBefore = (await fila(sal)).s
  const item = { ingrediente_id: sal, cantidad: 1, precio_unitario: 1000 }
  const invalidas = [
    ['factor 0', { items: [{ ...item, factor: 0 }] }],
    ['factor negativo', { items: [{ ...item, factor: -3 }] }],
    ['factor como texto', { items: [{ ...item, factor: '20' }] }],
    ['cantidad 0', { items: [{ ...item, cantidad: 0 }] }],
    ['cantidad negativa', { items: [{ ...item, cantidad: -2 }] }],
    ['cantidad como texto', { items: [{ ...item, cantidad: '2' }] }],
    ['precio negativo', { items: [{ ...item, precio_unitario: -1 }] }],
    ['sin ítems', { items: [] }],
    ['insumo que no es uuid', { items: [{ ...item, ingrediente_id: 'abc' }] }],
    ['campo no permitido en la compra (usuario_id)', { items: [item], usuario_id: UUID_FALSO }],
    ['campo no permitido en el ítem (subtotal)', { items: [{ ...item, subtotal: 1 }] }],
    ['fecha mal escrita', { items: [item], fecha: '20-11-2026' }],
    ['tipo de documento desconocido', { items: [item], tipo_documento: 'ticket' }],
  ]
  for (const [nombre, extra] of invalidas) {
    const r2 = await api(admin, 'POST', '/api/compras', { notas: marca, ...extra })
    check(`compra inválida (${nombre}): 400 DATOS_INVALIDOS`, r2.status === 400 && r2.json.codigo === 'DATOS_INVALIDOS', [r2.status, r2.json])
  }
  const despuesInv = await cuentas()
  check('ninguna compra inválida dejó cabeceras, ítems, movimientos ni stock', eq(base, despuesInv) && (await fila(sal)).s === sBefore, [base, despuesInv])
  const at1 = await compra([item, { ingrediente_id: UUID_FALSO, cantidad: 1, precio_unitario: 1 }])
  check('segundo ítem con insumo inexistente: 404 INSUMO_NO_ENCONTRADO y NADA del primero quedó', at1.status === 404 && at1.json.codigo === 'INSUMO_NO_ENCONTRADO' && eq(await cuentas(), base) && (await fila(sal)).s === sBefore, [at1, await cuentas()])
  const at2 = await compra([item, { ingrediente_id: carne, cantidad: 900000, precio_unitario: 1, factor: 1000000 }])
  check('segundo ítem que desborda el stock (900.000 × 1.000.000): 400 CANTIDAD_INVALIDA y nada quedó', at2.status === 400 && at2.json.codigo === 'CANTIDAD_INVALIDA' && eq(await cuentas(), base) && (await fila(sal)).s === sBefore, [at2, await cuentas()])
  const at3 = await compra([item], { proveedor_id: UUID_FALSO })
  check('proveedor inexistente: 400 PROVEEDOR_NO_ENCONTRADO y nada quedó', at3.status === 400 && at3.json.codigo === 'PROVEEDOR_NO_ENCONTRADO' && eq(await cuentas(), base) && (await fila(sal)).s === sBefore, [at3, await cuentas()])
  const inact = await mkIng('inactivo')
  await api(admin, 'PATCH', '/api/ingredientes/' + inact, { activo: false })
  const at4 = await compra([item, { ingrediente_id: inact, cantidad: 1, precio_unitario: 1 }])
  check('insumo dado de baja: 404 INSUMO_NO_ENCONTRADO y nada quedó', at4.status === 404 && eq(await cuentas(), base) && (await fila(sal)).s === sBefore, at4)

  const ingInv = [
    ['rendimiento 0', { rendimiento_pct: 0 }],
    ['rendimiento 301', { rendimiento_pct: 301 }],
    ['rendimiento negativo', { rendimiento_pct: -5 }],
    ['factor 0', { factor_compra: 0 }],
    ['factor negativo', { factor_compra: -2 }],
    ['unidad de consumo vacía', { unidad_medida: '' }],
    ['stock inicial negativo', { stock_actual: -1 }],
    ['campo no permitido', { activo: true }],
  ]
  for (const [nombre, extra] of ingInv) {
    const r = await api(admin, 'POST', '/api/ingredientes', { nombre: `${marca} inválido`, ...extra })
    check(`crear insumo inválido (${nombre}): 400`, r.status === 400, [r.status, r.json])
  }
  for (const [nombre, extra] of ingInv.filter(([n]) => n !== 'stock inicial negativo' && n !== 'campo no permitido')) {
    const r = await api(admin, 'PATCH', '/api/ingredientes/' + sal, extra)
    check(`editar insumo inválido (${nombre}): 400`, r.status === 400, [r.status, r.json])
  }
  const vacio = await api(admin, 'PATCH', '/api/ingredientes/' + sal, {})
  check('PATCH sin campos: 400', vacio.status === 400, vacio)
  const lim1 = await mkIng('rend 1', { rendimiento_pct: 1 })
  const lim300 = await mkIng('rend 300', { rendimiento_pct: 300 })
  check('rendimiento 1 y 300 son los extremos válidos', (await fila(lim1)).r === 1 && (await fila(lim300)).r === 300)
  const f4 = await mkIng('factor decimal', { unidad_medida: 'unidad', unidad_compra: 'kg', factor_compra: 6.5 })
  const cf = await compra([{ ingrediente_id: f4, cantidad: 2.5, precio_unitario: 5000 }])
  const f4s = await fila(f4)
  check('factor decimal: 2,5 kg × 6,5 = 16,25 unidades y costo 12.500 / 16,25 = $769,2308', cf.status === 201 && f4s.s === 16.25 && casi(f4s.c, 769.2308), f4s)

  // ───────────── permisos ─────────────
  console.log('\n[unidades] 401 y 403')
  const base2 = await cuentas()
  const sBefore2 = (await fila(sal)).s
  const cuerpoCompra = { items: [item] }
  const rutas = [
    ['POST', '/api/compras', cuerpoCompra],
    ['POST', '/api/ingredientes', { nombre: `${marca} no debe crearse` }],
    ['PATCH', '/api/ingredientes/' + sal, { stock_minimo: 1 }],
    ['POST', `/api/ingredientes/${sal}/ajuste`, { stock_nuevo: 1, motivo: 'conteo' }],
  ]
  for (const [m, ruta, body] of rutas) {
    const sin = await api(null, m, ruta, body)
    check(`${m} ${ruta.replace(sal, ':id')} sin sesión: 401`, sin.status === 401, sin)
    for (const [rol, ses] of [['mesero', mesero], ['cajero', cajero], ['cocina', cocina]]) {
      const r = await api(ses, m, ruta, body)
      check(`${m} ${ruta.replace(sal, ':id')} con ${rol}: 403`, r.status === 403, r)
    }
  }
  check('los intentos sin permiso no cambiaron nada', eq(await cuentas(), base2) && (await fila(sal)).s === sBefore2, [base2, await cuentas()])

  // ───────────── conciliación: el stock es la suma de sus movimientos ─────────────
  console.log('\n[unidades] conciliación de stock con movimientos')
  const ids = [sal, leg, carne, arroz, conc, f4, nuevo, lim1, lim300]
  let sinConciliar = []
  for (const id of ids) {
    const f = await fila(id)
    const m = await db`
      SELECT COALESCE(SUM(CASE WHEN tipo IN ('entrada','compra','ajuste','devolucion') THEN cantidad
                               WHEN tipo = 'venta' THEN -cantidad ELSE 0 END), 0)::float AS neto
      FROM soda_master.movimientos_inventario WHERE ingrediente_id = ${id}::uuid`
    if (!casi(f.s, m[0].neto, 0.0011)) sinConciliar.push([id, f.s, m[0].neto])
  }
  check('para cada insumo de prueba, stock = entradas + compras + ajustes + devoluciones − ventas', sinConciliar.length === 0, sinConciliar)
  check('las carreras de compras no dejaron ninguna ronda inconsistente', malas === 0, malas)
  await L.limpiarMesas(ctx)
}
