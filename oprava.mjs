/* Deterministické opravy pain.001, spoločné pre ops/kontrola/zakazka.mjs (Node)
 * a pre stránku SEPA pain.001 Doctor (prehliadač). Čistý JavaScript, žiadny
 * súborový systém; jediná závislosť je motor ./doctor-pain001.js v tom istom
 * priečinku, z ktorého sa berú zoznam miest, názvy krajín, tvary PSČ a
 * rozdelenie voľnej adresy (zadanie sepa-mesto-jazyk, 20. 11. 2026: návrh
 * opravy v motore a platená oprava tak používajú ten istý zoznam).
 *
 * Štyri opravy, nič viac: (a) AdrLine → StrtNm, BldgNb, PstCd, TwnNm, Ctry,
 * len keď je rozdelenie jednoznačné; (b) názov krajiny → kód; (c) medzery
 * v IBAN; (d) prepočet NbOfTxs a CtrlSum. Pri neistote sa nič nemení a
 * položka ide do zoznamu na ručné rozhodnutie. */
import { countryCode, parseAddressLines } from './doctor-pain001.js';

export { countryCode, parseAddressLines };
// ---------------------------------------------------------------------------
// deterministické opravy
// ---------------------------------------------------------------------------

/** (b) <Ctry>Slovensko</Ctry> -> <Ctry>SK</Ctry>. Neznáme názvy ostávajú a idú do zoznamu. */
export function fixCountryNames(xml) {
  let count = 0;
  const unresolved = [];
  const zmeny = [];
  const out = xml.replace(/<Ctry>([^<]*)<\/Ctry>/g, (m, v, offset) => {
    const trimmed = v.trim();
    if (/^[A-Z]{2}$/.test(trimmed)) return trimmed === v ? m : `<Ctry>${trimmed}</Ctry>`;
    const code = countryCode(trimmed);
    if (!code) { if (!unresolved.includes(trimmed)) unresolved.push(trimmed); return m; }
    count++;
    zmeny.push({ kde: partyBefore(xml.slice(0, offset)) || '?', z: v, na: code });
    return `<Ctry>${code}</Ctry>`;
  });
  return { xml: out, count, unresolved, zmeny };
}

const ACCOUNT_TAGS = ['DbtrAcct', 'CdtrAcct'];

/** (c) medzery a iné biele znaky vnútri <IBAN>. */
export function fixIbanWhitespace(xml) {
  let count = 0;
  const zmeny = [];
  const out = xml.replace(/<IBAN>([^<]*)<\/IBAN>/g, (m, v, offset) => {
    const clean = v.replace(/\s+/g, '');
    if (clean === v) return m;
    count++;
    zmeny.push({ kde: partyBefore(xml.slice(0, offset), ACCOUNT_TAGS) || '?', z: v, na: clean });
    return `<IBAN>${clean}</IBAN>`;
  });
  return { xml: out, count, zmeny };
}

const STRUCTURED_TAGS = /<(Dept|SubDept|StrtNm|BldgNb|BldgNm|Flr|PstBx|Room|PstCd|TwnNm|TwnLctnNm|DstrctNm|CtrySubDvsn|Ctry)>/;
const PARTY_TAGS = ['Dbtr', 'Cdtr', 'UltmtDbtr', 'UltmtCdtr', 'InitgPty'];

/** Strana, ktorej adresa patrí: posledná otvorená značka strany pred pozíciou. */
function partyBefore(prefix, tags = PARTY_TAGS) {
  let best = null;
  for (const tag of tags) {
    const open = prefix.lastIndexOf(`<${tag}>`);
    if (open < 0) continue;
    const close = prefix.lastIndexOf(`</${tag}>`);
    if (close > open) continue;
    if (!best || open > best.at) best = { tag, at: open };
  }
  return best ? best.tag : null;
}

function ibanCountryFor(party, prefix, suffix, xml) {
  let m = null;
  // Hľadanie je ohraničené blokom tej istej strany: bez toho by sa pri
  // príjemcovi bez IBAN (Othr) vzal IBAN z NASLEDUJÚCEJ transakcie a adresa
  // by dostala cudziu krajinu (nález overovateľa 10. 9. 2026).
  const koniecTx = suffix.indexOf('</CdtTrfTxInf>');
  const zacTx = suffix.indexOf('<CdtTrfTxInf>');
  const blokCdtr = koniecTx >= 0 ? suffix.slice(0, koniecTx) : suffix;
  const blokDbtr = zacTx >= 0 ? suffix.slice(0, zacTx) : suffix;
  if (party === 'Dbtr') m = blokDbtr.match(/<DbtrAcct>[\s\S]*?<IBAN>\s*([^<]+?)\s*<\/IBAN>/);
  else if (party === 'Cdtr') m = blokCdtr.match(/<CdtrAcct>[\s\S]*?<IBAN>\s*([^<]+?)\s*<\/IBAN>/);
  else if (party === 'InitgPty') m = xml.match(/<DbtrAcct>[\s\S]*?<IBAN>\s*([^<]+?)\s*<\/IBAN>/);
  if (!m) return null;
  const iban = m[1].replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}/.test(iban) ? iban.slice(0, 2) : null;
}

/**
 * (a) <PstlAdr> len s <AdrLine> -> štruktúrovaná adresa. Odsadenie sa
 * preberá z pôvodných riadkov, aby súbor po oprave vyzeral ako pred ňou.
 * posun pri rucne aj zoznam je poloha "<PstlAdr>" v pôvodnom texte; platená
 * správa z neho cez vytvorPolohy() píše riadok (zadanie sepa-riadok, 20. 11. 2026).
 */
export function fixAdrLines(xml) {
  let count = 0;
  const manual = [];
  const zoznam = [];
  let poradie = 0;
  const out = xml.replace(/<PstlAdr>([\s\S]*?)<\/PstlAdr>/g, (m, inner, offset) => {
    if (!/<AdrLine>/.test(inner)) return m;
    poradie++;
    const lines = [...inner.matchAll(/<AdrLine>([^<]*)<\/AdrLine>/g)].map((x) => x[1].trim()).filter(Boolean);
    const prefix = xml.slice(0, offset);
    const suffix = xml.slice(offset + m.length);
    const party = partyBefore(prefix) || '?';
    if (STRUCTURED_TAGS.test(inner)) {
      // Hybridná adresa (AdrLine + TwnNm/Ctry) je po termíne prípustná; nechávame ju človeku.
      return m;
    }
    const ibanCountry = ibanCountryFor(party, prefix, suffix, xml);
    const parsed = parseAddressLines(lines, ibanCountry);
    if (!parsed.ok) {
      manual.push({ poradie, strana: party, riadky: lines, dovod: parsed.reason, posun: offset });
      return m;
    }
    const sepMatch = inner.match(/(\r?\n[ \t]*)<AdrLine>/);
    const sep = sepMatch ? sepMatch[1] : '';
    const tail = (inner.match(/\s*$/) || [''])[0];
    const f = parsed.fields;
    const body = ['StrtNm', 'BldgNb', 'PstCd', 'TwnNm', 'Ctry'].map((k) => `${sep}<${k}>${f[k]}</${k}>`).join('');
    count++;
    zoznam.push({ poradie, strana: party, riadky: lines, polia: f, zdrojKrajiny: parsed.zdrojKrajiny, posun: offset });
    return `<PstlAdr>${body}${tail}</PstlAdr>`;
  });
  return { xml: out, count, manual, zoznam };
}

/** '450.00' -> 45000 centov; null pre čokoľvek, čo nie je čistá suma s bodkou. */
function toCents(s) {
  const m = String(s).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
}
function fromCents(c) {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

function totalsOf(block) {
  const txCount = (block.match(/<CdtTrfTxInf>/g) || []).length;
  let cents = 0;
  let bad = 0;
  for (const m of block.matchAll(/<InstdAmt[^>]*>([^<]*)<\/InstdAmt>/g)) {
    const c = toCents(m[1]);
    if (c === null) bad++; else cents += c;
  }
  return { txCount, cents, bad };
}

function replaceTotals(block, totals, changes, where) {
  let out = block;
  out = out.replace(/<NbOfTxs>([^<]*)<\/NbOfTxs>/, (m, v) => {
    if (v.trim() === String(totals.txCount)) return m;
    changes.push({ kde: where, prvok: 'NbOfTxs', z: v.trim(), na: String(totals.txCount) });
    return `<NbOfTxs>${totals.txCount}</NbOfTxs>`;
  });
  if (totals.bad === 0) {
    out = out.replace(/<CtrlSum>([^<]*)<\/CtrlSum>/, (m, v) => {
      const want = fromCents(totals.cents);
      if (toCents(v) === totals.cents) return m;
      changes.push({ kde: where, prvok: 'CtrlSum', z: v.trim(), na: want });
      return `<CtrlSum>${want}</CtrlSum>`;
    });
  }
  return out;
}

/** (d) NbOfTxs a CtrlSum v GrpHdr aj v každom PmtInf, ak tam sú. */
export function fixTotals(xml) {
  const changes = [];
  const manual = [];
  const all = totalsOf(xml);
  // kluc a pocet: platená správa (ops/kontrola/zakazka.mjs) z nich skladá vetu v jazyku
  // správy, bez čítania slovenskej vety dovod; dovod ostáva ako doteraz (brána pokus 1, A4).
  if (all.bad > 0) manual.push({ co: 'CtrlSum', kluc: 'sumy_tvar', pocet: all.bad, dovod: `${all.bad} suma (InstdAmt) nie je v tvare 123.45, súčet sa nedá spoľahlivo prepočítať` });
  let out = xml.replace(/<GrpHdr>([\s\S]*?)<\/GrpHdr>/, (m, inner) => {
    if (!/<NbOfTxs>/.test(inner)) manual.push({ co: 'NbOfTxs', kluc: 'nboftxs_chyba', dovod: 'v GrpHdr chýba povinný NbOfTxs; doplniť musí človek na správne miesto' });
    return `<GrpHdr>${replaceTotals(inner, all, changes, 'GrpHdr')}</GrpHdr>`;
  });
  let i = 0;
  out = out.replace(/<PmtInf>([\s\S]*?)<\/PmtInf>/g, (m, inner) => {
    i++;
    if (!/<NbOfTxs>|<CtrlSum>/.test(inner.split('<CdtTrfTxInf>')[0])) return m;
    const head = inner.split('<CdtTrfTxInf>')[0];
    const rest = inner.slice(head.length);
    return `<PmtInf>${replaceTotals(head, totalsOf(inner), changes, `PmtInf ${i}`)}${rest}</PmtInf>`;
  });
  return { xml: out, changes, manual, txCount: all.txCount, sum: all.bad === 0 ? fromCents(all.cents) : null };
}

/** Všetky štyri opravy v pevnom poradí. Nič iné sa v súbore nemení. */
export function applyDeterministicFixes(xml) {
  const a = fixAdrLines(xml);
  const b = fixCountryNames(a.xml);
  const c = fixIbanWhitespace(b.xml);
  const d = fixTotals(c.xml);
  return {
    xml: d.xml,
    adresy: { pocet: a.count, rucne: a.manual, zoznam: a.zoznam },
    krajiny: { pocet: b.count, nezname: b.unresolved, zmeny: b.zmeny },
    iban: { pocet: c.count, zmeny: c.zmeny },
    sucty: { zmeny: d.changes, rucne: d.manual, pocetPlatieb: d.txCount, sucet: d.sum },
  };
}

// ---------------------------------------------------------------------------
// bezplatný náhľad pred platbou (F-N4, 24. 9. 2026)
// ---------------------------------------------------------------------------

/** Najviac toľko dvojíc „pred a po“ smie vidieť človek pred platbou. Strop
 *  platí aj vtedy, keď volajúci pošle väčšie číslo. */
export const NAHLAD_STROP = 3;

/**
 * Z výsledku applyDeterministicFixes vyberie najviac NAHLAD_STROP zmien ako
 * krátke úryvky XML: len zmenené prvky, nikdy okolie (mená, sumy, iné účty)
 * ani celý súbor. Poradie: najprv po jednej zmene z každého druhu (adresa,
 * krajina, IBAN, súčet), aby náhľad ukázal, čo všetko oprava robí; potom
 * ďalšie v poradí zo súboru. Test: nahlad.test.mjs.
 *
 * @returns {{dvojice: {druh: string, kde: string, pred: string, po: string}[], spolu: number}}
 */
export function nahladOpravy(fx, max = NAHLAD_STROP) {
  const strop = Math.max(0, Math.min(Number(max) || 0, NAHLAD_STROP));
  const druhy = [
    ((fx && fx.adresy && fx.adresy.zoznam) || []).map((x) => ({
      druh: 'adresa',
      kde: x.strana,
      pred: x.riadky.map((r) => `<AdrLine>${r}</AdrLine>`).join('\n'),
      po: ['StrtNm', 'BldgNb', 'PstCd', 'TwnNm', 'Ctry'].map((k) => `<${k}>${x.polia[k]}</${k}>`).join('\n'),
    })),
    ((fx && fx.krajiny && fx.krajiny.zmeny) || []).map((x) => ({
      druh: 'krajina', kde: x.kde, pred: `<Ctry>${x.z}</Ctry>`, po: `<Ctry>${x.na}</Ctry>`,
    })),
    ((fx && fx.iban && fx.iban.zmeny) || []).map((x) => ({
      druh: 'iban', kde: x.kde, pred: `<IBAN>${x.z}</IBAN>`, po: `<IBAN>${x.na}</IBAN>`,
    })),
    ((fx && fx.sucty && fx.sucty.zmeny) || []).map((x) => ({
      druh: 'sucet', kde: x.kde, pred: `<${x.prvok}>${x.z}</${x.prvok}>`, po: `<${x.prvok}>${x.na}</${x.prvok}>`,
    })),
  ];
  const spolu = druhy.reduce((s, d) => s + d.length, 0);
  const dvojice = [];
  for (let kolo = 0; dvojice.length < strop; kolo++) {
    let pridane = false;
    for (const d of druhy) {
      if (dvojice.length >= strop) break;
      if (kolo < d.length) { dvojice.push(d[kolo]); pridane = true; }
    }
    if (!pridane) break;
  }
  return { dvojice, spolu };
}

