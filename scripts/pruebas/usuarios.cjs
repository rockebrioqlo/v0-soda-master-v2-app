/**
 * Módulo `usuarios` (sesión 14.5b-2: F44, C11, F46, F47, F48 y el cambio de PIN).
 *
 *  1. C11: prueba UNITARIA de `mapUsuario` (lib/usuario-map.ts, importada con el type stripping de Node):
 *     una fila con campos extra no sale; y los 4 orígenes del usuario (login, auth/sesion, GET /api/usuarios,
 *     `?id=`) devuelven solo campos de la lista blanca. Sin `ALTER TABLE` de prueba sobre `usuarios`.
 *  2. F44: el servidor rechaza `pinHash`, `pin_hash` e `id` (400 con el nombre del campo) y acepta `pin` de
 *     4 a 8 dígitos; el hash sale del servidor.
 *  3. F47: el email no distingue mayúsculas ni espacios (login, `verificar-pin`, alta duplicada → 409) y existe
 *     el índice único `usuarios_email_norm_uk`.
 *  4. Cambio de PIN: el admin cambia el de otro (sin `pin_actual`) y sus sesiones caen; el propio exige
 *     `pin_actual`, uno equivocado es 401 y cuenta para el bloqueo, y la sesión actual se conserva.
 *  5. F46: ráfaga de PIN errados en paralelo (solo `umbral` intentos se verifican), el tercer intento que
 *     acierta, 8 tablets que ingresan a la vez sin bloquearse por IP, y el límite por IP.
 *  6. F48: el bloqueo es por usuario + IP (un atacante se bloquea solo a sí mismo), `verificar-pin` comparte las
 *     claves y no se elude con mayúsculas ni espacios, el desbloqueo es solo de admin y ninguna otra cosa lo
 *     reinicia; tope GLOBAL por usuario con ataque repartido en muchas IPs y una IP con éxito reciente que sigue
 *     entrando; el 429 tiene el mismo cuerpo y `Retry-After`.
 *
 *  7. F49 y F50 (sesión 14.5b-3, `usuarios-admin.cjs`): no se desactiva, borra ni quita el rol admin al último admin
 *     activo ni a uno mismo (409 `ULTIMO_ADMIN`, `AUTO_MODIFICACION`) y un usuario con historial no se borra (409
 *     `USUARIO_CON_HISTORIAL`): regla pura, API con usuarios temporales, el mismo SQL en un esquema temporal
 *     `prueba_usuarios_*` (carrera incluida) y cobertura de las tablas que referencian a `usuarios`.
 *
 * Solo usa usuarios temporales de `crearUsuarioPrueba` (nunca bloquea a un usuario real) y simula IPs distintas
 * con `x-forwarded-for` (cada prueba usa las suyas; ninguna deja bloqueada la IP de las demás). Al terminar borra
 * las filas de `intentos_login` de sus usuarios y sus IPs. Los PINs viven solo en memoria.
 */
const fs = require('fs')
const path = require('path')
const L = require('./lib.cjs')
const { check, api, UUID_FALSO } = L

exports.nombre = 'usuarios'

const RAIZ = path.resolve(__dirname, '..', '..')
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')

// IPs simuladas de esta corrida (red privada, tercer octeto al azar para no chocar con corridas anteriores)
const BASE_IP = 100 + Math.floor(Math.random() * 100)
let seqIp = 0
const aleatorio = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '5')
const pinAl = () => aleatorio(4)
const ipN = () => `10.${BASE_IP}.${Math.floor(++seqIp / 250)}.${(seqIp % 250) + 1}`

async function login(email, pin, ip) {
  const r = await fetch(L.BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: JSON.stringify({ email, pin }),
  })
  const txt = await r.text()
  let json = null
  try { json = JSON.parse(txt) } catch { json = txt }
  return { status: r.status, json, retry: r.headers.get('retry-after'), cookie: (r.headers.get('set-cookie') || '').split(';')[0] }
}

const cuenta = (rs) => rs.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {})
const sinCodigo = (r) => (r.json && r.json.codigo) || null
const claves = (o) => Object.keys(o).sort()

exports.correr = async function (ctx) {
  const { admin, mesero, db, marca } = ctx
  const malo = (pin) => { let x = pinAl(); while (x === pin) x = pinAl(); return x }
  const nuevo = async (rol = 'mesero', extra = {}) => L.crearUsuarioPrueba(ctx, rol, extra, false)
  const limpiarIntentos = async () => {
    await db`DELETE FROM soda_master.intentos_login WHERE clave LIKE 'ui:prueba-%' OR clave LIKE 'ug:prueba-%' OR clave LIKE 'u:prueba-%' OR clave LIKE ${'ip:10.' + BASE_IP + '.%'} OR clave LIKE '%@prueba.invalid%'`
  }
  const fila = async (clave) => (await db`SELECT fallidos, bloqueos, bloqueado_hasta, ultimo_exito FROM soda_master.intentos_login WHERE clave = ${clave}`)[0]

  try {
    // ───────────────────────── 1. C11: lista blanca ─────────────────────────
    console.log('\n[usuarios] C11: mapUsuario (prueba unitaria) y lista blanca en los 4 orígenes del usuario')
    const mod = await import('file:///' + path.join(RAIZ, 'lib', 'usuario-map.ts').split(path.sep).join('/'))
    const PERMITIDOS = [...mod.CAMPOS_USUARIO_PUBLICO].sort()
    const fila0 = {
      id: 'u1', email: 'a@b.cl', nombre: 'X', rol: 'mesero', activo: true, created_at: 'c', updated_at: 'u',
      roles_adicionales: ['cajero', 'inventado', 7], fallidos: '2', bloqueado_hasta: '2030-01-01T00:00:00Z',
      pin_hash: '$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', pinHash: 'x', password: 'p', token: 't', dni: '1-9', rut: '1-9', secreto: 's',
    }
    const u0 = mod.mapUsuario(fila0)
    check('mapUsuario: una fila con campos extra (hash, password, token, dni…) sale SOLO con los campos de la lista blanca', JSON.stringify(claves(u0)) === JSON.stringify(PERMITIDOS), claves(u0))
    check('mapUsuario: roles_adicionales descarta lo que no es un rol válido y los contadores salen como número y fecha', JSON.stringify(u0.roles_adicionales) === '["cajero"]' && u0.intentosFallidos === 2 && u0.bloqueadoHasta === Date.parse('2030-01-01T00:00:00Z'), u0)
    const u1 = mod.mapUsuario({ id: 'u2', email: 'a@b.cl', nombre: 'X', rol: 'admin', activo: false })
    check('mapUsuario: sin contadores ni roles adicionales → 0, null y []', u1.intentosFallidos === 0 && u1.bloqueadoHasta === null && Array.isArray(u1.roles_adicionales) && u1.roles_adicionales.length === 0, u1)
    const tipos = leer('lib', 'types.ts')
    const bloqueUsuario = (tipos.match(/export interface Usuario \{[\s\S]*?\n\}/) || [''])[0]
    check('el tipo público Usuario ya no tiene pinHash ni pin_hash (C11)', bloqueUsuario.length > 0 && !/pin_?[hH]ash/.test(bloqueUsuario), bloqueUsuario.slice(0, 80))
    check('usuarios-page ya no importa bcryptjs (el hash se calcula en el servidor, F44)', !/bcryptjs/.test(leer('components', 'usuarios-page.tsx')) && !/pinHash/.test(leer('components', 'usuarios-page.tsx')))
    check('verificarPIN ya no hace SELECT * (columnas explícitas)', !/FROM soda_master\.usuarios WHERE email/.test(leer('lib', 'db.ts')) && !/SELECT \* FROM soda_master\.usuarios/.test(leer('lib', 'db.ts')))

    const tmp = await L.crearUsuarioPrueba(ctx, 'mesero')
    const patron = /\$2[aby]\$\d{2}\$|pin_hash|pinHash|"pin"\s*:|"password"\s*:/
    const lg = await login(tmp.usuario.email, tmp.usuario.pin, ipN())
    const ses = await api({ cookie: lg.cookie }, 'GET', '/api/auth/sesion')
    const lista = await api(admin, 'GET', '/api/usuarios')
    const uno = await api(admin, 'GET', '/api/usuarios?id=' + tmp.usuario.id)
    const fuera = (o) => claves(o).filter((k) => !PERMITIDOS.includes(k) && k !== 'roles' && k !== 'sesion_id')
    check('login: el usuario devuelto trae solo campos de la lista blanca y ningún hash', lg.status === 200 && fuera(lg.json).length === 0 && !patron.test(JSON.stringify(lg.json)), [lg.status, fuera(lg.json)])
    check('auth/sesion: igual', ses.status === 200 && fuera(ses.json).length === 0 && !patron.test(JSON.stringify(ses.json)), [ses.status, fuera(ses.json)])
    check('GET /api/usuarios (lista) y ?id= (admin): solo campos de la lista blanca, sin hash', lista.status === 200 && lista.json.every((u) => fuera(u).length === 0) && !patron.test(JSON.stringify(lista.json)) && uno.status === 200 && fuera(uno.json).length === 0 && !patron.test(JSON.stringify(uno.json)), [lista.status, uno.status])

    // ───────────────────────── 2. F44: pin en claro, nunca un hash ─────────────────────────
    console.log('\n[usuarios] F44: el servidor recibe pin y lo hashea; pinHash, pin_hash e id se rechazan')
    const emailBase = `prueba-f44-${Date.now().toString(36)}@prueba.invalid`
    const alta = { email: emailBase, nombre: `${marca} f44`, rol: 'mesero', activo: true }
    const hashFalso = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012'
    const r1 = await api(admin, 'POST', '/api/usuarios', { ...alta, pinHash: hashFalso })
    const r2 = await api(admin, 'POST', '/api/usuarios', { ...alta, pin: pinAl(), pin_hash: hashFalso })
    const r3 = await api(admin, 'POST', '/api/usuarios', { ...alta, pin: pinAl(), id: UUID_FALSO })
    check('POST: pinHash → 400 y el mensaje nombra el campo', r1.status === 400 && sinCodigo(r1) === 'DATOS_INVALIDOS' && /pinHash/.test(r1.json.error), [r1.status, r1.json])
    check('POST: pin_hash → 400 nombrando el campo', r2.status === 400 && /pin_hash/.test(r2.json.error), [r2.status, r2.json])
    check('POST: id → 400 nombrando el campo', r3.status === 400 && /\bid\b/.test(r3.json.error), [r3.status, r3.json])
    const malos = await Promise.all([{ pin: '123' }, { pin: '123456789' }, { pin: 'abcd' }, { pin: '12 34' }, { pin: Number(pinAl()) }, {}, { pin: pinAl(), rol: 'dios' }, { pin: pinAl(), email: 'no-es-email' }, { pin: pinAl(), nombre: '' }, { pin: pinAl(), roles_adicionales: ['dios'] }, { pin: pinAl(), activo: 'si' }].map((b) => api(admin, 'POST', '/api/usuarios', { ...alta, ...b })))
    check('POST: PIN de 3 o 9 dígitos, con letras o espacio, número, sin PIN, rol o rol adicional inventado, email malo, nombre vacío, activo no booleano → 400 DATOS_INVALIDOS', malos.every((r) => r.status === 400 && sinCodigo(r) === 'DATOS_INVALIDOS'), malos.map((r) => r.status))
    const sinSesion = await api(null, 'POST', '/api/usuarios', { ...alta, pin: pinAl() })
    const comoMesero = await api(mesero, 'POST', '/api/usuarios', { ...alta, pin: pinAl() })
    check('POST: sin sesión 401 y mesero 403', sinSesion.status === 401 && comoMesero.status === 403, [sinSesion.status, comoMesero.status])
    const PIN8 = aleatorio(8)
    const ok8 = await api(admin, 'POST', '/api/usuarios', { ...alta, pin: PIN8 })
    if (ok8.status === 201) ctx.usuariosPrueba.push(ok8.json.id)
    check('POST: pin de 8 dígitos → 201 sin campos sensibles en la respuesta', ok8.status === 201 && !patron.test(JSON.stringify(ok8.json)), [ok8.status, ok8.json])
    const hashEnBase = ok8.status === 201 ? (await db`SELECT pin_hash FROM soda_master.usuarios WHERE id = ${ok8.json.id}::uuid`)[0].pin_hash : ''
    check('el hash que quedó en la base lo calculó el servidor a partir del pin (bcrypt del pin enviado)', /^\$2[aby]\$/.test(hashEnBase) && hashEnBase !== hashFalso && (await require('bcryptjs').compare(PIN8, hashEnBase)), hashEnBase.slice(0, 7))
    const lg8 = await login(emailBase, PIN8, ipN())
    check('el usuario creado con pin de 8 dígitos entra con ese PIN', lg8.status === 200, lg8.status)
    if (ok8.status === 201) {
      const id = ok8.json.id
      const pm = await Promise.all([{ pinHash: hashFalso }, { pin_hash: hashFalso }, { id: UUID_FALSO }, {}, { pin: '12' }, { pin: '123456789' }, { pin_actual: 'x' }, { rol: 'dios' }, { email: 'mal' }].map((b) => api(admin, 'PATCH', '/api/usuarios/' + id, b)))
      check('PATCH: pinHash, pin_hash, id, cuerpo vacío, PIN corto o largo, pin_actual sin pin, rol inventado y email malo → 400 DATOS_INVALIDOS', pm.every((r) => r.status === 400 && sinCodigo(r) === 'DATOS_INVALIDOS'), pm.map((r) => r.status))
      check('PATCH: el mensaje de pinHash nombra el campo', /pinHash/.test(pm[0].json.error) && /pin_hash/.test(pm[1].json.error), pm[0].json)
      const raro = await fetch(L.BASE + '/api/usuarios/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: admin.cookie }, body: 'no json' })
      check('PATCH: un cuerpo que no es JSON → 400 (antes 500)', raro.status === 400, raro.status)
      check('PATCH: sin sesión 401 y mesero 403', (await api(null, 'PATCH', '/api/usuarios/' + id, { nombre: 'x' })).status === 401 && (await api(mesero, 'PATCH', '/api/usuarios/' + id, { nombre: 'x' })).status === 403)
    }

    // ───────────────────────── 3. F47: el email no distingue mayúsculas ni espacios ─────────────────────────
    console.log('\n[usuarios] F47: email sin distinguir mayúsculas ni espacios, e índice único')
    const em = tmp.usuario.email
    const lgMay = await login('  ' + em.toUpperCase() + '  ', tmp.usuario.pin, ipN())
    check('login con el email en MAYÚSCULAS y con espacios → 200 (antes 401)', lgMay.status === 200 && lgMay.json.email === em, [lgMay.status, lgMay.json && lgMay.json.email])
    const dup = await api(admin, 'POST', '/api/usuarios', { email: ' ' + em.toUpperCase() + ' ', nombre: `${marca} dup`, rol: 'mesero', pin: pinAl() })
    check('crear otro usuario con el mismo email en mayúsculas o con espacios → 409 (no se duplica)', dup.status === 409, [dup.status, dup.json])
    const norm = await api(admin, 'POST', '/api/usuarios', { email: ` ${emailBase.toUpperCase().replace('F44', 'F47')} `, nombre: `${marca} f47`, rol: 'mesero', pin: pinAl() })
    if (norm.status === 201) ctx.usuariosPrueba.push(norm.json.id)
    check('un email escrito en mayúsculas y con espacios se guarda recortado y en minúsculas', norm.status === 201 && norm.json.email === norm.json.email.trim().toLowerCase() && /^prueba-f47-/.test(norm.json.email), [norm.status, norm.json && norm.json.email])
    if (norm.status === 201) {
      const cambia = await api(admin, 'PATCH', '/api/usuarios/' + norm.json.id, { email: ' ' + em.toUpperCase() })
      check('editar el email a uno que ya existe (en otras mayúsculas) → 409', cambia.status === 409, [cambia.status, cambia.json])
    }
    const idx = await db`SELECT indexdef FROM pg_indexes WHERE schemaname = 'soda_master' AND tablename = 'usuarios' AND indexname = 'usuarios_email_norm_uk'`
    check('existe el índice único usuarios_email_norm_uk sobre lower(btrim(email))', idx.length === 1 && /UNIQUE/i.test(idx[0].indexdef) && /lower/i.test(idx[0].indexdef) && /btrim/i.test(idx[0].indexdef), idx)

    // ───────────────────────── 4. cambio de PIN y sesiones ─────────────────────────
    console.log('\n[usuarios] cambio de PIN: el admin cambia el de otro y sus sesiones caen; el propio exige pin_actual')
    const vic = await L.crearUsuarioPrueba(ctx, 'mesero')
    check('antes del cambio la sesión del usuario está vigente', (await api(vic.sesion, 'GET', '/api/auth/sesion')).status === 200)
    const sinCambioPin = await api(admin, 'PATCH', '/api/usuarios/' + vic.usuario.id, { nombre: `${marca} mesero renombrado` })
    check('editar el nombre (sin PIN) NO cierra la sesión del usuario', sinCambioPin.status === 200 && (await api(vic.sesion, 'GET', '/api/auth/sesion')).status === 200, sinCambioPin.status)
    const otroPin = pinAl()
    const conActual = await api(admin, 'PATCH', '/api/usuarios/' + vic.usuario.id, { pin: otroPin, pin_actual: vic.usuario.pin })
    check('cambiar el PIN de OTRO usuario con pin_actual → 400 (solo se usa al cambiar el propio)', conActual.status === 400 && sinCodigo(conActual) === 'DATOS_INVALIDOS', [conActual.status, conActual.json])
    const cambio = await api(admin, 'PATCH', '/api/usuarios/' + vic.usuario.id, { pin: otroPin })
    check('el admin cambia el PIN de otro usuario SIN pedir pin_actual → 200', cambio.status === 200, [cambio.status, cambio.json])
    const vieja = await api(vic.sesion, 'GET', '/api/auth/sesion')
    check('la sesión abierta del usuario cae al instante (401)', vieja.status === 401, vieja.status)
    const nSes = await db`SELECT count(*)::int AS n FROM soda_master.sesiones WHERE usuario_id = ${vic.usuario.id}::uuid AND revocada_at IS NULL`
    check('no queda ninguna sesión vigente de ese usuario en la base', nSes[0].n === 0, nSes)
    check('el PIN viejo ya no entra (401) y el nuevo sí (200)', (await login(vic.usuario.email, vic.usuario.pin, ipN())).status === 401 && (await login(vic.usuario.email, otroPin, ipN())).status === 200)

    // el propio PIN
    const adm = await L.crearUsuarioPrueba(ctx, 'admin')
    const ipA = ipN()
    const propio = (b, ip) => api({ ...adm.sesion, cabeceras: { 'x-forwarded-for': ip || ipA } }, 'PATCH', '/api/usuarios/' + adm.usuario.id, b)
    const nuevoPin = pinAl()
    const sinActual = await propio({ pin: nuevoPin })
    check('cambiar el PROPIO PIN sin pin_actual → 400 PIN_ACTUAL_REQUERIDO', sinActual.status === 400 && sinActual.json.codigo === 'PIN_ACTUAL_REQUERIDO', [sinActual.status, sinActual.json])
    const mal1 = await propio({ pin: nuevoPin, pin_actual: malo(adm.usuario.pin) })
    const mal2 = await propio({ pin: nuevoPin, pin_actual: malo(adm.usuario.pin) })
    check('pin_actual equivocado → 401 PIN_ACTUAL_INCORRECTO (dos veces)', mal1.status === 401 && mal1.json.codigo === 'PIN_ACTUAL_INCORRECTO' && mal2.status === 401, [mal1.status, mal2.status])
    check('un PIN actual equivocado NO cambió nada: el PIN viejo sigue entrando y la sesión sigue viva', (await api(adm.sesion, 'GET', '/api/auth/sesion')).status === 200)
    const bien = await propio({ pin: nuevoPin, pin_actual: adm.usuario.pin })
    check('el tercer intento con el PIN actual correcto (tras 2 fallos) → 200: el cambio se hace', bien.status === 200, [bien.status, bien.json])
    check('la sesión desde la que se cambió se conserva (no se cierra la propia)', (await api(adm.sesion, 'GET', '/api/auth/sesion')).status === 200)
    const pinViejoAdm = await login(adm.usuario.email, adm.usuario.pin, ipN())
    const pinNuevoAdm = await login(adm.usuario.email, nuevoPin, ipN())
    check('después del cambio el PIN viejo da 401 y el nuevo 200', pinViejoAdm.status === 401 && pinNuevoAdm.status === 200, [pinViejoAdm.status, pinNuevoAdm.status])
    const adm2 = await L.crearUsuarioPrueba(ctx, 'admin')
    const ipB = ipN()
    const propio2 = (b) => api({ ...adm2.sesion, cabeceras: { 'x-forwarded-for': ipB } }, 'PATCH', '/api/usuarios/' + adm2.usuario.id, b)
    const f1 = await propio2({ pin: nuevoPin, pin_actual: malo(adm2.usuario.pin) })
    const f2 = await propio2({ pin: nuevoPin, pin_actual: malo(adm2.usuario.pin) })
    const f3 = await propio2({ pin: nuevoPin, pin_actual: malo(adm2.usuario.pin) })
    check('el pin_actual equivocado cuenta para el bloqueo como un fallo de login: 401, 401 y al tercero 429 PIN_BLOQUEADO con Retry-After', f1.status === 401 && f2.status === 401 && f3.status === 429 && f3.json.codigo === 'PIN_BLOQUEADO', [f1.status, f2.status, f3.status])
    const f4 = await propio2({ pin: nuevoPin, pin_actual: adm2.usuario.pin })
    check('ya bloqueado, ni con el pin_actual correcto se cambia el PIN (429)', f4.status === 429, f4.status)
    check('y desde otra IP el login con el PIN original sigue entrando (el PIN no cambió)', (await login(adm2.usuario.email, adm2.usuario.pin, ipN())).status === 200)

    // ───────────────────────── 5. F46: ráfaga, tercer intento y tablets ─────────────────────────
    console.log('\n[usuarios] F46: el intento se cuenta ANTES de verificar (ráfagas en paralelo)')
    const rf = await nuevo()
    const ipR = ipN()
    const N = 12
    const rafaga = await Promise.all(Array.from({ length: N }, () => login(rf.usuario.email, malo(rf.usuario.pin), ipR)))
    const c = cuenta(rafaga)
    check(`ráfaga de ${N} PIN errados en paralelo: solo 3 intentos se verifican (2 × 401 y el tercero ya sale 429); los otros ${N - 3} → 429 sin verificar`, c[401] === 2 && c[429] === N - 2 && Object.keys(c).length === 2, c)
    check('todos los 429 traen Retry-After, codigo PIN_BLOQUEADO y bloqueado_hasta', rafaga.filter((r) => r.status === 429).every((r) => Number(r.retry) > 0 && r.json.codigo === 'PIN_BLOQUEADO' && r.json.bloqueado_hasta && /minuto/.test(r.json.error)), rafaga[0])
    check('bloqueada esa IP, ni el PIN correcto entra (429) y no se gasta bcrypt', (await login(rf.usuario.email, rf.usuario.pin, ipR)).status === 429)
    const k = await fila(`ui:${rf.usuario.email}|${ipR}`)
    check('en la base: 1 bloqueo en la clave usuario + IP y el contador de la IP no pasó de 3 intentos', k && k.bloqueos === 1 && k.bloqueado_hasta && (await fila('ip:' + ipR)).fallidos === 3, [k, await fila('ip:' + ipR)])

    const t3 = await nuevo()
    const ipT = ipN()
    const t1 = await login(t3.usuario.email, malo(t3.usuario.pin), ipT)
    const t2 = await login(t3.usuario.email, malo(t3.usuario.pin), ipT)
    const t3ok = await login(t3.usuario.email, t3.usuario.pin, ipT)
    check('el TERCER intento, si acierta, entra (200): 401, 401, 200', t1.status === 401 && t2.status === 401 && t3ok.status === 200, [t1.status, t2.status, t3ok.status])
    const kt = await fila(`ui:${t3.usuario.email}|${ipT}`)
    check('el éxito reinició el contador y el bloqueo de esa clave (y anotó el último éxito)', kt && kt.fallidos === 0 && kt.bloqueos === 0 && kt.bloqueado_hasta === null && kt.ultimo_exito, kt)
    const sig = [await login(t3.usuario.email, malo(t3.usuario.pin), ipT), await login(t3.usuario.email, malo(t3.usuario.pin), ipT)]
    check('después del éxito vuelven a valer 2 fallos (401, 401) antes del bloqueo', sig.every((r) => r.status === 401), sig.map((r) => r.status))

    const mix = await nuevo()
    const ipM = ipN()
    const mezcla = await Promise.all([malo(mix.usuario.pin), malo(mix.usuario.pin), mix.usuario.pin].map((p) => login(mix.usuario.email, p, ipM)))
    check('ráfaga de 3 con el PIN correcto entre medio: exactamente un 200 y ningún error de servidor', mezcla.filter((r) => r.status === 200).length === 1 && mezcla.every((r) => [200, 401, 429].includes(r.status)), mezcla.map((r) => r.status))

    const tab = await Promise.all(Array.from({ length: 8 }, () => nuevo()))
    const ipTab = ipN()
    const tablets = await Promise.all(tab.map((t) => login(t.usuario.email, t.usuario.pin, ipTab)))
    const kip = await fila('ip:' + ipTab)
    check('8 tablets (8 usuarios) que abren turno a la vez desde la MISMA IP → los 8 entran (200)', tablets.every((r) => r.status === 200), tablets.map((r) => r.status))
    check('el éxito devolvió el cupo de la IP (el contador queda en 0 y sin bloqueo)', kip && kip.fallidos === 0 && kip.bloqueado_hasta === null, kip)

    const ipLim = ipN()
    const muchos = await Promise.all(Array.from({ length: 24 }, (_, i) => login(`prueba-no-existe-${i}-${Date.now().toString(36)}@prueba.invalid`, pinAl(), ipLim)))
    const cl = cuenta(muchos)
    check('límite por IP: 24 intentos en paralelo desde una IP con 24 emails distintos → 19 × 401 y 5 × 429 (el intento 20 ya activa el bloqueo)', cl[401] === 19 && cl[429] === 5, cl)

    // ───────────────────────── 6. F48: usuario + IP, desbloqueo, verificar-pin ─────────────────────────
    console.log('\n[usuarios] F48: el bloqueo es por usuario + IP; un atacante se bloquea a sí mismo')
    const v = await nuevo()
    const ipAt = ipN()
    const ipLocal = ipN()
    const a1 = await login(v.usuario.email, malo(v.usuario.pin), ipAt)
    const a2 = await login(v.usuario.email, malo(v.usuario.pin), ipAt)
    const a3 = await login(v.usuario.email, malo(v.usuario.pin), ipAt)
    check('el atacante (IP A) con 3 PIN errados: 401, 401 y 429', a1.status === 401 && a2.status === 401 && a3.status === 429, [a1.status, a2.status, a3.status])
    const legit = await login(v.usuario.email, v.usuario.pin, ipLocal)
    check('el usuario legítimo desde el local (otra IP) entra igual con su PIN (200): no quedó bloqueado desde internet', legit.status === 200, legit.status)
    check('y a la IP del atacante, aun con el PIN correcto, sigue bloqueada (el ingreso del local no reinicia su clave)', (await login(v.usuario.email, v.usuario.pin, ipAt)).status === 429)
    const listaAdm = await api(admin, 'GET', '/api/usuarios')
    const vv = listaAdm.json.find((u) => u.id === v.usuario.id)
    check('el admin ve el bloqueo en la lista de Usuarios (bloqueadoHasta con fecha)', vv && typeof vv.bloqueadoHasta === 'number' && vv.bloqueadoHasta > Date.now(), vv)
    const vMesero = (await api(mesero, 'GET', '/api/usuarios')).json.find((u) => u.id === v.usuario.id)
    check('el mesero no ve el estado de bloqueo (0 y null)', vMesero && vMesero.intentosFallidos === 0 && vMesero.bloqueadoHasta === null, vMesero)
    check('desbloquear: sin sesión 401, mesero 403, uuid malo o campo extra 400, usuario inexistente 404', (await api(null, 'POST', '/api/auth/desbloquear', { usuario_id: v.usuario.id })).status === 401 && (await api(mesero, 'POST', '/api/auth/desbloquear', { usuario_id: v.usuario.id })).status === 403 && (await api(admin, 'POST', '/api/auth/desbloquear', { usuario_id: 'x' })).status === 400 && (await api(admin, 'POST', '/api/auth/desbloquear', { usuario_id: v.usuario.id, otro: 1 })).status === 400 && (await api(admin, 'POST', '/api/auth/desbloquear', { usuario_id: UUID_FALSO })).status === 404)
    check('mientras tanto el bloqueo del atacante sigue ahí (el mesero y las consultas no lo reiniciaron)', (await login(v.usuario.email, v.usuario.pin, ipAt)).status === 429)
    const des = await api(admin, 'POST', '/api/auth/desbloquear', { usuario_id: v.usuario.id })
    check('el admin desbloquea → 200 y tenia_intentos', des.status === 200 && des.json.tenia_intentos === true, des)
    check('desbloqueado, la IP del atacante entra con el PIN correcto (200)', (await login(v.usuario.email, v.usuario.pin, ipAt)).status === 200)
    const reg = (await fila(`ui:${v.usuario.email}|${ipLocal}`)) || {}
    check('el desbloqueo no borró el último éxito de la IP del local', !!reg.ultimo_exito, reg)

    // verificar-pin comparte las claves y no se elude con mayúsculas ni espacios
    const vp = await L.crearUsuarioPrueba(ctx, 'admin', {}, false)
    const ipVp = ipN()
    const pedir = (email, pin, ip) => api({ ...mesero, cabeceras: { 'x-forwarded-for': ip } }, 'POST', '/api/auth/verificar-pin', { email, pin })
    const emailVariantes = [vp.usuario.email, '  ' + vp.usuario.email.toUpperCase(), vp.usuario.email.toUpperCase() + ' ']
    const p1 = await pedir(emailVariantes[0], malo(vp.usuario.pin), ipVp)
    const p2 = await pedir(emailVariantes[1], malo(vp.usuario.pin), ipVp)
    const p3 = await pedir(emailVariantes[2], malo(vp.usuario.pin), ipVp)
    check('verificar-pin: 3 PIN errados escritos con mayúsculas y espacios distintos cuentan como UNA clave: 401, 401 y 429 (no se elude)', p1.status === 401 && p2.status === 401 && p3.status === 429, [p1.status, p2.status, p3.status])
    check('verificar-pin comparte la clave con el login: desde esa IP tampoco entra por /api/auth/login (429)', (await login(vp.usuario.email, vp.usuario.pin, ipVp)).status === 429)
    const ok = await pedir('  ' + vp.usuario.email.toUpperCase(), vp.usuario.pin, ipN())
    check('verificar-pin con el PIN correcto de un admin y el email en mayúsculas → 200, valido y token de autorización', ok.status === 200 && ok.json.valido === true && typeof ok.json.autorizacion === 'string', [ok.status, ok.json])
    check('verificar-pin: sin sesión 401', (await api(null, 'POST', '/api/auth/verificar-pin', { email: vp.usuario.email, pin: pinAl() })).status === 401)

    // ───────────────────────── 6b. tope global por usuario ─────────────────────────
    console.log('\n[usuarios] F48: tope global por usuario (ataque repartido) con exención por ingreso correcto reciente')
    const w = await nuevo()
    const ipLoc = ipN()
    const entra = await login(w.usuario.email, w.usuario.pin, ipLoc)
    check('el usuario ingresa bien desde la IP del local (queda con un éxito reciente)', entra.status === 200, entra.status)
    const atacantes = Array.from({ length: 14 }, () => ipN())
    const ataque = await Promise.all(atacantes.map((ip) => login(w.usuario.email, malo(w.usuario.pin), ip)))
    const ca = cuenta(ataque)
    check('ataque repartido: 14 IPs distintas con 1 PIN errado cada una → 11 × 401 y 3 × 429 (el cupo global de 12 se agota; el intento 12 ya activa el bloqueo)', ca[401] === 11 && ca[429] === 3, ca)
    const ugr = await fila(`ug:${w.usuario.email}`)
    check('en la base: la clave global del usuario quedó bloqueada', ugr && ugr.bloqueado_hasta && ugr.bloqueos === 1, ugr)
    const ipNueva = ipN()
    const desde = await login(w.usuario.email, w.usuario.pin, ipNueva)
    check('una IP sin éxito reciente recibe 429 para ese usuario, aun con el PIN correcto', desde.status === 429 && desde.json.codigo === 'PIN_BLOQUEADO' && Number(desde.retry) > 0, [desde.status, desde.json])
    const muestraUi = rafaga.find((r) => r.status === 429)
    check('el 429 global tiene el mismo cuerpo y Retry-After que el del bloqueo usuario + IP', JSON.stringify(claves(desde.json)) === JSON.stringify(claves(muestraUi.json)) && /^\d+$/.test(desde.retry) && /Demasiados intentos fallidos\. Intenta de nuevo en \d+ minuto/.test(desde.json.error), [claves(desde.json), claves(muestraUi.json)])
    const mal = await login(w.usuario.email, malo(w.usuario.pin), ipLoc)
    check('la IP con éxito reciente sigue entrando mientras el tope global está activo: un PIN errado desde el local responde 401 (solo cuenta en su clave usuario + IP)', mal.status === 401, mal.status)
    const bien2 = await login(w.usuario.email, w.usuario.pin, ipLoc)
    check('…y con el PIN correcto desde el local → 200', bien2.status === 200, bien2.status)
    // la exención vence: se retrocede 31 días el último éxito de ESA clave de prueba
    await db`UPDATE soda_master.intentos_login SET ultimo_exito = now() - interval '31 days' WHERE clave = ${`ui:${w.usuario.email}|${ipLoc}`}`
    check('pasados 30 días sin ingresar la exención vence: el local ya cuenta en el tope global (429)', (await login(w.usuario.email, w.usuario.pin, ipLoc)).status === 429)
    const desW = await api(admin, 'POST', '/api/auth/desbloquear', { usuario_id: w.usuario.id })
    check('el admin desbloquea al usuario y se limpian la clave global y las de cada IP', desW.status === 200 && desW.json.tenia_intentos === true, desW)
    const ugd = await fila(`ug:${w.usuario.email}`)
    check('en la base: la clave global quedó en 0 y sin bloqueo', ugd && ugd.fallidos === 0 && ugd.bloqueado_hasta === null, ugd)
    check('desbloqueado, una IP nueva entra con el PIN correcto (200)', (await login(w.usuario.email, w.usuario.pin, ipN())).status === 200)

    const x = await nuevo()
    const ipX1 = ipN()
    const ipX2 = ipN()
    await login(x.usuario.email, malo(x.usuario.pin), ipX1)
    const okX = await login(x.usuario.email, x.usuario.pin, ipX2)
    const ugx = await fila(`ug:${x.usuario.email}`)
    check('un ingreso correcto desde una IP nueva devuelve su cupo global: solo queda el fallo anterior (1)', okX.status === 200 && ugx && ugx.fallidos === 1, [okX.status, ugx])

    // ninguna otra ruta reinicia contadores (estática)
    console.log('\n[usuarios] ninguna otra ruta reinicia contadores ni toca sus claves')
    const archivos = []
    const recorre = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') recorre(p) } else if (/\.(ts|tsx)$/.test(e.name)) archivos.push(p) } }
    recorre(path.join(RAIZ, 'app')); recorre(path.join(RAIZ, 'lib')); recorre(path.join(RAIZ, 'components')); archivos.push(path.join(RAIZ, 'proxy.ts'))
    const donde = (re) => archivos.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(RAIZ, f).split(path.sep).join('/')).sort()
    const solo = (re, esperado) => JSON.stringify(donde(re)) === JSON.stringify(esperado.sort())
    check('db.desbloquearUsuario solo la llama POST /api/auth/desbloquear', solo(/db\.desbloquearUsuario\(/, ['app/api/auth/desbloquear/route.ts']), donde(/db\.desbloquearUsuario\(/))
    check('las funciones que reinician o devuelven cupo solo viven en lib/intentos-login.ts', solo(/db\.(registrarExitoUsuarioIp|devolverCupoIntento)\(/, ['lib/intentos-login.ts']), donde(/db\.(registrarExitoUsuarioIp|devolverCupoIntento)\(/))
    check('exitoIntento solo lo llaman login, verificar-pin y el cambio del propio PIN (con pin_actual verificado)', solo(/\bexitoIntento\(/, ['app/api/auth/login/route.ts', 'app/api/auth/verificar-pin/route.ts', 'app/api/usuarios/[id]/route.ts', 'lib/intentos-login.ts']), donde(/\bexitoIntento\(/))
    check('nadie más escribe en intentos_login desde código de la app', solo(/UPDATE soda_master\.intentos_login|INSERT INTO soda_master\.intentos_login|DELETE FROM soda_master\.intentos_login/, ['lib/db.ts']), donde(/UPDATE soda_master\.intentos_login|INSERT INTO soda_master\.intentos_login|DELETE FROM soda_master\.intentos_login/))
    // ───────────────────────── 7. F49 y F50 (sesión 14.5b-3): administradores y borrado ─────────────────────────
    await require('./usuarios-admin.cjs').correr(ctx, { login })
  } finally {
    try { await limpiarIntentos() } catch (e) { console.log('  AVISO: no se pudieron limpiar los intentos de prueba:', e.message) }
  }
}
