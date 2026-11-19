<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md — Sodamaster

Reglas para cualquier agente (Claude Code, v0, Cursor) que trabaje en este repositorio.

## Contexto comercial

- **Producto:** Sodamaster (Soda Master V2), POS para sodas y restaurantes: mesas, comandas, KDS, pagos, caja, inventario, recetas, finanzas y reportes.
- **Empresa:** Latencia Cero SpA.
- **Modelo:** B2B, venta a locales gastronómicos. Hoy es un sistema para **un solo local** (sin multi-tenant).
- **Planes:** por definir.
- **Repositorio:** `rockebrioqlo/v0-soda-master-v2-app`. Se trabaja **solo con la cuenta GitHub rockebrioqlo**. El repo local tiene un credential helper propio; no cambiar la cuenta activa global de `gh`. Para comandos `gh` usar `GH_TOKEN=$(gh auth token -u rockebrioqlo)`.
- El repo está enlazado a v0: v0 puede hacer commits directos a `main`, y cada merge a `main` despliega en Vercel. Revisar `git pull` antes de empezar.

## Localización chilena

- Moneda CLP sin decimales: `$12.990` (usar `formatCurrency` de `lib/helpers.ts`, `Intl.NumberFormat('es-CL')`).
- Fechas `dd-mm-aaaa`; horas en zona `America/Santiago` (ver `lib/fechas.ts` y `lib/server-time.ts`).
- RUT con validación Módulo 11 cuando se agregue (proveedores, empleados, facturación).
- Textos de la interfaz en español de Chile.

## Reglas técnicas del proyecto

- **Datos de prueba:** los datos en Neon, incluida la base de producción, son datos de prueba sin importancia; se vacían antes de entregar al cliente (ver P2 en `ROADMAP.md`). Aun así, no borrar ni sembrar datos sin que el usuario lo pida.
- **Base de datos:** Neon Postgres, esquema `soda_master`, SQL directo con `@neondatabase/serverless` (sin ORM). Todo acceso a datos pasa por `lib/db.ts`.
- El driver HTTP de Neon **no mantiene transacciones entre `await`**. Para operaciones de varios pasos usar `sql.transaction([...])` o un solo statement con CTE. Un `FOR UPDATE` o `pg_advisory_xact_lock` en un `await` separado no protege nada.
- Las migraciones incrementales viven en las funciones `ensure*Schema()` de `lib/db.ts` y deben ser idempotentes (`IF NOT EXISTS`, bloques `DO $$ ... EXCEPTION WHEN duplicate_object`).
- **Nunca confiar en datos del navegador** para montos, roles o `usuario_id`: calcularlos o verificarlos en el servidor.
- Validar el body de cada ruta de API (zod ya está instalado).
- Paquetes con `pnpm` (`packageManager: pnpm@10.0.0`); Vercel instala con `--frozen-lockfile`, así que el lockfile debe quedar actualizado.
- Componentes UI con shadcn/ui (`components/ui`) e iconos Lucide.

## Reglas de trabajo obligatorias

- **1 tarea atómica por sesión**, según `ROADMAP.md`.
- **Protocolo de Dos Fases:** diagnóstico en solo lectura; ejecución solo con confirmación del usuario.
- **No hacer `git push` automático.** Solo el usuario lo autoriza, después de probar en local.
- **Verificar la compilación** (`pnpm build`) antes de dar algo por terminado.
- **Probar con más de un caso** antes de declarar listo un módulo.
- **No borrar archivos** ni reescribir módulos completos sin avisar y sin confirmación.
- **Nunca salir de la carpeta del proyecto** (ni para leer, ni para escribir, ni para guardar memoria). Si hace falta, preguntar antes.
- **Nunca imprimir secretos** (`DATABASE_URL`, tokens) en el chat, en `CHAT_LOG.md` ni en commits.
- Al cerrar cada sesión: seguir la sección "Cierre de sesión".

## Ramas

- Durante el desarrollo se trabaja directo en `main`.
- No se crean ramas salvo que el usuario lo pida.
- Al terminar cada sesión, commit local.
- `git push` a `main` solo con autorización del usuario (cada push a `main` despliega en producción en Vercel).

## Cierre de sesión

Al terminar una sesión: deja el commit local, actualiza CHAT_LOG.md, ESTADO_MODULOS.md y ROADMAP.md, entrega el reporte final y detente. No generes el prompt de la sesión siguiente hasta que el usuario revise, depure y lo pida explícitamente.

## Documentos de control

| Archivo | Para qué |
|---|---|
| `ROADMAP.md` | Diagnóstico y sesiones planificadas |
| `ESTADO_MODULOS.md` | Estado real de cada módulo |
| `ARQUITECTURA.md` | Estructura, flujo de datos y decisiones técnicas |
| `CHAT_LOG.md` | Bitácora por sesión |
| `ESTADO_DESARROLLO.md` | Documento histórico heredado (lista detallada de bugs #1–#51) |
