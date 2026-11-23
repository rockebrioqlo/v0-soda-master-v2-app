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
