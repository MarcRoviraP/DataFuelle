# Specification: Lightweight Charts Migration

## Requirements
- **Performance**: Must handle 1000+ data points without UI lag.
- **Interactivity**: 
  - Crosshair with price and date labels.
  - Horizontal panning and zooming.
  - Smooth tooltips.
- **Aesthetics**:
  - Blue area series (`#3b82f6`).
  - Gradient fill from 40% to 5% opacity.
  - Clean typography (Inter/Sans-serif).
- **Responsiveness**: Adjust to parent container width dynamically.

## Scenarios
- **Scenario 1**: User switches between fuel types (G95, G98, DSL). The chart must update the series data seamlessly.
- **Scenario 2**: User switches time periods (7d, 30d, Todo). The chart must update and fit the new time range.
- **Scenario 3**: User resizes the sidebar or window. The chart must resize instantly.
