export const LoadingSkeleton = () => {
  return (
    <div className="animate-pulse flex flex-col gap-4 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-32 bg-slate-200 rounded-xl" />
      ))}
    </div>
  )
}
