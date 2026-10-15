/* =========================================================================
 * WE Strategie-Cockpit – SAC Custom Widget (v0.19.0) · Entwickler: Benne
 * Strategische Langzeitsicht auf den Wareneingangsprozess.
 * Erwartet voraggregierte Perioden-Daten (je KW/Monat × Segment), wie sie
 * BW über SUM/MIN/MAX/COUNT liefert. Kein Median (BW-Einschränkung) — das
 * Widget arbeitet mit Mittelwert + Min/Max-Band.
 * Dashboard aus animierten Trend-Kacheln, Zeitraum-Scrubber, Hover-Details.
 * ========================================================================= */
(function () {
  "use strict";

  // ── Kennzahl-Definitionen: was in den Kacheln als Trend läuft ──────────
  const METRICS = [
    { key: "dwell_avg",     label: "Ø Standzeit",      unit: "h",  band: ["dwell_min","dwell_max"],     lowerBetter: true,  targetProp: "targetDwell" },
    { key: "putaway_avg",   label: "Ø Einlagerung",    unit: "h",  band: ["putaway_min","putaway_max"], lowerBetter: true,  targetProp: "targetPutaway" },
    { key: "otif_quote",    label: "OTIF-Quote",       unit: "%",  pct: true,                            lowerBetter: false, targetProp: "targetOtif" },
    { key: "puenkt_quote",  label: "Pünktlichkeit",    unit: "%",  pct: true,                            lowerBetter: false, targetProp: "targetPuenkt" },
    { key: "wait_gate_avg", label: "Ø Wartezeit Tor",  unit: "h",  band: ["wait_gate_min","wait_gate_max"], lowerBetter: true, targetProp: "targetWaitGate" },
    { key: "sum_gewicht_t", label: "Durchsatz Gewicht",unit: "t",  sum: true,                            lowerBetter: false },
    { key: "sum_wert_keur", label: "Warenwert",        unit: "k€", sum: true,                            lowerBetter: false },
    { key: "anzahl_pos",    label: "Positionen",       unit: "",   sum: true,                            lowerBetter: false },
    { key: "anzahl_anl",    label: "Anlieferungen",    unit: "",   sum: true,                            lowerBetter: false },
    { key: "anzahl_te",     label: "Transporteinheiten (TE)", unit: "", sum: true,                        lowerBetter: false },
  ];

  /* Zentrale Kennzahl-Definitionen für Infobuttons UND Begriffsverzeichnis —
     eine Quelle, damit sich beide nie widersprechen können. Level-Badges
     bewusst kurz (TE / Position / TE+Position / BW), volle Erklärung im Popup. */
  const METRIC_INFO = {
    dwell_avg: { level:"TE", meaning:"Aufenthaltsdauer einer Transporteinheit am Standort.", formula:"Abfahrt vom Kontrollpunkt − Ankunft am Kontrollpunkt", aggregation:"Mittelwert über alle TEs der Periode/Ladestelle." },
    putaway_avg: { level:"Position", meaning:"Zeit von der WE-Buchung einer Position bis zu deren Einlagerung/Fertigstellung.", formula:"Fertigstellung/Einlagerung − WE-Buchung", aggregation:"Mittelwert über alle Positionen." },
    otif_quote: { level:"BW-Kennzahl", meaning:"On Time In Full. Fachliche Definition und Bewertung stammt aus BW.", formula:"BW-Kennzahl, nicht lokal neu berechnet", aggregation:"Wie von BW geliefert." },
    puenkt_quote: { level:"BW / TE", meaning:"Anteil der TEs mit BW-Kennzeichen P (pünktlich).", formula:"P / (P + N) × 100", aggregation:"Über alle bewerteten TEs der Periode/Ladestelle." },
    wait_gate_avg: { level:"TE", meaning:"Zeit vom Eintreffen der TE bis zum Andocken am Tor.", formula:"Andocken − Ankunft am Kontrollpunkt", aggregation:"Mittelwert über alle TEs." },
    sum_gewicht_t: { level:"Position", meaning:"Summe des angelieferten Gewichts.", formula:"Σ Gewicht je Position", aggregation:"Summe über den Zeitraum/Ladestelle." },
    sum_wert_keur: { level:"Position", meaning:"Summe des Warenwerts der Anlieferungen.", formula:"Σ Wert je Position", aggregation:"Summe über den Zeitraum/Ladestelle." },
    anzahl_pos: { level:"Position", meaning:"Anzahl der angelieferten Positionen.", formula:"Anzahl Positionszeilen", aggregation:"Summe über den Zeitraum/Ladestelle." },
    anzahl_anl: { level:"Anlieferung", meaning:"Anzahl der Anlieferungen (Lieferdokumente). Eine TE kann mehrere Anlieferungen enthalten.", formula:"Anzahl distinkter Anlieferungen", aggregation:"Summe über den Zeitraum/Ladestelle." },
    anzahl_te: { level:"TE", meaning:"Anzahl der Transporteinheiten (Hof-Ebene). TE ≠ Anlieferung: eine TE kann mehrere Anlieferungen enthalten.", formula:"Anzahl distinkter TEs", aggregation:"Summe über den Zeitraum/Ladestelle." },
  };

  // Begriffsverzeichnis: Basis-Fachbegriffe + automatisch aus METRIC_INFO
  // abgeleitete Kennzahl-Einträge. Eine Quelle für Infobuttons UND Glossar,
  // damit sich beide nie widersprechen können.
  const GLOSSARY_BASE = [
    { term:"TE (Transporteinheit)", level:"TE", definition:"Eine Transporteinheit kann in SAP EWM mehrere Anlieferungen enthalten. Hof-, Tor-, Andock-, Entlade- und Abfahrtsvorgänge werden TE-bezogen interpretiert." },
    { term:"Anlieferung", level:"Anlieferung", definition:"Ein der TE zugeordnetes Lieferdokument. Eine TE kann mehrere Anlieferungen enthalten; eine Anlieferung kann wiederum mehrere Positionen enthalten." },
    { term:"Position", level:"Position", definition:"Kleinste fachliche Rechenebene für Mengen, PA1, Packmittel, WE-Buchung und Einlagerung." },
    { term:"PA1", level:"Position", definition:"Menge pro Palette bzw. relevante Verpackungsmenge des Produkts für die Palettenberechnung.", formula:"Berechnete volle Paletten je Position = AUFRUNDEN(angelieferte Menge ÷ PA1)" },
    { term:"Berechnete volle Paletten", level:"Position", definition:"Rechnerische Palettenzahl auf Basis von angelieferter Menge und PA1. Der tatsächliche Lagerort wird dadurch nicht bestimmt.", formula:"AUFRUNDEN(Menge ÷ PA1) je Position, anschließend summieren" },
    { term:"Median", level:"Statistik", definition:"Der mittlere Wert einer sortierten Verteilung: 50% der Beobachtungen liegen darunter, 50% darüber. Robuster gegen Extremwerte als der Mittelwert." },
    { term:"P90", level:"Statistik", definition:"90. Perzentil: 90% der Beobachtungen liegen auf oder unter diesem Wert." },
    { term:"MAD / robuster z-Score", level:"Statistik", definition:"Robuste Ausreißererkennung auf Basis von Median und Median Absolute Deviation — weniger empfindlich gegenüber Extremwerten als Mittelwert/Standardabweichung." },
    { term:"OTIF", level:"BW", definition:"On Time In Full. Die fachliche Definition wird aus BW übernommen; das Cockpit erfindet keine eigene OTIF-Logik." },
    { term:"Pünktlichkeit P/N", level:"BW / TE", definition:"BW-Kennzeichen: P = pünktlich, N = nicht pünktlich. Wird als fachlich führende Bewertung verwendet." },
    { term:"Ladestelle", level:"Dimension", definition:"Analyse-/Filterdimension des Wareneingangs, z. B. Container, Landverkehr oder BSL. Technisch weiterhin dimension_segment/dimension_ladestelle." },
    { term:"Mindestdatenbasis", level:"Qualität", definition:"Mindestanzahl auswertbarer Beobachtungen, bevor ein Spediteur/Lieferant in einem Ranking erscheint — verhindert, dass kleine Stichproben dominieren." },
    { term:"Datenqualität & Abdeckung", level:"TE + Position", definition:"Anteil der für eine Analyse benötigten Felder, die im aktiven Filter technisch auswertbar sind. Vorhandensein bedeutet nicht automatisch fachliche Richtigkeit.", formula:"auswertbare Datensätze ÷ relevante Datensätze × 100" },
  ];
  const GLOSSARY_ITEMS = (() => {
    const metricItems = METRICS.map(m => {
      const x = METRIC_INFO[m.key] || {};
      return { term: m.label, level: x.level || "Kennzahl", definition: x.meaning || "Kennzahl des Cockpits.", formula: x.formula || "" };
    });
    const seen = new Set();
    return [...GLOSSARY_BASE, ...metricItems].filter(x => {
      const k = String(x.term).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  })();

  // Ladeanimation (1:1 aus dem Prozess-Cockpit) — als Konstante gehalten,
  // damit sie nach einem "keine Daten"-Overwrite von #state jederzeit
  // wiederhergestellt werden kann (siehe _render()).
  const LOADER_HTML = `
    <div class="we-loader">
      <div class="we-loader-scene">
        <div class="we-road"><div class="we-road-line"></div></div>
        <div class="we-truck">
          <div class="we-truck-body">
            <div class="we-truck-cabin"></div>
            <div class="we-truck-trailer"></div>
          </div>
          <div class="we-truck-wheel we-wheel-1"></div>
          <div class="we-truck-wheel we-wheel-2"></div>
          <div class="we-truck-wheel we-wheel-3"></div>
        </div>
        <div class="we-gate">
          <div class="we-gate-roof"></div>
          <div class="we-gate-door"></div>
        </div>
      </div>
      <div class="we-steps">
        <div class="we-step" data-i="0"><span class="we-step-dot"></span>Ankunft</div>
        <div class="we-step" data-i="1"><span class="we-step-dot"></span>Andocken</div>
        <div class="we-step" data-i="2"><span class="we-step-dot"></span>Entladen</div>
        <div class="we-step" data-i="3"><span class="we-step-dot"></span>Buchen</div>
        <div class="we-step" data-i="4"><span class="we-step-dot"></span>Einlagern</div>
      </div>
      <div class="we-loader-text">Wareneingang wird geladen<span class="we-dots"><span>.</span><span>.</span><span>.</span></span></div>
    </div>`;

  const SEG_COLORS = {
    Container: "#e67e22", BSL: "#8e44ad", Landverkehr: "#27ae60",
    Sonstige: "#5d6d7e", Gesamt: "#c0392b",
  };

  // Phasen für die Engpass-Wanderung (Zusammensetzung der Standzeit)
  const PHASE_KEYS = ["wait_gate", "reaction", "unload", "booking", "putaway"];
  const PHASE_LABEL = {
    wait_gate: "Wartezeit Tor", reaction: "Reaktionszeit", unload: "Entladedauer",
    booking: "Buchungsverzug", putaway: "Einlagerung",
  };
  const PHASE_COLOR = {
    wait_gate: "#5d6d7e", reaction: "#2980b9", unload: "#27ae60",
    booking: "#f39c12", putaway: "#c0392b",
  };
  // Farben für die Jahreslinien im Jahresvergleich (jüngstes Jahr = kräftigstes Rot)
  const YEAR_COLORS = ["#8b90a0", "#5dade2", "#e67e22", "#c0392b"];

  /* Ordnet einen Measure-Namen (wie im SAC-Modell benannt) dem internen
     Feldnamen zu, den das Widget erwartet. Tolerant gegenüber Groß-/
     Kleinschreibung, Umlauten, Leer-/Sonderzeichen. Der Nutzer benennt die
     Measures im Modell erkennbar (z. B. "dwell_avg", "OTIF Quote",
     "Standzeit Mittel"); die Zuordnung greift über Schlüsselwörter. */
  // Periode normalisieren: "02.2026" (KW.Jahr) -> "2026-W02"; sonst unverändert.
  function normPeriode(p) {
    if (!p) return p;
    const s = String(p).trim();
    // Schon normalisiert (unser eigenes Format)
    if (/^\d{4}-W\d{2}$/.test(s)) return s;
    // "WW.YYYY" z. B. "03.2026" (formatiertes Label)
    let m = /^(\d{1,2})\.(\d{4})$/.exec(s);
    if (m) return `${m[2]}-W${String(+m[1]).padStart(2, "0")}`;
    // "YYYYWW" 6-stellig z. B. "202501" (BW-Technical-ID, Jahr+Woche
    // ohne Trennzeichen — das liefert die .id einer Kalenderwochen-
    // Dimension oft statt des formatierten Labels)
    m = /^(\d{4})(\d{2})$/.exec(s);
    if (m) {
      const wk = +m[2];
      if (wk >= 1 && wk <= 53) return `${m[1]}-W${String(wk).padStart(2, "0")}`;
    }
    return s;
  }
  // Segment aus Ladestelle ableiten. BW kürzt Member-IDs teils auf eine
  // feste Länge ("ILW KREFELD CONTAINE" ohne das abschließende "R") —
  // daher tolerant über Teilstrings statt exakter Wortsuche matchen.
  // Tabelle 1:1 an die des Review-Widgets angelehnt, damit beide Widgets
  // dieselben Segmente erzeugen.
  const LADESTELLE_KURZ_STRAT = {
    "ILW KREFELD BSL": "BSL",
    "ILW KREFELD CONTAINE": "Container",
    "ILW KREFELD LANDVERK": "Landverkehr",
    "ILW Krefeld Container": "Container",
    "ILW Krefeld BSL": "BSL",
    "ILW Krefeld BSL / Eigendisposition": "BSL",
    "ILW Krefeld Landverkehr": "Landverkehr",
    "ILW Krefeld Frei Haus / DDP": "Landverkehr",
  };
  function normSegment(s) {
    // Leer/undefiniert -> "Sonstige", NIE "Gesamt" (das ist die separat
    // berechnete Summe über alle echten Segmente; würde sich sonst mit
    // dieser Kategorie überschneiden und Werte doppelt zählen).
    if (!s) return "Sonstige";
    const raw = String(s).trim();
    if (LADESTELLE_KURZ_STRAT[raw]) return LADESTELLE_KURZ_STRAT[raw];
    const u = raw.toUpperCase();
    if (u.includes("CONTAINE")) return "Container";   // trifft auch "CONTAINER" voll
    if (u.includes("LANDVERK") || u.includes("FREI HAUS") || u.includes("DDP")) return "Landverkehr";
    if (u.includes("BSL")) return "BSL";
    if (u.includes("NICHT ZUGEORDNET")) return "Sonstige";
    if (raw === "Gesamt") return "Sonstige"; // Schutz vor Kollision mit der Summenzeile
    if (["Container", "BSL", "Landverkehr", "Sonstige"].includes(raw)) return raw;
    return raw || "Sonstige";
  }

  /* Ordnet einen Measure-Namen (interner Name ODER echter BW-Name) dem Feld zu.
     Rückgabe: { field, durationSum?, scale? } oder null.
       durationSum: Wert ist eine Summe von Stunden -> Ø = Summe/Anzahl.
       scale:       Faktor (z. B. KG->t = 0.001, EUR->k€ = 0.001). */
  function mapMeasureName(name) {
    if (!name) return null;
    const s = String(name).toLowerCase()
      .replace(/ä/g,"a").replace(/ö/g,"o").replace(/ü/g,"u").replace(/ß/g,"ss")
      .replace(/[^a-z0-9]+/g, "_");
    const F = (field, extra) => Object.assign({ field }, extra || {});

    // 1) exakte interne Namen (fertige Ø/Min/Max) direkt akzeptieren
    const known = new Set([
      "anzahl_pos","anzahl_anl","otif_quote","puenkt_quote","voll_quote",
      "sum_menge","sum_gewicht_t","sum_wert_keur","sum_volumen",
      ...PHASE_KEYS.flatMap(p => [`${p}_avg`,`${p}_min`,`${p}_max`,`${p}_n`]),
      "dwell_avg","dwell_min","dwell_max","dwell_n",
    ]);
    if (known.has(s)) return F(s);

    // 2) Echte BW-Dauer-Namen -> Phase (als SUMME, wird später /Anzahl gerechnet)
    //    Reihenfolge wichtig: spezifische Muster zuerst.
    const durMap = [
      [["ankunft","einlagerung"], "dwell"],          // Dauer Ankunft Kontrollpunkt ... Einlagerung Ende
      [["ankunft","andocken"], "wait_gate"],         // Dauer Ankunft Kontrollpunkt bis Andocken Tor
      [["andocken","entladen"], "reaction"],         // Dauer Andocken Tor bis Entladen gestartet
      [["entladen","beendet"], "unload"],            // Dauer Entladen gestartet Entladen beendet
      [["ende_entladen","gebucht"], "booking"],      // Dauer Ende Entladen WE gebucht
      [["entladen","gebucht"], "booking"],           // Fallback Buchung
      [["einlagerung","gebucht"], "putaway"],        // Dauer Einlagerung bis WE gebucht
      [["verweildauer"], "dwell"],                   // Verweildauer (falls als Dauer-Summe genutzt)
    ];
    if (s.includes("dauer") || s.includes("verweildauer")) {
      for (const [needles, phase] of durMap)
        if (needles.every(x => s.includes(x))) return F(`${phase}_avg`, { durationSum: true });
    }

    // 3) Phase + Aggregat generisch (fertige Werte, keine Summe)
    const phaseSyn = {
      wait_gate: ["wait_gate","wartezeit","tor"], reaction: ["reaction","reaktion"],
      unload: ["unload","entlad"], booking: ["booking","buchung"],
      putaway: ["putaway","einlager"], dwell: ["dwell","standzeit","durchlauf","verweil"],
    };
    const aggSyn = { avg:["avg","mittel","durchschnitt","mean","_o_"], min:["min","lowest","tiefst"], max:["max","highest","hoechst"], n:["_n","count","cnt"] };
    for (const [p, syns] of Object.entries(phaseSyn)) {
      if (syns.some(x => s.includes(x))) {
        let agg = "avg"; for (const [a, asyns] of Object.entries(aggSyn)) if (asyns.some(x => s.includes(x))) { agg = a; break; }
        return F(`${p}_${agg}`);
      }
    }
    // 4) Quoten
    if (s.includes("otif")) return F("otif_quote");
    if (s.includes("puenkt") || s.includes("punkt")) return F("puenkt_quote");
    if (s.includes("vollst")) return F("voll_quote");
    // 5) Summen / Zähler (mit Einheiten-Umrechnung)
    if (s.includes("ladungsgewicht") || (s.includes("gewicht") && !s.includes("stk"))) return F("sum_gewicht_t", { scale: 0.001 }); // KG->t
    if (s.includes("wert") && !s.includes("stk")) return F("sum_wert_keur", { scale: 0.001 }); // EUR->k€
    if (s.includes("volumen") && !s.includes("stk")) return F("sum_volumen");
    if (s.includes("menge") && s.includes("ist")) return F("sum_menge");
    if (s.includes("menge") && !s.includes("abw") && !s.includes("soll")) return F("sum_menge");
    if (s.includes("lieferungsanzahl") || s.includes("anlief")) return F("anzahl_anl");
    if (s.includes("liefpos") || s.includes("position")) return F("anzahl_pos");
    return null;
  }


  const THEME = `
    :host{
      /* Design-Tokens exakt an die Referenz (main__3_.js) angeglichen:
         etwas hellere Cards + Hintergründe, kontrastreicherer Text,
         sichtbarere Ränder, identische Status-, Schatten- und Radien-Skala. */
      --bg:#10131b; --panel:#191e2b; --card:#232a3e; --card2:#2e3650;
      --ink:#f2f4f8; --ink2:#b4bacc; --muted:#7e8598;
      --border:rgba(255,255,255,.11); --border2:rgba(255,255,255,.18);
      --accent:#e74c3c; --accent-strong:#c0392b;
      --accent-dim:rgba(192,57,43,.14); --accent-border:rgba(192,57,43,.35);
      --good:#2ecc71; --good-dim:rgba(46,204,113,.18);
      --bad:#e74c3c; --warn:#f5b041; --warn-dim:rgba(245,176,65,.18);
      --blue:#3d9ad6; --blue-dim:rgba(61,154,214,.18);
      --font:'Segoe UI',system-ui,-apple-system,sans-serif;
      --font-mono:'Consolas','Cascadia Code','Courier New',monospace;
      --r-sm:4px; --r-md:8px; --r-lg:12px;
      --shadow-sm:0 2px 8px rgba(0,0,0,.35); --shadow-md:0 4px 16px rgba(0,0,0,.45); --shadow-lg:0 8px 40px rgba(0,0,0,.55);
      --ease:cubic-bezier(.16,1,.3,1);
    }
    :host([data-theme="light"]){
      --bg:#f5f6f8; --panel:#ffffff; --card:#ffffff; --card2:#f0f2f5;
      --ink:#1a1d23; --ink2:#4a5060; --muted:#8b90a0;
      --border:rgba(0,0,0,.08); --border2:rgba(0,0,0,.14);
      --accent:#c0392b; --accent-strong:#96281b;
      --good:#27ae60; --bad:#c0392b; --warn:#d68910;
      --shadow-sm:0 2px 8px rgba(0,0,0,.07); --shadow-md:0 4px 16px rgba(0,0,0,.10); --shadow-lg:0 8px 40px rgba(0,0,0,.14);
    }
    *,*::before,*::after{ box-sizing:border-box; }
    :host{ display:block; width:100%; height:100%; font-family:var(--font);
      font-size:13px; color:var(--ink); background:var(--bg); }
    .root{ display:flex; flex-direction:column; height:100%; background:var(--bg);
      border:1px solid var(--border); border-radius:var(--r-md); overflow:hidden; position:relative; }
    header{ padding:12px 16px 0; background:var(--panel); border-bottom:1px solid var(--border); position:relative; }
    header::before{ content:''; position:absolute; top:0; left:0; right:0; height:3px;
      background:linear-gradient(90deg, var(--accent-strong), var(--accent)); }
    .titlebar{ display:flex; align-items:center; gap:8px; }
    .brand-dot{ width:7px; height:7px; border-radius:50%; background:var(--accent);
      animation:dot-pulse 2.2s ease-in-out infinite; }
    @keyframes dot-pulse{ 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.65)} }
    .title{ font-family:var(--font-mono); font-size:11px; font-weight:600;
      letter-spacing:.12em; text-transform:uppercase; color:var(--accent); }
    .title small{ font-family:var(--font); color:var(--ink2); font-weight:400;
      text-transform:none; letter-spacing:0; margin-left:10px; font-size:12px; }
    .ctrl{ margin-left:auto; display:flex; gap:6px; align-items:center; }
    .ctrl button, .seg-pick{ font:inherit; font-size:12px; padding:5px 9px; border:1px solid var(--border);
      border-radius:var(--r-sm); background:var(--card); color:var(--ink2); cursor:pointer;
      transition:color .15s, border-color .15s; }
    .ctrl button:hover, .seg-pick:hover{ border-color:var(--accent); color:var(--ink); }
    .ctrl button.on{ border-color:var(--accent); color:var(--accent); }
    /* Segment-Umschalter */
    /* Steuerleiste: zwei zusammenhängende Segmented-Controls in einer Zeile */
    .toolbar{ display:flex; align-items:center; gap:14px; padding:9px 16px; background:var(--panel);
      border-bottom:1px solid var(--border); flex-wrap:wrap; }
    .segmented{ display:inline-flex; background:var(--bg); border:1px solid var(--border);
      border-radius:var(--r-md); padding:2px; gap:2px; }
    .segmented button{ font:inherit; font-family:var(--font-mono); font-size:11px; letter-spacing:.02em;
      padding:5px 12px; border:0; background:transparent; color:var(--ink2); cursor:pointer;
      border-radius:6px; display:flex; align-items:center; gap:6px; white-space:nowrap;
      transition:background .15s var(--ease), color .15s; }
    .segmented button:hover{ color:var(--ink); }
    .segmented button i{ width:8px; height:8px; border-radius:50%; flex:none;
      box-shadow:0 0 0 0 transparent; transition:box-shadow .2s; }
    .segmented button.on{ background:var(--card2); color:var(--ink); }
    .segmented button.on i{ box-shadow:0 0 8px 0 currentColor; }
    .toolbar .tb-lbl{ font-family:var(--font-mono); font-size:9px; text-transform:uppercase;
      letter-spacing:.14em; color:var(--muted); }
    .toolbar .spacer{ flex:1; }
    /* Dashboard-Grid */
    main{ flex:1; overflow:auto; padding:14px 16px; position:relative; }
    .grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(196px, 1fr)); gap:12px; }
    /* Einklappbare Sekundärbereiche (Prozesszeiten) */
    .collapse-toggle{ display:flex; align-items:center; gap:6px; width:100%; text-align:left;
      font:inherit; font-size:12px; font-weight:600; color:var(--ink2); background:transparent;
      border:1px solid var(--border); border-radius:8px; padding:8px 12px; cursor:pointer;
      transition:border-color .15s, color .15s;}
    .collapse-toggle:hover{ border-color:var(--accent); color:var(--ink);}
    .collapse-arrow{ font-size:10px; color:var(--muted); width:10px; display:inline-block;}
    .pt-hint{ font-family:var(--font-mono); font-size:9.5px; color:var(--muted); text-transform:uppercase;
      letter-spacing:.06em; margin-bottom:8px;}
    .pt-list{ display:flex; flex-direction:column; gap:5px;}
    .pt-row{ display:flex; justify-content:space-between; align-items:center; padding:5px 0;
      border-bottom:1px solid var(--border);}
    .pt-row:last-child{ border-bottom:0;}
    .pt-label{ font-size:11.5px; color:var(--ink2);}
    .pt-val{ font-family:var(--font-mono); font-size:12px; font-weight:700; color:var(--ink);}
    /* Einheitliches Infobutton-System: gleiche Größe/Form/Rahmen überall */
    .tile-info{ display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px;
      margin-left:5px; border-radius:50%; border:1px solid var(--border2); background:transparent;
      color:var(--muted); font-size:9px; font-style:italic; font-family:Georgia,serif; cursor:pointer;
      vertical-align:middle; transition:border-color .15s, color .15s;}
    .tile-info:hover, .tile-info:focus-visible{ border-color:var(--accent); color:var(--accent);}
    /* Zielwert-Panel */
    .target-panel{ position:absolute; right:16px; top:44px; z-index:40; width:230px; padding:12px 14px;
      background:var(--panel); border:1px solid var(--border2); border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.4);}
    .target-panel h4{ margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:var(--muted);}
    .target-panel label{ display:flex; justify-content:space-between; align-items:center; gap:8px;
      margin:7px 0; font-size:11px; color:var(--ink2);}
    .target-panel input{ width:70px; padding:4px 6px; border:1px solid var(--border); border-radius:4px;
      background:var(--card); color:var(--ink); font:inherit; font-size:11px;}
    .target-note{ margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-size:9.5px;
      color:var(--muted); line-height:1.5;}
    /* Begriffsverzeichnis */
    .glossary-backdrop{ position:fixed; inset:0; z-index:9070; background:rgba(0,0,0,.5);}
    .glossary-panel{ position:fixed; z-index:9080; inset:50% auto auto 50%; transform:translate(-50%,-50%);
      width:min(520px,92vw); max-height:min(82vh,760px); display:flex; flex-direction:column;
      background:var(--panel); border:1px solid var(--border2); border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,.5); overflow:hidden;}
    .glossary-head{ display:flex; align-items:flex-start; gap:10px; padding:14px 16px 10px; border-bottom:1px solid var(--border);}
    .glossary-head div{ flex:1;} .glossary-head b{ display:block; color:var(--ink); font-size:14px;}
    .glossary-head span{ color:var(--muted); font-size:10px; line-height:1.4;}
    .glossary-close{ border:1px solid var(--border2); border-radius:6px; background:var(--card);
      color:var(--ink2); cursor:pointer; padding:5px 8px;}
    .glossary-search{ width:calc(100% - 32px); margin:12px 16px 8px; padding:8px 10px;
      border:1px solid var(--border2); border-radius:7px; background:var(--card); color:var(--ink); font:inherit;}
    .glossary-list{ max-height:calc(min(82vh,760px) - 132px); overflow:auto; padding:6px 16px 16px; display:grid; gap:8px;}
    .glossary-item{ border:1px solid var(--border); border-radius:8px; background:var(--card); padding:9px 10px;}
    .glossary-term{ display:flex; gap:8px; align-items:center; color:var(--ink); font-weight:700; font-size:11px;}
    .glossary-level{ margin-left:auto; display:inline-flex; padding:2px 6px; border-radius:999px;
      background:var(--card2); color:var(--ink2); font:700 9px var(--font-mono);}
    .glossary-def{ margin-top:5px; color:var(--ink2); font-size:10.5px; line-height:1.45;}
    .glossary-formula{ margin-top:6px; padding:6px 8px; border-left:3px solid var(--accent);
      background:var(--accent-dim); color:var(--ink); font-family:var(--font-mono); font-size:10px;}
    .glossary-empty{ color:var(--muted); text-align:center; padding:26px 8px;}
    .tile{ background:var(--card); border:1px solid var(--border); border-radius:var(--r-md);
      padding:13px 14px 8px; cursor:pointer; transition:border-color .15s var(--ease), transform .1s;
      position:relative; overflow:hidden; }
    .tile:hover{ border-color:var(--accent); }
    .tile.sel{ border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); }
    .tile.tile-nodata{ cursor:default; opacity:.6; }
    .tile.tile-nodata:hover{ border-color:var(--border); }
    .tile.tile-nodata .m-val b{ color:var(--muted); font-weight:600; }
    .tile.tile-nodata .nodata-hint{ font-family:var(--font-mono); font-size:9px; color:var(--muted);
      text-transform:uppercase; letter-spacing:.06em; }
    .tile .m-lbl{ font-family:var(--font-mono); font-size:9px; font-weight:600; color:var(--muted);
      text-transform:uppercase; letter-spacing:.14em; }
    .tile .m-val{ display:flex; align-items:baseline; gap:6px; margin:5px 0 2px; }
    .tile .m-val b{ font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1;
      color:var(--ink); }
    .tile .m-val .u{ font-size:12px; color:var(--ink2); font-family:var(--font-mono); }
    .tile .m-delta{ font-family:var(--font-mono); font-size:10px; font-weight:600; }
    .tile .m-delta.up{ color:var(--good); } .tile .m-delta.down{ color:var(--bad); }
    .tile .m-sub{ display:flex; gap:6px; margin:1px 0 0; min-height:15px; }
    .tile .sla, .tile .yoy{ font-family:var(--font-mono); font-size:9px; font-weight:600;
      padding:1px 6px; border-radius:10px; letter-spacing:.02em; }
    .tile .sla.ok{ color:var(--good); background:color-mix(in srgb, var(--good) 14%, transparent); }
    .tile .sla.miss{ color:var(--bad); background:color-mix(in srgb, var(--bad) 14%, transparent); }
    .tile .yoy.up{ color:var(--good); } .tile .yoy.down{ color:var(--bad); }
    .tile .yoy{ background:var(--card2); }
    .tile .spark{ display:block; width:100%; height:52px; margin-top:6px; overflow:visible; }
    .tile .spark path.band{ opacity:.14; stroke:none; }
    .tile .spark path.line{ fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .tile .spark circle.head{ opacity:0; }
    .tile .spark .cursor{ stroke:var(--ink2); stroke-width:1; stroke-dasharray:2 2; opacity:0; }
    .tile .spark circle.hoverpt{ opacity:0; }
    /* großes Detail-Panel unter dem Grid */
    .detail{ margin-top:14px; background:var(--card); border:1px solid var(--border);
      border-radius:var(--r-md); padding:14px 16px; }
    .detail-head{ display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .detail h3{ font-family:var(--font-mono); font-size:10px; font-weight:600; color:var(--muted);
      margin:0; text-transform:uppercase; letter-spacing:.14em; flex:1;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .viewpick{ display:flex; gap:3px; flex:none; }
    .viewpick button{ font:inherit; font-size:11px; padding:4px 10px; border:1px solid var(--border);
      border-radius:var(--r-sm); background:transparent; color:var(--ink2); cursor:pointer; transition:all .15s; }
    .viewpick button:hover{ border-color:var(--accent); color:var(--ink); }
    .viewpick button.on{ background:var(--card2); color:var(--ink); border-color:var(--accent); }
    .dlegend{ display:flex; flex-wrap:wrap; gap:12px; margin-top:8px; }
    .dlegend .lg{ display:flex; align-items:center; gap:5px; font-family:var(--font-mono);
      font-size:10px; color:var(--ink2); }
    .dlegend .lg i{ width:9px; height:9px; border-radius:2px; }
    .detail .big path.area{ transition:opacity .15s; }
    /* Befunde-Panel */
    .insights{ margin-top:14px; display:flex; flex-direction:column; gap:6px; }
    .insights .ins-head{ font-family:var(--font-mono); font-size:9px; font-weight:600; color:var(--muted);
      text-transform:uppercase; letter-spacing:.16em; margin-bottom:2px; }
    .ins{ display:flex; align-items:flex-start; gap:9px; padding:9px 13px; border-radius:var(--r-md);
      background:var(--card); border:1px solid var(--border); font-size:12.5px; color:var(--ink); }
    .ins i{ width:7px; height:7px; border-radius:50%; margin-top:5px; flex:none; background:var(--muted); }
    .ins.good i{ background:var(--good); } .ins.bad i{ background:var(--bad); }
    .ins.neutral i{ background:var(--accent); }
    .empty-hint{ padding:60px 20px; text-align:center; font-family:var(--font-mono);
      font-size:11px; color:var(--muted); letter-spacing:.04em; }
    #btnExport{ font-family:var(--font-mono); }
    .detail .big{ display:block; width:100%; height:260px; overflow:visible; }
    .detail .big path.line{ fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
    .detail .big path.band{ stroke:none; opacity:.12; }
    .detail .big .grid-line{ stroke:var(--border); stroke-width:1; }
    .detail .big .axis-lbl{ font-family:var(--font-mono); font-size:9px; fill:var(--muted); }
    .detail .big .dot{ cursor:pointer; }
    /* Scrubber */
    .scrubber{ display:flex; align-items:center; gap:12px; margin-top:12px;
      padding:10px 14px; background:var(--panel); border:1px solid var(--border); border-radius:var(--r-md); }
    .scrubber .play{ font-size:14px; width:30px; height:30px; border-radius:50%; border:1px solid var(--border2);
      background:var(--card); color:var(--ink); cursor:pointer; flex:none; display:flex; align-items:center; justify-content:center; }
    .scrubber .play:hover{ border-color:var(--accent); color:var(--accent); }
    .scrubber input[type=range]{ flex:1; accent-color:var(--accent); cursor:pointer; }
    .scrubber .per{ font-family:var(--font-mono); font-size:12px; color:var(--ink); min-width:78px; text-align:right;
      font-variant-numeric:tabular-nums; }
    .scrubber .detail-cta{ font:inherit; font-size:12px; font-weight:600; padding:7px 14px; border-radius:var(--r-sm);
      border:0; background:var(--accent); color:#fff; cursor:pointer; flex:none; white-space:nowrap;
      box-shadow:0 2px 10px color-mix(in srgb, var(--accent) 45%, transparent); transition:transform .1s, filter .15s; }
    .scrubber .detail-cta:hover{ filter:brightness(1.08); transform:translateY(-1px); }
    .scrubber .detail-cta:active{ transform:translateY(0); }
    .open-hint{ font-family:var(--font-mono); font-size:10px; color:var(--accent); opacity:.55;
      transition:opacity .2s; white-space:nowrap; }
    /* ── Selektions-Header (nur im Kompakt-Modus) ── */
    .sel-head{ margin-bottom:14px; padding:14px 16px; border-radius:var(--r-md);
      background:linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--card)), var(--card));
      border:1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); animation:sh-in .4s var(--ease); }
    @keyframes sh-in{ from{ opacity:0; transform:translateX(-10px);} to{ opacity:1; transform:translateX(0);} }
    .sel-head .sh-eyebrow{ font-family:var(--font-mono); font-size:8.5px; letter-spacing:.16em; text-transform:uppercase;
      color:var(--muted); }
    .sel-head .sh-per{ font-size:30px; font-weight:800; line-height:1.05; margin-top:3px; color:var(--ink);
      font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
    .sel-head .sh-seg{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink2); margin-top:4px; }
    .sel-head .sh-dot{ width:8px; height:8px; border-radius:50%; box-shadow:0 0 8px currentColor; }
    .sel-head .sh-range{ font-family:var(--font-mono); font-size:10.5px; color:var(--muted); margin-top:2px; }
    .sel-head .sh-hint{ font-family:var(--font-mono); font-size:9px; color:var(--muted); margin-top:9px;
      padding-top:8px; border-top:1px solid var(--border); }
    /* ── Kompakt-Modus: Widget als schmale Seitenleiste ── */
    .compact .toolbar{ display:none; }
    .compact #sub{ display:none; }
    .compact .detail, .compact .insights, .compact .scrubber{ display:none !important; }
    .compact .grid{ grid-template-columns:1fr; gap:8px; }
    .compact .tile{ padding:10px 12px 6px; }
    .compact .tile .spark{ height:34px; }
    .compact .tile .m-val b{ font-size:22px; }
    .compact header{ padding-bottom:2px; }
    /* Schmale Sidebar (z. B. 340px in SAC): Außenpolsterung verschlanken,
       damit die Kacheln den knappen Platz voll ausnutzen statt Raum an
       großzügiges Padding zu verlieren, das für die Vollbild-Ansicht gedacht ist. */
    .compact main{ padding:10px; }
    .compact .sel-head{ padding:11px 12px; margin-bottom:10px; }
    .compact .tile .m-lbl{ font-size:8.5px; }
    .compact .tile .m-sub{ flex-wrap:wrap; row-gap:4px; }
    /* Tooltip */
    .tip{ position:absolute; pointer-events:none; background:var(--card2); border:1px solid var(--border2);
      border-radius:var(--r-sm); padding:6px 9px; font-size:11px; color:var(--ink); z-index:30;
      opacity:0; transition:opacity .1s; font-variant-numeric:tabular-nums; white-space:nowrap;
      box-shadow:0 4px 16px rgba(0,0,0,.35); }
    .tip .tp{ font-family:var(--font-mono); font-size:9px; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; }
    .tip b{ font-size:13px; }
    /* Lade-/Leer-Overlay */
    .state{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
      justify-content:center; gap:14px; background:var(--bg); z-index:20; }
    .state[hidden]{ display:none; }
    .state-icon{ font-size:30px; opacity:.4; }
    .state-txt{ font-family:var(--font-mono); font-size:11px; letter-spacing:.1em;
      text-transform:uppercase; color:var(--muted); }
    /* ═══ WE-Ladeanimation (1:1 aus dem Prozess-Cockpit übernommen) ═══ */
    .we-loader{ display:flex; flex-direction:column; align-items:center; gap:26px;}
    .we-loader-scene{ position:relative; width:280px; height:90px;}
    .we-road{ position:absolute; bottom:18px; left:0; width:220px; height:3px;
      background:var(--border2); border-radius:2px; overflow:hidden;}
    .we-road-line{ position:absolute; top:1px; left:0; width:100%; height:1px;
      background:repeating-linear-gradient(90deg, var(--muted) 0, var(--muted) 8px,
        transparent 8px, transparent 16px);
      animation:we-road-move .6s linear infinite;}
    @keyframes we-road-move{ to{ transform:translateX(-16px);} }
    .we-truck{ position:absolute; bottom:20px; left:0;
      animation:we-truck-drive 3s cubic-bezier(.45,0,.55,1) infinite;}
    @keyframes we-truck-drive{
      0%{ left:0;} 45%{ left:150px;} 55%{ left:150px;} 100%{ left:0;} }
    .we-truck-body{ position:relative; display:flex; align-items:flex-end; gap:2px;}
    .we-truck-trailer{ width:34px; height:22px; background:var(--accent-strong);
      border-radius:2px; order:1;}
    .we-truck-cabin{ width:14px; height:15px; background:var(--accent);
      border-radius:3px 3px 2px 2px; order:2; position:relative;}
    .we-truck-cabin::after{ content:''; position:absolute; top:2px; right:2px;
      width:6px; height:5px; background:var(--bg); border-radius:1px; opacity:.6;}
    .we-truck-wheel{ position:absolute; bottom:-4px; width:7px; height:7px;
      background:var(--ink2); border:1.5px solid var(--muted); border-radius:50%;
      animation:we-spin .4s linear infinite;}
    @keyframes we-spin{ to{ transform:rotate(360deg);} }
    .we-wheel-1{ left:3px;} .we-wheel-2{ left:22px;} .we-wheel-3{ left:38px;}
    .we-gate{ position:absolute; bottom:20px; right:6px; width:44px; height:52px;}
    .we-gate-roof{ width:0; height:0; border-left:24px solid transparent;
      border-right:24px solid transparent; border-bottom:14px solid var(--card2); margin:0 -2px;}
    .we-gate-door{ width:44px; height:38px; background:var(--card);
      border:2px solid var(--card2); border-top:none; border-radius:0 0 2px 2px;
      position:relative; overflow:hidden;}
    .we-gate-door::before{ content:''; position:absolute; top:0; left:0; right:0; height:100%;
      background:repeating-linear-gradient(0deg, var(--card2) 0, var(--card2) 4px,
        transparent 4px, transparent 8px);
      animation:we-door-open 3s ease-in-out infinite;}
    @keyframes we-door-open{
      0%,40%{ transform:translateY(0);} 50%,90%{ transform:translateY(-100%);} 100%{ transform:translateY(0);} }
    .we-steps{ display:flex; gap:14px; flex-wrap:wrap; justify-content:center;}
    .we-step{ display:flex; align-items:center; gap:5px; font-family:var(--font-mono);
      font-size:10px; font-weight:600; letter-spacing:.04em; color:var(--muted);
      opacity:.4; transition:opacity .3s, color .3s;}
    .we-step-dot{ width:7px; height:7px; border-radius:50%; background:var(--border2);
      transition:background .3s, box-shadow .3s;}
    .we-step.we-step-active{ opacity:1; color:var(--ink);}
    .we-step.we-step-active .we-step-dot{ background:var(--accent-strong);
      box-shadow:0 0 8px var(--accent-strong);}
    .we-loader-text{ font-family:var(--font-mono); font-size:12px; color:var(--ink2); letter-spacing:.03em;}
    .we-dots span{ animation:we-dot-blink 1.4s infinite;}
    .we-dots span:nth-child(2){ animation-delay:.2s;}
    .we-dots span:nth-child(3){ animation-delay:.4s;}
    @keyframes we-dot-blink{ 0%,60%,100%{ opacity:.2;} 30%{ opacity:1;} }
    @media (prefers-reduced-motion:reduce){
      .tile .spark path.line, .detail .big path.line{ stroke-dasharray:none !important; stroke-dashoffset:0 !important; animation:none !important; }
      .brand-dot, .we-truck, .we-road-line, .we-truck-wheel, .we-gate-door::before{ animation:none; }
    }
  `;

  const TPL = (css) => `
    <style>${css}</style>
    <div class="root">
      <header>
        <div class="titlebar">
          <span class="brand-dot"></span>
          <div class="title">WE Strategie-Cockpit <small id="sub"></small></div>
          <div class="ctrl">
            <button id="btnExport" title="Befunde kopieren">⧉ Export</button>
            <button id="btnTargets" title="Zielwerte konfigurieren" aria-expanded="false">◎ Ziele</button>
            <button id="btnGlossary" title="Begriffe &amp; Berechnungen">? Begriffe</button>
            <button id="btnTheme" title="Hell/Dunkel">◐</button>
          </div>
        </div>
      </header>
      <div class="target-panel" id="targetPanel" hidden aria-label="Zielwerte konfigurieren">
        <h4>Zielwerte</h4>
        <label>Ø Standzeit (h) <input type="number" step="0.5" id="tgtDwell"></label>
        <label>Ø Einlagerung (h) <input type="number" step="0.5" id="tgtPutaway"></label>
        <label>OTIF-Quote (%) <input type="number" step="1" id="tgtOtif"></label>
        <label>Pünktlichkeit (%) <input type="number" step="1" id="tgtPuenkt"></label>
        <label>Ø Wartezeit Tor (h) <input type="number" step="0.5" id="tgtWaitGate"></label>
        <div class="target-note"><b>Zielquelle:</b> Cockpit-Konfiguration. Werte können später über Widget-Properties/BW-Vorgaben übergeben werden — kein automatisch aus SAP EWM abgeleiteter Systemwert.</div>
      </div>
      <div class="glossary-panel" id="glossaryPanel" hidden role="dialog" aria-modal="true" aria-label="Begriffe und Berechnungen">
        <div class="glossary-head">
          <div><b>Begriffe &amp; Berechnungen</b><span>Zentrale Definitionen für SAP EWM, BW-Kennzahlen und Cockpit-Berechnungen.</span></div>
          <button class="glossary-close" id="glossaryClose" type="button">✕</button>
        </div>
        <input class="glossary-search" id="glossarySearch" type="search" placeholder="Begriff suchen, z. B. TE, PA1, Standzeit, Median …">
        <div class="glossary-list" id="glossaryList"></div>
      </div>
      <div class="glossary-backdrop" id="glossaryBackdrop" hidden></div>
      <div class="toolbar">
        <span class="tb-lbl">Segment</span>
        <div class="segmented" id="segpick"></div>
        <span class="spacer"></span>
        <span class="tb-lbl">Zeitraster</span>
        <div class="segmented" id="aggpick">
          <button data-agg="week" class="on">Woche</button>
          <button data-agg="month">Monat</button>
        </div>
      </div>
      <main id="main">
        <div class="sel-head" id="selHead" hidden></div>
        <div class="state" id="state">${LOADER_HTML}</div>
        <div id="dash"></div>
      </main>
      <div class="tip" id="tip"></div>
    </div>`;

  // ── Hilfen ─────────────────────────────────────────────────────────────
  const fmtVal = (v, m) => {
    if (v == null || isNaN(v)) return "–";
    if (m.pct) return (v * 100).toFixed(1);
    if (m.unit === "t" || m.unit === "k€") return v >= 1000 ? (v/1000).toFixed(1)+"k" : Math.round(v).toString();
    if (m.unit === "") return Math.round(v).toLocaleString("de-DE");
    return v.toFixed(1);
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  class WEStrategie extends HTMLElement {
    constructor() {
      super();
      this._sh = this.attachShadow({ mode: "open" });
      this._sh.innerHTML = TPL(THEME);
      this._props = {
        theme: "dark", aggregation: "week", dauerEinheit: "sekunden",
        // Zielwerte: konfigurierbar über "◎ Ziele" statt fest im Code
        // verdrahtet — Cockpit-/Fachbereichsvorgabe, keine SAP-EWM-Systemgrenze.
        targetDwell: 8, targetPutaway: 4, targetOtif: 0.90, targetPuenkt: 0.90, targetWaitGate: 2,
      };
      this._rows = null;          // aggregierte Perioden-Zeilen
      this._seg = "Gesamt";       // gewähltes Segment
      this._selMetric = "dwell_avg";
      this._detailView = "verlauf";  // verlauf | vergleich | engpass
      this._showProcessTimes = false; // Prozesszeiten standardmäßig eingeklappt
      this._scrubIdx = null;      // Scrubber-Position (Periodenindex) oder null
      this._playing = false;
      this._applyTheme();
      this._wire();
      this._startLoaderSteps(); // Ladeanimation läuft ab dem ersten Moment
    }

    // SAC-Lifecycle
    onCustomWidgetAfterUpdate(changed) {
      Object.assign(this._props, changed || {});
      if (changed && "theme" in changed) this._applyTheme();
      if (changed && "aggregation" in changed) this._render();
      if (changed && "dauerEinheit" in changed && this._dataBinding) {
        // Einheit geändert -> vorhandene Bindung neu verarbeiten
        this.myDataSource = this._dataBinding;
      }
      // SAC-Datenbindung: kommt normalerweise als changed.myDataSource. Zur
      // Sicherheit auch alternative Schlüssel/Objektformen erkennen, damit der
      // Loader nicht hängen bleibt, falls SAC die Bindung anders benennt.
      if (changed) {
        const binding = changed.myDataSource
          || (changed.dataBindings && changed.dataBindings.myDataSource)
          || null;
        if (binding) this.myDataSource = binding;
      }
    }
    onCustomWidgetResize() { this._render(); }
    disconnectedCallback() { this._stopPlay(); this._stopLoaderSteps(); }

    /** Lässt die Prozess-Schritte der Ladeanimation nacheinander aufleuchten
     *  (1:1 aus dem Prozess-Cockpit übernommen). */
    _startLoaderSteps() {
      if (this._loaderTimer) return;
      const steps = this._sh.querySelectorAll(".we-step");
      if (!steps.length) return;
      let i = 0;
      const tick = () => { steps.forEach((s, idx) => s.classList.toggle("we-step-active", idx === i)); i = (i + 1) % steps.length; };
      tick();
      this._loaderTimer = setInterval(tick, 600);
    }
    _stopLoaderSteps() {
      if (this._loaderTimer) { clearInterval(this._loaderTimer); this._loaderTimer = null; }
    }

    /* SAC-DataSource-Setter. Erwartet die BENANNTEN Feeds aus dem Manifest —
       je Kennzahl ein eigener Feed (dimension_periode, value_dur_dwell, …).
       Jede Kennzahl wird gezielt über ihre Feed-ID gelesen.

       WICHTIG: Der Loader darf NIE hängen bleiben. Sobald die Bindung
       überhaupt Daten liefert (oder final "success"/"error" meldet),
       verlassen wir den Ladezustand — auch wenn 0 Zeilen ankommen. Nur
       solange die Bindung noch aktiv lädt ("loading"/"pending") bleibt die
       Animation stehen. */
    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;
      if (!dataBinding) { return; }
      const st = dataBinding.state;
      const hasData = Array.isArray(dataBinding.data);
      // Noch am Laden UND noch keine Daten -> Loader weiter zeigen.
      if (!hasData && (st === "loading" || st === "pending" || st === "waiting")) {
        this._rows = null; this._render(); return;
      }
      // Fehlerzustand ohne Daten -> Fehlermeldung statt Dauerloader.
      if (!hasData && st === "error") {
        this._rows = []; this._render(); return;
      }
      // Ab hier: Daten liegen vor (oder success/leer). Immer verarbeiten und
      // den Loader in JEDEM Fall verlassen (auch bei Ausnahme).
      try {
        this._rows = this._ingestSac(dataBinding);
      } catch (e) {
        console.warn("WE-Strategie: Datenaufbereitung fehlgeschlagen —", e && e.message);
        this._rows = [];
      }
      this._render();
    }
    /* refreshData() zeigt bewusst sofort wieder die Ladeanimation (statt
       stumm auf die alten Daten zu warten), damit ein Reload genauso
       Feedback gibt wie der allererste Ladevorgang. */
    refreshData() {
      if (!this._dataBinding) return;
      this._rows = null;
      this._render();
      this.myDataSource = this._dataBinding;
    }

    _ingestSac(db) {
      const data = db.data || [];
      // Eine Zelle als Zahl (raw bevorzugt; sonst formatierter String mit Einheit).
      const numOf = (cell) => {
        if (cell == null) return null;
        if (typeof cell === "number") return cell;
        if (typeof cell === "object") {
          if (cell.raw != null && cell.raw !== "" && !isNaN(Number(cell.raw))) return Number(cell.raw);
          return fmtNum(String(cell.formatted ?? cell.label ?? "").trim());
        }
        return fmtNum(String(cell).trim());
      };
      const fmtNum = (s) => { if (!s) return null; const c = s.split(" ")[0].replace(/,/g, ""); const n = Number(c); return isNaN(n) ? null : n; };
      // Umrechnungsfaktor der Dauer-Rohwerte in STUNDEN. BW-Kennzahltyp "Zeit"
      // im Format DEC liefert i.d.R. eine Dezimalzahl in SEKUNDEN (SAP-Basis).
      // Über die Property "dauerEinheit" umstellbar, falls euer Modell anders liefert.
      const durUnit = (this._props.dauerEinheit || "sekunden").toLowerCase();
      const durFactor = { sekunden: 1/3600, sec: 1/3600, s: 1/3600,
                          minuten: 1/60, min: 1/60, m: 1/60,
                          stunden: 1, std: 1, h: 1, tage: 24, tag: 24, d: 24 }[durUnit] ?? (1/3600);
      // Dauer -> Stunden. Erkennt HH:MM:SS (formatiert), sonst raw * Faktor.
      const durOf = (cell) => {
        if (cell == null) return null;
        // 1) Explizit formatiert als HH:MM:SS? (auch >24h) -> direkt Stunden
        const fmt = typeof cell === "object" ? String(cell.formatted ?? cell.label ?? "").trim() : String(cell).trim();
        const m = /^(-?)(\d+):(\d{2}):(\d{2})$/.exec(fmt);
        if (m) { const v = (+m[2]) + (+m[3])/60 + (+m[4])/3600; return m[1] ? -v : v; }
        // 2) DEC-Rohwert (Typ Zeit) -> per Einheit-Faktor in Stunden
        const raw = numOf(cell);
        return raw == null ? null : raw * durFactor;
      };
      // --- Benannte Feeds: jede Kennzahl gezielt über ihre Feed-ID lesen ---
      // Zellschlüssel ist die Feed-ID oder Feed-ID_0 (SAC-Alias feedName_index).
      const readCell = (row, key) => { for (const k of [key, `${key}_0`]) if (row[k] != null) return row[k]; return null; };
      const readVal = (row, key) => { const c = readCell(row, key); return c == null ? null : numOf(c); };
      const readDur = (row, key) => { const c = readCell(row, key); return c == null ? null : durOf(c); };
      const readDim = (row, key) => {
        const c = readCell(row, key); if (c == null) return null;
        const v = typeof c === "object" ? (c.id ?? c.label ?? c.description ?? "") : c;
        return v === "" || v == null ? null : String(v).trim();
      };
      const PHASES = { wait_gate:"value_dur_wait_gate", reaction:"value_dur_reaction", unload:"value_dur_unload",
                       booking:"value_dur_booking", putaway:"value_dur_putaway", dwell:"value_dur_dwell" };

      return data.map((row) => {
        const r = {
          periode: normPeriode(readDim(row, "dimension_periode")),
          segment: normSegment(readDim(row, "dimension_segment")),
          anzahl_anl: readVal(row, "value_anzahl_anl"),
          anzahl_pos: readVal(row, "value_anzahl_pos"),
        };
        // Anzahl TEs ist fachlich eine ANDERE Größe als Anzahl Anlieferungen
        // (eine TE kann mehrere Anlieferungen enthalten). Legacy-Fallback auf
        // anzahl_anl, falls das BW-Modell value_anzahl_te noch nicht liefert —
        // transparent gekennzeichnet, keine stille Gleichsetzung.
        r.anzahl_te = readVal(row, "value_anzahl_te");
        if (r.anzahl_te == null) r.anzahl_te = r.anzahl_anl; // Legacy-Fallback: TE ≈ Anlieferung, bis BW-Feld existiert
        const n = r.anzahl_pos || r.anzahl_anl || 0;
        // Dauern (NODIM-Zahl -> Stunden per durOf) als Summe -> Ø (Summe/Positionen).
        for (const [ph, feed] of Object.entries(PHASES)) {
          const sumH = readDur(row, feed);
          r[`${ph}_avg`] = (sumH != null && n) ? sumH / n : null;
          r[`${ph}_n`] = n;
          r[`${ph}_min`] = null; r[`${ph}_max`] = null;
        }
        // Optionale Min/Max fürs Standzeit-Band
        const dmin = readDur(row, "value_dwell_min"), dmax = readDur(row, "value_dwell_max");
        if (dmin != null) r.dwell_min = dmin;
        if (dmax != null) r.dwell_max = dmax;
        // Mengen/Werte mit Einheiten-Umrechnung
        r.sum_menge = readVal(row, "value_menge");
        const g = readVal(row, "value_gewicht"); r.sum_gewicht_t = g != null ? g / 1000 : null;   // KG->t
        const w = readVal(row, "value_wert");    r.sum_wert_keur = w != null ? w / 1000 : null;    // EUR->k€
        r.sum_volumen = readVal(row, "value_volumen");
        // Quoten (optional)
        r.otif_quote   = readVal(row, "value_otif_quote");
        r.puenkt_quote = readVal(row, "value_puenkt_quote");
        r.voll_quote   = readVal(row, "value_voll_quote");

        // Erweiterte Prozesszeiten (Abschnitt "Prozesszeiten", standardmäßig
        // eingeklappt). Summen-Feeds als NODIM-Zahl, Divisor Anzahl TEs, je
        // WE-Buchung->Fertigstellung Divisor Positionen. Fällt auf bereits
        // vorhandene, verwandte Kennzahl zurück, falls der neue Feed im BW-
        // Modell noch nicht gebunden ist — so bleibt die Ansicht nutzbar.
        const nTe = r.anzahl_te || r.anzahl_anl || 0;
        const avgFeed = (feedId, divisor) => {
          const sumH = readDur(row, feedId);
          return (sumH != null && divisor) ? sumH / divisor : null;
        };
        r.plan_start_end_avg      = avgFeed("value_dur_plan_start_end", nTe);
        r.actual_start_end_avg    = avgFeed("value_dur_actual_start_end", nTe);
        r.arrival_dock_avg        = avgFeed("value_dur_arrival_dock", nTe) ?? r.wait_gate_avg;
        r.dock_unload_start_avg   = avgFeed("value_dur_dock_unload_start", nTe) ?? r.reaction_avg;
        r.unload_start_end_avg    = avgFeed("value_dur_unload_start_end", nTe) ?? r.unload_avg;
        r.unload_end_actual_end_avg = avgFeed("value_dur_unload_end_actual_end", nTe);
        r.we_booked_completion_avg  = avgFeed("value_dur_we_booked_completion", n) ?? r.putaway_avg;
        r.arrival_completion_avg  = avgFeed("value_dur_arrival_completion", nTe) ?? r.dwell_avg;
        r.dock_completion_avg     = avgFeed("value_dur_dock_completion", nTe);
        return r;
      });
    }
    onCustomWidgetDestroy() { this._stopPlay(); }

    setTheme(t) { if (t==="dark"||t==="light"){ this._props.theme=t; this._applyTheme(); } }
    _applyTheme() { this.setAttribute("data-theme", this._props.theme === "light" ? "light" : "dark"); }

    // Daten setzen (Testpfad; SAC-Pfad analog über data binding)
    setTestData(rows) {
      if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch { rows = []; } }
      this._rows = Array.isArray(rows) ? rows : [];
      this._render();
    }

    _wire() {
      const $ = (id) => this._sh.getElementById(id);
      $("btnTheme").addEventListener("click", () =>
        this.setTheme(this._props.theme === "dark" ? "light" : "dark"));
      // Zeitraster-Segmented-Control
      this._sh.querySelectorAll("#aggpick button").forEach(b =>
        b.addEventListener("click", () => {
          this._props.aggregation = b.dataset.agg;
          this._sh.querySelectorAll("#aggpick button").forEach(x =>
            x.classList.toggle("on", x === b));
          this._render();
        }));
      // Export
      $("btnExport").addEventListener("click", () => this._exportInsights());

      // Zielwert-Panel
      const syncTargetInputs = () => {
        $("tgtDwell").value = this._props.targetDwell ?? "";
        $("tgtPutaway").value = this._props.targetPutaway ?? "";
        $("tgtOtif").value = this._props.targetOtif != null ? Math.round(this._props.targetOtif * 100) : "";
        $("tgtPuenkt").value = this._props.targetPuenkt != null ? Math.round(this._props.targetPuenkt * 100) : "";
        $("tgtWaitGate").value = this._props.targetWaitGate ?? "";
      };
      $("btnTargets").addEventListener("click", () => {
        const p = $("targetPanel"), open = p.hidden;
        p.hidden = !open;
        $("btnTargets").setAttribute("aria-expanded", String(open));
        if (open) syncTargetInputs();
      });
      const bindTarget = (inputId, propKey, isPct) => {
        $(inputId).addEventListener("change", (e) => {
          const raw = e.target.value;
          this._props[propKey] = raw === "" ? null : (isPct ? Number(raw) / 100 : Number(raw));
          this._render();
        });
      };
      bindTarget("tgtDwell", "targetDwell", false);
      bindTarget("tgtPutaway", "targetPutaway", false);
      bindTarget("tgtOtif", "targetOtif", true);
      bindTarget("tgtPuenkt", "targetPuenkt", true);
      bindTarget("tgtWaitGate", "targetWaitGate", false);

      // Begriffsverzeichnis
      const renderGlossary = (filter) => {
        const q = (filter || "").trim().toLowerCase();
        const items = q ? GLOSSARY_ITEMS.filter(x =>
          x.term.toLowerCase().includes(q) || x.definition.toLowerCase().includes(q)) : GLOSSARY_ITEMS;
        $("glossaryList").innerHTML = items.length
          ? items.map(x => `<div class="glossary-item">
              <div class="glossary-term">${esc(x.term)}<span class="glossary-level">${esc(x.level)}</span></div>
              <div class="glossary-def">${esc(x.definition)}</div>
              ${x.formula ? `<div class="glossary-formula">${esc(x.formula)}</div>` : ""}
            </div>`).join("")
          : `<div class="glossary-empty">Kein Treffer für „${esc(filter)}“.</div>`;
      };
      const openGlossary = () => {
        $("glossaryPanel").hidden = false; $("glossaryBackdrop").hidden = false;
        $("glossarySearch").value = ""; renderGlossary("");
        $("glossarySearch").focus();
      };
      const closeGlossary = () => { $("glossaryPanel").hidden = true; $("glossaryBackdrop").hidden = true; };
      $("btnGlossary").addEventListener("click", openGlossary);
      $("glossaryClose").addEventListener("click", closeGlossary);
      $("glossaryBackdrop").addEventListener("click", closeGlossary);
      $("glossarySearch").addEventListener("input", (e) => renderGlossary(e.target.value));
      this._sh.addEventListener("keydown", (e) => { if (e.key === "Escape") closeGlossary(); });
    }

    // ── Datenaufbereitung: Perioden × Segment -> Serien ───────────────────
    // Ordnet eine ISO-Wochenperiode ("2025-W07") ihrem Monat zu, über den
    // Donnerstag der Woche (ISO-Konvention: die Woche gehört zum Jahr/Monat
    // ihres Donnerstags). So landen KW53/KW01 im richtigen Monat.
    _weekToMonth(per) {
      const m = /^(\d{4})-W(\d{2})$/.exec(per);
      if (!m) return per; // schon Monatsformat o. ä.
      const year = +m[1], week = +m[2];
      const jan4 = new Date(Date.UTC(year, 0, 4));
      const day = (jan4.getUTCDay() + 6) % 7; // Mo=0
      const week1Mon = new Date(jan4); week1Mon.setUTCDate(jan4.getUTCDate() - day);
      const thu = new Date(week1Mon);
      thu.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7 + 3);
      return `${thu.getUTCFullYear()}-${String(thu.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    // Verdichtet Wochenzeilen zu Monatszeilen. Aggregationsregeln wie BW:
    // Summen addieren, Mittelwerte n-gewichtet, Min=LOWEST, Max=HIGHEST.
    _rollupToMonths(rows) {
      const groups = {};
      for (const r of rows) {
        const key = this._weekToMonth(r.periode) + "|" + r.segment;
        (groups[key] ||= []).push(r);
      }
      const out = [];
      for (const key in groups) {
        const g = groups[key];
        const [per, seg] = key.split("|");
        const totalN = g.reduce((a, r) => a + (r.anzahl_pos || 0), 0) || 1;
        const row = { periode: per, segment: seg,
          anzahl_pos: g.reduce((a, r) => a + (r.anzahl_pos || 0), 0),
          anzahl_anl: g.reduce((a, r) => a + (r.anzahl_anl || 0), 0) };
        for (const m of METRICS) {
          if (m.sum) row[m.key] = g.reduce((a, r) => a + (r[m.key] || 0), 0);
          else if (m.pct || /_avg$/.test(m.key))
            row[m.key] = g.reduce((a, r) => a + (r[m.key] || 0) * (r.anzahl_pos || 0), 0) / totalN;
          if (m.band) {
            const mins = g.map(r => r[m.band[0]]).filter(v => v != null);
            const maxs = g.map(r => r[m.band[1]]).filter(v => v != null);
            if (mins.length) row[m.band[0]] = Math.min(...mins);
            if (maxs.length) row[m.band[1]] = Math.max(...maxs);
          }
        }
        // Phasen-Mix (für Engpass-Wanderung): Mittelwerte je Phase n-gewichtet
        for (const ph of PHASE_KEYS) {
          const k = ph + "_avg";
          row[k] = g.reduce((a, r) => a + (r[k] || 0) * (r.anzahl_pos || 0), 0) / totalN;
        }
        out.push(row);
      }
      return out;
    }

    _prepare() {
      let rows = this._rows || [];
      if (this._props.aggregation === "month") rows = this._rollupToMonths(rows);
      const perioden = [...new Set(rows.map(r => r.periode))].sort();
      const segmente = [...new Set(rows.map(r => r.segment))].sort();
      // Lookup: (periode, segment) -> row
      const idx = {};
      for (const r of rows) idx[r.periode + "|" + r.segment] = r;

      // "Gesamt" = aufsummierte/n-gewichtete Kombination über Segmente
      const gesamt = {};
      for (const per of perioden) {
        const segRows = segmente.map(s => idx[per + "|" + s]).filter(Boolean);
        if (!segRows.length) continue;
        const g = { periode: per, segment: "Gesamt" };
        const totalN = segRows.reduce((a, r) => a + (r.anzahl_pos || 0), 0) || 1;
        for (const m of METRICS) {
          if (m.sum) g[m.key] = segRows.reduce((a, r) => a + (r[m.key] || 0), 0);
          else if (m.pct || /_avg$/.test(m.key))
            g[m.key] = segRows.reduce((a, r) => a + (r[m.key] || 0) * (r.anzahl_pos || 0), 0) / totalN;
          if (m.band) {
            g[m.band[0]] = Math.min(...segRows.map(r => r[m.band[0]] ?? Infinity));
            g[m.band[1]] = Math.max(...segRows.map(r => r[m.band[1]] ?? -Infinity));
          }
        }
        for (const ph of PHASE_KEYS) {
          const k = ph + "_avg";
          g[k] = segRows.reduce((a, r) => a + (r[k] || 0) * (r.anzahl_pos || 0), 0) / totalN;
        }
        g.anzahl_pos = totalN;
        gesamt[per] = g;
      }
      idx.__gesamt = gesamt;

      this._perioden = perioden;
      this._segmente = ["Gesamt", ...segmente];
      this._idx = idx;
      this._segList = segmente; // ohne "Gesamt", für Overlay
    }

    // Serie für eine Kennzahl im aktuell gewählten Segment
    _serie(metricKey) {
      const m = METRICS.find(x => x.key === metricKey);
      const seg = this._seg;
      const get = (per) => seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + seg];
      const pts = [];
      for (const per of this._perioden) {
        const r = get(per);
        if (!r) { pts.push(null); continue; }
        pts.push({
          per, v: r[metricKey],
          lo: m.band ? r[m.band[0]] : null,
          hi: m.band ? r[m.band[1]] : null,
        });
      }
      return pts;
    }

    _render() {
      const S = this._sh;
      const state = S.getElementById("state");
      const dash = S.getElementById("dash");
      if (!this._rows) {
        state.hidden = false; dash.innerHTML = "";
        if (!state.querySelector(".we-loader")) state.innerHTML = LOADER_HTML;
        this._startLoaderSteps(); return;
      }
      if (!this._rows.length) {
        state.hidden = false;
        state.innerHTML = `<div class="state-icon">📊</div><div class="state-txt">Keine aggregierten Daten — Data Binding zuweisen</div>`;
        dash.innerHTML = ""; this._stopLoaderSteps(); return;
      }
      // Zeilen sind da, aber keine gültige Periode? Dann konnte die Dimension
      // "dimension_periode" nicht gelesen werden — praktisch immer, weil der
      // technische Feed-/Dimensionsname im Modell abweicht. Klarer Hinweis
      // statt einer leeren/kaputten Ansicht.
      const validPer = this._rows.some(r => r.periode != null && r.periode !== "");
      if (!validPer) {
        state.hidden = false;
        state.innerHTML = `<div class="state-icon">🔗</div>
          <div class="state-txt">${this._rows.length} Zeilen empfangen, aber keine Periode erkannt.<br>
          Prüfe die Zuweisung des Feeds <b>dimension_periode</b> (Kalenderwoche) im Builder.</div>`;
        dash.innerHTML = ""; this._stopLoaderSteps(); return;
      }
      state.hidden = true;
      this._stopLoaderSteps();
      this._prepare();

      // Untertitel
      const von = this._perioden[0], bis = this._perioden[this._perioden.length - 1];
      S.getElementById("sub").textContent = `${this._perioden.length} Perioden · ${von} – ${bis}`;

      // Segment-Auswahl (Segmented-Control mit Farbpunkten)
      S.getElementById("segpick").innerHTML = this._segmente.map(s =>
        `<button data-seg="${esc(s)}" class="${s===this._seg?"on":""}" style="${s===this._seg?`color:${SEG_COLORS[s]||"var(--ink)"}`:""}">
           <i style="background:${SEG_COLORS[s]||"#888"}"></i>${esc(s)}</button>`).join("");
      S.querySelectorAll("#segpick button").forEach(c =>
        c.addEventListener("click", () => { this._seg = c.dataset.seg; this._render(); }));

      // Dashboard-Grid + Prozesszeiten (einklappbar) + Detail + Scrubber
      dash.innerHTML = `<div class="grid" id="grid"></div>
        <div class="collapsible-section" style="margin-top:3mm">
          <button class="collapse-toggle" id="toggleProcessTimes" type="button" aria-expanded="${this._showProcessTimes}">
            <span class="collapse-arrow">${this._showProcessTimes ? "▾" : "▸"}</span>
            ${this._showProcessTimes ? "Prozesszeiten ausblenden" : "Prozesszeiten anzeigen"}
          </button>
          <div class="card" id="processTimesCard" ${this._showProcessTimes ? "" : "hidden"}><div id="processTimes"></div></div>
        </div>
        <div class="detail" id="detailWrap" style="margin-top:3mm">
          <div class="detail-head">
            <h3 id="detailTitle"></h3>
            <span class="open-hint" id="openHint">▸ Klicken öffnet Detailansicht</span>
            <div class="viewpick">
              <button data-dv="verlauf" class="${this._detailView==="verlauf"?"on":""}">Verlauf</button>
              <button data-dv="vergleich" class="${this._detailView==="vergleich"?"on":""}">Segmente</button>
              <button data-dv="engpass" class="${this._detailView==="engpass"?"on":""}">Engpass-Mix</button>
              <button data-dv="jahre" class="${this._detailView==="jahre"?"on":""}">Jahresvergleich</button>
            </div>
          </div>
          <div id="detailChart"></div>
          <div id="detailLegend" class="dlegend"></div>
        </div>
        <div class="insights" id="insights"></div>
        <div class="scrubber">
          <button class="play" id="play">▶</button>
          <input type="range" id="scrub" min="0" max="${this._perioden.length-1}" value="${this._perioden.length-1}">
          <span class="per" id="scrubPer"></span>
          <button class="detail-cta" id="detailCta">Periode im Detail ▸</button>
        </div>`;

      this._sh.querySelectorAll(".viewpick button").forEach(b =>
        b.addEventListener("click", () => { this._detailView = b.dataset.dv; this._render(); }));
      // Offensichtlicher Detail-Einstieg: Button öffnet die aktuell gewählte Periode
      const cta = this._sh.getElementById("detailCta");
      if (cta) cta.addEventListener("click", () => {
        const i = this._scrubIdx ?? (this._perioden.length - 1);
        this._scrubIdx = i; this._applyScrub();
        this._emitPeriod(this._perioden[i]);
      });

      const ptToggle = this._sh.getElementById("toggleProcessTimes");
      if (ptToggle) ptToggle.addEventListener("click", () => {
        this._showProcessTimes = !this._showProcessTimes;
        const card = this._sh.getElementById("processTimesCard");
        card.hidden = !this._showProcessTimes;
        ptToggle.setAttribute("aria-expanded", String(this._showProcessTimes));
        ptToggle.querySelector(".collapse-arrow").textContent = this._showProcessTimes ? "▾" : "▸";
        ptToggle.lastChild.textContent = ` ${this._showProcessTimes ? "Prozesszeiten ausblenden" : "Prozesszeiten anzeigen"}`;
      });

      this._renderTiles();
      this._renderProcessTimes();
      this._renderDetail();
      this._renderInsights();
      this._wireScrubber();
    }

    /* Erweiterte Prozesszeiten (Plan/Ist-Fenster + alle Detailübergänge bis
       Fertigstellung). Standardmäßig eingeklappt, siehe Toggle oben. Zeigt
       den aktuellen Wert der zuletzt sichtbaren Periode für das gewählte
       Segment — konsistent mit den Haupt-Kacheln. */
    _renderProcessTimes() {
      const el = this._sh.getElementById("processTimes");
      if (!el) return;
      const rows = this._rows.filter(r => r.periode === this._perioden[this._perioden.length - 1] && r.segment === this._seg);
      const r = rows[0] || {};
      const items = [
        ["plan_start_end_avg", "Geplanter Start → Geplantes Ende"],
        ["actual_start_end_avg", "Ist-Start → Ist-Ende"],
        ["arrival_dock_avg", "Ankunft → Am Tor angedockt"],
        ["dock_unload_start_avg", "Angedockt → Entladen gestartet"],
        ["unload_start_end_avg", "Entladen gestartet → Entladen beendet"],
        ["unload_end_actual_end_avg", "Entladen beendet → Tatsächliches Ende"],
        ["we_booked_completion_avg", "WE gebucht → Fertigstellung"],
        ["arrival_completion_avg", "Ankunft → Fertigstellung"],
        ["dock_completion_avg", "Angedockt → Fertigstellung"],
      ];
      el.innerHTML = `<div class="pt-hint">Letzte Periode (${esc(this._perioden[this._perioden.length-1])}) · ${esc(this._seg)}</div>
        <div class="pt-list">${items.map(([k, label]) => {
          const v = r[k];
          return `<div class="pt-row"><span class="pt-label">${label}</span><span class="pt-val">${v != null ? v.toFixed(1) + " h" : "–"}</span></div>`;
        }).join("")}</div>`;
    }

    /* Zielwert einer Kennzahl auflösen: aus der konfigurierbaren Property
       (Cockpit-/Fachbereichsvorgabe), nicht fest im Code verdrahtet. */
    _targetOf(m) {
      if (!m || !m.targetProp) return null;
      const v = this._props[m.targetProp];
      return (v == null || v === "") ? null : Number(v);
    }

    _renderTiles() {
      const grid = this._sh.getElementById("grid");
      grid.innerHTML = "";
      const yearBack = this._props.aggregation === "month" ? 12 : 52;
      METRICS.forEach((m, i) => {
        const pts = this._serie(m.key);
        const valid = pts.filter(p => p && p.v != null);
        if (!valid.length) return;
        const last = valid[valid.length - 1].v;
        // Heuristik: Eine %-Kennzahl, die über den GESAMTEN sichtbaren
        // Zeitraum exakt 0 ist, ist so gut wie nie ein echter Messwert
        // (auch bei schwacher Performance schwankt sowas minimal) —
        // meist ist die Kennzahl im Modell nicht gebunden. Zeigt "–"
        // statt einer irreführenden "0.0%"-Kachel mit falschem Ziel-Status.
        const noData = m.pct && valid.every(p => p.v === 0);
        if (noData) {
          const tileNd = document.createElement("div");
          tileNd.className = "tile tile-nodata";
          tileNd.dataset.key = m.key;
          tileNd.title = "Keine Werte gebunden oder Kennzahl liefert durchgehend 0 — Data Binding prüfen.";
          tileNd.innerHTML = `
            <div class="m-lbl">${m.label}</div>
            <div class="m-val"><b>–</b></div>
            <div class="m-sub"><span class="nodata-hint">nicht gebunden</span></div>`;
          grid.appendChild(tileNd);
          return;
        }
        const base = valid.length > 3
          ? valid.slice(0, -1).reduce((a, p) => a + p.v, 0) / (valid.length - 1) : last;
        const rel = base ? (last - base) / Math.abs(base) : 0;
        const good = m.lowerBetter ? rel < 0 : rel > 0;

        // Vorjahres-Delta: Wert der aktuellen Periode vs. gleiche Periode vor
        // einem Jahr (falls die Historie so weit reicht).
        let yoy = null;
        const lastIdx = pts.length - 1;
        if (lastIdx - yearBack >= 0) {
          const prevYear = pts[lastIdx - yearBack];
          if (prevYear && prevYear.v != null && prevYear.v)
            yoy = (last - prevYear.v) / Math.abs(prevYear.v);
        }

        // Ziel-Status
        let slaHtml = "";
        const _tgt = this._targetOf(m);
        if (_tgt != null) {
          const ok = m.lowerBetter ? last <= _tgt : last >= _tgt;
          slaHtml = `<span class="sla ${ok?"ok":"miss"}" title="Ziel ${fmtVal(_tgt,m)}${m.unit==='%'?'%':m.unit}">${ok?"✓":"✕"} Ziel</span>`;
        }
        const yoyHtml = yoy != null
          ? `<span class="yoy ${ (m.lowerBetter? yoy<0 : yoy>0)?"up":"down"}" title="vs. Vorjahr">VJ ${yoy>=0?"+":""}${(yoy*100).toFixed(0)}%</span>`
          : "";

        const tile = document.createElement("div");
        tile.className = "tile" + (m.key === this._selMetric ? " sel" : "");
        tile.dataset.key = m.key;
        tile.innerHTML = `
          <div class="m-lbl">${m.label}<button class="tile-info" data-key="${m.key}" type="button"
            aria-label="Kennzahl ${m.label} erklären" title="Kennzahl erklären">i</button></div>
          <div class="m-val"><b data-count="${last}">${m.pct ? "0.0" : "0"}</b><span class="u">${m.unit}</span>
            <span class="m-delta ${good?"up":"down"}">${rel>=0?"▲":"▼"} ${Math.abs(rel*100).toFixed(0)}%</span></div>
          <div class="m-sub">${slaHtml}${yoyHtml}</div>
          ${this._sparkSvg(pts, m, i)}`;
        tile.addEventListener("click", (e) => {
          if (e.target.closest(".tile-info")) return; // Info-Klick öffnet nur das Glossar, nicht die Detailansicht
          this._selMetric = m.key; this._render();
        });
        grid.appendChild(tile);

        this._countUp(tile.querySelector("b"), last, m);
        this._animateDraw(tile.querySelector("path.line"), tile.querySelector("circle.head"));
        this._wireSparkHover(tile, pts, m);
      });
      // Einheitliches Infobutton-System: jeder "i"-Button auf einer Kachel
      // öffnet dasselbe Begriffsverzeichnis, vorgefiltert auf die Kennzahl —
      // eine Quelle für Erklärungen, kein zweites, potenziell abweichendes Popup.
      grid.querySelectorAll(".tile-info").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const m = METRICS.find(x => x.key === btn.dataset.key);
          const search = this._sh.getElementById("glossarySearch");
          const panel = this._sh.getElementById("glossaryPanel");
          const backdrop = this._sh.getElementById("glossaryBackdrop");
          panel.hidden = false; backdrop.hidden = false;
          search.value = m ? m.label : "";
          search.dispatchEvent(new Event("input"));
        });
      });
    }

    _sparkSvg(pts, m, seed) {
      const W = 210, H = 52, pad = 3;
      const vals = pts.map(p => p && p.v != null ? p.v : null);
      const known = vals.filter(v => v != null);
      let lo = Math.min(...known), hi = Math.max(...known);
      const lineHi = hi, lineSpan = (hi - lo) || 1;
      if (m.band) {
        const loArr = pts.filter(p=>p&&p.lo!=null).map(p=>p.lo);
        if (loArr.length) lo = Math.min(lo, Math.min(...loArr));
        const bandCap = lineHi + lineSpan * 1.6;
        const hiArr = pts.filter(p=>p&&p.hi!=null).map(p=>p.hi);
        if (hiArr.length) hi = Math.max(lineHi, Math.min(Math.max(...hiArr), bandCap));
      }
      const clampY = (v) => Math.max(lo, Math.min(hi, v));
      if (lo === hi) { hi = lo + 1; }
      const n = pts.length;
      const X = (i) => pad + (i / Math.max(1, n - 1)) * (W - 2*pad);
      const Y = (v) => H - pad - ((clampY(v) - lo) / (hi - lo)) * (H - 2*pad);
      const col = SEG_COLORS[this._seg] || "var(--accent)";

      // Band-Pfad (min..max) falls vorhanden
      let bandPath = "";
      if (m.band) {
        const top = [], bot = [];
        pts.forEach((p, i) => { if (p && p.hi != null) top.push(`${X(i)},${Y(p.hi)}`); });
        pts.slice().reverse().forEach((p, ri) => { const i = n-1-ri; if (p && p.lo != null) bot.push(`${X(i)},${Y(p.lo)}`); });
        if (top.length) bandPath = `<path class="band" fill="${col}" d="M${top.join(" L")} L${bot.join(" L")} Z"/>`;
      }
      // Linien-Pfad
      let d = "", started = false;
      pts.forEach((p, i) => {
        if (!p || p.v == null) return;
        d += (started ? " L" : "M") + X(i) + "," + Y(p.v); started = true;
      });
      const lastI = (() => { for (let i=n-1;i>=0;i--) if (pts[i]&&pts[i].v!=null) return i; return 0; })();
      const lastV = pts[lastI] ? pts[lastI].v : lo;

      return `<svg class="spark" viewBox="0 0 ${W} ${H}" data-lo="${lo}" data-hi="${hi}" data-n="${n}">
        ${bandPath}
        <path class="line" stroke="${col}" d="${d}"/>
        <line class="cursor" x1="0" y1="0" x2="0" y2="${H}"/>
        <circle class="hoverpt" r="3.2" fill="${col}"/>
        <circle class="head" cx="${X(lastI)}" cy="${Y(lastV)}" r="3" fill="${col}"/>
      </svg>`;
    }

    // Linie von links nach rechts "zeichnen"
    _animateDraw(pathEl, headEl, delay = 0) {
      if (!pathEl) return;
      const reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      let len = 0; try { len = pathEl.getTotalLength(); } catch { len = 0; }
      if (!len || reduce) { if (headEl) headEl.style.opacity = ".9"; return; }
      pathEl.style.strokeDasharray = len;
      pathEl.style.strokeDashoffset = len;
      pathEl.style.transition = "none";
      void pathEl.getBoundingClientRect();
      pathEl.style.transition = `stroke-dashoffset 1s var(--ease) ${delay}ms`;
      pathEl.style.strokeDashoffset = "0";
      if (headEl) {
        headEl.style.transition = `opacity .3s ease ${delay + 900}ms`;
        requestAnimationFrame(() => { headEl.style.opacity = ".9"; });
      }
    }

    // Zahl von 0 auf Zielwert hochzählen
    _countUp(el, target, m) {
      if (el == null || target == null || isNaN(target)) { if (el) el.textContent = "–"; return; }
      const reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const disp = (v) => fmtVal(m.pct ? v/100 : v, m);
      if (reduce) { el.textContent = disp(m.pct ? target*100 : target); return; }
      const end = m.pct ? target * 100 : target;
      const dur = 700, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = disp(end * eased);
        if (k < 1) requestAnimationFrame(step);
        else el.textContent = disp(end);
      };
      requestAnimationFrame(step);
    }

    _wireSparkHover(tile, pts, m) {
      const svg = tile.querySelector("svg.spark");
      const cursor = svg.querySelector(".cursor");
      const hpt = svg.querySelector(".hoverpt");
      const tip = this._sh.getElementById("tip");
      const n = pts.length;
      const lo = +svg.dataset.lo, hi = +svg.dataset.hi;
      const W = 210, H = 52, pad = 3;
      const X = (i) => pad + (i/Math.max(1,n-1))*(W-2*pad);
      const Y = (v) => H - pad - ((v-lo)/(hi-lo))*(H-2*pad);
      svg.addEventListener("mousemove", (e) => {
        const rect = svg.getBoundingClientRect();
        const rel = (e.clientX - rect.left) / rect.width * W;
        let bi = Math.round((rel - pad) / (W - 2*pad) * (n - 1));
        bi = Math.max(0, Math.min(n - 1, bi));
        const p = pts[bi];
        if (!p || p.v == null) { cursor.style.opacity = 0; hpt.style.opacity = 0; tip.style.opacity = 0; return; }
        cursor.setAttribute("x1", X(bi)); cursor.setAttribute("x2", X(bi));
        cursor.style.opacity = .5;
        hpt.setAttribute("cx", X(bi)); hpt.setAttribute("cy", Y(p.v)); hpt.style.opacity = 1;
        const host = this.getBoundingClientRect();
        tip.style.left = (e.clientX - host.left + 10) + "px";
        tip.style.top = (e.clientY - host.top - 10) + "px";
        tip.innerHTML = `<div class="tp">${esc(p.per)}</div><b>${fmtVal(p.v, m)}</b> ${m.unit}` +
          (m.band && p.hi != null ? `<div class="tp">min ${fmtVal(p.lo,m)} · max ${fmtVal(p.hi,m)}</div>` : "");
        tip.style.opacity = 1;
      });
      svg.addEventListener("mouseleave", () => {
        cursor.style.opacity = 0; hpt.style.opacity = 0; tip.style.opacity = 0;
      });
    }

    // ── Großes Detail-Diagramm (drei Ansichten) ───────────────────────────
    _renderDetail() {
      const m = METRICS.find(x => x.key === this._selMetric) || METRICS[0];
      const host = this._sh.getElementById("detailChart");
      const legend = this._sh.getElementById("detailLegend");
      const title = this._sh.getElementById("detailTitle");
      legend.innerHTML = "";
      // Tatsächliche Breite des Chart-Containers messen, statt eine feste
      // viewBox-Breite anzunehmen. Ohne das skaliert der Browser die SVG
      // (viewBox vs. feste CSS-Höhe) nach der HÖHE — die Breite bleibt dann
      // bei genau der viewBox-Breite hängen und das Diagramm wirkt schmal
      // und zentriert mit leeren Rändern, egal wie breit der Container ist.
      const CW = Math.max(520, host.clientWidth || 860);

      if (this._detailView === "vergleich") {
        title.textContent = `${m.label} · Segmentvergleich`;
        host.innerHTML = this._compareSvg(m, CW);
        // alle Segmentlinien einzeichnen
        host.querySelectorAll("path.line").forEach((p, i) =>
          this._animateDraw(p, null, i * 90));
        legend.innerHTML = this._segList.map(s =>
          `<span class="lg"><i style="background:${SEG_COLORS[s]||"#888"}"></i>${esc(s)}</span>`).join("");
        this._wireCompareHover(host, m);
      } else if (this._detailView === "engpass") {
        title.textContent = `Engpass-Wanderung · Zusammensetzung der Standzeit · ${this._seg}`;
        host.innerHTML = this._engpassSvg(CW);
        // Flächen wachsen von unten
        host.querySelectorAll("path.area").forEach((p, i) =>
          this._animateArea(p, i * 70));
        legend.innerHTML = PHASE_KEYS.map(ph =>
          `<span class="lg"><i style="background:${PHASE_COLOR[ph]}"></i>${PHASE_LABEL[ph]}</span>`).join("");
        this._wireEngpassHover(host);
      } else if (this._detailView === "jahre") {
        title.textContent = `${m.label} · Jahresvergleich · ${this._seg}`;
        const years = this._yearSeries(m.key);
        if (years.length < 2) {
          host.innerHTML = `<div class="empty-hint">Für einen Jahresvergleich werden mindestens zwei Jahre Historie benötigt.<br>Aktuell liegt nur ${years.length === 1 ? "ein Jahr" : "kein vollständiges Jahr"} vor.</div>`;
          legend.innerHTML = "";
        } else {
          host.innerHTML = this._jahreSvg(years, m, CW);
          host.querySelectorAll("path.line").forEach((p, i) => this._animateDraw(p, null, i * 120));
          legend.innerHTML = years.map((y, i) =>
            `<span class="lg"><i style="background:${YEAR_COLORS[i % YEAR_COLORS.length]}"></i>${y.year}</span>`).join("");
        }
      } else {
        title.textContent = `${m.label} · Verlauf · ${this._seg}`;
        const pts = this._serie(m.key);
        host.innerHTML = this._bigSvg(pts, m, CW);
        this._animateDraw(host.querySelector("path.line"), null);
        this._wireBigHover(host, pts, m);
      }
      this._applyScrub();
    }

    // Serien je Kalenderjahr, ausgerichtet auf Wochen-/Monatsnummer (1..53 / 1..12)
    _yearSeries(metricKey) {
      const get = (per) => this._seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + this._seg];
      const isMonth = this._props.aggregation === "month";
      const slots = isMonth ? 12 : 53;
      const byYear = {};
      for (const per of this._perioden) {
        const m = isMonth ? /^(\d{4})-(\d{2})$/.exec(per) : /^(\d{4})-W(\d{2})$/.exec(per);
        if (!m) continue;
        const year = m[1], slot = +m[2];
        (byYear[year] ||= new Array(slots + 1).fill(null));
        const r = get(per);
        byYear[year][slot] = r ? r[metricKey] : null;
      }
      return Object.keys(byYear).sort().map(year => ({ year, pts: byYear[year], slots }));
    }

    _jahreSvg(years, m, W) {
      W = W || 760;
      const H = 260, padL = 44, padR = 16, padT = 14, padB = 28;
      const isMonth = this._props.aggregation === "month";
      const slots = isMonth ? 12 : 53;
      const all = years.flatMap(y => y.pts).filter(v => v != null);
      if (!all.length) return "";
      let lo = Math.min(...all), hi = Math.max(...all);
      const _tgtAxis = this._targetOf(m);
      if (_tgtAxis != null) { lo = Math.min(lo, _tgtAxis); hi = Math.max(hi, _tgtAxis); }
      if (lo === hi) hi = lo + 1;
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const X = (slot) => padL + ((slot - 1) / (slots - 1)) * (W - padL - padR);
      const Y = (v) => H - padB - ((v - lo) / (hi - lo)) * (H - padT - padB);

      let grid = "";
      for (let g = 0; g <= 4; g++) {
        const v = lo + (hi - lo) * g / 4, y = Y(v);
        grid += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>
          <text class="axis-lbl" x="${padL-6}" y="${y+3}" text-anchor="end">${fmtVal(v, m)}</text>`;
      }
      const stepX = isMonth ? 1 : 8;
      let xlab = "";
      for (let s = 1; s <= slots; s += stepX)
        xlab += `<text class="axis-lbl" x="${X(s)}" y="${H-8}" text-anchor="middle">${isMonth?("M"+s):("W"+String(s).padStart(2,"0"))}</text>`;
      // Ziellinie
      let target = "";
      const _tgtLine = this._targetOf(m);
      if (_tgtLine != null) {
        const ty = Y(_tgtLine);
        target = `<line x1="${padL}" y1="${ty}" x2="${W-padR}" y2="${ty}" stroke="var(--warn)"
          stroke-width="1.2" stroke-dasharray="5 4" opacity=".7"/>`;
      }
      let lines = "";
      years.forEach((y, yi) => {
        let d = "", started = false;
        y.pts.forEach((v, slot) => {
          if (v == null || slot === 0) return;
          d += (started ? " L" : "M") + X(slot) + "," + Y(v); started = true;
        });
        if (d) lines += `<path class="line" stroke="${YEAR_COLORS[yi % YEAR_COLORS.length]}"
          data-year="${y.year}" d="${d}" opacity="${yi === years.length-1 ? 1 : 0.55}"/>`;
      });
      return `<svg class="big jahre" viewBox="0 0 ${W} ${H}" data-w="${W}">${grid}${xlab}${target}${lines}</svg>`;
    }

    // Serie einer Kennzahl für ein BESTIMMTES Segment (für den Vergleich)
    _serieForSeg(metricKey, seg) {
      const get = (per) => seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + seg];
      return this._perioden.map(per => {
        const r = get(per);
        return r && r[metricKey] != null ? { per, v: r[metricKey] } : { per, v: null };
      });
    }

    // Segmentvergleich: alle Segmente als Linien, ohne Band (sonst zu unruhig)
    _compareSvg(m, W) {
      W = W || 760;
      const H = 260, padL = 44, padR = 16, padT = 14, padB = 28;
      const n = this._perioden.length;
      const series = this._segList.map(s => ({ seg: s, pts: this._serieForSeg(m.key, s) }));
      const all = series.flatMap(s => s.pts.map(p => p.v)).filter(v => v != null);
      let lo = Math.min(...all), hi = Math.max(...all);
      if (lo === hi) hi = lo + 1;
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const X = (i) => padL + (i/Math.max(1,n-1))*(W-padL-padR);
      const Y = (v) => H - padB - ((v-lo)/(hi-lo))*(H-padT-padB);

      let grid = "";
      for (let g=0; g<=4; g++) {
        const v = lo + (hi-lo)*g/4, y = Y(v);
        grid += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>
          <text class="axis-lbl" x="${padL-6}" y="${y+3}" text-anchor="end">${fmtVal(v, m)}</text>`;
      }
      const stepX = Math.ceil(n / 8);
      let xlab = "";
      this._perioden.forEach((per, i) => { if (i % stepX === 0)
        xlab += `<text class="axis-lbl" x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(per).replace(/^\d{4}-/,"")}</text>`; });

      let lines = "";
      for (const s of series) {
        let d = "", started = false;
        s.pts.forEach((p, i) => { if (p.v == null) return; d += (started?" L":"M")+X(i)+","+Y(p.v); started=true; });
        lines += `<path class="line" stroke="${SEG_COLORS[s.seg]||"#888"}" data-seg="${esc(s.seg)}" d="${d}"/>`;
      }
      return `<svg class="big compare" viewBox="0 0 ${W} ${H}" data-w="${W}" data-lo="${lo}" data-hi="${hi}" data-n="${n}"
                data-padl="${padL}" data-padr="${padR}">
        ${grid}${xlab}${lines}
        <line class="scrub-line" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="var(--ink2)" stroke-width="1" opacity="0"/>
      </svg>`;
    }

    // Engpass-Wanderung: gestapelte Fläche der Phasen-Mittelwerte über Zeit.
    _engpassSvg(W) {
      W = W || 760;
      const H = 260, padL = 44, padR = 16, padT = 14, padB = 28;
      const n = this._perioden.length;
      const get = (per) => this._seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + this._seg];
      const stacks = this._perioden.map(per => {
        const r = get(per);
        const vals = PHASE_KEYS.map(ph => r ? (r[ph+"_avg"] || 0) : 0);
        return { per, vals, total: vals.reduce((a,b)=>a+b,0) };
      });
      const hiTotal = Math.max(...stacks.map(s => s.total), 0.1);
      const X = (i) => padL + (i/Math.max(1,n-1))*(W-padL-padR);
      const Y = (v) => H - padB - (v/hiTotal)*(H-padT-padB);

      let grid = "";
      for (let g=0; g<=4; g++) {
        const v = hiTotal*g/4, y = Y(v);
        grid += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>
          <text class="axis-lbl" x="${padL-6}" y="${y+3}" text-anchor="end">${v.toFixed(1)}h</text>`;
      }
      const stepX = Math.ceil(n/8);
      let xlab = "";
      this._perioden.forEach((per,i)=>{ if(i%stepX===0)
        xlab += `<text class="axis-lbl" x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(per).replace(/^\d{4}-/,"")}</text>`; });

      let areas = "";
      let cum = new Array(n).fill(0);
      PHASE_KEYS.forEach((ph, pi) => {
        const top = [], bot = [];
        stacks.forEach((s, i) => {
          const y0 = cum[i], y1 = cum[i] + s.vals[pi];
          top.push(`${X(i)},${Y(y1)}`); bot.push(`${X(i)},${Y(y0)}`);
          cum[i] = y1;
        });
        const d = `M${top.join(" L")} L${bot.reverse().join(" L")} Z`;
        areas += `<path class="area" fill="${PHASE_COLOR[ph]}" data-ph="${ph}" d="${d}"/>`;
      });
      return `<svg class="big engpass" viewBox="0 0 ${W} ${H}" data-w="${W}" data-n="${n}" data-total="${hiTotal}"
                data-padl="${padL}" data-padr="${padR}">
        ${grid}${xlab}${areas}
        <line class="scrub-line" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="var(--ink)" stroke-width="1" opacity="0"/>
      </svg>`;
    }

    _wireCompareHover(host, m) {
      const svg = host.querySelector("svg.big");
      const tip = this._sh.getElementById("tip");
      svg.querySelectorAll("path.line").forEach(pl => {
        pl.addEventListener("mousemove", (e) => {
          svg.querySelectorAll("path.line").forEach(x => x.style.opacity = .25);
          pl.style.opacity = 1; pl.style.strokeWidth = 3.5;
          const host2 = this.getBoundingClientRect();
          tip.style.left = (e.clientX - host2.left + 10) + "px";
          tip.style.top = (e.clientY - host2.top - 10) + "px";
          tip.innerHTML = `<div class="tp">${esc(pl.dataset.seg)}</div>`;
          tip.style.opacity = 1;
        });
        pl.addEventListener("mouseleave", () => {
          svg.querySelectorAll("path.line").forEach(x => { x.style.opacity = 1; x.style.strokeWidth = 2.5; });
          tip.style.opacity = 0;
        });
      });
    }

    _wireEngpassHover(host) {
      const svg = host.querySelector("svg.big");
      const tip = this._sh.getElementById("tip");
      svg.querySelectorAll("path.area").forEach(a => {
        a.addEventListener("mousemove", (e) => {
          svg.querySelectorAll("path.area").forEach(x => x.style.opacity = .45);
          a.style.opacity = .95;
          const ph = a.dataset.ph;
          const per = this._perioden[this._scrubIdx ?? (this._perioden.length-1)];
          const r = this._seg==="Gesamt" ? this._idx.__gesamt[per] : this._idx[per+"|"+this._seg];
          const v = r ? (r[ph+"_avg"]||0) : 0;
          const host2 = this.getBoundingClientRect();
          tip.style.left = (e.clientX - host2.left + 10) + "px";
          tip.style.top = (e.clientY - host2.top - 10) + "px";
          tip.innerHTML = `<div class="tp">${PHASE_LABEL[ph]} · ${esc(per)}</div><b>${v.toFixed(2)}</b> h`;
          tip.style.opacity = 1;
        });
        a.addEventListener("mouseleave", () => {
          svg.querySelectorAll("path.area").forEach(x => x.style.opacity = .8);
          tip.style.opacity = 0;
        });
      });
    }

    _animateArea(pathEl, delay) {
      if (!pathEl) return;
      const reduce = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) { pathEl.style.opacity = .8; return; }
      pathEl.style.opacity = "0";
      pathEl.style.transformOrigin = "bottom";
      pathEl.style.transform = "scaleY(0.6)";
      pathEl.style.transition = `opacity .5s ease ${delay}ms, transform .6s var(--ease) ${delay}ms`;
      requestAnimationFrame(() => { pathEl.style.opacity = ".8"; pathEl.style.transform = "scaleY(1)"; });
    }

    // ── Automatische Befunde aus den Daten ────────────────────────────────
    _renderInsights() {
      const host = this._sh.getElementById("insights");
      if (!host) return;
      const findings = this._computeInsights();
      if (!findings.length) { host.innerHTML = ""; return; }
      host.innerHTML = `<div class="ins-head">Befunde</div>` +
        findings.map(f => `<div class="ins ${f.tone}"><i></i><span>${f.text}</span></div>`).join("");
    }

    // Befunde + aktuelle Kennzahlen als Text in die Zwischenablage
    _exportInsights() {
      const per = this._perioden[this._perioden.length - 1];
      const r = this._seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + this._seg];
      const lines = [];
      lines.push(`WE Strategie-Cockpit — ${this._seg}`);
      lines.push(`Zeitraum: ${this._perioden[0]} bis ${per} (${this._props.aggregation === "week" ? "Wochen" : "Monate"})`);
      lines.push("");
      lines.push("Kennzahlen (letzte Periode):");
      for (const m of METRICS) {
        if (r && r[m.key] != null) lines.push(`  ${m.label}: ${fmtVal(r[m.key], m)} ${m.unit}`.trimEnd());
      }
      lines.push("");
      lines.push("Befunde:");
      for (const f of this._computeInsights()) lines.push(`  - ${f.text}`);
      const text = lines.join("\n");
      const btn = this._sh.getElementById("btnExport");
      const done = () => { if (btn) { const t = btn.textContent; btn.textContent = "✓ Kopiert"; setTimeout(() => btn.textContent = t, 1500); } };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => this._fallbackCopy(text, done));
      } else this._fallbackCopy(text, done);
    }
    _fallbackCopy(text, done) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        this._sh.appendChild(ta); ta.select(); document.execCommand("copy");
        this._sh.removeChild(ta); done && done();
      } catch (e) { /* still */ }
    }

    _computeInsights() {
      const out = [];
      const perN = this._perioden.length;
      if (perN < 4) return out;
      const half = Math.floor(perN / 2);
      const seg = this._seg;
      const get = (per) => seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + seg];
      const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
      const trend = (key) => {
        const first = avg(this._perioden.slice(0, half).map(p => get(p)?.[key]).filter(v => v != null));
        const last = avg(this._perioden.slice(half).map(p => get(p)?.[key]).filter(v => v != null));
        if (first == null || last == null || !first) return null;
        return (last - first) / Math.abs(first);
      };
      const otif = trend("otif_quote");
      if (otif != null && Math.abs(otif) > 0.02)
        out.push({ tone: otif > 0 ? "good" : "bad",
          text: `OTIF ${otif > 0 ? "verbessert" : "verschlechtert"} sich um ${Math.abs(otif*100).toFixed(0)}% über den Zeitraum (${seg}).` });
      const dwell = trend("dwell_avg");
      if (dwell != null && Math.abs(dwell) > 0.05)
        out.push({ tone: dwell < 0 ? "good" : "bad",
          text: `Ø Standzeit ${dwell < 0 ? "sinkt" : "steigt"} um ${Math.abs(dwell*100).toFixed(0)}% (${seg}).` });
      const lastR = get(this._perioden[perN-1]);
      if (lastR) {
        let maxPh = null, maxV = 0;
        for (const ph of PHASE_KEYS) { const v = lastR[ph+"_avg"]||0; if (v > maxV) { maxV = v; maxPh = ph; } }
        if (maxPh) out.push({ tone: "neutral",
          text: `Größter Zeitanteil zuletzt: ${PHASE_LABEL[maxPh]} (Ø ${maxV.toFixed(1)}h).` });
      }
      let peakPer = null, peakV = 0;
      for (const per of this._perioden) { const v = get(per)?.dwell_avg; if (v != null && v > peakV) { peakV = v; peakPer = per; } }
      if (peakPer) out.push({ tone: "neutral",
        text: `Höchste Standzeit in ${peakPer} (Ø ${peakV.toFixed(1)}h) — auf Saisonspitzen prüfen.` });
      return out.slice(0, 4);
    }

    _bigSvg(pts, m, W) {
      W = W || 760;
      const H = 260, padL = 44, padR = 16, padT = 14, padB = 28;
      const n = pts.length;
      const vals = pts.filter(p=>p&&p.v!=null).map(p=>p.v);
      let lo = Math.min(...vals), dataHi = Math.max(...vals);
      // Y-Achsen-Deckel für die Linie selbst: ein einzelner Extremwert soll
      // nicht den gesamten Trend auf eine unlesbar flache Linie drücken.
      // Deckel = P90 + 1,2× der Spanne bis P90 über dem Minimum. Punkte
      // darüber werden an den oberen Rand geklemmt und als ▲ markiert;
      // der echte Wert bleibt im Tooltip ablesbar.
      let hi = dataHi;
      if (vals.length >= 6) {
        const sorted = [...vals].sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        const median = sorted[Math.floor(sorted.length * 0.5)];
        const cap = p90 + (p90 - lo) * 1.2;
        if (dataHi > cap && cap > lo) hi = Math.max(cap, median, p90);
      }
      // Die Mittelwert-Linie ist die Hauptaussage und bestimmt die Achse.
      // Das Min/Max-Band wird nur so weit gezeigt, wie es die Linie nicht an den
      // Rand drückt: Obergrenze max. 1,6× über die Linien-Spanne hinaus.
      // Extremwerte darüber bleiben im Hover-Tooltip ablesbar.
      const lineLo = lo, lineHi = hi, lineSpan = (hi - lo) || 1;
      if (m.band) {
        const loArr = pts.filter(p=>p&&p.lo!=null).map(p=>p.lo);
        if (loArr.length) lo = Math.min(lo, Math.min(...loArr));
        const bandCap = lineHi + lineSpan * 1.6;
        const hiArr = pts.filter(p=>p&&p.hi!=null).map(p=>p.hi);
        if (hiArr.length) hi = Math.min(Math.max(...hiArr), bandCap);
        hi = Math.max(hi, lineHi); // nie unter die Linie
      }
      if (lo === hi) hi = lo + 1;
      // Ziellinie einbeziehen, damit sie sichtbar bleibt
      const target = this._targetOf(m);
      if (target != null) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const clampY = (v) => Math.max(lo, Math.min(hi, v)); // Bandwerte an die Achse klemmen
      const X = (i) => padL + (i/Math.max(1,n-1))*(W-padL-padR);
      const Y = (v) => H - padB - ((clampY(v)-lo)/(hi-lo))*(H-padT-padB);
      const col = SEG_COLORS[this._seg] || "var(--accent)";
      const isClipped = (v) => v != null && v > lineHi + (lineSpan * 0.02);

      // Anomalien: Abstand zum gleitenden Mittel (Fenster 5). Ohne BW-Median,
      // rein clientseitig auf der Mittelwert-Serie. Punkte > 2×mittl. Abweichung.
      const anomFlags = this._anomalies(pts.map(p => p && p.v != null ? p.v : null));

      // Gitter + Y-Achsenbeschriftung (4 Linien)
      let grid = "";
      for (let g=0; g<=4; g++) {
        const v = lo + (hi-lo)*g/4, y = Y(v);
        grid += `<line class="grid-line" x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"/>
          <text class="axis-lbl" x="${padL-6}" y="${y+3}" text-anchor="end">${fmtVal(v, m)}</text>`;
      }
      // X-Achse: jede n-te Periode beschriften
      const stepX = Math.ceil(n / 8);
      let xlab = "";
      pts.forEach((p, i) => { if (p && i % stepX === 0) xlab += `<text class="axis-lbl" x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(p.per).replace(/^\d{4}-/,"")}</text>`; });

      // Band
      let band = "";
      if (m.band) {
        const top=[], bot=[];
        pts.forEach((p,i)=>{ if(p&&p.hi!=null) top.push(`${X(i)},${Y(p.hi)}`); });
        pts.slice().reverse().forEach((p,ri)=>{ const i=n-1-ri; if(p&&p.lo!=null) bot.push(`${X(i)},${Y(p.lo)}`); });
        if (top.length) band = `<path class="band" fill="${col}" d="M${top.join(" L")} L${bot.join(" L")} Z"/>`;
      }
      // Linie
      let d="", started=false;
      pts.forEach((p,i)=>{ if(!p||p.v==null) return; d += (started?" L":"M")+X(i)+","+Y(p.v); started=true; });
      // Ziellinie (SLA) — gestrichelt, mit Label
      let targetLine = "";
      if (target != null) {
        const ty = Y(target);
        targetLine = `<line class="target" x1="${padL}" y1="${ty}" x2="${W-padR}" y2="${ty}"
          stroke="var(--warn)" stroke-width="1.2" stroke-dasharray="5 4" opacity=".8"/>
          <text x="${W-padR}" y="${ty-4}" text-anchor="end" font-family="var(--font-mono)"
            font-size="9" fill="var(--warn)">Ziel ${fmtVal(target, m)}${m.unit==="%"?"%":m.unit}</text>`;
      }
      // Punkte — Anomalien größer und in Warnfarbe, mit Ring.
      // Über den Deckel hinausragende Punkte (isClipped) als kleines ▲
      // markieren statt als Kreis — signalisiert "geht weiter nach oben,
      // echter Wert im Tooltip" statt einen falschen Endpunkt vorzutäuschen.
      let dots="", anyClipped = false;
      pts.forEach((p,i)=>{
        if(!p||p.v==null) return;
        const clipped = isClipped(p.v);
        if (clipped) anyClipped = true;
        const title = `<title>${esc(p.per)}: ${fmtVal(p.v,m)}${m.unit==="%"?"%":m.unit}${clipped?" (Achse gekappt)":""}</title>`;
        if (clipped) {
          const cx = X(i), cy = Y(p.v);
          dots += `<path class="dot dot-clip" data-i="${i}" d="M${cx-5},${cy+4} L${cx+5},${cy+4} L${cx},${cy-4} Z"
            fill="var(--warn)" stroke="var(--bg)" stroke-width="1">${title}</path>`;
        } else if (anomFlags[i]) {
          dots += `<circle class="dot anom" data-i="${i}" cx="${X(i)}" cy="${Y(p.v)}" r="5"
            fill="var(--warn)" stroke="var(--bg)" stroke-width="1.5">${title}</circle>`;
        } else {
          dots += `<circle class="dot" data-i="${i}" cx="${X(i)}" cy="${Y(p.v)}" r="3" fill="${col}">${title}</circle>`;
        }
      });
      const clipHint = anyClipped
        ? `<text x="${W-padR}" y="${padT+8}" text-anchor="end" font-family="var(--font-mono)"
             font-size="9" fill="var(--warn)">▲ Achse gekappt · Extremwerte im Tooltip</text>`
        : "";

      return `<svg class="big" viewBox="0 0 ${W} ${H}" data-w="${W}" data-lo="${lo}" data-hi="${hi}" data-n="${n}"
                data-padl="${padL}" data-padr="${padR}" data-padt="${padT}" data-padb="${padB}">
        ${grid}${xlab}${band}${targetLine}
        <path class="line" stroke="${col}" d="${d}"/>
        <line class="scrub-line" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="${col}" stroke-width="1.5" opacity="0"/>
        ${dots}${clipHint}
      </svg>`;
    }

    // Anomalie-Erkennung: gleitendes Mittel (Fenster w), Abweichung > k×mittlere
    // absolute Abweichung. Liefert bool[] je Punkt. Funktioniert ohne Median.
    _anomalies(vals, w = 5, k = 2.2) {
      const n = vals.length, flags = new Array(n).fill(false);
      const known = vals.filter(v => v != null);
      if (known.length < 6) return flags;
      // mittlere absolute Abweichung der Gesamtserie als Skala
      const mean = known.reduce((a,b)=>a+b,0)/known.length;
      const mad = known.reduce((a,b)=>a+Math.abs(b-mean),0)/known.length || 1;
      for (let i=0;i<n;i++){
        if (vals[i]==null) continue;
        // lokales Mittel im Fenster (ohne den Punkt selbst)
        let sum=0,c=0;
        for (let j=Math.max(0,i-w);j<=Math.min(n-1,i+w);j++){
          if (j!==i && vals[j]!=null){ sum+=vals[j]; c++; }
        }
        if (!c) continue;
        const local = sum/c;
        if (Math.abs(vals[i]-local) > k*mad) flags[i]=true;
      }
      return flags;
    }

    _wireBigHover(host, pts, m) {
      const svg = host.querySelector("svg.big");
      const tip = this._sh.getElementById("tip");
      // Ganzflächiges Klick-/Hover-Feld über dem Plotbereich: nächstgelegene
      // Periode öffnen. Macht die gesamte Fläche zum Ziel statt nur die Punkte.
      const n = +svg.dataset.n, padL = +svg.dataset.padl, padR = +svg.dataset.padr;
      const W = +svg.dataset.w || 760, plotW = W - padL - padR;
      const nearestIdx = (clientX) => {
        const r = svg.getBoundingClientRect();
        const svgX = (clientX - r.left) / r.width * W; // in viewBox-Koordinaten
        const frac = (svgX - padL) / plotW;
        return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
      };
      const guide = svg.querySelector(".scrub-line");
      const openHint = this._sh.getElementById("openHint");
      svg.style.cursor = "pointer";
      svg.addEventListener("mousemove", (e) => {
        const i = nearestIdx(e.clientX), p = pts[i];
        if (!p) return;
        // Führungslinie an die nächstgelegene Periode
        const X = padL + (i/Math.max(1,n-1))*plotW;
        if (guide) { guide.setAttribute("x1", X); guide.setAttribute("x2", X); guide.setAttribute("opacity", .5); }
        const host2 = this.getBoundingClientRect();
        tip.style.left = (e.clientX - host2.left + 12) + "px";
        tip.style.top = (e.clientY - host2.top - 44) + "px";
        tip.innerHTML = `<div class="tp">${esc(p.per)} · klicken öffnet Detail</div>`
          + (p.v != null ? `<b>${fmtVal(p.v,m)}</b> ${m.unit}` : "");
        tip.style.opacity = 1;
        if (openHint) openHint.style.opacity = 1;
      });
      svg.addEventListener("mouseleave", () => {
        tip.style.opacity = 0;
        if (guide) guide.setAttribute("opacity", 0);
        if (openHint) openHint.style.opacity = .55;
      });
      svg.addEventListener("click", (e) => {
        const i = nearestIdx(e.clientX);
        this._scrubIdx = i; this._applyScrub();
        this._emitPeriod(pts[i] && pts[i].per);
      });
      // Punkte behalten ihren Hover (größerer Radius), Klick delegiert nach oben
      svg.querySelectorAll(".dot").forEach(dot => {
        dot.addEventListener("mouseenter", () => dot.setAttribute("r", dot.classList.contains("anom") ? 6.5 : 5));
        dot.addEventListener("mouseleave", () => dot.setAttribute("r", dot.classList.contains("anom") ? 5 : 3));
      });
    }

    // SAC-Event für die Kopplung: das Review-Widget kann darauf hören und in
    // genau diesen Zeitraum springen. In der Story per Scripting verdrahtet.
    // Rechnet eine Periode ("2026-W03" oder "2026-01") in einen Datumsbereich
    // {von, bis} als ISO-Strings (yyyy-mm-dd) um. Für den Story-Filter.
    _periodRange(per) {
      let m = /^(\d{4})-W(\d{2})$/.exec(per);
      if (m) {
        const year = +m[1], week = +m[2];
        // ISO: Montag der KW über den 4. Januar
        const jan4 = new Date(Date.UTC(year, 0, 4));
        const day = (jan4.getUTCDay() + 6) % 7;
        const w1mon = new Date(jan4); w1mon.setUTCDate(jan4.getUTCDate() - day);
        const von = new Date(w1mon); von.setUTCDate(w1mon.getUTCDate() + (week - 1) * 7);
        const bis = new Date(von); bis.setUTCDate(von.getUTCDate() + 6);
        return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
      }
      m = /^(\d{4})-(\d{2})$/.exec(per);
      if (m) {
        const year = +m[1], mon = +m[2];
        const von = new Date(Date.UTC(year, mon - 1, 1));
        const bis = new Date(Date.UTC(year, mon, 0)); // letzter Tag des Monats
        return { von: von.toISOString().slice(0, 10), bis: bis.toISOString().slice(0, 10) };
      }
      return { von: null, bis: null };
    }

    // Vorjahresperiode: gleiche KW/gleicher Monat, Jahr -1
    _priorYearPeriod(per) {
      let m = /^(\d{4})-W(\d{2})$/.exec(per);
      if (m) return `${(+m[1]) - 1}-W${m[2]}`;
      m = /^(\d{4})-(\d{2})$/.exec(per);
      if (m) return `${(+m[1]) - 1}-${m[2]}`;
      return null;
    }

    // Kennzahlenvergleich aktuelle Periode vs. Vorjahresperiode (aus Aggregat)
    _yoyComparison(per, pyPer) {
      const seg = this._seg;
      const get = (p) => seg === "Gesamt" ? this._idx.__gesamt[p] : this._idx[p + "|" + seg];
      const cur = get(per), prev = pyPer ? get(pyPer) : null;
      const out = [];
      for (const mt of METRICS) {
        const c = cur ? cur[mt.key] : null;
        const p = prev ? prev[mt.key] : null;
        if (c == null && p == null) continue;
        out.push({ key: mt.key, label: mt.label, unit: mt.unit, pct: !!mt.pct,
                   lowerBetter: !!mt.lowerBetter, cur: c, prev: p,
                   curTxt: c != null ? fmtVal(c, mt) : "–", prevTxt: p != null ? fmtVal(p, mt) : "–" });
      }
      return out;
    }

    _emitPeriod(periode) {
      if (!periode) return;
      const { von, bis } = this._periodRange(periode);
      const pyPer = this._priorYearPeriod(periode);
      const pyRange = pyPer ? this._periodRange(pyPer) : { von: null, bis: null };
      const comparison = this._yoyComparison(periode, pyPer);
      // Für SAC-Scripting als einfache Strings ablegen (Getter unten)
      this._selectedPeriod = periode;
      this._selectedFrom = von;
      this._selectedTo = bis;
      this._selectedSegment = this._seg;
      this._priorPeriod = pyPer;
      this._priorFrom = pyRange.von;
      this._priorTo = pyRange.bis;
      this._yoy = comparison;
      const detail = { periode, segment: this._seg, von, bis,
        vorjahr: { periode: pyPer, von: pyRange.von, bis: pyRange.bis }, vergleich: comparison };
      try {
        this.dispatchEvent(new CustomEvent("onPeriodSelect", { detail }));
      } catch (e) { /* ältere Umgebungen */ }
      if (typeof this.onPeriodSelect === "function") { try { this.onPeriodSelect(periode, this._seg, von, bis); } catch(e){} }
    }

    // Von SAC-Scripting lesbar (einfache String-Rückgaben, am robustesten):
    getSelectedPeriod()  { return this._selectedPeriod  || ""; }
    getSelectedFrom()    { return this._selectedFrom    || ""; } // yyyy-mm-dd
    getSelectedTo()      { return this._selectedTo      || ""; } // yyyy-mm-dd
    getSelectedSegment() { return this._selectedSegment || ""; }
    getPriorYearPeriod() { return this._priorPeriod || ""; }
    getPriorYearFrom()   { return this._priorFrom   || ""; }
    getPriorYearTo()     { return this._priorTo     || ""; }
    // JSON-String des Kennzahlenvergleichs (aktuell vs. Vorjahr)
    getYoYComparison()   { try { return JSON.stringify(this._yoy || []); } catch(e){ return "[]"; } }

    /* Kompakt-/Seitenleisten-Modus: das Widget rückt zur Seite und zeigt nur
       noch die gewählte Periode + die Kernzahlen dieser Periode. Wird vom
       Story-Skript beim Öffnen der Detailansicht aufgerufen, mit exitCompact()
       wieder zurück. */
    setCompact(periode) {
      this._compact = true;
      const root = this._sh.querySelector(".root");
      if (root) root.classList.add("compact");
      // Scrubber auf die gewählte Periode stellen, damit die Kacheln deren Werte zeigen
      const idx = this._perioden.indexOf(periode);
      if (idx >= 0) { this._scrubIdx = idx; this._applyScrub(); }
      this._renderSelHead(periode);
    }
    exitCompact() {
      this._compact = false;
      const root = this._sh.querySelector(".root");
      if (root) root.classList.remove("compact");
      const sh = this._sh.getElementById("selHead");
      if (sh) sh.hidden = true;
      // Scrubber ans Ende zurück
      this._scrubIdx = null; this._applyScrub();
    }
    _renderSelHead(periode) {
      const el = this._sh.getElementById("selHead");
      if (!el) return;
      const seg = this._seg && this._seg !== "Gesamt" ? this._seg : "Alle Segmente";
      const { von, bis } = this._periodRange(periode);
      const fmtD = (s) => { if (!s) return ""; const d = new Date(s); return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }); };
      el.hidden = false;
      el.innerHTML = `
        <div class="sh-eyebrow">Gewählter Zeitabschnitt</div>
        <div class="sh-per">${esc(periode)}</div>
        <div class="sh-seg"><span class="sh-dot" style="background:${SEG_COLORS[this._seg]||"var(--accent)"}"></span>${esc(seg)}</div>
        ${von ? `<div class="sh-range">${fmtD(von)} – ${fmtD(bis)}</div>` : ""}
        <div class="sh-hint">Kernzahlen dieser Periode ↓</div>`;
    }

    // ── Scrubber: fährt durch Perioden, Kacheln zeigen Wert an dem Punkt ──
    _wireScrubber() {
      const scrub = this._sh.getElementById("scrub");
      const play = this._sh.getElementById("play");
      scrub.addEventListener("input", () => { this._scrubIdx = +scrub.value; this._applyScrub(); });
      play.addEventListener("click", () => this._playing ? this._stopPlay() : this._startPlay());
      this._scrubIdx = this._perioden.length - 1;
      this._applyScrub();
    }

    _applyScrub() {
      const i = this._scrubIdx ?? (this._perioden.length - 1);
      const per = this._perioden[i];
      const sp = this._sh.getElementById("scrubPer");
      if (sp) sp.textContent = per || "";
      // Scrub-Linie im großen Chart positionieren
      const svg = this._sh.querySelector("svg.big");
      if (svg) {
        const n = +svg.dataset.n, padL = +svg.dataset.padl, padR = +svg.dataset.padr;
        const W = +svg.dataset.w || 760;
        const X = padL + (i/Math.max(1,n-1))*(W-padL-padR);
        const line = svg.querySelector(".scrub-line");
        if (line) { line.setAttribute("x1", X); line.setAttribute("x2", X); line.setAttribute("opacity", .6); }
      }
      // Kachelwerte auf diese Periode setzen
      this._sh.querySelectorAll(".tile").forEach(tile => {
        const m = METRICS.find(x => x.key === tile.dataset.key);
        if (!m) return;
        const r = this._seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + this._seg];
        const b = tile.querySelector("b");
        if (r && r[m.key] != null) b.textContent = fmtVal(r[m.key], m);
      });
    }

    _startPlay() {
      this._playing = true;
      this._sh.getElementById("play").textContent = "⏸";
      const scrub = this._sh.getElementById("scrub");
      if (this._scrubIdx == null || this._scrubIdx >= this._perioden.length - 1) this._scrubIdx = 0;
      this._playTimer = setInterval(() => {
        this._scrubIdx++;
        if (this._scrubIdx >= this._perioden.length) { this._stopPlay(); return; }
        scrub.value = this._scrubIdx;
        this._applyScrub();
      }, 380);
    }
    _stopPlay() {
      this._playing = false;
      const p = this._sh.getElementById("play"); if (p) p.textContent = "▶";
      if (this._playTimer) { clearInterval(this._playTimer); this._playTimer = null; }
    }
  }

  if (!customElements.get("we-strategie")) customElements.define("we-strategie", WEStrategie);
})();
