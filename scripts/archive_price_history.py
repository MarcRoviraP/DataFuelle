"""
Archive old rows from public.price_history into yearly ZSTD Parquet files
stored in the Supabase Storage bucket `historical-data` (`fuel_prices_{year}.parquet`).

Safety guarantees:
- Existing yearly Parquet files are downloaded, merged, deduplicated, and verified
  before uploading.
- Rows are deleted from Postgres ONLY AFTER the updated Parquet file is successfully
  uploaded (HTTP 200).
- At least MIN_RETENTION_DAYS (7 days) are always kept in Postgres so the frontend's
  fast DB-only (< 7 days) query path always has hot data.
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://msetjsrlioiysxmgybdg.supabase.co").rstrip("/")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SECRET_KEY")
    or ""
)
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL", "")
BUCKET_NAME = os.environ.get("ARCHIVE_BUCKET", "historical-data")

MIN_RETENTION_DAYS = 7
DEFAULT_RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "30"))
DEFAULT_MAX_ROWS = int(os.environ.get("MAX_ROWS_THRESHOLD", "200000"))
PAGE_SIZE = 1000
DELETE_BATCH_SIZE = 5000

PARQUET_SCHEMA = pa.schema([
    ("station_id", pa.int64()),
    ("recorded_at", pa.string()),
    ("price_95", pa.float64()),
    ("price_98", pa.float64()),
    ("price_diesel", pa.float64()),
])


def rest_headers(extra: Optional[dict] = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def get_table_row_count() -> int:
    url = f"{SUPABASE_URL}/rest/v1/price_history?select=id"
    res = requests.head(url, headers=rest_headers({"Prefer": "count=exact"}), timeout=30)
    res.raise_for_status()
    content_range = res.headers.get("Content-Range", "")
    if "/" not in content_range:
        raise RuntimeError(f"Unexpected Content-Range header: {content_range!r}")
    return int(content_range.split("/")[-1])


def fetch_rows_to_archive_rest(cutoff_iso: str) -> tuple[pd.DataFrame, int]:
    """Fetch all price_history rows with recorded_at < cutoff_iso via keyset pagination."""
    rows: list[dict] = []
    last_id = 0
    max_id = 0

    while True:
        params = {
            "select": "id,station_id,recorded_at,price_95,price_98,price_diesel",
            "recorded_at": f"lt.{cutoff_iso}",
            "id": f"gt.{last_id}",
            "order": "id.asc",
            "limit": str(PAGE_SIZE),
        }
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/price_history",
            headers=rest_headers(),
            params=params,
            timeout=60,
        )
        res.raise_for_status()
        batch = res.json()
        if not batch:
            break

        rows.extend(batch)
        last_id = int(batch[-1]["id"])
        max_id = max(max_id, last_id)

        if len(rows) % 25000 == 0:
            print(f"  Fetched {len(rows):,} rows so far (last_id={last_id})...")

        if len(batch) < PAGE_SIZE:
            break

    if not rows:
        return pd.DataFrame(), 0

    return pd.DataFrame(rows), max_id


def fetch_rows_to_archive_pg(cutoff_iso: str) -> tuple[pd.DataFrame, int]:
    """Fast path using direct Postgres connection when SUPABASE_DB_URL is configured."""
    try:
        import psycopg
        conn = psycopg.connect(SUPABASE_DB_URL)
    except ImportError:
        import psycopg2
        conn = psycopg2.connect(SUPABASE_DB_URL)

    query = """
        SELECT id, station_id, recorded_at, price_95, price_98, price_diesel
        FROM public.price_history
        WHERE recorded_at < %s
        ORDER BY id ASC
    """
    try:
        df = pd.read_sql_query(query, conn, params=(cutoff_iso,))
    finally:
        conn.close()

    if df.empty:
        return df, 0
    return df, int(df["id"].max())


def download_existing_parquet(year: int) -> Optional[pd.DataFrame]:
    """Download fuel_prices_{year}.parquet from Storage. Returns None only on HTTP 404."""
    filename = f"fuel_prices_{year}.parquet"
    url = f"{SUPABASE_URL}/storage/v1/object/authenticated/{BUCKET_NAME}/{filename}"
    res = requests.get(
        url,
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=120,
    )
    if res.status_code == 404:
        print(f"  No existing {filename} in bucket (new year).")
        return None
    res.raise_for_status()

    table = pq.read_table(io.BytesIO(res.content))
    df = table.to_pandas()
    print(f"  Downloaded existing {filename}: {len(df):,} rows ({len(res.content) / (1024 * 1024):.2f} MB)")
    return df


def normalize_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names, types, timestamps (UTC ISO-8601), and clean invalid prices."""
    if df.empty:
        return pd.DataFrame(columns=["station_id", "recorded_at", "price_95", "price_98", "price_diesel"])

    out = df[["station_id", "recorded_at", "price_95", "price_98", "price_diesel"]].copy()
    out["station_id"] = pd.to_numeric(out["station_id"], errors="coerce")
    out = out.dropna(subset=["station_id"])
    out["station_id"] = out["station_id"].astype("int64")

    ts = pd.to_datetime(out["recorded_at"], utc=True, errors="coerce", format="mixed")
    out = out.loc[ts.notna()].copy()
    out["recorded_at"] = ts.loc[ts.notna()].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    for col in ("price_95", "price_98", "price_diesel"):
        vals = pd.to_numeric(out[col], errors="coerce")
        out[col] = vals.where(vals >= 0.1, other=pd.NA).astype("float64")

    out = out.dropna(subset=["price_95", "price_98", "price_diesel"], how="all")
    return out


def deduplicate_prices(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sort by (station_id, recorded_at), deduplicate exact timestamps, and drop
    consecutive unchanged price readings per station to keep Parquet files compact.
    """
    if df.empty:
        return df

    df = df.sort_values(["station_id", "recorded_at"], kind="mergesort")
    df = df.drop_duplicates(subset=["station_id", "recorded_at"], keep="last")

    same_station = df["station_id"] == df["station_id"].shift(1)
    same_95 = df["price_95"].eq(df["price_95"].shift(1)) | (df["price_95"].isna() & df["price_95"].shift(1).isna())
    same_98 = df["price_98"].eq(df["price_98"].shift(1)) | (df["price_98"].isna() & df["price_98"].shift(1).isna())
    same_d = df["price_diesel"].eq(df["price_diesel"].shift(1)) | (df["price_diesel"].isna() & df["price_diesel"].shift(1).isna())

    is_redundant = same_station & same_95 & same_98 & same_d
    return df.loc[~is_redundant].reset_index(drop=True)


def write_and_verify_parquet(df: pd.DataFrame, dest_path: str) -> int:
    table = pa.Table.from_pandas(df, schema=PARQUET_SCHEMA, preserve_index=False)
    pq.write_table(table, dest_path, compression="zstd", row_group_size=100_000)

    with pq.ParquetFile(dest_path) as pf:
        if pf.metadata.num_rows != len(df):
            raise RuntimeError(f"Parquet verification failed: expected {len(df)}, got {pf.metadata.num_rows}")
    return os.path.getsize(dest_path)


def upload_parquet(year: int, local_path: str) -> None:
    filename = f"fuel_prices_{year}.parquet"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{filename}"
    with open(local_path, "rb") as f:
        data = f.read()

    res = requests.post(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/octet-stream",
            "x-upsert": "true",
        },
        data=data,
        timeout=180,
    )
    res.raise_for_status()
    print(f"  Uploaded {filename} ({len(data) / (1024 * 1024):.2f} MB) -> HTTP {res.status_code}")


def delete_archived_year_rows(year: int, cutoff_iso: str, max_id: int) -> int:
    """Delete archived rows in safe batches via RPC, falling back to REST DELETE if needed."""
    total_deleted = 0
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/delete_price_history_batch"

    while True:
        res = requests.post(
            rpc_url,
            headers=rest_headers(),
            json={
                "p_year": year,
                "p_cutoff": cutoff_iso,
                "p_max_id": max_id,
                "p_batch_size": DELETE_BATCH_SIZE,
            },
            timeout=60,
        )
        if res.status_code == 404:
            print("  RPC delete_price_history_batch not found; falling back to REST DELETE...")
            return delete_archived_year_rows_rest(year, cutoff_iso, max_id)
        res.raise_for_status()
        deleted = int(res.json())
        total_deleted += deleted
        if deleted < DELETE_BATCH_SIZE:
            break

    return total_deleted


def delete_archived_year_rows_rest(year: int, cutoff_iso: str, max_id: int) -> int:
    year_start = f"{year}-01-01T00:00:00Z"
    year_end = f"{year + 1}-01-01T00:00:00Z"
    upper = min(cutoff_iso, year_end)

    params = [
        ("id", f"lte.{max_id}"),
        ("recorded_at", f"gte.{year_start}"),
        ("recorded_at", f"lt.{upper}"),
    ]
    res = requests.delete(
        f"{SUPABASE_URL}/rest/v1/price_history",
        headers=rest_headers({"Prefer": "count=exact"}),
        params=params,
        timeout=120,
    )
    res.raise_for_status()
    content_range = res.headers.get("Content-Range", "")
    if "/" in content_range and content_range.split("/")[-1].isdigit():
        return int(content_range.split("/")[-1])
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive old price_history rows to Supabase Storage Parquet files.")
    parser.add_argument("--retention-days", type=int, default=DEFAULT_RETENTION_DAYS)
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS)
    parser.add_argument("--dry-run", action="store_true", default=os.environ.get("DRY_RUN", "").lower() == "true")
    args = parser.parse_args()

    if not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.", file=sys.stderr)
        return 1

    retention_days = max(args.retention_days, MIN_RETENTION_DAYS)
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=retention_days)
    cutoff_iso = cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Checking price_history (retention={retention_days}d, max_rows={args.max_rows:,}, dry_run={args.dry_run})")
    total_rows = get_table_row_count()
    print(f"Current price_history row count: {total_rows:,}")

    if total_rows <= args.max_rows and retention_days > MIN_RETENTION_DAYS:
        print(f"Row count <= {args.max_rows:,}; archiving only rows older than {cutoff_iso}.")
    elif total_rows > args.max_rows:
        print(f"Row count exceeds threshold ({args.max_rows:,}); archiving all rows older than {cutoff_iso}.")

    if SUPABASE_DB_URL:
        print("Fetching rows via direct Postgres connection...")
        raw_df, max_id = fetch_rows_to_archive_pg(cutoff_iso)
    else:
        print("Fetching rows via Supabase REST API...")
        raw_df, max_id = fetch_rows_to_archive_rest(cutoff_iso)

    if raw_df.empty:
        print("No rows eligible for archiving. Done.")
        return 0

    print(f"Fetched {len(raw_df):,} rows to archive (max_id={max_id}).")
    new_df = normalize_frame(raw_df)
    new_df["_year"] = pd.to_datetime(new_df["recorded_at"], utc=True).dt.year

    years = sorted(new_df["_year"].unique().tolist())
    print(f"Years affected: {years}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        for year in years:
            print(f"\n--- Processing year {year} ---")
            year_new = new_df.loc[new_df["_year"] == year].drop(columns=["_year"])
            existing_df = download_existing_parquet(year)

            if existing_df is not None and not existing_df.empty:
                existing_norm = normalize_frame(existing_df)
                combined = pd.concat([existing_norm, year_new], ignore_index=True)
            else:
                combined = year_new

            before_dedup = len(combined)
            final_df = deduplicate_prices(combined)
            print(f"  Merged rows: {before_dedup:,} -> after dedup: {len(final_df):,}")

            local_path = os.path.join(tmp_dir, f"fuel_prices_{year}.parquet")
            size_bytes = write_and_verify_parquet(final_df, local_path)
            print(f"  Verified local Parquet: {size_bytes / (1024 * 1024):.2f} MB")

            if args.dry_run:
                print(f"  [DRY RUN] Skipping upload and deletion for year {year}.")
                continue

            upload_parquet(year, local_path)
            deleted = delete_archived_year_rows(year, cutoff_iso, max_id)
            print(f"  Deleted {deleted:,} archived rows from price_history for year {year}.")

    print("\nArchive run completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
