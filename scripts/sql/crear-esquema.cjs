/**
 * Sesión 23 (F2): crea el esquema base (`scripts/sql/esquema-base.sql`) en un esquema VACÍO.
 *
 *   pnpm db:esquema-base --esquema=soda_master     (base nueva de un local: la app usa soda_master fijo)
 *   pnpm db:esquema-base --esquema=<otro>
 *
 * Usa la `DATABASE_URL` de `.env.local`. Antes de enviar nada revisa (solo lectura) que el esquema no tenga tablas:
 * si tiene, se niega y termina con código 1 sin tocar nada. Todas las sentencias van en una sola transacción.
 * No siembra datos (el primer admin y la configuración van aparte: ver P3 en ROADMAP.md).
 */
const path = require('path')
const { createRequire } = require('module')
const E = require('./esquema-base.cjs')

const req = createRequire(path.join(__dirname, '..', '..', 'package.json'))
const { neon } = req('@neondatabase/serverless')

;(async () => {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--esquema='))
  if (!arg) {
    console.error('Falta el esquema de destino: pnpm db:esquema-base --esquema=<nombre> (para una base nueva, --esquema=soda_master).')
    process.exit(2)
  }
  const esquema = arg.slice('--esquema='.length).trim()
  try {
    E.validarNombreEsquema(esquema)
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL: corre el comando con pnpm db:esquema-base (carga .env.local).')
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)
  try {
    const n = await E.crearEsquemaBase(sql, esquema)
    const est = await E.leerEstructura(sql, esquema)
    const tablas = est.relaciones.filter((r) => r.tipo === 'r').length
    console.log(`Esquema base creado en "${esquema}": ${n} sentencias en una transacción, ${tablas} tablas, ${est.indices.length} índices y ${est.funciones.length} funciones.`)
    if (esquema !== E.ESQUEMA_ORIGEN) console.log(`Ojo: la app solo usa el esquema ${E.ESQUEMA_ORIGEN}; "${esquema}" sirve para pruebas o revisión.`)
  } catch (e) {
    console.error(e.codigo === 'ESQUEMA_NO_VACIO' ? e.message : `No se creó el esquema (la transacción se revirtió): ${e.message}`)
    process.exit(1)
  }
})()
