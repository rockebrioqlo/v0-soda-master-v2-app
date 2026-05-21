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
import { UsuariosPage } from "@/components/usuarios-page"
import { PagosPage } from "@/components/pagos-page"
import { ReportesPage } from "@/components/reportes-page"
import { ConfiguracionPage } from "@/components/configuracion-page"
import { ToastContainer } from "@/components/toast"

function AppContent() {
  const { state, isInitialized, currentPage } = useApp()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
      case "usuarios":
        return <UsuariosPage />
      case "pagos":
        return <PagosPage />
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
