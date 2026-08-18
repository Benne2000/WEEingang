// ═══════════════════════════════════════════════════════════════════════════
//  SAP Custom Widget – Verlaufsanalyse Produkte & Hauptwarengruppen
//  Version 1.0.0
//
//  Zeigt den Verlauf einer Warengruppe oder eines Produkts über das laufende
//  Jahr, im Vergleich zum Vorjahr, über mehrere Niederlassungen hinweg und
//  gegen die durchschnittliche Niederlassung des GF-Bereichs.
//
//  Views:
//    1. Analyse – Auswahlspalte (HWG / Produkt / Niederlassungen)
//                 + Kennzahlen + Verlaufsdiagramm + Jahresleiste
//                 + Abweichung zum Vorjahr + Niederlassungsvergleich
//    2. Info    – Dokumentation als PDF (GitHub Pages), im Widget eingebettet
//
//  Aufbau bewusst analog zu we_schicht.js (WE-Analyse 2.0.0):
//  IIFE, Web Component im Shadow DOM, ein Template-String, keine Fremd-
//  bibliotheken, Diagramme als selbst erzeugtes SVG, Konfiguration als
//  Instanzzustand (mehrere Widgets je Story dürfen sich nicht stören).
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const TAG = 'verlauf-widget';

  // Null-Werte, die BW zurückgeben kann
  const NULL_TOKENS = new Set(['', '#', '00000000', '000000000000', '@NullMember',
                               '@TotalMembers', 'null', 'undefined']);

  // Serienfarben der Niederlassungen. Bewusst kein Rot: Rot ist im Haus-Look
  // der Markenakzent und bleibt für "aktuelles Jahr / Selektion" reserviert.
  const NL_FARBEN = ['#c0392b', '#2d7dd2', '#22a06b', '#e08a1e', '#7b52ab', '#0f8b8d', '#b5478f'];

  const FARBE_DURCHSCHNITT = '#6b7280';   // Ø-Niederlassung: neutrales Grau
  const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  // ── Kleine Helfer ────────────────────────────────────────────────────────

  const esc = (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  const isNull = (v) => {
    if (v == null) return true;
    const s = String(v).trim();
    if (NULL_TOKENS.has(s)) return true;
    if (/^0+$/.test(s)) return true;
    if (/^#+$/.test(s)) return true;
    return false;
  };

  // BW liefert Materialnummern intern mit führenden Nullen. Für Anzeige und
  // Schlüsselbildung wird konsistent ohne Nullen gearbeitet.
  const ohneNullen = (wert) => {
    if (wert == null) return null;
    const s = String(wert).trim();
    if (!/^0+\d/.test(s)) return s;
    return s.replace(/^0+/, '') || s;
  };

  const extractVal = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') {
      const raw = ('id' in v && v.id != null) ? v.id
                : ('label' in v && v.label != null) ? v.label
                : ('raw' in v && v.raw != null) ? v.raw : null;
      return raw == null ? null : String(raw).trim();
    }
    return String(v).trim();
  };

  const extractLabel = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') {
      const raw = ('label' in v && v.label != null) ? v.label
                : ('id' in v && v.id != null) ? v.id : null;
      return raw == null ? null : String(raw).trim();
    }
    return String(v).trim();
  };

  // Liest ein Merkmal. Jeder Key wird mit _0-Suffix (SAC) und direkt versucht.
  const readDim = (row, ...keys) => {
    for (const key of keys) {
      for (const k of [`${key}_0`, key]) {
        const raw = extractVal(row[k]);
        if (!isNull(raw)) return raw;
      }
    }
    return null;
  };

  const readLabel = (row, ...keys) => {
    for (const key of keys) {
      for (const k of [`${key}_0`, key]) {
        const raw = extractLabel(row[k]);
        if (!isNull(raw)) return raw;
      }
    }
    return null;
  };

  // SAC liefert Measures als { raw: 144, formatted: "144" }.
  const readVal = (row, ...keys) => {
    for (const key of keys) {
      for (const k of [`${key}_0`, key]) {
        const v = row[k];
        if (v == null) continue;
        const num = (typeof v === 'object' && 'raw' in v) ? v.raw : v;
        if (num == null || num === '') continue;
        const n = Number(num);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  // ── Periodenerkennung ────────────────────────────────────────────────────
  // BW liefert Zeitmerkmale in sehr unterschiedlichen Formaten. Erkannt werden:
  //   0CALWEEK   202633 / 2026.33 / KW 33.2026 / 2026-W33
  //   0CALMONTH  202608 / 08.2026 / Aug 2026
  //   0CALDAY    20260817 / 2026-08-17
  // Rückgabe: { jahr, per, typ } – typ ist 'woche', 'monat' oder null
  // (nicht entscheidbar; dann bestimmt die Property periodenTyp bzw. das
  //  Maximum aller Perioden das Raster).

  function isoWoche(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const tag = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - tag);
    const jahresStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const kw = Math.ceil(((t - jahresStart) / 86400000 + 1) / 7);
    return { jahr: t.getUTCFullYear(), kw };
  }

  function parsePeriode(rohPeriode, rohJahr) {
    if (isNull(rohPeriode) && isNull(rohJahr)) return null;

    const text = String(rohPeriode ?? '').trim();
    const jahrExtra = isNull(rohJahr) ? null : parseInt(String(rohJahr).replace(/\D/g, ''), 10);

    // Ausgeschriebener Monatsname ("Aug 2026", "August 2026")
    const monatTreffer = MONATE.findIndex(m => new RegExp('^' + m, 'i').test(text));
    if (monatTreffer >= 0) {
      const j = (text.match(/(19|20)\d{2}/) || [])[0];
      if (j || jahrExtra) return { jahr: Number(j ?? jahrExtra), per: monatTreffer + 1, typ: 'monat' };
    }

    const kwHinweis = /\b(kw|week|woche|w)\b/i.test(text) || /\d{4}-W\d{1,2}/i.test(text);
    const ziffern = text.replace(/\D/g, '');

    // Tagesdatum
    if (ziffern.length === 8) {
      const j = Number(ziffern.slice(0, 4)), m = Number(ziffern.slice(4, 6)), t = Number(ziffern.slice(6, 8));
      if (j > 1900 && m >= 1 && m <= 12 && t >= 1 && t <= 31) {
        const d = new Date(Date.UTC(j, m - 1, t));
        const w = isoWoche(d);
        return { jahr: w.jahr, per: w.kw, typ: 'woche', monat: m, jahrMonat: j };
      }
    }

    // YYYYPP oder PPYYYY
    if (ziffern.length === 6) {
      const vornJahr = /^(19|20)\d{2}/.test(ziffern);
      const jahr = Number(vornJahr ? ziffern.slice(0, 4) : ziffern.slice(2));
      const per  = Number(vornJahr ? ziffern.slice(4)    : ziffern.slice(0, 2));
      if (jahr > 1900 && per >= 1 && per <= 53) {
        return { jahr, per, typ: kwHinweis ? 'woche' : (per > 12 ? 'woche' : null) };
      }
    }

    // Getrennte Felder: Jahr aus dimension_jahr, Periode als reine Zahl
    if (jahrExtra && ziffern.length && ziffern.length <= 2) {
      const per = Number(ziffern);
      if (per >= 1 && per <= 53) return { jahr: jahrExtra, per, typ: kwHinweis ? 'woche' : (per > 12 ? 'woche' : null) };
    }

    // "2026-W33" / "33.2026" / "2026.33"
    const paar = text.match(/(\d{1,4})\D+(\d{1,4})/);
    if (paar) {
      const a = Number(paar[1]), b = Number(paar[2]);
      const jahr = a > 1900 ? a : (b > 1900 ? b : jahrExtra);
      const per  = a > 1900 ? b : a;
      if (jahr && per >= 1 && per <= 53) {
        return { jahr, per, typ: kwHinweis ? 'woche' : (per > 12 ? 'woche' : null) };
      }
    }

    return null;
  }

  // ── Datenmodell aufbauen ─────────────────────────────────────────────────
  //
  //  knoten: Map("gf|nl|hwg|produkt" → {
  //            gf, gfText, nl, nlText, hwg, hwgText, produkt, produktText,
  //            werte: Map(jahr → Float64Array(perMax + 1))   // Index = Periode
  //          })
  //
  //  Vorberechnete Register (nachHwg, nachGf) halten die Aggregation schnell,
  //  auch wenn die Query auf Produkt- × Niederlassungsebene viele Zeilen liefert.

  function parseRows(rows, periodenTyp) {
    const leer = {
      knoten: new Map(), nachHwg: new Map(), nachGf: new Map(),
      gfListe: [], nlListe: [], hwgListe: [], produktListe: [],
      jahre: [], aktJahr: null, vjJahr: null,
      perTyp: periodenTyp === 'monat' ? 'monat' : 'woche',
      perMax: periodenTyp === 'monat' ? 12 : 53,
      maxPerAktJahr: 0, zeilen: 0,
    };
    if (!Array.isArray(rows) || rows.length === 0) return leer;

    // 1. Durchlauf: Perioden einsammeln, Rastertyp bestimmen
    const roh = [];
    let maxPer = 0, typHinweis = null;

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const p = parsePeriode(readDim(row, 'dimension_periode', '0CALMONTH', '0CALWEEK', '0CALDAY',
                                     'CALMONTH', 'CALWEEK', 'PERIODE'),
                             readDim(row, 'dimension_jahr', '0CALYEAR', 'CALYEAR', 'JAHR'));
      if (!p) continue;
      if (p.typ) typHinweis = typHinweis ?? p.typ;
      if (p.per > maxPer) maxPer = p.per;
      roh.push({ row, p });
    }
    if (!roh.length) return leer;

    let perTyp;
    if (periodenTyp === 'woche' || periodenTyp === 'monat') perTyp = periodenTyp;
    else perTyp = typHinweis ?? (maxPer > 12 ? 'woche' : 'monat');
    const perMax = perTyp === 'monat' ? 12 : 53;

    const modell = {
      knoten: new Map(), nachHwg: new Map(), nachGf: new Map(),
      gfListe: [], nlListe: [], hwgListe: [], produktListe: [],
      jahre: [], aktJahr: null, vjJahr: null,
      perTyp, perMax, maxPerAktJahr: 0, zeilen: roh.length,
    };

    const gfSet = new Map(), nlSet = new Map(), hwgSet = new Map(), prodSet = new Map();
    const jahrSet = new Set();

    for (const { row, p } of roh) {
      // Ein Tagesdatum liefert bei Monatsraster den Monat, sonst die ISO-Woche
      let jahr = p.jahr, per = p.per;
      if (perTyp === 'monat' && p.monat) { jahr = p.jahrMonat; per = p.monat; }
      if (per < 1 || per > perMax) continue;

      // Aliase decken die BW-Merkmalsnamen mit ab, falls die Feeds im Designer
      // anders benannt sind als im Manifest vorgesehen.
      const gf   = readDim(row, 'dimension_gf', 'GFB', 'GF', 'GFBEREICH') ?? '#';
      const nl   = readDim(row, 'dimension_nl', '0PLANT', 'PLANT', 'WERKS', 'NL') ?? '#';
      const hwg  = readDim(row, 'dimension_hwg', 'HWG', 'MATKL') ?? '#';
      const prod = ohneNullen(readDim(row, 'dimension_produkt_nr', '0MATERIAL', 'MATERIAL', 'MATNR')) ?? '#';

      const menge = readVal(row, 'value_menge', 'MENGE', 'UMSATZ');
      const mengeVj = readVal(row, 'value_menge_vj', 'MENGE_VJ');
      if (menge == null && mengeVj == null) continue;

      const schluessel = `${gf}|${nl}|${hwg}|${prod}`;
      let k = modell.knoten.get(schluessel);
      if (!k) {
        k = {
          gf, gfText: readLabel(row, 'dimension_gf') ?? gf,
          nl, nlText: readLabel(row, 'dimension_nl') ?? nl,
          hwg, hwgText: readLabel(row, 'dimension_hwg') ?? hwg,
          produkt: prod,
          produktText: ohneNullen(readLabel(row, 'dimension_produkt_name', 'dimension_produkt_nr',
                                            '0MATERIAL', 'MATERIAL')) ?? prod,
          werte: new Map(),
        };
        modell.knoten.set(schluessel, k);

        if (!gfSet.has(gf))   gfSet.set(gf,  { key: gf,  text: k.gfText });
        if (!nlSet.has(nl))   nlSet.set(nl,  { key: nl,  text: k.nlText, gf });
        if (!hwgSet.has(hwg)) hwgSet.set(hwg, { key: hwg, text: k.hwgText, gf, produkte: new Map() });
        if (!prodSet.has(prod)) prodSet.set(prod, { key: prod, text: k.produktText, hwg, gf });
        hwgSet.get(hwg).produkte.set(prod, { key: prod, text: k.produktText, hwg, gf });

        if (!modell.nachHwg.has(hwg)) modell.nachHwg.set(hwg, []);
        modell.nachHwg.get(hwg).push(k);
        if (!modell.nachGf.has(gf)) modell.nachGf.set(gf, []);
        modell.nachGf.get(gf).push(k);
      }

      const ablegen = (j, wert) => {
        if (wert == null) return;
        let arr = k.werte.get(j);
        if (!arr) { arr = new Float64Array(perMax + 1); k.werte.set(j, arr); }
        arr[per] += wert;
        jahrSet.add(j);
      };
      ablegen(jahr, menge);
      // Optionale Vorjahreskennzahl der Query landet auf demselben Periodenindex
      // im Vorjahr – so verhält sie sich wie zwei Jahre echter Zeilen.
      ablegen(jahr - 1, mengeVj);
    }

    modell.jahre = [...jahrSet].sort((a, b) => a - b);
    modell.aktJahr = modell.jahre[modell.jahre.length - 1] ?? null;
    modell.vjJahr = modell.jahre.includes(modell.aktJahr - 1) ? modell.aktJahr - 1 : null;

    // Letzte Periode mit Daten im aktuellen Jahr (Auswertungsgrenze)
    for (const k of modell.knoten.values()) {
      const arr = k.werte.get(modell.aktJahr);
      if (!arr) continue;
      for (let p = perMax; p > modell.maxPerAktJahr; p--) {
        if (arr[p]) { modell.maxPerAktJahr = p; break; }
      }
    }
    if (!modell.maxPerAktJahr) modell.maxPerAktJahr = perMax;

    const sortiert = (map) => [...map.values()].sort((a, b) =>
      String(a.key).localeCompare(String(b.key), 'de', { numeric: true }));

    modell.gfListe = sortiert(gfSet);
    modell.nlListe = sortiert(nlSet);
    modell.hwgListe = sortiert(hwgSet).map(h => ({ ...h, produkte: sortiert(h.produkte) }));
    modell.produktListe = sortiert(prodSet);

    return modell;
  }

  // ── Aggregation ──────────────────────────────────────────────────────────

  // Liefert die Knotenmenge, über die summiert wird – möglichst klein.
  function knotenAuswahl(modell, filter) {
    if (filter.hwg && modell.nachHwg.has(filter.hwg)) return modell.nachHwg.get(filter.hwg);
    if (filter.gf && modell.nachGf.has(filter.gf))   return modell.nachGf.get(filter.gf);
    return [...modell.knoten.values()];
  }

  function passt(k, filter) {
    if (filter.gf && k.gf !== filter.gf) return false;
    if (filter.hwg && k.hwg !== filter.hwg) return false;
    if (filter.produkt && k.produkt !== filter.produkt) return false;
    if (filter.nl) {
      if (filter.nl instanceof Set) { if (!filter.nl.has(k.nl)) return false; }
      else if (k.nl !== filter.nl) return false;
    }
    return true;
  }

  // Summenreihe eines Jahres über alle passenden Knoten. Index = Periode.
  function reihe(modell, filter, jahr) {
    const out = new Float64Array(modell.perMax + 1);
    if (jahr == null) return out;
    for (const k of knotenAuswahl(modell, filter)) {
      if (!passt(k, filter)) continue;
      const arr = k.werte.get(jahr);
      if (!arr) continue;
      for (let p = 1; p <= modell.perMax; p++) out[p] += arr[p];
    }
    return out;
  }

  // Anzahl Niederlassungen, die im GF-Bereich für die aktuelle Warenauswahl
  // überhaupt Daten liefern – Nenner der Ø-Niederlassung.
  function nlAnzahl(modell, filter) {
    const set = new Set();
    for (const k of knotenAuswahl(modell, filter)) {
      if (!passt(k, { gf: filter.gf, hwg: filter.hwg, produkt: filter.produkt })) continue;
      set.add(k.nl);
    }
    return set.size || 1;
  }

  const summe = (arr, von, bis) => {
    let s = 0;
    for (let p = von; p <= bis && p < arr.length; p++) s += arr[p] || 0;
    return s;
  };

  // ── Styles ───────────────────────────────────────────────────────────────
  // Light ist der Standard, Dark wird über :host([theme="dark"]) überlagert.

  const CSS = `
    :host {
      --c-red:        #c0392b;
      --c-red-light:  #d14836;
      --c-red-dim:    rgba(192, 57, 43, 0.12);

      --c-green:      #1e9e63;
      --c-yellow:     #d9901a;
      --c-blue:       #2d7dd2;
      --c-blue-dim:   rgba(45, 125, 210, 0.14);

      --c-bg:         #f4f5f7;
      --c-bg2:        #ffffff;
      --c-bg3:        #eef0f4;
      --c-bg4:        #e0e4ea;

      --c-text:       #1a1d23;
      --c-text2:      #4a5060;
      --c-text3:      #868c9b;

      --c-border:     rgba(0, 0, 0, 0.09);
      --c-border2:    rgba(0, 0, 0, 0.17);
      --c-hover:      rgba(0, 0, 0, 0.035);

      --shadow-sm:    0 1px 3px rgba(0, 0, 0, 0.07);
      --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.10);

      --font:         'Segoe UI', system-ui, -apple-system, sans-serif;
      --font-mono:    'Consolas', 'Cascadia Code', 'Courier New', monospace;

      --r-sm: 4px;
      --r-md: 8px;
      --r-lg: 12px;
      --ease: cubic-bezier(0.16, 1, 0.3, 1);

      --sidebar-breite: 252px;

      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      font-family: var(--font);
      font-size: 13px;
      color: var(--c-text);
      background: var(--c-bg);
    }

    :host([theme="dark"]) {
      --c-red-light:  #e74c3c;
      --c-green:      #2ecc71;
      --c-yellow:     #f5b041;
      --c-blue:       #3d9ad6;
      --c-blue-dim:   rgba(61, 154, 214, 0.18);

      --c-bg:         #10131b;
      --c-bg2:        #191e2b;
      --c-bg3:        #232a3e;
      --c-bg4:        #2e3650;

      --c-text:       #f2f4f8;
      --c-text2:      #b4bacc;
      --c-text3:      #7e8598;

      --c-border:     rgba(255, 255, 255, 0.11);
      --c-border2:    rgba(255, 255, 255, 0.20);
      --c-hover:      rgba(255, 255, 255, 0.04);

      --shadow-sm:    0 2px 8px rgba(0, 0, 0, 0.35);
      --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.45);

      background: var(--c-bg);
      color: var(--c-text);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    button, select, input { font-family: var(--font); font-size: 12px; }
    button { cursor: pointer; border: none; background: none; color: inherit; }
    :focus-visible { outline: 2px solid var(--c-blue); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

    .widget-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

    /* ── Kopfzeile ──────────────────────────────────────────────────── */
    .header {
      display: flex; align-items: center; gap: 12px;
      height: 44px; padding: 0 14px; flex: 0 0 auto;
      background: var(--c-bg2);
      border-bottom: 1px solid var(--c-border);
    }
    .header-brand {
      display: flex; align-items: center; gap: 8px;
      font-family: var(--font-mono); font-size: 12px; font-weight: 700;
      letter-spacing: 0.10em; text-transform: uppercase;
    }
    .header-brand-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--c-red); box-shadow: 0 0 0 3px var(--c-red-dim);
    }
    .header-title  { font-size: 13px; color: var(--c-text2); }
    .header-sep    { flex: 1; }
    .header-meta   { font-family: var(--font-mono); font-size: 11px; color: var(--c-text3); }
    .icon-btn {
      width: 28px; height: 28px; border-radius: var(--r-sm);
      background: var(--c-bg3); border: 1px solid var(--c-border);
      color: var(--c-text2); font-size: 13px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background .15s var(--ease), color .15s var(--ease);
    }
    .icon-btn:hover { background: var(--c-bg4); color: var(--c-text); }
    .icon-btn.aktiv { background: var(--c-blue); border-color: var(--c-blue); color: #fff; }
    .spin { animation: dreh .6s var(--ease); }
    @keyframes dreh { from { transform: rotate(0); } to { transform: rotate(360deg); } }

    /* ── Werkzeugleiste ─────────────────────────────────────────────── */
    .toolbar {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 8px 14px; flex: 0 0 auto;
      background: var(--c-bg);
      border-bottom: 1px solid var(--c-border);
    }
    .nav-label {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--c-text3);
    }
    .toolbar-sep { flex: 1; }

    .seg {
      display: inline-flex; gap: 2px; padding: 2px;
      background: var(--c-bg2); border: 1px solid var(--c-border);
      border-radius: var(--r-md);
    }
    .seg button {
      padding: 5px 10px; border-radius: var(--r-sm);
      font-size: 11px; font-weight: 600; color: var(--c-text3); white-space: nowrap;
      transition: background .15s var(--ease), color .15s var(--ease);
    }
    .seg button:hover:not(.active) { color: var(--c-text2); background: var(--c-hover); }
    .seg button.active { background: var(--c-red); color: #fff; }

    .f-select {
      height: 28px; padding: 0 8px; max-width: 230px;
      background: var(--c-bg2); border: 1px solid var(--c-border);
      color: var(--c-text2); border-radius: var(--r-sm);
    }

    .schalter {
      display: inline-flex; align-items: center; gap: 7px;
      height: 28px; padding: 0 10px;
      background: var(--c-bg2); border: 1px solid var(--c-border);
      border-radius: var(--r-sm); font-size: 11px; color: var(--c-text2);
      transition: background .15s var(--ease);
    }
    .schalter:hover:not([disabled]) { background: var(--c-bg3); }
    .schalter[disabled] { opacity: .45; cursor: not-allowed; }
    .schalter.an { border-color: var(--c-border2); color: var(--c-text); background: var(--c-bg3); }
    .schalter .strich { width: 15px; border-top: 2px solid currentColor; opacity: .9; }
    .schalter .strich.gestrichelt { border-top-style: dashed; }
    .schalter .strich.gepunktet  { border-top-style: dotted; border-top-width: 3px; }
    .schalter.aus .strich { opacity: .3; }

    /* ── Grundlayout: Auswahlspalte + Inhalt ────────────────────────── */
    .layout { flex: 1 1 auto; display: flex; min-height: 0; }

    .sidebar {
      width: var(--sidebar-breite); flex: 0 0 var(--sidebar-breite);
      display: flex; flex-direction: column; min-height: 0;
      background: var(--c-bg2);
      border-right: 1px solid var(--c-border);
    }
    .sb-suche { position: relative; padding: 10px 10px 8px; flex: 0 0 auto; }
    .sb-suche input {
      width: 100%; height: 28px; padding: 0 26px 0 26px;
      background: var(--c-bg3); border: 1px solid var(--c-border);
      border-radius: var(--r-sm); color: var(--c-text);
    }
    .sb-suche .lupe {
      position: absolute; left: 18px; top: 50%; transform: translateY(-30%);
      font-size: 11px; color: var(--c-text3); pointer-events: none;
    }
    .sb-suche .leeren {
      position: absolute; right: 16px; top: 50%; transform: translateY(-30%);
      color: var(--c-text3); font-size: 14px; line-height: 1;
    }
    .sb-suche .leeren.hidden { display: none; }

    .sb-abschnitt { border-top: 1px solid var(--c-border); min-height: 0; display: flex; flex-direction: column; }
    .sb-abschnitt.waren { flex: 1 1 auto; }
    .sb-abschnitt.nl    { flex: 0 0 auto; max-height: 46%; }
    .sb-kopf {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 12px 6px; flex: 0 0 auto;
    }
    .sb-titel {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.09em;
      text-transform: uppercase; color: var(--c-text3);
    }
    .sb-kopf .sep { flex: 1; }
    .sb-mini {
      font-size: 10px; color: var(--c-text3); padding: 2px 6px;
      border-radius: var(--r-sm); border: 1px solid transparent;
    }
    .sb-mini:hover { background: var(--c-bg3); color: var(--c-text2); }

    .sb-liste { overflow-y: auto; padding: 0 6px 8px; }
    .sb-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 6px 8px; border-radius: var(--r-sm);
      color: var(--c-text2); text-align: left; line-height: 1.3;
      transition: background .12s var(--ease);
    }
    .sb-item:hover { background: var(--c-hover); color: var(--c-text); }
    .sb-item.aktiv {
      background: var(--c-red-dim); color: var(--c-text);
      box-shadow: inset 2px 0 0 var(--c-red);
    }
    .sb-item .pfeil {
      width: 12px; flex: 0 0 12px; font-size: 9px; color: var(--c-text3);
      transition: transform .15s var(--ease);
    }
    .sb-item .pfeil.offen { transform: rotate(90deg); }
    .sb-item .key {
      font-family: var(--font-mono); font-size: 10px; color: var(--c-text3);
      background: var(--c-bg3); border-radius: 3px; padding: 1px 5px; flex: 0 0 auto;
    }
    .sb-item .txt { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sb-item .zahl { font-family: var(--font-mono); font-size: 10px; color: var(--c-text3); }
    .sb-produkte { padding-left: 14px; }
    .sb-produkte .sb-item { padding: 5px 8px; font-size: 12px; }
    .sb-leer { padding: 10px 12px; font-size: 11px; color: var(--c-text3); }

    .sb-nl { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 8px; border-radius: var(--r-sm); }
    .sb-nl:hover { background: var(--c-hover); }
    .sb-nl .box {
      width: 14px; height: 14px; flex: 0 0 14px; border-radius: 3px;
      border: 1.5px solid var(--c-border2); position: relative;
    }
    .sb-nl.an .box { border-color: transparent; }
    .sb-nl.an .box::after {
      content: '✓'; position: absolute; inset: 0; color: #fff;
      font-size: 10px; line-height: 14px; text-align: center;
    }
    .sb-nl .name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-text2); }
    .sb-nl.an .name { color: var(--c-text); }
    .sb-nl .wert { font-family: var(--font-mono); font-size: 10px; color: var(--c-text3); }

    /* ── Inhaltsbereich ─────────────────────────────────────────────── */
    .content { flex: 1 1 auto; overflow-y: auto; padding: 12px 14px 18px; min-width: 0; }
    .abschnitt { margin-bottom: 12px; }
    .kontextzeile {
      display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .kontext-titel { font-size: 15px; font-weight: 600; }
    .kontext-sub { font-family: var(--font-mono); font-size: 11px; color: var(--c-text3); }

    .kpi-cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); }
    .kpi-card {
      background: var(--c-bg2); border: 1px solid var(--c-border);
      border-radius: var(--r-md); padding: 10px 12px 11px; box-shadow: var(--shadow-sm);
    }
    .kpi-label {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--c-text3);
    }
    .kpi-wert {
      font-family: var(--font-mono); font-size: 22px; font-weight: 700;
      line-height: 1.3; margin-top: 3px; font-variant-numeric: tabular-nums;
    }
    .kpi-wert.klein { font-size: 16px; }
    .kpi-wert.gut { color: var(--c-green); }
    .kpi-wert.mittel { color: var(--c-yellow); }
    .kpi-wert.schlecht { color: var(--c-red-light); }
    .kpi-sub { font-size: 11px; color: var(--c-text3); margin-top: 2px; font-variant-numeric: tabular-nums; }
    .kpi-bar { height: 4px; border-radius: 2px; background: var(--c-bg4); margin-top: 8px; position: relative; overflow: hidden; }
    .kpi-bar-fill { height: 100%; border-radius: 2px; position: absolute; top: 0; }
    .kpi-bar-mitte { position: absolute; top: -2px; bottom: -2px; left: 50%; width: 1px; background: var(--c-border2); }

    .panel {
      background: var(--c-bg2); border: 1px solid var(--c-border);
      border-radius: var(--r-md); padding: 11px 12px 8px; box-shadow: var(--shadow-sm);
    }
    .panel-kopf { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
    .panel-titel { font-size: 13px; font-weight: 600; }
    .panel-sub { font-family: var(--font-mono); font-size: 11px; color: var(--c-text3); }
    .panel-kopf .sep { flex: 1; }
    .mini-btn {
      height: 22px; padding: 0 9px; border-radius: var(--r-sm);
      background: var(--c-bg3); border: 1px solid var(--c-border);
      color: var(--c-text2); font-size: 11px;
    }
    .mini-btn:hover { background: var(--c-bg4); color: var(--c-text); }
    .mini-btn[hidden] { display: none; }

    .chart-wrap { position: relative; width: 100%; }
    .chart-wrap svg { display: block; width: 100%; }
    .chart-fuss {
      display: flex; align-items: center; gap: 8px;
      font-size: 11px; color: var(--c-text3); padding: 2px 0 4px;
    }
    .brush-wrap { position: relative; user-select: none; }

    .tooltip {
      position: absolute; pointer-events: none; z-index: 20;
      min-width: 172px; padding: 8px 10px;
      background: var(--c-bg2); border: 1px solid var(--c-border2);
      border-radius: var(--r-md); box-shadow: var(--shadow-md);
      font-size: 12px; opacity: 0; transition: opacity .12s var(--ease);
    }
    .tooltip.sichtbar { opacity: 1; }
    .tt-kopf {
      font-family: var(--font-mono); font-size: 11px; color: var(--c-text3);
      padding-bottom: 5px; margin-bottom: 5px; border-bottom: 1px solid var(--c-border);
    }
    .tt-zeile { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-variant-numeric: tabular-nums; }
    .tt-punkt { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
    .tt-name { color: var(--c-text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tt-wert { margin-left: auto; font-family: var(--font-mono); font-weight: 600; }

    .spalten { display: grid; gap: 12px; grid-template-columns: minmax(280px, 1fr) minmax(340px, 1.2fr); }
    @media (max-width: 1080px) { .spalten { grid-template-columns: 1fr; } }

    .tabelle { width: 100%; border-collapse: collapse; }
    .tabelle th {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--c-text3); font-weight: 600;
      text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--c-border);
      cursor: pointer; white-space: nowrap;
    }
    .tabelle th:first-child, .tabelle td:first-child { text-align: left; }
    .tabelle th.sortiert { color: var(--c-text); }
    .tabelle td {
      padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--c-border);
      font-family: var(--font-mono); font-size: 12px; color: var(--c-text2);
      font-variant-numeric: tabular-nums;
    }
    .tabelle tbody tr { cursor: pointer; }
    .tabelle tbody tr:hover td { background: var(--c-hover); }
    .tabelle tbody tr:last-child td { border-bottom: none; }
    .tabelle tbody tr.aus td { opacity: .45; }
    .z-name { font-family: var(--font); color: var(--c-text); display: flex; align-items: center; gap: 8px; }
    .z-punkt { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }
    .pos { color: var(--c-green); }
    .neg { color: var(--c-red-light); }
    .neutral { color: var(--c-text3); }
    .idx-zelle { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
    .idx-bar { width: 48px; height: 5px; border-radius: 3px; background: var(--c-bg4); position: relative; overflow: hidden; }
    .idx-bar span { position: absolute; top: 0; bottom: 0; border-radius: 3px; }

    /* ── Zustände ───────────────────────────────────────────────────── */
    .state {
      position: absolute; inset: 0; z-index: 30;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; background: var(--c-bg);
    }
    .state.hidden { display: none; }
    .state-icon { font-size: 28px; opacity: .5; }
    .state-text { font-size: 13px; color: var(--c-text3); max-width: 420px; text-align: center; line-height: 1.5; }
    .ring {
      width: 30px; height: 30px; border-radius: 50%;
      border: 3px solid var(--c-bg4); border-top-color: var(--c-red);
      animation: dreh 0.9s linear infinite;
    }

    /* ── Views ──────────────────────────────────────────────────────── */
    .view { display: none; flex: 1 1 auto; min-height: 0; }
    .view.active { display: flex; }
    #view-analyse { position: relative; }
    #view-info { flex-direction: column; background: var(--c-bg); }

    .info-kopf {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-bottom: 1px solid var(--c-border);
      background: var(--c-bg2); flex: 0 0 auto;
    }
    .info-kopf .sep { flex: 1; }
    .info-titel { font-size: 14px; font-weight: 600; }
    .info-quelle { font-family: var(--font-mono); font-size: 11px; color: var(--c-text3); }
    .info-body { flex: 1 1 auto; min-height: 0; position: relative; padding: 12px 14px 14px; display: flex; }
    .info-rahmen {
      flex: 1 1 auto; width: 100%; border: 1px solid var(--c-border);
      border-radius: var(--r-md); background: var(--c-bg2); box-shadow: var(--shadow-sm);
    }
    .info-hinweis {
      position: absolute; inset: 12px 14px 14px;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; text-align: center; padding: 24px;
      border: 1px dashed var(--c-border2); border-radius: var(--r-md); background: var(--c-bg2);
    }
    .info-hinweis.sichtbar { display: flex; }
    .info-link {
      display: inline-flex; align-items: center; gap: 6px;
      height: 30px; padding: 0 14px; border-radius: var(--r-sm);
      background: var(--c-red); color: #fff; font-size: 12px; font-weight: 600;
      text-decoration: none;
    }
    .info-link:hover { background: var(--c-red-light); }
  `;

  // ── Formatierung ─────────────────────────────────────────────────────────

  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfKurz = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return nf1.format(v / 1e9) + ' Mrd';
    if (a >= 1e6) return nf1.format(v / 1e6) + ' Mio';
    if (a >= 1e4) return nf0.format(v / 1e3) + ' Tsd';
    return nf0.format(v);
  };
  const proz = (v) => (v > 0 ? '+' : '') + nf1.format(v) + ' %';
  const klasseVorzeichen = (v) => v == null ? 'neutral' : v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'neutral';

  // ── Template ─────────────────────────────────────────────────────────────

  const template = document.createElement('template');
  template.innerHTML = `
    <style>${CSS}</style>

    <div class="widget-root">

      <div class="header">
        <div class="header-brand"><div class="header-brand-dot"></div>Verlauf</div>
        <div class="header-title" id="header-title">Produkte &amp; Warengruppen im Jahresverlauf</div>
        <div class="header-sep"></div>
        <div class="header-meta" id="header-meta"></div>
        <button class="icon-btn" id="btn-info" title="Dokumentation öffnen" aria-label="Dokumentation öffnen">i</button>
        <button class="icon-btn" id="btn-refresh" title="Daten neu auswerten" aria-label="Daten neu auswerten">⟳</button>
        <button class="icon-btn" id="btn-theme" title="Farbschema wechseln" aria-label="Farbschema wechseln">◑</button>
      </div>

      <div class="toolbar" id="toolbar">
        <span class="nav-label">Bereich</span>
        <select class="f-select" id="f-gf" aria-label="GF-Bereich"></select>

        <span class="nav-label">Ansicht</span>
        <div class="seg" id="seg-modus">
          <button data-modus="absolut">Absolut</button>
          <button data-modus="index">Index</button>
          <button data-modus="delta">Δ Vorjahr</button>
        </div>

        <span class="nav-label" id="lbl-raster">Raster</span>
        <div class="seg" id="seg-raster">
          <button data-raster="auto">Auto</button>
          <button data-raster="monat">Monat</button>
          <button data-raster="woche">Woche</button>
        </div>

        <span class="nav-label">Zeitraum</span>
        <select class="f-select" id="f-zeitraum" aria-label="Zeitraum"></select>

        <div class="toolbar-sep"></div>

        <button class="schalter" id="sw-durchschnitt" title="Durchschnittliche Niederlassung des GF-Bereichs">
          <span class="strich gestrichelt"></span>Ø Niederlassung
        </button>
        <button class="schalter" id="sw-vorjahr" title="Vorjahreskurve der ausgewählten Niederlassungen">
          <span class="strich gepunktet"></span>Vorjahr
        </button>
      </div>

      <!-- ── VIEW 1: Analyse ── -->
      <div class="view active" id="view-analyse">

        <!-- Auswahlspalte -->
        <div class="sidebar">
          <div class="sb-suche">
            <span class="lupe">🔍</span>
            <input type="search" id="sb-suche-input" placeholder="Warengruppe oder Produkt" autocomplete="off"
                   aria-label="Warengruppe oder Produkt suchen">
            <button class="leeren hidden" id="sb-suche-clear" title="Suche zurücksetzen">×</button>
          </div>

          <div class="sb-abschnitt waren">
            <div class="sb-kopf">
              <span class="sb-titel">Warengruppen</span>
              <span class="sep"></span>
              <button class="sb-mini" id="sb-waren-reset">Auswahl aufheben</button>
            </div>
            <div class="sb-liste" id="sb-waren"></div>
          </div>

          <div class="sb-abschnitt nl">
            <div class="sb-kopf">
              <span class="sb-titel">Niederlassungen</span>
              <span class="sep"></span>
              <button class="sb-mini" id="sb-nl-alle">Alle</button>
              <button class="sb-mini" id="sb-nl-keine">Keine</button>
            </div>
            <div class="sb-liste" id="sb-nl"></div>
          </div>
        </div>

        <!-- Inhalt -->
        <div class="content" id="content">

          <div class="kontextzeile">
            <div class="kontext-titel" id="kontext-titel">–</div>
            <div class="kontext-sub" id="kontext-sub"></div>
          </div>

          <div class="abschnitt">
            <div class="kpi-cards" id="kpi-cards"></div>
          </div>

          <div class="abschnitt">
            <div class="panel">
              <div class="panel-kopf">
                <div class="panel-titel">Verlauf</div>
                <div class="panel-sub" id="chart-sub"></div>
                <div class="sep"></div>
                <button class="mini-btn" id="zoom-reset" hidden>Zoom zurücksetzen</button>
              </div>
              <div class="chart-wrap" id="chart-wrap">
                <svg id="chart" role="img" aria-label="Verlaufsdiagramm"></svg>
                <div class="tooltip" id="tooltip"></div>
              </div>
              <div class="chart-fuss">
                <span>Ziehen zoomt auf ein Zeitintervall · Doppelklick setzt zurück</span>
              </div>
              <div class="brush-wrap">
                <svg id="brush" role="img" aria-label="Zeitraumauswahl über das Gesamtjahr"></svg>
              </div>
            </div>
          </div>

          <div class="abschnitt spalten">
            <div class="panel">
              <div class="panel-kopf">
                <div class="panel-titel">Abweichung zum Vorjahr</div>
                <div class="panel-sub" id="delta-sub"></div>
              </div>
              <div class="chart-wrap">
                <svg id="chart-delta" role="img" aria-label="Abweichung zum Vorjahr je Periode"></svg>
              </div>
            </div>

            <div class="panel">
              <div class="panel-kopf">
                <div class="panel-titel">Niederlassungen im Vergleich</div>
                <div class="panel-sub" id="tab-sub"></div>
              </div>
              <table class="tabelle" id="nl-tabelle">
                <thead>
                  <tr>
                    <th data-sort="name">Niederlassung</th>
                    <th data-sort="menge">Menge</th>
                    <th data-sort="delta">Δ Vorjahr</th>
                    <th data-sort="index">Index vs. Ø</th>
                    <th data-sort="anteil">Anteil</th>
                  </tr>
                </thead>
                <tbody id="nl-tabelle-body"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="state hidden" id="state-loading">
          <div class="ring"></div>
          <div class="state-text">Auswertung wird geladen …</div>
        </div>

        <div class="state hidden" id="state-empty">
          <div class="state-icon">📈</div>
          <div class="state-text" id="state-empty-text">Keine Daten vorhanden</div>
        </div>
      </div>

      <!-- ── VIEW 2: Dokumentation ── -->
      <div class="view" id="view-info">
        <div class="info-kopf">
          <div class="info-titel" id="info-titel">Dokumentation</div>
          <div class="info-quelle" id="info-quelle"></div>
          <div class="sep"></div>
          <a class="info-link" id="info-extern" href="#" target="_blank" rel="noopener">In neuem Tab öffnen ↗</a>
          <button class="mini-btn" id="info-neu">Neu laden</button>
          <button class="mini-btn" id="info-zurueck">← Zurück zur Auswertung</button>
        </div>
        <div class="info-body">
          <iframe class="info-rahmen" id="info-rahmen" title="Dokumentation als PDF"></iframe>
          <div class="info-hinweis" id="info-hinweis">
            <div class="state-icon">📄</div>
            <div class="state-text" id="info-hinweis-text">
              Das Dokument konnte nicht eingebettet werden. Manche Browser und Portalkonfigurationen
              blockieren eingebettete PDFs – über den Button daneben lässt es sich direkt öffnen.
            </div>
          </div>
        </div>
      </div>

    </div>
  `;

  // ── Web Component ────────────────────────────────────────────────────────

  class VerlaufWidget extends HTMLElement {

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._shadow.appendChild(template.content.cloneNode(true));

      this._ac = new AbortController();
      this._dataBinding = null;
      this._modell = parseRows(null);

      // Darstellung
      this._theme = 'light';
      this._periodenTyp = 'auto';
      this._infoPdfUrl = 'https://benne2000.github.io/WEEingang/verlauf_widget.pdf';
      this._infoTitel = 'Verlaufsanalyse – Dokumentation';
      this._maxSerien = 6;

      // Auswahlzustand
      this._gf = null;                 // aktiver GF-Bereich (null = alle)
      this._hwg = null;
      this._produkt = null;
      this._nlAuswahl = new Set();     // leer = Summe aller Niederlassungen
      this._offeneHwg = new Set();
      this._suche = '';
      this._suchTimer = null;

      this._modus = 'index';
      this._raster = 'auto';
      this._zeigeDurchschnitt = true;
      this._zeigeVorjahr = true;
      this._von = 1;
      this._bis = 53;
      this._zeitraum = 'ytd';

      this._sortFeld = 'menge';
      this._sortRichtung = -1;

      // Interaktion
      this._chartGeo = null;
      this._ziehStart = null;
      this._brushGeo = null;
      this._brushStart = null;
      this._resizeTimer = null;
      this._watchdog = null;
    }

    connectedCallback() {
      this._bindEvents();
      this._applyTheme();
      if (!this._modell.knoten.size) { this._showLoading(); this._startWatchdog(); }
      this._render();
    }

    disconnectedCallback() {
      this._ac.abort();
      clearTimeout(this._suchTimer);
      clearTimeout(this._resizeTimer);
      clearTimeout(this._watchdog);
    }

    // Ein hängender Ladezustand kommt fast nie vom Widget, sondern von der
    // Verbindung zur Datenquelle. Nach kurzer Wartezeit sagen wir das auch.
    _startWatchdog() {
      clearTimeout(this._watchdog);
      this._watchdog = setTimeout(() => {
        if (this._modell.knoten.size) return;
        const zustand = this._dataBinding ? (this._dataBinding.state ?? 'unbekannt') : 'keine Zuweisung';
        this._showEmpty(
          'Es sind bisher keine Daten angekommen (Status der Datenquelle: ' + zustand + '). ' +
          'Typische Ursachen: die Live-Verbindung zum BW antwortet nicht (CORS/Netzwerk), ' +
          'dem Widget ist keine Datenquelle zugewiesen, oder die Feeds sind im Designer noch leer. ' +
          'Details stehen in der Browserkonsole.'
        );
      }, 20000);
    }

    _stopWatchdog() { clearTimeout(this._watchdog); this._watchdog = null; }

    _$(id) { return this._shadow.getElementById(id); }

    // ── Events ─────────────────────────────────────────────────────────
    _bindEvents() {
      const opts = { signal: this._ac.signal };

      this._$('btn-theme').addEventListener('click', () => {
        this.setTheme(this._theme === 'dark' ? 'light' : 'dark');
      }, opts);

      this._$('btn-refresh').addEventListener('click', () => {
        const b = this._$('btn-refresh');
        b.classList.add('spin');
        setTimeout(() => b.classList.remove('spin'), 600);
        this.refreshData();
      }, opts);

      this._$('btn-info').addEventListener('click', () => this.showInfo(), opts);
      this._$('info-zurueck').addEventListener('click', () => this.showAnalyse(), opts);
      this._$('info-neu').addEventListener('click', () => this._ladeInfoDokument(), opts);

      this._$('f-gf').addEventListener('change', (e) => {
        this._gf = e.target.value || null;
        // Auswahl, die nicht mehr zum Bereich passt, verwerfen
        this._hwg = null; this._produkt = null; this._offeneHwg.clear();
        this._nlAuswahl.clear();
        this._render();
      }, opts);

      this._shadow.querySelectorAll('#seg-modus button').forEach(b => {
        b.addEventListener('click', () => { this._modus = b.dataset.modus; this._render(); }, opts);
      });
      this._shadow.querySelectorAll('#seg-raster button').forEach(b => {
        b.addEventListener('click', () => { this._raster = b.dataset.raster; this._render(); }, opts);
      });

      this._$('f-zeitraum').addEventListener('change', (e) => {
        this._setZeitraumPreset(e.target.value);
        this._render();
      }, opts);

      this._$('sw-durchschnitt').addEventListener('click', () => {
        this._zeigeDurchschnitt = !this._zeigeDurchschnitt; this._render();
      }, opts);

      this._$('sw-vorjahr').addEventListener('click', () => {
        this._zeigeVorjahr = !this._zeigeVorjahr; this._render();
      }, opts);

      this._$('zoom-reset').addEventListener('click', () => this.resetZoom(), opts);

      // Suche mit kurzer Verzögerung
      const input = this._$('sb-suche-input');
      const clear = this._$('sb-suche-clear');
      input.addEventListener('input', () => {
        clearTimeout(this._suchTimer);
        const wert = input.value;
        this._suchTimer = setTimeout(() => {
          this._suche = wert.trim().toLowerCase();
          clear.classList.toggle('hidden', !this._suche);
          this._renderSidebar();
        }, 150);
      }, opts);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { input.value = ''; this._suche = ''; clear.classList.add('hidden'); this._renderSidebar(); }
      }, opts);
      clear.addEventListener('click', () => {
        input.value = ''; this._suche = ''; clear.classList.add('hidden'); this._renderSidebar();
      }, opts);

      this._$('sb-waren-reset').addEventListener('click', () => {
        this._hwg = null; this._produkt = null; this._render();
      }, opts);

      this._$('sb-nl-alle').addEventListener('click', () => {
        this._nlAuswahl = new Set(this._sichtbareNl().slice(0, this._maxSerien).map(n => n.key));
        this._render();
      }, opts);

      this._$('sb-nl-keine').addEventListener('click', () => {
        this._nlAuswahl.clear(); this._render();
      }, opts);

      this._shadow.querySelectorAll('#nl-tabelle th').forEach(th => {
        th.addEventListener('click', () => {
          const f = th.dataset.sort;
          if (this._sortFeld === f) this._sortRichtung *= -1;
          else { this._sortFeld = f; this._sortRichtung = f === 'name' ? 1 : -1; }
          this._renderTabelle();
        }, opts);
      });

      // Globale Maushandler für Zoom (einmalig, Geometrie kommt aus _chartGeo)
      window.addEventListener('mousemove', (e) => this._onMouseMove(e), opts);
      window.addEventListener('mouseup', (e) => this._onMouseUp(e), opts);
      window.addEventListener('resize', () => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._renderCharts(), 150);
      }, opts);
    }

    // ── View-Wechsel ───────────────────────────────────────────────────
    _switchView(name) {
      this._shadow.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      this._$(`view-${name}`).classList.add('active');
      this._$('toolbar').style.display = name === 'analyse' ? '' : 'none';
      this._$('btn-info').classList.toggle('aktiv', name === 'info');
      if (name === 'analyse') this._renderCharts();
    }

    _applyTheme() {
      if (this._theme === 'dark') this.setAttribute('theme', 'dark');
      else this.removeAttribute('theme');
    }

    _showLoading() { this._$('state-loading').classList.remove('hidden'); this._$('state-empty').classList.add('hidden'); }
    _hideLoading() { this._$('state-loading').classList.add('hidden'); }
    _showEmpty(text) {
      this._$('state-empty-text').textContent = text;
      this._$('state-empty').classList.remove('hidden');
      this._$('state-loading').classList.add('hidden');
    }
    _hideEmpty() { this._$('state-empty').classList.add('hidden'); }

    // ── Auswahl-Hilfen ─────────────────────────────────────────────────

    _perMaxAktiv() { return this._modell.maxPerAktJahr || this._modell.perMax; }

    _setZeitraumPreset(id) {
      const max = this._perMaxAktiv();
      const w = this._modell.perTyp === 'woche';
      const bereiche = w
        ? { ytd: [1, max], q1: [1, 13], q2: [14, 26], q3: [27, 39], q4: [40, 52],
            h1: [1, 26], h2: [27, 52], letzte: [Math.max(1, max - 12), max] }
        : { ytd: [1, max], q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12],
            h1: [1, 6], h2: [7, 12], letzte: [Math.max(1, max - 2), max] };
      const b = bereiche[id];
      this._zeitraum = id;
      if (!b) return;
      this._von = Math.min(b[0], max);
      this._bis = Math.min(b[1], max);
      if (this._bis < this._von) this._bis = this._von;
    }

    // Warengruppen, die zum Bereich und zur Suche passen
    _sichtbareHwg() {
      const q = this._suche;
      return this._modell.hwgListe.filter(h => {
        if (this._gf && h.gf !== this._gf) return false;
        if (!q) return true;
        if ((h.key + ' ' + h.text).toLowerCase().includes(q)) return true;
        return h.produkte.some(p => (p.key + ' ' + p.text).toLowerCase().includes(q));
      });
    }

    _sichtbareNl() {
      return this._modell.nlListe.filter(n => !this._gf || n.gf === this._gf);
    }

    _nlFarbe(key) {
      const liste = this._sichtbareNl();
      const i = liste.findIndex(n => n.key === key);
      return NL_FARBEN[(i < 0 ? 0 : i) % NL_FARBEN.length];
    }

    // Aktive Niederlassungen als Serien; leere Auswahl = eine Summenserie
    _serienNl() {
      const sichtbar = this._sichtbareNl();
      const aktiv = sichtbar.filter(n => this._nlAuswahl.has(n.key)).slice(0, this._maxSerien);
      if (aktiv.length) return aktiv.map(n => ({ key: n.key, text: n.text, farbe: this._nlFarbe(n.key) }));
      return [{ key: null, text: 'Alle Niederlassungen', farbe: NL_FARBEN[0] }];
    }

    _filterWare(nlKey) {
      const f = { gf: this._gf, hwg: this._hwg, produkt: this._produkt };
      if (nlKey) f.nl = nlKey;
      return f;
    }

    _kontextName() {
      if (this._produkt) {
        const p = this._modell.produktListe.find(x => x.key === this._produkt);
        return p ? (p.text === p.key ? p.key : `${p.text}`) : this._produkt;
      }
      if (this._hwg) {
        const h = this._modell.hwgListe.find(x => x.key === this._hwg);
        return h ? (h.text === h.key ? `HWG ${h.key}` : `HWG ${h.key} · ${h.text}`) : this._hwg;
      }
      if (this._gf) {
        const g = this._modell.gfListe.find(x => x.key === this._gf);
        return g ? g.text : this._gf;
      }
      return 'Alle Geschäftsbereiche';
    }

    // ── Auswahlspalte ──────────────────────────────────────────────────
    _renderSidebar() {
      const opts = { signal: this._ac.signal };
      const q = this._suche;

      // Warengruppen inkl. aufgeklappter Produkte
      const hwgs = this._sichtbareHwg();
      let html = '';

      if (!hwgs.length) {
        html = `<div class="sb-leer">${q ? 'Kein Treffer für die Suche.' : 'Keine Warengruppen im Datenausschnitt.'}</div>`;
      } else {
        for (const h of hwgs) {
          const offen = this._offeneHwg.has(h.key) || (q && h.produkte.some(p => (p.key + ' ' + p.text).toLowerCase().includes(q)));
          const aktiv = this._hwg === h.key && !this._produkt;
          html += `
            <button class="sb-item ${aktiv ? 'aktiv' : ''}" data-hwg="${esc(h.key)}" title="${esc(h.text)}">
              <span class="pfeil ${offen ? 'offen' : ''}" data-toggle="${esc(h.key)}">▶</span>
              <span class="key">${esc(h.key)}</span>
              <span class="txt">${esc(h.text === h.key ? '' : h.text)}</span>
              <span class="zahl">${h.produkte.length}</span>
            </button>`;
          if (offen) {
            const prods = q ? h.produkte.filter(p => (p.key + ' ' + p.text).toLowerCase().includes(q)
                                                  || (h.key + ' ' + h.text).toLowerCase().includes(q))
                            : h.produkte;
            html += `<div class="sb-produkte">` + prods.map(p => `
              <button class="sb-item ${this._produkt === p.key ? 'aktiv' : ''}"
                      data-produkt="${esc(p.key)}" data-phwg="${esc(h.key)}" title="${esc(p.text)}">
                <span class="key">${esc(p.key)}</span>
                <span class="txt">${esc(p.text === p.key ? '' : p.text)}</span>
              </button>`).join('') + `</div>`;
          }
        }
      }
      const liste = this._$('sb-waren');
      liste.innerHTML = html;

      liste.querySelectorAll('[data-hwg]').forEach(el => {
        el.addEventListener('click', (ev) => {
          const key = el.dataset.hwg;
          if (ev.target instanceof Element && ev.target.dataset.toggle) {
            if (this._offeneHwg.has(key)) this._offeneHwg.delete(key); else this._offeneHwg.add(key);
            this._renderSidebar();
            return;
          }
          if (this._hwg === key && !this._produkt) { this._hwg = null; }
          else { this._hwg = key; this._produkt = null; this._offeneHwg.add(key); }
          this._render();
        }, opts);
      });

      liste.querySelectorAll('[data-produkt]').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.dataset.produkt;
          if (this._produkt === key) { this._produkt = null; }
          else { this._produkt = key; this._hwg = el.dataset.phwg; }
          this._render();
          this.dispatchEvent(new CustomEvent('onProduktAuswahl', { detail: { produkt: this._produkt } }));
        }, opts);
      });

      // Niederlassungen mit Menge im aktiven Zeitraum
      const nls = this._sichtbareNl();
      const mengen = new Map();
      let maxMenge = 0;
      for (const n of nls) {
        const r = reihe(this._modell, this._filterWare(n.key), this._modell.aktJahr);
        const m = summe(r, this._von, this._bis);
        mengen.set(n.key, m);
        if (m > maxMenge) maxMenge = m;
      }

      const nlHtml = nls.length ? nls.map(n => {
        const an = this._nlAuswahl.has(n.key);
        const farbe = this._nlFarbe(n.key);
        return `
          <button class="sb-nl ${an ? 'an' : ''}" data-nl="${esc(n.key)}" title="${esc(n.text)}">
            <span class="box" style="${an ? `background:${farbe};` : ''}"></span>
            <span class="name">${esc(n.text)}</span>
            <span class="wert">${nfKurz(mengen.get(n.key) || 0)}</span>
          </button>`;
      }).join('') : `<div class="sb-leer">Keine Niederlassungen im Datenausschnitt.</div>`;

      const nlBox = this._$('sb-nl');
      nlBox.innerHTML = nlHtml;
      nlBox.querySelectorAll('[data-nl]').forEach(el => {
        el.addEventListener('click', () => this._toggleNl(el.dataset.nl), opts);
      });
    }

    _toggleNl(key) {
      if (this._nlAuswahl.has(key)) this._nlAuswahl.delete(key);
      else {
        if (this._nlAuswahl.size >= this._maxSerien) {
          // Älteste Auswahl weicht, damit das Diagramm lesbar bleibt
          const erste = this._nlAuswahl.values().next().value;
          this._nlAuswahl.delete(erste);
        }
        this._nlAuswahl.add(key);
      }
      this._render();
      this.dispatchEvent(new CustomEvent('onNiederlassungAuswahl', {
        detail: { niederlassungen: [...this._nlAuswahl] },
      }));
    }

    // ── Perioden des sichtbaren Ausschnitts ────────────────────────────
    // Liefert Anzeigeperioden mit den Grenzen im Rohraster, damit Zoom und
    // Aggregation dieselbe Sprache sprechen.
    _perioden() {
      const m = this._modell;
      const spanne = this._bis - this._von + 1;
      const wocheAktiv = m.perTyp === 'woche' &&
        (this._raster === 'woche' || (this._raster === 'auto' && spanne <= 16));

      if (m.perTyp === 'monat') {
        const out = [];
        for (let p = this._von; p <= this._bis; p++) {
          out.push({ label: MONATE[p - 1] ?? ('P' + p), kurz: MONATE[p - 1] ?? String(p), von: p, bis: p, nw: 1 });
        }
        return { raster: 'monat', punkte: out };
      }

      if (wocheAktiv) {
        const out = [];
        for (let p = this._von; p <= this._bis; p++) {
          out.push({ label: 'KW ' + p, kurz: String(p), von: p, bis: p, nw: 1 });
        }
        return { raster: 'woche', punkte: out };
      }

      const eimer = new Map();
      for (let w = this._von; w <= this._bis; w++) {
        const monat = Math.min(11, Math.floor((w - 1) / 4.3333));
        if (!eimer.has(monat)) eimer.set(monat, { label: MONATE[monat], kurz: MONATE[monat], von: w, bis: w, nw: 0 });
        const e = eimer.get(monat);
        e.bis = w; e.nw++;
      }
      return { raster: 'monat', punkte: [...eimer.values()] };
    }

    _aggregiere(arr, punkte) {
      return punkte.map(p => {
        let s = 0, treffer = false;
        for (let i = p.von; i <= p.bis && i < arr.length; i++) { s += arr[i] || 0; if (arr[i]) treffer = true; }
        return treffer ? s : (p.von <= this._perMaxAktiv() ? s : null);
      });
    }

    // Basis für die Indexdarstellung: Ø-Wert der ersten Perioden des Jahres
    _indexBasis(arr) {
      const n = this._modell.perTyp === 'woche' ? 4 : 1;
      let s = 0, z = 0;
      for (let p = 1; p <= n && p < arr.length; p++) { if (arr[p]) { s += arr[p]; z++; } }
      return z ? s / z : 0;
    }

    // ── Serien für Diagramm und Kennzahlen ─────────────────────────────
    _serien() {
      const m = this._modell;
      const { punkte, raster } = this._perioden();
      const nlSerien = this._serienNl();
      const serien = [];

      for (const s of nlSerien) {
        const istArr = reihe(m, this._filterWare(s.key), m.aktJahr);
        const vjArr  = m.vjJahr ? reihe(m, this._filterWare(s.key), m.vjJahr) : new Float64Array(m.perMax + 1);
        serien.push({
          id: 'nl:' + (s.key ?? 'alle'), name: s.text, farbe: s.farbe, art: 'ist',
          roh: istArr, rohVj: vjArr,
          werte: this._aggregiere(istArr, punkte),
          werteVj: this._aggregiere(vjArr, punkte),
          basis: this._indexBasis(istArr), basisVj: this._indexBasis(vjArr),
        });
      }

      // Vorjahreskurven nur, solange das Diagramm lesbar bleibt
      const vjMoeglich = !!m.vjJahr && nlSerien.length <= 2 && this._modus !== 'delta';
      if (this._zeigeVorjahr && vjMoeglich) {
        for (const s of serien.slice(0, 2)) {
          serien.push({
            id: s.id + ':vj', name: s.name + ' · Vorjahr', farbe: s.farbe, art: 'vj',
            roh: s.rohVj, werte: s.werteVj, basis: s.basisVj,
          });
        }
      }

      // Durchschnittliche Niederlassung des GF-Bereichs
      if (this._zeigeDurchschnitt) {
        const wareFilter = { gf: this._gf, hwg: this._hwg, produkt: this._produkt };
        const anzahl = nlAnzahl(m, wareFilter);
        const gesamt = reihe(m, wareFilter, m.aktJahr);
        const gesamtVj = m.vjJahr ? reihe(m, wareFilter, m.vjJahr) : new Float64Array(m.perMax + 1);
        const avg = new Float64Array(m.perMax + 1);
        const avgVj = new Float64Array(m.perMax + 1);
        for (let p = 0; p <= m.perMax; p++) { avg[p] = gesamt[p] / anzahl; avgVj[p] = gesamtVj[p] / anzahl; }
        serien.push({
          id: 'avg', name: 'Ø Niederlassung' + (this._gf ? '' : ' (alle Bereiche)'), farbe: FARBE_DURCHSCHNITT,
          art: 'avg', roh: avg, rohVj: avgVj,
          werte: this._aggregiere(avg, punkte),
          werteVj: this._aggregiere(avgVj, punkte),
          basis: this._indexBasis(avg), basisVj: this._indexBasis(avgVj),
          anzahlNl: anzahl,
        });
      }

      // Darstellungswerte je Modus
      for (const s of serien) {
        if (this._modus === 'absolut') {
          s.anzeige = s.werte.slice();
        } else if (this._modus === 'index') {
          s.anzeige = s.werte.map((v, i) => (v == null || !s.basis) ? null : (v / punkte[i].nw) / s.basis * 100);
        } else {
          s.anzeige = s.werte.map((v, i) => {
            const vj = s.werteVj ? s.werteVj[i] : null;
            return (v == null || !vj) ? null : (v - vj) / vj * 100;
          });
        }
      }

      return { punkte, raster, serien: serien.filter(s => this._modus !== 'delta' || s.art !== 'vj') };
    }

    // ── Kennzahlen ─────────────────────────────────────────────────────
    _renderKPIs() {
      const m = this._modell;
      const nlSerien = this._serienNl();
      const gewaehlt = nlSerien.filter(s => s.key).length;

      const selFilter = { gf: this._gf, hwg: this._hwg, produkt: this._produkt };
      if (gewaehlt) selFilter.nl = new Set(nlSerien.map(s => s.key));

      const ist = summe(reihe(m, selFilter, m.aktJahr), this._von, this._bis);
      const vj  = m.vjJahr ? summe(reihe(m, selFilter, m.vjJahr), this._von, this._bis) : null;

      const wareFilter = { gf: this._gf, hwg: this._hwg, produkt: this._produkt };
      const anzahlNl = nlAnzahl(m, wareFilter);
      const bereichIst = summe(reihe(m, wareFilter, m.aktJahr), this._von, this._bis);
      const bereichVj = m.vjJahr ? summe(reihe(m, wareFilter, m.vjJahr), this._von, this._bis) : null;

      const delta = (vj) ? (ist - vj) / vj * 100 : null;
      const bereichDelta = (bereichVj) ? (bereichIst - bereichVj) / bereichVj * 100 : null;

      const avgMenge = bereichIst / anzahlNl;
      const proNl = ist / Math.max(1, gewaehlt || anzahlNl);
      const index = avgMenge ? proNl / avgMenge * 100 : null;
      const anteil = bereichIst ? ist / bereichIst * 100 : null;

      // Stärkste und schwächste Periode nach Abweichung zum Vorjahr
      const { punkte } = this._perioden();
      const istArr = reihe(m, selFilter, m.aktJahr);
      const vjArr = m.vjJahr ? reihe(m, selFilter, m.vjJahr) : null;
      let best = null, flop = null;
      if (vjArr) {
        const a = this._aggregiere(istArr, punkte), b = this._aggregiere(vjArr, punkte);
        punkte.forEach((p, i) => {
          if (a[i] == null || !b[i]) return;
          const d = (a[i] - b[i]) / b[i] * 100;
          if (!best || d > best.d) best = { label: p.kurz, d };
          if (!flop || d < flop.d) flop = { label: p.kurz, d };
        });
      }

      const bewerte = (v, gut, schlecht) => v == null ? '' : v >= gut ? 'gut' : v <= schlecht ? 'schlecht' : 'mittel';
      const balken = (wert, spanne, farbe) => `
        <div class="kpi-bar"><div class="kpi-bar-mitte"></div>
          <div class="kpi-bar-fill" style="
            width:${Math.min(50, Math.abs(wert || 0) * spanne)}%;
            left:${(wert || 0) >= 0 ? '50%' : (50 - Math.min(50, Math.abs(wert || 0) * spanne)) + '%'};
            background:${farbe}"></div></div>`;

      const auswahlText = gewaehlt
        ? `${gewaehlt} von ${anzahlNl} Niederlassungen`
        : `alle ${anzahlNl} Niederlassungen`;

      const karten = [];

      karten.push(`
        <div class="kpi-card">
          <div class="kpi-label">Menge im Zeitraum</div>
          <div class="kpi-wert">${nfKurz(ist)}</div>
          <div class="kpi-sub">${esc(auswahlText)}</div>
          <div class="kpi-bar"><div class="kpi-bar-fill" style="left:0;width:100%;background:var(--c-red)"></div></div>
        </div>`);

      karten.push(`
        <div class="kpi-card">
          <div class="kpi-label">Δ Vorjahr</div>
          <div class="kpi-wert ${bewerte(delta, 2, -2)}">${delta == null ? '–' : proz(delta)}</div>
          <div class="kpi-sub">Bereich ${bereichDelta == null ? '–' : proz(bereichDelta)}</div>
          ${balken(delta, 1.6, (delta || 0) >= 0 ? 'var(--c-green)' : 'var(--c-red-light)')}
        </div>`);

      karten.push(`
        <div class="kpi-card">
          <div class="kpi-label">Index vs. Ø Niederlassung</div>
          <div class="kpi-wert ${bewerte(index, 102, 98)}">${index == null ? '–' : nf0.format(index)}</div>
          <div class="kpi-sub">Ø ${nfKurz(avgMenge)} je Niederlassung</div>
          ${balken(index == null ? 0 : index - 100, 1, (index || 100) >= 100 ? 'var(--c-green)' : 'var(--c-red-light)')}
        </div>`);

      karten.push(`
        <div class="kpi-card">
          <div class="kpi-label">Anteil am Bereich</div>
          <div class="kpi-wert">${anteil == null ? '–' : nf1.format(anteil) + ' %'}</div>
          <div class="kpi-sub">Bereich gesamt ${nfKurz(bereichIst)}</div>
          <div class="kpi-bar"><div class="kpi-bar-fill" style="left:0;width:${Math.min(100, anteil || 0)}%;background:var(--c-blue)"></div></div>
        </div>`);

      karten.push(`
        <div class="kpi-card">
          <div class="kpi-label">Ausreißer im Zeitraum</div>
          <div class="kpi-wert klein ${best && best.d >= 0 ? 'gut' : ''}">${best ? esc(best.label) + ' ' + proz(best.d) : '–'}</div>
          <div class="kpi-sub">schwächste: ${flop ? esc(flop.label) + ' ' + proz(flop.d) : '–'}</div>
          <div class="kpi-bar"><div class="kpi-bar-fill" style="left:0;width:100%;background:var(--c-bg4)"></div></div>
        </div>`);

      this._$('kpi-cards').innerHTML = karten.join('');
    }

    // ── Achsen-Helfer ──────────────────────────────────────────────────
    _ticks(min, max, anzahl) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
      if (min === max) { min -= 1; max += 1; }
      const roh = (max - min) / anzahl;
      const mag = Math.pow(10, Math.floor(Math.log10(roh)));
      const schritt = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= roh) || mag * 10;
      const start = Math.floor(min / schritt) * schritt;
      const ende = Math.ceil(max / schritt) * schritt;
      const out = [];
      for (let v = start; v <= ende + schritt * 0.001; v += schritt) out.push(v);
      return out;
    }

    // ── Verlaufsdiagramm ───────────────────────────────────────────────
    _renderChart() {
      const wrap = this._$('chart-wrap');
      const breite = Math.max(320, wrap.clientWidth || 760);
      const hoehe = 286;
      const pad = { l: 60, r: 14, t: 14, b: 26 };

      const daten = this._serien();
      const P = daten.punkte;
      const n = P.length;
      const balken = this._modus === 'delta';

      const werte = [];
      for (const s of daten.serien) for (const v of s.anzeige) if (v != null) werte.push(v);
      if (!werte.length) werte.push(0, 1);
      let min = Math.min(...werte), max = Math.max(...werte);
      if (balken) { const g = Math.max(Math.abs(min), Math.abs(max), 1); min = -g; max = g; }
      else if (this._modus === 'absolut') { min = Math.min(0, min); max = max * 1.04; }
      else { const luft = (max - min) * 0.12 || 5; min -= luft; max += luft; }

      const ticks = this._ticks(min, max, 4);
      const yMin = ticks[0], yMax = ticks[ticks.length - 1];
      const iw = breite - pad.l - pad.r;
      const ih = hoehe - pad.t - pad.b;
      const xf = balken || n === 1
        ? (i) => pad.l + (iw / n) * (i + 0.5)
        : (i) => pad.l + (iw / (n - 1)) * i;
      const yf = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

      const yText = (v) => this._modus === 'absolut' ? nfKurz(v)
        : this._modus === 'index' ? nf0.format(v)
        : (v > 0 ? '+' : '') + nf0.format(v);

      let s = `<svg id="chart" viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}"
                    xmlns="http://www.w3.org/2000/svg" role="img">`;

      for (const t of ticks) {
        const y = yf(t);
        const stark = (this._modus === 'index' && Math.abs(t - 100) < 0.001) || (balken && Math.abs(t) < 0.001);
        s += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${breite - pad.r}" y2="${y.toFixed(1)}"
                stroke="${stark ? 'var(--c-border2)' : 'var(--c-border)'}"/>`;
        s += `<text x="${pad.l - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-family="var(--font-mono)"
                font-size="10" fill="var(--c-text3)">${esc(yText(t))}</text>`;
      }

      const jeder = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 46))));
      P.forEach((p, i) => {
        if (i % jeder !== 0 && i !== n - 1) return;
        s += `<text x="${xf(i).toFixed(1)}" y="${hoehe - 8}" text-anchor="middle" font-family="var(--font-mono)"
                font-size="10" fill="var(--c-text3)">${esc(p.kurz)}</text>`;
      });

      if (balken) {
        const gruppen = daten.serien.length;
        const feld = iw / n;
        const bw = Math.max(2.5, (feld * 0.7) / gruppen);
        daten.serien.forEach((serie, gi) => {
          serie.anzeige.forEach((v, i) => {
            if (v == null) return;
            const mitte = pad.l + feld * (i + 0.5);
            const x = mitte - (gruppen * bw) / 2 + gi * bw;
            const y0 = yf(0), y1 = yf(v);
            const farbe = gruppen === 1
              ? (v >= 0 ? 'var(--c-green)' : 'var(--c-red-light)')
              : serie.farbe;
            s += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}"
                    height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="1.5" fill="${farbe}" opacity="0.9"/>`;
          });
        });
      } else {
        for (const serie of daten.serien) {
          let d = '', offen = false;
          serie.anzeige.forEach((v, i) => {
            if (v == null) { offen = false; return; }
            d += (offen ? 'L' : 'M') + xf(i).toFixed(1) + ' ' + yf(v).toFixed(1) + ' ';
            offen = true;
          });
          if (!d) continue;
          const strich = serie.art === 'vj' ? 'stroke-dasharray="6 4" stroke-width="1.6" opacity="0.75"'
                       : serie.art === 'avg' ? 'stroke-dasharray="2 4" stroke-width="2" opacity="0.9"'
                       : 'stroke-width="2.4"';
          s += `<path d="${d.trim()}" fill="none" stroke="${serie.farbe}" ${strich}
                  stroke-linejoin="round" stroke-linecap="round"/>`;
          if (serie.art === 'ist' && n <= 26) {
            serie.anzeige.forEach((v, i) => {
              if (v == null) return;
              s += `<circle cx="${xf(i).toFixed(1)}" cy="${yf(v).toFixed(1)}" r="2.8"
                      fill="var(--c-bg2)" stroke="${serie.farbe}" stroke-width="1.8"/>`;
            });
          }
        }
      }

      s += `<line id="hover-linie" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + ih}" stroke="var(--c-border2)" opacity="0"/>`;
      s += `<rect id="zoom-sel" x="0" y="${pad.t}" width="0" height="${ih}" fill="var(--c-blue)" opacity="0.13" pointer-events="none"/>`;
      s += `<rect id="hover-flaeche" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent" style="cursor:crosshair"/>`;
      s += `</svg>`;

      this._$('chart').outerHTML = s;
      const svg = this._$('chart');
      this._chartGeo = { svg, breite, pad, iw, ih, xf, punkte: P, serien: daten.serien };
      this._bindChartMaus(svg);

      const rasterText = daten.raster === 'woche' ? 'Wochenwerte' : 'Monatswerte';
      const zoomText = this._modell.perTyp === 'woche'
        ? `KW ${this._von}–${this._bis}`
        : `${MONATE[this._von - 1]}–${MONATE[this._bis - 1]}`;
      const modusText = this._modus === 'absolut' ? 'Absolutmengen'
        : this._modus === 'index' ? 'Index, Jahresstart = 100'
        : 'Abweichung zum Vorjahr in %';
      this._$('chart-sub').textContent = `${rasterText} · ${zoomText} · ${modusText}`;
      this._$('zoom-reset').hidden = (this._von === 1 && this._bis === this._perMaxAktiv());
    }

    _bindChartMaus(svg) {
      const opts = { signal: this._ac.signal };
      const flaeche = svg.querySelector('#hover-flaeche');
      const linie = svg.querySelector('#hover-linie');
      const tip = this._$('tooltip');
      const wrap = this._$('chart-wrap');

      flaeche.addEventListener('mousemove', (ev) => {
        const geo = this._chartGeo;
        if (!geo) return;
        const i = this._indexAn(this._svgX(geo.svg, ev));
        const p = geo.punkte[i];
        linie.setAttribute('x1', geo.xf(i)); linie.setAttribute('x2', geo.xf(i));
        linie.setAttribute('opacity', '1');

        const zeilen = geo.serien.map(serie => {
          const roh = serie.werte ? serie.werte[i] : null;
          const anz = serie.anzeige[i];
          const text = this._modus === 'absolut' ? (roh == null ? '–' : nf0.format(roh))
            : this._modus === 'index' ? (anz == null ? '–' : nf1.format(anz))
            : (anz == null ? '–' : proz(anz));
          return `<div class="tt-zeile"><span class="tt-punkt" style="background:${serie.farbe};
                    ${serie.art !== 'ist' ? 'opacity:.6' : ''}"></span>
                    <span class="tt-name">${esc(serie.name)}</span>
                    <span class="tt-wert">${esc(text)}</span></div>`;
        }).join('');

        const kopf = p.nw > 1
          ? `${p.label} · ${this._modell.perTyp === 'woche' ? 'KW ' : 'P '}${p.von}–${p.bis}${p.nw < 4 && this._modell.perTyp === 'woche' ? ' · angeschnitten' : ''}`
          : p.label;

        tip.innerHTML = `<div class="tt-kopf">${esc(kopf)}</div>${zeilen}`;
        tip.classList.add('sichtbar');
        const r = wrap.getBoundingClientRect();
        const x = ev.clientX - r.left;
        tip.style.left = Math.min(Math.max(6, x + 14), Math.max(6, r.width - tip.offsetWidth - 6)) + 'px';
        tip.style.top = '8px';
      }, opts);

      flaeche.addEventListener('mouseleave', () => {
        linie.setAttribute('opacity', '0');
        tip.classList.remove('sichtbar');
      }, opts);

      flaeche.addEventListener('mousedown', (ev) => {
        this._ziehStart = this._svgX(svg, ev);
        ev.preventDefault();
      }, opts);

      flaeche.addEventListener('dblclick', () => this.resetZoom(), opts);
    }

    _svgX(svg, ev) {
      const r = svg.getBoundingClientRect();
      if (!r.width) return 0;
      return (ev.clientX - r.left) * (svg.viewBox.baseVal.width / r.width);
    }

    _indexAn(x) {
      const geo = this._chartGeo;
      if (!geo || !geo.punkte.length) return 0;
      let best = 0, dist = Infinity;
      for (let i = 0; i < geo.punkte.length; i++) {
        const d = Math.abs(geo.xf(i) - x);
        if (d < dist) { dist = d; best = i; }
      }
      return best;
    }

    _onMouseMove(ev) {
      if (this._ziehStart != null && this._chartGeo) {
        const sel = this._chartGeo.svg.querySelector('#zoom-sel');
        const x = this._svgX(this._chartGeo.svg, ev);
        const a = Math.min(this._ziehStart, x), b = Math.max(this._ziehStart, x);
        if (sel) { sel.setAttribute('x', a); sel.setAttribute('width', Math.max(0, b - a)); }
      }
      if (this._brushStart != null && this._brushGeo) {
        const p = this._brushPeriode(ev);
        this._von = Math.min(this._brushStart, p);
        this._bis = Math.max(this._brushStart, p);
        if (this._bis - this._von < 1) this._bis = Math.min(this._perMaxAktiv(), this._von + 1);
        this._renderBrush();
      }
    }

    _onMouseUp(ev) {
      let neuRendern = false;
      if (this._ziehStart != null && this._chartGeo) {
        const geo = this._chartGeo;
        const x = this._svgX(geo.svg, ev);
        const a = this._indexAn(Math.min(this._ziehStart, x));
        const b = this._indexAn(Math.max(this._ziehStart, x));
        const gezogen = Math.abs(geo.xf(b) - geo.xf(a)) >= 8;
        this._ziehStart = null;
        const sel = geo.svg.querySelector('#zoom-sel');
        if (sel) sel.setAttribute('width', 0);
        if (gezogen) {
          this._von = geo.punkte[a].von;
          this._bis = geo.punkte[b].bis;
          neuRendern = true;
        }
      }
      if (this._brushStart != null) { this._brushStart = null; neuRendern = true; }
      if (neuRendern) {
        this._zeitraum = 'frei';
        this._$('f-zeitraum').value = 'frei';
        this._renderCharts();
        this._renderKPIs();
        this._renderTabelle();
        this.dispatchEvent(new CustomEvent('onZeitraumAuswahl', {
          detail: { von: this._von, bis: this._bis, raster: this._modell.perTyp },
        }));
      }
    }

    // ── Jahresleiste ───────────────────────────────────────────────────
    _renderBrush() {
      const m = this._modell;
      const breite = Math.max(320, this._$('chart-wrap').clientWidth || 760);
      const hoehe = 44, pad = { l: 60, r: 14, t: 5, b: 12 };
      const iw = breite - pad.l - pad.r, ih = hoehe - pad.t - pad.b;

      const nlSerien = this._serienNl();
      const gewaehlt = nlSerien.filter(s => s.key).length;
      const filter = { gf: this._gf, hwg: this._hwg, produkt: this._produkt };
      if (gewaehlt) filter.nl = new Set(nlSerien.map(s => s.key));

      const ist = reihe(m, filter, m.aktJahr);
      const vj = m.vjJahr ? reihe(m, filter, m.vjJahr) : null;

      let max = 1;
      for (let p = 1; p <= m.perMax; p++) {
        if (ist[p] > max) max = ist[p];
        if (vj && vj[p] > max) max = vj[p];
      }
      const xf = (p) => pad.l + ((p - 1) / Math.max(1, m.perMax - 1)) * iw;
      const yf = (v) => pad.t + ih - (v / max) * ih;

      const linie = (arr, bis) => {
        let d = '';
        for (let p = 1; p <= bis; p++) d += (p === 1 ? 'M' : 'L') + xf(p).toFixed(1) + ' ' + yf(arr[p] || 0).toFixed(1) + ' ';
        return d.trim();
      };

      let s = `<svg id="brush" viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}"
                    xmlns="http://www.w3.org/2000/svg" role="img">`;
      s += `<rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="var(--c-bg3)" rx="3"/>`;
      s += `<text x="${pad.l - 8}" y="${pad.t + ih - 1}" text-anchor="end" font-family="var(--font-mono)"
              font-size="9" fill="var(--c-text3)">Jahr</text>`;
      if (vj) s += `<path d="${linie(vj, m.perMax)}" fill="none" stroke="var(--c-text3)" stroke-width="1"
                      opacity="0.45" stroke-dasharray="4 3"/>`;
      s += `<path d="${linie(ist, this._perMaxAktiv())}" fill="none" stroke="var(--c-red)" stroke-width="1.5"/>`;
      s += `<rect x="${xf(this._von).toFixed(1)}" y="${pad.t}"
              width="${Math.max(2, xf(this._bis) - xf(this._von)).toFixed(1)}" height="${ih}"
              fill="var(--c-blue)" opacity="0.15" stroke="var(--c-blue)" rx="2" pointer-events="none"/>`;

      const marken = m.perTyp === 'woche' ? [1, 14, 27, 40, 52] : [1, 4, 7, 10, 12];
      marken.forEach(p => {
        if (p > m.perMax) return;
        s += `<text x="${xf(p).toFixed(1)}" y="${hoehe - 2}" text-anchor="middle" font-family="var(--font-mono)"
                font-size="9" fill="var(--c-text3)">${m.perTyp === 'woche' ? 'KW ' + p : MONATE[p - 1]}</text>`;
      });
      s += `<rect id="brush-flaeche" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}"
              fill="transparent" style="cursor:ew-resize"/>`;
      s += `</svg>`;

      this._$('brush').outerHTML = s;
      const svg = this._$('brush');
      this._brushGeo = { svg, breite, pad, iw };
      svg.querySelector('#brush-flaeche').addEventListener('mousedown', (ev) => {
        this._brushStart = this._brushPeriode(ev);
        ev.preventDefault();
      }, { signal: this._ac.signal });
    }

    _brushPeriode(ev) {
      const geo = this._brushGeo;
      const m = this._modell;
      if (!geo) return 1;
      const r = geo.svg.getBoundingClientRect();
      const x = (ev.clientX - r.left) * (geo.breite / Math.max(1, r.width));
      const p = Math.round(((x - geo.pad.l) / geo.iw) * (m.perMax - 1) + 1);
      return Math.min(this._perMaxAktiv(), Math.max(1, p));
    }

    // ── Abweichungsdiagramm ────────────────────────────────────────────
    _renderDelta() {
      const svg = this._$('chart-delta');
      const halter = svg.parentElement;
      const breite = Math.max(260, halter.clientWidth || 420);
      const hoehe = 196, pad = { l: 46, r: 10, t: 12, b: 22 };
      const iw = breite - pad.l - pad.r, ih = hoehe - pad.t - pad.b;

      const daten = this._serien();
      const serien = daten.serien.filter(s => s.art === 'ist');
      const P = daten.punkte, n = P.length;

      const werteJeSerie = serien.map(s => s.werte.map((v, i) => {
        const vj = s.werteVj ? s.werteVj[i] : null;
        return (v == null || !vj) ? null : (v - vj) / vj * 100;
      }));

      const alle = werteJeSerie.flat().filter(v => v != null);
      const g = Math.max(10, ...alle.map(Math.abs));
      const ticks = this._ticks(-g, g, 4);
      const yMin = ticks[0], yMax = ticks[ticks.length - 1];
      const yf = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
      const feld = iw / Math.max(1, n);
      const bw = Math.max(2, (feld * 0.7) / Math.max(1, serien.length));

      let s = `<svg id="chart-delta" viewBox="0 0 ${breite} ${hoehe}" width="${breite}" height="${hoehe}"
                    xmlns="http://www.w3.org/2000/svg" role="img">`;
      for (const t of ticks) {
        const y = yf(t);
        s += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${breite - pad.r}" y2="${y.toFixed(1)}"
                stroke="${Math.abs(t) < 0.001 ? 'var(--c-border2)' : 'var(--c-border)'}"/>`;
        s += `<text x="${pad.l - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-family="var(--font-mono)"
                font-size="10" fill="var(--c-text3)">${(t > 0 ? '+' : '') + nf0.format(t)}</text>`;
      }

      const jeder = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 34))));
      P.forEach((p, i) => {
        serien.forEach((serie, gi) => {
          const v = werteJeSerie[gi][i];
          if (v == null) return;
          const mitte = pad.l + feld * (i + 0.5);
          const x = mitte - (serien.length * bw) / 2 + gi * bw;
          const y0 = yf(0), y1 = yf(v);
          const farbe = serien.length === 1
            ? (v >= 0 ? 'var(--c-green)' : 'var(--c-red-light)')
            : serie.farbe;
          s += `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}"
                  height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="1.5" fill="${farbe}" opacity="0.9">
                  <title>${esc(serie.name)} · ${esc(p.label)}: ${esc(proz(v))}</title></rect>`;
        });
        if (i % jeder === 0 || i === n - 1) {
          s += `<text x="${(pad.l + feld * (i + 0.5)).toFixed(1)}" y="${hoehe - 7}" text-anchor="middle"
                  font-family="var(--font-mono)" font-size="9" fill="var(--c-text3)">${esc(p.kurz)}</text>`;
        }
      });
      s += `</svg>`;

      svg.outerHTML = s;

      const gesamt = serien.reduce((a, se) => a + se.werte.reduce((x, v) => x + (v || 0), 0), 0);
      const gesamtVj = serien.reduce((a, se) => a + (se.werteVj || []).reduce((x, v) => x + (v || 0), 0), 0);
      this._$('delta-sub').textContent = gesamtVj
        ? 'Zeitraum gesamt ' + proz((gesamt - gesamtVj) / gesamtVj * 100)
        : 'Kein Vorjahr im Datenausschnitt';
    }

    // ── Niederlassungstabelle ──────────────────────────────────────────
    _renderTabelle() {
      const m = this._modell;
      const wareFilter = { gf: this._gf, hwg: this._hwg, produkt: this._produkt };
      const bereichIst = summe(reihe(m, wareFilter, m.aktJahr), this._von, this._bis);
      const bereichVj = m.vjJahr ? summe(reihe(m, wareFilter, m.vjJahr), this._von, this._bis) : null;
      const nls = this._sichtbareNl();
      const avg = nls.length ? bereichIst / nls.length : 0;

      let zeilen = nls.map(n => {
        const ist = summe(reihe(m, this._filterWare(n.key), m.aktJahr), this._von, this._bis);
        const vj = m.vjJahr ? summe(reihe(m, this._filterWare(n.key), m.vjJahr), this._von, this._bis) : null;
        return {
          key: n.key, name: n.text, menge: ist,
          delta: vj ? (ist - vj) / vj * 100 : null,
          index: avg ? ist / avg * 100 : null,
          anteil: bereichIst ? ist / bereichIst * 100 : 0,
        };
      });

      const feld = this._sortFeld;
      zeilen.sort((a, b) => {
        if (feld === 'name') return a.name.localeCompare(b.name, 'de') * (this._sortRichtung > 0 ? 1 : -1);
        const va = a[feld] ?? -Infinity, vb = b[feld] ?? -Infinity;
        return (va - vb) * this._sortRichtung;
      });

      this._$('nl-tabelle-body').innerHTML = zeilen.map(z => {
        const aktiv = this._nlAuswahl.has(z.key);
        const idxBreite = z.index == null ? 0 : Math.min(50, Math.abs(z.index - 100) * 0.8);
        return `
          <tr data-nl="${esc(z.key)}" class="${this._nlAuswahl.size && !aktiv ? 'aus' : ''}"
              title="Klicken blendet die Niederlassung im Diagramm ein oder aus">
            <td><div class="z-name">
              <span class="z-punkt" style="background:${aktiv ? this._nlFarbe(z.key) : 'var(--c-bg4)'}"></span>
              ${esc(z.name)}</div></td>
            <td>${nfKurz(z.menge)}</td>
            <td class="${klasseVorzeichen(z.delta)}">${z.delta == null ? '–' : proz(z.delta)}</td>
            <td><div class="idx-zelle">
              <span class="${z.index == null ? 'neutral' : z.index >= 100 ? 'pos' : 'neg'}">${z.index == null ? '–' : nf0.format(z.index)}</span>
              <span class="idx-bar"><span style="width:${idxBreite}%;
                left:${(z.index || 100) >= 100 ? '50%' : (50 - idxBreite) + '%'};
                background:${(z.index || 100) >= 100 ? 'var(--c-green)' : 'var(--c-red-light)'}"></span></span>
            </div></td>
            <td>${nf1.format(z.anteil)} %</td>
          </tr>`;
      }).join('');

      this._shadow.querySelectorAll('#nl-tabelle th').forEach(th => {
        const aktiv = th.dataset.sort === this._sortFeld;
        th.classList.toggle('sortiert', aktiv);
        const basis = th.textContent.replace(/[▲▼]/g, '').trim();
        th.textContent = aktiv ? basis + ' ' + (this._sortRichtung < 0 ? '▼' : '▲') : basis;
      });

      this._$('nl-tabelle-body').querySelectorAll('[data-nl]').forEach(tr => {
        tr.addEventListener('click', () => this._toggleNl(tr.dataset.nl), { signal: this._ac.signal });
      });

      this._$('tab-sub').textContent = bereichVj != null
        ? `Ø je Niederlassung ${nfKurz(avg)}`
        : `${zeilen.length} Niederlassungen`;
    }

    // ── Info-Ansicht ───────────────────────────────────────────────────

    // GitHub-Blob-Links zeigen auf eine HTML-Seite und lassen sich nicht
    // einbetten. Für PDFs ist die Pages-URL (…github.io/…) die zuverlässigste
    // Quelle, raw.githubusercontent liefert das Dokument als Download.
    _normalisiereUrl(url) {
      if (!url) return '';
      const blob = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
      if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
      return url;
    }

    _ladeInfoDokument() {
      const url = this._normalisiereUrl(this._infoPdfUrl);
      const rahmen = this._$('info-rahmen');
      const hinweis = this._$('info-hinweis');
      const link = this._$('info-extern');

      this._$('info-titel').textContent = this._infoTitel || 'Dokumentation';
      this._$('info-quelle').textContent = url ? url.replace(/^https?:\/\//, '') : '';

      if (!url) {
        rahmen.removeAttribute('src');
        link.style.display = 'none';
        hinweis.classList.add('sichtbar');
        this._$('info-hinweis-text').textContent =
          'Es ist noch keine Dokumentation hinterlegt. Die PDF-Adresse wird im Designer über die Eigenschaft "infoPdfUrl" gesetzt – am besten als GitHub-Pages-Link, damit das Dokument direkt angezeigt werden kann.';
        return;
      }

      link.style.display = '';
      link.href = url;
      hinweis.classList.remove('sichtbar');
      rahmen.src = url + (url.includes('#') ? '' : '#view=FitH');

      // Eingebettete PDFs scheitern je nach Browser und Portal still. Wenn nach
      // kurzer Zeit nichts geladen ist, blenden wir den Ausweichhinweis ein.
      clearTimeout(this._infoTimer);
      this._infoGeladen = false;
      rahmen.addEventListener('load', () => { this._infoGeladen = true; }, { once: true });
      this._infoTimer = setTimeout(() => {
        if (!this._infoGeladen) {
          hinweis.classList.add('sichtbar');
          this._$('info-hinweis-text').textContent =
            'Das Dokument konnte nicht eingebettet werden. Manche Browser und Portalkonfigurationen blockieren eingebettete PDFs – über "In neuem Tab öffnen" lässt es sich trotzdem anzeigen.';
        }
      }, 4000);
    }

    // ── Gesamtrendering ────────────────────────────────────────────────

    _renderToolbar() {
      const m = this._modell;

      const gfSel = this._$('f-gf');
      const gfWert = this._gf ?? '';
      gfSel.innerHTML = `<option value="">Alle Bereiche</option>` +
        m.gfListe.map(g => `<option value="${esc(g.key)}">${esc(g.text)}</option>`).join('');
      gfSel.value = gfWert;

      const zSel = this._$('f-zeitraum');
      const w = m.perTyp === 'woche';
      const optionen = [
        ['ytd', 'Laufendes Jahr'],
        ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4'],
        ['h1', '1. Halbjahr'], ['h2', '2. Halbjahr'],
        ['letzte', w ? 'Letzte 13 Wochen' : 'Letzte 3 Monate'],
      ];
      if (zSel.options.length !== optionen.length + 1) {
        zSel.innerHTML = optionen.map(([k, t]) => `<option value="${k}">${t}</option>`).join('') +
          `<option value="frei">Freie Auswahl</option>`;
      }
      zSel.value = this._zeitraum;

      this._shadow.querySelectorAll('#seg-modus button').forEach(b =>
        b.classList.toggle('active', b.dataset.modus === this._modus));
      this._shadow.querySelectorAll('#seg-raster button').forEach(b =>
        b.classList.toggle('active', b.dataset.raster === this._raster));

      // Raster nur sinnvoll, wenn die Query Wochen liefert
      const zeigeRaster = m.perTyp === 'woche';
      this._$('seg-raster').style.display = zeigeRaster ? '' : 'none';
      this._$('lbl-raster').style.display = zeigeRaster ? '' : 'none';

      const swD = this._$('sw-durchschnitt');
      swD.classList.toggle('an', this._zeigeDurchschnitt);
      swD.classList.toggle('aus', !this._zeigeDurchschnitt);

      const swV = this._$('sw-vorjahr');
      const vjMoeglich = !!m.vjJahr && this._serienNl().length <= 2 && this._modus !== 'delta';
      swV.disabled = !vjMoeglich;
      swV.classList.toggle('an', this._zeigeVorjahr && vjMoeglich);
      swV.classList.toggle('aus', !(this._zeigeVorjahr && vjMoeglich));
      swV.title = !m.vjJahr ? 'Die Datenquelle liefert kein Vorjahr'
        : this._modus === 'delta' ? 'Die Ansicht Δ Vorjahr vergleicht bereits mit dem Vorjahr'
        : this._serienNl().length > 2 ? 'Vorjahreskurven werden bis zu zwei ausgewählten Niederlassungen gezeigt'
        : 'Vorjahreskurve der ausgewählten Niederlassungen';

      const stand = m.aktJahr
        ? `${m.aktJahr}${m.vjJahr ? ' vs. ' + m.vjJahr : ''} · ${m.perTyp === 'woche' ? 'KW ' + this._perMaxAktiv() : MONATE[this._perMaxAktiv() - 1]}`
        : '';
      this._$('header-meta').textContent = stand;
    }

    _renderCharts() {
      if (!this._modell.knoten.size) return;
      this._renderChart();
      this._renderBrush();
      this._renderDelta();
    }

    _render() {
      try {
        this._renderIntern();
      } catch (err) {
        // Ein Renderfehler darf weder SAC blockieren noch als endlose
        // Ladeanimation erscheinen.
        console.error('[Verlauf] Fehler beim Rendern', err);
        this._stopWatchdog();
        this._showEmpty('Die Auswertung konnte nicht dargestellt werden. Details stehen in der Browserkonsole.');
      }
    }

    _renderIntern() {
      const m = this._modell;

      if (!m.knoten.size) {
        this._renderToolbar();
        return;
      }

      this._hideLoading();
      this._hideEmpty();

      // Zoomgrenzen an das Modell anpassen
      const max = this._perMaxAktiv();
      if (this._bis > max) this._bis = max;
      if (this._von > this._bis) this._von = 1;

      this._renderToolbar();
      this._renderSidebar();

      this._$('kontext-titel').textContent = this._kontextName();
      const nlText = this._nlAuswahl.size
        ? [...this._nlAuswahl].map(k => (m.nlListe.find(n => n.key === k) || {}).text ?? k).join(' · ')
        : 'alle Niederlassungen';
      this._$('kontext-sub').textContent = nlText;

      this._renderKPIs();
      this._renderCharts();
      this._renderTabelle();
    }

    // ── Data Binding ───────────────────────────────────────────────────
    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;

      if (!dataBinding) {
        this._stopWatchdog();
        this._showEmpty('Dem Widget ist keine Datenquelle zugewiesen. Im Designer unter "Datenquelle" eine Query auswählen und die Feeds befüllen.');
        return;
      }

      if (dataBinding.state === 'error') {
        this._stopWatchdog();
        const meldung = (dataBinding.error && (dataBinding.error.description || dataBinding.error.message)) || '';
        console.error('[Verlauf] Datenquelle meldet einen Fehler', dataBinding.error);
        this._showEmpty('Die Datenquelle meldet einen Fehler' + (meldung ? ': ' + meldung : '') +
          '. Bei Live-Verbindungen zum BW liegt die Ursache meist in der Verbindung selbst, nicht im Widget.');
        return;
      }

      // Manche Umgebungen liefern kein state-Feld, sondern nur data.
      const fertig = dataBinding.state === 'success' ||
                     (dataBinding.state == null && Array.isArray(dataBinding.data));
      if (!fertig) {
        this._showLoading();
        this._startWatchdog();
        return;
      }

      this._stopWatchdog();

      const rows = Array.isArray(dataBinding.data) ? dataBinding.data : [];
      console.info(`[Verlauf] myDataSource: ${rows.length} Rows empfangen`);

      try {
        this._modell = parseRows(rows, this._periodenTyp);
      } catch (err) {
        // Ein Parserfehler darf das Widget nicht dauerhaft im Ladezustand lassen
        console.error('[Verlauf] Fehler beim Auswerten der Datenquelle', err);
        this._modell = parseRows(null);
        this._showEmpty('Die Datenquelle konnte nicht ausgewertet werden. Bitte Feeds im Designer prüfen.');
        return;
      }

      if (!this._modell.knoten.size) {
        this._showEmpty(`Die Datenquelle hat ${rows.length} Zeilen geliefert, davon war keine auswertbar. ` +
          'Erwartet werden ein Zeitmerkmal (0CALMONTH, 0CALWEEK oder 0CALDAY) im Feed "dimension_periode" und eine Kennzahl im Feed "value_menge".');
        this._renderToolbar();
        return;
      }

      // Auswahl gegen das neue Modell validieren
      if (this._gf && !this._modell.gfListe.some(g => g.key === this._gf)) this._gf = null;
      if (this._hwg && !this._modell.hwgListe.some(h => h.key === this._hwg)) { this._hwg = null; this._produkt = null; }
      if (this._produkt && !this._modell.produktListe.some(p => p.key === this._produkt)) this._produkt = null;
      for (const k of [...this._nlAuswahl]) {
        if (!this._modell.nlListe.some(n => n.key === k)) this._nlAuswahl.delete(k);
      }

      this._setZeitraumPreset(this._zeitraum === 'frei' ? 'ytd' : this._zeitraum);
      this._render();
    }

    get myDataSource() { return this._dataBinding; }

    // ── Properties ─────────────────────────────────────────────────────
    set theme(v) { this._theme = (v === 'dark') ? 'dark' : 'light'; this._applyTheme(); }
    get theme() { return this._theme; }

    set periodenTyp(v) {
      const neu = ['auto', 'woche', 'monat'].includes(v) ? v : 'auto';
      if (neu === this._periodenTyp) return;
      this._periodenTyp = neu;
      if (this._dataBinding) this.myDataSource = this._dataBinding;
    }
    get periodenTyp() { return this._periodenTyp; }

    set defaultModus(v) { if (['absolut', 'index', 'delta'].includes(v)) { this._modus = v; this._render(); } }
    get defaultModus() { return this._modus; }

    set defaultZeitraum(v) { this._setZeitraumPreset(v || 'ytd'); this._render(); }
    get defaultZeitraum() { return this._zeitraum; }

    set zeigeDurchschnitt(v) { this._zeigeDurchschnitt = !!v; this._render(); }
    get zeigeDurchschnitt() { return this._zeigeDurchschnitt; }

    set zeigeVorjahr(v) { this._zeigeVorjahr = !!v; this._render(); }
    get zeigeVorjahr() { return this._zeigeVorjahr; }

    set maxSerien(v) {
      const n = parseInt(v, 10);
      this._maxSerien = Number.isFinite(n) ? Math.min(NL_FARBEN.length, Math.max(1, n)) : 6;
      this._render();
    }
    get maxSerien() { return this._maxSerien; }

    set infoPdfUrl(v) {
      this._infoPdfUrl = typeof v === 'string' ? v.trim() : '';
      if (this._$('view-info').classList.contains('active')) this._ladeInfoDokument();
    }
    get infoPdfUrl() { return this._infoPdfUrl; }

    set infoTitel(v) { this._infoTitel = v || 'Dokumentation'; }
    get infoTitel() { return this._infoTitel; }

    // Gewählte Werte für Story-Skripte lesbar machen.
    //
    // WICHTIG: SAC weist beim Initialisieren *jede* im Manifest deklarierte
    // Property als Feld auf dem Element zu – auch die, die nur gelesen werden
    // sollen. Ein reiner Getter führt dabei im Strict Mode zu
    // "Cannot set property X which has only a getter"; SAC bricht den
    // Initialisierungslauf ab und ruft myDataSource nie auf – das Widget
    // bliebe dauerhaft im Ladezustand. Deshalb hat jede dieser Properties
    // einen Setter, der den zugewiesenen Wert bewusst verwirft.
    get selektierteHwg() { return this._hwg ?? ''; }
    set selektierteHwg(_) { /* nur lesend – Zuweisung von SAC wird ignoriert */ }

    get selektiertesProdukt() { return this._produkt ?? ''; }
    set selektiertesProdukt(_) { /* nur lesend */ }

    // Als kommaseparierte Liste, damit der Wert im Designer als String-Property lesbar ist
    get selektierteNiederlassungen() { return [...this._nlAuswahl].join(','); }
    set selektierteNiederlassungen(_) { /* nur lesend – zum Setzen dient setNiederlassungen() */ }

    get zeitraumVon() { return this._von; }
    set zeitraumVon(_) { /* nur lesend – zum Setzen dient setZoom() */ }

    get zeitraumBis() { return this._bis; }
    set zeitraumBis(_) { /* nur lesend */ }

    // ── Methoden ───────────────────────────────────────────────────────
    refreshData() { if (this._dataBinding) this.myDataSource = this._dataBinding; }

    setTheme(theme) { this.theme = theme; }

    setModus(modus) { this.defaultModus = modus; }

    setZeitraum(id) { this.defaultZeitraum = id; }

    setZoom(von, bis) {
      const max = this._perMaxAktiv();
      const a = Math.max(1, Math.min(max, parseInt(von, 10) || 1));
      const b = Math.max(a, Math.min(max, parseInt(bis, 10) || max));
      this._von = a; this._bis = b; this._zeitraum = 'frei';
      this._render();
    }

    resetZoom() { this._setZeitraumPreset('ytd'); this._render(); }

    setBereich(gf) {
      this._gf = gf || null;
      this._hwg = null; this._produkt = null; this._nlAuswahl.clear();
      this._render();
    }

    setHwg(hwg) {
      this._hwg = hwg || null;
      if (this._hwg) this._offeneHwg.add(this._hwg);
      this._produkt = null;
      this._render();
    }

    setProdukt(produkt) {
      this._produkt = produkt || null;
      if (this._produkt) {
        const p = this._modell.produktListe.find(x => x.key === this._produkt);
        if (p) { this._hwg = p.hwg; this._offeneHwg.add(p.hwg); }
      }
      this._render();
    }

    setNiederlassungen(liste) {
      const arr = Array.isArray(liste) ? liste : String(liste || '').split(',').map(s => s.trim()).filter(Boolean);
      this._nlAuswahl = new Set(arr.slice(0, this._maxSerien));
      this._render();
    }

    showInfo() { this._switchView('info'); this._ladeInfoDokument(); }

    showAnalyse() { this._switchView('analyse'); }

    // ── SAC-Lifecycle ──────────────────────────────────────────────────
    onCustomWidgetBeforeUpdate(changedProperties) { this._changed = changedProperties; }

    onCustomWidgetAfterUpdate(changedProperties) {
      try { this._propsUebernehmen(changedProperties || this._changed || {}); }
      catch (err) { console.error('[Verlauf] Fehler beim Übernehmen der Properties', err); }
      this._changed = null;
    }

    _propsUebernehmen(c) {
      if ('theme' in c) this.theme = c.theme;
      if ('periodenTyp' in c) this.periodenTyp = c.periodenTyp;
      if ('defaultModus' in c) this.defaultModus = c.defaultModus;
      if ('defaultZeitraum' in c) this.defaultZeitraum = c.defaultZeitraum;
      if ('zeigeDurchschnitt' in c) this.zeigeDurchschnitt = c.zeigeDurchschnitt;
      if ('zeigeVorjahr' in c) this.zeigeVorjahr = c.zeigeVorjahr;
      if ('maxSerien' in c) this.maxSerien = c.maxSerien;
      if ('infoPdfUrl' in c) this.infoPdfUrl = c.infoPdfUrl;
      if ('infoTitel' in c) this.infoTitel = c.infoTitel;
    }

    onCustomWidgetResize() { this._renderCharts(); }

    onCustomWidgetDestroy() {
      this._ac.abort();
      clearTimeout(this._suchTimer);
      clearTimeout(this._resizeTimer);
      clearTimeout(this._infoTimer);
    }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, VerlaufWidget);
  }
})();
