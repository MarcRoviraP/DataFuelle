# Tasks: Optimize Parquet Reading

## Phase 1: Foundation
- [x] 1.1 Implement `getYearsForRange(days: number | null, startDate?: string): number[]` in `src/services/historicalData.ts`.
- [x] 1.2 Implement `buildParquetUrls(years: number[]): string[]` in `src/services/historicalData.ts` using deterministic template.

## Phase 2: Core Implementation
- [x] 2.1 Refactor `fetchHistoryFromParquet` in `src/services/historicalData.ts` to accept `days` and `startDate` options.
- [x] 2.2 Remove `supabase.storage.list()` and public URL generation calls from `fetchHistoryFromParquet`.
- [x] 2.3 Implement DuckDB `read_parquet` call using the predicted list of URLs.
- [x] 2.4 Update `fetchStationHistory` in `src/services/api.ts` to pass the `days` parameter to the Parquet fetcher.

## Phase 3: Verification
- [ ] 3.1 Verify single-year loading (e.g., last 30 days).
- [ ] 3.2 Verify multi-year loading (e.g., range spanning Dec-Jan).
- [ ] 3.3 Verify 404 resilience by requesting a year that doesn't exist in storage.
