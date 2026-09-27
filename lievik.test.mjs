// Lievik opravy za 29 EUR po kontrole suboru (ops/druhy-ucet/SEPA-LIEVIK.md, 27. 9. 2026).
//
// Co strazi, na vsetkych troch strankach (sk, de, en):
// 1. Ked sa da subor opravit automaticky (moznych > 0), je hned pod verdiktom
//    ramcek opravy za 29 EUR a kontrola za 149 EUR az pod nim ako druha volba.
//    Ked oprava mozna nie je (moznych = 0), ostava pod verdiktom kontrola ako doteraz.
// 2. Bezplatna diagnoza: kazda chyba ostava s miestom a pravidlom, presna
//    opravena hodnota s tlacidlom kopirovat len pre prve 3 z tych, ktore oprava
//    naozaj spravi (NAHLAD_STROP), za nimi jedna veta. Navrhy, ktore oprava
//    nerobi, ostavaju cele.
// 3. Tlacidlo platby je aktivne; klik bez suhlasu nepresmeruje, zvyrazni
//    policko suhlasu, da mu fokus, ukaze vetu a posle Umami oprava_bez_suhlasu.
//
// Ako: funkcie ukazOpravu a renderResult sa vytiahnu priamo zo zdroja stranky
// a spustia v Node nad skutocnymi subormi pain.001, s malymi nahradami za DOM.
// Ziadny prehliadac, ziadna siet, ziadny Stripe.
// usage: node --test products/sepa-pain001-doctor/lievik.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { applyDeterministicFixes, nahladOpravy, NAHLAD_STROP } from './oprava.mjs';
import { diagnose } from './doctor-pain001.js';

const TU = dirname(fileURLToPath(import.meta.url));
const STRANKY = [['index.html', 'sk'], ['de/index.html', 'de'], ['en/index.html', 'en']];
const ODKAZ = 'https://buy.stripe.com/odkaz-z-testu';

// ── subory ─────────────────────────────────────────────────────────────
// Vsetky styri druhy oprav: volna adresa pri kazdom prijemcovi, nazov krajiny
// pri platitelovi, IBAN s medzerami, zly pocet a sucet v hlavicke.
function suborSOpravou(n) {
  let tx = '';
  let sucet = 0;
  for (let i = 1; i <= n; i++) {
    const suma = 100 + i;
    sucet += suma;
    tx += `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>/VS2026${i}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${suma}.00</InstdAmt></Amt>
        <Cdtr>
          <Nm>Dodavatel ${i} s.r.o.</Nm>
          <PstlAdr>
            <AdrLine>Hlavna ${i}</AdrLine>
            <AdrLine>811 0${i % 10} Bratislava</AdrLine>
          </PstlAdr>
        </Cdtr>
        <CdtrAcct><Id><IBAN>SK05 0200 0000 2720 0000 00${String(i).padStart(2, '0')}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>Faktura ${i}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>LIEVIK-OPRAVA</MsgId>
      <CreDtTm>2026-09-27T09:00:00</CreDtTm>
      <NbOfTxs>${n + 1}</NbOfTxs>
      <CtrlSum>${sucet + 1}.00</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>LIEVIK-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt>2026-09-30</ReqdExctnDt>
      <Dbtr>
        <Nm>Platitel a.s.</Nm>
        <PstlAdr><StrtNm>Ivanska cesta</StrtNm><BldgNb>32E</BldgNb><PstCd>821 04</PstCd><TwnNm>Bratislava</TwnNm><Ctry>Slovensko</Ctry></PstlAdr>
      </Dbtr>
      <DbtrAcct><Id><IBAN>SK28 1100 0000 1910 0000 0005</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>TATRSKBX</BIC></FinInstnId></DbtrAgt>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

// Chyba, ktoru automaticka oprava neriesi: BIC inej banky pri platitelovi
// (Tatra banka chce TATRSKBX). Ziadna adresa, IBAN bez medzier, sucty sedia.
function suborBezOpravy() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>LIEVIK-BIC</MsgId>
      <CreDtTm>2026-09-27T09:00:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>450.00</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>LIEVIK-BIC-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>2026-09-30</ReqdExctnDt>
      <Dbtr><Nm>Firma s.r.o.</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>SK2811000000191000000005</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>SUBASKBX</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtTrfTxInf>
        <PmtId><EndToEndId>/VS123</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">450.00</InstdAmt></Amt>
        <Cdtr><Nm>Jozef Stastny</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>Faktura 2026-0912</Ustrd></RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

// n prijemcov s nazvom krajiny Slovensko namiesto SK (oprava ho zmeni), jeden
// s nazvom, ktory oprava nepozna, plus dve chyby, ktore oprava nerobi: BIC
// platitela a poradie symbolov v EndToEndId.
function suborVelaKrajin(n) {
  const krajiny = [...Array(n).fill('Slovensko'), 'Absurdistan'];
  let tx = '';
  let sucet = 0;
  krajiny.forEach((k, i) => {
    const suma = 100 + i;
    sucet += suma;
    tx += `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${i === 0 ? '/VS1/KS0308/SS14' : '/VS' + (i + 1)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${suma}.00</InstdAmt></Amt>
        <Cdtr>
          <Nm>Dodavatel ${i + 1}</Nm>
          <PstlAdr><StrtNm>Hlavna</StrtNm><BldgNb>${i + 1}</BldgNb><PstCd>81101</PstCd><TwnNm>Bratislava</TwnNm><Ctry>${k}</Ctry></PstlAdr>
        </Cdtr>
        <CdtrAcct><Id><IBAN>SK0502000000272000000018</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>Faktura ${i + 1}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>LIEVIK-KRAJINY</MsgId>
      <CreDtTm>2026-09-27T09:00:00</CreDtTm>
      <NbOfTxs>${krajiny.length}</NbOfTxs>
      <CtrlSum>${sucet}.00</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>LIEVIK-KRAJINY-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>2026-09-30</ReqdExctnDt>
      <Dbtr><Nm>Firma s.r.o.</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>SK2811000000191000000005</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>SUBASKBX</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

const moznych = (xml) => {
  const fx = applyDeterministicFixes(xml);
  return fx.adresy.pocet + fx.krajiny.pocet + fx.iban.pocet + fx.sucty.zmeny.length;
};

// ── nahrady za DOM ─────────────────────────────────────────────────────
function prvok() {
  const posluchaci = {};
  const triedy = new Set();
  return {
    hidden: true, checked: false, innerHTML: '', attrs: {}, fokus: 0,
    classList: { add: (c) => triedy.add(c), remove: (c) => triedy.delete(c), contains: (c) => triedy.has(c) },
    addEventListener(typ, f) { (posluchaci[typ] = posluchaci[typ] || []).push(f); },
    spusti(typ) { (posluchaci[typ] || []).forEach((f) => f()); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    focus() { this.fokus += 1; },
  };
}

for (const [cesta, jazyk] of STRANKY) {
  const HTML = readFileSync(resolve(TU, cesta), 'utf8').split('\r\n').join('\n');

  function zdroj(meno) {
    const od = HTML.indexOf('function ' + meno + '(');
    assert.ok(od > 0, cesta + ': funkcia ' + meno + ' sa nenasla');
    let hlbka = 0;
    for (let j = HTML.indexOf('{', od); j < HTML.length; j++) {
      if (HTML[j] === '{') hlbka += 1;
      else if (HTML[j] === '}') { hlbka -= 1; if (hlbka === 0) return HTML.slice(od, j + 1); }
    }
    throw new Error(cesta + ': telo funkcie ' + meno + ' sa neskoncilo');
  }
  const fn = (meno, z = {}) => new Function(...Object.keys(z), zdroj(meno) + '\nreturn ' + meno + ';')(...Object.values(z));

  const slovnik = HTML.match(/const SLOVNIK = (\{[\s\S]*?\n  \});\n  const UI = SLOVNIK/);
  assert.ok(slovnik, cesta + ': SLOVNIK sa nenasiel');
  const SLOVNIK = new Function('return ' + slovnik[1])();
  const UI = SLOVNIK[jazyk];
  const esc = fn('esc');
  const opravaPocty = fn('opravaPocty');
  const kody = HTML.match(/const OPRAVA_KODY = (\[[\s\S]*?\n  \]);/);
  assert.ok(kody, cesta + ': OPRAVA_KODY sa nenasli');
  const OPRAVA_KODY = new Function('UI', 'return ' + kody[1])(UI);
  const SAMPLE_XML = HTML.match(/const SAMPLE_XML = `([\s\S]*?)`;/)[1];
  const ponukyHtml = fn('ponukyHtml');
  const opravyHtml = fn('opravyHtml');
  const opravaSpravi = fn('opravaSpravi');
  const suhlasPredPlatbou = fn('suhlasPredPlatbou');

  // Jedna kontrola suboru tak, ako ju spravi runDiagnose: najprv ukazOpravu,
  // potom renderResult. Vrati, co clovek uvidi, a vsetky udalosti Umami.
  function kontrola(cfg, { zaplatene = false } = {}) {
    const udalosti = [];
    const track = (n, d) => udalosti.push([n, d]);
    const chk = prvok(); const btn = prvok(); const riadok = prvok(); const veta = prvok(); const stiahnut = prvok();
    const deti = { '#oprava-suhlas': chk, '#oprava-kupit': btn, '.oprava-suhlas': riadok, '#oprava-suhlas-najprv': veta, '#oprava-stiahnut': stiahnut };
    const box = prvok();
    box.querySelector = (s) => deti[s] || null;
    const okno = { location: { href: '' } };
    const ukazOpravu = fn('ukazOpravu', {
      opravaBox: box, sledujNahlad: () => {}, applyDeterministicFixes, opravaPocty, OPRAVA_KODY, UI, esc,
      opravaMoznaTxt: fn('opravaMoznaTxt', { UI }), odtlacokXml: fn('odtlacokXml'), rozhodniOpravu: fn('rozhodniOpravu'),
      opravaZaplatene: zaplatene, opravaViazane: null, ulozViazanie: () => {}, opravaSession: 'cs_z_testu',
      stiahniOpraveny: () => {}, opravaLinkNow: () => ODKAZ, nahladOpravy, NAHLAD_STROP, SAMPLE_XML,
      nahladHtml: fn('nahladHtml'), VRATENIE_ZAPNUTE: true, track, JAZYK: jazyk, suhlasPredPlatbou,
      OPRAVA_KLUC: 'doctor:oprava', sessionStorage: { setItem() {} }, sOdkazomReklamy: (o) => o, window: okno, opravaSpravi,
    });
    const vysledok = diagnose({ ...cfg, lang: jazyk });
    const stav = ukazOpravu(cfg, vysledok);
    let vlozene = null;
    let domov = 0;
    const output = {
      innerHTML: '',
      querySelector(s) {
        if (s === '#oprava-miesto' && this.innerHTML.includes('id="oprava-miesto"')) return { replaceWith: (el) => { vlozene = el; } };
        return null;
      },
      querySelectorAll() { return []; },
    };
    const renderResult = fn('renderResult', {
      opravaStav: stav, opravaBox: box, expectedRow: fn('expectedRow', { esc }), UI, BANK_LABELS: {}, esc, opravyHtml,
      NAHLAD_STROP, $: () => null, ponukyHtml, track, JAZYK: jazyk, output, opravaDomovVrat: () => { domov += 1; },
    });
    renderResult(vysledok);
    return { stav, vysledok, box, chk, btn, riadok, veta, okno, udalosti, html: output.innerHTML, vlozene, domov };
  }

  test(cesta + ': moznych > 0, pod verdiktom je hned oprava za 29 EUR a kontrola 149 EUR pod nou ako druha volba', () => {
    const xml = suborSOpravou(4);
    assert.ok(moznych(xml) > 0, 'vzorka ma mat co opravit');
    const k = kontrola({ xml, bank: 'generic', expectedTxCount: null });
    assert.equal(k.stav && k.stav.stav, 'kupit');
    assert.equal(k.box.hidden, false, 'ramcek opravy je skryty');
    assert.equal(k.vlozene, k.box, 'ramcek opravy sa nevlozil pod verdikt');
    assert.equal(k.domov, 0);
    const verdikt = k.html.indexOf('<p class="result-summary">');
    const oprava = k.html.indexOf('<div id="oprava-miesto"></div>');
    const kontrolaDruha = k.html.indexOf('<div class="ponuka ponuka-druha">');
    const tabulka = k.html.indexOf('class="exp-table"');
    assert.ok(verdikt >= 0 && verdikt < oprava && oprava < kontrolaDruha && kontrolaDruha < tabulka,
      'poradie ma byt verdikt, oprava 29 EUR, kontrola 149 EUR, diagnoza: ' + [verdikt, oprava, kontrolaDruha, tabulka].join(', '));
    assert.match(k.html.slice(verdikt, oprava), /^<p class="result-summary">[^<]*<\/p>\s*<\/div>\s*$/, 'medzi verdiktom a opravou je este nieco');
    assert.ok(k.html.includes(esc(UI.ponukaDruhaNadpis)), 'kontrola nema vetu druhej volby');
    assert.ok(!k.html.includes(esc(UI.ponukaText)), 'kontrola ma text prvej volby');
    assert.ok(k.html.includes('class="btn btn-line ponuka-btn"'), 'tlacidlo kontroly ma byt tichsie (obrys)');
    assert.ok(k.box.innerHTML.includes('id="oprava-nahlad"'), 'v ramceku opravy chyba nahlad');
    assert.ok(k.udalosti.some(([n, d]) => n === 'ponuka_zobrazena' && d.poradie === 'druha'));
    assert.ok(k.udalosti.some(([n]) => n === 'oprava_ponuka_zobrazena'));
  });

  test(cesta + ': moznych = 0, pod verdiktom ostava kontrola 149 EUR ako doteraz', () => {
    const xml = suborBezOpravy();
    assert.equal(moznych(xml), 0, 'vzorka nema mat co opravit automaticky');
    const k = kontrola({ xml, bank: 'tatrabanka', expectedTxCount: null });
    const blokujuce = k.vysledok.problems.filter((p) => p.severity === 'high').length;
    assert.ok(blokujuce > 0, 'vzorka ma mat blokujucu chybu');
    assert.equal(k.stav, null);
    assert.equal(k.box.hidden, true, 'ramcek opravy je viditelny');
    assert.equal(k.vlozene, null);
    assert.equal(k.domov, 1, 'ramcek sa nevratil na svoje miesto pod nastrojom');
    assert.ok(!k.html.includes('oprava-miesto'));
    const verdikt = k.html.indexOf('<p class="result-summary">');
    const kontrolaPrva = k.html.indexOf('<div class="ponuka">');
    const tabulka = k.html.indexOf('class="exp-table"');
    assert.ok(verdikt >= 0 && verdikt < kontrolaPrva && kontrolaPrva < tabulka, 'kontrola nie je hned pod verdiktom');
    assert.match(k.html.slice(verdikt, kontrolaPrva), /^<p class="result-summary">[^<]*<\/p>\s*<\/div>\s*$/);
    assert.ok(k.html.includes(esc(UI.ponukaNadpis(0, blokujuce))));
    assert.ok(k.html.includes(esc(UI.ponukaText)));
    assert.ok(k.html.includes('class="btn btn-solid ponuka-btn"'));
    assert.ok(k.udalosti.some(([n, d]) => n === 'ponuka_zobrazena' && d.poradie === 'prva'));
    // Bez ponuky opravy sa v diagnoze ukazuju vsetky hodnoty ako doteraz.
    assert.equal((k.html.match(/class="icon-btn copy-fix-btn"/g) || []).length, k.vysledok.fixes.length);
    assert.ok(!k.html.includes('class="fix-zvysok"'));
  });

  test(cesta + ': po zaplateni je ramcek so stiahnutim pod verdiktom a kontrola 149 EUR sa pod nim neopakuje', () => {
    const k = kontrola({ xml: suborSOpravou(2), bank: 'generic', expectedTxCount: null }, { zaplatene: true });
    assert.equal(k.stav && k.stav.stav, 'zaplatene');
    assert.equal(k.vlozene, k.box);
    assert.ok(k.box.innerHTML.includes('id="oprava-stiahnut"'));
    assert.ok(!k.html.includes('class="ponuka'), 'druha ponuka kontroly by bola hned pod odkazom na kontrolu v ramceku');
    assert.equal((k.html.match(/class="icon-btn copy-fix-btn"/g) || []).length, k.vysledok.fixes.length, 'po zaplateni sa hodnoty neobmedzuju');
  });

  test(cesta + ': strop 3 hodnot, presna hodnota s kopirovanim len pre prve 3 z tych, ktore oprava spravi', () => {
    assert.equal(NAHLAD_STROP, 3);
    const k = kontrola({ xml: suborVelaKrajin(6), bank: 'tatrabanka', expectedTxCount: null });
    assert.equal(k.stav && k.stav.stav, 'kupit');
    const r = k.vysledok;
    const sNavrhom = r.problems.filter((p) => p.fix);
    const opravene = k.stav.opravene;
    assert.equal(opravene.length, r.fixes.length);
    const kryte = opravene.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    const nekryte = opravene.map((b, i) => (b ? -1 : i)).filter((i) => i >= 0);
    assert.equal(kryte.length, 6, 'sest nazvov Slovensko opravi oprava');
    assert.ok(kryte.every((i) => sNavrhom[i].code === 'adresa_zly_kod_krajiny'));
    // Nazov, ktory oprava nepozna, ani BIC a poradie symbolov oprava nerobi.
    const abs = sNavrhom.findIndex((p) => p.value === 'Absurdistan');
    assert.ok(abs >= 0 && opravene[abs] === false, 'neznamy nazov krajiny sa ma ukazat cely');
    assert.ok(sNavrhom.some((p, i) => p.code === 'dbtr_bic_mismatch' && !opravene[i]));
    assert.ok(sNavrhom.some((p, i) => p.code === 'reference_symbol_order' && !opravene[i]));

    const ukazane = [...k.html.matchAll(/data-fix-index="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(ukazane.filter((i) => opravene[i]), kryte.slice(0, 3), 'z opravitelnych hodnot maju byt vidiet presne prve 3');
    assert.deepEqual(ukazane.filter((i) => !opravene[i]), nekryte, 'hodnoty, ktore oprava nerobi, maju ostat vsetky');
    assert.ok(k.html.includes('<p class="fix-zvysok">' + esc(UI.opravyZvysok(3)) + '</p>'), 'chyba veta o 3 dalsich hodnotach');
    // Nic o tom, co je zle, sa neskryva: kazda chyba je v zozname s miestom.
    assert.equal((k.html.match(/<div class="problem-item /g) || []).length, r.problems.length);
    for (const p of r.problems) if (p.path) assert.ok(k.html.includes(esc(p.path)), 'chyba miesto ' + p.path);
    // Bez ponuky opravy (napr. bez odkazu na platbu) sa ukaze vsetko.
    const vsetko = opravyHtml(r.fixes, null, UI, esc, NAHLAD_STROP);
    assert.equal((vsetko.match(/data-fix-index=/g) || []).length, r.fixes.length);
    assert.ok(!vsetko.includes('fix-zvysok'));
    // Pri najviac 3 opravitelnych hodnotach sa nic neskryva a veta nie je.
    const tri = opravyHtml(r.fixes.slice(0, 5), [true, true, true, false, false], UI, esc, NAHLAD_STROP);
    assert.equal((tri.match(/data-fix-index=/g) || []).length, 5);
    assert.ok(!tri.includes('fix-zvysok'));
    assert.ok(opravaSpravi({ code: 'dbtr_bic_mismatch', value: 'SUBASKBX' }, applyDeterministicFixes(suborVelaKrajin(2))) === false);
  });

  test(cesta + ': tlacidlo platby je aktivne, bez suhlasu nepresmeruje, zvyrazni policko a posle oprava_bez_suhlasu', () => {
    const k = kontrola({ xml: suborSOpravou(3), bank: 'generic', expectedTxCount: null });
    const b = k.box.innerHTML;
    assert.ok(!/id="oprava-kupit"[^>]*\bdisabled\b/.test(b), 'tlacidlo platby je zasednute');
    const suhlas = b.indexOf('<label class="oprava-suhlas">');
    const veta = b.indexOf('id="oprava-suhlas-najprv"');
    const tlacidlo = b.indexOf('id="oprava-kupit"');
    assert.ok(suhlas >= 0 && suhlas < veta && veta < tlacidlo, 'veta ma byt pod polickom suhlasu a nad tlacidlom');
    assert.ok(b.includes('role="alert" hidden>' + esc(UI.opravaSuhlasNajprv) + '</p>'), 'veta ma byt skryta, kym sa nekline');

    k.btn.spusti('click');
    assert.equal(k.okno.location.href, '', 'bez suhlasu sa presmerovalo na platbu');
    assert.ok(k.riadok.classList.contains('oprava-suhlas-chyba'), 'policko suhlasu nie je zvyraznene');
    assert.equal(k.veta.hidden, false, 'veta pod polickom sa neukazala');
    assert.equal(k.chk.fokus, 1, 'fokus nesiel na policko suhlasu');
    assert.equal(k.chk.getAttribute('aria-invalid'), 'true');
    const bez = k.udalosti.filter(([n]) => n === 'oprava_bez_suhlasu');
    assert.equal(bez.length, 1);
    assert.equal(bez[0][1].produkt, 'sepa');
    assert.equal(bez[0][1].jazyk, jazyk);
    assert.ok(!k.udalosti.some(([n]) => n === 'oprava_kupa_click'), 'kupa sa zapocitala bez suhlasu');
    k.btn.spusti('click');
    assert.equal(k.udalosti.filter(([n]) => n === 'oprava_bez_suhlasu').length, 1, 'udalost ma ist raz za zobrazenu ponuku');
    assert.equal(k.chk.fokus, 2);

    k.chk.checked = true;
    k.chk.spusti('change');
    assert.ok(!k.riadok.classList.contains('oprava-suhlas-chyba'), 'po zaskrtnuti ostal ramik chyby');
    assert.equal(k.veta.hidden, true);
    assert.equal(k.chk.getAttribute('aria-invalid'), null);
    k.btn.spusti('click');
    assert.equal(k.okno.location.href, ODKAZ, 'so suhlasom sa na platbu nepreslo');
    assert.ok(k.udalosti.some(([n]) => n === 'oprava_kupa_click'));
  });

  test(cesta + ': texty vo vsetkych troch jazykoch, ceny a veta o banke ostavaju, CSS a staticka kontrola dolu', () => {
    for (const kluc of ['opravaSuhlasNajprv:', 'ponukaDruhaNadpis:', 'ponukaDruhaText:', 'opravyZvysok:']) {
      assert.equal((HTML.match(new RegExp(kluc, 'g')) || []).length, 3, kluc + ' nie je vo vsetkych troch jazykoch');
    }
    const banka = { sk: 'o prijatí rozhoduje vaša banka', en: 'your bank decides acceptance', de: 'über die Annahme entscheidet Ihre Bank' };
    for (const j of ['sk', 'en', 'de']) {
      const T = SLOVNIK[j];
      assert.ok(T.ponukaDruhaNadpis.endsWith('149 €'), j + ': druha volba nekonci cenou 149 EUR');
      assert.ok(T.ponukaDruhaText.includes(banka[j]), j + ': v druhej volbe chyba veta o banke');
      assert.ok(T.opravyZvysok(4).includes('(29 €)') && T.opravyZvysok(4).includes('4'));
      // Pomlcka en a em (U+2013, U+2014), zlozena z kodov, aby ju tento subor sam neobsahoval.
      const POMLCKY = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
      for (const t of [T.opravaSuhlasNajprv, T.ponukaDruhaNadpis, T.ponukaDruhaText, T.opravyZvysok(1), T.opravyZvysok(7), T.opravaText('x')]) {
        assert.ok(!POMLCKY.test(t), j + ': pomlcka v texte: ' + t);
      }
    }
    assert.equal(SLOVNIK.en.opravaSuhlasNajprv, 'Tick this box first, then pay.');
    assert.equal(SLOVNIK.en.opravyZvysok(3), '3 more values are fixed automatically in the corrected file (29 €).');
    assert.equal(SLOVNIK.en.opravyZvysok(1), '1 more value is fixed automatically in the corrected file (29 €).');
    // Ramcek opravy je od 27. 9. nad diagnozou, text uz nesmie hovorit vyssie.
    assert.ok(!/vyššie|above|oben/.test(SLOVNIK[jazyk].opravaText('x')));
    // runDiagnose pripravi opravu pred vysledkom a len raz.
    const beh = zdroj('runDiagnose');
    assert.ok(beh.indexOf('opravaStav = ukazOpravu(cfg, result);') > 0 && beh.indexOf('opravaStav = ukazOpravu(cfg, result);') < beh.indexOf('renderResult(result);'));
    assert.equal((HTML.match(/ukazOpravu\(cfg, result\)/g) || []).length, 1);
    // Surovy JSON a ukazka vratia ramcek na jeho miesto pod nastrojom.
    assert.ok(zdroj('rerenderOutput').includes('opravaDomovVrat();'));
    // Ramik akcentovou farbou pri kliku bez suhlasu.
    assert.ok(HTML.includes('.oprava-suhlas.oprava-suhlas-chyba{border-color:var(--accent)'));
    // Staticka kontrola 149 EUR pod nastrojom ostava (nie je hned pod inou ponukou 149 EUR).
    assert.equal((HTML.match(/data-umami-event="kontrola_click" data-umami-event-place="doctor"/g) || []).length, 1);
    assert.ok(HTML.indexOf('id="oprava"') < HTML.indexOf('data-umami-event-place="doctor"'));
  });
}
