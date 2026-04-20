import React, { useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAppStore } from '../store/useAppStore'
import { X, Mail, Lock, Globe, Loader2, AlertCircle, Fuel, CheckCircle2, Eye, EyeOff } from 'lucide-react'

export const AuthScreen: React.FC = () => {
  const { isAuthScreenOpen, setIsAuthScreenOpen } = useAppStore()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showPassword, setShowPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!isAuthScreenOpen) return null

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        setIsAuthScreenOpen(false)
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccess(true)
        // Wait a bit to show the success message before closing or switching
        setTimeout(() => {
          setIsLogin(true)
          setSuccess(false)
        }, 3000)
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      })
      if (error) throw error
    } catch (err: any) {
      console.error('[Google Login Error]:', err)
      setError(err.message || 'Error al conectar con Google. ¿Habilitaste el proveedor en Supabase?')
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col md:flex-row bg-white md:bg-slate-100 overflow-hidden animate-in fade-in duration-500">
      {/* Background Visual (Desktop focus) */}
      <div className="hidden md:flex flex-1 relative bg-slate-900 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-40 blur-sm scale-110">
          <img 
            src="https://images.unsplash.com/photo-1542281286-9e0a16bb7366?auto=format&fit=crop&q=80&w=2000" 
            className="w-full h-full object-cover"
            alt="Fuel Station background"
          />
        </div>
        <div className="relative z-10 p-12 max-w-lg text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-2xl shadow-blue-500/20">
              <Fuel size={32} />
            </div>
            <h1 className="text-4xl font-black tracking-tighter">DataFuelle</h1>
          </div>
          <h2 className="text-5xl font-bold mb-6 leading-tight">Ahorrá cada vez que cargues.</h2>
          <ul className="space-y-4 text-slate-300 font-medium text-lg">
            <li className="flex items-center gap-3">
              <CheckCircle2 className="text-blue-500" size={24} />
              Sincronizá tus filtros favoritos
            </li>
            <li className="flex items-center gap-3">
              <CheckCircle2 className="text-blue-500" size={24} />
              Historial de precios en tiempo real
            </li>
            <li className="flex items-center gap-3">
              <CheckCircle2 className="text-blue-500" size={24} />
              Búsquedas guardadas por ubicación
            </li>
          </ul>
        </div>
      </div>

      {/* Auth Form Card */}
      <div className="flex-1 flex flex-col relative bg-white overflow-y-auto custom-scrollbar">
        {/* Mobile Header Branding */}
        <div className="md:hidden flex items-center gap-2 p-6 pb-0">
          <div className="bg-blue-600 p-1.5 rounded-xl text-white">
            <Fuel size={18} />
          </div>
          <span className="text-lg font-black tracking-tighter text-slate-900">
            Data<span className="text-blue-600">Fuelle</span>
          </span>
        </div>

        <button 
          onClick={() => setIsAuthScreenOpen(false)}
          className="absolute top-6 right-6 md:top-8 md:right-8 p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-all active:scale-95 z-10"
        >
          <X size={24} />
        </button>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md space-y-8 animate-in slide-in-from-bottom-8 duration-700">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                {isLogin ? '¡Hola, de nuevo!' : 'Comenzá hoy'}
              </h2>
              <p className="text-slate-500 font-bold mt-2">
                {isLogin ? 'Ingresá a tu cuenta sincronizada.' : 'Crea tu perfil gratuito en segundos.'}
              </p>
            </div>

            <div className="flex bg-slate-50 p-1.5 rounded-2xl">
              <button 
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${isLogin ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Entrar
              </button>
              <button 
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${!isLogin ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Registrar
              </button>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl flex items-start gap-3 animate-in shake duration-300">
                <AlertCircle className="text-red-500 shrink-0" size={20} />
                <p className="text-red-600 text-sm font-bold">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-500">
                <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
                <div>
                  <p className="text-emerald-700 text-sm font-black">¡Registro completado!</p>
                  <p className="text-emerald-600 text-xs font-bold">Por favor, revisá tu email para confirmar la cuenta.</p>
                </div>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl transition-all outline-none font-bold text-slate-700 shadow-inner text-base"
                    placeholder="tu@email.com"
                  />
                </div>
              </div>

              {/* Added min-h for small screens visibility */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl transition-all outline-none font-bold text-slate-700 shadow-inner text-base"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-xl shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 mt-4"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <>{isLogin ? 'Entrar Ahora' : 'Crear mi Cuenta'}</>}
              </button>
            </form>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-slate-50"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-black">
                <span className="bg-white px-4 text-slate-400 tracking-widest">O</span>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full py-4 bg-white border-2 border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-sm mb-8 md:mb-0"
            >
              <Globe size={20} className="text-blue-500" />
              Iniciar con Google
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
