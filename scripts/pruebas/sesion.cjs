/**
 * Módulo `sesion` (sesión 14.5a, F42): cierre de sesión por inactividad.
 *
 * Cómo prueba el vencimiento sin esperar minutos reales: levanta DOS servidores propios con el mismo
 * build (`.next`), en los puertos 3012 y 3013, con el ajuste solo de desarrollo
 *   SESION_MINUTO_SEG_DEV=2 (un "minuto" dura 2 s: el mínimo de 5 son 10 s) y SESION_TOPE_SEG_DEV=45.
 * El 3013 además define VERCEL=1, y ahí el ajuste tiene que IGNORARSE. El servidor principal (el que
 * levantaste con `pnpm start -p 3011`) queda a escala real: ahí se prueba la validación de la
 * configuración y que la actividad no se escriba en cada petición. No cambia fechas por SQL: solo las
 * lee. Usa usuarios de prueba propios (una sesión por usuario: así no toca las sesiones de la corrida).
 *
 * La configuración (`sesion_inactividad_min` y `sesion_inactividad_kds_min`) se cambia con la API de
 * admin y se deja con sus valores por defecto (15 y 0 = sin cierre) al terminar.
 * Dura ~1 minuto. Puertos: PRUEBAS_PUERTO_SESION (3012) y PRUEBAS_PUERTO_VERCEL (3013).
 */
const { spawn, spawnSync } = require('child_process')
const path = require('path')
const L = require('./lib.cjs')
const { check, api, sleep } = L

exports.nombre = 'sesion'

const RAIZ = path.resolve(__dirname, '..', '..')
const P_DEV = Number(process.env.PRUEBAS_PUERTO_SESION || 3012)
const P_VERCEL = Number(process.env.PRUEBAS_PUERTO_VERCEL || 3013)
const MINUTO_DEV = 2
const TOPE_DEV = 45

function levantar(puerto, extra) {
  const env = { ...process.env, SESION_MINUTO_SEG_DEV: String(MINUTO_DEV), SESION_TOPE_SEG_DEV: String(TOPE_DEV), ...extra }
  if (!extra.VERCEL) delete env.VERCEL
  const proc = spawn(process.execPath, [path.join(RAIZ, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(puerto)], {
    cwd: RAIZ, env, stdio: 'ignore', windowsHide: true,
  })
  return proc
}

async function responde(base) {
  return fetch(base + '/api/hora').then((r) => r.status === 200).catch(() => false)
}

async function esperar(base, ms = 120000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    if (await responde(base)) return true
    await sleep(500)
  }
  return false
}

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina, db } = ctx
  const BASE_DEV = `http://localhost:${P_DEV}`
  const BASE_VERCEL = `http://localhost:${P_VERCEL}`
  const procs = []
  const get = (ses, ruta, cabeceras) => api(cabeceras ? { ...ses, cabeceras } : ses, 'GET', ruta)
  const SONDEO = '/api/sondeo?secciones=notificaciones'
  const actividad = async (uid) => Number((await db`
    SELECT extract(epoch FROM ultima_actividad)::float8 AS t FROM soda_master.sesiones
    WHERE usuario_id = ${uid}::uuid AND revocada_at IS NULL ORDER BY creada DESC LIMIT 1`)[0].t)
  const topeBase = async (uid) => Number((await db`
    SELECT extract(epoch FROM (expira - creada))::float8 AS t FROM soda_master.sesiones
    WHERE usuario_id = ${uid}::uuid AND revocada_at IS NULL ORDER BY creada DESC LIMIT 1`)[0].t)
  const maxAge = (ses) => Number(((ses.setCookie || '').match(/Max-Age=(\d+)/i) || [])[1])

  const cfg0 = (await api(admin, 'GET', '/api/configuracion')).json || {}
  const restaurar = () => api(admin, 'PATCH', '/api/configuracion', { sesion_inactividad_min: 15, sesion_inactividad_kds_min: 0 })

  try {
    // ───────────────────── configuración (servidor principal, escala real) ─────────────────────
    console.log('\n[sesion] configuración: validación y permisos')
    const cfg = (cuerpo, ses = admin) => api(ses, 'PATCH', '/api/configuracion', cuerpo)
    check('minutos de inactividad menores que 5 → 400', (await cfg({ sesion_inactividad_min: 4 })).status === 400)
    check('minutos que no son enteros o no son número → 400', (await cfg({ sesion_inactividad_min: 7.5 })).status === 400 && (await cfg({ sesion_inactividad_min: '10' })).status === 400)
    check('minutos sobre el tope de 960 → 400', (await cfg({ sesion_inactividad_min: 961 })).status === 400)
    check('minutos de KDS entre 1 y 4 → 400 (0 es "sin cierre")', (await cfg({ sesion_inactividad_kds_min: 3 })).status === 400 && (await cfg({ sesion_inactividad_kds_min: -1 })).status === 400)
    check('clave desconocida o body que no es un objeto → 400', (await cfg({ clave_inventada: 1 })).status === 400 && (await cfg([1, 2])).status === 400)
    check('configuración con un tipo equivocado → 400 con código', (await cfg({ impuesto_habilitado: 'si' })).json.codigo === 'DATOS_INVALIDOS')
    check('solo admin cambia la configuración: mesero, cajero y cocina → 403', (await cfg({ sesion_inactividad_min: 20 }, mesero)).status === 403 && (await cfg({ sesion_inactividad_min: 20 }, cajero)).status === 403 && (await cfg({ sesion_inactividad_min: 20 }, cocina)).status === 403)
    check('sin sesión → 401', (await cfg({ sesion_inactividad_min: 20 }, null)).status === 401)
    const ok = await cfg({ sesion_inactividad_min: 5, sesion_inactividad_kds_min: 0 })
    const lee = (await api(admin, 'GET', '/api/configuracion')).json
    check('admin guarda 5 y "sin cierre" y la lectura los devuelve como números', ok.status === 200 && lee.sesion_inactividad_min === 5 && lee.sesion_inactividad_kds_min === 0, lee)

    console.log('\n[sesion] escala real: la actividad no se escribe en cada petición y el tope es de 16 h')
    const real = await L.crearUsuarioPrueba(ctx, 'mesero')
    const a0 = await actividad(real.usuario.id)
    for (let i = 0; i < 6; i++) await get(real.sesion, '/api/mesas')
    check('seis acciones en el primer minuto no escriben la última actividad', (await actividad(real.usuario.id)) === a0)
    const t16 = await topeBase(real.usuario.id)
    check('el tope absoluto es de 16 horas (expira − creada) y la cookie dura lo mismo', Math.abs(t16 - 57600) < 5 && maxAge(real.sesion) === 57600, [t16, maxAge(real.sesion)])

    // ───────────────────── servidores con el ajuste de desarrollo ─────────────────────
    console.log('\n[sesion] levantando servidores de prueba (ajuste de desarrollo)')
    if ((await responde(BASE_DEV)) || (await responde(BASE_VERCEL))) {
      check(`los puertos ${P_DEV} y ${P_VERCEL} están libres`, false, 'ya hay un servidor en alguno de los dos')
      return
    }
    procs.push(levantar(P_DEV, {}), levantar(P_VERCEL, { VERCEL: '1' }))
    const arriba = (await Promise.all([esperar(BASE_DEV), esperar(BASE_VERCEL)])).every(Boolean)
    check('los dos servidores de prueba levantaron', arriba)
    if (!arriba) return

    const mk = (rol, extra) => L.crearUsuarioPrueba(ctx, rol, extra || {}, false)
    const [uA, uB, uC, uD, uE, uF, uG] = [
      await mk('mesero'), await mk('cajero'), await mk('mesero'), await mk('cocina'), await mk('bar'),
      await mk('cocina', { roles_adicionales: ['mesero'] }), await mk('mesero'),
    ]
    // Primero las sesiones de larga vida (y de paso se calientan los dos servidores); después, en un grupo corto,
    // las que dependen de los 10 s de inactividad (A, B, C y F): si el grupo tarda más de 2,5 s se repite.
    const [sD, sE] = await Promise.all([uD, uE].map((u) => u.reingresar(BASE_DEV)))
    const sG = await uG.reingresar(BASE_VERCEL)
    let sA, sB, sC, sF
    for (let intento = 0; intento < 4; intento++) {
      const t1 = Date.now()
      ;[sA, sB, sC, sF] = await Promise.all([uA, uB, uC, uF].map((u) => u.reingresar(BASE_DEV)))
      if (Date.now() - t1 < 2500) break
    }
    // T0 va DESPUÉS de los logins: cada sesión tiene al menos t segundos de inactividad en el segundo t.
    const T0 = Date.now()
    const t = () => (Date.now() - T0) / 1000
    const hasta = async (seg) => { const f = seg * 1000 - (Date.now() - T0); if (f > 0) await sleep(f) }
    const ids = { A: uA.usuario.id, B: uB.usuario.id, C: uC.usuario.id }
    const act0 = { A: await actividad(ids.A), B: await actividad(ids.B), C: await actividad(ids.C) }
    console.log(`  (sesiones abiertas; un "minuto" dura ${MINUTO_DEV} s, mínimo de 5 = ${5 * MINUTO_DEV} s, tope ${TOPE_DEV} s)`)

    check('login con el ajuste: la cookie dura el tope de desarrollo; con VERCEL se ignora y dura 16 h', maxAge(sA) === TOPE_DEV && maxAge(sG) === 57600, [maxAge(sA), maxAge(sG)])
    check('VERCEL definida: el tope guardado en la base es de 16 h, no el de desarrollo', Math.abs((await topeBase(uG.usuario.id)) - 57600) < 5)

    await hasta(3.5)
    // C: una ráfaga de 6 acciones reales con la última actividad ya "vieja" (> 2 s): escribe UNA vez.
    const c0 = await actividad(ids.C)
    const r1 = await Promise.all(Array.from({ length: 6 }, () => get(sC, '/api/mesas')))
    const c1 = await actividad(ids.C)
    const r2 = await Promise.all(Array.from({ length: 6 }, () => get(sC, '/api/mesas')))
    const c2 = await actividad(ids.C)
    check('acciones reales: las 12 responden 200', [...r1, ...r2].every((r) => r.status === 200))
    check('la primera ráfaga renueva la actividad y la segunda (al instante) no la vuelve a escribir', c1 > c0 && c2 === c1, [c0, c1, c2])

    await hasta(4)
    const sa1 = await get(sA, SONDEO)
    const sb1 = await get(sB, '/api/mesas', { 'x-sm-sondeo': '1' })
    check('antes de vencer, el sondeo (A) y una recarga con x-sm-sondeo (B) responden 200', sa1.status === 200 && sb1.status === 200, [sa1.status, sb1.status])

    const accionesC = []
    const accionC = async () => accionesC.push((await get(sC, '/api/mesas')).status)
    await hasta(7.5)
    await accionC()
    await hasta(5.5)
    const sa2 = await get(sA, SONDEO)
    const sb2 = await get(sB, '/api/mesas', { 'x-sm-sondeo': '1' })
    const sf1 = await get(sF, SONDEO)
    check('hacia el segundo 5,5 siguen vivos (la demora de los logins suma pocos segundos, aún bajo los 10 s)', sa2.status === 200 && sb2.status === 200 && sf1.status === 200, [sa2.status, sb2.status, sf1.status])
    check('el sondeo y la recarga marcada NO renuevan: la última actividad de A y B no cambió', (await actividad(ids.A)) === act0.A && (await actividad(ids.B)) === act0.B)

    await hasta(11.5)
    await accionC()
    await hasta(12.5)
    const sa3 = await get(sA, SONDEO)
    const sb3 = await get(sB, '/api/mesas')
    const sf2 = await get(sF, SONDEO)
    const sg = await get(sG, SONDEO)
    check('A: tras 10 s sin acciones, aunque siguió el sondeo, → 401 SESION_INACTIVA', sa3.status === 401 && sa3.json.codigo === 'SESION_INACTIVA', sa3)
    check('B: la recarga marcada tampoco la mantuvo viva (la siguiente petición → 401 SESION_INACTIVA)', sb3.status === 401 && sb3.json.codigo === 'SESION_INACTIVA', sb3)
    check('F (cocina + mesero): al tener un rol de salón aplica el límite general → 401 SESION_INACTIVA', sf2.status === 401 && sf2.json.codigo === 'SESION_INACTIVA', sf2)
    check('con VERCEL el ajuste se ignora: la misma inactividad NO cierra la sesión (200)', sg.status === 200, sg)

    const sesionA = await fetch(BASE_DEV + '/api/auth/sesion', { headers: { cookie: sA.cookie } })
    const jA = await sesionA.json().catch(() => ({}))
    check('/api/auth/sesion de una sesión vencida → 401 SESION_INACTIVA y borra la cookie', sesionA.status === 401 && jA.codigo === 'SESION_INACTIVA' && /Max-Age=0/i.test(sesionA.headers.get('set-cookie') || ''))
    const otra = await get(sA, '/api/mesas')
    check('una sesión vencida no se revive con más peticiones (sigue 401 SESION_INACTIVA)', otra.status === 401 && otra.json.codigo === 'SESION_INACTIVA')

    await hasta(14)
    const d1 = await get(sD, SONDEO)
    check('cocina con "sin cierre": a los 14 s sin acciones sigue viva (200)', d1.status === 200, d1)
    await hasta(15.5)
    await accionC()

    await hasta(20)
    const d2 = await get(sD, SONDEO)
    const cambio = await cfg({ sesion_inactividad_kds_min: 5 })
    const d3 = await get(sD, SONDEO)
    await cfg({ sesion_inactividad_kds_min: 0 })
    check('cocina sin cierre sigue viva a los 20 s', d2.status === 200)
    check('el admin pasa el KDS a 5 min (10 s de prueba) y se aplica a la sesión vigente sin reiniciar nada: → 401 SESION_INACTIVA', cambio.status === 200 && d3.status === 401 && d3.json.codigo === 'SESION_INACTIVA', [cambio.status, d3])
    await accionC()

    await hasta(25)
    const e1 = await get(sE, SONDEO)
    check('bar con "sin cierre" sigue vivo a los 25 s (el tope es de 45 s)', e1.status === 200, e1)

    await hasta(36)
    const c3 = await get(sC, '/api/mesas')
    check('renovación por acciones reales: C hizo una acción cada ~4 s durante 20 s (el doble del límite de 10 s) y todas dieron 200', accionesC.length >= 4 && accionesC.every((s) => s === 200), accionesC)
    check('C dejó de actuar: pasados los 10 s sin acciones → 401 SESION_INACTIVA', c3.status === 401 && c3.json.codigo === 'SESION_INACTIVA', c3)

    await hasta(TOPE_DEV + 2.5)
    const e2 = await get(sE, SONDEO)
    const e3 = await get(sE, '/api/mesas')
    const g2 = await get(sG, '/api/mesas')
    check(`la cookie del bar dura el tope de desarrollo (${TOPE_DEV} s)`, maxAge(sE) === TOPE_DEV)
    check(`tope absoluto: el bar con "sin cierre" vence a los ${TOPE_DEV} s → 401 SESION_VENCIDA`, e2.status === 401 && e2.json.codigo === 'SESION_VENCIDA' && e3.status === 401 && e3.json.codigo === 'SESION_VENCIDA', [e2, e3])
    check('con VERCEL el tope de desarrollo también se ignora: la sesión G sigue viva pasados los 45 s (200)', g2.status === 200, g2)
    console.log(`  (fin de la línea de tiempo: ${t().toFixed(1)} s)`)
  } finally {
    for (const p of procs) {
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
        else p.kill()
      } catch { /* ya cerrado */ }
    }
    await sleep(1500)
    check('los servidores de prueba se cerraron', !(await responde(BASE_DEV_SAFE(P_DEV))) && !(await responde(BASE_DEV_SAFE(P_VERCEL))))
    const r = await restaurar()
    check('la configuración de inactividad quedó en sus valores por defecto (15 y sin cierre)', r.status === 200 && r.json.sesion_inactividad_min === 15 && r.json.sesion_inactividad_kds_min === 0, r.status)
  }
}

function BASE_DEV_SAFE(puerto) {
  return `http://localhost:${puerto}`
}
