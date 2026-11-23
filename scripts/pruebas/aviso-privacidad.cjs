/**
 * Módulo `aviso` (sesión 19, K1): el aviso de privacidad. PRUEBA ESTÁTICA, sin servidor ni base: se puede correr
 * sola con `node scripts/pruebas/aviso-privacidad.cjs` (y también dentro de `pnpm prueba:completa --modulo=aviso`).
 *
 *  1. `lib/aviso-privacidad.ts` (módulo puro, cargado con el type stripping de Node): trae versión y fecha válidas,
 *     la fecha en `dd-mm-aaaa`, el estado "borrador", el historial al día y TODAS las secciones obligatorias en la
 *     versión de Chile y en la de México.
 *  2. Contenido de Chile: el local como responsable (campos "por completar por el local"), Latencia Cero como
 *     encargada, Neon y Vercel como subencargados, Neon en AWS us-east-1, el plazo de 30 días corridos, los 6 años
 *     tributarios, los nombres de comensales con plazo "por definir" (NO colgados de los 6 años) y SIN Vercel
 *     Analytics. México: marcas "por verificar" y sin cifras inventadas.
 *  3. El componente `components/aviso-privacidad.tsx` está usado en el login (`components/login-form.tsx`, en la
 *     pantalla principal y no en la de carga) y en `/menu` (`app/menu/page.tsx`), y muestra la versión y la fecha.
 * La verificación visual (pantalla angosta y ancha) se hace en el navegador, no aquí.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib.cjs')
const { check } = L

exports.nombre = 'aviso'

const RAIZ = path.resolve(__dirname, '..', '..')
const importar = (...p) => import('file:///' + path.join(RAIZ, ...p).split(path.sep).join('/'))
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')

/** Todo el texto de un aviso en una sola cadena (para buscar frases). */
function textoDe(aviso) {
  const partes = [aviso.titulo, aviso.ley, aviso.autoridad]
  for (const s of aviso.secciones) {
    partes.push(s.titulo, ...(s.parrafos || []), ...(s.items || []))
    if (s.tabla) partes.push(...s.tabla.cabecera, ...s.tabla.filas.flat())
  }
  return partes.join('\n')
}

function fechaValida(ddmmaaaa) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmaaaa)
  if (!m) return false
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(a, mes - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d
}

exports.correr = async function () {
  console.log('\n[aviso] 1: lib/aviso-privacidad.ts (versión, fecha y secciones)')
  let M
  try {
    M = await importar('lib', 'aviso-privacidad.ts')
  } catch (e) {
    check('existe y se carga lib/aviso-privacidad.ts', false, String(e.message).slice(0, 200))
    return
  }
  check('AVISO_VERSION tiene la forma N.N', typeof M.AVISO_VERSION === 'string' && /^\d+\.\d+$/.test(M.AVISO_VERSION), M.AVISO_VERSION)
  check('AVISO_FECHA es una fecha real en formato dd-mm-aaaa', fechaValida(M.AVISO_FECHA), M.AVISO_FECHA)
  check('AVISO_ESTADO dice "borrador" y "revisión legal"', /borrador/i.test(M.AVISO_ESTADO) && /revisi[oó]n legal/i.test(M.AVISO_ESTADO), M.AVISO_ESTADO)
  const h = M.AVISO_HISTORIAL
  check('AVISO_HISTORIAL no está vacío y su última fila es la versión y la fecha vigentes', Array.isArray(h) && h.length > 0 && h[h.length - 1].version === M.AVISO_VERSION && h[h.length - 1].fecha === M.AVISO_FECHA, h)
  check('etiquetaVersion() muestra versión y fecha', M.etiquetaVersion() === `v${M.AVISO_VERSION} · ${M.AVISO_FECHA}`, M.etiquetaVersion())
  check('avisoPara() entrega Chile por defecto y México si se pide', M.avisoPara().pais === 'CL' && M.avisoPara('CL').pais === 'CL' && M.avisoPara('MX').pais === 'MX')

  for (const [pais, aviso] of [['Chile', M.avisoPara('CL')], ['México', M.avisoPara('MX')]]) {
    const ids = aviso.secciones.map((s) => s.id)
    const faltan = M.SECCIONES_OBLIGATORIAS.filter((id) => !ids.includes(id))
    check(`${pais}: trae todas las secciones obligatorias`, faltan.length === 0, faltan)
    check(`${pais}: ninguna sección se repite y todas tienen título y contenido`, new Set(ids).size === ids.length && aviso.secciones.every((s) => s.titulo && ((s.parrafos && s.parrafos.length) || (s.items && s.items.length) || s.tabla)))
    const t = textoDe(aviso)
    check(`${pais}: sin Vercel Analytics (se retiró en la sesión 17)`, !/analytics/i.test(t))
    check(`${pais}: sin correos ni PINs`, !/@/.test(t) && !/\bPIN\s*[:=]\s*\d/i.test(t))
    check(`${pais}: nombra a Neon y a Vercel, con la región us-east-1 de Neon`, /Neon/.test(t) && /Vercel/.test(t) && /us-east-1/.test(t))
    check(`${pais}: Latencia Cero SpA figura como encargada y el responsable es el local`, /Latencia Cero SpA/.test(t) && /encargad/i.test(t) && /responsable[^.]*local/i.test(t))
    check(`${pais}: el responsable del local queda como campo "por completar por el local"`, t.includes(M.POR_COMPLETAR) && aviso.secciones.find((s) => s.id === 'responsable').items.length >= 3)
    check(`${pais}: la región de Vercel queda "por confirmar"`, /Vercel[^\n]*\[por confirmar\]|\[por confirmar\][^\n]*Vercel/.test(t.replace(/\n/g, ' ').replace(/\s+/g, ' ')) || /región[^.]*Vercel[^.]*\[por confirmar\]/.test(t))
  }

  console.log('\n[aviso] 2: contenido de Chile')
  const cl = M.avisoPara('CL')
  const tcl = textoDe(cl)
  check('Chile: cita la Ley 21.719 y la Agencia de Protección de Datos Personales', /21\.719/.test(tcl) && /Agencia de Protección de Datos Personales/.test(tcl))
  check('Chile: derechos de acceso, rectificación, supresión, oposición y portabilidad', ['Acceso', 'Rectificación', 'Supresión', 'Oposición', 'Portabilidad'].every((d) => tcl.includes(d)))
  check('Chile: plazo de 30 días corridos, prorrogable una sola vez por 30', /30 días corridos/.test(tcl) && /una sola vez por 30 días más/.test(tcl))
  const filas = cl.secciones.find((s) => s.id === 'conservacion').tabla.filas
  const fila = (re) => filas.find(([dato]) => re.test(dato))
  check('Chile: respaldo tributario a 6 años', fila(/tributario/i) && /6 años/.test(fila(/tributario/i)[1]))
  check('Chile: nombres de comensales con plazo "por definir" y NO colgados de los 6 años', fila(/comensales/i) && /por definir/.test(fila(/comensales/i)[1]) && !/6 años/.test(fila(/comensales/i)[1]), fila(/comensales/i))
  check('Chile: datos de empleados "por confirmar" con el contador, sin cifra', fila(/empleados/i) && /\[por confirmar\]/.test(fila(/empleados/i)[1]) && !/\d/.test(fila(/empleados/i)[1]), fila(/empleados/i))
  check('Chile: sesiones y notificaciones 90 días; intentos de ingreso 24 horas o 30 días', fila(/sesiones/i) && /90 días/.test(fila(/sesiones/i)[1]) && fila(/intentos/i) && /24 horas/.test(fila(/intentos/i)[1]) && /30 días/.test(fila(/intentos/i)[1]))
  check('Chile: la auditoría a 6 años figura como política interna, no como mandato legal', fila(/auditor/i) && /política interna/.test(fila(/auditor/i)[1]))
  check('Chile: nombra la transferencia internacional (fuera de Chile)', /fuera de Chile/.test(tcl) && /Estados Unidos/.test(tcl))

  console.log('\n[aviso] 3: México (borrador por verificar) y versión corta de /menu')
  const tmx = textoDe(M.avisoPara('MX'))
  check('México: marca "por verificar" lo que no se verificó y nombra la LFPDPPP y la autoridad', /\[por verificar\]/.test(tmx) && /LFPDPPP/.test(tmx) && /Secretaría Anticorrupción y Buen Gobierno/.test(tmx))
  // Los 30 días de "intentos de ingreso con un ingreso correcto" son un plazo técnico propio, no uno legal: se permiten.
  check('México: no inventa plazos legales (ni "30 días corridos", ni "72 horas", ni días hábiles)', !/30 días corridos|72 horas|días hábiles|20 días/i.test(tmx), tmx.match(/.{30}(30 días corridos|72 horas|días hábiles|20 días).{20}/i))
  const menu = M.AVISO_MENU_CL
  const idsMenu = menu.secciones.map((s) => s.id)
  check('versión corta de /menu: responsable, datos, derechos y cambios; dice que no pide ningún dato', ['responsable', 'datos', 'derechos', 'cambios'].every((id) => idsMenu.includes(id)) && /no te pide ningún dato/.test(textoDe(menu)) && !/analytics/i.test(textoDe(menu)))

  console.log('\n[aviso] 4: el componente está en el login y en /menu')
  const comp = leer('components', 'aviso-privacidad.tsx')
  check('el componente exporta AvisoPrivacidad, lee el texto de lib/aviso-privacidad y muestra versión y fecha', /export function AvisoPrivacidad/.test(comp) && /from '@\/lib\/aviso-privacidad'/.test(comp) && /etiquetaVersion\(\)/.test(comp) && /AVISO_VERSION/.test(comp) && /AVISO_FECHA/.test(comp))
  const login = leer('components', 'login-form.tsx')
  const usoLogin = login.indexOf('<AvisoPrivacidad')
  const cargaLogin = login.indexOf('if (!isInitialized)')
  check('login: importa el componente y lo usa', /import \{ AvisoPrivacidad \} from '@\/components\/aviso-privacidad'/.test(login) && usoLogin > -1, usoLogin)
  check('login: está en la pantalla principal (después de la pantalla de carga), no en la de carga', cargaLogin > -1 && usoLogin > cargaLogin)
  check('login: se usa una sola vez y con variante "login"', login.split('<AvisoPrivacidad').length === 2 && /<AvisoPrivacidad variante="login"/.test(login))
  const menuPag = leer('app', 'menu', 'page.tsx')
  const usoMenu = menuPag.indexOf('<AvisoPrivacidad')
  check('/menu: importa el componente y lo usa en el pie de la página', /import \{ AvisoPrivacidad \} from '@\/components\/aviso-privacidad'/.test(menuPag) && usoMenu > menuPag.indexOf('<footer'), usoMenu)
  check('/menu: se usa una sola vez y con variante "menu"', menuPag.split('<AvisoPrivacidad').length === 2 && /<AvisoPrivacidad variante="menu"/.test(menuPag))
}

if (require.main === module) {
  exports
    .correr()
    .then(() => process.exit(L.resumen('aviso') ? 0 : 1))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
