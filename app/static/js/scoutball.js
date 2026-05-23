/* ScoutBall — interactive FIFA WC 2022 dashboard */

const ACCENT   = '#06b6d4';
const ACCENT2  = '#f59e0b';
const ACCENT3  = '#a78bfa';
const DIM      = '#64748b';
const MUTED    = '#94a3b8';
const BG       = '#0a0e1a';
const CARD_BG  = '#111827';
const GRID_CLR = '#1e293b';

const PLOTLY_LAYOUT_BASE = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font: { family: 'Inter, sans-serif', color: MUTED, size: 12 },
  margin: { t: 10, r: 20, b: 40, l: 50 },
};

const STATS_CONFIG = {
  GK: {
    keys:   ['save_pct','clean_sheets_pct','goals_against_per90','saves','wins','minutes_90s'],
    labels: ['Save %','Clean Sheet %','Goals Against/90','Saves','Wins','90s Played'],
  },
  DF: {
    keys:   ['tackles_won','interceptions','clearances','blocks','dribble_tackles_pct','minutes_90s'],
    labels: ['Tackles Won','Interceptions','Clearances','Blocks','Dribble Tackle %','90s Played'],
  },
  MF: {
    keys:   ['passes_pct','progressive_passes','assists','xg_assist','passes_into_final_third','goals_assists_per90'],
    labels: ['Pass Accuracy %','Progressive Passes','Assists','xG Assist','Passes to Final Third','G+A / 90'],
  },
  FW: {
    keys:   ['goals_assists_per90','shots_on_target_pct','xg','npxg_per_shot','goals_per_shot','shots_per90'],
    labels: ['G+A / 90','Shots on Target %','xG','npxG / Shot','Goals / Shot','Shots / 90'],
  },
};

const RADAR_COLORS = [ACCENT, ACCENT2, ACCENT3];

/* ── State ──────────────────────────────────────────────────── */
let allPlayers     = [];
let filteredPlayers = [];
let currentPos     = 'FW';
let ageMin         = 18;
let ageMax         = 45;
let statFilters    = {};   // key → [min, max]
let statRanges     = {};   // key → {min, max} across current position
let radarPlayers   = [];   // up to 3 player objects
let primaryPlayer  = null; // single selected for card

/* ── Boot ───────────────────────────────────────────────────── */
fetch('/static/data/scoutball_data.json')
  .then(r => r.json())
  .then(data => {
    allPlayers = data.players;
    buildChoropleth(data.country_counts);
    switchPosition('FW');
    initSwarmListener();
    initParallelListener();
    initSearch();
  });

/* ── Position tabs ──────────────────────────────────────────── */
document.querySelectorAll('.pos-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pos-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    radarPlayers = [];
    primaryPlayer = null;
    switchPosition(btn.dataset.pos);
  });
});

function switchPosition(pos) {
  currentPos = pos;
  statFilters = {};
  buildStatSliders();
  applyFilters();
}

/* ── Age sliders ────────────────────────────────────────────── */
document.getElementById('age-min').addEventListener('input', onAgeChange);
document.getElementById('age-max').addEventListener('input', onAgeChange);

function onAgeChange() {
  ageMin = parseInt(document.getElementById('age-min').value);
  ageMax = parseInt(document.getElementById('age-max').value);
  if (ageMin > ageMax) {
    ageMin = ageMax;
    document.getElementById('age-min').value = ageMin;
  }
  document.getElementById('age-label').textContent = `${ageMin} – ${ageMax}`;
  applyFilters();
}

/* ── Stat sliders ───────────────────────────────────────────── */
function buildStatSliders() {
  const cfg = STATS_CONFIG[currentPos];
  const posPlayers = allPlayers.filter(p => p.position === currentPos);

  statRanges = {};
  cfg.keys.forEach(k => {
    const vals = posPlayers.map(p => p.stats[k] || 0);
    statRanges[k] = { min: Math.min(...vals), max: Math.max(...vals) };
    statFilters[k] = [statRanges[k].min, statRanges[k].max];
  });

  const container = document.getElementById('stat-sliders');
  container.innerHTML = '';

  cfg.keys.forEach((k, i) => {
    const r = statRanges[k];
    const label = cfg.labels[i];
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label style="font-size:0.78rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.07em;">
        ${label}: <span id="sl-label-${k}">${fmt(r.min)} – ${fmt(r.max)}</span>
      </label>
      <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.4rem;">
        <input type="range" id="sl-min-${k}" min="${r.min}" max="${r.max}" value="${r.min}" step="${step(r.min,r.max)}" style="flex:1; accent-color:var(--accent);">
        <input type="range" id="sl-max-${k}" min="${r.min}" max="${r.max}" value="${r.max}" step="${step(r.min,r.max)}" style="flex:1; accent-color:var(--accent);">
      </div>`;
    container.appendChild(wrap);

    document.getElementById(`sl-min-${k}`).addEventListener('input', () => onStatChange(k));
    document.getElementById(`sl-max-${k}`).addEventListener('input', () => onStatChange(k));
  });
}

function onStatChange(k) {
  let lo = parseFloat(document.getElementById(`sl-min-${k}`).value);
  let hi = parseFloat(document.getElementById(`sl-max-${k}`).value);
  if (lo > hi) { lo = hi; document.getElementById(`sl-min-${k}`).value = lo; }
  statFilters[k] = [lo, hi];
  document.getElementById(`sl-label-${k}`).textContent = `${fmt(lo)} – ${fmt(hi)}`;
  applyFilters();
}

/* ── Filter logic ───────────────────────────────────────────── */
function applyFilters() {
  const cfg = STATS_CONFIG[currentPos];
  filteredPlayers = allPlayers.filter(p => {
    if (p.position !== currentPos) return false;
    if (p.age < ageMin || p.age > ageMax) return false;
    for (const k of cfg.keys) {
      const [lo, hi] = statFilters[k] || [0, 1e9];
      const v = p.stats[k] || 0;
      if (v < lo || v > hi) return false;
    }
    return true;
  });
  renderAll();
}

/* ── Overall score (normalised mean) ────────────────────────── */
function overallScore(player) {
  const cfg = STATS_CONFIG[currentPos];
  let sum = 0;
  cfg.keys.forEach(k => {
    const r = statRanges[k];
    const range = r.max - r.min;
    const v = player.stats[k] || 0;
    sum += range > 0 ? (v - r.min) / range : 0;
  });
  return (sum / cfg.keys.length) * 100;
}

/* ── Render all charts ──────────────────────────────────────── */
function renderAll() {
  renderSwarm();
  renderParallel();
  renderRadar();
  updatePlayerCard();
  updateRadarList();
}

/* ── Swarm plot ─────────────────────────────────────────────── */
function renderSwarm() {
  const scores  = filteredPlayers.map(overallScore);
  const names   = filteredPlayers.map(p => p.player);
  const nations = filteredPlayers.map(p => p.nationality);
  const ages    = filteredPlayers.map(p => p.age);
  const clubs   = filteredPlayers.map(p => p.club);
  const games   = filteredPlayers.map(p => p.games);

  // jitter y so dots don't stack
  const jitter = scores.map(() => (Math.random() - 0.5) * 0.6);

  const radarNames = new Set(radarPlayers.map(p => p.player));
  const colors = filteredPlayers.map((p, i) => {
    const ri = radarPlayers.findIndex(r => r.player === p.player);
    if (ri >= 0) return RADAR_COLORS[ri];
    return scores[i] > 60 ? ACCENT : (scores[i] > 35 ? '#1e40af' : DIM);
  });
  const sizes = filteredPlayers.map(p => radarNames.has(p.player) ? 10 : 6);

  const customdata = filteredPlayers.map((p, i) => [p.player, nations[i], ages[i], clubs[i], games[i], scores[i].toFixed(1)]);

  const trace = {
    type: 'scatter',
    mode: 'markers',
    x: scores,
    y: jitter,
    marker: { color: colors, size: sizes, opacity: 0.85, line: { width: 0 } },
    customdata,
    hovertemplate:
      '<b>%{customdata[0]}</b><br>' +
      '%{customdata[1]} · Age %{customdata[2]}<br>' +
      'Club: %{customdata[3]}<br>' +
      'Games: %{customdata[4]}<br>' +
      'Score: %{customdata[5]}<extra></extra>',
    text: names,
  };

  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    margin: { t: 10, r: 20, b: 50, l: 60 },
    xaxis: {
      title: { text: 'Overall Score (0–100)', font: { color: MUTED } },
      gridcolor: GRID_CLR, zerolinecolor: GRID_CLR, color: MUTED, range: [-5, 105],
    },
    yaxis: { visible: false, range: [-1, 1] },
    showlegend: false,
  };

  Plotly.react('swarm-chart', [trace], layout, { responsive: true, displayModeBar: false });
}

/* ── Swarm click listener (attached once on boot) ───────────── */
function initSwarmListener() {
  document.getElementById('swarm-chart').on('plotly_click', data => {
    const pt = data.points[0];
    const idx = pt.pointIndex;
    const player = filteredPlayers[idx];
    toggleRadarPlayer(player);
    primaryPlayer = player;
    renderSwarm();
    renderParallel();
    updatePlayerCard();
    updateRadarList();
    renderRadar();
  });
}

/* ── Parallel coordinates ───────────────────────────────────── */
let _parallelHoveredIdx   = null;
let _parallelHoveredTrace = 0;

function renderParallel() {
  const cfg = STATS_CONFIG[currentPos];

  const source = radarPlayers.length > 0
    ? radarPlayers.filter(p => p.position === currentPos)
    : filteredPlayers;

  const layout = { ...PLOTLY_LAYOUT_BASE, margin: { t: 60, r: 30, b: 30, l: 30 } };

  if (source.length === 0) {
    const msg = radarPlayers.length > 0 ? 'Selected players are from a different position' : 'No players match the current filters';
    Plotly.react('parallel-chart', [], {
      ...layout,
      annotations: [{ text: msg, showarrow: false, font: { color: DIM, size: 13 }, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5 }],
    }, { responsive: true, displayModeBar: false });
    return;
  }

  // Fixed axis ranges based on all players in position (consistent across filter changes)
  const posPlayers = allPlayers.filter(p => p.position === currentPos);
  const ranges = {};
  cfg.keys.forEach(k => {
    const vals = posPlayers.map(p => p.stats[k] || 0);
    const mn = vals.length ? Math.min(...vals) : 0;
    let   mx = vals.length ? Math.max(...vals) : 1;
    if (mx === mn) mx = mn + 1;
    ranges[k] = [mn, mx];
  });

  let trace;

  if (radarPlayers.length > 0) {
    const n = source.length;
    // Map each player index to a normalised position [0..1] in the colorscale
    const colorVals = source.map((_, i) => (n === 1 ? 0 : i / (n - 1)));
    const colorscale = n === 1
      ? [[0, RADAR_COLORS[0]], [1, RADAR_COLORS[0]]]
      : source.map((_, i) => [i / (n - 1), RADAR_COLORS[i]]);

    trace = {
      type: 'parcoords',
      line: { color: colorVals, colorscale, showscale: false, width: 3 },
      labelfont: { color: MUTED, size: 11 },
      tickfont:  { color: DIM,   size: 10 },
      dimensions: cfg.keys.map((k, j) => ({
        label:  cfg.labels[j],
        values: source.map(p => p.stats[k] || 0),
        range:  ranges[k],
      })),
    };
  } else {
    const scores = filteredPlayers.map(overallScore);
    trace = {
      type: 'parcoords',
      line: { color: scores, colorscale: [[0,'#1e3a5f'],[0.5, ACCENT],[1,'#f59e0b']], showscale: false },
      labelfont: { color: MUTED, size: 11 },
      tickfont:  { color: DIM,   size: 10 },
      dimensions: cfg.keys.map((k, j) => ({
        label:  cfg.labels[j],
        values: filteredPlayers.map(p => p.stats[k] || 0),
        range:  ranges[k],
      })),
    };
  }

  Plotly.react('parallel-chart', [trace], layout, { responsive: true, displayModeBar: false });
  updateParallelLegend(source);
}

function updateParallelLegend(source) {
  const el = document.getElementById('parallel-legend');
  if (!el) return;
  if (radarPlayers.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = source.map((p, i) => `
    <div style="display:flex; align-items:center; gap:0.45rem; font-size:0.82rem;">
      <span style="width:22px; height:3px; background:${RADAR_COLORS[i]}; border-radius:2px; flex-shrink:0;"></span>
      <span style="color:var(--muted);">${p.player}</span>
    </div>`).join('');
}

/* ── Parallel click listener (attached once on boot) ─────────── */
function initParallelListener() {
  const el = document.getElementById('parallel-chart');

  el.on('plotly_hover', data => {
    if (data.points && data.points.length > 0) {
      _parallelHoveredIdx   = data.points[0].pointIndex;
      _parallelHoveredTrace = data.points[0].curveNumber || 0;
      el.style.cursor = 'pointer';
    }
  });
  el.on('plotly_unhover', () => {
    _parallelHoveredIdx = null;
    el.style.cursor = '';
  });
  el.addEventListener('click', () => {
    if (_parallelHoveredIdx === null) return;
    let player;
    if (radarPlayers.length > 0) {
      const source = radarPlayers.filter(p => p.position === currentPos);
      player = source[_parallelHoveredIdx];  // single trace: pointIndex is the player index
    } else {
      player = filteredPlayers[_parallelHoveredIdx];
    }
    if (!player) return;
    toggleRadarPlayer(player);
    primaryPlayer = player;
    renderSwarm();
    renderParallel();
    renderRadar();
    updatePlayerCard();
    updateRadarList();
  });
}

/* ── Radar chart ────────────────────────────────────────────── */
function renderRadar() {
  const cfg = STATS_CONFIG[currentPos];

  if (radarPlayers.length === 0) {
    Plotly.react('radar-chart', [], {
      ...PLOTLY_LAYOUT_BASE,
      annotations: [{
        text: 'Select players from the swarm plot',
        showarrow: false, font: { color: DIM, size: 14 },
        xref: 'paper', yref: 'paper', x: 0.5, y: 0.5,
      }],
    }, { responsive: true, displayModeBar: false });
    return;
  }

  const traces = radarPlayers.map((player, i) => {
    const normalized = cfg.keys.map(k => {
      const r = statRanges[k];
      const range = r.max - r.min;
      const v = player.stats[k] || 0;
      return range > 0 ? ((v - r.min) / range) * 100 : 0;
    });
    normalized.push(normalized[0]); // close polygon
    const lbls = [...cfg.labels, cfg.labels[0]];

    return {
      type: 'scatterpolar',
      r: normalized,
      theta: lbls,
      fill: 'toself',
      name: player.player,
      line: { color: RADAR_COLORS[i], width: 2 },
      fillcolor: RADAR_COLORS[i] + '33',
      hovertemplate: `<b>${player.player}</b><br>%{theta}: %{r:.1f}<extra></extra>`,
    };
  });

  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    margin: { t: 30, r: 60, b: 30, l: 60 },
    polar: {
      bgcolor: 'transparent',
      radialaxis: { visible: true, range: [0,100], gridcolor: GRID_CLR, linecolor: GRID_CLR, tickfont: { color: DIM, size: 10 } },
      angularaxis: { gridcolor: GRID_CLR, linecolor: GRID_CLR, tickfont: { color: MUTED, size: 11 } },
    },
    legend: { font: { color: MUTED }, bgcolor: 'transparent' },
    showlegend: true,
  };

  Plotly.react('radar-chart', traces, layout, { responsive: true, displayModeBar: false });
}

/* ── Choropleth ─────────────────────────────────────────────── */
function buildChoropleth(countryCounts) {
  const locations = countryCounts.map(c => c.code);
  const z         = countryCounts.map(c => c.count);
  const text      = countryCounts.map(c => `${c.country}: ${c.count} players`);

  const trace = {
    type: 'choropleth',
    locations,
    z,
    text,
    hovertemplate: '%{text}<extra></extra>',
    colorscale: [[0,'#0f172a'],[0.3,'#164e63'],[0.7, ACCENT],[1,'#f0f9ff']],
    showscale: true,
    colorbar: { tickfont: { color: MUTED }, outlinewidth: 0, thickness: 12 },
  };

  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    margin: { t: 0, r: 0, b: 0, l: 0 },
    geo: {
      showframe: false,
      showcoastlines: true,
      coastlinecolor: GRID_CLR,
      bgcolor: 'transparent',
      showland: true,
      landcolor: '#0f172a',
      showocean: true,
      oceancolor: BG,
      showcountries: true,
      countrycolor: GRID_CLR,
      projection: { type: 'natural earth' },
    },
  };

  Plotly.react('choropleth-chart', [trace], layout, { responsive: true, displayModeBar: false });
}

/* ── Player card ────────────────────────────────────────────── */
function updatePlayerCard() {
  const p = primaryPlayer;
  if (!p) return;

  document.getElementById('pc-name').textContent = p.player;

  const cfg    = STATS_CONFIG[currentPos];
  const score  = overallScore(p).toFixed(1);
  const flag   = countryFlag(p.nationality);

  let statsHtml = cfg.keys.map((k, i) =>
    `<div style="display:flex; justify-content:space-between;">
       <span>${cfg.labels[i]}</span>
       <span style="color:var(--text); font-weight:600;">${fmt(p.stats[k] || 0)}</span>
     </div>`
  ).join('');

  document.getElementById('pc-details').innerHTML = `
    <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:0.75rem;">
      <span>${flag} ${p.nationality}</span>
      <span>Age ${p.age}</span>
      <span>${p.club}</span>
      <span>${p.games} games</span>
    </div>
    <div style="font-size:1.4rem; font-weight:800; color:var(--accent); margin-bottom:0.75rem;">
      Score: ${score}
    </div>
    <div style="font-size:0.82rem; line-height:1.9;">${statsHtml}</div>
  `;
}

/* ── Radar list ─────────────────────────────────────────────── */
function updateRadarList() {
  const el = document.getElementById('radar-list');
  if (radarPlayers.length === 0) {
    el.innerHTML = '<span style="color:var(--dim); font-size:0.875rem;">No players selected yet.</span>';
    return;
  }
  el.innerHTML = radarPlayers.map((p, i) => `
    <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.875rem;">
      <span style="width:10px; height:10px; border-radius:50%; background:${RADAR_COLORS[i]}; flex-shrink:0;"></span>
      <span style="color:var(--text);">${p.player}</span>
      <button onclick="removeRadarPlayer(${i})"
        style="margin-left:auto; background:none; border:none; color:var(--dim); cursor:pointer; font-size:0.9rem;">✕</button>
    </div>`).join('');
}

/* ── Radar player management ─────────────────────────────────── */
function toggleRadarPlayer(player) {
  const idx = radarPlayers.findIndex(p => p.player === player.player);
  if (idx >= 0) {
    radarPlayers.splice(idx, 1);
  } else if (radarPlayers.length < 3) {
    radarPlayers.push(player);
  }
}

function removeRadarPlayer(i) {
  radarPlayers.splice(i, 1);
  renderSwarm();
  renderParallel();
  renderRadar();
  updateRadarList();
}

/* ── Search bar ──────────────────────────────────────────────── */
function initSearch() {
  const input    = document.getElementById('player-search');
  const dropdown = document.getElementById('search-dropdown');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { dropdown.style.display = 'none'; return; }

    const matches = allPlayers
      .filter(p => p.position === currentPos && p.player.toLowerCase().includes(q))
      .slice(0, 10);

    if (!matches.length) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matches.map(p => {
      const alreadyIn = radarPlayers.some(r => r.player === p.player);
      const full      = radarPlayers.length >= 3 && !alreadyIn;
      return `<div class="search-result" data-player="${p.player}"
        style="padding:0.55rem 1rem; cursor:${full ? 'not-allowed' : 'pointer'};
               opacity:${full ? 0.4 : 1}; font-size:0.875rem;
               border-bottom:1px solid var(--border); display:flex; justify-content:space-between;
               align-items:center; transition:background 0.15s;"
        onmouseover="if(!${full})this.style.background='var(--card-hover)'"
        onmouseout="this.style.background=''">
        <span style="color:var(--text);">${p.player}</span>
        <span style="color:var(--dim); font-size:0.78rem;">${p.nationality} · ${p.club}</span>
      </div>`;
    }).join('');

    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.search-result').forEach(el => {
      el.addEventListener('click', () => {
        const name   = el.dataset.player;
        const player = allPlayers.find(p => p.player === name);
        if (!player) return;
        if (radarPlayers.length >= 3 && !radarPlayers.some(r => r.player === name)) return;
        toggleRadarPlayer(player);
        primaryPlayer = player;
        renderSwarm();
        renderParallel();
        renderRadar();
        updatePlayerCard();
        updateRadarList();
        dropdown.style.display = 'none';
        input.value = '';
      });
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#player-search') && !e.target.closest('#search-dropdown')) {
      dropdown.style.display = 'none';
    }
  });
}

/* ── Helpers ─────────────────────────────────────────────────── */
function fmt(v) {
  if (v === null || v === undefined) return '—';
  return Number.isInteger(v) ? v.toString() : parseFloat(v).toFixed(2);
}

function step(min, max) {
  const range = max - min;
  if (range <= 1) return 0.01;
  if (range <= 10) return 0.1;
  return 1;
}

function countryFlag(nationality) {
  const flags = {
    'Argentina':'🇦🇷','Australia':'🇦🇺','Belgium':'🇧🇪','Brazil':'🇧🇷','Cameroon':'🇨🇲',
    'Canada':'🇨🇦','Costa Rica':'🇨🇷','Croatia':'🇭🇷','Denmark':'🇩🇰','Ecuador':'🇪🇨',
    'England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','France':'🇫🇷','Germany':'🇩🇪','Ghana':'🇬🇭','Iran':'🇮🇷',
    'Japan':'🇯🇵','South Korea':'🇰🇷','Mexico':'🇲🇽','Morocco':'🇲🇦','Netherlands':'🇳🇱',
    'Poland':'🇵🇱','Portugal':'🇵🇹','Qatar':'🇶🇦','Saudi Arabia':'🇸🇦','Senegal':'🇸🇳',
    'Serbia':'🇷🇸','Spain':'🇪🇸','Switzerland':'🇨🇭','Tunisia':'🇹🇳','United States':'🇺🇸',
    'Uruguay':'🇺🇾','Wales':'🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  };
  return flags[nationality] || '';
}
