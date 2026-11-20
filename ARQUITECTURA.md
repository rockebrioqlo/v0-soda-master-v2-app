# ARQUITECTURA — Sodamaster

## Visión general

Aplicación Next.js 16 (App Router) que funciona como **SPA de una sola ruta**: `app/page.tsx` muestra el login o el layout principal, y cambia de "página" con un estado (`currentPage`) del contexto global, no con rutas de Next. El backend son rutas de API en `app/api/**` que hablan con Neon Postgres a través de `lib/db.ts`.

```
Navegador (tablet/PC del local)
 └─ app/page.tsx  ──  AppProvider (lib/app-context.tsx)
      │                 estado global + fetch a /api/* + polling
      ▼
 app/api/**/route.ts   (Route Handlers, sin middleware)
      │
      ▼
 lib/db.ts  ──  @neondatabase/serverless (HTTP)  ──►  Neon Postgres, esquema soda_master
```

## Estructura de carpetas

| Carpeta | Contenido |
|---|---|
| `app/page.tsx` | Entrada de la SPA: login o `MainLayout` + página activa |
| `app/menu/` | Menú público (`/menu`), sin login |
| `app/api/` | ~60 Route Handlers agrupados por dominio (ordenes, pagos, caja, inventario, recetas, finanzas, reportes, usuarios, seed…) |
| `components/*-page.tsx` | Una "página" por módulo (pos, kds, mesas, pagos, caja, inventario, finanzas, mermas, reportes, usuarios, configuración) |
| `components/*-tab.tsx` | Pestañas de Inventario y Finanzas (proveedores, compras, márgenes, activos, empleados, gastos) |
| `components/ui/` | shadcn/ui |
| `lib/db.ts` | Única capa de datos: objeto `db` con todas las consultas + migraciones `ensure*Schema()` |
| `lib/app-context.tsx` | Estado global (reducer), llamadas a la API, polling de órdenes/notificaciones; restaura la sesión con `GET /api/auth/sesion` |
| `proxy.ts` | Proxy de Next 16 (antes middleware): exige sesión y rol en `/api/**` |
| `lib/sesion.ts`, `lib/permisos-api.ts` | Sesión en servidor (cookie firmada + tabla `sesiones`) y tabla de permisos por ruta |
| `lib/intentos-login.ts`, `lib/autorizacion-admin.ts` | Límite de PIN fallidos y token firmado de autorización de admin |
| `lib/types.ts` | Tipos de dominio |
| `lib/helpers.ts`, `lib/fechas.ts`, `lib/server-time.ts`, `lib/use-server-clock.ts` | Formato CLP/fechas y reloj sincronizado con el servidor |
| `lib/print-ticket.ts` | Generación de tickets para imprimir desde el navegador |
| `lib/seed-*.ts`, `lib/initial-data.ts` | Datos de ejemplo y recetas base. `lib/seed-guard.ts` cierra las rutas `/api/seed*`: solo responden con `PERMITIR_SEED=true` y nunca en `VERCEL_ENV=production` |
| `scripts/*.cjs` | Scripts sueltos de inspección/migración contra Neon (usan `DATABASE_URL`) |

## Flujo de datos

1. Al cargar, `AppProvider` pregunta `GET /api/auth/sesion` (la cookie httpOnly viaja sola). Si hay sesión, pide los datos iniciales a la API; si no, muestra el login. `sessionStorage` solo recuerda la página abierta.
2. Cada acción (abrir mesa, agregar ítem, cobrar) llama a una ruta de `app/api/**`, que delega en `db.*` y devuelve JSON; el contexto actualiza el estado con `dispatch`.
3. La sincronización entre dispositivos es por **polling**: órdenes/KDS cada ~7 s y notificaciones cada ~10 s mientras la pestaña está visible.

## Autenticación

Desde la sesión 3 la sesión vive en el servidor:

- **Login** (`POST /api/auth/login`): email + PIN (`db.verificarPIN`, bcrypt; rechaza usuarios con `activo = false`). Crea una fila en `soda_master.sesiones` con el hash SHA-256 de un token aleatorio y deja la cookie `sm_sesion` = `<token>.<HMAC>` (`HttpOnly`, `SameSite=Lax`, `Secure` en producción, 12 h). El HMAC usa `SESION_SECRETO`; sin esa variable el login falla cerrado.
- **Una sola sesión por usuario** (anexo sesión 4): `db.crearSesion` revoca las sesiones anteriores del usuario y crea la nueva en un solo statement. Las cuentas son nominales (mesero X, cajero con nombre) para saber quién vendió y entregó; si le roban una tablet al admin, ingresa desde otro equipo y la anterior queda cerrada (la app vuelve al login en menos de 1 min).
- **Proxy** (`proxy.ts`, matcher `/api/:path*`, corre en Node): ruta pública → pasa; si no, valida firma + sesión vigente en la base + usuario activo (401) y el rol contra `lib/permisos-api.ts` (403). Lo que no está en la tabla queda solo admin.
- **Rutas**: las que necesitan saber quién actúa (caja, compras, gastos, descuentos, mermas, ajustes de stock, permisos, pérdidas, notificaciones, abrir orden, desbloquear) llaman `requireSesion()`, que vuelve a validar por su cuenta (la guía de Next 16 pide no dejar toda la autorización en el proxy) y toman el usuario de ahí, nunca del body.
- **Roles efectivos** = rol principal + `roles_adicionales` (`administrador` = `admin`). El permiso temporal `apertura_mesa` sigue en `db.crearOrden`, con el usuario de la sesión.
- **Autorización de admin en otro dispositivo**: `POST /api/auth/verificar-pin` (exige sesión) entrega, si el PIN es de un admin, un token firmado de 5 min. Descuentos sobre el límite y cortesías lo exigen; un `autorizado_por` con un id ya no sirve.
- **Intentos fallidos** (`lib/intentos-login.ts`, tabla `intentos_login`): por usuario 3 fallos → 5 min, duplicándose hasta 1 h; por IP 20 fallos en 15 min → 15 min. La IP sale de `x-forwarded-for` (en Vercel la pone la plataforma; si se aloja en otro lado detrás de un proxy propio, hay que asegurarse de que ese header no lo controle el cliente). Un admin desbloquea con `POST /api/auth/desbloquear`.
- **Límite de peticiones** (sesión 4, `lib/limite-api.ts`): el proxy verifica primero la firma HMAC de la cookie en memoria (sin cookie o firma mala → 401, sin tocar la base). Con firma válida lanza en paralelo la validación de sesión y el contador `s:<hash del token>` de `limite_peticiones` (ventana fija de 60 s, un `INSERT … ON CONFLICT` atómico, tope 240/min); sobre el tope → 429 con `Retry-After`. Si Neon falla al contar, deja pasar (fail-open). El límite por IP y de anónimos va en Vercel WAF (README). Ante un 429 de `/api/**` (no de `/api/auth/`), la interfaz avisa una vez y pausa los sondeos (`lib/pausa-limite.ts`); no reintenta escrituras.
- **Logout** (`POST /api/auth/logout`) revoca la fila y borra la cookie. Desactivar un usuario revoca todas sus sesiones.
- **Públicas**: `auth/login`, `auth/logout`, `auth/sesion`, `auth/accesos-rapidos` (nombre y email; se apaga con `ACCESOS_RAPIDOS=false`), `menu-publico` (campos mínimos del menú QR), `hora` y `seed` (cerrada por `PERMITIR_SEED`).
- En el navegador, cualquier 401 de `/api/**` vuelve al login (envoltorio de `fetch` en `AppProvider`).

## Base de datos

- Neon Postgres, esquema `soda_master`, conexión por `DATABASE_URL` (inicialización perezosa en `getSql()`, para que el build no la requiera).
### Cobro seguro (sesión 5)

- `lib/cobro.ts` (función pura) calcula descuento, IVA, propina, total y cuotas; la usan el servidor (`db.crearPago`) y `components/pagos-page.tsx`, así la pantalla y el servidor dan la misma cifra. Los precios incluyen IVA: se desglosa y no se suma (clave `precios_incluyen_iva` de `configuracion`, por defecto `true`).
- `POST /api/pagos` (`app/api/pagos/route.ts`): zod `.strict()`; el cobrador sale de `requireSesion(['admin','cajero'])`. El navegador solo envía qué se cobra, el método, la propina, el efectivo recibido y `monto_esperado`; si este no coincide con el cálculo del servidor responde 409 `MONTO_DISTINTO`.
- `db.crearPago` lee la orden (ítems, descuento, configuración) y ejecuta todo en una `sql.transaction([...])`: bloqueo de la orden (`FOR UPDATE`), verificación de que no cambió desde la lectura, reclamo de ítems (`UPDATE … WHERE pagado = FALSE`), corte de líneas (1 de 2), pago, cierre de la orden y movimientos de caja. Las verificaciones usan la función SQL `soda_master.assert_cobro(cond, codigo)` (se crea en `ensurePagoSchema()`), que aborta toda la transacción con SQLSTATE `SM409`; la ruta traduce el código a su estado HTTP (`ERRORES_COBRO` en `lib/cobro.ts`).
- Caja: el efectivo recibido entra como `venta_efectivo` (monto + propina + vuelto) y el vuelto sale como `vuelto`; efectivo sin caja abierta → 409 `CAJA_CERRADA`, tarjeta no mueve caja.
- `PATCH`/`DELETE /api/items-orden`: un ítem pagado no se modifica (409) y solo admin cambia `precio_unitario` (403).

- Tablas principales: usuarios, mesas, categorias, productos, modificadores, ordenes, items_orden, pagos, inventario, movimientos_inventario, configuracion, descuentos, mermas, notificaciones, cuentas_persona, perdidas_comanda, permisos_especiales, ingredientes, recetas, receta_ingredientes, proveedores, compras, compra_items, activos, empleados, gastos, cajas, movimientos_caja, auditoria_admin.
- Migraciones incrementales idempotentes en `lib/db.ts` (`ensure*Schema`). Las tablas base no tienen script de creación en el repo.
- Concurrencia: algunos `pg_advisory_xact_lock` dentro de CTE de un solo statement (apertura de mesa). Otros flujos de varios pasos no son atómicos (ver `ROADMAP.md`, R7).

## Storage

No hay almacenamiento de archivos ni imágenes subidas. `public/` contiene solo recursos estáticos.

## Deploy

Vercel, enlazado a v0 (`vercel.json`: `pnpm install --frozen-lockfile`, `next build`). Cada merge a `main` despliega. `next.config.mjs` desactiva la optimización de imágenes.

## Decisiones técnicas y motivo

| Decisión | Motivo |
|---|---|
| SQL directo sin ORM | Heredado de v0; el driver HTTP de Neon funciona bien en serverless |
| SPA de una ruta con estado global | Heredado; simple para tablets del local, pero sin URLs por módulo |
| Polling en vez de WebSockets | Vercel serverless no mantiene conexiones; polling ligero fue suficiente (bug #28 del doc heredado) |
| Migraciones dentro de `lib/db.ts` | Permitió evolucionar el esquema desde v0 sin herramienta de migraciones; a futuro conviene un script versionado |
| Sesión en la base + cookie firmada (no JWT) | Un JWT no se puede invalidar al hacer logout o desactivar a alguien, y igual habría que ir a la base para saber si el usuario sigue activo. Firma con `node:crypto`, sin dependencias nuevas (sesión 3) |
