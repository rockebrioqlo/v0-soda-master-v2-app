# ESTADO_MODULOS — Sodamaster

Última actualización: 19-11-2026 (sesión 1).

Estados: **completo** · **a medias** · **roto** · **sin probar**.
"Qué se probó" indica lo verificado por nosotros en esta etapa; lo heredado de `ESTADO_DESARROLLO.md` se marca como "según doc heredado".

| Módulo | Archivos principales | Estado | Qué falta | Qué se probó realmente |
|---|---|---|---|---|
| Login y sesión | `components/login-form.tsx`, `app/api/auth/*`, `lib/app-context.tsx` | 🔴 roto (seguridad) | Sesión en servidor (cookie firmada/JWT) y middleware (ROADMAP sesión 3); bloqueo real por intentos fallidos, que hoy no existe ni en pantalla (sesión 4). Los accesos rápidos con PINs demo se mantienen en desarrollo y se controlan por variable de entorno antes de producción final (sesión P1) | Revisión de código: el login devuelve el usuario y la sesión vive solo en `sessionStorage` |
| Roles y permisos | `lib/app-context.tsx`, `components/bottom-nav.tsx`, `app/api/permisos-*` | 🔴 roto (seguridad) | Validar rol en cada ruta de API | Revisión de código: el filtro por rol es solo de pantalla |
| Usuarios | `components/usuarios-page.tsx`, `app/api/usuarios/*` | a medias | Proteger edición de usuarios y PINs | Sin probar |
| Dashboard | `components/dashboard-page.tsx` | completo | — | Sin probar |
| Mesas | `components/mesas-page.tsx`, `app/api/mesas/*` | completo | Nombre personalizado de mesa (#23) | Sin probar |
| POS / comandas | `components/pos-page.tsx`, `app/api/ordenes/*`, `app/api/items-orden` | a medias | Orden + ítems en una transacción (#11); allowlist en PATCH de órdenes (A7) | Sin probar |
| KDS (cocina/bar) | `components/kds-page.tsx`, `components/kds-historial-dialog.tsx`, `app/api/kds/*` | a medias | Polling que se reinicia (A4); B5–B6 | Sin probar |
| Pagos y cuentas divididas | `components/pagos-page.tsx`, `app/api/pagos`, `app/api/cuentas-persona/*` | a medias | Monto calculado en servidor (A1), atomicidad (A2), historial al eliminar persona (A3), "Mesa desconocida" (A5) | Sin probar |
| Caja chica | `components/caja-page.tsx`, `app/api/caja/*` | completo | — | Sin probar |
| Pérdidas ("perro muerto") | `app/api/perdidas/*` | a medias | Validar monto en `resolverPerdida` (B3); lock en `registrarPerdida` (B2) | Sin probar |
| Descuentos | `app/api/descuentos`, `app/api/permisos-descuento` | a medias | Prorrateo en pagos parciales encadenados (B4) | Sin probar |
| Inventario | `components/inventario-page.tsx`, `app/api/inventario/*` | completo | — | Sin probar |
| Recetas e ingredientes | `components/receta-editor-dialog.tsx`, `app/api/recetas`, `app/api/ingredientes/*` | completo | — | Sin probar |
| Mermas | `components/mermas-page.tsx`, `app/api/mermas/*` | completo | — | Sin probar |
| Proveedores y compras | `components/proveedores-tab.tsx`, `components/compras-tab.tsx`, `app/api/proveedores/*`, `app/api/compras/*` | completo | Validación de RUT | Sin probar |
| Finanzas (activos, empleados, gastos, márgenes) | `components/finanzas-page.tsx` y tabs, `app/api/activos/*`, `app/api/empleados/*`, `app/api/gastos/*`, `app/api/margenes`, `app/api/depreciacion` | completo | — | Sin probar |
| Reportes | `components/reportes-page.tsx`, `app/api/reportes/*` | completo | Paginación en listados largos | Sin probar |
| Configuración | `components/configuracion-page.tsx`, `app/api/configuracion` | completo | Proteger con rol admin | Sin probar |
| Notificaciones | `components/notificaciones-toast.tsx`, `app/api/notificaciones/*` | completo | — | Sin probar (polling cada 10 s, según doc heredado) |
| Menú público `/menu` | `app/menu/page.tsx` | completo | — | Sin probar |
| Tickets | `lib/print-ticket.ts`, `components/print-preview-dialog.tsx` | a medias | Impresión real ESC/POS | Sin probar |
| Seeds | `app/api/seed*`, `lib/seed-*.ts`, `lib/seed-guard.ts` | ✅ cerrado (sesión 2, pendiente de merge a `main`) | Primer admin sin PINs demo (P3). La ruta con `PERMITIR_SEED=true` no se ejecutó, para no sembrar la base real | Local (`next start`): `DELETE /api/seed` → 405; `POST /api/seed`, `/seed-demo`, `/seed-recetas` → 403; la app carga con los datos actuales (6 usuarios, 33 productos, 20 mesas) sin pedir `/api/seed`. Candado probado en 7 combinaciones de `PERMITIR_SEED`/`VERCEL_ENV` |
| Esquema base de BD | `lib/db.ts` (`ensure*Schema`) | a medias | Script que cree las tablas base desde cero | Por verificar contra Neon |
| Compilación | — | completo | — | `pnpm build` local sin errores; `pnpm dev` carga el login y la API responde con datos de Neon (sesión 1) |
