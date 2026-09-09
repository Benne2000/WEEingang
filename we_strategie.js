/* WE Strategie 0.27.0 – ausschließlich aggregierte BW-Daten.
 * Datenvertrag: widget_strategie (8).json. Keine Detailberechnungen im Widget.
 * Detailanalysen werden über onPeriodSelect im Cockpit geöffnet.
 */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = v => String(v).padStart(2,'0');
  const number = v => Number.isFinite(v) ? v.toLocaleString('de-DE',{maximumFractionDigits:1}) : 'Nicht verfügbar';
  const cell = (row,id) => row[id+'_0'] ?? row[id] ?? null;
  const code = v => v && typeof v==='object' ? v.id ?? v.label ?? null : v;
  function numeric(v) {
    if(v && typeof v==='object')v=v.raw ?? v.formatted;
    if(v==null || String(v).trim()==='')return null;
    if(typeof v==='number')return Number.isFinite(v)?v:null;
    let s=String(v).trim().replace(/[\s\u00a0]/g,'');
    if(s.includes(',')) {
      if(!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(s))return null;
      s=s.replace(/\./g,'').replace(',','.');
    }
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s))return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  }
  function hours(v,unit) {
    if(v==null)return null;
    const formatted=typeof v==='object'?v.formatted ?? v.label ?? '':v;
    const match=/^(\d+):(\d{2}):(\d{2})$/.exec(String(formatted).trim());
    if(match)return +match[2]<60&&+match[3]<60 ? +match[1]+match[2]/60+match[3]/3600 : null;
    const n=numeric(v);if(n==null || n<0)return null;
    if(unit==='hhmmss') {
      if(!Number.isInteger(n))return null;
      const seconds=n%100,minutes=Math.floor(n/100)%100;
      return seconds<60&&minutes<60 ? Math.floor(n/10000)+minutes/60+seconds/3600 : null;
    }
    const factor={sekunden:1/3600,minuten:1/60,stunden:1,tage:24}[unit];
    return factor==null?null:n*factor;
  }
  function segment(v) {
    const raw=String(code(v)??'').trim(),label=String(v?.label??raw).trim();
    if(raw==='@TotalMembers'||/^gesamt$/i.test(label))return 'Gesamt';
    if(!raw||['#','@NullMember','null','undefined'].includes(raw))return 'Nicht zugeordnet';
    const s=label.toUpperCase();
    if(s.includes('CONTAINE'))return 'Container';
    if(s.includes('LANDVERK')||s.includes('FREI HAUS')||s.includes('DDP'))return 'Landverkehr';
    if(s.includes('BSL'))return 'BSL';
    if(s.includes('NICHT ZUGEORDNET'))return 'Nicht zugeordnet';
    return label;
  }
  function day(value) {
    const m=/^(\d{4})-?(\d{2})-?(\d{2})$/.exec(String(value??''));
    if(!m)return null;
    const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?d:null;
  }
  function weekOf(d) {
    const t=new Date(d);t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));
    const year=t.getUTCFullYear();return `${year}-W${pad(Math.ceil((((t-new Date(Date.UTC(year,0,1)))/86400000)+1)/7))}`;
  }
  function range(period) {
    let m=/^(\d{4})-W(\d{2})$/.exec(period||'');
    if(m) {
      const a=new Date(Date.UTC(+m[1],0,4));a.setUTCDate(a.getUTCDate()-(a.getUTCDay()||7)+1+(+m[2]-1)*7);
      if(weekOf(a)!==period)return null;
      const b=new Date(a);b.setUTCDate(b.getUTCDate()+6);
      return {from:a.toISOString().slice(0,10),to:b.toISOString().slice(0,10)};
    }
    m=/^(\d{4})-(\d{2})$/.exec(period||'');
    if(m&&+m[2]>=1&&+m[2]<=12)return {from:period+'-01',to:new Date(Date.UTC(+m[1],+m[2],0)).toISOString().slice(0,10)};
    return null;
  }
  function period(value,grain) {
    const s=String(code(value)??'').trim(),d=day(s);
    if(d)return {grain:'day',key:d.toISOString().slice(0,10)};
    let key=s;
    if(!/^\d{4}-(?:W\d{2}|\d{2})$/.test(s)) {
      const m=/^(\d{2})\.(\d{4})$/.exec(s),c=/^(\d{4})(\d{2})$/.exec(s);
      if(!m&&!c)return null;
      key=(m?m[2]:c[1])+'-'+(grain==='month'?'':'W')+(m?m[1]:c[2]);
    }
    return range(key)?{grain:key.includes('-W')?'week':'month',key}:null;
  }
  const metrics=[
    ['value_anzahl_te','Transporteinheiten','TE','counts'],
    ['value_anzahl_anl','Anlieferungen','Anlieferungen','counts'],
    ['value_anzahl_pos','Anlieferpositionen','Positionen','counts'],
    ['value_menge','Anlieferungsmenge IST','Rohmenge','volume'],
    ['value_gewicht','Ladungsgewicht','t','volume',1/1000],
    ['value_wert','Wert der Anlieferpositionen','Tsd. €','volume',1/1000],
    ['value_volumen','Ladungsvolumen','Rohvolumen','volume'],
    ['value_dur_wait_gate','Ankunft → Andocken','h','duration'],
    ['value_dur_reaction','Andocken → Entladestart','h','duration'],
    ['value_dur_unload','Entladestart → Entladen beendet','h','duration'],
    ['value_dur_booking','Entladeende → WE gebucht','h','duration'],
    ['value_dur_putaway','Einlagerungsdauer laut BW','h','duration'],
    ['value_dur_dwell','Ankunft → Einlagerungsende','h','duration'],
    ['value_dur_plan_start_end','Geplanter Start → Geplantes Ende','h','extra'],
    ['value_dur_actual_start_end','Ist-Start → Ist-Ende','h','extra'],
    ['value_dur_arrival_dock','Ankunft → Andocken · Zusatzfeed','h','extra'],
    ['value_dur_dock_unload_start','Andocken → Entladestart · Zusatzfeed','h','extra'],
    ['value_dur_unload_start_end','Entladestart → Entladen beendet · Zusatzfeed','h','extra'],
    ['value_dur_unload_end_actual_end','Entladen beendet → Tatsächliches Ende','h','extra'],
    ['value_dur_we_booked_completion','WE gebucht → Fertigstellung','h','extra'],
    ['value_dur_arrival_completion','Ankunft → Fertigstellung','h','extra'],
    ['value_dur_dock_completion','Andocken → Fertigstellung','h','extra']
  ];
  const css=`
    :host{display:block;height:100%;--bg:#0d111a;--panel:#181f2d;--card:#232d41;--line:#39465b;--text:#eff4fd;--muted:#b6c3d8;--accent:#62bcf0;--warn:#f0c476;font:14px/1.45 'Segoe UI',Arial,sans-serif;color:var(--text)}
    :host([data-theme=light]){--bg:#f3f6fa;--panel:#fff;--card:#fff;--line:#d0dbe7;--text:#17283c;--muted:#53647a;--accent:#126493;--warn:#805a05}
    *{box-sizing:border-box}button,select{font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px}button,summary{cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
    .shell{height:100%;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:9px;overflow:hidden}header{padding:14px 16px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}h1{font-size:17px;margin:0}header p,p{margin:4px 0;color:var(--muted)}header p{font-size:12px}.tools{display:flex;gap:7px;flex-wrap:wrap}main{padding:18px;overflow:auto;flex:1;min-height:0}h2{font-size:14px;margin:0 0 10px}.selection{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:9px;margin-bottom:16px}label{display:grid;gap:5px;font-size:12px;color:var(--muted)}select{font-size:14px;min-width:115px}#openCockpit{margin-left:auto;background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:700;min-height:40px}.context{margin:0 0 18px;color:var(--muted);font-size:12px}.context strong{color:var(--text)}.section{margin-bottom:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.counts{grid-template-columns:repeat(auto-fit,minmax(185px,1fr))}.tile{padding:15px 16px;border:1px solid var(--line);border-radius:9px;background:var(--card);min-width:0}.tile-top{display:flex;gap:8px;justify-content:space-between;align-items:start}.tile h3{font-size:13px;margin:0;font-weight:600}.info{width:25px;height:25px;flex:none;padding:0;border-radius:50%;color:var(--accent);border-color:var(--accent);font-size:12px}.value{font-weight:700;font-size:27px;margin:9px 0 5px;overflow-wrap:anywhere}.value span{font-size:12px;font-weight:400;color:var(--muted);margin-left:6px}.meta{font-size:11px;color:var(--muted)}.warning{color:var(--warn)}.counts .tile{border-top:3px solid var(--accent)}details{padding:13px;border:1px solid var(--line);border-radius:9px;background:var(--panel);margin:14px 0}summary{font-size:13px}details[open]>summary{margin-bottom:14px}.banner{border-left:3px solid var(--accent);padding:8px 12px;margin:14px 0;font-size:12px;color:var(--muted)}.empty{padding:40px 12px;text-align:center;color:var(--muted)}.foot{font-size:11px;color:var(--muted);padding:0 2px 8px}.compact .grid{grid-template-columns:1fr}.compact main{padding:12px}.compact #openCockpit{width:100%;margin-left:0}.compact .selection{gap:8px}.compact select{max-width:100%}.compact .optional{display:none}dialog{width:min(620px,92vw);max-height:85vh;overflow:auto;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px;font:14px/1.65 'Segoe UI',Arial,sans-serif}dialog::backdrop{background:#0009}dialog h2{font-size:19px}dialog .close{float:right;margin:0 0 12px 12px}dialog code{overflow-wrap:anywhere}.status{color:var(--warn);margin:8px 0}
    @media(max-width:600px){main{padding:12px}.grid{grid-template-columns:1fr 1fr}.selection label{flex:1}.selection select{width:100%}#openCockpit{width:100%;margin-left:0}.value{font-size:23px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  `;
  class WEStrategie extends HTMLElement {
    constructor() {
      super();this._sh=this.attachShadow({mode:'open'});this._props={theme:'dark',aggregation:'week',dauerEinheit:'sekunden'};
      this._rows=[];this._perioden=[];this._selected='';this._seg='Gesamt';this._opened={};
      this._sh.innerHTML=`<style>${css}</style><div class="shell"><header><div><h1>WE · Strategieübersicht</h1><p>Aggregierte BW-Daten · Analysen im Cockpit</p></div><div class="tools"><button id="help">Datenbasis & Hilfe</button><button id="theme" aria-label="Farbschema wechseln">Hell / Dunkel</button></div></header><main><div id="dash"></div></main></div><dialog id="helpDialog" aria-labelledby="helpTitle"></dialog>`;
      this._sh.getElementById('theme').onclick=()=>this.setTheme(this._props.theme==='dark'?'light':'dark');
      this._sh.getElementById('help').onclick=e=>this._help(null,e.currentTarget);
      this._sh.addEventListener('click',e=>{const b=e.target.closest('[data-info]');if(b)this._help(b.dataset.info,b);if(e.target.closest('[data-close]'))this._sh.getElementById('helpDialog').close();});
      this._sh.getElementById('helpDialog').addEventListener('close',()=>this._returnFocus?.isConnected&&this._returnFocus.focus());
      queueMicrotask(()=>this.setTheme(this._props.theme));this._render();
    }
    set myDataSource(binding) {
      this._dataBinding=binding;if(!binding){this._rows=[];this._loading=false;this._render();return;}
      if(['loading','pending','waiting'].includes(binding.state)&&!Array.isArray(binding.data)){this._rows=[];this._loading=true;this._render();return;}
      this._loading=false;this._ingest(binding.data||[]);this._render();
    }
    _ingest(rows) {
      this._sourceGrain=this._props.aggregation==='month'?'month':'week';
      this._rows=rows.map(raw=>{
        const values={};
        for(const [id,,,group,factor=1] of metrics) {
          let value=group==='duration'||group==='extra'?hours(cell(raw,id),this._props.dauerEinheit):numeric(cell(raw,id));
          if(group==='counts'&&value!=null&&(!Number.isSafeInteger(value)||value<0))value=null;
          values[id]=value==null?null:value*factor;
        }
        return {period:period(cell(raw,'dimension_periode'),this._sourceGrain),segment:segment(cell(raw,'dimension_segment')),values};
      });
    }
    onCustomWidgetBeforeUpdate(changed){Object.assign(this._props,changed||{});}
    onCustomWidgetAfterUpdate(changed) {
      Object.assign(this._props,changed||{});this.setTheme(this._props.theme);
      const binding=changed?.myDataSource??changed?.dataBindings?.myDataSource;
      if(binding){this.myDataSource=binding;return;}
      if(changed&&'dauerEinheit' in changed&&this._dataBinding)this._ingest(this._dataBinding.data||[]);
      this._render();
    }
    onCustomWidgetResize(){} onCustomWidgetDestroy(){}
    setTheme(theme){if(['dark','light'].includes(theme)){this._props.theme=theme;this.setAttribute('data-theme',theme);}}
    setTestData(rows){if(typeof rows==='string')rows=JSON.parse(rows);this._demo=true;this.myDataSource={state:'success',data:rows};}
    _eligible(mode){return this._rows.filter(r=>r.period&&(r.period.grain==='day'||r.period.grain===mode));}
    _key(r){return r.period.grain==='day'?(this._props.aggregation==='month'?r.period.key.slice(0,7):weekOf(day(r.period.key))):r.period.key;}
    _prepare() {
      const eligible=this._eligible(this._props.aggregation);
      this._perioden=[...new Set(eligible.map(r=>this._key(r)))].sort();
      if(!this._perioden.includes(this._selected))this._selected=this._perioden.at(-1)||'';
      this._segments=[...new Set(eligible.filter(r=>this._key(r)===this._selected).map(r=>r.segment))].filter(s=>s!=='Gesamt');
      const order=['Container','Landverkehr','Nicht zugeordnet','BSL'];
      this._segments.sort((a,b)=>(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b))||a.localeCompare(b,'de'));
      if(this._seg!=='Gesamt'&&!this._segments.includes(this._seg))this._seg='Gesamt';
      let rows=eligible.filter(r=>this._key(r)===this._selected);
      if(this._seg!=='Gesamt')rows=rows.filter(r=>r.segment===this._seg);
      else {
        const groups=new Map();
        for(const row of rows){const key=row.period.key; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
        rows=[...groups.values()].flatMap(group=>group.some(r=>r.segment==='Gesamt')?group.filter(r=>r.segment==='Gesamt'):group);
      }
      this._selectedRows=rows;this._aggregate={};
      for(const [id] of metrics) {
        const valid=rows.map(r=>r.values[id]).filter(Number.isFinite);
        const total=valid.reduce((a,b)=>a+b,0);
        this._aggregate[id]={value:valid.length&&Number.isFinite(total)?total:null,n:valid.length,missing:rows.length-valid.length};
      }
    }
    getSelectedPeriod(){return this._selected;}
    getSelectedSegment(){return this._seg;}
    getSelectedFrom(){return range(this._selected)?.from||'';}
    getSelectedTo(){return range(this._selected)?.to||'';}
    getPriorYearPeriod(){const p=this._selected?`${+this._selected.slice(0,4)-1}${this._selected.slice(4)}`:'';return range(p)?p:'';}
    getPriorYearFrom(){return range(this.getPriorYearPeriod())?.from||'';}
    getPriorYearTo(){return range(this.getPriorYearPeriod())?.to||'';}
    getYoYComparison(){return '[]';} // Kein Detail- oder Quotenvergleich in diesem Widget.
    setCompact(p){if(this._perioden.includes(p))this._selected=p;this._compact=true;this._render();}
    exitCompact(){this._compact=false;this._render();}
    _emitPeriod(p){if(!this._perioden.includes(p))return false;this._selected=p;this._render();this.dispatchEvent(new CustomEvent('onPeriodSelect',{detail:{periode:p,segment:this._seg}}));return true;}
    _tile(m) {
      const [id,label,unit,group]=m,s=this._aggregate[id],time=group==='duration'||group==='extra';
      const basis=s.value==null?'Feed nicht befüllt oder Wert ungültig':s.missing?`Teilsumme · ${s.n} von ${this._selectedRows.length} Aggregatzeilen`:'BW-Aggregat · ausgewählte Periode';
      return `<article class="tile" data-metric="${id}"><div class="tile-top"><h3>${escape(label)}</h3><button class="info" data-info="${id}" aria-label="${escape(label)} erklären">i</button></div><div class="value">${number(s.value)}${s.value==null?'':`<span>${unit}</span>`}</div><div class="meta${s.missing?' warning':''}">${time?'Dauersumme · kein Durchschnitt<br>':''}${basis}</div></article>`;
    }
    _render() {
      this._prepare();this._sh.querySelector('.shell').classList.toggle('compact',!!this._compact);
      const dash=this._sh.getElementById('dash');
      if(!this._rows.length){dash.innerHTML=`<div class="empty">${this._loading?'BW-Aggregate werden geladen …':'Keine aggregierten Daten verfügbar. Datenbindung myDataSource zuweisen.'}</div>`;return;}
      const group=g=>metrics.filter(m=>m[3]===g).map(m=>this._tile(m)).join('');
      const anyWeeks=this._rows.some(r=>r.period?.grain==='week');
      const unhandled=this._rows.length-this._eligible(this._props.aggregation).length;
      const dates=range(this._selected),fmt=s=>s.split('-').reverse().join('.');
      dash.innerHTML=`<div class="selection"><label>Zeitraster<select id="grain"><option value="week" ${this._props.aggregation==='week'?'selected':''} ${this._eligible('week').length?'':'disabled'}>Woche</option><option value="month" ${this._props.aggregation==='month'?'selected':''} ${this._eligible('month').length?'':'disabled'}>Monat</option></select></label><label>Periode<select id="period">${this._perioden.map(p=>`<option ${p===this._selected?'selected':''}>${p}</option>`).join('')}</select></label><label>Ladestelle<select id="segment">${['Gesamt',...this._segments].map(s=>`<option value="${escape(s)}" ${s===this._seg?'selected':''}>${s==='Gesamt'?'Alle Ladestellen':escape(s)}</option>`).join('')}</select></label><button id="openCockpit" ${this._selected?'':'disabled'}>Im Cockpit analysieren →</button></div>
        <div class="context"><strong>${escape(this._selected||'Kein passender Zeitraum')}</strong>${dates?' · '+fmt(dates.from)+' – '+fmt(dates.to):''} · ${this._seg==='Gesamt'?'Alle Ladestellen':escape(this._seg)}<br>Zeitbezug: gebundene BW-Periode${this._demo?' · Synthetische Planstart-Beispieldaten, keine BW-Verbindung':'. Quellereignis im Modell prüfen; nicht automatisch Planstart.'}${anyWeeks&&!this._eligible('month').length?'<br>Monat nicht verfügbar: Wochenaggregate lassen sich an Monatsgrenzen nicht eindeutig aufteilen.':''}${unhandled?`<p class="status">${unhandled} Aggregatzeile(n) mit ungültiger oder unpassender Zeitgranularität ausgeschlossen.</p>`:''}</div>
        <section class="section"><h2>Umfang laut BW</h2><div class="grid counts">${group('counts')}</div></section>
        <section class="section"><h2>Mengen und Werte</h2><div class="grid">${group('volume')}</div><p class="meta">Rohmenge und Rohvolumen: Einheit nicht übermittelt. Summen sind nur bei einheitlichen Maßeinheiten fachlich vergleichbar.</p></section>
        <details class="optional" data-panel="durations" ${this._opened.durations?'open':''}><summary>Aggregierte Prozesszeiten anzeigen</summary><p class="banner">Die JSON-Bindungen liefern Dauersummen. Es erfolgt keine Division durch TE-, Anlieferungs- oder Positionsanzahl. Für Durchschnitt, Streuung und Ursachenanalyse das Cockpit öffnen.</p><div class="grid">${group('duration')}</div></details>
        <details class="optional" data-panel="extras" ${this._opened.extras?'open':''}><summary>Weitere BW-Dauersummen anzeigen</summary><p class="banner">Überlappende Zeitspannen und unterschiedliche BW-Berechnungsebenen: diese Kacheln nicht zu einer Gesamtdauer addieren.</p><div class="grid">${group('extra')}</div></details>
        <div class="foot">Aggregierte Übersicht · keine Einzelbelege, Rankings oder Detaildiagramme. WE Strategie 0.27.0</div>`;
      dash.querySelector('#grain').onchange=e=>{this._props.aggregation=e.target.value;this._selected='';this._render();};
      dash.querySelector('#period').onchange=e=>{this._selected=e.target.value;this._render();};
      dash.querySelector('#segment').onchange=e=>{this._seg=e.target.value;this._render();};
      dash.querySelector('#openCockpit').onclick=()=>this._emitPeriod(this._selected);
      dash.querySelectorAll('[data-panel]').forEach(el=>el.addEventListener('toggle',()=>{if(el.isConnected)this._opened[el.dataset.panel]=el.open;}));
    }
    _help(id,trigger) {
      const metric=metrics.find(m=>m[0]===id),dialog=this._sh.getElementById('helpDialog');this._returnFocus=trigger;
      const specific=metric?`<p><code>${metric[0]}</code></p><p>Der Wert ist eine Summe der gelieferten BW-Aggregate für die ausgewählte Periode und Ladestelle. Fehlende Werte werden nicht durch andere Kennzahlen ersetzt; Teilsummen sind sichtbar gekennzeichnet.</p>${metric[3]==='counts'?'<p>BW muss die fachlich korrekte Zählung liefern. Das Widget kann aus aggregierten Daten keine TEs oder Anlieferungen über mehrere Zeilen hinweg deduplizieren. TE-Anzahl und Anlieferungsanzahl sind nicht gleichzusetzen.</p>':''}${['duration','extra'].includes(metric[3])?'<p>Dauersumme in Stunden, kein Durchschnitt. Die Summe enthält die im BW definierten Fälle und Ereignisse. Einzelne Teilzeiten können sich überschneiden und dürfen nicht addiert werden. Im Cockpit werden Zeitkennzahlen separat aus Detaildaten berechnet.</p>':''}`:'';
      dialog.innerHTML=`<button class="close" data-close>Schließen ×</button><h2 id="helpTitle">${escape(metric?.[1]||'Strategie und Cockpit')}</h2>${specific}<p>Strategie: aggregierte BW-Zahlen. Cockpit: alle Detailanalysen, Rankings, Prozessketten, Schichten sowie Anlieferungen und Positionen.</p><p>Die Periode wird unverändert aus der gebundenen BW-Dimension gelesen. Der bisherige Übertragungszeitraum wird nicht automatisch zum geplanten Start. Dafür muss der Feed in SAC ausdrücklich auf eine Planstart-Periode bzw. einen Planstart-Tag gebunden sein.</p><p>Wochenaggregate werden nicht auf Monate verteilt. Monatswerte benötigen Monats- oder Tagesdaten. Nicht vorhandene Qualitätskennzahlen und Bewertungsnenner werden nicht erfunden.</p><p>Voraussetzung: BW liefert Summen und Anzahlen auf einer eindeutigen Aggregationsebene. Eine vorhandene Gesamtzeile wird anstelle der Ladestellenzeilen verwendet, nicht zusätzlich addiert.</p>`;
      if(!dialog.open)dialog.showModal();dialog.querySelector('[data-close]').focus();
    }
  }
  globalThis.WEStrategyAggregates={numeric,hours,period,range,segment,metrics};
  if(!customElements.get('we-strategie'))customElements.define('we-strategie',WEStrategie);
})();
