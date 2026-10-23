// Kontrola SEPA suboru (hub, products/arling-sk/kontrola-suboru, SK, EN, DE):
// odkaz z Doctora nesie ?zistene=N a ?k=<kody nalezov> (relacia 205, T5).
//
// Co strazi:
// 1. Veta o nalezoch je tesne nad formularom #objednat (nie nad cenou).
// 2. Textarea #objednat-sprava sa predvyplni len kodmi z bieleho zoznamu
//    v stranke; zoznam je presne mnozina kodov z doctor-pain001.js.
// 3. Ziadna hodnota z adresy (IBAN, meno, HTML) sa do spravy ani vety nedostane,
//    veta ide cez textContent, vyplnene pole sa neprepise.
//
// Ako: vlozeny skript stranky sa spusti v node:vm s malymi nahradami za DOM.
// Stranky su v inom repozitari (hub); bez neho sa test preskoci.
// usage: node --test products/sepa-pain001-doctor/kontrola-odkaz.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Script, createContext } from 'node:vm';

const TU = dirname(fileURLToPath(import.meta.url));
const HUB = resolve(TU, '../arling-sk/kontrola-suboru');
const STRANKY = [['index.html', 'sk'], ['en/index.html', 'en'], ['de/index.html', 'de']];
const DOCTOR_KODY = [...new Set([...readFileSync(resolve(TU, 'doctor-pain001.js'), 'utf8')
  .matchAll(/code:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]))];
const bezHubu = !existsSync(resolve(HUB, 'index.html')) && 'hub (products/arling-sk) nie je vedla Doctora';

function skript(html) {
  const vsetky = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const s = vsetky.find((x) => x.includes("getElementById('zistene-veta')"));
  assert.ok(s, 'vlozeny skript s prenosom nalezu sa nenasiel');
  return s;
}

function spusti(html, adresa, { sprava = '' } = {}) {
  const prvky = {
    'zistene-veta': { hidden: true, textContent: '', innerHTML: '' },
    'objednat-sprava': { value: sprava },
  };
  const kontext = createContext({
    location: { href: adresa },
    URL,
    document: {
      getElementById: (id) => prvky[id] || null,
      querySelector: () => null,
    },
    window: {},
  });
  new Script(skript(html)).runInContext(kontext);
  return prvky;
}

for (const [cesta, jazyk] of STRANKY) {
  test('kontrola-suboru/' + cesta + ': biely zoznam kodov je presne zoznam z doctor-pain001.js', { skip: bezHubu }, () => {
    const html = readFileSync(resolve(HUB, cesta), 'utf8');
    const m = skript(html).match(/var KODY = '([a-z0-9_ ]+)'\.split\(' '\);/);
    assert.ok(m, 'biely zoznam KODY sa nenasiel');
    assert.deepEqual([...m[1].split(' ')].sort(), [...DOCTOR_KODY].sort());
  });

  test('kontrola-suboru/' + cesta + ': veta o nalezoch je tesne nad formularom #objednat, nie pri cene', { skip: bezHubu }, () => {
    const html = readFileSync(resolve(HUB, cesta), 'utf8');
    assert.equal((html.match(/id="zistene-veta"/g) || []).length, 1);
    const objednat = html.indexOf('<section id="objednat">');
    const veta = html.indexOf('<p class="zistene" id="zistene-veta" hidden></p>');
    const form = html.indexOf('<form data-dopyt');
    assert.ok(objednat > 0 && objednat < veta && veta < form, 'veta nie je v #objednat nad formularom');
    assert.match(html.slice(veta, form), /^<p class="zistene" id="zistene-veta" hidden><\/p>\s*$/, 'medzi vetou a formularom je este nieco');
    assert.ok(/\n\s*\.zistene \{/.test(html), 'styl vety plati len v .cena');
  });

  test('kontrola-suboru/' + cesta + ': k= predvyplni spravu len znamymi kodmi, nikdy hodnotami', { skip: bezHubu }, () => {
    const html = readFileSync(resolve(HUB, cesta), 'utf8');
    const k = ['adresa_nestrukturovana', 'ctrl_sum_mismatch', '<img src=x onerror=alert(1)>', 'SK2811000000191000000005', 'Jozef Stastny', 'adresa_nestrukturovana', '__proto__', 'constructor'].join(',');
    const adresa = 'https://arling.sk/kontrola-suboru/?z=doctor-adresa&zistene=2&k=' + encodeURIComponent(k) + '&locale=' + jazyk + '#objednat';
    const p = spusti(html, adresa);
    const sprava = p['objednat-sprava'].value;
    assert.ok(sprava.includes('adresa_nestrukturovana, ctrl_sum_mismatch'), 'kody v sprave chybaju: ' + sprava);
    assert.equal((sprava.match(/adresa_nestrukturovana/g) || []).length, 1, 'kod sa opakuje');
    for (const zle of ['<img', 'onerror', 'SK2811', 'Jozef', '__proto__', 'constructor']) {
      assert.ok(!sprava.includes(zle), 'hodnota v sprave: ' + zle);
      assert.ok(!p['zistene-veta'].textContent.includes(zle), 'hodnota vo vete: ' + zle);
    }
    assert.ok(sprava.length < 1500);
    assert.equal(p['zistene-veta'].hidden, false);
    assert.equal(p['zistene-veta'].innerHTML, '', 'veta ide cez innerHTML');
    assert.match(p['zistene-veta'].textContent, /2/);
    // Vyplnenu spravu (napr. po navrate spat) skript neprepise.
    const plna = spusti(html, adresa, { sprava: 'moja sprava' });
    assert.equal(plna['objednat-sprava'].value, 'moja sprava');
    // Len adresny nalez (zistene=0): veta s kodmi sa ukaze aj tak.
    const adr = spusti(html, 'https://arling.sk/kontrola-suboru/?z=doctor-adresa&zistene=0&k=adresa_nestrukturovana#objednat');
    assert.equal(adr['zistene-veta'].hidden, false);
    assert.ok(adr['objednat-sprava'].value.includes('adresa_nestrukturovana'));
    // Bez parametrov nic.
    const nic = spusti(html, 'https://arling.sk/kontrola-suboru/');
    assert.equal(nic['zistene-veta'].hidden, true);
    assert.equal(nic['objednat-sprava'].value, '');
    // Len nezname kody: nic sa nevpise.
    const zle = spusti(html, 'https://arling.sk/kontrola-suboru/?k=' + encodeURIComponent('SK28 1100,<b>x</b>'));
    assert.equal(zle['objednat-sprava'].value, '');
    assert.equal(zle['zistene-veta'].hidden, true);
    // Strop 25 kodov.
    const vela = spusti(html, 'https://arling.sk/kontrola-suboru/?k=' + DOCTOR_KODY.join(','));
    assert.equal(vela['objednat-sprava'].value.split(', ').length, 25);
  });
}
