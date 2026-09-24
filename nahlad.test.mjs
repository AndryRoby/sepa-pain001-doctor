// Bezplatny nahlad opravy pain.001 pred platbou 29 EUR (F-N4, 24. 9. 2026,
// ops/strategia/2026-09-24/napady/top-10.md, bod 1).
//
// Co strazi: pred platbou smie clovek vidiet najviac 3 dvojice "pred a po",
// vypocitane tym istym kodom (oprava.mjs), ktory po platbe vyrobi subor.
// Test zcervenie, ak nahlad prezradi cely opraveny subor: viac nez 3 zmeny,
// okolie zmien (mena, sumy, ine ucty) alebo fx.xml kdekolvek pred platbou.
// Bezi nad oprava.mjs aj nad vsetkymi tromi strankami (sk, de, en).
// Ziadny prehliadac, ziadna siet, ziadny Stripe.
// usage: node --test products/sepa-pain001-doctor/nahlad.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { applyDeterministicFixes, nahladOpravy, NAHLAD_STROP } from './oprava.mjs';
import { diagnose } from './doctor-pain001.js';

const TU = dirname(fileURLToPath(import.meta.url));
const STRANKY = ['index.html', 'de/index.html', 'en/index.html'];

// Subor s n platbami a so vsetkymi styrmi druhmi oprav: volna adresa pri
// kazdom prijemcovi, nazov krajiny pri platitelovi, IBAN s medzerami pri
// platitelovi aj prijemcoch, zly pocet a sucet v hlavicke.
function subor(n) {
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
          <Nm>Dodavatel Cislo${i} s.r.o.</Nm>
          <PstlAdr>
            <AdrLine>Hlavna ${i}</AdrLine>
            <AdrLine>811 0${i % 10} Bratislava</AdrLine>
          </PstlAdr>
        </Cdtr>
        <CdtrAcct><Id><IBAN>SK05 0200 0000 2720 0000 00${String(i).padStart(2, '0')}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>Faktura TAJNE${i}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>NAHLAD-TEST</MsgId>
      <CreDtTm>2026-09-24T09:00:00</CreDtTm>
      <NbOfTxs>${n + 1}</NbOfTxs>
      <CtrlSum>${sucet + 1}.00</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>NAHLAD-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt>2026-09-25</ReqdExctnDt>
      <Dbtr>
        <Nm>Platitel Skryty a.s.</Nm>
        <PstlAdr><StrtNm>Ivanska cesta</StrtNm><BldgNb>32E</BldgNb><PstCd>821 04</PstCd><TwnNm>Bratislava</TwnNm><Ctry>Slovensko</Ctry></PstlAdr>
      </Dbtr>
      <DbtrAcct><Id><IBAN>SK28 1100 0000 1910 0000 0005</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>TATRSKBX</BIC></FinInstnId></DbtrAgt>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

const ZMENITELNE = new Set(['AdrLine', 'StrtNm', 'BldgNb', 'PstCd', 'TwnNm', 'Ctry', 'IBAN', 'NbOfTxs', 'CtrlSum']);

function textNahladu(n) {
  return n.dvojice.map((d) => d.pred + '\n' + d.po).join('\n');
}

test('nahlad ukaze najviac 3 zmeny, aj ked ich subor ma vela a volajuci chce viac', () => {
  const xml = subor(8);
  const fx = applyDeterministicFixes(xml);
  const spoluOprav = fx.adresy.pocet + fx.krajiny.pocet + fx.iban.pocet + fx.sucty.zmeny.length;
  assert.ok(spoluOprav > 10, 'vzorka ma mat vela oprav, ma ' + spoluOprav);
  assert.equal(NAHLAD_STROP, 3);
  const n = nahladOpravy(fx);
  assert.equal(n.dvojice.length, 3);
  assert.equal(n.spolu, spoluOprav, 'spolu = vsetky zmeny, ktore oprava po platbe spravi');
  assert.equal(nahladOpravy(fx, 50).dvojice.length, 3, 'strop plati aj pri vacsom cisle');
  assert.equal(nahladOpravy(fx, Infinity).dvojice.length, 3);
  assert.equal(nahladOpravy(fx, 0).dvojice.length, 0);
  assert.equal(nahladOpravy(fx, 'x').dvojice.length, 0);
  assert.deepEqual(nahladOpravy(null), { dvojice: [], spolu: 0 });
});

test('nahlad ukaze rozne druhy oprav, nie trikrat to iste', () => {
  const n = nahladOpravy(applyDeterministicFixes(subor(8)));
  assert.deepEqual(n.dvojice.map((d) => d.druh), ['adresa', 'krajina', 'iban']);
  assert.equal(n.dvojice[0].kde, 'Cdtr');
  assert.equal(n.dvojice[1].kde, 'Dbtr');
  assert.equal(n.dvojice[2].kde, 'DbtrAcct');
});

test('nahlad pochadza z toho isteho kodu: kazde "po" je v opravenom subore, kazde "pred" v povodnom', () => {
  const xml = subor(4);
  const fx = applyDeterministicFixes(xml);
  const n = nahladOpravy(fx);
  assert.ok(n.dvojice.length > 0);
  for (const d of n.dvojice) {
    for (const r of d.po.split('\n')) assert.ok(fx.xml.includes(r), 'po nie je v opravenom subore: ' + r);
    for (const r of d.pred.split('\n')) assert.ok(xml.includes(r), 'pred nie je v povodnom subore: ' + r);
    assert.notEqual(d.pred, d.po, 'dvojica bez zmeny');
  }
  // Konkretne: prva adresa je rozdelena presne tak, ako ju rozdeli platena oprava.
  assert.equal(n.dvojice[0].pred, '<AdrLine>Hlavna 1</AdrLine>\n<AdrLine>811 01 Bratislava</AdrLine>');
  assert.equal(n.dvojice[0].po, '<StrtNm>Hlavna</StrtNm>\n<BldgNb>1</BldgNb>\n<PstCd>811 01</PstCd>\n<TwnNm>Bratislava</TwnNm>\n<Ctry>SK</Ctry>');
});

test('nahlad neprezradi cely opraveny subor ani okolie zmien', () => {
  const xml = subor(8);
  const fx = applyDeterministicFixes(xml);
  const n = nahladOpravy(fx);
  const text = textNahladu(n);
  assert.ok(!text.includes(fx.xml), 'v nahlade je cely opraveny subor');
  assert.ok(text.length < fx.xml.length / 5, 'nahlad je prilis velky: ' + text.length + ' z ' + fx.xml.length + ' znakov');
  for (const m of text.matchAll(/<\/?([A-Za-z]+)[^>]*>/g)) {
    assert.ok(ZMENITELNE.has(m[1]), 'nahlad obsahuje prvok, ktory oprava nemeni: ' + m[1]);
  }
  for (let i = 1; i <= 8; i++) {
    assert.ok(!text.includes('Cislo' + i), 'meno prijemcu ' + i + ' je v nahlade');
    assert.ok(!text.includes('TAJNE' + i), 'sprava pre prijemcu ' + i + ' je v nahlade');
  }
  assert.ok(!text.includes('Platitel Skryty'), 'meno platitela je v nahlade');
  // Opraveny subor ma n.spolu zmien, nahlad ukaze len 3 z nich.
  assert.ok(n.spolu > n.dvojice.length, 'nahlad ukazal vsetky zmeny');
  const opraveneAdresy = (fx.xml.match(/<StrtNm>Hlavna \d*<\/StrtNm>|<StrtNm>Hlavna<\/StrtNm>/g) || []).length;
  const adresyVNahlade = (text.match(/<StrtNm>/g) || []).length;
  assert.ok(adresyVNahlade < opraveneAdresy, 'nahlad ukazal vsetky opravene adresy');
});

for (const stranka of STRANKY) {
  const HTML = readFileSync(resolve(TU, stranka), 'utf8');

  function zdrojFunkcie(meno) {
    const od = HTML.indexOf('function ' + meno + '(');
    assert.ok(od > 0, stranka + ': funkcia ' + meno + ' sa nenasla');
    let hlbka = 0;
    for (let j = HTML.indexOf('{', od); j < HTML.length; j++) {
      if (HTML[j] === '{') hlbka += 1;
      else if (HTML[j] === '}') { hlbka -= 1; if (hlbka === 0) return HTML.slice(od, j + 1); }
    }
    throw new Error(stranka + ': telo funkcie ' + meno + ' sa neskoncilo');
  }

  test(stranka + ': pred platbou sa opraveny subor (fx.xml) nikam nevypisuje, len nahladOpravy', () => {
    assert.ok(/import \{ applyDeterministicFixes, nahladOpravy, NAHLAD_STROP \} from '\.{1,2}\/oprava\.mjs';/.test(HTML), 'stranka neimportuje nahladOpravy z oprava.mjs');
    const telo = zdrojFunkcie('ukazOpravu');
    const hranica = telo.indexOf('const opravaLink = opravaLinkNow();');
    assert.ok(hranica > 0, 'v ukazOpravu chyba vetva pred platbou');
    const predPlatbou = telo.slice(hranica);
    assert.ok(!predPlatbou.includes('fx.xml'), 'vetva pred platbou pouziva cely opraveny subor');
    assert.ok(!predPlatbou.includes('stiahniOpraveny'), 'vetva pred platbou ponuka stiahnutie');
    assert.ok(predPlatbou.includes('nahladOpravy(fx, NAHLAD_STROP)'), 'nahlad nepocita nahladOpravy so stropom');
    assert.ok(predPlatbou.includes('nahladHtml(nahlad, UI, vzor, esc)'), 'nahlad sa nevykresluje');
    // fx.xml smie byt na stranke len pri stiahnuti po platbe.
    assert.equal((HTML.match(/fx\.xml/g) || []).length, 1, 'fx.xml sa pouziva aj mimo stiahnutia po platbe');
    assert.ok(HTML.includes('stiahniOpraveny(fx.xml)'));
  });

  test(stranka + ': vykresleny nahlad ma najviac 3 dvojice a nic z okolia', () => {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const nahladHtml = new Function(zdrojFunkcie('nahladHtml') + '\nreturn nahladHtml;')();
    const T = {
      nahladDruh: { adresa: 'Adresa', krajina: 'Krajina', iban: 'IBAN', sucet: 'Sucty' },
      nahladPred: 'Pred', nahladPo: 'Po',
      nahladNadpis: (n, spolu) => 'Nahlad ' + n + ' z ' + spolu,
      nahladZvysok: (n) => 'Zvysok ' + n,
      nahladVzor: 'Vzor',
    };
    const xml = subor(8);
    const fx = applyDeterministicFixes(xml);
    const n = nahladOpravy(fx);
    const html = nahladHtml(n, T, false, esc);
    assert.equal((html.match(/<li class="nahlad-par">/g) || []).length, 3);
    assert.ok(html.includes('Nahlad 3 z ' + n.spolu));
    assert.ok(html.includes('Zvysok ' + (n.spolu - 3)));
    assert.ok(!html.includes(esc(fx.xml)) && !html.includes(fx.xml), 'v nahlade je cely opraveny subor');
    assert.ok(!html.includes('Cislo') && !html.includes('TAJNE') && !html.includes('InstdAmt'), 'v nahlade je okolie zmien');
    // Aj keby niekto poslal viac dvojic, stranka ukaze najviac 3.
    const vela = { dvojice: Array.from({ length: 10 }, (_, i) => ({ druh: 'iban', kde: 'CdtrAcct', pred: '<IBAN>A ' + i + '</IBAN>', po: '<IBAN>A' + i + '</IBAN>' })), spolu: 10 };
    assert.equal((nahladHtml(vela, T, false, esc).match(/<li class="nahlad-par">/g) || []).length, 3);
    assert.equal(nahladHtml({ dvojice: [], spolu: 0 }, T, false, esc), '');
    // Vzorovy subor ma vlastnu vetu, nie "zvysok po zaplateni".
    assert.ok(nahladHtml(n, T, true, esc).includes('Vzor'));
  });

  test(stranka + ': vzorovy subor (tlacidlo ukazka) ukaze ramcek opravy aj s nahladom', () => {
    const m = HTML.match(/const SAMPLE_XML = `([\s\S]*?)`;/);
    assert.ok(m, 'SAMPLE_XML sa nenasiel');
    const vzor = m[1];
    const fx = applyDeterministicFixes(vzor);
    const n = nahladOpravy(fx);
    assert.ok(n.dvojice.length >= 1, 'na vzorovom subore nie je co ukazat');
    // Ramcek sa ukaze len pri kode z OPRAVA_KODY, ktory diagnoza nasla.
    const kody = new Set(diagnose({ xml: vzor, bank: 'csob', expectedTxCount: null }).problems.map((p) => p.code));
    const opravaKody = ['adresa_nestrukturovana', 'adresa_bez_mesta_alebo_krajiny', 'adresa_prilis_vela_riadkov', 'adresa_zly_kod_krajiny', 'dbtr_iban_has_spaces', 'nb_of_txs_mismatch', 'ctrl_sum_mismatch'];
    assert.ok(opravaKody.some((k) => kody.has(k)), 'diagnoza vzoroveho suboru nenasla ziadnu chybu, ktoru oprava riesi; najdene: ' + [...kody].join(', '));
    assert.ok(HTML.includes("const vzor = String(cfg.xml || '').trim() === SAMPLE_XML.trim();"), 'stranka nerozlisuje vzorovy subor');
  });

  test(stranka + ': Umami oprava_nahlad a texty nahladu vo vsetkych troch jazykoch', () => {
    assert.ok(HTML.includes("track('oprava_nahlad', data)"), 'chyba udalost oprava_nahlad');
    assert.ok(HTML.includes("sledujNahlad(opravaBox.querySelector('#oprava-nahlad')"), 'udalost sa neviaze na nahlad');
    for (const kluc of ['nahladNadpis:', 'nahladPred:', 'nahladPo:', 'nahladDruh:', 'nahladZvysok:', 'nahladVzor:', 'opravaVratenie:']) {
      assert.equal((HTML.match(new RegExp(kluc, 'g')) || []).length, 3, kluc + ' nie je vo vsetkych troch jazykoch');
    }
  });

  test(stranka + ': veta o vrateni 29 EUR je pripravena, ale skryta, kym ju Andrej neschvali', () => {
    assert.equal((HTML.match(/UI\.opravaVratenie/g) || []).length, 1, 'veta o vrateni sa pouziva na viac miestach');
    assert.ok(HTML.includes("(VRATENIE_ZAPNUTE ? ' ' + esc(UI.opravaVratenie) : '')"), 'veta o vrateni nie je za konstantou');
    // Po Andrejovom ano zmenit na true aj tu (ops/strategia/2026-09-24/napady/top-10.md, bod 1).
    assert.ok(HTML.includes('const VRATENIE_ZAPNUTE = false;'), 'vratenie penazi je zapnute bez schvalenia');
  });
}
