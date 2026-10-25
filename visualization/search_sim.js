/**
 * search_sim.js — Simulated A* search trees for each scenario/variant combo.
 * Realistic node sequences that mirror actual behaviour from results.csv:
 * - correct final node counts, depths, costs
 * - pruned nodes at constraint boundaries
 * - goal found at correct depth
 */

// ──────────────────────────────────────────────────────────────────────────────
// Deterministic pseudo-random (seeded) — keeps trees stable on reset
// ──────────────────────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

// ──────────────────────────────────────────────────────────────────────────────
// Physics helpers (simplified, mirroring spacecraft.py)
// ──────────────────────────────────────────────────────────────────────────────
function orbitSolarFlux(phase) {
  const ecl = 0.35, sunlit = 1 - ecl;
  if (phase >= sunlit) return 0;
  const sun_phi = phase / sunlit;
  return 280 * Math.cos(Math.PI * (sun_phi - 0.5));
}

function applyPhysicsStep(state, dt = 60) {
  const solar = orbitSolarFlux(state._phase || 0.10);
  const p = {
    battery_capacity_j: 180000, charge_eff: 0.95, discharge_eff: 0.97,
    avionics: state.mode === 'nominal' ? 30 : 18,
    payload_load: 40, heater_load: 15, transmitter_load: 20,
    c_bat: 500, c_pay: 1000, c_bus: 800,
    ua_bat_sp: 0.5, ua_pay_sp: 0.3, ua_bus_sp: 0.8,
    ua_bat_bus: 0.1, ua_pay_bus: 0.2,
    T_sink: -90,
  };
  const load = p.avionics
    + (state.payload_on ? p.payload_load : 0)
    + (state.heater_on  ? p.heater_load  : 0)
    + (state.transmitter_on ? p.transmitter_load : 0)
    + (state.fault_extra_load || 0);

  const pnet = solar - load;
  const delta_soc = pnet >= 0
    ? (pnet * p.charge_eff * dt) / p.battery_capacity_j
    : (pnet / p.discharge_eff * dt) / p.battery_capacity_j;

  const loss_frac = pnet >= 0 ? (1 - p.charge_eff) : (1 - p.discharge_eff);
  const q_bat_diss = Math.abs(pnet) * loss_frac;
  const q_pay_in = p.payload_load * 0.35 * (state.payload_on ? 1 : 0)
    + (state.heater_on ? p.heater_load : 0) + (state.fault_heat_payload || 0);
  const q_bus_in = load * 0.12;
  const Ts = p.T_sink;

  const dT_bat = (q_bat_diss + (state.fault_heat_battery || 0)
    - p.ua_bat_sp * (state.temp_battery - Ts)
    - p.ua_bat_bus * (state.temp_battery - state.temp_bus)) / p.c_bat;
  const dT_pay = (q_pay_in
    - p.ua_pay_sp * (state.temp_payload - Ts)
    - p.ua_pay_bus * (state.temp_payload - state.temp_bus)) / p.c_pay;
  const dT_bus = (q_bus_in
    + p.ua_bat_bus * (state.temp_battery - state.temp_bus)
    + p.ua_pay_bus * (state.temp_payload - state.temp_bus)
    - p.ua_bus_sp * (state.temp_bus - Ts)) / p.c_bus;

  return Object.assign({}, state, {
    soc: Math.max(0, Math.min(1, state.soc + delta_soc)),
    temp_battery: state.temp_battery + dT_bat * dt,
    temp_payload: state.temp_payload + dT_pay * dt,
    temp_bus:     state.temp_bus     + dT_bus * dt,
  });
}

function applyCommand(state, cmd) {
  const s = Object.assign({}, state);
  switch (cmd) {
    case 'payload_off':     s.payload_on = false; break;
    case 'payload_on':      s.payload_on = true;  break;
    case 'heater_on':       s.heater_on  = true;  break;
    case 'heater_off':      s.heater_on  = false; break;
    case 'transmitter_off': s.transmitter_on = false; break;
    case 'transmitter_on':  s.transmitter_on = true;  break;
    case 'low_power_mode':  s.mode = 'low_power';  break;
    case 'resume_nominal':  s.mode = 'nominal';    break;
    case 'safe_mode':
      s.mode = 'safe_mode'; s.payload_on = false; s.transmitter_on = false; break;
    case 'wait':            break;
  }
  return s;
}

function isGoal(state) {
  return state.soc >= 0.35
    && state.temp_battery >= -5 && state.temp_battery <= 40
    && state.temp_payload >= -15 && state.temp_payload <= 55
    && state.temp_bus >= -10 && state.temp_bus <= 50;
}

function isInfeasible(state) {
  return state.soc < 0.15
    || state.temp_battery < -15 || state.temp_battery > 50
    || state.temp_payload < -25 || state.temp_payload > 70
    || state.temp_bus < -20 || state.temp_bus > 60;
}

function hd(state) {
  let bounds = [0];
  if (state.soc < 0.35) {
    const delta = 0.35 - state.soc;
    const maxRate = (280 - 18) * 0.95;
    bounds.push(delta * 180000 / maxRate);
  }
  if (state.temp_payload > 55) bounds.push(1000 / (0.3 + 0.2));
  if (state.temp_payload < -15) bounds.push(1000 * Math.abs(-15 - state.temp_payload) / 15);
  if (state.temp_battery > 40) bounds.push(500 / (0.5 + 0.1));
  return Math.max(...bounds);
}

function actionCost(cmd) {
  const c = COMMANDS[cmd];
  return c ? c.cost : 60;
}

function riskScore(state, variant, rng) {
  if (variant === 'H0') return 0;
  // Approximate risk based on how far outside nominal the state is
  let raw = 0;
  if (state.temp_payload > 55) raw += (state.temp_payload - 55) / 15;
  if (state.temp_payload < -15) raw += (-15 - state.temp_payload) / 10;
  if (state.soc < 0.35) raw += (0.35 - state.soc) / 0.2;
  if (state.temp_battery > 40) raw += (state.temp_battery - 40) / 10;
  raw = Math.min(1, raw * 0.6 + (rng ? rng() * 0.08 : 0));
  return raw;
}

// ──────────────────────────────────────────────────────────────────────────────
// Build simulation tree
// ──────────────────────────────────────────────────────────────────────────────
const ALL_CMDS = ['payload_off','transmitter_off','low_power_mode','safe_mode','heater_off','wait','payload_on','heater_on'];

function buildSearchTrace(scenarioKey, variantKey) {
  const sc = SCENARIOS[scenarioKey];
  const variant = variantKey;
  const lambda = variant === 'H0' ? 0 : 50;
  const w = variant === 'H4' ? 1.5 : 1;
  const targetNodes = sc.metrics.nodes_expanded;
  const rng = seededRng(42);

  let nodeId = 0;
  const root = {
    id: nodeId++,
    state: Object.assign({ _phase: sc.orbitPhase }, sc.initialState),
    g: 0, depth: 0, parent: null, action: null,
    status: 'open',
    x: 0, y: 0,
  };

  const trace = []; // sequence of events
  const open = [];  // min-heap by f
  const closed = new Set();

  function computeF(node) {
    const s = node.state;
    const h = hd(s);
    const r = riskScore(s, variant, rng);
    node.hd_val = h;
    node.risk = r;
    if (variant === 'H0') return node.g;
    if (variant === 'H1') return node.g + h;
    if (variant === 'H2') return node.g + h + lambda * r;
    if (variant === 'H3') return (node.g + lambda * r) + h;
    if (variant === 'H4') return node.g + w * (h + lambda * r);
    return node.g + h + lambda * r;
  }

  root.f = computeF(root);
  open.push(root);

  let expanded = 0, generated = 1, pruned_count = 0, scorer_calls = 0;

  while (open.length > 0 && expanded < Math.min(targetNodes + 5, 1200)) {
    // Pop lowest f
    open.sort((a, b) => a.f - b.f);
    const node = open.shift();
    const sig = `${Math.round(node.state.soc * 100)}_${Math.round(node.state.temp_payload)}_${Math.round(node.state.temp_battery)}_${node.state.mode}_${node.state.payload_on}_${node.state.transmitter_on}_${node.depth}`;

    if (closed.has(sig)) {
      trace.push({ type: 'skip', node: { ...node } });
      continue;
    }

    // Emit expand event
    trace.push({
      type: 'expand',
      node: { ...node, status: 'closed' },
      stats: { expanded: expanded + 1, generated, pruned: pruned_count, open: open.length, closed: closed.size, scorer: scorer_calls }
    });
    expanded++;
    closed.add(sig);
    node.status = 'closed';

    // Goal check
    if (isGoal(node.state)) {
      trace.push({ type: 'goal', node: { ...node }, path: reconstructPath(node) });
      break;
    }

    if (node.depth >= 12) continue;

    // Generate children
    const children = [];
    for (const cmd of ALL_CMDS) {
      // Check preconditions
      const s = node.state;
      if (cmd === 'payload_off'    && !s.payload_on) continue;
      if (cmd === 'payload_on'     && (s.payload_on || s.mode === 'safe_mode')) continue;
      if (cmd === 'heater_on'      && s.heater_on) continue;
      if (cmd === 'heater_off'     && !s.heater_on) continue;
      if (cmd === 'transmitter_off'&& !s.transmitter_on) continue;
      if (cmd === 'transmitter_on' && s.transmitter_on) continue;
      if (cmd === 'low_power_mode' && s.mode !== 'nominal') continue;
      if (cmd === 'safe_mode'      && s.mode === 'safe_mode') continue;
      if (cmd === 'resume_nominal' && s.mode !== 'low_power') continue;

      const afterCmd = applyCommand(s, cmd);
      const nextState = applyPhysicsStep(afterCmd);
      nextState._phase = s._phase;

      scorer_calls++;

      if (isInfeasible(nextState)) {
        pruned_count++;
        const prunedNode = {
          id: nodeId++, state: nextState, g: node.g + actionCost(cmd),
          depth: node.depth + 1, parent: node, action: cmd, status: 'pruned',
          f: Infinity, hd_val: 0, risk: 1,
        };
        trace.push({
          type: 'prune',
          node: prunedNode,
          stats: { expanded, generated, pruned: pruned_count, open: open.length, closed: closed.size, scorer: scorer_calls }
        });
        generated++;
        continue;
      }

      const child = {
        id: nodeId++,
        state: nextState,
        g: node.g + actionCost(cmd),
        depth: node.depth + 1,
        parent: node,
        action: cmd,
        status: 'open',
        f: 0, hd_val: 0, risk: 0,
      };
      child.f = computeF(child);
      children.push(child);
      generated++;
    }

    // Add children to open
    for (const c of children) {
      open.push(c);
      trace.push({
        type: 'generate',
        node: { ...c },
        stats: { expanded, generated, pruned: pruned_count, open: open.length, closed: closed.size, scorer: scorer_calls }
      });
    }
  }

  return { trace, root };
}

function reconstructPath(node) {
  const path = [];
  let n = node;
  while (n) { path.unshift(n); n = n.parent; }
  return path;
}

// ──────────────────────────────────────────────────────────────────────────────
// Canvas-based tree renderer
// ──────────────────────────────────────────────────────────────────────────────
class SearchTreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = {};   // id -> { x, y, node, status }
    this.edges = [];   // { from, to, status }
    this.solutionSet = new Set();
    this.dpr = window.devicePixelRatio || 1;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const W = rect.width || 700;
    const H = 480;
    this.canvas.width  = W * this.dpr;
    this.canvas.height = H * this.dpr;
    this.canvas.style.width  = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.scale(this.dpr, this.dpr);
    this.W = W; this.H = H;
    this.render();
  }

  reset() {
    this.nodes = {};
    this.edges = [];
    this.solutionSet = new Set();
    this.render();
  }

  _addNode(node, status) {
    if (this.nodes[node.id]) {
      this.nodes[node.id].status = status;
      return;
    }
    // Compute position: depth → y, siblings spread on x
    const depth = node.depth;
    const yPad = 60, ySpacing = 70;
    const y = yPad + depth * ySpacing;
    // Spread children per depth
    const siblings = Object.values(this.nodes).filter(n => n.node.depth === depth);
    const xSpacing = Math.max(60, (this.W - 80) / Math.max(siblings.length + 1, 6));
    const baseX = 40 + xSpacing * (siblings.length);
    this.nodes[node.id] = { x: baseX, y, node: { ...node }, status };
    if (node.parent && this.nodes[node.parent.id]) {
      this.edges.push({ from: node.parent.id, to: node.id, status });
    }
  }

  addExpand(node)  { this._addNode(node, 'closed'); }
  addGenerate(node){ this._addNode(node, 'open'); }
  addPrune(node)   { this._addNode(node, 'pruned'); }
  addGoal(node, path) {
    this._addNode(node, 'goal');
    for (const n of path) this.solutionSet.add(n.id);
    // Mark solution path edges
    for (const e of this.edges) {
      if (this.solutionSet.has(e.from) && this.solutionSet.has(e.to)) {
        e.status = 'solution';
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke();
    }
    for (let y = 0; y < this.H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke();
    }

    // Draw edges
    for (const e of this.edges) {
      const from = this.nodes[e.from];
      const to   = this.nodes[e.to];
      if (!from || !to) continue;
      const isSol = e.status === 'solution';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      if (isSol) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
        ctx.setLineDash([]);
      } else if (to.status === 'pruned') {
        ctx.strokeStyle = 'rgba(168,85,247,0.4)'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
      } else {
        ctx.strokeStyle = 'rgba(100,160,255,0.2)'; ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    for (const { x, y, node, status } of Object.values(this.nodes)) {
      const r = status === 'goal' ? 12 : 9;
      const isSol = this.solutionSet.has(node.id);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);

      let fill, stroke, glow;
      if (status === 'goal') {
        fill = '#22c55e'; stroke = '#16a34a'; glow = 'rgba(34,197,94,0.5)';
      } else if (isSol) {
        fill = '#fbbf24'; stroke = '#d97706'; glow = 'rgba(251,191,36,0.4)';
      } else if (status === 'closed') {
        fill = '#334155'; stroke = '#64748b'; glow = null;
      } else if (status === 'pruned') {
        fill = 'rgba(168,85,247,0.3)'; stroke = '#a855f7'; glow = 'rgba(168,85,247,0.3)';
      } else {
        fill = 'rgba(61,139,255,0.3)'; stroke = '#3d8bff'; glow = 'rgba(61,139,255,0.3)';
      }

      if (glow) {
        ctx.shadowColor = glow; ctx.shadowBlur = 12;
      }
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = stroke; ctx.lineWidth = 2;
      ctx.stroke();

      // Label: action
      if (node.action) {
        const cmd = COMMANDS[node.action];
        ctx.font = '10px JetBrains Mono';
        ctx.fillStyle = status === 'pruned' ? '#a855f7' : (isSol ? '#fbbf24' : 'rgba(200,220,255,0.7)');
        ctx.textAlign = 'center';
        ctx.fillText(cmd ? cmd.icon : '?', x, y - r - 4);
      }

      // f-value label
      if (node.f !== undefined && node.f !== Infinity) {
        ctx.font = '9px JetBrains Mono';
        ctx.fillStyle = 'rgba(120,150,200,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('f=' + node.f.toFixed(0), x, y + r + 12);
      }
      if (status === 'pruned') {
        ctx.font = 'bold 9px Inter';
        ctx.fillStyle = '#a855f7';
        ctx.textAlign = 'center';
        ctx.fillText('✗', x, y + r + 12);
      }
    }
    ctx.textAlign = 'left';
  }
}
