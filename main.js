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
  const NULL_TOKENS = new Set(['', '#', '00000000', '000000000000', '@NullMember', '@TotalMembers', 'null', 'undefined']);

  // ── Ladestellen-Mapping ──────────────────────────────────────────────
  // BW liefert die lange Bezeichnung. Für Filter + Badges brauchen wir eine
  // kurze Kategorie, für Gruppierung + Zeitstrahl die volle Bezeichnung.
  // LADESTELLE_KURZ ordnet jede lange Bezeichnung einer der 4 Kategorien zu.
  // Drei Ladestellen. Jede hat einen Kurznamen (Filter) und einen vollen Namen
  // (Gruppierung). "Eigendisposition" ist KEINE eigene Ladestelle, sondern
  // gehört zu BSL (ILW Krefeld BSL / Eigendisposition).
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

  // Voller Name je Kurzname — für die Gruppierungs-Header.
  const LADESTELLE_LANG = {
    BSL:         'ILW Krefeld BSL / Eigendisposition',
    Container:   'ILW Krefeld Container',
    Landverkehr: 'ILW Krefeld Frei Haus / DDP',
  };

  // Gibt die kurze Kategorie zu einer (Schlüssel-, langen oder kurzen) Bezeichnung.
  function ladestelleKurz(wert) {
    const w = wert == null ? '' : String(wert).trim();
    if (LADESTELLE_KURZ[w]) return LADESTELLE_KURZ[w];
    // Fallback: per Schlüsselwort raten (case-insensitive)
    if (/container|containe/i.test(w))     return 'Container';
    if (/frei haus|ddp|landverk/i.test(w)) return 'Landverkehr';
    // Eigendisposition zählt zu BSL
    if (/bsl|eigendispo/i.test(w))         return 'BSL';
    // Unbekannt/leer → BSL (Sammelkategorie für Eigendisposition)
    return 'BSL';
  }

  // Voller Anzeigename einer Ladestelle (für Gruppierungs-Header).
  const ladestelleLang = (wert) => {
    const kurz = ladestelleKurz(wert);
    return LADESTELLE_LANG[kurz] ?? kurz;
  };

  // Die 4 Kategorien in fester Reihenfolge (für Filter + Gruppierung)
  const LADESTELLE_KATEGORIEN = ['BSL', 'Container', 'Landverkehr'];

  // Icon + Farbe je Kategorie
  const LADESTELLE_STYLE = {
    BSL:         { icon: '🚛', cls: 'ls-bsl',  col: 'rgba(142,68,173,0.85)' },
    Container:   { icon: '🏗', cls: 'ls-cont', col: 'rgba(230,126,34,0.85)' },
    Landverkehr: { icon: '🚚', cls: 'ls-land', col: 'rgba(39,174,96,0.85)'  },
  };

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
  // Die 6 PFLICHT-Prozessschritte in Reihenfolge. Abfahrt ist optional
  // und wird separat behandelt (siehe te.abgefahren).
  const PROZESS_SCHRITTE = [
    'Ankunft am Kontrollpunkt',
    'Am Tor angedockt',
    'Entladen gestartet',
    'Entladen beendet',
    'Wareneingang gebucht',
    'Fertigstellung',
  ];

  // Anzeigenamen der Status
  // Prozess-Status = WO steht die TE in der Kette. Dies ist bewusst getrennt
  // von der Zeit-Bewertung (pünktlich/verzögert/überfällig), die separat im
  // Pünktlichkeits-Hinweis dargestellt wird — nie als Status.
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

  // Verzögerungsschwellwert in Minuten – ab wann eine TE als "verzögert" gilt
  const VERZOEGERUNG_SCHWELLE_MIN = 30;

  // Andocken darf höchstens 30 Minuten nach dem geplanten Start erfolgen.
  const ANDOCK_TOLERANZ_MIN = 30;

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

  // Normalisiert einen Tor-Wert: '#' oder leer → null (kein Tor zugewiesen).
  const normTor = (raw) => {
    if (isNull(raw)) return null;
    const s = String(raw).trim();
    return (s === '#' || s === '') ? null : s;
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
  //   status: 'erwartet'|'ankunft'|'angedockt'|'entladen'|'entladen_fertig'|'fertigstellung'|'eingelagert'
  //   verzoegerungMin: Number|null,
  //   fortschritt: 0–6 (Anzahl abgeschlossener Schritte)

  function parseRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return new Map();

    const teMap = new Map();

    for (const row of rows) {
      // ── TE-Stammdaten ──
      const teNrRaw = readDim(row,
        'dimension_te', 'TE', 'VBELN', 'te_nr'
      );
      if (!teNrRaw) continue;
      // Führende Nullen entfernen und als einheitlichen Schlüssel verwenden,
      // damit Map-Key, te.te und data-te im DOM identisch sind (Klick funktioniert).
      const teNr = String(teNrRaw).replace(/^0+/, '') || String(teNrRaw);

      if (!teMap.has(teNr)) {
        teMap.set(teNr, {
          te:              teNr,
          teHinweis:       readDim(row, 'dimension_te_hinweis', 'TE_HINWEIS'),
          // Ladestelle: BW liefert lange Bezeichnung (z.B. "ILW Krefeld Container")
          ladestelle:      readDim(row, 'dimension_ladestelle', 'LADESTELLE'),
          // Tor: "#" bedeutet noch kein Tor zugewiesen
          tor:             normTor(readDim(row, 'dimension_tor', 'TOR')),
          liefernummer:    ohneNullen(readDim(row, 'dimension_liefernummer', 'LIFNR')),
          bestellnummer:   ohneNullen(readDim(row, 'dimension_bestellnummer', 'EBELN')),
          // Lieferant = Warensender. BW-Merkmal mit Key + Text.
          lieferant:       readKeyText(row, 'dimension_lieferant_name', 'dimension_lieferant_nr', 'WARENSENDER'),
          lieferantNr:     readDim(row,  'dimension_lieferant_nr', 'WARENSENDER_NR', 'WARENSENDER'),
          lieferantName:   readLabel(row, 'dimension_lieferant_name', 'dimension_lieferant_nr', 'WARENSENDER') ?? '–',
          transportmittel: readDim(row, 'dimension_transportmittel', 'TRMIT'),
          // Halle = "Einlagerung in Halle" (Werte 4, 6, 8 ...)
          halle:           normHalle(readDim(row, 'dimension_halle', 'HALLE', 'LGNUM')),

          // ── Neue TE-Ebene-Felder ──────────────────────────────────────
          teExt:           readDim(row, 'dimension_te_ext', 'TE_EXT'),
          direktfahrt:     istWahr(readDim(row, 'dimension_direktfahrt')),
          shuttle:         istWahr(readDim(row, 'dimension_shuttle')),
          vorpalettierung: readDim(row, 'dimension_vorpalettierung'),
          // Priorität: Key + Text. Vorhanden = Warnung (egal welche Stufe).
          prioritaet:      readKeyText(row, 'dimension_prioritaet'),
          containerDepot:  readDim(row, 'dimension_container_depot'),
          // Frachtführer: Key numerisch (400352), Klartext im Label
          frachtfuehrer:   readKeyText(row, 'dimension_frachtfuehrer'),

          // Ist-Start / Ist-Ende (eigene BW-Felder)
          istStart:        readTs(row, 'dimension_ist_start'),
          istEnde:         readTs(row, 'dimension_ist_ende'),

          // Zeitfenster (Soll)
          geplantStart:    readTs(row, 'dimension_geplant_start', 'GEPLANT_START'),
          geplantEnde:     readTs(row, 'dimension_geplant_ende', 'GEPLANT_ENDE'),

          // Prozess-Timestamps (Ist) — Reihenfolge des WE-Prozesses
          tsAnkunft:        readTs(row, 'dimension_ts_ankunft', 'ANKUNFT'),
          tsAngedockt:      readTs(row, 'dimension_ts_angedockt', 'ANGEDOCKT'),
          tsEntladenStart:  readTs(row, 'dimension_ts_entladen_start', 'ENTLADEN_START'),
          tsEntladenEnde:   readTs(row, 'dimension_ts_entladen_ende', 'ENTLADEN_ENDE'),
          tsEntladenTat:    readTs(row, 'dimension_ts_entladen_tat', 'ENTLADEN_TAT'),
          tsWeBuchung:      readTs(row, 'dimension_ts_we_buchung', 'WE_BUCHUNG'),
          // Fertigstellung = Einlagerung abgeschlossen
          tsEinlagerung:    readTs(row, 'dimension_ts_einlagerung', 'FERTIGSTELLUNG'),
          // Abfahrt = OPTIONAL, zählt nicht als Pflicht-Prozessschritt
          tsAbfahrt:        readTs(row, 'dimension_ts_abfahrt', 'ABFAHRT'),

          produkte:         [],

          // Berechnete Felder – werden in berechneTE() gesetzt
          status:           'erwartet',
          verzoegerungMin:  null,
          fortschritt:      0,
          abgefahren:       false,
          warnungen:        [],     // [{ typ, icon, farbe, label, tooltip }]
          anzahlPositionen: 0,
          anlieferpaletten: 0,      // Summe über alle Positionen
          andockVerspaetet: false,  // Andocken > geplanter Start + 30 min
        });
      }

      // ── Produktzeile anhängen ──
      const te = teMap.get(teNr);
      const prodNr = ohneNullen(readDim(row, 'dimension_produkt_nr', 'MATNR'));
      if (prodNr) {
        te.produkte.push({
          nr:           prodNr,
          name:         readLabel(row, 'dimension_produkt_name', 'dimension_produkt_nr', 'MAKTX') ?? '–',
          menge:        readVal(row, 'value_menge', 'MENGE') ?? 0,
          einheit:      readDim(row, 'dimension_einheit', 'MEINS') ?? '',
          halle:        normHalle(readDim(row, 'dimension_halle', 'LGNUM')) ?? '',
          tsEinlagerung: readTs(row, 'dimension_ts_einlagerung'),

          // ── Neue Positionsebene-Felder ──────────────────────────────
          packmittel:      readKeyText(row, 'dimension_packmittel'),
          hwg:             readKeyText(row, 'dimension_hwg'),
          einlagersteuerkz: readDim(row, 'dimension_einlagersteuerkz'),
          fotoErstellt:    istWahr(readDim(row, 'dimension_foto_erstellt')),
          baender:         istWahr(readDim(row, 'dimension_baender')),
          sperrgut:        istWahr(readDim(row, 'dimension_sperrgut')),
          stapelbarkeit:   readDim(row, 'dimension_stapelbarkeit'),
          // Kritischer Artikel: Kategorie (Key + Text) + Freitext
          kritKategorie:   readKeyText(row, 'dimension_krit_kategorie'),
          kritFreitext:    readDim(row, 'dimension_krit_freitext'),
          // Qualitätsprüfgruppe: Wert vorhanden ⇒ prüfpflichtig
          qpGruppe:        readDim(row, 'dimension_qp_gruppe'),
          // Kennzahlen
          bestand:         readNum(row, 'value_bestand_tagesgenau'),
          anlieferpaletten: readPaletten(row, 'value_anlieferpaletten'),
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
    const jetzt = jetztWanduhr();

    // ── Fertigstellung pro Produkt aggregieren ──
    // Eine TE gilt erst als fertiggestellt, wenn ALLE Produkte ein
    // Fertigstellungs-Datum haben. Das TE-Level tsEinlagerung wird aus den
    // Produktzeilen abgeleitet (spätestes Datum, wenn alle vorhanden).
    const prodEinlag = te.produkte.map(p => p.tsEinlagerung);
    const alleFertig = te.produkte.length > 0 && prodEinlag.every(ts => ts !== null);
    te.alleFertiggestellt = alleFertig;
    // TE-Level tsEinlagerung = spätestes Produkt-Fertigstellungsdatum (nur wenn alle fertig)
    if (alleFertig) {
      te.tsEinlagerung = prodEinlag.reduce((a, b) => (b > a ? b : a));
    } else {
      te.tsEinlagerung = null; // noch nicht vollständig fertiggestellt
    }

    // ── Fortschritt: Anzahl abgeschlossener PFLICHT-Prozessschritte ──
    // Abfahrt ist OPTIONAL und zählt NICHT zum Fortschritt (max. 6 Pflicht-Schritte):
    // 1 Ankunft · 2 Angedockt · 3 Entladen-Start · 4 Entladen-Ende · 5 WE-Buchung · 6 Fertigstellung
    const pflichtSchritte = [
      te.tsAnkunft, te.tsAngedockt, te.tsEntladenStart,
      te.tsEntladenEnde, te.tsWeBuchung, te.tsEinlagerung,
    ];
    te.fortschritt = pflichtSchritte.filter(ts => ts !== null).length;

    // Abfahrt separat als Flag (optionaler Schritt hinter "fertig")
    te.abgefahren = te.tsAbfahrt !== null;

    // ── Verzögerung: Geplanter Start → Ankunft am Kontrollpunkt ──
    // Maßgeblich ist die Pünktlichkeit des Transports, also wann der LKW am
    // Kontrollpunkt eintraf — NICHT wie lange die Abwicklung danach dauerte.
    // (Die Zeit zwischen Ankunft und Entladung ist normale Prozesszeit.)
    te.verzoegerungMin = null;
    if (te.geplantStart && te.tsAnkunft) {
      const dm = diffMin(te.geplantStart, te.tsAnkunft);
      te.verzoegerungMin = dm < 0 ? 0 : dm;
    }
    // Wenn noch nicht eingetroffen, aber geplanter Start liegt schon zurück:
    // laufende Verspätung gegen "jetzt" (wird für Überfälligkeit genutzt).

    // ── Prozess-Status ── (rein aus dem Prozessfortschritt, "am weitesten"
    // erreichter Schritt zuerst geprüft). Der Status beschreibt NUR, WO die TE
    // in der Kette steht — nie ob sie verzögert ist. Die Zeit-Bewertung
    // (pünktlich/verzögert/überfällig) läuft komplett getrennt über
    // te.planabweichung / den Pünktlichkeits-Hinweis in der Kachel.
    // Abfahrt bestimmt den Status NICHT (separates Flag te.abgefahren).
    if (te.alleFertiggestellt) {
      te.status = 'eingelagert';           // 6 Fertigstellung
    } else if (te.tsWeBuchung) {
      te.status = 'fertigstellung';        // 5 WE gebucht → Einlagerung läuft
    } else if (te.tsEntladenEnde) {
      te.status = 'entladen_fertig';       // 4 Entladen beendet
    } else if (te.tsEntladenStart) {
      te.status = 'entladen';              // 3 Wird entladen
    } else if (te.tsAngedockt) {
      te.status = 'angedockt';             // 2 Am Tor angedockt
    } else if (te.tsAnkunft) {
      te.status = 'ankunft';               // 1 Eingetroffen
    } else {
      te.status = 'erwartet';              // 0 noch nicht da
    }

    // ── Planabweichung (Zeit-Bewertung, getrennt vom Prozess-Status) ─────
    // Eine TE weicht von der Planung ab wenn:
    //  a) sie überfällig ist: geplanter Start liegt >Schwelle in der
    //     Vergangenheit, aber sie ist noch gar nicht eingetroffen, ODER
    //  b) sie verzögert ist: sie steht am Tor / wird abgewickelt, aber die
    //     Wartezeit gegenüber dem geplanten Start liegt über der Schwelle,
    //     und sie ist noch nicht fertig eingelagert.
    te.planabweichung = false;
    te.abweichungGrund = null;
    te.ueberfaelligMin = null;
    if (te.status === 'erwartet' && te.geplantStart) {
      const ueberfaellig = diffMin(te.geplantStart, jetzt);
      if (ueberfaellig >= VERZOEGERUNG_SCHWELLE_MIN) {
        te.planabweichung = true;
        te.abweichungGrund = 'überfällig';
        te.ueberfaelligMin = ueberfaellig;
      }
    } else if (te.status !== 'eingelagert'
               && te.verzoegerungMin != null
               && te.verzoegerungMin >= VERZOEGERUNG_SCHWELLE_MIN) {
      te.planabweichung = true;
      te.abweichungGrund = 'verzögert';
    }

    // ── Andock-Regel ────────────────────────────────────────────────────
    // Andocken darf höchstens ANDOCK_TOLERANZ_MIN nach dem geplanten Start liegen.
    te.andockVerspaetet = false;
    te.andockVerzugMin  = null;
    if (te.geplantStart && te.tsAngedockt) {
      const verzug = diffMin(te.geplantStart, te.tsAngedockt);
      if (verzug > ANDOCK_TOLERANZ_MIN) {
        te.andockVerspaetet = true;
        te.andockVerzugMin  = verzug;
      }
    }

    // ── Aggregate über die Positionen ───────────────────────────────────
    te.anzahlPositionen = te.produkte.length;
    te.anlieferpaletten = te.produkte.reduce((s, p) => s + (p.anlieferpaletten || 0), 0);

    // ── Warnungen (einmalig hier, nicht im Renderpfad) ──────────────────
    te.warnungen = baueWarnungen(te);
  }

  // Baut die Warnleiste einer TE. Positionsfelder lösen aus, sobald
  // MINDESTENS EINE Position betroffen ist; der Tooltip nennt die Details.
  function baueWarnungen(te) {
    const w = [];
    const pos = te.produkte;
    const n   = pos.length;

    // 1) Priorität — TE-Ebene. Jeder Wert ist warnwürdig, egal welche Stufe.
    if (te.prioritaet && te.prioritaet.key) {
      w.push({
        typ: 'prio', icon: '🔺', farbe: 'warn',
        label: 'Priorität',
        tooltip: 'Priorität: ' + (keyTextStr(te.prioritaet) ?? te.prioritaet.key),
      });
    }

    // 2) Kritischer Artikel — Positionsebene. Tooltip listet die Meldungen.
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

    // 3) Qualitätsprüfgruppe — Positionsebene. Wert vorhanden ⇒ prüfpflichtig.
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

    // 5) Nullbestand — Positionsebene. Bestand 0 ODER leer zählt.
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
        typ: 'hinweis', icon: '📌', farbe: 'info',
        label: 'Hinweis',
        tooltip: te.teHinweis,
      });
    }

    return w;
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
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
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
        display:       flex;
        flex-direction: column;
        transition:    transform 0.18s var(--ease),
                       box-shadow 0.18s var(--ease),
                       border-color 0.18s;
      }
      /* Warnleiste immer präsent (ggf. leer) mit fester Höhe, damit alle
         Kacheln denselben vertikalen Aufbau haben und der Balken nicht springt. */
      .tc-warnbar {
        min-height:  22px;
        display:     flex;
        align-items: center;
        gap:         7px;
        margin-bottom: 9px;
      }
      .tc-warn-icons { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      /* Status-Tag (aktueller Status) — nutzt die badge-*-Farben */
      .tc-status-tag {
        flex-shrink:    0;
        padding:        3px 9px;
        border-radius:  var(--r-sm);
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        white-space:    nowrap;
      }
      /* Ankunfts-Pünktlichkeit (Geplanter Start → Ankunft) */
      /* Akzentstreifen darf nicht rauslaufen, Popup aber schon */
      .te-card::before { border-radius: var(--r-lg) 0 0 var(--r-lg); }

      .te-card:hover {
        transform:    translateY(-2px);
        box-shadow:   var(--shadow-md);
        border-color: var(--c-border2);
        z-index:      50;
      }

      /* Status-Akzentstreifen links */
      .te-card::before {
        content:        '';
        position:       absolute;
        top: 0; left: 0; bottom: 0;
        width:          3px;
        border-radius:  var(--r-lg) 0 0 var(--r-lg);
      }

      .te-card.s-erwartet::before        { background: var(--c-text3); }
      .te-card.s-ankunft::before         { background: var(--c-yellow); }
      .te-card.s-angedockt::before       { background: var(--c-yellow); }
      .te-card.s-entladen::before        { background: var(--c-blue); }
      .te-card.s-entladen_fertig::before { background: var(--c-blue); }
      .te-card.s-fertigstellung::before  { background: #16a085; }
      .te-card.s-eingelagert::before     { background: var(--c-green); }

      .tc-te-nr {
        font-family:    var(--font-mono);
        font-size:      12px;
        font-weight:    600;
        color:          var(--c-text);
        letter-spacing: 0.03em;
        margin-bottom:  2px;
      }

      .tc-supplier {
        font-size:      13px;
        font-weight:    600;
        color:          var(--c-text);
        white-space:    nowrap;
        overflow:       hidden;
        text-overflow:  ellipsis;
        flex:           1;
        min-width:      0;
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

      /* ── Fortschrittsbalken ── */
      .tc-progress {
        display:       flex;
        align-items:   center;
        gap:           3px;
        padding:       0 4px 0 6px;
        margin-bottom: 11px;
      }

      .tc-step {
        flex:          1;
        height:        6px;
        background:    var(--c-bg4);
        border-radius: 3px;
        transition:    background 0.25s;
      }

      .tc-step.done    { background: var(--c-green); }
      .tc-step.active  { background: var(--c-blue);
                         box-shadow: 0 0 6px var(--c-blue);
                         animation: step-pulse 1.6s ease-in-out infinite; }
      .tc-step.late    { background: var(--c-red); }
      .tc-step.active.late { background: var(--c-red);
                             animation: step-pulse 1.6s ease-in-out infinite; }

      /* Überfällig: geplante Zeit erreicht, aber keine Ankunft → rot blinkend */
      .tc-step.overdue {
        background: var(--c-red);
        animation:  step-blink 1s ease-in-out infinite;
      }
      @keyframes step-blink {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(231,76,60,0.5); }
        50%      { opacity: 0.35; box-shadow: 0 0 6px 1px rgba(231,76,60,0.7); }
      }

      /* Optionaler Abfahrt-Schritt (abgesetzt durch Trennstrich, mit LKW-Symbol) */
      .tc-step-sep {
        width:       1px;
        flex-shrink: 0;
        height:      10px;
        align-self:  center;
        background:  var(--c-border2);
        margin:      0 5px;
      }
      .tc-step-abfahrt {
        width:         20px;
        flex-shrink:   0;
        height:        6px;
        border-radius: 3px;
        border:        1px dashed var(--c-text3);
        background:    transparent;
        position:      relative;
      }
      .tc-step-abfahrt::after {
        content:    '🚛';
        position:   absolute;
        top:        -14px;
        left:       50%;
        transform:  translateX(-50%);
        font-size:  10px;
        opacity:    0.4;
        filter:     grayscale(1);
      }
      .tc-step-abfahrt.done::after { opacity: 1; filter: none; }
      .tc-step-abfahrt.done {
        background:   var(--c-green);
        border-style: solid;
        border-color: var(--c-green);
      }
      .tc-step-abfahrt.done::after {
        opacity: 0.9;
        filter:  none;
      }

      @keyframes step-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.45; }
      }

      /* ── Karten-Footer ── */
      /* Footer: zwei feste Zeilen. Fakten oben, Zeit/Status unten —
         immer gleich hoch, damit der Balken über allen Kacheln fluchtet. */
      .tc-footer {
        margin-top:   auto;   /* Footer nach unten drücken → gleiche Kachelhöhe */
        padding-left: 6px;
        display:      flex;
        flex-direction: column;
        gap:          7px;
      }
      .tc-footer-facts {
        display:     flex;
        align-items: center;
        gap:         7px;
        flex-wrap:   wrap;
        row-gap:     6px;
      }
      .tc-footer-meta {
        display:         flex;
        align-items:     center;
        justify-content: space-between;
        gap:             8px;
        min-height:      20px;
      }
      .tc-time {
        font-size:   11px;
        color:       var(--c-text2);
        font-family: var(--font-mono);
        flex-shrink: 0;
      }
      /* Leerer Platzhalter hält die Zeilenhöhe, ist aber unsichtbar */
      .tc-hint-badge.placeholder { visibility: hidden; }
      .tc-hint-badge {
        font-family:   var(--font-mono);
        font-size:     10px;
        font-weight:   700;
        padding:       2px 8px;
        border-radius: var(--r-sm);
        flex-shrink:   0;
        white-space:   nowrap;
      }
      .tc-hint-badge.ok   { color: var(--c-green); background: var(--c-green-dim); }
      .tc-hint-badge.warn { color: var(--c-yellow); background: var(--c-yellow-dim); }

      /* ── Warnleiste auf der Kachel ── */
      .tc-warnbar {
        display:       flex;
        gap:           5px;
        align-items:   center;
        margin-bottom: 9px;
        padding-left:  6px;
      }
      .tc-warn {
        font-size:     12px;
        line-height:   1;
        padding:       3px 5px;
        border-radius: var(--r-sm);
        cursor:        help;
        border:        1px solid transparent;
      }
      .tc-warn.w-warn { background: var(--c-yellow-dim); border-color: rgba(245,176,65,.35); }
      .tc-warn.w-krit { background: var(--c-red-dim);    border-color: rgba(231,76,60,.4);  }
      .tc-warn.w-qp   { background: var(--c-blue-dim);   border-color: rgba(61,154,214,.35);}
      .tc-warn.w-info { background: var(--c-bg4);        border-color: var(--c-border2);    }
      .tc-warn.w-more {
        font-family: var(--font-mono);
        font-size:   9px;
        font-weight: 700;
        color:       var(--c-text2);
        background:  var(--c-bg4);
        border-color: var(--c-border2);
        padding:     3px 6px;
      }
      /* gleiche Farben im Popup */
      .w-warn { color: var(--c-yellow); }
      .w-krit { color: var(--c-red-light); }
      .w-qp   { color: var(--c-blue); }
      .w-info { color: var(--c-text2); }

      /* ── Kachel-Kopf ── */
      .tc-head {
        display:     flex;
        align-items: center;
        gap:         8px;
        margin-bottom: 3px;
      }
      .tc-head .tc-te-nr { flex-shrink: 0; }
      .tc-head .tc-tm    { flex-shrink: 0; }
      .tc-head .tc-badge { flex-shrink: 0; }
      .tc-spacer { flex: 1; min-width: 4px; }
      .tc-te-nr {
        font-family:    var(--font-mono);
        font-size:      15px;
        font-weight:    700;
        letter-spacing: 0.02em;
        color:          var(--c-text);
        text-decoration: none;
        display:        inline-flex;
        align-items:    center;
        gap:            3px;
        border-radius:  3px;
        padding:        0 2px;
      }
      .tc-te-nr:hover { color: var(--c-red-light); background: var(--c-red-dim); }
      .tc-ext-ico { font-size: 9px; opacity: 0.5; }
      .tc-te-nr:hover .tc-ext-ico { opacity: 1; }
      .tc-tm {
        font-family:   var(--font-mono);
        font-size:     9px;
        font-weight:   700;
        color:         var(--c-text2);
        background:    var(--c-bg4);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-sm);
        padding:       1px 5px;
      }
      .tc-ff {
        font-size:     11px;
        color:         var(--c-text2);
        white-space:   nowrap;
        overflow:      hidden;
        text-overflow: ellipsis;
        max-width:     150px;
      }
      .tc-sub {
        display:       flex;
        align-items:   center;
        gap:           7px;
        margin-bottom: 11px;
        padding-left:  2px;
      }
      .tc-te-ext {
        font-family:  var(--font-mono);
        font-size:    11px;
        color:        var(--c-text2);
        background:   var(--c-bg3);
        border-radius: 3px;
        padding:      2px 7px;
        flex-shrink:  0;
      }
      .tc-te-ext::after { content: ' ·'; color: var(--c-text3); }
      .tc-supplier {
        font-size:     11px;
        color:         var(--c-text2);
        white-space:   nowrap;
        overflow:      hidden;
        text-overflow: ellipsis;
      }
      .tc-fact {
        font-family: var(--font-mono);
        font-size:   9px;
        color:       var(--c-text2);
        background:  var(--c-bg3);
        border:      1px solid var(--c-border);
        border-radius: var(--r-sm);
        padding:     1px 6px;
        flex-shrink: 0;
      }
      .tc-fact.leer, .tor-badge-card.leer {
        color:       var(--c-text3);
        opacity:     0.5;
      }

      /* ── Geteiltes Hover-Popup (EIN Element für alle Kacheln) ── */
      .tc-popup {
        position:      absolute;
        width:         300px;
        max-width:     92vw;
        max-height:    calc(100% - 12px);
        overflow-y:    auto;
        background:    var(--c-bg3);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-md);
        box-shadow:    var(--shadow-lg);
        padding:       13px 15px;
        opacity:       0;
        visibility:    hidden;
        pointer-events: none;
        transform:     translateY(-4px);
        transition:    opacity 0.14s var(--ease), transform 0.14s var(--ease);
        z-index:       200;
      }
      .tc-popup.visible { opacity: 1; visibility: visible; transform: translateY(0); }
      .tc-pop-head {
        display:         flex;
        align-items:     center;
        justify-content: space-between;
        gap:             8px;
        margin-bottom:   9px;
        padding-bottom:  8px;
        border-bottom:   1px solid var(--c-border);
      }
      .tc-pop-te { font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--c-text); }
      .tc-pop-row {
        display:         flex;
        justify-content: space-between;
        gap:             12px;
        font-size:       11px;
        line-height:     1.85;
      }
      .tc-pop-label { color: var(--c-text2); }
      .tc-pop-val   { color: var(--c-text); font-family: var(--font-mono); text-align: right; }
      .tc-pop-sep   { height: 1px; background: var(--c-border); margin: 8px 0; }
      .tc-pop-warn  { display: flex; flex-direction: column; gap: 4px; }
      .tc-pop-warn-row { font-size: 11px; color: var(--c-text2); line-height: 1.45; }

      /* ── Suchfeld ── */
      .te-search {
        display:       inline-flex;
        align-items:   center;
        gap:           6px;
        padding:       3px 8px;
        background:    var(--c-bg3);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-sm);
        min-width:     210px;
      }
      .te-search:focus-within { border-color: var(--c-red-border); }
      .te-search-ico { font-size: 10px; opacity: 0.6; }
      .te-search-input {
        flex:        1;
        border:      none;
        background:  transparent;
        outline:     none;
        color:       var(--c-text);
        font-family: var(--font);
        font-size:   11px;
        min-width:   0;
      }
      .te-search-input::placeholder { color: var(--c-text3); }
      .te-search-input::-webkit-search-cancel-button { display: none; }
      .te-search-clear {
        border:      none;
        background:  transparent;
        color:       var(--c-text2);
        cursor:      pointer;
        font-size:   15px;
        line-height: 1;
        padding:     0 2px;
      }
      .te-search-clear:hover { color: var(--c-text); }
      .te-search-clear.hidden { display: none; }

      .search-notice {
        display:       flex;
        align-items:   center;
        gap:           10px;
        margin:        0 0 12px;
        padding:       7px 12px;
        font-size:     11px;
        color:         var(--c-text2);
        background:    var(--c-blue-dim);
        border:        1px solid rgba(61,154,214,.3);
        border-radius: var(--r-sm);
      }
      .search-notice.hidden { display: none; }
      .search-notice-btn {
        margin-left:   auto;
        border:        1px solid var(--c-border2);
        background:    transparent;
        color:         var(--c-text);
        font-family:   var(--font-mono);
        font-size:     10px;
        padding:       3px 9px;
        border-radius: var(--r-sm);
        cursor:        pointer;
      }
      .search-notice-btn:hover { background: var(--c-bg4); }

      /* ── Datumsspalten-Modus ── */
      .te-grid.board-modus {
        display: block;
        overflow-x: auto;
        padding-bottom: 8px;
      }
      .datum-board {
        display: flex;
        gap:     14px;
        align-items: flex-start;
        min-width: min-content;
      }
      .datum-spalte {
        flex:      0 0 300px;
        display:   flex;
        flex-direction: column;
        background: var(--c-bg2);
        border:     1px solid var(--c-border);
        border-radius: var(--r-md);
        overflow:  hidden;
      }
      .datum-spalte.heute { border-color: var(--c-red-border); }
      .datum-spalte-head {
        padding:       10px 12px;
        background:    var(--c-bg3);
        border-bottom: 1px solid var(--c-border);
      }
      .datum-spalte.heute .datum-spalte-head { background: var(--c-red-dim); }
      .datum-spalte-tag {
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color:          var(--c-text2);
        display:        flex;
        align-items:    center;
        gap:            6px;
      }
      .datum-heute-tag {
        font-size:     8px;
        color:         var(--c-red-light);
        background:    var(--c-bg);
        border:        1px solid var(--c-red-border);
        border-radius: 8px;
        padding:       1px 6px;
        letter-spacing: 0.04em;
      }
      .datum-spalte-datum {
        font-family: var(--font-mono);
        font-size:   17px;
        font-weight: 700;
        color:       var(--c-text);
        margin:      2px 0 4px;
      }
      .datum-spalte-meta {
        display:     flex;
        gap:         8px;
        font-family: var(--font-mono);
        font-size:   9px;
        color:       var(--c-text3);
      }
      .datum-spalte-warn { color: var(--c-yellow); }
      .datum-spalte-body {
        display:        flex;
        flex-direction: column;
        gap:            10px;
        padding:        10px;
        max-height:     62vh;
        overflow-y:     auto;
      }
      .datum-spalte-body .te-card { margin: 0; }

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

      /* Gruppierungs-Umschalter (3-Wege) */
      .group-mode-switch {
        display:       inline-flex;
        gap:           2px;
        padding:       2px;
        background:    var(--c-bg3);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-sm);
      }
      .group-mode-btn {
        padding:        4px 10px;
        border:         none;
        background:     transparent;
        border-radius:  calc(var(--r-sm) - 1px);
        font-family:    var(--font-mono);
        font-size:      10px;
        font-weight:    600;
        letter-spacing: 0.04em;
        color:          var(--c-text2);
        cursor:         pointer;
        transition:     background 0.15s, color 0.15s;
      }
      .group-mode-btn:hover { color: var(--c-text); }
      .group-mode-btn.active {
        background: var(--c-red);
        color:      #fff;
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

      /* Hinweis-Flag */
      /* Planabweichungs-Markierung */
      .te-card.abweichung {
        border-color: rgba(230,126,34,0.5);
        box-shadow:   inset 3px 0 0 var(--c-yellow), 0 0 0 1px rgba(230,126,34,0.2);
      }
      .te-card.abweichung::before {
        background: var(--c-yellow) !important;
      }

      /* Überfällig: geplanter Start überschritten, TE noch nicht eingetroffen.
         Der Kachelrahmen pulsiert dezent rot, um Aufmerksamkeit zu ziehen. */
      .te-card.ueberfaellig {
        border-color: rgba(231,76,60,0.55);
        animation: card-overdue-blink 1.6s ease-in-out infinite;
      }
      .te-card.ueberfaellig::before {
        background: var(--c-red) !important;
      }
      @keyframes card-overdue-blink {
        0%, 100% { box-shadow: inset 3px 0 0 var(--c-red), 0 0 0 1px rgba(231,76,60,0.15); }
        50%      { box-shadow: inset 3px 0 0 var(--c-red), 0 0 0 2px rgba(231,76,60,0.55); }
      }
      @media (prefers-reduced-motion: reduce) {
        .te-card.ueberfaellig { animation: none;
          box-shadow: inset 3px 0 0 var(--c-red), 0 0 0 2px rgba(231,76,60,0.4); }
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

      /* ════════════════════════════════════════════════════════════
         VIEW 3 – GANTT
      ════════════════════════════════════════════════════════════ */

      .gantt-wrap {
        background:    var(--c-bg2);
        border:        1px solid var(--c-border2);
        border-radius: var(--r-lg);
        /* KEIN overflow:hidden — das würde die sticky-Kopfzeile brechen.
           Der abgerundete obere Rand wird über die Kopfzeile selbst geklippt. */
      }

      .gantt-inner { min-width: 700px; }

      /* ── Kopfzeile ── */
      .gantt-head {
        display:          flex;
        border-bottom:    1px solid var(--c-border2);
        background:       var(--c-bg3);
        position:         sticky;
        top:              0;
        z-index:          10;
        border-radius:    var(--r-lg) var(--r-lg) 0 0;
        box-shadow:       0 2px 6px rgba(0,0,0,0.25);
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
      .gantt-abw-icon { color: var(--c-yellow); }
      .gantt-row-abweichung {
        background: rgba(230,126,34,0.06);
        box-shadow: inset 3px 0 0 var(--c-yellow);
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

      /* Phasen-Segmente im Gantt-Ist-Balken */
      .gantt-bar-ist.phase-anfahrt        { background: #5dade2; border-radius: 2px 0 0 2px; }
      .gantt-bar-ist.phase-warten         { background: #48c9b0; }
      .gantt-bar-ist.phase-warten-lang    { background: var(--c-red); }
      .gantt-bar-ist.phase-entladen       { background: var(--c-blue); }
      .gantt-bar-ist.phase-nachbearbeitung{ background: var(--c-green); border-radius: 0 2px 2px 0; }
      .gantt-bar-ist.phase-laufend {
        background: repeating-linear-gradient(45deg,
          var(--c-blue) 0, var(--c-blue) 6px,
          rgba(41,128,185,0.5) 6px, rgba(41,128,185,0.5) 12px);
      }

      /* Abfahrt-Marker (optionaler Punkt am Balkenende) */
      .gantt-abfahrt-marker {
        position:      absolute;
        top:           28px;
        width:         0; height: 0;
        border-left:   4px solid transparent;
        border-right:  4px solid transparent;
        border-top:    7px solid var(--c-text3);
        transform:     translateX(-4px);
        cursor:        pointer;
        transition:    border-top-color 0.15s;
      }
      .gantt-abfahrt-marker:hover { border-top-color: var(--c-text); }

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
    
      /* ══ Palettenplanung (Etappe 4) ══ */
      /* ── Übersichtsmatrix: Paletten pro Tag & Halle ── */
      .ppu-title, .ppd-title {
        font-size: 13px; font-weight: 700; color: var(--c-text);
        margin: 0 0 10px;
      }
      .ppd-title { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--c-border); }
      .ppu-scroll { margin-bottom: 4px; }
      .ppu-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
      .ppu-table th, .ppu-table td { padding: 8px 12px; white-space: nowrap; text-align: center; }
      .ppu-corner {
        position: sticky; left: 0; z-index: 3;
        background: var(--c-bg3); color: var(--c-text2);
        font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
        text-align: left; min-width: 110px;
        border-bottom: 1px solid var(--c-border2);
      }
      .ppu-tag {
        background: var(--c-bg3); color: var(--c-text2);
        border-bottom: 1px solid var(--c-border2); border-left: 1px solid var(--c-border);
      }
      .ppu-tag.heute { background: var(--c-red-dim); }
      .ppu-tag.ppu-sumhead { color: var(--c-text); border-left: 2px solid var(--c-border2); }
      .ppu-tag-wd { font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
      .ppu-tag-dm { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--c-text); margin-top: 1px; }
      .ppu-halle {
        position: sticky; left: 0; z-index: 1;
        background: var(--c-bg2); color: var(--c-text); font-weight: 600;
        text-align: left; border-right: 1px solid var(--c-border2);
        border-bottom: 1px solid var(--c-border);
      }
      .ppu-cell {
        font-family: var(--font-mono); font-size: 13px; color: var(--c-text);
        border-left: 1px solid var(--c-border); border-bottom: 1px solid var(--c-border);
      }
      .ppu-cell.leer { color: var(--c-text3); }
      .ppu-rowsum { font-weight: 700; background: var(--c-bg3); border-left: 2px solid var(--c-border2); }
      .ppu-foot td { border-top: 2px solid var(--c-border2); background: var(--c-bg3); }
      .ppu-foot .ppu-halle { background: var(--c-bg3); font-weight: 700; }
      .ppu-colsum { font-weight: 700; color: var(--c-text); }
      .ppu-grand { font-weight: 700; color: var(--c-red-light); background: var(--c-bg4); border-left: 2px solid var(--c-border2); }

      .pp-ctrl {
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px; flex-wrap: wrap; margin-bottom: 16px;
      }
      .pp-title-wrap { display: flex; align-items: baseline; }
      .pp-title { font-size: 16px; font-weight: 700; color: var(--c-text); }
      .pp-body { min-height: 200px; }
      .pp-sub   { font-size: 11px; color: var(--c-text2); margin-left: 8px; }
      .pp-zeitraum { display: flex; gap: 4px; flex-wrap: wrap; }
      .pp-chip {
        padding: 4px 12px; border-radius: 20px;
        font-family: var(--font-mono); font-size: 10px; font-weight: 500;
        border: 1px solid var(--c-border2); color: var(--c-text2);
        background: transparent; cursor: pointer; transition: all 0.15s; white-space: nowrap;
      }
      .pp-chip:hover  { border-color: var(--c-red-border); color: var(--c-text); }
      .pp-chip.active { background: var(--c-red); border-color: var(--c-red); color: #fff; }

      .pp-kpis { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
      .pp-kpi {
        display: flex; flex-direction: column; gap: 3px;
        background: var(--c-bg2); border: 1px solid var(--c-border);
        border-radius: var(--r-md); padding: 12px 18px; min-width: 96px;
        position: relative; overflow: hidden;
      }
      /* Primär-KPI mit rotem Akzentbalken links */
      .pp-kpi.primary { border-color: var(--c-red-border); }
      .pp-kpi.primary::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0;
        width: 3px; background: var(--c-red);
      }
      .pp-kpi.primary .pp-kpi-val { color: var(--c-red-light); }
      .pp-kpi-val { font-family: var(--font-mono); font-size: 24px; font-weight: 700; color: var(--c-text); line-height: 1; }
      .pp-kpi-lbl { font-size: 10px; color: var(--c-text2); }

      .pp-empty {
        padding: 40px; text-align: center; color: var(--c-text2);
        background: var(--c-bg2); border: 1px dashed var(--c-border2); border-radius: var(--r-md);
      }

      .pp-scroll { overflow-x: auto; border: 1px solid var(--c-border); border-radius: var(--r-md); }
      .pp-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
      .pp-table th, .pp-table td { padding: 8px 12px; white-space: nowrap; }

      .pp-corner {
        position: sticky; left: 0; z-index: 3;
        background: var(--c-bg3); color: var(--c-text2);
        font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
        text-align: left; min-width: 180px;
        border-bottom: 1px solid var(--c-border2);
      }
      .pp-tag {
        background: var(--c-bg3); text-align: center; color: var(--c-text2);
        border-bottom: 1px solid var(--c-border2); border-left: 1px solid var(--c-border);
      }
      .pp-tag.heute { background: var(--c-red-dim); }
      .pp-tag-wd { font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
      .pp-tag-dm { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--c-text); margin-top: 1px; }

      .pp-halle-row td {
        background: var(--c-bg3); border-top: 2px solid var(--c-border2);
        border-bottom: 1px solid var(--c-border);
      }
      .pp-halle-name {
        position: sticky; left: 0; z-index: 1;
        font-weight: 700; color: var(--c-text); background: var(--c-bg3);
      }
      .pp-halle-total { font-family: var(--font-mono); font-size: 10px; color: var(--c-text2); text-align: right; }

      .pp-pack-row td { border-bottom: 1px solid var(--c-border); }
      .pp-pack-name {
        position: sticky; left: 0; z-index: 1;
        background: var(--c-bg2); color: var(--c-text2); padding-left: 20px;
        border-right: 1px solid var(--c-border2);
      }
      .pp-pack-row.undef .pp-pack-name { color: var(--c-yellow); }
      .pp-cell { text-align: center; font-family: var(--font-mono); border-left: 1px solid var(--c-border); color: var(--c-text); }
      .pp-cell.leer { color: var(--c-text3); }
      .pp-cell.pp-sum { font-weight: 700; background: var(--c-bg3); }

      .pp-halle-sum td { background: var(--c-bg3); border-bottom: 2px solid var(--c-border2); }
      .pp-halle-sum .pp-pack-name { font-weight: 600; color: var(--c-text); background: var(--c-bg3); padding-left: 12px; }

      .pp-foot td { background: var(--c-bg4); border-top: 2px solid var(--c-border2); }
      .pp-foot .pp-pack-name { position: sticky; left: 0; font-weight: 700; color: var(--c-text); background: var(--c-bg4); padding-left: 12px; }
      .pp-cell.pp-grand { font-weight: 700; color: var(--c-red-light); }

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
          <button class="nav-tab" data-view="paletten">
            <span class="nav-tab-icon">▦</span><span class="nav-tab-label">Palettenplanung</span>
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

        <!-- Loading State — animierter WE-Prozess -->
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
              <button class="zeitraum-chip" data-zeitraum="gestern">Gestern</button>
              <button class="zeitraum-chip active" data-zeitraum="heute">Heute</button>
              <button class="zeitraum-chip" data-zeitraum="woche">Diese Woche</button>
              <button class="zeitraum-chip" data-zeitraum="geplant">Geplant</button>
              <button class="zeitraum-chip" data-zeitraum="7tage">±7 Tage</button>
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
            <div class="group-mode-switch" role="group" aria-label="Gruppierung">
              <button class="group-mode-btn active" data-gruppe="status" title="Nach Status gruppieren">Status</button>
              <button class="group-mode-btn" data-gruppe="ladestelle" title="Nach Ladestelle gruppieren">Ladestelle</button>
              <button class="group-mode-btn" data-gruppe="datum" title="Als Spalten je Tag (geplanter Start)">Datum</button>
              <button class="group-mode-btn" data-gruppe="keine" title="Nicht gruppieren">Keine</button>
            </div>
            <div class="te-search">
              <span class="te-search-ico">🔍</span>
              <input type="search" id="te-search-input" class="te-search-input"
                     placeholder="TE-Nr. oder Lieferant suchen…" autocomplete="off"
                     aria-label="Transporteinheiten suchen">
              <button class="te-search-clear hidden" id="te-search-clear" title="Suche zurücksetzen">×</button>
            </div>
          </div>
          <div class="search-notice hidden" id="search-notice">
            <span>🔍 Suche aktiv — Zeitraum- und Statusfilter sind ausgesetzt</span>
            <button class="search-notice-btn" id="search-notice-reset">Zurücksetzen</button>
          </div>
          <div class="te-grid" id="te-grid">
          </div>
        </div>

        <!-- Geteiltes Hover-Popup: EIN Element für alle Kacheln -->
        <div class="tc-popup" id="te-popup" aria-hidden="true"></div>

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

        <!-- ── VIEW: PALETTENPLANUNG ── -->
        <div class="view" id="view-paletten">
          <div class="pp-ctrl">
            <div class="pp-title-wrap">
              <span class="pp-title">Palettenbedarf</span>
              <span class="pp-sub" id="pp-sub">nach Halle und Packmittel</span>
            </div>
            <div class="pp-zeitraum" id="pp-zeitraum-chips">
              <button class="pp-chip" data-pp="gestern">Gestern</button>
              <button class="pp-chip active" data-pp="heute">Heute</button>
              <button class="pp-chip" data-pp="morgen">Morgen</button>
              <button class="pp-chip" data-pp="woche">Diese Woche</button>
              <button class="pp-chip" data-pp="geplant">Geplant (14 T.)</button>
            </div>
          </div>
          <div class="pp-body" id="pp-content"></div>
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
      this._ganttDatum    = jetztWanduhr(); // Anker-Datum Gantt (UTC-Wanduhr)
      this._ganttFenster  = 'tag';      // 'tag'|'3tage'|'woche'
      // Live-Refresh
      this._countdownDauer = 30;        // Sekunden bis Aktualisierung möglich
      this._countdownVal   = 30;        // aktueller Countdown-Wert
      this._countdownTimer = null;      // setInterval-Handle
      this._clockTimer     = null;      // Uhr-Timer-Handle
      this._loaderTimer    = null;      // Ladeanimation-Timer
      this._autoRefresh    = false;     // Auto-Aktualisierung aktiv?
      this._lsFilter       = 'alle';    // Ladestellen-Filter: 'alle'|'BSL'|'Container'|'Landverkehr'
      this._gruppierModus  = 'status';  // 'status'|'ladestelle'|'datum'|'keine'
      this._suchbegriff    = '';        // aktive Suche (setzt Filter aus)
      this._suchTimer      = null;      // Debounce-Handle
      this._ppZeitraum     = 'heute';   // Palettenplanung: eigener Zeitraum
    }

    connectedCallback() {
      this._bindEvents();
      this._showLoading();   // Ladeanimation initial sichtbar bis Daten da sind
      this._startCountdown();
      this._startClock();
    }

    disconnectedCallback() {
      // Alle Event-Listener in einem Zug entfernen
      this._ac.abort();
      this._stopCountdown();
      this._stopClock();
      this._stopLoaderSteps();
      clearTimeout(this._suchTimer);
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

      // Gruppierungs-Umschalter (Status / Ladestelle / Datum / Keine)
      this._shadow.querySelectorAll('.group-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._gruppierModus = btn.dataset.gruppe;
          this._shadow.querySelectorAll('.group-mode-btn').forEach(b =>
            b.classList.toggle('active', b === btn));
          this._renderKacheln();
        }, opts);
      });

      // Popup hängt im .body und scrollt nicht mit → beim Scrollen ausblenden.
      // Einmalig hier registriert, nicht bei jedem Render.
      // capture:true — Scroll-Events blubbern nicht. Im Datumsspalten-Modus
      // scrollen die einzelnen Spalten-Bodies, die wir so trotzdem erwischen.
      this._$('view-kacheln')?.addEventListener('scroll', () => this._versteckePopup(),
        { passive: true, capture: true, signal: this._ac.signal });

      // ── Suche (Debounce 150ms) ─────────────────────────────────────────
      const sucheInput = this._$('te-search-input');
      const sucheClear = this._$('te-search-clear');
      const notice     = this._$('search-notice');

      const sucheAnwenden = (wert) => {
        this._suchbegriff = wert;
        sucheClear?.classList.toggle('hidden', !wert);
        notice?.classList.toggle('hidden', !wert);
        this._updateKPIs();
        this._renderKacheln();
      };

      sucheInput?.addEventListener('input', () => {
        clearTimeout(this._suchTimer);
        const wert = sucheInput.value;
        this._suchTimer = setTimeout(() => sucheAnwenden(wert), 150);
      }, opts);

      sucheInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { sucheInput.value = ''; sucheAnwenden(''); }
      }, opts);

      const sucheZuruecksetzen = () => {
        if (sucheInput) sucheInput.value = '';
        clearTimeout(this._suchTimer);
        sucheAnwenden('');
      };
      sucheClear?.addEventListener('click', sucheZuruecksetzen, opts);
      this._$('search-notice-reset')?.addEventListener('click', sucheZuruecksetzen, opts);

      // ── Palettenplanung: Zeitraum-Chips ────────────────────────────────
      this._shadow.querySelectorAll('.pp-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          this._ppZeitraum = btn.dataset.pp;
          this._shadow.querySelectorAll('.pp-chip').forEach(b =>
            b.classList.toggle('active', b === btn));
          this._renderPaletten();
        }, opts);
      });

      // Gantt-Navigation
      this._$('gantt-prev')?.addEventListener('click', () => this._ganttNavigiere(-1), opts);
      this._$('gantt-next')?.addEventListener('click', () => this._ganttNavigiere(+1), opts);
      this._$('gantt-heute')?.addEventListener('click', () => {
        this._ganttDatum = jetztWanduhr();
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
      // Views bei Bedarf rendern
      if (name === 'tore') this._renderTore();
      if (name === 'paletten') this._renderPaletten();
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
      el.textContent = jetztWanduhr().toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC'
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
      this._startLoaderSteps();
    }

    _hideLoading() {
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

    _showEmpty() {
      this._$('state-empty')?.classList.remove('hidden');
      this._$('state-loading')?.classList.add('hidden');
    }

    // ── KPI-Leiste aktualisieren ─────────────────────────────────────────

    _zeitraumBereich() {
      const jetzt = jetztWanduhr();
      const heute = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
      switch (this._activeZeitraum) {
        case 'gestern':
          return { von: new Date(heute.getTime() - 86400000), bis: heute };
        case 'heute':
          return { von: heute, bis: new Date(heute.getTime() + 86400000) };
        case 'woche': {
          const tag = heute.getUTCDay();
          const diff = (tag === 0 ? -6 : 1 - tag);
          const mo = new Date(heute.getTime() + diff * 86400000);
          return { von: mo, bis: new Date(mo.getTime() + 7 * 86400000) };
        }
        case 'geplant':
          // Vorschau: kommende 14 Tage. Die eigentliche Schärfung ("geplanter
          // Start noch nicht erreicht") passiert in _tesFuerZeitraum().
          return { von: heute, bis: new Date(heute.getTime() + 14 * 86400000) };
        case '7tage':
          // Symmetrisch: 7 Tage zurück bis 7 Tage voraus
          return { von: new Date(heute.getTime() - 7 * 86400000), bis: new Date(heute.getTime() + 8 * 86400000) };
        case 'monat': {
          const von = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), 1));
          return { von, bis: new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth() + 1, 1)) };
        }
        default:
          return { von: new Date(0), bis: new Date(9999, 0) };
      }
    }

    _tesFuerZeitraum() {
      const alle = [...this._teMap.values()];

      // Aktive Suche setzt Zeitraum- und Statusfilter aus: sonst findet man
      // eine TE nicht, die außerhalb des gewählten Fensters liegt.
      const q = (this._suchbegriff ?? '').trim().toLowerCase();
      if (q) {
        return alle.filter(te =>
          String(te.te).toLowerCase().includes(q) ||
          String(te.teExt ?? '').toLowerCase().includes(q) ||
          String(te.lieferantName ?? '').toLowerCase().includes(q)
        );
      }

      const { von, bis } = this._zeitraumBereich();
      const jetzt = jetztWanduhr();

      // Eine TE gilt als "noch live", wenn sie weder eingelagert noch vom
      // Kontrollpunkt abgefahren ist — sie wird also noch aktiv abgewickelt.
      const nochLive = (te) => te.status !== 'eingelagert' && !te.abgefahren;

      return alle.filter(te => {
        const anker = te.geplantStart ?? te.tsAnkunft;

        // "Geplant" zeigt nur TEs, deren geplanter Start noch bevorsteht.
        if (this._activeZeitraum === 'geplant') {
          return te.geplantStart != null && te.geplantStart > jetzt;
        }

        // Im Fenster? Dann normal einschließen.
        if (anker && anker >= von && anker < bis) return true;

        // Übertrag: Bei den tagesbezogenen Ansichten (heute/gestern) auch
        // TEs zeigen, die VOR dem Fenster geplant waren, aber noch live sind
        // — sonst verschwinden gestern gestartete, noch laufende Transporte.
        if ((this._activeZeitraum === 'heute' || this._activeZeitraum === 'gestern')
            && anker && anker < von && nochLive(te)) {
          return true;
        }

        return false;
      });
    }

    // Statusgruppe für die Übersicht. Überfällige TEs (geplante Zeit
    // verstrichen, nie angekommen) gehören zu "Live" — dort schaut der
    // Disponent hin. Sonst wären sie in "Geplant" unsichtbar.
    _statusGruppe(te) {
      if (te.status === 'eingelagert') return 'abgeschlossen';
      if (te.status === 'erwartet') {
        return te.abweichungGrund === 'überfällig' ? 'live' : 'geplant';
      }
      return 'live';
    }

    _updateKPIs() {
      const tes        = this._tesFuerZeitraum();
      const aktiv      = tes.filter(t => ['ankunft', 'entladen'].includes(t.status)).length;
      const verzoegert = tes.filter(t => t.planabweichung).length;
      const abgefahren = tes.filter(t => t.abgefahren).length;

      this._$('kpi-gesamt').textContent     = tes.length;
      this._$('kpi-aktiv').textContent      = aktiv;
      this._$('kpi-verzoegert').textContent = verzoegert;
      this._$('kpi-abgefahren').textContent = abgefahren;

      const labels = {
        gestern:'Gestern',
        heute:  'Heute · ' + new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}),
        woche:  'Diese Woche',
        geplant:'Geplant · kommende 14 Tage',
        '7tage':'±7 Tage',
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
          case 'verzögert':  return te.planabweichung === true;
          case 'abgefahren': return te.abgefahren === true;
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
        return ladestelleKurz(te.ladestelle) === this._lsFilter;
      };

      const tes = this._tesFuerZeitraum()
        .filter(te => statusMatch(te) && halleMatch(te) && lsMatch(te));

      if (tes.length === 0) {
        grid.innerHTML = `<div class="te-grid-empty">Keine TEs für diesen Filter</div>`;
        return;
      }

      const modus = this._gruppierModus ?? 'status';
      // Bei aktiver Suche ist Gruppierung nur Lärm — flach ausgeben.
      const effModus = this._suchbegriff ? 'keine' : modus;

      const gruppenHeader = (icon, titel, farbe, anzahl, warnAnzahl) => `
        <div class="ls-gruppe-header">
          <span class="ls-gruppe-title" style="color:${farbe}">${icon} ${esc(titel)}</span>
          <span class="ls-gruppe-count">${anzahl} TE${anzahl !== 1 ? 's' : ''}</span>
          ${warnAnzahl ? `<span class="ls-gruppe-count" style="background:var(--c-yellow-dim);color:var(--c-yellow)">${warnAnzahl} ⚠</span>` : ''}
          <div class="ls-gruppe-line"></div>
        </div>`;

      if (effModus === 'status') {
        // ── Live / Abgeschlossen / Geplant ──
        const meta = {
          live:          { titel: 'Live',          icon: '🔴', col: 'var(--c-red-light)' },
          abgeschlossen: { titel: 'Abgeschlossen', icon: '✅', col: 'var(--c-green)'     },
          geplant:       { titel: 'Geplant',       icon: '🗓️', col: 'var(--c-text2)'     },
        };
        const buckets = { live: [], abgeschlossen: [], geplant: [] };
        for (const te of tes) buckets[this._statusGruppe(te)].push(te);

        grid.innerHTML = ['live', 'abgeschlossen', 'geplant']
          .filter(k => buckets[k].length)
          .map(k => {
            const m  = meta[k];
            const gr = buckets[k];
            const vz = gr.filter(t => t.planabweichung).length;
            return gruppenHeader(m.icon, m.titel, m.col, gr.length, vz)
                 + gr.map(te => this._teKachelHTML(te)).join('');
          }).join('');

      } else if (effModus === 'ladestelle') {
        const byLS = {};
        for (const te of tes) (byLS[ladestelleKurz(te.ladestelle)] ??= []).push(te);

        grid.innerHTML = LADESTELLE_KATEGORIEN
          .filter(ls => byLS[ls]?.length)
          .map(ls => {
            const st = LADESTELLE_STYLE[ls] ?? LADESTELLE_STYLE.BSL;
            const gr = byLS[ls];
            const vz = gr.filter(t => t.planabweichung).length;
            // Header zeigt Kurz + Lang: "BSL — ILW Krefeld BSL / Eigendisposition"
            const titel = `${ls} — ${ladestelleLang(ls)}`;
            return gruppenHeader(st.icon, titel, st.col, gr.length, vz)
                 + gr.map(te => this._teKachelHTML(te)).join('');
          }).join('');

      } else if (effModus === 'datum') {
        // ── Spalten je Tag (Anker: geplanter Start) ──
        // Eigenes Layout: horizontal scrollbar, eine Spalte pro Kalendertag.
        const tagKey = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const byTag = new Map();
        const ohneDatum = [];
        for (const te of tes) {
          const anker = te.geplantStart ?? te.tsAnkunft;
          if (!anker) { ohneDatum.push(te); continue; }
          const k = tagKey(anker);
          if (!byTag.has(k)) byTag.set(k, []);
          byTag.get(k).push(te);
        }
        const heuteKey = (() => { const j = jetztWanduhr();
          return Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()); })();

        const spalten = [...byTag.keys()].sort((a, b) => a - b).map(k => {
          const d  = new Date(k);
          const gr = byTag.get(k).sort((a, b) =>
            (a.geplantStart ?? a.tsAnkunft) - (b.geplantStart ?? b.tsAnkunft));
          const vz = gr.filter(t => t.planabweichung).length;
          const istHeute = k === heuteKey;
          return `
            <div class="datum-spalte${istHeute ? ' heute' : ''}">
              <div class="datum-spalte-head">
                <div class="datum-spalte-tag">
                  ${d.toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' })}
                  ${istHeute ? '<span class="datum-heute-tag">heute</span>' : ''}
                </div>
                <div class="datum-spalte-datum">${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</div>
                <div class="datum-spalte-meta">
                  <span>${gr.length} TE${gr.length !== 1 ? 's' : ''}</span>
                  ${vz ? `<span class="datum-spalte-warn">${vz} ⚠</span>` : ''}
                </div>
              </div>
              <div class="datum-spalte-body">${gr.map(te => this._teKachelHTML(te)).join('')}</div>
            </div>`;
        }).join('');

        const rest = ohneDatum.length ? `
          <div class="datum-spalte">
            <div class="datum-spalte-head">
              <div class="datum-spalte-tag">Ohne Datum</div>
              <div class="datum-spalte-meta"><span>${ohneDatum.length} TEs</span></div>
            </div>
            <div class="datum-spalte-body">${ohneDatum.map(te => this._teKachelHTML(te)).join('')}</div>
          </div>` : '';

        grid.innerHTML = `<div class="datum-board">${spalten}${rest}</div>`;

      } else {
        grid.innerHTML = tes.map(te => this._teKachelHTML(te)).join('');
      }

      // Grid-Klasse steuert Kachel- vs. Spaltenlayout
      grid.classList.toggle('board-modus', effModus === 'datum');

      // Klick-Handler: Delegation auf Grid-Ebene — ein Listener für alle Karten
      // (vorher jeden einzelnen click-handler pro Karte setzen würde bei vielen TEs
      //  zu O(n) Listener-Attachments führen)
      grid.onclick = (e) => {
        // Klick auf die TE-Nummer öffnet EWM, nicht die Detailansicht.
        const ewm = e.target.closest('[data-ewm]');
        if (ewm) { e.stopPropagation(); return; }   // <a> übernimmt den Rest
        const card = e.target.closest('.te-card');
        if (card?.dataset.te) this._renderDetail(card.dataset.te);
      };

      // ── Geteiltes Hover-Popup ──────────────────────────────────────────
      // Ein einziges Popup-Element für alle Kacheln. Bei 300 TEs spart das
      // 300 versteckte Detailblöcke im DOM.
      grid.onmouseover = (e) => {
        const card = e.target.closest('.te-card');
        if (!card || card === this._popupCard) return;
        const te = this._teMap.get(card.dataset.te);
        if (!te) return;
        this._popupCard = card;
        this._zeigePopup(card, te);
      };
      grid.onmouseout = (e) => {
        const card = e.target.closest('.te-card');
        if (!card) return;
        if (e.relatedTarget && card.contains(e.relatedTarget)) return;
        this._popupCard = null;
        this._versteckePopup();
      };

    }

    // Ladestellen-Badge HTML
    // ── Geteiltes Popup: anzeigen / verstecken ────────────────────────
    _zeigePopup(card, te) {
      const pop  = this._$('te-popup');
      const host = pop?.parentElement;   // .body — der Positionierungskontext
      if (!pop || !host) return;

      pop.innerHTML = this._popupHTML(te);
      pop.classList.add('visible');
      pop.setAttribute('aria-hidden', 'false');

      // Beide Rects sind Viewport-Koordinaten, die Scroll-Position ist darin
      // bereits enthalten. Deshalb KEIN scrollTop/scrollLeft addieren —
      // das Popup ist ein Kind von .body und scrollt nicht mit der View mit.
      const cr = card.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const pw = pop.offsetWidth  || 300;
      const ph = pop.offsetHeight || 320;

      // Kachel-Position relativ zum Positionierungskontext (.body)
      const cLeft   = cr.left   - hr.left;
      const cRight  = cr.right  - hr.left;
      const cTop    = cr.top    - hr.top;
      const cBottom = cr.bottom - hr.top;
      const gap = 8;

      // Verfügbarer Platz in jede Richtung
      const platzUnten  = hr.height - cBottom;
      const platzOben   = cTop;
      const platzRechts = hr.width - cRight;
      const platzLinks  = cLeft;

      let left, top;

      // Strategie: erst unten/oben (bevorzugt, Popup unter/über der Kachel),
      // aber NUR wenn dort genug Platz ist. Sonst seitlich daneben, damit die
      // Kachel selbst frei bleibt und nicht verdeckt wird (kleine Bildschirme).
      if (platzUnten >= ph + gap || platzOben >= ph + gap) {
        // vertikal: unter die Kachel, sonst darüber
        top = (platzUnten >= ph + gap) ? cBottom + gap : cTop - ph - gap;
        left = cLeft + (cr.width / 2) - (pw / 2);
        left = Math.max(6, Math.min(left, hr.width - pw - 6));
      } else if (platzRechts >= pw + gap || platzLinks >= pw + gap) {
        // seitlich: rechts daneben, sonst links daneben
        left = (platzRechts >= pw + gap) ? cRight + gap : cLeft - pw - gap;
        top = cTop + (cr.height / 2) - (ph / 2);
        top = Math.max(4, Math.min(top, hr.height - ph - 4));
      } else {
        // Notfall (sehr kleiner Kontext): zentriert, halbtransparenter Rahmen
        left = Math.max(6, (hr.width - pw) / 2);
        top  = Math.max(4, (hr.height - ph) / 2);
      }

      pop.style.left = `${left}px`;
      pop.style.top  = `${top}px`;
    }

    _versteckePopup() {
      const pop = this._$('te-popup');
      if (!pop) return;
      pop.classList.remove('visible');
      pop.setAttribute('aria-hidden', 'true');
    }

    // Badge zeigt die KURZE Kategorie (BSL / Container / Landverkehr).
    // Nimmt entweder die lange BW-Bezeichnung oder eine bereits kurze entgegen.
    _lsBadgeHTML(ladestelle) {
      const kurz  = ladestelleKurz(ladestelle);
      const style = LADESTELLE_STYLE[kurz] ?? LADESTELLE_STYLE.BSL;
      return `<span class="ls-badge ${style.cls}">${style.icon} ${esc(kurz)}</span>`;
    }

    // ── Kachel ────────────────────────────────────────────────────────
    // Schlank gehalten: nur was der Lagerleiter beim Scannen braucht.
    // Alle Details liegen im geteilten Hover-Popup (siehe _popupHTML).
    _teKachelHTML(te) {
      const status = te.status;
      const badgeLabel = STATUS_LABEL[status] ?? status;

      // Warn-Icons: max. 4, Rest als "+n"-Overflow.
      let warnInner = '';
      if (te.warnungen.length) {
        const sicht = te.warnungen.slice(0, 4);
        const rest  = te.warnungen.slice(4);
        warnInner = sicht.map(w =>
          `<span class="tc-warn w-${w.farbe}" title="${esc(w.tooltip)}">${w.icon}</span>`
        ).join('');
        if (rest.length) {
          warnInner += `<span class="tc-warn w-more" title="${esc(rest.map(w => w.label + ': ' + w.tooltip).join('\n\n'))}">+${rest.length}</span>`;
        }
      }

// Warnzeile: aktueller Status (links) + Ankunfts-Pünktlichkeit + Warn-Icons (rechts).
      const warnHTML = `<div class="tc-warnbar">
        <span class="tc-status-tag badge-${esc(status)}">${esc(badgeLabel)}</span>
        <div class="tc-spacer"></div>
        <div class="tc-warn-icons">${warnInner}</div>
      </div>`;

      // ── Einheitliche Zeitbewertung (unten rechts) ──────────────────────
      // Fasst Pünktlichkeit, Verzögerung und Überfälligkeit in EINEM Indikator
      // zusammen. Bezug ist die ANKUNFT am Kontrollpunkt gegenüber dem
      // geplanten Start. Schwelle: erst ab VERZOEGERUNG_SCHWELLE_MIN (30 min)
      // gilt etwas als verzögert/überfällig — darunter "pünktlich".
      let statusHint = '';
      if (te.abweichungGrund === 'überfällig') {
        // Geplanter Start ≥30 min überschritten, noch nicht eingetroffen
        statusHint = `<span class="tc-hint-badge warn" title="Geplanter Start überschritten, noch nicht am Kontrollpunkt">⚠ Überfällig ${fmtDauer(te.ueberfaelligMin)}</span>`;
      } else if (te.abweichungGrund === 'verzögert') {
        // Ankunft ≥30 min nach geplantem Start
        const dm = te.verzoegerungMin;
        const txt = dm != null ? `Verspätet ${fmtDauer(dm)}` : 'Verspätet';
        statusHint = `<span class="tc-hint-badge warn" title="Ankunft mehr als 30 min nach dem geplanten Start">⚠ ${esc(txt)}</span>`;
      } else if (te.tsAnkunft && te.geplantStart) {
        // Bereits eingetroffen und innerhalb der 30-Minuten-Toleranz → pünktlich.
        statusHint = `<span class="tc-hint-badge ok" title="Ankunft innerhalb der 30-Minuten-Toleranz">Pünktlich</span>`;
      }
      // Sonst (noch nicht eingetroffen, geplanter Start noch nicht überschritten):
      // KEIN Indikator — der Transport ist einfach noch planmäßig unterwegs.

      // Frachtführer nur mit Klartext zeigen — eine nackte Key-Nummer hilft nicht.
      const ff = te.frachtfuehrer;
      const ffText = (ff && ff.text && ff.text !== ff.key) ? ff.text : '';
      const zeitText = te.geplantStart ? `ab ${fmtTime(te.geplantStart)}` : '';

      return /* html */`
        <div class="te-card s-${esc(status)}${te.planabweichung ? ' abweichung' : ''}${te.abweichungGrund === 'überfällig' ? ' ueberfaellig' : ''}"
             data-te="${esc(te.te)}" role="button" tabindex="0"
             aria-label="TE ${esc(te.te)}, Status: ${esc(badgeLabel)}">
          ${warnHTML}
          <div class="tc-head">
            <a class="tc-te-nr" data-ewm="${esc(te.te)}" href="${esc(ewmLink(te.te))}"
               target="_blank" rel="noopener" title="In EWM öffnen">${esc(te.te)}<span class="tc-ext-ico">↗</span></a>
            ${te.transportmittel ? `<span class="tc-tm">${esc(te.transportmittel)}</span>` : ''}
            ${ffText ? `<span class="tc-ff">${esc(ffText)}</span>` : ''}
            <div class="tc-spacer"></div>
          </div>
          <div class="tc-sub">
            <span class="tc-supplier">${esc(te.lieferantName ?? '–')}</span>
            ${te.teExt ? `<span class="tc-te-ext" title="Externe TE">${esc(te.teExt)}</span>` : ''}
          </div>
          <div class="tc-progress">${this._fortschrittHTML(te)}</div>
          <div class="tc-footer">
            <div class="tc-footer-facts">
              ${this._lsBadgeHTML(te.ladestelle ?? 'Landverkehr')}
              <span class="tc-fact" title="Anzahl Positionen">${te.anzahlPositionen} Pos.</span>
              <span class="tc-fact${te.halle ? '' : ' leer'}" title="Halle">${esc(te.halle ?? '–')}</span>
              <span class="tor-badge-card${te.tor ? '' : ' leer'}" title="Tor">${esc(te.tor ?? '–')}</span>
            </div>
            <div class="tc-footer-meta">
              ${zeitText ? `<span class="tc-time">${esc(zeitText)}</span>` : ''}
              ${statusHint || '<span class="tc-hint-badge placeholder"></span>'}
            </div>
          </div>
        </div>
      `;
    }

    // Fortschrittsbalken: 6 Pflichtschritte + optionale Abfahrt.
    // Geplante TE deren Zeit noch nicht erreicht ist → alles grau.
    // Zeit erreicht, aber keine Ankunft → erster Balken blinkt rot.
    // Jeder Balken trägt seinen Prozessnamen + Zeit als title (kostenloser Tooltip).
    _fortschrittHTML(te) {
      const jetzt = jetztWanduhr();
      const schrittTs = [
        te.tsAnkunft, te.tsAngedockt, te.tsEntladenStart,
        te.tsEntladenEnde, te.tsWeBuchung, te.tsEinlagerung,
      ];
      const isVerspaetet = te.planabweichung === true;
      const nochNichtDa  = !te.tsAnkunft;
      const planErreicht = te.geplantStart && jetzt >= te.geplantStart;
      const ueberfaellig = nochNichtDa && planErreicht;

      let html = schrittTs.map((ts, i) => {
        const name  = PROZESS_SCHRITTE[i];
        const isDone = ts !== null;
        let cls = 'tc-step';
        if (isDone) {
          cls += isVerspaetet ? ' late' : ' done';
        } else if (ueberfaellig && i === 0) {
          cls += ' overdue';
        } else if (!isDone && i === te.fortschritt && !nochNichtDa) {
          cls += isVerspaetet ? ' active late' : ' active';
        }
        const tip = isDone
          ? `${name}\n${fmtDateTime(ts)}`
          : (ueberfaellig && i === 0)
            ? `${name}\nÜberfällig — geplant ${fmtTime(te.geplantStart)}`
            : `${name}\nnoch offen`;
        return `<div class="${cls}" title="${esc(tip)}"></div>`;
      }).join('');

      const abTip = te.abgefahren
        ? `Abfahrt vom Kontrollpunkt\n${fmtDateTime(te.tsAbfahrt)}`
        : 'Abfahrt (optional)\nnoch nicht abgefahren';
      html += `<div class="tc-step-sep"></div>`
            + `<div class="tc-step-abfahrt${te.abgefahren ? ' done' : ''}" title="${esc(abTip)}"></div>`;
      return html;
    }

    // Inhalt des geteilten Hover-Popups für eine TE.
    _popupHTML(te) {
      const row = (l, v) => (v && v !== '–')
        ? `<div class="tc-pop-row"><span class="tc-pop-label">${esc(l)}</span><span class="tc-pop-val">${esc(v)}</span></div>` : '';
      const time = (l, ts) =>
        `<div class="tc-pop-row"><span class="tc-pop-label">${esc(l)}</span><span class="tc-pop-val">${ts ? fmtDateTime(ts) : '–'}</span></div>`;

      const warn = te.warnungen.length
        ? `<div class="tc-pop-warn">` + te.warnungen.map(w =>
            `<div class="tc-pop-warn-row"><span class="w-${w.farbe}">${w.icon}</span> ${esc(w.tooltip.split('\n')[0])}</div>`
          ).join('') + `</div><div class="tc-pop-sep"></div>` : '';

      return `
        <div class="tc-pop-head">
          <span class="tc-pop-te">${esc(te.te)}</span>
          <span class="tc-badge badge-${esc(te.status)}">${esc(STATUS_LABEL[te.status] ?? te.status)}</span>
        </div>
        ${warn}
        ${row('Externe TE', te.teExt)}
        ${row('Lieferant', te.lieferantName)}
        ${row('Frachtführer', keyTextStr(te.frachtfuehrer))}
        ${row('Transportmittel', te.transportmittel)}
        ${row('Ladestelle', ladestelleKurz(te.ladestelle))}
        ${row('Tor', te.tor ?? 'noch nicht zugewiesen')}
        ${row('Halle', te.halle)}
        ${row('Positionen', String(te.anzahlPositionen))}
        ${row('Anlieferpaletten', String(te.anlieferpaletten))}
        <div class="tc-pop-sep"></div>
        ${time('Geplanter Start', te.geplantStart)}
        ${time('Ankunft', te.tsAnkunft)}
        ${time('Angedockt', te.tsAngedockt)}
        ${te.andockVerspaetet ? `<div class="tc-pop-warn-row"><span class="w-warn">⚠</span> Andocken ${fmtDauer(te.andockVerzugMin)} nach geplantem Start</div>` : ''}
        ${time('Entladen ab', te.tsEntladenStart)}
        ${time('Entladen bis', te.tsEntladenEnde)}
        ${time('WE gebucht', te.tsWeBuchung)}
        ${time('Fertigstellung', te.tsEinlagerung)}
        ${time('Abfahrt', te.tsAbfahrt)}`;
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
      const sendung = [
        ['Anlieferung (Liefernr.)', esc(te.liefernummer ?? '–')],
        ['Bestellnummer',           esc(te.bestellnummer ?? '–')],
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
              <div class="dh-te">${esc(te.te)}</div>
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

    // ── Render: Gantt ────────────────────────────────────────────────────

    _ganttFensterBereich() {
      const anker = new Date(this._ganttDatum);
      anker.setUTCHours(0, 0, 0, 0);
      switch (this._ganttFenster) {
        case '3tage':
          return { start: anker, ende: new Date(anker.getTime() + 3 * 86400000) };
        case 'woche': {
          const tag = anker.getUTCDay();
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
        const fmt = (d) => d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', timeZone:'UTC' });
        navDate.textContent = this._ganttFenster === 'tag'
          ? this._ganttDatum.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit', timeZone:'UTC' })
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
      const jetzt = jetztWanduhr();

      // ── Achse = exakt das gewählte Fenster ──
      // Fallback falls Parameter fehlen (z.B. beim ersten Render)
      const achseStart   = fensterStart instanceof Date ? fensterStart : new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
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
          const tag  = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', timeZone:'UTC' });
          const zeit = fmtTime(d);
          return d.getUTCHours() === 0 ? tag : zeit;
        };
      }

      const ticks = [];
      const tickStart = new Date(achseStart);
      while (tickStart <= achseEnde) {
        // Nur Ticks die auf das Intervall passen
        if (tickStart.getUTCHours() % tickIntervallH === 0) {
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
      const byLS = {};
      for (const te of tesFuerGantt) {
        const ls = ladestelleKurz(te.ladestelle);
        if (!byLS[ls]) byLS[ls] = [];
        byLS[ls].push(te);
      }
      const zeilenHTML = LADESTELLE_KATEGORIEN
        .filter(ls => byLS[ls]?.length > 0)
        .map(ls => {
          const m  = LADESTELLE_STYLE[ls] ?? LADESTELLE_STYLE.BSL;
          const gr = byLS[ls];
          const vz = gr.filter(t => t.planabweichung).length;
          const gh = `<div class="gantt-group-header">
            <div class="gantt-group-accent" style="background:${m.col}"></div>
            <span class="gantt-group-title" style="color:${m.col}">${m.icon} ${esc(ls + ' — ' + ladestelleLang(ls))}</span>
            <span class="gantt-group-count">${gr.length} TE${gr.length !== 1 ? 's' : ''}</span>
            ${vz ? `<span class="gantt-group-count" style="background:var(--c-red-dim);color:#e74c3c">${vz} verzögert</span>` : ''}
            <div style="flex:1"></div>
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

            <!-- Legende: Prozess-Phasen -->
            <div class="gantt-legend">
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch"
                  style="background:var(--c-bg4);border:1px solid var(--c-border2)"></div>
                Geplantes Fenster
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:#5dade2"></div>
                Anfahrt
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:#48c9b0"></div>
                Wartezeit
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:var(--c-blue)"></div>
                Entladen
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:var(--c-green)"></div>
                WE & Einlagerung
              </div>
              <div class="gantt-legend-item">
                <div class="gantt-legend-swatch" style="background:var(--c-red)"></div>
                Lange Wartezeit
              </div>
              <div class="gantt-legend-item">
                <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:7px solid var(--c-text3)"></div>
                Abfahrt (optional)
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

      // ── Ist-Balken in PHASEN-SEGMENTE aufteilen ──
      // Jede Phase (Anfahrt/Warten/Entladen/Nachbearbeitung) wird als eigenes
      // Segment mit eigenem Hover-Tooltip gerendert.
      const clamp = (d) => new Date(Math.min(Math.max(d.getTime(), achseStart.getTime()), achseEnde.getTime()));
      const segDauer = (a, b) => fmtDauer(diffMin(a, b));

      // Phasen-Definition: [von, bis, label, cssKlasse]
      const phasen = [];
      const entladenEnde = te.tsEntladenEnde ?? te.tsEntladenTat;

      // Phase 1: Ankunft → Angedockt (Anfahrt zum Tor)
      if (te.tsAnkunft && te.tsAngedockt) {
        phasen.push({ von: te.tsAnkunft, bis: te.tsAngedockt, cls: 'phase-anfahrt',
          name: 'Anfahrt zum Tor', dauer: segDauer(te.tsAnkunft, te.tsAngedockt) });
      }
      // Phase 2: Angedockt → Entladen-Start (Wartezeit — der kritische Engpass)
      if (te.tsAngedockt && te.tsEntladenStart) {
        const wartMin = diffMin(te.tsAngedockt, te.tsEntladenStart);
        phasen.push({ von: te.tsAngedockt, bis: te.tsEntladenStart,
          cls: wartMin >= VERZOEGERUNG_SCHWELLE_MIN ? 'phase-warten-lang' : 'phase-warten',
          name: 'Wartezeit am Tor', dauer: segDauer(te.tsAngedockt, te.tsEntladenStart) });
      }
      // Phase 3: Entladen-Start → Entladen-Ende (eigentliches Entladen)
      if (te.tsEntladenStart && entladenEnde) {
        phasen.push({ von: te.tsEntladenStart, bis: entladenEnde, cls: 'phase-entladen',
          name: 'Entladen', dauer: segDauer(te.tsEntladenStart, entladenEnde) });
      }
      // Phase 4: Entladen-Ende → Fertigstellung (WE-Buchung + Einlagerung)
      const nachEnde = te.tsEinlagerung ?? te.tsWeBuchung;
      if (entladenEnde && nachEnde) {
        phasen.push({ von: entladenEnde, bis: nachEnde, cls: 'phase-nachbearbeitung',
          name: 'WE-Buchung & Einlagerung', dauer: segDauer(entladenEnde, nachEnde) });
      }

      // Falls noch aktiv (kein Ende): laufende Phase bis Jetzt
      const letzterTs = nachEnde ?? entladenEnde ?? te.tsEntladenStart ?? te.tsAngedockt ?? te.tsAnkunft;
      if (letzterTs && !nachEnde && te.status !== 'abgefahren' && te.status !== 'eingelagert') {
        const jetzt = jetztWanduhr();
        if (jetzt > letzterTs && jetzt <= achseEnde) {
          phasen.push({ von: letzterTs, bis: jetzt, cls: 'phase-laufend',
            name: 'Läuft aktuell', dauer: segDauer(letzterTs, jetzt) });
        }
      }

      let istHTML = '';
      let labelHTML = '';
      let gesamtStart = null, gesamtEnde = null;

      for (const ph of phasen) {
        const cs = clamp(ph.von), ce = clamp(ph.bis);
        const l = pct(cs);
        const w = (pct(ce) - parseFloat(l)).toFixed(3);
        if (parseFloat(w) <= 0) continue;
        if (!gesamtStart) gesamtStart = ph.von;
        gesamtEnde = ph.bis;

        // Tooltip pro Phase: Name, Zeitspanne, Dauer
        const tip = `${ph.name}  ·  ${fmtTime(ph.von)}–${fmtTime(ph.bis)}  ·  ${ph.dauer}`;
        istHTML += `<div class="gantt-bar-ist ${ph.cls}" data-te="${esc(te.te)}"
          style="left:${l}%;width:${w}%"
          title="${esc(tip)}"></div>`;
      }

      // Abfahrt als kleiner optionaler Marker (falls vorhanden und im Fenster)
      if (te.tsAbfahrt && te.tsAbfahrt >= achseStart && te.tsAbfahrt <= achseEnde) {
        const la = pct(clamp(te.tsAbfahrt));
        istHTML += `<div class="gantt-abfahrt-marker" data-te="${esc(te.te)}"
          style="left:${la}%"
          title="${esc('Abfahrt vom Kontrollpunkt · ' + fmtTime(te.tsAbfahrt))}"></div>`;
      }

      // Balken-Label: Startzeit wenn Gesamtbalken breit genug
      if (gesamtStart && gesamtEnde) {
        const lStart = pct(clamp(gesamtStart));
        const wGesamt = parseFloat(pct(clamp(gesamtEnde))) - parseFloat(lStart);
        if (wGesamt > 4) {
          const labelText = wGesamt > 8
            ? `${fmtTime(gesamtStart)}–${fmtTime(gesamtEnde)}`
            : fmtTime(gesamtStart);
          labelHTML = `<div class="gantt-bar-label"
            style="left:${lStart}%;width:${wGesamt.toFixed(3)}%">${esc(labelText)}</div>`;
        }
      }

      return `
        <div class="gantt-row${te.planabweichung ? ' gantt-row-abweichung' : ''}" data-te="${esc(te.te)}"
             role="button" tabindex="0"
             aria-label="TE ${esc(te.te)}, ${esc(te.lieferantName ?? '')}${te.planabweichung ? ', Planabweichung' : ''}">
          <div class="gantt-row-label">
            <div class="gantt-row-te">${te.planabweichung ? '<span class="gantt-abw-icon" title="Planabweichung">⚠</span> ' : ''}${esc(te.te)}</div>
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

    // ── Render: Palettenplanung ──────────────────────────────────────────
    // Kreuztabelle: Halle (Zeilen) × Packmittel (Unterzeilen) × Tag (Spalten).
    // Zelle = Summe der benötigten Anlieferpaletten. Aggregiert über die
    // Positionen aller TEs, deren geplanter Start in den Zeitraum fällt.
    _renderPaletten() {
      const host = this._$('pp-content');
      if (!host) return;

      const { von, bis, tage, label } = this._ppBereich();
      const sub = this._$('pp-sub');
      if (sub) sub.textContent = label;

      // Tage als Spalten-Schlüssel vorbereiten
      const tagKeys = [];
      for (let t = 0; t < tage; t++) {
        const d = new Date(von.getTime() + t * 86400000);
        tagKeys.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      }
      const tagKey = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

      // Aggregation: halle → packmittelLabel → tagKey → Summe
      const daten = new Map();     // halle → Map(packmittel → Map(tag → paletten))
      const packmittelSet = new Map(); // halle → Set(packmittelLabel) für stabile Reihenfolge
      let gesamtPaletten = 0;

      for (const te of this._teMap.values()) {
        const anker = te.geplantStart ?? te.tsAnkunft;
        if (!anker || anker < von || anker >= bis) continue;
        const tk = tagKey(anker);

        for (const p of te.produkte) {
          const paletten = p.anlieferpaletten || 0;
          if (paletten <= 0) continue;
          const halle = normHalle(p.halle) ?? te.halle ?? '–';
          // Packmittel: "#"/leer → "nicht definiert"
          const pmLabel = (p.packmittel && p.packmittel.key)
            ? keyTextStr(p.packmittel)
            : 'nicht definiert';

          if (!daten.has(halle)) { daten.set(halle, new Map()); packmittelSet.set(halle, new Set()); }
          const perPack = daten.get(halle);
          packmittelSet.get(halle).add(pmLabel);
          if (!perPack.has(pmLabel)) perPack.set(pmLabel, new Map());
          const perTag = perPack.get(pmLabel);
          perTag.set(tk, (perTag.get(tk) || 0) + paletten);
          gesamtPaletten += paletten;
        }
      }

      if (daten.size === 0) {
        host.innerHTML = `<div class="pp-empty">Keine Palettenbedarfe im gewählten Zeitraum.</div>`;
        return;
      }

      // Spaltenköpfe (Tage)
      const heuteK = tagKey(jetztWanduhr());
      const tagHeader = tagKeys.map(tk => {
        const d = new Date(tk);
        const istHeute = tk === heuteK;
        return `<th class="pp-tag${istHeute ? ' heute' : ''}">
          <div class="pp-tag-wd">${d.toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' })}</div>
          <div class="pp-tag-dm">${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</div>
        </th>`;
      }).join('');

      // Tagessummen über alle Hallen
      const tagSumme = new Map(tagKeys.map(tk => [tk, 0]));

      // Hallen sortiert (numerisch wo möglich)
      const hallen = [...daten.keys()].sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b));
      });

      // Halle → Tag → Gesamtpaletten (über alle Packmittel) vorab aggregieren.
      // Damit bauen wir die kompakte Übersicht "Paletten pro Tag & Halle".
      const halleTagGesamt = new Map();  // halle → Map(tag → summe)
      const halleGesamt    = new Map();  // halle → summe gesamt
      for (const halle of hallen) {
        const perPack = daten.get(halle);
        const perTag = new Map(tagKeys.map(tk => [tk, 0]));
        let summe = 0;
        for (const [, tagMap] of perPack) {
          for (const tk of tagKeys) {
            const v = tagMap.get(tk) || 0;
            perTag.set(tk, perTag.get(tk) + v);
            summe += v;
          }
        }
        halleTagGesamt.set(halle, perTag);
        halleGesamt.set(halle, summe);
      }

      // Spitzenwert für farbliche Hervorhebung (höchster Tagesbedarf einer Halle)
      let maxZelle = 0;
      for (const perTag of halleTagGesamt.values())
        for (const v of perTag.values()) if (v > maxZelle) maxZelle = v;

      // ── Übersichtsmatrix: Halle (Zeilen) × Tag (Spalten), Gesamtpaletten ──
      const uebersichtZeilen = hallen.map(halle => {
        const perTag = halleTagGesamt.get(halle);
        const zellen = tagKeys.map(tk => {
          const v = perTag.get(tk) || 0;
          // Intensität 0..1 für Heatmap-Einfärbung
          const intensitaet = maxZelle > 0 ? (v / maxZelle) : 0;
          const stil = v > 0
            ? ` style="background:rgba(192,57,43,${(0.08 + intensitaet * 0.35).toFixed(2)})"`
            : '';
          return `<td class="ppu-cell${v ? '' : ' leer'}"${stil}>${v || '·'}</td>`;
        }).join('');
        return `<tr>
          <td class="ppu-halle">Halle ${esc(halle)}</td>
          ${zellen}
          <td class="ppu-cell ppu-rowsum">${halleGesamt.get(halle)}</td>
        </tr>`;
      }).join('');

      const uebersichtTagSummen = tagKeys.map(tk => {
        let s = 0;
        for (const perTag of halleTagGesamt.values()) s += perTag.get(tk) || 0;
        return `<td class="ppu-cell ppu-colsum">${s || '·'}</td>`;
      }).join('');

      const uebersichtHeader = tagKeys.map(tk => {
        const d = new Date(tk);
        const istHeute = tk === tagKey(jetztWanduhr());
        return `<th class="ppu-tag${istHeute ? ' heute' : ''}">
          <div class="ppu-tag-wd">${d.toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' })}</div>
          <div class="ppu-tag-dm">${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}</div>
        </th>`;
      }).join('');

      const uebersichtHTML = `
        <div class="ppu-title">Paletten pro Tag &amp; Halle</div>
        <div class="pp-scroll ppu-scroll">
          <table class="ppu-table">
            <thead>
              <tr>
                <th class="ppu-corner">Halle</th>
                ${uebersichtHeader}
                <th class="ppu-tag ppu-sumhead">Σ Halle</th>
              </tr>
            </thead>
            <tbody>
              ${uebersichtZeilen}
              <tr class="ppu-foot">
                <td class="ppu-halle">Σ Tag</td>
                ${uebersichtTagSummen}
                <td class="ppu-cell ppu-grand">${gesamtPaletten}</td>
              </tr>
            </tbody>
          </table>
        </div>`;

      const halleBloecke = hallen.map(halle => {
        const perPack = daten.get(halle);
        // Packmittel sortiert: "nicht definiert" ans Ende
        const packmittel = [...packmittelSet.get(halle)].sort((a, b) => {
          if (a === 'nicht definiert') return 1;
          if (b === 'nicht definiert') return -1;
          return a.localeCompare(b);
        });

        let halleSumme = 0;
        const halleTagSumme = new Map(tagKeys.map(tk => [tk, 0]));

        const packZeilen = packmittel.map(pm => {
          const perTag = perPack.get(pm);
          const zellen = tagKeys.map(tk => {
            const v = perTag.get(tk) || 0;
            halleSumme += v;
            halleTagSumme.set(tk, halleTagSumme.get(tk) + v);
            tagSumme.set(tk, tagSumme.get(tk) + v);
            return `<td class="pp-cell${v ? '' : ' leer'}">${v || '·'}</td>`;
          }).join('');
          const undef = pm === 'nicht definiert';
          return `<tr class="pp-pack-row${undef ? ' undef' : ''}">
            <td class="pp-pack-name">${undef ? '⚠ ' : ''}${esc(pm)}</td>
            ${zellen}
          </tr>`;
        }).join('');

        const summenZellen = tagKeys.map(tk =>
          `<td class="pp-cell pp-sum">${halleTagSumme.get(tk) || '·'}</td>`).join('');

        return `
          <tbody class="pp-halle-block">
            <tr class="pp-halle-row">
              <td class="pp-halle-name">Halle ${esc(halle)}</td>
              <td class="pp-halle-total" colspan="${tage}">${halleSumme} Paletten gesamt</td>
            </tr>
            ${packZeilen}
            <tr class="pp-halle-sum">
              <td class="pp-pack-name">Summe Halle ${esc(halle)}</td>
              ${summenZellen}
            </tr>
          </tbody>`;
      }).join('');

      // Fußzeile: Tagessummen gesamt
      const footZellen = tagKeys.map(tk =>
        `<td class="pp-cell pp-grand">${tagSumme.get(tk) || '·'}</td>`).join('');

      host.innerHTML = `
        <div class="pp-kpis">
          <div class="pp-kpi primary"><span class="pp-kpi-val">${gesamtPaletten}</span><span class="pp-kpi-lbl">Paletten gesamt</span></div>
          <div class="pp-kpi"><span class="pp-kpi-val">${hallen.length}</span><span class="pp-kpi-lbl">Hallen</span></div>
          <div class="pp-kpi"><span class="pp-kpi-val">${tage}</span><span class="pp-kpi-lbl">${tage === 1 ? 'Tag' : 'Tage'}</span></div>
          <div class="pp-kpi"><span class="pp-kpi-val">${maxZelle || '·'}</span><span class="pp-kpi-lbl">Spitzenbedarf / Halle·Tag</span></div>
        </div>
        ${uebersichtHTML}
        <div class="ppd-title">Aufschlüsselung nach Packmittel</div>
        <div class="pp-scroll">
          <table class="pp-table">
            <thead>
              <tr>
                <th class="pp-corner">Halle / Packmittel</th>
                ${tagHeader}
              </tr>
            </thead>
            ${halleBloecke}
            <tfoot>
              <tr class="pp-foot">
                <td class="pp-pack-name">Tagesbedarf gesamt</td>
                ${footZellen}
              </tr>
            </tfoot>
          </table>
        </div>`;
    }

    // Zeitbereich der Palettenplanung (eigener Zustand, unabhängig von der Übersicht).
    _ppBereich() {
      const jetzt = jetztWanduhr();
      const heute = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
      const tag = 86400000;
      switch (this._ppZeitraum) {
        case 'gestern':
          return { von: new Date(heute.getTime() - tag), bis: heute, tage: 1, label: 'Gestern' };
        case 'morgen':
          return { von: new Date(heute.getTime() + tag), bis: new Date(heute.getTime() + 2 * tag), tage: 1, label: 'Morgen' };
        case 'woche': {
          const wd = heute.getUTCDay();
          const diff = (wd === 0 ? -6 : 1 - wd);
          const mo = new Date(heute.getTime() + diff * tag);
          return { von: mo, bis: new Date(mo.getTime() + 7 * tag), tage: 7, label: 'Diese Woche (Mo–So)' };
        }
        case 'geplant':
          return { von: heute, bis: new Date(heute.getTime() + 14 * tag), tage: 14, label: 'Kommende 14 Tage' };
        default: // 'heute'
          return { von: heute, bis: new Date(heute.getTime() + tag), tage: 1, label: 'Heute' };
      }
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
        const verz   = teInHalle.filter(te => te.planabweichung);
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
      const isV = te.planabweichung === true;

      // Restzeit-Schätzung (Platzhalter-Logik bis echte Sollwerte vorliegen)
      let restzeit, rzCls;
      if (te.status === 'eingelagert') {
        restzeit = 'fertig'; rzCls = 'rz-ok';
      } else if (isV) {
        restzeit = '⚠ offen'; rzCls = 'rz-bad';
      } else {
        restzeit = 'läuft'; rzCls = 'rz-ok';
      }

      // Fortschritt (6 Prozessstufen → auf 5 Balken gemappt)
      const fp = {
        erwartet: 0, ankunft: 1, angedockt: 2, entladen: 3,
        entladen_fertig: 3, fertigstellung: 4, eingelagert: 5,
      }[te.status] || 0;
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
