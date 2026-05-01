# Proposal: Migrate to Lightweight Charts

## Intent
Replace the manual SVG-based `LineChart` in `StationCard.tsx` with a robust, high-performance charting library (`lightweight-charts`) to better handle massive datasets and provide a more premium, interactive experience.

## Scope
- Install `lightweight-charts`.
- Create a new reusable `LightweightChart` component.
- Integrate the new component into `StationCard.tsx`.
- Ensure parity with existing features (fuel type selection, time period tabs, price formatting).

## Approach
- Use `lightweight-charts` by TradingView.
- Implement an `AreaSeries` to maintain the "blue gradient" aesthetic.
- Use `ResizeObserver` for responsive layout handling.
- Preserve the existing data fetching logic in `StationCard.tsx`.

## Tradeoffs
- **Pros**: Much better performance, professional interactivity (panning, scaling), easier to maintain than custom SVG.
- **Cons**: Adds a new dependency (~40KB gzipped).
