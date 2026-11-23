/**
 * Sesión 23 (F2): utilidades del esquema base (`scripts/sql/esquema-base.sql`).
 *
 * - `sentenciasEsquemaBase(esquema)`: el texto del script con `soda_master` cambiado por el esquema pedido,
 *   separado en sentencias (respeta comillas, comentarios y bloques `$tag$ … $tag$`).
 * - `crearEsquemaBase(sql, esquema)`: revisa (solo lectura) que el esquema esté vacío y, si lo está, ejecuta todas
 *   las sentencias en UNA `sql.transaction` (o se crea todo o no se crea nada). El script trae además su propia guarda.
 * - `leerEstructura(sql, esquema)` y `compararEstructuras(a, b)`: la estructura de un esquema leída de pg_catalog
 *   (tablas, columnas, restricciones, índices, funciones y demás objetos), sin leer filas de datos.
 *
 * La usan el comando `pnpm db:esquema-base` (crear-esquema.cjs) y la prueba `scripts/pruebas/esquema.cjs`.
 */
const fs = require('fs')
const path = require('path')

const ARCHIVO_SQL = path.join(__dirname, 'esquema-base.sql')
const ESQUEMA_ORIGEN = 'soda_master'

/** Nombre de esquema seguro para interpolar en SQL (minúsculas, dígitos y guion bajo; máximo 63). */
function validarNombreEsquema(esquema) {
  if (typeof esquema !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(esquema)) {
    throw new Error(`Nombre de esquema no válido: ${JSON.stringify(esquema)} (solo minúsculas, dígitos y _; empieza con letra o _).`)
  }
  return esquema
}

/** Cambia el nombre del esquema en un texto SQL (como palabra completa). */
function cambiarEsquema(texto, esquema, origen = ESQUEMA_ORIGEN) {
  validarNombreEsquema(esquema)
  return texto.replace(new RegExp(`\\b${origen}\\b`, 'g'), esquema)
}

/**
 * Separa un texto SQL en sentencias por `;`, sin cortar dentro de comillas simples o dobles, comentarios
 * (`--` y `/* *\/`) ni bloques con dólares (`$$` o `$tag$`). Descarta los trozos que solo traen comentarios.
 */
function separarSentencias(texto) {
  const sentencias = []
  let actual = ''
  let i = 0
  const n = texto.length
  while (i < n) {
    const c = texto[i]
    const sig = texto[i + 1]
    if (c === '-' && sig === '-') {
      const fin = texto.indexOf('\n', i)
      const hasta = fin === -1 ? n : fin
      actual += texto.slice(i, hasta)
      i = hasta
      continue
    }
    if (c === '/' && sig === '*') {
      const fin = texto.indexOf('*/', i + 2)
      if (fin === -1) throw new Error('Comentario /* sin cerrar en el script SQL')
      actual += texto.slice(i, fin + 2)
      i = fin + 2
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n) {
        if (texto[j] === c) {
          if (texto[j + 1] === c) { j += 2; continue } // comilla escapada ('' o "")
          break
        }
        j++
      }
      if (j >= n) throw new Error(`Comillas ${c} sin cerrar en el script SQL`)
      actual += texto.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(texto.slice(i, i + 70))
      if (m) {
        const tag = m[0]
        const fin = texto.indexOf(tag, i + tag.length)
        if (fin === -1) throw new Error(`Bloque ${tag} sin cerrar en el script SQL`)
        actual += texto.slice(i, fin + tag.length)
        i = fin + tag.length
        continue
      }
    }
    if (c === ';') {
      sentencias.push(actual)
      actual = ''
      i++
      continue
    }
    actual += c
    i++
  }
  sentencias.push(actual)
  return sentencias
    .map((s) => s.trim())
    .filter((s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0)
}

/** Las sentencias del esquema base para el esquema pedido. */
function sentenciasEsquemaBase(esquema, archivo = ARCHIVO_SQL) {
  return separarSentencias(cambiarEsquema(fs.readFileSync(archivo, 'utf8'), esquema))
}

/** Cuántos objetos (tablas, índices, secuencias, vistas) tiene el esquema; 0 si no existe. Solo lectura. */
async function objetosEnEsquema(sql, esquema) {
  validarNombreEsquema(esquema)
  const r = await sql.query(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1`,
    [esquema],
  )
  return r[0].n
}

/**
 * Crea el esquema base en `esquema`. Antes revisa, sin escribir nada, que el esquema no tenga objetos: si tiene,
 * lanza un error y no envía ninguna sentencia. Devuelve cuántas sentencias se ejecutaron.
 */
async function crearEsquemaBase(sql, esquema, opciones = {}) {
  validarNombreEsquema(esquema)
  const existentes = await objetosEnEsquema(sql, esquema)
  if (existentes > 0) {
    const e = new Error(`El esquema ${esquema} ya tiene ${existentes} objeto(s): el esquema base solo se crea sobre un esquema vacío. No se ejecutó nada.`)
    e.codigo = 'ESQUEMA_NO_VACIO'
    throw e
  }
  const sentencias = sentenciasEsquemaBase(esquema, opciones.archivo)
  await sql.transaction(sentencias.map((s) => sql.query(s)))
  return sentencias.length
}

/** Estructura de un esquema leída de pg_catalog, con el nombre del esquema cambiado por `<ESQUEMA>`. Sin filas de datos. */
async function leerEstructura(sql, esquema) {
  validarNombreEsquema(esquema)
  const q = (texto) => sql.query(texto, [esquema])
  const [relaciones, columnas, restricciones, indices, funciones, secuencias, triggers, tipos, vistas] = await Promise.all([
    q(`SELECT c.relname AS nombre, c.relkind AS tipo, c.relrowsecurity AS rls FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind NOT IN ('i', 'I') ORDER BY 1`),
    q(`SELECT c.relname AS tabla, a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo,
              a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS defecto,
              a.attidentity AS identidad, a.attgenerated AS generada, co.collname AS collation
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       LEFT JOIN pg_collation co ON co.oid = a.attcollation AND a.attcollation <> 0
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY c.relname, a.attnum`),
    q(`SELECT c.relname AS tabla, k.conname AS nombre, k.contype AS tipo, pg_get_constraintdef(k.oid) AS def,
              k.convalidated AS validada, k.condeferrable AS diferible
       FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 ORDER BY 1, 2`),
    q(`SELECT tablename AS tabla, indexname AS nombre, indexdef AS def FROM pg_indexes WHERE schemaname = $1 ORDER BY 1, 2`),
    q(`SELECT p.proname AS nombre, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1 ORDER BY 1, 2`),
    q(`SELECT sequencename AS nombre FROM pg_sequences WHERE schemaname = $1 ORDER BY 1`),
    q(`SELECT c.relname AS tabla, t.tgname AS nombre FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND NOT t.tgisinternal ORDER BY 1, 2`),
    q(`SELECT t.typname AS nombre, t.typtype AS tipo FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typtype IN ('e', 'd', 'c', 'r', 'm')
         AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid) ORDER BY 1`),
    q(`SELECT viewname AS nombre FROM pg_views WHERE schemaname = $1 ORDER BY 1`),
  ])
  const neutro = (s) => (s == null ? s : cambiarEsquemaANeutro(String(s), esquema))
  return {
    relaciones: relaciones.map((r) => ({ ...r })),
    columnas: columnas.map((c) => ({ ...c, defecto: neutro(c.defecto) })),
    restricciones: restricciones.map((k) => ({ ...k, def: neutro(k.def) })),
    indices: indices.map((i) => ({ ...i, def: neutro(i.def) })),
    // El cuerpo de una función se compara sin espacios de más (la indentación no cambia lo que hace).
    funciones: funciones.map((f) => ({ ...f, def: neutro(f.def).replace(/\s+/g, ' ').trim() })),
    secuencias, triggers, tipos, vistas,
  }
}

function cambiarEsquemaANeutro(texto, esquema) {
  return texto.replace(new RegExp(`\\b${esquema}\\b`, 'g'), '<ESQUEMA>')
}

/**
 * Diferencias entre dos estructuras (`a` = la esperada, `b` = la obtenida), como frases legibles.
 * Lista vacía = iguales. Compara también el orden de las columnas de cada tabla.
 */
function compararEstructuras(a, b, nombres = { a: 'esperado', b: 'obtenido' }) {
  const dif = []
  const porClave = (lista, clave) => new Map(lista.map((x) => [clave(x), x]))
  const comparar = (seccion, clave, campos) => {
    const ma = porClave(a[seccion], clave)
    const mb = porClave(b[seccion], clave)
    for (const [k, x] of ma) {
      const y = mb.get(k)
      if (!y) { dif.push(`${seccion}: falta ${k} en ${nombres.b}`); continue }
      for (const f of campos) {
        if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) {
          dif.push(`${seccion}: ${k}.${f} distinto: ${nombres.a}=${JSON.stringify(x[f])} · ${nombres.b}=${JSON.stringify(y[f])}`)
        }
      }
    }
    for (const k of mb.keys()) if (!ma.has(k)) dif.push(`${seccion}: sobra ${k} en ${nombres.b}`)
  }
  comparar('relaciones', (r) => r.nombre, ['tipo', 'rls'])
  comparar('columnas', (c) => `${c.tabla}.${c.columna}`, ['tipo', 'not_null', 'defecto', 'identidad', 'generada', 'collation'])
  comparar('restricciones', (k) => `${k.tabla}.${k.nombre}`, ['tipo', 'def', 'validada', 'diferible'])
  comparar('indices', (i) => `${i.tabla}.${i.nombre}`, ['def'])
  comparar('funciones', (f) => `${f.nombre}(${f.args})`, ['def'])
  comparar('secuencias', (s) => s.nombre, [])
  comparar('triggers', (t) => `${t.tabla}.${t.nombre}`, [])
  comparar('tipos', (t) => t.nombre, ['tipo'])
  comparar('vistas', (v) => v.nombre, [])
  // Orden de las columnas (solo de las tablas que están en los dos lados, con las mismas columnas).
  const orden = (e) => {
    const m = new Map()
    for (const c of e.columnas) { if (!m.has(c.tabla)) m.set(c.tabla, []); m.get(c.tabla).push(c.columna) }
    return m
  }
  const oa = orden(a)
  const ob = orden(b)
  for (const [t, cols] of oa) {
    const otras = ob.get(t)
    if (otras && cols.length === otras.length && [...cols].sort().join() === [...otras].sort().join() && cols.join() !== otras.join()) {
      dif.push(`columnas: orden distinto en ${t}: ${nombres.a}=[${cols.join(', ')}] · ${nombres.b}=[${otras.join(', ')}]`)
    }
  }
  return dif
}

module.exports = {
  ARCHIVO_SQL,
  ESQUEMA_ORIGEN,
  validarNombreEsquema,
  cambiarEsquema,
  separarSentencias,
  sentenciasEsquemaBase,
  objetosEnEsquema,
  crearEsquemaBase,
  leerEstructura,
  compararEstructuras,
}
