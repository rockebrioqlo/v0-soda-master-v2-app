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
| `lib/app-context.tsx` | Estado global (reducer), llamadas a la API, sesión en `sessionStorage`, polling de órdenes/notificaciones |
| `lib/types.ts` | Tipos de dominio |
| `lib/helpers.ts`, `lib/fechas.ts`, `lib/server-time.ts`, `lib/use-server-clock.ts` | Formato CLP/fechas y reloj sincronizado con el servidor |
| `lib/print-ticket.ts` | Generación de tickets para imprimir desde el navegador |
| `lib/seed-*.ts`, `lib/initial-data.ts` | Datos de ejemplo y recetas base. `lib/seed-guard.ts` cierra las rutas `/api/seed*`: solo responden con `PERMITIR_SEED=true` y nunca en `VERCEL_ENV=production` |
| `scripts/*.cjs` | Scripts sueltos de inspección/migración contra Neon (usan `DATABASE_URL`) |

## Flujo de datos

1. Al cargar, `AppProvider` restaura la sesión desde `sessionStorage` (`soda_master_session`) y pide los datos iniciales a la API.
2. Cada acción (abrir mesa, agregar ítem, cobrar) llama a una ruta de `app/api/**`, que delega en `db.*` y devuelve JSON; el contexto actualiza el estado con `dispatch`.
3. La sincronización entre dispositivos es por **polling**: órdenes/KDS cada ~7 s y notificaciones cada ~10 s mientras la pestaña está visible.

## Autenticación

- Login con email + PIN (`/api/auth/login` → `db.verificarPIN`, bcrypt).
- La respuesta es el usuario; el cliente lo guarda en `sessionStorage`. **No hay cookie, token ni sesión en el servidor.**
- Los permisos por rol (`admin`, `cajero`, `mesero`, `cocina`, `bar` + `roles_adicionales` + `permisos_especiales` temporales) se aplican en la interfaz. Las rutas de API no verifican quién llama.

## Base de datos

- Neon Postgres, esquema `soda_master`, conexión por `DATABASE_URL` (inicialización perezosa en `getSql()`, para que el build no la requiera).
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
| Sesión en `sessionStorage` | Solución temporal de la etapa de pruebas; debe reemplazarse por sesión en servidor (ROADMAP sesión 3) |
