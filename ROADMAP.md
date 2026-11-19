# ROADMAP — Sodamaster

Repositorio: `rockebrioqlo/v0-soda-master-v2-app` (se trabaja solo con la cuenta GitHub **rockebrioqlo**).
Diagnóstico inicial: 19-11-2026 (Fase 1, solo lectura, sin `pnpm install` ni `pnpm build`).

---

## 1. Resumen del diagnóstico

Sodamaster es un POS para sodas y restaurantes (mesas, comandas, KDS, pagos, caja, inventario, recetas, finanzas y reportes). A diferencia de la típica maqueta de v0, **el backend es real**: unas 60 rutas de API que leen y escriben en Neon Postgres. Estuvo en producción en Vercel con un cliente de prueba hasta junio de 2026.

El problema principal es la **seguridad**: la API no exige sesión y varias reglas de negocio (montos, permisos por rol) se aplican solo en la pantalla.

### Avance real

| Área | Avance |
|---|---|
| Visual / pantallas | ~90% |
| Backend funcional | ~70% |
| Seguridad | ~10% |
| Multi-tenant (SaaS) | 0% |

### Stack detectado

| Pieza | Detalle |
|---|---|
| Framework | Next.js 16.2.6, React 19, TypeScript 5.7 |
| Estilos | Tailwind v4, shadcn/ui (Radix), Lucide |
| Base de datos | Neon Postgres con SQL directo (`@neondatabase/serverless`), sin ORM, esquema `soda_master` |
| Login | Propio: email + PIN con bcrypt; sesión solo en `sessionStorage` del navegador (sin cookie ni token) |
| Paquetes / deploy | pnpm 10, Vercel, sincronizado con v0 |
| Sin uso | `dexie` y `dexie-react-hooks` (instalados, nadie los importa) |

### Variables de entorno

- Obligatoria: `DATABASE_URL` (Neon).
- Opcional: `DEBUG_NTP`.
- Falta `.env.local` en local. `.gitignore` ya excluye `.env*.local`. No hay secretos escritos en el código.

---

## 2. Hallazgos

### 🔴 Rompe o expone (antes de vender)

| # | Hallazgo | Dónde |
|---|---|---|
| R1 | Ninguna ruta de la API exige sesión; no hay middleware. Cualquiera con la URL puede crear pagos, cambiar configuración, editar usuarios/PINs o borrar datos. Algunas rutas confían en un `usuario_id` enviado por el navegador. | `app/api/**` |
| R2 | El monto de los pagos lo decide el navegador (bug A1). Un pago de `$1` por una mesa de `$50.000` se acepta. | `lib/db.ts` → `crearPago` |
| R3 | `PATCH /api/ordenes` acepta cambiar total o estado de una orden sin restricciones (bug A7). | `app/api/ordenes/route.ts` |
| R4 | Login sin límite de intentos; con PINs de 4 dígitos se prueban todos en segundos. | `app/api/auth/login/route.ts` |
| R5 | La pantalla de login muestra los PINs de prueba (1234, 2222, 3333, 4444, 5555). | `components/login-form.tsx` |
| R6 | `/api/seed`, `/api/seed-demo` y `/api/seed-recetas` son públicas en producción. | `app/api/seed*` |
| R7 | Operaciones de varios pasos sin transacción real: cobro, división de cuenta (A2), crear orden + ítems (#11). Un corte de red o dos cajeros a la vez pueden dejar órdenes a medias o pagos duplicados. | `lib/db.ts`, `components/pos-page.tsx` |

### 🟡 Frágil

| # | Hallazgo |
|---|---|
| F1 | Sin pruebas automáticas ni validación con zod en la API. |
| F2 | Las tablas base (usuarios, productos, mesas, órdenes, ítems, pagos) no se crean en ningún archivo del repo; solo hay migraciones incrementales en `lib/db.ts`. Una base nueva no se puede levantar desde cero. **Por verificar.** |
| F3 | El polling del KDS se reinicia en cada cambio y la pantalla parpadea (A4). |
| F4 | El primer pago muestra "Mesa desconocida" (A5). |
| F5 | Eliminar una persona de una cuenta dividida borra el historial de lo que ya pagó (A3). |
| F6 | Componentes muy grandes: `pos-page.tsx` (~2.700 líneas), `pagos-page.tsx` (~2.400), `lib/db.ts` (~4.800). |
| F7 | `ESTADO_DESARROLLO.md` registra 27 bugs pendientes de 51 (7 críticos). |

### ⚪ Estético

- Logs `[v0]` en el código (bug #24).
- README genérico de v0; `package.json` se llama `"my-project"`.
- Pantalla en blanco si falla la conexión a la BD, sin mensaje de error (bug #26).

### Fuera de alcance actual: SaaS multi-tenant

El sistema es para **un solo local**: sin tenants, sin planes, amarrado al esquema `soda_master`. Pasarlo a multi-tenant es un cambio de arquitectura grande.

---

## 3. Estado por módulo

| Módulo | Estado |
|---|---|
| POS, mesas, KDS, comandas | Completo en funciones, sin seguridad |
| Pagos, cuentas divididas, caja | A medias: A1, A2, A3 y A5 abiertos |
| Inventario, recetas, mermas, compras, proveedores | Completo, sin probar a fondo |
| Finanzas, márgenes, activos y depreciación | Completo, sin probar a fondo |
| Reportes y dashboard | Completo |
| Usuarios, roles y login | 🔴 Roto en seguridad (solo se valida en pantalla) |
| Menú público `/menu` | Completo |
| Tickets | Solo vista previa e impresión del navegador (no ESC/POS) |

---

## 4. Sesiones planificadas

Regla: **1 tarea atómica por sesión**, `pnpm build` antes de cerrar, sin `git push` sin autorización.

| Sesión | Tarea | Modelo sugerido | Resuelve |
|---|---|---|---|
| 1 ✅ | Archivos de control restantes (`AGENTS.md`, `README.md`, `ESTADO_MODULOS.md`, `ARQUITECTURA.md`, `CHAT_LOG.md`), `.env.example`, `pnpm install` + `pnpm build` local | Sonnet 5.5 | Base de trabajo |
| 2 | Login real: cookie firmada (o JWT) + middleware/proxy que exija sesión y rol en cada ruta; cerrar rutas de seed | Opus 5.5 | R1, R6 |
| 3 | Límite de intentos en login + ocultar PINs demo + forzar cambio de PIN en primer ingreso | Sonnet 5.5 | R4, R5 |
| 4 | Servidor calcula el monto de los pagos y devuelve la mesa en el pago creado | Sonnet 5.5 | R2, F4 |
| 5 | Allowlist de campos en `PATCH /api/ordenes` según rol | Sonnet 5.5 | R3 |
| 6 | Transacciones reales: cobro, división de cuenta y endpoint único orden + ítems | Sonnet 5.5 | R7, A2, #11 |
| 7 | Script SQL que crea las tablas base desde cero (verificado contra Neon) | Sonnet 5.5 | F2 |
| 8 | Bugs funcionales: A3, A4, B3–B6 de `ESTADO_DESARROLLO.md` | Sonnet 5.5 | F3, F5 |
| 9 | Validación con zod en rutas de API + primeras pruebas automáticas | Sonnet 5.5 | F1 |
| 10 | Limpieza: logs `[v0]`, `dexie` sin uso, nombre del paquete, pantalla de error de BD | Haiku 5.5 | ⚪ |
| 11 | Dividir componentes gigantes (`pos-page`, `pagos-page`, `lib/db.ts`) | Sonnet 5.5 | F6 |
| 12 | Diseño multi-tenant (solo si se decide vender como SaaS) | Opus 5.5 | SaaS |

---

## 5. Pendientes del usuario

- ~~Entregar `DATABASE_URL` de Neon~~ ✅ (sesión 1, `.env.local` creado).
- Borrar `variables.txt` y, recomendado, rotar la contraseña de Neon.
- **Crear una rama de Neon para desarrollo:** hoy el entorno local usa la misma base que producción.
- Confirmar si el cliente de prueba sigue usando la app en producción (afecta cuándo se cierran las rutas abiertas).
- Decidir si el objetivo es un POS para un local o un SaaS multi-tenant.
