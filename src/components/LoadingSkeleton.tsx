export const LoadingSkeleton = () => {
  return (
    <div className="flex flex-col gap-4 p-4 overflow-hidden">
      {[1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          className="p-4 rounded-xl border-2 border-slate-100 bg-white shadow-sm relative overflow-hidden"
        >
          {/* Shimmer effect overlay */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_2s_infinite]" />
          
          <div className="flex justify-between items-start mb-4">
            <div className="h-4 bg-slate-200 rounded-md w-2/3" />
            <div className="h-6 bg-slate-200 rounded-md w-1/4" />
          </div>
          
          <div className="flex gap-2 mb-4">
            {[1, 2, 3].map(j => (
              <div key={j} className="h-8 bg-slate-100 rounded-lg w-12" />
            ))}
          </div>
          
          <div className="space-y-2">
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-3/4" />
          </div>

          <div className="mt-4 flex justify-between items-center">
            <div className="h-6 bg-slate-100 rounded-md w-20" />
            <div className="h-8 bg-slate-200 rounded-lg w-12" />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
