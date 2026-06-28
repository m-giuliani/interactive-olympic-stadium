/**
 * Broadcast-style virtual scoreboard overlay for the long jump — a three-phase
 * Olympic-TV graphic, pure DOM + CSS (no assets, no bundler), matching the dark
 * look of #hud in index.html:
 *
 *   A) showStartList(roster)      — the 8-athlete start list panel.
 *   B) showCompetitor(athlete)    — a per-athlete lower-third ("Attempt 1").
 *      showResult(distanceText)   — flashes the measured distance in that box.
 *   C) showResults(rows)          — the sorted results table, winner highlighted.
 *
 * The nodes are built ONCE and appended to <body> (position:fixed, pointer-events
 * none, above #hud). createBroadcastOverlay() returns an imperative API; one
 * panel is faded in at a time, the others faded out.
 *
 * Colour chips come from each athlete's kit colour (a 0xRRGGBB number) — no flag
 * images. Names/countries are invented (see ROSTER in events/longJump.js).
 */

const STYLE_ID = "bc-overlay-style";
const CSS = `
#bc-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 20;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.bc-panel { position: absolute; opacity: 0; transition: opacity 0.4s ease;
  background: linear-gradient(135deg, rgba(8,26,42,0.92), rgba(6,42,54,0.92));
  border: 1px solid rgba(120,200,220,0.28); border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.6); color: #f4f8fb;
  text-shadow: 0 1px 6px rgba(0,0,0,0.6); }
.bc-panel.bc-show { opacity: 1; }
.bc-title { color: #f3c34a; font-weight: 800; letter-spacing: 0.12em;
  text-transform: uppercase; font-size: 0.9rem; padding: 12px 16px 9px;
  border-bottom: 1px solid rgba(243,195,74,0.35); }
.bc-row { display: flex; align-items: center; gap: 10px; padding: 7px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.95rem; }
.bc-row:last-child { border-bottom: none; }
.bc-rank { flex: 0 0 22px; text-align: center; font-weight: 700; color: #9fb6c6;
  font-variant-numeric: tabular-nums; }
.bc-chip { flex: 0 0 14px; height: 14px; border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3); }
.bc-cc { flex: 0 0 38px; font-weight: 700; letter-spacing: 0.06em; color: #cfe3ef; }
.bc-name { flex: 1 1 auto; color: #fff; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }

/* A) Start list — upper-left. */
#bc-start { top: 12%; left: 4%; width: min(360px, 34vw); }

/* B) Lower-third — bottom-left. */
#bc-lower { bottom: 9%; left: 4%; min-width: 340px; display: flex; overflow: hidden; }
#bc-lower .bc-accent { flex: 0 0 8px; }
#bc-lower .bc-body { padding: 10px 18px; }
#bc-lower .bc-l-name { font-size: 1.5rem; font-weight: 800; line-height: 1.1; }
#bc-lower .bc-l-sub { font-size: 0.92rem; color: #bcd0dd; letter-spacing: 0.05em;
  margin-top: 3px; }
#bc-lower.bc-result .bc-l-sub { color: #6cff9a; font-weight: 800; font-size: 1.15rem; }
@keyframes bc-flash {
  0%   { background: rgba(108,255,154,0); }
  30%  { background: rgba(108,255,154,0.30); }
  100% { background: rgba(108,255,154,0); }
}
#bc-lower.bc-flash { animation: bc-flash 0.85s ease; }

/* C) Results — top-centre. */
#bc-results { top: 11%; left: 50%; transform: translateX(-50%); width: min(440px, 64vw); }
#bc-results .bc-row.bc-winner { background: rgba(243,195,74,0.16); }
#bc-results .bc-dist { flex: 0 0 84px; text-align: right; font-weight: 700;
  font-variant-numeric: tabular-nums; }
#bc-results .bc-winner .bc-name, #bc-results .bc-winner .bc-dist { color: #f3c34a; }
`;

/** 0xRRGGBB number (or CSS string) → CSS hex string. */
function cssColor(c) {
  if (typeof c === "number") return "#" + (c >>> 0).toString(16).padStart(6, "0");
  return c || "#888888";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Build the overlay once and return its imperative API.
 * @returns {{
 *   showStartList: (roster: Array<{rank:number,name:string,country:string,color:number}>) => void,
 *   showCompetitor: (a: {index:number,name:string,country:string,color:number}) => void,
 *   showResult: (distanceText: string) => void,
 *   showResults: (rows: Array<{rank:number,name:string,country:string,color:number,distanceText:string,isWinner:boolean}>) => void,
 *   hide: () => void,
 *   dispose: () => void,
 * }}
 */
export function createBroadcastOverlay() {
  if (!document.getElementById(STYLE_ID)) {
    const style = el("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const root = el("div");
  root.id = "bc-overlay";

  // A) Start list.
  const start = el("div", "bc-panel");
  start.id = "bc-start";
  const startRows = el("div");
  start.append(el("div", "bc-title", "Long Jump — Start List"), startRows);

  // B) Lower-third.
  const lower = el("div", "bc-panel");
  lower.id = "bc-lower";
  const accent = el("div", "bc-accent");
  const body = el("div", "bc-body");
  const lName = el("div", "bc-l-name");
  const lSub = el("div", "bc-l-sub");
  body.append(lName, lSub);
  lower.append(accent, body);

  // C) Results table.
  const results = el("div", "bc-panel");
  results.id = "bc-results";
  const resRows = el("div");
  results.append(el("div", "bc-title", "Long Jump — Results"), resRows);

  root.append(start, lower, results);
  document.body.appendChild(root);

  const show = (node) => node.classList.add("bc-show");
  const fade = (node) => node.classList.remove("bc-show");

  function rosterRow(a, withDist) {
    const row = el("div", "bc-row" + (a.isWinner ? " bc-winner" : ""));
    row.append(
      el("span", "bc-rank", a.rank),
      Object.assign(el("span", "bc-chip"), { style: `background:${cssColor(a.color)}` }),
      el("span", "bc-cc", a.country),
      el("span", "bc-name", (a.isWinner ? "🏆 " : "") + a.name),
    );
    if (withDist) row.append(el("span", "bc-dist", a.distanceText));
    return row;
  }

  function showStartList(roster) {
    fade(lower);
    fade(results);
    clear(startRows);
    roster.forEach((a) => startRows.appendChild(rosterRow(a, false)));
    show(start);
  }

  function showCompetitor({ name, country, color }) {
    fade(start);
    fade(results);
    lower.classList.remove("bc-result", "bc-flash");
    accent.style.background = cssColor(color);
    lName.textContent = name;
    clear(lSub);
    lSub.append(el("span", "bc-cc", country), document.createTextNode("  ·  Attempt 1"));
    show(lower);
  }

  function showResult(distanceText) {
    lower.classList.add("bc-result");
    lSub.textContent = distanceText;
    // Restart the flash animation even if the class is already present.
    lower.classList.remove("bc-flash");
    void lower.offsetWidth; // force reflow
    lower.classList.add("bc-flash");
    show(lower);
  }

  function showResults(rows) {
    fade(start);
    fade(lower);
    clear(resRows);
    rows.forEach((r) => resRows.appendChild(rosterRow(r, true)));
    show(results);
  }

  function hide() {
    fade(start);
    fade(lower);
    fade(results);
  }

  function dispose() {
    root.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  return { showStartList, showCompetitor, showResult, showResults, hide, dispose };
}
