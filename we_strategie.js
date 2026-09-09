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
 * WE Strategie-Cockpit – SAC Custom Widget (v0.23.0-planstart) · Entwickler: Benne
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
    { key: "dwell_avg",     label: "Ø Standzeit",      unit: "h",  band: ["dwell_min","dwell_max"],     lowerBetter: true,  targetProp: "targetDwell", weightKey: "dwell_n" },
    { key: "booking_avg",   label: "Ø Vereinnahmung", unit: "h", lowerBetter: true, weightKey: "booking_n" },
    { key: "putaway_avg",   label: "Ø Einlagerung · Näherung", unit: "h",  band: ["putaway_min","putaway_max"], lowerBetter: true,  targetProp: "targetPutaway", weightKey: "putaway_n" },
    { key: "operative_avg", label: "Ø Operativer WE · Näherung", unit: "h", lowerBetter: true, weightKey:"operative_n" },
    { key: "otif_quote",    label: "OTIF · Anlieferung", unit: "%",  pct: true, lowerBetter: false, targetProp: "targetOtif", weightKey: "otif_n" },
    { key: "otif_pos_quote",label: "OTIF · Position", unit:"%", pct:true, lowerBetter:false, weightKey:"otif_pos_n" },
    { key: "voll_quote",    label: "Liefervollständigkeit", unit:"%", pct:true, lowerBetter:false, weightKey:"voll_n" },
    { key: "qty_pos_quote", label: "Mengentreue · Position", unit:"%", pct:true, lowerBetter:false, weightKey:"qty_pos_n" },
    { key: "qty_anl_quote", label: "Mengentreue · Anlieferung", unit:"%", pct:true, lowerBetter:false, weightKey:"qty_anl_n" },
    { key: "puenkt_quote",  label: "BW-Pünktlichkeit · P/N", unit: "%", pct: true, lowerBetter: false, targetProp: "targetPuenkt", weightKey: "puenkt_n" },
    { key: "wait_gate_avg", label: "Ø Wartezeit bis Andocken", unit: "h", band: ["wait_gate_min","wait_gate_max"], lowerBetter: true, targetProp: "targetWaitGate", weightKey: "wait_gate_n" },
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
    booking_avg: {level:"TE", meaning:"Kernzeit der Vereinnahmung je TE.", formula:"WE gebucht (Abschluss der TE) − tatsächliches Ende Entladen [BWMISTTEE]", aggregation:"Mittelwert gültiger TE-Zeiten; jede TE einmal."},
    putaway_avg: { level:"TE", meaning:"Zeit bis zur letzten Fertigstellung aller Positionen der TE. Näherung, solange HU-Daten fehlen.", formula:"MAX(Fertigstellung aller TE-Positionen) − WE gebucht (TE)", aggregation:"Mittelwert gültiger TE-Zeiten; jede TE einmal." },
    operative_avg: {level:"TE", meaning:"Operativer Wareneingang bis zur letzten Fertigstellung der TE (Näherung).", formula:"MAX(Fertigstellung aller TE-Positionen) − Entladen gestartet", aggregation:"Mittelwert je TE; Zuordnung zu Geplanter Start ab."},
    otif_quote: { level:"Anlieferung", meaning:"OTIF je Anlieferung aus BW [BWMOTIFA].", formula:"O / (O + N)", aggregation:"Jede Anlieferung einmal, gewichtet mit bewerteten Anlieferungen." },
    otif_pos_quote: {level:"Position", meaning:"OTIF pro Position aus BW [BWMOTIF].", formula:"O / (O + N)", aggregation:"Distinct Belegnummer + Positionsnummer; eigener Bewertungsnenner."},
    voll_quote: {level:"Anlieferung", meaning:"Liefervollständigkeit aus BW [BWMLIEFV].", formula:"V / (V + N)", aggregation:"Jede Anlieferung einmal; nur bewertete Anlieferungen."},
    qty_pos_quote: {level:"Position", meaning:"Anteil mengentreuer Positionen.", formula:"Positionen mit IST = SOLL / vollständig bewertete Positionen", aggregation:"Distinct Belegnummer + Positionsnummer."},
    qty_anl_quote: {level:"Anlieferung", meaning:"Anteil Anlieferungen, deren Positionen alle mengentreu sind.", formula:"Anlieferungen mit allen Positionen IST = SOLL / vollständig bewertete Anlieferungen", aggregation:"Keine Nettierung von Über- und Unterlieferungen."},
    puenkt_quote: { level:"BW / TE", meaning:"Anteil der TEs mit BW-Kennzeichen P (pünktlich).", formula:"P / (P + N) × 100", aggregation:"Über alle bewerteten TEs der Periode/Ladestelle." },
    wait_gate_avg: { level:"TE", meaning:"Zeit vom Eintreffen der TE am Kontrollpunkt bis zum Andocken am Tor.", formula:"Andocken − Ankunft am Kontrollpunkt", aggregation:"Mittelwert über alle TEs." },
    sum_gewicht_t: { level:"Position", meaning:"Summe des angelieferten Gewichts.", formula:"Σ Gewicht je Position", aggregation:"Summe über den Zeitraum/Ladestelle." },
    sum_wert_keur: { level:"Position", meaning:"Summe des Warenwerts der Anlieferungen.", formula:"Σ Wert je Position", aggregation:"Summe über den Zeitraum/Ladestelle." },
    anzahl_pos: { level:"Position", meaning:"Anzahl der angelieferten Positionen.", formula:"COUNT DISTINCT (Belegnummer + Positionsnummer)", aggregation:"BW muss jeden Schlüssel eindeutig einer Periode und Ladestelle zuordnen." },
    anzahl_anl: { level:"Anlieferung", meaning:"Anzahl der Anlieferungen (Lieferdokumente). Eine TE kann mehrere Anlieferungen enthalten.", formula:"Anzahl distinkter Anlieferungen", aggregation:"Summe über den Zeitraum/Ladestelle." },
    anzahl_te: { level:"TE", meaning:"Anzahl der Transporteinheiten (Hof-Ebene). TE ≠ Anlieferung: eine TE kann mehrere Anlieferungen enthalten.", formula:"Anzahl distinkter TEs", aggregation:"Summe über den Zeitraum/Ladestelle." },
  };

  // Begriffsverzeichnis: Basis-Fachbegriffe + automatisch aus METRIC_INFO
  // abgeleitete Kennzahl-Einträge. Eine Quelle für Infobuttons UND Glossar,
  // damit sich beide nie widersprechen können.
  const GLOSSARY_BASE = [
    { term:"TE (Transporteinheit)", level:"TE", definition:"Eine Transporteinheit kann in SAP EWM mehrere Anlieferungen enthalten. Hof-, Tor-, Andock-, Entlade- und Abfahrtsvorgänge werden TE-bezogen interpretiert." },
    { term:"Anlieferung", level:"Anlieferung", definition:"Ein der TE zugeordnetes Lieferdokument. Eine TE kann mehrere Anlieferungen enthalten; eine Anlieferung kann wiederum mehrere Positionen enthalten." },
    { term:"Position", level:"Position", definition:"Eindeutig durch Belegnummer + Positionsnummer. Rechenebene für Mengen, PA1 und OTIF pro Position; Fertigstellungen bestimmen gemeinsam den Abschluss der TE." },
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
    "Nicht zugeordnet": "#7f8c8d", Sonstige: "#5d6d7e", Gesamt: "var(--accent)",
  };
  const SEGMENT_ORDER = ["BSL", "Container", "Landverkehr", "Nicht zugeordnet", "Sonstige"];

  // Phasenmittelwerte je TE für die Engpass-Analyse (keine Standzeit-Summe).
  const PHASE_KEYS = ["wait_gate", "reaction", "unload", "booking", "putaway"];
  const PHASE_LABEL = {
    wait_gate: "Wartezeit bis Andocken", reaction: "Reaktionszeit", unload: "Entladedauer",
    booking: "Vereinnahmung", putaway: "Einlagerung (Näherung)",
  };
  // Jede Hauptphase wird über ihre tatsächlich gültigen TE-Zeiten gewichtet.
  const PHASE_WEIGHT_KEY = {
    wait_gate: "wait_gate_n", reaction: "reaction_n", unload: "unload_n",
    booking: "booking_n", putaway: "putaway_n", dwell: "dwell_n", operative:"operative_n",
  };
  const PROCESS_TIME_ITEMS = [
    { key:"plan_start_end_avg", from:"Geplanter Start", to:"Geplantes Ende", group:"Planfenster", level:"TE", weightKey:"plan_start_end_n" },
    { key:"actual_start_end_avg", from:"Ist-Start", to:"Ist-Ende", group:"Ist-Fenster", level:"TE", weightKey:"actual_start_end_n" },
    { key:"arrival_dock_avg", from:"Ankunft", to:"Am Tor angedockt", group:"Hofprozess", level:"TE", weightKey:"arrival_dock_n" },
    { key:"dock_unload_start_avg", from:"Angedockt", to:"Entladen gestartet", group:"Hofprozess", level:"TE", weightKey:"dock_unload_start_n" },
    { key:"unload_start_end_avg", from:"Entladen gestartet", to:"Entladen beendet", group:"Zusatzzeit", level:"TE", weightKey:"unload_start_end_n" },
    { key:"unload_end_actual_end_avg", from:"Entladen beendet", to:"Tatsächliches Ende", group:"Zusatzzeit", level:"TE", weightKey:"unload_end_actual_end_n" },
    { key:"we_booked_completion_avg", from:"WE gebucht (TE)", to:"Letzte Fertigstellung", group:"Näherung", level:"TE", weightKey:"we_booked_completion_n" },
    { key:"arrival_completion_avg", from:"Ankunft", to:"Letzte Fertigstellung", group:"Gesamtdurchlauf", level:"TE", weightKey:"arrival_completion_n" },
    { key:"dock_completion_avg", from:"Angedockt", to:"Letzte Fertigstellung", group:"Gesamtdurchlauf", level:"TE", weightKey:"dock_completion_n" },
  ];
  const PHASE_COLOR = {
    wait_gate: "#5d6d7e", reaction: "#2980b9", unload: "#27ae60",
    booking: "#f39c12", putaway: "#c0392b",
  };
  // Farben für die Jahreslinien im Jahresvergleich (jüngstes Jahr = kräftigstes Rot)
  const YEAR_COLORS = ["#8b90a0", "#5dade2", "#e67e22", "#c0392b"];

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
    // Leere Ladestelle / BW-Nullmember ist eine eigene, sichtbare Kategorie.
    // Keine Ableitung über das Transportmittel: fehlende Zuordnung soll als
    // Datenqualitätsmerkmal erhalten bleiben statt in LKW/Container zu fallen.
    if (s == null) return "Nicht zugeordnet";
    const raw = String(s).trim();
    if (!raw || ["#", "@NULLMEMBER", "@TOTALMEMBERS", "NULL", "UNDEFINED", "00000000", "000000000000"].includes(raw.toUpperCase()))
      return "Nicht zugeordnet";
    if (LADESTELLE_KURZ_STRAT[raw]) return LADESTELLE_KURZ_STRAT[raw];
    const u = raw.toUpperCase();
    if (u.includes("CONTAINE")) return "Container";   // trifft auch "CONTAINER" voll
    if (u.includes("LANDVERK") || u.includes("FREI HAUS") || u.includes("DDP")) return "Landverkehr";
    if (u.includes("BSL")) return "BSL";
    if (u.includes("NICHT ZUGEORDNET")) return "Nicht zugeordnet";
    if (u.includes("EIGENDISPOSITION")) return "Sonstige";
    if (raw === "Gesamt") return "Sonstige"; // Schutz vor Kollision mit der Summenzeile
    if (["Container", "BSL", "Landverkehr", "Nicht zugeordnet", "Sonstige"].includes(raw)) return raw;
    return raw;
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
      letter-spacing:.06em; margin:10px 2px 8px;}
    /* Prozesszeit-Kacheln verwenden bewusst dieselben .grid/.tile-, Wert- und
       Sparkline-Klassen wie die Hauptkennzahlen. So bleiben Theme, Hover,
       Responsive-Verhalten und Kompaktmodus dauerhaft identisch. */
    .process-tile{ cursor:default; }
    .process-tile .m-lbl{ min-height:24px; line-height:1.35; }
    .process-tile .m-sub .yoy{ color:var(--ink2); }
    .collapsible-section{ display:block; }
    .collapsible-section .card{ margin-top:6px; padding:10px 12px; background:var(--card);
      border:1px solid var(--border); border-radius:var(--r-md); }
    .collapsible-section #processTimesCard{ padding:0; background:transparent; border:0; }
    .collapsible-section .card[hidden]{ display:none !important; }
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
    /* Wichtig für SAC/Shadow-DOM: eigene display-Regeln dürfen das native
       hidden-Attribut nicht übersteuern. Standardzustand ist geschlossen. */
    .glossary-panel[hidden], .glossary-backdrop[hidden]{ display:none !important; }
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
    .tile .m-sub{ display:flex; flex-wrap:wrap; gap:6px; row-gap:4px; margin:1px 0 0; min-height:15px; }
    .tile .sla, .tile .yoy, .tile .te-base{ font-family:var(--font-mono); font-size:9px; font-weight:600;
      padding:1px 6px; border-radius:10px; letter-spacing:.02em; }
    .tile .sla.ok{ color:var(--good); background:color-mix(in srgb, var(--good) 14%, transparent); }
    .tile .sla.miss{ color:var(--bad); background:color-mix(in srgb, var(--bad) 14%, transparent); }
    .tile .yoy.up{ color:var(--good); } .tile .yoy.down{ color:var(--bad); }
    .tile .yoy{ background:var(--card2); }
    .tile .te-base{ color:var(--blue); background:var(--blue-dim); white-space:nowrap; }
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
    .alert-view{ padding:12px; }
    .alert-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      padding:12px 14px; margin-bottom:10px; border:1px solid var(--accent-border);
      border-left:4px solid var(--warn); border-radius:var(--r-md); background:var(--card); }
    .alert-head.n{ border-left-color:var(--blue); }
    .alert-head b{ display:block; font-size:14px; color:var(--ink); }
    .alert-head span{ display:block; margin-top:4px; font-size:11px; color:var(--muted); }
    .alert-count{ flex:0 0 auto; font-family:var(--font-mono); font-size:20px; font-weight:700; color:var(--warn); }
    .alert-head.n .alert-count{ color:var(--blue); }
    .alert-table-wrap{ overflow:auto; max-height:560px; border:1px solid var(--border); border-radius:var(--r-md); }
    .alert-table{ width:100%; border-collapse:collapse; background:var(--card); font-size:11px; }
    .alert-table th{ position:sticky; top:0; z-index:1; padding:8px 9px; text-align:left;
      background:var(--card2); color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.08em; }
    .alert-table td{ padding:8px 9px; border-top:1px solid var(--border); color:var(--ink2); }
    .alert-table td.mono{ font-family:var(--font-mono); color:var(--ink); }
    .alert-code{ display:inline-block; min-width:22px; padding:2px 6px; border-radius:10px;
      text-align:center; font-weight:700; color:#111; background:var(--warn); }
    .alert-code.n{ color:#fff; background:var(--blue); }
    .alert-note{ padding:14px; color:var(--muted); font-size:11px; text-align:center; }
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
          <div class="title">WE · Strategieübersicht <small id="sub"></small></div>
          <div class="ctrl">
            <button id="btnExport" title="Befunde in die Zwischenablage kopieren">⧉ Befunde kopieren</button>
            <button id="btnTargets" title="Vorläufige Zielwerte konfigurieren" aria-expanded="false">◎ Vorläufige Ziele</button>
            <button id="btnGlossary" title="Begriffe &amp; Berechnungen" aria-expanded="false" aria-controls="glossaryPanel">? Begriffe</button>
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
        <label>Ø Wartezeit bis Andocken (h) <input type="number" step="0.5" id="tgtWaitGate"></label>
        <div class="target-note"><b>Übergangslösung:</b> Diese Werte sind manuell konfiguriert. Die beschlossene fachliche Baseline verwendet je Standort 14 vollständige historische Monate; die letzten 6 Wochen vor dem Vergleichszeitraum bleiben unberücksichtigt. Dafür muss BW einen separaten Baseline-Datenbestand liefern.</div>
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
        <span class="tb-lbl">Ladestelle</span>
        <div class="segmented" id="segpick"></div>
        <span class="spacer"></span>
        <span class="tb-lbl">Geplanter Start ab · Zeitraster</span>
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
    if (m.pct) return (v * 100).toLocaleString('de-DE', {minimumFractionDigits:1, maximumFractionDigits:1});
    if (m.unit === "t" || m.unit === "k€") return v >= 1000 ? (v/1000).toFixed(1)+"k" : Math.round(v).toString();
    if (m.unit === "") return Math.round(v).toLocaleString("de-DE");
    return v.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
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
      // Begriffsfenster muss beim Start immer geschlossen sein.
      const glossaryPanel = this._sh.getElementById("glossaryPanel");
      const glossaryBackdrop = this._sh.getElementById("glossaryBackdrop");
      if (glossaryPanel) glossaryPanel.hidden = true;
      if (glossaryBackdrop) glossaryBackdrop.hidden = true;
      const glossaryBtn = this._sh.getElementById("btnGlossary");
      if (glossaryBtn) glossaryBtn.setAttribute("aria-expanded", "false");
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
      const fmtNum = (s) => {
        if (s == null || s === "") return null;
        let c = String(s).trim().replace(/ /g, " ").replace(/\s+/g, "");
        // Einheit/Prozent entfernen, Vorzeichen und Exponent erhalten.
        c = c.replace(/[^0-9,\.eE+\-]/g, "");
        if (!c) return null;
        const lastComma = c.lastIndexOf(","), lastDot = c.lastIndexOf(".");
        if (lastComma >= 0 && lastDot >= 0) {
          // Der zuletzt auftretende Separator ist i.d.R. der Dezimaltrenner.
          if (lastComma > lastDot) c = c.replace(/\./g, "").replace(",", ".");
          else c = c.replace(/,/g, "");
        } else if (lastComma >= 0) {
          // 1,234,567 => Tausender; 123,45 => Dezimal.
          c = /^[-+]?\d{1,3}(,\d{3})+$/.test(c) ? c.replace(/,/g, "") : c.replace(",", ".");
        } else if (lastDot >= 0) {
          // 1.234.567 => Tausender; 123.45 => Dezimal.
          if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(c)) c = c.replace(/\./g, "");
        }
        const n = Number(c);
        return Number.isFinite(n) ? n : null;
      };
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
                       booking:"value_dur_booking", putaway:"value_dur_putaway", dwell:"value_dur_dwell", operative:"value_dur_operative" };

      return data.map((row) => {
        const r = {
          periode: readDim(row, "dimension_periode"),
          segment: normSegment(readDim(row, "dimension_segment")),
          anzahl_anl: readVal(row, "value_anzahl_anl"),
          anzahl_pos: readVal(row, "value_anzahl_pos"),
        };
        // Anzahl TEs ist fachlich eine ANDERE Größe als Anzahl Anlieferungen
        // (eine TE kann mehrere Anlieferungen enthalten). Es gibt deshalb
        // bewusst keinen Fallback TE = Anlieferung.
        r.anzahl_te = readVal(row, "value_anzahl_te");
        // Der Nenner muss exakt zur im BW je TE gebildeten Dauersumme passen.
        // Gesamte TE-/Positionsanzahlen sind bei fehlenden Zeiten ungeeignet.
        for (const [ph, feed] of Object.entries(PHASES)) {
          const sumH = readDur(row, feed);
          const cnt = readVal(row, `value_${ph}_n`);
          r[`${ph}_avg`] = (sumH != null && sumH >= 0 && cnt > 0) ? sumH / cnt : null;
          r[`${ph}_n`] = cnt;
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
        // Quoten (optional). SAC/BW kann 0..1 oder 0..100 liefern; intern immer 0..1.
        const normQuote = (v) => {
          if (v == null || !Number.isFinite(Number(v))) return null;
          v = Number(v);
          if (Math.abs(v) > 1 && Math.abs(v) <= 100) v /= 100;
          return v >= 0 && v <= 1 ? v : null;
        };
        for (const q of ["otif", "otif_pos", "puenkt", "voll", "qty_pos", "qty_anl"]) {
          r[q + "_n"] = readVal(row, `value_${q}_n`);
          r[q + "_quote"] = r[q + "_n"] > 0 ? normQuote(readVal(row, `value_${q}_quote`)) : null;
        }

        // Jede Dauersumme benötigt den eigenen gültigen TE-Nenner.
        // Nur fachlich identische Zeitspannen dürfen denselben Feed nutzen.
        for (const item of PROCESS_TIME_ITEMS) {
          const stem = item.key.replace(/_avg$/, "");
          const count = readVal(row, `value_${stem}_n`);
          const sumH = readDur(row, `value_dur_${stem}`);
          r[item.weightKey] = count;
          r[item.key] = sumH != null && sumH >= 0 && count > 0 ? sumH / count : null;
        }
        // Nur tatsächlich identische Phasen dürfen sich ersetzen.
        for (const [stem, phase] of [["arrival_dock","wait_gate"], ["dock_unload_start","reaction"], ["we_booked_completion","putaway"]]) {
          if (r[stem + "_avg"] == null && r[phase + "_avg"] != null) {
            r[stem + "_avg"] = r[phase + "_avg"];
            r[stem + "_n"] = r[phase + "_n"];
          }
        }
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
      this._preparedRows=null;
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
        const panel = $("glossaryPanel"), backdrop = $("glossaryBackdrop"), btn = $("btnGlossary");
        panel.hidden = false; backdrop.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        $("glossarySearch").value = ""; renderGlossary("");
        requestAnimationFrame(() => $("glossarySearch").focus());
      };
      const closeGlossary = () => {
        const panel = $("glossaryPanel"), backdrop = $("glossaryBackdrop"), btn = $("btnGlossary");
        panel.hidden = true; backdrop.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      };
      $("btnGlossary").addEventListener("click", openGlossary);
      $("glossaryClose").addEventListener("click", closeGlossary);
      $("glossaryBackdrop").addEventListener("click", closeGlossary);
      $("glossarySearch").addEventListener("input", (e) => renderGlossary(e.target.value));
      this._sh.addEventListener("keydown", (e) => { if (e.key === "Escape") closeGlossary(); });
    }

    // ── Datenaufbereitung: Perioden × Segment -> Serien ───────────────────
    // Input: local calendar day derived in BW from [0WM_SPFRG].
    _planPeriod(value) {
      const raw=String(value || "").trim();
      let m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
      if (!m) { const de=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw); if(de) m=[de[0],de[3],de[2],de[1]]; }
      if (!m) return null;
      const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
      if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3]) return null;
      if(this._props.aggregation==='month') return m[1]+'-'+m[2];
      d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
      const year=d.getUTCFullYear();
      const week=Math.ceil((((d-new Date(Date.UTC(year,0,1)))/86400000)+1)/7);
      return year+'-W'+String(week).padStart(2,'0');
    }

    // N-gewichteter Mittelwert, aber nur über tatsächlich vorhandene Werte.
    // Fehlende Kennzahlen dürfen den Nenner NICHT künstlich vergrößern.
    _weightedAvg(rows, valueKey, weightKey) {
      let num = 0, den = 0;
      for (const r of rows) {
        const v = r && r[valueKey];
        if (v == null || !Number.isFinite(Number(v))) continue;
        const w = Number(r[weightKey]);
        if (!Number.isFinite(w) || w <= 0) return null;
        num += Number(v) * w; den += w;
      }
      return den > 0 ? num / den : null;
    }

    _aggregateRows(rows, periode, segment) {
      const out = {periode, segment};
      const sumKnown = key => rows.every(r => r[key] != null && Number.isFinite(Number(r[key])))
        ? rows.reduce((sum,r) => sum + Number(r[key]), 0) : null;
      for (const key of ["anzahl_te","anzahl_anl","anzahl_pos","sum_menge","sum_volumen", ...METRICS.filter(m => m.sum).map(m => m.key)])
        out[key] = sumKnown(key);
      const items = [...METRICS.filter(m => !m.sum), ...Object.keys(PHASE_WEIGHT_KEY).map(ph => ({key:ph + "_avg", weightKey:ph + "_n"})), ...PROCESS_TIME_ITEMS];
      for (const item of items) {
        out[item.key] = this._weightedAvg(rows, item.key, item.weightKey);
        const valid = rows.filter(r => r[item.key] != null && Number.isFinite(Number(r[item.key])) && Number(r[item.weightKey]) > 0);
        out[item.weightKey] = out[item.key] == null ? null : valid.reduce((sum,r) => sum + Number(r[item.weightKey]), 0);
        if (item.band) {
          for (const [i,key] of item.band.entries()) {
            const values = valid.map(r => r[key]).filter(v => v != null && Number.isFinite(Number(v)));
            out[key] = values.length ? (i === 0 ? Math.min(...values) : Math.max(...values)) : null;
          }
        }
      }
      return out;
    }

    _prepare() {
      this._invalidPlanDays = (this._rows || []).filter(r => !this._planPeriod(r.periode)).length;
      let rows = (this._rows || []).map(r => ({...r,
        periode:this._planPeriod(r.periode), segment:normSegment(r.segment)})).filter(r => r.periode);
      const groups = new Map();
      for (const r of rows) {
        const key = r.periode + "|" + r.segment;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      rows = [...groups.values()].map(g => this._aggregateRows(g, g[0].periode, g[0].segment));

      const perioden = [...new Set(rows.map(r => r.periode))].sort();
      const segmente = [...new Set(rows.map(r => r.segment).filter(Boolean))].sort((a, b) => {
        const ai = SEGMENT_ORDER.indexOf(a), bi = SEGMENT_ORDER.indexOf(b);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        return String(a).localeCompare(String(b), "de");
      });
      if (this._seg !== "Gesamt" && !segmente.includes(this._seg)) this._seg = "Gesamt";
      // Lookup: (periode, Ladestelle) -> row
      const idx = {};
      for (const r of rows) idx[r.periode + "|" + r.segment] = r;

      // "Gesamt" = fachlich gewichtete Kombination über Ladestellen.
      const gesamt = {};
      for (const per of perioden) {
        const segRows = segmente.map(x => idx[per + "|" + x]).filter(Boolean);
        if (!segRows.length) continue;
        const g = this._aggregateRows(segRows, per, "Gesamt");
        gesamt[per] = g;
      }
      idx.__gesamt = gesamt;

      this._perioden = perioden;
      this._segmente = ["Gesamt", ...segmente];
      this._idx = idx;
      this._segList = segmente; // ohne "Gesamt", für Overlay
      this._preparedRows=this._rows;this._preparedAggregation=this._props.aggregation;
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
          lo: m && m.band ? r[m.band[0]] : null,
          hi: m && m.band ? r[m.band[1]] : null,
        });
      }
      return pts;
    }

    _render() {
      this._stopPlay();
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
          Prüfe die Zuweisung des Feeds <b>dimension_periode</b> (Planstart-Kalendertag) im Builder.</div>`;
        dash.innerHTML = ""; this._stopLoaderSteps(); return;
      }
      state.hidden = true;
      this._stopLoaderSteps();
      if(this._preparedRows!==this._rows || this._preparedAggregation!==this._props.aggregation) {
        this._scrubIdx=null;
        this._prepare();
      }

      if (!this._perioden.length) {
        state.hidden = false;
        state.innerHTML = `<div class="state-icon">⌕</div><div class="state-txt">Keine gültigen Planstart-Tagesdaten vorhanden.</div>`;
        dash.innerHTML = "";
        return;
      }

      // Untertitel
      const von = this._perioden[0], bis = this._perioden[this._perioden.length - 1];
      S.getElementById("sub").textContent = `${this._perioden.length} Perioden · ${von} – ${bis} · Geplanter Start ab${this._invalidPlanDays ? ` · ${this._invalidPlanDays} Zeilen ohne gültigen Planstart ausgeschlossen` : ""}`;

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
              <button data-dv="vergleich" class="${this._detailView==="vergleich"?"on":""}">Ladestellen</button>
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
      if (!el || !this._perioden || !this._perioden.length || !this._idx) return;
      const idx = (this._scrubIdx != null && this._scrubIdx >= 0 && this._scrubIdx < this._perioden.length)
        ? this._scrubIdx : this._perioden.length - 1;
      const per = this._perioden[idx];
      const r = (this._seg === "Gesamt" ? this._idx.__gesamt[per] : this._idx[per + "|" + this._seg]) || {};
      el.innerHTML = `<div class="pt-hint">Ausgewählte Periode (${esc(per)}) · ${esc(this._seg === "Gesamt" ? "Alle Ladestellen" : this._seg)}</div>
        <div class="grid pt-grid">${PROCESS_TIME_ITEMS.map(({key,from,to,group,level,weightKey}, i) => {
          const v = r[key];
          const pts = this._serie(key);
          const valid = pts.slice(0, idx + 1).filter(p => p && p.v != null);
          const base = valid.length > 1
            ? valid.slice(0, -1).reduce((sum, p) => sum + Number(p.v), 0) / (valid.length - 1)
            : v;
          const rel = v != null && base ? (Number(v) - base) / Math.abs(base) : 0;
          const metric = { key, label:`${from} → ${to}`, unit:"h", lowerBetter:true };
          const hasData = pts.some(p => p && p.v != null);
          return `<div class="tile process-tile${v == null ? " tile-nodata" : ""}" data-key="${esc(key)}">
            <div class="m-lbl">${esc(metric.label)}</div>
            <div class="m-val"><b>${v != null ? "0" : "–"}</b><span class="u">h</span>
              ${v != null && valid.length > 1 ? `<span class="m-delta ${rel <= 0 ? "up" : "down"}">${rel >= 0 ? "▲" : "▼"} ${Math.abs(rel * 100).toFixed(0)}%</span>` : ""}
            </div>
            <div class="m-sub">${this._teBaseHtml(r, {key,weightKey,level})}<span class="yoy">${esc(group)}</span><span class="yoy">Ebene ${esc(level)}</span></div>
            ${hasData ? this._sparkSvg(pts, metric, i + METRICS.length) : `<div class="nodata-hint">Keine Daten</div>`}
          </div>`;
        }).join("")}</div>`;

      PROCESS_TIME_ITEMS.forEach(({key,from,to}, i) => {
        const tile = el.querySelector(`.process-tile[data-key="${key}"]`);
        if (!tile) return;
        const value = r[key];
        const metric = { key, label:`${from} → ${to}`, unit:"h", lowerBetter:true };
        const pts = this._serie(key);
        this._countUp(tile.querySelector(".m-val b"), value, metric);
        const svg = tile.querySelector("svg.spark");
        if (svg) {
          this._animateDraw(svg.querySelector("path.line"), svg.querySelector("circle.head"), i * 35);
          this._wireSparkHover(tile, pts, metric);
        }
      });
    }

    /* Zielwert einer Kennzahl auflösen: aus der konfigurierbaren Property
       (Cockpit-/Fachbereichsvorgabe), nicht fest im Code verdrahtet. */
    _targetOf(m) {
      if (!m || !m.targetProp) return null;
      const v = this._props[m.targetProp];
      return (v == null || v === "") ? null : Number(v);
    }

    /* Einheitliche Datenbasis-Angabe für alle Kacheln. Die Zahl folgt immer
       der gerade dargestellten Periode und Ladestelle. Auch Kennzahlen auf
       Positionsebene zeigen damit zusätzlich, wie viele TEs beteiligt waren. */
    _teBaseText(row) {
      const n = row && row.anzahl_te != null ? Number(row.anzahl_te) : null;
      return n != null && Number.isFinite(n)
        ? `Basis: Σ ${Math.round(n).toLocaleString("de-DE")} TE`
        : "Basis: Σ – TE";
    }
    _teBaseHtml(row, metric) {
      const info = metric && (METRIC_INFO[metric.key] || metric);
      const level = info && info.level;
      const n = metric && row && row[metric.weightKey];
      const validN = n != null && Number.isFinite(Number(n));
      const basis = metric && metric.weightKey
        ? `Basis: ${validN ? Math.round(n).toLocaleString("de-DE") : "–"} ${level === "Position" ? "Pos." : level === "Anlieferung" ? "Anl." : "TE"}` : "";
      const total = row && row.anzahl_te != null ? Math.round(row.anzahl_te).toLocaleString("de-DE") : "–";
      const label = level === "TE" && metric && metric.weightKey ? basis : `${basis ? basis + " · " : ""}Im Filter: Σ ${total} TE`;
      return `<span class="te-base" title="Basis bezeichnet den passenden Bewertungsnenner. TE im Filter ist die Gesamtzahl der Transporteinheiten im ausgewählten Zeitraum.">${label}</span>`;
    }

    _renderTiles() {
      const grid = this._sh.getElementById("grid");
      grid.innerHTML = "";
      METRICS.forEach((m, i) => {
        const pts = this._serie(m.key);
        const valid = pts.filter(p => p && p.v != null);
        if (!valid.length) {
          const empty = document.createElement("div");
          empty.className = "tile tile-nodata";
          empty.dataset.key = m.key;
          empty.innerHTML = `<div class="m-lbl">${esc(m.label)}</div><div class="m-val"><b>–</b><span class="u">${m.unit}</span></div><div class="nodata-hint">Wert oder passende Datenbasis fehlt</div>`;
          grid.appendChild(empty);
          return;
        }
        const last = valid[valid.length - 1].v;
        const base = valid.length > 3
          ? valid.slice(0, -1).reduce((a, p) => a + p.v, 0) / (valid.length - 1) : last;
        const rel = base ? (last - base) / Math.abs(base) : 0;
        const good = m.lowerBetter ? rel < 0 : rel > 0;

        // Vorjahres-Delta: Wert der aktuellen Periode vs. gleiche Periode vor
        // einem Jahr (falls die Historie so weit reicht).
        let yoy = null;
        const lastPer = valid[valid.length - 1].per;
        const basisRow = this._seg === "Gesamt" ? this._idx.__gesamt[lastPer] : this._idx[lastPer + "|" + this._seg];
        const pyPer = this._priorYearPeriod(lastPer);
        const prevYear = pyPer ? pts.find(p => p && p.per === pyPer) : null;
        if (prevYear && prevYear.v != null && prevYear.v !== 0)
          yoy = (last - prevYear.v) / Math.abs(prevYear.v);

        // Ziel-Status
        let slaHtml = "";
        const _tgt = this._targetOf(m);
        if (_tgt != null) {
          const ok = m.lowerBetter ? last <= _tgt : last >= _tgt;
          slaHtml = `<span class="sla ${ok?"ok":"miss"}" title="Vorläufiges manuelles Ziel ${fmtVal(_tgt,m)}${m.unit==='%'?'%':m.unit}">${ok?"✓":"✕"} Vorläufiges Ziel</span>`;
        }
        const yoyHtml = yoy != null
          ? `<span class="yoy ${ (m.lowerBetter? yoy<0 : yoy>0)?"up":"down"}" title="vs. Vorjahr">VJ ${yoy>=0?"+":""}${(yoy*100).toFixed(0)}%</span>`
          : "";

        const tile = document.createElement("div");
        tile.className = "tile" + (m.key === this._selMetric ? " sel" : "");
        tile.dataset.key = m.key;
        tile.dataset.period = lastPer;
        const mi = METRIC_INFO[m.key] || {};
        const infoTitle = [mi.meaning || "Kennzahl des Cockpits.", mi.formula ? `Formel: ${mi.formula}` : ""]
          .filter(Boolean).join(" · ");
        tile.innerHTML = `
          <div class="m-lbl">${m.label}<button class="tile-info" data-key="${m.key}" type="button"
            aria-label="Kennzahl ${m.label} erklären" title="${esc(infoTitle)}">i</button></div>
          <div class="m-val"><b data-count="${last}">${m.pct ? "0.0" : "0"}</b><span class="u">${m.unit}</span>
            <span class="m-delta ${m.sum||Math.round(Math.abs(rel*100))===0?'neutral':good?'up':'down'}" title="Vergleich mit dem ungewichteten Mittel der vorherigen dargestellten Perioden">${valid.length>3?`${Math.round(Math.abs(rel*100))===0?'=':rel>=0?'▲':'▼'} ${Math.abs(rel*100).toFixed(0)}% · Verlauf`:'Vergleich: zu geringe Basis'}</span></div>
          <div class="m-sub">${this._teBaseHtml(basisRow, m)}${slaHtml}${yoyHtml}</div>
          ${this._sparkSvg(pts, m, i)}`;
        tile.addEventListener("click", (e) => {
          if (e.target.closest(".tile-info")) return; // Info-Klick darf weder Glossar noch Detailansicht öffnen
          this._selMetric = m.key; this._render();
        });
        grid.appendChild(tile);

        this._countUp(tile.querySelector("b"), last, m);
        this._animateDraw(tile.querySelector("path.line"), tile.querySelector("circle.head"));
        this._wireSparkHover(tile, pts, m);
      });
      // Das große Fenster „Begriffe & Berechnungen“ wird ausschließlich über
      // den Header-Button „Begriffe“ geöffnet. Die kleinen i-Buttons liefern
      // ihre Kurzinformation über den title/Tooltip und dürfen das Glossar nicht öffnen.
      grid.querySelectorAll(".tile-info").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
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
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      const host = this._sh.getElementById("detailChart");
      const legend = this._sh.getElementById("detailLegend");
      const title = this._sh.getElementById("detailTitle");
      let m = METRICS.find(x => x.key === this._selMetric) || METRICS[0];
      // Wenn die bisher gewählte Kennzahl im neuen Datenbestand nicht gebunden ist,
      // automatisch auf die erste tatsächlich vorhandene Kennzahl wechseln.
      const hasMetricData = (mt) => this._serie(mt.key).some(p => p && p.v != null && Number.isFinite(Number(p.v)));
      if (!hasMetricData(m)) {
        const fallback = METRICS.find(hasMetricData);
        if (!fallback) {
          title.textContent = "Keine auswertbare Kennzahl";
          host.innerHTML = `<div class="empty-hint">Die Perioden wurden erkannt, aber keine der erwarteten Kennzahlen enthält auswertbare Werte.<br>Bitte Data Binding / Feed-Zuordnung prüfen.</div>`;
          legend.innerHTML = "";
          return;
        }
        m = fallback;
        this._selMetric = fallback.key;
      }
      legend.innerHTML = "";
      // Tatsächliche Breite des Chart-Containers messen, statt eine feste
      // viewBox-Breite anzunehmen. Ohne das skaliert der Browser die SVG
      // (viewBox vs. feste CSS-Höhe) nach der HÖHE — die Breite bleibt dann
      // bei genau der viewBox-Breite hängen und das Diagramm wirkt schmal
      // und zentriert mit leeren Rändern, egal wie breit der Container ist.
      const CW = Math.max(520, host.clientWidth || 860);

      if (this._detailView === "vergleich") {
        title.textContent = `${m.label} · Ladestellenvergleich`;
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

    // Ladestellenvergleich: alle Segmente als Linien, ohne Band (sonst zu unruhig)
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
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
        findings.map(f => `<div class="ins ${f.tone}"><i></i><span>${esc(f.text)}</span></div>`).join("");
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
      this._stopPlay();
      this._compact = true;
      const root = this._sh.querySelector(".root");
      if (root) root.classList.add("compact");
      // Scrubber auf die gewählte Periode stellen, damit die Kacheln deren Werte zeigen
      const idx = this._perioden.indexOf(periode);
      if (idx >= 0) { this._scrubIdx = idx; this._applyScrub(); }
      this._renderSelHead(periode);
    }
    exitCompact() {
      this._stopPlay();
      this._compact = false;
      const root = this._sh.querySelector(".root");
      if (root) root.classList.remove("compact");
      const sh = this._sh.getElementById("selHead");
      if (sh) sh.hidden = true;
      // Scrubber ans Ende zurück
      this._scrubIdx = this._perioden.length-1;
      const scrub=this._sh.getElementById('scrub');if(scrub)scrub.value=this._scrubIdx;
      this._applyScrub();
    }
    _renderSelHead(periode) {
      const el = this._sh.getElementById("selHead");
      if (!el) return;
      const seg = this._seg && this._seg !== "Gesamt" ? this._seg : "Alle Ladestellen";
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
      scrub.addEventListener("input", () => { this._stopPlay(); this._scrubIdx = +scrub.value; this._applyScrub(); });
      play.addEventListener("click", () => this._playing ? this._stopPlay() : this._startPlay());
      if (this._scrubIdx == null || this._scrubIdx < 0 || this._scrubIdx >= this._perioden.length)
        this._scrubIdx = this._perioden.length - 1;
      scrub.value = this._scrubIdx;
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
        if (b) b.textContent = (r && r[m.key] != null) ? fmtVal(r[m.key], m) : "–";
        const teBase = tile.querySelector(".te-base");
        if (teBase) teBase.outerHTML = this._teBaseHtml(r, m);
        tile.querySelectorAll('.m-delta,.sla,.yoy').forEach(el=>el.hidden=tile.dataset.period!==per);
        let periodLabel=tile.querySelector('.ux-period');
        if(!periodLabel){periodLabel=document.createElement('div');periodLabel.className='ux-meta ux-period';tile.appendChild(periodLabel);}
        periodLabel.textContent='Zeitraum: '+(per||'nicht verfügbar');
      });
      // Prozesszeiten folgen derselben ausgewählten Periode wie die Kacheln.
      this._renderProcessTimes();
      if(this._sh.getElementById('ux-context')) WEUX.update(this,'strategy');
    }

    _startPlay() {
      this._stopPlay();
      if (!this._perioden.length) return;
      this._playing = true;
      this._sh.getElementById("play").textContent = "⏸";
      const scrub = this._sh.getElementById("scrub");
      if (this._scrubIdx == null || this._scrubIdx >= this._perioden.length - 1) this._scrubIdx = 0;
      scrub.value = this._scrubIdx;
      this._applyScrub();
      this._playTimer = setInterval(() => {
        if (this._scrubIdx >= this._perioden.length - 1) { this._stopPlay(); return; }
        this._scrubIdx++;
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

  WEUX.install(WEStrategie, 'strategy');
  if (!customElements.get("we-strategie")) customElements.define("we-strategie", WEStrategie);
})();
