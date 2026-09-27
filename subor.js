/* Výber alebo pretiahnutie súboru pain.001 do kontroly (27. 9. 2026, Fable; plán hubu 00-PLAN.md 1.3).
   Reklama hovorí o súbore, stránka brala len vložený text. Súbor sa číta len v prehliadači, nikam sa neposiela.
   Kódovanie: najprv UTF-8 (prísne), inak podľa XML deklarácie, inak windows-1250 (staršie slovenské účtovné programy).
   Samostatný súbor, aby sa nemenili odtlačky vložených skriptov v CSP. */
(function () {
  'use strict';
  var TEXTY = {
    sk: { vyber: 'Vybrať súbor XML', alebo: 'alebo ho sem pretiahnite, prípadne vložte text nižšie', velky: 'Súbor je väčší ako 10 MB, taký kontrola nevie spracovať.', chyba: 'Súbor sa nepodarilo prečítať.' },
    de: { vyber: 'XML-Datei wählen', alebo: 'oder hierher ziehen, oder den Text unten einfügen', velky: 'Die Datei ist größer als 10 MB, das kann die Prüfung nicht verarbeiten.', chyba: 'Die Datei konnte nicht gelesen werden.' },
    en: { vyber: 'Choose XML file', alebo: 'or drag it here, or paste the text below', velky: 'The file is larger than 10 MB, the check cannot process it.', chyba: 'The file could not be read.' },
  };
  var MAX = 10 * 1024 * 1024;

  function jazyk() {
    var k = (document.documentElement.lang || 'sk').slice(0, 2).toLowerCase();
    return TEXTY[k] ? k : 'en';
  }

  function dekoduj(buf) {
    var bajty = new Uint8Array(buf);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bajty).replace(/^﻿/, '');
    } catch (e) { /* nie je platné UTF-8 */ }
    var hlava = new TextDecoder('latin1').decode(bajty.slice(0, 200));
    var m = /encoding\s*=\s*["']([\w-]+)["']/i.exec(hlava);
    var kod = m ? m[1].toLowerCase() : 'windows-1250';
    try {
      return new TextDecoder(kod).decode(bajty);
    } catch (e) {
      return new TextDecoder('windows-1250').decode(bajty);
    }
  }

  function track(nazov, data) {
    try { if (window.umami && typeof window.umami.track === 'function') window.umami.track(nazov, data); } catch (e) { /* meranie nesmie rozbiť kontrolu */ }
  }

  function pripoj() {
    var pole = document.getElementById('f-xml');
    var spusti = document.getElementById('run-btn');
    if (!pole || document.getElementById('f-subor')) return;
    var t = TEXTY[jazyk()];

    var riadok = document.createElement('div');
    riadok.className = 'subor-riadok';
    riadok.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:0 0 10px';
    var vstup = document.createElement('input');
    vstup.type = 'file';
    vstup.id = 'f-subor';
    vstup.accept = '.xml,application/xml,text/xml';
    vstup.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    var tlacidlo = document.createElement('label');
    tlacidlo.htmlFor = 'f-subor';
    tlacidlo.className = 'icon-btn primary';
    tlacidlo.style.cssText = 'cursor:pointer;min-height:40px;display:inline-flex;align-items:center';
    tlacidlo.textContent = t.vyber;
    var popis = document.createElement('span');
    popis.className = 'hint';
    popis.style.cssText = 'font:13px/1.4 var(--ui, system-ui);color:var(--muted, #a3a19a)';
    popis.textContent = t.alebo;
    var sprava = document.createElement('span');
    sprava.className = 'hint';
    sprava.style.cssText = 'font:600 13px/1.4 var(--ui, system-ui);color:var(--ink, inherit)';
    sprava.setAttribute('role', 'status');
    riadok.append(vstup, tlacidlo, popis, sprava);
    pole.parentNode.insertBefore(riadok, pole);

    function nacitaj(subor, ako) {
      if (!subor) return;
      if (subor.size > MAX) { sprava.textContent = t.velky; return; }
      subor.arrayBuffer().then(function (buf) {
        pole.value = dekoduj(buf);
        sprava.textContent = subor.name;
        pole.dispatchEvent(new Event('input', { bubbles: true }));
        track('subor_vlozeny', { ako: ako, kb: Math.round(subor.size / 1024) });
        if (spusti) spusti.click();
      }, function () { sprava.textContent = t.chyba; });
    }

    vstup.addEventListener('change', function () { nacitaj(vstup.files && vstup.files[0], 'vyber'); vstup.value = ''; });
    ['dragenter', 'dragover'].forEach(function (typ) {
      pole.addEventListener(typ, function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
          e.preventDefault();
          pole.style.outline = '2px dashed var(--accent, #f2643c)';
        }
      });
    });
    pole.addEventListener('dragleave', function () { pole.style.outline = ''; });
    pole.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      pole.style.outline = '';
      nacitaj(f, 'pretiahnutie');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pripoj);
  else pripoj();
})();
