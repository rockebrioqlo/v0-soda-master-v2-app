'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, FileText, Eye, RefreshCw } from 'lucide-react'
import { showToast } from '@/components/toast'
import { formatCurrency } from '@/lib/helpers'

type Proveedor = { id: string; nombre: string }
type Insumo = { id: string; nombre: string; unidad_medida: string; costo_unitario: number }

type Compra = {
  id: string
  proveedor_id: string | null
  proveedor_nombre: string | null
  tipo_documento: string
  numero_documento: string | null
  fecha: string
  subtotal: string | number
  impuesto: string | number
  total: string | number
}

type CompraDetalleItem = {
  id: string
  ingrediente_id: string
  ingrediente_nombre: string
  unidad_medida: string
  cantidad: string | number
  precio_unitario: string | number
  subtotal: string | number
}

type CompraDetalle = Compra & { items: CompraDetalleItem[] }

type LineaForm = {
  ingrediente_id: string
  cantidad: string
  precio_unitario: string
}

const NUEVA_LINEA: LineaForm = { ingrediente_id: '', cantidad: '1', precio_unitario: '0' }

export function ComprasTab() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [detalle, setDetalle] = useState<CompraDetalle | null>(null)

  const [form, setForm] = useState({
    proveedor_id: '',
    tipo_documento: 'boleta',
    numero_documento: '',
    fecha: new Date().toISOString().slice(0, 10),
    impuesto: '0',
    notas: '',
  })
  const [lineas, setLineas] = useState<LineaForm[]>([{ ...NUEVA_LINEA }])
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [provRes, insRes, comprasRes] = await Promise.all([
        fetch('/api/proveedores'),
        fetch('/api/ingredientes'),
        fetch('/api/compras'),
      ])
      if (provRes.ok) setProveedores(await provRes.json())
      if (insRes.ok) setInsumos(await insRes.json())
      if (comprasRes.ok) setCompras(await comprasRes.json())
    } catch {
      showToast('Error al cargar compras', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const subtotal = useMemo(
    () =>
      lineas.reduce(
        (s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
        0,
      ),
    [lineas],
  )
  const totalCompra = subtotal + (Number(form.impuesto) || 0)

  const abrirNueva = () => {
    setForm({
      proveedor_id: '',
      tipo_documento: 'boleta',
      numero_documento: '',
      fecha: new Date().toISOString().slice(0, 10),
      impuesto: '0',
      notas: '',
    })
    setLineas([{ ...NUEVA_LINEA }])
    setShowDialog(true)
  }

  const guardar = async () => {
    const items = lineas
      .filter((l) => l.ingrediente_id && Number(l.cantidad) > 0)
      .map((l) => ({
        ingrediente_id: l.ingrediente_id,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario) || 0,
      }))
    if (items.length === 0) {
      showToast('Agrega al menos un insumo con cantidad', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: form.proveedor_id || null,
          tipo_documento: form.tipo_documento,
          numero_documento: form.numero_documento || null,
          fecha: form.fecha,
          impuesto: Number(form.impuesto) || 0,
          notas: form.notas || null,
          items,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || 'Error al registrar compra')
      }
      showToast('Compra registrada — stock e insumo actualizados', 'success')
      setShowDialog(false)
      await reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error')
    } finally {
      setSaving(false)
    }
  }

  const verDetalle = async (id: string) => {
    try {
      const res = await fetch(`/api/compras/${id}`)
      if (!res.ok) throw new Error('Detalle no disponible')
      setDetalle(await res.json())
    } catch {
      showToast('Error al cargar detalle', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Button variant="outline" onClick={reload} disabled={loading} className="border-border">
          <RefreshCw className={loading ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refrescar
        </Button>
        <Button onClick={abrirNueva}>
          <Plus className="mr-2 h-4 w-4" /> Registrar compra
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">Cargando compras...</p>
          ) : compras.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              No hay compras registradas. Usa &quot;Registrar compra&quot; para sumar tu primera factura/boleta.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Imp.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{String(c.fecha).slice(0, 10)}</TableCell>
                    <TableCell>{c.proveedor_nombre || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="mr-2 capitalize">
                        {c.tipo_documento}
                      </Badge>
                      <span className="text-muted-foreground">{c.numero_documento || ''}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(c.subtotal))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(c.impuesto))}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(Number(c.total))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => verDetalle(c.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog nueva compra */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-500" />
              Registrar boleta / factura de compra
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Proveedor</label>
                <Select
                  value={form.proveedor_id}
                  onValueChange={(v) => setForm({ ...form, proveedor_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipo documento</label>
                <Select
                  value={form.tipo_documento}
                  onValueChange={(v) => setForm({ ...form, tipo_documento: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleta">Boleta</SelectItem>
                    <SelectItem value="factura">Factura</SelectItem>
                    <SelectItem value="nota">Nota</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Número documento</label>
                <Input
                  value={form.numero_documento}
                  onChange={(e) => setForm({ ...form, numero_documento: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha</label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Items</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLineas([...lineas, { ...NUEVA_LINEA }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Agregar línea
                </Button>
              </div>
              {lineas.map((l, idx) => {
                const ins = insumos.find((i) => i.id === l.ingrediente_id)
                const sub = (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)
                return (
                  <div key={idx} className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-5">
                      <Select
                        value={l.ingrediente_id}
                        onValueChange={(v) => {
                          const next = [...lineas]
                          next[idx] = { ...l, ingrediente_id: v }
                          // Sugerir último precio si tenía costo > 0
                          const pre = insumos.find((i) => i.id === v)
                          if (pre && Number(next[idx].precio_unitario) === 0 && pre.costo_unitario > 0) {
                            next[idx].precio_unitario = String(pre.costo_unitario)
                          }
                          setLineas(next)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Insumo" />
                        </SelectTrigger>
                        <SelectContent>
                          {insumos.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.nombre} ({i.unidad_medida})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Cant."
                        value={l.cantidad}
                        onChange={(e) => {
                          const next = [...lineas]
                          next[idx] = { ...l, cantidad: e.target.value }
                          setLineas(next)
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Precio unit."
                        value={l.precio_unitario}
                        onChange={(e) => {
                          const next = [...lineas]
                          next[idx] = { ...l, precio_unitario: e.target.value }
                          setLineas(next)
                        }}
                      />
                    </div>
                    <div className="col-span-1 text-right text-xs text-muted-foreground">
                      {ins ? formatCurrency(sub) : '—'}
                    </div>
                    <div className="col-span-1 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setLineas(lineas.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Impuesto / IVA</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.impuesto}
                  onChange={(e) => setForm({ ...form, impuesto: e.target.value })}
                />
              </div>
              <div className="self-end space-y-0.5 text-right text-sm">
                <div className="text-muted-foreground">Subtotal: {formatCurrency(subtotal)}</div>
                <div className="font-semibold text-foreground">
                  Total: {formatCurrency(totalCompra)}
                </div>
              </div>
            </div>

            <Textarea
              placeholder="Notas (opcional)"
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar compra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Detalle compra</DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-3 py-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p>
                  <span className="text-muted-foreground">Fecha:</span> {String(detalle.fecha).slice(0, 10)}
                </p>
                <p>
                  <span className="text-muted-foreground">Documento:</span>{' '}
                  {detalle.tipo_documento.toUpperCase()} {detalle.numero_documento || ''}
                </p>
                <p className="col-span-2">
                  <span className="text-muted-foreground">Proveedor:</span>{' '}
                  {detalle.proveedor_nombre || '—'}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalle.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        {it.ingrediente_nombre}{' '}
                        <span className="text-xs text-muted-foreground">({it.unidad_medida})</span>
                      </TableCell>
                      <TableCell className="text-right">{Number(it.cantidad)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(it.precio_unitario))}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(it.subtotal))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="space-y-0.5 text-right">
                <div className="text-muted-foreground">
                  Subtotal: {formatCurrency(Number(detalle.subtotal))}
                </div>
                <div className="text-muted-foreground">
                  Impuesto: {formatCurrency(Number(detalle.impuesto))}
                </div>
                <div className="font-semibold">Total: {formatCurrency(Number(detalle.total))}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
