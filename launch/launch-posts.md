# Launch — SEPA pain.001 Doctor (slovenské banky)

Tool: https://arling.sk/sepa-pain001-doctor/
Repo: https://github.com/AndryRoby/sepa-pain001-doctor
Researched: 2026-09-04 (WebSearch + WebFetch + GitHub search API; DuckDuckGo HTML redirected
before returning results, so DuckDuckGo queries below were run through the general web-search
tool instead — same query text, same intent).

## 1) Live-thread research — what was actually found

Rule applied throughout: **closed + last human activity older than 12 months (before
2025‑09‑04) → skip.** Beyond that literal rule, a thread is only marked **post** if replying
with this specific tool would give the poster real, on-topic help (their bank is one of the
four this tool checks, and the tool actually covers their symptom) — not just keyword overlap.

**Bottom line up front: nothing found qualifies for "post" today.** Every candidate below is
either closed/stale, hosted on a forum that has been decommissioned, or about a bank/bug class
this tool doesn't cover. That's a real finding, not a placeholder — see "Why nothing scored
post" and the fallback plan at the end.

### Slovak/Czech accounting forums (Pohoda, Money S3, KROS/Omega, general)

| Query used | What came back | Verdict |
|---|---|---|
| `pain.001 Tatra banka chyba import hromadný príkaz XML` | Only Tatra banka's own PDF spec and generic accounting-form directories (ipdf.sk). No forum thread. | skip — nothing to reply to |
| `hromadný príkaz XML chyba SLSP Business24 import` | Only SLSP's own product pages/manuals. | skip — nothing to reply to |
| `pain.001 VÚB odmietnutý súbor import chyba` | Only VÚB's own spec PDF + unrelated hits. | skip — nothing to reply to |
| `site:porada.sk hromadný príkaz XML pain` / `site:porada.sk ČSOB hromadný príkaz alfa` | Hits only under `porada.sk/archive/...` — PORADA.sk's static **archive mirror** of old threads (e.g. `t-77680.html` "Úhrada faktúr zo súkromného účtu", `t-52333.html` "Money S3 export a import skladových dokladov"). These are legacy dumps with no working "reply" UI and no visible recent-activity dates in search snippets. | skip — archived/dead, can't post into them |
| `site:kros.sk/forum XML hromadný príkaz banka`, then fetched `kros.sk/forum/hromadny-prikaz-na-uhradu/` directly | The whole `kros.sk/forum/*` path **301-redirects to `akademia.kros.sk/faq/`** — KROS retired its community forum and folded it into a static FAQ/knowledge base. There is no open thread to reply to. | skip — platform decommissioned |
| `Money S3 SEPA XML export chyba banka fórum` | Only Money S3's own KB articles (`money.sk/navod/...`), including one noting Money S3 already strips diacritics from SEPA exports — useful *context* for our copy, not a thread. | skip — no thread found |
| `KROS Omega hromadný příkaz XML export chyba` | Only KROS's own product/FAQ pages; support is routed to `servis.omega@kros.sk` (private ticketing, not a public forum). | skip — not public |
| `Pohoda fórum diskuze SEPA XML příkaz k úhradě odmítnut banka`, `"pain.001" OR "SEPA XML" fórum.stormware.cz` | No `fórum.stormware.cz` thread indexed at all; only Stormware's own docs/FAQ pages. | skip — no thread found |
| `webtrh.cz OR itnetwork.cz SEPA pain.001 XML chyba banka` | Webtrh.cz hits were all unrelated (Prestashop XML export, RSS feed, etc.) — nothing about SEPA. | skip — off-topic hits only |
| `stackoverflow pain.001 rejected bank Tatra OR VUB OR CSOB OR Slovakia` | No Stack Overflow result at all; only Wikipedia/ahrefs noise. | skip — nothing found |

### GitHub — php-sepa-xml/php-sepa-xml

Fetched the issues list directly (`?q=is%3Aissue+is%3Aopen`): **the repo currently has 0 open
issues.** All 12 most-recently-touched issues are closed (Nov 2025 – Jun 2026), and every one
is about generic PHP-library/schema topics — German DK `pain.001.001.03` compliance
(#233), Italian `PmtTpInf` removal (#244), a licence-change request (#222), UUID dev-dependency
move (#246), etc. None is a "my bank rejected my file" support question, and none is about a
Slovak bank.

| # | Title | Status | Last human activity | Verdict |
|---|---|---|---|---|
| [#233](https://github.com/php-sepa-xml/php-sepa-xml/issues/233) | pain.001.001.03 (German DK) compliance issues: cannot suppress GrpHdr/CtrlSum and invalid BIC=NOTPROVIDED | Closed | Apr 30, 2026 | skip — German bank, library-internals bug, not what this tool checks |
| [#231](https://github.com/php-sepa-xml/php-sepa-xml/issues/231) | Issue with Other-Node if there is no BIC in pain.001.001.09 CCT | Closed | Apr 30, 2026 | skip — v09 library bug, not a Slovak bank |
| [#244](https://github.com/php-sepa-xml/php-sepa-xml/issues/244) | PmtTpInf was removed in 3.0 — necessary for Italian payment system | Closed | May 27, 2026 | skip — Italian bank, library API change |
| (rest of the list: #246, #234, #232, #229, #227, #226, #225, #223, #222) | — | Closed | Nov 2025 – Jun 2026 | skip — none mention a bank rejection or Slovakia |

### GitHub — raphaelm/python-sepaxml

This repo does have open issues, so each was checked for relevance individually:

| # | Title | Status | Last update | Verdict |
|---|---|---|---|---|
| [#78](https://github.com/raphaelm/python-sepaxml/issues/78) | Pretty-printing exported XML introduces `ns0:` namespace prefix, rejected by **Volksbank** (German DK-SEPA validator) | Open | Mar 10, 2026 (only the original report — zero human replies since) | **skip.** This is a genuine "bank rejected my file" thread, but the bank is German (Volksbank/DK-SEPA), and the defect is a namespace-prefix serialization bug in Python's `ElementTree` — not one of the eleven bank-specific rules this tool checks (schema version, fixed values, execution-date window, BIC, diacritics, field lengths, VS/SS/KS, modulo-11, INST flag). Posting our link here would not actually solve this person's problem — it'd be keyword-matching, not help. |
| [#82](https://github.com/raphaelm/python-sepaxml/issues/82) | Update default schema and SepaDD to be compliant with current standard by default | Open | Aug 6, 2026 | skip — a library maintenance request, not a rejection-troubleshooting question |
| [#73](https://github.com/raphaelm/python-sepaxml/issues/73) | Comdirect compatibility | Open | Nov 10, 2025 | skip — German bank, not Slovak |
| [#72](https://github.com/raphaelm/python-sepaxml/issues/72) | Schema difference pain.001.001.03 vs .09 — `AdrTp` element | Open | Oct 13, 2025 | skip — library/schema question, no bank rejection described |
| [#66](https://github.com/raphaelm/python-sepaxml/issues/66) | Add further info to `<InitgPty>` | Open | Mar 26, 2025 | skip — feature request, stale (18 months), not a rejection |
| [#60](https://github.com/raphaelm/python-sepaxml/issues/60) | Add multiple PaymentInformation into SEPA SDD | Open | Jan 20, 2024 | skip — feature request, >2.5 years stale |
| [#58](https://github.com/raphaelm/python-sepaxml/issues/58) | Support camt.053 | Open | Jun 14, 2023 | skip — different message type, >3 years stale |

### General web (context, not threads)

- `reddit SEPA pain.001 XML rejected bank error` and a global GitHub issue-search
  (`"pain.001" rejected`, sorted by recently updated) surfaced no Slovak-bank threads at all —
  results were either vendor blog content (dev.to/Medium SEPA-generator promo posts, not
  discussions) or unrelated noise (an AI-orchestration repo's task board, a German FinTS PR
  about `comdirect`).
- Confirms the shape of the problem: SEPA pain.001 rejection troubleshooting *does* happen
  live online, but almost entirely (a) in English, about German/other EU banks, on GitHub
  issues of XML-generation libraries, or (b) inside closed channels for this tool's actual
  audience — private KROS/Pohoda support tickets, accountant Facebook groups, and Slovak
  business WhatsApp/Viber groups — none of which are search-indexed.

## Why nothing scored "post", and what to do instead

This is a narrow, Slovak-specific niche: "my accounting software's SEPA file was rejected by
*this specific* Slovak bank." The people who hit it mostly don't blog or file GitHub issues —
they call their bank's business-banking hotline or ask in a closed Facebook group. That means
the EXP-004 "reply into an existing live thread" motion doesn't have fuel today. Two honest
options, both below: **push** (Show HN, fóra/FB text, article) instead of **reply**, and set up
a standing watch so a real live thread gets a same-day reply whenever one actually appears.

**Standing watch (2 minutes to set up, zero cost):** save these searches and check them weekly
for the first month:
- Google/Bing Alerts: `"pain.001" chyba banka`, `"hromadný príkaz" XML odmietnutý`, `pain.001 Tatra banka OR SLSP OR VÚB OR ČSOB`
- GitHub: watch `php-sepa-xml/php-sepa-xml` and `raphaelm/python-sepaxml` issues for anything mentioning Slovakia/Tatra/VÚB/SLSP/ČSOB
- The moment one appears, use the reply template below — first-person, help first, link last.

**Ready-to-fire reply template** (for the first genuinely matching thread — Slovak/Czech bank,
open, real unanswered question):

> Toto som riešil nedávno pre [banka] — [1–2 vety konkrétnej pomoci k ich presnému symptómu,
> s odkazom na oficiálnu dokumentáciu banky, ak je to overiteľné]. Ak to nesedí, skús skontrolovať
> aj [ďalšie 1–2 pravidlo z tabuľky vyššie relevantné pre danú banku].
>
> Mimochodom, spravil som si na to malý bezplatný nástroj, ktorý presne toto kontroluje pre
> Tatra banku/SLSP/VÚB/ČSOB — https://arling.sk/sepa-pain001-doctor/ (nič sa neodosiela, beží
> len v prehliadači).

(English equivalent for GitHub issues: genuine technical help on their actual bug first, then
*"By the way, I built a small free checker for this — https://arling.sk/sepa-pain001-doctor/
(Slovak banks specifically, runs entirely client-side)."*)

## 2) Show HN

**Title:** Show HN: SEPA pain.001 Doctor – checks a Slovak SEPA batch file before your bank rejects it

**Text:**

> I kept watching Slovak accountants and small-business owners get a bare "chyba" (error) when
> they import a SEPA pain.001 batch payment file into Tatra banka, Slovenská sporiteľňa, VÚB,
> or ČSOB internet banking — no element, no reason, just "no."
>
> All four banks say they accept "pain.001," but each layers its own fixed values, length
> limits, and execution-date window on top of the same nominal schema. A file that's perfectly
> valid XML, and works fine at one bank, gets silently rejected at another — wrong BIC for the
> selected bank, diacritics ČSOB's importer can't handle, an execution date one day past Tatra
> banka's 31-day window vs. VÚB's 30-day window, a missing `INST` flag for SLSP instant
> payments, VS/ŠS/KS packed into the reference in the wrong order so the transfer succeeds but
> reconciliation silently fails downstream.
>
> So: SEPA pain.001 Doctor. Paste your XML, pick the bank, get back the exact element/value
> that will get it rejected, with the specific rule cited from that bank's own published spec.
> Static site, one dependency-free JS file, everything runs in your browser — nothing you paste
> is sent anywhere (there's no backend to send it to).
>
> https://arling.sk/sepa-pain001-doctor/
> Source: https://github.com/AndryRoby/sepa-pain001-doctor
>
> It's the third tool in a small "Doctor" family I've been building (Supabase Auth redirect
> checkers for web and Flutter were the first two) — same idea each time: find the specific,
> boring, undocumented rule that keeps tripping people up, and put a free checker in front of
> it instead of writing another blog post about it.

## 3) Reddit / Discord / SK fóra a FB skupiny text

*(Overte si pravidlá skupiny/fóra pred postnutím — viaceré účtovnícke FB skupiny a subreddity
majú zákaz "reklamy" alebo vyžadujú tag na vlastný produkt/self-promo flair; ak áno, označte to
tak, prípadne najprv napíšte ako odpoveď na konkrétnu otázku niekoho iného namiesto samostatného
postu.)*

**Krátky text (SK, pre účtovnícke FB skupiny/fóra):**

> Ahojte, riešil som opakovane rovnaký problém — hromadný príkaz (SEPA pain.001 XML) z Pohody/
> Money S3/KROS Omega, ktorý Tatra banka, SLSP, VÚB alebo ČSOB odmietnu s nič nehovoriacou
> chybou. Každá banka má na to trochu iné pravidlá (iné povolené BIC, iný limit na dátum
> splatnosti, ČSOB napríklad vôbec neprijme diakritiku v XML...), takže to, čo prejde v jednej
> banke, spadne v druhej.
>
> Spravil som si na to malý bezplatný nástroj — vložíte XML, vyberiete banku a dostanete presne,
> ktorý element/hodnota to spôsobuje, s odkazom na konkrétne pravidlo banky:
> https://arling.sk/sepa-pain001-doctor/
> Nič sa nikam neposiela, beží to celé len vo vašom prehliadači. Ak narazíte na chybu, ktorú
> nástroj nezachytí, napíšte mi, doplním to.

**Short text (EN, for r/Accounting / SEPA-adjacent dev communities, if relevant thread found):**

> Built a free tool that checks a SEPA pain.001 batch file against the actual published import
> rules of the four major Slovak banks (Tatra banka, SLSP, VÚB, ČSOB) before you upload it —
> catches the bank-specific stuff (wrong BIC for that bank, diacritics ČSOB's importer chokes
> on, an execution date past that bank's own window, missing instant-payment flag, etc.) that a
> generic ISO 20022 validator won't. Static, client-side, no account: https://arling.sk/sepa-pain001-doctor/

## 4) Article outline (dev.to alebo SK blog)

**Title:** *Prečo ten istý SEPA pain.001 súbor prejde v jednej banke a spadne v druhej*
(EN alt for dev.to: *One "pain.001" standard, four different Slovak banks, four different ways
to get rejected*)

1. **The setup** — every Slovak bank says "we accept SEPA pain.001." What that sentence
   actually promises (a shared XSD schema) vs. what it doesn't (any shared business-rule
   layer on top of it).
2. **The four banks, four rule sets** — walk through the concrete divergences with citations:
   Tatra banka's 500-transaction cap and 31-day execution window
   ([source](https://www.tatrabanka.sk/files/sk/personal/ucet-platby/elektronicke-bankovnictvo/internet-banking/davkove-platby/prenosovy_formatpain001.pdf)),
   VÚB's 30-day window and mandatory creditor BIC
   ([source](https://app.vub.sk/source/files/vubweb/sekundarna-navigacia/informacny-servis/sepa-aplikacie/sct_klient_f.pdf)),
   ČSOB's diacritics ban and optional-since-2016 creditor BIC
   ([source](https://www.csob.sk/documents/11005/123723/BB_SEPA_01022016.pdf)), SLSP's
   `INST` flag for instant payments.
3. **The silent failures are the dangerous ones** — a wrong VS/ŠS/KS order doesn't reject the
   file at all; the transfer succeeds and the counterparty just can't reconcile it. Contrast
   with the loud failures (schema mismatch, BIC mismatch) that at least tell you something's
   wrong.
4. **Why your accounting software can't fully solve this for you** — Pohoda/Money S3/KROS
   Omega generate valid pain.001 XML against the *schema*; they don't (and can't reasonably)
   encode every target bank's business-rule quirks, especially ones that change over time
   (e.g. ČSOB's Feb 2016 BIC change).
5. **What I built** — SEPA pain.001 Doctor, why it's static/client-side/no-account, and how the
   checks map 1:1 to the citations above (link the repo so the rules are auditable, not just
   asserted).
6. **Open call** — if you've hit a Slovak-bank pain.001 rejection this tool doesn't explain,
   here's how to report it (link to the README's "reporting a missing case" section) — this
   doubles as the standing live-thread watch from section 1.

## Files referenced

- README's "reporting a missing case" section: `../README.md`
- Bank-rule citations used above are the same ones already cited in `../README.md` and
  `../llms-full.txt` — reused here rather than re-verified, since they were already sourced
  from each bank's own documentation for the tool's engine.
