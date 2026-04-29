
const $ = (s) => document.querySelector(s);

const STORAGE_BASE_STATE = "tdt_v24_state";
const STORAGE_BASE_MATCHES = "tdt_saved_matches_v2";
const STORAGE_BASE_PROFILES = "tdt_player_profiles_v1";
const STORAGE_BASE_FINISH_MODE = "tdt_finish_mode_v2";
const STORAGE_BASE_EXERCISES = "tdt_coach_exercises_v1";
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
function getCoachExercisesStorageKey(){ return scopedKey(STORAGE_BASE_EXERCISES); }

function createDefaultCoachState(){
  return {
    exerciseId: null,
    exerciseName: "Nuevo ejercicio",
    folderId: "root",
    selectedFolderId: "root",
    activeTool: "direction",
    courtMode: "full",
    halfView: "bottom",
    showGrid: false,
    placementMode: "aligned",
    pendingTemplate: null,
    selectedObjectIds: [],
    pendingDirectionStart: null,
    pendingDashStart: null,
    patterns: [],
    objects: [],
    undoStack: [],
    redoStack: [],
    goal: "",
    level: "",
    material: "",
    tags: "",
    notes: ""
  };
}
function ensureCoachState(){
  if (!state.coach || typeof state.coach !== "object") state.coach = createDefaultCoachState();
  state.coach.patterns = Array.isArray(state.coach.patterns) ? state.coach.patterns : [];
  state.coach.objects = Array.isArray(state.coach.objects) ? state.coach.objects : [];
  state.coach.undoStack = Array.isArray(state.coach.undoStack) ? state.coach.undoStack : [];
  state.coach.redoStack = Array.isArray(state.coach.redoStack) ? state.coach.redoStack : [];
  state.coach.activeTool = state.coach.activeTool || "direction";
  state.coach.exerciseName = state.coach.exerciseName || "Nuevo ejercicio";
  state.coach.folderId = state.coach.folderId || "root";
  state.coach.selectedFolderId = state.coach.selectedFolderId || state.coach.folderId || "root";
  state.coach.courtMode = state.coach.courtMode === "half" ? "half" : "full";
  state.coach.halfView = state.coach.halfView === "top" ? "top" : "bottom";
  state.coach.showGrid = !!state.coach.showGrid;
  state.coach.placementMode = ["free","aligned","precise"].includes(state.coach.placementMode) ? state.coach.placementMode : "aligned";
  state.coach.pendingTemplate = state.coach.pendingTemplate || null;
  state.coach.selectedObjectIds = Array.isArray(state.coach.selectedObjectIds) ? state.coach.selectedObjectIds : [];
  return state.coach;
}
function isCoachMode(){ return !!(state.ui && state.ui.appMode === "coach"); }
function isCoachHalfCourt(){ return isCoachMode() && ensureCoachState().courtMode === "half"; }
const COACH_COURT_CROP_X = 0.07;
const COACH_HALF_SPAN = 0.60;
function coachHalfStart(){
  const c = ensureCoachState();
  return c.halfView === "top" ? 0 : (1 - COACH_HALF_SPAN);
}
function coachViewportToCourtNorm(x, y){
  let nx = x;
  let ny = y;
  if (isCoachMode()){
    nx = (nx + COACH_COURT_CROP_X) / (1 + COACH_COURT_CROP_X * 2);
    if (isCoachHalfCourt()) ny = coachHalfStart() + ny * COACH_HALF_SPAN;
  }
  if (state.ui && state.ui.rotated){ nx = 1 - nx; ny = 1 - ny; }
  return { x:clamp01(nx), y:clamp01(ny) };
}
function isCoachObjectTool(tool){ return ["cone","hoop","basket","ladder","player","coach","target","text","dash"].includes(tool); }

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
      saveLoadMode:"save",
      appMode:"match"
    },
    coach: createDefaultCoachState()
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
    score: "Marcador",
    finish: "Finalizar",
    resume: "Reanudar",
    newItem: "Nuevo",
    objects: "Objetos",
    direction: "Dirección",
    pattern: "Patrón",
    undoPattern: "Deshacer patrón",
    preview: "Preview",
    save: "Guardar",
    rotate: "Rotar",
    undoPoint: "Deshacer punto",
    undoShot: "Deshacer golpe",
    reset: "Reiniciar",
    undo: "Deshacer",
    redo: "Rehacer",
    exerciseData: "Datos del ejercicio",
    exerciseSequence: "Secuencia del ejercicio",
    coachMode: "Modo entrenador",
    coachModeHalf: "Modo entrenador · media pista",
    exerciseEditor: "Editor de ejercicios y patrones",
    fullCourt: "Pista completa",
    halfCourt: "Media pista",
    backToFullCourt: "Volver a pista completa",
    activateHalfCourt: "Activar media pista",
    startTapCourt: "Inicio: toca la pista",
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
    score: "Score",
    finish: "Finish",
    resume: "Resume",
    newItem: "New",
    objects: "Objects",
    direction: "Direction",
    pattern: "Pattern",
    undoPattern: "Undo pattern",
    preview: "Preview",
    save: "Save",
    rotate: "Rotate",
    undoPoint: "Undo point",
    undoShot: "Undo shot",
    reset: "Reset",
    undo: "Undo",
    redo: "Redo",
    exerciseData: "Exercise details",
    exerciseSequence: "Exercise sequence",
    coachMode: "Coach mode",
    coachModeHalf: "Coach mode · half court",
    exerciseEditor: "Exercise and pattern editor",
    fullCourt: "Full court",
    halfCourt: "Half court",
    backToFullCourt: "Back to full court",
    activateHalfCourt: "Activate half court",
    startTapCourt: "Start: tap the court",
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
  renderAll();
  applyI18n();
  try{ window.dispatchEvent(new Event("resize")); }catch(e){}
  return false;
}
function toggleLanguage(){
  return setLanguage((state.lang || "es") === "en" ? "es" : "en");
}

const TDT_TEXT_TRANSLATIONS = {
  "PLATAFORMA PROFESIONAL DE TRACKING Y ANÁLISIS":"PROFESSIONAL TRACKING AND ANALYTICS PLATFORM",
  "Registra. Analiza. Mejora.":"Track. Analyze. Improve.",
  "Una experiencia premium para entrenadores, academias y jugadores que necesitan datos claros, historial y decisiones de entrenamiento mejor fundamentadas.":"A premium experience for coaches, academies and players who need clear data, history and better-informed training decisions.",
  "Tracking punto a punto":"Point-by-point tracking",
  "Perfiles de jugador":"Player profiles",
  "Informes premium":"Premium reports",
  "Acceder":"Sign in",
  "Crear cuenta":"Create account",
  "Modo demo":"Demo mode",
  "Modo entrenador":"Coach mode",
  "También puedes pulsar cualquier zona de la portada para continuar.":"You can also tap anywhere on the cover to continue.",
  "Convierte el tracking en una plataforma con imagen profesional.":"Turn tracking into a professional-looking platform.",
  "Esta versión añade acceso de usuario local, onboarding, biblioteca de jugadores, panel ejecutivo y una presentación comercial más potente dentro de la propia web.":"This version adds local user access, onboarding, a player library, an executive dashboard and a stronger commercial presentation within the web app.",
  "Operativa clara":"Clear workflow",
  "Acceso de entrenador, sesiones separadas por usuario y datos organizados por cuenta.":"Coach access, user-separated sessions and account-organized data.",
  "Más valor para el cliente":"More value for the client",
  "Perfiles de jugador, objetivos, debilidades, fortalezas y recomendaciones rápidas.":"Player profiles, goals, weaknesses, strengths and quick recommendations.",
  "Imagen premium":"Premium image",
  "Presentación, pricing visual, ayuda, privacidad y una experiencia más sólida y moderna.":"Presentation, visual pricing, help, privacy and a more solid, modern experience.",
  "Entrenador individual":"Individual coach",
  "Tracking, analíticas, exportación y biblioteca básica de jugadores.":"Tracking, analytics, export and a basic player library.",
  "Para academias y staffs":"For academies and staffs",
  "Más contexto, mejor onboarding y una experiencia más preparada para comercializar.":"More context, better onboarding and an experience more ready for commercialization.",
  "Escalable":"Scalable",
  "Base ideal para después conectar backend, suscripciones y base de datos real.":"Ideal base to later connect a backend, subscriptions and a real database.",
  "Centro de ayuda":"Help center",
  "Privacidad y términos":"Privacy and terms",
  "Contraseña":"Password",
  "Tu contraseña":"Your password",
  "Recordar sesión en este dispositivo":"Remember session on this device",
  "Entrar en la plataforma":"Enter the platform",
  "Entrar en modo demo":"Enter demo mode",
  "Entrar en modo entrenador":"Enter coach mode",
  "Nombre profesional":"Professional name",
  "Nombre del entrenador o academia":"Coach or academy name",
  "Mínimo 8 caracteres":"Minimum 8 characters",
  "Plan visual":"Visual plan",
  "Crear cuenta y entrar":"Create account and enter",
  "Esta versión funciona sin backend.":"This version works without a backend.",
  "Las cuentas, perfiles y partidos quedan guardados en este dispositivo por usuario. Es una base muy útil para demo, validación comercial y preparación del siguiente paso con base de datos real.":"Accounts, profiles and matches are saved on this device per user. It is a useful base for demos, commercial validation and preparing the next step with a real database.",
  "Acceso técnico a la interfaz":"Technical access to the interface",
  "Solo para revisión interna si el acceso local falla.":"Only for internal review if local access fails.",
  "Menú":"Menu",
  "Acciones":"Actions",
  "Reportes":"Reports",
  "Configuración":"Settings",
  "Guardar partido":"Save match",
  "Cargar partido":"Load match",
  "Modo de juego":"Game mode",
  "Cambiar pista":"Change court",
  "Idioma":"Language",
  "Volver":"Back",
  "Cerrar":"Close",
  "Aplicar":"Apply",
  "Iniciar":"Start",
  "Datos del partido":"Match details",
  "Secuencia del punto":"Point sequence",
  "Secuencia del ejercicio":"Exercise sequence",
  "Último:":"Last:",
  "Gráficos":"Charts",
  "Historial":"History",
  "Analíticas":"Analytics",
  "Estadísticas":"Stats",
  "Exportar":"Export",
  "Marcador":"Score",
  "Finalizar":"Finish",
  "Reanudar":"Resume",
  "Nuevo":"New",
  "Objetos":"Objects",
  "Dirección":"Direction",
  "Patrón":"Pattern",
  "Deshacer patrón":"Undo pattern",
  "Preview":"Preview",
  "Guardar":"Save",
  "Rotar":"Rotate",
  "Deshacer punto":"Undo point",
  "Deshacer golpe":"Undo shot",
  "Reiniciar":"Reset",
  "Deshacer":"Undo",
  "Rehacer":"Redo",
  "Datos del ejercicio":"Exercise details",
  "Objetos y material":"Objects and equipment",
  "Flecha de dirección":"Direction arrow",
  "Finalizar patrón":"Finish pattern",
  "Deshacer último patrón":"Undo last pattern",
  "Preview ejercicio":"Exercise preview",
  "Guardar ejercicio":"Save exercise",
  "Rotar pista":"Rotate court",
  "Deshacer acción":"Undo action",
  "Rehacer acción":"Redo action",
  "Nuevo ejercicio":"New exercise",
  "Se limpiará la pista del ejercicio actual.":"The current exercise court will be cleared.",
  "Nuevo partido":"New match",
  "Se reiniciará el marcador y el historial del partido actual.":"The score and history of the current match will be reset.",
  "Finalizar partido":"Finish match",
  "¿Quieres finalizar el partido? Podrás reanudarlo desde el botón Reanudar.":"Do you want to finish the match? You can resume it from the Resume button.",
  "Reanudar partido":"Resume match",
  "¿Quieres reanudar el partido?":"Do you want to resume the match?",
  "Limpiar pista":"Clear court",
  "Se borrarán patrones y objetos del ejercicio actual.":"Patterns and objects from the current exercise will be deleted.",
  "Biblioteca de jugadores":"Player library",
  "Guarda perfiles y asígnalos a A o B":"Save profiles and assign them to A or B",
  "Elegir jugador":"Choose player",
  "Selecciona un perfil ya guardado y asígnalo a A o B.":"Select a saved profile and assign it to A or B.",
  "Nuevo jugador":"New player",
  "Crea un perfil nuevo con datos técnicos, fortalezas y notas.":"Create a new profile with technical data, strengths and notes.",
  "Nombre":"Name",
  "Edad o categoría":"Age or category",
  "Mano hábil":"Dominant hand",
  "Sexo":"Sex",
  "Objetivo principal":"Main goal",
  "Fortalezas":"Strengths",
  "Debilidades":"Weaknesses",
  "Notas del entrenador":"Coach notes",
  "Guardar perfil":"Save profile",
  "Nuevo perfil":"New profile",
  "Foto / ficha técnica":"Photo / technical profile",
  "Añade una imagen del jugador para identificarlo rápido en su perfil.":"Add a player image to identify them quickly in their profile.",
  "Subir foto":"Upload photo",
  "Quitar":"Remove",
  "Toca una ficha para ver, editar, borrar o asignar.":"Tap a card to view, edit, delete or assign.",
  "Cuenta y workspace":"Account and workspace",
  "Estado del acceso actual":"Current access status",
  "Ver onboarding":"View onboarding",
  "Cerrar sesión":"Log out",
  "Cómo sacar partido a la plataforma":"How to get the most from the platform",
  "Bienvenido al modo profesional":"Welcome to professional mode",
  "Checklist recomendada para empezar bien":"Recommended checklist to start well",
  "Ir a jugadores":"Go to players",
  "Entendido":"Got it",
  "Colocación":"Placement",
  "Libre":"Free",
  "Alineado":"Aligned",
  "Preciso":"Precise",
  "Plantillas rápidas":"Quick templates",
  "Fila horizontal":"Horizontal row",
  "Fila vertical":"Vertical row",
  "Fila diagonal":"Diagonal row",
  "Zigzag":"Zigzag",
  "Cuadrado":"Square",
  "Circuito":"Circuit",
  "Organizar selección":"Organize selection",
  "Alinear horizontal":"Align horizontal",
  "Alinear vertical":"Align vertical",
  "Distribuir horizontal":"Distribute horizontal",
  "Distribuir vertical":"Distribute vertical",
  "Quitar selección":"Clear selection",
  "Borrar selección":"Delete selection",
  "Toca objetos en la pista para seleccionarlos":"Tap objects on the court to select them"
};
const TDT_TEXT_TRANSLATIONS_REV = Object.fromEntries(Object.entries(TDT_TEXT_TRANSLATIONS).map(([k,v])=>[v,k]));
function translateLooseString(value){
  if (value == null) return value;
  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const dict = isEn() ? TDT_TEXT_TRANSLATIONS : TDT_TEXT_TRANSLATIONS_REV;
  const next = dict[trimmed];
  if (!next) return raw;
  return raw.replace(trimmed, next);
}
function applyLooseI18n(){
  const selector = 'button, span, div, strong, small, p, h1, h2, h3, label, summary, option, article, li, textarea, input';
  document.querySelectorAll(selector).forEach(el=>{
    if (!el || el.children.length > 0) return;
    const current = el.textContent;
    const translated = translateLooseString(current);
    if (translated !== current) el.textContent = translated;
  });
  ['placeholder','title','aria-label','alt'].forEach(attr=>{
    document.querySelectorAll('['+attr+']').forEach(el=>{
      const current = el.getAttribute(attr);
      const translated = translateLooseString(current);
      if (translated !== current) el.setAttribute(attr, translated);
    });
  });
}

function applyI18n(){
  document.documentElement.lang = state.lang || "es";
  document.title = "Tennis Direction Tracker";
  const flag = document.getElementById('langFlag');
  if (flag) flag.textContent = (state.lang === 'en') ? '🇬🇧' : '🇪🇸';
  try{ updateEntryLanguageFlags(); }catch(e){}
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
  try{ applyLooseI18n(); }catch(e){ console.warn('Loose i18n failed', e); }
  upgradeCloseButtons();
}

function closeIconMarkup(){
  return `<svg class="svgIcon" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}
function upgradeCloseButtons(scope=document){
  const ids = [
    'btnClosePlayers','btnCloseDashboard','btnCloseAccount','btnCloseHelp','btnCloseLegal','btnCloseOnboarding',
    'btnCloseHistory','btnClosePointViewer','btnCloseAnalytics','btnCloseStats','btnCloseCharts','btnCloseExport',
    'btnCloseLanguage','btnCloseInfo','btnCloseSurface','btnCloseGameMode','btnCloseSaveLoad','btnCloseConfirm',
    'btnCloseCoachSave','btnCloseCoachLibrary','btnCloseCoachObjects','btnCloseCoachPreview'
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
    state.ui = state.ui || {theme:"dark", coach:true, showHistoryArrows:true, hideScore:false, rotated:false, hideRail:false, surface:"hard", chartPlayer:"A", saveLoadMode:"save", appMode:"match"};
    if (typeof state.ui.showHistoryArrows === "undefined") state.ui.showHistoryArrows = true;
    if (typeof state.ui.hideScore === "undefined") state.ui.hideScore = false;
    if (typeof state.ui.rotated === "undefined") state.ui.rotated = false;
    if (typeof state.ui.hideRail === "undefined") state.ui.hideRail = false;
    if (!state.ui.surface) state.ui.surface = "hard";
    if (!state.ui.chartPlayer) state.ui.chartPlayer = "A";
    if (!state.ui.saveLoadMode) state.ui.saveLoadMode = "save";
    if (!state.ui.appMode) state.ui.appMode = "match";
    ensureCoachState();
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
  if (isCoachMode()) return coachViewportToCourtNorm(x, y);
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
  if (isCoachMode()) return coachViewportToCourtNorm(x, y);
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
      <marker id="ahD" viewBox="0 0 10 10" refX="9.0" refY="5" markerWidth="8.2" markerHeight="8.2" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffffff"></path>
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
    const isDash = a.type === "dash" || a.type === "dashLine" || a.kind === "dash";
    path.classList.add("arrowLine", isDash ? "dash" : (a.hitter==="A"?"a":"b"), "subtle");
    path.setAttribute("stroke-width", isDash ? "4.6" : "4.2");
    if (isDash) path.setAttribute("stroke-dasharray", "18 14");
    path.setAttribute("marker-end", `url(#${isDash ? "ahD" : (a.hitter==="A"?"ahA":"ahB")})`);

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
    c.classList.add("arrowNumCircle", isDash ? "dash" : (a.hitter==="A"?"a":"b"));
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
  let arrows = p && p.arrows ? p.arrows : [];
  if (isCoachMode()) arrows = getAllCoachArrows();
  if (!arrows || arrows.length===0){
    svg.innerHTML = arrowDefs();
    __liveArrowCountRendered = 0;
    return;
  }
  const animateFromIndex = (animate && arrows.length > __liveArrowCountRendered) ? __liveArrowCountRendered : null;
  __liveArrowCountRendered = arrows.length;
  renderArrows(svg, arrows, { animateFromIndex, fadeOld:!isCoachMode() });
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
  if (isCoachMode()){
    document.querySelectorAll(".zoneCell, .serveCell").forEach(el=> el.classList.remove("disabled","hidden"));
    return;
  }
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
  if (isCoachMode()){
    const c = ensureCoachState();
    const showGrid = !!c.showGrid;
    const serveTop=$("#serveTop"), serveBottom=$("#serveBottom"), rallyTop=$("#rallyTop"), rallyBottom=$("#rallyBottom");
    if (serveTop) serveTop.classList.add("hidden");
    if (serveBottom) serveBottom.classList.add("hidden");
    if (rallyTop) rallyTop.classList.toggle("hidden", !showGrid);
    if (rallyBottom) rallyBottom.classList.toggle("hidden", !showGrid);
    updateServeLabelPlacement();
    return;
  }
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
  if (isCoachMode()){
    handleCoachCourtToolFromElement(el, null, side);
    return;
  }
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
  if (isCoachMode()){
    handleCoachCourtToolFromElement(el, evt, side);
    return;
  }
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
    if (last) last.textContent = isCoachMode() ? "Inicio: toca la pista" : "Último: —";
    clearLiveArrows();
    return;
  }

  const tokens = p.events.map(eventTokenText);
  if (last){
    last.textContent = tokens.length ? (isCoachMode() ? `Patrón activo: ${tokens[tokens.length-1]}` : `Último: ${tokens[tokens.length-1]}`) : (isCoachMode() ? "Inicio: toca la pista" : "Último: —");
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
    const hasImportant = pts.some(p => !!p.important);
    g.innerHTML = `
      <div class="historyGameHead">
        <div style="min-width:0;">
          <div class="historyGameTitle">${hasImportant ? `<span class="miniFlag inGameHeader" title="${tr("Juego con punto importante","Game has an important point")}"></span>` : ""}${tr("Juego","Game")} ${info.num || "—"}</div>
          <div class="historyGameMeta">${escapeHtml(meta)} · ${pts.length} ${tr("punto(s)","point(s)")}${hasImportant ? ` · ${tr("Hay punto importante","Important point inside")}` : ""}</div>
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

function analyticsPlayerName(persp){
  return persp === "B" ? (state.names.B || "Jugador B") : (state.names.A || "Jugador A");
}
function analyticsPct(num, den){
  if (!den) return 0;
  return Math.round((num / den) * 100);
}
function analyticsFmtPct(num, den){
  return `${analyticsPct(num, den)}%`;
}
function analyticsDirName(dir){
  return dir === "C" ? tr("cruzado","crosscourt") : dir === "M" ? tr("al centro","middle") : tr("paralelo","down the line");
}
function analyticsDepthName(depth){
  return depth === "P" ? tr("profundo","deep") : depth === "M" ? tr("medio","mid") : tr("corto","short");
}
function analyticsServeName(target){
  const t = target === "W" ? "A" : target;
  if (t === "T") return tr("T","T");
  if (t === "C") return tr("cuerpo","body");
  return tr("abierto","wide");
}
function analyticsContextLabel(key){
  const map = {
    all: tr("Todo el partido","Full match"),
    important: tr("Puntos importantes","Important points"),
    break_for: tr("Break point a favor","Break point for"),
    break_against: tr("Break point en contra","Break point against"),
    deuce: tr("Deuce / ventaja","Deuce / advantage"),
    game: tr("Game points","Game points"),
    set: tr("Set points","Set points"),
    tb: tr("Tie-break","Tie-break"),
    serve: tr("Puntos al saque","Serve points"),
    return: tr("Puntos al resto","Return points"),
    normal: tr("Punto normal","Regular point")
  };
  return map[key] || key;
}
function analyticsShortContextLabel(key){
  const map = {
    important: tr("Importantes","Important"),
    break_for: tr("Break a favor","Break for"),
    break_against: tr("Break en contra","Break against"),
    deuce: tr("Deuce/Adv","Deuce/Adv"),
    game: tr("Game point","Game point"),
    set: tr("Set point","Set point"),
    tb: tr("Tie-break","Tie-break"),
    serve: tr("Saque","Serve"),
    return: tr("Resto","Return"),
    normal: tr("Normal","Regular")
  };
  return map[key] || analyticsContextLabel(key);
}
function analyticsModeLabel(key){
  return key === "similar" ? tr("Similar táctico","Tactical similarity") : key === "effective" ? tr("Más eficaces","Most effective") : tr("Exacto","Exact");
}
function analyticsContextMatch(p, persp, context){
  if (!context || context === "all") return true;
  const self = pointContextFlags(p, persp);
  const opp = pointContextFlags(p, other(persp));
  if (context === "important") return !!self.important;
  if (context === "break_for") return !!self.breakPointForPersp;
  if (context === "break_against") return !!opp.breakPointForPersp;
  if (context === "deuce") return !!self.deuceAdv;
  if (context === "game") return !!self.gamePointForPersp;
  if (context === "set") return !!self.setPointForPersp;
  if (context === "tb") return !!self.isTB;
  if (context === "serve") return p.server === persp;
  if (context === "return") return p.server !== persp;
  return true;
}
function analyticsPointTags(p, persp){
  const self = pointContextFlags(p, persp);
  const opp = pointContextFlags(p, other(persp));
  const tags = [];
  if (self.breakPointForPersp) tags.push("break_for");
  if (opp.breakPointForPersp) tags.push("break_against");
  if (self.setPointForPersp) tags.push("set");
  else if (self.gamePointForPersp) tags.push("game");
  if (self.deuceAdv) tags.push("deuce");
  if (self.isTB) tags.push("tb");
  if (self.important && !tags.length) tags.push("important");
  if (!tags.length) tags.push("normal");
  tags.push(p.server === persp ? "serve" : "return");
  return tags;
}
function analyticsPrimaryContext(p, persp){
  const tags = analyticsPointTags(p, persp).filter(t => !["serve","return"].includes(t));
  return tags[0] || "normal";
}
function analyticsSequenceTokens(p, includeServe){
  const evs = Array.isArray(p?.events) ? p.events : [];
  const out = [];
  evs.forEach(ev => {
    if (!ev) return;
    if (ev.type === "serve"){
      if (!includeServe) return;
      const metaTarget = String(ev?.meta?.target || "").toUpperCase();
      const codeMatch = String(ev?.code || "").trim().toUpperCase().match(/(?:^|\s)(T|C|A|W)$/);
      const target = (metaTarget || (codeMatch ? codeMatch[1] : "")).replace("W", "A");
      if (!["T","C","A"].includes(target)) return;
      out.push({
        phase: "serve",
        kind: "serve",
        player: ev.player,
        target,
        key: `S:${target}`,
        exactKey: `S:${target}`,
        similarKey: `S:${target}`,
        short: `S ${target}`,
        long: `${tr("Saque","Serve")} ${analyticsServeName(target)}`
      });
      return;
    }
    if (ev.type !== "rally") return;
    const normalized = normalizeShotCode(ev.code);
    const dd = decodeDirDepth(normalized.code);
    if (!dd) return;
    const phase = normalized.isReturn ? "return" : "rally";
    const phaseShort = phase === "return" ? tr("R","R") : tr("G","S");
    out.push({
      phase,
      kind: phase,
      player: ev.player,
      dir: dd.dir,
      depth: dd.depth,
      code: normalized.code,
      key: `${phase}:${normalized.code}`,
      exactKey: `${phase}:${normalized.code}`,
      similarKey: `${phase}:${dd.dir}`,
      short: `${phaseShort} ${dd.dir}${dd.depth}`,
      long: `${phase === "return" ? tr("Resto","Return") : tr("Golpe","Shot")} ${analyticsDirName(dd.dir)} ${analyticsDepthName(dd.depth)}`
    });
  });
  return out;
}
function pointPattern(p, includeServe){
  return analyticsSequenceTokens(p, includeServe).map(tok => tok.short).join(" - ");
}
function extractDirToken(ev){
  const t = String(ev?.code||"").trim().toUpperCase();
  if (!t) return null;
  if (t.startsWith("S ")){
    const parts = t.split(/\s+/);
    const trg = (parts[2] || parts[parts.length-1] || "").replace("W", "A");
    return ["T","C","A"].includes(trg) ? ("S" + trg) : null;
  }
  const r = t.replace(/^R\s+/,"").trim();
  const m = r.match(/(CC|CP|CM|MC|MM|MP|PC|PM|PP)$/);
  return m ? m[1] : null;
}
function patternTokens(p, includeServe){
  return analyticsSequenceTokens(p, includeServe).map(tok => tok.kind === "serve" ? `S${tok.target}` : tok.code);
}
function momentMatch(p, moment){
  return analyticsContextMatch(p, "A", moment) || analyticsContextMatch(p, "B", moment);
}
function analyticsPatternLabel(tokens){
  return (tokens || []).map(t => escapeHtml(t.short)).join('<span class="analyticsArrowSep">→</span>');
}
function analyticsPatternLong(tokens){
  return (tokens || []).map(t => escapeHtml(t.long)).join(' <span class="analyticsArrowSep">→</span> ');
}
function analyticsUnique(arr){
  return [...new Set(arr)];
}
function analyticsTopKey(obj){
  return Object.entries(obj || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
}
function analyticsDominantSide(sideCounts){
  const sd = sideCounts?.SD || 0;
  const sv = sideCounts?.SV || 0;
  if (!sd && !sv) return "—";
  if (sd === sv) return tr("Equilibrado","Balanced");
  return sd > sv ? "Deuce" : "Ad";
}
function analyticsWindowStats(points, persp, opts={}){
  const includeServe = opts.includeServe !== false;
  const len = Math.max(2, parseInt(opts.len || 3, 10));
  const mode = opts.mode || "exact";
  const map = {};
  (Array.isArray(points) ? points : []).forEach(p => {
    const toks = analyticsSequenceTokens(p, includeServe);
    if (toks.length < len) return;
    const seen = new Set();
    for (let i=0; i<=toks.length-len; i++){
      const slice = toks.slice(i, i+len);
      const key = slice.map(tok => mode === "similar" ? tok.similarKey : tok.exactKey).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      if (!map[key]){
        map[key] = {
          key,
          len,
          count:0,
          wins:0,
          losses:0,
          tokens:slice,
          points:[],
          contexts:{},
          starts:{serve:0, return:0, rally:0},
          sides:{SD:0, SV:0}
        };
      }
      const it = map[key];
      it.count++;
      if (p.winner === persp) it.wins++; else it.losses++;
      it.points.push(p.n);
      const ctx = analyticsPrimaryContext(p, persp);
      it.contexts[ctx] = (it.contexts[ctx] || 0) + 1;
      const firstPhase = slice[0]?.phase || "rally";
      it.starts[firstPhase] = (it.starts[firstPhase] || 0) + 1;
      if (p.side === "SD" || p.side === "SV") it.sides[p.side] = (it.sides[p.side] || 0) + 1;
    }
  });
  return Object.values(map).map(it => {
    const uniquePoints = analyticsUnique(it.points);
    return {
      ...it,
      points: uniquePoints,
      winRate: analyticsPct(it.wins, it.count),
      dominantContext: analyticsTopKey(it.contexts) || "normal",
      dominantStart: analyticsTopKey(it.starts) || "rally",
      dominantSide: analyticsDominantSide(it.sides),
      label: analyticsPatternLabel(it.tokens),
      longLabel: analyticsPatternLong(it.tokens)
    };
  });
}
function computeSimilarPatternStats(points, includeServe){
  const items = analyticsWindowStats(points, "A", { includeServe, len:3, mode:"similar" });
  const map = {};
  items.forEach(it => {
    map[it.key] = { key: it.key, len: it.len, count: it.count, winA: it.wins, winB: it.losses, points: it.points, bestRate: it.winRate/100, dominant: it.winRate===50 ? "Igual" : (it.winRate>50 ? "A" : "B") };
  });
  return map;
}
function analyticsContextSummary(points, persp){
  const groups = ["important","break_for","break_against","deuce","game","set","tb","serve","return"];
  return groups.map(key => {
    const pts = (points || []).filter(p => analyticsContextMatch(p, persp, key));
    const wins = pts.filter(p => p.winner === persp).length;
    return { key, label: analyticsShortContextLabel(key), count: pts.length, wins, winRate: analyticsPct(wins, pts.length) };
  }).filter(x => x.count > 0);
}
function analyticsTopDirection(obj){
  const top = Object.entries(obj || {}).sort((a,b)=>b[1]-a[1])[0];
  if (!top || !top[1]) return null;
  return { key: top[0], count: top[1], label: analyticsDirName(top[0]) };
}
function analyticsBuildInsights(allPoints, filteredPoints, persp, patterns, filteredStatsAll){
  const insights = [];
  const allWins = (allPoints || []).filter(p => p.winner === persp).length;
  const importantPoints = (allPoints || []).filter(p => analyticsContextMatch(p, persp, 'important'));
  const importantWins = importantPoints.filter(p => p.winner === persp).length;
  const breakAgainst = (allPoints || []).filter(p => analyticsContextMatch(p, persp, 'break_against'));
  const breakAgainstWins = breakAgainst.filter(p => p.winner === persp).length;
  const deucePts = (allPoints || []).filter(p => analyticsContextMatch(p, persp, 'deuce'));
  const deuceStats = computeStats(deucePts || []);
  const deuceTopReturn = analyticsTopDirection(deuceStats?.[persp]?.returnDir || {});
  const topPattern = patterns[0];
  const bestPattern = [...patterns].sort((a,b)=> (b.winRate - a.winRate) || (b.count - a.count))[0];
  const ps = filteredStatsAll?.[persp] || emptyPlayerStats();
  const topReturn = analyticsTopDirection(ps.returnDir || {});
  const serveTargets = Object.entries(ps.serveTargets || {}).sort((a,b)=>b[1]-a[1]);
  const topServe = serveTargets[0];

  if (importantPoints.length >= 4){
    const diff = analyticsPct(importantWins, importantPoints.length) - analyticsPct(allWins, Math.max(1, allPoints.length));
    if (diff <= -8){
      insights.push({ title: tr("Presión","Pressure"), body: tr("El rendimiento baja en puntos importantes respecto al promedio general.","Performance drops on important points versus the overall average.") + ` (${analyticsFmtPct(importantWins, importantPoints.length)} vs ${analyticsFmtPct(allWins, Math.max(1, allPoints.length))}).` });
    } else if (diff >= 8){
      insights.push({ title: tr("Presión","Pressure"), body: tr("El jugador sube prestaciones en puntos importantes.","The player raises the level on important points.") + ` (${analyticsFmtPct(importantWins, importantPoints.length)}).` });
    }
  }
  if (breakAgainst.length >= 3){
    insights.push({ title: tr("Break points en contra","Break points against"), body: tr("Balance en situaciones de break en contra:","Result on break points against:") + ` ${analyticsFmtPct(breakAgainstWins, breakAgainst.length)}.` });
  }
  if (deucePts.length >= 3 && deuceTopReturn && deuceTopReturn.count / Math.max(1, deucePts.length) >= 0.6){
    insights.push({ title: tr("Variedad al resto","Return variety"), body: tr("En deuce/ventaja se repite demasiado una dirección al resto:","In deuce/advantage the return direction becomes too repetitive:") + ` ${deuceTopReturn.label}.` });
  }
  if (topPattern && topPattern.count >= 2){
    insights.push({ title: tr("Patrón recurrente","Recurring pattern"), body: `${topPattern.longLabel.replace(/<[^>]+>/g, '')}. ${tr("Aparece","Appears")} ${topPattern.count} ${tr("veces","times")} ${tr("y gana","and wins")} ${topPattern.winRate}%.` });
  }
  if (bestPattern && bestPattern.count >= 2 && bestPattern.winRate >= 65){
    insights.push({ title: tr("Secuencia eficaz","Effective sequence"), body: `${bestPattern.longLabel.replace(/<[^>]+>/g, '')}. ${tr("Convierte","Converts")} ${bestPattern.winRate}% ${tr("de los puntos detectados.","of the detected points.")}` });
  }
  if (topReturn && (ps.returnsIn || 0) >= 3){
    insights.push({ title: tr("Dirección dominante al resto","Dominant return direction"), body: tr("La dirección más usada al resto es","The most used return direction is") + ` ${topReturn.label}.` });
  }
  if (topServe && topServe[1] >= 3){
    insights.push({ title: tr("Tendencia al saque","Serve tendency"), body: tr("El saque se orienta sobre todo a","Serve location is mainly") + ` ${analyticsServeName(topServe[0])}.` });
  }
  if (!insights.length){
    insights.push({ title: tr("Base inicial","Starting point"), body: tr("Todavía hay pocos puntos para una lectura táctica profunda. El módulo ya está preparado y mejorará al registrar más secuencias.","There are still too few points for deep tactical reading. The module is ready and will become more useful as more points are tracked.") });
  }
  return insights.slice(0, 6);
}
function analyticsBarList(title, obj, kind, total){
  const entries = Object.entries(obj || {}).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) return `
    <div class="analyticsPanel analyticsPanelSoft">
      <div class="analyticsPanelTitle">${escapeHtml(title)}</div>
      <div class="analyticsEmpty">${tr("Sin datos todavía.","No data yet.")}</div>
    </div>`;
  const labeler = kind === "serve"
    ? (k => analyticsServeName(k))
    : kind === "depth"
      ? (k => analyticsDepthName(k))
      : (k => analyticsDirName(k));
  return `
    <div class="analyticsPanel analyticsPanelSoft">
      <div class="analyticsPanelTitle">${escapeHtml(title)}</div>
      <div class="analyticsBars">${entries.map(([k,v]) => {
        const pct = analyticsPct(v, total || entries.reduce((sum, x)=>sum + x[1], 0));
        return `<div class="analyticsBarRow"><div class="analyticsBarLabel">${escapeHtml(labeler(k))}</div><div class="analyticsBarTrack"><span style="width:${pct}%"></span></div><div class="analyticsBarValue">${v} · ${pct}%</div></div>`;
      }).join("")}</div>
    </div>`;
}
function analyticsKpiCard(label, value, note){
  return `<article class="analyticsKpiCard"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note || "")}</small></article>`;
}
function analyticsPointRow(p, persp, includeServe){
  const tags = analyticsPointTags(p, persp).filter((v, idx, arr) => arr.indexOf(v) === idx && v !== "serve" && v !== "return").slice(0,2);
  const result = p.winner === persp ? tr("Ganado","Won") : tr("Perdido","Lost");
  return `<div class="analyticsPointRow">
    <div class="analyticsPointMain">
      <div class="analyticsPointTop">
        <strong>${tr("Punto","Point")} ${p.n}</strong>
        <span>${escapeHtml(formatSnapshot(p.snapshot))}</span>
      </div>
      <div class="analyticsPointSeq">${analyticsPatternLabel(analyticsSequenceTokens(p, includeServe).slice(0, 4)) || tr("Sin secuencia","No sequence")}</div>
      <div class="analyticsPointMeta">
        <span class="analyticsStatus ${p.winner === persp ? 'good' : 'bad'}">${escapeHtml(result)}</span>
        ${tags.map(tag => `<span class="analyticsTag">${escapeHtml(analyticsShortContextLabel(tag))}</span>`).join("")}
      </div>
    </div>
    <button class="chip" type="button" data-point-open="${p.n}">${tr("Ver punto","Open point")}</button>
  </div>`;
}
function analyticsPatternCard(it){
  return `<article class="analyticsPatternCard">
    <div class="analyticsPatternTop">
      <div class="analyticsPatternSeq">${it.label}</div>
      <span class="analyticsPatternCount">${it.count}x</span>
    </div>
    <div class="analyticsPatternMeta">
      <span>${tr("Éxito","Win rate")}: <b>${it.winRate}%</b></span>
      <span>${tr("Contexto","Context")}: <b>${escapeHtml(analyticsShortContextLabel(it.dominantContext))}</b></span>
      <span>${tr("Inicio","Start")}: <b>${escapeHtml(it.dominantStart === 'serve' ? tr('Saque','Serve') : it.dominantStart === 'return' ? tr('Resto','Return') : tr('Rally','Rally'))}</b></span>
      <span>${tr("Lado","Side")}: <b>${escapeHtml(it.dominantSide)}</b></span>
    </div>
    <div class="analyticsPatternPoints">${it.points.slice(0,8).map(n => `<button class="analyticsPointMiniBtn" type="button" data-point-open="${n}">${n}</button>`).join('')}</div>
  </article>`;
}

function analyticsCurrentFilters(){
  state.ui = state.ui || {};
  if (!state.ui.analyticsTab) state.ui.analyticsTab = 'summary';
  const filters = {
    persp: $('#aPerspective')?.value || state.ui.analyticsPerspective || 'A',
    context: $('#aContext')?.value || state.ui.analyticsContext || 'all',
    includeServe: $('#aIncludeServe')?.checked ?? true,
    mode: $('#aMode')?.value || 'exact',
    minCount: parseInt($('#aMin')?.value || '2', 10) || 2,
    len: parseInt($('#aPatternLen')?.value || '3', 10) || 3
  };
  state.ui.analyticsPerspective = filters.persp;
  state.ui.analyticsContext = filters.context;
  persist();
  return filters;
}
function analyticsDirectionMatrix(points, persp, phase='rally'){
  const matrix = {
    P:{C:0,M:0,P:0},
    M:{C:0,M:0,P:0},
    C:{C:0,M:0,P:0}
  };
  (Array.isArray(points) ? points : []).forEach(p => {
    (Array.isArray(p?.events) ? p.events : []).forEach(ev => {
      if (!ev || ev.type !== 'rally' || ev.player !== persp) return;
      const normalized = normalizeShotCode(ev.code);
      const isReturn = normalized.isReturn;
      if (phase === 'return' && !isReturn) return;
      if (phase === 'rally' && isReturn) return;
      const dd = decodeDirDepth(normalized.code);
      if (!dd || !matrix[dd.depth] || matrix[dd.depth][dd.dir] === undefined) return;
      matrix[dd.depth][dd.dir]++;
    });
  });
  return matrix;
}
function analyticsHeatCell(label, value, max){
  const pct = max ? Math.max(0.12, value / max) : 0;
  const alpha = value ? Math.min(0.92, pct) : 0.08;
  return `<div class="analyticsHeatCell ${value ? 'active' : ''}" style="--heat:${alpha};"><span>${escapeHtml(label)}</span><strong>${value || 0}</strong></div>`;
}
function analyticsServeHeatmap(title, counts, subtitle=''){
  const safe = { A: counts?.A || 0, C: counts?.C || 0, T: counts?.T || 0 };
  const max = Math.max(safe.A, safe.C, safe.T, 1);
  const total = safe.A + safe.C + safe.T;
  return `
    <div class="analyticsPanel analyticsPanelSoft analyticsHeatPanel">
      <div class="analyticsPanelTitle">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="analyticsPanelSub">${escapeHtml(subtitle)}</div>` : ''}
      <div class="analyticsHeatmapCourt analyticsHeatmapCourtServe">
        <div class="analyticsServeNet"></div>
        <div class="analyticsServeBox analyticsServeBox-wide">${analyticsHeatCell(tr('Abierto','Wide'), safe.A, max)}</div>
        <div class="analyticsServeBox analyticsServeBox-body">${analyticsHeatCell(tr('Cuerpo','Body'), safe.C, max)}</div>
        <div class="analyticsServeBox analyticsServeBox-t">${analyticsHeatCell(tr('T','T'), safe.T, max)}</div>
      </div>
      <div class="analyticsHeatLegend">${[
        [tr('Abierto','Wide'), safe.A],
        [tr('Cuerpo','Body'), safe.C],
        ['T', safe.T]
      ].map(([label,val]) => `<span>${escapeHtml(label)} · ${analyticsFmtPct(val, Math.max(1,total))}</span>`).join('')}</div>
    </div>`;
}
function analyticsMatrixHeatmap(title, matrix, subtitle=''){
  const rows = ['P','M','C'];
  const cols = ['C','M','P'];
  const max = Math.max(1, ...rows.flatMap(r => cols.map(c => matrix?.[r]?.[c] || 0)));
  const total = rows.reduce((sum, r) => sum + cols.reduce((acc, c) => acc + (matrix?.[r]?.[c] || 0), 0), 0);
  return `
    <div class="analyticsPanel analyticsPanelSoft analyticsHeatPanel">
      <div class="analyticsPanelTitle">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="analyticsPanelSub">${escapeHtml(subtitle)}</div>` : ''}
      <div class="analyticsHeatmapCourt analyticsHeatmapCourtMatrix">
        <div class="analyticsCourtAxis analyticsCourtAxis-top">${[tr('Cruzado','Crosscourt'), tr('Centro','Middle'), tr('Paralelo','Down the line')].map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>
        <div class="analyticsCourtAxis analyticsCourtAxis-side">${[tr('Profundo','Deep'), tr('Medio','Mid'), tr('Corto','Short')].map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>
        <div class="analyticsHeatMatrix">${rows.map(r => cols.map(c => analyticsHeatCell(`${analyticsDepthName(r)} · ${analyticsDirName(c)}`, matrix?.[r]?.[c] || 0, max)).join('')).join('')}</div>
      </div>
      <div class="analyticsHeatLegend">${[
        [tr('Cruzado','Crosscourt'), rows.reduce((sum,r)=>sum + (matrix?.[r]?.C || 0),0)],
        [tr('Centro','Middle'), rows.reduce((sum,r)=>sum + (matrix?.[r]?.M || 0),0)],
        [tr('Paralelo','Down the line'), rows.reduce((sum,r)=>sum + (matrix?.[r]?.P || 0),0)]
      ].map(([label,val]) => `<span>${escapeHtml(label)} · ${analyticsFmtPct(val, Math.max(1,total))}</span>`).join('')}</div>
    </div>`;
}
function analyticsCollectData(){
  const filters = analyticsCurrentFilters();
  const { persp, context, includeServe, mode, minCount, len } = filters;
  const allPoints = Array.isArray(state.matchPoints) ? state.matchPoints.slice() : [];
  const filteredPoints = allPoints.filter(p => analyticsContextMatch(p, persp, context));
  const filteredStatsAll = computeStats(filteredPoints);
  const filteredStats = filteredStatsAll?.[persp] || emptyPlayerStats();
  const allStatsAll = computeStats(allPoints);
  const allStats = allStatsAll?.[persp] || emptyPlayerStats();
  const patternMode = mode === 'similar' ? 'similar' : 'exact';
  let patterns = analyticsWindowStats(filteredPoints, persp, { includeServe, len, mode: patternMode });
  patterns = patterns.filter(it => it.count >= minCount);
  if (mode === 'effective') patterns.sort((a,b)=> (b.winRate - a.winRate) || (b.count - a.count));
  else patterns.sort((a,b)=> (b.count - a.count) || (b.winRate - a.winRate));
  const topPattern = patterns[0] || null;
  const bestPattern = patterns.slice().sort((a,b)=> (b.winRate - a.winRate) || (b.count - a.count))[0] || null;
  const contextSummary = analyticsContextSummary(filteredPoints, persp);
  const insights = analyticsBuildInsights(allPoints, filteredPoints, persp, patterns, filteredStatsAll);
  const serveHeat = { A: filteredStats.serveTargets?.A || 0, C: filteredStats.serveTargets?.C || 0, T: filteredStats.serveTargets?.T || 0 };
  const returnHeat = analyticsDirectionMatrix(filteredPoints, persp, 'return');
  const rallyHeat = analyticsDirectionMatrix(filteredPoints, persp, 'rally');
  const importantPoints = filteredPoints.filter(p => analyticsContextMatch(p, persp, 'important'));
  const importantWins = importantPoints.filter(p => p.winner === persp).length;
  return {
    filters, persp, context, includeServe, mode, minCount, len,
    allPoints, filteredPoints, filteredStatsAll, filteredStats, allStatsAll, allStats,
    patterns, topPattern, bestPattern, contextSummary, insights, importantPoints, importantWins,
    serveHeat, returnHeat, rallyHeat
  };
}
function analyticsPrintHeatmapTable(title, cells, labels){
  const max = Math.max(1, ...cells.flat());
  return `
    <div style="border:1px solid #cbd5e1;border-radius:14px;padding:12px;background:#fff;break-inside:avoid;">
      <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:10px;">${escapeHtml(title)}</div>
      <table style="width:100%;border-collapse:separate;border-spacing:6px;table-layout:fixed;">
        ${cells.map((row,ri) => `<tr>${row.map((value,ci) => {
          const alpha = value ? Math.min(0.9, Math.max(0.12, value / max)) : 0.06;
          return `<td style="height:56px;border-radius:10px;text-align:center;font-weight:800;color:#0f172a;background:rgba(79,135,255,${alpha});border:1px solid rgba(148,163,184,.45);font-size:12px;">${labels?.[ri]?.[ci] ? `<div style='font-size:10px;opacity:.75;margin-bottom:4px;'>${escapeHtml(labels[ri][ci])}</div>` : ''}${value || 0}</td>`;
        }).join('')}</tr>`).join('')}
      </table>
    </div>`;
}
function exportAnalyticsPDF(){
  const data = analyticsCollectData();
  const { filters, persp, filteredPoints, patterns, topPattern, bestPattern, insights, filteredStats, allPoints, serveHeat, returnHeat, rallyHeat } = data;
  if (!filteredPoints.length){
    alert(tr('No hay datos suficientes en Analíticas para exportar.','Not enough Analytics data to export.'));
    return;
  }
  const playerName = analyticsPlayerName(persp);
  const stamp = new Date().toLocaleString();
  const existing = document.getElementById('printAnalyticsReport');
  if (existing) existing.remove();
  const recommendations = [];
  if (topPattern && topPattern.winRate >= 60) recommendations.push(tr('Reforzar el patrón más rentable detectado.','Reinforce the most profitable detected pattern.'));
  if ((filteredStats.serveTargets?.A || 0) && (filteredStats.serveTargets?.A || 0) >= ((filteredStats.serveTargets?.T || 0) + (filteredStats.serveTargets?.C || 0))) recommendations.push(tr('Añadir más variedad al saque para no repetir el abierto.','Add more serve variety to avoid overusing the wide serve.'));
  if (analyticsTopDirection(filteredStats.returnDir || {})) recommendations.push(tr('Entrenar una alternativa al resto dominante en puntos de presión.','Train an alternative to the dominant return in pressure points.'));
  if (!recommendations.length) recommendations.push(tr('Seguir registrando más puntos para afinar las recomendaciones.','Keep tracking more points to refine recommendations.'));
  const kpis = [
    [tr('Puntos analizados','Points analysed'), String(filteredPoints.length)],
    [tr('% ganados','Win %'), analyticsFmtPct(filteredPoints.filter(p => p.winner === persp).length, Math.max(1, filteredPoints.length))],
    [tr('Puntos importantes','Important points'), String(filteredPoints.filter(p => analyticsContextMatch(p, persp, 'important')).length)],
    [tr('Patrón top','Top pattern'), topPattern ? `${topPattern.count}x` : '—'],
    [tr('Patrón eficaz','Best pattern'), bestPattern ? `${bestPattern.winRate}%` : '—'],
    [tr('Resto dominante','Top return'), analyticsTopDirection(filteredStats.returnDir || {})?.label || '—']
  ];
  const patternRows = patterns.slice(0,8).map(it => `<tr>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.longLabel}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.count}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.winRate}%</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${escapeHtml(analyticsShortContextLabel(it.dominantContext))}</td>
  </tr>`).join('');
  const pointRows = filteredPoints.slice(-10).reverse().map(p => `<tr>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${p.n}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(formatSnapshot(p.snapshot))}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(pointPattern(p, filters.includeServe) || '—')}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(p.winner === persp ? tr('Ganado','Won') : tr('Perdido','Lost'))}</td>
  </tr>`).join('');
  const returnLabels = [
    [tr('Profundo cruzado','Deep crosscourt'), tr('Profundo centro','Deep middle'), tr('Profundo paralelo','Deep line')],
    [tr('Medio cruzado','Mid crosscourt'), tr('Medio centro','Mid middle'), tr('Medio paralelo','Mid line')],
    [tr('Corto cruzado','Short crosscourt'), tr('Corto centro','Short middle'), tr('Corto paralelo','Short line')]
  ];
  const serveLabels = [[tr('Abierto','Wide'), tr('Cuerpo','Body'), 'T']];
  const wrap = document.createElement('div');
  wrap.id = 'printAnalyticsReport';
  wrap.innerHTML = `
    <div style="font-family:Arial,sans-serif;background:#fff;color:#0f172a;padding:28px 30px;">
      <div style="display:flex;justify-content:space-between;gap:18px;align-items:flex-end;border-bottom:2px solid #cbd5e1;padding-bottom:14px;margin-bottom:18px;">
        <div>
          <div style="font-size:16px;font-weight:900;letter-spacing:.03em;">Tennis Direction Tracker</div>
          <div style="font-size:24px;font-weight:900;margin-top:6px;">${tr('Reporte premium de analíticas','Premium analytics report')}</div>
          <div style="font-size:13px;color:#334155;margin-top:6px;">${escapeHtml(playerName)} · ${escapeHtml(analyticsContextLabel(filters.context))} · ${filters.len} ${tr('golpes','shots')} · ${escapeHtml(analyticsModeLabel(filters.mode))}</div>
        </div>
        <div style="font-size:12px;color:#475569;text-align:right;">${escapeHtml(stamp)}<br>${filteredPoints.length} ${tr('puntos filtrados','filtered points')} / ${allPoints.length} ${tr('totales','total')}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px;">${kpis.map(([label,val]) => `<div style="border:1px solid #dbe6ff;border-radius:14px;padding:12px;background:linear-gradient(180deg,#f8fbff,#eef4ff);"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:.06em;">${escapeHtml(label)}</div><div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:8px;">${escapeHtml(val)}</div></div>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        ${analyticsPrintHeatmapTable(tr('Heatmap visual al saque','Serve visual heatmap'), [[serveHeat.A || 0, serveHeat.C || 0, serveHeat.T || 0]], serveLabels)}
        ${analyticsPrintHeatmapTable(tr('Heatmap visual al resto','Return visual heatmap'), [[returnHeat.P.C, returnHeat.P.M, returnHeat.P.P],[returnHeat.M.C, returnHeat.M.M, returnHeat.M.P],[returnHeat.C.C, returnHeat.C.M, returnHeat.C.P]], returnLabels)}
      </div>
      <div style="margin-bottom:16px;">${analyticsPrintHeatmapTable(tr('Heatmap visual de rally','Rally visual heatmap'), [[rallyHeat.P.C, rallyHeat.P.M, rallyHeat.P.P],[rallyHeat.M.C, rallyHeat.M.M, rallyHeat.M.P],[rallyHeat.C.C, rallyHeat.C.M, rallyHeat.C.P]], returnLabels)}</div>
      <div style="display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-bottom:16px;">
        <div style="border:1px solid #cbd5e1;border-radius:14px;padding:12px;background:#fff;break-inside:avoid;">
          <div style="font-size:13px;font-weight:800;margin-bottom:10px;">${tr('Patrones detectados','Detected patterns')}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
            <thead><tr><th style="padding:8px;border-bottom:1px solid #cbd5e1;text-align:left;">${tr('Patrón','Pattern')}</th><th style="padding:8px;border-bottom:1px solid #cbd5e1;">x</th><th style="padding:8px;border-bottom:1px solid #cbd5e1;">%</th><th style="padding:8px;border-bottom:1px solid #cbd5e1;">${tr('Contexto','Context')}</th></tr></thead>
            <tbody>${patternRows || `<tr><td colspan="4" style="padding:8px;">${tr('Sin patrones suficientes.','Not enough patterns.')}</td></tr>`}</tbody>
          </table>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="border:1px solid #cbd5e1;border-radius:14px;padding:12px;background:#fff;break-inside:avoid;">
            <div style="font-size:13px;font-weight:800;margin-bottom:10px;">${tr('Insights tácticos','Tactical insights')}</div>
            <div style="display:flex;flex-direction:column;gap:8px;">${insights.slice(0,5).map(item => `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc;"><div style="font-weight:800;margin-bottom:4px;">${escapeHtml(item.title)}</div><div style="font-size:12px;line-height:1.45;color:#334155;">${escapeHtml(item.body)}</div></div>`).join('')}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:14px;padding:12px;background:#fff;break-inside:avoid;">
            <div style="font-size:13px;font-weight:800;margin-bottom:10px;">${tr('Recomendaciones','Recommendations')}</div>
            <ul style="padding-left:18px;margin:0;color:#334155;font-size:12px;line-height:1.55;">${recommendations.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
      <div style="border:1px solid #cbd5e1;border-radius:14px;padding:12px;background:#fff;break-inside:avoid;">
        <div style="font-size:13px;font-weight:800;margin-bottom:10px;">${tr('Puntos clave del filtro','Key filtered points')}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr><th style="padding:8px;border-bottom:1px solid #cbd5e1;text-align:left;">#</th><th style="padding:8px;border-bottom:1px solid #cbd5e1;text-align:left;">${tr('Marcador','Score')}</th><th style="padding:8px;border-bottom:1px solid #cbd5e1;text-align:left;">${tr('Secuencia','Sequence')}</th><th style="padding:8px;border-bottom:1px solid #cbd5e1;text-align:left;">${tr('Resultado','Result')}</th></tr></thead>
          <tbody>${pointRows}</tbody>
        </table>
      </div>
      <div style="margin-top:16px;color:#64748b;font-size:11px;">${tr('Exportado desde el módulo de Analíticas tácticas. Usa Imprimir → Guardar como PDF.','Exported from the Tactical Analytics module. Use Print → Save as PDF.')}</div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    const el = document.getElementById('printAnalyticsReport');
    if (el) el.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

function analyticsRenderTabState(){
  const active = (state.ui && state.ui.analyticsTab) || "summary";
  document.querySelectorAll('#analyticsTabs .analyticsTabBtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.analyticsTab === active);
  });
  document.querySelectorAll('#analyticsModal .analyticsPane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `analyticsPane-${active}`);
  });
}
function analyticsBindDynamicActions(){
  document.querySelectorAll('#analyticsTabs .analyticsTabBtn').forEach(btn => {
    btn.onclick = () => {
      state.ui = state.ui || {};
      state.ui.analyticsTab = btn.dataset.analyticsTab || 'summary';
      analyticsRenderTabState();
      persist();
    };
  });
  document.querySelectorAll('#analyticsModal [data-point-open]').forEach(btn => {
    btn.onclick = () => {
      const n = parseInt(btn.getAttribute('data-point-open') || '0', 10);
      const point = (state.matchPoints || []).find(p => p.n === n);
      if (point) openPointViewer(point);
    };
  });
}
function renderAnalytics(){
  state.ui = state.ui || {};
  if (!state.ui.analyticsTab) state.ui.analyticsTab = 'summary';
  const persp = $('#aPerspective')?.value || state.ui.analyticsPerspective || 'A';
  const context = $('#aContext')?.value || state.ui.analyticsContext || 'all';
  const includeServe = $('#aIncludeServe')?.checked ?? true;
  const mode = $('#aMode')?.value || 'exact';
  const minCount = parseInt($('#aMin')?.value || '2', 10) || 2;
  const len = parseInt($('#aPatternLen')?.value || '3', 10) || 3;

  state.ui.analyticsPerspective = persp;
  state.ui.analyticsContext = context;
  persist();

  const allPoints = Array.isArray(state.matchPoints) ? state.matchPoints.slice() : [];
  const filteredPoints = allPoints.filter(p => analyticsContextMatch(p, persp, context));
  const filteredStatsAll = computeStats(filteredPoints);
  const filteredStats = filteredStatsAll?.[persp] || emptyPlayerStats();
  const allStatsAll = computeStats(allPoints);
  const allStats = allStatsAll?.[persp] || emptyPlayerStats();
  const patternMode = mode === 'similar' ? 'similar' : 'exact';
  let patterns = analyticsWindowStats(filteredPoints, persp, { includeServe, len, mode: patternMode });
  patterns = patterns.filter(it => it.count >= minCount);
  if (mode === 'effective') patterns.sort((a,b)=> (b.winRate - a.winRate) || (b.count - a.count));
  else patterns.sort((a,b)=> (b.count - a.count) || (b.winRate - a.winRate));
  patterns = patterns.slice(0, 12);
  const bestPattern = [...analyticsWindowStats(filteredPoints, persp, { includeServe, len, mode: 'exact' })]
    .filter(it => it.count >= Math.max(2, minCount))
    .sort((a,b)=> (b.winRate - a.winRate) || (b.count - a.count))[0] || null;
  const topPattern = patterns[0] || null;
  const topReturn = analyticsTopDirection(filteredStats.returnDir || {});
  const contextSummary = analyticsContextSummary(allPoints, persp);
  const insights = analyticsBuildInsights(allPoints, filteredPoints, persp, patterns, filteredStatsAll);

  const sub = $('#analyticsSub');
  if (sub){
    sub.textContent = `${analyticsPlayerName(persp)} · ${analyticsContextLabel(context)} · ${filteredPoints.length} ${tr('puntos analizados','points analysed')}`;
  }

  const kpis = $('#analyticsKpis');
  if (kpis){
    const importantPoints = allPoints.filter(p => analyticsContextMatch(p, persp, 'important'));
    const importantWins = importantPoints.filter(p => p.winner === persp).length;
    kpis.innerHTML = [
      analyticsKpiCard(tr('Puntos analizados','Points analysed'), `<span>${filteredPoints.length}</span>`, analyticsContextLabel(context)),
      analyticsKpiCard(tr('% ganados','Win %'), `<span>${analyticsFmtPct(filteredPoints.filter(p => p.winner === persp).length, Math.max(1, filteredPoints.length))}</span>`, analyticsPlayerName(persp)),
      analyticsKpiCard(tr('Puntos importantes','Important points'), `<span>${importantPoints.length}</span>`, analyticsFmtPct(importantWins, Math.max(1, importantPoints.length))),
      analyticsKpiCard(tr('Patrón top','Top pattern'), `<span>${topPattern ? topPattern.count + 'x' : '—'}</span>`, topPattern ? topPattern.longLabel.replace(/<[^>]+>/g, '') : tr('Sin datos','No data')),
      analyticsKpiCard(tr('Patrón más eficaz','Most effective pattern'), `<span>${bestPattern ? bestPattern.winRate + '%' : '—'}</span>`, bestPattern ? bestPattern.longLabel.replace(/<[^>]+>/g, '') : tr('Sin datos','No data')),
      analyticsKpiCard(tr('Resto dominante','Top return direction'), `<span>${topReturn ? topReturn.label : '—'}</span>`, topReturn ? `${topReturn.count} ${tr('veces','times')}` : tr('Sin datos','No data'))
    ].join('');
  }

  const summaryPane = $('#analyticsPane-summary');
  if (summaryPane){
    const importantPoints = allPoints.filter(p => analyticsContextMatch(p, persp, 'important'));
    const importantWins = importantPoints.filter(p => p.winner === persp).length;
    const pressureRows = [
      { label: tr('General','Overall'), rate: analyticsFmtPct(allPoints.filter(p => p.winner === persp).length, Math.max(1, allPoints.length)), count: allPoints.length },
      { label: tr('Puntos importantes','Important points'), rate: analyticsFmtPct(importantWins, Math.max(1, importantPoints.length)), count: importantPoints.length },
      ...contextSummary.filter(x => ['break_for','break_against','deuce'].includes(x.key)).map(x => ({ label: x.label, rate: `${x.winRate}%`, count: x.count }))
    ];
    summaryPane.innerHTML = `
      <div class="analyticsGrid analyticsGrid-2">
        <div class="analyticsPanel analyticsPanelFeature">
          <div class="analyticsPanelTitle">${tr('Resumen táctico','Tactical summary')}</div>
          <div class="analyticsNarrative">${insights.slice(0,3).map(item => `<article class="analyticsInsightCard"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.body)}</p></article>`).join('')}</div>
        </div>
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Comparativa general vs presión','Overall vs pressure')}</div>
          <div class="analyticsCompareList">${pressureRows.map(row => `<div class="analyticsCompareRow"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.rate)}</strong><small>${row.count} ${tr('puntos','points')}</small></div>`).join('')}</div>
        </div>
      </div>
      <div class="analyticsGrid analyticsGrid-2 analyticsGapTop">
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Contextos detectados','Detected contexts')}</div>
          <div class="analyticsContextGrid">${contextSummary.slice(0,8).map(item => `<div class="analyticsContextCard"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong><small>${item.winRate}% ${tr('ganados','won')}</small></div>`).join('')}</div>
        </div>
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Patrones destacados','Featured patterns')}</div>
          <div class="analyticsPatternStack">
            ${topPattern ? analyticsPatternCard(topPattern) : `<div class="analyticsEmpty">${tr('Aún no hay patrones suficientes.','Not enough patterns yet.')}</div>`}
            ${bestPattern && (!topPattern || bestPattern.key !== topPattern.key) ? analyticsPatternCard(bestPattern) : ''}
          </div>
        </div>
      </div>`;
  }

  const pointsPane = $('#analyticsPane-points');
  if (pointsPane){
    const pointsSource = context === 'all' ? allPoints.filter(p => analyticsContextMatch(p, persp, 'important')) : filteredPoints;
    const displayPoints = pointsSource.slice(-12).reverse();
    pointsPane.innerHTML = `
      <div class="analyticsGrid analyticsGrid-2">
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Lectura rápida','Quick reading')}</div>
          <div class="analyticsNarrative">${insights.slice(0,2).map(item => `<article class="analyticsInsightMini"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></article>`).join('')}</div>
        </div>
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Comparativa con puntos normales','Comparison with regular points')}</div>
          <div class="analyticsCompareList">${['important','break_against','deuce'].map(key => {
            const pts = allPoints.filter(p => analyticsContextMatch(p, persp, key));
            const wins = pts.filter(p => p.winner === persp).length;
            return pts.length ? `<div class="analyticsCompareRow"><span>${escapeHtml(analyticsShortContextLabel(key))}</span><strong>${analyticsFmtPct(wins, pts.length)}</strong><small>${pts.length} ${tr('puntos','points')}</small></div>` : '';
          }).join('')}</div>
        </div>
      </div>
      <div class="analyticsPanel analyticsPanelSoft analyticsGapTop">
        <div class="analyticsPanelTitle">${tr('Puntos clave detectados','Detected key points')}</div>
        <div class="analyticsPointList">${displayPoints.length ? displayPoints.map(p => analyticsPointRow(p, persp, includeServe)).join('') : `<div class="analyticsEmpty">${tr('No hay puntos para este contexto.','No points for this context.')}</div>`}</div>
      </div>`;
  }

  const patternsPane = $('#analyticsPane-patterns');
  if (patternsPane){
    patternsPane.innerHTML = `
      <div class="analyticsPanel analyticsPanelSoft">
        <div class="analyticsPanelTitle">${tr('Patrones repetidos','Repeated patterns')}</div>
        <div class="analyticsPanelSub">${analyticsModeLabel(mode)} · ${len} ${tr('golpes','shots')} · ${tr('mínimo','minimum')} ${minCount}</div>
        <div class="analyticsPatternStack">${patterns.length ? patterns.map(analyticsPatternCard).join('') : `<div class="analyticsEmpty">${tr('No hay suficientes secuencias con los filtros actuales.','Not enough sequences for the current filters.')}</div>`}</div>
      </div>`;
  }

  const directionsPane = $('#analyticsPane-directions');
  if (directionsPane){
    const importantStatsAll = computeStats(allPoints.filter(p => analyticsContextMatch(p, persp, 'important')));
    const importantStats = importantStatsAll?.[persp] || emptyPlayerStats();
    directionsPane.innerHTML = `
      <div class="analyticsGrid analyticsGrid-2">
        ${analyticsServeHeatmap(tr('Heatmap visual al saque','Serve visual heatmap'), serveHeat, analyticsContextLabel(context))}
        ${analyticsMatrixHeatmap(tr('Heatmap visual al resto','Return visual heatmap'), returnHeat, analyticsContextLabel(context))}
      </div>
      <div class="analyticsGrid analyticsGrid-2 analyticsGapTop">
        ${analyticsMatrixHeatmap(tr('Heatmap visual de rally','Rally visual heatmap'), rallyHeat, analyticsContextLabel(context))}
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Lectura rápida de dirección','Direction reading')}</div>
          <div class="analyticsNarrative">${[
            analyticsTopDirection(filteredStats.returnDir || {}) ? `${tr('Al resto domina','On return the player favours')} ${analyticsTopDirection(filteredStats.returnDir || {}).label}.` : '',
            analyticsTopDirection(filteredStats.strokeDir || {}) ? `${tr('En rally domina','In rally the dominant direction is')} ${analyticsTopDirection(filteredStats.strokeDir || {}).label}.` : '',
            analyticsTopKey(filteredStats.serveTargets || {}) ? `${tr('Al saque aparece más','On serve the main location is')} ${analyticsServeName(analyticsTopKey(filteredStats.serveTargets || {}))}.` : ''
          ].filter(Boolean).map(text => `<article class="analyticsInsightMini"><p>${escapeHtml(text)}</p></article>`).join('')}</div>
        </div>
      </div>
      <div class="analyticsGrid analyticsGrid-2 analyticsGapTop">
        ${analyticsBarList(tr('Direcciones al saque','Serve directions'), filteredStats.serveTargets || {}, 'serve', Math.max(1, (filteredStats.serveTargets?.T || 0) + (filteredStats.serveTargets?.C || 0) + (filteredStats.serveTargets?.A || 0)))}
        ${analyticsBarList(tr('Direcciones al resto','Return directions'), filteredStats.returnDir || {}, 'dir', Math.max(1, (filteredStats.returnDir?.C || 0) + (filteredStats.returnDir?.M || 0) + (filteredStats.returnDir?.P || 0)))}
        ${analyticsBarList(tr('Dirección dominante en rally','Rally directions'), filteredStats.strokeDir || {}, 'dir', Math.max(1, (filteredStats.strokeDir?.C || 0) + (filteredStats.strokeDir?.M || 0) + (filteredStats.strokeDir?.P || 0)))}
        ${analyticsBarList(tr('Profundidad de golpe','Shot depth'), filteredStats.strokeDepth || {}, 'depth', Math.max(1, (filteredStats.strokeDepth?.P || 0) + (filteredStats.strokeDepth?.M || 0) + (filteredStats.strokeDepth?.C || 0)))}
      </div>
      <div class="analyticsGrid analyticsGrid-2 analyticsGapTop">
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('General vs puntos importantes','Overall vs important points')}</div>
          <div class="analyticsCompareList">
            <div class="analyticsCompareRow"><span>${tr('Win rate general','Overall win rate')}</span><strong>${analyticsFmtPct(allPoints.filter(p => p.winner === persp).length, Math.max(1, allPoints.length))}</strong><small>${allPoints.length} ${tr('puntos','points')}</small></div>
            <div class="analyticsCompareRow"><span>${tr('Win rate presión','Pressure win rate')}</span><strong>${analyticsFmtPct((allPoints.filter(p => analyticsContextMatch(p, persp, 'important') && p.winner === persp).length), Math.max(1, allPoints.filter(p => analyticsContextMatch(p, persp, 'important')).length))}</strong><small>${allPoints.filter(p => analyticsContextMatch(p, persp, 'important')).length} ${tr('puntos','points')}</small></div>
            <div class="analyticsCompareRow"><span>${tr('Resto dominante general','Overall top return')}</span><strong>${escapeHtml(analyticsTopDirection(allStats.returnDir || {})?.label || '—')}</strong><small>${tr('partido completo','full match')}</small></div>
            <div class="analyticsCompareRow"><span>${tr('Resto dominante en presión','Pressure top return')}</span><strong>${escapeHtml(analyticsTopDirection(importantStats.returnDir || {})?.label || '—')}</strong><small>${tr('puntos importantes','important points')}</small></div>
          </div>
        </div>
        <div class="analyticsPanel analyticsPanelSoft">
          <div class="analyticsPanelTitle">${tr('Comparativa visual de presión','Pressure visual comparison')}</div>
          <div class="analyticsNarrative">${[
            `${tr('Filtro actual','Current filter')}: ${analyticsContextLabel(context)}.`,
            `${tr('Puntos analizados','Points analysed')}: ${filteredPoints.length}.`,
            `${tr('Puntos importantes detectados','Important points detected')}: ${allPoints.filter(p => analyticsContextMatch(p, persp, 'important')).length}.`
          ].map(text => `<article class="analyticsInsightMini"><p>${escapeHtml(text)}</p></article>`).join('')}</div>
        </div>
      </div>`;
  }

  const insightsPane = $('#analyticsPane-insights');
  if (insightsPane){
    const recommendations = [];
    const topServeKey = analyticsTopKey(filteredStats.serveTargets || {});
    if (topServeKey) recommendations.push(tr('Variar más la dirección del saque en puntos críticos.','Add more serve direction variety in critical points.'));
    if (topPattern && topPattern.winRate >= 65) recommendations.push(tr('Reforzar en entrenamiento el patrón más eficaz detectado.','Reinforce in practice the most effective detected pattern.'));
    if (analyticsTopDirection(filteredStats.returnDir || {})) recommendations.push(tr('Trabajar una alternativa al resto dominante para no ser previsible.','Train an alternative to the dominant return to avoid predictability.'));
    if (!recommendations.length) recommendations.push(tr('Seguir registrando puntos para desbloquear recomendaciones más sólidas.','Keep tracking more points to unlock stronger recommendations.'));
    insightsPane.innerHTML = `
      <div class="analyticsGrid analyticsGrid-2">
        ${insights.map(item => `<article class="analyticsInsightCard analyticsInsightCardLarge"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.body)}</p></article>`).join('')}
      </div>
      <div class="analyticsPanel analyticsPanelFeature analyticsGapTop">
        <div class="analyticsPanelTitle">${tr('Recomendaciones tácticas','Tactical recommendations')}</div>
        <div class="analyticsRecoList">${recommendations.map(rec => `<div class="analyticsRecoItem">${escapeHtml(rec)}</div>`).join('')}</div>
      </div>`;
  }

  analyticsRenderTabState();
  analyticsBindDynamicActions();
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

// --- Modo Entrenador v3.11: ejercicios, patrones, objetos, preview y notas ---
function getCoachLibrary(){
  const fallback = { folders:[{ id:"root", name:"General", createdAt:Date.now() }], exercises:[] };
  try{
    const raw = localStorage.getItem(getCoachExercisesStorageKey());
    const lib = raw ? JSON.parse(raw) : fallback;
    lib.folders = Array.isArray(lib.folders) && lib.folders.length ? lib.folders : fallback.folders;
    lib.exercises = Array.isArray(lib.exercises) ? lib.exercises : [];
    if (!lib.folders.some(f=>f.id==="root")) lib.folders.unshift({ id:"root", name:"General", createdAt:Date.now() });
    return lib;
  }catch(e){ console.error(e); return fallback; }
}
function setCoachLibrary(lib){
  try{ localStorage.setItem(getCoachExercisesStorageKey(), JSON.stringify(lib || getCoachLibrary())); }
  catch(e){ console.error(e); toast("⚠️ No se pudo guardar la biblioteca de ejercicios"); }
}
function initCoachPoint(){
  ensureCoachState();
  state.point = { server:"A", side:"SD", phase:"rally", firstServeFault:false, important:false, events:[], arrows:[], finishDetail:null, coach:true };
  __liveArrowCountRendered = 0;
  renderPoint();
  return state.point;
}
function setAppMode(mode){
  state.ui = state.ui || {};
  state.ui.appMode = mode === "coach" ? "coach" : "match";
  if (isCoachMode()){
    ensureCoachState();
    if (!state.point || !state.point.coach) initCoachPoint();
    state.ui.hideScore = true;
  } else {
    if (!state.point || state.point.coach) initPoint();
    state.ui.hideScore = false;
  }
  applyModes();
  persist();
  renderAll();
  try{ applyLooseI18n(); }catch(e){ console.warn('Loose i18n failed', e); }
}
function applyCoachModeUI(){
  const coachMode = isCoachMode();
  const coachState = coachMode ? ensureCoachState() : null;
  document.body.classList.toggle("coachMode", coachMode);
  const halfActive = !!(coachMode && coachState && coachState.courtMode === "half");
  document.body.classList.toggle("coachHalfCourt", halfActive);
  document.body.classList.toggle("coachHalfTop", !!(halfActive && coachState.halfView === "top"));
  document.body.classList.toggle("coachHalfBottom", !!(halfActive && coachState.halfView !== "top"));
  document.body.classList.toggle("coachGridVisible", !!(coachMode && coachState && coachState.showGrid));
  updateCoachGridButton();
  const wsName = document.getElementById("workspaceName");
  const wsSub = document.getElementById("workspaceSub");
  if (coachMode){
    const c = coachState || ensureCoachState();
    if (wsName) wsName.textContent = c.courtMode === "half" ? t("coachModeHalf") : t("coachMode");
    if (wsSub) wsSub.textContent = c.exerciseName || t("exerciseEditor");
  }
  const modeLabel = document.getElementById("coachCourtModeLabel");
  if (modeLabel && coachMode) modeLabel.textContent = (coachState && coachState.courtMode === "half") ? t("fullCourt") : t("halfCourt");
  updateCoachHalfSwitch();
  const modeBtn = document.getElementById("btnCoachCourtMode");
  if (modeBtn && coachMode){
    const half = coachState && coachState.courtMode === "half";
    modeBtn.title = half ? t("backToFullCourt") : t("activateHalfCourt");
    modeBtn.setAttribute("aria-label", modeBtn.title);
    modeBtn.classList.toggle("active", half);
  }
  const title = document.querySelector(".timelineTitle");
  if (title) title.textContent = coachMode ? t("exerciseSequence") : t("seqTitle");
  const metaSummary = document.querySelector("#matchMetaCard summary");
  if (metaSummary) metaSummary.textContent = coachMode ? t("exerciseData") : t("matchData");
  const last = document.getElementById("lastTouch");
  if (coachMode && last && (!state.point || !state.point.events || !state.point.events.length)) last.textContent = t("startTapCourt");
  document.querySelector(".matchMetaGrid")?.classList.toggle("hidden", coachMode);
  document.getElementById("coachMetaGrid")?.classList.toggle("hidden", !coachMode);
  syncCoachInlineFromState();
  renderCoachObjects();
  renderCoachFolderOptions();
  updateCoachHistoryButtons();
}
function updateEntryLanguageFlags(){
  const flag = (state.lang === "en") ? "🇬🇧" : "🇪🇸";
  ["entryLangFlag","authLangFlag","langFlag"].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=flag; });
}
function openEntryLanguage(){ return toggleLanguage(); }
function getAllCoachArrows(){
  const c = ensureCoachState();
  const saved = [];
  (c.patterns || []).forEach(pat => (pat.arrows || []).forEach(a => saved.push(a)));
  const live = (state.point && state.point.coach && Array.isArray(state.point.arrows)) ? state.point.arrows : [];
  return saved.concat(live).map((a, idx)=>({ ...a, n:idx+1 }));
}

function cloneCoachData(value){
  return JSON.parse(JSON.stringify(value == null ? null : value));
}
function createEmptyCoachPoint(){
  return { server:"A", side:"SD", phase:"rally", firstServeFault:false, important:false, events:[], arrows:[], finishDetail:null, coach:true };
}
function coachSnapshotPayload(){
  const c = ensureCoachState();
  const { undoStack, redoStack, ...coachPayload } = c;
  return {
    coach: cloneCoachData(coachPayload),
    point: (state.point && state.point.coach) ? cloneCoachData(state.point) : createEmptyCoachPoint()
  };
}
function trimCoachHistory(stack){
  if (!Array.isArray(stack)) return [];
  const max = 80;
  return stack.length > max ? stack.slice(stack.length - max) : stack;
}
function recordCoachHistory(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  c.undoStack = Array.isArray(c.undoStack) ? c.undoStack : [];
  c.redoStack = [];
  c.undoStack.push(coachSnapshotPayload());
  c.undoStack = trimCoachHistory(c.undoStack);
  updateCoachHistoryButtons();
}
function restoreCoachSnapshot(snapshot, undoStack, redoStack){
  if (!snapshot) return;
  const nextCoach = Object.assign(createDefaultCoachState(), cloneCoachData(snapshot.coach || {}));
  nextCoach.undoStack = Array.isArray(undoStack) ? undoStack : [];
  nextCoach.redoStack = Array.isArray(redoStack) ? redoStack : [];
  state.coach = nextCoach;
  state.point = snapshot.point ? cloneCoachData(snapshot.point) : createEmptyCoachPoint();
  if (!state.point || !state.point.coach) state.point = createEmptyCoachPoint();
  __liveArrowCountRendered = 0;
  persist();
  renderAll();
}
function undoCoachAction(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  c.undoStack = Array.isArray(c.undoStack) ? c.undoStack : [];
  c.redoStack = Array.isArray(c.redoStack) ? c.redoStack : [];
  if (!c.undoStack.length){
    updateCoachHistoryButtons();
    toast("No hay acciones para deshacer");
    return;
  }
  const current = coachSnapshotPayload();
  const previous = c.undoStack.pop();
  c.redoStack.push(current);
  c.redoStack = trimCoachHistory(c.redoStack);
  restoreCoachSnapshot(previous, c.undoStack, c.redoStack);
  toast("Acción deshecha");
}
function redoCoachAction(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  c.undoStack = Array.isArray(c.undoStack) ? c.undoStack : [];
  c.redoStack = Array.isArray(c.redoStack) ? c.redoStack : [];
  if (!c.redoStack.length){
    updateCoachHistoryButtons();
    toast("No hay acciones para rehacer");
    return;
  }
  const current = coachSnapshotPayload();
  const next = c.redoStack.pop();
  c.undoStack.push(current);
  c.undoStack = trimCoachHistory(c.undoStack);
  restoreCoachSnapshot(next, c.undoStack, c.redoStack);
  toast("Acción rehecha");
}
function updateCoachHistoryButtons(){
  const c = state.coach || {};
  const canUndo = !!(Array.isArray(c.undoStack) && c.undoStack.length);
  const canRedo = !!(Array.isArray(c.redoStack) && c.redoStack.length);
  const setBtn = (id, enabled)=>{
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("isDisabled", !enabled);
    btn.setAttribute("aria-disabled", enabled ? "false" : "true");
  };
  setBtn("btnCoachGlobalUndo", canUndo);
  setBtn("btnCoachGlobalRedo", canRedo);
}
function syncCoachInlineFromState(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  const set=(id,v)=>{ const el=document.getElementById(id); if (el && document.activeElement !== el) el.value = v || ""; };
  set("coachInlineName", c.exerciseName);
  set("coachInlineGoal", c.goal);
  set("coachInlineLevel", c.level);
  set("coachInlineMaterial", c.material);
  set("coachInlineTags", c.tags);
  set("coachInlineNotes", c.notes);
  renderCoachFolderOptions();
  const folder = document.getElementById("coachInlineFolder");
  if (folder && document.activeElement !== folder) folder.value = c.folderId || "root";
}
function syncCoachStateFromInline(){
  const c = ensureCoachState();
  const val=(id)=> (document.getElementById(id)?.value || "").trim();
  const folder = document.getElementById("coachInlineFolder")?.value;
  if (document.getElementById("coachInlineName")) c.exerciseName = val("coachInlineName") || c.exerciseName || "Nuevo ejercicio";
  if (folder) c.folderId = folder;
  if (document.getElementById("coachInlineGoal")) c.goal = val("coachInlineGoal");
  if (document.getElementById("coachInlineLevel")) c.level = val("coachInlineLevel");
  if (document.getElementById("coachInlineMaterial")) c.material = val("coachInlineMaterial");
  if (document.getElementById("coachInlineTags")) c.tags = val("coachInlineTags");
  if (document.getElementById("coachInlineNotes")) c.notes = val("coachInlineNotes");
  return c;
}
function renderCoachFolderOptions(){
  const lib = getCoachLibrary();
  ["coachExerciseFolder","coachInlineFolder"].forEach(id=>{
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value || ensureCoachState().folderId || "root";
    sel.innerHTML = lib.folders.map(f=>`<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join("");
    sel.value = current;
    if (!sel.value) sel.value = "root";
  });
}
function normalizeCoachExerciseFromState(){
  syncCoachStateFromInline();
  const c = ensureCoachState();
  return {
    id: c.exerciseId || ("ex_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7)),
    name: c.exerciseName || "Nuevo ejercicio",
    folderId: c.folderId || "root",
    goal: c.goal || "",
    level: c.level || "",
    material: c.material || "",
    tags: c.tags || "",
    notes: c.notes || "",
    surface: state.ui?.surface || "hard",
    courtMode: c.courtMode || "full",
    halfView: c.halfView || "bottom",
    showGrid: !!c.showGrid,
    patterns: JSON.parse(JSON.stringify(c.patterns || [])),
    objects: JSON.parse(JSON.stringify(c.objects || [])),
    currentPoint: state.point && state.point.coach ? JSON.parse(JSON.stringify(state.point)) : null,
    updatedAt: Date.now(),
    createdAt: c.createdAt || Date.now()
  };
}
function openCoachSave(){
  if (!isCoachMode()) setAppMode("coach");
  syncCoachStateFromInline();
  const c = ensureCoachState();
  renderCoachFolderOptions();
  const setVal=(id,v)=>{ const el=document.getElementById(id); if (el) el.value = v || ""; };
  setVal("coachExerciseName", c.exerciseName);
  setVal("coachExerciseGoal", c.goal);
  setVal("coachExerciseLevel", c.level);
  setVal("coachExerciseMaterial", c.material);
  setVal("coachExerciseTags", c.tags);
  setVal("coachExerciseNotes", c.notes);
  const folder=document.getElementById("coachExerciseFolder"); if(folder) folder.value = c.folderId || "root";
  openModal("#coachSaveModal");
}
function closeCoachSave(){ closeModal("#coachSaveModal"); }
function saveCoachExercise(){
  if (!isCoachMode()) setAppMode("coach");
  const c = ensureCoachState();
  c.exerciseName = (document.getElementById("coachExerciseName")?.value || document.getElementById("coachInlineName")?.value || "").trim() || "Ejercicio sin título";
  c.folderId = document.getElementById("coachExerciseFolder")?.value || document.getElementById("coachInlineFolder")?.value || c.folderId || "root";
  c.goal = (document.getElementById("coachExerciseGoal")?.value || document.getElementById("coachInlineGoal")?.value || "").trim();
  c.level = (document.getElementById("coachExerciseLevel")?.value || document.getElementById("coachInlineLevel")?.value || "").trim();
  c.material = (document.getElementById("coachExerciseMaterial")?.value || document.getElementById("coachInlineMaterial")?.value || "").trim();
  c.tags = (document.getElementById("coachExerciseTags")?.value || document.getElementById("coachInlineTags")?.value || "").trim();
  c.notes = (document.getElementById("coachExerciseNotes")?.value || document.getElementById("coachInlineNotes")?.value || "").trim();
  const lib = getCoachLibrary();
  const ex = normalizeCoachExerciseFromState();
  const idx = lib.exercises.findIndex(x=>x.id===ex.id);
  if (idx >= 0) lib.exercises[idx] = { ...lib.exercises[idx], ...ex, createdAt: lib.exercises[idx].createdAt || ex.createdAt };
  else lib.exercises.push(ex);
  c.exerciseId = ex.id;
  setCoachLibrary(lib);
  syncCoachInlineFromState();
  persist();
  renderCoachLibrary();
  toast("✅ Ejercicio guardado");
  closeCoachSave();
}
function openCoachLibrary(){ renderCoachLibrary(); openModal("#coachLibraryModal"); }
function closeCoachLibrary(){ closeModal("#coachLibraryModal"); }
function renderCoachLibrary(){
  const c = ensureCoachState();
  const lib = getCoachLibrary();
  const folderList = document.getElementById("coachFolderList");
  const exerciseList = document.getElementById("coachExerciseList");
  if (!folderList || !exerciseList) return;
  const q = (document.getElementById("coachExerciseSearch")?.value || "").trim().toLowerCase();
  folderList.innerHTML = lib.folders.map(f=>`<button class="coachFolderBtn ${c.selectedFolderId===f.id?'active':''}" data-folder-id="${escapeHtml(f.id)}" type="button"><span>${escapeHtml(f.name)}</span><small>${lib.exercises.filter(e=>e.folderId===f.id).length}</small></button>`).join("");
  folderList.querySelectorAll("[data-folder-id]").forEach(btn=> btn.addEventListener("click", ()=>{ c.selectedFolderId = btn.dataset.folderId || "root"; persist(); renderCoachLibrary(); }));
  const items = lib.exercises.filter(e => ((e.folderId || "root") === c.selectedFolderId) && (!q || (e.name||"").toLowerCase().includes(q) || (e.tags||"").toLowerCase().includes(q) || (e.goal||"").toLowerCase().includes(q))).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  exerciseList.innerHTML = items.length ? items.map(e=>`<div class="coachExerciseCard"><div><strong>${escapeHtml(e.name||'Ejercicio')}</strong><p>${escapeHtml(e.goal||'Sin objetivo táctico definido')}</p><small>${(e.patterns||[]).length} patrones · ${(e.objects||[]).length} objetos · ${new Date(e.updatedAt||Date.now()).toLocaleDateString()}</small></div><div class="coachExerciseActions"><button class="chip good" data-load-ex="${escapeHtml(e.id)}" type="button">Cargar</button><button class="chip" data-dup-ex="${escapeHtml(e.id)}" type="button">Duplicar</button><button class="chip warn" data-del-ex="${escapeHtml(e.id)}" type="button">Borrar</button></div></div>`).join("") : `<div class="muted" style="padding:14px;">No hay ejercicios en esta carpeta.</div>`;
  exerciseList.querySelectorAll("[data-load-ex]").forEach(btn=> btn.addEventListener("click", ()=> loadCoachExercise(btn.dataset.loadEx)));
  exerciseList.querySelectorAll("[data-dup-ex]").forEach(btn=> btn.addEventListener("click", ()=> duplicateCoachExercise(btn.dataset.dupEx)));
  exerciseList.querySelectorAll("[data-del-ex]").forEach(btn=> btn.addEventListener("click", ()=> deleteCoachExercise(btn.dataset.delEx)));
}
function addCoachFolder(){
  const input = document.getElementById("coachFolderName");
  const name = (input?.value || "").trim();
  if (!name){ toast("Escribe un nombre de carpeta"); return; }
  const lib = getCoachLibrary();
  const id = "fld_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,5);
  lib.folders.push({ id, name, createdAt:Date.now() });
  setCoachLibrary(lib);
  const c=ensureCoachState(); c.selectedFolderId = id; c.folderId = id;
  if (input) input.value = "";
  renderCoachLibrary();
  renderCoachFolderOptions();
  syncCoachInlineFromState();
}
function loadCoachExercise(id){
  const lib = getCoachLibrary();
  const ex = lib.exercises.find(e=>e.id===id);
  if (!ex){ toast("No se pudo cargar el ejercicio"); return; }
  setAppMode("coach");
  state.coach = {
    ...createDefaultCoachState(),
    exerciseId: ex.id, exerciseName: ex.name || "Ejercicio", folderId: ex.folderId || "root", selectedFolderId: ex.folderId || "root",
    patterns: JSON.parse(JSON.stringify(ex.patterns || [])), objects: JSON.parse(JSON.stringify(ex.objects || [])),
    goal: ex.goal || "", level: ex.level || "", material: ex.material || "", tags: ex.tags || "", notes: ex.notes || "", activeTool:"direction", courtMode: ex.courtMode === "half" ? "half" : "full", halfView: ex.halfView === "top" ? "top" : "bottom", showGrid: !!ex.showGrid
  };
  state.point = ex.currentPoint && ex.currentPoint.coach ? JSON.parse(JSON.stringify(ex.currentPoint)) : null;
  if (!state.point) initCoachPoint();
  if (ex.surface) state.ui.surface = ex.surface;
  persist();
  renderAll();
  closeCoachLibrary();
  toast("✅ Ejercicio cargado");
}
function duplicateCoachExercise(id){
  const lib = getCoachLibrary();
  const ex = lib.exercises.find(e=>e.id===id);
  if (!ex) return;
  const copy = { ...JSON.parse(JSON.stringify(ex)), id:"ex_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7), name:(ex.name||"Ejercicio")+" · copia", createdAt:Date.now(), updatedAt:Date.now() };
  lib.exercises.push(copy);
  setCoachLibrary(lib);
  renderCoachLibrary();
  toast("Ejercicio duplicado");
}
function deleteCoachExercise(id){
  const lib = getCoachLibrary();
  lib.exercises = lib.exercises.filter(e=>e.id!==id);
  setCoachLibrary(lib);
  renderCoachLibrary();
  toast("Ejercicio borrado");
}
function newCoachExercise(){
  setAppMode("coach");
  state.coach = createDefaultCoachState();
  initCoachPoint();
  persist();
  renderAll();
  toast("Nuevo ejercicio");
}
function clearCoachCourt(){
  const c=ensureCoachState();
  recordCoachHistory();
  c.patterns = [];
  c.objects = [];
  c.pendingDirectionStart = null;
  c.pendingDashStart = null;
  c.pendingTemplate = null;
  c.selectedObjectIds = [];
  initCoachPoint();
  persist();
  renderAll();
  toast("Pista limpia");
}
function openCoachObjects(){ if (!isCoachMode()) setAppMode("coach"); updateCoachPlacementUI(); openModal("#coachObjectsModal"); }
function closeCoachObjects(){ closeModal("#coachObjectsModal"); }
function setCoachTool(tool){
  const c = ensureCoachState();
  c.activeTool = tool || "direction";
  c.pendingTemplate = null;
  c.pendingDashStart = null;
  c.pendingDirectionStart = null;
  document.querySelectorAll(".coachToolBtn").forEach(b=> b.classList.toggle("active", b.dataset.coachTool === c.activeTool));
  document.getElementById("btnCoachDirection")?.classList.toggle("active", c.activeTool === "direction");
  persist();
  if (c.activeTool === "direction") toast("Flecha de dirección: toca inicio y después destino");
  else if (c.activeTool === "dash") toast("Desplazamiento: primer toque inicio, segundo toque final");
  else toast("Toca la pista para colocar: " + coachToolLabel(c.activeTool));
}
function coachToolLabel(tool){ return ({ cone:"Cono", hoop:"Aro", basket:"Cesta", ladder:"Escalera", player:"Jugador", coach:"Entrenador", target:"Objetivo", dash:"Desplazamiento", text:"Nota", direction:"Dirección", template:"Plantilla" })[tool] || "Objeto"; }

function setCoachPlacementMode(mode){
  if (!isCoachMode()) setAppMode("coach");
  const c = ensureCoachState();
  c.placementMode = ["free","aligned","precise"].includes(mode) ? mode : "aligned";
  document.querySelectorAll(".coachPlacementBtn").forEach(btn=>btn.classList.toggle("active", btn.dataset.placementMode === c.placementMode));
  persist();
  const msg = c.placementMode === "free" ? "Colocación libre activada" : c.placementMode === "precise" ? "Colocación precisa activada" : "Colocación alineada activada";
  toast(msg);
}
function updateCoachPlacementUI(){
  const c = ensureCoachState();
  document.querySelectorAll(".coachPlacementBtn").forEach(btn=>btn.classList.toggle("active", btn.dataset.placementMode === c.placementMode));
  updateCoachSelectionUI();
}
function coachSnapStep(){ return isCoachHalfCourt() ? 0.04 : 0.05; }
function coachSnapToGridValue(v, step){ return clamp01(Math.round(clamp01(v) / step) * step); }
function coachSnapPoint(pt, options={}){
  const c = ensureCoachState();
  const mode = options.mode || c.placementMode || "aligned";
  const type = options.type || "object";
  let x = clamp01(pt.x), y = clamp01(pt.y);
  const guides = [];
  if (mode === "free" || type === "text") return { point:{x,y}, guides };
  const step = coachSnapStep();
  if (mode === "precise"){
    x = coachSnapToGridValue(x, step);
    y = coachSnapToGridValue(y, step);
    guides.push({type:"v", x}, {type:"h", y});
    return { point:{x,y}, guides };
  }
  const excludeId = options.excludeId || null;
  const objects = (c.objects || []).filter(o=>o && o.type !== "text" && (!excludeId || o.id !== excludeId));
  const objectTolerance = isCoachHalfCourt() ? 0.028 : 0.024;
  let bestX = null, bestY = null;
  objects.forEach(o=>{
    const ox = clamp01(o.x), oy = clamp01(o.y);
    const dx = Math.abs(ox - x), dy = Math.abs(oy - y);
    if (dx <= objectTolerance && (!bestX || dx < bestX.d)) bestX = { v:ox, d:dx };
    if (dy <= objectTolerance && (!bestY || dy < bestY.d)) bestY = { v:oy, d:dy };
  });
  if (bestX){ x = bestX.v; guides.push({type:"v", x}); }
  if (bestY){ y = bestY.v; guides.push({type:"h", y}); }
  const gx = coachSnapToGridValue(x, step), gy = coachSnapToGridValue(y, step);
  const gridTolerance = isCoachHalfCourt() ? 0.018 : 0.014;
  if (!bestX && Math.abs(gx - x) <= gridTolerance){ x = gx; guides.push({type:"v", x}); }
  if (!bestY && Math.abs(gy - y) <= gridTolerance){ y = gy; guides.push({type:"h", y}); }
  return { point:{x:clamp01(x), y:clamp01(y)}, guides };
}
let __coachGuideTimer = null;
function showCoachAlignmentGuides(point, guides=[]){
  const layer = document.getElementById("coachObjectsLayer");
  if (!layer) return;
  layer.querySelectorAll(".coachAlignGuide,.coachSnapPulse").forEach(n=>n.remove());
  if (__coachGuideTimer) clearTimeout(__coachGuideTimer);
  const p = point || {x:.5,y:.5};
  const unique = [];
  (guides || []).forEach(g=>{
    const key = g.type + ":" + Math.round((g.x ?? g.y ?? 0)*1000);
    if (!unique.some(u=>u.key===key)) unique.push({...g,key});
  });
  unique.forEach(g=>{
    const line = document.createElement("div");
    line.className = "coachAlignGuide " + (g.type === "v" ? "vertical" : "horizontal");
    if (g.type === "v") line.style.left = (clamp01(g.x)*100)+"%";
    else line.style.top = (clamp01(g.y)*100)+"%";
    layer.appendChild(line);
  });
  if (unique.length){
    const pulse = document.createElement("div");
    pulse.className = "coachSnapPulse";
    pulse.style.left = (clamp01(p.x)*100)+"%";
    pulse.style.top = (clamp01(p.y)*100)+"%";
    layer.appendChild(pulse);
  }
  __coachGuideTimer = setTimeout(()=>{
    layer.querySelectorAll(".coachAlignGuide,.coachSnapPulse").forEach(n=>n.remove());
  }, 900);
}
function setCoachTemplate(template){
  if (!isCoachMode()) setAppMode("coach");
  const c = ensureCoachState();
  c.pendingTemplate = template;
  c.activeTool = "template";
  c.pendingDirectionStart = null;
  c.pendingDashStart = null;
  document.querySelectorAll(".coachTemplateBtn").forEach(btn=>btn.classList.toggle("active", btn.dataset.coachTemplate === template));
  persist();
  closeCoachObjects();
  const names = { rowH:"fila horizontal", rowV:"fila vertical", rowD:"fila diagonal", zigzag:"zigzag", square:"cuadrado", circuit:"circuito" };
  toast("Toca la pista para crear " + (names[template] || "la plantilla"));
}
function fitCoachTemplatePoints(points){
  const minX = Math.min(...points.map(p=>p.x)), maxX = Math.max(...points.map(p=>p.x));
  const minY = Math.min(...points.map(p=>p.y)), maxY = Math.max(...points.map(p=>p.y));
  let shiftX = 0, shiftY = 0;
  if (minX < 0.04) shiftX = 0.04 - minX;
  else if (maxX > 0.96) shiftX = 0.96 - maxX;
  if (minY < 0.04) shiftY = 0.04 - minY;
  else if (maxY > 0.96) shiftY = 0.96 - maxY;
  return points.map(p=>({x:clamp01(p.x + shiftX), y:clamp01(p.y + shiftY)}));
}
function makeCoachTemplatePoints(template, origin){
  const o = {x:clamp01(origin.x), y:clamp01(origin.y)};
  // Separación amplia: deja aproximadamente un cono libre entre conos en móvil.
  const sx = isCoachHalfCourt() ? 0.17 : 0.145;
  const sy = isCoachHalfCourt() ? 0.145 : 0.122;
  let pts = [];
  if (template === "rowH") pts = [-2,-1,0,1,2].map(i=>({x:o.x+i*sx,y:o.y}));
  else if (template === "rowV") pts = [-2,-1,0,1,2].map(i=>({x:o.x,y:o.y+i*sy}));
  else if (template === "rowD") pts = [-2,-1,0,1,2].map(i=>({x:o.x+i*sx*.86,y:o.y+i*sy*.86}));
  else if (template === "zigzag") pts = [-2.5,-1.5,-.5,.5,1.5,2.5].map((i,idx)=>({x:o.x+i*sx*.92,y:o.y+(idx%2===0?-1:1)*sy*1.05}));
  else if (template === "square") pts = [{x:o.x-sx*1.55,y:o.y-sy*1.55},{x:o.x+sx*1.55,y:o.y-sy*1.55},{x:o.x-sx*1.55,y:o.y+sy*1.55},{x:o.x+sx*1.55,y:o.y+sy*1.55}];
  else if (template === "circuit") pts = [
    {x:o.x-sx*2.05,y:o.y-sy*1.75},{x:o.x,y:o.y-sy*1.75},{x:o.x+sx*2.05,y:o.y-sy*1.75},
    {x:o.x+sx*2.05,y:o.y},{x:o.x,y:o.y+sy*1.05},{x:o.x-sx*2.05,y:o.y+sy*1.75},{x:o.x,y:o.y+sy*1.75}
  ];
  else pts = [{x:o.x,y:o.y}];
  return fitCoachTemplatePoints(pts);
}
function placeCoachTemplate(template, pt){
  const c = ensureCoachState();
  const originSnap = coachSnapPoint(pt, { type:"cone" });
  const pts = makeCoachTemplatePoints(template, originSnap.point);
  const label = { rowH:"Fila horizontal", rowV:"Fila vertical", rowD:"Fila diagonal", zigzag:"Zigzag", square:"Cuadrado", circuit:"Circuito" }[template] || "Plantilla";
  recordCoachHistory();
  const now = Date.now();
  pts.forEach((p, idx)=>{
    c.objects.push({ id:"obj_"+now.toString(36)+"_"+idx+"_"+Math.random().toString(36).slice(2,5), type:"cone", label:"Cono", x:p.x, y:p.y, template:label, createdAt:now+idx });
  });
  c.pendingTemplate = null;
  c.activeTool = "cone";
  renderCoachObjects();
  showCoachAlignmentGuides(originSnap.point, originSnap.guides);
  persist();
  toast(label + " creado");
}
function toggleCoachObjectSelection(id){
  const c = ensureCoachState();
  c.selectedObjectIds = Array.isArray(c.selectedObjectIds) ? c.selectedObjectIds : [];
  if (c.selectedObjectIds.includes(id)) c.selectedObjectIds = c.selectedObjectIds.filter(x=>x!==id);
  else c.selectedObjectIds.push(id);
  renderCoachObjects();
  updateCoachSelectionUI();
  persist();
}
function getSelectedCoachObjects(){
  const c = ensureCoachState();
  const ids = new Set(c.selectedObjectIds || []);
  return (c.objects || []).filter(o=>ids.has(o.id));
}
function clearCoachObjectSelection(){
  const c = ensureCoachState();
  c.selectedObjectIds = [];
  renderCoachObjects();
  updateCoachSelectionUI();
  persist();
}
function updateCoachSelectionUI(){
  const c = ensureCoachState();
  const validIds = new Set((c.objects || []).map(o=>o.id));
  c.selectedObjectIds = (c.selectedObjectIds || []).filter(id=>validIds.has(id));
  const count = c.selectedObjectIds.length;
  const label = document.getElementById("coachSelectionCount");
  if (label) label.textContent = count ? (count + (isEn() ? " selected" : " seleccionados")) : tr("Toca objetos en la pista para seleccionarlos", "Tap objects on the court to select them");
  document.querySelectorAll(".coachSelectionAction").forEach(btn=>btn.disabled = count < Number(btn.dataset.minSelection || 1));
}
function alignCoachSelected(axis){
  const selected = getSelectedCoachObjects();
  if (selected.length < 2){ toast("Selecciona al menos 2 objetos"); return; }
  recordCoachHistory();
  if (axis === "h"){
    const y = selected.reduce((a,o)=>a+clamp01(o.y),0)/selected.length;
    selected.forEach(o=>{ o.y = y; });
    renderCoachObjects();
    showCoachAlignmentGuides({x:selected[0].x,y}, [{type:"h", y}]);
  } else {
    const x = selected.reduce((a,o)=>a+clamp01(o.x),0)/selected.length;
    selected.forEach(o=>{ o.x = x; });
    renderCoachObjects();
    showCoachAlignmentGuides({x,y:selected[0].y}, [{type:"v", x}]);
  }
  persist();
  toast(axis === "h" ? "Objetos alineados en horizontal" : "Objetos alineados en vertical");
}
function distributeCoachSelected(axis){
  const selected = getSelectedCoachObjects();
  if (selected.length < 3){ toast("Selecciona al menos 3 objetos"); return; }
  recordCoachHistory();
  const key = axis === "h" ? "x" : "y";
  const sorted = selected.slice().sort((a,b)=>clamp01(a[key])-clamp01(b[key]));
  const min = clamp01(sorted[0][key]), max = clamp01(sorted[sorted.length-1][key]);
  const gap = (max - min) / Math.max(1, sorted.length - 1);
  sorted.forEach((o,idx)=>{ o[key] = clamp01(min + gap*idx); });
  renderCoachObjects();
  persist();
  toast(axis === "h" ? "Distancia horizontal igualada" : "Distancia vertical igualada");
}
function deleteCoachSelectedObjects(){
  const c = ensureCoachState();
  const ids = new Set(c.selectedObjectIds || []);
  if (!ids.size){ toast("No hay objetos seleccionados"); return; }
  recordCoachHistory();
  c.objects = (c.objects || []).filter(o=>!ids.has(o.id));
  c.selectedObjectIds = [];
  renderCoachObjects();
  persist();
  updateCoachSelectionUI();
  toast("Selección borrada");
}
function coachPointFromEvent(evt, el){ return evt ? pointNormFromEvent(evt, el || document.getElementById("court")) : centerNormFromEl(el); }
function coachPointFromClient(clientX, clientY){
  const surface = document.getElementById("courtSurface");
  const court = document.getElementById("court");
  const el = surface || court;
  if (!el) return { x:.5, y:.5 };
  const r = el.getBoundingClientRect();
  let x = (clientX - r.left) / Math.max(1, r.width);
  let y = (clientY - r.top) / Math.max(1, r.height);
  if (state.ui && state.ui.rotated){ x = 1 - x; y = 1 - y; }
  return { x:clamp01(x), y:clamp01(y) };
}
function coachPointFromCourtEvent(evt){
  if (!evt) return { x:.5, y:.5 };
  // Precisión real: medimos contra el courtSurface renderizado, no contra el contenedor.
  // Así el toque coincide con el objeto aunque la pista esté recortada, ampliada o en media pista.
  return coachPointFromClient(evt.clientX, evt.clientY);
}
function handleCoachPrecisePointerDown(evt){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  const tool = c.activeTool || "direction";
  if (!isCoachObjectTool(tool) && tool !== "direction" && tool !== "pattern" && tool !== "template" && !c.pendingTemplate) return;
  if (evt.target && evt.target.closest && evt.target.closest('.coachObject,.coachDashLine,.noteDelete,.coachHalfSwitch,.coachHistoryBtn,.quickBtn,.chip,.menuItem')) return;
  const pt = coachPointFromCourtEvent(evt);
  window.__coachPreciseHandledAt = Date.now();
  evt.preventDefault();
  evt.stopPropagation();
  handleCoachToolAtPoint(pt, pt.y > .5 ? "B" : "A");
}
function handleCoachDirectionTap(pt, hitter="A"){
  const c = ensureCoachState();
  if (!state.point || !state.point.coach) initCoachPoint();
  recordCoachHistory();
  if (!c.pendingDirectionStart){
    c.pendingDirectionStart = { x:clamp01(pt.x), y:clamp01(pt.y), hitter };
    state.point.events.push({type:"coachStart", player:hitter, code:"Inicio", meta:{touch:pt, coach:true}});
    renderPoint();
    persist();
    toast("Inicio de flecha marcado");
    return false;
  }
  const from = c.pendingDirectionStart;
  const p = state.point;
  p.arrows = Array.isArray(p.arrows) ? p.arrows : [];
  const n = p.arrows.length + 1;
  const a = { n, hitter: hitter || from.hitter || "A", from:{x:clamp01(from.x), y:clamp01(from.y)}, through:{x:clamp01(pt.x), y:clamp01(pt.y)}, to:{x:clamp01(pt.x), y:clamp01(pt.y)}, coach:true };
  p.arrows.push(a);
  p.events.push({type:"coachArrow", player:a.hitter, code:`Flecha ${n}`, meta:{from:a.from,to:a.to,coach:true}});
  c.pendingDirectionStart = { x:clamp01(pt.x), y:clamp01(pt.y), hitter:a.hitter };
  renderPoint();
  renderLiveArrows(true);
  persist();
  return true;
}
function handleCoachToolAtPoint(pt, hitter="A"){
  const c = ensureCoachState();
  const tool = c.activeTool || "direction";
  if (c.pendingTemplate || tool === "template") { placeCoachTemplate(c.pendingTemplate || "rowH", pt); return true; }
  if (tool === "direction" || tool === "pattern") return handleCoachDirectionTap(pt, hitter);
  if (tool === "dash"){
    if (!state.point || !state.point.coach) initCoachPoint();
    recordCoachHistory();
    if (!c.pendingDashStart){
      c.pendingDashStart = {x:clamp01(pt.x), y:clamp01(pt.y), hitter};
      state.point.events.push({type:"coachDashStart", player:hitter, code:"Inicio desplazamiento", meta:{touch:pt, coach:true}});
      renderPoint();
      persist();
      toast("Inicio de desplazamiento marcado");
      return true;
    }
    const p = state.point;
    p.arrows = Array.isArray(p.arrows) ? p.arrows : [];
    const n = p.arrows.length + 1;
    const from = c.pendingDashStart;
    const a = { n, type:"dash", hitter: hitter || from.hitter || "A", from:{x:clamp01(from.x), y:clamp01(from.y)}, through:{x:clamp01(pt.x), y:clamp01(pt.y)}, to:{x:clamp01(pt.x), y:clamp01(pt.y)}, coach:true };
    p.arrows.push(a);
    p.events.push({type:"coachDash", player:a.hitter, code:`Desplazamiento ${n}`, meta:{from:a.from,to:a.to,coach:true}});
    c.pendingDashStart = { x:clamp01(pt.x), y:clamp01(pt.y), hitter:a.hitter };
    renderPoint();
    renderLiveArrows(true);
    persist();
    toast("Desplazamiento añadido");
    return true;
  }
  addCoachObject(tool, pt);
  return true;
}
function handleCoachCourtToolFromElement(el, evt, side="top"){
  if (!isCoachMode()) return false;
  const pt = evt ? coachPointFromCourtEvent(evt) : centerNormFromEl(el);
  const hitter = side === "bottom" ? "B" : "A";
  return handleCoachToolAtPoint(pt, hitter);
}
function handleCoachCourtFreeClick(evt){
  if (!isCoachMode()) return;
  if (window.__coachPreciseHandledAt && Date.now() - window.__coachPreciseHandledAt < 450) return;
  const c = ensureCoachState();
  if (!isCoachObjectTool(c.activeTool) && c.activeTool !== "direction" && c.activeTool !== "pattern" && c.activeTool !== "template" && !c.pendingTemplate) return;
  if (evt.target.closest && evt.target.closest('.zoneCell,.serveCell,.coachObject,.coachDashLine,.coachHalfSwitch,.coachHistoryBtn,.quickBtn,.chip,.menuItem')) return;
  const pt = coachPointFromCourtEvent(evt);
  handleCoachToolAtPoint(pt, pt.y > .5 ? "B" : "A");
}
function addCoachObject(type, pt){
  const c = ensureCoachState();
  let label = coachToolLabel(type);
  if (type === "text") label = prompt("Texto de la nota", "Nota") || "Nota";
  const snapped = coachSnapPoint(pt, { type });
  const obj = { id:"obj_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,5), type, label, x:clamp01(snapped.point.x), y:clamp01(snapped.point.y), createdAt:Date.now() };
  if (type === "ladder") {
    obj.orientation = "horizontal";
    obj.anchor = "startCorner"; // el toque es el inicio/esquina izquierda de la escalera
  }
  recordCoachHistory();
  c.objects.push(obj);
  renderCoachObjects();
  showCoachAlignmentGuides(snapped.point, snapped.guides);
  persist();
}
function renderCoachObjects(){
  const layer = document.getElementById("coachObjectsLayer");
  if (!isCoachMode()) { if (layer) layer.innerHTML = ""; return; }
  renderCoachObjectsInto("coachObjectsLayer", false);
  updateCoachSelectionUI();
}
function renderCoachObjectsInto(layerId, preview=false){
  const layer = document.getElementById(layerId);
  if (!layer) return;
  const c = ensureCoachState();
  layer.innerHTML = "";
  (c.objects || []).forEach((obj, idx)=>{
    if (obj.type === "dashLine"){
      const el = document.createElement("div");
      el.className = "coachDashLine";
      const dx = (clamp01(obj.x2)-clamp01(obj.x));
      const dy = (clamp01(obj.y2)-clamp01(obj.y));
      const len = Math.hypot(dx,dy)*100;
      const ang = Math.atan2(dy,dx)*180/Math.PI;
      el.style.left = (clamp01(obj.x)*100)+"%";
      el.style.top = (clamp01(obj.y)*100)+"%";
      el.style.width = Math.max(6,len)+"%";
      el.style.transform = `rotate(${ang}deg)`;
      el.innerHTML = `<span></span>`;
      if (!preview) wireCoachDraggableDashLine(el, obj);
      layer.appendChild(el);
      return;
    }
    const el = document.createElement(obj.type === "text" ? "div" : "button");
    if (obj.type !== "text") el.type = "button";
    const isSelected = !preview && (c.selectedObjectIds || []).includes(obj.id);
    el.className = "coachObject coachObject-" + (obj.type || "cone") + (obj.type === "ladder" && obj.orientation === "vertical" ? " ladderVertical" : "") + (isSelected ? " isSelected" : "");
    el.style.left = (clamp01(obj.x) * 100) + "%";
    el.style.top = (clamp01(obj.y) * 100) + "%";
    el.innerHTML = coachObjectMarkup(obj, idx, preview);
    el.title = obj.label || coachToolLabel(obj.type);
    if (!preview){
      wireCoachDraggableObject(el, obj, { onTap:()=>toggleCoachObjectSelection(obj.id) });
      if (obj.type === "text") {
        el.querySelector('.noteDelete')?.addEventListener('click',(e)=>{e.stopPropagation(); removeCoachObject(obj.id);});
        el.addEventListener('dblclick',(e)=>{ e.preventDefault(); e.stopPropagation(); editCoachTextObject(obj); });
      }
      if (obj.type === "ladder") {
        el.querySelector(".ladderRotateBtn")?.addEventListener("click", (e)=>{
          e.preventDefault();
          e.stopPropagation();
          recordCoachHistory();
          obj.orientation = obj.orientation === "vertical" ? "horizontal" : "vertical";
          renderCoachObjects();
          persist();
        });
      }
    }
    layer.appendChild(el);
  });
}
function coachObjectMarkup(obj, idx, preview=false){
  const t = obj.type || "cone";
  if (t === "cone") return `<span class="coneShape"></span>`;
  if (t === "hoop") return `<span class="hoopShape"></span>`;
  if (t === "basket") return `<span class="basketShape"><i></i></span>`;
  if (t === "ladder") return `<span class="ladderShape"></span>${preview ? '' : '<button class="ladderRotateBtn" type="button" aria-label="Rotar escalera">↻</button>'}`;
  if (t === "player") return `<span class="personShape">J</span>`;
  if (t === "coach") return `<span class="personShape coach">E</span>`;
  if (t === "target") return `<span class="targetShape"></span>`;
  if (t === "text") return `<div class="noteShape"><span>${escapeHtml(obj.label || 'Nota')}</span>${preview ? '' : '<button class="noteDelete" type="button" aria-label="Eliminar nota">×</button>'}</div>`;
  return `<span>${idx+1}</span>`;
}
function editCoachTextObject(obj){
  if (!obj) return;
  const txt = prompt('Editar nota', obj.label || 'Nota');
  if (txt !== null){
    recordCoachHistory();
    obj.label = txt || 'Nota';
    renderCoachObjects();
    persist();
  }
}

function wireCoachDraggableDashLine(el, obj){
  let start=null, moved=false, historyRecorded=false;
  const minMove = 5;
  const cleanup=()=>{
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };
  const apply=()=>{
    const dx = (clamp01(obj.x2)-clamp01(obj.x));
    const dy = (clamp01(obj.y2)-clamp01(obj.y));
    const len = Math.hypot(dx,dy)*100;
    const ang = Math.atan2(dy,dx)*180/Math.PI;
    el.style.left = (clamp01(obj.x)*100)+"%";
    el.style.top = (clamp01(obj.y)*100)+"%";
    el.style.width = Math.max(6,len)+"%";
    el.style.transform = `rotate(${ang}deg)`;
  };
  const onMove=(e)=>{
    if(!start) return;
    const dxPx=e.clientX-start.x0, dyPx=e.clientY-start.y0;
    if(Math.hypot(dxPx,dyPx)>minMove){
      moved=true;
      if(!historyRecorded){ recordCoachHistory(); historyRecorded=true; }
      const p0 = coachPointFromClient(start.x0, start.y0);
      const p1 = coachPointFromClient(e.clientX, e.clientY);
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      obj.x=clamp01(start.ox + dx); obj.y=clamp01(start.oy + dy);
      obj.x2=clamp01(start.ox2 + dx); obj.y2=clamp01(start.oy2 + dy);
      apply();
    }
  };
  const finish=()=>{ if(moved){ persist(); } };
  const onUp=(e)=>{ if(!start) return; cleanup(); try{ el.releasePointerCapture && el.releasePointerCapture(start.pointerId); }catch(_){} if(moved){ e&&e.preventDefault&&e.preventDefault(); finish(); } else { removeCoachObject(obj.id); } setTimeout(()=>{start=null;moved=false;historyRecorded=false;},0); };
  const onCancel=()=>{ if(!start) return; cleanup(); finish(); setTimeout(()=>{start=null;moved=false;historyRecorded=false;},0); };
  el.addEventListener('pointerdown',(e)=>{
    e.preventDefault(); e.stopPropagation();
    start={x0:e.clientX,y0:e.clientY,pointerId:e.pointerId,ox:clamp01(obj.x),oy:clamp01(obj.y),ox2:clamp01(obj.x2),oy2:clamp01(obj.y2)};
    moved=false; historyRecorded=false;
    try{ el.setPointerCapture && el.setPointerCapture(e.pointerId); }catch(_){}
    document.addEventListener('pointermove',onMove,{passive:false});
    document.addEventListener('pointerup',onUp,{passive:false});
    document.addEventListener('pointercancel',onCancel,{passive:false});
  });
  el.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); });
}

function wireCoachDraggableObject(el, obj, options={}){
  let start=null, moved=false, historyRecorded=false;
  const minMove = 5;
  const cleanup=()=>{
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
  };
  const updateEl=()=>{
    el.style.left=(clamp01(obj.x)*100)+'%';
    el.style.top=(clamp01(obj.y)*100)+'%';
  };
  const onMove=(e)=>{
    if(!start) return;
    const dx=e.clientX-start.x0, dy=e.clientY-start.y0;
    if(Math.hypot(dx,dy)>minMove){
      moved=true;
      if(!historyRecorded){ recordCoachHistory(); historyRecorded=true; }
      const pt = coachPointFromClient(e.clientX, e.clientY);
      obj.x=clamp01(pt.x); obj.y=clamp01(pt.y);
      updateEl();
    }
  };
  const finishDrag=()=>{
    if(moved){
      const snapped=coachSnapPoint({x:obj.x,y:obj.y},{type:obj.type, excludeId:obj.id});
      obj.x=snapped.point.x; obj.y=snapped.point.y;
      updateEl();
      showCoachAlignmentGuides(snapped.point, snapped.guides);
      persist();
    }
  };
  const onUp=(e)=>{
    if(!start) return;
    cleanup();
    try{ el.releasePointerCapture && el.releasePointerCapture(start.pointerId); }catch(_){ }
    if(moved){
      e && e.preventDefault && e.preventDefault();
      finishDrag();
      setTimeout(()=>{start=null; moved=false; historyRecorded=false;},0);
      return;
    }
    const tap = options && typeof options.onTap === 'function' ? options.onTap : null;
    if (tap) tap(e);
    setTimeout(()=>{start=null; moved=false; historyRecorded=false;},0);
  };
  const onCancel=(e)=>{
    if(!start) return;
    cleanup();
    if(moved){ finishDrag(); }
    setTimeout(()=>{start=null; moved=false; historyRecorded=false;},0);
  };
  el.addEventListener('pointerdown',(e)=>{
    if(e.target.closest && e.target.closest('.noteDelete,.ladderRotateBtn')) return;
    e.preventDefault();
    e.stopPropagation();
    start={x0:e.clientX,y0:e.clientY,pointerId:e.pointerId,ox:obj.x,oy:obj.y};
    moved=false; historyRecorded=false;
    try{ el.setPointerCapture && el.setPointerCapture(e.pointerId); }catch(_){ }
    document.addEventListener('pointermove',onMove,{passive:false});
    document.addEventListener('pointerup',onUp,{passive:false});
    document.addEventListener('pointercancel',onCancel,{passive:false});
  });
  el.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); });
  el.addEventListener('keydown',(e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault(); e.stopPropagation();
      if(options && typeof options.onTap === 'function') options.onTap(e);
    }
  });
}
function removeCoachObject(id){
  const c = ensureCoachState();
  recordCoachHistory();
  c.objects = (c.objects || []).filter(o=>o.id!==id);
  renderCoachObjects();
  persist();
}
function deleteLastCoachObject(){
  const c = ensureCoachState();
  if (c.objects && c.objects.length){ recordCoachHistory(); c.objects.pop(); renderCoachObjects(); persist(); toast("Objeto borrado"); }
}
function coachFinalizePattern(){
  if (!isCoachMode()) return;
  syncCoachStateFromInline();
  const c = ensureCoachState();
  const p = state.point;
  if (!p || !p.arrows || !p.arrows.length){ toast("No hay patrón activo"); return; }
  recordCoachHistory();
  const id = "pat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,5);
  c.patterns.push({ id, name:"Patrón " + (c.patterns.length + 1), events:JSON.parse(JSON.stringify(p.events || [])), arrows:JSON.parse(JSON.stringify(p.arrows || [])), details:{ name:c.exerciseName, goal:c.goal, level:c.level, material:c.material, tags:c.tags, notes:c.notes }, createdAt:Date.now() });
  initCoachPoint();
  c.pendingDirectionStart = null;
  persist();
  renderAll();
  toast("Patrón guardado en el ejercicio");
}
function openCoachPreview(){
  if (!isCoachMode()) return;
  pauseCoachPreviewSequence(true);
  renderCoachPreview();
  openModal("#coachPreviewModal");
}
function closeCoachPreview(){ pauseCoachPreviewSequence(true); closeModal("#coachPreviewModal"); }
function renderCoachPreview(){
  const img = document.getElementById("coachPreviewImg");
  if (img) img.src = surfaceById(state.ui?.surface || "hard").img;
  const svg = document.getElementById("coachPreviewSvg");
  if (svg) renderArrows(svg, getAllCoachArrows(), { animateFromIndex:null, fadeOld:false });
  const sub = document.getElementById("coachPreviewSub");
  if (sub){ const c=ensureCoachState(); sub.textContent = `${c.exerciseName || 'Ejercicio'} · ${(c.patterns||[]).length} patrones · ${(c.objects||[]).length} objetos`; }
  renderCoachObjectsInto("coachPreviewObjects", true);
  setCoachPreviewPlaybackUI();
}
let __coachPreviewTimer = null;
let __coachPreviewPlaying = false;
let __coachPreviewIndex = 0;

function setCoachPreviewPlaybackUI(){
  const play = document.getElementById("btnCoachPreviewPlay");
  if (play){
    play.textContent = __coachPreviewPlaying ? "⏸ Pause" : "▶ Play";
    play.disabled = false;
    play.classList.toggle("isPause", !!__coachPreviewPlaying);
    play.setAttribute("aria-pressed", __coachPreviewPlaying ? "true" : "false");
    play.title = __coachPreviewPlaying ? "Pausar preview" : "Reproducir preview";
  }
}
function pauseCoachPreviewSequence(showFull=false){
  if (__coachPreviewTimer){ clearTimeout(__coachPreviewTimer); __coachPreviewTimer = null; }
  __coachPreviewPlaying = false;
  setCoachPreviewPlaybackUI();
  if (showFull){
    const svg = document.getElementById("coachPreviewSvg");
    if (svg) renderArrows(svg, getAllCoachArrows(), { animateFromIndex:null, fadeOld:false });
  }
}
function toggleCoachPreviewPlayback(){
  if (__coachPreviewPlaying) pauseCoachPreviewSequence(false);
  else playCoachPreviewSequence();
}
function playCoachPreviewSequence(){
  const svg = document.getElementById("coachPreviewSvg");
  const arrows = getAllCoachArrows();
  if (!svg || !arrows.length){ toast("No hay flechas para reproducir"); return; }
  if (__coachPreviewTimer){ clearTimeout(__coachPreviewTimer); __coachPreviewTimer = null; }
  __coachPreviewPlaying = true;
  __coachPreviewIndex = 0;
  setCoachPreviewPlaybackUI();
  const delay = 560;
  const loop = ()=>{
    if (!__coachPreviewPlaying) return;
    const idx = __coachPreviewIndex;
    renderArrows(svg, arrows.slice(0, idx + 1), { animateFromIndex:idx, fadeOld:false, highlightIndex:idx });
    __coachPreviewIndex = (idx + 1) % arrows.length;
    const nextDelay = (__coachPreviewIndex === 0) ? delay * 1.45 : delay;
    __coachPreviewTimer = setTimeout(loop, nextDelay);
  };
  svg.innerHTML = arrowDefs();
  loop();
}

// Modos eliminados de la UI: dejamos un único modo estable
// - Tema: oscuro
// - Layout: entrenador (coach)
function applyModes(){
  if (!state.ui) state.ui = { theme:"dark", coach:true, appMode:"match" };
  state.ui.theme = "dark";
  state.ui.coach = true;
  if (!state.ui.appMode) state.ui.appMode = "match";
  document.body.classList.remove("light");
  document.body.classList.add("coach");
  applyCoachModeUI();
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
  document.body.classList.toggle("scoreHiddenMode", !!state.ui.hideScore);

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

function toggleCoachCourtMode(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  c.courtMode = c.courtMode === "half" ? "full" : "half";
  if (c.courtMode === "half" && !c.halfView) c.halfView = "bottom";
  c.pendingDirectionStart = null;
  c.pendingDashStart = null;
  applyCoachModeUI();
  applyRailVisibility();
  renderLiveArrows(false);
  renderCoachObjects();
  persist();
  toast(c.courtMode === "half" ? "Media pista activada" : "Pista completa activada");
}
function toggleCoachHalfView(){
  if (!isCoachHalfCourt()) return;
  const c = ensureCoachState();
  c.halfView = c.halfView === "top" ? "bottom" : "top";
  c.pendingDirectionStart = null;
  c.pendingDashStart = null;
  applyCoachModeUI();
  applyRailVisibility();
  renderLiveArrows(false);
  renderCoachObjects();
  persist();
}
function updateCoachHalfSwitch(){
  const btn = document.getElementById("btnCoachHalfSwitch");
  if (!btn) return;
  const show = isCoachHalfCourt();
  const c = show ? ensureCoachState() : null;
  btn.hidden = !show;
  btn.classList.toggle("toTop", !!(show && c.halfView !== "top"));
  btn.classList.toggle("toBottom", !!(show && c.halfView === "top"));
  const label = show && c.halfView === "top" ? "Ver media pista inferior" : "Ver media pista superior";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.textContent = show && c.halfView === "top" ? "↓" : "↑";
}
function updateCoachGridButton(){
  const btn = document.getElementById("btnCoachToggleGrid");
  const label = document.getElementById("coachGridLabel");
  if (!btn || !isCoachMode()) return;
  const visible = !!ensureCoachState().showGrid;
  btn.classList.toggle("active", visible);
  btn.setAttribute("aria-pressed", visible ? "true" : "false");
  btn.title = visible ? "Ocultar cuadrícula" : "Mostrar cuadrícula";
  if (label) label.textContent = visible ? "Ocultar cuadrícula" : "Mostrar cuadrícula";
}
function toggleCoachGrid(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  c.showGrid = !c.showGrid;
  document.body.classList.toggle("coachGridVisible", !!c.showGrid);
  updateCoachGridButton();
  renderZonesVisibility();
  applyTapConstraints();
  persist();
}
function undoLastCoachPattern(){
  if (!isCoachMode()) return;
  const c = ensureCoachState();
  if (c.patterns && c.patterns.length){
    recordCoachHistory();
    c.patterns.pop();
    renderAll();
    persist();
    toast("Último patrón completo deshecho");
    return;
  }
  toast("No hay patrones completos para deshacer");
}
function applyRailVisibility(){
  const coach = isCoachMode();
  const railHidden = !coach && !!state.ui.hideRail;
  document.body.classList.toggle("railHidden", railHidden);
  const b = $("#btnToolsRail");
  if (b){
    if (coach){
      const half = isCoachHalfCourt();
      b.setAttribute("aria-pressed", half ? "true" : "false");
      b.setAttribute("aria-label", half ? "Cambiar a pista completa" : "Cambiar a media pista");
      b.title = half ? "Cambiar a pista completa" : "Cambiar a media pista";
      b.classList.toggle("isActive", half);
    } else {
      const isHidden = !!state.ui.hideRail;
      b.setAttribute("aria-pressed", isHidden ? "true" : "false");
      b.setAttribute("aria-label", "Menú derecho");
      b.title = isHidden ? "Menú derecho · Mostrar herramientas" : "Menú derecho · Ocultar herramientas";
      b.classList.toggle("isActive", isHidden);
    }
  }
}
function toggleRailVisibility(){
  if (isCoachMode()){
    toggleCoachCourtMode();
    applyRailVisibility();
    return;
  }
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
  const coachPvImg = document.getElementById('coachPreviewImg');
  if (coachPvImg) coachPvImg.src = s.img;
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
  applyCoachModeUI();
  renderMeta();
  applyScoreVisibility();
  applyRailVisibility();
  applyRotation();
  renderCourtNames();
  renderScore();
  renderPoint();
  renderCoachObjects();
  updateWorkspaceBar();
  renderDashboard();
  renderPlayerLibrary();
  renderAccountModal();
  applyCoachModeUI();
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
  on("btnNew","click", ()=>{ if (isCoachMode()) openConfirm("Nuevo ejercicio", "Se limpiará la pista del ejercicio actual.", ()=> newCoachExercise()); else openConfirm("Nuevo partido", "Se reiniciará el marcador y el historial del partido actual.", ()=>{ newMatch(); toast("✅ Nuevo partido"); }); });
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
  on("btnCoachExercises","click", ()=>openFromMenu(openCoachLibrary));
  on("btnCoachLoadExercise","click", ()=>openFromMenu(openCoachLibrary));
  on("btnCoachSaveExercise","click", ()=>openFromMenu(openCoachSave));
  on("btnCoachNewExercise","click", ()=>openFromMenu(()=>openConfirm("Nuevo ejercicio", "Se limpiará la pista del ejercicio actual.", ()=>newCoachExercise())));
  on("btnCoachObjects","click", ()=>openFromMenu(openCoachObjects));
  on("btnCoachCourtMode","click", ()=>openFromMenu(toggleCoachCourtMode));
  on("btnCoachClear","click", ()=>openFromMenu(()=>openConfirm("Limpiar pista", "Se borrarán patrones y objetos del ejercicio actual.", ()=>clearCoachCourt())));
  on("btnLanguage","click", ()=>openFromMenu(()=>openModal("#languageModal")));
  on("btnSplashLanguage","click", toggleLanguage);
  on("btnAuthLanguage","click", toggleLanguage);
  on("btnInfo","click", ()=>openFromMenu(()=>openModal("#infoModal")));
  on("btnBackHome","click", ()=>openFromMenu(()=>{ showSplashAgain(); }));
  on("btnCloseSurface","click", closeSurface);
  on("btnCloseLanguage","click", ()=>closeModal("#languageModal"));
  on("btnCloseInfo","click", ()=>closeModal("#infoModal"));
  on("btnCloseCoachSave","click", closeCoachSave);
  on("btnCloseCoachLibrary","click", closeCoachLibrary);
  on("btnCloseCoachObjects","click", closeCoachObjects);
  on("btnCloseCoachPreview","click", closeCoachPreview);
  on("btnCoachPreviewPlay","click", toggleCoachPreviewPlayback);
  on("btnCoachPreviewPause","click", ()=>pauseCoachPreviewSequence(false));
  on("btnCoachHalfSwitch","click", toggleCoachHalfView);
  on("btnCoachHalfSwitch","pointerdown", (e)=>{ e.stopPropagation(); });
  on("btnCoachToggleGrid","click", ()=>openFromMenu(toggleCoachGrid));
  on("btnCoachUndoPattern","click", undoLastCoachPattern);
  on("btnCoachGlobalUndo","click", undoCoachAction);
  on("btnCoachGlobalRedo","click", redoCoachAction);
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
  on("btnCoachObjectsRail","click", openCoachObjects);
  on("btnCoachDirection","click", ()=>setCoachTool("direction"));
  on("btnCoachFinishPattern","click", coachFinalizePattern);
  on("btnCoachPreview","click", openCoachPreview);
  on("btnCoachSaveRail","click", openCoachSave);
  on("btnDoSaveExercise","click", saveCoachExercise);
  on("btnCoachFinishPatternSave","click", coachFinalizePattern);
  on("btnCoachFinishPatternObjects","click", coachFinalizePattern);
  on("btnCoachDeleteLastObject","click", deleteLastCoachObject);
  on("btnCoachSelectPatternTool","click", ()=>setCoachTool("direction"));
  document.querySelectorAll(".coachPlacementBtn").forEach(btn=> btn.addEventListener("click", ()=>setCoachPlacementMode(btn.dataset.placementMode || "aligned")));
  document.querySelectorAll(".coachTemplateBtn").forEach(btn=> btn.addEventListener("click", ()=>setCoachTemplate(btn.dataset.coachTemplate || "rowH")));
  on("btnCoachAlignHorizontal","click", ()=>alignCoachSelected("h"));
  on("btnCoachAlignVertical","click", ()=>alignCoachSelected("v"));
  on("btnCoachDistributeHorizontal","click", ()=>distributeCoachSelected("h"));
  on("btnCoachDistributeVertical","click", ()=>distributeCoachSelected("v"));
  on("btnCoachClearSelection","click", clearCoachObjectSelection);
  on("btnCoachDeleteSelection","click", deleteCoachSelectedObjects);
  on("btnAddCoachFolder","click", addCoachFolder);
  on("coachExerciseSearch","input", renderCoachLibrary);
  ["coachInlineName","coachInlineFolder","coachInlineGoal","coachInlineLevel","coachInlineMaterial","coachInlineTags","coachInlineNotes"].forEach(id=>{
    on(id,"input", ()=>{ syncCoachStateFromInline(); persist(); updateWorkspaceBar(); });
    on(id,"change", ()=>{ syncCoachStateFromInline(); persist(); updateWorkspaceBar(); });
  });
  document.querySelectorAll(".coachToolBtn").forEach(btn=> btn.addEventListener("click", ()=>{ setCoachTool(btn.dataset.coachTool || "direction"); closeCoachObjects(); }));
  document.getElementById("court")?.addEventListener("pointerdown", handleCoachPrecisePointerDown, true);
  document.getElementById("court")?.addEventListener("click", handleCoachCourtFreeClick);

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
["btnSaveMatch","btnLoadMatch","btnGameMode","btnSurface","btnLanguage","btnInfo","btnBackHome","btnHistory","btnAnalytics","btnStats","btnCharts","btnExport","btnDashboardMenu","btnPlayerLibraryMenu","btnAccountMenu","btnHelpCenter","btnLegal","btnCoachExercises","btnCoachLoadExercise","btnCoachSaveExercise","btnCoachNewExercise","btnCoachObjects","btnCoachCourtMode","btnCoachClear"].forEach(id=>{
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
  on("finishBall","click", ()=>{ if (!isCoachMode()) toggleFinishMenu(); });
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
  ["aPerspective","aContext","aPatternLen","aMode","aMin","aIncludeServe"].forEach(id=>{
    on(id,"input", renderAnalytics);
    on(id,"change", renderAnalytics);
  });

  on("btnAnalyticsRefresh","click", renderAnalytics);
  on("btnAnalyticsPDF","click", exportAnalyticsPDF);

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
  ["saveLoadModal","gameModeModal","surfaceModal","languageModal","infoModal","historyModal","pointViewerModal","analyticsModal","statsModal","chartsModal","exportModal","dashboardModal","playersModal","accountModal","helpModal","legalModal","onboardingModal","coachSaveModal","coachLibraryModal","coachObjectsModal","coachPreviewModal"].forEach(mid=>{
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
      ["saveLoadModal","gameModeModal","surfaceModal","languageModal","infoModal","historyModal","pointViewerModal","analyticsModal","statsModal","chartsModal","exportModal","dashboardModal","playersModal","accountModal","helpModal","legalModal","onboardingModal","coachSaveModal","coachLibraryModal","coachObjectsModal","coachPreviewModal","finishMenu"].forEach(id=>{
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
function playerEditIcon(){
  return `<svg class="svgIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path d="M14.06 4.94l3.75 3.75"/></svg>`;
}
function playerDeleteIcon(){
  return `<svg class="svgIcon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
}
function playerChooserEmptyMarkup(){
  return `<div class="chooserEmptyCard"><h4>${tr("Sin perfiles todavía","No profiles yet")}</h4><p>${tr("Crea tu primer jugador para empezar a guardar historial, foto y asignaciones.","Create your first player to start saving history, photo and assignments.")}</p></div>`;
}
function switchPlayerLibraryMode(mode="home"){
  const choosePane = $("#playersChoosePane");
  const createPane = $("#playersCreatePane");
  const chooseBtn = $("#btnPlayersChooseMode");
  const createBtn = $("#btnPlayersCreateMode");
  const shell = $("#playerLibraryShell");

  if (mode === "choose"){
    closePlayerProfileDetail();
    closePlayers();
    renderPlayerLibrary();
    openPlayerChooser();
    return;
  }

  const isCreate = mode === "create";
  if (choosePane){
    choosePane.classList.add("hidden");
    choosePane.classList.remove("isVisibleForDetail");
  }
  if (createPane) createPane.classList.toggle("hidden", !isCreate);
  chooseBtn?.classList.remove("active");
  createBtn?.classList.toggle("active", isCreate);
  chooseBtn?.setAttribute("aria-pressed", "false");
  createBtn?.setAttribute("aria-pressed", isCreate ? "true" : "false");
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
  const list = $("#playerChooserList");
  const legacyList = $("#playerProfileList");
  const summary = $("#playerLibrarySummary");
  const chooserSummary = $("#playerChooserSummary");
  const profiles = getPlayerProfiles().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  if (summary) summary.textContent = isEn() ? `${profiles.length} profiles available` : `${profiles.length} perfiles disponibles`;
  if (chooserSummary) chooserSummary.textContent = isEn() ? `${profiles.length} profiles available · Tap a card to view, edit, delete or assign.` : `${profiles.length} perfiles disponibles · Toca una ficha para ver, editar, borrar o asignar.`;
  if (legacyList) legacyList.innerHTML = "";
  if (!list) return;
  if (!profiles.length){
    closePlayerProfileDetail();
    list.innerHTML = playerChooserEmptyMarkup();
    return;
  }
  list.innerHTML = profiles.map(profile => {
    const assigned = [];
    if (state.playerAssignments?.A === profile.id) assigned.push("A");
    if (state.playerAssignments?.B === profile.id) assigned.push("B");
    return `
      <article class="playerChooserCard">
        <div class="playerChooserTop">
          <div class="playerChooserAvatar ${profile.photoData ? 'hasPhoto' : ''}">${profile.photoData ? `<img src="${profile.photoData}" alt="Foto de ${escapeHtml(profile.name || 'Jugador')}">` : defaultAvatarSVG(profile.sex || 'M')}</div>
          <div class="playerChooserIdentity">
            <div class="playerChooserName">${escapeHtml(profile.name || 'Jugador')}</div>
          </div>
          <button class="playerIconBtn" type="button" data-profile-action="edit" data-profile-id="${profile.id}" aria-label="${tr('Editar','Edit')}" title="${tr('Editar','Edit')}">${playerEditIcon()}</button>
          <button class="playerIconBtn delete" type="button" data-profile-action="delete" data-profile-id="${profile.id}" aria-label="${tr('Borrar','Delete')}" title="${tr('Borrar','Delete')}">${playerDeleteIcon()}</button>
        </div>
        <div class="playerChooserBottom">
          <button class="chip primary" type="button" data-profile-action="view" data-profile-id="${profile.id}">${tr('Ver ficha','View profile')}</button>
          <button class="chip" type="button" data-profile-action="assignA" data-profile-id="${profile.id}">${tr('Asignar A','Assign A')}</button>
          <button class="chip" type="button" data-profile-action="assignB" data-profile-id="${profile.id}">${tr('Asignar B','Assign B')}</button>
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
  closePlayerProfileDetail();
  const hasProfiles = getPlayerProfiles().length > 0;
  openModal("#playersModal");
  switchPlayerLibraryMode(hasProfiles ? "home" : "create");
  if (!hasProfiles) setTimeout(()=> $("#profileName")?.focus(), 30);
}
function closePlayers(){ closeModal("#playersModal"); }
function openPlayerChooser(){
  renderPlayerLibrary();
  openModal("#playerChooserModal");
}
function closePlayerChooser(){ closeModal("#playerChooserModal"); }
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
  setAppMode("match");
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
  setAppMode("match");
  maybeOpenOnboarding(false);
}
function handleDemoAccess(){
  setSession({ uid:"__demo__", name:"Demo Coach", email:"demo@local", plan:"Demo", isDemo:true, remember:false }, false);
  activateUserContext(false);
  setAppMode("match");
}
function handleCoachAccess(){
  setSession({ uid:"__coach__", name:"Modo Entrenador", email:"coach@local", plan:"Coach Studio", isDemo:true, isCoach:true, remember:false }, false);
  activateUserContext(false);
  setAppMode("coach");
  return true;
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
  $("#btnCoachAccess")?.addEventListener("click", handleCoachAccess);
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
  $("#btnClosePlayerChooser")?.addEventListener("click", closePlayerChooser);
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
    if (action === "view"){
      closePlayerChooser();
      openModal("#playersModal");
      const choosePane = $("#playersChoosePane");
      if (choosePane){
        choosePane.classList.remove("hidden");
        choosePane.classList.add("isVisibleForDetail");
      }
      const createPane = $("#playersCreatePane");
      if (createPane) createPane.classList.add("hidden");
      renderPlayerProfileDetail(id);
    }
    if (action === "edit"){
      closePlayerChooser();
      openModal("#playersModal");
      loadProfileIntoForm(id);
    }
    if (action === "delete") openConfirm("Eliminar perfil", "Se borrará el perfil del jugador seleccionado.", ()=> deleteProfile(id));
    if (action === "closeDetail") closePlayerProfileDetail();
  };
  $("#playerProfileList")?.addEventListener("click", playerActionDelegate);
  $("#playerProfileSheet")?.addEventListener("click", playerActionDelegate);
  $("#playerChooserList")?.addEventListener("click", playerActionDelegate);
  ["dashboardModal","playersModal","playerChooserModal","accountModal","helpModal","legalModal","onboardingModal"].forEach(mid=>{
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
  if (__postSplashAction === "demo" || __postSplashAction === "coach"){
    const action = __postSplashAction;
    __postSplashAction = null;
    if (action === "demo"){
      handleDemoAccess();
      return;
    }
    if (action === "coach"){
      handleCoachAccess();
      return;
    }
  }

  if (isAuthenticated()){
    hideAuthPortal();
    updateWorkspaceBar();
    maybeOpenOnboarding(false);
    return;
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
  const btnCoach = document.getElementById("btnSplashCoach");
  const btnSplashLang = document.getElementById("btnSplashLanguage");
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
    if (target === btn || target === btnLogin || target === btnSignup || target === btnDemo || target === btnCoach || target === btnSplashLang) return;
    leaveSplash("login");
  });

  btn.onclick = ()=> leaveSplash("login");
  btnLogin?.addEventListener("click", ()=> leaveSplash("login"));
  btnSignup?.addEventListener("click", ()=> leaveSplash("signup"));
  btnDemo?.addEventListener("click", ()=> leaveSplash("demo"));
  btnCoach?.addEventListener("click", ()=> leaveSplash("coach"));
  btnSplashLang?.addEventListener("click", openEntryLanguage);
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
window.handleCoachAccess = handleCoachAccess;
window.openEntryLanguage = openEntryLanguage;
window.setLanguage = setLanguage;
window.toggleTdtLanguage = toggleLanguage;
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