# SEPA pain.001 Doctor

SEPA pain.001 Doctor is a free browser tool for accountants and companies whose bank rejected a SEPA `pain.001.001.03` XML batch payment file (hromadný príkaz na úhradu): it checks the file against the published import rules of Tatra banka, Slovenská sporiteľňa (SLSP), VÚB and ČSOB and points at the exact element and value that will get it rejected. The check is free; if you want the file fixed, the tool can repair addresses, country codes, IBAN spaces and totals in your browser for 29 € per file, or you can order a SEPA file check by a person for 149 €, invoiced only after delivery and paid by bank transfer.

Live: https://arling.sk/sepa-pain001-doctor/ (Slovak) · https://arling.sk/sepa-pain001-doctor/en/ (English) · https://arling.sk/sepa-pain001-doctor/de/ (German)

All four banks say they accept "pain.001." Each one enforces a different subset of fixed values, length limits, and an execution-date window on top of the same nominal schema, and none of them tell you which rule you broke when the internet-banking import screen just says "chyba." This tool cross-checks your file against what's actually written in each bank's own technical documentation.

## Free check, 29 € fix, 149 € file check

- **Free diagnosis, no limit, no account.** Paste the file, pick the bank, get every problem with its element, value and suggested fix. Nothing is uploaded.
- **Automatic fix, 29 € per file (VAT included).** When the diagnosis finds problems the tool can repair (unstructured addresses split into fields per the EPC rules for a structured address, country names turned into codes, IBANs without spaces, recalculated control totals), the page shows a preview of the changes and offers the corrected XML for 29 €. The fix runs in your browser and the file is never sent to us. It covers the one file you paid for, downloadable for 24 hours after payment. Before paying you agree to immediate delivery of digital content and acknowledge that you lose the right of withdrawal. If the file does not download after payment or is fixed wrongly, write to support@arling.sk and we fix it by hand or refund (terms, section 7). If your bank rejects the corrected file because of an error the fix changed, send us the message from your bank within 14 days and we will refund the 29 €. The fix is paid through Stripe Managed Payments: the merchant of record is Link (Sold through Link, LLC), which sends the receipt and the invoice. Try the free check and see the fix preview on your own file: https://arling.sk/sepa-pain001-doctor/en/?utm_source=github
- **SEPA file check by a person, 149 €, final price with no further fees, once, no subscription.** For errors the automatic fix cannot repair, for example a wrong bank BIC. You order through the form at https://arling.sk/kontrola-suboru/en/, we reply by e-mail with instructions for sending the file, and within 24 hours of receiving it you get the corrected file and a written report for your software vendor. You pay nothing upfront and Stripe is not used: ARLing s. r. o. invoices 149 € only after delivery, payable by bank transfer. If we do not deliver within 24 hours or cannot fix the file, there is no invoice.

Details: terms of use, section 7, https://arling.sk/podmienky/en/. Your bank decides whether it accepts a file; neither the fix nor the check guarantees acceptance.

## What it checks

`doctor-pain001.js` knows 74 distinct problem codes (counted in the engine on 25 November 2026), grouped here by where in the file they apply. Every check maps to one problem `code` in the engine.

**File / structure**
- Empty input, or XML that isn't well-formed (`xml_empty`, `xml_not_well_formed`).
- Missing `<Document>` or `<CstmrCdtTrfInitn>` root, no `<PmtInf>` block, no `<CdtTrfTxInf>` transaction (`root_missing`, `pmt_inf_missing`, `cdt_trf_tx_inf_missing`).
- Schema namespace missing, or neither `pain.001.001.03` nor `pain.001.001.09` (`schema_namespace_missing`, `schema_namespace_unexpected`).
- `pain.001.001.09` is a valid message version and is not a finding for Tatra banka, SLSP, VÚB or ČSOB: as of 19 November 2026 all four list `.09` in their import documentation (VÚB and ČSOB explicitly as allowed, next to `.03`; SLSP with a published specification; Tatra banka with samples and a table of `.09` restrictions). What the chosen bank says about `.03` and `.09` is in the checklist, with the source. Only with "another bank" does a `.09` file get a low-severity note to check the bank's documentation (`schema_namespace_09_skoro`). A second note, that `.03` should move to `.09`, is built in but switches on only once a cut-off date is set in the engine (`TERMIN_ADRESY`, today `null`), so it does not fire now (`schema_namespace_03_po_termine`).

**Group header (`GrpHdr`)**
- `MsgId` over 35 characters, or outside the SEPA character set (`msg_id_too_long`, `invalid_sepa_character`).
- `CreDtTm` not a valid ISO date/time (`cre_dt_tm_invalid_format`).
- `NbOfTxs` not equal to the actual number of `CdtTrfTxInf` elements in the file (`nb_of_txs_mismatch`): one of the most common reasons an otherwise-fine file gets rejected.
- `CtrlSum` not equal to the actual sum of `InstdAmt` across all transactions (`ctrl_sum_mismatch`).
- `InitgPty/Nm` not matching Tatra banka's documented pattern, when filled in (`initg_pty_name_pattern`). The pattern comes from Tatra banka's `pain.001.001.03` description, so it is not applied to a `.09` file (the bank does not list it for `.09`, and its own `.09` sample with all supported parameters uses `<Nm>InitgPty</Nm>`).

**Fixed values (`PmtInf` and `CdtTrfTxInf`)**
- `PmtMtd` must be `TRF` (`pmt_mtd_invalid`).
- `InstrPrty` must be `NORM`: `HIGH` gets processed as a priority, fee-bearing payment instead of standard SEPA (`instr_prty_not_norm`).
- `PmtTpInf/SvcLvl/Cd` must be `SEPA` (`svc_lvl_missing_or_invalid`).
- `ChrgBr` must be `SLEV` (`chrg_br_missing`, `chrg_br_invalid`).

**Execution date (`ReqdExctnDt`)**
- Missing, or not a valid `YYYY-MM-DD` date (`exec_date_missing`, `exec_date_invalid_format`).
- In the past (`exec_date_in_past`).
- Further ahead than the selected bank's window: **31 days** at Tatra banka, **30 days** at VÚB, a generic 31-day advisory otherwise (`exec_date_too_far_future`).
- Different across `PmtInf` blocks in the same file at Tatra banka, which requires one shared date (`exec_date_differs_across_pmtinf`).

**Batch size**
- Over 500 transactions in the whole file at Tatra banka ("Max. 500 transakcií v súbore", counted across all `PmtInf` blocks, `file_tx_count_exceeded`), or a lower-severity advisory for other banks when one `PmtInf` block has over 500 (`pmt_inf_tx_count_exceeded_generic`).
- Tatra banka and a `pain.001.001.09` file only: the restrictions in Tatra banka's table "Differences and other restrictions for Pain.001.09 compared to SEPA definitions" (Internet bankingTB batch files page, read on 19 November 2026), with element numbers as in the EPC SCT Customer-to-PSP Implementation Guidelines the bank links to: more than one `PmtInf` block (element 2.0, "Maximum 1 element", `tatra_09_pmt_inf_count`), `BtchBookg` set to `true` (element 2.3, "Batch booking is not supported", `tatra_09_batch_booking`), a hybrid creditor address, that is `AdrLine` together with structured fields in `Cdtr/PstlAdr` (element 2.118, "Use of hybrid address is not supported", `tatra_09_hybrid_address`), and `RmtInf/Strd` (element 2.166, "RemittanceInformation/Structured is not supported", `tatra_09_structured_remittance`). All four are medium severity: the bank lists the restriction but does not say what it does with a file that breaks it.
- Over 5,000 transactions total, or a file over ~1 MB (`too_many_transactions_generic`, `file_too_large`).
- An optional expected-transaction-count you supply not matching what the file actually contains, in case an export was cut short or duplicated (`expected_tx_count_mismatch`).

**Debtor (`Dbtr`)**
- `Dbtr/Nm` missing or over 70 characters, or containing diacritics/characters outside the SEPA set (`dbtr_name_missing`, `dbtr_name_too_long`, `diacritics_in_field`, `invalid_sepa_character`).
- `DbtrAcct/Id/IBAN` missing, structurally invalid (format, length for its country, MOD-97 checksum), or written with spaces (`dbtr_iban_missing`, `dbtr_iban_invalid`, `dbtr_iban_has_spaces`).
- `DbtrAgt/FinInstnId/BIC` missing, malformed, or not exactly the selected bank's own BIC: e.g. must be `TATRSKBX` at Tatra banka, `SUBASKBX` at VÚB (`dbtr_bic_missing`, `dbtr_bic_format_invalid`, `dbtr_bic_mismatch`).

**Creditor (`Cdtr`)**
- `Cdtr/Nm` missing (Tatra banka fills it with `NOTPROVIDED` instead of rejecting) or over 70 characters, or containing diacritics/invalid characters (`cdtr_name_missing`, `cdtr_name_too_long`, `diacritics_in_field`, `invalid_sepa_character`).
- `CdtrAcct/Id/IBAN` missing, structurally invalid, or outside the SEPA geographic scope (`cdtr_iban_missing`, `cdtr_iban_invalid`, `cdtr_iban_outside_sepa`).
- A Slovak creditor IBAN that passes the international MOD-97 checksum but fails the domestic **modulo-11** check on its last 10 digits (`cdtr_iban_sk_modulo11_failed`).
- `CdtrAgt/FinInstnId/BIC` handling, which genuinely differs by bank: required at VÚB (`cdtr_bic_missing_required`), derivable from a valid SEPA IBAN at Tatra banka, optional since 1 Feb 2016 at ČSOB, malformed (`cdtr_bic_format_invalid`), or not matching the bank implied by a Slovak IBAN's 4-digit bank code (`cdtr_bic_mismatch_iban`).

**Postal addresses (`PstlAdr` of debtor and creditor)**
- Address written only as free text in `AdrLine`, with no structured fields (`adresa_nestrukturovana`). The SEPA rules still allow it today, so this is a medium-severity recommendation to add at least the town (`TwnNm`) and the country code (`Ctry`); the EPC postponed the end of unstructured addresses on 9 September 2026, and on 29 October 2026 it decided not to set a new date yet; it will meet again by February 2027 to decide. Once a date is set in the engine (`TERMIN_ADRESY`), the severity rises to high.
- Structured address missing the town or the country code, the minimum of every structured and hybrid address under the EPC rules (`adresa_bez_mesta_alebo_krajiny`).
- Hybrid address with more than two `AdrLine` rows (`adresa_prilis_vela_riadkov`, low severity).
- `Ctry` that is not a two-letter ISO 3166-1 code, for example `Slovensko` instead of `SK` (`adresa_zly_kod_krajiny`, high severity).

**Amount**
- `Amt/InstdAmt` missing, in a currency other than `EUR`, not a valid number, zero or negative, or with more than 2 decimal places (`amount_missing`, `amount_currency_invalid`, `amount_format_invalid`, `amount_non_positive`).

**Payment reference (`EndToEndId`, VS/ŠS/KS)**
- `PmtId/EndToEndId` missing or over 35 characters (`end_to_end_id_missing`, `end_to_end_id_too_long`), or duplicated across transactions in the file (`duplicate_end_to_end_id`).
- An identifier that starts or ends with `/` or contains `//` (`identifier_slash_rule`, medium severity, with a corrected value to copy; the EPC text says "must not", but we have not verified that a Slovak bank rejects such a value on import, so it is not counted as a blocking error). Applies to `MsgId`, `PmtInfId`, `InstrId`, `EndToEndId` and `Id/OrgId/Othr/Id`, `Id/PrvtId/Othr/Id` of the parties, in both `pain.001.001.03` and `.09`, per the EPC SCT Customer-to-PSP Implementation Guidelines (EPC132-08, section 1.4) and the EPC clarification paper EPC230-15. Not applied to `RmtInf/Ustrd`, `CdtrRefInf/Ref` or `DbtrAgt/FinInstnId/Othr/Id`; the leading slash of the Slovak `/VS.../SS.../KS...` convention in `EndToEndId` is accepted.
- Slovak variabilný/špecifický/konštantný symbol packed as `/VS.../SS.../KS...` in the wrong order, too long for their field (VS/SS max 10 digits, KS max 4), or containing non-numeric characters (`reference_symbol_order`, `reference_symbol_too_long`, `reference_symbol_non_numeric`): the transfer itself still goes through; only automatic reconciliation on the counterparty's side breaks. The suggested value puts the symbols in the canonical order and keeps any other text after them (`/SS1/VS2/KS3/FA2026-001` becomes `/VS2/SS1/KS3/FA2026-001`); when `identifier_slash_rule` already suggests the same value for the same `EndToEndId`, the order finding carries no second, identical suggestion.

**Remittance info**
- More than one `RmtInf/Ustrd` element, or one over 140 characters, or containing diacritics/invalid characters (`rmt_inf_multiple_ustrd`, `rmt_inf_too_long`, `diacritics_in_field`).
- `Ustrd` and `Strd` in the same `RmtInf` (`rmt_inf_ustrd_and_strd`), more than one `Strd` (`rmt_inf_multiple_strd`), a `Strd` whose tags and data exceed 140 characters, not counting `<Strd>` and `</Strd>` (`rmt_inf_strd_too_long`), and a `CdtrRefInf` without both `Tp` and `Ref` or with a type other than `SCOR` (`rmt_inf_creditor_ref_incomplete`). Rules from the EPC SCT Customer-to-PSP Implementation Guidelines (EPC132-08, 2021 Version 1.0 for `pain.001.001.03`, 2025 Version 1.0 for `.09`): "Either 'Structured' or 'Unstructured' may be present", "Only one occurrence of 'Structured' is allowed" and the 140-character format rule; the Slovak SBA standard for `pain.001` (CGI, published in the SLSP and ČSOB import specifications) says the same for a SEPA credit transfer. The ISO 20022 schema itself allows both elements any number of times, which is why a schema-based import does not complain. Neither EPC nor SBA says which element takes precedence. Severity is medium, with two exceptions for Slovenská sporiteľňa and a `.09` file, where the validation column of its import specification gives a rejection reason: `Ustrd` and `Strd` together (FF01, requirement REQ-20584) and a `CdtrRefInf` with a type code but no `Ref` (RR09); both are high there. Otherwise `rmt_inf_creditor_ref_incomplete` is low, because EPC says the payer's bank does not have to validate the reference; a type in `Prtry` is reported as well. A payment tagged `PERI` (the optional EPC Extended Remittance Information service: one `Ustrd`, at most 999 `Strd` of up to 280 characters each) gets those limits only when no bank is selected: Slovenská sporiteľňa treats any `LclInstrm` other than instant as not used, and VÚB, ČSOB and Tatra banka do not list `PERI`, so with them the normal rules apply and the finding says why. When every `Strd` holds nothing but `CdtrRefInf/Ref` with Slovak payment symbols (for example `VS:202611` and `KS:0138`) and the beneficiary account is Slovak (SK IBAN), the suggested fix shows them in `EndToEndId` as `/VS202611/SS/KS0138` (the SBA standard's form within Slovakia; VÚB's example `/VS123/SS456/KS0308`, ČSOB's `/VS123/SS/KS` for empty symbols), keeps the text in `Ustrd` and drops `Strd`; XML comments in the suggestion say where each part goes. If `EndToEndId` already holds some of the symbols, the missing ones are added; if it holds different ones, or `Strd` also holds anything else (an RF reference, an invoice number in `RfrdDocInf`), or the beneficiary is outside Slovakia (where SBA does not allow a leading slash), no value is suggested, so nothing is dropped silently.

**Bank-specific**
- At SLSP: `PmtTpInf/LclInstrm/Cd` not set to `INST` for a batch meant to route as an instant payment through Business24: silently processed as an ordinary SEPA transfer instead, with no error (`slsp_instant_flag_absent`).

## What it does not do

- It is a **format/config checker**, not a live tester: it never talks to a bank, an API, or your actual account, and it doesn't know whether your account has funds or whether the creditor account exists.
- A clean ("pass") result means no rule from the list above is broken: it is not a guarantee your bank will accept the file. Banks can change their requirements at any time.
- It does not upload, store, or transmit your XML anywhere. There is no backend for the check. If you choose to have the result e-mailed to you, only your address and the finding codes with their counts are sent, never the file.
- No account and no login. The diagnosis is free; paid are only the optional automatic fix (29 €) and the separate file check by a person (149 €, invoiced after delivery).
- SLSP has no full published field-level pain.001 spec the way the other three banks do, so its checks are thinner by necessity: see the FAQ in [`llms-full.txt`](llms-full.txt) for exactly what is and isn't covered.

## How it works

`doctor-pain001.js` is one dependency-free JavaScript file. It parses the XML with a small hand-written tolerant parser (not `DOMParser`, so it behaves identically in the browser and in Node/`tests.mjs`) and runs a single pure function, `diagnose({ xml, bank })`, that walks the parsed tree and cross-checks it against the selected bank's rules. `index.html` calls this directly in your browser as `window.SepaDoctor.diagnose(config)`; nothing about the XML you paste is sent anywhere.

Real call and real output (run through `node`, bank set to `csob`, one deliberate problem: a diacritic in the creditor's name):

```js
window.SepaDoctor.diagnose({
  bank: 'csob',
  xml: `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr><NbOfTxs>1</NbOfTxs><CtrlSum>450.00</CtrlSum></GrpHdr>
    <PmtInf>
      <PmtMtd>TRF</PmtMtd>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>2026-09-04</ReqdExctnDt>
      <Dbtr><Nm>Firma s.r.o.</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>SK7875000000000000000000</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>CEKOSKBX</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>FA-2026-0912</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">450.00</InstdAmt></Amt>
        <Cdtr><Nm>Jozef Šťastný</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`
})
```

```json
{
  "status": "fail",
  "summary": "1 blokujúca chyba. Najzávažnejšie: \"Jozef Šťastný\" obsahuje diakritiku. ČSOB výslovne uvádza, že SEPA XML súbor s diakritikou sa do BusinessBanking Lite nedá importovať vôbec.",
  "bank": "csob",
  "problems": [
    {
      "code": "diacritics_in_field",
      "severity": "high",
      "message": "\"Jozef Šťastný\" obsahuje diakritiku. ČSOB výslovne uvádza, že SEPA XML súbor s diakritikou sa do BusinessBanking Lite nedá importovať vôbec.",
      "path": "CstmrCdtTrfInitn/PmtInf[1]/CdtTrfTxInf[1]/Cdtr/Nm",
      "value": "Jozef Šťastný",
      "fix": "Jozef Stastny"
    }
  ],
  "fixes": [
    {
      "title": "\"Jozef Šťastný\" obsahuje diakritiku. ČSOB výslovne uvádza, že SEPA XML súbor s diakriti…",
      "value": "Jozef Stastny",
      "where": "CstmrCdtTrfInitn/PmtInf[1]/CdtTrfTxInf[1]/Cdtr/Nm"
    }
  ]
}
```

(`problems`/`fixes` are the report shown in the UI; the full return value also carries `expected` bank-specific values, file `stats`, an advisory `checklist`, and a fixed `disclaimer` string: omitted above for length. The tool's own report messages are in Slovak; this README is in English.)

## Run locally

No build step, no dependencies. Any static file server works:

```bash
git clone https://github.com/AndryRoby/sepa-pain001-doctor.git
cd sepa-pain001-doctor
python -m http.server 8000
# then open http://localhost:8000/, or just open index.html directly in a browser
```

## Tests

```bash
node tests.mjs
```

Assertions run against `doctor-pain001.js` directly (no browser, no DOM). Last run on 26 September 2026: **171 passed, 0 failed.**

## Privacy

Everything runs client-side in your browser: there is no backend for the check or the automatic fix, no account, and nothing about the XML you paste (no IBANs, no names, no amounts) is ever sent anywhere. Only if you order the 149 € file check do you send us the file yourself, following the instructions in our e-mail; we use it only for that check and delete it at the latest 30 days after delivery. Product analytics are handled by a self-hosted Umami instance without cookies, recording only anonymous event counts (page view, "run check" clicked), never file content. The optional email signup for new-tool announcements is opt-in and unrelated to analytics. Under a real result you can also have that result e-mailed to you: it is voluntary and confirmed by a link in a first e-mail, and only your address and the finding codes with their counts (status, bank, number of payments and addresses) leave the browser, never the XML, IBANs, names or amounts; an unconfirmed request is deleted after 7 days and the address is deleted once the result is sent. Full details at https://arling.sk/privacy/en/#vysledok-emailom.

## Sources

Every bank-specific rule above is sourced from that bank's own published documentation, quoted or paraphrased inline in the engine's checks:

- Tatra banka: *Prenosový formát pain.001.001.03 v štruktúre XML*: https://www.tatrabanka.sk/files/sk/personal/ucet-platby/elektronicke-bankovnictvo/internet-banking/davkove-platby/prenosovy_formatpain001.pdf
- VÚB: *Popis formátu pre SEPA úhrady, SCT*: https://app.vub.sk/source/files/vubweb/sekundarna-navigacia/informacny-servis/sepa-aplikacie/sct_klient_f.pdf
- ČSOB: *BusinessBanking Lite a SEPA* (20.08.2015): https://www.csob.sk/documents/11005/123723/BB_SEPA_01022016.pdf
- Slovenská sporiteľňa (SLSP): Business24's own published requirement that instant SEPA routing needs `LclInstrm/Cd = INST`; SLSP does not publish a full field-level pain.001 spec the way the three banks above do, so no single PDF is cited here.
- ISO 20022 `pain.001.001.03` base schema: https://www.iso20022.org/
- EPC SEPA Credit Transfer scheme rulebook: https://www.europeanpaymentscouncil.eu/

Full citations, section by section, are in the header comment of [`doctor-pain001.js`](doctor-pain001.js) and in [`llms-full.txt`](llms-full.txt).

## Report a problem

Found a Tatra banka / SLSP / VÚB / ČSOB pain.001 rejection this tool doesn't catch, or a check that flags something that's actually fine? Open an issue: https://github.com/AndryRoby/sepa-pain001-doctor/issues, or write to support@arling.sk. Include which bank, the bank's exact (redacted) error, and the relevant part of your XML with IBANs, names, and amounts replaced by placeholders: issues are public.

## License

All rights reserved: see [`LICENSE-NOTICE.md`](LICENSE-NOTICE.md). Reading the code and learning from it is fine; deploying your own copy of it as a hosted product is not.

---

ARLing s. r. o., Bratislava, Slovakia. support@arling.sk

More free tools: https://arling.sk/

Sibling tools:
- Google OAuth redirect_uri_mismatch: https://arling.sk/google-oauth-redirect-doctor/
- Expo + Supabase Auth: https://arling.sk/expo-supabase-auth-doctor/
- Supabase Auth redirects (Next.js/Vite/SvelteKit): https://arling.sk/supabase-redirect-doctor/
- Supabase Auth redirects (Flutter): https://arling.sk/flutter-supabase-doctor/
- Expo Universal Links / App Links: https://arling.sk/expo-universal-links-doctor/
- bookapp: https://arling.sk/bookapp/

## Slovensky (skrátene)

SEPA pain.001 Doctor je bezplatný nástroj, ktorý skontroluje váš XML súbor s hromadným príkazom na úhradu (`pain.001.001.03`) oproti verejne publikovaným požiadavkám Tatra banky, Slovenskej sporiteľne, VÚB a ČSOB: a povie presne, ktorý element a hodnota spôsobí zamietnutie pri importe. Beží celé v prehliadači, nič sa nikam neposiela, nie je potrebný účet. Vyskúšať: https://arling.sk/sepa-pain001-doctor/. Nástroj nie je banka a nič neoveruje voči vášmu skutočnému účtu: čistý výsledok nie je zárukou, že banka platbu prijme. Kontrola je zadarmo; automatická oprava súboru v prehliadači stojí 29 € za súbor a kontrola súboru človekom 149 € (objednávka formulárom, faktúra až po dodaní, platba prevodom). Chybu alebo chýbajúci prípad nahláste cez GitHub issues alebo na support@arling.sk.
