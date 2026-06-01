// ═══════════════════════════════════════════════════════════════════════════
//  SAP Custom Widget – Wareneingang Tracker
//  Version 1.0.0 – Vollständig (alle 4 Schritte)
//
//  Views:
//    1. Kacheln  – TE-Übersicht mit Status, Fortschritt, Δ-Zeit  ✅
//    2. Detail   – Zeitstrahl + Produkttabelle für eine TE        ✅
//    3. Gantt    – Tagesübersicht aller TEs (Soll vs. Ist)        ✅
//
//  Neu in Schritt 4:
//    • Gantt-Zeitstrahl: dynamische Achse, Soll- und Ist-Balken
//    • Stunden-Ticks, vertikale Gitterlinien, Jetzt-Linie
//    • Farbkodierung nach Verzögerungsgrad (grün/gelb/rot)
//    • Klick auf Ist-Balken oder Zeile → Detail-View
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Konstanten ───────────────────────────────────────────────────────────

  const TAG = 'we-eingang-widget';

  // BW liefert Timestamps als ISO-String oder SAP-internes Format.
  // Null-Werte die BW zurückgeben kann:
  const NULL_TOKENS = new Set(['', '00000000', '000000000000', '@NullMember', '@TotalMembers', 'null', 'undefined']);

  // Echte Tor→Hallen-Zuordnung (T001–T999, nicht fortlaufend)
  // T001 = Sondertor (Pförtner/Büro), kein HA-Präfix
  const TOR_HALLE_MAP = {
      "T001":"0001","T002":"HA01","T003":"HA01","T004":"HA01","T005":"HA01",
      "T006":"HA01","T007":"HA01","T010":"HA01","T011":"HA01","T012":"HA01",
      "T013":"HA01","T014":"HA01","T015":"HA01","T016":"HA01","T017":"HA01",
      "T018":"HA01","T019":"HA01","T020":"HA02","T021":"HA02","T022":"HA02",
      "T023":"HA02","T024":"HA02","T025":"HA02","T026":"HA02","T027":"HA02",
      "T028":"HA02","T029":"HA02","T030":"HA02","T040":"HA04","T041":"HA04",
      "T042":"HA04","T043":"HA04","T044":"HA04","T045":"HA04","T046":"HA04",
      "T047":"HA04","T048":"HA04","T049":"HA04","T050":"HA05","T051":"HA05",
      "T052":"HA05","T053":"HA05","T054":"HA05","T055":"HA05","T056":"HA05",
      "T057":"HA05","T058":"HA05","T059":"HA05","T060":"HA06","T061":"HA06",
      "T062":"HA06","T063":"HA06","T064":"HA06","T065":"HA06","T066":"HA06",
      "T067":"HA06","T068":"HA06","T069":"HA06","T070":"HA06","T071":"HA07",
      "T072":"HA07","T073":"HA07","T074":"HA07","T080":"HA08","T081":"HA08",
      "T082":"HA08","T083":"HA08","T084":"HA08","T085":"HA08","T086":"HA08",
      "T087":"HA08","T088":"HA08","T089":"HA08","T090":"HA08","T091":"HA09",
      "T092":"HA09","T093":"HA09","T094":"HA09","T095":"HA09","T096":"HA09",
      "T097":"HA09","T098":"HA09","T099":"HA09","T110":"HA09","T111":"HA09",
      "T112":"HA09","T113":"HA09","T114":"HA09","T115":"HA09","T116":"HA09",
      "T117":"HA09","T118":"HA09","T175":"HA07","T176":"HA07","T177":"HA07",
      "T178":"HA07","T721":"HA07","T722":"HA07","T723":"HA07","T724":"HA07",
      "T725":"HA07","T726":"HA07","T727":"HA07","T728":"HA07","T960":"HA10",
      "T961":"HA10","T962":"HA10","T963":"HA10","T964":"HA10","T965":"HA10",
      "T999":"HA01"
    };

  // Hallen-Reihenfolge für Accordion (ohne 0001-Sondertor)
  const HALLEN_REIHENFOLGE = ['HA01','HA02','HA04','HA05','HA06','HA07','HA08','HA09','HA10'];

  // Halle → alle zugehörigen Tore (aus TOR_HALLE_MAP abgeleitet)
  const HALLE_TORE_MAP = {};
  for (const [tor, halle] of Object.entries(TOR_HALLE_MAP)) {
    if (!HALLE_TORE_MAP[halle]) HALLE_TORE_MAP[halle] = [];
    HALLE_TORE_MAP[halle].push(tor);
  }

  // Prozessschritte in chronologischer Reihenfolge – Reihenfolge ist wichtig
  // für Fortschrittsbalken-Berechnung
  const PROZESS_SCHRITTE = [
    { id: 'ts_ankunft',       label: 'Ankunft' },
    { id: 'ts_angedockt',     label: 'Angedockt' },
    { id: 'ts_entladen_start',label: 'Entladen ▶' },
    { id: 'ts_entladen_ende', label: 'Entladen ■' },
    { id: 'ts_we_buchung',    label: 'WE-Buchung' },
    { id: 'ts_abfahrt',       label: 'Abfahrt' },
  ];

  // Verzögerungsschwellwert in Minuten – ab wann eine TE als "verzögert" gilt
  const VERZOEGERUNG_SCHWELLE_MIN = 30;

  // ── Helper ───────────────────────────────────────────────────────────────

  // XSS-Schutz für alle BW-Dimension-Inhalte die in innerHTML landen
  const esc = (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const isNull = (v) => v == null || NULL_TOKENS.has(String(v).trim());

  // Parst einen Timestamp aus BW – gibt ein Date-Objekt zurück oder null
  const parseTs = (raw) => {
    if (isNull(raw)) return null;
    const s = String(raw).trim();
    // ISO 8601: "2025-05-20T07:37:00" oder "2025-05-20 07:37:00"
    const iso = new Date(s.replace(' ', 'T'));
    if (!isNaN(iso.getTime())) return iso;
    // SAP-Format: "20250520073700" (YYYYMMDDHHmmss)
    if (/^\d{14}$/.test(s)) {
      return new Date(
        +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
        +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)
      );
    }
    // SAP-Datum ohne Zeit: "20250520" → Mitternacht
    if (/^\d{8}$/.test(s)) {
      return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    }
    return null;
  };

  // Formatiert ein Date-Objekt als "HH:MM" Uhrzeit
  const fmtTime = (d) => {
    if (!d) return '–';
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  // Formatiert ein Date-Objekt als "DD.MM.YYYY"
  const fmtDate = (d) => {
    if (!d) return '–';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Berechnet Differenz zweier Date-Objekte in Minuten (kann negativ sein)
  const diffMin = (a, b) => {
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 60000);
  };

  // Formatiert Minuten als lesbare Zeitdauer: "1h 23min" oder "45min"
  const fmtDauer = (min) => {
    if (min == null) return '–';
    const abs = Math.abs(min);
    const sign = min < 0 ? '−' : '+';
    if (abs < 60) return `${sign}${abs}min`;
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}min`;
  };

  // Formatiert eine Zahl mit deutschem Tausender-Trennzeichen
  const fmtNum = (x) => Math.round(Number(x || 0)).toLocaleString('de-DE');

  // SAC liefert Felder als { id: "...", label: "..." } mit _0-Suffix.
  // Diese Funktion normalisiert einen Rohwert auf einen primitiven String.
  const extractVal = (v) => {
    if (v == null) return null;
    // SAC-Objekt: { id, label } → id bevorzugen (technischer Wert)
    if (typeof v === 'object' && 'id' in v) return String(v.id).trim();
    return String(v).trim();
  };

  // Liest einen Dimension-Wert aus einer BW-Datenzeile.
  // Versucht jeden Key sowohl mit _0-Suffix (SAC) als auch direkt (Fallback).
  const readDim = (row, ...keys) => {
    for (const key of keys) {
      for (const k of [`${key}_0`, key]) {
        const raw = extractVal(row[k]);
        if (!isNull(raw)) return raw;
      }
    }
    return null;
  };

  // Liest einen Measure-Wert aus einer BW-Datenzeile.
  // SAC liefert Measures als { raw: 144, formatted: "144" }.
  const readVal = (row, ...keys) => {
    for (const key of keys) {
      for (const k of [`${key}_0`, key]) {
        const v = row[k];
        if (v == null) continue;
        const num = (typeof v === 'object' && 'raw' in v) ? v.raw : v;
        if (num != null && !isNull(String(num))) return Number(num);
      }
    }
    return null;
  };

  // ── Daten-Parser ─────────────────────────────────────────────────────────
  //
  // Wandelt flache BW-Rows (eine Zeile pro Produkt pro TE) in ein
  // strukturiertes Map-Objekt um: { teNr → TEObjekt }
  //
  // TEObjekt:
  //   te, teHinweis, liefernummer, bestellnummer,
  //   lieferantNr, lieferantName, transportmittel, halle,
  //   geplantStart: Date, geplantEnde: Date,
  //   tsAnkunft: Date, tsAngedockt: Date,
  //   tsEntladenStart: Date, tsEntladenEnde: Date, tsEntladenTat: Date,
  //   tsWeBuchung: Date, tsAbfahrt: Date,
  //   produkte: [ { nr, name, menge, einheit, halle, tsEinlagerung: Date } ],
  //   // Berechnete Felder (nach parseTEs() befüllt):
  //   status: 'erwartet'|'ankunft'|'entladen'|'eingelagert'|'abgefahren'|'verzögert'
  //   verzoegerungMin: Number|null,
  //   fortschritt: 0–6 (Anzahl abgeschlossener Schritte)

  function parseRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return new Map();

    const teMap = new Map();

    for (const row of rows) {
      // ── TE-Stammdaten ──
      const teNr = readDim(row,
        'dimension_te', 'TE', 'VBELN', 'te_nr'
      );
      if (!teNr) continue;

      if (!teMap.has(teNr)) {
        teMap.set(teNr, {
          te:              teNr,
          teHinweis:       readDim(row, 'dimension_te_hinweis', 'TE_HINWEIS'),
          ladestelle:      readDim(row, 'dimension_ladestelle') ?? 'Landverkehr',
          tor:             readDim(row, 'dimension_tor'),
          liefernummer:    readDim(row, 'dimension_liefernummer', 'LIFNR'),
          bestellnummer:   readDim(row, 'dimension_bestellnummer', 'EBELN'),
          lieferantNr:     readDim(row, 'dimension_lieferant_nr', 'LIFNR_NR'),
          lieferantName:   readDim(row, 'dimension_lieferant_name', 'LIFNR_NAME'),
          transportmittel: readDim(row, 'dimension_transportmittel', 'TRMIT'),
          halle:           readDim(row, 'dimension_halle', 'LGNUM'),

          // Zeitfenster (Soll)
          geplantStart:    parseTs(readDim(row, 'dimension_geplant_start')),
          geplantEnde:     parseTs(readDim(row, 'dimension_geplant_ende')),

          // Prozess-Timestamps (Ist)
          tsAnkunft:        parseTs(readDim(row, 'dimension_ts_ankunft')),
          tsAngedockt:      parseTs(readDim(row, 'dimension_ts_angedockt')),
          tsEntladenStart:  parseTs(readDim(row, 'dimension_ts_entladen_start')),
          tsEntladenEnde:   parseTs(readDim(row, 'dimension_ts_entladen_ende')),
          tsEntladenTat:    parseTs(readDim(row, 'dimension_ts_entladen_tat')),
          tsWeBuchung:      parseTs(readDim(row, 'dimension_ts_we_buchung')),
          tsAbfahrt:        parseTs(readDim(row, 'dimension_ts_abfahrt')),

          produkte:         [],

          // Berechnete Felder – werden in berechneTE() gesetzt
          status:           'erwartet',
          verzoegerungMin:  null,
          fortschritt:      0,
        });
      }

      // ── Produktzeile anhängen ──
      const te = teMap.get(teNr);
      const prodNr = readDim(row, 'dimension_produkt_nr', 'MATNR');
      if (prodNr) {
        te.produkte.push({
          nr:           prodNr,
          name:         readDim(row, 'dimension_produkt_name', 'MAKTX') ?? '–',
          menge:        readVal(row, 'value_menge', 'MENGE') ?? 0,
          einheit:      readDim(row, 'dimension_einheit', 'MEINS') ?? '',
          halle:        readDim(row, 'dimension_halle', 'LGNUM') ?? '',
          tsEinlagerung: parseTs(readDim(row, 'dimension_ts_einlagerung')),
        });
      }
    }

    // Berechnete Felder für jede TE befüllen
    for (const te of teMap.values()) {
      berechneTE(te);
    }

    return teMap;
  }

  // Berechnet Status, Fortschritt und Verzögerung für eine TE
  function berechneTE(te) {
    const jetzt = new Date();

    // ── Fortschritt: Anzahl abgeschlossener Prozessschritte ──
    const tsFelder = [
      te.tsAnkunft, te.tsAngedockt, te.tsEntladenStart,
      te.tsEntladenEnde, te.tsWeBuchung, te.tsAbfahrt,
    ];
    te.fortschritt = tsFelder.filter(ts => ts !== null).length;

    // ── Verzögerung: Differenz Soll-Start zu Ist-Entladen-Start ──
    // Kernfrage: Wie lange stand der LKW am Tor bevor entladen wurde?
    if (te.geplantStart && te.tsEntladenStart) {
      te.verzoegerungMin = diffMin(te.geplantStart, te.tsEntladenStart);
      // Negative Werte = früher als geplant → keine Verzögerung
      if (te.verzoegerungMin < 0) te.verzoegerungMin = 0;
    } else if (te.geplantStart && !te.tsEntladenStart && te.tsAngedockt) {
      // LKW ist angedockt aber Entladen hat noch nicht begonnen
      te.verzoegerungMin = diffMin(te.geplantStart, jetzt);
      if (te.verzoegerungMin < 0) te.verzoegerungMin = 0;
    }

    // ── Status ──
    if (te.tsAbfahrt) {
      te.status = 'abgefahren';
    } else if (te.tsWeBuchung) {
      te.status = 'eingelagert';
    } else if (te.tsEntladenStart) {
      te.status = te.verzoegerungMin >= VERZOEGERUNG_SCHWELLE_MIN
        ? 'verzögert'
        : 'entladen';
    } else if (te.tsAnkunft) {
      // Angedockt aber kein Entladen gestartet – prüfe ob Verzögerung
      if (te.verzoegerungMin != null && te.verzoegerungMin >= VERZOEGERUNG_SCHWELLE_MIN) {
        te.status = 'verzögert';
      } else {
        te.status = 'ankunft';
      }
    } else {
      te.status = 'erwartet';
    }
  }

  // ── Template ─────────────────────────────────────────────────────────────

  const template = document.createElement('template');
  template.innerHTML = /* html */`
    <style>
      /* ════════════════════════════════════════════════════════════
         Design Tokens — Dark Theme (Standard)
         Überschrieben durch :host([theme="light"])
      ════════════════════════════════════════════════════════════ */
      :host {
        /* Markenfarbe */
        --c-red:        #c0392b;
        --c-red-light:  #e74c3c;
        --c-red-dim:    rgba(192, 57, 43, 0.14);
        --c-red-border: rgba(192, 57, 43, 0.35);

        /* Status-Farben */
        --c-green:      #27ae60;
        --c-green-dim:  rgba(39, 174, 96, 0.14);
        --c-yellow:     #f39c12;
        --c-yellow-dim: rgba(243, 156, 18, 0.14);
        --c-blue:       #2980b9;
        --c-blue-dim:   rgba(41, 128, 185, 0.14);

        /* Dark-Theme Hintergründe */
        --c-bg:         #0f1117;
        --c-bg2:        #161a24;
        --c-bg3:        #1e2335;
        --c-bg4:        #252b3d;

        /* Dark-Theme Texte */
        --c-text:       #e8eaf0;
        --c-text2:      #8b90a0;
        --c-text3:      #555b6e;

        /* Dark-Theme Ränder */
        --c-border:     rgba(255, 255, 255, 0.07);
        --c-border2:    rgba(255, 255, 255, 0.13);

        /* Schatten */
        --shadow-sm:    0 2px 8px  rgba(0, 0, 0, 0.35);
        --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.45);
        --shadow-lg:    0 8px 40px rgba(0, 0, 0, 0.55);

        /* Typografie */
        --font:         'Segoe UI', system-ui, -apple-system, sans-serif;
        --font-mono:    'Consolas', 'Cascadia Code', 'Courier New', monospace;

        /* Radien */
        --r-sm:   4px;
        --r-md:   8px;
        --r-lg:   12px;

        /* Transitions */
        --ease:   cubic-bezier(0.16, 1, 0.3, 1);

        display: block;
        width:   100%;
        height:  100%;
        box-sizing: border-box;
        font-family: var(--font);
        font-size: 13px;
        color: var(--c-text);
        background: var(--c-bg);
      }

      /* ────────────────────────────────────────────────────────────
         Light Theme Override
      ──────────────────────────────────────────────────────────── */
      :host([theme="light"]) {
        --c-bg:         #f5f6f8;
        --c-bg2:        #ffffff;
        --c-bg3:        #f0f2f5;
        --c-bg4:        #e8eaee;
        --c-text:       #1a1d23;
        --c-text2:      #4a5060;
        --c-text3:      #8b90a0;
        --c-border:     rgba(0, 0, 0, 0.08);
        --c-border2:    rgba(0, 0, 0, 0.14);
        --shadow-sm:    0 2px 8px  rgba(0, 0, 0, 0.07);
        --shadow-md:    0 4px 16px rgba(0, 0, 0, 0.10);
        --shadow-lg:    0 8px 40px rgba(0, 0, 0, 0.14);
        background: var(--c-bg);
        color: var(--c-text);
      }

      /* ────────────────────────────────────────────────────────────
         Reset
      ──────────────────────────────────────────────────────────── */
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      button { font-family: var(--font); cursor: pointer; border: none; background: none; }

      /* ────────────────────────────────────────────────────────────
         Haupt-Layout
      ──────────────────────────────────────────────────────────── */
      .widget-root {
        display:        flex;
        flex-direction: column;
        height:         100%;
        width:          100%;
        overflow:       hidden;
        background:     var(--c-bg);
      }

      /* ── Header ── */
      .header {
        display:          flex;
        align-items:      center;
        gap:              16px;
        padding:          0 20px;
        height:           50px;
        flex-shrink:      0;
        background:       var(--c-bg2);
        border-bottom:    1px solid var(--c-border);
        position:         relative;
        z-index:          10;
      }

      /* roter Akzentstreifen oben */
      .header::before {
        content:    '';
        position:   absolute;
        top: 0; left: 0; right: 0;
        height:     3px;
        background: linear-gradient(90deg, var(--c-red), var(--c-red-light));
      }

      .header-brand {
        display:      flex;
        align-items:  center;
        gap:          8px;
        font-family:  var(--font-mono);
        font-size:    11px;
        font-weight:  600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color:        var(--c-red-light);
        flex-shrink:  0;
      }

      .header-brand-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: var(--c-red-light);
        animation: dot-pulse 2.2s ease-in-out infinite;
      }

      @keyframes dot-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.35; transform: scale(0.65); }
      }

      .header-title {
        font-size:   13px;
        font-weight: 500;
        color:       var(--c-text2);
        flex-shrink: 0;
      }

      .header-sep { flex: 1; }

      /* Live-Uhr */
      .header-clock {
        display:       flex;
        align-items:   center;
        gap:           6px;
        padding:       3px 10px;
        border-radius: var(--r-sm);
        background:    var(--c-bg3);
        border:        1px solid var(--c-border);
        font-family:   var(--font-mono);
        font-size:     12px;
        font-weight:   600;
        color:         var(--c-text2);
        flex-shrink:   0;
        letter-spacing: 0.04em;
      }

      .clock-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--c-green);
        flex-shrink: 0;
        animation: clock-blink 1s steps(2, start) infinite;
      }

      @keyframes clock-blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.25; }
      }

      /* KPI-Chips im Header */
      .kpi-strip {
        display:    flex;
        gap:        3px;
        flex-shrink: 0;
      }

      .kpi-chip {
        display:      flex;
        align-items:  center;
        gap:          5px;
        padding:      4px 10px;
        border-radius: var(--r-sm);
        font-family:  var(--font-mono);
        font-size:    10px;
        font-weight:  500;
        white-space:  nowrap;
      }

      .kpi-chip .val {
        font-size:   13px;
        font-weight: 700;
      }

      .kpi-chip.k-total   { background: var(--c-bg3);       color: var(--c-text2); }
      .kpi-chip.k-active  { background: var(--c-blue-dim);  color: #5dade2; }
      .kpi-chip.k-delayed { background: var(--c-red-dim);   color: #e74c3c; }
      .kpi-chip.k-done    { background: var(--c-green-dim); color: #58d68d; }

      /* View-Tabs */
      /* ── Navigationszeile ── */
      .navbar {
        display:       flex;
        align-items:   center;
        gap:           12px;
        padding:       0 20px;
        height:        44px;
        flex-shrink:   0;
        background:    var(--c-bg2);
        border-bottom: 1px solid var(--c-border);
      }

      .nav-tabs {
        display:    flex;
        gap:        2px;
        height:     100%;
      }

      .nav-tab {
        display:        flex;
        align-items:    center;
        gap:            7px;
        padding:        0 16px;
        height:         100%;
        font-family:    var(--font);
        font-size:      13px;
        font-weight:    500;
        color:          var(--c-text3);
        position:       relative;
        transition:     color 0.15s, background 0.15s;
        border-bottom:  2px solid transparent;
      }

      .nav-tab:hover { color: var(--c-text2); background: var(--c-bg3); }

      .nav-tab.active {
        color:         var(--c-text);
        border-bottom-color: var(--c-red);
      }

      .nav-tab.active .nav-tab-icon { color: var(--c-red-light); }

      .nav-tab-icon {
        font-size:   15px;
        color:       var(--c-text3);
        transition:  color 0.15s;
        line-height: 1;
      }

      .nav-tab-label { letter-spacing: 0.01em; }

      .nav-sep { flex: 1; }

      /* ── Live-Refresh-Steuerung ── */
      .refresh-ctrl {
        display:     flex;
        align-items: center;
        gap:         10px;
      }

      .refresh-btn {
        display:        flex;
        align-items:    center;
        gap:            7px;
        padding:        6px 13px;
        border-radius:  var(--r-sm);
        border:         1px solid var(--c-border2);
        background:     var(--c-bg3);
        color:          var(--c-text3);
        font-family:    var(--font);
        font-size:      12px;
        font-weight:    500;
        cursor:         not-allowed;
        transition:     all 0.18s var(--ease);
        opacity:        0.5;
      }

      .refresh-btn:not([disabled]) {
        cursor:       pointer;
        opacity:      1;
        background:   var(--c-red);
        border-color: var(--c-red);
        color:        #fff;
        box-shadow:   0 0 0 0 rgba(192,57,43,0.4);
        animation:    refresh-ready-pulse 2s ease-in-out infinite;
      }

      .refresh-btn:not([disabled]):hover {
        background:   var(--c-red-light);
        border-color: var(--c-red-light);
        animation:    none;
      }

      @keyframes refresh-ready-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.4); }
        50%       { box-shadow: 0 0 0 4px rgba(192,57,43,0); }
      }

      .refresh-icon {
        font-size:   14px;
        line-height: 1;
        display:     inline-block;
      }

      .refresh-icon.spinning {
        animation: spin 0.7s linear infinite;
      }

      /* ── Countdown ── */
      .countdown {
        display:       flex;
        align-items:   center;
        gap:           7px;
        padding:       5px 11px;
        border-radius: var(--r-sm);
        background:    var(--c-bg3);
        border:        1px solid var(--c-border);
        min-width:     74px;
        justify-content: center;
      }

      .countdown-ring {
        width:         12px;
        height:        12px;
        border-radius: 50%;
        border:        2px solid var(--c-border2);
        border-top-color: var(--c-blue);
        flex-shrink:   0;
        transition:    border-color 0.3s;
      }

      .countdown.ready .countdown-ring {
        border-color:     var(--c-green);
        border-top-color: var(--c-green);
        animation:        none;
      }

      .countdown.counting .countdown-ring {
        animation: spin 2s linear infinite;
      }

      .countdown-text {
        font-family:  var(--font-mono);
        font-size:    12px;
        font-weight:  600;
        color:        var(--c-text2);
        white-space:  nowrap;
        min-width:    38px;
        text-align:   center;
      }

      .countdown.ready .countdown-text {
        color: #58d68d;
      }

      /* ── Auto-Toggle ── */
      .auto-toggle {
        display:     flex;
        align-items: center;
        gap:         6px;
        cursor:      pointer;
        user-select: none;
      }

      .auto-toggle input { display: none; }

      .auto-box {
        width:         16px;
        height:        16px;
        border-radius: 4px;
        border:        1px solid var(--c-border2);
        background:    var(--c-bg3);
        position:      relative;
        transition:    all 0.15s;
        flex-shrink:   0;
      }

      .auto-toggle input:checked + .auto-box {
        background:   var(--c-blue);
        border-color: var(--c-blue);
      }

      .auto-toggle input:checked + .auto-box::after {
        content:   '✓';
        position:  absolute;
        inset:     0;
        display:   flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        color:     #fff;
        font-weight: 700;
      }

      .auto-label {
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color:          var(--c-text3);
      }

      .auto-toggle input:checked ~ .auto-label { color: #5dade2; }

      /* Theme-Toggle */
      .theme-btn {
        width:         32px;
        height:        32px;
        border-radius: var(--r-sm);
        border:        1px solid var(--c-border2);
        color:         var(--c-text3);
        font-size:     14px;
        display:       flex;
        align-items:   center;
        justify-content: center;
        transition:    background 0.15s, color 0.15s;
        flex-shrink:   0;
      }

      .theme-btn:hover { background: var(--c-bg3); color: var(--c-text); }

      /* ── Body ── */
      .body {
        flex:       1;
        overflow:   hidden;
        position:   relative;
      }

      /* ── Views ── */
      .view {
        position:   absolute;
        inset:      0;
        overflow-y: auto;
        padding:    18px 20px;
        display:    none;
      }

      .view.active { display: block; }

      /* ── Loading / Empty States ── */
      .state-overlay {
        position:       absolute;
        inset:          0;
        display:        flex;
        flex-direction: column;
        align-items:    center;
        justify-content: center;
        gap:            12px;
        background:     var(--c-bg);
        z-index:        20;
      }

      .state-overlay.hidden { display: none; }

      .state-icon {
        font-size:  32px;
        opacity:    0.4;
      }

      .state-text {
        font-family: var(--font-mono);
        font-size:   11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:       var(--c-text3);
      }

      .loader-ring {
        width: 32px; height: 32px;
        border: 3px solid var(--c-border2);
        border-top-color: var(--c-red);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Sektion-Titel ── */
      .section-title {
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color:          var(--c-text3);
        margin-bottom:  12px;
        display:        flex;
        align-items:    center;
        gap:            8px;
      }

      .section-title::after {
        content:    '';
        flex:       1;
        height:     1px;
        background: var(--c-border);
      }

      /* ── Hinweis-Box ── */
      .hint-box {
        display:       flex;
        align-items:   center;
        gap:           8px;
        padding:       8px 14px;
        background:    rgba(243, 156, 18, 0.10);
        border:        1px solid rgba(243, 156, 18, 0.28);
        border-radius: var(--r-sm);
        font-size:     12px;
        color:         #f0b429;
        margin-bottom: 16px;
      }

      /* ── Scrollbar ── */
      .view::-webkit-scrollbar              { width: 5px; }
      .view::-webkit-scrollbar-track        { background: transparent; }
      .view::-webkit-scrollbar-thumb        { background: var(--c-border2); border-radius: 3px; }
      .view::-webkit-scrollbar-thumb:hover  { background: var(--c-text3); }

      /* ════════════════════════════════════════════════════════════
         VIEW 1 – KACHELN
      ════════════════════════════════════════════════════════════ */
      .filter-bar {
        display:      flex;
        align-items:  center;
        gap:          10px;
        margin-bottom: 14px;
        flex-wrap:    wrap;
      }

      .filter-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color:          var(--c-text3);
      }

      .filter-chips { display: flex; gap: 5px; flex-wrap: wrap; }

      .filter-chip {
        padding:       4px 10px;
        border-radius: 20px;
        font-size:     11px;
        font-weight:   500;
        border:        1px solid var(--c-border2);
        color:         var(--c-text2);
        background:    transparent;
        transition:    all 0.15s;
        cursor:        pointer;
      }

      .filter-chip:hover  { border-color: var(--c-red-border); color: var(--c-text); }
      .filter-chip.active { background: var(--c-red); border-color: var(--c-red); color: #fff; }

      .te-grid {
        display:               grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap:                   12px;
      }

      /* ── TE-Karte ── */
      .te-card {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-lg);
        padding:       15px 15px 13px;
        cursor:        pointer;
        position:      relative;
        overflow:      hidden;
        transition:    transform 0.18s var(--ease),
                       box-shadow 0.18s var(--ease),
                       border-color 0.18s;
      }

      .te-card:hover {
        transform:    translateY(-2px);
        box-shadow:   var(--shadow-md);
        border-color: var(--c-border2);
      }

      /* Status-Akzentstreifen links */
      .te-card::before {
        content:        '';
        position:       absolute;
        top: 0; left: 0; bottom: 0;
        width:          3px;
        border-radius:  var(--r-lg) 0 0 var(--r-lg);
      }

      .te-card.s-erwartet::before   { background: var(--c-text3); }
      .te-card.s-ankunft::before    { background: var(--c-yellow); }
      .te-card.s-entladen::before   { background: var(--c-blue); }
      .te-card.s-eingelagert::before{ background: var(--c-green); }
      .te-card.s-abgefahren::before { background: var(--c-text3); opacity: 0.4; }
      .te-card.s-verzögert::before  { background: var(--c-red); }

      /* ── Karten-Header ── */
      .tc-header {
        display:       flex;
        align-items:   flex-start;
        justify-content: space-between;
        gap:           8px;
        margin-bottom: 11px;
        padding-left:  6px;
      }

      .tc-meta { flex: 1; min-width: 0; }

      .tc-te-nr {
        font-family:    var(--font-mono);
        font-size:      12px;
        font-weight:    600;
        color:          var(--c-text);
        letter-spacing: 0.03em;
        margin-bottom:  2px;
      }

      .tc-supplier {
        font-size:      11px;
        color:          var(--c-text2);
        white-space:    nowrap;
        overflow:       hidden;
        text-overflow:  ellipsis;
        max-width:      220px;
      }

      /* Status-Badge */
      .tc-badge {
        flex-shrink:    0;
        padding:        3px 7px;
        border-radius:  var(--r-sm);
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        white-space:    nowrap;
      }

      .badge-erwartet   { background: var(--c-bg4);         color: var(--c-text3); }
      .badge-ankunft    { background: var(--c-yellow-dim);  color: #f0b429; }
      .badge-entladen   { background: var(--c-blue-dim);    color: #5dade2; }
      .badge-eingelagert{ background: var(--c-green-dim);   color: #58d68d; }
      .badge-abgefahren { background: var(--c-bg4);         color: var(--c-text3); }
      .badge-verzögert  { background: var(--c-red-dim);     color: #e74c3c; }

      /* ── Fortschrittsbalken ── */
      .tc-progress {
        display:       flex;
        gap:           2px;
        padding-left:  6px;
        margin-bottom: 11px;
      }

      .tc-step {
        flex:          1;
        height:        4px;
        background:    var(--c-bg4);
        border-radius: 2px;
        transition:    background 0.25s;
      }

      .tc-step.done    { background: var(--c-green); }
      .tc-step.active  { background: var(--c-blue);
                         animation: step-pulse 1.6s ease-in-out infinite; }
      .tc-step.late    { background: var(--c-red); }
      .tc-step.active.late { background: var(--c-red);
                             animation: step-pulse 1.6s ease-in-out infinite; }

      @keyframes step-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.45; }
      }

      /* ── Karten-Footer ── */
      .tc-footer {
        display:       flex;
        align-items:   center;
        gap:           10px;
        padding-left:  6px;
        flex-wrap:     wrap;
      }

      .tc-info {
        display:       flex;
        align-items:   center;
        gap:           4px;
        font-size:     11px;
        color:         var(--c-text2);
      }

      .tc-info-icon { font-size: 10px; opacity: 0.65; }

      /* Δ-Zeit Badge */
      /* Ladestellen-Filter-Chips */
      .ls-filter-chips { display: flex; gap: 4px; flex-wrap: wrap; }

      .ls-filter-chip {
        padding:       3px 10px;
        border-radius: 20px;
        font-size:     11px;
        font-weight:   500;
        border:        1px solid var(--c-border2);
        color:         var(--c-text2);
        background:    transparent;
        cursor:        pointer;
        transition:    all 0.15s;
        white-space:   nowrap;
      }
      .ls-filter-chip:hover { border-color: rgba(192,57,43,.4); color: var(--c-text); }
      .ls-filter-chip.active { background: var(--c-bg4); border-color: var(--c-border2); color: var(--c-text); }
      .ls-chip-bsl.active  { background: rgba(142,68,173,.2);  border-color: rgba(142,68,173,.5); color: #c39bd3; }
      .ls-chip-cont.active { background: rgba(230,126,34,.2);  border-color: rgba(230,126,34,.5); color: #f0a500; }
      .ls-chip-land.active { background: var(--c-green-dim);   border-color: rgba(39,174,96,.4);  color: #58d68d; }

      /* Gruppierungs-Toggle */
      .group-toggle-btn {
        display:        inline-flex;
        align-items:    center;
        gap:            6px;
        padding:        4px 11px;
        border-radius:  var(--r-sm);
        border:         1px solid var(--c-border2);
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color:          var(--c-text3);
        background:     transparent;
        cursor:         pointer;
        transition:     all 0.15s;
        margin-left:    4px;
        flex-shrink:    0;
      }
      .group-toggle-btn:hover { background: var(--c-bg3); color: var(--c-text2); }
      .group-toggle-btn.active {
        background:   rgba(41,128,185,.15);
        border-color: rgba(41,128,185,.4);
        color:        #5dade2;
      }

      /* Ladestellen-Gruppen-Header in Kacheln-View */
      .ls-gruppe-header {
        grid-column:    1 / -1;
        display:        flex;
        align-items:    center;
        gap:            8px;
        padding:        8px 2px 6px;
        border-bottom:  1px solid var(--c-border);
        margin-bottom:  4px;
      }
      .ls-gruppe-title {
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .ls-gruppe-count {
        font-family:  var(--font-mono);
        font-size:    9px;
        color:        var(--c-text3);
        background:   var(--c-bg3);
        padding:      1px 7px;
        border-radius: 10px;
      }
      .ls-gruppe-line {
        flex: 1; height: 1px; background: var(--c-border);
      }
      .ls-gruppe-dauer {
        font-family: var(--font-mono);
        font-size:   9px;
        color:       var(--c-text3);
      }

      /* Ladestellen-Badge auf Kachel */
      .ls-badge {
        display:        inline-flex;
        align-items:    center;
        gap:            4px;
        padding:        2px 7px;
        border-radius:  var(--r-sm);
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        flex-shrink:    0;
      }
      .ls-bsl  { background: rgba(142,68,173,.15); color: #c39bd3; }
      .ls-cont { background: rgba(230,126,34,.15);  color: #f0a500; }
      .ls-land { background: var(--c-green-dim);    color: #58d68d; }

      /* Tor-Badge auf Kachel */
      .tor-badge-card {
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    700;
        color:          var(--c-text3);
        background:     var(--c-bg3);
        border:         1px solid var(--c-border2);
        border-radius:  var(--r-sm);
        padding:        2px 6px;
        flex-shrink:    0;
      }

      .tc-delta {
        margin-left:    auto;
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        padding:        2px 7px;
        border-radius:  var(--r-sm);
        white-space:    nowrap;
      }

      .tc-delta.pos  { background: var(--c-red-dim);   color: #e74c3c; }
      .tc-delta.neg  { background: var(--c-green-dim); color: #58d68d; }
      .tc-delta.zero { background: var(--c-bg4);        color: var(--c-text3); }

      /* Hinweis-Flag */
      .tc-hint-flag {
        position: absolute;
        top:      10px;
        right:    10px;
        font-size: 13px;
        filter:   drop-shadow(0 0 5px rgba(243,156,18,0.55));
        line-height: 1;
      }

      /* Leerer-State innerhalb Grid */
      .te-grid-empty {
        grid-column:   1 / -1;
        padding:       40px;
        text-align:    center;
        font-family:   var(--font-mono);
        font-size:     11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:         var(--c-text3);
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-lg);
      }

      /* Platzhalter für noch nicht implementierte Views */
      .view-placeholder {
        display:       flex;
        align-items:   center;
        justify-content: center;
        min-height:    200px;
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-lg);
        font-family:   var(--font-mono);
        font-size:     10px;
        color:         var(--c-text3);
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      /* ════════════════════════════════════════════════════════════
         VIEW 2 – DETAIL
      ════════════════════════════════════════════════════════════ */

      .back-btn {
        display:        inline-flex;
        align-items:    center;
        gap:            6px;
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          var(--c-text3);
        margin-bottom:  14px;
        transition:     color 0.15s;
        padding:        0;
      }

      .back-btn:hover { color: var(--c-text2); }

      /* ── Detail-Panel Rahmen ── */
      .detail-panel {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-lg);
        overflow:      hidden;
      }

      .detail-header {
        background:    var(--c-bg3);
        border-bottom: 1px solid var(--c-border);
        padding:       14px 20px;
        display:       flex;
        align-items:   center;
        gap:           14px;
        flex-wrap:     wrap;
      }

      .dh-te-nr {
        font-family:    var(--font-mono);
        font-size:      15px;
        font-weight:    700;
        color:          var(--c-text);
        letter-spacing: 0.03em;
      }

      .dh-supplier {
        font-size:  12px;
        color:      var(--c-text2);
      }

      .dh-spacer { flex: 1; }

      .dh-delta {
        font-family:  var(--font-mono);
        font-size:    12px;
        font-weight:  700;
        padding:      4px 12px;
        border-radius: var(--r-sm);
      }

      .dh-delta.pos  { background: var(--c-red-dim);   color: #e74c3c; }
      .dh-delta.neg  { background: var(--c-green-dim); color: #58d68d; }

      .detail-body { padding: 20px; }

      /* ── Hinweis-Box im Detail ── */
      .detail-hint {
        display:       flex;
        align-items:   flex-start;
        gap:           8px;
        padding:       10px 14px;
        background:    rgba(243,156,18,0.09);
        border:        1px solid rgba(243,156,18,0.28);
        border-radius: var(--r-sm);
        font-size:     12px;
        color:         #f0b429;
        margin-bottom: 18px;
        line-height:   1.45;
      }

      .detail-hint-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }

      /* ── Sektion ── */
      .d-section { margin-bottom: 22px; }

      .d-section-title {
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color:          var(--c-text3);
        margin-bottom:  12px;
        display:        flex;
        align-items:    center;
        gap:            8px;
      }

      .d-section-title::after {
        content:    '';
        flex:       1;
        height:     1px;
        background: var(--c-border);
      }

      /* ── Zwei-Spalten-Layout für Metadaten ── */
      .d-cols {
        display:               grid;
        grid-template-columns: 1fr 1fr;
        gap:                   16px;
        margin-bottom:         22px;
      }

      @media (max-width: 600px) { .d-cols { grid-template-columns: 1fr; } }

      .d-info-list { display: flex; flex-direction: column; }

      .d-info-row {
        display:         flex;
        justify-content: space-between;
        align-items:     center;
        padding:         6px 0;
        border-bottom:   1px solid var(--c-border);
        gap:             8px;
      }

      .d-info-row:last-child { border-bottom: none; }

      .d-info-key {
        font-size:  11px;
        color:      var(--c-text3);
        flex-shrink: 0;
      }

      .d-info-val {
        font-family:  var(--font-mono);
        font-size:    11px;
        font-weight:  500;
        color:        var(--c-text);
        text-align:   right;
      }

      .d-info-val.ok  { color: #58d68d; }
      .d-info-val.bad { color: #e74c3c; }
      .d-info-val.dim { color: var(--c-text3); }

      /* ── Zeitstrahl ── */
      .tl-wrap {
        overflow-x: auto;
        padding-bottom: 4px;
        margin-bottom: 6px;
      }

      .tl-track {
        position:   relative;
        min-width:  580px;
        height:     88px;
        padding:    0 24px;
      }

      /* Basis-Linie */
      .tl-base {
        position:   absolute;
        top:        30px;
        left:       24px; right: 24px;
        height:     2px;
        background: var(--c-border2);
      }

      /* Soll-Balken (gestrichelt) */
      .tl-soll-bar {
        position:   absolute;
        top:        29px;
        height:     4px;
        border-radius: 2px;
        background: repeating-linear-gradient(
          90deg,
          var(--c-text3) 0px, var(--c-text3) 5px,
          transparent    5px, transparent   10px
        );
        opacity: 0.45;
      }

      /* Ist-Strecke zwischen zwei Punkten */
      .tl-segment {
        position:   absolute;
        top:        30px;
        height:     2px;
        border-radius: 1px;
      }

      .tl-segment.ok   { background: var(--c-green); }
      .tl-segment.warn { background: var(--c-yellow); }
      .tl-segment.bad  { background: var(--c-red); }
      .tl-segment.dim  { background: var(--c-text3); opacity: 0.4; }

      /* Punkt auf dem Zeitstrahl */
      .tl-point {
        position:   absolute;
        top:        22px;
        transform:  translateX(-50%);
        display:    flex;
        flex-direction: column;
        align-items: center;
        gap:         0;
      }

      .tl-dot {
        width:         16px; height: 16px;
        border-radius: 50%;
        border:        2px solid var(--c-bg2);
        position:      relative;
        z-index:       2;
        transition:    transform 0.15s;
      }

      .tl-dot.ok   { background: var(--c-green);  box-shadow: 0 0 0 2px var(--c-green); }
      .tl-dot.warn { background: var(--c-yellow); box-shadow: 0 0 0 2px var(--c-yellow); }
      .tl-dot.bad  { background: var(--c-red);    box-shadow: 0 0 0 2px var(--c-red); }
      .tl-dot.open { background: var(--c-bg3);    box-shadow: 0 0 0 2px var(--c-border2); }

      .tl-time {
        font-family:  var(--font-mono);
        font-size:    9px;
        color:        var(--c-text2);
        margin-top:   5px;
        white-space:  nowrap;
        text-align:   center;
      }

      .tl-label {
        font-family:    var(--font-mono);
        font-size:      8px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color:          var(--c-text3);
        margin-top:     3px;
        white-space:    nowrap;
        text-align:     center;
        line-height:    1.3;
      }

      /* Δ-Chip über einem Punkt */
      .tl-delta-chip {
        position:       absolute;
        top:            -20px;
        left:           50%;
        transform:      translateX(-50%);
        font-family:    var(--font-mono);
        font-size:      8px;
        font-weight:    700;
        padding:        1px 5px;
        border-radius:  3px;
        white-space:    nowrap;
        z-index:        3;
      }

      .tl-delta-chip.pos { background: var(--c-red-dim);   color: #e74c3c; }
      .tl-delta-chip.neg { background: var(--c-green-dim); color: #58d68d; }

      /* Legende unter dem Zeitstrahl */
      .tl-legend {
        display:    flex;
        gap:        14px;
        flex-wrap:  wrap;
        margin-top: 8px;
      }

      .tl-legend-item {
        display:     flex;
        align-items: center;
        gap:         5px;
        font-size:   10px;
        color:       var(--c-text3);
      }

      .tl-legend-swatch {
        width: 18px; height: 3px;
        border-radius: 2px;
      }

      /* ── Produkt-Tabelle ── */
      .prod-table {
        width:           100%;
        border-collapse: collapse;
      }

      .prod-table th {
        font-family:    var(--font-mono);
        font-size:      9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          var(--c-text3);
        font-weight:    500;
        padding:        6px 10px;
        text-align:     left;
        border-bottom:  1px solid var(--c-border);
        white-space:    nowrap;
      }

      .prod-table td {
        padding:        8px 10px;
        font-size:      12px;
        color:          var(--c-text2);
        border-bottom:  1px solid var(--c-border);
        vertical-align: middle;
      }

      .prod-table tr:last-child td { border-bottom: none; }

      .prod-table tbody tr:hover td {
        background: rgba(255,255,255,0.02);
      }

      :host([theme="light"]) .prod-table tbody tr:hover td {
        background: rgba(0,0,0,0.02);
      }

      .pt-nr   { font-family: var(--font-mono); font-size: 10px; color: var(--c-text3); }
      .pt-name { font-size: 12px; color: var(--c-text); }
      .pt-menge {
        font-family:  var(--font-mono);
        font-size:    12px;
        color:        var(--c-text);
        text-align:   right;
        white-space:  nowrap;
      }
      .pt-halle {
        display:       inline-block;
        padding:       2px 7px;
        background:    var(--c-blue-dim);
        color:         #5dade2;
        border-radius: var(--r-sm);
        font-family:   var(--font-mono);
        font-size:     10px;
        font-weight:   600;
      }
      .pt-time {
        font-family: var(--font-mono);
        font-size:   10px;
        color:       var(--c-green);
        white-space: nowrap;
      }
      .pt-time.open { color: var(--c-text3); }

      /* ════════════════════════════════════════════════════════════
         VIEW 3 – GANTT
      ════════════════════════════════════════════════════════════ */

      .gantt-wrap {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-lg);
        overflow:      hidden;
      }

      .gantt-inner { min-width: 700px; }

      /* ── Kopfzeile ── */
      .gantt-head {
        display:       flex;
        border-bottom: 1px solid var(--c-border);
        background:    var(--c-bg3);
        position:      sticky;
        top:           0;
        z-index:       5;
      }

      .gantt-label-col {
        width:          200px;
        min-width:      200px;
        padding:        10px 16px;
        font-family:    var(--font-mono);
        font-size:      9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color:          var(--c-text3);
        display:        flex;
        align-items:    center;
        border-right:   1px solid var(--c-border);
        flex-shrink:    0;
      }

      .gantt-axis {
        flex:        1;
        position:    relative;
        height:      36px;
      }

      .gantt-tick {
        position:       absolute;
        top:            0;
        transform:      translateX(-50%);
        display:        flex;
        flex-direction: column;
        align-items:    center;
        gap:            3px;
        padding-top:    6px;
      }

      .gantt-tick-line {
        width:         1px;
        height:        6px;
        background:    var(--c-border2);
      }

      .gantt-tick-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        color:          var(--c-text3);
        white-space:    nowrap;
      }

      /* ── Zeile ── */
      .gantt-row {
        display:       flex;
        align-items:   center;
        border-bottom: 1px solid var(--c-border);
        min-height:    52px;
        transition:    background 0.12s;
        cursor:        pointer;
      }

      .gantt-row:last-child  { border-bottom: none; }
      .gantt-row:hover       { background: rgba(255,255,255,0.015); }
      :host([theme="light"]) .gantt-row:hover { background: rgba(0,0,0,0.015); }

      .gantt-row-label {
        width:      200px;
        min-width:  200px;
        padding:    8px 14px;
        border-right: 1px solid var(--c-border);
        flex-shrink: 0;
      }

      .gantt-row-te {
        font-family:    var(--font-mono);
        font-size:      11px;
        font-weight:    600;
        color:          var(--c-text);
        letter-spacing: 0.03em;
      }

      .gantt-row-supplier {
        font-size:      10px;
        color:          var(--c-text3);
        white-space:    nowrap;
        overflow:       hidden;
        text-overflow:  ellipsis;
        max-width:      172px;
        margin-top:     2px;
        display:        flex;
        align-items:    center;
        gap:            5px;
      }

      /* ── Balkenbereich ── */
      .gantt-bars {
        flex:       1;
        position:   relative;
        height:     52px;
        overflow:   visible;
      }

      /* vertikale Gitterlinien */
      .gantt-grid-line {
        position:   absolute;
        top: 0; bottom: 0;
        width:      1px;
        background: var(--c-border);
        pointer-events: none;
      }

      /* Jetzt-Linie */
      .gantt-now-line {
        position:   absolute;
        top: 0; bottom: 0;
        width:      2px;
        background: var(--c-red-light);
        z-index:    4;
        pointer-events: none;
      }

      .gantt-now-label {
        position:       absolute;
        top:            4px;
        left:           4px;
        font-family:    var(--font-mono);
        font-size:      8px;
        font-weight:    700;
        color:          var(--c-red-light);
        letter-spacing: 0.1em;
        white-space:    nowrap;
      }

      /* Soll-Balken */
      .gantt-bar-soll {
        position:      absolute;
        top:           10px;
        height:        10px;
        background:    var(--c-bg4);
        border:        1px solid var(--c-border2);
        border-radius: 2px;
        pointer-events: none;
      }

      /* Ist-Balken */
      .gantt-bar-ist {
        position:      absolute;
        top:           30px;
        height:        10px;
        border-radius: 2px;
        cursor:        pointer;
        transition:    opacity 0.15s, filter 0.15s;
      }

      .gantt-bar-ist:hover {
        opacity: 0.82;
        filter:  brightness(1.1);
      }

      .gantt-bar-ist.ok   { background: var(--c-green); }
      .gantt-bar-ist.mild { background: var(--c-yellow); }
      .gantt-bar-ist.bad  { background: var(--c-red); }
      .gantt-bar-ist.dim  {
        background: var(--c-text3);
        opacity:    0.4;
      }

      /* Label auf dem Ist-Balken */
      .gantt-bar-label {
        position:       absolute;
        top:            30px;
        height:         10px;
        line-height:    10px;
        font-family:    var(--font-mono);
        font-size:      8px;
        font-weight:    600;
        color:          rgba(255,255,255,0.75);
        padding:        0 4px;
        white-space:    nowrap;
        pointer-events: none;
        overflow:       hidden;
      }

      /* Legende unter dem Gantt */
      .gantt-legend {
        display:       flex;
        gap:           14px;
        flex-wrap:     wrap;
        padding:       10px 16px;
        border-top:    1px solid var(--c-border);
        background:    var(--c-bg3);
      }

      .gantt-legend-item {
        display:     flex;
        align-items: center;
        gap:         5px;
        font-size:   10px;
        color:       var(--c-text3);
      }

      .gantt-legend-swatch {
        width:         16px;
        height:        4px;
        border-radius: 2px;
      }

      /* Gantt Gruppen-Header */
      .gantt-group-header {
        display:       flex;
        align-items:   center;
        gap:           8px;
        padding:       7px 16px;
        background:    var(--c-bg3);
        border-top:    1px solid var(--c-border2);
        border-bottom: 1px solid var(--c-border);
      }
      .gantt-group-header:first-child { border-top: none; }
      .gantt-group-accent {
        width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0;
      }
      .gantt-group-title {
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .gantt-group-count {
        font-family:  var(--font-mono);
        font-size:    9px;
        color:        var(--c-text3);
        background:   var(--c-bg4);
        padding:      1px 7px;
        border-radius: 10px;
      }

      /* Zeitraum-Chips (in filter-bar) */
      .zeitraum-chips { display: flex; gap: 4px; flex-wrap: wrap; }

      .zeitraum-chip {
        padding:       3px 10px;
        border-radius: 20px;
        font-family:   var(--font-mono);
        font-size:     10px;
        font-weight:   500;
        border:        1px solid var(--c-border2);
        color:         var(--c-text2);
        background:    transparent;
        cursor:        pointer;
        transition:    all 0.15s;
        white-space:   nowrap;
      }

      .zeitraum-chip:hover  { border-color: var(--c-red-border); color: var(--c-text); }
      .zeitraum-chip.active { background: var(--c-blue); border-color: var(--c-blue); color: #fff; }

      /* Gantt-Steuerleiste */
      .gantt-ctrl {
        display:       flex;
        align-items:   center;
        gap:           10px;
        padding:       8px 16px;
        background:    var(--c-bg3);
        border-bottom: 1px solid var(--c-border);
        flex-wrap:     wrap;
        flex-shrink:   0;
      }

      .gantt-nav { display: flex; align-items: center; gap: 6px; }

      .gantt-nav-btn {
        width: 28px; height: 28px;
        border-radius: var(--r-sm);
        border:  1px solid var(--c-border2);
        color:   var(--c-text2);
        font-size: 14px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
      }

      .gantt-nav-btn:hover { background: var(--c-bg4); color: var(--c-text); }

      .gantt-nav-date {
        font-family:  var(--font-mono);
        font-size:    12px;
        font-weight:  600;
        color:        var(--c-text);
        min-width:    130px;
        text-align:   center;
        white-space:  nowrap;
      }

      .gantt-heute-btn {
        padding: 3px 9px;
        border-radius: var(--r-sm);
        border: 1px solid var(--c-border2);
        font-family: var(--font-mono);
        font-size: 9px; font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--c-text3);
        cursor: pointer;
        transition: all 0.12s;
      }

      .gantt-heute-btn:hover { background: var(--c-bg4); color: var(--c-text); }

      .gantt-ctrl-sep { flex: 1; }

      .gantt-fenster-tabs {
        display: flex;
        border: 1px solid var(--c-border2);
        border-radius: var(--r-sm);
        overflow: hidden;
      }

      .gantt-fenster-tab {
        padding: 4px 11px;
        font-family: var(--font-mono);
        font-size: 9px; font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--c-text3);
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
        white-space: nowrap;
      }

      .gantt-fenster-tab:hover  { background: var(--c-bg4); color: var(--c-text2); }
      .gantt-fenster-tab.active { background: var(--c-red-dim); color: #e74c3c; }

      /* ════════════════════════════════════════════════════════════
         VIEW – TORE (Hallen-Accordion)
      ════════════════════════════════════════════════════════════ */
      .engpass-banner {
        display:       flex;
        align-items:   center;
        gap:           10px;
        padding:       10px 14px;
        background:    var(--c-red-dim);
        border:        1px solid var(--c-red-border);
        border-radius: var(--r-sm);
        margin-bottom: 14px;
      }
      .engpass-icon { font-size: 16px; }
      .engpass-text { font-size: 12px; color: #e74c3c; }
      .engpass-text strong { font-weight: 600; }

      .halle-section { margin-bottom: 10px; }

      .halle-header {
        display:       flex;
        align-items:   center;
        gap:           10px;
        padding:       9px 14px;
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-sm);
        cursor:        pointer;
        user-select:   none;
        transition:    background 0.12s;
      }
      .halle-header:hover { background: var(--c-bg3); }
      .halle-header.engpass { border-left: 3px solid var(--c-red); }
      .halle-header.voll    { border-left: 3px solid var(--c-yellow); }

      .h-toggle { font-size: 10px; color: var(--c-text3); transition: transform 0.2s; flex-shrink: 0; }
      .h-toggle.open { transform: rotate(90deg); }
      .h-num { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--c-text); }
      .h-stats { display: flex; gap: 8px; font-family: var(--font-mono); font-size: 9px; }
      .hs-b { color: #5dade2; }
      .hs-f { color: var(--c-text3); }
      .hs-v { color: #e74c3c; }
      .h-sep { flex: 1; }
      .h-util-pct { font-family: var(--font-mono); font-size: 9px; color: var(--c-text3); }

      .halle-body { display: none; padding: 8px 0 0 0; }
      .halle-body.open {
        display:               grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap:                   6px;
      }

      .tor-karte {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-sm);
        padding:       10px 12px;
        cursor:        pointer;
        position:      relative;
        overflow:      hidden;
        transition:    all 0.15s;
      }
      .tor-karte:hover { border-color: var(--c-border2); background: var(--c-bg3); }
      .tor-karte::before {
        content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
      }
      .tor-karte.t-entladen::before    { background: var(--c-blue); }
      .tor-karte.t-ankunft::before     { background: var(--c-yellow); }
      .tor-karte.t-eingelagert::before { background: var(--c-green); }
      .tor-karte.t-verzögert::before   { background: var(--c-red); }

      .tc2-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-left: 5px; }
      .tc2-num { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--c-text); }
      .tc2-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .dot-entladen    { background: var(--c-blue);   box-shadow: 0 0 5px var(--c-blue); }
      .dot-ankunft     { background: var(--c-yellow); box-shadow: 0 0 5px var(--c-yellow); }
      .dot-eingelagert { background: var(--c-green); }
      .dot-verzögert   { background: var(--c-red); box-shadow: 0 0 6px var(--c-red); animation: step-pulse 1.4s ease-in-out infinite; }
      .tc2-te { font-family: var(--font-mono); font-size: 10px; color: var(--c-text2); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tc2-restzeit { font-family: var(--font-mono); font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: var(--r-sm); flex-shrink: 0; }
      .rz-ok   { background: var(--c-green-dim);  color: #58d68d; }
      .rz-warn { background: var(--c-yellow-dim); color: #f0b429; }
      .rz-bad  { background: var(--c-red-dim);    color: #e74c3c; }

      .tc2-steps { display: flex; gap: 2px; padding-left: 5px; margin-bottom: 7px; }
      .tc2-step { flex: 1; height: 3px; background: var(--c-bg4); border-radius: 2px; }
      .tc2-step.done { background: var(--c-green); }
      .tc2-step.act  { background: var(--c-blue); animation: step-pulse 1.6s ease-in-out infinite; }
      .tc2-step.late { background: var(--c-red); }

      .tc2-bottom { display: flex; align-items: center; gap: 8px; padding-left: 5px; }
      .tc2-sup { font-size: 10px; color: var(--c-text3); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tc2-info { font-size: 10px; color: var(--c-text3); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

      /* Freie Tore Toggle */
      .frei-toggle-btn {
        display:        inline-flex;
        align-items:    center;
        gap:            5px;
        padding:        3px 9px;
        border-radius:  var(--r-sm);
        border:         1px solid var(--c-border2);
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color:          var(--c-text3);
        background:     transparent;
        cursor:         pointer;
        transition:     all 0.15s;
        flex-shrink:    0;
      }
      .frei-toggle-btn:hover { background: var(--c-bg4); color: var(--c-text2); }
      .frei-toggle-btn.active {
        background:   var(--c-green-dim);
        border-color: rgba(39,174,96,0.35);
        color:        #58d68d;
      }

      /* Freie-Tore-Container */
      .frei-tore-wrap {
        display:     none;
        grid-column: 1 / -1;
        padding:     10px 0 4px;
        border-top:  1px solid var(--c-border);
        margin-top:  4px;
      }
      .frei-tore-wrap.visible { display: block; }

      .frei-tore-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color:          var(--c-text3);
        margin-bottom:  6px;
        display:        block;
      }
      .frei-tore-strip { display: flex; flex-wrap: wrap; gap: 4px; }
      .frei-tor-tag {
        font-family:    var(--font-mono);
        font-size:      10px;
        color:          var(--c-text3);
        background:     var(--c-bg2);
        border:         1px dashed var(--c-border2);
        border-radius:  var(--r-sm);
        padding:        3px 8px;
        transition:     all 0.12s;
      }
      .frei-tor-tag:hover {
        border-color: var(--c-green);
        color:        #58d68d;
        background:   var(--c-green-dim);
      }
    </style>

    <!-- ── DOM ────────────────────────────────────────────────────────── -->
    <div class="widget-root">

      <!-- Header -->
      <div class="header">
        <div class="header-brand">
          <div class="header-brand-dot"></div>
          WE-Tracker
        </div>
        <div class="header-title" id="header-date">Wareneingang</div>
        <div class="header-clock" id="header-clock" title="Aktuelle Uhrzeit">
          <span class="clock-dot"></span>
          <span id="clock-text">--:--:--</span>
        </div>
        <div class="header-sep"></div>

        <!-- KPI-Chips -->
        <div class="kpi-strip" id="kpi-strip">
          <div class="kpi-chip k-total">
            <span class="val" id="kpi-gesamt">–</span> TEs
          </div>
          <div class="kpi-chip k-active">
            <span class="val" id="kpi-aktiv">–</span> aktiv
          </div>
          <div class="kpi-chip k-delayed">
            <span class="val" id="kpi-verzoegert">–</span> verzögert
          </div>
          <div class="kpi-chip k-done">
            <span class="val" id="kpi-abgefahren">–</span> abgefahren
          </div>
        </div>

        <!-- Theme-Toggle bleibt im Header -->
        <button class="theme-btn" id="theme-btn" title="Theme wechseln">◑</button>
      </div>

      <!-- ── NAVIGATIONSZEILE ── -->
      <div class="navbar">
        <div class="nav-tabs">
          <button class="nav-tab active" data-view="kacheln">
            <span class="nav-tab-icon">▦</span><span class="nav-tab-label">Übersicht</span>
          </button>
          <button class="nav-tab" data-view="tore">
            <span class="nav-tab-icon">⊞</span><span class="nav-tab-label">Tore</span>
          </button>
          <button class="nav-tab" data-view="gantt">
            <span class="nav-tab-icon">▤</span><span class="nav-tab-label">Zeitstrahl</span>
          </button>
        </div>

        <div class="nav-sep"></div>

        <!-- ── LIVE-REFRESH-STEUERUNG ── -->
        <div class="refresh-ctrl">
          <button class="refresh-btn" id="refresh-btn" disabled>
            <span class="refresh-icon" id="refresh-icon">⟳</span>
            <span>Aktualisieren</span>
          </button>
          <div class="countdown" id="countdown" title="Zeit bis zur nächsten Aktualisierung">
            <span class="countdown-ring" id="countdown-ring"></span>
            <span class="countdown-text" id="countdown-text">00:30</span>
          </div>
          <label class="auto-toggle" title="Automatisch aktualisieren">
            <input type="checkbox" id="auto-check">
            <span class="auto-box"></span>
            <span class="auto-label">Auto</span>
          </label>
        </div>
      </div>

      <!-- Body -->
      <div class="body">

        <!-- Loading State -->
        <div class="state-overlay" id="state-loading">
          <div class="loader-ring"></div>
          <div class="state-text">Daten werden geladen…</div>
        </div>

        <!-- Empty State -->
        <div class="state-overlay hidden" id="state-empty">
          <div class="state-icon">📦</div>
          <div class="state-text">Keine Transporteinheiten vorhanden</div>
        </div>

        <!-- ── VIEW 1: KACHELN ── -->
        <div class="view active" id="view-kacheln">
          <div class="filter-bar">
            <span class="filter-label">Zeitraum</span>
            <div class="zeitraum-chips">
              <button class="zeitraum-chip active" data-zeitraum="heute">Heute</button>
              <button class="zeitraum-chip" data-zeitraum="woche">Diese Woche</button>
              <button class="zeitraum-chip" data-zeitraum="7tage">Letzte 7 Tage</button>
              <button class="zeitraum-chip" data-zeitraum="monat">Monat</button>
            </div>
            <span class="filter-label" style="margin-left:6px">Status</span>
            <div class="filter-chips" id="filter-chips">
              <button class="filter-chip active" data-filter="alle">Alle</button>
              <button class="filter-chip" data-filter="erwartet">Erwartet</button>
              <button class="filter-chip" data-filter="aktiv">Aktiv</button>
              <button class="filter-chip" data-filter="verzögert">Verzögert</button>
              <button class="filter-chip" data-filter="abgefahren">Abgefahren</button>
            </div>
            <span class="filter-label" style="margin-left:6px">Ladestelle</span>
            <div class="ls-filter-chips">
              <button class="ls-filter-chip active" data-ls="alle">Alle</button>
              <button class="ls-filter-chip ls-chip-bsl" data-ls="BSL">🚛 BSL</button>
              <button class="ls-filter-chip ls-chip-cont" data-ls="Container">🏗 Container</button>
              <button class="ls-filter-chip ls-chip-land" data-ls="Landverkehr">🚚 Landverkehr</button>
            </div>
            <button class="group-toggle-btn" id="group-toggle-btn" title="Nach Ladestelle gruppieren">
              <span id="group-toggle-icon">⊟</span> Gruppieren
            </button>
          </div>
          <div class="te-grid" id="te-grid">
          </div>
        </div>

        <!-- ── VIEW: TORE ── -->
        <div class="view" id="view-tore">
          <div id="tore-content"></div>
        </div>

        <!-- ── VIEW 2: DETAIL ── -->
        <div class="view" id="view-detail">
          <button class="back-btn" id="back-btn">← Zurück zur Übersicht</button>
          <div id="detail-content">
            <!-- Wird in Schritt 3 durch renderDetail() befüllt -->
          </div>
        </div>

        <!-- ── VIEW 3: GANTT ── -->
        <div class="view" id="view-gantt">
          <div class="gantt-ctrl">
            <div class="gantt-nav">
              <button class="gantt-nav-btn" id="gantt-prev">&#8592;</button>
              <div class="gantt-nav-date" id="gantt-nav-date">–</div>
              <button class="gantt-nav-btn" id="gantt-next">&#8594;</button>
            </div>
            <button class="gantt-heute-btn" id="gantt-heute">Heute</button>
            <div class="gantt-ctrl-sep"></div>
            <div class="gantt-fenster-tabs">
              <button class="gantt-fenster-tab active" data-fenster="tag">Tag</button>
              <button class="gantt-fenster-tab" data-fenster="3tage">3 Tage</button>
              <button class="gantt-fenster-tab" data-fenster="woche">Woche</button>
            </div>
          </div>
          <div id="gantt-content"></div>
        </div>

      </div>
    </div>
  `;

  // ── Web Component ─────────────────────────────────────────────────────────

  class WEEingangWidget extends HTMLElement {

    // ── Lifecycle ────────────────────────────────────────────────────────

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._shadow.appendChild(template.content.cloneNode(true));

      // Interner State
      this._teMap       = new Map();    // { teNr → TEObjekt }
      this._activeTE    = null;         // aktuell im Detail angezeigte TE-Nummer
      this._activeFilter  = 'alle';     // aktiver Status-Filter
      this._theme         = 'dark';     // 'dark' | 'light'
      this._ac            = new AbortController();
      this._activeZeitraum = 'heute';   // 'heute'|'woche'|'7tage'|'monat'
      this._ganttDatum    = new Date(); // Anker-Datum Gantt
      this._ganttFenster  = 'tag';      // 'tag'|'3tage'|'woche'
      // Live-Refresh
      this._countdownDauer = 30;        // Sekunden bis Aktualisierung möglich
      this._countdownVal   = 30;        // aktueller Countdown-Wert
      this._countdownTimer = null;      // setInterval-Handle
      this._clockTimer     = null;      // Uhr-Timer-Handle
      this._autoRefresh    = false;     // Auto-Aktualisierung aktiv?
      this._lsFilter       = 'alle';    // Ladestellen-Filter: 'alle'|'BSL'|'Container'|'Landverkehr'
      this._gruppiertLS    = false;     // Kacheln nach Ladestelle gruppieren
    }

    connectedCallback() {
      this._bindEvents();
      this._hideLoading();
      this._startCountdown();
      this._startClock();
    }

    disconnectedCallback() {
      // Alle Event-Listener in einem Zug entfernen
      this._ac.abort();
      this._stopCountdown();
      this._stopClock();
    }

    // ── Hilfsmethode: Element im Shadow DOM finden ───────────────────────

    _$(id) { return this._shadow.getElementById(id); }

    // ── Event-Binding ────────────────────────────────────────────────────

    _bindEvents() {
      const opts = { signal: this._ac.signal };

      // Navigations-Tabs
      this._shadow.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => this._switchView(btn.dataset.view), opts);
      });

      // Theme-Toggle
      this._$('theme-btn').addEventListener('click', () => this._toggleTheme(), opts);

      // Refresh-Button
      this._$('refresh-btn').addEventListener('click', () => {
        if (!this._$('refresh-btn').disabled) this._doRefresh();
      }, opts);

      // Auto-Aktualisierung Checkbox
      this._$('auto-check').addEventListener('change', (e) => {
        this._autoRefresh = e.target.checked;
        // Wenn aktiviert und Countdown bereits abgelaufen: sofort refreshen
        if (this._autoRefresh && this._countdownVal <= 0) this._doRefresh();
      }, opts);

      // Back-Button im Detail-View
      this._$('back-btn').addEventListener('click', () => {
        this._switchView('kacheln');
      }, opts);

      // Filter-Chips (Status)
      this._shadow.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this._activeFilter = chip.dataset.filter;
          this._shadow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this._renderKacheln();
        }, opts);
      });

      // Zeitraum-Chips
      this._shadow.querySelectorAll('.zeitraum-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this._activeZeitraum = chip.dataset.zeitraum;
          this._shadow.querySelectorAll('.zeitraum-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this._updateKPIs();
          this._renderKacheln();
        }, opts);
      });

      // Ladestellen-Filter-Chips
      this._shadow.querySelectorAll('.ls-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this._lsFilter = chip.dataset.ls;
          this._shadow.querySelectorAll('.ls-filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this._renderKacheln();
        }, opts);
      });

      // Gruppierungs-Toggle
      this._$('group-toggle-btn')?.addEventListener('click', () => {
        this._gruppiertLS = !this._gruppiertLS;
        const btn  = this._$('group-toggle-btn');
        const icon = this._$('group-toggle-icon');
        btn?.classList.toggle('active', this._gruppiertLS);
        if (icon) icon.textContent = this._gruppiertLS ? '⊞' : '⊟';
        this._renderKacheln();
      }, opts);

      // Gantt-Navigation
      this._$('gantt-prev')?.addEventListener('click', () => this._ganttNavigiere(-1), opts);
      this._$('gantt-next')?.addEventListener('click', () => this._ganttNavigiere(+1), opts);
      this._$('gantt-heute')?.addEventListener('click', () => {
        this._ganttDatum = new Date();
        this._renderGantt();
      }, opts);

      // Gantt-Fenster-Tabs
      this._shadow.querySelectorAll('.gantt-fenster-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this._ganttFenster = tab.dataset.fenster;
          this._shadow.querySelectorAll('.gantt-fenster-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this._renderGantt();
        }, opts);
      });
    }

    // ── View-Switching ────────────────────────────────────────────────────

    _switchView(name) {
      // Views
      this._shadow.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      this._$(`view-${name}`)?.classList.add('active');
      // Tabs — Detail hat keinen Tab, daher nichts markieren wenn Detail aktiv
      if (name !== 'detail') {
        this._shadow.querySelectorAll('.nav-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.view === name);
        });
      }
      // Tore-View bei Bedarf rendern
      if (name === 'tore') this._renderTore();
    }

    // ── Live-Uhr ──────────────────────────────────────────────────────────

    _startClock() {
      this._stopClock();
      this._tickClock();
      this._clockTimer = setInterval(() => this._tickClock(), 1000);
    }

    _stopClock() {
      if (this._clockTimer) {
        clearInterval(this._clockTimer);
        this._clockTimer = null;
      }
    }

    _tickClock() {
      const el = this._$('clock-text');
      if (!el) return;
      el.textContent = new Date().toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }

    // ── Live-Refresh / Countdown ──────────────────────────────────────────

    // Startet/Neustartet den 30s-Countdown. Button wird disabled, am Ende aktiv.
    _startCountdown() {
      this._stopCountdown();
      this._countdownVal = this._countdownDauer;

      const btn  = this._$('refresh-btn');
      const cd   = this._$('countdown');
      const icon = this._$('refresh-icon');
      if (btn)  btn.disabled = true;
      if (icon) icon.classList.remove('spinning');
      if (cd)   { cd.classList.add('counting'); cd.classList.remove('ready'); }

      this._updateCountdownText();

      this._countdownTimer = setInterval(() => {
        this._countdownVal--;
        this._updateCountdownText();

        if (this._countdownVal <= 0) {
          this._countdownAbgelaufen();
        }
      }, 1000);
    }

    _stopCountdown() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
      }
    }

    // Wird aufgerufen wenn der Countdown 0 erreicht
    _countdownAbgelaufen() {
      this._stopCountdown();
      const btn = this._$('refresh-btn');
      const cd  = this._$('countdown');
      if (cd) { cd.classList.remove('counting'); cd.classList.add('ready'); }

      if (this._autoRefresh) {
        // Auto: sofort neu laden
        this._doRefresh();
      } else {
        // Manuell: Button aktivieren
        if (btn) btn.disabled = false;
        const txt = this._$('countdown-text');
        if (txt) txt.textContent = 'bereit';
      }
    }

    _updateCountdownText() {
      const txt = this._$('countdown-text');
      if (!txt) return;
      const v = Math.max(0, this._countdownVal);
      const m = String(Math.floor(v / 60)).padStart(2, '0');
      const s = String(v % 60).padStart(2, '0');
      txt.textContent = `${m}:${s}`;
    }

    // Löst die Aktualisierung aus: lädt Daten neu, startet Countdown neu
    _doRefresh() {
      const icon = this._$('refresh-icon');
      if (icon) icon.classList.add('spinning');

      // Datenquelle neu verarbeiten (falls vorhanden)
      if (this._dataBinding) {
        this.myDataSource = this._dataBinding;
      }

      // kurze Spin-Animation, dann Countdown neu starten
      setTimeout(() => {
        if (icon) icon.classList.remove('spinning');
        this._startCountdown();
      }, 600);
    }

    // ── Theme ─────────────────────────────────────────────────────────────

    _toggleTheme() {
      this._theme = this._theme === 'dark' ? 'light' : 'dark';
      this._applyTheme();
    }

    _applyTheme() {
      if (this._theme === 'light') {
        this.setAttribute('theme', 'light');
      } else {
        this.removeAttribute('theme');
      }
    }

    // ── Loading State ─────────────────────────────────────────────────────

    _showLoading() {
      this._$('state-loading')?.classList.remove('hidden');
      this._$('state-empty')?.classList.add('hidden');
    }

    _hideLoading() {
      this._$('state-loading')?.classList.add('hidden');
    }

    _showEmpty() {
      this._$('state-empty')?.classList.remove('hidden');
      this._$('state-loading')?.classList.add('hidden');
    }

    // ── KPI-Leiste aktualisieren ─────────────────────────────────────────

    _zeitraumBereich() {
      const jetzt = new Date();
      const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
      switch (this._activeZeitraum) {
        case 'heute':
          return { von: heute, bis: new Date(heute.getTime() + 86400000) };
        case 'woche': {
          const tag = heute.getDay();
          const diff = (tag === 0 ? -6 : 1 - tag);
          const mo = new Date(heute.getTime() + diff * 86400000);
          return { von: mo, bis: new Date(mo.getTime() + 7 * 86400000) };
        }
        case '7tage':
          return { von: new Date(heute.getTime() - 6 * 86400000), bis: new Date(heute.getTime() + 86400000) };
        case 'monat': {
          const von = new Date(heute.getFullYear(), heute.getMonth(), 1);
          return { von, bis: new Date(heute.getFullYear(), heute.getMonth() + 1, 1) };
        }
        default:
          return { von: new Date(0), bis: new Date(9999, 0) };
      }
    }

    _tesFuerZeitraum() {
      const { von, bis } = this._zeitraumBereich();
      return [...this._teMap.values()].filter(te => {
        const anker = te.geplantStart ?? te.tsAnkunft;
        return anker && anker >= von && anker < bis;
      });
    }

    _updateKPIs() {
      const tes        = this._tesFuerZeitraum();
      const aktiv      = tes.filter(t => ['ankunft', 'entladen'].includes(t.status)).length;
      const verzoegert = tes.filter(t => t.status === 'verzögert').length;
      const abgefahren = tes.filter(t => t.status === 'abgefahren').length;

      this._$('kpi-gesamt').textContent     = tes.length;
      this._$('kpi-aktiv').textContent      = aktiv;
      this._$('kpi-verzoegert').textContent = verzoegert;
      this._$('kpi-abgefahren').textContent = abgefahren;

      const labels = {
        heute:  'Heute · ' + new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}),
        woche:  'Diese Woche',
        '7tage':'Letzte 7 Tage',
        monat:  new Date().toLocaleDateString('de-DE',{month:'long',year:'numeric'}),
      };
      this._$('header-date').textContent = 'Wareneingang · ' + (labels[this._activeZeitraum] ?? '');
    }

    // ── Render: Kacheln ──────────────────────────────────────────────────

    _renderKacheln() {
      const grid = this._$('te-grid');
      if (!grid) return;

      // Status-Filter
      const statusMatch = (te) => {
        switch (this._activeFilter) {
          case 'aktiv':      return ['ankunft', 'entladen'].includes(te.status);
          case 'verzögert':  return te.status === 'verzögert';
          case 'abgefahren': return te.status === 'abgefahren';
          case 'erwartet':   return te.status === 'erwartet';
          default:           return true; // 'alle'
        }
      };

      // Halle-Filter
      const halleMatch = (te) => {
        if (!this._halleFilter) return true;
        return te.halle === this._halleFilter ||
          te.produkte.some(p => p.halle === this._halleFilter);
      };

      // Ladestellen-Filter
      const lsMatch = (te) => {
        if (this._lsFilter === 'alle') return true;
        return (te.ladestelle ?? 'Landverkehr') === this._lsFilter;
      };

      const tes = this._tesFuerZeitraum()
        .filter(te => statusMatch(te) && halleMatch(te) && lsMatch(te));

      if (tes.length === 0) {
        grid.innerHTML = `<div class="te-grid-empty">Keine TEs für diesen Filter</div>`;
        return;
      }

      if (this._gruppiertLS) {
        // ── Gruppiert nach Ladestelle ──
        const LS_ORDER = ['BSL', 'Container', 'Landverkehr'];
        const LS_META  = {
          BSL:         { icon: '🚛', col: 'rgba(142,68,173,0.85)', dauer: 'Ø 4–8h'     },
          Container:   { icon: '🏗', col: 'rgba(230,126,34,0.85)', dauer: 'Ø 2–4h'     },
          Landverkehr: { icon: '🚚', col: 'rgba(39,174,96,0.85)',  dauer: 'Ø 30–90min' },
        };
        const byLS = {};
        for (const te of tes) {
          const ls = te.ladestelle ?? 'Landverkehr';
          if (!byLS[ls]) byLS[ls] = [];
          byLS[ls].push(te);
        }
        grid.innerHTML = LS_ORDER
          .filter(ls => byLS[ls]?.length > 0)
          .map(ls => {
            const m  = LS_META[ls];
            const gr = byLS[ls];
            const vz = gr.filter(t => t.status === 'verzögert').length;
            const header = `<div class="ls-gruppe-header">
              <span class="ls-gruppe-title" style="color:${m.col}">${m.icon} ${ls}</span>
              <span class="ls-gruppe-count">${gr.length} TE${gr.length !== 1 ? 's' : ''}</span>
              ${vz ? `<span class="ls-gruppe-count" style="background:var(--c-red-dim);color:#e74c3c">${vz} verzögert</span>` : ''}
              <div class="ls-gruppe-line"></div>
              <span class="ls-gruppe-dauer">${m.dauer}</span>
            </div>`;
            return header + gr.map(te => this._teKachelHTML(te)).join('');
          }).join('');
      } else {
        // ── Ungroupiert ──
        grid.innerHTML = tes.map(te => this._teKachelHTML(te)).join('');
      }

      // Klick-Handler: Delegation auf Grid-Ebene — ein Listener für alle Karten
      // (vorher jeden einzelnen click-handler pro Karte setzen würde bei vielen TEs
      //  zu O(n) Listener-Attachments führen)
      grid.onclick = (e) => {
        const card = e.target.closest('.te-card');
        if (card?.dataset.te) this._renderDetail(card.dataset.te);
      };
    }

    // Ladestellen-Badge HTML
    _lsBadgeHTML(ladestelle) {
      const map  = { BSL: 'ls-bsl', Container: 'ls-cont', Landverkehr: 'ls-land' };
      const icon = { BSL: '🚛', Container: '🏗', Landverkehr: '🚚' };
      const cls  = map[ladestelle] ?? 'ls-land';
      const ico  = icon[ladestelle] ?? '🚛';
      return `<span class="ls-badge ${cls}">${ico} ${esc(ladestelle)}</span>`;
    }

    // Baut das HTML für eine einzelne TE-Kachel
    _teKachelHTML(te) {
      const status = te.status;

      // ── Status-Badge Label ──
      const badgeLabel = {
        erwartet:    'Erwartet',
        ankunft:     'Eingetroffen',
        entladen:    'Wird entladen',
        eingelagert: 'Eingelagert',
        abgefahren:  'Abgefahren',
        'verzögert': 'Verzögert',
      }[status] ?? status;

      // ── Fortschrittsbalken ──
      // 6 Schritte: Ankunft, Angedockt, Entladen▶, Entladen■, WE-Buchung, Abfahrt
      const tsFelder = [
        te.tsAnkunft, te.tsAngedockt, te.tsEntladenStart,
        te.tsEntladenEnde, te.tsWeBuchung, te.tsAbfahrt,
      ];
      const isVerspaetet = status === 'verzögert';

      const schritte = tsFelder.map((ts, i) => {
        const isDone   = ts !== null;
        const isActive = !isDone && i === te.fortschritt; // erster offener Schritt
        let cls = 'tc-step';
        if (isDone)    cls += isVerspaetet ? ' late' : ' done';
        if (isActive)  cls += isVerspaetet ? ' active late' : ' active';
        return `<div class="${cls}"></div>`;
      }).join('');

      // ── Δ-Zeit Badge ──
      let deltaHTML = '';
      if (te.verzoegerungMin != null && te.verzoegerungMin > 0) {
        deltaHTML = `<span class="tc-delta pos">${fmtDauer(te.verzoegerungMin)}</span>`;
      } else if (status === 'abgefahren' || status === 'eingelagert') {
        deltaHTML = `<span class="tc-delta neg">pünktlich</span>`;
      }

      // ── Meta-Infos ──
      const anzahlProdukte = te.produkte.length;
      const hallen = [...new Set(te.produkte.map(p => p.halle).filter(Boolean))];
      const halleText = hallen.length > 0 ? hallen.join('/') : (te.halle ?? '–');

      const zeitText = te.tsAnkunft
        ? `ab ${fmtTime(te.tsAnkunft)}`
        : te.geplantStart
          ? `geplant ${fmtTime(te.geplantStart)}`
          : '';

      // ── Hinweis-Flag ──
      const hintFlag = te.teHinweis
        ? `<div class="tc-hint-flag" title="${esc(te.teHinweis)}">⚠</div>`
        : '';

      return /* html */`
        <div class="te-card s-${esc(status)}" data-te="${esc(te.te)}" role="button" tabindex="0"
             aria-label="TE ${esc(te.te)}, Status: ${esc(badgeLabel)}">
          ${hintFlag}
          <div class="tc-header">
            <div class="tc-meta">
              <div class="tc-te-nr">${esc(te.te)}</div>
              <div class="tc-supplier">${esc(te.lieferantName ?? '–')}</div>
            </div>
            <span class="tc-badge badge-${esc(status)}">${esc(badgeLabel)}</span>
            ${te.tor ? `<span class="tor-badge-card">${esc(te.tor)}</span>` : ''}
          </div>
          <div class="tc-progress">${schritte}</div>
          <div class="tc-footer">
            ${this._lsBadgeHTML(te.ladestelle ?? 'Landverkehr')}
            ${anzahlProdukte > 0
              ? `<span class="tc-info"><span class="tc-info-icon">📦</span>${anzahlProdukte} Produkt${anzahlProdukte !== 1 ? 'e' : ''}</span>`
              : ''}
            ${halleText !== '–'
              ? `<span class="tc-info"><span class="tc-info-icon">🏭</span>H ${esc(halleText)}</span>`
              : ''}
            ${zeitText
              ? `<span class="tc-info"><span class="tc-info-icon">🕐</span>${esc(zeitText)}</span>`
              : ''}
            ${deltaHTML}
          </div>
        </div>
      `;
    }

    // ── Render: Detail ───────────────────────────────────────────────────

    _renderDetail(teNr) {
      this._activeTE = teNr;
      const te = this._teMap.get(teNr);
      const content = this._$('detail-content');
      if (!te || !content) return;

      content.innerHTML = this._detailHTML(te);
      this._switchView('detail');
    }

    // Baut das komplette HTML für den Detail-View einer TE
    _detailHTML(te) {
      const status = te.status;
      const isVerspaetet = status === 'verzögert';

      // ── Header-Delta ──
      let deltaHTML = '';
      if (te.verzoegerungMin != null && te.verzoegerungMin > 0) {
        deltaHTML = `<span class="dh-delta pos">${fmtDauer(te.verzoegerungMin)} Verzögerung</span>`;
      } else if (status === 'abgefahren' || status === 'eingelagert') {
        deltaHTML = `<span class="dh-delta neg">Pünktlich abgewickelt</span>`;
      }

      // ── Hinweis-Box ──
      const hintHTML = te.teHinweis
        ? `<div class="detail-hint">
             <span class="detail-hint-icon">⚠</span>
             <span><strong>TE-Hinweis:</strong> ${esc(te.teHinweis)}</span>
           </div>`
        : '';

      // ── Metadaten (linke Spalte) ──
      const metaLinks = [
        ['Transporteinheit',  te.te],
        ['Bestellnummer',     te.bestellnummer],
        ['Liefernummer',      te.liefernummer],
        ['Lieferant-Nr.',     te.lieferantNr],
        ['Transportmittel',   te.transportmittel],
        ['Einlagerungshalle', te.halle ?? ([...new Set(te.produkte.map(p => p.halle).filter(Boolean))].join(' / ') || '–')],
        ['Geplant ab',        fmtTime(te.geplantStart)],
        ['Geplant bis',       fmtTime(te.geplantEnde)],
      ].filter(([, v]) => v != null);

      // ── Zeitdifferenzen (rechte Spalte) ──
      const andockenMin   = diffMin(te.tsAnkunft, te.tsAngedockt);
      const warteMin      = diffMin(te.tsAngedockt, te.tsEntladenStart);
      const entladenMin   = diffMin(te.tsEntladenStart, te.tsEntladenEnde ?? te.tsEntladenTat);
      const weBuchMin     = diffMin(te.tsEntladenEnde ?? te.tsEntladenTat, te.tsWeBuchung);
      const abfahrtMin    = diffMin(te.tsWeBuchung, te.tsAbfahrt);
      const gesamtMin     = diffMin(te.tsAnkunft, te.tsAbfahrt);

      // Warte-Zeit ist kritisch wenn > VERZOEGERUNG_SCHWELLE_MIN
      const warteKlasse = (warteMin != null && warteMin > VERZOEGERUNG_SCHWELLE_MIN) ? 'bad' : 'ok';

      const zeitDiffs = [
        ['Ankunft → Andocken',     andockenMin,  false],
        ['Andocken → Entladestart', warteMin,    warteMin != null && warteMin > VERZOEGERUNG_SCHWELLE_MIN],
        ['Entladen Dauer',          entladenMin, false],
        ['Entladen → WE-Buchung',   weBuchMin,   false],
        ['WE-Buchung → Abfahrt',    abfahrtMin,  false],
        ['Gesamtdurchlaufzeit',     gesamtMin,   false],
      ].filter(([, v]) => v != null);

      // ── Zeitstrahl ──
      const tlHTML = this._zeitstrahlHTML(te, isVerspaetet);

      // ── Produkt-Tabelle ──
      const prodHTML = this._produktTabelleHTML(te);

      return /* html */`
        <div class="detail-panel">

          <!-- Header -->
          <div class="detail-header">
            <div>
              <div class="dh-te-nr">${esc(te.te)}</div>
              <div class="dh-supplier">${esc(te.lieferantName ?? '–')}${te.transportmittel ? ` · ${esc(te.transportmittel)}` : ''}</div>
            </div>
            <span class="tc-badge badge-${esc(status)}" style="margin-left:4px">${esc({
              erwartet: 'Erwartet', ankunft: 'Eingetroffen',
              entladen: 'Wird entladen', eingelagert: 'Eingelagert',
              abgefahren: 'Abgefahren', 'verzögert': 'Verzögert',
            }[status] ?? status)}</span>
            <div class="dh-spacer"></div>
            ${deltaHTML}
          </div>

          <!-- Body -->
          <div class="detail-body">

            ${hintHTML}

            <!-- Zeitstrahl -->
            <div class="d-section">
              <div class="d-section-title">Prozess-Zeitstrahl</div>
              <div class="tl-legend">
                <div class="tl-legend-item">
                  <div class="tl-legend-swatch" style="background:var(--c-border2);
                    background: repeating-linear-gradient(90deg,var(--c-text3) 0,var(--c-text3) 5px,transparent 5px,transparent 10px);
                    opacity:0.45"></div>
                  Soll-Zeitfenster
                </div>
                <div class="tl-legend-item">
                  <div class="tl-legend-swatch" style="background:var(--c-green)"></div>
                  Pünktlich
                </div>
                <div class="tl-legend-item">
                  <div class="tl-legend-swatch" style="background:var(--c-yellow)"></div>
                  Leichte Verzögerung
                </div>
                <div class="tl-legend-item">
                  <div class="tl-legend-swatch" style="background:var(--c-red)"></div>
                  Verzögert
                </div>
              </div>
              ${tlHTML}
            </div>

            <!-- Metadaten + Zeitdifferenzen -->
            <div class="d-cols">
              <div>
                <div class="d-section-title">Sendungsinfo</div>
                <div class="d-info-list">
                  ${metaLinks.map(([k, v]) =>
                    `<div class="d-info-row">
                       <span class="d-info-key">${esc(k)}</span>
                       <span class="d-info-val">${esc(v)}</span>
                     </div>`
                  ).join('')}
                </div>
              </div>
              <div>
                <div class="d-section-title">Zeitdifferenzen</div>
                <div class="d-info-list">
                  ${zeitDiffs.map(([k, v, warn]) => {
                    const cls = warn ? 'bad' : (v != null && v > 0 ? '' : 'ok');
                    const warnIcon = warn ? ' ⚠' : '';
                    return `<div class="d-info-row">
                       <span class="d-info-key">${esc(k)}</span>
                       <span class="d-info-val ${cls}">${esc(fmtDauer(v))}${warnIcon}</span>
                     </div>`;
                  }).join('')}
                </div>
              </div>
            </div>

            <!-- Produkte -->
            <div class="d-section">
              <div class="d-section-title">Produkte (${te.produkte.length})</div>
              ${prodHTML}
            </div>

          </div>
        </div>
      `;
    }

    // Baut den SVG-freien CSS-Zeitstrahl
    _zeitstrahlHTML(te, isVerspaetet) {
      // Alle Punkte mit Timestamp, Label und Soll-Referenz
      const punkte = [
        { ts: te.tsAnkunft,        label: 'Ankunft\nPförtner',  soll: te.geplantStart },
        { ts: te.tsAngedockt,      label: 'Tor\nangedockt',     soll: null },
        { ts: te.tsEntladenStart,  label: 'Entladen\ngestartet',soll: te.geplantStart },
        { ts: te.tsEntladenEnde ?? te.tsEntladenTat,
                                   label: 'Entladen\nbeendet',  soll: te.geplantEnde },
        { ts: te.tsWeBuchung,      label: 'WE\ngebucht',        soll: null },
        { ts: te.tsAbfahrt,        label: 'Abfahrt',            soll: null },
      ];

      // Zeitbereich für Positionierung bestimmen
      // Alle vorhandenen Timestamps + Soll-Zeiten sammeln
      const alleDaten = [
        ...punkte.map(p => p.ts).filter(Boolean),
        te.geplantStart, te.geplantEnde,
      ].filter(Boolean);

      if (alleDaten.length === 0) {
        return `<div class="view-placeholder" style="min-height:80px;">Keine Zeitstempel vorhanden</div>`;
      }

      const minTs = new Date(Math.min(...alleDaten.map(d => d.getTime())));
      const maxTs = new Date(Math.max(...alleDaten.map(d => d.getTime())));

      // Etwas Puffer links und rechts
      const pufferMs = Math.max((maxTs - minTs) * 0.08, 5 * 60000);
      const startMs  = minTs.getTime() - pufferMs;
      const endMs    = maxTs.getTime() + pufferMs;
      const spanMs   = endMs - startMs;

      // Prozent-Position eines Timestamps auf der Achse (0–100%)
      const pct = (d) => d ? ((d.getTime() - startMs) / spanMs * 100).toFixed(2) : null;

      // Soll-Balken
      const sollHTML = (te.geplantStart && te.geplantEnde)
        ? `<div class="tl-soll-bar" style="left:${pct(te.geplantStart)}%; width:${(pct(te.geplantEnde) - pct(te.geplantStart)).toFixed(2)}%"></div>`
        : '';

      // Segmente zwischen aufeinanderfolgenden vorhandenen Punkten
      let segHTML = '';
      const vorhandene = punkte.filter(p => p.ts !== null);
      for (let i = 0; i < vorhandene.length - 1; i++) {
        const a = vorhandene[i].ts;
        const b = vorhandene[i + 1].ts;
        const l = pct(a);
        const w = (pct(b) - pct(a)).toFixed(2);
        // Segment-Farbe: rot wenn Verzögerung > Schwelle zwischen Andocken und Entladestart
        const isKritisch = isVerspaetet && i === 1; // Andocken → Entladestart
        const cls = isKritisch ? 'bad' : 'ok';
        segHTML += `<div class="tl-segment ${cls}" style="left:${l}%; width:${w}%"></div>`;
      }

      // Punkte mit Labels und optionalem Δ-Chip
      let punkteHTML = '';
      for (const p of punkte) {
        if (!p.ts) continue;
        const pos = pct(p.ts);
        const dotCls = isVerspaetet && p.soll && diffMin(p.soll, p.ts) > VERZOEGERUNG_SCHWELLE_MIN
          ? 'bad' : 'ok';

        // Δ-Chip nur wenn Soll vorhanden und Abweichung > 5min
        let chipHTML = '';
        if (p.soll) {
          const delta = diffMin(p.soll, p.ts);
          if (delta != null && Math.abs(delta) > 5) {
            const chipCls = delta > 0 ? 'pos' : 'neg';
            chipHTML = `<div class="tl-delta-chip ${chipCls}">${fmtDauer(delta)}</div>`;
          }
        }

        // Label mit Zeilenumbruch über \n
        const labelLines = p.label.split('\n').map(l => `<span>${esc(l)}</span>`).join('<br>');

        punkteHTML += `
          <div class="tl-point" style="left:${pos}%">
            ${chipHTML}
            <div class="tl-dot ${dotCls}"></div>
            <div class="tl-time">${fmtTime(p.ts)}</div>
            <div class="tl-label">${labelLines}</div>
          </div>`;
      }

      return `
        <div class="tl-wrap">
          <div class="tl-track">
            <div class="tl-base"></div>
            ${sollHTML}
            ${segHTML}
            ${punkteHTML}
          </div>
        </div>`;
    }

    // Baut die Produkt-Tabelle
    _produktTabelleHTML(te) {
      if (te.produkte.length === 0) {
        return `<div class="view-placeholder" style="min-height:60px;">Keine Produktdaten</div>`;
      }

      const rows = te.produkte.map(p => {
        const eingelagert = p.tsEinlagerung
          ? `<span class="pt-time">${fmtTime(p.tsEinlagerung)}</span>`
          : `<span class="pt-time open">–</span>`;

        return `
          <tr>
            <td class="pt-nr">${esc(p.nr)}</td>
            <td class="pt-name">${esc(p.name)}</td>
            <td class="pt-menge">${fmtNum(p.menge)} ${esc(p.einheit)}</td>
            <td><span class="pt-halle">${esc(p.halle || te.halle || '–')}</span></td>
            <td>${eingelagert}</td>
          </tr>`;
      }).join('');

      return `
        <table class="prod-table">
          <thead>
            <tr>
              <th>Produkt-Nr.</th>
              <th>Bezeichnung</th>
              <th style="text-align:right">Menge</th>
              <th>Halle</th>
              <th>Eingelagert</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // ── Render: Gantt ────────────────────────────────────────────────────

    _ganttFensterBereich() {
      const anker = new Date(this._ganttDatum);
      anker.setHours(0, 0, 0, 0);
      switch (this._ganttFenster) {
        case '3tage':
          return { start: anker, ende: new Date(anker.getTime() + 3 * 86400000) };
        case 'woche': {
          const tag = anker.getDay();
          const diff = (tag === 0 ? -6 : 1 - tag);
          const mo = new Date(anker.getTime() + diff * 86400000);
          return { start: mo, ende: new Date(mo.getTime() + 7 * 86400000) };
        }
        default: // 'tag'
          return { start: anker, ende: new Date(anker.getTime() + 86400000) };
      }
    }

    _ganttNavigiere(richtung) {
      const schrittTage = { tag: 1, '3tage': 3, woche: 7 }[this._ganttFenster] ?? 1;
      this._ganttDatum = new Date(this._ganttDatum.getTime() + richtung * schrittTage * 86400000);
      this._renderGantt();
    }

    _renderGantt() {
      const content = this._$('gantt-content');
      if (!content) return;

      const { start, ende } = this._ganttFensterBereich();

      // Datum-Label in Steuerleiste
      const navDate = this._$('gantt-nav-date');
      if (navDate) {
        const fmt = (d) => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
        navDate.textContent = this._ganttFenster === 'tag'
          ? this._ganttDatum.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' })
          : fmt(start) + ' – ' + fmt(new Date(ende.getTime() - 86400000));
      }

      const tes = [...this._teMap.values()].filter(te => {
        const anker = te.geplantStart ?? te.tsAnkunft;
        return anker && anker >= start && anker < ende;
      });

      if (tes.length === 0) {
        content.innerHTML = '<div class="view-placeholder" style="min-height:200px;margin-top:0;">Keine TEs im gewählten Zeitfenster</div>';
        return;
      }

      content.innerHTML = this._ganttHTML(tes, start, ende);

      content.onclick = (e) => {
        const bar = e.target.closest('.gantt-bar-ist[data-te]');
        if (bar) this._renderDetail(bar.dataset.te);
        const row = e.target.closest('.gantt-row[data-te]');
        if (row && !bar) this._renderDetail(row.dataset.te);
      };
    }

    _ganttHTML(tes, fensterStart, fensterEnde) {
      const jetzt = new Date();

      // ── Achse = exakt das gewählte Fenster ──
      // Fallback falls Parameter fehlen (z.B. beim ersten Render)
      const achseStart   = fensterStart instanceof Date ? fensterStart : new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
      const achseEnde    = fensterEnde   instanceof Date ? fensterEnde  : new Date(achseStart.getTime() + 86400000);
      const spanMs       = achseEnde.getTime() - achseStart.getTime();
      const spanStunden  = spanMs / 3600000;
      const tesFuerGantt = tes; // bereits von _renderGantt gefiltert

      // Prozent-Position auf der Achse
      const pct = (d) => ((d.getTime() - achseStart.getTime()) / spanMs * 100).toFixed(3);

      // ── Adaptive Ticks ──
      // < 24h  → 1h-Ticks mit Uhrzeit
      // 24–72h → 2h-Ticks mit Uhrzeit
      // > 72h  → 6h-Ticks mit Datum+Uhrzeit
      let tickIntervallH, tickFormat;
      if (spanStunden <= 24) {
        tickIntervallH = 1;
        tickFormat = (d) => fmtTime(d);
      } else if (spanStunden <= 72) {
        tickIntervallH = 2;
        tickFormat = (d) => fmtTime(d);
      } else {
        tickIntervallH = 6;
        tickFormat = (d) => {
          const tag  = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
          const zeit = fmtTime(d);
          return d.getHours() === 0 ? tag : zeit;
        };
      }

      const ticks = [];
      const tickStart = new Date(achseStart);
      while (tickStart <= achseEnde) {
        // Nur Ticks die auf das Intervall passen
        if (tickStart.getHours() % tickIntervallH === 0) {
          ticks.push(new Date(tickStart));
        }
        tickStart.setTime(tickStart.getTime() + 3600000); // +1h
      }

      const ticksHTML = ticks.map(t =>
        `<div class="gantt-tick" style="left:${pct(t)}%">
           <div class="gantt-tick-line"></div>
           <div class="gantt-tick-label">${esc(tickFormat(t))}</div>
         </div>`
      ).join('');

      // Vertikale Gitterlinien — nur bei Haupt-Ticks
      const gridLines = ticks.map(t =>
        `<div class="gantt-grid-line" style="left:${pct(t)}%"></div>`
      ).join('');

      // Jetzt-Linie (nur wenn im Zeitbereich)
      const jetztInRange = jetzt >= achseStart && jetzt <= achseEnde;
      const nowLineHTML  = jetztInRange
        ? `<div class="gantt-now-line" style="left:${pct(jetzt)}%">
             <div class="gantt-now-label">JETZT</div>
           </div>`
        : '';

      // ── Zeilen nach Ladestelle gruppiert ──
      const LS_ORDER = ['BSL', 'Container', 'Landverkehr'];
      const LS_META  = {
        BSL:         { icon: '🚛', col: 'rgba(142,68,173,0.85)', dauer: '4–8h'     },
        Container:   { icon: '🏗', col: 'rgba(230,126,34,0.85)', dauer: '2–4h'     },
        Landverkehr: { icon: '🚚', col: 'rgba(39,174,96,0.85)',  dauer: '30–90min' },
      };
      const byLS = {};
      for (const te of tesFuerGantt) {
        const ls = te.ladestelle ?? 'Landverkehr';
        if (!byLS[ls]) byLS[ls] = [];
        byLS[ls].push(te);
      }
      const zeilenHTML = LS_ORDER
        .filter(ls => byLS[ls]?.length > 0)
        .map(ls => {
          const m  = LS_META[ls];
          const gr = byLS[ls];
          const vz = gr.filter(t => t.status === 'verzögert').length;
          const gh = `<div class="gantt-group-header">
            <div class="gantt-group-accent" style="background:${m.col}"></div>
            <span class="gantt-group-title" style="color:${m.col}">${m.icon} ${ls}</span>
            <span class="gantt-group-count">${gr.length} TE${gr.length !== 1 ? 's' : ''}</span>
            ${vz ? `<span class="gantt-group-count" style="background:var(--c-red-dim);color:#e74c3c">${vz} verzögert</span>` : ''}
            <div style="flex:1"></div>
            <span style="font-family:var(--font-mono);font-size:9px;color:var(--c-text3)">Ø ${m.dauer}</span>
          </div>`;
          return gh + gr.map(te => this._ganttZeileHTML(te, pct, achseStart, achseEnde, gridLines, nowLineHTML)).join('');
        }).join('');

      return `
        <div class="gantt-wrap">
          <div class="gantt-inner">

            <!-- Kopfzeile mit Uhrzeiten -->
            <div class="gantt-head">
              <div class="gantt-label-col">Transporteinheit</div>
              <div class="gantt-axis">${ticksHTML}</div>
            </div>

            <!-- Datenzeilen (nach Ladestelle gruppiert) -->
            ${zeilenHTML}

            <!-- Legende -->
            <div class="gantt-legend">
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch"
                  style="background:var(--c-bg4);border:1px solid var(--c-border2)"></div>
                Geplantes Zeitfenster
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:var(--c-green)"></div>
                Pünktlich
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:var(--c-yellow)"></div>
                Leichte Verzögerung
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:var(--c-red)"></div>
                Stark verzögert
              </div>
            </div>

          </div>
        </div>`;
    }

    // Baut eine einzelne Gantt-Zeile für eine TE
    _ganttZeileHTML(te, pct, achseStart, achseEnde, gridLines, nowLineHTML) {

      // ── Soll-Balken ──
      let sollHTML = '';
      if (te.geplantStart && te.geplantEnde) {
        const l = pct(te.geplantStart);
        const w = (pct(te.geplantEnde) - parseFloat(l)).toFixed(3);
        if (parseFloat(w) > 0) {
          sollHTML = `<div class="gantt-bar-soll" style="left:${l}%;width:${w}%"
            title="Geplant: ${fmtTime(te.geplantStart)}–${fmtTime(te.geplantEnde)}"></div>`;
        }
      }

      // ── Ist-Balken ──
      // Startpunkt: frühester vorhandener Timestamp
      // Endpunkt: Abfahrt → WE-Buchung → Entladen-Ende → Jetzt (wenn noch aktiv)
      let istStart = te.tsAnkunft ?? te.tsAngedockt ?? te.tsEntladenStart;
      let istEnde  = te.tsAbfahrt ?? te.tsWeBuchung ??
                     (te.tsEntladenEnde ?? te.tsEntladenTat) ?? null;

      // Wenn TE noch aktiv und kein Ende: bis Jetzt darstellen (gestrichelt wäre schöner,
      // aber CSS-only — stattdessen leicht transparent machen via dim-Klasse)
      const istLaufend = istStart && !te.tsAbfahrt;
      if (istLaufend && !istEnde) istEnde = new Date();

      let istHTML = '';
      let labelHTML = '';
      if (istStart && istEnde) {
        // Abschneiden wenn außerhalb der Achse
        const clampedStart = new Date(Math.max(istStart.getTime(), achseStart.getTime()));
        const clampedEnde  = new Date(Math.min(istEnde.getTime(),  achseEnde.getTime()));
        const l = pct(clampedStart);
        const w = (pct(clampedEnde) - parseFloat(l)).toFixed(3);

        if (parseFloat(w) > 0) {
          // Farbe basierend auf Verzögerung
          let cls = 'ok';
          if (te.verzoegerungMin != null) {
            if (te.verzoegerungMin >= VERZOEGERUNG_SCHWELLE_MIN * 2) cls = 'bad';
            else if (te.verzoegerungMin >= VERZOEGERUNG_SCHWELLE_MIN) cls = 'mild';
          }
          if (te.status === 'abgefahren') cls = 'dim';

          const tooltip = `${esc(te.te)}: ${fmtTime(istStart)}–${fmtTime(istEnde)}` +
            (te.verzoegerungMin ? ` · ${fmtDauer(te.verzoegerungMin)} Verzögerung` : '');

          istHTML = `<div class="gantt-bar-ist ${cls}" data-te="${esc(te.te)}"
            style="left:${l}%;width:${w}%"
            title="${tooltip}"></div>`;

          // Balken-Label: TE-Nummer + Zeiten wenn breit genug
          const breiteProzent = parseFloat(w);
          if (breiteProzent > 4) {
            const labelText = breiteProzent > 8
              ? `${fmtTime(istStart)}–${fmtTime(istEnde)}`
              : fmtTime(istStart);
            labelHTML = `<div class="gantt-bar-label"
              style="left:${l}%;width:${w}%">${esc(labelText)}</div>`;
          }
        }
      }

      return `
        <div class="gantt-row" data-te="${esc(te.te)}"
             role="button" tabindex="0"
             aria-label="TE ${esc(te.te)}, ${esc(te.lieferantName ?? '')}">
          <div class="gantt-row-label">
            <div class="gantt-row-te">${esc(te.te)}</div>
            <div class="gantt-row-supplier">
              ${te.tor ? `<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--c-text3);background:var(--c-bg4);border:1px solid var(--c-border2);border-radius:3px;padding:1px 4px">${esc(te.tor)}</span>` : ''}
              ${esc(te.lieferantName ?? '–')}
            </div>
          </div>
          <div class="gantt-bars">
            ${gridLines}
            ${nowLineHTML}
            ${sollHTML}
            ${istHTML}
            ${labelHTML}
          </div>
        </div>`;
    }

    // ── Render: Tore (Hallen-Accordion, Engpass-priorisiert) ──────────────

    _renderTore() {
      const content = this._$('tore-content');
      if (!content) return;

      const tes = [...this._teMap.values()];

      // Tor-Belegung aus TEs ableiten (nur aktive TEs belegen ein Tor)
      const torBelegung = new Map(); // torNr → TE
      for (const te of tes) {
        if (te.tor && !['abgefahren', 'erwartet'].includes(te.status)) {
          torBelegung.set(String(te.tor), te);
        }
      }

      // Hallen aus TOR_HALLE_MAP — alle bekannten Hallen, nicht nur aus den Daten
      // Pro Halle: TEs die an einem ihrer Tore hängen
      const hallenData = HALLEN_REIHENFOLGE.map(h => {
        const toreDieserHalle = new Set(HALLE_TORE_MAP[h] || []);
        const teInHalle = tes.filter(te => {
          // TE ist dieser Halle zugeordnet wenn: eigenes Tor, eigene Halle, oder Produkt-Halle
          if (te.tor && toreDieserHalle.has(te.tor)) return true;
          if (te.halle === h) return true;
          return te.produkte.some(p => p.halle === h);
        });
        const belegt = teInHalle.filter(te => !['abgefahren', 'erwartet'].includes(te.status));
        const verz   = teInHalle.filter(te => te.status === 'verzögert');
        // Tore dieser Halle mit Belegungsstatus
        const torStatus = [...toreDieserHalle].map(tor => {
          const belegteTE = belegt.find(te => te.tor === tor);
          return { tor, te: belegteTE || null };
        });
        return { halle: h, teInHalle, belegt, verz, anzahl: teInHalle.length, torStatus };
      }).filter(h => h.teInHalle.length > 0 || h.torStatus.length > 0);

      // ENGPASS-PRIORISIERUNG: Hallen mit Verzögerungen zuerst
      hallenData.sort((a, b) => {
        if (b.verz.length !== a.verz.length) return b.verz.length - a.verz.length;
        return b.belegt.length - a.belegt.length;
      });

      // Engpass-Banner
      const totalVerz = hallenData.reduce((s, h) => s + h.verz.length, 0);
      let bannerHTML = '';
      if (totalVerz > 0) {
        const engpassHallen = hallenData.filter(h => h.verz.length > 0)
          .map(h => 'Halle ' + h.halle).join(', ');
        bannerHTML = `<div class="engpass-banner">
          <span class="engpass-icon">⚠</span>
          <span class="engpass-text"><strong>${totalVerz} verzögerte TE${totalVerz !== 1 ? 's' : ''}</strong> in ${esc(engpassHallen)} — Engpass-Hallen zuerst</span>
        </div>`;
      }

      // Hallen-Sektionen
      const sektionen = hallenData.map(h => {
        const auslastung = h.anzahl > 0 ? Math.round(h.belegt.length / h.anzahl * 100) : 0;

        let headerCls = 'halle-header';
        if (h.verz.length > 0) headerCls += ' engpass';
        else if (auslastung >= 80) headerCls += ' voll';

        // Freie Tore: alle Tore dieser Halle die keine aktive TE haben
        const belegteTorenummern = new Set(h.belegt.map(te => te.tor).filter(Boolean));
        const alleTorenummern    = HALLE_TORE_MAP[h.halle] ?? [];
        const freie              = alleTorenummern.filter(tor => !belegteTorenummern.has(tor));
        const freieToreAnzahl    = freie.length;

        const freieToreHTML = freie.length > 0 ? `
          <div class="frei-tore-wrap" id="frei-${esc(h.halle)}">
            <span class="frei-tore-label">${freie.length} freie Tore</span>
            <div class="frei-tore-strip">
              ${freie.map(tor => `<span class="frei-tor-tag">${esc(tor)}</span>`).join('')}
            </div>
          </div>` : '';

        // Tor-Karten für belegte TEs
        const torKarten = h.belegt.map(te => this._torKarteHTML(te)).join('');

        return `<div class="halle-section">
          <div class="${headerCls}" data-halle="${esc(h.halle)}">
            <span class="h-toggle">▶</span>
            <span class="h-num">Halle ${esc(h.halle)}</span>
            <div class="h-stats">
              <span class="hs-b">${h.belegt.length} aktiv</span>
              <span class="hs-f">${(HALLE_TORE_MAP[h.halle]||[]).length} Tore</span>
              ${h.verz.length > 0 ? `<span class="hs-v">${h.verz.length} ⚠</span>` : ''}
            </div>
            <div class="h-sep"></div>
            <span class="h-util-pct">${auslastung}%</span>
            ${freieToreAnzahl > 0 ? `
            <button class="frei-toggle-btn" data-halle="${esc(h.halle)}" title="Freie Tore ein-/ausblenden">
              <span>○</span> ${freieToreAnzahl} frei
            </button>` : ''}
          </div>
          <div class="halle-body">
            ${torKarten || '<div style="grid-column:1/-1;padding:12px;font-family:var(--font-mono);font-size:10px;color:var(--c-text3)">Keine aktiven TEs</div>'}
            ${freieToreHTML}
          </div>
        </div>`;
      }).join('');

      content.innerHTML = bannerHTML + sektionen;

      // Accordion-Toggle + Frei-Toggle + Klick auf Tor-Karte
      content.onclick = (e) => {
        // Frei-Tore-Toggle — vor Accordion prüfen damit Button-Klick
        // nicht den Accordion des Eltern-Headers auslöst
        const freiBtn = e.target.closest('.frei-toggle-btn');
        if (freiBtn) {
          e.stopPropagation();
          const halle = freiBtn.dataset.halle;
          const wrap  = this._shadow.getElementById('frei-' + halle);
          if (wrap) {
            const isVisible = wrap.classList.toggle('visible');
            freiBtn.classList.toggle('active', isVisible);
            freiBtn.querySelector('span').textContent = isVisible ? '●' : '○';
          }
          return;
        }

        // Accordion-Toggle
        const header = e.target.closest('.halle-header');
        if (header) {
          const section = header.closest('.halle-section');
          const body    = section?.querySelector('.halle-body');
          const toggle  = header.querySelector('.h-toggle');
          if (body)   body.classList.toggle('open');
          if (toggle) toggle.classList.toggle('open');
          return;
        }

        // Klick auf Tor-Karte → Detail
        const karte = e.target.closest('.tor-karte[data-te]');
        if (karte) this._renderDetail(karte.dataset.te);
      };
    }

    // Baut eine Tor-Karte für die Hallen-Ansicht
    _torKarteHTML(te) {
      const isV = te.status === 'verzögert';

      // Restzeit-Schätzung (Platzhalter-Logik bis echte Sollwerte vorliegen)
      let restzeit, rzCls;
      if (te.status === 'eingelagert') {
        restzeit = 'fertig'; rzCls = 'rz-ok';
      } else if (isV) {
        restzeit = '⚠ offen'; rzCls = 'rz-bad';
      } else {
        restzeit = 'läuft'; rzCls = 'rz-ok';
      }

      // Fortschritt (5 Stufen)
      const fp = { ankunft: 1, entladen: 3, eingelagert: 5, 'verzögert': 2 }[te.status] || 0;
      const steps = [0,1,2,3,4].map(i => {
        let cls = 'tc2-step';
        if (i < fp) cls += isV ? ' late' : ' done';
        else if (i === fp) cls += ' act';
        return `<div class="${cls}"></div>`;
      }).join('');

      const torLabel = te.tor ? 'T' + String(te.tor).padStart(3, '0') : '–';

      return `<div class="tor-karte t-${esc(te.status)}" data-te="${esc(te.te)}">
        <div class="tc2-top">
          <span class="tc2-num">${esc(torLabel)}</span>
          <span class="tc2-dot dot-${esc(te.status)}"></span>
          <span class="tc2-te">${esc(te.te)}</span>
          <span class="tc2-restzeit ${rzCls}">${restzeit}</span>
        </div>
        <div class="tc2-steps">${steps}</div>
        <div class="tc2-bottom">
          <span class="tc2-sup">${esc(te.lieferantName ?? '–')}</span>
          <span class="tc2-info">📦 ${te.produkte.length}</span>
        </div>
      </div>`;
    }

    // ── Haupt-Render ─────────────────────────────────────────────────────

    _render() {
      this._hideLoading();

      if (this._teMap.size === 0) {
        this._showEmpty();
        return;
      }

      this._updateKPIs();
      this._renderKacheln();
      this._renderGantt();
    }

    // ── SAC DataSource-Setter ─────────────────────────────────────────────
    //   Einstiegspunkt für BW-Datenbindung — SAC ruft diesen auf sobald
    //   neue Daten verfügbar sind

    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;

      if (!dataBinding || dataBinding.state !== 'success') {
        this._showLoading();
        return;
      }

      const rows = dataBinding.data ?? [];
      console.info(`[WE-Tracker] myDataSource: ${rows.length} Rows empfangen`);

      this._teMap = parseRows(rows);
      console.info(`[WE-Tracker] ${this._teMap.size} TEs geparst`);

      this._render();
    }

    // ── Public API (aufrufbar via SAC-Script) ─────────────────────────────

    refreshData() {
      if (this._dataBinding) {
        this.myDataSource = this._dataBinding;
      }
    }

    setTheme(theme) {
      if (theme === 'dark' || theme === 'light') {
        this._theme = theme;
        this._applyTheme();
      }
    }

    setView(view) {
      if (['kacheln', 'detail', 'gantt'].includes(view)) {
        this._switchView(view);
      }
    }

    setStatusFilter(status) {
      this._activeFilter = status;
      this._shadow.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.filter === status);
      });
      this._renderKacheln();
    }

    setHalleFilter(halle) {
      this._halleFilter = halle || null;
      this._renderKacheln();
    }
  }

  // Idempotente Registrierung (safe bei HMR / Doppel-Load)
  if (!customElements.get(TAG)) {
    customElements.define(TAG, WEEingangWidget);
  }

})();
