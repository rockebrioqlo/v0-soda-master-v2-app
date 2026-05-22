'use client'

import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Grid3X3,
  ShoppingCart,
  ChefHat,
  Package,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  AlertTriangle,
  MoreHorizontal,
  X,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'

type PageType =
  | 'dashboard'
  | 'mesas'
  | 'pos'
  | 'kds'
  | 'inventario'
  | 'usuarios'
  | 'pagos'
  | 'mermas'
  | 'reportes'
  | 'configuracion'

interface NavEntry {
  page: PageType
  label: string
  icon: React.ReactNode
  modulo: string
}

const ALL_ITEMS: NavEntry[] = [
  { page: 'dashboard', label: 'Inicio', icon: <LayoutDashboard className="h-5 w-5" />, modulo: 'dashboard' },
  { page: 'mesas', label: 'Mesas', icon: <Grid3X3 className="h-5 w-5" />, modulo: 'mesas' },
  { page: 'pos', label: 'POS', icon: <ShoppingCart className="h-5 w-5" />, modulo: 'pos' },
  { page: 'kds', label: 'Cocina', icon: <ChefHat className="h-5 w-5" />, modulo: 'kds' },
  { page: 'inventario', label: 'Inventario', icon: <Package className="h-5 w-5" />, modulo: 'inventario' },
  { page: 'usuarios', label: 'Usuarios', icon: <Users className="h-5 w-5" />, modulo: 'usuarios' },
  { page: 'pagos', label: 'Pagos', icon: <CreditCard className="h-5 w-5" />, modulo: 'pagos' },
  { page: 'mermas', label: 'Mermas', icon: <AlertTriangle className="h-5 w-5" />, modulo: 'mermas' },
  { page: 'reportes', label: 'Reportes', icon: <BarChart3 className="h-5 w-5" />, modulo: 'reportes' },
  { page: 'configuracion', label: 'Config', icon: <Settings className="h-5 w-5" />, modulo: 'configuracion' },
]

// Quick-access shown in tab bar (max 4 + "···")
const PRIMARY_BY_ROLE: Record<string, PageType[]> = {
  admin: ['dashboard', 'mesas', 'pos'],
  administrador: ['dashboard', 'mesas', 'pos'],
  mesero: ['mesas', 'pos', 'mermas'],
  cocina: ['kds'],
  bar: ['kds'],
  cajero: ['mesas', 'pos', 'pagos'],
}

export function BottomNav() {
  const { state, hasPermission, currentPage, navigateTo } = useApp()
  const { usuarioActual } = state

  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  if (!mounted || !isMobile || !usuarioActual) return null

  // Cocina / bar use full-screen KDS without nav
  if ((usuarioActual.rol === 'cocina' || usuarioActual.rol === 'bar') && currentPage === 'kds') {
    return null
  }

  const primary = (PRIMARY_BY_ROLE[usuarioActual.rol] || ['dashboard', 'mesas', 'pos'])
    .map((p) => ALL_ITEMS.find((i) => i.page === p))
    .filter((i): i is NavEntry => !!i && hasPermission(i.modulo))

  const overflow = ALL_ITEMS.filter(
    (i) => hasPermission(i.modulo) && !primary.some((p) => p.page === i.page)
  )

  const showOverflow = overflow.length > 0
  const items = showOverflow ? primary.slice(0, 3) : primary.slice(0, 4)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16 items-stretch justify-around">
          {items.map((item) => (
            <button
              key={item.page}
              type="button"
              onClick={() => navigateTo(item.page)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors',
                currentPage === item.page
                  ? 'text-amber-500'
                  : 'text-muted-foreground active:bg-muted/50'
              )}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          {showOverflow && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors',
                overflow.some((i) => i.page === currentPage)
                  ? 'text-amber-500'
                  : 'text-muted-foreground active:bg-muted/50'
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>Más</span>
            </button>
          )}
        </div>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 shadow-xl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Menú</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {overflow.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => {
                    navigateTo(item.page)
                    setDrawerOpen(false)
                  }}
                  className={cn(
                    'flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs font-medium transition-colors',
                    currentPage === item.page
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-500'
                      : 'text-foreground active:bg-muted'
                  )}
                >
                  {item.icon}
                  <span className="text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
