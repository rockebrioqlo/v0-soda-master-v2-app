'use client'

import { useApp } from '@/lib/app-context'
import { cn } from '@/lib/utils'
import { getRolLabel } from '@/lib/helpers'
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
  Wallet,
  LogOut,
  Menu,
  X,
  WifiOff,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { BottomNav } from '@/components/bottom-nav'
import { RelojAviso } from '@/components/reloj-aviso'

type PageType =
  | 'dashboard'
  | 'mesas'
  | 'pos'
  | 'kds'
  | 'inventario'
  | 'finanzas'
  | 'usuarios'
  | 'pagos'
  | 'caja'
  | 'mermas'
  | 'reportes'
  | 'configuracion'

interface NavItem {
  page: PageType
  label: string
  icon: React.ReactNode
  modulo: string
}

const navItems: NavItem[] = [
  { page: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, modulo: 'dashboard' },
  { page: 'mesas', label: 'Mesas', icon: <Grid3X3 className="h-5 w-5" />, modulo: 'mesas' },
  { page: 'pos', label: 'POS', icon: <ShoppingCart className="h-5 w-5" />, modulo: 'pos' },
  { page: 'kds', label: 'KDS', icon: <ChefHat className="h-5 w-5" />, modulo: 'kds' },
  { page: 'inventario', label: 'Inventario', icon: <Package className="h-5 w-5" />, modulo: 'inventario' },
  { page: 'finanzas', label: 'Finanzas', icon: <Wallet className="h-5 w-5" />, modulo: 'finanzas' },
  { page: 'usuarios', label: 'Usuarios', icon: <Users className="h-5 w-5" />, modulo: 'usuarios' },
  { page: 'pagos', label: 'Pagos', icon: <CreditCard className="h-5 w-5" />, modulo: 'pagos' },
  { page: 'caja', label: 'Caja', icon: <Wallet className="h-5 w-5" />, modulo: 'caja' },
  { page: 'mermas', label: 'Mermas', icon: <AlertTriangle className="h-5 w-5" />, modulo: 'mermas' },
  { page: 'reportes', label: 'Reportes', icon: <BarChart3 className="h-5 w-5" />, modulo: 'reportes' },
  { page: 'configuracion', label: 'Config', icon: <Settings className="h-5 w-5" />, modulo: 'configuracion' },
]

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { state, logout, hasPermission, currentPage, navigateTo } = useApp()
  // Tablet sidebar expansion (overlay)
  const [tabletExpanded, setTabletExpanded] = useState(false)

  const { usuarioActual, isOnline, configuracion } = state

  if (!usuarioActual) {
    return <>{children}</>
  }

  // For KDS roles (cocina/bar), show full-screen KDS without navigation
  if ((usuarioActual.rol === 'cocina' || usuarioActual.rol === 'bar') && currentPage === 'kds') {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-amber-500">{configuracion.nombreRestaurante}</span>
            {!isOnline && (
              <span className="flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-1 text-xs text-yellow-500">
                <WifiOff className="h-3 w-3" />
                Modo offline
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {usuarioActual.nombre} ({getRolLabel(usuarioActual.rol)})
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    )
  }

  const filteredNavItems = navItems.filter((item) => hasPermission(item.modulo))

  const renderNavButton = (item: NavItem, opts?: { collapsed?: boolean; onAfter?: () => void }) => {
    const collapsed = !!opts?.collapsed
    const active = currentPage === item.page
    return (
      <button
        key={item.page}
        onClick={() => {
          navigateTo(item.page)
          opts?.onAfter?.()
        }}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg text-sm transition-colors w-full',
          collapsed ? 'justify-center px-2 py-3' : 'px-3 py-2 text-left',
          active
            ? 'bg-amber-500/20 text-amber-500'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-yellow-500/20 px-4 py-2 text-center text-xs text-yellow-500 md:text-sm">
          <WifiOff className="mr-2 inline h-4 w-4" />
          Modo offline activo
        </div>
      )}

      {/* Aviso si el reloj del cajero está desfasado vs la hora oficial */}
      <RelojAviso />

      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-3 md:px-4 lg:px-6">
        <div className="flex items-center gap-2 md:gap-4">
          {/* Tablet hamburger (md..lg) */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex lg:hidden"
            onClick={() => setTabletExpanded((v) => !v)}
            aria-label="Menú"
          >
            {tabletExpanded ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <button
            onClick={() => navigateTo(hasPermission('dashboard') ? 'dashboard' : 'mesas')}
            className="flex items-center gap-2"
          >
            <span className="truncate text-base font-bold text-amber-500 md:text-lg">
              {configuracion.nombreRestaurante}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {/* Connection: mobile = dot, desktop = icon */}
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full md:hidden',
              isOnline ? 'bg-green-500' : 'bg-red-500'
            )}
            aria-label={isOnline ? 'Conectado' : 'Sin conexión'}
            title={isOnline ? 'Conectado' : 'Sin conexión'}
          />
          <span className="hidden text-sm text-muted-foreground md:inline">
            {usuarioActual.nombre} <span className="text-xs">({getRolLabel(usuarioActual.rol)})</span>
          </span>
          {/* Mobile: short user name only */}
          <span className="max-w-[7rem] truncate text-sm text-muted-foreground md:hidden">
            {usuarioActual.nombre}
          </span>
          <Button variant="ghost" size="sm" onClick={logout} aria-label="Salir">
            <LogOut className="h-4 w-4" />
            <span className="ml-2 hidden lg:inline">Salir</span>
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop (lg+) full width */}
        <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
          <nav className="flex flex-col gap-1 p-4">
            {filteredNavItems.map((item) => renderNavButton(item))}
          </nav>
        </aside>

        {/* Sidebar - Tablet (md..lg) collapsed (icons only) */}
        <aside className="hidden w-16 shrink-0 border-r border-border bg-card md:block lg:hidden">
          <nav className="flex flex-col gap-1 p-2">
            {filteredNavItems.map((item) => renderNavButton(item, { collapsed: true }))}
          </nav>
        </aside>

        {/* Tablet expanded overlay (md..lg) */}
        {tabletExpanded && (
          <div className="fixed inset-0 z-40 hidden md:block lg:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setTabletExpanded(false)}
            />
            <aside className="absolute left-0 top-14 h-[calc(100vh-3.5rem)] w-64 border-r border-border bg-card shadow-xl">
              <nav className="flex flex-col gap-1 p-4">
                {filteredNavItems.map((item) =>
                  renderNavButton(item, { onAfter: () => setTabletExpanded(false) })
                )}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-3 pb-24 md:p-4 md:pb-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (< md) */}
      <BottomNav />
    </div>
  )
}
