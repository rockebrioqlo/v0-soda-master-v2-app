'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wallet, Truck, Users, TrendingDown, Activity, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivosTab } from '@/components/activos-tab'
import { GastosTab } from '@/components/gastos-tab'
import { EmpleadosTab } from '@/components/empleados-tab'
import { MargenesTab } from '@/components/margenes-tab'
import { showToast } from '@/components/toast'

type Tab = 'gastos' | 'sueldos' | 'activos' | 'margenes'

export function FinanzasPage() {
  const [tab, setTab] = useState<Tab>('gastos')
  const [seeding, setSeeding] = useState(false)

  const cargarDemo = async () => {
    if (
      !confirm(
        '¿Cargar datos de demostración? Esto crea proveedores, empleados, activos, compras y gastos coherentes. Es idempotente: no duplica registros que ya existen.',
      )
    ) {
      return
    }
    setSeeding(true)
    try {
      const res = await fetch('/api/seed-demo', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error en seed')
      showToast(
        `Demo OK · proveedores ${data.proveedores}, empleados ${data.empleados}, activos ${data.activos}, compras ${data.compras_creadas}, gastos ${data.gastos_creados}`,
        'success',
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
          <p className="text-sm text-muted-foreground">
            Gastos internos, sueldos, activos del negocio y depreciación.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={cargarDemo}
          disabled={seeding}
          className="border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
        >
          <Sparkles className={seeding ? 'mr-2 h-4 w-4 animate-pulse' : 'mr-2 h-4 w-4'} />
          {seeding ? 'Cargando datos demo...' : 'Cargar datos de demostración'}
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="gastos" className="gap-2">
            <Wallet className="h-4 w-4" /> Gastos
          </TabsTrigger>
          <TabsTrigger value="sueldos" className="gap-2">
            <Users className="h-4 w-4" /> Empleados / sueldos
          </TabsTrigger>
          <TabsTrigger value="activos" className="gap-2">
            <Truck className="h-4 w-4" /> Activos y depreciación
          </TabsTrigger>
          <TabsTrigger value="margenes" className="gap-2">
            <TrendingDown className="h-4 w-4" /> Márgenes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gastos" className="mt-4">
          <GastosTab />
        </TabsContent>
        <TabsContent value="sueldos" className="mt-4">
          <EmpleadosTab />
        </TabsContent>
        <TabsContent value="activos" className="mt-4">
          <ActivosTab />
        </TabsContent>
        <TabsContent value="margenes" className="mt-4">
          <MargenesTab />
        </TabsContent>
      </Tabs>
      <div className="hidden">
        <Activity />
      </div>
    </div>
  )
}
