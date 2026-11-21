/**
 * Módulo `arco` (sesión 18, K1): derechos ARCOP (acceso, rectificación, supresión, oposición y portabilidad).
 *
 *  A. UNITARIAS (sin servidor): `lib/rut.ts` (Módulo 11 y la regla de cuándo se valida), `lib/arco-reglas.ts`
 *     (plazos, las 10 columnas de nombre copiado, `exportarConAuditoria` que NO entrega nada si no se puede
 *     registrar) y `lib/arco-respuesta.ts` (el texto sugerido al titular).
 *  B. POR LA API (servidor de la corrida): 401 y 403 en las rutas nuevas, ingreso de solicitudes (`vence_en` = ingreso
 *     + 30 días corridos, duplicados, 400 y 404), una sola prórroga (con carrera de 3 rondas), exportar los tres
 *     tipos de titular (acceso y portabilidad), rectificar incluyendo vaciar un campo, validar el RUT, resolver y
 *     suprimir (anonimizar) un empleado, un proveedor y un usuario temporal, con carrera de 3 rondas.
 *     Los titulares de prueba llevan la marca de la corrida; la limpieza (`lib.cjs`) los borra por los ids que esta
 *     prueba guardó en `ctx.arco` (tras anonimizarlos el nombre ya no coincide con la marca) y borra las
 *     solicitudes ANTES de los usuarios temporales (`ingresada_por`/`resuelta_por` cuentan como historial, F50).
 *  C. `scripts/pruebas/arco-anonimizar.cjs`: el MISMO SQL en un esquema temporal `prueba_arco_*` (las 10 columnas, los
 *     montos intactos, las guardas, la atomicidad, la carrera, los nombres con caracteres especiales).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const L = require('./lib.cjs')
const { check, api, UUID_FALSO } = L

exports.nombre = 'arco'

const RAIZ = path.resolve(__dirname, '..', '..')
const importar = (...p) => import('file:///' + path.join(RAIZ, ...p).split(path.sep).join('/'))
const j = (o) => JSON.stringify(o)
const mismoConjunto = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

/** Módulo 11 escrito aquí, independiente del código (la especificación). */
function dvEspecificacion(cuerpo) {
  let suma = 0
  let f = 2
  for (const d of String(cuerpo).split('').reverse()) {
    suma += Number(d) * f
    f = f === 7 ? 2 : f + 1
  }
  const r = 11 - (suma % 11)
  return r === 11 ? '0' : r === 10 ? 'K' : String(r)
}

exports.dvEspecificacion = dvEspecificacion

exports.correr = async function (ctx) {
  const { admin, mesero, cajero, cocina, db, marca } = ctx
  ctx.arco = ctx.arco || { solicitudes: [], empleados: [], proveedores: [], gastos: [] }
  const A = ctx.arco

  // ───────────────────────── A. unitarias ─────────────────────────
  console.log('\n[arco] A: RUT Módulo 11, reglas, respuesta al titular')
  let R, RG, RS
  try {
    R = await importar('lib', 'rut.ts')
    RG = await importar('lib', 'arco-reglas.ts')
    RS = await importar('lib', 'arco-respuesta.ts')
  } catch (e) {
    check('existen los módulos lib/rut.ts, lib/arco-reglas.ts y lib/arco-respuesta.ts', false, String(e.message).slice(0, 200))
  }
  if (R) {
    const vectores = [['12.345.678-5', true], ['12345678-5', true], ['123456785', true], ['11.111.111-1', true], ['99.888.777-1', true], ['77.666.555-K', true], ['77.666.555-k', true],
      ['12.345.678-4', false], ['99.888.777-6', false], ['1234', false], ['', false], ['abc', false], ['12.345.678', false], ['00.000.000-0', false], ['12.345.678-55', false], ['AB123456', false]]
    const malos = vectores.filter(([v, esperado]) => R.validarRut(v) !== esperado).map(([v]) => v)
    check(`validarRut: ${vectores.length} casos (con y sin puntos y guion, K en mayúscula y minúscula, dígito errado, corto, letras)`, malos.length === 0, malos)
    let dif = []
    for (let i = 0; i < 300; i++) {
      const cuerpo = String(1_000_000 + Math.floor(Math.random() * 98_999_999))
      if (R.calcularDv(cuerpo) !== dvEspecificacion(cuerpo)) dif.push(cuerpo)
    }
    check('calcularDv coincide con la especificación independiente en 300 cuerpos al azar (incluye dígitos 0 y K)', dif.length === 0, dif.slice(0, 3))
    check('formatearRut deja 12.345.678-5 y 77.666.555-K (K mayúscula) desde cualquier escritura', R.formatearRut('123456785') === '12.345.678-5' && R.formatearRut('77666555-k') === '77.666.555-K' && R.formatearRut('7.766.655-K'.replace('K', dvEspecificacion('7766655'))) === '7.766.655-' + dvEspecificacion('7766655'))
    // resolverDocumento: cuándo se valida (no bloquea datos antiguos, deja vaciar y acepta otro documento)
    const rd = R.resolverDocumento
    check('resolverDocumento: vacío o null deja el campo vacío (es "vaciar", no un error)', j(rd('', '99.888.777-6', false)) === j({ ok: true, valor: null }) && j(rd(null, null, false)) === j({ ok: true, valor: null }) && j(rd('   ', null, false)) === j({ ok: true, valor: null }))
    check('resolverDocumento: un RUT válido se guarda con el formato canónico', j(rd('123456785', null, false)) === j({ ok: true, valor: '12.345.678-5' }) && j(rd('77666555k', null, false)) === j({ ok: true, valor: '77.666.555-K' }))
    check('resolverDocumento: un RUT con dígito errado se rechaza (y un pasaporte sin la casilla también)', rd('12.345.678-4', null, false).ok === false && rd('AB123456', null, false).ok === false && rd('12345678', null, false).ok === false)
    check('resolverDocumento: con documento_otro se acepta cualquier documento (recortado), por ejemplo un pasaporte o una cédula extranjera de 8 dígitos', j(rd('  PAS 123456 ', null, true)) === j({ ok: true, valor: 'PAS 123456' }) && j(rd('12345678', null, true)) === j({ ok: true, valor: '12345678' }))
    check('resolverDocumento: un dato antiguo inválido que no cambió NO se bloquea (el formulario reenvía todo), pero uno distinto sí', rd('99.888.777-6', '99.888.777-6', false).ok === true && rd('99888777-6', '99.888.777-6', false).ok === true && rd('99.888.777-7', '99.888.777-6', false).ok === false)
  }
  if (RG) {
    check('plazos: 30 días corridos y una prórroga de 30 más', RG.PLAZO_DIAS === 30 && RG.PRORROGA_DIAS === 30)
    check('ANONIMIZAR_SUELDO es false por defecto (el sueldo se conserva; decisión del 21-11-2026, a confirmar con el contador)', RG.ANONIMIZAR_SUELDO === false)
    const cols = RG.COLUMNAS_NOMBRE_COPIADO
    check('son 10 columnas de nombre copiado en 6 tablas (sección 2.2 del inventario)', Array.isArray(cols) && cols.length === 10 && new Set(cols.map((c) => c.tabla)).size === 6, cols && cols.length)
    check('cada columna de nombre se anonimiza por el id que le corresponde (no por coincidencia de nombre)', cols.every((c) => c.tabla && c.nombre && c.id && /_nombre$/.test(c.nombre) && /(_id|_por|usuario_id)$/.test(c.id)))
    check('exportarConAuditoria: si el registro de la auditoría falla NO se lee ni se entrega nada (500)', await (async () => {
      let leyo = false
      let err = null
      try { await RG.exportarConAuditoria(async () => { throw new Error('falla el registro') }, async () => { leyo = true; return { datos: 1 } }) } catch (e) { err = e }
      return err && err.message === 'falla el registro' && leyo === false
    })())
    check('exportarConAuditoria: con el registro bien, registra primero y devuelve lo leído', await (async () => {
      const orden = []
      const r = await RG.exportarConAuditoria(async () => { orden.push('registro') }, async () => { orden.push('lectura'); return { datos: 1 } })
      return orden.join() === 'registro,lectura' && r.datos === 1
    })())
  }
  if (RS && RG) {
    const t = RS.componerRespuesta({ tipo: 'supresion', titular_tipo: 'proveedor', ingresada_en: '2026-11-21', resultado: { anonimizado: ['nombre', 'contacto'], conservado: ['rut'] } })
    check('respuesta sugerida de una supresión: dice qué se anonimizó, qué se conserva con su fundamento (6 años) y que los respaldos de Neon conservan el dato dentro de su ventana', typeof t === 'string' && /anonimiz/i.test(t) && /6 años/.test(t) && /respaldo|copias de seguridad/i.test(t) && /Neon|proveedor de base de datos/i.test(t) && /Agencia de Protección de Datos Personales/.test(t), t)
    const t2 = RS.componerRespuesta({ tipo: 'supresion', titular_tipo: 'empleado', ingresada_en: '2026-11-21', resultado: { anonimizado: ['nombre'], conservado: ['sueldo_y_fechas_laborales'] } })
    check('respuesta sugerida para un empleado: dice que el sueldo y las fechas se conservan y que el plazo laboral se confirma con el contador', /sueldo/i.test(t2) && /contador|laboral/i.test(t2), t2)
    check('la respuesta sugerida es un borrador para revisión legal y no trae valores personales', /borrador|revisión legal/i.test(t) && !/@/.test(t))
  }

  // ───────────────────────── B. por la API ─────────────────────────
  console.log('\n[arco] B: por la API (401, 403, solicitudes, prórroga, exportar, rectificar, RUT, resolver, suprimir)')
  const bar = await L.crearUsuarioPrueba(ctx, 'bar')
  const etiqueta = Date.now().toString(36) + Math.floor(Math.random() * 1000)
  const adm = (m, r, c) => api(admin, m, r, c)
  const hoyMasDias = async (n) => (await db`SELECT to_char((now() AT TIME ZONE 'America/Santiago')::date + ${n}::int, 'YYYY-MM-DD') AS v`)[0].v
  const fechaTxt = (v) => (v ? String(v).slice(0, 10) : v)
  const tieneId = (r, st = 200) => r.status === st && r.json && typeof r.json.id === 'string'

  // 401 y 403 en todas las rutas nuevas
  const rutas = [
    ['GET', '/api/arco/solicitudes'], ['POST', '/api/arco/solicitudes', {}], ['GET', '/api/arco/solicitudes/' + UUID_FALSO],
    ['POST', `/api/arco/solicitudes/${UUID_FALSO}/prorroga`, {}], ['GET', `/api/arco/solicitudes/${UUID_FALSO}/exportar`],
    ['POST', `/api/arco/solicitudes/${UUID_FALSO}/resolver`, {}], ['POST', `/api/arco/solicitudes/${UUID_FALSO}/suprimir`, {}],
  ]
  for (const [rol, ses, esperado] of [['sin sesión', null, 401], ['mesero', mesero, 403], ['cajero', cajero, 403], ['cocina', cocina, 403], ['bar', bar.sesion, 403]]) {
    const malos = []
    for (const [m, ruta, cuerpo] of rutas) {
      const r = await api(ses, m, ruta, cuerpo)
      if (r.status !== esperado) malos.push(`${m} ${ruta} → ${r.status}`)
    }
    check(`${rol}: las ${rutas.length} rutas de /api/arco responden ${esperado}`, malos.length === 0, malos)
  }

  // titulares de prueba
  const mkEmp = async (extra = {}) => {
    const r = await adm('POST', '/api/empleados', { nombre: `${marca} empleado ${etiqueta}${A.empleados.length}`, cargo: 'Cargo prueba', documento: '12.345.678-5', telefono: '+56 9 5555 4321', email: `prueba-arco-${etiqueta}@prueba.invalid`, sueldo_base: 654321, fecha_ingreso: '2025-03-01', notas: 'nota reservada arco', ...extra })
    if (r.status === 201 && r.json && r.json.id) A.empleados.push(r.json.id)
    return r
  }
  const mkProv = async (extra = {}) => {
    const r = await adm('POST', '/api/proveedores', { nombre: `${marca} proveedor ${etiqueta}${A.proveedores.length}`, rut: '77.666.555-K', contacto: 'Contacto Reservado Arco', telefono: '+56 9 1111 2222', email: `prueba-arco-prov-${etiqueta}@prueba.invalid`, direccion: 'Calle Reservada 123', notas: 'nota reservada prov', ...extra })
    if (r.status === 201 && r.json && r.json.id) A.proveedores.push(r.json.id)
    return r
  }
  const mkGasto = async (extra) => {
    const r = await adm('POST', '/api/gastos', { monto: 100000, tipo: 'sueldo', categoria: 'sueldos', ...extra })
    if (r.json && r.json.id) A.gastos.push(r.json.id)
    return r
  }
  const mkSol = async (tipo, titular_tipo, titular_id, canal = 'presencial') => {
    const r = await adm('POST', '/api/arco/solicitudes', { tipo, titular_tipo, titular_id, canal })
    if (r.json && r.json.id) A.solicitudes.push(r.json.id)
    return r
  }
  const entradas = async (filtro) => ((await adm('GET', '/api/auditoria?limite=500')).json || []).filter(filtro)

  const e1r = await mkEmp()
  check('POST empleado con un RUT válido → 201 (el formulario ya valida el Módulo 11)', tieneId(e1r, 201), e1r)
  const e1 = e1r.json && e1r.json.id
  const gSueldo = await mkGasto({ empleado_id: e1, descripcion: `Sueldo ${e1r.json && e1r.json.nombre} octubre`, notas: 'pagado por transferencia' })
  const p1r = await mkProv()
  const p1 = p1r.json && p1r.json.id
  const gProv = await mkGasto({ proveedor_id: p1, tipo: 'operativo', categoria: 'insumos', descripcion: 'compra a proveedor' })
  const u1 = await L.crearUsuarioPrueba(ctx, 'mesero', {}, false)
  const uid = u1.usuario.id

  // ── solicitudes: ingreso ──
  const esperado30 = await hoyMasDias(30)
  const s1 = await mkSol('acceso', 'empleado', e1)
  check('POST solicitud → 201 pendiente, `vence_en` = ingreso + 30 días corridos (hora de Santiago) y los días restantes', tieneId(s1, 201) && s1.json.estado === 'pendiente' && fechaTxt(s1.json.vence_en) === esperado30 && s1.json.prorrogada === false && s1.json.dias_restantes === 30 && s1.json.titular_tipo === 'empleado' && s1.json.titular_id === e1 && s1.json.ingresada_por === admin.id, s1)
  const dup = await adm('POST', '/api/arco/solicitudes', { tipo: 'acceso', titular_tipo: 'empleado', titular_id: e1, canal: 'correo' })
  check('la misma solicitud pendiente del mismo titular → 409 SOLICITUD_DUPLICADA', dup.status === 409 && dup.json && dup.json.codigo === 'SOLICITUD_DUPLICADA', dup)
  const malas = [
    { tipo: 'borrado', titular_tipo: 'empleado', titular_id: e1, canal: 'presencial' }, { tipo: 'acceso', titular_tipo: 'cliente', titular_id: e1, canal: 'presencial' },
    { tipo: 'acceso', titular_tipo: 'empleado', titular_id: 'no-uuid', canal: 'presencial' }, { tipo: 'acceso', titular_tipo: 'empleado', titular_id: e1, canal: 'paloma' },
    { tipo: 'acceso', titular_tipo: 'empleado', titular_id: e1 }, { tipo: 'acceso', titular_tipo: 'empleado', titular_id: e1, canal: 'presencial', vence_en: '2030-01-01' },
    { tipo: 'acceso', titular_tipo: 'empleado', titular_id: e1, canal: 'presencial', estado: 'resuelta' }, { tipo: 'acceso', titular_tipo: 'empleado', titular_id: e1, canal: 'presencial', ingresada_por: UUID_FALSO },
  ]
  const no400 = []
  for (const b of malas) { const r = await adm('POST', '/api/arco/solicitudes', b); if (r.status !== 400 || !r.json || r.json.codigo !== 'DATOS_INVALIDOS') no400.push(j(b).slice(0, 80) + ' → ' + r.status) }
  check(`POST solicitud con datos inválidos → 400 (${malas.length} casos: tipo, titular, uuid, canal, falta un campo, y campos que decide el servidor como vence_en, estado e ingresada_por)`, no400.length === 0, no400)
  const noExiste = await adm('POST', '/api/arco/solicitudes', { tipo: 'acceso', titular_tipo: 'empleado', titular_id: UUID_FALSO, canal: 'presencial' })
  check('un titular que no existe → 404 TITULAR_NO_ENCONTRADO y no se crea nada', noExiste.status === 404 && noExiste.json && noExiste.json.codigo === 'TITULAR_NO_ENCONTRADO', noExiste)
  const g = await adm('GET', '/api/arco/solicitudes/' + (s1.json && s1.json.id))
  check('GET solicitud por id: la misma fila, con el nombre del titular que el sistema ya tiene y sin guardarlo', g.status === 200 && g.json.id === s1.json.id && typeof g.json.titular_nombre === 'string' && g.json.titular_nombre.startsWith(marca), g)
  const lista = await adm('GET', '/api/arco/solicitudes?estado=pendiente&limite=50')
  check('GET lista: filtra por estado, trae la nueva y respeta el límite', lista.status === 200 && Array.isArray(lista.json) && lista.json.length <= 50 && lista.json.every((s) => s.estado === 'pendiente') && lista.json.some((s) => s.id === (s1.json && s1.json.id)), lista.status)
  const q400 = []
  for (const q of ['?estado=otro', '?limite=0', '?limite=501', '?foo=1']) if ((await adm('GET', '/api/arco/solicitudes' + q)).status !== 400) q400.push(q)
  check('GET lista con parámetros inválidos → 400', q400.length === 0, q400)
  check('GET solicitud con un id que no existe → 404 y con uno mal escrito → 400', (await adm('GET', '/api/arco/solicitudes/' + UUID_FALSO)).status === 404 && (await adm('GET', '/api/arco/solicitudes/no-uuid')).status === 400)
  const aud1 = await entradas((e) => e.entidad === 'solicitud_arco' && e.entidad_id === (s1.json && s1.json.id))
  check('cada solicitud deja UNA entrada "crear" en auditoria_admin con solo el id, el tipo (nunca un valor) y sin nombre', aud1.length === 1 && aud1[0].accion === 'crear' && aud1[0].usuario_id === admin.id && aud1[0].entidad_nombre === null && j(Object.keys(aud1[0].detalles).sort()) === j(['solicitud', 'tipo']) && aud1[0].detalles.tipo === 'acceso', aud1)

  // ── prórroga única ──
  const sp = await mkSol('oposicion', 'empleado', e1)
  const corto = await adm('POST', `/api/arco/solicitudes/${sp.json && sp.json.id}/prorroga`, { motivo: 'corto' })
  check('prórroga con un motivo de menos de 10 caracteres → 400 y no cambia nada', corto.status === 400 && (await adm('GET', '/api/arco/solicitudes/' + sp.json.id)).json.prorrogada === false)
  const esperado60 = await hoyMasDias(60)
  const pr1 = await adm('POST', `/api/arco/solicitudes/${sp.json && sp.json.id}/prorroga`, { motivo: 'Se necesita revisar con el contador los datos laborales' })
  check('la prórroga suma 30 días corridos más (60 en total), queda con su motivo y la fecha', pr1.status === 200 && pr1.json.prorrogada === true && fechaTxt(pr1.json.vence_en) === esperado60 && /contador/.test(pr1.json.motivo_prorroga) && pr1.json.prorrogada_en, pr1)
  const pr2 = await adm('POST', `/api/arco/solicitudes/${sp.json && sp.json.id}/prorroga`, { motivo: 'Segundo intento de prórroga distinto' })
  check('una SEGUNDA prórroga → 409 PRORROGA_YA_USADA y el plazo no cambia', pr2.status === 409 && pr2.json.codigo === 'PRORROGA_YA_USADA' && fechaTxt((await adm('GET', '/api/arco/solicitudes/' + sp.json.id)).json.vence_en) === esperado60, pr2)
  const audP = await entradas((e) => e.entidad === 'solicitud_arco' && e.accion === 'prorrogar' && e.entidad_id === sp.json.id)
  check('la prórroga deja UNA entrada "prorrogar" sin el motivo escrito (solo id y tipo)', audP.length === 1 && j(Object.keys(audP[0].detalles).sort()) === j(['solicitud', 'tipo']) && !j(audP[0]).includes('contador'), audP)
  check('prórroga de una solicitud que no existe → 404', (await adm('POST', `/api/arco/solicitudes/${UUID_FALSO}/prorroga`, { motivo: 'Motivo suficientemente largo' })).status === 404)
  // carrera: 4 prórrogas simultáneas sobre la misma solicitud, 3 rondas → exactamente una gana
  const tiposCarrera = ['rectificacion', 'portabilidad', 'oposicion']
  const e2 = (await mkEmp()).json
  const carreraP = []
  for (let ronda = 0; ronda < 3; ronda++) {
    const s = await mkSol(tiposCarrera[ronda], 'empleado', e2 && e2.id)
    const rs = await Promise.all([0, 1, 2, 3].map((k) => adm('POST', `/api/arco/solicitudes/${s.json && s.json.id}/prorroga`, { motivo: `Motivo de la prórroga número ${k + 1} de la ronda ${ronda}` })))
    const oks = rs.filter((r) => r.status === 200).length
    carreraP.push({ oks, otros: rs.filter((r) => r.status !== 200).map((r) => r.status + ':' + (r.json && r.json.codigo)) })
  }
  check('CARRERA ×3: 4 prórrogas simultáneas → exactamente UNA se aplica y las demás dan 409 (nunca 60 + 30)', carreraP.every((c) => c.oks === 1 && c.otros.every((o) => o.startsWith('409:'))), carreraP)

  // ── exportar ──
  const ex = await adm('GET', `/api/arco/solicitudes/${s1.json && s1.json.id}/exportar`)
  const fx = ex.json && ex.json.datos && ex.json.datos.ficha
  check('exportar (acceso) un empleado: su ficha completa (documento, sueldo) y los gastos donde figura', ex.status === 200 && fx && fx.documento === '12.345.678-5' && Number(fx.sueldo_base) === 654321 && fx.email && ex.json.datos.registros && Array.isArray(ex.json.datos.registros.gastos) && ex.json.datos.registros.gastos.some((x) => x.id === (gSueldo.json && gSueldo.json.id)), ex.status)
  check('la exportación avisa lo que NO incluye: los nombres de cuentas_persona no son identificables y el PIN solo existe como hash', Array.isArray(ex.json && ex.json.aviso) && ex.json.aviso.some((a) => /cuentas_persona|cuentas por persona/i.test(a)))
  const audX = await entradas((e) => e.accion === 'exportar' && e.entidad === 'empleado' && e.entidad_id === e1)
  check('exportar deja UNA entrada "exportar" sobre el empleado con la solicitud, sin valores ni nombre', audX.length === 1 && audX[0].entidad_nombre === null && j(Object.keys(audX[0].detalles).sort()) === j(['solicitud', 'tipo']) && audX[0].detalles.solicitud === s1.json.id && !j(audX[0]).includes('12.345.678'), audX)
  const sPort = await mkSol('portabilidad', 'proveedor', p1)
  const exP = await adm('GET', `/api/arco/solicitudes/${sPort.json && sPort.json.id}/exportar`)
  check('portabilidad de un proveedor: solo la ficha que el titular entregó (sin los registros de compras y gastos)', exP.status === 200 && exP.json.datos.ficha && exP.json.datos.ficha.rut === '77.666.555-K' && exP.json.datos.registros === undefined, exP.status)
  const sAcP = await mkSol('acceso', 'proveedor', p1)
  const exAP = await adm('GET', `/api/arco/solicitudes/${sAcP.json && sAcP.json.id}/exportar`)
  check('acceso de un proveedor: la ficha y sus compras, gastos y activos', exAP.status === 200 && exAP.json.datos.registros && Array.isArray(exAP.json.datos.registros.compras) && Array.isArray(exAP.json.datos.registros.activos) && exAP.json.datos.registros.gastos.some((x) => x.id === (gProv.json && gProv.json.id)), exAP.status)
  const sAcU = await mkSol('acceso', 'usuario', uid)
  const exU = await adm('GET', `/api/arco/solicitudes/${sAcU.json && sAcU.json.id}/exportar`)
  const txtU = j(exU.json)
  check('acceso de un usuario: la ficha SIN el PIN ni su hash, su actividad por tabla y sus entradas de auditoría', exU.status === 200 && exU.json.datos.ficha && exU.json.datos.ficha.id === uid && exU.json.datos.ficha.email === u1.usuario.email && !('pin_hash' in exU.json.datos.ficha) && !/pin_hash|\$2[aby]\$/.test(txtU) && Array.isArray(exU.json.datos.registros.actividad) && exU.json.datos.registros.actividad.length > 5 && Array.isArray(exU.json.datos.registros.auditoria) && exU.json.datos.registros.auditoria.length >= 1, exU.status)
  const sRect = await mkSol('supresion', 'empleado', e2 && e2.id) // pendiente de supresión: no se exporta
  check('exportar una solicitud que no es de acceso ni de portabilidad → 409 TIPO_NO_EXPORTABLE', (await adm('GET', `/api/arco/solicitudes/${sRect.json && sRect.json.id}/exportar`)).status === 409, (await adm('GET', `/api/arco/solicitudes/${sRect.json && sRect.json.id}/exportar`)).json)
  check('exportar una solicitud que no existe → 404', (await adm('GET', `/api/arco/solicitudes/${UUID_FALSO}/exportar`)).status === 404)

  // ── rectificar a vacío (PATCH) ──
  const antes = (await adm('GET', '/api/empleados/' + e1)).json || {}
  const v = await adm('PATCH', '/api/empleados/' + e1, { telefono: null, email: '', notas: null, documento: null, fecha_ingreso: null })
  const despues = (await adm('GET', '/api/empleados/' + e1)).json || {}
  check('PATCH empleado con null o texto vacío VACÍA el campo (antes el valor anterior se quedaba) y no toca lo demás', v.status === 200 && despues.telefono === null && despues.email === null && despues.notas === null && despues.documento === null && despues.fecha_ingreso === null && despues.nombre === antes.nombre && Number(despues.sueldo_base) === 654321 && despues.cargo === 'Cargo prueba', { antes, despues })
  const audV = await entradas((e) => e.entidad === 'empleado' && e.entidad_id === e1 && e.accion === 'modificar')
  check('vaciar campos queda en la auditoría como "modificar" con los NOMBRES de los campos vaciados (nunca los valores)', audV.some((e) => mismoConjunto(e.detalles.campos, ['telefono', 'email', 'notas', 'documento', 'fecha_ingreso'])) && !j(audV).includes('+56 9 5555'), audV.map((e) => e.detalles))
  const v2 = await adm('PATCH', '/api/empleados/' + e1, { cargo: 'Cargo nuevo' })
  const d2 = (await adm('GET', '/api/empleados/' + e1)).json || {}
  check('un campo ausente NO se vacía: cambiar solo el cargo deja lo ya vacío vacío y el resto igual', v2.status === 200 && d2.cargo === 'Cargo nuevo' && d2.telefono === null && Number(d2.sueldo_base) === 654321)
  const v3 = await adm('PATCH', '/api/empleados/' + e1, { fecha_egreso: '2026-10-31' })
  const v4 = await adm('PATCH', '/api/empleados/' + e1, { fecha_egreso: null })
  check('la fecha de egreso se puede poner y volver a quitar', v3.status === 200 && fechaTxt(v3.json.fecha_egreso) === '2026-10-31' && v4.status === 200 && v4.json.fecha_egreso === null, [v3.status, v4.status])
  const vN = await adm('PATCH', '/api/empleados/' + e1, { nombre: null })
  const vS = await adm('PATCH', '/api/empleados/' + e1, { sueldo_base: null })
  check('lo obligatorio (nombre, sueldo) no se puede vaciar: 400', vN.status === 400 && vS.status === 400, [vN.status, vS.status])
  const pv = await adm('PATCH', '/api/proveedores/' + p1, { contacto: null, telefono: '', email: null, direccion: null, notas: null })
  const pd = (await adm('GET', '/api/proveedores/' + p1)).json || {}
  check('PATCH proveedor con null o vacío vacía contacto, teléfono, email, dirección y notas y deja el RUT', pv.status === 200 && pd.contacto === null && pd.telefono === null && pd.email === null && pd.direccion === null && pd.notas === null && pd.rut === '77.666.555-K', pd)
  const pvN = await adm('PATCH', '/api/proveedores/' + p1, { nombre: null })
  check('el nombre del proveedor no se puede vaciar: 400', pvN.status === 400)

  // ── RUT en las rutas ──
  const eMal = await adm('POST', '/api/empleados', { nombre: `${marca} rut malo`, sueldo_base: 1, documento: '12.345.678-4' })
  check('POST empleado con un RUT de dígito errado → 400 RUT_INVALIDO y no se crea', eMal.status === 400 && eMal.json && eMal.json.codigo === 'RUT_INVALIDO', eMal)
  const eFmt = await mkEmp({ documento: '77666555k' })
  check('un RUT válido escrito sin puntos se guarda con el formato 77.666.555-K', eFmt.status === 201 && eFmt.json.documento === '77.666.555-K', eFmt.json && eFmt.json.documento)
  const eOtro = await mkEmp({ documento: 'PAS-1234567', documento_otro: true })
  check('con documento_otro se acepta un pasaporte (no se valida) y la casilla no se guarda', eOtro.status === 201 && eOtro.json.documento === 'PAS-1234567' && !('documento_otro' in eOtro.json), eOtro.json)
  const eOtroSin = await adm('PATCH', '/api/empleados/' + (eOtro.json && eOtro.json.id), { documento: 'PAS-9999999' })
  check('cambiar a otro documento que no es RUT sin la casilla → 400 RUT_INVALIDO', eOtroSin.status === 400 && eOtroSin.json.codigo === 'RUT_INVALIDO', eOtroSin)
  const eViejo = await mkEmp({ documento: '99.888.777-6', documento_otro: true })
  const eReenvio = await adm('PATCH', '/api/empleados/' + (eViejo.json && eViejo.json.id), { documento: '99.888.777-6', nombre: eViejo.json && eViejo.json.nombre, cargo: 'Reenvío del formulario' })
  check('un dato antiguo con RUT inválido NO se bloquea cuando el formulario lo reenvía sin cambiarlo', eReenvio.status === 200 && eReenvio.json.documento === '99.888.777-6' && eReenvio.json.cargo === 'Reenvío del formulario', eReenvio)
  const eCambia = await adm('PATCH', '/api/empleados/' + (eViejo.json && eViejo.json.id), { documento: '99.888.777-7' })
  check('pero cambiarlo a otro valor inválido sí → 400', eCambia.status === 400 && eCambia.json.codigo === 'RUT_INVALIDO')
  const pMal = await adm('POST', '/api/proveedores', { nombre: `${marca} rut malo prov`, rut: '77.666.555-4' })
  const pOtro = await mkProv({ rut: 'EXT-998877', documento_otro: true })
  const pFmt = await adm('PATCH', '/api/proveedores/' + p1, { rut: '776665554' })
  check('proveedores: RUT con dígito errado → 400 RUT_INVALIDO, con documento_otro se acepta, y un cambio inválido en el PATCH → 400', pMal.status === 400 && pMal.json.codigo === 'RUT_INVALIDO' && pOtro.status === 201 && pOtro.json.rut === 'EXT-998877' && pFmt.status === 400 && pFmt.json.codigo === 'RUT_INVALIDO', [pMal.status, pOtro.status, pFmt.status])
  const pVacio = await adm('POST', '/api/proveedores', { nombre: `${marca} sin rut`, rut: '', contacto: '' })
  if (pVacio.json && pVacio.json.id) A.proveedores.push(pVacio.json.id)
  check('un RUT vacío (campo sin dato) es válido y queda null', pVacio.status === 201 && pVacio.json.rut === null && pVacio.json.contacto === null, pVacio.json)

  // ── resolver (acceso, portabilidad, rectificación, oposición) ──
  const sR1 = await mkSol('rectificacion', 'proveedor', p1)
  const rCorta = await adm('POST', `/api/arco/solicitudes/${sR1.json && sR1.json.id}/resolver`, { resultado: 'atendida', respuesta: 'ok' })
  check('resolver con una respuesta de menos de 10 caracteres o un resultado desconocido → 400', rCorta.status === 400 && (await adm('POST', `/api/arco/solicitudes/${sR1.json.id}/resolver`, { resultado: 'quizás', respuesta: 'Respuesta suficientemente larga' })).status === 400)
  const rOk = await adm('POST', `/api/arco/solicitudes/${sR1.json && sR1.json.id}/resolver`, { resultado: 'atendida', respuesta: 'Se corrigieron los datos de contacto del proveedor.' })
  check('resolver una rectificación → 200 resuelta, con quién y cuándo', rOk.status === 200 && rOk.json.estado === 'resuelta' && rOk.json.resuelta_por === admin.id && rOk.json.resuelta_en && /corrigieron/.test(rOk.json.resolucion), rOk)
  const audR = await entradas((e) => e.entidad === 'solicitud_arco' && e.accion === 'resolver' && e.entidad_id === sR1.json.id)
  check('la resolución deja UNA entrada "resolver" con id, tipo y resultado, sin el texto de la respuesta', audR.length === 1 && audR[0].detalles.resultado === 'atendida' && !j(audR[0]).includes('corrigieron') && j(Object.keys(audR[0].detalles).sort()) === j(['resultado', 'solicitud', 'tipo']), audR)
  const rDos = await adm('POST', `/api/arco/solicitudes/${sR1.json.id}/resolver`, { resultado: 'rechazada', respuesta: 'Segunda resolución imposible' })
  check('resolver dos veces → 409 SOLICITUD_YA_RESUELTA y no cambia la resolución', rDos.status === 409 && rDos.json.codigo === 'SOLICITUD_YA_RESUELTA' && /corrigieron/.test((await adm('GET', '/api/arco/solicitudes/' + sR1.json.id)).json.resolucion), rDos)
  const rPr = await adm('POST', `/api/arco/solicitudes/${sR1.json.id}/prorroga`, { motivo: 'Una solicitud resuelta no se prorroga' })
  check('prorrogar una solicitud ya resuelta → 409', rPr.status === 409 && rPr.json.codigo === 'SOLICITUD_YA_RESUELTA', rPr)
  const sS0 = await mkSol('supresion', 'proveedor', p1)
  const rSup = await adm('POST', `/api/arco/solicitudes/${sS0.json && sS0.json.id}/resolver`, { resultado: 'atendida', respuesta: 'No se puede dar por atendida sin anonimizar' })
  check('una supresión no se da por atendida con "resolver": hay que usar suprimir (409 USAR_SUPRIMIR); sí se puede rechazar con motivo', rSup.status === 409 && rSup.json.codigo === 'USAR_SUPRIMIR' && (await adm('POST', `/api/arco/solicitudes/${sS0.json.id}/resolver`, { resultado: 'rechazada', respuesta: 'El titular desistió de la solicitud.' })).status === 200, rSup)
  const sRech = await adm('POST', '/api/arco/solicitudes', { tipo: 'supresion', titular_tipo: 'proveedor', titular_id: p1, canal: 'correo' })
  if (sRech.json && sRech.json.id) A.solicitudes.push(sRech.json.id)
  check('rechazada deja de contar como pendiente: se puede ingresar otra solicitud igual (de supresión de ese proveedor)', sRech.status === 201, sRech)

  // ── suprimir: empleado ──
  const sSE = await mkSol('supresion', 'empleado', e1)
  const nombreE1 = e1r.json && e1r.json.nombre
  const sup = await adm('POST', `/api/arco/solicitudes/${sSE.json && sSE.json.id}/suprimir`, {})
  const resE = sup.json && sup.json.resultado
  check('suprimir un empleado → 200 con lo anonimizado y lo conservado (sueldo y fechas, con su fundamento) y el texto sugerido', sup.status === 200 && resE && resE.anonimizado.includes('nombre') && resE.anonimizado.includes('documento') && resE.conservado.includes('sueldo_y_fechas_laborales') && typeof sup.json.respuesta_sugerida === 'string' && /Neon|proveedor de base de datos/.test(sup.json.respuesta_sugerida), sup)
  const eAn = (await adm('GET', '/api/empleados/' + e1)).json || {}
  check('el empleado queda como "Empleado anonimizado", sin documento, teléfono, email ni notas, inactivo, y CONSERVA su sueldo, su cargo y sus fechas', eAn.nombre === 'Empleado anonimizado' && eAn.documento === null && eAn.telefono === null && eAn.email === null && eAn.notas === null && eAn.activo === false && Number(eAn.sueldo_base) === 654321 && eAn.cargo === 'Cargo nuevo', eAn)
  const gsl = (await adm('GET', '/api/gastos?limite=1000')).json
  const gFila = Array.isArray(gsl) ? gsl.find((x) => x.id === (gSueldo.json && gSueldo.json.id)) : null
  check('el gasto de sueldo conserva su monto y ya no trae el nombre en la descripción (queda "[persona anonimizada]")', gFila && Number(gFila.monto) === 100000 && !String(gFila.descripcion).includes(nombreE1) && /\[persona anonimizada\]/.test(gFila.descripcion) && gFila.notas === 'pagado por transferencia', gFila)
  const solE = (await adm('GET', '/api/arco/solicitudes/' + sSE.json.id)).json || {}
  check('la solicitud queda resuelta con el resultado guardado (solo nombres de campo) y quién la resolvió', solE.estado === 'resuelta' && solE.resuelta_por === admin.id && solE.resultado && solE.resultado.conservado.includes('sueldo_y_fechas_laborales') && typeof solE.respuesta_sugerida === 'string', solE)
  const audS = await entradas((e) => e.entidad_id === e1 && (e.accion === 'anonimizar' || e.entidad === 'empleado'))
  const anon = audS.filter((e) => e.accion === 'anonimizar')
  check('queda UNA entrada "anonimizar" sin valores ni nombre, y las entradas anteriores sobre ese empleado ya no llevan su nombre (entidad_nombre anonimizado)', anon.length === 1 && anon[0].entidad_nombre === null && anon[0].detalles.solicitud === sSE.json.id && Array.isArray(anon[0].detalles.campos) && !j(anon[0]).includes(nombreE1) && audS.filter((e) => e.accion !== 'anonimizar' && e.accion !== 'exportar').every((e) => e.entidad_nombre !== nombreE1), audS.map((e) => [e.accion, e.entidad_nombre]))
  const audRes = await entradas((e) => e.entidad === 'solicitud_arco' && e.accion === 'resolver' && e.entidad_id === sSE.json.id)
  check('y una entrada "resolver" de la solicitud con el resultado "anonimizada"', audRes.length === 1 && audRes[0].detalles.resultado === 'anonimizada', audRes)
  const sup2 = await adm('POST', `/api/arco/solicitudes/${sSE.json.id}/suprimir`, {})
  check('suprimir otra vez la misma solicitud → 409 SOLICITUD_YA_RESUELTA', sup2.status === 409 && sup2.json.codigo === 'SOLICITUD_YA_RESUELTA', sup2)
  const sSE2 = await adm('POST', '/api/arco/solicitudes', { tipo: 'supresion', titular_tipo: 'empleado', titular_id: e1, canal: 'correo' })
  if (sSE2.json && sSE2.json.id) A.solicitudes.push(sSE2.json.id)
  const sup3 = sSE2.json && sSE2.json.id ? await adm('POST', `/api/arco/solicitudes/${sSE2.json.id}/suprimir`, {}) : { status: 0 }
  check('una nueva supresión del mismo titular ya anonimizado → 409 TITULAR_YA_ANONIMIZADO', sup3.status === 409 && sup3.json.codigo === 'TITULAR_YA_ANONIMIZADO', sup3)
  const sNoSup = await mkSol('acceso', 'empleado', e2 && e2.id)
  const supNo = await adm('POST', `/api/arco/solicitudes/${sNoSup.json && sNoSup.json.id}/suprimir`, {})
  check('suprimir una solicitud que no es de supresión → 409 TIPO_NO_ES_SUPRESION y el empleado queda intacto', supNo.status === 409 && supNo.json.codigo === 'TIPO_NO_ES_SUPRESION' && (await adm('GET', '/api/empleados/' + (e2 && e2.id))).json.nombre !== 'Empleado anonimizado', supNo)
  check('suprimir una solicitud que no existe → 404 y con un cuerpo con campos de más → 400', (await adm('POST', `/api/arco/solicitudes/${UUID_FALSO}/suprimir`, {})).status === 404 && (await adm('POST', `/api/arco/solicitudes/${sNoSup.json.id}/suprimir`, { modo: 'borrar' })).status === 400)

  // ── suprimir: proveedor (persona natural) ──
  const sSP = sRech // la supresión pendiente de p1 que se ingresó arriba (otra igual daría 409 SOLICITUD_DUPLICADA)
  const sinConf = await adm('POST', `/api/arco/solicitudes/${sSP.json && sSP.json.id}/suprimir`, {})
  check('suprimir un proveedor exige confirmar que es persona natural (es_persona_natural: true); sin eso 400 y no cambia nada', sinConf.status === 400 && (await adm('GET', '/api/proveedores/' + p1)).json.nombre !== 'Proveedor anonimizado', sinConf)
  const supP = await adm('POST', `/api/arco/solicitudes/${sSP.json.id}/suprimir`, { es_persona_natural: true })
  const pAn = (await adm('GET', '/api/proveedores/' + p1)).json || {}
  check('proveedor anonimizado: sin contacto, teléfono, email, dirección ni notas; el RUT SE CONSERVA porque tiene un gasto de los últimos 6 años (respaldo tributario) y la respuesta lo dice', supP.status === 200 && pAn.nombre === 'Proveedor anonimizado' && pAn.contacto === null && pAn.email === null && pAn.direccion === null && pAn.notas === null && pAn.activo === false && pAn.rut === '77.666.555-K' && supP.json.resultado.conservado.includes('rut') && /6 años/.test(supP.json.respuesta_sugerida), { supP: supP.status, pAn, r: supP.json && supP.json.resultado })
  const pSin = (await mkProv()).json
  const sSP2 = await mkSol('supresion', 'proveedor', pSin && pSin.id)
  const supP2 = await adm('POST', `/api/arco/solicitudes/${sSP2.json && sSP2.json.id}/suprimir`, { es_persona_natural: true })
  const pAn2 = (await adm('GET', '/api/proveedores/' + (pSin && pSin.id))).json || {}
  check('un proveedor sin compras, gastos ni activos en 6 años no tiene nada que conservar: el RUT también queda vacío y la respuesta no lo cita', supP2.status === 200 && pAn2.rut === null && !supP2.json.resultado.conservado.includes('rut'), { s: supP2.status, rut: pAn2.rut })

  // ── suprimir: usuario temporal sin historial ──
  const sSU = await mkSol('supresion', 'usuario', uid)
  const supU = await adm('POST', `/api/arco/solicitudes/${sSU.json && sSU.json.id}/suprimir`, {})
  const lu = ((await adm('GET', '/api/usuarios')).json || []).find((x) => x.id === uid) || {}
  check('usuario anonimizado: nombre "Usuario anonimizado", correo anonimizado con su uuid COMPLETO, inactivo; el rol se conserva', supU.status === 200 && lu.nombre === 'Usuario anonimizado' && lu.email === `anonimizado-${uid}@anonimizado.invalid` && lu.activo === false && lu.rol === 'mesero', { s: supU.status, lu })
  const loginU = await api(null, 'POST', '/api/auth/login', { email: u1.usuario.email, pin: u1.usuario.pin })
  const loginA = await api(null, 'POST', '/api/auth/login', { email: lu.email, pin: u1.usuario.pin })
  check('el usuario anonimizado ya no puede ingresar (ni con su correo anterior ni con el anonimizado)', loginU.status !== 200 && loginA.status !== 200, [loginU.status, loginA.status])
  const bcrypt = require('module').createRequire(path.join(RAIZ, 'package.json'))('bcryptjs')
  const hash = (await db`SELECT pin_hash FROM soda_master.usuarios WHERE id = ${uid}::uuid`)[0].pin_hash
  let cmp = null
  try { cmp = await bcrypt.compare(u1.usuario.pin, hash) } catch { cmp = 'lanzó' }
  check('el hash del PIN queda inutilizable: bcrypt lo compara sin lanzar y no coincide con el PIN anterior', cmp === false)
  const audU = await entradas((e) => e.entidad === 'usuario' && e.entidad_id === uid)
  check('las entradas de auditoría de ese usuario ya no llevan su nombre y hay una "anonimizar" sin valores', audU.some((e) => e.accion === 'anonimizar' && e.detalles.solicitud === sSU.json.id) && audU.filter((e) => e.accion !== 'anonimizar').every((e) => e.entidad_nombre !== u1.usuario.nombre), audU.map((e) => [e.accion, e.entidad_nombre]))
  // guarda: uno mismo
  ;(A.extraTitulares = A.extraTitulares || []).push(admin.id) // la solicitud sobre el admin real se borra por su id al limpiar (el titular NO se toca)
  const sSelf = await mkSol('supresion', 'usuario', admin.id)
  const supSelf = await adm('POST', `/api/arco/solicitudes/${sSelf.json && sSelf.json.id}/suprimir`, {})
  const adminIgual = ((await adm('GET', '/api/usuarios')).json || []).find((x) => x.id === admin.id) || {}
  check('el admin no puede anonimizarse a sí mismo: 409 AUTO_MODIFICACION, no cambia nada y la solicitud sigue pendiente', supSelf.status === 409 && supSelf.json.codigo === 'AUTO_MODIFICACION' && adminIgual.nombre !== 'Usuario anonimizado' && adminIgual.activo === true && (await adm('GET', '/api/arco/solicitudes/' + sSelf.json.id)).json.estado === 'pendiente', supSelf)
  // carrera ×3: 4 supresiones simultáneas de la misma solicitud
  const carreraS = []
  for (let ronda = 0; ronda < 3; ronda++) {
    const e = (await mkEmp()).json
    const s = await mkSol('supresion', 'empleado', e && e.id)
    const rs = await Promise.all([0, 1, 2, 3].map(() => adm('POST', `/api/arco/solicitudes/${s.json && s.json.id}/suprimir`, {})))
    const ent = await entradas((x) => x.entidad_id === (e && e.id) && x.accion === 'anonimizar')
    carreraS.push({ oks: rs.filter((r) => r.status === 200).length, otros: rs.filter((r) => r.status !== 200).map((r) => r.status + ':' + (r.json && r.json.codigo)), entradas: ent.length })
  }
  check('CARRERA ×3: 4 supresiones simultáneas de la misma solicitud → exactamente UNA se aplica, las demás 409 y una sola entrada "anonimizar"', carreraS.every((c) => c.oks === 1 && c.entradas === 1 && c.otros.every((o) => o.startsWith('409:'))), carreraS)

  // limpieza: la hace `limpiar` de lib.cjs con los ids de ctx.arco (aquí solo se avisa si algo no quedó en la lista)
  check('los titulares y solicitudes de prueba quedaron registrados en ctx.arco para su limpieza por id', A.empleados.length >= 5 && A.proveedores.length >= 3 && A.solicitudes.length >= 15, { e: A.empleados.length, p: A.proveedores.length, s: A.solicitudes.length })

  // ───────────────────────── C. el mismo SQL en un esquema temporal ─────────────────────────
  try {
    await require('./arco-anonimizar.cjs').correr(ctx)
  } catch (e) {
    check('el bloque C (esquema temporal) no se interrumpió: ' + String(e.message).slice(0, 200), false)
  }
}
