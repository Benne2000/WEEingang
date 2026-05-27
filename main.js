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

  // Liest einen Dimension-Wert aus einer BW-Datenzeile
  // BW-Feldnamen können variieren – versucht mehrere Schlüssel
  const readDim = (row, ...keys) => {
    for (const key of keys) {
      const v = row[key];
      if (!isNull(v)) return String(v).trim();
    }
    return null;
  };

  // Liest einen Measure-Wert aus einer BW-Datenzeile
  const readVal = (row, ...keys) => {
    for (const key of keys) {
      const v = row[key];
      if (v != null && !isNull(String(v))) return Number(v);
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
if (!window._weDebugLogged) {
  console.log('[WE-Tracker] Row-Keys:', Object.keys(rows[0]));
  console.log('[WE-Tracker] Row-Sample:', JSON.stringify(rows[0]));
  window._weDebugLogged = true;
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
      .view-tabs {
        display:    flex;
        border:     1px solid var(--c-border2);
        border-radius: var(--r-sm);
        overflow:   hidden;
        flex-shrink: 0;
      }

      .view-tab {
        padding:        5px 13px;
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color:          var(--c-text3);
        transition:     background 0.15s, color 0.15s;
      }

      .view-tab:hover  { background: var(--c-bg3); color: var(--c-text2); }
      .view-tab.active { background: var(--c-red); color: #fff; }

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
        padding:    10px 16px;
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
        max-width:      168px;
        margin-top:     2px;
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

        <!-- View-Tabs -->
        <div class="view-tabs">
          <button class="view-tab active" data-view="kacheln">Übersicht</button>
          <button class="view-tab"        data-view="detail">Detail</button>
          <button class="view-tab"        data-view="gantt">Zeitstrahl</button>
        </div>

        <!-- Theme-Toggle -->
        <button class="theme-btn" id="theme-btn" title="Theme wechseln">◑</button>
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
            <span class="filter-label">Status</span>
            <div class="filter-chips" id="filter-chips">
              <button class="filter-chip active" data-filter="alle">Alle</button>
              <button class="filter-chip" data-filter="erwartet">Erwartet</button>
              <button class="filter-chip" data-filter="aktiv">Aktiv</button>
              <button class="filter-chip" data-filter="verzögert">Verzögert</button>
              <button class="filter-chip" data-filter="abgefahren">Abgefahren</button>
            </div>
          </div>
          <div class="te-grid" id="te-grid">
            <!-- Wird in Schritt 2 durch renderKacheln() befüllt -->
          </div>
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
          <div id="gantt-content">
            <!-- Wird in Schritt 4 durch renderGantt() befüllt -->
          </div>
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
      this._activeFilter = 'alle';      // aktiver Status-Filter
      this._theme       = 'dark';       // 'dark' | 'light'
      this._ac          = new AbortController(); // für alle Event-Listener
    }

    connectedCallback() {
      this._bindEvents();
      this._hideLoading();
    }

    disconnectedCallback() {
      // Alle Event-Listener in einem Zug entfernen
      this._ac.abort();
    }

    // ── Hilfsmethode: Element im Shadow DOM finden ───────────────────────

    _$(id) { return this._shadow.getElementById(id); }

    // ── Event-Binding ────────────────────────────────────────────────────

    _bindEvents() {
      const opts = { signal: this._ac.signal };

      // View-Tabs
      this._shadow.querySelectorAll('.view-tab').forEach(btn => {
        btn.addEventListener('click', () => this._switchView(btn.dataset.view), opts);
      });

      // Theme-Toggle
      this._$('theme-btn').addEventListener('click', () => this._toggleTheme(), opts);

      // Back-Button im Detail-View
      this._$('back-btn').addEventListener('click', () => {
        this._switchView('kacheln');
      }, opts);

      // Filter-Chips
      this._shadow.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this._activeFilter = chip.dataset.filter;
          this._shadow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this._renderKacheln();
        }, opts);
      });
    }

    // ── View-Switching ────────────────────────────────────────────────────

    _switchView(name) {
      // Views
      this._shadow.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      this._$(`view-${name}`)?.classList.add('active');
      // Tabs
      this._shadow.querySelectorAll('.view-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.view === name);
      });
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

    _updateKPIs() {
      const tes = [...this._teMap.values()];
      const aktiv      = tes.filter(t => ['ankunft', 'entladen'].includes(t.status)).length;
      const verzoegert = tes.filter(t => t.status === 'verzögert').length;
      const abgefahren = tes.filter(t => t.status === 'abgefahren').length;

      this._$('kpi-gesamt').textContent    = tes.length;
      this._$('kpi-aktiv').textContent     = aktiv;
      this._$('kpi-verzoegert').textContent = verzoegert;
      this._$('kpi-abgefahren').textContent = abgefahren;

      // Datum aus erster TE ableiten
      const ersteDatum = tes[0]?.tsAnkunft ?? tes[0]?.geplantStart;
      if (ersteDatum) {
        this._$('header-date').textContent = `Wareneingang · ${fmtDate(ersteDatum)}`;
      }
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

      const tes = [...this._teMap.values()]
        .filter(te => statusMatch(te) && halleMatch(te));

      if (tes.length === 0) {
        grid.innerHTML = `<div class="te-grid-empty">Keine TEs für diesen Filter</div>`;
        return;
      }

      grid.innerHTML = tes.map(te => this._teKachelHTML(te)).join('');

      // Klick-Handler: Delegation auf Grid-Ebene — ein Listener für alle Karten
      // (vorher jeden einzelnen click-handler pro Karte setzen würde bei vielen TEs
      //  zu O(n) Listener-Attachments führen)
      grid.onclick = (e) => {
        const card = e.target.closest('.te-card');
        if (card?.dataset.te) this._renderDetail(card.dataset.te);
      };
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
          </div>
          <div class="tc-progress">${schritte}</div>
          <div class="tc-footer">
            ${te.transportmittel
              ? `<span class="tc-info"><span class="tc-info-icon">🚛</span>${esc(te.transportmittel)}</span>`
              : ''}
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

    _renderGantt() {
      const content = this._$('gantt-content');
      if (!content) return;

      const tes = [...this._teMap.values()];
      if (tes.length === 0) {
        content.innerHTML = `<div class="view-placeholder" style="min-height:200px;">Keine Daten</div>`;
        return;
      }

      content.innerHTML = this._ganttHTML(tes);

      // Klick auf Ist-Balken → Detail öffnen (Delegation)
      content.onclick = (e) => {
        const bar = e.target.closest('.gantt-bar-ist[data-te]');
        if (bar) this._renderDetail(bar.dataset.te);
        const row = e.target.closest('.gantt-row[data-te]');
        if (row && !bar) this._renderDetail(row.dataset.te);
      };
    }

    _ganttHTML(tes) {
      const jetzt = new Date();

      // ── Zeitbereich ermitteln ──
      // Alle vorhandenen Start- und Endzeitpunkte je TE sammeln
      const alleDaten = [];
      for (const te of tes) {
        if (te.geplantStart)     alleDaten.push(te.geplantStart);
        if (te.geplantEnde)      alleDaten.push(te.geplantEnde);
        if (te.tsAnkunft)        alleDaten.push(te.tsAnkunft);
        if (te.tsAbfahrt)        alleDaten.push(te.tsAbfahrt);
        // Falls noch keine Abfahrt: Jetzt-Zeit als provisorisches Ende
        if (!te.tsAbfahrt && te.tsAnkunft) alleDaten.push(jetzt);
      }

      if (alleDaten.length === 0) {
        return `<div class="view-placeholder" style="min-height:200px;">Keine Zeitstempel vorhanden</div>`;
      }

      // Achse auf volle Stunden runden + Puffer
      const rawMin = Math.min(...alleDaten.map(d => d.getTime()));
      const rawMax = Math.max(...alleDaten.map(d => d.getTime()));
      const pufferMs  = Math.max((rawMax - rawMin) * 0.05, 30 * 60000);

      // Auf volle Stunde abrunden/aufrunden
      const achseStart = new Date(Math.floor((rawMin - pufferMs) / 3600000) * 3600000);
      const achseEnde  = new Date(Math.ceil( (rawMax + pufferMs) / 3600000) * 3600000);
      const spanMs     = achseEnde.getTime() - achseStart.getTime();

      // Prozent-Position auf der Achse
      const pct = (d) => ((d.getTime() - achseStart.getTime()) / spanMs * 100).toFixed(3);

      // ── Stunden-Ticks ──
      const ticks = [];
      const tickStart = new Date(achseStart);
      while (tickStart <= achseEnde) {
        ticks.push(new Date(tickStart));
        tickStart.setHours(tickStart.getHours() + 1);
      }

      const ticksHTML = ticks.map(t =>
        `<div class="gantt-tick" style="left:${pct(t)}%">
           <div class="gantt-tick-line"></div>
           <div class="gantt-tick-label">${fmtTime(t)}</div>
         </div>`
      ).join('');

      // Vertikale Gitterlinien (eine pro Stunde)
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

      // ── Zeilen ──
      const zeilenHTML = tes.map(te => this._ganttZeileHTML(te, pct, achseStart, achseEnde, gridLines, nowLineHTML)).join('');

      return `
        <div class="gantt-wrap">
          <div class="gantt-inner">

            <!-- Kopfzeile mit Uhrzeiten -->
            <div class="gantt-head">
              <div class="gantt-label-col">Transporteinheit</div>
              <div class="gantt-axis">${ticksHTML}</div>
            </div>

            <!-- Datenzeilen -->
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
            <div class="gantt-row-supplier">${esc(te.lieferantName ?? '–')}</div>
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
