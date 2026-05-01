# Design: Lightweight Charts Integration

## Architecture
- **Component**: `LightweightChart.tsx`
- **Pattern**: Container-Presentational. `StationCard` manages state and data, `LightweightChart` handles rendering.
- **Library**: `lightweight-charts` (Canvas-based).

## Implementation Details
- **Container**: A `div` with `ref` and `relative` positioning.
- **Initialization**: `useEffect` with empty dependency array to create the chart.
- **Data Updates**: `useEffect` dependent on `data` prop to update the series.
- **Resizing**: `ResizeObserver` inside the component to call `chart.resize()`.
- **Cleanup**: Return a cleanup function in `useEffect` to call `chart.remove()`.

## Visual Configuration
- **Layout**: `background: { color: 'transparent' }`, `textColor: '#64748b'`.
- **Grid**: `vertLines: { visible: false }`, `horzLines: { color: '#f1f5f9' }`.
- **Series**: `AreaSeries` with `lineColor: '#3b82f6'`, `topColor: 'rgba(59, 130, 246, 0.4)'`, `bottomColor: 'rgba(59, 130, 246, 0.05)'`.
- **Price Scale**: `borderVisible: false`, `autoScale: true`.
- **Time Scale**: `borderVisible: false`, `secondsVisible: false`.
