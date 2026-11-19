# Sodamaster (Soda Master V2)

POS para sodas y restaurantes, de Latencia Cero SpA. Une en una sola aplicación la atención de mesas, las comandas a cocina y bar, el cobro (con cuentas divididas y pagos parciales), la caja chica, el inventario con recetas y costos, las finanzas del local y los reportes de venta.

> Estado: funcional en un local de prueba; **no listo para producción comercial** (la API no exige sesión). Ver [ROADMAP.md](ROADMAP.md).

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 · shadcn/ui · Lucide · Recharts
- Neon Postgres (`@neondatabase/serverless`, SQL directo, esquema `soda_master`)
- Login propio: email + PIN con bcrypt
- pnpm 10 · Vercel

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

Requisitos: Node.js 20+ y pnpm 10.

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

Sembradas por `/api/seed` (solo para desarrollo; deben cambiarse antes de producción):

| Usuario | Email | PIN | Rol |
|---|---|---|---|
| Administrador | admin@soda.cl | 1234 | admin |
| Carlos García | cajero@soda.cl | 2222 | cajero |
| María López | mesero@soda.cl | 3333 | mesero |
| Pedro Martínez | cocina@soda.cl | 4444 | cocina |
| Laura Rodríguez | bar@soda.cl | 5555 | bar |

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
