# Bollino Scan Autofill (browser extension)

A Chrome/Edge extension that, **after you scan a pack**, autofills the **AIC**
and **Identification Number** on the official `salute.gov.it/VerificaFustella`
form. A small panel appears in the bottom-right of that page.

## What it does / does not do

- ✅ Reads the Identification Number out of the scanned barcode and fills the
  AIC + ID fields for you.
- ✅ Clears the CAPTCHA field for the new pack and puts your cursor in it.
- ❌ Never reads, guesses, or fills the CAPTCHA.
- ❌ Never clicks **Verify** / submits the form.

You still solve the CAPTCHA and submit **every pack yourself, one at a time**.
That control exists to stop automated bulk lookups, and this extension respects
it — it only removes the typing.

## Install (unpacked)

1. Download this `extension/` folder to your PC.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select this `extension/` folder.
5. Open `https://www.salute.gov.it/VerificaFustella/` — the panel appears
   bottom-right.

## Use

1. Click the **AIC / Identification Number field** area once so the page is in
   focus (or click the panel's scan box).
2. **Scan a pack.** The AIC and ID fill in automatically.
3. **Read the CAPTCHA, type it, click Verify.**
4. The form resets — scan the next pack.

Two ways to scan are supported:

- **Scan anywhere on the page** — the extension detects the scanner's fast
  keystroke burst and captures it (it also stops the scanner's trailing Enter
  from submitting the form early).
- **Scan into the panel's scan box** — a reliable fallback if the page steals
  focus.

## Settings (panel → "Settings")

- **AIC code** — the constant AIC filled on every scan (default `028489021`).
- **Product signature** — the barcode must end in this (default `V5F9X`); if a
  scan doesn't, you get a warning that it may be a different product.
- **Field selector overrides** — leave blank to auto-detect. Only fill these if
  the wrong fields get populated: right-click the field → Inspect to read its
  `id`, then enter e.g. `#theId`.

## Reminder

This does **not** verify authenticity — it only speeds up data entry. Check the
filled numbers against the printed pack for your first ~10 scans. For a true
bulk check of thousands of packs, the supplier/MAH running the batch through
their NMVS system is the faster, correct route.
