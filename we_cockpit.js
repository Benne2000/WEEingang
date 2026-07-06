/* =========================================================================
 * WE-Prozess-Cockpit – SAC Custom Widget (v0.8.3) · Entwickler: Benne
 * Dark Mode als Standard.
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
    // Nur F/S sind gültige Schichtlagen; unbekannte Codes (z. B. "N")
    // dürfen NICHT stillschweigend als Spätschicht gewertet werden.
    if ((sh !== "F" && sh !== "S") || !kwObj) return null;
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
      // Fallback: Wenn nur der TE-weite WE-Buchungszeitpunkt gebunden ist
      // (altes Feed dimension_ts_we_buchung), diesen für die Positionsebene nutzen.
      if (!r.ts_we_pos && r.ts_we_buchung) r.ts_we_pos = r.ts_we_buchung;
      // Zeitfenster (geplant_start/ende) hat Vorrang vor Einzeltermin
      if (!r.ts_geplant && r.ts_geplant_ende) r.ts_geplant = r.ts_geplant_ende;
      r.segment = segmentOf(r.ladestelle, r.transportmittel);
      // Alle 7 Schicht/KW-Paare aus dem Export parsen
      r.kw_ankunft = parseKw(r.kw_ankunft); r.kw_andocken = parseKw(r.kw_andocken);
      r.kw_entl_start = parseKw(r.kw_entl_start); r.kw_entl_tat = parseKw(r.kw_entl_tat);
      r.kw_entl = parseKw(r.kw_entl); r.kw_we = parseKw(r.kw_we); r.kw_einl = parseKw(r.kw_einl);
      // Team je Phase = Team, dessen Schicht bei ENDE der Phase lief (Konvention wie zuvor).
      // sh_ankunft/kw_ankunft hat keine Phase, die dort endet -> kein team_*, bleibt nur als
      // Ankunfts-Schicht für Volumen-Auswertungen (z.B. "Anlieferungen je Schicht") erhalten.
      r.team_wait     = teamOf(r.sh_andocken, r.kw_andocken, cfg);       // Wartezeit Tor endet bei Andocken
      r.team_reaction = teamOf(r.sh_entl_start, r.kw_entl_start, cfg);  // Reaktionszeit endet bei Entladen-Start
      r.team_unload   = teamOf(r.sh_entl_tat || r.sh_entl, r.kw_entl_tat || r.kw_entl, cfg); // Entladedauer: tats. Ende bevorzugt
      r.sh_unload_eff = r.sh_entl_tat || r.sh_entl; // gleiche Präferenz für Schichtlage-Einordnung in teamStats
      r.team_booking  = teamOf(r.sh_we, r.kw_we, cfg);                  // Buchungsverzug ~ Schicht bei WE gebucht
      r.team_entl     = teamOf(r.sh_entl, r.kw_entl, cfg);              // (Kompatibilität: bisheriges Feld)
      r.team_putaway  = teamOf(r.sh_einl, r.kw_einl, cfg);
      r.team_einl     = r.team_putaway;                                  // (Kompatibilität: bisheriges Feld)
      r.menge_ist = num(r.menge_ist); r.menge_soll = num(r.menge_soll);
      r.pa1 = num(r.pa1);
      r.paletten = (r.menge_ist != null && r.pa1 > 0) ? r.menge_ist / r.pa1 : null;
      // Business-geflaggte Sonderfälle (keine statistischen Ausreißer, sondern im SAP markiert)
      r.isDiffLieferung = !isNull(r.processcode);
      r.isKritArt = !isNull(r.kategorie_krit_art) || !isNull(r.freitext_krit_art);
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
          lagernummer: p.lagernummer, land: p.land, hwg: p.hwg,
          ts_ankunft: p.ts_ankunft, ts_angedockt: p.ts_angedockt,
          ts_entladen_start: p.ts_entladen_start, ts_entladen_ende_eff: p.ts_entladen_ende_eff,
          ts_abfahrt: p.ts_abfahrt, ts_geplant: p.ts_geplant,
          ts_geplant_start: p.ts_geplant_start, ts_geplant_ende: p.ts_geplant_ende,
          sh_ankunft: p.sh_ankunft, kw_ankunft: p.kw_ankunft,
          te_intern: p.te_intern, te_extern: p.te_extern,
          ts_ist_start: p.ts_ist_start, ts_ist_ende: p.ts_ist_ende,
          team_wait: p.team_wait, team_reaction: p.team_reaction, team_unload: p.team_unload,
          sh_andocken: p.sh_andocken, sh_entl_start: p.sh_entl_start, sh_unload_eff: p.sh_unload_eff,
          team_entl: p.team_entl, sh_entl: p.sh_entl, kw_entl: p.kw_entl,
          isDiffLieferung: p.isDiffLieferung, isKritArt: p.isKritArt,
          nPos: 0,
        });
      }
      const d = dmap.get(key);
      d.nPos++;
      d.isDiffLieferung = d.isDiffLieferung || p.isDiffLieferung;
      d.isKritArt = d.isKritArt || p.isKritArt;
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

    /* --- Team-Vergleich (rotationsbereinigt), alle 5 passenden Phasen ---
     * Zuordnung: Phase -> Team/Schicht, in der die Phase ENDET.
     * sh_ankunft hat keine eigene Phase (nichts endet bei Ankunft) und
     * fließt stattdessen separat als Anlieferungs-Volumen je Schicht ein. */
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
      wait_gate: teamStats(deliveries, "wait_gate", "team_wait", "sh_andocken"),
      reaction:  teamStats(deliveries, "reaction", "team_reaction", "sh_entl_start"),
      unload:    teamStats(deliveries, "unload", "team_unload", "sh_unload_eff"),
      booking:   teamStats(positions, "booking", "team_booking", "sh_we"),
      putaway:   teamStats(positions, "putaway", "team_putaway", "sh_einl"),
    };
    // Anlieferungs-Volumen je Schicht (nutzt sh_ankunft, das sonst ungenutzt bliebe)
    const arrivalsByShift = { Früh: 0, Spät: 0 };
    for (const d of deliveries) if (d.sh_ankunft === "F") arrivalsByShift["Früh"]++;
      else if (d.sh_ankunft === "S") arrivalsByShift["Spät"]++;

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

    /* --- Treiber-Dimensionen: welche Lagernummer/Land/HWG/Lieferant hat --
     * die meisten Ausreißer je Metrik? Ergänzt die bisherige reine
     * Lieferanten-Sicht um weitere Stammdaten-Dimensionen.               */
    function driverRanking(recs, metricKey, dimField) {
      const groups = new Map();
      for (const r of recs) {
        if (r.phases[metricKey] == null) continue;
        const val = r[dimField];
        if (val == null || val === "") continue;
        const g = groups.get(val) || { val, n: 0, outN: 0 };
        g.n++;
        if (r.outlier[metricKey]) g.outN++;
        groups.set(val, g);
      }
      return [...groups.values()]
        .filter((g) => g.n >= 3)
        .map((g) => ({ ...g, outRate: g.outN / g.n }))
        .sort((a, b) => b.outN - a.outN || b.outRate - a.outRate)
        .slice(0, 8);
    }
    const driverDims = { lieferant: "lieferant", lagernummer: "lagernummer", land: "land", hwg: "hwg" };
    const drivers = {};
    for (const [metricKey, def] of Object.entries(metricDefs)) {
      if (metricKey === "delay") continue; // zweiseitig, hier weniger aussagekräftig
      const recs = def.level === "delivery" ? deliveries : positions;
      drivers[metricKey] = {};
      for (const [outKey, field] of Object.entries(driverDims))
        drivers[metricKey][outKey] = driverRanking(recs, metricKey, field);
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
      nDiffLieferung: deliveries.filter((d) => d.isDiffLieferung).length,
      nKritArt: positions.filter((p) => p.isKritArt).length,
    };

    /* --- Perioden-Aggregation für Trends (Sparklines, Δ ggü. Vorperiode) -
     * Granularität automatisch: Spanne ≤ 21 Tage -> Tag, sonst KW.        */
    const ankTimes = deliveries.map((d) => d.ts_ankunft).filter(Boolean).map(Number);
    const spanDays = ankTimes.length ? (Math.max(...ankTimes) - Math.min(...ankTimes)) / 864e5 : 0;
    const gran = spanDays <= 21 ? "day" : "week";
    const periodKey = (dt) => {
      if (!dt) return null;
      if (gran === "day") return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      // ISO-Woche
      const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
      const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
      const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const wk = Math.ceil(((t - ys) / 864e5 + 1) / 7);
      return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
    };
    const collect = (recs, phaseKey, tsField) => {
      const buckets = new Map();
      for (const r of recs) {
        const v = r.phases && r.phases[phaseKey];
        const dt = r[tsField];
        if (v == null || !dt) continue;
        const k = periodKey(dt);
        (buckets.get(k) || buckets.set(k, []).get(k)).push(v);
      }
      // Perioden mit zu wenigen Belegen sind statistisch instabil -> raus.
      const minN = gran === "day" ? 5 : 15;
      return [...buckets.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
        .map(([k, vals]) => ({ period: k, med: median(vals), n: vals.length }))
        .filter((p) => p.n >= minN);
    };
    const trends = {
      dwell:   collect(deliveries, "dwell", "ts_ankunft"),
      putaway: collect(positions, "putaway", "ts_we_pos"),
      unload:  collect(deliveries, "unload", "ts_ankunft"),
    };
    // Termintreue-Quote je Periode
    const otBuckets = new Map();
    for (const d of deliveries) {
      const v = d.phases && d.phases.delay, dt = d.ts_ankunft;
      if (v == null || !dt) continue;
      const k = periodKey(dt);
      const b = otBuckets.get(k) || otBuckets.set(k, { ok: 0, n: 0 }).get(k);
      b.n++; if (v <= (cfg.toleranzMin ?? 30) / 60) b.ok++;
    }
    trends.onTime = [...otBuckets.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([k, b]) => ({ period: k, med: b.n ? b.ok / b.n : 0, n: b.n }))
      .filter((p) => p.n >= (gran === "day" ? 5 : 15));

    /* --- Δ letzte vollständige Periode vs. Median der vorherigen -------- */
    const deltaOf = (series, lowerIsBetter = true) => {
      if (!series || series.length < 2) return null;
      const last = series[series.length - 1];
      const prev = series.slice(0, -1);
      const base = median(prev.map((p) => p.med));
      if (base == null || !isFinite(base) || base === 0) return null;
      const rel = (last.med - base) / Math.abs(base);
      return { last: last.med, base, rel, better: lowerIsBetter ? rel < 0 : rel > 0 };
    };
    const deltas = {
      dwell: deltaOf(trends.dwell, true),
      putaway: deltaOf(trends.putaway, true),
      onTime: deltaOf(trends.onTime, false),
    };

    /* --- Engpass-Erkennung: Phase mit größtem Beitrag × Streuung -------- */
    const flowPhases = ["wait_gate", "reaction", "unload", "booking", "putaway"];
    const bottleneck = flowPhases.map((k) => {
      const recs = PHASES[k].level === "delivery" ? deliveries : positions;
      const vals = recs.map((r) => r.phases && r.phases[k]).filter((v) => v != null);
      if (vals.length < 8) return null;
      const med = median(vals), p75 = quantile(vals, 0.75), p25 = quantile(vals, 0.25);
      // Score: Median-Beitrag gewichtet mit relativer Streuung (IQR/Median)
      const spread = med > 0 ? (p75 - p25) / med : 0;
      return { key: k, label: PHASES[k].label, med, p75, spread, score: med * (1 + spread) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);

    // Welches Segment treibt den Top-Engpass?
    let bottleneckSeg = null;
    if (bottleneck.length) {
      const top = bottleneck[0];
      const recs = PHASES[top.key].level === "delivery" ? deliveries : positions;
      const bySeg = {};
      for (const r of recs) {
        const v = r.phases && r.phases[top.key];
        if (v == null) continue;
        (bySeg[r.segment] ||= []).push(v);
      }
      const ranked = Object.entries(bySeg).filter(([, v]) => v.length >= 5)
        .map(([s, v]) => ({ seg: s, med: median(v) })).sort((a, b) => b.med - a.med);
      if (ranked.length > 1 && ranked[0].med > 1.3 * ranked[ranked.length - 1].med)
        bottleneckSeg = ranked[0].seg;
    }

    /* --- Klartext-Befunde (kurze Sätze, Management-Sicht) -------------- */
    const findings = [];
    const fmtHrs = (h) => h >= 48 ? (h / 24).toFixed(1) + " Tagen" : h >= 1 ? h.toFixed(1) + " h" : Math.round(h * 60) + " min";
    if (bottleneck.length) {
      const t = bottleneck[0];
      let s = `Größter Engpass ist ${t.label} (Median ${fmtHrs(t.med)}`;
      if (t.spread > 0.8) s += `, stark schwankend bis ${fmtHrs(t.p75)} im oberen Viertel`;
      s += ")";
      if (bottleneckSeg) s += ` — vor allem ${bottleneckSeg}-Anlieferungen`;
      findings.push({ text: s + ".", tone: "warn" });
    }
    const dwD = deltas.dwell;
    if (dwD) findings.push({
      text: `Standzeit ${dwD.better ? "verbessert" : "verschlechtert"} um ${Math.abs(dwD.rel * 100).toFixed(0)} % ggü. Vorperiode.`,
      tone: dwD.better ? "ok" : "warn",
    });
    const otD = deltas.onTime;
    if (otD) findings.push({
      text: `Termintreue bei ${(otD.last * 100).toFixed(0)} % (${otD.better ? "+" : ""}${(otD.rel * 100).toFixed(0)} % ggü. Vorperiode).`,
      tone: otD.better ? "ok" : "warn",
    });
    if (kpis.nErrors > 0) findings.push({
      text: `${kpis.nErrors} Datensätze mit unplausibler Zeitstempel-Reihenfolge — im Tab „Muster & Schicht" gelistet.`,
      tone: "err",
    });

    // Business-geflaggte Sonderfälle für die Muster-Ansicht (getrennt von Datenfehlern)
    const diffAll = deliveries.filter((d) => d.isDiffLieferung);
    const kritAll = positions.filter((p) => p.isKritArt);
    const sonderfaelle = {
      diffLieferung: diffAll.slice(0, 20), nDiff: diffAll.length,
      kritArt: kritAll.slice(0, 20), nKrit: kritAll.length,
    };

    return { positions, deliveries, baselines, phaseMed, dataErrors, heat, teams, arrivalsByShift,
             drivers, sonderfaelle, kpis, cfg,
             trends, deltas, gran, bottleneck, bottleneckSeg, findings };
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
    ink: "var(--ink)", ink2: "var(--ink2)", muted: "var(--muted)", border: "var(--border)",
    panel: "var(--panel)", card: "var(--card)", bg: "var(--bg)", band: "var(--band)",
    grid: "var(--grid)",
    // Semantische Farben (theme-abhängig)
    accent: "var(--accent)", good: "var(--good)", bad: "var(--bad)",
    outlier: "var(--accent)", error: "#8A5CF6", ok: "var(--good)",
    // Segmentfarben (fest, theme-unabhängig für Wiedererkennung)
    lkw: "#3B7BB5", container: "#2AA084", sonst: "#9BA6B2",
  };
  const SEGC = { LKW: C.lkw, Container: C.container, BSL: "#C79A3A", Sonstige: C.sonst };

  const THEME_VARS = `
    :host{ --bg:#FFFFFF; --panel:#F7F9FB; --card:#FFFFFF; --ink:#1B2733; --ink2:#48586A;
           --muted:#8A97A5; --border:#E6EBF0; --band:rgba(224,122,63,.10);
           --good:#2C9A6B; --bad:#D8624A; --grid:#EEF2F6; --accent:#E07A3F; }
    :host([data-theme="dark"]){ --bg:#161D24; --panel:#1E2831; --card:#202B35; --ink:#EAF1F7;
           --ink2:#B4C2CF; --muted:#7E8D9C; --border:#2E3B47; --band:rgba(224,122,63,.20);
           --good:#3FB483; --bad:#E87760; --grid:#28333D; --accent:#E68A4E; }`;

  const MODES = [
    { id: "ueberblick", label: "Überblick", metric: null, level: null, phases: [], unit: "", desc: "Engpass, Trends und Kurzbefund" },
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
    .kpis{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:10px 0 0;}
    .kpi{ padding:11px 13px; border:1px solid ${C.border}; border-radius:9px; background:${C.card};
      cursor:pointer; min-width:0; transition:border-color .15s, transform .1s;}
    .kpi:hover{ border-color:${C.accent};}
    .kpi:active{ transform:translateY(1px);}
    .kpi .lbl{ font-size:10.5px; color:${C.muted}; text-transform:uppercase; letter-spacing:.4px; display:block;}
    .kpi .val{ display:flex; align-items:baseline; gap:7px; margin:3px 0 5px;}
    .kpi .val b{ font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1;}
    .kpi .d{ font-size:11px; font-weight:600; font-style:normal; font-variant-numeric:tabular-nums;}
    .kpi .d.up{ color:${C.good};} .kpi .d.down{ color:${C.bad};}
    .kpi .sub{ font-size:10px; color:${C.muted}; display:block;}
    .kpi svg.spark{ display:block; width:100%; height:26px;}
    .kpi.err .val b{ color:${C.error};}
    /* Tabs */
    nav{ display:flex; gap:2px; padding:8px 14px 0; overflow-x:auto; scrollbar-width:none;}
    nav::-webkit-scrollbar{ display:none;}
    nav button{ font:inherit; font-size:12px; padding:6px 12px; border:0; background:transparent;
      color:${C.muted}; cursor:pointer; border-bottom:2px solid transparent; flex:none; white-space:nowrap;}
    nav button.on{ color:${C.ink}; font-weight:600; border-bottom-color:${C.outlier};}
    nav button:focus-visible{ outline:2px solid ${C.lkw}; outline-offset:-2px;}
    main{ flex:1; overflow:auto; padding:12px 14px;}
    .row{ display:flex; gap:14px; flex-wrap:wrap;}
    .card{ flex:1 1 340px; min-width:280px; background:${C.card}; border:1px solid ${C.border};
      border-radius:10px; padding:12px 14px;}
    /* Tabellen & Grafiken scrollen bei schmaler Einbettung innerhalb der Karte,
       statt das Widget-Layout horizontal zu sprengen */
    .card > div{ overflow-x:auto; }
    .card.grow{ flex:2 1 460px;}
    .card h3{ font-size:11px; font-weight:600; color:${C.muted}; margin:0 0 8px; text-transform:uppercase; letter-spacing:.5px;}
    /* Klartext-Befunde */
    .findings{ display:flex; flex-direction:column; gap:7px; margin-bottom:14px;}
    .finding{ display:flex; align-items:flex-start; gap:9px; padding:10px 13px; border-radius:9px;
      font-size:13px; line-height:1.4; background:${C.panel}; border:1px solid ${C.border};}
    .finding i{ width:8px; height:8px; border-radius:50%; margin-top:5px; flex:none; background:${C.muted};}
    .finding.warn i{ background:${C.accent};} .finding.warn{ border-color:${C.accent}66;}
    .finding.ok i{ background:${C.good};}
    .finding.err i{ background:${C.error};}
    .finding span{ color:${C.ink};}
    /* Einstiegsliste auffälliger Anlieferungen */
    .outrow{ display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid ${C.border}; cursor:pointer;}
    .outrow:last-child{ border-bottom:0;}
    .outrow:hover{ background:${C.band};}
    .outrow .seg{ width:4px; height:30px; border-radius:2px; flex:none;}
    .outrow .oi{ flex:1; min-width:0;}
    .outrow .oi b{ font-size:12.5px; display:block;}
    .outrow .oi small,.outrow .ov small{ font-size:10.5px; color:${C.muted}; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .outrow .ov{ text-align:right;}
    .outrow .ov b{ font-size:13px; color:${C.accent}; font-variant-numeric:tabular-nums;}
    svg text{ font-family:inherit;}
    /* Tabelle */
    table{ width:100%; border-collapse:collapse; font-size:11.5px; margin-top:6px;}
    th{ text-align:left; color:${C.muted}; font-weight:600; padding:4px 6px; border-bottom:1px solid ${C.border}; font-size:10.5px; text-transform:uppercase; letter-spacing:.3px;}
    td{ padding:4px 6px; border-bottom:1px solid ${C.border}; font-variant-numeric:tabular-nums;}
    tr.sel td, tbody tr:hover td{ background:${C.band}; cursor:pointer;}
    .tag{ display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; color:#fff;}
    .empty{ color:${C.muted}; font-size:12px; padding:24px; text-align:center;}
    .legend{ font-size:10.5px; color:${C.muted}; display:flex; gap:12px; margin:2px 0 6px; flex-wrap:wrap;}
    /* Treiber-Dimensionen-Panel */
    .drvgrid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:16px;}
    .drvcol h4{ font-size:10.5px; font-weight:700; color:${C.ink}; margin:0 0 6px; text-transform:uppercase; letter-spacing:.3px;}
    .drvrow{ display:flex; align-items:center; gap:6px; margin:3px 0; font-size:11px;}
    .drvlbl{ width:78px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${C.ink};}
    .drvbar{ flex:1; height:7px; border-radius:4px; background:${C.border}; overflow:hidden;}
    .drvbar i{ display:block; height:100%; background:${C.outlier}; border-radius:4px;}
    .drvn{ width:44px; text-align:right; color:${C.muted}; font-variant-numeric:tabular-nums;}
    .drvn b{ color:${C.outlier};}
    /* Sonderfälle-Tabelle */
    .sfnote{ font-size:10.5px; color:${C.muted}; margin-top:6px;}
    /* Belegdaten-Raster im TE-Detail */
    .bdgrid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px 18px;}
    .bditem{ font-size:11.5px; display:flex; flex-direction:column; gap:1px;}
    .bditem span{ color:${C.muted}; font-size:10px; text-transform:uppercase; letter-spacing:.3px;}
    .bditem b{ color:${C.ink}; font-weight:600; word-break:break-word;}
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

  /* ---- BW-Row-Zugriff ---------------------------------------------------
   * SAC liefert je Dimension ein Objekt { id, label } (mit _0-Suffix),
   * Measures als { raw, formatted }. Sobald BW angebunden ist, kommt der
   * Klartext (label) automatisch mit dem Schluessel mit - deshalb gibt es
   * pro Sachverhalt nur noch EIN Feed (z. B. dimension_lieferant), nicht
   * mehr getrennte "_nr"/"_name"-Paare wie im Rohexport.
   *   readDim()  -> bevorzugt das Label (Klartext), sonst der Code
   *   readCode() -> immer der rohe Code/Schluessel (fuer Keys, F/S, KW.JJJJ)
   *   readVal()  -> numerischer Measure-Wert                              */
  const extractLabel = (v) => {
    if (v == null) return null;
    if (typeof v === "object") {
      if ("label" in v && v.label != null && String(v.label).trim() !== "") return String(v.label).trim();
      if ("id" in v) return String(v.id).trim();
      return null;
    }
    return String(v).trim();
  };
  const extractCode = (v) => {
    if (v == null) return null;
    if (typeof v === "object" && "id" in v) return String(v.id).trim();
    return String(v).trim();
  };
  const NULLS = new Set(["", "#", "00000000", "000000000000", "@NullMember", "@TotalMembers", "null", "undefined"]);
  const isNullTok = (v) => v == null || NULLS.has(String(v).trim());
  const readDim = (row, ...keys) => {
    for (const key of keys)
      for (const k of [`${key}_0`, key]) {
        const v = extractLabel(row[k]);
        if (!isNullTok(v)) return v;
      }
    return null;
  };
  const readCode = (row, ...keys) => {
    for (const key of keys)
      for (const k of [`${key}_0`, key]) {
        const v = extractCode(row[k]);
        if (!isNullTok(v)) return v;
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

  /** Feed-IDs (Manifest v0.7) -> kanonische Zeilen für die Engine.
   *  Alle Spalten des WE-Exports sind abgedeckt; die frueheren separaten
   *  Klartext-Spalten (z.B. "Unnamed: 20" neben WS/Lieferant) entfallen,
   *  weil readDim() das Label automatisch aus der Dimension zieht.       */
  function ingestRows(rows) {
    return rows.map((row) => ({
      // Schlüssel (immer Code, keine Label-Bevorzugung)
      belegnr:            readCode(row, "dimension_te"),
      te_intern:          readCode(row, "dimension_te_intern"),
      te_extern:          readCode(row, "dimension_te_extern"),
      pos:                readCode(row, "dimension_pos", "dimension_produkt_nr"),
      bestellung:         readCode(row, "dimension_bestellung"),
      bestellposition:    readCode(row, "dimension_bestellposition"),
      // Stammdaten (Klartext bevorzugt); alte Feed-IDs als Fallback für bestehende Bindings
      produkt_name:       readDim(row, "dimension_produkt", "dimension_produkt_name"),
      hwg:                readDim(row, "dimension_hwg"),
      ksp:                readDim(row, "dimension_ksp"),
      pgr:                readDim(row, "dimension_pgr"),
      lagernummer:        readDim(row, "dimension_lagernummer"),
      land:               readDim(row, "dimension_ursprungsland"),
      lieferant:          readDim(row, "dimension_lieferant", "dimension_lieferant_name", "dimension_lieferant_nr"),
      frachtfuehrer:      readDim(row, "dimension_frachtfuehrer"),
      transportmittel:    readDim(row, "dimension_transportmittel"),
      ladestelle:         readDim(row, "dimension_ladestelle"),
      abw_mengeneinheit:  readDim(row, "dimension_abw_mengeneinheit"),
      standard_packmittel:readDim(row, "dimension_standard_packmittel"),
      processcode:        readCode(row, "dimension_processcode"),
      processcode_bez:    readDim(row, "dimension_prozesscode_bez"),
      kategorie_krit_art: readDim(row, "dimension_kategorie_krit_art"),
      freitext_krit_art:  readDim(row, "dimension_freitext_krit_art"),
      // Zeitstempel: IMMER den rohen Code (id) lesen, nie das Label.
      // Das Label ist in SAC locale-abhängig formatiert und würde den
      // Parser je nach Nutzer-Einstellung brechen; die id ist stabil SAP-Format.
      ts_geplant:         readCode(row, "dimension_ts_geplant"),
      // Kompatibilität: altes Zeitfenster-Paar weiterhin einlesen (Engine nutzt es für Termintreue, falls vorhanden)
      ts_geplant_start:   readCode(row, "dimension_geplant_start"),
      ts_geplant_ende:    readCode(row, "dimension_geplant_ende"),
      ts_ankunft:         readCode(row, "dimension_ts_ankunft"),
      ts_angedockt:       readCode(row, "dimension_ts_angedockt"),
      ts_entladen_start:  readCode(row, "dimension_ts_entladen_start"),
      ts_entladen_ende:   readCode(row, "dimension_ts_entladen_ende"),
      ts_entladen_tat:    readCode(row, "dimension_ts_entladen_tat"),
      ts_we_pos:          readCode(row, "dimension_ts_we_pos"),
      ts_we_buchung:      readCode(row, "dimension_ts_we_buchung"),
      ts_einlagerung:     readCode(row, "dimension_ts_einlagerung"),
      ts_abfahrt:         readCode(row, "dimension_ts_abfahrt"),
      ts_ist_start:       readCode(row, "dimension_ts_ist_start"),
      ts_ist_ende:        readCode(row, "dimension_ts_ist_ende"),
      // Schicht/KW je Prozessschritt (Code, kein Label)
      sh_ankunft:         readCode(row, "dimension_schicht_ankunft"),
      kw_ankunft:         readCode(row, "dimension_kw_ankunft"),
      sh_andocken:        readCode(row, "dimension_schicht_andocken"),
      kw_andocken:        readCode(row, "dimension_kw_andocken"),
      sh_entl_start:      readCode(row, "dimension_schicht_entladen_start"),
      kw_entl_start:      readCode(row, "dimension_kw_entladen_start"),
      sh_entl_tat:        readCode(row, "dimension_schicht_entladen_tat"),
      kw_entl_tat:        readCode(row, "dimension_kw_entladen_tat"),
      sh_entl:            readCode(row, "dimension_schicht_entladen"),
      kw_entl:            readCode(row, "dimension_kw_entladen"),
      sh_we:              readCode(row, "dimension_schicht_we_buchung"),
      kw_we:              readCode(row, "dimension_kw_we_buchung"),
      sh_einl:            readCode(row, "dimension_schicht_einlagerung"),
      kw_einl:            readCode(row, "dimension_kw_einlagerung"),
      // Kennzahlen
      menge_ist:          readVal(row, "value_menge_ist"),
      menge_soll:         readVal(row, "value_menge_soll"),
      pa1:                readVal(row, "value_pa1"),
      anzahl_mitarbeiter: readVal(row, "value_anzahl_mitarbeiter"),
    }));
  }

  class WECockpit extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.innerHTML = TPL;
      this._props = {
        madThreshold: 3.5, teamEvenFrueh: "Team A", teamOddFrueh: "Team B",
        baselineMode: "segment", toleranzMin: 30, theme: "dark", defaultView: "ueberblick",
      };
      this._rows = null; this._model = null; this._mode = "ueberblick"; this._detail = null;
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
      if (mode.id === "ueberblick") { this._viewUeberblick(main); return; }
      if (mode.id === "muster") { this._viewMuster(main); return; }
      if (mode.id === "mengen") { this._viewMengen(main); return; }
      this._viewMetric(main, mode);
    }

    _renderKpis() {
      const el = this._shadow.getElementById("kpis"), M = this._model;
      if (!M) { el.innerHTML = ""; return; }
      const k = M.kpis, t = M.trends, d = M.deltas;
      const tile = (goto, title, value, series, delta, lowerBetter, invPct) => {
        let badge = "";
        if (delta) {
          const cls = delta.better ? "up" : "down";
          const arrow = (delta.rel < 0) ? "▼" : "▲";
          badge = `<em class="d ${cls}">${arrow} ${Math.abs(delta.rel * 100).toFixed(0)}%</em>`;
        }
        return `<div class="kpi" data-goto="${goto}" title="${title}">
          <span class="lbl">${title}</span>
          <div class="val"><b>${value}</b>${badge}</div>
          ${this._sparkline(series, invPct)}
        </div>`;
      };
      el.innerHTML =
        tile("hof", "Ø Standzeit", fmtH(k.medDwell), t.dwell, d.dwell, true, false) +
        tile("lager", "Ø Einlagerung", fmtH(k.medPutaway), t.putaway, d.putaway, true, false) +
        tile("termin", "Termintreue", fmtP(k.onTime), t.onTime, d.onTime, false, true) +
        `<div class="kpi ${k.nErrors ? "err" : ""}" data-goto="muster" title="Datenfehler ansehen">
          <span class="lbl">Datenfehler</span>
          <div class="val"><b>${k.nErrors}</b></div>
          <span class="sub">unplausible Zeitstempel</span>
        </div>`;
    }

    /** Mini-Trendkurve als SVG; invPct skaliert 0–1 Quoten. */
    _sparkline(series, isPct) {
      if (!series || series.length < 2) return `<span class="sub">kein Trend (Zeitraum zu kurz)</span>`;
      const vals = series.map((p) => p.med);
      const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1;
      const W = 108, Hh = 26;
      const X = (i) => (i / (series.length - 1)) * (W - 2) + 1;
      const Y = (v) => Hh - 3 - ((v - lo) / rng) * (Hh - 6);
      const pts = series.map((p, i) => `${X(i).toFixed(1)},${Y(p.med).toFixed(1)}`).join(" ");
      const last = series[series.length - 1];
      return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="${X(series.length - 1).toFixed(1)}" cy="${Y(last.med).toFixed(1)}" r="2.2" fill="var(--accent)"/>
      </svg>`;
    }

    /* ---- Überblick: Engpass-Wasserfall + Befunde + Einstieg ---- */
    _viewUeberblick(main) {
      const M = this._model;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="findings" id="findings"></div>
        <div class="row">
          <div class="card grow"><h3>Engpass-Analyse · Median-Zeit je Prozessphase</h3><div id="waterfall"></div></div>
          <div class="card"><h3>Auffällige Anlieferungen</h3><div id="topout"></div></div>
        </div>`;
      main.appendChild(wrap);
      this._renderFindings(wrap.querySelector("#findings"));
      this._svgWaterfall(wrap.querySelector("#waterfall"));
      this._topOutliers(wrap.querySelector("#topout"));
    }

    _renderFindings(el) {
      const f = this._model.findings || [];
      if (!f.length) { el.innerHTML = ""; return; }
      el.innerHTML = f.map((x) =>
        `<div class="finding ${x.tone}"><i></i><span>${esc(x.text)}</span></div>`).join("");
    }

    /* Engpass-Wasserfall: Phasen als aufeinander aufbauende Balken, Top-Engpass betont. */
    _svgWaterfall(el) {
      const M = this._model, bn = M.bottleneck;
      if (!bn || !bn.length) { el.innerHTML = `<div class="empty">Zu wenige Daten für die Engpass-Analyse.</div>`; return; }
      const order = ["wait_gate", "reaction", "unload", "booking", "putaway"];
      const steps = order.map((k) => bn.find((b) => b.key === k)).filter(Boolean);
      const topKey = bn[0].key;
      const total = steps.reduce((a, s) => a + s.med, 0) || 1;
      // Skala: die Streuung (P75) kann die Median-Summe deutlich überragen —
      // deshalb an der tatsächlichen visuellen Ausdehnung ausrichten, nicht nur an der Summe.
      let cumScan = 0, maxExtent = total;
      for (const s of steps) { maxExtent = Math.max(maxExtent, cumScan + s.p75); cumScan += s.med; }
      const W = 560, rowH = 40, padL = 130, padR = 48, H0 = steps.length * rowH + 30;
      const barW = W - padL - padR;
      const X = (v) => (v / maxExtent) * barW;
      let cum = 0;
      let svg = `<svg viewBox="0 0 ${W} ${H0}" width="100%" role="img" aria-label="Engpass-Wasserfall">`;
      steps.forEach((s, i) => {
        const y = i * rowH + 6;
        const isTop = s.key === topKey;
        const x = padL + X(cum), w = Math.max(2, X(s.med));
        // Verbindungslinie zum nächsten Balken (Wasserfall-Treppe)
        if (i > 0) svg += `<line x1="${padL + X(cum)}" x2="${padL + X(cum)}" y1="${y - 6}" y2="${y}" stroke="${C.border}" stroke-dasharray="2 2"/>`;
        svg += `<text x="0" y="${y + 17}" font-size="11.5" fill="${isTop ? C.accent : C.ink}" font-weight="${isTop ? 700 : 500}">${s.label}</text>`;
        // Streuungsmarke (P75) zuerst zeichnen, damit das Label darüber lesbar bleibt
        const wSpread = Math.max(0, X(s.p75) - X(s.med));
        if (wSpread > 1) svg += `<rect x="${x + w}" y="${y + 10}" width="${wSpread}" height="8" rx="2" fill="${isTop ? C.accent : C.ink2}" opacity="0.18"><title>Streuung bis P75: ${fmtH(s.p75)}</title></rect>`;
        svg += `<rect x="${x}" y="${y + 4}" width="${w}" height="20" rx="3"
                  fill="${isTop ? C.accent : C.ink2}" opacity="${isTop ? 1 : 0.32}">
                  <title>${s.label}: Median ${fmtH(s.med)}, P75 ${fmtH(s.p75)}</title></rect>`;
        // Label direkt hinter dem Median-Balken (stabil, unabhängig von der Streuungslänge)
        svg += `<text x="${x + w + 5}" y="${y + 18}" font-size="10.5" fill="${C.muted}">${fmtH(s.med)}</text>`;
        cum += s.med;
      });
      svg += `<line x1="${padL}" x2="${padL}" y1="4" y2="${H0 - 18}" stroke="${C.border}"/>`;
      svg += `<text x="${padL}" y="${H0 - 4}" font-size="10" fill="${C.muted}">Summe Median-Durchlaufzeit: ${fmtH(total)}</text>`;
      svg += `<text x="${W - padR + 4}" y="${H0 - 4}" font-size="9" fill="${C.muted}" text-anchor="end">▏ heller Balken = Streuung bis P75</text>`;
      el.innerHTML = svg + "</svg>";
    }

    /* Kompakte Einstiegs-Liste: die auffälligsten Anlieferungen, klickbar. */
    _topOutliers(el) {
      const M = this._model;
      const scored = M.deliveries
        .filter((d) => d.outlier && (d.outlier.dwell || d.outlier.unload || d.outlier.wait_gate))
        .map((d) => ({ d, z: Math.max(d.z.dwell || 0, d.z.unload || 0, d.z.wait_gate || 0) }))
        .sort((a, b) => b.z - a.z).slice(0, 6);
      if (!scored.length) { el.innerHTML = `<div class="empty">Keine auffälligen Anlieferungen im Zeitraum.</div>`; return; }
      el.innerHTML = scored.map(({ d, z }) => `
        <div class="outrow" data-drill="${esc(d.belegnr)}" title="Details zu TE ${esc(d.belegnr)}">
          <span class="seg" style="background:${SEGC[d.segment] || C.sonst}"></span>
          <div class="oi"><b>TE ${esc(d.belegnr)}</b><small>${esc((d.lieferant || "–").slice(0, 26))}</small></div>
          <div class="ov"><b>${fmtH(d.phases.dwell)}</b><small>z ${z.toFixed(1)}</small></div>
        </div>`).join("");
    }

    /* ---- gemeinsame Metrik-Ansicht (Hof / Lager / Termin) ---- */
    _viewMetric(main, mode) {
      const M = this._model;
      const recs = mode.level === "delivery" ? M.deliveries : M.positions;
      const metric = mode.metric;
      const hasDrivers = M.drivers && M.drivers[metric];
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
        ${hasDrivers ? `<div class="card"><h3>Treiber nach Stammdaten-Dimension (Ausreißer-Anteil)</h3><div id="drv"></div></div>` : ""}
        <div class="card"><h3>Auffällige ${mode.level === "delivery" ? "Anlieferungen" : "Positionen"} (Top nach z-Score)</h3><div id="tbl"></div></div>`;
      main.appendChild(wrap);
      if (mode.phases.length) this._svgRibbon(wrap.querySelector("#ribbon"), recs, mode.phases);
      this._svgScatter(wrap.querySelector("#scatter"), recs, metric, mode);
      if (hasDrivers) this._driverPanel(wrap.querySelector("#drv"), M.drivers[metric]);
      this._tblOutliers(wrap.querySelector("#tbl"), recs, metric, mode);
    }

    /** Kompakte Übersicht der restlichen Belegfelder (nur hier sichtbar). */
    _belegdaten(el, d, pos) {
      const distinct = (field) => [...new Set(pos.map((p) => p[field]).filter((v) => v != null && v !== ""))];
      const fmtTs = (t) => t ? t.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : null;
      const bestellungen = distinct("bestellung").map((b) => {
        const posN = [...new Set(pos.filter((p) => p.bestellung === b).map((p) => p.bestellposition).filter(Boolean))];
        return esc(b) + (posN.length ? ` / Pos. ${posN.map(esc).join(", ")}` : "");
      });
      // Ist-Start/Ende: nur hervorheben, wenn sie von Ankunft/Abfahrt abweichen (sonst Duplikat aus dem Quellsystem)
      const istStart = d.ts_ist_start, istEnde = d.ts_ist_ende;
      const dupStart = istStart && d.ts_ankunft && +istStart === +d.ts_ankunft;
      const dupEnde = istEnde && d.ts_abfahrt && +istEnde === +d.ts_abfahrt;
      const rows = [
        ["Int. TE-Nummer", d.te_intern],
        ["Ext. TE-Nummer", d.te_extern],
        ["Bestellung", bestellungen.length ? bestellungen.join(" · ") : null],
        ["Abw. Mengeneinheit", distinct("abw_mengeneinheit").map(esc).join(", ") || null],
        ["Standard-Packmittel", distinct("standard_packmittel").map(esc).join(", ") || null],
        ["Ist-Start", istStart ? fmtTs(istStart) + (dupStart ? " (= Ankunft)" : "") : null],
        ["Ist-Ende", istEnde ? fmtTs(istEnde) + (dupEnde ? " (= Abfahrt)" : "") : null],
      ].filter(([, v]) => v != null);
      el.innerHTML = rows.length
        ? `<div class="bdgrid">${rows.map(([k, v]) => `<div class="bditem"><span>${k}</span><b>${v}</b></div>`).join("")}</div>`
        : `<div class="empty">Keine weiteren Belegdaten vorhanden.</div>`;
    }

    /** Kompakte Treiber-Rankings (Lieferant/Lagernummer/Land/HWG) nach Ausreißeranteil. */
    _driverPanel(el, dims) {
      const labels = { lieferant: "Lieferant", lagernummer: "Lagernummer", land: "Ursprungsland", hwg: "HWG" };
      // Nur Werte mit tatsächlichen Ausreißern zeigen — 0er-Zeilen wären irreführend
      const cols = Object.entries(dims)
        .map(([key, rows]) => [key, rows.filter((r) => r.outN > 0)])
        .filter(([, rows]) => rows.length);
      if (!cols.length) { el.innerHTML = `<div class="empty">Keine Ausreißer-Häufung in den Stammdaten-Dimensionen.</div>`; return; }
      el.innerHTML = `<div class="drvgrid">${cols.map(([key, rows]) => {
        const maxOut = Math.max(...rows.map((r) => r.outN), 1);
        return `<div class="drvcol"><h4>${esc(labels[key] || key)}</h4>` +
          rows.slice(0, 5).map((r) => `<div class="drvrow">
            <span class="drvlbl" title="${esc(r.val)}">${esc(String(r.val).slice(0, 20))}</span>
            <span class="drvbar"><i style="width:${(r.outN / maxOut) * 100}%"></i></span>
            <span class="drvn"><b>${r.outN}</b>/${r.n}</span>
          </div>`).join("") + `</div>`;
      }).join("")}</div>`;
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
      const x0 = Math.min(...xs);
      const x1raw = Math.max(...xs);
      const x1 = x1raw > x0 ? x1raw : x0 + 3600e3; // alle Punkte gleichzeitig -> künstliche 1h-Spanne statt Division durch 0
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
      if (d.isDiffLieferung) chips.push(`<span class="chip err">Differenzlieferung (Processcode)</span>`);
      if (pos.some((p) => p.isKritArt)) chips.push(`<span class="chip err">Kritischer Artikel</span>`);
      if (d.hasError || pos.some((p) => p.hasError)) chips.push(`<span class="chip err">Datenfehler</span>`);
      if (!chips.length) chips.push(`<span class="chip ok">Prozess im Rahmen</span>`);

      const totalPaletten = pos.reduce((sum, p) => sum + (p.paletten || 0), 0);

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
          ${totalPaletten > 0 ? `<span>Paletten gesamt: <b>${totalPaletten.toFixed(1)}</b></span>` : ""}
          ${d.lagernummer ? `<span>Lager: <b>${esc(d.lagernummer)}</b></span>` : ""}
          ${d.land ? `<span>Ursprungsland: <b>${esc(d.land)}</b></span>` : ""}
          ${d.sh_entl ? `<span>Schicht Entladen: <b>${d.sh_entl === "F" ? "Früh" : "Spät"}${d.kw_entl ? " · KW " + d.kw_entl.kw : ""}${d.team_entl ? " · " + esc(d.team_entl) : ""}</b></span>` : ""}
          <span>Termintreue: <b>${d.phases.delay == null ? "–" : d.phases.delay <= 0 ? "pünktlich" : "+" + fmtH(d.phases.delay)}</b></span>
        </div>
        <div class="card"><h3>Prozess-Zeitstrahl</h3><div id="tl"></div></div>
        <div class="row">
          <div class="card"><h3>Phasen vs. Median ${esc(d.segment)}</h3><div id="cmp"></div></div>
          <div class="card" style="flex:2 1 420px"><h3>Produkte dieser TE</h3><div id="ptbl"></div></div>
        </div>
        <div class="card"><h3>Weitere Belegdaten</h3><div id="bdat"></div></div>`;
      main.appendChild(wrap);
      wrap.querySelector("#back").addEventListener("click", () => { this._detail = null; this._render(); });
      this._belegdaten(wrap.querySelector("#bdat"), d, pos);
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
          <td>${p.paletten != null ? p.paletten.toFixed(1) : "–"}</td>
          <td>${p.ts_einlagerung ? p.ts_einlagerung.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–"}</td>
          <td style="${out ? "color:" + C.outlier + ";font-weight:600" : ""}">${put != null ? fmtH(put) : "–"}${out ? " ⚠" : ""}</td>
          <td>${p.z && p.z.putaway != null ? p.z.putaway.toFixed(1) : "–"}</td></tr>`;
      }).join("");
      el.innerHTML = `<table><thead><tr>
        <th>Produkt</th><th>Bezeichnung</th><th>SOLL</th><th>IST</th><th>Paletten</th>
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
        const xs = tp.map((p) => +p.ts_we_pos), x0 = Math.min(...xs);
        const x1raw = Math.max(...xs), x1 = x1raw > x0 ? x1raw : x0 + 3600e3;
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
          <div class="card"><h3>Team-Vergleich (rotationsbereinigt) · Median je Phase</h3><div id="teams"></div></div>
        </div>
        <div class="row">
          <div class="card"><h3>Datenfehler (negative Phasendauern u. ä.)</h3><div id="errs"></div></div>
          <div class="card"><h3>Business-Sonderfälle (SAP-Kennzeichen, keine Statistik)</h3><div id="sonder"></div></div>
        </div>`;
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
      const av = M.arrivalsByShift || {};
      const avTotal = (av["Früh"] || 0) + (av["Spät"] || 0);
      const avNote = avTotal
        ? `<div class="sfnote">Anlieferungen je Schicht: Früh <b>${av["Früh"] || 0}</b> · Spät <b>${av["Spät"] || 0}</b> (${avTotal ? Math.round(100 * (av["Früh"] || 0) / avTotal) : 0} % Früh)</div>`
        : "";
      wrap.querySelector("#heat").innerHTML = svg + "</svg>" + avNote;
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
      // Sonderfälle (Processcode / kritische Artikel) - business-geflaggt, keine MAD-Ausreißer
      this._tblSonderfaelle(wrap.querySelector("#sonder"), M.sonderfaelle);
    }

    _tblSonderfaelle(el, sf) {
      if (!sf || (!sf.diffLieferung.length && !sf.kritArt.length)) {
        el.innerHTML = `<div class="empty">Keine geflaggten Sonderfälle im Zeitraum.</div>`;
        return;
      }
      let html = "";
      if (sf.diffLieferung.length) {
        html += `<div class="sfnote" style="margin-bottom:4px"><b>Differenzlieferungen</b> (Processcode gesetzt, z. B. Mengendifferenz):</div>
          <table><thead><tr><th>TE</th><th>Lieferant</th><th>Segment</th></tr></thead><tbody>${
          sf.diffLieferung.slice(0, 8).map((d) => `<tr data-drill="${esc(d.belegnr)}" title="Klicken für TE-Details">
            <td><b>${esc(d.belegnr)}</b></td><td>${esc((d.lieferant || "–").slice(0, 24))}</td>
            <td><span class="tag" style="background:${SEGC[d.segment] || C.sonst}">${esc(d.segment)}</span></td></tr>`).join("")
          }</tbody></table>${sf.nDiff > 8 ? `<div class="legend">… ${sf.nDiff - 8} weitere</div>` : ""}`;
      }
      if (sf.kritArt.length) {
        html += `<div class="sfnote" style="margin:10px 0 4px"><b>Kritische Artikel</b> (manuell markiert):</div>
          <table><thead><tr><th>Beleg/Pos</th><th>Kategorie</th><th>Freitext</th></tr></thead><tbody>${
          sf.kritArt.slice(0, 8).map((p) => `<tr data-drill="${esc(p.belegnr)}" title="Klicken für TE-Details">
            <td><b>${esc(p.belegnr)}</b>${p.pos ? "/" + esc(p.pos) : ""}</td>
            <td>${esc(p.kategorie_krit_art || "–")}</td><td>${esc((p.freitext_krit_art || "–")).slice(0, 30)}</td></tr>`).join("")
          }</tbody></table>${sf.nKrit > 8 ? `<div class="legend">… ${sf.nKrit - 8} weitere</div>` : ""}`;
      }
      el.innerHTML = html;
    }

    _teamsSvg(teams) {
      const blocks = [
        ["wait_gate", "Wartezeit Tor"], ["reaction", "Reaktionszeit"], ["unload", "Entladedauer"],
        ["booking", "Buchungsverzug"], ["putaway", "Einlagerung"],
      ].filter(([k]) => teams[k] && Object.keys(teams[k]).length);
      const names = [...new Set(blocks.flatMap(([k]) => Object.keys(teams[k] || {})))].sort();
      if (!names.length) return `<div class="empty">Keine Schicht-/KW-Daten im Feed (Z.Sh./Z.KW-Spalten anbinden).</div>`;
      const W = 420, bh = 16, gap = 20;
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
        y += gap;
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
