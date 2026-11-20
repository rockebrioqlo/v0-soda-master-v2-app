# Sodamaster (Soda Master V2)

POS para sodas y restaurantes, de Latencia Cero SpA. Une en una sola aplicación la atención de mesas, las comandas a cocina y bar, el cobro (con cuentas divididas y pagos parciales), la caja chica, el inventario con recetas y costos, las finanzas del local y los reportes de venta.

> Estado: funcional en un local de prueba; **no listo para producción comercial** (la API no exige sesión). Ver [ROADMAP.md](ROADMAP.md).

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 · shadcn/ui · Lucide · Recharts
- Neon Postgres (`@neondatabase/serverless`, SQL directo, esquema `soda_master`)
- Login propio: email + PIN con bcrypt
- pnpm 10.34.9 · Node 24 (producción) · Vercel

## Mapa de rutas

| Tipo | Ruta | Descripción |
|---|---|---|
| Pública | `/menu` | Menú del local para clientes |
| Panel (con login) | `/` | SPA: login con PIN y, según el rol, Inicio, Mesas, POS, Cocina (KDS), Inventario, Finanzas, Usuarios, Pagos, Caja, Mermas, Reportes y Configuración |
| API | `/api/*` | ~60 endpoints por dominio (ordenes, pagos, caja, inventario, recetas, finanzas, reportes, usuarios…) |

No hay portal de clientes ni panel superadmin (el sistema es para un solo local).

### Permisos por rol

| Módulo | Admin | Cajero | Mesero | Cocina | Bar |
|---|---|---|---|---|---|
| Dashboard | ✓ | ✓ | | | |
| Mesas / POS | ✓ | ✓ | ✓ | | |
| KDS | ✓ | | | ✓ | ✓ |
| Pagos / Caja / Reportes | ✓ | ✓ | | | |
| Inventario / Usuarios / Configuración | ✓ | | | | |

Los `roles_adicionales` de cada usuario y los permisos especiales temporales amplían este acceso.

## Instalación local

Requisitos: Node.js 24 (LTS; en local funciona también Node 26, con un aviso de "Unsupported engine") y pnpm ≥ 10.16 (el `packageManager` fija 10.34.9; las actualizaciones de dependencias se hacen siempre en local por el `minimumReleaseAge` de `pnpm-workspace.yaml`).

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Completa `DATABASE_URL` en `.env.local` con la URL de Neon y luego:

```bash
pnpm dev
```

Abre http://localhost:3000.

### Base de datos vacía

La app ya no siembra datos sola al cargar. Las rutas de seed están cerradas por defecto (responden 403) y en Vercel producción están bloqueadas siempre. Para inicializar una base de **desarrollo** vacía:

1. Agrega `PERMITIR_SEED=true` a `.env.local` y reinicia `pnpm dev`.
2. Llama una vez `POST /api/seed` (usuarios, mesas, productos y recetas de ejemplo). Opcional: `POST /api/seed-demo` (proveedores, compras, activos y gastos) o `POST /api/seed-recetas` (insumos y recetas base).
3. Quita `PERMITIR_SEED` de `.env.local` y reinicia.

`POST /api/seed` no hace nada si ya hay productos. Ya no existe una ruta para vaciar la base.

## Credenciales de prueba

Sembradas por `/api/seed` en una base de desarrollo vacía (solo para desarrollo; deben cambiarse antes de producción). La base Neon actual tiene otros usuarios con otros PINs.

El login necesita `SESION_SECRETO` en `.env.local` (ver `.env.example`). Tras 3 PIN errados el usuario queda bloqueado 5 minutos; un admin lo desbloquea con `POST /api/auth/desbloquear`.

| Usuario | Email | PIN | Rol |
|---|---|---|---|
| Administrador | admin@soda.cl | 1234 | admin |
| Carlos García | cajero@soda.cl | 2222 | cajero |
| María López | mesero@soda.cl | 3333 | mesero |
| Pedro Martínez | cocina@soda.cl | 4444 | cocina |
| Laura Rodríguez | bar@soda.cl | 5555 | bar |

### Rate limiting (sesión 4)

La API tiene dos capas:

1. **Por sesión, en la aplicación** (`proxy.ts` + `lib/limite-api.ts`): 240 peticiones por minuto por sesión, contadas en Neon (tabla `limite_peticiones`, un solo statement atómico, en paralelo con la validación de sesión). Se responde `429` con `Retry-After`. Si la base falla al contar, la petición pasa (fail-open). Las peticiones sin cookie o con la firma HMAC inválida **no se cuentan en Neon**: el proxy responde 401 en memoria.
2. **Por IP y anónimas, en Vercel WAF (a configurar a mano en el dashboard):** Vercel → proyecto → Firewall → Custom Rules → Rate limiting. Reglas recomendadas (todas las tablets del local salen por la misma IP, por eso los topes por IP son holgados):

| Regla WAF | Rutas | Clave | Límite (ventana fija 60 s) | Acción |
|---|---|---|---|---|
| IP, sin sesión o cookie inválida | `/api/*` sin la cookie `sm_sesion` (salvo las públicas de abajo) | IP | **60/min** | Denegar (429), 60 s |
| IP, con sesión | `/api/*` | IP | **1.500/min** | Denegar (429), 60 s |
| IP, rutas públicas | `/api/menu-publico`, `/api/hora` | IP | **300/min** | Denegar (429), 60 s |
| IP, login | `/api/auth/login`, `/api/auth/verificar-pin` | IP | **120/min** | Denegar (429), 60 s |

Una regla por fila, con las más específicas primero. Conviene probarlas antes en modo "Log" y pasar a "Deny" cuando se confirme que no cortan el uso normal (10 tablets ≈ 150–250 peticiones por minuto).

## Documentación

- [AGENTS.md](AGENTS.md): reglas para agentes y desarrolladores
- [ROADMAP.md](ROADMAP.md): diagnóstico y sesiones planificadas
- [ESTADO_MODULOS.md](ESTADO_MODULOS.md): estado real por módulo
- [ARQUITECTURA.md](ARQUITECTURA.md): estructura y decisiones técnicas
- [CHAT_LOG.md](CHAT_LOG.md): bitácora de sesiones
- [ESTADO_DESARROLLO.md](ESTADO_DESARROLLO.md): documento histórico con la lista detallada de bugs

## v0

Este repositorio está enlazado a un proyecto de v0: v0 puede hacer commits directos a `main` y cada merge a `main` despliega en Vercel.

[Seguir trabajando en v0 →](https://v0.app/chat/projects/prj_IWeDIuJgaoSP3bCLQWYZWAS8YZhc)
