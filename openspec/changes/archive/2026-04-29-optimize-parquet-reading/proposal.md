# Proposal: Optimize Parquet Reading

## Intent
The current historical data loading process is inefficient as it lists all files in Supabase Storage and performs an exhaustive scan of metadata for every request. This proposal aims to implement predictive filtering by year to significantly reduce I/O and latency.

## Scope

### In Scope
- Predictive year calculation based on the `days` parameter.
- Deterministic URL construction using the `fuel_prices_YYYY.parquet` naming convention.
- Graceful handling of missing years (fallback to listing or empty results).
- Refactoring `fetchHistoryFromParquet` to accept a `days` or `since` constraint.

### Out of Scope
- Backend Hive-style partitioning (folder restructuring).
- Merging/compaction of existing Parquet files.

## Capabilities

### New Capabilities
- `historical-data-loader`: Optimized logic for loading Parquet files selectively based on time ranges.

### Modified Capabilities
- None

## Approach
Implement a utility to calculate the required years based on the requested date range. Construct URLs directly for these years, bypassing the expensive `supabase.storage.list()` call. Use DuckDB to query only these specific files.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/services/historicalData.ts` | Modified | Implementation of predictive loading logic. |
| `src/services/api.ts` | Modified | Pass `days` parameter to the loader. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing Parquet file for a year | Low | Implement try-catch/existence check before adding to DuckDB. |
| Change in naming convention | Low | Centralize URL construction in a single helper. |

## Rollback Plan
Revert changes to `historicalData.ts` to restore the previous "list and scan all" logic.

## Dependencies
- None

## Success Criteria
- [ ] `supabase.storage.list()` is no longer called for every historical query.
- [ ] Historical data loads faster (reduced metadata overhead).
- [ ] Data integrity is maintained for multi-year requests.
