// Straz CSP: kazdy vlozeny skript na troch strankach Doctora musi mat svoj
// sha256 v meta Content-Security-Policy (script-src).
//
// Preco: CSP obsahuje hashe, takze prehliadac 'unsafe-inline' ignoruje a skript
// bez hashu potichu zablokuje. Bez neho nefunguje diagnoza, nahlad opravy,
// oprava za 29 EUR ani stiahnutie po platbe (recenzia "doctor-nahlad", 24. 9. 2026).
// Sucet sa pocita rovnako ako ops/design/csp-hash.mjs: z LF verzie suboru,
// lebo GitHub Pages podava subory tak, ako su v gite (LF).
// Oprava pri cervenom teste: z korena repa `node ops/design/csp-hash.mjs --zapis`.
// usage: node --test products/sepa-pain001-doctor/csp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TU = dirname(fileURLToPath(import.meta.url));
const STRANKY = ['index.html', 'de/index.html', 'en/index.html'];
const sha = (s) => 'sha256-' + createHash('sha256').update(s, 'utf8').digest('base64');

for (const stranka of STRANKY) {
  test(`CSP obsahuje hash kazdeho vlozeneho skriptu: ${stranka}`, () => {
    const html = readFileSync(resolve(TU, stranka), 'utf8').split('\r\n').join('\n');
    const csp = html.match(/<meta[^>]*Content-Security-Policy"[^>]*content="([^"]+)"/i);
    assert.ok(csp, `${stranka}: chyba meta Content-Security-Policy`);
    const src = csp[1].match(/script-src ([^;]+)/);
    assert.ok(src, `${stranka}: CSP nema script-src`);
    const povolene = new Set(src[1].split(/\s+/).map((x) => x.replace(/'/g, '')));
    const vlozene = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter((m) => !/type="application\/json"/.test(m[1]));
    assert.ok(vlozene.some((m) => /type="module"/.test(m[1])), `${stranka}: nenasiel sa vlozeny modul`);
    for (const m of vlozene) {
      const h = sha(m[2]);
      assert.ok(povolene.has(h), `${stranka}: skript <script${m[1]}> ma ${h}, ktory v CSP chyba; spusti node ops/design/csp-hash.mjs --zapis`);
    }
  });
}
