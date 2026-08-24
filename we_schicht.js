// ═══════════════════════════════════════════════════════════════════════════
//  SAP Custom Widget – Wareneingang Analyse (WE-Analyse)
//  Version 2.0.0
//
//  Umbau des Live-Trackers zur nachträglichen Auswertung.
//
//  Views:
//    1. Übersicht – aggregierte Kennzahlen (Gestern / Letzte Woche)
//                   + TE-Auflistung mit Kennzahlen je TE
//    2. Detail    – Zeitstrahl + Zeitvergleiche + Positionen (unverändert
//                   aus dem Referenz-Widget übernommen)
//
//  Entfernt gegenüber 1.8.1: Palettenplanung, Tore-Ansicht, Gantt/Zeitstrahl-
//  Ansicht, Live-Uhr, Auto-Refresh-Countdown, Kachel-Übersicht mit Hover-Popup.
//
//  Kennzahlen: OTIF · Pünktlichkeit · Mengentreue · Durchlaufzeit ·
//              Abweichende Menge
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Konstanten ───────────────────────────────────────────────────────────

  const TAG = 'we-eingang-widget';

  // BW liefert Timestamps als ISO-String oder SAP-internes Format.
  // Null-Werte die BW zurückgeben kann:
  const NULL_TOKENS = new Set(['', '#', '00000000', '000000000000', '@NullMember', '@TotalMembers', 'null', 'undefined']);

  // ── Ladestellen-Mapping ──────────────────────────────────────────────
  // BW liefert die lange Bezeichnung. Für Filter + Badges brauchen wir eine
  // kurze Kategorie.
  const LADESTELLE_KURZ = {
    // BW-Schlüssel (Key) — so kommen die Werte real an
    'ILW KREFELD BSL':                     'BSL',
    'ILW KREFELD CONTAINE':                'Container',
    'ILW KREFELD LANDVERK':                'Landverkehr',
    // Lange Texte (falls doch der Text ankommt)
    'ILW Krefeld Container':               'Container',
    'ILW Krefeld BSL':                     'BSL',
    'ILW Krefeld BSL / Eigendisposition':  'BSL',
    'ILW Krefeld Frei Haus / DDP':         'Landverkehr',
  };

  // Gibt die kurze Kategorie zu einer (Schlüssel-, langen oder kurzen) Bezeichnung.
  function ladestelleKurz(wert) {
    const w = wert == null ? '' : String(wert).trim();
    if (LADESTELLE_KURZ[w]) return LADESTELLE_KURZ[w];
    if (/container|containe/i.test(w))     return 'Container';
    if (/frei haus|ddp|landverk/i.test(w)) return 'Landverkehr';
    if (/bsl|eigendispo/i.test(w))         return 'BSL';
    return 'BSL';
  }

  // Die 3 Kategorien in fester Reihenfolge (für Filter)
  const LADESTELLE_KATEGORIEN = ['BSL', 'Container', 'Landverkehr'];

  // Icon + CSS-Klasse je Kategorie
  const LADESTELLE_STYLE = {
    BSL:         { icon: '🚛', cls: 'ls-bsl'  },
    Container:   { icon: '🏗', cls: 'ls-cont' },
    Landverkehr: { icon: '🚚', cls: 'ls-land' },
  };

  // Anzeigenamen der Prozess-Status (Detailsicht)
  const STATUS_LABEL = {
    erwartet:        'Erwartet',
    ankunft:         'Eingetroffen',
    angedockt:       'Angedockt',
    entladen:        'Wird entladen',
    entladen_fertig: 'Entladen',
    fertigstellung:  'Wird fertiggestellt',
    eingelagert:     'Eingelagert',
  };

  // EWM-Deeplink. Platzhalter bis die echte URL feststeht.
  const EWM_BASE_URL = 'https://ewm.example.com/te/';
  const ewmLink = (intTE) => EWM_BASE_URL + encodeURIComponent(intTE);

  // Standard-Toleranz in Minuten – ab wann eine TE als "unpünktlich" gilt.
  // Wird über die Property `puenktlichkeitToleranzMin` überschrieben.
  const VERZOEGERUNG_SCHWELLE_MIN = 30;

  // Andocken darf höchstens 30 Minuten nach dem geplanten Start erfolgen.
  const ANDOCK_TOLERANZ_MIN = 30;

  // ── Laufzeit-Konfiguration ───────────────────────────────────────────────
  // Wird aus den Widget-Properties gespeist und an parseRows()/berechneTE()/
  // berechneKennzahlen() übergeben. Bewusst als Parameter statt als globaler
  // Zustand: mehrere Widget-Instanzen auf einer SAC-Story dürfen sich nicht
  // gegenseitig die Toleranzen überschreiben.
  const CFG_DEFAULT = Object.freeze({
    toleranzMin:       VERZOEGERUNG_SCHWELLE_MIN, // Pünktlichkeit
    mengenToleranzPct: 0,                         // Mengentreue (0 = exakt)
  });

  // Kennzahlen-Metadaten — steuern Karten, Tabellenspalten und Sortierung.
  const KPI_DEFS = [
    { id: 'otif',          label: 'OTIF',             kurz: 'OTIF',    einheit: '%'   },
    { id: 'puenktlich',    label: 'Pünktlichkeit',    kurz: 'Pünktl.', einheit: '%'   },
    { id: 'mengentreu',    label: 'Mengentreue',      kurz: 'Menge',   einheit: '%'   },
    { id: 'durchlaufzeit', label: 'Ø Durchlaufzeit',  kurz: 'DLZ',     einheit: 'min' },
    { id: 'abwMenge',      label: 'Abweichende Menge', kurz: 'Δ Menge', einheit: ''   },
  ];

  const esc = (s) => {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const isNull = (v) => {
    if (v == null) return true;
    const s = String(v).trim();
    if (NULL_TOKENS.has(s)) return true;
    // Reine Nullen-Folge beliebiger Länge (SAP/BW füllt leere Felder mit Nullen)
    if (/^0+$/.test(s)) return true;
    // Reine #-Folge (BW-Platzhalter für leere Merkmale)
    if (/^#+$/.test(s)) return true;
    return false;
  };

  // Parst einen Timestamp aus BW – gibt ein Date-Objekt zurück oder null
  const parseTs = (raw) => {
    if (isNull(raw)) return null;
    let s = String(raw).trim();
    if (!s || s === '#') return null;

    // Deutsches Format: "07.07.2026  06:00:00" (auch mit Doppel-Leerzeichen)
    //                   oder "07.07.2026 06:00" oder nur "07.07.2026"
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (de) {
      const [, dd, mm, yyyy, hh, mi, ss] = de;
      // Als UTC konstruieren → die Ziffern bleiben "Wanduhrzeit", keine TZ-Umrechnung
      return new Date(Date.UTC(+yyyy, +mm - 1, +dd, +(hh||0), +(mi||0), +(ss||0)));
    }

    // ISO 8601: "2025-05-20T07:37:00" — ohne TZ-Angabe als UTC interpretieren
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (isoMatch) {
      const [, yyyy, mm, dd, hh, mi, ss] = isoMatch;
      return new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +(ss||0)));
    }
    // ISO nur Datum
    const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDate) {
      const [, yyyy, mm, dd] = isoDate;
      return new Date(Date.UTC(+yyyy, +mm - 1, +dd));
    }

    // SAP-Format: "20250520073700" (YYYYMMDDHHmmss)
    if (/^\d{14}$/.test(s)) {
      return new Date(Date.UTC(
        +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
        +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)
      ));
    }
    // SAP-Datum ohne Zeit: "20250520" → Mitternacht
    if (/^\d{8}$/.test(s)) {
      return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    }
    return null;
  };

  // Aktuelle Zeit als UTC-"Wanduhrzeit": nimmt die lokale Uhrzeit des Nutzers
  // und legt dieselben Ziffern als UTC ab. So sind Vergleiche mit den ebenfalls
  // als UTC-Wanduhrzeit geparsten BW-Zeiten konsistent — unabhängig von der
  // Zeitzone in der SAC oder der Browser läuft.
  const jetztWanduhr = () => {
    const n = new Date();
    return new Date(Date.UTC(
      n.getFullYear(), n.getMonth(), n.getDate(),
      n.getHours(), n.getMinutes(), n.getSeconds()
    ));
  };

  // Formatiert ein Date-Objekt als "HH:MM" Uhrzeit
  const fmtTime = (d) => {
    if (!d) return '–';
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  };

  // Formatiert ein Date-Objekt als "DD.MM.YYYY"
  const fmtDate = (d) => {
    if (!d) return '–';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  };

  // Formatiert ein Date-Objekt als "DD.MM. HH:MM" (kompakt für Popup)
  const fmtDateTime = (d) => {
    if (!d) return '–';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) + ' ' +
           d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
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
    // SAC-Objekt: { id, label } → id bevorzugen, sonst label (technischer Wert)
    if (typeof v === 'object') {
      const raw = ('id' in v && v.id != null) ? v.id
                : ('label' in v && v.label != null) ? v.label
                : null;
      return raw == null ? null : String(raw).trim();
    }
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

  // Liest gezielt das LABEL (Text) eines BW-Merkmals, nicht den Key.
  // Für Felder wie Produkt (Key=Nummer, Text=Bezeichnung) oder Warensender.
  // Fällt auf die id zurück, falls kein Label vorhanden ist.
  const extractLabel = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') {
      const raw = ('label' in v && v.label != null) ? v.label
                : ('id' in v && v.id != null) ? v.id
                : null;
      return raw == null ? null : String(raw).trim();
    }
    return String(v).trim();
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

  // Liest ein BW-Merkmal als { key, text }. Beide können null sein.
  // BW liefert Key in .id und Text in .label — bei manchen Feldern sind beide gleich.
  const readKeyText = (row, ...keys) => {
    const key  = readDim(row, ...keys);
    const text = readLabel(row, ...keys);
    if (key == null && text == null) return { key: null, text: null };
    return { key, text: (text ?? key) };
  };

  // Wie readKeyText, aber schneidet führende Nullen im (numerischen) Key ab.
  // Für Frachtführer- und Lieferantennummern (z.B. "0000400352" → "400352").
  const readKeyTextNum = (row, ...keys) => {
    const kt = readKeyText(row, ...keys);
    if (kt.key != null) kt.key = ohneNullen(kt.key);
    return kt;
  };

  // Formatiert { key, text } als "Key – Text" bzw. nur das Vorhandene.
  const keyTextStr = (kt) => {
    if (!kt || (!kt.key && !kt.text)) return null;
    if (!kt.key)  return kt.text;
    if (!kt.text || kt.text === kt.key) return kt.key;
    return `${kt.key} – ${kt.text}`;
  };

  // BW kodiert Wahrheitswerte uneinheitlich: ja/nein, wahr/falsch, X/#, 1/0.
  // Diese Funktion kapselt das an genau einer Stelle.
  const WAHR_TOKENS = new Set(['ja', 'wahr', 'x', 'true', 'j', 'y', 'yes', '1']);
  const istWahr = (raw) => {
    if (isNull(raw)) return false;
    return WAHR_TOKENS.has(String(raw).trim().toLowerCase());
  };

  // Liest eine Kennzahl als Zahl. Paletten kommen als Ganzzahl,
  // wir runden defensiv auf (angebrochene Palette = ganzer Stellplatz).
  const readNum = (row, ...keys) => {
    const v = readVal(row, ...keys);
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Wie readNum, aber für Palettenzahlen: erwartet Ganzzahlen. Falls doch ein
  // Dezimalwert kommt (angebrochene Palette), wird aufgerundet — eine
  // angebrochene Palette belegt einen ganzen Stellplatz.
  const readPaletten = (row, ...keys) => {
    const n = readNum(row, ...keys);
    return n == null ? 0 : Math.ceil(n);
  };

  // Liest einen Zeitstempel als "Wanduhrzeit".
  // WICHTIG: SAC liefert bei Datums-Merkmalen in der .id oft einen bereits nach
  // UTC verschobenen technischen Wert (z.B. "...T12:36:00Z" für 14:36 lokal),
  // während das .label den korrekt formatierten Anzeigewert trägt ("14:36").
  // Deshalb bevorzugen wir hier das LABEL — das ist die Zeit, die der Nutzer
  // im BW/in der Query sieht. parseTs legt die Ziffern zeitzonenneutral ab.
  const readTs = (row, ...keys) => {
    for (const key of keys) {
      for (const k of [`${key}_0`, key]) {
        const v = row[k];
        if (v == null) continue;
        if (typeof v === 'object') {
          // 1) Label bevorzugen, wenn es wie ein Datum aussieht (Wanduhrzeit)
          const label = v.label;
          if (label != null && !isNull(label) && /\d{1,2}[.\-/]\d{1,2}|\d{2}:\d{2}/.test(String(label))) {
            const d = parseTs(label);
            if (d) return d;
          }
          // 2) Sonst die id versuchen
          const id = v.id;
          if (id != null && !isNull(id)) {
            const d = parseTs(id);
            if (d) return d;
          }
          // 3) Zur Not doch das Label (auch wenn ungewöhnliches Format)
          if (label != null && !isNull(label)) {
            const d = parseTs(label);
            if (d) return d;
          }
        } else if (!isNull(v)) {
          const d = parseTs(v);
          if (d) return d;
        }
      }
    }
    return null;
  };

  // Entfernt führende Nullen bei rein numerischen Kennungen (Belegnummer,
  // Produktnummer). Nicht-numerische Werte bleiben unangetastet.
  const ohneNullen = (v) => {
    if (v == null) return v;
    const s = String(v).trim();
    if (/^0+$/.test(s)) return '0';
    if (/^0+\d+$/.test(s)) return s.replace(/^0+/, '');
    return s;
  };

  // Lagernummer, die BW manchen Merkmalen (Tor, Einlagerungskennzeichen) als
  // technisches Präfix voranstellt. In der Story kommt z.B. "2630T043" statt
  // "T043" oder "2630PUTR" statt "PUTR" an. Diese Nummer schneiden wir ab.
  const LAGER_NR = '2630';
  const ohneLagerNr = (v) => {
    if (v == null) return v;
    let s = String(v).trim();
    // Präfix "2630" gefolgt von Trennzeichen ODER direkt am Wortanfang entfernen
    const re = new RegExp('^' + LAGER_NR + '\\s*[/\\-_]?\\s*');
    if (re.test(s)) s = s.replace(re, '');
    return s === '' ? null : s;
  };

  // Normalisiert einen Tor-Wert: '#' oder leer → null (kein Tor zugewiesen).
  const normTor = (raw) => {
    if (isNull(raw)) return null;
    const s = ohneLagerNr(String(raw).trim());
    return (s == null || s === '#' || s === '') ? null : s;
  };

  // Normalisiert eine Halle: extrahiert die reine Nummer (4, 6, 8) und
  // baut daraus den internen Hallen-Key HA04/HA06/HA08.
  const normHalle = (raw) => {
    if (isNull(raw)) return null;
    const s = String(raw).trim();
    // Falls schon "HA04" → durchreichen
    if (/^HA\d+$/i.test(s)) return s.toUpperCase();
    // Reine Zahl "4" → "HA04"
    const num = s.match(/\d+/);
    if (num) return 'HA' + String(num[0]).padStart(2, '0');
    return s;
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

  // ── Zusätzliche Formatierer für die Auswertung ───────────────────────────

  // Dauer ohne Vorzeichen: "1h 23min" / "45min" / "–"
  const fmtDauerAbs = (min) => {
    if (min == null || !Number.isFinite(min)) return '–';
    const m = Math.round(Math.abs(min));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h} h` : `${h} h ${r} min`;
  };

  // Prozentwert: "97,3 %" — null wird zu "–"
  const fmtProzent = (v, stellen = 1) => {
    if (v == null || !Number.isFinite(v)) return '–';
    return v.toLocaleString('de-DE', {
      minimumFractionDigits: stellen, maximumFractionDigits: stellen,
    }) + ' %';
  };

  // Vorzeichenbehaftete Menge: "+12" / "−8" / "0"
  const fmtDelta = (v) => {
    if (v == null || !Number.isFinite(v)) return '–';
    const gerundet = Math.round(v * 100) / 100;
    if (gerundet === 0) return '0';
    const zeichen = gerundet > 0 ? '+' : '−';
    return zeichen + Math.abs(gerundet).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  };

  // Ampelklasse zu einer Erfüllungsquote (0–100).
  const quoteKlasse = (v) => {
    if (v == null) return 'q-nb';
    if (v >= 95) return 'q-gut';
    if (v >= 85) return 'q-mittel';
    return 'q-schlecht';
  };

  // Dreiwertiges Kennzeichen als Chip: true / false / null.
  const boolChip = (v, jaTxt = 'Ja', neinTxt = 'Nein') => {
    if (v == null) return `<span class="k-chip k-nb" title="Nicht bewertbar – Datengrundlage unvollständig">n. b.</span>`;
    return v
      ? `<span class="k-chip k-ja">${esc(jaTxt)}</span>`
      : `<span class="k-chip k-nein">${esc(neinTxt)}</span>`;
  };

  // Sortierwert: null/undefined immer ans Ende, unabhängig von der Richtung.
  const cmp = (a, b, richtung) => {
    const aLeer = a == null || (typeof a === 'number' && !Number.isFinite(a));
    const bLeer = b == null || (typeof b === 'number' && !Number.isFinite(b));
    if (aLeer && bLeer) return 0;
    if (aLeer) return 1;
    if (bLeer) return -1;
    if (typeof a === 'string' || typeof b === 'string') {
      return String(a).localeCompare(String(b), 'de') * richtung;
    }
    return (a < b ? -1 : a > b ? 1 : 0) * richtung;
  };

  // ── Daten-Parser ─────────────────────────────────────────────────────────
  //
  // Wandelt flache BW-Rows (eine Zeile pro Produktposition pro TE) in ein
  // strukturiertes Map-Objekt um: { teNr → TEObjekt }
  //
  // TEObjekt (Auszug):
  //   te, teExt, teHinweis, ladestelle, tor, liefernummer, bestellnummer,
  //   lieferant {key,text}, lieferantName, transportmittel, halle,
  //   direktfahrt, shuttle, vorpalettierung, prioritaet, containerDepot,
  //   frachtfuehrer, istStart, istEnde,
  //   geplantStart, geplantEnde,
  //   tsAnkunft, tsAngedockt, tsEntladenStart, tsEntladenEnde, tsEntladenTat,
  //   tsWeBuchung, tsEinlagerung, tsAbfahrt,
  //   produkte: [ { nr, name, menge, mengeSoll, mengeAbweichung, einheit, … } ]
  //
  //   Berechnet (berechneTE / berechneKennzahlen):
  //   status, fortschritt, abgefahren, verzoegerungMin, planabweichung,
  //   andockVerspaetet, warnungen, anzahlPositionen, anlieferpaletten,
  //   ankerDatum, puenktlich, puenktlichkeitAbwMin, mengeIst, mengeSoll,
  //   abweichendeMenge, abweichendeMengeAbs, mengenAbwPct, mengentreu,
  //   durchlaufzeitMin, otif

  function parseRows(rows, cfg = CFG_DEFAULT) {
    if (!Array.isArray(rows) || rows.length === 0) return new Map();

    const teMap = new Map();

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;

      // ── TE-Stammdaten ──
      const teNrRaw = readDim(row, 'dimension_te', 'TE', 'VBELN', 'te_nr');
      if (!teNrRaw) continue;
      // Führende Nullen entfernen und als einheitlichen Schlüssel verwenden,
      // damit Map-Key, te.te und data-te im DOM identisch sind (Klick funktioniert).
      const teNr = String(teNrRaw).replace(/^0+/, '') || String(teNrRaw);

      if (!teMap.has(teNr)) {
        teMap.set(teNr, {
          te:              teNr,
          teHinweis:       readDim(row, 'dimension_te_hinweis', 'TE_HINWEIS'),
          ladestelle:      readDim(row, 'dimension_ladestelle', 'LADESTELLE'),
          // Tor: "#" bedeutet kein Tor zugewiesen
          tor:             normTor(readLabel(row, 'dimension_tor', 'TOR') ?? readDim(row, 'dimension_tor', 'TOR')),
          liefernummer:    ohneNullen(readDim(row, 'dimension_liefernummer', 'LIFNR')),
          bestellnummer:   ohneNullen(readDim(row, 'dimension_bestellnummer', 'EBELN')),
          // Lieferant = Warensender. BW-Merkmal mit Key + Text.
          lieferant:       readKeyTextNum(row, 'dimension_lieferant_name', 'dimension_lieferant_nr', 'WARENSENDER'),
          lieferantNr:     ohneNullen(readDim(row,  'dimension_lieferant_nr', 'WARENSENDER_NR', 'WARENSENDER')),
          lieferantName:   readLabel(row, 'dimension_lieferant_name', 'dimension_lieferant_nr', 'WARENSENDER') ?? '–',
          transportmittel: readDim(row, 'dimension_transportmittel', 'TRMIT'),
          halle:           normHalle(readDim(row, 'dimension_halle', 'HALLE', 'LGNUM')),

          teExt:           readDim(row, 'dimension_te_ext', 'TE_EXT'),
          direktfahrt:     istWahr(readDim(row, 'dimension_direktfahrt')),
          shuttle:         istWahr(readDim(row, 'dimension_shuttle')),
          vorpalettierung: readDim(row, 'dimension_vorpalettierung'),
          prioritaet:      readKeyText(row, 'dimension_prioritaet'),
          containerDepot:  readDim(row, 'dimension_container_depot'),
          frachtfuehrer:   readKeyTextNum(row, 'dimension_frachtfuehrer'),

          // Ist-Start / Ist-Ende (eigene BW-Felder)
          istStart:        readTs(row, 'dimension_ist_start'),
          istEnde:         readTs(row, 'dimension_ist_ende'),

          // Zeitfenster (Soll)
          geplantStart:    readTs(row, 'dimension_geplant_start', 'GEPLANT_START'),
          geplantEnde:     readTs(row, 'dimension_geplant_ende', 'GEPLANT_ENDE'),

          // Prozess-Timestamps (Ist)
          tsAnkunft:        readTs(row, 'dimension_ts_ankunft', 'ANKUNFT'),
          tsAngedockt:      readTs(row, 'dimension_ts_angedockt', 'ANGEDOCKT'),
          tsEntladenStart:  readTs(row, 'dimension_ts_entladen_start', 'ENTLADEN_START'),
          tsEntladenEnde:   readTs(row, 'dimension_ts_entladen_ende', 'ENTLADEN_ENDE'),
          tsEntladenTat:    readTs(row, 'dimension_ts_entladen_tat', 'ENTLADEN_TAT'),
          tsWeBuchung:      readTs(row, 'dimension_ts_we_buchung', 'WE_BUCHUNG'),
          tsEinlagerung:    readTs(row, 'dimension_ts_einlagerung', 'FERTIGSTELLUNG'),
          tsAbfahrt:        readTs(row, 'dimension_ts_abfahrt', 'ABFAHRT'),

          // Sammlung mehrerer Anlieferungen/Bestellungen je TE
          _lieferSet:       new Set(),
          _bestellSet:      new Set(),
          anlieferungen:    [],      // wird nach der Schleife aus _lieferSet befüllt
          bestellungen:     [],      // dito aus _bestellSet

          produkte:         [],

          // Berechnete Felder – werden in berechneTE() gesetzt
          status:           'erwartet',
          verzoegerungMin:  null,
          fortschritt:      0,
          abgefahren:       false,
          warnungen:        [],
          anzahlPositionen: 0,
          anlieferpaletten: 0,
          andockVerspaetet: false,
        });
      }

      // ── Produktzeile anhängen ──
      const te = teMap.get(teNr);

      // Liefer- und Bestellnummer je Position sammeln (eine TE kann mehrere
      // Anlieferungen/Bestellungen umfassen).
      const lief = ohneNullen(readDim(row, 'dimension_liefernummer', 'LIFNR'));
      const best = ohneNullen(readDim(row, 'dimension_bestellnummer', 'EBELN'));
      if (lief != null && lief !== '' && lief !== '#') te._lieferSet.add(String(lief));
      if (best != null && best !== '' && best !== '#') te._bestellSet.add(String(best));

      const prodNr = ohneNullen(readDim(row, 'dimension_produkt_nr', 'MATNR'));
      if (prodNr) {
        // Ist-Menge (geliefert) und Soll-Menge (bestellt/avisiert).
        const mengeIst  = readVal(row, 'value_menge', 'MENGE');
        const mengeSoll = readVal(row, 'value_menge_soll', 'MENGE_SOLL');
        // Abweichung: bevorzugt die vorberechnete BW-Kennzahl, sonst Ist − Soll.
        let mengeAbw = readVal(row, 'value_menge_abweichung', 'MENGE_ABW');
        if (mengeAbw == null && mengeIst != null && mengeSoll != null) {
          mengeAbw = mengeIst - mengeSoll;
        }

        te.produkte.push({
          nr:           prodNr,
          name:         readLabel(row, 'dimension_produkt_name', 'dimension_produkt_nr', 'MAKTX') ?? '–',
          // menge = Ist-Menge (Anzeige in der Positionstabelle der Detailsicht)
          menge:        mengeIst ?? 0,
          mengeIst:     mengeIst,
          mengeSoll:    mengeSoll,
          mengeAbweichung: mengeAbw,
          einheit:      readDim(row, 'dimension_einheit', 'MEINS') ?? '',
          halle:        normHalle(readDim(row, 'dimension_halle', 'LGNUM')) ?? '',
          tsEinlagerung: readTs(row, 'dimension_ts_einlagerung'),

          packmittel:       readKeyText(row, 'dimension_packmittel'),
          hwg:              readKeyText(row, 'dimension_hwg'),
          einlagersteuerkz: ohneLagerNr(readLabel(row, 'dimension_einlagersteuerkz') ?? readDim(row, 'dimension_einlagersteuerkz')),
          fotoErstellt:     istWahr(readDim(row, 'dimension_foto_erstellt')),
          baender:          istWahr(readDim(row, 'dimension_baender')),
          sperrgut:         istWahr(readDim(row, 'dimension_sperrgut')),
          kritKategorie:    readKeyText(row, 'dimension_krit_kategorie'),
          kritFreitext:     readDim(row, 'dimension_krit_freitext'),
          qpGruppe:         readDim(row, 'dimension_qp_gruppe'),
          bestand:          readNum(row, 'value_bestand_tagesgenau'),
          anlieferpaletten: readPaletten(row, 'value_anlieferpaletten'),
        });
      }
    }

    // Berechnete Felder für jede TE befüllen
    for (const te of teMap.values()) {
      // Gesammelte Anlieferungen/Bestellungen in sortierte Arrays wandeln
      te.anlieferungen = [...te._lieferSet].sort();
      te.bestellungen  = [...te._bestellSet].sort();
      delete te._lieferSet;
      delete te._bestellSet;

      berechneTE(te, cfg);
      berechneKennzahlen(te, cfg);
      // Warnungen zuletzt: sie greifen auch auf die Kennzahlen zu.
      te.warnungen = baueWarnungen(te);
    }

    return teMap;
  }

  // Berechnet Prozess-Status, Fortschritt und Verzögerung für eine TE.
  // (Basis für die unverändert übernommene Detailsicht.)
  function berechneTE(te, cfg = CFG_DEFAULT) {
    const jetzt = jetztWanduhr();

    // ── Fertigstellung pro Produkt aggregieren ──
    // Eine TE gilt erst als fertiggestellt, wenn ALLE Positionen ein
    // Fertigstellungs-Datum haben.
    const prodEinlag = te.produkte.map(p => p.tsEinlagerung);
    const alleFertig = te.produkte.length > 0 && prodEinlag.every(ts => ts !== null);
    te.alleFertiggestellt = alleFertig;
    if (alleFertig) {
      te.tsEinlagerung = prodEinlag.reduce((a, b) => (b > a ? b : a));
    } else {
      te.tsEinlagerung = null; // noch nicht vollständig fertiggestellt
    }

    // ── Fortschritt: Anzahl abgeschlossener PFLICHT-Prozessschritte ──
    const pflichtSchritte = [
      te.tsAnkunft, te.tsAngedockt, te.tsEntladenStart,
      te.tsEntladenEnde, te.tsWeBuchung, te.tsEinlagerung,
    ];
    te.fortschritt = pflichtSchritte.filter(ts => ts !== null).length;

    // Abfahrt separat als Flag (optionaler Schritt hinter "fertig")
    te.abgefahren = te.tsAbfahrt !== null;

    // ── Verzögerung: Geplanter Start → Ankunft am Kontrollpunkt ──
    te.verzoegerungMin = null;
    if (te.geplantStart && te.tsAnkunft) {
      const dm = diffMin(te.geplantStart, te.tsAnkunft);
      te.verzoegerungMin = dm < 0 ? 0 : dm;
    }

    // ── Prozess-Status ──
    if (te.alleFertiggestellt)      te.status = 'eingelagert';
    else if (te.tsWeBuchung)        te.status = 'fertigstellung';
    else if (te.tsEntladenEnde)     te.status = 'entladen_fertig';
    else if (te.tsEntladenStart)    te.status = 'entladen';
    else if (te.tsAngedockt)        te.status = 'angedockt';
    else if (te.tsAnkunft)          te.status = 'ankunft';
    else                            te.status = 'erwartet';

    // ── Planabweichung (Zeit-Bewertung, getrennt vom Prozess-Status) ──
    te.planabweichung  = false;
    te.abweichungGrund = null;
    te.ueberfaelligMin = null;
    if (te.status === 'erwartet' && te.geplantStart) {
      const ueberfaellig = diffMin(te.geplantStart, jetzt);
      if (ueberfaellig >= cfg.toleranzMin) {
        te.planabweichung  = true;
        te.abweichungGrund = 'überfällig';
        te.ueberfaelligMin = ueberfaellig;
      }
    } else if (te.status !== 'eingelagert'
               && te.verzoegerungMin != null
               && te.verzoegerungMin >= cfg.toleranzMin) {
      te.planabweichung  = true;
      te.abweichungGrund = 'verzögert';
    }

    // ── Andock-Regel ──
    te.andockVerspaetet = false;
    te.andockVerzugMin  = null;
    if (te.geplantStart && te.tsAngedockt) {
      const verzug = diffMin(te.geplantStart, te.tsAngedockt);
      if (verzug > ANDOCK_TOLERANZ_MIN) {
        te.andockVerspaetet = true;
        te.andockVerzugMin  = verzug;
      }
    }

    // ── Aggregate über die Positionen ──
    te.anzahlPositionen = te.produkte.length;
    te.anlieferpaletten = te.produkte.reduce((s, p) => s + (p.anlieferpaletten || 0), 0);
  }

  // ── Auswertungs-Kennzahlen je TE ─────────────────────────────────────────
  //
  //  Pünktlichkeit  – Ankunft am Kontrollpunkt gegen das geplante Zeitfenster.
  //                   Zu früh zählt als pünktlich (Abweichung = 0).
  //                   Nicht bewertbar ohne geplanten Start oder ohne Ankunft.
  //  Mengentreue    – Summe Ist-Menge gegen Summe Soll-Menge über alle
  //                   Positionen. Nicht bewertbar ohne Soll-Menge.
  //  Abweichende Menge – Ist − Soll (vorzeichenbehaftet) je TE.
  //  Durchlaufzeit  – Ankunft → Fertigstellung in Minuten.
  //  OTIF           – pünktlich UND mengentreu. Nicht bewertbar sobald eine
  //                   der beiden Teilkennzahlen nicht bewertbar ist.
  //
  //  Jede Kennzahl ist dreiwertig: true / false / null (= nicht bewertbar).
  //  Nicht bewertbare TEs fließen NICHT in die Quoten ein, werden aber in der
  //  Liste als "n. b." ausgewiesen — so verfälschen Datenlücken keine Quote.
  function berechneKennzahlen(te, cfg = CFG_DEFAULT) {
    // Anker für die Zeitraumzuordnung: geplanter Start, sonst Ankunft,
    // sonst Fertigstellung. Ohne Anker ist die TE keinem Zeitraum zuzuordnen.
    te.ankerDatum = te.geplantStart ?? te.tsAnkunft ?? te.tsEinlagerung ?? null;

    // ── Pünktlichkeit ──
    te.puenktlich           = null;
    te.puenktlichkeitAbwMin = null;
    if (te.geplantStart && te.tsAnkunft) {
      const abw = diffMin(te.geplantStart, te.tsAnkunft);
      te.puenktlichkeitAbwMin = abw < 0 ? 0 : abw;
      te.puenktlich = te.puenktlichkeitAbwMin <= cfg.toleranzMin;
    }

    // ── Mengentreue / Abweichende Menge ──
    let ist = null, soll = null, abw = null;
    for (const p of te.produkte) {
      if (p.mengeIst  != null) ist  = (ist  ?? 0) + p.mengeIst;
      if (p.mengeSoll != null) soll = (soll ?? 0) + p.mengeSoll;
      if (p.mengeAbweichung != null) abw = (abw ?? 0) + p.mengeAbweichung;
    }
    te.mengeIst  = ist;
    te.mengeSoll = soll;
    // Abweichung: vorberechnete Summe bevorzugen, sonst aus Ist/Soll ableiten.
    te.abweichendeMenge = abw != null ? abw
                        : (ist != null && soll != null ? ist - soll : null);
    te.abweichendeMengeAbs = te.abweichendeMenge == null ? null : Math.abs(te.abweichendeMenge);

    te.mengenAbwPct = null;
    te.mengentreu   = null;
    if (te.abweichendeMenge != null) {
      if (soll != null && soll !== 0) {
        te.mengenAbwPct = (te.abweichendeMenge / soll) * 100;
        te.mengentreu   = Math.abs(te.mengenAbwPct) <= cfg.mengenToleranzPct;
      } else {
        // Kein (oder Null-)Soll: nur exakte Nullabweichung gilt als mengentreu.
        te.mengenAbwPct = te.abweichendeMenge === 0 ? 0 : null;
        te.mengentreu   = te.abweichendeMenge === 0;
      }
    }

    // ── Durchlaufzeit: Ankunft → Fertigstellung ──
    te.durchlaufzeitMin = (te.tsAnkunft && te.tsEinlagerung)
      ? diffMin(te.tsAnkunft, te.tsEinlagerung)
      : null;
    // Negative Werte (fehlerhafte Zeitstempel) verwerfen statt verfälschen.
    if (te.durchlaufzeitMin != null && te.durchlaufzeitMin < 0) te.durchlaufzeitMin = null;

    // ── OTIF ──
    te.otif = (te.puenktlich == null || te.mengentreu == null)
      ? null
      : (te.puenktlich && te.mengentreu);
  }

  // Baut die Warnleiste einer TE (wird in der Detailsicht angezeigt).
  // Positionsfelder lösen aus, sobald MINDESTENS EINE Position betroffen ist.
  function baueWarnungen(te) {
    const w = [];
    const pos = te.produkte;
    const n   = pos.length;

    // 1) Priorität — TE-Ebene.
    if (te.prioritaet && te.prioritaet.key) {
      w.push({
        typ: 'prio', icon: '🔺', farbe: 'warn',
        label: 'Priorität',
        tooltip: 'Priorität: ' + (keyTextStr(te.prioritaet) ?? te.prioritaet.key),
      });
    }

    // 2) Kritischer Artikel — Positionsebene.
    const kritPos = pos.filter(p => p.kritKategorie && p.kritKategorie.key);
    if (kritPos.length) {
      const meldungen = [...new Set(kritPos.map(p => keyTextStr(p.kritKategorie)))];
      const freitexte = [...new Set(pos.map(p => p.kritFreitext).filter(Boolean))];
      w.push({
        typ: 'krit', icon: '⚠', farbe: 'krit',
        label: 'Kritischer Artikel',
        tooltip: `Kritischer Artikel (${kritPos.length} von ${n} Positionen):\n· `
               + meldungen.join('\n· ')
               + (freitexte.length ? '\n\nFreitext:\n· ' + freitexte.join('\n· ') : ''),
      });
    }

    // 3) Qualitätsprüfgruppe — Positionsebene.
    const qpPos = pos.filter(p => !isNull(p.qpGruppe));
    if (qpPos.length) {
      const gruppen = [...new Set(qpPos.map(p => p.qpGruppe))];
      w.push({
        typ: 'qp', icon: '🔬', farbe: 'qp',
        label: 'Qualitätsprüfung',
        tooltip: `${qpPos.length} von ${n} Positionen prüfpflichtig\nPrüfgruppe: ${gruppen.join(', ')}`,
      });
    }

    // 4) Bänder — Positionsebene.
    const bandPos = pos.filter(p => p.baender);
    if (bandPos.length) {
      w.push({
        typ: 'baender', icon: '🎗', farbe: 'info',
        label: 'Bänder',
        tooltip: `${bandPos.length} von ${n} Positionen müssen gebändert werden`,
      });
    }

    // 5) Nullbestand — Positionsebene.
    const nullPos = pos.filter(p => p.bestand == null || p.bestand === 0);
    if (nullPos.length) {
      const namen = nullPos.slice(0, 5).map(p => p.name);
      w.push({
        typ: 'nullbestand', icon: '📦', farbe: 'warn',
        label: 'Nullbestand',
        tooltip: `${nullPos.length} von ${n} Positionen ohne Lagerbestand:\n· `
               + namen.join('\n· ')
               + (nullPos.length > 5 ? `\n… und ${nullPos.length - 5} weitere` : ''),
      });
    }

    // 6) TE-Hinweis — Freitext.
    if (!isNull(te.teHinweis)) {
      w.push({
        typ: 'hinweis', icon: '📝', farbe: 'info',
        label: 'Hinweis',
        tooltip: te.teHinweis,
      });
    }

    // 7) Mengenabweichung — neue Kennzahl, auch im Detail sichtbar machen.
    if (te.abweichendeMenge != null && te.abweichendeMenge !== 0) {
      w.push({
        typ: 'menge', icon: '⚖', farbe: 'warn',
        label: 'Mengenabweichung',
        tooltip: `Abweichende Menge: ${fmtDelta(te.abweichendeMenge)}`
               + (te.mengeSoll != null ? ` (Soll ${fmtNum(te.mengeSoll)} / Ist ${fmtNum(te.mengeIst)})` : ''),
      });
    }

    return w;
  }

  // ── Zeiträume ────────────────────────────────────────────────────────────
  //
  //  Ein Zeitraum ist immer { von, bis } mit tagesgenauen UTC-Grenzen:
  //  `von` inklusiv, `bis` exklusiv (= Tag nach dem letzten ausgewerteten Tag).
  //
  //  Vordefiniert:
  //    gestern      – der komplette Vortag
  //    dieseWoche   – Montag dieser Woche bis einschließlich heute
  //    letzteWoche  – die abgeschlossene Vorwoche (Mo bis So)
  //    standard     – Montag der Vorwoche bis einschließlich gestern
  //                   (Voreinstellung des Zeitraum-Sliders)

  const TAG_MS = 86400000;

  // Kappt ein Datum auf den UTC-Tagesbeginn.
  const tagStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  // Heutiger Tag als UTC-Wanduhr-Datum (00:00).
  const heuteTag = () => tagStart(jetztWanduhr());

  // Montag der Woche, in der `d` liegt.
  const montagVon = (d) => {
    const t  = tagStart(d);
    const wd = t.getUTCDay();                 // 0 = Sonntag
    return new Date(t.getTime() + (wd === 0 ? -6 : 1 - wd) * TAG_MS);
  };

  const tagePlus = (d, n) => new Date(tagStart(d).getTime() + n * TAG_MS);

  // Liefert den Bereich zu einem vordefinierten Zeitfilter.
  function presetBereich(id) {
    const heute   = heuteTag();
    const moDiese = montagVon(heute);
    switch (id) {
      case 'gestern':     return { von: tagePlus(heute, -1), bis: heute };
      case 'dieseWoche':  return { von: moDiese,             bis: tagePlus(heute, 1) };
      case 'letzteWoche': return { von: tagePlus(moDiese, -7), bis: moDiese };
      case 'standard':
      default:            return { von: tagePlus(moDiese, -7), bis: heute };
    }
  }

  // Erkennt, ob ein Bereich exakt einem vordefinierten Filter entspricht.
  function presetErkennen(bereich) {
    for (const id of ['gestern', 'dieseWoche', 'letzteWoche']) {
      const p = presetBereich(id);
      if (p.von.getTime() === bereich.von.getTime() && p.bis.getTime() === bereich.bis.getTime()) return id;
    }
    return null;
  }

  // Anzahl ausgewerteter Tage.
  const bereichTage = (b) => Math.max(1, Math.round((b.bis - b.von) / TAG_MS));

  // Klartext-Beschriftung: "12.08.2026" bzw. "03.08.2026 – 13.08.2026".
  function bereichLabel(b) {
    const letzterTag = new Date(b.bis.getTime() - TAG_MS);
    return b.von.getTime() === letzterTag.getTime()
      ? fmtDate(b.von)
      : `${fmtDate(b.von)} – ${fmtDate(letzterTag)}`;
  }

  // Name des Zeitraums für die Kopfzeile — Preset-Name, sonst "Zeitraum".
  const PRESET_NAMEN = {
    gestern:     'Gestern',
    dieseWoche:  'Diese Woche',
    letzteWoche: 'Letzte Woche',
  };
  function bereichName(b) {
    const p = presetErkennen(b);
    if (p) return PRESET_NAMEN[p];
    const std = presetBereich('standard');
    if (std.von.getTime() === b.von.getTime() && std.bis.getTime() === b.bis.getTime()) {
      return 'Letzte Woche bis gestern';
    }
    return 'Individueller Zeitraum';
  }

  // Unmittelbar vorausgehender Zeitraum gleicher Länge — Vergleichsbasis der
  // Kennzahlen-Karten. Funktioniert für jeden beliebig gewählten Bereich.
  function vorperiode(b) {
    const laenge = b.bis - b.von;
    return { von: new Date(b.von.getTime() - laenge), bis: new Date(b.von.getTime()) };
  }

  // Filtert TEs auf einen Bereich. Anker ist das geplante Startdatum
  // (Fallback Ankunft / Fertigstellung). TEs ohne jeden Anker gehören in
  // keinen Zeitraum und werden bewusst ausgeblendet, statt sie irgendwo
  // einzusortieren.
  function tesImBereich(alleTes, b) {
    return alleTes.filter(te => te.ankerDatum && te.ankerDatum >= b.von && te.ankerDatum < b.bis);
  }

  // ── Aggregation ──────────────────────────────────────────────────────────
  //
  //  Quote = erfüllte TEs / bewertbare TEs. TEs ohne ausreichende Daten
  //  landen in `nb` (nicht bewertbar) und verwässern die Quote nicht.
  function quote(tes, feld) {
    let ok = 0, bewertbar = 0, nb = 0;
    for (const te of tes) {
      const v = te[feld];
      if (v == null) { nb++; continue; }
      bewertbar++;
      if (v === true) ok++;
    }
    return {
      ok, bewertbar, nb,
      wert: bewertbar > 0 ? (ok / bewertbar) * 100 : null,
    };
  }

  // Aggregiert einen Satz TEs zu allen fünf Kennzahlen. Das identische Gerüst
  // wird sowohl für die Gesamtsumme als auch je Ladestelle verwendet, damit
  // die Hover-Aufschlüsselung exakt dieselbe Rechnung nutzt wie die Karte.
  function aggregiereBasis(tes) {
    const dlz = tes.map(t => t.durchlaufzeitMin).filter(v => v != null);
    const dlzSum = dlz.reduce((s, v) => s + v, 0);

    let summeAbs = 0, netto = 0, betroffen = 0, mengeBewertbar = 0;
    for (const te of tes) {
      if (te.abweichendeMenge == null) continue;
      mengeBewertbar++;
      summeAbs += Math.abs(te.abweichendeMenge);
      netto    += te.abweichendeMenge;
      if (te.abweichendeMenge !== 0) betroffen++;
    }

    return {
      anzahl:     tes.length,
      otif:       quote(tes, 'otif'),
      puenktlich: quote(tes, 'puenktlich'),
      mengentreu: quote(tes, 'mengentreu'),
      durchlaufzeit: {
        wert:      dlz.length ? dlzSum / dlz.length : null,
        bewertbar: dlz.length,
        nb:        tes.length - dlz.length,
        min:       dlz.length ? Math.min(...dlz) : null,
        max:       dlz.length ? Math.max(...dlz) : null,
      },
      abwMenge: {
        wert:      mengeBewertbar ? summeAbs : null,   // Summe der Beträge
        netto:     mengeBewertbar ? netto : null,
        betroffen,
        bewertbar: mengeBewertbar,
        nb:        tes.length - mengeBewertbar,
      },
    };
  }

  function aggregiere(tes) {
    const gesamt = aggregiereBasis(tes);

    // ── Aufschlüsselung je Ladestelle ──
    // Feste Reihenfolge BSL · Container · Landverkehr. Jede TE fällt über
    // ladestelleKurz() in genau eine Gruppe (unbekannt/leer → BSL, wie im
    // restlichen Widget). Nur tatsächlich vertretene Gruppen werden geliefert.
    const gruppen = new Map();
    for (const te of tes) {
      const ls = ladestelleKurz(te.ladestelle);
      if (!gruppen.has(ls)) gruppen.set(ls, []);
      gruppen.get(ls).push(te);
    }
    gesamt.ladestellen = LADESTELLE_KATEGORIEN
      .filter(ls => gruppen.has(ls))
      .map(ls => ({ ls, ...aggregiereBasis(gruppen.get(ls)) }));

    return gesamt;
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

        /* Status-Farben (heller für besseren Kontrast im Dark-Mode) */
        --c-green:      #2ecc71;
        --c-green-dim:  rgba(46, 204, 113, 0.18);
        --c-yellow:     #f5b041;
        --c-yellow-dim: rgba(245, 176, 65, 0.18);
        --c-blue:       #3d9ad6;
        --c-blue-dim:   rgba(61, 154, 214, 0.18);

        /* Dark-Theme Hintergründe (etwas aufgehellt für mehr Tiefe) */
        --c-bg:         #10131b;
        --c-bg2:        #191e2b;
        --c-bg3:        #232a3e;
        --c-bg4:        #2e3650;

        /* Dark-Theme Texte (deutlich höherer Kontrast) */
        --c-text:       #f2f4f8;
        --c-text2:      #b4bacc;
        --c-text3:      #7e8598;

        /* Dark-Theme Ränder (sichtbarer) */
        --c-border:     rgba(255, 255, 255, 0.11);
        --c-border2:    rgba(255, 255, 255, 0.18);

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
        display:       flex;
        align-items:   center;
        gap:           12px;
        flex-wrap:     wrap;
        padding:       10px 16px;
        background:    var(--c-bg2);
        border-bottom: 1px solid var(--c-border);
        flex-shrink:   0;
      }

      .header-brand {
        display:        flex;
        align-items:    center;
        gap:            7px;
        font-family:    var(--font-mono);
        font-size:      11px;
        font-weight:    700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color:          var(--c-text);
        flex-shrink:    0;
      }

      .header-brand-dot {
        width:         8px;
        height:        8px;
        border-radius: 50%;
        background:    var(--c-red-light);
        box-shadow:    0 0 0 3px var(--c-red-dim);
      }

      .header-title {
        font-size:   12px;
        color:       var(--c-text2);
        white-space: nowrap;
        overflow:    hidden;
        text-overflow: ellipsis;
      }

      .header-sep { flex: 1; }

      .header-meta {
        font-family: var(--font-mono);
        font-size:   10px;
        color:       var(--c-text3);
        white-space: nowrap;
      }

      .theme-btn {
        width:         28px;
        height:        28px;
        border-radius: var(--r-sm);
        background:    var(--c-bg3);
        border:        1px solid var(--c-border);
        color:         var(--c-text2);
        font-size:     14px;
        line-height:   1;
        flex-shrink:   0;
        transition:    background 0.15s, color 0.15s;
      }
      .theme-btn:hover { background: var(--c-bg4); color: var(--c-text); }

      /* ── Navigationszeile ── */
      .navbar {
        display:       flex;
        align-items:   center;
        gap:           10px;
        flex-wrap:     wrap;
        padding:       8px 16px;
        background:    var(--c-bg);
        border-bottom: 1px solid var(--c-border);
        flex-shrink:   0;
      }

      .nav-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color:          var(--c-text3);
        flex-shrink:    0;
      }

      .zeitraum-tabs {
        display: inline-flex;
        gap:     4px;
        padding: 3px;
        background: var(--c-bg2);
        border:  1px solid var(--c-border);
        border-radius: var(--r-md);
      }

      .zeitraum-tab {
        padding:       5px 14px;
        border-radius: var(--r-sm);
        font-size:     12px;
        font-weight:   600;
        color:         var(--c-text3);
        transition:    background 0.15s, color 0.15s;
        white-space:   nowrap;
      }
      .zeitraum-tab:hover  { color: var(--c-text2); }
      .zeitraum-tab.active { background: var(--c-red); color: #fff; }

      .nav-sep { flex: 1; }

      .refresh-btn {
        display:        inline-flex;
        align-items:    center;
        gap:            6px;
        padding:        6px 12px;
        border-radius:  var(--r-sm);
        background:     var(--c-bg3);
        border:         1px solid var(--c-border);
        color:          var(--c-text2);
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transition:     background 0.15s, color 0.15s;
      }
      .refresh-btn:hover { background: var(--c-bg4); color: var(--c-text); }

      .refresh-icon { display: inline-block; font-size: 12px; }
      .refresh-icon.spinning { animation: spin 0.6s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Body / Views ── */
      .body {
        position: relative;
        flex:     1;
        overflow: hidden;
      }

      .view {
        display:  none;
        height:   100%;
        overflow: auto;
        padding:  16px;
      }
      .view.active { display: block; }

      /* ── Zustands-Overlays ── */
      .state-overlay {
        position:        absolute;
        inset:           0;
        display:         flex;
        flex-direction:  column;
        align-items:     center;
        justify-content: center;
        gap:             12px;
        background:      var(--c-bg);
        z-index:         20;
      }
      .state-overlay.hidden { display: none; }

      .state-icon { font-size: 34px; opacity: 0.5; }

      .state-text {
        font-family:    var(--font-mono);
        font-size:      11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          var(--c-text3);
        text-align:     center;
        max-width:      420px;
        line-height:    1.6;
      }

      .loader-ring {
        width:         30px;
        height:        30px;
        border:        2px solid var(--c-border2);
        border-top-color: var(--c-red-light);
        border-radius: 50%;
        animation:     spin 0.8s linear infinite;
      }
      /* ═══ Coole WE-Ladeanimation ═══ */
      .we-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 26px;
      }

      .we-loader-scene {
        position: relative;
        width: 280px;
        height: 90px;
      }

      /* Fahrbahn */
      .we-road {
        position: absolute;
        bottom: 18px;
        left: 0;
        width: 220px;
        height: 3px;
        background: var(--c-border2);
        border-radius: 2px;
        overflow: hidden;
      }
      .we-road-line {
        position: absolute;
        top: 1px;
        left: 0;
        width: 100%;
        height: 1px;
        background: repeating-linear-gradient(90deg,
          var(--c-text3) 0, var(--c-text3) 8px,
          transparent 8px, transparent 16px);
        animation: we-road-move 0.6s linear infinite;
      }
      @keyframes we-road-move { to { transform: translateX(-16px); } }

      /* LKW */
      .we-truck {
        position: absolute;
        bottom: 20px;
        left: 0;
        animation: we-truck-drive 3s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }
      @keyframes we-truck-drive {
        0%        { left: 0; }
        45%       { left: 150px; }
        55%       { left: 150px; }
        100%      { left: 0; }
      }

      .we-truck-body { position: relative; display: flex; align-items: flex-end; gap: 2px; }
      .we-truck-trailer {
        width: 34px; height: 22px;
        background: var(--c-red);
        border-radius: 2px;
        order: 1;
      }
      .we-truck-cabin {
        width: 14px; height: 15px;
        background: var(--c-red-light);
        border-radius: 3px 3px 2px 2px;
        order: 2;
        position: relative;
      }
      .we-truck-cabin::after {
        content: '';
        position: absolute;
        top: 2px; right: 2px;
        width: 6px; height: 5px;
        background: var(--c-bg);
        border-radius: 1px;
        opacity: 0.6;
      }
      .we-truck-wheel {
        position: absolute;
        bottom: -4px;
        width: 7px; height: 7px;
        background: var(--c-text2);
        border: 1.5px solid var(--c-text3);
        border-radius: 50%;
        animation: spin 0.4s linear infinite;
      }
      .we-wheel-1 { left: 3px; }
      .we-wheel-2 { left: 22px; }
      .we-wheel-3 { left: 38px; }

      /* Tor / Halle */
      .we-gate {
        position: absolute;
        bottom: 20px;
        right: 6px;
        width: 44px;
        height: 52px;
      }
      .we-gate-roof {
        width: 0; height: 0;
        border-left: 24px solid transparent;
        border-right: 24px solid transparent;
        border-bottom: 14px solid var(--c-bg4);
        margin: 0 -2px;
      }
      .we-gate-door {
        width: 44px;
        height: 38px;
        background: var(--c-bg3);
        border: 2px solid var(--c-bg4);
        border-top: none;
        border-radius: 0 0 2px 2px;
        position: relative;
        overflow: hidden;
      }
      .we-gate-door::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 100%;
        background: repeating-linear-gradient(0deg,
          var(--c-bg4) 0, var(--c-bg4) 4px,
          transparent 4px, transparent 8px);
        animation: we-door-open 3s ease-in-out infinite;
      }
      @keyframes we-door-open {
        0%, 40%   { transform: translateY(0); }
        50%, 90%  { transform: translateY(-100%); }
        100%      { transform: translateY(0); }
      }

      /* Prozess-Schritte */
      .we-steps {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .we-step {
        display: flex;
        align-items: center;
        gap: 5px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--c-text3);
        opacity: 0.4;
        transition: opacity 0.3s, color 0.3s;
      }
      .we-step-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: var(--c-border2);
        transition: background 0.3s, box-shadow 0.3s;
      }
      .we-step.we-step-active {
        opacity: 1;
        color: var(--c-text);
      }
      .we-step.we-step-active .we-step-dot {
        background: var(--c-red);
        box-shadow: 0 0 8px var(--c-red);
      }

      .we-loader-text {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--c-text2);
        letter-spacing: 0.03em;
      }
      .we-dots span {
        animation: we-dot-blink 1.4s infinite;
      }
      .we-dots span:nth-child(2) { animation-delay: 0.2s; }
      .we-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes we-dot-blink {
        0%, 60%, 100% { opacity: 0.2; }
        30%           { opacity: 1; }
      }
      /* ════════════════════════════════════════════════════════════
         ZEITRAUMAUSWAHL (Presets + Zwei-Punkt-Slider)
      ════════════════════════════════════════════════════════════ */

      .zr-leiste {
        display:       flex;
        align-items:   center;
        gap:           14px;
        flex-wrap:     wrap;
        padding:       10px 16px;
        background:    var(--c-bg);
        border-bottom: 1px solid var(--c-border);
        flex-shrink:   0;
      }

      .zr-presets {
        display:       inline-flex;
        gap:           4px;
        padding:       3px;
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-md);
      }

      .zr-preset {
        padding:       5px 13px;
        border-radius: var(--r-sm);
        font-size:     12px;
        font-weight:   600;
        color:         var(--c-text3);
        white-space:   nowrap;
        transition:    background 0.15s, color 0.15s;
      }
      .zr-preset:hover  { color: var(--c-text2); }
      .zr-preset.active { background: var(--c-red); color: #fff; }

      /* ── Slider ── */
      .zr-slider-block {
        display:       flex;
        flex-direction: column;
        gap:           4px;
        flex:          1 1 320px;
        min-width:     260px;
        max-width:     620px;
      }

      .zr-slider-kopf {
        display:       flex;
        align-items:   baseline;
        justify-content: space-between;
        gap:           8px;
        font-family:   var(--font-mono);
        font-size:     10px;
        color:         var(--c-text3);
      }

      .zr-slider-werte {
        color:       var(--c-text);
        font-weight: 700;
      }

      /* Zwei übereinanderliegende range-Inputs: die Spuren sind transparent,
         sichtbar ist nur die eigene Spur darunter. pointer-events wird auf die
         Daumen beschränkt, damit sich beide Punkte unabhängig greifen lassen. */
      .zr-slider {
        position: relative;
        height:   26px;
      }

      .zr-slider-spur {
        position:      absolute;
        top:           11px;
        left:          0;
        right:         0;
        height:        4px;
        border-radius: 2px;
        background:    var(--c-bg4);
      }

      .zr-slider-fill {
        position:      absolute;
        top:           11px;
        height:        4px;
        border-radius: 2px;
        background:    var(--c-red-light);
      }

      .zr-slider input[type="range"] {
        position:   absolute;
        top:        0;
        left:       0;
        width:      100%;
        height:     26px;
        margin:     0;
        background: none;
        appearance: none;
        -webkit-appearance: none;
        pointer-events: none;
        outline:    none;
      }

      .zr-slider input[type="range"]::-webkit-slider-runnable-track {
        height: 26px; background: none; border: none;
      }
      .zr-slider input[type="range"]::-moz-range-track {
        height: 26px; background: none; border: none;
      }

      .zr-slider input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        pointer-events: auto;
        width:         16px;
        height:        16px;
        margin-top:    5px;
        border-radius: 50%;
        background:    var(--c-bg2);
        border:        3px solid var(--c-red-light);
        box-shadow:    var(--shadow-sm);
        cursor:        grab;
      }
      .zr-slider input[type="range"]::-moz-range-thumb {
        pointer-events: auto;
        width:         16px;
        height:        16px;
        border-radius: 50%;
        background:    var(--c-bg2);
        border:        3px solid var(--c-red-light);
        box-shadow:    var(--shadow-sm);
        cursor:        grab;
      }
      .zr-slider input[type="range"]:active::-webkit-slider-thumb { cursor: grabbing; }
      .zr-slider input[type="range"]:focus-visible::-webkit-slider-thumb {
        outline: 2px solid var(--c-text2); outline-offset: 2px;
      }

      .zr-slider-skala {
        display:     flex;
        justify-content: space-between;
        font-family: var(--font-mono);
        font-size:   9px;
        color:       var(--c-text3);
      }

      .zr-reset {
        font-family:    var(--font-mono);
        font-size:      10px;
        color:          var(--c-text3);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        white-space:    nowrap;
      }
      .zr-reset:hover { color: var(--c-text); }

      /* ── Banner: aktiver Zeitraum ── */
      .zr-aktiv {
        display:       flex;
        align-items:   center;
        gap:           10px;
        flex-wrap:     wrap;
        padding:       9px 13px;
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-left:   3px solid var(--c-red);
        border-radius: var(--r-md);
        margin-bottom: 14px;
      }

      .zr-aktiv-titel {
        font-size:   13px;
        font-weight: 700;
        color:       var(--c-text);
      }

      .zr-aktiv-datum {
        font-family: var(--font-mono);
        font-size:   12px;
        color:       var(--c-text2);
      }

      .zr-aktiv-meta {
        font-family: var(--font-mono);
        font-size:   10px;
        color:       var(--c-text3);
        margin-left: auto;
        text-align:  right;
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

      .badge-erwartet        { background: var(--c-bg4);         color: var(--c-text3); }
      .badge-ankunft         { background: var(--c-yellow-dim);  color: #f0b429; }
      .badge-angedockt       { background: var(--c-yellow-dim);  color: #f0b429; }
      .badge-entladen        { background: var(--c-blue-dim);    color: #5dade2; }
      .badge-entladen_fertig { background: var(--c-blue-dim);    color: #5dade2; }
      .badge-fertigstellung  { background: rgba(22,160,133,.18); color: #1abc9c; }
      .badge-eingelagert     { background: var(--c-green-dim);   color: #58d68d; }
      .badge-abgefahren      { background: var(--c-bg4);         color: var(--c-text3); }
      .w-warn { color: var(--c-yellow); }
      .w-krit { color: var(--c-red-light); }
      .w-qp   { color: var(--c-blue); }
      .w-info { color: var(--c-text2); }
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
         VIEW 1 – ÜBERSICHT (Auswertung)
      ════════════════════════════════════════════════════════════ */

      .u-abschnitt { margin-bottom: 20px; }

      .u-titel {
        display:        flex;
        align-items:    center;
        gap:            8px;
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color:          var(--c-text3);
        margin-bottom:  10px;
      }
      .u-titel::after {
        content: ''; flex: 1; height: 1px; background: var(--c-border);
      }

      /* ── Kennzahlen-Karten ──────────────────────────────────────
         auto-fit sorgt dafür, dass die 5 Karten je nach Breite in
         5 / 3 / 2 / 1 Spalten umbrechen — ohne Media Queries. */
      .kpi-cards {
        display:               grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap:                   10px;
      }

      .kpi-card {
        position:      relative;
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-lg);
        padding:       12px 14px;
        display:       flex;
        flex-direction: column;
        gap:           6px;
        min-width:     0;
      }

      .kpi-card.hat-breakdown { cursor: help; }
      .kpi-card.hat-breakdown:hover,
      .kpi-card.hat-breakdown:focus-visible {
        border-color: var(--c-border2);
        outline:      none;
      }

      .kpi-card-kopf {
        display:     flex;
        align-items: center;
        gap:         6px;
      }

      /* dezentes Icon rechts, signalisiert die Aufschlüsselung */
      .kpi-card-info {
        margin-left: auto;
        font-size:   11px;
        line-height: 1;
        color:       var(--c-text3);
        opacity:     0.7;
        flex-shrink: 0;
      }
      .kpi-card.hat-breakdown:hover .kpi-card-info,
      .kpi-card.hat-breakdown:focus-visible .kpi-card-info {
        color:   var(--c-red-light);
        opacity: 1;
      }

      /* ── Hover-Aufschlüsselung nach Ladestelle ── */
      .kpi-breakdown {
        position:      absolute;
        top:           calc(100% + 6px);
        left:          0;
        right:         0;
        z-index:       30;
        background:    var(--c-bg3);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-md);
        box-shadow:    var(--shadow-lg);
        padding:       10px 12px;
        display:       none;
        flex-direction: column;
        gap:           7px;
      }
      /* Nach unten kein Platz? Dann greift die Modifier-Klasse (per JS gesetzt)
         und klappt das Popup nach oben auf. */
      .kpi-card.bd-oben .kpi-breakdown {
        top:    auto;
        bottom: calc(100% + 6px);
      }
      .kpi-card.hat-breakdown:hover .kpi-breakdown,
      .kpi-card.hat-breakdown:focus-within .kpi-breakdown {
        display: flex;
      }

      .kpi-bd-titel {
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          var(--c-text3);
      }

      .kpi-bd-row {
        display:     grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap:         8px;
      }

      .kpi-bd-badge { flex-shrink: 0; }

      .kpi-bd-bar {
        height:        5px;
        border-radius: 3px;
        background:    var(--c-bg);
        overflow:      hidden;
        min-width:     40px;
      }
      .kpi-bd-bar-fill {
        height:     100%;
        border-radius: 3px;
        background: var(--c-text3);
      }
      .kpi-bd-bar-fill.q-gut      { background: #2ecc71; }
      .kpi-bd-bar-fill.q-mittel   { background: #f5b041; }
      .kpi-bd-bar-fill.q-schlecht { background: #e74c3c; }

      .kpi-bd-wert {
        font-family: var(--font-mono);
        font-size:   12px;
        font-weight: 700;
        color:       var(--c-text);
        text-align:  right;
        white-space: nowrap;
      }
      .kpi-bd-wert.q-gut      { color: #58d68d; }
      .kpi-bd-wert.q-mittel   { color: #f0b429; }
      .kpi-bd-wert.q-schlecht { color: #e74c3c; }
      .kpi-bd-wert.q-nb       { color: var(--c-text3); }

      .kpi-bd-meta {
        font-family: var(--font-mono);
        font-size:   9px;
        color:       var(--c-text3);
        white-space: nowrap;
        min-width:   48px;
        text-align:  right;
      }

      .kpi-bd-fuss {
        font-size:   9px;
        color:       var(--c-text3);
        padding-top: 4px;
        border-top:  1px solid var(--c-border);
      }

      .kpi-card-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          var(--c-text3);
        white-space:    nowrap;
        overflow:       hidden;
        text-overflow:  ellipsis;
      }

      .kpi-card-wert {
        font-family:  var(--font-mono);
        font-size:    26px;
        font-weight:  700;
        line-height:  1.05;
        color:        var(--c-text);
        letter-spacing: -0.02em;
      }

      .kpi-card-wert.q-gut      { color: #58d68d; }
      .kpi-card-wert.q-mittel   { color: #f0b429; }
      .kpi-card-wert.q-schlecht { color: #e74c3c; }
      .kpi-card-wert.q-nb       { color: var(--c-text3); }

      .kpi-card-sub {
        font-size: 10px;
        color:     var(--c-text3);
        line-height: 1.5;
      }

      /* Vergleich mit dem jeweils anderen Zeitraum */
      .kpi-card-vgl {
        display:     flex;
        align-items: center;
        gap:         6px;
        font-family: var(--font-mono);
        font-size:   10px;
        color:       var(--c-text3);
        padding-top: 6px;
        border-top:  1px solid var(--c-border);
        flex-wrap:   wrap;
      }

      .kpi-trend {
        font-weight:   700;
        padding:       1px 5px;
        border-radius: var(--r-sm);
      }
      .kpi-trend.auf   { background: var(--c-green-dim);  color: #58d68d; }
      .kpi-trend.ab    { background: var(--c-red-dim);    color: #e74c3c; }
      .kpi-trend.gleich{ background: var(--c-bg4);        color: var(--c-text3); }

      /* Balken unter der Quote */
      .kpi-bar {
        height:        4px;
        border-radius: 2px;
        background:    var(--c-bg4);
        overflow:      hidden;
      }
      .kpi-bar-fill {
        height:     100%;
        border-radius: 2px;
        background: var(--c-text3);
        transition: width 0.3s var(--ease);
      }
      .kpi-bar-fill.q-gut      { background: #2ecc71; }
      .kpi-bar-fill.q-mittel   { background: #f5b041; }
      .kpi-bar-fill.q-schlecht { background: #e74c3c; }

      /* ── Filterleiste ── */
      .u-filterbar {
        display:     flex;
        align-items: center;
        gap:         8px;
        flex-wrap:   wrap;
        padding:     8px 10px;
        background:  var(--c-bg2);
        border:      1px solid var(--c-border);
        border-radius: var(--r-md);
        margin-bottom: 10px;
      }

      .f-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color:          var(--c-text3);
      }

      .f-chips { display: flex; gap: 4px; flex-wrap: wrap; }

      .f-chip {
        padding:       4px 10px;
        border-radius: 999px;
        border:        1px solid var(--c-border);
        background:    var(--c-bg3);
        color:         var(--c-text3);
        font-size:     11px;
        font-weight:   600;
        white-space:   nowrap;
        transition:    background 0.15s, color 0.15s, border-color 0.15s;
      }
      .f-chip:hover  { color: var(--c-text2); }
      .f-chip.active {
        background:   var(--c-red-dim);
        border-color: var(--c-red-border);
        color:        #e74c3c;
      }

      .f-suche {
        display:       flex;
        align-items:   center;
        gap:           6px;
        padding:       4px 8px;
        background:    var(--c-bg3);
        border:        1px solid var(--c-border);
        border-radius: var(--r-sm);
        min-width:     170px;
        flex:          1 1 170px;
        max-width:     280px;
      }
      .f-suche-ico { font-size: 11px; opacity: 0.6; }
      .f-suche-input {
        flex:       1;
        min-width:  0;
        background: none;
        border:     none;
        outline:    none;
        color:      var(--c-text);
        font-family: var(--font);
        font-size:  12px;
      }
      .f-suche-input::placeholder { color: var(--c-text3); }
      .f-suche-clear {
        color: var(--c-text3); font-size: 14px; line-height: 1; padding: 0 2px;
      }
      .f-suche-clear:hover { color: var(--c-text); }
      .f-suche-clear.hidden { display: none; }

      .f-select {
        padding:       4px 8px;
        background:    var(--c-bg3);
        border:        1px solid var(--c-border);
        border-radius: var(--r-sm);
        color:         var(--c-text);
        font-family:   var(--font);
        font-size:     12px;
        outline:       none;
      }

      .f-reset {
        margin-left:   auto;
        font-family:   var(--font-mono);
        font-size:     10px;
        color:         var(--c-text3);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .f-reset:hover { color: var(--c-text); }

      /* ── TE-Tabelle ── */
      .te-tabelle-wrap {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-lg);
        overflow-x:    auto;
        overflow-y:    visible;
      }

      .te-tabelle {
        width:           100%;
        border-collapse: collapse;
        font-size:       12px;
        min-width:       880px;
      }

      .te-tabelle thead th {
        position:       sticky;
        top:            0;
        z-index:        3;
        background:     var(--c-bg3);
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color:          var(--c-text3);
        text-align:     left;
        padding:        9px 10px;
        border-bottom:  1px solid var(--c-border2);
        white-space:    nowrap;
        cursor:         pointer;
        user-select:    none;
      }
      .te-tabelle thead th:hover { color: var(--c-text); }
      .te-tabelle thead th.sortiert { color: var(--c-red-light); }
      .te-tabelle thead th .sort-pfeil { margin-left: 3px; font-size: 8px; }
      .te-tabelle th.num, .te-tabelle td.num { text-align: right; }
      .te-tabelle th.mid, .te-tabelle td.mid { text-align: center; }

      .te-tabelle tbody td {
        padding:       8px 10px;
        border-bottom: 1px solid var(--c-border);
        color:         var(--c-text2);
        vertical-align: middle;
        white-space:   nowrap;
      }
      .te-tabelle tbody tr:last-child td { border-bottom: none; }

      .te-tabelle tbody tr {
        cursor:     pointer;
        transition: background 0.12s;
      }
      .te-tabelle tbody tr:hover td { background: var(--c-bg3); }
      .te-tabelle tbody tr:focus-visible {
        outline: 2px solid var(--c-red-light);
        outline-offset: -2px;
      }
      .te-tabelle tbody tr.verletzt td:first-child {
        box-shadow: inset 3px 0 0 var(--c-red);
      }

      .tt-te {
        font-family: var(--font-mono);
        font-size:   12px;
        font-weight: 700;
        color:       var(--c-text);
      }
      .tt-te-ext { font-family: var(--font-mono); font-size: 10px; color: var(--c-text3); }
      .tt-lieferant {
        max-width:     220px;
        overflow:      hidden;
        text-overflow: ellipsis;
        white-space:   nowrap;
        display:       block;
      }
      .tt-datum { font-family: var(--font-mono); font-size: 11px; color: var(--c-text3); }
      .tt-num   { font-family: var(--font-mono); }
      .tt-muted { color: var(--c-text3); }

      .tt-detail-btn {
        font-family:   var(--font-mono);
        font-size:     10px;
        color:         var(--c-text3);
        padding:       3px 8px;
        border-radius: var(--r-sm);
        border:        1px solid var(--c-border);
        background:    var(--c-bg3);
        white-space:   nowrap;
      }
      .tt-detail-btn:hover { color: var(--c-text); background: var(--c-bg4); }

      /* Dreiwertige Kennzahl-Chips */
      .k-chip {
        display:        inline-block;
        padding:        2px 8px;
        border-radius:  999px;
        font-family:    var(--font-mono);
        font-size:      9px;
        font-weight:    700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .k-ja   { background: var(--c-green-dim);  color: #58d68d; }
      .k-nein { background: var(--c-red-dim);    color: #e74c3c; }
      .k-nb   { background: var(--c-bg4);        color: var(--c-text3); }

      .k-delta.pos  { color: #f0b429; font-family: var(--font-mono); }
      .k-delta.null { color: var(--c-text3); font-family: var(--font-mono); }

      .tt-abw-min { font-size: 10px; color: var(--c-text3); margin-left: 4px; }

      /* Fußzeile der Tabelle */
      .te-tabelle-fuss {
        display:     flex;
        align-items: center;
        gap:         10px;
        flex-wrap:   wrap;
        padding:     8px 4px 0;
        font-family: var(--font-mono);
        font-size:   10px;
        color:       var(--c-text3);
      }

      .u-leer {
        padding:     28px 16px;
        text-align:  center;
        font-family: var(--font-mono);
        font-size:   11px;
        color:       var(--c-text3);
        letter-spacing: 0.08em;
      }

      /* Kompakte Darstellung auf schmalen Breiten */
      @media (max-width: 720px) {
        .view { padding: 12px; }
        .kpi-card-wert { font-size: 22px; }
        .f-suche { max-width: none; }
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

      .dh-delta {
        font-family:  var(--font-mono);
        font-size:    12px;
        font-weight:  700;
        padding:      4px 12px;
        border-radius: var(--r-sm);
      }

      .dh-delta.pos  { background: var(--c-red-dim);   color: #e74c3c; }
      .dh-delta.neg  { background: var(--c-green-dim); color: #58d68d; }

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

      /* ══ Detailansicht (Etappe 3) ══ */
      /* Alle Detailinhalte markierbar & kopierbar (STRG+C) */
      #view-detail, #detail-content { user-select: text; -webkit-user-select: text; }
      #detail-content * { user-select: text; -webkit-user-select: text; }
      .detail-head {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border);
        border-radius: var(--r-lg);
        padding:       16px 18px;
        margin-bottom: 18px;
        position:      relative;
      }
      .detail-head::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0;
        width: 3px; border-radius: var(--r-lg) 0 0 var(--r-lg);
      }
      .detail-head.s-eingelagert::before     { background: var(--c-green); }
      .detail-head.s-fertigstellung::before  { background: #16a085; }
      .detail-head.s-entladen::before        { background: var(--c-blue); }
      .detail-head.s-entladen_fertig::before { background: var(--c-blue); }
      .detail-head.s-angedockt::before       { background: var(--c-yellow); }
      .detail-head.s-ankunft::before         { background: var(--c-yellow); }
      .detail-head.s-erwartet::before        { background: var(--c-text3); }

      .dh-top { display: flex; align-items: center; gap: 12px; }
      .dh-te {
        font-family:    var(--font-mono);
        font-size:      22px;
        font-weight:    700;
        letter-spacing: 0.02em;
        color:          var(--c-text);
      }
      .dh-sub { font-size: 12px; color: var(--c-text2); margin-top: 2px; }
      .dh-ewm {
        margin-left:   auto;
        font-family:   var(--font-mono);
        font-size:     11px;
        color:         var(--c-blue);
        text-decoration: none;
        border:        1px solid var(--c-border2);
        border-radius: var(--r-sm);
        padding:       4px 10px;
      }
      .dh-ewm:hover { background: var(--c-blue-dim); border-color: var(--c-blue); }
      .dh-delta { font-family: var(--font-mono); font-size: 11px; padding: 3px 9px; border-radius: var(--r-sm); }
      .dh-delta.pos { color: var(--c-red-light); background: var(--c-red-dim); }
      .dh-delta.neg { color: var(--c-green); background: var(--c-green-dim); }

      .detail-warnbar { display: flex; flex-wrap: wrap; gap: 7px; margin: 13px 0 4px; }
      .detail-warn {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 11px; padding: 4px 9px; border-radius: var(--r-sm);
        border: 1px solid transparent; cursor: help;
      }
      .detail-warn.w-warn { background: var(--c-yellow-dim); border-color: rgba(245,176,65,.35); color: var(--c-yellow); }
      .detail-warn.w-krit { background: var(--c-red-dim);    border-color: rgba(231,76,60,.4);  color: var(--c-red-light); }
      .detail-warn.w-qp   { background: var(--c-blue-dim);   border-color: rgba(61,154,214,.35);color: var(--c-blue); }
      .detail-warn.w-info { background: var(--c-bg4);        border-color: var(--c-border2);    color: var(--c-text2); }
      .detail-warn-txt { color: var(--c-text); }

      .dh-facts {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px 18px;
        margin-top: 15px;
        padding-top: 14px;
        border-top: 1px solid var(--c-border);
      }
      @media (max-width: 720px) { .dh-facts { grid-template-columns: repeat(2, 1fr); } }
      .dh-fact { display: flex; flex-direction: column; gap: 2px; }
      .dh-fact-l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c-text3); }
      .dh-fact-v { font-size: 13px; color: var(--c-text); font-family: var(--font-mono); }
      .dh-flag { font-size: 10px; padding: 1px 5px; border-radius: 3px; }
      .dh-flag.warn { color: var(--c-yellow); background: var(--c-yellow-dim); }

      .detail-section { margin-bottom: 20px; }
      .detail-row {
        display: flex; justify-content: space-between; gap: 12px;
        padding: 6px 0; border-bottom: 1px solid var(--c-border);
        font-size: 12px;
      }
      .detail-row-l { color: var(--c-text2); font-size: 12px; }
      .detail-row-v { color: var(--c-text); font-family: var(--font-mono); text-align: right; }

      /* Zeitvergleiche */
      .vgl-table { display: flex; flex-direction: column; }
      .vgl-row {
        display: grid;
        grid-template-columns: minmax(140px, 1.4fr) auto 64px auto;
        gap: 10px; align-items: center;
        padding: 6px 0; border-bottom: 1px solid var(--c-border);
        font-size: 12px;
      }
      /* Proportionaler Dauer-Balken */
      .vgl-bar {
        height: 5px; border-radius: 3px;
        background: var(--c-bg4);
        overflow: hidden;
      }
      .vgl-bar-fill { height: 100%; border-radius: 3px; }
      .vgl-bar-fill.ok  { background: var(--c-blue); opacity: 0.7; }
      .vgl-bar-fill.bad { background: var(--c-red); }
      .vgl-row.leer { opacity: 0.4; }
      .vgl-label { color: var(--c-text); font-size: 12px; }
      .vgl-zeit  { font-family: var(--font-mono); font-size: 10px; color: var(--c-text2); white-space: nowrap; }
      .vgl-dauer {
        font-family: var(--font-mono); font-size: 12px; font-weight: 600;
        text-align: right; min-width: 62px;
      }
      .vgl-dauer.ok  { color: var(--c-text); }
      .vgl-dauer.bad { color: var(--c-red-light); }

      /* Positionstabelle */
      .pt-scroll { overflow-x: auto; border: 1px solid var(--c-border); border-radius: var(--r-md); }
      .pt-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 11px; white-space: nowrap; }
      .pt-table th {
        position: sticky; top: 0; z-index: 2;
        background: var(--c-bg3); color: var(--c-text2);
        font-family: var(--font-mono); font-size: 9px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.05em;
        text-align: left; padding: 8px 10px;
        border-bottom: 1px solid var(--c-border2);
      }
      .pt-table td { padding: 7px 10px; border-bottom: 1px solid var(--c-border); color: var(--c-text); }
      .pt-table tbody tr:last-child td { border-bottom: none; }
      .pt-table .pt-num    { text-align: right; font-family: var(--font-mono); }
      .pt-table .pt-center { text-align: center; }
      .pt-sticky {
        position: sticky; left: 0; z-index: 1;
        background: var(--c-bg2);
        border-right: 1px solid var(--c-border2);
        min-width: 190px;
      }
      thead .pt-sticky { z-index: 3; background: var(--c-bg3); }
      .pt-prod-nr   { font-family: var(--font-mono); font-size: 11px; color: var(--c-text); }
      .pt-prod-name { font-size: 10px; color: var(--c-text2); margin-top: 1px;
                      max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
      .pt-muted { color: var(--c-text3); }
      .pt-warn  { color: var(--c-yellow); font-weight: 600; }
      .pt-flag {
        display: inline-block; font-size: 9px; padding: 1px 6px; border-radius: 8px;
        font-family: var(--font-mono);
      }
      .pt-flag.on  { color: var(--c-yellow); background: var(--c-yellow-dim); }
      .pt-flag.off { color: var(--c-text3); }
      .pt-krit { color: var(--c-red-light); font-size: 10px; }
      .pt-time-cell { font-family: var(--font-mono); color: var(--c-text2); }

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
      .zs-wrap {
        overflow-x: auto;
        padding: 8px 0 4px;
        margin-bottom: 6px;
      }
      .zs-track {
        position:  relative;
        min-width: 480px;
        height:    150px;
        padding:   0 30px;
        margin:    0 auto;
      }
      /* Ist-Achse (Mittellinie) — tiefer, damit oben Platz fürs Soll-Band ist */
      .zs-baseline {
        position:   absolute;
        top:        96px;
        left:       30px; right: 30px;
        height:     2px;
        background: var(--c-border2);
      }
      /* ── Soll-Band (Plan): graues, gestricheltes Band oberhalb der Achse ── */
      .zs-soll-band {
        position:      absolute;
        top:           8px;
        height:        16px;
        display:       flex;
        align-items:   center;
        justify-content: center;
        border:        1px dashed var(--c-text3);
        border-radius: 3px;
        background:    var(--c-bg3);
      }
      .zs-soll-label {
        font-family:    var(--font-mono);
        font-size:      9px;
        color:          var(--c-text2);
        white-space:    nowrap;
        padding:        0 6px;
        background:     var(--c-bg3);
      }
      /* Senkrechte Verbindungslinie vom Soll-Band nach unten zur Ist-Achse.
         Gestrichelt & grau, mit Timestamp am Fuß auf Achsenhöhe. */
      .zs-soll-drop {
        position:  absolute;
        top:       24px;      /* direkt unter dem Band */
        height:    72px;      /* bis zur Achse (top 96) */
        width:     0;
        border-left: 1px dashed var(--c-text3);
        z-index:   0;
        transform: translateX(-0.5px);
      }
      .zs-soll-tick {
        position: absolute; left: -3px;
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--c-bg2);
        border: 1.5px solid var(--c-text2);
      }
      .zs-soll-tick.start { top: -1px; }
      .zs-soll-tick.ende  { top: -1px; }
      .zs-soll-time {
        position:    absolute;
        bottom:      -15px;
        left:        50%;
        transform:   translateX(-50%);
        font-family: var(--font-mono);
        font-size:   8px;
        font-weight: 600;
        color:       var(--c-text2);
        white-space: nowrap;
        background:  var(--c-bg2);
        padding:     1px 4px;
        border-radius: 3px;
      }
      /* Ist-Verbindungslinie */
      .zs-ist-linie {
        position:      absolute;
        top:           95px;
        height:        4px;
        border-radius: 2px;
        z-index:       1;
      }
      /* Punkt-Container */
      .zs-point {
        position:  absolute;
        top:       89px;
        transform: translateX(-50%);
        z-index:   2;
      }
      .zs-dot {
        width:  15px; height: 15px;
        border-radius: 50%;
        border: 3px solid var(--c-bg);
        margin: 0 auto;
        position: relative;
        z-index:  3;
      }
      .zs-dot.done { background: var(--c-green); box-shadow: 0 0 0 2px var(--c-green); }
      .zs-dot.late { background: var(--c-red);   box-shadow: 0 0 0 2px var(--c-red); }
      .zs-dot.optional {
        background: transparent;
        border: 2px dashed var(--c-text2);
      }
      /* Labels abwechselnd oben/unten */
      .zs-label {
        position:   absolute;
        left:       50%;
        transform:  translateX(-50%);
        text-align: center;
        white-space: nowrap;
      }
      .zs-point.oben  .zs-label { bottom: 19px; }
      .zs-point.unten .zs-label { top: 22px; }
      .zs-label-name {
        font-size:   9px;
        font-weight: 600;
        color:       var(--c-text);
        line-height: 1.2;
      }
      .zs-label-time {
        font-family: var(--font-mono);
        font-size:   9px;
        color:       var(--c-text2);
      }
      .zs-opt { color: var(--c-text3); font-weight: 400; }
      /* Nur-geplant-Hinweis */
      .zs-geplant {
        display:     flex;
        align-items: center;
        gap:         8px;
        padding:     16px;
        font-size:   12px;
        color:       var(--c-text2);
        background:   var(--c-bg2);
        border-radius: var(--r-md);
        border:      1px dashed var(--c-border2);
      }
      .zs-geplant-icon { font-size: 15px; }
      .zs-geplant-hint { color: var(--c-text3); font-style: italic; }

      /* Zeitstrahl-Legende */
      .tl-legend {
        display:     flex;
        flex-wrap:   wrap;
        gap:         14px;
        margin-bottom: 4px;
      }
      .tl-legend-item {
        display:     flex;
        align-items: center;
        gap:         6px;
        font-size:   10px;
        color:       var(--c-text2);
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

</style>

    <!-- ── DOM ────────────────────────────────────────────────────────── -->
    <div class="widget-root">

      <!-- Header -->
      <div class="header">
        <div class="header-brand">
          <div class="header-brand-dot"></div>
          WE-Analyse
        </div>
        <div class="header-title" id="header-title">Wareneingang · Auswertung</div>
        <div class="header-sep"></div>
        <div class="header-meta" id="header-meta"></div>
        <button class="refresh-btn" id="refresh-btn" title="Daten neu auswerten">
          <span class="refresh-icon" id="refresh-icon">⟳</span>
          <span>Aktualisieren</span>
        </button>
        <button class="theme-btn" id="theme-btn" title="Theme wechseln">◑</button>
      </div>

      <!-- ── ZEITRAUMAUSWAHL: Presets + Zwei-Punkt-Slider ── -->
      <div class="zr-leiste">
        <span class="nav-label">Zeitraum</span>
        <div class="zr-presets" id="zr-presets" role="group" aria-label="Vordefinierte Zeiträume">
          <button class="zr-preset" data-preset="letzteWoche">Letzte Woche</button>
          <button class="zr-preset" data-preset="dieseWoche">Diese Woche</button>
          <button class="zr-preset" data-preset="gestern">Gestern</button>
        </div>

        <div class="zr-slider-block">
          <div class="zr-slider-kopf">
            <span>Individueller Zeitraum</span>
            <span class="zr-slider-werte" id="zr-werte">–</span>
          </div>
          <div class="zr-slider" id="zr-slider">
            <div class="zr-slider-spur"></div>
            <div class="zr-slider-fill" id="zr-fill"></div>
            <input type="range" id="zr-von" min="0" max="1" step="1" value="0"
                   aria-label="Startdatum des Auswertungszeitraums">
            <input type="range" id="zr-bis" min="0" max="1" step="1" value="1"
                   aria-label="Enddatum des Auswertungszeitraums">
          </div>
          <div class="zr-slider-skala">
            <span id="zr-skala-von">–</span>
            <span id="zr-skala-bis">–</span>
          </div>
        </div>

        <button class="zr-reset" id="zr-reset" title="Auf letzte Woche bis gestern zurücksetzen">Standard</button>
      </div>

      <!-- Body -->
      <div class="body">

        <!-- Ladezustand: animierter WE-Prozess -->
        <div class="state-overlay" id="state-loading">
          <div class="we-loader">
            <div class="we-loader-scene">
              <!-- Fahrbahn -->
              <div class="we-road">
                <div class="we-road-line"></div>
              </div>
              <!-- LKW fährt zum Tor -->
              <div class="we-truck">
                <div class="we-truck-body">
                  <div class="we-truck-cabin"></div>
                  <div class="we-truck-trailer"></div>
                </div>
                <div class="we-truck-wheel we-wheel-1"></div>
                <div class="we-truck-wheel we-wheel-2"></div>
                <div class="we-truck-wheel we-wheel-3"></div>
              </div>
              <!-- Tor / Halle -->
              <div class="we-gate">
                <div class="we-gate-roof"></div>
                <div class="we-gate-door"></div>
              </div>
            </div>
            <!-- Prozess-Schritte die nacheinander aufleuchten -->
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

        <!-- Leerzustand -->
        <div class="state-overlay hidden" id="state-empty">
          <div class="state-icon">📦</div>
          <div class="state-text" id="state-empty-text">Keine Transporteinheiten vorhanden</div>
        </div>

        <!-- ── VIEW 1: ÜBERSICHT (Auswertung) ── -->
        <div class="view active" id="view-uebersicht">

          <!-- Aktiver Zeitraum, immer sichtbar -->
          <div class="zr-aktiv">
            <span class="zr-aktiv-titel" id="zr-aktiv-titel">–</span>
            <span class="zr-aktiv-datum" id="zr-aktiv-datum">–</span>
            <span class="zr-aktiv-meta" id="zr-aktiv-meta"></span>
          </div>

          <div class="u-abschnitt">
            <div class="u-titel" id="kpi-titel">Kennzahlen</div>
            <div class="kpi-cards" id="kpi-cards"></div>
          </div>

          <div class="u-abschnitt">
            <div class="u-titel">Transporteinheiten</div>

            <div class="u-filterbar">
              <div class="f-suche">
                <span class="f-suche-ico">🔍</span>
                <input type="search" id="f-suche-input" class="f-suche-input"
                       placeholder="TE-Nr. oder Lieferant …" autocomplete="off"
                       aria-label="Transporteinheiten suchen">
                <button class="f-suche-clear hidden" id="f-suche-clear" title="Suche zurücksetzen">×</button>
              </div>

              <span class="f-label">Kennzahl</span>
              <div class="f-chips" id="f-kennzahl-chips">
                <button class="f-chip active" data-kfilter="alle">Alle</button>
                <button class="f-chip" data-kfilter="otif-nein">OTIF verletzt</button>
                <button class="f-chip" data-kfilter="unpuenktlich">Unpünktlich</button>
                <button class="f-chip" data-kfilter="mengenabweichung">Mengenabweichung</button>
                <button class="f-chip" data-kfilter="nb">Nicht bewertbar</button>
              </div>

              <span class="f-label">Ladestelle</span>
              <select class="f-select" id="f-ladestelle" aria-label="Ladestelle filtern">
                <option value="alle">Alle</option>
                <option value="BSL">BSL</option>
                <option value="Container">Container</option>
                <option value="Landverkehr">Landverkehr</option>
              </select>

              <span class="f-label">Sortierung</span>
              <select class="f-select" id="f-sort" aria-label="Sortierung">
                <option value="ankerDatum">Datum</option>
                <option value="te">TE-Nummer</option>
                <option value="lieferantName">Lieferant</option>
                <option value="otif">OTIF</option>
                <option value="puenktlich">Pünktlichkeit</option>
                <option value="mengentreu">Mengentreue</option>
                <option value="durchlaufzeitMin">Durchlaufzeit</option>
                <option value="abweichendeMengeAbs">Abweichende Menge</option>
              </select>

              <button class="f-reset" id="f-reset">Filter zurücksetzen</button>
            </div>

            <div id="te-liste"></div>
          </div>
        </div>

        <!-- ── VIEW 2: DETAIL (aus der Referenz übernommen) ── -->
        <div class="view" id="view-detail">
          <button class="back-btn" id="back-btn">← Zurück zur Übersicht</button>
          <div id="detail-content"></div>
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

      // ── Diagnose ──────────────────────────────────────────────────────
      // Kurze Instanz-ID, damit sich bei mehreren Widget-Instanzen auf einer
      // Story die Konsolen-Logs eindeutig zuordnen lassen.
      this._iid            = Math.random().toString(36).slice(2, 7);
      this._tStart         = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._dsAufrufe      = 0;   // Zähler: wie oft hat SAC myDataSource gesetzt
      this._watchdogTimer  = null;
      this._watchdogVersuch = 0;

      this._log('Widget-Instanz erstellt (constructor)');

      // Interner State
      this._teMap       = new Map();    // { teNr → TEObjekt }
      this._activeTE    = null;         // aktuell im Detail angezeigte TE-Nummer
      this._activeView  = 'uebersicht';
      this._herkunftView = 'uebersicht'; // Ansicht, aus der ins Detail gesprungen wurde
      this._theme       = 'dark';       // 'dark' | 'light'
      this._ac          = new AbortController();
      this._loaderTimer = null;

      // Auswertungszeitraum: Standard = letzte Woche bis einschließlich gestern
      this._bereich     = presetBereich('standard');
      this._domain      = null;         // { von, bis, tage } — Wertebereich des Sliders
      this._sliderTimer = null;

      // Listenfilter
      this._kFilter      = 'alle';
      this._lsFilter     = 'alle';
      this._suchbegriff  = '';
      this._suchTimer    = null;
      this._sortFeld     = 'ankerDatum';
      this._sortRichtung = -1;          // -1 = absteigend (neueste zuerst)
      this._maxTEs       = 50;

      // Instanz-eigene Berechnungs-Konfiguration (aus den Properties gespeist)
      this._cfg          = { ...CFG_DEFAULT };
    }

    connectedCallback() {
      this._log('connectedCallback — Widget wird ins DOM eingehängt');
      this._bindEvents();
      this._applyTheme();
      this._syncSlider();
      this._showLoading();
      this._watchdogStart();
    }

    disconnectedCallback() {
      this._log('disconnectedCallback — Widget wird aus dem DOM entfernt');
      this._ac.abort();
      this._stopLoaderSteps();
      this._watchdogStop();
      clearTimeout(this._suchTimer);
      clearTimeout(this._sliderTimer);
    }

    // ── Diagnose-Hilfsmethoden ───────────────────────────────────────────
    //
    //  Einheitliches Logformat mit Instanz-ID und verstrichener Zeit seit dem
    //  Erstellen des Widgets — das macht sichtbar, WANN im Ladeprozess etwas
    //  passiert (oder eben nicht passiert). Läuft immer über console.*, auch
    //  im Erfolgsfall, damit bei Störungen die vollständige Abfolge sichtbar
    //  ist und nicht nur der Fehlerfall.

    _seitStart() {
      const jetzt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      return Math.round(jetzt - this._tStart);
    }

    _log(nachricht, ebene = 'info', daten) {
      const prefix = `[WE-Analyse#${this._iid} +${this._seitStart()}ms]`;
      if (daten !== undefined) console[ebene](prefix, nachricht, daten);
      else                      console[ebene](prefix, nachricht);
    }

    // Watchdog: meldet sich, wenn nach dem Einhängen zu lange keine Daten
    // ankommen. Genau der Fall aus der Fehlerbeschreibung — "nur die
    // Ladeanimation, Konsole leer" — erzeugt dadurch trotzdem einen
    // Log-Eintrag, auch wenn SAC selbst nie einen Fehler meldet.
    _watchdogStart() {
      this._watchdogStop();
      this._watchdogVersuch = 0;
      this._watchdogTimer = setInterval(() => this._watchdogCheck(), 15000);
    }

    _watchdogStop() {
      if (this._watchdogTimer) {
        clearInterval(this._watchdogTimer);
        this._watchdogTimer = null;
      }
    }

    _watchdogCheck() {
      if (this._teMap.size > 0) { this._watchdogStop(); return; }
      this._watchdogVersuch++;

      const letzterState = this._dataBinding?.state ?? null;
      if (this._dsAufrufe === 0) {
        this._log(
          `Watchdog (${this._watchdogVersuch}) — ${this._seitStart()}ms seit dem Einhängen, `
          + `myDataSource wurde bisher NICHT aufgerufen. SAC hat die Datenbindung noch nicht `
          + `zugestellt — mögliche Ursachen: Story lädt die Datenquelle noch, die BW-Live-`
          + `Verbindung hängt (z. B. CORS-Fehler beim InA-Aufruf), oder das Feld-Mapping der `
          + `Datenbindung ist leer.`,
          'warn',
        );
      } else {
        this._log(
          `Watchdog (${this._watchdogVersuch}) — ${this._seitStart()}ms seit dem Einhängen, `
          + `myDataSource wurde ${this._dsAufrufe}× aufgerufen, letzter state='${letzterState}'. `
          + `Es liegt also noch nie ein state='success' mit Daten vor.`,
          'warn',
          this._dataBinding,
        );
      }

      // Nach 4 Versuchen (~60s) nicht weiter spammen — die Information steht.
      if (this._watchdogVersuch >= 4) this._watchdogStop();
    }

    // ── Hilfsmethode: Element im Shadow DOM finden ───────────────────────

    _$(id) { return this._shadow.getElementById(id); }

    // ── Event-Binding ────────────────────────────────────────────────────

    _bindEvents() {
      const opts = { signal: this._ac.signal };

      // Theme
      this._$('theme-btn')?.addEventListener('click', () => this._toggleTheme(), opts);

      // Aktualisieren
      this._$('refresh-btn')?.addEventListener('click', () => this._doRefresh(), opts);

      // Zurück aus der Detailsicht — in die Ansicht, aus der gesprungen wurde
      this._$('back-btn')?.addEventListener('click', () => {
        this._activeTE = null;
        this._switchView(this._herkunftView || 'uebersicht');
      }, opts);

      // Vordefinierte Zeiträume
      this._shadow.querySelectorAll('.zr-preset').forEach(btn => {
        btn.addEventListener('click', () => this.setZeitraum(btn.dataset.preset), opts);
      });

      // Standard-Zeitraum wiederherstellen
      this._$('zr-reset')?.addEventListener('click', () => this.setZeitraum('standard'), opts);

      // ── Zeitraum-Slider (zwei Punkte) ──
      const von = this._$('zr-von');
      const bis = this._$('zr-bis');

      const schieben = (quelle) => {
        if (!von || !bis || !this._domain) return;
        let a = Number(von.value);
        let b = Number(bis.value);
        // Die Punkte dürfen sich nicht überholen: der jeweils andere wird
        // mitgeschoben, statt den gezogenen Punkt zu blockieren.
        if (a > b) {
          if (quelle === 'von') { b = a; bis.value = String(b); }
          else                  { a = b; von.value = String(a); }
        }
        this._bereichAusSlider(a, b);
      };

      von?.addEventListener('input', () => schieben('von'), opts);
      bis?.addEventListener('input', () => schieben('bis'), opts);

      // Kennzahl-Schnellfilter
      this._shadow.querySelectorAll('[data-kfilter]').forEach(chip => {
        chip.addEventListener('click', () => {
          this._kFilter = chip.dataset.kfilter;
          this._shadow.querySelectorAll('[data-kfilter]').forEach(c =>
            c.classList.toggle('active', c === chip));
          this._renderTabelle();
        }, opts);
      });

      // Ladestelle / Sortierung
      this._$('f-ladestelle')?.addEventListener('change', (e) => {
        this._lsFilter = e.target.value || 'alle';
        this._renderTabelle();
      }, opts);

      this._$('f-sort')?.addEventListener('change', (e) => {
        this._setSortierung(e.target.value, true);
      }, opts);

      // Suche (Debounce 150 ms)
      const sucheInput = this._$('f-suche-input');
      const sucheClear = this._$('f-suche-clear');

      const sucheAnwenden = (wert) => {
        this._suchbegriff = wert ?? '';
        sucheClear?.classList.toggle('hidden', !this._suchbegriff);
        this._renderTabelle();
      };

      sucheInput?.addEventListener('input', () => {
        clearTimeout(this._suchTimer);
        const wert = sucheInput.value;
        this._suchTimer = setTimeout(() => sucheAnwenden(wert), 150);
      }, opts);

      sucheInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { sucheInput.value = ''; sucheAnwenden(''); }
      }, opts);

      sucheClear?.addEventListener('click', () => {
        if (sucheInput) sucheInput.value = '';
        clearTimeout(this._suchTimer);
        sucheAnwenden('');
      }, opts);

      // Filter zurücksetzen
      this._$('f-reset')?.addEventListener('click', () => this._filterZuruecksetzen(), opts);
    }

    // ── View-Switching ────────────────────────────────────────────────────

    _switchView(name) {
      this._activeView = name;
      this._shadow.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      this._$(`view-${name}`)?.classList.add('active');
      // Beim Zurückkehren die Übersicht frisch rendern (Filter/Daten könnten
      // sich zwischenzeitlich geändert haben).
      if (name === 'uebersicht' && this._teMap.size) this._renderUebersicht();
    }

    // ── Theme ─────────────────────────────────────────────────────────────

    _toggleTheme() {
      this._theme = this._theme === 'dark' ? 'light' : 'dark';
      this._applyTheme();
    }

    _applyTheme() {
      if (this._theme === 'light') this.setAttribute('theme', 'light');
      else                          this.removeAttribute('theme');
    }

    // ── Zustände ──────────────────────────────────────────────────────────

    _showLoading() {
      this._$('state-loading')?.classList.remove('hidden');
      this._$('state-empty')?.classList.add('hidden');
      this._startLoaderSteps();
    }

    _hideLoading() {
      this._log('Ladezustand beendet — Daten sind da, Rendering beginnt');
      this._$('state-loading')?.classList.add('hidden');
      this._stopLoaderSteps();
    }

    // Lässt die Prozess-Schritte in der Ladeanimation nacheinander aufleuchten
    _startLoaderSteps() {
      this._stopLoaderSteps();
      const steps = this._shadow.querySelectorAll('.we-step');
      if (!steps.length) return;
      let i = 0;
      const tick = () => {
        steps.forEach((s, idx) => s.classList.toggle('we-step-active', idx === i));
        i = (i + 1) % steps.length;
      };
      tick();
      this._loaderTimer = setInterval(tick, 600);
    }

    _stopLoaderSteps() {
      if (this._loaderTimer) {
        clearInterval(this._loaderTimer);
        this._loaderTimer = null;
      }
    }

    _showEmpty(text) {
      this._log(`Leerzustand angezeigt: "${text ?? ''}"`, 'warn');
      const el = this._$('state-empty-text');
      if (el && text) el.textContent = text;
      this._$('state-empty')?.classList.remove('hidden');
      this._$('state-loading')?.classList.add('hidden');
      this._stopLoaderSteps();
    }

    _hideEmpty() {
      this._$('state-empty')?.classList.add('hidden');
    }

    _doRefresh() {
      this._log('Aktualisieren-Button geklickt — myDataSource wird erneut zugewiesen');
      const icon = this._$('refresh-icon');
      icon?.classList.add('spinning');
      if (this._dataBinding) this.myDataSource = this._dataBinding;
      else this._log('Aktualisieren: keine bisherige Datenbindung vorhanden (_dataBinding ist leer)', 'warn');
      setTimeout(() => icon?.classList.remove('spinning'), 500);
    }

    // ── Zeitraum-Slider ───────────────────────────────────────────────────
    //
    //  Der Slider arbeitet auf Tagesindizes über einer Domäne, die sich aus den
    //  Daten ergibt: vom frühesten bis zum spätesten Ankerdatum, mindestens
    //  aber vom Beginn der Vorwoche bis heute. So ist der Standardzeitraum
    //  immer einstellbar, auch wenn die Datenquelle nur wenige Tage abdeckt.

    _sliderDomain() {
      const heute = heuteTag();
      const std   = presetBereich('standard');
      let min = std.von;
      let max = heute;

      for (const te of this._teMap.values()) {
        if (!te.ankerDatum) continue;
        const t = tagStart(te.ankerDatum);
        if (t < min) min = t;
        if (t > max) max = t;
      }
      // Aktuell gewählten Bereich immer einschließen (z.B. per API gesetzt)
      if (this._bereich) {
        const bisTag = tagStart(new Date(this._bereich.bis.getTime() - TAG_MS));
        if (this._bereich.von < min) min = tagStart(this._bereich.von);
        if (bisTag > max) max = bisTag;
      }
      // Obergrenze gegen Ausreißer in den Stammdaten
      const MAX_TAGE = 730;
      let tage = Math.round((max - min) / TAG_MS);
      if (tage > MAX_TAGE) {
        min  = new Date(max.getTime() - MAX_TAGE * TAG_MS);
        tage = MAX_TAGE;
      }
      return { von: min, bis: max, tage: Math.max(1, tage) };
    }

    // Index (Tag) ↔ Datum
    _idxZuDatum(i) {
      return new Date(this._domain.von.getTime() + i * TAG_MS);
    }
    _datumZuIdx(d) {
      const i = Math.round((tagStart(d) - this._domain.von) / TAG_MS);
      return Math.max(0, Math.min(this._domain.tage, i));
    }

    // Slider-Positionen und Beschriftungen an den aktiven Bereich angleichen.
    _syncSlider() {
      this._domain = this._sliderDomain();
      const von = this._$('zr-von');
      const bis = this._$('zr-bis');
      if (!von || !bis) return;

      const aIdx = this._datumZuIdx(this._bereich.von);
      const bIdx = this._datumZuIdx(new Date(this._bereich.bis.getTime() - TAG_MS));

      von.min = bis.min = '0';
      von.max = bis.max = String(this._domain.tage);
      von.value = String(aIdx);
      bis.value = String(bIdx);

      this._updateSliderAnzeige(aIdx, bIdx);
      this._markierePreset();
    }

    // Preset-Schaltfläche markieren, wenn der Bereich exakt darauf passt
    _markierePreset() {
      const aktiv = presetErkennen(this._bereich);
      this._shadow.querySelectorAll('.zr-preset').forEach(b =>
        b.classList.toggle('active', b.dataset.preset === aktiv));
    }

    _updateSliderAnzeige(aIdx, bIdx) {
      const spanne = Math.max(1, this._domain.tage);
      const fill = this._$('zr-fill');
      if (fill) {
        const links  = (aIdx / spanne) * 100;
        const breite = ((bIdx - aIdx) / spanne) * 100;
        fill.style.left  = `${links}%`;
        fill.style.width = `${Math.max(breite, 0.6)}%`;
      }
      const werte = this._$('zr-werte');
      if (werte) {
        const a = this._idxZuDatum(aIdx), b = this._idxZuDatum(bIdx);
        const tage = bIdx - aIdx + 1;
        werte.textContent = (aIdx === bIdx)
          ? `${fmtDate(a)} (1 Tag)`
          : `${fmtDate(a)} – ${fmtDate(b)} (${tage} Tage)`;
      }
      const sv = this._$('zr-skala-von');
      const sb = this._$('zr-skala-bis');
      if (sv) sv.textContent = fmtDate(this._domain.von);
      if (sb) sb.textContent = fmtDate(this._domain.bis);

      // Liegen beide Punkte übereinander, verdeckt der obere den unteren.
      // Am rechten Anschlag muss der Von-Punkt greifbar sein (nur er kann
      // dann noch nach links), sonst bleibt der Bis-Punkt oben.
      const von = this._$('zr-von');
      const bis = this._$('zr-bis');
      if (von && bis) {
        const vonOben = (aIdx === bIdx && bIdx >= this._domain.tage);
        von.style.zIndex = vonOben ? '3' : '1';
        bis.style.zIndex = vonOben ? '1' : '3';
      }
    }

    // Slider bewegt → Bereich übernehmen und Auswertung nachziehen.
    // Die Anzeige folgt sofort, die Neuberechnung leicht entprellt, damit das
    // Ziehen auch bei vielen TEs flüssig bleibt.
    _bereichAusSlider(aIdx, bIdx) {
      this._updateSliderAnzeige(aIdx, bIdx);
      this._bereich = {
        von: this._idxZuDatum(aIdx),
        bis: new Date(this._idxZuDatum(bIdx).getTime() + TAG_MS),
      };
      this._markierePreset();

      clearTimeout(this._sliderTimer);
      this._sliderTimer = setTimeout(() => {
        if (this._teMap.size) this._renderUebersicht();
      }, 80);
    }

    // ── Datenzugriff / Filter ─────────────────────────────────────────────

    _alleTes() { return [...this._teMap.values()]; }

    // TEs des aktiven Zeitraums (ohne Listenfilter — Basis der Kennzahlen)
    _tesZeitraum(bereich) {
      return tesImBereich(this._alleTes(), bereich ?? this._bereich);
    }

    // TEs des aktiven Zeitraums nach Anwendung aller Listenfilter
    _gefilterteTes() {
      const q = (this._suchbegriff ?? '').trim().toLowerCase();

      return this._tesZeitraum().filter(te => {
        // Suche
        if (q) {
          const treffer =
            String(te.te ?? '').toLowerCase().includes(q) ||
            String(te.teExt ?? '').toLowerCase().includes(q) ||
            String(te.lieferantName ?? '').toLowerCase().includes(q) ||
            (te.anlieferungen ?? []).some(l => String(l).toLowerCase().includes(q));
          if (!treffer) return false;
        }

        // Ladestelle
        if (this._lsFilter !== 'alle' && ladestelleKurz(te.ladestelle) !== this._lsFilter) return false;

        // Kennzahl-Schnellfilter
        switch (this._kFilter) {
          case 'otif-nein':        return te.otif === false;
          case 'unpuenktlich':     return te.puenktlich === false;
          case 'mengenabweichung': return te.abweichendeMenge != null && te.abweichendeMenge !== 0;
          case 'nb':               return te.otif == null || te.durchlaufzeitMin == null;
          default:                 return true;
        }
      });
    }

    _setSortierung(feld, ausSelect) {
      if (this._sortFeld === feld && !ausSelect) {
        this._sortRichtung = -this._sortRichtung;
      } else {
        this._sortFeld = feld;
        // Datum und Mengenabweichung sind absteigend am nützlichsten
        this._sortRichtung = (feld === 'ankerDatum' || feld === 'abweichendeMengeAbs') ? -1 : 1;
      }
      const sel = this._$('f-sort');
      if (sel && sel.value !== feld) sel.value = feld;
      this._renderTabelle();
    }

    _sortiere(tes) {
      const f = this._sortFeld;
      const r = this._sortRichtung;
      // Boolesche Kennzahlen: false zuerst (= die interessanten Fälle),
      // "nicht bewertbar" grundsätzlich ans Ende.
      const boolFelder = new Set(['otif', 'puenktlich', 'mengentreu']);
      return [...tes].sort((a, b) => {
        if (boolFelder.has(f)) {
          const av = a[f] == null ? null : (a[f] ? 1 : 0);
          const bv = b[f] == null ? null : (b[f] ? 1 : 0);
          return cmp(av, bv, r);
        }
        if (f === 'ankerDatum') {
          return cmp(a.ankerDatum ? a.ankerDatum.getTime() : null,
                     b.ankerDatum ? b.ankerDatum.getTime() : null, r);
        }
        if (f === 'te') {
          const an = Number(a.te), bn = Number(b.te);
          if (Number.isFinite(an) && Number.isFinite(bn)) return cmp(an, bn, r);
          return cmp(a.te, b.te, r);
        }
        return cmp(a[f], b[f], r);
      });
    }

    _filterZuruecksetzen() {
      this._kFilter     = 'alle';
      this._lsFilter    = 'alle';
      this._suchbegriff = '';
      const s = this._$('f-suche-input'); if (s) s.value = '';
      this._$('f-suche-clear')?.classList.add('hidden');
      this._shadow.querySelectorAll('[data-kfilter]').forEach(c =>
        c.classList.toggle('active', c.dataset.kfilter === 'alle'));
      const ls = this._$('f-ladestelle'); if (ls) ls.value = 'alle';
      this._renderTabelle();
    }

    // ── Render: Übersicht ─────────────────────────────────────────────────

    _renderUebersicht() {
      this._updateKopf();
      this._renderKpiCards();
      this._renderTabelle();
    }

    _updateKopf() {
      const name  = bereichName(this._bereich);
      const datum = bereichLabel(this._bereich);
      const tage  = bereichTage(this._bereich);
      const tes   = this._tesZeitraum();

      const titel = this._$('header-title');
      if (titel) titel.textContent = `Wareneingang · ${name} · ${datum}`;

      const meta = this._$('header-meta');
      if (meta) meta.textContent = `${tes.length} TE${tes.length === 1 ? '' : 's'} im Zeitraum · ${this._teMap.size} gesamt`;

      // Banner "aktiver Zeitraum"
      const bTitel = this._$('zr-aktiv-titel');
      const bDatum = this._$('zr-aktiv-datum');
      const bMeta  = this._$('zr-aktiv-meta');
      if (bTitel) bTitel.textContent = name;
      if (bDatum) bDatum.textContent = `${datum} · ${tage} Tag${tage === 1 ? '' : 'e'}`;
      if (bMeta) {
        const vp = vorperiode(this._bereich);
        bMeta.textContent = `${tes.length} ausgewertete TEs · Vergleich: ${bereichLabel(vp)}`;
      }

      const kpiTitel = this._$('kpi-titel');
      if (kpiTitel) kpiTitel.textContent = `Kennzahlen · ${datum}`;
    }

    // ── Kennzahlen-Karten ─────────────────────────────────────────────────
    //
    //  Jede Karte zeigt den Wert des gewählten Zeitraums groß und daneben den
    //  Wert der unmittelbar vorausgehenden Periode gleicher Länge als
    //  Vergleich — das funktioniert für die Presets ebenso wie für jeden per
    //  Slider gewählten Zeitraum.
    _renderKpiCards() {
      const host = this._$('kpi-cards');
      if (!host) return;

      const vp    = vorperiode(this._bereich);
      const aktiv = aggregiere(this._tesZeitraum());
      const vgl   = aggregiere(this._tesZeitraum(vp));

      if (aktiv.anzahl === 0) {
        host.innerHTML = `<div class="u-leer" style="grid-column:1/-1">
          Keine Transporteinheiten im Zeitraum ${esc(bereichLabel(this._bereich))}
        </div>`;
        return;
      }

      const vglName = `Vorperiode: ${bereichLabel(vp)}`;
      host.innerHTML = KPI_DEFS.map(def => this._kpiCardHTML(def, aktiv, vgl, vglName)).join('');

      // Aufklapp-Richtung der Aufschlüsselung bestimmen: Standard ist nach
      // unten; ist dort im scrollbaren View zu wenig Platz, nach oben klappen.
      // Delegierte Handler statt eines Listeners je Karte.
      const richtungPruefen = (card) => {
        const pop = card.querySelector('.kpi-breakdown');
        if (!pop) return;
        const view = this._$('view-uebersicht');
        const cardR = card.getBoundingClientRect();
        const viewR = view.getBoundingClientRect();
        const noetig = pop.offsetHeight + 12;
        const platzUnten = viewR.bottom - cardR.bottom;
        card.classList.toggle('bd-oben', platzUnten < noetig && cardR.top - viewR.top > noetig);
      };
      host.onpointerover = (e) => {
        const card = e.target.closest('.kpi-card.hat-breakdown');
        if (card && !card.contains(e.relatedTarget)) richtungPruefen(card);
      };
      host.onfocusin = (e) => {
        const card = e.target.closest('.kpi-card.hat-breakdown');
        if (card) richtungPruefen(card);
      };
    }

    // Formatiert den Wert einer Kennzahl aus einem aggregierten Datensatz
    // (Gesamt oder je Ladestelle) einheitlich — genutzt von Karte UND
    // Hover-Aufschlüsselung, damit beide dieselbe Darstellung zeigen.
    //   → { text, klasse, wert }  (wert = numerischer Rohwert für den Balken)
    _kpiWert(defId, agg) {
      const a = agg[defId];
      if (defId === 'durchlaufzeit') {
        return { text: fmtDauerAbs(a.wert), klasse: '', wert: a.wert };
      }
      if (defId === 'abwMenge') {
        return {
          text:   a.wert == null ? '–' : fmtNum(a.wert),
          klasse: a.wert == null ? 'q-nb' : (a.betroffen === 0 ? 'q-gut' : 'q-mittel'),
          wert:   a.wert,
        };
      }
      // Quoten
      return { text: fmtProzent(a.wert), klasse: quoteKlasse(a.wert), wert: a.wert };
    }

    // Baut die Ladestellen-Aufschlüsselung einer Kennzahl als Popup-Inhalt.
    // Zeigt je Ladestelle den Kennzahlwert, einen kleinen Anteilsbalken und
    // die Fallzahl. Ohne Aufschlüsselung (keine Gruppen) bleibt es leer.
    _kpiBreakdownHTML(def, aktiv) {
      const gruppen = aktiv.ladestellen ?? [];
      if (!gruppen.length) return '';

      const istQuote = !(def.id === 'durchlaufzeit' || def.id === 'abwMenge');

      const zeilen = gruppen.map(g => {
        const style = LADESTELLE_STYLE[g.ls] ?? LADESTELLE_STYLE.BSL;
        const w = this._kpiWert(def.id, g);

        // Zusatzinfo je Kennzahltyp (Fallzahlen, damit die Quote einordbar ist)
        let meta;
        if (def.id === 'durchlaufzeit') {
          meta = `${g.durchlaufzeit.bewertbar}/${g.anzahl} TEs`;
        } else if (def.id === 'abwMenge') {
          meta = `${g.abwMenge.betroffen}/${g.abwMenge.bewertbar} TEs`;
        } else {
          const q = g[def.id];
          meta = `${q.ok}/${q.bewertbar} TEs`;
        }

        // Anteilsbalken: bei Quoten die Erfüllungsquote (0–100 %),
        // sonst der Anteil der TEs dieser Ladestelle an allen TEs.
        const balkenPct = istQuote
          ? (w.wert ?? 0)
          : (aktiv.anzahl ? (g.anzahl / aktiv.anzahl) * 100 : 0);
        const balkenKlasse = istQuote ? quoteKlasse(w.wert) : '';

        return `
          <div class="kpi-bd-row">
            <span class="ls-badge ${style.cls} kpi-bd-badge">${style.icon} ${esc(g.ls)}</span>
            <div class="kpi-bd-bar"><div class="kpi-bd-bar-fill ${balkenKlasse}" style="width:${Math.max(0, Math.min(100, balkenPct)).toFixed(1)}%"></div></div>
            <span class="kpi-bd-wert ${w.klasse}">${w.text}</span>
            <span class="kpi-bd-meta">${esc(meta)}</span>
          </div>`;
      }).join('');

      const hinweis = istQuote
        ? 'Erfüllungsquote je Ladestelle'
        : (def.id === 'abwMenge' ? 'Σ Beträge · Balken = TE-Anteil' : 'Ø je Ladestelle · Balken = TE-Anteil');

      return `
        <div class="kpi-breakdown" role="tooltip">
          <div class="kpi-bd-titel">Nach Ladestelle</div>
          ${zeilen}
          <div class="kpi-bd-fuss">${esc(hinweis)}</div>
        </div>`;
    }

    _kpiCardHTML(def, aktiv, vgl, vglName) {
      const a = aktiv[def.id];
      const v = vgl[def.id];

      // Anzeige + Trendrichtung je Kennzahl. "besserWennHoeher" steuert, ob
      // ein Anstieg grün oder rot dargestellt wird.
      let wertTxt, klasse = '', subTxt, balken = '', vglTxt, besserWennHoeher = true;
      const aWert = a.wert, vWert = v.wert;

      if (def.id === 'durchlaufzeit') {
        besserWennHoeher = false;
        wertTxt = fmtDauerAbs(a.wert);
        subTxt  = a.bewertbar
          ? `${a.bewertbar} von ${aktiv.anzahl} TEs bewertbar · min ${fmtDauerAbs(a.min)} / max ${fmtDauerAbs(a.max)}`
          : 'Keine vollständigen Durchlaufzeiten im Zeitraum';
        vglTxt  = fmtDauerAbs(v.wert);
      } else if (def.id === 'abwMenge') {
        besserWennHoeher = false;
        wertTxt = a.wert == null ? '–' : fmtNum(a.wert);
        klasse  = a.wert == null ? 'q-nb' : (a.betroffen === 0 ? 'q-gut' : 'q-mittel');
        subTxt  = a.bewertbar
          ? `Σ Beträge · ${a.betroffen} von ${a.bewertbar} TEs mit Abweichung · netto ${fmtDelta(a.netto)}`
          : 'Keine Soll-/Ist-Mengen im Zeitraum';
        vglTxt  = v.wert == null ? '–' : fmtNum(v.wert);
      } else {
        // Quoten-Kennzahlen (OTIF / Pünktlichkeit / Mengentreue)
        klasse  = quoteKlasse(a.wert);
        wertTxt = fmtProzent(a.wert);
        subTxt  = a.bewertbar
          ? `${a.ok} von ${a.bewertbar} TEs erfüllt${a.nb ? ` · ${a.nb} nicht bewertbar` : ''}`
          : `Nicht bewertbar · ${a.nb} TEs ohne Datengrundlage`;
        vglTxt  = fmtProzent(v.wert);
        balken  = `<div class="kpi-bar"><div class="kpi-bar-fill ${klasse}" style="width:${(a.wert ?? 0).toFixed(1)}%"></div></div>`;
      }

      // Trend nur wenn beide Werte vorhanden sind
      let trendHTML = '<span class="kpi-trend gleich">–</span>';
      if (aWert != null && vWert != null) {
        const delta = aWert - vWert;
        const rund  = Math.round(delta * 10) / 10;
        const cls   = rund === 0 ? 'gleich' : ((rund > 0) === besserWennHoeher ? 'auf' : 'ab');
        const pfeil = rund === 0 ? '±' : (rund > 0 ? '▲' : '▼');
        const betrag = def.id === 'durchlaufzeit'
          ? fmtDauerAbs(Math.abs(rund))
          : (def.id === 'abwMenge' ? fmtNum(Math.abs(rund)) : fmtProzent(Math.abs(rund)));
        trendHTML = `<span class="kpi-trend ${cls}">${pfeil} ${betrag}</span>`;
      }

      // Ladestellen-Aufschlüsselung (Hover / Fokus)
      const breakdown = this._kpiBreakdownHTML(def, aktiv);
      const hatBd = breakdown !== '';

      return `
        <div class="kpi-card${hatBd ? ' hat-breakdown' : ''}" tabindex="${hatBd ? '0' : '-1'}"
             aria-label="${esc(def.label)}${hatBd ? ' — Aufschlüsselung nach Ladestelle per Hover' : ''}">
          <div class="kpi-card-kopf">
            <span class="kpi-card-label">${esc(def.label)}</span>
            ${hatBd ? '<span class="kpi-card-info" title="Aufschlüsselung nach Ladestelle">⊞</span>' : ''}
          </div>
          <div class="kpi-card-wert ${klasse}">${wertTxt}</div>
          ${balken}
          <div class="kpi-card-sub">${esc(subTxt)}</div>
          <div class="kpi-card-vgl">
            ${trendHTML}
            <span title="${esc(vglName)}">Vorperiode: ${vglTxt}</span>
          </div>
          ${breakdown}
        </div>`;
    }

    // ── TE-Auflistung ─────────────────────────────────────────────────────

    _renderTabelle() {
      const host = this._$('te-liste');
      if (!host) return;

      const gefiltert = this._sortiere(this._gefilterteTes());
      const gesamtImZeitraum = this._tesZeitraum().length;

      if (gefiltert.length === 0) {
        host.innerHTML = `<div class="te-tabelle-wrap"><div class="u-leer">
          ${gesamtImZeitraum === 0
            ? 'Keine Transporteinheiten in diesem Zeitraum'
            : 'Keine Transporteinheiten für die aktive Filterkombination'}
        </div></div>`;
        return;
      }

      // maxTEs begrenzt nur die ANZEIGE — die Kennzahlen oben bleiben auf der
      // vollständigen Datenbasis des Zeitraums berechnet.
      const limit    = Number.isFinite(this._maxTEs) && this._maxTEs > 0 ? this._maxTEs : gefiltert.length;
      const sichtbar = gefiltert.slice(0, limit);
      const gekappt  = gefiltert.length - sichtbar.length;

      const spalten = [
        { feld: 'te',                  label: 'TE',            cls: ''    },
        { feld: 'lieferantName',       label: 'Lieferant',     cls: ''    },
        { feld: 'ankerDatum',          label: 'Datum',         cls: ''    },
        { feld: 'otif',                label: 'OTIF',          cls: 'mid' },
        { feld: 'puenktlich',          label: 'Pünktlichkeit', cls: 'mid' },
        { feld: 'mengentreu',          label: 'Mengentreue',   cls: 'mid' },
        { feld: 'durchlaufzeitMin',    label: 'Durchlaufzeit', cls: 'num' },
        { feld: 'abweichendeMengeAbs', label: 'Abw. Menge',    cls: 'num' },
      ];

      const kopf = spalten.map(s => {
        const aktiv = this._sortFeld === s.feld;
        const pfeil = aktiv ? `<span class="sort-pfeil">${this._sortRichtung === 1 ? '▲' : '▼'}</span>` : '';
        return `<th class="${s.cls}${aktiv ? ' sortiert' : ''}" data-sort="${s.feld}"
                    title="Nach ${esc(s.label)} sortieren">${esc(s.label)}${pfeil}</th>`;
      }).join('') + `<th class="mid" data-sort-none="1">Detail</th>`;

      const zeilen = sichtbar.map(te => this._teZeileHTML(te)).join('');

      host.innerHTML = `
        <div class="te-tabelle-wrap">
          <table class="te-tabelle">
            <thead><tr>${kopf}</tr></thead>
            <tbody>${zeilen}</tbody>
          </table>
        </div>
        <div class="te-tabelle-fuss">
          <span>${sichtbar.length} von ${gefiltert.length} TEs angezeigt${gekappt > 0 ? ` (${gekappt} durch maxTEs ausgeblendet)` : ''}</span>
          <span>·</span>
          <span>Zeitraum: ${esc(bereichLabel(this._bereich))}</span>
          <span>·</span>
          <span>„n. b.“ = nicht bewertbar (unvollständige Daten)</span>
        </div>`;

      // Sortierung per Spaltenkopf
      host.querySelectorAll('th[data-sort]').forEach(th => {
        th.onclick = () => this._setSortierung(th.dataset.sort, false);
      });

      // ── Navigation zur Detailsicht ──
      // Ein Listener für die gesamte Tabelle (Delegation) statt einer pro Zeile.
      const tbody = host.querySelector('tbody');
      if (tbody) {
        tbody.onclick = (e) => {
          if (e.target.closest('[data-ewm]')) return;   // EWM-Link nicht abfangen
          const tr = e.target.closest('tr[data-te]');
          if (tr) this._oeffneDetail(tr.dataset.te);
        };
        // Tastaturbedienung: Enter / Leertaste auf der fokussierten Zeile
        tbody.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          const tr = e.target.closest('tr[data-te]');
          if (!tr) return;
          e.preventDefault();
          this._oeffneDetail(tr.dataset.te);
        };
      }
    }

    _teZeileHTML(te) {
      const ls    = ladestelleKurz(te.ladestelle);
      const style = LADESTELLE_STYLE[ls] ?? LADESTELLE_STYLE.BSL;

      // Pünktlichkeit zusätzlich mit der konkreten Abweichung in Minuten
      const abwMin = te.puenktlichkeitAbwMin;
      const puenktZusatz = (te.puenktlich === false && abwMin != null)
        ? `<span class="tt-abw-min">+${abwMin} min</span>` : '';

      // Abweichende Menge: Vorzeichen erhalten, 0 dezent darstellen
      const abw = te.abweichendeMenge;
      const abwHTML = abw == null
        ? '<span class="tt-muted">n. b.</span>'
        : `<span class="k-delta ${abw === 0 ? 'null' : 'pos'}">${fmtDelta(abw)}</span>`;

      const verletzt = te.otif === false;

      return `
        <tr data-te="${esc(te.te)}" tabindex="0" role="button"
            class="${verletzt ? 'verletzt' : ''}"
            title="Detailsicht für TE ${esc(te.te)} öffnen">
          <td>
            <span class="tt-te">${esc(te.teExt ?? te.te)}</span>
            ${te.teExt ? `<div class="tt-te-ext">intern ${esc(te.te)}</div>` : ''}
          </td>
          <td>
            <span class="tt-lieferant" title="${esc(te.lieferantName ?? '')}">${esc(te.lieferantName ?? '–')}</span>
            <span class="ls-badge ${style.cls}">${style.icon} ${esc(ls)}</span>
          </td>
          <td><span class="tt-datum">${te.ankerDatum ? fmtDateTime(te.ankerDatum) : '–'}</span></td>
          <td class="mid">${boolChip(te.otif, 'OTIF', 'Verletzt')}</td>
          <td class="mid">${boolChip(te.puenktlich, 'Pünktlich', 'Verspätet')}${puenktZusatz}</td>
          <td class="mid">${boolChip(te.mengentreu, 'Vollständig', 'Abweichung')}</td>
          <td class="num tt-num">${te.durchlaufzeitMin == null
              ? '<span class="tt-muted">n. b.</span>'
              : esc(fmtDauerAbs(te.durchlaufzeitMin))}</td>
          <td class="num tt-num">${abwHTML}</td>
          <td class="mid"><span class="tt-detail-btn">Detail →</span></td>
        </tr>`;
    }

    // Navigation Übersicht → Detailsicht
    _oeffneDetail(teNr) {
      if (!teNr || !this._teMap.has(teNr)) return;
      this._renderDetail(teNr);
      // Optionales Ereignis für SAC-Skripte (z.B. um andere Widgets zu filtern)
      this.dispatchEvent(new CustomEvent('onTEAuswahl', {
        bubbles: true, composed: true, detail: { te: teNr },
      }));
    }

    _renderDetail(teNr) {
      this._activeTE = teNr;
      const te = this._teMap.get(teNr);
      const content = this._$('detail-content');
      if (!te || !content) return;

      // Herkunfts-View merken, damit der Zurück-Button dorthin zurückführt
      // (sonst landet man immer in der Übersicht, auch wenn man aus dem
      // Zeitstrahl oder der Analyse kam).
      if (this._activeView && this._activeView !== 'detail') {
        this._herkunftView = this._activeView;
      }

      content.innerHTML = this._detailHTML(te);
      this._switchView('detail');
    }

    // Baut das komplette HTML für den Detail-View einer TE
    _detailHTML(te) {
      const status = te.status;
      const isVerspaetet = te.planabweichung === true;

      // ── Kopf-Delta ──
      let deltaHTML = '';
      if (te.abweichungGrund === 'überfällig') {
        deltaHTML = `<span class="dh-delta pos">Überfällig ${fmtDauer(te.ueberfaelligMin)}</span>`;
      } else if (te.abweichungGrund === 'verzögert') {
        deltaHTML = `<span class="dh-delta pos">Verspätet ${fmtDauer(te.verzoegerungMin)}</span>`;
      } else if (te.tsAnkunft) {
        deltaHTML = `<span class="dh-delta neg">Pünktlich</span>`;
      }

      // ── Warnleiste (dieselben Warnungen wie auf der Kachel) ──
      const warnHTML = te.warnungen.length
        ? `<div class="detail-warnbar">` + te.warnungen.map(w =>
            `<div class="detail-warn w-${w.farbe}" title="${esc(w.tooltip)}">
               <span class="detail-warn-ico">${w.icon}</span>
               <span class="detail-warn-txt">${esc(w.tooltip.split('\n')[0])}</span>
             </div>`).join('') + `</div>`
        : '';

      // ── Kopf-Kacheln (TE-Kern + Kennzeichen) ──
      const jaNein = (b) => b ? 'Ja' : 'Nein';
      const andockHint = te.andockVerspaetet
        ? ` <span class="dh-flag warn" title="Regel: Andocken max. 30 min nach geplantem Start">${fmtDauer(te.andockVerzugMin)}</span>` : '';

      const kopfFakten = [
        ['Interne TE',      esc(te.te)],
        ['Externe TE',      esc(te.teExt ?? '–')],
        ['Ankunft',         (te.tsAngedockt ? fmtDateTime(te.tsAngedockt) : '–') + andockHint],
        ['Direktfahrt',     jaNein(te.direktfahrt)],
        ['Shuttle',         jaNein(te.shuttle)],
        ['Vorpalettierung', esc(te.vorpalettierung ?? '–')],
        ['Priorität',       esc(keyTextStr(te.prioritaet) ?? '–')],
        ['Container-Depot', esc(te.containerDepot ?? '–')],
      ];
      const kopfHTML = kopfFakten.map(([l, v]) =>
        `<div class="dh-fact"><span class="dh-fact-l">${l}</span><span class="dh-fact-v">${v}</span></div>`
      ).join('');

      // ── Sendungsinfo ──
      const listeOderStrich = (arr) => (arr && arr.length) ? arr.join(', ') : '–';
      const anlLabel = te.anlieferungen.length > 1 ? `Anlieferungen (${te.anlieferungen.length})` : 'Anlieferung (Liefernr.)';
      const bestLabel = te.bestellungen.length > 1 ? `Bestellungen (${te.bestellungen.length})` : 'Bestellnummer';
      const sendung = [
        [anlLabel,                  esc(listeOderStrich(te.anlieferungen))],
        [bestLabel,                 esc(listeOderStrich(te.bestellungen))],
        ['Frachtführer',            esc(keyTextStr(te.frachtfuehrer) ?? '–')],
        ['Lieferant',               esc(keyTextStr(te.lieferant) ?? te.lieferantName ?? '–')],
        ['Ladestelle',              esc(ladestelleKurz(te.ladestelle))],
        ['Tor',                     esc(te.tor ?? 'nicht zugewiesen')],
        ['Halle',                   esc(te.halle ?? '–')],
        ['Positionen',              String(te.anzahlPositionen)],
        ['Anlieferpaletten',        String(te.anlieferpaletten)],
      ];
      const sendungHTML = sendung.map(([l, v]) =>
        `<div class="detail-row"><span class="detail-row-l">${l}</span><span class="detail-row-v">${v}</span></div>`
      ).join('');

      // ── Zeitvergleiche (die neun geforderten Paare) ──
      const tatEnde = te.tsEntladenTat ?? te.tsEntladenEnde;
      const vergleiche = [
        ['Geplanter Start → Geplantes Ende', te.geplantStart,   te.geplantEnde,     false],
        ['Ist-Start → Ist-Ende',             te.istStart,       te.istEnde,         false],
        ['Ankunft → Am Tor angedockt',       te.tsAnkunft,      te.tsAngedockt,     te.andockVerspaetet],
        ['Angedockt → Entladen gestartet',   te.tsAngedockt,    te.tsEntladenStart, null],
        ['Entladen gestartet → beendet',     te.tsEntladenStart, te.tsEntladenEnde, false],
        ['Entladen beendet → Tats. Ende',    te.tsEntladenEnde, tatEnde,            false],
        ['WE gebucht → Fertigstellung',      te.tsWeBuchung,    te.tsEinlagerung,   false],
        ['Ankunft → Fertigstellung',         te.tsAnkunft,      te.tsEinlagerung,   false],
        ['Angedockt → Fertigstellung',       te.tsAngedockt,    te.tsEinlagerung,   false],
      ];
      // Maximale Dauer für die proportionale Balkenbreite
      const maxDauer = Math.max(1, ...vergleiche
        .map(([, von, bis]) => { const m = diffMin(von, bis); return (von && bis && m != null) ? Math.abs(m) : 0; }));

      const vglHTML = vergleiche.map(([label, von, bis, warn]) => {
        const min = diffMin(von, bis);
        const hat = von && bis && min != null;
        // Schwellwert-Automatik nur wo nicht explizit gesetzt
        const kritisch = warn === true
          || (warn == null && hat && min > VERZOEGERUNG_SCHWELLE_MIN);
        const wertTxt = hat ? fmtDauer(min) : '–';
        const zeitTxt = (von && bis)
          ? `${fmtTime(von)} → ${fmtTime(bis)}`
          : (von ? `${fmtTime(von)} → …` : '…');
        // Proportionaler Balken: zeigt die Dauer relativ zur längsten Phase.
        const breite = hat ? Math.max(3, (Math.abs(min) / maxDauer) * 100) : 0;
        const balken = hat
          ? `<div class="vgl-bar"><div class="vgl-bar-fill ${kritisch ? 'bad' : 'ok'}" style="width:${breite.toFixed(0)}%"></div></div>`
          : `<div class="vgl-bar"></div>`;
        return `
          <div class="vgl-row${!hat ? ' leer' : ''}">
            <div class="vgl-label">${esc(label)}</div>
            <div class="vgl-zeit">${zeitTxt}</div>
            ${balken}
            <div class="vgl-dauer ${kritisch ? 'bad' : (hat ? 'ok' : '')}">${wertTxt}</div>
          </div>`;
      }).join('');

      return /* html */`
        <div class="detail-head s-${esc(status)}">
          <div class="dh-top">
            <div>
              <div class="dh-te">${esc(te.teExt ?? te.te)}</div>
              <div class="dh-sub">${esc(te.lieferantName ?? '')}</div>
            </div>
            <a class="dh-ewm" href="${esc(ewmLink(te.te))}" target="_blank" rel="noopener">In EWM öffnen ↗</a>
            <span class="tc-badge badge-${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>
            ${deltaHTML}
          </div>
          ${warnHTML}
          <div class="dh-facts">${kopfHTML}</div>
        </div>

        <div class="detail-section">
          <div class="d-section-title">Prozess-Zeitstrahl</div>
          <div class="tl-legend">
            <div class="tl-legend-item"><div class="tl-legend-swatch" style="height:11px;border:1px dashed var(--c-text3);border-radius:2px;background:var(--c-bg3)"></div>Soll (Plan)</div>
            <div class="tl-legend-item"><div class="tl-legend-swatch" style="background:var(--c-green);height:4px"></div>Ist-Verlauf</div>
            <div class="tl-legend-item"><div class="tl-legend-swatch" style="background:var(--c-red)"></div>Verzögert</div>
            <div class="tl-legend-item"><div style="width:9px;height:9px;border:1px dashed var(--c-text2);border-radius:50%"></div>Abfahrt (optional)</div>
          </div>
          ${this._zeitstrahlHTML(te, isVerspaetet)}
        </div>

        <div class="d-cols">
          <div class="detail-section">
            <div class="d-section-title">Sendungsinfo</div>
            ${sendungHTML}
          </div>
          <div class="detail-section">
            <div class="d-section-title">Zeitvergleiche</div>
            <div class="vgl-table">${vglHTML}</div>
          </div>
        </div>

        <div class="detail-section">
          <div class="d-section-title">Positionen (${te.anzahlPositionen})</div>
          ${this._produktTabelleHTML(te)}
        </div>
      `;
    }

    _zeitstrahlHTML(te, isVerspaetet) {
      // Punkte: 6 Pflicht-Schritte + Abfahrt (optional)
      const punkteRaw = [
        { ts: te.tsAnkunft,       label: 'Ankunft',       kurz: 'AN',  optional: false },
        { ts: te.tsAngedockt,     label: 'Angedockt',     kurz: 'AD',  optional: false },
        { ts: te.tsEntladenStart, label: 'Entladen ab',   kurz: 'E▶', optional: false },
        { ts: te.tsEntladenEnde ?? te.tsEntladenTat,
                                  label: 'Entladen bis',  kurz: 'E■', optional: false },
        { ts: te.tsWeBuchung,     label: 'WE gebucht',    kurz: 'WE',  optional: false },
        { ts: te.tsEinlagerung,   label: 'Fertigstellung',kurz: 'FS',  optional: false },
        { ts: te.tsAbfahrt,       label: 'Abfahrt',       kurz: 'AB',  optional: true  },
      ];

      // Nur Punkte mit Timestamp
      const punkte = punkteRaw.filter(p => p.ts);

      if (punkte.length === 0) {
        // Nur geplant: zeige Soll-Fenster als Hinweis
        if (te.geplantStart) {
          return `<div class="zs-geplant">
            <span class="zs-geplant-icon">🕐</span>
            Geplant: ${fmtDateTime(te.geplantStart)}${te.geplantEnde ? ' – ' + fmtTime(te.geplantEnde) : ''}
            <span class="zs-geplant-hint">— noch keine Ist-Zeiten erfasst</span>
          </div>`;
        }
        return `<div class="zs-geplant">Keine Zeitstempel vorhanden</div>`;
      }

      // Zeitbereich
      const alleDaten = [...punkte.map(p => p.ts), te.geplantStart, te.geplantEnde].filter(Boolean);
      const minTs = new Date(Math.min(...alleDaten.map(d => d.getTime())));
      const maxTs = new Date(Math.max(...alleDaten.map(d => d.getTime())));
      const pufferMs = Math.max((maxTs - minTs) * 0.08, 5 * 60000);
      const startMs = minTs.getTime() - pufferMs;
      const endMs   = maxTs.getTime() + pufferMs;
      const spanMs  = endMs - startMs || 1;
      const pctRaw = (d) => ((d.getTime() - startMs) / spanMs * 100);

      // ── Kollisions-Vermeidung ──
      // Rohe Positionen berechnen, dann Punkte die zu nah sind auseinanderziehen.
      const MIN_ABSTAND = 13; // Prozent Mindestabstand zwischen Punkten
      let positionen = punkte.map(p => ({ ...p, pos: pctRaw(p.ts) }));
      positionen.sort((a, b) => a.pos - b.pos);
      for (let i = 1; i < positionen.length; i++) {
        const delta = positionen[i].pos - positionen[i - 1].pos;
        if (delta < MIN_ABSTAND) {
          positionen[i].pos = positionen[i - 1].pos + MIN_ABSTAND;
        }
      }
      // Falls rechts rausgelaufen: alles zurückskalieren
      const maxPos = positionen[positionen.length - 1].pos;
      if (maxPos > 96) {
        const faktor = 96 / maxPos;
        positionen.forEach(p => p.pos = p.pos * faktor);
      }

      // ── Soll-Band (Plan) — graues gestricheltes Band oberhalb der Achse,
      //    mit senkrechten Verbindungslinien nach unten zur Ist-Achse, damit
      //    man Soll-Start und Soll-Ende direkt gegen den Ist-Verlauf ablesen kann.
      let sollHTML = '';
      if (te.geplantStart || te.geplantEnde) {
        const hatBeide = te.geplantStart && te.geplantEnde;
        const lRaw = te.geplantStart ? pctRaw(te.geplantStart) : pctRaw(te.geplantEnde);
        const rRaw = te.geplantEnde ? pctRaw(te.geplantEnde) : pctRaw(te.geplantStart);
        const l = Math.max(0, Math.min(100, lRaw));
        const r = Math.max(0, Math.min(100, rRaw));
        const w = Math.max(0.5, r - l);

        // Band mit Beschriftung
        const bandLabel = hatBeide
          ? `Soll ${fmtTime(te.geplantStart)}–${fmtTime(te.geplantEnde)}`
          : (te.geplantStart ? `Soll ab ${fmtTime(te.geplantStart)}` : `Soll bis ${fmtTime(te.geplantEnde)}`);
        let bandHTML = `
          <div class="zs-soll-band" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%">
            <span class="zs-soll-label">${bandLabel}</span>
          </div>`;

        // Senkrechte Verbindungslinien + Timestamp am Fuß (auf Achsenhöhe)
        let linienHTML = '';
        if (te.geplantStart) {
          linienHTML += `
            <div class="zs-soll-drop" style="left:${l.toFixed(2)}%">
              <span class="zs-soll-tick start"></span>
              <span class="zs-soll-time">${fmtTime(te.geplantStart)}</span>
            </div>`;
        }
        if (te.geplantEnde) {
          linienHTML += `
            <div class="zs-soll-drop" style="left:${r.toFixed(2)}%">
              <span class="zs-soll-tick ende"></span>
              <span class="zs-soll-time">${fmtTime(te.geplantEnde)}</span>
            </div>`;
        }
        sollHTML = bandHTML + linienHTML;
      }

      // ── Ist-Verlauf — kräftige farbige Linie AUF der Achse ──
      let istLinieHTML = '';
      if (positionen.length >= 2) {
        const first = positionen[0].pos;
        const last  = positionen[positionen.length - 1].pos;
        const farbe = isVerspaetet ? 'var(--c-red)' : 'var(--c-green)';
        istLinieHTML = `<div class="zs-ist-linie" style="left:${first.toFixed(2)}%;width:${(last - first).toFixed(2)}%;background:${farbe}"></div>`;
      }

      // Punkte + Labels (abwechselnd oben/unten gegen Überlappung)
      const punkteHTML = positionen.map((p, i) => {
        const oben = i % 2 === 0;
        const dotCls = p.optional
          ? 'zs-dot optional'
          : (isVerspaetet ? 'zs-dot late' : 'zs-dot done');
        return `
          <div class="zs-point ${oben ? 'oben' : 'unten'}" style="left:${p.pos.toFixed(2)}%">
            <div class="${dotCls}" title="${esc(p.label)}: ${fmtDateTime(p.ts)}"></div>
            <div class="zs-label">
              <div class="zs-label-name">${esc(p.label)}${p.optional ? ' <span class="zs-opt">(opt.)</span>' : ''}</div>
              <div class="zs-label-time">${fmtTime(p.ts)}</div>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="zs-wrap">
          <div class="zs-track">
            <div class="zs-baseline"></div>
            ${sollHTML}
            ${istLinieHTML}
            ${punkteHTML}
          </div>
        </div>`;
    }

    // Baut die Produkt-Tabelle
    _produktTabelleHTML(te) {
      if (te.produkte.length === 0) {
        return `<div class="view-placeholder" style="min-height:60px;">Keine Produktdaten</div>`;
      }

      // Ja/Nein-Zelle mit farblicher Betonung wenn "Ja" operativ relevant ist.
      const flag = (b, betonung) =>
        b ? `<span class="pt-flag ${betonung ? 'on' : ''}">Ja</span>`
          : `<span class="pt-flag off">–</span>`;
      const val = (v) => (v == null || v === '' || v === '#') ? '<span class="pt-muted">–</span>' : esc(String(v));
      const kt  = (o) => { const s = keyTextStr(o); return s ? esc(s) : '<span class="pt-muted">–</span>'; };

      const zeilen = te.produkte.map(p => {
        const krit = (p.kritKategorie && p.kritKategorie.key)
          ? `<span class="pt-krit" title="${esc((keyTextStr(p.kritKategorie) ?? '') + (p.kritFreitext ? ' — ' + p.kritFreitext : ''))}">⚠ ${esc(keyTextStr(p.kritKategorie))}</span>`
          : '<span class="pt-muted">–</span>';
        const bestand = (p.bestand == null || p.bestand === 0)
          ? `<span class="pt-warn">${p.bestand == null ? '–' : '0'}</span>`
          : esc(String(p.bestand));

        return `
          <tr>
            <td class="pt-sticky">
              <div class="pt-prod-nr">${esc(p.nr)}</div>
              <div class="pt-prod-name">${esc(p.name)}</div>
            </td>
            <td class="pt-num">${esc(String(p.menge ?? 0))} ${esc(p.einheit ?? '')}</td>
            <td class="pt-num">${p.anlieferpaletten ?? 0}</td>
            <td>${val(p.halle)}</td>
            <td>${kt(p.hwg)}</td>
            <td>${kt(p.packmittel)}</td>
            <td>${val(p.einlagersteuerkz)}</td>
            <td>${bestand}</td>
            <td class="pt-center">${flag(p.fotoErstellt, false)}</td>
            <td class="pt-center">${flag(p.baender, true)}</td>
            <td class="pt-center">${flag(p.sperrgut, true)}</td>
            <td class="pt-center">${val(p.qpGruppe)}</td>
            <td>${krit}</td>
            <td class="pt-time-cell">${p.tsEinlagerung ? fmtTime(p.tsEinlagerung) : '<span class="pt-muted">offen</span>'}</td>
          </tr>`;
      }).join('');

      return `
        <div class="pt-scroll">
          <table class="pt-table">
            <thead>
              <tr>
                <th class="pt-sticky">Produkt</th>
                <th class="pt-num">Menge</th>
                <th class="pt-num">Pal.</th>
                <th>Halle</th>
                <th>HWG</th>
                <th>Packmittel</th>
                <th>Einl.-KZ</th>
                <th>Bestand</th>
                <th class="pt-center">Foto</th>
                <th class="pt-center">Bänder</th>
                <th class="pt-center">Sperrgut</th>
                <th class="pt-center">QP</th>
                <th>Kritisch</th>
                <th>Fertigst.</th>
              </tr>
            </thead>
            <tbody>${zeilen}</tbody>
          </table>
        </div>`;
    }

    // ── Gesamt-Render ─────────────────────────────────────────────────────

    _render() {
      this._log(`_render() — ${this._teMap.size} TEs im internen State`);
      this._hideLoading();

      if (this._teMap.size === 0) {
        this._showEmpty('Keine Transporteinheiten vorhanden');
        return;
      }
      this._hideEmpty();

      // Steht die aktuell geöffnete TE nach dem Neuladen nicht mehr zur
      // Verfügung, fällt die Ansicht zurück auf die Übersicht.
      if (this._activeTE && !this._teMap.has(this._activeTE)) {
        this._log(`Bisher offene TE ${this._activeTE} ist nach dem Reload nicht mehr vorhanden — zurück zur Übersicht`, 'warn');
        this._activeTE = null;
        this._switchView('uebersicht');
      }

      this._renderUebersicht();

      // Detailsicht offen? Dann mit den frischen Daten neu aufbauen.
      if (this._activeTE) this._renderDetail(this._activeTE);

      this._log(`_render() abgeschlossen (gesamt ${this._seitStart()}ms seit dem Einhängen)`);
    }

    // ── SAC DataSource-Setter ─────────────────────────────────────────────
    //   Einstiegspunkt für die BW-Datenbindung — SAC ruft diesen auf, sobald
    //   neue Daten verfügbar sind. Wird HIER protokolliert, bei JEDEM Aufruf
    //   und JEDEM state — nicht nur im Erfolgsfall. Genau das war die Lücke:
    //   bisher blieb die Konsole bei jedem state ≠ 'success' stumm, was den
    //   Fall "nur Ladeanimation, nichts in der Konsole" nicht von "SAC ruft
    //   den Setter gar nicht erst auf" unterscheidbar machte.

    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;
      this._dsAufrufe++;

      const state = dataBinding?.state ?? null;
      const anzahlRows = Array.isArray(dataBinding?.data) ? dataBinding.data.length : null;
      this._log(
        `myDataSource gesetzt (Aufruf #${this._dsAufrufe}) — state='${state}'`
        + (anzahlRows != null ? `, ${anzahlRows} Rows` : ', keine Datenarray vorhanden'),
        state === 'success' ? 'info' : 'warn',
        { state, hatDataArray: Array.isArray(dataBinding?.data), anzahlRows,
          objektSchluessel: dataBinding ? Object.keys(dataBinding) : null },
      );

      if (!dataBinding) {
        this._log('myDataSource: dataBinding ist null/undefined — SAC hat (noch) keine Bindung übergeben', 'warn');
        this._showLoading();
        return;
      }

      if (dataBinding.state !== 'success') {
        // Typische Zwischenzustände von SAC: 'loading', 'booting', 'error',
        // 'incomplete' o.ä. — je nach dem, was hier ankommt, lässt sich die
        // CORS-Störung von einem reinen Ladezustand unterscheiden.
        this._log(`myDataSource: state='${state}' ist kein Erfolg — Ladeanimation bleibt aktiv`, 'warn');
        this._showLoading();
        return;
      }

      const rows = Array.isArray(dataBinding.data) ? dataBinding.data : [];
      this._log(`myDataSource: Erfolg — ${rows.length} Rows werden geparst`);

      const tParseStart = this._seitStart();
      try {
        this._teMap = parseRows(rows, this._cfg);
      } catch (err) {
        // Ein Parserfehler darf das Widget nicht in einem Dauer-Ladezustand
        // hinterlassen — lieber sichtbar leer als endlos drehend.
        this._log('Fehler beim Parsen der Daten', 'error', err);
        this._teMap = new Map();
        this._hideLoading();
        this._showEmpty('Daten konnten nicht ausgewertet werden');
        return;
      }
      this._log(`Parsing abgeschlossen in ${this._seitStart() - tParseStart}ms — ${this._teMap.size} TEs`);

      // Slider-Domäne hängt an den Daten → nach jedem Laden neu bestimmen
      this._syncSlider();
      this._watchdogStop();
      this._render();
    }

    get myDataSource() { return this._dataBinding; }

    // ── Properties ────────────────────────────────────────────────────────
    //   SAC setzt Properties direkt als Felder auf dem Element. Über die
    //   Setter werden sie validiert und in die Berechnungs-Konfiguration
    //   (this._cfg) gespiegelt.

    set theme(v) {
      this._theme = (v === 'light') ? 'light' : 'dark';
      this._applyTheme();
    }
    get theme() { return this._theme; }

    set defaultZeitraum(v) {
      this.setZeitraum(v);
    }
    get defaultZeitraum() { return presetErkennen(this._bereich) ?? 'individuell'; }

    set puenktlichkeitToleranzMin(v) {
      const n = Number(v);
      this._cfg.toleranzMin = Number.isFinite(n) && n >= 0 ? n : VERZOEGERUNG_SCHWELLE_MIN;
      this._neuBerechnen();
    }
    get puenktlichkeitToleranzMin() { return this._cfg.toleranzMin; }

    set mengenToleranzProzent(v) {
      const n = Number(v);
      this._cfg.mengenToleranzPct = Number.isFinite(n) && n >= 0 ? n : 0;
      this._neuBerechnen();
    }
    get mengenToleranzProzent() { return this._cfg.mengenToleranzPct; }

    set maxTEs(v) {
      const n = Number(v);
      this._maxTEs = Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
      if (this._teMap.size) this._renderTabelle();
    }
    get maxTEs() { return this._maxTEs; }

    // Toleranzänderungen wirken auf die Kennzahlen jeder TE — deshalb neu
    // rechnen statt neu laden (die Rohdaten liegen bereits geparst vor).
    _neuBerechnen() {
      if (!this._teMap || this._teMap.size === 0) return;
      for (const te of this._teMap.values()) {
        berechneTE(te, this._cfg);
        berechneKennzahlen(te, this._cfg);
        te.warnungen = baueWarnungen(te);
      }
      this._renderUebersicht();
      if (this._activeTE) this._renderDetail(this._activeTE);
    }

    // SAC-Lifecycle: wird bei jeder Property-Änderung aufgerufen.
    onCustomWidgetBeforeUpdate(changedProperties) {
      this._log('onCustomWidgetBeforeUpdate', 'info', changedProperties);
      this._changed = changedProperties ?? {};
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      const c = changedProperties ?? this._changed ?? {};
      this._log('onCustomWidgetAfterUpdate — geänderte Properties:', 'info', c);
      if ('theme' in c)                     this.theme = c.theme;
      if ('defaultZeitraum' in c)           this.defaultZeitraum = c.defaultZeitraum;
      if ('puenktlichkeitToleranzMin' in c) this.puenktlichkeitToleranzMin = c.puenktlichkeitToleranzMin;
      if ('mengenToleranzProzent' in c)     this.mengenToleranzProzent = c.mengenToleranzProzent;
      if ('maxTEs' in c)                    this.maxTEs = c.maxTEs;
      this._changed = null;
    }

    onCustomWidgetDestroy() {
      this._log('onCustomWidgetDestroy');
      this._ac.abort();
      this._watchdogStop();
      clearTimeout(this._suchTimer);
    }

    // ── Public API (aufrufbar via SAC-Script) ─────────────────────────────

    refreshData() {
      if (this._dataBinding) this.myDataSource = this._dataBinding;
    }

    setTheme(theme) {
      if (theme === 'dark' || theme === 'light') {
        this._theme = theme;
        this._applyTheme();
      }
    }

    // Vordefinierten Zeitraum wählen. Der Slider wird mitgeführt.
    setZeitraum(preset) {
      const erlaubt = ['gestern', 'dieseWoche', 'letzteWoche', 'standard'];
      if (!erlaubt.includes(preset)) return;
      this._bereich = presetBereich(preset);
      this._syncSlider();
      if (this._teMap.size) this._renderUebersicht();
    }

    // Individuellen Zeitraum setzen. Akzeptiert Date-Objekte oder Datums-
    // Strings (ISO, deutsch oder SAP-Format); `bis` ist einschließlich.
    setZeitraumBereich(von, bis) {
      const a = (von instanceof Date) ? von : parseTs(von);
      const b = (bis instanceof Date) ? bis : parseTs(bis);
      if (!a || !b) {
        console.warn('[WE-Analyse] setZeitraumBereich: Datum nicht lesbar', von, bis);
        return;
      }
      let vonTag = tagStart(a);
      let bisTag = tagStart(b);
      if (bisTag < vonTag) { const t = vonTag; vonTag = bisTag; bisTag = t; }
      this._bereich = { von: vonTag, bis: new Date(bisTag.getTime() + TAG_MS) };
      this._syncSlider();
      if (this._teMap.size) this._renderUebersicht();
    }

    setKennzahlFilter(filter) {
      const erlaubt = ['alle', 'otif-nein', 'unpuenktlich', 'mengenabweichung', 'nb'];
      if (!erlaubt.includes(filter)) return;
      this._kFilter = filter;
      this._shadow.querySelectorAll('[data-kfilter]').forEach(c =>
        c.classList.toggle('active', c.dataset.kfilter === filter));
      this._renderTabelle();
    }

    // Öffnet die Detailsicht für eine TE-Nummer (auch aus SAC-Skripten heraus).
    showDetail(teNr) {
      const key = String(teNr ?? '').replace(/^0+/, '');
      if (!this._teMap.has(key)) {
        console.warn(`[WE-Analyse] showDetail: TE ${teNr} nicht in den Daten`);
        return;
      }
      this._renderDetail(key);
    }

    // Zurück zur Übersicht.
    showUebersicht() {
      this._activeTE = null;
      this._switchView('uebersicht');
    }
  }

  // Idempotente Registrierung (safe bei HMR / Doppel-Load)
  if (!customElements.get(TAG)) {
    customElements.define(TAG, WEEingangWidget);
  }

})();
