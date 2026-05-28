'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/helpers'
import { showToast } from '@/components/toast'

type MargenRow = {
  producto_id: string
  producto_nombre: string
  categoria: string
  modo_stock: string
  precio: number
  costo_receta: number
  margen: number
  margen_pct: number
}

export function MargenesTab() {
  const [items, setItems] = useState<MargenRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/margenes')
      if (res.ok) setItems(await res.json())
    } catch {
      showToast('Error al cargar márgenes', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totales = useMemo(() => {
    if (items.length === 0) return null
    const conReceta = items.filter((i) => i.costo_receta > 0)
    const sumPrecio = conReceta.reduce((s, i) => s + i.precio, 0)
    const sumCosto = conReceta.reduce((s, i) => s + i.costo_receta, 0)
    const sumMargen = sumPrecio - sumCosto
    const pctProm = sumPrecio > 0 ? (sumMargen / sumPrecio) * 100 : 0
    return {
      conReceta: conReceta.length,
      sinCosto: items.length - conReceta.length,
      sumPrecio,
      sumCosto,
      sumMargen,
      pctProm: Number(pctProm.toFixed(2)),
    }
  }, [items])

  const margenColor = (pct: number, costo: number) => {
    if (costo === 0) return 'text-muted-foreground'
    if (pct >= 60) return 'text-green-500 font-semibold'
    if (pct >= 35) return 'text-amber-500 font-semibold'
    return 'text-red-500 font-semibold'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-amber-500" />
          <p className="text-sm text-muted-foreground">
            Margen calculado como <code>precio - costo_receta</code>. El costo viene de los
            insumos descontados al vender (precio promedio ponderado de compras).
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="border-border">
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refrescar
        </Button>
      </div>

      {totales && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{totales.conReceta}</p>
              <p className="text-xs text-muted-foreground">Productos con receta</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{totales.sinCosto}</p>
              <p className="text-xs text-muted-foreground">Sin costo definido</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 text-center">
              <p className="text-xl font-bold text-foreground">{formatCurrency(totales.sumMargen)}</p>
              <p className="text-xs text-muted-foreground">Margen total potencial</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4 text-center">
              <p className={'text-2xl font-bold ' + margenColor(totales.pctProm, totales.sumCosto)}>
                {totales.pctProm}%
              </p>
              <p className="text-xs text-muted-foreground">Margen promedio</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Calculando márgenes...</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No hay productos para calcular.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Costo receta</TableHead>
                  <TableHead className="text-right">Margen $</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.producto_id}>
                    <TableCell className="font-medium">{m.producto_nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {m.categoria?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(m.precio)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.costo_receta > 0 ? formatCurrency(m.costo_receta) : '—'}
                    </TableCell>
                    <TableCell className={'text-right ' + margenColor(m.margen_pct, m.costo_receta)}>
                      {m.costo_receta > 0 ? formatCurrency(m.margen) : '—'}
                    </TableCell>
                    <TableCell className={'text-right ' + margenColor(m.margen_pct, m.costo_receta)}>
                      {m.costo_receta > 0 ? m.margen_pct + '%' : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
