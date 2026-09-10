/* Deterministické opravy pain.001, spoločné pre ops/kontrola/zakazka.mjs (Node)
 * a pre stránku SEPA pain.001 Doctor (prehliadač). Čistý JavaScript bez
 * závislostí, žiadny súborový systém.
 *
 * Štyri opravy, nič viac: (a) AdrLine → StrtNm, BldgNb, PstCd, TwnNm, Ctry,
 * len keď je rozdelenie jednoznačné; (b) názov krajiny → kód; (c) medzery
 * v IBAN; (d) prepočet NbOfTxs a CtrlSum. Pri neistote sa nič nemení a
 * položka ide do zoznamu na ručné rozhodnutie. */
// ---------------------------------------------------------------------------
// deterministické opravy
// ---------------------------------------------------------------------------

/** Bez diakritiky, malé písmená, ß -> ss, jedna medzera. Len na porovnanie. */
function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}

const COUNTRY_NAMES = {
  SK: ['slovensko', 'slovenska republika', 'slovakia', 'slovak republic', 'slowakei', 'slowakische republik', 'svk'],
  CZ: ['cesko', 'ceska republika', 'czechia', 'czech republic', 'tschechien', 'tschechische republik', 'cze'],
  DE: ['nemecko', 'deutschland', 'bundesrepublik deutschland', 'germany', 'deu'],
  AT: ['rakusko', 'rakousko', 'osterreich', 'oesterreich', 'austria', 'aut'],
  PL: ['polsko', 'polska', 'polen', 'poland', 'pol'],
  HU: ['madarsko', 'magyarorszag', 'ungarn', 'hungary', 'hun'],
  FR: ['francuzsko', 'francie', 'frankreich', 'france', 'fra'],
  IT: ['taliansko', 'italie', 'italien', 'italy', 'italia', 'ita'],
  NL: ['holandsko', 'nizozemsko', 'niederlande', 'netherlands', 'nederland', 'nld'],
  BE: ['belgicko', 'belgie', 'belgien', 'belgium', 'bel'],
  ES: ['spanielsko', 'spanelsko', 'spanien', 'spain', 'espana', 'esp'],
  PT: ['portugalsko', 'portugal', 'prt'],
  CH: ['svajciarsko', 'svycarsko', 'schweiz', 'switzerland', 'che'],
  SI: ['slovinsko', 'slowenien', 'slovenia', 'slovenija', 'svn'],
  HR: ['chorvatsko', 'kroatien', 'croatia', 'hrvatska', 'hrv'],
  IE: ['irsko', 'irland', 'ireland', 'irl'],
  LU: ['luxembursko', 'luxemburg', 'luxembourg', 'lux'],
  LT: ['litva', 'litauen', 'lithuania', 'ltu'],
  LV: ['lotyssko', 'lettland', 'latvia', 'lva'],
  EE: ['estonsko', 'estland', 'estonia', 'est'],
  FI: ['finsko', 'finnland', 'finland', 'fin'],
  SE: ['svedsko', 'schweden', 'sweden', 'swe'],
  DK: ['dansko', 'danemark', 'denmark', 'dnk'],
  NO: ['norsko', 'norwegen', 'norway', 'nor'],
  GR: ['grecko', 'griechenland', 'greece', 'grc'],
  RO: ['rumunsko', 'rumanien', 'romania', 'rou'],
  BG: ['bulharsko', 'bulgarien', 'bulgaria', 'bgr'],
  GB: ['velka britania', 'spojene kralovstvo', 'grossbritannien', 'vereinigtes konigreich', 'united kingdom', 'great britain', 'gbr'],
};
const NAME_TO_CODE = new Map();
for (const [code, names] of Object.entries(COUNTRY_NAMES)) for (const n of names) NAME_TO_CODE.set(n, code);

/** 'Slovensko' -> 'SK', 'sk' -> 'SK', 'SK' -> 'SK', neznáme -> null. */
export function countryCode(value) {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return NAME_TO_CODE.get(normalizeName(raw)) || null;
}

/** (b) <Ctry>Slovensko</Ctry> -> <Ctry>SK</Ctry>. Neznáme názvy ostávajú a idú do zoznamu. */
export function fixCountryNames(xml) {
  let count = 0;
  const unresolved = [];
  const out = xml.replace(/<Ctry>([^<]*)<\/Ctry>/g, (m, v) => {
    const trimmed = v.trim();
    if (/^[A-Z]{2}$/.test(trimmed)) return trimmed === v ? m : `<Ctry>${trimmed}</Ctry>`;
    const code = countryCode(trimmed);
    if (!code) { if (!unresolved.includes(trimmed)) unresolved.push(trimmed); return m; }
    count++;
    return `<Ctry>${code}</Ctry>`;
  });
  return { xml: out, count, unresolved };
}

/** (c) medzery a iné biele znaky vnútri <IBAN>. */
export function fixIbanWhitespace(xml) {
  let count = 0;
  const out = xml.replace(/<IBAN>([^<]*)<\/IBAN>/g, (m, v) => {
    const clean = v.replace(/\s+/g, '');
    if (clean === v) return m;
    count++;
    return `<IBAN>${clean}</IBAN>`;
  });
  return { xml: out, count };
}

// Formáty PSČ, ktoré vieme priradiť ku krajine. Slovensko a Česko majú
// rovnaký formát (851 01), preto sa medzi nimi rozhoduje IBAN strany alebo
// výslovne uvedená krajina, nikdy nie odhad.
const POSTCODE_FORMATS = [
  { re: /^\d{3} \d{2}$/, countries: ['SK', 'CZ'] },
  { re: /^\d{5}$/, countries: ['SK', 'CZ', 'DE'] },
  { re: /^\d{4}$/, countries: ['AT', 'HU'] },
  { re: /^\d{2}-\d{3}$/, countries: ['PL'] },
];
const STREET_RE = /^(.+?)\s+(\d+[A-Za-z]?(?:\s?\/\s?\d+[A-Za-z]?)?)$/;
// Poštový priečinok nie je ulica s číslom; pain.001.001.03 preň nemá prvok
// (PstBx je až v .09), tak to necháme človeku.
const POBOX_RE = /^(p\.?\s?o\.?\s?box|po box|pobox|post box|postfach|schliessfach|postovy priecinok|post priecinok|pp)\b/;
const MAX = { StrtNm: 70, BldgNb: 16, PstCd: 16, TwnNm: 35 };

// Väčšie mestá, ktoré rozhodnú medzi krajinami s rovnakým tvarom PSČ
// (Slovensko a Česko majú obe "851 01"). Porovnáva sa bez diakritiky.
const TOWNS = {
  SK: 'Bratislava,Košice,Prešov,Žilina,Nitra,Banská Bystrica,Trnava,Martin,Trenčín,Poprad,Prievidza,Zvolen,Považská Bystrica,Michalovce,Nové Zámky,Spišská Nová Ves,Komárno,Levice,Humenné,Bardejov,Liptovský Mikuláš,Piešťany,Ružomberok,Lučenec,Topoľčany,Pezinok,Čadca,Dunajská Streda,Senica,Malacky,Skalica,Šaľa,Galanta,Hlohovec,Trebišov,Rimavská Sobota,Partizánske,Vranov nad Topľou,Dolný Kubín,Brezno,Púchov,Kežmarok,Bánovce nad Bebravou,Senec,Sereď,Snina,Nové Mesto nad Váhom,Rožňava,Handlová,Žiar nad Hronom,Zlaté Moravce,Stupava,Ivanka pri Dunaji,Šamorín,Sabinov,Detva,Myjava,Bytča,Kysucké Nové Mesto,Stará Ľubovňa,Levoča,Veľký Krtíš,Svidník,Stropkov,Medzilaborce,Sobrance,Kráľovský Chlmec,Krompachy,Gelnica,Revúca,Tornaľa,Fiľakovo,Krupina,Banská Štiavnica,Nová Baňa,Žarnovica,Vráble,Šurany,Štúrovo,Kolárovo,Veľký Meder,Modra,Svätý Jur,Holíč,Gbely,Brezová pod Bradlom,Stará Turá,Ilava,Dubnica nad Váhom,Nová Dubnica,Nemšová,Trstená,Tvrdošín,Námestovo,Turčianske Teplice,Vrútky,Sučany,Svit,Vysoké Tatry,Spišská Belá,Spišské Podhradie,Lipany,Veľký Šariš,Sečovce,Veľké Kapušany,Strážske,Vrbové,Leopoldov,Sládkovičovo,Nesvady,Hurbanovo,Šahy,Želiezovce,Tlmače',
  CZ: 'Praha,Brno,Ostrava,Plzeň,Liberec,Olomouc,České Budějovice,Hradec Králové,Ústí nad Labem,Pardubice,Zlín,Havířov,Kladno,Most,Opava,Frýdek-Místek,Karviná,Jihlava,Teplice,Děčín,Karlovy Vary,Chomutov,Jablonec nad Nisou,Mladá Boleslav,Prostějov,Přerov,Třebíč,Česká Lípa,Třinec,Tábor,Znojmo,Kolín,Příbram,Cheb,Písek,Trutnov,Orlová,Kroměříž,Vsetín,Šumperk,Uherské Hradiště,Břeclav,Hodonín,Litoměřice,Havlíčkův Brod,Nový Jičín,Chrudim,Krnov,Sokolov,Strakonice,Litvínov,Valašské Meziříčí,Klatovy,Kopřivnice,Jindřichův Hradec,Vyškov,Žďár nad Sázavou,Bohumín,Kutná Hora,Mělník,Blansko,Náchod,Beroun,Jirkov,Žatec,Benešov,Otrokovice,Uherský Brod,Rakovník,Pelhřimov,Louny,Svitavy,Ostrov,Kadaň,Hranice,Bruntál,Rožnov pod Radhoštěm,Český Těšín,Neratovice,Brandýs nad Labem,Říčany,Slaný,Rokycany,Čelákovice',
  DE: 'Berlin,Hamburg,München,Köln,Frankfurt am Main,Stuttgart,Düsseldorf,Leipzig,Dortmund,Essen,Bremen,Dresden,Hannover,Nürnberg,Duisburg,Bochum,Wuppertal,Bielefeld,Bonn,Münster,Mannheim,Karlsruhe,Augsburg,Wiesbaden,Mönchengladbach,Gelsenkirchen,Aachen,Braunschweig,Chemnitz,Kiel,Halle,Magdeburg,Freiburg,Krefeld,Mainz,Lübeck,Erfurt,Oberhausen,Rostock,Kassel,Hagen,Potsdam,Saarbrücken,Hamm,Ludwigshafen,Mülheim,Oldenburg,Osnabrück,Leverkusen,Heidelberg,Darmstadt,Solingen,Regensburg,Herne,Paderborn,Neuss,Ingolstadt,Offenbach,Fürth,Würzburg,Ulm,Heilbronn,Pforzheim,Wolfsburg,Göttingen,Bottrop,Reutlingen,Koblenz,Bremerhaven,Erlangen,Recklinghausen,Bergisch Gladbach,Remscheid,Jena,Trier,Salzgitter,Moers,Siegen,Hildesheim,Cottbus,Passau,Landshut,Rosenheim,Bamberg,Bayreuth,Kempten,Konstanz,Flensburg',
  AT: 'Wien,Graz,Linz,Salzburg,Innsbruck,Klagenfurt,Villach,Wels,Sankt Pölten,St. Pölten,Dornbirn,Wiener Neustadt,Steyr,Feldkirch,Bregenz,Leonding,Klosterneuburg,Baden,Wolfsberg,Leoben,Krems,Traun,Amstetten,Lustenau,Kapfenberg,Mödling,Hallein,Kufstein,Traiskirchen,Schwechat,Braunau am Inn,Stockerau,Saalfelden,Ansfelden,Tulln,Hohenems,Spittal an der Drau,Telfs,Ternitz,Perchtoldsdorf,Feldkirchen,Bludenz,Bad Ischl,Eisenstadt,Schwaz,Hall in Tirol,Gmunden,Wörgl,Wals-Siezenheim,Waidhofen an der Ybbs,Marchtrenk,Bruck an der Mur,Korneuburg,Neunkirchen,Vöcklabruck,Lienz,Rankweil,Enns,Zwettl,Mistelbach,Gänserndorf,Hollabrunn,Horn',
};
const TOWN_TO_COUNTRY = new Map();
for (const [code, list] of Object.entries(TOWNS)) for (const town of list.split(',')) TOWN_TO_COUNTRY.set(normalizeName(town), code);

/** Krajina podľa mesta (bez čísla obvodu na konci, napr. "Bratislava 5"). */
function countryOfTown(town) {
  const n = normalizeName(String(town).replace(/\s+\d+$/, ''));
  return TOWN_TO_COUNTRY.get(n) || null;
}

/**
 * Rozdelí riadky voľnej adresy na StrtNm, BldgNb, PstCd, TwnNm, Ctry.
 * Vracia {ok: true, fields} alebo {ok: false, reason}. Pri akejkoľvek
 * neistote radšej odmietne: neopravená adresa je pre človeka lepší
 * výsledok než adresa opravená naslepo.
 *
 * @param {string[]} lines texty <AdrLine> v poradí
 * @param {string|null} ibanCountry dvojpísmenový kód z IBAN-u tej istej strany, ak je
 */
export function parseAddressLines(lines, ibanCountry) {
  let parts = lines.flatMap((l) => String(l).split(',')).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (parts.length < 2) return { ok: false, reason: 'jeden_kus' };

  let country = null;
  let zdrojKrajiny = null;
  const last = parts[parts.length - 1];
  if (!/\d/.test(last)) {
    const code = countryCode(last);
    if (code) { country = code; zdrojKrajiny = 'uvedena'; parts = parts.slice(0, -1); }
  }
  if (parts.length < 2) return { ok: false, reason: 'chyba_ulica_alebo_mesto' };

  // PSČ + mesto: v jednom kuse ("851 01 Bratislava"), alebo PSČ a mesto ako
  // dva susedné kusy ("851 01", "Bratislava").
  let pstCd = null;
  let twnNm = null;
  let idx = -1;
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/^(\d{3} \d{2}|\d{5}|\d{4}|\d{2}-\d{3})\s+(\D.*)$/);
    if (m) { pstCd = m[1]; twnNm = m[2].trim(); idx = i; break; }
    const alone = parts[i].match(/^(\d{3} \d{2}|\d{5}|\d{4}|\d{2}-\d{3})$/);
    if (alone && i + 1 < parts.length && !/\d/.test(parts[i + 1])) {
      pstCd = alone[1]; twnNm = parts[i + 1].trim(); idx = i; parts.splice(i + 1, 1); break;
    }
  }
  if (idx < 0) return { ok: false, reason: 'psc_a_mesto_nenajdene' };
  const rest = parts.filter((_, i) => i !== idx);
  if (rest.length !== 1) return { ok: false, reason: rest.length === 0 ? 'chyba_ulica' : 'viac_kusov_ulice' };

  const street = rest[0].match(STREET_RE);
  if (!street) return { ok: false, reason: 'ulica_bez_cisla' };
  const strtNm = street[1].trim();
  if (POBOX_RE.test(normalizeName(strtNm))) return { ok: false, reason: 'postovy_priecinok' };
  const bldgNb = street[2].replace(/\s*\/\s*/, '/');

  const fmt = POSTCODE_FORMATS.find((f) => f.re.test(pstCd));
  if (!fmt) return { ok: false, reason: 'neznamy_format_psc' };
  const podlaMesta = countryOfTown(twnNm);
  if (country) {
    if (!fmt.countries.includes(country)) return { ok: false, reason: 'psc_nesedi_s_krajinou' };
  } else if (podlaMesta && fmt.countries.includes(podlaMesta)) {
    // Známe mesto rozhoduje; IBAN z inej krajiny s rovnakým tvarom PSČ
    // (slovenská firma s českým účtom) je dôvod nechať to človeku.
    if (ibanCountry && ibanCountry !== podlaMesta && fmt.countries.includes(ibanCountry)) return { ok: false, reason: 'krajina_neista' };
    country = podlaMesta;
    zdrojKrajiny = 'mesto';
  } else if (fmt.countries.length === 1) {
    country = fmt.countries[0];
    zdrojKrajiny = 'psc';
  } else if (ibanCountry && fmt.countries.includes(ibanCountry)) {
    // Neznáme mesto, tvar PSČ sedí s krajinou IBAN-u tej istej strany.
    // Deterministické, ale v diagnoza.json označené, aby to človek videl.
    country = ibanCountry;
    zdrojKrajiny = 'iban';
  } else {
    return { ok: false, reason: 'krajina_neista' };
  }

  const fields = { StrtNm: strtNm, BldgNb: bldgNb, PstCd: pstCd, TwnNm: twnNm, Ctry: country };
  for (const [k, limit] of Object.entries(MAX)) if (fields[k].length > limit) return { ok: false, reason: `${k}_pridlhe` };
  return { ok: true, fields, zdrojKrajiny };
}

const STRUCTURED_TAGS = /<(Dept|SubDept|StrtNm|BldgNb|BldgNm|Flr|PstBx|Room|PstCd|TwnNm|TwnLctnNm|DstrctNm|CtrySubDvsn|Ctry)>/;
const PARTY_TAGS = ['Dbtr', 'Cdtr', 'UltmtDbtr', 'UltmtCdtr', 'InitgPty'];

/** Strana, ktorej adresa patrí: posledná otvorená značka strany pred pozíciou. */
function partyBefore(prefix) {
  let best = null;
  for (const tag of PARTY_TAGS) {
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
      manual.push({ poradie, strana: party, riadky: lines, dovod: parsed.reason });
      return m;
    }
    const sepMatch = inner.match(/(\r?\n[ \t]*)<AdrLine>/);
    const sep = sepMatch ? sepMatch[1] : '';
    const tail = (inner.match(/\s*$/) || [''])[0];
    const f = parsed.fields;
    const body = ['StrtNm', 'BldgNb', 'PstCd', 'TwnNm', 'Ctry'].map((k) => `${sep}<${k}>${f[k]}</${k}>`).join('');
    count++;
    zoznam.push({ poradie, strana: party, riadky: lines, polia: f, zdrojKrajiny: parsed.zdrojKrajiny });
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
  if (all.bad > 0) manual.push({ co: 'CtrlSum', dovod: `${all.bad} suma (InstdAmt) nie je v tvare 123.45, súčet sa nedá spoľahlivo prepočítať` });
  let out = xml.replace(/<GrpHdr>([\s\S]*?)<\/GrpHdr>/, (m, inner) => {
    if (!/<NbOfTxs>/.test(inner)) manual.push({ co: 'NbOfTxs', dovod: 'v GrpHdr chýba povinný NbOfTxs; doplniť musí človek na správne miesto' });
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
    krajiny: { pocet: b.count, nezname: b.unresolved },
    iban: { pocet: c.count },
    sucty: { zmeny: d.changes, rucne: d.manual, pocetPlatieb: d.txCount, sucet: d.sum },
  };
}

