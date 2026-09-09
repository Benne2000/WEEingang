/* WE Cockpit 0.28.0 – Detailanalysen; Datenvertrag widget (10).json. */
/* BEGIN SHARED UX */
/* Shared presentation helpers, embedded in each SAC widget at build time. */
(function () {
  if (globalThis.WEUX) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = n => Number.isFinite(Number(n)) && n != null ? Number(n).toLocaleString('de-DE',{maximumFractionDigits:1}) : 'nicht verfügbar';
  const topics = {
    data: ['Datenbasis & Zeitbezug','Historische Auswertung abgeschlossener Wareneingangsvorgänge. Das SAC-Modell liefert ausschließlich WE-relevante Datensätze (R). Z und N sind nicht enthalten.','Die Auswahl erfolgt nach Geplanter Start ab [0WM_SPFRG]. Planstart am 31.08., Fertigstellung am 01.09.: Zuordnung zum August. ISO-Wochen können zwei Monate berühren. Ankunft und Fertigstellung bleiben die Ereignisse für Zeitdifferenzen.','Die BW-Übertragung erfolgt üblicherweise täglich gegen 04:00 Uhr. Anlieferungen werden nach letzter Einlagerung, TEs nach Abfahrt übertragen. Später verfügbare Daten können frühere Planstartperioden ergänzen. Der angezeigte Datenstand muss aus dem tatsächlichen Ladeprozess stammen.'],
    start: ['So verwendest du die Analyse','1. In der Strategieübersicht Ladestelle und Woche oder Monat wählen. Die Kacheln zeigen den jeweiligen letzten verfügbaren Wert; der Zeitraum steht an der Kachel.','2. Eine Kennzahl wählen, um ihren Verlauf zu untersuchen. Einen Zeitpunkt im Diagramm anklicken, um die zugehörige Detailanalyse zu öffnen.','3. Im Periodenüberblick Qualität und Zeiten prüfen. Reiter führen zu Prozesskette und Ursachenanalysen. „TE-Details“ öffnet die Transporteinheit mit ihren Anlieferungen und Positionen. Zurück führt zur vorherigen Analyse; die Filter bleiben dabei bestehen.'],
    hierarchy: ['TE → Anlieferung → Position','Eine Transporteinheit (TE) kann mehrere Anlieferungen enthalten; jede Anlieferung kann mehrere Positionen enthalten.','Zeitkennzahlen werden je TE bewertet. OTIF und Mengentreue besitzen getrennte Bewertungen je Anlieferung und Position. Werte verschiedener Ebenen sind nicht direkt addierbar.','„Basis“ zählt die für genau diese Kennzahl bewertbaren Objekte. „Im Filter“ bezeichnet den gesamten ausgewählten Datenumfang. Die Anzahl kann von Kennzahl zu Kennzahl abweichen.'],
    quality: ['Qualitätswerte richtig lesen','OTIF bedeutet „On Time In Full“: pünktlich und vollständig. Die BW-Kennzeichen werden getrennt für Positionen und Anlieferungen ausgewertet.','Die berechnete Termintreue verwendet Ankunft ≤ Planstart + die angezeigte Toleranz. Auch sehr frühe Ankünfte erfüllen diese Regel. BW-Pünktlichkeit verwendet dagegen P/N. Unterschiedliche Bewertungsbasen können zu unterschiedlichen Quoten führen.','„90 erfüllt / 100 bewertet · 5 ohne Bewertung“ bedeutet 90 %, nicht 90 von 105. Fehlende oder widersprüchliche Bewertungen sind nicht automatisch negativ.'],
    statistics: ['Statistik & Vergleiche','Ø ist der arithmetische Mittelwert der gültigen Werte. Der Median liegt in der Mitte der sortierten Werte. Beim P75 liegen 75 % der Werte auf oder unter diesem Wert. Die Mediane verschiedener Phasen dürfen nicht zu einer Gesamtdauer addiert werden.','Die auffälligste Prozessphase wird nach Median und Streuung ausgewählt (mindestens 8 gültige Fälle). Das ist ein Analysehinweis, keine bestätigte Ursache.','Ausreißer werden mit Median und robuster Streuung (MAD, gegebenenfalls logarithmisch) in der eingestellten Vergleichsgruppe erkannt. Ein hoher z-Wert beschreibt statistische Abweichung, keinen Datenfehler.'],
    comparison: ['Pfeile, Trends und Ziele','Strategieübersicht: Der Pfeil vergleicht den letzten verfügbaren Periodenwert mit dem ungewichteten Mittel der vorherigen dargestellten Perioden; erst ab vier gültigen Perioden.','Detailanalyse: Der Pfeil vergleicht den letzten dargestellten Trendabschnitt mit dem nach Fallzahl gewichteten Mittel der vorherigen Trendabschnitte. Das ist kein Vergleich mit genau einer Vorperiode.','Vorjahreswerte vergleichen dieselbe Kalenderwoche oder denselben Monat im Vorjahr. Prozentangaben sind relative Änderungen: von 80 % auf 88 % sind +10 % relativ bzw. +8 Prozentpunkte.','Ziele sind vorläufig und manuell konfiguriert. Die separate fachliche Baseline aus 14 vollständigen Monaten ist noch nicht angebunden. Grün bedeutet günstigere, Rot ungünstigere Entwicklung; eine reine Zunahme von Volumen ist neutral.'],
    errors: ['Datenfehler & Abdeckung','Ein Fehlerfall ist eine erkannte fehlende, negative oder widersprüchliche Angabe. Mehrere Fehler können dieselbe TE betreffen. Nur betroffene Bewertungen werden ausgeschlossen.','Abdeckung zeigt, ob benötigte Felder vorhanden bzw. bewertbar sind. Hohe Abdeckung bestätigt nicht die fachliche Richtigkeit. Es gibt keinen pauschalen Gesamtprozentsatz über unterschiedliche Prüfungen.','„Nicht bewertbar“ bedeutet: für diese Kennzahl fehlen gültige Werte oder der passende Nenner. Ein gültiger Wert von null bleibt 0. „Zu geringe Basis“ betrifft die Mindestfallzahl einer Statistik.'],
    units: ['Mengen & Einheiten','Mengen und Volumen werden aus den gelieferten Daten summiert. Eine gemeinsame Einheit darf nur angezeigt werden, wenn das BW-Modell diese bestätigt.','Bei unbekannter oder gemischter Einheit bleiben die Rohsummen als solche gekennzeichnet. Aus Mengen unterschiedlicher Einheiten lässt sich keine gemeinsame Stückzahl ableiten. Kollis bezeichnet die Anzahl der Packstücke. PA1 ist die Menge je Palette für die rechnerische Palettenzahl.'],
    location: ['Ladestelle','Container, Landverkehr und BSL sind Ausprägungen der Ladestelle.','„Nicht zugeordnet“ enthält TEs, für die keine Ladestelle gepflegt ist. Das ist eine Datenlücke, kein zusätzlicher Prozess.'],
    ranking: ['Rankings & Mindestbasis','Spediteure werden anhand ihrer bewertbaren BW-Pünktlichkeit verglichen; Lieferanten anhand bewertbarer Positionsmengen. Kleine Fallzahlen können stark schwanken.','Die Mindestbasis steht direkt am jeweiligen Ranking. Nicht aufgeführte Lieferanten oder Spediteure können unter dieser Mindestbasis liegen. Kritische Positionen werden nach absoluter Anzahl gerankt; Anteil und Gesamtbasis helfen beim Einordnen.'],
    experts: ['Experteneinstellungen','Ausreißerschwelle und Vergleichsgruppe beeinflussen die statistischen Hinweise. Die Toleranz beeinflusst die berechnete Termintreue; BW-Kennzeichen werden nicht verändert.','Einstellungen wirken im Widget. Eine abweichende Toleranz wird sichtbar angezeigt. Fachliche Freigaben und Berechtigungen müssen in SAC geregelt werden.'],
    shift: ['Schichtvergleich','Die Periodenauswahl bleibt am Planstart ausgerichtet. Innerhalb dieser Auswahl werden die Schichten anhand der jeweiligen BW-Ereignismerkmale betrachtet.','Schichtzeiten und die wöchentliche Mannschaftsrotation sind von der Planstartperiode zu unterscheiden. Die verwendete Schicht steht am Diagramm, beispielsweise Ankunftsschicht.']
  };
  topics.start=['So verwendest du die Analyse','1. In der Strategieübersicht Periode und Ladestelle wählen. Dort stehen ausschließlich aggregierte BW-Kennzahlen.','2. „Im Cockpit analysieren“ öffnet den Analysebereich. In SAC setzt die gemeinsame Zeitraumfilterung eine passende Datenbindung in beiden Widgets voraus.','3. Im Cockpit die neun Analysereiter verwenden. TE-Details zeigen Anlieferungen und Positionen; der Zurück-Button führt zur vorherigen Analyse.'];
  topics.data[2]='Die gemeinsame Planstart-Auswahl setzt eine entsprechende Bindung beider Widgets voraus. Die gelieferte Strategie-JSON enthält zunächst eine BW-Kalenderwoche; die Cockpit-JSON enthält noch keinen Planstart-Tag. Ohne diese Bindung werden geladene Daten nicht als automatisch nach Planstart gefiltert ausgegeben. Die sichtbaren Bindungshinweise nennen fehlende Felder.';
  topics.comparison[1]='Das Strategiewidget zeigt ausschließlich BW-Aggregate, keine Trendpfeile oder Vorjahresquoten. Detailvergleiche gehören ins Cockpit und benötigen passende Daten für die Vergleichszeiträume.';
  const metrics = {
    dwell_avg:['Ø Standzeit','TE','Aufenthaltsdauer der TE am Standort.','Abfahrt Kontrollpunkt − Ankunft Kontrollpunkt','dwell'],
    booking_avg:['Ø Vereinnahmung','TE','Kernzeit bis zur abgeschlossenen WE-Buchung der TE.','Letzte WE-Buchung der TE − tatsächliches Entladeende [BWMISTTEE]','booking'],
    putaway_avg:['Ø Einlagerung · Näherung','TE','Fertigstellung ersetzt vorläufig das genaue HU-Einlagerungsende.','Letzte Fertigstellung aller TE-Positionen − letzte WE-Buchung der TE','putaway'],
    operative_avg:['Ø Operativer WE · Näherung','TE','Gesamtzeit ab Entladestart bis zur letzten Fertigstellung. Näherung ohne HU-Ende.','Letzte Fertigstellung aller TE-Positionen − Entladestart','operative'],
    wait_gate_avg:['Ø Wartezeit bis Andocken','TE','Zeit vom Eintreffen bis zum Andocken.','Andocken − Ankunft Kontrollpunkt','wait_gate'],
    reaction_avg:['Ø Entladevorlaufzeit','TE','Zeit zwischen Andocken und Entladestart.','Entladestart − Andocken','reaction'],
    unload_avg:['Ø Entladedauer','TE','Zeit für die tatsächliche Entladung.','Tatsächliches Entladeende [BWMISTTEE] − Entladestart','unload'],
    calc_punctual:['Berechnete Termintreue','TE','Bewertung anhand der Zeitstempel; auch frühe Ankünfte gelten als pünktlich.','TE mit Ankunft ≤ Planstart + eingestellte Toleranz / bewertbare TE × 100','delay'],
    otif_quote:['OTIF · Anlieferung','Anlieferung','Pünktlich und vollständig gemäß BW.','O / (O + N) × 100','otifDelivery','BW [BWMOTIFA]'],
    otif_pos_quote:['OTIF · Position','Position','Pünktlich und vollständig gemäß BW, separat je Position.','O / (O + N) × 100','otifPosition','BW [BWMOTIF]'],
    voll_quote:['Liefervollständigkeit','Anlieferung','Vollständige Anlieferungen gemäß BW.','V / (V + N) × 100','fullDelivery','BW [BWMLIEFV]'],
    puenkt_quote:['BW-Pünktlichkeit · P/N','TE','Fachliche Pünktlichkeitsbewertung aus BW.','P / (P + N) × 100','punctualTe','BW [BWMLIEFP]'],
    qty_pos_quote:['Mengentreue · Position','Position','Positionen mit übereinstimmender IST- und SOLL-Menge.','Positionen mit IST = SOLL / vollständig bewertbare Positionen × 100','qtyPosition'],
    qty_anl_quote:['Mengentreue · Anlieferung','Anlieferung','Eine Anlieferung erfüllt die Regel, wenn alle zugehörigen Positionen mengentreu sind. Über- und Untermengen werden nicht saldiert.','Anlieferungen mit allen Positionen IST = SOLL / vollständig bewertbare Anlieferungen × 100','qtyDelivery'],
    critical:['Kritische Positionen','Position','Gezählt werden kritische Positionen, nicht unterschiedliche Produkt-IDs.','Anzahl eindeutig gezählter Positionen mit Kategorie oder Freitext für kritische Artikel','critical'],
    anzahl_te:['Transporteinheiten','TE','Eine TE wird einmal gezählt.','Anzahl eindeutiger TE','anzahl_te'],
    anzahl_anl:['Anlieferungen','Anlieferung','Eine Anlieferung kann mehrere Positionen enthalten.','Anzahl eindeutiger Anlieferungen','anzahl_anl'],
    anzahl_pos:['Positionen','Position','Eindeutige Kombination aus Anlieferungs- und Positionsnummer.','Anzahl eindeutiger Positionen','anzahl_pos'],
    sum_gewicht_t:['Gewicht','Position','Summe der angelieferten Gewichte.','Summe der Gewichte in Tonnen','sum_gewicht_t'],
    sum_wert_keur:['Warenwert','Position','Summe der angelieferten Warenwerte.','Summe der Warenwerte in Tausend Euro','sum_wert_keur']
  };
  for(const [key,from,to] of [
    ['plan_start_end','Geplanter Start','Geplantes Ende'],['actual_start_end','Ist-Start','Ist-Ende'],['arrival_dock','Ankunft','Andocken'],['dock_unload_start','Andocken','Entladestart'],['unload_start_end','Entladestart','Entladeende'],['unload_end_actual_end','Entladeende','Tatsächliches Ende'],['we_booked_completion','WE gebucht','Letzte Fertigstellung'],['arrival_completion','Ankunft','Letzte Fertigstellung'],['dock_completion','Andocken','Letzte Fertigstellung']
  ]) metrics[key+'_avg']=[from+' → '+to,'TE','Ergänzende Prozesszeit der ausgewählten Planstartperiode. Fertigstellung ist eine Näherung für das Einlagerungsende.',to+' − '+from,key,'BW-Dauer bzw. daraus gebildeter Mittelwert; Quelle und Bewertungsnenner müssen passend im Modell gebunden sein.'];
  const css = `
    :host{--accent:#65b8e8;--accent-strong:#2785bb;--accent-border:rgba(101,184,232,.45);--band:rgba(101,184,232,.10);--muted:#b1b9cb;--bad:#f07870;--good:#60d79c;--warn:#edbe67;}
    :host([data-theme=light]){--accent:#14618e;--accent-strong:#15547b;--muted:#555f70;--band:rgba(20,97,142,.07);--bad:#b62f29;--good:#167343;--warn:#8c6000;}
    .titlebar{flex-wrap:wrap}.title{font-family:var(--font);font-size:16px;letter-spacing:0;text-transform:none;color:var(--ink)}
    .ctrl{flex-wrap:wrap}.ctrl button{min-height:32px;font-size:12px}.brand-dot{animation:none}
    .kpi .lbl,.m-lbl,.card h3,.tp-k small,.gauge .gs,.kpi .sub,.te-base,.m-sub,.tb-lbl,.dh-fact-l,.pk-hint,.cfg .hint{font-family:var(--font)!important;font-size:12px!important;letter-spacing:0!important;text-transform:none!important;line-height:1.45}
    .card h3{font-size:14px!important;color:var(--ink)!important}.kpi .val{flex-wrap:wrap}.kpis{grid-template-columns:repeat(auto-fit,minmax(205px,1fr))}.tile{min-height:150px;min-width:0}.grid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.compact .grid{grid-template-columns:minmax(0,1fr)}
    .tile .te-base{white-space:normal;max-width:100%;overflow-wrap:anywhere}.tile .m-sub{flex-wrap:wrap}.tile .m-lbl{display:flex;flex-wrap:wrap;gap:4px;align-items:center}.tile .m-lbl .ux-badge{margin-left:auto}.kpi .d.neutral,.m-delta.neutral{color:var(--muted)!important}
    nav{height:auto!important;min-height:44px;flex-wrap:wrap!important;overflow:visible!important;gap:4px!important;padding-block:6px!important}nav button{height:36px!important;padding:0 10px!important;font-size:12px!important}
    .ux-context{padding:10px 14px;background:var(--panel);border-bottom:1px solid var(--border);font-size:12px;color:var(--ink2);line-height:1.6;flex:none}
    .tile-info{display:none!important}.m-delta[hidden],.sla[hidden],.yoy[hidden]{display:none!important}.gauge .gv{font-size:22px}.tp-k small{overflow-wrap:anywhere}
    .ux-context strong{color:var(--ink)}.ux-context .ux-context-row{display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center}.ux-context small{font-size:11px}.ux-meta{font-size:12px;color:var(--muted);margin:4px 0}
    .ux-info{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;min-width:28px;border:1px solid var(--accent);border-radius:50%;background:transparent;color:var(--accent);cursor:pointer;font:600 13px var(--font);vertical-align:middle;margin-left:6px}
    .ux-badge{display:inline-block;font-size:11px;padding:2px 7px;border-radius:4px;color:var(--ink2);border:1px solid var(--border);margin-right:5px}.ux-detail-hint{font-size:11px;color:var(--accent);display:block;margin-top:5px}
    .ux-expand{border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:var(--panel);margin:10px 0}.ux-expand>summary{cursor:pointer;font-size:13px;color:var(--ink);padding:4px}.ux-expand[open]>summary{margin-bottom:10px}
    .ux-dialog{width:min(660px,94vw);max-height:85vh;padding:22px;background:var(--panel);color:var(--ink);border:1px solid var(--border);border-radius:12px;font:14px/1.6 var(--font);overflow:auto}.ux-dialog::backdrop{background:rgba(0,0,0,.65)}
    .ux-dialog h2{font-size:20px;margin:0 0 14px}.ux-dialog h3{font-size:14px;margin-bottom:2px}.ux-dialog p{margin:4px 0 13px}.ux-dialog button,.ux-dialog input{font:inherit}.ux-dialog input{width:100%;padding:10px;color:var(--ink);background:var(--card);border:1px solid var(--border);border-radius:5px}.ux-dialog button{padding:7px 12px;border:1px solid var(--border);background:var(--card);color:var(--ink);border-radius:5px;cursor:pointer}.ux-dialog .ux-close{float:right}.ux-help-index{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ux-help-content{clear:both}.ux-dialog dl{display:grid;grid-template-columns:130px 1fr;gap:9px;margin-top:15px}.ux-dialog dt{font-weight:600}.ux-dialog dd{margin:0}.ux-dialog footer{border-top:1px solid var(--border);padding-top:10px}
    .ctxbar{flex-wrap:wrap;font:12px var(--font);padding:8px 14px}.ctxbar button{min-height:32px;font-size:12px}.crumbs{position:sticky;top:-12px;z-index:5;background:var(--bg);padding:8px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.back{min-height:36px;font-size:13px!important}
    .sla{color:var(--muted)!important;background:transparent!important}.m-delta{font-size:11px!important}.cfg{max-height:75vh;overflow:auto;width:min(310px,90%)}.cfg input,.cfg select{min-height:32px}.cfg label{font-size:12px}.finding.warn{border-color:var(--warn)}.finding.warn i{background:var(--warn)}
    .ux-table-hint{padding:7px 0;font-size:12px;color:var(--muted)}[data-drill]:focus-visible,[data-goto]:focus-visible,.tile:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    .ux-late{color:var(--warn)}.ux-error{color:var(--bad);border-left:3px solid var(--bad);padding:5px 9px;margin-top:7px}.compact .ux-context{padding:8px}.compact .ux-context-row{gap:4px}.compact .ux-context .ux-long{display:none}
    .ux-table-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.ux-table-controls input,.ux-table-controls select,.ux-table-controls button{font:12px var(--font);color:var(--ink);background:var(--card);border:1px solid var(--border2);padding:7px 10px;border-radius:5px;min-height:34px}.ux-table-controls input{flex:1;min-width:180px}.ux-table-controls button{cursor:pointer}.ux-table-controls button:disabled{opacity:.45;cursor:default}.ux-table-wrap{overflow:auto;max-height:520px}.ux-table-wrap th{position:sticky;top:0;z-index:1;background:var(--panel)}.ux-table-wrap td{font-size:12px!important}.ux-table-wrap td .back{font-size:12px!important}.ux-number{text-align:right;font-variant-numeric:tabular-nums}.ux-deviation-negative{color:var(--warn)}.ux-deviation-positive{color:var(--accent)}
    .sch-kpis{grid-template-columns:repeat(auto-fit,minmax(75px,1fr))}.sch-kpis small,.sch-h{font-family:var(--font)!important;font-size:12px!important;letter-spacing:0!important;text-transform:none!important;line-height:1.5}.sch-kpis>div b{overflow:visible!important;text-overflow:clip!important;overflow-wrap:normal;word-break:normal}.rank-severity,.rank-n{font-size:11px!important;line-height:1.5}.row{min-width:0}.row>.card{min-width:0}
    .ux-table-wrap th{font-family:var(--font);font-size:12px;letter-spacing:0;text-transform:none}.ux-table-wrap .back{background:transparent;border:0;color:var(--accent);text-decoration:underline;padding:2px 0;cursor:pointer;min-height:28px}.ux-kpis-home{border:0;padding:0;margin:0}.ux-kpis-home>summary{display:none}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    @media(max-width:700px){.ux-dialog dl{grid-template-columns:1fr}.ux-dialog dd{margin-bottom:6px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpi{padding:9px}.kpi .val b{font-size:20px}.title small{display:block;margin-left:0}.ctxbar button{margin-left:0}.card{min-width:0}.ux-context{font-size:11px}}
  `;
  const info = (key,label='Erklärung öffnen') => `<button type="button" class="ux-info" data-help="${esc(key)}" aria-label="${esc(label)}">i</button>`;
  function range(per){
    let m=/^(\d{4})-(\d{2})$/.exec(per||'');
    if(m)return {from:`${m[1]}-${m[2]}-01`,to:new Date(Date.UTC(+m[1],+m[2],0)).toISOString().slice(0,10)};
    m=/^(\d{4})-W(\d{2})$/.exec(per||'');if(!m)return {};
    const d=new Date(Date.UTC(+m[1],0,4));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(+m[2]-1)*7);
    const from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {from,to:d.toISOString().slice(0,10)};
  }
  const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s||'–';
  function state(w,type){
    const ctx=w._periodContext;
    const per=type==='strategy'?(w._rows?.length?w._perioden?.[w._scrubIdx ?? w._perioden.length-1]:null):ctx?.periode;
    const seg=type==='strategy'?w._seg:ctx?.segment;
    const r=ctx?.manual?{from:ctx.von,to:ctx.bis}:range(per);
    return {per,seg:!seg||seg==='Gesamt'?'Alle Ladestellen':seg,range:r.from?`${date(r.from)} – ${date(r.to)}`:'Gesamter geladener Datenbestand'};
  }
  function open(w,key,trigger){
    const S=w._sh||w._shadow,d=S.getElementById('ux-help');if(!d)return;
    w._uxTrigger=trigger||S.activeElement;
    const m=metrics[key],k=w._model?.kpis;
    let title,body;
    if(m){
      title=m[0];let basis=trigger?.closest('.kpi,.tile,.gauge')?.querySelector('.sub,.te-base,.gs')?.textContent;
      if(!basis&&k){const stat=k.phaseStats[m[4]]||k.quality[m[4]];basis=stat?`${num(stat.n)} ${m[1]}`:m[4]==='critical'?`${num(k.nPositions)} Positionen · ${num(k.nKritTes)} TE betroffen`:null;}
      const source=m[5]||(w._uxType==='strategy'?'BW-Aggregate; periodisch im Widget mit passenden Bewertungsnennern zusammengefasst.':'Im Widget aus BW-Zeitstempeln oder Mengen berechnet.');
      const fields=[['Bedeutung',m[2]],['Formel',key==='calc_punctual'?m[3]+` (aktuell ${num(k?.tolMin ?? w._props.toleranzMin ?? 30)} Minuten)`:m[3]],['Ebene',m[1]],['Zeitbezug','Geplanter Start ab; '+state(w,w._uxType).range],['Datenbasis',basis||'Der passende Bewertungsnenner steht an der Kennzahl.'],['Ausschlüsse','Fehlende, widersprüchliche oder unlogische Angaben werden für die betroffene Bewertung ausgeschlossen. Statistische Auffälligkeit allein ist kein Datenfehler.'],['Quelle',source]];
      body=`<dl>${fields.map(([a,b])=>`<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;
    } else if(topics[key]) {title=topics[key][0];body=topics[key].slice(1).map(t=>`<p>${esc(t)}</p>`).join('');}
    else {title='Hilfe & Begriffe';body='<p>Wähle ein Thema oder suche nach einer Kennzahl.</p><input type="search" id="ux-search" placeholder="Suchen: TE, OTIF, Median, Zeitbezug …" aria-label="Hilfethemen suchen"><div class="ux-help-index" id="ux-help-index"></div>';}
    d.innerHTML=`<button type="button" class="ux-close" data-help-close>Schließen ×</button><h2 id="ux-help-title">${esc(title)}</h2><div class="ux-help-content">${body}</div><footer><button type="button" data-help="index">Alle Hilfethemen</button></footer>`;
    const input=d.querySelector('#ux-search');if(input){const draw=()=>{const q=input.value.toLocaleLowerCase('de-DE');d.querySelector('#ux-help-index').innerHTML=[...Object.entries(topics),...Object.entries(metrics)].filter(([,v])=>v.join(' ').toLocaleLowerCase('de-DE').includes(q)).map(([key,v])=>`<button type="button" data-help="${esc(key)}">${esc(v[0])}</button>`).join('')||'<p>Kein Treffer.</p>';};input.addEventListener('input',draw);draw();}
    if(!d.open){w._uxReturnFocus=w._uxTrigger;d.showModal();} (input||d.querySelector('[data-help-close]')).focus();
  }
  function mount(w,type){
    const S=w._sh||w._shadow;if(!S||S.getElementById('ux-style'))return;
    w._uxType=type;const style=document.createElement('style');style.id='ux-style';style.textContent=css;S.appendChild(style);
    const d=document.createElement('dialog');d.id='ux-help';d.className='ux-dialog';d.setAttribute('aria-labelledby','ux-help-title');S.appendChild(d);
    d.addEventListener('close',()=>w._uxReturnFocus?.isConnected&&w._uxReturnFocus.focus());
    const ctrl=S.querySelector('.ctrl');if(ctrl)ctrl.insertAdjacentHTML('afterbegin','<button type="button" data-help="data">Datenbasis</button><button type="button" data-help="index">? Hilfe</button>');
    const header=S.querySelector('header'),context=document.createElement('div');context.id='ux-context';context.className='ux-context';header?.after(context);
    if(type==='process') {
      const tiles=S.getElementById('kpis'),panel=document.createElement('details');panel.id='ux-overview-kpis';panel.innerHTML='<summary>Kennzahlen der ausgewählten Periode anzeigen</summary>';
      tiles.before(panel);panel.appendChild(tiles);
      panel.addEventListener('toggle',()=>{if(w._mode!=='puls'&&!w._detail)w._uxKpisOpen=panel.open;});
    }
    S.addEventListener('click',e=>{const help=e.target.closest('[data-help],.tile-info,#btnGlossary');if(help){e.preventDefault();e.stopImmediatePropagation();open(w,help.dataset.help||help.dataset.key||'index',help);return;}if(e.target.closest('[data-help-close]')){d.close();return;}
      const drill=e.target.closest('[data-drill]');if(drill&&!e.target.closest('.pk-seg')){e.preventDefault();e.stopImmediatePropagation();w.openDetail?.(drill.dataset.drill);return;}
      if(e.target.closest('.kpi[data-goto="puls"]')){w._uxPanels||={};w._uxPanels.quality=true;}
      const seg=e.target.closest('.pk-seg');if(seg){e.preventDefault();e.stopImmediatePropagation();open(w,'statistics',seg);const a=new Date(+seg.dataset.a),b=new Date(+seg.dataset.b);d.querySelector('h2').textContent=seg.dataset.ph||'Prozessphase';d.querySelector('.ux-help-content').innerHTML=`<p>${esc(seg.dataset.info)}</p><p><b>Dauer:</b> ${num((b-a)/3600000)} h</p><p><b>Von:</b> ${esc(a.toLocaleString('de-DE'))}<br><b>Bis:</b> ${esc(b.toLocaleString('de-DE'))}</p>`;return;}
    },true);
    S.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.matches('button,input,select,summary,textarea')){const target=e.target.closest('[data-goto],.tile,[data-drill],.pk-seg');if(target){e.preventDefault();target.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true}));}}});
    const cfg=S.getElementById('cfg');if(cfg){cfg.insertAdjacentHTML('beforeend','<button type="button" data-help="experts">Einstellungen erklären</button><button type="button" id="ux-cfg-reset">Standardeinstellungen wiederherstellen</button>');S.getElementById('ux-cfg-reset').onclick=()=>{Object.assign(w._props,{madThreshold:3.5,toleranzMin:30,baselineMode:'segment',teamEvenFrueh:'Team A',teamOddFrueh:'Team B'});w._syncCfg();w._rebuild();};}
    const glossary=S.getElementById('btnGlossary');if(glossary)glossary.hidden=true;
  }
  function update(w,type){
    mount(w,type);const S=w._sh||w._shadow;if(!S?.querySelector)return;const context=S.getElementById('ux-context');if(!context)return;
    const st=state(w,type),k=w._model?.kpis;
    const data=w._props?.dataAsOf;const source=w._uxDemo?'Beispieldaten · keine BW-Verbindung':data?`Datenstand: ${data}`:'Datenstand: nicht übermittelt';
    context.innerHTML=`<div class="ux-context-row"><strong>${type==='strategy'?'Strategieübersicht':'Detailanalyse'}${w._detail?' → TE '+esc(w._detail):''}</strong><span>${esc(st.per||'')}${st.per?' · ':''}${esc(st.range)}</span><span>${esc(st.seg)}</span></div><div class="ux-context-row"><span>Zeitbezug: <strong>Geplanter Start ab</strong></span><span>${esc(source)}</span>${info('data','Datenbasis und Zeitbezug erklären')}</div>${k?`<div class="ux-meta">${num(k.nTes)} TE · ${num(k.nAnlieferungen)} Anlieferungen · ${num(k.nPositions)} Positionen ${info('hierarchy','Berechnungsebenen erklären')}</div>`:''}`;
    if(w._filterError)context.insertAdjacentHTML('beforeend',`<div class="ux-error" role="alert">${esc(w._filterError)}</div>`);
    if(w._bindingNotice) {
      context.insertAdjacentHTML('beforeend',`<details class="ux-expand"><summary>Hinweise zu den gelieferten Datenbindungen</summary><p>${esc(w._bindingNotice)}</p></details>`);
      if(!w._periodContext)context.querySelectorAll('.ux-context-row')[1].querySelector('span').innerHTML='Zeitbezug: <strong>Gesamter geladener Datenbestand · kein Widget-Zeitfilter</strong>';
    }
    const sub=S.getElementById('sub');if(sub&&type==='process')sub.textContent='Historische Wareneingangsanalyse';
    S.querySelectorAll('[data-goto],.tile:not(.process-tile):not(.tile-nodata),[data-drill],.pk-seg').forEach(el=>{el.setAttribute('tabindex','0');el.setAttribute('role','button');});
    if(type==='process'){
      const tiles=S.getElementById('kpis'),panel=S.getElementById('ux-overview-kpis');
      if(tiles)tiles.hidden=!!w._detail;
      if(panel){panel.hidden=!!w._detail||!k;panel.className=w._mode==='puls'?'ux-kpis-home':'ux-expand';panel.open=w._mode==='puls'||!!w._uxKpisOpen;}
    }
    S.querySelectorAll('.tile').forEach(el=>{const m=metrics[el.dataset.key];if(m&&!el.querySelector('.ux-badge'))el.querySelector('.m-lbl')?.insertAdjacentHTML('beforeend',`<span class="ux-badge">${esc(m[1])}</span>${info(el.dataset.key,m[0]+' erklären')}`);if(!el.classList.contains('process-tile')&&!el.classList.contains('tile-nodata')&&!el.querySelector('.ux-detail-hint'))el.insertAdjacentHTML('beforeend','<span class="ux-detail-hint">Verlauf ansehen ›</span>');});
    S.querySelectorAll('.card h3').forEach(h=>{if(h.querySelector('[data-help]'))return;const t=h.textContent;const key=/Datenqualität|Datenfehler/.test(t)?'errors':/Qualität|OTIF|Mengentreue|Pünktlich/i.test(t)?'quality':/Median|Auffällig|Engpass|z-Score|MAD/.test(t)?'statistics':/Ranking|Top 10|Flop 10/.test(t)?'ranking':/Schicht/.test(t)?'shift':/Durchsatz|Mengen|Volumen/.test(t)?'units':/Prozess|Phasen/.test(t)?'hierarchy':null;if(key)h.insertAdjacentHTML('beforeend',info(key));});
    S.querySelectorAll('#segpick [data-seg="Nicht zugeordnet"]').forEach(el=>el.title='TEs ohne gepflegte Ladestelle');
    const tabs=S.getElementById('tabs');if(tabs){tabs.setAttribute('aria-label','Analysebereiche');tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.classList.contains('on')?'page':'false'));}
    for(const [id,label] of [['ptbl','Positionen dieser TE · Diagnosedetails'],['bdat','Weitere Belegdaten'],['krit-table','Kritische Positionen · Einzeldaten']]){
      const el=S.getElementById(id);const card=el?.closest('.card');if(!card||card.parentElement?.matches('details'))continue;
      const panel=document.createElement('details');panel.className='ux-expand';panel.dataset.uxPanel=id;const summary=document.createElement('summary');summary.textContent=label;panel.appendChild(summary);card.before(panel);panel.appendChild(card);
    }
    S.querySelectorAll('details[data-ux-panel]').forEach(panel=>{if(panel.dataset.bound)return;panel.dataset.bound='1';panel.open=!!w._uxPanels?.[panel.dataset.uxPanel];panel.addEventListener('toggle',()=>{w._uxPanels||={};w._uxPanels[panel.dataset.uxPanel]=panel.open;});});
    S.querySelectorAll('.kpi .val b').forEach(b=>{if(b.textContent==='–'){b.textContent='Nicht bewertbar';b.style.fontSize='16px';}});
    const filter=S.getElementById('btnFilter');if(filter)filter.setAttribute('aria-expanded',String(!S.getElementById('filterpanel').hidden));
    const settings=S.getElementById('btnCfg');if(settings){settings.hidden=w._props.allowExpertSettings!==true;settings.setAttribute('aria-expanded',String(!S.getElementById('cfg').hidden));if(settings.hidden)S.getElementById('cfg').hidden=true;}
    const targets=S.getElementById('btnTargets');if(targets){targets.hidden=w._props.allowExpertSettings!==true;if(targets.hidden)S.getElementById('targetPanel').hidden=true;}
    const main=S.getElementById('main');if(w._detail&&main&&w._uxLastDetail!==w._detail)main.scrollTop=0;w._uxLastDetail=w._detail;
  }
  function install(K,type){const render=K.prototype._render;K.prototype._render=function(...args){const result=render.apply(this,args);if((this._sh||this._shadow)?.querySelector)update(this,type);return result;};
    K.prototype.setDataAsOf=function(value){this._props.dataAsOf=String(value||'');this._render();};
    const test=K.prototype.setTestData;if(test)K.prototype.setTestData=function(...args){this._uxDemo=true;return test.apply(this,args);};
    const binding=Object.getOwnPropertyDescriptor(K.prototype,'myDataSource');if(binding?.set)Object.defineProperty(K.prototype,'myDataSource',{...binding,set(value){this._uxDemo=false;return binding.set.call(this,value);}});
    if(type==='strategy')K.prototype._countUp=function(el,target,m){if(!el)return;el.textContent=target==null||!Number.isFinite(target)?'–':target.toLocaleString('de-DE',{minimumFractionDigits:m.unit===''?0:1,maximumFractionDigits:m.unit===''?0:1});if(m.pct&&target!=null)el.textContent=(target*100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});};
  }
  globalThis.WEUX={esc,num,topics,metrics,info,range,date,state,open,update,install};
})();
/* END SHARED UX */
/* =========================================================================
 * WE-Cockpit – SAC Custom Widget (v0.28.0, alle Detailanalysen) · Entwickler: Benne
 * Segment-/Schluesselabgleich mit dem Wareneingang-Tracker.
 * ========================================================================= */
/* =========================================================================
 * WE Prozess-Cockpit  –  SAC Custom Widget, Analysearchitektur
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
    const makeDate = (y, mo, day, h = 0, mi = 0, sec = 0) => {
      const d = new Date(y, mo - 1, day, h, mi, sec);
      return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day
        && d.getHours() === h && d.getMinutes() === mi && d.getSeconds() === sec ? d : null;
    };
    // dd.mm.yyyy hh:mm(:ss)  — ein oder mehrere Trennzeichen, Sekunden optional
    let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return makeDate(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
    m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); // nur Datum
    if (m) return makeDate(+m[3], +m[2], +m[1]);
    // SAP-intern: "20250520073700" (YYYYMMDDHHmmss)
    if (/^\d{14}$/.test(s))
      return makeDate(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
    // SAP-Datum: "20250520"
    if (/^\d{8}$/.test(s))
      return makeDate(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));
    // ISO 8601: "2025-05-20T07:37:00" oder mit Leerzeichen
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m || !makeDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))) return null;
    const d = new Date(s.replace(" ", "T"));
    return isNaN(d) ? null : d;
  }

  function parseKw(v) {
    if (isNullDim(v)) return null;
    const s=String(v).trim();
    const display=/^(\d{1,2})\.(\d{4})$/.exec(s), code=/^(\d{4})(?:-W)?(\d{2})$/.exec(s);
    const jahr=display?+display[2]:code?+code[1]:0, kw=display?+display[1]:code?+code[2]:0;
    if(kw<1||kw>53||jahr<1900||jahr>9999)return null;
    const jan1=new Date(Date.UTC(jahr,0,1)).getUTCDay();
    const leap=jahr%4===0&&(jahr%100!==0||jahr%400===0);
    return kw===53 && jan1!==4 && !(jan1===3&&leap) ? null : {kw,jahr};
  }

  function parsePlanDay(v) {
    if(isNullDim(v))return null;
    const s=v instanceof Date && Number.isFinite(v.getTime()) ? v.toISOString().slice(0,10) : String(v).trim();
    const m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
    if(!m)return null;
    const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?d:null;
  }

  function palletCount(ist, pa1) {
    if(!Number.isFinite(ist)||ist<0||!Number.isFinite(pa1)||pa1<=0)return null;
    const quotient=ist/pa1;
    if(!Number.isFinite(quotient))return null;
    // Exakte Vielfache dürfen durch Gleitkomma-Rauschen nicht eine Palette mehr ergeben.
    const nearest=Math.round(quotient),epsilon=Number.EPSILON*Math.max(1,Math.abs(quotient))*4;
    const rounded=(nearest!==0||quotient===0)&&Math.abs(quotient-nearest)<=epsilon?nearest:Math.ceil(quotient);
    return Number.isSafeInteger(rounded)?rounded:null;
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
    "Eigendisposition": "Sonstige",
    "Nicht zugeordnet": "Nicht zugeordnet",
  };
  function ladestelleKurz(wert) {
    if (isNullDim(wert)) return "Nicht zugeordnet";
    const w = String(wert).trim();
    if (LADESTELLE_KURZ[w]) return LADESTELLE_KURZ[w];
    if (/container|containe/i.test(w)) return "Container";
    if (/bsl/i.test(w)) return "BSL";
    if (/frei haus|ddp|landverk/i.test(w)) return "Landverkehr";
    if (/eigendispo/i.test(w)) return "Sonstige";
    if (/nicht zugeordnet/i.test(w)) return "Nicht zugeordnet";
    return w;
  }
  function mean(a) { return a.length ? a.reduce((sum, v) => sum + v, 0) / a.length : null; }

  function segmentOf(ladestelle, tm) {
    // Ausschließlich die Ladestelle bestimmt die Kategorie. Ist sie leer,
    // bleibt die TE sichtbar als "Nicht zugeordnet"; das Transportmittel darf
    // diese Datenlücke nicht als Landverkehr/Container kaschieren.
    if (!isNullDim(ladestelle)) return ladestelleKurz(ladestelle);
    return "Nicht zugeordnet";
  }

  /* Rückrichtung für den Query-Filter: normiertes Segment -> rohe
     Ladestellen-Werte, wie sie im BW-Modell als Member stehen. 1:1 aus
     LADESTELLE_KURZ abgeleitet, damit beide Richtungen synchron bleiben. */
  const SEGMENT_TO_LADESTELLE = (() => {
    const rev = {};
    for (const [raw, seg] of Object.entries(LADESTELLE_KURZ)) (rev[seg] ||= []).push(raw);
    // BW verwendet für nicht zugeordnete Merkmale typischerweise den
    // Nullmember "#"; weitere tolerierte Darstellungen bleiben als Kandidaten.
    rev["Nicht zugeordnet"] = ["#", "@NullMember", "Nicht zugeordnet"];
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
    wait_gate: { label: "Wartezeit Tor",  from: "ts_ankunft",        to: "ts_angedockt",     level: "te" },
    reaction:  { label: "Reaktionszeit",  from: "ts_angedockt",      to: "ts_entladen_start", level: "te" },
    unload:    { label: "Entladedauer",   from: "ts_entladen_start", to: "ts_entladen_ende_eff", level: "te" },
    // Die beiden folgenden KPI-Phasen werden je DISTINCT TE gebildet.
    // Positionszeitpunkte liefern nur den jeweils letzten Abschluss der TE.
    booking:   { label: "Vereinnahmung",  from: "ts_entladen_ende_eff", to: "ts_we_buchung_last", level: "te" },
    putaway:   { label: "Einlagerung",    from: "ts_we_buchung_last", to: "ts_einlagerung_last", level: "te" },
    operative: { label: "Operativer WE",  from: "ts_entladen_start", to: "ts_einlagerung_last", level: "te" },
    dwell:     { label: "Standzeit",      from: "ts_ankunft",        to: "ts_abfahrt",       level: "te" },
    delay:     { label: "Verspätung",     from: "ts_geplant_start",  to: "ts_ankunft",       level: "te" },
  };

  function hoursBetween(row, from, to) {
    const a = row[from], b = row[to];
    if (!a || !b) return null;
    return (b - a) / H;
  }

  /**
   * Kernfunktion: kanonische Zeilen -> Analysemodell.
   * Verbindliche Schlüsselhierarchie:
   *   belegnr     = TE            [0WM_TUNUM]
   *   anlieferung = Anlieferung   [0WM_DOCNO]
   *   positionKey = Anlieferung + Position [0WM_DOCNO]+[0WM_ITEMNO]
   * rows: [{belegnr,anlieferung,pos,lieferant,frachtfuehrer,transportmittel,hwg,land,
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
    let lastAnlieferung = null;
    const rawPositions = [];
    const hierarchyErrors = [];
    const normTe = (v) => {
      if (isNullDim(v)) return null;
      const raw = String(v).trim();
      return raw.replace(/^0+/, "") || raw;
    };
    const normId = (v) => isNullDim(v) ? null : String(v).trim();

    // SAC liefert vollständige Schlüssel je Zeile. Leere Schlüssel bleiben
    // unzugeordnet. Nur explizit aktiviertes fillDownKeys für einen Export
    // mit unterdrückten Wiederholungen darf leere Strings auffüllen; niemals #.
    for (let sourceIndex = 0; sourceIndex < rows.length; sourceIndex++) {
      const r0 = rows[sourceIndex];
      const r = Object.assign({}, r0);
      const explicitTe = normTe(r.belegnr);
      if (explicitTe) {
        if (lastBeleg !== explicitTe) lastAnlieferung = null;
        lastBeleg = explicitTe;
      }
      r.belegnr = explicitTe || (cfg.fillDownKeys === true && r.belegnr === "" ? lastBeleg : null);
      const explicitAnlieferung = normId(r.anlieferung);
      if (explicitAnlieferung) lastAnlieferung = explicitAnlieferung;
      r.anlieferung = explicitAnlieferung || (cfg.fillDownKeys === true && r.anlieferung === "" ? lastAnlieferung : null);
      r.pos = normId(r.pos);
      r._sourceIndex = sourceIndex;
      for (const k of Object.keys(r)) if (k.startsWith("ts_")) r[k] = k==='ts_planstart_tag'?parsePlanDay(r[k]):parseTs(r[k]);
      for (const k of Object.keys(r)) if (k.startsWith('sh_')) r[k]=isNullDim(r[k])?null:String(r[k]).trim().toUpperCase();
      // Planstart-Tagesmerkmal wird im Modell in Standortzeitzone abgeleitet.
      // Ohne Tagesmerkmal bleiben Testdaten über ihren Planstart auswertbar.
      // Fachliche Festlegung: ausschließlich tatsächliches Ende [BWMISTTEE].
      r.ts_entladen_ende_eff = r.ts_entladen_tat;
      // Zeitfenster (geplant_start/ende) hat Vorrang vor Einzeltermin
      if (!r.ts_geplant && r.ts_geplant_ende) r.ts_geplant = r.ts_geplant_ende;
      // Alle 7 Schicht/KW-Paare aus dem Export parsen
      r.kw_ankunft = parseKw(r.kw_ankunft); r.kw_andocken = parseKw(r.kw_andocken);
      r.kw_entl_start = parseKw(r.kw_entl_start); r.kw_entl_tat = parseKw(r.kw_entl_tat);
      r.kw_entl = parseKw(r.kw_entl); r.kw_we = parseKw(r.kw_we); r.kw_einl = parseKw(r.kw_einl);
      r.kw_fertigstellung = parseKw(r.kw_fertigstellung);
      // Team je Phase = Team, dessen Schicht bei ENDE der Phase lief (Konvention wie zuvor).
      // sh_ankunft/kw_ankunft hat keine Phase, die dort endet -> kein team_*, bleibt nur als
      // Ankunfts-Schicht für Volumen-Auswertungen (z.B. "Anlieferungen je Schicht") erhalten.
      r.team_wait     = teamOf(r.sh_andocken, r.kw_andocken, cfg);       // Wartezeit Tor endet bei Andocken
      r.team_reaction = teamOf(r.sh_entl_start, r.kw_entl_start, cfg);  // Reaktionszeit endet bei Entladen-Start
      r.team_unload   = teamOf(r.sh_entl_tat, r.kw_entl_tat, cfg);
      r.sh_unload_eff = r.sh_entl_tat;
      r.team_booking  = teamOf(r.sh_we, r.kw_we, cfg);                  // Vereinnahmung endet bei WE gebucht
      r.team_entl     = teamOf(r.sh_entl, r.kw_entl, cfg);              // (Kompatibilität: bisheriges Feld)
      // Solange HU-/Bestandsartdaten fehlen, ist die Fertigstellung der
      // Position die vereinbarte Näherung für das Einlagerungsende.
      r.team_putaway  = teamOf(r.sh_fertigstellung || r.sh_einl, r.kw_fertigstellung || r.kw_einl, cfg);
      r.team_einl     = r.team_putaway;                                  // (Kompatibilität: bisheriges Feld)
      r.menge_ist = num(r.menge_ist); r.menge_soll = num(r.menge_soll);
      r.pa1 = num(r.pa1);
      for(const key of ['gewicht','volumen','wert_eur','anzahl_kollis','anzahl_mitarbeiter']) r[key]=num(r[key]);
      // Einheitliche Palettenlogik im gesamten Cockpit: je Position auf volle
      // Paletten AUFRUNDEN, danach erst summieren (nicht erst Mengen summieren
      // und einmal runden — nicht verhandelbare Regel aus dem Fachkonzept).
      r.paletten = palletCount(r.menge_ist,r.pa1);
      // Business-geflaggte Sonderfälle (keine statistischen Ausreißer, sondern im SAP markiert)
      r.isDiffLieferung = !isNull(r.processcode);
      // BSL-Prozess (Belegart PDI/ZBLE bzw. Ladestelle/Transportmittel BSL):
      // Das Segment ist ein Merkmal. Negative Zeitspannen bleiben auch bei
      // BSL ungültig und werden nicht auf null Stunden gesetzt.
      r.isBSL = /ZBLE/i.test(String(r.belegart || "")) ||
                String(r.transportmittel || "").toUpperCase() === "BSL" ||
                r.segment === "BSL";
      // "Nicht zugeordnet" ist hier der Normalfall (kein kritischer Artikel),
      // nicht ein gesetztes Kennzeichen - daher wie leer behandeln.
      const kritLeer = (v) => isNullDim(v) || String(v).trim() === "Nicht zugeordnet";
      r.isKritArt = !kritLeer(r.kategorie_krit_art) || !kritLeer(r.freitext_krit_art);
      r.qty_dev = null; r.qty_dev_pct = null; // erst nach Positions-Deduplizierung
      // OTIF besitzt zwei fachlich verschiedene Ebenen. Der bisherige
      // sap_otif-Name bleibt ausschließlich als Legacy-Fallback für das
      // Anlieferungskennzeichen erhalten.
      r.sap_otif_position = r.sap_otif_position == null ? null : String(r.sap_otif_position).trim().toUpperCase();
      r.sap_otif_anlieferung = r.sap_otif_anlieferung != null
        ? String(r.sap_otif_anlieferung).trim().toUpperCase()
        : (r.sap_otif != null ? String(r.sap_otif).trim().toUpperCase() : null);
      r.sap_puenktlich = r.sap_puenktlich == null ? null : String(r.sap_puenktlich).trim().toUpperCase();
      r.sap_vollstaendig = r.sap_vollstaendig == null ? null : String(r.sap_vollstaendig).trim().toUpperCase();

      rawPositions.push(r);
    }

    // Ladestelle auf TE-Ebene auflösen. Wenn sie nur in einer Positionszeile
    // gefüllt ist, gilt sie für die gesamte TE. Nur wenn in keiner Zeile der TE
    // eine Ladestelle vorhanden ist, wird die TE "Nicht zugeordnet".
    const teLadestelle = new Map();
    for (const r of rawPositions)
      if (r.belegnr && !isNullDim(r.ladestelle) && !teLadestelle.has(r.belegnr))
        teLadestelle.set(r.belegnr, r.ladestelle);
    for (const r of rawPositions) {
      const teLade = r.belegnr ? teLadestelle.get(r.belegnr) : null;
      r.ladestelle = teLade != null ? teLade : null;
      r.segment = segmentOf(r.ladestelle, r.transportmittel);
      r.isBSL = r.isBSL || r.segment === "BSL";
      r.positionKey = r.anlieferung && r.pos ? `${r.anlieferung}\u0001${r.pos}` : null;
      if (!r.belegnr || !r.anlieferung || !r.pos) {
        const fehlt = [!r.belegnr && "TE", !r.anlieferung && "Anlieferung", !r.pos && "Position"].filter(Boolean).join(", ");
        r.hasError = true;
        hierarchyErrors.push({ ctx: "Hierarchie", key: r.positionKey || `Zeile ${r._sourceIndex + 1}`,
          phase: `Schlüssel fehlt: ${fehlt}`, hours: null, rec: r });
      }
    }

    /* --- Positionen über [0WM_DOCNO]+[0WM_ITEMNO] deduplizieren -------- */
    const deliveryTes = new Map(), conflictedTes = new Set();
    for (const r of rawPositions) if (r.anlieferung && r.belegnr) {
      if (!deliveryTes.has(r.anlieferung)) deliveryTes.set(r.anlieferung, new Set());
      deliveryTes.get(r.anlieferung).add(r.belegnr);
    }
    for (const r of rawPositions) if (deliveryTes.get(r.anlieferung)?.size > 1) {
      r.hierarchyConflict = true; r.hasError = true;
      conflictedTes.add(r.belegnr);
    }
    const positionMap = new Map();
    const minTsFields = new Set(["ts_geplant", "ts_geplant_start", "ts_planstart_tag", "ts_ankunft", "ts_angedockt", "ts_entladen_start", "ts_we_pos", "ts_ist_start"]);
    const maxTsFields = new Set(["ts_geplant_ende", "ts_entladen_ende", "ts_entladen_tat", "ts_entladen_ende_eff", "ts_we_buchung", "ts_einlagerung", "ts_fertigstellung", "ts_abfahrt", "ts_ist_ende"]);
    const mergePosition = (base, next) => {
      if (base.belegnr && next.belegnr && base.belegnr !== next.belegnr)
        hierarchyErrors.push({ ctx: "Hierarchie", key: next.positionKey, phase: "Anlieferung mehreren TEs zugeordnet", hours: null, rec: next });
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") continue;
        if (base[k] == null || base[k] === "") { base[k] = v; continue; }
        if (["menge_ist", "menge_soll"].includes(k) && base[k] !== v) {
          base.qtyConflict = true;
          hierarchyErrors.push({ctx:"Position", key:next.positionKey, phase:`Widersprüchliche ${k}-Werte`, hours:null, rec:base});
        }
        if(k==='pa1' && base[k]!==v) {
          base.pa1Conflict=true;
          hierarchyErrors.push({ctx:'Position',key:next.positionKey,phase:'Widersprüchliche PA1-Werte',hours:null,rec:base});
        }
        if(k.startsWith('sh_') && base[k]!==v) {
          base[k]='KONFLIKT';
          hierarchyErrors.push({ctx:'Position',key:next.positionKey,phase:`Widersprüchliche Schichtangabe ${k}`,hours:null,rec:base});
        }
        if (k.startsWith("sap_") && base[k] !== v) {
          base[k] = "KONFLIKT";
          hierarchyErrors.push({ctx:"Position", key:next.positionKey, phase:`Widersprüchliche ${k}-Kennzeichen`, hours:null, rec:base});
          continue;
        }
        if (v instanceof Date && base[k] instanceof Date) {
          if (minTsFields.has(k) && v < base[k]) base[k] = v;
          if (maxTsFields.has(k) && v > base[k]) base[k] = v;
        } else if (typeof v === "boolean") base[k] = base[k] || v;
      }
      return base;
    };
    for (const r of rawPositions) {
      // Unvollständige Schlüssel nicht zusammenwerfen: Sie bleiben sichtbar,
      // werden aber als Datenfehler geführt und nicht künstlich dedupliziert.
      const key = r.positionKey || `__ROW__${r._sourceIndex}`;
      if (!positionMap.has(key)) positionMap.set(key, r);
      else mergePosition(positionMap.get(key), r);
    }
    const positions = [...positionMap.values()];
    for (const p of positions) {
      p.outlier = {}; p.z = {};
      const validQty = p.positionKey && Number.isFinite(p.menge_ist) && Number.isFinite(p.menge_soll)
        && p.menge_ist >= 0 && p.menge_soll >= 0 && !p.qtyConflict && !p.hierarchyConflict;
      p.qty_dev = validQty ? p.menge_ist - p.menge_soll : null;
      if (p.qty_dev != null && Math.abs(p.qty_dev) < 1e-9) p.qty_dev = 0;
      p.qty_dev_pct = p.qty_dev != null && p.menge_soll > 0 ? 100 * p.qty_dev / p.menge_soll : null;
      p.qtyOk = p.qty_dev == null ? null : p.qty_dev === 0;
      p.paletten = p.positionKey && !p.qtyConflict && !p.pa1Conflict && !p.hierarchyConflict ? palletCount(p.menge_ist,p.pa1) : null;
      p.sh_unload_eff=p.sh_entl_tat;
      for(const [team,sh,kw] of [['team_wait','sh_andocken','kw_andocken'],['team_reaction','sh_entl_start','kw_entl_start'],['team_unload','sh_entl_tat','kw_entl_tat'],['team_booking','sh_we','kw_we'],['team_entl','sh_entl','kw_entl']])p[team]=teamOf(p[sh],p[kw],cfg);
      p.team_putaway=teamOf(p.sh_fertigstellung||p.sh_einl,p.kw_fertigstellung||p.kw_einl,cfg);p.team_einl=p.team_putaway;
    }

    /* --- Echte Anlieferungsebene über [0WM_DOCNO] ----------------------- */
    const amap = new Map();
    for (const p of positions) {
      if (!p.anlieferung) continue;
      if (!amap.has(p.anlieferung)) amap.set(p.anlieferung, {
        anlieferung: p.anlieferung, belegnr: p.belegnr, segment: p.segment,
        lieferant: p.lieferant, frachtfuehrer: p.frachtfuehrer,
        transportmittel: p.transportmittel, nPos: 0, _positionKeys: new Set(),
        ts_ankunft: null, ts_entladen_start: null, ts_entladen_ende_eff: null,
        ts_we_buchung_last: null, ts_einlagerung_last: null,
        sum_menge_ist: 0, sum_menge_soll: 0, _qtyIstN: 0, _qtySollN: 0,
        _otifValues: new Set(), _puenktValues: new Set(), _vollValues: new Set(),
        _positions: [],
      });
      const a = amap.get(p.anlieferung);
      a._positions.push(p);
      a.hierarchyConflict = a.hierarchyConflict || p.hierarchyConflict;
      if (a.belegnr && p.belegnr && a.belegnr !== p.belegnr)
        hierarchyErrors.push({ ctx: "Hierarchie", key: p.anlieferung, phase: "Anlieferung mehreren TEs zugeordnet", hours: null, rec: p });
      if (p.positionKey) a._positionKeys.add(p.positionKey);
      else a.nPos++;
      if (p.ts_ankunft instanceof Date && (!a.ts_ankunft || p.ts_ankunft < a.ts_ankunft)) a.ts_ankunft = p.ts_ankunft;
      if (p.ts_entladen_start instanceof Date && (!a.ts_entladen_start || p.ts_entladen_start < a.ts_entladen_start)) a.ts_entladen_start = p.ts_entladen_start;
      if (p.ts_entladen_ende_eff instanceof Date && (!a.ts_entladen_ende_eff || p.ts_entladen_ende_eff > a.ts_entladen_ende_eff)) a.ts_entladen_ende_eff = p.ts_entladen_ende_eff;
      const weGebucht = p.ts_we_buchung || p.ts_we_pos;
      if (weGebucht instanceof Date && (!a.ts_we_buchung_last || weGebucht > a.ts_we_buchung_last)) a.ts_we_buchung_last = weGebucht;
      const fertig = p.ts_fertigstellung || p.ts_einlagerung;
      if (fertig instanceof Date && (!a.ts_einlagerung_last || fertig > a.ts_einlagerung_last)) a.ts_einlagerung_last = fertig;
      if (p.menge_ist != null) { a.sum_menge_ist += p.menge_ist; a._qtyIstN++; }
      if (p.menge_soll != null) { a.sum_menge_soll += p.menge_soll; a._qtySollN++; }
      if (!isNull(p.sap_otif_anlieferung)) a._otifValues.add(p.sap_otif_anlieferung);
      if (!isNull(p.sap_puenktlich)) a._puenktValues.add(p.sap_puenktlich);
      if (!isNull(p.sap_vollstaendig)) a._vollValues.add(p.sap_vollstaendig);
    }
    const anlieferungen = [...amap.values()];
    for (const a of anlieferungen) {
      a.nPos += a._positionKeys.size;
      a.menge_ist = a._qtyIstN ? a.sum_menge_ist : null;
      a.menge_soll = a._qtySollN ? a.sum_menge_soll : null;
      // Mengentreue je Anlieferung: alle Positionen müssen vollständig
      // bewertbar und einzeln mengentreu sein. Keine Nettierung von Artikeln.
      a.qtyN = a._positions.filter(p => p.qtyOk != null).length;
      a.qtyDeviationPositions = a._positions.filter(p => p.qtyOk === false).length;
      a.qtyOk = a.nPos > 0 && a.qtyN === a.nPos ? a.qtyDeviationPositions === 0 : null;
      const oneFlag = (set, label, positive) => {
        if (!set.size) return null;
        if (set.size === 1 && [positive, "N"].includes([...set][0])) return [...set][0];
        hierarchyErrors.push({ ctx: "Anlieferung", key: a.anlieferung,
          phase: `Widersprüchliche ${label}-Kennzeichen`, hours: null, rec: a });
        return null;
      };
      a.sap_otif = a.hierarchyConflict ? null : oneFlag(a._otifValues, "OTIF", "O");
      a.sap_puenktlich = oneFlag(a._puenktValues, "Pünktlichkeit", "P");
      a.sap_vollstaendig = a.hierarchyConflict ? null : oneFlag(a._vollValues, "Vollständigkeit", "V");
      delete a._positionKeys;
      delete a._qtyIstN; delete a._qtySollN;
      delete a._otifValues; delete a._puenktValues; delete a._vollValues;
    }

    /* --- TE-Ebene über [0WM_TUNUM] deduplizieren ----------------------- */
    const dmap = new Map();
    for (const p of positions) {
      // Positionen ohne TE bleiben in Positions-/Anlieferungsanalysen sichtbar,
      // dürfen aber keine künstliche Sammel-TE erzeugen.
      if (!p.belegnr) continue;
      const key = p.belegnr;
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
          // Die finalen Zeitpunkte werden unten über ALLE Positionen und
          // Anlieferungen der TE bestimmt.
          ts_we_pos: null, ts_we_buchung: null, ts_einlagerung: null,
          knz_shuttle: p.knz_shuttle, knz_direktfahrt: p.knz_direktfahrt, knz_qualitaet: p.knz_qualitaet,
          // Summen über Positionen (unten aufaddiert)
          sum_gewicht: 0, sum_volumen: 0, sum_wert: 0, sum_kollis: 0, sum_menge: 0,
          sum_paletten: 0, nPalettenBerechenbar: 0,
          _anlieferungIds: new Set(), _members: [],
          // Für den rechten Rand der Prozesskette zählt die zuletzt fertig-
          // gestellte/eingelagerte Position der GESAMTEN TE (über alle
          // Anlieferungen hinweg) — nicht nur der ersten Position.
          ts_we_pos_last: null, ts_we_buchung_last: null, ts_einlagerung_last: null,
          sh_we: null, kw_we: null, team_booking: null,
          sh_einl: null, kw_einl: null, team_putaway: null,
          nPos: 0,
        });
      }
      const d = dmap.get(key);
      d.nPos++;
      d._members.push(p);
      if (p.anlieferung) d._anlieferungIds.add(String(p.anlieferung));
      if (p.paletten != null) { d.sum_paletten += p.paletten; d.nPalettenBerechenbar++; }
      const weGebucht = p.ts_we_buchung || p.ts_we_pos;
      if (weGebucht instanceof Date && (!d.ts_we_buchung_last || weGebucht > d.ts_we_buchung_last)) {
        d.ts_we_buchung_last = weGebucht;
        d.ts_we_pos_last = weGebucht; // Legacy-Alias für bestehende Renderer
        d.ts_we_buchung = weGebucht;
        d.ts_we_pos = weGebucht;
        d.sh_we = p.sh_we; d.kw_we = p.kw_we; d.team_booking = p.team_booking;
      }
      const fertig = p.ts_fertigstellung || p.ts_einlagerung;
      if (fertig instanceof Date && (!d.ts_einlagerung_last || fertig > d.ts_einlagerung_last)) {
        d.ts_einlagerung_last = fertig;
        d.ts_einlagerung = fertig;
        d.sh_einl = p.sh_fertigstellung || p.sh_einl;
        d.kw_einl = p.kw_fertigstellung || p.kw_einl;
        d.team_putaway = p.team_putaway;
      }
      // TE-Start = frühester relevanter Start, TE-Abschluss = spätestes Ende.
      for (const k of ["ts_geplant", "ts_geplant_start", "ts_planstart_tag", "ts_ankunft", "ts_angedockt", "ts_entladen_start", "ts_ist_start"])
        if (p[k] instanceof Date && (!(d[k] instanceof Date) || p[k] < d[k])) d[k] = p[k];
      for (const k of ["ts_geplant_ende", "ts_entladen_ende_eff", "ts_abfahrt", "ts_ist_ende"])
        if (p[k] instanceof Date && (!(d[k] instanceof Date) || p[k] > d[k])) d[k] = p[k];
      d.isDiffLieferung = d.isDiffLieferung || p.isDiffLieferung;
      d.isKritArt = d.isKritArt || p.isKritArt;
      if (p.gewicht != null) d.sum_gewicht += p.gewicht;
      if (p.volumen != null) d.sum_volumen += p.volumen;
      if (p.wert_eur != null) d.sum_wert += p.wert_eur;
      if (p.anzahl_kollis != null) d.sum_kollis += p.anzahl_kollis;
      if (p.menge_ist != null) d.sum_menge += p.menge_ist;
    }
    const tes = [...dmap.values()];
    // Kompatibilitätsalias: bestehende Renderfunktionen erwarten noch den
    // historischen Variablennamen "deliveries", der Inhalt sind jetzt
    // nachweislich DISTINCT TEs und keine Anlieferungen.
    const deliveries = tes;
    // Struktur-Kennzahlen je TE finalisieren. Fehlt ein eigener Anlieferungs-
    // Feed, bleibt die Anzahl bewusst null statt fälschlich mit 1 angenommen
    // zu werden (TE ≠ Anlieferung — nicht verhandelbare Regel).
    for (const d of deliveries) {
      d.nAnlieferungen = d._anlieferungIds.size;
      d.palettenVollstaendig = d.nPos > 0 && d.nPalettenBerechenbar === d.nPos;
      const members = d._members;
      d.hierarchyConflict = conflictedTes.has(d.belegnr);
      d.nFertig = members.filter(p => p.positionKey && (p.ts_fertigstellung || p.ts_einlagerung) instanceof Date).length;
      d.fertigVollstaendig = d.nPos > 0 && d.nFertig === d.nPos;
      d.nGebucht = members.filter(p => p.positionKey && (p.ts_we_buchung || p.ts_we_pos) instanceof Date).length;
      d.buchungVollstaendig = d.nPos > 0 && d.nGebucht === d.nPos;
      // Ein unvollständiger Abschluss darf nicht als fertige TE in die KPI.
      if (!d.fertigVollstaendig) d.ts_einlagerung_last = null;
      if (!d.buchungVollstaendig) d.ts_we_buchung_last = null;
      d.ts_einlagerung = d.ts_einlagerung_last;
      d.ts_we_buchung = d.ts_we_buchung_last;
      d.ts_we_pos = d.ts_we_pos_last = d.ts_we_buchung_last;
      // BWP-Regel: maßgeblich ist der geplante Start [0WM_SPFRG].
      // Ein vorhandener allgemeiner Plantermin bleibt nur Legacy-Fallback.
      d.ts_geplant = d.ts_geplant_start || d.ts_geplant;
      const pn = new Set(members.map(p => p.sap_puenktlich).filter(v => !isNull(v)));
      d.sap_puenktlich = pn.size === 1 && ["P", "N"].includes([...pn][0]) ? [...pn][0] : null;
      if (pn.size && !d.sap_puenktlich) hierarchyErrors.push({ctx:"TE", key:d.belegnr, phase:"Widersprüchliche Pünktlichkeits-Kennzeichen", hours:null, rec:d});
      d._dimValues = {};
      for (const field of ["lieferant", "hwg", "land", "lagernummer"])
        d._dimValues[field] = [...new Set(members.map(p => p[field]).filter(v => !isNullDim(v)))];
      delete d._anlieferungIds;
    }

    /* --- Phasen berechnen + Datenfehler trennen ------------------------- */
    const dataErrors = hierarchyErrors.slice();
    function computePhases(rec, keys, ctx) {
      rec.phases = {};
      for (const k of keys) {
        const ph = PHASES[k];
        const h = hoursBetween(rec, ph.from, ph.to);
        if (rec.hierarchyConflict || h == null || !Number.isFinite(h)) {
          rec.phases[k] = null;
          rec.hasError = true;
          if (ctx === "TE") dataErrors.push({ctx, key:rec.belegnr, phase:ph.label + ": Zeitstempel fehlt oder Abschluss unvollständig", hours:null, rec});
          continue;
        }
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
      computePhases(d, ["wait_gate", "reaction", "unload", "booking", "putaway", "operative", "dwell", "delay"], "TE");
      // BWP-Regel: Ankunft <= geplanter Start [0WM_SPFRG] + Toleranz.
      // Negative Werte sind hier ausdrücklich gültig und bedeuten "früher";
      // sie sind weder Datenfehler noch eine eigene Unpünktlichkeitsklasse.
      if (!d.hierarchyConflict && d.ts_ankunft && d.ts_geplant_start)
        d.phases.delay = (d.ts_ankunft - d.ts_geplant_start) / H;
    }
    // Positionszeiten bleiben als Diagnose im Drill-down verfügbar. Für die
    // KPI-Aggregation werden sie ausdrücklich NICHT verwendet.
    for (const p of positions) {
      p.ts_we_buchung_last = p.ts_we_pos;
      p.ts_einlagerung_last = p.ts_fertigstellung || p.ts_einlagerung;
      computePhases(p, ["booking", "putaway"], "Position (Diagnose)");
    }
    // MAX über Positionen darf eine rückwärts laufende Einzelposition nicht verdecken.
    for (const d of tes) {
      const inverted = d._members.some(p => {
        const booked = p.ts_we_buchung || p.ts_we_pos, finish = p.ts_fertigstellung || p.ts_einlagerung;
        return booked instanceof Date && finish instanceof Date && finish < booked;
      });
      if (inverted) {
        d.hasError = true;
        for (const key of ["putaway", "operative"]) {
          d.phases[key] = null;
          dataErrors.push({ctx:"TE", key:d.belegnr, phase:PHASES[key].label + ": Fertigstellung einer Position vor WE-Buchung", hours:null, rec:d});
        }
      }
    }

    /* --- Baselines je (Metrik, Segment) + Ausreißer ---------------------
     * Dauer-Metriken sind stark rechtsschief -> Baseline im log-Raum
     * (senkt die Ausreißerquote von ~20 % auf ~3 % bei gleicher Schwelle).
     * 'delay' kann negativ sein -> bleibt linear, zweiseitig.            */
    const LOG_EPS = 0.05; // 3 min, macht log() bei 0h stabil
    const metricDefs = {
      dwell:   { level: "te", twoSided: false, log: true },
      unload:  { level: "te", twoSided: false, log: true },
      wait_gate:{ level: "te", twoSided: false, log: true },
      putaway: { level: "te", twoSided: false, log: true },
      booking: { level: "te", twoSided: false, log: true },
      operative:{ level: "te", twoSided: false, log: true },
      delay:   { level: "te", twoSided: true,  log: false },
    };
    const baselines = {};
    const segKey = (seg) => (cfg.baselineMode === "global" ? "ALLE" : seg);
    const toDom = (v, log) => (log ? Math.log(v + LOG_EPS) : v);

    for (const [mk, def] of Object.entries(metricDefs)) {
      const recs = def.level === "te" ? deliveries : positions;
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

    /* --- Mengenabweichung: getrennt Position und Anlieferung ------------ */
    let qtyTotal = 0, qtyOk = 0;
    for (const p of positions) {
      if (p.qty_dev == null) continue;
      qtyTotal++;
      if (p.qty_dev === 0) qtyOk++;
      p.outlier ||= {};
      p.outlier.qty = p.qty_dev !== 0;
    }
    let qtyAnlTotal = 0, qtyAnlOk = 0;
    for (const a of anlieferungen) {
      if (a.qtyOk == null) continue;
      qtyAnlTotal++;
      if (a.qtyOk) qtyAnlOk++;
      a.outlier = { qty: !a.qtyOk };
    }

    /* --- Heatmap Wochentag x Stunde (Ankünfte, TE-Ebene) ---------------- */
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
      booking:   teamStats(deliveries, "booking", "team_booking", "sh_we"),
      putaway:   teamStats(deliveries, "putaway", "team_putaway", "sh_einl"),
    };
    // TE-Volumen je Schicht (nutzt sh_ankunft, das sonst ungenutzt bliebe)
    const arrivalsByShift = { Früh: 0, Spät: 0 };
    for (const d of deliveries) if (d.sh_ankunft === "F") arrivalsByShift["Früh"]++;
      else if (d.sh_ankunft === "S") arrivalsByShift["Spät"]++;

    /* --- Phasen-Mediane je Segment (Vergleichsbasis für Detailansicht) -- */
    const phaseMed = {};
    for (const [k, ph] of Object.entries(PHASES)) {
      const recs = ph.level === "te" ? deliveries : positions;
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
        const values = r._dimValues?.[dimField] || [r[dimField]];
        for (const val of new Set(values)) {
          if (val == null || val === "") continue;
          const g = groups.get(val) || { val, n: 0, outN: 0 };
          g.n++;
          if (r.outlier[metricKey]) g.outN++;
          groups.set(val, g);
        }
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
      const recs = def.level === "te" ? deliveries : positions;
      drivers[metricKey] = {};
      for (const [outKey, field] of Object.entries(driverDims))
        drivers[metricKey][outKey] = driverRanking(recs, metricKey, field);
    }

    /* --- KPIs ------------------------------------------------------------ */
    const val = (recs, k) => recs.map((r) => r.phases && r.phases[k]).filter((v) => v != null);
    const phaseStats = {};
    for (const key of Object.keys(PHASES)) {
      const values = val(tes, key);
      phaseStats[key] = {n:values.length, total:tes.length, avg:mean(values), med:values.length ? median(values) : null,
        min:values.length ? Math.min(...values) : null, max:values.length ? Math.max(...values) : null};
    }
    const flagStats = (records, field, yes, level) => {
      const relevant = records.filter(r => level !== "Position" || r.positionKey);
      const ok = relevant.filter(r => !r.hierarchyConflict && r[field] === yes).length;
      const no = relevant.filter(r => !r.hierarchyConflict && r[field] === "N").length;
      return {level, ok, no, n:ok + no, total:relevant.length, rate:ok + no ? ok / (ok + no) : null};
    };
    const tolH = (cfg.toleranzMin ?? 30) / 60;
    const punctualRecords = tes.filter(r => !r.hierarchyConflict && r.phases && r.phases.delay != null);
    const punctualOk = punctualRecords.filter(r => r.phases.delay <= tolH).length;
    const quality = {
      otifPosition:flagStats(positions, "sap_otif_position", "O", "Position"),
      otifDelivery:flagStats(anlieferungen, "sap_otif", "O", "Anlieferung"),
      fullDelivery:flagStats(anlieferungen, "sap_vollstaendig", "V", "Anlieferung"),
      punctualTe:flagStats(tes,"sap_puenktlich","P","TE"),
      qtyPosition:{level:"Position", ok:qtyOk, n:qtyTotal, total:positions.filter(p => p.positionKey).length, rate:qtyTotal ? qtyOk / qtyTotal : null},
      qtyDelivery:{level:"Anlieferung", ok:qtyAnlOk, n:qtyAnlTotal, total:anlieferungen.length, rate:qtyAnlTotal ? qtyAnlOk / qtyAnlTotal : null},
    };
    const outRate = (recs, k) => {
      const rel = recs.filter((r) => r.phases && r.phases[k] != null);
      return rel.length ? recs.filter((r) => r.outlier && r.outlier[k]).length / rel.length : 0;
    };
    const delays = val(deliveries, "delay");
    const kpis = {
      phaseStats, quality,
      medDwell: median(val(deliveries, "dwell")),
      medUnload: median(val(deliveries, "unload")),
      medPutaway: median(val(deliveries, "putaway")),
      medBooking: median(val(deliveries, "booking")),
      medOperative: median(val(deliveries, "operative")),
      outDwell: outRate(deliveries, "dwell"),
      outPutaway: outRate(deliveries, "putaway"),
      onTime: delays.length ? delays.filter((d) => d <= tolH).length / delays.length : NaN,
      tolMin: cfg.toleranzMin ?? 30,
      qtyOkRate: qtyTotal ? qtyOk / qtyTotal : NaN, // Legacy-Alias = Position
      qtyOkRatePosition: qtyTotal ? qtyOk / qtyTotal : NaN,
      qtyOkRateDelivery: qtyAnlTotal ? qtyAnlOk / qtyAnlTotal : NaN,
      qtyPositionN: qtyTotal,
      qtyDeliveryN: qtyAnlTotal,
      nTes: deliveries.length,
      nDeliveries: anlieferungen.length,
      nAnlieferungen: anlieferungen.length,
      nPositions: positions.filter(p => p.positionKey).length,
      nErrors: dataErrors.length,
      nErrorTes: new Set(dataErrors.map(e => e.rec && e.rec.belegnr).filter(Boolean)).size,
      nDiffLieferung: deliveries.filter((d) => d.isDiffLieferung).length,
      nKritArt: positions.filter((p) => p.positionKey && p.isKritArt).length,
      nKritTes: new Set(positions.filter(p => p.isKritArt && p.belegnr).map(p => p.belegnr)).size,
      nKritLieferanten: new Set(positions.filter(p => p.isKritArt && p.lieferant).map(p => p.lieferant)).size,
      kritRate: positions.filter(p => p.positionKey).length
        ? positions.filter(p => p.positionKey && p.isKritArt).length / positions.filter(p => p.positionKey).length : null,
    };

    /* --- Perioden-Aggregation für Trends (Sparklines, Δ ggü. Vorperiode) -
     * Granularität automatisch: Spanne ≤ 21 Tage -> Tag, sonst KW.        */
    const ankTimes = deliveries.map((d) => d.ts_planstart_tag || d.ts_geplant_start).filter(Boolean).map(Number);
    const spanDays = ankTimes.length ? (Math.max(...ankTimes) - Math.min(...ankTimes)) / 864e5 : 0;
    const gran = spanDays <= 21 ? "day" : "week";
    const periodKey = (dt) => {
      if (!dt) return null;
      if (gran === "day") return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
      // ISO-Woche
      const t = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
      const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
      const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const wk = Math.ceil(((t - ys) / 864e5 + 1) / 7);
      return `${t.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
    };
    const collect = (recs, phaseKey) => {
      const buckets = new Map();
      for (const r of recs) {
        const v = r.phases && r.phases[phaseKey];
        const dt = r.ts_planstart_tag || r.ts_geplant_start;
        if (v == null || !dt) continue;
        const k = periodKey(dt);
        (buckets.get(k) || buckets.set(k, []).get(k)).push(v);
      }
      // Perioden mit zu wenigen Belegen sind statistisch instabil -> raus.
      const minN = gran === "day" ? 5 : 15;
      return [...buckets.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
        .map(([k, vals]) => ({ period: k, med: median(vals), avg:mean(vals), n: vals.length }))
        .filter((p) => p.n >= minN);
    };
    const trends = {
      dwell:   collect(deliveries, "dwell", "ts_ankunft"),
      putaway: collect(deliveries, "putaway", "ts_einlagerung_last"),
      booking: collect(deliveries, "booking", "ts_we_buchung_last"),
      operative: collect(deliveries, "operative", "ts_einlagerung_last"),
      unload:  collect(deliveries, "unload", "ts_ankunft"),
    };
    // Termintreue-Quote je Periode
    const otBuckets = new Map();
    for (const d of deliveries) {
      const v = d.phases && d.phases.delay, dt = d.ts_planstart_tag || d.ts_geplant_start;
      if (v == null || !dt) continue;
      const k = periodKey(dt);
      const b = otBuckets.get(k) || otBuckets.set(k, { ok: 0, n: 0 }).get(k);
      b.n++; if (v <= (cfg.toleranzMin ?? 30) / 60) b.ok++;
    }
    trends.onTime = [...otBuckets.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
      .map(([k, b]) => ({ period: k, med:b.ok / b.n, avg:b.ok / b.n, n: b.n }))
      .filter((p) => p.n >= (gran === "day" ? 5 : 15));
    const kritBuckets = new Map();
    for (const p of positions.filter(p => p.positionKey)) {
      const dt = p.ts_planstart_tag || p.ts_geplant_start;
      if (!(dt instanceof Date)) continue;
      const k = periodKey(dt), b = kritBuckets.get(k) || { krit:0, n:0 };
      b.n++; if (p.isKritArt) b.krit++;
      kritBuckets.set(k, b);
    }
    trends.critical = [...kritBuckets.entries()].sort((a,b) => a[0].localeCompare(b[0]))
      .map(([period,b]) => ({period, avg:b.krit, med:b.n ? b.krit / b.n : null, n:b.n, krit:b.krit}));

    /* --- Δ letzte vollständige Periode vs. Median der vorherigen -------- */
    const deltaOf = (series, lowerIsBetter = true) => {
      if (!series || series.length < 2) return null;
      const last = series[series.length - 1];
      const prev = series.slice(0, -1);
      const n = prev.reduce((sum,p) => sum + p.n, 0);
      const base = n ? prev.reduce((sum,p) => sum + p.avg * p.n, 0) / n : null;
      if (base == null || !isFinite(base) || base === 0) return null;
      const rel = (last.avg - base) / Math.abs(base);
      return { last:last.avg, base, rel, better: lowerIsBetter ? rel < 0 : rel > 0 };
    };
    const deltas = {
      dwell: deltaOf(trends.dwell, true),
      putaway: deltaOf(trends.putaway, true),
      operative: deltaOf(trends.operative, true),
      onTime: deltaOf(trends.onTime, false),
    };

    /* --- Engpass-Erkennung: Phase mit größtem Beitrag × Streuung -------- */
    const flowPhases = ["wait_gate", "reaction", "unload", "booking", "putaway"];
    const bottleneck = flowPhases.map((k) => {
      const recs = PHASES[k].level === "te" ? deliveries : positions;
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
      const recs = PHASES[top.key].level === "te" ? deliveries : positions;
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
      let s = `Statistisch auffälligste Prozessphase: ${t.label} (Median ${fmtHrs(t.med)}`;
      if (t.spread > 0.8) s += `, stark schwankend bis ${fmtHrs(t.p75)} im oberen Viertel`;
      s += ")";
      if (bottleneckSeg) s += ` — vor allem bei TEs der Ladestelle ${bottleneckSeg}`;
      findings.push({ text: s + ".", tone: "warn" });
    }
    const dwD = deltas.dwell;
    if (dwD) findings.push({
      text: `Standzeit im letzten Trendabschnitt ${dwD.better ? "verbessert" : "verschlechtert"} um ${Math.abs(dwD.rel * 100).toFixed(0)} % gegenüber dem gewichteten Mittel der vorherigen Trendabschnitte.`,
      tone: dwD.better ? "ok" : "warn",
    });
    const otD = deltas.onTime;
    if (otD) findings.push({
      text: `Berechnete Termintreue im letzten Trendabschnitt: ${(otD.last * 100).toFixed(0)} % (${otD.better ? "+" : ""}${(otD.rel * 100).toFixed(0)} % relativ zum gewichteten Mittel der vorherigen Trendabschnitte).`,
      tone: otD.better ? "ok" : "warn",
    });
    if (kpis.nErrors > 0) findings.push({
      text: `${kpis.nErrors} Datenfehler in Schlüsseln, Kennzeichen oder Zeitspannen. Betroffene Werte sind aus der jeweiligen Kennzahl ausgeschlossen.`,
      tone: "err",
    });

    // Business-geflaggte Sonderfälle für die Muster-Ansicht (getrennt von Datenfehlern)
    const diffAll = deliveries.filter((d) => d.isDiffLieferung);
    const kritAll = positions.filter((p) => p.isKritArt);
    const sonderfaelle = {
      diffLieferung: diffAll.slice(0, 20), nDiff: diffAll.length,
      kritArt: kritAll.slice(0, 20), nKrit: kritAll.length,
    };

    return { positions, anlieferungen, tes, deliveries, baselines, phaseMed, dataErrors, heat, teams, arrivalsByShift,
             drivers, sonderfaelle, kpis, cfg,
             trends, deltas, gran, bottleneck, bottleneckSeg, findings };
  }

  function num(v) {
    if (isNull(v)) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "object" && "raw" in v) return num(v.raw);
    let s=String(v).trim().replace(/[\s\u00a0\u202f]/g,'');
    if(s.includes(',')) {
      if(!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+(?:[eE][+-]?\d+)?$/.test(s))return null;
      s=s.replace(/\./g,'').replace(',','.');
    }
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s))return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  }

  const WEEngine = { parseTs, parseKw, parsePlanDay, palletCount, baseline, buildModel, segmentOf, teamOf, PHASES, median, mean };
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
    outlier: "var(--warn)", error: "var(--bad)", ok: "var(--good)",
    // Neutrale Diagrammfarben (Heatmap, Team-Balken, Zeitstrahl) - KEINE Segmentbedeutung
    lkw: "#2980b9", container: "#27ae60", sonst: "#5d6d7e",
  };
  /* Segmentfarben - identisch zum Wareneingang-Tracker, damit dieselbe
     Ladestelle in beiden Widgets dieselbe Farbe hat. */
  const SEGC = {
    BSL: "#8e44ad",
    Container: "#e67e22",
    Landverkehr: "#27ae60",
    "Nicht zugeordnet": "#7f8c8d",
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
    { id: "puls",         label: "Periodenüberblick", desc: "Zustand der Periode auf einen Blick" },
    { id: "prozesskette", label: "Prozesskette", desc: "Zeitstrahl je TE inkl. Seetransport" },
    { id: "ausreisser",   label: "Auffälligkeiten", desc: "Auffällige TEs mit Detail-Drill" },
    { id: "spediteur",    label: "Spediteuranalyse",    desc: "Pünktlichkeit der Spediteure (BW P/N) und TE-bezogene Verspätungsanalyse" },
    { id: "lieferanten",  label: "Lieferantenanalyse",  desc: "Mengentreue und Mengenabweichungen der Lieferanten auf Positionsebene" },
    { id: "artikelabweichungen", label: "Artikelabweichungen", desc: "Anlieferpositionen mit den größten absoluten Mengenabweichungen" },
    { id: "kritisch",     label: "Kritische Positionen", desc: "Kritische Positionen nach Zeit, Kategorie und Lieferant" },
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
    .roadmap-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(185px,1fr)); gap:9px;}
    .roadmap-tile{ min-height:88px; padding:10px 12px; border:1px dashed ${C.border}; border-radius:var(--r-md);
      background:${C.panel}; opacity:.78;}
    .roadmap-tile b{ display:block; font-size:11px; color:${C.ink}; margin-bottom:5px;}
    .roadmap-tile span{ display:block; font-size:10px; line-height:1.4; color:${C.muted};}
    .roadmap-state{ display:inline-block!important; width:max-content; margin-bottom:6px; padding:2px 7px;
      border-radius:12px; background:${C.band}; color:${C.ink2}!important; font-family:var(--font-mono); font-size:8.5px!important; text-transform:uppercase;}
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
    nav[hidden],.kpis[hidden]{ display:none !important; }
    .rel-quick{ display:flex; align-items:center; gap:3px; margin-left:auto; padding:2px;
      border:1px solid ${C.border}; border-radius:7px; background:${C.card2}; }
    .rel-quick button{ min-width:29px; padding:5px 7px; border:0; border-radius:5px;
      background:transparent; color:${C.muted}; font:600 10px/1 var(--font); cursor:pointer; }
    .rel-quick button.on{ background:${C.accent}; color:#fff; }
    .alert-only{ display:block; padding:2px 0 12px; }
    .alert-banner{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      padding:12px 14px; margin-bottom:10px; border:1px solid ${C.border}; border-left:4px solid var(--warn);
      border-radius:var(--r-md); background:${C.card}; }
    .alert-banner.n{ border-left-color:var(--blue); }
    .alert-banner b{ display:block; font-size:14px; color:${C.ink}; }
    .alert-banner span{ display:block; margin-top:4px; font-size:11px; color:${C.muted}; }
    .alert-total{ font-family:var(--font-mono); font-size:22px; font-weight:700; color:var(--warn); }
    .alert-banner.n .alert-total{ color:var(--blue); }
    .alert-scroll{ overflow:auto; max-height:620px; border:1px solid ${C.border}; border-radius:var(--r-md); }
    .alert-scroll table{ margin-top:0; background:${C.card}; }
    .alert-scroll th{ position:sticky; top:0; z-index:1; padding:8px; background:${C.card2}; }
    .alert-scroll td{ padding:8px; }
    .alert-badge{ display:inline-block; min-width:24px; padding:2px 6px; border-radius:10px;
      text-align:center; font-weight:700; color:#111; background:var(--warn); }
    .alert-badge.n{ color:#fff; background:var(--blue); }
    .alert-mono{ font-family:var(--font-mono); }
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
        <div class="title">WE · Detailanalyse <small id="sub"></small></div>
        <div class="ctrl">
          <button id="btnFilter" title="Zeitraum und Ladestelle für die Detailanalyse ändern">⏱ Filter</button>
          <button id="btnTheme" title="Dark-/Light-Mode umschalten">◐</button>
          <button id="btnCfg" title="Experteneinstellungen für Statistik und Termintreue">⚙ Experten</button>
        </div>
      </div>
      <div class="cfg filterpanel" id="filterpanel" hidden>
        <h4>Zeitraum &amp; Ladestelle</h4>
        <div class="hint">Überschreibt die Auswahl aus dem Strategie-Widget mit einem eigenen Filter auf „Geplanter Start ab“.</div>
        <label>Von</label>
        <input type="date" id="fltVon">
        <label>Bis</label>
        <input type="date" id="fltBis">
        <label>Ladestelle</label>
        <select id="fltSeg">
          <option value="">Alle Ladestellen</option>
          <option value="Container">Container</option>
          <option value="Landverkehr">Landverkehr</option>
          <option value="Nicht zugeordnet">Nicht zugeordnet</option>
          <option value="BSL">BSL</option>
          <option value="Sonstige">Sonstige</option>
        </select>
        <div class="filterpanel-actions">
          <button id="fltApply" class="filterpanel-apply">Anwenden</button>
          <button id="fltReset">Strategieauswahl wiederherstellen</button>
        </div>
      </div>
      <div class="cfg" id="cfg" hidden>
        <h4>Experteneinstellungen</h4>
        <label>Ausreißer-Schwelle |z| <output id="outMad">3,5</output></label>
        <input type="range" id="cfgMad" min="2" max="6" step="0.1">
        <div class="hint">kleiner = empfindlicher · wirkt sofort auf alle Ansichten</div>
        <label>BWP-Toleranz nach Planstart (Minuten)</label>
        <input type="number" id="cfgTol" min="0" max="240" step="5">
        <label>Ausreißer-Vergleichsgruppe</label>
        <select id="cfgBase">
          <option value="segment">Je Ladestelle (LKW / Container / BSL)</option>
          <option value="global">Alle Ladestellen</option>
        </select>
        <div class="hint">Nur für Median/MAD-Ausreißer. Die fachliche 14-Monats-Baseline für Zielwerte benötigt einen separaten historischen BW-Datenbestand.</div>
        <label>Mannschaft Frühschicht in geraden KW</label>
        <input type="text" id="cfgTeamE">
        <label>Mannschaft Frühschicht in ungeraden KW</label>
        <input type="text" id="cfgTeamO">
      </div>
    </header>
    <nav id="tabs"></nav>
    <main id="main">
      <div class="kpis" id="kpis"></div>
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
    (Math.abs(h)>=48?h/24:h).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + (Math.abs(h)>=48?' Tage':' h');
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
  const fmtP = (p) => p == null || !Number.isFinite(p) ? "Nicht bewertbar" : (100 * p).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + " %";
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

  /** Feed-IDs aus widget (10).json -> kanonische Zeilen für die Engine.
   *  Alle Spalten des WE-Exports sind abgedeckt; die frueheren separaten
   *  Klartext-Spalten (z.B. "Unnamed: 20" neben WS/Lieferant) entfallen,
   *  weil readDim() das Label automatisch aus der Dimension zieht.       */
  function ingestRows(rows) {
    return rows.map((row) => ({
      // Schlüssel (immer Code, keine Label-Bevorzugung). Der interne Name
      // Im gelieferten widget (10).json ist dimension_te als Belegnummer
      // beschrieben. TE daher nur aus dimension_te_intern; kein Auffüllen
      // fehlender TEs aus Anlieferungsnummern oder vorherigen Zeilen.
      belegnr:            readCode(row, "dimension_te_intern"),
      // Anlieferung innerhalb der TE. Eine TE kann mehrere Anlieferungen
      // enthalten (SAP-EWM-Hierarchie TE -> Anlieferung -> Position).
      // Mehrere Feed-Namen toleriert, je nach BW-Modellbezeichnung.
      anlieferung:        readCode(row, "dimension_anlieferung", "dimension_anlieferungsnummer",
                                   "dimension_anlieferungsnr", "dimension_lieferung",
                                   "dimension_lieferungsnummer", "dimension_lieferungsnr",
                                   "dimension_lieferbeleg", "dimension_inbound_delivery", "dimension_te"),
      te_intern:          readCode(row, "dimension_te_intern"),
      te_extern:          readCode(row, "dimension_te_extern"),
      // Erst zusammen mit anlieferung ist die Position global eindeutig.
      pos:                readCode(row, "dimension_pos"),
      bestellung:         readCode(row, "dimension_bestellung"),
      bestellposition:    readCode(row, "dimension_bestellposition"),
      // Stammdaten (Klartext bevorzugt); alte Feed-IDs als Fallback für bestehende Bindings
      produkt:            readCode(row, "dimension_produkt"),
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
      ts_planstart_tag:    readCode(row, "dimension_planstart_tag"),
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
      // BW-Bewertungen explizit auf ihrer fachlichen Ebene.
      sap_otif_position:  readCode(row, "dimension_sap_otif_position"),
      sap_otif_anlieferung:readCode(row, "dimension_sap_otif"),
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
      queueMicrotask(()=>this._applyTheme());
      this._startLoaderSteps(); // Ladeanimation läuft ab dem ersten Moment
      this._shadow.getElementById("tabs").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        this.setView(b.dataset.id);
      });
      // KPI-Kacheln führen zur passenden Ansicht
      this._shadow.getElementById("kpis").addEventListener("click", (e) => {
        const t = e.target.closest(".kpi[data-goto]"); if (!t) return;
        this.setView(t.dataset.goto);
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
        this.setManualFilter(von, bis, seg);
      });
      $("fltReset").addEventListener("click", () => {
        this.restoreStrategySelection();
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
      if (changed && "defaultView" in changed) {
        const mode=this._compatibleView(changed.defaultView);
        if(MODES.some(m=>m.id===mode))this._mode=mode;
      }
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
        this._boundFeeds=new Set((dataBinding.data||[]).flatMap(row=>Object.keys(row).map(k=>k.replace(/_\d+$/,''))));
        const missing=[];
        if(!this._boundFeeds.has('dimension_planstart_tag'))missing.push('Planstart-Tagesbindung fehlt: Die Strategieauswahl kann nicht als Planstart-Zeitraum abgefragt werden.');
        if(!this._boundFeeds.has('dimension_geplant_start'))missing.push('Geplanter Start ab fehlt: berechnete Termintreue nicht verfügbar.');
        if(!this._boundFeeds.has('dimension_sap_puenktlich'))missing.push('BW-Pünktlichkeit P/N fehlt: kein Spediteurranking nach BW-Pünktlichkeit.');
        if(!this._boundFeeds.has('dimension_sap_otif')||!this._boundFeeds.has('dimension_sap_otif_position'))missing.push('BW-OTIF-Bindungen fehlen; Mengentreue aus Soll/Ist bleibt separat berechenbar.');
        this._bindingNotice=missing.join(' ');
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
    _compatibleView(view) {
      return ({ueberblick:'puls',hof:'prozesskette',lager:'prozesskette',termin:'spediteur',mengen:'lieferanten',muster:'schicht'})[view]||view;
    }
    setView(view) {
      view=this._compatibleView(view);
      if (MODES.some((m) => m.id === view)) { this._mode = view; this._detail = null; this._render(); this._shadow.getElementById('main').scrollTop=0; }
    }
    /** Drill-down in eine Transporteinheit (auch via SAC-Script aufrufbar). */
    openDetail(te) {
      if (!this._model) return;
      const d = this._model.deliveries.find((x) => x.belegnr === String(te));
      if (!d) return;
      if(!this._detail)this._returnScroll=this._shadow.getElementById('main')?.scrollTop||0;
      this._detail = String(te);
      this._render();
      this.dispatchEvent(new CustomEvent("onOutlierSelect", { detail: { belegnr: this._detail } }));
    }
    setTestData(rows) {
      if (typeof rows === "string") { try { rows = JSON.parse(rows); } catch { rows = []; } }
      this._bindingNotice='';this._boundFeeds=null;
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
      if(this._periodContext?.periode!==periode || this._periodContext?.segment!==segment || this._periodContext?.manual) {
        this._detail=null;this._supplierDetail=null;this._tableViews={};this._yoy=null;
      }
      this._periodContext = { periode: periode || "", segment: segment || "", vorjahr: vorjahr || "" };
      this._strategyContext = {...this._periodContext};
      this._renderContextBanner();
      this._render();
    }

    _filterFailed(message) {
      this._filterError=message;this._rows=[];this._model=null;this._detail=null;this._render();return false;
    }

    /* Wird vom Story-Skript mit den Rohwerten aus dem Strategie-Widget
       aufgerufen: StrategieWidget.getSelectedPeriod/Segment/From/To/
       PriorYearPeriod(). Setzt den Query-Filter der EIGENEN Datenquelle
       dieses Widgets (Periode/Kalenderwoche + Ladestelle), löscht dabei
       einen evtl. vorher aktiven Default-Filter auf derselben Dimension,
       und stößt so eine neue BW-Abfrage nur für diesen Zeitraum an.
       Sobald die Daten zurückkommen, feuert SAC erneut `set myDataSource`. */
    setPeriodFilter(periode, segment, vonISO, bisISO, vorjahr) {
      if(this._boundFeeds&&!this._boundFeeds.has('dimension_planstart_tag'))return this._filterFailed('Die Auswahl kann nicht übernommen werden: dimension_planstart_tag fehlt in der Datenbindung. Keine Ersatzfilterung nach Ankunft oder BW-Übertragung.');
      const LADE_DIM = "dimension_ladestelle"; // technischen Namen ggf. anpassen
      const TS_DIM = "dimension_planstart_tag";   // technischen Namen ggf. anpassen
      const ds = this._getDataSource();
      if (!ds) {
        console.warn("[WE-Cockpit] setPeriodFilter: keine DataSource — nur Kontext gesetzt, kein Requery.");
        this.setPeriodContext(periode, segment, vorjahr);
        return false;
      }

      // Einen evtl. aktiven manuellen Datumsbereich-Filter entfernen — die
      // Strategie-Auswahl hat wieder Vorrang, bis der Nutzer erneut manuell
      // filtert.
      const from=this._isoToBW(vonISO), to=this._isoToBW(bisISO);
      if (!from || !to || from > to) return false;
      this._filterError=null;this._rows=null;this._model=null;this._detail=null;
      try { ds.removeDimensionFilter(TS_DIM); } catch (e) {}
      try { ds.setDimensionFilterRange(TS_DIM, from, to); }
      catch(e) { console.warn("[WE-Cockpit] Planstart-Filter fehlgeschlagen:",e); return this._filterFailed('Zeitraum konnte nicht angewendet werden. Auswahl bitte erneut übernehmen.'); }

      // Segment-Filter: nur setzen wenn nicht "Gesamt"/leer; sonst entfernen.
      try { ds.removeDimensionFilter(LADE_DIM); } catch (e) {}
      if (segment && segment !== "Gesamt") {
        const werte = SEGMENT_TO_LADESTELLE[segment] || [segment];
        try { ds.setDimensionFilter(LADE_DIM, werte); }
        catch (e) { console.warn("[WE-Cockpit] Segment-Filter fehlgeschlagen:", e && e.message); return this._filterFailed('Ladestelle konnte nicht angewendet werden. Auswahl bitte erneut übernehmen.'); }
      }

      // Kontext-Banner sofort zeigen; die eigentlichen Zeilen (myDataSource)
      // kommen asynchron nach, sobald BW die neue Abfrage beantwortet hat.
      this.setPeriodContext(periode, segment, vorjahr);
      return true;
    }

    /* "2026-01-13" -> "20260113" (BW-Datumsformat, ohne Trennzeichen) */
    _isoToBW(iso) {
      if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!WEEngine.parsePlanDay(iso))return null;
      return iso.replace(/-/g,'');
    }

    /* Manueller Filter direkt im Cockpit: überschreibt die aus dem
       Strategie-Widget übernommene Periode mit einem frei gewählten
       Datumsbereich (auf Tagesbasis statt Kalenderwoche) und/oder Segment.
       von/bis sind ISO-Daten "YYYY-MM-DD" aus den <input type=date>-Feldern,
       leer erlaubt (dann bleibt der Zeitfilter unverändert). segment ist
       "" (alle) oder einer von Container/Landverkehr/BSL/Sonstige. */
    setManualFilter(vonISO, bisISO, segment) {
      if(this._boundFeeds&&!this._boundFeeds.has('dimension_planstart_tag'))return this._filterFailed('Manueller Planstart-Zeitraum nicht verfügbar: dimension_planstart_tag fehlt in der Datenbindung.');
      // Empty date inputs keep the previous effective date window.
      if(!vonISO&&!bisISO){const old=this._periodContext;const r=old?.manual?{from:old.von,to:old.bis}:WEUX.range(old?.periode);vonISO=r.from||'';bisISO=r.to||'';}
      else {vonISO=vonISO||bisISO;bisISO=bisISO||vonISO;}
      if((vonISO&&!this._isoToBW(vonISO))||(bisISO&&!this._isoToBW(bisISO)))return this._filterFailed('Ungültiges Datum. Bitte ein vollständiges Kalenderdatum auswählen.');
      if (vonISO && bisISO && vonISO > bisISO) {
        const input=this._shadow.getElementById('fltBis');
        input.setCustomValidity('Das Enddatum muss am oder nach dem Startdatum liegen.');input.reportValidity();return false;
      }
      this._shadow.getElementById('fltBis')?.setCustomValidity('');
      if (this._periodContext && !this._periodContext.manual) {
        this._strategyContext={...this._periodContext};this._strategyYoY=this._yoy;
      }
      const LADE_DIM = "dimension_ladestelle";
      const TS_DIM = "dimension_planstart_tag";
      const ds = this._getDataSource();
      if (!ds) {
        console.warn("[WE-Cockpit] setManualFilter: keine DataSource — nur Kontext gesetzt, kein Requery.");
      } else {
        this._filterError=null;this._rows=null;this._model=null;this._detail=null;
        // Ein Datumsbereich ersetzt die Kalenderwochen-Filterung der
        // Strategie-Kopplung vollständig (präziser, tagesgenau statt KW).
        const vonBW = this._isoToBW(vonISO), bisBW = this._isoToBW(bisISO);
        if (vonBW || bisBW) {
          try { ds.removeDimensionFilter(TS_DIM); } catch (e) {}
          try { ds.setDimensionFilterRange(TS_DIM, vonBW || bisBW, bisBW || vonBW); }
          catch (e) { console.warn("[WE-Cockpit] Datumsfilter fehlgeschlagen:", e && e.message);return this._filterFailed('Zeitraum konnte nicht angewendet werden. Bitte erneut versuchen.'); }
        }
        try { ds.removeDimensionFilter(LADE_DIM); } catch (e) {}
        if (segment) {
          const werte = SEGMENT_TO_LADESTELLE[segment] || [segment];
          try { ds.setDimensionFilter(LADE_DIM, werte); }
          catch (e) { console.warn("[WE-Cockpit] Segment-Filter fehlgeschlagen:", e && e.message);return this._filterFailed('Ladestelle konnte nicht angewendet werden. Bitte erneut versuchen.'); }
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
      this._yoy=null;
      this._detail=null;
      this._supplierDetail=null;this._tableViews={};
      this._renderContextBanner();
      this._render();
      // Filter-Panel wieder einklappen, sobald angewendet.
      this.dispatchEvent(new CustomEvent('onManualSelection',{detail:{von:vonISO,bis:bisISO,segment}}));
      const p = this._shadow.getElementById("filterpanel");
      if (p) { p.hidden = true; this._shadow.getElementById("btnFilter").classList.remove("on"); }
      return !!ds;
    }

    restoreStrategySelection() {
      const c=this._strategyContext;
      if(!c){this.clearPeriodFilter();this.dispatchEvent(new CustomEvent('onContextClear'));return;}
      const r=WEUX.range(c.periode);
      const applied=this.setPeriodFilter(c.periode,c.segment,r.from,r.to,c.vorjahr);
      if(!applied&&this._getDataSource())return false;
      this._yoy=this._strategyYoY||null;
      const panel=this._shadow.getElementById('filterpanel');if(panel)panel.hidden=true;
      this.dispatchEvent(new CustomEvent('onRestoreSelection',{detail:{...c}}));
      this._render();
    }

    /* Gegenstück beim Schließen der Detailansicht: Periode/Segment-Filter
       der eigenen Datenquelle entfernen und den Kontext-Banner zurücksetzen
       (nutzt die bestehende clearPeriodContext() für den UI-Teil). Optional
       könnt ihr hier einen festen Default-Zeitraum erneut setzen. */
    clearPeriodFilter() {
      const LADE_DIM = "dimension_ladestelle";
      const TS_DIM = "dimension_planstart_tag";
      const ds = this._getDataSource();
      if (ds) {
        try { ds.removeDimensionFilter(LADE_DIM); } catch (e) {}
        try { ds.removeDimensionFilter(TS_DIM); } catch (e) {}
        // Beispiel Default-Zeitraum (an euer Modell anpassen):
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
      this._strategyContext=null;this._strategyYoY=null;this._detail=null;this._supplierDetail=null;this._tableViews={};this._filterError=null;
      this._renderContextBanner();
      this._render();
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
          <button id="ctxclear" title="Den Zeitraum der Strategieübersicht wieder übernehmen">Strategieauswahl wiederherstellen</button>`;
      } else {
        const seg = ctx.segment && ctx.segment !== "Gesamt" ? ` · ${esc(ctx.segment)}` : "";
        bar.innerHTML = `<span class="ctx-dot"></span>
          <span>Strategieübersicht → <b>${esc(ctx.periode)}</b>${seg} → Detailanalyse</span>
          <button id="ctxclear" title="Detailanalyse verlassen">← Zurück zur Strategieübersicht</button>`;
      }
      const btn = this._shadow.getElementById("ctxclear");
      if (btn) btn.onclick = () => {
        if(ctx.manual){this.restoreStrategySelection();return;}
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
      this._model = Array.isArray(this._rows) && this._rows.length ? WEEngine.buildModel(this._rows, this._props) : null;
      if(this._detail&&!this._model?.tes.some(t=>t.belegnr===this._detail))this._detail=null;
      this._render();
    }

    /* =========================== RENDERING =========================== */
    _render() {
      const M = this._model, S = this._shadow;
      S.getElementById("sub").textContent = M ? `${M.kpis.nTes} TE · ${M.kpis.nAnlieferungen} Anlieferungen · ${M.kpis.nPositions} Positionen · Geplanter Start ab` : "";
      S.getElementById("tabs").innerHTML = MODES.map(m => `<button data-id="${m.id}" class="${m.id===this._mode?'on':''}">${m.label}</button>`).join("");
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
      if (mode.id === "artikelabweichungen") { this._viewArtikelabweichungen(main); return; }
      if (mode.id === "kritisch")      { this._viewKritisch(main); return; }
      if (mode.id === "warengruppen")  { this._viewWarengruppen(main); return; }
      if (mode.id === "schicht")      { this._viewSchicht(main); return; }
      this._viewPuls(main);
    }

    _renderKpis() {
      const el = this._shadow.getElementById("kpis"), M = this._model;
      if (!M) { el.innerHTML = ""; return; }
      const k = M.kpis, t = M.trends, d = M.deltas;
      const tile = (goto, title, value, series, delta, lowerBetter, invPct, basis, key) => {
        let badge = "";
        if (delta) {
          const cls = Math.round(Math.abs(delta.rel * 100)) === 0 ? "neutral" : delta.better ? "up" : "down";
          const arrow = cls === "neutral" ? "=" : (delta.rel < 0) ? "▼" : "▲";
          badge = `<em class="d ${cls}" title="Letzter Trendabschnitt gegenüber dem nach Fallzahl gewichteten Mittel der vorherigen Trendabschnitte">${arrow} ${Math.abs(delta.rel * 100).toFixed(0)}% · Verlauf</em>`;
        }
        return `<div class="kpi" data-goto="${goto}" title="${title}">
          <span class="lbl">${title}${WEUX.info(key,title+' erklären')}</span>
          <div class="val"><b>${value}</b>${badge}</div>
          <span class="ux-badge">${key==='critical'?'Position':'TE'}</span><span class="sub">${basis || ""}</span>
          ${this._sparkline(series, invPct)}
          <span class="ux-detail-hint">Analyse öffnen ›</span>
        </div>`;
      };
      el.innerHTML =
        tile("prozesskette", "Ø Standzeit", fmtH(k.phaseStats.dwell.avg), t.dwell, d.dwell, true, false, `Basis: ${k.phaseStats.dwell.n} TE`,'dwell_avg') +
        tile("prozesskette", "Ø Vereinnahmung", fmtH(k.phaseStats.booking.avg), t.booking, null, true, false, `Basis: ${k.phaseStats.booking.n} TE`,'booking_avg') +
        tile("prozesskette", "Ø Einlagerung · Näherung", fmtH(k.phaseStats.putaway.avg), t.putaway, d.putaway, true, false, `Basis: ${k.phaseStats.putaway.n} TE`,'putaway_avg') +
        tile("prozesskette", "Ø Operativer WE · Näherung", fmtH(k.phaseStats.operative.avg), t.operative, d.operative, true, false, `Basis: ${k.phaseStats.operative.n} TE`,'operative_avg') +
        tile("spediteur", "Berechnete Termintreue", fmtP(k.onTime), t.onTime, d.onTime, false, true, `Basis: ${k.phaseStats.delay.n} TE · Toleranz ${k.tolMin} min${k.tolMin!==30?' · abweichende Einstellung':''}`,'calc_punctual') +
        tile("kritisch", "Kritische Positionen", String(k.nKritArt), t.critical, null, true, false, `Basis: ${k.nPositions} Pos. · ${k.nKritTes} TE betroffen`,'critical') +
        `<div class="kpi ${k.nErrors ? "err" : ""}" data-goto="puls" title="Datenfehler und Abdeckung ansehen">
          <span class="lbl">Datenfehler${WEUX.info('errors')}</span>
          <div class="val"><b>${k.nErrors}</b></div>
          <span class="sub">Fehlerfälle in ${k.nErrorTes} TE</span><span class="ux-detail-hint">Prüfdetails öffnen ›</span>
        </div>`;
    }

    /** Mini-Trendkurve als SVG; invPct skaliert 0–1 Quoten. */
    _sparkline(series, isPct) {
      if (!series || series.length < 2) return `<span class="sub">Trend: zu wenige bewertbare Zeitabschnitte</span>`;
      const vals = series.map((p) => p.avg);
      const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1;
      const W = 108, Hh = 26;
      const X = (i) => (i / (series.length - 1)) * (W - 2) + 1;
      const Y = (v) => Hh - 3 - ((v - lo) / rng) * (Hh - 6);
      const pts = series.map((p, i) => `${X(i).toFixed(1)},${Y(p.avg).toFixed(1)}`).join(" ");
      const last = series[series.length - 1];
      return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="${X(series.length - 1).toFixed(1)}" cy="${Y(last.avg).toFixed(1)}" r="2.2" fill="var(--accent)"/>
      </svg>`;
    }

    /* ---- Überblick: Engpass · Phasenmediane + Befunde + Einstieg ---- */
    /* ═══ 1) PULS — Zustand der Periode auf einen Blick ═══ */
    _viewPuls(main) {
      const M = this._model;
      const hasYoY = this._yoy && this._yoy.length;
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="card"><h3>Qualität der ausgewählten Periode</h3><div id="gauges"></div></div>
        <div class="findings" id="findings"></div>
        <div class="row" style="margin-top:3mm">
          <div class="card grow"><h3>Auffällige Prozessphasen · typische Dauer</h3><div id="waterfall"></div></div>
          <div class="card grow"><h3>Mengen &amp; Verteilung der TEs</h3><div id="throughput"></div></div>
        </div>
        <details class="ux-expand" data-ux-panel="quality"><summary>Datenqualität: ${M.kpis.nErrors} Fehlerfälle in ${M.kpis.nErrorTes} TE · Prüfdetails anzeigen</summary><div class="card"><h3>Datenqualität &amp; Abdeckung <span class="data-level">TE + Position</span></h3><div id="dq"></div></div></details>
        <details class="ux-expand" data-ux-panel="roadmap"><summary>Geplante Erweiterungen · noch nicht berechenbar</summary><div class="card"><h3>Zielbild</h3><div id="roadmap"></div></div></details>
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
      this._renderRoadmap(wrap.querySelector("#roadmap"));
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

    _renderRoadmap(el) {
      const items = [
        ["Datenanbindung", "14-Monats-Zielbaseline", "Je Standort 14 vollständige historische Monate; die letzten 6 Wochen vor dem Vergleichszeitraum ausschließen. Separater BW-Baselinebestand fehlt."],
        ["Geplant", "Entladungsrate", "Entladene DISTINCT TEs / alle geplanten DISTINCT TEs einschließlich No-Shows. Vollständiger Planbestand fehlt."],
        ["Geplant", "Produktivität Entladung", "Paletten oder Kollis / Mitarbeiterstunden. Belastbare Paletten- und Mitarbeiterzuordnung fehlt."],
        ["Geplant", "Produktivität Vereinnahmung", "Vereinnahmte HUs / Mitarbeiterstunden. HU-, Start- und Mitarbeiterdaten fehlen."],
        ["Geplant", "Produktivität Einlagerung", "Eingelagerte HUs / Mitarbeiterstunden. HU- und Lageraufgabendaten fehlen."],
        ["Geplant", "Gesamtproduktivität WE", "Bearbeitete TEs / gesamte Mitarbeiterstunden. REFA-Definition und vollständige Mitarbeiterzeiten fehlen."],
        ["Phase 2", "Fehlerquote Vereinnahmung", "QM-Fehlerdaten, geprüfte HUs, Fehlerart und KR-User fehlen."],
        ["Phase 2", "Torleichen / Einlagerungsfehler", "HU-ID, HU-Standort, Lagerbereich und belastbares Einlagerungsende fehlen."],
      ];
      el.innerHTML = `<div class="roadmap-grid">${items.map(([state,title,note]) => `<div class="roadmap-tile" aria-disabled="true"><span class="roadmap-state">${state} · deaktiviert</span><b>${title}</b><span>${note}</span></div>`).join("")}</div>`;
    }

    /* Datenqualität & Abdeckung: welcher Anteil der für eine Analyse
       benötigten Felder ist im aktiven Filter technisch auswertbar?
       TE-Felder werden gegen die TE-Anzahl geprüft, Positionsfelder gegen
       die Positionsanzahl. Vorhandensein bedeutet NICHT automatisch
       fachliche Richtigkeit — nur technische Auswertbarkeit. */
    _renderDatenqualitaet(el) {
      const M = this._model;
      const D = M.deliveries, P = M.positions;
      const nD = D.length, nP = P.length;
      const teCore = D.filter(d => d.ts_ankunft instanceof Date && d.ts_angedockt instanceof Date
        && d.ts_entladen_start instanceof Date && d.ts_entladen_ende_eff instanceof Date && d.ts_abfahrt instanceof Date).length;
      const teFertig = D.filter(d => d.ts_einlagerung_last instanceof Date).length;
      const tePn = D.filter(d => { const f = String(d.sap_puenktlich||"").trim().toUpperCase(); return f === "P" || f === "N"; }).length;
      const teSped = D.filter(d => d.frachtfuehrer).length;
      const pPa1 = P.filter(p => p.pa1 != null && p.pa1 > 0).length;
      const pPack = P.filter(p => p.standard_packmittel).length;
      const pIstSoll = P.filter(p => p.menge_ist != null && p.menge_soll != null).length;
      const pLief = P.filter(p => p.lieferant).length;
      const pHierarchy = P.filter(p => p.belegnr && p.anlieferung && p.pos && p.positionKey).length;
      const err = M.dataErrors || [];
      const errMissing = err.filter(e => /fehlt|unvollständig|leer/i.test(e.phase || "")).length;
      const errNegative = err.filter(e => (Number.isFinite(e.hours) && e.hours < 0) || /vor WE-Buchung/i.test(e.phase || "")).length;
      const errConflict = err.filter(e => /widersprüch|mehreren TEs|ungültig/i.test(e.phase || "")).length;
      const rows = [
        ["Hierarchie vollständig", pHierarchy, nP, "TE [0WM_TUNUM], Anlieferung [0WM_DOCNO] und Position [0WM_ITEMNO]"],
        ["TE-Kernzeitstempel", teCore, nD, "Ankunft, Andocken, Entladen Start/Ende, Abfahrt"],
        ["Fertigstellung vollständig", teFertig, nD, "Alle geladenen Positionen abgeschlossen; letzte Fertigstellung je TE"],
        ["P/N vorhanden", tePn, nD, "BW-Pünktlichkeitskennzeichen je TE"],
        ["Spediteur gepflegt", teSped, nD, "Frachtführer je TE"],
        ["PA1 gepflegt", pPa1, nP, "Rechenbasis für Paletten"],
        ["Packmittel gepflegt", pPack, nP, "Standard-Packmittel am Produkt"],
        ["IST/SOLL vorhanden", pIstSoll, nP, "Mengentreue-Berechnung je Position"],
        ["OTIF Position bewertbar", M.kpis.quality.otifPosition.n, M.kpis.quality.otifPosition.total, "OTIF pro Pos [BWMOTIF]"],
        ["OTIF Anlieferung bewertbar", M.kpis.quality.otifDelivery.n, M.kpis.quality.otifDelivery.total, "OTIF je Anlieferung [BWMOTIFA]"],
        ["Lieferant gepflegt", pLief, nP, "Lieferantenanalyse"],
      ];
      el.innerHTML = `<div class="dq-grid">
        <div class="dq-summary"><b>${D.length}</b> TE · <b>${M.anlieferungen.length}</b> Anlieferungen · <b>${P.length}</b> Positionen<br>
          Datenfehler: <b>${err.length}</b> Fälle in <b>${M.kpis.nErrorTes}</b> TE · fehlend/unvollständig ${errMissing} · negative Zeitkette ${errNegative} · Konflikt/ungültig ${errConflict}<br>
          </div>
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
      const q = this._model.kpis.quality;
      const gauge = (label, stat, source, key) => `<div class="gauge">
        <div class="gv">${stat.rate == null ? "Nicht bewertbar" : (stat.rate * 100).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}) + "<span>%</span>"}</div>
        <div class="gl">${label}${WEUX.info(key,label+' erklären')}</div>
        <div class="gs">${source} · ${stat.level}<br>${stat.ok} erfüllt / ${stat.n} bewertet · ${stat.total - stat.n} ohne Bewertung</div>
      </div>`;
      el.innerHTML = `<div class="gauges">
        ${gauge("OTIF · Position", q.otifPosition, "BW O/N",'otif_pos_quote')}
        ${gauge("OTIF · Anlieferung", q.otifDelivery, "BW O/N",'otif_quote')}
        ${gauge("Liefervollständigkeit", q.fullDelivery, "BW V/N",'voll_quote')}
        ${gauge("BW-Pünktlichkeit", q.punctualTe, "BW P/N",'puenkt_quote')}
        ${gauge("Mengentreue · Position", q.qtyPosition, "IST = SOLL",'qty_pos_quote')}
        ${gauge("Mengentreue · Anlieferung", q.qtyDelivery, "Alle Positionen mengentreu",'qty_anl_quote')}
      </div>`;
    }

    /* Durchsatz: Mengen/Volumen/Wert/Kollis + Segmentverteilung */
    _pulsThroughput(el) {
      const M = this._model, D = M.deliveries;
      const sum = (f) => { let s = 0, any = false; for (const d of D) { const v = d[f]; if (typeof v === "number" && !isNaN(v)) { s += v; any = true; } } return any ? s : null; };
      const menge = sum("sum_menge"), vol = sum("sum_volumen"), koll = sum("sum_kollis");
      const fmt = (v) => v == null ? 'Nicht verfügbar' : v.toLocaleString('de-DE',{maximumFractionDigits:1});
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
          <div class="tp-k"><b>${fmt(menge)}</b><small>Menge · ${esc(this._props.quantityUnit||'Rohsumme; Einheit unbestätigt')}</small></div>
          <div class="tp-k"><b>${fmt(vol)}</b><small>Volumen · ${esc(this._props.volumeUnit||'Einheit unbestätigt')}</small></div>
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
          <div class="pk-hint-row">Balkenabschnitt anklicken oder berühren: Zeiten erklären · TE-Zeile anklicken: Anlieferungen und Positionen öffnen. Die Farben unterscheiden Prozessphasen, keine Qualitätsbewertung.</div>
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
        ["#f39c12", "Vereinnahmung", "Tatsächliches Ende Entladen bis zur letzten WE-Buchung der TE. Jede TE zählt einmal."],
        [C.accent, "Einlagerung · Näherung", "Letzte WE-Buchung bis zur letzten Fertigstellung aller geladenen Positionen der TE. Jede TE zählt einmal."],
        [C.sonst, "Seetransport-Vorkette", "Nur bei Containern: Verschifft → Hafen → Verzollung → Depot → Ankunft Kontrollpunkt."],
      ];
      el.innerHTML = `
        <div class="pk-legend-title"><b>So liest du die Farben der Prozesskette</b>
          <span>Für Vereinnahmung, Einlagerung und operativen Wareneingang wird zuerst der Abschluss der gesamten TE gebildet. Fehlt der Abschluss einer geladenen Position, bleibt die betroffene TE-Kennzahl unbewertet. Fertigstellung dient bis zur HU-Anbindung als Näherung für die Einlagerung.</span>
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
        <div class="card" style="flex:1 1 100%; width:100%"><h3>Standzeit nach Planstart · statistische Vergleichsgrenze</h3><div id="scatter"></div></div>
        <div class="card" style="flex:1 1 100%; width:100%"><h3>Statistisch auffällige TEs · nach Stärke der Abweichung</h3><div id="tbl"></div></div>`;
      main.appendChild(wrap);
      const mode = { metric: "dwell", level: "te", label: "Standzeit", unit: "h", phases: ["wait_gate","reaction","unload"] };
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
        if (d.phases?.dwell == null) continue;
        for (const key of new Set(d._dimValues?.[dim] || [d[dim]])) {
          if (isNull(key)) continue;
          (groups[key] ||= []).push(d);
        }
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
        <div class="finding">Mindestbasis ${this._props.minCarrierTe} bewertete TEs · ${r.excluded.length} Spediteur(e) wegen zu kleiner Datenbasis nicht gerankt. Ein Ranking zeigt höchstens 10 Spediteure.</div>
        <div class="row">
          <div class="card"><h3>Top 10 · pünktlichste Spediteure <span class="data-level">TE</span></h3><div id="sp-top"></div></div>
          <div class="card"><h3>10 Spediteure mit niedrigster BW-Pünktlichkeit <span class="data-level">TE</span></h3><div id="sp-flop"></div></div>
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
        const g = groups.get(key) || { name: key, okPos: 0, devPos: 0, totalPos: 0, underPos: 0, overPos: 0, sumAbsDev: 0, sumAbsPct: 0, relCount: 0, tes: new Set() };
        if (dev === 0) g.okPos++; else {
          g.devPos++; g.sumAbsDev += Math.abs(dev);
          if (dev < 0) g.underPos++; else g.overPos++;
          if (p.qty_dev_pct != null && Number.isFinite(p.qty_dev_pct)) { g.sumAbsPct += Math.abs(p.qty_dev_pct); g.relCount++; }
        }
        g.totalPos++; if (p.belegnr) g.tes.add(String(p.belegnr)); groups.set(key, g);
      }
      const all = [...groups.values()].map(g => ({
        name: g.name, okPos: g.okPos, devPos: g.devPos, totalPos: g.totalPos, underPos: g.underPos, overPos: g.overPos,
        nTe: g.tes.size, okRate: g.totalPos ? g.okPos / g.totalPos : NaN, devRate: g.totalPos ? g.devPos / g.totalPos : NaN,
        avgAbsDev: g.devPos ? g.sumAbsDev / g.devPos : 0, avgAbsPct: g.relCount ? g.sumAbsPct / g.relCount : 0,
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
        return `<div class="rank-row rank-drillable" data-supplier="${esc(r.name)}" role="button" tabindex="0" aria-label="Positionen von ${esc(r.name)} analysieren" title="${esc(r.name)} · Positionen analysieren · Ø|Δ| ${r.avgAbsDev.toFixed(1)} · Ø|Δ%| ${r.avgAbsPct.toFixed(1)}% · Basis ${r.totalPos} Positionen">
          <span class="rank-no">${i + 1}</span>
          <span class="rank-name">${esc(r.name)}</span>
          <div class="rank-track"><i style="width:${pct.toFixed(1)}%;background:${col}"></i></div>
          <span class="rank-pct" style="color:${col}">${pct.toFixed(1)}%</span>
          <span class="rank-n"><b>✓ ${r.okPos}</b> · Δ ${r.devPos}<br>n=${r.totalPos} Pos · ${r.nTe} TE</span>
          <span class="rank-severity">Unter <b>${r.underPos}</b> · Über <b>${r.overPos}</b> · Ø|Δ| <b>${r.avgAbsDev.toFixed(1)}</b> · Ø|Δ%| <b>${r.avgAbsPct.toFixed(1)}%</b></span>
        </div>`;
      }).join("") + `</div>`;
    }

    _viewKritisch(main) {
      const M = this._model;
      const all = M.positions.filter(p => p.positionKey);
      const krit = all.filter(p => p.isKritArt);
      const supplierMap = new Map(), categoryMap = new Map();
      for (const p of all) {
        const name = String(p.lieferant || "Nicht zugeordnet").trim();
        const g = supplierMap.get(name) || {name, total:0, krit:0, tes:new Set()};
        g.total++;
        if (p.isKritArt) { g.krit++; if (p.belegnr) g.tes.add(p.belegnr); }
        supplierMap.set(name, g);
      }
      for (const p of krit) {
        const cat = String(p.kategorie_krit_art || "Nur Freitext").trim();
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
      }
      const suppliers = [...supplierMap.values()].filter(g => g.krit)
        .map(g => ({...g, rate:g.total ? g.krit / g.total : null, nTes:g.tes.size}))
        .sort((a,b) => b.krit-a.krit || b.rate-a.rate || a.name.localeCompare(b.name,"de"));
      const maxSupplier = Math.max(1, ...suppliers.map(g => g.krit));
      const cats = [...categoryMap.entries()].sort((a,b) => b[1]-a[1]);
      const maxCat = Math.max(1, ...cats.map(([,n]) => n));
      const fmtTs = t => t instanceof Date ? t.toLocaleDateString("de-DE") : "–";
      const trend = M.trends.critical || [];
      const maxTrend = Math.max(1, ...trend.map(x => x.krit));
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="finding">Kritisch bedeutet: Kategorie oder Freitext ist gesetzt. Produktbeschreibung und systemischer Mehraufwand sind noch nicht Teil der Datenbasis.</div>
        <div class="row">
          <div class="card"><h3>Kritische Positionen im Zeitverlauf <span class="data-level">Position</span></h3><div id="krit-trend"></div></div>
          <div class="card"><h3>Kategorien <span class="data-level">Position</span></h3><div id="krit-cat"></div></div>
        </div>
        <div class="card"><h3>Lieferantenranking · kritische Positionen <span class="data-level">Position</span></h3><div id="krit-supplier"></div></div>
        <div class="card"><h3>Details <span class="data-level">Position</span></h3><div id="krit-table"></div></div>`;
      main.appendChild(wrap);
      wrap.querySelector("#krit-trend").innerHTML = trend.length ? `<div class="rank-list">${trend.map(x => `<div class="rank-row"><span class="rank-name">${esc(x.period)}</span><div class="rank-track"><i style="width:${(100*x.krit/maxTrend).toFixed(1)}%;background:${C.accent}"></i></div><span class="rank-pct">${x.krit}</span><span class="rank-n">${x.n} Positionen gesamt · ${(100*x.krit/x.n).toFixed(1)} % kritisch</span></div>`).join("")}</div>` : `<div class="empty">Keine datierten kritischen Positionen.</div>`;
      wrap.querySelector("#krit-cat").innerHTML = cats.length ? `<div class="rank-list">${cats.map(([name,n]) => `<div class="rank-row"><span class="rank-name">${esc(name)}</span><div class="rank-track"><i style="width:${(100*n/maxCat).toFixed(1)}%;background:${C.accent}"></i></div><span class="rank-pct">${n}</span></div>`).join("")}</div>` : `<div class="empty">Keine kritischen Kategorien im Filter.</div>`;
      wrap.querySelector("#krit-supplier").innerHTML = suppliers.length ? `<div class="rank-list">${suppliers.map((g,i) => `<div class="rank-row"><span class="rank-no">${i+1}</span><span class="rank-name">${esc(g.name)}</span><div class="rank-track"><i style="width:${(100*g.krit/maxSupplier).toFixed(1)}%;background:${C.accent}"></i></div><span class="rank-pct">${g.krit}</span><span class="rank-n">${g.nTes} TE · ${g.total} Positionen gesamt · ${(100*g.rate).toFixed(1)} % kritisch</span></div>`).join("")}</div>` : `<div class="empty">Keine kritischen Lieferanten im Filter.</div>`;
      this._renderPositionTable(wrap.querySelector('#krit-table'),{id:'critical-positions-table',key:'critical',rows:krit,columns:[...this._positionQuantityColumns().slice(0,6),{label:'Kategorie',html:p=>esc(p.kategorie_krit_art||'–')},{label:'Freitext',html:p=>esc(p.freitext_krit_art||'–')},{label:'Ereignisdatum',html:p=>p.ts_fertigstellung?'Fertigstellung: '+fmtTs(p.ts_fertigstellung):p.ts_we_pos?'WE-Buchung: '+fmtTs(p.ts_we_pos):p.ts_ankunft?'Ankunft: '+fmtTs(p.ts_ankunft):'Nicht übermittelt'}]});
    }

    _renderPositionTable(host, {id, key, rows, columns, deviations=false}) {
      this._tableViews ||= {};
      const state=this._tableViews[key] ||= {query:'',kind:'all',page:0};
      const indexed=rows.map((p,i)=>({p,i,text:[p.belegnr,p.anlieferung,p.pos,p.lieferant,p.produkt,p.produkt_name,p.kategorie_krit_art,p.freitext_krit_art].filter(Boolean).join(' ').toLocaleLowerCase('de-DE')}));
      host.innerHTML=`<div class="ux-table-controls"><input type="search" aria-label="TE, Lieferant oder Artikel suchen" placeholder="TE, Anlieferung, Lieferant oder Artikel suchen …" value="${esc(state.query)}">${deviations?'<select aria-label="Mengenabweichung filtern"><option value="all">Alle Abweichungen</option><option value="under">Unterlieferungen</option><option value="over">Überlieferungen</option></select>':''}<button type="button" data-page="prev">← Vorherige</button><span class="ux-meta" role="status" aria-live="polite"></span><button type="button" data-page="next">Nächste →</button></div><div class="ux-table-wrap"><table id="${id}"><thead><tr>${columns.map(c=>`<th scope="col"${c.numeric?' class="ux-number"':''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>`;
      const search=host.querySelector('input'),kind=host.querySelector('select'),tbody=host.querySelector('tbody'),status=host.querySelector('[role=status]'),prev=host.querySelector('[data-page=prev]'),next=host.querySelector('[data-page=next]');
      if(kind)kind.value=state.kind;
      const draw=()=>{
        const q=state.query.trim().toLocaleLowerCase('de-DE');
        const filtered=indexed.filter(({p,text})=>(!q||text.includes(q))&&(!deviations||state.kind==='all'||(state.kind==='under'?p.qty_dev<0:p.qty_dev>0)));
        const size=50,pages=Math.max(1,Math.ceil(filtered.length/size));state.page=Math.max(0,Math.min(state.page,pages-1));
        const start=state.page*size,part=filtered.slice(start,start+size);
        tbody.innerHTML=part.map(({p,i})=>`<tr>${columns.map(c=>`<td${c.numeric?' class="ux-number"':''}>${c.html(p,i)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length}">Keine passenden Positionen in der aktuellen Auswahl.</td></tr>`;
        status.textContent=`${filtered.length?start+1:0}–${start+part.length} von ${filtered.length.toLocaleString('de-DE')} · Seite ${state.page+1}/${pages}`;
        prev.disabled=state.page===0;next.disabled=state.page>=pages-1;
      };
      search.addEventListener('input',()=>{state.query=search.value;state.page=0;draw();});
      kind?.addEventListener('change',()=>{state.kind=kind.value;state.page=0;draw();});
      for(const [button,delta] of [[prev,-1],[next,1]])button.onclick=()=>{state.page+=delta;draw();host.querySelector('.ux-table-wrap').scrollTop=0;};
      draw();
    }

    _positionQuantityColumns() {
      const fmt=v=>v==null||!Number.isFinite(v)?'–':v.toLocaleString('de-DE',{maximumFractionDigits:9});
      return [
        {label:'TE',html:p=>p.belegnr?`<button type="button" class="back" data-drill="${esc(p.belegnr)}" aria-label="TE ${esc(p.belegnr)} öffnen">${esc(p.belegnr)}</button>`:'–'},
        {label:'Anlieferung',html:p=>esc(p.anlieferung||'–')},{label:'Position',html:p=>esc(p.pos||'–')},
        {label:'Lieferant',html:p=>esc(p.lieferant||'Nicht zugeordnet')},{label:'Artikel',html:p=>esc(p.produkt||'–')},
        {label:'Artikelbezeichnung',html:p=>esc(p.produkt_name||'Nicht übermittelt')},
        {label:'Sollmenge',numeric:true,html:p=>fmt(p.menge_soll)},{label:'Istmenge',numeric:true,html:p=>fmt(p.menge_ist)},
        {label:'Differenzmenge (Ist − Soll)',numeric:true,html:p=>p.qty_dev==null?'Nicht bewertbar':`<span class="${p.qty_dev<0?'ux-deviation-negative':p.qty_dev>0?'ux-deviation-positive':''}">${p.qty_dev>0?'+':''}${fmt(p.qty_dev)}</span>`}
      ];
    }

    _viewArtikelabweichungen(main) {
      const all = this._model.positions;
      const valid = p => p.qty_dev != null && Number.isFinite(p.qty_dev);
      const rows = all.filter(p=>valid(p) && p.qty_dev!==0).sort((a,b)=>Math.abs(b.qty_dev)-Math.abs(a.qty_dev) || String(a.positionKey).localeCompare(String(b.positionKey),'de'));
      const fmt = v => v == null || !Number.isFinite(Number(v)) ? '–' : Number(v).toLocaleString('de-DE',{maximumFractionDigits:3});
      const stamp = v => v instanceof Date && Number.isFinite(v.getTime()) ? v.toLocaleString('de-DE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Nicht übermittelt';
      const card = document.createElement('div'); card.className='card';
      card.innerHTML=`<h3>Größte Mengenabweichungen · Artikelpositionen <span class="data-level">Position</span></h3>
        <p class="ux-meta">${rows.length} abweichende Positionen · ${all.filter(p=>!valid(p)).length} nicht bewertbar. Sortierung: größte absolute Differenz zuerst. Differenzmenge = Ist − Soll; Minus: Unterlieferung, Plus: Überlieferung.</p>
        <p class="ux-meta">Jede Zeile ist eine Anlieferposition; derselbe Artikel kann mehrfach erscheinen. Zeitraum nach „Geplanter Start ab“. WE-Buchung zeigt den Buchungszeitpunkt der Position.</p>
        <p class="ux-meta">Mengeneinheit: ${esc(this._props.quantityUnit||'nicht übermittelt; Vergleich der Rohmengen nur bei gleicher Einheit aussagekräftig')}.</p>
        <div id="article-positions"></div>`;
      main.appendChild(card);
      this._renderPositionTable(card.querySelector('#article-positions'),{id:'artikelabweichungen-table',key:'articles',rows,deviations:true,columns:[{label:'Rang',html:(_,i)=>i+1},...this._positionQuantityColumns(),{label:'WE gebucht am',html:p=>stamp(p.ts_we_pos)}]});
    }

    _viewLieferanten(main) {
      const r = this._lieferantMengenRanking();
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="finding">Mindestbasis ${this._props.minSupplierPos} bewertbare Positionen · ${r.excluded.length} Lieferant(en) wegen zu kleiner Datenbasis nicht gerankt. Lieferanten anklicken, um ihre Positionen zu analysieren.</div>
        <div class="row">
          <div class="card"><h3>Top 10 · höchste Mengentreue <span class="data-level">Position</span></h3><div id="lf-top"></div></div>
          <div class="card"><h3>10 Lieferanten mit höchster Abweichungsquote <span class="data-level">Position</span></h3><div id="lf-flop"></div></div>
        </div>
        <div class="card" id="lf-drill" hidden></div>`;
      main.appendChild(wrap);
      this._renderLieferantRanking(wrap.querySelector("#lf-top"), r.top, "top");
      this._renderLieferantRanking(wrap.querySelector("#lf-flop"), r.flop, "flop");
      const drill = wrap.querySelector('#lf-drill');
      const showSupplier = (name, scroll = true) => {
        this._supplierDetail = name;
        this._renderLieferantDetails(drill, name);
        if (scroll) { drill.scrollIntoView?.({block:'start',behavior:'smooth'}); drill.querySelector('h3')?.focus({preventScroll:true}); }
      };
      wrap.addEventListener('click', e => { const row=e.target.closest('[data-supplier]'); if(row) showSupplier(row.dataset.supplier); });
      wrap.addEventListener('keydown', e => { const row=e.target.closest('[data-supplier]'); if(row && (e.key==='Enter'||e.key===' ')){e.preventDefault();showSupplier(row.dataset.supplier);} });
      if(this._supplierDetail) showSupplier(this._supplierDetail, false);
      const card = document.createElement("div"); card.className = "card";
      card.innerHTML = `<h3>Mengentreue und Qualität · Anlieferung</h3><div id="lf-anl"></div>`;
      const panel = document.createElement('details');
      panel.className = 'ux-expand'; panel.dataset.uxPanel = 'lieferanten-anlieferungen';
      panel.innerHTML = '<summary>Mengentreue und Qualität · Anlieferung</summary>';
      panel.appendChild(card); wrap.appendChild(panel);
      const deliveries=this._model.anlieferungen;let drawn=false;
      const draw=()=>{if(panel.open&&!drawn){this._tblAnlieferungen(card.querySelector('#lf-anl'),deliveries);drawn=true;}};
      panel.addEventListener('toggle',draw);
      if(this._uxPanels?.['lieferanten-anlieferungen']) {panel.open=true;draw();}
    }

    _renderLieferantDetails(el, name) {
      const positions = this._model.positions.filter(p => String(p.lieferant||'').trim() === name);
      const fmt = value => value == null || !Number.isFinite(Number(value)) ? '–' : Number(value).toLocaleString('de-DE',{maximumFractionDigits:3});
      const signed = value => value == null || !Number.isFinite(Number(value)) ? 'Nicht bewertbar' : (value>0?'+':'')+fmt(value);
      const evaluated = positions.filter(p=>p.qty_dev!=null && Number.isFinite(p.qty_dev));
      el.hidden=false;
      el.innerHTML=`<button type="button" class="back" id="lf-close">← Zurück zum Lieferantenranking</button>
        <h3 tabindex="-1">Positionsanalyse · ${esc(name)}</h3>
        <p class="ux-meta">${positions.length} Positionen · ${evaluated.length} bewertbar · ${evaluated.filter(p=>p.qty_dev!==0).length} mit Mengenabweichung. Abweichung = Ist − Soll; negativ: Unterlieferung, positiv: Überlieferung.</p>
        <p class="ux-meta">Mengeneinheit: ${esc(this._props.quantityUnit || 'nicht übermittelt; Werte in der jeweiligen Quelleneinheit')}. Keine Summierung über unterschiedliche Einheiten.</p>
        <div id="supplier-positions"></div>`;
      this._renderPositionTable(el.querySelector('#supplier-positions'),{id:'supplier-positions-table',key:'supplier:'+name,rows:positions,columns:this._positionQuantityColumns().filter(c=>c.label!=='Lieferant')});
      el.querySelector('#lf-close').onclick=()=>{this._supplierDetail=null;el.hidden=true;const row=[...this._shadow.querySelectorAll('[data-supplier]')].find(r=>r.dataset.supplier===name);row?.scrollIntoView?.({block:'center'});row?.focus({preventScroll:true});};
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
        if (!p.hwg || !p.belegnr || !p.positionKey || p.hierarchyConflict) continue;
        const te = String(p.belegnr).trim();
        const hwg = String(p.hwg).trim();
        const key = te + "\u0001" + hwg;
        const g = teHwg.get(key) || { te, hwg, ankunft: null, ende: null, nPos: 0, invalid:false };
        if(!(p.ts_ankunft instanceof Date)||!(fertig instanceof Date)||fertig<p.ts_ankunft)g.invalid=true;
        if (!g.ankunft || p.ts_ankunft < g.ankunft) g.ankunft = p.ts_ankunft;
        if (!g.ende || fertig > g.ende) g.ende = fertig;
        g.nPos++;
        teHwg.set(key, g);
      }
      const byHwg = new Map();
      for (const g of teHwg.values()) {
        if(g.invalid)continue;
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
          <span style="margin-left:auto">Schichtlage aus BW · Mannschaften wechseln wöchentlich</span>
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

    _palettenJeEinlagerungsschicht() {
      return this._palettenJeSchicht('sh_einl');
    }

    _palettenJeSchicht(schichtfeld) {
      const result = {F:{paletten:0,positionen:0},S:{paletten:0,positionen:0},ungueltig:0,ohneSchicht:0};
      for(const p of this._model.positions) {
        const paletten = p.paletten;
        if(paletten==null || !Number.isFinite(paletten)) { result.ungueltig++; continue; }
        const schicht = String(p[schichtfeld]||'').trim().toUpperCase();
        if(schicht!=='F' && schicht!=='S') { result.ohneSchicht++; continue; }
        result[schicht].paletten += paletten; result[schicht].positionen++;
      }
      return result;
    }

    // TE/Mengen nach Ankunft; Paletten nach der BW-Schicht des jeweiligen Prozessschritts.
    _schThroughput(el) {
      const M = this._model;
      const stages = [
        {key:'unload',label:'Entladene Paletten',field:'sh_entl_tat',source:'Z.Sh. Tats. Ende Ent'},
        {key:'booking',label:'WE-gebuchte Paletten',field:'sh_we',source:'Z.Sh. WE gebucht'},
        {key:'putaway',label:'Eingelagerte Paletten',field:'sh_einl',source:'Z.Sh. Einl. Ende'}
      ].map(stage=>({...stage,stats:this._palettenJeSchicht(stage.field)}));
      const agg = { F: { anl: 0, pos: 0, menge: 0, vol: 0 }, S: { anl: 0, pos: 0, menge: 0, vol: 0 } };
      for (const d of M.deliveries) {
        const l = this._lageOf(d, "sh_ankunft"); if (!l) continue;
        agg[l].anl++; agg[l].pos += d.nPos || 0;
        agg[l].menge += d.sum_menge || 0; agg[l].vol += d.sum_volumen || 0;
      }
      const fmt = (v) => v==null || !Number.isFinite(v) ? "–" : v.toLocaleString('de-DE',{maximumFractionDigits:1});
      const col = (l) => SH_COLORS[l];
      const block = (l, name) => `
        <div class="sch-col" style="border-top:3px solid ${col(l)}">
          <div class="sch-h">${name}</div>
          <div class="sch-kpis">
            <div><b>${agg[l].anl}</b><small>TE</small></div>
            <div><b>${agg[l].pos}</b><small>Positionen</small></div>
            <div><b>${fmt(agg[l].menge)}</b><small>Menge</small></div>
            <div><b>${fmt(agg[l].vol)}</b><small>Volumen</small></div>
            ${stages.map(stage=>`<div style="grid-column:1/-1"><b data-pallet-stage="${stage.key}" data-shift="${l}" ${stage.key==='putaway'?`data-putaway-pallets="${l}"`:''} style="font-size:22px">${stage.stats[l].positionen ? stage.stats[l].paletten.toLocaleString('de-DE') : 'Nicht bewertbar'}</b><small>${stage.label} · ${stage.stats[l].positionen} Positionen</small></div>`).join('')}
          </div>
        </div>`;
      el.innerHTML = `<p class="ux-meta">TE und Mengen nach Ankunftsschicht; Paletten nach der Schicht des jeweiligen Prozessschritts.</p><div class="sch-cols">${block("F", "Frühschicht")}${block("S", "Spätschicht")}</div>
        <details class="ux-expand" data-ux-panel="schicht-paletten"><summary>Berechnung und Schichtzuordnung</summary>
        <p class="ux-meta">Paletten = Summe der je Anlieferposition aufgerundeten Werte (Menge Anlieferung IST ÷ PA1). Jede eindeutige Position zählt je Prozessschritt einmal. F = Frühschicht, S = Spätschicht. Die drei Prozesssummen dürfen nicht zu einer Gesamtpalettenzahl addiert werden.</p>
        ${stages.map(stage=>`<p class="ux-meta"><strong>${stage.label}</strong>: Zuordnung nach „${stage.source}“. Ausgeschlossen: ${stage.stats.ungueltig} Positionen wegen fehlender/ungültiger Istmenge, PA1 oder widersprüchlicher Daten; ${stage.stats.ohneSchicht} weitere Positionen ohne gültige Schicht F/S für diesen Schritt.</p>`).join('')}
        <p class="ux-meta">Entladen verwendet das vereinbarte tatsächliche Entladeende. PA1 muss größer als null sein. Es wird jeweils dieselbe Istmenge in Paletten umgerechnet; tatsächliche HU-Zählungen liegen hier nicht zugrunde.</p>
        <p class="ux-meta">TE, Positionen, Menge und Volumen oben beziehen sich auf die Ankunftsschicht. Die Paletten beziehen sich auf die Schicht des jeweiligen Prozessschritts. Der Zeitraum bleibt nach „Geplanter Start ab“ gefiltert; keine Auswahl nach Buchungs- oder Einlagerungsdatum.</p></details>`;
    }

    // Median-Zeit je Phase, gruppierte Balken Früh vs. Spät
    _schPhases(el) {
      const M = this._model;
      const phaseDefs = [
        ["wait_gate", "Wartezeit Tor", "sh_andocken", "delivery"],
        ["reaction", "Reaktion", "sh_entl_start", "delivery"],
        ["unload", "Entladen", "sh_unload_eff", "delivery"],
        ["booking", "Vereinnahmung", "sh_we", "te"],
        ["putaway", "Einlagerung · Näherung", "sh_einl", "te"],
        ["operative", "Operativer WE · Näherung", "sh_einl", "te"],
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
      const agg = { F: { n: 0, timeN: 0, outN: 0, onTime: 0, out: 0 }, S: { n: 0, timeN: 0, outN: 0, onTime: 0, out: 0 } };
      for (const d of M.deliveries) {
        const l = this._lageOf(d, "sh_entl"); if (!l) continue;
        agg[l].n++;
        if (d.phases?.delay != null) {
          agg[l].timeN++;
          if (d.phases.delay <= (M.cfg.toleranzMin ?? 30) / 60) agg[l].onTime++;
        }
        if (["dwell", "unload", "wait_gate"].some(k => d.phases?.[k] != null)) {
          agg[l].outN++;
          if (d.outlier && (d.outlier.dwell || d.outlier.unload || d.outlier.wait_gate)) agg[l].out++;
        }
      }
      const pct = (a, b) => b ? (a / b * 100) : null;
      const rowFor = (l, name) => {
        const ot = pct(agg[l].onTime, agg[l].timeN), or = pct(agg[l].out, agg[l].outN);
        const otCol = C.ink;
        return `<div class="sch-q-row">
          <span class="sch-q-name"><i style="background:${SH_COLORS[l]}"></i>${name}</span>
          <div class="sch-q-metric"><span class="sch-q-v" style="color:${otCol}">${ot==null?"–":ot.toFixed(0)+"%"}</span><small>termintreu · Basis ${agg[l].timeN} TE</small></div>
          <div class="sch-q-metric"><span class="sch-q-v" style="color:${or>0?C.outlier:C.ink}">${or==null?"–":or.toFixed(0)+"%"}</span><small>Ausreißer · Basis ${agg[l].outN} TE</small></div>
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

    /* Unabhängige Phasenmediane sind nicht zu einer Gesamtdauer addierbar. */
    _svgWaterfall(el) {
      const bn = this._model.bottleneck;
      if (!bn?.length) { el.innerHTML = `<div class="empty">Zu wenige Daten für die Engpass-Analyse.</div>`; return; }
      const steps = ["wait_gate", "reaction", "unload", "booking", "putaway"].map(k => bn.find(b => b.key === k)).filter(Boolean);
      const W = 460, rowH = 46, padL = 160, barW = 230;
      const maxV = Math.max(0.1, ...steps.map(s => s.p75));
      let svg = `<svg viewBox="0 0 ${W} ${steps.length * rowH + 30}" width="100%" role="img" aria-label="Phasenmediane je TE">`;
      steps.forEach((s, i) => {
        const y = i * rowH + 6, col = s.key === bn[0].key ? C.accent : C.ink2;
        const w = s.med / maxV * barW, spread = s.p75 / maxV * barW;
        svg += `<text x="0" y="${y + 17}" font-size="11" fill="${C.ink}">${esc(s.label)}</text>
          <rect x="${padL}" y="${y + 10}" width="${spread}" height="8" rx="2" fill="${col}" opacity=".2"><title>P75 ${fmtH(s.p75)}</title></rect>
          <rect x="${padL}" y="${y + 4}" width="${Math.max(1, w)}" height="20" rx="3" fill="${col}"><title>Median ${fmtH(s.med)} · n=${this._model.kpis.phaseStats[s.key].n} TE</title></rect>
          <text x="${padL + w + 4}" y="${y + 18}" font-size="10" fill="${C.muted}">${fmtH(s.med)}</text>`;
      });
      el.innerHTML = svg + `<text x="0" y="${steps.length * rowH + 22}" font-size="10" fill="${C.muted}">Median je Phase · jede TE einmal · heller Balken bis P75</text></svg>`;
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
      const recs = mode.level === "te" ? M.deliveries : M.positions;
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
        <div class="card"><h3>Auffällige ${mode.level === "te" ? "TEs" : "Positionen"} (Top nach z-Score)</h3><div id="tbl"></div></div>`;
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
      const pts = recs.filter((r) => r.phases[metric] != null && r.ts_geplant_start);
      const tsField = "ts_geplant_start";
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
        <th>Beleg/Pos</th><th>Ereignisdatum · siehe Angabe</th><th>Lieferant</th><th>Ladestelle</th>
        <th>${esc(PHASES[metric].label)}</th><th>z</th>
        ${mode.phases.map((k) => `<th>${PHASES[k].label}</th>`).join("")}
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    /* ---- TE-Detailansicht (Drill-down) ---- */
      // Dokumentierten Bearbeitungsstand aus dem historischen Datenauszug ableiten.
    _teStatus(d, pos) {
      const has = (t) => t instanceof Date;
      if (d.fertigVollstaendig && d.phases.operative != null) return { key: "eingelagert", label: "Fertiggestellt · Näherung", step: 4, col: C.container || "#27ae60" };
      if (d.nFertig) return { key: "teilfertig", label: `Fertigstellung ${d.nFertig}/${d.nPos} Pos.`, step: d.buchungVollstaendig ? 3 : 2, col: "#f5b041" };
      if (d.buchungVollstaendig) return { key: "gebucht", label: "WE gebucht", step: 3, col: "#16a085" };
      if (has(d.ts_entladen_ende_eff)) return { key: "entladen_fertig", label: "Entladen", step: 2, col: "#3d9ad6" };
      if (has(d.ts_entladen_start)) return { key: "entladen", label: "Entladung gestartet · letzter Datenstand", step: 2, col: "#3d9ad6" };
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
      if (d.outlier?.putaway) warns.push(`<span class="dwarn w-warn">⚠ Ausreißer Einlagerung</span>`);
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
          <button class="back" id="back">← Zurück: ${esc(MODES.find(m=>m.id===this._mode)?.label||'Periodenüberblick')}</button>
          <span class="ux-meta">Detailanalyse → ${esc(MODES.find(m=>m.id===this._mode)?.label||'')} → TE ${esc(d.belegnr)}</span>
        </div>
        <div class="detail-head s-${status.key}">
          <div class="dh-top">
            <div>
              <div class="dh-te">TE ${esc(d.belegnr)}</div>
              <div class="dh-sub">${esc(d._dimValues.lieferant.join(", ") || "–")}${d.te_extern ? " · " + esc(d.te_extern) : ""}</div>
            </div>
            <span class="dh-status" style="background:${status.col}22;color:${status.col};border-color:${status.col}66">${status.label}</span>
          </div>
          ${this._milestoneChain(status)}
          ${warns.length ? `<div class="detail-warnbar">${warns.join("")}</div>` : ""}
          <div class="dh-facts">
            ${fact("Ladestelle", `<span class="tag" style="background:${SEGC[d.segment]||C.sonst}">${esc(d.segment)}</span>`)}
            ${fact("Ankunft", fmtTs(d.ts_ankunft))}
            ${fact("Standzeit", d.phases.dwell != null ? fmtH(d.phases.dwell) : "–")}
            ${fact("Ankunft gegenüber Planstart", d.phases.delay == null ? "Nicht bewertbar" : (d.phases.delay<=0?'Früher / zum Planstart: ':'Später als Planstart: +') + fmtH(Math.abs(d.phases.delay)))}
            ${fact("Anlieferungen", d.nAnlieferungen)}
            ${fact("Positionen", d.nPos)}
            ${fact("Fertigstellung", `${d.nFertig}/${d.nPos} geladene Pos.`)}
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
          <div class="card" style="flex:2 1 420px"><h3>Anlieferungen dieser TE</h3><div id="atbl"></div></div>
        </div>
        <div class="card"><h3>Positionen dieser TE · Zeiten zur Diagnose</h3><div id="ptbl"></div></div>
        <div class="card"><h3>Weitere Belegdaten</h3><div id="bdat"></div></div>`;
      main.appendChild(wrap);
      wrap.querySelector("#back").addEventListener("click", () => { this._detail = null; this._render(); const main=this._shadow.getElementById('main');if(main)main.scrollTop=this._returnScroll||0; });
      this._belegdaten(wrap.querySelector("#bdat"), d, pos);
      this._svgTimeline(wrap.querySelector("#tl"), d, pos);
      this._svgPhaseCompare(wrap.querySelector("#cmp"), d, M.phaseMed);
      this._tblAnlieferungen(wrap.querySelector("#atbl"), M.anlieferungen.filter(a => a.belegnr === d.belegnr));
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
        ["ts_entladen_ende_eff", "ts_we_buchung_last", "Vereinnahmung", "#f39c12"],
        ["ts_we_buchung_last", "ts_einlagerung_last", "Einlagerung · Näherung", C.accent],
      ];
      const dd = d;

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
      const keys = ["wait_gate", "reaction", "unload", "booking", "putaway", "operative", "dwell"];
      const rows = keys.map((k) => ({
        k, label: PHASES[k].label,
        val: d.phases[k], med: (phaseMed[k] || {})[d.segment],
        out: d.outlier && d.outlier[k],
      })).filter((r) => r.val != null || r.med != null);
      if (!rows.length) { el.innerHTML = `<div class="empty">Keine Phasendaten.</div>`; return; }
      const maxV = Math.max(...rows.flatMap((r) => [r.val || 0, r.med || 0]), 0.1);
      const W = 400, rh = 48;
      let svg = `<svg viewBox="0 0 ${W} ${rows.length * rh + 4}" width="100%">`;
      rows.forEach((r, i) => {
        const y = i * rh;
        const bw = (v) => Math.max(2, (v / maxV) * (W - 228));
        svg += `<text x="0" y="${y + 12}" font-size="10" fill="${C.ink}">${r.label}</text>`;
        if (r.val != null)
          svg += `<rect x="170" y="${y + 3}" width="${bw(r.val)}" height="9" rx="2" fill="${r.out ? C.outlier : (SEGC[d.segment] || C.sonst)}"><title>Diese TE: ${fmtH(r.val)}</title></rect>
                  <text x="${174 + bw(r.val)}" y="${y + 11}" font-size="9" fill="${r.out ? C.outlier : C.ink}">${fmtH(r.val)}${r.out ? " ⚠" : ""}</text>`;
        else svg += `<text x="170" y="${y + 11}" font-size="9" fill="${C.muted}">–</text>`;
        if (r.med != null)
          svg += `<rect x="170" y="${y + 15}" width="${bw(r.med)}" height="5" rx="2" fill="${C.muted}" opacity=".55"><title>Median ${d.segment}: ${fmtH(r.med)}</title></rect>
                  <text x="${174 + bw(r.med)}" y="${y + 21}" font-size="8.5" fill="${C.muted}">Median ${fmtH(r.med)}</text>`;
      });
      el.innerHTML = svg + "</svg>";
    }

    _tblAnlieferungen(el, deliveries) {
      const flag = (value, yes) => value === yes ? "Erfüllt" : value === "N" ? "Nicht erfüllt" : "Unbewertet";
      el.innerHTML = `<div style="overflow:auto"><table><thead><tr><th>Anlieferung</th><th>Positionen</th><th>OTIF</th><th>Vollständigkeit</th><th>Mengentreue</th></tr></thead><tbody>${deliveries.map(a => `<tr>
        <td>${esc(a.anlieferung)}</td><td>${a.nPos}</td><td>${flag(a.sap_otif, "O")}</td>
        <td>${flag(a.sap_vollstaendig, "V")}</td><td>${a.qtyOk == null ? "Unbewertet" : a.qtyOk ? "Erfüllt" : "Abweichung"}<br><small>${a.qtyN}/${a.nPos} Pos. bewertbar</small></td></tr>`).join("")}</tbody></table></div>
        <div class="drill-note">Eine Anlieferung ist mengentreu, wenn alle geladenen Positionen einzeln IST = SOLL erfüllen. Über- und Unterlieferungen werden nicht verrechnet.</div>`;
    }

    _tblProducts(el, pos, phaseMed) {
      if (!pos.length) { el.innerHTML = `<div class="empty">Keine Positionen.</div>`; return; }
      const rows = pos.map(p => {
        const finish = p.ts_fertigstellung || p.ts_einlagerung;
        const flag = p.sap_otif_position === "O" ? "Erfüllt" : p.sap_otif_position === "N" ? "Nicht erfüllt" : "Unbewertet";
        return `<tr><td>${esc(p.anlieferung || "–")}</td><td>${esc(p.pos || "–")}</td>
          <td>${esc(p.produkt || p.produkt_name || "–")}</td><td>${p.menge_soll ?? "–"}</td><td>${p.menge_ist ?? "–"}</td>
          <td>${p.qtyOk == null ? "Unbewertet" : p.qtyOk ? "Erfüllt" : "Abweichung"}</td><td>${flag}</td>
          <td>${finish ? finish.toLocaleString("de-DE", {dateStyle:"short",timeStyle:"short"}) : "–"}</td>
          <td>${fmtH(p.phases?.putaway)}</td></tr>`;
      }).join("");
      el.innerHTML = `<div style="overflow:auto"><table><thead><tr><th>Anlieferung</th><th>Position</th><th>Produkt</th><th>SOLL</th><th>IST</th><th>Mengentreue</th><th>OTIF Position</th><th>Fertigstellung</th><th>WE → Fertigstellung · Diagnose</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
      const tp = pts.filter((p) => p.ts_geplant_start);
      if (tp.length) {
        const xs = tp.map((p) => +p.ts_geplant_start), x0 = Math.min(...xs);
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
          svg += `<circle data-drill="${esc(p.belegnr)}" cx="${X(+p.ts_geplant_start)}" cy="${Y(p.qty_dev_pct)}" r="${bad ? 3 : 1.8}"
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
          <div class="card"><h3>Datenfehler (Hierarchie, negative Phasendauern u. ä.)</h3><div id="errs"></div></div>
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

  WEUX.install(WECockpit, 'process');
  customElements.define("we-cockpit", WECockpit);
})();
