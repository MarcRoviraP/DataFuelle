import React, { useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAppStore } from '../store/useAppStore'
import { X, Globe, AlertCircle, Fuel, CheckCircle2 } from 'lucide-react'

export const AuthScreen: React.FC = () => {
  const { isAuthScreenOpen, setIsAuthScreenOpen } = useAppStore()
  const [error, setError] = useState<string | null>(null)

  if (!isAuthScreenOpen) return null

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
          <h2 className="text-5xl font-bold mb-6 leading-tight">Ahorra cada vez que repostes.</h2>
          <ul className="space-y-4 text-slate-300 font-medium text-lg">
            <li className="flex items-center gap-3">
              <CheckCircle2 className="text-blue-500" size={24} />
              Sincroniza tus filtros favoritos
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
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                Accede a Data 
              </span>
              <span className="text-3xl font-black text-blue-600 tracking-tight">
                Fuelle
              </span>
              <p className="text-slate-500 font-bold mt-2">
                Conéctate de forma segura y rápida con tu cuenta de Google.
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl flex items-start gap-3 animate-in shake duration-300">
                <AlertCircle className="text-red-500 shrink-0" size={20} />
                <p className="text-red-600 text-sm font-bold">{error}</p>
              </div>
            )}

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
