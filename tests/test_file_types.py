from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from media_workspace.file_types import detect_raw_format, is_raw_file


class FileTypesTest(unittest.TestCase):
    def test_known_extension_is_classified_as_raw(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample.CR3"
            path.write_bytes(b"not-a-real-cr3")
            self.assertEqual(detect_raw_format(path), "cr3")
            self.assertTrue(is_raw_file(path))

    def test_no_extension_cr3_signature_is_classified_as_raw(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample"
            path.write_bytes(b"\x00\x00\x00\x18ftypcrx " + b"\x00" * 64)
            self.assertEqual(detect_raw_format(path), "cr3")
            self.assertTrue(is_raw_file(path))

    def test_no_extension_tiff_with_canon_marker_is_classified_as_raw(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "sample"
            path.write_bytes(b"II*\x00" + b"\x00" * 32 + b"Canon EOS R6m2" + b"\x00" * 32)
            self.assertEqual(detect_raw_format(path), "cr2")
            self.assertTrue(is_raw_file(path))

    def test_ds_store_is_not_classified_as_raw(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / ".DS_Store"
            path.write_bytes(b"\x00\x00\x00\x01Bud1" + b"\x00" * 32)
            self.assertIsNone(detect_raw_format(path))
            self.assertFalse(is_raw_file(path))


if __name__ == "__main__":
    unittest.main()
