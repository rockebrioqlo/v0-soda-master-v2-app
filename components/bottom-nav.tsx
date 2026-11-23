'use client'

import { useEffect, useRef, useState } from 'react'
import { enfocarContenido } from '@/lib/enfocar-contenido'
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
  Wallet,
  MoreHorizontal,
} from 'lucide-react'
import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type PageType =
  | 'dashboard'
  | 'mesas'
  | 'pos'
  | 'kds'
  | 'inventario'
  | 'finanzas'
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
  { page: 'finanzas', label: 'Finanzas', icon: <Wallet className="h-5 w-5" />, modulo: 'finanzas' },
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
  // Sesión 21b (K2, #8): tras elegir un destino en el cajón el foco va al contenido, no de vuelta a "Más".
  const eligioDestino = useRef(false)

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
        aria-label="Navegación inferior"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-16 items-stretch justify-around">
          {items.map((item) => (
            <button
              key={item.page}
              type="button"
              aria-current={currentPage === item.page ? 'page' : undefined}
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
              aria-haspopup="dialog"
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

      {/* Sesión 21a (K2, #2): Sheet de Radix (antes un fondo con onClick hecho a mano): el foco entra al cajón,
          Esc lo cierra, el fondo queda inerte, el botón de cerrar se llama "Cerrar" y el foco vuelve a "Más". */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (eligioDestino.current) {
              eligioDestino.current = false
              e.preventDefault()
              enfocarContenido()
            }
          }}
          className="gap-0 rounded-t-2xl bg-card p-4 md:hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <SheetHeader className="mb-4 p-0 pr-8">
            <SheetTitle className="text-base">Menú</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3">
            {overflow.map((item) => (
              <button
                key={item.page}
                type="button"
                aria-current={currentPage === item.page ? 'page' : undefined}
                onClick={() => {
                  navigateTo(item.page)
                  eligioDestino.current = true
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
        </SheetContent>
      </Sheet>
    </>
  )
}
