import React, { useEffect, useRef } from 'react'
import { createChart, ColorType, AreaSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'

interface ChartData {
  time: string
  value: number
}

interface LightweightChartProps {
  data: ChartData[]
  height?: number
  lineColor?: string
  topColor?: string
  bottomColor?: string
}

/**
 * LightweightChart Component
 * A high-performance financial chart using TradingView's lightweight-charts.
 * Optimized for React 19 and responsive layouts.
 */
export const LightweightChart: React.FC<LightweightChartProps> = ({ 
  data, 
  height = 120,
  lineColor = '#3b82f6',
  topColor = 'rgba(59, 130, 246, 0.4)',
  bottomColor = 'rgba(59, 130, 246, 0.05)'
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    // Create chart with premium aesthetics
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
        attributionLogo: false,
      },
      localization: {
        dateFormat: 'dd MM yyyy',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.2,
          bottom: 0.2,
        },
      },
      handleScroll: false,
      handleScale: false,
      crosshair: {
        horzLine: {
          visible: true,
          labelVisible: true,
          style: 2,
          color: 'rgba(59, 130, 246, 0.5)',
        },
        vertLine: {
          visible: true,
          labelVisible: true,
          style: 2,
          color: 'rgba(59, 130, 246, 0.5)',
        },
      },
    })

    // v5 unified addSeries API
    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 3,
        minMove: 0.001,
      },
    })

    chartRef.current = chart
    seriesRef.current = series

    // Handle responsiveness
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !chartRef.current) return
      const { width } = entries[0].contentRect
      chartRef.current.applyOptions({ width })
      chartRef.current.timeScale().fitContent()
    })

    resizeObserver.observe(chartContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [height, lineColor, topColor, bottomColor])

  const currentDataRef = useRef<ChartData[]>([])
  const animationFrameRef = useRef<number | null>(null)

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      console.log('[Chart] Setting/Updating data with animation flow:', data)
      const sanitizedData = data
        .filter(item => item.time && item.value !== null && !isNaN(item.value))
        .sort((a, b) => a.time.localeCompare(b.time))
      
      const uniqueData: ChartData[] = []
      const seenTimes = new Set()
      for (let i = sanitizedData.length - 1; i >= 0; i--) {
        if (!seenTimes.has(sanitizedData[i].time)) {
          uniqueData.unshift(sanitizedData[i])
          seenTimes.add(sanitizedData[i].time)
        }
      }

      if (uniqueData.length > 0) {
        try {
          // Cancel any ongoing drawing animation
          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current)
          }

          const prevData = currentDataRef.current
          currentDataRef.current = uniqueData

          if (prevData.length === 0) {
            // First load: animate drawing from left to right (chronological growth)
            let currentIndex = 1
            const step = () => {
              if (!seriesRef.current) return
              const slice = uniqueData.slice(0, currentIndex)
              seriesRef.current.setData(slice)
              chartRef.current?.timeScale().fitContent()
              
              if (currentIndex < uniqueData.length) {
                // Determine increment step based on total length to ensure smooth animation in ~300ms
                const inc = Math.max(1, Math.ceil(uniqueData.length / 20))
                currentIndex = Math.min(uniqueData.length, currentIndex + inc)
                animationFrameRef.current = requestAnimationFrame(step)
              } else {
                animationFrameRef.current = null
              }
            }
            animationFrameRef.current = requestAnimationFrame(step)
          } else if (uniqueData.length > prevData.length) {
            // Incremental chunk load (history growing into the past, added at the beginning):
            // Animate drawing from right to left (past values flowing in)
            const addedCount = uniqueData.length - prevData.length
            let currentAddedVisible = 0
            
            const step = () => {
              if (!seriesRef.current) return
              
              // Start index retrogrades from addedCount to 0
              const startIndex = Math.max(0, addedCount - currentAddedVisible)
              const slice = uniqueData.slice(startIndex)
              seriesRef.current.setData(slice)
              chartRef.current?.timeScale().fitContent()
              
              if (currentAddedVisible < addedCount) {
                const inc = Math.max(1, Math.ceil(addedCount / 15))
                currentAddedVisible = Math.min(addedCount, currentAddedVisible + inc)
                animationFrameRef.current = requestAnimationFrame(step)
              } else {
                animationFrameRef.current = null
              }
            }
            animationFrameRef.current = requestAnimationFrame(step)
          } else {
            // Standard update without size growth
            seriesRef.current.setData(uniqueData)
            chartRef.current?.timeScale().fitContent()
          }
        } catch (err) {
          console.error('[Chart] Error updating data:', err, uniqueData)
        }
      }
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [data])

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full relative" 
      style={{ height: `${height}px` }} 
    />
  )
}
