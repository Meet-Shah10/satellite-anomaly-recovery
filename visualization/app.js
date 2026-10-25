/**
 * app.js — Main application controller
 * Handles nav, pipeline animation, search animation, results charts & table
 */

// ══════════════════════════════════════════════════════════════════════════════
// Navigation
// ══════════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const sec = btn.dataset.section;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const sEl = document.getElementById('section-' + sec);
    if (sEl) sEl.classList.add('active');
    if (sec === 'results') initResults();
    if (sec === 'search')  resetSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE SECTION
// ══════════════════════════════════════════════════════════════════════════════
let activeScenario = 'single_thermal';
let pipelineRunning = false;
let pipelineStep = -1;
let orbitAnimId = null;
let orbitPhaseAnim = 0;

// ── Scenario card selection
document.querySelectorAll('.scenario-card').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    activeScenario = btn.dataset.scenario;
    resetPipeline();
  });
});

// ── Orbit canvas animation
function startOrbitAnim() {
  if (orbitAnimId) cancelAnimationFrame(orbitAnimId);
  const canvas = document.getElementById('orbitCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2 + 10;
  const rx = W / 2 - 30, ry = H / 2 - 30;
  const satPhase = SCENARIOS[activeScenario].orbitPhase;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Earth
    const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, 38);
    grd.addColorStop(0, '#1e40af'); grd.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, 38, 0, Math.PI*2); ctx.fill();
    // Atmosphere glow
    ctx.strokeStyle = 'rgba(96,165,250,0.3)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI*2); ctx.stroke();

    // Eclipse shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx + 60, cy, 80, ry + 10, 0, -Math.PI/2, Math.PI/2);
    ctx.fill();

    // Orbit path
    ctx.strokeStyle = 'rgba(100,160,255,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);

    // Satellite (animated)
    const phi = orbitPhaseAnim * Math.PI * 2;
    const sx = cx + rx * Math.cos(phi - Math.PI/2);
    const sy = cy + ry * Math.sin(phi - Math.PI/2);

    // Fault position marker
    const fphi = satPhase * Math.PI * 2;
    const fpx = cx + rx * Math.cos(fphi - Math.PI/2);
    const fpy = cy + ry * Math.sin(fphi - Math.PI/2);
    ctx.strokeStyle = 'rgba(239,68,68,0.5)'; ctx.lineWidth = 2;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fpx, fpy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(239,68,68,0.7)';
    ctx.beginPath(); ctx.arc(fpx, fpy, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.font = '10px Inter';
    ctx.fillText('Fault onset', fpx + 8, fpy);

    // Satellite
    const inEclipse = (orbitPhaseAnim % 1) >= 0.65;
    ctx.shadowColor = inEclipse ? 'rgba(100,100,100,0)' : 'rgba(251,191,36,0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = inEclipse ? '#64748b' : '#fbbf24';
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Solar panels
    ctx.fillStyle = inEclipse ? '#334155' : '#3b82f6';
    ctx.fillRect(sx - 16, sy - 2, 10, 5);
    ctx.fillRect(sx + 6, sy - 2, 10, 5);

    // Solar flux indicator
    const flux = orbitSolarFlux(orbitPhaseAnim % 1);
    const sunIco = typeof ICO !== 'undefined' ? ICO.sun : '';
    const moonIco = typeof ICO !== 'undefined' ? ICO.moon : '';
    document.getElementById('solarPower').innerHTML = `${sunIco} P<sub>sol</sub>: ${Math.round(flux)} W`;
    document.getElementById('eclipseStatus').innerHTML = inEclipse ? `${moonIco} Eclipse` : `${sunIco} Sunlit`;
    document.getElementById('orbitPhase').textContent = `φ = ${(orbitPhaseAnim % 1).toFixed(2)}`;

    orbitPhaseAnim += 0.002;
    orbitAnimId = requestAnimationFrame(draw);
  }
  draw();
}

function stopOrbitAnim() {
  if (orbitAnimId) cancelAnimationFrame(orbitAnimId);
  orbitAnimId = null;
}

// ── Build fault display
function buildFaultDisplay(scenarioKey) {
  const sc = SCENARIOS[scenarioKey];
  const el = document.getElementById('faultDisplay');
  el.innerHTML = sc.faults.map(f => `
    <div class="fault-tag">
      <span class="ft-label">${f.label}</span>
      <span class="ft-val">${f.val}</span>
      <span class="ft-label" style="font-size:11px;max-width:160px;">${f.desc}</span>
    </div>
  `).join('');
}

// ── Build telemetry
function buildTelemetry(scenarioKey) {
  const sc = SCENARIOS[scenarioKey];
  const st = sc.initialState;
  const el = document.getElementById('telemetryGrid');

  const NOMINAL = { soc:[0.35,1.0], temp_battery:[-5,40], temp_payload:[-15,55], temp_bus:[-10,50] };
  function classify(key, val) {
    const [lo, hi] = NOMINAL[key] || [0,1];
    if (val < lo || val > hi) return 'tc-bad';
    const margin = Math.min(val - lo, hi - val) / (hi - lo);
    return margin < 0.1 ? 'tc-warn' : 'tc-ok';
  }
  function pct(key, val) {
    if (key === 'soc') return val * 100;
    const [lo, hi] = NOMINAL[key] || [0,100];
    return ((val - lo) / (hi - lo)) * 100;
  }

  const channels = [
    { key: 'soc',          label: 'SoC',           unit: '',    fmt: v => (v*100).toFixed(1) + '%' },
    { key: 'temp_payload', label: 'T Payload',      unit: '°C', fmt: v => v.toFixed(1) + ' °C' },
    { key: 'temp_battery', label: 'T Battery',      unit: '°C', fmt: v => v.toFixed(1) + ' °C' },
    { key: 'temp_bus',     label: 'T Bus',          unit: '°C', fmt: v => v.toFixed(1) + ' °C' },
  ];

  el.innerHTML = channels.map(ch => {
    const val = st[ch.key];
    const cls = classify(ch.key, val);
    const bar = Math.max(0, Math.min(100, pct(ch.key, val)));
    const status = cls === 'tc-bad' 
      ? '<span style="color:var(--danger);font-weight:600;">OUT OF BAND</span>' 
      : (cls === 'tc-warn' 
          ? '<span style="color:var(--warn);font-weight:600;">NEAR LIMIT</span>' 
          : '<span style="color:var(--ok);font-weight:600;">NOMINAL</span>');
    return `
      <div class="telem-card ${cls}">
        <div class="tc-label">${ch.label}</div>
        <div class="tc-value">${ch.fmt(val)}</div>
        <div class="tc-bar-bg"><div class="tc-bar-fg" style="width:${bar}%"></div></div>
        <div class="tc-status">${status}</div>
      </div>
    `;
  }).join('');
}

// ── Update risk scorer panel
function updateRiskPanel(scenarioKey) {
  const sc = SCENARIOS[scenarioKey];
  const risk = sc.riskScore;
  const pct = Math.round(risk * 100);
  document.getElementById('riskScoreValue').textContent = risk.toFixed(2);
  document.getElementById('riskBar').style.width = pct + '%';
  const thumb = document.getElementById('riskThumb');
  if (thumb) thumb.style.left = pct + '%';
  document.getElementById('riskInterp').textContent =
    `Window is more anomalous than ${pct}% of nominal data`;
}

// ── Update heuristic breakdown
function updateHeuristic(scenarioKey) {
  const sc = SCENARIOS[scenarioKey];
  const g0 = 0; // initial node
  const h0 = hd(sc.initialState);
  const r0 = sc.riskScore;
  const lambda = 50;
  const f0 = g0 + h0 + lambda * r0;
  const maxBar = Math.max(h0, 1);

  document.getElementById('hbGVal').textContent  = g0.toFixed(1);
  document.getElementById('hbHdVal').textContent = h0.toFixed(1);
  document.getElementById('hbRVal').textContent  = (lambda * r0).toFixed(1);
  document.getElementById('hbFVal').textContent  = f0.toFixed(1);
  document.getElementById('hbG').style.width  = Math.min(100, (g0 / maxBar) * 100) + '%';
  document.getElementById('hbHd').style.width = Math.min(100, (h0 / maxBar) * 100) + '%';
  document.getElementById('hbR').style.width  = Math.min(100, (lambda * r0 / maxBar) * 100) + '%';
}

// ── Recovery plan display
function showRecoveryPlan(scenarioKey) {
  const sc = SCENARIOS[scenarioKey];
  const el = document.getElementById('recoveryPlan');
  const mEl = document.getElementById('recoveryMetrics');

  el.innerHTML = '';
  sc.recovery.forEach((step, i) => {
    const div = document.createElement('div');
    div.className = 'rp-cmd';
    const icoSvg = (typeof ICO !== 'undefined' && ICO[step.icon]) ? ICO.html(step.icon) : '';
    div.innerHTML = `<span class="cmd-icon">${icoSvg}</span> ${step.action} <small style="color:#52526e;margin-left:4px">(+${step.cost})</small>`;
    el.appendChild(div);
    if (i < sc.recovery.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'rp-arrow';
      arrow.textContent = '→';
      el.appendChild(arrow);
    }
    setTimeout(() => {
      div.classList.add('entered');
      if (el.children[i * 2 + 1]) el.children[i * 2 + 1].classList.add('entered');
    }, 100 + i * 200);
  });

  const m = sc.metrics;
  mEl.innerHTML = `
    <div class="rm-stat"><div class="rm-label">Success</div><div class="rm-value" style="display:flex;align-items:center;gap:6px;color:var(--success);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> REACHED</div></div>
    <div class="rm-stat"><div class="rm-label">Path Cost g</div><div class="rm-value">${m.cost.toFixed(2)}</div></div>
    <div class="rm-stat"><div class="rm-label">Nodes Expanded</div><div class="rm-value">${m.nodes_expanded.toLocaleString()}</div></div>
    <div class="rm-stat"><div class="rm-label">Time to Stable</div><div class="rm-value">${m.time_to_stable} s</div></div>
    <div class="rm-stat"><div class="rm-label">Safety Margin</div><div class="rm-value">${(m.safety_margin * 100).toFixed(1)}%</div></div>
    <div class="rm-stat"><div class="rm-label">Wall Time</div><div class="rm-value">${m.wall_time < 1 ? m.wall_time.toFixed(3) : m.wall_time.toFixed(2)} s</div></div>
  `;
}

// ── Pipeline step runner
const STEP_DELAYS = [600, 500, 600, 700, 700, 800];

async function runPipelineStep(step) {
  // Light up step number badge
  const numEl  = document.getElementById('snum-'  + step);
  const bodyEl = document.getElementById('sbody-' + step);
  if (numEl)  numEl.classList.add('lit');
  if (bodyEl) bodyEl.classList.add('lit');

  if (step === 0) startOrbitAnim();
  if (step === 1) buildFaultDisplay(activeScenario);
  if (step === 2) buildTelemetry(activeScenario);
  if (step === 3) updateRiskPanel(activeScenario);
  if (step === 4) updateHeuristic(activeScenario);
  if (step === 5) showRecoveryPlan(activeScenario);
}

document.getElementById('btnRunPipeline').addEventListener('click', async () => {
  if (pipelineRunning) return;
  pipelineRunning = true;
  document.getElementById('btnRunPipeline').disabled = true;

  for (let i = 0; i <= 5; i++) {
    await runPipelineStep(i);
    await delay(STEP_DELAYS[i]);
  }

  pipelineRunning = false;
  document.getElementById('btnRunPipeline').disabled = false;
});

document.getElementById('btnResetPipeline').addEventListener('click', resetPipeline);

function resetPipeline() {
  stopOrbitAnim();
  pipelineRunning = false;
  pipelineStep = -1;
  document.getElementById('btnRunPipeline').disabled = false;
  // Remove lit class from all step num badges and bodies
  for (let i = 0; i < 6; i++) {
    const n = document.getElementById('snum-'  + i);
    const b = document.getElementById('sbody-' + i);
    if (n) n.classList.remove('lit');
    if (b) b.classList.remove('lit');
  }
  document.getElementById('faultDisplay').innerHTML = '';
  document.getElementById('telemetryGrid').innerHTML = '';
  document.getElementById('recoveryPlan').innerHTML = '';
  document.getElementById('recoveryMetrics').innerHTML = '';
  // Reset risk
  document.getElementById('riskBar').style.width = '0%';
  const t = document.getElementById('riskThumb');
  if (t) t.style.left = '0%';
  document.getElementById('riskScoreValue').textContent = '—';
  document.getElementById('riskInterp').textContent = '';
  document.getElementById('hbGVal').textContent = '–';
  document.getElementById('hbHdVal').textContent = '–';
  document.getElementById('hbRVal').textContent = '–';
  document.getElementById('hbFVal').textContent = '–';
  ['hbG','hbHd','hbR'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.width = '0%';
  });
  // Reset orbit canvas
  const canvas = document.getElementById('orbitCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH EXPLORER SECTION
// ══════════════════════════════════════════════════════════════════════════════
let renderer = null;
let searchTrace = [];
let traceIdx = 0;
let searchInterval = null;
let searchDone = false;

document.getElementById('searchSpeed').addEventListener('input', function() {
  const labels = ['Very Slow','Slow','Normal','Fast','Very Fast'];
  document.getElementById('speedLabel').textContent = labels[this.value - 1];
});

document.getElementById('btnStartSearch').addEventListener('click', () => {
  if (!renderer) return;
  clearInterval(searchInterval);
  const speedMap = [600, 250, 100, 35, 8];
  const speed = speedMap[(document.getElementById('searchSpeed').value || 3) - 1];
  searchInterval = setInterval(() => {
    if (traceIdx >= searchTrace.length) {
      clearInterval(searchInterval);
      return;
    }
    processTraceEvent(searchTrace[traceIdx]);
    traceIdx++;
    renderer.render();
  }, speed);
});

document.getElementById('btnStepSearch').addEventListener('click', () => {
  if (!renderer || traceIdx >= searchTrace.length) return;
  clearInterval(searchInterval);
  processTraceEvent(searchTrace[traceIdx]);
  traceIdx++;
  renderer.render();
});

document.getElementById('btnResetSearch').addEventListener('click', resetSearch);

function resetSearch() {
  clearInterval(searchInterval);
  traceIdx = 0;
  searchDone = false;

  const canvas = document.getElementById('searchCanvas');
  if (!canvas) return;
  if (!renderer) renderer = new SearchTreeRenderer(canvas);
  renderer.reset();

  // Zero stats
  ['statExpanded','statGenerated','statPruned','statOpen','statClosed','statScorer'].forEach(id => {
    document.getElementById(id).textContent = '0';
  });
  ['cnDepth','cnG','cnHd','cnR','cnF'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  document.getElementById('currentAction').innerHTML = '<div class="action-badge">—</div>';
  document.getElementById('nodeTelemetry').innerHTML = '';
  document.getElementById('solutionStrip').classList.add('hidden');
  document.getElementById('solutionPath').innerHTML = '';
  document.getElementById('searchOverlay').classList.add('hidden');

  // Rebuild trace
  const sc = document.getElementById('searchScenario').value;
  const vr = document.getElementById('searchVariant').value;
  const { trace } = buildSearchTrace(sc, vr);
  searchTrace = trace;
}

document.getElementById('searchScenario').addEventListener('change', resetSearch);
document.getElementById('searchVariant').addEventListener('change', resetSearch);

function processTraceEvent(ev) {
  const node = ev.node;

  if (ev.type === 'expand') {
    renderer.addExpand(node);
    updateCurrentNode(node);
    updateStats(ev.stats);
  } else if (ev.type === 'generate') {
    renderer.addGenerate(node);
    updateStats(ev.stats);
  } else if (ev.type === 'prune') {
    renderer.addPrune(node);
    updatePruneNotice(node);
    updateStats(ev.stats);
  } else if (ev.type === 'goal') {
    renderer.addGoal(node, ev.path);
    showGoalOverlay(node, ev.path);
    showSolutionStrip(ev.path);
    clearInterval(searchInterval);
  }
}

function updateStats(s) {
  if (!s) return;
  document.getElementById('statExpanded').textContent = (s.expanded || 0).toLocaleString();
  document.getElementById('statGenerated').textContent = (s.generated || 0).toLocaleString();
  document.getElementById('statPruned').textContent = (s.pruned || 0).toLocaleString();
  document.getElementById('statOpen').textContent = (s.open || 0).toLocaleString();
  document.getElementById('statClosed').textContent = (s.closed || 0).toLocaleString();
  document.getElementById('statScorer').textContent = (s.scorer || 0).toLocaleString();
}

function updateCurrentNode(node) {
  document.getElementById('cnDepth').textContent = node.depth;
  document.getElementById('cnG').textContent = node.g.toFixed(2);
  document.getElementById('cnHd').textContent = (node.hd_val || 0).toFixed(1);
  document.getElementById('cnR').textContent = (node.risk || 0).toFixed(3);
  document.getElementById('cnF').textContent = (node.f || 0).toFixed(1);

  const cmd = node.action ? COMMANDS[node.action] : null;
  const icoSvg = (cmd && typeof ICO !== 'undefined' && ICO[cmd.icon]) ? ICO.html(cmd.icon) : '';
  document.getElementById('currentAction').innerHTML =
    `<div class="action-badge">${cmd ? `${icoSvg} ${node.action}` : '(root)'}</div>`;

  const s = node.state;
  const NOMINAL = { soc:[0.35,1.0], temp_battery:[-5,40], temp_payload:[-15,55], temp_bus:[-10,50] };
  function cls(key, val) {
    const [lo,hi] = NOMINAL[key]||[0,1];
    return (val < lo || val > hi) ? 'nt-bad' : 'nt-ok';
  }

  document.getElementById('nodeTelemetry').innerHTML = `
    <div class="nt-row"><span>SoC</span><span class="${cls('soc',s.soc)}">${(s.soc*100).toFixed(1)}%</span></div>
    <div class="nt-row"><span>T Payload</span><span class="${cls('temp_payload',s.temp_payload)}">${s.temp_payload.toFixed(1)} °C</span></div>
    <div class="nt-row"><span>T Battery</span><span class="${cls('temp_battery',s.temp_battery)}">${s.temp_battery.toFixed(1)} °C</span></div>
    <div class="nt-row"><span>T Bus</span><span class="${cls('temp_bus',s.temp_bus)}">${s.temp_bus.toFixed(1)} °C</span></div>
    <div class="nt-row"><span>Payload</span><span>${s.payload_on ? '<span style="color:var(--ok)">ON</span>' : '<span style="color:var(--danger)">OFF</span>'}</span></div>
    <div class="nt-row"><span>Mode</span><span>${s.mode}</span></div>
    <div class="nt-row"><span>Transmitter</span><span>${s.transmitter_on ? '<span style="color:var(--ok)">ON</span>' : '<span style="color:var(--danger)">OFF</span>'}</span></div>
  `;
}

function updatePruneNotice(node) {
  document.getElementById('currentAction').innerHTML =
    `<div class="action-badge" style="border-color:var(--danger);color:var(--danger);gap:6px;display:inline-flex;align-items:center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> PRUNED — ${node.action} violates hard constraint</div>`;
}

function showGoalOverlay(node, path) {
  const sc = document.getElementById('searchScenario').value;
  const scenario = SCENARIOS[sc];
  document.getElementById('overlayTitle').textContent = 'Goal Found!';
  document.getElementById('overlaySub').textContent =
    `Recovery plan found in ${node.depth} steps — cost g = ${node.g.toFixed(2)}`;
  document.getElementById('searchOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('searchOverlay').classList.add('hidden'), 3500);
}

function showSolutionStrip(path) {
  const strip = document.getElementById('solutionStrip');
  const container = document.getElementById('solutionPath');
  strip.classList.remove('hidden');
  container.innerHTML = '';

  let totalG = 0;
  path.forEach((node, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'sp-arrow';
      arrow.textContent = '→';
      container.appendChild(arrow);
    }
    const div = document.createElement('div');
    div.className = 'sp-step';
    div.style.animationDelay = i * 0.1 + 's';
    const cmd = node.action ? COMMANDS[node.action] : null;
    const cost = cmd ? cmd.cost : 0;
    const icoSvg = (cmd && typeof ICO !== 'undefined' && ICO[cmd.icon]) ? ICO.html(cmd.icon) : '';
    totalG += cost;
    div.innerHTML = `
      <span class="sp-action">${icoSvg} ${cmd ? node.action : 'Start'}</span>
      <span class="sp-cost">g = ${totalG.toFixed(1)}</span>
    `;
    container.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS SECTION
// ══════════════════════════════════════════════════════════════════════════════
let resultsInited = false;
let chartInstance = null;
let activeMetric = 'success';

document.querySelectorAll('.m-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeMetric = btn.dataset.metric;
    renderChart();
  });
});

window.updateChart = function(metric) {
  if (metric) {
    activeMetric = metric;
    document.querySelectorAll('.m-tab').forEach(t => {
      if (t.dataset.metric === metric) t.classList.add('active');
      else t.classList.remove('active');
    });
  }
  renderChart();
};
window.renderChart = renderChart;

let chartResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(chartResizeTimer);
  chartResizeTimer = setTimeout(() => {
    const sec = document.getElementById('section-results');
    if (sec && sec.classList.contains('active')) {
      renderChart();
    }
  }, 120);
});

function initResults() {
  if (!resultsInited) {
    buildResultsTable();
    resultsInited = true;
  }
  renderChart();
}

function buildResultsTable() {
  const tbody = document.getElementById('resultsBody');
  tbody.innerHTML = '';
  RESULTS.forEach(r => {
    const algoClass = r.algorithm === 'astar' ? 'row-astar'
      : r.algorithm === 'hill_climbing' ? 'row-hc' : 'row-sa';
    const successBadge = r.success === 1 
      ? '<span class="badge-success"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline-block;vertical-align:middle;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>100%</span>'
      : r.success > 0.5 
          ? `<span class="badge-partial">${(r.success*100).toFixed(0)}%</span>`
          : `<span class="badge-fail"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline-block;vertical-align:middle;margin-right:3px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>${(r.success*100).toFixed(0)}%</span>`;
    const scLabel = { 
      single_thermal: 'Thermal', 
      single_power: 'Power', 
      single_load: 'Load', 
      cascade: 'Cascade',
      single_thermal_sun: 'Thermal (Sun)', 
      single_power_sun: 'Power (Sun)' 
    };
    const algoLabel = { astar:'A*', hill_climbing:'Hill Climb', simulated_annealing:'Sim. Anneal' };
    const wall = r.wall < 1 ? r.wall.toFixed(3) : r.wall.toFixed(2);
    tbody.innerHTML += `
      <tr class="${algoClass}">
        <td>${scLabel[r.scenario] || r.scenario}</td>
        <td>${algoLabel[r.algorithm] || r.algorithm}</td>
        <td><code>${r.variant}</code></td>
        <td>${successBadge}</td>
        <td>${r.cost.toFixed(2)}</td>
        <td>${r.nodes.toLocaleString()}</td>
        <td>${r.time_stable || '—'}</td>
        <td>${(r.margin * 100).toFixed(1)}%</td>
        <td>${wall}</td>
      </tr>
    `;
  });
}

function renderChart() {
  const canvas = document.getElementById('resultsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  // Group by algorithm for each scenario
  const scenarios = ['single_thermal','single_power','single_load','cascade'];
  const scLabels  = ['Thermal Runaway','Battery Degradation','Rogue Bus Load','Cascade'];
  const algos = [
    { key: 'astar',               label: 'A* (H₂)',      color: '#3d8bff' },
    { key: 'astar_h0',            label: 'A* (H₀ UCS)',  color: '#64748b' },
    { key: 'hill_climbing',       label: 'Hill Climbing', color: '#f59e0b' },
    { key: 'simulated_annealing', label: 'Sim. Annealing', color: '#a855f7' },
  ];

  function getVal(row, metric) {
    if (metric === 'success') return row.success * 100;
    if (metric === 'cost') return row.cost;
    if (metric === 'nodes') return row.nodes;
    if (metric === 'time') return row.wall;
    return 0;
  }

  const metricLabels = {
    success: 'Success Rate (%)',
    cost: 'Solution Cost g',
    nodes: 'Nodes Expanded',
    time: 'Wall Time (s)'
  };

  // Build datasets
  const datasets = [
    { algo: 'astar', variant: 'H2' },
    { algo: 'astar', variant: 'H0' },
    { algo: 'hill_climbing', variant: 'local' },
    { algo: 'simulated_annealing', variant: 'local' },
  ].map((cfg, i) => {
    const color = ['#3d8bff','#64748b','#f59e0b','#a855f7'][i];
    const label = ['A* H₂ (Proposed)','A* H₀ (UCS Baseline)','Hill Climbing','Simulated Annealing'][i];
    const data = scenarios.map(sc => {
      const row = RESULTS.find(r => r.scenario === sc && r.algorithm === cfg.algo && r.variant === cfg.variant);
      return row ? getVal(row, activeMetric) : 0;
    });
    return {
      label,
      data,
      backgroundColor: color + '99',
      borderColor: color,
      borderWidth: 2,
      borderRadius: 4,
    };
  });

  // Simple bar chart (no external lib needed — vanilla canvas)
  drawBarChart(ctx, canvas, {
    labels: scLabels,
    datasets,
    yLabel: metricLabels[activeMetric],
    logScale: activeMetric === 'nodes',
  });
}

function drawBarChart(ctx, canvas, { labels, datasets, yLabel, logScale }) {
  const parent = canvas.parentElement;
  const W = (parent && parent.clientWidth > 48) ? (parent.clientWidth - 48) : 800;
  const H = 280; // Fixed logical height - prevents canvas ballooning

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const pad = { top: 24, right: 24, bottom: 60, left: 70 };
  const cW = Math.max(10, W - pad.left - pad.right);
  const cH = Math.max(10, H - pad.top - pad.bottom);

  // Max value
  const allVals = datasets.flatMap(d => d.data).filter(v => v > 0);
  const maxVal = Math.max(...allVals) * 1.12;

  const nGroups = labels.length;
  const nBars   = datasets.length;
  const groupW  = cW / nGroups;
  const barW    = Math.min(groupW / (nBars + 1), 36);

  function toY(v) {
    if (!v || v <= 0) return cH;
    const ratio = logScale ? Math.log(v + 1) / Math.log(maxVal + 1) : v / maxVal;
    return cH - ratio * cH;
  }

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (cH / 5) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke();
    const val = maxVal * (5 - i) / 5;
    ctx.fillStyle = 'rgba(120,150,190,0.7)';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    let tickLabel;
    if (val >= 10000)       tickLabel = (val/1000).toFixed(0) + 'k';
    else if (val >= 1000)   tickLabel = (val/1000).toFixed(1) + 'k';
    else if (val >= 100)    tickLabel = val.toFixed(0);
    else if (val >= 10)     tickLabel = val.toFixed(1);
    else                    tickLabel = val.toFixed(2);
    ctx.fillText(tickLabel, pad.left - 6, y + 4);
  }

  // Y-axis label
  ctx.save(); ctx.translate(14, pad.top + cH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(120,150,190,0.8)'; ctx.font = '11px Inter'; ctx.textAlign = 'center';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // Bars
  datasets.forEach((ds, di) => {
    ds.data.forEach((val, gi) => {
      const x = pad.left + gi * groupW + (di + 0.5) * barW + (groupW - nBars * barW) / 2;
      const y = pad.top + toY(val);
      const bH = cH - toY(val);
      if (bH <= 0) return;

      // Glow
      ctx.shadowColor = ds.borderColor + '66';
      ctx.shadowBlur = 8;
      ctx.fillStyle = ds.backgroundColor;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, barW - 2, bH, [3, 3, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barW - 2, bH);
      }
      ctx.shadowBlur = 0;

      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = 1.5;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, barW - 2, bH, [3, 3, 0, 0]);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, barW - 2, bH);
      }

      // Value label
      if (val > 0) {
        ctx.fillStyle = 'rgba(200,220,255,0.85)';
        ctx.font = '9px JetBrains Mono';
        ctx.textAlign = 'center';
        const label = val > 999 ? (val/1000).toFixed(1)+'k' : val.toFixed(val < 10 ? 1 : 0);
        ctx.fillText(label, x + (barW - 2) / 2, y - 3);
      }
    });
  });

  // X labels
  labels.forEach((lbl, gi) => {
    const x = pad.left + gi * groupW + groupW / 2;
    ctx.fillStyle = 'rgba(120,150,190,0.9)';
    ctx.font = '11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, x, H - pad.bottom + 20);
  });

  // Legend
  const legendItemW = Math.min(185, cW / datasets.length);
  datasets.forEach((ds, i) => {
    const lx = pad.left + i * legendItemW;
    const ly = H - 12;
    ctx.fillStyle = ds.borderColor;
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(lx, ly - 8, 12, 10, 2); ctx.fill();
    } else {
      ctx.fillRect(lx, ly - 8, 12, 10);
    }
    ctx.fillStyle = 'rgba(160,180,210,0.9)';
    ctx.font = '10px Inter'; ctx.textAlign = 'left';
    ctx.fillText(ds.label, lx + 16, ly);
  });

  ctx.textAlign = 'left';
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init
window.addEventListener('DOMContentLoaded', () => {
  resetSearch();
});

// ══════════════════════════════════════════════════════════════════════════════
// MATHEMATICS SECTION — sub-tab switching + KaTeX pre-render
// ══════════════════════════════════════════════════════════════════════════════

// Pre-render all math panes: temporarily make them visible so KaTeX can measure
// them, then hide all except the first.
function initMathRendering() {
  if (!window.renderMathInElement) {
    // KaTeX not yet loaded — retry in 300ms
    setTimeout(initMathRendering, 300);
    return;
  }
  const panes = document.querySelectorAll('.math-pane');
  panes.forEach(pane => {
    // Temporarily force visibility so KaTeX can traverse the DOM
    const prev = pane.style.display;
    pane.style.display = 'grid';
    pane.style.visibility = 'hidden';
    pane.style.position = 'absolute';
    window.renderMathInElement(pane, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false }
      ],
      throwOnError: false,
    });
    // Restore
    pane.style.display = prev || '';
    pane.style.visibility = '';
    pane.style.position = '';
  });
}

document.querySelectorAll('.math-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.mtab;
    document.querySelectorAll('.math-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.math-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.getElementById('mpane-' + tab);
    if (pane) {
      pane.classList.add('active');
      // Re-render any equations that were missed (safety net)
      if (window.renderMathInElement) {
        window.renderMathInElement(pane, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$',  right: '$',  display: false }
          ],
          throwOnError: false,
        });
      }
    }
  });
});

// Run after KaTeX scripts are loaded
window.addEventListener('load', () => {
  // Small delay to ensure KaTeX auto-render script has also loaded
  setTimeout(initMathRendering, 150);
});
