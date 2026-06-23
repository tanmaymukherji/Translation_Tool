# Bastar / Choknar OCR benchmark

Benchmark date: 2026-06-23

The supplied Choknar corpus was tested locally without modifying the source files. It contains a 16-page native-text report, nine handwritten-note pages, eight photographed chart-paper/table pages, and four participant-list pages.

## Baseline

- Scanned-table detection found 0 of 12 chart/participant-list table pages. Two detections on handwritten pages were false positives.
- The old native-PDF heuristic recovered 1 of 25 tables identified independently in the 16-page report.
- Hindi handwriting recognition was materially degraded by sideways pages, loose full-page segmentation, and low-confidence handwriting.

## Release 0.1.0 result

- PDF vector-grid extraction recovered 18 of the 25 report tables as editable row/column structures in the benchmark.
- Native-text PDFs remain open as selectable PDFs in the OCR validator; redundant page snapshots are not required.
- Every paragraph, including tables and native-PDF text, now supports an exact user-drawn re-scan zone.
- Zone re-scan has explicit text/handwriting and table modes. Table mode requests orientation detection and table OCR, then normalizes pipe, tab, or aligned-space output into editable cells.
- Page rotation controls allow sideways scans to be corrected before selecting a re-scan zone.

The remaining seven native-PDF tables use merged or incomplete ruling that cannot be reconstructed reliably from vector lines alone. They remain recoverable through the explicit table-zone workflow rather than being silently flattened into prose.

## Release 0.2.0 automatic OCR routing

- Scanned PDF pages and imported images now use the same OCR.space Engine 3 route as manual re-scan, with table mode, orientation detection and coordinate overlay enabled.
- A representative handwritten Hindi page returned 375 characters across 23 lines; the previous local OCR output was materially degraded.
- A representative handwritten chart-table page returned more than 800 characters. Its coordinate overlay was reconstructed as one editable three-column table block.
- The map/aerial photograph sample returned only incidental map labels and is rejected by the substantial-written-content filter.
- Detected tables in native-text PDFs are automatically sent through table OCR; the existing vector table is retained if the cloud result is unavailable or structurally weaker.
- The browser tracks daily high-quality OCR requests against the 500-request allowance and falls back to local OCR after the allowance or on service/network failure.
