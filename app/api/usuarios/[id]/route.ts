import { db } from '@/lib/db'
import { actorDe, ipDePeticion, requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'
import { UsuarioPatchSchema } from '@/lib/usuarios-http'
import { exitoIntento, falloIntento, iniciarIntento } from '@/lib/intentos-login'
import type { ErrorCambioUsuario } from '@/lib/usuarios-reglas'

function respuestaCambioUsuario(e: ErrorCambioUsuario) {
  return Response.json({ error: e.mensaje, codigo: e.codigo }, { status: e.status })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    const id = p.datos.id
    // F44 (14.5b-2): esquema .strict() con `pin` en claro (4 a 8 dígitos); `pinHash`, `pin_hash` e `id` se
    // rechazan con 400 y su nombre. El servidor hashea y nunca acepta un hash del cliente.
    const parsed = await leerBody(request, UsuarioPatchSchema, 'Datos del usuario')
    if (!parsed.ok) return parsed.respuesta
    const { pin_actual, ...cambios } = parsed.datos
    const propio = id === s.usuario.id

    if (pin_actual !== undefined && !propio) {
      return Response.json(
        { error: 'pin_actual solo se usa al cambiar tu propio PIN', codigo: 'DATOS_INVALIDOS' },
        { status: 400 },
      )
    }
    // Cambio del PROPIO PIN (también del admin): exige el PIN vigente. Un PIN actual equivocado cuenta para
    // el bloqueo como un fallo de login (mismas claves y mismo 429) y responde 401 PIN_ACTUAL_INCORRECTO.
    // Cuando el admin cambia el PIN de OTRO usuario no se pide nada.
    if (cambios.pin !== undefined && propio) {
      if (pin_actual === undefined) {
        return Response.json(
          { error: 'Para cambiar tu propio PIN escribe el PIN actual', codigo: 'PIN_ACTUAL_REQUERIDO' },
          { status: 400 },
        )
      }
      const { respuesta, intento } = await iniciarIntento(s.usuario.email, ipDePeticion(request))
      if (respuesta) return respuesta
      const valido = await db.verificarPIN(s.usuario.email, pin_actual)
      if (!valido) {
        const recienBloqueado = falloIntento(intento)
        if (recienBloqueado) return recienBloqueado
        return Response.json({ error: 'El PIN actual es incorrecto', codigo: 'PIN_ACTUAL_INCORRECTO' }, { status: 401 })
      }
      await exitoIntento(intento)
    }

    // Con `pin` o `activo: false`, `actualizarUsuario` cierra las sesiones del usuario en el mismo statement
    // que el UPDATE (con `pin`, menos la actual cuando se cambia el propio PIN). F49 (14.5b-3): el actor sale
    // de la sesión; uno mismo no se desactiva ni se quita el rol admin (409 AUTO_MODIFICACION) y el último
    // admin activo no se desactiva ni pierde el rol (409 ULTIMO_ADMIN).
    const r = await db.actualizarUsuario(id, cambios, {
      actor: actorDe(s.usuario),
      conservarSesionId: propio ? s.usuario.sesion_id : null,
    })
    if (!r.ok) return respuestaCambioUsuario(r.error)
    return Response.json(r.usuario)
  } catch (error: any) {
    console.error('Update usuario error:', error)
    const message = String(error?.message ?? '')
    if (message.includes('usuarios_email_key') || message.includes('usuarios_email_norm_uk') || message.includes('duplicate key')) {
      return Response.json({ error: 'Email ya registrado' }, { status: 409 })
    }
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const s = await requireAcceso(request)
    if (!s.ok) return s.respuesta
    const p = await leerParamsRuta(params, IdRutaSchema)
    if (!p.ok) return p.respuesta
    // F49 y F50 (14.5b-3): no se borra a uno mismo, al último admin activo ni a un usuario con historial
    // (409 AUTO_MODIFICACION, ULTIMO_ADMIN, USUARIO_CON_HISTORIAL); el actor sale de la sesión.
    const r = await db.eliminarUsuario(p.datos.id, { actor: actorDe(s.usuario) })
    if (!r.ok) return respuestaCambioUsuario(r.error)
    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
