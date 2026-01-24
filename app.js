// Tennis Direction Tracker (Web v2)
const $ = (sel) => document.querySelector(sel);

const STORAGE_KEY = "tennis_tracker_web_v2_state";

const state = {
  names: { A: "Jugador A", B: "Jugador B" },

  sets: { A: 0, B: 0 },
  games: { A: 0, B: 0 },
  points: { A: 0, B: 0 }, // internal counts
  isTiebreak: false,
  tb: { A: 0, B: 0 },
  tbStartingServer: "A",
  currentServer: "A",

  matchFinished: false,

  // For "rehacer último punto" (rollback one completed point)
  undoStack: [],

  matchPoints: [], // {n, snapshot, server, winner, reason, sequence[]}

  point: null,

  userPinnedToBottom: true,
};

function other(p){ return p === "A" ? "B" : "A"; }
function pointsLabel(p){ return ["0","15","30","40"][Math.min(p,3)] ?? "40"; }

function scoreStatus(){
  if (state.isTiebreak) return `TB ${state.tb.A}-${state.tb.B}`;
  const a = state.points.A, b = state.points.B;
  if (a >= 3 && b >= 3){
    if (a === b) return "DEUCE";
    if (a === b + 1) return "AD A";
    if (b === a + 1) return "AD B";
  }
  return "";
}

function displayPoints(side){
  if (state.isTiebreak) return String(state.tb[side]);
  const a = state.points.A, b = state.points.B;
  if (a >= 3 && b >= 3){
    if (a === b) return "40";
    if (side === "A" && a === b + 1) return "AD";
    if (side === "B" && b === a + 1) return "AD";
    return "40";
  }
  return pointsLabel(state.points[side]);
}

function serveSideLabel(){
  const total = state.isTiebreak ? (state.tb.A + state.tb.B) : (state.points.A + state.points.B);
  return (total % 2 === 0) ? "SD" : "SV";
}

function tiebreakServerForPointIndex(pointIndex){
  const s = state.tbStartingServer;
  if (pointIndex === 0) return s;
  const k = Math.floor((pointIndex - 1) / 2);
  return (k % 2 === 0) ? other(s) : s;
}

function getScoreSnapshot(){
  const s = `S ${state.sets.A}-${state.sets.B}`;
  const g = `G ${state.games.A}-${state.games.B}`;
  const p = state.isTiebreak ? `TB ${state.tb.A}-${state.tb.B}` : `P ${displayPoints("A")}-${displayPoints("B")}`;
  const srv = `Srv ${state.point ? state.point.server : state.currentServer} ${serveSideLabel()}`;
  return `${s} · ${g} · ${p} · ${srv}`;
}

function persist(){
  const data = {
    names: state.names,
    sets: state.sets, games: state.games, points: state.points,
    isTiebreak: state.isTiebreak, tb: state.tb, tbStartingServer: state.tbStartingServer,
    currentServer: state.currentServer,
    matchFinished: state.matchFinished,
    matchPoints: state.matchPoints,
    // current point (optional)
    point: state.point,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function restore(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try{
    const data = JSON.parse(raw);
    Object.assign(state.names, data.names || {});
    Object.assign(state.sets, data.sets || {});
    Object.assign(state.games, data.games || {});
    Object.assign(state.points, data.points || {});
    state.isTiebreak = !!data.isTiebreak;
    Object.assign(state.tb, data.tb || {});
    state.tbStartingServer = data.tbStartingServer || "A";
    state.currentServer = data.currentServer || "A";
    state.matchFinished = !!data.matchFinished;
    state.matchPoints = Array.isArray(data.matchPoints) ? data.matchPoints : [];
    state.point = data.point || null;
  }catch(e){}
}


function redoPreviousPoint(){
  if (state.matchPoints.length === 0) return;

  // Remove last saved point
  state.matchPoints.pop();

  // Restore match state
  if (Array.isArray(state.undoStack) && state.undoStack.length > 0){
    const snap = state.undoStack.pop();
    restoreMatchState(snap);
  } else {
    rebuildMatchFromPoints();
  }

  // Allow continuing
  state.matchFinished = false;

  // Start the point again (empty)
  initPoint();
  persist();
  renderAll();
}

function newMatch(){
  state.sets = {A:0,B:0};
  state.games = {A:0,B:0};
  state.points = {A:0,B:0};
  state.isTiebreak = false;
  state.tb = {A:0,B:0};
  state.tbStartingServer = "A";
  state.currentServer = "A";
  state.matchFinished = false;
  state.matchPoints = [];
  initPoint();
  persist();
  closeHistory();
}

function initPoint(){
  const server = state.isTiebreak
    ? tiebreakServerForPointIndex(state.tb.A + state.tb.B)
    : state.currentServer;

  state.point = {
    server,
    nextHitter: server,
    phase: "serve",            // "serve" | "rally"
    serveAttempt: 1,           // 1 or 2
    eventsRaw: [],             // {type, ...}
    sequence: [],
    lastBounce: { A: null, B: null }, // last landing spot on each side: {row, col}
  };

  rebuildPointFromRaw();
  renderAll();
  persist();
}

function makeRallyZoneCells(gridEl, side){
  gridEl.innerHTML = "";
  for (let row = 0; row < 3; row++){
    for (let col = 0; col < 3; col++){
      const btn = document.createElement("button");
      btn.className = "zoneCell";
      btn.type = "button";

      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = (side === "B" ? ["C","M","P"][row] : ["P","M","C"][row]); // depth tag (baseline = P on both ends)
      btn.appendChild(tag);

      btn.addEventListener("click", (e) => { flashTap(btn, e); onRallyTap(side, row, col); });
      gridEl.appendChild(btn);
    }
  }
}

function makeServeCells(serveEl, side){
  // Creates 6 buttons: left service box (A,C,T) + right service box (T,C,A)
  serveEl.innerHTML = "";

  const createBtn = (boxIndex, target) => {
    const btn = document.createElement("button");
    btn.className = "serveCell";
    btn.type = "button";

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = "SAQUE";
    btn.appendChild(tag);

    const t = document.createElement("div");
    t.className = "target";
    t.textContent = target; // A / C / T
    btn.appendChild(t);

    btn.dataset.box = String(boxIndex);
    btn.dataset.target = target;

    btn.addEventListener("click", (e) => { flashTap(btn, e); onServeTap(side, boxIndex, target); });
    return btn;
  };

  // Box 0 (izquierda): A C T (de fuera a dentro)
  ["A","C","T"].forEach(t => serveEl.appendChild(createBtn(0, t)));
  // Box 1 (derecha): T C A (de dentro a fuera)
  ["T","C","A"].forEach(t => serveEl.appendChild(createBtn(1, t)));
}


function depthLetter(row){ return ["P","M","C"][row]; }

function directionLetter(originCol, targetCol){
  if (targetCol === 1) return "M";
  if (originCol === 1) return "M";
  return (originCol === targetCol) ? "P" : "C";
}

function expectedReceiverSide(){
  if (!state.point) return "B";
  if (state.point.phase === "serve") return other(state.point.server); // serve lands on receiver side
  return other(state.point.nextHitter); // rally: lands on opponent side
}

function diagonalServeBoxIndex(receiverSide, sdOrSv){
  // Returns 0 (left) or 1 (right) of the receiver's service boxes (viewer perspective).
  // Based on tennis diagonal service box logic.
  // Receiver on bottom (B): SD -> right, SV -> left
  // Receiver on top (A): SD -> left,  SV -> right
  if (receiverSide === "B"){
    return (sdOrSv === "SD") ? 1 : 0;
  } else {
    return (sdOrSv === "SD") ? 0 : 1;
  }
}

function onServeTap(side, boxIndex, target){
  if (state.matchFinished) return;
  if (!state.point) initPoint();
  if (state.point.phase !== "serve") return;

  const receiverSide = other(state.point.server);
  if (side !== receiverSide) return;

  const sdOrSv = serveSideLabel();
  const allowed = diagonalServeBoxIndex(receiverSide, sdOrSv);
  if (boxIndex !== allowed) return;

  state.point.eventsRaw.push({ type:"serveIn", receiverSide, boxIndex, target, sdOrSv, attempt: state.point.serveAttempt });
  rebuildPointFromRaw();
}

function onRallyTap(receiverSide, row, col){
  if (state.matchFinished) return;
  if (!state.point) initPoint();
  if (state.point.phase !== "rally") return;

  const exp = expectedReceiverSide();
  if (receiverSide !== exp) return;

  const normRow = (receiverSide === "B") ? (2 - row) : row; // flip bottom side so baseline=Profundo
  state.point.eventsRaw.push({ type:"rally", receiverSide, row: normRow, col });
  rebuildPointFromRaw();
}

function addFault(){
  if (state.matchFinished) return;
  if (!state.point) initPoint();
  if (state.point.phase !== "serve") return;
  if (state.point.serveAttempt !== 1) return; // only first serve fault button
  state.point.eventsRaw.push({ type:"fault", sdOrSv: serveSideLabel() });
  rebuildPointFromRaw();
}

function addDoubleFault(){
  if (state.matchFinished) return;
  if (!state.point) initPoint();
  if (state.point.phase !== "serve") return;

  const loser = state.point.server;
  const winner = other(loser);

  if (!Array.isArray(state.undoStack)) state.undoStack = [];
  state.undoStack.push(snapshotMatchState());

  // Save sequence with DF
  const seq = state.point.sequence.slice();
  seq.push(`${loser} - S ${serveSideLabel()} DF`);

  savePoint(winner, `Doble falta (${loser})`, seq);
  updateScoring(winner);
  initPoint();
}

function computeServeLine(server, sdOrSv, attempt, target){
  return `${server} - S${attempt === 2 ? "2" : ""} ${sdOrSv} ${target}`;
}

function computeFaultLine(server, sdOrSv){
  return `${server} - S ${sdOrSv} F`;
}

function computeRallyLine(hitter, code, isReturn){
  return isReturn ? `${hitter} - R ${code}` : `${hitter} - ${code}`;
}

function rebuildPointFromRaw(){
  const raw = state.point.eventsRaw.slice();

  const server = state.point.server;
  state.point.nextHitter = server;
  state.point.phase = "serve";
  state.point.serveAttempt = 1;
  state.point.sequence = [];
  state.point.lastBounce = { A: null, B: null };

  let strokeCount = 0; // counts successful strokes: serveIn + rally taps

  raw.forEach((ev) => {
    if (ev.type === "fault"){
      state.point.sequence.push(computeFaultLine(server, ev.sdOrSv));
      state.point.serveAttempt = 2;
      state.point.phase = "serve";
      return;
    }

    if (ev.type === "serveIn"){
      const line = computeServeLine(server, ev.sdOrSv, ev.attempt, ev.target);
      state.point.sequence.push(line);
      strokeCount += 1;

      // Serve lands short in the correct service box: map to a "short" row and left/right col
      const receiver = ev.receiverSide;
      let col;
      // Map serve target to a coarse 3-column model for return direction calculations.
      // A (abierto) -> outer sideline column, C/T -> center column.
      if (ev.target === "A") col = (ev.boxIndex === 0 ? 0 : 2);
      else col = 1;
      state.point.lastBounce[receiver] = { row: 2, col };

      // next hitter is receiver
      state.point.nextHitter = receiver;
      state.point.phase = "rally";
      return;
    }

    if (ev.type === "rally"){
      const hitter = state.point.nextHitter;
      const origin = state.point.lastBounce[hitter];
      const originCol = origin ? origin.col : 1;
      const dir = directionLetter(originCol, ev.col);
      const dep = depthLetter(ev.row);
      const code = `${dir}${dep}`;

      const isReturn = (strokeCount === 1); // after serveIn
      state.point.sequence.push(computeRallyLine(hitter, code, isReturn));

      state.point.lastBounce[ev.receiverSide] = { row: ev.row, col: ev.col };
      state.point.nextHitter = other(hitter);
      strokeCount += 1;
      return;
    }
  });

  renderAll();
  persist();
}

function renderZones(){
  const expSide = expectedReceiverSide();

  // Serve grids visibility
  const isServe = state.point && state.point.phase === "serve";
  $("#serveTop").classList.toggle("hidden", !isServe);
  $("#serveBottom").classList.toggle("hidden", !isServe);

  // Rally grids visibility
  $("#gridA").classList.toggle("hidden", isServe);
  $("#gridB").classList.toggle("hidden", isServe);

  // Activate/deactivate serve cells
  if (isServe){
    const receiverSide = other(state.point.server);
    const sdOrSv = serveSideLabel();
    const allowed = diagonalServeBoxIndex(receiverSide, sdOrSv);

    const serveTop = $("#serveTop");
    const serveBottom = $("#serveBottom");

    serveTop.classList.toggle("active", receiverSide === "A");
    serveBottom.classList.toggle("active", receiverSide === "B");
    serveTop.classList.toggle("inactive", receiverSide !== "A");
    serveBottom.classList.toggle("inactive", receiverSide !== "B");

    // disable all then enable only the diagonal correct one
    const topCells = [...serveTop.querySelectorAll(".serveCell")];
    const botCells = [...serveBottom.querySelectorAll(".serveCell")];

    topCells.forEach((btn) => {
      const box = Number(btn.dataset.box);
      btn.disabled = !(receiverSide === "A" && box === allowed) || state.matchFinished;
    });
    botCells.forEach((btn) => {
      const box = Number(btn.dataset.box);
      btn.disabled = !(receiverSide === "B" && box === allowed) || state.matchFinished;
    });// Update hint
    $("#tapHint").textContent = `Toca SAQUE (T/C/A) en lado ${receiverSide}`;
  } else {
    // Rally active side
    const gridA = $("#gridA");
    const gridB = $("#gridB");
    gridA.classList.toggle("active", expSide === "A");
    gridB.classList.toggle("active", expSide === "B");
    gridA.classList.toggle("inactive", expSide !== "A");
    gridB.classList.toggle("inactive", expSide !== "B");
    [...gridA.querySelectorAll(".zoneCell")].forEach(btn => btn.disabled = (expSide !== "A") || state.matchFinished);
    [...gridB.querySelectorAll(".zoneCell")].forEach(btn => btn.disabled = (expSide !== "B") || state.matchFinished);
    $("#tapHint").textContent = `Toca en lado ${expSide}`;
  }
}

function renderScore(){
  $("#setsA").textContent = String(state.sets.A);
  $("#setsB").textContent = String(state.sets.B);
  $("#gamesA").textContent = String(state.games.A);
  $("#gamesB").textContent = String(state.games.B);
  $("#pointsA").textContent = displayPoints("A");
  $("#pointsB").textContent = displayPoints("B");

  const status = scoreStatus();
  $("#centerStatus").textContent = status || (serveSideLabel() === "SD" ? "DEUCE" : "ADV");

  const serverLabel = state.point ? state.point.server : state.currentServer;
  $("#btnServer").textContent = `Servidor: ${serverLabel}`;
  $("#serveSide").textContent = serveSideLabel();

  const phase = state.point ? state.point.phase : "serve";
  $("#phaseHint").textContent = (phase === "serve") ? "SAQUE" : "RALLY";

  // Buttons visibility
  const isServe = state.point && state.point.phase === "serve";
  $("#serveButtons").classList.toggle("hidden", !isServe);
  $("#rallyButtons").classList.toggle("hidden", isServe);

  // Serve buttons enable
  $("#btnFault").disabled = state.matchFinished || !(state.point && state.point.phase === "serve" && state.point.serveAttempt === 1);
  $("#btnDoubleFault").disabled = state.matchFinished || !(state.point && state.point.phase === "serve");

  // Match banner
  $("#matchEndedBanner").classList.toggle("hidden", !state.matchFinished);

  // Finish/Resume buttons
  const bf = $("#btnFinishMatch");
  const br = $("#btnResumeMatch");
  if (bf && br){
    bf.classList.toggle("hidden", state.matchFinished);
    br.classList.toggle("hidden", !state.matchFinished);
  }

  // Redo last point
  const redo = $("#btnRedoPoint");
  if (redo) redo.disabled = (state.matchPoints.length === 0);
}

function renderSequence(){
  const list = $("#shotsList");
  list.innerHTML = "";
  const seq = state.point ? state.point.sequence : [];

  seq.forEach((t, i) => {
    const li = document.createElement("li");
    li.textContent = `${i+1}. ${t}`;
    if (i === seq.length - 1) li.classList.add("latest");
    list.appendChild(li);
  });

  $("#shotsSub").textContent = `${seq.length} eventos`;

  const sc = $("#shotsScroll");
  if (state.userPinnedToBottom) sc.scrollTop = sc.scrollHeight;
  $("#btnToBottom").classList.toggle("hidden", state.userPinnedToBottom);
}

function renderAll(){
  renderScore();
  renderZones();
  renderSequence();
}

function setPinnedToBottomFromScroll(){
  const sc = $("#shotsScroll");
  const nearBottom = (sc.scrollHeight - sc.scrollTop - sc.clientHeight) < 30;
  state.userPinnedToBottom = nearBottom;
  $("#btnToBottom").classList.toggle("hidden", nearBottom);
}

function undo(){
  if (state.matchFinished) return;
  if (!state.point || state.point.eventsRaw.length === 0) return;
  state.point.eventsRaw.pop();
  rebuildPointFromRaw();
}

function resetPoint(){
  if (state.matchFinished) return;
  initPoint();
}

function startTiebreakIfNeeded(){
  if (state.games.A === 6 && state.games.B === 6){
    state.isTiebreak = true;
    state.tb.A = 0; state.tb.B = 0;
    state.tbStartingServer = state.currentServer; // would serve next game at 6-6
  }
}

function winSet(winner){
  state.sets[winner] += 1;
  state.games.A = 0; state.games.B = 0;
  state.points.A = 0; state.points.B = 0;
  state.isTiebreak = false;
  state.tb.A = 0; state.tb.B = 0;
}

function maybeWinSetAfterGame(){
  const a = state.games.A, b = state.games.B;
  if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2){
    winSet(a > b ? "A" : "B");
  } else {
    startTiebreakIfNeeded();
  }
}

function updateScoring(winner){
  if (state.isTiebreak){
    state.tb[winner] += 1;
    const a = state.tb.A, b = state.tb.B;
    const done = (a >= 7 || b >= 7) && Math.abs(a - b) >= 2;
    if (done){
      winSet(a > b ? "A" : "B");
      state.currentServer = other(state.tbStartingServer); // receiver-first in next set
    }
  } else {
    state.points[winner] += 1;
    const a = state.points.A, b = state.points.B;
    const gameDone = (a >= 4 || b >= 4) && Math.abs(a - b) >= 2;
    if (gameDone){
      const gameWinner = a > b ? "A" : "B";
      state.games[gameWinner] += 1;
      state.points.A = 0; state.points.B = 0;
      state.currentServer = other(state.currentServer);
      maybeWinSetAfterGame();
    }
  }
  persist();
}


function snapshotMatchState(){
  return {
    sets: { ...state.sets },
    games: { ...state.games },
    points: { ...state.points },
    isTiebreak: state.isTiebreak,
    tb: { ...state.tb },
    tbStartingServer: state.tbStartingServer,
    currentServer: state.currentServer,
  };
}
function restoreMatchState(snap){
  if (!snap) return;
  state.sets = { ...snap.sets };
  state.games = { ...snap.games };
  state.points = { ...snap.points };
  state.isTiebreak = !!snap.isTiebreak;
  state.tb = { ...snap.tb };
  state.tbStartingServer = snap.tbStartingServer || "A";
  state.currentServer = snap.currentServer || "A";
}
function rebuildMatchFromPoints(){
  // Fallback if undoStack isn't available (best-effort replay)
  state.sets = { A: 0, B: 0 };
  state.games = { A: 0, B: 0 };
  state.points = { A: 0, B: 0 };
  state.isTiebreak = false;
  state.tb = { A: 0, B: 0 };
  state.tbStartingServer = "A";
  state.currentServer = "A";
  state.matchPoints.forEach(p => updateScoring(p.winner));
}

function savePoint(winner, reason, sequenceOverride){
  const n = state.matchPoints.length + 1;
  const snapshot = getScoreSnapshot();
  const server = state.point ? state.point.server : state.currentServer;
  const seq = sequenceOverride || (state.point ? state.point.sequence.slice() : []);
  state.matchPoints.push({ n, snapshot, server, winner, reason, sequence: seq });
  persist();
}

function endPoint(winner, reason){
  if (state.matchFinished) return;
  if (!Array.isArray(state.undoStack)) state.undoStack = [];
  state.undoStack.push(snapshotMatchState());

  const seq = state.point ? state.point.sequence.slice() : [];
  savePoint(winner, reason, seq);
  updateScoring(winner);
  initPoint();
}

function toggleServer(){
  if (state.matchFinished) return;
  state.currentServer = other(state.currentServer);
  initPoint();
}

function resumeMatch(){
  state.matchFinished = false;
  persist();
  renderAll();
}

function finishMatch(){
  state.matchFinished = true;
  persist();
  renderAll();
  openHistory();
}

function outcomeButtons(){
  // UNF/FOR => player loses point; WIN => player wins point.
  $("#btnUNF_A").addEventListener("click", () => endPoint("B", "Error no forzado (A)"));
  $("#btnFOR_A").addEventListener("click", () => endPoint("B", "Error forzado (A)"));
  $("#btnWIN_A").addEventListener("click", () => endPoint("A", "Winner (A)"));

  $("#btnUNF_B").addEventListener("click", () => endPoint("A", "Error no forzado (B)"));
  $("#btnFOR_B").addEventListener("click", () => endPoint("A", "Error forzado (B)"));
  $("#btnWIN_B").addEventListener("click", () => endPoint("B", "Winner (B)"));

  $("#btnPointA").addEventListener("click", () => endPoint("A", "Fin punto manual (A)"));
  $("#btnPointB").addEventListener("click", () => endPoint("B", "Fin punto manual (B)"));
}

function openHistory(){
  renderHistory();
  $("#historyModal").classList.remove("hidden");
}
function closeHistory(){
  $("#historyModal").classList.add("hidden");
}

function renderHistory(){
  $("#historySub").textContent = `${state.matchPoints.length} puntos`;
  const list = $("#historyList");
  list.innerHTML = "";

  if (state.matchPoints.length === 0){
    list.innerHTML = `<div class="historyItem"><div class="historyItemTop"><div class="historyItemNum">Sin puntos</div></div><div class="historyItemMeta">Juega algunos puntos y aparecerán aquí.</div></div>`;
    $("#historyDetail").textContent = "Selecciona un punto.";
    return;
  }

  state.matchPoints.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "historyItem";
    div.dataset.idx = String(idx);

    const badgeClass = p.winner === "A" ? "badgeA" : "badgeB";
    div.innerHTML = `
      <div class="historyItemTop">
        <div class="historyItemNum">Punto ${p.n}</div>
        <span class="badge ${badgeClass}">Gana ${p.winner}</span>
      </div>
      <div class="historyItemMeta">${p.snapshot}<br>${p.reason}</div>
    `;
    div.addEventListener("click", () => selectHistory(idx));
    list.appendChild(div);
  });

  selectHistory(state.matchPoints.length - 1);
}

function selectHistory(idx){
  const items = [...document.querySelectorAll(".historyItem")];
  items.forEach(el => el.classList.remove("active"));
  const target = items.find(el => Number(el.dataset.idx) === idx);
  if (target) target.classList.add("active");

  const p = state.matchPoints[idx];
  const detail = $("#historyDetail");
  detail.innerHTML = `
    <h3>Punto ${p.n} · Gana ${p.winner}</h3>
    <div class="meta">${p.snapshot}<br>${p.reason}</div>
    <ol>${p.sequence.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
  `;
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/\'/g,"&#039;");
}


let __lastTapHoldEl = null;
let __lastTapHoldTimer = null;

function flashTap(el, evt){
  try{
    if (!el) return;
    // set CSS vars for ripple center
    if (evt && typeof evt.clientX === "number"){
      const r = el.getBoundingClientRect();
      const x = ((evt.clientX - r.left) / Math.max(1, r.width)) * 100;
      const y = ((evt.clientY - r.top) / Math.max(1, r.height)) * 100;
      el.style.setProperty("--tap-x", `${x}%`);
      el.style.setProperty("--tap-y", `${y}%`);
    } else {
      el.style.setProperty("--tap-x", "50%");
      el.style.setProperty("--tap-y", "50%");
    }

    // restart animation reliably
    el.classList.remove("tapFlash");
    // force reflow
    void el.offsetWidth;
    el.classList.add("tapFlash");
    window.setTimeout(() => el.classList.remove("tapFlash"), 640);

    // Keep last touched cell highlighted for ~1s (more visual)
    try{
      if (__lastTapHoldEl && __lastTapHoldEl !== el){
        __lastTapHoldEl.classList.remove("tapHold");
      }
      __lastTapHoldEl = el;
      el.classList.add("tapHold");
      if (__lastTapHoldTimer) window.clearTimeout(__lastTapHoldTimer);
      __lastTapHoldTimer = window.setTimeout(() => {
        if (__lastTapHoldEl){ __lastTapHoldEl.classList.remove("tapHold"); }
      }, 1000);
    }catch(_){ }

  }catch(e){
    console.error(e);
  }
}



function normalizeLine(line){
  // Stored line examples:
  // "A - S SD T", "A - S2 SD C", "B - R CP", "A - CP"
  // Convert to compact "A-<CODE>"
  const s = String(line).trim();

  // Remove spaces around hyphens "A - " -> "A-"
  const m = s.match(/^([AB])\s*-\s*(.*)$/);
  if (!m) return s;
  const player = m[1];
  const rest = m[2].trim();
  return `${player}-${rest.replace(/\s+/g, " ")}`;
}

function patternKeyFromPoint(point, includeServe=true){
  // point.sequence is array of strings already in "A - ..." format
  const seq = Array.isArray(point.sequence) ? point.sequence : [];
  const filtered = seq.filter((line) => {
    if (includeServe) return true;
    // exclude lines that start with "A - S" or "B - S"
    return !/^[AB]\s*-\s*S/.test(String(line).trim());
  });
  return filtered.map(normalizeLine).join(" | ");
}


function parseServeSideFromSnapshot(snapshot){
  // snapshot includes "... · Srv A SD" or "... · Srv B SV"
  const m = String(snapshot || "").match(/Srv\s+[AB]\s+(SD|SV)\b/);
  return m ? m[1] : null;
}

function patternStats(options){
  const includeServe = options?.includeServe ?? true;
  const filterFn = options?.filterFn ?? null;

  const map = new Map();
  state.matchPoints.forEach((p) => {
    if (filterFn && !filterFn(p)) return;
    const key = patternKeyFromPoint(p, includeServe);
    if (!key) return;
    const rec = map.get(key) || { key, count: 0, winsA: 0, winsB: 0, points: [] };
    rec.count += 1;
    if (p.winner === "A") rec.winsA += 1;
    if (p.winner === "B") rec.winsB += 1;
    rec.points.push(p.n);
    map.set(key, rec);
  });
  return [...map.values()];
}

function sortRepeated(arr){
  return arr.sort((a,b) => (b.count - a.count) || ((b.winsA+b.winsB) - (a.winsA+a.winsB)));
}

function sortEffective(arr, minOcc=3){
  const filtered = arr.filter(r => r.count >= minOcc);
  filtered.forEach(r => {
    r.dom = (r.winsA === r.winsB) ? "EQ" : (r.winsA > r.winsB ? "A" : "B");
    r.eff = Math.max(r.winsA, r.winsB) / r.count; // dominance success rate
  });
  return filtered.sort((a,b) => (b.eff - a.eff) || (b.count - a.count));
}

let __analyticsIndex = new Map();

function renderPatternTable(title, sub, records, viewMode){
  // viewMode: "repeat" | "effective"
  const idBase = `${title}`.replace(/\s+/g, "_");

  const header = (viewMode === "effective")
    ? `<div class="analyticsHead" role="row">
        <div role="columnheader">Patrón</div>
        <div role="columnheader">Veces</div>
        <div role="columnheader">% Éxito</div>
        <div role="columnheader">Gana A</div>
        <div role="columnheader">Gana B</div>
      </div>`
    : `<div class="analyticsHead" role="row">
        <div role="columnheader">Patrón</div>
        <div role="columnheader">Veces</div>
        <div role="columnheader">Gana A</div>
        <div role="columnheader">Gana B</div>
        <div role="columnheader">Dominante</div>
      </div>`;

  const rows = records.map((r, idx) => {
    const dom = (r.winsA === r.winsB) ? "EQ" : (r.winsA > r.winsB ? "A" : "B");
    const domText = dom === "EQ" ? "Igual" : `Gana ${dom}`;
    const domCls = dom === "A" ? "domBadge domA" : (dom === "B" ? "domBadge domB" : "domBadge domEq");
    const eff = Math.max(r.winsA, r.winsB) / Math.max(1, r.count);
    const effPct = Math.round(eff * 100);

    const recId = `${idBase}::${idx}`;
    __analyticsIndex.set(recId, { ...r, dom, eff, title });

    if (viewMode === "effective"){
      return `
        <div class="analyticsRow" data-id="${escapeHtml(recId)}">
          <div>
            <div class="patternText">${escapeHtml(r.key)}</div>
            <div class="miniMeta">A ${r.winsA} · B ${r.winsB}</div>
          </div>
          <div><b>${r.count}</b></div>
          <div><span class="${domCls}">${domText} · ${effPct}%</span></div>
          <div>${r.winsA}</div>
          <div>${r.winsB}</div>
        </div>`;
    }

    return `
      <div class="analyticsRow" data-id="${escapeHtml(recId)}">
        <div>
          <div class="patternText">${escapeHtml(r.key)}</div>
          <div class="miniMeta">A ${r.winsA} · B ${r.winsB}</div>
        </div>
        <div><b>${r.count}</b></div>
        <div>${r.winsA}</div>
        <div>${r.winsB}</div>
        <div><span class="${domCls}">${domText}</span></div>
      </div>`;
  }).join("");

  const body = (records.length === 0)
    ? `<div class="analyticsRow"><div class="patternText">Sin datos</div><div>0</div><div>—</div><div>0</div><div>0</div></div>`
    : rows;

  return `
    <div class="analyticsBlock">
      <div class="analyticsBlockTitle">
        <div>${escapeHtml(title)}</div>
        <div class="sub">${escapeHtml(sub || "")}</div>
      </div>
      <div class="analyticsTable" role="table">
        ${header}
        <div class="analyticsRows">
          ${body}
        </div>
      </div>
    </div>`;
}

function bindAnalyticsRowClicks(){
  const all = [...document.querySelectorAll("#analyticsContent .analyticsRow[data-id]")];
  all.forEach(el => {
    el.addEventListener("click", () => selectAnalyticsById(el.dataset.id));
  });
}

function selectAnalyticsById(id){
  const items = [...document.querySelectorAll("#analyticsContent .analyticsRow[data-id]")];
  items.forEach(el => el.classList.remove("active"));
  const target = items.find(el => el.dataset.id === id);
  if (target) target.classList.add("active");

  const r = __analyticsIndex.get(id);
  if (!r) return;

  const dom = (r.winsA === r.winsB) ? "Igual" : (r.winsA > r.winsB ? "A" : "B");
  const effPct = Math.round((Math.max(r.winsA, r.winsB) / Math.max(1, r.count)) * 100);

  const detail = $("#analyticsDetail");
  const points = r.points.join(", ");
  detail.innerHTML = `
    <h3>${escapeHtml(r.title)} · ${r.count} veces</h3>
    <div class="meta">Dominante: <b>${escapeHtml(dom)}</b> · Éxito: <b>${effPct}%</b> · Gana A: <b>${r.winsA}</b> · Gana B: <b>${r.winsB}</b></div>
    <div class="meta">Puntos donde ocurre: ${escapeHtml(points)}</div>
    <div class="meta">Secuencia:</div>
    <ol>${r.key.split(" | ").map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
  `;
}

function renderAnalytics(){
  const includeServe = $("#toggleIncludeServe") ? $("#toggleIncludeServe").checked : true;
  const view = $("#analyticsView") ? $("#analyticsView").value : "repeat";
  const minOcc = $("#minOcc") ? Number($("#minOcc").value || 3) : 3;

  // Show/hide min occurrences only for effective view
  const wrap = $("#minOccWrap");
  if (wrap) wrap.style.display = (view === "effective") ? "flex" : "none";

  const content = $("#analyticsContent");
  const detail = $("#analyticsDetail");
  const sub = $("#analyticsSub");

  __analyticsIndex = new Map();

  if (sub) sub.textContent = `${state.matchPoints.length} puntos en partido`;
  if (!content || !detail) return;

  content.innerHTML = "";
  detail.innerHTML = "Selecciona un patrón.";

  if (state.matchPoints.length === 0){
    content.innerHTML = renderPatternTable("Sin datos", "Aún no hay puntos guardados", [], "repeat");
    return;
  }

  if (view === "repeat"){
    const all = patternStats({ includeServe });
    const top = sortRepeated(all).slice(0, 5);
    content.innerHTML = renderPatternTable("Más repetidos", "Secuencia completa del punto", top, "repeat");
  }

  if (view === "effective"){
    const all = patternStats({ includeServe });
    const top = sortEffective(all, minOcc).slice(0, 5);
    content.innerHTML = renderPatternTable("Más efectivos", `Ordenado por % éxito (mín ${minOcc})`, top, "effective");
  }

  if (view === "deucead"){
    const sd = patternStats({ includeServe, filterFn: (p) => parseServeSideFromSnapshot(p.snapshot) === "SD" });
    const sv = patternStats({ includeServe, filterFn: (p) => parseServeSideFromSnapshot(p.snapshot) === "SV" });
    const topSD = sortRepeated(sd).slice(0, 5);
    const topSV = sortRepeated(sv).slice(0, 5);
    content.innerHTML =
      renderPatternTable("DEUCE (SD)", "Top 5 más repetidos desde Deuce", topSD, "repeat") +
      renderPatternTable("VENTAJA (SV)", "Top 5 más repetidos desde Ventaja", topSV, "repeat");
  }

  if (view === "server"){
    const a = patternStats({ includeServe, filterFn: (p) => p.server === "A" });
    const b = patternStats({ includeServe, filterFn: (p) => p.server === "B" });
    const topA = sortRepeated(a).slice(0, 5);
    const topB = sortRepeated(b).slice(0, 5);
    content.innerHTML =
      renderPatternTable("Cuando saca A", "Top 5 más repetidos con servidor A", topA, "repeat") +
      renderPatternTable("Cuando saca B", "Top 5 más repetidos con servidor B", topB, "repeat");
  }

  bindAnalyticsRowClicks();

  // Auto-select first available row
  const first = document.querySelector("#analyticsContent .analyticsRow[data-id]");
  if (first) selectAnalyticsById(first.dataset.id);
}

function openAnalytics(){
  try{
    renderAnalytics();
  }catch(e){
    console.error(e);
    const content = $("#analyticsContent");
    if (content){
      content.innerHTML = `<div class="analyticsBlock"><div class="analyticsBlockTitle"><div>Error al calcular analíticas</div><div class="sub">Abre la consola (F12) para ver el detalle</div></div></div>`;
    }
  }
  const m = $("#analyticsModal");
  if (m) m.classList.remove("hidden");
}
function closeAnalytics(){
  $("#analyticsModal").classList.add("hidden");
}


function openExport(){
  renderExportPreview();
  const m = $("#exportModal");
  if (m) m.classList.remove("hidden");
}
function closeExport(){
  const m = $("#exportModal");
  if (m) m.classList.add("hidden");
}

function compactToken(line){
  const s = String(line||"").trim();
  const m = s.match(/^([AB])\s*-\s*(.*)$/);
  if (!m) return s;
  return `${m[1]}-${m[2].trim().replace(/\s+/g," ")}`;
}

function parseSideFromSnapshot(snapshot){
  const m = String(snapshot||"").match(/Srv\s+[AB]\s+(SD|SV)\b/);
  return m ? m[1] : "";
}

function getExportPoints(options){
  const includeServe = options?.includeServe ?? true;
  const splitShots = options?.splitShots ?? true;

  const rows = state.matchPoints.map(p => {
    const side = parseSideFromSnapshot(p.snapshot);
    const seq = Array.isArray(p.sequence) ? p.sequence.slice() : [];
    const filtered = seq.filter(line => includeServe ? true : !/^[AB]\s*-\s*S/.test(String(line).trim()));
    const tokens = filtered.map(compactToken);
    return {
      n: p.n,
      snapshot: p.snapshot,
      server: p.server || "",
      side,
      winner: p.winner || "",
      reason: p.reason || "",
      shots: tokens,
      pattern: tokens.join(" - "),
      numShots: tokens.length,
    };
  });

  const maxShots = splitShots ? rows.reduce((m,r)=>Math.max(m,r.shots.length), 0) : 0;
  return { rows, maxShots };
}

function csvEscape(v){
  const s = String(v ?? "");
  if (/[",\n\r\t;]/.test(s)){
    return `"${s.replace(/"/g,'""')}"`;
  }
  return s;
}

function downloadFile(filename, mime, content){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function exportCSV(){
  const includeServe = $("#exportIncludeServe")?.checked ?? true;
  const splitShots = $("#exportSplitShots")?.checked ?? true;
  const { rows, maxShots } = getExportPoints({ includeServe, splitShots });

  const nameA = state.names?.A || "Jugador A";
  const nameB = state.names?.B || "Jugador B";
  const baseCols = ["Punto","Servidor","Lado","Marcador","Ganador","Motivo","NºGolpes","Patrón"];
  const shotCols = splitShots ? Array.from({length:maxShots}, (_,i)=>`Golpe${i+1}`) : [];
  const header = [...baseCols, ...shotCols];

  const lines = [];
  lines.push(header.map(csvEscape).join(","));

  rows.forEach(r => {
    const winnerName = r.winner === "A" ? nameA : (r.winner === "B" ? nameB : r.winner);
    const base = [
      r.n, r.server, r.side, r.snapshot, winnerName, r.reason, r.numShots, r.pattern
    ];
    const shots = splitShots ? Array.from({length:maxShots}, (_,i)=>r.shots[i] || "") : [];
    lines.push([...base, ...shots].map(csvEscape).join(","));
  });

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  downloadFile(`partido_${stamp}.csv`, "text/csv;charset=utf-8", lines.join("\n"));
}

function exportWord(){
  const includeServe = $("#exportIncludeServe")?.checked ?? true;
  const { rows } = getExportPoints({ includeServe, splitShots:false });

  const nameA = escapeHtml(state.names?.A || "Jugador A");
  const nameB = escapeHtml(state.names?.B || "Jugador B");
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  const tableRows = rows.map(r => {
    const winnerBadge = r.winner === "A" ? `<span class="wA">${nameA}</span>` : (r.winner === "B" ? `<span class="wB">${nameB}</span>` : escapeHtml(r.winner));
    const seqHtml = r.shots.map((s,i)=>`${i+1}. ${escapeHtml(s)}`).join("<br/>");
    return `<tr>
      <td>${r.n}</td>
      <td>${escapeHtml(r.snapshot)}</td>
      <td>${escapeHtml(r.server)} ${r.side ? "(" + escapeHtml(r.side) + ")" : ""}</td>
      <td>${winnerBadge}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td class="mono">${seqHtml}</td>
    </tr>`;
  }).join("");

  const doc = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Partido ${nameA} vs ${nameB}</title>
<style>
  body{ font-family: Arial, sans-serif; margin: 18px; }
  h1{ font-size: 18px; margin: 0 0 4px; }
  .sub{ color:#555; font-size: 12px; margin: 0 0 14px; }
  table{ border-collapse: collapse; width: 100%; }
  th, td{ border: 1px solid #cfcfcf; padding: 6px 8px; vertical-align: top; font-size: 11px; }
  th{ background:#f2f2f2; font-weight: 700; }
  tr:nth-child(even) td{ background:#fafafa; }
  .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; line-height: 1.25; }
  .wA{ padding:2px 6px; border-radius:999px; border:1px solid #2ecc71; background:#e9f9ef; font-weight:700;}
  .wB{ padding:2px 6px; border-radius:999px; border:1px solid #ff8a00; background:#fff3e6; font-weight:700;}
</style>
</head><body>
  <h1>Partido: ${nameA} vs ${nameB}</h1>
  <p class="sub">Exportado: ${escapeHtml(stamp)} · Puntos: ${rows.length}</p>
  <table>
    <thead>
      <tr>
        <th>Punto</th>
        <th>Marcador</th>
        <th>Servidor</th>
        <th>Ganador</th>
        <th>Motivo</th>
        <th>Secuencia</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body></html>`;

  const stampFile = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  downloadFile(`partido_${stampFile}.doc`, "application/msword;charset=utf-8", doc);
}

async function copyTSV(){
  const includeServe = $("#exportIncludeServe")?.checked ?? true;
  const { rows } = getExportPoints({ includeServe, splitShots:false });

  const header = ["Punto","Marcador","Servidor","Ganador","Motivo","Secuencia"];
  const lines = [header.join("\t")];
  rows.forEach(r => {
    const seq = r.shots.join(" | ");
    lines.push([r.n, r.snapshot, `${r.server} ${r.side}`, r.winner, r.reason, seq].join("\t"));
  });
  const tsv = lines.join("\n");

  try{
    await navigator.clipboard.writeText(tsv);
    toast("Tabla copiada (TSV)");
  }catch(e){
    console.error(e);
    toast("No se pudo copiar. Prueba con CSV.");
  }
}

function renderExportPreview(){
  const includeServe = $("#exportIncludeServe")?.checked ?? true;
  const splitShots = $("#exportSplitShots")?.checked ?? true;
  const { rows, maxShots } = getExportPoints({ includeServe, splitShots });

  const sub = $("#exportSub");
  if (sub) sub.textContent = `${rows.length} puntos · Incluye saque: ${includeServe ? "sí" : "no"}`;

  const prev = $("#exportPreview");
  if (!prev) return;

  if (rows.length === 0){
    prev.innerHTML = `<div style="padding:12px; color: rgba(255,255,255,.75);">No hay puntos guardados.</div>`;
    $("#btnExportCSV") && ($("#btnExportCSV").disabled = true);
    $("#btnExportWord") && ($("#btnExportWord").disabled = true);
    $("#btnCopyTSV") && ($("#btnCopyTSV").disabled = true);
    return;
  }
  $("#btnExportCSV") && ($("#btnExportCSV").disabled = false);
  $("#btnExportWord") && ($("#btnExportWord").disabled = false);
  $("#btnCopyTSV") && ($("#btnCopyTSV").disabled = false);

  const cols = ["Punto","Ganador","Servidor","Motivo","Patrón"];
  const shotCols = splitShots ? Array.from({length: Math.min(maxShots, 8)}, (_,i)=>`G${i+1}`) : [];
  const head = [...cols, ...shotCols];

  const previewRows = rows.slice(0, 12).map(r => {
    const w = r.winner === "A" ? `<span class="badgeA">${escapeHtml(state.names?.A || "A")}</span>`
            : (r.winner === "B" ? `<span class="badgeB">${escapeHtml(state.names?.B || "B")}</span>` : escapeHtml(r.winner));
    const base = [
      r.n,
      w,
      `${escapeHtml(r.server)} ${r.side ? "(" + escapeHtml(r.side) + ")" : ""}`,
      escapeHtml(r.reason),
      `<div class="exportSeq">${escapeHtml(r.pattern)}</div>`
    ];
    const shots = splitShots ? Array.from({length: Math.min(maxShots, 8)}, (_,i)=>`<div class="exportSeq">${escapeHtml(r.shots[i] || "")}</div>`) : [];
    const tds = [...base, ...shots].map(v => `<td>${v}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  prev.innerHTML = `
    <table class="exportTable">
      <thead><tr>${head.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${previewRows}</tbody>
    </table>
    <div style="padding:10px; color: rgba(255,255,255,.55); font-size:12px;">
      Vista previa muestra los primeros 12 puntos. CSV incluye todos. “Columnas por golpe” en CSV crea Golpe1..GolpeN.
    </div>
  `;
}



function wireUI(){
  $("#btnUndo").addEventListener("click", undo);
  $("#btnResetPoint").addEventListener("click", resetPoint);
  $("#btnServer").addEventListener("click", toggleServer);

  $("#btnFault").addEventListener("click", addFault);
  $("#btnDoubleFault").addEventListener("click", addDoubleFault);

  $("#shotsScroll").addEventListener("scroll", setPinnedToBottomFromScroll);
  $("#btnToBottom").addEventListener("click", () => {
    const sc = $("#shotsScroll");
    sc.scrollTop = sc.scrollHeight;
    state.userPinnedToBottom = true;
    $("#btnToBottom").classList.add("hidden");
  });

  $("#nameA").addEventListener("input", (e) => { state.names.A = e.target.value; persist(); });
  $("#nameB").addEventListener("input", (e) => { state.names.B = e.target.value; persist(); });

  $("#btnHistory").addEventListener("click", openHistory);
  const __ba = $("#btnAnalytics"); if (__ba) __ba.addEventListener("click", openAnalytics);
  $("#btnCloseHistory").addEventListener("click", closeHistory);
  const __bca = $("#btnCloseAnalytics"); if (__bca) __bca.addEventListener("click", closeAnalytics);
  const __tis = $("#toggleIncludeServe"); if (__tis) __tis.addEventListener("change", renderAnalytics);
  const __av = $("#analyticsView"); if (__av) __av.addEventListener("change", renderAnalytics);
  const __mo = $("#minOcc"); if (__mo) __mo.addEventListener("change", renderAnalytics);

  // Export
  const __bce = $("#btnCloseExport"); if (__bce) __bce.addEventListener("click", closeExport);
  const __eis = $("#exportIncludeServe"); if (__eis) __eis.addEventListener("change", renderExportPreview);
  const __ess = $("#exportSplitShots"); if (__ess) __ess.addEventListener("change", renderExportPreview);
  const __csv = $("#btnExportCSV"); if (__csv) __csv.addEventListener("click", exportCSV);
  const __word = $("#btnExportWord"); if (__word) __word.addEventListener("click", exportWord);
  const __tsv = $("#btnCopyTSV"); if (__tsv) __tsv.addEventListener("click", copyTSV);


  $("#btnFinishMatch").addEventListener("click", finishMatch);
  const __br = $("#btnResumeMatch"); if (__br) __br.addEventListener("click", resumeMatch);
  $("#btnNewMatch").addEventListener("click", newMatch);

  const __redo = $("#btnRedoPoint"); if (__redo) __redo.addEventListener("click", redoPreviousPoint);

  // Close modal by clicking outside the card
  $("#historyModal").addEventListener("click", (e) => {
    if (e.target.id === "historyModal") closeHistory();
  });
  const __am = $("#analyticsModal");
  if (__am){
    __am.addEventListener("click", (e) => {
      if (e.target.id === "analyticsModal") closeAnalytics();
    });
  }
  const __em = $("#exportModal");
  if (__em){
    __em.addEventListener("click", (e) => {
      if (e.target.id === "exportModal") closeExport();
    });
  }
outcomeButtons();
}

function init(){
  restore();

  makeRallyZoneCells($("#gridA"), "A");
  makeRallyZoneCells($("#gridB"), "B");
  makeServeCells($("#serveTop"), "A");
  makeServeCells($("#serveBottom"), "B");

  wireUI();

  if (!state.point) initPoint();
  renderAll();

  // Match ended UI
  if (state.matchFinished){
    $("#historyModal").classList.add("hidden");
    renderAll();
  }
}

init();

// ---- v2.1 robustness helpers ----
(function(){
  // Expose a tiny API for inline fallbacks and debugging
  window.__TDT = {
    openHistory,
    closeHistory,
    openAnalytics,
    closeAnalytics,
    openExport,
    closeExport,
    newMatch,
  };

  // ESC closes history modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      try { closeHistory(); } catch(_) {}
      try { closeAnalytics(); } catch(_) {}
      try { closeExport(); } catch(_) {}
    }
  }, true);

  // Make sure close button always works even if something stops bubbling
  const btn = document.getElementById("btnCloseHistory");
  if (btn){
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { closeHistory(); } catch(_) {}
      try { closeAnalytics(); } catch(_) {}
      try { closeExport(); } catch(_) {}
    }, true);
  }

  const btnA = document.getElementById("btnCloseAnalytics");
  if (btnA){
    btnA.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { closeAnalytics(); } catch(_) {}
    }, true);
  }

  const btnE = document.getElementById("btnCloseExport");
  if (btnE){
    btnE.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { closeExport(); } catch(_) {}
    }, true);
  }
})();