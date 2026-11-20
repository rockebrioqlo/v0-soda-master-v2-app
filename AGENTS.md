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

## Política de pruebas

Las pruebas de integración viven en `scripts/pruebas/` y hablan con un servidor ya levantado (`pnpm build` y `pnpm start -p 3011`; puerto o URL con `PRUEBAS_PUERTO` o `PRUEBAS_URL`) usando login real y la base de Neon. Los PINs se resuelven en memoria en cada corrida (nunca en archivos), todo lo que crean queda marcado "prueba <comando> <fecha>" y al terminar se limpian mesas, productos, ingredientes y sesiones (si una corrida abortada dejó órdenes en las mesas de prueba, `PRUEBAS_LIMPIAR_MESAS=1`).

- `pnpm prueba:humo`: login real de los roles, comanda, cobro en efectivo con vuelto, tarjeta, doble cobro 409 y cierre de caja con diferencia 0 (menos de 1 minuto).
- `pnpm prueba:completa`: todas las baterías de las sesiones 5 a 8 (permisos, órdenes, stock, cobro, asignaciones y pérdidas), con carreras de máximo 3 rondas (unos 6 minutos). `--modulo=stock` (o `cobro`, `ordenes`, `permisos`, `asignaciones`, `sondeo`, también varios separados por coma) corre solo esa parte. El módulo `stock` incluye al final `unidades` (insumos con unidad de compra y de consumo, rendimiento, compras y ajuste de stock; sesión 11); `--modulo=unidades` lo corre solo (unos 2 minutos). El stock de los insumos solo se repone en las pruebas con `POST /api/ingredientes/[id]/ajuste` (deja movimiento), nunca por SQL ni por `PATCH`.

**Cada sesión:**
- Verifica solo lo que cambió: el arreglo, 1 carrera de 3 rondas si aplica y los casos 403, 400 y 409 que correspondan.
- Reproduce el bug viejo solo si no queda claro leyendo el código.
- Agrega los casos de la sesión a `scripts/pruebas/` (en el módulo que corresponda, o uno nuevo registrado en `completa.cjs`).
- Corre `pnpm prueba:humo` al final.
- Navegador solo si la sesión tocó pantallas, y solo el flujo principal.
- Si la sesión toca cobro, caja o stock, corre además `pnpm prueba:completa --modulo=<ese módulo>`.

**Regresión completa** (`pnpm prueba:completa` más el navegador completo: POS, KDS, Pagos con cuentas divididas, Caja): cada 5 sesiones o al cerrar cada bloque del ROADMAP, lo que llegue primero. La primera, al cerrar la sesión 10.

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
