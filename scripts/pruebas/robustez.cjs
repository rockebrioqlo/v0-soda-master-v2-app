/**
 * Módulo `robustez` (sesión 15): B8/#24 y #26. Prueba estática y unitaria, sin servidor.
 *
 *  1. B8/#24: el prefijo de log `[v0]` no vuelve a aparecer en el código de la app (app, lib, components).
 *  2. #26: `lib/carga-inicial.ts` decide qué cuenta como "error de conexión con la BD" en el arranque: la petición
 *     rechazada (red) o una respuesta 5xx; un 401, 403, 404 o 429 NO lo son (los maneja la sesión o el rol).
 *     La pantalla con "Reintentar" existe y no se agregó ningún temporizador periódico nuevo en el contexto.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib.cjs')
const { check } = L

exports.nombre = 'robustez'

const RAIZ = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) archivos(p, acc)
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) acc.push(p)
  }
  return acc
}

exports.correr = async function () {
  console.log('\n[robustez] B8/#24: sin el prefijo de log "[v0]" en el código')
  const rastro = []
  for (const d of ['app', 'lib', 'components', 'hooks']) {
    for (const f of archivos(path.join(RAIZ, d))) {
      if (leer(path.relative(RAIZ, f)).includes('[v0]')) rastro.push(path.relative(RAIZ, f))
    }
  }
  check('ningún archivo de app, lib, components ni hooks contiene "[v0]"', rastro.length === 0, rastro)

  console.log('\n[robustez] #26: error de conexión en el arranque')
  let mod = null
  try {
    mod = await import('file:///' + path.join(RAIZ, 'lib', 'carga-inicial.ts').split(path.sep).join('/'))
  } catch (e) {
    check('lib/carga-inicial.ts existe y se puede importar (' + e.message.slice(0, 80) + ')', false)
    return
  }
  const si = ['red', 500, 502, 503, 504, 599]
  const no = [200, 201, 204, 304, 400, 401, 403, 404, 409, 429]
  check('petición rechazada (red) y respuestas 5xx → es un fallo de conexión con la BD', si.every((s) => mod.esFalloDeConexion(s) === true), si.filter((s) => !mod.esFalloDeConexion(s)))
  check('200, 4xx (401, 403, 404, 409, 429…) → NO es un fallo de conexión', no.every((s) => mod.esFalloDeConexion(s) === false), no.filter((s) => mod.esFalloDeConexion(s)))
  check('hayFalloDeConexion: basta uno de la lista; vacía o solo respuestas buenas → false', mod.hayFalloDeConexion([200, 403, 'red']) === true && mod.hayFalloDeConexion([200, 401, 404]) === false && mod.hayFalloDeConexion([]) === false)

  const pagina = leer('app', 'page.tsx')
  check('app/page.tsx muestra "Error de conexión con la BD" con un botón Reintentar cuando hay initError', /initError/.test(pagina) && pagina.includes('Error de conexión con la BD') && pagina.includes('Reintentar'))
  const ctx = leer('lib', 'app-context.tsx')
  check('el contexto expone initError y reintentarInicio, y la carga marca el error con la clasificación compartida', /initError/.test(ctx) && /reintentarInicio/.test(ctx) && ctx.includes('esFalloDeConexion'))
  check('sin temporizadores periódicos nuevos: el contexto sigue con UN setInterval (el reloj del servidor, B7/A4)', (ctx.match(/setInterval\(/g) || []).length === 1 && !pagina.includes('setInterval'), (ctx.match(/setInterval\(/g) || []).length)
}
