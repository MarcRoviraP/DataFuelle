"""Unit tests for scripts/archive_price_history.py."""

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd
import pyarrow.parquet as pq
import requests

import scripts.archive_price_history as arch


class TestArchivePriceHistory(unittest.TestCase):
    def test_normalize_frame_handles_mixed_dates_and_invalid_prices(self):
        df = pd.DataFrame([
            {"station_id": "101", "recorded_at": "2026-04-28", "price_95": 1.55, "price_98": 0.0, "price_diesel": 1.45},
            {"station_id": 101, "recorded_at": "2026-05-01T12:00:00+00:00", "price_95": 1.56, "price_98": None, "price_diesel": 1.45},
            {"station_id": 102, "recorded_at": "2026-05-01T12:00:00Z", "price_95": 0.0, "price_98": None, "price_diesel": 0.05},
            {"station_id": 103, "recorded_at": "not-a-date", "price_95": 1.50, "price_98": None, "price_diesel": 1.40},
        ])

        norm = arch.normalize_frame(df)
        self.assertEqual(len(norm), 2)
        self.assertEqual(list(norm["station_id"]), [101, 101])
        self.assertEqual(list(norm["recorded_at"]), ["2026-04-28T00:00:00Z", "2026-05-01T12:00:00Z"])
        self.assertTrue(pd.isna(norm.iloc[0]["price_98"]))

    def test_deduplicate_prices_drops_consecutive_unchanged_and_keeps_real_changes(self):
        df = arch.normalize_frame(pd.DataFrame([
            {"station_id": 10, "recorded_at": "2026-05-01T00:00:00Z", "price_95": 1.50, "price_98": None, "price_diesel": 1.40},
            {"station_id": 10, "recorded_at": "2026-05-01T12:00:00Z", "price_95": 1.50, "price_98": None, "price_diesel": 1.40},
            {"station_id": 10, "recorded_at": "2026-05-02T00:00:00Z", "price_95": 1.52, "price_98": None, "price_diesel": 1.40},
            {"station_id": 10, "recorded_at": "2026-05-02T12:00:00Z", "price_95": 1.50, "price_98": None, "price_diesel": 1.40},
            {"station_id": 20, "recorded_at": "2026-05-01T00:00:00Z", "price_95": 1.50, "price_98": None, "price_diesel": 1.40},
        ]))

        dedup = arch.deduplicate_prices(df)
        self.assertEqual(len(dedup), 4)
        s10 = dedup[dedup["station_id"] == 10]
        self.assertEqual(list(s10["price_95"]), [1.50, 1.52, 1.50])

    def test_write_and_verify_parquet_roundtrip(self):
        df = arch.normalize_frame(pd.DataFrame([
            {"station_id": 1, "recorded_at": "2026-06-01T00:00:00Z", "price_95": 1.61, "price_98": 1.75, "price_diesel": 1.49},
            {"station_id": 2, "recorded_at": "2026-06-01T00:00:00Z", "price_95": 1.59, "price_98": None, "price_diesel": 1.47},
        ]))

        with tempfile.TemporaryDirectory() as tmp_dir:
            dest = os.path.join(tmp_dir, "fuel_prices_2026.parquet")
            size = arch.write_and_verify_parquet(df, dest)
            self.assertGreater(size, 0)

            with pq.ParquetFile(dest) as pf:
                self.assertEqual(pf.metadata.num_rows, 2)
                self.assertEqual(pf.schema_arrow, arch.PARQUET_SCHEMA)
                self.assertEqual(pf.metadata.row_group(0).column(0).compression, "ZSTD")

    @patch.object(arch, "SUPABASE_KEY", "test-service-key")
    @patch.object(arch, "delete_archived_year_rows")
    @patch.object(arch, "upload_parquet")
    @patch.object(arch, "download_existing_parquet", return_value=None)
    @patch.object(arch, "fetch_rows_to_archive_rest")
    @patch.object(arch, "get_table_row_count", return_value=500000)
    def test_upload_failure_never_deletes_rows(
        self, _mock_count, mock_fetch, _mock_dl, mock_upload, mock_delete
    ):
        mock_fetch.return_value = (
            pd.DataFrame([
                {"id": 1, "station_id": 10, "recorded_at": "2026-05-01T00:00:00Z", "price_95": 1.5, "price_98": None, "price_diesel": 1.4}
            ]),
            1,
        )
        mock_upload.side_effect = requests.HTTPError("402 Payment Required")

        with patch("sys.argv", ["archive_price_history.py"]):
            with self.assertRaises(requests.HTTPError):
                arch.main()

        mock_delete.assert_not_called()

    @patch.object(arch, "SUPABASE_KEY", "test-service-key")
    @patch.object(arch, "delete_archived_year_rows")
    @patch.object(arch, "upload_parquet")
    @patch.object(arch, "download_existing_parquet", return_value=None)
    @patch.object(arch, "fetch_rows_to_archive_rest")
    @patch.object(arch, "get_table_row_count", return_value=100)
    def test_dry_run_skips_upload_and_delete(
        self, _mock_count, mock_fetch, _mock_dl, mock_upload, mock_delete
    ):
        mock_fetch.return_value = (
            pd.DataFrame([
                {"id": 1, "station_id": 10, "recorded_at": "2026-05-01T00:00:00Z", "price_95": 1.5, "price_98": None, "price_diesel": 1.4}
            ]),
            1,
        )

        with patch("sys.argv", ["archive_price_history.py", "--dry-run"]):
            rc = arch.main()

        self.assertEqual(rc, 0)
        mock_upload.assert_not_called()
        mock_delete.assert_not_called()

    @patch.object(arch, "SUPABASE_KEY", "test-service-key")
    @patch.object(arch, "delete_archived_year_rows", return_value=2)
    @patch.object(arch, "upload_parquet")
    @patch.object(arch, "download_existing_parquet")
    @patch.object(arch, "fetch_rows_to_archive_rest")
    @patch.object(arch, "get_table_row_count", return_value=100)
    def test_happy_path_merges_uploads_then_deletes(
        self, _mock_count, mock_fetch, mock_dl, mock_upload, mock_delete
    ):
        mock_dl.return_value = pd.DataFrame([
            {"station_id": 10, "recorded_at": "2026-04-28", "price_95": 1.50, "price_98": None, "price_diesel": 1.40}
        ])
        mock_fetch.return_value = (
            pd.DataFrame([
                {"id": 1, "station_id": 10, "recorded_at": "2026-05-01T00:00:00Z", "price_95": 1.50, "price_98": None, "price_diesel": 1.40},
                {"id": 2, "station_id": 10, "recorded_at": "2026-05-02T00:00:00Z", "price_95": 1.55, "price_98": None, "price_diesel": 1.40},
            ]),
            2,
        )

        with patch("sys.argv", ["archive_price_history.py"]):
            rc = arch.main()

        self.assertEqual(rc, 0)
        mock_upload.assert_called_once()
        mock_delete.assert_called_once()
        self.assertEqual(mock_delete.call_args[0][0], 2026)
        self.assertEqual(mock_delete.call_args[0][2], 2)


if __name__ == "__main__":
    unittest.main()
