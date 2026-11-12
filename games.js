/* Cinnabar Games: Cesium (cesium.html), small built-in games, and any web game you add by link. */
"use strict";
let UI;
const BUNDLED = [
  { id: "cesium", name: "Cesium", by: "Classroom game platform", href: "cesium.html", color: "#2f7fd8", letter: "Cs", text: "Classes, live quiz games, a coin shop and a gradebook. For school accounts." },
];
const BUILTIN = [
  { id: "blitz", name: "Math Blitz", by: "Built in", color: "#e2361f", letter: "±", text: "60 seconds. How many sums can you get right?", run: mathBlitz },
  { id: "snake", name: "Ember Snake", by: "Built in", color: "#ff7a1a", letter: "~", text: "Arrow keys or WASD. Eat embers, don't bite yourself.", run: emberSnake },
  { id: "type", name: "Type Sprint", by: "Built in", color: "#7a4fd1", letter: "Aa", text: "Type the words as fast as you can.", run: typeSprint },
];
const KEY = "cb-games-custom";
const custom = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const best = (id, v) => { try { const k = "cb-best-" + id, b = +localStorage.getItem(k) || 0; if (v > b) localStorage.setItem(k, v); return Math.max(v || 0, b); } catch { return v || 0; } };

function render() {
  UI.title.textContent = "Games";
  const v = UI.view = hubView(UI.view);
  UI.actions.innerHTML = "";
  UI.actions.append(cbEl("button", { class: "btn primary", text: "Add a web game", onclick: addGame }));
  const tiles = cbEl("div", { class: "tiles" });
  for (const g of [...BUNDLED, ...BUILTIN, ...custom().map(c => ({ ...c, by: new URL(c.src).host, color: cbColorFor(c.src), letter: c.name[0], custom: true }))]) {
    const t = cbEl("button", { class: "tile game", onclick: () => play(g) },
      cbEl("div", { class: "art", style: { background: `radial-gradient(circle at 30% 20%, ${g.color}, #120b09 80%)` } }, cbEl("span", { class: "glyph-big", text: g.letter })),
      cbEl("div", { class: "body" }, cbEl("b", { text: g.name, style: { color: "var(--text)", fontSize: "15px" } }), cbEl("span", { text: g.text || g.by }), g.run ? cbEl("span", { class: "chip", text: "Best " + best(g.id), style: { alignSelf: "flex-start" } }) : null));
    if (g.custom) t.addEventListener("contextmenu", e => { e.preventDefault(); cbMenu(e.clientX, e.clientY, [{ label: "Remove " + g.name, icon: "trash", danger: true, run: () => { localStorage.setItem(KEY, JSON.stringify(custom().filter(c => c.src !== g.src))); render(); } }]); });
    tiles.append(t);
  }
  tiles.append(cbEl("button", { class: "tile add game", onclick: addGame, html: cbIcon("plus") + "<span>Add a web game</span>" }));
  v.append(cbEl("div", { class: "muted", style: { marginBottom: "6px" }, text: "Right-click a game you added to remove it." }), tiles);
}
async function addGame() {
  const f = await hubForm("Add a web game", [{ key: "name", label: "Name", required: true }, { key: "src", label: "Link", placeholder: "https://…", required: true }], "Add");
  if (!f) return;
  if (!/^https:\/\//i.test(f.src)) return cbToast("Use an https:// link");
  try { new URL(f.src); } catch { return cbToast("That link isn't valid"); }
  try { localStorage.setItem(KEY, JSON.stringify([...custom().filter(c => c.src !== f.src), { name: f.name, src: f.src }])); } catch { return cbToast("Couldn't save the game here"); }
  render();
}
function player(g) {
  const close = () => { p.remove(); removeEventListener("keydown", esc, true); render(); };
  const esc = e => { if (e.key === "Escape" && !document.fullscreenElement) close(); };
  const p = cbEl("div", { class: "player" }, cbEl("div", { class: "pbar" },
    cbEl("button", { class: "btn ghost", onclick: close }, cbIconEl("left"), cbEl("span", { text: "Games" })),
    cbEl("b", { text: g.name, style: { flex: 1 } }),
    cbEl("button", { class: "btn ghost", text: "Full screen", onclick: () => p.requestFullscreen?.() })));
  addEventListener("keydown", esc, true);
  document.body.append(p);
  return p;
}
function play(g) {
  if (g.href) return void (location.href = g.href);   // part of Cinnabar, not a game in a box
  if (g.custom) return window.open(g.src, "_blank", "noopener");   // other sites keep their own sign-in and storage
  const p = player(g);
  if (g.src) return p.append(cbEl("iframe", { src: g.src, allow: "fullscreen; clipboard-write; autoplay", title: g.name }));
  const stage = cbEl("div", { style: { flex: 1, display: "grid", placeItems: "center", background: `radial-gradient(circle at 50% 30%, ${g.color}33, #000 70%)`, color: "#fff" } });
  p.append(stage); g.run(stage, g);
}

/* ── Math Blitz ── */
function mathBlitz(stage, g) {
  let score = 0, left = 60, a, b, op, ans;
  const qEl = cbEl("div", { style: { font: "700 64px var(--display)" } }), inp = cbEl("input", { class: "field", inputmode: "numeric", style: { width: "220px", height: "56px", fontSize: "28px", textAlign: "center" } });
  const info = cbEl("div", { class: "muted", style: { fontSize: "18px" } });
  const next = () => {
    op = "+-×"[Math.floor(Math.random() * 3)];
    a = 2 + Math.floor(Math.random() * (op === "×" ? 11 : 50)); b = 2 + Math.floor(Math.random() * (op === "×" ? 11 : 50));
    if (op === "-" && b > a) [a, b] = [b, a];
    ans = op === "+" ? a + b : op === "-" ? a - b : a * b; qEl.textContent = `${a} ${op} ${b}`; inp.value = "";
  };
  const show = () => { info.textContent = `Score ${score} · ${left}s`; };
  inp.oninput = () => { if (+inp.value === ans && inp.value !== "") { score++; qEl.animate([{ transform: "scale(1.15)", color: "#9fe0b2" }, { transform: "scale(1)" }], 220); next(); show(); } };
  const t = setInterval(() => {
    if (!stage.isConnected) return clearInterval(t);
    if (--left <= 0) { clearInterval(t); stage.innerHTML = ""; stage.append(over(score, best(g.id, score), () => { stage.innerHTML = ""; mathBlitz(stage, g); })); return; }
    show();
  }, 1000);
  stage.append(cbEl("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" } }, qEl, inp, info));
  next(); show(); setTimeout(() => inp.focus(), 50);
}
function over(score, top, again) {
  return cbEl("div", { class: "anim", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" } },
    cbEl("div", { text: "Game over", style: { font: "700 40px var(--display)" } }), cbEl("div", { text: `Score ${score} · Best ${top}`, style: { fontSize: "20px" } }),
    cbEl("button", { class: "btn primary", text: "Play again", onclick: again }));
}

/* ── Ember Snake ── */
function emberSnake(stage, g) {
  const N = 24, C = Math.floor(Math.min(innerWidth * .9, innerHeight - 140) / N);
  const cv = cbEl("canvas", { width: N * C, height: N * C, style: { borderRadius: "12px", background: "#120b09", boxShadow: "0 20px 60px rgba(0,0,0,.6)" } }), x = cv.getContext("2d");
  const info = cbEl("div", { style: { fontSize: "18px", marginTop: "10px", textAlign: "center" } });
  let snake = [[12, 12], [11, 12], [10, 12]], dir = [1, 0], want = [1, 0], food, score = 0, dead = false;
  const place = () => { do food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; while (snake.some(s => s[0] === food[0] && s[1] === food[1])); };
  const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  const key = e => { const k = keys[e.key]; if (k && (k[0] !== -dir[0] || k[1] !== -dir[1])) { want = k; e.preventDefault(); } };
  addEventListener("keydown", key);
  place();
  const tick = () => {
    if (!stage.isConnected) { removeEventListener("keydown", key); return; }
    dir = want;
    const h = [(snake[0][0] + dir[0] + N) % N, (snake[0][1] + dir[1] + N) % N];
    if (snake.some(s => s[0] === h[0] && s[1] === h[1])) { dead = true; removeEventListener("keydown", key); stage.innerHTML = ""; stage.append(over(score, best(g.id, score), () => { stage.innerHTML = ""; emberSnake(stage, g); })); return; }
    snake.unshift(h);
    if (h[0] === food[0] && h[1] === food[1]) { score++; place(); } else snake.pop();
    x.clearRect(0, 0, cv.width, cv.height);
    const glow = x.createRadialGradient((food[0] + .5) * C, (food[1] + .5) * C, 1, (food[0] + .5) * C, (food[1] + .5) * C, C);
    glow.addColorStop(0, "#ffd28a"); glow.addColorStop(1, "rgba(255,74,28,0)"); x.fillStyle = glow; x.fillRect((food[0] - .5) * C, (food[1] - .5) * C, C * 2, C * 2);
    snake.forEach((s, i) => { x.fillStyle = `hsl(${12 + i * 2} 85% ${60 - Math.min(i, 30)}%)`; x.beginPath(); x.roundRect(s[0] * C + 1, s[1] * C + 1, C - 2, C - 2, 5); x.fill(); });
    info.textContent = "Score " + score;
    if (!dead) setTimeout(tick, Math.max(55, 120 - score * 3));
  };
  stage.append(cbEl("div", {}, cv, info));
  tick();
}

/* ── Type Sprint ── */
function typeSprint(stage, g) {
  const WORDS = "mercury trident cinnabar ember planet orbit silver comet nova quartz signal window kernel engine rocket sketch garden thunder pixel lantern harbor canvas meadow crystal falcon velvet summit".split(" ");
  let i = 0, score = 0, left = 45, word;
  const wEl = cbEl("div", { style: { font: "700 56px var(--display)", letterSpacing: ".02em" } }), inp = cbEl("input", { class: "field", style: { width: "320px", height: "52px", fontSize: "24px", textAlign: "center" }, autocomplete: "off", spellcheck: false });
  const info = cbEl("div", { class: "muted", style: { fontSize: "18px" } });
  const next = () => { word = WORDS[Math.floor(Math.random() * WORDS.length)]; wEl.textContent = word; inp.value = ""; i++; };
  inp.oninput = () => { wEl.style.color = word.startsWith(inp.value) ? "#fff" : "#ff8b78"; if (inp.value === word) { score++; next(); info.textContent = `Words ${score} · ${left}s`; } };
  const t = setInterval(() => {
    if (!stage.isConnected) return clearInterval(t);
    if (--left <= 0) { clearInterval(t); stage.innerHTML = ""; stage.append(over(score, best(g.id, score), () => { stage.innerHTML = ""; typeSprint(stage, g); })); return; }
    info.textContent = `Words ${score} · ${left}s`;
  }, 1000);
  stage.append(cbEl("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" } }, wEl, inp, info));
  next(); info.textContent = `Words 0 · ${left}s`; setTimeout(() => inp.focus(), 50);
}

(async () => { UI = await hubBoot("Games"); render(); })();
