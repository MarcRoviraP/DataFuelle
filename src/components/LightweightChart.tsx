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

    // Sort data by time (lightweight-charts requirement)
    const sortedData = [...data].sort((a, b) => a.time.localeCompare(b.time))
    series.setData(sortedData)
    chart.timeScale().fitContent()

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
    }
  }, [height, lineColor, topColor, bottomColor])

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      const sortedData = [...data].sort((a, b) => a.time.localeCompare(b.time))
      seriesRef.current.setData(sortedData)
      chartRef.current?.timeScale().fitContent()
    }
  }, [data])

  return (
    <div 
      ref={chartContainerRef} 
      className="w-full relative animate-in fade-in duration-500" 
      style={{ height: `${height}px` }} 
    />
  )
}
