---
quick_id: 260801-sim
status: in_progress
date: 2026-08-01
---

# Simplify the Strivo costing workbook

## Goal

Turn the current audit-heavy workbook into a clear operating model that a founder can understand and update without knowing technical vendor metrics.

## Tasks

1. Render and inspect the current four sheets before editing.
2. Keep the three scenario sheets and their core results, but hide detailed calculation columns from normal view.
3. Replace the dense fourth sheet with a compact `Simple Inputs` page containing only understandable, pre-filled assumptions.
4. Preserve formulas and scenario calculations while removing visible audit prose, source matrices, production-data tasks, and low-level vendor dimensions.
5. Recalculate in Excel, render every visible sheet, verify key outputs and formula errors, then save through the user-controlled workbook session.

## Must Haves

- Exactly four visible sheets: Worst Case, Mid Case, Best Case, Simple Inputs.
- Each scenario opens to a compact monthly summary with only useful editable inputs and outputs visible.
- The user does not need to set technical infrastructure, OCR-provider blend, allowance, or source-audit values.
- Default assumptions remain filled in and formulas continue to calculate.
- No formula errors, clipped key labels, duplicate workbook, `.gitignore` change, or committed `.planning` files.
