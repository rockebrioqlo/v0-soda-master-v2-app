'use client'

import { useState } from 'react'
import { useApp } from '@/lib/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Delete, Loader2 } from 'lucide-react'
import { showToast } from '@/components/toast'

export function LoginForm() {
  const { login, state, isInitialized } = useApp()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setPin(value)
    setError('')
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
        showToast('Bienvenido a Soda Master', 'success')
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
        <p className="mt-2 text-zinc-400">Sistema POS para Restaurantes</p>
      </div>

      <Card className="w-full max-w-md border-border bg-card/90 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-center text-white">Iniciar Sesion</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@soda.cl"
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">PIN</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={pin}
                  onChange={handlePinChange}
                  placeholder="----"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="border-border bg-muted text-center text-2xl tracking-widest text-foreground"
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
                  className="h-14 text-xl font-semibold border-border bg-muted/50 text-foreground hover:bg-amber-500/20 hover:text-amber-500"
                  onClick={() => handlePinDigit(digit.toString())}
                >
                  {digit}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-14 border-border bg-muted/50 text-foreground hover:bg-red-500/20 hover:text-red-500"
                onClick={handlePinClear}
              >
                C
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 text-xl font-semibold border-border bg-muted/50 text-foreground hover:bg-amber-500/20 hover:text-amber-500"
                onClick={() => handlePinDigit('0')}
              >
                0
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 border-border bg-muted/50 text-foreground hover:bg-red-500/20 hover:text-red-500"
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
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-3 text-center text-xs text-zinc-500">Acceso rapido (demo)</p>
            <div className="flex flex-wrap justify-center gap-2">
              {state.usuarios.slice(0, 5).map((user) => (
                <Button
                  key={user.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-zinc-400 hover:text-amber-500"
                  onClick={() => handleQuickLogin(user.email)}
                >
                  {user.nombre}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-zinc-500">
              PINs: Admin=1234, Carlos=2222, Maria=3333, Pedro=4444, Laura=5555
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
