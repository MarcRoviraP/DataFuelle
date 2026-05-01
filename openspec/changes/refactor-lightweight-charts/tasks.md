# Implementation Tasks: Lightweight Charts Migration

- [x] **Phase 1: Setup**
  - [x] Install `lightweight-charts` dependency.
- [x] **Phase 2: Components**
  - [x] Create `src/components/LightweightChart.tsx`.
  - [x] Implement chart initialization and cleanup.
  - [x] Implement series creation and data updating.
  - [x] Implement responsive resizing logic.
- [x] **Phase 3: Integration**
  - [x] Update `src/components/StationCard.tsx` to use the new component.
  - [x] Map historical data to `lightweight-charts` format (time as string/number).
  - [x] Remove the old `LineChart` SVG implementation.
- [x] **Phase 4: Verification**
  - [x] Verify chart rendering with different data periods.
  - [x] Verify responsiveness.
  - [x] Verify interactive tooltips.
