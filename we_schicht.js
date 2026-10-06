// ═══════════════════════════════════════════════════════════════════════════
//  SAP Custom Widget – Wareneingang Analyse (WE-Analyse)
//  JavaScript-Arbeitsstand 2.1.44 – positionsbezogene Mengentreue und separate Nullpositionen
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

  // Runde Achsenabstände für die Anzeige; keine Änderung der Messwerte.
  function runderAchsenSchritt(ziel) {
    if (!Number.isFinite(ziel) || ziel <= 1) return 1;
    const faktor = Math.pow(10, Math.floor(Math.log10(ziel)));
    const norm = ziel/faktor;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10)*faktor;
  }

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
    return 'Nicht zugeordnet';
  }

  // Bekannte BW-Ladestellen und eine eigene Gruppe für fehlende/andere Werte.
  const LADESTELLE_KATEGORIEN = ['BSL', 'Container', 'Landverkehr', 'Nicht zugeordnet'];

  // Icon + CSS-Klasse je Kategorie
  const LADESTELLE_STYLE = {
    BSL:         { icon: '🚛', cls: 'ls-bsl'  },
    Container:   { icon: '🏗', cls: 'ls-cont' },
    Landverkehr: { icon: '🚚', cls: 'ls-land' },
    'Nicht zugeordnet': { icon: '○', cls: 'ls-unmapped' },
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
    const s = String(raw).trim();
    let parts;
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
    if (de) parts=[+de[3],+de[2],+de[1],+(de[4]||0),+(de[5]||0),+(de[6]||0)];
    else if (iso) parts=[+iso[1],+iso[2],+iso[3],+(iso[4]||0),+(iso[5]||0),+(iso[6]||0)];
    else if (/^\d{14}$/.test(s)) parts=[+s.slice(0,4),+s.slice(4,6),+s.slice(6,8),+s.slice(8,10),+s.slice(10,12),+s.slice(12,14)];
    else if (/^\d{8}$/.test(s)) parts=[+s.slice(0,4),+s.slice(4,6),+s.slice(6,8),0,0,0];
    else return null;
    const [year,month,day,hour,minute,second]=parts;
    if (year<100 || year>9999 || month<1 || month>12 || day<1 || day>31 || hour>23 || minute>59 || second>59) return null;
    const d=new Date(Date.UTC(year,month-1,day,hour,minute,second));
    return d.getUTCFullYear()===year && d.getUTCMonth()===month-1 && d.getUTCDate()===day ? d : null;
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

  // Vollständiger Zeitstempel für Detailtabellen mit mehrtägigem Zeitraum.
  const fmtDateTimeVoll = (d) => d ? `${fmtDate(d)} ${fmtTime(d)}${d.getUTCSeconds() ? ':' + String(d.getUTCSeconds()).padStart(2, '0') : ''}` : '–';

  // Berechnet Differenz zweier Date-Objekte in Minuten (kann negativ sein)
  const diffMin = (a, b) => {
    if (!a || !b) return null;
    const delta = (b.getTime() - a.getTime()) / 60000;
    return Number.isFinite(delta) ? delta : null;
  };

  // Formatiert Minuten als lesbare Zeitdauer: "1h 23min" oder "45min"
  const fmtDauer = (min) => {
    if (min == null || !Number.isFinite(min)) return '–';
    const abs = Math.round(Math.abs(min));
    const sign = min < 0 ? '−' : '+';
    if (abs < 60) return `${sign}${abs}min`;
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}min`;
  };

  // Formatiert eine Zahl mit deutschem Tausender-Trennzeichen
  const fmtNum = (x) => Math.round(Number(x || 0)).toLocaleString('de-DE');

  // Mengen und PA1 können Dezimalstellen enthalten; für kompakte Kacheln
  // werden höchstens zwei Nachkommastellen gezeigt.
  const fmtMenge = (x) => Number(x).toLocaleString('de-DE', { maximumFractionDigits: 2 });

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
        if (num == null || typeof num==='boolean' || typeof num==='object') continue;
        const raw=String(num).trim();
        if (!raw || /^#+$/.test(raw) || /^(?:@NullMember|NULL|null|undefined|NaN)$/i.test(raw)) continue;
        const number=Number(raw);
        if (Number.isFinite(number)) return number;
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

  // ── Datenmodell-Diagnose ─────────────────────────────────────────────────
  //
  //  Prüft die eingehenden BW-Rows gegen die im Widget erwarteten Feed-IDs.
  //  Unterscheidet zwei grundverschiedene Fehlerbilder, die beide zu leeren
  //  oder falschen Kennzahlen führen, aber unterschiedliche Ursachen haben:
  //
  //    „FELD FEHLT“   – der Objekt-Key (`dimension_xyz_0` bzw. ohne Suffix)
  //                     kommt in KEINER Zeile vor. Das Feed wurde in der
  //                     Story nicht (mehr) gebunden, umbenannt, oder das
  //                     BW-Merkmal/-Kennzahl wurde aus der Query entfernt.
  //    „IMMER LEER“   – der Key ist vorhanden, aber der Wert ist in jeder
  //                     Zeile ein BW-Nullwert (#, leer, @NullMember …).
  //                     Kann echtes Fehlen der Daten sein (z. B. kein Ist-
  //                     Wert im Zeitraum) oder ein kaputtes Mapping in der
  //                     Query — beides ist von außen nicht unterscheidbar,
  //                     daher nur als Hinweis, nicht als Fehler markiert.
  //
  //  Die für die Auswertung KRITISCHEN Felder (Anker- und Prozess-Zeitstempel,
  //  Mengen) sind separat markiert, weil ihr Fehlen die Kennzahlen unmittelbar
  //  leer/„n. b.“ macht.

  const DIAG_FELDER = [
    { feld: 'TE-Nummer',            keys: ['dimension_te'],             kritisch: true  },
    { feld: 'Externe TE',           keys: ['dimension_te_ext'],         kritisch: false },
    { feld: 'Ladestelle',           keys: ['dimension_ladestelle'],     kritisch: false },
    { feld: 'Lieferant',            keys: ['dimension_lieferant_name'], kritisch: false },
    { feld: 'Geplanter Start',      keys: ['dimension_geplant_start'],  kritisch: true  },
    { feld: 'Ankunft',              keys: ['dimension_ts_ankunft'],     kritisch: true  },
    { feld: 'Entladen Ende',        keys: ['dimension_ts_entladen_ende'], kritisch: false },
    { feld: 'WE-Buchung',           keys: ['dimension_ts_we_buchung'],  kritisch: false },
    { feld: 'Einlagerung',          keys: ['dimension_ts_einlagerung'], kritisch: true  },
    { feld: 'Produktnummer',        keys: ['dimension_produkt_nr'],     kritisch: false },
    { feld: 'Menge (Ist)',          keys: ['value_menge'],              kritisch: true  },
    { feld: 'PA1',                  keys: ['value_pa1'],                 kritisch: false },
    { feld: 'Menge (Soll)',         keys: ['value_menge_soll'],         kritisch: true  },
  ];

  // Prüft, ob der Objekt-Key für eines der Feld-Aliase überhaupt existiert
  // (unabhängig vom Wert — auch `null` zählt als "vorhanden").
  function keyExistiert(row, keys) {
    return keys.some(key => (`${key}_0` in row) || (key in row));
  }

  // Extrahiert einen Rohwert unabhängig vom Feldtyp (Dimension/Zeitstempel/
  // Kennzahl), nur um zu prüfen, ob überhaupt etwas Auswertbares drinsteht.
  function irgendeinWert(row, keys) {
    const dim = readDim(row, ...keys);
    if (dim != null) return dim;
    const ts = readTs(row, ...keys);
    if (ts != null) return ts;
    return readVal(row, ...keys);
  }

  // Läuft über eine Stichprobe der Rows und baut die Diagnosetabelle.
  // Auf sehr große Datenmengen gedeckelt (Diagnose, nicht die eigentliche
  // Verarbeitung — die läuft in parseRows() über ALLE Rows).
  function diagnoseDatenmodell(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const MAX_STICHPROBE = 2000;
    const stichprobe = rows.length > MAX_STICHPROBE ? rows.slice(0, MAX_STICHPROBE) : rows;

    const felder = DIAG_FELDER.map(f => {
      let vorhanden = 0, mitWert = 0;
      for (const row of stichprobe) {
        if (!row || typeof row !== 'object') continue;
        if (keyExistiert(row, f.keys)) {
          vorhanden++;
          if (irgendeinWert(row, f.keys) != null) mitWert++;
        }
      }
      let status;
      if (vorhanden === 0)      status = 'FELD FEHLT IM PAYLOAD';
      else if (mitWert === 0)   status = 'IMMER LEER';
      else if (mitWert < vorhanden * 0.5) status = 'TEILWEISE LEER';
      else                       status = 'OK';
      return { ...f, gesamt: stichprobe.length, vorhanden, mitWert, status };
    });

    // Zeilen ohne lesbare TE-Nummer würden von parseRows() stillschweigend
    // übersprungen — hier separat sichtbar machen.
    let ohneTeNummer = 0;
    for (const row of stichprobe) {
      if (!row || typeof row !== 'object') { ohneTeNummer++; continue; }
      if (readDim(row, 'dimension_te', 'TE', 'VBELN', 'te_nr') == null) ohneTeNummer++;
    }

    return {
      rowsGesamt:     rows.length,
      rowsGeprueft:   stichprobe.length,
      ohneTeNummer,
      felder,
      kritischeProbleme: felder.filter(f => f.kritisch && f.status !== 'OK'),
    };
  }

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
  //   produkte: [ { nr, name, liefernummer, menge, mengeSoll, mengeAbweichung, einheit, … } ]
  //
  //   Berechnet (berechneTE / berechneKennzahlen):
  //   status, fortschritt, abgefahren, verzoegerungMin, planabweichung,
  //   andockVerspaetet, warnungen, anzahlPositionen, anzahlProdukte,
  //   produktZusammenfassung, anlieferpaletten,
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
      const teNr = ohneNullen(String(teNrRaw));

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
          transportmittelName: readLabel(row, 'dimension_transportmittel', 'TRMIT'),
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
          _frachtfuehrerMap: new Map(),
          _lieferantenMap:  new Map(),
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
          anzahlProdukte:   0,
          produktZusammenfassung: null,
          anlieferpaletten: null,
          andockVerspaetet: false,
        });
      }

      // ── Produktzeile anhängen ──
      const te = teMap.get(teNr);

      // Lieferantenidentität je Datenzeile prüfen, keine TE-KPI an mehrere Lieferanten verteilen.
      const supplierNr = ohneNullen(readDim(row, 'dimension_lieferant_nr', 'WARENSENDER_NR', 'WARENSENDER'));
      const supplierName = readLabel(row, 'dimension_lieferant_name') ?? readLabel(row, 'dimension_lieferant_nr', 'WARENSENDER');
      const supplierKey = !isNull(supplierNr) ? 'nr:' + String(supplierNr).trim()
        : !isNull(supplierName) && supplierName !== '–' ? 'text:' + String(supplierName).trim() : null;
      const supplierIdentitaet = {key:supplierKey, nr:supplierKey?.startsWith('nr:') ? String(supplierNr).trim() : null,
        label:!isNull(supplierName) && supplierName !== '–' ? String(supplierName).trim() : String(supplierNr ?? 'Ohne Lieferant')};
      te._lieferantenMap.set(supplierKey, supplierIdentitaet);

      // Frachtführer getrennt vom Lieferanten je Datenzeile erfassen.
      const carrier = readKeyTextNum(row, 'dimension_frachtfuehrer');
      const carrierKey = !isNull(carrier.key) ? String(carrier.key).trim() : !isNull(carrier.text) ? 'text:'+String(carrier.text).trim() : null;
      te._frachtfuehrerMap.set(carrierKey, {key:carrierKey, nr:!isNull(carrier.key) ? String(carrier.key).trim() : null,
        label:!isNull(carrier.text) ? String(carrier.text).trim() : carrierKey ?? 'Ohne Frachtführer/Spediteur'});

      // Liefer- und Bestellnummer je Position sammeln (eine TE kann mehrere
      // Anlieferungen/Bestellungen umfassen).
      const lief = ohneNullen(readDim(row, 'dimension_liefernummer', 'LIFNR'));
      const best = ohneNullen(readDim(row, 'dimension_bestellnummer', 'EBELN'));
      if (lief != null && lief !== '' && lief !== '#') te._lieferSet.add(String(lief));
      if (best != null && best !== '' && best !== '#') te._bestellSet.add(String(best));

      const prodNr = ohneNullen(readDim(row, 'dimension_produkt_nr', 'MATNR'));
      if (prodNr || !isNull(lief) || readVal(row, 'value_menge', 'MENGE') != null || readVal(row, 'value_menge_soll', 'MENGE_SOLL') != null || readVal(row, 'value_menge_abweichung', 'MENGE_ABW') != null) {
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
          // Positionsgenaue Zuordnung, damit der Lieferanten-Drill-down bei
          // mehreren Anlieferungen pro TE keine Produktzeile falsch zuordnet.
          liefernummer: lief,
          lieferantBewertung: supplierIdentitaet,
          transportmittelBewertung: readKeyText(row, 'dimension_transportmittel', 'TRMIT'),
          // menge = Ist-Menge (Anzeige in der Positionstabelle der Detailsicht)
          menge:        mengeIst,
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
          pa1:              readNum(row, 'value_pa1', 'PA1'),
          anlieferpaletten: readPaletten(row, 'value_anlieferpaletten'),
        });
      }
    }

    // Berechnete Felder für jede TE befüllen
    for (const te of teMap.values()) {
      // Gesammelte Anlieferungen/Bestellungen in sortierte Arrays wandeln
      te.anlieferungen = [...te._lieferSet].sort();
      te.bestellungen  = [...te._bestellSet].sort();
      te.frachtfuehrerBewertung = [...te._frachtfuehrerMap.values()];
      delete te._frachtfuehrerMap;
      te.lieferantenBewertung = [...te._lieferantenMap.values()];
      delete te._lieferantenMap;
      delete te._lieferSet;
      delete te._bestellSet;

      berechneTE(te, cfg);
      berechneKennzahlen(te, cfg);
      // Warnungen zuletzt: sie greifen auch auf die Kennzahlen zu.
      te.warnungen = baueWarnungen(te);
    }

    return teMap;
  }

  // Verdichtet die Positionszeilen einer TE zu fachlich eindeutigen
  // Produkt-/Packmittelgruppen. Erst die Mengen einer Gruppe summieren, dann
  // Menge / PA1 aufrunden – dadurch werden mehrere Positionen desselben
  // Produkts nicht fälschlich jeweils einzeln aufgerundet.
  function palettenAufrunden(menge,pa1) {
    if (!Number.isFinite(menge) || menge<0 || !Number.isFinite(pa1) || pa1<=0) return null;
    const q=menge/pa1;
    return q===0 ? 0 : Math.max(1,Math.ceil(q-Number.EPSILON*Math.max(1,q)*4));
  }

  function aggregiereTeProdukte(te) {
    const gruppen = new Map();
    const produktIds = new Set();

    for (const p of te?.produkte ?? []) {
      if (isNull(p?.nr)) continue;
      const nr = String(p.nr).trim();
      produktIds.add(nr);
      const einheit = isNull(p.einheit) ? '' : String(p.einheit).trim();
      const packmittelKey = p.packmittel?.key ?? p.packmittel?.text ?? null;
      const packmittelText = keyTextStr(p.packmittel);
      const menge = Number.isFinite(p.mengeIst) ? p.mengeIst : null;
      const pa1 = Number.isFinite(p.pa1) && p.pa1 > 0 ? p.pa1 : null;
      // Unterschiedliche PA1-Werte bleiben getrennt. So wird keine scheinbar
      // eindeutige Palettenzahl aus widersprüchlichen Stammdaten gebildet.
      const key = [nr, einheit, packmittelKey ?? '', pa1 ?? ''].join('\u001f');
      if (!gruppen.has(key)) {
        gruppen.set(key, {
          nr,
          name: p.name ?? '–',
          einheit,
          packmittel: p.packmittel,
          packmittelText,
          pa1,
          menge: 0,
          mengeVollstaendig: true,
          bekanntePositionen:0,
          positionen: 0,
        });
      }
      const g = gruppen.get(key);
      g.positionen++;
      if (menge == null || menge < 0) g.mengeVollstaendig = false;
      else { g.menge += menge;g.bekanntePositionen++; }
    }

    const faktoren=new Map();
    for (const g of gruppen.values()) {
      const key=JSON.stringify([g.nr,g.einheit,g.packmittel?.key ?? g.packmittel?.text ?? null]);
      if (!faktoren.has(key)) faktoren.set(key,new Set());
      faktoren.get(key).add(g.pa1);
    }
    const produkte = [...gruppen.values()].map(g => {
      const key=JSON.stringify([g.nr,g.einheit,g.packmittel?.key ?? g.packmittel?.text ?? null]);
      const pa1Konflikt=faktoren.get(key).size>1;
      return {...g,pa1Konflikt,paletten:g.mengeVollstaendig && g.pa1!=null && !pa1Konflikt ? palettenAufrunden(g.menge,g.pa1) : null};
    }).sort((a, b) => a.nr.localeCompare(b.nr, 'de', { numeric: true })
      || String(a.packmittelText ?? '').localeCompare(String(b.packmittelText ?? ''), 'de'));

    const mengen = new Map();
    for (const p of produkte) {
      const einheit = p.einheit || 'ohne Einheit';
      if (!mengen.has(einheit)) mengen.set(einheit,{einheit,menge:0,vollstaendig:true,bekanntePositionen:0});
      const m=mengen.get(einheit);m.menge+=p.menge;m.bekanntePositionen+=p.bekanntePositionen;m.vollstaendig=m.vollstaendig && p.mengeVollstaendig;
    }
    const palettenVollstaendig = produkte.length > 0 && produkte.every(p => p.paletten != null);
    return {
      anzahlProdukte: produktIds.size,
      produkte,
      mengen: [...mengen.values()],
      paletten: palettenVollstaendig ? produkte.reduce((summe, p) => summe + p.paletten, 0) : null,
      palettenVollstaendig,
      fehlendePa1: produkte.filter(p => p.pa1 == null).length,
      pa1Konflikte:produkte.filter(p=>p.pa1Konflikt).length,
      packmittel: [...new Set(produkte.map(p => p.packmittelText).filter(Boolean))],
    };
  }

  // Texte für die kompakte TE-Kachel. Die vollständige Produkt-/Packmittel-
  // Zuordnung steht im Tooltip und nach dem Klick in der Detailansicht.
  function teProduktKachelDaten(te) {
    const z = te?.produktZusammenfassung ?? aggregiereTeProdukte(te);
    const produktText = `${z.anzahlProdukte} ${z.anzahlProdukte === 1 ? 'Produkt' : 'Produkte'}`;
    const mengenText = z.mengen.length
      ? z.mengen.map(m => `${m.bekanntePositionen===0 ? 'n. b.' : fmtMenge(m.menge)} ${m.einheit}${m.vollstaendig===false && m.bekanntePositionen>0 ? ' (Teilsumme)' : ''}`).join(' · ')
      : 'Menge n. b.';
    const palettenText = z.paletten == null ? 'Paletten n. b.' : `${fmtNum(z.paletten)} Pal.`;
    const packmittelText = z.packmittel.length ? z.packmittel.join(' / ') : 'n. b.';
    const details = z.produkte.length ? z.produkte.map(p => {
      const menge = p.mengeVollstaendig ? `${fmtMenge(p.menge)} ${p.einheit || 'ohne Einheit'}` : 'Menge n. b.';
      const pa1 = p.pa1Konflikt ? 'PA1 widersprüchlich' : p.pa1 == null ? 'PA1 fehlt' : `PA1 ${fmtMenge(p.pa1)}`;
      const paletten = p.paletten == null ? 'Paletten n. b.' : `${fmtNum(p.paletten)} Pal.`;
      return `${p.nr}${p.name && p.name !== '–' ? ` – ${p.name}` : ''}: ${menge}; ${pa1}; ${paletten}; ${p.packmittelText || 'Packmittel n. b.'}`;
    }).join(' | ') : 'Keine Produktdaten';
    return { produktText, mengenText, palettenText, packmittelText, details };
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
               && te.verzoegerungMin > cfg.toleranzMin) {
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
    te.produktZusammenfassung = aggregiereTeProdukte(te);
    te.anzahlProdukte = te.produktZusammenfassung.anzahlProdukte;
    te.anlieferpaletten = te.produktZusammenfassung.paletten;
  }

  // Ohne angebundene Positionsnummer: Produkt je Anlieferung und Einheit als
  // Positionsersatz. Wiederholte Quellzeilen bleiben als Mengen erhalten;
  // ihre gegenläufigen Abweichungen dürfen eine Verletzung nicht verdecken.
  function mengenPositionsSchluessel(te, p) {
    const anlieferung = p.liefernummer ?? (te.anlieferungen?.length === 1 ? te.anlieferungen[0] : null);
    return JSON.stringify([te.te, anlieferung ?? null, p.nr ?? null, p.einheit ?? '']);
  }

  function istNullposition(p) { return p?.mengeIst === 0; }

  function positionsAbweichung(p) {
    const wert = Number.isFinite(p?.mengeAbweichung) ? p.mengeAbweichung
      : Number.isFinite(p?.mengeIst) && Number.isFinite(p?.mengeSoll) ? p.mengeIst-p.mengeSoll : null;
    if (wert == null) return null;
    const skala = Math.max(Math.abs(Number.isFinite(p.mengeIst) ? p.mengeIst : 0), Math.abs(Number.isFinite(p.mengeSoll) ? p.mengeSoll : 0), Math.abs(wert));
    return Math.abs(wert) <= Number.EPSILON*skala*8 ? 0 : wert;
  }

  function positionMengentreu(p, cfg = CFG_DEFAULT) {
    if (istNullposition(p)) return null;
    const abw = positionsAbweichung(p);
    if (abw == null) return null;
    if (Number.isFinite(p.mengeSoll) && p.mengeSoll !== 0) {
      return Math.abs(abw)/Math.abs(p.mengeSoll)*100 <= cfg.mengenToleranzPct;
    }
    return abw === 0;
  }

  function mengenPositionen(te, cfg = CFG_DEFAULT) {
    const normal = new Map(), nullen = new Map();
    for (const p of te.produkte ?? []) {
      const nullposition = istNullposition(p), map = nullposition ? nullen : normal;
      const key = mengenPositionsSchluessel(te, p);
      if (!map.has(key)) map.set(key, {
        key, te:te.te, teExt:te.teExt, datum:te.ankerDatum,
        geplantStart:te.geplantStart, anlieferung:p.liefernummer ?? (te.anlieferungen?.length === 1 ? te.anlieferungen[0] : null),
        nr:p.nr, name:p.name, einheit:p.einheit ?? '', nullposition,
        lieferant:p.lieferantBewertung?.label ?? te.lieferantName ?? keyTextStr(te.lieferant),
        ist:0,soll:0,abweichung:0,abweichungAbs:0,
        istVollstaendig:true,sollVollstaendig:true,abweichungVollstaendig:true,
        bewertungen:[],abweichungen:[],quellzeilen:0,
      });
      const g=map.get(key), abw=positionsAbweichung(p);
      g.quellzeilen++;
      if (Number.isFinite(p.mengeIst)) g.ist += p.mengeIst; else g.istVollstaendig=false;
      if (Number.isFinite(p.mengeSoll)) g.soll += p.mengeSoll; else g.sollVollstaendig=false;
      if (abw == null) g.abweichungVollstaendig=false;
      else { g.abweichung+=abw; g.abweichungAbs+=Math.abs(abw); if(abw!==0) g.abweichungen.push(abw); }
      if (!nullposition) g.bewertungen.push(positionMengentreu(p,cfg));
    }
    const fertig = map => [...map.values()].map(g => {
      const skala=Math.max(Math.abs(g.ist),Math.abs(g.soll),g.abweichungAbs);
      if (Math.abs(g.abweichung)<=Number.EPSILON*skala*8) g.abweichung=0;
      return {...g, mengentreu:g.nullposition ? null : g.bewertungen.some(v=>v===false) ? false
        : g.bewertungen.some(v=>v==null) ? null : true};
    });
    return {positionen:fertig(normal),nullpositionen:fertig(nullen)};
  }

  function nullpositionenListe(tes) {
    return (tes ?? []).flatMap(te => te.nullpositionen ?? mengenPositionen(te).nullpositionen)
      .sort((a,b)=>(b.datum?.getTime?.() ?? -Infinity)-(a.datum?.getTime?.() ?? -Infinity)
        || String(a.te).localeCompare(String(b.te),'de',{numeric:true})
        || String(a.anlieferung ?? '').localeCompare(String(b.anlieferung ?? ''),'de',{numeric:true})
        || String(a.nr ?? '').localeCompare(String(b.nr ?? ''),'de',{numeric:true}));
  }

  // ── Auswertungs-Kennzahlen je TE ─────────────────────────────────────────
  //
  //  Pünktlichkeit  – Ankunft am Kontrollpunkt gegen das geplante Zeitfenster.
  //                   Zu früh zählt als pünktlich (Abweichung = 0).
  //                   Nicht bewertbar ohne geplanten Start oder ohne Ankunft.
  //  Mengentreue    – jede reguläre Position muss die Mengentoleranz erfüllen.
  //                   Ist=0 separat ausgeschlossen; keine Nettokompensation.
  //  Abweichende Menge – Summe der Positionsbeträge; Netto separat je Einheit.
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
    const posDaten=mengenPositionen(te,cfg);
    te.mengenPositionen=posDaten.positionen;
    te.nullpositionen=posDaten.nullpositionen;
    const mengenGruppen = new Map();
    for (const p of te.mengenPositionen) {
      const einheit=isNull(p.einheit) ? '' : String(p.einheit).trim();
      if (!mengenGruppen.has(einheit)) mengenGruppen.set(einheit,{
        einheit,ist:0,soll:0,abweichung:0,abweichungAbs:0,positionen:[],
        istVollstaendig:true,sollVollstaendig:true,abweichungVollstaendig:true
      });
      const g=mengenGruppen.get(einheit);g.positionen.push(p);
      for (const [wert,voll] of [['ist','istVollstaendig'],['soll','sollVollstaendig'],['abweichung','abweichungVollstaendig']]) {
        g[wert]+=p[wert];g[voll]=g[voll] && p[voll];
      }
      g.abweichungAbs+=p.abweichungAbs;
    }
    te.mengenGruppen=[...mengenGruppen.values()].map(g=>{
      const epsilon=Number.EPSILON*Math.max(Math.abs(g.ist),Math.abs(g.soll),g.abweichungAbs)*8;
      if (Math.abs(g.abweichung)<=epsilon) g.abweichung=0;
      const pct=g.abweichungVollstaendig && g.sollVollstaendig && g.soll!==0 ? g.abweichung/g.soll*100 : null;
      return {...g,pct,mengentreu:g.positionen.some(p=>p.mengentreu===false) ? false
        : g.positionen.some(p=>p.mengentreu==null) ? null : true};
    });
    const einzel=te.mengenGruppen.length===1 ? te.mengenGruppen[0] : null;
    te.mengeIst=einzel?.istVollstaendig ? einzel.ist : null;
    te.mengeSoll=einzel?.sollVollstaendig ? einzel.soll : null;
    te.abweichendeMenge=einzel?.abweichungVollstaendig ? einzel.abweichung : null;
    te.abweichendeMengeAbs=einzel?.abweichungVollstaendig ? einzel.abweichungAbs : null;
    te.mengenAbwPct=einzel?.pct ?? (einzel?.abweichungVollstaendig && einzel.abweichung===0 ? 0 : null);
    te.mengentreu=te.mengenGruppen.some(g=>g.mengentreu===false) ? false
      : !te.mengenPositionen.length || te.mengenGruppen.some(g=>g.mengentreu==null) ? null : true;

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
    const nullPos = pos.filter(p => p.bestand === 0);
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

    const unbekannterBestand=pos.filter(p=>p.bestand==null);
    if (unbekannterBestand.length) w.push({typ:'bestand_nb',icon:'📦',farbe:'info',label:'Bestand n. b.',tooltip:`${unbekannterBestand.length} von ${n} Positionen ohne Bestandsdaten`});

    // 6) TE-Hinweis — Freitext.
    if (!isNull(te.teHinweis)) {
      w.push({
        typ: 'hinweis', icon: '📝', farbe: 'info',
        label: 'Hinweis',
        tooltip: te.teHinweis,
      });
    }

    // 7) Mengenabweichung — neue Kennzahl, auch im Detail sichtbar machen.
    if (te.mengenPositionen?.some(p=>p.abweichungAbs>0) || te.abweichendeMenge != null && te.abweichendeMenge !== 0) {
      w.push({
        typ: 'menge', icon: '⚖', farbe: 'warn',
        label: 'Mengenabweichung',
        tooltip: `Positionsabweichungen (Beträge; Netto separat): ${te.mengenGruppen?.length ? te.mengenGruppen.filter(g=>g.abweichungVollstaendig).map(g=>`${fmtMenge(g.abweichungAbs)} ${g.einheit||'ohne Einheit'} (netto ${fmtDelta(g.abweichung)})`).join(' · ') : fmtDelta(te.abweichendeMenge)}`
               + (te.mengeSoll != null ? ` (Soll ${fmtMenge(te.mengeSoll)} / Ist ${te.mengeIst == null ? 'n. b.' : fmtMenge(te.mengeIst)})` : ''),
      });
    }

    if (te.nullpositionen?.length) w.push({typ:'nullpositionen',icon:'ⓘ',farbe:'info',label:'Nullpositionen ausgeschlossen',
      tooltip:`${te.nullpositionen.length} Position(en) mit Ist=0; aus Mengentreue und Mengenabweichungswertung ausgeschlossen. Originaldaten bleiben in den Details sichtbar.`});
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

  // Anlieferungs-OTIF: Belegnummer einmal über alle geladenen beteiligten TEs.
  // Jede reguläre Positionsabweichung zählt, unabhängig von der TE-Toleranz.
  function anlieferungsOtif(tes, alleTes=tes) {
    const nummern=te=>[...new Set([...(te.anlieferungen ?? []),...(te.produkte ?? []).map(p=>p.liefernummer)].filter(n=>!isNull(n)).map(String))];
    const auswahl=new Set((tes ?? []).flatMap(nummern)),auswahlTes=new Set((tes ?? []).map(te=>te.te));
    const relevant=(alleTes ?? []).filter(te=>auswahlTes.has(te.te)||nummern(te).some(n=>auswahl.has(n)));
    const gruppen=new Map();let fehlendeBelegPositionen=0,tesOhneBeleg=0,fehlendeProdukte=0,nichtZuordenbareNullpositionen=0;
    const gruppe=(nr,te)=>{
      if(!auswahl.has(nr))return null;
      if(!gruppen.has(nr))gruppen.set(nr,{beleg:nr,tes:new Map(),bewertungen:[],positionen:new Set(),nullpositionen:new Set(),quellzeilen:0,zuordnungUnklar:false});
      const g=gruppen.get(nr);g.tes.set(te.te,te);return g;
    };
    for(const te of relevant) {
      const belege=nummern(te);for(const nr of belege)gruppe(nr,te);
      if(!belege.length)tesOhneBeleg++;
      for(const p of te.produkte ?? []) {
        const nr=!isNull(p.liefernummer)?String(p.liefernummer):belege.length===1?belege[0]:null;
        if(nr==null){
          if(istNullposition(p)){nichtZuordenbareNullpositionen++;continue;}
          fehlendeBelegPositionen++;
          for(const kandidat of belege){const g=gruppe(kandidat,te);if(g)g.zuordnungUnklar=true;}
          continue;
        }
        const g=gruppe(nr,te);if(!g)continue;
        const key=JSON.stringify([p.nr ?? null,p.einheit ?? '']);g.quellzeilen++;
        if(isNull(p.nr))fehlendeProdukte++;
        if(istNullposition(p)){g.nullpositionen.add(key);continue;}
        g.positionen.add(key);const abw=positionsAbweichung(p);g.bewertungen.push(abw==null?null:abw===0);
      }
    }
    const belege=[...gruppen.values()].map(g=>{
      const teListe=[...g.tes.values()],ausgeschlossen=g.quellzeilen>0&&!g.bewertungen.length&&!g.zuordnungUnklar;
      const mengenOk=g.bewertungen.some(v=>v===false)?false:g.zuordnungUnklar||!g.bewertungen.length||g.bewertungen.some(v=>v==null)?null:true;
      const puenktlich=teListe.some(te=>te.puenktlich===false)?false:teListe.some(te=>te.puenktlich==null)?null:true;
      const otif=ausgeschlossen?null:mengenOk===false||puenktlich===false?false:mengenOk==null||puenktlich==null?null:true;
      return {beleg:g.beleg,tes:teListe,positionen:g.positionen.size,nullpositionen:g.nullpositionen.size,
        ausgeschlossen,mengentreu:mengenOk,puenktlich,otif,zuordnungUnklar:g.zuordnungUnklar};
    }).sort((a,b)=>a.beleg.localeCompare(b.beleg,'de',{numeric:true}));
    const regulaer=belege.filter(g=>!g.ausgeschlossen);
    return {belege,anzahl:belege.length,regulaer:regulaer.length,ausgeschlossen:belege.length-regulaer.length,
      quote:quote(regulaer,'otif'),fehlendeBelegPositionen,tesOhneBeleg,fehlendeProdukte,nichtZuordenbareNullpositionen};
  }

  // Aggregiert einen Satz TEs zu allen fünf Kennzahlen. Das identische Gerüst
  // wird sowohl für die Gesamtsumme als auch je Ladestelle verwendet, damit
  // die Hover-Aufschlüsselung exakt dieselbe Rechnung nutzt wie die Karte.
  function aggregiereBasis(tes) {
    const dlz = tes.map(t => t.durchlaufzeitMin).filter(v => v != null);
    const dlzSum = dlz.reduce((s, v) => s + v, 0);

    let summeAbs = 0, netto = 0, betroffen = 0, mengeBewertbar = 0;
    const einheiten=new Map();
    for (const te of tes) {
      const gruppen=te.mengenGruppen ?? (Number.isFinite(te.abweichendeMenge) ? [{einheit:'',abweichung:te.abweichendeMenge,abweichungVollstaendig:true}] : []);
      if (!gruppen.length || gruppen.some(g=>!g.abweichungVollstaendig)) continue;
      mengeBewertbar++;
      if (gruppen.some(g=>(g.abweichungAbs ?? Math.abs(g.abweichung))>0)) betroffen++;
      for (const g of gruppen) {
        if (!einheiten.has(g.einheit)) einheiten.set(g.einheit,{einheit:g.einheit,wert:0,netto:0});
        const betrag=g.abweichungAbs ?? Math.abs(g.abweichung);
        const e=einheiten.get(g.einheit);e.wert+=betrag;e.netto+=g.abweichung;
        summeAbs+=betrag;netto+=g.abweichung;
      }
    }

    return {
      anzahl:     tes.length,
      nullpositionen:{anzahl:tes.reduce((n,te)=>n+(te.nullpositionen?.length ?? 0),0),
        tes:tes.filter(te=>te.nullpositionen?.length).length,
        nurNullTes:tes.filter(te=>te.nullpositionen?.length && !te.mengenPositionen?.length).length},
      otif:       quote(tes, 'otif'),
      puenktlich: quote(tes, 'puenktlich'),
      mengentreu: quote(tes, 'mengentreu'),
      durchlaufzeit: {
        wert:      dlz.length ? dlzSum / dlz.length : null,
        bewertbar: dlz.length,
        nb:        tes.length - dlz.length,
        min:       dlz.length ? dlz.reduce((a,b)=>Math.min(a,b),Infinity) : null,
        max:       dlz.length ? dlz.reduce((a,b)=>Math.max(a,b),-Infinity) : null,
      },
      abwMenge: {
        wert:      mengeBewertbar && einheiten.size<=1 ? summeAbs : null,   // Summe der Beträge
        netto:     mengeBewertbar && einheiten.size<=1 ? netto : null,
        einheiten: [...einheiten.values()],
        betroffen,
        bewertbar: mengeBewertbar,
        nb:        tes.length - mengeBewertbar,
      },
    };
  }

  function aggregiere(tes) {
    const gesamt = aggregiereBasis(tes);

    // ── Aufschlüsselung je Ladestelle ──
    // Feste Reihenfolge BSL · Container · Landverkehr · Nicht zugeordnet.
    // Jede TE fällt genau einmal in eine Gruppe; fehlende/unbekannte BW-Werte
    // werden dabei als Nicht zugeordnet sichtbar statt BSL zugeschlagen.
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

  // Prozesszeiten: pro TE; Entladung endet regulär, Vereinnahmung beginnt beim tatsächlichen Entladeende.
  const PROZESS_DEFS = Object.freeze([
    { id: 'anmeldung', label: 'Anmeldung / Wartezeit', von: 'tsAnkunft', bis: 'tsAngedockt', strecke: 'Ankunft → Andocken' },
    { id: 'vorlauf', label: 'Entladevorlauf', von: 'tsAngedockt', bis: 'tsEntladenStart', strecke: 'Andocken → Entladestart' },
    { id: 'entladung', label: 'Entladedauer', von: 'tsEntladenStart', bis: 'tsEntladenEnde', strecke: 'Entladestart → Entladen beendet' },
    { id: 'vereinnahmung', label: 'Vereinnahmungsdauer', von: 'tsEntladenTat', bis: 'tsWeBuchung', strecke: 'Tats. Entladen beendet → WE gebucht' },
    { id: 'einlagerung', label: 'Einlagerungsdauer', von: 'tsWeBuchung', bis: 'tsEinlagerung', strecke: 'WE-Buchung → vollständige Fertigstellung' },
    { id: 'operativ', label: 'Operative WE-Durchlaufzeit', von: 'tsEntladenStart', bis: 'tsEinlagerung', strecke: 'Entladestart → vollständige Fertigstellung', gesamt: true },
    { id: 'gesamt', label: 'Gesamtdurchlaufzeit', von: 'tsAnkunft', bis: 'tsEinlagerung', strecke: 'Ankunft → vollständige Fertigstellung', gesamt: true },
  ]);

  const TE_ZEITSTRAHL_PHASES = Object.freeze(PROZESS_DEFS.filter(def => !def.gesamt));
  const TE_ZEITSTRAHL_MAX_ZEILEN = 100;
  const TE_ZEITSTRAHL_PX_PRO_STUNDE = 64;

  function durchlaufzeitTrend(tes, id = 'gesamt') {
    const def = PROZESS_DEFS.find(d => d.id === id && d.gesamt);
    if (!def) return [];
    const tage = new Map();
    for (const te of tes) {
      const tag = datumSchluessel(te.ankerDatum);
      if (!tag) continue;
      if (!tage.has(tag)) tage.set(tag, {tag, datum:new Date(`${tag}T00:00:00Z`), werte:[], fehlend:0, ungueltig:0});
      const t = tage.get(tag), dauer = prozessDauer(te, def);
      if (dauer.grund === 'fehlend') t.fehlend++;
      else if (dauer.grund === 'ungueltig') t.ungueltig++;
      else t.werte.push(dauer.min);
    }
    return [...tage.values()].sort((a,b) => a.tag.localeCompare(b.tag)).map(t => {
      const werte = t.werte.sort((a,b) => a-b), n = werte.length;
      return {tag:t.tag, datum:t.datum, n, fehlend:t.fehlend, ungueltig:t.ungueltig,
        mittel:n ? werte.reduce((sum,v) => sum+v, 0)/n : null,
        median:n ? n%2 ? werte[(n-1)/2] : (werte[n/2-1]+werte[n/2])/2 : null};
    });
  }

  // Gemeinsame Kalenderachse: kurze Punktdaten, ab >120 Tagen Monatsmarken.
  // Jahresabschnitte und Grenzen beruhen auf UTC wie die Zeitraumzuordnung.
  // Tageswerte und vollständige Datumsangaben in Punkt-Tooltips bleiben bestehen.
  function trendDatumsAchse(punkte, achseY, labelY, plotTop = 50, links = 78, rechts = 922) {
    if (!punkte.length) return '';
    const erster = punkte[0], letzter = punkte[punkte.length - 1];
    const von = erster.datum.getTime(), bis = letzter.datum.getTime();
    const x = ms => von === bis ? erster.x : erster.x + (ms-von)*(letzter.x-erster.x)/(bis-von);
    const monatsmodus = bis-von > 120*86400000;
    const monate = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    let kandidaten = punkte.map(p => ({...p, label:`${String(p.datum.getUTCDate()).padStart(2,'0')}.${String(p.datum.getUTCMonth()+1).padStart(2,'0')}.`}));
    if (monatsmodus) {
      kandidaten = [];
      const monat = new Date(Date.UTC(erster.datum.getUTCFullYear(), erster.datum.getUTCMonth(), 1));
      while (monat.getTime() <= bis) {
        const ms = Math.max(von,monat.getTime());
        kandidaten.push({datum:new Date(ms),x:x(ms),label:monate[monat.getUTCMonth()]});
        monat.setUTCMonth(monat.getUTCMonth()+1);
      }
    }
    const mindestabstand = monatsmodus ? 52 : 64;
    const letzteMarke = kandidaten[kandidaten.length-1];
    let letzteBeschriftung = -Infinity;
    const unten = kandidaten.map((punkt, i) => {
      if (i === kandidaten.length - 1 && i > 0 && punkt.x - kandidaten[0].x < mindestabstand) return '';
      const rand = i === 0 || i === kandidaten.length - 1;
      if (!rand && (punkt.x - letzteBeschriftung < mindestabstand || letzteMarke.x - punkt.x < mindestabstand)) return '';
      letzteBeschriftung = punkt.x;
      const px = punkt.x.toFixed(1);
      return `<line class="lb-chart-date-tick" x1="${px}" y1="${achseY}" x2="${px}" y2="${achseY + 8}"></line>
        <text class="lb-chart-label" x="${px}" y="${labelY}" text-anchor="middle">${punkt.label}</text>`;
    }).join('');
    const jahrVon = erster.datum.getUTCFullYear(), jahrBis = letzter.datum.getUTCFullYear();
    const oben = [];
    for (let jahr=jahrVon; jahr<=jahrBis; jahr++) {
      const beginn = Date.UTC(jahr,0,1), ende = Date.UTC(jahr+1,0,1);
      const startX = jahr === jahrVon ? links : x(beginn);
      const endeX = jahr === jahrBis ? rechts : x(ende);
      const breite = endeX-startX;
      const schmal = breite < 56;
      const anchor = schmal ? jahr === jahrVon ? 'start' : 'end' : 'middle';
      const mitte = schmal ? jahr === jahrVon ? startX : endeX : (startX+endeX)/2;
      oben.push(`<text class="lb-chart-year" x="${mitte.toFixed(1)}" y="${plotTop-22}" text-anchor="${anchor}">${jahr}</text>`);
      if (jahr > jahrVon) {
        const px = x(beginn).toFixed(1);
        oben.push(`<line class="lb-chart-year-boundary" x1="${px}" y1="${plotTop-12}" x2="${px}" y2="${achseY}"><title>Jahreswechsel 01.01.${jahr}</title></line>`);
      }
    }
    return oben.join('') + unten;
  }

  function datumSchluessel(datum) {
    if (!(datum instanceof Date) || !Number.isFinite(datum.getTime())) return null;
    const y = datum.getUTCFullYear();
    const m = String(datum.getUTCMonth() + 1).padStart(2, '0');
    const d = String(datum.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function teZeitstrahlDaten(tes, gewuenschtesDatum = null) {
    const tageMap = new Map();
    for (const te of tes) {
      const tag = datumSchluessel(te.ankerDatum);
      if (tag == null) continue;
      if (!tageMap.has(tag)) tageMap.set(tag, []);
      tageMap.get(tag).push(te);
    }
    const tage = [...tageMap.keys()].sort();
    const datum = gewuenschtesDatum && tageMap.has(gewuenschtesDatum)
      ? gewuenschtesDatum : (tage.length ? tage[tage.length - 1] : null);
    const kandidaten = datum == null ? [] : tageMap.get(datum);
    let fehlend = 0, ungueltig = 0;
    const zeilen = [];
    const gesamtDef = PROZESS_DEFS.find(def => def.id === 'gesamt');
    for (const te of kandidaten) {
      const gesamt = prozessDauer(te, gesamtDef);
      if (gesamt.grund === 'fehlend') { fehlend++; continue; }
      if (gesamt.grund === 'ungueltig') { ungueltig++; continue; }
      const segmente = TE_ZEITSTRAHL_PHASES.map((def, index) => {
        const dauer = prozessDauer(te, def);
        return dauer.grund ? null : {
          id: def.id, label: def.label, index,
          startMs: te[def.von].getTime(), endeMs: te[def.bis].getTime(), min: dauer.min,
        };
      }).filter(seg=>seg && seg.startMs>=te.tsAnkunft.getTime() && seg.endeMs<=te.tsEinlagerung.getTime());
      zeilen.push({ te, startMs: te.tsAnkunft.getTime(), endeMs: te.tsEinlagerung.getTime(),
        dauerMin: gesamt.min, segmente });
    }
    zeilen.sort((a, b) => a.startMs - b.startMs || String(a.te.te).localeCompare(String(b.te.te), 'de'));
    const alleZeilen = zeilen.length;
    const sichtbar = zeilen.slice(0, TE_ZEITSTRAHL_MAX_ZEILEN);
    if (!sichtbar.length) return { tage, datum, kandidaten: kandidaten.length, fehlend, ungueltig,
      alleZeilen, weitere: 0, zeilen: [], startMs: null, endeMs: null, ticks: [], breitePx: 900 };

    const stunde = 3600000;
    const startMs = Math.floor(Math.min(...sichtbar.map(z => z.startMs)) / stunde) * stunde;
    let endeMs = Math.ceil(Math.max(...sichtbar.map(z => z.endeMs)) / stunde) * stunde;
    if (endeMs <= startMs) endeMs = startMs + stunde;
    const stunden = (endeMs - startMs) / stunde;
    const ticks = [];
    if (stunden>24*90) return {tage,datum,kandidaten:kandidaten.length,fehlend,ungueltig,alleZeilen,weitere:alleZeilen-sichtbar.length,zeilen:sichtbar,startMs,endeMs,ticks,breitePx:900,zuLang:true};
    // Fester Stundentakt – auch bei mehrtägigen Durchläufen. Die Achse wird
    // entsprechend breit und bleibt über den bestehenden Scrollbereich
    // bedienbar, statt die Stundenbeschriftung automatisch auszudünnen.
    for (let ms = startMs; ms <= endeMs; ms += stunde) ticks.push(ms);
    const [jahr, monat, tag] = datum.split('-').map(Number);
    const schichtMs = Date.UTC(jahr, monat - 1, tag, 14, 30);
    const schichtMarkers=[];
    for(let ms=Date.UTC(new Date(startMs).getUTCFullYear(),new Date(startMs).getUTCMonth(),new Date(startMs).getUTCDate(),14,30);ms<=endeMs;ms+=TAG_MS) if(ms>=startMs) schichtMarkers.push(ms);
    return { tage, datum, kandidaten: kandidaten.length, fehlend, ungueltig, alleZeilen,
      schichtMarkers, weitere: Math.max(0, alleZeilen - sichtbar.length), zeilen: sichtbar, startMs, endeMs, ticks,
      schichtMs, schichtSichtbar: schichtMs >= startMs && schichtMs <= endeMs,
      breitePx: Math.round(Math.max(900, stunden * TE_ZEITSTRAHL_PX_PRO_STUNDE)) };
  }

  function prozessDauer(te, def) {
    const von = te[def.von], bis = te[def.bis];
    if (von == null || bis == null) return { min: null, grund: 'fehlend' };
    const a = von.getTime(), b = bis.getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return { min: null, grund: 'ungueltig' };
    return { min: (b - a) / 60000, grund: null };
  }

  function aggregiereProzesszeiten(tes) {
    return PROZESS_DEFS.map(def => {
      const werte = [];
      let fehlend = 0, ungueltig = 0;
      for (const te of tes) {
        const p = prozessDauer(te, def);
        if (p.grund === 'fehlend') fehlend++;
        else if (p.grund === 'ungueltig') ungueltig++;
        else werte.push(p.min);
      }
      werte.sort((a, b) => a - b);
      const n = werte.length, m = Math.floor(n / 2);
      return { ...def, gesamtTEs: tes.length, n, fehlend, ungueltig,
        mittel: n ? werte.reduce((a, b) => a + b, 0) / n : null,
        median: n ? (n % 2 ? werte[m] : (werte[m - 1] + werte[m]) / 2) : null,
        min: n ? werte[0] : null, max: n ? werte[n - 1] : null };
    });
  }

  // Transportmittel ist ein eigenes BW-Merkmal, unabhängig von der Ladestelle.
  // Gruppierung auf TE-Ebene nach Schlüssel; fehlende Werte bleiben sichtbar.
  function aggregiereTransportzeiten(tes) {
    const gruppen = new Map();
    for (const te of tes) {
      const raw = te.transportmittel == null ? '' : String(te.transportmittel).trim();
      const key = isNull(raw) ? null : raw;
      const text = te.transportmittelName == null ? '' : String(te.transportmittelName).trim();
      if (!gruppen.has(key)) gruppen.set(key, {
        key, label: key === null ? 'Ohne Transportmittel' : (isNull(text) ? key : text), tes: []
      });
      gruppen.get(key).tes.push(te);
    }
    return [...gruppen.values()].map(g => ({
      key: g.key, label: g.label, anzahl: g.tes.length,
      prozesse: aggregiereProzesszeiten(g.tes)
    })).sort((a,b) => a.key === null ? 1 : b.key === null ? -1 :
      a.label.localeCompare(b.label, 'de', {numeric:true}) || a.key.localeCompare(b.key, 'de', {numeric:true}));
  }

  function sortiereTransportgruppen(gruppen, feld, richtung, modus) {
    return [...gruppen].sort((a,b) => {
      if (feld === 'name') return richtung * a.label.localeCompare(b.label, 'de', {numeric:true}) ||
        String(a.key ?? '').localeCompare(String(b.key ?? ''), 'de');
      const av = a.prozesse.find(p=>p.id===feld)?.[modus] ?? null;
      const bv = b.prozesse.find(p=>p.id===feld)?.[modus] ?? null;
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
      return (av == null ? 0 : richtung*(av-bv)) || a.label.localeCompare(b.label,'de',{numeric:true}) ||
        String(a.key ?? '').localeCompare(String(b.key ?? ''),'de');
    });
  }

  function transportFarbklasse(wert, werte) {
    if (wert == null) return 'pz-empty';
    const gueltig = werte.filter(v=>v != null);
    if (!gueltig.length) return 'pz-empty';
    const min = gueltig.reduce((a,b)=>Math.min(a,b),Infinity);
    const max = gueltig.reduce((a,b)=>Math.max(a,b),-Infinity);
    return 'pz-heat-' + (max === min ? 2 : Math.min(4, Math.floor((wert-min)/(max-min)*5)));
  }

  function fmtAbweichungMin(min) {
    return min == null ? '–' : min.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' min';
  }

  function fmtProzessMin(min) {
    return min == null ? '–' : min.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' min';
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
        --c-text3:      #626979;
        --c-green:      #137a42;
        --c-yellow:     #9c5b00;
        --c-blue:       #176ba0;
        --c-red-light:  #a82b22;
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
        container-type: inline-size;
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
      .ls-unmapped { background:rgba(100,116,139,.16); color:var(--c-text2); }
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
         auto-fit sorgt dafür, dass die vier Überblickskarten je nach Breite
         umbrechen — ohne Media Queries. */
      .kpi-cards {
        display:               grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap:                   10px;
      }

      .ls-verteilung { margin-top:12px; padding:14px 18px; border:1px solid var(--c-border);
        border-radius:var(--r-lg); background:var(--c-bg2); }
      .ls-verteilung > summary { cursor:pointer; color:var(--c-text); font-size:13px;
        font-weight:700; list-style:revert; }
      .ls-verteilung > summary:focus-visible { outline:2px solid var(--c-blue); outline-offset:4px; }
      .ls-verteilung[open] .ls-verteilung-geschlossen { display:none; }
      .ls-verteilung:not([open]) .ls-verteilung-offen { display:none; }
      .ls-verteilung-sub { margin-top:4px; color:var(--c-text2); font-size:11px; }
      .ls-verteilung-inhalt { display:grid; grid-template-columns:180px minmax(0,1fr);
        align-items:center; gap:24px; max-width:790px; margin:12px auto 0; }
      .ls-verteilung-grafik { display:block; width:180px; height:180px; }
      .ls-verteilung-legende { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px; padding:0; margin:0; list-style:none; }
      .ls-verteilung-legende li { display:grid; grid-template-columns:10px minmax(0,1fr);
        align-items:center; gap:5px 9px; min-width:0; padding:10px 12px;
        border:1px solid var(--c-border); border-radius:var(--r-md);
        background:var(--c-bg3); color:var(--c-text2); font-size:12px; }
      .ls-verteilung-punkt { width:10px; height:10px; border-radius:50%; flex:0 0 10px; }
      .ls-verteilung-name { min-width:0; overflow-wrap:anywhere; }
      .ls-verteilung-wert { grid-column:2; color:var(--c-text); font:600 13px var(--font-mono); white-space:nowrap; }
      @container (max-width:690px) { .ls-verteilung-inhalt { grid-template-columns:1fr; gap:14px; }
        .ls-verteilung-grafik { margin:auto; } }
      @container (max-width:390px) { .ls-verteilung-legende { grid-template-columns:1fr; } }

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
      .zs-event-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; margin:10px 0; }
      .zs-event { padding:10px; background:var(--c-bg3); border:1px solid var(--c-border); border-radius:6px; }
      .zs-event strong, .zs-event span { display:block; font-size:11px; line-height:1.6; }
      .zs-event span { font-family:var(--font-mono); color:var(--c-text2); }
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


      /* Prozesszeiten-Widgets 2.1.2 */
      #prozesszeiten { container-type:inline-size; }
      .pz-dashboard { display:grid; grid-template-columns:minmax(0,2fr) minmax(230px,1fr); gap:16px; }
      .pz-chart, .pz-card, .pz-info { background:var(--c-bg2); border:1px solid var(--c-border); border-radius:var(--r-lg); box-shadow:var(--shadow-sm); }
      .pz-chart { padding:22px; min-width:0; }
      .pz-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-bottom:24px; }
      .pz-title { font-size:16px; font-weight:650; color:var(--c-text); }
      .pz-sub { color:var(--c-text2); font-size:11px; line-height:1.6; margin-top:5px; }
      .pz-switch { display:flex; padding:3px; gap:3px; background:var(--c-bg); border:1px solid var(--c-border); border-radius:8px; }
      .pz-switch button { padding:7px 10px; border-radius:5px; color:var(--c-text2); font-size:11px; }
      .pz-switch button[aria-pressed="true"] { background:var(--c-bg4); color:var(--c-text); box-shadow:var(--shadow-sm); }
      .pz-plot-row { display:grid; width:100%; grid-template-columns:154px minmax(40px,1fr) 80px; align-items:center; gap:12px; padding:16px 10px; margin:5px 0; border:1px solid transparent; border-radius:8px; text-align:left; color:var(--c-text); }
      .pz-plot-row:hover { background:var(--c-bg3); }
      .pz-plot-row[aria-pressed="true"] { background:var(--c-bg3); border-color:var(--c-border2); }
      .pz-plot-row:focus-visible, .pz-switch button:focus-visible { outline:2px solid var(--c-blue); outline-offset:2px; }
      .pz-phase { font-size:12px; font-weight:600; line-height:1.5; }
      .pz-step { font-family:var(--font-mono); font-size:9px; color:var(--c-text3); display:block; font-weight:400; letter-spacing:1px; }
      .pz-track { height:24px; background:var(--c-bg); border-radius:5px; overflow:hidden; background-image:linear-gradient(to right,var(--c-border) 1px,transparent 1px); background-size:25% 100%; }
      .pz-bar { height:100%; border-radius:4px; background:var(--c-blue); transition:width .2s ease; }
      .pz-bar.pz-longest { background:var(--c-red-light); }
      .pz-chart-value { font-size:14px; font-family:var(--font-mono); font-weight:600; text-align:right; }
      .pz-axis { display:grid; grid-template-columns:154px minmax(40px,1fr) 80px; gap:12px; padding:0 10px; }
      .pz-ticks { display:flex; justify-content:space-between; color:var(--c-text3); font:10px var(--font-mono); }
      .pz-legend { display:flex; gap:16px; flex-wrap:wrap; color:var(--c-text2); font-size:10px; margin:20px 0 0; }
      .pz-dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:6px; background:var(--c-blue); }
      .pz-dot.red { background:var(--c-red-light); }
      .pz-side { display:flex; flex-direction:column; gap:16px; }
      .pz-card { padding:20px; }
      .pz-total { border-top:3px solid var(--c-red); }
      .pz-overall { border-top-color:var(--c-blue); }
      .pz-totals { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
      .pz-cohort-note { margin:10px 0 18px; }
      @container (max-width:520px) { .pz-totals { grid-template-columns:1fr; } }
      .pz-kicker { font:10px var(--font-mono); text-transform:uppercase; letter-spacing:1.2px; color:var(--c-text2); }
      .pz-big { font:600 38px var(--font-mono); letter-spacing:-1.5px; margin:12px 0 4px; color:var(--c-text); }
      .pz-big small { font:12px var(--font); letter-spacing:0; color:var(--c-text2); }
      .pz-pill { display:inline-block; color:var(--c-text2); font-size:10px; border:1px solid var(--c-border2); border-radius:12px; padding:4px 8px; margin-top:12px; }
      .pz-inspector { flex:1; }
      .pz-metrics { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:18px 0 14px; }
      .pz-metric span { display:block; color:var(--c-text3); font-size:10px; margin-bottom:5px; }
      .pz-metric strong { color:var(--c-text); font:600 14px var(--font-mono); }
      .pz-coverage { height:5px; border-radius:3px; overflow:hidden; background:var(--c-bg4); margin:8px 0; }
      .pz-coverage div { height:100%; background:var(--c-blue); }
      .pz-info { margin-top:16px; padding:14px 18px; color:var(--c-text2); font-size:11px; line-height:1.7; }
      .pz-info summary { cursor:pointer; color:var(--c-text); font-weight:600; }
      .pz-scroll { overflow-x:auto; margin:14px 0; }
      .pz-table { border-collapse:collapse; width:100%; font-size:11px; white-space:nowrap; }
      .pz-table th, .pz-table td { padding:9px 12px; border-bottom:1px solid var(--c-border); text-align:right; }
      .pz-table th:first-child, .pz-table td:first-child { text-align:left; }
      .pz-table th { color:var(--c-text3); font-weight:500; }
      .pz-detail { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }
      .pz-detail-item { background:var(--c-bg2); border:1px solid var(--c-border); border-radius:var(--r-md); padding:16px; }
      .pz-name { font-size:12px; font-weight:600; }
      .pz-route, .pz-stats, .pz-note { font-size:11px; color:var(--c-text2); line-height:1.6; margin-top:6px; }
      .pz-value { font:600 24px var(--font-mono); margin-top:12px; }
      @container (max-width:850px) { .pz-dashboard { grid-template-columns:1fr; } .pz-side { display:grid; grid-template-columns:1fr; } }
      @container (max-width:520px) { .pz-chart { padding:14px; } .pz-plot-row, .pz-axis { grid-template-columns:105px minmax(30px,1fr) 66px; gap:8px; padding-left:0; padding-right:0; } .pz-phase { font-size:11px; } .pz-chart-value { font-size:12px; } .pz-side { grid-template-columns:1fr; } }


      .pz-transport { margin-top:18px; padding:22px; background:var(--c-bg2); border:1px solid var(--c-border); border-radius:var(--r-lg); box-shadow:var(--shadow-sm); }
      .pz-matrix-scroll { overflow-x:auto; margin-top:20px; border:1px solid var(--c-border); border-radius:8px; }
      .pz-matrix { width:100%; min-width:1040px; border-collapse:separate; border-spacing:0; table-layout:fixed; }
      .pz-matrix caption { text-align:left; padding:12px; color:var(--c-text2); font-size:11px; }
      .pz-matrix th, .pz-matrix td { padding:7px; border-bottom:1px solid var(--c-border); vertical-align:middle; }
      .pz-matrix thead th { background:var(--c-bg3); color:var(--c-text2); font-size:11px; }
      .pz-matrix th:first-child { position:sticky; left:0; width:190px; background:var(--c-bg2); z-index:1; text-align:left; border-right:1px solid var(--c-border); }
      .pz-matrix thead th:first-child { background:var(--c-bg3); z-index:2; }
      .pz-matrix tbody tr:last-child th, .pz-matrix tbody tr:last-child td { border-bottom:0; }
      .pz-matrix .pz-matrix-total { border-left:2px solid var(--c-border2); background:var(--c-bg3); }
      .pz-sort { width:100%; color:inherit; padding:8px 2px; font:600 11px var(--font); line-height:1.5; min-height:48px; }
      .pz-sort span { color:var(--c-text3); font-size:10px; margin-left:4px; }
      .pz-cell { display:block; width:100%; min-height:90px; border:1px solid transparent; border-radius:8px; padding:12px 9px; color:var(--c-text); text-align:center; }
      .pz-cell strong { display:block; font:600 15px var(--font-mono); }
      .pz-cell small { display:block; color:var(--c-text2); font-size:9px; margin-top:7px; }
      .pz-cell[aria-pressed="true"] { border-color:var(--c-red-light); box-shadow:inset 0 0 0 1px var(--c-red-light); }
      .pz-cell:hover { outline:1px solid var(--c-red-border); }
      .pz-cell:focus-visible, .pz-sort:focus-visible { outline:2px solid var(--c-red-light); outline-offset:1px; }
      .pz-heat-0 { background:rgba(192,57,43,.08); } .pz-heat-1 { background:rgba(192,57,43,.13); }
      .pz-heat-2 { background:rgba(192,57,43,.19); } .pz-heat-3 { background:rgba(192,57,43,.25); }
      .pz-heat-4 { background:rgba(192,57,43,.33); } .pz-empty { background:var(--c-bg3); color:var(--c-text3); }
      .pz-tm-label { font-size:12px; font-weight:600; overflow-wrap:anywhere; }
      .pz-cell-track { display:block; height:6px; margin:10px 0 7px; border-radius:4px; background:var(--c-red-dim); overflow:hidden; }
      .pz-cell-fill { display:block; height:100%; border-radius:4px; background:var(--c-red-light); }
      .pz-empty .pz-cell-track { background:var(--c-border); }
      .pz-empty .pz-cell-fill { background:transparent; }
      .pz-transport .pz-switch button[aria-pressed="true"] { background:var(--c-red-dim); box-shadow:inset 0 0 0 1px var(--c-red-border); }
      .pz-transport .pz-switch button:focus-visible { outline-color:var(--c-red-light); }
      :host([theme="light"]) .pz-cell-fill { background:var(--c-red); }
      .pz-matrix-legend { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:14px 0 4px; font-size:10px; color:var(--c-text2); }
      .pz-scale-swatches { display:flex; gap:3px; } .pz-scale-swatches i { display:block; width:22px; height:12px; border-radius:2px; }
      .pz-matrix-detail { padding:18px; margin-top:16px; border:1px solid var(--c-border); border-radius:8px; background:var(--c-bg); }
      .pz-matrix-detail .pz-metrics { grid-template-columns:repeat(4,minmax(0,1fr)); }
      @container (max-width:520px) { .pz-transport { padding:14px; } .pz-matrix-detail .pz-metrics { grid-template-columns:1fr 1fr; } }

      .tz-widget { margin-top:18px; padding:22px; background:var(--c-bg2); border:1px solid var(--c-border); border-radius:var(--r-lg); box-shadow:var(--shadow-sm); }
      .tz-controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .tz-controls label { color:var(--c-text2); font-size:11px; }
      .tz-controls select { min-width:150px; padding:8px 10px; color:var(--c-text); background:var(--c-bg); border:1px solid var(--c-border2); border-radius:7px; font:11px var(--font); }
      .tz-scroll { overflow:auto; margin-top:18px; border:1px solid var(--c-border); border-radius:8px; background:var(--c-bg); }
      .tz-canvas { min-width:100%; padding-bottom:8px; }
      .tz-axis, .tz-row { display:grid; grid-template-columns:250px minmax(0,1fr); }
      .tz-axis { position:sticky; top:0; z-index:4; min-height:56px; background:var(--c-bg3); border-bottom:1px solid var(--c-border2); }
      .tz-axis-label { position:sticky; left:0; z-index:5; display:flex; align-items:center; padding:10px 12px; color:var(--c-text2); background:var(--c-bg3); border-right:1px solid var(--c-border2); font:10px var(--font-mono); }
      .tz-axis-track, .tz-track { position:relative; min-width:0; }
      .tz-axis-track { height:56px; }
      .tz-tick { position:absolute; top:0; bottom:0; width:1px; background:var(--c-border2); }
      .tz-tick span { position:absolute; top:11px; left:5px; white-space:nowrap; color:var(--c-text2); font:10px var(--font-mono); }
      .tz-tick.tz-day-change { width:2px; background:var(--c-text3); }
      .tz-tick span b, .tz-tick span em { display:block; font-style:normal; line-height:1.35; }
      .tz-tick span b { color:var(--c-text); font-weight:600; }
      .tz-tick.tz-last span { left:-5px; transform:translateX(-100%); }
      .tz-shift-axis { position:absolute; top:0; bottom:0; z-index:2; width:3px; background:var(--c-red-light); box-shadow:0 0 0 1px var(--c-red-dim); }
      .tz-shift-axis span { position:absolute; left:7px; bottom:5px; padding:3px 6px; white-space:nowrap; color:var(--c-text); background:var(--c-red-dim); border:1px solid var(--c-red-border); border-radius:4px; font:600 9px var(--font); }
      .tz-row { width:100%; min-height:88px; padding:0; color:var(--c-text); text-align:left; border-bottom:1px solid var(--c-border); }
      .tz-row:last-child { border-bottom:0; }
      .tz-row:hover { background:var(--c-bg3); }
      .tz-row:focus-visible { outline:2px solid var(--c-red-light); outline-offset:-2px; }
      .tz-row-label { position:sticky; left:0; z-index:3; display:flex; flex-direction:column; justify-content:center; gap:4px; min-width:0; padding:9px 12px; background:var(--c-bg2); border-right:1px solid var(--c-border2); }
      .tz-row:hover .tz-row-label { background:var(--c-bg3); }
      .tz-row-label strong { font:600 12px var(--font-mono); }
      .tz-row-label small { color:var(--c-text2); font-size:9px; }
      .tz-row-facts { display:flex; flex-wrap:wrap; gap:3px 8px; color:var(--c-text); font:600 10px var(--font-mono); }
      .tz-row-facts span + span::before { content:'·'; margin-right:8px; color:var(--c-text3); }
      .tz-row-pack { display:block; max-width:100%; overflow:hidden; color:var(--c-text2); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
      .tz-row-pack b { color:var(--c-text); font-weight:600; }
      .tz-track { margin:26px 0; height:36px; background-image:linear-gradient(to right,var(--c-border) 1px,transparent 1px); background-size:var(--tz-hour-width,100%) 100%; background-repeat:repeat-x; }
      .tz-gridline { position:absolute; top:-26px; bottom:-26px; width:1px; background:var(--c-border); pointer-events:none; }
      .tz-shiftline { position:absolute; top:-26px; bottom:-26px; z-index:2; width:3px; background:var(--c-red-light); box-shadow:0 0 0 1px var(--c-red-dim); pointer-events:none; }
      .tz-total { position:absolute; top:5px; height:26px; border:1px solid var(--c-red-border); border-radius:5px; background:var(--c-red-dim); overflow:hidden; }
      .tz-segment { position:absolute; top:6px; height:24px; min-width:0; border-right:1px solid rgba(255,255,255,.45); }
      .tz-phase-0 { background:#7f1d1d; } .tz-phase-1 { background:#991b1b; }
      .tz-phase-2 { background:#b91c1c; } .tz-phase-3 { background:#dc2626; }
      .tz-phase-4 { background:#ef4444; }
      .tz-legend { display:flex; align-items:center; flex-wrap:wrap; gap:7px 14px; margin-top:14px; color:var(--c-text2); font-size:10px; }
      .tz-legend-item { display:inline-flex; align-items:center; gap:6px; }
      .tz-swatch { width:18px; height:8px; border-radius:2px; }
      .tz-shift-swatch { width:3px; height:15px; background:var(--c-red-light); box-shadow:0 0 0 1px var(--c-red-dim); }
      .tz-summary { margin-top:12px; color:var(--c-text2); font-size:10px; line-height:1.6; }
      @container (max-width:520px) { .tz-widget { padding:14px; } .tz-axis, .tz-row { grid-template-columns:220px minmax(0,1fr); } }

      .analyse-tabs { display:flex; gap:6px; overflow-x:auto; border-bottom:1px solid var(--c-border2); margin:0 0 20px; }
      .analyse-tab { color:var(--c-text2); font-size:14px; font-weight:600; white-space:nowrap; flex-shrink:0; padding:13px 20px; border-bottom:3px solid transparent; border-radius:7px 7px 0 0; }
      .analyse-tab:hover { color:var(--c-text); background:var(--c-bg3); }
      .analyse-tab[aria-selected="true"] { color:var(--c-text); background:var(--c-red-dim); border-bottom-color:var(--c-red-light); }
      .analyse-tab:focus-visible, .analyse-panel:focus-visible { outline:2px solid var(--c-red-light); outline-offset:2px; }
      .analyse-panel[hidden] { display:none !important; }
      .analyse-period-compare { margin:0 0 20px; }
      .analyse-period-compare .kpi-cards { margin-top:16px; grid-template-columns:minmax(240px,420px); }
      @container (max-width:520px) { .analyse-tab { flex:1; padding:12px 8px; } }

      .kpi-menge-list { font-size:18px; line-height:1.35; overflow-wrap:anywhere; }
      .lb-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin:0 0 16px; }
      .lb-mode { display:inline-flex; border:1px solid var(--c-border2); border-radius:8px; padding:2px; background:var(--c-bg3); }
      .lb-mode button { padding:8px 12px; color:var(--c-text2); border-radius:6px; font-size:12px; }
      .lb-mode button[aria-pressed="true"] { color:var(--c-text); background:var(--c-red-dim); box-shadow:inset 0 -2px var(--c-red-light); }
      .lb-mode button:focus-visible { outline:2px solid var(--c-red-light); outline-offset:2px; }
      .lb-toolbar input { background:var(--c-bg3); color:var(--c-text); border:1px solid var(--c-border2); border-radius:7px; padding:10px 12px; max-width:100%; width:300px; }
      .lb-context { color:var(--c-text2); font-size:12px; line-height:1.6; margin:8px 0 14px; }
      .lb-summary { display:grid; grid-template-columns:repeat(2,minmax(180px,280px)); gap:10px; margin:10px 0 16px; }
      .lb-summary-card { padding:14px 16px; background:var(--c-bg2); border:1px solid var(--c-border2); border-radius:9px; box-shadow:var(--shadow-sm); }
      .lb-summary-card.is-alert { border-color:var(--c-red-border); background:var(--c-red-dim); }
      .lb-summary-label { color:var(--c-text2); font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
      .lb-summary-value { display:block; margin-top:5px; color:var(--c-text); font:700 22px var(--font-mono); }
      .lb-summary-note { display:block; margin-top:4px; color:var(--c-text2); font-size:10px; line-height:1.4; }
      .lb-scroll { container-type:inline-size; overflow-anchor:none; overflow:auto; max-height:560px; position:relative; isolation:isolate; scrollbar-gutter:stable; margin-bottom:18px; border:1px solid var(--c-border2); border-radius:9px; }
      .lb-scroll:focus-visible { outline:2px solid var(--c-red-light); outline-offset:2px; }
      .lb-scroll > .lb-table > thead > tr > th { position:sticky; top:0; z-index:2; background:var(--c-bg3); }
      .lb-scroll > .lb-table > thead > tr > th:first-child { left:0; z-index:3; box-shadow:1px 0 var(--c-border2); }
      .lb-scroll > .lb-table > tbody > tr:not(.lb-inline-detail-row) > :first-child { position:sticky; left:0; z-index:1; background:inherit; box-shadow:1px 0 var(--c-border2); }
      .lb-scroll > .lb-table > tbody > tr:not(.lb-inline-detail-row):hover > :first-child { background:var(--c-bg3); }
      .lb-table { width:100%; min-width:500px; border-collapse:collapse; text-align:left; }
      .lb-table thead { background:var(--c-bg3); }
      .lb-table th, .lb-table td { padding:16px 12px; border-bottom:1px solid var(--c-border2); }
      .lb-table tbody > tr { background:var(--c-bg); }
      .lb-table tbody > tr:not(.lb-inline-detail-row):hover { background:var(--c-bg3); }
      .lb-table tbody th { font-size:13px; min-width:190px; }
      .lb-table td { min-width:140px; }
      .lb-table td:nth-child(2) { min-width:65px; }
      .lb-table small { display:block; color:var(--c-text2); font-size:10px; font-weight:400; margin-top:7px; }
      .lb-table button { color:var(--c-text); font-size:12px; text-align:left; }
      .lb-table strong { font-size:16px; }
      .lb-mengen-table { min-width:1000px; font-size:12px; }
      .lb-mengen-table th, .lb-mengen-table td { padding:12px; }
      .lb-mengen-table th { vertical-align:bottom; }
      .lb-mengen-table th button { line-height:1.45; }
      .lb-mengen-table td { min-width:100px; }
      .lb-mengen-table td:first-child { min-width:200px; }
      .lb-mengen-table td:nth-child(2) { min-width:140px; }
      .lb-mengen-table .lb-num { text-align:right; font-family:var(--font-mono); }
      .lb-mengen-table .lb-diff { color:var(--c-red-light); font-weight:600; }
      .lb-mengen-table tbody tr:nth-child(even) { background:var(--c-bg2); }
      .lb-mengen-table tbody tr:hover { background:var(--c-bg3); }
      .lb-track { height:5px; margin-top:9px; background:var(--c-bg3); border-radius:4px; overflow:hidden; }
      .lb-track span { display:block; height:100%; background:var(--c-red-light); }
      .lb-table button:focus-visible, .lb-toolbar input:focus-visible { outline:2px solid var(--c-red-light); outline-offset:3px; }
      .fb-name-btn { display:block; width:100%; padding:0; color:var(--c-text); text-align:left; }
      .fb-name-btn:hover { color:var(--c-red-light); }
      .fb-name-btn[aria-expanded="true"] { color:var(--c-red-light); }
      .fb-name-btn .fb-chevron { float:right; margin-left:10px; color:var(--c-text3); }
      .lb-inline-detail-row > td { padding:0 12px 18px; background:var(--c-bg); border-bottom:1px solid var(--c-border2); }
      .lb-inline-detail-row .fb-detail { margin:0; position:sticky; left:12px; width:calc(100cqw - 24px); min-width:0; box-sizing:border-box; }
      /* Ein vertikaler Scrollbereich; Detailtabellen scrollen nur horizontal. */
      .lb-inline-detail-row .lb-scroll { max-height:none; }
      .lb-inline-detail-row .lb-scroll > .lb-table > thead > tr > th { position:static; }
      .fb-detail-head > div { min-width:0; overflow-wrap:anywhere; }
      .fb-detail { margin:4px 0 18px; padding:18px; border:1px solid var(--c-red-border); border-radius:var(--r-md); background:var(--c-bg2); box-shadow:var(--shadow-sm); }
      .fb-detail-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:12px; }
      .fb-detail-title { color:var(--c-text); font-size:14px; font-weight:600; }
      .fb-detail-close { flex:0 0 auto; padding:5px 9px; color:var(--c-text2); border:1px solid var(--c-border2); border-radius:6px; }
      .fb-detail-close:hover { color:var(--c-text); background:var(--c-bg3); }
      .fb-detail-table { min-width:720px; }
      .fb-detail-table th, .fb-detail-table td { white-space:nowrap; }
      .fb-detail-table td:last-child { color:var(--c-red-light); font:600 13px var(--font-mono); }
      .fb-detail-table tbody tr:hover { background:var(--c-bg3); }
      .fb-product { min-width:190px; }
      .fb-product small { margin-top:3px; }
      .fb-detail-empty { padding:18px; color:var(--c-text2); border:1px dashed var(--c-border2); border-radius:7px; font-size:12px; }
      .lb-analysis-block { margin-top:18px; }
      .lb-analysis-title { margin:0 0 10px; color:var(--c-text); font-size:13px; font-weight:600; }
      .lb-analysis-table { min-width:1180px; font-size:11px; }
      .lb-analysis-table th { min-width:105px; padding:12px 10px; white-space:normal; line-height:1.35; vertical-align:bottom; }
      .lb-analysis-table th:nth-child(2), .lb-analysis-table th:nth-child(3) { min-width:135px; }
      .lb-analysis-table th:nth-child(4) { min-width:170px; }
      .lb-analysis-table td { min-width:0; padding:11px 10px; white-space:nowrap; }
      .lb-analysis-table .lb-num { text-align:right; font-family:var(--font-mono); }
      .lb-analysis-table .lb-diff { color:var(--c-red-light); font-weight:700; }
      .lb-analysis-table td:last-child { color:var(--c-text); font:inherit; }
      .lb-trend { margin-top:18px; padding:16px; border:1px solid var(--c-border2); border-radius:9px; background:var(--c-bg); }
      .lb-chart-scroll { overflow-x:auto; }
      .lb-chart-scroll:focus-visible { outline:2px solid var(--c-red-light); outline-offset:2px; }
      .analyse-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
      .lb-trend-chart { display:block; width:100%; min-width:720px; height:auto; }
      .lb-chart-grid { stroke:var(--c-border2); stroke-width:1; stroke-dasharray:3 4; vector-effect:non-scaling-stroke; }
      .lb-chart-axis { stroke:var(--c-text3); stroke-width:1; vector-effect:non-scaling-stroke; }
      .lb-chart-date-tick { stroke:var(--c-text2); stroke-width:1.5; vector-effect:non-scaling-stroke; }
      .lb-chart-year { fill:var(--c-text2); font:600 11px var(--font-mono); }
      .lb-chart-year-boundary { stroke:var(--c-text3); stroke-width:1.5; stroke-dasharray:4 5; opacity:.65; vector-effect:non-scaling-stroke; }
      .lb-chart-line { fill:none; stroke:var(--c-red-light); stroke-width:3; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
      .lb-chart-point { fill:var(--c-red-light); stroke:var(--c-bg); stroke-width:2; vector-effect:non-scaling-stroke; }
      .lb-chart-label { fill:var(--c-text2); font:11px var(--font-mono); }
      .lb-chart-value { fill:var(--c-text); font:600 10px var(--font-mono); }
      .dlz-trend-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
      .dlz-trend-controls { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
      .dlz-trend-control { display:flex; align-items:center; gap:6px; }
      .dlz-trend-control > span { color:var(--c-text2); font-size:10px; }
      .lb-trend-caption { margin:6px 0 8px; color:var(--c-text2); font-size:11px; line-height:1.6; }
      .lb-chart-info { margin-top:8px; border-top:1px solid var(--c-border); padding-top:10px; }
      .lb-chart-info > summary { color:var(--c-text2); font-size:11px; font-weight:600; cursor:pointer; }
      .lb-chart-info > summary:focus-visible { outline:2px solid var(--c-red-light); outline-offset:2px; }
      .dlz-trend .lb-chart-value { font-size:11px; }
      .dlz-trend .pz-switch button:focus-visible { outline:2px solid var(--c-blue); outline-offset:2px; }
      .lb-product-details { margin-top:18px; }
      .lb-product-details > summary { color:var(--c-text2); font-size:12px; font-weight:600; cursor:pointer; }
      .lb-product-details .lb-scroll { margin-top:12px; }
      @container (max-width:650px) { .analyse-tabs { overflow-x:auto; } .analyse-tab { white-space:nowrap; font-size:12px; } .lb-summary { grid-template-columns:1fr 1fr; } }

      /* Lesbare Statusfarben auf hellen Karten. */
      :host([theme="light"]) .kpi-card-wert.q-gut,
      :host([theme="light"]) .kpi-bd-wert.q-gut,
      :host([theme="light"]) .kpi-trend.auf,
      :host([theme="light"]) .k-ja,
      :host([theme="light"]) .dh-delta.neg,
      :host([theme="light"]) .d-info-val.ok,
      :host([theme="light"]) .badge-fertigstellung,
      :host([theme="light"]) .badge-eingelagert,
      :host([theme="light"]) .ls-land { color:var(--c-green); }
      :host([theme="light"]) .kpi-card-wert.q-mittel,
      :host([theme="light"]) .kpi-bd-wert.q-mittel,
      :host([theme="light"]) .k-delta.pos,
      :host([theme="light"]) .badge-ankunft,
      :host([theme="light"]) .badge-angedockt,
      :host([theme="light"]) .ls-cont { color:var(--c-yellow); }
      :host([theme="light"]) .kpi-card-wert.q-schlecht,
      :host([theme="light"]) .kpi-bd-wert.q-schlecht,
      :host([theme="light"]) .kpi-trend.ab,
      :host([theme="light"]) .k-nein,
      :host([theme="light"]) .dh-delta.pos,
      :host([theme="light"]) .d-info-val.bad { color:var(--c-red-light); }
      :host([theme="light"]) .badge-entladen,
      :host([theme="light"]) .badge-entladen_fertig { color:var(--c-blue); }
      :host([theme="light"]) .ls-bsl { color:#713d87; }
      .te-tabelle th button { color:inherit; font:inherit; text-align:inherit; }
    </style>

    <!-- ── DOM ────────────────────────────────────────────────────────── -->
    <div class="widget-root">
      <div id="analyse-status" class="analyse-sr-only" role="status" aria-live="polite" aria-atomic="true"></div>

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
            <details class="ls-verteilung" id="otif-te-toggle">
              <summary>OTIF je TE <span class="ls-verteilung-geschlossen">anzeigen</span><span class="ls-verteilung-offen">ausblenden</span></summary>
              <div class="kpi-cards" id="otif-te" style="grid-template-columns:minmax(0,420px)"></div>
            </details>
            <details class="ls-verteilung otif-anlieferungen" id="otif-anlieferungen-toggle">
              <summary>Anlieferungsdetails <span class="ls-verteilung-geschlossen">anzeigen</span><span class="ls-verteilung-offen">ausblenden</span></summary>
              <div id="otif-anlieferungen"></div>
            </details>
            <details class="ls-verteilung">
              <summary>TEs nach Ladestelle <span class="ls-verteilung-geschlossen">anzeigen</span><span class="ls-verteilung-offen">ausblenden</span></summary>
              <div id="ladestellen-verteilung" aria-live="polite"></div>
            </details>
          </div>

          <div class="analyse-tabs" role="tablist" aria-label="Auswertung wählen">
            <button id="tab-kennzahlen" class="analyse-tab" role="tab" aria-selected="true" aria-controls="panel-kennzahlen" tabindex="0" data-analyse-tab="kennzahlen">TE-Übersicht</button>
            <button id="tab-durchlaufzeiten" class="analyse-tab" role="tab" aria-selected="false" aria-controls="panel-durchlaufzeiten" tabindex="-1" data-analyse-tab="durchlaufzeiten">Durchlaufzeiten</button>
            <button id="tab-lieferanten" class="analyse-tab" role="tab" aria-selected="false" aria-controls="panel-lieferanten" tabindex="-1" data-analyse-tab="lieferanten">Lieferantenbewertung</button>
            <button id="tab-spediteure" class="analyse-tab" role="tab" aria-selected="false" aria-controls="panel-spediteure" tabindex="-1" data-analyse-tab="spediteure">Frachtführer/Spediteur</button>
          </div>
          <section id="panel-kennzahlen" class="analyse-panel" role="tabpanel" aria-labelledby="tab-kennzahlen" tabindex="0">
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
                <button class="f-chip" data-kfilter="otif-nein">OTIF je TE verletzt</button>
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
                <option value="Nicht zugeordnet">Nicht zugeordnet</option>
              </select>

              <span class="f-label">Sortierung</span>
              <select class="f-select" id="f-sort" aria-label="Sortierung">
                <option value="ankerDatum">Datum</option>
                <option value="te">TE-Nummer</option>
                <option value="lieferantName">Lieferant</option>
                <option value="otif">OTIF</option>
                <option value="puenktlich">Pünktlichkeit</option>
                <option value="mengentreu">Mengentreue</option>
                <option value="abweichendeMengeAbs">Abweichende Menge</option>
              </select>

              <button class="f-reset" id="f-reset">Filter zurücksetzen</button>
            </div>

            <div id="te-liste"></div>
          </div>
          </section>
          <section id="panel-durchlaufzeiten" class="analyse-panel" role="tabpanel" aria-labelledby="tab-durchlaufzeiten" tabindex="0" hidden>
            <details class="pz-info analyse-period-compare" open>
              <summary>Durchlaufzeit im Vorperiodenvergleich</summary>
              <div class="kpi-cards" id="zeit-kpi-cards"></div>
            </details>
            <div id="durchlauf-trend"></div>
            <div class="u-abschnitt">
              <div class="u-titel">Prozesszeiten · Analyse je TE</div>
              <div id="prozesszeiten"></div>
            </div>
          </section>

          <section id="panel-lieferanten" class="analyse-panel" role="tabpanel" aria-labelledby="tab-lieferanten" tabindex="0" hidden>
            <div id="lieferanten-trend"></div>
            <div id="nullpositionen-uebersicht"></div>
            <div class="u-abschnitt">
              <div class="u-titel">Warensender im ausgewählten Zeitraum · Mengenabweichungen</div>
              <div class="lb-toolbar"><label for="lieferanten-mengen-suche">Warensender durchsuchen</label><input id="lieferanten-mengen-suche" type="search" placeholder="Lieferant, Transportmittel, Einheit oder HWG" autocomplete="off"></div>
              <div id="lieferanten-mengen"></div>
            </div>
            <div class="u-abschnitt">
              <div class="u-titel">Lieferantenbewertung · Mengentreue</div>
              <div class="lb-toolbar"><div class="lb-mode" role="group" aria-label="Lieferantenauswahl"><button type="button" data-lb-mode="alle" aria-pressed="true">Alle</button><button type="button" data-lb-mode="schlechteste" aria-pressed="false">10 schlechteste</button></div><label for="lieferanten-suche">Lieferanten suchen</label><input id="lieferanten-suche" type="search" placeholder="Name oder Nummer" autocomplete="off"></div>
              <div id="lieferanten-vergleich"></div>
            </div>
          </section>

          <section id="panel-spediteure" class="analyse-panel" role="tabpanel" aria-labelledby="tab-spediteure" tabindex="0" hidden>
            <div id="spediteure-trend"></div>
            <div class="u-abschnitt">
              <div class="u-titel">Frachtführer/Spediteure im ausgewählten Zeitraum · Pünktlichkeit</div>
              <div class="lb-toolbar"><div class="lb-mode" role="group" aria-label="Frachtführerauswahl"><button type="button" data-fg-mode="alle" aria-pressed="true">Alle</button><button type="button" data-fg-mode="schlechteste" aria-pressed="false">10 schlechteste</button></div><label for="spediteure-gesamt-suche">Frachtführer/Spediteure durchsuchen</label><input id="spediteure-gesamt-suche" type="search" placeholder="Name, Schlüssel oder Transportmittel" autocomplete="off"></div>
              <div id="spediteure-gesamt"></div>
            </div>
            <div class="u-abschnitt">

            </div>
          </section>
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
      this._designMode     = false; // aus onCustomWidgetBeforeUpdate/AfterUpdate übernommen
      this._watchdogTimer  = null;
      this._watchdogVersuch = 0;

      this._log('Widget-Instanz erstellt (constructor)');

      // Interner State
      this._teMap       = new Map();    // { teNr → TEObjekt }
      this._activeTE    = null;         // aktuell im Detail angezeigte TE-Nummer
      this._activeView  = 'uebersicht';
      this._analyseTab  = 'kennzahlen';
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
      this._lieferantDetailKey = null;
      this._spediteurDetailKey = null;
      this._lieferantenModus = 'alle';
      this._spediteureModus = 'alle';

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
        const fehlertext = this._extraktFehlertext(this._dataBinding);
        this._log(
          `Watchdog (${this._watchdogVersuch}) — ${this._seitStart()}ms seit dem Einhängen, `
          + `myDataSource wurde ${this._dsAufrufe}× aufgerufen, letzter state='${letzterState}'`
          + (fehlertext ? `, Meldung: "${fehlertext}"` : '') + `. `
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

    // UI-Zustand erhalten, ohne SAC-Seite oder Widget-Viewport zu scrollen.
    _analyseUiVorRender(host) {
      if (!host?.querySelectorAll) return [];
      this._analyseOffeneErklaerungen ??= new Map();
      host.querySelectorAll('details').forEach((detail, i) => {
        const partner = detail.closest('.fb-detail')?.dataset.partnerKey ?? 'gesamt';
        const key = `${host.id}|${partner}|${detail.dataset?.analysisKey ?? `${detail.className}|${i}`}`;
        this._analyseOffeneErklaerungen.set(key, detail.open);
      });
      return Array.from(host.querySelectorAll('.lb-scroll, .lb-chart-scroll'), el => ({
        label:el.getAttribute('aria-label'), top:el.scrollTop, left:el.scrollLeft
      }));
    }

    _analyseUiNachRender(host, scrolls = []) {
      if (!host?.querySelectorAll) return;
      host.querySelectorAll('details').forEach((detail, i) => {
        const partner = detail.closest('.fb-detail')?.dataset.partnerKey ?? 'gesamt';
        const key = `${host.id}|${partner}|${detail.dataset?.analysisKey ?? `${detail.className}|${i}`}`;
        if (this._analyseOffeneErklaerungen?.has(key)) detail.open = this._analyseOffeneErklaerungen.get(key);
      });
      host.querySelectorAll('.lb-scroll, .lb-chart-scroll').forEach(el => {
        const saved = scrolls.find(item => item.label === el.getAttribute('aria-label'));
        if (saved) { el.scrollTop = saved.top; el.scrollLeft = saved.left; }
      });
    }

    _analyseZeileFokussieren(host, selector) {
      const button = host?.querySelector(selector);
      button?.focus({preventScroll:true});
      const wrapper = button?.closest?.('.lb-scroll');
      const row = button?.closest?.('tr');
      if (!wrapper || !row) return;
      const box = wrapper.getBoundingClientRect(), rect = row.getBoundingClientRect();
      const head = wrapper.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      const top = box.top + wrapper.clientTop + head, bottom = box.top + wrapper.clientTop + wrapper.clientHeight;
      if (rect.top < top) wrapper.scrollTop += rect.top - top;
      else if (button.getAttribute('aria-expanded') === 'true' && rect.top > top + 80) {
        // Auch bei einem Klick am unteren Rand bleibt der Detailkopf erreichbar.
        wrapper.scrollTop += rect.top - top - 80;
      } else if (rect.bottom > bottom) wrapper.scrollTop += rect.bottom - bottom;
    }

    _analyseStatus(text) {
      const status = this._$('analyse-status');
      if (status) status.textContent = text;
    }

    // ── Event-Binding ────────────────────────────────────────────────────

    _bindEvents() {
      const opts = { signal: this._ac.signal };
      this._shadow.querySelectorAll('[data-analyse-tab]').forEach(button => {
        button.addEventListener('click', () => this._setAnalyseTab(button.dataset.analyseTab), opts);
        button.addEventListener('keydown', e => {
          const namen = ['kennzahlen', 'durchlaufzeiten', 'lieferanten', 'spediteure'];
          const i = namen.indexOf(button.dataset.analyseTab);
          let ziel;
          if (e.key === 'ArrowRight') ziel = namen[(i + 1) % namen.length];
          else if (e.key === 'ArrowLeft') ziel = namen[(i + namen.length - 1) % namen.length];
          else if (e.key === 'Home') ziel = namen[0];
          else if (e.key === 'End') ziel = namen[namen.length - 1];
          else return;
          e.preventDefault();
          this._setAnalyseTab(ziel, true);
        }, opts);
      });


      this._$('spediteure-gesamt-suche')?.addEventListener('input', e => {
        this._spediteureGesamtSuche = e.target.value; this._renderSpediteureGesamt(this._tesZeitraum());
      }, opts);
      this._$('spediteure-gesamt')?.addEventListener('click', e => {
        const sort = e.target.closest('[data-fg-sort]');
        if (sort) {
          const feld = sort.dataset.fgSort;
          this._spediteureGesamtRichtung = (this._spediteureGesamtSort ?? 'verspaetet') === feld
            ? -(this._spediteureGesamtRichtung ?? -1) : ['label','transportLabel'].includes(feld) ? 1 : -1;
          this._spediteureGesamtSort = feld; this._renderSpediteure();
          this._$('spediteure-gesamt')?.querySelector(`[data-fg-sort="${feld}"]`)?.focus({preventScroll:true});
          return;
        }
        const close = e.target.closest('[data-fb-detail-close]');
        if (close) {
          const key=this._spediteurDetailKey; this._spediteurDetailKey=null; this._renderSpediteure();
          this._analyseStatus('Pünktlichkeitsanalyse geschlossen.');
          if (key != null) this._analyseZeileFokussieren(this._$('spediteure-gesamt'), `[data-fb-detail="${encodeURIComponent(key)}"]`);
          return;
        }
        const drill=e.target.closest('[data-fb-detail]'); if (!drill) return;
        const key=decodeURIComponent(drill.dataset.fbDetail);
        this._spediteurDetailKey=this._spediteurDetailKey === key ? null : key;
        this._renderSpediteure();
        this._analyseStatus(this._spediteurDetailKey ? 'Pünktlichkeitsanalyse geöffnet.' : 'Pünktlichkeitsanalyse geschlossen.');
        this._analyseZeileFokussieren(this._$('spediteure-gesamt'), `[data-fb-detail="${encodeURIComponent(key)}"]`);
      }, opts);
      this._shadow.querySelectorAll('[data-lb-mode]').forEach(button => button.addEventListener('click', () => {
        this._lieferantenModus = button.dataset.lbMode;
        this._shadow.querySelectorAll('[data-lb-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lbMode === this._lieferantenModus)));
        this._renderLieferanten();
      }, opts));
      this._shadow.querySelectorAll('[data-fg-mode]').forEach(button => button.addEventListener('click', () => {
        this._spediteureModus = button.dataset.fgMode;
        this._shadow.querySelectorAll('[data-fg-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fgMode === this._spediteureModus)));
        this._renderSpediteure();
      }, opts));
      this._$('lieferanten-suche')?.addEventListener('input', e => {
        this._lieferantenSuche = e.target.value; this._renderLieferanten();
      }, opts);
      this._$('lieferanten-mengen-suche')?.addEventListener('input', e => {
        this._lieferantenMengenSuche = e.target.value;
        this._renderLieferantenMengen(this._tesZeitraum());
      }, opts);
      this._$('lieferanten-mengen')?.addEventListener('click', e => {
        const button = e.target.closest('[data-lm-sort]');
        if (!button) return;
        const feld = button.dataset.lmSort;
        this._lieferantenMengenRichtung = (this._lieferantenMengenSort ?? 'anzahlTe') === feld
          ? -(this._lieferantenMengenRichtung ?? -1)
          : ['anzahlTe','anzahlPositionen','differenzmenge'].includes(feld) ? -1 : 1;
        this._lieferantenMengenSort = feld;
        this._renderLieferantenMengen(this._tesZeitraum());
        this._$('lieferanten-mengen')?.querySelector(`[data-lm-sort="${feld}"]`)?.focus({preventScroll:true});
      }, opts);
      this._$('lieferanten-vergleich')?.addEventListener('click', e => {
        const sort = e.target.closest('[data-lb-sort]');
        if (sort) {
          const feld = sort.dataset.lbSort;
          this._lieferantenRichtung = (this._lieferantenSort ?? 'mengentreu') === feld ? -(this._lieferantenRichtung ?? 1) : 1;
          this._lieferantenSort = feld; this._renderLieferanten();
          this._$('lieferanten-vergleich')?.querySelector(`[data-lb-sort="${feld}"]`)?.focus({preventScroll:true});
          return;
        }
        const schliessen = e.target.closest('[data-lb-detail-close]');
        if (schliessen) {
          const key = this._lieferantDetailKey;
          this._lieferantDetailKey = null;
          this._renderLieferanten();
          this._analyseStatus('Mengentreueanalyse geschlossen.');
          if (key != null) this._analyseZeileFokussieren(this._$('lieferanten-vergleich'), `[data-lb-detail="${encodeURIComponent(key)}"]`);
          return;
        }
        const drill = e.target.closest('[data-lb-detail]');
        if (!drill) return;
        const key = decodeURIComponent(drill.dataset.lbDetail);
        this._lieferantDetailKey = this._lieferantDetailKey === key ? null : key;
        this._renderLieferanten();
        this._analyseStatus(this._lieferantDetailKey ? 'Mengentreueanalyse geöffnet.' : 'Mengentreueanalyse geschlossen.');
        this._analyseZeileFokussieren(this._$('lieferanten-vergleich'), `[data-lb-detail="${encodeURIComponent(key)}"]`);
      }, opts);

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

    _setAnalyseTab(name, fokus = false) {
      if (!['kennzahlen', 'durchlaufzeiten', 'lieferanten', 'spediteure'].includes(name)) return;
      this._analyseTab = name;
      for (const id of ['kennzahlen', 'durchlaufzeiten', 'lieferanten', 'spediteure']) {
        const aktiv = id === name, button = this._$(`tab-${id}`), panel = this._$(`panel-${id}`);
        if (button) { button.setAttribute('aria-selected', String(aktiv)); button.tabIndex = aktiv ? 0 : -1; }
        if (panel) panel.hidden = !aktiv;
      }
      if (fokus) this._$(`tab-${name}`)?.focus({preventScroll:true});
    }

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
      const tage=Math.round((max-min)/TAG_MS);
      return {von:min,bis:max,tage:Math.max(1,tage)};
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

    _alleTes() { return [...(this._teMap?.values() ?? this._tesZeitraum())]; }

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
          case 'mengenabweichung': return te.mengenPositionen?.some(p=>p.abweichungAbs>0) || te.abweichendeMenge != null && te.abweichendeMenge !== 0;
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
        if (f === 'abweichendeMengeAbs') {
          // Unterschiedliche Einheiten nicht zu einem Sortierbetrag addieren.
          // Erst Einheitengruppe, dann Beträge innerhalb derselben Einheitengruppe.
          const gruppen = te => {
            const gs=te.mengenGruppen;
            if (gs?.length) return gs.some(g=>!g.abweichungVollstaendig) ? null
              : [...gs].sort((x,y)=>x.einheit.localeCompare(y.einheit,'de'));
            return Number.isFinite(te.abweichendeMengeAbs)
              ? [{einheit:'',abweichung:te.abweichendeMengeAbs}] : null;
          };
          const ag=gruppen(a),bg=gruppen(b);
          if (ag==null || bg==null) return cmp(ag==null ? null : 0,bg==null ? null : 0,r);
          const sign=cmp(JSON.stringify(ag.map(g=>g.einheit)),JSON.stringify(bg.map(g=>g.einheit)),r);
          if (sign) return sign;
          for(let i=0;i<ag.length;i++) {
            const result=cmp(ag[i].abweichungAbs ?? Math.abs(ag[i].abweichung),bg[i].abweichungAbs ?? Math.abs(bg[i].abweichung),r);
            if(result) return result;
          }
          return cmp(a.te,b.te,1);
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
      this._renderProzesszeiten();
      this._renderLieferanten();
      this._renderSpediteure();
      this._renderTabelle();
    }

    _bewertungsSummenHTML(summen, abweichungsLabel, hinweis) {
      return `<div class="lb-summary" aria-label="Zusammenfassung">
        <div class="lb-summary-card"><span class="lb-summary-label">TEs insgesamt</span><strong class="lb-summary-value">${summen.bewertbar+summen.nb}</strong><span class="lb-summary-note">${summen.bewertbar} bewertbar${summen.nb ? ` · ${summen.nb} nicht bewertbar` : ''}</span></div>
        <div class="lb-summary-card is-alert"><span class="lb-summary-label">${esc(abweichungsLabel)}</span><strong class="lb-summary-value">${summen.nichtErfuellt}</strong><span class="lb-summary-note">${esc(hinweis)}</span></div>
      </div>`;
    }

    _bewertungTrendHTML(trend, name, art, gesamt = false) {
      const istSpediteur = art === 'puenktlich';
      const quote = istSpediteur ? 'Pünktlichkeitsquote' : 'Mengentreuequote';
      const titel = gesamt ? istSpediteur ? 'Verlauf Lieferpünktlichkeit in %' : 'Verlauf Mengentreuequote in %' : `Verlauf ${quote} %`;
      const gruppe = istSpediteur ? 'Frachtführer/Spediteur' : 'Lieferanten';
      const erfuellung = istSpediteur ? 'pünktlich' : 'mengentreu';
      const basis = istSpediteur ? 'pünktliche TEs / zeitlich bewertbare TEs' : 'mengentreue TEs / mengenbewertbare TEs';
      const punkteDaten = trend.filter(t => Number.isFinite(t.wert));
      if (!punkteDaten.length) return `<section class="lb-trend"><div class="lb-analysis-title">${titel}</div>
        <div class="fb-detail-empty">Im ausgewählten Zeitraum gibt es ${gesamt ? istSpediteur ? 'für die eindeutig zugeordneten Frachtführer/Spediteure' : 'für die eindeutig zugeordneten Lieferanten' : `für diesen ${gruppe}`} keine tagesbezogen bewertbare ${quote}.</div></section>`;

      const W = 1000, H = 304, L = 78, R = 78, T = 50, B = 54;
      const plotW = W - L - R, plotH = H - T - B;
      const minimum = Math.min(...punkteDaten.map(p => p.wert));
      let yMin = Math.max(0, Math.floor((minimum - 5) / 5) * 5);
      if (yMin >= 100) yMin = 95;
      const ySchritt = Math.min(25, runderAchsenSchritt((100-yMin)/4));
      yMin = Math.max(0, 100 - Math.ceil((100-yMin)/ySchritt)*ySchritt);
      const ySpan = 100 - yMin;
      const ersterTag = punkteDaten[0].datum.getTime(), letzterTag = punkteDaten[punkteDaten.length-1].datum.getTime();
      const x = datum => ersterTag === letzterTag ? L + plotW / 2
        : L + (datum.getTime() - ersterTag) * plotW / (letzterTag - ersterTag);
      const y = wert => T + (100 - wert) / ySpan * plotH;
      const punkte = punkteDaten.map(p => ({...p, x:x(p.datum), y:y(p.wert)}));
      const linienpunkte = punkte.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      const yRaster = Array.from({length:Math.round(ySpan/ySchritt)+1},(_,i) => {
        const wert = 100 - ySchritt*i, py = y(wert);
        return `<line class="lb-chart-grid" x1="${L}" y1="${py.toFixed(1)}" x2="${W-R}" y2="${py.toFixed(1)}"></line>
          <text class="lb-chart-label" x="${L-9}" y="${(py+4).toFixed(1)}" text-anchor="end">${esc(fmtProzent(wert, wert % 1 ? 1 : 0))}</text>`;
      }).join('');
      const xLabels = trendDatumsAchse(punkte, H-B, H-22, T, L, W-R);
      const wertIndizes = punkte.length <= 10
        ? new Set(punkte.map((_,i)=>i))
        : new Set([0, punkte.length-1, punkte.reduce((minI,p,i,a) => p.wert < a[minI].wert ? i : minI, 0)]);
      const kreise = punkte.map((p,i) => `<circle class="lb-chart-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4">
          <title>${esc(`${fmtDate(p.datum)}: ${fmtProzent(p.wert)} · ${p.ok}/${p.bewertbar} TEs ${erfuellung}${p.nb ? ` · ${p.nb} n. b.` : ''}`)}</title></circle>
        ${wertIndizes.has(i) ? `<text class="lb-chart-value" x="${(p.x+(i===0?8:i===punkte.length-1?-8:0)).toFixed(1)}" y="${(p.y < T+16 ? p.y + 19 : p.y - 10).toFixed(1)}" text-anchor="${i===0?'start':i===punkte.length-1?'end':'middle'}">${esc(fmtProzent(p.wert))}</text>` : ''}`).join('');
      const nbGesamt = trend.reduce((s,t) => s + t.nb, 0);
      return `<section class="lb-trend" aria-label="Verlauf der ${quote} von ${esc(name)}">
        <div class="lb-analysis-title">${titel}</div>
        <p class="lb-trend-caption">${punkteDaten.length} Tageswerte · ${trend.reduce((sum,t) => sum + t.bewertbar, 0)} bewertbare TEs${nbGesamt ? ` · ${nbGesamt} nicht bewertbar` : ''}</p>
        <div class="lb-chart-scroll" tabindex="0" role="region" aria-label="Diagramm ${quote} von ${esc(name)} horizontal scrollen"><svg class="lb-trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Täglicher Verlauf der ${quote}">
          <title>${esc(`Täglicher Verlauf der ${quote} von ${name}`)}</title>
          ${yRaster}<line class="lb-chart-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"></line>
          <line class="lb-chart-axis" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"></line>
          <text class="lb-chart-label" transform="translate(18 ${T+plotH/2}) rotate(-90)" text-anchor="middle">${quote} %</text>
          ${xLabels}<polyline class="lb-chart-line" points="${linienpunkte.join(' ')}"></polyline>${kreise}
        </svg></div>
        <details class="lb-chart-info"><summary>Berechnung und Darstellung</summary><div class="lb-context">Tagesquote = ${basis} ${gesamt ? istSpediteur ? 'aller eindeutig zugeordneten Frachtführer/Spediteure im ausgewählten Zeitraum' : 'aller eindeutig zugeordneten Lieferanten im ausgewählten Zeitraum' : `des ausgewählten ${gruppe}`}. Die Linie verbindet die vorhandenen Tageswerte; Tage ohne bewertbare ${istSpediteur ? 'Plan-/Ankunftszeitstempel' : 'Mengen'} haben keinen Datenpunkt. Tagesbeschriftungen stehen unter den zugehörigen Punkten. Ab mehr als 120 Tagen zeigt die Achse Monatsmarken. Das Jahr steht über seinem Abschnitt; jeder Punkt zeigt das vollständige Datum.${nbGesamt ? ` ${nbGesamt} TE${nbGesamt === 1 ? '' : 's'} sind im Verlauf nicht bewertbar.` : ''}</div></details>
      </section>`;
    }

    _lieferantTrendHTML(trend, lieferant) { return this._bewertungTrendHTML(trend, lieferant, 'mengentreu'); }
    _spediteurTrendHTML(trend, spediteur) { return this._bewertungTrendHTML(trend, spediteur, 'puenktlich'); }

    _nullpositionenHTML(tes, kontext='Zeitraum') {
      const zeilen=nullpositionenListe(tes);
      if (!zeilen.length) return '';
      const teAnzahl=new Set(zeilen.map(p=>p.te)).size;
      return `<details class="pz-info nullpositionen-block"><summary>Nullpositionen · ${zeilen.length} Positionen auf ${teAnzahl} TEs · separat ausgeschlossen</summary>
        <p class="lb-context">Ist-Menge = 0: Diese Positionen beeinflussen weder Mengentreue noch die reguläre Mengenabweichung. OTIF verwendet die verbleibenden Positionen. TEs nur mit Nullpositionen sind für Mengentreue und OTIF nicht bewertbar. Pünktlichkeit und Prozesszeiten bleiben unabhängig davon. Produkt je Anlieferung und Einheit dient als Positionsersatz; eine echte Positionsnummer ist noch nicht angebunden.</p>
        <div class="lb-scroll" tabindex="0" role="region" aria-label="Nullpositionen ${esc(kontext)} scrollen"><table class="lb-table lb-analysis-table"><thead><tr>
          <th scope="col">Datum</th><th scope="col">Interne TE</th><th scope="col">Externe TE</th><th scope="col">Anlieferung</th><th scope="col">Produkt / Positionsersatz</th><th scope="col">Lieferant</th><th scope="col">Ist</th><th scope="col">Soll</th><th scope="col">Abweichung (separat)</th><th scope="col">Einheit</th><th scope="col">Geplanter Start ab</th>
        </tr></thead><tbody>${zeilen.map(p=>`<tr>
          <td>${esc(fmtDate(p.datum))}</td><td>${esc(p.te ?? '–')}</td><td>${esc(p.teExt ?? '–')}</td><td>${esc(p.anlieferung ?? '–')}</td>
          <td>${esc(p.nr ?? '–')}<small>${esc(p.name ?? '–')}${p.quellzeilen>1 ? ` · ${p.quellzeilen} Quellzeilen` : ''}</small></td><td>${esc(p.lieferant ?? '–')}</td><td class="lb-num">0</td>
          <td class="lb-num">${p.sollVollstaendig ? esc(fmtMenge(p.soll)) : 'n. b.'}</td><td class="lb-num">${p.abweichungVollstaendig ? esc(fmtDelta(p.abweichung)) : 'n. b.'}</td><td>${esc(p.einheit || '–')}</td><td>${esc(fmtDateTimeVoll(p.geplantStart))}</td>
        </tr>`).join('')}</tbody></table></div>
      </details>`;
    }

    _lieferantDetailHTML(gruppe) {
      if (!gruppe) return '';
      const analyseZeilen = lieferantTeAnalyse(gruppe);
      const trend = lieferantMengentreueTrend(gruppe);
      const abweichungen = lieferantAbweichungen(gruppe);
      const betroffeneTes = new Set(analyseZeilen.map(a => a.te)).size;
      const analyseHTML = analyseZeilen.map(a => `<tr>
        <td>${esc(fmtDate(a.datum))}</td><td>${esc(a.te ?? '–')}</td><td>${esc(a.teExt ?? '–')}</td>
        <td>${esc(a.lieferant ?? '–')}</td><td>${esc(a.transportmittel ?? '–')}</td>
        <td class="lb-num">${a.inkorrektePositionen}</td><td class="lb-num">${a.ueberlieferung}</td><td class="lb-num">${a.unterlieferung}</td>
        <td class="lb-num lb-diff">${esc(fmtDelta(a.differenzmenge))}${a.teilsumme ? `<small>Teilsumme · Mengendaten unvollständig</small>` : ''}</td><td>${esc(a.einheit ?? '–')}</td>
      </tr>`).join('');
      const produktZeilen = abweichungen.map(a => `<tr>
        <td>${esc(a.teExt ?? a.te ?? '–')}</td><td>${esc(a.anlieferung ?? '–')}</td>
        <td class="fb-product"><strong>${esc(a.produktNr ?? '–')}</strong><small>${esc(a.produktName ?? '–')}</small></td>
        <td>${esc(fmtDelta(a.abweichung))}${a.teilsumme ? `<small>Teilsumme · Mengendaten unvollständig</small>` : ''}${a.gegenlaeufig ? `<small>Gegenläufig: ${a.abweichungen.map(v=>esc(fmtDelta(v))).join(' / ')}</small>` : ''}${a.einheit ? ` ${esc(a.einheit)}` : ''}</td>
        <td>${esc(fmtDateTimeVoll(a.geplantStart))}</td>
      </tr>`).join('');
      return `<section id="lieferant-detail" class="fb-detail" data-partner-key="${esc(gruppe.key)}" aria-label="Mengentreueanalyse von ${esc(gruppe.label)}">
        <div class="fb-detail-head"><div><div class="fb-detail-title">${esc(gruppe.label)} · Mengentreueanalyse</div>
          <div class="lb-context">${betroffeneTes} TE${betroffeneTes === 1 ? '' : 's'} mit Mengenabweichung · ${analyseZeilen.length} TE-/Einheitenzeile${analyseZeilen.length === 1 ? '' : 'n'} · ${esc(bereichLabel(this._bereich))}</div></div>
          <button class="fb-detail-close" data-lb-detail-close aria-label="Detailanalyse schließen">Schließen</button></div>
        <section class="lb-analysis-block"><div class="lb-analysis-title">TEs mit Mengenabweichung</div>
          ${analyseZeilen.length ? `<div class="lb-scroll" tabindex="0" role="region" aria-label="TEs mit Mengenabweichung scrollen"><table class="lb-table lb-analysis-table"><thead><tr>
            <th scope="col">Datum</th><th scope="col">Interne TE-Nummer</th><th scope="col">Externe TE-Nummer</th><th scope="col">Lieferant</th><th scope="col">Transportmittel</th>
            <th scope="col">Anzahl Positionen inkorrekt Mengentreue</th><th scope="col">Anzahl TE Überlieferung</th><th scope="col">Anzahl TE Unterlieferung</th><th scope="col">Summe Differenzmenge</th><th scope="col">Einheit</th>
          </tr></thead><tbody>${analyseHTML}</tbody></table></div>`
          : '<div class="fb-detail-empty">Für diesen Lieferanten gibt es im ausgewählten Zeitraum keine TE mit Mengenabweichung.</div>'}
        </section>
        ${this._lieferantTrendHTML(trend, gruppe.label)}
        ${this._nullpositionenHTML(gruppe.tes, 'Lieferant ' + gruppe.label)}
        <details class="lb-product-details"><summary>Produkt- und Anlieferungsdetails (${abweichungen.length})</summary>
          ${abweichungen.length ? `<div class="lb-scroll" tabindex="0" role="region" aria-label="Produkt- und Anlieferungsabweichungen scrollen"><table class="lb-table fb-detail-table"><thead><tr>
            <th scope="col">TE</th><th scope="col">Anlieferung</th><th scope="col">Produkt</th><th scope="col">Abweichung</th><th scope="col">Geplanter Start ab</th>
          </tr></thead><tbody>${produktZeilen}</tbody></table></div>`
          : '<div class="fb-detail-empty">Keine abweichenden Produktpositionen vorhanden.</div>'}
        </details>
        <div class="lb-context">Die obere Tabelle enthält ausschließlich nicht mengentreue TEs. Differenzmengen werden nur innerhalb derselben Mengeneinheit summiert; unterschiedliche Einheiten erhalten getrennte Zeilen. Über- und Unterlieferung werden je TE-/Einheitenzeile unabhängig als 1 oder 0 ausgewiesen; bei gegenläufigen Abweichungen können beide 1 sein. Die Differenzsumme ist netto; Mengentreue bewertet jede Position. Nullpositionen bleiben separat ausgeschlossen. Datum = Zeitraumanker des Widgets. Die Produkt- und Anlieferungsdetails bleiben separat aufklappbar.</div>
      </section>`;
    }

    _renderLieferantenMengen(tes) {
      const host = this._$('lieferanten-mengen');
      if (!host) return;
      const uiScroll = this._analyseUiVorRender(host);
      const daten = lieferantenMengenabweichungen(tes);
      const suche = (this._lieferantenMengenSuche ?? '').trim().toLocaleLowerCase('de');
      const spalten = [['lieferantLabel','Warensender / Lieferant'],['transportmittelLabel','Transportmittel'],
        ['anzahlTe','Anzahl TE mit Differenz'],['anzahlPositionen','Anzahl Positionen mit Differenz'],
        ['differenzmenge','Summe gesamt Differenzmenge'],['einheitLabel','Einheit'],['hwgLabel','HWG']];
      const feld = spalten.some(([f]) => f === this._lieferantenMengenSort) ? this._lieferantenMengenSort : 'anzahlTe';
      const richtung = this._lieferantenMengenRichtung ?? -1;
      const gruppen = daten.gruppen.filter(g => !suche ||
        `${g.lieferantLabel} ${g.lieferantNr ?? ''} ${g.transportmittelLabel} ${g.einheitLabel} ${g.hwgLabel}`.toLocaleLowerCase('de').includes(suche));
      gruppen.sort((a,b) => {
        const x = a[feld], y = b[feld];
        if (x == null && y != null) return 1;
        if (y == null && x != null) return -1;
        const delta = typeof x === 'string' ? x.localeCompare(y,'de') : x-y;
        return delta*richtung || b.anzahlPositionen-a.anzahlPositionen
          || a.lieferantLabel.localeCompare(b.lieferantLabel,'de') || a.key.localeCompare(b.key,'de');
      });
      host.innerHTML = `<p class="lb-context">${daten.anzahlLieferanten} Warensender · ${daten.anzahlTesGesamt} zugeordnete TEs · ${daten.anzahlTes} verschiedene TEs mit Positionsabweichung · ${daten.anzahlPositionen} abweichende Positionen (Produkt je Anlieferung) · ${esc(bereichLabel(this._bereich))}${suche ? ` · ${gruppen.length} von ${daten.gruppen.length} Gruppen angezeigt` : ''}</p>
        ${daten.ohneLieferant || daten.nichtBewertbar || daten.ohneProduktdaten ? `<p class="lb-context">Datenlücken: ${daten.ohneLieferant} Produktzeilen ohne Lieferantenzuordnung · ${daten.nichtBewertbar} Produktzeilen ohne bewertbare Mengenabweichung · ${daten.ohneProduktdaten} TE-/Lieferantenzuordnungen ohne Produktdaten. Warensender mit fehlenden Mengendaten bleiben sichtbar.</p>` : ''}
        ${gruppen.length ? `<div class="lb-scroll" tabindex="0" role="region" aria-label="Warensender und Mengenabweichungen scrollen"><table class="lb-table lb-mengen-table"><thead><tr>
          ${spalten.map(([f,label]) => `<th scope="col" aria-sort="${feld === f ? richtung === 1 ? 'ascending' : 'descending' : 'none'}"><button type="button" data-lm-sort="${f}">${label} ${feld === f ? richtung === 1 ? '↑' : '↓' : '↕'}</button></th>`).join('')}
        </tr></thead><tbody>${gruppen.map(g => `<tr>
          <td>${esc(g.lieferantLabel)}<small>${g.lieferantNr ? 'Nr. ' + esc(g.lieferantNr) : 'Zuordnung über Bezeichnung'}</small></td>
          <td>${esc(g.transportmittelLabel)}</td><td class="lb-num">${fmtNum(g.anzahlTe)}${g.anzahlTesMitDatenluecke ? `<small>${g.anzahlTesMitDatenluecke} TEs mit Datenlücken</small>` : ''}</td><td class="lb-num">${fmtNum(g.anzahlPositionen)}</td>
          <td class="lb-num${g.anzahlPositionen ? ' lb-diff' : ''}">${g.differenzmenge == null ? (g.nullpositionen && !g.nichtBewertbar && !g.ohneProduktdaten ? 'Ausgeschlossen' : 'n. b.') : esc(fmtDelta(g.differenzmenge))}${g.nullpositionen ? `<small>${g.nullpositionen} Nullpositionen separat ausgeschlossen</small>` : ''}${g.nichtBewertbar || g.ohneProduktdaten ? `<small>${g.differenzmenge != null ? 'Teilsumme · ' : ''}Mengendaten unvollständig</small>` : g.differenzmenge === 0 ? `<small>${g.anzahlPositionen ? 'Gegenläufige Abweichungen' : 'Keine Positionsabweichung'}</small>` : ''}</td>
          <td>${esc(g.einheitLabel)}</td><td>${esc(g.hwgLabel)}</td>
        </tr>`).join('')}</tbody></table></div>` : `<div class="fb-detail-empty">${suche ? 'Keine Warensender für diese Suche.' : 'Keine zuordenbaren Warensender im ausgewählten Zeitraum.'}</div>`}
        <details class="pz-info"><summary>Berechnung und Einordnung</summary>
          <p>Eine Zeile je Lieferant, Transportmittel, Mengeneinheit und Hauptwarengruppe (HWG). Die Tabelle enthält alle zuordenbaren Warensender des ausgewählten Zeitraums ohne Begrenzung auf fünf oder zehn Einträge. Warensender ohne Positionsabweichung erscheinen mit 0; fehlende Mengen ergeben „n. b.“ oder eine ausdrücklich gekennzeichnete Teilsumme.</p>
          <p>TE-Zahl mit Differenz = verschiedene interne TE-Nummern mit mindestens einer endlichen Positionsabweichung ungleich 0 innerhalb der Gruppe. Positionenzahl = unterschiedliche Produkte je TE, Anlieferung und Einheit mit Abweichung; Produkt dient als Positionsersatz. Nullpositionen (Ist=0) sind separat ausgeschlossen. Alle Abweichungen zählen, auch innerhalb der Mengentoleranz. Differenzmenge = Nettosumme der vorzeichenbehafteten Abweichungen (Ist − Soll); sie kann 0 sein, obwohl Positionen abweichen. Eine Nettosumme von 0 ersetzt nicht die Positionsbewertung mit der eingestellten Toleranz. Einheiten werden getrennt summiert. Eine TE kann in mehreren Gruppen erscheinen; die TE-Spalte ist über Gruppen hinweg nicht addierbar.</p>
          <p>Lieferant und Transportmittel werden je Produktzeile zugeordnet; damit sind auch TEs mit mehreren eindeutig zugeordneten Lieferanten in dieser Positionsauswertung enthalten. Fehlender Lieferant wird separat gezählt, fehlendes Transportmittel, Einheit oder HWG werden sichtbar ausgewiesen. HWG = Hauptwarengruppe. Bewertungsmodus, Suche in der Bewertungstabelle und TE-Listenfilter begrenzen diese Tabelle nicht.</p>
        </details>`;
      this._analyseUiNachRender(host, uiScroll);
    }

    _renderLieferanten() {
      const host = this._$('lieferanten-vergleich'); if (!host) return;
      const uiScroll = this._analyseUiVorRender(host);
      const tes = this._tesZeitraum(), daten = aggregiereLieferanten(tes);
      this._renderLieferantenMengen(tes);
      const nullHost=this._$('nullpositionen-uebersicht');
      if(nullHost){const ui=this._analyseUiVorRender(nullHost);nullHost.innerHTML=this._nullpositionenHTML(tes);this._analyseUiNachRender(nullHost,ui);}
      const trendHost = this._$('lieferanten-trend');
      if (trendHost) {
        const trendUi = this._analyseUiVorRender(trendHost);
        const zugeordneteTes = daten.gruppen.flatMap(g => g.tes);
        trendHost.innerHTML = this._bewertungTrendHTML(
          lieferantMengentreueTrend({tes:zugeordneteTes}),
          'allen eindeutig zugeordneten Lieferanten', 'mengentreu', true);
        this._analyseUiNachRender(trendHost, trendUi);
      }
      const suchtext = (this._lieferantenSuche ?? '').trim().toLocaleLowerCase('de');
      const feld = ['name', 'anzahl', 'mengentreu'].includes(this._lieferantenSort) ? this._lieferantenSort : 'mengentreu', richtung = this._lieferantenRichtung ?? 1;
      const wert = (g, f) => f === 'name' ? g.label : f === 'anzahl' ? g.tes.length
        : g.basis[f].wert;
      const rangliste = schlechtesteLieferanten(daten.gruppen);
      const modus = this._lieferantenModus === 'schlechteste' ? 'schlechteste' : 'alle';
      const grundmenge = modus === 'schlechteste' ? rangliste : daten.gruppen;
      const ohneMengentreue = daten.gruppen.filter(g => g.basis.mengentreu.wert == null).length;
      const summen = bewertungsSummen(daten.gruppen, 'mengentreu');
      const gruppen = grundmenge.filter(g => !suchtext || `${g.label} ${g.nr ?? ''}`.toLocaleLowerCase('de').includes(suchtext))
        .sort((a,b) => {
          const x = wert(a,feld), y = wert(b,feld);
          if (x == null || y == null) { if (x == null && y != null) return 1; if (y == null && x != null) return -1; }
          const delta = typeof x === 'string' ? x.localeCompare(y,'de') : (x ?? 0) - (y ?? 0);
          return delta * richtung || (a.rang ?? 9999)-(b.rang ?? 9999) || a.label.localeCompare(b.label,'de') || a.key.localeCompare(b.key,'de');
        });
      const fmt = v => v == null ? 'n. b.' : new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(v);
      const quoteCell = (g,f) => { const q = g.basis[f]; return `<td><strong>${fmt(q.wert)}${q.wert == null ? '' : ' %'}</strong>
        <div class="lb-track" aria-hidden="true"><span style="width:${q.wert ?? 0}%"></span></div>
        <small>${q.ok} erfüllt / ${q.bewertbar} bewertbar · ${q.nb} n. b.</small></td>`; };
      const cols = [['name','Lieferant'],['anzahl','TEs'],['mengentreu','Mengentreue']];
      let detailGruppe = this._lieferantDetailKey == null ? null
        : daten.gruppen.find(g => g.key === this._lieferantDetailKey) ?? null;
      if (detailGruppe && !gruppen.some(g => g.key === detailGruppe.key)) detailGruppe = null;
      if (!detailGruppe) this._lieferantDetailKey = null;
      host.innerHTML = `<p class="lb-context">${daten.gruppen.length} eindeutig zugeordnete Lieferanten · ${modus === 'schlechteste' ? `${rangliste.length} nach niedrigster Mengentreue ausgewählt` : 'alle Lieferanten im Zeitraum'}${suchtext ? ` · ${gruppen.length} Treffer` : ''} · ${esc(bereichLabel(this._bereich))}</p>
        ${ohneMengentreue ? `<p class="lb-context">${ohneMengentreue} Lieferanten ohne bewertbare Mengendaten ${modus === 'schlechteste' ? 'sind von der Zehnerauswahl ausgeschlossen.' : 'sind als „n. b.“ sichtbar.'}</p>` : ''}
        ${daten.fehlend || daten.mehrdeutig ? `<p class="lb-context">Aus der Bewertung ausgeschlossen: ${daten.fehlend} TEs ohne Lieferant · ${daten.mehrdeutig} TEs mit mehreren oder unklaren Lieferantenzuordnungen.</p>` : ''}
        ${this._bewertungsSummenHTML(summen, 'TEs mit Mengenabweichung', `nicht mengentreu bei ${this._cfg?.mengenToleranzPct ?? 0} % Toleranz`)}
        ${gruppen.length ? `<div class="lb-scroll" tabindex="0" role="region" aria-label="Lieferantenbewertung scrollen"><table class="lb-table"><thead><tr>${cols.map(([f,l]) => `<th scope="col" aria-sort="${feld === f ? richtung === 1 ? 'ascending' : 'descending' : 'none'}"><button data-lb-sort="${f}">${l} ${feld === f ? richtung === 1 ? '↑' : '↓' : '↕'}</button></th>`).join('')}</tr></thead><tbody>
        ${gruppen.map(g => { const offen = this._lieferantDetailKey === g.key; const token = encodeURIComponent(g.key); return `<tr><th scope="row"><button class="fb-name-btn" data-lb-detail="${esc(token)}" aria-expanded="${offen}" aria-controls="lieferant-detail">${g.rang ? `${g.rang}. ` : ''}${esc(g.label)}<span class="fb-chevron" aria-hidden="true">${offen ? '▾' : '›'}</span><small>${g.nr ? 'Nr. ' + esc(g.nr) : 'Zuordnung nur über Bezeichnung'} · Details öffnen</small></button></th><td><strong>${g.tes.length}</strong></td>${quoteCell(g,'mengentreu')}</tr>${offen ? `<tr class="lb-inline-detail-row"><td colspan="3">${this._lieferantDetailHTML(g)}</td></tr>` : ''}`; }).join('')}
        </tbody></table></div>` : `<p class="lb-context">${tes.length ? suchtext ? 'Keine Lieferanten für diese Auswahl.' : modus === 'schlechteste' ? 'Keine Lieferanten mit bewertbaren Mengendaten.' : 'Keine zugeordneten Lieferanten.' : 'Keine Transporteinheiten im ausgewählten Zeitraum.'}</p>`}
        <details class="pz-info"><summary>Berechnung und Einordnung</summary><p>„Alle“ zeigt sämtliche eindeutig zugeordneten Lieferanten, auch ohne bewertbare Mengendaten. „10 schlechteste“ zeigt die maximal zehn niedrigsten bewertbaren Mengentreuequoten. Gleichstände: mehr bewertbare TEs, dann Name und Schlüssel. Suche und Spaltensortierung wirken innerhalb der gewählten Ansicht. Eine offene Analyse schließt sich, wenn der Lieferant durch Ansicht, Suche oder Zeitraum nicht mehr sichtbar ist.</p><p>Jede eindeutig zugeordnete TE zählt einmal. Lieferantennummern haben Vorrang; fehlt die Nummer, wird über die Bezeichnung gruppiert. Unterschiedliche Nummern bleiben auch bei gleichem Namen getrennt. Neue Lieferanten werden bei jeder Zeitraum- oder Datenänderung berücksichtigt.</p>
        <p>Quoten = erfüllte TEs / bewertbare TEs. Nicht bewertbare TEs werden separat ausgewiesen. Mengentoleranz je Position: ${this._cfg?.mengenToleranzPct ?? 0} %. Alle regulären Positionen müssen sie erfüllen; Abweichungen gleichen sich nicht aus. Ist=0 wird separat ausgeschlossen. Rote Balken zeigen die Quote von 0 bis 100 %, ohne zusätzliche Zielwerte oder Gesamtnote.</p>
        <p>Lieferanten werden anhand der Mengentreue bewertet. Pünktlichkeit gehört zur Bewertung des Frachtführers/Spediteurs. OTIF beschreibt die kombinierte Liefererfüllung und wird nicht als Lieferantenrangfolge verwendet. Durchlaufzeiten werden im Reiter Durchlaufzeiten ausgewertet. Zeitraumzuordnung und Mengentreueregeln entsprechen der Gesamtübersicht; TE-Listenfilter begrenzen diese Bewertung nicht.</p></details>`;
      this._analyseUiNachRender(host, uiScroll);
    }

    _spediteurDetailHTML(gruppe) {
      if (!gruppe) return '';
      const toleranz = this._cfg?.toleranzMin ?? 30;
      const abweichungen = spediteurAbweichungen(gruppe, toleranz);
      const trend = spediteurPuenktlichkeitTrend(gruppe);
      const zeilen = abweichungen.map(a => `<tr>
        <td>${esc(fmtDate(a.geplantStart))}</td><td>${esc(a.te ?? '–')}</td><td>${esc(a.teExt ?? '–')}</td>
        <td>${esc(fmtDateTimeVoll(a.geplantStart))}</td>
        <td>${esc(fmtDateTimeVoll(a.ankunft))}</td>
        <td>+${fmtAbweichungMin(a.abweichungMin)}</td>
      </tr>`).join('');
      return `<section id="spediteur-detail" class="fb-detail" data-partner-key="${esc(gruppe.key)}" aria-label="Pünktlichkeitsanalyse von ${esc(gruppe.label)}">
        <div class="fb-detail-head"><div><div class="fb-detail-title">${esc(gruppe.label)}${gruppe.transportLabel ? ` · ${esc(gruppe.transportLabel)}` : ''} · Pünktlichkeitsanalyse</div>
          <div class="lb-context">${gruppe.basis.puenktlich.bewertbar} TEs zeitlich bewertbar · ${abweichungen.length} verspätet · ${esc(bereichLabel(this._bereich))}</div></div>
          <button class="fb-detail-close" data-fb-detail-close aria-label="Detailanalyse schließen">Schließen</button></div>
        <section class="lb-analysis-block"><div class="lb-analysis-title">TEs mit Pünktlichkeitsabweichung</div>
          ${abweichungen.length ? `<div class="lb-scroll" tabindex="0" role="region" aria-label="Verspätete TEs des Frachtführers scrollen"><table class="lb-table fb-detail-table"><thead><tr>
            <th scope="col">Datum</th><th scope="col">Interne TE-Nummer</th><th scope="col">Externe TE-Nummer</th><th scope="col">Geplanter Start ab</th><th scope="col">Ankunft am Kontrollpunkt</th><th scope="col">Abweichung</th>
          </tr></thead><tbody>${zeilen}</tbody></table></div>`
          : `<div class="fb-detail-empty">Für diesen Frachtführer/Spediteur gibt es im ausgewählten Zeitraum keine TE, deren Ankunft später als geplanter Start plus ${toleranz} Minuten liegt.</div>`}
        </section>
        ${this._spediteurTrendHTML(trend, `${gruppe.label}${gruppe.transportLabel ? ` · ${gruppe.transportLabel}` : ''}`)}
        <div class="lb-context">Die Tabelle zeigt ausschließlich TEs mit bewertbaren Plan- und Ankunftsstempeln, die später als Planstart plus ${toleranz} Minuten angekommen sind. Angezeigte Abweichung = Ankunft minus geplanter Start ohne Abzug der Toleranz. Datum = geplanter Start. Die Tagesquote im Diagramm zählt alle zeitlich bewertbaren TEs dieser Frachtführer-/Transportmittelzeile; die Zeitraumzuordnung folgt dem gemeinsamen Widget-Zeitraum.</div>
      </section>`;
    }

    _renderSpediteureGesamt(tes) {
      const host = this._$('spediteure-gesamt'); if (!host) return;
      const uiScroll = this._analyseUiVorRender(host);
      const daten = spediteurePuenktlichkeitGesamt(tes, this._cfg?.toleranzMin ?? 30);
      const modus = this._spediteureModus === 'schlechteste' ? 'schlechteste' : 'alle';
      const topKeys = new Set(schlechtesteSpediteure(aggregiereSpediteure(tes).gruppen).map(g => g.key));
      const suche = (this._spediteureGesamtSuche ?? '').trim().toLocaleLowerCase('de');
      const cols = [['label','Frachtführer/Spediteur'],['transportLabel','Transportmittel'],['anzahl','TEs gesamt'],['puenktlich','Pünktliche TEs'],['verspaetet','Verspätete TEs'],['nb','Nicht bewertbar'],['quote','Pünktlichkeit'],['summe','Summe Verspätung (min)'],['mittel','Ø Verspätung (min)']];
      const feld = cols.some(([f]) => f === this._spediteureGesamtSort) ? this._spediteureGesamtSort : 'verspaetet';
      const richtung = this._spediteureGesamtRichtung ?? -1;
      const gruppen = daten.gruppen.filter(g => (modus === 'alle' || topKeys.has(g.carrierKey)) && (!suche || `${g.label} ${g.nr ?? ''} ${g.transportLabel}`.toLocaleLowerCase('de').includes(suche)));
      gruppen.sort((a,b) => {
        const x=a[feld], y=b[feld]; if (x == null && y != null) return 1; if (y == null && x != null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y,'de') : (x ?? 0)-(y ?? 0))*richtung || a.key.localeCompare(b.key,'de');
      });
      if (!gruppen.some(g => g.key === this._spediteurDetailKey)) this._spediteurDetailKey = null;
      host.innerHTML = `<p class="lb-context">${daten.anzahlSpediteure} Frachtführer/Spediteure · ${daten.anzahlTes} zugeordnete TEs · ${daten.verspaetet} verspätete TEs · ${modus === 'schlechteste' ? `die ${topKeys.size} niedrigsten bewertbaren Pünktlichkeitsquoten` : 'alle Frachtführer'} · ${esc(bereichLabel(this._bereich))}${suche ? ` · ${gruppen.length} von ${daten.gruppen.length} Zeilen angezeigt` : ''}</p>
        ${daten.fehlend || daten.mehrdeutig ? `<p class="lb-context">Nicht zugeordnet: ${daten.fehlend} TEs ohne Frachtführer · ${daten.mehrdeutig} TEs mit mehrdeutiger Frachtführerzuordnung.</p>` : ''}
        ${gruppen.length ? `<div class="lb-scroll" tabindex="0" role="region" aria-label="Frachtführerbewertung nach Transportmittel scrollen"><table class="lb-table lb-mengen-table"><thead><tr>${cols.map(([f,l]) => `<th scope="col" aria-sort="${feld === f ? richtung === 1 ? 'ascending' : 'descending' : 'none'}"><button type="button" data-fg-sort="${f}">${l} ${feld === f ? richtung === 1 ? '↑' : '↓' : '↕'}</button></th>`).join('')}</tr></thead><tbody>${gruppen.map(g => `<tr>
          <th scope="row"><button type="button" class="fb-name-btn" data-fb-detail="${esc(encodeURIComponent(g.key))}" aria-expanded="${this._spediteurDetailKey === g.key}" aria-controls="spediteur-detail">${esc(g.label)}<span class="fb-chevron" aria-hidden="true">${this._spediteurDetailKey === g.key ? '▾' : '›'}</span><small>${g.nr ? 'Schlüssel ' + esc(g.nr) : 'Zuordnung über Bezeichnung'} · Details öffnen</small></button></th><td>${esc(g.transportLabel)}</td>
          <td class="lb-num">${g.anzahl}</td><td class="lb-num">${g.puenktlich}</td><td class="lb-num${g.verspaetet ? ' lb-diff' : ''}">${g.verspaetet}</td><td class="lb-num">${g.nb}</td>
          <td class="lb-num">${g.quote == null ? 'n. b.' : fmtProzent(g.quote)}<div class="lb-track" aria-hidden="true"><span style="width:${g.quote ?? 0}%"></span></div></td>
          <td class="lb-num">${g.summe == null ? 'n. b.' : fmtMenge(g.summe)}</td><td class="lb-num">${g.mittel == null ? '–' : fmtMenge(g.mittel)}</td>
        </tr>${this._spediteurDetailKey === g.key ? `<tr class="lb-inline-detail-row"><td colspan="9">${this._spediteurDetailHTML(g)}</td></tr>` : ''}`).join('')}</tbody></table></div>` : `<div class="fb-detail-empty">${suche ? 'Keine Frachtführer für diese Suche.' : modus === 'schlechteste' ? 'Keine Frachtführer mit bewertbarer Pünktlichkeit.' : 'Keine eindeutig zugeordneten Frachtführer im ausgewählten Zeitraum.'}</div>`}
        <details class="pz-info"><summary>Berechnung und Einordnung</summary>
          <p>Alle eindeutig zugeordneten Frachtführer/Spediteure des ausgewählten Zeitraums, eine Zeile je Frachtführer und Transportmittel. Jede interne TE zählt einmal. „Alle“ zeigt sämtliche Frachtführer einschließlich nicht bewertbarer Gruppen. „10 schlechteste“ wählt höchstens zehn Frachtführer nach ihrer gesamten bewertbaren Pünktlichkeitsquote, bei Gleichstand nach mehr bewertbaren TEs, Name und Schlüssel. Je Frachtführer können mehrere Transportmittelzeilen sichtbar sein; die Quote in der Zeile gilt nur für dieses Transportmittel. Die TE-Listenfilter begrenzen diese Tabelle nicht.</p>
          <p>Pünktlichkeit = pünktliche / zeitlich bewertbare TEs × 100. Verspätet = Ankunft am Kontrollpunkt nach geplantem Start plus ${this._cfg?.toleranzMin ?? 30} Minuten Toleranz. Frühe Ankünfte gelten entsprechend der bestehenden Widgetregel als pünktlich. Fehlende oder ungültige Zeitstempel ergeben „nicht bewertbar“ und bleiben sichtbar.</p>
          <p>Verspätung = Ankunft − geplanter Start. Summe und Durchschnitt beziehen sich ausschließlich auf verspätete TEs und enthalten die volle Verspätung, ohne Abzug der Toleranz. Ohne verspätete TEs beträgt die Summe 0 und der Durchschnitt ist „–“; ohne bewertbare TEs ist die Summe „n. b.“. Zeitraumzuordnung entspricht der Gesamtübersicht.</p>
        </details>`;
      this._analyseUiNachRender(host, uiScroll);
    }

    _renderSpediteure() {
      const tes = this._tesZeitraum(), daten = aggregiereSpediteure(tes);
      this._renderSpediteureGesamt(tes);
      const trendHost = this._$('spediteure-trend');
      if (trendHost) {
        const trendUi = this._analyseUiVorRender(trendHost);
        const zugeordneteTes = daten.gruppen.flatMap(g => g.tes);
        trendHost.innerHTML = this._bewertungTrendHTML(
          spediteurPuenktlichkeitTrend({tes:zugeordneteTes}),
          'allen eindeutig zugeordneten Frachtführern/Spediteuren', 'puenktlich', true);
        this._analyseUiNachRender(trendHost, trendUi);
      }
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
    _renderDurchlaufTrend(tes) {
      const host = this._$('durchlauf-trend');
      if (!host) return;
      const uiScroll = this._analyseUiVorRender(host);
      const id = this._durchlaufTrendArt === 'operativ' ? 'operativ' : 'gesamt';
      const modus = this._prozessModus === 'median' ? 'median' : 'mittel';
      const statistik = modus === 'median' ? 'Median' : 'Durchschnitt';
      const daten = durchlaufzeitTrend(tes, id), punkteDaten = daten.filter(d => Number.isFinite(d[modus]));
      const knoepfe = `<div class="pz-switch" aria-label="Durchlaufzeitart wählen">
        <button type="button" data-dlz-trend="gesamt" aria-pressed="${id === 'gesamt'}">Gesamt</button>
        <button type="button" data-dlz-trend="operativ" aria-pressed="${id === 'operativ'}">Operativ</button></div>`;
      const statistikKnoepfe = `<div class="pz-switch" role="group" aria-label="Statistik für alle Prozesszeiten wählen">
        <button type="button" data-dlz-statistik="mittel" aria-pressed="${modus === 'mittel'}">Durchschnitt</button>
        <button type="button" data-dlz-statistik="median" aria-pressed="${modus === 'median'}">Median</button></div>`;
      const titel = `<div class="dlz-trend-head"><div class="lb-analysis-title">Verlauf Durchlaufzeit in Minuten · ${statistik}</div><div class="dlz-trend-controls"><div class="dlz-trend-control"><span>Statistik</span>${statistikKnoepfe}</div><div class="dlz-trend-control"><span>Dauer</span>${knoepfe}</div></div></div>`;
      const text = id === 'gesamt' ? 'Ankunft → vollständige Fertigstellung' : 'Entladestart → vollständige Fertigstellung';
      if (!punkteDaten.length) {
        host.innerHTML = `<section class="lb-trend dlz-trend">${titel}<div class="fb-detail-empty">Im ausgewählten Zeitraum gibt es keine bewertbaren ${id === 'gesamt' ? 'Gesamt-' : 'operativen '}Durchlaufzeiten.</div></section>`;
      } else {
        const W = 1000, H = 304, L = 78, R = 78, T = 50, B = 54;
        const breite = W-L-R, hoehe = H-T-B, max = Math.max(...punkteDaten.map(d => d[modus]));
        const schritt = runderAchsenSchritt(max/4);
        const ymax = Math.max(schritt, Math.ceil(max/schritt)*schritt);
        const erster = punkteDaten[0].datum.getTime(), letzter = punkteDaten[punkteDaten.length-1].datum.getTime();
        const x = datum => erster === letzter ? L+breite/2 : L+(datum.getTime()-erster)*breite/(letzter-erster);
        const y = wert => T+(1-wert/ymax)*hoehe;
        const fmt = n => n.toLocaleString('de-DE',{maximumFractionDigits:1});
        const punkte = punkteDaten.map(d => ({...d,x:x(d.datum),y:y(d[modus])}));
        const linienpunkte = punkte.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        const raster = Array.from({length:Math.round(ymax/schritt)+1},(_,i) => {
          const wert = ymax-schritt*i, py = y(wert);
          return `<line class="lb-chart-grid" x1="${L}" y1="${py}" x2="${W-R}" y2="${py}"></line>
            <text class="lb-chart-label" x="${L-9}" y="${py+4}" text-anchor="end">${fmt(wert)}</text>`;
        }).join('');
        const dates = trendDatumsAchse(punkte, H-B, H-22, T, L, W-R);
        const werte = punkte.length <= 8 ? new Set(punkte.map((_,i)=>i))
          : new Set([0,punkte.length-1,punkte.reduce((best,p,i,a)=>p[modus]>a[best][modus]?i:best,0)]);
        const kreise = punkte.map((p,i) => `<circle class="lb-chart-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4">
            <title>${fmtDate(p.datum)}: ${fmtProzessMin(p[modus])} ${statistik} · ${p.n} TEs auswertbar · ${p.fehlend} fehlend · ${p.ungueltig} ungültig</title></circle>
            ${werte.has(i) ? `<text class="lb-chart-value" x="${(p.x+(i===0?8:i===punkte.length-1?-8:0)).toFixed(1)}" y="${(p.y<T+16?p.y+19:p.y-10).toFixed(1)}" text-anchor="${i===0?'start':i===punkte.length-1?'end':'middle'}">${fmt(p[modus])}</text>` : ''}`).join('');
        const fehlend = daten.reduce((sum,d)=>sum+d.fehlend,0), ungueltig = daten.reduce((sum,d)=>sum+d.ungueltig,0);
        host.innerHTML = `<section class="lb-trend dlz-trend" aria-label="Täglicher Verlauf der ${id === 'gesamt' ? 'Gesamt-' : 'operativen '}Durchlaufzeit">
          ${titel}<p class="lb-trend-caption">${text} · ${punkteDaten.length} Tageswerte · ${punkteDaten.reduce((sum,d)=>sum+d.n,0)} auswertbare TEs${fehlend ? ` · ${fehlend} ohne vollständiges Zeitpaar` : ''}${ungueltig ? ` · ${ungueltig} mit ungültiger Zeitfolge` : ''}</p><div class="lb-chart-scroll" tabindex="0" role="region" aria-label="Diagramm ${statistik} der ${id === 'gesamt' ? 'Gesamt-' : 'operativen '}Durchlaufzeit horizontal scrollen"><svg class="lb-trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${statistik} der ${id === 'gesamt' ? 'Gesamt-' : 'operativen '}Durchlaufzeit je Tag in Minuten">
            <title>${statistik} der Durchlaufzeit je Tag in Minuten</title>${raster}
            <line class="lb-chart-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"></line>
            <line class="lb-chart-axis" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"></line>
            <text class="lb-chart-label" transform="translate(18 ${T+hoehe/2}) rotate(-90)" text-anchor="middle">Minuten</text>
            ${dates}<polyline class="lb-chart-line" points="${linienpunkte.join(' ')}"></polyline>${kreise}
          </svg></div><details class="lb-chart-info"><summary>Berechnung und Darstellung</summary><div class="lb-context">${text} · Tageswert: ${statistik} der bewertbaren TEs nach Zeitraumanker. ${fehlend} TEs ohne vollständiges Zeitpaar · ${ungueltig} mit ungültiger Zeitfolge. Die Linie verbindet vorhandene Tageswerte; Tage ohne bewertbare TEs haben keinen Datenpunkt. Tagesbeschriftungen stehen unter den zugehörigen Punkten; ab mehr als 120 Tagen werden Monate beschriftet. Jahresangaben stehen über den Abschnitten, vollständige Daten am Punkt. Der Statistikwechsel gilt auch für Prozesszeiten und Transportmittelvergleich. Die Durchlaufzeitkarte im Vorperiodenvergleich zeigt weiterhin den Durchschnitt. Listenfilter gelten nur für die TE-Liste.</div></details>
        </section>`;
      }
      this._analyseUiNachRender(host, uiScroll);
      host.onclick = e => {
        const button = e.target.closest('[data-dlz-trend], [data-dlz-statistik]');
        if (!button || !host.contains(button)) return;
        if (button.dataset.dlzStatistik) {
          const metric = button.dataset.dlzStatistik;
          if (!['mittel','median'].includes(metric)) return;
          this._prozessModus = metric;
          const prozessHost = this._$('prozesszeiten');
          const scroll = prozessHost?.querySelector('.pz-matrix-scroll')?.scrollLeft ?? 0;
          this._renderProzesszeiten();
          this._analyseStatus(`${metric === 'median' ? 'Median' : 'Durchschnitt'} für Prozesszeiten ausgewählt.`);
          const wrapper = prozessHost?.querySelector('.pz-matrix-scroll');
          if (wrapper) wrapper.scrollLeft = scroll;
          host.querySelector(`[data-dlz-statistik="${metric}"]`)?.focus({preventScroll:true});
          return;
        }
        this._durchlaufTrendArt = button.dataset.dlzTrend;
        this._analyseStatus(`${this._durchlaufTrendArt === 'operativ' ? 'Operative' : 'Gesamt-'}Durchlaufzeit ausgewählt.`);
        this._renderDurchlaufTrend(this._tesZeitraum());
        host.querySelector(`[data-dlz-trend="${this._durchlaufTrendArt}"]`)?.focus({preventScroll:true});
      };
    }

    _renderProzesszeiten() {
      const host = this._$('prozesszeiten');
      if (!host) return;
      const tes = this._tesZeitraum();
      this._renderDurchlaufTrend(tes);
      if (!tes.length) {
        host.innerHTML = '<div class="u-leer">Keine Transporteinheiten im ausgewählten Zeitraum.</div>';
        return;
      }
      const daten = aggregiereProzesszeiten(tes);
      const phasen = daten.filter(d => !d.gesamt);
      const modus = this._prozessModus === 'median' ? 'median' : 'mittel';
      const label = modus === 'median' ? 'Median' : 'Durchschnitt';
      const prefix = modus === 'median' ? '' : 'Ø ';
      const gesamtKarten = ['gesamt', 'operativ'].map(id => daten.find(d => d.id === id));
      const longest = phasen.filter(d => d[modus] != null).reduce((a, b) => !a || b[modus] > a[modus] ? b : a, null);
      const focus = phasen.find(d => d.id === this._prozessFokus) ?? longest ?? phasen[0];
      const top = Math.max(1, ...phasen.map(d => d[modus] ?? 0));
      const step = top <= 20 ? 5 : top <= 100 ? 25 : top <= 400 ? 100 : Math.pow(10, Math.floor(Math.log10(top)));
      const skala = Math.ceil(top / step) * step;
      const num = n => n == null ? '–' : n.toLocaleString('de-DE', {maximumFractionDigits:1});
      host.innerHTML = `<div class="pz-totals">
        ${gesamtKarten.map(d => `<section class="pz-card pz-total ${d.id === 'gesamt' ? 'pz-overall' : ''}" data-prozess="${d.id}">
          <div class="pz-kicker">${esc(d.label)}</div>
          <div class="pz-big">${prefix}${num(d[modus])} <small>min</small></div>
          <div class="pz-sub">${esc(d.strecke)}</div>
          <span class="pz-pill">${label} · ${d.n} / ${tes.length} TEs auswertbar</span>
        </section>`).join('')}
      </div><div class="pz-sub pz-cohort-note">Beide Kennzahlen enden bei der vollständigen Fertigstellung aller Positionen. Bestandsarten bleiben unberücksichtigt. Unterschiedliche Fallzahlen sind bei fehlenden Zeitstempeln möglich.</div>
      <div class="pz-dashboard">
        <section class="pz-chart" aria-label="Prozesszeiten im Vergleich">
          <div class="pz-head"><div><div class="pz-title">Durchlaufzeit</div>
            <div class="pz-sub">${esc(bereichLabel(this._bereich))} · ${tes.length} TEs im Zeitraum</div></div>
            <div class="pz-switch" aria-label="Statistik wählen">
              <button data-pz-modus="mittel" aria-pressed="${modus === 'mittel'}">Durchschnitt</button>
              <button data-pz-modus="median" aria-pressed="${modus === 'median'}">Median</button>
            </div></div>
          <div aria-label="${label} je Prozessphase in Minuten">${phasen.map((d,i) => `
            <button class="pz-plot-row" data-prozess="${d.id}" data-pz-fokus="${d.id}" aria-pressed="${d.id === focus.id}"
              aria-label="${esc(d.label)}: ${d[modus] == null ? 'nicht bewertbar' : fmtProzessMin(d[modus])}. Details anzeigen">
              <div class="pz-phase"><span class="pz-step">PHASE 0${i+1}</span>${esc(d.label)}</div>
              <div class="pz-track" aria-hidden="true"><div class="pz-bar${longest && d.id === longest.id ? ' pz-longest' : ''}" style="width:${d[modus] == null ? 0 : 100*d[modus]/skala}%"></div></div>
              <div class="pz-chart-value">${num(d[modus])}<span class="pz-step">MINUTEN</span></div>
            </button>`).join('')}</div>
          <div class="pz-axis" aria-hidden="true"><span></span><div class="pz-ticks">${[0,1,2,3,4].map(i=>`<span>${num(skala*i/4)}</span>`).join('')}</div><span></span></div>
          <div class="pz-legend"><span><i class="pz-dot"></i>${label} je TE</span><span><i class="pz-dot red"></i>Längste Phase · kein Zielwert</span></div>
          <div class="pz-sub">Balken anklicken für Detailwerte. Alle TEs des Zeitraums; Listenfilter gelten nur für die TE-Liste.</div>
        </section>
        <aside class="pz-side">
          <section class="pz-card pz-inspector" aria-live="polite">
            <div class="pz-kicker">Ausgewählte Phase</div><div class="pz-title" style="margin-top:10px">${esc(focus.label)}</div>
            <div class="pz-sub">${esc(focus.strecke)}</div>
            <div class="pz-metrics">${[['Durchschnitt',focus.mittel],['Median',focus.median],['Minimum',focus.min],['Maximum',focus.max]].map(([l,v])=>`<div class="pz-metric"><span>${l}</span><strong>${fmtProzessMin(v)}</strong></div>`).join('')}</div>
            <div class="pz-sub">${focus.n} / ${tes.length} TEs auswertbar</div>
            <div class="pz-coverage" aria-hidden="true"><div style="width:${focus.n/tes.length*100}%"></div></div>
            <div class="pz-sub">${focus.fehlend} unvollständig · ${focus.ungueltig} ungültige Zeitfolge</div>
          </section>
        </aside>
      </div>
      ${this._transportzeitenHTML(tes, modus)}
      ${this._teZeitstrahlHTML(tes)}
      <details class="pz-info"><summary>Detailtabelle und Berechnungsgrundlage</summary>
        <div class="pz-scroll"><table class="pz-table"><thead><tr><th scope="col">Prozess</th><th scope="col">Ø</th><th scope="col">Median</th><th scope="col">Min.</th><th scope="col">Max.</th><th scope="col">Auswertbar</th><th scope="col">Fehlend</th><th scope="col">Ungültig</th></tr></thead><tbody>
          ${daten.map(d=>`<tr><td>${esc(d.label)}</td><td>${fmtProzessMin(d.mittel)}</td><td>${fmtProzessMin(d.median)}</td><td>${fmtProzessMin(d.min)}</td><td>${fmtProzessMin(d.max)}</td><td>${d.n} / ${tes.length}</td><td>${d.fehlend}</td><td>${d.ungueltig}</td></tr>`).join('')}
        </tbody></table></div>
        Jede TE zählt je Schritt einmal. Fehlende Zeitstempel und negative Zeitdifferenzen werden ausgeschlossen; 0 Minuten sind gültig.
        Zeitraumzuordnung: geplanter Start, ersatzweise Ankunft, ersatzweise vollständige Fertigstellung.
        Einlagerung endet mit dem letzten Fertigstellungszeitstempel aller Positionen; Bestandsarten bleiben unberücksichtigt.
        Entladung: reguläres Entladeende ohne Ersatzwert; Vereinnahmung: tatsächliches Entladeende bis WE-Buchung. Die Zuordnung des regulären Stempels zum ersten Entladeende bleibt fachlich zu prüfen.
        Unterschiedliche Fallzahlen je Schritt: Phasendurchschnitte nicht zur Gesamtdauer addieren. Die beiden Durchlaufzeiten werden direkt ab Ankunft beziehungsweise Entladestart bis Fertigstellung berechnet.
      </details>`;
      host.onclick = e => {
        const button = e.target.closest('[data-pz-modus], [data-pz-fokus], [data-pz-sort], [data-pz-cell], [data-tz-te]');
        if (!button || !host.contains(button)) return;
        if (button.dataset.tzTe) {
          this.showDetail(decodeURIComponent(button.dataset.tzTe));
          return;
        }
        const metric = button.dataset.pzModus, phase = button.dataset.pzFokus;
        const sort = button.dataset.pzSort, cell = button.dataset.pzCell;
        const scroll = host.querySelector('.pz-matrix-scroll')?.scrollLeft ?? 0;
        let selector;
        if (metric) { this._prozessModus = metric; selector = `${button.closest('.pz-transport') ? '.pz-transport ' : '.pz-chart '}[data-pz-modus="${metric}"]`; }
        if (phase) { this._prozessFokus = phase; selector = `[data-pz-fokus="${phase}"]`; }
        if (sort) {
          const previous = this._tmSort ?? 'gesamt';
          this._tmRichtung = previous === sort ? -(this._tmRichtung ?? -1) : (sort === 'name' ? 1 : -1);
          this._tmSort = sort;
          selector = `[data-pz-sort="${sort}"]`;
        }
        if (cell) {
          const [key,id] = JSON.parse(decodeURIComponent(cell));
          this._tmAuswahl = {key,id};
          selector = `[data-pz-cell="${cell}"]`;
        }
        this._renderProzesszeiten();
        if (metric) this._analyseStatus(`${metric === 'median' ? 'Median' : 'Durchschnitt'} für Prozesszeiten ausgewählt.`);
        const wrapper = host.querySelector('.pz-matrix-scroll');
        if (wrapper) wrapper.scrollLeft = scroll;
        host.querySelector(selector)?.focus({preventScroll:true});
      };
      host.onchange = e => {
        const select = e.target.closest('[data-tz-datum]');
        if (!select || !host.contains(select)) return;
        this._teZeitstrahlDatum = select.value;
        this._renderProzesszeiten();
        this._shadow.querySelector('[data-tz-datum]')?.focus({preventScroll:true});
      };
    }

    _transportzeitenHTML(tes, modus) {
      const gruppen = aggregiereTransportzeiten(tes);
      const spalten = [
        {id:'anmeldung',label:'Wartezeit'}, {id:'vorlauf',label:'Entladevorlauf'},
        {id:'entladung',label:'Entladung'}, {id:'vereinnahmung',label:'Vereinnahmung'},
        {id:'einlagerung',label:'Einlagerung'}, {id:'gesamt',label:'Gesamt',gesamt:true},
        {id:'operativ',label:'Operativ',gesamt:true}
      ];
      const feld = this._tmSort ?? 'gesamt', richtung = this._tmRichtung ?? -1;
      const sortiert = sortiereTransportgruppen(gruppen,feld,richtung,modus);
      const stat = modus === 'median' ? 'Median' : 'Durchschnitt';
      const werte = Object.fromEntries(spalten.map(c=>[c.id,gruppen.map(g=>g.prozesse.find(p=>p.id===c.id)[modus])]));
      const maxima = Object.fromEntries(spalten.map(c=>[c.id,werte[c.id].reduce((m,v)=>Math.max(m,v ?? 0),0)]));
      const sortAttr = id => feld === id ? (richtung === 1 ? 'ascending' : 'descending') : 'none';
      const sortIcon = id => feld === id ? (richtung === 1 ? '↑' : '↓') : '↕';
      const gAktiv = gruppen.find(g=>this._tmAuswahl && g.key === this._tmAuswahl.key);
      const dAktiv = gAktiv?.prozesse.find(d=>d.id === this._tmAuswahl.id);
      const detail = dAktiv ? `<div class="pz-title">${esc(gAktiv.label)} · ${esc(dAktiv.label)}</div>
        <div class="pz-sub">${esc(dAktiv.strecke)}${gAktiv.key != null && gAktiv.key !== gAktiv.label ? ' · '+esc(gAktiv.key) : ''}</div>
        <div class="pz-metrics">${[['Durchschnitt',dAktiv.mittel],['Median',dAktiv.median],['Minimum',dAktiv.min],['Maximum',dAktiv.max]].map(([l,v])=>`<div class="pz-metric"><span>${l}</span><strong>${fmtProzessMin(v)}</strong></div>`).join('')}</div>
        <div class="pz-sub"><strong>${dAktiv.n} / ${gAktiv.anzahl} TEs auswertbar (${Math.round(dAktiv.n/gAktiv.anzahl*100)} %)</strong> · ${dAktiv.fehlend} unvollständig · ${dAktiv.ungueltig} ungültige Zeitfolge</div>` :
        '<div class="pz-sub">Klicke auf einen Zeitwert, um Median, Minimum, Maximum und Datenabdeckung zu sehen.</div>';
      return `<section class="pz-transport" aria-label="Durchlaufzeit nach Transportmittel">
        <div class="pz-head"><div><div class="pz-title">Durchlaufzeit nach Transportmittel</div>
          <div class="pz-sub">${stat} je TE · ${esc(bereichLabel(this._bereich))} · ${gruppen.length} Transportmittelgruppen</div></div>
          <div class="pz-switch" aria-label="Statistik der Transportmittelmatrix wählen">
            <button data-pz-modus="mittel" aria-pressed="${modus==='mittel'}">Durchschnitt</button>
            <button data-pz-modus="median" aria-pressed="${modus==='median'}">Median</button>
          </div></div>
        <div class="pz-matrix-scroll" role="region" aria-label="Transportmittelmatrix, horizontal scrollbar" tabindex="0">
          <table class="pz-matrix"><caption>Zeitwerte in Minuten · Spaltenüberschrift zum Sortieren anklicken</caption>
            <thead><tr><th scope="col" aria-sort="${sortAttr('name')}"><button class="pz-sort" data-pz-sort="name">Transportmittel <span>${sortIcon('name')}</span></button></th>
              ${spalten.map(c=>`<th scope="col" class="${c.gesamt?'pz-matrix-total':''}" aria-sort="${sortAttr(c.id)}"><button class="pz-sort" data-pz-sort="${c.id}">${c.label} <span>${sortIcon(c.id)}</span></button></th>`).join('')}
            </tr></thead><tbody>${sortiert.map(g=>`<tr>
              <th scope="row"><div class="pz-tm-label">${esc(g.label)}</div><div class="pz-sub">${g.anzahl} TEs${g.key != null && g.key!==g.label?' · '+esc(g.key):''}</div></th>
              ${spalten.map(c=>{
                const d=g.prozesse.find(p=>p.id===c.id),v=d[modus];
                const token=encodeURIComponent(JSON.stringify([g.key,c.id]));
                const selected=this._tmAuswahl?.key===g.key && this._tmAuswahl?.id===c.id;
                return `<td class="${c.gesamt?'pz-matrix-total':''}"><button class="pz-cell ${transportFarbklasse(v,werte[c.id])}" data-pz-cell="${esc(token)}" aria-pressed="${selected}"
                  aria-label="${esc(g.label)}, ${esc(d.label)}: ${v==null?'nicht bewertbar':fmtProzessMin(v)}; ${d.n} von ${g.anzahl} TEs auswertbar. Details anzeigen">
                  <strong>${v==null?'n. b.':fmtProzessMin(v)}</strong>
                  <span class="pz-cell-track" aria-hidden="true"><span class="pz-cell-fill" style="width:${v==null || maxima[c.id]===0 ? 0 : Math.max(0,Math.min(100,v/maxima[c.id]*100))}%"></span></span>
                  <small>${d.n} / ${g.anzahl} TEs</small></button></td>`;
              }).join('')}</tr>`).join('')}</tbody>
          </table></div>
        <div class="pz-matrix-legend"><span>Kürzer</span><span class="pz-scale-swatches">${[0,1,2,3,4].map(i=>`<i class="pz-heat-${i}"></i>`).join('')}</span><span>Länger</span><span>· Farbe und Balken innerhalb derselben Spalte vergleichen · keine Zielwertbewertung</span></div>
        <div class="pz-sub">Gesamt: Ankunft → Fertigstellung · Operativ: Entladestart → Fertigstellung. n. b. = nicht bewertbar. Unterschiedliche Fallzahlen beachten. Balken beginnen bei 0; der längste gültige Wert je Spalte füllt die Kachelbreite. Gleiche Zeitwerte erhalten dieselbe Farbe und Balkenlänge.</div>
        <div class="pz-matrix-detail" aria-live="polite">${detail}</div>
      </section>`;
    }

    _teZeitstrahlHTML(tes) {
      const daten = teZeitstrahlDaten(tes, this._teZeitstrahlDatum);
      this._teZeitstrahlDatum = daten.datum;
      const datumsLabel = key => {
        if (!key) return '–';
        const [jahr, monat, tag] = key.split('-').map(Number);
        return fmtDate(new Date(Date.UTC(jahr, monat - 1, tag)));
      };
      if (!daten.tage.length) return `<section class="tz-widget" aria-label="TE-Zeitstrahl">
        <div class="pz-title">TE-Zeitstrahl · Prozessverlauf</div>
        <div class="u-leer">Keine TEs mit Zeitraumzuordnung vorhanden.</div></section>`;

      const auswahl = `<div class="tz-controls"><label for="tz-datum">Tag innerhalb des ausgewählten Zeitraums</label>
        <select id="tz-datum" data-tz-datum aria-label="Tag für den TE-Zeitstrahl wählen">
          ${[...daten.tage].reverse().map(tag => `<option value="${tag}"${tag === daten.datum ? ' selected' : ''}>${datumsLabel(tag)}</option>`).join('')}
        </select></div>`;
      if (!daten.zeilen.length) return `<section class="tz-widget" aria-label="TE-Zeitstrahl">
        <div class="pz-head"><div><div class="pz-title">TE-Zeitstrahl · Prozessverlauf</div>
          <div class="pz-sub">Unterhalb der Transportmittelanalyse · Tagesansicht je TE</div></div>${auswahl}</div>
        <div class="u-leer">Für ${datumsLabel(daten.datum)} gibt es keine vollständig bewertbare Gesamtdurchlaufzeit.</div>
        <div class="tz-summary">${daten.kandidaten} TEs zugeordnet · ${daten.fehlend} mit fehlenden Zeitstempeln · ${daten.ungueltig} mit ungültiger Zeitfolge</div></section>`;

      if (daten.zuLang) return `<section class="tz-widget"><div class="pz-head"><div class="pz-title">TE-Zeitstrahl · Prozessverlauf</div>${auswahl}</div><p class="lb-context">Die Zeitstempel erstrecken sich über mehr als 90 Tage. Der Stundentakt wird für diese Tagesauswahl nicht gezeichnet. Durchlaufzeiten und Einzelanalysen bleiben verfügbar; bitte die Zeitstempel dieser TEs prüfen.</p><div class="lb-scroll" tabindex="0" role="region" aria-label="TE-Zeitstempel scrollen"><table class="lb-table"><thead><tr><th scope="col">TE</th><th scope="col">Ankunft</th><th scope="col">Fertigstellung</th><th scope="col">Durchlaufzeit</th></tr></thead><tbody>${daten.zeilen.map(z=>`<tr><td><button data-tz-te="${esc(encodeURIComponent(z.te.te))}">TE ${esc(z.te.te)} · Details</button></td><td>${fmtDateTimeVoll(new Date(z.startMs))}</td><td>${fmtDateTimeVoll(new Date(z.endeMs))}</td><td>${fmtProzessMin(z.dauerMin)}</td></tr>`).join('')}</tbody></table></div></section>`;
      const span = Math.max(1, daten.endeMs - daten.startMs);
      const pct = ms => Math.max(0, Math.min(100, (ms - daten.startMs) / span * 100));
      const startTag = datumSchluessel(new Date(daten.startMs));
      const ticks = daten.ticks.map((ms, i) => {
        const d = new Date(ms), pos = pct(ms);
        const tageswechsel = datumSchluessel(d) !== startTag && d.getUTCHours() === 0;
        const datumKurz = tageswechsel
          ? `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.`
          : null;
        return { ms, pos, label:fmtTime(d), datumKurz, tageswechsel, letzter:i === daten.ticks.length - 1 };
      });
      const stunden = Math.max(1, (daten.endeMs - daten.startMs) / 3600000);
      const stundenBreitePct = 100 / stunden;
      const schichtPos = daten.schichtSichtbar ? pct(daten.schichtMs) : null;
      const schichtLinie=(daten.schichtMarkers??[]).map(ms=>`<i class="tz-shiftline" style="left:${pct(ms).toFixed(3)}%" title="Schichtwechsel ${fmtDateTimeVoll(new Date(ms))}" aria-hidden="true"></i>`).join('');
      const zeilen = daten.zeilen.map(z => {
        const totalLeft = pct(z.startMs), totalWidth = Math.max(0, pct(z.endeMs) - totalLeft);
        const segmente = z.segmente.map(seg => {
          const left = pct(seg.startMs), width = Math.max(0, pct(seg.endeMs) - left);
          return `<span class="tz-segment tz-phase-${seg.index}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"
            title="${esc(seg.label)}: ${fmtProzessMin(seg.min)} · ${fmtDateTime(new Date(seg.startMs))}–${fmtDateTime(new Date(seg.endeMs))}" aria-hidden="true"></span>`;
        }).join('');
        const teToken = encodeURIComponent(String(z.te.te));
        const tm = !isNull(z.te.transportmittelName) ? z.te.transportmittelName : z.te.transportmittel;
        const produktInfo = teProduktKachelDaten(z.te);
        const ariaInfo = `${produktInfo.produktText}, ${produktInfo.mengenText}, ${produktInfo.palettenText}. ${produktInfo.details}`;
        return `<button class="tz-row" data-tz-te="${esc(teToken)}" aria-label="TE ${esc(z.te.te)}: ${fmtDateTime(new Date(z.startMs))} bis ${fmtDateTime(new Date(z.endeMs))}, ${fmtProzessMin(z.dauerMin)}. ${esc(ariaInfo)}. Details öffnen">
          <span class="tz-row-label" title="${esc(produktInfo.details)}"><strong>TE ${esc(z.te.te)}</strong>
            <small>${tm == null ? 'Ohne Transportmittel' : esc(tm)} · ${fmtProzessMin(z.dauerMin)}</small>
            <span class="tz-row-facts"><span>${esc(produktInfo.produktText)}</span><span>${esc(produktInfo.mengenText)}</span><span>${esc(produktInfo.palettenText)}</span></span>
            <span class="tz-row-pack"><b>Packmittel:</b> ${esc(produktInfo.packmittelText)}</span></span>
          <span class="tz-track" style="--tz-hour-width:${stundenBreitePct.toFixed(6)}%"><span class="tz-total" style="left:${totalLeft.toFixed(3)}%;width:${totalWidth.toFixed(3)}%" aria-hidden="true"></span>${segmente}${schichtLinie}</span>
        </button>`;
      }).join('');
      return `<section class="tz-widget" aria-label="TE-Zeitstrahl">
        <div class="pz-head"><div><div class="pz-title">TE-Zeitstrahl · Prozessverlauf</div>
          <div class="pz-sub">Unterhalb der Transportmittelanalyse · ${datumsLabel(daten.datum)} · gemeinsame absolute Uhrzeitachse</div></div>${auswahl}</div>
        <div class="tz-scroll" role="region" aria-label="TE-Zeitstrahl, horizontal und vertikal scrollbar" tabindex="0">
          <div class="tz-canvas" style="width:${daten.breitePx + 250}px">
            <div class="tz-axis"><div class="tz-axis-label">${datumsLabel(daten.datum)}</div><div class="tz-axis-track">
              ${ticks.map(t=>`<i class="tz-tick${t.tageswechsel ? ' tz-day-change' : ''}${t.letzter ? ' tz-last' : ''}" style="left:${t.pos.toFixed(3)}%"><span>${t.datumKurz ? `<b>${esc(t.datumKurz)}</b><em>${esc(t.label)}</em>` : esc(t.label)}</span></i>`).join('')}
              ${(daten.schichtMarkers??[]).map(ms=>`<i class="tz-shift-axis" style="left:${pct(ms).toFixed(3)}%"><span>Schichtwechsel 14:30</span></i>`).join('')}
            </div></div>${zeilen}
          </div></div>
        <div class="tz-legend">${TE_ZEITSTRAHL_PHASES.map((def,i)=>`<span class="tz-legend-item"><i class="tz-swatch tz-phase-${i}"></i>${esc(def.label)}</span>`).join('')}
          <span class="tz-legend-item"><i class="tz-shift-swatch"></i>Schichtwechsel 14:30</span></div>
        <div class="tz-summary">${daten.alleZeilen} von ${daten.kandidaten} TEs mit gültiger Gesamtdurchlaufzeit · ${daten.fehlend} mit fehlenden Zeitstempeln · ${daten.ungueltig} mit ungültiger Zeitfolge${daten.weitere ? ` · weitere ${daten.weitere} TEs aus Darstellungsgründen nicht eingeblendet` : ''}. Zeile anklicken, um die TE-Details zu öffnen.</div>
        <details class="pz-info"><summary>Darstellung und Datenregeln</summary>
          Jede Zeile zeigt die Gesamtdurchlaufzeit von Ankunft bis zur vollständigen Fertigstellung aller Positionen. Die Zeitachse verwendet durchgehend einen festen Stundentakt; bei Tageswechseln wird zusätzlich das Datum angezeigt. Mehrtägige Achsen sind horizontal scrollbar. Die fünf farbigen Abschnitte entsprechen den vorhandenen Prozessdefinitionen; bei einem fehlenden oder ungültigen Phasenpaar bleibt der betreffende Abschnitt frei. Die hervorgehobenen Linien bei 14:30 markieren den Schichtwechsel an jedem Tag innerhalb der dargestellten Achse. Phasen außerhalb der eigenen TE-Gesamtdurchlaufzeit werden nicht gezeichnet. Die Tageszuordnung folgt der Zeitraumlogik des Widgets: geplanter Start, ersatzweise Ankunft, ersatzweise vollständige Fertigstellung. Bestandsarten bleiben unberücksichtigt. Pro Tag werden höchstens ${TE_ZEITSTRAHL_MAX_ZEILEN} vollständige TEs dargestellt; die Auswertung darüber bleibt unverändert.</details>
      </section>`;
    }

    _prozessDetailHTML(te) {
      return `<div class="detail-section"><div class="d-section-title">Prozesszeiten dieser TE</div>
        <div class="pz-detail">${PROZESS_DEFS.map(def => {
          const p = prozessDauer(te, def);
          return `<div class="pz-detail-item"><div class="pz-name">${esc(def.label)}</div>
            <div class="pz-route">${esc(def.strecke)}</div>
            <div class="pz-value">${fmtProzessMin(p.min)}</div>
            ${p.grund ? `<div class="pz-stats">${p.grund === 'fehlend' ? 'Zeitstempel fehlen / Abschluss nicht vollständig' : 'Ungültige Zeitfolge'}</div>` : ''}</div>`;
        }).join('')}</div><div class="pz-note">Einlagerung: vollständige Fertigstellung aller Positionen, ohne Berücksichtigung der Bestandsarten. Entladung endet mit dem regulären Entladeende; Vereinnahmung beginnt beim tatsächlichen Entladeende.</div></div>`;
    }

    _ladestellenVerteilungHTML(aktiv) {
      const gesamt = aktiv.anzahl;
      if (!gesamt) return '';
      const farben = {BSL:'#991b1b', Container:'#c0392b', Landverkehr:'#ef6b62', 'Nicht zugeordnet':'#64748b'};
      const gruppen = (aktiv.ladestellen ?? []).filter(g => g.anzahl > 0);
      const prozent = anzahl => (anzahl / gesamt * 100).toLocaleString('de-DE', {maximumFractionDigits:1});
      const zentrum = 80, radius = 72;
      const punkt = winkel => {
        const rad = (winkel - 90) * Math.PI / 180;
        return `${(zentrum + radius * Math.cos(rad)).toFixed(2)} ${(zentrum + radius * Math.sin(rad)).toFixed(2)}`;
      };
      let winkel = 0;
      const segmente = gruppen.map(g => {
        const start = winkel, anteil = g.anzahl / gesamt * 360;
        winkel += anteil;
        const beschriftung = `${g.ls}: ${g.anzahl} TE${g.anzahl === 1 ? '' : 's'} (${prozent(g.anzahl)} %)`;
        const flaeche = anteil >= 359.999
          ? `<circle cx="80" cy="80" r="72" fill="${farben[g.ls]}"></circle>`
          : `<path d="M 80 80 L ${punkt(start)} A 72 72 0 ${anteil > 180 ? 1 : 0} 1 ${punkt(winkel)} Z" fill="${farben[g.ls]}" stroke="var(--c-bg2)" stroke-width="2"></path>`;
        return `<g>${flaeche}<title>${esc(beschriftung)}</title></g>`;
      }).join('');
      const legende = gruppen.map(g => `<li><span class="ls-verteilung-punkt" style="background:${farben[g.ls]}" aria-hidden="true"></span>
        <span class="ls-verteilung-name">${esc(g.ls)}</span>
        <span class="ls-verteilung-wert">${g.anzahl} TE${g.anzahl === 1 ? '' : 's'} · ${prozent(g.anzahl)} %</span></li>`).join('');
      return `<section aria-label="TE-Verteilung nach BW-Ladestelle">
        <div class="ls-verteilung-sub">${gesamt} TE${gesamt === 1 ? '' : 's'} im ausgewählten Zeitraum · jede TE zählt einmal · Quelle: BW-Ladestelle</div>
        <div class="ls-verteilung-inhalt">
          <svg class="ls-verteilung-grafik" viewBox="0 0 160 160" role="img" aria-label="TE-Anteile nach Ladestelle: ${esc(gruppen.map(g => `${g.ls} ${prozent(g.anzahl)} %`).join(', '))}">
            <title>TE-Anteile nach BW-Ladestelle</title>${segmente}</svg>
          <ul class="ls-verteilung-legende">${legende}</ul>
        </div>
      </section>`;
    }

    _anlieferungsKarteHTML(aktiv, vgl, vglName) {
      const q=aktiv.quote;
      const sub=`${q.bewertbar?`${q.ok} von ${q.bewertbar} Anlieferungen erfüllt`:'Keine bewertbaren Anlieferungen'} · ${q.nb} nicht bewertbar · ${aktiv.ausgeschlossen} ausgenullt, separat ausgeschlossen`
        + (aktiv.tesOhneBeleg?` · ${aktiv.tesOhneBeleg} TEs ohne Belegnummer`:'')
        + (aktiv.fehlendeBelegPositionen?` · ${aktiv.fehlendeBelegPositionen} reguläre Zeilen ohne eindeutigen Beleg`:'')
        + (aktiv.fehlendeProdukte?` · ${aktiv.fehlendeProdukte} Zeilen ohne Produktnummer`:'')
        + (aktiv.nichtZuordenbareNullpositionen?` · ${aktiv.nichtZuordenbareNullpositionen} Nullpositionen ohne Beleg separat ausgeschlossen`:'');
      const html=this._kpiCardHTML({id:'otifAnlieferung',label:'OTIF · Anlieferungen'},
        {anzahl:aktiv.anzahl,otifAnlieferung:q},{otifAnlieferung:vgl.quote},vglName);
      return html.replace(/<div class="kpi-card-sub">[\s\S]*?<\/div>/,`<div class="kpi-card-sub">${esc(sub)}</div>`);
    }

    _renderAnlieferungsOtif() {
      const host=this._$('otif-anlieferungen');if(!host)return;
      const aktiv=anlieferungsOtif(this._tesZeitraum(),[...(this._teMap?.values() ?? this._tesZeitraum())]),vp=vorperiode(this._bereich),vgl=anlieferungsOtif(this._tesZeitraum(vp),[...(this._teMap?.values() ?? this._tesZeitraum())]);
      const ui=this._analyseUiVorRender(host);
      const status=v=>v===true?'Erfüllt':v===false?'Nicht erfüllt':'Nicht bewertbar';
      const table=(zeilen,nullListe)=>`<div class="lb-scroll" tabindex="0" role="region" aria-label="${nullListe?'Ausgenullte Anlieferungen':'OTIF-Anlieferungsbelege'} scrollen"><table class="lb-table lb-analysis-table"><thead><tr>
        <th scope="col">Anlieferung / Belegnummer</th><th scope="col">Interne TE</th><th scope="col">Externe TE</th><th scope="col">Reguläre Positionen</th><th scope="col">Nullpositionen</th><th scope="col">Pünktlichkeit</th><th scope="col">Mengentreue</th><th scope="col">OTIF</th>
        </tr></thead><tbody>${zeilen.map(g=>`<tr><th scope="row">${esc(g.beleg)}</th><td>${esc(g.tes.map(te=>te.te).join(' · '))}</td><td>${esc(g.tes.map(te=>te.teExt ?? '–').join(' · '))}</td><td>${g.positionen}${g.zuordnungUnklar?'<small>Belegzuordnung unvollständig</small>':''}</td><td>${g.nullpositionen}</td><td>${esc(status(g.puenktlich))}</td><td>${g.ausgeschlossen?'Ausgeschlossen':esc(status(g.mengentreu))}</td><td>${g.ausgeschlossen?'Ausgeschlossen':esc(status(g.otif))}</td></tr>`).join('')}</tbody></table></div>`;
      const ausgeschlossen=aktiv.belege.filter(g=>g.ausgeschlossen);
      host.innerHTML=`
        <p class="lb-context">${aktiv.anzahl} verschiedene Anlieferungen · ${aktiv.quote.bewertbar} bewertbar · ${aktiv.quote.nb} nicht bewertbar · ${aktiv.ausgeschlossen} vollständig ausgenullt und separat ausgeschlossen${aktiv.fehlendeBelegPositionen||aktiv.tesOhneBeleg ? ` · ${aktiv.fehlendeBelegPositionen} Produktzeilen ohne eindeutigen Beleg · ${aktiv.tesOhneBeleg} TEs ohne Belegnummer` : ''}</p>
        ${ausgeschlossen.length ? `<details class="pz-info" data-analysis-key="delivery-zero"><summary>Ausgenullte Anlieferungen (${ausgeschlossen.length}) · separat ausgeschlossen</summary>${table(ausgeschlossen,true)}</details>`:''}
        <details class="pz-info" data-analysis-key="delivery-records"><summary>Anlieferungsbelege und Berechnung (${aktiv.regulaer})</summary>
          <p>OTIF = pünktlich und vollständig je Anlieferungsbeleg. Der Zeitraum wählt Belege aus; alle geladenen beteiligten TEs werden bewertet, auch außerhalb des Zeitraums oder ohne Zeitanker. Jede positive oder negative reguläre Positionsabweichung verhindert OTIF; die Mengentoleranz der TE-Kennzahl gilt hier nicht. Eine verspätete beteiligte TE verhindert OTIF für den Beleg. Pünktlichkeit verwendet Ankunft am Kontrollpunkt gegenüber Planstart und die bestehende Zeittoleranz.</p>
          <p>Ist=0-Positionen bleiben separat ausgeschlossen. Besteht die gesamte Anlieferung aus Nullpositionen, wird sie weder als erfüllt noch als nicht erfüllt gezählt. Unbekannte Daten ergeben „nicht bewertbar“, sofern kein Mengenfehler und keine Verspätung bereits feststehen. Quote = erfüllte / bewertbare Anlieferungen. Die bisherige OTIF-Kachel bewertet weiterhin TEs.</p>
          ${aktiv.regulaer ? table(aktiv.belege.filter(g=>!g.ausgeschlossen),false):'<p class="lb-context">Keine regulären Anlieferungen im Zeitraum.</p>'}
        </details>`;
      this._analyseUiNachRender(host,ui);
    }

    _renderKpiCards() {
      const host = this._$('kpi-cards');
      const zeitHost = this._$('zeit-kpi-cards');
      const ladestellenHost = this._$('ladestellen-verteilung');
      const teOtifHost = this._$('otif-te');
      if (!host) return;
      this._renderAnlieferungsOtif();

      const vp    = vorperiode(this._bereich);
      const aktiv = aggregiere(this._tesZeitraum());
      const vgl   = aggregiere(this._tesZeitraum(vp));

      if (aktiv.anzahl === 0) {
        host.innerHTML = `<div class="u-leer" style="grid-column:1/-1">
          Keine Transporteinheiten im Zeitraum ${esc(bereichLabel(this._bereich))}
        </div>`;
        if (zeitHost) zeitHost.innerHTML = host.innerHTML;
        if (ladestellenHost) ladestellenHost.innerHTML = '';
        if (teOtifHost) teOtifHost.innerHTML = host.innerHTML;
        return;
      }

      const vglName = `Vorperiode: ${bereichLabel(vp)}`;
      const anlieferungAktiv=anlieferungsOtif(this._tesZeitraum(),[...(this._teMap?.values() ?? this._tesZeitraum())]),anlieferungVgl=anlieferungsOtif(this._tesZeitraum(vp),[...(this._teMap?.values() ?? this._tesZeitraum())]);
      host.innerHTML = KPI_DEFS.filter(def => def.id !== 'durchlaufzeit').map(def => def.id==='otif'
        ? this._anlieferungsKarteHTML(anlieferungAktiv,anlieferungVgl,vglName)
        : this._kpiCardHTML(def, aktiv, vgl, vglName)).join('');
      if(teOtifHost)teOtifHost.innerHTML=this._kpiCardHTML({id:'otif',label:'OTIF · TE'},aktiv,vgl,vglName);
      if (zeitHost) zeitHost.innerHTML = KPI_DEFS.filter(def => def.id === 'durchlaufzeit').map(def => this._kpiCardHTML(def, aktiv, vgl, vglName)).join('');
      if (ladestellenHost) ladestellenHost.innerHTML = this._ladestellenVerteilungHTML(aktiv);

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
      if (zeitHost) { zeitHost.onpointerover = host.onpointerover; zeitHost.onfocusin = host.onfocusin; }
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
          text:   a.einheiten?.length>1 ? a.einheiten.map(e=>`${fmtMenge(e.wert)} ${esc(e.einheit||'ohne Einheit')}`).join(' · ') : a.wert == null ? '–' : fmtMenge(a.wert) + (a.einheiten?.[0]?.einheit ? ' ' + esc(a.einheiten[0].einheit) : ''),
          klasse: !a.bewertbar ? 'q-nb' : (a.betroffen === 0 ? 'q-gut' : 'q-mittel'),
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
        : (def.id === 'abwMenge' ? 'Σ Positionsbeträge · Balken = TE-Anteil' : 'Ø je Ladestelle · Balken = TE-Anteil');

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
        besserWennHoeher=false;
        const mengenText=a=>a.einheiten?.length>1 ? a.einheiten.map(e=>`${fmtMenge(e.wert)} ${e.einheit||'ohne Einheit'}`).join(' · ') : a.wert==null ? '–' : `${fmtMenge(a.wert)}${a.einheiten?.[0]?.einheit ? ` ${a.einheiten[0].einheit}` : ''}`;
        wertTxt=`<span class="kpi-menge-list">${esc(mengenText(a))}</span>`;
        klasse=!a.bewertbar ? 'q-nb' : a.betroffen===0 ? 'q-gut' : 'q-mittel';
        const net=a.einheiten?.map(e=>`${fmtDelta(e.netto)} ${e.einheit||'ohne Einheit'}`).join(' · ') ?? fmtDelta(a.netto);
        subTxt=a.bewertbar ? `Σ Positionsbeträge je Einheit · ${a.betroffen} von ${a.bewertbar} TEs mit Abweichung${a.nb ? ` · ${a.nb} nicht bewertbar` : ''} · netto ${net}` : 'Keine vollständigen Mengenabweichungen im Zeitraum';
        vglTxt=esc(mengenText(v));
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

      if (['otif','mengentreu','abwMenge'].includes(def.id) && aktiv.nullpositionen?.anzahl) {
        subTxt += ` · ${aktiv.nullpositionen.anzahl} Nullpositionen separat ausgeschlossen`;
      }

      // Trend nur wenn beide Werte vorhanden sind
      let trendHTML = '<span class="kpi-trend gleich">–</span>';
      if (aWert != null && vWert != null && (def.id !== 'abwMenge' || (a.einheiten?.[0]?.einheit ?? '')===(v.einheiten?.[0]?.einheit ?? ''))) {
        const delta = aWert - vWert;
        const rund  = Math.round(delta * 10) / 10;
        const cls   = rund === 0 ? 'gleich' : ((rund > 0) === besserWennHoeher ? 'auf' : 'ab');
        const pfeil = rund === 0 ? '±' : (rund > 0 ? '▲' : '▼');
        const betrag = def.id === 'durchlaufzeit'
          ? fmtDauerAbs(Math.abs(rund))
          : (def.id === 'abwMenge' ? fmtMenge(Math.abs(rund)) : `${Math.abs(rund).toLocaleString('de-DE',{maximumFractionDigits:1})} pp`);
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
        { feld: 'abweichendeMengeAbs', label: 'Abw. Menge',    cls: 'num' },
      ];

      const kopf = spalten.map(s => {
        const aktiv = this._sortFeld === s.feld;
        const pfeil = aktiv ? `<span class="sort-pfeil">${this._sortRichtung === 1 ? '▲' : '▼'}</span>` : '';
        return `<th class="${s.cls}${aktiv ? ' sortiert' : ''}" data-sort="${s.feld}"
                    aria-sort="${aktiv ? (this._sortRichtung === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" title="${s.feld === 'abweichendeMengeAbs' ? 'Nach Einheitengruppe, dann nach Abweichungsbetrag sortieren' : 'Nach ' + esc(s.label) + ' sortieren'}">${esc(s.label)}${pfeil}</button></th>`;
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
        ? `<span class="tt-abw-min">+${fmtAbweichungMin(abwMin)}</span>` : '';

      // Abweichende Menge: Vorzeichen erhalten, 0 dezent darstellen
      const abw = te.abweichendeMenge;
      const abwHTML = te.mengenGruppen?.length>1 ? te.mengenGruppen.map(g=>`<span class="k-delta ${g.abweichung===0 ? 'null' : 'pos'}">${g.abweichungVollstaendig ? fmtDelta(g.abweichung) : 'n. b.'} ${esc(g.einheit||'ohne Einheit')}</span>`).join('<br>') : abw == null
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
      const isVerspaetet = te.planabweichung === true || te.puenktlich === false;

      // ── Kopf-Delta ──
      let deltaHTML = '';
      if (te.puenktlich === false) deltaHTML=`<span class="dh-delta pos">Verspätet +${fmtAbweichungMin(te.puenktlichkeitAbwMin)}</span>`;
      else if (te.puenktlich === true) deltaHTML='<span class="dh-delta neg">Pünktlich</span>';
      else deltaHTML='<span class="dh-delta">Pünktlichkeit n. b.</span>';

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
        ['Ankunft am Kontrollpunkt', te.tsAnkunft ? fmtDateTimeVoll(te.tsAnkunft) : '–'],
        ['Am Tor angedockt', (te.tsAngedockt ? fmtDateTimeVoll(te.tsAngedockt) : '–') + andockHint],
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
        ['Verschiedene Produkte',   String(te.anzahlProdukte ?? 0)],
        ['Paletten (Menge ÷ PA1)',  te.anlieferpaletten == null ? 'n. b.' : String(te.anlieferpaletten)],
      ];
      const sendungHTML = sendung.map(([l, v]) =>
        `<div class="detail-row"><span class="detail-row-l">${l}</span><span class="detail-row-v">${v}</span></div>`
      ).join('');

      // ── Zeitvergleiche (die neun geforderten Paare) ──
      const tatEnde = te.tsEntladenTat;
      const vergleiche = [
        ['Geplanter Start → Geplantes Ende', te.geplantStart,   te.geplantEnde,     false],
        ['Ist-Start → Ist-Ende',             te.istStart,       te.istEnde,         false],
        ['Ankunft → Am Tor angedockt',       te.tsAnkunft,      te.tsAngedockt,     te.andockVerspaetet],
        ['Angedockt → Entladen gestartet',   te.tsAngedockt,    te.tsEntladenStart, null],
        ['Entladen gestartet → beendet',     te.tsEntladenStart, te.tsEntladenEnde, false],
        ['Entladen beendet → Tats. Ende',    te.tsEntladenEnde, tatEnde,            false],
        ['Vereinnahmung: Tats. Ende → WE gebucht', tatEnde, te.tsWeBuchung, false],
        ['WE gebucht → Fertigstellung',      te.tsWeBuchung,    te.tsEinlagerung,   false],
        ['Ankunft → Fertigstellung',         te.tsAnkunft,      te.tsEinlagerung,   false],
        ['Angedockt → Fertigstellung',       te.tsAngedockt,    te.tsEinlagerung,   false],
      ];
      // Maximale Dauer für die proportionale Balkenbreite
      const maxDauer = Math.max(1, ...vergleiche
        .map(([, von, bis]) => { const m = diffMin(von, bis); return (von && bis && m != null && m>=0) ? m : 0; }));

      const vglHTML = vergleiche.map(([label, von, bis, warn]) => {
        const min = diffMin(von, bis);
        const ungueltig = min != null && min<0;
        const hat = von && bis && Number.isFinite(min) && !ungueltig;
        // Schwellwert-Automatik nur wo nicht explizit gesetzt
        const kritisch = warn === true
          || (warn == null && hat && min > VERZOEGERUNG_SCHWELLE_MIN);
        const wertTxt = ungueltig ? 'n. b. (Zeitfolge)' : hat ? fmtDauer(min) : '–';
        const zeitTxt = (von && bis)
          ? `${fmtDateTimeVoll(von)} → ${fmtDateTimeVoll(bis)}`
          : (von ? `${fmtDateTimeVoll(von)} → …` : '…');
        // Proportionaler Balken: zeigt die Dauer relativ zur längsten Phase.
        const breite = hat ? (min / maxDauer) * 100 : 0;
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

        ${this._prozessDetailHTML(te)}

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
        { ts: te.tsEntladenEnde, label: 'Entladen beendet', kurz: 'E■', optional: false },
        { ts: te.tsEntladenTat, label: 'Tats. Entladeende', kurz: 'TE', optional: false },
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

      // Zeitpunkte bleiben maßstabstreu. Die Ereignisliste darunter vermeidet
      // überlappende Beschriftungen, ohne Soll-/Ist-Positionen zu verschieben.
      const positionen=punkte.map(p=>({...p,pos:pctRaw(p.ts)})).sort((a,b)=>a.pos-b.pos);

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

      const punkteHTML=positionen.map(p=>`<div class="zs-point" style="left:${p.pos.toFixed(2)}%"><div class="zs-dot ${p.optional ? 'optional' : isVerspaetet ? 'late' : 'done'}" title="${esc(p.label)}: ${fmtDateTimeVoll(p.ts)}"></div></div>`).join('');
      const ereignisse=positionen.map(p=>`<div class="zs-event"><strong>${esc(p.label)}${p.optional ? ' (optional)' : ''}</strong><span>${fmtDateTimeVoll(p.ts)}</span></div>`).join('');
      return `<div class="zs-wrap"><div class="zs-track"><div class="zs-baseline"></div>${sollHTML}${istLinieHTML}${punkteHTML}</div></div><div class="zs-event-list">${ereignisse}</div><div class="pz-note">Zeitpunkte auf gemeinsamer, maßstabstreuer Achse. Die Ereignisliste zeigt die vollständigen Datums- und Zeitangaben.</div>`;
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
        const pa1 = Number.isFinite(p.pa1) && p.pa1 > 0 ? p.pa1 : null;
        const konflikt=te.produktZusammenfassung?.produkte.some(g=>g.nr===String(p.nr) && g.einheit===(p.einheit||'') && (g.packmittel?.key??g.packmittel?.text??null)===(p.packmittel?.key??p.packmittel?.text??null) && g.pa1Konflikt);
        const palettenBerechnet=konflikt ? null : palettenAufrunden(p.mengeIst,pa1);

        return `
          <tr>
            <td class="pt-sticky">
              <div class="pt-prod-nr">${esc(p.nr)}</div>
              <div class="pt-prod-name">${esc(p.name)}</div>
              ${istNullposition(p) ? '<small class="pt-muted">Nullposition · Mengentreue ausgeschlossen</small>' : ''}
            </td>
            <td class="pt-num">${p.mengeIst == null ? '<span class="pt-muted">n. b.</span>' : esc(fmtMenge(p.mengeIst))} ${esc(p.einheit ?? '')}</td>
            <td class="pt-num">${pa1 == null ? '<span class="pt-muted">–</span>' : esc(fmtMenge(pa1))+(konflikt ? ' (Konflikt)' : '')}</td>
            <td class="pt-num">${palettenBerechnet == null ? '<span class="pt-muted">n. b.</span>' : palettenBerechnet}</td>
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
            <td class="pt-time-cell">${p.tsEinlagerung ? fmtDateTimeVoll(p.tsEinlagerung) : '<span class="pt-muted">offen</span>'}</td>
          </tr>`;
      }).join('');

      return `
        <div class="pt-scroll">
          <table class="pt-table">
            <thead>
              <tr>
                <th class="pt-sticky">Produkt</th>
                <th class="pt-num">Menge</th>
                <th class="pt-num">PA1</th>
                <th class="pt-num">Pal. berechnet</th>
                <th scope="col">Halle</th>
                <th scope="col">HWG</th>
                <th scope="col">Packmittel</th>
                <th scope="col">Einl.-KZ</th>
                <th scope="col">Bestand</th>
                <th class="pt-center">Foto</th>
                <th class="pt-center">Bänder</th>
                <th class="pt-center">Sperrgut</th>
                <th class="pt-center">QP</th>
                <th scope="col">Kritisch</th>
                <th scope="col">Fertigst.</th>
              </tr>
            </thead>
            <tbody>${zeilen}</tbody>
          </table>
        </div>
        <div class="pz-note">Paletten je Tabellenzeile: Menge ÷ PA1, aufgerundet. Die TE-Gesamtsumme fasst zunächst identische Produkt-, Einheiten-, Packmittel- und PA1-Gruppen zusammen und rundet erst danach auf. Fehlendes, ungültiges oder widersprüchliches PA1 bleibt nicht bewertbar.</div>`;
    }

    // ── Gesamt-Render ─────────────────────────────────────────────────────

    _render() {
      this._log(`_render() — ${this._teMap.size} TEs im internen State`);
      this._hideLoading();

      if (this._teMap.size === 0) {
        this._activeTE=null;this._lieferantDetailKey=null;this._spediteurDetailKey=null;
        this._switchView('uebersicht');
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

    // Zieht aus dataBinding eine lesbare Fehlermeldung, unabhängig davon, in
    // welcher Form SAC sie liefert (message als String, messages als Array
    // von Strings oder von Objekten mit .text/.message/.detail). Ohne diese
    // Extraktion bleibt im Log nur ein eingeklapptes Objekt sichtbar, das man
    // erst manuell aufklappen müsste — hier steht der Text direkt in der Zeile.
    _extraktFehlertext(dataBinding) {
      if (!dataBinding) return null;
      const teileZuText = (v) => {
        if (v == null) return null;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return v.text ?? v.message ?? v.detail ?? v.description ?? null;
        return String(v);
      };
      if (typeof dataBinding.message === 'string' && dataBinding.message) return dataBinding.message;
      if (Array.isArray(dataBinding.messages) && dataBinding.messages.length) {
        return dataBinding.messages.map(teileZuText).filter(Boolean).join(' | ');
      }
      if (dataBinding.error != null) return teileZuText(dataBinding.error);
      return null;
    }

    set myDataSource(dataBinding) {
      this._dataBinding = dataBinding;
      this._dsAufrufe++;

      const state = dataBinding?.state ?? null;
      const anzahlRows = Array.isArray(dataBinding?.data) ? dataBinding.data.length : null;
      const fehlertext = this._extraktFehlertext(dataBinding);
      const modusTag = this._designMode ? '[Design-Modus] ' : '';
      this._log(
        `${modusTag}myDataSource gesetzt (Aufruf #${this._dsAufrufe}) — state='${state}'`
        + (anzahlRows != null ? `, ${anzahlRows} Rows` : ', keine Datenarray vorhanden')
        + (fehlertext ? ` — Meldung: "${fehlertext}"` : ''),
        state === 'success' ? 'info' : 'warn',
        state === 'success'
          // Im Erfolgsfall NICHT das komplette dataBinding samt Datenarray
          // mitloggen — das kann bei vielen Rows unnötig groß werden.
          ? { state, anzahlRows }
          : { state, hatDataArray: Array.isArray(dataBinding?.data), anzahlRows, fehlertext,
              objektSchluessel: dataBinding ? Object.keys(dataBinding) : null, dataBindingVoll: dataBinding },
      );

      if (!dataBinding) {
        this._log('myDataSource: dataBinding ist null/undefined — SAC hat (noch) keine Bindung übergeben', 'warn');
        this._showLoading();
        return;
      }

      if (['error','failed','failure'].includes(String(state).toLowerCase())) {
        this._watchdogStop();
        this._showEmpty(`Daten konnten nicht geladen werden${fehlertext ? ': '+fehlertext : '.'}`);
        return;
      }

      if (dataBinding.state !== 'success') {
        // Typische Zwischenzustände von SAC: 'loading', 'booting', 'error',
        // 'incomplete' o.ä. — je nach dem, was hier ankommt, lässt sich die
        // CORS-Störung von einem reinen Ladezustand unterscheiden.
        this._log(
          `myDataSource: state='${state}' ist kein Erfolg — Ladeanimation bleibt aktiv`
          + (fehlertext ? ` (Meldung: "${fehlertext}")` : ''),
          'warn',
        );
        this._showLoading();
        return;
      }

      const rows = Array.isArray(dataBinding.data) ? dataBinding.data : [];
      this._log(`myDataSource: Erfolg — ${rows.length} Rows werden geparst`);

      // ── Datenmodell-Diagnose ──────────────────────────────────────────
      // Läuft VOR dem eigentlichen Parsen und prüft, ob die von diesem
      // Widget erwarteten BW-Felder überhaupt in den Rows ankommen. Zeigt
      // insbesondere den Unterschied zwischen "Feld fehlt komplett im
      // Payload" (Feed umbenannt/entfernt/nicht gebunden) und "Feld ist
      // da, aber in jeder Zeile leer" (evtl. echtes Fehlen der Daten).
      this._logDatenmodellDiagnose(rows);

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

      // Rows kamen an, aber keine einzige TE hat es durch den Parser
      // geschafft → fast immer ein Datenmodell-Problem, nicht "keine Daten".
      if (rows.length > 0 && this._teMap.size === 0) {
        this._log(
          `${rows.length} Rows empfangen, aber 0 TEs geparst — sehr wahrscheinlich ein `
          + `Datenmodell-Problem (siehe Diagnosetabelle oben), nicht ein leerer Zeitraum.`,
          'warn',
        );
      }

      // Slider-Domäne hängt an den Daten → nach jedem Laden neu bestimmen
      this._syncSlider();
      this._watchdogStop();
      this._render();
    }

    // Formatiert und protokolliert das Ergebnis von diagnoseDatenmodell().
    // Nutzt console.table für die Feldübersicht, wenn verfügbar — das macht
    // "welche Spalte fehlt" auf einen Blick sichtbar, auch bei vielen Feldern.
    _logDatenmodellDiagnose(rows) {
      const diag = diagnoseDatenmodell(rows);
      if (!diag) return;

      if (diag.ohneTeNummer > 0) {
        this._log(
          `${diag.ohneTeNummer} von ${diag.rowsGeprueft} geprüften Rows haben keine lesbare `
          + `TE-Nummer und werden beim Parsen übersprungen.`,
          diag.ohneTeNummer === diag.rowsGeprueft ? 'error' : 'warn',
        );
      }

      // Rohe Keys der ersten Zeile — hilft beim Abgleich "wie heißt das Feld
      // WIRKLICH im Payload", z.B. wenn sich ein _0-Suffix geändert hat oder
      // ein Feed umbenannt wurde.
      if (rows[0] && typeof rows[0] === 'object') {
        this._log('Feld-Keys der ersten Row (Rohdaten):', 'info', Object.keys(rows[0]).sort());
      }

      const tabelle = diag.felder.map(f => ({
        Feld:            f.feld,
        Kritisch:        f.kritisch ? 'ja' : '',
        'Im Payload':    `${f.vorhanden}/${diag.rowsGeprueft}`,
        'Mit Wert':      `${f.mitWert}/${diag.rowsGeprueft}`,
        Status:          f.status,
      }));

      if (typeof console.table === 'function') {
        this._log(`Datenmodell-Diagnose (${diag.rowsGeprueft} von ${diag.rowsGesamt} Rows geprüft):`);
        console.table(tabelle);
      } else {
        this._log('Datenmodell-Diagnose:', 'info', tabelle);
      }

      if (diag.kritischeProbleme.length > 0) {
        const liste = diag.kritischeProbleme.map(f => `${f.feld} (${f.status})`).join(', ');
        this._log(
          `Kritische Felder mit Problemen — diese wirken sich direkt auf die Kennzahlen aus: ${liste}. `
          + `"FELD FEHLT IM PAYLOAD" deutet auf ein geändertes/entferntes BW-Feed oder eine nicht `
          + `mehr passende Feldbindung in der Story hin; "IMMER LEER" kann echtes Fehlen der Daten `
          + `im Zeitraum sein oder ein kaputtes Mapping in der Query.`,
          'warn',
        );
      } else {
        this._log('Datenmodell-Diagnose: keine kritischen Felder auffällig.');
      }
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
      // designMode/mobileMode kommen oft schon hier mit — für den Kontext-Tag
      // in den myDataSource-Logs so früh wie möglich übernehmen.
      if (changedProperties && 'designMode' in changedProperties) {
        this._designMode = !!changedProperties.designMode;
      }
    }

    onCustomWidgetAfterUpdate(changedProperties) {
      const c = changedProperties ?? this._changed ?? {};
      this._log('onCustomWidgetAfterUpdate — geänderte Properties:', 'info', c);
      if ('designMode' in c) this._designMode = !!c.designMode;
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
      const key = ohneNullen(String(teNr ?? ''));
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

  function schlechtesteLieferanten(gruppen) {
    return gruppen.filter(g => g.basis.mengentreu.wert != null)
      .sort((a,b) => a.basis.mengentreu.wert - b.basis.mengentreu.wert
        || b.basis.mengentreu.bewertbar - a.basis.mengentreu.bewertbar
        || a.label.localeCompare(b.label,'de') || a.key.localeCompare(b.key,'de'))
      .slice(0,10).map((g,i) => ({...g, rang:i+1}));
  }

  // Positionsauswertung unabhängig von der TE-Mengentreue und Top-10-Auswahl.
  // Eine TE darf mehreren Lieferanten/Einheiten/HWG zugeordnet sein, zählt
  // innerhalb jeder Gruppe aber nur einmal. Die Anzahl der Positionen meint
  // Produkt je Anlieferung und Einheit als Positionsersatz; Nullpositionen separat.
  function lieferantenMengenabweichungen(tes) {
    const gruppen = new Map(), teSet = new Set(), alleTeSet = new Set(), lieferantSet = new Set(), positionsGesamtSet = new Set();
    let ohneLieferant = 0, nichtBewertbar = 0, ohneProduktdaten = 0;
    const merkmal = (kt, leer) => {
      const key = isNull(kt?.key) ? null : String(kt.key).trim();
      const text = isNull(kt?.text) ? null : String(kt.text).trim();
      return {key:key ?? (text ? `text:${text}` : null), label:keyTextStr({key,text}) ?? leer};
    };
    const gruppeFuer = (supplier, te, p = {}) => {
        const transport = merkmal(p.transportmittelBewertung ?? {key:te.transportmittel,text:te.transportmittelName}, 'Nicht zugeordnet');
        const hwg = merkmal(p.hwg, 'Nicht gepflegt');
        const einheit = isNull(p.einheit) ? null : String(p.einheit).trim();
        const key = JSON.stringify([supplier.key,transport.key,einheit,hwg.key]);
        if (!gruppen.has(key)) gruppen.set(key, {
          key, lieferantKey:supplier.key, lieferantNr:supplier.nr, lieferantLabel:supplier.label,
          transportmittelKey:transport.key, transportmittelLabel:transport.label,
          einheit, einheitLabel:einheit ?? 'Nicht angegeben', hwgKey:hwg.key, hwgLabel:hwg.label,
          teSet:new Set(), alleTeSet:new Set(), lueckenTeSet:new Set(), anzahlPositionen:0, differenzmenge:0,
          bewertbarePositionen:0, nichtBewertbar:0, ohneProduktdaten:0, positionsSet:new Set(), nullPositionsSet:new Set(),
        });
        const g = gruppen.get(key);
        g.alleTeSet.add(te.te); alleTeSet.add(te.te); lieferantSet.add(supplier.key);
        return g;
    };
    for (const te of tes ?? []) {
      const zugeordneteLieferanten = new Set();
      for (const p of te.produkte ?? []) {
        if (istNullposition(p)) continue;
        const bewertbar = Number.isFinite(positionsAbweichung(p));
        if (!bewertbar) nichtBewertbar++;
        const supplier = p.lieferantBewertung ?? (te.lieferantenBewertung?.length === 1 ? te.lieferantenBewertung[0] : null);
        if (!supplier?.key) { ohneLieferant++; continue; }
        zugeordneteLieferanten.add(supplier.key);
        const g = gruppeFuer(supplier, te, p);
        if(isNull(p.nr)){g.ohneProduktdaten++;ohneProduktdaten++;}
        if (!bewertbar) { g.nichtBewertbar++; g.lueckenTeSet.add(te.te); continue; }
        g.bewertbarePositionen++;
        const abw=positionsAbweichung(p);
        g.differenzmenge += abw;
        if (abw === 0) continue;
        g.teSet.add(te.te);
        const posKey=mengenPositionsSchluessel(te,p);
        if (!g.positionsSet.has(posKey)) {g.positionsSet.add(posKey);g.anzahlPositionen++;}
        positionsGesamtSet.add(posKey);
        teSet.add(te.te);
      }
      for (const p of te.produkte ?? []) {
        if (!istNullposition(p)) continue;
        const supplier=p.lieferantBewertung;
        if (!supplier?.key) continue;
        zugeordneteLieferanten.add(supplier.key);
        const g=gruppeFuer(supplier,te,p);g.nullPositionsSet.add(mengenPositionsSchluessel(te,p));
      }
      // Warensender ohne auswertbare Produktzeile ebenfalls sichtbar halten.
      for (const supplier of te.lieferantenBewertung ?? []) {
        if (!supplier.key || zugeordneteLieferanten.has(supplier.key)) continue;
        const g = gruppeFuer(supplier, te);
        g.ohneProduktdaten++; g.lueckenTeSet.add(te.te); ohneProduktdaten++;
      }
    }
    return {gruppen:[...gruppen.values()].map(({teSet,alleTeSet,lueckenTeSet,positionsSet,nullPositionsSet,...g}) => ({...g, nullpositionen:nullPositionsSet.size,
      anzahlTe:teSet.size, anzahlTesGesamt:alleTeSet.size, anzahlTesMitDatenluecke:lueckenTeSet.size,
      differenzmenge:g.bewertbarePositionen ? g.differenzmenge : null})),
      anzahlTes:teSet.size, anzahlTesGesamt:alleTeSet.size, anzahlLieferanten:lieferantSet.size,
      anzahlPositionen:positionsGesamtSet.size, ohneLieferant, nichtBewertbar, ohneProduktdaten};
  }

  // Lieferantenvergleich: eine eindeutig zugeordnete TE zählt einmal.
  function aggregiereLieferanten(tes) {
    const gruppen = new Map(); let fehlend = 0, mehrdeutig = 0;
    for (const te of tes) {
      const ids = te.lieferantenBewertung ?? [];
      if (ids.length > 1) { mehrdeutig++; continue; }
      if (ids.length !== 1 || ids[0].key == null) { fehlend++; continue; }
      const id = ids[0];
      if (!gruppen.has(id.key)) gruppen.set(id.key, {...id, tes:[]});
      gruppen.get(id.key).tes.push(te);
    }
    return {gruppen:[...gruppen.values()].map(g => ({...g, basis:aggregiereBasis(g.tes),
      dauer:aggregiereProzesszeiten(g.tes).find(d => d.id === 'gesamt')})), fehlend, mehrdeutig};
  }

  // Summen über alle eindeutig zugeordneten Gruppen, unabhängig von Bottom-10,
  // Suche oder Tabellensortierung. "Insgesamt" meint bewusst bewertbare TEs;
  // Datenlücken werden separat als nicht bewertbar ausgewiesen.
  function bewertungsSummen(gruppen, feld) {
    let bewertbar = 0, nichtErfuellt = 0, nb = 0;
    for (const g of gruppen ?? []) {
      const q = g?.basis?.[feld];
      if (!q) continue;
      bewertbar += q.bewertbar ?? 0;
      nichtErfuellt += Math.max(0, (q.bewertbar ?? 0) - (q.ok ?? 0));
      nb += q.nb ?? 0;
    }
    return {bewertbar, nichtErfuellt, nb};
  }

  // Lieferanten-Drill-down: Nur nicht mengentreue TEs. Produktpositionen
  // derselben TE, Anlieferung, Produktnummer und Einheit werden konsolidiert,
  // damit wiederholte BW-Zeilen keine Doppelanzeigen erzeugen.
  function lieferantAbweichungen(gruppe) {
    const zeilen=[];
    for(const te of gruppe?.tes ?? []) {
      if(te.mengentreu!==false) continue;
      for(const p of te.mengenPositionen ?? mengenPositionen(te).positionen) {
        if(!p.abweichungAbs) continue;
        zeilen.push({te:te.te,teExt:te.teExt,anlieferung:p.anlieferung,produktNr:p.nr,produktName:p.name,
          einheit:p.einheit,geplantStart:te.geplantStart,abweichung:p.abweichung,abweichungAbs:p.abweichungAbs,teilsumme:!p.abweichungVollstaendig,
          abweichungen:p.abweichungen,gegenlaeufig:p.abweichungen.some(v=>v>0)&&p.abweichungen.some(v=>v<0)});
      }
    }
    return zeilen.sort((a,b)=>(b.geplantStart?.getTime?.() ?? -Infinity)-(a.geplantStart?.getTime?.() ?? -Infinity)
      || String(a.te).localeCompare(String(b.te),'de',{numeric:true})
      || String(a.anlieferung ?? '').localeCompare(String(b.anlieferung ?? ''),'de',{numeric:true})
      || String(a.produktNr ?? '').localeCompare(String(b.produktNr ?? ''),'de',{numeric:true}));
  }

  // Verdichtet die nicht mengentreuen TEs für die tabellarische
  // Lieferantenanalyse. Mengeneinheiten bleiben strikt getrennt, damit z. B.
  // Stück und Paletten niemals miteinander verrechnet werden.
  function lieferantTeAnalyse(gruppe) {
    const zeilen = [];
    for (const te of gruppe?.tes ?? []) {
      if (te.mengentreu !== false) continue;
      const einheiten = new Map();
      for (const p of te.mengenPositionen ?? mengenPositionen(te).positionen) {
        if (!p.abweichungAbs) continue;
        const einheit = isNull(p.einheit) ? null : String(p.einheit);
        const key = einheit ?? '';
        if (!einheiten.has(key)) einheiten.set(key, {einheit, inkorrektePositionen:0, differenzmenge:0, ueberlieferung:0, unterlieferung:0, teilsumme:false});
        const e = einheiten.get(key);
        e.inkorrektePositionen++;
        e.teilsumme ||= !p.abweichungVollstaendig;
        e.differenzmenge += p.abweichung;
        if(p.abweichungen.some(v=>v>0))e.ueberlieferung=1;
        if(p.abweichungen.some(v=>v<0))e.unterlieferung=1;
      }
      for (const e of einheiten.values()) {
        zeilen.push({
          datum:te.ankerDatum, te:te.te, teExt:te.teExt, lieferant:gruppe.label,
          transportmittel:!isNull(te.transportmittelName) ? te.transportmittelName : te.transportmittel,
          inkorrektePositionen:e.inkorrektePositionen,
          ueberlieferung:e.ueberlieferung,
          unterlieferung:e.unterlieferung,
          differenzmenge:e.differenzmenge, einheit:e.einheit,teilsumme:e.teilsumme,
        });
      }
    }
    return zeilen.sort((a,b) => (b.datum?.getTime?.() ?? -Infinity) - (a.datum?.getTime?.() ?? -Infinity)
      || String(a.te).localeCompare(String(b.te), 'de', {numeric:true})
      || String(a.einheit ?? '').localeCompare(String(b.einheit ?? ''), 'de'));
  }

  // Tagesverlauf derselben TE-basierten Mengentreuequote, die auch für die
  // Lieferantenrangliste verwendet wird. Nicht bewertbare TEs bleiben aus dem
  // Quotennenner heraus und werden je Tag separat mitgeführt.
  function bewertungsTrend(gruppe, feld) {
    const tage = new Map();
    for (const te of gruppe?.tes ?? []) {
      const tag = datumSchluessel(te.ankerDatum);
      if (tag == null) continue;
      if (!tage.has(tag)) tage.set(tag, {tag, datum:new Date(`${tag}T00:00:00Z`), ok:0, bewertbar:0, nb:0});
      const t = tage.get(tag);
      if (te[feld] == null) t.nb++;
      else { t.bewertbar++; if (te[feld] === true) t.ok++; }
    }
    return [...tage.values()].sort((a,b) => a.tag.localeCompare(b.tag)).map(t => ({
      ...t, wert:t.bewertbar ? t.ok / t.bewertbar * 100 : null,
    }));
  }

  function lieferantMengentreueTrend(gruppe) { return bewertungsTrend(gruppe, 'mengentreu'); }
  function spediteurPuenktlichkeitTrend(gruppe) { return bewertungsTrend(gruppe, 'puenktlich'); }

  function schlechtesteSpediteure(gruppen) {
    return gruppen.filter(g => g.basis.puenktlich.wert != null)
      .sort((a,b) => a.basis.puenktlich.wert - b.basis.puenktlich.wert
        || b.basis.puenktlich.bewertbar - a.basis.puenktlich.bewertbar
        || a.label.localeCompare(b.label,'de') || a.key.localeCompare(b.key,'de'))
      .slice(0,10).map((g,i) => ({...g, rang:i+1}));
  }

  function spediteurePuenktlichkeitGesamt(tes, toleranzMin = 30) {
    const daten = aggregiereSpediteure(tes), gruppen = [];
    for (const carrier of daten.gruppen) {
      const transports = new Map();
      for (const te of carrier.tes) {
        const key = isNull(te.transportmittel) ? (isNull(te.transportmittelName) ? null : `text:${te.transportmittelName}`) : String(te.transportmittel);
        if (!transports.has(key)) transports.set(key, {key:JSON.stringify([carrier.key,key]),carrierKey:carrier.key,label:carrier.label,nr:carrier.nr,
          transportLabel:keyTextStr({key:te.transportmittel,text:te.transportmittelName}) ?? 'Nicht zugeordnet',tes:[]});
        const g = transports.get(key); if (!g.tes.some(t => t.te === te.te)) g.tes.push(te);
      }
      for (const g of transports.values()) {
        const q = aggregiereBasis(g.tes).puenktlich;
        const late = spediteurAbweichungen(g,toleranzMin);
        const summe = q.bewertbar ? late.reduce((n,a) => n+a.abweichungMin,0) : null;
        gruppen.push({...g,basis:aggregiereBasis(g.tes),anzahl:g.tes.length,puenktlich:q.ok,verspaetet:q.bewertbar-q.ok,nb:q.nb,quote:q.wert,
          summe,mittel:late.length ? summe/late.length : null});
      }
    }
    return {gruppen,anzahlSpediteure:daten.gruppen.length,anzahlTes:gruppen.reduce((n,g)=>n+g.anzahl,0),
      verspaetet:gruppen.reduce((n,g)=>n+g.verspaetet,0),fehlend:daten.fehlend,mehrdeutig:daten.mehrdeutig};
  }

  // Frachtführervergleich: eine eindeutig zugeordnete TE zählt einmal.
  function aggregiereSpediteure(tes) {
    const gruppen = new Map(); let fehlend = 0, mehrdeutig = 0;
    for (const te of tes) {
      const ids = te.frachtfuehrerBewertung ?? [];
      if (ids.length > 1) { mehrdeutig++; continue; }
      if (ids.length !== 1 || ids[0].key == null) { fehlend++; continue; }
      const id = ids[0];
      if (!gruppen.has(id.key)) gruppen.set(id.key, {...id, tes:[]});
      gruppen.get(id.key).tes.push(te);
    }
    return {gruppen:[...gruppen.values()].map(g => ({...g, basis:aggregiereBasis(g.tes)})), fehlend, mehrdeutig};
  }

  // Drill-down einer Frachtführergruppe: ausschließlich TEs, die nach der
  // bereits berechneten Pünktlichkeitsregel verspätet sind. Die Abweichung ist
  // die volle Differenz Ankunft minus geplanter Start; die Toleranz steuert nur
  // die Auswahl, nicht den angezeigten Minutenwert.
  function spediteurAbweichungen(gruppe, toleranzMin = 30) {
    return (gruppe?.tes ?? []).filter(te => te.puenktlich === false && te.geplantStart && te.tsAnkunft)
      .map(te => ({
        te: te.te,
        teExt: te.teExt,
        geplantStart: te.geplantStart,
        ankunft: te.tsAnkunft,
        abweichungMin: diffMin(te.geplantStart, te.tsAnkunft),
      }))
      .filter(a => Number.isFinite(a.abweichungMin) && a.abweichungMin > toleranzMin)
      .sort((a,b) => b.abweichungMin - a.abweichungMin
        || b.geplantStart.getTime() - a.geplantStart.getTime()
        || String(a.te).localeCompare(String(b.te), 'de', { numeric:true }));
  }

  // Idempotente Registrierung (safe bei HMR / Doppel-Load)
  if (!customElements.get(TAG)) {
    customElements.define(TAG, WEEingangWidget);
  }

})();
