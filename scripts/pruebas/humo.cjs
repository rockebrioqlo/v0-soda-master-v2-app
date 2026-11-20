/**
 * `pnpm prueba:humo` — prueba de humo (pocos minutos): login real de los 4 roles, comanda, cobro en
 * efectivo con vuelto, tarjeta, doble cobro 409 y cierre de caja con diferencia 0.
 * Requiere el servidor levantado (ver lib.cjs). Todo lo creado queda marcado "prueba prueba:humo <fecha>".
 */
const L = require('./lib.cjs')
const { check, api, enviar, it } = L

;(async () => {
  const t0 = Date.now()
  let ctx = null
  let avisos = []
  try {
    ctx = await L.crearContexto('prueba:humo')
    console.log(`Servidor ${L.BASE} · marca "${ctx.marca}"`)
    const { admin, mesero, cajero, cocina, mesa } = ctx

    console.log('\n[humo] sesiones y rutas protegidas')
    for (const [rol, ses] of [['admin', admin], ['mesero', mesero], ['cajero', cajero], ['cocina', cocina]]) {
      check(`login real de ${rol}: /api/auth/sesion 200`, (await api(ses, 'GET', '/api/auth/sesion')).status === 200)
    }
    check('sin sesión → 401', (await api(null, 'GET', '/api/ordenes')).status === 401 && (await api(null, 'POST', '/api/pagos', {})).status === 401)
    check('cocina no cobra ni abre caja (403)', (await api(cocina, 'POST', '/api/pagos', {})).status === 403 && (await api(cocina, 'POST', '/api/caja', { fondo_inicial: 1 })).status === 403)

    await L.crearFixtures(ctx)
    const f = ctx.f
    console.log('\n[humo] comanda y cobro')
    const sinCaja = !ctx.cajaAjena
    let cajaId = null
    if (sinCaja) {
      const caja = await api(cajero, 'POST', '/api/caja', { fondo_inicial: 50000, notas: ctx.marca })
      cajaId = (caja.json.caja && caja.json.caja.id) || caja.json.id
      check('abrir caja con fondo 50.000', [200, 201].includes(caja.status) && !!cajaId, caja)
    } else {
      console.log('  (hay una caja abierta ajena: se omiten efectivo y cierre de caja)')
    }
    const r1 = await enviar(mesero, { mesa_id: mesa[2], items: [it(f.pP, 2), it(f.pR, 1)] })
    check('el mesero envía una comanda: 200, en cocina, total 4000', r1.status === 200 && r1.json.orden.estado === 'en_cocina' && Number(r1.json.orden.total) === 4000, r1)
    let efectivo = 0
    if (sinCaja) {
      const ef = await api(cajero, 'POST', '/api/pagos', { orden_id: r1.json.orden.id, metodo: 'efectivo', monto_esperado: 4000, efectivo_recibido: 5000 })
      check('cobro en efectivo con vuelto: 201 y vuelto 1000', ef.status === 201 && Number(ef.json.vuelto) === 1000 && ef.json.orden_cerrada === true, ef)
      efectivo = 4000
      check('doble cobro → 409', (await api(cajero, 'POST', '/api/pagos', { orden_id: r1.json.orden.id, metodo: 'efectivo', monto_esperado: 4000, efectivo_recibido: 5000 })).status === 409)
    }
    const r2 = await enviar(mesero, { mesa_id: mesa[3], items: [it(f.pP, 1)] })
    const tj = await api(cajero, 'POST', '/api/pagos', { orden_id: r2.json.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })
    check('cobro con tarjeta: 201', tj.status === 201, tj)
    check('doble cobro con tarjeta → 409', (await api(cajero, 'POST', '/api/pagos', { orden_id: r2.json.orden.id, metodo: 'tarjeta', monto_esperado: 1500 })).status === 409)
    check('monto manipulado → 409 y mesero cobrando → 403', (await api(cajero, 'POST', '/api/pagos', { orden_id: (await enviar(mesero, { mesa_id: mesa[5], items: [it(f.pP, 1)] })).json.orden.id, metodo: 'tarjeta', monto_esperado: 1 })).status === 409 && (await api(mesero, 'POST', '/api/pagos', {})).status === 403)
    if (sinCaja && cajaId) {
      const cierre = await api(cajero, 'POST', '/api/caja/cerrar', { caja_id: cajaId, efectivo_contado: 50000 + efectivo, notas: ctx.marca })
      check('cierre de caja con el efectivo exacto: diferencia 0', cierre.status === 200 && Number(cierre.json.diferencia) === 0, cierre.json)
    }
  } catch (e) {
    check('la prueba no se interrumpió: ' + e.message, false)
  } finally {
    if (ctx) avisos = await L.limpiar(ctx)
  }
  for (const a of avisos) console.log('  AVISO:', a)
  const ok = L.resumen('prueba:humo') && avisos.length === 0
  console.log(`Duración: ${Math.round((Date.now() - t0) / 1000)} s`)
  process.exit(ok ? 0 : 1)
})()
