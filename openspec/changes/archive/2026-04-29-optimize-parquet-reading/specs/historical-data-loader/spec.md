# Historical Data Loader Specification

## Purpose
This specification describes the requirements for the optimized loading of historical gas price data from year-partitioned Parquet files stored in Supabase Storage.

## Requirements

### Requirement: Predictive Year Selection
The system MUST be able to calculate which calendar years are required to satisfy a request for historical data spanning `N` days or starting from a specific date.

#### Scenario: Recent history (last 30 days)
- GIVEN the current date is 2026-04-29
- WHEN the user requests data for the last 30 days
- THEN the system MUST select year 2026
- AND it SHALL NOT select any other years

#### Scenario: Multi-year history
- GIVEN the current date is 2026-01-15
- WHEN the user requests data for the last 90 days
- THEN the system MUST select years 2026 and 2025

### Requirement: URL Construction
The system MUST construct public URLs for the required Parquet files using a deterministic pattern.

#### Scenario: Valid URL generation
- GIVEN the required year is 2024
- WHEN constructing the URL
- THEN the result MUST be a public URL pointing to `historical-data/fuel_prices_2024.parquet` in the Supabase Storage bucket.

### Requirement: Optimized DuckDB Query
The system MUST query only the selected Parquet files and project only the necessary columns to minimize memory usage and latency.

#### Scenario: Filtered column query
- GIVEN a list of selected year URLs
- WHEN querying DuckDB
- THEN the system MUST include only the columns `station_id`, `recorded_at`, `price_95`, `price_98`, and `price_diesel` in the SELECT statement.

### Requirement: Resilience to Missing Files
The system SHOULD NOT fail the entire request if one or more of the predicted year files are missing from the storage bucket.

#### Scenario: Missing historical year
- GIVEN a request spanning 2024 and 2025
- WHEN the file for 2024 is missing (404 Error)
- THEN the system MUST log a warning
- AND it MUST continue to load and return data from 2025
