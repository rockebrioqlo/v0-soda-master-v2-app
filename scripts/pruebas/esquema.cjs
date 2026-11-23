/**
 * Sesión 23 (F2): el esquema base (`scripts/sql/esquema-base.sql`) contra la base real y contra las `ensure*Schema()`.
 *
 *   pnpm prueba:esquema                          (sola, sin servidor: solo habla con Neon)
 *   pnpm prueba:completa --modulo=esquema        (dentro de la batería; el servidor solo lo pide completa.cjs)
 *
 * Qué comprueba:
 *  A. Extrae de `lib/db.ts` el MISMO texto SQL de TODAS las funciones `ensure*` (encontradas por nombre, no con una lista
 *     fija): las plantillas sql`…` que son ALTER, CREATE o DO, más las sentencias de `sentenciasTablaSolicitudes()`
 *     (lib/arco-sql.ts) que `ensureSolicitudesArcoSchema` corre con `sql.query`. Una plantilla con `${…}` o un
 *     `sql.query` que no se sabe expandir hace FALLAR la prueba nombrando la función (nunca se salta en silencio). Además,
 *     todo DDL de `lib/` y `app/` debe estar dentro de una `ensure*` (una migración escrita en otra parte también falla).
 *  B. Crea `prueba_esquema_<id>`, ejecuta el script y compara su estructura con la de soda_master leída de pg_catalog
 *     (tablas, columnas con su orden, tipo, nulabilidad y default, restricciones, índices, funciones, secuencias,
 *     triggers, tipos y vistas).
 *  C. Rechazos: el comando se niega con un esquema que ya tiene tablas (también con soda_master: solo LEE el catálogo,
 *     no envía ninguna sentencia del script), la guarda del propio script aborta, y una transacción que falla no deja
 *     nada. El comando por consola: sin --esquema, con un nombre inválido, con soda_master y con un esquema nuevo.
 *  D. Corre las sentencias de las `ensure*` sobre el esquema temporal (dos veces, como dos instancias): ninguna falla y
 *     la estructura no cambia. Si alguien agrega una migración a lib/db.ts y no al script, falla aquí.
 *
 * Nunca ejecuta el script ni una sentencia de las ensure* contra soda_master: de soda_master solo lee el catálogo.
 * Al iniciar elimina los `prueba_esquema_*` de corridas abortadas y al terminar (`finally`) los suyos.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { createRequire } = require('module')
const L = require('./lib.cjs')
const E = require('../sql/esquema-base.cjs')

const RAIZ = path.resolve(__dirname, '..', '..')
const req = createRequire(path.join(RAIZ, 'package.json'))
const { neon } = req('@neondatabase/serverless')
const { check } = L
const importar = (...p) => import('file:///' + path.join(RAIZ, ...p).split(path.sep).join('/'))

const PREFIJO = 'prueba_esquema_'
const RE_DDL = /\b(CREATE\s+(UNIQUE\s+)?INDEX|CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|CREATE\s+SEQUENCE|CREATE\s+TYPE|CREATE\s+VIEW|CREATE\s+TRIGGER|CREATE\s+EXTENSION)\b/gi
/** `sql.query` dentro de una ensure* que se sabe expandir: el generador y de dónde se importa. */
const GENERADORES = {
  sentenciasTablaSolicitudes: { archivo: ['lib', 'arco-sql.ts'] },
}

const leerTexto = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r\n/g, '\n')

/** Funciones `ensure*` de lib/db.ts con su rango y su cuerpo (terminan en una línea `}` en la columna 0). */
function funcionesEnsure(texto) {
  const re = /^(?:async )?function (ensure\w+)\s*\(/gm
  const fns = []
  let m
  while ((m = re.exec(texto))) {
    const fin = texto.indexOf('\n}\n', m.index)
    fns.push({ nombre: m[1], ini: m.index, fin: fin === -1 ? texto.length : fin + 2, cuerpo: texto.slice(m.index, fin === -1 ? texto.length : fin + 2) })
  }
  return fns
}

/** Sentencias de las ensure* en orden de aparición: { funcion, sql (con soda_master), origen }, más lo excluido y los errores. */
async function sentenciasEnsure() {
  const texto = leerTexto('lib', 'db.ts')
  const fns = funcionesEnsure(texto)
  const { sentencias, comprobaciones, errores } = await sentenciasDeFunciones(fns)
  return { fns, sentencias, comprobaciones, errores, fuera: ddlFueraDeEnsure(texto, fns) }
}

/** Las sentencias de una lista de funciones ensure*. Una plantilla con ${…} o un sql.query desconocido es un error con el nombre de la función. */
async function sentenciasDeFunciones(fns) {
  const sentencias = []
  const comprobaciones = [] // SELECT de comprobación (no DDL): no cambian el esquema
  const errores = []
  for (const f of fns) {
    const plantillas = [...f.cuerpo.matchAll(/sql`([\s\S]*?)`/g)].map((x) => x[1].trim())
    for (const p of plantillas) {
      if (p.includes('${')) { errores.push(`${f.nombre}: plantilla con interpolación \${…} que no se puede ejecutar como texto`); continue }
      if (/^(ALTER|CREATE|DO)\b/i.test(p)) sentencias.push({ funcion: f.nombre, sql: p, origen: 'plantilla' })
      else if (/^SELECT\b/i.test(p)) comprobaciones.push({ funcion: f.nombre, sql: p })
      else errores.push(`${f.nombre}: plantilla que no es ALTER, CREATE, DO ni SELECT: ${p.slice(0, 60)}`)
    }
    const consultas = (f.cuerpo.match(/sql\.query\(/g) || []).length
    if (consultas) {
      const usados = Object.keys(GENERADORES).filter((g) => new RegExp(`\\b${g}\\(\\s*'soda_master'\\s*\\)`).test(f.cuerpo))
      if (usados.length !== 1 || consultas !== 1) {
        errores.push(`${f.nombre}: usa sql.query con sentencias que la prueba no sabe expandir (agrega el generador a GENERADORES en scripts/pruebas/esquema.cjs)`)
        continue
      }
      const mod = await importar(...GENERADORES[usados[0]].archivo)
      for (const s of mod[usados[0]]('soda_master')) sentencias.push({ funcion: f.nombre, sql: s.trim(), origen: usados[0] })
    }
  }
  return { sentencias, comprobaciones, errores }
}

/** Todo DDL de lib/ y app/ debe vivir en una ensure* (o en un generador que una ensure* expande). */
function ddlFueraDeEnsure(texto, fns) {
  const fuera = []
  const rangos = fns.map((f) => [f.ini, f.fin])
  const archivos = []
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) recorrer(rel)
      else if (/\.(ts|tsx)$/.test(e.name)) archivos.push(rel)
    }
  }
  recorrer('lib')
  recorrer('app')
  for (const rel of archivos) {
    const t = rel === path.join('lib', 'db.ts') ? texto : leerTexto(rel)
    let generador = null
    for (const [g, def] of Object.entries(GENERADORES)) if (rel === path.join(...def.archivo)) generador = g
    for (const m of t.matchAll(RE_DDL)) {
      if (rel === path.join('lib', 'db.ts') && rangos.some(([a, b]) => m.index >= a && m.index < b)) continue
      if (generador) {
        const ini = t.indexOf(`export function ${generador}(`)
        const fin = ini === -1 ? -1 : t.indexOf('\n}\n', ini)
        if (ini !== -1 && m.index > ini && m.index < fin) continue
      }
      const linea = t.slice(0, m.index).split('\n').length
      fuera.push(`${rel.split(path.sep).join('/')}:${linea} (${m[0]})`)
    }
  }
  return fuera
}

exports.correr = async function correr() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL (usa pnpm prueba:esquema o pnpm prueba:completa).')
  const sql = neon(process.env.DATABASE_URL)
  const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`
  const ES = `${PREFIJO}${sufijo}`
  const ES_TX = `${PREFIJO}${sufijo}_tx`
  const ES_CLI = `${PREFIJO}${sufijo}_cli`

  console.log('\n[esquema] A: el mismo texto SQL de las ensure* de lib/db.ts')
  const ext = await sentenciasEnsure()
  check(`se encontraron las funciones ensure* de lib/db.ts (${ext.fns.length})`, ext.fns.length >= 23, ext.fns.map((f) => f.nombre))
  check('ninguna plantilla de las ensure* queda sin poder ejecutarse (sin ${…} ni sql.query desconocidos)', ext.errores.length === 0, ext.errores)
  check('todo el DDL de lib/ y app/ está dentro de una ensure* (ninguna migración escrita en otra parte)', ext.fuera.length === 0, ext.fuera)
  // Caso sintético: la extracción no se salta en silencio una plantilla que no puede ejecutar.
  const sintetico = funcionesEnsure([
    'async function ensureConInterpolacion(): Promise<void> {',
    "  await sql`ALTER TABLE soda_master.x ADD COLUMN IF NOT EXISTS ${columna} TEXT`",
    '}',
    'async function ensureConQueryDesconocido(): Promise<void> {',
    '  for (const s of otrasSentencias()) await sql.query(s)',
    '}',
    '',
  ].join('\n'))
  const errSint = (await sentenciasDeFunciones(sintetico)).errores
  check('una plantilla con ${…} o un sql.query desconocido hace fallar la prueba nombrando la función',
    errSint.length === 2 && errSint[0].startsWith('ensureConInterpolacion:') && errSint[1].startsWith('ensureConQueryDesconocido:'), errSint)
  const porOrigen = ext.sentencias.reduce((a, s) => ((a[s.origen] = (a[s.origen] || 0) + 1), a), {})
  console.log(`  (${ext.sentencias.length} sentencias de ${ext.fns.length} funciones ensure*: ${JSON.stringify(porOrigen)}; ` +
    `${ext.comprobaciones.length} consultas SELECT de comprobación quedan fuera porque no cambian el esquema: ` +
    `${[...new Set(ext.comprobaciones.map((c) => c.funcion))].join(', ')})`)

  const viejos = await sql`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'prueba\_esquema\_%'`
  for (const e of viejos) await sql.query(`DROP SCHEMA IF EXISTS ${E.validarNombreEsquema(e.nspname)} CASCADE`)
  if (viejos.length) console.log(`  (se eliminaron ${viejos.length} esquema(s) prueba_esquema_* de corridas anteriores)`)

  try {
    console.log('\n[esquema] B: el script sobre un esquema vacío es igual a soda_master')
    const real = await E.leerEstructura(sql, 'soda_master')
    check('soda_master se leyó del catálogo (hay tablas y funciones)', real.relaciones.length > 0 && real.funciones.length > 0, { relaciones: real.relaciones.length })
    const n = await E.crearEsquemaBase(sql, ES)
    console.log(`  (${n} sentencias del script en una transacción sobre ${ES})`)
    const e1 = await E.leerEstructura(sql, ES)
    const dif1 = E.compararEstructuras(real, e1, { a: 'soda_master', b: 'script' })
    for (const d of dif1.slice(0, 40)) console.log('    · ' + d)
    check(`el script crea la misma estructura que soda_master (${e1.relaciones.length} tablas, ${e1.columnas.length} columnas, ${e1.restricciones.length} restricciones, ${e1.indices.length} índices, ${e1.funciones.length} funciones)`, dif1.length === 0, `${dif1.length} diferencia(s)`)

    console.log('\n[esquema] C: rechazos y atomicidad')
    let rechazo = null
    try { await E.crearEsquemaBase(sql, ES) } catch (err) { rechazo = err }
    check('el comando se niega con un esquema que ya tiene tablas (ESQUEMA_NO_VACIO)', rechazo?.codigo === 'ESQUEMA_NO_VACIO', rechazo?.message)
    check('tras el rechazo el esquema quedó igual', E.compararEstructuras(e1, await E.leerEstructura(sql, ES)).length === 0)
    const objetosReal = await E.objetosEnEsquema(sql, 'soda_master')
    check('soda_master tiene objetos, así que el comando se negaría con él sin enviar nada (solo se lee el catálogo)', objetosReal > 0, objetosReal)
    const guarda = E.sentenciasEsquemaBase(ES).find((s) => s.includes('DO $guarda$'))
    let errGuarda = null
    if (guarda) { try { await sql.query(guarda) } catch (err) { errGuarda = err } }
    check('la guarda del propio script aborta si el esquema ya tiene tablas', Boolean(guarda) && /ya tiene tablas/.test(errGuarda?.message || ''), guarda ? errGuarda?.message : 'no se encontró la guarda en el script')
    let errTx = null
    try { await sql.transaction([...E.sentenciasEsquemaBase(ES_TX), 'SELECT 1/0'].map((s) => sql.query(s))) } catch (err) { errTx = err }
    const restoTx = await sql`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = ${ES_TX}`
    check('si una sentencia falla, la transacción no deja nada (ni el esquema)', errTx !== null && restoTx[0].n === 0, { error: errTx?.message, esquemas: restoTx[0].n })

    const cli = (args) => spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'sql', 'crear-esquema.cjs'), ...args], { cwd: RAIZ, env: process.env, encoding: 'utf8', timeout: 120000 })
    const sinArg = cli([])
    check('comando sin --esquema → código 2 y mensaje', sinArg.status === 2 && /Falta el esquema/.test(sinArg.stderr), { status: sinArg.status, err: sinArg.stderr.slice(0, 200) })
    const malo = cli(['--esquema=Mal-Nombre'])
    check('comando con un nombre inválido → código 2', malo.status === 2 && /no válido/.test(malo.stderr), { status: malo.status, err: malo.stderr.slice(0, 200) })
    const contraReal = cli(['--esquema=soda_master'])
    check('comando con soda_master (con tablas) → se niega con código 1 sin ejecutar nada', contraReal.status === 1 && /ya tiene .* objeto\(s\).*No se ejecutó nada/.test(contraReal.stderr), { status: contraReal.status, err: contraReal.stderr.slice(0, 200) })
    check('soda_master sigue igual después del intento', E.compararEstructuras(real, await E.leerEstructura(sql, 'soda_master')).length === 0)
    const nuevo = cli([`--esquema=${ES_CLI}`])
    const eCli = await E.leerEstructura(sql, ES_CLI)
    check('comando con un esquema nuevo → código 0 y la misma estructura que soda_master', nuevo.status === 0 && E.compararEstructuras(real, eCli).length === 0, { status: nuevo.status, out: (nuevo.stdout + nuevo.stderr).slice(0, 300) })

    console.log('\n[esquema] D: las ensure* sobre el esquema base no fallan ni cambian nada')
    for (const vuelta of [1, 2]) {
      const fallidas = []
      for (const s of ext.sentencias) {
        try { await sql.query(E.cambiarEsquema(s.sql, ES)) } catch (err) { fallidas.push(`${s.funcion}: ${err.message}`) }
      }
      check(`vuelta ${vuelta}: las ${ext.sentencias.length} sentencias de las ensure* corren sin error`, fallidas.length === 0, fallidas)
      const e2 = await E.leerEstructura(sql, ES)
      const dif2 = E.compararEstructuras(e1, e2, { a: 'script', b: 'script+ensure' })
      for (const d of dif2.slice(0, 40)) console.log('    · ' + d)
      check(`vuelta ${vuelta}: la estructura no cambió (el script ya tiene todo lo que agregan las ensure*)`, dif2.length === 0, `${dif2.length} diferencia(s)`)
    }
  } finally {
    for (const esq of [ES, ES_TX, ES_CLI]) {
      try { await sql.query(`DROP SCHEMA IF EXISTS ${esq} CASCADE`) } catch (err) { console.log(`  AVISO: no se pudo eliminar ${esq}: ${err.message}`) }
    }
    const restos = await sql`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname LIKE 'prueba\_esquema\_%'`
    check('no queda ningún esquema prueba_esquema_*', restos[0].n === 0, restos[0])
  }
}

if (require.main === module) {
  exports
    .correr()
    .then(() => process.exit(L.resumen('esquema') ? 0 : 1))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
