/**
 * Werttreiberbaum Filialumsatz – SAC Custom Widget
 * Web Component: <werttreiberbaum-widget>
 * SAC Lifecycle: onCustomWidgetAfterUpdate, onCustomWidgetResize
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     CSS (injected into Shadow DOM)
  ───────────────────────────────────────────── */
  const CSS = `
    :host { display:block; width:100%; height:100%; font-family:'72',Arial,sans-serif; box-sizing:border-box; }
    *, *::before, *::after { box-sizing:inherit; }

    /* ── Themes ── */
    :host([data-theme="dark"]) {
      --bg:#1a1f2e; --bg2:#242938; --bg3:#2e3447;
      --ink:#e8eaf0; --ink2:#9ba3b8; --ink3:#6b7490;
      --border:#3a4158; --border2:#4a5270;
      --green:#34d07a; --green-bg:#1a3a2a;
      --red:#f06070; --red-bg:#3a1a20;
      --amber:#f0b840; --amber-bg:#3a2e10;
      --blue:#5b8af0; --blue-bg:#1a2550;
      --purple:#a87ff0; --purple-bg:#251a3a;
      --op:#e8eaf0;
    }
    :host([data-theme="light"]) {
      --bg:#f5f6fa; --bg2:#ffffff; --bg3:#eaecf5;
      --ink:#14202e; --ink2:#41505f; --ink3:#8a95a3;
      --border:#dbe2e8; --border2:#c5cdd6;
      --green:#0e7c4a; --green-bg:#e6f5ee;
      --red:#c0303f; --red-bg:#fcedef;
      --amber:#9a6800; --amber-bg:#fdf3d8;
      --blue:#1a4fbf; --blue-bg:#e7ecf9;
      --purple:#6b3fc0; --purple-bg:#f0eafb;
      --op:#14202e;
    }

    .shell { display:flex; flex-direction:column; height:100%; background:var(--bg); color:var(--ink); overflow:hidden; }

    /* ── Header ── */
    .hdr { display:flex; align-items:center; gap:10px; padding:10px 14px 8px; border-bottom:1px solid var(--border); flex-shrink:0; }
    .hdr-title { font-size:13px; font-weight:700; letter-spacing:.02em; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--ink); }
    .hdr-eq { font-size:10px; color:var(--ink3); letter-spacing:.04em; font-family:monospace; }
    .btn { background:var(--bg3); border:1px solid var(--border); color:var(--ink2); font-size:11px; padding:3px 9px; border-radius:4px; cursor:pointer; transition:background .15s; white-space:nowrap; }
    .btn:hover { background:var(--border); }
    .btn.active { background:var(--blue-bg); color:var(--blue); border-color:var(--blue); }
    .sep { width:1px; height:18px; background:var(--border); flex-shrink:0; }

    /* ── Filter bar ── */
    .filters { display:flex; gap:6px; padding:7px 14px; border-bottom:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; align-items:center; }
    .filter-label { font-size:10px; color:var(--ink3); letter-spacing:.06em; text-transform:uppercase; }
    .chip { font-size:11px; padding:2px 8px; border-radius:12px; border:1px solid var(--border); background:var(--bg2); color:var(--ink2); cursor:pointer; transition:all .15s; }
    .chip:hover { border-color:var(--blue); color:var(--blue); }
    .chip.on { background:var(--blue-bg); color:var(--blue); border-color:var(--blue); font-weight:600; }

    /* ── Tree canvas ── */
    .canvas { flex:1; overflow:auto; padding:18px 14px 24px; }
    .tree-root { display:inline-flex; flex-direction:column; min-width:100%; }

    /* ── Node rows ── */
    .level { display:flex; gap:10px; margin-bottom:10px; align-items:stretch; }

    /* ── Node card ── */
    .node { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:10px 13px; min-width:158px; max-width:210px; flex-shrink:0; cursor:default; transition:transform .12s, box-shadow .12s; position:relative; }
    .node:hover { transform:translateY(-2px); box-shadow:0 6px 20px -8px rgba(0,0,0,.4); }
    .node.root-node { min-width:190px; border-color:var(--blue); background:var(--blue-bg); }
    .node.root-node .node-label { color:var(--blue); }
    .node.pos { border-left:3px solid var(--green); }
    .node.neg { border-left:3px solid var(--red); }
    .node.warn { border-left:3px solid var(--amber); }

    .node-eyebrow { font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3); margin-bottom:3px; }
    .node-label { font-size:12px; font-weight:700; color:var(--ink); margin-bottom:6px; line-height:1.2; }
    .node-value { font-size:18px; font-weight:700; color:var(--ink); line-height:1; font-variant-numeric:tabular-nums; }
    .node-value.dim { font-size:14px; }
    .node-unit { font-size:10px; color:var(--ink3); margin-left:2px; }
    .node-delta { font-size:10px; margin-top:5px; display:flex; align-items:center; gap:3px; }
    .node-delta.up { color:var(--green); }
    .node-delta.dn { color:var(--red); }
    .node-delta.neu { color:var(--ink3); }
    .node-sub { font-size:10px; color:var(--ink3); margin-top:4px; border-top:1px solid var(--border); padding-top:4px; line-height:1.5; }

    /* ── Operator connector ── */
    .op-col { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; width:28px; flex-shrink:0; }
    .op-line { flex:1; width:1px; background:var(--border); min-height:8px; }
    .op-badge { width:22px; height:22px; border-radius:50%; background:var(--bg3); border:2px solid var(--blue); color:var(--blue); font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

    /* horizontal connector after node */
    .h-line { width:16px; height:2px; background:var(--border); align-self:center; flex-shrink:0; }

    /* ── Breakdown rows (L2/L3) ── */
    .breakdown { display:flex; gap:8px; flex-wrap:wrap; }
    .breakdown-item { background:var(--bg2); border:1px solid var(--border); border-radius:7px; padding:8px 11px; min-width:120px; flex-shrink:0; transition:transform .12s; }
    .breakdown-item:hover { transform:translateY(-2px); }
    .breakdown-item.pos { border-left:3px solid var(--green); }
    .breakdown-item.neg { border-left:3px solid var(--red); }
    .bi-label { font-size:10px; color:var(--ink3); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .bi-value { font-size:14px; font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
    .bi-share { font-size:10px; color:var(--ink3); margin-top:2px; }
    .bi-delta { font-size:10px; }
    .bi-delta.up { color:var(--green); }
    .bi-delta.dn { color:var(--red); }

    /* ── Section divider ── */
    .section-hdr { font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3); padding:10px 0 5px; border-top:1px solid var(--border); margin-top:6px; }

    /* ── Empty / no-data state ── */
    .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:10px; color:var(--ink3); }
    .empty-icon { font-size:36px; opacity:.4; }
    .empty-text { font-size:13px; }

    /* ── Scrollbar ── */
    .canvas::-webkit-scrollbar { width:5px; height:5px; }
    .canvas::-webkit-scrollbar-track { background:transparent; }
    .canvas::-webkit-scrollbar-thumb { background:var(--border2); border-radius:3px; }
  `;

  /* ─────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────── */
  function fmt(v, dec = 0, unit = '€') {
    if (v == null || isNaN(v)) return '–';
    const abs = Math.abs(v);
    let s;
    if (abs >= 1e6)      s = (v / 1e6).toFixed(dec === 0 ? 1 : dec) + ' Mio';
    else if (abs >= 1e3) s = (v / 1e3).toFixed(dec === 0 ? 1 : dec) + ' k';
    else                 s = v.toFixed(dec);
    return unit ? `${s} ${unit}` : s;
  }
  function fmtN(v, dec = 0) { return fmt(v, dec, ''); }
  function pct(share) { return share == null ? '' : (share * 100).toFixed(1) + ' %'; }

  /**
   * Parse SAC resultSet into flat row array.
   * Handles both flat (no dimensions) and dimensioned result sets.
   */
  function parseResultSet(ds) {
    if (!ds) return null;
    try {
      const rs = ds.getDataSource ? ds.getDataSource() : ds;
      // Prefer flat getData if available
      if (typeof rs.getData === 'function') {
        const raw = rs.getData();
        if (raw && raw.length) return raw;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Aggregate rows → KPIs.
   * rows: array of objects with keys matching feed IDs.
   */
  function aggregate(rows, filterFn) {
    const r = filterFn ? rows.filter(filterFn) : rows;
    const umsatzNetto   = r.reduce((s, x) => s + (+x.value_umsatz_netto   || 0), 0);
    const umsatzBrutto  = r.reduce((s, x) => s + (+x.value_umsatz_brutto  || 0), 0);
    const rabatt        = r.reduce((s, x) => s + (+x.value_rabatt          || 0), 0);
    const anzahlArtikel = r.reduce((s, x) => s + (+x.value_anzahl_artikel  || 0), 0);
    const anzahlBons    = r.reduce((s, x) => s + (+x.value_anzahl_bons     || 0), 0);
    const flaeche       = r.reduce((s, x) => s + (+x.value_verkaufsflaeche || 0), 0);
    const bonwert       = anzahlBons    > 0 ? umsatzNetto / anzahlBons    : 0;
    const artProBon     = anzahlBons    > 0 ? anzahlArtikel / anzahlBons  : 0;
    const stueckpreis   = anzahlArtikel > 0 ? umsatzNetto / anzahlArtikel : 0;
    const umsatzQm      = flaeche       > 0 ? umsatzNetto / flaeche       : 0;
    const rabattQ       = umsatzBrutto  > 0 ? rabatt / umsatzBrutto       : 0;
    return { umsatzNetto, umsatzBrutto, rabatt, anzahlArtikel, anzahlBons, flaeche,
             bonwert, artProBon, stueckpreis, umsatzQm, rabattQ, rowCount: r.length };
  }

  /**
   * Group rows by a dimension key → Map<label, rows[]>
   */
  function groupBy(rows, dimKey) {
    const m = new Map();
    for (const r of rows) {
      const k = r[dimKey] ?? '(leer)';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  }

  /* ─────────────────────────────────────────────
     Web Component
  ───────────────────────────────────────────── */
  class WerttreiberWidget extends HTMLElement {

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._props = {
        theme: 'dark',
        defaultView: 'baum',
        wurzelKennzahl: 'umsatz_netto',
        breakdownDimension: 'filiale',
        waehrung: 'EUR',
        dezimalstellen: 0,
        abweichungSchwellwert: 10,
        maxTiefe: 4,
        retourenEinbeziehen: false,
      };
      this._dataSource = null;
      this._rows = [];
      this._filialeFilter = '';
      this._ktFilter = '';  // kundentyp filter
    }

    /* ── SAC Property API ── */
    get theme()                { return this._props.theme; }
    set theme(v)               { this._props.theme = v; this._applyTheme(); }
    get defaultView()          { return this._props.defaultView; }
    set defaultView(v)         { this._props.defaultView = v; }
    get wurzelKennzahl()       { return this._props.wurzelKennzahl; }
    set wurzelKennzahl(v)      { this._props.wurzelKennzahl = v; this._render(); }
    get breakdownDimension()   { return this._props.breakdownDimension; }
    set breakdownDimension(v)  { this._props.breakdownDimension = v; this._render(); }
    get waehrung()             { return this._props.waehrung; }
    set waehrung(v)            { this._props.waehrung = v; this._render(); }
    get dezimalstellen()       { return this._props.dezimalstellen; }
    set dezimalstellen(v)      { this._props.dezimalstellen = +v; this._render(); }
    get abweichungSchwellwert(){ return this._props.abweichungSchwellwert; }
    set abweichungSchwellwert(v){ this._props.abweichungSchwellwert = +v; }
    get maxTiefe()             { return this._props.maxTiefe; }
    set maxTiefe(v)            { this._props.maxTiefe = +v; this._render(); }
    get retourenEinbeziehen()  { return this._props.retourenEinbeziehen; }
    set retourenEinbeziehen(v) { this._props.retourenEinbeziehen = !!v; this._render(); }

    /* ── SAC Method API ── */
    refreshData()                    { this._extractRows(); this._render(); }
    setTheme(t)                      { this.theme = t; }
    setView(v)                       { /* future: switch view */ }
    setWurzelKennzahl(k)             { this.wurzelKennzahl = k; }
    setBreakdownDimension(d)         { this.breakdownDimension = d; }
    setFilialeFilter(f)              { this._filialeFilter = f; this._render(); }
    setKundentypFilter(k)            { this._ktFilter = k; this._render(); }
    expandAll()                      { /* noop – tree always fully expanded */ }
    collapseAll()                    { /* noop */ }

    /* ── SAC Lifecycle ── */
    onCustomWidgetAfterUpdate(changedProps) {
      if (changedProps.myDataSource !== undefined) {
        this._dataSource = changedProps.myDataSource;
        this._extractRows();
      }
      if (changedProps.theme !== undefined)               this.theme = changedProps.theme;
      if (changedProps.wurzelKennzahl !== undefined)      this.wurzelKennzahl = changedProps.wurzelKennzahl;
      if (changedProps.breakdownDimension !== undefined)  this.breakdownDimension = changedProps.breakdownDimension;
      if (changedProps.waehrung !== undefined)            this.waehrung = changedProps.waehrung;
      if (changedProps.dezimalstellen !== undefined)      this.dezimalstellen = changedProps.dezimalstellen;
      if (changedProps.retourenEinbeziehen !== undefined) this.retourenEinbeziehen = changedProps.retourenEinbeziehen;
      this._render();
    }

    onCustomWidgetResize(w, h) { /* layout is CSS-fluid */ }

    /* ── Init ── */
    connectedCallback() {
      this._buildShadow();
      this._applyTheme();
      this._render();
    }

    _buildShadow() {
      const style = document.createElement('style');
      style.textContent = CSS;
      this._shadow.appendChild(style);
      const host = document.createElement('div');
      host.className = 'shell';
      host.id = '_shell';
      this._shadow.appendChild(host);
    }

    _shell() { return this._shadow.getElementById('_shell'); }

    _applyTheme() {
      this.setAttribute('data-theme', this._props.theme || 'dark');
    }

    /* ── Data extraction from SAC result set ── */
    _extractRows() {
      this._rows = [];
      if (!this._dataSource) return;
      const raw = parseResultSet(this._dataSource);
      if (raw) this._rows = raw;
    }

    /* ── Active rows (with optional retoure filter) ── */
    _activeRows() {
      let rows = this._rows;
      if (!this._props.retourenEinbeziehen) {
        rows = rows.filter(r => (r.dimension_retoure ?? '').toLowerCase() !== 'ja');
      }
      if (this._filialeFilter) {
        rows = rows.filter(r => r.dimension_filiale === this._filialeFilter);
      }
      if (this._ktFilter) {
        rows = rows.filter(r => r.dimension_kundentyp === this._ktFilter);
      }
      return rows;
    }

    /* ── Rendering ── */
    _render() {
      const shell = this._shell();
      if (!shell) return;
      shell.innerHTML = '';

      /* Demo data when no real SAC data is bound */
      let rows = this._activeRows();
      const hasData = rows.length > 0;
      if (!hasData) rows = this._demoRows();

      const total = aggregate(rows);
      const dec   = this._props.dezimalstellen;

      /* ── Header ── */
      const hdr = document.createElement('div');
      hdr.className = 'hdr';
      hdr.innerHTML = `
        <span class="hdr-title">Werttreiberbaum · Filialumsatz</span>
        <span class="hdr-eq">Umsatz&nbsp;=&nbsp;Bons × Bonwert&nbsp;=&nbsp;Bons × Artikel/Bon × Ø Preis</span>
        ${!hasData ? '<span class="chip on" style="background:var(--amber-bg);color:var(--amber);border-color:var(--amber)">Demo-Daten</span>' : ''}
      `;
      shell.appendChild(hdr);

      /* ── Filter bar ── */
      const filters = document.createElement('div');
      filters.className = 'filters';
      filters.innerHTML = `<span class="filter-label">Kundentyp:</span>`;

      const ktOptions = ['Alle', 'Privatkunde', 'Grosskunde'];
      ktOptions.forEach(kt => {
        const c = document.createElement('span');
        c.className = 'chip' + ((!this._ktFilter && kt === 'Alle') || this._ktFilter === kt ? ' on' : '');
        c.textContent = kt;
        c.addEventListener('click', () => {
          this._ktFilter = kt === 'Alle' ? '' : kt;
          this._render();
        });
        filters.appendChild(c);
      });

      // Filiale chips
      const filialen = [...new Set(this._rows.map(r => r.dimension_filiale).filter(Boolean))].sort();
      if (filialen.length > 1) {
        const sep = document.createElement('span'); sep.style.color='var(--border2)'; sep.textContent='|'; filters.appendChild(sep);
        const fl = document.createElement('span'); fl.className='filter-label'; fl.textContent='Filiale:'; filters.appendChild(fl);
        ['Alle', ...filialen].forEach(f => {
          const c = document.createElement('span');
          c.className = 'chip' + ((!this._filialeFilter && f==='Alle') || this._filialeFilter===f ? ' on' : '');
          c.textContent = f;
          c.addEventListener('click', () => { this._filialeFilter = f==='Alle' ? '' : f; this._render(); });
          filters.appendChild(c);
        });
      }
      // Retouren toggle
      const sep2 = document.createElement('span'); sep2.style.color='var(--border2)'; sep2.textContent='|'; filters.appendChild(sep2);
      const rt = document.createElement('span');
      rt.className = 'chip' + (this._props.retourenEinbeziehen ? ' on' : '');
      rt.textContent = 'inkl. Retouren';
      rt.addEventListener('click', () => { this._props.retourenEinbeziehen = !this._props.retourenEinbeziehen; this._render(); });
      filters.appendChild(rt);
      shell.appendChild(filters);

      /* ── Canvas ── */
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      shell.appendChild(canvas);

      /* ── Tree ── */
      const tree = document.createElement('div');
      tree.className = 'tree-root';
      canvas.appendChild(tree);

      /* ── LEVEL 0: Root (Umsatz Netto) ── */
      this._renderRootBlock(tree, total, dec);

      /* ── LEVEL 1: Bons × Bonwert ── */
      this._renderL1Block(tree, total, rows, dec);

      /* ── LEVEL 2: Breakdown by chosen dimension ── */
      this._renderBreakdownBlock(tree, rows, total, dec);

      /* ── Footer info ── */
      const info = document.createElement('div');
      info.style.cssText = 'font-size:10px;color:var(--ink3);margin-top:16px;font-family:monospace;';
      info.textContent = `${rows.length} Transaktionen · ${!hasData ? 'Demo-Daten (keine SAC-Quelle gebunden)' : 'Live-Daten'}`;
      canvas.appendChild(info);
    }

    /* ── Root block ── */
    _renderRootBlock(tree, kpi, dec) {
      const sec = document.createElement('div');
      sec.className = 'section-hdr'; sec.textContent = 'Ergebnis'; tree.appendChild(sec);
      const row = document.createElement('div'); row.className = 'level'; tree.appendChild(row);
      row.appendChild(this._nodeEl({
        eyebrow: 'Wurzel',
        label: 'Umsatz Netto',
        value: fmt(kpi.umsatzNetto, dec, this._props.waehrung),
        sub: `Brutto: ${fmt(kpi.umsatzBrutto, dec, this._props.waehrung)} · Rabatt: ${fmt(kpi.rabatt, dec, this._props.waehrung)} (${(kpi.rabattQ*100).toFixed(1)} %)`,
        cls: 'root-node',
      }));
    }

    /* ── Level 1: Bons × Bonwert ── */
    _renderL1Block(tree, kpi, rows, dec) {
      const sec = document.createElement('div');
      sec.className = 'section-hdr'; sec.textContent = 'Zerlegung Ebene 1 – Bons × Bonwert'; tree.appendChild(sec);
      const row = document.createElement('div'); row.className = 'level'; tree.appendChild(row);

      // Bons
      row.appendChild(this._nodeEl({
        eyebrow: 'Treiber 1',
        label: 'Anzahl Bons',
        value: fmtN(kpi.anzahlBons),
        unit: 'Bons',
        sub: `Privat: ${fmtN(this._aggregate(rows, r=>r.dimension_kundentyp==='Privatkunde').anzahlBons)} · Groß: ${fmtN(this._aggregate(rows, r=>r.dimension_kundentyp==='Grosskunde').anzahlBons)}`,
      }));

      // Operator ×
      row.appendChild(this._opEl('×'));

      // Bonwert
      row.appendChild(this._nodeEl({
        eyebrow: 'Treiber 2',
        label: 'Ø Bonwert',
        value: fmt(kpi.bonwert, dec, this._props.waehrung),
        sub: `${fmtN(kpi.artProBon, 1)} Artikel/Bon × ${fmt(kpi.stueckpreis, dec, this._props.waehrung)}/Stk`,
      }));

      /* ── L1b: Artikel/Bon × Stueckpreis ── */
      const sec2 = document.createElement('div');
      sec2.className = 'section-hdr'; sec2.textContent = 'Zerlegung Ebene 2 – Artikel/Bon × Ø Stueckpreis'; tree.appendChild(sec2);
      const row2 = document.createElement('div'); row2.className = 'level'; tree.appendChild(row2);

      row2.appendChild(this._nodeEl({
        eyebrow: 'Treiber 2a',
        label: 'Artikel pro Bon',
        value: fmtN(kpi.artProBon, 2),
        unit: 'Stk/Bon',
        sub: `Gesamt Artikel: ${fmtN(kpi.anzahlArtikel)}`,
      }));
      row2.appendChild(this._opEl('×'));
      row2.appendChild(this._nodeEl({
        eyebrow: 'Treiber 2b',
        label: 'Ø Stückpreis',
        value: fmt(kpi.stueckpreis, dec, this._props.waehrung),
        sub: `Umsatz/m²: ${fmt(kpi.umsatzQm, 2, this._props.waehrung + '/m²')}`,
      }));
    }

    /* ── Breakdown block ── */
    _renderBreakdownBlock(tree, rows, total, dec) {
      const dimMap = {
        filiale:       { key: 'dimension_filiale',       label: 'Filiale' },
        kundentyp:     { key: 'dimension_kundentyp',     label: 'Kundentyp' },
        warenkategorie:{ key: 'dimension_warenkategorie', label: 'Warenkategorie' },
        ma_position:   { key: 'dimension_ma_position',   label: 'MA-Position' },
        standorttyp:   { key: 'dimension_standorttyp',   label: 'Standorttyp' },
        region:        { key: 'dimension_region',         label: 'Region' },
      };
      const dim = dimMap[this._props.breakdownDimension] || dimMap.filiale;

      const sec = document.createElement('div');
      sec.className = 'section-hdr';
      sec.textContent = `Aufriß nach ${dim.label}`;
      tree.appendChild(sec);

      const grouped = groupBy(rows, dim.key);
      // Sort by umsatz desc
      const entries = [...grouped.entries()]
        .map(([k, v]) => ({ label: k, kpi: aggregate(v) }))
        .sort((a, b) => b.kpi.umsatzNetto - a.kpi.umsatzNetto);

      const bd = document.createElement('div');
      bd.className = 'breakdown';
      tree.appendChild(bd);

      entries.forEach(({ label, kpi }) => {
        const share = total.umsatzNetto > 0 ? kpi.umsatzNetto / total.umsatzNetto : 0;
        const el = document.createElement('div');
        const posNeg = kpi.umsatzNetto >= 0 ? 'pos' : 'neg';
        el.className = `breakdown-item ${posNeg}`;
        el.innerHTML = `
          <div class="bi-label">${label}</div>
          <div class="bi-value">${fmt(kpi.umsatzNetto, dec, this._props.waehrung)}</div>
          <div class="bi-share">${pct(share)} vom Gesamt</div>
          <div class="bi-share">${fmtN(kpi.anzahlBons)} Bons · ${fmt(kpi.bonwert, dec, this._props.waehrung)}/Bon</div>
        `;
        bd.appendChild(el);
      });

      /* ── Warenkategorie immer als zweiten Aufriß ── */
      if (this._props.breakdownDimension !== 'warenkategorie') {
        const sec2 = document.createElement('div');
        sec2.className = 'section-hdr';
        sec2.textContent = 'Aufriß nach Warenkategorie';
        tree.appendChild(sec2);

        const grouped2 = groupBy(rows, 'dimension_warenkategorie');
        const entries2 = [...grouped2.entries()]
          .map(([k, v]) => ({ label: k, kpi: aggregate(v) }))
          .sort((a, b) => b.kpi.umsatzNetto - a.kpi.umsatzNetto);

        const bd2 = document.createElement('div');
        bd2.className = 'breakdown';
        tree.appendChild(bd2);

        entries2.forEach(({ label, kpi }) => {
          const share = total.umsatzNetto > 0 ? kpi.umsatzNetto / total.umsatzNetto : 0;
          const el = document.createElement('div');
          el.className = 'breakdown-item pos';
          el.innerHTML = `
            <div class="bi-label">${label}</div>
            <div class="bi-value">${fmt(kpi.umsatzNetto, dec, this._props.waehrung)}</div>
            <div class="bi-share">${pct(share)}</div>
            <div class="bi-share">${fmtN(kpi.anzahlArtikel)} Artikel</div>
          `;
          bd2.appendChild(el);
        });
      }
    }

    /* ── DOM helpers ── */
    _nodeEl({ eyebrow, label, value, unit = '', sub = '', cls = '' }) {
      const el = document.createElement('div');
      el.className = `node ${cls}`;
      el.innerHTML = `
        <div class="node-eyebrow">${eyebrow}</div>
        <div class="node-label">${label}</div>
        <div class="node-value${value.length > 12 ? ' dim' : ''}">${value}${unit ? `<span class="node-unit">${unit}</span>` : ''}</div>
        ${sub ? `<div class="node-sub">${sub}</div>` : ''}
      `;
      return el;
    }

    _opEl(symbol) {
      const el = document.createElement('div');
      el.className = 'op-col';
      el.innerHTML = `<div class="op-line"></div><div class="op-badge">${symbol}</div><div class="op-line"></div>`;
      return el;
    }

    _aggregate(rows, filterFn) { return aggregate(rows, filterFn); }

    /* ── Demo data (shown when no SAC source is bound) ── */
    _demoRows() {
      const cats = ['Holz & Bauelemente','Werkzeuge & Maschinen','Farben & Tapeten',
                    'Garten & Pflanzen','Sanitaer & Installation','Elektro & Leuchten',
                    'Eisenwaren & Befestigung','Baustoffe','Bodenbelaege & Fliesen'];
      const filialen = ['F01','F02','F03'];
      const regions  = { F01:'Nord', F02:'Mitte', F03:'Sued' };
      const std      = { F01:'Gewerbegebiet', F02:'Stadtrand', F03:'Innenstadt' };
      const ktypes   = ['Privatkunde','Grosskunde'];
      const pos      = ['Fachberatung','Verkauf','Kasse','Teamleitung'];
      const rows = [];
      const rnd = (a,b) => a + Math.random()*(b-a);
      for (let i = 0; i < 300; i++) {
        const f = filialen[i % 3];
        const isGK = Math.random() < (f==='F01'?.42:f==='F02'?.28:.14);
        const kat  = cats[Math.floor(Math.random()*cats.length)];
        const stk  = Math.round(rnd(1, isGK?20:8));
        const preis = rnd(6, 50);
        const brutto = stk * preis;
        const rabatt = brutto * (isGK ? rnd(.08,.20) : rnd(0,.06));
        const netto  = brutto - rabatt;
        rows.push({
          dimension_filiale:        f,
          dimension_region:         regions[f],
          dimension_standorttyp:    std[f],
          dimension_kundentyp:      isGK ? 'Grosskunde' : 'Privatkunde',
          dimension_warenkategorie: kat,
          dimension_retoure:        Math.random()<.025 ? 'Ja' : 'Nein',
          dimension_ma_position:    pos[Math.floor(Math.random()*pos.length)],
          value_umsatz_netto:       +netto.toFixed(2),
          value_umsatz_brutto:      +brutto.toFixed(2),
          value_rabatt:             +rabatt.toFixed(2),
          value_anzahl_artikel:     stk,
          value_anzahl_bons:        1,
          value_verkaufsflaeche:    f==='F01'?8200:f==='F02'?5600:3400,
        });
      }
      return rows;
    }
  }

  customElements.define('werttreiberbaum-widget', WerttreiberWidget);
})();
