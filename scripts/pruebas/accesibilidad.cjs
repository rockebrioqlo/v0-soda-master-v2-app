/**
 * Módulo `accesibilidad` (sesión 21a, K2): PRUEBA ESTÁTICA, sin servidor ni base. Se puede correr sola con
 * `node scripts/pruebas/accesibilidad.cjs` (y dentro de `pnpm prueba:completa --modulo=accesibilidad`).
 *
 * Impide volver atrás en lo que se puede comprobar leyendo el código (AUDITORIA_ACCESIBILIDAD.md):
 *  1. Tema oscuro: `<html>` con la clase "dark" y `color-scheme: dark` en `.dark` (barras de scroll nativas).
 *  2. #5b: "Cerrar" y no "Close" en `ui/dialog.tsx` y `ui/sheet.tsx`.
 *  3. #3: avisos anunciados (`role=status`/`alert`), errores sin autocierre y con tope de 3, el error del login,
 *     el banner offline y "Vuelto"/"Falta" de Pagos.
 *  4. #1: las tarjetas de mesa (Mesas y POS) y las filas de Pagos ya no son `div`/`Card` con `onClick`.
 *  5. #2: el cajón "Más", el overlay de tablet y el cajón de comanda usan `Sheet` de Radix, sin fondo hecho a mano.
 *  6. #7: `aria-pressed` (método de pago, categorías de /menu) y `aria-current` (las dos navegaciones).
 *  7. #9: los diálogos devuelven el foco al elemento que los abrió (`ui/dialog.tsx`, `ui/sheet.tsx`, `ui/alert-dialog.tsx`).
 *  8. #10: KDS con `aria-label` por ítem, región `aria-live` y `motion-reduce` en cada `animate-pulse`.
 * La verificación con teclado real y el contraste se hacen en el navegador, no aquí.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib.cjs')
const { check } = L

exports.nombre = 'accesibilidad'

const RAIZ = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')

/**
 * Etiquetas de apertura (`<div ...>`, `<Card ...>`) con un `onClick` que no es un simple `stopPropagation`:
 * son elementos no interactivos con clic, o sea, inalcanzables con teclado.
 */
function clicksEnNoInteractivos(src, etiquetas = ['div', 'Card', 'aside', 'li', 'span', 'tr']) {
  const out = []
  const re = new RegExp(`<(${etiquetas.join('|')})\\b`, 'g')
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    let prof = 0
    let comilla = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (comilla) { if (c === comilla) comilla = ''; continue }
      if (prof === 0 && (c === '"' || c === "'")) { comilla = c; continue }
      if (c === '{') prof++
      else if (c === '}') prof--
      else if (c === '>' && prof === 0) break
    }
    const attrs = src.slice(m.index, i)
    if (/\bonClick=/.test(attrs) && !/stopPropagation/.test(attrs) && !/role="button"/.test(attrs)) {
      out.push(`${m[1]} línea ${src.slice(0, m.index).split('\n').length}`)
    }
  }
  return out
}

exports.correr = async function correr() {
  console.log('\n[accesibilidad] 1: tema oscuro')
  const layout = leer('app', 'layout.tsx')
  const html = /<html[^>]*>/.exec(layout)
  check('app/layout.tsx: <html> con la clase "dark"', !!html && /className="[^"]*\bdark\b[^"]*"/.test(html[0]), html && html[0])
  const css = leer('app', 'globals.css')
  const bloqueDark = /\n\.dark\s*\{[^}]*\}/.exec(css)
  check('app/globals.css: `.dark` declara color-scheme: dark', !!bloqueDark && /color-scheme:\s*dark/.test(bloqueDark[0]))

  console.log('\n[accesibilidad] 2: "Cerrar" en español en los diálogos')
  for (const f of ['dialog.tsx', 'sheet.tsx']) {
    const s = leer('components', 'ui', f)
    check(`ui/${f}: el botón de cerrar dice "Cerrar" y no "Close"`, />Cerrar</.test(s) && !/>Close</.test(s))
  }

  console.log('\n[accesibilidad] 3: avisos anunciados')
  const toast = leer('components', 'toast.tsx')
  check('toast.tsx: errores con role="alert" y el resto con role="status"', /role=\{[^}]*'alert'[^}]*'status'[^}]*\}|role="alert"[\s\S]*role="status"|role="status"[\s\S]*role="alert"/.test(toast))
  check('toast.tsx: tope de 3 errores a la vez (sale el más viejo)', /MAX_ERRORES\s*=\s*3/.test(toast))
  check('toast.tsx: los errores no se cierran solos (el temporizador solo para los que no son error)', /type\s*!==\s*'error'/.test(toast) && /setTimeout/.test(toast))
  check('toast.tsx: el botón de cerrar tiene nombre', /aria-label="Cerrar aviso"/.test(toast))
  const notif = leer('components', 'notificaciones-toast.tsx')
  check('notificaciones-toast.tsx: avisos con role (alert para problemas, status para el resto)', /role=\{[^}]*'alert'[^}]*'status'[^}]*\}|role="alert"[\s\S]*role="status"/.test(notif))
  const login = leer('components', 'login-form.tsx')
  check('login-form.tsx: el error del ingreso se anuncia con role="alert"', /role="alert"/.test(login))
  const layoutApp = leer('components', 'main-layout.tsx')
  check('main-layout.tsx: el banner offline se anuncia (role="status")', (layoutApp.match(/role="status"/g) || []).length >= 1)
  const pagos = leer('components', 'pagos-page.tsx')
  const iVuelto = pagos.indexOf('Vuelto')
  const iFalta = pagos.indexOf('Falta')
  check('pagos-page.tsx: "Vuelto" y "Falta" en una región role="status"', (pagos.match(/role="status"/g) || []).length >= 1 && iVuelto > -1 && iFalta > -1)

  console.log('\n[accesibilidad] 4: tarjetas y filas son botones reales')
  for (const f of ['mesas-page.tsx', 'pos-page.tsx', 'pagos-page.tsx']) {
    const malos = clicksEnNoInteractivos(leer('components', f))
    check(`${f}: ningún div/Card/aside con onClick (salvo stopPropagation)`, malos.length === 0, malos)
  }
  const mesasSrc = leer('components', 'mesas-page.tsx')
  check('mesas-page.tsx: el título de la tarjeta es un <button> que cubre la tarjeta', /<button[\s\S]{0,400}after:absolute[\s\S]{0,60}after:inset-0/.test(mesasSrc) || /<button[\s\S]{0,400}handleMesaClick\(mesa\)/.test(mesasSrc))
  check('pos-page.tsx: la tarjeta de mesa es un <button type="button">', /<button[^>]*type="button"[\s\S]{0,1200}handleSelectMesa\(mesa\.id\)/.test(leer('components', 'pos-page.tsx')))
  check('pagos-page.tsx: la fila de la comanda es un <button type="button">', /<button[^>]*type="button"[\s\S]{0,300}handleSelectComanda\(comanda\.id\)/.test(pagos))

  console.log('\n[accesibilidad] 5: cajón "Más", overlay de tablet y cajón de comanda con Sheet')
  const bottom = leer('components', 'bottom-nav.tsx')
  check('bottom-nav.tsx: usa Sheet y no un fondo hecho a mano', /from '@\/components\/ui\/sheet'/.test(bottom) && !/fixed inset-0/.test(bottom))
  check('main-layout.tsx: el overlay de tablet usa Sheet y no un fondo hecho a mano', /from '@\/components\/ui\/sheet'/.test(layoutApp) && !/fixed inset-0/.test(layoutApp))
  const pos = leer('components', 'pos-page.tsx')
  const iDrawer = pos.indexOf('Mobile order drawer')
  check('pos-page.tsx: el cajón de comanda usa Sheet y no un fondo hecho a mano', /from '@\/components\/ui\/sheet'/.test(pos) && !/fixed inset-0 z-40 md:hidden/.test(pos) && iDrawer > -1)
  const sheet = leer('components', 'ui', 'sheet.tsx')
  check('ui/sheet.tsx: SheetTitle y SheetDescription exportados (nombre accesible del cajón)', /SheetTitle/.test(sheet) && /SheetDescription/.test(sheet))

  console.log('\n[accesibilidad] 6: estados con aria-pressed y aria-current')
  check('pagos-page.tsx: el método de pago usa aria-pressed', /aria-pressed=\{metodoPago ===/.test(pagos))
  check('app/menu/page.tsx: las categorías usan aria-pressed', /aria-pressed=/.test(leer('app', 'menu', 'page.tsx')))
  check('main-layout.tsx: la navegación usa aria-current', /aria-current=\{active \? 'page' : undefined\}/.test(layoutApp))
  check('bottom-nav.tsx: la barra y el cajón usan aria-current', (bottom.match(/aria-current=/g) || []).length >= 2)

  console.log('\n[accesibilidad] 7: el foco vuelve a quien abrió el diálogo')
  const foco = leer('components', 'ui', 'restaurar-foco.tsx')
  check('ui/restaurar-foco.tsx: guarda document.activeElement al abrir y lo restaura al cerrar', /document\.activeElement/.test(foco) && /\.focus\(\)/.test(foco) && /isConnected/.test(foco))
  for (const f of ['dialog.tsx', 'sheet.tsx', 'alert-dialog.tsx']) {
    const s = leer('components', 'ui', f)
    check(`ui/${f}: usa restaurar-foco (OpenerProvider en la raíz y onCloseAutoFocus en el contenido)`, /OpenerProvider/.test(s) && /useRestaurarFoco/.test(s) && /onCloseAutoFocus=\{restaurarFoco\}/.test(s))
  }

  console.log('\n[accesibilidad] 8: KDS')
  const kds = leer('components', 'kds-page.tsx')
  check('kds-page.tsx: los botones por ítem (Preparando, Listo, Problema) llevan aria-label con el ítem', (kds.match(/aria-label=\{`(Preparando|Listo|Problema)/g) || []).length >= 3)
  check('kds-page.tsx: región aria-live para comandas nuevas', /aria-live="polite"/.test(kds))
  const pulsos = kds.split('\n').filter((l) => /animate-pulse/.test(l))
  check('kds-page.tsx: cada animate-pulse lleva motion-reduce:animate-none', pulsos.length > 0 && pulsos.every((l) => /motion-reduce:animate-none/.test(l)), pulsos.filter((l) => !/motion-reduce:animate-none/.test(l)).length)

  // ───────────────────────── Sesión 21b ─────────────────────────
  const fuentes = archivosTsx()

  console.log('\n[accesibilidad] 9 (21b, #4): ningún <label> sin asociar ni control sin nombre')
  const labelsMalos = []
  const controlesMalos = []
  for (const [rel, src] of fuentes) {
    if (rel.startsWith('components/ui/')) continue
    labelsMalos.push(...labelsSinAsociar(src).map((l) => `${rel}:${l}`))
    controlesMalos.push(...controlesSinNombre(src).map((l) => `${rel}:${l}`))
  }
  check('ningún <label>/<Label> sin htmlFor ni control dentro (fuera de components/ui)', labelsMalos.length === 0, `${labelsMalos.length}: ${labelsMalos.slice(0, 8).join(' | ')}`)
  check('todo Input/Textarea/Select/Switch/Checkbox tiene nombre (aria-label, htmlFor→id o dentro de un label)', controlesMalos.length === 0, `${controlesMalos.length}: ${controlesMalos.slice(0, 8).join(' | ')}`)
  const sinPorArchivo = {}
  for (const l of labelsMalos) sinPorArchivo[l.split(':')[0]] = (sinPorArchivo[l.split(':')[0]] || 0) + 1
  for (const f of ['login-form.tsx', 'pagos-page.tsx', 'caja-page.tsx', 'pos-page.tsx', 'mermas-page.tsx', 'inventario-page.tsx', 'usuarios-page.tsx', 'mesas-page.tsx']) {
    check(`${f}: 0 etiquetas sin asociar`, !sinPorArchivo[`components/${f}`], sinPorArchivo[`components/${f}`])
  }

  console.log('\n[accesibilidad] 10 (21b, #5): ningún botón de solo ícono sin nombre')
  const botonesMalos = []
  for (const [rel, src] of fuentes) {
    if (rel.startsWith('components/ui/')) continue
    botonesMalos.push(...botonesSinNombre(src).map((l) => `${rel}:${l}`))
  }
  check('ningún <Button>/<button> con solo ícono sin aria-label, title ni sr-only', botonesMalos.length === 0, `${botonesMalos.length}: ${botonesMalos.slice(0, 8).join(' | ')}`)
  check('login-form.tsx: "C" y borrar tienen aria-label', /aria-label="Borrar todo"/.test(login) && /aria-label="Borrar el último dígito"/.test(login))
  check('main-layout.tsx: "Salir" de la cabecera de cocina tiene aria-label', (layoutApp.match(/aria-label="Salir"/g) || []).length >= 2)

  console.log('\n[accesibilidad] 11 (21b, #8): estructura de la app')
  const appPage = leer('app', 'page.tsx')
  check('app/page.tsx: document.title cambia con la pantalla (efecto sobre currentPage)', /document\.title\s*=/.test(appPage) && /TITULOS_PANTALLA/.test(appPage))
  const titulos = /TITULOS_PANTALLA[^=]*=\s*\{([\s\S]*?)\n\}/.exec(appPage)
  const paginas = ['dashboard', 'mesas', 'pos', 'kds', 'inventario', 'finanzas', 'usuarios', 'pagos', 'caja', 'mermas', 'reportes', 'configuracion']
  check('app/page.tsx: hay un título para cada una de las 12 pantallas', !!titulos && paginas.every((p) => new RegExp(`\\b${p}\\s*:`).test(titulos[1])))
  const navsSinNombre = []
  for (const [rel, src] of fuentes) {
    for (const m of src.matchAll(/<nav\b[^>]*>/g)) if (!/aria-label=/.test(m[0])) navsSinNombre.push(`${rel}:${src.slice(0, m.index).split('\n').length}`)
  }
  check('todo <nav> lleva aria-label', navsSinNombre.length === 0, navsSinNombre)
  check('main-layout.tsx: enlace "Saltar al contenido" hacia un <main id="contenido" tabIndex={-1}>', /Saltar al contenido/.test(layoutApp) && /href="#contenido"/.test(layoutApp) && /<main[^>]*id="contenido"[^>]*tabIndex=\{-1\}|<main[^>]*tabIndex=\{-1\}[^>]*id="contenido"/.test(layoutApp))
  check('main-layout.tsx: el foco pasa al contenido al cambiar de pantalla', /enfocarContenido\(\)/.test(layoutApp) && /currentPage/.test(layoutApp))
  check('bottom-nav.tsx y main-layout.tsx: tras elegir un destino en el cajón el foco va al contenido (no a "Más"/hamburguesa)', /enfocarContenido/.test(bottom) && (layoutApp.match(/enfocarContenido/g) || []).length >= 2)
  check('lib/enfocar-contenido.ts existe y enfoca #contenido', fs.existsSync(path.join(RAIZ, 'lib', 'enfocar-contenido.ts')) && /getElementById\('contenido'\)/.test(leer('lib', 'enfocar-contenido.ts')))
  check('ui/card.tsx: CardTitle es un encabezado (h2)', /function CardTitle[\s\S]{0,200}<h2/.test(leer('components', 'ui', 'card.tsx')))
  check('pagos-page.tsx: la lista y el cobro de una comanda tienen cada uno su h1', (pagos.match(/<h1\b/g) || []).length >= 2)
  check('pos-page.tsx: con la mesa abierta el nombre de la mesa es el h1', /<h1[^>]*>\{selectedMesa\?\.nombre\}<\/h1>/.test(pos))

  console.log('\n[accesibilidad] 12 (21b, #11): teclado del login')
  check('login-form.tsx: las teclas están en role="group" aria-label="Teclado numérico"', /role="group"\s+aria-label="Teclado numérico"/.test(login) || /aria-label="Teclado numérico"\s+role="group"/.test(login))
  const iGrupo = login.indexOf('Teclado numérico')
  const trozoTeclas = iGrupo > -1 ? login.slice(iGrupo, login.indexOf('</form>')) : ''
  const botonesTeclas = (trozoTeclas.match(/<Button\b/g) || []).length
  check('login-form.tsx: las 12 teclas con tabIndex={-1} (el campo PIN sigue escribible)', botonesTeclas >= 3 && (trozoTeclas.match(/tabIndex=\{-1\}/g) || []).length >= 3 && !/readOnly/.test(login))

  console.log('\n[accesibilidad] 13 (21b): avisos "problema" del KDS hasta cerrarlos y con tope')
  check('notificaciones-toast.tsx: tope de 3 avisos de problema (sale el más viejo)', /MAX_PROBLEMAS\s*=\s*3/.test(notif))
  check('notificaciones-toast.tsx: los avisos de problema no tienen temporizador de cierre', /const ttl\s*=\s*6000/.test(notif) && !/10000/.test(notif) && /tipo\s*===\s*'problema'\)?\s*(continue|return)/.test(notif))
  check('notificaciones-toast.tsx: el botón de cerrar un aviso tiene nombre', /aria-label="Cerrar (aviso|notificación)"/.test(notif))

  console.log('\n[accesibilidad] 14 (21b): motion-reduce global')
  const reducido = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*animate-pulse[^@]*animation:\s*none/.exec(css)
  check('app/globals.css: bajo prefers-reduced-motion los animate-pulse no se animan', !!reducido)

  console.log('\n[accesibilidad] 15 (21b): contraste en el tema oscuro (pares fondo/texto)')
  const helpers = leer('lib', 'helpers.ts')
  check('lib/helpers.ts: colores de estado de mesa y comanda como par fondo+texto (sin text-white sobre green-500/600, red-500, orange-500, yellow-500)', !/bg-(green-600|red-500|emerald-600|blue-500)\b/.test(helpers) && !/bg-(green-500|orange-500|yellow-500)[^'\n]*text-white/.test(helpers) && /libre: 'bg-green-500 text-zinc-950'/.test(helpers) && /text-zinc-950/.test(helpers) && /bg-green-700/.test(helpers) && /bg-red-700/.test(helpers))
  const prohibidos = [
    [/bg-green-(500|600)[^'"`\n]*text-white|text-white[^'"`\n]*bg-green-(500|600)\b(?!\/)/, 'blanco sobre green-500/600'],
    [/bg-red-500 text-white/, 'blanco sobre red-500'],
    [/text-rose-700/, 'rose-700 como texto'],
    [/bg-(emerald-600|orange-500|blue-500|yellow-500) text-white/, 'blanco sobre emerald-600, orange-500, blue-500 o yellow-500'],
    [/text-(amber-700|emerald-600|sky-600)\b/, 'amber-700, emerald-600 o sky-600 como texto (oscuros sobre fondo oscuro)'],
  ]
  for (const [rel, src] of fuentes) {
    if (rel.startsWith('components/ui/')) continue
    for (const [re, que] of prohibidos) check(`${rel}: sin ${que}`, !re.test(src))
  }
  check('login-form.tsx y app/menu/page.tsx: sin zinc-500 como texto (4,10:1)', !/text-zinc-500/.test(login) && !/text-zinc-500/.test(leer('app', 'menu', 'page.tsx')))
  check('notificaciones-toast.tsx: sin red-600 como texto (4,15:1)', !/text-red-600/.test(notif))
}

// ───────── utilidades de análisis de JSX (solo texto, sin compilar) ─────────
function archivosTsx() {
  const out = []
  const rec = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) rec(p)
      else if (/\.tsx$/.test(e.name)) out.push([path.relative(RAIZ, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8')])
    }
  }
  rec(path.join(RAIZ, 'components'))
  return out
}
const linea = (src, i) => src.slice(0, i).split('\n').length
/** Etiqueta de apertura que empieza en `i`: atributos, fin y si es autocerrada (respeta llaves y comillas). */
function etiqueta(src, i) {
  let j = i
  let prof = 0
  let q = ''
  for (; j < src.length; j++) {
    const c = src[j]
    if (q) { if (c === q) q = ''; continue }
    if (prof === 0 && (c === '"' || c === "'")) { q = c; continue }
    if (c === '{') prof++
    else if (c === '}') prof--
    else if (c === '>' && prof === 0) break
  }
  return { attrs: src.slice(i, j + 1), fin: j + 1, auto: src[j - 1] === '/' }
}
/** Contenido de un elemento hasta su cierre (cuenta anidados del mismo nombre). */
function contenido(src, nombre, desde) {
  const re = new RegExp('<(/?)' + nombre + '(?![A-Za-z0-9])', 'g')
  re.lastIndex = desde
  let d = 1
  let m
  while ((m = re.exec(src))) {
    if (m[1]) { d--; if (!d) return src.slice(desde, m.index) }
    else if (!etiqueta(src, m.index).auto) d++
  }
  return src.slice(desde)
}
const CONTROLES = ['Input', 'input', 'Textarea', 'textarea', 'Select', 'select', 'Checkbox', 'Switch', 'SelectTrigger', 'RadioGroupItem', 'Slider']
function labelsSinAsociar(src) {
  const out = []
  const reCtl = new RegExp('<(' + CONTROLES.join('|') + ')(?![A-Za-z0-9])')
  for (const m of src.matchAll(/<(label|Label)(?![A-Za-z0-9])/g)) {
    const t = etiqueta(src, m.index)
    if (/htmlFor=/.test(t.attrs)) continue
    if (!t.auto && reCtl.test(contenido(src, m[1], t.fin))) continue
    out.push(linea(src, m.index))
  }
  return out
}
function controlesSinNombre(src) {
  const out = []
  const htmlFor = new Set([...src.matchAll(/htmlFor=(?:"([^"]+)"|\{`?([^}`]+)`?\})/g)].map((x) => x[1] || x[2]))
  for (const m of src.matchAll(/<(Input|input|Textarea|textarea|SelectTrigger|Switch|Checkbox|select)(?![A-Za-z0-9])/g)) {
    const t = etiqueta(src, m.index)
    if (/type="(hidden|file)"/.test(t.attrs)) continue
    if (/aria-label=|aria-labelledby=/.test(t.attrs)) continue
    const idm = /\bid=(?:"([^"]+)"|\{`?([^}`]+)`?\})/.exec(t.attrs)
    if (idm && htmlFor.has(idm[1] || idm[2])) continue
    const antes = src.slice(Math.max(0, m.index - 500), m.index)
    const abre = Math.max(antes.lastIndexOf('<label'), antes.lastIndexOf('<Label'))
    const cierra = Math.max(antes.lastIndexOf('</label'), antes.lastIndexOf('</Label'))
    if (abre > cierra) continue
    out.push(linea(src, m.index))
  }
  return out
}
function botonesSinNombre(src) {
  const out = []
  for (const m of src.matchAll(/<(Button|button)(?![A-Za-z0-9])/g)) {
    const t = etiqueta(src, m.index)
    if (t.auto || /aria-label=|aria-labelledby=|\btitle=/.test(t.attrs)) continue
    const cont = contenido(src, m[1], t.fin)
    if (/sr-only/.test(cont)) continue
    const texto = cont
      .replace(/<[A-Za-z][A-Za-z0-9.]*(?:\s[^<>]*?)?\/>/g, '')
      .replace(/<\/?[A-Za-z][^<>]*>/g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .trim()
    if (texto === '') out.push(linea(src, m.index))
    else if (/^\{[\s\S]*\}$/.test(texto)) {
      // contenido solo de una expresión: si dibuja íconos (p. ej. `{activo ? <UserCheck /> : <UserX />}`) y no hay ningún
      // literal con letras, tampoco tiene nombre
      const iconos = /\{[^{}]*<[A-Z][\w.]*\b[^<>]*\/>/.test(cont)
      const literal = /['"`][^'"`\n]*[A-Za-zÁ-ú]{2,}[^'"`\n]*['"`]/.test(cont.replace(/<[A-Z][\w.]*\b[^<>]*\/>/g, ''))
      if (iconos && !literal) out.push(linea(src, m.index))
    }
  }
  return out
}

if (require.main === module) {
  exports
    .correr()
    .then(() => process.exit(L.resumen('accesibilidad') ? 0 : 1))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}

// Para listar pendientes a mano: node -e "..." (ver la sesión 21b); no lo usa el corredor.
exports.analisis = { labelsSinAsociar, controlesSinNombre, botonesSinNombre }
