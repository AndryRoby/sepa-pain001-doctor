// tests.mjs — plain Node test runner for doctor-pain001.js (no external dependencies).
// Run with: node tests.mjs

import { readFileSync } from 'node:fs';
import { diagnose, TERMIN_ADRESY, expectedValues, popisPolohy, vytvorPolohy } from './doctor-pain001.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  }
}

function eq(name, actual, expected) {
  const condition = actual === expected;
  ok(name, condition, condition ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function has(name, arr, code) {
  const condition = Array.isArray(arr) && arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `expected a problem with code "${code}", got codes [${(arr || []).map((p) => p.code).join(', ')}]`);
}

function lacks(name, arr, code) {
  const condition = Array.isArray(arr) && !arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `did not expect a problem with code "${code}"`);
}

function severityOf(arr, code) {
  const p = (arr || []).find((x) => x.code === code);
  return p ? p.severity : undefined;
}

function fixOf(arr, code) {
  const p = (arr || []).find((x) => x.code === code);
  return p ? p.fix : undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// XML fixture builder — assembles a pain.001.001.03 file from a plain JS
// spec so each test can clone + mutate one field in isolation, the same way
// the sibling Doctor tools clone + mutate a JSON config.
// ─────────────────────────────────────────────────────────────────────────

const NS = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

// Dni sa počítajú od DNES_PRED, nie od skutočných hodín: diagnose() dostáva
// ten istý dátum v cfg.dnes, takže test dopadne rovnako dnes aj o rok.
const DNES_PRED = '2026-10-01';
const DNES_PO = '2026-11-20';

function daysFromNowIso(n, zaklad) {
  const d = new Date((zaklad || DNES_PRED) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildTx(tx) {
  let s = '<CdtTrfTxInf><PmtId>';
  if (tx.endToEndId !== undefined && tx.endToEndId !== null) s += `<EndToEndId>${tx.endToEndId}</EndToEndId>`;
  s += '</PmtId>';
  if (tx.instrPrty !== undefined || tx.svcLvl !== undefined) {
    s += '<PmtTpInf>';
    if (tx.instrPrty) s += `<InstrPrty>${tx.instrPrty}</InstrPrty>`;
    if (tx.svcLvl) s += `<SvcLvl><Cd>${tx.svcLvl}</Cd></SvcLvl>`;
    if (tx.lclInstrm) s += `<LclInstrm><Cd>${tx.lclInstrm}</Cd></LclInstrm>`;
    s += '</PmtTpInf>';
  } else if (tx.lclInstrm) {
    s += `<PmtTpInf><LclInstrm><Cd>${tx.lclInstrm}</Cd></LclInstrm></PmtTpInf>`;
  }
  if (tx.amount !== undefined && tx.amount !== null) {
    s += `<Amt><InstdAmt Ccy="${tx.ccy !== undefined ? tx.ccy : 'EUR'}">${tx.amount}</InstdAmt></Amt>`;
  }
  if (tx.chrgBr !== undefined && tx.chrgBr !== null) s += `<ChrgBr>${tx.chrgBr}</ChrgBr>`;
  if (tx.cdtrBic !== undefined) s += `<CdtrAgt><FinInstnId>${tx.cdtrBic ? `<BIC>${tx.cdtrBic}</BIC>` : ''}</FinInstnId></CdtrAgt>`;
  if (tx.cdtrNm !== undefined && tx.cdtrNm !== null) s += `<Cdtr><Nm>${tx.cdtrNm}</Nm></Cdtr>`;
  if (tx.cdtrIban !== undefined && tx.cdtrIban !== null) s += `<CdtrAcct><Id><IBAN>${tx.cdtrIban}</IBAN></Id></CdtrAcct>`;
  if (tx.ustrd !== undefined) {
    const list = Array.isArray(tx.ustrd) ? tx.ustrd : [tx.ustrd];
    s += '<RmtInf>' + list.map((u) => `<Ustrd>${u}</Ustrd>`).join('') + '</RmtInf>';
  }
  s += '</CdtTrfTxInf>';
  return s;
}

function buildPmtInf(pi) {
  let s = '<PmtInf>';
  if (pi.pmtInfId !== undefined && pi.pmtInfId !== null) s += `<PmtInfId>${pi.pmtInfId}</PmtInfId>`;
  if (pi.pmtMtd !== undefined && pi.pmtMtd !== null) s += `<PmtMtd>${pi.pmtMtd}</PmtMtd>`;
  if (pi.instrPrty !== undefined || pi.svcLvl !== undefined) {
    s += '<PmtTpInf>';
    if (pi.instrPrty) s += `<InstrPrty>${pi.instrPrty}</InstrPrty>`;
    if (pi.svcLvl) s += `<SvcLvl><Cd>${pi.svcLvl}</Cd></SvcLvl>`;
    s += '</PmtTpInf>';
  }
  if (pi.reqdExctnDt !== undefined && pi.reqdExctnDt !== null) s += `<ReqdExctnDt>${pi.reqdExctnDt}</ReqdExctnDt>`;
  if (pi.dbtrNm !== undefined && pi.dbtrNm !== null) s += `<Dbtr><Nm>${pi.dbtrNm}</Nm></Dbtr>`;
  if (pi.dbtrIban !== undefined && pi.dbtrIban !== null) s += `<DbtrAcct><Id><IBAN>${pi.dbtrIban}</IBAN></Id></DbtrAcct>`;
  if (pi.dbtrBic !== undefined) s += `<DbtrAgt><FinInstnId>${pi.dbtrBic ? `<BIC>${pi.dbtrBic}</BIC>` : ''}</FinInstnId></DbtrAgt>`;
  if (pi.chrgBr !== undefined && pi.chrgBr !== null) s += `<ChrgBr>${pi.chrgBr}</ChrgBr>`;
  s += (pi.tx || []).map(buildTx).join('');
  s += '</PmtInf>';
  return s;
}

function buildPain001(spec) {
  const ns = spec.namespace !== undefined ? spec.namespace : NS;
  const nsAttr = ns ? ` xmlns="${ns}"` : '';
  let grpHdr = '<GrpHdr>';
  if (spec.msgId !== undefined && spec.msgId !== null) grpHdr += `<MsgId>${spec.msgId}</MsgId>`;
  if (spec.creDtTm !== undefined && spec.creDtTm !== null) grpHdr += `<CreDtTm>${spec.creDtTm}</CreDtTm>`;
  if (spec.nbOfTxs !== undefined && spec.nbOfTxs !== null) grpHdr += `<NbOfTxs>${spec.nbOfTxs}</NbOfTxs>`;
  if (spec.ctrlSum !== undefined && spec.ctrlSum !== null) grpHdr += `<CtrlSum>${spec.ctrlSum}</CtrlSum>`;
  if (spec.initgPtyNm !== undefined && spec.initgPtyNm !== null) grpHdr += `<InitgPty><Nm>${spec.initgPtyNm}</Nm></InitgPty>`;
  grpHdr += '</GrpHdr>';
  const pmtInfXml = (spec.pmtInf || []).map(buildPmtInf).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Document${nsAttr}><CstmrCdtTrfInitn>${grpHdr}${pmtInfXml}</CstmrCdtTrfInitn></Document>`;
}

// Valid SK IBANs (verified against MOD-97 + the domestic modulo-11 check on
// the last 10 digits — see the file header of doctor-pain001.js) for each
// bank's 4-digit domestic bank code: 1100=Tatra banka, 0900=SLSP,
// 0200=VUB, 7500=ČSOB.
const DEBTOR_IBAN = {
  tatrabanka: 'SK2811000000000000000000',
  slsp: 'SK8109000000000000000000',
  vub: 'SK2402000000000000000000',
  csob: 'SK7875000000000000000000',
};
const BANK_BIC = { tatrabanka: 'TATRSKBX', slsp: 'GIBASKBX', vub: 'SUBASKBX', csob: 'CEKOSKBX' };
// Creditor IBAN at VUB (bank code 0200) whose last-10-digit base (2000000018)
// passes the modulo-11 check, used as the default "other side" account.
const CREDITOR_IBAN_VUB = 'SK0502000000272000000018';
// Same shape but with the base ending in 1 instead of 8 → fails modulo-11
// while the IBAN itself still passes the international MOD-97 checksum.
const CREDITOR_IBAN_VUB_MOD11_FAIL = 'SK7602000000272000000001';
const NON_SEPA_IBAN = 'TN5910006035183598478831'; // Tunisia — valid IBAN format/checksum, not in SEPA

function withBank(spec, bankKey) {
  const s = clone(spec);
  s.pmtInf[0].dbtrBic = BANK_BIC[bankKey];
  s.pmtInf[0].dbtrIban = DEBTOR_IBAN[bankKey];
  return s;
}

function manyTx(count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    out.push({ endToEndId: 'E2E-' + k, amount: '1.00', ccy: 'EUR', cdtrNm: 'Prijemca', cdtrIban: CREDITOR_IBAN_VUB, cdtrBic: 'SUBASKBX' });
  }
  return out;
}

const PASS_SPEC = {
  namespace: NS,
  msgId: 'MSG-0001',
  creDtTm: '2026-09-04T09:00:00',
  nbOfTxs: 1,
  ctrlSum: '450.00',
  pmtInf: [
    {
      pmtInfId: 'PMT-0001',
      pmtMtd: 'TRF',
      instrPrty: 'NORM',
      svcLvl: 'SEPA',
      chrgBr: 'SLEV',
      reqdExctnDt: daysFromNowIso(5),
      dbtrNm: 'Firma s.r.o.',
      dbtrIban: DEBTOR_IBAN.tatrabanka,
      dbtrBic: 'TATRSKBX',
      tx: [
        {
          endToEndId: '/VS123/SS456/KS0308',
          amount: '450.00',
          ccy: 'EUR',
          cdtrNm: 'Jozef Novak',
          cdtrIban: CREDITOR_IBAN_VUB,
          cdtrBic: 'SUBASKBX',
          ustrd: 'Faktura c. 2026-0912',
        },
      ],
    },
  ],
};

// The structured-address deadline (TERMIN_ADRESY) would change both the
// expected message version and the severity of address findings, so every
// test pins the date instead of reading the clock. Since 24. 9. 2026
// TERMIN_ADRESY is null: the EPC postponed the 15. 11. 2026 end of the
// unstructured address on 9. 9. 2026; on 29. 10. 2026 the PSMB decided not to
// set a new date yet and will meet again by February 2027 to decide on one.
// The pinned dates stay, so the suite is ready once a new date is set.
function run(spec, bank, expectedTxCount, dnes) {
  return diagnose({
    xml: buildPain001(spec),
    bank,
    expectedTxCount: expectedTxCount === undefined ? null : expectedTxCount,
    dnes: dnes || DNES_PRED,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 0. Baseline — a clean, valid file must come back "pass" with zero problems
// ─────────────────────────────────────────────────────────────────────────

{
  const r = run(PASS_SPEC, 'tatrabanka');
  eq('baseline: status is pass', r.status, 'pass');
  eq('baseline: zero problems', r.problems.length, 0);
  eq('baseline: stats.txCount', r.stats.txCount, 1);
  eq('baseline: stats.sum', r.stats.sum, '450.00');
  ok('baseline: disclaimer present', typeof r.disclaimer === 'string' && r.disclaimer.length > 20);
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Input / structural
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ xml: '', bank: 'tatrabanka' });
  eq('empty xml: status fail', r.status, 'fail');
  has('empty xml: reports xml_empty', r.problems, 'xml_empty');
}
{
  const r = diagnose({ xml: '<Foo><Bar/></Foo>', bank: 'tatrabanka' });
  has('missing <Document>: reports root_missing', r.problems, 'root_missing');
  eq('missing <Document>: severity high', severityOf(r.problems, 'root_missing'), 'high');
}
{
  const full = buildPain001(PASS_SPEC);
  const truncated = full.slice(0, full.indexOf('</GrpHdr>')); // cuts off mid-document
  const r = diagnose({ xml: truncated, bank: 'tatrabanka' });
  has('truncated XML: reports xml_not_well_formed', r.problems, 'xml_not_well_formed');
}
{
  const spec = clone(PASS_SPEC);
  spec.namespace = null;
  const r = run(spec, 'tatrabanka');
  has('missing xmlns: reports schema_namespace_missing', r.problems, 'schema_namespace_missing');
}
{
  const spec = clone(PASS_SPEC);
  spec.namespace = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09';
  // .09 is a valid message version, not an error. Since 19. 11. 2026 only an
  // unknown ("generic") bank gets a low note; the four Slovak banks publish
  // .09 import descriptions, so for them there is no note at all (see the
  // block "verzia .09" at the end of this file).
  const r = run(spec, 'generic');
  lacks('pain.001.001.09 pred termínom: nie je to chyba', r.problems, 'schema_namespace_unexpected');
  has('pain.001.001.09 pred termínom, iná banka: len poznámka', r.problems, 'schema_namespace_09_skoro');
  eq('pain.001.001.09 pred termínom: nízka závažnosť', severityOf(r.problems, 'schema_namespace_09_skoro'), 'low');
  ok('pain.001.001.09: poznámka nesľubuje dátum prechodu',
    JSON.stringify(r.problems).indexOf('15. 11. 2026') === -1);
  lacks('pain.001.001.09, Tatra banka: bez poznámky', run(spec, 'tatrabanka').problems, 'schema_namespace_09_skoro');

  // Zmena 24. 9. 2026: pôvodne test čakal, že po 15. 11. 2026 poznámka zmizne
  // a očakávaná verzia sa prepne na .09. EPC 9. 9. 2026 termín odložila
  // (TERMIN_ADRESY je null), preto sa 20. 11. 2026 nemení nič.
  const rPo = run(spec, 'generic', null, DNES_PO);
  has('pain.001.001.09 po 15. 11. 2026: bez termínu EPC stále len poznámka', rPo.problems, 'schema_namespace_09_skoro');
  lacks('pain.001.001.09 po 15. 11. 2026: bez chyby', rPo.problems, 'schema_namespace_unexpected');
  // Oprava 19. 11. 2026 (brána sepa-09, N1): pri súbore .09 sa očakáva .09,
  // nie .03; štyri banky uvádzajú obe verzie.
  eq('pain.001.001.09 po 15. 11. 2026: očakávaný menný priestor je verzia súboru (.09)',
    rPo.expected.schemaNamespace, 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09');
}
{
  // .03 is fine today. Keby EPC určila nový termín, po ňom by prišlo
  // upozornenie "over si verziu v banke", nikdy tvrdá chyba: termín SEPA
  // hovorí o adrese, verziu správy si určuje každá banka sama.
  const spec = clone(PASS_SPEC);
  const r = run(spec, 'tatrabanka');
  lacks('pain.001.001.03 pred termínom: bez výhrady', r.problems, 'schema_namespace_03_po_termine');

  // Zmena 24. 9. 2026: pôvodne test čakal upozornenie po 15. 11. 2026. Termín
  // EPC odložila (TERMIN_ADRESY je null), preto upozornenie neprichádza.
  const rPo = run(spec, 'tatrabanka', null, DNES_PO);
  lacks('pain.001.001.03 po 15. 11. 2026: bez termínu EPC bez výhrady', rPo.problems, 'schema_namespace_03_po_termine');
  eq('pain.001.001.03 po 15. 11. 2026: očakávaný menný priestor ostáva .03',
    rPo.expected.schemaNamespace, 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
}

// ─────────────────────────────────────────────────────────────────────────
// 2. GrpHdr
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  spec.nbOfTxs = 2;
  const r = run(spec, 'tatrabanka');
  has('NbOfTxs mismatch: reports nb_of_txs_mismatch', r.problems, 'nb_of_txs_mismatch');
  eq('NbOfTxs mismatch: severity high', severityOf(r.problems, 'nb_of_txs_mismatch'), 'high');
  eq('NbOfTxs mismatch: fix suggests actual count', fixOf(r.problems, 'nb_of_txs_mismatch'), '1');
}
{
  const spec = clone(PASS_SPEC);
  spec.ctrlSum = '999.00';
  const r = run(spec, 'tatrabanka');
  has('CtrlSum mismatch: reports ctrl_sum_mismatch', r.problems, 'ctrl_sum_mismatch');
  eq('CtrlSum mismatch: fix suggests actual sum', fixOf(r.problems, 'ctrl_sum_mismatch'), '450.00');
}
{
  const spec = clone(PASS_SPEC);
  spec.msgId = 'M'.repeat(35);
  const r1 = run(spec, 'tatrabanka');
  lacks('MsgId 35 chars: no msg_id_too_long (boundary pass)', r1.problems, 'msg_id_too_long');
  spec.msgId = 'M'.repeat(36);
  const r2 = run(spec, 'tatrabanka');
  has('MsgId 36 chars: reports msg_id_too_long (boundary fail)', r2.problems, 'msg_id_too_long');
  eq('MsgId too long: severity medium', severityOf(r2.problems, 'msg_id_too_long'), 'medium');
}
{
  const spec = clone(PASS_SPEC);
  spec.initgPtyNm = 'ABC1234567/SK';
  const r1 = run(spec, 'tatrabanka');
  lacks('InitgPty/Nm matching TB pattern: no problem', r1.problems, 'initg_pty_name_pattern');
  spec.initgPtyNm = 'Firma XYZ Ltd';
  const r2 = run(spec, 'tatrabanka');
  has('InitgPty/Nm not matching TB pattern: reports initg_pty_name_pattern', r2.problems, 'initg_pty_name_pattern');
  eq('InitgPty pattern: severity low', severityOf(r2.problems, 'initg_pty_name_pattern'), 'low');
  const r3 = run(clone(spec), 'vub');
  lacks('InitgPty pattern only enforced for Tatra banka', r3.problems, 'initg_pty_name_pattern');
}

// ─────────────────────────────────────────────────────────────────────────
// 3. PmtInf level
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].pmtMtd = 'DD';
  const r = run(spec, 'tatrabanka');
  has('PmtMtd != TRF: reports pmt_mtd_invalid', r.problems, 'pmt_mtd_invalid');
  eq('PmtMtd fix is TRF', fixOf(r.problems, 'pmt_mtd_invalid'), 'TRF');
}
// Z-46: Tatra banka píše "Max. 500 transakcií v súbore" (PDF strana 3), teda
// limit za celý súbor. Syntetický IBAN príjemcu: VÚB 0200, účet z núl a 27
// (modulo 11 prejde), kontrolné číslice vypočítané.
function syntetickyIban(krajina, bban) {
  const cisla = (bban + krajina + '00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let zvysok = 0;
  for (const c of cisla) zvysok = (zvysok * 10 + Number(c)) % 97;
  return krajina + String(98 - zvysok).padStart(2, '0') + bban;
}
const SYNT_IBAN_VUB = syntetickyIban('SK', '0200' + '000000' + '0000000027');
function syntTx(count, od) {
  const out = [];
  for (let k = 0; k < count; k++) {
    out.push({ endToEndId: 'E2E-' + ((od || 0) + k), amount: '1.00', ccy: 'EUR', cdtrNm: 'Prijemca', cdtrIban: SYNT_IBAN_VUB, cdtrBic: 'SUBASKBX' });
  }
  return out;
}
function limitSpec(bloky) {
  const spec = clone(PASS_SPEC);
  const vzor = spec.pmtInf[0];
  let od = 0;
  spec.pmtInf = bloky.map((n, i) => {
    const b = clone(vzor);
    b.pmtInfId = 'PMT-' + (i + 1);
    b.tx = syntTx(n, od);
    od += n;
    return b;
  });
  spec.nbOfTxs = od;
  spec.ctrlSum = od + '.00';
  return spec;
}
const kodyZ = (r) => r.problems.map((p) => p.code);
{
  eq('synthetic creditor IBAN is computed', SYNT_IBAN_VUB.length, 24);
  const r = run(limitSpec([300, 300]), 'tatrabanka');
  has('2 blocks x 300 at Tatra banka: reports file_tx_count_exceeded', r.problems, 'file_tx_count_exceeded');
  eq('2 x 300: severity high', severityOf(r.problems, 'file_tx_count_exceeded'), 'high');
  eq('2 x 300: status fail', r.status, 'fail');
  ok('2 x 300: message names 600 and the per-file limit', /600/.test(r.problems.find((p) => p.code === 'file_tx_count_exceeded').message) && /súbore/.test(r.problems.find((p) => p.code === 'file_tx_count_exceeded').message));
  const rEn = diagnose({ xml: buildPain001(limitSpec([300, 300])), bank: 'tatrabanka', lang: 'en', dnes: DNES_PRED });
  ok('2 x 300: English message says per file', /500 transactions in one file/.test(rEn.problems.find((p) => p.code === 'file_tx_count_exceeded').message));
  const rDe = diagnose({ xml: buildPain001(limitSpec([300, 300])), bank: 'tatrabanka', lang: 'de', dnes: DNES_PRED });
  ok('2 x 300: German message says per file', /500 Transaktionen in einer Datei/.test(rDe.problems.find((p) => p.code === 'file_tx_count_exceeded').message));
  lacks('2 x 300 at VÚB: no Tatra limit (VÚB PDF has none)', run(limitSpec([300, 300]), 'vub').problems, 'file_tx_count_exceeded');
  lacks('2 x 300 at VÚB: no block advisory either', run(limitSpec([300, 300]), 'vub').problems, 'pmt_inf_tx_count_exceeded_generic');
}
{
  const r = run(limitSpec([500]), 'tatrabanka');
  lacks('1 block x 500 at Tatra banka: no file_tx_count_exceeded', r.problems, 'file_tx_count_exceeded');
  eq('1 x 500: status pass', r.status, 'pass');
  eq('1 x 500: zero problems', r.problems.length, 0);
  const r2 = run(limitSpec([250, 250]), 'tatrabanka');
  eq('2 x 250 at Tatra banka: exactly 500 in file is ok', kodyZ(r2).includes('file_tx_count_exceeded'), false);
}
{
  const r = run(limitSpec([501]), 'tatrabanka');
  has('501 tx at Tatra banka: reports file_tx_count_exceeded', r.problems, 'file_tx_count_exceeded');
  eq('501 tx: severity high', severityOf(r.problems, 'file_tx_count_exceeded'), 'high');
  eq('501 tx: reported once, not per block too', kodyZ(r).filter((k) => k.indexOf('tx_count_exceeded') >= 0).length, 1);
  const r2 = run(limitSpec([501]), 'vub');
  lacks('501 tx at another bank: no hard file_tx_count_exceeded', r2.problems, 'file_tx_count_exceeded');
  has('501 tx at another bank: informational pmt_inf_tx_count_exceeded_generic', r2.problems, 'pmt_inf_tx_count_exceeded_generic');
  ok('generic advisory cites the per-file Tatra limit', /v jednom súbore/.test(r2.problems.find((p) => p.code === 'pmt_inf_tx_count_exceeded_generic').message));
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].reqdExctnDt;
  const r = run(spec, 'tatrabanka');
  has('missing ReqdExctnDt: reports exec_date_missing', r.problems, 'exec_date_missing');
  eq('missing ReqdExctnDt: severity high', severityOf(r.problems, 'exec_date_missing'), 'high');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].reqdExctnDt = '2026-13-40';
  const r = run(spec, 'tatrabanka');
  has('invalid date format: reports exec_date_invalid_format', r.problems, 'exec_date_invalid_format');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].reqdExctnDt = daysFromNowIso(-3);
  const r = run(spec, 'tatrabanka');
  has('exec date in the past: reports exec_date_in_past', r.problems, 'exec_date_in_past');
  eq('exec date in the past: severity medium', severityOf(r.problems, 'exec_date_in_past'), 'medium');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].reqdExctnDt = daysFromNowIso(31);
  const r1 = run(spec, 'tatrabanka');
  lacks('exec date +31 days at Tatra banka: within window (boundary pass)', r1.problems, 'exec_date_too_far_future');
  spec.pmtInf[0].reqdExctnDt = daysFromNowIso(32);
  const r2 = run(spec, 'tatrabanka');
  has('exec date +32 days at Tatra banka: reports exec_date_too_far_future', r2.problems, 'exec_date_too_far_future');
  eq('exec date too far (Tatra banka): severity high', severityOf(r2.problems, 'exec_date_too_far_future'), 'high');
}
{
  const spec = withBank(PASS_SPEC, 'vub');
  spec.pmtInf[0].tx[0].cdtrBic = 'SUBASKBX';
  spec.pmtInf[0].reqdExctnDt = daysFromNowIso(30);
  const r1 = run(clone(spec), 'vub');
  lacks('exec date +30 days at VUB: within window (boundary pass)', r1.problems, 'exec_date_too_far_future');
  spec.pmtInf[0].reqdExctnDt = daysFromNowIso(31);
  const r2 = run(clone(spec), 'vub');
  has('exec date +31 days at VUB: reports exec_date_too_far_future', r2.problems, 'exec_date_too_far_future');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf.push(clone(spec.pmtInf[0]));
  spec.pmtInf[1].reqdExctnDt = daysFromNowIso(6);
  spec.nbOfTxs = 2;
  spec.ctrlSum = '900.00';
  const r = run(spec, 'tatrabanka');
  has('two PmtInf blocks with different ReqdExctnDt at Tatra banka: reports exec_date_differs_across_pmtinf', r.problems, 'exec_date_differs_across_pmtinf');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].dbtrNm;
  const r = run(spec, 'tatrabanka');
  has('missing Dbtr/Nm: reports dbtr_name_missing', r.problems, 'dbtr_name_missing');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].dbtrNm = 'A'.repeat(70);
  const r1 = run(spec, 'tatrabanka');
  lacks('Dbtr/Nm 70 chars: boundary pass', r1.problems, 'dbtr_name_too_long');
  spec.pmtInf[0].dbtrNm = 'A'.repeat(71);
  const r2 = run(spec, 'tatrabanka');
  has('Dbtr/Nm 71 chars: reports dbtr_name_too_long', r2.problems, 'dbtr_name_too_long');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].dbtrIban;
  const r = run(spec, 'tatrabanka');
  has('missing debtor IBAN: reports dbtr_iban_missing', r.problems, 'dbtr_iban_missing');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].dbtrIban = 'SK2811000000000000000099'; // bad checksum
  const r = run(spec, 'tatrabanka');
  has('bad debtor IBAN checksum: reports dbtr_iban_invalid', r.problems, 'dbtr_iban_invalid');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].dbtrBic = 'GIBASKBX'; // SLSP's BIC, but bank param says Tatra banka
  const r = run(spec, 'tatrabanka');
  has('DbtrAgt/BIC mismatch vs selected bank: reports dbtr_bic_mismatch', r.problems, 'dbtr_bic_mismatch');
  eq('dbtr_bic_mismatch: severity high', severityOf(r.problems, 'dbtr_bic_mismatch'), 'high');
  eq('dbtr_bic_mismatch: fix is the bank\'s real BIC', fixOf(r.problems, 'dbtr_bic_mismatch'), 'TATRSKBX');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].dbtrBic;
  const r = run(spec, 'tatrabanka');
  has('missing DbtrAgt/BIC: reports dbtr_bic_missing', r.problems, 'dbtr_bic_missing');
  eq('missing DbtrAgt/BIC: severity medium', severityOf(r.problems, 'dbtr_bic_missing'), 'medium');
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Per-transaction: PmtTpInf / ChrgBr resolution (PmtInf-level wins)
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].instrPrty = 'HIGH'; // tx-level, but PmtInf-level NORM should win
  const r = run(spec, 'tatrabanka');
  lacks('PmtInf-level InstrPrty=NORM overrides a conflicting tx-level value', r.problems, 'instr_prty_not_norm');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].instrPrty;
  spec.pmtInf[0].tx[0].instrPrty = 'HIGH';
  const r = run(spec, 'tatrabanka');
  has('tx-level InstrPrty=HIGH (no PmtInf-level value): reports instr_prty_not_norm', r.problems, 'instr_prty_not_norm');
  eq('instr_prty_not_norm: severity medium', severityOf(r.problems, 'instr_prty_not_norm'), 'medium');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].svcLvl;
  const r = run(spec, 'tatrabanka');
  has('SvcLvl missing everywhere: reports svc_lvl_missing_or_invalid', r.problems, 'svc_lvl_missing_or_invalid');
  eq('svc_lvl missing: severity high', severityOf(r.problems, 'svc_lvl_missing_or_invalid'), 'high');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].svcLvl = 'NOTSEPA';
  const r = run(spec, 'tatrabanka');
  has('SvcLvl wrong value: reports svc_lvl_missing_or_invalid', r.problems, 'svc_lvl_missing_or_invalid');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].chrgBr;
  const r = run(spec, 'tatrabanka');
  has('ChrgBr missing everywhere: reports chrg_br_missing', r.problems, 'chrg_br_missing');
  eq('chrg_br_missing: severity medium', severityOf(r.problems, 'chrg_br_missing'), 'medium');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].chrgBr = 'DEBT';
  const r = run(spec, 'tatrabanka');
  has('ChrgBr wrong value: reports chrg_br_invalid', r.problems, 'chrg_br_invalid');
  eq('chrg_br_invalid: severity high', severityOf(r.problems, 'chrg_br_invalid'), 'high');
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Per-transaction: PmtId / EndToEndId + VS/ŠS/KS
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].tx[0].endToEndId;
  const r = run(spec, 'tatrabanka');
  has('missing EndToEndId: reports end_to_end_id_missing', r.problems, 'end_to_end_id_missing');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].endToEndId = 'E'.repeat(35);
  const r1 = run(spec, 'tatrabanka');
  lacks('EndToEndId 35 chars: boundary pass', r1.problems, 'end_to_end_id_too_long');
  spec.pmtInf[0].tx[0].endToEndId = 'E'.repeat(36);
  const r2 = run(spec, 'tatrabanka');
  has('EndToEndId 36 chars: reports end_to_end_id_too_long', r2.problems, 'end_to_end_id_too_long');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].endToEndId = '/VS123/KS0308/SS14';
  const r = run(spec, 'tatrabanka');
  has('VS/KS/SS wrong order: reports reference_symbol_order', r.problems, 'reference_symbol_order');
  eq('reference_symbol_order: severity medium', severityOf(r.problems, 'reference_symbol_order'), 'medium');
  eq('reference_symbol_order: fix reorders to /VS/SS/KS', fixOf(r.problems, 'reference_symbol_order'), '/VS123/SS14/KS0308');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].endToEndId = '/VS123/SS456/KS0308';
  const r1 = run(spec, 'tatrabanka');
  lacks('VS/SS/KS correct order: no reference_symbol_order', r1.problems, 'reference_symbol_order');
  spec.pmtInf[0].tx[0].endToEndId = '/VS' + '1'.repeat(10) + '/SS1/KS1';
  const r2 = run(spec, 'tatrabanka');
  lacks('VS exactly 10 digits: boundary pass', r2.problems, 'reference_symbol_too_long');
  spec.pmtInf[0].tx[0].endToEndId = '/VS' + '1'.repeat(11) + '/SS1/KS1';
  const r3 = run(spec, 'tatrabanka');
  has('VS 11 digits: reports reference_symbol_too_long', r3.problems, 'reference_symbol_too_long');
  spec.pmtInf[0].tx[0].endToEndId = '/VS1/SS1/KS1234';
  const r4 = run(spec, 'tatrabanka');
  lacks('KS exactly 4 digits: boundary pass', r4.problems, 'reference_symbol_too_long');
  spec.pmtInf[0].tx[0].endToEndId = '/VS1/SS1/KS12345';
  const r5 = run(spec, 'tatrabanka');
  has('KS 5 digits: reports reference_symbol_too_long', r5.problems, 'reference_symbol_too_long');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].endToEndId = '/VSabc/SS1/KS1';
  const r = run(spec, 'tatrabanka');
  has('non-numeric VS: reports reference_symbol_non_numeric', r.problems, 'reference_symbol_non_numeric');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx.push(clone(spec.pmtInf[0].tx[0]));
  spec.nbOfTxs = 2;
  spec.ctrlSum = '900.00';
  const r = run(spec, 'tatrabanka');
  has('duplicate EndToEndId across transactions: reports duplicate_end_to_end_id', r.problems, 'duplicate_end_to_end_id');
  eq('duplicate_end_to_end_id: severity medium', severityOf(r.problems, 'duplicate_end_to_end_id'), 'medium');
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Per-transaction: Amount
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].tx[0].amount;
  const r = run(spec, 'tatrabanka');
  has('missing Amt/InstdAmt: reports amount_missing', r.problems, 'amount_missing');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].ccy = 'USD';
  const r = run(spec, 'tatrabanka');
  has('non-EUR currency: reports amount_currency_invalid', r.problems, 'amount_currency_invalid');
  eq('amount_currency_invalid: severity high', severityOf(r.problems, 'amount_currency_invalid'), 'high');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].amount = '0.00';
  const r = run(spec, 'tatrabanka');
  has('zero amount: reports amount_non_positive', r.problems, 'amount_non_positive');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].amount = 'abc';
  const r = run(spec, 'tatrabanka');
  has('non-numeric amount: reports amount_format_invalid', r.problems, 'amount_format_invalid');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].amount = '450.123';
  const r = run(spec, 'tatrabanka');
  has('3 decimal places: reports amount_format_invalid', r.problems, 'amount_format_invalid');
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Per-transaction: Creditor name / account / agent
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].tx[0].cdtrNm;
  const rTb = run(clone(spec), 'tatrabanka');
  has('missing Cdtr/Nm at Tatra banka: reports cdtr_name_missing', rTb.problems, 'cdtr_name_missing');
  eq('missing Cdtr/Nm at Tatra banka: severity medium (auto-fill possible)', severityOf(rTb.problems, 'cdtr_name_missing'), 'medium');
  const rVub = run(withBank(spec, 'vub'), 'vub');
  eq('missing Cdtr/Nm at VUB: severity high (no auto-fill)', severityOf(rVub.problems, 'cdtr_name_missing'), 'high');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrNm = 'A'.repeat(71);
  const r = run(spec, 'tatrabanka');
  has('Cdtr/Nm 71 chars: reports cdtr_name_too_long', r.problems, 'cdtr_name_too_long');
}
{
  const spec = clone(PASS_SPEC);
  delete spec.pmtInf[0].tx[0].cdtrIban;
  const r = run(spec, 'tatrabanka');
  has('missing creditor IBAN: reports cdtr_iban_missing', r.problems, 'cdtr_iban_missing');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrIban = 'SK0502000000272000000099'; // bad MOD-97 checksum
  const r = run(spec, 'tatrabanka');
  has('bad creditor IBAN checksum: reports cdtr_iban_invalid', r.problems, 'cdtr_iban_invalid');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrIban = CREDITOR_IBAN_VUB_MOD11_FAIL;
  spec.pmtInf[0].tx[0].cdtrBic = 'SUBASKBX';
  const rTb = run(clone(spec), 'tatrabanka');
  has('SK creditor IBAN failing modulo-11 at Tatra banka: reports cdtr_iban_sk_modulo11_failed', rTb.problems, 'cdtr_iban_sk_modulo11_failed');
  eq('modulo-11 fail at Tatra banka: severity high', severityOf(rTb.problems, 'cdtr_iban_sk_modulo11_failed'), 'high');
  const rVub = run(withBank(spec, 'vub'), 'vub');
  eq('modulo-11 fail at another bank: severity low (advisory)', severityOf(rVub.problems, 'cdtr_iban_sk_modulo11_failed'), 'low');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrIban = NON_SEPA_IBAN;
  spec.pmtInf[0].tx[0].cdtrBic = 'BTEBTNTTXXX';
  const r = run(spec, 'tatrabanka');
  has('creditor IBAN outside SEPA: reports cdtr_iban_outside_sepa', r.problems, 'cdtr_iban_outside_sepa');
  lacks('non-SK IBAN: modulo-11 check not applied', r.problems, 'cdtr_iban_sk_modulo11_failed');
}
{
  const spec = withBank(PASS_SPEC, 'vub');
  delete spec.pmtInf[0].tx[0].cdtrBic;
  const r = run(spec, 'vub');
  has('missing creditor BIC at VUB (mandatory): reports cdtr_bic_missing_required', r.problems, 'cdtr_bic_missing_required');
  eq('cdtr_bic_missing_required: severity high', severityOf(r.problems, 'cdtr_bic_missing_required'), 'high');
}
{
  const spec = withBank(PASS_SPEC, 'csob');
  delete spec.pmtInf[0].tx[0].cdtrBic;
  const r = run(spec, 'csob');
  lacks('missing creditor BIC at ČSOB (optional since 1.2.2016): no problem', r.problems, 'cdtr_bic_missing_required');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrBic = 'AB';
  const r = run(spec, 'tatrabanka');
  has('malformed creditor BIC: reports cdtr_bic_format_invalid', r.problems, 'cdtr_bic_format_invalid');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrBic = 'CEKOSKBX'; // ČSOB's BIC, but the IBAN's bank code is VUB's (0200)
  const r = run(spec, 'tatrabanka');
  has('creditor BIC does not match bank derived from IBAN: reports cdtr_bic_mismatch_iban', r.problems, 'cdtr_bic_mismatch_iban');
  eq('cdtr_bic_mismatch_iban: fix suggests the derived BIC', fixOf(r.problems, 'cdtr_bic_mismatch_iban'), 'SUBASKBX');
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Remittance info / character set
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].ustrd = 'U'.repeat(140);
  const r1 = run(spec, 'tatrabanka');
  lacks('Ustrd 140 chars: boundary pass', r1.problems, 'rmt_inf_too_long');
  spec.pmtInf[0].tx[0].ustrd = 'U'.repeat(141);
  const r2 = run(spec, 'tatrabanka');
  has('Ustrd 141 chars: reports rmt_inf_too_long', r2.problems, 'rmt_inf_too_long');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].ustrd = ['Prva faktura', 'Druha faktura'];
  const r = run(spec, 'tatrabanka');
  has('two Ustrd elements: reports rmt_inf_multiple_ustrd', r.problems, 'rmt_inf_multiple_ustrd');
  eq('rmt_inf_multiple_ustrd: severity low', severityOf(r.problems, 'rmt_inf_multiple_ustrd'), 'low');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrNm = 'Jozef Šťastný'; // "Jozef Šťastný"
  const rCsob = run(withBank(spec, 'csob'), 'csob');
  has('diacritics in Cdtr/Nm at ČSOB: reports diacritics_in_field', rCsob.problems, 'diacritics_in_field');
  eq('diacritics at ČSOB: severity high (import blocked)', severityOf(rCsob.problems, 'diacritics_in_field'), 'high');
  eq('diacritics fix is transliterated', fixOf(rCsob.problems, 'diacritics_in_field'), 'Jozef Stastny');
  const rGeneric = run(clone(spec), 'generic');
  eq('diacritics at a generic/other bank: severity medium', severityOf(rGeneric.problems, 'diacritics_in_field'), 'medium');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].cdtrNm = 'ACME % Corp';
  const r = run(spec, 'tatrabanka');
  has('"%" outside SEPA character set: reports invalid_sepa_character', r.problems, 'invalid_sepa_character');
}

// ─────────────────────────────────────────────────────────────────────────
// 9. SLSP instant-payment flag
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = withBank(PASS_SPEC, 'slsp');
  const r = run(spec, 'slsp');
  has('SLSP, no LclInstrm/Cd: reports slsp_instant_flag_absent (informational)', r.problems, 'slsp_instant_flag_absent');
  eq('slsp_instant_flag_absent: severity low', severityOf(r.problems, 'slsp_instant_flag_absent'), 'low');
}
{
  const spec = withBank(PASS_SPEC, 'slsp');
  spec.pmtInf[0].tx[0].lclInstrm = 'INST';
  const r = run(spec, 'slsp');
  lacks('SLSP with LclInstrm/Cd=INST: no slsp_instant_flag_absent', r.problems, 'slsp_instant_flag_absent');
}
{
  const r = run(withBank(PASS_SPEC, 'vub'), 'vub');
  lacks('LclInstrm check only applies to SLSP', r.problems, 'slsp_instant_flag_absent');
}

// ─────────────────────────────────────────────────────────────────────────
// 10. Cross-cutting: expectedTxCount, file size, transaction volume
// ─────────────────────────────────────────────────────────────────────────

{
  const r = run(PASS_SPEC, 'tatrabanka', 5);
  has('expectedTxCount mismatch: reports expected_tx_count_mismatch', r.problems, 'expected_tx_count_mismatch');
  eq('expected_tx_count_mismatch: severity high', severityOf(r.problems, 'expected_tx_count_mismatch'), 'high');
}
{
  const r = run(PASS_SPEC, 'tatrabanka', 1);
  lacks('expectedTxCount matches actual: no mismatch', r.problems, 'expected_tx_count_mismatch');
}
{
  const spec = clone(PASS_SPEC);
  spec.msgId = 'PAD-' + 'x'.repeat(1_100_000); // pushes the raw file size over 1 MB
  const r = run(spec, 'tatrabanka');
  has('file over 1MB: reports file_too_large', r.problems, 'file_too_large');
  eq('file_too_large: severity low', severityOf(r.problems, 'file_too_large'), 'low');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx = manyTx(5001);
  spec.nbOfTxs = null;
  spec.ctrlSum = null;
  const r = run(spec, 'generic');
  has('5001 transactions: reports too_many_transactions_generic', r.problems, 'too_many_transactions_generic');
}

// ─────────────────────────────────────────────────────────────────────────
// 11. status/summary computation + expectedValues()
// ─────────────────────────────────────────────────────────────────────────

{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].ustrd = ['a', 'b']; // low-only
  const r = run(spec, 'tatrabanka');
  eq('only-low-severity file: status is warn', r.status, 'warn');
}
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].pmtMtd = 'DD'; // high severity
  const r = run(spec, 'tatrabanka');
  eq('any high-severity problem: status is fail', r.status, 'fail');
  ok('fail summary mentions a blocking count', /blokuj/i.test(r.summary), r.summary);
}
{
  const ev = expectedValues({ bank: 'vub' });
  eq('expectedValues: bankBic for VUB', ev.bankBic, 'SUBASKBX');
  eq('expectedValues: execWindowDays for VUB', ev.execWindowDays, 30);
  const evUnknown = expectedValues({ bank: 'not-a-bank' });
  eq('expectedValues: unknown bank falls back to generic', evUnknown.bank, 'generic');
}
{
  const r1 = diagnose({ xml: buildPain001(PASS_SPEC) }); // no bank given at all
  eq('diagnose() with no bank: defaults to generic', r1.bank, 'generic');
}

// ─────────────────────────────────────────────────────────────────────────
// ── štruktúrovaná adresa, termín EPC odložený ─────────────────────────────
// Toto je jediná kontrola, ktorá by časom menila závažnosť, preto sa testuje
// na oboch stranách pôvodného termínu 15. 11. 2026. Dátum sa vždy podáva
// zvonka (cfg.dnes), nikdy sa nečíta systémový čas.
// Zmena 24. 9. 2026: EPC 9. 9. 2026 koniec voľnej adresy odložila, preto je
// TERMIN_ADRESY null a voľná adresa je aj po 15. 11. 2026 upozornenie
// (medium), nie blokujúca chyba (high). Oprava 19. 11. 2026: PSMB 29. 10. 2026
// nový termín neurčil a vráti sa k nemu do februára 2027 (predtým tu stálo
// „v októbri 2026“).
// Zdroje: https://www.europeanpaymentscouncil.eu/news-insights/news/epc-delays-address-format-migration-timeline
// https://www.europeanpaymentscouncil.eu/news-insights/news/epc-defers-setting-new-end-date-unstructured-address-format-until-february-2027
function adrXml(dbtrAdr, cdtrAdr) {
  return `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>`
    + `<GrpHdr><MsgId>M1</MsgId><CreDtTm>2026-09-06T10:00:00</CreDtTm><NbOfTxs>1</NbOfTxs><CtrlSum>10.00</CtrlSum><InitgPty><Nm>Test</Nm></InitgPty></GrpHdr>`
    + `<PmtInf><PmtInfId>P1</PmtInfId><PmtMtd>TRF</PmtMtd><ReqdExctnDt>2026-09-10</ReqdExctnDt>`
    + `<Dbtr><Nm>Firma</Nm>${dbtrAdr}</Dbtr>`
    + `<DbtrAcct><Id><IBAN>SK3112000000198742637541</IBAN></Id></DbtrAcct>`
    + `<DbtrAgt><FinInstnId><BIC>TATRSKBX</BIC></FinInstnId></DbtrAgt>`
    + `<CdtTrfTxInf><PmtId><EndToEndId>E1</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">10.00</InstdAmt></Amt>`
    + `<Cdtr><Nm>Prijemca</Nm>${cdtrAdr}</Cdtr>`
    + `<CdtrAcct><Id><IBAN>SK3112000000198742637541</IBAN></Id></CdtrAcct>`
    + `</CdtTrfTxInf></PmtInf></CstmrCdtTrfInitn></Document>`;
}
const adrNalezy = (xml, dnes) => diagnose({ xml, bank: 'tatrabanka', dnes }).problems.filter((p) => p.code.indexOf('adresa') === 0);

eq('TERMIN_ADRESY je null, kým EPC neurčí nový termín', TERMIN_ADRESY, null);

{
  // Súbor bez akejkoľvek adresy je v poriadku kedykoľvek: adresa je v SEPA
  // nepovinná a pravidlo platí len pre adresu, ktorá tam naozaj je.
  const bez = adrXml('', '');
  eq('bez adries: pred termínom nič nehlásime', adrNalezy(bez, '2026-09-06').length, 0);
  eq('bez adries: ani po termíne nič nehlásime', adrNalezy(bez, '2026-12-01').length, 0);
}

{
  const struktura = '<PstlAdr><StrtNm>Ivanska cesta</StrtNm><BldgNb>32E</BldgNb><PstCd>82104</PstCd><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
  eq('plne štruktúrovaná adresa prejde aj po termíne', adrNalezy(adrXml(struktura, struktura), '2026-12-01').length, 0);
}

{
  const volnyText = '<PstlAdr><AdrLine>Ivanska cesta 32E</AdrLine><AdrLine>821 04 Bratislava</AdrLine></PstlAdr>';
  const dobra = '<PstlAdr><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
  const pred = adrNalezy(adrXml(volnyText, dobra), '2026-09-06');
  eq('voľný text: pred termínom sa hlási', pred.length, 1);
  eq('voľný text: kód nálezu', pred[0].code, 'adresa_nestrukturovana');
  eq('voľný text: pred termínom je to stredná závažnosť, nie blokujúca', pred[0].severity, 'medium');
  ok('voľný text: hlási sa u platiteľa, nie u príjemcu', pred[0].message.indexOf('platite') !== -1);
  ok('voľný text: oprava obsahuje TwnNm aj Ctry', pred[0].fix.indexOf('TwnNm') !== -1 && pred[0].fix.indexOf('Ctry') !== -1);
  ok('voľný text: cesta ukazuje na Dbtr/PstlAdr', pred[0].path.indexOf('Dbtr/PstlAdr') !== -1);
  ok('voľný text: cesta nezacina technickym #root', pred[0].path.indexOf('#root') === -1);

  ok('voľný text: hláška odporúča štruktúrovanú adresu', pred[0].message.indexOf('odporúčame') !== -1);
  ok('voľný text: hláška netvrdí, že banka súbor odmietne', !/odmiet/.test(pred[0].message));
  ok('voľný text: hláška netvrdí termín 15. 11. 2026', !/15\. ?(11\.|nov)/.test(pred[0].message));

  // Zmena 24. 9. 2026: pôvodne tu bolo 'high' (blokujúce) v deň termínu aj po ňom.
  // EPC termín odložila, preto ostáva 'medium' (upozornenie) aj po 15. 11. 2026.
  const po = adrNalezy(adrXml(volnyText, dobra), '2026-11-15');
  eq('voľný text: 15. 11. 2026 stále len upozornenie', po[0].severity, 'medium');
  const poPo = adrNalezy(adrXml(volnyText, dobra), '2026-12-01');
  eq('voľný text: 1. 12. 2026 stále len upozornenie', poPo[0].severity, 'medium');
  for (const lang of ['en', 'de']) {
    const m = diagnose({ xml: adrXml(volnyText, dobra), bank: 'tatrabanka', dnes: '2026-12-01', lang })
      .problems.find((p) => p.code === 'adresa_nestrukturovana');
    ok('voľný text ' + lang + ': bez tvrdenia o 15. novembri', m && !/15\.? November/.test(m.message));
    eq('voľný text ' + lang + ': upozornenie', m && m.severity, 'medium');
  }
}

{
  const dobra = '<PstlAdr><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
  const bezMesta = '<PstlAdr><StrtNm>Hlavna</StrtNm><BldgNb>1</BldgNb><Ctry>SK</Ctry></PstlAdr>';
  const n1 = adrNalezy(adrXml(dobra, bezMesta), '2026-09-06');
  eq('chýba mesto: hlási sa', n1.length, 1);
  eq('chýba mesto: kód nálezu', n1[0].code, 'adresa_bez_mesta_alebo_krajiny');
  ok('chýba mesto: pomenuje príjemcu', n1[0].message.indexOf('pr\u00edjemcu') !== -1);
  ok('chýba mesto: oprava je TwnNm', n1[0].fix.indexOf('TwnNm') !== -1);

  const bezKrajiny = '<PstlAdr><TwnNm>Bratislava</TwnNm></PstlAdr>';
  const n2 = adrNalezy(adrXml(dobra, bezKrajiny), '2026-09-06');
  eq('chýba krajina: hlási sa', n2.length, 1);
  ok('chýba krajina: oprava je Ctry', n2[0].fix.indexOf('Ctry') !== -1);
}

{
  const dobra = '<PstlAdr><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
  const zlaKrajina = '<PstlAdr><TwnNm>Wien</TwnNm><Ctry>Austria</Ctry></PstlAdr>';
  const n = adrNalezy(adrXml(dobra, zlaKrajina), '2026-09-06');
  ok('krajina slovom namiesto kódu: hlási sa ako blokujúca', n.some((p) => p.code === 'adresa_zly_kod_krajiny' && p.severity === 'high'));
}

{
  // Hybridná adresa smie mať najviac dva riadky.
  const dobra = '<PstlAdr><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
  const tri = '<PstlAdr><AdrLine>Riadok 1</AdrLine><AdrLine>Riadok 2</AdrLine><AdrLine>Riadok 3</AdrLine><TwnNm>Praha</TwnNm><Ctry>CZ</Ctry></PstlAdr>';
  const n = adrNalezy(adrXml(dobra, tri), '2026-09-06');
  ok('tri riadky adresy: hlási sa ako drobnosť', n.some((p) => p.code === 'adresa_prilis_vela_riadkov' && p.severity === 'low'));
}

{
  // Prazdny <PstlAdr> nie je adresa, takze sa nehlasi.
  const prazdna = '<PstlAdr></PstlAdr>';
  const dobra = '<PstlAdr><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
  eq('prázdny PstlAdr sa nehlási', adrNalezy(adrXml(prazdna, dobra), '2026-12-01').length, 0);
}

{
  // Ten isty problem v dvadsiatich platbach nema zaplavit vysledok.
  let tx = '';
  for (let i = 0; i < 20; i++) {
    tx += `<CdtTrfTxInf><PmtId><EndToEndId>E${i}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">1.00</InstdAmt></Amt>`
      + `<Cdtr><Nm>P${i}</Nm><PstlAdr><AdrLine>Ulica ${i}</AdrLine></PstlAdr></Cdtr>`
      + `<CdtrAcct><Id><IBAN>SK3112000000198742637541</IBAN></Id></CdtrAcct></CdtTrfTxInf>`;
  }
  const xml = `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>`
    + `<GrpHdr><MsgId>M</MsgId><CreDtTm>2026-09-06T10:00:00</CreDtTm><NbOfTxs>20</NbOfTxs><CtrlSum>20.00</CtrlSum><InitgPty><Nm>T</Nm></InitgPty></GrpHdr>`
    + `<PmtInf><PmtInfId>P</PmtInfId><PmtMtd>TRF</PmtMtd><ReqdExctnDt>2026-09-10</ReqdExctnDt>`
    + `<Dbtr><Nm>F</Nm></Dbtr><DbtrAcct><Id><IBAN>SK3112000000198742637541</IBAN></Id></DbtrAcct>`
    + `<DbtrAgt><FinInstnId><BIC>TATRSKBX</BIC></FinInstnId></DbtrAgt>${tx}</PmtInf></CstmrCdtTrfInitn></Document>`;
  const r = diagnose({ xml, bank: 'tatrabanka', dnes: '2026-09-06' });
  const n = r.problems.filter((p) => p.code.indexOf('adresa') === 0);
  eq('dvadsať rovnakých adries: hlási sa raz, nie dvadsaťkrát', n.length, 1);
  eq('dvadsať rovnakých adries: štatistika pozná všetky', r.stats.adriesSpolu, 20);
  eq('dvadsať rovnakých adries: štatistika pozná počet zlých', r.stats.adriesZlych, 20);
}


// ───────────── pain.001.001.09: iné názvy tých istých údajov ─────────────
//
// Vo verzii .09 je dátum splatnosti zabalený v <Dt> a kód banky sa volá
// <BICFI>. Keby ich Doctor nevedel prečítať, hlásil by pri každom súbore vo
// verzii .09 nečitateľný dátum a chýbajúci BIC, teda dve chyby, ktoré tam
// nie sú. Test to stráži na súbore, ktorý je inak zhodný s baseline.
{
  const x03 = buildPain001(PASS_SPEC);
  const x09 = x03
    .replace('pain.001.001.03', 'pain.001.001.09')
    .replace(/<ReqdExctnDt>([^<]+)<\/ReqdExctnDt>/g, '<ReqdExctnDt><Dt>$1</Dt></ReqdExctnDt>')
    .replace(/<BIC>/g, '<BICFI>').replace(/<\/BIC>/g, '</BICFI>');

  const r = diagnose({ xml: x09, bank: 'tatrabanka', dnes: DNES_PRED });
  lacks('.09: dátum v <Dt> sa prečíta', r.problems, 'exec_date_invalid_format');
  lacks('.09: BICFI sa berie ako BIC platiteľa', r.problems, 'dbtr_bic_missing');
  lacks('.09: BICFI sa berie ako BIC príjemcu', r.problems, 'cdtr_bic_missing_required');
  eq('.09: rovnako čistý ako ten istý súbor v .03',
    r.problems.filter((p) => p.severity !== 'low').length, 0);

  // Keď BICFI nesedí, hlásenie musí menovať prvok, ktorý v súbore naozaj je.
  const zly = x09.replace('<BICFI>TATRSKBX</BICFI>', '<BICFI>GIBASKBX</BICFI>');
  const rz = diagnose({ xml: zly, bank: 'tatrabanka', dnes: DNES_PRED });
  has('.09: nezhoda BICFI sa nájde', rz.problems, 'dbtr_bic_mismatch');
  ok('.09: hlásenie menuje BICFI, nie BIC',
    JSON.stringify(rz.problems).indexOf('FinInstnId/BICFI') !== -1);
}

// ───────── Lomky v referenciách a identifikátoroch (pravidlo EPC) ─────────
//
// Podnet: otázka na podporu, 19. 11. 2026, EndToEndId "0000000099//2026-11-12/BO-1".
// Zdroj: EPC132-08 SCT Customer-to-PSP Implementation Guidelines 2025 V1.0,
// časť 1.4 Character Set: "Content must not start or end with a '/'" a
// "Content must not contain '//'s". Ktorých prvkov sa to týka, určuje
// EPC230-15 (v2.0 pre pain.001.001.09, v1.0 pre pain.001.001.03): MsgId,
// PmtInfId, InstrId, EndToEndId a Othr/Id strán; NIE CdtrRefInf/Ref,
// NIE DbtrAgt/FinInstnId/Othr/Id a nie voľný text Ustrd.
{
  const KOD = 'identifier_slash_rule';
  const nalezy = (r) => r.problems.filter((p) => p.code === KOD);
  const na09 = (x) => x
    .replace('pain.001.001.03', 'pain.001.001.09')
    .replace(/<ReqdExctnDt>([^<]+)<\/ReqdExctnDt>/g, '<ReqdExctnDt><Dt>$1</Dt></ReqdExctnDt>')
    .replace(/<BIC>/g, '<BICFI>').replace(/<\/BIC>/g, '</BICFI>');
  const PRIKLAD = '0000000099//2026-11-12/BO-1';
  const OPRAVA = '0000000099/2026-11-12/BO-1';

  // Presný príklad zo správy, .03 aj .09.
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx[0].endToEndId = PRIKLAD;
  const x03 = buildPain001(spec);
  for (const [verzia, xml] of [['.03', x03], ['.09', na09(x03)]]) {
    const r = diagnose({ xml, bank: 'tatrabanka', dnes: DNES_PRED });
    const n = nalezy(r);
    eq(`lomky ${verzia}: príklad zo správy má práve jeden nález`, n.length, 1);
    eq(`lomky ${verzia}: závažnosť stredná (EPC: must not, odmietnutie bankou neoverené)`, n[0] && n[0].severity, 'medium');
    eq(`lomky ${verzia}: nález nesie presnú hodnotu`, n[0] && n[0].value, PRIKLAD);
    eq(`lomky ${verzia}: návrh opravy na skopírovanie`, n[0] && n[0].fix, OPRAVA);
    ok(`lomky ${verzia}: cesta mieri na EndToEndId`, !!n[0] && /CdtTrfTxInf\[1\]\/PmtId\/EndToEndId$/.test(n[0].path));
    ok(`lomky ${verzia}: hláška cituje hodnotu aj opravu`, !!n[0] && n[0].message.includes(PRIKLAD) && n[0].message.includes(OPRAVA));
    eq(`lomky ${verzia}: stav warn, nie fail`, r.status, 'warn');
    eq(`lomky ${verzia}: žiadna blokujúca (high) chyba`, r.problems.filter((p) => p.severity === 'high').length, 0);
    ok(`lomky ${verzia}: zhrnutie netvrdí, že banka súbor odmietne`, !/odmietne/.test(r.summary));
    ok(`lomky ${verzia}: oprava je v zozname fixes`, r.fixes.some((f) => f.value === OPRAVA));
  }

  // Tri jazyky: hláška existuje, líši sa podľa jazyka a nemá pomlčky.
  {
    const vJazyku = (lang) => nalezy(diagnose({ xml: x03, bank: 'tatrabanka', dnes: DNES_PRED, lang }))[0];
    const sk = vJazyku('sk');
    const en = vJazyku('en');
    const de = vJazyku('de');
    for (const [lang, n] of [['sk', sk], ['en', en], ['de', de]]) {
      ok(`lomky ${lang}: hláška spomína EPC`, !!n && /EPC/.test(n.message));
      ok(`lomky ${lang}: bez pomlčiek em a en`, !!n && !/[–—]/.test(n.message));
    }
    ok('lomky: tri rôzne jazykové verzie', !!sk && !!en && !!de && sk.message !== en.message && en.message !== de.message && sk.message !== de.message);
    ok('lomky en: anglický text', !!en && /must not/.test(en.message));
    ok('lomky de: nemecký text', !!de && /darf/.test(de.message));
  }

  // Začiatok a koniec lomkou.
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = '/FA2026-0912';
    const n = nalezy(run(s, 'tatrabanka'));
    eq('lomky: EndToEndId začína lomkou, jeden nález', n.length, 1);
    eq('lomky: začiatok lomkou, oprava bez nej', n[0] && n[0].fix, 'FA2026-0912');
  }
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = 'FA2026-0912/';
    const n = nalezy(run(s, 'tatrabanka'));
    eq('lomky: EndToEndId končí lomkou, jeden nález', n.length, 1);
    eq('lomky: koniec lomkou, oprava bez nej', n[0] && n[0].fix, 'FA2026-0912');
  }
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = '/A///B/';
    const n = nalezy(run(s, 'tatrabanka'));
    eq('lomky: všetky tri porušenia naraz dajú jeden nález na prvok', n.length, 1);
    eq('lomky: všetky tri porušenia, oprava', n[0] && n[0].fix, 'A/B');
  }
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = '//';
    const n = nalezy(run(s, 'tatrabanka'));
    eq('lomky: hodnota len z lomiek sa hlási', n.length, 1);
    eq('lomky: hodnota len z lomiek nemá vymyslenú opravu', n[0] && n[0].fix, '');
  }

  // Platný identifikátor s jednou lomkou uprostred: bez nálezu.
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = '0000000099/2026-11-12/BO-1';
    s.msgId = 'MSG/2026/0001';
    s.pmtInf[0].pmtInfId = 'PMT/0001';
    const r = run(s, 'tatrabanka');
    eq('lomky: jednotlivé lomky uprostred sú v poriadku', nalezy(r).length, 0);
    eq('lomky: platný súbor ostáva pass', r.status, 'pass');
  }

  // Slovenská konvencia /VS/SS/KS v EndToEndId začína lomkou zámerne
  // (ČSOB "BusinessBanking Lite a SEPA", pozri hlavičku doctor-pain001.js).
  // Úvodnú lomku pri nej nehlásime, dve lomky za sebou a lomku na konci áno.
  {
    eq('lomky: /VS123/SS456/KS0308 v EndToEndId bez nálezu', nalezy(run(PASS_SPEC, 'tatrabanka')).length, 0);
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = '/VS123//SS456/KS0308';
    const n = nalezy(run(s, 'tatrabanka'));
    eq('lomky: /VS123//SS456 hlási dve lomky za sebou', n.length, 1);
    eq('lomky: oprava symbolov zachová úvodnú lomku konvencie', n[0] && n[0].fix, '/VS123/SS456/KS0308');
    const s2 = clone(PASS_SPEC);
    s2.pmtInf[0].tx[0].endToEndId = '/VS123/';
    const n2 = nalezy(run(s2, 'tatrabanka'));
    eq('lomky: /VS123/ hlási lomku na konci', n2.length, 1);
    eq('lomky: /VS123/ oprava', n2[0] && n2[0].fix, '/VS123');
  }

  // Ustrd nie je identifikátor: žiadny nález, ani pri "//" a lomke na konci.
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].ustrd = '/VS123/SS456/KS0308';
    const r = run(s, 'tatrabanka');
    eq('lomky: Ustrd /VS123/SS456/KS0308 bez nálezu', nalezy(r).length, 0);
    eq('lomky: Ustrd /VS123/SS456/KS0308 ostáva pass', r.status, 'pass');
    s.pmtInf[0].tx[0].ustrd = '/Faktura//2026/';
    eq('lomky: Ustrd s "//" a lomkou na konci bez nálezu', nalezy(run(s, 'tatrabanka')).length, 0);
  }

  // Ostatné prvky zo zoznamu EPC230-15 a prvky, ktoré tam výslovne NIE sú.
  {
    const xml = x03
      .replace(`<EndToEndId>${PRIKLAD}</EndToEndId>`, '<InstrId>I//1</InstrId><EndToEndId>E2E-1</EndToEndId>')
      .replace('<MsgId>MSG-0001</MsgId>', '<MsgId>/MSG-0001</MsgId>')
      .replace('<PmtInfId>PMT-0001</PmtInfId>', '<PmtInfId>PMT-0001/</PmtInfId>')
      .replace('<GrpHdr>', '<GrpHdr><InitgPty><Id><OrgId><Othr><Id>/ICO1</Id></Othr></OrgId></Id></InitgPty>')
      .replace('<Dbtr><Nm>Firma s.r.o.</Nm>', '<Dbtr><Nm>Firma s.r.o.</Nm><Id><OrgId><Othr><Id>12//34</Id></Othr></OrgId></Id>')
      .replace('<Cdtr><Nm>Jozef Novak</Nm>', '<Cdtr><Nm>Jozef Novak</Nm><Id><PrvtId><Othr><Id>RC1/</Id></Othr></PrvtId></Id>')
      .replace('</Cdtr>', '</Cdtr><UltmtCdtr><Id><OrgId><Othr><Id>ok/1</Id></Othr></OrgId></Id></UltmtCdtr>')
      // Výslovne mimo pravidla podľa EPC230-15:
      .replace('<RmtInf>', '<RmtInf><Strd><CdtrRefInf><Ref>/RF18//5390/</Ref></CdtrRefInf></Strd>')
      .replace('<FinInstnId><BIC>TATRSKBX</BIC>', '<FinInstnId><BIC>TATRSKBX</BIC><Othr><Id>/X//Y/</Id></Othr>');
    ok('lomky: úprava fixture sa naozaj zapísala',
      ['<InstrId>I//1</InstrId>', '/RF18//5390/', '/X//Y/', '/ICO1', '12//34', 'RC1/', '/MSG-0001', 'PMT-0001/', 'ok/1'].every((t) => xml.includes(t)));
    const n = nalezy(diagnose({ xml, bank: 'tatrabanka', dnes: DNES_PRED }));
    const cesty = n.map((p) => p.path);
    eq('lomky: šesť dotknutých prvkov, šesť nálezov', n.length, 6);
    ok('lomky: MsgId', cesty.some((c) => /GrpHdr\/MsgId$/.test(c)));
    ok('lomky: PmtInfId', cesty.some((c) => /PmtInf\[1\]\/PmtInfId$/.test(c)));
    ok('lomky: InstrId', cesty.some((c) => /PmtId\/InstrId$/.test(c)));
    ok('lomky: InitgPty/Id/OrgId/Othr/Id', cesty.some((c) => /InitgPty\/Id\/OrgId\/Othr\/Id$/.test(c)));
    ok('lomky: Dbtr/Id/OrgId/Othr/Id', cesty.some((c) => /PmtInf\[1\]\/Dbtr\/Id\/OrgId\/Othr\/Id$/.test(c)));
    ok('lomky: Cdtr/Id/PrvtId/Othr/Id', cesty.some((c) => /Cdtr\/Id\/PrvtId\/Othr\/Id$/.test(c)));
    ok('lomky: CdtrRefInf/Ref sa nehlási (súčasť remittance information)', !cesty.some((c) => /Ref$/.test(c)));
    ok('lomky: DbtrAgt/FinInstnId/Othr/Id sa nehlási', !cesty.some((c) => /FinInstnId/.test(c)));
    ok('lomky: platné Othr/Id s jednou lomkou sa nehlási', !cesty.some((c) => /UltmtCdtr/.test(c)));
  }

  // UltmtDbtr (PmtInf aj transakcia), UltmtCdtr, druhé Othr a výnimka /VS,
  // ktorá platí len pre EndToEndId.
  {
    const cisty = buildPain001(PASS_SPEC);
    const xml = cisty
      .replace('<MsgId>MSG-0001</MsgId>', '<MsgId>/VS1</MsgId>')
      .replace('<PmtInfId>PMT-0001</PmtInfId>', '<PmtInfId>/SS2</PmtInfId>')
      .replace('<EndToEndId>', '<InstrId>/KS3</InstrId><EndToEndId>')
      .replace('<DbtrAcct>', '<UltmtDbtr><Id><OrgId><Othr><Id>/UD-PMT</Id></Othr></OrgId></Id></UltmtDbtr><DbtrAcct>')
      .replace('<Amt>', '<UltmtDbtr><Id><PrvtId><Othr><Id>UD//TX</Id></Othr></PrvtId></Id></UltmtDbtr><Amt>')
      .replace('<Cdtr><Nm>Jozef Novak</Nm>', '<Cdtr><Nm>Jozef Novak</Nm><Id><OrgId><Othr><Id>ICO-1</Id></Othr><Othr><Id>DIC2/</Id></Othr></OrgId></Id>')
      .replace('</Cdtr>', '</Cdtr><UltmtCdtr><Id><OrgId><Othr><Id>/VS9</Id><SchmeNm><Prtry>A//B</Prtry></SchmeNm><Issr>X//Y</Issr></Othr></OrgId></Id></UltmtCdtr>');
    ok('lomky: úprava druhej fixture sa naozaj zapísala',
      ['<MsgId>/VS1<', '<PmtInfId>/SS2<', '<InstrId>/KS3<', '/UD-PMT', 'UD//TX', 'DIC2/', '<Id>/VS9<', 'A//B', 'X//Y'].every((t) => xml.includes(t)));
    const n = nalezy(diagnose({ xml, bank: 'tatrabanka', dnes: DNES_PRED }));
    const podla = (re) => n.filter((p) => re.test(p.path));
    eq('lomky: sedem miest, sedem nálezov', n.length, 7);
    eq('lomky: MsgId /VS1 sa hlási, výnimka /VS platí len pre EndToEndId', (podla(/GrpHdr\/MsgId$/)[0] || {}).fix, 'VS1');
    eq('lomky: PmtInfId /SS2 sa hlási', (podla(/PmtInf\[1\]\/PmtInfId$/)[0] || {}).fix, 'SS2');
    eq('lomky: InstrId /KS3 sa hlási', (podla(/PmtId\/InstrId$/)[0] || {}).fix, 'KS3');
    eq('lomky: UltmtDbtr na úrovni PmtInf', (podla(/PmtInf\[1\]\/UltmtDbtr\/Id\/OrgId\/Othr\/Id$/)[0] || {}).fix, 'UD-PMT');
    eq('lomky: UltmtDbtr na úrovni transakcie', (podla(/CdtTrfTxInf\[1\]\/UltmtDbtr\/Id\/PrvtId\/Othr\/Id$/)[0] || {}).fix, 'UD/TX');
    eq('lomky: UltmtCdtr, výnimka /VS sa naň nevzťahuje', (podla(/CdtTrfTxInf\[1\]\/UltmtCdtr\/Id\/OrgId\/Othr\/Id$/)[0] || {}).fix, 'VS9');
    eq('lomky: druhé Othr má v ceste Othr[2]', (podla(/Cdtr\/Id\/OrgId\/Othr\[2\]\/Id$/)[0] || {}).fix, 'DIC2');
    ok('lomky: prvé Othr bez lomky sa nehlási', podla(/Othr\[1\]/).length === 0);
    ok('lomky: SchmeNm/Prtry a Issr sa nehlásia', !n.some((p) => p.value === 'A//B' || p.value === 'X//Y'));
    ok('lomky: všetky nálezy sú medium', n.every((p) => p.severity === 'medium'));
  }

  // Dve lomky pred symbolom: oprava musí nechať jednu lomku konvencie.
  {
    const s = clone(PASS_SPEC);
    s.pmtInf[0].tx[0].endToEndId = '//VS123/SS456/KS0308';
    const n = nalezy(run(s, 'tatrabanka'));
    eq('lomky: //VS123/SS456/KS0308 jeden nález', n.length, 1);
    eq('lomky: //VS oprava zachová lomku konvencie', n[0] && n[0].fix, '/VS123/SS456/KS0308');
    ok('lomky: //VS hláška hovorí o dvoch lomkách, nie o začiatku lomkou',
      !!n[0] && n[0].message.includes('obsahuje dve lomky za sebou') && !n[0].message.includes('začína lomkou'));
    const s2 = clone(PASS_SPEC);
    s2.pmtInf[0].tx[0].endToEndId = n[0] ? n[0].fix : '';
    const r2 = run(s2, 'tatrabanka');
    eq('lomky: navrhnutá hodnota /VS123/SS456/KS0308 už nález nemá', nalezy(r2).length, 0);
    eq('lomky: súbor s navrhnutou hodnotou je pass', r2.status, 'pass');
    const s3 = clone(PASS_SPEC);
    s3.pmtInf[0].tx[0].endToEndId = '///vs123/ss456/ks0308';
    eq('lomky: malé písmená a tri lomky, oprava zachová jednu', (nalezy(run(s3, 'tatrabanka'))[0] || {}).fix, '/vs123/ss456/ks0308');
  }

  // Pridlhé EndToEndId s "//": oba nálezy navrhnú tú istú, platnú hodnotu.
  {
    const s = clone(PASS_SPEC);
    const dlhe = 'FAKTURA-2026-000123//ODBERATEL-0045/STREDISKO-7';
    s.pmtInf[0].tx[0].endToEndId = dlhe;
    const r = run(s, 'tatrabanka');
    const lom = nalezy(r)[0];
    const dlz = r.problems.find((p) => p.code === 'end_to_end_id_too_long');
    ok('lomky + dĺžka: fixture je dlhšia ako 35 znakov', dlhe.length > 35);
    ok('lomky + dĺžka: oba nálezy existujú', !!lom && !!dlz);
    eq('lomky + dĺžka: oba návrhy sú rovnaké', lom && lom.fix, dlz && dlz.fix);
    ok('lomky + dĺžka: návrh má najviac 35 znakov', !!lom && lom.fix.length <= 35 && lom.fix.length > 0);
    ok('lomky + dĺžka: návrh neporušuje pravidlo o lomkách', !!lom && !/\/\/|^\/|\/$/.test(lom.fix));
    const s2 = clone(PASS_SPEC);
    s2.pmtInf[0].tx[0].endToEndId = lom ? lom.fix : '';
    const r2 = run(s2, 'tatrabanka');
    ok('lomky + dĺžka: navrhnutá hodnota prejde oboma kontrolami',
      nalezy(r2).length === 0 && !r2.problems.some((p) => p.code === 'end_to_end_id_too_long'));
    // Pridlhé bez lomiek: návrh ostáva prvých 35 znakov ako doteraz.
    const s3 = clone(PASS_SPEC);
    s3.pmtInf[0].tx[0].endToEndId = 'A'.repeat(40);
    eq('dĺžka bez lomiek: návrh je prvých 35 znakov',
      (run(s3, 'tatrabanka').problems.find((p) => p.code === 'end_to_end_id_too_long') || {}).fix, 'A'.repeat(35));
  }

  // Viac transakcií naraz: každá chybná má vlastný nález s vlastnou cestou.
  {
    const s = clone(PASS_SPEC);
    const zaklad = s.pmtInf[0].tx[0];
    const idcka = ['A//1', 'B/2', '/C3', 'D4/', '/VS5/SS/KS', 'E-6'];
    s.pmtInf[0].tx = idcka.map((id) => Object.assign(clone(zaklad), { endToEndId: id, amount: '1.00' }));
    s.nbOfTxs = idcka.length;
    s.ctrlSum = '6.00';
    for (const [verzia, xml] of [['.03', buildPain001(s)], ['.09', na09(buildPain001(s))]]) {
      const n = nalezy(diagnose({ xml, bank: 'tatrabanka', dnes: DNES_PRED }));
      eq(`lomky ${verzia}: zo šiestich transakcií tri chybné`, n.length, 3);
      eq(`lomky ${verzia}: hodnoty v poradí súboru`, n.map((p) => p.value).join(' '), 'A//1 /C3 D4/');
      eq(`lomky ${verzia}: opravy v poradí súboru`, n.map((p) => p.fix).join(' '), 'A/1 C3 D4');
      eq(`lomky ${verzia}: cesty menujú správne transakcie`,
        n.map((p) => (p.path.match(/CdtTrfTxInf\[(\d+)\]/) || [])[1]).join(','), '1,3,4');
    }
  }
}

// ───────── Zmeny 19. 11. 2026 (zadanie sepa-09): termín adries ─────────
// EPC 30. 10. 2026: PSMB 29. 10. 2026 nový termín konca neštruktúrovanej
// adresy neurčil, vráti sa k nemu do februára 2027. Veta „nový termín určí v októbri
// 2026“ bola nepravdivá v motore aj na stránkach.
// https://www.europeanpaymentscouncil.eu/news-insights/news/epc-defers-setting-new-end-date-unstructured-address-format-until-february-2027
{
  const volna = '<PstlAdr><AdrLine>Hlavna 1</AdrLine><AdrLine>81101 Bratislava</AdrLine></PstlAdr>';
  const ocakavane = {
    sk: { nove: 'do februára 2027', stare: /v októbri 2026/ },
    en: { nove: 'by February 2027', stare: /in October 2026/ },
    de: { nove: 'bis Februar 2027', stare: /im Oktober 2026/ },
  };
  for (const lang of ['sk', 'en', 'de']) {
    const n = diagnose({ xml: adrXml(volna, ''), bank: 'tatrabanka', dnes: DNES_PO, lang })
      .problems.find((p) => p.code === 'adresa_nestrukturovana');
    ok(`termín adries ${lang}: nález voľnej adresy existuje`, !!n);
    ok(`termín adries ${lang}: hláška hovorí o rozhodnutí do februára 2027`, !!n && n.message.includes(ocakavane[lang].nove), n && n.message);
    ok(`termín adries ${lang}: hláška nesľubuje termín v októbri 2026`, !!n && !ocakavane[lang].stare.test(n.message));
    ok(`termín adries ${lang}: hláška menuje rozhodnutie z 29. 10. 2026`, !!n && /29\. 10\. 2026|29 October 2026|29\. Oktober 2026/.test(n.message));
    ok(`termín adries ${lang}: bez pomlčiek em a en`, !!n && !/[–—]/.test(n.message));
  }
  for (const [stranka, stare, nove] of [
    ['index.html', /v októbri 2026/, /februára 2027/],
    ['en/index.html', /in October 2026/, /February 2027/],
    ['de/index.html', /im Oktober 2026/, /Februar 2027/],
  ]) {
    const html = readFileSync(new URL('./' + stranka, import.meta.url), 'utf8');
    // Každá stránka nesie v skripte slovníky všetkých troch jazykov.
    const STARE = /v októbri 2026|in October 2026|im Oktober 2026/;
    ok(`termín adries ${stranka}: stránka nesľubuje nový termín v októbri 2026`, !STARE.test(html), (html.match(/.{0,80}(v októbri|in October|im Oktober) 2026.{0,40}/) || [])[0]);
    ok(`termín adries ${stranka}: stránka hovorí o rozhodnutí do februára 2027`, nove.test(html));
    ok(`termín adries ${stranka}: stránka bez starej vety`, !stare.test(html));
  }
}

// ───────── Zmeny 19. 11. 2026 (zadanie sepa-09): verzia .09 podľa banky ─────────
// Pôvodne motor pri každom súbore .09 radil „pošlite ten istý súbor vo verzii
// .03“ a kontrolný zoznam žiadal „presne pain.001.001.03, nie novšiu verziu“.
// Zdroje štyroch bánk čítané 19. 11. 2026 (ops/sepa-doctor/ZMENY-2026-11-19-verzia09.md
// v koreňovom repe) uvádzajú pre import .09 (VÚB a ČSOB aj .03 výslovne,
// SLSP zverejňuje obe špecifikácie, Tatra banka vzory .09 a popis .03).
{
  const na09 = (x) => x
    .replace('pain.001.001.03', 'pain.001.001.09')
    .replace(/<ReqdExctnDt>([^<]+)<\/ReqdExctnDt>/g, '<ReqdExctnDt><Dt>$1</Dt></ReqdExctnDt>')
    .replace(/<BIC>/g, '<BICFI>').replace(/<\/BIC>/g, '</BICFI>');
  const BIC = { tatrabanka: 'TATRSKBX', slsp: 'GIBASKBX', vub: 'SUBASKBX', csob: 'CEKOSKBX' };
  const subor03 = (banka) => buildPain001(PASS_SPEC).replace(/TATRSKBX/g, BIC[banka] || 'TATRSKBX');
  const ZLA_RADA = /vo verzii \.03|as \.03|als \.03|presne pain\.001\.001\.03|exactly pain\.001\.001\.03|genau pain\.001\.001\.03|bežne očakávajú|normally expect|üblicherweise/;
  const texty = (r) => r.problems.map((p) => p.message).concat(r.checklist, [r.summary]).join('\n');

  // Štyri banky: súbor .09 nemá poznámku o verzii a žiadny text neradí .03.
  for (const banka of ['tatrabanka', 'slsp', 'vub', 'csob']) {
    const x09 = na09(subor03(banka));
    ok(`verzia .09 ${banka}: fixture je naozaj .09`, x09.includes('pain.001.001.09') && x09.includes('<BICFI>'));
    for (const lang of ['sk', 'en', 'de']) {
      const r = diagnose({ xml: x09, bank: banka, dnes: DNES_PRED, lang });
      lacks(`verzia .09 ${banka} ${lang}: bez poznámky schema_namespace_09_skoro`, r.problems, 'schema_namespace_09_skoro');
      ok(`verzia .09 ${banka} ${lang}: žiadny text neradí návrat na .03`, !ZLA_RADA.test(texty(r)), (texty(r).match(new RegExp('.{0,60}(' + ZLA_RADA.source + ').{0,40}')) || [])[0]);
      ok(`verzia .09 ${banka} ${lang}: texty bez pomlčiek em a en`, !/[–—]/.test(r.checklist.join(' ')));
    }
    // Súbor .09 má presne tie isté nálezy ako ten istý súbor .03 (pri SLSP
    // ostáva jej vlastná poznámka slsp_instant_flag_absent, ktorá s verziou
    // nesúvisí), teda verzia sama nič nepridáva.
    const r = diagnose({ xml: x09, bank: banka, dnes: DNES_PRED });
    const r03 = diagnose({ xml: subor03(banka), bank: banka, dnes: DNES_PRED });
    eq(`verzia .09 ${banka}: rovnaké nálezy ako pri .03`, r.problems.map((p) => p.code).join(','), r03.problems.map((p) => p.code).join(','));
    eq(`verzia .09 ${banka}: rovnaký stav ako pri .03`, r.status, r03.status);
    if (banka !== 'slsp') eq(`verzia .09 ${banka}: čistý súbor .09 je pass`, r.status, 'pass');
  }

  // Kontrolný zoznam hovorí presne podľa vybranej banky, v troch jazykoch.
  const ZNAK = {
    tatrabanka: { sk: ['12. 11. 2026', 'vo verzii .09', 'anglické znenie čítané 19. 11. 2026'], en: ['12 November 2026', 'export the file as .09'], de: ['12. November 2026', 'exportieren Sie sie als .09'] },
    slsp: { sk: ['Business24', 'pain.001.001.03 aj pain.001.001.09', 'koniec .03 neuvádza'], en: ['Business24', 'no end date for .03'], de: ['Business24', 'kein Ende für .03'] },
    vub: { sk: ['„Povolené sú xsd schémy pain.001.001.03 a pain.001.001.09.“', 'MultiCash'], en: ['Povolené sú xsd schémy pain.001.001.03 a pain.001.001.09.', 'MultiCash'], de: ['Povolené sú xsd schémy pain.001.001.03 a pain.001.001.09.', 'MultiCash'] },
    csob: { sk: ['naďalej podporovať', 'odporúča .09'], en: ['keep supporting .03', 'recommends .09'], de: ['weiter unterstützt', 'empfiehlt ČSOB .09'] },
    generic: { sk: ['dokumentácii svojej banky'], en: ["your bank's documentation"], de: ['Dokumentation Ihrer Bank'] },
  };
  const verziaRiadok = (banka, lang, xml) => diagnose({ xml: xml || subor03(banka), bank: banka, dnes: DNES_PRED, lang })
    .checklist.find((c) => /^(Verzia súboru|File version|Dateiversion):/.test(c));
  for (const banka of Object.keys(ZNAK)) {
    for (const lang of ['sk', 'en', 'de']) {
      const c = verziaRiadok(banka, lang);
      ok(`chkVerzia ${banka} ${lang}: riadok o verzii existuje`, !!c);
      for (const z of ZNAK[banka][lang]) ok(`chkVerzia ${banka} ${lang}: obsahuje „${z}“`, !!c && c.includes(z), c);
      ok(`chkVerzia ${banka} ${lang}: nežiada presne .03`, !!c && !ZLA_RADA.test(c));
      ok(`chkVerzia ${banka} ${lang}: bez pomlčiek em a en`, !!c && !/[–—]/.test(c));
      // Tatra banka: rada „ak import .03 neprejde, exportujte .09“ len pri súbore .03
      // (brána sepa-09, pokus 2, bod 4); inak rovnaký riadok pri .03 aj .09.
      const c09 = verziaRiadok(banka, lang, na09(subor03(banka)));
      if (banka === 'tatrabanka') ok(`chkVerzia ${banka} ${lang}: pri .09 ten istý riadok bez rady o .03`, !!c09 && c09 !== c && c.startsWith(c09 + ' '), c09);
      else eq(`chkVerzia ${banka} ${lang}: rovnaký riadok pri .03 aj .09`, c09, c);
    }
  }
  ok('chkVerzia: päť rôznych textov pre päť volieb banky',
    new Set(Object.keys(ZNAK).map((b) => verziaRiadok(b, 'sk'))).size === 5);
  ok('chkVerzia: SK, EN a DE sa líšia', new Set(['sk', 'en', 'de'].map((l) => verziaRiadok('vub', l))).size === 3);

  // Obmedzenia Tatra banky pre .09 len pri Tatra banke a súbore .09.
  const tatra09 = (banka, xml, lang) => diagnose({ xml, bank: banka, dnes: DNES_PRED, lang }).checklist
    .some((c) => c.includes('2.118') && c.includes('Strd'));
  ok('chkTatra09: Tatra banka a .09 má riadok o obmedzeniach', tatra09('tatrabanka', na09(subor03('tatrabanka'))));
  ok('chkTatra09: aj v EN a DE', tatra09('tatrabanka', na09(subor03('tatrabanka')), 'en') && tatra09('tatrabanka', na09(subor03('tatrabanka')), 'de'));
  ok('chkTatra09: Tatra banka a .03 riadok nemá', !tatra09('tatrabanka', subor03('tatrabanka')));
  ok('chkTatra09: SLSP a .09 riadok nemá', !tatra09('slsp', na09(subor03('slsp'))));
  ok('chkTatra09: iná banka a .09 riadok nemá', !tatra09('generic', na09(subor03('tatrabanka'))));

  // Iná banka: nízka poznámka ostáva, ale bez rady o .03, v troch jazykoch.
  for (const lang of ['sk', 'en', 'de']) {
    const r = diagnose({ xml: na09(subor03('tatrabanka')), bank: 'generic', dnes: DNES_PRED, lang });
    const n = r.problems.find((p) => p.code === 'schema_namespace_09_skoro');
    ok(`verzia .09 iná banka ${lang}: poznámka ostáva`, !!n);
    eq(`verzia .09 iná banka ${lang}: nízka závažnosť`, n && n.severity, 'low');
    ok(`verzia .09 iná banka ${lang}: poznámka neradí .03`, !!n && !ZLA_RADA.test(n.message) && !/\.03/.test(n.message), n && n.message);
    ok(`verzia .09 iná banka ${lang}: menuje štyri banky`, !!n && ['Tatra banka', 'Slovenská sporiteľňa', 'VÚB', 'ČSOB'].every((b) => n.message.includes(b)));
    ok(`verzia .09 iná banka ${lang}: bez pomlčiek em a en`, !!n && !/[–—]/.test(n.message));
  }

  // Neznámy menný priestor: text o bankách spomína .03 aj .09.
  for (const [lang, slovo] of [['sk', 'pain.001.001.03 alebo .09'], ['en', 'pain.001.001.03 or .09'], ['de', 'pain.001.001.03 oder .09']]) {
    const x = buildPain001(PASS_SPEC).replace('pain.001.001.03', 'urn:priklad:pain');
    const n = diagnose({ xml: x, bank: 'tatrabanka', dnes: DNES_PRED, lang }).problems.find((p) => p.code === 'schema_namespace_unexpected');
    ok(`neznámy menný priestor ${lang}: banky uvádzajú .03 alebo .09`, !!n && n.message.includes(slovo), n && n.message);
  }
}

// ───────── Zmeny 19. 11. 2026: odporúčania brány lomiek (pokus 2) ─────────
{
  const KOD = 'identifier_slash_rule';
  const lom = (r) => r.problems.find((p) => p.code === KOD);
  const sE2E = (id) => { const s = clone(PASS_SPEC); s.pmtInf[0].tx[0].endToEndId = id; return buildPain001(s); };
  const diag = (xml, lang) => diagnose({ xml, bank: 'tatrabanka', dnes: DNES_PRED, lang });

  // (1) Konvencia /VS s "//": veta, že úvodná lomka je slovenská konvencia.
  {
    const konv = { sk: 'slovenská konvencia', en: 'Slovak convention', de: 'slowakische Konvention' };
    for (const lang of ['sk', 'en', 'de']) {
      const n = lom(diag(sE2E('/VS123//SS456/KS0308'), lang));
      ok(`lomky konvencia ${lang}: veta o slovenskej konvencii`, !!n && n.message.includes(konv[lang]), n && n.message);
      ok(`lomky konvencia ${lang}: bez pomlčiek`, !!n && !/[–—]/.test(n.message));
      const bez = lom(diag(sE2E('0000000099//2026-11-12/BO-1'), lang));
      ok(`lomky konvencia ${lang}: bez symbolov veta o konvencii nie je`, !!bez && !bez.message.includes(konv[lang]));
      const msg = lom(diag(buildPain001(PASS_SPEC).replace('<MsgId>MSG-0001</MsgId>', '<MsgId>/VS1</MsgId>'), lang));
      ok(`lomky konvencia ${lang}: MsgId /VS1 vetu o konvencii nemá (výnimka len pre EndToEndId)`, !!msg && !msg.message.includes(konv[lang]));
    }
  }

  // (2) MsgId nad 35 znakov s "//": oba návrhy rovnaké, platné, do 35 znakov.
  {
    const dlhy = 'AAAAAAAAAAAAAAAAAAAA//BBBBBBBBBBBBBBBBBBBB';
    const xml = buildPain001(PASS_SPEC).replace('<MsgId>MSG-0001</MsgId>', `<MsgId>${dlhy}</MsgId>`);
    ok('MsgId + lomky: fixture sa zapísala a je dlhšia ako 35', xml.includes(dlhy) && dlhy.length > 35);
    const r = diag(xml);
    const l = lom(r);
    const d = r.problems.find((p) => p.code === 'msg_id_too_long');
    ok('MsgId + lomky: oba nálezy existujú', !!l && !!d);
    eq('MsgId + lomky: oba návrhy sú rovnaké', l && l.fix, d && d.fix);
    ok('MsgId + lomky: návrh má 1 až 35 znakov', !!l && l.fix.length <= 35 && l.fix.length > 0, l && l.fix);
    ok('MsgId + lomky: návrh neporušuje pravidlo o lomkách', !!l && !/\/\/|^\/|\/$/.test(l.fix));
    const r2 = diag(buildPain001(PASS_SPEC).replace('<MsgId>MSG-0001</MsgId>', `<MsgId>${l ? l.fix : ''}</MsgId>`));
    ok('MsgId + lomky: navrhnutá hodnota prejde oboma kontrolami',
      !lom(r2) && !r2.problems.some((p) => p.code === 'msg_id_too_long'));
    const r3 = diag(buildPain001(PASS_SPEC).replace('<MsgId>MSG-0001</MsgId>', `<MsgId>${'M'.repeat(40)}</MsgId>`));
    eq('MsgId pridlhý bez lomiek: návrh ostáva prvých 35 znakov',
      (r3.problems.find((p) => p.code === 'msg_id_too_long') || {}).fix, 'M'.repeat(35));
  }

  // (3) /SS456//VS123/KS0308: návrh lomiek dá rovno kanonické poradie.
  {
    const r = diag(sE2E('/SS456//VS123/KS0308'));
    const l = lom(r);
    const p = r.problems.find((x) => x.code === 'reference_symbol_order');
    eq('lomky + poradie: návrh lomiek je kanonický', l && l.fix, '/VS123/SS456/KS0308');
    // Brána sepa-09, pokus 2, bod 2: reference_symbol_order rovnaký návrh nezopakuje.
    ok('lomky + poradie: nález poradia ostáva', !!p);
    eq('lomky + poradie: reference_symbol_order rovnaký návrh nezopakuje', p && p.fix, '');
    const r2 = diag(sE2E(l ? l.fix : ''));
    ok('lomky + poradie: navrhnutá hodnota nemá nález lomiek ani poradia',
      !lom(r2) && !r2.problems.some((x) => x.code === 'reference_symbol_order'));
    eq('lomky + poradie: správne poradie s "//" ostáva len zlúčené', (lom(diag(sE2E('/VS1//SS2/KS3'))) || {}).fix, '/VS1/SS2/KS3');
  }

  // (4) Zoznam porušení sa spája slovom a / and / und.
  {
    const tri = {
      sk: 'začína lomkou, obsahuje dve lomky za sebou a končí lomkou',
      en: 'starts with a slash, contains two consecutive slashes and ends with a slash',
      de: 'beginnt mit einem Schrägstrich, enthält zwei aufeinanderfolgende Schrägstriche und endet mit einem Schrägstrich',
    };
    const dve = {
      sk: 'obsahuje dve lomky za sebou a končí lomkou',
      en: 'contains two consecutive slashes and ends with a slash',
      de: 'enthält zwei aufeinanderfolgende Schrägstriche und endet mit einem Schrägstrich',
    };
    for (const lang of ['sk', 'en', 'de']) {
      const n3 = lom(diag(sE2E('/A///B/'), lang));
      ok(`lomky spojka ${lang}: tri porušenia`, !!n3 && n3.message.includes(tri[lang]), n3 && n3.message);
      const n2 = lom(diag(sE2E('FA//1/'), lang));
      ok(`lomky spojka ${lang}: dve porušenia bez čiarky`, !!n2 && n2.message.includes(dve[lang]), n2 && n2.message);
      ok(`lomky spojka ${lang}: dve porušenia nemajú čiarku pred spojkou`, !!n2 && !/, (a|and|und) /.test(n2.message.split('. ')[0]));
    }
  }

  // (5) Návrh je aj v EN a DE hláške.
  {
    const OPRAVA = '0000000099/2026-11-12/BO-1';
    const slovo = { en: 'Suggested value: "', de: 'Vorschlag: "' };
    for (const lang of ['en', 'de']) {
      const n = lom(diag(sE2E('0000000099//2026-11-12/BO-1'), lang));
      ok(`lomky ${lang}: hláška nesie návrh`, !!n && n.message.includes(slovo[lang] + OPRAVA + '"'), n && n.message);
      eq(`lomky ${lang}: pole fix nesie návrh`, n && n.fix, OPRAVA);
    }
  }
}

// ───────── Oprava po bráne sepa-09, pokus 1 (19. 11. 2026) ─────────
// Zápis brány: ops/ai/kontrola/2026-11-19-sepa-doctor-09.md v koreňovom repe.
{
  const NS03 = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
  const NS09 = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09';
  const na09 = (x) => x
    .replace('pain.001.001.03', 'pain.001.001.09')
    .replace(/<ReqdExctnDt>([^<]+)<\/ReqdExctnDt>/g, '<ReqdExctnDt><Dt>$1</Dt></ReqdExctnDt>')
    .replace(/<BIC>/g, '<BICFI>').replace(/<\/BIC>/g, '</BICFI>');
  const x03 = buildPain001(PASS_SPEC);
  const x09 = na09(x03);
  const d = (xml, bank, lang) => diagnose({ xml, bank: bank || 'tatrabanka', dnes: DNES_PRED, lang });

  // N1: riadok „očakávaný menný priestor“ ukazuje verziu súboru, pri .09 nie .03.
  for (const banka of ['tatrabanka', 'slsp', 'vub', 'csob', 'generic']) {
    eq(`N1 ${banka}: pri .09 sa očakáva .09`, d(x09, banka).expected.schemaNamespace, NS09);
    eq(`N1 ${banka}: pri .03 sa očakáva .03`, d(x03, banka).expected.schemaNamespace, NS03);
  }
  ok('N1: pred vložením súboru (expectedValues) obe verzie',
    expectedValues({ bank: 'tatrabanka' }).schemaNamespace.includes(NS03) && expectedValues({ bank: 'tatrabanka' }).schemaNamespace.includes(NS09));
  eq('N1: expectedValues zoznam verzií', (expectedValues({ bank: 'vub' }).schemaNamespaces || []).join(' '), NS03 + ' ' + NS09);
  ok('N1: prázdny vstup neukazuje len .03', d('').expected.schemaNamespace !== NS03);

  // N3: chýbajúci xmlns: návrh podľa štruktúry súboru, text bez „štyri banky spracúvajú .03“.
  {
    const bez09 = x09.replace(` xmlns="${NS09}"`, '');
    const bez03 = x03.replace(` xmlns="${NS03}"`, '');
    ok('N3: fixtúry bez xmlns', !bez09.includes('xmlns=') && !bez03.includes('xmlns='));
    const n09 = d(bez09).problems.find((p) => p.code === 'schema_namespace_missing');
    const n03 = d(bez03).problems.find((p) => p.code === 'schema_namespace_missing');
    eq('N3: súbor so štruktúrou .09 bez xmlns dostane návrh .09', n09 && n09.fix, `xmlns="${NS09}"`);
    eq('N3: súbor so štruktúrou .03 bez xmlns dostane návrh .03', n03 && n03.fix, `xmlns="${NS03}"`);
    eq('N3: očakávaný menný priestor sedí s návrhom', d(bez09).expected.schemaNamespace, NS09);
    const neznamy = d(x09.replace(NS09, 'urn:priklad:x')).problems.find((p) => p.code === 'schema_namespace_unexpected');
    eq('N3: neznámy xmlns pri štruktúre .09 dostane návrh .09', neznamy && neznamy.fix, `xmlns="${NS09}"`);
    for (const lang of ['sk', 'en', 'de']) {
      const n = d(bez09, 'tatrabanka', lang).problems.find((p) => p.code === 'schema_namespace_missing');
      ok(`N3 ${lang}: text netvrdí, že štyri banky spracúvajú .03`, !!n && !/štyri banky spracúvajú|four banks process|vier Banken verarbeiten/.test(n.message), n && n.message);
      ok(`N3 ${lang}: text spomína .03 aj .09`, !!n && n.message.includes('pain.001.001.03') && n.message.includes('.09'));
      ok(`N3 ${lang}: text nesie návrh`, !!n && n.message.includes(NS09));
    }
  }

  // N4: VÚB .09 len povoľuje, nezverejňuje k nej popis ani vzory.
  for (const [lang, presne] of [['sk', 'VÚB a ČSOB výslovne ako povolenú'], ['en', 'VÚB and ČSOB explicitly as allowed'], ['de', 'VÚB und ČSOB ausdrücklich als erlaubt']]) {
    const n = d(x09, 'generic', lang).problems.find((p) => p.code === 'schema_namespace_09_skoro');
    ok(`N4 ${lang}: poznámka rozlišuje VÚB a ČSOB (povolené) od SLSP a Tatra banky (popis, vzory)`, !!n && n.message.includes(presne), n && n.message);
    ok(`N4 ${lang}: netvrdí, že všetky štyri zverejňujú popis alebo vzory`, !!n && !/zverejňujú popis alebo vzory|publish an import description or samples|veröffentlichen dafür/.test(n.message));
  }
  const citaj = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  ok('N4: README netvrdí, že všetky štyri zverejňujú popis alebo vzory .09', !/all four publish import descriptions or samples/.test(citaj('README.md')));
  ok('N4: llms.txt netvrdí, že všetky štyri zverejňujú popis alebo vzory .09', !/publish import descriptions or samples for `\.09`/.test(citaj('llms.txt')));
  ok('N4: llms-full.txt netvrdí „no longer gives that date“', !/no longer gives that date/.test(citaj('llms-full.txt')));

  // N2: FAQ o Tatra banke (viditeľná odpoveď aj JSON-LD) netvrdí presný menný priestor .03.
  for (const [stranka, stare, nove] of [
    ['index.html', 'presný menný priestor pain.001.001.03', 'vzory pre pain.001.001.09'],
    ['en/index.html', 'exact namespace pain.001.001.03', 'samples for pain.001.001.09'],
    ['de/index.html', 'exakte Namensraum pain.001.001.03', 'Muster für pain.001.001.09'],
  ]) {
    const html = citaj(stranka);
    ok(`N2 ${stranka}: FAQ o Tatra banke bez „presný menný priestor .03“`, !html.includes(stare));
    eq(`N2 ${stranka}: FAQ o Tatra banke spomína .09 v odpovedi aj v JSON-LD`, html.split(nove).length - 1, 2);
    ok(`N2 ${stranka}: JSON-LD ostáva platný JSON`, [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].every((m) => { try { JSON.parse(m[1]); return true; } catch { return false; } }));
  }

  // O1: kanonické poradie len pri hodnote zloženej iba zo symbolov; obsah sa nestratí.
  {
    const sE2E = (id) => { const s = clone(PASS_SPEC); s.pmtInf[0].tx[0].endToEndId = id; return buildPain001(s); };
    const lom = (id) => (d(sE2E(id)).problems.find((p) => p.code === 'identifier_slash_rule') || {}).fix;
    // Od 19. 11. 2026 (brána sepa-09, pokus 2, bod 1) aj kanonické poradie.
    eq('O1: /SS1//VS2/KS3/FA2026-001 zachová číslo faktúry', lom('/SS1//VS2/KS3/FA2026-001'), '/VS2/SS1/KS3/FA2026-001');
    eq('O1: /SS456//VS123/KS0308 (len symboly) dá kanonické poradie', lom('/SS456//VS123/KS0308'), '/VS123/SS456/KS0308');
    eq('O1: /SS1//VS2/ (len symboly, lomka na konci) dá kanonické poradie', lom('/SS1//VS2/'), '/VS2/SS1/KS');
  }

  // O2: dlhý MsgId začínajúci /VS (výnimka konvencie pre MsgId neplatí).
  {
    const dlhy = '/VS1' + 'A'.repeat(40);
    const r = d(x03.replace('<MsgId>MSG-0001</MsgId>', `<MsgId>${dlhy}</MsgId>`));
    const l = r.problems.find((p) => p.code === 'identifier_slash_rule');
    const m = r.problems.find((p) => p.code === 'msg_id_too_long');
    eq('O2: oba návrhy pre dlhý MsgId /VS… sú rovnaké', l && l.fix, m && m.fix);
    ok('O2: návrh bez úvodnej lomky a do 35 znakov', !!l && !l.fix.startsWith('/') && l.fix.length <= 35, l && l.fix);
  }

  // O3 sa vedome nerobí: fixes sa s nálezmi s návrhom párujú podľa indexu
  // (lievik.test.mjs, strop 3 hodnôt). Test stráži, aby to tak ostalo.
  {
    const s = clone(PASS_SPEC); s.pmtInf[0].tx[0].endToEndId = '/SS456//VS123/KS0308';
    const r = d(buildPain001(s));
    const sNavrhom = r.problems.filter((p) => p.fix);
    eq('O3: fixes majú rovnaký počet ako nálezy s návrhom', r.fixes.length, sNavrhom.length);
    ok('O3: fixes[i] je návrh i-teho nálezu', r.fixes.every((f, i) => f.value === sNavrhom[i].fix && f.where === sNavrhom[i].path));
  }

  // O4: ČSOB a .03 s podmienkou banky o adresách.
  for (const [lang, podm] of [['sk', 'ak adresy nepoužívate alebo ich zapisujete štruktúrovane'], ['en', 'leave addresses out or write them in structured form'], ['de', 'keine Adressen verwenden oder sie strukturiert schreiben']]) {
    ok(`O4 ${lang}: ČSOB .03 s podmienkou o adresách`, d(x03.replace(/TATRSKBX/g, 'CEKOSKBX'), 'csob', lang).checklist.some((c) => c.includes(podm)));
  }

  // O5: termín adries podľa znenia EPC („will reconvene … to decide“), nie „rozhodne“.
  for (const f of ['doctor-pain001.js', 'index.html', 'en/index.html', 'de/index.html']) {
    const t = citaj(f);
    ok(`O5 ${f}: bez „rozhodne o ňom / will decide on one / darüber entscheidet er“`, !/rozhodne o ňom do februára|will decide on one by February|darüber entscheidet er bis Februar/.test(t));
  }
}

// ───────── Odporúčania brány sepa-09, pokus 2 (body 1 až 6) a O8 (19. 11. 2026) ─────────
// Zadanie: ops/druhy-ucet/gmail/zadanie-sepa-hub.md, bod 4; záznam
// ops/druhy-ucet/gmail/sepa-hub/vysledok-O8.md v koreňovom repe.
{
  const NS03 = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
  const NS09 = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09';
  const na09 = (x) => x
    .replace('pain.001.001.03', 'pain.001.001.09')
    .replace(/<ReqdExctnDt>([^<]+)<\/ReqdExctnDt>/g, '<ReqdExctnDt><Dt>$1</Dt></ReqdExctnDt>')
    .replace(/<BIC>/g, '<BICFI>').replace(/<\/BIC>/g, '</BICFI>');
  const d = (xml, bank, lang) => diagnose({ xml, bank: bank || 'tatrabanka', dnes: DNES_PRED, lang });
  const sE2E = (id) => { const s = clone(PASS_SPEC); s.pmtInf[0].tx[0].endToEndId = id; return buildPain001(s); };
  const najdi = (r, kod) => r.problems.find((p) => p.code === kod);
  const ZAKAZ_ISTOTY = /odmietne|zamietne|will be rejected|rejects it|wird zurückgewiesen|weist .* zurück/;

  // Bod 1: kanonické poradie nechá text za symbolmi; návrh po dosadení je čistý.
  {
    const v = '/SS1//VS2/KS3/FA2026-001';
    const r = d(sE2E(v));
    const l = najdi(r, 'identifier_slash_rule');
    eq('bod 1: návrh lomiek dá kanonické poradie a zachová číslo faktúry', l && l.fix, '/VS2/SS1/KS3/FA2026-001');
    const r2 = d(sE2E(l ? l.fix : v));
    ok('bod 1: dosadený návrh nemá nález lomiek ani poradia',
      !najdi(r2, 'identifier_slash_rule') && !najdi(r2, 'reference_symbol_order'),
      r2.problems.map((p) => p.code).join(','));
    eq('bod 1: reference_symbol_order bez lomiek tiež zachová číslo faktúry',
      fixOf(d(sE2E('/SS1/VS2/KS3/FA2026-001')).problems, 'reference_symbol_order'), '/VS2/SS1/KS3/FA2026-001');
    ok('bod 1: text pred symbolmi sa nestratí', (fixOf(d(sE2E('FA1/SS2/VS1')).problems, 'reference_symbol_order') || '').includes('FA1'));
    // Pridlhá hodnota: návrh poradia aj návrh skrátenia sú rovnaké a do 35 znakov.
    const dlhy = '/SS1/VS2/KS3/' + 'X'.repeat(25);
    const rd = d(sE2E(dlhy));
    // Brána sepa-hub pokus 1, O2: rovnaký návrh nesie len end_to_end_id_too_long,
    // poradie druhú rovnakú kartu opravy nedá (addProblem zapíše chýbajúci návrh ako '').
    const poradie = fixOf(rd.problems, 'reference_symbol_order');
    const skratenie = fixOf(rd.problems, 'end_to_end_id_too_long');
    ok('bod 1: pridlhá hodnota, návrh skrátenia má najviac 35 znakov a kanonické poradie', !!skratenie && skratenie.length <= 35 && skratenie.startsWith('/VS2/SS1/KS3'), skratenie);
    eq('bod 1: pridlhá hodnota, poradie nenesie druhý rovnaký návrh', poradie, '');
  }

  // Bod 2: jedna karta opravy, keď oba nálezy navrhujú tú istú hodnotu.
  for (const v of ['/SS456//VS123/KS0308', '/SS1//VS2/KS3/FA2026-001']) {
    const r = d(sE2E(v));
    const navrh = (najdi(r, 'identifier_slash_rule') || {}).fix;
    eq(`bod 2 ${v}: návrh je vo fixes práve raz`, r.fixes.filter((f) => f.value === navrh).length, 1);
    ok(`bod 2 ${v}: nález poradia ostáva`, !!najdi(r, 'reference_symbol_order'));
    const sNavrhom = r.problems.filter((p) => p.fix);
    ok(`bod 2 ${v}: fixes[i] je stále návrh i-teho nálezu s návrhom`,
      r.fixes.length === sNavrhom.length && r.fixes.every((f, i) => f.value === sNavrhom[i].fix && f.where === sNavrhom[i].path));
  }

  // Bod 3: mutácie, ktoré v bráne prežili (strážne testy).
  {
    const x03 = buildPain001(PASS_SPEC);
    const bezNs = x03.replace(` xmlns="${NS03}"`, '');
    const lenBicfi = bezNs.replace(/<BIC>/g, '<BICFI>').replace(/<\/BIC>/g, '</BICFI>');
    const lenDt = bezNs.replace(/<ReqdExctnDt>([^<]+)<\/ReqdExctnDt>/g, '<ReqdExctnDt><Dt>$1</Dt></ReqdExctnDt>');
    ok('bod 3: fixtúry bez xmlns, jedna len s BICFI, druhá len s ReqdExctnDt/Dt',
      !lenBicfi.includes('xmlns=') && lenBicfi.includes('<BICFI>') && !lenBicfi.includes('<Dt>')
      && !lenDt.includes('xmlns=') && lenDt.includes('<Dt>') && !lenDt.includes('<BICFI>'));
    eq('bod 3: bez xmlns, len BICFI: návrh .09', fixOf(d(lenBicfi).problems, 'schema_namespace_missing'), `xmlns="${NS09}"`);
    eq('bod 3: bez xmlns, len ReqdExctnDt/Dt: návrh .09', fixOf(d(lenDt).problems, 'schema_namespace_missing'), `xmlns="${NS09}"`);
    eq('bod 3: /ss1//vs2 (malé písmená) dá /VS2/SS1/KS', fixOf(d(sE2E('/ss1//vs2')).problems, 'identifier_slash_rule'), '/VS2/SS1/KS');
  }

  // Bod 4: Tatra banka, rada o exporte .09 len pri súbore .03; prvok 2.118 s názvom.
  {
    const RADA = { sk: 'Ak vám import .03 neprejde', en: 'If a .03 import fails', de: 'Scheitert der Import einer Datei im Format .03' };
    const x03 = buildPain001(PASS_SPEC);
    for (const lang of ['sk', 'en', 'de']) {
      const riadok = (xml) => d(xml, 'tatrabanka', lang).checklist.find((c) => /^(Verzia súboru|File version|Dateiversion):/.test(c)) || '';
      ok(`bod 4 ${lang}: pri súbore .09 bez rady o neúspešnom importe .03`, !riadok(na09(x03)).includes(RADA[lang]), riadok(na09(x03)));
      ok(`bod 4 ${lang}: pri súbore .03 rada ostáva`, riadok(x03).includes(RADA[lang]));
      const t09 = d(na09(x03), 'tatrabanka', lang).checklist.find((c) => c.includes('2.118')) || '';
      ok(`bod 4 ${lang}: prvok 2.118 je pomenovaný (Cdtr/PstlAdr)`, t09.includes('2.118, Cdtr/PstlAdr'), t09);
      ok(`bod 4 ${lang}: riadok netvrdí, že obmedzenia nástroj nekontroluje`, !/zatiaľ nekontroluje|does not check yet|noch nicht prüft/.test(t09));
    }
  }

  // Bod 5: pred prečítaním súboru obe verzie spojené slovom podľa jazyka, nie „ | “.
  for (const [lang, slovo] of [['sk', ' alebo '], ['en', ' or '], ['de', ' oder ']]) {
    eq(`bod 5 ${lang}: prázdny vstup, očakávaný menný priestor`, d('', 'tatrabanka', lang).expected.schemaNamespace, NS03 + slovo + NS09);
    eq(`bod 5 ${lang}: expectedValues`, expectedValues({ bank: 'vub', lang }).schemaNamespace, NS03 + slovo + NS09);
    ok(`bod 5 ${lang}: bez oddeľovača „ | “`, !d('', 'tatrabanka', lang).expected.schemaNamespace.includes(' | '));
  }
  eq('bod 5: expectedValues bez jazyka po slovensky', expectedValues({ bank: 'vub' }).schemaNamespace, NS03 + ' alebo ' + NS09);

  // Bod 6: llms-full.txt opisuje kanonické poradie aj pri texte za symbolmi.
  {
    const citaj = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
    const t = citaj('llms-full.txt');
    ok('bod 6: llms-full.txt hovorí, kedy návrh lomiek dá kanonické poradie a čo s textom za symbolmi',
      t.includes('When the value holds more than the symbols, the other text is kept after them') && t.includes('`/VS2/SS1/KS3/FA2026-001`'));
    ok('README.md opisuje text za symbolmi pri návrhu poradia', citaj('README.md').includes('keeps any other text after them'));
    for (const kod of ['tatra_09_pmt_inf_count', 'tatra_09_batch_booking', 'tatra_09_hybrid_address', 'tatra_09_structured_remittance']) {
      ok(`README.md a llms-full.txt: nový kód ${kod} je v README`, citaj('README.md').includes('`' + kod + '`'));
    }
  }

  // O8: obmedzenia Tatra banky pre .09 (stránka dávkových platieb Internet bankingu TB,
  // EN 19. 11. 2026): 2.0 najviac 1 PmtInf, 2.3 bez batch booking, 2.118 bez
  // hybridnej adresy príjemcu, 2.166 bez Strd. Len Tatra banka a súbor .09.
  {
    const s2 = clone(PASS_SPEC);
    s2.pmtInf.push(clone(PASS_SPEC.pmtInf[0]));
    s2.pmtInf[1].pmtInfId = 'PMT-0002';
    s2.pmtInf[1].tx[0].endToEndId = '/VS124/SS456/KS0308';
    s2.nbOfTxs = 2; s2.ctrlSum = '900.00';
    const dvaBloky03 = buildPain001(s2);
    const dvaBloky09 = na09(dvaBloky03);
    const x03 = buildPain001(PASS_SPEC);
    const x09 = na09(x03);
    const batch = (x) => x.replace('<PmtMtd>TRF</PmtMtd>', '<PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg>');
    const HYB = '<PstlAdr><StrtNm>Hlavna</StrtNm><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry><AdrLine>Hlavna 1</AdrLine></PstlAdr>';
    const STR = '<PstlAdr><StrtNm>Hlavna</StrtNm><BldgNb>1</BldgNb><TwnNm>Bratislava</TwnNm><Ctry>SK</Ctry></PstlAdr>';
    const sAdresou = (x, adr, kde) => x.replace(`<${kde || 'Cdtr'}><Nm>${kde === 'Dbtr' ? 'Firma s.r.o.' : 'Jozef Novak'}</Nm>`, `<${kde || 'Cdtr'}><Nm>${kde === 'Dbtr' ? 'Firma s.r.o.' : 'Jozef Novak'}</Nm>${adr}`);
    const strd = (x) => x.replace('<RmtInf><Ustrd>Faktura c. 2026-0912</Ustrd></RmtInf>', '<RmtInf><Strd><CdtrRefInf><Ref>RF18539007547034</Ref></CdtrRefInf></Strd></RmtInf>');
    ok('O8: fixtúry sa zapísali', dvaBloky09.split('<PmtInf>').length === 3 && batch(x09).includes('<BtchBookg>true')
      && sAdresou(x09, HYB).includes('<AdrLine>') && sAdresou(x09, HYB, 'Dbtr').includes('Firma s.r.o.</Nm><PstlAdr>') && strd(x09).includes('<Strd>'));

    const PRIPADY = [
      ['tatra_09_pmt_inf_count', dvaBloky09, dvaBloky03],
      ['tatra_09_batch_booking', batch(x09), batch(x03)],
      ['tatra_09_hybrid_address', sAdresou(x09, HYB), sAdresou(x03, HYB)],
      ['tatra_09_structured_remittance', strd(x09), strd(x03)],
    ];
    for (const [kod, s09, s03] of PRIPADY) {
      const r = d(s09);
      has(`O8 ${kod}: Tatra banka a .09 nález má`, r.problems, kod);
      eq(`O8 ${kod}: stredná závažnosť (banka odmietnutie neuvádza)`, severityOf(r.problems, kod), 'medium');
      lacks(`O8 ${kod}: Tatra banka a .03 nález nemá`, d(s03).problems, kod);
      for (const banka of ['slsp', 'vub', 'csob', 'generic']) lacks(`O8 ${kod}: ${banka} a .09 nález nemá`, d(s09, banka).problems, kod);
      for (const lang of ['sk', 'en', 'de']) {
        const n = najdi(d(s09, 'tatrabanka', lang), kod);
        ok(`O8 ${kod} ${lang}: hláška nepíše istotu odmietnutia`, !!n && !ZAKAZ_ISTOTY.test(n.message), n && n.message);
        ok(`O8 ${kod} ${lang}: hláška hovorí, že banka následok neuvádza`, !!n && /neuvádza|does not say|sagt sie nicht/.test(n.message), n && n.message);
        ok(`O8 ${kod} ${lang}: bez pomlčiek em a en`, !!n && !/[–—]/.test(n.message));
      }
    }
    ok('O8 PmtInf: hláška cituje „Maximum 1 element“', ((najdi(d(dvaBloky09), 'tatra_09_pmt_inf_count') || {}).message || '').includes('„Maximum 1 element“'));
    eq('O8 BtchBookg: návrh "false"', fixOf(d(batch(x09)).problems, 'tatra_09_batch_booking'), 'false');
    lacks('O8 BtchBookg false: bez nálezu', d(x09.replace('<PmtMtd>TRF</PmtMtd>', '<PmtMtd>TRF</PmtMtd><BtchBookg>false</BtchBookg>')).problems, 'tatra_09_batch_booking');
    lacks('O8 adresa: plne štruktúrovaná adresa príjemcu bez nálezu', d(sAdresou(x09, STR)).problems, 'tatra_09_hybrid_address');
    lacks('O8 adresa: hybridná adresa platiteľa (2.23 v EN znení 19. 11. 2026 nie je) bez nálezu', d(sAdresou(x09, HYB, 'Dbtr')).problems, 'tatra_09_hybrid_address');
    // Brána sepa-hub pokus 1, O1: Ctry + AdrLine bez TwnNm nie je hybridná adresa
    // (EPC: hybridná adresa má TwnNm a Ctry), hlási sa len chýbajúce mesto.
    {
      const CTRY_ADR = '<PstlAdr><Ctry>SK</Ctry><AdrLine>Hlavna 1, Bratislava</AdrLine></PstlAdr>';
      const r = d(sAdresou(x09, CTRY_ADR));
      ok('O1: fixtúra Ctry + AdrLine sa zapísala', sAdresou(x09, CTRY_ADR).includes('<Ctry>SK</Ctry><AdrLine>'));
      lacks('O1: Ctry + AdrLine bez TwnNm nie je hybridná adresa', r.problems, 'tatra_09_hybrid_address');
      has('O1: Ctry + AdrLine bez TwnNm hlási chýbajúce mesto', r.problems, 'adresa_bez_mesta_alebo_krajiny');
    }
    // Brána sepa-hub pokus 1, O2: dlhý EndToEndId so symbolmi v zlom poradí a
    // textom za nimi. Návrh skrátenia nesmie končiť zvyškom „/F“ a poradie
    // nesmie ukázať druhú rovnakú kartu opravy.
    {
      const s = clone(PASS_SPEC);
      s.pmtInf[0].tx[0].endToEndId = '/SS1234567890/VS1234567890/KS0308/FAKTURA2026';
      const r = d(buildPain001(s), 'vub');
      eq('O2: end_to_end_id_too_long navrhne symboly bez useknutého textu', fixOf(r.problems, 'end_to_end_id_too_long'), '/VS1234567890/SS1234567890/KS0308');
      has('O2: reference_symbol_order nález ostáva', r.problems, 'reference_symbol_order');
      eq('O2: reference_symbol_order bez druhej rovnakej karty opravy', fixOf(r.problems, 'reference_symbol_order'), '');
      const t = clone(PASS_SPEC);
      t.pmtInf[0].tx[0].endToEndId = '/VS12345/SS1/KS0308/FA/2026-000123456789';
      eq('O2: text za symbolmi s lomkou sa reže po celý úsek', fixOf(d(buildPain001(t), 'vub').problems, 'end_to_end_id_too_long'), '/VS12345/SS1/KS0308/FA');
      const u = clone(PASS_SPEC);
      u.pmtInf[0].tx[0].endToEndId = 'FAKTURA-2026-0001-DODAVATEL-ABCDEFGHIJ';
      eq('O2: hodnota bez symbolov sa skracuje ako doteraz', fixOf(d(buildPain001(u), 'vub').problems, 'end_to_end_id_too_long'), 'FAKTURA-2026-0001-DODAVATEL-ABCDEFG');
    }
    // Brána sepa-hub pokus 1, O3: nečíselná hodnota symbolu v zlom poradí ostáva
    // pri svojom symbole, nepresunie sa za KS ako text.
    {
      const s = clone(PASS_SPEC);
      s.pmtInf[0].tx[0].endToEndId = '/SS1/VSABC';
      eq('O3: /SS1/VSABC dá návrh /VSABC/SS1/KS', fixOf(d(buildPain001(s), 'vub').problems, 'reference_symbol_order'), '/VSABC/SS1/KS');
      const t = clone(PASS_SPEC);
      t.pmtInf[0].tx[0].endToEndId = '/SS1/VS2/KS0308FA';
      eq('O3: hodnota začínajúca číslicami sa delí ako doteraz', fixOf(d(buildPain001(t), 'vub').problems, 'reference_symbol_order'), '/VS2/SS1/KS0308/FA');
    }
    {
      const s = clone(PASS_SPEC);
      s.pmtInf[0].tx.push(clone(PASS_SPEC.pmtInf[0].tx[0]));
      s.pmtInf[0].tx[1].endToEndId = '/VS124/SS456/KS0308';
      s.nbOfTxs = 2; s.ctrlSum = '900.00';
      const x = na09(buildPain001(s)).split('<Cdtr><Nm>Jozef Novak</Nm>').join('<Cdtr><Nm>Jozef Novak</Nm>' + HYB);
      const r = d(x);
      eq('O8 adresa: dve hybridné adresy príjemcu, jeden nález', r.problems.filter((p) => p.code === 'tatra_09_hybrid_address').length, 1);
      ok('O8 adresa: hláška uvádza počet 2', ((najdi(r, 'tatra_09_hybrid_address') || {}).message || '').includes('Hybridných adries príjemcu v súbore: 2.'));
    }
    // initg_pty_name_pattern je z popisu .03; vzor .09 Tatra banky má <Nm>InitgPty</Nm>.
    {
      const s = clone(PASS_SPEC); s.initgPtyNm = 'InitgPty';
      lacks('O8 InitgPty: Tatra banka a .09 vzor z popisu .03 nehlási', d(na09(buildPain001(s))).problems, 'initg_pty_name_pattern');
      has('O8 InitgPty: Tatra banka a .03 vzor hlási ďalej', d(buildPain001(s)).problems, 'initg_pty_name_pattern');
    }
    // Vzor Tatra banky „Pain.001.09 Example with mandatory parameters“ (stiahnutý
    // 19. 11. 2026, ib_minimum_params_pain_001_09.xml, Last-Modified 1. 4. 2026).
    {
      const vzor = '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"><CstmrCdtTrfInitn><GrpHdr><MsgId>Message identification 007</MsgId><CreDtTm>2010-11-11T09:30:47.000Z</CreDtTm><NbOfTxs>1</NbOfTxs><CtrlSum>4.02</CtrlSum><InitgPty/></GrpHdr><PmtInf><PmtInfId>Payment-Information-ID-4711</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>false</BtchBookg><NbOfTxs>1</NbOfTxs><CtrlSum>4.02</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>INST</Cd></LclInstrm></PmtTpInf><ReqdExctnDt><Dt>2026-03-11</Dt></ReqdExctnDt><Dbtr><Nm>Debtor Name</Nm></Dbtr><DbtrAcct><Id><IBAN>SK8011000000002900000013</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId><BICFI>TATRSKBX</BICFI></FinInstnId></DbtrAgt><CdtTrfTxInf><PmtId><EndToEndId>END-TO-END</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">4.02</InstdAmt></Amt><Cdtr><Nm>Credtior Name</Nm></Cdtr><CdtrAcct><Id><IBAN>SK0511000000002900000005</IBAN></Id></CdtrAcct></CdtTrfTxInf></PmtInf></CstmrCdtTrfInitn></Document>';
      const r = diagnose({ xml: vzor, bank: 'tatrabanka', dnes: '2026-03-10' });
      ok('O8: vzor .09 Tatra banky s povinnými parametrami nemá nález tatra_09_*', !r.problems.some((p) => p.code.startsWith('tatra_09_')), r.problems.map((p) => p.code).join(','));
    }
  }
}

// ═══════════════ R. riadok a stĺpec nálezu (zadanie sepa-riadok, 20. 11. 2026) ═════
// Stránky kontroly súboru (149 €) sľubujú, v ktorom riadku je chyba. Každý nález
// nesie line, column, lineShared, lineExact a lineTag; popisPolohy() z nich robí text.
{
  const RIADKY = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">',
    '  <CstmrCdtTrfInitn>',
    '    <GrpHdr>',
    '      <MsgId>MSG-RIADOK-1</MsgId>',
    '      <CreDtTm>2026-11-20T08:00:00</CreDtTm>',
    '      <NbOfTxs>3</NbOfTxs>',
    '      <CtrlSum>30.00</CtrlSum>',
    '      <InitgPty><Nm>Firma s r o</Nm></InitgPty>',
    '    </GrpHdr>',
    '    <PmtInf>',
    '      <PmtInfId>P1</PmtInfId>',
    '      <PmtMtd>TRF</PmtMtd>',
    '      <Dbtr><Nm>Firma s r o</Nm></Dbtr>',
    '      <DbtrAcct><Id><IBAN>SK2811000000000000000000</IBAN></Id></DbtrAcct>',
    '      <DbtrAgt><FinInstnId><BIC>TATRSKBX</BIC></FinInstnId></DbtrAgt>',
    '      <ChrgBr>SLEV</ChrgBr>',
    '      <CdtTrfTxInf>',
    '        <PmtId><EndToEndId>E2E-1</EndToEndId></PmtId>',
    '        <Amt><InstdAmt Ccy="EUR">10.00</InstdAmt></Amt>',
    '        <Cdtr>',
    '          <Nm>Prvy prijemca</Nm>',
    '          <PstlAdr>',
    '            <TwnNm>Bratislava</TwnNm>',
    '            <Ctry>SK</Ctry>',
    '          </PstlAdr>',
    '        </Cdtr>',
    '        <CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct>',
    '      </CdtTrfTxInf>',
    '      <CdtTrfTxInf>',
    '        <PmtId><EndToEndId>E2E-2</EndToEndId></PmtId>',
    '        <Amt><InstdAmt Ccy="USD">20.00</InstdAmt></Amt>',
    '        <Cdtr>',
    '          <Nm>Druhy prijemca</Nm>',
    '          <PstlAdr>',
    '            <AdrLine>Hlavna 1</AdrLine>',
    '            <AdrLine>811 01 Bratislava</AdrLine>',
    '          </PstlAdr>',
    '        </Cdtr>',
    '        <CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct>',
    '      </CdtTrfTxInf>',
    '    </PmtInf>',
    '  </CstmrCdtTrfInitn>',
    '</Document>',
  ];
  // číslo riadku (od 1), na ktorom je n-tý výskyt reťazca
  const riadokS = (kus, n = 1) => {
    let k = 0;
    for (let i = 0; i < RIADKY.length; i++) if (RIADKY[i].includes(kus) && ++k === n) return i + 1;
    return -1;
  };
  const nalez = (r, code) => r.problems.find((p) => p.code === code) || {};
  const dg = (xml, lang) => diagnose({ xml, bank: 'tatrabanka', dnes: '2026-11-20', lang });

  const lf = RIADKY.join('\n');
  const r = dg(lf);
  const RIADOK_ADRESY_2 = riadokS('<PstlAdr>', 2);
  eq('R1 NbOfTxs: riadok prvku', nalez(r, 'nb_of_txs_mismatch').line, riadokS('<NbOfTxs>3'));
  eq('R1 NbOfTxs: na riadku je jeden prvok, stĺpec netreba', nalez(r, 'nb_of_txs_mismatch').lineShared, false);
  eq('R1 NbOfTxs: popis', popisPolohy(nalez(r, 'nb_of_txs_mismatch'), 'sk'), 'riadok ' + riadokS('<NbOfTxs>3'));
  // Cesta adresy nemá index transakcie; riadok musí byť z adresy DRUHEJ platby, nie prvej.
  eq('R2 adresa v druhej platbe: riadok jej <PstlAdr>', nalez(r, 'adresa_nestrukturovana').line, RIADOK_ADRESY_2);
  ok('R2 adresa: cesta ostáva', String(nalez(r, 'adresa_nestrukturovana').path).endsWith('/Cdtr/PstlAdr'));
  // Atribút: riadok prvku InstdAmt druhej platby.
  const riadokUsd = riadokS('Ccy="USD"');
  const stlpecUsd = RIADKY[riadokUsd - 1].indexOf('<InstdAmt') + 1;
  eq('R3 mena @Ccy: riadok InstdAmt', nalez(r, 'amount_currency_invalid').line, riadokUsd);
  eq('R3 mena @Ccy: prvok existuje, poloha presná', nalez(r, 'amount_currency_invalid').lineExact, true);
  eq('R3 mena @Ccy: stĺpec na zdieľanom riadku', nalez(r, 'amount_currency_invalid').column, stlpecUsd);
  eq('R3 mena @Ccy: popis so stĺpcom', popisPolohy(nalez(r, 'amount_currency_invalid'), 'sk'), `riadok ${riadokUsd}, stĺpec ${stlpecUsd}`);
  // Chýbajúci prvok: riadok nadradeného PmtInf a slovo o tom, že prvok chýba.
  const datum = nalez(r, 'exec_date_missing');
  eq('R4 chýba ReqdExctnDt: riadok PmtInf', datum.line, riadokS('<PmtInf>'));
  eq('R4 chýba ReqdExctnDt: nie presne', datum.lineExact, false);
  eq('R4 chýba ReqdExctnDt: tag predka', datum.lineTag, 'PmtInf');
  // Bez vnorenej zátvorky (brána pokus 1, B7): v správe stojí poloha v zátvorke s cestou.
  eq('R4 popis sk', popisPolohy(datum, 'sk'), `riadok ${riadokS('<PmtInf>')}, kde začína PmtInf, v ktorom prvok chýba`);
  eq('R4 popis en', popisPolohy(datum, 'en'), `line ${riadokS('<PmtInf>')}, the start of PmtInf, which lacks this element`);
  eq('R4 popis de', popisPolohy(datum, 'de'), `Zeile ${riadokS('<PmtInf>')}, wo PmtInf beginnt, in dem das Element fehlt`);
  ok('R4 popis bez dvojbodky (správa ho píše za štítok „Pôvodný súbor:“)', !/:/.test(popisPolohy(datum, 'sk') + popisPolohy(datum, 'en') + popisPolohy(datum, 'de')));
  ok('R4 popis bez zátvoriek', !/[()]/.test(popisPolohy(datum, 'sk') + popisPolohy(datum, 'en') + popisPolohy(datum, 'de')));

  // Konce riadkov CRLF a samotné CR dávajú tie isté riadky; BOM nemení riadok ani stĺpec.
  for (const [meno, xml] of [['CRLF', RIADKY.join('\r\n')], ['CR', RIADKY.join('\r')], ['BOM', '\uFEFF' + lf]]) {
    const x = dg(xml);
    eq(`R5 ${meno}: adresa`, nalez(x, 'adresa_nestrukturovana').line, RIADOK_ADRESY_2);
    eq(`R5 ${meno}: NbOfTxs`, nalez(x, 'nb_of_txs_mismatch').line, riadokS('<NbOfTxs>3'));
    eq(`R5 ${meno}: stĺpec @Ccy`, nalez(x, 'amount_currency_invalid').column, stlpecUsd);
  }

  // Súbor v jednom riadku: riadok 1 a stĺpec, ktorý ukáže presne na prvok.
  const jeden = RIADKY.map((x) => x.trim()).join('');
  const j = dg(jeden);
  const ja = nalez(j, 'adresa_nestrukturovana');
  const druhaAdresa = jeden.indexOf('<PstlAdr>', jeden.indexOf('<PstlAdr>') + 1);
  eq('R6 jeden riadok: adresa na riadku 1', ja.line, 1);
  eq('R6 jeden riadok: stĺpec druhej <PstlAdr>', ja.column, druhaAdresa + 1);
  eq('R6 jeden riadok: riadok zdieľaný', ja.lineShared, true);
  eq('R6 jeden riadok: popis sk', popisPolohy(ja, 'sk'), `riadok 1, stĺpec ${druhaAdresa + 1}`);
  eq('R6 jeden riadok: popis en', popisPolohy(ja, 'en'), `line 1, column ${druhaAdresa + 1}`);
  eq('R6 jeden riadok: popis de', popisPolohy(ja, 'de'), `Zeile 1, Spalte ${druhaAdresa + 1}`);
  ok('R6 jeden riadok: na stĺpci je naozaj <PstlAdr>', jeden.slice(ja.column - 1).startsWith('<PstlAdr><AdrLine>Hlavna 1'));
  const jb = dg('\uFEFF' + jeden);
  eq('R6 jeden riadok s BOM: BOM sa do stĺpca nepočíta', nalez(jb, 'adresa_nestrukturovana').column, druhaAdresa + 1);
  // Stĺpec treba pri každom prvku okrem prvého na riadku (<Document>).
  const prvyNaRiadku = jeden.search(/<[A-Za-z_]/) + 1;
  for (const p of j.problems) ok(`R6 jeden riadok: ${p.code} má riadok a stĺpec`, p.path === '' || (p.line === 1 && p.column >= 1 && p.lineShared === (p.column > prvyNaRiadku)), JSON.stringify(p));

  // Zle formovaný súbor: riadok prvej chyby.
  const zle = RIADKY.slice();
  zle[riadokS('Druhy prijemca') - 1] = '          <Nm>Druhy prijemca</Nmx>';
  const z = dg(zle.join('\n'));
  eq('R7 zle formovaný: riadok chyby', nalez(z, 'xml_not_well_formed').line, riadokS('Druhy prijemca'));
  // Orezaný súbor: chyba je tam, kde súbor končí (brána pokus 1, A4), nie pri <Document>.
  const orezany = lf.slice(0, lf.lastIndexOf('</Document>'));
  const nezatvoreny = dg(orezany);
  eq('R7 orezaný súbor: riadok konca súboru', nalez(nezatvoreny, 'xml_not_well_formed').line, orezany.split('\n').length);
  const orezanyJeden = RIADKY.map((x) => x.trim()).join('');
  eq('R7 orezaný súbor v jednom riadku: stĺpec za posledným znakom', nalez(dg(orezanyJeden.slice(0, orezanyJeden.lastIndexOf('</Document>'))), 'xml_not_well_formed').column, orezanyJeden.lastIndexOf('</Document>') + 1);

  // Bez polohy: prázdny vstup, žiadny riadok a prázdny popis.
  const prazdny = diagnose({ xml: '' });
  eq('R8 prázdny vstup: riadok null', nalez(prazdny, 'xml_empty').line, null);
  eq('R8 prázdny vstup: popis prázdny', popisPolohy(nalez(prazdny, 'xml_empty'), 'sk'), '');
  eq('R8 popis bez nálezu', popisPolohy(null, 'sk'), '');

  // vytvorPolohy: CR, LF, CRLF, mimo rozsahu.
  const pz = vytvorPolohy('a\r\nb\rc\nd');
  eq('R9 vytvorPolohy: d je riadok 4', (pz(7) || {}).line, 4);
  eq('R9 vytvorPolohy: d je stĺpec 1', (pz(7) || {}).column, 1);
  eq('R9 vytvorPolohy: c je riadok 3', (pz(5) || {}).line, 3);
  eq('R9 vytvorPolohy: mimo rozsahu null', pz(99), null);
  eq('R9 vytvorPolohy: záporný posun null', pz(-1), null);

  // Každý nález s cestou má riadok, ktorý v súbore existuje.
  for (const p of r.problems) {
    if (!p.path) continue;
    ok(`R10 ${p.code}: riadok v rozsahu súboru`, Number.isInteger(p.line) && p.line >= 1 && p.line <= RIADKY.length, JSON.stringify(p));
  }

  // R11 (brána pokus 1, A1): hodnota zdedená z PmtInf ukazuje na prvok v PmtInf, nie na
  // „chýbajúci“ prvok v každej transakcii. Transakcia s vlastným InstrPrty NORM sa nepoužije.
  const ZDED = RIADKY.slice();
  ZDED[ZDED.indexOf('      <ChrgBr>SLEV</ChrgBr>')] = '      <ChrgBr>DEBT</ChrgBr>';
  ZDED.splice(ZDED.indexOf('      <PmtMtd>TRF</PmtMtd>') + 1, 0, '      <PmtTpInf><InstrPrty>HIGH</InstrPrty><SvcLvl><Cd>URGP</Cd></SvcLvl></PmtTpInf>');
  ZDED.splice(ZDED.indexOf('        <PmtId><EndToEndId>E2E-1</EndToEndId></PmtId>'), 0, '        <PmtTpInf><InstrPrty>NORM</InstrPrty></PmtTpInf>');
  const riadokZ = (kus) => ZDED.findIndex((x) => x.includes(kus)) + 1;
  const zd = dg(ZDED.join('\n'));
  const chrg = zd.problems.filter((p) => p.code === 'chrg_br_invalid');
  eq('R11 ChrgBr DEBT v PmtInf: nález pri oboch platbách', chrg.length, 2);
  for (const p of chrg) {
    eq(`R11 ${p.path}: riadok ChrgBr v PmtInf`, p.line, riadokZ('<ChrgBr>DEBT'));
    eq(`R11 ${p.path}: presne`, p.lineExact, true);
    ok(`R11 ${p.path}: popis bez „chýba“`, !popisPolohy(p, 'sk').includes('chýba'), popisPolohy(p, 'sk'));
  }
  const instr = zd.problems.filter((p) => p.code === 'instr_prty_not_norm');
  eq('R11 InstrPrty HIGH v PmtInf: nález pri oboch platbách', instr.length, 2);
  const riadokPmtTp = riadokZ('<InstrPrty>HIGH');
  const stlpecHigh = ZDED[riadokPmtTp - 1].indexOf('<InstrPrty>HIGH') + 1;
  for (const p of instr) {
    eq(`R11 ${p.path}: riadok InstrPrty v PmtInf`, p.line, riadokPmtTp);
    eq(`R11 ${p.path}: stĺpec InstrPrty HIGH, nie NORM v transakcii`, p.column, stlpecHigh);
  }
  const svc = zd.problems.filter((p) => p.code === 'svc_lvl_missing_or_invalid');
  ok('R11 SvcLvl URGP v PmtInf: nález', svc.length >= 1);
  for (const p of svc) eq(`R11 ${p.path}: stĺpec SvcLvl/Cd v PmtInf`, p.column, ZDED[riadokPmtTp - 1].indexOf('<Cd>URGP') + 1);
  // Chýba na oboch úrovniach: ostáva „prvok chýba“ pri transakcii.
  const bez = dg(RIADKY.filter((x) => !x.includes('<ChrgBr>')).join('\n')).problems.filter((p) => p.code === 'chrg_br_missing');
  eq('R11 ChrgBr chýba všade: nález pri oboch platbách', bez.length, 2);
  for (const p of bez) eq(`R11 ${p.path}: chýbajúci prvok, nie presne`, p.lineExact, false);

  // R12 (brána pokus 1, B1): zlúčený adresný nález nesie riadok KAŽDEJ adresy.
  const HYB = (n) => [
    '      <CdtTrfTxInf>',
    `        <PmtId><EndToEndId>H-${n}</EndToEndId></PmtId>`,
    '        <Amt><InstdAmt Ccy="EUR">1.00</InstdAmt></Amt>',
    '        <Cdtr>',
    `          <Nm>Hybrid ${n}</Nm>`,
    '          <PstlAdr>',
    `            <AdrLine>Hybridna ${n}</AdrLine>`,
    '            <Ctry>SK</Ctry>',
    '          </PstlAdr>',
    '        </Cdtr>',
    '        <CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct>',
    '      </CdtTrfTxInf>',
  ];
  const SH = RIADKY.slice();
  SH.splice(SH.lastIndexOf('    </PmtInf>'), 0, ...HYB(1), ...HYB(2), ...HYB(3));
  const sh = dg(SH.join('\n'));
  const bezMesta = sh.problems.filter((p) => p.code === 'adresa_bez_mesta_alebo_krajiny');
  eq('R12 tri hybridné adresy bez mesta: jeden nález', bezMesta.length, 1);
  // riadok <PstlAdr> je o jeden vyššie než <AdrLine>Hybridna n (index od 0 = číslo riadku <PstlAdr>)
  const ocakRiadky = SH.map((x, i) => (x.includes('<AdrLine>Hybridna ') ? i : -1)).filter((i) => i >= 0);
  eq('R12 riadky všetkých troch adries', JSON.stringify(((bezMesta[0] || {}).lines || []).map((x) => x.line)), JSON.stringify(ocakRiadky));
  eq('R12 popis sk', popisPolohy(bezMesta[0], 'sk'), `riadky ${ocakRiadky.join(', ')}`);
  eq('R12 popis en', popisPolohy(bezMesta[0], 'en'), `lines ${ocakRiadky.join(', ')}`);
  eq('R12 popis de', popisPolohy(bezMesta[0], 'de'), `Zeilen ${ocakRiadky.join(', ')}`);
  eq('R12 strop 2', popisPolohy(bezMesta[0], 'sk', 2), `riadky ${ocakRiadky.slice(0, 2).join(', ')} a ďalších 1`);
  eq('R12 strop 2 en', popisPolohy(bezMesta[0], 'en', 2), `lines ${ocakRiadky.slice(0, 2).join(', ')} and 1 more`);
  const shJeden = SH.map((x) => x.trim()).join('');
  const shj = dg(shJeden).problems.find((p) => p.code === 'adresa_bez_mesta_alebo_krajiny');
  const stlpceH = [];
  for (let i = shJeden.indexOf('<PstlAdr><AdrLine>Hybridna '); i >= 0; i = shJeden.indexOf('<PstlAdr><AdrLine>Hybridna ', i + 1)) stlpceH.push(i + 1);
  eq('R12 jeden riadok: stĺpce všetkých troch', popisPolohy(shj, 'sk'), `riadok 1, stĺpce ${stlpceH.join(', ')}`);
  eq('R12 jeden riadok de', popisPolohy(shj, 'de'), `Zeile 1, Spalten ${stlpceH.join(', ')}`);
  // Voľný text u platiteľa aj príjemcu: hláška nemenuje len platiteľa, riadky oboch.
  const OBE = RIADKY.slice();
  OBE.splice(OBE.indexOf('      <Dbtr><Nm>Firma s r o</Nm></Dbtr>'), 1, '      <Dbtr><Nm>Firma s r o</Nm><PstlAdr><AdrLine>Mlynska 3</AdrLine><AdrLine>811 01 Bratislava</AdrLine></PstlAdr></Dbtr>');
  const obe = nalez(dg(OBE.join('\n')), 'adresa_nestrukturovana');
  eq('R12 platiteľ aj príjemca: dva riadky', (obe.lines || []).length, 2);
  ok('R12 platiteľ aj príjemca: hláška menuje obe strany', String(obe.message).startsWith('Adresa platiteľa a príjemcu je zapísaná'), obe.message);
  const obeEn = nalez(dg(OBE.join('\n'), 'en'), 'adresa_nestrukturovana');
  ok('R12 en: of the debtor and of the creditor', String(obeEn.message).startsWith('The address of the debtor and of the creditor is written'), obeEn.message);
  const obeDe = nalez(dg(OBE.join('\n'), 'de'), 'adresa_nestrukturovana');
  ok('R12 de: des Auftraggebers und des Zahlungsempfängers', String(obeDe.message).startsWith('Die Adresse des Auftraggebers und des Zahlungsempfängers'), obeDe.message);
  ok('R12 len príjemca: hláška ostáva „príjemcu“', String(nalez(r, 'adresa_nestrukturovana').message).startsWith('Adresa príjemcu'), nalez(r, 'adresa_nestrukturovana').message);
  eq('R12 jeden výskyt: lines null', nalez(r, 'adresa_nestrukturovana').lines, null);

  // R13 (brána pokus 1, A2): čas nerastie s druhou mocninou počtu transakcií v jednom PmtInf.
  // 10 000 transakcií bez EndToEndId a mena príjemcu (každá má nálezy riešené cestou). Namerané 20. 11. 2026: s pamäťou detí okolo 0,3 s, bez nej 5,5 s.
  const TX = (i) => `<CdtTrfTxInf><PmtId></PmtId><Amt><InstdAmt Ccy="EUR">1.00</InstdAmt></Amt><Cdtr></Cdtr><CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct></CdtTrfTxInf>`;
  const zakladJeden = RIADKY.map((x) => x.trim()).join('');
  const prvy = zakladJeden.indexOf('<CdtTrfTxInf>');
  const posledny = zakladJeden.lastIndexOf('</CdtTrfTxInf>') + '</CdtTrfTxInf>'.length;
  const velky = zakladJeden.slice(0, prvy) + Array.from({ length: 10000 }, (_, i) => TX(i)).join('') + zakladJeden.slice(posledny);
  const t0 = Date.now();
  const rv = dg(velky);
  const trvanie = Date.now() - t0;
  eq('R13 10 000 transakcií: nález pri každej', rv.problems.filter((p) => p.code === 'end_to_end_id_missing').length, 10000);
  ok(`R13 10 000 transakcií v jednom PmtInf do 3 s (${trvanie} ms)`, trvanie < 3000);

  // R14 (brána pokus 2, B1): stĺpec len vtedy, keď pred prvkom na tom istom riadku začína iný prvok.
  const tx14 = 'a\n  <X><Y>1</Y></X>\n';
  const p14 = vytvorPolohy(tx14);
  eq('R14 prvý prvok na riadku: bez stĺpca', (p14(tx14.indexOf('<X>')) || {}).lineShared, false);
  eq('R14 druhý prvok na riadku: so stĺpcom', (p14(tx14.indexOf('<Y>')) || {}).lineShared, true);
  eq('R14 popis prvého prvku bez stĺpca', popisPolohy(p14(tx14.indexOf('<X>')), 'sk'), 'riadok 2');
  eq('R14 popis druhého prvku so stĺpcom', popisPolohy(p14(tx14.indexOf('<Y>')), 'sk'), 'riadok 2, stĺpec 6');
  eq('R14 vzor: <PstlAdr> na začiatku riadku bez stĺpca', nalez(r, 'adresa_nestrukturovana').lineShared, false);

  // R15 (brána pokus 2, A1): stabilná adresa prvku s indexmi a druh zlúčeného nálezu.
  eq('R15 nodePath mena druhej platby', nalez(r, 'amount_currency_invalid').nodePath, 'Document[1]/CstmrCdtTrfInitn[1]/PmtInf[1]/CdtTrfTxInf[2]/Amt[1]/InstdAmt[1]');
  eq('R15 nodePath adresy druhej platby', nalez(r, 'adresa_nestrukturovana').nodePath, 'Document[1]/CstmrCdtTrfInitn[1]/PmtInf[1]/CdtTrfTxInf[2]/Cdtr[1]/PstlAdr[1]');
  eq('R15 nodePath chýbajúceho ReqdExctnDt = PmtInf', nalez(r, 'exec_date_missing').nodePath, 'Document[1]/CstmrCdtTrfInitn[1]/PmtInf[1]');
  eq('R15 group voľného textu', nalez(r, 'adresa_nestrukturovana').group, 'nestrukturovana');
  eq('R15 group adries bez mesta', (bezMesta[0] || {}).group, 'bez_mesta');
  eq('R15 bežný nález nemá group', nalez(r, 'amount_currency_invalid').group, undefined);
  eq('R15 prázdny vstup: nodePath prázdny', nalez(prazdny, 'xml_empty').nodePath, '');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
}
