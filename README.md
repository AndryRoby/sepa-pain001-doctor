# SEPA pain.001 Doctor — hromadné príkazy pre slovenské banky

Live: https://arling.sk/sepa-pain001-doctor/

A free, static, client-side tool that checks a **SEPA pain.001.001.03
XML** batch payment file (hromadný príkaz na úhradu) against the
published import requirements of **Tatra banka, Slovenská sporiteľňa
(SLSP), VÚB, and ČSOB**, and points at the exact element or value that
will get the file rejected — instead of you guessing why the bank's
internet banking import screen just says "chyba" and nothing else.

## What it's for

Every one of these banks accepts "pain.001", but each one enforces a
slightly different subset of the ISO 20022 standard on top of it, and
none of them tell you which rule you broke in the rejection message.
This tool cross-checks your XML against the rules that are actually
published in each bank's own technical documentation:

- **Wrong or unrecognized schema/namespace.** Slovak banks process
  `pain.001.001.03` (`urn:iso:std:iso:20022:tech:xsd:pain.001.001.03`);
  a file exported as `pain.001.001.09` or another version by newer
  accounting software is rejected outright, or accepted only by banks
  that separately announced support for it.
- **`PmtMtd` not `TRF`, `InstrPrty` not `NORM`, `SvcLvl/Cd` not `SEPA`,
  `ChrgBr` not `SLEV`.** All four Slovak banks require these exact
  fixed values for a domestic/SEPA batch credit transfer; VÚB
  additionally flags that if you assert `SvcLvl/Cd = SEPA` and the
  payment doesn't actually qualify as SEPA, VÚB rejects and excludes
  it rather than falling back to a cross-border transfer.
- **`ReqdExctnDt` outside the accepted window — and the window
  differs by bank.** Tatra banka rejects a requested execution date
  that's in the past or **more than 31 days** in the future
  ([Tatra banka: *Prenosový formát pain.001.001.03*](https://www.tatrabanka.sk/files/sk/personal/ucet-platby/elektronicke-bankovnictvo/internet-banking/davkove-platby/prenosovy_formatpain001.pdf));
  VÚB's own limit is **max +30 days**
  ([VÚB: *Popis formátu pre SEPA úhrady – SCT*](https://app.vub.sk/source/files/vubweb/sekundarna-navigacia/informacny-servis/sepa-aplikacie/sct_klient_f.pdf)).
  A file built for one bank with a 31-day-out date is silently one
  day over the limit at the other.
- **More than 500 transactions in one file.** Tatra banka's own spec
  caps a single `PmtInf` block at 500 transactions per file — anything
  over that is rejected, not just truncated.
- **Debtor IBAN/BIC that doesn't belong to the selected bank.** Tatra
  banka requires the debtor's bank BIC to be exactly `TATRSKBX`; VÚB's
  own BIC is `SUBASKBX`. Pointing a file with the wrong bank's debit
  account at the wrong bank's import screen is a common copy-paste
  mistake between multi-bank accounting setups.
- **Creditor BIC handling differs by bank.** Tatra banka accepts a
  missing creditor BIC as long as the creditor IBAN is a valid SEPA
  IBAN (and derives/validates the BIC from it — the first 6 characters
  must match, or the payment is rejected if the derived BIC isn't in
  SEPA space); VÚB's own spec marks creditor BIC as **mandatory**
  regardless. ČSOB made it optional SEPA-wide from 1 February 2016.
  The same file can be valid at one bank and rejected at another for
  this alone.
- **Diacritics anywhere in the XML.** ČSOB explicitly documents that a
  SEPA XML file containing diacritics cannot be imported into
  BusinessBanking Lite at all, and publishes the exact allowed
  character set — plain Latin letters, digits, and
  `/ – ? : ( ) . , ' +`
  ([ČSOB: *BusinessBanking Lite a SEPA*](https://www.csob.sk/documents/11005/123723/BB_SEPA_01022016.pdf)).
  Any "š", "č", "ž", "ä" or similar in a debtor/creditor name or
  remittance line — extremely easy to leave in when the name comes
  straight out of an accounting system — breaks the import.
- **Name and remittance fields over their length limit.** Debtor and
  creditor `Nm` are capped at 70 characters; unstructured remittance
  info (`RmtInf/Ustrd`) is capped at 140 characters, and only one
  `Ustrd` instance is allowed per transaction (Tatra banka, VÚB).
- **VS/špecifický symbol/KS packed incorrectly.** `pain.001.001.03`
  has no dedicated fields for the Slovak variabilný/špecifický/
  konštantný symbol — they have to be encoded into the end-to-end
  reference as `/VS.../SS.../KS...`, in that exact order, matching the
  National Bank of Slovakia convention. ČSOB's own guidance
  specifically warns against reordering it (e.g. `/VS123/KS0308/SS14`
  instead of `/VS123/SS14/KS0308`) — a mismatch means the counterparty
  can't match the payment to an invoice even though the transfer
  itself succeeds.
- **Slovak creditor IBAN failing the domestic checksum.** For a
  creditor IBAN issued by a Slovak bank, Tatra banka additionally
  validates the last 10 digits of the BBAN against the **modulo-11**
  algorithm used domestically — a structurally valid IBAN (correct
  MOD-97 checksum) can still fail this second, Slovak-specific check.
- **Missing `<Cd>INST</Cd>` for an instant-payment batch at SLSP.**
  Slovenská sporiteľňa's Business24 only routes a payment as an
  instant transfer if `PmtTpInf/LclInstrm/Cd` is set to `INST` (at
  header or per-payment level) — payroll/accounting exports that don't
  set it are processed as ordinary SEPA transfers instead, with no
  error at all.

## Who it's for

Slovak and Czech accountants, ERP/e-shop developers, and business
owners whose accounting software (Pohoda, Money S3, KROS Omega, or a
custom export) produces a SEPA `pain.001` batch file that Tatra banka,
SLSP, VÚB, or ČSOB internet banking rejects with a vague or missing
error message.

## How it works (client-side only)

Everything runs in your browser. There is no backend, no account, and
no payment wall. You paste your `pain.001` XML (or fill in the
equivalent fields directly) and pick the target bank, and
`doctor-pain001.js` — one dependency-free JavaScript file — parses the
XML and runs a single pure function entirely in your browser, giving
you a plain-language report of what's wrong, per element, with the
bank-specific rule it violates.

Nothing about your payment file is sent anywhere — no IBANs, no
amounts, no names. The only network activity this site generates is:

- loading its own static assets (HTML/CSS/JS) from GitHub Pages,
- and anonymous product-analytics events (page view, "run check"
  clicked, etc.) sent to a self-hosted Umami instance — **event names
  and counts only, never the content of what you pasted.**

You can verify this yourself: open your browser's network tab while
using the tool, or just read `index.html` and `doctor-pain001.js` —
it's static files with no build step.

## Privacy

- No account, no login, no cookies for the tool itself.
- No server-side processing of your payment file — the "backend" is
  your own browser's JavaScript engine.
- Analytics (Umami) records that *a* check ran, not *what* was in it.
- If you're paranoid (understandable, given the subject matter),
  download the repo and open `index.html` locally with your network
  disconnected — it still works.

## Running it locally

There's no build step. It's static files.

```bash
git clone https://github.com/AndryRoby/sepa-pain001-doctor.git
cd sepa-pain001-doctor
# any static file server works, e.g.:
npx serve .
# or just open index.html directly in a browser
```

## Reporting a missing case / false positive

Found a Tatra banka / SLSP / VÚB / ČSOB pain.001 rejection this tool
doesn't catch, or a check that flags something that's actually fine?
Please open an issue on the GitHub repo with:

1. Which bank, and the exact (redacted) error the bank's internet
   banking showed.
2. The relevant part of your `pain.001` XML with IBANs, names, and
   amounts replaced by placeholders.
3. What you expected the tool to say.

Redact anything sensitive (real IBANs, names, amounts) before posting
— issues are public.

## Disclaimer

This tool is provided **as is**, with no warranty of any kind. It
checks for known, published misconfiguration patterns from each
bank's own documentation — it cannot guarantee your file will be
accepted, and a clean report is not a guarantee of a working import.
It performs a read-only, client-side analysis of the XML you paste;
nothing is verified against your live bank account or the bank's
actual import system. Tatra banka, Slovenská sporiteľňa, VÚB, and
ČSOB are not affiliated with this tool, and their import requirements
may change at any time in ways that make individual checks stale.
Always verify against each bank's current official documentation
before relying on a large or time-sensitive payment file.

## About

Built by ARLing s. r. o. (Bratislava, Slovakia).
Contact: andrej@arling.sk

Sibling tools in the same "Doctor" family:
- Supabase Auth redirects (Next.js/Vite/SvelteKit): https://arling.sk/supabase-redirect-doctor/
- Supabase Auth redirects (Flutter): https://arling.sk/flutter-supabase-doctor/
- More ARLing tools: https://arling.sk/
