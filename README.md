# Bollino Scan Tools

Helpers for reading the **Identification Number** off a pack's bollino/fustella
barcode, so you don't have to type it by hand when verifying packs on the
official site (`salute.gov.it/VerificaFustella`).

Two options:

- **`scanner-helper.html`** — a standalone offline page (below). Scan into it,
  it shows/copies the ID and keeps a progress log. No install.
- **`extension/`** — a Chrome/Edge extension that **autofills the AIC + ID
  directly on the VerificaFustella form** after a scan. See
  [`extension/README.md`](extension/README.md).

Neither tool contacts a website's verification API, solves the CAPTCHA, or
submits the form. You verify every pack yourself, one at a time.

## scanner-helper.html

A small offline helper for reading the **Identification Number** off a pack's
bollino/fustella barcode.

## What it does

- You scan a pack into the page with a USB/Bluetooth 2D scanner.
- It pulls out the Identification Number and copies it to your clipboard.
- It keeps a running log of everything scanned (with duplicate detection) and
  can export a CSV for your records.

## What it deliberately does NOT do

- It does **not** contact any website and does **not** verify authenticity.
- It does **not** and cannot bypass the CAPTCHA on the official site. You still
  submit each pack yourself and solve the CAPTCHA by hand — that control exists
  to prevent automated bulk lookups, and this tool respects it.

For a genuine bulk authenticity check of thousands of packs, the right route is
your supplier / MAH running the batch through their NMVS system, or proper
NMVS/traceability access for your own operation — not this web form.

## How the barcode maps to the form

Calibrated from confirmed pack scans:

| Barcode (example)  | Field                 | Rule                          |
|--------------------|-----------------------|-------------------------------|
| `00216917510V5F9X` | Identification Number | first **9 digits** (`002169175`) |
| —                  | AIC code              | constant `028489021` (not in the barcode) |
| `…V5F9X`           | Product signature     | constant tail — if a scan doesn't end in it, the tool warns |

> Calibrated on a single confirmed pair. Check the tool's output against the
> printed numbers on your first ~10 packs before relying on it for all 2,500.
> If you scan a different product, update the AIC and signature at the top of
> the page.

## Usage

Open `scanner-helper.html` in any browser (double-click it — no install, works
offline). Click the scan box and start scanning. Progress is saved in the
browser so a refresh won't lose it.
