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
// 205 T5: stranky Kontroly SEPA suboru citaju k= z odkazu Doctora (npm test spusti aj tie).
import './kontrola-odkaz.test.mjs';

const TU = dirname(fileURLToPath(import.meta.url));
const STRANKY = [['index.html', 'sk'], ['de/index.html', 'de'], ['en/index.html', 'en']];
const ODKAZ = 'https://buy.stripe.com/odkaz-z-testu';
// Brana 205 (ops/ai/kontrola/2026-10-23-vysledok-emailom-205.md): P2 veta o 29 EUR pri nastroji presne v znení brany
// (oprava.mjs opravi len strukturu adries, nazvy krajin, medzery v IBAN a sucty, nie neplatny IBAN) a O8 veta
// tichého riadku pri warn.
const VETA_CENA = {
  sk: 'Diagnóza je zadarmo. Ak nájde chyby, ktoré vie opraviť sám (štruktúra adries, názvy krajín, medzery v IBAN, súčty), opravený súbor si stiahnete za 29 €.',
  en: 'The diagnosis is free. If it finds errors it can fix by itself (address structure, country names, spaces in IBANs, totals), you can download the corrected file for 29 €.',
  de: 'Die Diagnose ist kostenlos. Findet sie Fehler, die sie selbst beheben kann (Adressstruktur, Ländernamen, Leerzeichen in IBANs, Summen), laden Sie die korrigierte Datei für 29 € herunter.',
};
const MEDZERY_IBAN = { sk: 'medzery v IBAN', en: 'spaces in IBANs', de: 'Leerzeichen in IBANs' };
// N4 brany 205 (pokus 2): slovenska veta pri warn bez neobratneho „Ak ho chcete mat isty …“.
const VETA_WARN = {
  sk: 'Súbor má len drobné nálezy. Ak chcete mať pred odoslaním do banky istotu, prejde ho aj človek: kontrola za 149 €.',
  en: 'The file has only minor findings. If you want to be sure before you send it to the bank, a person can go through it too: a check for 149 €.',
  de: 'Die Datei hat nur kleinere Befunde. Wenn Sie vor dem Versand an die Bank sichergehen wollen, geht auch ein Mensch die Datei durch: Prüfung für 149 €.',
};

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

// 205 T3: len nalezy strednej a nizkej zavaznosti (poradie symbolov, datum),
// ziadna adresa, ziadna blokujuca chyba, nic na automaticku opravu.
function suborWarn() {
  return suborBezOpravy()
    .replace('<BIC>SUBASKBX</BIC>', '<BIC>TATRSKBX</BIC>')
    .replace('<EndToEndId>/VS123</EndToEndId>', '<EndToEndId>/VS123/KS0308/SS14</EndToEndId>');
}

// Kody nalezov, ktore pozna doctor-pain001.js (biely zoznam pre odkaz k= a stranky Kontroly).
const DOCTOR_KODY = [...new Set([...readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'doctor-pain001.js'), 'utf8')
  .matchAll(/code:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]))];

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
  // 205: necitatelny vstup, kody nalezov do odkazu, zhrnutie pre blok vysledku e-mailom.
  const zoznam = (meno) => {
    const m = HTML.match(new RegExp('const ' + meno + ' = (\\[[^\\]]*\\]);'));
    assert.ok(m, cesta + ': ' + meno + ' sa nenasiel');
    return new Function('return ' + m[1])();
  };
  const VSTUP_NECITATELNY = zoznam('VSTUP_NECITATELNY');
  const ZAVAZNOSTI = zoznam('ZAVAZNOSTI');
  const BANK_OPTIONS = zoznam('BANK_OPTIONS');
  const vstupNecitatelny = fn('vstupNecitatelny', { VSTUP_NECITATELNY });
  const kodyNalezov = fn('kodyNalezov');
  const vysledokZhrnutie = fn('vysledokZhrnutie', { ZAVAZNOSTI, BANK_OPTIONS });
  const podporaHtml = fn('podporaHtml');

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
      kodyNalezov,
    });
    const vysledok = diagnose({ ...cfg, lang: jazyk });
    const stav = ukazOpravu(cfg, vysledok);
    let vlozene = null;
    let domov = 0;
    const ponukaBtn = prvok();
    const output = {
      innerHTML: '',
      querySelector(s) {
        if (s === '#oprava-miesto' && this.innerHTML.includes('id="oprava-miesto"')) return { replaceWith: (el) => { vlozene = el; } };
        if (s === '.ponuka-btn' && this.innerHTML.includes('ponuka-btn')) return ponukaBtn;
        return null;
      },
      querySelectorAll() { return []; },
    };
    const renderResult = fn('renderResult', {
      opravaStav: stav, opravaBox: box, expectedRow: fn('expectedRow', { esc }), UI, BANK_LABELS: {}, esc, opravyHtml,
      NAHLAD_STROP, $: () => null, ponukyHtml, track, JAZYK: jazyk, output, opravaDomovVrat: () => { domov += 1; },
      vstupNecitatelny, kodyNalezov,
    });
    renderResult(vysledok);
    return { stav, vysledok, box, chk, btn, riadok, veta, okno, udalosti, html: output.innerHTML, vlozene, domov, ponukaBtn };
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
    for (const kluc of ['opravaSuhlasNajprv:', 'ponukaDruhaNadpis:', 'ponukaDruhaText:', 'opravyZvysok:', 'ponukaWarnText:', 'ponukaWarnOdkaz:']) {
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
      for (const t of [T.opravaSuhlasNajprv, T.ponukaDruhaNadpis, T.ponukaDruhaText, T.opravyZvysok(1), T.opravyZvysok(7), T.opravaText('x'), T.ponukaWarnText, T.ponukaWarnOdkaz]) {
        assert.ok(!POMLCKY.test(t), j + ': pomlcka v texte: ' + t);
      }
    }
    // N4 brany 205: slovensky slovnik ma rovnaku vetu pri warn na vsetkych troch strankach (aj v en a de), stara nikde.
    assert.equal(SLOVNIK.sk.ponukaWarnText + ' ' + SLOVNIK.sk.ponukaWarnOdkaz + '.', VETA_WARN.sk, 'slovenska veta pri warn');
    assert.ok(!HTML.includes('Ak ho chcete mať istý'), 'stara slovenska veta pri warn');
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

  // ── 205 (23. 10. 2026, ops/druhy-ucet/205/SPEC.md 7.3) ───────────────────
  const odkazKontroly = (html) => {
    const m = html.match(/class="[^"]*ponuka-btn" href="([^"]+)"/);
    return m ? new URL(m[1].replace(/&amp;/g, '&')) : null;
  };

  test(cesta + ': T2 prazdny vstup a text, ktory nie je pain.001, nedaju ponuku 149 EUR ani chyba_najdena a ponuka_zobrazena', () => {
    const vstupy = ['', '   ', 'toto nie je xml', '<a><b></a>', '<?xml version="1.0"?><Foo/>'];
    for (const xml of vstupy) {
      const k = kontrola({ xml, bank: 'generic', expectedTxCount: null });
      assert.ok(vstupNecitatelny(k.vysledok), JSON.stringify(xml) + ': ma byt necitatelny vstup');
      assert.ok(!k.html.includes('ponuka'), JSON.stringify(xml) + ': ponuka 149 EUR pri necitatelnom vstupe');
      assert.ok(!k.html.includes('149'), JSON.stringify(xml) + ': cena 149 EUR pri necitatelnom vstupe');
      assert.ok(!k.html.includes('class="vychod"'), JSON.stringify(xml) + ': reklama generatora namiesto dalsieho kroku');
      assert.ok(k.html.includes('<p class="vstup-krok">' + esc(UI.vstupKrok) + '</p>'), JSON.stringify(xml) + ': chyba veta s dalsim krokom');
      assert.equal((k.html.match(/class="vstup-krok"/g) || []).length, 1, 'veta ma byt jedna');
      const mena = k.udalosti.map(([n]) => n);
      assert.ok(!mena.includes('chyba_najdena'), JSON.stringify(xml) + ': chyba_najdena pri necitatelnom vstupe');
      assert.ok(!mena.includes('ponuka_zobrazena'), JSON.stringify(xml) + ': ponuka_zobrazena pri necitatelnom vstupe');
      assert.equal(k.stav, null, 'oprava 29 EUR pri necitatelnom vstupe');
      assert.equal(k.box.hidden, true);
    }
    // Skutocny subor s chybou ponuku a udalosti ma dalej.
    const ok = kontrola({ xml: suborBezOpravy(), bank: 'tatrabanka', expectedTxCount: null });
    assert.ok(!vstupNecitatelny(ok.vysledok));
    assert.ok(ok.udalosti.some(([n]) => n === 'chyba_najdena'));
    assert.ok(!ok.html.includes('vstup-krok'));
    for (const j of ['sk', 'en', 'de']) assert.match(SLOVNIK[j].vstupKrok, /pain\.001/, j + ': veta nemenuje subor pain.001');
  });

  test(cesta + ': T3 a T4 pri warn bez adresnych a blokujucich nalezov tichy riadok s kontrolou 149 EUR pod verdiktom', () => {
    const k = kontrola({ xml: suborWarn(), bank: 'tatrabanka', expectedTxCount: null });
    assert.equal(k.vysledok.status, 'warn');
    assert.equal(k.vysledok.problems.filter((p) => p.severity === 'high' || String(p.code).startsWith('adresa')).length, 0);
    assert.equal(k.stav, null, 'vzorka nema mat automaticku opravu');
    const verdikt = k.html.indexOf('<p class="result-summary">');
    const ticha = k.html.indexOf('<div class="ponuka-ticha">');
    const tabulka = k.html.indexOf('class="exp-table"');
    assert.ok(verdikt >= 0 && verdikt < ticha && ticha < tabulka, 'tichy riadok nie je hned pod verdiktom');
    // O8 brany 205: pri warn vlastna veta, nie „Napiste, co banka hlasi“ z druhej volby (pri warn banka zrejme nic nehlasi).
    const riadok = k.html.match(/<div class="ponuka-ticha"><p>([\s\S]*?)<\/p>/);
    assert.ok(riadok, 'tichy riadok bez odseku');
    const viditelne = riadok[1].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.equal(viditelne, VETA_WARN[jazyk], 'veta tichého riadku pri warn');
    assert.ok(!k.html.includes(esc(UI.ponukaDruhaText)), 'tichy riadok pri warn ma text druhej volby (banka hlasi)');
    assert.match(riadok[1], new RegExp('<a class="ponuka-btn" href="[^"]+"[^>]*>' + esc(UI.ponukaWarnOdkaz) + '</a>\\.$'), 'odkaz ma niest zaver vety');
    assert.ok(!k.html.includes('btn-solid ponuka-btn'), 'tichy riadok nema byt hlavne tlacidlo');
    const url = odkazKontroly(k.html);
    assert.equal(url.searchParams.get('z'), 'doctor-warn');
    assert.deepEqual(url.searchParams.get('k').split(','), kodyNalezov(k.vysledok));
    const p = k.udalosti.find(([n]) => n === 'ponuka_zobrazena');
    assert.ok(p && p[1].typ === 'warn' && p[1].poradie === 'ticha' && p[1].n === k.vysledok.problems.length);
    assert.ok(!k.html.includes('ponuka-rozdiel'), 'bez opravy 29 EUR nie je co porovnat');
    // Pass bez nalezov tichy riadok nema.
    const html = ponukyHtml({ oprava: '', typ: '', adresy: 0, blokujuce: 0, kody: [] }, UI, esc, jazyk).html;
    assert.equal(html, '');
  });

  test(cesta + ': T6 kde su obe ponuky, jedna veta rozdielu 29 EUR a 149 EUR', () => {
    const k = kontrola({ xml: suborSOpravou(3), bank: 'generic', expectedTxCount: null });
    const druha = k.html.indexOf('<div class="ponuka ponuka-druha">');
    const rozdiel = k.html.indexOf('<p class="ponuka-rozdiel">' + esc(UI.ponukaRozdiel) + '</p>');
    assert.ok(druha >= 0 && rozdiel > druha, 'veta rozdielu nie je v druhej volbe');
    assert.equal((k.html.match(/ponuka-rozdiel/g) || []).length, 1);
    const bez = kontrola({ xml: suborBezOpravy(), bank: 'tatrabanka', expectedTxCount: null });
    assert.ok(!bez.html.includes('ponuka-rozdiel'), 'bez opravy 29 EUR veta rozdielu nepatri');
    // Warn s opravou 29 EUR: tichy riadok aj s vetou rozdielu.
    const w = ponukyHtml({ oprava: 'kupit', typ: 'warn', adresy: 0, blokujuce: 0, kody: ['dbtr_iban_has_spaces'] }, UI, esc, jazyk);
    assert.equal(w.kontrola, 'ticha');
    assert.ok(w.html.startsWith('<div id="oprava-miesto"></div><div class="ponuka-ticha">') && w.html.includes('ponuka-rozdiel'));
    for (const j of ['sk', 'en', 'de']) {
      const t = SLOVNIK[j].ponukaRozdiel;
      assert.ok(t.includes('29 €') && t.includes('149 €') && t.includes('IBAN') && t.includes('Doctor'), j + ': veta rozdielu');
      assert.ok(!new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']').test(t + SLOVNIK[j].vstupKrok), j + ': pomlcka');
    }
  });

  test(cesta + ': P2 brany 205: veta o 29 EUR pri nastroji slubuje len to, co oprava naozaj spravi (medzery v IBAN, nie chyby v IBAN)', () => {
    const znacka = '<p class="toollead toollead-cena r d1">';
    assert.equal((HTML.match(/toollead-cena r d1/g) || []).length, 1, 'veta o cene pri nastroji ma byt jedna');
    const od = HTML.indexOf(znacka);
    const veta = HTML.slice(od + znacka.length, HTML.indexOf('</p>', od));
    assert.equal(veta, VETA_CENA[jazyk], 'veta pri nastroji nie je v znení brany');
    for (const zle of ['chyby v adresách, IBAN', 'errors in addresses, IBANs', 'Fehler in Adressen, IBANs']) assert.ok(!veta.includes(zle), 'stara veta: ' + zle);
    assert.ok(veta.includes(MEDZERY_IBAN[jazyk]), 'veta nehovori o medzerach v IBAN');
    // Veta rozdielu 29 EUR a 149 EUR vo vsetkych troch slovnikoch tejto stranky.
    for (const j of ['sk', 'en', 'de']) {
      const t = SLOVNIK[j].ponukaRozdiel;
      assert.ok(t.includes(MEDZERY_IBAN[j]), j + ': veta rozdielu nehovori o medzerach v IBAN: ' + t);
      assert.ok(!/(názvy krajín|country names|Ländernamen), (IBAN|IBANs) (a|and|und) /.test(t), j + ': veta rozdielu slubuje opravu IBAN: ' + t);
    }
    // Co oprava naozaj robi (oprava.mjs): IBAN len zbavi medzier.
    const fx = applyDeterministicFixes(suborSOpravou(2));
    assert.ok(fx.iban.pocet > 0, 'vzorka ma mat IBAN s medzerami, ktore oprava odstrani');
  });

  test(cesta + ': T5 odkaz na objednavku nesie k= len s kodmi nalezov, nikdy hodnoty', () => {
    const k = kontrola({ xml: suborBezOpravy(), bank: 'tatrabanka', expectedTxCount: null });
    const url = odkazKontroly(k.html);
    assert.equal(url.hash, '#objednat');
    assert.equal(url.searchParams.get('locale'), jazyk);
    const kody = url.searchParams.get('k').split(',');
    assert.deepEqual(kody, [...new Set(k.vysledok.problems.map((p) => p.code))]);
    for (const kod of kody) assert.ok(DOCTOR_KODY.includes(kod), 'neznamy kod ' + kod);
    for (const zle of ['SUBASKBX', 'SK2811000000191000000005', 'Stastny', '450']) assert.ok(!url.search.includes(zle), 'hodnota v odkaze: ' + zle);
    // Vkladanie: kod mimo tvaru sa do odkazu nedostane, atribut ostane cely.
    const h = ponukyHtml({ oprava: '', typ: 'blokujuce', adresy: 0, blokujuce: 1, kody: ['ok_kod', '"><img src=x onerror=alert(1)>', 'SK28 1100'] }, UI, esc, jazyk).html;
    assert.ok(!h.includes('<img') && !h.includes('SK28'), 'vlozeny kod presiel do odkazu');
    assert.equal(odkazKontroly(h).searchParams.get('k'), 'ok_kod');
    // Odkaz po zaplateni opravy tiez nesie kody.
    const z = kontrola({ xml: suborSOpravou(2), bank: 'generic', expectedTxCount: null }, { zaplatene: true });
    const m = z.box.innerHTML.match(/href="([^"]+z=doctor-oprava[^"]*)"/);
    assert.ok(m, 'v ramceku po zaplateni chyba odkaz na kontrolu');
    const u = new URL(m[1].replace(/&amp;/g, '&'));
    assert.deepEqual(u.searchParams.get('k').split(','), kodyNalezov(z.vysledok));
  });

  test(cesta + ': T10 klik na ponuku 149 EUR pod verdiktom sa pocita raz (len atribut)', () => {
    const k = kontrola({ xml: suborBezOpravy(), bank: 'tatrabanka', expectedTxCount: null });
    assert.ok(/class="btn btn-solid ponuka-btn" href="[^"]+" data-umami-event="kontrola_click"/.test(k.html), 'atribut kontrola_click na odkaze chyba');
    k.ponukaBtn.spusti('click');
    assert.equal(k.udalosti.filter(([n]) => n === 'kontrola_click').length, 0, 'klik sa pocita aj cez track, teda dvakrat');
    assert.ok(!zdroj('renderResult').includes("track('kontrola_click'"));
  });

  test(cesta + ': T8 chybove stavy opravy 29 EUR maju mailto na podporu, cislo platby bez vkladania', () => {
    for (const kluc of ['opravaNezaplatene', 'opravaInaSuma', 'opravaVyprsane']) {
      const h = podporaHtml(esc(UI[kluc]), 'cs_live_a1B2c3', UI, esc);
      const m = h.match(/<a href="mailto:([^"?]+)\?subject=([^"]+)"/);
      assert.ok(m, kluc + ': chyba odkaz mailto');
      assert.equal(m[1], UI.podporaAdresa);
      assert.equal(decodeURIComponent(m[2].replace(/&amp;/g, '&')), UI.opravaPredmet + ' cs_live_a1B2c3');
      assert.equal((h.match(/<a /g) || []).length, 1, kluc + ': adresa ma byt odkazom raz');
      assert.ok(UI[kluc].includes(UI.podporaAdresa), kluc + ': text nemenuje adresu podpory');
      assert.ok(zdroj('opravaPoNavrate').includes('podporaHtml(esc(UI.' + kluc + '), sid, UI, esc)'), kluc + ': opravaPoNavrate nepouziva podporaHtml s escapovanym textom');
    }
    const zle = podporaHtml(esc(UI.opravaNezaplatene), '"><img src=x onerror=alert(1)>&x=<b>', UI, esc);
    assert.ok(!zle.includes('<img') && !zle.includes('<b>') && !zle.includes('onerror=alert(1)>'), 'session_id sa dostal do HTML');
    const predmet = decodeURIComponent(zle.match(/\?subject=([^"]+)"/)[1].replace(/&amp;/g, '&'));
    assert.equal(predmet, UI.opravaPredmet + ' imgsrcxonerroralert1xb', 'v predmete su ine znaky nez cislo platby');
    const bezAdresy = podporaHtml(esc('Text bez adresy <b>'), '', UI, esc);
    assert.ok(bezAdresy.startsWith('Text bez adresy &lt;b&gt; <a href="mailto:'));
  });

  test(cesta + ': blok vysledku e-mailom, staticke miesto medzi #oprava a boxom 149 EUR, CSP a vety o odosielani', () => {
    const oprava = HTML.indexOf('<div class="oprava" id="oprava"');
    const miesto = HTML.indexOf('<div data-vysledok-miesto hidden></div>');
    const box = HTML.indexOf('<div class="pripomienka">');
    assert.ok(oprava > 0 && oprava < miesto && miesto < box, 'miesto bloku nie je medzi #oprava a boxom 149 EUR');
    assert.equal((HTML.match(/<div data-vysledok-miesto/g) || []).length, 1, 'miesto ma byt jedno');
    assert.ok(HTML.includes("const vysledokMiesto = document.querySelector('[data-vysledok-miesto]');"));
    assert.ok(HTML.includes("const VYSLEDOK_MODUL = '/vysledok/vysledok-email.js?v=1';"));
    const csp = HTML.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    assert.ok(/connect-src [^;]*https:\/\/feed-monitor\.arling\.workers\.dev/.test(csp), 'CSP connect-src nepovoluje feed-monitor');
    // runDiagnose: blok po renderResult; reset, novy vstup a zly JSON ho skryju.
    const beh = zdroj('runDiagnose');
    assert.ok(beh.indexOf('renderResult(result);') < beh.indexOf('vysledokUkaz(cfg, result);'));
    assert.ok(beh.indexOf('vysledokSkry();') > 0 && beh.indexOf('vysledokSkry();') < beh.indexOf('renderResult(result);'));
    assert.ok(/resetBtn\.addEventListener\('click', \(\) => \{[\s\S]*?vysledokSkry\(\);[\s\S]*?\}\);/.test(HTML), 'reset blok neskryje');
    assert.ok(HTML.includes("['f-xml', 'input', 'f-bank', 'f-expectedtxcount'].forEach((id) => {") && HTML.includes("el.addEventListener('input', vysledokSkry);"));
    // Pred vysledkom veta o 29 EUR pri nastroji (T1 d).
    const cena = HTML.indexOf('<p class="toollead toollead-cena r d1">');
    assert.ok(cena > HTML.indexOf('id="playground"') && cena < HTML.indexOf('id="f-xml"'), 'veta o cene nie je pri nastroji');
    assert.ok(HTML.slice(cena, HTML.indexOf('</p>', cena)).includes('29 €'));
    // Vety o odosielani: FAQ v HTML aj JSON-LD rovnako, s vynimkou pre e-mail; ziadne "nic sa neodosiela" bez vynimky.
    const ld = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = ld.find((x) => x['@type'] === 'FAQPage');
    const otazka = faq.mainEntity[faq.mainEntity.length - 1];
    const vynimka = { sk: 'necháte poslať výsledok e-mailom', en: 'result e-mailed to you', de: 'Ergebnis freiwillig per E-Mail' }[jazyk];
    assert.ok(otazka.acceptedAnswer.text.includes(vynimka), 'JSON-LD FAQ nema vynimku pre e-mail');
    assert.ok(!/nástroj nemá backend|the tool has no backend|das Tool hat kein Backend/.test(HTML), 'tvrdenie bez vynimky ostalo');
    const html = HTML.match(new RegExp('<summary>' + otazka.name.replace(/[?]/g, '\\?') + '</summary>\\s*<p>([\\s\\S]*?)</p>'));
    assert.ok(html, 'FAQ v HTML k otazke ' + otazka.name + ' sa nenaslo');
    assert.equal(html[1].replace(/<[^>]+>/g, ''), otazka.acceptedAnswer.text, 'FAQ v HTML a v JSON-LD sa lisia');
    assert.ok(!/nič sa neodosiela|nothing is uploaded|nichts wird hochgeladen|strana, 0 requestov'|side, 0 requests'|clientseitig, 0 Requests'/.test(HTML), 'veta o odosielani bez vynimky ostala');
  });

  test(cesta + ': zhrnutie pre e-mail z vzoroveho suboru nastroja neobsahuje IBAN, meno ani sumu', () => {
    for (const bank of ['csob', 'generic', 'tatrabanka']) {
      const r = diagnose({ xml: SAMPLE_XML, bank, expectedTxCount: null, lang: jazyk });
      const z = vysledokZhrnutie(r);
      const json = JSON.stringify(z);
      for (const zle of ['SK2811000000191000000005', 'SK0502000000272000000018', 'Jozef', 'Šťastný', 'Stastny', '450', 'Firma', 'FA2026', 'VS123', 'Ivansk', 'Bratislava', 'TATRSKBX', '2026-09-04', 'Faktúra']) {
        assert.ok(!json.includes(zle), bank + ': zhrnutie obsahuje ' + zle + ': ' + json);
      }
      for (const p of r.problems) for (const pole of [p.message, p.value, p.fix, p.path]) if (pole && pole.length > 3) assert.ok(!json.includes(pole), 'pole nalezu v zhrnuti: ' + pole);
      assert.ok(!json.includes(r.summary.slice(0, 40)));
      assert.deepEqual(Object.keys(z), ['stav', 'banka', 'transakcie', 'adresy_zle', 'adresy_spolu', 'nalezy']);
      assert.equal(z.stav, r.status);
      assert.equal(z.banka, bank);
      assert.equal(z.transakcie, r.stats.txCount);
      assert.equal(z.adresy_zle, r.stats.adriesZlych);
      assert.equal(z.adresy_spolu, r.stats.adriesSpolu);
      for (const n of z.nalezy) {
        assert.deepEqual(Object.keys(n), ['kod', 'zavaznost', 'pocet']);
        assert.ok(DOCTOR_KODY.includes(n.kod), 'neznamy kod ' + n.kod);
        assert.ok(['high', 'medium', 'low'].includes(n.zavaznost));
        assert.equal(n.pocet, r.problems.filter((p) => p.code === n.kod).length);
      }
      assert.equal(z.nalezy.reduce((s, n) => s + n.pocet, 0), r.problems.length);
    }
    // Zoskupenie podla kodu: dve diakritiky pri CSOB su jeden nalez s poctom 2.
    const csob = vysledokZhrnutie(diagnose({ xml: SAMPLE_XML, bank: 'csob', lang: jazyk }));
    assert.deepEqual(csob.nalezy.find((n) => n.kod === 'diacritics_in_field'), { kod: 'diacritics_in_field', zavaznost: 'high', pocet: 2 });
    // Adresy zo stats, nie z poctu nalezov (adresny nalez sa hlasi raz za druh).
    const r4 = diagnose({ xml: suborSOpravou(4), bank: 'generic', lang: jazyk });
    const z4 = vysledokZhrnutie(r4);
    assert.equal(z4.adresy_zle, r4.stats.adriesZlych);
    assert.ok(z4.adresy_zle >= 4 && z4.adresy_zle > z4.nalezy.filter((n) => n.kod.startsWith('adresa')).length, 'adresy maju ist zo stats');
    assert.equal(z4.adresy_spolu, r4.stats.adriesSpolu);
    assert.equal(z4.nalezy.find((n) => n.kod === 'adresa_nestrukturovana').pocet, 1);
    // Zavaznost najvyssia v skupine, nezname tvary zahodene, strop 70 a 10000.
    const umele = { status: 'warn', bank: 'x', stats: { txCount: 5e6, adriesZlych: -1, adriesSpolu: 1.5 }, problems: [
      { code: 'a_kod', severity: 'low' }, { code: 'a_kod', severity: 'high' }, { code: 'a_kod', severity: 'medium' },
      { code: '<b>', severity: 'high' }, { code: 'b_kod', severity: '__proto__' }, { code: 'c_kod', severity: 'constructor' },
      ...Array.from({ length: 80 }, (_, i) => ({ code: 'k' + i, severity: 'low' })),
    ] };
    const zu = vysledokZhrnutie(umele);
    assert.deepEqual(zu.nalezy[0], { kod: 'a_kod', zavaznost: 'high', pocet: 3 });
    assert.ok(!zu.nalezy.some((n) => n.kod === '<b>' || n.kod === 'b_kod' || n.kod === 'c_kod'));
    assert.equal(zu.nalezy.length, 70);
    assert.equal(zu.banka, 'generic');
    assert.equal(zu.transakcie, 100000);
    assert.equal(zu.adresy_zle, 0);
    assert.equal(zu.adresy_spolu, 0);
    assert.equal(vysledokZhrnutie({ status: 'nieco', problems: [] }), null);
    assert.equal(vysledokZhrnutie(null), null);
  });

  // Blok s odlozenym importom modulu: ukaz, skry a poradie (AGENTS.md bod 12a).
  function blok() {
    const miesto = prvok();
    const stav = { poradie: 0, modul: null };
    const volania = [];
    const importy = [];
    let cakajuce = null;
    // ukaz modulu vracia true, ked sa blok ukazal, false pri odmietnutom zhrnuti (vysledok-email.js).
    const modul = {
      odpoved: true,
      ukaz: (el, data) => { volania.push(['ukaz', el, data]); return modul.odpoved; },
      skry: (el) => volania.push(['skry', el]),
    };
    const importuj = (u) => { importy.push(u); return new Promise((ok, zle) => { cakajuce = { ok, zle }; }); };
    const nacitajVysledok = fn('nacitajVysledok', { vysledokStav: stav, importuj, VYSLEDOK_MODUL: '/vysledok/vysledok-email.js?v=1' });
    const vysledokSkry = fn('vysledokSkry', { vysledokStav: stav, vysledokMiesto: miesto });
    const vysledokUkaz = fn('vysledokUkaz', { vysledokSkry, vysledokMiesto: miesto, vstupNecitatelny, SAMPLE_XML, vysledokZhrnutie, vysledokStav: stav, nacitajVysledok, JAZYK: jazyk });
    const pockaj = () => new Promise((ok) => setTimeout(ok, 0));
    return { miesto, stav, volania, importy, modul, vysledokSkry, vysledokUkaz, nacitajVysledok, pockaj, nacitaj: () => cakajuce.ok(modul), zlyhaj: () => cakajuce.zle(new Error('404')) };
  }
  const beh = (xml, bank = 'tatrabanka') => { const cfg = { xml, bank, expectedTxCount: null }; return [cfg, diagnose({ ...cfg, lang: jazyk })]; };

  test(cesta + ': blok sa ukaze pod skutocnym vysledkom so zhrnutim, nie pod ukazkou ani pri necitatelnom vstupe', async () => {
    const b = blok();
    const [cfg, r] = beh(suborBezOpravy());
    assert.equal(b.vysledokUkaz(cfg, r), true);
    await b.pockaj(); b.nacitaj(); await b.pockaj();
    assert.deepEqual(b.importy, ['/vysledok/vysledok-email.js?v=1']);
    const u = b.volania.filter(([n]) => n === 'ukaz');
    assert.equal(u.length, 1);
    assert.equal(u[0][1], b.miesto);
    assert.deepEqual(u[0][2], { nastroj: 'sepa', jazyk, vysledok: vysledokZhrnutie(r) });
    assert.equal(b.miesto.hidden, false);
    for (const [xml, bank] of [['', 'generic'], ['toto nie je xml', 'generic'], [SAMPLE_XML, 'csob'], ['  ' + SAMPLE_XML + '\n', 'generic']]) {
      const c = blok();
      const [cfg2, r2] = beh(xml, bank);
      assert.equal(c.vysledokUkaz(cfg2, r2), false, JSON.stringify(xml.slice(0, 20)) + ': blok sa ma neukazat');
      await c.pockaj();
      assert.equal(c.importy.length, 0, 'modul sa nacital zbytocne');
      assert.equal(c.miesto.hidden, true);
    }
  });

  test(cesta + ': O1 V2 D9: ked modul zhrnutie odmietne (ukaz vrati false), miesto ostane skryte, ziadny prazdny ramik', async () => {
    const b = blok();
    b.modul.odpoved = false;
    const [cfg, r] = beh(suborBezOpravy());
    assert.equal(b.vysledokUkaz(cfg, r), true);
    await b.pockaj(); b.nacitaj(); await b.pockaj();
    assert.equal(b.volania.filter(([n]) => n === 'ukaz').length, 1);
    assert.equal(b.miesto.hidden, true);
  });

  test(cesta + ': blok, novy vstup pred nacitanim modulu: stara odpoved nic neukaze', async () => {
    const b = blok();
    const [cfg, r] = beh(suborBezOpravy());
    b.vysledokUkaz(cfg, r);
    b.vysledokSkry(); // pouzivatel zmenil vstup skor, nez modul prisiel
    await b.pockaj(); b.nacitaj(); await b.pockaj();
    assert.equal(b.volania.filter(([n]) => n === 'ukaz').length, 0, 'blok sa ukazal pre stary vysledok');
    assert.equal(b.miesto.hidden, true);
  });

  test(cesta + ': blok, dva vysledky pred nacitanim modulu: ukaze sa len novsi', async () => {
    const b = blok();
    const [cfg1, r1] = beh(suborBezOpravy());
    const [cfg2, r2] = beh(suborWarn());
    b.vysledokUkaz(cfg1, r1);
    b.vysledokUkaz(cfg2, r2);
    await b.pockaj(); b.nacitaj(); await b.pockaj();
    const u = b.volania.filter(([n]) => n === 'ukaz');
    assert.equal(u.length, 1);
    assert.deepEqual(u[0][2].vysledok, vysledokZhrnutie(r2));
    assert.equal(b.importy.length, 1, 'modul sa ma nacitat raz');
  });

  test(cesta + ': blok, modul nacitany: novy vysledok najprv skry, potom ukaz; reset skryje', async () => {
    const b = blok();
    const [cfg1, r1] = beh(suborBezOpravy());
    b.vysledokUkaz(cfg1, r1);
    await b.pockaj(); b.nacitaj(); await b.pockaj();
    const [cfg2, r2] = beh(suborWarn());
    b.vysledokUkaz(cfg2, r2);
    await b.pockaj();
    assert.deepEqual(b.volania.map(([n]) => n), ['ukaz', 'skry', 'ukaz']);
    assert.deepEqual(b.volania[2][2].vysledok, vysledokZhrnutie(r2));
    b.vysledokSkry();
    assert.equal(b.miesto.hidden, true);
    await b.pockaj();
    assert.deepEqual(b.volania.map(([n]) => n), ['ukaz', 'skry', 'ukaz', 'skry']);
    // Necitatelny vstup po vysledku: blok zmizne a nic nove sa neukaze.
    const [cfg3, r3] = beh('');
    b.vysledokUkaz(cfg3, r3);
    await b.pockaj();
    assert.equal(b.miesto.hidden, true);
    assert.equal(b.volania.filter(([n]) => n === 'ukaz').length, 2);
  });

  test(cesta + ': blok, chyba importu sa ticho ignoruje a dalsi vysledok skusi modul znova', async () => {
    const b = blok();
    const [cfg, r] = beh(suborBezOpravy());
    b.vysledokUkaz(cfg, r);
    await b.pockaj(); b.zlyhaj(); await b.pockaj();
    assert.equal(b.miesto.hidden, true);
    assert.equal(b.stav.modul, null, 'zlyhany import ostal v pamati');
    b.vysledokUkaz(cfg, r);
    await b.pockaj(); b.nacitaj(); await b.pockaj();
    assert.equal(b.importy.length, 2);
    assert.equal(b.volania.filter(([n]) => n === 'ukaz').length, 1);
    assert.equal(b.miesto.hidden, false);
  });

  // P5 brany 205 (bod 9 kontroly vzhladu, R67): modul bloku sa zacne nacitavat pri prvej praci so vstupom, nie az po
  // renderResult, aby box 149 EUR pod blokom pri prvom vysledku neposkocil o vysku bloku. Vzor e-faktury.
  test(cesta + ': P5 brany 205: prva praca so vstupom nacita modul bloku raz, ukazka nie', async () => {
    const UDALOSTI_VSTUPU = zoznam('UDALOSTI_VSTUPU');
    assert.deepEqual(UDALOSTI_VSTUPU, ['pointerdown', 'focusin', 'keydown', 'input', 'paste', 'dragenter']);
    const nacitajPriVstupe = fn('nacitajPriVstupe', { UDALOSTI_VSTUPU });
    // Zapojenie na stranke: na vstup (#input, #f-xml, riadok vyberu suboru zo subor.js), mimo ukazky, s nacitajVysledok.
    const volanie = HTML.match(/\n  nacitajPriVstupe\(document, '([^']+)', '([^']+)', nacitajVysledok\);\n/);
    assert.ok(volanie, 'stranka nezapoji predcasne nacitanie modulu bloku');
    const [, CIEL, VYNECHAJ] = volanie;
    assert.deepEqual(CIEL.split(',').map((s) => s.trim()), ['#input', '#f-xml', '.subor-riadok']);
    assert.equal(VYNECHAJ, '#reset-btn');
    assert.ok(HTML.indexOf(volanie[0]) > HTML.indexOf('const vysledokStav = '), 'zapojenie skor nez stav bloku');
    assert.ok(!/resetBtn\.addEventListener\('click', \(\) => \{[^}]*nacitajVysledok/.test(HTML), 'ukazka nacitava modul');
    // Falosny document so zachytavajucimi posluchacmi; ciel udalosti pozna len selektory svojej cesty (closest).
    const pripravDoc = () => {
      const posluchaci = {};
      const doc = {
        addEventListener: (u, f, c) => { assert.equal(c, true, 'zachytavanie (iny posluchac ho nezastavi)'); (posluchaci[u] ||= []).push(f); },
        removeEventListener: (u, f) => { posluchaci[u] = (posluchaci[u] || []).filter((x) => x !== f); },
      };
      const vyvolaj = (type, cesta2) => {
        const target = cesta2 ? { closest: (sel) => (sel.split(',').some((s) => cesta2.includes(s.trim())) ? {} : null) } : null;
        for (const f of [...(posluchaci[type] || [])]) f({ type, target });
      };
      return { doc, posluchaci, vyvolaj };
    };
    const b = blok();
    const { doc, posluchaci, vyvolaj } = pripravDoc();
    nacitajPriVstupe(doc, CIEL, VYNECHAJ, b.nacitajVysledok);
    assert.deepEqual(Object.keys(posluchaci).sort(), [...UDALOSTI_VSTUPU].sort());
    vyvolaj('pointerdown', ['#reset-btn', '.pane-actions']);
    vyvolaj('focusin', ['#reset-btn']);
    vyvolaj('pointerdown', ['#reset-btn', '#f-xml']); // vynimka plati, aj keby bolo tlacidlo ukazky vo vstupe
    vyvolaj('keydown', ['#run-btn']);
    vyvolaj('input', ['#f-bank']);
    vyvolaj('pointerdown', ['#cennik']);
    vyvolaj('focusin', null);
    await b.pockaj();
    assert.equal(b.importy.length, 0, 'ukazka ani ina cast stranky modul nenacita');
    vyvolaj('focusin', ['#f-xml', '#form-pane']);
    await b.pockaj();
    assert.deepEqual(b.importy, ['/vysledok/vysledok-email.js?v=1'], 'fokus do pola XML nacita modul');
    vyvolaj('input', ['#f-xml']); vyvolaj('paste', ['#f-xml']); vyvolaj('dragenter', null);
    await b.pockaj();
    assert.equal(b.importy.length, 1, 'najviac raz');
    assert.ok(UDALOSTI_VSTUPU.every((u) => (posluchaci[u] || []).length === 0), 'po nacitani sa posluchaci odpoja');
    // Vysledok potom pouzije uz nacitany modul: ziadny druhy import, blok sa ukaze.
    b.nacitaj(); await b.pockaj();
    const [cfg, r] = beh(suborBezOpravy());
    assert.equal(b.vysledokUkaz(cfg, r), true);
    await b.pockaj();
    assert.equal(b.importy.length, 1, 'vysledok nacital modul znova');
    assert.equal(b.volania.filter(([n]) => n === 'ukaz').length, 1);
    assert.equal(b.miesto.hidden, false);
    // Nacitanie sa vola raz, aj keby ho nacitajVysledok nedrzal v pamati.
    const d1 = pripravDoc();
    let volania = 0;
    nacitajPriVstupe(d1.doc, CIEL, VYNECHAJ, () => { volania += 1; return null; });
    for (const [typ, c2] of [['focusin', ['#f-xml']], ['input', ['#f-xml']], ['keydown', ['#input']], ['dragenter', null]]) d1.vyvolaj(typ, c2);
    assert.equal(volania, 1, 'nacitanie pri kazdej udalosti, nie raz');
    // Kazdy sposob vstupu sam osebe: tuk, klaves, vlozenie, pisanie, vyber suboru, pretiahnutie suboru nad stranku.
    for (const [typ, c2] of [['pointerdown', ['#f-xml']], ['keydown', ['#input', '#json-pane']], ['paste', ['#f-xml']], ['input', ['#input']], ['pointerdown', ['label', '.subor-riadok']], ['focusin', ['#f-subor', '.subor-riadok']], ['dragenter', null]]) {
      const c = blok();
      const d = pripravDoc();
      nacitajPriVstupe(d.doc, CIEL, VYNECHAJ, c.nacitajVysledok);
      d.vyvolaj(typ, c2);
      await c.pockaj();
      assert.equal(c.importy.length, 1, typ + ' ' + JSON.stringify(c2));
    }
    // Chyba nacitania nezhodi stranku; zlyhany import sa zabudne a dalsi vysledok skusi modul znova.
    const z = blok();
    const d2 = pripravDoc();
    nacitajPriVstupe(d2.doc, CIEL, VYNECHAJ, z.nacitajVysledok);
    d2.vyvolaj('focusin', ['#f-xml']);
    await z.pockaj(); z.zlyhaj(); await z.pockaj();
    assert.equal(z.stav.modul, null, 'zlyhany import ostal v pamati');
    const d3 = pripravDoc();
    nacitajPriVstupe(d3.doc, CIEL, VYNECHAJ, () => { throw new Error('x'); });
    assert.doesNotThrow(() => d3.vyvolaj('focusin', ['#f-xml']));
    assert.equal(typeof nacitajPriVstupe(null, CIEL, VYNECHAJ, () => null), 'function');
  });
}
