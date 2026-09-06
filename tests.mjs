// tests.mjs — plain Node test runner for doctor-pain001.js (no external dependencies).
// Run with: node tests.mjs

import { diagnose, TERMIN_ADRESY, expectedValues } from './doctor-pain001.js';

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

// The structured-address deadline (TERMIN_ADRESY, 15. 11. 2026) changes both
// the expected message version and the severity of address findings, so every
// test pins the date instead of reading the clock. Without this the suite
// would silently change behaviour overnight on 15. 11. 2026 — the baseline
// .03 file would start reporting schema_namespace_03_po_termine and the
// "zero problems" assertion would fail for a reason that has nothing to do
// with the code under test.
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
  // .09 is a valid message version, not an error. Before the deadline it only
  // gets a "your bank may still want .03" note; after it, nothing at all.
  const r = run(spec, 'tatrabanka');
  lacks('pain.001.001.09 pred termínom: nie je to chyba', r.problems, 'schema_namespace_unexpected');
  has('pain.001.001.09 pred termínom: len poznámka', r.problems, 'schema_namespace_09_skoro');
  eq('pain.001.001.09 pred termínom: nízka závažnosť', severityOf(r.problems, 'schema_namespace_09_skoro'), 'low');

  const rPo = run(spec, 'tatrabanka', null, DNES_PO);
  lacks('pain.001.001.09 po termíne: bez poznámky', rPo.problems, 'schema_namespace_09_skoro');
  lacks('pain.001.001.09 po termíne: bez chyby', rPo.problems, 'schema_namespace_unexpected');
  eq('pain.001.001.09 po termíne: očakávaný menný priestor je .09',
    rPo.expected.schemaNamespace, 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09');
}
{
  // .03 is fine today and questionable after the deadline — but only
  // "questionable": the SEPA date is about the address, each bank decides
  // its own accepted message version, so this must not be a hard error.
  const spec = clone(PASS_SPEC);
  const r = run(spec, 'tatrabanka');
  lacks('pain.001.001.03 pred termínom: bez výhrady', r.problems, 'schema_namespace_03_po_termine');

  const rPo = run(spec, 'tatrabanka', null, DNES_PO);
  has('pain.001.001.03 po termíne: upozorní na verziu', rPo.problems, 'schema_namespace_03_po_termine');
  eq('pain.001.001.03 po termíne: stredná, nie vysoká závažnosť',
    severityOf(rPo.problems, 'schema_namespace_03_po_termine'), 'medium');
  ok('pain.001.001.03 po termíne: pošle overiť si to v banke',
    JSON.stringify(rPo.problems).indexOf('Overte si') !== -1);
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
{
  const spec = clone(PASS_SPEC);
  spec.pmtInf[0].tx = manyTx(501);
  spec.nbOfTxs = 501;
  spec.ctrlSum = '501.00';
  const r = run(spec, 'tatrabanka');
  has('501 tx at Tatra banka: reports pmt_inf_tx_count_exceeded', r.problems, 'pmt_inf_tx_count_exceeded');
  eq('501 tx: severity high', severityOf(r.problems, 'pmt_inf_tx_count_exceeded'), 'high');
  const r2 = run(clone(spec), 'vub');
  lacks('501 tx at another bank: no hard pmt_inf_tx_count_exceeded', r2.problems, 'pmt_inf_tx_count_exceeded');
  has('501 tx at another bank: informational pmt_inf_tx_count_exceeded_generic', r2.problems, 'pmt_inf_tx_count_exceeded_generic');
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
// ── štruktúrovaná adresa, termín 15. 11. 2026 ─────────────────────────────
// Toto je jediná kontrola, ktorá časom mení závažnosť, preto sa testuje na
// oboch stranách termínu. Dátum sa vždy podáva zvonka (cfg.dnes), nikdy sa
// nečíta systémový čas, inak by test o dva mesiace začal padať sám.
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

eq('TERMIN_ADRESY je 15. novembra 2026', TERMIN_ADRESY, '2026-11-15');

{
  // Súbor bez akejkoľvek adresy je v poriadku aj po termíne: adresa je v SEPA
  // nepovinná a nová povinnosť platí len pre adresu, ktorá tam naozaj je.
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

  const po = adrNalezy(adrXml(volnyText, dobra), '2026-11-15');
  eq('voľný text: v deň termínu je to už blokujúce', po[0].severity, 'high');
  const poPo = adrNalezy(adrXml(volnyText, dobra), '2026-12-01');
  eq('voľný text: po termíne blokujúce', poPo[0].severity, 'high');
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
}
