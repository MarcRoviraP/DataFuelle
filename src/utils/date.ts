export const shouldShowLastUpdate = (lastUpdateStr: string): boolean => {
  if (!lastUpdateStr) return false
  const lastUpdate = new Date(lastUpdateStr)
  const now = new Date()
  const diffMs = now.getTime() - lastUpdate.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  return diffHours > 12
}

export const formatLastUpdate = (lastUpdateStr: string): string => {
  if (!lastUpdateStr) return ''
  const lastUpdate = new Date(lastUpdateStr)
  const now = new Date()
  const diffMs = now.getTime() - lastUpdate.getTime()
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMonths >= 1) return `Hace ${diffMonths} mes${diffMonths > 1 ? 'es' : ''}`
  if (diffWeeks >= 1) return `Hace ${diffWeeks} semana${diffWeeks > 1 ? 's' : ''}`
  if (diffDays >= 1) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`
  return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`
}
