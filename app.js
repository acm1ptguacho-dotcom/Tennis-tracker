
const $ = (s) => document.querySelector(s);

const STORAGE_KEY = "tdt_v23_state";

const state = {
  names: { A:"Jugador A", B:"Jugador B" },
  sets: { A:0, B:0 },
  games: { A:0, B:0 },
  points: { A:0, B:0 },
  isTiebreak: false,
  tb: { A:0, B:0 },
  tbStartingServer: "A",
  currentServer: "A",
  matchFinished: false,

  point: null, // current point
  matchPoints: [], // completed points
  undoStack: [],

  ui: { theme:"dark", coach:true }
};

function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
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
    state.tb = state.tb || {A:0,B:0};
    state.undoStack = state.undoStack || [];
    state.matchPoints = state.matchPoints || [];
    state.setHistory = state.setHistory || [];
    state.ui = state.ui || {theme:"dark", coach:false};
  }catch(e){ console.error(e); }
}

function toast(msg){
  const t=$("#toast");
  if (!t) return;
  t.textContent=msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1400);
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
  };
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
  const hint=$("#zoneHint");
  const phase=$("#badgePhase");
  if (!p || !hint || !phase) return;
  if (p.phase==="serve"){
    hint.textContent = `SAQUE (${p.server}) · lado ${p.side} · toca T/C/A`;
    phase.textContent = "SAQUE";
  } else {
    hint.textContent = `RALLY · toca dirección (P/M/C)`;
    phase.textContent = "RALLY";
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
  setTimeout(()=>el.classList.remove("tapFlash"), 650);

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
  }, 1000);
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
    btn.textContent = (r===0?"P":(r===1?"M":"C"));
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
    btn.textContent = (r===0?"C":(r===1?"M":"P"));
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
    btn.textContent="SAQUE";
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

  // Serve indicator
  $("#serveA").classList.toggle("on", state.currentServer==="A");
  $("#serveB").classList.toggle("on", state.currentServer==="B");

  // Sets (completed) + current set games
  const hist = state.setHistory || [];
  const cols = Math.min(5, Math.max(1, hist.length + 1));
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
      cell.className = "tvSetCell" + (i===hist.length ? " active" : "");
      let val = "";
      if (i < hist.length){
        val = String(hist[i][player] ?? "");
      }else if (i === hist.length){
        val = String(state.games[player] ?? 0);
      }
      cell.textContent = val;
      row.appendChild(cell);
    }
  };
  fillRow(rowA, "A");
  fillRow(rowB, "B");

  // Points
  $("#tvPtsA").textContent = pointText("A");
  $("#tvPtsB").textContent = pointText("B");

  // Meta badges
  $("#badgeScore").textContent = scoreLabel();
  $("#badgeSide").textContent = serveSideLabel();
  $("#badgePhase").textContent = (state.point?.phase==="serve") ? "SAQUE" : "RALLY";

  $("#btnFinish").classList.toggle("hidden", state.matchFinished);
  $("#btnResume").classList.toggle("hidden", !state.matchFinished);
  $("#btnRedoPoint").disabled = state.matchPoints.length===0;
}

function newMatch(){
  state.sets={A:0,B:0};
  state.games={A:0,B:0};
  state.points={A:0,B:0};
  state.isTiebreak=false;
  state.tb={A:0,B:0};
  state.tbStartingServer="A";
  state.currentServer="A";
  state.matchFinished=false;
  state.matchPoints=[];
  state.setHistory=[];
  state.undoStack=[];
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
  const snapshot = `S ${state.sets.A}-${state.sets.B} · G ${state.games.A}-${state.games.B} · P ${scoreLabel()} · Srv ${p.server} ${p.side}`;
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
  toast("Último punto rehecho");
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
function openModal(id){ $(id).classList.remove("hidden"); }
function closeModal(id){ $(id).classList.add("hidden"); }

function openHistory(){
  renderHistory();
  openModal("#historyModal");
}
function closeHistory(){ closeModal("#historyModal"); }

function openAnalytics(){
  openModal("#analyticsModal");
  try{ renderAnalytics(); }
  catch(e){ console.error(e); toast("Error al abrir analíticas"); }
}
function closeAnalytics(){ closeModal("#analyticsModal"); }

function openExport(){
  $("#exportSub").textContent = `${state.matchPoints.length} puntos`;
  openModal("#exportModal");
}
function closeExport(){ closeModal("#exportModal"); }


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
  { key:"ACE", label:"Ace" },
  { key:"PASS", label:"Passing" },
  { key:"DROP", label:"Dejada" },
  { key:"VOL", label:"Volea winner" },
  { key:"WIN", label:"Winner" },
  { key:"OTHER", label:"Otro" },
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

  let opts=[];
  if (meta.kind==="WINNER") opts = ADV_WINNERS;
  else opts = ADV_STROKES;

  title.textContent =
    meta.kind==="WINNER" ? "Tipo de winner" :
    meta.kind==="UE" ? "Tipo de error no forzado" :
    "Tipo de error forzado";

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




/** HISTORY FILTERS **/

function finishDetailLabel(fd){
  if (!fd) return "";
  const strokeMap = { FH:"Derecha", BH:"Revés", VOL:"Volea", SM:"Smash", OTHER:"Otro" };
  const winMap = { ACE:"Ace", PASS:"Passing", DROP:"Dejada", VOL:"Volea winner", WIN:"Winner", OTHER:"Otro" };
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

  const list=$("#historyList");
  const detail=$("#historyDetail");
  if (!list || !detail) return;

  const nameA=state.names.A, nameB=state.names.B;
  const rows = state.matchPoints.filter(p=>{
    if (server && p.server!==server) return false;
    if (side && p.side!==side) return false;
    if (winner && p.winner!==winner) return false;
    if (end && !String(p.reason||"").startsWith(end)) return false;
    const pattern = pointPattern(p, true).toLowerCase();
    if (search && !pattern.includes(search)) return false;
    return true;
  });

  list.innerHTML="";
  if (!rows.length){
    list.innerHTML = `<div class="historyItem"><div class="historyItemTitle">No hay puntos.</div><div class="historyItemMeta">Cambia filtros o registra puntos.</div></div>`;
    detail.textContent = "Selecciona un punto.";
    return;
  }

  // keep current selection if exists
  const selN = state.ui?.historySelN || rows[0].n;
  const chosen = rows.find(p=>p.n===selN) || rows[0];
  state.ui = state.ui || {};
  state.ui.historySelN = chosen.n;

  rows.forEach(p=>{
    const item=document.createElement("div");
    item.className="historyItem" + (p.n===chosen.n ? " active" : "");
    const pat=pointPattern(p, true);
    const winName = p.winner==="A"?nameA:nameB;
    item.innerHTML = `
      <div class="historyItemTop">
        <div>
          <div class="historyItemTitle">Punto ${p.n}</div>
          <div class="historyItemMeta">${escapeHtml(p.snapshot)}<br/>${escapeHtml((p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : ""))}</div>
        </div>
        <span class="pill ${p.winner==="A"?"pillGood":"pillWarn"}">Gana ${escapeHtml(p.winner)}</span>
      </div>
      <div class="historyItemMeta mono" style="margin-top:8px;">${escapeHtml(pat)}</div>
    `;
    item.addEventListener("click", ()=>{
      state.ui.historySelN = p.n;
      // update active class
      [...list.querySelectorAll(".historyItem")].forEach(el=>el.classList.remove("active"));
      item.classList.add("active");
      renderHistoryDetail(p);
    });
    list.appendChild(item);
  });

  renderHistoryDetail(chosen);
}

function renderHistoryDetail(p){
  const detail=$("#historyDetail");
  if (!detail) return;
  const nameA=state.names.A, nameB=state.names.B;
  const winName = p.winner==="A"?nameA:nameB;
  const header = `
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
      <div>
        <div class="modalTitle" style="margin:0;">Punto ${p.n} · Gana ${escapeHtml(p.winner)}</div>
        <div class="modalSub" style="margin-top:4px;">${escapeHtml(p.snapshot)}<br/>${escapeHtml((p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : ""))}</div>
      </div>
      <div class="pill ${p.winner==="A"?"pillGood":"pillWarn"}">${escapeHtml(winName)}</div>
    </div>
    <div style="height:10px;"></div>
  `;
  const evs = (p.events||[]);
  const lines = evs.map((e,i)=>`<div class="mono" style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,.08);">
    <b>${i+1}.</b> ${escapeHtml(e.player)} - ${escapeHtml(e.code)}
  </div>`).join("");
  detail.innerHTML = header + `<div>${lines || "<div class='muted'>Sin eventos</div>"}</div>`;
}


function compactEv(ev){
  return `${ev.player}-${ev.code}`.trim().replace(/\s+/g," ");
}
function pointPattern(p, includeServe){
  const evs = p.events || [];
  const filtered = evs.filter(e=> includeServe ? true : e.type!=="serve");
  return filtered.map(compactEv).join(" - ");
}

/** ANALYTICS **/
function renderAnalytics(){
  const view=$("#aView")?.value || "freq";
  const min = parseInt($("#aMin")?.value,10) || 5;
  const includeServe=$("#aIncludeServe")?.checked ?? true;

  const list=$("#analyticsList");
  const detail=$("#analyticsDetail");
  if (!list || !detail) return;

  list.innerHTML="";
  detail.innerHTML="Selecciona un patrón.";

  const stats = computePatternStats(includeServe);
  let items = Object.values(stats).filter(x=>x.count>=min);

  if (view==="freq"){
    items.sort((a,b)=>b.count-a.count);
    items = items.slice(0,5);
  } else if (view==="effective"){
    items.sort((a,b)=>b.bestRate-a.bestRate);
    items = items.slice(0,5);
  } else if (view==="deucead"){
    // más repetidos por lado (SD/SV)
    items.sort((a,b)=> (b.sdCount+b.svCount) - (a.sdCount+a.svCount));
    items = items.slice(0,5);
  } else if (view==="server"){
    items.sort((a,b)=> (b.srvA+b.srvB) - (a.srvA+a.srvB));
    items = items.slice(0,5);
  }

  if (!items.length){
    list.innerHTML = `<div class="analyticsItem"><div class="analyticsItemTitle">Sin datos suficientes</div><div class="analyticsItemMeta">Baja el mínimo de ocurrencias o registra más puntos.</div></div>`;
    return;
  }

  const nameA=state.names.A, nameB=state.names.B;

  // mantener selección si existe
  const selKey = state.ui?.analyticsSelKey || items[0].key;
  const chosen = items.find(x=>x.key===selKey) || items[0];
  state.ui = state.ui || {};
  state.ui.analyticsSelKey = chosen.key;

  items.forEach(it=>{
    const div=document.createElement("div");
    div.className="analyticsItem" + (it.key===chosen.key ? " active" : "");
    const rateA = Math.round((it.winA/it.count)*100);
    const rateB = Math.round((it.winB/it.count)*100);
    div.innerHTML = `
      <div class="analyticsItemTitle mono">${escapeHtml(it.key)}</div>
      <div class="analyticsItemMeta">
        Veces: <b>${it.count}</b> · ${escapeHtml(nameA)}: <b>${it.winA}</b> (${rateA}%) · ${escapeHtml(nameB)}: <b>${it.winB}</b> (${rateB}%) · Dominante: <b>${escapeHtml(it.dominant)}</b>
      </div>
    `;
    div.addEventListener("click", ()=>{
      state.ui.analyticsSelKey = it.key;
      [...list.querySelectorAll(".analyticsItem")].forEach(el=>el.classList.remove("active"));
      div.classList.add("active");
      showPatternDetail(it, includeServe);
    });
    list.appendChild(div);
  });

  showPatternDetail(chosen, includeServe);
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

/** EXPORT **/
function getExport(includeServe, splitShots){
  const rows = state.matchPoints.map(p=>{
    const evs = (p.events||[]).filter(e=> includeServe ? true : e.type!=="serve").map(compactEv);
    return {
      n:p.n,
      snapshot:p.snapshot,
      server:`${p.server} (${p.side})`,
      winner:p.winner,
      reason:p.reason,
      finishDetail: p.finishDetail || null,
      evs,
      pattern: evs.join(" - "),
    };
  });
  const maxShots = splitShots ? rows.reduce((m,r)=>Math.max(m,r.evs.length),0) : 0;
  return {rows, maxShots};
}
function csvEscape(v){
  const s=String(v??"");
  if (/[",\n\r\t;]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
function downloadFile(filename, mime, content){
  const blob=new Blob([content], {type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a);
  a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
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
        <div style="border:1px solid #cbd5e1; border-radius:14px; background:#fff; padding:12px;">
          <div style="font-weight:900; font-size:13px; margin-bottom:8px;">Top 5 patrones más repetidos</div>
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

        <div style="border:1px solid #cbd5e1; border-radius:14px; background:#fff; padding:12px;">
          <div style="font-weight:900; font-size:13px; margin-bottom:8px;">Puntos (punto a punto)</div>
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

function applyTheme(){
  document.body.classList.toggle("light", state.ui.theme==="light");
  $("#btnTheme").textContent = (state.ui.theme==="light") ? "Modo oscuro" : "Modo claro";
}
function toggleTheme(){
  state.ui.theme = (state.ui.theme==="light") ? "dark" : "light";
  applyTheme();
  persist();
}
function applyCoach(){
  document.body.classList.toggle("coach", !!state.ui.coach);
  $("#btnCoach").textContent = state.ui.coach ? "Modo normal" : "Modo entrenador";
}
function toggleCoach(){
  state.ui.coach = !state.ui.coach;
  applyCoach();
  persist();
}

/** WIRING **/
function renderAll(){
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

  on("btnHistory","click", openHistory);
  on("btnAnalytics","click", openAnalytics);
  on("btnExport","click", openExport);

  on("btnCloseHistory","click", closeHistory);
  on("btnCloseAnalytics","click", closeAnalytics);
  on("btnCloseExport","click", closeExport);

  on("btnTheme","click", toggleTheme);
  on("btnCoach","click", toggleCoach);

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

  // quick actions
  on("btnUndo","click", undo);
  on("btnResetPoint","click", resetPoint);
  on("btnRedoPoint","click", redoLastPoint);
  on("btnReplay","click", replayCurrentPoint);

  // history filters
  ["fServer","fSide","fWinner","fEnd","fSearch"].forEach(id=>{
    on(id,"input", renderHistory);
    on(id,"change", renderHistory);
  });

  // analytics filters
  ["aView","aMin","aIncludeServe"].forEach(id=>{
    on(id,"input", renderAnalytics);
    on(id,"change", renderAnalytics);
  });

  // export
  on("btnCSV","click", exportCSV);
  on("btnWord","click", exportWord);
  on("btnPDF","click", exportPDF);

  // close modals clicking outside
  ["historyModal","analyticsModal","exportModal"].forEach(mid=>{
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
      ["historyModal","analyticsModal","exportModal","finishMenu"].forEach(id=>{
        const el=$("#"+id);
        if (el && !el.classList.contains("hidden")) el.classList.add("hidden");
      });
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

function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(console.error);
}

function init(){
  load();
  applyTheme();
  applyCoach();
  buildZones();
  initPoint();
  wire();
  renderAll();
  registerSW();
}

window.addEventListener("load", init);
