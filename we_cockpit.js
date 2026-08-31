/* =========================================================================
 * WE-Prozess-Cockpit – SAC Custom Widget (v0.19.0) · Entwickler: Benne
 * Segment-/Schluesselabgleich mit dem Wareneingang-Tracker.
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
  /* Erweiterte Prüfung NUR für Merkmale/Zeitstempel: BW füllt leere Felder mit
     Nullen oder Rauten beliebiger Länge. Bewusst NICHT für Kennzahlen verwendet -
     dort ist "0" ein gültiger Messwert (z. B. SOLL-Menge 0 bei Storno). */
  const isNullDim = (v) => {
    if (isNull(v)) return true;
    const s = String(v).trim();
    return /^0+$/.test(s) || /^#+$/.test(s);
  };

  function parseTs(v) {
    if (isNullDim(v)) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim().replace(/\s+/g, " "); // mehrfache Leerzeichen -> eins (Januar-Export: "dd.mm.yyyy  hh:mm:ss")
    // dd.mm.yyyy hh:mm(:ss)  — ein oder mehrere Trennzeichen, Sekunden optional
    let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
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

  /* Ladestellen-Normalisierung, 1:1 aus dem Wareneingang-Tracker übernommen.
     Wichtig: BW liefert den Schlüssel abgeschnitten ("ILW KREFELD CONTAINE"),
     eine Suche nach "CONTAINER" würde live also ins Leere laufen. */
  const LADESTELLE_KURZ = {
    "ILW KREFELD BSL": "BSL",
    "ILW KREFELD CONTAINE": "Container",
    "ILW KREFELD LANDVERK": "Landverkehr",
    "ILW Krefeld Container": "Container",
    "ILW Krefeld BSL": "BSL",
    "ILW Krefeld BSL / Eigendisposition": "BSL",
    "ILW Krefeld Landverkehr": "Landverkehr",
    "ILW Krefeld Frei Haus / DDP": "Landverkehr",
    "Eigendisposition": "Eigendisposition",
  };
  function ladestelleKurz(wert) {
    if (isNullDim(wert)) return "Eigendisposition";
    const w = String(wert).trim();
    if (LADESTELLE_KURZ[w]) return LADESTELLE_KURZ[w];
    if (/container|containe/i.test(w)) return "Container";
    if (/bsl/i.test(w)) return "BSL";
    if (/frei haus|ddp|landverk/i.test(w)) return "Landverkehr";
    if (/eigendispo/i.test(w)) return "Eigendisposition";
    return w; // z. B. "Nicht zugeordnet" bleibt als eigenes Segment sichtbar
  }

  function segmentOf(ladestelle, tm) {
    // Ladestelle hat Vorrang - identische Kategorien wie im Tracker
    if (!isNullDim(ladestelle)) return ladestelleKurz(ladestelle);
    // Fallback über das Transportmittel, wenn die Ladestelle nicht gebunden ist
    if (isNullDim(tm)) return "Eigendisposition";
    const t = String(tm).toUpperCase();
    if (t === "BSL") return "BSL";                     // BSL ist eine eigene Kategorie, kein LKW
    if (t === "SZ" || t.includes("LKW")) return "Landverkehr";
    if (/G0|CONTAINER|'/.test(t) || /^\d{2}[A-Z]\d$/.test(t)) return "Container";
    return "Eigendisposition";
  }

  /* Rückrichtung für den Query-Filter: normiertes Segment -> rohe
     Ladestellen-Werte, wie sie im BW-Modell als Member stehen. 1:1 aus
     LADESTELLE_KURZ abgeleitet, damit beide Richtungen synchron bleiben. */
  const SEGMENT_TO_LADESTELLE = (() => {
    const rev = {};
    for (const [raw, seg] of Object.entries(LADESTELLE_KURZ)) (rev[seg] ||= []).push(raw);
    return rev;
  })();

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
      // Führende Nullen entfernen: BW liefert die TE mal als "0010000189647",
      // mal als "10000189647". Der Tracker normalisiert genauso - nur dann
      // beziehen sich beide Widgets auf denselben Schlüssel (und die
      // Deduplizierung je Anlieferung zerfällt nicht in zwei Gruppen).
      if (!isNullDim(r.belegnr)) {
        const raw = String(r.belegnr).trim();
        lastBeleg = raw.replace(/^0+/, "") || raw;
      }
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
      // Einheitliche Palettenlogik im gesamten Cockpit: je Position auf volle
      // Paletten AUFRUNDEN, danach erst summieren (nicht erst Mengen summieren
      // und einmal runden — nicht verhandelbare Regel aus dem Fachkonzept).
      r.paletten = (r.menge_ist != null && r.pa1 > 0) ? Math.ceil(r.menge_ist / r.pa1) : null;
      // Business-geflaggte Sonderfälle (keine statistischen Ausreißer, sondern im SAP markiert)
      r.isDiffLieferung = !isNull(r.processcode);
      // BSL-Prozess (Belegart PDI/ZBLE bzw. Ladestelle/Transportmittel BSL):
      // hier darf die WE-Buchung VOR dem Entladeende liegen (legitime
      // Prozessabwandlung, kein Datenfehler). Belegart ist das zuverlässigste
      // Merkmal, weil die Ladestelle bei BSL oft nicht gesetzt ist.
      r.isBSL = /ZBLE/i.test(String(r.belegart || "")) ||
                String(r.transportmittel || "").toUpperCase() === "BSL" ||
                r.segment === "BSL";
      // "Nicht zugeordnet" ist hier der Normalfall (kein kritischer Artikel),
      // nicht ein gesetztes Kennzeichen - daher wie leer behandeln.
      const kritLeer = (v) => isNullDim(v) || String(v).trim() === "Nicht zugeordnet";
      r.isKritArt = !kritLeer(r.kategorie_krit_art) || !kritLeer(r.freitext_krit_art);
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
          // Neue Felder auf Anlieferungsebene
          belegart: p.belegart, lagertor: p.lagertor, containerdepot: p.containerdepot,
          depotspediteur: p.depotspediteur, isBSL: p.isBSL,
          ts_verschifft: p.ts_verschifft, ts_hafen: p.ts_hafen, ts_verzollung: p.ts_verzollung,
          ts_depot: p.ts_depot, ts_depot_anf: p.ts_depot_anf,
          ts_we_pos: p.ts_we_pos, ts_einlagerung: p.ts_einlagerung,
          sap_otif: p.sap_otif, sap_puenktlich: p.sap_puenktlich, sap_vollstaendig: p.sap_vollstaendig,
          knz_shuttle: p.knz_shuttle, knz_direktfahrt: p.knz_direktfahrt, knz_qualitaet: p.knz_qualitaet,
          // Summen über Positionen (unten aufaddiert)
          sum_gewicht: 0, sum_volumen: 0, sum_wert: 0, sum_kollis: 0, sum_menge: 0,
          sum_paletten: 0, nPalettenBerechenbar: 0,
          _anlieferungIds: new Set(),
          // Für den rechten Rand der Prozesskette zählt die zuletzt fertig-
          // gestellte/eingelagerte Position der GESAMTEN TE (über alle
          // Anlieferungen hinweg) — nicht nur der ersten Position.
          ts_we_pos_last: null, ts_einlagerung_last: null,
          nPos: 0,
        });
      }
      const d = dmap.get(key);
      d.nPos++;
      if (p.anlieferung) d._anlieferungIds.add(String(p.anlieferung));
      if (p.paletten != null) { d.sum_paletten += p.paletten; d.nPalettenBerechenbar++; }
      if (p.ts_we_pos instanceof Date && (!d.ts_we_pos_last || p.ts_we_pos > d.ts_we_pos_last)) d.ts_we_pos_last = p.ts_we_pos;
      if (p.ts_einlagerung instanceof Date && (!d.ts_einlagerung_last || p.ts_einlagerung > d.ts_einlagerung_last)) d.ts_einlagerung_last = p.ts_einlagerung;
      d.isDiffLieferung = d.isDiffLieferung || p.isDiffLieferung;
      d.isKritArt = d.isKritArt || p.isKritArt;
      if (p.gewicht != null) d.sum_gewicht += p.gewicht;
      if (p.volumen != null) d.sum_volumen += p.volumen;
      if (p.wert_eur != null) d.sum_wert += p.wert_eur;
      if (p.anzahl_kollis != null) d.sum_kollis += p.anzahl_kollis;
      if (p.menge_ist != null) d.sum_menge += p.menge_ist;
    }
    const deliveries = [...dmap.values()];
    // Struktur-Kennzahlen je TE finalisieren. Fehlt ein eigener Anlieferungs-
    // Feed, bleibt die Anzahl bewusst null statt fälschlich mit 1 angenommen
    // zu werden (TE ≠ Anlieferung — nicht verhandelbare Regel).
    for (const d of deliveries) {
      d.nAnlieferungen = d._anlieferungIds.size || null;
      d.palettenVollstaendig = d.nPos > 0 && d.nPalettenBerechenbar === d.nPos;
      delete d._anlieferungIds;
    }

    /* --- Phasen berechnen + Datenfehler trennen ------------------------- */
    const dataErrors = [];
    function computePhases(rec, keys, ctx) {
      rec.phases = {};
      for (const k of keys) {
        const ph = PHASES[k];
        const h = hoursBetween(rec, ph.from, ph.to);
        if (h == null) { rec.phases[k] = null; continue; }
        if (k !== "delay" && h < 0) {
          // BSL-Prozess: negativer Buchungsverzug UND negative Einlagerung sind
          // erlaubt - Buchung/Einlagerung dürfen vor dem jeweiligen Vorgänger
          // liegen (legitime Prozessabwandlung). Als 0 werten statt Datenfehler.
          if ((k === "booking" || k === "putaway") && rec.isBSL) { rec.phases[k] = 0; continue; }
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
      text: `${kpis.nErrors} Datensätze mit unplausibler Zeitstempel-Reihenfolge — als Datenfehler ausgeschlossen.`,
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
    // Semantische Farben (theme-abhängig) — Markenrot des WE-Trackers als Akzent
    accent: "var(--accent)", good: "var(--good)", bad: "var(--bad)",
    outlier: "var(--accent)", error: "var(--warn)", ok: "var(--good)",
    // Neutrale Diagrammfarben (Heatmap, Team-Balken, Zeitstrahl) - KEINE Segmentbedeutung
    lkw: "#2980b9", container: "#27ae60", sonst: "#5d6d7e",
  };
  /* Segmentfarben - identisch zum Wareneingang-Tracker, damit dieselbe
     Ladestelle in beiden Widgets dieselbe Farbe hat. */
  const SEGC = {
    BSL: "#8e44ad",
    Container: "#e67e22",
    Landverkehr: "#27ae60",
    Eigendisposition: "#5d6d7e",
  };
  // Schicht-Farben: Frühschicht (F) warm/hell, Spätschicht (S) kühl/dunkel
  const SH_COLORS = { F: "#f5b041", S: "#5dade2" };

  /* Design-Tokens übernommen aus dem Wareneingang-Tracker (main.js):
     Markenrot als Akzent, Consolas-Mono für Labels, dunkles Standard-Theme. */
  const THEME_VARS = `
    :host{
      /* Dark Theme — exakt an die Referenz (main__3_.js) angeglichen:
         hellere Cards/Hintergründe, kontrastreicherer Sekundär-/Tertiärtext,
         sichtbarere Ränder, identische Status-Farben. */
      --bg:#10131b; --panel:#191e2b; --card:#232a3e; --card2:#2e3650;
      --ink:#f2f4f8; --ink2:#b4bacc; --muted:#7e8598;
      --border:rgba(255,255,255,.11); --border2:rgba(255,255,255,.18);
      --grid:rgba(255,255,255,.11);
      --accent:#e74c3c; --accent-strong:#c0392b;
      --accent-dim:rgba(192,57,43,.14); --accent-border:rgba(192,57,43,.35);
      --good:#2ecc71; --good-dim:rgba(46,204,113,.18);
      --bad:#e74c3c; --warn:#f5b041; --warn-dim:rgba(245,176,65,.18);
      --blue:#3d9ad6; --blue-dim:rgba(61,154,214,.18);
      --band:rgba(192,57,43,.18);
      --shadow-sm:0 2px 8px rgba(0,0,0,.35); --shadow-md:0 4px 16px rgba(0,0,0,.45);
      --shadow-lg:0 8px 40px rgba(0,0,0,.55);
      --font:'Segoe UI',system-ui,-apple-system,sans-serif;
      --font-mono:'Consolas','Cascadia Code','Courier New',monospace;
      --r-sm:4px; --r-md:8px; --r-lg:12px;
      --ease:cubic-bezier(.16,1,.3,1);
    }
    :host([data-theme="light"]){
      --bg:#f5f6f8; --panel:#ffffff; --card:#ffffff; --card2:#f0f2f5;
      --ink:#1a1d23; --ink2:#4a5060; --muted:#8b90a0;
      --border:rgba(0,0,0,.08); --border2:rgba(0,0,0,.14);
      --grid:rgba(0,0,0,.08);
      /* accent-strong bewusst dunkler als accent: der LKW-Auflieger (strong)
         muss sich von der Fahrerkabine (accent) absetzen, wie im Tracker */
      --accent:#c0392b; --accent-strong:#96281b;
      --good:#27ae60; --bad:#c0392b; --warn:#d68910;
      --band:rgba(192,57,43,.10);
      --shadow-sm:0 2px 8px rgba(0,0,0,.07); --shadow-md:0 4px 16px rgba(0,0,0,.10);
      --shadow-lg:0 8px 40px rgba(0,0,0,.14);
    }`;

  const MODES = [
    { id: "puls",         label: "Puls",         desc: "Zustand der Periode auf einen Blick" },
    { id: "prozesskette", label: "Prozesskette", desc: "Zeitstrahl je TE inkl. Seetransport" },
    { id: "ausreisser",   label: "Auffälligkeiten", desc: "Auffällige TEs mit Detail-Drill" },
    { id: "spediteur",    label: "Spediteuranalyse",    desc: "Pünktlichkeit der Spediteure (BW P/N) und TE-bezogene Verspätungsanalyse" },
    { id: "lieferanten",  label: "Lieferantenanalyse",  desc: "Mengentreue und Mengenabweichungen der Lieferanten auf Positionsebene" },
    { id: "warengruppen", label: "Warengruppenanalyse", desc: "WE-Durchlaufzeit je Warengruppe auf Basis von TE und Positionen" },
    { id: "schicht",      label: "Schicht",      desc: "Früh- vs. Spätschicht im Vergleich" },
  ];

  const TPL = `
  <style>
    ${THEME_VARS}
    :host { display:block; width:100%; height:100%;
      font-family:var(--font); font-size:13px; color:${C.ink}; background:${C.bg}; }
    *,*::before,*::after{ box-sizing:border-box; }
    .root{ display:flex; flex-direction:column; height:100%; background:${C.bg};
      border:1px solid ${C.border}; border-radius:var(--r-md); overflow:hidden; position:relative; }
    /* Kopf: Titel + Steuerung + KPI-Leiste */
    header{ padding:10px 14px 0; position:relative; background:${C.panel};
      border-bottom:1px solid ${C.border}; }
    /* roter Akzentstreifen (Tracker-Signatur) */
    header::before{ content:''; position:absolute; top:0; left:0; right:0; height:3px;
      background:linear-gradient(90deg, var(--accent-strong), var(--accent)); }
    .titlebar{ display:flex; align-items:center; gap:8px;}
    .brand-dot{ width:7px; height:7px; border-radius:50%; background:var(--accent);
      flex-shrink:0; animation:dot-pulse 2.2s ease-in-out infinite;}
    @keyframes dot-pulse{ 0%,100%{ opacity:1; transform:scale(1);} 50%{ opacity:.35; transform:scale(.65);} }
    .title{ font-family:var(--font-mono); font-size:11px; font-weight:600;
      letter-spacing:.12em; text-transform:uppercase; color:var(--accent);}
    .title small{ font-family:var(--font); color:${C.ink2}; font-weight:400;
      text-transform:none; letter-spacing:0; margin-left:10px; font-size:12px;}
    .ctrl{ margin-left:auto; display:flex; gap:6px;}
    .ctrl button{ font:inherit; font-size:13px; line-height:1; padding:5px 8px; border:1px solid ${C.border};
      border-radius:var(--r-sm); background:${C.card}; color:${C.ink2}; cursor:pointer;
      transition:color .15s, border-color .15s;}
    .ctrl button:hover{ border-color:var(--accent); color:${C.ink};}
    .ctrl button.on{ border-color:var(--accent); color:var(--accent);}
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
    .filterpanel{ width:230px;}
    .filterpanel-actions{ display:flex; gap:8px; margin-top:12px;}
    .filterpanel-actions button{ flex:1; padding:7px 0; border-radius:5px; font:inherit; font-size:11.5px;
      font-weight:600; cursor:pointer; border:1px solid ${C.border}; background:transparent; color:${C.ink2};
      transition:all .15s;}
    .filterpanel-actions button:hover{ border-color:${C.accent}; color:${C.ink};}
    .filterpanel-apply{ background:${C.accent} !important; color:#fff !important; border-color:${C.accent} !important;}
    .filterpanel-apply:hover{ filter:brightness(1.08);}
    .kpis{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:10px 0 10px;}
    .kpi{ padding:11px 13px; border:1px solid ${C.border}; border-radius:var(--r-md); background:${C.card};
      cursor:pointer; min-width:0; transition:border-color .15s var(--ease), transform .1s;}
    .kpi:hover{ border-color:var(--accent-border, var(--accent));}
    .kpi:active{ transform:translateY(1px);}
    .kpi .lbl{ font-family:var(--font-mono); font-size:9px; font-weight:600; color:${C.muted};
      text-transform:uppercase; letter-spacing:.15em; display:block;}
    .kpi .val{ display:flex; align-items:baseline; gap:7px; margin:4px 0 5px;}
    .kpi .val b{ font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1;}
    .kpi .d{ font-family:var(--font-mono); font-size:10px; font-weight:600; font-style:normal;
      font-variant-numeric:tabular-nums;}
    .kpi .d.up{ color:${C.good};} .kpi .d.down{ color:${C.bad};}
    .kpi .sub{ font-size:10px; color:${C.muted}; display:block;}
    .kpi svg.spark{ display:block; width:100%; height:26px;}
    .kpi.err .val b{ color:${C.error};}
    /* Tabs */
    /* Kontext-Banner (Kopplung aus dem Strategie-Widget) */
    .ctxbar{ display:flex; align-items:center; gap:10px; padding:7px 16px;
      background:color-mix(in srgb, var(--accent) 12%, ${C.panel}); border-bottom:1px solid var(--border, rgba(255,255,255,.08));
      font-family:var(--font-mono, 'Consolas',monospace); font-size:11px; color:${C.ink};
      animation:ctx-in .35s cubic-bezier(.16,1,.3,1); }
    @keyframes ctx-in{ from{ opacity:0; transform:translateY(-6px);} to{ opacity:1; transform:translateY(0);} }
    .ctxbar .ctx-dot{ width:7px; height:7px; border-radius:50%; background:var(--accent); flex:none;
      box-shadow:0 0 8px var(--accent); }
    .ctxbar b{ color:var(--accent); }
    .ctxbar button{ margin-left:auto; font:inherit; font-size:10px; padding:3px 9px; cursor:pointer;
      border:1px solid var(--border2, rgba(255,255,255,.13)); border-radius:4px; background:transparent; color:${C.ink2}; }
    .ctxbar button:hover{ border-color:var(--accent); color:${C.ink}; }
    /* Manueller Filter im Cockpit: eigene (blaue) Akzentfarbe statt der
       roten Strategie-Farbe, damit auf einen Blick klar ist, welche der
       beiden Filterquellen gerade aktiv ist. */
    .ctxbar.ctxbar-manual{ background:color-mix(in srgb, #2980b9 14%, ${C.panel}); }
    .ctxbar.ctxbar-manual .ctx-dot{ background:#2980b9; box-shadow:0 0 8px #2980b9; }
    .ctxbar.ctxbar-manual b{ color:#5dade2; }
    .ctxbar.ctxbar-manual button:hover{ border-color:#2980b9; }
    nav{ display:flex; gap:2px; padding:0 14px; height:44px; background:${C.panel};
      border-bottom:1px solid ${C.border}; overflow-x:auto; scrollbar-width:none; flex:none;}
    nav::-webkit-scrollbar{ display:none;}
    nav button{ font:inherit; font-size:13px; font-weight:500; padding:0 16px; height:100%;
      border:0; background:transparent; color:${C.muted}; cursor:pointer;
      border-bottom:2px solid transparent; flex:none; white-space:nowrap;
      transition:color .15s, background .15s;}
    nav button:hover{ color:${C.ink2}; background:var(--card2, ${C.card});}
    nav button.on{ color:${C.ink}; border-bottom-color:var(--accent-strong, var(--accent));}
    nav button:focus-visible{ outline:2px solid ${C.lkw}; outline-offset:-2px;}
    main{ flex:1; overflow:auto; padding:12px 14px; position:relative;}
    /* Lade-/Leer-Overlay (aus dem Wareneingang-Tracker übernommen) */
    .state-overlay{ position:absolute; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:14px; background:${C.bg}; z-index:20;}
    .state-overlay[hidden]{ display:none;}
    .state-icon{ font-size:32px; opacity:.4;}
    .state-text{ font-family:var(--font-mono); font-size:11px; letter-spacing:.1em;
      text-transform:uppercase; color:${C.muted};}

    /* ═══ WE-Ladeanimation (1:1 aus dem Wareneingang-Tracker) ═══ */
    .we-loader{ display:flex; flex-direction:column; align-items:center; gap:26px;}
    .we-loader-scene{ position:relative; width:280px; height:90px;}
    /* Fahrbahn */
    .we-road{ position:absolute; bottom:18px; left:0; width:220px; height:3px;
      background:var(--border2); border-radius:2px; overflow:hidden;}
    .we-road-line{ position:absolute; top:1px; left:0; width:100%; height:1px;
      background:repeating-linear-gradient(90deg, ${C.muted} 0, ${C.muted} 8px,
        transparent 8px, transparent 16px);
      animation:we-road-move .6s linear infinite;}
    @keyframes we-road-move{ to{ transform:translateX(-16px);} }
    /* LKW */
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
      width:6px; height:5px; background:${C.bg}; border-radius:1px; opacity:.6;}
    .we-truck-wheel{ position:absolute; bottom:-4px; width:7px; height:7px;
      background:${C.ink2}; border:1.5px solid ${C.muted}; border-radius:50%;
      animation:spin .4s linear infinite;}
    @keyframes spin{ to{ transform:rotate(360deg);} }
    .we-wheel-1{ left:3px;} .we-wheel-2{ left:22px;} .we-wheel-3{ left:38px;}
    /* Tor / Halle */
    .we-gate{ position:absolute; bottom:20px; right:6px; width:44px; height:52px;}
    .we-gate-roof{ width:0; height:0; border-left:24px solid transparent;
      border-right:24px solid transparent; border-bottom:14px solid var(--card2); margin:0 -2px;}
    .we-gate-door{ width:44px; height:38px; background:${C.card};
      border:2px solid var(--card2); border-top:none; border-radius:0 0 2px 2px;
      position:relative; overflow:hidden;}
    .we-gate-door::before{ content:''; position:absolute; top:0; left:0; right:0; height:100%;
      background:repeating-linear-gradient(0deg, var(--card2) 0, var(--card2) 4px,
        transparent 4px, transparent 8px);
      animation:we-door-open 3s ease-in-out infinite;}
    @keyframes we-door-open{
      0%,40%{ transform:translateY(0);} 50%,90%{ transform:translateY(-100%);} 100%{ transform:translateY(0);} }
    /* Prozess-Schritte, die nacheinander aufleuchten */
    .we-steps{ display:flex; gap:14px; flex-wrap:wrap; justify-content:center;}
    .we-step{ display:flex; align-items:center; gap:5px; font-family:var(--font-mono);
      font-size:10px; font-weight:600; letter-spacing:.04em; color:${C.muted};
      opacity:.4; transition:opacity .3s, color .3s;}
    .we-step-dot{ width:7px; height:7px; border-radius:50%; background:var(--border2);
      transition:background .3s, box-shadow .3s;}
    .we-step.we-step-active{ opacity:1; color:${C.ink};}
    .we-step.we-step-active .we-step-dot{ background:var(--accent-strong);
      box-shadow:0 0 8px var(--accent-strong);}
    .we-loader-text{ font-family:var(--font-mono); font-size:12px; color:${C.ink2}; letter-spacing:.03em;}
    .we-dots span{ animation:we-dot-blink 1.4s infinite;}
    .we-dots span:nth-child(2){ animation-delay:.2s;}
    .we-dots span:nth-child(3){ animation-delay:.4s;}
    @keyframes we-dot-blink{ 0%,60%,100%{ opacity:.2;} 30%{ opacity:1;} }
    @media (prefers-reduced-motion:reduce){
      .we-road-line, .we-truck, .we-truck-wheel, .we-gate-door::before, .we-dots span{ animation:none;} }
    .row{ display:flex; gap:14px; flex-wrap:wrap;}
    .card{ flex:1 1 340px; min-width:280px; background:${C.card}; border:1px solid ${C.border};
      border-radius:var(--r-md); padding:12px 14px;}
    /* Tabellen & Grafiken scrollen bei schmaler Einbettung innerhalb der Karte,
       statt das Widget-Layout horizontal zu sprengen */
    .card > div{ overflow-x:auto; }
    /* Diagramme dürfen NICHT über ihre native viewBox-Breite hinaus hochskalieren,
       sonst wächst die Schrift (Teil des viewBox) bei breiter Einbettung mit und
       wird riesig. max-width deckelt die Skalierung; Diagramm bleibt linksbündig. */
    #waterfall svg{ max-width:440px; }
    #scatter svg{ width:100%; max-width:100%; }
    #gantt svg{ width:100%; max-width:100%; }
    #qsc svg{ max-width:520px; }
    #ribbon svg, #cmp svg{ max-width:400px; }
    #heat svg{ max-width:420px; }
    #teams svg{ max-width:400px; }
    #tl svg{ max-width:100%; }
    /* Einblend-Animationen (modernes Aufbauen) */
    @keyframes pk-grow{ from{ transform:scaleX(0); opacity:.3;} to{ transform:scaleX(1); opacity:.92;} }
    @keyframes sc-in{ to{ opacity:var(--o,.6);} }
    .sc-pt{ cursor:pointer; transition:r .1s; }
    .sc-pt:hover{ r:5; }
    @keyframes card-rise{ from{ opacity:0; transform:translateY(10px);} to{ opacity:1; transform:translateY(0);} }
    #main .card{ animation:card-rise .45s cubic-bezier(.16,1,.3,1) both; }
    #main .row .card:nth-child(2){ animation-delay:.07s; }
    #main .row .card:nth-child(3){ animation-delay:.14s; }
    #main .findings .finding{ animation:card-rise .4s cubic-bezier(.16,1,.3,1) both; }
    #main .finding:nth-child(2){ animation-delay:.05s; } #main .finding:nth-child(3){ animation-delay:.1s; }
    #main .finding:nth-child(4){ animation-delay:.15s; }
    .card.grow{ flex:2 1 460px;}
    .card h3{ font-family:var(--font-mono); font-size:9px; font-weight:600; color:${C.muted};
      margin:0 0 12px; text-transform:uppercase; letter-spacing:.15em;
      display:flex; align-items:center; gap:8px;}
    .card h3::after{ content:''; flex:1; height:1px; background:${C.border};}
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
    .outrow{ display:flex; align-items:center; gap:10px; padding:8px 6px; border-bottom:1px solid ${C.border}; cursor:pointer; border-radius:6px; transition:background .12s, transform .1s;}
    .outrow:last-child{ border-bottom:0;}
    .outrow:hover{ background:${C.band}; transform:translateX(2px);}
    .outrow:focus-visible{ outline:2px solid ${C.accent}; outline-offset:1px;}
    .outrow .seg{ width:4px; height:30px; border-radius:2px; flex:none;}
    .outrow .oi{ flex:1; min-width:0;}
    .outrow .oi b{ font-size:12.5px; display:block;}
    .outrow .oi small,.outrow .ov small{ font-size:10.5px; color:${C.muted}; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .outrow .ov{ text-align:right;}
    .outrow .ov b{ font-size:13px; color:${C.accent}; font-variant-numeric:tabular-nums;}
    .outrow-chev{ font-size:20px; color:${C.muted}; flex:none; transition:color .12s, transform .12s; line-height:1;}
    .outrow:hover .outrow-chev{ color:${C.accent}; transform:translateX(3px);}
    .outrow-hint{ font-family:var(--font-mono); font-size:9px; color:${C.muted}; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;}
    /* ══ TE-Seite im Monitoring-Stil ══ */
    .detail-head{ background:${C.card}; border:1px solid ${C.border}; border-radius:var(--r-md);
      padding:16px 18px; margin-bottom:16px; position:relative; overflow:hidden;
      animation:card-rise .4s cubic-bezier(.16,1,.3,1) both;}
    .detail-head::before{ content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:${C.muted};}
    .detail-head.s-eingelagert::before{ background:${C.container||"#27ae60"};}
    .detail-head.s-gebucht::before{ background:#16a085;}
    .detail-head.s-entladen_fertig::before,.detail-head.s-entladen::before{ background:#3d9ad6;}
    .detail-head.s-angedockt::before,.detail-head.s-ankunft::before{ background:#f5b041;}
    .dh-top{ display:flex; align-items:center; gap:12px;}
    .dh-te{ font-family:var(--font-mono); font-size:22px; font-weight:700; letter-spacing:.02em; color:${C.ink};}
    .dh-sub{ font-size:12px; color:${C.ink2}; margin-top:2px;}
    .dh-status{ margin-left:auto; font-family:var(--font-mono); font-size:11px; font-weight:600;
      padding:5px 12px; border-radius:20px; border:1px solid;}
    /* Meilenstein-Kette */
    .ms-chain{ display:flex; align-items:center; gap:0; margin:16px 0 4px; flex-wrap:wrap;}
    .ms-step{ display:flex; flex-direction:column; align-items:center; gap:5px; flex:none;}
    .ms-dot{ width:13px; height:13px; border-radius:50%; border:2px solid ${C.border2||C.border}; background:${C.bg};
      box-sizing:border-box; transition:all .3s;}
    .ms-step.active .ms-dot{ animation:ms-pulse 1.6s ease-in-out infinite;}
    @keyframes ms-pulse{ 0%,100%{ box-shadow:0 0 0 0 currentColor;} 50%{ box-shadow:0 0 0 4px transparent;} }
    .ms-lbl{ font-size:10px; color:${C.ink2}; font-family:var(--font-mono);}
    .ms-step.done .ms-lbl{ color:${C.ink};}
    .ms-sep{ flex:1; height:2px; min-width:24px; background:${C.border}; margin:0 4px 18px; border-radius:1px; transition:background .3s;}
    .ms-sep.done{ background:${C.container||"#27ae60"};}
    .detail-warnbar{ display:flex; flex-wrap:wrap; gap:7px; margin:14px 0 4px;}
    .dwarn{ display:inline-flex; align-items:center; gap:5px; font-size:11px; padding:4px 9px; border-radius:6px; border:1px solid transparent;}
    .dwarn.w-warn{ background:${C.yellowDim||"rgba(245,176,65,.14)"}; border-color:rgba(245,176,65,.35); color:#f5b041;}
    .dwarn.w-krit{ background:${C.redDim||"rgba(231,76,60,.14)"}; border-color:rgba(231,76,60,.4); color:${C.accent};}
    .dwarn.w-info{ background:${C.band}; border-color:${C.border2||C.border}; color:${C.ink2};}
    .dh-facts{ display:grid; grid-template-columns:repeat(4,1fr); gap:11px 18px; margin-top:15px; padding-top:14px; border-top:1px solid ${C.border};}
    @media (max-width:720px){ .dh-facts{ grid-template-columns:repeat(2,1fr);} }
    .dh-fact{ display:flex; flex-direction:column; gap:2px;}
    .dh-fact-l{ font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:${C.muted};}
    .dh-fact-v{ font-size:13px; color:${C.ink}; font-family:var(--font-mono);}
    /* Puls: Bewertungs-Kacheln (eigene Rechnung vs. SAP) */
    .gauges{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px;}
    /* Vorjahresvergleich */
    .yoy-card{ flex:1 1 100%; width:100%; }
    .yoy-grid{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:10px; }
    .yoy-item{ background:${C.band}; border:1px solid ${C.border}; border-radius:9px; padding:10px 12px; }
    .yoy-lbl{ font-family:var(--font-mono); font-size:8.5px; text-transform:uppercase; letter-spacing:.1em; color:${C.text3||C.muted}; }
    .yoy-vals{ display:flex; align-items:baseline; gap:5px; margin-top:4px; }
    .yoy-vals b{ font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; color:${C.ink}; }
    .yoy-u{ font-size:11px; color:${C.ink2}; font-family:var(--font-mono); }
    .yoy-d{ font-family:var(--font-mono); font-size:10px; font-weight:600; margin-left:auto; }
    .yoy-d.up{ color:${C.good||"#27ae60"}; } .yoy-d.down{ color:${C.bad||"#e74c3c"}; }
    .yoy-prev{ font-size:10px; color:${C.muted}; margin-top:3px; font-family:var(--font-mono); }
    .gauge{ background:${C.band}; border:1px solid ${C.border}; border-radius:10px; padding:12px 10px; text-align:center;}
    .gauge .gv{ font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; color:${C.ink}; line-height:1;}
    .gauge .gv span{ font-size:13px; font-weight:500; margin-left:1px;}
    .gauge .gl{ font-size:11px; color:${C.ink}; margin-top:5px; font-weight:600;}
    .gauge .gs{ font-size:9px; color:${C.muted}; margin-top:2px; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.06em;}
    /* Puls: Durchsatz */
    .tp-kpis{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;}
    .tp-k{ flex:1 1 80px; background:${C.band}; border-radius:8px; padding:9px 11px;}
    .tp-k b{ font-size:19px; font-weight:700; font-variant-numeric:tabular-nums; display:block; line-height:1.1;}
    .tp-k small{ font-size:9.5px; color:${C.muted}; text-transform:uppercase; letter-spacing:.05em;}
    .tp-segs{ display:flex; flex-direction:column; gap:6px;}
    .tp-seg{ display:flex; align-items:center; gap:9px; font-size:11.5px;}
    .tp-seg .tp-lbl{ width:88px; flex:none; color:${C.ink2};}
    .tp-seg .tp-bar{ flex:1; height:8px; background:${C.band}; border-radius:4px; overflow:hidden;}
    .tp-seg .tp-bar i{ display:block; height:100%; border-radius:4px;}
    .tp-seg .tp-n{ width:34px; text-align:right; font-variant-numeric:tabular-nums; color:${C.muted}; font-size:11px;}
    /* Prozesskette: Legende */
    .pk-legend{ display:flex; flex-wrap:wrap; gap:14px; margin-bottom:12px; align-items:center;}
    .pk-hint-row{ font-size:10.5px; color:${C.muted}; margin-bottom:8px;}
    /* Ausführliche Farblegende (einklappbar) */
    .pk-legend-full{ display:flex; flex-direction:column; gap:8px;}
    .pk-legend-title{ margin-bottom:4px;}
    .pk-legend-title b{ display:block; font-size:12.5px; color:${C.ink}; margin-bottom:3px;}
    .pk-legend-title span{ font-size:10.5px; color:${C.ink2}; line-height:1.5;}
    .pk-legend-row{ display:flex; align-items:flex-start; gap:8px; padding:4px 0;}
    .pk-legend-row i{ width:11px; height:11px; border-radius:3px; flex:none; margin-top:2px;}
    .pk-legend-row b{ display:block; font-size:11.5px; color:${C.ink};}
    .pk-legend-row span{ font-size:10.5px; color:${C.ink2}; line-height:1.4;}
    .pk-legend-note{ font-size:10px; color:${C.warn}; padding-top:6px; border-top:1px solid ${C.border};}
    /* Rich-Hover-Tooltip Prozesskette */
    .pk-tooltip{ position:absolute; z-index:50; max-width:260px; padding:9px 11px; border-radius:8px;
      background:${C.panel}; border:1px solid ${C.border2}; box-shadow:0 8px 24px rgba(0,0,0,.4);
      font-size:11px; color:${C.ink}; pointer-events:none; line-height:1.5;}
    .pk-tooltip b{ color:${C.ink};}
    .pk-tip-row{ color:${C.ink2}; margin-top:2px;}
    .pk-tip-info{ margin-top:5px; padding-top:5px; border-top:1px solid ${C.border}; color:${C.muted}; font-size:10px;}
    .pk-tip-warn{ color:${C.warn};}
    .pk-lg{ display:flex; align-items:center; gap:5px; font-size:10.5px; color:${C.ink2}; font-family:var(--font-mono);}
    .pk-lg i{ width:11px; height:9px; border-radius:2px;}
    .pk-hint{ margin-left:auto; font-size:10px; color:${C.outlier};}
    .pk-hit:hover{ fill:${C.band} !important; }
    /* Treiber: Balkenzeilen */
    .drv-row{ display:flex; align-items:center; gap:9px; padding:5px 0; font-size:11.5px;}
    .drv-lbl{ width:130px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${C.ink};}
    .drv-bar{ flex:1; height:9px; background:${C.band}; border-radius:5px; overflow:hidden;}
    .drv-bar i{ display:block; height:100%; background:${C.accent}; border-radius:5px; opacity:.75;}
    .drv-med{ width:52px; text-align:right; font-variant-numeric:tabular-nums; color:${C.ink}; font-weight:600;}
    .drv-n{ width:78px; text-align:right; font-size:10px; color:${C.muted};}
    /* ══ Schicht-Analyse ══ */
    .sch-cols{ display:flex; gap:12px;}
    .sch-col{ flex:1; background:${C.band}; border:1px solid ${C.border}; border-radius:10px; padding:12px 14px 10px;}
    .sch-col .sch-h{ font-weight:700; font-size:13px; margin-bottom:10px;}
    .sch-kpis{ display:grid; grid-template-columns:repeat(2,1fr); gap:9px;}
    .sch-kpis > div b{ font-size:18px; font-weight:700; font-variant-numeric:tabular-nums; display:block; line-height:1.1; overflow:hidden; text-overflow:ellipsis;}
    .sch-kpis > div small{ font-size:9px; color:${C.muted}; text-transform:uppercase; letter-spacing:.05em;}
    .sch-ph-row{ display:flex; align-items:center; gap:10px; padding:5px 0;}
    .sch-ph-lbl{ width:96px; flex:none; font-size:11.5px; color:${C.ink};}
    .sch-ph-bars{ flex:1; display:flex; flex-direction:column; gap:3px;}
    .sch-ph-bar{ display:flex; align-items:center; gap:7px; height:11px;}
    .sch-ph-bar i{ display:block; height:11px; border-radius:3px; min-width:2px; transition:width .5s cubic-bezier(.16,1,.3,1);}
    .sch-ph-bar span{ font-size:10px; color:${C.ink2}; font-variant-numeric:tabular-nums; white-space:nowrap;}
    .sch-ph-legend{ display:flex; gap:14px; margin-top:8px; padding-top:8px; border-top:1px solid ${C.border};}
    .sch-ph-legend span{ display:flex; align-items:center; gap:5px; font-size:10px; color:${C.ink2}; font-family:var(--font-mono);}
    .sch-ph-legend i{ width:9px; height:9px; border-radius:2px;}
    .sch-q-row{ display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid ${C.border};}
    .sch-q-row:last-child{ border-bottom:0;}
    .sch-q-name{ display:flex; align-items:center; gap:6px; width:110px; flex:none; font-size:12px; font-weight:600;}
    .sch-q-name i{ width:9px; height:9px; border-radius:2px;}
    .sch-q-metric{ flex:1; text-align:center;}
    .sch-q-v{ font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; display:block;}
    .sch-q-metric small{ font-size:9px; color:${C.muted}; text-transform:uppercase; letter-spacing:.05em;}
    /* Detail-Zeitstrahl */
    .tl-span{ font-size:11px; color:${C.ink2}; margin-top:8px;}
    .tl-span b{ color:${C.ink};}
    .tl-chips{ display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:8px;}
    .tl-chip{ display:flex; align-items:center; gap:5px; font-size:10px; color:${C.ink2}; font-family:var(--font-mono);}
    .tl-chip i{ width:9px; height:9px; border-radius:2px; flex:none;}
    svg text{ font-family:inherit;}
    /* Tabelle */
    table{ width:100%; border-collapse:collapse; font-size:11.5px; margin-top:6px;}
    th{ text-align:left; color:${C.muted}; font-weight:600; padding:4px 6px; border-bottom:1px solid ${C.border}; font-size:10.5px; text-transform:uppercase; letter-spacing:.3px;}
    td{ padding:4px 6px; border-bottom:1px solid ${C.border}; font-variant-numeric:tabular-nums;}
    tr.sel td, tbody tr:hover td{ background:${C.band}; cursor:pointer;}
    .tag{ display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; color:#fff;}
    .empty{ color:${C.muted}; font-size:12px; padding:24px; text-align:center;}
    .hidden{ display:none !important; }
    /* Einklappbare Sekundärbereiche (Auffällige TEs, Vorjahresvergleich) */
    .collapse-toggle{ display:flex; align-items:center; gap:6px; width:100%; text-align:left;
      font:inherit; font-size:12px; font-weight:600; color:${C.ink2}; background:transparent;
      border:1px solid ${C.border}; border-radius:8px; padding:8px 12px; cursor:pointer; margin-bottom:6px;
      transition:border-color .15s, color .15s;}
    .collapse-toggle:hover{ border-color:${C.accent}; color:${C.ink};}
    .collapse-arrow{ font-size:10px; color:${C.muted}; width:10px; display:inline-block;}
    /* Datenqualität & Abdeckung */
    .dq-summary{ font-size:11.5px; color:${C.ink2}; margin-bottom:10px;}
    .dq-summary b{ color:${C.ink};}
    .dq-grid{ display:flex; flex-direction:column; gap:6px;}
    .dq-row{ display:grid; grid-template-columns:150px 1fr 40px 56px; align-items:center; gap:8px;}
    .dq-label{ font-size:11px; color:${C.ink2};}
    .dq-track{ height:6px; border-radius:3px; background:${C.band}; overflow:hidden;}
    .dq-track i{ display:block; height:100%; border-radius:3px;}
    .dq-pct{ font-family:var(--font-mono); font-size:11px; font-weight:700; text-align:right;}
    .dq-n{ font-family:var(--font-mono); font-size:9.5px; color:${C.muted}; text-align:right;}
    /* Ebenen-Badge (TE / Position / TE + Position / BW-Kennzahl) neben Titeln */
    .data-level{ font-family:var(--font-mono); font-size:8.5px; font-weight:700; text-transform:uppercase;
      letter-spacing:.05em; color:${C.muted}; background:${C.band}; border:1px solid ${C.border};
      border-radius:20px; padding:2px 7px; margin-left:8px; vertical-align:middle;}
    /* Spediteur-/Lieferanten-Ranking */
    .rank-list{ display:flex; flex-direction:column; gap:2px;}
    .rank-row{ display:grid; grid-template-columns:20px 1fr 90px 46px auto; align-items:center; gap:10px;
      padding:8px 6px; border-bottom:1px solid ${C.border};}
    .rank-row:last-child{ border-bottom:0;}
    .rank-drillable{ cursor:pointer; border-radius:6px; transition:background .12s;}
    .rank-drillable:hover{ background:${C.band};}
    .rank-no{ font-family:var(--font-mono); font-size:10px; color:${C.muted}; text-align:right;}
    .rank-name{ font-size:12.5px; color:${C.ink}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .rank-track{ height:7px; border-radius:4px; background:${C.band}; overflow:hidden;}
    .rank-track i{ display:block; height:100%; border-radius:4px;}
    .rank-pct{ font-family:var(--font-mono); font-size:12px; font-weight:700; text-align:right;}
    .rank-n{ font-size:10px; color:${C.muted}; text-align:right; line-height:1.4; grid-column:1/-1;
      padding-left:30px;}
    .rank-severity{ font-size:9.5px; color:${C.muted}; grid-column:1/-1; padding-left:30px;}
    /* Spediteur-Drilldown */
    .drill-card{ margin-top:10px;}
    .drill-head{ display:flex; align-items:center; gap:10px; margin-bottom:6px;}
    .drill-head h3{ flex:1;}
    .drill-close{ font:inherit; font-size:11px; padding:5px 10px; border-radius:5px; border:1px solid ${C.border};
      background:transparent; color:${C.ink2}; cursor:pointer;}
    .drill-close:hover{ border-color:${C.accent}; color:${C.ink};}
    .drill-note{ font-size:11px; color:${C.ink2}; margin-bottom:10px; line-height:1.5;}
    .drill-summary{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;}
    .drill-chip{ font-size:10.5px; color:${C.ink2}; background:${C.band}; border:1px solid ${C.border};
      border-radius:20px; padding:4px 10px;}
    .drill-chip b{ color:${C.ink};}
    .drill-table{ width:100%; border-collapse:collapse; font-size:11.5px;}
    .drill-table th{ text-align:left; padding:6px 8px; color:${C.muted}; font-family:var(--font-mono);
      font-size:9.5px; text-transform:uppercase; border-bottom:1px solid ${C.border};}
    .drill-table td{ padding:6px 8px; border-bottom:1px solid ${C.border}; color:${C.ink};}
    /* Warengruppenanalyse */
    .hwg-list{ display:flex; flex-direction:column; gap:6px;}
    .hwg-row{ display:grid; grid-template-columns:140px 1fr 56px auto; align-items:center; gap:10px; padding:4px 0;}
    .hwg-name{ font-size:12px; color:${C.ink}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .hwg-track{ height:8px; border-radius:4px; background:${C.band}; overflow:hidden;}
    .hwg-track i{ display:block; height:100%; border-radius:4px; background:${C.accent};}
    .hwg-hours{ font-family:var(--font-mono); font-size:11.5px; font-weight:700; color:${C.ink}; text-align:right;}
    .hwg-meta{ font-size:9.5px; color:${C.muted}; white-space:nowrap;}
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
        <span class="brand-dot"></span>
        <div class="title">WE Prozess-Cockpit <small id="sub"></small></div>
        <div class="ctrl">
          <button id="btnFilter" title="Zeitraum &amp; Ladestelle manuell filtern">⏱</button>
          <button id="btnTheme" title="Dark-/Light-Mode umschalten">◐</button>
          <button id="btnCfg" title="Kalibrierung">⚙</button>
        </div>
      </div>
      <div class="cfg filterpanel" id="filterpanel" hidden>
        <h4>Zeitraum &amp; Segment</h4>
        <div class="hint">Überschreibt die Auswahl aus dem Strategie-Widget mit einem eigenen Filter auf die Ankunftszeit.</div>
        <label>Von</label>
        <input type="date" id="fltVon">
        <label>Bis</label>
        <input type="date" id="fltBis">
        <label>Ladestelle</label>
        <select id="fltSeg">
          <option value="">Alle Segmente</option>
          <option value="Container">Container</option>
          <option value="Landverkehr">Landverkehr</option>
          <option value="BSL">BSL</option>
          <option value="Sonstige">Sonstige</option>
        </select>
        <div class="filterpanel-actions">
          <button id="fltApply" class="filterpanel-apply">Anwenden</button>
          <button id="fltReset">Zurücksetzen</button>
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
          <option value="segment">Je Ladestelle (LKW / Container / BSL)</option>
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
    <main id="main">
      <div class="state-overlay" id="state-loading">
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
        </div>
      </div>
      <div class="state-overlay" id="state-empty" hidden>
        <div class="state-icon">📦</div>
        <div class="state-text">Keine Daten — Data Binding zuweisen</div>
      </div>
      <div id="views"></div>
    </main>
  </div>`;

  const fmtH = (h) => (h == null || isNaN(h)) ? "–" :
    Math.abs(h) >= 48 ? (h / 24).toFixed(1) + " d" : h.toFixed(1) + " h";
  // Menschenlesbare Dauer für Hover-Tooltips, z.B. "1 Std 24 Min"
  const fmtHumanDauer = (hDec) => {
    if (hDec == null || isNaN(hDec)) return "–";
    const totalMin = Math.round(Math.abs(hDec) * 60);
    const std = Math.floor(totalMin / 60), min = totalMin % 60;
    const sign = hDec < 0 ? "-" : "";
    if (std === 0) return `${sign}${min} Min`;
    if (min === 0) return `${sign}${std} Std`;
    return `${sign}${std} Std ${min} Min`;
  };
  const fmtDT = (d) => d instanceof Date && !isNaN(d) ? d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–";
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
  /* Merkmalswerte aus SAC: zusätzlich reine Nullen-/Rauten-Folgen als leer werten
     (BW-Platzhalter). Kennzahlen laufen über readVal und sind davon nicht betroffen. */
  const isNullTok = (v) => {
    if (v == null) return true;
    const s = String(v).trim();
    return NULLS.has(s) || /^0+$/.test(s) || /^#+$/.test(s);
  };
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
        // Bewusst NUR Token-Prüfung: "0" ist eine gültige Kennzahl, kein Leerwert.
        if (n != null && !NULLS.has(String(n).trim())) return Number(n);
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
      // Anlieferung innerhalb der TE. Eine TE kann mehrere Anlieferungen
      // enthalten (SAP-EWM-Hierarchie TE -> Anlieferung -> Position).
      // Mehrere Feed-Namen toleriert, je nach BW-Modellbezeichnung.
      anlieferung:        readCode(row, "dimension_anlieferung", "dimension_anlieferungsnummer",
                                   "dimension_anlieferungsnr", "dimension_lieferung",
                                   "dimension_lieferungsnummer", "dimension_lieferungsnr",
                                   "dimension_lieferbeleg", "dimension_inbound_delivery"),
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
      belegart:           readCode(row, "dimension_belegart"),
      lagertor:           readDim(row, "dimension_lagertor"),
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
      // Fertigstellung ist der entscheidende Stempel für die Schicht-Paletten-
      // Auswertung. Fällt auf Einlagerung zurück, falls das BW-Modell noch
      // keinen eigenen Fertigstellungs-Feed liefert (Kompatibilität).
      ts_fertigstellung:  readCode(row, "dimension_ts_fertigstellung", "dimension_fertigstellung", "dimension_ts_einlagerung"),
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
      // Schicht/KW der Fertigstellung: eigener Feed, sonst Einlagerungs-Fallback
      sh_fertigstellung:  readCode(row, "dimension_schicht_fertigstellung", "dimension_schicht_einlagerung"),
      kw_fertigstellung:  readCode(row, "dimension_kw_fertigstellung", "dimension_kw_einlagerung"),
      // Kennzahlen
      menge_ist:          readVal(row, "value_menge_ist"),
      menge_soll:         readVal(row, "value_menge_soll"),
      pa1:                readVal(row, "value_pa1"),
      anzahl_mitarbeiter: readVal(row, "value_anzahl_mitarbeiter"),
      // Neue Januar-Felder ------------------------------------------------
      belegart:           readCode(row, "dimension_belegart"),
      containerdepot:     readDim(row, "dimension_containerdepot"),
      depotspediteur:     readDim(row, "dimension_depotspediteur"),
      // Seetransport-Vorkette (nur Container befüllt)
      ts_verschifft:      readCode(row, "dimension_ts_verschifft"),
      ts_hafen:           readCode(row, "dimension_ts_hafen"),
      ts_verzollung:      readCode(row, "dimension_ts_verzollung"),
      ts_depot:           readCode(row, "dimension_ts_depot"),
      ts_depot_anf:       readCode(row, "dimension_ts_depot_anf"),
      // Fertige SAP-Bewertungen (Gegenprobe, nicht Rechenbasis)
      sap_otif:           readCode(row, "dimension_sap_otif"),
      sap_puenktlich:     readCode(row, "dimension_sap_puenktlich"),
      sap_vollstaendig:   readCode(row, "dimension_sap_vollstaendig"),
      // Business-Kennzeichen
      knz_container:      readCode(row, "dimension_knz_container"),
      knz_shuttle:        readCode(row, "dimension_knz_shuttle"),
      knz_direktfahrt:    readCode(row, "dimension_knz_direktfahrt"),
      knz_qualitaet:      readCode(row, "dimension_knz_qualitaet"),
      // Neue Messgrößen
      gewicht:            readVal(row, "value_gewicht"),
      volumen:            readVal(row, "value_volumen"),
      wert_eur:           readVal(row, "value_wert_eur"),
      anzahl_kollis:      readVal(row, "value_anzahl_kollis"),
      ep_tauschfaehig:    readVal(row, "value_ep_tauschfaehig"),
    }));
  }

  class WECockpit extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.innerHTML = TPL;
      this._props = {
        madThreshold: 3.5, teamEvenFrueh: "Team A", teamOddFrueh: "Team B",
        baselineMode: "segment", toleranzMin: 30, theme: "dark", defaultView: "puls",
        // Mindestdatenbasis für die Rankings: verhindert, dass sehr kleine
        // Stichproben (z.B. 1 TE) ein Top-/Flop-Ranking dominieren.
        minCarrierTe: 10, minSupplierPos: 20,
      };
      this._rows = null; this._model = null; this._mode = "puls"; this._detail = null;
      this._loaderTimer = null;
      // Sekundäre Analysebereiche der Prozessübersicht: standardmäßig
      // eingeklappt, damit die Hauptseite nicht überladen wirkt.
      this._showTopOutliers = false;
      this._showYoY = false;
      this._showPkLegend = false; // Prozesskette: Farblegende standardmäßig eingeklappt
      this._applyTheme();
      this._startLoaderSteps(); // Ladeanimation läuft ab dem ersten Moment
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
      /* ---- In-Widget-Steuerung: Theme + Kalibrierung + Filter ---- */
      const $ = (id) => this._shadow.getElementById(id);
      $("btnTheme").addEventListener("click", () =>
        this.setTheme(this._props.theme === "dark" ? "light" : "dark"));
      // Nur eines der beiden Panels (Kalibrierung / Filter) gleichzeitig offen
      const closePanels = () => {
        $("cfg").hidden = true; $("btnCfg").classList.remove("on");
        $("filterpanel").hidden = true; $("btnFilter").classList.remove("on");
      };
      $("btnCfg").addEventListener("click", () => {
        const wasOpen = !$("cfg").hidden;
        closePanels();
        if (!wasOpen) { $("cfg").hidden = false; $("btnCfg").classList.add("on"); this._syncCfg(); }
      });
      $("btnFilter").addEventListener("click", () => {
        const wasOpen = !$("filterpanel").hidden;
        closePanels();
        if (!wasOpen) { $("filterpanel").hidden = false; $("btnFilter").classList.add("on"); this._syncFilterPanel(); }
      });
      $("fltApply").addEventListener("click", () => {
        const von = $("fltVon").value, bis = $("fltBis").value, seg = $("fltSeg").value;
        if (!von && !bis && !seg) return;
        this.setManualFilter(von, bis, seg);
      });
      $("fltReset").addEventListener("click", () => {
        $("fltVon").value = ""; $("fltBis").value = ""; $("fltSeg").value = "";
        this.clearPeriodFilter();
        try { this.dispatchEvent(new CustomEvent("onContextClear", { detail: {} })); } catch (e) {}
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

    /* Filterfelder mit dem aktuellen Kontext vorbelegen (falls schon ein
       manueller Filter oder eine Strategie-Periode aktiv ist). */
    _syncFilterPanel() {
      const $ = (id) => this._shadow.getElementById(id);
      const ctx = this._periodContext;
      if (ctx && ctx.manual) {
        $("fltVon").value = ctx.von || "";
        $("fltBis").value = ctx.bis || "";
        $("fltSeg").value = (ctx.segment && ctx.segment !== "Gesamt") ? ctx.segment : "";
      }
    }

    /* ---- SAC-Lifecycle ---- */
    onCustomWidgetAfterUpdate(changed) {
      Object.assign(this._props, changed || {});
      if (changed && "theme" in changed) this._applyTheme();
      if (changed && "defaultView" in changed && MODES.some((m) => m.id === changed.defaultView))
        this._mode = changed.defaultView;
      this._syncCfg();
      const binding = changed && (changed.myDataSource
        || (changed.dataBindings && changed.dataBindings.myDataSource));
      if (binding) { this.myDataSource = binding; return; }
      this._rebuild();
    }
    onCustomWidgetResize() { this._render(); }
    onCustomWidgetDestroy() {}

    /* ---- SAC DataSource-Setter (Konvention wie im WE-Tracker) ----
       Loader darf nie hängen bleiben: sobald Daten vorliegen (oder die
       Bindung final antwortet), Ladezustand verlassen — auch bei 0 Zeilen. */
    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;
      if (!dataBinding) return;
      const st = dataBinding.state;
      const hasData = Array.isArray(dataBinding.data);
      if (!hasData && (st === "loading" || st === "pending" || st === "waiting")) {
        this._rows = null; this._model = null; this._render(); return;
      }
      try {
        this._rows = ingestRows(dataBinding.data ?? []);
      } catch (e) {
        console.warn("[WE-Cockpit] Datenaufbereitung fehlgeschlagen —", e && e.message);
        this._rows = [];
      }
      this._rebuild();
    }

    /* Eigene Datenquelle der Widget-Bindung holen (gleiches Muster wie
       this.dataBindings.getDataBinding('myDataSource').getDataSource()
       im GeoMapWidget) — NICHT auf einer fremden Tabelle/Chart aufrufen,
       sondern auf der eigenen Bindung dieses Custom Widgets. */
    _getDataSource() {
      try {
        return this.dataBindings?.getDataBinding("myDataSource")?.getDataSource() ?? null;
      } catch (e) {
        console.warn("[WE-Cockpit] DataSource nicht verfügbar:", e);
        return null;
      }
    }

    /* "2026-W03" -> Kandidaten für das BW-Memberformat der Kalenderwoche.
       Wir kennen nicht sicher, ob das Modell "03.2026" (formatiertes Label)
       oder "202603" (6-stellige technische ID Jahr+Woche ohne Trennzeichen)
       als Member-Schlüssel erwartet — deshalb liefern wir beide Varianten
       als IN-Filter-Werte; BW ignoriert die nicht passende automatisch. */
    _periodeToKWCandidates(periode) {
      if (!periode) return [];
      const i = String(periode).indexOf("-W");
      if (i === -1) return [];
      const jahr = periode.substring(0, i);
      const kw = periode.substring(i + 2);
      return [`${kw}.${jahr}`, `${jahr}${kw}`];
    }

    /* ---- Public API (aufrufbar via SAC-Script) ---- */
    /* refreshData() zeigt bewusst sofort wieder die Ladeanimation (statt
       stumm auf die alten Daten zu warten), damit ein Reload genauso
       Feedback gibt wie der allererste Ladevorgang. */
    refreshData() {
      if (!this._dataBinding) return;
      this._rows = null; this._model = null;
      this._render();
      this.myDataSource = this._dataBinding;
    }
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

    /* ── Kopplung mit dem Strategie-Widget ────────────────────────────────
       Wird vom Story-Skript aufgerufen, NACHDEM der Datenquellen-Filter auf
       den gewählten Zeitraum gesetzt wurde. Zeigt einen Kontext-Banner und
       merkt sich Periode/Segment für die Anzeige. Das eigentliche Filtern
       (schnelles Nachladen nur dieser Periode) passiert in SAC an der
       Datenquelle — nicht hier im Widget. */
    setPeriodContext(periode, segment, vorjahr) {
      this._periodContext = { periode: periode || "", segment: segment || "", vorjahr: vorjahr || "" };
      this._renderContextBanner();
      if (this._model && this._mode === "puls") this._render();
    }

    /* Wird vom Story-Skript mit den Rohwerten aus dem Strategie-Widget
       aufgerufen: StrategieWidget.getSelectedPeriod/Segment/From/To/
       PriorYearPeriod(). Setzt den Query-Filter der EIGENEN Datenquelle
       dieses Widgets (Periode/Kalenderwoche + Ladestelle), löscht dabei
       einen evtl. vorher aktiven Default-Filter auf derselben Dimension,
       und stößt so eine neue BW-Abfrage nur für diesen Zeitraum an.
       Sobald die Daten zurückkommen, feuert SAC erneut `set myDataSource`. */
    setPeriodFilter(periode, segment, vonISO, bisISO, vorjahr) {
      const KW_DIM = "dimension_kw_ankunft";   // technischen Namen ggf. anpassen
      const LADE_DIM = "dimension_ladestelle"; // technischen Namen ggf. anpassen
      const TS_DIM = "dimension_ts_ankunft";   // technischen Namen ggf. anpassen
      const ds = this._getDataSource();
      if (!ds) {
        console.warn("[WE-Cockpit] setPeriodFilter: keine DataSource — nur Kontext gesetzt, kein Requery.");
        this.setPeriodContext(periode, segment, vorjahr);
        return false;
      }

      // Einen evtl. aktiven manuellen Datumsbereich-Filter entfernen — die
      // Strategie-Auswahl hat wieder Vorrang, bis der Nutzer erneut manuell
      // filtert.
      try { ds.removeDimensionFilter(TS_DIM); } catch (e) {}

      // Alten Filter auf der Kalenderwochen-Dimension entfernen (egal ob
      // vorher ein Default-Zeitraum oder eine andere Periode aktiv war).
      try { ds.removeDimensionFilter(KW_DIM); } catch (e) { /* war ggf. nicht gesetzt */ }

      const kwCandidates = this._periodeToKWCandidates(periode);
      if (kwCandidates.length) {
        try { ds.setDimensionFilter(KW_DIM, kwCandidates); }
        catch (e) { console.warn("[WE-Cockpit] KW-Filter fehlgeschlagen:", e && e.message); }
      }

      // Segment-Filter: nur setzen wenn nicht "Gesamt"/leer; sonst entfernen.
      try { ds.removeDimensionFilter(LADE_DIM); } catch (e) {}
      if (segment && segment !== "Gesamt") {
        const werte = SEGMENT_TO_LADESTELLE[segment] || [segment];
        try { ds.setDimensionFilter(LADE_DIM, werte); }
        catch (e) { console.warn("[WE-Cockpit] Segment-Filter fehlgeschlagen:", e && e.message); }
      }

      // Kontext-Banner sofort zeigen; die eigentlichen Zeilen (myDataSource)
      // kommen asynchron nach, sobald BW die neue Abfrage beantwortet hat.
      this.setPeriodContext(periode, segment, vorjahr);
      return true;
    }

    /* "2026-01-13" -> "20260113" (BW-Datumsformat, ohne Trennzeichen) */
    _isoToBW(iso) {
      if (!iso || iso.length < 10) return null;
      return iso.substring(0, 4) + iso.substring(5, 7) + iso.substring(8, 10);
    }

    /* Manueller Filter direkt im Cockpit: überschreibt die aus dem
       Strategie-Widget übernommene Periode mit einem frei gewählten
       Datumsbereich (auf Tagesbasis statt Kalenderwoche) und/oder Segment.
       von/bis sind ISO-Daten "YYYY-MM-DD" aus den <input type=date>-Feldern,
       leer erlaubt (dann bleibt der Zeitfilter unverändert). segment ist
       "" (alle) oder einer von Container/Landverkehr/BSL/Sonstige. */
    setManualFilter(vonISO, bisISO, segment) {
      const KW_DIM = "dimension_kw_ankunft";
      const LADE_DIM = "dimension_ladestelle";
      const TS_DIM = "dimension_ts_ankunft";
      const ds = this._getDataSource();
      if (!ds) {
        console.warn("[WE-Cockpit] setManualFilter: keine DataSource — nur Kontext gesetzt, kein Requery.");
      } else {
        // Ein Datumsbereich ersetzt die Kalenderwochen-Filterung der
        // Strategie-Kopplung vollständig (präziser, tagesgenau statt KW).
        try { ds.removeDimensionFilter(KW_DIM); } catch (e) {}
        const vonBW = this._isoToBW(vonISO), bisBW = this._isoToBW(bisISO);
        if (vonBW || bisBW) {
          try { ds.removeDimensionFilter(TS_DIM); } catch (e) {}
          try { ds.setDimensionFilterRange(TS_DIM, vonBW || bisBW, bisBW || vonBW); }
          catch (e) { console.warn("[WE-Cockpit] Datumsfilter fehlgeschlagen:", e && e.message); }
        }
        try { ds.removeDimensionFilter(LADE_DIM); } catch (e) {}
        if (segment) {
          const werte = SEGMENT_TO_LADESTELLE[segment] || [segment];
          try { ds.setDimensionFilter(LADE_DIM, werte); }
          catch (e) { console.warn("[WE-Cockpit] Segment-Filter fehlgeschlagen:", e && e.message); }
        }
      }
      // Banner als "manueller Filter" kennzeichnen (eigene Optik, kein
      // Bezug mehr auf die Strategie-Periode).
      const fmtD = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso :
        d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }); };
      this._periodContext = {
        periode: "", segment: segment || "", vorjahr: "",
        manual: true, von: vonISO || "", bis: bisISO || "",
        label: [vonISO || bisISO ? `${fmtD(vonISO) || "…"} – ${fmtD(bisISO) || "…"}` : "", segment].filter(Boolean).join(" · "),
      };
      this._renderContextBanner();
      if (this._model && this._mode === "puls") this._render();
      // Filter-Panel wieder einklappen, sobald angewendet.
      const p = this._shadow.getElementById("filterpanel");
      if (p) { p.hidden = true; this._shadow.getElementById("btnFilter").classList.remove("on"); }
      return !!ds;
    }

    /* Gegenstück beim Schließen der Detailansicht: Periode/Segment-Filter
       der eigenen Datenquelle entfernen und den Kontext-Banner zurücksetzen
       (nutzt die bestehende clearPeriodContext() für den UI-Teil). Optional
       könnt ihr hier einen festen Default-Zeitraum erneut setzen. */
    clearPeriodFilter() {
      const KW_DIM = "dimension_kw_ankunft";
      const LADE_DIM = "dimension_ladestelle";
      const TS_DIM = "dimension_ts_ankunft";
      const ds = this._getDataSource();
      if (ds) {
        try { ds.removeDimensionFilter(KW_DIM); } catch (e) {}
        try { ds.removeDimensionFilter(LADE_DIM); } catch (e) {}
        try { ds.removeDimensionFilter(TS_DIM); } catch (e) {}
        // Beispiel Default-Zeitraum (an euer Modell anpassen):
        // try { ds.setDimensionFilter(KW_DIM, ["05.2026"]); } catch (e) {}
      }
      this.clearPeriodContext();
    }
    /** Vorjahresvergleich setzen (Array oder JSON-String aus dem Strategie-Widget). */
    setYoYComparison(data) {
      try { this._yoy = typeof data === "string" ? JSON.parse(data) : (data || []); }
      catch (e) { this._yoy = []; }
      if (this._model && this._mode === "puls") this._render();
    }
    /** Kontext entfernen (zurück zur Default-/Vortagsansicht). */
    clearPeriodContext() {
      this._periodContext = null;
      this._yoy = null;
      this._renderContextBanner();
    }
    /** Für SAC-Scripting lesbar. */
    getPeriodContext() {
      return this._periodContext ? this._periodContext.periode : "";
    }

    /* Eintritts-Animation: wird aufgerufen, wenn das Widget als Detail-Ansicht
       sichtbar wird (aus dem Strategie-Widget heraus). Der Inhalt baut sich
       gestaffelt auf. In SAC ruft das Story-Skript dies nach setVisible(true). */
    enterDetail() {
      const root = this._shadow.querySelector(".wrap, .root");
      if (root) {
        root.classList.remove("enter");
        void root.getBoundingClientRect(); // Reflow
        root.classList.add("enter");
      }
      // Inhaltsblöcke gestaffelt einblenden
      const blocks = this._shadow.querySelectorAll("#kpis .kpi, #views > *");
      blocks.forEach((el, i) => {
        el.style.opacity = "0";
        el.style.transform = "translateY(8px)";
        el.style.transition = `opacity .4s ease ${i * 55}ms, transform .5s cubic-bezier(.16,1,.3,1) ${i * 55}ms`;
        requestAnimationFrame(() => { el.style.opacity = ""; el.style.transform = ""; });
      });
    }

    _renderContextBanner() {
      let bar = this._shadow.getElementById("ctxbar");
      const ctx = this._periodContext;
      if (!ctx) { if (bar) bar.remove(); return; }
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "ctxbar";
        bar.className = "ctxbar";
        const nav = this._shadow.getElementById("tabs");
        if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav.nextSibling);
        else this._shadow.querySelector(".wrap, .root, body")?.prepend(bar);
      }
      bar.classList.toggle("ctxbar-manual", !!ctx.manual);
      if (ctx.manual) {
        const label = ctx.label || "Eigener Filter";
        bar.innerHTML = `<span class="ctx-dot ctx-dot-manual"></span>
          <span>Manueller Filter: <b>${esc(label)}</b></span>
          <button id="ctxclear" title="Filter zurücksetzen">Zurücksetzen ✕</button>`;
      } else {
        const seg = ctx.segment && ctx.segment !== "Gesamt" ? ` · ${esc(ctx.segment)}` : "";
        bar.innerHTML = `<span class="ctx-dot"></span>
          <span>Zeitraum aus Strategie: <b>${esc(ctx.periode)}</b>${seg}</span>
          <button id="ctxclear" title="Filter zurücksetzen">Zurücksetzen ✕</button>`;
      }
      const btn = this._shadow.getElementById("ctxclear");
      if (btn) btn.onclick = () => {
        this.clearPeriodFilter();
        // Story-Skript kann zusätzlich den Datenquellen-Filter zurücksetzen;
        // dafür feuern wir ein Event, auf das die Story hören kann.
        try { this.dispatchEvent(new CustomEvent("onContextClear", { detail: {} })); } catch (e) {}
      };
    }

    /** Lässt die Prozess-Schritte der Ladeanimation nacheinander aufleuchten
     *  (Logik aus dem Wareneingang-Tracker übernommen). */
    _startLoaderSteps() {
      if (this._loaderTimer) return; // läuft bereits
      const steps = this._shadow.querySelectorAll(".we-step");
      if (!steps.length) return;
      let i = 0;
      const tick = () => {
        steps.forEach((s, idx) => s.classList.toggle("we-step-active", idx === i));
        i = (i + 1) % steps.length;
      };
      tick();
      this._loaderTimer = setInterval(tick, 600);
    }

    _stopLoaderSteps() {
      if (this._loaderTimer) { clearInterval(this._loaderTimer); this._loaderTimer = null; }
    }

    /** Timer stoppen, wenn das Widget aus dem DOM entfernt wird (SAC entfernt Kacheln). */
    disconnectedCallback() { this._stopLoaderSteps(); }

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
        ? `${M.kpis.nDeliveries} TE · ${M.kpis.nPositions} Positionen · Schwelle |z| > ${M.cfg.madThreshold}`
        : "";
      S.getElementById("tabs").innerHTML = MODES.map((m) =>
        `<button data-id="${m.id}" class="${m.id === this._mode ? "on" : ""}">${m.label}</button>`).join("");
      this._renderKpis();
      // Zustands-Overlays (Tracker-Konvention): laden -> leer -> Inhalt
      const loading = S.getElementById("state-loading");
      const empty = S.getElementById("state-empty");
      const main = S.getElementById("views");
      const hasData = !!M && M.kpis.nPositions > 0;
      const sourceAnswered = Array.isArray(this._rows); // Binding/Testdaten haben geliefert (ggf. leer)
      loading.hidden = hasData || sourceAnswered;
      empty.hidden = hasData || !sourceAnswered;
      // Schritt-Animation nur laufen lassen, solange das Lade-Overlay sichtbar ist
      if (loading.hidden) this._stopLoaderSteps(); else this._startLoaderSteps();
      if (!hasData) { main.innerHTML = ""; return; }
      main.innerHTML = "";
      if (this._detail) { this._renderDetail(main); return; }
      const mode = MODES.find((m) => m.id === this._mode) || MODES[0];
      if (mode.id === "puls")         { this._viewPuls(main); return; }
      if (mode.id === "prozesskette") { this._viewProzesskette(main); return; }
      if (mode.id === "ausreisser")   { this._viewAusreisser(main); return; }
      if (mode.id === "spediteur")     { this._viewSpediteur(main); return; }
      if (mode.id === "lieferanten")   { this._viewLieferanten(main); return; }
      if (mode.id === "warengruppen")  { this._viewWarengruppen(main); return; }
      if (mode.id === "schicht")      { this._viewSchicht(main); return; }
      this._viewPuls(main);
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
    /* ═══ 1) PULS — Zustand der Periode auf einen Blick ═══ */
    _viewPuls(main) {
      const M = this._model;
      const hasYoY = this._yoy && this._yoy.length;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="findings" id="findings"></div>
        <div class="card"><h3>Datenqualität &amp; Abdeckung <span class="data-level">TE + Position</span></h3><div id="dq"></div></div>
        <div class="card grow" style="margin-top:3mm"><h3>Durchsatz dieser Periode</h3><div id="throughput"></div></div>
        <div class="row" style="margin-top:3mm">
          <div class="card grow"><h3>Engpass-Analyse · Median-Zeit je Prozessphase</h3><div id="waterfall"></div></div>
          <div class="card"><h3>Bewertung · eigene Rechnung vs. SAP</h3><div id="gauges"></div></div>
        </div>
        <div class="collapsible-section" style="margin-top:3mm">
          <button class="collapse-toggle" id="toggleOutliers" type="button" aria-expanded="${this._showTopOutliers}">
            <span class="collapse-arrow">${this._showTopOutliers ? "▾" : "▸"}</span>
            ${this._showTopOutliers ? "Auffällige TEs ausblenden" : "Auffällige TEs anzeigen"}
          </button>
          <div class="card" id="topoutCard" ${this._showTopOutliers ? "" : "hidden"}><div id="topout"></div></div>
        </div>
        <div class="collapsible-section" style="margin-top:3mm">
          <button class="collapse-toggle" id="toggleYoY" type="button" aria-expanded="${this._showYoY}">
            <span class="collapse-arrow">${this._showYoY ? "▾" : "▸"}</span>
            ${this._showYoY ? "Vorjahresvergleich ausblenden" : "Vorjahresvergleich anzeigen"}
          </button>
          ${hasYoY
            ? `<div class="card yoy-card" id="yoyCard" ${this._showYoY ? "" : "hidden"}><h3>${esc(this._periodContext?.periode||"")} vs. ${esc(this._periodContext?.vorjahr||"Vorjahr")}</h3><div id="yoy"></div></div>`
            : `<div class="card" id="yoyCard" ${this._showYoY ? "" : "hidden"}><div class="empty">Kein Vorjahreszeitraum in der Auswahl verfügbar.</div></div>`}
        </div>`;
      main.appendChild(wrap);
      this._renderFindings(wrap.querySelector("#findings"));
      this._renderDatenqualitaet(wrap.querySelector("#dq"));
      this._pulsThroughput(wrap.querySelector("#throughput"));
      this._svgWaterfall(wrap.querySelector("#waterfall"));
      this._pulsGauges(wrap.querySelector("#gauges"));
      this._topOutliers(wrap.querySelector("#topout"));
      if (hasYoY) this._renderYoY(wrap.querySelector("#yoy"));

      const bindToggle = (btnId, cardId, stateKey, labelBase) => {
        const btn = wrap.querySelector("#" + btnId), card = wrap.querySelector("#" + cardId);
        btn.addEventListener("click", () => {
          this[stateKey] = !this[stateKey];
          card.hidden = !this[stateKey];
          btn.setAttribute("aria-expanded", String(this[stateKey]));
          btn.querySelector(".collapse-arrow").textContent = this[stateKey] ? "▾" : "▸";
          btn.lastChild.textContent = ` ${this[stateKey] ? labelBase + " ausblenden" : labelBase + " anzeigen"}`;
        });
      };
      bindToggle("toggleOutliers", "topoutCard", "_showTopOutliers", "Auffällige TEs");
      bindToggle("toggleYoY", "yoyCard", "_showYoY", "Vorjahresvergleich");
    }

    /* Datenqualität & Abdeckung: welcher Anteil der für eine Analyse
       benötigten Felder ist im aktiven Filter technisch auswertbar?
       TE-Felder werden gegen die TE-Anzahl geprüft, Positionsfelder gegen
       die Positionsanzahl. Vorhandensein bedeutet NICHT automatisch
       fachliche Richtigkeit — nur technische Auswertbarkeit. */
    _renderDatenqualitaet(el) {
      const M = this._model;
      const D = M.deliveries, P = M.positions;
      const nD = D.length || 1, nP = P.length || 1;
      const teCore = D.filter(d => d.ts_ankunft instanceof Date && d.ts_angedockt instanceof Date
        && d.ts_entladen_start instanceof Date && d.ts_entladen_ende_eff instanceof Date && d.ts_abfahrt instanceof Date).length;
      const teFertig = D.filter(d => d.ts_einlagerung_last instanceof Date).length;
      const tePn = D.filter(d => { const f = String(d.sap_puenktlich||"").trim().toUpperCase(); return f === "P" || f === "N"; }).length;
      const teSped = D.filter(d => d.frachtfuehrer).length;
      const pPa1 = P.filter(p => p.pa1 != null && p.pa1 > 0).length;
      const pPack = P.filter(p => p.standard_packmittel).length;
      const pIstSoll = P.filter(p => p.menge_ist != null && p.menge_soll != null).length;
      const pLief = P.filter(p => p.lieferant).length;
      const rows = [
        ["TE-Kernzeitstempel", teCore, nD, "Ankunft, Andocken, Entladen Start/Ende, Abfahrt"],
        ["Fertigstellung vorhanden", teFertig, nD, "Letzte Einlagerung/Fertigstellung je TE"],
        ["P/N vorhanden", tePn, nD, "BW-Pünktlichkeitskennzeichen je TE"],
        ["Spediteur gepflegt", teSped, nD, "Frachtführer je TE"],
        ["PA1 gepflegt", pPa1, nP, "Rechenbasis für Paletten"],
        ["Packmittel gepflegt", pPack, nP, "Standard-Packmittel am Produkt"],
        ["IST/SOLL vorhanden", pIstSoll, nP, "Mengentreue-Berechnung"],
        ["Lieferant gepflegt", pLief, nP, "Lieferantenanalyse"],
      ];
      el.innerHTML = `<div class="dq-grid">
        <div class="dq-summary"><b>${D.length}</b> TE im Filter · <b>${P.length}</b> Positionen im Filter · <b>${M.dataErrors ? M.dataErrors.length : 0}</b> Datenfehler</div>
        ${rows.map(([label, ok, total, hint]) => {
          const pct = total ? (ok / total * 100) : 0;
          const col = pct >= 90 ? C.good : pct >= 60 ? C.warn : C.bad;
          return `<div class="dq-row" title="${esc(hint)}">
            <span class="dq-label">${esc(label)}</span>
            <div class="dq-track"><i style="width:${pct.toFixed(0)}%;background:${col}"></i></div>
            <span class="dq-pct" style="color:${col}">${pct.toFixed(0)}%</span>
            <span class="dq-n">${ok}/${total}</span>
          </div>`;
        }).join("")}
      </div>`;
    }

    /* Vorjahresvergleich: je Kennzahl aktuelle Periode, Vorjahr und Delta */
    _renderYoY(el) {
      const rows = this._yoy || [];
      el.innerHTML = `<div class="yoy-grid">` + rows.map((r) => {
        let deltaHtml = "<span class='yoy-d'>–</span>";
        if (r.cur != null && r.prev != null && r.prev !== 0) {
          const rel = (r.cur - r.prev) / Math.abs(r.prev);
          const better = r.lowerBetter ? rel < 0 : rel > 0;
          deltaHtml = `<span class="yoy-d ${better ? "up" : "down"}">${rel >= 0 ? "▲" : "▼"} ${Math.abs(rel*100).toFixed(0)}%</span>`;
        }
        return `<div class="yoy-item">
          <div class="yoy-lbl">${esc(r.label)}</div>
          <div class="yoy-vals"><b>${esc(r.curTxt)}</b><span class="yoy-u">${esc(r.unit)}</span> ${deltaHtml}</div>
          <div class="yoy-prev">Vorjahr: ${esc(r.prevTxt)} ${esc(r.unit)}</div>
        </div>`;
      }).join("") + `</div>`;
    }

    /* Bewertungs-Kacheln: eigene Termintreue/Quote + SAP-Gegenprobe */
    _pulsGauges(el) {
      const M = this._model, D = M.deliveries;
      // eigene Termintreue (aus KPIs)
      const ownOnTime = M.kpis.onTime != null ? M.kpis.onTime * 100 : null;
      // SAP-Kennzeichen zählen
      const cnt = (f, ok) => D.filter((d) => d[f] === ok).length;
      const sapBase = (f, a, b) => { const n = cnt(f, a) + cnt(f, b); return n ? cnt(f, a) / n * 100 : null; };
      const otif = sapBase("sap_otif", "O", "N");
      const pkt = sapBase("sap_puenktlich", "P", "N");
      const vol = sapBase("sap_vollstaendig", "V", "N");
      const gauge = (label, val, sub) => {
        if (val == null) return `<div class="gauge"><div class="gv">–</div><div class="gl">${label}</div><div class="gs">${sub}</div></div>`;
        const col = val >= 90 ? C.good : val >= 75 ? C.warn : C.bad;
        return `<div class="gauge"><div class="gv" style="color:${col}">${val.toFixed(1)}<span>%</span></div>
          <div class="gl">${label}</div><div class="gs">${sub}</div></div>`;
      };
      el.innerHTML = `<div class="gauges">
        ${gauge("Termintreue", ownOnTime, "eigene Rechnung")}
        ${gauge("OTIF", otif, "SAP-Kennzeichen")}
        ${gauge("Pünktlichkeit", pkt, "SAP-Kennzeichen")}
        ${gauge("Vollständigkeit", vol, "SAP-Kennzeichen")}
      </div>`;
    }

    /* Durchsatz: Mengen/Volumen/Wert/Kollis + Segmentverteilung */
    _pulsThroughput(el) {
      const M = this._model, D = M.deliveries;
      const sum = (f) => { let s = 0, any = false; for (const d of D) { const v = d[f]; if (typeof v === "number" && !isNaN(v)) { s += v; any = true; } } return any ? s : null; };
      const menge = sum("sum_menge"), vol = sum("sum_volumen"), koll = sum("sum_kollis");
      const fmt = (v) => (v == null || !v) ? "–" : (v >= 1000 ? (v/1000).toFixed(1)+"k" : Math.round(v).toString());
      // Segmentverteilung (Anteil Anlieferungen)
      const bySeg = {};
      for (const d of D) bySeg[d.segment] = (bySeg[d.segment] || 0) + 1;
      const total = D.length || 1;
      const bars = Object.entries(bySeg).sort((a,b)=>b[1]-a[1]).map(([s, n]) =>
        `<div class="tp-seg"><span class="tp-lbl">${esc(s)}</span>
          <div class="tp-bar"><i style="width:${(n/total*100).toFixed(0)}%;background:${SEGC[s]||C.sonst}"></i></div>
          <span class="tp-n">${n}</span></div>`).join("");
      el.innerHTML = `
        <div class="tp-kpis">
          <div class="tp-k"><b>${D.length}</b><small>TE</small></div>
          <div class="tp-k"><b>${M.kpis.nPositions}</b><small>Positionen</small></div>
          <div class="tp-k"><b>${fmt(menge)}</b><small>Menge (Stück)</small></div>
          <div class="tp-k"><b>${fmt(vol)}</b><small>Volumen</small></div>
          <div class="tp-k"><b>${fmt(koll)}</b><small>Kollis</small></div>
        </div>
        <div class="tp-segs">${bars}</div>`;
    }

    /* ═══ 2) PROZESSKETTE — Zeitstrahl je Anlieferung inkl. Seetransport ═══ */
    _viewProzesskette(main) {
      const M = this._model;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="pk-legend" id="pklegend"></div>
        <div class="collapsible-section">
          <button class="collapse-toggle" id="togglePkLegend" type="button" aria-expanded="${this._showPkLegend}">
            <span class="collapse-arrow">${this._showPkLegend ? "▾" : "▸"}</span>
            ${this._showPkLegend ? "Farblegende ausblenden" : "Farblegende anzeigen"}
          </button>
          <div class="card pk-legend-full" id="pkLegendFull" ${this._showPkLegend ? "" : "hidden"}></div>
        </div>
        <div class="card" style="margin-top:3mm; position:relative"><h3>Prozesskette je TE · von Ankunft bis letzter Einlagerung <span class="data-level">TE + Position</span></h3>
          <div class="pk-hint-row">Transporteinheit + Transportmittel links · Hover über TE-Bezeichnung zeigt Anlieferungen/Positionen/Paletten · Hover über Balkenabschnitt zeigt Zeiten</div>
          <div id="gantt"></div>
          <div class="pk-tooltip" id="pkTip" hidden></div>
        </div>`;
      main.appendChild(wrap);
      this._pkLegend(wrap.querySelector("#pklegend"));
      this._pkLegendFull(wrap.querySelector("#pkLegendFull"));
      wrap.querySelector("#togglePkLegend").addEventListener("click", () => {
        this._showPkLegend = !this._showPkLegend;
        const card = wrap.querySelector("#pkLegendFull"), btn = wrap.querySelector("#togglePkLegend");
        card.hidden = !this._showPkLegend;
        btn.setAttribute("aria-expanded", String(this._showPkLegend));
        btn.querySelector(".collapse-arrow").textContent = this._showPkLegend ? "▾" : "▸";
        btn.lastChild.textContent = ` ${this._showPkLegend ? "Farblegende ausblenden" : "Farblegende anzeigen"}`;
      });
      this._svgGantt(wrap.querySelector("#gantt"), wrap.querySelector("#pkTip"));
    }

    _pkLegend(el) {
      const segs = [
        ["Seetransport", C.sonst], ["Wartezeit Tor", "#5d6d7e"], ["Reaktion", "#2980b9"],
        ["Entladen", "#27ae60"], ["Buchung", "#f39c12"], ["Einlagerung", C.accent],
      ];
      el.innerHTML = segs.map(([l, c]) => `<span class="pk-lg"><i style="background:${c}"></i>${l}</span>`).join("") +
        `<span class="pk-hint">→ Zeile anklicken für Detail</span>`;
    }

    /* Ausführliche, für Fachanwender verständliche Erklärung der Farben —
       standardmäßig eingeklappt, siehe Toggle in _viewProzesskette. */
    _pkLegendFull(el) {
      const rows = [
        ["#5d6d7e", "Wartezeit bis Andocken", "Ankunft am Kontrollpunkt bis Andocken der TE am Tor. TE-Ebene."],
        ["#2980b9", "Reaktionszeit", "Andocken bis tatsächlicher Start der Entladung. TE-Ebene."],
        ["#27ae60", "Entladen", "Start bis Ende der Entladung. TE-Ebene."],
        ["#f39c12", "WE-Buchung", "Ende der TE-Entladung bis zur WE-Buchung der jeweiligen Position. Übergang von TE- zu Positionsebene."],
        [C.accent, "Einlagern / Fertigstellung", "Letzte WE-Buchung bis zur zuletzt eingelagerten/fertiggestellten Position der gesamten TE. Positionsebene, TE-weit verdichtet."],
        [C.sonst, "Seetransport-Vorkette", "Nur bei Containern: Verschifft → Hafen → Verzollung → Depot → Ankunft Kontrollpunkt."],
      ];
      el.innerHTML = `
        <div class="pk-legend-title"><b>So liest du die Farben der Prozesskette</b>
          <span>Buchung und Einlagerung sind positionsbezogene Vorgänge. Die Prozesskette verdichtet sie für die TE-Übersicht auf den jeweils letzten relevanten Zeitstempel — das ist eine verständliche TE-Gesamtsicht, keine Aussage, dass jede Position exakt gleichzeitig bearbeitet wurde.</span>
        </div>
        ${rows.map(([c, t, d]) => `<div class="pk-legend-row"><i style="background:${c}"></i><div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`).join("")}
        <div class="pk-legend-note"><b>Wichtig:</b> Fehlt PA1 bei mindestens einer Position, ist die Palettenzahl der TE nicht vollständig berechenbar.</div>`;
    }

    /* ═══ 3) AUSREISSER — auffällige Anlieferungen + Drill ═══ */
    _viewAusreisser(main) {
      const M = this._model;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="legend">
          ${[...new Set(M.deliveries.map((d) => d.segment))].sort()
            .map((s) => `<span><i style="background:${SEGC[s] || C.sonst}"></i>${esc(s)}</span>`).join("")}
          <span><i style="background:${C.outlier}"></i>Ausreißer</span>
          <span style="margin-left:auto">→ Zeile anklicken für vollständige TE-Details</span>
        </div>
        <div class="card" style="flex:1 1 100%; width:100%"><h3>Standzeit über Zeit · MAD-Grenze je Segment</h3><div id="scatter"></div></div>
        <div class="card" style="flex:1 1 100%; width:100%"><h3>Auffällige TEs (Top nach z-Score)</h3><div id="tbl"></div></div>`;
      main.appendChild(wrap);
      const mode = { metric: "dwell", level: "delivery", label: "Standzeit", unit: "h", phases: ["wait_gate","reaction","unload"] };
      this._svgScatter(wrap.querySelector("#scatter"), M.deliveries, "dwell", mode);
      this._tblOutliers(wrap.querySelector("#tbl"), M.deliveries, "dwell", mode);
    }

    /* ═══ 4) TREIBER — Aufschlüsselung nach Dimensionen ═══ */
    _viewTreiber(main) {
      const M = this._model;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="row">
          <div class="card"><h3>Lagertor</h3><div id="drv-tor"></div></div>
          <div class="card"><h3>Frachtführer</h3><div id="drv-ff"></div></div>
        </div>
        <div class="row">
          <div class="card"><h3>Lieferant</h3><div id="drv-lief"></div></div>
          <div class="card"><h3>Hauptwarengruppe</h3><div id="drv-hwg"></div></div>
          <div class="card"><h3>Ursprungsland</h3><div id="drv-land"></div></div>
        </div>`;
      main.appendChild(wrap);
      this._treiberPanel(wrap.querySelector("#drv-tor"), "lagertor");
      this._treiberPanel(wrap.querySelector("#drv-ff"), "frachtfuehrer");
      this._treiberPanel(wrap.querySelector("#drv-lief"), "lieferant");
      this._treiberPanel(wrap.querySelector("#drv-hwg"), "hwg");
      this._treiberPanel(wrap.querySelector("#drv-land"), "land");
    }

    /* Treiber-Panel: je Dimensionswert Median-Standzeit + Ausreißer-Anteil */
    _treiberPanel(el, dim) {
      const M = this._model;
      const groups = {};
      for (const d of M.deliveries) {
        const key = d[dim];
        if (isNull(key)) continue;
        (groups[key] ||= []).push(d);
      }
      const rows = Object.entries(groups).map(([k, ds]) => {
        const dwells = ds.map((d) => d.phases && d.phases.dwell).filter((v) => v != null);
        const med = WEEngine.median(dwells);
        const nOut = ds.filter((d) => d.outlier && d.outlier.dwell).length;
        return { k, n: ds.length, med, outRate: ds.length ? nOut / ds.length : 0 };
      }).filter((r) => r.n >= 2).sort((a, b) => (b.med || 0) - (a.med || 0)).slice(0, 8);
      if (!rows.length) { el.innerHTML = `<div class="empty">Keine Ausprägungen mit ≥2 TEs.</div>`; return; }
      const maxMed = Math.max(...rows.map((r) => r.med || 0)) || 1;
      el.innerHTML = rows.map((r) => `
        <div class="drv-row">
          <span class="drv-lbl" title="${esc(r.k)}">${esc(String(r.k).slice(0, 22))}</span>
          <div class="drv-bar"><i style="width:${((r.med||0)/maxMed*100).toFixed(0)}%"></i></div>
          <span class="drv-med">${fmtH(r.med)}</span>
          <span class="drv-n">n=${r.n}${r.outRate > 0 ? ` · <b style="color:${C.outlier}">${(r.outRate*100).toFixed(0)}%</b>` : ""}</span>
        </div>`).join("");
    }

    /* ═══ 4a) SPEDITEURANALYSE — Pünktlichkeit nach BW-Kennzeichen P/N ═══
       Das Ranking nutzt AUSSCHLIESSLICH das BW-Kennzeichen P/N je TE, keine
       eigene Pünktlichkeitsdefinition. Mindestbasis konfigurierbar über die
       Property minCarrierTe (Default 10 bewertete TEs je Spediteur). */
    _spediteurPuenktlichkeitRanking() {
      const D = (this._model && this._model.deliveries) || [];
      const groups = new Map();
      for (const d of D) {
        const carrier = d.frachtfuehrer;
        const flag = String(d.sap_puenktlich || "").trim().toUpperCase();
        if (!carrier || (flag !== "P" && flag !== "N")) continue;
        const key = String(carrier).trim();
        const g = groups.get(key) || { name: key, p: 0, n: 0, total: 0 };
        if (flag === "P") g.p++; else g.n++;
        g.total++;
        groups.set(key, g);
      }
      const all = [...groups.values()].map(g => ({ ...g, quote: g.total ? g.p / g.total : NaN }));
      const minBase = Math.max(1, Number(this._props.minCarrierTe) || 10);
      const eligible = all.filter(x => x.total >= minBase), excluded = all.filter(x => x.total < minBase);
      const top = [...eligible].sort((a, b) => b.quote - a.quote || b.total - a.total || a.name.localeCompare(b.name, "de")).slice(0, 10);
      const flop = [...eligible].sort((a, b) => a.quote - b.quote || b.total - a.total || a.name.localeCompare(b.name, "de")).slice(0, 10);
      return { all, eligible, excluded, top, flop };
    }

    _renderSpediteurRanking(el, rows, kind) {
      if (!rows.length) {
        el.innerHTML = `<div class="empty">Keine bewertbaren Spediteure.<br><span style="font-size:10px">Benötigt BW-Kennzeichen P/N und Frachtführer.</span></div>`;
        return;
      }
      const col = kind === "top" ? C.good : C.bad;
      const drill = kind === "flop";
      el.innerHTML = `<div class="rank-list">` + rows.map((r, i) => {
        const pct = Math.max(0, Math.min(100, r.quote * 100));
        return `<div class="rank-row${drill ? " rank-drillable" : ""}"${drill ? ` data-carrier="${esc(r.name)}" tabindex="0" role="button" aria-label="${esc(r.name)} analysieren"` : ""} title="${esc(r.name)} · ${pct.toFixed(1)}% pünktlich · P=${r.p}, N=${r.n}${drill ? " · Klicken für TE-Analyse" : ""}">
          <span class="rank-no">${i + 1}</span>
          <span class="rank-name">${esc(r.name)}${drill ? ` <span style="color:${C.muted};font-size:9px">›</span>` : ""}</span>
          <div class="rank-track"><i style="width:${pct.toFixed(1)}%;background:${col}"></i></div>
          <span class="rank-pct" style="color:${col}">${pct.toFixed(1)}%</span>
          <span class="rank-n"><b>P ${r.p}</b> · N ${r.n}<br>n=${r.total} TE</span>
        </div>`;
      }).join("") + `</div>`;
    }

    /* Drilldown: die vom BW als N bewerteten TEs eines Spediteurs, mit
       Startabweichung als transparente Zusatzanalyse (ersetzt nicht P/N). */
    _renderSpediteurDrill(el, carrierName) {
      const D = (this._model && this._model.deliveries) || [];
      const sameCarrier = (d) => String(d.frachtfuehrer || "").trim() === String(carrierName || "").trim();
      const ns = D.filter(d => sameCarrier(d) && String(d.sap_puenktlich || "").trim().toUpperCase() === "N");
      const fmt = (t) => t instanceof Date && !isNaN(t) ? t.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–";
      const rows = ns.map(d => {
        const plan = d.ts_geplant_start instanceof Date ? d.ts_geplant_start : (d.ts_geplant instanceof Date ? d.ts_geplant : null);
        const actual = d.ts_ist_start instanceof Date ? d.ts_ist_start : null;
        const deltaMin = plan && actual ? Math.round((actual - plan) / 60000) : null;
        return { d, plan, actual, deltaMin };
      }).sort((a, b) => (b.deltaMin ?? -Infinity) - (a.deltaMin ?? -Infinity));
      const evaluable = rows.filter(r => r.deltaMin != null);
      const late = evaluable.filter(r => r.deltaMin > 0);
      const avgLate = late.length ? late.reduce((a, r) => a + r.deltaMin, 0) / late.length : null;
      const maxLate = late.length ? Math.max(...late.map(r => r.deltaMin)) : null;
      const fmtDelay = (m) => m == null ? `<span style="color:${C.muted}">nicht berechenbar</span>`
        : m > 0 ? `<span style="color:${C.bad}">+${m} min</span>`
        : m < 0 ? `<span style="color:${C.good}">${Math.abs(m)} min früher</span>`
        : `<span style="color:${C.muted}">0 min</span>`;
      el.innerHTML = `
        <div class="drill-head">
          <h3>TE-Analyse · ${esc(carrierName || "Spediteur")} <span class="data-level">TE</span></h3>
          <button class="drill-close" type="button">✕ Schließen</button>
        </div>
        <div class="drill-note">Gezeigt werden die vom BW als <b>N = nicht pünktlich</b> bewerteten TEs dieses Spediteurs. Die Startabweichung (IST-Start − geplanter Start) ist eine Zusatzanalyse und ersetzt nicht das BW-Kennzeichen.</div>
        <div class="drill-summary">
          <span class="drill-chip">BW-unpünktlich: <b>${rows.length} TE</b></span>
          <span class="drill-chip">auswertbar: <b>${evaluable.length}</b></span>
          <span class="drill-chip">davon verspätet: <b>${late.length}</b></span>
          <span class="drill-chip">Ø Verspätung: <b>${avgLate == null ? "–" : avgLate.toFixed(0) + " min"}</b></span>
          <span class="drill-chip">max.: <b>${maxLate == null ? "–" : maxLate + " min"}</b></span>
        </div>
        ${rows.length ? `<div style="overflow:auto"><table class="drill-table">
          <thead><tr><th>TE</th><th>Geplanter Start</th><th>IST-Start</th><th>Verspätung / Abweichung</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${esc(r.d.belegnr || "–")}</td><td>${fmt(r.plan)}</td><td>${fmt(r.actual)}</td><td>${fmtDelay(r.deltaMin)}</td></tr>`).join("")}</tbody>
        </table></div>` : `<div class="empty">Keine BW-unpünktlichen TEs für diesen Spediteur im gewählten Zeitraum.</div>`}`;
      const close = el.querySelector(".drill-close");
      if (close) close.addEventListener("click", () => { el.hidden = true; });
    }

    _viewSpediteur(main) {
      const r = this._spediteurPuenktlichkeitRanking();
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="finding${r.excluded.length ? "" : " hidden"}">Mindestbasis ${this._props.minCarrierTe} bewertete TEs · ${r.excluded.length} Spediteur(e) wegen zu kleiner Datenbasis nicht gerankt.</div>
        <div class="row">
          <div class="card"><h3>Top 10 · pünktlichste Spediteure <span class="data-level">TE</span></h3><div id="sp-top"></div></div>
          <div class="card"><h3>Flop 10 · unpünktlichste Spediteure <span class="data-level">TE</span></h3><div id="sp-flop"></div></div>
        </div>
        <div class="card drill-card" id="sp-drill" hidden></div>`;
      main.appendChild(wrap);
      this._renderSpediteurRanking(wrap.querySelector("#sp-top"), r.top, "top");
      this._renderSpediteurRanking(wrap.querySelector("#sp-flop"), r.flop, "flop");
      const drillEl = wrap.querySelector("#sp-drill");
      wrap.querySelector("#sp-flop").addEventListener("click", (e) => {
        const row = e.target.closest(".rank-drillable");
        if (!row) return;
        drillEl.hidden = false;
        this._renderSpediteurDrill(drillEl, row.dataset.carrier);
        drillEl.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      });
    }

    /* ═══ 4b) LIEFERANTENANALYSE — Mengentreue auf Positionsebene ═══
       Bewertbar sind nur Positionen mit IST und SOLL. Mindestbasis
       konfigurierbar über minSupplierPos (Default 20 Positionen). */
    _lieferantMengenRanking() {
      const P = (this._model && this._model.positions) || [];
      const groups = new Map();
      for (const p of P) {
        const supplier = p.lieferant, dev = Number(p.qty_dev);
        if (!supplier || p.qty_dev == null || !Number.isFinite(dev)) continue;
        const key = String(supplier).trim();
        const g = groups.get(key) || { name: key, okPos: 0, devPos: 0, totalPos: 0, underPos: 0, overPos: 0, sumAbsDev: 0, sumAbsPct: 0, relCount: 0, tes: new Set(), devTes: new Set() };
        if (dev === 0) g.okPos++; else {
          g.devPos++; g.sumAbsDev += Math.abs(dev);
          if (dev < 0) g.underPos++; else g.overPos++;
          if (Number.isFinite(Number(p.qty_dev_pct))) { g.sumAbsPct += Math.abs(Number(p.qty_dev_pct)); g.relCount++; }
          if (p.belegnr) g.devTes.add(String(p.belegnr));
        }
        g.totalPos++; if (p.belegnr) g.tes.add(String(p.belegnr)); groups.set(key, g);
      }
      const all = [...groups.values()].map(g => ({
        name: g.name, okPos: g.okPos, devPos: g.devPos, totalPos: g.totalPos, underPos: g.underPos, overPos: g.overPos,
        nTe: g.tes.size, okRate: g.totalPos ? g.okPos / g.totalPos : NaN, devRate: g.totalPos ? g.devPos / g.totalPos : NaN,
        avgAbsDev: g.devPos ? g.sumAbsDev / g.devPos : 0, avgAbsPct: g.relCount ? g.sumAbsPct / g.relCount : 0,
        affectedTeRate: g.tes.size ? g.devTes.size / g.tes.size : 0,
      }));
      const minBase = Math.max(1, Number(this._props.minSupplierPos) || 20);
      const eligible = all.filter(x => x.totalPos >= minBase), excluded = all.filter(x => x.totalPos < minBase);
      const top = [...eligible].sort((a, b) => b.okRate - a.okRate || b.totalPos - a.totalPos || a.name.localeCompare(b.name, "de")).slice(0, 10);
      const flop = [...eligible].sort((a, b) => b.devRate - a.devRate || b.avgAbsPct - a.avgAbsPct || a.name.localeCompare(b.name, "de")).slice(0, 10);
      return { all, eligible, excluded, top, flop };
    }

    _renderLieferantRanking(el, rows, kind) {
      if (!rows.length) {
        el.innerHTML = `<div class="empty">Keine bewertbaren Lieferanten.<br><span style="font-size:10px">Benötigt Lieferant sowie IST- und SOLL-Menge je Position.</span></div>`;
        return;
      }
      const isTop = kind === "top", col = isTop ? C.good : C.bad;
      el.innerHTML = `<div class="rank-list">` + rows.map((r, i) => {
        const rate = isTop ? r.okRate : r.devRate;
        const pct = Math.max(0, Math.min(100, rate * 100));
        return `<div class="rank-row" title="${esc(r.name)} · Ø|Δ| ${r.avgAbsDev.toFixed(1)} · Ø|Δ%| ${r.avgAbsPct.toFixed(1)}% · TE betroffen ${(r.affectedTeRate * 100).toFixed(1)}%">
          <span class="rank-no">${i + 1}</span>
          <span class="rank-name">${esc(r.name)}</span>
          <div class="rank-track"><i style="width:${pct.toFixed(1)}%;background:${col}"></i></div>
          <span class="rank-pct" style="color:${col}">${pct.toFixed(1)}%</span>
          <span class="rank-n"><b>✓ ${r.okPos}</b> · Δ ${r.devPos}<br>n=${r.totalPos} Pos · ${r.nTe} TE</span>
          <span class="rank-severity">Unter <b>${r.underPos}</b> · Über <b>${r.overPos}</b> · Ø|Δ| <b>${r.avgAbsDev.toFixed(1)}</b> · Ø|Δ%| <b>${r.avgAbsPct.toFixed(1)}%</b> · TE betroffen <b>${(r.affectedTeRate * 100).toFixed(1)}%</b></span>
        </div>`;
      }).join("") + `</div>`;
    }

    _viewLieferanten(main) {
      const r = this._lieferantMengenRanking();
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="finding${r.excluded.length ? "" : " hidden"}">Mindestbasis ${this._props.minSupplierPos} bewertbare Positionen · ${r.excluded.length} Lieferant(en) wegen zu kleiner Datenbasis nicht gerankt.</div>
        <div class="row">
          <div class="card"><h3>Top 10 · höchste Mengentreue <span class="data-level">Position</span></h3><div id="lf-top"></div></div>
          <div class="card"><h3>Flop 10 · höchste Abweichungsquote <span class="data-level">Position</span></h3><div id="lf-flop"></div></div>
        </div>`;
      main.appendChild(wrap);
      this._renderLieferantRanking(wrap.querySelector("#lf-top"), r.top, "top");
      this._renderLieferantRanking(wrap.querySelector("#lf-flop"), r.flop, "flop");
    }

    /* ═══ 4c) WARENGRUPPENANALYSE — WE-Durchlaufzeit je Warengruppe ═══
       Rechenebene TE + Warengruppe: zuerst je Kombination aggregieren
       (früheste Ankunft bis späteste Fertigstellung DIESER Warengruppe in
       DIESER TE), erst danach Statistik je Warengruppe — verhindert, dass
       eine positionsreiche TE die Warengruppe mehrfach gewichtet. */
    _warengruppeDurchlaufzeit() {
      const P = (this._model && this._model.positions) || [];
      const teHwg = new Map();
      for (const p of P) {
        const fertig = p.ts_fertigstellung || p.ts_einlagerung;
        if (!p.hwg || !(p.ts_ankunft instanceof Date) || !(fertig instanceof Date)) continue;
        const te = String(p.belegnr || "?").trim();
        const hwg = String(p.hwg).trim();
        const key = te + "\u0001" + hwg;
        const g = teHwg.get(key) || { te, hwg, ankunft: null, ende: null, nPos: 0 };
        if (!g.ankunft || p.ts_ankunft < g.ankunft) g.ankunft = p.ts_ankunft;
        if (!g.ende || fertig > g.ende) g.ende = fertig;
        g.nPos++;
        teHwg.set(key, g);
      }
      const byHwg = new Map();
      for (const g of teHwg.values()) {
        const h = (g.ende - g.ankunft) / H;
        if (!Number.isFinite(h) || h < 0) continue;
        const r = byHwg.get(g.hwg) || { name: g.hwg, sumH: 0, nTe: 0, nPos: 0, minH: Infinity, maxH: -Infinity, values: [] };
        r.sumH += h; r.values.push(h); r.nTe++; r.nPos += g.nPos;
        r.minH = Math.min(r.minH, h); r.maxH = Math.max(r.maxH, h);
        byHwg.set(g.hwg, r);
      }
      return [...byHwg.values()]
        .map(r => ({ ...r, avgH: r.nTe ? r.sumH / r.nTe : NaN, medianH: quantile(r.values, 0.5), p90H: quantile(r.values, 0.9) }))
        .sort((a, b) => b.avgH - a.avgH || b.nTe - a.nTe || a.name.localeCompare(b.name, "de"));
    }

    _renderWarengruppen(el, rows) {
      if (!rows.length) {
        el.innerHTML = `<div class="empty">Keine berechenbaren Warengruppen.<br><span style="font-size:10px">Benötigt Warengruppe, Ankunft am Kontrollpunkt und Fertigstellungs-/Einlagerungszeit.</span></div>`;
        return;
      }
      const maxH = Math.max(...rows.map(r => r.avgH).filter(Number.isFinite), 0.01);
      el.innerHTML = `<div class="hwg-list">` + rows.map(r => {
        const w = Math.max(1.5, Math.min(100, r.avgH / maxH * 100));
        return `<div class="hwg-row" title="${esc(r.name)} · Ø ${fmtH(r.avgH)} · Median ${fmtH(r.medianH)} · P90 ${fmtH(r.p90H)} · ${r.nTe} TE · ${r.nPos} Positionen">
          <span class="hwg-name">${esc(r.name)}</span>
          <div class="hwg-track"><i style="width:${w.toFixed(1)}%"></i></div>
          <span class="hwg-hours">${fmtH(r.avgH)}</span>
          <span class="hwg-meta">Median ${fmtH(r.medianH)} · P90 ${fmtH(r.p90H)} · <b>${r.nTe} TE</b> · ${r.nPos} Pos</span>
        </div>`;
      }).join("") + `</div>`;
    }

    _viewWarengruppen(main) {
      const rows = this._warengruppeDurchlaufzeit();
      const wrap = document.createElement("div");
      wrap.innerHTML = `<div class="card" style="flex:1 1 100%"><h3>Ø WE-Durchlaufzeit je Warengruppe <span class="data-level">TE + Position</span></h3><div id="hwg"></div></div>`;
      main.appendChild(wrap);
      this._renderWarengruppen(wrap.querySelector("#hwg"), rows);
    }

    /* ═══ 5) SCHICHT — Früh- vs. Spätschicht im Vergleich ═══ */
    _viewSchicht(main) {
      const M = this._model;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="legend">
          <span><i style="background:${SH_COLORS["F"]}"></i>Frühschicht (F)</span>
          <span><i style="background:${SH_COLORS["S"]}"></i>Spätschicht (S)</span>
          <span style="margin-left:auto">Zuordnung: Phase → Schicht, in der die Phase endet</span>
        </div>
        <div class="row">
          <div class="card"><h3>Durchsatz je Schicht</h3><div id="sch-tp"></div></div>
          <div class="card grow"><h3>Median-Zeit je Prozessphase · Früh vs. Spät</h3><div id="sch-ph"></div></div>
        </div>
        <div class="row">
          <div class="card"><h3>Termintreue & Ausreißer je Schicht</h3><div id="sch-q"></div></div>
          <div class="card grow"><h3>TE nach Ankunfts-Schicht · über den Tag</h3><div id="sch-hr"></div></div>
        </div>`;
      main.appendChild(wrap);
      this._schThroughput(wrap.querySelector("#sch-tp"));
      this._schPhases(wrap.querySelector("#sch-ph"));
      this._schQuality(wrap.querySelector("#sch-q"));
      this._schByHour(wrap.querySelector("#sch-hr"));
    }

    // Schichtlage einer Anlieferung/Position für eine Phase: F/S -> Früh/Spät
    _lageOf(rec, shField) { const s = rec[shField]; return s === "F" ? "F" : s === "S" ? "S" : null; }

    // Durchsatz je Schicht (Ankunfts-Schicht als Grundlage)
    _schThroughput(el) {
      const M = this._model;
      const agg = { F: { anl: 0, pos: 0, menge: 0, vol: 0 }, S: { anl: 0, pos: 0, menge: 0, vol: 0 } };
      for (const d of M.deliveries) {
        const l = this._lageOf(d, "sh_ankunft"); if (!l) continue;
        agg[l].anl++; agg[l].pos += d.nPos || 0;
        agg[l].menge += d.sum_menge || 0; agg[l].vol += d.sum_volumen || 0;
      }
      const fmt = (v) => !v ? "–" : v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1000 ? (v/1000).toFixed(1)+"k" : Math.round(v).toString();
      const col = (l) => SH_COLORS[l];
      const block = (l, name) => `
        <div class="sch-col" style="border-top:3px solid ${col(l)}">
          <div class="sch-h">${name}</div>
          <div class="sch-kpis">
            <div><b>${agg[l].anl}</b><small>TE</small></div>
            <div><b>${agg[l].pos}</b><small>Positionen</small></div>
            <div><b>${fmt(agg[l].menge)}</b><small>Menge</small></div>
            <div><b>${fmt(agg[l].vol)}</b><small>Volumen</small></div>
          </div>
        </div>`;
      el.innerHTML = `<div class="sch-cols">${block("F", "Frühschicht")}${block("S", "Spätschicht")}</div>`;
    }

    // Median-Zeit je Phase, gruppierte Balken Früh vs. Spät
    _schPhases(el) {
      const M = this._model;
      const phaseDefs = [
        ["wait_gate", "Wartezeit Tor", "sh_andocken", "delivery"],
        ["reaction", "Reaktion", "sh_entl_start", "delivery"],
        ["unload", "Entladen", "sh_unload_eff", "delivery"],
        ["booking", "Buchung", "sh_we", "position"],
        ["putaway", "Einlagerung", "sh_einl", "position"],
        ["dwell", "Standzeit", "sh_entl", "delivery"],
      ];
      const rows = phaseDefs.map(([key, label, shField, level]) => {
        const recs = level === "position" ? M.positions : M.deliveries;
        const byLage = { F: [], S: [] };
        for (const r of recs) {
          const l = this._lageOf(r, shField); if (!l) continue;
          const v = r.phases && r.phases[key];
          if (v != null) byLage[l].push(v);
        }
        return { label, F: WEEngine.median(byLage.F), S: WEEngine.median(byLage.S), nF: byLage.F.length, nS: byLage.S.length };
      });
      const maxV = Math.max(1, ...rows.flatMap((r) => [r.F || 0, r.S || 0]));
      el.innerHTML = rows.map((r) => `
        <div class="sch-ph-row">
          <span class="sch-ph-lbl">${r.label}</span>
          <div class="sch-ph-bars">
            <div class="sch-ph-bar"><i style="width:${((r.F||0)/maxV*100).toFixed(0)}%;background:${SH_COLORS["F"]}"></i><span>${r.F!=null?fmtH(r.F):"–"}</span></div>
            <div class="sch-ph-bar"><i style="width:${((r.S||0)/maxV*100).toFixed(0)}%;background:${SH_COLORS["S"]}"></i><span>${r.S!=null?fmtH(r.S):"–"}</span></div>
          </div>
        </div>`).join("") +
        `<div class="sch-ph-legend"><span><i style="background:${SH_COLORS["F"]}"></i>Früh</span><span><i style="background:${SH_COLORS["S"]}"></i>Spät</span></div>`;
    }

    // Termintreue + Ausreißer-Anteil je Schicht
    _schQuality(el) {
      const M = this._model;
      const agg = { F: { n: 0, onTime: 0, out: 0 }, S: { n: 0, onTime: 0, out: 0 } };
      for (const d of M.deliveries) {
        const l = this._lageOf(d, "sh_entl"); if (!l) continue;
        agg[l].n++;
        if (d.phases && d.phases.delay != null && d.phases.delay <= (M.cfg.toleranzMin || 0) / 60) agg[l].onTime++;
        if (d.outlier && (d.outlier.dwell || d.outlier.unload || d.outlier.wait_gate)) agg[l].out++;
      }
      const pct = (a, b) => b ? (a / b * 100) : null;
      const rowFor = (l, name) => {
        const ot = pct(agg[l].onTime, agg[l].n), or = pct(agg[l].out, agg[l].n);
        const otCol = ot == null ? C.muted : ot >= 90 ? C.good : ot >= 75 ? C.warn : C.bad;
        return `<div class="sch-q-row">
          <span class="sch-q-name"><i style="background:${SH_COLORS[l]}"></i>${name}</span>
          <div class="sch-q-metric"><span class="sch-q-v" style="color:${otCol}">${ot==null?"–":ot.toFixed(0)+"%"}</span><small>termintreu</small></div>
          <div class="sch-q-metric"><span class="sch-q-v" style="color:${or>0?C.outlier:C.ink}">${or==null?"–":or.toFixed(0)+"%"}</span><small>Ausreißer</small></div>
          <div class="sch-q-metric"><span class="sch-q-v">${agg[l].n}</span><small>TE</small></div>
        </div>`;
      };
      el.innerHTML = rowFor("F", "Frühschicht") + rowFor("S", "Spätschicht");
    }

    // Anlieferungen nach Ankunftszeit (Stunde), gestapelt Früh/Spät
    _schByHour(el) {
      const M = this._model;
      const hours = Array.from({ length: 24 }, () => ({ F: 0, S: 0 }));
      for (const d of M.deliveries) {
        const t = d.ts_ankunft; if (!(t instanceof Date)) continue;
        const l = this._lageOf(d, "sh_ankunft"); if (!l) continue;
        hours[t.getHours()][l]++;
      }
      const maxH = Math.max(1, ...hours.map((h) => h.F + h.S));
      const W = 1000, H = 200, padL = 28, padB = 22, padT = 10, bw = (W - padL - 10) / 24;
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="TE je Stunde">`;
      for (let i = 0; i <= 2; i++) { const y = padT + (H - padT - padB) * i / 2; const v = Math.round(maxH * (1 - i / 2));
        svg += `<line x1="${padL}" x2="${W-6}" y1="${y}" y2="${y}" stroke="${C.border}" opacity=".5"/><text x="${padL-5}" y="${y+3}" font-size="8" fill="${C.muted}" text-anchor="end">${v}</text>`; }
      hours.forEach((h, i) => {
        const x = padL + i * bw, total = h.F + h.S;
        if (!total) return;
        const scale = (H - padT - padB) / maxH;
        const hF = h.F * scale, hS = h.S * scale;
        const yF = H - padB - hF, yS = yF - hS;
        if (h.F) svg += `<rect x="${x+1}" y="${yF}" width="${bw-2}" height="${hF}" fill="${SH_COLORS["F"]}"><title>${i}:00 Früh: ${h.F}</title></rect>`;
        if (h.S) svg += `<rect x="${x+1}" y="${yS}" width="${bw-2}" height="${hS}" fill="${SH_COLORS["S"]}"><title>${i}:00 Spät: ${h.S}</title></rect>`;
      });
      for (let i = 0; i < 24; i += 3) svg += `<text x="${padL + i*bw + bw/2}" y="${H-6}" font-size="8" fill="${C.muted}" text-anchor="middle">${i}h</text>`;
      svg += "</svg>";
      el.innerHTML = svg;
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
      const W = 380, rowH = 40, padL = 96, padR = 34, H0 = steps.length * rowH + 30;
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
      if (!scored.length) { el.innerHTML = `<div class="empty">Keine auffälligen TEs im Zeitraum.</div>`; return; }
      el.innerHTML = `<div class="outrow-hint">Zeile anklicken öffnet die TE-Seite ▸</div>` + scored.map(({ d, z }) => `
        <div class="outrow" data-drill="${esc(d.belegnr)}" title="TE-Seite zu ${esc(d.belegnr)} öffnen" role="button" tabindex="0">
          <span class="seg" style="background:${SEGC[d.segment] || C.sonst}"></span>
          <div class="oi"><b>TE ${esc(d.belegnr)}</b><small>${esc((d.lieferant || "–").slice(0, 26))}</small></div>
          <div class="ov"><b>${fmtH(d.phases.dwell)}</b><small>z ${z.toFixed(1)}</small></div>
          <span class="outrow-chev">›</span>
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
          ${[...new Set(M.deliveries.map((d) => d.segment))].sort()
            .map((s) => `<span><i style="background:${SEGC[s] || C.sonst}"></i>${esc(s)}</span>`).join("")}
          <span><i style="background:${C.outlier}"></i>Ausreißer</span>
          <span style="color:${C.outlier}">→ Punkt oder Tabellenzeile anklicken für TE-Details</span>
          <span style="margin-left:auto">${esc(mode.desc)}</span>
        </div>
        <div class="row">
          ${mode.phases.length ? `<div class="card"><h3>Phasenband – wo steckt die Zeit? (Median je Segment)</h3><div id="ribbon"></div></div>` : ""}
          <div class="card" style="flex:2 1 460px"><h3>${esc(PHASES[metric] ? PHASES[metric].label : mode.label)} über Zeit · MAD-Grenze je Segment</h3><div id="scatter"></div></div>
        </div>
        ${hasDrivers ? `<div class="card"><h3>Treiber nach Stammdaten-Dimension (Ausreißer-Anteil)</h3><div id="drv"></div></div>` : ""}
        <div class="card"><h3>Auffällige ${mode.level === "delivery" ? "TEs" : "Positionen"} (Top nach z-Score)</h3><div id="tbl"></div></div>`;
      main.appendChild(wrap);
      if (mode.phases.length) this._svgRibbon(wrap.querySelector("#ribbon"), recs, mode.phases);
      this._svgScatter(wrap.querySelector("#scatter"), recs, metric, mode);
      if (hasDrivers) this._driverPanel(wrap.querySelector("#drv"), M.drivers[metric]);
      this._tblOutliers(wrap.querySelector("#tbl"), recs, metric, mode);
    }

    /* Zeitstrahl je Anlieferung: Phasen als Segmente, Container mit
       Seetransport-Vorkette (Verschifft→Hafen→Verzollung→Depot→Ankunft).
       Skaliert auf die gesamte Zeitspanne der Periode. */
    _svgGantt(el, tipEl) {
      const M = this._model;
      // TEs mit gültigem Zeitrahmen, nach Standzeit sortiert (auffälligste oben).
      // Rechter Abschluss orientiert sich an der ZULETZT fertiggestellten/
      // eingelagerten Position der GESAMTEN TE (ts_einlagerung_last),
      // nicht an der ersten Position — sonst würde eine TE mit mehreren
      // Anlieferungen zu früh "abgeschnitten" wirken.
      const items = M.deliveries
        .filter((d) => d.ts_ankunft instanceof Date)
        .map((d) => {
          const start = d.ts_verschifft instanceof Date ? d.ts_verschifft : d.ts_ankunft;
          const end = d.ts_einlagerung_last instanceof Date ? d.ts_einlagerung_last
                    : (d.ts_einlagerung instanceof Date ? d.ts_einlagerung
                    : (d.ts_abfahrt instanceof Date ? d.ts_abfahrt : d.ts_ankunft));
          return { d, start, end, span: (end - start) };
        })
        .filter((x) => x.span >= 0)
        .sort((a, b) => b.span - a.span)
        .slice(0, 40); // die 40 mit der längsten Gesamtspanne
      if (!items.length) { el.innerHTML = `<div class="empty">Keine TEs mit auswertbarem Zeitrahmen.</div>`; return; }

      const t0 = Math.min(...items.map((x) => +x.start));
      const t1 = Math.max(...items.map((x) => +x.end));
      const span = (t1 - t0) || 1;
      const W = 1000, padL = 168, padR = 16, rowH = 14, top = 22;
      const H = items.length * rowH + top + 18;
      const barW = W - padL - padR;
      const X = (t) => padL + ((+t - t0) / span) * barW;

      const PH = [
        { from: "ts_verschifft", to: "ts_hafen", col: "#3d4658", label: "Seetransport: Verschifft → Hafen", info: "Vorkette (nur Container)" },
        { from: "ts_hafen", to: "ts_verzollung", col: "#4a5568", label: "Seetransport: Hafen → Verzollung", info: "Vorkette (nur Container)" },
        { from: "ts_verzollung", to: "ts_depot", col: "#5d6d7e", label: "Seetransport: Verzollung → Depot", info: "Vorkette (nur Container)" },
        { from: "ts_depot", to: "ts_ankunft", col: "#6b7688", label: "Seetransport: Depot → Ankunft", info: "Vorkette (nur Container)" },
        { from: "ts_ankunft", to: "ts_angedockt", col: "#5d6d7e", label: "Wartezeit bis Andocken", info: "Ankunft am Kontrollpunkt → Andocken der TE am Tor. TE-Ebene." },
        { from: "ts_angedockt", to: "ts_entladen_start", col: "#2980b9", label: "Reaktionszeit", info: "Andocken → tatsächlicher Start der Entladung. TE-Ebene." },
        { from: "ts_entladen_start", to: "ts_entladen_ende_eff", col: "#27ae60", label: "Entladen", info: "Start bis Ende der Entladung. TE-Ebene." },
        { from: "ts_entladen_ende_eff", to: "ts_we_pos_last", col: "#f39c12", label: "WE-Buchung", info: "Ende der TE-Entladung → WE-Buchung. Übergang TE- zu Positionsebene." },
        { from: "ts_we_pos_last", to: "ts_einlagerung_last", col: C.accent, label: "Einlagern / Fertigstellung", info: "Letzte WE-Buchung → zuletzt eingelagerte Position der TE. Positionsebene, TE-weit verdichtet." },
      ];

      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Zeitstrahl je TE">`;
      // Zeitachse (Datumsmarken)
      const ticks = 6;
      for (let i = 0; i <= ticks; i++) {
        const t = t0 + span * i / ticks, x = padL + barW * i / ticks;
        const dt = new Date(t);
        svg += `<line x1="${x}" y1="${top-4}" x2="${x}" y2="${H-14}" stroke="${C.border}" stroke-dasharray="2 3" opacity=".6"/>
          <text x="${x}" y="${top-7}" font-size="8" fill="${C.muted}" text-anchor="middle">${dt.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})}</text>`;
      }
      items.forEach((x, i) => {
        const y = top + i * rowH;
        const d = x.d;
        if (i % 2 === 0) svg += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="${C.ink}" opacity="0.02"/>`;
        // Links: TE-Nummer + Transportmittel, mit eigenem Hover-Hitbereich
        const tmLabel = d.transportmittel ? String(d.transportmittel).slice(0, 14) : "–";
        svg += `<text x="0" y="${y + rowH/2 + 3}" font-size="8.5" fill="${C.ink2}" font-family="var(--font-mono)">${esc(String(d.belegnr).slice(0,11))}</text>`;
        svg += `<text x="82" y="${y + rowH/2 + 3}" font-size="8" fill="${C.muted}">${esc(tmLabel)}</text>`;
        svg += `<rect class="pk-te-hit" data-i="${i}" x="0" y="${y}" width="${padL-4}" height="${rowH}" fill="transparent" style="cursor:help"/>`;
        svg += `<rect class="pk-hit" data-drill="${esc(d.belegnr)}" x="${padL}" y="${y}" width="${barW}" height="${rowH}" fill="transparent" style="cursor:pointer"/>`;
        for (const p of PH) {
          const a = d[p.from], b = d[p.to];
          if (!(a instanceof Date) || !(b instanceof Date) || b <= a) continue;
          const xa = X(a), xb = X(b), w = Math.max(1.2, xb - xa);
          svg += `<rect class="pk-seg" data-i="${i}" data-ph="${p.label}" data-info="${esc(p.info)}"
            data-a="${+a}" data-b="${+b}" x="${xa}" y="${y+2}" width="${w}" height="${rowH-4}" rx="1.5" fill="${p.col}" opacity="0.92"
            style="transform-origin:${padL}px center; animation:pk-grow .5s ${i*14}ms both cubic-bezier(.16,1,.3,1)"/>`;
        }
      });
      svg += "</svg>";
      el.innerHTML = svg;
      el.querySelectorAll(".pk-hit").forEach((r) =>
        r.addEventListener("click", () => { this._detail = r.dataset.drill; this._render(); }));

      // Reichhaltiges Hover-Tooltip statt nativer <title>: Segment-Hover zeigt
      // Prozessschritt, Dauer menschenlesbar + exakt, Von/Bis, TE-Nummer,
      // kurze Erklärung. TE-Label-Hover zeigt Transportmittel, Anzahl
      // Anlieferungen/Positionen, berechnete volle Paletten.
      if (!tipEl) return;
      const svgEl = el.querySelector("svg");
      const showTip = (html, evt) => {
        tipEl.innerHTML = html; tipEl.hidden = false;
        const hostRect = tipEl.offsetParent ? tipEl.offsetParent.getBoundingClientRect() : el.getBoundingClientRect();
        tipEl.style.left = Math.max(4, evt.clientX - hostRect.left + 14) + "px";
        tipEl.style.top = Math.max(4, evt.clientY - hostRect.top - 10) + "px";
      };
      const hideTip = () => { tipEl.hidden = true; };
      el.querySelectorAll(".pk-seg").forEach((seg) => {
        seg.addEventListener("mousemove", (evt) => {
          const i = +seg.dataset.i, d = items[i].d;
          const aH = (+seg.dataset.b - +seg.dataset.a) / 3600000;
          seg.setAttribute("opacity", "1"); seg.setAttribute("stroke", C.ink); seg.setAttribute("stroke-width", "0.6");
          showTip(`<b>${esc(seg.dataset.ph)}</b>
            <div class="pk-tip-row">TE <b>${esc(d.belegnr)}</b></div>
            <div class="pk-tip-row">Dauer: <b>${fmtHumanDauer(aH)}</b> (${aH.toFixed(2)} h)</div>
            <div class="pk-tip-row">Von: ${fmtDT(new Date(+seg.dataset.a))}</div>
            <div class="pk-tip-row">Bis: ${fmtDT(new Date(+seg.dataset.b))}</div>
            <div class="pk-tip-info">${esc(seg.dataset.info)}</div>`, evt);
        });
        seg.addEventListener("mouseleave", () => { seg.setAttribute("opacity","0.92"); seg.removeAttribute("stroke"); hideTip(); });
      });
      el.querySelectorAll(".pk-te-hit").forEach((hit) => {
        hit.addEventListener("mousemove", (evt) => {
          const d = items[+hit.dataset.i].d;
          const pal = d.palettenVollstaendig ? d.sum_paletten : `${d.sum_paletten}<span class="pk-tip-warn"> (unvollständig)</span>`;
          showTip(`<b>TE ${esc(d.belegnr)}</b>
            <div class="pk-tip-row">Transportmittel: <b>${esc(d.transportmittel || "–")}</b></div>
            <div class="pk-tip-row">Anlieferungen: <b>${d.nAnlieferungen ?? "–"}</b></div>
            <div class="pk-tip-row">Positionen: <b>${d.nPos}</b></div>
            <div class="pk-tip-row">Berechnete volle Paletten: <b>${pal}</b></div>`, evt);
        });
        hit.addEventListener("mouseleave", hideTip);
      });
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
      const W = 340, rowH = 34, H0 = rows.length * rowH + 22;
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
      const W = 1000, Hh = 300, padL = 46, padB = 22, padT = 10;
      const X = (t) => padL + ((t - x0) / (x1 - x0)) * (W - padL - 12);
      const Y = (v) => padT + (1 - (Math.min(v, yMax) - yMin) / (yMax - yMin)) * (Hh - padT - padB);
      let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Streudiagramm">`;
      // y-Gitter
      for (let i = 0; i <= 4; i++) {
        const v = yMin + (i / 4) * (yMax - yMin), y = Y(v);
        svg += `<line x1="${padL}" x2="${W - 12}" y1="${y}" y2="${y}" stroke="${C.border}" opacity=".6"/>
                <text x="${padL - 6}" y="${y + 3}" font-size="9" fill="${C.muted}" text-anchor="end">${fmtH(v)}</text>`;
      }
      // MAD-Grenzlinien je Segment
      const B = this._model.baselines[metric] || {};
      for (const [seg, b] of Object.entries(B)) {
        const col = SEGC[seg] || C.sonst;
        if (b.limitH <= yMax)
          svg += `<line x1="${padL}" x2="${W - 12}" y1="${Y(b.limitH)}" y2="${Y(b.limitH)}" stroke="${col}" stroke-dasharray="4 3" opacity=".8">
                    <title>Ausreißergrenze ${seg}: ${fmtH(b.limitH)} (Median ${fmtH(b.medH)}, |z| > ${this._model.cfg.madThreshold}${b.log ? ", log-MAD" : ""})</title></line>`;
        if (b.medH <= yMax)
          svg += `<line x1="${padL}" x2="${W - 12}" y1="${Y(b.medH)}" y2="${Y(b.medH)}" stroke="${col}" opacity=".35"/>`;
      }
      if (metric === "delay") svg += `<line x1="${padL}" x2="${W - 12}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" opacity=".4"/>`;
      // Punkte (klickbar -> TE-Detail), dezent eingeblendet
      let pi = 0;
      for (const p of pts) {
        const out = p.outlier[metric];
        const col = out ? C.outlier : (SEGC[p.segment] || C.sonst);
        const v = p.phases[metric];
        const delay = Math.min(600, pi * 1.2); pi++;
        svg += `<circle class="sc-pt" data-drill="${esc(p.belegnr)}" cx="${X(+p[tsField])}" cy="${Y(v)}" r="${out ? 4 : 2.6}" fill="${col}" opacity="0"
          style="animation:sc-in .4s ${delay}ms forwards"><title>${esc(p.belegnr)}${p.pos ? "/" + esc(p.pos) : ""} · ${esc(p.lieferant || "")}\n${fmtH(v)} (z=${p.z[metric] == null ? "–" : p.z[metric].toFixed(1)}) · ${p.segment}\nKlicken für Details</title></circle>`;
      }
      // x-Achse: Monatsmarken
      const d0 = new Date(x0); d0.setDate(1);
      for (let d = new Date(d0); +d <= x1; d.setMonth(d.getMonth() + 1)) {
        if (+d < x0) continue;
        svg += `<text x="${X(+d)}" y="${Hh - 5}" font-size="9" fill="${C.muted}">${d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</text>`;
      }
      if (yMaxData < Math.max(...vals))
        svg += `<text x="${W - 12}" y="${padT + 8}" font-size="8.5" fill="${C.muted}" text-anchor="end">▲ gekappt bei P99, Extremwerte in Tabelle</text>`;
      el.innerHTML = svg + "</svg>";
      el.querySelectorAll(".sc-pt").forEach((c) =>
        c.addEventListener("click", () => { this._detail = c.dataset.drill; this._render(); }));
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
        <th>Beleg/Pos</th><th>Datum</th><th>Lieferant</th><th>Ladestelle</th>
        <th>${esc(PHASES[metric].label)}</th><th>z</th>
        ${mode.phases.map((k) => `<th>${PHASES[k].label}</th>`).join("")}
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    /* ---- TE-Detailansicht (Drill-down) ---- */
    // Prozess-Status einer TE aus dem weitesten erreichten Zeitstempel ableiten
    _teStatus(d, pos) {
      const has = (t) => t instanceof Date;
      const einl = pos.some((p) => has(p.ts_einlagerung));
      const web = pos.some((p) => has(p.ts_we_pos)) || has(d.ts_we_pos);
      if (einl) return { key: "eingelagert", label: "Eingelagert", step: 5, col: C.container || "#27ae60" };
      if (web) return { key: "gebucht", label: "WE gebucht", step: 4, col: "#16a085" };
      if (has(d.ts_entladen_ende_eff)) return { key: "entladen_fertig", label: "Entladen", step: 3, col: "#3d9ad6" };
      if (has(d.ts_entladen_start)) return { key: "entladen", label: "Wird entladen", step: 2, col: "#3d9ad6" };
      if (has(d.ts_angedockt)) return { key: "angedockt", label: "Angedockt", step: 1, col: "#f5b041" };
      if (has(d.ts_ankunft)) return { key: "ankunft", label: "Angekommen", step: 0, col: "#f5b041" };
      return { key: "erwartet", label: "Erwartet", step: -1, col: C.muted };
    }

    // Meilenstein-Prozesskette (Ankunft→Andocken→Entladen→Buchen→Einlagern)
    _milestoneChain(status) {
      const steps = ["Ankunft", "Andocken", "Entladen", "Buchen", "Einlagern"];
      return `<div class="ms-chain">` + steps.map((s, i) => {
        const done = i <= status.step;
        const active = i === status.step;
        return `<div class="ms-step ${done ? "done" : ""} ${active ? "active" : ""}">
          <span class="ms-dot" ${done ? `style="background:${status.col};border-color:${status.col}"` : ""}></span>
          <span class="ms-lbl">${s}</span>
        </div>${i < steps.length - 1 ? `<span class="ms-sep ${done ? "done" : ""}"></span>` : ""}`;
      }).join("") + `</div>`;
    }

    _renderDetail(main) {
      const M = this._model;
      const d = M.deliveries.find((x) => x.belegnr === this._detail);
      const pos = M.positions.filter((p) => p.belegnr === this._detail);
      if (!d) { main.innerHTML = `<div class="empty">TE ${esc(this._detail)} nicht gefunden.</div>`; return; }
      const status = this._teStatus(d, pos);

      // Warnbadges
      const warns = [];
      for (const k of ["dwell", "wait_gate", "unload", "delay"])
        if (d.outlier && d.outlier[k]) warns.push(`<span class="dwarn w-warn">⚠ Ausreißer ${PHASES[k].label}</span>`);
      if (pos.some((p) => p.outlier && p.outlier.putaway)) warns.push(`<span class="dwarn w-warn">⚠ Ausreißer Einlagerung</span>`);
      if (pos.some((p) => p.outlier && p.outlier.qty)) warns.push(`<span class="dwarn w-warn">⚠ Mengenabweichung</span>`);
      if (d.isDiffLieferung) warns.push(`<span class="dwarn w-krit">Differenzlieferung</span>`);
      if (pos.some((p) => p.isKritArt)) warns.push(`<span class="dwarn w-krit">Kritischer Artikel</span>`);
      if (d.hasError || pos.some((p) => p.hasError)) warns.push(`<span class="dwarn w-krit">Datenfehler</span>`);
      if (d.isBSL) warns.push(`<span class="dwarn w-info">BSL-Prozess</span>`);

      const totalPaletten = pos.reduce((sum, p) => sum + (p.paletten || 0), 0);
      const fmtTs = (t) => t instanceof Date ? t.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–";
      const sumVol = pos.reduce((a, p) => a + (p.volumen || 0), 0);
      const sumKollis = pos.reduce((a, p) => a + (p.anzahl_kollis || 0), 0);

      const fact = (l, v) => `<div class="dh-fact"><span class="dh-fact-l">${l}</span><span class="dh-fact-v">${v}</span></div>`;

      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="crumbs">
          <button class="back" id="back">← Zurück zur Übersicht</button>
        </div>
        <div class="detail-head s-${status.key}">
          <div class="dh-top">
            <div>
              <div class="dh-te">TE ${esc(d.belegnr)}</div>
              <div class="dh-sub">${esc(d.lieferant || "–")}${d.te_extern ? " · " + esc(d.te_extern) : ""}</div>
            </div>
            <span class="dh-status" style="background:${status.col}22;color:${status.col};border-color:${status.col}66">${status.label}</span>
          </div>
          ${this._milestoneChain(status)}
          ${warns.length ? `<div class="detail-warnbar">${warns.join("")}</div>` : ""}
          <div class="dh-facts">
            ${fact("Ladestelle", `<span class="tag" style="background:${SEGC[d.segment]||C.sonst}">${esc(d.segment)}</span>`)}
            ${fact("Ankunft", fmtTs(d.ts_ankunft))}
            ${fact("Standzeit", d.phases.dwell != null ? fmtH(d.phases.dwell) : "–")}
            ${fact("Termintreue", d.phases.delay == null ? "–" : d.phases.delay <= 0 ? "pünktlich" : "+" + fmtH(d.phases.delay))}
            ${fact("Positionen", d.nPos)}
            ${fact("Paletten", totalPaletten > 0 ? totalPaletten.toFixed(1) : "–")}
            ${fact("Lagertor", d.lagertor ? esc(d.lagertor) : "–")}
            ${fact("Ursprungsland", d.land ? esc(d.land) : "–")}
            ${sumVol > 0 ? fact("Volumen", Math.round(sumVol)) : ""}
            ${sumKollis > 0 ? fact("Kollis", sumKollis) : ""}
            ${d.frachtfuehrer ? fact("Frachtführer", esc(d.frachtfuehrer)) : ""}
            ${d.sh_entl ? fact("Schicht Entladen", `${d.sh_entl === "F" ? "Früh" : "Spät"}${d.team_entl ? " · " + esc(d.team_entl) : ""}`) : ""}
          </div>
        </div>
        <div class="card"><h3>Prozess-Zeitstrahl${d.ts_verschifft ? " · inkl. Seetransport" : ""}</h3><div id="tl"></div></div>
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
      // Phasen-Definition inkl. Seetransport-Vorkette (Container)
      const seaPhases = [
        ["ts_verschifft", "ts_hafen", "Seetransport", "#3d4658"],
        ["ts_hafen", "ts_verzollung", "Im Hafen", "#4a5568"],
        ["ts_verzollung", "ts_depot", "Verzollung", "#5d6d7e"],
        ["ts_depot", "ts_ankunft", "Depot → Anlieferung", "#6b7688"],
      ];
      const landPhases = [
        ["ts_ankunft", "ts_angedockt", "Wartezeit Tor", "#5d6d7e"],
        ["ts_angedockt", "ts_entladen_start", "Reaktion", "#2980b9"],
        ["ts_entladen_start", "ts_entladen_ende_eff", "Entladen", "#27ae60"],
        ["ts_entladen_ende_eff", "ts_we_pos", "Buchung", "#f39c12"],
        ["ts_we_pos", "ts_einlagerung", "Einlagerung", C.accent],
      ];
      // WE-Buchung/Einlagerung ggf. aus Positionen (Median-Zeitpunkt)
      const firstTs = (arr) => { const v = arr.filter(Boolean).map(Number); return v.length ? new Date(Math.min(...v)) : null; };
      const dd = Object.assign({}, d);
      if (!dd.ts_we_pos) dd.ts_we_pos = firstTs(pos.map((p) => p.ts_we_pos));
      if (!dd.ts_einlagerung) dd.ts_einlagerung = firstTs(pos.map((p) => p.ts_einlagerung));

      const hasSea = dd.ts_verschifft instanceof Date;
      const phases = (hasSea ? seaPhases : []).concat(landPhases)
        .map(([a, b, lbl, col]) => ({ a: dd[a], b: dd[b], lbl, col }))
        .filter((p) => p.a instanceof Date && p.b instanceof Date && p.b > p.a);
      if (phases.length < 1) { el.innerHTML = `<div class="empty">Zu wenige Zeitstempel für einen Zeitstrahl.</div>`; return; }

      const t0 = Math.min(...phases.map((p) => +p.a));
      const t1 = Math.max(...phases.map((p) => +p.b));
      const span = (t1 - t0) || 1;
      const W = 620, padL = 12, padR = 12, barY = 40, barH = 26;
      const X = (t) => padL + ((+t - t0) / span) * (W - padL - padR);

      let svg = `<svg viewBox="0 0 ${W} 96" width="100%" role="img" aria-label="Zeitstrahl TE ${esc(d.belegnr)}">`;
      // Zeitachse
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const t = t0 + span * i / ticks, x = padL + (W - padL - padR) * i / ticks;
        svg += `<line x1="${x}" y1="${barY - 6}" x2="${x}" y2="${barY + barH + 6}" stroke="${C.border}" stroke-dasharray="2 3"/>
          <text x="${x}" y="${barY - 10}" font-size="9" fill="${C.muted}" text-anchor="middle">${new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</text>`;
      }
      // Phasenbalken aneinandergereiht auf der echten Zeitachse
      for (const p of phases) {
        const x = X(p.a), w = Math.max(2, X(p.b) - X(p.a));
        const hours = (p.b - p.a) / 36e5;
        svg += `<rect x="${x}" y="${barY}" width="${w}" height="${barH}" rx="3" fill="${p.col}" opacity="0.92">
          <title>${p.lbl}: ${fmtH(hours)}</title></rect>`;
        // Label nur wenn Balken breit genug
        if (w > 42) svg += `<text x="${x + w/2}" y="${barY + barH/2 + 3}" font-size="8.5" fill="#fff" text-anchor="middle" opacity=".9">${p.lbl}</text>`;
      }
      svg += "</svg>";
      // Spanne + Legende der Phasen (mit Zeiten)
      const total = (t1 - t0) / 36e5;
      const days = (t1 - t0) / 864e5;
      const chips = phases.map((p) =>
        `<span class="tl-chip"><i style="background:${p.col}"></i>${esc(p.lbl)} · ${fmtH((p.b - p.a) / 36e5)}</span>`).join("");
      el.innerHTML = svg +
        `<div class="tl-span">Gesamtspanne: <b>${days >= 1 ? days.toFixed(1) + " Tage" : fmtH(total)}</b>${hasSea ? ` · davon Seetransport bis Anlieferung` : ""}</div>
         <div class="tl-chips">${chips}</div>`;
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
      const W = 280, rh = 34;
      let svg = `<svg viewBox="0 0 ${W} ${rows.length * rh + 4}" width="100%">`;
      rows.forEach((r, i) => {
        const y = i * rh;
        const bw = (v) => Math.max(2, (v / maxV) * (W - 128));
        svg += `<text x="0" y="${y + 12}" font-size="10" fill="${C.ink}">${r.label}</text>`;
        if (r.val != null)
          svg += `<rect x="78" y="${y + 3}" width="${bw(r.val)}" height="9" rx="2" fill="${r.out ? C.outlier : (SEGC[d.segment] || C.sonst)}"><title>Diese TE: ${fmtH(r.val)}</title></rect>
                  <text x="${82 + bw(r.val)}" y="${y + 11}" font-size="9" fill="${r.out ? C.outlier : C.ink}">${fmtH(r.val)}${r.out ? " ⚠" : ""}</text>`;
        else svg += `<text x="78" y="${y + 11}" font-size="9" fill="${C.muted}">–</text>`;
        if (r.med != null)
          svg += `<rect x="78" y="${y + 15}" width="${bw(r.med)}" height="5" rx="2" fill="${C.muted}" opacity=".55"><title>Median ${d.segment}: ${fmtH(r.med)}</title></rect>
                  <text x="${82 + bw(r.med)}" y="${y + 21}" font-size="8.5" fill="${C.muted}">Median ${fmtH(r.med)}</text>`;
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
        const W = 380, Hh = 180, padL = 38;
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
          <div class="card"><h3>TE · Wochentag × Stunde</h3><div id="heat"></div></div>
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
      const cw = 14, ch = 16, W = 24 * cw + 32, Hh = 7 * ch + 22;
      let svg = `<svg viewBox="0 0 ${W} ${Hh}" width="100%">`;
      for (let d = 0; d < 7; d++) {
        svg += `<text x="0" y="${d * ch + 14}" font-size="10" fill="${C.muted}">${days[d]}</text>`;
        for (let h = 0; h < 24; h++) {
          const v = M.heat[d][h], a = v / max;
          svg += `<rect x="${32 + h * cw}" y="${d * ch + 2}" width="${cw - 2}" height="${ch - 3}" rx="2"
            fill="${C.lkw}" opacity="${v ? 0.12 + 0.85 * a : 0.04}"><title>${days[d]} ${h}:00 – ${v} Ankünfte</title></rect>`;
        }
      }
      for (let h = 0; h < 24; h += 4)
        svg += `<text x="${32 + h * cw}" y="${Hh - 4}" font-size="9" fill="${C.muted}">${h}h</text>`;
      const av = M.arrivalsByShift || {};
      const avTotal = (av["Früh"] || 0) + (av["Spät"] || 0);
      const avNote = avTotal
        ? `<div class="sfnote">TE je Schicht: Früh <b>${av["Früh"] || 0}</b> · Spät <b>${av["Spät"] || 0}</b> (${avTotal ? Math.round(100 * (av["Früh"] || 0) / avTotal) : 0} % Früh)</div>`
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
          <table><thead><tr><th>TE</th><th>Lieferant</th><th>Ladestelle</th></tr></thead><tbody>${
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
      const W = 340, bh = 16, gap = 20;
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
            const w = s ? Math.max(2, (s.med / maxV) * (W - 150)) : 0;
            const yy = y + i * (bh + 2);
            svg += `<text x="54" y="${yy + 12}" font-size="9" fill="${C.muted}">${lage}</text>`;
            if (s) svg += `<rect x="80" y="${yy + 2}" width="${w}" height="${bh - 4}" rx="2"
              fill="${i ? C.container : C.lkw}"><title>${esc(n)} · ${lage}-Wochen: ${fmtH(s.med)} (n=${s.n})</title></rect>
              <text x="${84 + w}" y="${yy + 12}" font-size="9" fill="${C.muted}">${fmtH(s.med)} · n=${s.n}</text>`;
            else svg += `<text x="80" y="${yy + 12}" font-size="9" fill="${C.muted}">–</text>`;
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
