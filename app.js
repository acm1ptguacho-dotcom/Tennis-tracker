
const $ = (s) => document.querySelector(s);

const STORAGE_BASE_STATE = "tdt_v24_state";
const STORAGE_BASE_MATCHES = "tdt_saved_matches_v2";
const STORAGE_BASE_PROFILES = "tdt_player_profiles_v1";
const STORAGE_BASE_FINISH_MODE = "tdt_finish_mode_v2";
const ACCOUNTS_KEY = "tdt_accounts_v1";
const SESSION_KEY = "tdt_session_v1";


function storageAvailable(area){
  try{
    const k = "__tdt_probe__" + Math.random().toString(36).slice(2);
    area.setItem(k, "1");
    area.removeItem(k);
    return true;
  }catch(e){ return false; }
}
function readRaw(area, key){
  try{ return area.getItem(key); }catch(e){ return null; }
}
function writeRaw(area, key, value){
  try{ area.setItem(key, value); return true; }catch(e){ console.error(e); return false; }
}
function removeRaw(area, key){
  try{ area.removeItem(key); }catch(e){ console.error(e); }
}
function safeReadJSON(area, key, fallback){
  try{
    const raw = readRaw(area, key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  }catch(e){
    console.error(e);
    return fallback;
  }
}
function safeWriteJSON(area, key, value){
  try{ return writeRaw(area, key, JSON.stringify(value)); }catch(e){ console.error(e); return false; }
}
function getSession(){
  if (__sessionCache) return __sessionCache;
  const local = safeReadJSON(localStorage, SESSION_KEY, null);
  const session = local || safeReadJSON(sessionStorage, SESSION_KEY, null);
  __sessionCache = session || null;
  return __sessionCache;
}
function refreshSessionCache(){
  __sessionCache = null;
  return getSession();
}
function setSession(session, remember=false){
  const payload = session ? { ...session, remember: !!remember } : null;
  try{ removeRaw(localStorage, SESSION_KEY); }catch(e){}
  try{ removeRaw(sessionStorage, SESSION_KEY); }catch(e){}
  if (!payload){
    __sessionCache = null;
    return null;
  }
  const target = remember ? localStorage : sessionStorage;
  safeWriteJSON(target, SESSION_KEY, payload);
  __sessionCache = payload;
  return payload;
}
function clearSession(){
  try{ removeRaw(localStorage, SESSION_KEY); }catch(e){}
  try{ removeRaw(sessionStorage, SESSION_KEY); }catch(e){}
  __sessionCache = null;
}
function isAuthenticated(){
  const s = getSession();
  return !!(s && s.uid);
}
function getAccounts(){ return safeReadJSON(localStorage, ACCOUNTS_KEY, []) || []; }
function setAccounts(arr){ return safeWriteJSON(localStorage, ACCOUNTS_KEY, Array.isArray(arr) ? arr : []); }
function getCurrentAccount(){
  const s = getSession();
  if (!s || !s.uid || s.isDemo) return s && s.isDemo ? s : null;
  return getAccounts().find(acc => acc.id === s.uid) || null;
}
function updateAccountRecord(updater){
  const current = getCurrentAccount();
  if (!current || typeof updater !== "function") return null;
  const accounts = getAccounts();
  const idx = accounts.findIndex(acc => acc.id === current.id);
  if (idx < 0) return null;
  const next = updater({ ...accounts[idx] });
  if (!next) return null;
  accounts[idx] = next;
  setAccounts(accounts);
  const s = getSession();
  if (s && s.uid === next.id){
    setSession({ ...s, name: next.name || s.name, email: next.email || s.email, plan: next.plan || s.plan, isDemo: !!s.isDemo }, !!s.remember);
  }
  return next;
}
function scopedKey(base){
  const s = getSession();
  const uid = s && s.uid ? s.uid : "guest";
  return `${base}__${uid}`;
}
function getStateStorageKey(){ return scopedKey(STORAGE_BASE_STATE); }
function getSavedMatchesStorageKey(){ return scopedKey(STORAGE_BASE_MATCHES); }
function getProfilesStorageKey(){ return scopedKey(STORAGE_BASE_PROFILES); }
function getFinishModeKey(){ return scopedKey(STORAGE_BASE_FINISH_MODE); }

function createDefaultState(){
  return {
    lang: "es",
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

    point: null,
    matchPoints: [],
    undoStack: [],

    meta: { event:"", venue:"", date:"", time:"", conditions:"", notes:"" },
    handed: { A:"R", B:"R" },
    playerSex: { A:"M", B:"M" },
    playerAssignments: { A:null, B:null },

    ui: {
      theme:"dark",
      coach:true,
      showHistoryArrows:true,
      hideScore:false,
      rotated:false,
      hideRail:false,
      surface:"hard",
      chartPlayer:"A",
      saveLoadMode:"save"
    }
  };
}

const state = createDefaultState();

function resetState(){
  const prevLang = state.lang || "es";
  Object.keys(state).forEach(key => { delete state[key]; });
  Object.assign(state, createDefaultState());
  state.lang = prevLang;
  return state;
}

let __sessionCache = null;

const playerName = (id)=> (state.names && state.names[id]) ? state.names[id] : (id==="A" ? "Jugador A" : "Jugador B");
const playerNameSafe = (id)=> escapeHtml(playerName(id));
const isEn = ()=> (state.lang || "es") === "en";
const tr = (es, en)=> isEn() ? en : es;

function getAssignedProfile(side){
  const id = state.playerAssignments && state.playerAssignments[side];
  return id ? (getPlayerProfiles().find(p => p.id === id) || null) : null;
}
function getPlayerSex(side){
  const profile = getAssignedProfile(side);
  return (profile && profile.sex) || (state.playerSex && state.playerSex[side]) || "M";
}
function defaultAvatarSVG(sex){
  const female = String(sex || "").toUpperCase() === "F";
  if (female){
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10c0-3.4 1.8-6 4-6s4 2.6 4 6c0 2.5-1.2 4-4 4s-4-1.5-4-4z" fill="currentColor"/><path d="M6 20c0-3.8 2.8-6 6-6s6 2.2 6 6v1H6z" fill="currentColor"/><path d="M7 8c.5-3.1 2.5-5 5-5s4.5 1.9 5 5c-1.3-1.2-3.2-1.8-5-1.8S8.3 6.8 7 8z" fill="currentColor" opacity=".25"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4" fill="currentColor"/><path d="M5 20c0-4 3.2-7 7-7s7 3 7 7v1H5z" fill="currentColor"/></svg>`;
}
function playerAvatarMarkup(side){
  const profile = getAssignedProfile(side);
  if (profile && profile.photoData) return `<img src="${profile.photoData}" alt="${escapeHtml(profile.name || 'Jugador')}">`;
  return defaultAvatarSVG(getPlayerSex(side));
}
function renderScoreAvatars(){
  const a = document.getElementById('tvAvatarA');
  const b = document.getElementById('tvAvatarB');
  if (a){ const pa=getAssignedProfile('A'); a.innerHTML = playerAvatarMarkup('A'); a.classList.toggle('hasPhoto', !!(pa && pa.photoData)); }
  if (b){ const pb=getAssignedProfile('B'); b.innerHTML = playerAvatarMarkup('B'); b.classList.toggle('hasPhoto', !!(pb && pb.photoData)); }
}

// --- I18N (ES/EN) ---
const I18N = {
  es: {
    menu: "Menú",
    actions: "Acciones",
    reports: "Reportes",
    settings: "Configuración",
    saveMatch: "Guardar partido",
    loadMatch: "Cargar partido",
    gameMode: "Modo de juego",
    surface: "Cambiar pista",
    language: "Idioma",
    info: "Info",
    back: "Volver",
    close: "Cerrar",
    apply: "Aplicar",
    start: "Iniciar",
    matchData: "Datos del partido",
    seqTitle: "Secuencia del punto",
    last: "Último:",
    charts: "Gráficos",
    history: "Historial",
    analytics: "Analíticas",
    stats: "Estadísticas",
    export: "Exportar",
    hard: "Dura",
    clay: "Tierra batida",
    grass: "Césped",
    ao: "Australia (azul)",
  },
  en: {
    menu: "Menu",
    actions: "Actions",
    reports: "Reports",
    settings: "Settings",
    saveMatch: "Save match",
    loadMatch: "Load match",
    gameMode: "Game mode",
    surface: "Court surface",
    language: "Language",
    info: "Info",
    back: "Back",
    close: "Close",
    apply: "Apply",
    start: "Start",
    matchData: "Match details",
    seqTitle: "Point sequence",
    last: "Last:",
    charts: "Charts",
    history: "History",
    analytics: "Analytics",
    stats: "Stats",
    export: "Export",
    hard: "Hard",
    clay: "Clay",
    grass: "Grass",
    ao: "Australian (blue)",
  }
};
function t(key){
  const lang = (state.lang || "es");
  return (I18N[lang] && I18N[lang][key]) || I18N.es[key] || key;
}
function setLanguage(lang){
  state.lang = (lang === "en") ? "en" : "es";
  persist();
  applyI18n();
  renderAll();
}
function applyI18n(){
  document.documentElement.lang = state.lang || "es";
  document.title = "Tennis Direction Tracker";
  const flag = document.getElementById('langFlag');
  if (flag) flag.textContent = (state.lang === 'en') ? '🇬🇧' : '🇪🇸';
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k = el.getAttribute('data-i18n');
    if (!k) return;
    el.textContent = t(k);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
    const k = el.getAttribute('data-i18n-ph');
    if (!k) return;
    el.setAttribute('placeholder', t(k));
  });
  // Info content
  const infoBody = document.getElementById('infoBody');
  if (infoBody){
    if ((state.lang||'es') === 'en'){
      infoBody.innerHTML = `
        <p><b>Tennis Direction Tracker</b> is a point-by-point tennis tracking tool focused on directional patterns.</p>
        <ul>
          <li>Tap the court grid to record serve/return/rally directions.</li>
          <li>Save and load matches locally on the device.</li>
          <li>Review point history, replay arrow sequences and filter by score or context.</li>
          <li>Explore repeated patterns, stats and momentum charts.</li>
          <li>Export data for reports (CSV/PDF).</li>
        </ul>
        <p class="muted">Tip: use “Hide tools” for a full-screen court view during training.</p>
      `;
    } else {
      infoBody.innerHTML = `
        <p><b>Tennis Direction Tracker</b> es una herramienta para registrar puntos y patrones de dirección en tenis punto a punto.</p>
        <ul>
          <li>Toca la cuadrícula de la pista para registrar saque/resto/rally.</li>
          <li>Guarda y carga partidos en el dispositivo.</li>
          <li>Revisa historial, reproduce secuencias con flechas y filtra por marcador o contexto.</li>
          <li>Analiza patrones repetidos, estadísticas y gráficos de momentum.</li>
          <li>Exporta datos para informes (CSV/PDF).</li>
        </ul>
        <p class="muted">Sugerencia: usa “Ocultar herramientas” para ver el diagrama en pantalla completa.</p>
      `;
    }
  }
  const setTxt = (sel, txt)=>{ const el = document.querySelector(sel); if (el) el.textContent = txt; };
  setTxt('#surfaceModalTitle', tr('Cambiar pista','Change court'));
  setTxt('#surfaceModalSub', tr('Selecciona la superficie del diagrama','Select the diagram surface'));
  setTxt('#languageModalTitle', tr('Idioma','Language'));
  setTxt('#languageModalSub', tr('Elige Español o English','Choose Spanish or English'));
  setTxt('#playersModalTitle', tr('Biblioteca de jugadores','Player library'));
  setTxt('#btnClosePlayers', tr('Cerrar','Close'));
  setTxt('#btnPlayersChooseMode span', tr('Elegir jugador','Choose player'));
  setTxt('#btnPlayersChooseMode small', tr('Selecciona un perfil ya guardado y asígnalo a A o B.','Select a saved profile and assign it to A or B.'));
  setTxt('#btnPlayersCreateMode span', tr('Nuevo jugador','New player'));
  setTxt('#btnPlayersCreateMode small', tr('Crea un perfil nuevo con datos técnicos, fortalezas y notas.','Create a new profile with technical data, strengths and notes.'));
  setTxt('#profileNameLabel', tr('Nombre','Name'));
  setTxt('#profileCategoryLabel', tr('Edad o categoría','Age or category'));
  setTxt('#profileHandLabel', tr('Mano hábil','Dominant hand'));
  setTxt('#profileSexLabel', tr('Sexo','Sex'));
  setTxt('#profileGoalLabel', tr('Objetivo principal','Main goal'));
  setTxt('#profileStrengthsLabel', tr('Fortalezas','Strengths'));
  setTxt('#profileWeaknessesLabel', tr('Debilidades','Weaknesses'));
  setTxt('#profileNotesLabel', tr('Notas del entrenador','Coach notes'));
  setTxt('#btnSaveProfile', tr('Guardar perfil','Save profile'));
  setTxt('#btnResetProfile', tr('Nuevo perfil','New profile'));
  setTxt('#tabNormal', tr('Normal','Normal'));
  setTxt('#tabAdvanced', tr('Avanzado','Advanced'));
  setTxt('.finishMenuTitle', tr('Acciones del punto','Point actions'));
  setTxt('#finishMenuSub', tr('Selecciona una opción (se cierra automáticamente)','Choose an option (closes automatically)'));
  setTxt('#pointImportantLabel', tr('Marcar punto importante','Mark point as important'));
  setTxt('#finishServeGroup .finishGroupTitle', tr('Saque','Serve'));
  setTxt('#mFault', tr('Falta','Fault'));
  setTxt('#mDoubleFault', tr('Doble falta','Double fault'));
  setTxt('#finishRallyGroup .finishGroupTitle', tr('Finalizar punto','Finish point'));
  [['#mUeA_n', tr('Error no forzado','Unforced error')], ['#mGainA_n', tr('Gana','Wins')], ['#mWinA_n','Winner'], ['#mUeA_a', tr('Error no forzado','Unforced error')], ['#mFeA_a', tr('Error forzado','Forced error')], ['#mGainA_a', tr('Gana','Wins')], ['#mWinA_a','Winner'], ['#mVolA_a', tr('Volea','Volley')], ['#mUeB_n', tr('Error no forzado','Unforced error')], ['#mGainB_n', tr('Gana','Wins')], ['#mWinB_n','Winner'], ['#mUeB_a', tr('Error no forzado','Unforced error')], ['#mFeB_a', tr('Error forzado','Forced error')], ['#mGainB_a', tr('Gana','Wins')], ['#mWinB_a','Winner'], ['#mVolB_a', tr('Volea','Volley')]].forEach(([sel,txt])=>setTxt(sel,txt));
  setTxt('#btnPlayerLibraryMenu span', tr('Jugadores','Players'));
  setTxt('#btnAccountMenu span', tr('Cuenta','Account'));
  setTxt('#btnHelpCenter span', tr('Centro de ayuda','Help center'));
  setTxt('#btnLegal span', tr('Privacidad y términos','Privacy & terms'));
  setTxt('#btnPlayerLibrary', tr('Jugadores','Players'));
  setTxt('#btnAccount', tr('Cuenta','Account'));
  const optM = document.querySelector('#profileSex option[value="M"]'); if (optM) optM.textContent = tr('Hombre','Male');
  const optF = document.querySelector('#profileSex option[value="F"]'); if (optF) optF.textContent = tr('Mujer','Female');
  const optR = document.querySelector('#profileHand option[value="R"]'); if (optR) optR.textContent = tr('Diestro','Right-handed');
  const optL = document.querySelector('#profileHand option[value="L"]'); if (optL) optL.textContent = tr('Zurdo','Left-handed');
  upgradeCloseButtons();
}

function closeIconMarkup(){
  return `<svg class="svgIcon" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}
function upgradeCloseButtons(scope=document){
  const ids = [
    'btnClosePlayers','btnCloseDashboard','btnCloseAccount','btnCloseHelp','btnCloseLegal','btnCloseOnboarding',
    'btnCloseHistory','btnClosePointViewer','btnCloseAnalytics','btnCloseStats','btnCloseCharts','btnCloseExport',
    'btnCloseLanguage','btnCloseInfo','btnCloseSurface','btnCloseGameMode','btnCloseSaveLoad','btnCloseConfirm'
  ];
  ids.forEach(id=>{
    const el = (scope && scope.querySelector) ? scope.querySelector(`#${id}`) : null;
    const btn = el || document.getElementById(id);
    if (!btn) return;
    btn.classList.add('modalCloseX');
    btn.innerHTML = closeIconMarkup();
    btn.setAttribute('aria-label', tr('Cerrar','Close'));
    btn.setAttribute('title', tr('Cerrar','Close'));
  });
  const detailBtns = (scope && scope.querySelectorAll) ? scope.querySelectorAll('[data-profile-action="closeDetail"]') : document.querySelectorAll('[data-profile-action="closeDetail"]');
  detailBtns.forEach(btn=>{
    btn.classList.add('modalCloseX');
    btn.innerHTML = closeIconMarkup();
    btn.setAttribute('aria-label', tr('Cerrar','Close'));
    btn.setAttribute('title', tr('Cerrar','Close'));
  });
}

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
    localStorage.setItem(getStateStorageKey(), JSON.stringify(state));
  }catch(e){
    console.error(e);
    try{ toast("⚠️ No se pudo guardar (almacenamiento lleno o bloqueado)"); }catch(_){}
  }
}
function load(){
  try{
    const raw = localStorage.getItem(getStateStorageKey());
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, s);
    // safety defaults
    state.lang = state.lang || "es";
    state.names = state.names || {A:"Jugador A",B:"Jugador B"};
    state.sets = state.sets || {A:0,B:0};
    state.games = state.games || {A:0,B:0};
    state.points = state.points || {A:0,B:0};
    state.matchMode = state.matchMode || "standard";
    state.tb = state.tb || {A:0,B:0};
    state.undoStack = state.undoStack || [];
    state.matchPoints = state.matchPoints || [];
    state.setHistory = state.setHistory || [];
    state.meta = state.meta || { event:"", venue:"", date:"", time:"", conditions:"", notes:"" };
    state.handed = state.handed || { A:"R", B:"R" };
    state.playerSex = state.playerSex || { A:"M", B:"M" };
    state.playerAssignments = state.playerAssignments || { A:null, B:null };
    state.ui = state.ui || {theme:"dark", coach:true, showHistoryArrows:true, hideScore:false, rotated:false, hideRail:false, surface:"hard", chartPlayer:"A", saveLoadMode:"save"};
    if (typeof state.ui.showHistoryArrows === "undefined") state.ui.showHistoryArrows = true;
    if (typeof state.ui.hideScore === "undefined") state.ui.hideScore = false;
    if (typeof state.ui.rotated === "undefined") state.ui.rotated = false;
    if (typeof state.ui.hideRail === "undefined") state.ui.hideRail = false;
    if (!state.ui.surface) state.ui.surface = "hard";
    if (!state.ui.chartPlayer) state.ui.chartPlayer = "A";
    if (!state.ui.saveLoadMode) state.ui.saveLoadMode = "save";
    if (state.point){ if (typeof state.point.important === "undefined") state.point.important = false; if (typeof state.point.importantNote === "undefined") state.point.importantNote = ""; }
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

function getSavedMatches(){
  try{
    const raw = localStorage.getItem(getSavedMatchesStorageKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    console.error(e);
    return [];
  }
}
function setSavedMatches(arr){
  try{ localStorage.setItem(getSavedMatchesStorageKey(), JSON.stringify(arr||[])); }
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
        <button class="chip warn" type="button" data-act="del">${tr("Borrar","Delete")}</button>
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

function setCurrentServer(p){
  if (!p || (p!=="A" && p!=="B")) return;
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
    important: false,
    importantNote: "",
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
    if (hint) hint.textContent = `SAQUE (${p.server}) · lado ${p.side} · toca T/C/W`;
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
  // Singles-only playable areas aligned to the inner singles lines of the court image.
  // Rally grids span each half from baseline to net, constrained to singles sidelines.
  rallyTop: { left:.25, top:.11, width:.50, height:.39 },    // B side (upper singles half)
  rallyBottom: { left:.25, top:.50, width:.50, height:.39 }, // A side (lower singles half)
  // Serve boxes restored to the original service-box bounds used before v2.85.
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

function pointNormFromEvent(evt, el){
  if (!evt || !el) return centerNormFromEl(el);
  const court = $("#court");
  if (!court) return centerNormFromEl(el);
  const cr = court.getBoundingClientRect();
  const xClient = (typeof evt.clientX === "number") ? evt.clientX : ((evt.touches && evt.touches[0] && evt.touches[0].clientX) || (evt.changedTouches && evt.changedTouches[0] && evt.changedTouches[0].clientX));
  const yClient = (typeof evt.clientY === "number") ? evt.clientY : ((evt.touches && evt.touches[0] && evt.touches[0].clientY) || (evt.changedTouches && evt.changedTouches[0] && evt.changedTouches[0].clientY));
  if (typeof xClient !== "number" || typeof yClient !== "number") return centerNormFromEl(el);
  let x = (xClient - cr.left) / cr.width;
  let y = (yClient - cr.top) / cr.height;
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

function recordArrow({hitter, throughEl, throughNorm=null, isServe=false}){
  const p = state.point;
  if (!p) return;
  if (!p.arrows) p.arrows = [];

  const through = throughNorm || centerNormFromEl(throughEl);
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
    btn.addEventListener("click",(e)=>{ flashTap(btn,e); onRallyTap("top", r, c, btn, e); });
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
    btn.addEventListener("click",(e)=>{ flashTap(btn,e); onRallyTap("bottom", r, c, btn, e); });
    return btn;
  });

  // Serve: represent two boxes (left/right) split into W/C/T or T/C/W so T is always nearest the T, W the most open.
  const serveCell = (side, box, target)=>{
    const btn=document.createElement("div");
    btn.className="serveCell";
    btn.dataset.side=side;
    btn.dataset.box=box; // 0 left, 1 right
    btn.dataset.target=target; // T/C/W
    btn.innerHTML=`<span class="zoneTxt">${target}</span>`;
    btn.style.fontSize="18px";
    btn.style.fontWeight="1200";
    btn.addEventListener("click",(e)=>{ flashTap(btn,e); onServeTap(side, box, target, btn); });
    return btn;
  };

  // top serve area: 1 row, 6 cols
  makeGrid("serveTop", Z.serveTop, 1, 6, (r,c)=>{
    const box = c<3 ? 0 : 1;
    const idx = c%3;
    const target = box===0
      ? (idx===0 ? "W" : (idx===1 ? "C" : "T"))
      : (idx===0 ? "T" : (idx===1 ? "C" : "W"));
    const cell = serveCell("top", box, target);
    cell.dataset.grid = "serveTop";
    return cell;
  });
  makeGrid("serveBottom", Z.serveBottom, 1, 6, (r,c)=>{
    const box = c<3 ? 0 : 1;
    const idx = c%3;
    const target = box===0
      ? (idx===0 ? "W" : (idx===1 ? "C" : "T"))
      : (idx===0 ? "T" : (idx===1 ? "C" : "W"));
    const cell = serveCell("bottom", box, target);
    cell.dataset.grid = "serveBottom";
    return cell;
  });

  renderZonesVisibility();
  applyTapConstraints();
  updateServeLabelPlacement();
}

function updateServeLabelPlacement(){
  const rotated = !!(state.ui && state.ui.rotated);
  document.querySelectorAll("#serveTop .serveCell, #serveBottom .serveCell").forEach(el=>{
    const grid = el.dataset.grid || "";
    const shouldSitAtBottom = rotated ? (grid === "serveTop") : (grid === "serveBottom");
    el.classList.toggle("serveCellBottomLabel", shouldSitAtBottom);
  });
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
  updateServeLabelPlacement();
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

function onRallyTap(side, row, col, el, evt){
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
    meta: { side, row, col, touch: pointNormFromEvent(evt, el) },
    elId: elIdForRally(side, row, col)
  };
  state.point.events.push(ev);
  try { recordArrow({ hitter, throughEl: el, throughNorm: pointNormFromEvent(evt, el), isServe: false }); } catch(e){ console.error(e); }
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
  renderScoreAvatars();

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
    important: !!p.important,
    importantNote: p.importantNote || "",
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
  if (el){
    el.classList.remove("hidden");
    upgradeCloseButtons(el);
    document.body.classList.add("modalOpen");
  }
}
function closeModal(id){
  const el = $(modalSel(id));
  if (el) el.classList.add("hidden");
  if (!document.querySelector(".modal:not(.hidden)") && document.getElementById("finishMenu")?.classList.contains("hidden"))
    document.body.classList.remove("modalOpen");
}

// --- Confirm dialog ---
let __confirmCb = null;
function openConfirm(title, msg, cb){
  __confirmCb = (typeof cb === "function") ? cb : null;
  const t = $("#confirmTitle"); if (t) t.textContent = (title || "CONFIRMAR").toUpperCase();
  const mm = $("#confirmMsg"); if (mm) mm.textContent = (msg || "");
  openModal("#confirmModal");
}
function closeConfirm(){
  closeModal("#confirmModal");
  __confirmCb = null;
}

// --- Player options (serve + handedness) ---
function ensureHanded(){ state.handed = state.handed || { A:"R", B:"R" }; }

function openPlayerModal(pid){
  ensureHanded();
  state.ui = state.ui || {};
  state.ui.playerModalTarget = (pid==="B") ? "B" : "A";
  renderPlayerModal();
  openModal("#playerModal");
}
function closePlayerModal(){ closeModal("#playerModal"); }

function renderPlayerModal(){
  ensureHanded();
  const pid = (state.ui && state.ui.playerModalTarget) ? state.ui.playerModalTarget : "A";
  const title = $("#playerModalTitle");
  const sub = $("#playerModalSub");
  if (title) title.textContent = playerName(pid).toUpperCase();
  if (sub){
    const hand = state.handed[pid] === "L" ? "ZURDO" : "DIESTRO";
    const isSrv = (state.currentServer === pid);
    sub.textContent = (isSrv ? "SERVIDOR ACTUAL · " : "") + hand;
  }
  const bR = $("#optRight"), bL = $("#optLeft"), bS = $("#optServe");
  if (bR) bR.classList.toggle("primary", state.handed[pid] !== "L");
  if (bL) bL.classList.toggle("primary", state.handed[pid] === "L");
  if (bS) bS.classList.toggle("primary", state.currentServer === pid);
}


function openHistory(){
  state.ui = state.ui || {};
  state.ui.historyFiltersOpen = false;
  renderHistory();
  applyHistoryFiltersVisibility();
  openModal("#historyModal");
}
function closeHistory(){ closeModal("#historyModal"); }

function applyHistoryFiltersVisibility(){
  state.ui = state.ui || {};
  const expanded = !!state.ui.historyFiltersOpen;
  const panel = $("#historyFiltersPanel");
  const btn = $("#btnHistoryFiltersToggle");
  if (panel) panel.classList.toggle("hidden", !expanded);
  if (btn){
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    btn.classList.toggle("isOpen", expanded);
  }
}
function toggleHistoryFilters(){
  state.ui = state.ui || {};
  state.ui.historyFiltersOpen = !state.ui.historyFiltersOpen;
  applyHistoryFiltersVisibility();
  persist();
}

function applyStatsFiltersVisibility(){
  state.ui = state.ui || {};
  const expanded = !!state.ui.statsFiltersOpen;
  const panel = $("#statsFiltersPanel");
  const btn = $("#btnStatsFiltersToggle");
  if (panel) panel.classList.toggle("hidden", !expanded);
  if (btn){
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    btn.classList.toggle("isOpen", expanded);
  }
}
function toggleStatsFilters(){
  state.ui = state.ui || {};
  state.ui.statsFiltersOpen = !state.ui.statsFiltersOpen;
  applyStatsFiltersVisibility();
  persist();
}

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
  if (title) title.textContent = isEn() ? `Point ${p.n} · Won by ${winName}` : `Punto ${p.n} · Gana ${winName}`;

  const reasonLine = (p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : "");
  if (sub) sub.textContent = `${formatSnapshot(p.snapshot)}${reasonLine ? " · " + reasonLine : ""}`;

  const rotated = !!(state.ui && state.ui.pvRotated);
  const topName = $("#pvTopName");
  const botName = $("#pvBottomName");
  if (topName) topName.textContent = rotated ? (nameA || "Jugador A") : (nameB || "Jugador B");
  if (botName) botName.textContent = rotated ? (nameB || "Jugador B") : (nameA || "Jugador A");
  const pvCourt = $("#pvCourt");
  if (pvCourt) pvCourt.classList.toggle("rotated", rotated);

  // surface
  applySurface();

  // events
  const evs = (p.events||[]);
  const pvEvents = $("#pvEvents");
  if (pvEvents){
    if (!evs.length){
      pvEvents.innerHTML = `<div class="muted">${tr("Sin eventos","No events")}</div>`;
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
  state.ui = state.ui || {};
  state.ui.statsFiltersOpen = false;
  openModal("#statsModal");
  try{ buildStatsSetOptions(); renderStats(); applyStatsFiltersVisibility(); }
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
  if (sub) sub.textContent = (state.lang==="en") ? `Cumulative balance · Perspective: ${name}` : `Balance acumulado · Perspectiva: ${name}`;

  const points = Array.isArray(state.matchPoints) ? state.matchPoints.slice() : [];
  const scoreProg = simulateScoreProgress(points);

  const canvas = $("#chartsCanvas");
  if (!canvas) return;
  const chartWrap = canvas.parentElement;
  if (chartWrap && !chartWrap.dataset.zoomBound){
    chartWrap.dataset.zoomBound = "1";
    chartWrap.style.cursor = "zoom-in";
    chartWrap.title = state.lang==="en" ? "Tap to expand chart" : "Toca para ampliar el gráfico";
    chartWrap.addEventListener("click", ()=> openChartsZoom());
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Scrollable width (match sample): one tick per point
  const wrap = canvas.parentElement;
  const viewW = Math.max(320, wrap ? wrap.getBoundingClientRect().width : 320);
  const dpr = window.devicePixelRatio || 1;

  const padL=54, padR=18, padT=14, padB=60;
  const step = 78;
  const plotW = step * Math.max(1, (points.length-1));
  const W = Math.max(viewW, padL + padR + plotW);
  const H = 320;

  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const cs = getComputedStyle(document.documentElement);
  const cAccent2 = (cs.getPropertyValue("--accent2") || "#39D5FF").trim();
  const cGood = (cs.getPropertyValue("--good") || "#2EE59D").trim();
  const cBad = (cs.getPropertyValue("--bad") || "#FF3B5C").trim();
  const cGold = (cs.getPropertyValue("--accent") || "#FFD400").trim();

  ctx.clearRect(0,0,W,H);

  if (!points.length){
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText(state.lang==="en" ? "No points yet. Track points to see the chart." : "No hay puntos todavía. Registra puntos para ver el gráfico.", 16, 42);
    const strip=$("#pointStrip"); if (strip) strip.innerHTML = "";
    const scoresEl=$("#chartsScores"); if (scoresEl) scoresEl.innerHTML = "";
    persist();
    return;
  }

  // Series: cumulative balance (+1/-1)
  let y=0;
  const ys=[];
  const wonFlags=[];
  const flagsArr=[];
  for (let i=0;i<points.length;i++){
    const p=points[i];
    const won = isPointWonBy(p, persp);
    wonFlags.push(won);
    y += won ? 1 : -1;
    ys.push(y);
    flagsArr.push(pointContextFlags(p, persp));
  }

  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const yPad = (maxY-minY) < 6 ? 3 : 2;
  const yMin = minY - yPad;
  const yMax = maxY + yPad;

  const plotH = H - padT - padB;
  const xAt = (i)=> padL + i*step;
  const yAt = (val)=> padT + (1 - ((val - yMin)/(yMax - yMin))) * plotH;

  // Grid
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "700 11px Inter, system-ui, sans-serif";

  const gridLines = 5;
  for (let g=0; g<=gridLines; g++){
    const t = g / gridLines;
    const yy = padT + t*plotH;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(W-padR, yy);
    ctx.stroke();
    const val = Math.round(yMax - t*(yMax-yMin));
    ctx.fillText(String(val), 12, yy+4);
  }

  // Baseline y=0
  const y0 = yAt(0);
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.beginPath();
  ctx.moveTo(padL, y0);
  ctx.lineTo(W-padR, y0);
  ctx.stroke();

  // Game/set boundaries
  const bounds = computeBoundaries(points);
  for (const b of bounds){
    const xx = xAt(b.i) + step/2;
    ctx.strokeStyle = b.kind==="set" ? "rgba(255,212,0,.30)" : "rgba(57,213,255,.16)";
    ctx.beginPath();
    ctx.moveTo(xx, padT);
    ctx.lineTo(xx, padT+plotH);
    ctx.stroke();

    // Small label at bottom
    ctx.fillStyle = b.kind==="set" ? "rgba(255,212,0,.85)" : "rgba(57,213,255,.70)";
    ctx.font = "900 10px Inter, system-ui, sans-serif";
    ctx.fillText(b.kind==="set" ? "SET" : "G", xx-8, H-18);
  }

  // Trend line
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

  // Dots + rings
  for (let i=0;i<ys.length;i++){
    const xx=xAt(i);
    const yy=yAt(ys[i]);
    const won = wonFlags[i];
    ctx.beginPath();
    ctx.fillStyle = won ? cGood : cBad;
    ctx.shadowColor = won ? cGood : cBad;
    ctx.shadowBlur = 8;
    ctx.arc(xx,yy,4.2,0,Math.PI*2);
    ctx.fill();

    if (flagsArr[i].important){
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,212,0,.75)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(xx,yy,7.4,0,Math.PI*2);
      ctx.stroke();
    }
  }

  // X-axis labels: score after each point (as in the sample)
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,.70)";
  ctx.font = "800 11px Inter, system-ui, sans-serif";

  // start label
  ctx.fillText("0-0", padL-28, H-8);
  for (let i=0;i<points.length;i++){
    const lab = (scoreProg[i]?.after || "");
    const xx = xAt(i);
    // keep short
    const s = String(lab).replace(/^TB\s+/,'TB ');
    ctx.fillText(s, xx-18, H-8);
  }

  // Strip dots (premium timeline)
  const strip = $("#pointStrip");
  if (strip){
    strip.innerHTML = "";
    points.forEach((p, i)=>{
      const won = wonFlags[i];
      const f = flagsArr[i];
      const dot = document.createElement("div");
      dot.className = "stripDot " + (won ? "win" : "lose") + " " + (f.isServe ? "serve" : "ret") + (f.important ? " important" : "");
      const winnerName = playerName(p.winner);
      const afterScore = scoreProg[i]?.after || "";
      dot.title = `Punto ${p.n} · ${won?"+1":"-1"} · ${winnerName} · ${afterScore}`;
      dot.addEventListener("click", ()=> openPointViewer(p));
      strip.appendChild(dot);
    });
  }

  // Score timeline row (0-0, 0-15...) horizontally scrollable
  const scoresEl = $("#chartsScores");
  if (scoresEl){
    scoresEl.innerHTML = "";
    const makePill = (label, wonClass, title)=>{
      const pill = document.createElement("div");
      pill.className = "scorePill " + (wonClass||"");
      pill.innerHTML = `<span class="miniDot"></span><b>${escapeHtml(label)}</b>`;
      pill.title = title || label;
      return pill;
    };

    const startP = makePill("0-0", "", state.lang==="en"?"Start 0-0":"Inicio 0-0");
    startP.querySelector('.miniDot').style.background = 'rgba(255,255,255,.55)';
    scoresEl.appendChild(startP);

    points.forEach((p,i)=>{
      const won = wonFlags[i];
      const after = scoreProg[i]?.after || "";
      const pill = makePill(after, won?"win":"lose", `P${p.n} · ${after}`);
      pill.addEventListener('click', ()=> openPointViewer(p));
      scoresEl.appendChild(pill);
    });
  }

  persist();
}




function renderChartsZoom(){
  const canvas = $("#chartsZoomCanvas");
  if (!canvas) return;
  const sel = $("#chartsPlayer");
  const persp = sel ? sel.value : ((state.ui && state.ui.chartPlayer) || "A");
  const points = Array.isArray(state.matchPoints) ? state.matchPoints.slice() : [];
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const rectW = Math.max(320, wrap ? wrap.getBoundingClientRect().width : 320);
  const rectH = Math.max(320, Math.min(window.innerHeight * 0.58, 520));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const padL=42, padR=14, padT=16, padB=48;
  const steps = Math.max(1, points.length - 1);
  const usableW = Math.max(220, rectW - padL - padR);
  const step = Math.max(10, usableW / steps);
  const W = padL + padR + (step * steps);
  const H = rectH;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const cs = getComputedStyle(document.documentElement);
  const cAccent2 = (cs.getPropertyValue("--accent2") || "#39D5FF").trim();
  const cGood = (cs.getPropertyValue("--good") || "#2EE59D").trim();
  const cBad = (cs.getPropertyValue("--bad") || "#FF3B5C").trim();
  ctx.clearRect(0,0,W,H);
  if (!points.length){
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.font = "700 14px Inter, system-ui, sans-serif";
    ctx.fillText(state.lang==="en" ? "No points yet." : "No hay puntos todavía.", 16, 36);
    return;
  }
  const ys=[]; const wonFlags=[];
  let y=0;
  for (let i=0;i<points.length;i++){
    const won = isPointWonBy(points[i], persp);
    wonFlags.push(won);
    y += won ? 1 : -1;
    ys.push(y);
  }
  const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
  const yPad = (maxY-minY) < 6 ? 3 : 2;
  const yMin = minY - yPad, yMax = maxY + yPad;
  const plotH = H - padT - padB;
  const xAt = i => padL + i*step;
  const yAt = v => padT + (1 - ((v - yMin)/(yMax - yMin))) * plotH;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  for (let g=0; g<=5; g++){
    const yy = padT + (g/5)*plotH;
    ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(W-padR,yy); ctx.stroke();
  }
  const y0 = yAt(0);
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.beginPath(); ctx.moveTo(padL,y0); ctx.lineTo(W-padR,y0); ctx.stroke();
  ctx.save();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = cAccent2;
  ctx.shadowColor = cAccent2;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ys.forEach((v,i)=>{ const xx=xAt(i), yy=yAt(v); if(i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);});
  ctx.stroke();
  ctx.restore();
  ys.forEach((v,i)=>{
    const xx=xAt(i), yy=yAt(v), won=wonFlags[i];
    ctx.beginPath();
    ctx.fillStyle = won ? cGood : cBad;
    ctx.shadowColor = won ? cGood : cBad;
    ctx.shadowBlur = 10;
    ctx.arc(xx,yy,4.8,0,Math.PI*2); ctx.fill();
  });
}
function openChartsZoom(){
  renderCharts();
  openModal("#chartsZoomModal");
  setTimeout(renderChartsZoom, 30);
}
function closeChartsZoom(){ closeModal("#chartsZoomModal"); }

/** FINISH MENU (tennis ball) **/
function refreshFinishMenuMode(){
  const p = state.point;
  const serveGrp = $("#finishServeGroup");
  const rallyGrp = $("#finishRallyGroup");
  const isServe = !!p && p.phase === "serve";
  if (serveGrp) serveGrp.classList.toggle("hidden", !isServe);
  if (rallyGrp) rallyGrp.classList.toggle("hidden", isServe);
}

function syncFinishImportantUI(){
  const chk = document.getElementById("pointImportantChk");
  const label = document.querySelector("label[for='pointImportantChk']");
  const checked = !!(state.point && state.point.important);
  if (chk) chk.checked = checked;
  if (label) label.classList.toggle("isChecked", checked);
}
function openFinishMenu(){
  setFinishMode(finishMode);
  refreshFinishMenuMode();
  syncFinishImportantUI();
  const m=$("#finishMenu");
  if (!m) return;
  m.classList.remove("hidden");
  document.body.classList.add("modalOpen");
}
function closeFinishMenu(){
  closeAdvStep2();
  const m=$("#finishMenu");
  if (!m) return;
  m.classList.add("hidden");
  if (!document.querySelector(".modal:not(.hidden)")) document.body.classList.remove("modalOpen");
}
function toggleFinishMenu(){
  const m=$("#finishMenu");
  if (!m) return;
  if (m.classList.contains("hidden")) openFinishMenu(); else closeFinishMenu();
}

// --- Avanzado (menú bola) ---
let finishMode = (()=>{
  try { return localStorage.getItem(getFinishModeKey()) || "normal"; }
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
  try { localStorage.setItem(getFinishModeKey(), mode); } catch(e){}
  const tn=$("#tabNormal"), ta=$("#tabAdvanced");
  if (tn && ta){
    tn.classList.toggle("active", mode==="normal");
    ta.classList.toggle("active", mode==="advanced");
    tn.setAttribute("aria-selected", mode==="normal" ? "true" : "false");
    ta.setAttribute("aria-selected", mode==="advanced" ? "true" : "false");
  }
  // toggle UI blocks
  const fm = $("#finishMenu");
  if (fm){
    fm.classList.toggle("modeNormal", mode==="normal");
    fm.classList.toggle("modeAdvanced", mode==="advanced");
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

function finishGain(winner){
  // generic point won (no winner/volea), used for "Gana"
  const offender = winner;
  const reason = `Gana (${offender})`;

  if (finishMode==="advanced"){
    // ask FH/BH in advanced
    openAdvStep2({
      kind: "GAIN",
      offender,
      winner,
      reason,
      customTitle: "Gana con...",
      customOpts: [
        { key:"FH", label:"Derecha" },
        { key:"BH", label:"Revés" },
      ]
    });
    return false;
  }

  if (!state.point) initPoint();
  state.point.finishDetail = { mode:"normal", kind:"GAIN", offender };
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
  const strokeMap = isEn() ? { FH:"Forehand", BH:"Backhand", VOL:"Volley", SM:"Smash", OTHER:"Other" } : { FH:"Derecha", BH:"Revés", VOL:"Volea", SM:"Smash", OTHER:"Otro" };
  const winMap = isEn() ? { ACE:"Ace", FH:"Forehand", BH:"Backhand", VOL_FH:"Forehand volley", VOL_BH:"Backhand volley", PASS:"Passing", DROP:"Drop shot", VOL:"Volley", WIN:"Winner", OTHER:"Other" } : { ACE:"Ace", FH:"Derecha", BH:"Revés", VOL_FH:"Volea derecha", VOL_BH:"Volea revés", PASS:"Passing", DROP:"Dejada", VOL:"Volea", WIN:"Winner", OTHER:"Otro" };
  if (fd.kind==="WINNER" && fd.winnerType) return winMap[fd.winnerType] || fd.winnerType;
  if ((fd.kind==="UE" || fd.kind==="FE" || fd.kind==="GAIN") && fd.strokeType) return strokeMap[fd.strokeType] || fd.strokeType;
  return "";
}

function renderHistory(){
  const sub=$("#historySub");
  if (sub) sub.textContent = `${state.matchPoints.length} ${tr("puntos","points")}`;

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
    list.innerHTML = `<div class="historyItem"><div class="historyItemTitle">${tr("No hay puntos.","No points yet.")}</div><div class="historyItemMeta">${tr("Cambia filtros o registra puntos.","Change filters or track points.")}</div></div>`;
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
          <div class="historyGameTitle">${tr("Juego","Game")} ${info.num || "—"}</div>
          <div class="historyGameMeta">${escapeHtml(meta)} · ${pts.length} ${tr("punto(s)","point(s)")}</div>
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
            <div class="historyItemTitle">${p.important ? `<span class="miniFlag" title="${tr("Punto importante","Important point")}"></span>` : ""}${tr("Punto","Point")} ${p.n}</div>
            <div class="historyItemMeta">${escapeHtml(formatSnapshot(p.snapshot))}<br/>${escapeHtml((p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : ""))}</div>
          </div>
          <span class="pill ${p.winner==="A"?"pillGood":"pillWarn"}">${tr("Gana","Wins")} ${escapeHtml(winName)}</span>
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
        <div class="modalTitle" style="margin:0;">${p.important ? `<span class="miniFlag large" title="${tr("Punto importante","Important point")}"></span>` : ""}${isEn() ? `Point ${p.n} · Won by ${escapeHtml(winName)}` : `Punto ${p.n} · Gana ${escapeHtml(winName)}`}</div>
        <div class="modalSub" style="margin-top:4px;">
          ${escapeHtml(formatSnapshot(p.snapshot))}<br/>
          ${escapeHtml((p.reason||"") + (finishDetailLabel(p.finishDetail) ? " · " + finishDetailLabel(p.finishDetail) : ""))}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
        <div class="pill ${p.winner==="A"?"pillGood":"pillWarn"}">${escapeHtml(winName)}</div>
        <div class="historyDetailTools">
          <button class="chip" id="btnHistToggleArrows" type="button">${showArrows ? tr("Flechas: ON","Arrows: ON") : tr("Flechas: OFF","Arrows: OFF")}</button>
          <button class="chip" id="btnHistReplayArrows" type="button" ${hasArrows ? "" : "disabled"}>${tr("Reproducir","Replay")}</button>
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
      ${hasArrows ? "" : `<div class='muted' style='margin-top:8px;'>${tr("Este punto no tiene flechas.","This point has no arrows.")}</div>`}
    </div>
  `;

  const evs = (p.events||[]);
  const lines = evs.map((e,i)=>`<div class="mono" style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,.08);">
    <b>${i+1}.</b> ${playerNameSafe(e.player)} - ${escapeHtml(e.code)}
  </div>`).join("");
  const noteBlock = p.important ? `<div class="pointNoteBlock"><label><b>${tr("Nota del punto importante","Important point note")}</b><textarea id="importantPointNote" rows="4" placeholder="${tr("Escribe una nota sobre este punto...","Write a note about this point...")}">${escapeHtml(p.importantNote || "")}</textarea></label></div>` : "";

  detail.innerHTML = header + courtBlock + `<div>${lines || `<div class='muted'>${tr("Sin eventos","No events")}</div>`}</div>` + noteBlock;

  // bind tools
  const btnT=$("#btnHistToggleArrows");
  if (btnT){
    btnT.onclick = ()=>{
      state.ui.showHistoryArrows = !state.ui.showHistoryArrows;
      persist();
      renderHistoryDetail(p);
    };
  }
  const noteInput=$("#importantPointNote");
  if (noteInput){
    noteInput.addEventListener("input", ()=>{
      p.importantNote = noteInput.value || "";
      const idx = state.matchPoints.findIndex(x=>x.n===p.n);
      if (idx >= 0){ state.matchPoints[idx].importantNote = p.importantNote; persist(); renderHistory(); }
    });
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
    const targetEvs = serveEvs.filter(e=>e?.meta?.target && ["T","C","W","A"].includes(e.meta.target));
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

  ensureHanded();
  const nameA = state.names.A + (state.handed.A==="L" ? " (Z)" : "");
  const nameB = state.names.B + (state.handed.B==="L" ? " (Z)" : "");

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
let __menuScrollY = 0;
function setMenuOpen(open){
  __menuOpen = !!open;
  const drawer = $("#drawerMenu");
  const overlay = $("#menuOverlay");

  if (__menuOpen){
    __menuScrollY = window.scrollY || 0;
    document.body.classList.add("menuOpen");
    document.body.style.top = `-${__menuScrollY}px`;
  } else {
    document.body.classList.remove("menuOpen");
    document.body.style.top = "";
    try{ window.scrollTo(0, __menuScrollY); }catch(_){}
  }

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
  document.body.classList.remove("modalOpen");
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
  try{ updateServeLabelPlacement(); }catch(_){ }
  try{ applyTapConstraints(); }catch(_){ }
  // ensure arrows reflect the current orientation
  renderLiveArrows(false);
}
function toggleRotation(){
  state.ui.rotated = !state.ui.rotated;
  applyRotation();
  persist();
}

// --- Court surface ---
const SURFACES = [
  { id:'hard', img:'assets/court_top_view.png', labelKey:'hard' },
  { id:'clay', img:'assets/court_clay.png', labelKey:'clay' },
  { id:'grass', img:'assets/court_grass.png', labelKey:'grass' },
  { id:'ao', img:'assets/court_ao.png', labelKey:'ao' },
];
function surfaceById(id){ return SURFACES.find(s=>s.id===id) || SURFACES[0]; }
function applySurface(){
  state.ui = state.ui || {};
  if (!state.ui.surface) state.ui.surface = 'hard';
  const s = surfaceById(state.ui.surface);
  const img = document.getElementById('courtImg');
  if (img) img.src = s.img;
  const pvImg = document.getElementById('pvCourtImg');
  if (pvImg) pvImg.src = s.img;
}
function openSurface(){
  const grid = document.getElementById('surfaceGrid');
  if (grid){
    grid.innerHTML = '';
    SURFACES.forEach(s=>{
      const b = document.createElement('button');
      b.type='button';
      b.className = 'surfaceOpt' + ((state.ui.surface||'hard')===s.id ? ' active' : '');
      b.innerHTML = `
        <div class="surfaceThumb"><img src="${s.img}" alt="${t(s.labelKey)}"></div>
        <div class="surfaceName">${t(s.labelKey)}</div>
      `;
      b.addEventListener('click', ()=>{
        state.ui.surface = s.id;
        state.meta = state.meta || {};
        state.meta.surface = s.id;
        persist();
        applySurface();
        openSurface();
      });
      grid.appendChild(b);
    });
  }
  openModal('#surfaceModal');
}
function closeSurface(){ closeModal('#surfaceModal'); }

function renderCourtNames(){
  const t = $("#baselineTop");
  const b = $("#baselineBottom");
  const nameB = (state.names && state.names.B) ? state.names.B : "Jugador B";
  const nameA = (state.names && state.names.A) ? state.names.A : "Jugador A";
  if (t) t.textContent = nameB;
  if (b) b.textContent = nameA;

  // Finish menu headers
  const fA = $("#finishNameA");
  const fB = $("#finishNameB");
  if (fA) fA.textContent = nameA;
  if (fB) fB.textContent = nameB;
}

function renderMeta(){
  state.meta = state.meta || { event:"", venue:"", date:"", time:"", conditions:"", notes:"" };
    state.handed = state.handed || { A:"R", B:"R" };
  const m = state.meta;
  const setVal = (id, v)=>{ const el=document.getElementById(id); if (el && el.value !== (v||"")) el.value = v||""; };
  setVal('metaEvent', m.event);
  setVal('metaVenue', m.venue);
  setVal('metaDate', m.date);
  setVal('metaTime', m.time);
  setVal('metaConditions', m.conditions);
  const notes = document.getElementById('metaNotes');
  if (notes && notes.value !== (m.notes||"")) notes.value = m.notes||"";
}

function wireMeta(){
  const bind=(id,key)=>{
    const el=document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', ()=>{
      state.meta = state.meta || {};
      state.meta[key] = el.value || "";
      persist();
    });
  };
  bind('metaEvent','event');
  bind('metaVenue','venue');
  bind('metaDate','date');
  bind('metaTime','time');
  bind('metaConditions','conditions');
  bind('metaNotes','notes');
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
  applyI18n();
  applySurface();
  renderMeta();
  applyScoreVisibility();
  applyRailVisibility();
  applyRotation();
  renderCourtNames();
  renderScore();
  renderPoint();
  updateWorkspaceBar();
  renderDashboard();
  renderPlayerLibrary();
  renderAccountModal();
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
  on("btnNew","click", ()=> openConfirm("Nuevo partido", "Se reiniciará el marcador y el historial del partido actual.", ()=>{ newMatch(); toast("✅ Nuevo partido"); }));
  on("btnFinish","click", ()=> openConfirm("Finalizar partido", "¿Quieres finalizar el partido? Podrás reanudarlo desde el botón Reanudar.", ()=>{ finishMatch(); }));
  on("btnResume","click", ()=> openConfirm("Reanudar partido", "¿Quieres reanudar el partido?", ()=>{ resumeMatch(); }));

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
  on("btnSurface","click", ()=>openFromMenu(openSurface));
  on("btnLanguage","click", ()=>openFromMenu(()=>openModal("#languageModal")));
  on("btnInfo","click", ()=>openFromMenu(()=>openModal("#infoModal")));
  on("btnBackHome","click", ()=>openFromMenu(()=>{ showSplashAgain(); }));
  on("btnCloseSurface","click", closeSurface);
  on("btnCloseLanguage","click", ()=>closeModal("#languageModal"));
  on("btnCloseInfo","click", ()=>closeModal("#infoModal"));
  on("btnLangES","click", ()=>{ closeModal("#languageModal"); setLanguage("es"); });
  on("btnLangEN","click", ()=>{ closeModal("#languageModal"); setLanguage("en"); });

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
  on("btnCloseChartsZoom","click", closeChartsZoom);
  on("btnCloseExport","click", closeExport);

  // confirm modal
  on("btnCloseConfirm","click", closeConfirm);
  on("btnConfirmCancel","click", closeConfirm);
  on("btnConfirmOk","click", ()=>{ const cb = __confirmCb; closeConfirm(); try{ cb && cb(); }catch(e){ console.error(e); } });

  // player modal
  on("btnClosePlayerModal","click", closePlayerModal);
  on("optServe","click", ()=>{ const pid=(state.ui&&state.ui.playerModalTarget)||"A"; setCurrentServer(pid); closePlayerModal(); });
  on("optRight","click", ()=>{ const pid=(state.ui&&state.ui.playerModalTarget)||"A"; ensureHanded(); state.handed[pid]="R"; persist(); renderPlayerModal(); toast("✅ " + playerName(pid) + " · Diestro"); });
  on("optLeft","click", ()=>{ const pid=(state.ui&&state.ui.playerModalTarget)||"A"; ensureHanded(); state.handed[pid]="L"; persist(); renderPlayerModal(); toast("✅ " + playerName(pid) + " · Zurdo"); });



  // (Eliminado) Tema y modo normal

// cerrar menú al elegir una opción (las acciones que viven dentro del menú)
["btnSaveMatch","btnLoadMatch","btnGameMode","btnSurface","btnLanguage","btnInfo","btnBackHome","btnHistory","btnAnalytics","btnStats","btnCharts","btnExport","btnDashboardMenu","btnPlayerLibraryMenu","btnAccountMenu","btnHelpCenter","btnLegal"].forEach(id=>{
  const el = $("#"+id);
  if (el) el.addEventListener("click", ()=>setMenuOpen(false));
});


  // cambiar servidor manualmente (solo antes de iniciar el punto)
  const rowA = $("#tvRowA"), rowB = $("#tvRowB");
  const sA = $("#serveA"), sB = $("#serveB");
  if (rowA) { rowA.style.cursor="pointer"; rowA.title="Toca para poner servidor A"; rowA.addEventListener("click", ()=>setCurrentServer("A")); }
  if (rowB) { rowB.style.cursor="pointer"; rowB.title="Toca para poner servidor B"; rowB.addEventListener("click", ()=>setCurrentServer("B")); }

  // Player options (serve + handedness)
  const bindPlayerBall = (el, pid)=>{
    if (!el) return;
    el.style.pointerEvents="auto";
    el.style.cursor="pointer";
    el.title="Opciones de jugador";
    el.addEventListener("click", (e)=>{
      try{ e.preventDefault(); }catch(_){}
      try{ e.stopPropagation(); }catch(_){}
      openPlayerModal(pid);
    }, {passive:false});
  };
  bindPlayerBall(sA, "A");
  bindPlayerBall(sB, "B");


  // finish ball menu
  on("finishBall","click", toggleFinishMenu);
  on("finishMenuClose","click", ()=>{ closeFinishMenu(); closeAdvStep2(); });
  on("pointImportantChk","change", (e)=>{
    if (!state.point) initPoint();
    state.point.important = !!e.target.checked;
    syncFinishImportantUI();
  });
  const importantRow = document.querySelector(".finishImportantRow");
  const importantLabel = document.querySelector("label[for='pointImportantChk']");
  const importantChk = document.getElementById("pointImportantChk");
  const toggleImportantPoint = (ev)=>{
    if (!importantChk) return;
    if (ev){ try{ ev.preventDefault(); }catch(_){ } try{ ev.stopPropagation(); }catch(_){ } }
    if (!state.point) initPoint();
    importantChk.checked = !importantChk.checked;
    state.point.important = !!importantChk.checked;
    syncFinishImportantUI();
  };
  if (importantRow) importantRow.addEventListener("click", (ev)=>{
    if (ev.target === importantChk) return;
    toggleImportantPoint(ev);
  }, {passive:false});
  if (importantLabel) importantLabel.addEventListener("click", (ev)=>{
    if (ev.target === importantChk) return;
    toggleImportantPoint(ev);
  }, {passive:false});
  // cerrar al tocar fuera (backdrop)
  const fm = $("#finishMenu");
  if (fm) fm.addEventListener("click", (e)=>{
    try{ e.preventDefault(); }catch(_){}
    try{ e.stopPropagation(); }catch(_){}
    if (e.target === fm) closeFinishMenu();
  }, {passive:false});
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

  // End point actions inside menu (re-designed)
  // NORMAL
  bindMenu("mUeA_n", ()=> finishAction("UE","A"));
  bindMenu("mGainA_n", ()=> finishGain("A"));
  bindMenu("mWinA_n", ()=> finishAction("WINNER","A"));

  bindMenu("mUeB_n", ()=> finishAction("UE","B"));
  bindMenu("mGainB_n", ()=> finishGain("B"));
  bindMenu("mWinB_n", ()=> finishAction("WINNER","B"));

  // ADVANCED
  bindMenu("mUeA_a", ()=> finishAction("UE","A"));
  bindMenu("mFeA_a", ()=> finishAction("FE","A"));
  bindMenu("mGainA_a", ()=> finishGain("A"));
  bindMenu("mWinA_a", ()=> finishAction("WINNER","A"));
  bindMenu("mVolA_a", ()=> finishVolley("A"));

  bindMenu("mUeB_a", ()=> finishAction("UE","B"));
  bindMenu("mFeB_a", ()=> finishAction("FE","B"));
  bindMenu("mGainB_a", ()=> finishGain("B"));
  bindMenu("mWinB_a", ()=> finishAction("WINNER","B"));
  bindMenu("mVolB_a", ()=> finishVolley("B"));

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
  on("btnHistoryFiltersToggle","click", toggleHistoryFilters);
  on("btnStatsFiltersToggle","click", toggleStatsFilters);

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
  ["saveLoadModal","gameModeModal","surfaceModal","languageModal","infoModal","historyModal","pointViewerModal","analyticsModal","statsModal","chartsModal","exportModal","dashboardModal","playersModal","accountModal","helpModal","legalModal","onboardingModal"].forEach(mid=>{
    const m = $("#"+mid);
    if (!m) return;
    m.addEventListener("click", (e)=>{
      if (e.target === m){
        // backdrop click only
        try{ e.preventDefault(); }catch(_){}
        try{ e.stopPropagation(); }catch(_){}
        try{ closeModal(mid); }catch(_){ }
      }
    }, {passive:false});
  });

  window.addEventListener("resize", ()=>{
    try{ if (!$("#chartsModal")?.classList.contains("hidden")) renderCharts(); }catch(_){ }
    try{ if (!$("#chartsZoomModal")?.classList.contains("hidden")) renderChartsZoom(); }catch(_){ }
  });

  // keyboard shortcuts
  window.addEventListener("keydown", (e)=>{
    if (e.key==="Escape"){
      ["saveLoadModal","gameModeModal","surfaceModal","languageModal","infoModal","historyModal","pointViewerModal","analyticsModal","statsModal","chartsModal","exportModal","dashboardModal","playersModal","accountModal","helpModal","legalModal","onboardingModal","finishMenu"].forEach(id=>{
        const el=$("#"+id);
        if (el && !el.classList.contains("hidden")) el.classList.add("hidden");
      });
      setMenuOpen(false);
      clearReplay();
      setSheetOpen(false);
      document.body.classList.remove("modalOpen");
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


function hashPassword(text){
  const source = String(text || "");
  if (!window.crypto || !window.crypto.subtle){
    return Promise.resolve(btoa(unescape(encodeURIComponent(source))));
  }
  return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)).then(buf =>
    Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("")
  );
}
function setFeedback(id, msg, tone=""){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || "";
  el.className = "authFeedback" + (tone ? ` ${tone}` : "");
}
function switchAuthTab(tab){
  const login = tab !== "signup";
  $("#tabAuthLogin")?.classList.toggle("active", login);
  $("#tabAuthSignup")?.classList.toggle("active", !login);
  $("#authLoginPane")?.classList.toggle("hidden", !login);
  $("#authSignupPane")?.classList.toggle("hidden", login);
}
function showAuthPortal(){
  $("#authPortal")?.classList.remove("hidden");
  document.body.classList.add("unauth");
  document.body.classList.remove("isAuthenticated");
  setFeedback("loginFeedback", "");
  setFeedback("signupFeedback", "");
}
function hideAuthPortal(){
  $("#authPortal")?.classList.add("hidden");
  document.body.classList.remove("unauth");
  document.body.classList.add("isAuthenticated");
}
function getPlayerProfiles(){ return safeReadJSON(localStorage, getProfilesStorageKey(), []) || []; }
function setPlayerProfiles(arr){ return safeWriteJSON(localStorage, getProfilesStorageKey(), arr || []); }
function setProfilePhotoPreview(dataUrl="", name=""){
  const preview = $("#profilePhotoPreview");
  const hidden = $("#profilePhotoData");
  if (hidden) hidden.value = dataUrl || "";
  if (!preview) return;
  const label = escapeHtml((name || "Jugador").trim().charAt(0) || "J");
  if (dataUrl){
    preview.innerHTML = `<img src="${dataUrl}" alt="Foto del jugador">`;
    preview.classList.add("hasPhoto");
  } else {
    preview.innerHTML = `<span>${label}</span>`;
    preview.classList.remove("hasPhoto");
  }
}
function bindProfilePhotoInput(){
  const input = $("#profilePhotoInput");
  const removeBtn = $("#btnRemoveProfilePhoto");
  if (input && input.dataset.bound !== "1"){
    input.dataset.bound = "1";
    input.addEventListener("change", ()=>{
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ()=> setProfilePhotoPreview(String(reader.result || ""), $("#profileName")?.value || "Jugador");
      reader.readAsDataURL(file);
    });
  }
  if (removeBtn && removeBtn.dataset.bound !== "1"){
    removeBtn.dataset.bound = "1";
    removeBtn.addEventListener("click", ()=>{
      if (input) input.value = "";
      setProfilePhotoPreview("", $("#profileName")?.value || "Jugador");
    });
  }
  $("#profileName")?.addEventListener("input", ()=>{
    if (!$("#profilePhotoData")?.value) setProfilePhotoPreview("", $("#profileName")?.value || "Jugador");
  });
}
function inferProfileSideFromMatch(profile, matchState){
  if (!profile || !matchState) return null;
  const assignments = matchState.playerAssignments || {};
  if (assignments.A === profile.id) return "A";
  if (assignments.B === profile.id) return "B";
  const name = String(profile.name || "").trim().toLowerCase();
  if (!name) return null;
  if (String(matchState.names?.A || "").trim().toLowerCase() === name) return "A";
  if (String(matchState.names?.B || "").trim().toLowerCase() === name) return "B";
  return null;
}
function inferSavedMatchResult(matchState, side){
  const sets = matchState?.sets || {A:0,B:0};
  const games = matchState?.games || {A:0,B:0};
  const finished = !!matchState?.matchFinished;
  if (finished){
    const winner = (sets.A !== sets.B) ? (sets.A > sets.B ? "A" : "B") : (games.A !== games.B ? (games.A > games.B ? "A" : "B") : null);
    if (winner) return { status: winner === side ? "Victoria" : "Derrota", tone: winner === side ? "good" : "bad" };
  }
  return { status: "Sesión guardada", tone: "ghost" };
}
function buildPlayerProfileDataset(profile){
  const saved = getSavedMatches().slice().sort((a,b)=>(b.when||0)-(a.when||0));
  const history = [];
  const totals = {
    matches:0, completed:0, wins:0, losses:0, totalPoints:0, pointsWon:0,
    servePoints:0, servePointsWon:0, firstIn:0, firstInWon:0, secondPlayed:0, secondIn:0, secondInWon:0,
    returnPoints:0, returnPointsWon:0, returnsIn:0, winners:0, ue:0, bpOpp:0, bpConv:0
  };
  for (const item of saved){
    const matchState = item?.state;
    const side = inferProfileSideFromMatch(profile, matchState);
    if (!matchState || !side) continue;
    const stats = computeStats(matchState.matchPoints || []);
    const ps = stats?.[side] || emptyPlayerStats();
    const result = inferSavedMatchResult(matchState, side);
    const opponentSide = side === "A" ? "B" : "A";
    const opponent = matchState.names?.[opponentSide] || tr("Rival","Opponent");
    history.push({
      id: item.id,
      name: item.name || `${matchState.names?.A || 'Jugador A'} vs ${matchState.names?.B || 'Jugador B'}`,
      when: item.when || 0,
      pointsCount: item.pointsCount ?? (matchState.matchPoints?.length || 0),
      side,
      opponent,
      result,
      stats: ps,
      state: matchState
    });
    totals.matches++;
    if (result.tone === "good") totals.wins++;
    if (result.tone === "bad") totals.losses++;
    if (result.tone !== "ghost") totals.completed++;
    totals.totalPoints += stats.totalPoints || 0;
    totals.pointsWon += ps.pointsWon || 0;
    totals.servePoints += ps.servePoints || 0;
    totals.servePointsWon += ps.servePointsWon || 0;
    totals.firstIn += ps.firstIn || 0;
    totals.firstInWon += ps.firstInWon || 0;
    totals.secondPlayed += ps.secondPlayed || 0;
    totals.secondIn += ps.secondIn || 0;
    totals.secondInWon += ps.secondInWon || 0;
    totals.returnPoints += ps.returnPoints || 0;
    totals.returnPointsWon += ps.returnPointsWon || 0;
    totals.returnsIn += ps.returnsIn || 0;
    totals.winners += ps.winners || 0;
    totals.ue += ps.ue || 0;
    totals.bpOpp += ps.bpOpp || 0;
    totals.bpConv += ps.bpConv || 0;
  }
  return { history, totals };
}
function renderPlayerProfileDetail(id){
  const shell = $("#playerProfileSheet");
  if (!shell) return;
  const profile = getPlayerProfiles().find(p => p.id === id);
  if (!profile){ shell.classList.add("hidden"); shell.innerHTML = ""; return; }
  const { history, totals } = buildPlayerProfileDataset(profile);
  const firstServePct = totals.servePoints ? Math.round((totals.firstIn / totals.servePoints) * 100) : 0;
  const pointsWonPct = totals.totalPoints ? Math.round((totals.pointsWon / totals.totalPoints) * 100) : 0;
  const returnInPct = totals.returnPoints ? Math.round((totals.returnsIn / totals.returnPoints) * 100) : 0;
  const breakPct = totals.bpOpp ? Math.round((totals.bpConv / totals.bpOpp) * 100) : 0;
  const insight = totals.matches === 0
    ? tr('Aún no hay partidos guardados para este jugador. Guarda encuentros asignados para construir su historial.','No saved matches yet for this player. Save assigned matches to build the player history.')
    : totals.ue > totals.winners
      ? (isEn() ? `Currently this player makes more unforced errors (${totals.ue}) than winners (${totals.winners}).` : `Ahora mismo comete más errores no forzados (${totals.ue}) que winners (${totals.winners}).`)
      : (isEn() ? `Positive attacking balance: ${totals.winners} winners versus ${totals.ue} unforced errors.` : `Balance ofensivo positivo: ${totals.winners} winners frente a ${totals.ue} errores no forzados.`);
  shell.innerHTML = `
    <section class="playerSheetBanner">
      <div class="playerSheetTop">
        <div class="playerSheetIdentity">
          <div class="playerSheetPhoto ${profile.photoData ? 'hasPhoto' : ''}">${profile.photoData ? `<img src="${profile.photoData}" alt="Foto de ${escapeHtml(profile.name || 'Jugador')}">` : defaultAvatarSVG(profile.sex || 'M')}</div>
          <div class="playerSheetText">
            <div class="playerSheetEyebrow">${tr("Perfil del jugador","Player profile")}</div>
            <h3>${escapeHtml(profile.name || 'Jugador')}</h3>
            <div class="playerSheetMeta">
              <span>${escapeHtml(profile.category || tr("Sin categoría","No category"))}</span>
              <span>${(profile.hand || "R") === "L" ? tr("Zurdo","Left-handed") : tr("Diestro","Right-handed")}</span>
              <span>${(profile.sex || "M") === "F" ? tr("Mujer","Female") : tr("Hombre","Male")}</span>
              <span>${totals.matches} ${tr("partidos asignados","assigned matches")}</span>
            </div>
          </div>
        </div>
        <div class="playerSheetHeaderActions">
          <button class="chip" type="button" data-profile-action="edit" data-profile-id="${profile.id}">${tr("Editar ficha","Edit profile")}</button>
          <button class="chip modalCloseX" type="button" data-profile-action="closeDetail" aria-label="${tr("Cerrar","Close")}" title="${tr("Cerrar","Close")}">${closeIconMarkup()}</button>
        </div>
      </div>
      <div class="playerSheetStatsGrid">
        <article class="playerStatTile"><strong>${totals.matches}</strong><span>${tr("Partidos","Matches")}</span></article>
        <article class="playerStatTile"><strong>${totals.wins}</strong><span>${tr("Victorias","Wins")}</span></article>
        <article class="playerStatTile"><strong>${pointsWonPct}%</strong><span>${tr("Puntos ganados","Points won")}</span></article>
        <article class="playerStatTile"><strong>${firstServePct}%</strong><span>${tr("1º saque dentro","1st serve in")}</span></article>
        <article class="playerStatTile"><strong>${returnInPct}%</strong><span>${tr("Restos dentro","Returns in")}</span></article>
        <article class="playerStatTile"><strong>${breakPct}%</strong><span>${tr("Break convertidos","Break converted")}</span></article>
      </div>
      <div class="playerSheetGrid">
        <article class="playerDataPanel">
          <h4>${tr("Ficha técnica","Player card")}</h4>
          <ul class="playerDataList">
            <li><b>${tr("Objetivo","Goal")}:</b> ${escapeHtml(profile.goal || '—')}</li>
            <li><b>${tr("Fortalezas","Strengths")}:</b> ${escapeHtml(profile.strengths || '—')}</li>
            <li><b>${tr("Debilidades","Weaknesses")}:</b> ${escapeHtml(profile.weaknesses || '—')}</li>
            <li><b>${tr("Notas","Notes")}:</b> ${escapeHtml(profile.notes || '—')}</li>
          </ul>
        </article>
        <article class="playerDataPanel">
          <h4>${tr("Lectura rápida","Quick read")}</h4>
          <div class="playerInsightBox">${escapeHtml(insight)}</div>
          <ul class="playerDataList compact">
            <li><b>Winners:</b> ${totals.winners}</li>
            <li><b>${tr("Errores no forzados","Unforced errors")}:</b> ${totals.ue}</li>
            <li><b>${tr("Puntos al saque","Serve points")}:</b> ${totals.servePointsWon}/${totals.servePoints}</li>
            <li><b>${tr("Puntos al resto","Return points")}:</b> ${totals.returnPointsWon}/${totals.returnPoints}</li>
            <li><b>${tr("Puntos de break","Break points")}:</b> ${totals.bpConv}/${totals.bpOpp}</li>
          </ul>
        </article>
      </div>
      <article class="playerDataPanel">
        <h4>${tr("Historial del jugador","Player history")}</h4>
        ${history.length ? `<div class="playerHistoryList">${history.map(item => `<div class="playerHistoryRow">
          <div class="playerHistoryMain">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.opponent)} · ${new Date(item.when || Date.now()).toLocaleDateString()} · ${item.pointsCount} ${tr("puntos","points")}</span>
          </div>
          <div class="playerHistorySide">
            <span class="playerHistoryBadge ${item.result.tone}">${item.result.status}</span>
            <small>${Math.round(((item.stats.pointsWon || 0) / Math.max(1, item.pointsCount)) * 100)}% ${tr("puntos","points")}</small>
          </div>
        </div>`).join('')}</div>` : `<div class="playerHistoryEmpty">${tr("Todavía no hay partidos guardados para este jugador.","There are no saved matches for this player yet.")}</div>`}
      </article>
    </section>`;
  shell.classList.remove("hidden");
  upgradeCloseButtons(shell);
  shell.scrollIntoView({ block:"start", behavior:"smooth" });
}
function closePlayerProfileDetail(){
  const shell = $("#playerProfileSheet");
  if (!shell) return;
  shell.innerHTML = "";
  shell.classList.add("hidden");
}
function switchPlayerLibraryMode(mode="choose"){
  const choose = mode !== "create";
  $("#playersChoosePane")?.classList.toggle("hidden", !choose);
  $("#playersCreatePane")?.classList.toggle("hidden", choose);
  $("#btnPlayersChooseMode")?.classList.toggle("active", choose);
  $("#btnPlayersCreateMode")?.classList.toggle("active", !choose);
  $("#btnPlayersChooseMode")?.setAttribute("aria-pressed", choose ? "true" : "false");
  $("#btnPlayersCreateMode")?.setAttribute("aria-pressed", !choose ? "true" : "false");
  const shell = $("#playerLibraryShell");
  if (shell) shell.scrollTop = 0;
}
function resetProfileForm(){
  ["profileId","profileName","profileCategory","profileGoal","profileStrengths","profileWeaknesses","profileNotes","profilePhotoData"].forEach(id=>{ const el=$("#"+id); if (el) el.value=""; });
  const hand = $("#profileHand"); if (hand) hand.value = "R";
  const sex = $("#profileSex"); if (sex) sex.value = "M";
  const input = $("#profilePhotoInput"); if (input) input.value = "";
  setProfilePhotoPreview("", "Jugador");
  switchPlayerLibraryMode("create");
}
function loadProfileIntoForm(id){
  closePlayerProfileDetail();
  const p = getPlayerProfiles().find(x => x.id === id);
  if (!p) return;
  $("#profileId").value = p.id;
  $("#profileName").value = p.name || "";
  $("#profileCategory").value = p.category || "";
  $("#profileHand").value = p.hand || "R";
  $("#profileGoal").value = p.goal || "";
  $("#profileSex").value = p.sex || "M";
  $("#profileStrengths").value = p.strengths || "";
  $("#profileWeaknesses").value = p.weaknesses || "";
  $("#profileNotes").value = p.notes || "";
  $("#profilePhotoData").value = p.photoData || "";
  setProfilePhotoPreview(p.photoData || "", p.name || "Jugador");
  switchPlayerLibraryMode("create");
}
function saveProfileFromForm(){
  const payload = {
    id: $("#profileId")?.value || `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
    name: ($("#profileName")?.value || "").trim(),
    category: ($("#profileCategory")?.value || "").trim(),
    hand: ($("#profileHand")?.value || "R").trim(),
    sex: ($("#profileSex")?.value || "M").trim(),
    goal: ($("#profileGoal")?.value || "").trim(),
    strengths: ($("#profileStrengths")?.value || "").trim(),
    weaknesses: ($("#profileWeaknesses")?.value || "").trim(),
    notes: ($("#profileNotes")?.value || "").trim(),
    photoData: $("#profilePhotoData")?.value || "",
    updatedAt: Date.now()
  };
  if (!payload.name){ toast(tr("Escribe el nombre del jugador","Enter the player name")); return; }
  const profiles = getPlayerProfiles();
  const idx = profiles.findIndex(p => p.id === payload.id);
  if (idx >= 0) profiles[idx] = { ...profiles[idx], ...payload };
  else profiles.unshift({ ...payload, createdAt: Date.now() });
  setPlayerProfiles(profiles);
  closePlayerProfileDetail();
  resetProfileForm();
  renderPlayerLibrary();
  switchPlayerLibraryMode("choose");
  updateWorkspaceBar();
  toast(`✅ ${tr("Perfil guardado","Profile saved")}`);
}
function deleteProfile(id){
  closePlayerProfileDetail();
  const profiles = getPlayerProfiles().filter(p => p.id !== id);
  setPlayerProfiles(profiles);
  if (state.playerAssignments?.A === id) state.playerAssignments.A = null;
  if (state.playerAssignments?.B === id) state.playerAssignments.B = null;
  persist();
  renderPlayerLibrary();
  updateWorkspaceBar();
  toast(tr("Perfil eliminado","Profile deleted"));
}
function assignProfileToSide(id, side){
  const profile = getPlayerProfiles().find(p => p.id === id);
  if (!profile) return;
  state.playerAssignments = state.playerAssignments || { A:null, B:null };
  state.playerAssignments[side] = id;
  state.names[side] = profile.name || state.names[side];
  state.handed[side] = profile.hand || state.handed[side] || "R";
  state.playerSex = state.playerSex || { A:"M", B:"M" };
  state.playerSex[side] = profile.sex || state.playerSex[side] || "M";
  persist();
  renderAll();
  renderPlayerLibrary();
  toast(isEn() ? `✅ ${profile.name} assigned to ${side}` : `✅ ${profile.name} asignado a ${side}`);
}
function renderPlayerLibrary(){
  const list = $("#playerProfileList");
  const summary = $("#playerLibrarySummary");
  const profiles = getPlayerProfiles().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  if (summary) summary.textContent = isEn() ? `${profiles.length} profiles available · Each profile stores history, photo and overall stats` : `${profiles.length} perfiles disponibles · Cada ficha guarda historial, foto y estadísticas generales`;
  if (!list) return;
  if (!profiles.length){
    closePlayerProfileDetail();
    list.innerHTML = `<div class="profileCard"><h4>${tr("Sin perfiles todavía","No profiles yet")}</h4><p>${tr("Crea tu primer jugador para empezar a guardar historial, objetivos, foto y notas del entrenador.","Create the first player to start saving history, goals, photo and coach notes.")}</p></div>`;
    return;
  }
  list.innerHTML = profiles.map(profile => {
    const assigned = [];
    if (state.playerAssignments?.A === profile.id) assigned.push("A");
    if (state.playerAssignments?.B === profile.id) assigned.push("B");
    const meta = [profile.category || tr("Sin categoría","No category"), (profile.hand || "R") === "L" ? tr("Zurdo","Left-handed") : tr("Diestro","Right-handed"), (profile.sex || "M") === "F" ? tr("Mujer","Female") : tr("Hombre","Male")].concat(assigned.length ? [`${tr("Asignado","Assigned")}: ${assigned.join(" / ")}`] : []);
    return `
      <article class="profileCard profileCardRich">
        <div class="profileCardTop">
          <div class="profileAvatar ${profile.photoData ? 'hasPhoto' : ''}">${profile.photoData ? `<img src="${profile.photoData}" alt="Foto de ${escapeHtml(profile.name || 'Jugador')}">` : defaultAvatarSVG(profile.sex || 'M')}</div>
          <div class="profileCardInfo">
            <h4>${escapeHtml(profile.name || "Jugador")}</h4>
            <div class="profileMeta">${meta.map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div>
          </div>
        </div>
        <p><strong>${tr("Objetivo","Goal")}:</strong> ${escapeHtml(profile.goal || "—")}</p>
        <p><strong>${tr("Fortalezas","Strengths")}:</strong> ${escapeHtml(profile.strengths || "—")}</p>
        <p><strong>${tr("Debilidades","Weaknesses")}:</strong> ${escapeHtml(profile.weaknesses || "—")}</p>
        <div class="profileActions">
          <button class="chip primary" type="button" data-profile-action="view" data-profile-id="${profile.id}">${tr("Ver ficha","View profile")}</button>
          <button class="chip" type="button" data-profile-action="assignA" data-profile-id="${profile.id}">${tr("Asignar A","Assign A")}</button>
          <button class="chip" type="button" data-profile-action="assignB" data-profile-id="${profile.id}">${tr("Asignar B","Assign B")}</button>
        </div>
        <div class="profileActions">
          <button class="chip good" type="button" data-profile-action="edit" data-profile-id="${profile.id}">${tr("Editar","Edit")}</button>
          <button class="chip warn" type="button" data-profile-action="delete" data-profile-id="${profile.id}">${tr("Borrar","Delete")}</button>
        </div>
      </article>`;
  }).join("");
}
function getPlayerRecommendations(pid, stats){
  const s = stats?.[pid];
  if (!s || !stats?.totalPoints) return ["Todavía no hay suficientes datos para una recomendación útil."];
  const recs = [];
  const totalServe = s.servePoints || 0;
  const totalReturn = s.returnPoints || 0;
  if (totalServe >= 6 && s.firstIn && (s.firstIn / totalServe) < 0.45){
    recs.push(`Subir el primer saque: ahora mismo está en ${fmtPct(s.firstIn, totalServe)}.`);
  }
  if (totalServe >= 6 && s.secondPlayed >= 3 && s.doubleFaults >= 2){
    recs.push(`Proteger mejor el segundo saque: ${s.doubleFaults} dobles faltas detectadas.`);
  }
  if (totalReturn >= 6 && s.returnsIn && (s.returnsIn / totalReturn) < 0.55){
    recs.push(`Buscar más seguridad al resto: sólo entran ${fmtPct(s.returnsIn, totalReturn)}.`);
  }
  if ((s.ue || 0) > ((s.winners || 0) + 2)){
    recs.push(`Reducir error no forzado: UE ${s.ue} frente a winners ${s.winners}.`);
  }
  const dirEntries = Object.entries(s.strokeDir || {}).sort((a,b)=>b[1]-a[1]);
  if (dirEntries[0] && dirEntries[0][1] >= 4){
    const dirName = dirEntries[0][0] === "C" ? "cruzado" : dirEntries[0][0] === "M" ? "al medio" : "paralelo";
    recs.push(`Patrón dominante en rally: dirección ${dirName}. Conviene reforzar la siguiente jugada desde ahí.`);
  }
  if (!recs.length) recs.push("Rendimiento bastante equilibrado. Conviene profundizar con más puntos para detectar una prioridad clara.");
  return recs.slice(0, 3);
}
function renderDashboard(){
  const intro = $("#dashboardIntro");
  const grid = $("#dashboardGrid");
  const recs = $("#dashboardRecommendations");
  const sub = $("#dashboardSub");
  if (!intro || !grid || !recs) return;
  const stats = computeStats(state.matchPoints || []);
  const matches = getSavedMatches();
  const profiles = getPlayerProfiles();
  const session = getSession();
  const totalPoints = Math.max(1, (state.matchPoints || []).length);
  const modeLabel = state.matchMode === "super" ? "Super tie-break" : state.matchMode === "tiebreak" ? "Tie-break" : "Partido estándar";
  const pctNum = (won, total) => total ? Math.round((won / total) * 100) : 0;
  const dirLabel = { C:"Cruzado", M:"Medio", P:"Paralelo" };
  const depthLabel = { P:"Profundo", M:"Medio", C:"Corto" };
  const targetLabel = { T:"T", C:"Cuerpo", W:"Abierto", A:"Abierto" };
  const dominantKey = (obj) => {
    const entries = Object.entries(obj || {}).sort((a,b)=> (b[1]||0) - (a[1]||0));
    return entries[0] && entries[0][1] > 0 ? entries[0][0] : null;
  };
  const bestBucket = (buckets) => {
    const labels = { b02:"0-2 golpes", b35:"3-5 golpes", b68:"6-8 golpes", b9p:"9+ golpes" };
    const key = dominantKey(buckets || {});
    return key ? labels[key] : "Sin patrón claro";
  };
  const formatPctPlain = (won, total) => `${pctNum(won, total)}%`;
  const meter = (label, value, tone="cyan") => `
    <div class="dashboardMeterRow">
      <div class="dashboardMeterHead"><span>${escapeHtml(label)}</span><strong>${value}%</strong></div>
      <div class="dashboardMeterTrack ${tone}"><span style="width:${Math.max(4, Math.min(100, value || 0))}%"></span></div>
    </div>`;
  const compareMetric = (label, aValue, bValue, suffix="%") => {
    const total = Math.max(1, aValue + bValue);
    const leftPct = Math.max(8, Math.round((aValue / total) * 100));
    const rightPct = Math.max(8, 100 - leftPct);
    const leftText = suffix ? `${aValue}${suffix}` : `${aValue}`;
    const rightText = suffix ? `${bValue}${suffix}` : `${bValue}`;
    return `
      <div class="compareMetric">
        <div class="compareMetricHead">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(playerName("A"))} ${leftText} · ${rightText} ${escapeHtml(playerName("B"))}</strong>
        </div>
        <div class="compareTrack">
          <span class="left" style="width:${leftPct}%"></span>
          <span class="right" style="width:${rightPct}%"></span>
        </div>
      </div>`;
  };

  const a = stats.A || {};
  const b = stats.B || {};
  const serveA = pctNum(a.servePointsWon || 0, a.servePoints || 0);
  const serveB = pctNum(b.servePointsWon || 0, b.servePoints || 0);
  const returnA = pctNum(a.returnPointsWon || 0, a.returnPoints || 0);
  const returnB = pctNum(b.returnPointsWon || 0, b.returnPoints || 0);
  const pressureA = pctNum((a.pressureDeuceWon || 0) + (a.pressure3030Won || 0), (a.pressureDeucePlayed || 0) + (a.pressure3030Played || 0));
  const pressureB = pctNum((b.pressureDeuceWon || 0) + (b.pressure3030Won || 0), (b.pressureDeucePlayed || 0) + (b.pressure3030Played || 0));
  const pointShareA = pctNum(a.pointsWon || 0, totalPoints);
  const pointShareB = pctNum(b.pointsWon || 0, totalPoints);
  const leadName = (a.pointsWon || 0) === (b.pointsWon || 0)
    ? "Partido equilibrado"
    : ((a.pointsWon || 0) > (b.pointsWon || 0) ? playerName("A") : playerName("B"));

  if (sub) sub.textContent = `${modeLabel} · ${state.matchPoints.length} puntos analizados · ${matches.length} partidos guardados`;

  intro.innerHTML = [
    { label:"Cuenta activa", value: escapeHtml(session?.name || "Invitado"), note: `${escapeHtml(session?.plan || "Local")} · sistema visual pro` },
    { label:"Modo actual", value: escapeHtml(modeLabel), note: `${state.matchPoints.length} puntos registrados` },
    { label:"Activos en workspace", value: `${profiles.length} jugadores`, note: `${matches.length} partidos guardados` }
  ].map(card => `<div class="dashboardHeroCard dataPanel"><strong>${card.label}</strong><span>${card.value}</span><small>${card.note}</small></div>`).join("");

  const buildCard = (pid) => {
    const p = stats[pid] || {};
    const pointsShare = pctNum(p.pointsWon || 0, totalPoints);
    const servePct = pctNum(p.servePointsWon || 0, p.servePoints || 0);
    const returnPct = pctNum(p.returnPointsWon || 0, p.returnPoints || 0);
    const pressurePct = pctNum((p.pressureDeuceWon || 0) + (p.pressure3030Won || 0), (p.pressureDeucePlayed || 0) + (p.pressure3030Played || 0));
    const bpConvPct = pctNum(p.bpConv || 0, p.bpOpp || 0);
    const balance = (p.winners || 0) - (p.ue || 0);
    const domDir = dominantKey(p.strokeDir || {});
    const domDepth = dominantKey(p.strokeDepth || {});
    const domTarget = dominantKey(p.serveTargets || {});
    const playerTone = pid === "A" ? "cyan" : "gold";
    return `
      <article class="dashboardCard dataPanel dataPlayerCard player-${pid}">
        <div class="dashboardCardHead">
          <div>
            <span class="dataEyebrow">Perfil en juego</span>
            <h3>${escapeHtml(playerName(pid))}</h3>
          </div>
          <div class="playerImpact ${pointsShare >= 50 ? 'positive' : 'neutral'}">${pointsShare}%</div>
        </div>
        <div class="dashboardKpis">
          <div class="dashboardKpi"><strong>${p.pointsWon || 0}</strong><span>Puntos ganados</span></div>
          <div class="dashboardKpi"><strong>${formatPctPlain(p.servePointsWon || 0, p.servePoints || 0)}</strong><span>Puntos al saque</span></div>
          <div class="dashboardKpi"><strong>${formatPctPlain(p.returnPointsWon || 0, p.returnPoints || 0)}</strong><span>Puntos al resto</span></div>
          <div class="dashboardKpi"><strong>${p.winners || 0} / ${p.ue || 0}</strong><span>Winners / UE</span></div>
        </div>
        <div class="dashboardMeters">
          ${meter("Saque", servePct, playerTone)}
          ${meter("Resto", returnPct, playerTone)}
          ${meter("Presión", pressurePct, playerTone)}
        </div>
        <div class="dashboardTags">
          <span class="dataTag ${playerTone}">Dirección: ${escapeHtml(dirLabel[domDir] || "Sin lectura")}</span>
          <span class="dataTag ${playerTone}">Profundidad: ${escapeHtml(depthLabel[domDepth] || "Sin lectura")}</span>
          <span class="dataTag ${playerTone}">Saque: ${escapeHtml(targetLabel[domTarget] || "Sin lectura")}</span>
          <span class="dataTag ${playerTone}">Break: ${bpConvPct}% conv.</span>
          <span class="dataTag ${playerTone}">${escapeHtml(bestBucket(p.rallyWonBuckets || {}))}</span>
          <span class="dataTag ${balance >= 0 ? 'green' : 'red'}">Balance ofensivo ${balance >= 0 ? '+' : ''}${balance}</span>
        </div>
      </article>`;
  };

  grid.innerHTML = `
    <article class="dashboardCompareCard dataPanel">
      <div class="dashboardCompareHead">
        <div>
          <span class="dataEyebrow">Lectura rápida</span>
          <h3>Ventaja comparativa actual</h3>
        </div>
        <div class="dashboardCompareBadge">${escapeHtml(leadName)}</div>
      </div>
      <div class="dashboardCompareMetrics">
        ${compareMetric("Total de puntos", a.pointsWon || 0, b.pointsWon || 0, "")}
        ${compareMetric("Rendimiento al saque", serveA, serveB)}
        ${compareMetric("Rendimiento al resto", returnA, returnB)}
        ${compareMetric("Gestión de presión", pressureA, pressureB)}
      </div>
    </article>
    ${buildCard("A")}
    ${buildCard("B")}`;

  const ra = getPlayerRecommendations("A", stats);
  const rb = getPlayerRecommendations("B", stats);
  recs.innerHTML = `
    <article class="recommendCard dataPanel">
      <span class="dataEyebrow">Plan táctico</span>
      <h4>Foco para ${escapeHtml(playerName("A"))}</h4>
      <ul class="recommendList">${ra.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
    </article>
    <article class="recommendCard dataPanel">
      <span class="dataEyebrow">Plan táctico</span>
      <h4>Foco para ${escapeHtml(playerName("B"))}</h4>
      <ul class="recommendList">${rb.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
    </article>`;
}
function updateWorkspaceBar(){
  const session = getSession();
  const profiles = getPlayerProfiles();
  const matches = getSavedMatches();
  const workspaceName = $("#workspaceName");
  const workspaceSub = $("#workspaceSub");
  const players = $("#workspacePlayers");
  const saved = $("#workspaceMatches");
  const points = $("#workspacePoints");
  if (workspaceName) workspaceName.textContent = session?.name || "Modo local";
  if (workspaceSub) workspaceSub.textContent = isAuthenticated() ? `${session?.plan || "Local"} · ${session?.email || "sin email"}` : "Accede para separar jugadores y partidos por cuenta";
  if (players) players.textContent = String(profiles.length);
  if (saved) saved.textContent = String(matches.length);
  if (points) points.textContent = String((state.matchPoints || []).length);
}
function renderAccountModal(){
  const box = $("#accountSummary");
  if (!box) return;
  const session = getSession();
  const profiles = getPlayerProfiles();
  const matches = getSavedMatches();
  const current = getCurrentAccount();
  const mode = session?.isDemo ? "Modo demo" : "Cuenta local";
  const created = current?.createdAt ? new Date(current.createdAt).toLocaleDateString('es-ES') : "Sesión local";
  box.innerHTML = `
    <div class="accountBrandPanel dataPanel">
      <div class="accountBrandHeader">
        <div>
          <span class="dataEyebrow">Workspace activo</span>
          <h3>${escapeHtml(session?.name || "Sin sesión")}</h3>
          <p class="accountBrandLead">Entorno preparado para seguimiento profesional, perfiles de jugador y evolución visual del producto.</p>
        </div>
        <span class="accountStateBadge">${escapeHtml(session?.plan || mode)}</span>
      </div>
      <div class="dashboardKpis accountSummaryGrid">
        <div class="dashboardKpi"><strong>${escapeHtml(session?.plan || mode)}</strong><span>Plan visual</span></div>
        <div class="dashboardKpi"><strong>${profiles.length}</strong><span>Perfiles guardados</span></div>
        <div class="dashboardKpi"><strong>${matches.length}</strong><span>Partidos guardados</span></div>
        <div class="dashboardKpi"><strong>${(state.matchPoints || []).length}</strong><span>Puntos en sesión</span></div>
      </div>
      <div class="accountMetaChips">
        <span class="dataTag cyan">${escapeHtml(mode)}</span>
        <span class="dataTag gold">${escapeHtml(session?.email || "Sin email")}</span>
        <span class="dataTag">Alta: ${escapeHtml(created)}</span>
      </div>
      <div class="helpNote accountNote">
        <strong>Estado actual:</strong> ${escapeHtml(mode)}.<br>
        <strong>Cuenta:</strong> ${escapeHtml(session?.email || "No disponible")}.<br>
        <strong>Nota:</strong> Esta implementación separa datos por usuario en el propio dispositivo y deja preparada la lógica para conectar autenticación y base de datos reales más adelante.
      </div>
    </div>`;
}
function openDashboard(){ renderDashboard(); openModal("#dashboardModal"); }
function closeDashboard(){ closeModal("#dashboardModal"); }
function openPlayers(){
  renderPlayerLibrary();
  const hasProfiles = getPlayerProfiles().length > 0;
  switchPlayerLibraryMode(hasProfiles ? "choose" : "create");
  openModal("#playersModal");
  if (!hasProfiles) setTimeout(()=> $("#profileName")?.focus(), 30);
}
function closePlayers(){ closeModal("#playersModal"); }
function openAccount(){ renderAccountModal(); openModal("#accountModal"); }
function closeAccount(){ closeModal("#accountModal"); }
function openHelp(){ openModal("#helpModal"); }
function closeHelp(){ closeModal("#helpModal"); }
function applyLegalTab(tab){
  document.querySelectorAll(".legalTab").forEach(btn => btn.classList.toggle("active", btn.dataset.legalTab === tab));
  $("#legalPrivacyPane")?.classList.toggle("hidden", tab !== "privacy");
  $("#legalTermsPane")?.classList.toggle("hidden", tab !== "terms");
}
function openLegal(){ applyLegalTab("privacy"); openModal("#legalModal"); }
function closeLegal(){ closeModal("#legalModal"); }
function openOnboarding(){ openModal("#onboardingModal"); }
function closeOnboarding(){ closeModal("#onboardingModal"); }
function markOnboardingSeen(complete=false){
  updateAccountRecord(acc => ({ ...acc, onboardingSeen:true, onboardingComplete: complete || !!acc.onboardingComplete }));
}
function maybeOpenOnboarding(force=false){
  const account = getCurrentAccount();
  if (!account || account.isDemo) return;
  if (force || (!account.onboardingComplete && !account.onboardingSeen)) openOnboarding();
}
function forceEnterMainInterface(){
  try{ document.getElementById("splash")?.classList.add("hidden"); }catch(e){}
  try{ document.getElementById("authPortal")?.classList.add("hidden"); }catch(e){}
  document.body.classList.remove("splashLock", "unauth");
  document.body.classList.add("isAuthenticated");
  try{ if (!state.point) initPoint(); }catch(e){}
  try{ renderAll(); }catch(e){ console.error("forceEnterMainInterface renderAll error", e); }
  try{ window.scrollTo({ top: 0, behavior: "instant" }); }catch(e){ try{ window.scrollTo(0,0); }catch(_){} }
  return false;
}
function activateUserContext(openOnboardingNow=false){
  try{
    resetState();
    load();
    applyModes();
    if (!state.point) initPoint();
    renderAll();
    renderPlayerLibrary();
    renderAccountModal();
    renderDashboard();
    updateWorkspaceBar();
    hideAuthPortal();
    forceEnterMainInterface();
    if (openOnboardingNow) maybeOpenOnboarding(true);
    return true;
  }catch(err){
    console.error("activateUserContext error", err);
    try{ hideAuthPortal(); }catch(e){}
    forceEnterMainInterface();
    try{ toast("⚠️ Entrada en modo seguro"); }catch(e){}
    return false;
  }
}
function handleDeveloperAccess(){
  try{
    setSession({ uid:"__dev__", name:"Developer Access", email:"dev@local", plan:"Debug", isDemo:true, remember:false }, false);
  }catch(e){ console.error("handleDeveloperAccess session error", e); }
  return activateUserContext(false);
}
async function handleSignup(){
  const name = ($("#signupName")?.value || "").trim();
  const email = ($("#signupEmail")?.value || "").trim().toLowerCase();
  const password = ($("#signupPassword")?.value || "");
  const plan = ($("#signupPlan")?.value || "Coach Pro").trim();
  if (!name || !email || !password){ setFeedback("signupFeedback", "Completa nombre, email y contraseña.", "error"); return; }
  if (password.length < 8){ setFeedback("signupFeedback", "La contraseña debe tener al menos 8 caracteres.", "error"); return; }
  const accounts = getAccounts();
  if (accounts.some(acc => (acc.email || "").toLowerCase() === email)){
    setFeedback("signupFeedback", "Ya existe una cuenta con ese email.", "error");
    return;
  }
  const passwordHash = await hashPassword(password);
  const account = { id:`acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`, name, email, plan, passwordHash, createdAt:Date.now(), onboardingSeen:false, onboardingComplete:false };
  accounts.push(account);
  setAccounts(accounts);
  setSession({ uid:account.id, name:account.name, email:account.email, plan:account.plan, remember:true }, true);
  setFeedback("signupFeedback", "Cuenta creada correctamente.", "success");
  activateUserContext(true);
}
async function handleLogin(){
  const email = ($("#loginEmail")?.value || "").trim().toLowerCase();
  const password = ($("#loginPassword")?.value || "");
  const remember = !!$("#rememberSession")?.checked;
  if (!email || !password){ setFeedback("loginFeedback", "Introduce email y contraseña.", "error"); return; }
  const account = getAccounts().find(acc => (acc.email || "").toLowerCase() === email);
  if (!account){ setFeedback("loginFeedback", "No existe una cuenta con ese email.", "error"); return; }
  const passwordHash = await hashPassword(password);
  if (passwordHash !== account.passwordHash){ setFeedback("loginFeedback", "Contraseña incorrecta.", "error"); return; }
  setSession({ uid:account.id, name:account.name, email:account.email, plan:account.plan, remember }, remember);
  setFeedback("loginFeedback", "Acceso correcto.", "success");
  activateUserContext(false);
  maybeOpenOnboarding(false);
}
function handleDemoAccess(){
  setSession({ uid:"__demo__", name:"Demo Coach", email:"demo@local", plan:"Demo", isDemo:true, remember:false }, false);
  activateUserContext(false);
}
function handleLogout(){
  openConfirm("Cerrar sesión", "Se cerrará la cuenta actual en este dispositivo.", ()=>{
    clearSession();
    resetState();
    initPoint();
    renderAll();
    showAuthPortal();
    closeAccount();
  });
}
function setWorkspaceExpanded(expanded){
  const bar = $("#workspaceBar");
  const panel = $("#workspaceExpand");
  const toggle = $("#workspaceToggle");
  if (!bar || !panel || !toggle) return;
  const isExpanded = !!expanded;
  bar.dataset.expanded = isExpanded ? "true" : "false";
  toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  panel.hidden = !isExpanded;
}
function initWorkspaceToggle(){
  const toggle = $("#workspaceToggle");
  if (!toggle || toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  setWorkspaceExpanded(false);
  toggle.addEventListener("click", ()=>{
    const expanded = $("#workspaceBar")?.dataset.expanded === "true";
    setWorkspaceExpanded(!expanded);
  });
}
function initProfessionalShell(){
  switchAuthTab("login");
  $("#tabAuthLogin")?.addEventListener("click", ()=> switchAuthTab("login"));
  $("#tabAuthSignup")?.addEventListener("click", ()=> switchAuthTab("signup"));
  $("#btnLogin")?.addEventListener("click", handleLogin);
  $("#btnSignup")?.addEventListener("click", handleSignup);
  $("#btnDemoAccess")?.addEventListener("click", handleDemoAccess);
  $("#btnDirectAccess")?.addEventListener("click", handleDeveloperAccess);
  ["loginEmail","loginPassword"].forEach(id=> $("#"+id)?.addEventListener("keydown", (e)=>{ if (e.key === "Enter") handleLogin(); }));
  ["signupName","signupEmail","signupPassword"].forEach(id=> $("#"+id)?.addEventListener("keydown", (e)=>{ if (e.key === "Enter") handleSignup(); }));
  $("#btnOpenHelpFromAuth")?.addEventListener("click", openHelp);
  $("#btnOpenLegalFromAuth")?.addEventListener("click", openLegal);
  $("#btnDashboard")?.addEventListener("click", ()=>{ setWorkspaceExpanded(false); openDashboard(); });
  $("#btnPlayerLibrary")?.addEventListener("click", ()=>{ setWorkspaceExpanded(false); openPlayers(); });
  $("#btnAccount")?.addEventListener("click", ()=>{ setWorkspaceExpanded(false); openAccount(); });
  $("#btnDashboardMenu")?.addEventListener("click", ()=> openFromMenu(()=>openDashboard()));
  $("#btnPlayerLibraryMenu")?.addEventListener("click", ()=> openFromMenu(()=>openPlayers()));
  $("#btnAccountMenu")?.addEventListener("click", ()=> openFromMenu(()=>openAccount()));
  $("#btnHelpCenter")?.addEventListener("click", ()=> openFromMenu(()=>openHelp()));
  $("#btnLegal")?.addEventListener("click", ()=> openFromMenu(()=>openLegal()));
  $("#btnCloseDashboard")?.addEventListener("click", closeDashboard);
  $("#btnClosePlayers")?.addEventListener("click", closePlayers);
  $("#btnCloseAccount")?.addEventListener("click", closeAccount);
  $("#btnCloseHelp")?.addEventListener("click", closeHelp);
  $("#btnCloseLegal")?.addEventListener("click", closeLegal);
  $("#btnCloseOnboarding")?.addEventListener("click", ()=>{ markOnboardingSeen(false); closeOnboarding(); });
  $("#btnOpenOnboarding")?.addEventListener("click", ()=> maybeOpenOnboarding(true));
  $("#btnLogout")?.addEventListener("click", handleLogout);
  $("#btnSaveProfile")?.addEventListener("click", saveProfileFromForm);
  $("#btnResetProfile")?.addEventListener("click", resetProfileForm);
  bindProfilePhotoInput();
  $("#btnPlayersChooseMode")?.addEventListener("click", ()=> switchPlayerLibraryMode("choose"));
  $("#btnPlayersCreateMode")?.addEventListener("click", ()=> switchPlayerLibraryMode("create"));
  $("#btnOnboardingPlayers")?.addEventListener("click", ()=>{ markOnboardingSeen(false); closeOnboarding(); openPlayers(); });
  $("#btnOnboardingDone")?.addEventListener("click", ()=>{ markOnboardingSeen(true); closeOnboarding(); });
  document.querySelectorAll(".legalTab").forEach(btn => btn.addEventListener("click", ()=> applyLegalTab(btn.dataset.legalTab || "privacy")));
  const playerActionDelegate = (e)=>{
    const btn = e.target.closest("[data-profile-action]");
    if (!btn) return;
    const action = btn.dataset.profileAction;
    const id = btn.dataset.profileId;
    if (action !== "closeDetail" && !id) return;
    if (action === "assignA") assignProfileToSide(id, "A");
    if (action === "assignB") assignProfileToSide(id, "B");
    if (action === "view") renderPlayerProfileDetail(id);
    if (action === "edit") loadProfileIntoForm(id);
    if (action === "delete") openConfirm("Eliminar perfil", "Se borrará el perfil del jugador seleccionado.", ()=> deleteProfile(id));
    if (action === "closeDetail") closePlayerProfileDetail();
  };
  $("#playerProfileList")?.addEventListener("click", playerActionDelegate);
  $("#playerProfileSheet")?.addEventListener("click", playerActionDelegate);
  ["dashboardModal","playersModal","accountModal","helpModal","legalModal","onboardingModal"].forEach(mid=>{
    const modal = $("#"+mid);
    if (!modal) return;
    modal.addEventListener("click", (e)=>{ if (e.target === modal) closeModal(mid); });
  });
  initWorkspaceToggle();
  updateWorkspaceBar();
  renderPlayerLibrary();
  renderAccountModal();
  renderDashboard();
  if (isAuthenticated()) hideAuthPortal();
  else document.body.classList.add("unauth");
}
let __postSplashAction = null;

function afterSplashStart(){
  if (isAuthenticated()){
    hideAuthPortal();
    updateWorkspaceBar();
    maybeOpenOnboarding(false);
    return;
  }

  if (__postSplashAction === "demo"){
    const action = __postSplashAction;
    __postSplashAction = null;
    if (action === "demo"){
      handleDemoAccess();
      return;
    }
  }

  showAuthPortal();
  const tab = (__postSplashAction === "signup") ? "signup" : "login";
  switchAuthTab(tab);
  const input = tab === "signup" ? $("#signupName") : $("#loginEmail");
  __postSplashAction = null;
  if (input) setTimeout(()=> input.focus(), 50);
}


function initBottomSheet(){
  const sheet = $("#bottomSheet");
  const handle = $("#sheetHandle");
  upgradeCloseButtons();
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
  const btnLogin = document.getElementById("btnSplashLogin");
  const btnSignup = document.getElementById("btnSplashSignup");
  const btnDemo = document.getElementById("btnSplashDemo");
  if (!splash || !btn) return;

  document.body.classList.add("splashLock");
  requestAnimationFrame(()=> splash.classList.add("is-play"));
  splash.classList.add("showStart");
  btn.classList.remove("hidden");

  const leaveSplash = (action = "login")=>{
    __postSplashAction = action;
    splash.classList.add("is-out");
    document.body.classList.remove("splashLock");
    setTimeout(()=>{ splash.classList.add("hidden"); window.dispatchEvent(new Event("resize")); afterSplashStart(); }, 320);
  };

  splash.addEventListener("click", (e)=>{
    const target = e.target;
    if (target === btn || target === btnLogin || target === btnSignup || target === btnDemo) return;
    leaveSplash("login");
  });

  btn.onclick = ()=> leaveSplash("login");
  btnLogin?.addEventListener("click", ()=> leaveSplash("login"));
  btnSignup?.addEventListener("click", ()=> leaveSplash("signup"));
  btnDemo?.addEventListener("click", ()=> leaveSplash("demo"));
}

function showSplashAgain(){
  const splash = document.getElementById("splash");
  const btn = document.getElementById("btnStartApp");
  if (!splash || !btn) return;
  splash.classList.remove("hidden","is-out","showStart");
  splash.classList.remove("is-play");
  void splash.offsetWidth;
  document.body.classList.add("splashLock");
  requestAnimationFrame(()=> splash.classList.add("is-play"));
  splash.classList.add("showStart");
  btn.classList.remove("hidden");
  btn.onclick = ()=>{
    __postSplashAction = "login";
    splash.classList.add("is-out");
    document.body.classList.remove("splashLock");
    setTimeout(()=>{ splash.classList.add("hidden"); window.dispatchEvent(new Event("resize")); afterSplashStart(); }, 320);
  };
}

function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
    .then(() => {
      if (!("caches" in window)) return;
      return caches.keys().then((keys) => Promise.all(keys.filter((k) => String(k).startsWith("tennis-tracker-web-")).map((k) => caches.delete(k))));
    })
    .catch(console.error);
}

function init(){
  refreshSessionCache();
  load();
  applyModes();
  buildZones();
  if (!state.point) initPoint();
  wire();
  wireMeta();
  initProfessionalShell();
  renderAll();
  initSplash();
  registerSW();
}

let __tdtSafeBooted = false;
function safeInit(){
  if (__tdtSafeBooted) return;
  __tdtSafeBooted = true;
  try{
    init();
  }catch(err){
    console.error("TDT init error", err);
    try{ initProfessionalShell(); }catch(e){ console.error("TDT shell fallback error", e); }
    try{ initSplash(); }catch(e){ console.error("TDT splash fallback error", e); }
    try{ if (window.__tdtBindEntryFallback) window.__tdtBindEntryFallback(); }catch(e){ console.error("TDT entry fallback bind error", e); }
  }
}
window.safeInit = safeInit;
window.switchAuthTab = switchAuthTab;
window.getSession = getSession;
window.setSession = setSession;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleDemoAccess = handleDemoAccess;
window.handleDeveloperAccess = handleDeveloperAccess;
window.forceEnterMainInterface = forceEnterMainInterface;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInit, {once:true});
} else {
  setTimeout(safeInit, 0);
}
window.addEventListener("pageshow", ()=>{
  try{ if (window.__tdtBindEntryFallback) window.__tdtBindEntryFallback(); }catch(e){}
});

/* ===== v2980 players flow + splash/workspace polish ===== */
function playerEditIconSVG(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-.8L18.5 8.9a1.9 1.9 0 0 0 0-2.7l-.7-.7a1.9 1.9 0 0 0-2.7 0L4.8 15.8 4 20z"></path><path d="M13.5 6.5l4 4"></path></svg>';
}
function playerDeleteIconSVG(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 13h8l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
}
function closePlayerChooser(options){
  closeModal('#playerSelectModal');
  if (options && options.reopenPlayers) openPlayers();
}
function renderPlayerChooser(){
  const list = $("#playerChooserList");
  const summary = $("#playerChooserSummary");
  if (!list) return;
  const profiles = getPlayerProfiles().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  if (summary) summary.textContent = isEn() ? `${profiles.length} profiles available · Tap a card to view, edit, delete or assign` : `${profiles.length} perfiles disponibles · Toca una ficha para ver, editar, borrar o asignar`;
  if (!profiles.length){
    list.innerHTML = `<div class="playerChooserEmpty"><strong>${tr('Todavía no hay jugadores guardados.','There are no saved players yet.')}</strong><p>${tr('Crea un jugador nuevo para empezar tu biblioteca.','Create a new player to start your library.')}</p></div>`;
    return;
  }
  list.innerHTML = profiles.map(profile => `
    <article class="playerChooserCard">
      <div class="playerChooserTop">
        <div class="playerChooserAvatar ${profile.photoData ? 'hasPhoto' : ''}">${profile.photoData ? `<img src="${profile.photoData}" alt="Foto de ${escapeHtml(profile.name || 'Jugador')}">` : defaultAvatarSVG(profile.sex || 'M')}</div>
        <div class="playerChooserName">${escapeHtml(profile.name || 'Jugador')}</div>
        <button class="playerChooserIcon" type="button" data-chooser-action="edit" data-profile-id="${profile.id}" aria-label="${tr('Editar','Edit')}" title="${tr('Editar','Edit')}">${playerEditIconSVG()}</button>
        <button class="playerChooserIcon delete" type="button" data-chooser-action="delete" data-profile-id="${profile.id}" aria-label="${tr('Borrar','Delete')}" title="${tr('Borrar','Delete')}">${playerDeleteIconSVG()}</button>
      </div>
      <div class="playerChooserActions">
        <button class="chip primary" type="button" data-chooser-action="view" data-profile-id="${profile.id}">${tr('Ver ficha','View profile')}</button>
        <button class="chip" type="button" data-chooser-action="assignA" data-profile-id="${profile.id}">${tr('Asignar A','Assign A')}</button>
        <button class="chip" type="button" data-chooser-action="assignB" data-profile-id="${profile.id}">${tr('Asignar B','Assign B')}</button>
      </div>
    </article>`).join('');
}
function openPlayerChooser(){
  renderPlayerChooser();
  openModal('#playerSelectModal');
}
function openPlayerProfileFromChooser(id){
  closeModal('#playerSelectModal');
  openPlayers();
  $("#playersChoosePane")?.classList.remove('hidden');
  renderPlayerProfileDetail(id);
}
function openPlayerEditFromChooser(id){
  closeModal('#playerSelectModal');
  openPlayers();
  loadProfileIntoForm(id);
}
function switchPlayerLibraryMode(mode="choose"){
  const choose = mode !== "create";
  $("#playersCreatePane")?.classList.toggle("hidden", choose);
  $("#playersChoosePane")?.classList.toggle("hidden", true);
  $("#btnPlayersChooseMode")?.classList.toggle("active", choose);
  $("#btnPlayersCreateMode")?.classList.toggle("active", !choose);
  $("#btnPlayersChooseMode")?.setAttribute("aria-pressed", choose ? "true" : "false");
  $("#btnPlayersCreateMode")?.setAttribute("aria-pressed", !choose ? "true" : "false");
  if (choose) closePlayerProfileDetail();
  const shell = $("#playerLibraryShell");
  if (shell) shell.scrollTop = 0;
}
function openPlayers(){
  renderPlayerLibrary();
  const hasProfiles = getPlayerProfiles().length > 0;
  switchPlayerLibraryMode(hasProfiles ? 'choose' : 'create');
  openModal('#playersModal');
  if (!hasProfiles) setTimeout(()=> $("#profileName")?.focus(), 30);
}
(function initRequestedRefinements(){
  const bind = ()=>{
    const chooseBtn = $("#btnPlayersChooseMode");
    if (chooseBtn && !chooseBtn.dataset.submodalBound){
      chooseBtn.dataset.submodalBound = '1';
      chooseBtn.addEventListener('click', ()=> openPlayerChooser());
    }
    const closeBtn = $("#btnClosePlayerSelect");
    if (closeBtn && !closeBtn.dataset.bound){
      closeBtn.dataset.bound='1';
      closeBtn.addEventListener('click', ()=> closePlayerChooser({ reopenPlayers:true }));
    }
    const list = $("#playerChooserList");
    if (list && !list.dataset.bound){
      list.dataset.bound='1';
      list.addEventListener('click', (e)=>{
        const btn = e.target.closest('[data-chooser-action]');
        if (!btn) return;
        const action = btn.dataset.chooserAction;
        const id = btn.dataset.profileId;
        if (!id) return;
        if (action === 'view') openPlayerProfileFromChooser(id);
        if (action === 'edit') openPlayerEditFromChooser(id);
        if (action === 'delete') openConfirm(tr('Eliminar perfil','Delete profile'), tr('Se borrará el perfil del jugador seleccionado.','The selected player profile will be deleted.'), ()=>{ deleteProfile(id); renderPlayerChooser(); });
        if (action === 'assignA'){ assignProfileToSide(id, 'A'); renderPlayerChooser(); }
        if (action === 'assignB'){ assignProfileToSide(id, 'B'); renderPlayerChooser(); }
      });
    }
    const modal = $("#playerSelectModal");
    if (modal && !modal.dataset.bound){
      modal.dataset.bound='1';
      modal.addEventListener('click', (e)=>{ if (e.target === modal) closePlayerChooser({ reopenPlayers:true }); });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
