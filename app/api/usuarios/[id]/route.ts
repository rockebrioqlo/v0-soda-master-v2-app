import { db } from '@/lib/db'
import { ipDePeticion, requireAcceso } from '@/lib/sesion'
import { IdRutaSchema, leerBody, leerParamsRuta } from '@/lib/validacion-http'
import { UsuarioPatchSchema } from '@/lib/usuarios-http'
import { exitoIntento, falloIntento, iniciarIntento } from '@/lib/intentos-login'

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

    // Con `pin`, `actualizarUsuario` cierra TODAS las sesiones del usuario en la misma transacción que el
    // UPDATE, menos la actual cuando se cambia el propio PIN.
    const usuario = await db.actualizarUsuario(id, cambios, {
      conservarSesionId: propio ? s.usuario.sesion_id : null,
    })
    if (!usuario) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    // Desactivar a alguien cierra todas sus sesiones al instante.
    if (usuario.activo === false) {
      await db.revocarSesionesUsuario(usuario.id)
    }
    return Response.json(usuario)
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
    const ok = await db.eliminarUsuario(p.datos.id)
    if (!ok) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete usuario error:', error)
    return Response.json({ error: 'Error en servidor' }, { status: 500 })
  }
}
