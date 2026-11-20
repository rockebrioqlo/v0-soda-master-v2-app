/**
 * `pnpm prueba:completa` — todas las baterías de las sesiones 5 a 8: cobro, órdenes, permisos,
 * asignaciones y pérdidas, stock, y el sondeo agrupado (sesión 10). Las carreras son de 3 rondas como máximo.
 *
 * Para correr solo una parte (p. ej. si una sesión tocó cobro, caja o stock):
 *   pnpm prueba:completa --modulo=stock          (también: cobro, ordenes, permisos, asignaciones, sondeo)
 *   pnpm prueba:completa --modulo=cobro,stock
 * Requiere el servidor levantado (ver lib.cjs). Todo lo creado queda marcado "prueba prueba:completa <fecha>".
 */
const L = require('./lib.cjs')

const MODULOS = {
  permisos: require('./permisos.cjs'),
  ordenes: require('./ordenes.cjs'),
  stock: require('./stock.cjs'),
  cobro: require('./cobro.cjs'),
  asignaciones: require('./asignaciones.cjs'),
  sondeo: require('./sondeo.cjs'),
}

;(async () => {
  const t0 = Date.now()
  const arg = process.argv.find((a) => a.startsWith('--modulo='))
  const pedidos = arg ? arg.slice('--modulo='.length).split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(MODULOS)
  const desconocidos = pedidos.filter((m) => !MODULOS[m])
  if (desconocidos.length) {
    console.error(`Módulo desconocido: ${desconocidos.join(', ')}. Disponibles: ${Object.keys(MODULOS).join(', ')}`)
    process.exit(2)
  }
  let ctx = null
  let avisos = []
  try {
    ctx = await L.crearContexto('prueba:completa')
    console.log(`Servidor ${L.BASE} · marca "${ctx.marca}" · módulos: ${pedidos.join(', ')}`)
    await L.crearFixtures(ctx)
    for (const nombre of pedidos) {
      const antes = L.res.fail
      try {
        await MODULOS[nombre].correr(ctx)
      } catch (e) {
        L.check(`el módulo ${nombre} no se interrumpió (${e.message})`, false)
      }
      console.log(`  → módulo ${nombre}: ${L.res.fail === antes ? 'OK' : 'CON FALLOS'}`)
      await L.limpiarMesas(ctx)
    }
  } catch (e) {
    L.check('la prueba no se interrumpió: ' + e.message, false)
  } finally {
    if (ctx) avisos = await L.limpiar(ctx)
  }
  for (const a of avisos) console.log('  AVISO:', a)
  const ok = L.resumen('prueba:completa') && avisos.length === 0
  console.log(`Duración: ${Math.round((Date.now() - t0) / 1000)} s`)
  process.exit(ok ? 0 : 1)
})()
