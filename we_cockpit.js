/* =========================================================================
 * WE Prozess-Cockpit – SAC Custom Widget (v0.5.0) · Entwickler: Benne
 * Nur die Hauptkomponente <we-cockpit>. Kein separates Builder-Panel mehr:
 * Kalibrierung (Ausreisser-Schwelle, Toleranz, Baseline, Team-Rotation) und
 * Dark Mode sind ueber ⚙ / ◐ direkt im Widget bedienbar (siehe README).
 * ========================================================================= */
/* =========================================================================
 * WE Prozess-Cockpit  –  SAC Custom Widget (Grundgerüst v0.1)
 * -------------------------------------------------------------------------
 * Aufbau:
 *   1. WEEngine   – reine Datenlogik (Phasen, Segmente, MAD-Ausreißer,
 *                   Schichtgruppen/Teams, Heatmap, KPIs). Ohne DOM,
 *                   dadurch in Node testbar.
 *   2. WECockpit  – Web Component (Shadow DOM, SVG-Rendering, Tabs,
 *                   SAC-Lifecycle + Data-Binding-Mapping).
 * ========================================================================= */
(function () {
  "use strict";

  /* ============================ 1. ENGINE ============================== */

  const H = 3600e3; // ms pro Stunde

  // Null-Werte, die BW/SAC liefern kann (Konvention aus dem WE-Tracker)
  const NULL_TOKENS = new Set(["", "#", "00000000", "000000000000", "@NullMember", "@TotalMembers", "null", "undefined"]);
  const isNull = (v) => v == null || NULL_TOKENS.has(String(v).trim());

  function parseTs(v) {
    if (isNull(v)) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    // dd.mm.yyyy hh:mm  (CSV-Export)
    let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
    m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); // nur Datum
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    // SAP-intern: "20250520073700" (YYYYMMDDHHmmss)
    if (/^\d{14}$/.test(s))
      return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
    // SAP-Datum: "20250520"
    if (/^\d{8}$/.test(s))
      return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    // ISO 8601: "2025-05-20T07:37:00" oder mit Leerzeichen
    const d = new Date(s.replace(" ", "T"));
    return isNaN(d) ? null : d;
  }

  function parseKw(v) {
    // "12.2022" -> {kw:12, jahr:2022}
    if (v == null || v === "#" || v === "") return null;
    const m = String(v).trim().match(/^(\d{1,2})\.(\d{4})$/);
    return m ? { kw: +m[1], jahr: +m[2] } : null;
  }

  function median(a) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function quantile(a, q) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return s[lo] + (s[hi] - s[lo]) * (p - lo);
  }

  /** Robuste Baseline: Median + MAD, Fallback IQR wenn MAD == 0. */
  function baseline(values) {
    const med = median(values);
    let mad = median(values.map((v) => Math.abs(v - med)));
    let scale = mad / 0.6745; // Konsistenz zur Normalverteilung
    if (!scale) {
      const iqr = quantile(values, 0.75) - quantile(values, 0.25);
      scale = iqr / 1.349 || 1e-9;
    }
    return { med, scale, n: values.length };
  }

  function segmentOf(ladestelle, tm) {
    // Bevorzugt die Ladestelle (BSL / Container / Landverkehr), wie im WE-Tracker
    if (!isNull(ladestelle)) {
      const l = String(ladestelle).toUpperCase();
      if (l.includes("CONTAINER")) return "Container";
      if (l.includes("LANDVERKEHR") || l.includes("LKW")) return "LKW";
      return String(ladestelle).trim(); // z. B. "BSL" als eigenes Segment
    }
    if (isNull(tm)) return "Sonstige";
    const t = String(tm).toUpperCase();
    if (t === "SZ" || t === "BSL" || t.includes("LKW")) return "LKW";
    if (/G0|CONTAINER|'/.test(t) || /^\d{2}[A-Z]\d$/.test(t)) return "Container";
    return "Sonstige";
  }

  /** Teamzuordnung aus wöchentlicher F/S-Rotation. */
  function teamOf(sh, kwObj, cfg) {
    if (!sh || sh === "#" || !kwObj) return null;
    const even = kwObj.kw % 2 === 0;
    const frueh = sh === "F";
    // gerade KW + Früh -> teamEvenFrueh; alles andere spiegelbildlich
    return (even === frueh) ? cfg.teamEvenFrueh : cfg.teamOddFrueh;
  }

  const PHASES = {
    wait_gate: { label: "Wartezeit Tor",  from: "ts_ankunft",        to: "ts_angedockt",     level: "delivery" },
    reaction:  { label: "Reaktionszeit",  from: "ts_angedockt",      to: "ts_entladen_start", level: "delivery" },
    unload:    { label: "Entladedauer",   from: "ts_entladen_start", to: "ts_entladen_ende_eff", level: "delivery" },
    booking:   { label: "Buchungsverzug", from: "ts_entladen_ende_eff", to: "ts_we_pos",     level: "position" },
    putaway:   { label: "Einlagerung",    from: "ts_we_pos",         to: "ts_einlagerung",   level: "position" },
    dwell:     { label: "Standzeit",      from: "ts_ankunft",        to: "ts_abfahrt",       level: "delivery" },
    delay:     { label: "Verspätung",     from: "ts_geplant",        to: "ts_ankunft",       level: "delivery" },
  };

  function hoursBetween(row, from, to) {
    const a = row[from], b = row[to];
    if (!a || !b) return null;
    return (b - a) / H;
  }

  /**
   * Kernfunktion: kanonische Zeilen -> Analysemodell.
   * rows: [{belegnr,pos,lieferant,frachtfuehrer,transportmittel,hwg,land,
   *         ts_*, sh_entl,kw_entl, sh_we,kw_we, sh_einl,kw_einl,
   *         menge_ist, menge_soll}]
   */
  function buildModel(rows, cfg) {
    cfg = Object.assign(
      { madThreshold: 3.5, teamEvenFrueh: "Team A", teamOddFrueh: "Team B", baselineMode: "segment", toleranzMin: 30 },
      cfg || {}
    );

    /* --- Normalisierung ------------------------------------------------ */
    let lastBeleg = null;
    const positions = [];
    for (const r0 of rows) {
      const r = Object.assign({}, r0);
      // Belegnummer/TE nur auf erster Position gefüllt -> forward fill
      if (!isNull(r.belegnr)) lastBeleg = String(r.belegnr);
      r.belegnr = lastBeleg;
      for (const k of Object.keys(r)) if (k.startsWith("ts_")) r[k] = parseTs(r[k]);
      // Korrekturfeld "Tatsächliches Ende" hat Vorrang
      r.ts_entladen_ende_eff = r.ts_entladen_tat || r.ts_entladen_ende;
      // Zeitfenster (geplant_start/ende) hat Vorrang vor Einzeltermin
      if (!r.ts_geplant && r.ts_geplant_ende) r.ts_geplant = r.ts_geplant_ende;
      r.segment = segmentOf(r.ladestelle, r.transportmittel);
      r.kw_entl = parseKw(r.kw_entl); r.kw_we = parseKw(r.kw_we); r.kw_einl = parseKw(r.kw_einl);
      r.team_entl = teamOf(r.sh_entl, r.kw_entl, cfg);
      r.team_einl = teamOf(r.sh_einl, r.kw_einl, cfg);
      r.menge_ist = num(r.menge_ist); r.menge_soll = num(r.menge_soll);
      r.qty_dev = (r.menge_ist != null && r.menge_soll != null) ? r.menge_ist - r.menge_soll : null;
      r.qty_dev_pct = (r.qty_dev != null && r.menge_soll) ? (100 * r.qty_dev) / r.menge_soll : null;
      positions.push(r);
    }

    /* --- Anlieferungen (Hofprozess) deduplizieren ----------------------- */
    const dmap = new Map();
    for (const p of positions) {
      const key = p.belegnr || "?";
      if (!dmap.has(key)) {
        dmap.set(key, {
          belegnr: key, segment: p.segment, lieferant: p.lieferant,
          frachtfuehrer: p.frachtfuehrer, transportmittel: p.transportmittel,
          ts_ankunft: p.ts_ankunft, ts_angedockt: p.ts_angedockt,
          ts_entladen_start: p.ts_entladen_start, ts_entladen_ende_eff: p.ts_entladen_ende_eff,
          ts_abfahrt: p.ts_abfahrt, ts_geplant: p.ts_geplant,
          ts_geplant_start: p.ts_geplant_start, ts_geplant_ende: p.ts_geplant_ende,
          team_entl: p.team_entl, sh_entl: p.sh_entl, kw_entl: p.kw_entl,
          nPos: 0,
        });
      }
      dmap.get(key).nPos++;
    }
    const deliveries = [...dmap.values()];

    /* --- Phasen berechnen + Datenfehler trennen ------------------------- */
    const dataErrors = [];
    function computePhases(rec, keys, ctx) {
      rec.phases = {};
      for (const k of keys) {
        const ph = PHASES[k];
        const h = hoursBetween(rec, ph.from, ph.to);
        if (h == null) { rec.phases[k] = null; continue; }
        if (k !== "delay" && h < 0) {
          dataErrors.push({ ctx, key: rec.belegnr + (rec.pos ? "/" + rec.pos : ""), phase: ph.label, hours: h, rec });
          rec.phases[k] = null;                    // aus Statistik ausschließen
          rec.hasError = true;
          continue;
        }
        rec.phases[k] = h;
      }
    }
    for (const d of deliveries) {
      computePhases(d, ["wait_gate", "reaction", "unload", "dwell", "delay"], "Anlieferung");
      // Zeitfenster-Logik (Tracker-Konvention geplant_start/ende):
      // innerhalb des Fensters = pünktlich (0), sonst Abstand zur Fenstergrenze
      if (d.ts_ankunft && d.ts_geplant_start && d.ts_geplant_ende) {
        const a = d.ts_ankunft;
        d.phases.delay = a < d.ts_geplant_start ? (a - d.ts_geplant_start) / H
          : a > d.ts_geplant_ende ? (a - d.ts_geplant_ende) / H : 0;
      }
    }
    for (const p of positions)  computePhases(p, ["booking", "putaway"], "Position");

    /* --- Baselines je (Metrik, Segment) + Ausreißer ---------------------
     * Dauer-Metriken sind stark rechtsschief -> Baseline im log-Raum
     * (senkt die Ausreißerquote von ~20 % auf ~3 % bei gleicher Schwelle).
     * 'delay' kann negativ sein -> bleibt linear, zweiseitig.            */
    const LOG_EPS = 0.05; // 3 min, macht log() bei 0h stabil
    const metricDefs = {
      dwell:   { level: "delivery", twoSided: false, log: true },
      unload:  { level: "delivery", twoSided: false, log: true },
      wait_gate:{ level: "delivery", twoSided: false, log: true },
      putaway: { level: "position", twoSided: false, log: true },
      booking: { level: "position", twoSided: false, log: true },
      delay:   { level: "delivery", twoSided: true,  log: false },
    };
    const baselines = {};
    const segKey = (seg) => (cfg.baselineMode === "global" ? "ALLE" : seg);
    const toDom = (v, log) => (log ? Math.log(v + LOG_EPS) : v);

    for (const [mk, def] of Object.entries(metricDefs)) {
      const recs = def.level === "delivery" ? deliveries : positions;
      const groups = {};
      for (const r of recs) {
        const v = r.phases && r.phases[mk];
        if (v == null) continue;
        (groups[segKey(r.segment)] ||= []).push(toDom(v, def.log));
      }
      baselines[mk] = {};
      for (const [g, vals] of Object.entries(groups))
        if (vals.length >= 8) {
          const b = baseline(vals);
          b.log = def.log;
          // Anzeigewerte im Originalraum (Median + Ausreißergrenze in h)
          b.medH = def.log ? Math.exp(b.med) - LOG_EPS : b.med;
          b.limitH = def.log
            ? Math.exp(b.med + cfg.madThreshold * b.scale) - LOG_EPS
            : b.med + cfg.madThreshold * b.scale;
          baselines[mk][g] = b;
        }

      for (const r of recs) {
        const v = r.phases && r.phases[mk];
        r.z ||= {}; r.outlier ||= {};
        if (v == null) { r.z[mk] = null; continue; }
        const b = baselines[mk][segKey(r.segment)];
        if (!b) { r.z[mk] = null; continue; }
        const z = (toDom(v, def.log) - b.med) / b.scale;
        r.z[mk] = z;
        r.outlier[mk] = def.twoSided ? Math.abs(z) > cfg.madThreshold : z > cfg.madThreshold;
      }
    }

    /* --- Mengenabweichung ------------------------------------------------ */
    let qtyTotal = 0, qtyOk = 0;
    for (const p of positions) {
      if (p.qty_dev == null) continue;
      qtyTotal++;
      if (p.qty_dev === 0) qtyOk++;
      p.outlier.qty = p.qty_dev !== 0;
    }

    /* --- Heatmap Wochentag x Stunde (Ankünfte, Anlieferungsebene) ------- */
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const d of deliveries)
      if (d.ts_ankunft) heat[(d.ts_ankunft.getDay() + 6) % 7][d.ts_ankunft.getHours()]++;

    /* --- Team-Vergleich (rotationsbereinigt) ----------------------------- */
    function teamStats(recs, phaseKey, teamField, shField) {
      const out = {};
      for (const r of recs) {
        const t = r[teamField], v = r.phases && r.phases[phaseKey];
        if (!t || v == null) continue;
        const lage = r[shField] === "F" ? "Früh" : "Spät";
        ((out[t] ||= {})[lage] ||= []).push(v);
      }
      const res = {};
      for (const [t, lagen] of Object.entries(out)) {
        res[t] = {};
        for (const [l, vals] of Object.entries(lagen))
          res[t][l] = { med: median(vals), n: vals.length };
      }
      return res;
    }
    const teams = {
      unload:  teamStats(deliveries, "unload", "team_entl", "sh_entl"),
      putaway: teamStats(positions, "putaway", "team_einl", "sh_einl"),
    };

    /* --- Phasen-Mediane je Segment (Vergleichsbasis für Detailansicht) -- */
    const phaseMed = {};
    for (const [k, ph] of Object.entries(PHASES)) {
      const recs = ph.level === "delivery" ? deliveries : positions;
      const bySeg = {};
      for (const r of recs) {
        const v = r.phases && r.phases[k];
        if (v == null) continue;
        (bySeg[r.segment] ||= []).push(v);
      }
      phaseMed[k] = {};
      for (const [s, vals] of Object.entries(bySeg)) phaseMed[k][s] = median(vals);
    }

    /* --- KPIs ------------------------------------------------------------ */
    const val = (recs, k) => recs.map((r) => r.phases && r.phases[k]).filter((v) => v != null);
    const outRate = (recs, k) => {
      const rel = recs.filter((r) => r.phases && r.phases[k] != null);
      return rel.length ? recs.filter((r) => r.outlier && r.outlier[k]).length / rel.length : 0;
    };
    const delays = val(deliveries, "delay");
    const tolH = (cfg.toleranzMin ?? 30) / 60;
    const kpis = {
      medDwell: median(val(deliveries, "dwell")),
      medUnload: median(val(deliveries, "unload")),
      medPutaway: median(val(positions, "putaway")),
      outDwell: outRate(deliveries, "dwell"),
      outPutaway: outRate(positions, "putaway"),
      onTime: delays.length ? delays.filter((d) => d <= tolH).length / delays.length : NaN,
      tolMin: cfg.toleranzMin ?? 30,
      qtyOkRate: qtyTotal ? qtyOk / qtyTotal : NaN,
      nDeliveries: deliveries.length,
      nPositions: positions.length,
      nErrors: dataErrors.length,
    };

    return { positions, deliveries, baselines, phaseMed, dataErrors, heat, teams, kpis, cfg };
  }

  function num(v) {
    if (isNull(v)) return null;
    if (typeof v === "number") return v;
    if (typeof v === "object" && "raw" in v) return Number(v.raw); // SAC-Measure
    const m = String(v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  const WEEngine = { parseTs, parseKw, baseline, buildModel, segmentOf, teamOf, PHASES, median };
  if (typeof globalThis !== "undefined") globalThis.WEEngine = WEEngine;

  /* ======================= 2. WEB COMPONENT =========================== */
  if (typeof customElements === "undefined") return; // Node-Testumgebung

  const C = {
    // Theme-abhängig (CSS-Variablen, definiert in :host / :host([data-theme=dark]))
    ink: "var(--ink)", muted: "var(--muted)", border: "var(--border)",
    panel: "var(--panel)", bg: "var(--bg)", band: "var(--band)",
    // Akzentfarben (theme-unabhängig)
    lkw: "#2E6FA3", container: "#1F8A70", sonst: "#9BA6B2",
    outlier: "#E8590C", error: "#8A4FFF", ok: "#2F9E44",
  };
  const SEGC = { LKW: C.lkw, Container: C.container, BSL: "#B0801F", Sonstige: C.sonst };

  const THEME_VARS = `
    :host{ --bg:#FFFFFF; --panel:#F6F8FA; --ink:#22303C; --muted:#7A8794;
           --border:#E2E8EE; --band:rgba(232,89,12,.08); }
    :host([data-theme="dark"]){ --bg:#1B232C; --panel:#232E39; --ink:#E8EEF4;
           --muted:#93A1B0; --border:#33404D; --band:rgba(232,89,12,.18); }`;

  const MODES = [
    { id: "hof",    label: "Hofprozess",  metric: "dwell",   level: "delivery", phases: ["wait_gate", "reaction", "unload"], unit: "h", desc: "Standzeit Ankunft → Abfahrt" },
    { id: "lager",  label: "Lagerprozess", metric: "putaway", level: "position", phases: ["booking", "putaway"], unit: "h", desc: "WE-Buchung → Einlagerung" },
    { id: "termin", label: "Termintreue", metric: "delay",   level: "delivery", phases: [], unit: "h", desc: "Ankunft vs. geplante Lieferung" },
    { id: "mengen", label: "Mengen",      metric: "qty",     level: "position", phases: [], unit: "%", desc: "IST vs. SOLL Anlieferungsmenge" },
    { id: "muster", label: "Muster & Schicht", metric: null, level: null, phases: [], unit: "", desc: "Anliefermuster und Team-Vergleich" },
  ];

  const TPL = `
  <style>
    ${THEME_VARS}
    :host { display:block; width:100%; height:100%;
      font-family:"72","72full","Segoe UI",system-ui,sans-serif; color:${C.ink}; }
    *,*::before,*::after{ box-sizing:border-box; }
    .root{ display:flex; flex-direction:column; height:100%; background:${C.bg};
      border:1px solid ${C.border}; border-radius:8px; overflow:hidden; }
    /* Kopf: Titel + Steuerung + KPI-Leiste */
    header{ padding:10px 14px 0; position:relative;}
    .titlebar{ display:flex; align-items:center; gap:8px;}
    .title{ font-size:13px; font-weight:700; letter-spacing:.4px; text-transform:uppercase;}
    .title small{ color:${C.muted}; font-weight:400; text-transform:none; letter-spacing:0; margin-left:8px;}
    .ctrl{ margin-left:auto; display:flex; gap:6px;}
    .ctrl button{ font:inherit; font-size:13px; line-height:1; padding:5px 8px; border:1px solid ${C.border};
      border-radius:5px; background:${C.panel}; color:${C.ink}; cursor:pointer;}
    .ctrl button:hover{ border-color:${C.outlier};}
    .ctrl button.on{ border-color:${C.outlier}; color:${C.outlier};}
    /* Kalibrierungs-Panel */
    .cfg{ position:absolute; right:14px; top:38px; z-index:20; width:250px; padding:12px;
      background:${C.bg}; border:1px solid ${C.border}; border-radius:8px;
      box-shadow:0 6px 22px rgba(0,0,0,.18); font-size:12px;}
    .cfg[hidden]{ display:none;}
    .cfg h4{ margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:${C.muted};}
    .cfg label{ display:flex; justify-content:space-between; margin:8px 0 3px; font-weight:600; font-size:11px;}
    .cfg label output{ font-weight:400; color:${C.outlier}; font-variant-numeric:tabular-nums;}
    .cfg input,.cfg select{ width:100%; padding:5px 7px; border:1px solid ${C.border}; border-radius:4px;
      font:inherit; font-size:12px; background:${C.panel}; color:${C.ink}; box-sizing:border-box;}
    .cfg input[type=range]{ padding:0; accent-color:${C.outlier};}
    .cfg .hint{ color:${C.muted}; font-size:10px; margin-top:2px;}
    .kpis{ display:flex; gap:0; margin:8px 0 0; border:1px solid ${C.border}; border-radius:6px; overflow:hidden;}
    .kpi{ flex:1; padding:7px 10px; border-right:1px solid ${C.border}; background:${C.panel}; min-width:0;}
    .kpi:last-child{ border-right:0;}
    .kpi b{ display:block; font-size:17px; font-variant-numeric:tabular-nums; line-height:1.15;}
    .kpi span{ font-size:10px; color:${C.muted}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;}
    .kpi.warn b{ color:${C.outlier};} .kpi.err b{ color:${C.error};} .kpi.ok b{ color:${C.ok};}
    /* Tabs */
    nav{ display:flex; gap:2px; padding:8px 14px 0;}
    nav button{ font:inherit; font-size:12px; padding:6px 12px; border:0; background:transparent;
      color:${C.muted}; cursor:pointer; border-bottom:2px solid transparent;}
    nav button.on{ color:${C.ink}; font-weight:600; border-bottom-color:${C.outlier};}
    nav button:focus-visible{ outline:2px solid ${C.lkw}; outline-offset:-2px;}
    main{ flex:1; overflow:auto; padding:10px 14px;}
    .row{ display:flex; gap:14px; flex-wrap:wrap;}
    .card{ flex:1 1 340px; min-width:280px;}
    .card h3{ font-size:11px; font-weight:600; color:${C.muted}; margin:0 0 4px; text-transform:uppercase; letter-spacing:.4px;}
    svg text{ font-family:inherit;}
    /* Tabelle */
    table{ width:100%; border-collapse:collapse; font-size:11.5px; margin-top:6px;}
    th{ text-align:left; color:${C.muted}; font-weight:600; padding:4px 6px; border-bottom:1px solid ${C.border}; font-size:10.5px; text-transform:uppercase; letter-spacing:.3px;}
    td{ padding:4px 6px; border-bottom:1px solid ${C.border}; font-variant-numeric:tabular-nums;}
    tr.sel td, tbody tr:hover td{ background:${C.band}; cursor:pointer;}
    .tag{ display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; color:#fff;}
    .empty{ color:${C.muted}; font-size:12px; padding:24px; text-align:center;}
    .legend{ font-size:10.5px; color:${C.muted}; display:flex; gap:12px; margin:2px 0 6px; flex-wrap:wrap;}
    .legend i{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:4px; vertical-align:-1px;}
    /* Drill-down-Führung */
    .kpi[data-goto]{ cursor:pointer;}
    .kpi[data-goto]:hover{ filter:brightness(0.97);}
    svg [data-drill]{ cursor:pointer;}
    tr[data-drill]{ cursor:pointer;}
    .crumbs{ display:flex; align-items:center; gap:10px; margin:0 0 8px;}
    .crumbs .back{ font:inherit; font-size:12px; padding:5px 12px; border:1px solid ${C.border};
      border-radius:5px; background:${C.panel}; color:${C.ink}; cursor:pointer;}
    .crumbs .back:hover{ border-color:${C.outlier};}
    .crumbs .path{ font-size:12px; color:${C.muted};}
    .crumbs .path b{ color:${C.ink};}
    .meta{ display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:${C.muted}; margin:0 0 8px;}
    .meta b{ color:${C.ink};}
    .chip{ display:inline-block; padding:2px 8px; border-radius:10px; font-size:10.5px; font-weight:600;}
    .chip.out{ background:${C.outlier}; color:#fff;} .chip.err{ background:${C.error}; color:#fff;}
    .chip.ok{ background:${C.ok}; color:#fff;}
    @media (prefers-reduced-motion: no-preference){ nav button{ transition:color .15s;} }
  </style>
  <div class="root">
    <header>
      <div class="titlebar">
        <div class="title">WE Prozess-Cockpit <small id="sub"></small></div>
        <div class="ctrl">
          <button id="btnTheme" title="Dark-/Light-Mode umschalten">◐</button>
          <button id="btnCfg" title="Kalibrierung">⚙</button>
        </div>
      </div>
      <div class="cfg" id="cfg" hidden>
        <h4>Kalibrierung</h4>
        <label>Ausreißer-Schwelle |z| <output id="outMad">3,5</output></label>
        <input type="range" id="cfgMad" min="2" max="6" step="0.1">
        <div class="hint">kleiner = empfindlicher · wirkt sofort auf alle Ansichten</div>
        <label>Termintreue-Toleranz (Minuten)</label>
        <input type="number" id="cfgTol" min="0" max="240" step="5">
        <label>Baseline-Segmentierung</label>
        <select id="cfgBase">
          <option value="segment">Je Segment (LKW / Container / BSL)</option>
          <option value="global">Global (eine Grenze für alle)</option>
        </select>
        <label>Team Frühschicht in geraden KW</label>
        <input type="text" id="cfgTeamE">
        <label>Team Frühschicht in ungeraden KW</label>
        <input type="text" id="cfgTeamO">
      </div>
      <div class="kpis" id="kpis"></div>
    </header>
    <nav id="tabs"></nav>
    <main id="main"><div class="empty">Keine Daten. Data Binding zuweisen oder Testdaten laden.</div></main>
  </div>`;

  const fmtH = (h) => (h == null || isNaN(h)) ? "–" :
    Math.abs(h) >= 48 ? (h / 24).toFixed(1) + " d" : h.toFixed(1) + " h";
  const fmtP = (p) => isNaN(p) ? "–" : (100 * p).toFixed(1) + " %";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- BW-Row-Zugriff (Konventionen aus dem WE-Tracker) ----------------
   * SAC liefert Dimensionen als { id, label } mit _0-Suffix,
   * Measures als { raw, formatted }.                                     */
  const extractVal = (v) => {
    if (v == null) return null;
    if (typeof v === "object" && "id" in v) return String(v.id).trim();
    return String(v).trim();
  };
  const NULLS = new Set(["", "#", "00000000", "000000000000", "@NullMember", "@TotalMembers", "null", "undefined"]);
  const isNullTok = (v) => v == null || NULLS.has(String(v).trim());
  const readDim = (row, ...keys) => {
    for (const key of keys)
      for (const k of [`${key}_0`, key]) {
        const raw = extractVal(row[k]);
        if (!isNullTok(raw)) return raw;
      }
    return null;
  };
  const readVal = (row, ...keys) => {
    for (const key of keys)
      for (const k of [`${key}_0`, key]) {
        const v = row[k];
        if (v == null) continue;
        const n = typeof v === "object" && "raw" in v ? v.raw : v;
        if (n != null && !isNullTok(String(n))) return Number(n);
      }
    return null;
  };

  /** Feed-IDs (Manifest) -> kanonische Zeilen für die Engine. */
  function ingestRows(rows) {
    return rows.map((row) => ({
      belegnr:          readDim(row, "dimension_te", "dimension_belegnr"),      // TE = Anlieferungsschlüssel
      pos:              readDim(row, "dimension_produkt_nr", "dimension_pos"),
      produkt_name:     readDim(row, "dimension_produkt_name"),
      lieferant:        readDim(row, "dimension_lieferant_name", "dimension_lieferant_nr"),
      frachtfuehrer:    readDim(row, "dimension_frachtfuehrer"),
      transportmittel:  readDim(row, "dimension_transportmittel"),
      ladestelle:       readDim(row, "dimension_ladestelle"),
      halle:            readDim(row, "dimension_halle"),
      tor:              readDim(row, "dimension_tor"),
      hwg:              readDim(row, "dimension_hwg"),
      ts_ankunft:        readDim(row, "dimension_ts_ankunft"),
      ts_angedockt:      readDim(row, "dimension_ts_angedockt"),
      ts_entladen_start: readDim(row, "dimension_ts_entladen_start"),
      ts_entladen_ende:  readDim(row, "dimension_ts_entladen_ende"),
      ts_entladen_tat:   readDim(row, "dimension_ts_entladen_tat"),
      ts_we_pos:         readDim(row, "dimension_ts_we_buchung"),
      ts_we_buchung:     readDim(row, "dimension_ts_we_buchung"),
      ts_einlagerung:    readDim(row, "dimension_ts_einlagerung"),
      ts_abfahrt:        readDim(row, "dimension_ts_abfahrt"),
      ts_geplant_start:  readDim(row, "dimension_geplant_start"),
      ts_geplant_ende:   readDim(row, "dimension_geplant_ende"),
      sh_entl:          readDim(row, "dimension_schicht_entladen"),
      kw_entl:          readDim(row, "dimension_kw_entladen"),
      sh_einl:          readDim(row, "dimension_schicht_einlagerung"),
      kw_einl:          readDim(row, "dimension_kw_einlagerung"),
      menge_ist:        readVal(row, "value_menge_ist", "value_menge"),
      menge_soll:       readVal(row, "value_menge_soll"),
    }));
  }

  class WECockpit extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.innerHTML = TPL;
      this._props = {
        madThreshold: 3.5, teamEvenFrueh: "Team A", teamOddFrueh: "Team B",
        baselineMode: "segment", toleranzMin: 30, theme: "light", defaultView: "hof",
      };
      this._rows = null; this._model = null; this._mode = "hof"; this._detail = null;
      this._applyTheme();
      this._shadow.getElementById("tabs").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        this._mode = b.dataset.id; this._detail = null; this._render();
      });
      // KPI-Kacheln führen zur passenden Ansicht
      this._shadow.getElementById("kpis").addEventListener("click", (e) => {
        const t = e.target.closest(".kpi[data-goto]"); if (!t) return;
        this._mode = t.dataset.goto; this._detail = null; this._render();
      });
      // Drill-down: Klick auf Scatter-Punkte / Zeilen mit data-drill
      this._shadow.getElementById("main").addEventListener("click", (e) => {
        const el = e.target.closest("[data-drill]");
        if (el) this.openDetail(el.dataset.drill);
      });
      /* ---- In-Widget-Steuerung: Theme + Kalibrierung ---- */
      const $ = (id) => this._shadow.getElementById(id);
      $("btnTheme").addEventListener("click", () =>
        this.setTheme(this._props.theme === "dark" ? "light" : "dark"));
      $("btnCfg").addEventListener("click", () => {
        const p = $("cfg");
        p.hidden = !p.hidden;
        $("btnCfg").classList.toggle("on", !p.hidden);
        if (!p.hidden) this._syncCfg();
      });
      // Live-Kalibrierung: Änderungen wirken sofort auf das Modell
      $("cfgMad").addEventListener("input", () => {
        this._props.madThreshold = parseFloat($("cfgMad").value);
        $("outMad").textContent = this._props.madThreshold.toLocaleString("de-DE", { minimumFractionDigits: 1 });
        this._rebuild();
      });
      $("cfgTol").addEventListener("change", () => {
        this._props.toleranzMin = Math.max(0, parseInt($("cfgTol").value, 10) || 0);
        this._rebuild();
      });
      $("cfgBase").addEventListener("change", () => { this._props.baselineMode = $("cfgBase").value; this._rebuild(); });
      $("cfgTeamE").addEventListener("change", () => { this._props.teamEvenFrueh = $("cfgTeamE").value || "Team A"; this._rebuild(); });
      $("cfgTeamO").addEventListener("change", () => { this._props.teamOddFrueh = $("cfgTeamO").value || "Team B"; this._rebuild(); });
      this._syncCfg();
    }

    /* ---- SAC-Lifecycle ---- */
    onCustomWidgetAfterUpdate(changed) {
      Object.assign(this._props, changed || {});
      if (changed && "theme" in changed) this._applyTheme();
      if (changed && "defaultView" in changed && MODES.some((m) => m.id === changed.defaultView))
        this._mode = changed.defaultView;
      this._syncCfg();
      if (changed && changed.myDataSource) { this.myDataSource = changed.myDataSource; return; }
      this._rebuild();
    }
    onCustomWidgetResize() { this._render(); }
    onCustomWidgetDestroy() {}

    /* ---- SAC DataSource-Setter (Konvention wie im WE-Tracker) ---- */
    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;
      if (!dataBinding || dataBinding.state !== "success") return; // laden / kein Binding
      this._rows = ingestRows(dataBinding.data ?? []);
      this._rebuild();
    }

    /* ---- Public API (aufrufbar via SAC-Script) ---- */
    refreshData() { if (this._dataBinding) this.myDataSource = this._dataBinding; }
    setTheme(theme) {
      if (theme === "dark" || theme === "light") { this._props.theme = theme; this._applyTheme(); }
    }
    setView(view) {
      if (MODES.some((m) => m.id === view)) { this._mode = view; this._detail = null; this._render(); }
    }
    /** Drill-down in eine Transporteinheit (auch via SAC-Script aufrufbar). */
    openDetail(te) {
      if (!this._model) return;
      const d = this._model.deliveries.find((x) => x.belegnr === String(te));
      if (!d) return;
      this._detail = String(te);
      this._render();
      this.dispatchEvent(new CustomEvent("onOutlierSelect", { detail: { belegnr: this._detail } }));
    }
    setTestData(rows) {
      if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch { rows = []; } }
      this._rows = rows || [];
      this._rebuild();
    }

    _applyTheme() { this.setAttribute("data-theme", this._props.theme === "dark" ? "dark" : "light"); }

    /** Kalibrierungs-Panel mit aktuellen Properties befüllen. */
    _syncCfg() {
      const $ = (id) => this._shadow.getElementById(id);
      $("cfgMad").value = this._props.madThreshold;
      $("outMad").textContent = Number(this._props.madThreshold).toLocaleString("de-DE", { minimumFractionDigits: 1 });
      $("cfgTol").value = this._props.toleranzMin;
      $("cfgBase").value = this._props.baselineMode;
      $("cfgTeamE").value = this._props.teamEvenFrueh;
      $("cfgTeamO").value = this._props.teamOddFrueh;
    }

    _rebuild() {
      this._model = this._rows && this._rows.length ? WEEngine.buildModel(this._rows, this._props) : null;
      this._render();
    }

    /* =========================== RENDERING =========================== */
    _render() {
      const M = this._model, S = this._shadow;
      S.getElementById("sub").textContent = M
        ? `${M.kpis.nDeliveries} Anlieferungen · ${M.kpis.nPositions} Positionen · Schwelle |z| > ${M.cfg.madThreshold}`
        : "";
      S.getElementById("tabs").innerHTML = MODES.map((m) =>
        `<button data-id="${m.id}" class="${m.id === this._mode ? "on" : ""}">${m.label}</button>`).join("");
      this._renderKpis();
      const main = S.getElementById("main");
      if (!M) { main.innerHTML = `<div class="empty">Keine Daten. Data Binding zuweisen oder Testdaten laden.</div>`; return; }
      main.innerHTML = "";
      if (this._detail) { this._renderDetail(main); return; }
      const mode = MODES.find((m) => m.id === this._mode);
      if (mode.id === "muster") { this._viewMuster(main); return; }
      if (mode.id === "mengen") { this._viewMengen(main); return; }
      this._viewMetric(main, mode);
    }

    _renderKpis() {
      const el = this._shadow.getElementById("kpis"), M = this._model;
      if (!M) { el.innerHTML = ""; return; }
      const k = M.kpis;
      el.innerHTML = `
        <div class="kpi" data-goto="hof" title="Zum Hofprozess"><b>${fmtH(k.medDwell)}</b><span>Ø Standzeit (Median)</span></div>
        <div class="kpi" data-goto="lager" title="Zum Lagerprozess"><b>${fmtH(k.medPutaway)}</b><span>Ø Einlagerung (Median)</span></div>
        <div class="kpi ${k.outDwell > 0.05 ? "warn" : ""}" data-goto="hof" title="Ausreißer im Hofprozess ansehen"><b>${fmtP(k.outDwell)}</b><span>Ausreißer Hof</span></div>
        <div class="kpi ${k.outPutaway > 0.05 ? "warn" : ""}" data-goto="lager" title="Ausreißer im Lagerprozess ansehen"><b>${fmtP(k.outPutaway)}</b><span>Ausreißer Lager</span></div>
        <div class="kpi ${k.onTime >= 0.9 ? "ok" : ""}" data-goto="termin" title="Zur Termintreue"><b>${fmtP(k.onTime)}</b><span>Termintreue (+${k.tolMin} min)</span></div>
        <div class="kpi ${k.nErrors ? "err" : ""}" data-goto="muster" title="Datenfehler ansehen"><b>${k.nErrors}</b><span>Datenfehler</span></div>`;
    }

    /* ---- gemeinsame Metrik-Ansicht (Hof / Lager / Termin) ---- */
    _viewMetric(main, mode) {
      const M = this._model;
      const recs = mode.level === "delivery" ? M.deliveries : M.positions;
      const metric = mode.metric;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="legend">
          <span><i style="background:${C.lkw}"></i>LKW</span>
          <span><i style="background:${C.container}"></i>Container</span>
          <span><i style="background:${C.outlier}"></i>Ausreißer</span>
          <span style="color:${C.outlier}">→ Punkt oder Tabellenzeile anklicken für TE-Details</span>
          <span style="margin-left:auto">${esc(mode.desc)}</span>
        </div>
        <div class="row">
          ${mode.phases.length ? `<div class="card"><h3>Phasenband – wo steckt die Zeit? (Median je Segment)</h3><div id="ribbon"></div></div>` : ""}
          <div class="card" style="flex:2 1 460px"><h3>${esc(PHASES[metric] ? PHASES[metric].label : mode.label)} über Zeit · MAD-Grenze je Segment</h3><div id="scatter"></div></div>
        </div>
        <div class="card"><h3>Auffällige ${mode.level === "delivery" ? "Anlieferungen" : "Positionen"} (Top nach z-Score)</h3><div id="tbl"></div></div>`;
      main.appendChild(wrap);
      if (mode.phases.length) this._svgRibbon(wrap.querySelector("#ribbon"), recs, mode.phases);
      this._svgScatter(wrap.querySelector("#scatter"), recs, metric, mode);
      this._tblOutliers(wrap.querySelector("#tbl"), recs, metric, mode);
    }

    /* ---- Signature-Element: Phasenband ---- */
    _svgRibbon(el, recs, phaseKeys) {
      const segs = ["LKW", "Container", "Sonstige"].filter((s) => recs.some((r) => r.segment === s));
      const rows = segs.map((seg) => {
        const meds = phaseKeys.map((k) => {
          const vals = recs.filter((r) => r.segment === seg).map((r) => r.phases[k]).filter((v) => v != null);
          return { k, med: WEEngine.median(vals) };
        });
        return { seg, meds, total: meds.reduce((a, b) => a + (b.med || 0), 0) };
      });
      const maxT = Math.max(...rows.map((r) => r.total), 0.1);
      const W = 420, rowH = 34, H0 = rows.length * rowH + 22;
      const shade = [1, 0.72, 0.45];
      let svg = `<svg viewBox="0 0 ${W} ${H0}" width="100%" role="img" aria-label="Phasenband">`;
      rows.forEach((r, ri) => {
        const y = ri * rowH + 4; let x = 78;
        svg += `<text x="0" y="${y + 15}" font-size="11" fill="${C.ink}" font-weight="600">${esc(r.seg)}</text>`;
        r.meds.forEach((m, i) => {
          if (m.med == null || isNaN(m.med)) return;
          const w = Math.max(2, (m.med / maxT) * (W - 160));
          const col = SEGC[r.seg] || C.sonst;
          svg += `<rect x="${x}" y="${y}" width="${w}" height="20" rx="2" fill="${col}" opacity="${shade[i % 3]}">
                    <title>${PHASES[m.k].label}: ${fmtH(m.med)} (Median)</title></rect>`;
          if (w > 34) svg += `<text x="${x + 4}" y="${y + 14}" font-size="9.5" fill="#fff">${fmtH(m.med)}</text>`;
          x += w + 2;
        });
        svg += `<text x="${x + 4}" y="${y + 14}" font-size="10" fill="${C.muted}">${fmtH(r.total)}</text>`;
      });
      const lg = phaseKeys.map((k, i) =>
        `<tspan dx="${i ? 14 : 0}" opacity="${shade[i % 3]}">▮</tspan><tspan dx="3" fill="${C.muted}"> ${PHASES[k].label}</tspan>`).join("");
      svg += `<text x="78" y="${H0 - 4}" font-size="9.5" fill="${C.ink}">${lg}</text></svg>`;
      el.innerHTML = svg;
    }

    /* ---- Scatter mit MAD-Grenzband ---- */
    _svgScatter(el, recs, metric, mode) {
      const pts = recs.filter((r) => r.phases[metric] != null && r["ts_" + (metric === "delay" ? "ankunft" : metric === "putaway" || metric === "booking" ? "we_pos" : "ankunft")]);
      const tsField = metric === "putaway" || metric === "booking" ? "ts_we_pos" : "ts_ankunft";
      if (!pts.length) { el.innerHTML = `<div class="empty">Keine Werte für diese Metrik.</div>`; return; }
      const xs = pts.map((p) => +p[tsField]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
      const vals = pts.map((p) => p.phases[metric]);
      const yMaxData = quantileArr(vals, 0.99), yMin = Math.min(0, quantileArr(vals, 0.01));
      const yMax = yMaxData <= yMin ? yMin + 1 : yMaxData;
      const W = 640, Hh = 220, padL = 44, padB = 20, padT = 8;
      const X = (t) => padL + ((t - x0) / (x1 - x0)) * (W - padL - 8);
      const Y = (v) => padT + (1 - (Math.min(v, yMax) - yMin) / (yMax - yMin)) * (Hh - padT - padB);
      let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Streudiagramm">`;
      // y-Gitter
      for (let i = 0; i <= 4; i++) {
        const v = yMin + (i / 4) * (yMax - yMin), y = Y(v);
        svg += `<line x1="${padL}" x2="${W - 8}" y1="${y}" y2="${y}" stroke="${C.border}"/>
                <text x="${padL - 6}" y="${y + 3}" font-size="9" fill="${C.muted}" text-anchor="end">${fmtH(v)}</text>`;
      }
      // MAD-Grenzlinien je Segment (limitH/medH liegen im Originalraum)
      const B = this._model.baselines[metric] || {};
      for (const [seg, b] of Object.entries(B)) {
        const col = SEGC[seg] || C.sonst;
        if (b.limitH <= yMax)
          svg += `<line x1="${padL}" x2="${W - 8}" y1="${Y(b.limitH)}" y2="${Y(b.limitH)}" stroke="${col}" stroke-dasharray="4 3" opacity=".8">
                    <title>Ausreißergrenze ${seg}: ${fmtH(b.limitH)} (Median ${fmtH(b.medH)}, |z| > ${this._model.cfg.madThreshold}${b.log ? ", log-MAD" : ""})</title></line>`;
        if (b.medH <= yMax)
          svg += `<line x1="${padL}" x2="${W - 8}" y1="${Y(b.medH)}" y2="${Y(b.medH)}" stroke="${col}" opacity=".35"/>`;
      }
      if (metric === "delay") svg += `<line x1="${padL}" x2="${W - 8}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" opacity=".4"/>`;
      // Punkte (klickbar -> TE-Detail)
      for (const p of pts) {
        const out = p.outlier[metric];
        const col = out ? C.outlier : (SEGC[p.segment] || C.sonst);
        const v = p.phases[metric];
        svg += `<circle data-drill="${esc(p.belegnr)}" cx="${X(+p[tsField])}" cy="${Y(v)}" r="${out ? 3.4 : 2.2}" fill="${col}" opacity="${out ? 0.95 : 0.5}">
          <title>${esc(p.belegnr)}${p.pos ? "/" + esc(p.pos) : ""} · ${esc(p.lieferant || "")}\n${fmtH(v)} (z=${p.z[metric] == null ? "–" : p.z[metric].toFixed(1)}) · ${p.segment}\nKlicken für Details</title></circle>`;
      }
      // x-Achse: Monatsmarken
      const d0 = new Date(x0); d0.setDate(1);
      for (let d = new Date(d0); +d <= x1; d.setMonth(d.getMonth() + 1)) {
        if (+d < x0) continue;
        svg += `<text x="${X(+d)}" y="${Hh - 5}" font-size="9" fill="${C.muted}">${d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</text>`;
      }
      if (yMaxData < Math.max(...vals))
        svg += `<text x="${W - 8}" y="${padT + 8}" font-size="8.5" fill="${C.muted}" text-anchor="end">▲ gekappt bei P99, Extremwerte in Tabelle</text>`;
      el.innerHTML = svg + "</svg>";
    }

    /* ---- Ausreißer-Tabelle ---- */
    _tblOutliers(el, recs, metric, mode) {
      const outs = recs.filter((r) => r.outlier[metric])
        .sort((a, b) => Math.abs(b.z[metric]) - Math.abs(a.z[metric])).slice(0, 12);
      if (!outs.length) { el.innerHTML = `<div class="empty">Keine Ausreißer über der Schwelle – Prozess im Rahmen.</div>`; return; }
      const rows = outs.map((r, i) => {
        const d = r.ts_ankunft || r.ts_we_pos;
        const phasesCells = mode.phases.map((k) =>
          `<td>${r.phases[k] != null ? fmtH(r.phases[k]) : "–"}</td>`).join("");
        return `<tr data-drill="${esc(r.belegnr)}" title="Klicken für TE-Details">
          <td>${esc(r.belegnr)}${r.pos ? "/" + esc(r.pos) : ""}</td>
          <td>${d ? d.toLocaleDateString("de-DE") : "–"}</td>
          <td>${esc((r.lieferant || "").slice(0, 22))}</td>
          <td><span class="tag" style="background:${SEGC[r.segment] || C.sonst}">${r.segment}</span></td>
          <td><b>${fmtH(r.phases[metric])}</b></td>
          <td style="color:${C.outlier}">${r.z[metric].toFixed(1)}</td>
          ${phasesCells}</tr>`;
      }).join("");
      el.innerHTML = `<table><thead><tr>
        <th>Beleg/Pos</th><th>Datum</th><th>Lieferant</th><th>Segment</th>
        <th>${esc(PHASES[metric].label)}</th><th>z</th>
        ${mode.phases.map((k) => `<th>${PHASES[k].label}</th>`).join("")}
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    /* ---- TE-Detailansicht (Drill-down) ---- */
    _renderDetail(main) {
      const M = this._model;
      const d = M.deliveries.find((x) => x.belegnr === this._detail);
      const pos = M.positions.filter((p) => p.belegnr === this._detail);
      if (!d) { main.innerHTML = `<div class="empty">TE ${esc(this._detail)} nicht gefunden.</div>`; return; }
      const modeLabel = (MODES.find((m) => m.id === this._mode) || MODES[0]).label;

      // Status-Chips: was ist an dieser TE auffällig?
      const chips = [];
      for (const k of ["dwell", "wait_gate", "unload", "delay"])
        if (d.outlier && d.outlier[k]) chips.push(`<span class="chip out">Ausreißer ${PHASES[k].label}</span>`);
      if (pos.some((p) => p.outlier && p.outlier.putaway)) chips.push(`<span class="chip out">Ausreißer Einlagerung</span>`);
      if (pos.some((p) => p.outlier && p.outlier.qty)) chips.push(`<span class="chip out">Mengenabweichung</span>`);
      if (d.hasError || pos.some((p) => p.hasError)) chips.push(`<span class="chip err">Datenfehler</span>`);
      if (!chips.length) chips.push(`<span class="chip ok">Prozess im Rahmen</span>`);

      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="crumbs">
          <button class="back" id="back">← Zurück</button>
          <span class="path">${esc(modeLabel)} › <b>TE ${esc(d.belegnr)}</b></span>
          <span style="margin-left:auto">${chips.join(" ")}</span>
        </div>
        <div class="meta">
          <span>Lieferant: <b>${esc(d.lieferant || "–")}</b></span>
          <span><span class="tag" style="background:${SEGC[d.segment] || C.sonst}">${esc(d.segment)}</span></span>
          <span>Ankunft: <b>${d.ts_ankunft ? d.ts_ankunft.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–"}</b></span>
          <span>Positionen: <b>${d.nPos}</b></span>
          ${d.sh_entl ? `<span>Schicht Entladen: <b>${d.sh_entl === "F" ? "Früh" : "Spät"}${d.kw_entl ? " · KW " + d.kw_entl.kw : ""}${d.team_entl ? " · " + esc(d.team_entl) : ""}</b></span>` : ""}
          <span>Termintreue: <b>${d.phases.delay == null ? "–" : d.phases.delay <= 0 ? "pünktlich" : "+" + fmtH(d.phases.delay)}</b></span>
        </div>
        <div class="card"><h3>Prozess-Zeitstrahl</h3><div id="tl"></div></div>
        <div class="row">
          <div class="card"><h3>Phasen vs. Median ${esc(d.segment)}</h3><div id="cmp"></div></div>
          <div class="card" style="flex:2 1 420px"><h3>Produkte dieser TE</h3><div id="ptbl"></div></div>
        </div>`;
      main.appendChild(wrap);
      wrap.querySelector("#back").addEventListener("click", () => { this._detail = null; this._render(); });
      this._svgTimeline(wrap.querySelector("#tl"), d, pos);
      this._svgPhaseCompare(wrap.querySelector("#cmp"), d, M.phaseMed);
      this._tblProducts(wrap.querySelector("#ptbl"), pos, M.phaseMed);
    }

    _svgTimeline(el, d, pos) {
      const events = [
        ["Ankunft", d.ts_ankunft], ["Angedockt", d.ts_angedockt],
        ["Entladen Start", d.ts_entladen_start], ["Entladen Ende", d.ts_entladen_ende_eff],
        ["Abfahrt", d.ts_abfahrt],
      ].filter((e) => e[1]);
      const einl = pos.map((p) => p.ts_einlagerung).filter(Boolean);
      const weB = pos.map((p) => p.ts_we_pos).filter(Boolean);
      const all = [...events.map((e) => e[1]), ...einl, ...weB];
      if (all.length < 2) { el.innerHTML = `<div class="empty">Zu wenige Zeitstempel für einen Zeitstrahl.</div>`; return; }
      const t0 = Math.min(...all.map(Number)), t1 = Math.max(...all.map(Number));
      const W = 660, Hh = 96, padL = 14, padR = 14, yL = 52;
      const X = (t) => padL + ((+t - t0) / (t1 - t0 || 1)) * (W - padL - padR);
      const col = SEGC[d.segment] || C.sonst;
      let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Zeitstrahl TE ${esc(d.belegnr)}">`;
      // Phasenbänder auf der Linie (gleiche Abstufung wie im Phasenband)
      const bands = [
        [d.ts_ankunft, d.ts_angedockt, 1, "Wartezeit Tor"],
        [d.ts_angedockt, d.ts_entladen_start, 0.72, "Reaktionszeit"],
        [d.ts_entladen_start, d.ts_entladen_ende_eff, 0.45, "Entladedauer"],
      ];
      for (const [a, b, op, lbl] of bands)
        if (a && b && b > a)
          svg += `<rect x="${X(a)}" y="${yL - 5}" width="${Math.max(2, X(b) - X(a))}" height="10" rx="2" fill="${col}" opacity="${op}"><title>${lbl}: ${fmtH((b - a) / 36e5)}</title></rect>`;
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${yL}" y2="${yL}" stroke="${C.border}"/>`;
      // Haupt-Ereignisse, Beschriftung abwechselnd oben/unten
      events.forEach(([lbl, t], i) => {
        const x = X(t), up = i % 2 === 0;
        svg += `<circle cx="${x}" cy="${yL}" r="4" fill="${col}"/>
          <line x1="${x}" x2="${x}" y1="${yL}" y2="${up ? yL - 16 : yL + 16}" stroke="${C.muted}" stroke-width="0.7"/>
          <text x="${x}" y="${up ? yL - 21 : yL + 27}" font-size="9.5" fill="${C.ink}" text-anchor="middle">${lbl}</text>
          <text x="${x}" y="${up ? yL - 31 : yL + 37}" font-size="9" fill="${C.muted}" text-anchor="middle">${t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</text>`;
      });
      // WE-Buchung (Raute) und Einlagerungen (Dreiecke) der Produkte
      for (const t of weB)
        svg += `<rect x="${X(t) - 3}" y="${yL - 3}" width="6" height="6" transform="rotate(45 ${X(t)} ${yL})" fill="${C.error}"><title>WE gebucht: ${t.toLocaleString("de-DE")}</title></rect>`;
      for (const t of einl)
        svg += `<path d="M ${X(t) - 4} ${yL + 9} L ${X(t) + 4} ${yL + 9} L ${X(t)} ${yL + 2} Z" fill="${C.container}"><title>Einlagerung: ${t.toLocaleString("de-DE")}</title></path>`;
      // Spanne über mehrere Tage kennzeichnen
      const days = (t1 - t0) / 864e5;
      if (days > 1) svg += `<text x="${W - padR}" y="12" font-size="9" fill="${C.outlier}" text-anchor="end">Spanne: ${days.toFixed(1)} Tage</text>`;
      el.innerHTML = svg + `</svg>
        <div class="legend"><span><i style="background:${C.error}"></i>WE-Buchung</span>
        <span><i style="background:${C.container}"></i>Einlagerung (je Produkt)</span></div>`;
    }

    _svgPhaseCompare(el, d, phaseMed) {
      const keys = ["wait_gate", "reaction", "unload", "dwell"];
      const rows = keys.map((k) => ({
        k, label: PHASES[k].label,
        val: d.phases[k], med: (phaseMed[k] || {})[d.segment],
        out: d.outlier && d.outlier[k],
      })).filter((r) => r.val != null || r.med != null);
      if (!rows.length) { el.innerHTML = `<div class="empty">Keine Phasendaten.</div>`; return; }
      const maxV = Math.max(...rows.flatMap((r) => [r.val || 0, r.med || 0]), 0.1);
      const W = 340, rh = 34;
      let svg = `<svg viewBox="0 0 ${W} ${rows.length * rh + 4}" width="100%">`;
      rows.forEach((r, i) => {
        const y = i * rh;
        const bw = (v) => Math.max(2, (v / maxV) * (W - 150));
        svg += `<text x="0" y="${y + 12}" font-size="10" fill="${C.ink}">${r.label}</text>`;
        if (r.val != null)
          svg += `<rect x="96" y="${y + 3}" width="${bw(r.val)}" height="9" rx="2" fill="${r.out ? C.outlier : (SEGC[d.segment] || C.sonst)}"><title>Diese TE: ${fmtH(r.val)}</title></rect>
                  <text x="${100 + bw(r.val)}" y="${y + 11}" font-size="9" fill="${r.out ? C.outlier : C.ink}">${fmtH(r.val)}${r.out ? " ⚠" : ""}</text>`;
        else svg += `<text x="96" y="${y + 11}" font-size="9" fill="${C.muted}">–</text>`;
        if (r.med != null)
          svg += `<rect x="96" y="${y + 15}" width="${bw(r.med)}" height="5" rx="2" fill="${C.muted}" opacity=".55"><title>Median ${d.segment}: ${fmtH(r.med)}</title></rect>
                  <text x="${100 + bw(r.med)}" y="${y + 21}" font-size="8.5" fill="${C.muted}">Median ${fmtH(r.med)}</text>`;
      });
      el.innerHTML = svg + "</svg>";
    }

    _tblProducts(el, pos, phaseMed) {
      if (!pos.length) { el.innerHTML = `<div class="empty">Keine Positionen.</div>`; return; }
      const rows = pos.map((p) => {
        const put = p.phases && p.phases.putaway;
        const out = p.outlier && p.outlier.putaway;
        const qty = p.outlier && p.outlier.qty;
        return `<tr>
          <td>${esc(p.pos || "–")}</td>
          <td>${esc((p.produkt_name || p.hwg || "–")).slice(0, 28)}</td>
          <td>${p.menge_soll ?? "–"}</td>
          <td style="${qty ? "color:" + C.outlier : ""}">${p.menge_ist ?? "–"}${qty ? " ⚠" : ""}</td>
          <td>${p.ts_einlagerung ? p.ts_einlagerung.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–"}</td>
          <td style="${out ? "color:" + C.outlier + ";font-weight:600" : ""}">${put != null ? fmtH(put) : "–"}${out ? " ⚠" : ""}</td>
          <td>${p.z && p.z.putaway != null ? p.z.putaway.toFixed(1) : "–"}</td></tr>`;
      }).join("");
      el.innerHTML = `<table><thead><tr>
        <th>Produkt</th><th>Bezeichnung</th><th>SOLL</th><th>IST</th>
        <th>Einlagerung</th><th>WE→Einlag.</th><th>z</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
    }

    /* ---- Mengen-Ansicht ---- */
    _viewMengen(main) {
      const M = this._model;
      const pts = M.positions.filter((p) => p.qty_dev_pct != null);
      const devs = pts.filter((p) => p.qty_dev !== 0).sort((a, b) => Math.abs(b.qty_dev_pct) - Math.abs(a.qty_dev_pct));
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="legend"><span><i style="background:${C.ok}"></i>mengentreu</span>
          <span><i style="background:${C.outlier}"></i>Abweichung</span>
          <span style="margin-left:auto">Mengentreue: <b>${fmtP(M.kpis.qtyOkRate)}</b> von ${pts.length} Positionen</span></div>
        <div class="row"><div class="card" style="flex:2 1 460px"><h3>Mengenabweichung IST vs. SOLL (%)</h3><div id="qsc"></div></div></div>
        <div class="card"><h3>Größte Abweichungen</h3><div id="qtbl"></div></div>`;
      main.appendChild(wrap);
      // Scatter: Abweichung% über Zeit
      const el = wrap.querySelector("#qsc");
      const tp = pts.filter((p) => p.ts_we_pos);
      if (tp.length) {
        const xs = tp.map((p) => +p.ts_we_pos), x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
        const lim = Math.max(10, Math.min(100, quantileArr(tp.map((p) => Math.abs(p.qty_dev_pct)), 0.98)));
        const W = 640, Hh = 190, padL = 40;
        const X = (t) => padL + ((t - x0) / (x1 - x0)) * (W - padL - 8);
        const Y = (v) => 10 + (1 - (Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim)) * (Hh - 30);
        let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="100%">`;
        [[lim, "+" + lim.toFixed(0) + "%"], [0, "0"], [-lim, "−" + lim.toFixed(0) + "%"]].forEach(([v, t]) => {
          svg += `<line x1="${padL}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.border}"/>
                  <text x="${padL - 5}" y="${Y(v) + 3}" font-size="9" fill="${C.muted}" text-anchor="end">${t}</text>`;
        });
        for (const p of tp) {
          const bad = p.qty_dev !== 0;
          svg += `<circle data-drill="${esc(p.belegnr)}" cx="${X(+p.ts_we_pos)}" cy="${Y(p.qty_dev_pct)}" r="${bad ? 3 : 1.8}"
            fill="${bad ? C.outlier : C.ok}" opacity="${bad ? .9 : .35}">
            <title>${esc(p.belegnr)}/${esc(p.pos)} · ${esc(p.lieferant || "")}\nSOLL ${p.menge_soll} · IST ${p.menge_ist} (${p.qty_dev_pct.toFixed(1)}%)</title></circle>`;
        }
        el.innerHTML = svg + "</svg>";
      } else el.innerHTML = `<div class="empty">Keine Mengen-/Zeitdaten.</div>`;
      wrap.querySelector("#qtbl").innerHTML = devs.length ? `<table><thead><tr>
          <th>Beleg/Pos</th><th>Lieferant</th><th>SOLL</th><th>IST</th><th>Δ</th><th>Δ %</th></tr></thead><tbody>${
        devs.slice(0, 12).map((p) => `<tr data-drill="${esc(p.belegnr)}" title="Klicken für TE-Details"><td>${esc(p.belegnr)}/${esc(p.pos)}</td>
          <td>${esc((p.lieferant || "").slice(0, 24))}</td><td>${p.menge_soll}</td><td>${p.menge_ist}</td>
          <td style="color:${C.outlier}">${p.qty_dev > 0 ? "+" : ""}${p.qty_dev}</td>
          <td style="color:${C.outlier}">${p.qty_dev_pct.toFixed(1)} %</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty">Alle Positionen mengentreu.</div>`;
    }

    /* ---- Muster & Schicht ---- */
    _viewMuster(main) {
      const M = this._model;
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="row">
          <div class="card"><h3>Anlieferungen · Wochentag × Stunde</h3><div id="heat"></div></div>
          <div class="card"><h3>Team-Vergleich (rotationsbereinigt) · Median</h3><div id="teams"></div></div>
        </div>
        <div class="card"><h3>Datenfehler (negative Phasendauern u. ä.)</h3><div id="errs"></div></div>`;
      main.appendChild(wrap);
      // Heatmap
      const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      const max = Math.max(...M.heat.flat(), 1);
      const cw = 21, ch = 20, W = 24 * cw + 36, Hh = 7 * ch + 22;
      let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="100%">`;
      for (let d = 0; d < 7; d++) {
        svg += `<text x="0" y="${d * ch + 14}" font-size="10" fill="${C.muted}">${days[d]}</text>`;
        for (let h = 0; h < 24; h++) {
          const v = M.heat[d][h], a = v / max;
          svg += `<rect x="${36 + h * cw}" y="${d * ch + 2}" width="${cw - 2}" height="${ch - 3}" rx="2"
            fill="${C.lkw}" opacity="${v ? 0.12 + 0.85 * a : 0.04}"><title>${days[d]} ${h}:00 – ${v} Ankünfte</title></rect>`;
        }
      }
      for (let h = 0; h < 24; h += 4)
        svg += `<text x="${36 + h * cw}" y="${Hh - 4}" font-size="9" fill="${C.muted}">${h}h</text>`;
      wrap.querySelector("#heat").innerHTML = svg + "</svg>";
      // Teams
      wrap.querySelector("#teams").innerHTML = this._teamsSvg(M.teams);
      // Fehlerliste
      const errs = M.dataErrors.slice(0, 10);
      wrap.querySelector("#errs").innerHTML = errs.length ? `<table><thead><tr>
        <th>Ebene</th><th>Beleg/Pos</th><th>Phase</th><th>Wert</th></tr></thead><tbody>${
        errs.map((e) => `<tr data-drill="${esc(e.rec.belegnr)}" title="Klicken für TE-Details"><td>${e.ctx}</td><td>${esc(e.key)}</td><td>${e.phase}</td>
        <td style="color:${C.error}">${fmtH(e.hours)}</td></tr>`).join("")}</tbody></table>
        ${M.dataErrors.length > 10 ? `<div class="legend">… ${M.dataErrors.length - 10} weitere</div>` : ""}`
        : `<div class="empty">Keine Datenfehler erkannt.</div>`;
    }

    _teamsSvg(teams) {
      const blocks = [["unload", "Entladedauer (Hof)"], ["putaway", "Einlagerung (Lager)"]];
      const names = [...new Set(blocks.flatMap(([k]) => Object.keys(teams[k] || {})))].sort();
      if (!names.length) return `<div class="empty">Keine Schicht-/KW-Daten im Feed (Z.Sh./Z.KW-Spalten anbinden).</div>`;
      const W = 420, bh = 16, gap = 44;
      let y = 12, svg = "";
      for (const [key, label] of blocks) {
        const t = teams[key] || {};
        const maxV = Math.max(...names.flatMap((n) => ["Früh", "Spät"].map((l) => t[n]?.[l]?.med || 0)), 0.1);
        svg += `<text x="0" y="${y}" font-size="10.5" fill="${C.muted}" font-weight="600">${label}</text>`;
        y += 8;
        for (const n of names) {
          svg += `<text x="0" y="${y + 12}" font-size="10.5" fill="${C.ink}">${esc(n)}</text>`;
          ["Früh", "Spät"].forEach((lage, i) => {
            const s = t[n]?.[lage];
            const w = s ? Math.max(2, (s.med / maxV) * (W - 190)) : 0;
            const yy = y + i * (bh + 2);
            svg += `<text x="66" y="${yy + 12}" font-size="9" fill="${C.muted}">${lage}</text>`;
            if (s) svg += `<rect x="96" y="${yy + 2}" width="${w}" height="${bh - 4}" rx="2"
              fill="${i ? C.container : C.lkw}"><title>${esc(n)} · ${lage}-Wochen: ${fmtH(s.med)} (n=${s.n})</title></rect>
              <text x="${100 + w}" y="${yy + 12}" font-size="9" fill="${C.muted}">${fmtH(s.med)} · n=${s.n}</text>`;
            else svg += `<text x="96" y="${yy + 12}" font-size="9" fill="${C.muted}">–</text>`;
          });
          y += 2 * (bh + 2) + 6;
        }
        y += gap - 30;
      }
      return `<svg viewBox="0 0 ${W} ${y}" width="100%">${svg}</svg>`;
    }
  }

  function quantileArr(a, q) {
    const s = [...a].sort((x, y) => x - y);
    const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return s[lo] + (s[hi] - s[lo]) * (p - lo);
  }

  customElements.define("we-cockpit", WECockpit);
})();
