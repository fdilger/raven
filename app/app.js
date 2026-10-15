/* raven — matrix reasoning benchmark on the MaRs-IB item bank */
"use strict";

const STORE_KEY = "raven-state-v1";
const view = document.getElementById("view");
const tooltip = document.getElementById("tooltip");

let MANIFEST = null;
let ITEMS = [];            // manifest items
let BY_ID = new Map();
let state = loadState();   // { sessions: [], attempts: { itemId: [attempt] } }
let quiz = null;           // active quiz session

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { sessions: [], attempts: {} }; }
  catch { return { sessions: [], attempts: {} }; }
}
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

/* Difficulty buckets by pooled norm accuracy (n≈650 sample) */
const BUCKETS = [
  { key: "easy",   label: "Easy",   test: a => a >= 85 },
  { key: "medium", label: "Medium", test: a => a >= 60 && a < 85 },
  { key: "hard",   label: "Hard",   test: a => a >= 35 && a < 60 },
  { key: "brutal", label: "Brutal", test: a => a < 35 },
];
function bucketOf(item) {
  const a = item.normPooled?.acc ?? 50;
  return BUCKETS.find(b => b.test(a)).key;
}

/* ---------- boot ---------- */
fetch("manifest.json").then(r => r.json()).then(m => {
  MANIFEST = m;
  ITEMS = m.items;
  BY_ID = new Map(ITEMS.map(i => [i.id, i]));
  nav("home");
});

document.querySelectorAll(".navbtn").forEach(b =>
  b.addEventListener("click", () => {
    if (quiz && !quiz.done && !confirm("Abandon the current session?")) return;
    stopQuiz();
    nav(b.dataset.nav);
  }));

function nav(name) {
  document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  if (name === "home") renderHome();
  else if (name === "practice") renderPractice();
  else if (name === "infinite") renderInfinite();
  else if (name === "stats") renderStats();
}

function itemOf(id) {
  return BY_ID.get(id) || GEN_STUBS.get(id) || { id, num: id, normPooled: null };
}

/* ---------- helpers ---------- */
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function svgEl(markup) {
  const t = document.createElement("template");
  t.innerHTML = `<svg>${markup.trim()}</svg>`;
  return t.content.firstChild.firstChild;
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtMs(ms) {
  if (ms == null) return "—";
  return ms < 10000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms / 1000) + "s";
}
function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(x) { return Math.round(x) + "%"; }

function segControl(options, initial, onChange) {
  const seg = el(`<div class="seg"></div>`);
  let value = initial;
  for (const o of options) {
    const b = el(`<button>${o.label}</button>`);
    if (o.value === initial) b.classList.add("on");
    b.addEventListener("click", () => {
      value = o.value;
      seg.querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      onChange && onChange(value);
    });
    seg.appendChild(b);
  }
  seg.value = () => value;
  return seg;
}

/* ---------- home / benchmark setup ---------- */
function renderHome() {
  view.innerHTML = "";
  const done = new Set(state.sessions.filter(s => s.mode === "benchmark").map(s => s.form + "/" + s.variant));
  const card = el(`<div class="card">
    <h1>Timed benchmark</h1>
    <p class="lede">The MaRs-IB protocol: one test form, items in fixed order, 30 seconds per item,
    8 minutes total. No feedback until the end. Score is compared against the published sample
    (n≈650, ages 11–33) on exactly the items you saw.</p>
  </div>`);
  const opts = el(`<div class="card"><div class="optrow"></div></div>`);
  const row = opts.querySelector(".optrow");

  const formSeg = segControl(
    ["tf1", "tf2", "tf3"].map(f => ({ value: f, label: f.toUpperCase() })), "tf1");
  const varSeg = segControl(
    [{ value: "pd", label: "Paired-difference" }, { value: "md", label: "Minimal-difference" }], "pd");
  const timeSeg = segControl(
    [{ value: "classic", label: "Classic (8 min)" }, { value: "extended", label: "Extended (16 min)" },
     { value: "off", label: "No total cap" }, { value: "none", label: "No timers" }], "classic");
  const recSeg = segControl(
    [{ value: false, label: "Recorded" }, { value: true, label: "Casual" }], false);

  row.appendChild(group("Test form", formSeg));
  row.appendChild(group("Distractors", varSeg));
  row.appendChild(group("Time limit", timeSeg));
  row.appendChild(group("Stats", recSeg));

  const hint = el(`<p class="mutednote">Forms are parallel (same 80 puzzles, different shapes).
    Minimal-difference distractors are slightly harder. Runs you've already done:
    ${done.size ? [...done].map(d => d.replace("/", " · ")).join(", ") : "none yet"}.</p>`);
  const start = el(`<button class="bigbtn">Start benchmark</button>`);
  start.addEventListener("click", () => {
    const t = timeSeg.value();
    const totalCap = { classic: 8 * 60e3, extended: 16 * 60e3, off: Infinity, none: Infinity }[t];
    const form = formSeg.value();
    const items = ITEMS.filter(i => i.form === form).sort((a, b) => a.num - b.num);
    startQuiz({
      mode: "benchmark", form, variant: varSeg.value(), casual: recSeg.value(),
      items, itemCapMs: t === "none" ? Infinity : 30e3, totalCapMs: totalCap, feedback: false,
    });
  });
  opts.appendChild(hint);
  opts.appendChild(start);
  view.appendChild(card);
  view.appendChild(opts);

  if (state.sessions.length) {
    const last = state.sessions[state.sessions.length - 1];
    view.appendChild(el(`<p class="mutednote">Last session: ${describeSession(last)} — see Stats for history.</p>`));
  }

  function group(label, control) {
    const g = el(`<div class="optgroup"><label class="head">${label}</label></div>`);
    g.appendChild(control);
    return g;
  }
}

function describeSession(s) {
  const when = new Date(s.t).toLocaleString();
  return `${s.mode} ${s.form || ""} — ${s.nCorrect}/${s.nSeen} correct (${pct(100 * s.nCorrect / Math.max(1, s.nSeen))}), ${when}`;
}

/* ---------- practice setup ---------- */
function renderPractice() {
  view.innerHTML = "";
  const card = el(`<div class="card">
    <h1>Practice</h1>
    <p class="lede">Untimed drills with immediate feedback. Pick a difficulty band —
    bands come from the published per-item accuracy (Easy ≥85%, Medium 60–85%, Hard 35–60%,
    Brutal &lt;35% of participants correct). Least-practiced items are served first.</p>
  </div>`);
  const opts = el(`<div class="card"><div class="optrow"></div></div>`);
  const row = opts.querySelector(".optrow");

  const bucketSeg = segControl(
    [{ value: "all", label: "All" }, ...BUCKETS.map(b => ({ value: b.key, label: b.label }))], "all");
  const nSeg = segControl([10, 20, 40].map(n => ({ value: n, label: String(n) })), 20);
  const varSeg = segControl(
    [{ value: "random", label: "Random" }, { value: "pd", label: "PD" }, { value: "md", label: "MD" }], "random");

  const recSeg = segControl(
    [{ value: false, label: "Recorded" }, { value: true, label: "Casual" }], false);
  row.appendChild(wrap("Difficulty", bucketSeg));
  row.appendChild(wrap("Items", nSeg));
  row.appendChild(wrap("Distractors", varSeg));
  row.appendChild(wrap("Stats", recSeg));

  const counts = {};
  for (const it of ITEMS) counts[bucketOf(it)] = (counts[bucketOf(it)] || 0) + 1;
  opts.appendChild(el(`<p class="mutednote">Bank: ${ITEMS.length} items — ${BUCKETS.map(b => `${b.label} ${counts[b.key] || 0}`).join(", ")}.</p>`));

  const start = el(`<button class="bigbtn">Start practice</button>`);
  start.addEventListener("click", () => {
    const bucket = bucketSeg.value();
    let pool = ITEMS.filter(i => bucket === "all" || bucketOf(i) === bucket);
    // fewest attempts first, random within groups
    pool = shuffled(pool).sort((a, b) =>
      (state.attempts[a.id]?.length || 0) - (state.attempts[b.id]?.length || 0));
    startQuiz({
      mode: "practice", variant: varSeg.value(), casual: recSeg.value(),
      items: pool.slice(0, nSeg.value()), itemCapMs: Infinity, totalCapMs: Infinity, feedback: true,
    });
  });
  opts.appendChild(start);
  view.appendChild(card);
  view.appendChild(opts);

  function wrap(label, control) {
    const g = el(`<div class="optgroup"><label class="head">${label}</label></div>`);
    g.appendChild(control);
    return g;
  }
}

/* ---------- procedural generator (infinite mode) ----------
   Rule taxonomy after Carpenter et al. (1990): constant-in-a-row/column,
   quantitative progression, distribution-of-three, figure arithmetic.
   Difficulty tier = number of simultaneously active rules (1–4). */
const GEN_STUBS = new Map();
const G_SHAPES = ["circle", "square", "triangle", "pentagon", "star", "diamond"];
const G_ORIENTED = ["triangle", "arrow", "tee", "semi"];
const G_SIZES = [14, 22, 30, 38];          // half-extent in a 100px cell
const G_SHADES = ["#ffffff", "#c3c3c3", "#7a7a7a", "#141414"];
const G_ROTS = [0, 90, 180, 270];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function rndPick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function rndShuffle(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function regularPoly(n, r, rot0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (rot0 + i * 360 / n) * Math.PI / 180;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
function starPts(r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (-90 + i * 36) * Math.PI / 180;
    pts.push(`${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
function shapeMarkup(shape, r, fill) {
  const st = `stroke="#111" stroke-width="3" fill="${fill}"`;
  switch (shape) {
    case "circle":   return `<circle r="${r}" ${st}/>`;
    case "square": { const s = (r * 0.85).toFixed(1); return `<rect x="-${s}" y="-${s}" width="${2 * s}" height="${2 * s}" ${st}/>`; }
    case "diamond":  return `<polygon points="0,-${r} ${r},0 0,${r} -${r},0" ${st}/>`;
    case "triangle": return `<polygon points="0,-${r} ${(r * 0.87).toFixed(1)},${(r * 0.5).toFixed(1)} -${(r * 0.87).toFixed(1)},${(r * 0.5).toFixed(1)}" ${st}/>`;
    case "pentagon": return `<polygon points="${regularPoly(5, r, -90)}" ${st}/>`;
    case "star":     return `<polygon points="${starPts(r)}" ${st}/>`;
    case "arrow":    return `<polygon points="0,-${r} ${(r * 0.62).toFixed(1)},0 ${(r * 0.26).toFixed(1)},0 ${(r * 0.26).toFixed(1)},${r} -${(r * 0.26).toFixed(1)},${r} -${(r * 0.26).toFixed(1)},0 -${(r * 0.62).toFixed(1)},0" ${st}/>`;
    case "tee":      return `<polygon points="-${r},-${r} ${r},-${r} ${r},-${(r * 0.4).toFixed(1)} ${(r * 0.3).toFixed(1)},-${(r * 0.4).toFixed(1)} ${(r * 0.3).toFixed(1)},${r} -${(r * 0.3).toFixed(1)},${r} -${(r * 0.3).toFixed(1)},-${(r * 0.4).toFixed(1)} -${r},-${(r * 0.4).toFixed(1)}" ${st}/>`;
    case "semi":     return `<path d="M -${r},0 A ${r} ${r} 0 0 1 ${r},0 Z" ${st}/>`;
  }
}

/* One cell's appearance: indices into the domains above + satellite dot count */
function cellMarkup(t, shapes) {
  const r = G_SIZES[t.size];
  let s = `<rect width="100" height="100" fill="#fff"/>`;
  for (let i = 0; i < t.count; i++)
    s += `<circle cx="${17 + i * 22}" cy="12" r="5" fill="#111"/>`;
  s += `<g transform="translate(50,56) rotate(${G_ROTS[t.rot]})">${shapeMarkup(shapes[t.shape], r, G_SHADES[t.shade])}</g>`;
  return s;
}

/* Build a 3x3 grid of indices for one attribute under a given rule */
function valueGrid(rule, domainLen, rnd, subtle, cyclic) {
  const g = [];
  const distinct3 = () => {
    if (subtle && domainLen >= 3) {           // adjacent values: harder to spot
      const s = Math.floor(rnd() * (domainLen - 2));
      return rndShuffle(rnd, [s, s + 1, s + 2]);
    }
    return rndShuffle(rnd, [...Array(domainLen).keys()]).slice(0, 3);
  };
  switch (rule) {
    case "const_all": { const v = Math.floor(rnd() * domainLen);
      for (let i = 0; i < 9; i++) g.push(v); break; }
    case "const_row": { const vs = distinct3();
      for (let i = 0; i < 9; i++) g.push(vs[Math.floor(i / 3)]); break; }
    case "const_col": { const vs = distinct3();
      for (let i = 0; i < 9; i++) g.push(vs[i % 3]); break; }
    case "dist3": { const vs = distinct3(); const shift = Math.floor(rnd() * 3);
      for (let i = 0; i < 9; i++) g.push(vs[(Math.floor(i / 3) + (i % 3) + shift) % 3]); break; }
    case "prog": { const dir = rnd() < 0.5 ? 1 : -1;
      // cyclic (wrap-around) progressions only where wrapping is natural, i.e. rotation
      for (let row = 0; row < 3; row++) {
        let base;
        if (cyclic) base = Math.floor(rnd() * domainLen);
        else base = dir === 1 ? Math.floor(rnd() * (domainLen - 2)) : 2 + Math.floor(rnd() * (domainLen - 2));
        for (let col = 0; col < 3; col++)
          g.push(((base + dir * col) % domainLen + domainLen) % domainLen);
      } break; }
    case "arith": {                            // count only: c1 + c2 = c3
      for (let row = 0; row < 3; row++) {
        const a = Math.floor(rnd() * 3), b = Math.floor(rnd() * 3);
        g.push(a, b, a + b);
      } break; }
  }
  return g;
}

const G_ATTRS = {
  shape: { domain: () => G_SHAPES.length, rules: ["dist3", "const_row", "const_col"] },
  size:  { domain: () => G_SIZES.length,  rules: ["prog", "dist3"] },
  shade: { domain: () => G_SHADES.length, rules: ["prog", "dist3"] },
  rot:   { domain: () => G_ROTS.length,   rules: ["prog", "dist3"] },
  count: { domain: () => 5,               rules: ["prog", "arith", "dist3"] },
};

function genItem(tier, seed) {
  const rnd = mulberry32(seed);
  const names = Object.keys(G_ATTRS);
  const active = rndShuffle(rnd, names).slice(0, tier);
  const subtle = tier >= 4;
  const shapes = active.includes("rot") ? G_ORIENTED : G_SHAPES;

  const grids = {};
  for (const name of names) {
    const domainLen = name === "shape" ? shapes.length : G_ATTRS[name].domain();
    if (active.includes(name)) {
      let rule = rndPick(rnd, G_ATTRS[name].rules);
      if (name === "count" && rule === "prog") rule = rnd() < 0.5 ? "prog" : "arith";
      grids[name] = valueGrid(rule, domainLen, rnd, subtle && name !== "shape", name === "rot");
    } else {
      // inactive attributes stay constant; keep clutter down
      const v = name === "count" ? 0
        : name === "rot" ? 0
        : name === "size" ? 2
        : Math.floor(rnd() * domainLen);
      grids[name] = Array(9).fill(v);
    }
  }
  // count progression can produce values > domain when arith; clamp check not needed (max 4)

  const tupleAt = i => ({
    shape: grids.shape[i], size: grids.size[i], shade: grids.shade[i],
    rot: grids.rot[i], count: grids.count[i],
  });
  const key = t => `${t.shape}|${t.size}|${t.shade}|${t.rot}|${t.count}`;
  const correct = tupleAt(8);

  // distractors: perturb the correct tuple using values seen in the matrix
  const usedVals = {};
  for (const name of names) usedVals[name] = [...new Set(grids[name].slice(0, 8))];
  const seen = new Set([key(correct)]);
  const distractors = [];
  let guard = 0;
  while (distractors.length < 3 && guard++ < 200) {
    const d = { ...correct };
    const nChanges = subtle ? 1 : (rnd() < 0.6 ? 1 : 2);
    const changeAttrs = rndShuffle(rnd, rnd() < 0.75 && active.length ? active : names).slice(0, nChanges);
    for (const name of changeAttrs) {
      const domainLen = name === "shape" ? shapes.length : G_ATTRS[name].domain();
      const pool = usedVals[name].filter(v => v !== d[name]);
      d[name] = pool.length ? rndPick(rnd, pool)
        : (d[name] + 1 + Math.floor(rnd() * (domainLen - 1))) % domainLen;
    }
    if (!seen.has(key(d))) { seen.add(key(d)); distractors.push(d); }
  }
  // pathological fallback: force-change one attribute deterministically
  while (distractors.length < 3) {
    const d = { ...correct, shape: (correct.shape + distractors.length + 1) % shapes.length };
    if (!seen.has(key(d))) { seen.add(key(d)); distractors.push(d); }
  }

  const cell = t => cellMarkup(t, shapes);
  const gap = 6, cs = 100, W = 3 * cs + 4 * gap;
  let matrix = `<svg class="genmatrix" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${W}" fill="#fff"/>`;
  for (let i = 0; i < 9; i++) {
    const x = gap + (i % 3) * (cs + gap), y = gap + Math.floor(i / 3) * (cs + gap);
    matrix += `<g transform="translate(${x},${y})">`;
    matrix += i === 8
      ? `<rect width="100" height="100" fill="#fff"/><text x="50" y="66" text-anchor="middle" font-size="48" fill="#999" font-family="sans-serif">?</text>`
      : cell(tupleAt(i));
    matrix += `<rect width="100" height="100" fill="none" stroke="#ddd" stroke-width="1.5"/></g>`;
  }
  matrix += `</svg>`;

  const tile = t => `<svg class="gentile" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${cell(t)}<rect width="100" height="100" fill="none" stroke="#ddd" stroke-width="1.5"/></svg>`;
  const choices = [tile(correct), ...distractors.map(tile)];   // index 0 correct

  return {
    id: `gen-t${tier}-${seed}`, num: `t${tier}·${String(seed).slice(-4)}`,
    tier, seed, gen: { matrix, choices }, normPooled: null,
  };
}

/* ---------- infinite setup ---------- */
function renderInfinite() {
  view.innerHTML = "";
  view.appendChild(el(`<div class="card">
    <h1>Infinite mode</h1>
    <p class="lede">Procedurally generated puzzles — the same way commercial test vendors and
    the RAVEN/PGM research datasets make theirs (rule grammars over shape, size, shade,
    rotation and count; Carpenter et al. 1990 taxonomy). Unlimited items, no repeats,
    no human norms. Tier = number of simultaneous rules.</p>
  </div>`));
  const opts = el(`<div class="card"><div class="optrow"></div></div>`);
  const row = opts.querySelector(".optrow");

  const tierSeg = segControl([
    { value: 1, label: "T1 · one rule" }, { value: 2, label: "T2 · two" },
    { value: 3, label: "T3 · three" }, { value: 4, label: "T4 · four, subtle" },
  ], 2);
  const nSeg = segControl([10, 20, 40].map(n => ({ value: n, label: String(n) })), 20);
  const modeSeg = segControl([
    { value: "drill", label: "Drill (feedback)" },
    { value: "sprint", label: "Sprint (30s/item)" },
  ], "drill");

  const recSeg = segControl(
    [{ value: false, label: "Recorded" }, { value: true, label: "Casual" }], false);
  row.appendChild(wrap("Difficulty", tierSeg));
  row.appendChild(wrap("Items", nSeg));
  row.appendChild(wrap("Mode", modeSeg));
  row.appendChild(wrap("Stats", recSeg));

  const start = el(`<button class="bigbtn">Generate &amp; start</button>`);
  start.addEventListener("click", () => {
    const tier = tierSeg.value(), sprint = modeSeg.value() === "sprint";
    const items = [];
    for (let i = 0; i < nSeg.value(); i++) {
      const seed = (Math.random() * 2 ** 31) >>> 0;
      const it = genItem(tier, seed);
      GEN_STUBS.set(it.id, it);
      items.push(it);
    }
    startQuiz({
      mode: "infinite", variant: "gen", tier, items, casual: recSeg.value(),
      itemCapMs: sprint ? 30e3 : Infinity, totalCapMs: Infinity, feedback: !sprint,
    });
  });
  opts.appendChild(start);
  view.appendChild(opts);

  function wrap(label, control) {
    const g = el(`<div class="optgroup"><label class="head">${label}</label></div>`);
    g.appendChild(control);
    return g;
  }
}

/* ---------- quiz engine ---------- */
function startQuiz(cfg) {
  quiz = {
    ...cfg,
    idx: 0, results: [], done: false,
    startT: performance.now(), itemStartT: null, timerId: null,
  };
  renderQuizItem();
}
function stopQuiz() {
  if (quiz?.timerId) clearInterval(quiz.timerId);
  quiz = null;
}
function quizVariantFor(item) {
  const v = quiz.variant === "random" ? (Math.random() < 0.5 ? "md" : "pd") : quiz.variant;
  return item.choices[v] ? v : (item.choices.pd ? "pd" : "md");
}

function renderQuizItem() {
  const total = quiz.items.length;
  if (quiz.idx >= total || (performance.now() - quiz.startT) > quiz.totalCapMs) {
    return finishQuiz();
  }
  const item = quiz.items[quiz.idx];
  const isGen = !!item.gen;
  const variant = isGen ? "gen" : quizVariantFor(item);
  const tiles = isGen ? item.gen.choices : item.choices[variant];
  const order = shuffled([0, 1, 2, 3]);   // position -> tile index; tile 0 is correct

  view.innerHTML = "";
  const head = el(`<div class="quizhead">
    <span class="prog">${quiz.idx + 1} / ${total}</span>
    <div class="timerbar"><div style="width:100%"></div></div>
    <span class="totaltime"></span>
  </div>`);
  const matrixHtml = isGen ? item.gen.matrix
    : `<img src="${item.matrix}" alt="3×3 matrix with a missing cell">`;
  const wrap = el(`<div class="card">
    <div class="matrixwrap">${matrixHtml}</div>
    <div class="choices"></div>
    <div class="feedbackrow"></div>
  </div>`);
  const choicesEl = wrap.querySelector(".choices");
  order.forEach((tileIdx, pos) => {
    const tileHtml = isGen ? tiles[tileIdx] : `<img src="${tiles[tileIdx]}" alt="option ${pos + 1}">`;
    const c = el(`<div class="choice" tabindex="0">
      <span class="key">${pos + 1}</span>${tileHtml}
    </div>`);
    c.addEventListener("click", () => answer(tileIdx, pos));
    choicesEl.appendChild(c);
  });
  view.appendChild(head);
  view.appendChild(wrap);

  // preload next item
  const next = quiz.items[quiz.idx + 1];
  if (next && !next.gen) {
    [next.matrix, ...(next.choices.pd || []), ...(next.choices.md || [])]
      .forEach(src => { const im = new Image(); im.src = src; });
  }

  quiz.itemStartT = performance.now();
  let answered = false;
  const bar = head.querySelector(".timerbar");
  const barFill = bar.firstChild;
  const totalEl = head.querySelector(".totaltime");
  const keyHandler = e => {
    const k = parseInt(e.key, 10);
    if (k >= 1 && k <= 4 && !answered) answer(order[k - 1], k - 1);
  };
  document.addEventListener("keydown", keyHandler);

  quiz.timerId = setInterval(() => {
    const itemElapsed = performance.now() - quiz.itemStartT;
    const totalElapsed = performance.now() - quiz.startT;
    if (isFinite(quiz.itemCapMs)) {
      const left = Math.max(0, 1 - itemElapsed / quiz.itemCapMs);
      barFill.style.width = (left * 100) + "%";
      bar.classList.toggle("low", left < 0.25);
    } else {
      barFill.style.width = "100%";
    }
    totalEl.textContent = isFinite(quiz.totalCapMs)
      ? fmtClock(quiz.totalCapMs - totalElapsed) + " left"
      : fmtClock(totalElapsed);
    if (!answered && itemElapsed > quiz.itemCapMs) record(null, null);
    else if (totalElapsed > quiz.totalCapMs) { if (!answered) record(null, null); }
  }, 250);

  function answer(tileIdx, pos) { if (!answered) record(tileIdx, pos); }

  function record(tileIdx, pos) {
    answered = true;
    clearInterval(quiz.timerId);
    document.removeEventListener("keydown", keyHandler);
    const rtMs = Math.round(performance.now() - quiz.itemStartT);
    const correct = tileIdx === 0;
    const res = { itemId: item.id, variant, correct, timeout: tileIdx == null, rtMs, t: Date.now(), mode: quiz.mode };
    quiz.results.push(res);
    if (!quiz.casual) {
      (state.attempts[item.id] = state.attempts[item.id] || []).push(res);
      saveState();
    }

    if (quiz.feedback) {
      const fb = wrap.querySelector(".feedbackrow");
      choicesEl.querySelectorAll(".choice").forEach((c, p) => {
        if (order[p] === 0) c.classList.add("correct");
        else if (p === pos) c.classList.add("wrong");
        c.style.pointerEvents = "none";
      });
      const normAcc = item.normPooled?.acc;
      const normNote = normAcc != null
        ? ` (sample: ${normAcc}% correct, median ${fmtMs(item.normPooled?.rtMedian)})`
        : ` (generated, tier ${item.tier})`;
      fb.innerHTML = `<span class="msg ${correct ? "good" : "bad"}">${correct ? "Correct" : (tileIdx == null ? "Time" : "Wrong")}</span>
        <span class="mutednote"> — ${fmtMs(rtMs)}${normNote}
        </span><br><button class="bigbtn ghost" style="margin-top:8px">Next →</button>`;
      const nextBtn = fb.querySelector("button");
      nextBtn.focus();
      const go = () => { document.removeEventListener("keydown", onKey); quiz.idx++; renderQuizItem(); };
      const onKey = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
      nextBtn.addEventListener("click", go);
      document.addEventListener("keydown", onKey);
    } else {
      quiz.idx++;
      renderQuizItem();
    }
  }
}

function finishQuiz() {
  if (quiz.timerId) clearInterval(quiz.timerId);
  const r = quiz.results;
  const nSeen = r.length;
  const nCorrect = r.filter(x => x.correct).length;
  const seenItems = r.map(x => itemOf(x.itemId));
  const normAccs = seenItems.map(i => i.normPooled?.acc).filter(a => a != null);
  const expCorrect = normAccs.reduce((s, a) => s + a / 100, 0);
  const session = {
    t: Date.now(), mode: quiz.mode, form: quiz.form || null, variant: quiz.variant,
    nSeen, nCorrect, expCorrect: Math.round(expCorrect * 10) / 10,
    medianRt: median(r.filter(x => x.correct).map(x => x.rtMs)),
    durationMs: Math.round(performance.now() - quiz.startT),
    results: r,
  };
  if (nSeen > 0 && !quiz.casual) { state.sessions.push(session); saveState(); }
  quiz.done = true;

  view.innerHTML = "";
  const acc = nSeen ? 100 * nCorrect / nSeen : 0;
  const sampleAcc = normAccs.length ? normAccs.reduce((a, b) => a + b, 0) / normAccs.length : null;
  view.appendChild(el(`<div class="card"><h1>Session complete</h1>
    <p class="lede">${quiz.mode === "benchmark" ? `Form ${quiz.form.toUpperCase()}, ${quiz.variant} distractors.`
      : quiz.mode === "infinite" ? `Generated items, tier ${quiz.tier}.` : "Practice run."}${quiz.casual ? " Casual — not saved to stats." : ""}</p></div>`));

  const tiles = el(`<div class="tiles"></div>`);
  tiles.appendChild(tile("Score", `${nCorrect}<span class="unit"> / ${nSeen}</span>`,
    normAccs.length ? `sample average on these items: ${session.expCorrect}` : `generated, tier ${quiz.tier ?? "—"} (chance = ${nSeen ? Math.round(nSeen / 4 * 10) / 10 : 0})`));
  tiles.appendChild(tile("Accuracy", pct(acc),
    sampleAcc != null ? `sample: ${pct(sampleAcc)} on same items` : ""));
  tiles.appendChild(tile("Median RT (correct)", fmtMs(session.medianRt),
    sampleRtNote(seenItems, r)));
  tiles.appendChild(tile("Duration", fmtClock(session.durationMs), ""));
  view.appendChild(tiles);

  const wrongs = r.filter(x => !x.correct);
  if (wrongs.length) {
    const c = el(`<div class="card"><h2 style="margin-top:0">Missed items</h2>
      <p class="mutednote">${wrongs.map(x => {
        const it = itemOf(x.itemId);
        const tag = it.normPooled ? `sample ${it.normPooled.acc}%` : `tier ${it.tier ?? "?"}`;
        return `#${it.num} (${x.timeout ? "timeout" : "wrong"}, ${tag})`;
      }).join(" · ")}</p></div>`);
    view.appendChild(c);
  }

  const backTo = quiz.mode === "benchmark" ? "home" : quiz.mode === "infinite" ? "infinite" : "practice";
  const again = el(`<button class="bigbtn">Back to ${quiz.mode} setup</button>`);
  again.addEventListener("click", () => { stopQuiz(); nav(backTo); });
  const statsBtn = el(`<button class="bigbtn ghost" style="margin-left:10px">View stats</button>`);
  statsBtn.addEventListener("click", () => { stopQuiz(); nav("stats"); });
  const btnrow = el(`<div style="margin-top:8px"></div>`);
  btnrow.appendChild(again); btnrow.appendChild(statsBtn);
  view.appendChild(btnrow);

  function tile(k, v, d) {
    return el(`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`);
  }
  function sampleRtNote(items, results) {
    const ratios = results.filter(x => x.correct).map(x => {
      const m = itemOf(x.itemId).normPooled?.rtMedian;
      return m ? x.rtMs / m : null;
    }).filter(Boolean);
    const med = median(ratios);
    if (med == null) return "";
    return med <= 1 ? `${Math.round((1 - med) * 100)}% faster than sample medians`
                    : `${Math.round((med - 1) * 100)}% slower than sample medians`;
  }
}

/* ---------- stats ---------- */
function attemptsFlat() {
  const out = [];
  for (const [id, list] of Object.entries(state.attempts))
    for (const a of list) out.push({ ...a, itemId: id });
  return out;
}

function renderStats() {
  view.innerHTML = "";
  const all = attemptsFlat();
  if (!all.length) {
    view.appendChild(el(`<div class="card"><h1>Stats</h1>
      <p class="lede">No attempts yet — run a benchmark or practice session first.</p></div>`));
    return;
  }

  const marsAtts = all.filter(a => BY_ID.has(a.itemId));
  const genAtts = all.filter(a => a.itemId.startsWith("gen-"));
  const nCorrect = all.filter(a => a.correct).length;
  const acc = 100 * nCorrect / all.length;
  const itemsSeen = new Set(marsAtts.map(a => a.itemId));
  const normAccSeen = [...itemsSeen].map(id => BY_ID.get(id)?.normPooled?.acc).filter(a => a != null);
  const sampleAcc = normAccSeen.length ? normAccSeen.reduce((a, b) => a + b, 0) / normAccSeen.length : null;

  view.appendChild(el(`<div class="card"><h1>Stats</h1>
    <p class="lede">All-time performance. MaRs-IB items are compared to the published sample
    (n≈650 per item, ages 11–33); generated items are tracked by tier.</p></div>`));

  const tiles = el(`<div class="tiles"></div>`);
  tiles.appendChild(tileEl("Attempts", String(all.length),
    `${itemsSeen.size} / ${ITEMS.length} bank items seen · ${genAtts.length} generated`));
  tiles.appendChild(tileEl("Accuracy", pct(acc), sampleAcc != null ? `sample avg on seen bank items: ${pct(sampleAcc)}` : ""));
  const bmarks = state.sessions.filter(s => s.mode === "benchmark");
  tiles.appendChild(tileEl("Benchmarks run", String(bmarks.length),
    bmarks.length ? `best: ${Math.max(...bmarks.map(s => s.nCorrect))}/80` : ""));
  tiles.appendChild(tileEl("Median RT (correct)", fmtMs(median(all.filter(a => a.correct).map(a => a.rtMs))), ""));
  view.appendChild(tiles);

  /* chart: accuracy by difficulty bucket, you vs sample */
  if (marsAtts.length) {
    const chartCard = el(`<div class="card"><h2 style="margin-top:0">Item bank: accuracy by difficulty</h2>
      <div class="legend">
        <span><span class="sw" style="background:var(--series-you)"></span>You</span>
        <span><span class="sw" style="background:var(--series-norm)"></span>Published sample</span>
      </div></div>`);
    chartCard.appendChild(bucketChart(marsAtts));
    view.appendChild(chartCard);
  }

  /* chart: generated items by tier */
  if (genAtts.length) {
    const genCard = el(`<div class="card"><h2 style="margin-top:0">Generated items: accuracy by tier</h2>
      <p class="mutednote">Chance level is 25%.</p></div>`);
    genCard.appendChild(tierChart(genAtts));
    view.appendChild(genCard);
  }

  /* benchmark history */
  if (bmarks.length) {
    const hist = el(`<div class="card"><h2 style="margin-top:0">Benchmark history</h2><ul class="sessionlist"></ul></div>`);
    const ul = hist.querySelector("ul");
    for (const s of bmarks.slice().reverse()) {
      ul.appendChild(el(`<li><span class="when">${new Date(s.t).toLocaleString()}</span>
        <span>${(s.form || "").toUpperCase()} · ${s.variant}</span>
        <span><strong>${s.nCorrect}/${s.nSeen}</strong> (sample avg ${s.expCorrect})</span>
        <span>${fmtClock(s.durationMs)}</span></li>`));
    }
    view.appendChild(hist);
  }

  /* per-item table (bank items only — generated items are one-shot) */
  if (marsAtts.length) {
    const tableCard = el(`<div class="card"><h2 style="margin-top:0">Per-item breakdown (bank)</h2>
      <p class="mutednote">Items you've attempted. Δ = your accuracy − sample accuracy (positive = you beat the sample).</p>
      <div style="overflow-x:auto"></div></div>`);
    tableCard.querySelector("div[style]").appendChild(itemTable(marsAtts));
    view.appendChild(tableCard);
  }

  const danger = el(`<p class="mutednote" style="margin-top:20px">
    <button class="bigbtn ghost" id="reset">Reset all history</button></p>`);
  danger.querySelector("#reset").addEventListener("click", () => {
    if (confirm("Delete all attempts and sessions?")) {
      state = { sessions: [], attempts: {} };
      saveState(); renderStats();
    }
  });
  view.appendChild(danger);

  function tileEl(k, v, d) {
    return el(`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`);
  }
}

function bucketChart(all) {
  // per bucket: your acc, sample acc weighted by your exposure
  const rows = BUCKETS.map(b => {
    const atts = all.filter(a => bucketOf(BY_ID.get(a.itemId)) === b.key);
    if (!atts.length) return { label: b.label, you: null, norm: null, n: 0 };
    const you = 100 * atts.filter(a => a.correct).length / atts.length;
    const norm = atts.reduce((s, a) => s + (BY_ID.get(a.itemId).normPooled?.acc ?? 0), 0) / atts.length;
    return { label: b.label, you, norm, n: atts.length };
  });

  const W = 720, H = 240, padL = 8, padB = 24, padT = 14;
  const plotH = H - padB - padT;
  const groupW = (W - padL * 2) / rows.length;
  const barW = 34, gap = 2;
  const svg = el(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Accuracy by difficulty bucket, you versus published sample"></svg>`);
  const y = v => padT + plotH * (1 - v / 100);

  svg.appendChild(svgEl(`<g class="axis"><line x1="${padL}" y1="${y(0)}" x2="${W - padL}" y2="${y(0)}"></line></g>`));

  rows.forEach((r, i) => {
    const cx = padL + groupW * i + groupW / 2;
    if (r.you != null) {
      svg.appendChild(bar(cx - barW - gap / 2, r.you, "bar-you", `You — ${r.label}: ${pct(r.you)} (${r.n} attempts)`));
      svg.appendChild(bar(cx + gap / 2, r.norm, "bar-norm", `Sample — ${r.label}: ${pct(r.norm)}`));
      svg.appendChild(svgEl(`<text class="dlabel" x="${cx - gap / 2 - barW / 2}" y="${y(r.you) - 5}" text-anchor="middle">${Math.round(r.you)}</text>`));
      svg.appendChild(svgEl(`<text x="${cx + gap / 2 + barW / 2}" y="${y(r.norm) - 5}" text-anchor="middle">${Math.round(r.norm)}</text>`));
    } else {
      svg.appendChild(svgEl(`<text x="${cx}" y="${y(0) - 8}" text-anchor="middle">no data</text>`));
    }
    svg.appendChild(svgEl(`<text x="${cx}" y="${H - 6}" text-anchor="middle">${r.label}${r.n ? ` (${r.n})` : ""}</text>`));
  });

  function bar(x, v, cls, tip) {
    const h = Math.max(2, plotH * v / 100);
    const g = svgEl(`<g><rect class="${cls}" x="${x}" y="${y(0) - h}" width="${barW}" height="${h}" rx="4" ry="4"></rect>
      <rect x="${x}" y="${y(0) - Math.min(h, 6)}" width="${barW}" height="${Math.min(h, 6)}" class="${cls}"></rect></g>`);
    g.addEventListener("mousemove", e => showTip(e, tip));
    g.addEventListener("mouseleave", hideTip);
    return g;
  }
  return svg;
}

function tierChart(genAtts) {
  const rows = [1, 2, 3, 4].map(t => {
    const atts = genAtts.filter(a => a.itemId.startsWith(`gen-t${t}-`));
    if (!atts.length) return { label: `T${t}`, you: null, n: 0 };
    return { label: `T${t}`, you: 100 * atts.filter(a => a.correct).length / atts.length, n: atts.length };
  });
  const W = 720, H = 220, padL = 8, padB = 24, padT = 14;
  const plotH = H - padB - padT;
  const groupW = (W - padL * 2) / rows.length;
  const barW = 44;
  const svg = el(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Generated items: accuracy by tier"></svg>`);
  const y = v => padT + plotH * (1 - v / 100);
  svg.appendChild(svgEl(`<g class="axis"><line x1="${padL}" y1="${y(0)}" x2="${W - padL}" y2="${y(0)}"></line>
    <line x1="${padL}" y1="${y(25)}" x2="${W - padL}" y2="${y(25)}" stroke-dasharray="4 4"></line>
    <text x="${W - padL - 4}" y="${y(25) - 4}" text-anchor="end">chance 25%</text></g>`));
  rows.forEach((r, i) => {
    const cx = padL + groupW * i + groupW / 2;
    if (r.you != null) {
      const h = Math.max(2, plotH * r.you / 100);
      const g = svgEl(`<g><rect class="bar-you" x="${cx - barW / 2}" y="${y(0) - h}" width="${barW}" height="${h}" rx="4" ry="4"></rect></g>`);
      g.addEventListener("mousemove", e => showTip(e, `T${i + 1}: ${pct(r.you)} over ${r.n} attempts`));
      g.addEventListener("mouseleave", hideTip);
      svg.appendChild(g);
      svg.appendChild(svgEl(`<text class="dlabel" x="${cx}" y="${y(r.you) - 5}" text-anchor="middle">${Math.round(r.you)}</text>`));
    } else {
      svg.appendChild(svgEl(`<text x="${cx}" y="${y(0) - 8}" text-anchor="middle">no data</text>`));
    }
    svg.appendChild(svgEl(`<text x="${cx}" y="${H - 6}" text-anchor="middle">${r.label}${r.n ? ` (${r.n})` : ""}</text>`));
  });
  return svg;
}

function itemTable(all) {
  const byItem = new Map();
  for (const a of all) {
    const rec = byItem.get(a.itemId) || { n: 0, c: 0, rts: [] };
    rec.n++; if (a.correct) { rec.c++; rec.rts.push(a.rtMs); }
    byItem.set(a.itemId, rec);
  }
  const rows = [...byItem.entries()].map(([id, r]) => {
    const it = BY_ID.get(id);
    const you = 100 * r.c / r.n;
    const norm = it.normPooled?.acc;
    return {
      id, num: it.num, form: it.form, dim: it.dim, n: r.n, you,
      norm, delta: norm != null ? you - norm : null,
      rt: median(r.rts), normRt: it.normPooled?.rtMedian,
    };
  });

  let sortKey = "delta", sortDir = 1;
  const table = el(`<table class="items"><thead><tr>
    <th data-k="id">Item</th><th data-k="dim">Dim</th><th data-k="n">Tries</th>
    <th data-k="you">You</th><th data-k="norm">Sample</th><th data-k="delta">Δ</th>
    <th data-k="rt">Your RT</th><th data-k="normRt">Sample RT</th>
  </tr></thead><tbody></tbody></table>`);
  const tbody = table.querySelector("tbody");
  table.querySelectorAll("th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    sortDir = (k === sortKey) ? -sortDir : 1;
    sortKey = k;
    draw();
  }));
  draw();
  return table;

  function draw() {
    rows.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    tbody.innerHTML = "";
    for (const r of rows) {
      const deltaCls = r.delta == null ? "" : r.delta >= 0 ? "delta-pos" : "delta-neg";
      tbody.appendChild(el(`<tr>
        <td>${r.form} #${r.num}</td><td>${r.dim ?? "—"}</td><td>${r.n}</td>
        <td>${pct(r.you)}</td><td>${r.norm != null ? pct(r.norm) : "—"}</td>
        <td class="${deltaCls}">${r.delta != null ? (r.delta >= 0 ? "+" : "") + Math.round(r.delta) : "—"}</td>
        <td>${fmtMs(r.rt)}</td><td>${fmtMs(r.normRt)}</td></tr>`));
    }
  }
}

/* ---------- tooltip ---------- */
function showTip(e, text) {
  tooltip.hidden = false;
  tooltip.textContent = text;
  tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 220) + "px";
  tooltip.style.top = (e.clientY + 12) + "px";
}
function hideTip() { tooltip.hidden = true; }
