
const $ = (s) => document.querySelector(s);

const STORAGE_KEY = "tdt_v23_state";

const state = {
  names: { A:"Jugador A", B:"Jugador B" },
  sets: { A:0, B:0 },
  games: { A:0, B:0 },
  points: { A:0, B:0 },
  matchMode: "standard", // standard | tiebreak | super
  isTiebreak: false,
  tb: { A:0, B:0 },
  tbStartingServer: "A",
  currentServer: "A",
  matchFinished: false,

  point: null, // current point
  matchPoints: [], // completed points
  undoStack: [],

  ui: { theme:"dark", coach:true, showHistoryArrows:true, hideScore:false, rotated:false, hideRail:false }
};

const playerName = (id)=> (state.names && state.names[id]) ? state.names[id] : (id==="A" ? "Jugador A" : "Jugador B");
const playerNameSafe = (id)=> escapeHtml(playerName(id));


function refreshABOptionLabels(){
  const nameA = playerName("A");
  const nameB = playerName("B");
  const setOptText = (selId, val, txt)=>{
    const opt = document.querySelector(`#${selId} option[value="${val}"]`);
    if (opt) opt.textContent = txt;
  };
  ["fServer","fWinner","sServer","chartsPlayer"].forEach(id=>{
    setOptText(id,"A", nameA);
    setOptText(id,"B", nameB);
  });
}

function formatSnapshot(s){
  const nameA = playerName("A");
  const nameB = playerName("B");
  return String(s||"")
    .replace(/\bSrv A\b/g, `Srv ${nameA}`)
    .replace(/\bSrv B\b/g, `Srv ${nameB}`);
}



function persist(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.error(e);
    try{ toast("⚠️ No se pudo guardar (almacenamiento lleno o bloqueado)"); }catch(_){}
  }
}
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, s);
    // safety defaults
    state.names = state.names || {A:"Jugador A",B:"Jugador B"};
    state.sets = state.sets || {A:0,B:0};
    state.games = state.games || {A:0,B:0};
    state.points = state.points || {A:0,B:0};
    state.matchMode = state.matchMode || "standard";
    state.tb = state.tb || {A:0,B:0};
    state.undoStack = state.undoStack || [];
    state.matchPoints = state.matchPoints || [];
    state.setHistory = state.setHistory || [];
    // UI flags (bloqueamos tema en oscuro y modo entrenador activado)
    state.ui = state.ui || {theme:"dark", coach:true, showHistoryArrows:true, hideScore:false, rotated:false, hideRail:false};
    if (typeof state.ui.showHistoryArrows === "undefined") state.ui.showHistoryArrows = true;
    if (typeof state.ui.hideScore === "undefined") state.ui.hideScore = false;
    if (typeof state.ui.rotated === "undefined") state.ui.rotated = false;
    if (typeof state.ui.hideRail === "undefined") state.ui.hideRail = false;
  }catch(e){ console.error(e); }
}

function toast(msg){
  const t=$("#toast");
  if (!t) return;
  t.textContent=msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1400);
}
// --- Guardar / Cargar partido (local) ---
const SAVED_MATCHES_KEY = "tdt_saved_matches_v1";

function getSavedMatches(){
  try{
    const raw = localStorage.getItem(SAVED_MATCHES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    console.error(e);
    return [];
  }
}
function setSavedMatches(arr){
  try{ localStorage.setItem(SAVED_MATCHES_KEY, JSON.stringify(arr||[])); }
  catch(e){ console.error(e); toast("⚠️ No se pudo guardar la lista de partidos"); }
}

function openGameMode(){
  // sync radio to current mode
  const mode = state.matchMode || "standard";
  document.querySelectorAll('input[name="gameMode"]').forEach(r=>{
    r.checked = (r.value === mode);
  });
  openModal("#gameModeModal");
}
function closeGameMode(){ closeModal("#gameModeModal"); }

function applyGameMode(){
  const sel = document.querySelector('input[name="gameMode"]:checked');
  const mode = sel ? sel.value : "standard";
  if (mode === (state.matchMode || "standard")){ closeGameMode(); return; }
  state.matchMode = mode;
  toast("✅ Modo de juego: " + (mode==="standard" ? "Normal" : mode==="tiebreak" ? "Tie-break" : "Super tie-break"));
  // reiniciar marcador e historial para evitar inconsistencias
  newMatch();
  closeGameMode();
}

function openSaveLoad(mode){
  state.ui = state.ui || {};
  state.ui.saveLoadMode = mode || state.ui.saveLoadMode || "save";
  const m = state.ui.saveLoadMode;

  // tabs
  const tSave = $("#tabSaveMatch");
  const tLoad = $("#tabLoadMatch");
  const pSave = $("#saveMatchPane");
  const pLoad = $("#loadMatchPane");
  if (tSave) tSave.classList.toggle("active", m==="save");
  if (tLoad) tLoad.classList.toggle("active", m==="load");
  if (pSave) pSave.classList.toggle("hidden", m!=="save");
  if (pLoad) pLoad.classList.toggle("hidden", m!=="load");

  if (m==="load") renderSavedMatchesList();
  const nm = $("#saveMatchName");
  if (nm && !nm.value) nm.value = `${playerName("A")} vs ${playerName("B")} · ${new Date().toLocaleDateString()}`;
  openModal("#saveLoadModal");
}

function closeSaveLoad(){ closeModal("#saveLoadModal"); }

function renderSavedMatchesList(){
  const list = $("#savedMatchesList");
  if (!list) return;
  const saved = getSavedMatches();
  list.innerHTML = "";
  if (!saved.length){
    list.innerHTML = `<div class="muted" style="padding:10px;">No hay partidos guardados.</div>`;
    return;
  }

  saved.sort((a,b)=> (b.when||0) - (a.when||0));
  saved.forEach(item=>{
    const row = document.createElement("div");
    row.className = "savedItem";
    const when = item.when ? new Date(item.when).toLocaleString() : "";
    row.innerHTML = `
      <div style="min-width:0;">
        <div class="savedItemTitle">${escapeHtml(item.name || "Partido")}</div>
        <div class="savedItemMeta">${escapeHtml(when)} · ${item.pointsCount ?? (item.state?.matchPoints?.length ?? 0)} puntos</div>
      </div>
      <div class="savedItemActions">
        <button class="chip good" type="button" data-act="load">Cargar</button>
        <button class="chip warn" type="button" data-act="del">Borrar</button>
      </div>
    `;
    row.querySelector('[data-act="load"]').addEventListener("click", ()=>{
      loadSavedMatch(item.id);
    });
    row.querySelector('[data-act="del"]').addEventListener("click", ()=>{
      deleteSavedMatch(item.id);
    });
    list.appendChild(row);
  });
}

function saveCurrentMatch(){
  const name = ($("#saveMatchName")?.value || "").trim() || `Partido ${new Date().toLocaleString()}`;
  const saved = getSavedMatches();
  const id = "m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);

  // store full state snapshot (including current point) for exact resume
  const snapshot = JSON.parse(JSON.stringify(state));
  saved.push({
    id,
    name,
    when: Date.now(),
    pointsCount: snapshot.matchPoints ? snapshot.matchPoints.length : 0,
    state: snapshot
  });
  setSavedMatches(saved);
  toast("✅ Partido guardado");
  renderSavedMatchesList();
}

function loadSavedMatch(id){
  const saved = getSavedMatches();
  const item = saved.find(x=>x.id===id);
  if (!item || !item.state){ toast("No se pudo cargar"); return; }
  // replace state
  const snap = item.state;
  Object.keys(state).forEach(k=>{ delete state[k]; });
  Object.assign(state, snap);

  // safety defaults (similar a load())
  state.names = state.names || {A:"Jugador A",B:"Jugador B"};
  state.sets = state.sets || {A:0,B:0};
  state.games = state.games || {A:0,B:0};
  state.points = state.points || {A:0,B:0};
  state.tb = state.tb || {A:0,B:0};
  state.ui = state.ui || { theme:"dark", coach:true, hideScore:false, rotated:false, hideRail:false };
  state.matchPoints = Array.isArray(state.matchPoints) ? state.matchPoints : [];
  state.undoStack = Array.isArray(state.undoStack) ? state.undoStack : [];

  // ensure point exists
  if (!state.point) initPoint();
  persist();
  renderAll();
  closeSaveLoad();
  toast("✅ Partido cargado");
}

function deleteSavedMatch(id){
  let saved = getSavedMatches();
  const before = saved.length;
  saved = saved.filter(x=>x.id!==id);
  if (saved.length===before) return;
  setSavedMatches(saved);
  renderSavedMatchesList();
  toast("🗑️ Eliminado");
}


function escapeHtml(str){
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/\'/g,"&#039;");
}

function other(p){ return p==="A"?"B":"A"; }

function scoreLabel(){
  // For UI badge
  if (state.isTiebreak) return `TB ${state.tb.A}-${state.tb.B}`;
  const pA = state.points.A, pB = state.points.B;
  const map = ["0","15","30","40"];
  if (pA>=3 && pB>=3){
    if (pA===pB) return "DEUCE";
    return (pA>pB) ? "AD A" : "AD B";
  }
  return `${map[pA] ?? pA}-${map[pB] ?? pB}`;
}

function serveSideLabel(){
  // SD when sum points is even (including TB points)
  const sum = state.isTiebreak ? (state.tb.A + state.tb.B) : (state.points.A + state.points.B);
  return (sum % 2 === 0) ? "SD" : "SV";
}

function initPoint(){
  const side = serveSideLabel();
  state.point = {
    server: state.currentServer,
    side,
    phase: "serve", // serve | rally
    firstServeFault: false,
    events: [], // {type:"serve"/"rally", player, code, meta, elId}
    arrows: [], // flechas de dirección (durante el punto)
  };
  clearLiveArrows();
  updateZoneHint();
  renderPoint();
  applyTapConstraints();
}

function snapshotMatchState(){
  return {
    sets:{...state.sets},
    games:{...state.games},
    points:{...state.points},
    isTiebreak: state.isTiebreak,
    tb:{...state.tb},
    tbStartingServer: state.tbStartingServer,
    currentServer: state.currentServer,
  };
}
function restoreMatchState(snap){
  if (!snap) return;
  state.sets={...snap.sets};
  state.games={...snap.games};
  state.points={...snap.points};
  state.isTiebreak=!!snap.isTiebreak;
  state.tb={...snap.tb};
  state.tbStartingServer=snap.tbStartingServer||"A";
  state.currentServer=snap.currentServer||"A";
}

function updateScoring(winner){
  const mode = state.matchMode || "standard";
  // Match en modo tie-break / super tie-break (sin juegos/sets)
  if (mode !== "standard"){
    // aseguramos modo TB
    state.isTiebreak = true;
    state.tb = state.tb || {A:0,B:0};
    if (!state.tbStartingServer) state.tbStartingServer = state.currentServer || "A";
    state.tb[winner] = (state.tb[winner]||0) + 1;
    // switch server based on tiebreak rules: 1 then every 2
    const total = (state.tb.A||0) + (state.tb.B||0);
    const start = state.tbStartingServer;
    let server = start;
    if (total === 0) server = start;
    else if (total === 1) server = other(start);
    else {
      const block = Math.floor((total-2)/2);
      server = (block % 2 === 0) ? start : other(start);
    }
    state.currentServer = server;

    const a = state.tb.A||0, b = state.tb.B||0;
    const target = (mode === "super") ? 10 : 7;
    if ((a>=target || b>=target) && Math.abs(a-b)>=2){
      state.matchFinished = true;
    }
    return;
  }

  if (state.isTiebreak){

    state.tb[winner] += 1;
    // switch server based on tiebreak rules: 1 then every 2
    const total = state.tb.A + state.tb.B;
    const start = state.tbStartingServer;
    let server = start;
    if (total === 0) server = start;
    else if (total === 1) server = other(start);
    else {
      const block = Math.floor((total-2)/2);
      server = (block % 2 === 0) ? start : other(start);
    }
    state.currentServer = server;

    // win TB at 7 by 2
    const a=state.tb.A, b=state.tb.B;
    if ((a>=7 || b>=7) && Math.abs(a-b)>=2){
      const setWinner = a>b ? "A":"B";
      // record completed set as 7-6 and store TB score
      const finA = state.games.A + (setWinner==="A" ? 1 : 0);
      const finB = state.games.B + (setWinner==="B" ? 1 : 0);
      state.setHistory = state.setHistory || [];
      state.setHistory.push({A:finA, B:finB, tb:`${a}-${b}`});
      state.sets[setWinner]+=1;
      state.games={A:0,B:0};
      state.points={A:0,B:0};
      state.isTiebreak=false;
      state.tb={A:0,B:0};
      // alternate starting server each new game
      state.currentServer = other(state.currentServer);
    }
    return;
  }

// normal game
  let a=state.points.A, b=state.points.B;
  if (a>=3 && b>=3){
    if (winner==="A") a+=1; else b+=1;
    // win by 2 after deuce
    if (Math.abs(a-b)>=2 && (a>=4 || b>=4)){
      const gameWinner = a>b ? "A":"B";
      state.games[gameWinner]+=1;
      state.points={A:0,B:0};
      state.currentServer = other(state.currentServer);

      // set tiebreak at 6-6
      if (state.games.A===6 && state.games.B===6){
        state.isTiebreak=true;
        state.tb={A:0,B:0};
        state.tbStartingServer = state.currentServer;
      }

      // set win at 6 by 2 (simple)
      if ((state.games.A>=6 || state.games.B>=6) && Math.abs(state.games.A-state.games.B)>=2){
        const setWinner = state.games.A>state.games.B ? "A":"B";
        state.setHistory = state.setHistory || [];
        state.setHistory.push({A:state.games.A, B:state.games.B});
        state.sets[setWinner]+=1;
        state.games={A:0,B:0};
        state.points={A:0,B:0};
        state.currentServer = other(state.currentServer);
      }
      return;
    }
    state.points={A:a,B:b};
    return;
  }

  // pre-deuce
  state.points[winner]+=1;
  if (state.points[winner]>=4){
    const gameWinner=winner;
    state.games[gameWinner]+=1;
    state.points={A:0,B:0};
    state.currentServer = other(state.currentServer);

    if (state.games.A===6 && state.games.B===6){
      state.isTiebreak=true;
      state.tb={A:0,B:0};
      state.tbStartingServer = state.currentServer;
    }
    if ((state.games.A>=6 || state.games.B>=6) && Math.abs(state.games.A-state.games.B)>=2){
        const setWinner = state.games.A>state.games.B ? "A":"B";
        state.setHistory = state.setHistory || [];
        state.setHistory.push({A:state.games.A, B:state.games.B});
        state.sets[setWinner]+=1;
      state.games={A:0,B:0};
      state.points={A:0,B:0};
      state.currentServer = other(state.currentServer);
    }
  }
}

function updateZoneHint(){
  const p = state.point;
  const hint = $("#zoneHint");
  const phase = $("#badgePhase");
  if (!p) return;

  if (p.phase==="serve"){
    if (hint) hint.textContent = `SAQUE (${p.server}) · lado ${p.side} · toca T/C/A`;
    if (phase) phase.textContent = "SAQUE";
  } else {
    if (hint) hint.textContent = `RALLY · toca dirección (P/M/C)`;
    if (phase) phase.textContent = "RALLY";
  }
}

let __lastTapHoldEl=null;
let __lastTapHoldTimer=null;

function flashTap(el, evt){
  if (!el) return;
  if (evt && typeof evt.clientX==="number"){
    const r=el.getBoundingClientRect();
    const x=((evt.clientX-r.left)/Math.max(1,r.width))*100;
    const y=((evt.clientY-r.top)/Math.max(1,r.height))*100;
    el.style.setProperty("--tap-x", `${x}%`);
    el.style.setProperty("--tap-y", `${y}%`);
  } else {
    el.style.setProperty("--tap-x","50%");
    el.style.setProperty("--tap-y","50%");
  }
  el.classList.remove("tapFlash");
  void el.offsetWidth;
  el.classList.add("tapFlash");
  setTimeout(()=>el.classList.remove("tapFlash"), 1350);

  if (__lastTapHoldEl && __lastTapHoldEl!==el){
    __lastTapHoldEl.classList.remove("tapHold");
  }
  __lastTapHoldEl = el;
  el.classList.add("tapHold");
  if (__lastTapHoldTimer) clearTimeout(__lastTapHoldTimer);
  __lastTapHoldTimer = setTimeout(()=>{
    if (__lastTapHoldEl){
      __lastTapHoldEl.classList.remove("tapHold");
      __lastTapHoldEl = null;
    }
  }, 1600);
}

/** ZONE LAYER **/
const Z = {
  // Rally grids: 3x3 for top half (B side) and bottom half (A side)
  rallyTop: { left:.16, top:.08, width:.68, height:.40 },    // B side (upper half)
  rallyBottom: { left:.16, top:.52, width:.68, height:.40 }, // A side (lower half)
  // Serve boxes region (two boxes), each split into T/C/A horizontally.
  serveTop: { left:.22, top:.285, width:.56, height:.18 },     // B receiving service boxes (upper service line area)
  serveBottom: { left:.22, top:.535, width:.56, height:.18 },  // A receiving boxes (lower service line area)
};


// ---------- ARROWS (direcciones) ----------
let __liveArrowCountRendered = 0;

function singlesBounds(){
  // Use rallyTop bounds (singles area)
  const left = Z.rallyTop.left;
  const right = Z.rallyTop.left + Z.rallyTop.width;
  const center = (left + right) / 2;
  return { left, right, center };
}

function baselineY(player){
  // Player A is bottom, player B is top
  const topY = Z.rallyTop.top + 0.005;
  const bottomY = (Z.rallyBottom.top + Z.rallyBottom.height) - 0.005;
  return (player === "A") ? bottomY : topY;
}

function serveOriginNorm(server, sideLabel){
  // sideLabel: "SD" (deuce) | "SV" (ventaja)
  const {left, right, center} = singlesBounds();
  const half = right - center;
  const frac = 0.25; // 1/4 of the quadrant from the inner edge (near center)
  // Mapping of deuce/ad to screen: top player is inverted
  // - server A (bottom): SD is right, SV is left
  // - server B (top):    SD is left,  SV is right
  const isRightHalf = (server === "A")
    ? (sideLabel === "SD")
    : (sideLabel === "SV");
  const x = isRightHalf ? (center + frac * half) : (center - frac * half);
  const y = baselineY(server);
  return {x, y};
}

function serveOrigin(server, sideLabel, scale=1){
  return serveOriginNorm(server, sideLabel);
}

function centerNormFromEl(el){
  const court = $("#court");
  if (!court || !el) return {x:0.5, y:0.5};
  const cr = court.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  let x = (er.left + er.width/2 - cr.left) / cr.width;
  let y = (er.top + er.height/2 - cr.top) / cr.height;
  if (state.ui && state.ui.rotated){ x = 1 - x; y = 1 - y; }
  return { x: clamp01(x), y: clamp01(y) };
}

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function extendToOpponentBaseline(from, through, opponent){
  const yT = baselineY(opponent);
  const dx = (through.x - from.x);
  const dy = (through.y - from.y);
  // If dy is ~0, just drop to target baseline
  if (Math.abs(dy) < 1e-6){
    return { x: through.x, y: yT };
  }
  const t = (yT - from.y) / dy;
  // ensure it goes beyond the through point
  const tt = Math.max(t, 1.02);
  return { x: from.x + dx*tt, y: from.y + dy*tt };
}

function lastArrowEnd(p){
  if (!p || !p.arrows || p.arrows.length===0) return null;
  return p.arrows[p.arrows.length-1].to;
}

function recordArrow({hitter, throughEl, isServe=false}){
  const p = state.point;
  if (!p) return;
  if (!p.arrows) p.arrows = [];

  const through = centerNormFromEl(throughEl);
  let from = null;

  if (isServe){
    from = serveOriginNorm(hitter, p.side);
  } else {
    from = lastArrowEnd(p) || { x: singlesBounds().center, y: baselineY(hitter) };
  }

  const opponent = other(hitter);
  const to = isServe ? extendToOpponentBaseline(from, through, opponent) : through;

  const n = p.arrows.length + 1;
  p.arrows.push({
    n,
    hitter,
    from: {x: clamp01(from.x), y: clamp01(from.y)},
    through: {x: clamp01(through.x), y: clamp01(through.y)},
    to: {x: clamp01(to.x), y: clamp01(to.y)}
  });

  renderLiveArrows(true);
}

function svgPt(pt){
  return { x: pt.x * 1000, y: pt.y * 1000 };
}

function arrowDefs(){
  return `
    <defs>
      <marker id="ahA" viewBox="0 0 10 10" refX="9.0" refY="5" markerWidth="8.2" markerHeight="8.2" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"></path>
      </marker>
      <marker id="ahB" viewBox="0 0 10 10" refX="9.0" refY="5" markerWidth="8.2" markerHeight="8.2" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--bad)"></path>
      </marker>
    </defs>`;
}

function renderArrows(svgEl, arrows, opts={}){
  if (!svgEl) return;
  const {animateFromIndex=null, fadeOld=true, highlightIndex=null} = opts;
  svgEl.innerHTML = arrowDefs();

  if (!arrows || arrows.length===0) return;

  // If a direction/segment is repeated (same geometry), offset it slightly so arrows + numbers don't overlap.
  const quant = (v)=> Math.round(v*1000)/1000;
  const keyFor = (a)=> [
    quant(a.from.x), quant(a.from.y),
    quant(a.through.x), quant(a.through.y),
    quant(a.to.x), quant(a.to.y),
    a.hitter
  ].join("|");

  const groups = new Map();
  arrows.forEach((a, idx)=>{
    const k = keyFor(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(idx);
  });

  const offsetUnits = new Array(arrows.length).fill(0);
  groups.forEach((idxs)=>{
    if (idxs.length<=1) return;
    const m = idxs.length;
    idxs.forEach((idx, i)=>{
      offsetUnits[idx] = i - (m-1)/2;
    });
  });

  const STEP = 20; // SVG units (viewBox 0..1000). ~separación entre flechas repetidas.
  const clampSvg = (v)=> Math.max(0, Math.min(1000, v));
  const applyOffset = (pt, px, py, amt)=> ({ x: clampSvg(pt.x + px*amt), y: clampSvg(pt.y + py*amt) });

  arrows.forEach((a, idx)=>{
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("data-idx", idx);

    let A = svgPt(a.from);
    let P = svgPt(a.through);
    let E = svgPt(a.to);

    const u = offsetUnits[idx] || 0;
    if (u){
      const dx = (E.x - A.x);
      const dy = (E.y - A.y);
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py =  dx / len;
      const amt = u * STEP;
      A = applyOffset(A, px, py, amt);
      P = applyOffset(P, px, py, amt);
      E = applyOffset(E, px, py, amt);
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${A.x.toFixed(1)} ${A.y.toFixed(1)} L ${P.x.toFixed(1)} ${P.y.toFixed(1)} L ${E.x.toFixed(1)} ${E.y.toFixed(1)}`);
    path.classList.add("arrowLine", (a.hitter==="A"?"a":"b"), "subtle");
    path.setAttribute("stroke-width", "4.2");
    path.setAttribute("marker-end", `url(#${a.hitter==="A"?"ahA":"ahB"})`);

    if (fadeOld && idx < arrows.length-6){
      path.classList.add("old");
    }

    if (highlightIndex!==null && idx===highlightIndex){
      path.setAttribute("stroke-width","5.2");
      path.style.opacity="1";
    }

    g.appendChild(path);

    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("cx", A.x.toFixed(1));
    c.setAttribute("cy", A.y.toFixed(1));
    c.setAttribute("r", "14");
    c.classList.add("arrowNumCircle", (a.hitter==="A"?"a":"b"));
    g.appendChild(c);

    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x", A.x.toFixed(1));
    t.setAttribute("y", A.y.toFixed(1));
    t.textContent = String(a.n);
    t.classList.add("arrowNumText");
    g.appendChild(t);

    svgEl.appendChild(g);

    // animate new arrows only
    if (animateFromIndex!==null && idx >= animateFromIndex){
      // use stroke-dash animation
      try{
        const len = path.getTotalLength();
        path.style.setProperty("--dash", String(Math.max(120, len)));
        path.classList.add("draw");
      }catch(e){}
    }
  });
}

function renderLiveArrows(animate=false){
  const svg = $("#arrowSvg");
  if (!svg) return;
  const p = state.point;
  const arrows = p && p.arrows ? p.arrows : [];
  if (!arrows || arrows.length===0){
    svg.innerHTML = arrowDefs();
    __liveArrowCountRendered = 0;
    return;
  }
  const animateFromIndex = (animate && arrows.length > __liveArrowCountRendered) ? __liveArrowCountRendered : null;
  __liveArrowCountRendered = arrows.length;
  renderArrows(svg, arrows, { animateFromIndex, fadeOld:true });
}

function clearLiveArrows(){
  const svg = $("#arrowSvg");
  if (svg) svg.innerHTML = arrowDefs();
  __liveArrowCountRendered = 0;
}

function replayArrowsIn(svgEl, arrows, opts={}){
  if (!svgEl || !arrows || arrows.length===0) return;
  const speed = Math.max(0.05, Number(opts.speed ?? 1)); // 1 = normal
  const baseDelay = Number(opts.baseDelay ?? 520);        // ms @ 1x
  const delay = Math.round(baseDelay / speed);

  svgEl.innerHTML = arrowDefs();
  let i = 0;
  const step = ()=>{
    renderArrows(svgEl, arrows.slice(0, i+1), { animateFromIndex:i, fadeOld:false, highlightIndex:i });
    i++;
    if (i < arrows.length){
      setTimeout(step, delay);
    }
  };
  step();
}


function clearZoneLayer(){ $("#zoneLayer").innerHTML=""; }

function makeGrid(id, rect, rows, cols, cellRenderer){
  const layer=$("#zoneLayer");
  const g=document.createElement("div");
  g.className="zoneGrid";
  g.id=id;
  g.style.left = (rect.left*100)+"%";
  g.style.top = (rect.top*100)+"%";
  g.style.width = (rect.width*100)+"%";
  g.style.height = (rect.height*100)+"%";
  g.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  for (let r=0;r<rows;r++){
    for (let c=0;c<cols;c++){
      g.appendChild(cellRenderer(r,c));
    }
  }
  layer.appendChild(g);
}

function buildZones(){
  clearZoneLayer();

  // Rally top (player B hitting to A half) — labels P/M/C from top to bottom
  makeGrid("rallyTop", Z.rallyTop, 3, 3, (r,c)=>{
    const btn=document.createElement("div");
    btn.className="zoneCell";
    btn.dataset.side="top";
    btn.dataset.row=r;
    btn.dataset.col=c;
    btn.innerHTML = `<span class="zoneTxt">${(r===0?"P":(r===1?"M":"C"))}</span>`;
    btn.addEventListener("click",(e)=>{ flashTap(btn,e); onRallyTap("top", r, c, btn); });
    return btn;
  });

  // Rally bottom (player A hitting to B half) — labels C/M/P from top to bottom (because closer to net is C)
  makeGrid("rallyBottom", Z.rallyBottom, 3, 3, (r,c)=>{
    const btn=document.createElement("div");
    btn.className="zoneCell";
    btn.dataset.side="bottom";
    btn.dataset.row=r;
    btn.dataset.col=c;
    btn.innerHTML = `<span class="zoneTxt">${(r===0?"C":(r===1?"M":"P"))}</span>`;
    btn.addEventListener("click",(e)=>{ flashTap(btn,e); onRallyTap("bottom", r, c, btn); });
    return btn;
  });

  // Serve: represent two boxes (left/right) split into T/C/A (3 columns each) => total 6 columns, 1 row
  const serveCell = (side, box, target, label)=>{
    const btn=document.createElement("div");
    btn.className="serveCell";
    btn.dataset.side=side;
    btn.dataset.box=box; // 0 left, 1 right
    btn.dataset.target=target; // T/C/A
    btn.innerHTML=`<span class="zoneTxt">SAQUE</span>`;
    btn.style.fontSize="11px";
    btn.style.fontWeight="1100";
    btn.addEventListener("click",(e)=>{ flashTap(btn,e); onServeTap(side, box, target, btn); });
    return btn;
  };

  // top serve area: 1 row, 6 cols
  makeGrid("serveTop", Z.serveTop, 1, 6, (r,c)=>{
    const box = c<3 ? 0 : 1;
    const idx = c%3;
    const target = idx===0 ? "T" : (idx===1 ? "C" : "A");
    return serveCell("top", box, target, "SAQUE");
  });
  makeGrid("serveBottom", Z.serveBottom, 1, 6, (r,c)=>{
    const box = c<3 ? 0 : 1;
    const idx = c%3;
    const target = idx===0 ? "T" : (idx===1 ? "C" : "A");
    return serveCell("bottom", box, target, "SAQUE");
  });

  renderZonesVisibility();
  applyTapConstraints();
}

function serveRequiredBox(neededSide, sideLabel){
  // sideLabel: SD (DEUCE) or SV (AD)
  // Mapping in top-view:
  // - Top half (player at top) DEUCE = left (box 0), AD = right (box 1)
  // - Bottom half (player at bottom) DEUCE = right (box 1), AD = left (box 0)
  if (neededSide==="top"){
    return sideLabel==="SD" ? 0 : 1;
  } else {
    return sideLabel==="SD" ? 1 : 0;
  }
}

function applyTapConstraints(){
  const p = state.point;
  // reset
  document.querySelectorAll(".zoneCell, .serveCell").forEach(el=>{
    el.classList.remove("disabled","hidden");
  });

  if (!p) return;

  if (p.phase==="serve"){
    const server = p.server;
    const neededSide = server==="A" ? "top" : "bottom";
    const otherSide = neededSide==="top" ? "bottom" : "top";

    // Only receiver side is clickable
    document.querySelectorAll(`.serveCell[data-side="${otherSide}"]`).forEach(el=>{
      el.classList.add("disabled");
    });

    const reqBox = serveRequiredBox(neededSide, p.side);

    // Only cross-court box for this side
    document.querySelectorAll(`.serveCell[data-side="${neededSide}"]`).forEach(el=>{
      const box = Number(el.dataset.box||"0");
      if (box !== reqBox){
        el.classList.add("disabled");
      }
    });
  }

  if (p.phase==="rally"){
    const server = p.server;
    const receiver = other(server);
    const rallyCount = p.events.filter(e=>e.type==="rally").length;
    const hitter = (rallyCount % 2 === 0) ? receiver : server;
    const expectedSide = (hitter==="A") ? "top" : "bottom"; // tap = lado donde cae la bola (opuesto al hitter)
    const otherSide = expectedSide==="top" ? "bottom" : "top";

    // Only expected side clickable
    document.querySelectorAll(`.zoneCell[data-side="${otherSide}"]`).forEach(el=>{
      el.classList.add("disabled");
    });
  }
}

function renderZonesVisibility(){
  const p = state.point;
  const showServe = p && p.phase==="serve";
  const serveTop=$("#serveTop"), serveBottom=$("#serveBottom");
  const rallyTop=$("#rallyTop"), rallyBottom=$("#rallyBottom");
  if (serveTop) serveTop.classList.toggle("hidden", !showServe);
  if (serveBottom) serveBottom.classList.toggle("hidden", !showServe);
  if (rallyTop) rallyTop.classList.toggle("hidden", showServe);
  if (rallyBottom) rallyBottom.classList.toggle("hidden", showServe);
}

function zoneCodeFromTap(side, row, col){
  // side indicates who is hitting (top => player B is hitting from top half? Actually top grid corresponds to player B hitting direction.)
  // We'll map direction based on col and shot side (cross/parallel) using previous shot.
  // We'll keep a simplified: col 0 = CC, col 1 = MV, col 2 = PP (cross/medio/parallel)
  const depth = (side==="top") ? (row===0?"P":(row===1?"M":"C")) : (row===0?"C":(row===1?"M":"P"));
  const dir = (col===0 ? "CC" : (col===1 ? "MV" : "PP"));
  // Combine: e.g. CP / MP / CC
  // For rally codes we use: CC/CP/MV/PP/MP/MC etc.
  // We'll output two-letter: first direction letter: C/M/P depth plus dir? user wants CP, MP, CC etc.
  // We'll use: if dir=CC then code = (depth==="C" ? "CC" : depth+"C") ; if dir=PP then code=depth+"P"; if MV then code="M"+(depth==="P"?"P":(depth==="C"?"C":"M"))?
  if (col===0){
    return depth==="C" ? "CC" : (depth==="M" ? "MC" : "PC");
  }
  if (col===2){
    return depth==="P" ? "PP" : (depth==="M" ? "MP" : "CP");
  }
  // middle
  return depth==="M" ? "MM" : (depth==="P" ? "PM" : "CM");
}

function onServeTap(side, box, target, el){
  if (state.matchFinished) return;
  if (!state.point) initPoint();
  if (state.point.phase !== "serve") return;

  // Serve must be tapped on receiver side
  const server = state.point.server;
  const neededSide = (server === "A") ? "top" : "bottom";
  if (side !== neededSide){
    toast("Toca el cuadro de saque correcto");
    return;
  }

  // Serve is always cross-court: only the required box is valid
  const reqBox = serveRequiredBox(neededSide, state.point.side);
  if (box !== reqBox){
    toast("Saque siempre cruzado: selecciona el cuadro correcto");
    return;
  }

  const ev = {
    type: "serve",
    player: server,
    code: `S ${state.point.side} ${target}`,
    meta: { side, box, target },
    elId: elIdForServe(side, box, target)
  };

  state.point.events.push(ev);
  try { recordArrow({ hitter: server, throughEl: el, isServe: true }); } catch(e){ console.error(e); }

  // after serve => rally
  state.point.phase = "rally";
  updateZoneHint();
  renderPoint();
  applyTapConstraints();
  persist();
}

function onRallyTap(side, row, col, el){
  if (state.matchFinished) return;
  if (!state.point) initPoint();
  if (state.point.phase!=="rally") return;

  // Whose turn? alternate based on number of events after serve
  // Events includes serve, then rally hits alternate starting with receiver.
  const server = state.point.server;
  const receiver = other(server);
  const rallyCount = state.point.events.filter(e=>e.type==="rally").length;
  const hitter = (rallyCount % 2 === 0) ? receiver : server; // first rally hit is receiver

  // Validate tapping correct side: top grid corresponds to player B hitting, bottom grid corresponds to player A hitting.
  const expectedSide = (hitter==="A") ? "top" : "bottom"; // tap = lado donde cae la bola (opuesto al hitter)
  if (side !== expectedSide){
    toast("Toca el lado del jugador correcto");
    return;
  }

  const code = zoneCodeFromTap(side, row, col);
  const prefix = (rallyCount===0) ? "R " : ""; // first rally hit is return
  const ev = {
    type:"rally",
    player: hitter,
    code: `${prefix}${code}`,
    meta: { side, row, col },
    elId: elIdForRally(side, row, col)
  };
  state.point.events.push(ev);
  try { recordArrow({ hitter, throughEl: el, isServe: false }); } catch(e){ console.error(e); }
  renderPoint();
  applyTapConstraints();
  persist();
}

function elIdForRally(side,row,col){ return `rally:${side}:${row}:${col}`; }
function elIdForServe(side,box,target){ return `serve:${side}:${box}:${target}`; }

function eventTokenText(ev){
  // e.g. A-S SD T; B-R CP
  const p = ev.player;
  return `${p}-${ev.code}`;
}

function renderPoint(){
  renderZonesVisibility();

  const tl=$("#timeline");
  const list=$("#seqList");
  const last=$("#lastTouch");
  tl.innerHTML="";
  list.innerHTML="";

  const p=state.point;
  if (!p){
    if (last) last.textContent="Último: —";
    clearLiveArrows();
    return;
  }

  const tokens = p.events.map(eventTokenText);
  if (last){
    last.textContent = tokens.length ? `Último: ${tokens[tokens.length-1]}` : "Último: —";
  }

  tokens.forEach((t,i)=>{
    const ev=p.events[i];
    const div=document.createElement("div");
    div.className = "tok " + (ev.player==="A"?"a":"b");
    div.innerHTML = `<small>${i+1}</small>${escapeHtml(t)}`;
    div.addEventListener("click", ()=> replayPoint(i, i));
    tl.appendChild(div);

    const row=document.createElement("div");
    row.className="seqItem";
    row.innerHTML = `<div class="n">${i+1}.</div>
      <div class="t"><span class="${ev.player==="A"?"a":"b"}">${escapeHtml(ev.player)}</span> - ${escapeHtml(ev.code)}</div>`;
    list.appendChild(row);
  });

  // Serve/finish actions visibility (legacy placeholders)
  const __sa=$("#serveActions"); if(__sa) __sa.classList.toggle("hidden", p.phase!=="serve");
  const __fa=$("#finishActions"); if(__fa) __fa.classList.toggle("hidden", p.phase!=="rally");
  refreshFinishMenuMode();
  renderLiveArrows(false);
  applyTapConstraints();
}

function pointText(player){
  if (state.isTiebreak) return String(state.tb[player] ?? 0);
  const pA = state.points.A, pB = state.points.B;
  const map = ["0","15","30","40"];
  if (pA>=3 && pB>=3){
    if (pA===pB) return "40";
    if (player==="A") return (pA>pB) ? "AD" : "40";
    return (pB>pA) ? "AD" : "40";
  }
  return map[state.points[player]] ?? String(state.points[player] ?? 0);
}

function renderScore(){
  $("#nameA").value = state.names.A;
  $("#nameB").value = state.names.B;
  refreshABOptionLabels();

  // Serve indicator
  $("#serveA").classList.toggle("on", state.currentServer==="A");
  $("#serveB").classList.toggle("on", state.currentServer==="B");

  // Sets (completed) se muestran como historial; juegos actuales van en columna aparte (G)
  const hist = state.setHistory || [];
  const cols = Math.min(5, hist.length);
  const hdr = $("#tvSetHeaders");
  if (hdr){
    hdr.innerHTML = "";
    for (let i=0;i<cols;i++){
      const el = document.createElement("div");
      el.className = "tvSetHdr";
      el.textContent = String(i+1);
      hdr.appendChild(el);
    }
  }

  const rowA = $("#setsRowA"), rowB = $("#setsRowB");
  const fillRow = (row, player)=>{
    if (!row) return;
    row.innerHTML = "";
    for (let i=0;i<cols;i++){
      const cell = document.createElement("div");
      cell.className = "tvSetCell";
      cell.textContent = String(hist[i][player] ?? "");
      row.appendChild(cell);
    }
  };
  fillRow(rowA, "A");
  fillRow(rowB, "B");

  // Juegos actuales del set
  const gA = $("#tvGamesA"), gB = $("#tvGamesB");
  if (gA) gA.textContent = String(state.games.A ?? 0);
  if (gB) gB.textContent = String(state.games.B ?? 0);

  // Points
  $("#tvPtsA").textContent = pointText("A");
  $("#tvPtsB").textContent = pointText("B");


// Meta badges (opcionales: la UI puede ocultarlos/eliminarlos)
const bScore = $("#badgeScore");
const bSide  = $("#badgeSide");
const bPhase = $("#badgePhase");
if (bScore) bScore.textContent = scoreLabel();
if (bSide)  bSide.textContent  = serveSideLabel();
if (bPhase) bPhase.textContent = (state.point?.phase==="serve") ? "SAQUE" : "RALLY";

const qiF = $("#qiFinish");
  const qiR = $("#qiResume");
  (qiF ? qiF : $("#btnFinish")).classList.toggle("hidden", state.matchFinished);
  (qiR ? qiR : $("#btnResume")).classList.toggle("hidden", !state.matchFinished);
  $("#btnRedoPoint").disabled = state.matchPoints.length===0;
}

function newMatch(){
  const mode = state.matchMode || "standard";
  state.sets={A:0,B:0};
  state.games={A:0,B:0};
  state.points={A:0,B:0};
  state.tb={A:0,B:0};
  state.isTiebreak = false;
  state.tbStartingServer="A";
  state.currentServer="A";
  state.matchFinished=false;
  state.matchPoints=[];
  state.setHistory=[];
  state.undoStack=[];
  state.matchMode = mode;

  if (mode !== "standard"){
    state.isTiebreak = true;
    state.tbStartingServer = state.currentServer;
  }

  initPoint();
  persist();
  renderAll();
}

function finishMatch(){
  state.matchFinished=true;
  persist();
  renderAll();
  toast("Partido finalizado");
}
function resumeMatch(){
  state.matchFinished=false;
  persist();
  renderAll();
  toast("Partido reanudado");
}

function savePoint(winner, reason){
  const p=state.point;
  const n = state.matchPoints.length + 1;
  const snapshot = `S ${state.sets.A}-${state.sets.B} · G ${state.games.A}-${state.games.B} · P ${scoreLabel()} · Srv ${playerName(p.server)} ${p.side}`;
  const finishDetail = p.finishDetail ? JSON.parse(JSON.stringify(p.finishDetail)) : null;
  state.matchPoints.push({
    n,
    winner,
    reason,
    server: p.server,
    side: p.side,
    snapshot,
    finishDetail,
        events: p.events.slice(),
    arrows: p.arrows ? JSON.parse(JSON.stringify(p.arrows)) : [],
  });
}

function endPoint(winner, reason){
  if (state.matchFinished) return;
  state.undoStack.push(snapshotMatchState());
  savePoint(winner, reason);
  updateScoring(winner);
  initPoint();
  persist();
  renderAll();
}

function undo(){
  if (!state.point || state.point.events.length===0) return;
  state.point.events.pop();
  if (state.point.arrows && state.point.arrows.length) state.point.arrows.pop();

  // if popped last serve and phase was rally, maybe revert phase
  if (state.point.events.length===0){
    state.point.phase="serve";
  } else {
    const hasServe = state.point.events.some(e=>e.type==="serve");
    state.point.phase = hasServe ? "rally" : "serve";
  }
  updateZoneHint();
  renderPoint();
  applyTapConstraints();
  persist();
  toast("Último golpe deshecho");
}

function resetPoint(){
  initPoint();
  persist();
  renderAll();
  toast("Punto reiniciado");
}

function redoLastPoint(){
  if (state.matchPoints.length===0) return;
  state.matchPoints.pop();
  const snap = state.undoStack.pop();
  restoreMatchState(snap);
  state.matchFinished=false;
  initPoint();
  persist();
  renderAll();
  toast("Último punto deshecho");
}

function fault(){
  if (!state.point || state.point.phase!=="serve") return;
  if (!state.point.firstServeFault){
    state.point.firstServeFault=true;
    state.point.events.push({type:"serve", player: state.point.server, code:`S ${state.point.side} F`, meta:{fault:true}, elId:null});
    renderPoint();
    persist();
    toast("Falta (2º saque)");
  } else {
    doubleFault();
  }
}
function doubleFault(){
  if (!state.point || state.point.phase!=="serve") return;
  const loser = state.point.server;
  const winner = other(loser);
  state.undoStack.push(snapshotMatchState());
  state.point.events.push({type:"serve", player: loser, code:`S ${state.point.side} DF`, meta:{df:true}, elId:null});
  savePoint(winner, `Doble falta (${loser})`);
  updateScoring(winner);
  initPoint();
  persist();
  renderAll();
  toast("Doble falta");
}

/** REPLAY **/
let replayTimer=null;
function clearReplay(){
  if (replayTimer){ clearTimeout(replayTimer); replayTimer=null; }
  // remove active from tokens
  document.querySelectorAll(".tok.active").forEach(x=>x.classList.remove("active"));
}
function replayPoint(startIndex=0, endIndex=null){
  const p=state.point;
  if (!p || p.events.length===0) return;
  clearReplay();
  const events = p.events;
  const end = (endIndex===null)? events.length-1 : endIndex;
  let i = startIndex;

  const step = ()=>{
    // highlight token
    const toks=[...document.querySelectorAll("#timeline .tok")];
    toks.forEach(x=>x.classList.remove("active"));
    if (toks[i]) toks[i].classList.add("active");

    // flash corresponding zone element if exists
    const ev = events[i];
    const el = elementFromElId(ev.elId);
    if (el) flashTap(el, null);

    // highlight corresponding arrow
    const svg = $("#arrowSvg");
    if (svg && p.arrows && p.arrows[i]){
      renderArrows(svg, p.arrows, { fadeOld:true, highlightIndex:i });
    } else {
      renderLiveArrows(false);
    }

    if (i < end){
      i++;
      replayTimer=setTimeout(step, 380);
    } else {
      replayTimer=setTimeout(()=>{ clearReplay(); }, 600);
    }
  };
  step();
}
function elementFromElId(elId){
  if (!elId) return null;
  const [kind, side, a, b] = elId.split(":");
  if (kind==="rally"){
    return document.querySelector(`.zoneCell[data-side="${side}"][data-row="${a}"][data-col="${b}"]`);
  }
  if (kind==="serve"){
    return document.querySelector(`.serveCell[data-side="${side}"][data-box="${a}"][data-target="${b}"]`);
  }
  return null;
}

function replayCurrentPoint(){ replayPoint(0, null); }

/** MODALS **/
function modalSel(id){
  const s = String(id||"");
  if (!s) return null;
  return s.startsWith("#") ? s : ("#"+s);
}
function openModal(id){
  const el = $(modalSel(id));
  if (el) el.classList.remove("hidden");
}
function closeModal(id){
  const el = $(modalSel(id));
  if (el) el.classList.add("hidden");
}

function openHistory(){
  renderHistory();
  openModal("#historyModal");
}
function closeHistory(){ closeModal("#historyModal"); }

function openPointViewer(point){
  if (!point) return;
  state.ui = state.ui || {};
  state.ui.pointViewerSelN = point.n;
  if (typeof state.ui.pvSpeed === "undefined") state.ui.pvSpeed = 0.75;
  openModal("#pointViewerModal");
  renderPointViewer(point);
}
function closePointViewer(){
  closeModal("#pointViewerModal");
}

function renderPointViewer(point){
  const p = point || state.matchPoints.find(x=>x.n===state.ui?.pointViewerSelN);
  if (!p) return;

  // defaults
  if (!state.ui) state.ui = { theme:"dark", coach:true };
  
  const nameA=state.names.A, nameB=state.names.B;
  // actualizar etiquetas A/B en filtros
  const setOptText = (selId, val, txt)=>{
    const opt = document.querySelector(`#${selId} option[value="${val}"]`);
    if (opt) opt.textContent = txt;
  };
  setOptText("fServer","A", nameA);
  setOptText("fServer","B", nameB);
  setOptText("fWinner","A", nameA);
  setOptText("fWinner","B", nameB);
  const winName = p.winner==="A" ? nameA : nameB;

  const title = $("#pvTitle");
  const sub = $("#pvSub");
  if (title) title.textContent = `Punto ${p.n} · Gana ${winName}`;

  const reasonLine = (p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : "");
  if (sub) sub.textContent = `${formatSnapshot(p.snapshot)}${reasonLine ? " · " + reasonLine : ""}`;

  const rotated = !!(state.ui && state.ui.pvRotated);
  const topName = $("#pvTopName");
  const botName = $("#pvBottomName");
  if (topName) topName.textContent = rotated ? (nameA || "Jugador A") : (nameB || "Jugador B");
  if (botName) botName.textContent = rotated ? (nameB || "Jugador B") : (nameA || "Jugador A");
  const pvCourt = $("#pvCourt");
  if (pvCourt) pvCourt.classList.toggle("rotated", rotated);

  // events
  const evs = (p.events||[]);
  const pvEvents = $("#pvEvents");
  if (pvEvents){
    if (!evs.length){
      pvEvents.innerHTML = `<div class="muted">Sin eventos</div>`;
    } else {
      pvEvents.innerHTML = evs.map((e,i)=>`
        <div class="mono" style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
          <b>${i+1}.</b> ${playerNameSafe(e.player)} - ${escapeHtml(e.code)}
        </div>
      `).join("");
    }
  }

  // tools
  const hasArrows = !!(p.arrows && p.arrows.length);
  if (typeof state.ui.pvSpeed === "undefined") state.ui.pvSpeed = 0.75;
  const speeds = [0.75, 0.50, 0.25];
  const fmtSpeed = (v)=> (v===0.5 ? "0.50" : v===0.25 ? "0.25" : "0.75");

  const btnS = $("#btnPvSpeed");
  const btnRot = $("#btnPvRotate");
  const btnR = $("#btnPvReplay");

  if (btnRot){
    btnRot.disabled = false;
    btnRot.onclick = ()=>{ state.ui.pvRotated = !state.ui.pvRotated; persist(); renderPointViewer(p); };
  }

  if (btnS){
    btnS.textContent = `Velocidad: x${fmtSpeed(Number(state.ui.pvSpeed) || 0.75)}`;
    btnS.disabled = !hasArrows;
    btnS.onclick = ()=>{
      const cur = Number(state.ui.pvSpeed) || 0.75;
      const i = speeds.indexOf(cur);
      state.ui.pvSpeed = speeds[(i+1+speeds.length)%speeds.length];
      persist();
      renderPointViewer(p);
    };
  }
  if (btnR){
    btnR.disabled = !hasArrows;
    btnR.onclick = ()=>{
      if (!hasArrows) return;
      const svg = $("#pvArrowSvg");
      if (svg) replayArrowsIn(svg, (p.arrows||[]), { speed: Number(state.ui.pvSpeed) || 0.75 });
    };
  }

  // render arrows (static)

  // render arrows (static)
  const svg = $("#pvArrowSvg");
  if (svg){
    svg.innerHTML = arrowDefs();
    if (hasArrows){
      // esperar a que el modal tenga tamaño real (iPhone)
      requestAnimationFrame(()=>{
        setTimeout(()=>{
          try{ renderArrows(svg, (p.arrows||[]), { fadeOld:false }); }
          catch(e){ console.error(e); }
        }, 0);
      });
    }
    svg.style.display = "block";
  }
}

function openAnalytics(){
  openModal("#analyticsModal");
  try{ renderAnalytics(); }
  catch(e){ console.error(e); toast("Error al abrir analíticas"); }
}
function closeAnalytics(){ closeModal("#analyticsModal"); }

function openStats(){
  openModal("#statsModal");
  try{ buildStatsSetOptions(); renderStats(); }
  catch(e){ console.error(e); toast("Error al abrir estadísticas"); }
}
function closeStats(){ closeModal("#statsModal"); }

function openExport(){
  $("#exportSub").textContent = `${state.matchPoints.length} puntos`;
  openModal("#exportModal");
}
function closeExport(){ closeModal("#exportModal"); }

/** CHARTS (Momentum / Balance acumulado) **/

function openCharts(){
  renderCharts();
  openModal("#chartsModal");
}
function closeCharts(){ closeModal("#chartsModal"); }

function parseSnapshotParts(snapshot){
  const s = String(snapshot||"");
  const parts = s.split("·").map(p=>p.trim());
  const out = { setsA:0, setsB:0, gamesA:0, gamesB:0, score:"0-0" };
  for (const p of parts){
    if (p.startsWith("S ")){
      const m = p.match(/S\s+(\d+)-(\d+)/);
      if (m){ out.setsA=+m[1]; out.setsB=+m[2]; }
    } else if (p.startsWith("G ")){
      const m = p.match(/G\s+(\d+)-(\d+)/);
      if (m){ out.gamesA=+m[1]; out.gamesB=+m[2]; }
    } else if (p.startsWith("P ")){
      out.score = p.replace(/^P\s+/,"").trim();
    }
  }
  return out;
}

function parseScoreLabel(lbl){
  const t = String(lbl||"").trim();
  // Tie-break
  if (t.startsWith("TB ")){
    const m = t.match(/TB\s+(\d+)-(\d+)/);
    if (m) return { type:"tb", a:+m[1], b:+m[2] };
    return { type:"tb", a:0, b:0 };
  }
  if (t === "DEUCE") return { type:"game", a:3, b:3, raw:"DEUCE" };
  if (t.startsWith("AD ")){
    const who = t.replace("AD ","").trim();
    return { type:"game", a: who==="A" ? 4 : 3, b: who==="B" ? 4 : 3, raw:t };
  }
  // Normal: 0-15 etc
  const m = t.match(/^(\w+)-(\w+)$/);
  if (!m) return { type:"game", a:0, b:0, raw:t };
  const map = { "0":0, "15":1, "30":2, "40":3 };
  return { type:"game", a: map[m[1]] ?? 0, b: map[m[2]] ?? 0, raw:t };
}

function simScoreLabel(sim){
  if (sim.isTiebreak) return `TB ${sim.tb.A}-${sim.tb.B}`;
  const pA = sim.points.A, pB = sim.points.B;
  const map = ["0","15","30","40"];
  if (pA>=3 && pB>=3){
    if (pA===pB) return "DEUCE";
    return (pA>pB) ? "AD A" : "AD B";
  }
  return `${map[pA] ?? pA}-${map[pB] ?? pB}`;
}

function simUpdateScoring(sim, winner){
  if (sim.isTiebreak){
    sim.tb[winner] += 1;
    const a=sim.tb.A, b=sim.tb.B;
    if ((a>=7 || b>=7) && Math.abs(a-b)>=2){
      const setWinner = a>b ? "A":"B";
      sim.sets[setWinner]+=1;
      sim.games={A:0,B:0};
      sim.points={A:0,B:0};
      sim.isTiebreak=false;
      sim.tb={A:0,B:0};
    }
    return;
  }

  let a=sim.points.A, b=sim.points.B;
  if (a>=3 && b>=3){
    if (winner==="A") a+=1; else b+=1;
    if (Math.abs(a-b)>=2 && (a>=4 || b>=4)){
      const gameWinner = a>b ? "A":"B";
      sim.games[gameWinner]+=1;
      sim.points={A:0,B:0};
      if (sim.games.A===6 && sim.games.B===6){
        sim.isTiebreak=true;
        sim.tb={A:0,B:0};
      }
      if ((sim.games.A>=6 || sim.games.B>=6) && Math.abs(sim.games.A-sim.games.B)>=2){
        const setWinner = sim.games.A>sim.games.B ? "A":"B";
        sim.sets[setWinner]+=1;
        sim.games={A:0,B:0};
        sim.points={A:0,B:0};
      }
      return;
    }
    sim.points={A:a,B:b};
    return;
  }

  sim.points[winner]+=1;
  if (sim.points[winner]>=4){
    const gameWinner=winner;
    sim.games[gameWinner]+=1;
    sim.points={A:0,B:0};

    if (sim.games.A===6 && sim.games.B===6){
      sim.isTiebreak=true;
      sim.tb={A:0,B:0};
    }
    if ((sim.games.A>=6 || sim.games.B>=6) && Math.abs(sim.games.A-sim.games.B)>=2){
      const setWinner = sim.games.A>sim.games.B ? "A":"B";
      sim.sets[setWinner]+=1;
      sim.games={A:0,B:0};
      sim.points={A:0,B:0};
    }
  }
}

function simulateScoreProgress(points){
  const sim = {
    sets:{A:0,B:0},
    games:{A:0,B:0},
    points:{A:0,B:0},
    isTiebreak:false,
    tb:{A:0,B:0}
  };
  const out = []; // {before, after, setsA, setsB, gamesA, gamesB}
  for (let i=0;i<points.length;i++){
    const before = simScoreLabel(sim);
    simUpdateScoring(sim, points[i].winner);
    const after = simScoreLabel(sim);
    out.push({ before, after, setsA:sim.sets.A, setsB:sim.sets.B, gamesA:sim.games.A, gamesB:sim.games.B, isTB:sim.isTiebreak });
  }
  return out;
}


function isGamePoint(score, player){
  if (!score || score.type!=="game") return false;
  const a = score.a, b = score.b;
  if (player==="A"){
    if (a===3 && b<=2) return true; // 40-0/15/30
    if (a===4 && b===3) return true; // AD A
    return false;
  } else {
    if (b===3 && a<=2) return true;
    if (b===4 && a===3) return true;
    return false;
  }
}

function wouldWinSetAfterGame(setsA, setsB, gamesA, gamesB, gameWinner){
  // calcula si ganar ESTE juego cerraría el set (regla estándar: >=6 y diferencia >=2)
  let ga = gamesA + (gameWinner==="A" ? 1 : 0);
  let gb = gamesB + (gameWinner==="B" ? 1 : 0);
  if (Math.max(ga, gb) >= 6 && Math.abs(ga-gb) >= 2) return true;
  return false;
}

function isTBSetPoint(tbA, tbB, player){
  const p = player==="A" ? tbA : tbB;
  const o = player==="A" ? tbB : tbA;
  // si p >=6 y ventaja >=1, ganando el siguiente hace >=7 y ventaja >=2
  return (p>=6 && (p-o)>=1);
}

function isPointWonBy(p, player){
  if (p && (p.winner==="A" || p.winner==="B")) return p.winner===player;
  // fallback por reason si alguna vez faltara "winner"
  const r = String(p?.reason||"");
  if (r.includes("(A)")) return player==="B"; // error de A -> gana B
  if (r.includes("(B)")) return player==="A";
  return false;
}

function pointContextFlags(p, perspective){
  const snap = parseSnapshotParts(p?.snapshot);
  const score = parseScoreLabel(snap.score);
  const isTB = score.type==="tb";
  const isServe = (p?.server===perspective);

  const gamePointForA = !isTB && isGamePoint(score, "A");
  const gamePointForB = !isTB && isGamePoint(score, "B");

  const gamePointForPersp = !isTB && isGamePoint(score, perspective);
  const breakPointForPersp = gamePointForPersp && (p?.server !== perspective);

  const setPointForPersp = (!isTB && gamePointForPersp && wouldWinSetAfterGame(snap.setsA, snap.setsB, snap.gamesA, snap.gamesB, perspective))
    || (isTB && isTBSetPoint(score.a, score.b, perspective));

  const clutch3030 = (!isTB && score.type==="game" && score.a>=2 && score.b>=2); // 30-30 o más
  const deuceAdv = (!isTB && (snap.score==="DEUCE" || String(snap.score).startsWith("AD ")));

  const important = breakPointForPersp || gamePointForPersp || setPointForPersp || (isTB) || deuceAdv || clutch3030;

  return {
    snap, score, isTB,
    isServe,
    gamePointForA, gamePointForB,
    gamePointForPersp, breakPointForPersp, setPointForPersp,
    clutch3030, deuceAdv,
    important
  };
}

function computeBoundaries(points){
  const bounds = []; // indices where a game or set boundary occurs after point i (i is 0-based)
  for (let i=0;i<points.length-1;i++){
    const s1 = parseSnapshotParts(points[i].snapshot);
    const s2 = parseSnapshotParts(points[i+1].snapshot);
    if (s1.setsA!==s2.setsA || s1.setsB!==s2.setsB){
      bounds.push({i, kind:"set"});
    } else if (s1.gamesA!==s2.gamesA || s1.gamesB!==s2.gamesB){
      bounds.push({i, kind:"game"});
    }
  }
  return bounds;
}

function renderCharts(){
  const modal = $("#chartsModal");
  if (!modal) return;

  // Persisted selection
  state.ui = state.ui || {};
  if (!state.ui.chartPlayer) state.ui.chartPlayer = "A";

  const sel = $("#chartsPlayer");
  if (sel){
    sel.value = state.ui.chartPlayer;
  }
  const persp = sel ? sel.value : state.ui.chartPlayer;
  state.ui.chartPlayer = persp;

  const name = playerName(persp);
  const sub = $("#chartsSub");
  if (sub) sub.textContent = `Balance acumulado · Perspectiva: ${name}`;

  const points = Array.isArray(state.matchPoints) ? state.matchPoints.slice() : [];

  const scoreProg = simulateScoreProgress(points);

  // canvas
  const canvas = $("#chartsCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Resize to CSS size (retina)
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(320, rect.width);
  const H = Math.max(200, rect.height);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  // Colors from CSS variables
  const cs = getComputedStyle(document.documentElement);
  const cAccent2 = (cs.getPropertyValue("--accent2") || "#39D5FF").trim();
  const cGood = (cs.getPropertyValue("--good") || "#2EE59D").trim();
  const cBad = (cs.getPropertyValue("--bad") || "#FF3B5C").trim();
  const cGold = (cs.getPropertyValue("--accent") || "#FFD400").trim();

  // Background clear
  ctx.clearRect(0,0,W,H);

  // Empty state
  if (!points.length){
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText("No hay puntos todavía. Registra puntos para ver el gráfico.", 16, 42);
    const strip=$("#pointStrip"); if (strip) strip.innerHTML = "";
    persist();
    return;
  }

  // Build momentum series
  let y=0;
  const ys=[];
  const xs=[];
  const wonFlags=[];
  const flagsArr=[];
  for (let i=0;i<points.length;i++){
    const p=points[i];
    const won = isPointWonBy(p, persp);
    wonFlags.push(won);
    y += won ? 1 : -1;
    xs.push(i+1);
    ys.push(y);
    flagsArr.push(pointContextFlags(p, persp));
  }

  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const yPad = (maxY-minY) < 6 ? 3 : 2;
  const yMin = minY - yPad;
  const yMax = maxY + yPad;

  const padL=44, padR=14, padT=14, padB=26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xAt = (i)=> padL + (points.length===1?0: (i/(points.length-1))*plotW);
  const yAt = (val)=> padT + (1 - ((val - yMin)/(yMax - yMin))) * plotH;

  // Grid + axis labels
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "600 11px Inter, system-ui, sans-serif";

  const gridLines = 5;
  for (let g=0; g<=gridLines; g++){
    const t = g / gridLines;
    const yy = padT + t*plotH;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL+plotW, yy);
    ctx.stroke();
    const val = Math.round(yMax - t*(yMax-yMin));
    ctx.fillText(String(val), 10, yy+4);
  }

  // Baseline y=0
  const y0 = yAt(0);
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.beginPath();
  ctx.moveTo(padL, y0);
  ctx.lineTo(padL+plotW, y0);
  ctx.stroke();

  // Boundaries (games/sets)
  const bounds = computeBoundaries(points);
  for (const b of bounds){
    const xx = xAt(b.i + 0.5);
    ctx.strokeStyle = b.kind==="set" ? "rgba(255,212,0,.30)" : "rgba(57,213,255,.16)";
    ctx.beginPath();
    ctx.moveTo(xx, padT);
    ctx.lineTo(xx, padT+plotH);
    ctx.stroke();
  }

  // Line
  ctx.save();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = cAccent2;
  ctx.shadowColor = cAccent2;
  ctx.shadowBlur = 10;

  ctx.beginPath();
  for (let i=0;i<ys.length;i++){
    const xx=xAt(i);
    const yy=yAt(ys[i]);
    if (i===0) ctx.moveTo(xx,yy);
    else ctx.lineTo(xx,yy);
  }
  ctx.stroke();
  ctx.restore();

  // Points markers
  for (let i=0;i<ys.length;i++){
    const xx=xAt(i);
    const yy=yAt(ys[i]);
    const won = wonFlags[i];
    ctx.beginPath();
    ctx.fillStyle = won ? cGood : cBad;
    ctx.shadowColor = won ? cGood : cBad;
    ctx.shadowBlur = 8;
    ctx.arc(xx,yy,3.6,0,Math.PI*2);
    ctx.fill();

    // important ring
    if (flagsArr[i].important){
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,212,0,.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(xx,yy,6.2,0,Math.PI*2);
      ctx.stroke();
    }
  }

  // Axis labels
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,.62)";
  ctx.fillText("Puntos →", padL + plotW - 54, H - 8);

  // Strip
  const strip = $("#pointStrip");
  if (strip){
    strip.innerHTML = "";
    points.forEach((p, i)=>{
      const won = wonFlags[i];
      const f = flagsArr[i];
      const dot = document.createElement("div");
      dot.className = "stripDot " + (won ? "win" : "lose") + " " + (f.isServe ? "serve" : "ret") + (f.important ? " important" : "");
      const tags=[];
      tags.push(f.isServe ? "Saque" : "Resto");
      if (f.breakPointForPersp) tags.push("Break point");
      if (f.gamePointForPersp) tags.push("Game point");
      if (f.setPointForPersp) tags.push("Set point");
      if (f.isTB) tags.push("Tie-break");
      if (f.deuceAdv) tags.push("Deuce/Adv");
      if (f.clutch3030 && !f.deuceAdv) tags.push("30-30+");
      const winnerName = playerName(p.winner);
      const afterScore = scoreProg[i]?.after || "";
      dot.title = `Punto ${p.n} · ${won?"+1":"-1"} · Gana ${winnerName}\nMarcador: ${afterScore}\n${formatSnapshot(p.snapshot)}\n${p.reason||""}${tags.length?("\n["+tags.join(" · ")+"]"):""}`;
      dot.addEventListener("click", ()=> openPointViewer(p));
      strip.appendChild(dot);
    });
  }


  const scoresEl = $("#chartsScores");
  if (scoresEl){
    scoresEl.innerHTML = "";
    // start pill
    const startPill = document.createElement("div");
    startPill.className = "scorePill";
    startPill.innerHTML = `<span class="miniDot" style="background:rgba(255,255,255,.55)"></span><b>Inicio</b> <span>0-0</span>`;
    scoresEl.appendChild(startPill);

    points.forEach((p,i)=>{
      const won = wonFlags[i];
      const after = scoreProg[i]?.after || "";
      const pill = document.createElement("div");
      pill.className = "scorePill " + (won ? "win" : "lose");
      pill.innerHTML = `<span class="miniDot"></span><b>P${p.n}</b> <span>${escapeHtml(after)}</span>`;
      pill.title = `Punto ${p.n} · ${after} · Gana ${playerName(p.winner)}`;
      pill.addEventListener("click", ()=> openPointViewer(p));
      scoresEl.appendChild(pill);
    });
  }

  persist();
}



/** FINISH MENU (tennis ball) **/
function refreshFinishMenuMode(){
  const p = state.point;
  const serveGrp = $("#finishServeGroup");
  const rallyGrp = $("#finishRallyGroup");
  const isServe = !!p && p.phase === "serve";
  if (serveGrp) serveGrp.classList.toggle("hidden", !isServe);
  if (rallyGrp) rallyGrp.classList.toggle("hidden", isServe);
}

function openFinishMenu(){
  setFinishMode(finishMode);
  refreshFinishMenuMode();
  const m=$("#finishMenu");
  if (!m) return;
  m.classList.remove("hidden");
}
function closeFinishMenu(){
  closeAdvStep2();
  const m=$("#finishMenu");
  if (!m) return;
  m.classList.add("hidden");
}
function toggleFinishMenu(){
  const m=$("#finishMenu");
  if (!m) return;
  if (m.classList.contains("hidden")) openFinishMenu(); else closeFinishMenu();
}

// --- Avanzado (menú bola) ---
let finishMode = (()=>{
  try { return localStorage.getItem("tdt_finish_mode") || "normal"; }
  catch(e){ return "normal"; }
})();

let pendingFinish = null; // { kind:"UE"|"FE"|"WINNER", offender:"A"|"B", winner:"A"|"B", reason:string }

const ADV_STROKES = [
  { key:"FH", label:"Derecha" },
  { key:"BH", label:"Revés" },
  { key:"VOL", label:"Volea" },
  { key:"SM", label:"Smash" },
  { key:"OTHER", label:"Otro" },
];

const ADV_WINNERS = [
  {key:"ACE", label:"Ace"},
  {key:"FH", label:"Derecha"},
  {key:"BH", label:"Revés"},
  {key:"VOL_FH", label:"Volea derecha"},
  {key:"VOL_BH", label:"Volea revés"},
  {key:"PASS", label:"Passing"},
  {key:"DROP", label:"Dejada"},
];

function setFinishMode(mode){
  finishMode = mode;
  try { localStorage.setItem("tdt_finish_mode", mode); } catch(e){}
  const tn=$("#tabNormal"), ta=$("#tabAdvanced");
  if (tn && ta){
    tn.classList.toggle("active", mode==="normal");
    ta.classList.toggle("active", mode==="advanced");
    tn.setAttribute("aria-selected", mode==="normal" ? "true" : "false");
    ta.setAttribute("aria-selected", mode==="advanced" ? "true" : "false");
  }
  closeAdvStep2();
}

function openAdvStep2(meta){
  pendingFinish = meta;
  const step=$("#advStep2"), chips=$("#advChips"), title=$("#advTitle");
  if (!step || !chips || !title) return;

  // Hide main groups to focus
  const serveGrp=$("#finishServeGroup");
  const rallyGrp=$("#finishRallyGroup");
  if (serveGrp) serveGrp.classList.add("hidden");
  if (rallyGrp) rallyGrp.classList.add("hidden");

  const opts = Array.isArray(meta.customOpts) ? meta.customOpts : (meta.kind==="WINNER" ? ADV_WINNERS : ADV_STROKES);

  const defaultTitle =
    meta.kind==="WINNER" ? "Tipo de winner" :
    meta.kind==="UE" ? "Tipo de error no forzado" :
    "Tipo de error forzado";

  title.textContent = meta.customTitle || defaultTitle;

  chips.innerHTML="";
  opts.forEach(o=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="advChip";
    b.textContent=o.label;
    b.addEventListener("click", ()=>{
      commitAdvancedFinish(o.key);
    });
    chips.appendChild(b);
  });

  step.classList.remove("hidden");
}

function closeAdvStep2(){
  pendingFinish = null;
  const step=$("#advStep2");
  if (step) step.classList.add("hidden");

  // Restore correct groups
  refreshFinishMenuMode();
}

function commitAdvancedFinish(detailKey){
  if (!pendingFinish) return;
  if (!state.point) initPoint();

  // Capture meta BEFORE closing UI (closeAdvStep2 clears pendingFinish)
  const meta = pendingFinish;

  // Attach detail onto current point (copied into matchPoints by savePoint)
  state.point.finishDetail = {
    mode: "advanced",
    kind: meta.kind,
    offender: meta.offender,
  };
  if (meta.kind==="WINNER"){
    state.point.finishDetail.winnerType = detailKey;
  } else {
    state.point.finishDetail.strokeType = detailKey;
  }

  // End point first, then close UI
  endPoint(meta.winner, meta.reason);
  closeFinishMenu();
}

function finishAction(kind, offender){
  // kind: "UE"|"FE"|"WINNER"
  const winner = (kind==="WINNER") ? offender : other(offender);
  const reason =
    kind==="UE" ? `Error no forzado (${offender})` :
    kind==="FE" ? `Error forzado (${offender})` :
    `Winner (${offender})`;

  if (finishMode==="advanced"){
    openAdvStep2({ kind, offender, winner, reason });
    return false; // do not auto-close menu
  }
  endPoint(winner, reason);
  return true;
}


function finishVolley(offender){
  // winner by volley, quick button in finish menu
  const winner = offender;
  const reason = `Winner (${offender})`;

  if (finishMode==="advanced"){
    openAdvStep2({
      kind: "WINNER",
      offender,
      winner,
      reason,
      customTitle: "Tipo de volea",
      customOpts: [
        {key:"VOL_FH", label:"Volea derecha"},
        {key:"VOL_BH", label:"Volea revés"},
      ]
    });
    return false;
  }

  if (!state.point) initPoint();
  state.point.finishDetail = { mode:"normal", kind:"WINNER", offender, winnerType:"VOL" };
  endPoint(winner, reason);
  return true;
}




/** HISTORY FILTERS **/

function finishDetailLabel(fd){
  if (!fd) return "";
  const strokeMap = { FH:"Derecha", BH:"Revés", VOL:"Volea", SM:"Smash", OTHER:"Otro" };
  const winMap = { ACE:"Ace", FH:"Derecha", BH:"Revés", VOL_FH:"Volea derecha", VOL_BH:"Volea revés", PASS:"Passing", DROP:"Dejada", VOL:"Volea", WIN:"Winner", OTHER:"Otro" };
  if (fd.kind==="WINNER" && fd.winnerType) return winMap[fd.winnerType] || fd.winnerType;
  if ((fd.kind==="UE" || fd.kind==="FE") && fd.strokeType) return strokeMap[fd.strokeType] || fd.strokeType;
  return "";
}

function renderHistory(){
  const sub=$("#historySub");
  if (sub) sub.textContent = `${state.matchPoints.length} puntos`;

  const server=$("#fServer").value;
  const side=$("#fSide").value;
  const winner=$("#fWinner").value;
  const end=$("#fEnd").value;
  const search=$("#fSearch").value.trim().toLowerCase();
  const scoreSearch=($("#fScoreSearch")?.value || "").trim();

  const list=$("#historyList");
  if (!list) return;

  const nameA=state.names.A, nameB=state.names.B;

  const norm = (s)=> String(s||"").replace(/\s+/g,"").toUpperCase();
  const scoreNeed = norm(scoreSearch);

  // Build game numbering map based on all points (so filters keep numbering)
  const gameMap = {};
  let gameNo = 0;
  let lastKey = null;
  (state.matchPoints||[]).forEach(p=>{
    const snap = parseSnapshotParts(p.snapshot);
    const isTB = String(snap.score||"").startsWith("TB ");
    const key = `${snap.setsA}-${snap.setsB}|${snap.gamesA}-${snap.gamesB}|${isTB?"TB":"G"}`;
    if (key !== lastKey){
      gameNo += 1;
      gameMap[key] = { num: gameNo, snap, isTB };
      lastKey = key;
    }
  });

  // Apply filters
  const rows = (state.matchPoints||[]).filter(p=>{
    if (server && p.server!==server) return false;
    if (side && p.side!==side) return false;
    if (winner && p.winner!==winner) return false;
    if (end && !String(p.reason||"").startsWith(end)) return false;

    const snap = parseSnapshotParts(p.snapshot);
    if (scoreNeed){
      const s = norm(snap.score);
      // allow "AD A" typed as "ADA"
      const s2 = s.replace(/^AD([AB])$/,"AD$1");
      const need2 = scoreNeed.replace(/^AD([AB])$/,"AD$1");
      if (s2 !== need2) return false;
    }

    const pattern = pointPattern(p, true).toLowerCase();
    if (search && !pattern.includes(search)) return false;
    return true;
  });

  list.innerHTML="";
  if (!rows.length){
    list.innerHTML = `<div class="historyItem"><div class="historyItemTitle">No hay puntos.</div><div class="historyItemMeta">Cambia filtros o registra puntos.</div></div>`;
    return;
  }

  // selection highlight
  const selN = state.ui?.historySelN || rows[0].n;
  state.ui = state.ui || {};
  state.ui.historySelN = selN;
  state.ui.historyCollapsedGames = state.ui.historyCollapsedGames || {};

  // Group by game key (sets+games+TB)
  const groupOrder = [];
  const groups = {};
  rows.forEach(p=>{
    const snap = parseSnapshotParts(p.snapshot);
    const isTB = String(snap.score||"").startsWith("TB ");
    const key = `${snap.setsA}-${snap.setsB}|${snap.gamesA}-${snap.gamesB}|${isTB?"TB":"G"}`;
    if (!groups[key]){ groups[key]=[]; groupOrder.push(key); }
    groups[key].push(p);
  });

  // Sort groups by global game number
  groupOrder.sort((a,b)=> (gameMap[a]?.num||9999) - (gameMap[b]?.num||9999));

  groupOrder.forEach(key=>{
    const pts = groups[key];
    const info = gameMap[key] || { num: 0, snap: parseSnapshotParts(pts[0].snapshot), isTB: false };
    const g = document.createElement("div");
    const collapsed = !!state.ui.historyCollapsedGames[key];
    g.className = "historyGame" + (collapsed ? " collapsed" : "");
    const setNo = (info.snap.setsA + info.snap.setsB + 1);
    const meta = `Set ${setNo} · Games ${info.snap.gamesA}-${info.snap.gamesB}` + (info.isTB ? " · Tie-break" : "");
    g.innerHTML = `
      <div class="historyGameHead">
        <div style="min-width:0;">
          <div class="historyGameTitle">Juego ${info.num || "—"}</div>
          <div class="historyGameMeta">${escapeHtml(meta)} · ${pts.length} punto(s)</div>
        </div>
        <div class="historyGameChevron"><svg class="svgIcon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
      <div class="historyGameBody"></div>
    `;
    const body = g.querySelector(".historyGameBody");
    const head = g.querySelector(".historyGameHead");
    head.addEventListener("click", ()=>{
      const now = g.classList.toggle("collapsed");
      state.ui.historyCollapsedGames[key] = now;
      persist();
    });

    pts.forEach(p=>{
      const item=document.createElement("div");
      item.className="historyItem" + (p.n===selN ? " active" : "");
      const pat=pointPattern(p, true);
      const winName = p.winner==="A"?nameA:nameB;
      item.innerHTML = `
        <div class="historyItemTop">
          <div>
            <div class="historyItemTitle">Punto ${p.n}</div>
            <div class="historyItemMeta">${escapeHtml(formatSnapshot(p.snapshot))}<br/>${escapeHtml((p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : ""))}</div>
          </div>
          <span class="pill ${p.winner==="A"?"pillGood":"pillWarn"}">Gana ${escapeHtml(winName)}</span>
        </div>
        <div class="historyItemMeta mono" style="margin-top:8px;">${escapeHtml(pat)}</div>
      `;
      item.addEventListener("click", (ev)=>{
        ev.stopPropagation();
        state.ui.historySelN = p.n;
        [...list.querySelectorAll(".historyItem")].forEach(el=>el.classList.remove("active"));
        item.classList.add("active");
        openPointViewer(p);
        persist();
      });
      body.appendChild(item);
    });

    list.appendChild(g);
  });
}

function renderHistoryDetail(p){
  const detail=$("#historyDetail");
  if (!detail) return;

  // defaults
  if (!state.ui) state.ui = { theme:"dark", coach:true };
  if (typeof state.ui.showHistoryArrows === "undefined") state.ui.showHistoryArrows = true;
    if (typeof state.ui.hideScore === "undefined") state.ui.hideScore = false;
    if (typeof state.ui.rotated === "undefined") state.ui.rotated = false;

  const nameA=state.names.A, nameB=state.names.B;
  const winName = p.winner==="A"?nameA:nameB;
  const showArrows = !!state.ui.showHistoryArrows;
  const hasArrows = (p.arrows && p.arrows.length);

  const header = `
    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
      <div style="min-width:0;">
        <div class="modalTitle" style="margin:0;">Punto ${p.n} · Gana ${escapeHtml(winName)}</div>
        <div class="modalSub" style="margin-top:4px;">
          ${escapeHtml(formatSnapshot(p.snapshot))}<br/>
          ${escapeHtml((p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : ""))}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
        <div class="pill ${p.winner==="A"?"pillGood":"pillWarn"}">${escapeHtml(winName)}</div>
        <div class="historyDetailTools">
          <button class="chip" id="btnHistToggleArrows" type="button">${showArrows ? "Flechas: ON" : "Flechas: OFF"}</button>
          <button class="chip" id="btnHistReplayArrows" type="button" ${hasArrows ? "" : "disabled"}>Reproducir</button>
        </div>
      </div>
    </div>
  `;

  const courtBlock = `
    <div class="miniCourtWrap" ${showArrows ? "" : "style='display:none;'"}>
      <div class="miniCourt">
        <img src="assets/court_top_view.png" alt="pista mini">
        <svg id="historyArrowSvg" class="arrowSvg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"></svg>
      </div>
      ${hasArrows ? "" : "<div class='muted' style='margin-top:8px;'>Este punto no tiene flechas.</div>"}
    </div>
  `;

  const evs = (p.events||[]);
  const lines = evs.map((e,i)=>`<div class="mono" style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,.08);">
    <b>${i+1}.</b> ${playerNameSafe(e.player)} - ${escapeHtml(e.code)}
  </div>`).join("");

  detail.innerHTML = header + courtBlock + `<div>${lines || "<div class='muted'>Sin eventos</div>"}</div>`;

  // bind tools
  const btnT=$("#btnHistToggleArrows");
  if (btnT){
    btnT.onclick = ()=>{
      state.ui.showHistoryArrows = !state.ui.showHistoryArrows;
      persist();
      renderHistoryDetail(p);
    };
  }
  const btnR=$("#btnHistReplayArrows");
  if (btnR){
    btnR.onclick = ()=>{
      const svg=$("#historyArrowSvg");
      if (!svg) return;
      replayArrowsIn(svg, (p.arrows||[]));
    };
  }

  // render arrows (static)
  if (showArrows){
    const svg=$("#historyArrowSvg");
    if (svg) renderArrows(svg, (p.arrows||[]), { fadeOld:false });
  }
}


function compactEv(ev){
  return `${ev.player}-${ev.code}`.trim().replace(/\s+/g," ");
}
function pointPattern(p, includeServe){
  const evs = p.events || [];
  const filtered = evs.filter(e=> includeServe ? true : e.type!=="serve");
  return filtered.map(compactEv).join(" - ");

function extractDirToken(ev){
  const t = String(ev?.code||"").trim().toUpperCase();
  if (!t) return null;
  // Serve: "S SD T/C/A"
  if (t.startsWith("S ")){
    const parts = t.split(/\s+/);
    const trg = parts[2] || parts[parts.length-1] || "";
    return trg ? ("S"+trg) : null;
  }
  // Rally: may start with "R "
  const r = t.replace(/^R\s+/,"").trim();
  const m = r.match(/(CC|CP|CM|MC|MM|MP|PC|PM|PP)$/);
  return m ? m[1] : null;
}

function patternTokens(p, includeServe){
  const evs = (p?.events||[]).filter(e=> includeServe ? true : e.type!=="serve");
  const toks = [];
  evs.forEach(ev=>{
    const tok = extractDirToken(ev);
    if (tok) toks.push(tok);
  });
  return toks;
}

function momentMatch(p, moment){
  if (!moment) return true;
  const fA = pointContextFlags(p, "A");
  const fB = pointContextFlags(p, "B");
  const snap = fA.snap; // same for both
  const scoreStr = String(snap.score||"").toUpperCase();

  if (moment==="break") return !!(fA.breakPointForPersp || fB.breakPointForPersp);
  if (moment==="game") return !!(fA.gamePointForPersp || fB.gamePointForPersp);
  if (moment==="set") return !!(fA.setPointForPersp || fB.setPointForPersp);
  if (moment==="tb") return !!fA.isTB;
  if (moment==="deuce") return !!fA.deuceAdv;
  if (moment==="3030") return !!fA.clutch3030;

  // explicit score filters like "0-40"
  if (/^\d+-\d+$/.test(moment)){
    return scoreStr.replace(/\s+/g,"") === moment.replace(/\s+/g,"");
  }
  return true;
}

function computeSimilarPatternStats(points, includeServe){
  const map = {};
  const pts = Array.isArray(points) ? points : [];
  pts.forEach(p=>{
    const toks = patternTokens(p, includeServe);
    if (toks.length < 3) return;
    // all trigrams
    const seen = new Set();
    for (let i=0;i<=toks.length-3;i++){
      const key = toks.slice(i,i+3).join(" - ");
      if (seen.has(key)) continue;
      seen.add(key);
      if (!map[key]){
        map[key] = { key, len:3, count:0, winA:0, winB:0, points:[], bestRate:0, dominant:"—" };
      }
      const it = map[key];
      it.count++;
      if (p.winner==="A") it.winA++; else it.winB++;
      it.points.push(p.n);
    }
  });

  Object.values(map).forEach(it=>{
    const rateA = it.winA/it.count;
    const rateB = it.winB/it.count;
    it.bestRate = Math.max(rateA, rateB);
    it.dominant = rateA===rateB ? "Igual" : (rateA>rateB ? "A" : "B");
  });

  return map;
}


}

/** ANALYTICS **/
function renderAnalytics(){
  const view=$("#aView")?.value || "freq";
  const min = parseInt($("#aMin")?.value,10) || 3;
  const includeServe=$("#aIncludeServe")?.checked ?? true;
  const moment = $("#aMoment")?.value || "";

  const list=$("#analyticsList");
  const detail=$("#analyticsDetail");
  if (!list || !detail) return;

  list.innerHTML="";
  detail.innerHTML="Selecciona un patrón.";

  const basePoints = Array.isArray(state.matchPoints) ? state.matchPoints.slice() : [];
  const points = basePoints.filter(p=>momentMatch(p, moment));

  let items = [];
  if (view==="sim"){
    const stats = computeSimilarPatternStats(points, includeServe);
    items = Object.values(stats).filter(x=>x.count>=min);
    items.sort((a,b)=> (b.count*b.len) - (a.count*a.len));
    items = items.slice(0,8);
  } else {
    const stats = computePatternStats(includeServe, points);
    items = Object.values(stats).filter(x=>x.count>=min);

    if (view==="freq"){
      items.sort((a,b)=>b.count-a.count);
      items = items.slice(0,8);
    } else if (view==="effective"){
      items.sort((a,b)=>b.bestRate-a.bestRate);
      items = items.slice(0,8);
    } else if (view==="deucead"){
      items.sort((a,b)=> (b.sdCount+b.svCount) - (a.sdCount+a.svCount));
      items = items.slice(0,8);
    } else if (view==="server"){
      items.sort((a,b)=> (b.srvA+b.srvB) - (a.srvA+a.srvB));
      items = items.slice(0,8);
    }
  }

  if (!items.length){
    list.innerHTML = `<div class="analyticsItem"><div class="analyticsItemTitle">Sin datos suficientes</div><div class="analyticsItemMeta">Ajusta filtros o registra más puntos.</div></div>`;
    return;
  }

  const nameA=state.names.A, nameB=state.names.B;

  const selKey = state.ui?.analyticsSelKey || items[0].key;
  const chosen = items.find(x=>x.key===selKey) || items[0];
  state.ui = state.ui || {};
  state.ui.analyticsSelKey = chosen.key;

  items.forEach(it=>{
    const div=document.createElement("div");
    div.className="analyticsItem" + (it.key===chosen.key ? " active" : "");
    const rateA = Math.round((it.winA/it.count)*100);
    const rateB = Math.round((it.winB/it.count)*100);
    const extra = (view==="sim") ? ` · Long: <b>${it.len}</b>` : "";
    div.innerHTML = `
      <div class="analyticsItemTitle mono">${escapeHtml(it.key)}</div>
      <div class="analyticsItemMeta">
        Veces: <b>${it.count}</b>${extra} · ${escapeHtml(nameA)}: <b>${it.winA}</b> (${rateA}%) · ${escapeHtml(nameB)}: <b>${it.winB}</b> (${rateB}%) · Dominante: <b>${escapeHtml(it.dominant)}</b>
      </div>
    `;
    div.addEventListener("click", ()=>{
      state.ui.analyticsSelKey = it.key;
      [...list.querySelectorAll(".analyticsItem")].forEach(el=>el.classList.remove("active"));
      div.classList.add("active");
      showPatternDetail(it);
    });
    list.appendChild(div);
  });

  showPatternDetail(chosen);
}

function computePatternStats(includeServe){
  const map = {};
  state.matchPoints.forEach(p=>{
    const key = pointPattern(p, includeServe);
    if (!key) return;
    if (!map[key]){
      map[key]={
        key,
        count:0, winA:0, winB:0,
        points:[],
        sdCount:0, svCount:0,
        srvA:0, srvB:0,
        bestRate:0, dominant:"—"
      };
    }
    const it=map[key];
    it.count++;
    if (p.winner==="A") it.winA++; else it.winB++;
    it.points.push(p.n);
    if (p.side==="SD") it.sdCount++; else if (p.side==="SV") it.svCount++;
    if (p.server==="A") it.srvA++; else it.srvB++;
  });

  Object.values(map).forEach(it=>{
    const rateA = it.winA/it.count;
    const rateB = it.winB/it.count;
    it.bestRate = Math.max(rateA, rateB);
    it.dominant = rateA===rateB ? "Igual" : (rateA>rateB ? "A" : "B");
  });

  return map;
}

function showPatternDetail(it, includeServe){
  const detail=$("#analyticsDetail");
  const nameA=state.names.A, nameB=state.names.B;
  const rateA = Math.round((it.winA/it.count)*100);
  const rateB = Math.round((it.winB/it.count)*100);
  detail.innerHTML = `
    <div class="mono" style="font-weight:1100; margin-bottom:8px;">${escapeHtml(it.key)}</div>
    <div class="muted">Veces: <b>${it.count}</b> · Gana ${escapeHtml(nameA)}: <b>${it.winA}</b> (${rateA}%) · Gana ${escapeHtml(nameB)}: <b>${it.winB}</b> (${rateB}%) · Dominante: <b>${escapeHtml(it.dominant)}</b></div>
    <div style="margin-top:10px;" class="muted">Aparece en puntos: <b>${it.points.join(", ")}</b></div>
  `;
}


/** STATS **/

function parseSnapshot(snapshot){
  const s = String(snapshot||"");
  const out = { setsA:0, setsB:0, gamesA:0, gamesB:0, pointLabel:"", server:"", side:"" };
  const mS = s.match(/S\s*(\d+)-(\d+)/);
  const mG = s.match(/G\s*(\d+)-(\d+)/);
  const mP = s.match(/P\s*([^·]+)/);
  const mSrv = s.match(/Srv\s*([AB])\s*(SD|SV)/);
  if (mS){ out.setsA=parseInt(mS[1],10)||0; out.setsB=parseInt(mS[2],10)||0; }
  if (mG){ out.gamesA=parseInt(mG[1],10)||0; out.gamesB=parseInt(mG[2],10)||0; }
  if (mP){ out.pointLabel=(mP[1]||"").trim(); }
  if (mSrv){ out.server=mSrv[1]; out.side=mSrv[2]; }
  return out;
}

function parsePointLabel(label){
  const t = String(label||"").trim();
  if (!t) return { kind:"unknown" };
  if (t.startsWith("TB ")){
    const m=t.match(/TB\s*(\d+)-(\d+)/);
    return { kind:"tb", a: intOr0(m?.[1]), b: intOr0(m?.[2]) };
  }
  if (t === "DEUCE") return { kind:"deuce" };
  if (t.startsWith("AD ")) return { kind:"ad", adv: t.endsWith("A") ? "A" : (t.endsWith("B") ? "B" : "") };
  const m=t.match(/(0|15|30|40)\s*-\s*(0|15|30|40)/);
  if (m){
    const map={"0":0,"15":15,"30":30,"40":40};
    return { kind:"reg", a: map[m[1]], b: map[m[2]] };
  }
  return { kind:"unknown" };
}

function intOr0(x){
  const n=parseInt(x,10);
  return isFinite(n) ? n : 0;
}

function setIndexFromPoint(p){
  const snap=parseSnapshot(p.snapshot);
  return (snap.setsA + snap.setsB + 1);
}

function isDeuceOrAd(labelInfo){
  return labelInfo.kind==="deuce" || labelInfo.kind==="ad";
}

function is30AllPlus(labelInfo){
  if (labelInfo.kind==="deuce" || labelInfo.kind==="ad") return true;
  if (labelInfo.kind!=="reg") return false;
  const a=labelInfo.a, b=labelInfo.b;
  // 30-30, 40-30, 30-40, 40-40 (no llega aquí), etc
  return (a>=30 && b>=30);
}

function isBreakPoint(point, labelInfo){
  if (!point) return false;
  if (labelInfo.kind==="tb") return false;
  const server = point.server;
  const receiver = other(server);
  if (labelInfo.kind==="ad") return labelInfo.adv===receiver;
  if (labelInfo.kind!=="reg") return false;
  const s = (server==="A") ? labelInfo.a : labelInfo.b;
  const r = (receiver==="A") ? labelInfo.a : labelInfo.b;
  return (r===40 && s<40);
}

function normalizeShotCode(evCode){
  const c=String(evCode||"").trim();
  if (c.startsWith("R ")) return { code: c.slice(2).trim(), isReturn:true };
  return { code: c, isReturn:false };
}

function decodeDirDepth(two){
  const code = String(two||"").trim();
  if (!/^[PMC][CMP]$/.test(code)) return null;
  return { depth: code[0], dir: code[1] };
}

function parseReason(reason){
  const r=String(reason||"");
  const m=r.match(/\(([AB])\)/);
  const offender = m ? m[1] : "";
  if (r.startsWith("Winner")) return { kind:"WIN", offender };
  if (r.startsWith("Error no forzado")) return { kind:"UE", offender };
  if (r.startsWith("Error forzado")) return { kind:"FE", offender };
  if (r.startsWith("Doble falta")) return { kind:"DF", offender };
  return { kind:"OTHER", offender };
}

function emptyPlayerStats(){
  return {
    pointsWon:0,
    servePoints:0, servePointsWon:0,
    firstIn:0, firstInWon:0,
    secondPlayed:0, secondIn:0, secondInWon:0,
    doubleFaults:0, aces:0,
    serveTargets:{T:0,C:0,A:0},

    returnPoints:0, returnPointsWon:0,
    returnsIn:0,
    returnDir:{C:0,M:0,P:0},
    returnDepth:{P:0,M:0,C:0},

    strokes:0,
    strokeDir:{C:0,M:0,P:0},
    strokeDepth:{P:0,M:0,C:0},

    winners:0, ue:0, fe:0, feDrawn:0,

    bpOpp:0, bpConv:0,
    bpFaced:0, bpSaved:0,

    pressureDeucePlayed:0, pressureDeuceWon:0,
    pressure3030Played:0, pressure3030Won:0,

    rallyWonPoints:0, rallyWonTotalLen:0,
    rallyWonBuckets:{b02:0,b35:0,b68:0,b9p:0},

    advWinners:{ACE:0,FH:0,BH:0,VOL_FH:0,VOL_BH:0,PASS:0,DROP:0,VOL:0,WIN:0,OTHER:0},
    advUE:{FH:0,BH:0,VOL:0,SM:0,OTHER:0},
    advFE:{FH:0,BH:0,VOL:0,SM:0,OTHER:0},
  };
}

function computeStats(points){
  const agg={ totalPoints: points.length, A: emptyPlayerStats(), B: emptyPlayerStats() };

  for (const pt of (points||[])){
    const server = pt.server;
    const receiver = other(server);

    // points won
    if (pt.winner==="A") agg.A.pointsWon++; else if (pt.winner==="B") agg.B.pointsWon++;

    // server/return points
    agg[server].servePoints++;
    if (pt.winner===server) agg[server].servePointsWon++;

    agg[receiver].returnPoints++;
    if (pt.winner===receiver) agg[receiver].returnPointsWon++;

    // snapshot contexts
    const snap = parseSnapshot(pt.snapshot);
    const labelInfo = parsePointLabel(snap.pointLabel);

    // pressure points (both players)
    if (isDeuceOrAd(labelInfo)){
      agg.A.pressureDeucePlayed++; agg.B.pressureDeucePlayed++;
      if (pt.winner==="A") agg.A.pressureDeuceWon++; else if (pt.winner==="B") agg.B.pressureDeuceWon++;
    }
    if (is30AllPlus(labelInfo)){
      agg.A.pressure3030Played++; agg.B.pressure3030Played++;
      if (pt.winner==="A") agg.A.pressure3030Won++; else if (pt.winner==="B") agg.B.pressure3030Won++;
    }

    // break points
    const bp = isBreakPoint(pt, labelInfo);
    if (bp){
      agg[receiver].bpOpp++;
      if (pt.winner===receiver) agg[receiver].bpConv++;
      agg[server].bpFaced++;
      if (pt.winner===server) agg[server].bpSaved++;
    }

    // serve analysis
    const evs = (pt.events||[]);
    const serveEvs = evs.filter(e=>e && e.type==="serve" && e.player===server);
    const hasDF = serveEvs.some(e=>e?.meta?.df || /\sDF$/.test(String(e.code||"")));
    const hasFault = serveEvs.some(e=>e?.meta?.fault || /\sF$/.test(String(e.code||"")));
    const targetEvs = serveEvs.filter(e=>e?.meta?.target && ["T","C","A"].includes(e.meta.target));
    const serveIn = targetEvs.length>0 && !hasDF;
    const firstFaulted = hasFault || hasDF; // DF implica 1º fallado aunque no lo registre

    if (hasDF) agg[server].doubleFaults++;

    if (firstFaulted) agg[server].secondPlayed++;

    if (serveIn && !firstFaulted){
      agg[server].firstIn++;
      if (pt.winner===server) agg[server].firstInWon++;
    }
    if (serveIn && firstFaulted && !hasDF){
      agg[server].secondIn++;
      if (pt.winner===server) agg[server].secondInWon++;
    }

    if (serveIn){
      const lastT = targetEvs[targetEvs.length-1]?.meta?.target;
      if (lastT && agg[server].serveTargets[lastT]!==undefined) agg[server].serveTargets[lastT]++;
    }

    // aces (solo si modo avanzado lo etiqueta)
    if (pt.finishDetail && pt.finishDetail.kind==="WINNER" && pt.finishDetail.winnerType==="ACE"){
      const pl = pt.finishDetail.offender || server; // offender suele ser ganador
      if (pl==="A" || pl==="B") agg[pl].aces++;
    }

    // return analysis (primer golpe del resto)
    const returnEv = evs.find(e=>e && e.type==="rally" && e.player===receiver && String(e.code||"").startsWith("R "));
    if (returnEv){
      agg[receiver].returnsIn++;
      const n = normalizeShotCode(returnEv.code);
      const dd = decodeDirDepth(n.code);
      if (dd){
        if (agg[receiver].returnDir[dd.dir]!==undefined) agg[receiver].returnDir[dd.dir]++;
        if (agg[receiver].returnDepth[dd.depth]!==undefined) agg[receiver].returnDepth[dd.depth]++;
      }
    }

    // rally strokes + direction/depth
    const rallyEvs = evs.filter(e=>e && e.type==="rally");
    for (const ev of rallyEvs){
      const pl = ev.player;
      if (pl!=="A" && pl!=="B") continue;
      agg[pl].strokes++;
      const n = normalizeShotCode(ev.code);
      const dd = decodeDirDepth(n.code);
      if (dd){
        if (agg[pl].strokeDir[dd.dir]!==undefined) agg[pl].strokeDir[dd.dir]++;
        if (agg[pl].strokeDepth[dd.depth]!==undefined) agg[pl].strokeDepth[dd.depth]++;
      }
    }

    // rally length buckets for points won
    const rallyLen = rallyEvs.length;
    const w = pt.winner;
    if (w==="A" || w==="B"){
      agg[w].rallyWonPoints++;
      agg[w].rallyWonTotalLen += rallyLen;
      const b = rallyLen<=2 ? "b02" : (rallyLen<=5 ? "b35" : (rallyLen<=8 ? "b68" : "b9p"));
      agg[w].rallyWonBuckets[b]++;
    }

    // end reason
    const end = parseReason(pt.reason);
    if (end.kind==="WIN" && (end.offender==="A" || end.offender==="B")) agg[end.offender].winners++;
    if (end.kind==="UE" && (end.offender==="A" || end.offender==="B")) agg[end.offender].ue++;
    if (end.kind==="FE" && (end.offender==="A" || end.offender==="B")){
      agg[end.offender].fe++;
      const otherPl = other(end.offender);
      agg[otherPl].feDrawn++;
    }
    // advanced breakdown (winners can be tagged also in normal mode: volea)
    const fd = pt.finishDetail;
    if (fd){
      const pl = fd.offender;
      if (pl==="A" || pl==="B"){
        if (fd.kind==="WINNER" && fd.winnerType && agg[pl].advWinners[fd.winnerType]!==undefined){
          agg[pl].advWinners[fd.winnerType]++;
        }
        if (fd.mode==="advanced"){
          if (fd.kind==="UE" && fd.strokeType && agg[pl].advUE[fd.strokeType]!==undefined){
            agg[pl].advUE[fd.strokeType]++;
          }
          if (fd.kind==="FE" && fd.strokeType && agg[pl].advFE[fd.strokeType]!==undefined){
            agg[pl].advFE[fd.strokeType]++;
          }
        }
      }
    }
  }

  return agg;
}

function fmtPct(n,d){
  if (!d) return "—";
  return `${Math.round((n/d)*100)}%`;
}
function fmtRatio(n,d){
  if (!d) return "—";
  return `${n}/${d} (${Math.round((n/d)*100)}%)`;
}
function fmtAvg(n,d){
  if (!d) return "—";
  return `${(n/d).toFixed(1)}`;
}
function fmtNum(n, digits=1){
  const x = Number(n);
  if (!isFinite(x)) return "—";
  return digits===0 ? String(Math.round(x)) : x.toFixed(digits);
}


function buildStatsSetOptions(){
  const sel = $("#sSet");
  if (!sel) return;
  const prev = sel.value || "all";
  let maxSet = 1;
  for (const p of (state.matchPoints||[])) maxSet = Math.max(maxSet, setIndexFromPoint(p));
  sel.innerHTML = '<option value="all">Todos</option>' + Array.from({length:maxSet}, (_,i)=>`<option value="${i+1}">Set ${i+1}</option>`).join('');
  if ([...sel.options].some(o=>o.value==prev)) sel.value = prev;
}

function filterPointsForStats(){
  let pts = (state.matchPoints||[]).slice();

  const range = $("#sRange")?.value || "all";
  const setV  = $("#sSet")?.value || "all";
  const srvV  = $("#sServer")?.value || "";
  const ctxV  = $("#sContext")?.value || "all";

  if (setV !== "all"){
    const want = parseInt(setV,10);
    pts = pts.filter(p=> setIndexFromPoint(p) === want);
  }
  if (srvV){
    pts = pts.filter(p=> p.server === srvV);
  }

  if (ctxV !== "all"){
    pts = pts.filter(p=>{
      const info = parsePointLabel(parseSnapshot(p.snapshot).pointLabel);
      if (ctxV==="bp") return isBreakPoint(p, info);
      if (ctxV==="deuce") return isDeuceOrAd(info);
      if (ctxV==="3030") return is30AllPlus(info);
      return true;
    });
  }

  if (range !== "all"){
    const n = parseInt(range,10);
    if (isFinite(n) && n>0) pts = pts.slice(-n);
  }
  return pts;
}

function renderStats(){
  const pts = filterPointsForStats();
  const sub = $("#statsSub");
  const body = $("#statsBody");
  if (!body) return;

  const mode = $("#sMode")?.value || "table";           // table | broadcast
  const subMode = $("#sSub")?.value || "none";          // none | set | game | side

  const nameA = state.names.A;
  const nameB = state.names.B;

  const labelSubMode = (m)=>({
    none: "Global",
    set: "Por set",
    game: "Por juego",
    side: "Por lado",
  }[m] || "Global");

  if (sub){
    sub.textContent = `${pts.length} puntos · Vista: ${mode==="broadcast"?"Broadcast":"Tabla"} · ${labelSubMode(subMode)}`;
  }

  if (!pts.length){
    body.innerHTML = `
      <div class="statsSection">
        <div class="statsSectionTitle">Sin datos</div>
        <div class="muted" style="padding: 12px 14px;">No hay puntos para estos filtros.</div>
      </div>`;
    return;
  }

  const groups = buildStatsGroups(pts, subMode);

  const headerRow = (midLabel)=> (
    `<div class="statsHeaderRow">`+
      `<div class="statsPlayerHead a">${escapeHtml(nameA)}</div>`+
      `<div class="statsMidHead">${escapeHtml(midLabel)}</div>`+
      `<div class="statsPlayerHead b">${escapeHtml(nameB)}</div>`+
    `</div>`
  );

  const groupPill = (t)=> t ? (`<div class="statsHint"><span class="statsPill">${escapeHtml(t)}</span></div>`) : "";

  const buildBroadcast = (title, agg)=>{
    const bRow = (label, a, b)=> (
      `<div class="broadcastRow">`+
        `<div class="broadcastL">${a}</div>`+
        `<div class="broadcastMid"><span>${label}</span></div>`+
        `<div class="broadcastR">${b}</div>`+
      `</div>`
    );

    const totalPts = agg.A.pointsWon + agg.B.pointsWon;
    const rows = [
      bRow("Puntos ganados %", fmtPct(agg.A.pointsWon, totalPts), fmtPct(agg.B.pointsWon, totalPts)),
      bRow("Aces", String(agg.A.aces), String(agg.B.aces)),
      bRow("Dobles faltas", String(agg.A.doubleFaults), String(agg.B.doubleFaults)),
      bRow("1º saque IN %", fmtPct(agg.A.firstIn, agg.A.servePoints), fmtPct(agg.B.firstIn, agg.B.servePoints)),
      bRow("% pts ganados con 1º", fmtPct(agg.A.firstInWon, agg.A.firstIn), fmtPct(agg.B.firstInWon, agg.B.firstIn)),
      bRow("% pts ganados con 2º", fmtPct(agg.A.secondInWon, agg.A.secondIn), fmtPct(agg.B.secondInWon, agg.B.secondIn)),
      bRow("Winners", String(agg.A.winners), String(agg.B.winners)),
      bRow("Errores no forzados", String(agg.A.ue), String(agg.B.ue)),
      bRow("Errores forzados (prov.)", String(agg.A.feDrawn), String(agg.B.feDrawn)),
      bRow("Break points ganados", fmtRatio(agg.A.bpConv, agg.A.bpOpp), fmtRatio(agg.B.bpConv, agg.B.bpOpp)),
    ].join("");

    return `
      <div class="broadcastCard">
        <div class="broadcastHead"><div class="t">${escapeHtml(title)}</div></div>
        <div class="broadcastTable">${rows}</div>
      </div>
    `;
  };

  const buildTable = (title, agg)=>{
    const row = (label, a, b) => (
      `<div class="statsRow">`+
        `<div class="statsVal a">${a}</div>`+
        `<div class="statsKey">${label}</div>`+
        `<div class="statsVal b">${b}</div>`+
      `</div>`
    );
    const section = (t, rowsHtml)=> (
      `<div class="statsSection">`+
        `<div class="statsSectionTitle">${t}</div>`+
        `<div class="statsTable">${rowsHtml}</div>`+
      `</div>`
    );

    const totalPts = agg.A.pointsWon + agg.B.pointsWon;

        const summaryRows = [
      row("Puntos ganados", fmtRatio(agg.A.pointsWon, totalPts), fmtRatio(agg.B.pointsWon, totalPts)),
      row("Aces", String(agg.A.aces), String(agg.B.aces)),
      row("Dobles faltas", String(agg.A.doubleFaults), String(agg.B.doubleFaults)),
      row("Winners", String(agg.A.winners), String(agg.B.winners)),
      row("Winners / golpes", fmtRatio(agg.A.winners, agg.A.strokes), fmtRatio(agg.B.winners, agg.B.strokes)),
      row("Errores no forzados", String(agg.A.ue), String(agg.B.ue)),
      row("UE / golpes", fmtRatio(agg.A.ue, agg.A.strokes), fmtRatio(agg.B.ue, agg.B.strokes)),
      row("Errores forzados", String(agg.A.fe), String(agg.B.fe)),
      row("FE / golpes", fmtRatio(agg.A.fe, agg.A.strokes), fmtRatio(agg.B.fe, agg.B.strokes)),
      row("Errores forzados provocados", String(agg.A.feDrawn), String(agg.B.feDrawn)),
    ].join("");

    const serveRows = [
      row("Puntos al saque", fmtRatio(agg.A.servePointsWon, agg.A.servePoints), fmtRatio(agg.B.servePointsWon, agg.B.servePoints)),
      row("1º saque IN %", fmtPct(agg.A.firstIn, agg.A.servePoints), fmtPct(agg.B.firstIn, agg.B.servePoints)),
      row("% pts ganados con 1º", fmtPct(agg.A.firstInWon, agg.A.firstIn), fmtPct(agg.B.firstInWon, agg.B.firstIn)),
      row("% pts ganados con 2º", fmtPct(agg.A.secondInWon, agg.A.secondIn), fmtPct(agg.B.secondInWon, agg.B.secondIn)),
      row("Aces", String(agg.A.aces), String(agg.B.aces)),
      row("Dobles faltas", String(agg.A.doubleFaults), String(agg.B.doubleFaults)),
    ].join("");

    const returnRows = [
      row("Puntos al resto", fmtRatio(agg.A.returnPointsWon, agg.A.returnPoints), fmtRatio(agg.B.returnPointsWon, agg.B.returnPoints)),
      row("Break points (ganados)", fmtRatio(agg.A.bpConv, agg.A.bpOpp), fmtRatio(agg.B.bpConv, agg.B.bpOpp)),
      row("Break points (salvados)", fmtRatio(agg.A.bpSaved, agg.A.bpFaced), fmtRatio(agg.B.bpSaved, agg.B.bpFaced)),
    ].join("");

    const dirTotA = agg.A.strokeDir.C + agg.A.strokeDir.M + agg.A.strokeDir.P;
    const dirTotB = agg.B.strokeDir.C + agg.B.strokeDir.M + agg.B.strokeDir.P;
    const depTotA = agg.A.strokeDepth.P + agg.A.strokeDepth.M + agg.A.strokeDepth.C;
    const depTotB = agg.B.strokeDepth.P + agg.B.strokeDepth.M + agg.B.strokeDepth.C;

    const shotRows = [
      row("Golpes totales", String(agg.A.strokes), String(agg.B.strokes)),
      row("Cruzados %", fmtPct(agg.A.strokeDir.C, dirTotA), fmtPct(agg.B.strokeDir.C, dirTotB)),
      row("Medio %", fmtPct(agg.A.strokeDir.M, dirTotA), fmtPct(agg.B.strokeDir.M, dirTotB)),
      row("Paralelos %", fmtPct(agg.A.strokeDir.P, dirTotA), fmtPct(agg.B.strokeDir.P, dirTotB)),
      row("Profundos %", fmtPct(agg.A.strokeDepth.P, depTotA), fmtPct(agg.B.strokeDepth.P, depTotB)),
      row("Medios %", fmtPct(agg.A.strokeDepth.M, depTotA), fmtPct(agg.B.strokeDepth.M, depTotB)),
      row("Cortos %", fmtPct(agg.A.strokeDepth.C, depTotA), fmtPct(agg.B.strokeDepth.C, depTotB)),
    ].join("");

    const rallyRows = [
      row("Media golpes (puntos ganados)", fmtAvg(agg.A.rallyWonTotalLen, agg.A.rallyWonPoints), fmtAvg(agg.B.rallyWonTotalLen, agg.B.rallyWonPoints)),
      row("0-2 golpes", fmtRatio(agg.A.rallyWonBuckets.b02, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b02, agg.B.rallyWonPoints)),
      row("3-5 golpes", fmtRatio(agg.A.rallyWonBuckets.b35, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b35, agg.B.rallyWonPoints)),
      row("6-8 golpes", fmtRatio(agg.A.rallyWonBuckets.b68, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b68, agg.B.rallyWonPoints)),
      row("9+ golpes", fmtRatio(agg.A.rallyWonBuckets.b9p, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b9p, agg.B.rallyWonPoints)),
    ].join("");

    const keyRows = [
      row("Puntos en Deuce/Adv ganados", fmtRatio(agg.A.pressureDeuceWon, agg.A.pressureDeucePlayed), fmtRatio(agg.B.pressureDeuceWon, agg.B.pressureDeucePlayed)),
      row("Puntos 30-30+ ganados", fmtRatio(agg.A.pressure3030Won, agg.A.pressure3030Played), fmtRatio(agg.B.pressure3030Won, agg.B.pressure3030Played)),
    ].join("");

    const adv = (t, rowsHtml)=> (
      `<details class="statsDetails"><summary>${t}</summary><div class="statsTable">${rowsHtml}</div></details>`
    );

    const advWinnerRowsBase = [
      row("Ace", String(agg.A.advWinners.ACE||0), String(agg.B.advWinners.ACE||0)),
      row("Winner derecha", String(agg.A.advWinners.FH||0), String(agg.B.advWinners.FH||0)),
      row("Winner revés", String(agg.A.advWinners.BH||0), String(agg.B.advWinners.BH||0)),
      row("Volea derecha", String(agg.A.advWinners.VOL_FH||0), String(agg.B.advWinners.VOL_FH||0)),
      row("Volea revés", String(agg.A.advWinners.VOL_BH||0), String(agg.B.advWinners.VOL_BH||0)),
      row("Passing", String(agg.A.advWinners.PASS||0), String(agg.B.advWinners.PASS||0)),
      row("Dejada", String(agg.A.advWinners.DROP||0), String(agg.B.advWinners.DROP||0)),
    ];
    const legacyWinRows=[];
    if ((agg.A.advWinners.VOL||0)+(agg.B.advWinners.VOL||0)>0) legacyWinRows.push(row("Volea (sin lado)", String(agg.A.advWinners.VOL||0), String(agg.B.advWinners.VOL||0)));
    const advWinnerRows = [...advWinnerRowsBase, ...legacyWinRows].join("");

    const advUERows = [
      row("UE Derecha", String(agg.A.advUE.FH), String(agg.B.advUE.FH)),
      row("UE Revés", String(agg.A.advUE.BH), String(agg.B.advUE.BH)),
      row("UE Volea", String(agg.A.advUE.VOL), String(agg.B.advUE.VOL)),
      row("UE Smash", String(agg.A.advUE.SM), String(agg.B.advUE.SM)),
      row("UE Otro", String(agg.A.advUE.OTHER), String(agg.B.advUE.OTHER)),
    ].join("");

    const advFERows = [
      row("FE Derecha", String(agg.A.advFE.FH), String(agg.B.advFE.FH)),
      row("FE Revés", String(agg.A.advFE.BH), String(agg.B.advFE.BH)),
      row("FE Volea", String(agg.A.advFE.VOL), String(agg.B.advFE.VOL)),
      row("FE Smash", String(agg.A.advFE.SM), String(agg.B.advFE.SM)),
      row("FE Otro", String(agg.A.advFE.OTHER), String(agg.B.advFE.OTHER)),
    ].join("");

    return `
      ${section("Resumen", summaryRows)}
      ${section("Servicio", serveRows)}
      ${section("Resto", returnRows)}
      ${section("Dirección y profundidad", shotRows)}
      ${section("Rally", rallyRows)}
      ${section("Puntos clave", keyRows)}
      ${adv("Desglose winners (modo avanzado)", advWinnerRows)}
      ${adv("Desglose UE (modo avanzado)", advUERows)}
      ${adv("Desglose FE (modo avanzado)", advFERows)}
    `;
  };

  // Sticky header row (players + current view)
  const midLabel = (subMode==="none") ? "Estadísticas" : labelSubMode(subMode);
  const header = headerRow(midLabel);

  body.innerHTML = header + groups.map((g)=>{
    const title = (subMode==="none") ? "Global" : g.title;
    const agg = computeStats(g.points);
    const top = (subMode==="none") ? "" : groupPill(g.title);
    return top + ((mode==="broadcast") ? buildBroadcast(title, agg) : buildTable(title, agg));
  }).join("");
}

function buildStatsGroups(points, subMode){
  // points already filtered by stats filters
  if (subMode === "set"){
    const by = new Map();
    points.forEach(p=>{
      const s = setIndexFromPoint(p) || 1;
      const key = String(s);
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(p);
    });
    return [...by.entries()].sort((a,b)=>Number(a[0])-Number(b[0])).map(([k,pts])=>({ title:`Set ${k}`, points:pts }));
  }
  if (subMode === "game"){
    const by = new Map();
    points.forEach(p=>{
      const snap = parseSnapshot(p.snapshot||"");
      const setN = (snap.setsA + snap.setsB + 1) || 1;
      const gameN = (snap.gamesA + snap.gamesB + 1) || 1;
      const key = `${setN}-${gameN}`;
      if (!by.has(key)) by.set(key, { setN, gameN, pts: [] });
      by.get(key).pts.push(p);
    });
    return [...by.values()].sort((a,b)=> a.setN===b.setN ? a.gameN-b.gameN : a.setN-b.setN)
      .map(g=>({ title:`Set ${g.setN} · Juego ${g.gameN}`, points:g.pts }));
  }
  if (subMode === "side"){
    const order = { SD:0, SV:1, "": 2 };
    const by = new Map();
    points.forEach(p=>{
      const key = p.side || "";
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(p);
    });
    const label = (k)=> k==="SD" ? "Lado Deuce (SD)" : k==="SV" ? "Lado Ventaja (SV)" : "Sin lado";
    return [...by.entries()].sort((a,b)=>(order[a[0]]??9)-(order[b[0]]??9))
      .map(([k,pts])=>({ title:label(k), points:pts }));
  }
  return [{ title:"Estadísticas", points }];
}


function exportCSV(){
  const includeServe = $("#eIncludeServe")?.checked ?? true;
  const splitShots = $("#eSplitShots")?.checked ?? false;
  const {rows, maxShots} = getExport(includeServe, splitShots);
  const nameA=state.names.A, nameB=state.names.B;

  const base = ["Punto","Marcador","Servidor","Ganador","Motivo","Detalle","NºGolpes","Patrón"];
  const shotCols = splitShots ? Array.from({length:maxShots},(_,i)=>`Golpe${i+1}`) : [];
  const lines=[];
  lines.push([...base,...shotCols].map(csvEscape).join(","));
  rows.forEach(r=>{
    const winnerName = (r.winner==="A")?nameA:nameB;
    const detail = finishDetailLabel(r.finishDetail);
    const row = [r.n, r.snapshot, r.server, winnerName, r.reason, detail, r.evs.length, r.pattern];
    const shots = splitShots ? Array.from({length:maxShots},(_,i)=>r.evs[i]||"") : [];
    lines.push([...row,...shots].map(csvEscape).join(","));
  });
  const stamp = new Date().toISOString().slice(0,16).replace(":","").replace("T","_");
  downloadFile(`partido_${stamp}.csv`, "text/csv;charset=utf-8", lines.join("\n"));
}

function exportWord(){
  const includeServe=$("#eIncludeServe").checked;
  const {rows} = getExport(includeServe, false);
  const nameA=escapeHtml(state.names.A), nameB=escapeHtml(state.names.B);
  const stamp = new Date().toLocaleString();

  const bodyRows = rows.map(r=>{
    const win = r.winner==="A"?nameA:nameB;
    const seq = r.evs.map((s,i)=>`${i+1}. ${escapeHtml(s)}`).join("<br/>");
    return `<tr><td>${r.n}</td><td>${escapeHtml(r.snapshot)}</td><td>${escapeHtml(r.server)}</td><td><b>${win}</b></td><td>${escapeHtml(r.reason)}</td><td>${escapeHtml(finishDetailLabel(r.finishDetail))}</td><td class="mono">${seq}</td></tr>`;
  }).join("");

  const brand = escapeHtml($("#eBrand").value || "Tennis Direction Tracker");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${brand}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:18px;}
    h1{font-size:18px;margin:0 0 4px;}
    .sub{font-size:12px;color:#666;margin:0 0 12px;}
    table{border-collapse:collapse;width:100%;}
    th,td{border:1px solid #cfcfcf;padding:6px 8px;vertical-align:top;font-size:11px;}
    th{background:#f2f2f2;}
    tr:nth-child(even) td{background:#fafafa;}
    .mono{font-family:Menlo,Consolas,monospace;white-space:pre-wrap;line-height:1.25;}
  </style></head><body>
    <h1>${brand} · ${nameA} vs ${nameB}</h1>
    <p class="sub">Exportado: ${escapeHtml(stamp)} · Puntos: ${rows.length}</p>
    <table><thead><tr><th>#</th><th>Marcador</th><th>Servidor</th><th>Ganador</th><th>Motivo</th><th>Detalle</th><th>Secuencia</th></tr></thead>
    <tbody>${bodyRows}</tbody></table>
  </body></html>`;
  const stampFile = new Date().toISOString().slice(0,16).replace(":","").replace("T","_");
  downloadFile(`partido_${stampFile}.doc`, "application/msword;charset=utf-8", html);
}

function exportPDF(){
  const includeServe = true;
  const brand = "Tennis Direction Tracker";
  const {rows} = getExport(includeServe, false);
  const aStats = computePatternStats(includeServe);
  const top = Object.values(aStats).sort((x,y)=>y.count-x.count).slice(0,5);

  const nameA=state.names.A, nameB=state.names.B;
  const stamp = new Date().toLocaleString();

  const topRows = top.map(it=>{
    return `<tr>
      <td class="mono">${escapeHtml(it.key)}</td>
      <td>${it.count}</td>
      <td>${it.winA}</td>
      <td>${it.winB}</td>
      <td><b>${escapeHtml(it.dominant)}</b></td>
    </tr>`;
  }).join("");

  const ptsRows = rows.map(r=>{
    const win = r.winner==="A"?nameA:nameB;
    return `<tr>
      <td>${r.n}</td>
      <td>${escapeHtml(r.snapshot)}</td>
      <td>${escapeHtml(r.server)}</td>
      <td><b>${escapeHtml(win)}</b></td>
      <td>${escapeHtml(r.reason || "")}${finishDetailLabel(r.finishDetail) ? " · " + escapeHtml(finishDetailLabel(r.finishDetail)) : ""}</td>
      <td class="mono">${escapeHtml(r.pattern)}</td>
    </tr>`;
  }).join("");
const miniSvg = (arrows, idx)=>{
    const defs = `
      <defs>
        <marker id="ahA_${idx}" viewBox="0 0 10 10" refX="9.0" refY="5" markerWidth="8.2" markerHeight="8.2" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)"></path>
        </marker>
        <marker id="ahB_${idx}" viewBox="0 0 10 10" refX="9.0" refY="5" markerWidth="8.2" markerHeight="8.2" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--bad)"></path>
        </marker>
      </defs>`;
    const segs = (arrows||[]).map(a=>{
      const A = {x:a.from.x*1000, y:a.from.y*1000};
      const P = {x:a.through.x*1000, y:a.through.y*1000};
      const E = {x:a.to.x*1000, y:a.to.y*1000};
      const col = (a.hitter==="A") ? "#FFF200" : "#FF2A2A";
      const mid = (a.hitter==="A") ? `url(#ahA_${idx})` : `url(#ahB_${idx})`;
      return `
        <path d="M ${A.x.toFixed(1)} ${A.y.toFixed(1)} L ${P.x.toFixed(1)} ${P.y.toFixed(1)} L ${E.x.toFixed(1)} ${E.y.toFixed(1)}"
          fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="${mid}" opacity=".86"></path>
        <circle cx="${A.x.toFixed(1)}" cy="${A.y.toFixed(1)}" r="14" fill="rgba(0,0,0,.55)" stroke="${col}" stroke-width="2"></circle>
        <text x="${A.x.toFixed(1)}" y="${A.y.toFixed(1)}" font-size="18" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="middle">${a.n}</text>
      `;
    }).join("");
    return `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">${defs}${segs}</svg>`;
  };


  // --- Smart page breaks (Pro) ---
  // - If there are many points, start the diagram section on a new page.
  // - Avoid splitting a point card across pages.
  // - Add a soft break every 2 point cards (A4 portrait).
  // - If set score changes, force a new page and add a set divider.
  const parseSetScore = (snapshot)=>{
    const m = (snapshot||"").match(/\bS\s*([0-9]+)\s*-\s*([0-9]+)/i);
    return m ? `${m[1]}-${m[2]}` : null;
  };

  let prevSet = null;
  const pointCardsArr = [];
  for (let idx=0; idx<rows.length; idx++){
    const r = rows[idx];
    const win = r.winner === "A" ? nameA : nameB;
    const arrows = r.arrows || [];

    const mini = arrows.length ? `
      <div class="miniCourtWrap">
        <div class="miniCourt" style="width:190px; aspect-ratio:1/2; border-radius:10px; border:1px solid #cbd5e1; background:#fff; position:relative; overflow:hidden;">
          <img src="assets/court_top_view.png" alt="court" style="width:100%; height:100%; object-fit:contain; display:block; background:#fff;">
          ${miniSvg(arrows, idx)}
        </div>
      </div>` : `<div style="color:#64748b; font-size:11px;">(Sin flechas)</div>`;

    const setScore = parseSetScore(r.snapshot);
    const isNewSet = (idx>0 && setScore && prevSet && setScore !== prevSet);

    // Hard break at new set
    if (isNewSet){
      pointCardsArr.push(`
        <div class="printSetDivider printPageBreakBefore">
          <div class="printSetTitle">Nuevo set (S ${escapeHtml(setScore)})</div>
        </div>
      `);
    }

    // Soft break every 2 points (keeps pages clean without risking cut-offs)
    const softBreak = (!isNewSet && idx>0 && (idx % 2 === 0));
    const breakClass = softBreak ? "printPageBreakBefore" : "";

    pointCardsArr.push(`
      <div class="printPointCard ${breakClass}">
        <div class="printPointGrid">
          <div>${mini}</div>
          <div>
            <div class="printPointTitle">Punto ${r.n} · Gana ${escapeHtml(win)}</div>
            <div class="printPointMeta">${escapeHtml(r.snapshot)}</div>
            <div class="printPointEnd"><b>${escapeHtml(r.reason || "")}</b>${finishDetailLabel(r.finishDetail) ? " · " + escapeHtml(finishDetailLabel(r.finishDetail)) : ""}</div>
            <div class="printPointPattern">${escapeHtml(r.pattern)}</div>
          </div>
        </div>
      </div>
    `);

    if (setScore) prevSet = setScore;
  }
  const pointCards = pointCardsArr.join("");


  const breakDiagrams = rows.length > 2; // salto inteligente: separa diagramas si hay muchos puntos

  // Build printable report inline (no popups)
  const existing = document.getElementById("printReport");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = "printReport";
  wrap.innerHTML = `<!---->
    <div style="font-family:Arial,sans-serif; background:#fff; color:#0f172a; padding:26px 28px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #cbd5e1; padding-bottom:14px; margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:900; letter-spacing:.3px;">${escapeHtml(brand)}</div>
          <div style="font-size:22px;font-weight:900; margin-top:6px;">Reporte del partido: ${escapeHtml(nameA)} vs ${escapeHtml(nameB)}</div>
          <div style="color:#334155;font-size:12px;margin-top:6px;">Exportado: ${escapeHtml(stamp)} · Sets ${state.sets.A}-${state.sets.B} · Games ${state.games.A}-${state.games.B} · Puntos ${rows.length}</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr; gap:12px; margin: 16px 0;">
        <div class="printSection printKeepTogether" style="border:1px solid #cbd5e1; border-radius:14px; background:#fff; padding:12px;">
          <div class="printSectionTitle printKeepWithNext">Top 5 patrones más repetidos</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead><tr>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Patrón</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Veces</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Gana A</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Gana B</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Dominante</th>
            </tr></thead>
            <tbody>
              ${topRows || "<tr><td colspan='5' style='padding:8px;border-bottom:1px solid #cbd5e1;'>Sin datos</td></tr>"}
            </tbody>
          </table>
        </div>

        <div class="printSection" style="border:1px solid #cbd5e1; border-radius:14px; background:#fff; padding:12px;">
          <div class="printSectionTitle printKeepWithNext">Puntos (punto a punto)</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead><tr>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">#</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Marcador</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Servidor</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Ganador</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Final</th>
              <th style="background:#eef2ff;color:#1e3a8a;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:8px;">Patrón</th>
            </tr></thead>
            <tbody>
              ${ptsRows || "<tr><td colspan='6' style='padding:8px;border-bottom:1px solid #cbd5e1;'>Sin puntos</td></tr>"}
            </tbody>
          </table>
        </div>

        <div class="printSection ${breakDiagrams ? 'printPageBreakBefore' : ''}" style="border:1px solid #cbd5e1; border-radius:14px; background:#fff; padding:12px;">
          <div class="printSectionTitle printKeepWithNext">Puntos con diagrama (flechas)</div>
          <div style="font-size:11px; color:#334155; margin-bottom:10px;">Cada punto incluye un mini-diagrama con flechas (A amarillo, B rojo).</div>
          ${pointCards || "<div style=\'color:#64748b;font-size:11px;\'>Sin datos.</div>"}
        </div>
      </div>

      <div style="margin-top:16px;color:#334155;font-size:11px;">© ${new Date().getFullYear()} ${escapeHtml(brand)} · Export premium</div>
    </div>`;

  document.body.appendChild(wrap);
  document.body.classList.add("printing");

  const cleanup = ()=>{
    document.body.classList.remove("printing");
    const el = document.getElementById("printReport");
    if (el) el.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // open print dialog (user chooses "Guardar como PDF")
  window.print();
}


function exportStatsPDF(){
  // Exporta la pantalla de Estadísticas a PDF (vía imprimir / Guardar como PDF)
  const pts = filterPointsForStats();
  const subMode = $("#sSub")?.value || "none";
  const groups = buildStatsGroups(pts, subMode);

  const nameA = state.names.A || "Jugador A";
  const nameB = state.names.B || "Jugador B";
  const stamp = new Date().toLocaleString();

  const fRange = $("#sRange")?.value || "all";
  const fSet = $("#sSet")?.value || "all";
  const fServer = $("#sServer")?.value || "all";
  const fContext = $("#sContext")?.value || "all";

  const rangeLabel = {
    all: "Todo el partido",
    last10: "Últimos 10 puntos",
    last20: "Últimos 20 puntos",
    last50: "Últimos 50 puntos",
  }[fRange] || "Todo el partido";

  const serverLabel = (fServer==="A" ? `${nameA}` : fServer==="B" ? `${nameB}` : "Todos");
  const contextLabel = {
    all: "Todos",
    bp: "Break points",
    deuce: "Deuce/Adv",
    tiebreak: "Tie-break",
  }[fContext] || "Todos";

  const setLabel = (fSet==="all" ? "Todos" : `Set ${fSet}`);

  const filterLine = `Rango: ${escapeHtml(rangeLabel)} · Set: ${escapeHtml(setLabel)} · Servidor: ${escapeHtml(serverLabel)} · Contexto: ${escapeHtml(contextLabel)} · Puntos: ${pts.length}`;

  const row = (label, a, b)=>`<tr><td class="num a">${escapeHtml(a)}</td><td class="lab">${escapeHtml(label)}</td><td class="num b">${escapeHtml(b)}</td></tr>`;
  const section = (title, rowsHtml)=>`<div class="section"><div class="sectionTitle">${escapeHtml(title)}</div><table class="t"><tbody>${rowsHtml}</tbody></table></div>`;

  const printTable = (title, agg)=>{
    const totalPts = agg.A.pointsWon + agg.B.pointsWon;

    const dirTotA = agg.A.strokeDir.C + agg.A.strokeDir.M + agg.A.strokeDir.P;
    const dirTotB = agg.B.strokeDir.C + agg.B.strokeDir.M + agg.B.strokeDir.P;
    const depTotA = agg.A.strokeDepth.P + agg.A.strokeDepth.M + agg.A.strokeDepth.C;
    const depTotB = agg.B.strokeDepth.P + agg.B.strokeDepth.M + agg.B.strokeDepth.C;

    const serveTotA = agg.A.serveTargets.T + agg.A.serveTargets.C + agg.A.serveTargets.A;
    const serveTotB = agg.B.serveTargets.T + agg.B.serveTargets.C + agg.B.serveTargets.A;

    const retDirTotA = agg.A.returnDir.C + agg.A.returnDir.M + agg.A.returnDir.P;
    const retDirTotB = agg.B.returnDir.C + agg.B.returnDir.M + agg.B.returnDir.P;
    const retDepTotA = agg.A.returnDepth.P + agg.A.returnDepth.M + agg.A.returnDepth.C;
    const retDepTotB = agg.B.returnDepth.P + agg.B.returnDepth.M + agg.B.returnDepth.C;

    const sumRows = [
      row("Puntos ganados", fmtRatio(agg.A.pointsWon, totalPts), fmtRatio(agg.B.pointsWon, totalPts)),
      row("Aces", String(agg.A.aces), String(agg.B.aces)),
      row("Dobles faltas", String(agg.A.doubleFaults), String(agg.B.doubleFaults)),
      row("Winners", String(agg.A.winners), String(agg.B.winners)),
      row("Winners / golpes", fmtRatio(agg.A.winners, agg.A.strokes), fmtRatio(agg.B.winners, agg.B.strokes)),
      row("Errores no forzados", String(agg.A.ue), String(agg.B.ue)),
      row("UE / golpes", fmtRatio(agg.A.ue, agg.A.strokes), fmtRatio(agg.B.ue, agg.B.strokes)),
      row("Errores forzados", String(agg.A.fe), String(agg.B.fe)),
      row("FE / golpes", fmtRatio(agg.A.fe, agg.A.strokes), fmtRatio(agg.B.fe, agg.B.strokes)),
      row("Errores forzados provocados", String(agg.A.feDrawn), String(agg.B.feDrawn)),
    ].join("");

    const serveRows = [
      row("Puntos al saque", fmtRatio(agg.A.servePointsWon, agg.A.servePoints), fmtRatio(agg.B.servePointsWon, agg.B.servePoints)),
      row("1º saque IN %", fmtPct(agg.A.firstIn, agg.A.servePoints), fmtPct(agg.B.firstIn, agg.B.servePoints)),
      row("% pts ganados con 1º", fmtPct(agg.A.firstInWon, agg.A.firstIn), fmtPct(agg.B.firstInWon, agg.B.firstIn)),
      row("% pts ganados con 2º", fmtPct(agg.A.secondInWon, agg.A.secondIn), fmtPct(agg.B.secondInWon, agg.B.secondIn)),
      row("Saque a T %", fmtPct(agg.A.serveTargets.T, serveTotA), fmtPct(agg.B.serveTargets.T, serveTotB)),
      row("Saque al cuerpo %", fmtPct(agg.A.serveTargets.C, serveTotA), fmtPct(agg.B.serveTargets.C, serveTotB)),
      row("Saque a abierto %", fmtPct(agg.A.serveTargets.A, serveTotA), fmtPct(agg.B.serveTargets.A, serveTotB)),
    ].join("");

    const retRows = [
      row("Puntos al resto", fmtRatio(agg.A.returnPointsWon, agg.A.returnPoints), fmtRatio(agg.B.returnPointsWon, agg.B.returnPoints)),
      row("Break points (ganados)", fmtRatio(agg.A.bpConv, agg.A.bpOpp), fmtRatio(agg.B.bpConv, agg.B.bpOpp)),
      row("Break points (salvados)", fmtRatio(agg.A.bpSaved, agg.A.bpFaced), fmtRatio(agg.B.bpSaved, agg.B.bpFaced)),
      row("Dirección resto cruzado %", fmtPct(agg.A.returnDir.C, retDirTotA), fmtPct(agg.B.returnDir.C, retDirTotB)),
      row("Dirección resto paralelo %", fmtPct(agg.A.returnDir.P, retDirTotA), fmtPct(agg.B.returnDir.P, retDirTotB)),
      row("Profundidad resto profundo %", fmtPct(agg.A.returnDepth.P, retDepTotA), fmtPct(agg.B.returnDepth.P, retDepTotB)),
      row("Profundidad resto corto %", fmtPct(agg.A.returnDepth.C, retDepTotA), fmtPct(agg.B.returnDepth.C, retDepTotB)),
    ].join("");

    const shotRows = [
      row("Golpes totales", String(agg.A.strokes), String(agg.B.strokes)),
      row("Cruzados %", fmtPct(agg.A.strokeDir.C, dirTotA), fmtPct(agg.B.strokeDir.C, dirTotB)),
      row("Medio %", fmtPct(agg.A.strokeDir.M, dirTotA), fmtPct(agg.B.strokeDir.M, dirTotB)),
      row("Paralelos %", fmtPct(agg.A.strokeDir.P, dirTotA), fmtPct(agg.B.strokeDir.P, dirTotB)),
      row("Profundos %", fmtPct(agg.A.strokeDepth.P, depTotA), fmtPct(agg.B.strokeDepth.P, depTotB)),
      row("Medios %", fmtPct(agg.A.strokeDepth.M, depTotA), fmtPct(agg.B.strokeDepth.M, depTotB)),
      row("Cortos %", fmtPct(agg.A.strokeDepth.C, depTotA), fmtPct(agg.B.strokeDepth.C, depTotB)),
    ].join("");

    const rallyRows = [
      row("Media golpes (puntos ganados)", fmtAvg(agg.A.rallyWonTotalLen, agg.A.rallyWonPoints), fmtAvg(agg.B.rallyWonTotalLen, agg.B.rallyWonPoints)),
      row("0-2 golpes", fmtRatio(agg.A.rallyWonBuckets.b02, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b02, agg.B.rallyWonPoints)),
      row("3-5 golpes", fmtRatio(agg.A.rallyWonBuckets.b35, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b35, agg.B.rallyWonPoints)),
      row("6-8 golpes", fmtRatio(agg.A.rallyWonBuckets.b68, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b68, agg.B.rallyWonPoints)),
      row("9+ golpes", fmtRatio(agg.A.rallyWonBuckets.b9p, agg.A.rallyWonPoints), fmtRatio(agg.B.rallyWonBuckets.b9p, agg.B.rallyWonPoints)),
    ].join("");

    const keyRows = [
      row("Puntos en Deuce/Adv ganados", fmtRatio(agg.A.pressureDeuceWon, agg.A.pressureDeucePlayed), fmtRatio(agg.B.pressureDeuceWon, agg.B.pressureDeucePlayed)),
      row("Puntos 30-30+ ganados", fmtRatio(agg.A.pressure3030Won, agg.A.pressure3030Played), fmtRatio(agg.B.pressure3030Won, agg.B.pressure3030Played)),
    ].join("");

    const advWinRows = [
      row("Ace", String(agg.A.advWinners.ACE||0), String(agg.B.advWinners.ACE||0)),
      row("Winner derecha", String(agg.A.advWinners.FH||0), String(agg.B.advWinners.FH||0)),
      row("Winner revés", String(agg.A.advWinners.BH||0), String(agg.B.advWinners.BH||0)),
      row("Volea derecha", String(agg.A.advWinners.VOL_FH||0), String(agg.B.advWinners.VOL_FH||0)),
      row("Volea revés", String(agg.A.advWinners.VOL_BH||0), String(agg.B.advWinners.VOL_BH||0)),
      row("Passing", String(agg.A.advWinners.PASS||0), String(agg.B.advWinners.PASS||0)),
      row("Dejada", String(agg.A.advWinners.DROP||0), String(agg.B.advWinners.DROP||0)),
    ].join("");

    const advUERows = [
      row("UE Derecha", String(agg.A.advUE.FH), String(agg.B.advUE.FH)),
      row("UE Revés", String(agg.A.advUE.BH), String(agg.B.advUE.BH)),
      row("UE Volea", String(agg.A.advUE.VOL), String(agg.B.advUE.VOL)),
      row("UE Smash", String(agg.A.advUE.SM), String(agg.B.advUE.SM)),
      row("UE Otro", String(agg.A.advUE.OTHER), String(agg.B.advUE.OTHER)),
    ].join("");

    const advFERows = [
      row("FE Derecha", String(agg.A.advFE.FH), String(agg.B.advFE.FH)),
      row("FE Revés", String(agg.A.advFE.BH), String(agg.B.advFE.BH)),
      row("FE Volea", String(agg.A.advFE.VOL), String(agg.B.advFE.VOL)),
      row("FE Smash", String(agg.A.advFE.SM), String(agg.B.advFE.SM)),
      row("FE Otro", String(agg.A.advFE.OTHER), String(agg.B.advFE.OTHER)),
    ].join("");

    return `
      <div class="group">
        <h2>${escapeHtml(title)}</h2>
        ${section("Resumen", sumRows)}
        ${section("Saque", serveRows)}
        ${section("Resto y break points", retRows)}
        ${section("Dirección y profundidad (golpes)", shotRows)}
        ${section("Rally", rallyRows)}
        ${section("Puntos de presión", keyRows)}
        ${section("Desglose winners", advWinRows)}
        ${section("Desglose errores no forzados", advUERows)}
        ${section("Desglose errores forzados", advFERows)}
      </div>
    `;
  };

  const groupsHtml = groups.map((g, idx)=>{
    const title = (subMode==="none") ? "Estadísticas" : g.title;
    const agg = computeStats(g.points);
    const pageBreak = (idx>0) ? "pageBreak" : "";
    return `<div class="printGroup ${pageBreak}">${printTable(title, agg)}</div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Estadísticas · ${escapeHtml(nameA)} vs ${escapeHtml(nameB)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body{ font-family: Arial, sans-serif; margin: 0; color:#0f172a; }
    .wrap{ padding: 14px; }
    h1{ font-size: 18px; margin: 0 0 4px; }
    .meta{ font-size: 11px; color:#475569; margin: 0 0 12px; }
    .meta .line{ margin-top: 2px; }
    h2{ font-size: 14px; margin: 0 0 8px; padding: 6px 10px; background:#0b1220; color:#fff; border-radius: 8px; }
    .section{ margin: 10px 0 12px; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; break-inside: avoid; }
    .sectionTitle{ background:#f1f5f9; font-weight: 800; font-size: 12px; padding: 8px 10px; border-bottom:1px solid #cbd5e1; }
    table.t{ width: 100%; border-collapse: collapse; }
    td{ padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
    tr:last-child td{ border-bottom: none; }
    td.lab{ text-align: center; font-weight: 800; background:#fff7cc; }
    td.num{ width: 28%; font-variant-numeric: tabular-nums; }
    td.num.a{ text-align: left; }
    td.num.b{ text-align: right; }
    .printGroup.pageBreak{ break-before: page; }
    .group{ break-inside: avoid; }
    tr{ break-inside: avoid; }
  .topbar{
      position: sticky; top: 0; z-index: 5;
      display:flex; justify-content:space-between; align-items:center; gap:12px;
      padding: 10px 12px;
      margin: -14px 0 14px;
      border-radius: 14px;
      border: 1px solid rgba(0,0,0,.10);
      background: linear-gradient(180deg, rgba(11,22,49,.98), rgba(7,11,22,.98));
      box-shadow: 0 14px 30px rgba(0,0,0,.25);
    }
    .topbar .btn{
      appearance:none; border: 1px solid rgba(255,255,255,.18);
      background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
      color: #0A1022;
      font-weight: 900;
      padding: 9px 12px;
      border-radius: 999px;
      cursor: pointer;
    }
    .topbar .btn.back{ color: #EAF2FF; }
    .topbar .btn.print{
      color: #0A1022;
      background: linear-gradient(180deg, rgba(255,212,0,.98), rgba(255,168,0,.92));
      border-color: rgba(255,255,255,.22);
      box-shadow: 0 10px 22px rgba(255,212,0,.15);
    }
    @media print{ .topbar{ display:none; } }
  </style>
  </head><body>
    <div class="wrap">
      <div class="topbar">
        <button class="btn back" onclick="try{ if (window.opener){ window.close(); } else { history.back(); } }catch(e){ history.back(); }">← Volver</button>
        <button class="btn print" onclick="window.print()">Imprimir</button>
      </div>
      <h1>Estadísticas del partido: ${escapeHtml(nameA)} vs ${escapeHtml(nameB)}</h1>
      <div class="meta">
        <div class="line">Exportado: ${escapeHtml(stamp)}</div>
        <div class="line">${filterLine}</div>
      </div>
      ${groupsHtml}
      <div class="meta" style="margin-top:14px;">© ${new Date().getFullYear()} Tennis Direction Tracker · Export estadísticas</div>
    </div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w){
    toast("No se pudo abrir la ventana de impresión. Revisa bloqueador de pop-ups.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // asegurar render
  setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){ } }, 350);
}

// Modos eliminados de la UI: dejamos un único modo estable
// - Tema: oscuro
// - Layout: entrenador (coach)
function applyModes(){
  if (!state.ui) state.ui = { theme:"dark", coach:true };
  state.ui.theme = "dark";
  state.ui.coach = true;
  document.body.classList.remove("light");
  document.body.classList.add("coach");
}

let __menuOpen = false;
function setMenuOpen(open){
  __menuOpen = !!open;
  const drawer = $("#drawerMenu");
  const overlay = $("#menuOverlay");
  if (drawer) drawer.classList.toggle("open", __menuOpen);
  if (overlay){
    overlay.classList.toggle("open", __menuOpen);
    overlay.setAttribute("aria-hidden", __menuOpen ? "false" : "true");
  }
}
function toggleMenu(){
  setMenuOpen(!__menuOpen);
}

let __menuModalTimer = null;
function closeAllModals(){
  document.querySelectorAll(".modal:not(.hidden)").forEach(m=>m.classList.add("hidden"));
}
function openFromMenu(fn){
  // close drawer first for iOS Safari reliability
  setMenuOpen(false);
  if (__menuModalTimer) { clearTimeout(__menuModalTimer); __menuModalTimer = null; }
  __menuModalTimer = setTimeout(()=>{
    closeAllModals();
    try{ fn && fn(); }catch(e){ console.error(e); }
  }, 140);
}



function applyScoreVisibility(){
  const s = $("#scoreSection");
  if (s) s.classList.toggle("hidden", !!state.ui.hideScore);

  const eye = $("#btnEyeScore");
  if (eye){
    eye.classList.toggle("isOff", !!state.ui.hideScore);
    eye.setAttribute("aria-pressed", state.ui.hideScore ? "true" : "false");
    eye.setAttribute("aria-label", state.ui.hideScore ? "Mostrar marcador" : "Ocultar marcador");
    eye.title = state.ui.hideScore ? "Mostrar marcador" : "Ocultar marcador";
  }
}
function toggleScoreVisibility(){
  state.ui.hideScore = !state.ui.hideScore;
  applyScoreVisibility();
  persist();
}

function applyRailVisibility(){
  document.body.classList.toggle("railHidden", !!state.ui.hideRail);
  const b = $("#btnToolsRail");
  if (b){
    const isHidden = !!state.ui.hideRail;
    b.setAttribute("aria-pressed", isHidden ? "true" : "false");
    b.setAttribute("aria-label", isHidden ? "Mostrar herramientas" : "Ocultar herramientas");
    b.title = isHidden ? "Mostrar herramientas" : "Ocultar herramientas";
  }
}
function toggleRailVisibility(){
  state.ui.hideRail = !state.ui.hideRail;
  applyRailVisibility();
  persist();
}

function applyRotation(){
  const c = $("#court");
  if (c) c.classList.toggle("rotated", !!state.ui.rotated);
  const b = $("#btnRotateCourt");
  if (b){
    const label = state.ui.rotated ? "Restaurar pista" : "Rotar pista";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.classList.toggle("isActive", !!state.ui.rotated);
  }
  const lbl = $("#lblRotateCourt");
  if (lbl) lbl.textContent = state.ui.rotated ? "Restaurar" : "Rotar";
  // ensure arrows reflect the current orientation
  renderLiveArrows(false);
}
function toggleRotation(){
  state.ui.rotated = !state.ui.rotated;
  applyRotation();
  persist();
}

function renderCourtNames(){
  const t = $("#baselineTop");
  const b = $("#baselineBottom");
  if (t) t.textContent = (state.names && state.names.B) ? state.names.B : "Jugador B";
  if (b) b.textContent = (state.names && state.names.A) ? state.names.A : "Jugador A";
}

/** WIRING **/

function syncTopbarHeight(){
  // iOS Safari: ajusta el marcador flotante justo debajo del header
  const tb = document.querySelector('header.topbarInline');
  if (!tb) return;
  const h = Math.ceil(tb.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--topbarH', h + 'px');
}

window.addEventListener('resize', ()=>{
  syncTopbarHeight();
});
window.addEventListener('orientationchange', ()=>{
  setTimeout(syncTopbarHeight, 80);
});

function renderAll(){
  syncTopbarHeight();
  applyScoreVisibility();
  applyRailVisibility();
  applyRotation();
  renderCourtNames();
  renderScore();
  renderPoint();
}

function wire(){
  const on = (id, ev, fn, opts) => {
    const el = $("#"+id);
    if (el) el.addEventListener(ev, fn, opts);
    return el;
  };

  // names
  on("nameA","change", ()=>{ state.names.A=$("#nameA").value||"Jugador A"; persist(); renderAll(); });
  on("nameB","change", ()=>{ state.names.B=$("#nameB").value||"Jugador B"; persist(); renderAll(); });

  // controls
  on("btnNew","click", newMatch);
  on("btnFinish","click", finishMatch);
  on("btnResume","click", resumeMatch);

// menú (hamburguesa)
on("btnMenu","click", toggleMenu);
on("btnCloseMenu","click", ()=>setMenuOpen(false));
const ov = $("#menuOverlay");
if (ov) ov.addEventListener("click", ()=>setMenuOpen(false));


  on("btnHistory","click", openHistory);
  on("btnAnalytics","click", openAnalytics);
  on("btnStats","click", openStats);
  on("btnCharts","click", openCharts);
  on("btnExport","click", openExport);

  on("btnSaveMatch","click", ()=>openFromMenu(()=>openSaveLoad("save")));
  on("btnLoadMatch","click", ()=>openFromMenu(()=>openSaveLoad("load")));
  on("btnGameMode","click", ()=>openFromMenu(openGameMode));
  on("btnCloseSaveLoad","click", closeSaveLoad);
  on("btnCloseGameMode","click", closeGameMode);
  on("btnApplyGameMode","click", applyGameMode);
  on("tabSaveMatch","click", ()=>openSaveLoad("save"));
  on("tabLoadMatch","click", ()=>openSaveLoad("load"));
  on("btnDoSaveMatch","click", saveCurrentMatch);

  on("btnEyeScore","click", toggleScoreVisibility);
  on("btnToolsRail","click", toggleRailVisibility);
  on("btnRotateCourt","click", toggleRotation);

  on("btnCloseHistory","click", closeHistory);
  on("btnClosePointViewer","click", closePointViewer);
  on("btnCloseAnalytics","click", closeAnalytics);
  on("btnCloseStats","click", closeStats);
  on("btnCloseCharts","click", closeCharts);
  on("btnCloseExport","click", closeExport);

  // (Eliminado) Tema y modo normal

// cerrar menú al elegir una opción (las acciones que viven dentro del menú)
["btnSaveMatch","btnLoadMatch","btnHistory","btnAnalytics","btnStats","btnCharts","btnExport"].forEach(id=>{
  const el = $("#"+id);
  if (el) el.addEventListener("click", ()=>setMenuOpen(false));
});


  // cambiar servidor manualmente (solo antes de iniciar el punto)
  const setServer = (p)=>{
    if (state.point && state.point.events && state.point.events.length>0){
      toast("No puedes cambiar el servidor durante el punto");
      return;
    }
    state.currentServer = p;
    if (state.point && state.point.phase==="serve"){
      state.point.server = state.currentServer;
      state.point.side = serveSideLabel();
    }
    updateZoneHint();
    renderAll();
    persist();
  };

  const rowA = $("#tvRowA"), rowB = $("#tvRowB");
  const sA = $("#serveA"), sB = $("#serveB");
  if (rowA) { rowA.style.cursor="pointer"; rowA.title="Toca para poner servidor A"; rowA.addEventListener("click", ()=>setServer("A")); }
  if (rowB) { rowB.style.cursor="pointer"; rowB.title="Toca para poner servidor B"; rowB.addEventListener("click", ()=>setServer("B")); }
  if (sA) { sA.style.pointerEvents="none"; }
  if (sB) { sB.style.pointerEvents="none"; }


  // finish ball menu
  on("finishBall","click", toggleFinishMenu);
  on("finishMenuClose","click", ()=>{ closeFinishMenu(); closeAdvStep2(); });
  // cerrar al tocar fuera (backdrop)
  const fm = $("#finishMenu");
  if (fm) fm.addEventListener("click", (e)=>{ if (e.target === fm) closeFinishMenu(); });
  on("tabNormal","click", ()=> setFinishMode("normal"));
  on("tabAdvanced","click", ()=> setFinishMode("advanced"));
  on("advBack","click", closeAdvStep2);
  // set initial mode
  setFinishMode(finishMode);


  const bindMenu = (id, cb) => {
    const el = $("#"+id);
    if (!el) return;
    el.addEventListener("click", ()=>{
      const res = cb();
      if (res !== false) closeFinishMenu();
    });
  };

  // Serve actions inside menu
  bindMenu("mFault", ()=> fault());
  bindMenu("mDoubleFault", ()=> doubleFault());

  // End point actions inside menu
  bindMenu("mUeA", ()=> finishAction("UE","A"));
  bindMenu("mUeB", ()=> finishAction("UE","B"));
  bindMenu("mFeA", ()=> finishAction("FE","A"));
  bindMenu("mFeB", ()=> finishAction("FE","B"));
  bindMenu("mWinA", ()=> finishAction("WINNER","A"));
  bindMenu("mWinB", ()=> finishAction("WINNER","B"));
  bindMenu("mVolA", ()=> finishVolley("A"));
  bindMenu("mVolB", ()=> finishVolley("B"));

  // quick actions
  on("btnUndo","click", undo);
  on("btnResetPoint","click", resetPoint);
  on("btnRedoPoint","click", redoLastPoint);
  on("btnReplay","click", replayCurrentPoint);

  // history filters
  ["fServer","fSide","fWinner","fEnd","fSearch","fScoreSearch"].forEach(id=>{
    on(id,"input", renderHistory);
    on(id,"change", renderHistory);
  });

  // analytics filters
  ["aView","aMin","aIncludeServe","aMoment"].forEach(id=>{
    on(id,"input", renderAnalytics);
    on(id,"change", renderAnalytics);
  });

  // stats filters
  ["sRange","sSet","sServer","sContext","sMode","sSub"].forEach(id=>{
    on(id,"input", renderStats);
    on(id,"change", renderStats);
  });

  // charts filters
  ["chartsPlayer"].forEach(id=>{
    on(id,"input", ()=>{ state.ui = state.ui || {}; state.ui.chartPlayer = $("#chartsPlayer").value || "A"; renderCharts(); });
    on(id,"change", ()=>{ state.ui = state.ui || {}; state.ui.chartPlayer = $("#chartsPlayer").value || "A"; renderCharts(); });
  });

  // export
  on("btnCSV","click", exportCSV);
  on("btnWord","click", exportWord);
  on("btnPDF","click", exportPDF);
  on("btnStatsPDF","click", exportStatsPDF);
  on("btnPDFStats","click", exportStatsPDF);

  // close modals clicking outside
  ["historyModal","pointViewerModal","analyticsModal","statsModal","exportModal"].forEach(mid=>{
    const m = $("#"+mid);
    if (!m) return;
    m.addEventListener("click", (e)=>{
      if (e.target === m){
        try{ closeModal(mid); }catch(_){}
      }
    });
  });

  // keyboard shortcuts
  window.addEventListener("keydown", (e)=>{
    if (e.key==="Escape"){
      ["historyModal","pointViewerModal","analyticsModal","statsModal","exportModal","finishMenu"].forEach(id=>{
        const el=$("#"+id);
        if (el && !el.classList.contains("hidden")) el.classList.add("hidden");
      });
      setMenuOpen(false);
      clearReplay();
      setSheetOpen(false);
    }
  });

  initBottomSheet();
}



let __sheetOpen = false;
function setSheetOpen(open){
  __sheetOpen = !!open;
  const sheet = $("#bottomSheet");
  if (!sheet) return;
  sheet.classList.toggle("open", __sheetOpen);
}
function toggleSheet(){
  setSheetOpen(!__sheetOpen);
}

function initBottomSheet(){
  const sheet = $("#bottomSheet");
  const handle = $("#sheetHandle");
  const close = $("#sheetClose");
  if (!sheet || !handle) return;

  // default closed
  setSheetOpen(false);

  if (close){
    close.addEventListener("click", (e)=>{
      e.stopPropagation();
      setSheetOpen(false);
    });
  }

  // tap handle toggles
  handle.addEventListener("click", (e)=>{
    if (close && e.target === close) return;
    toggleSheet();
  });

  // wheel up/down on handle
  handle.addEventListener("wheel", (e)=>{
    if (e.deltaY < 0) setSheetOpen(true);
    if (e.deltaY > 0) setSheetOpen(false);
  }, {passive:true});

  // touch swipe on handle
  let startY = null;
  handle.addEventListener("touchstart", (e)=>{
    if (!e.touches || !e.touches.length) return;
    startY = e.touches[0].clientY;
  }, {passive:true});

  handle.addEventListener("touchmove", (e)=>{
    if (startY === null || !e.touches || !e.touches.length) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < -20) setSheetOpen(true);
    if (dy > 20) setSheetOpen(false);
  }, {passive:true});

  handle.addEventListener("touchend", ()=>{ startY = null; }, {passive:true});
}


function initSplash(){
  const splash = document.getElementById("splash");
  const btn = document.getElementById("btnStartApp");
  if (!splash || !btn) return;

  document.body.classList.add("splashLock");
  requestAnimationFrame(()=> splash.classList.add("is-play"));

  let shown = false;
  const showBtn = ()=>{
    if (shown) return;
    shown = true;
    splash.classList.add("showStart");
    btn.classList.remove("hidden");
  };

  const t = setTimeout(showBtn, 2150);

  splash.addEventListener("click", (e)=>{
    if (e.target === btn) return;
    clearTimeout(t);
    showBtn();
  });

  btn.addEventListener("click", ()=>{
    splash.classList.add("is-out");
    document.body.classList.remove("splashLock");
    setTimeout(()=>{ splash.style.display="none"; window.dispatchEvent(new Event("resize")); }, 420);
  }, { once:true });
}

function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js?v=2539").catch(console.error);
}

function init(){
  load();
  applyModes();
  buildZones();
  initPoint();
  wire();
  renderAll();
  initSplash();
  registerSW();
}

window.addEventListener("load", init);