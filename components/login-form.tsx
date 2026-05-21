'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/app-context'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Delete, Loader2 } from 'lucide-react'

export function LoginForm() {
  const { login, state, isInitialized } = useApp()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already logged in
  useEffect(() => {
    if (isInitialized && state.usuarioActual) {
      redirectByRole(state.usuarioActual.rol)
    }
  }, [isInitialized, state.usuarioActual])

  const redirectByRole = (rol: string) => {
    switch (rol) {
      case 'administrador':
        router.push('/dashboard')
        break
      case 'mesero':
        router.push('/mesas')
        break
      case 'cocina':
      case 'bar':
        router.push('/kds')
        break
      case 'cajero':
        router.push('/mesas')
        break
      default:
        router.push('/dashboard')
    }
  }

  const handlePinDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit)
      setError('')
    }
  }

  const handlePinDelete = () => {
    setPin(prev => prev.slice(0, -1))
  }

  const handlePinClear = () => {
    setPin('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !pin) {
      setError('Por favor ingrese email y PIN')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await login(email, pin)
      
      if (result.success) {
        const user = state.usuarios.find(u => u.email.toLowerCase() === email.toLowerCase())
        if (user) {
          redirectByRole(user.rol)
        }
      } else {
        setError(result.message)
        setPin('')
      }
    } catch {
      setError('Error al iniciar sesión')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickLogin = (userEmail: string) => {
    setEmail(userEmail)
    setPin('')
  }

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-amber-500">Soda Master V2</h1>
        <p className="mt-2 text-muted-foreground">Sistema POS para Restaurantes</p>
      </div>

      <Card className="w-full max-w-md border-zinc-700 bg-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-center text-foreground">Iniciar Sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@soda.cl"
                className="border-zinc-600 bg-zinc-700/50 text-foreground"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">PIN</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={pin}
                  readOnly
                  placeholder="••••"
                  className="border-zinc-600 bg-zinc-700/50 text-center text-2xl tracking-widest text-foreground"
                />
              </div>
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  variant="outline"
                  className="h-14 text-xl font-semibold border-zinc-600 bg-zinc-700/30 hover:bg-amber-500/20 hover:text-amber-500"
                  onClick={() => handlePinDigit(digit.toString())}
                >
                  {digit}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-14 border-zinc-600 bg-zinc-700/30 hover:bg-red-500/20 hover:text-red-500"
                onClick={handlePinClear}
              >
                C
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 text-xl font-semibold border-zinc-600 bg-zinc-700/30 hover:bg-amber-500/20 hover:text-amber-500"
                onClick={() => handlePinDigit('0')}
              >
                0
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 border-zinc-600 bg-zinc-700/30 hover:bg-red-500/20 hover:text-red-500"
                onClick={handlePinDelete}
              >
                <Delete className="h-5 w-5" />
              </Button>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/20 p-3 text-center text-sm text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-amber-500 text-zinc-900 hover:bg-amber-400"
              disabled={loading || !email || !pin}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Ingresar'
              )}
            </Button>
          </form>

          {/* Quick access for demo */}
          <div className="mt-6 border-t border-zinc-700 pt-4">
            <p className="mb-3 text-center text-xs text-muted-foreground">Acceso rápido (demo)</p>
            <div className="flex flex-wrap justify-center gap-2">
              {state.usuarios.slice(0, 5).map((user) => (
                <Button
                  key={user.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-amber-500"
                  onClick={() => handleQuickLogin(user.email)}
                >
                  {user.nombre}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              PINs: Admin=1234, Carlos=2222, María=3333, Pedro=4444, Laura=5555
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
