import { db } from '@/lib/db'
import { z } from 'zod'
import { esAdminSesion, requireAcceso, requireSesion } from '@/lib/sesion'
import { fechaYmd, leerConsulta, uuid } from '@/lib/validacion-http'
import { verificarAutorizacionAdmin } from '@/lib/autorizacion-admin'

const TIPOS = [
  'accidente',
  'vencido',
  'perdida_sin_explicacion',
  'consumo_interno',
  'comanda_no_pagada',
  'error_preparacion',
  'robo',
] as const

const TIPOS_ADMIN_ONLY = new Set<string>(['robo', 'perdida_sin_explicacion'])
const MOTIVOS_CNP = new Set<string>(['cliente_se_fue', 'error_mesero', 'cortesia'])

export async function GET(request: Request) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const q = leerConsulta(
      request,
      z
        .object({
          tipo: z.string().max(40).optional(),
          desde: fechaYmd.optional(),
          hasta: fechaYmd.optional(),
          responsable_id: uuid.optional(),
        })
        .strict(),
    )
    if (!q.ok) return q.respuesta
    const { tipo, desde, hasta, responsable_id } = q.datos
    if (tipo && !TIPOS.includes(tipo as any)) {
      return Response.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    const data = await db.getMermas({ tipo, desde, hasta, responsable_id })
    return Response.json(data)
  } catch (error) {
    console.error('Get mermas error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Quien registra es el usuario de la sesión, no `registrado_por` del body.
    const s = await requireSesion(request, ['admin', 'mesero', 'cocina', 'bar'])
    if (!s.ok) return s.respuesta
    const usuario = s.usuario
    const body = await request.json()
    const tipo = String(body.tipo || '')
    if (!TIPOS.includes(tipo as any)) {
      return Response.json({ error: 'Tipo inválido' }, { status: 400 })
    }
    const cantidad = Number(body.cantidad)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return Response.json({ error: 'Cantidad inválida' }, { status: 400 })
    }
    const registradoPor = usuario.id
    if (TIPOS_ADMIN_ONLY.has(tipo) && !esAdminSesion(usuario)) {
      return Response.json(
        { error: 'Solo el administrador puede registrar este tipo de merma' },
        { status: 403 }
      )
    }

    let comandaNoPagada: { orden_id: string; motivo: string; autorizado_por?: string | null } | null =
      null
    if (tipo === 'comanda_no_pagada') {
      const cnp = body.comanda_no_pagada || {}
      const motivo = String(cnp.motivo || '')
      if (!MOTIVOS_CNP.has(motivo)) {
        return Response.json({ error: 'Motivo inválido' }, { status: 400 })
      }
      if (!cnp.orden_id) {
        return Response.json({ error: 'orden_id requerido' }, { status: 400 })
      }
      // La cortesía exige la autorización firmada del admin (verificar-pin).
      // Si quien registra ya es admin, se autoriza a sí mismo.
      let autorizadoPor: string | null = null
      if (cnp.autorizacion) {
        const admin = await verificarAutorizacionAdmin(cnp.autorizacion)
        if (!admin) {
          return Response.json({ error: 'Autorización del administrador inválida o vencida' }, { status: 403 })
        }
        autorizadoPor = admin.id
      } else if (esAdminSesion(usuario)) {
        autorizadoPor = usuario.id
      }
      if (motivo === 'cortesia' && !autorizadoPor) {
        return Response.json({ error: 'La cortesía requiere autorización del administrador' }, { status: 403 })
      }
      comandaNoPagada = {
        orden_id: String(cnp.orden_id),
        motivo,
        autorizado_por: autorizadoPor,
      }
    }

    const merma = await db.crearMerma({
      tipo,
      producto_id: body.producto_id ? String(body.producto_id) : null,
      cantidad,
      descripcion: body.descripcion ? String(body.descripcion) : null,
      registrado_por: registradoPor,
      comanda_no_pagada: comandaNoPagada,
    })
    return Response.json(merma, { status: 201 })
  } catch (error) {
    console.error('Create merma error:', error)
    if (
      error instanceof Error &&
      (
        error.message.includes('Stock insuficiente') ||
        error.message.includes('Producto requerido') ||
        error.message.includes('Producto sin registro')
      )
    ) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
