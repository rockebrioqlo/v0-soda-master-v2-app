"use client"

import { useState, useEffect } from "react"
import { AppProvider, useApp } from "@/lib/app-context"
import { LoginForm } from "@/components/login-form"
import { MainLayout } from "@/components/main-layout"
import { DashboardPage } from "@/components/dashboard-page"
import { MesasPage } from "@/components/mesas-page"
import { POSPage } from "@/components/pos-page"
import { KDSPage } from "@/components/kds-page"
import { InventarioPage } from "@/components/inventario-page"
import { FinanzasPage } from "@/components/finanzas-page"
import { UsuariosPage } from "@/components/usuarios-page"
import { PagosPage } from "@/components/pagos-page"
import { CajaPage } from "@/components/caja-page"
import { MermasPage } from "@/components/mermas-page"
import { ReportesPage } from "@/components/reportes-page"
import { ConfiguracionPage } from "@/components/configuracion-page"
import { ToastContainer } from "@/components/toast"
import { NotificacionesToast } from "@/components/notificaciones-toast"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"

// Sesión 21b (K2, #8): la app es una sola página; el título del documento sigue a la pantalla para que un lector
// (y la pestaña) anuncien dónde está el usuario.
const TITULOS_PANTALLA: Record<string, string> = {
  dashboard: "Dashboard",
  mesas: "Mesas",
  pos: "Punto de venta",
  kds: "Cocina y bar (KDS)",
  inventario: "Inventario",
  finanzas: "Finanzas",
  usuarios: "Usuarios",
  pagos: "Pagos y facturación",
  caja: "Caja",
  mermas: "Mermas y pérdidas",
  reportes: "Reportes y estadísticas",
  configuracion: "Configuración",
}

function AppContent() {
  const { state, isInitialized, currentPage, initError, reintentandoInicio, reintentarInicio } = useApp()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const hayUsuario = !!state.usuarioActual
  useEffect(() => {
    const pantalla = hayUsuario ? (TITULOS_PANTALLA[currentPage] ?? "Soda Master") : "Ingresar"
    document.title = `${pantalla} - Soda Master`
  }, [hayUsuario, currentPage, mounted, isInitialized])

  if (!mounted || !isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando Soda Master...</p>
        </div>
      </div>
    )
  }

  // #26: si el arranque no pudo leer la base (red caída o error 5xx) se avisa en vez de mostrar una app vacía.
  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div role="alert" className="w-full max-w-md rounded-lg border border-red-500/40 bg-card p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h1 className="text-xl font-bold text-foreground">Error de conexión con la BD</h1>
          <p className="mt-2 text-sm text-muted-foreground">{initError}</p>
          <Button
            onClick={() => void reintentarInicio()}
            disabled={reintentandoInicio}
            className="mt-5 bg-amber-500 text-zinc-900 hover:bg-amber-400"
          >
            {reintentandoInicio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {reintentandoInicio ? "Reintentando…" : "Reintentar"}
          </Button>
        </div>
      </div>
    )
  }

  if (!state.usuarioActual) {
    return (
      <>
        <LoginForm />
        <ToastContainer />
      </>
    )
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage />
      case "mesas":
        return <MesasPage />
      case "pos":
        return <POSPage />
      case "kds":
        return <KDSPage />
      case "inventario":
        return <InventarioPage />
      case "finanzas":
        return <FinanzasPage />
      case "usuarios":
        return <UsuariosPage />
      case "pagos":
        return <PagosPage />
      case "caja":
        return <CajaPage />
      case "mermas":
        return <MermasPage />
      case "reportes":
        return <ReportesPage />
      case "configuracion":
        return <ConfiguracionPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <>
      <MainLayout>{renderPage()}</MainLayout>
      <ToastContainer />
      <NotificacionesToast />
    </>
  )
}

export default function SodaMasterApp() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
