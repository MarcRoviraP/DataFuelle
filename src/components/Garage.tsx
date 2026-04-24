import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { CarSelector } from './CarSelector'
import { Trash2, Star, Plus, Car as CarIcon, X, Zap } from 'lucide-react'

export const Garage = ({ onClose }: { onClose: () => void }) => {
  const { userCars, selectedCarId, removeUserCar, setSelectedCarId } = useAppStore()
  const [showSelector, setShowSelector] = useState(false)

  if (showSelector) {
    return <CarSelector onClose={() => setShowSelector(false)} />
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-100">
              <Zap size={20} className="text-white" fill="white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Mi Garaje</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestiona tus vehículos</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* List of Cars */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {userCars.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                <CarIcon size={40} />
              </div>
              <div>
                <p className="font-bold text-slate-700">Tu garaje está vacío</p>
                <p className="text-xs text-slate-400 max-w-[200px] mx-auto mt-1">Añade un coche para calcular el ahorro real en cada gasolinera.</p>
              </div>
            </div>
          ) : (
            userCars.map(car => (
              <div 
                key={car.id}
                className={`relative p-5 rounded-2xl border-2 transition-all ${
                  selectedCarId === car.id 
                    ? 'border-blue-600 bg-blue-50/50 shadow-md ring-4 ring-blue-50' 
                    : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                {selectedCarId === car.id && (
                  <div className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm">
                    Predeterminado
                  </div>
                )}
                
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                      selectedCarId === car.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      <CarIcon size={24} />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 leading-tight">{car.make} {car.model}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{car.year} • {car.combustible}</p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-xs font-black text-blue-700">{car.consumo_l_100km} L/100KM</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => removeUserCar(car.id)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                    {selectedCarId !== car.id && (
                      <button 
                        onClick={() => setSelectedCarId(car.id)}
                        className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        title="Marcar como predeterminado"
                      >
                        <Star size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Add Button */}
        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <button 
            onClick={() => setShowSelector(true)}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] transition-all shadow-xl shadow-slate-200"
          >
            <Plus size={18} />
            Añadir nuevo coche
          </button>
          <p className="text-[9px] text-center text-slate-400 font-bold uppercase mt-4 tracking-tighter">
            DataFuelle usa estos datos solo para tus cálculos locales
          </p>
        </div>
      </div>
    </div>
  )
}
