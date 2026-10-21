# UI Refinement Audit — Premium Aerospace Research Interface

**Project:** Risk-Aware Dynamic A* for Satellite Anomaly Recovery  
**Document:** `reports/ui_refinement_audit.md`  
**Date:** 2026-10-22  
**Status:** AUDIT COMPLETED — Ready for Implementation

---

## 1. Current Font Families & Usage Audit

### Existing Setup
- **Global CSS (`frontend/src/index.css`)**:
  - Sans-serif stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
  - Monospace stack: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`.
  - Inter font is not explicitly loaded or standardized.
- **Typography Misuse & Monospace Overload**:
  - In `MissionOverview.tsx`, `Sidebar.tsx`, `SettingsStatus.tsx`, and `UnderConstructionView.tsx`, `font-mono` is applied indiscriminately to page titles, subtitles, section headers, body paragraphs, and table text.
  - This reduces readability and creates a "retro hacker terminal" aesthetic rather than a modern, high-precision aerospace research platform.
- **Resolution Plan**:
  - Import **Inter** via Google Fonts with robust local fallbacks (`Inter, system-ui, -apple-system, sans-serif`).
  - Standardize clean, modern sans-serif for:
    - Page titles, section headings, card titles, explanatory copy, and navigational links.
  - Restrict `font-mono` strictly to:
    - Numerical telemetry readings, timestamps, IDs, code identifiers, matrix/equation tokens, and command slugs.
  - Establish clear typography tokens and scale (Titles 24-28px, Section headings 16-18px, Card headers 14-16px, Body 14px, Meta/Labels 11-12px).

---

## 2. Spacing, Layout, Contrast, and Density Problems

### Background & Color Inconsistencies
- Across different pages, cards use disjointed arbitrary background color hex codes:
  - Shell background: `#070a12`
  - Sidebar background: `#070b14`
  - TopBar background: `#090e1a`
  - Cards in Mission Overview: `#0d1322`, `#101728`, `#121a2d`
  - Cards in Digital Twin: `#0b1120`, `#0e1626`, `#070a12`
  - Cards in Telemetry Lab: `#0b1120`, `#0e1626`
  - Diagnostics: `#0b101d`
- **Result:** Visual noise and fragmented aesthetics. A unified token system is needed (`--bg-canvas: #070a12`, `--bg-surface: #0b1120`, `--bg-elevated: #0f172a`, `--border-subtle: #1e293b`).

### Spacing & Grid Alignment
- Padding oscillates randomly between `p-3`, `p-3.5`, `p-4`, `p-5`, and `p-6` without an 8px rhythm.
- Header controls and actions in different pages have mismatched heights (`py-1.5` vs `py-2`) and alignment.
- Digital Twin: Three-Node Schematic displays 10+ sub-metrics inside each node card (heat capacities, conductances, fractions), pushing cards to excessive heights and causing horizontal card clipping on standard 1366px/1280px laptop screens.

### Contrast & Visual Hierarchy
- Overuse of bright cyan glowing borders (`shadow-[0_0_15px_rgba(56,189,248,0.1)]`) and decorative corner pseudo-elements.
- Subtitle text and labels in some components use `text-slate-500` on dark backgrounds, falling below WCAG AA contrast thresholds.

---

## 3. Component Inconsistencies

1. **Headers & Disclaimers**:
   - Digital Twin uses an amber simulation banner in the top-right flex row.
   - Telemetry Lab uses an amber disclaimer badge in the top-right.
   - Mission Overview puts disclaimer text in a small bottom footer.
   - *Fix:* Standardize a clean, dignified aerospace warning/disclaimer pattern with crisp typography and subtle borders.
2. **Cards & Badges**:
   - `MetricCard.tsx` has decorative corner diagonals (`rotate-45` line) that look like sci-fi game UI rather than aerospace flight software.
   - Status badges use differing sizes and padding across pages.
3. **Tables**:
   - Tables in `MissionOverview.tsx` and `WindowComparisonView.tsx` use slightly differing border colors, cell padding, and header text sizing.

---

## 4. Sidebar Items: Implemented vs. Placeholders

| Sidebar Item | Route | Current Tag | Actual Status | Desired Treatment |
|---|---|---|---|---|
| **Mission Overview** | `/` | `ACTIVE` | **Fully Implemented** | Clean label, active indicator |
| **Spacecraft Digital Twin** | `/digital-twin` | `PHASE 4` | **Fully Implemented** | Clean label, active indicator |
| **Telemetry & Anomaly Lab** | `/telemetry-lab` | `PHASE 4` | **Fully Implemented** | Clean label, active indicator |
| **Recovery Path Planner** | `/planner` | `PHASE 4` | **Placeholder** (Phase 6 target) | Subtle "Queued" or "Coming Soon" badge |
| **Simulation Laboratory** | `/simulation-lab` | `PHASE 4` | **Placeholder** | Subtle "Planned" badge |
| **Algorithm Benchmarking** | `/benchmarking` | `PHASE 4` | **Placeholder** | Subtle "Planned" badge |
| **Experiment History** | `/history` | `PHASE 4` | **Placeholder** | Subtle "Planned" badge |
| **Research Reports** | `/reports` | `PHASE 4` | **Placeholder** | Subtle "Planned" badge |
| **Settings & Status** | `/settings` | `SYSTEM` | **Fully Implemented** | Clean label, active indicator |

**Required Shell Changes:**
- Remove all "PHASE 4" badges from the sidebar.
- Distinguish active implemented items cleanly; mark unfinished destinations with a quiet, subtle "Coming soon" or "Queued" tag.
- In `TopBar.tsx`, remove the environment versions (`Python 3.12 • API v1.0.0`) from the primary header bar, relocating them cleanly to Settings & Status where they belong.

---

## 5. Functional & Responsive Problems Identified

1. **Digital Twin Three-Node Schematic Responsive Overflow**:
   - At standard 1280px-1366px laptop resolutions, the three-node card layout becomes severely squished because each card is filled with secondary physical parameters (conductance constants, radiation terms, Joule heat fractions).
   - *Fix:* Reorganize node cards into clean, priority-first modules (State & Temperature prominent; nominal band & hard limits clear) and place secondary physical constants ($C$, $UA_{\text{space}}$, $UA_{\text{bus}}$, equations) into a collapsible "Model Details" drawer.
2. **Mission Overview Visual Flow**:
   - Currently, a user landing on Mission Overview sees statistics, but no direct, prominent call-to-action buttons to explore the Digital Twin or Telemetry Lab.
   - The H3 double-counting issue is presented as a jarring raw amber banner in the middle of asset verification.
   - *Fix:* Reorganize with clear aerospace project summary, prominent quick-action cards to live workspaces, and a collapsible, structured "Research Limitations & Evaluation Notes" disclosure.
3. **Placeholder Pages**:
   - Still contain outdated text ("Phase 3 Shell Ready", "Phase 3 Rule: Mocked interactive states are strictly prohibited").
   - *Fix:* Present placeholders as clean, dignified "Research Module in Development" briefings with scientific scope and scheduled API bindings.

---

## 6. Planned Design-System Changes

1. **Typography & Styling Foundation (`index.html`, `index.css`)**:
   - Include Inter font via Google Fonts with local fallback.
   - Create unified CSS custom properties for surfaces, borders, and typography.
   - Remove unused legacy `App.css`.
2. **Navigation Shell (`Sidebar.tsx`, `TopBar.tsx`, `AppShell.tsx`)**:
   - Modernize sidebar with restrained aerospace styling, no phase numbers, clear active route indicator, and subtle "Coming soon" markers for unfinished modules.
   - Clean top bar: ground station status, live UTC clock, refresh button, API docs link.
3. **Mission Overview (`MissionOverview.tsx`)**:
   - Clear title and executive research summary in readable sans-serif.
   - Clean KPI metric cards.
   - Quick workspace navigation cards (Digital Twin, Telemetry Lab, System Settings).
   - Dedicated "Research Limitations" panel detailing the H3 double-counting finding.
   - Polished scenario and command tables.
4. **Digital Twin Schematic (`ThreeNodeSchematic.tsx`)**:
   - Node cards: visual priority on temperature readings, statuses (Nominal, Warning, Critical), and nominal/hard bands.
   - Collapsible "Thermal Network & Physical Parameters" panel to avoid layout squishing at laptop widths.
5. **Telemetry Lab (`TelemetryLab.tsx`, sub-components)**:
   - Polished typography across controls, score card, and channel catalog.
   - Stepped discrete charts preserved; readable sans-serif text for channel documentation.
6. **Common & Placeholder Components (`UnderConstructionView.tsx`, `MetricCard.tsx`)**:
   - Remove all phase-badge references.
   - Cohesive card padding and borders.
