// Brana platby za opravu pain.001 (29 EUR) na VSETKYCH troch strankach Doctora:
// index.html (sk), de/index.html a en/index.html.
//
// Preco existuje: audit ops/stripe/audit-po-platbe-2026-09-21.md, nalez N1.
// Slovenska stranka bola opravena 21. 9. (posudOpravu, test
// ops/stripe/oprava-29.test.mjs), ale nemecka a anglicka kopia ostali pri
// starom pravidle "zaplatene a pod 149 EUR": opraveny subor tam vydala aj
// cudzia e-faktura za 2,90 EUR, GDPR balik za 39 EUR a kazda testovacia
// platba. Tento test bezi nad kazdou strankou zvlast, aby sa to uz nestalo.
//
// Funkcia posudOpravu sa vytiahne priamo zo zdroja stranky a spusti v Node:
// ziadny prehliadac, ziadna siet, ziadny Stripe.
// usage: node --test products/sepa-pain001-doctor/platba.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TU = dirname(fileURLToPath(import.meta.url));
const STRANKY = ['index.html', 'de/index.html', 'en/index.html'];

function zdrojFunkcie(html, meno, stranka) {
  const od = html.indexOf('function ' + meno + '(');
  assert.ok(od > 0, stranka + ': funkcia ' + meno + ' sa nenasla');
  let hlbka = 0;
  for (let j = html.indexOf('{', od); j < html.length; j++) {
    if (html[j] === '{') hlbka += 1;
    else if (html[j] === '}') { hlbka -= 1; if (hlbka === 0) return html.slice(od, j + 1); }
  }
  throw new Error(stranka + ': telo funkcie ' + meno + ' sa neskoncilo');
}

for (const stranka of STRANKY) {
  const HTML = readFileSync(resolve(TU, stranka), 'utf8');

  test(stranka + ': ceny v stranke su tie z registra (oprava 2900, kontrola 14900 centov)', () => {
    assert.ok(HTML.includes('const CENA_OPRAVY = 2900;'), 'chyba CENA_OPRAVY');
    assert.ok(HTML.includes('const CENA_KONTROLY = 14900;'), 'chyba CENA_KONTROLY');
  });

  test(stranka + ': opravu odomkne len ziva platba presne za 29 EUR', () => {
    const posudOpravu = new Function('CENA_OPRAVY', 'CENA_KONTROLY',
      zdrojFunkcie(HTML, 'posudOpravu', stranka) + '\nreturn posudOpravu;')(2900, 14900);
    const ziva = (suma, extra = {}) => posudOpravu({ paid: true, livemode: true, currency: 'eur', amount_subtotal: suma, ...extra });
    assert.equal(ziva(2900), 'oprava');
    assert.equal(ziva(290), 'inaSuma', 'e-faktura za 2,90 EUR nie je oprava');
    assert.equal(ziva(990), 'inaSuma', 'e-faktura na 30 dni nie je oprava');
    assert.equal(ziva(3900), 'inaSuma', 'GDPR balik nie je oprava');
    assert.equal(ziva(14900), 'kontrola');
    assert.equal(posudOpravu({ paid: true, livemode: false, currency: 'eur', amount_subtotal: 2900 }), 'inaSuma', 'testovacia platba');
    assert.equal(posudOpravu({ paid: true, livemode: true, currency: 'czk', amount_subtotal: 2900 }), 'inaSuma', 'ina mena');
    assert.equal(posudOpravu({ paid: false }), 'nezaplatene');
    assert.equal(posudOpravu(null), 'nezaplatene');
  });

  test(stranka + ': navrat zo Stripe sa riadi posudkom, nie starym "pod 149 EUR"', () => {
    assert.ok(HTML.includes('const posudok = posudOpravu(st, Date.now());'), 'opravaPoNavrate nepouziva posudOpravu s aktualnym casom');
    assert.ok(HTML.includes("if (posudok !== 'oprava')"), 'chyba odmietnutie platby, ktora nie je opravou');
    assert.ok(!/st\.amount_total >= 14900/.test(HTML), 'stranka stale pusta kazdu platbu pod 149 EUR');
    assert.equal((HTML.match(/opravaInaSuma:/g) || []).length, 3, 'veta opravaInaSuma nie je vo vsetkych troch jazykoch');
  });

  // Nalez recenzenta z 24. 9. 2026 (uloha platobne-diery): ten isty navratovy
  // odkaz so session_id vydal opravu hocikolkych suborov, kedykolvek neskor.
  // Stav opravaZaplatene platil pre kazdy dalsi diagnostikovany subor.
  test(stranka + ': stary navratovy odkaz (viac nez 24 hodin od created) opravu nevyda', () => {
    const posudOpravu = new Function('CENA_OPRAVY', 'CENA_KONTROLY',
      zdrojFunkcie(HTML, 'posudOpravu', stranka) + '\nreturn posudOpravu;')(2900, 14900);
    const teraz = Date.UTC(2026, 8, 24, 12, 0, 0);
    const s = teraz / 1000;
    const ziva = (created) => posudOpravu({ paid: true, livemode: true, currency: 'eur', amount_subtotal: 2900, created }, teraz);
    assert.equal(ziva(s - 3600), 'oprava', 'hodinu po nakupe sa stiahnut da');
    assert.equal(ziva(s - 24 * 3600 + 60), 'oprava', 'tesne pred koncom 24 hodin sa stiahnut da');
    assert.equal(ziva(s - 24 * 3600 - 60), 'vyprsane', 'po 24 hodinach uz nie');
    assert.equal(ziva(s - 30 * 24 * 3600), 'vyprsane', 'mesiac stary odkaz');
    assert.equal(ziva(s + 3600), 'oprava', 'cas z buducnosti nic nepredlzi, ale ani nezablokuje');
    assert.equal(ziva(null), 'oprava', 'starsi worker bez created: cas sa nekontroluje');
    // Kontrola za 149 EUR ide na stranku nahratia bez ohladu na vek session.
    assert.equal(posudOpravu({ paid: true, livemode: true, currency: 'eur', amount_subtotal: 14900, created: s - 30 * 24 * 3600 }, teraz), 'kontrola');
    // Ina suma ostava inou sumou, aj stara.
    assert.equal(posudOpravu({ paid: true, livemode: true, currency: 'eur', amount_subtotal: 290, created: s - 30 * 24 * 3600 }, teraz), 'inaSuma');
    assert.ok(HTML.includes("if (posudok === 'vyprsane')"), 'stranka posudok vyprsane neobsluzi');
    assert.equal((HTML.match(/opravaVyprsane:/g) || []).length, 3, 'veta opravaVyprsane nie je vo vsetkych troch jazykoch');
  });

  test(stranka + ': jedna zaplatena oprava vyda len jeden subor', () => {
    const odtlacokXml = new Function(zdrojFunkcie(HTML, 'odtlacokXml', stranka) + '\nreturn odtlacokXml;')();
    const rozhodniOpravu = new Function(zdrojFunkcie(HTML, 'rozhodniOpravu', stranka) + '\nreturn rozhodniOpravu;')();
    const a = '<?xml version="1.0"?>\n<Document><IBAN>SK3112000000198742637541</IBAN></Document>\n';
    const b = '<?xml version="1.0"?>\n<Document><IBAN>SK3112000000198742637542</IBAN></Document>\n';
    assert.equal(odtlacokXml(a), odtlacokXml(a.replace(/\n/g, '\r\n')), 'ine konce riadkov su ten isty subor');
    assert.equal(odtlacokXml(a), odtlacokXml('  ' + a + '\n\n'), 'okrajove medzery su ten isty subor');
    assert.notEqual(odtlacokXml(a), odtlacokXml(b), 'jedna ina cifra v IBAN je iny subor');

    // Scenar z nalezu: zaplatene, prvy subor sa naviaze, druhy uz nie.
    assert.equal(rozhodniOpravu(false, null, odtlacokXml(a)), 'kupit', 'bez platby len ponuka');
    assert.equal(rozhodniOpravu(true, null, odtlacokXml(a)), 'viazat', 'prvy subor po platbe sa naviaze');
    const viazane = odtlacokXml(a);
    assert.equal(rozhodniOpravu(true, viazane, odtlacokXml(a)), 'stiahnut', 'ten isty subor znova');
    assert.equal(rozhodniOpravu(true, viazane, odtlacokXml(b)), 'inySubor', 'iny subor je novy nakup');

    // Stranka sa naozaj riadi rozhodnutim, nie holym opravaZaplatene.
    assert.ok(!HTML.includes('if (opravaZaplatene) {'), 'ukazOpravu stale vydava opravu kazdemu suboru po platbe');
    assert.ok(HTML.includes("if (rozhodnutie === 'viazat' || rozhodnutie === 'stiahnut') {"), 'ukazOpravu nepouziva rozhodniOpravu');
    assert.ok(HTML.includes('opravaViazane = nacitajViazanie(sid);'), 'po navrate sa nenacita skorsia vazba session');
    assert.ok(HTML.includes('opravaViazane = odtlacokXml(ulozene.xml); ulozViazanie(sid, opravaViazane);'), 'subor z kupy sa nenaviaze');
    assert.equal((HTML.match(/opravaInySubor:/g) || []).length, 3, 'veta opravaInySubor nie je vo vsetkych troch jazykoch');
    assert.equal((HTML.match(/stiahnuť ho môžete do 24 hodín od platby|download within 24 hours of payment|innerhalb von 24 Stunden nach der Zahlung/g) || []).length, 3,
      'pred platbou nie je povedane, ze oprava plati pre jeden subor a 24 hodin');
  });
}
