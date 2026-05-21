'use client'

import { useApp } from '@/lib/app-context'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
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
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Wifi,
  WifiOff
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  modulo: string
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, modulo: 'dashboard' },
  { href: '/mesas', label: 'Mesas', icon: <Grid3X3 className="h-5 w-5" />, modulo: 'mesas' },
  { href: '/pos', label: 'POS', icon: <ShoppingCart className="h-5 w-5" />, modulo: 'pos' },
  { href: '/kds', label: 'KDS', icon: <ChefHat className="h-5 w-5" />, modulo: 'kds' },
  { href: '/inventario', label: 'Inventario', icon: <Package className="h-5 w-5" />, modulo: 'inventario' },
  { href: '/usuarios', label: 'Usuarios', icon: <Users className="h-5 w-5" />, modulo: 'usuarios' },
  { href: '/pagos', label: 'Pagos', icon: <CreditCard className="h-5 w-5" />, modulo: 'pagos' },
  { href: '/mermas', label: 'Mermas', icon: <AlertTriangle className="h-5 w-5" />, modulo: 'mermas' },
  { href: '/reportes', label: 'Reportes', icon: <BarChart3 className="h-5 w-5" />, modulo: 'reportes' },
  { href: '/configuracion', label: 'Configuración', icon: <Settings className="h-5 w-5" />, modulo: 'configuracion' },
]

// Mobile-optimized nav for specific roles
const mobileNavByRole: Record<string, string[]> = {
  mesero: ['mesas', 'pos', 'mermas'],
  cocina: ['kds'],
  bar: ['kds'],
  cajero: ['mesas', 'pos', 'pagos', 'reportes'],
  administrador: ['dashboard', 'mesas', 'pos', 'kds', 'inventario'],
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { state, logout, hasPermission } = useApp()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { usuarioActual, isOnline, configuracion } = state

  if (!usuarioActual) {
    return <>{children}</>
  }

  // For KDS roles (cocina/bar), show full-screen KDS without navigation
  if (usuarioActual.rol === 'cocina' || usuarioActual.rol === 'bar') {
    if (pathname === '/kds') {
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
              <Button variant="ghost" size="sm" onClick={() => { logout(); router.push('/') }}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main>{children}</main>
        </div>
      )
    }
  }

  const filteredNavItems = navItems.filter(item => hasPermission(item.modulo))
  const mobileNavModulos = mobileNavByRole[usuarioActual.rol] || ['dashboard', 'mesas', 'pos']
  const mobileNavItems = navItems.filter(item => 
    mobileNavModulos.includes(item.modulo) && hasPermission(item.modulo)
  )

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-yellow-500/20 px-4 py-2 text-center text-sm text-yellow-500">
          <WifiOff className="mr-2 inline h-4 w-4" />
          Modo offline activo — trabajando con datos locales
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-bold text-amber-500">{configuracion.nombreRestaurante}</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-yellow-500" />
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {usuarioActual.nombre} ({getRolLabel(usuarioActual.rol)})
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Salir</span>
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden w-64 border-r border-border bg-card lg:block">
          <nav className="flex flex-col gap-1 p-4">
            {filteredNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-amber-500/20 text-amber-500'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-64 border-r border-border bg-card">
              <nav className="flex flex-col gap-1 p-4">
                {filteredNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      pathname === item.href
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden">
        <div className="flex items-center justify-around">
          {mobileNavItems.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                pathname === item.href
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
