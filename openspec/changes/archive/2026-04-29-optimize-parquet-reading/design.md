# Design: Optimize Parquet Reading

## Technical Approach
We will refactor the historical data loading pipeline to bypass the Supabase Storage listing step. By leveraging the known yearly partitioning scheme, we can calculate the exact files needed for a given time window and query them directly via DuckDB.

## Architecture Decisions

### Decision: Predictive Year Resolution
**Choice**: Use a pure function to map a `days` constraint or a `startDate` to a list of years.
**Alternatives considered**: Maintaining a `manifest.json`.
**Rationale**: Calculating years from a date is zero-cost and doesn't require maintaining an external state (manifest) that could get out of sync.

### Decision: Deterministic URL Construction
**Choice**: Construct public Supabase Storage URLs using the template: `https://[PROJECT_ID].supabase.co/storage/v1/object/public/historical-data/fuel_prices_[YEAR].parquet`.
**Alternatives considered**: Using `supabase.storage.getPublicUrl()`.
**Rationale**: Construction is faster than multiple API calls. We will use the project URL from environment variables.

## Data Flow
```
1. fetchStationHistory(id, days)
   └─→ fetchHistoryFromParquet(id, days)
       ├─→ getYearsForRange(days) ──→ [2025, 2026]
       ├─→ buildParquetUrls(years) ──→ ["url_2025", "url_2026"]
       └─→ DuckDB Query: SELECT ... FROM read_parquet([urls]) WHERE station_id = id
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/services/historicalData.ts` | Modify | Implement `getYearsForRange` and refactor `fetchHistoryFromParquet` to use predictive URLs instead of `storage.list()`. |
| `src/services/api.ts` | Modify | Update `fetchStationHistory` to pass the `days` parameter to `fetchHistoryFromParquet`. |

## Interfaces / Contracts

```typescript
// src/services/historicalData.ts

export interface ParquetFetchOptions {
  idEstacion: number;
  days?: number | null;
  startDate?: string;
}

// New internal helper
const getYearsForRange = (days: number | null, startDate?: string): number[] => {
  // Logic to return array of years (e.g. [2024, 2025, 2026])
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `getYearsForRange` | Test with various offsets (cross-year, same-year, full history). |
| Integration | `fetchHistoryFromParquet` | Verify DuckDB query construction with multiple URLs. |

## Migration / Rollout
No migration required. The file naming convention remains compatible with existing Parquet files in storage.

## Open Questions
- [ ] Should we check for file existence via HEAD request before querying DuckDB to avoid 404s in the console? (Decision: No, DuckDB handles missing files in an array reasonably well, and extra HEAD requests add latency).
