## Exploration: Optimize Parquet Reading

### Current State
The system currently lists all files in the `historical-data` Supabase bucket every time historical data is requested. It then passes all found URLs to DuckDB, which must scan the metadata of every file to determine if it contains data for the requested station.

### Affected Areas
- `src/services/historicalData.ts` — Contains the logic for listing files and querying DuckDB.
- `src/services/api.ts` — Calls `fetchHistoryFromParquet` with a `days` constraint that is currently ignored by the Parquet loader.

### Approaches
1. **Predictive Year Filtering** — Calculate the range of years needed based on the `days` parameter and construct URLs directly using the known naming convention (`fuel_prices_YYYY.parquet`).
   - Pros: Eliminates the need for `storage.list()`, reduces DuckDB metadata overhead, works with existing file structure.
   - Cons: Relies on a fixed naming convention.
   - Effort: Low

2. **Hive-style Partitioning** — Reorganize files into `year=YYYY/` folders.
   - Pros: Standard practice, DuckDB handles pruning automatically if pointed to a root URL.
   - Cons: Requires moving all files in Supabase Storage and updating all upload scripts.
   - Effort: Medium

3. **Manifest/Index File** — Maintain a `manifest.json` mapping station IDs to Parquet files.
   - Pros: Most surgical approach, only downloads files that actually contain the station's data.
   - Cons: Requires maintaining an index file and adding logic to the ingestion process.
   - Effort: High

### Recommendation
I recommend starting with **Predictive Year Filtering**. It provides the most immediate "bang for the buck" by eliminating the bucket listing and reducing the number of files DuckDB has to open, without requiring any changes to the storage or ingestion pipeline.

### Risks
- If the file naming convention changes, the URLs will break.
- If a year's file is missing, the query might fail if not handled gracefully.

### Ready for Proposal
Yes — The approach is clear and the implementation is straightforward.
