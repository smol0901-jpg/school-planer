(() => {
  'use strict';

  const STORAGE_KEY = 'orbit-planner-v3';
  const BACKUP_KEY = 'orbit-planner-backup-v3';
  const APP_VERSION = '3.23.0';
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  // Склонения: «на понедельник», «во вторник», «в среду»
  const DAYS_NA = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const DAYS_PREP = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];
  const DAYS_GEN = ['понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы', 'воскресенья'];
  function dayNa(d) { return DAYS_NA[d] || '?'; }
  function dayPrep(d) { return DAYS_PREP[d] || '?'; }
  function dayGen(d) { return DAYS_GEN[d] || '?'; }
  const SUBJECTS = [
    'Разговоры о важном',
    'Русский язык',
    'Математика',
    'Физкультура',
    'Окружающий мир',
    'Литературное чтение',
    'Музыка',
    'Технология',
    'ИЗО',
    'Английский язык',
    'История',
    'Обществознание',
    'Биология',
    'География',
    'Физика',
    'Химия',
    'Информатика',
    'ОБЖ',
    'Классный час'
  ];
  // Сокращения и синонимы предметов
  const SUBJECT_ALIASES = {
    'мат': 'Математика', 'матем': 'Математика', 'математика': 'Математика', 'algebra': 'Математика',
    'рус': 'Русский язык', 'русский': 'Русский язык', 'русск': 'Русский язык', 'русский язык': 'Русский язык',
    'физра': 'Физкультура', 'физру': 'Физкультура', 'физ-ра': 'Физкультура', 'физкультура': 'Физкультура', 'физкул': 'Физкультура',
    'окруж': 'Окружающий мир', 'окружающий': 'Окружающий мир', 'окружающий мир': 'Окружающий мир', 'мир': 'Окружающий мир',
    'лит': 'Литературное чтение', 'чтение': 'Литературное чтение', 'литература': 'Литературное чтение', 'литературное чтение': 'Литературное чтение',
    'муз': 'Музыка', 'музыка': 'Музыка',
    'тех': 'Технология', 'технология': 'Технология', 'труд': 'Технология',
    'изо': 'ИЗО', 'рисование': 'ИЗО', 'арт': 'ИЗО',
    'англ': 'Английский язык', 'английский': 'Английский язык', 'ин яз': 'Английский язык', 'inyaз': 'Английский язык',
    'история': 'История', 'ист': 'История',
    'общество': 'Обществознание', 'общ': 'Обществознание', 'обществознание': 'Обществознание',
    'био': 'Биология', 'биология': 'Биология',
    'гео': 'География', 'география': 'География',
    'физ': 'Физика', 'физика': 'Физика',
    'хим': 'Химия', 'химия': 'Химия',
    'инфа': 'Информатика', 'информатика': 'Информатика', 'икт': 'Информатика',
    'обж': 'ОБЖ',
    'классный': 'Классный час', 'кч': 'Классный час', 'классный час': 'Классный час',
    'разговоры': 'Разговоры о важном', 'ров': 'Разговоры о важном', 'разговоры о важном': 'Разговоры о важном'
  };
  function normalizeAgentText(t) {
    return (t || '').toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»""']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function resolveSubject(raw) {
    if (!raw) return null;
    const t = normalizeAgentText(raw);
    // Command words are never subjects
    if (/^(очисти|удали|убери|перенес|перемест|покажи|добавь|помощь|свободн|нагрузк|что|когда|я |отмена|стоп)/.test(t)) return null;
    if (SUBJECT_ALIASES[t]) return SUBJECT_ALIASES[t];
    // Match whole tokens only (not substring inside other words like ист in очисти)
    const tokens = t.split(/[\s,.;:!?]+/).filter(Boolean);
    let best = null, bestLen = 0;
    for (const [alias, full] of Object.entries(SUBJECT_ALIASES)) {
      for (const tok of tokens) {
        if (tok === alias && alias.length >= bestLen) { best = full; bestLen = alias.length; }
      }
    }
    if (best) return best;
    // full subject name as whole phrase or token
    const found = SUBJECTS.find(s => {
      const sl = s.toLowerCase();
      return t === sl || tokens.some(tok => tok === sl || (tok.length >= 4 && sl.startsWith(tok)));
    });
    if (found) return found;
    // Не считать свободный текст предметом (привет, ок, спасибо и т.д.)
    const blocked = /^(привет|здравств|хай|hello|hi|ку|йо|спасибо|пожалуйста|ок|окей|ладно|да|нет|хорошо|понял|ясно|стоп|отмена|help|помощь|агент|что|как|когда|где|зачем|почему|автобус|маршрут|домашк|дз|день\s*рожден|др)$/;
    if (blocked.test(t)) return null;
    // Свободный текст — только если похож на название предмета из списка или 1 короткое слово не из blocked
    if (tokens.length === 1 && tokens[0].length >= 3 && !blocked.test(tokens[0])) {
      // только если есть пересечение с известными предметами
      const soft = SUBJECTS.find(s => s.toLowerCase().includes(tokens[0]) || tokens[0].includes(s.toLowerCase().slice(0, 4)));
      if (soft) return soft;
    }
    return null;
  }

  function formatDurationMin(mins) {
    if (mins == null || isNaN(mins)) return '';
    const n = Math.round(mins);
    const abs = Math.abs(n);
    if (abs < 60) return n + ' мин';
    const h = Math.floor(abs / 60), m = abs % 60;
    const sign = n < 0 ? '−' : '';
    if (m === 0) return sign + h + ' ч';
    return sign + h + ' ч ' + m + ' мин';
  }

  function upcomingCount(list, nowMin) {
    return list.filter(e => {
      const endT = parseTime(e.end);
      const startT = parseTime(e.start);
      if (endT != null) return endT >= nowMin - 1;
      if (startT != null) return startT + getLessonDuration() >= nowMin - 1;
      return true;
    }).length;
  }

  function busDirection(b) {
    const to = ((b.to || b.destination || '') + ' ' + (b.notes || '')).toLowerCase();
    const from = (b.from || '').toLowerCase();
    const dirField = (b.direction || b.dir || '').toLowerCase();
    if (dirField === 'school' || dirField === 'школа' || dirField === 'to_school') return 'school';
    if (dirField === 'home' || dirField === 'дом' || dirField === 'to_home') return 'home';
    // explicit school destination
    if (/(^|[\s,.(])школ|(^|[\s,.(])гимназ|(^|[\s,.(])лицей|school|колледж/.test(to)) return 'school';
    // home / village destination (avoid matching случайные слова)
    if (/(^|[\s,.(])дом(ой|а|у|е|$)\b|домой|home|рейзин|большое\s*рейзин/.test(to)) return 'home';
    // from school → not school = homebound
    if (/(^|[\s,.(])школ|(^|[\s,.(])гимназ|(^|[\s,.(])лицей/.test(from) && !/(^|[\s,.(])школ/.test(to)) return 'home';
    // from home/village → schoolbound if not already home
    if (/(^|[\s,.(])дом|рейзин|пос[её]л|home/.test(from) && !/(^|[\s,.(])дом|рейзин/.test(to)) return 'school';
    return 'other';
  }

  function getRelevantBuses(nowMin, mode, limit, opts) {
    limit = limit || 4;
    opts = opts || {};
    const horizon = opts.horizon != null ? opts.horizon : nowMin + 120;
    const allowPast = !!opts.allowPast;
    const seen = new Set();
    const list = [];
    const sorted = [...state.buses].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    for (const b of sorted) {
      const t = parseTime(b.time);
      if (t == null) continue;
      if (!allowPast && t < nowMin - 2) continue;
      if (t > horizon) continue;
      const key = [b.number, b.time, b.from || '', b.to || b.destination || ''].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const dir = busDirection(b);
      if (mode === 'home' && dir !== 'home') continue;
      if (mode === 'school' || mode === 'morning') {
        if (dir !== 'school') continue;
      }
      list.push(b);
      if (list.length >= limit) break;
    }
    return list;
  }

  function formatBusAgentList(buses, nowMin) {
    if (!buses.length) return null;
    return buses.map(b => {
      const t = parseTime(b.time);
      const walk = Number(b.walkMin) || 0;
      const leave = t != null ? t - walk - nowMin : null;
      const route = (b.from && b.to) ? (b.from + ' → ' + b.to) : (b.to || b.destination || b.from || '');
      const dir = busDirection(b);
      const dirL = dir === 'school' ? ' [в школу]' : dir === 'home' ? ' [домой]' : '';
      return '• №' + (b.number || '?') + ' в ' + (b.time || '') +
        (leave != null ? ', выйти через ' + formatDurationMin(leave) : '') +
        ' · ' + route + dirL;
    }).join('\n');
  }

  function agentBusesReply(mode) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    let buses = getRelevantBuses(nowMin, mode, 6);
    if (buses.length) {
      return (mode === 'school' ? 'Автобусы в школу:\n' : mode === 'home' ? 'Автобусы домой:\n' : 'Автобусы:\n') +
        formatBusAgentList(buses, nowMin);
    }
    // no more today in this direction — look until end of day
    buses = getRelevantBuses(nowMin, mode, 6, { horizon: 24 * 60 });
    if (buses.length) {
      return 'На ближайшие 2 часа рейсов ' + (mode === 'school' ? 'в школу' : mode === 'home' ? 'домой' : '') +
        ' нет.\nПозже сегодня:\n' + formatBusAgentList(buses, nowMin);
    }
    // any direction remaining today
    const any = getRelevantBuses(nowMin, 'all', 4, { horizon: 24 * 60 });
    // earliest tomorrow-like: show first morning school buses as "завтра утром ориентир"
    const morning = getRelevantBuses(0, mode === 'all' ? 'school' : mode, 3, { horizon: 12 * 60, allowPast: true });
    const label = mode === 'school' ? 'в школу' : mode === 'home' ? 'домой' : '';
    let msg = 'Сейчас рейсов ' + label + ' на сегодня больше нет.';
    if (morning.length) {
      msg += '\nБлижайшие утром (ориентир на завтра):\n' + formatBusAgentList(morning, 0);
    } else if (any.length) {
      msg += '\nДругие рейсы сегодня:\n' + formatBusAgentList(any, nowMin);
    } else {
      const allDirs = { school: 0, home: 0, other: 0 };
      state.buses.forEach(b => { allDirs[busDirection(b)] = (allDirs[busDirection(b)] || 0) + 1; });
      msg += '\nВ базе: в школу ' + allDirs.school + ', домой ' + allDirs.home + ', другие ' + allDirs.other + '.';
      if (mode === 'school' && allDirs.school === 0) {
        msg += '\nДобавь рейс «дом/остановка → школа» во вкладке Автобус (поле «куда» = школа).';
      } else if (mode === 'home' && allDirs.home === 0) {
        msg += '\nДобавь рейс «школа → дом» (поле «куда» = дом/посёлок).';
      }
    }
    return msg;
  }


  let state = {
    profile: { name: '', className: '', school: '', notes: '', photo: '' },
    lessons: [], clubs: [], buses: [], notes: [],
    homework: [], goals: [], people: [], holidays: [], dayLogs: [], events: [],
    packChecks: {},
    settings: {
      theme: 'dark', accent: 'violet', radius: 14, density: 'comfortable', fontSize: 16, shadows: true,
      lessonDuration: 40, breakDuration: 10, break15: 15, longBreakDuration: 20, longBreakAfter: 3, breakAfter: [1, 2, 3], dayStart: '08:30', afterSchoolGapMin: 30
    }
  };

  let currentTab = 'today';
  let currentScheduleDay = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  let scheduleType = 'lessons';
  let kanbanView = 'board';
  let taskType = 'hw';
  let packDay = currentScheduleDay;
  let profileTab = 'info';
  let agentHistory = [];
  let agentPending = null; // { type: 'add_lesson'|'add_club'|'learn', subject?, day?, step? }
  try {
    const ap = localStorage.getItem('orbit-agent-pending');
    if (ap) agentPending = JSON.parse(ap);
  } catch (e) {}
  function setAgentPending(v) {
    agentPending = v;
    try {
      if (v) localStorage.setItem('orbit-agent-pending', JSON.stringify(v));
      else localStorage.removeItem('orbit-agent-pending');
    } catch (e) {}
  }
  let agentKnowledge = {}; // learned phrases -> meaning (from IndexedDB)
  let goingHome = false; // en route home — show home buses
  let atHome = false; // arrived home — hide buses until tomorrow / next morning
  let homeLogs = []; // { ts, time }

  let diaryMood = 3;
  let lastQrPayload = '';
  let qrScanTimer = null;
  let qrStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const UNDO_KEY = 'orbit-undo-stack-v1';
  const UNDO_MAX = 15;
  let undoStack = [];
  let undoBusy = false;

  function loadUndoStack() {
    // E2: undo only in memory — does not inflate localStorage / QuotaExceeded
    undoStack = [];
  }

  function updateUndoBtn() {
    const btn = document.getElementById('btn-undo');
    if (!btn) return;
    const n = undoStack.length;
    btn.disabled = n === 0;
    btn.style.opacity = n ? '1' : '0.4';
    btn.title = n ? ('Отменить · сохранено шагов: ' + n) : 'Нечего отменять';
    const badge = document.getElementById('undo-badge');
    if (badge) {
      badge.textContent = n > 0 ? String(n > 9 ? '9+' : n) : '';
      badge.style.display = n ? 'flex' : 'none';
    }
  }

  function undoLast(steps) {
    steps = Math.max(1, Math.min(Number(steps) || 1, undoStack.length || 1));
    if (!undoStack.length) { toast('Нечего отменять'); return; }
    undoBusy = true;
    try {
      let snap = null;
      for (let i = 0; i < steps && undoStack.length; i++) snap = undoStack.pop();
      if (!snap) { undoBusy = false; updateUndoBtn(); return; }
      state = migrate(JSON.parse(snap));
      const raw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(BACKUP_KEY, raw);
      applyTheme();
      render();
      toast(steps === 1 ? '↩ Отменён 1 шаг' : '↩ Отменено шагов: ' + steps);
    } catch (e) {
      console.warn(e);
      toast('Не удалось отменить');
    }
    undoBusy = false;
    updateUndoBtn();
  }

  function stateForStorage() {
    // Strip heavy audio payloads — stored in IndexedDB by audioId
    const clone = JSON.parse(JSON.stringify(state));
    if (Array.isArray(clone.notes)) {
      clone.notes = clone.notes.map(n => {
        if (n && n.audio) {
          const { audio, ...rest } = n;
          return rest;
        }
        return n;
      });
    }
    return clone;
  }

  function save() {
    try {
      if (!undoBusy) {
        try {
          const snap = JSON.stringify(stateForStorage());
          if (!undoStack.length || undoStack[undoStack.length - 1] !== snap) {
            undoStack.push(snap);
            if (undoStack.length > UNDO_MAX) undoStack.shift();
          }
        } catch (e) {}
      }
      const raw = JSON.stringify(stateForStorage());
      localStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(BACKUP_KEY, raw);
      updateUndoBtn();
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        toast('Память заполнена. Удали старые голосовые заметки или очисти данные.');
      } else {
        toast('Не удалось сохранить');
      }
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { state = migrate(JSON.parse(raw)); return; }
      const bak = localStorage.getItem(BACKUP_KEY);
      if (bak) state = migrate(JSON.parse(bak));
    } catch (e) {}
  }

  function migrate(p) {
    const base = {
      profile: { name: '', className: '', school: '', notes: '', photo: '' },
      lessons: [], clubs: [], buses: [], notes: [],
      homework: [], goals: [], people: [], holidays: [], dayLogs: [], events: [],
      packChecks: {},
      settings: {
        theme: 'dark', accent: 'violet', radius: 14, density: 'comfortable', fontSize: 16, shadows: true,
        lessonDuration: 40, breakDuration: 10, break15: 15, longBreakDuration: 20, longBreakAfter: 3, breakAfter: [1, 2, 3], dayStart: '08:30', afterSchoolGapMin: 30
      }
    };
    const s = { ...base, ...(p || {}) };
    s.profile = { ...base.profile, ...(s.profile || {}) };
    s.settings = { ...base.settings, ...(s.settings || {}) };
    for (const k of ['lessons','clubs','buses','notes','homework','goals','people','holidays','dayLogs','events']) {
      s[k] = Array.isArray(s[k]) ? s[k] : [];
    }
    s.packChecks = s.packChecks || {};
    const pc = s.packChecks;
    Object.keys(pc).forEach(k => {
      const m = /^pack-(\d)-(.+)$/.exec(k);
      if (m) {
        const nk = m[1] + ':' + m[2];
        if (pc[k] && !pc[nk]) pc[nk] = pc[k];
        delete pc[k];
      }
    });
    // Normalize entity types (import / legacy)
    const dayMap = {пн:0,понедельник:0,вт:1,вторник:1,ср:2,среда:2,чт:3,четверг:3,пт:4,пятница:4,сб:5,суббота:5,вс:6,воскресенье:6};
    function normDay(v) {
      if (typeof v === 'number' && v >= 0 && v <= 6) return v|0;
      const t = String(v || '').toLowerCase().trim();
      if (t in dayMap) return dayMap[t];
      const n = parseInt(t, 10);
      return (n >= 0 && n <= 6) ? n : 0;
    }
    function normTime(v) {
      if (v == null || v === '') return '';
      if (typeof v === 'number') {
        const total = Math.round(v * 24 * 60);
        return String(Math.floor(total/60)%24).padStart(2,'0') + ':' + String(total%60).padStart(2,'0');
      }
      const m = String(v).trim().match(/(\d{1,2})[:\.](\d{2})/);
      if (m) {
        const h = +m[1], mi = +m[2];
        if (h > 23 || mi > 59) return '';
        return String(h).padStart(2,'0') + ':' + String(mi).padStart(2,'0');
      }
      return String(v);
    }
    s.lessons = s.lessons.map(l => Object.assign({}, l, {
      day: normDay(l.day),
      start: normTime(l.start),
      end: normTime(l.end) || l.end,
      subject: String(l.subject || ''),
      id: l.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7))
    }));
    s.clubs = s.clubs.map(c => Object.assign({}, c, {
      day: normDay(c.day),
      start: normTime(c.start),
      end: normTime(c.end) || c.end,
      name: String(c.name || ''),
      id: c.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7))
    }));
    s.buses = s.buses.map(b => Object.assign({}, b, {
      time: normTime(b.time) || b.time,
      number: String(b.number || ''),
      from: String(b.from || ''),
      to: String(b.to || b.destination || ''),
      walkMin: Number(b.walkMin) || 0,
      id: b.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7))
    }));
    return s;
  }

  function todayIndex() {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  }
  function todayDateStr() { return new Date().toISOString().slice(0, 10); }
  function parseTime(t) {
    if (!t || typeof t !== 'string') return null;
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function formatTime(min) {
    if (min == null || isNaN(min)) return '—';
    if (typeof min === 'string') return min;
    const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
    const m = ((min % 1440) + 1440) % 1440 % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function minutesUntil(timeStr) {
    const t = parseTime(timeStr);
    if (t == null) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let diff = t - nowMin;
    if (diff < -12 * 60) diff += 24 * 60;
    return diff;
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function toast(msg, ms = 2400) {
    const el = document.getElementById('toast');
    if (el) {
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function applyTheme() {
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', state.settings.theme === 'light' ? '#f8fafc' : '#0b0f1a');
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        document.documentElement.classList.add('standalone');
      }
    } catch (e) {}
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'dark');
    document.documentElement.setAttribute('data-accent', state.settings.accent || 'violet');
    document.documentElement.style.setProperty('--radius', (state.settings.radius || 14) + 'px');
    document.documentElement.style.setProperty('--app-font-size', (state.settings.fontSize || 16) + 'px');
    document.documentElement.setAttribute('data-density', state.settings.density || 'comfortable');
    document.documentElement.setAttribute('data-shadows', state.settings.shadows === false ? 'off' : 'on');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.settings.theme === 'light' ? '#f1f5f9' : '#0b0f1a';
  }
  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); save();
  }

  const overlay = document.getElementById('modal-overlay');
  function openModal(title, body, footer) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer || '';
    overlay.classList.remove('hidden');
  }
  function closeModal() { document.body.classList.remove('modal-open'); overlay.classList.add('hidden'); }
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('modal-open')) closeModal();
  }); // keydown-modal-esc

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const sec = document.getElementById('tab-' + tab);
    if (sec) sec.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    const fab = document.getElementById('fab');
    fab.classList.toggle('hidden', !['schedule', 'tasks', 'notes', 'buses', 'kanban'].includes(tab));
    if (tab !== 'profile' || profileTab !== 'qr') stopQrScan();
    render();
  }
  document.getElementById('main-nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-agent-quick').addEventListener('click', () => switchTab('agent'));
  document.body.addEventListener('click', e => {
    if (e.target.dataset && e.target.dataset.goto) switchTab(e.target.dataset.goto);
  });

  function render() {
    if (currentTab === 'today') renderToday();
    else if (currentTab === 'schedule') renderSchedule();
    else if (currentTab === 'kanban') renderKanban();
    else if (currentTab === 'pack') renderPack();
    else if (currentTab === 'buses') renderBuses();
    else if (currentTab === 'agent') renderAgent();
    else if (currentTab === 'tasks') renderTasks();
    else if (currentTab === 'diary') renderDiary();
    else if (currentTab === 'notes') renderNotes();
    else if (currentTab === 'profile') renderProfile();
  }


  // ─── TODAY ───
  function renderToday() {
    const day = todayIndex();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    document.getElementById('today-date').textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    document.getElementById('today-weekday').textContent = DAYS_FULL[day];

    const lessons = state.lessons.filter(l => l.day === day).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const clubs = state.clubs.filter(c => c.day === day).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const all = [
      ...lessons.map(l => ({ ...l, _type: 'lesson', _title: l.subject, _place: l.room || '' })),
      ...clubs.map(c => ({ ...c, _type: 'club', _title: c.name, _place: c.place || '' }))
    ].sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    // Buses on dashboard: only before school, after school, or when goingHome
    const bounds = schoolDayBounds(day);
    let showBuses = false;
    let busFilter = 'all'; // morning | home | all
    if (goingHome) {
      showBuses = true;
      busFilter = 'home';
    } else if (!bounds) {
      showBuses = true;
      busFilter = 'all';
    } else if (nowMin < bounds.start - 5) {
      showBuses = true;
      busFilter = 'morning';
    } else if (nowMin >= bounds.end) {
      showBuses = true;
      busFilter = 'home';
    } else {
      showBuses = state.settings.hideBusDuringLessons === false; // during lessons
    }

    const morningBuses = state.buses.filter(b => {
      const t = parseTime(b.time); if (t == null) return false;
      const to = (b.to || b.destination || '').toLowerCase();
      const from = (b.from || '').toLowerCase();
      if (busFilter === 'morning') return t < 12 * 60 && !/дом|домой|home/.test(to);
      if (busFilter === 'home') return /дом|домой|home/.test(to) || (!/школ/.test(to) && /дом|домой|home/.test(from) === false && t >= 12 * 60) || /дом|домой|home/.test(to);
      return true;
    }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    let bestMorningBus = null;
    const firstEvent = all[0] || null;
    if (showBuses && firstEvent && busFilter === 'morning') {
      const firstStart = parseTime(firstEvent.start);
      if (firstStart != null) {
        let best = null;
        for (const b of (morningBuses.length ? morningBuses : [])) {
          const bt = parseTime(b.time); if (bt == null) continue;
          const walk = Number(b.walkMin) || 0;
          const arriveApprox = bt + 5;
          if (arriveApprox <= firstStart - 5) {
            const spare = firstStart - arriveApprox;
            if (!best || spare < best.spare) best = { bus: b, spare, leaveAt: bt - walk };
          }
        }
        bestMorningBus = best;
      }
    }
    // After school / going home — nearest home bus
    let bestHomeBus = null;
    if (showBuses && (busFilter === 'home' || goingHome)) {
      const candidates = state.buses.filter(b => {
        const t = parseTime(b.time); if (t == null) return false;
        const to = (b.to || b.destination || '').toLowerCase();
        return t >= nowMin - 5 && (/дом|домой|home/.test(to) || busFilter === 'home');
      }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      if (candidates.length) {
        const b = candidates[0];
        const bt = parseTime(b.time);
        const walk = Number(b.walkMin) || 0;
        bestHomeBus = { bus: b, leaveAt: bt - walk };
      }
    }

        const hero = document.getElementById('dash-hero');
    let current = null, next = null;
    for (const e of all) {
      const s = parseTime(e.start), en = parseTime(e.end);
      if (s == null) continue;
      if (s <= nowMin && (en == null || en > nowMin)) { current = e; break; }
      if (s > nowMin) { next = e; break; }
    }

    // Hero priority: going home bus > morning bus > current lesson > next > done
    const homeBtn = atHome
      ? `<div style="margin-top:10px"><button type="button" class="btn btn-secondary btn-block" id="btn-cancel-home" style="font-size:0.8rem">Снова в пути / сбросить «дома»</button></div>`
      : (goingHome
        ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary" id="btn-arrived-home" style="flex:1;font-size:0.8rem">🏡 Я дома</button>
            <button type="button" class="btn btn-secondary" id="btn-cancel-home" style="flex:1;font-size:0.8rem">Отмена</button>
          </div>`
        : `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary" id="btn-going-home" style="flex:1;font-size:0.8rem">🏠 Еду домой</button>
            <button type="button" class="btn btn-secondary" id="btn-finished" style="flex:1;font-size:0.8rem">✓ Занятия закончил</button>
          </div>`);

    if (atHome) {
      const last = homeLogs.length ? homeLogs[homeLogs.length - 1] : null;
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Дома</div>
        <div class="hero-title">Ты дома${last ? ' с ' + last.time : ''}</div>
        <div class="hero-sub">Автобусы скрыты до следующего выезда. Завтра снова покажем утренние.</div>${homeBtn}</div>`;
    } else if (goingHome || (showBuses && busFilter === 'home' && !current)) {
      const homeBuses = getRelevantBuses(nowMin, 'home', 3);
      if (homeBuses.length) {
        const lines = homeBuses.map(b => {
          const t = parseTime(b.time);
          const walk = Number(b.walkMin) || 0;
          const leaveIn = t != null ? t - walk - nowMin : null;
          const route = (b.from && b.to) ? `${b.from} → ${b.to}` : (b.to || b.destination || '');
          return `№ ${b.number || '—'} в ${b.time || ''} (${leaveIn != null ? 'выйти через ' + formatDurationMin(leaveIn) : '—'}) · ${route}`;
        });
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">${goingHome ? 'Едем домой · 3 ближайших' : 'После занятий · автобусы'}</div>
          <div class="hero-title">${escapeHtml(lines[0])}</div>
          <div class="hero-sub">${lines.slice(1).map(l => escapeHtml(l)).join('<br>')}</div>${homeBtn}</div>`;
      } else {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">${goingHome ? 'Едем домой' : 'День завершён'}</div><div class="hero-title">Нет ближайших автобусов на 2 часа</div>${homeBtn}</div>`;
      }
    } else if (bestMorningBus && firstEvent && !current) {
      const bus = bestMorningBus.bus;
      const untilLeave = bestMorningBus.leaveAt != null ? bestMorningBus.leaveAt - nowMin : null;
      if (untilLeave != null && untilLeave > 0 && untilLeave <= 90) {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Выходи из дома</div><div class="hero-title">Через ${formatDurationMin(untilLeave)}</div><div class="hero-sub">Автобус № ${escapeHtml(bus.number)} в ${formatTime(bus.time)}</div><div class="hero-sub">До остановки ~${Number(bus.walkMin) || 0} мин · урок в ${formatTime(firstEvent.start)}</div>${homeBtn}</div>`;
      } else if (untilLeave != null && untilLeave <= 0 && nowMin < (parseTime(bus.time) || 0) + 5) {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Срочно</div><div class="hero-title">Выходи на автобус № ${escapeHtml(bus.number)}</div><div class="hero-sub">Отправление ${formatTime(bus.time)}</div>${homeBtn}</div>`;
      } else if (next) {
        const wait = parseTime(next.start) - nowMin;
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Следующее</div><div class="hero-title">${escapeHtml(next._title)}</div><div class="hero-sub">${next.start || ''}</div><div class="hero-time">${wait} мин</div>${homeBtn}</div>`;
      } else {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Сегодня</div><div class="hero-title">${all.length ? 'Занятия' : 'Выходной'}</div>${homeBtn}</div>`;
      }
    } else if (current) {
      const left = parseTime(current.end) != null ? parseTime(current.end) - nowMin : null;
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Сейчас</div><div class="hero-title">${escapeHtml(current._title)}</div><div class="hero-sub">${current.start || ''} – ${current.end || ''} · ${escapeHtml(current._place || '—')}</div>${left != null ? `<div class="hero-time">${formatDurationMin(left)}</div><div class="hero-sub">до конца</div>` : ''}${homeBtn}</div>`;
    } else if (next) {
      const wait = parseTime(next.start) - nowMin;
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Следующее</div><div class="hero-title">${escapeHtml(next._title)}</div><div class="hero-sub">${next.start || ''} · ${escapeHtml(next._place || '')}</div><div class="hero-time">${formatDurationMin(wait)}</div><div class="hero-sub">до начала</div>${homeBtn}</div>`;
    } else if (all.length) {
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">День завершён</div><div class="hero-title">Все занятия прошли</div>${homeBtn}</div>`;
    } else {
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Свободный день</div><div class="hero-title">Нет занятий</div></div>`;
    }

    document.getElementById('btn-going-home')?.addEventListener('click', () => { goingHome = true; atHome = false; renderToday(); toast('Едем домой — 3 ближайших автобуса'); });
    document.getElementById('btn-finished')?.addEventListener('click', () => { goingHome = true; atHome = false; renderToday(); toast('Занятия завершены'); });
    document.getElementById('btn-arrived-home')?.addEventListener('click', () => {
      atHome = true; goingHome = false;
      const now = new Date();
      const time = formatTime(now.getHours() * 60 + now.getMinutes());
      homeLogs.push({ ts: Date.now(), time, date: now.toISOString().slice(0, 10) });
      if (homeLogs.length > 60) homeLogs = homeLogs.slice(-40);
      try { localStorage.setItem('orbit-home-logs', JSON.stringify(homeLogs)); } catch (e) {}
      renderToday(); toast('Записал: дома в ' + time);
    });
    document.getElementById('btn-cancel-home')?.addEventListener('click', () => { goingHome = false; atHome = false; renderToday(); });

    const freeMin = calcFreeMinutes(day);
    const statusEl = document.getElementById('dash-status');
    if (atHome) {
      statusEl.innerHTML = `<div class="card" style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="text-muted" style="font-size:0.75rem">Статус</div><div class="fw-600">Дома</div></div><div><div class="text-muted" style="font-size:0.75rem">Домашка</div><div class="fw-600">${state.homework.filter(h => !h.done).length}</div></div></div>`;
    } else if (goingHome) {
      const hb = getRelevantBuses(nowMin, 'home', 3);
      statusEl.innerHTML = `<div class="card" style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="text-muted" style="font-size:0.75rem">Режим</div><div class="fw-600">Еду домой</div></div><div><div class="text-muted" style="font-size:0.75rem">Рейсов</div><div class="fw-600">${hb.length}</div></div><div><div class="text-muted" style="font-size:0.75rem">Домашка</div><div class="fw-600">${state.homework.filter(h => !h.done).length}</div></div></div>`;
    } else {
      statusEl.innerHTML = `<div class="card" style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="text-muted" style="font-size:0.75rem">Занятий</div><div class="fw-600">${upcomingCount(all, nowMin)}</div></div><div><div class="text-muted" style="font-size:0.75rem">Свободно</div><div class="fw-600">${Math.floor(freeMin / 60)}ч ${freeMin % 60}м</div></div><div><div class="text-muted" style="font-size:0.75rem">Домашка</div><div class="fw-600">${state.homework.filter(h => !h.done).length}</div></div></div>`;
    }

    renderDayTimeline(day, all, nowMin);
    const chartsWrap = document.getElementById('week-charts') || document.querySelector('.week-charts');
    const gridWrap = document.getElementById('week-grid') || document.querySelector('.week-grid');
    if (goingHome) {
      if (chartsWrap) chartsWrap.style.display = 'none';
      if (gridWrap) gridWrap.style.display = 'none';
    } else {
      if (chartsWrap) chartsWrap.style.display = '';
      if (gridWrap) gridWrap.style.display = '';
      renderWeekCharts();
      renderWeekGrid();
    }

    const list = document.getElementById('today-lessons');
    // Прошедшие всегда скрыты; в режиме «домой» — весь список занятий скрыт
    const upcoming = all.filter(e => {
      const endT = parseTime(e.end);
      const startT = parseTime(e.start);
      if (endT != null) return endT >= nowMin - 1;
      if (startT != null) return startT + getLessonDuration() >= nowMin - 1;
      return true;
    });
    if (atHome) {
      list.innerHTML = `<div class="empty"><p>🏡 Ты дома. Хорошего вечера!</p></div>`;
    } else if (goingHome) {
      list.innerHTML = `<div class="empty"><p>🏠 Еду домой — занятия скрыты.<br>Три ближайших автобуса — на карточке выше.</p></div>`;
    } else if (!all.length) {
      list.innerHTML = `<div class="empty"><p>Нет уроков и кружков на сегодня</p></div>`;
    } else if (!upcoming.length) {
      list.innerHTML = `<div class="empty"><p>Все занятия на сегодня уже прошли</p></div>`;
    } else {
      let html = '';
      const loopList = upcoming;
      for (let i = 0; i < loopList.length; i++) {
        const e = loopList[i];
        const badge = e._type === 'club' ? '<span class="card-badge badge-club">Кружок</span>' : '<span class="card-badge">Урок</span>';
        html += `<div class="card"><div class="card-row"><div class="card-time">${escapeHtml(e.start || '—')}<br><span style="font-weight:400;color:var(--text-dim)">${escapeHtml(e.end || '')}</span></div><div class="card-body"><div class="card-title">${escapeHtml(e._title)} ${badge}</div><div class="card-meta">${escapeHtml(e._place || '')}${e.teacher ? ' · ' + escapeHtml(e.teacher) : ''}</div></div></div></div>`;
        if (i < loopList.length - 1) {
          const end = parseTime(e.end), nextS = parseTime(loopList[i + 1].start);
          if (end != null && nextS != null && nextS - end >= 5) {
            html += `<div class="card" style="padding:8px 16px;opacity:0.7"><span class="card-badge badge-break">Перемена ${nextS - end} мин</span></div>`;
          }
        }
      }
      list.innerHTML = html;
    }

    const pending = state.homework.filter(h => !h.done);
    document.getElementById('today-hw').innerHTML = pending.length
      ? pending.slice(0, 5).map(h => `<div class="hw-item priority-${h.priority || 'medium'}"><div class="fw-600">${escapeHtml(h.subject || '')}</div><div class="text-muted" style="font-size:0.85rem">${escapeHtml(h.title || '')}</div>${h.due ? `<div class="text-muted" style="font-size:0.75rem;margin-top:4px">до ${escapeHtml(h.due)}</div>` : ''}</div>`).join('')
      : `<div class="empty" style="padding:20px"><p>Нет незакрытой домашки</p></div>`;
  }

  function calcFreeMinutes(day) {
    const events = [
      ...state.lessons.filter(l => l.day === day),
      ...state.clubs.filter(c => c.day === day)
    ].map(e => ({ s: parseTime(e.start), e: parseTime(e.end) }))
     .filter(x => x.s != null && x.e != null).sort((a, b) => a.s - b.s);
    const dayStart = 8 * 60, dayEnd = 18 * 60;
    let free = 0, cursor = dayStart;
    for (const ev of events) {
      if (ev.s > cursor) free += ev.s - cursor;
      cursor = Math.max(cursor, ev.e);
    }
    if (cursor < dayEnd) free += dayEnd - cursor;
    return Math.max(0, free);
  }

  function renderDayTimeline(day, all, nowMin) {
    const el = document.getElementById('day-timeline');
    if (!el) return;
    const items = [];

    if (atHome) {
      el.innerHTML = '<div class="text-muted" style="padding:12px">🏡 Ты дома — автобусы на сегодня скрыты. «Сбросить дома» на карточке выше.</div>';
      return;
    }

    // Режим «еду домой»: только ближайшие автобусы домой
    if (goingHome) {
      const buses = getRelevantBuses(nowMin, 'home', 4);
      if (!buses.length) {
        el.innerHTML = '<div class="text-muted" style="padding:12px">Нет ближайших автобусов на 2 часа. Добавь рейсы во вкладке «Автобус».</div>';
        return;
      }
      buses.forEach(b => {
        const t = parseTime(b.time);
        const walk = Number(b.walkMin) || 0;
        const leaveIn = t != null ? t - walk - nowMin : null;
        const route = (b.from && b.to) ? (b.from + ' → ' + b.to) : (b.to || b.destination || b.from || '');
        items.push({
          time: b.time, min: t, type: 'bus',
          title: 'Автобус ' + (b.number || ''),
          meta: route + (leaveIn != null ? ' · выйти через ' + formatDurationMin(leaveIn) : '')
        });
      });
      el.innerHTML = items.map(it =>
        `<div class="tl-item tl-bus tl-now"><div class="tl-time">${escapeHtml(it.time)}</div><div class="tl-title">${escapeHtml(it.title)}</div><div class="tl-meta">${escapeHtml(it.meta)}</div></div>`
      ).join('');
      return;
    }

    // Обычный режим: только будущие и текущие занятия (прошедшие скрыты)
    all.forEach(e => {
      const t = parseTime(e.start);
      if (t == null) return;
      const endT = parseTime(e.end);
      // скрыть если уже закончилось
      if (endT != null && endT < nowMin - 1) return;
      if (endT == null && t < nowMin - getLessonDuration()) return;
      items.push({
        time: e.start, min: t, type: e._type,
        title: e._title,
        meta: (e.start || '') + (e.end ? ' – ' + e.end : '') + (e._place ? ' · ' + e._place : '')
      });
    });

    let mode = 'all';
    const bounds = schoolDayBounds(day);
    if (bounds && nowMin < bounds.start - 5) mode = 'morning';
    else if (bounds && nowMin >= bounds.end) mode = 'home';
    else if (bounds && nowMin >= bounds.start && nowMin < bounds.end) mode = 'during';

    // Автобусы: только актуальные; во время уроков — по настройке
    if (mode !== 'during' || state.settings.hideBusDuringLessons === false) {
      const buses = getRelevantBuses(nowMin, mode === 'during' ? 'all' : mode, mode === 'during' ? 2 : 4);
      buses.forEach(b => {
        const t = parseTime(b.time);
        if (t == null || t < nowMin - 1) return;
        items.push({
          time: b.time, min: t, type: 'bus',
          title: 'Автобус ' + (b.number || ''),
          meta: (b.from && b.to) ? (b.from + ' → ' + b.to) : (b.to || b.destination || b.from || '')
        });
      });
    }

    items.sort((a, b) => a.min - b.min);
    if (!items.length) {
      el.innerHTML = '<div class="text-muted" style="padding:12px">Нет предстоящих событий</div>';
      return;
    }
    el.innerHTML = items.map(it => {
      const isNow = it.min <= nowMin && it.min > nowMin - 40;
      return `<div class="tl-item tl-${it.type || 'lesson'}${isNow ? ' tl-now' : ''}"><div class="tl-time">${escapeHtml(it.time)}</div><div class="tl-title">${escapeHtml(it.title)}</div><div class="tl-meta">${escapeHtml(it.meta)}</div></div>`;
    }).join('');
  }

  function renderWeekCharts() {
    const el = document.getElementById('week-charts');
    const loads = []; let totalMin = 0;
    for (let d = 0; d < 7; d++) {
      let min = 0;
      [...state.lessons.filter(l => l.day === d), ...state.clubs.filter(c => c.day === d)].forEach(x => {
        const s = parseTime(x.start), e = parseTime(x.end);
        if (s != null && e != null) min += e - s;
      });
      loads.push(min); totalMin += min;
    }
    const max = Math.max(...loads, 1);
    el.innerHTML = `<div class="chart-card"><div class="chart-title">Часы занятий по дням</div><div class="chart-bars">${loads.map((m, i) => {
      const h = Math.max(4, Math.round((m / max) * 90));
      return `<div class="chart-bar-col"><div class="chart-bar" style="height:${h}px;margin-top:auto"></div><div class="chart-bar-label">${DAYS[i]}</div></div>`;
    }).join('')}</div><div class="chart-stat"><span>Всего за неделю</span><strong>${(totalMin / 60).toFixed(1)} ч</strong></div></div>`;
  }

  function renderWeekGrid() {
    const el = document.getElementById('week-grid');
    const today = todayIndex();
    let html = '';
    for (let d = 0; d < 7; d++) {
      const les = state.lessons.filter(l => l.day === d).length;
      const cl = state.clubs.filter(c => c.day === d).length;
      const slots = [];
      for (let i = 0; i < Math.max(les + cl, 1); i++) {
        if (i < les) slots.push('lesson');
        else if (i < les + cl) slots.push('club');
        else slots.push('free');
      }
      html += `<div class="wg-day"><div class="wg-label${d === today ? ' today' : ''}">${DAYS[d]}</div><div class="wg-slots">${slots.map(s => `<div class="wg-slot ${s}"></div>`).join('')}</div></div>`;
    }
    el.innerHTML = html;
  }



  // ─── Schedule timing helpers ───

  function isAbortPendingCommand(lower) {
    const t = (lower || '').trim();
    if (/^(отмена|cancel|стоп|нет|хватит)([!.\s]*)$/i.test(t)) return true;
    if (/^(очисти|удали|убери|перенес|перемест|покажи|помощь|help|что взять|свободн|нагрузк|статистик|я домой|я поехал|закончил|я закончил)(\s|$)/i.test(t)) return true;
    if (/^(очисти\s*расписан|удали\s*все|полный\s*сброс|удали\s*урок)/i.test(t)) return true;
    return false;
  }

  function findLessonConflicts(lesson, excludeId) {
    const s = parseTime(lesson.start), e = parseTime(lesson.end);
    if (s == null) return [];
    const end = e != null ? e : s + getLessonDuration();
    return state.lessons.filter(l => {
      if (excludeId && l.id === excludeId) return false;
      if (l.day !== lesson.day) return false;
      const ls = parseTime(l.start), le = parseTime(l.end);
      if (ls == null) return false;
      const lend = le != null ? le : ls + getLessonDuration();
      return s < lend && end > ls; // overlap
    });
  }

  function addLessonSafe(lesson) {
    const conflicts = findLessonConflicts(lesson, lesson.id);
    if (conflicts.length && state.settings.blockOverlap === false) {
      // allowed: still warn but add
      state.lessons.push(lesson);
      save();
      return { ok: true, conflicts, message: 'Добавлено с пересечением (в настройках разрешено).' };
    }
    if (conflicts.length) {
      return {
        ok: false,
        conflicts,
        message: `⚠️ В это время уже есть: ${conflicts.map(c => `«${c.subject}» ${c.start}–${c.end || '?'}`).join(', ')}.\nЧто сделать?\n• «заменить» — удалить старый и поставить новый\n• «другое время» — отменить и выбрать другое\n• «отмена»`
      };
    }
    // same subject same day same start = duplicate
    const dup = state.lessons.find(l => l.id !== lesson.id && l.day === lesson.day && l.start === lesson.start && (l.subject || '') === (lesson.subject || ''));
    if (dup) {
      return { ok: false, conflicts: [dup], message: 'Такой урок уже есть в это время. «отмена» или другое время.' };
    }
    const idx = state.lessons.findIndex(l => l.id === lesson.id);
    if (idx >= 0) state.lessons[idx] = lesson;
    else state.lessons.push(lesson);
    save();
    return { ok: true };
  }

  function isDuplicateBus(bus, excludeId) {
    if (state.settings.blockDupBus === false) return false;
    return state.buses.some(b => {
      if (excludeId && b.id === excludeId) return false;
      return (b.time || '') === (bus.time || '')
        && (b.number || '') === (bus.number || '')
        && (b.from || '') === (bus.from || '')
        && (b.to || bus.destination || '') === (bus.to || bus.destination || '');
    });
  }

  function schoolDayBounds(day) {
    const lessons = state.lessons.filter(l => l.day === day);
    if (!lessons.length) return null;
    let minS = 24 * 60, maxE = 0;
    lessons.forEach(l => {
      const s = parseTime(l.start), e = parseTime(l.end);
      if (s != null) minS = Math.min(minS, s);
      if (e != null) maxE = Math.max(maxE, e);
      else if (s != null) maxE = Math.max(maxE, s + getLessonDuration());
    });
    if (minS >= 24 * 60) return null;
    return { start: minS, end: maxE };
  }

  function getLessonDuration() { return Number(state.settings.lessonDuration) || 40; }
  function getBreakDuration(lessonIndex) {
    // lessonIndex = number of completed lessons before this break (1 after first lesson)
    const after = Number(state.settings.longBreakAfter) || 3;
    const custom = state.settings.breakAfter; // e.g. map lesson# -> minutes optional
    if (Array.isArray(state.settings.breakSchedule) && state.settings.breakSchedule[lessonIndex - 1] != null) {
      return Number(state.settings.breakSchedule[lessonIndex - 1]) || 10;
    }
    if (lessonIndex > 0 && lessonIndex === after) return Number(state.settings.longBreakDuration) || 20;
    // every other break can be 15 if configured mid
    if (lessonIndex === 2 && state.settings.break15) return Number(state.settings.break15) || 15;
    return Number(state.settings.breakDuration) || 10;
  }
  function addMinutesToTime(timeStr, mins) {
    const t = parseTime(timeStr);
    if (t == null) return timeStr || '';
    return formatTime(t + mins);
  }
  function calcEndFromStart(start) {
    return addMinutesToTime(start, getLessonDuration());
  }
  function suggestNextStart(day) {
    const items = [
      ...state.lessons.filter(l => l.day === day),
      ...state.clubs.filter(c => c.day === day),
      ...(state.events || []).filter(e => e.day === day)
    ].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (!items.length) return state.settings.dayStart || '08:30';
    const last = items[items.length - 1];
    const end = parseTime(last.end) ?? (parseTime(last.start) != null ? parseTime(last.start) + getLessonDuration() : null);
    if (end == null) return state.settings.dayStart || '08:30';
    const breakMin = getBreakDuration(items.length);
    return formatTime(end + breakMin);
  }

  // ─── SCHEDULE ───
  function renderSchedule() {
    const switcher = document.getElementById('day-switcher');
    switcher.innerHTML = DAYS.map((d, i) =>
      `<button class="day-chip${i === currentScheduleDay ? ' active' : ''}${i === todayIndex() ? ' today' : ''}" data-day="${i}">${d}</button>`
    ).join('');
    switcher.querySelectorAll('.day-chip').forEach(b => {
      b.onclick = () => { currentScheduleDay = +b.dataset.day; renderSchedule(); };
    });
    document.querySelectorAll('#tab-schedule .type-btn[data-type]').forEach(b => {
      b.classList.toggle('active', b.dataset.type === scheduleType);
      b.onclick = () => { scheduleType = b.dataset.type; renderSchedule(); };
    });
    const list = document.getElementById('schedule-list');
    const items = (scheduleType === 'lessons' ? state.lessons : state.clubs)
      .filter(x => x.day === currentScheduleDay)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (!items.length) { list.innerHTML = `<div class="empty"><p>Пусто. Нажми + чтобы добавить</p></div>`; return; }
    list.innerHTML = items.map(item => {
      if (scheduleType === 'lessons') {
        return `<div class="card" data-id="${item.id}" style="cursor:pointer"><div class="card-row"><div class="card-time">${escapeHtml(item.start || '—')}<br><span style="font-weight:400;color:var(--text-dim)">${escapeHtml(item.end || '')}</span></div><div class="card-body"><div class="card-title">${escapeHtml(item.subject)}</div><div class="card-meta">${escapeHtml(item.room || '')}${item.teacher ? ' · ' + escapeHtml(item.teacher) : ''}</div></div></div></div>`;
      }
      return `<div class="card" data-id="${item.id}" style="cursor:pointer"><div class="card-row"><div class="card-time">${escapeHtml(item.start || '—')}<br><span style="font-weight:400;color:var(--text-dim)">${escapeHtml(item.end || '')}</span></div><div class="card-body"><div class="card-title">${escapeHtml(item.name)} <span class="card-badge badge-club">Кружок</span></div><div class="card-meta">${escapeHtml(item.place || '')}${item.teacher ? ' · ' + escapeHtml(item.teacher) : ''}</div></div></div></div>`;
    }).join('');
    list.querySelectorAll('.card[data-id]').forEach(c => {
      c.onclick = () => scheduleType === 'lessons' ? openLessonModal(c.dataset.id) : openClubModal(c.dataset.id);
    });
  }

  function openLessonModal(id) {
    const item = id ? state.lessons.find(l => l.id === id) : null;
    const isNew = !item;
    const dayForSuggest = item ? item.day : currentScheduleDay;
    const startDef = item?.start || suggestNextStart(dayForSuggest);
    const endDef = item?.end || calcEndFromStart(startDef);
    const chips = SUBJECTS.map(s => {
      const active = item && (item.subject || '') === s ? ' active' : '';
      return `<button type="button" class="subject-chip${active}" data-subj="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
    }).join('');
    openModal(isNew ? 'Новый урок' : 'Урок', `
      <div class="form-group"><label>Предмет (выбери или введи)</label>
        <div class="subject-chips" id="subj-chips">${chips}</div>
        <input class="input" id="f-subject" list="subj-datalist" value="${escapeAttr(item?.subject || '')}" placeholder="Название предмета">
        <datalist id="subj-datalist">${SUBJECTS.map(s => `<option value="${escapeAttr(s)}">`).join('')}</datalist>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Начало</label><input class="input" id="f-start" type="time" value="${escapeAttr(startDef)}"></div>
        <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="time" value="${escapeAttr(endDef)}"></div>
      </div>
      <div class="form-group"><label>День</label>
        <select class="input" id="f-day">${DAYS_FULL.map((d, i) => `<option value="${i}"${dayForSuggest === i ? ' selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Кабинет</label><input class="input" id="f-room" value="${escapeAttr(item?.room || '')}"></div>
        <div class="form-group"><label>Учитель</label><input class="input" id="f-teacher" value="${escapeAttr(item?.teacher || '')}"></div>
      </div>
      <div class="form-group"><label>Что взять (через запятую)</label><input class="input" id="f-items" value="${escapeAttr((item?.items || []).join(', '))}"></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);

    document.getElementById('subj-chips')?.addEventListener('click', e => {
      const chip = e.target.closest('.subject-chip');
      if (!chip) return;
      document.getElementById('f-subject').value = chip.dataset.subj;
      document.querySelectorAll('#subj-chips .subject-chip').forEach(c => c.classList.toggle('active', c === chip));
    });
    const _ls = document.getElementById('f-start'), _le = document.getElementById('f-end');
    if (_ls && _le) _ls.addEventListener('change', () => { _le.value = calcEndFromStart(_ls.value); });

    document.getElementById('modal-save').onclick = () => {
      const data = {
        id: item?.id || uid(),
        day: +document.getElementById('f-day').value,
        subject: document.getElementById('f-subject').value.trim(),
        start: document.getElementById('f-start').value,
        end: document.getElementById('f-end').value,
        room: document.getElementById('f-room').value.trim(),
        teacher: document.getElementById('f-teacher').value.trim(),
        items: document.getElementById('f-items').value.split(',').map(s => s.trim()).filter(Boolean)
      };
      if (!data.subject) return toast('Укажи предмет');
      const conflicts = findLessonConflicts(data, data.id);
      if (conflicts.length) {
        if (!confirm('Пересечение с: ' + conflicts.map(c => c.subject + ' ' + c.start).join(', ') + '. Заменить старые?')) return;
        conflicts.forEach(c => { state.lessons = state.lessons.filter(l => l.id !== c.id); });
      }
      const res = addLessonSafe(data);
      if (!res.ok) return toast(res.message.split('\n')[0]);
      closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
      state.lessons = state.lessons.filter(l => l.id !== id); save(); closeModal(); render(); toast('Удалено');
    };
  }

  function openClubModal(id) {
    const item = id ? state.clubs.find(c => c.id === id) : null;
    const isNew = !item;
    openModal(isNew ? 'Новый кружок' : 'Кружок', `
      <div class="form-group"><label>Название</label><input class="input" id="f-name" value="${escapeAttr(item?.name || '')}"></div>
      <div class="form-row"><div class="form-group"><label>Начало</label><input class="input" id="f-start" type="time" value="${escapeAttr(item?.start || '15:00')}"></div>
      <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="time" value="${escapeAttr(item?.end || '16:30')}"></div></div>
      <div class="form-group"><label>День</label><select class="input" id="f-day">${DAYS_FULL.map((d, i) => `<option value="${i}"${(item ? item.day : currentScheduleDay) === i ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="form-row"><div class="form-group"><label>Место</label><input class="input" id="f-place" value="${escapeAttr(item?.place || '')}"></div>
      <div class="form-group"><label>Преподаватель</label><input class="input" id="f-teacher" value="${escapeAttr(item?.teacher || '')}"></div></div>
      <div class="form-group"><label>Что взять</label><input class="input" id="f-items" value="${escapeAttr((item?.items || []).join(', '))}"></div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="f-notes">${escapeHtml(item?.notes || '')}</textarea></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);
    document.getElementById('modal-save').onclick = () => {
      const data = { id: item?.id || uid(), day: +document.getElementById('f-day').value, name: document.getElementById('f-name').value.trim(), start: document.getElementById('f-start').value, end: document.getElementById('f-end').value, place: document.getElementById('f-place').value.trim(), teacher: document.getElementById('f-teacher').value.trim(), items: document.getElementById('f-items').value.split(',').map(s => s.trim()).filter(Boolean), notes: document.getElementById('f-notes').value.trim() };
      if (!data.name) return toast('Укажи название');
      if (isNew) state.clubs.push(data); else { const idx = state.clubs.findIndex(c => c.id === id); if (idx >= 0) state.clubs[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => { state.clubs = state.clubs.filter(c => c.id !== id); save(); closeModal(); render(); toast('Удалено'); };
  }


  // ─── KANBAN ───
  // ─── KANBAN (touch drag) ───
  let _drag = null; // { kind, id, el, ghost, startX, startY, fromDay }

  function renderKanban() {
    document.querySelectorAll('#tab-kanban .type-btn[data-kview]').forEach(b => {
      b.classList.toggle('active', b.dataset.kview === kanbanView);
      b.onclick = () => { kanbanView = b.dataset.kview; renderKanban(); };
    });
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const today = todayIndex();
    const days = kanbanView === 'day' ? [today] : [0,1,2,3,4,5,6];

    board.innerHTML = days.map(d => {
      const lessons = state.lessons.filter(l => l.day === d).map(l => ({ ...l, _kind: 'lesson', _title: l.subject }));
      const clubs = state.clubs.filter(c => c.day === d).map(c => ({ ...c, _kind: 'club', _title: c.name }));
      const events = (state.events || []).filter(e => e.day === d).map(e => ({ ...e, _kind: 'event', _title: e.title || e.name || 'Событие' }));
      const cards = [...lessons, ...clubs, ...events].sort((a, b) => (a.start || '').localeCompare(b.start || ''));

      const cardsHtml = cards.map(c => {
        const kindClass = c._kind === 'club' ? 'club-card' : (c._kind === 'event' ? 'event-card' : 'lesson-card');
        return `<div class="kanban-card ${kindClass}" data-kind="${c._kind}" data-id="${c.id}" data-day="${d}">
          <div class="kc-time">${escapeHtml(c.start || '—')}${c.end ? '–' + escapeHtml(c.end) : ''}</div>
          <div class="kc-title">${escapeHtml(c._title)}</div>
          <div class="kc-meta">${escapeHtml(c.room || c.place || '')}</div>
          <div class="kc-actions">
            <button type="button" data-act="left" title="На день назад">←</button>
            <button type="button" data-act="edit" title="Изменить">✎</button>
            <button type="button" data-act="right" title="На день вперёд">→</button>
          </div>
        </div>`;
      }).join('');

      return `<div class="kanban-col${d === today ? ' today-col' : ''}" data-day="${d}">
        <div class="kanban-col-head"><span>${DAYS[d]}${d === today ? ' · сегодня' : ''}</span><span class="k-count">${cards.length}</span></div>
        ${cardsHtml}
        <div class="kanban-add" data-day="${d}">+ добавить</div>
      </div>`;
    }).join('');

    board.querySelectorAll('.kanban-card').forEach(card => {
      const kind = card.dataset.kind;
      const id = card.dataset.id;
      card.querySelector('[data-act="edit"]')?.addEventListener('click', e => {
        e.stopPropagation();
        if (kind === 'lesson') openLessonModal(id);
        else if (kind === 'club') openClubModal(id);
        else openEventModal(id);
      });
      card.querySelector('[data-act="left"]')?.addEventListener('click', e => {
        e.stopPropagation(); moveItemDay(kind, id, -1);
      });
      card.querySelector('[data-act="right"]')?.addEventListener('click', e => {
        e.stopPropagation(); moveItemDay(kind, id, +1);
      });
      // Pointer drag for finger / mouse
      card.addEventListener('pointerdown', onKanbanPointerDown);
    });

    board.querySelectorAll('.kanban-add').forEach(btn => {
      btn.onclick = () => openKanbanAddMenu(+btn.dataset.day);
    });
  }

  function onKanbanPointerDown(e) {
    if (e.target.closest('[data-act]')) return;
    if (e.button != null && e.button !== 0) return;
    const card = e.currentTarget;
    const kind = card.dataset.kind;
    const id = card.dataset.id;
    const fromDay = +card.dataset.day;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    document.body.appendChild(ghost);
    card.classList.add('dragging');
    card.setPointerCapture?.(e.pointerId);
    _drag = {
      kind, id, el: card, ghost, fromDay,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
      pointerId: e.pointerId
    };
    const onMove = (ev) => {
      if (!_drag) return;
      _drag.moved = true;
      _drag.ghost.style.left = (ev.clientX - _drag.offsetX) + 'px';
      _drag.ghost.style.top = (ev.clientY - _drag.offsetY) + 'px';
      // highlight column under finger
      document.querySelectorAll('.kanban-col').forEach(col => col.classList.remove('drag-over'));
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = under && under.closest ? under.closest('.kanban-col') : null;
      if (col) col.classList.add('drag-over');
    };
    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      if (!_drag) return;
      const { kind, id, el, ghost, fromDay, moved } = _drag;
      ghost.remove();
      el.classList.remove('dragging');
      document.querySelectorAll('.kanban-col').forEach(col => col.classList.remove('drag-over'));
      if (moved) {
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const col = under && under.closest ? under.closest('.kanban-col') : null;
        if (col && col.dataset.day != null) {
          const toDay = +col.dataset.day;
          if (toDay !== fromDay) {
            setItemDay(kind, id, toDay);
            toast(`→ ${DAYS_FULL[toDay]}`);
          }
        }
        renderKanban();
      } else {
        // tap = edit
        if (kind === 'lesson') openLessonModal(id);
        else if (kind === 'club') openClubModal(id);
        else openEventModal(id);
      }
      _drag = null;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    e.preventDefault();
  }

  function setItemDay(kind, id, day) {
    const arr = kind === 'lesson' ? state.lessons : kind === 'club' ? state.clubs : (state.events || []);
    const item = arr.find(x => x.id === id);
    if (!item) return;
    item.day = day;
    save();
  }

  function moveItemDay(kind, id, delta) {
    const arr = kind === 'lesson' ? state.lessons : kind === 'club' ? state.clubs : (state.events || []);
    const item = arr.find(x => x.id === id);
    if (!item) return;
    item.day = ((item.day + delta) % 7 + 7) % 7;
    save();
    renderKanban();
    toast(`Перенесено на ${DAYS_FULL[item.day]}`);
  }

  function openKanbanAddMenu(day) {
    openModal('Добавить на ' + DAYS_FULL[day], `
      <p class="hint mb-8">Что добавить?</p>
      <button class="btn btn-primary btn-block mb-8" id="ka-lesson">Урок</button>
      <button class="btn btn-secondary btn-block mb-8" id="ka-club">Кружок</button>
      <button class="btn btn-secondary btn-block" id="ka-event">Событие / замена</button>
    `, `<button class="btn btn-secondary" id="modal-cancel">Отмена</button>`);
    document.getElementById('modal-cancel').onclick = closeModal;
    currentScheduleDay = day;
    document.getElementById('ka-lesson').onclick = () => { closeModal(); openLessonModal(null); };
    document.getElementById('ka-club').onclick = () => { closeModal(); openClubModal(null); };
    document.getElementById('ka-event').onclick = () => { closeModal(); openEventModal(null, day); };
  }

  function openEventModal(id, forceDay) {
    const item = id ? (state.events || []).find(e => e.id === id) : null;
    const isNew = !item;
    const dayVal = item ? item.day : (forceDay != null ? forceDay : currentScheduleDay);
    openModal(isNew ? 'Новое событие' : 'Событие', `
      <div class="form-group"><label>Название</label><input class="input" id="f-title" value="${escapeAttr(item?.title || item?.name || '')}" placeholder="Замена, собрание…"></div>
      <div class="form-row">
        <div class="form-group"><label>Начало</label><input class="input" id="f-start" type="time" value="${escapeAttr(item?.start || suggestNextStart(dayVal))}"></div>
        <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="time" value="${escapeAttr(item?.end || calcEndFromStart(item?.start || suggestNextStart(dayVal)))}"></div>
      </div>
      <div class="form-group"><label>День</label>
        <select class="input" id="f-day">${DAYS_FULL.map((d, i) => `<option value="${i}"${dayVal === i ? ' selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Место</label><input class="input" id="f-place" value="${escapeAttr(item?.place || '')}"></div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="f-notes">${escapeHtml(item?.notes || '')}</textarea></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);

    const startEl = document.getElementById('f-start');
    const endEl = document.getElementById('f-end');
    startEl.addEventListener('change', () => {
      if (!item || !item.end) endEl.value = calcEndFromStart(startEl.value);
    });

    document.getElementById('modal-save').onclick = () => {
      if (!state.events) state.events = [];
      const data = {
        id: item?.id || uid(),
        day: +document.getElementById('f-day').value,
        title: document.getElementById('f-title').value.trim(),
        start: document.getElementById('f-start').value,
        end: document.getElementById('f-end').value,
        place: document.getElementById('f-place').value.trim(),
        notes: document.getElementById('f-notes').value.trim()
      };
      if (!data.title) return toast('Укажи название');
      if (isNew) state.events.push(data);
      else {
        const idx = state.events.findIndex(e => e.id === id);
        if (idx >= 0) state.events[idx] = data;
      }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
      state.events = (state.events || []).filter(e => e.id !== id);
      save(); closeModal(); render(); toast('Удалено');
    };
  }

  // ─── PACK ───
  function renderPack() {
    const switcher = document.getElementById('pack-day-switcher');
    switcher.innerHTML = DAYS.map((d, i) => `<button class="day-chip${i === packDay ? ' active' : ''}${i === todayIndex() ? ' today' : ''}" data-day="${i}">${d}</button>`).join('');
    switcher.querySelectorAll('.day-chip').forEach(b => { b.onclick = () => { packDay = +b.dataset.day; renderPack(); }; });
    document.getElementById('pack-day-label').textContent = 'На ' + DAYS_FULL[packDay].toLowerCase();
    const itemsMap = new Map();
    state.lessons.filter(l => l.day === packDay).forEach(l => {
      (l.items || []).forEach(it => { const key = it.toLowerCase(); if (!itemsMap.has(key)) itemsMap.set(key, { label: it, sources: [] }); itemsMap.get(key).sources.push(l.subject); });
    });
    state.clubs.filter(c => c.day === packDay).forEach(c => {
      (c.items || []).forEach(it => { const key = it.toLowerCase(); if (!itemsMap.has(key)) itemsMap.set(key, { label: it, sources: [] }); itemsMap.get(key).sources.push(c.name); });
    });
    const list = document.getElementById('pack-list');
    if (!itemsMap.size) { list.innerHTML = `<div class="empty"><p>Нет вещей — укажи «что взять» в уроках</p></div>`; return; }
    list.innerHTML = [...itemsMap.entries()].map(([key, val]) => {
      const checked = !!state.packChecks[packDay + ':' + key];
      return `<div class="pack-item${checked ? ' checked' : ''}" data-key="${escapeHtml(key)}"><div class="pack-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div><div><div class="pack-label">${escapeHtml(val.label)}</div><div class="pack-source">${escapeHtml(val.sources.join(', '))}</div></div></div>`;
    }).join('');
    list.querySelectorAll('.pack-item').forEach(el => {
      el.onclick = () => { const k = packDay + ':' + el.dataset.key; state.packChecks[k] = !state.packChecks[k]; save(); el.classList.toggle('checked'); };
    });
  }
  document.getElementById('pack-reset')?.addEventListener('click', () => {
    Object.keys(state.packChecks).forEach(k => { if (k.startsWith(packDay + ':')) delete state.packChecks[k]; });
    save(); renderPack(); toast('Сброшено');
  });

  // ─── BUSES ───
  let busFilterNumber = '';
  let busFilterDir = 'all'; // all | school | home
  let busShowPast = false;


  function renderBuses() {
    const list = document.getElementById('buses-list');
    if (!list) return;
    if (!state.buses.length) {
      list.innerHTML = `<div class="empty">
        <p>Маршрутов пока нет — добавь свои.</p>
        <p class="hint" style="margin-top:8px">Укажи откуда → куда, время и сколько идти до остановки.</p>
      </div>`;
      return;
    }
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const numbers = [...new Set(state.buses.map(b => b.number || '').filter(Boolean))].sort();

    // filters UI
    let html = `<div class="bus-filters">
      <select class="input" id="bus-dir" style="flex:1">
        <option value="all"${busFilterDir==='all'?' selected':''}>Все направления</option>
        <option value="school"${busFilterDir==='school'?' selected':''}>В школу</option>
        <option value="home"${busFilterDir==='home'?' selected':''}>Домой / из школы</option>
      </select>
      <select class="input" id="bus-num" style="flex:1">
        <option value="">Все номера</option>
        ${numbers.map(n => `<option value="${escapeAttr(n)}"${busFilterNumber===n?' selected':''}>№ ${escapeHtml(n)}</option>`).join('')}
      </select>
    </div>`;

    const seen = new Set();
    const unique = [...state.buses].sort((a,b)=>(a.time||'').localeCompare(b.time||'')).filter(b => {
      const key = [b.number, b.time, b.from||'', b.to||b.destination||''].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const filtered = unique.filter(b => {
      if (busFilterNumber && (b.number || '') !== busFilterNumber) return false;
      if (busFilterDir !== 'all' && busDirection(b) !== busFilterDir && busDirection(b) !== 'other') return false;
      if (busFilterDir === 'school' && busDirection(b) === 'home') return false;
      if (busFilterDir === 'home' && busDirection(b) === 'school') return false;
      return true;
    });

    const upcoming = filtered.filter(b => {
      const t = parseTime(b.time);
      return t != null && t >= nowMin - 2;
    });
    const past = filtered.filter(b => {
      const t = parseTime(b.time);
      return t != null && t < nowMin - 2;
    });

    const card = (b, isPast) => {
      const until = minutesUntil(b.time);
      const walk = Number(b.walkMin) || 0;
      const leaveIn = until !== null ? until - walk : null;
      let countdown = '';
      if (isPast) countdown = `<span class="bus-countdown past">ушёл</span>`;
      else if (until !== null) {
        if (leaveIn !== null && leaveIn <= 0 && until >= 0) countdown = `<span class="bus-countdown urgent">выходи сейчас</span>`;
        else if (leaveIn !== null && leaveIn > 0) countdown = `<span class="bus-countdown ${leaveIn <= 10 ? 'urgent' : ''}">выйти через ${formatDurationMin(leaveIn)}</span>`;
        else if (until >= 0) countdown = `<span class="bus-countdown">через ${formatDurationMin(until)}</span>`;
      }
      const from = b.from || '';
      const to = b.to || b.destination || '';
      const route = from && to ? `${escapeHtml(from)} → ${escapeHtml(to)}` : escapeHtml(to || from || '');
      const dir = busDirection(b);
      const dirLabel = dir === 'school' ? ' → школа' : dir === 'home' ? ' → домой' : '';
      return `<div class="card${isPast ? ' bus-past' : ''}" data-id="${b.id}" style="cursor:pointer">
        <div class="card-row">
          <div class="card-time">${escapeHtml(b.time || '—')}</div>
          <div class="card-body">
            <div class="card-title">№ ${escapeHtml(b.number || '—')} ${countdown}</div>
            <div class="card-meta">${route}${dirLabel}${walk ? ' · пешком ' + walk + ' мин' : ''}</div>
            ${b.notes ? `<div class="card-meta">${escapeHtml(b.notes)}</div>` : ''}
          </div>
        </div>
      </div>`;
    };

    html += `<p class="hint mb-8">Актуальные до конца дня (${upcoming.length})</p>`;
    html += upcoming.length ? upcoming.map(b => card(b, false)).join('') : `<div class="empty"><p>Нет актуальных рейсов по фильтру</p></div>`;

    if (past.length) {
      html += `<button type="button" class="btn btn-secondary btn-block mt-12" id="bus-toggle-past">${busShowPast ? 'Скрыть ушедшие' : 'Показать ушедшие (' + past.length + ')'}</button>`;
      if (busShowPast) {
        html += `<p class="hint mt-8 mb-8">Уже ушли</p>` + past.map(b => card(b, true)).join('');
      }
    }

    list.innerHTML = html;
    document.getElementById('bus-dir')?.addEventListener('change', e => { busFilterDir = e.target.value; renderBuses(); });
    document.getElementById('bus-num')?.addEventListener('change', e => { busFilterNumber = e.target.value; renderBuses(); });
    document.getElementById('bus-toggle-past')?.addEventListener('click', () => { busShowPast = !busShowPast; renderBuses(); });
    list.querySelectorAll('.card[data-id]').forEach(c => { c.onclick = () => openBusModal(c.dataset.id); });
  }

  function openBusModal(id) {
    const bus = id ? state.buses.find(b => b.id === id) : null;
    const isNew = !bus;
    openModal(isNew ? 'Новый маршрут' : 'Автобус', `
      <div class="form-row">
        <div class="form-group"><label>Номер маршрута</label><input class="input" id="f-number" value="${escapeAttr(bus?.number || '')}" placeholder="42"></div>
        <div class="form-group"><label>Время отправления</label><input class="input" id="f-time" type="time" value="${escapeAttr(bus?.time || '')}"></div>
      </div>
      <div class="form-group"><label>Откуда</label><input class="input" id="f-from" value="${escapeAttr(bus?.from || bus?.fromStop || '')}" placeholder="Дом, остановка «Парк»"></div>
      <div class="form-group"><label>Куда</label><input class="input" id="f-to" value="${escapeAttr(bus?.to || bus?.destination || '')}" placeholder="Школа / Дом"></div>
      <div class="form-group"><label>Идти до остановки (мин)</label>
        <input class="input" id="f-walk" type="number" min="0" max="60" value="${bus?.walkMin ?? 5}">
        <p class="hint" style="margin-top:4px">Программа вычтет это из времени автобуса → «выйти через N мин»</p>
      </div>
      <h3 style="font-size:0.85rem;margin:12px 0 8px;color:var(--text-muted)">ПЕРЕСАДКА (необязательно)</h3>
      <div class="form-row">
        <div class="form-group"><label>№ 2-го автобуса</label><input class="input" id="f-tnum" value="${escapeAttr(bus?.transferNumber || '')}" placeholder="15"></div>
        <div class="form-group"><label>Время 2-го</label><input class="input" id="f-ttime" type="time" value="${escapeAttr(bus?.transferTime || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Пересадка откуда</label><input class="input" id="f-tfrom" value="${escapeAttr(bus?.transferFrom || '')}"></div>
        <div class="form-group"><label>Пересадка куда</label><input class="input" id="f-tto" value="${escapeAttr(bus?.transferTo || '')}"></div>
      </div>
      <div class="form-group"><label>Заметки</label><input class="input" id="f-notes" value="${escapeAttr(bus?.notes || '')}" placeholder="Только по будням…"></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);

    document.getElementById('modal-save').onclick = () => {
      const data = {
        id: bus?.id || uid(),
        number: document.getElementById('f-number').value.trim(),
        time: document.getElementById('f-time').value,
        from: document.getElementById('f-from').value.trim(),
        to: document.getElementById('f-to').value.trim(),
        destination: document.getElementById('f-to').value.trim(), // compat
        walkMin: +document.getElementById('f-walk').value || 0,
        transferNumber: document.getElementById('f-tnum').value.trim(),
        transferTime: document.getElementById('f-ttime').value,
        transferFrom: document.getElementById('f-tfrom').value.trim(),
        transferTo: document.getElementById('f-tto').value.trim(),
        notes: document.getElementById('f-notes').value.trim()
      };
      if (!data.time && !data.number) return toast('Укажи номер или время');
      if (isDuplicateBus(data, isNew ? null : id)) return toast('Такой рейс уже есть (то же время и маршрут)');
      if (isNew) state.buses.push(data);
      else { const idx = state.buses.findIndex(b => b.id === id); if (idx >= 0) state.buses[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
      state.buses = state.buses.filter(b => b.id !== id); save(); closeModal(); render(); toast('Удалено');
    };
  }

  // ─── AGENT ───

  // ─── Stage 4: live suggestions + dialog helpers ───
  let _liveTimer = null;
  let _lastLiveJson = '';

  function buildLiveSuggestions(raw) {
    const t = normalizeAgentText(raw);
    if (!t || t.length < 2) return [];
    if (agentPending) return [];
    const out = [];
    const seen = new Set();
    const push = (label, cmd, kind) => {
      const k = (cmd || '').toLowerCase();
      if (!k || seen.has(k) || out.length >= 5) return;
      seen.add(k);
      out.push({ label: label, cmd: cmd, kind: kind || 'catalog' });
    };

    const subj = resolveSubject(t);
    if (subj) {
      push('+ ' + subj, 'добавь урок ' + subj, 'subject');
      push(subj + ' сегодня', 'расписание на сегодня', 'subject');
      push('Что взять', 'что взять сегодня', 'subject');
    }

    const day = parseDayToken(t);
    if (day != null) {
      push('Расписание на ' + dayNa(day), 'расписание на ' + dayNa(day), 'day');
      push('Удалить ' + dayNa(day), 'удали расписание на ' + dayNa(day), 'day');
    }

    if (/^доб|^добав|\+/.test(t)) {
      push('Добавить урок', 'добавь урок', 'intent');
      push('Добавить кружок', 'добавь кружок', 'intent');
      push('Добавить ДЗ', 'добавь дз', 'intent');
    }
    if (/^удал|^очист|^убер/.test(t)) {
      push('Удалить день', 'удали день', 'intent');
      push('Очистить расписание', 'очисти расписание', 'intent');
      push('Очистить автобусы', 'очисти автобусы', 'intent');
    }
    if (/^авт|^рейс|^марш/.test(t)) {
      push('Автобусы сейчас', 'автобусы сейчас', 'intent');
      push('Автобусы домой', 'автобусы домой', 'intent');
      push('Автобусы в школу', 'автобусы в школу', 'intent');
    }
    if (/^пров|^рюк|^что\s*вз/.test(t)) {
      push('Проверка дня', 'проверка дня', 'intent');
      push('Что взять сегодня', 'что взять сегодня', 'intent');
    }
    if (/^лог|^журнал/.test(t)) {
      push('Лог агента', 'лог агента', 'intent');
      push('Лог внимания', 'лог внимания', 'intent');
    }
    if (/^помо|^help|^как|^что\s*уме/.test(t)) {
      push('Помощь', 'помощь', 'info');
    }
    if (/\d+\s*[+\-*/]\s*\d+/.test(t) || /посчит|вычисл/.test(t)) {
      push('Посчитать ' + t.replace(/=$/, ''), (t.endsWith('=') ? t : t + '='), 'calc');
    }

    if (typeof AGENT_CATALOG !== 'undefined') {
      for (const cat of Object.values(AGENT_CATALOG)) {
        for (const it of (cat.items || [])) {
          const lab = (it.label || '').toLowerCase();
          const cmd = (it.cmd || '').toLowerCase();
          if (lab.includes(t) || cmd.includes(t) || t.includes(lab.slice(0, 4))) {
            push(it.label, it.cmd, 'catalog');
          }
        }
      }
    }

    try {
      const top = topPresets(3);
      for (const [id] of top) {
        for (const c of Object.values(AGENT_CATALOG || {})) {
          const it = (c.items || []).find(x => x.id === id);
          if (it) push(it.label, it.cmd, 'preset');
        }
      }
    } catch (e) {}

    return out.slice(0, 5);
  }

  function renderLiveChips(chips) {
    const el = document.getElementById('agent-live-chips');
    if (!el) return;
    const j = JSON.stringify(chips || []);
    if (j === _lastLiveJson) return;
    _lastLiveJson = j;
    if (!chips || !chips.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = chips.map(c =>
      '<button type="button" class="agent-live-chip" data-cmd="' + escapeAttr(c.cmd) + '" data-kind="' + escapeAttr(c.kind || '') + '">' + escapeHtml(c.label) + '</button>'
    ).join('');
    el.querySelectorAll('.agent-live-chip').forEach(b => {
      b.onclick = () => {
        const input = document.getElementById('agent-input');
        if (input) input.value = '';
        renderLiveChips([]);
        try { trackUsage('live:' + (b.dataset.kind || '') + ':' + b.dataset.cmd); } catch (e) {}
        agentReply(b.dataset.cmd);
      };
    });
  }

  function onAgentInputLive(e) {
    clearTimeout(_liveTimer);
    const val = (e.target.value || '').trim();
    if (val.length < 2 || agentPending) { renderLiveChips([]); return; }
    _liveTimer = setTimeout(() => {
      renderLiveChips(buildLiveSuggestions(val));
    }, 120);
  }

  function pendingLabel(p) {
    if (!p) return '';
    if (p.type === 'add_lesson') {
      if (p.step === 'subject') return 'Какой предмет?';
      if (p.step === 'day') return '«' + (p.subject || '') + '» — какой день?';
      if (p.step === 'time') return '«' + (p.subject || '') + '», ' + (p.day != null ? dayNa(p.day) : '') + ' — во сколько?';
    }
    if (p.type === 'add_club') {
      if (p.step === 'name') return 'Как называется кружок?';
      if (p.step === 'day') return '«' + (p.name || '') + '» — какой день?';
      if (p.step === 'time') return '«' + (p.name || '') + '» — во сколько?';
    }
    if (p.type === 'add_conflict') return 'Конфликт: заменить / другое время / отмена';
    if (p.type === 'delete_pick') return 'Что удалить?';
    if (p.type === 'confirm_wipe') return 'Подтвердить удаление?';
    if (p.type === 'learn') return 'Что значит «' + (p.phrase || '') + '»?';
    return 'Жду ответа';
  }

  function nextStepSuggestions() {
    const hour = new Date().getHours();
    const s = [];
    const add = (l, c) => { if (!s.find(x => x.cmd === c)) s.push({ label: l, cmd: c }); };
    if (hour >= 5 && hour < 12) add('Что взять сегодня', 'что взять сегодня');
    if (hour >= 16) add('Проверка дня', 'проверка дня');
    if ((state.homework || []).some(h => !h.done)) add('Домашка', 'домашка');
    if (typeof goingHome !== 'undefined' && goingHome) add('Автобусы домой', 'автобусы домой');
    else add('Автобусы сейчас', 'автобусы сейчас');
    add('Свободное время', 'свободное время');
    return s.slice(0, 4);
  }

  function legacyChoicesToQR(m) {
    if (m.quickReplies && m.quickReplies.length) return m.quickReplies;
    if (m.choices && m.choices.length) {
      return m.choices.map(c => ({ label: c.label || c, cmd: c.cmd || c }));
    }
    if (m.yesNo) {
      return [
        { label: 'Да', cmd: 'да' },
        { label: 'Нет', cmd: 'нет' },
        { label: 'Отмена', cmd: 'отмена' }
      ];
    }
    if (m.subjects) {
      return allSubjectsList().slice(0, 16).map(s => ({ label: s, cmd: s }));
    }
    return null;
  }

  function renderAgent() {
    const chat = document.getElementById('agent-chat');
    if (!agentHistory.length) {
      agentHistory.push({
        role: 'bot',
        text: 'Привет! Я Агент Орбита.\nНажми категорию → команду, или пиши текстом.\nДобавление урока/кружка — с кнопками дня и времени.'
      });
    }

    const catsEl = document.getElementById('agent-cats');
    if (catsEl) {
      const order = [
        ['add', 'Добавить'],
        ['schedule', 'Расписание'],
        ['buses', 'Автобусы'],
        ['pack', 'Рюкзак'],
        ['people', 'Люди'],
        ['scripts', 'Скрипты'],
        ['files', 'Файлы'],
        ['control', 'Управление'],
        ['calc', 'Счёт'],
        ['data', 'Данные'],
        ['presets', 'Частые']
      ];
      catsEl.innerHTML = order.map(([k, title]) =>
        '<button type="button" class="agent-cat" data-cat="' + k + '">' + title + '</button>'
      ).join('');
      catsEl.querySelectorAll('.agent-cat').forEach(btn => {
        btn.onclick = () => {
          catsEl.querySelectorAll('.agent-cat').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          try { sessionStorage.setItem('orbit-agent-cat', btn.dataset.cat); } catch (e) {}
          const sug = document.getElementById('agent-suggestions');
          if (!sug) return;
          if (btn.dataset.cat === 'presets') {
            const top = topPresets(10);
            sug.innerHTML = top.length
              ? top.map(([id, cnt]) => {
                  let label = id, cmd = id;
                  for (const c of Object.values(AGENT_CATALOG)) {
                    const it = (c.items || []).find(i => i.id === id);
                    if (it) { label = it.label; cmd = it.cmd; break; }
                  }
                  return '<button type="button" class="agent-chip" data-cmd=\"' + escapeAttr(cmd) + '\">' + escapeHtml(label) + '</button>';
                }).join('')
              : '<span class="hint">Частые команды появятся после 2–3 использований</span>';
          } else {
            const cat = AGENT_CATALOG[btn.dataset.cat];
            if (!cat) { sug.innerHTML = ''; return; }
            sug.innerHTML = cat.items.map(it =>
              '<button type="button" class="agent-chip" data-cmd=\"' + escapeAttr(it.cmd) + '\" data-uid=\"' + escapeAttr(it.id) + '\">' + escapeHtml(it.label) + '</button>'
            ).join('');
          }
          sug.querySelectorAll('[data-cmd]').forEach(b => {
            b.onclick = () => {
              if (b.dataset.uid) trackUsage(b.dataset.uid);
              agentReply(b.dataset.cmd);
            };
          });
        };
      });
      // auto-open first category once
      if (!catsEl.dataset.opened) {
        catsEl.dataset.opened = '1';
        let saved = null;
        try { saved = sessionStorage.getItem('orbit-agent-cat'); } catch (e) {}
        const pick = (saved && catsEl.querySelector('.agent-cat[data-cat="' + saved + '"]')) || catsEl.querySelector('.agent-cat');
        if (pick) pick.click();
      }
    }

    // Persistent pending context bar
    let bar = document.getElementById('agent-pending-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'agent-pending-bar';
      bar.className = 'agent-pending-bar';
      const inputRow = document.querySelector('.agent-input-row');
      if (inputRow) inputRow.parentNode.insertBefore(bar, inputRow);
    }
    if (agentPending) {
      bar.classList.remove('hidden');
      bar.style.display = 'block';
      bar.innerHTML = '<div class="pending-label">🎯 ' + escapeHtml(pendingLabel(agentPending)) + '</div>' +
        '<div class="pending-actions">' +
        '<button type="button" class="agent-choice-btn" data-cmd="назад">← Назад</button>' +
        '<button type="button" class="agent-choice-btn" data-cmd="пропустить">Пропустить</button>' +
        '<button type="button" class="agent-choice-btn" data-cmd="отмена">Отмена</button></div>';
      bar.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => agentReply(b.dataset.cmd));
      renderLiveChips([]);
    } else {
      bar.classList.add('hidden');
      bar.style.display = 'none';
      bar.innerHTML = '';
    }

    chat.innerHTML = agentHistory.map((m, idx) => {
      let body = '<div class="agent-msg ' + m.role + '">' + escapeHtml(m.text || '').replace(/\n/g, '<br>');
      if (m.card) body += renderAgentCard(m.card);
      if (m.copyPrompt) {
        body += '<button type="button" class="btn btn-secondary btn-block mt-8 agent-copy-btn" data-idx="' + idx + '">📋 Копировать</button>';
      }
      const qr = legacyChoicesToQR(m);
      if (qr && qr.length) {
        body += '<div class="agent-choices">' + qr.map(c =>
          '<button type="button" class="agent-choice-btn" data-cmd="' + escapeAttr(c.cmd) + '" data-idx="' + idx + '">' + escapeHtml(c.label) + '</button>'
        ).join('') + '</div>';
      }
      if (idx === agentHistory.length - 1 && m.role === 'bot' && !agentPending) {
        const ctx = nextStepSuggestions();
        if (ctx.length) {
          body += '<div class="agent-context-chips">' + ctx.map(c =>
            '<button type="button" class="agent-context-chip" data-cmd="' + escapeAttr(c.cmd) + '">' + escapeHtml(c.label) + '</button>'
          ).join('') + '</div>';
        }
      }
      body += '</div>';
      return body;
    }).join('');
    const nearBottom = (chat.scrollHeight - chat.scrollTop - chat.clientHeight) < 80;
    if (nearBottom) chat.scrollTop = chat.scrollHeight;
    chat.querySelectorAll('.agent-copy-btn').forEach(btn => {
      btn.onclick = async () => {
        const msg = agentHistory[+btn.dataset.idx];
        if (!msg || !msg.copyPrompt) return;
        try { await navigator.clipboard.writeText(msg.copyPrompt); toast('Скопировано'); }
        catch (e) { toast('Не удалось скопировать'); }
      };
    });
    chat.querySelectorAll('.agent-choice-btn, .agent-context-chip').forEach(btn => {
      btn.onclick = () => {
        if (agentPending && btn.dataset.idx != null && +btn.dataset.idx < agentHistory.length - 1) {
          // old button while pending — reset pending and run as new command
          agentPending = null;
        }
        agentReply(btn.dataset.cmd);
      };
    });
    setupAgentDrop();
  }



  function renderAgentCard(c) {
    if (!c || !c.type) return '';
    if (c.type === 'schedule' || c.type === 'buses' || c.type === 'list') {
      const rows = (c.items || []).map(it =>
        '<div class="agent-card-row">' +
          '<div class="agent-card-time">' + escapeHtml(it.time || it.left || '') + '</div>' +
          '<div class="agent-card-body">' +
            '<div class="agent-card-title">' + escapeHtml(it.title || it.name || '') + '</div>' +
            (it.meta ? '<div class="agent-card-meta">' + escapeHtml(it.meta) + '</div>' : '') +
          '</div></div>'
      ).join('');
      return '<div class="agent-card" data-type="' + escapeAttr(c.type) + '">' +
        (c.header ? '<div class="agent-card-header">' + escapeHtml(c.header) + '</div>' : '') +
        rows +
        (c.footer ? '<div class="agent-card-footer">' + escapeHtml(c.footer) + '</div>' : '') +
        '</div>';
    }
    return '';
  }

  function pushBot(text, extra) {
    const msg = Object.assign({ role: 'bot', text: text || '' }, extra || {});
    agentHistory.push(msg);
    if (agentHistory.length > 60) agentHistory = agentHistory.slice(-50);
    try { if (text) agentLog('bot', String(text).slice(0, 300)); } catch (e) {}
    try {
      if (agentPending) localStorage.setItem('orbit-agent-pending', JSON.stringify(agentPending));
      else localStorage.removeItem('orbit-agent-pending');
    } catch (e) {}
    renderAgent();
    return msg;
  }


  function dailyCheckReport() {
    const day = todayIndex();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const lines = [];
    const lessons = state.lessons.filter(l => l.day === day).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
    const remaining = lessons.filter(l => (parseTime(l.end) ?? 0) >= nowMin - 1);
    lines.push(`📅 Сегодня ${dayPrep(day)}`);
    lines.push(lessons.length ? `Уроков: ${lessons.length}, ещё впереди: ${remaining.length}` : 'Уроков нет');
    // pack
    const items = new Set();
    lessons.forEach(l => (l.items || []).forEach(i => items.add(i)));
    const checks = state.packChecks || {};
    let packed = 0, total = items.size;
    items.forEach(i => {
      const k1 = day + ':' + i;
      const k2 = day + ':' + String(i).toLowerCase();
      if (checks[k1] || checks[k2] || checks[i]) packed++;
    });
    if (total) lines.push(`🎒 Рюкзак: ${packed}/${total} отмечено` + (packed < total ? ' — не всё собрано' : ' — ок'));
    else lines.push('🎒 Список вещей на сегодня пуст');
    // hw
    const hw = state.homework.filter(h => !h.done);
    lines.push(hw.length ? `📝 Несделанная домашка: ${hw.length}` : '📝 Домашка: всё закрыто');
    // buses
    const buses = getRelevantBuses(nowMin, goingHome ? 'home' : 'all', 3);
    if (atHome) lines.push('🚌 Ты дома — автобусы не актуальны');
    else if (buses.length) lines.push('🚌 Ближайшие: ' + buses.map(b => `№${b.number} в ${b.time}`).join(', '));
    else lines.push('🚌 Ближайших автобусов нет');
    // bday
    (state.people || []).forEach(p => {
      if (!p.birthday) return;
      const d = daysUntilBirthday(p.birthday);
      if (d != null && d <= 7) lines.push('🎂 Скоро ДР: ' + p.name + (d === 0 ? ' (сегодня!)' : d === 1 ? ' (завтра)' : ' (через ' + d + ' дн.)'));
    });
    // holidays tasks
    const td = today.toISOString().slice(0,10);
    (state.holidays||[]).forEach(h => {
      if (h.start && h.end && td >= h.start && td <= h.end && Array.isArray(h.tasks)) {
        const done = h.tasks.filter(t => t.done).length;
        lines.push(`🏖 Каникулы «${h.name}»: задания ${done}/${h.tasks.length}`);
      }
    });
    const attention = lines.filter(l => /не всё|Несделанная|нет/.test(l));
    appendAttentionLog({ date: td, lines, issues: attention.length });
    return lines.join('\n');
  }

  function appendAttentionLog(entry) {
    try {
      const key = 'orbit-attention-log';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.push(Object.assign({ ts: Date.now() }, entry));
      while (arr.length > 60) arr.shift();
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  }

  function getAttentionLogText() {
    try {
      const arr = JSON.parse(localStorage.getItem('orbit-attention-log') || '[]');
      if (!arr.length) return 'Лог пуст. Запусти «проверка дня».';
      return arr.slice(-15).map(e => {
        return `[${e.date || ''}] проблем: ${e.issues || 0}\n` + (e.lines || []).join('\n');
      }).join('\n\n——\n\n');
    } catch (e) { return 'Ошибка чтения лога'; }
  }


  // ─── Audio blobs in IndexedDB (not localStorage) ───
  const AUDIO_DB = 'orbit-audio-v1';
  const AUDIO_STORE = 'clips';
  function openAudioDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(AUDIO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveAudioBlob(id, blob, mime) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.objectStore(AUDIO_STORE).put({ id, blob, mime: mime || blob.type || 'audio/webm', ts: Date.now() });
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function loadAudioBlob(id) {
    if (!id) return null;
    try {
      const db = await openAudioDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, 'readonly');
        const r = tx.objectStore(AUDIO_STORE).get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    } catch (e) { return null; }
  }
  async function deleteAudioBlob(id) {
    if (!id) return;
    try {
      const db = await openAudioDB();
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.objectStore(AUDIO_STORE).delete(id);
    } catch (e) {}
  }
  async function migrateBase64AudioToIdb() {
    let changed = false;
    for (const n of state.notes || []) {
      if (n.audio && !n.audioId) {
        try {
          const mime = n.audioMime || 'audio/webm';
          const bin = atob(n.audio);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const blob = new Blob([arr], { type: mime });
          const aid = n.id || uid();
          await saveAudioBlob(aid, blob, mime);
          n.audioId = aid;
          n.audioMime = mime;
          delete n.audio;
          changed = true;
        } catch (e) { console.warn('audio migrate', e); }
      }
    }
    if (changed) save();
  }

  // ─── IndexedDB: agent learning ───
  const IDB_NAME = 'orbit-agent-v1';
  const IDB_STORE = 'knowledge';
  function openAgentDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'phrase' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadAgentKnowledge() {
    try {
      const db = await openAgentDB();
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const all = await new Promise((res, rej) => {
        const r = store.getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
      agentKnowledge = {};
      all.forEach(row => { if (row.phrase && row.meaning) agentKnowledge[row.phrase] = row.meaning; });
    } catch (e) { console.warn('IDB load', e); }
  }
  async function saveAgentKnowledge(phrase, meaning) {
    const p = normalizeAgentText(phrase);
    if (!p || !meaning) return;
    agentKnowledge[p] = meaning;
    try {
      const db = await openAgentDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ phrase: p, meaning: String(meaning), ts: Date.now() });
    } catch (e) { console.warn('IDB save', e); }
  }

  function confirmWipe(kind, counts) {
    const labels = {
      lessons: 'все уроки (' + (counts?.lessons ?? state.lessons.length) + ')',
      clubs: 'все кружки',
      events: 'все события',
      schedule: 'всё расписание (уроки + кружки + события)',
      buses: 'все автобусы',
      'buses-dup': 'дубли рейсов автобусов',
      homework: 'всю домашку',
      goals: 'все цели',
      notes: 'все заметки',
      dayLogs: 'дневник',
      people: 'всех людей',
      holidays: 'все каникулы',
      agent: 'память агента и чат',
      all: 'ВСЕ ДАННЫЕ ПРИЛОЖЕНИЯ ПОД НОЛЬ'
    };
    const label = labels[kind] || kind;
    if (!confirm('Точно удалить: ' + label + '?\nОтменить будет нельзя.')) return;
    if (kind === 'all' || kind === 'people' || kind === 'schedule') {
      if (!confirm('Второе подтверждение: удалить «' + label + '»?')) return;
    }
    doWipe(kind);
  }

  async function doWipe(kind) {
    if (kind === 'lessons') state.lessons = [];
    else if (kind === 'clubs') state.clubs = [];
    else if (kind === 'events') state.events = [];
    else if (kind === 'schedule') { state.lessons = []; state.clubs = []; state.events = []; }
    else if (kind === 'buses') state.buses = [];
    else if (kind === 'buses-dup') {
      const seen = new Set();
      state.buses = state.buses.filter(b => {
        const key = [b.number, b.time, b.from || '', b.to || b.destination || ''].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else if (kind === 'homework') state.homework = [];
    else if (kind === 'goals') state.goals = [];
    else if (kind === 'notes') state.notes = [];
    else if (kind === 'dayLogs') state.dayLogs = [];
    else if (kind === 'people') state.people = [];
    else if (kind === 'holidays') state.holidays = [];
    else if (kind === 'agent') {
      agentPending = null;
      agentHistory = [];
      await clearAgentKnowledge();
      save();
      toast('Память агента очищена');
      render();
      return;
    } else if (kind === 'all') {
      state = migrate({});
      agentPending = null;
      agentHistory = [];
      goingHome = false;
      await clearAgentKnowledge();
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(BACKUP_KEY);
      } catch (e) {}
      save();
      applyTheme();
      toast('Всё очищено под ноль');
      render();
      return;
    }
    save();
    toast('Удалено');
    render();
  }

  async function clearAgentKnowledge() {
    agentKnowledge = {};
    try {
      const db = await openAgentDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
    } catch (e) {}
  }
  function lookupLearned(text) {
    const t = normalizeAgentText(text);
    if (!t) return null;
    if (agentKnowledge[t]) return agentKnowledge[t];
    for (const [phrase, meaning] of Object.entries(agentKnowledge)) {
      if (!phrase || phrase.length < 4) continue;
      if (t === phrase) return meaning;
      if (phrase.length >= 4 && t.length >= 4 && (t.includes(phrase) || phrase.includes(t))) return meaning;
    }
    return null;
  }

  // ─── AGENT CORES ───
  // Understanding core: normalize text, expand synonyms, detect intent
  // Compute core: free time, load, pack lists, schedule math

  const AGENT_INTENTS = [
    // --- info ---
    { id: 'help', cat: 'info', words: ['помощь','help','что умеешь','команды','справка','умения','функции'], },
    { id: 'free', cat: 'info', words: ['свободное время','окна','free','свободно','перерывы','когда свободен'], },
    { id: 'load', cat: 'info', words: ['нагрузка','нагрузка недели','график недели','сколько часов','занятость'], },
    { id: 'pack', cat: 'info', words: ['что взять','рюкзак','собрать','что нужно','вещи на'], },
    { id: 'show_day', cat: 'info', words: ['покажи уроки','какие уроки','расписание на','уроки в','что сегодня','что завтра'], },
    { id: 'hw_list', cat: 'info', words: ['домашка','дз','homework','задания','домашние задания'], },
    { id: 'next_lesson', cat: 'info', words: ['следующий урок','какой сейчас','сейчас урок','что дальше','ближайший урок'], },
    { id: 'buses_info', cat: 'info', words: ['автобус','когда выходить','маршруты','транспорт'], },
    { id: 'goals_info', cat: 'info', words: ['цели','прогресс целей','мои цели'], },
    { id: 'stats', cat: 'info', words: ['статистика','сколько уроков','сводка','итоги'], },
    // --- add ---
    { id: 'add_lesson', cat: 'add', words: ['добавь урок','добавить урок','новый урок','создай урок','запиши урок'], },
    { id: 'add_club', cat: 'add', words: ['добавь кружок','добавить кружок','новая секция','запиши кружок'], },
    { id: 'add_event', cat: 'add', words: ['добавь событие','добавить событие','замена','собрание','мероприятие'], },
    { id: 'add_hw', cat: 'add', words: ['добавь домашку','добавить дз','новое задание','задай домашку'], },
    { id: 'add_note', cat: 'add', words: ['добавь заметку','запиши заметку','новая заметка'], },
    { id: 'add_bus', cat: 'add', words: ['добавь автобус','новый маршрут','добавить автобус'], },
    { id: 'add_goal', cat: 'add', words: ['добавь цель','новая цель','поставь цель'], },
    // --- delete ---
    { id: 'del_day', cat: 'delete', words: ['удали все уроки в','очисти день','удали расписание в','убери уроки в'], },
    { id: 'del_subject', cat: 'delete', words: ['удали урок','удали все уроки','убери урок','удалить предмет'], },
    { id: 'del_all_lessons', cat: 'delete', words: ['удали все уроки','очисти уроки'], },
    { id: 'del_clubs', cat: 'delete', words: ['удали все кружки','очисти кружки'], },
    { id: 'del_hw', cat: 'delete', words: ['удали всю домашку','очисти домашку','удали все дз'], },
    { id: 'del_notes', cat: 'delete', words: ['удали все заметки','очисти заметки'], },
    { id: 'clear_schedule', cat: 'delete', words: ['очисти расписание','удали всё расписание','сброс расписания'], },
    { id: 'full_reset', cat: 'delete', words: ['очисти всё','полный сброс','удали все данные','сброс приложения','обнули'], },
    // --- move ---
    { id: 'move', cat: 'move', words: ['перенеси','перемести','замена','перекинь','сдвинь урок','перенос'], },
    { id: 'swap_days', cat: 'move', words: ['поменяй дни','обмен днями','swap'], },
    // --- edit ---
    { id: 'set_duration', cat: 'edit', words: ['длительность урока','поставь длительность','уроки по','минуты урока'], },
    { id: 'set_theme', cat: 'edit', words: ['тёмная тема','светлая тема','включи тёмную','включи светлую'], },
    { id: 'mark_hw_done', cat: 'edit', words: ['домашка сделана','отметь дз','выполнил дз','закрыл домашку'], },
    // --- tools ---
    { id: 'template', cat: 'tools', words: ['шаблон json','пример json','template','промпт'], },
    { id: 'export_hint', cat: 'tools', words: ['экспорт','выгрузить','бэкап','backup'], },
    { id: 'example', cat: 'tools', words: ['загрузи пример','пример данных','демо'], },
    { id: 'clear_chat', cat: 'tools', words: ['очистить историю','сброс чата','очисти чат'], },
    { id: 'list_subjects', cat: 'tools', words: ['список предметов','какие предметы','предметы'], },
    { id: 'fill_day', cat: 'tools', words: ['заполни день','типовой день','стандартное расписание'], },
  ];

    function matchIntent(text) {
    const t = normalizeAgentText(text);
    let best = null, bestScore = 0;
    for (const intent of AGENT_INTENTS) {
      for (const w of intent.words) {
        const nw = normalizeAgentText(w);
        if (t === nw || t.includes(nw) || nw.includes(t)) {
          const score = nw.length + (t.startsWith(nw) ? 5 : 0) + (t === nw ? 10 : 0);
          if (score > bestScore) { bestScore = score; best = intent; }
        }
      }
    }
    return best;
  }

  function parseDayToken(str) {
    const dayMap = {
      понедельник: 0, понедельника: 0, понед: 0, пн: 0,
      вторник: 1, вторника: 1, вт: 1,
      среду: 2, среды: 2, среда: 2, ср: 2,
      четверг: 3, четверга: 3, чт: 3,
      пятницу: 4, пятницы: 4, пятница: 4, пт: 4,
      субботу: 5, субботы: 5, суббота: 5, сб: 5,
      воскресенье: 6, воскресенья: 6, воскр: 6, вс: 6,
      сегодня: 'today',
      завтра: 'tomorrow'
    };
    const t = normalizeAgentText(str);
    const tokens = t.split(/[^a-zа-яё0-9]+/i).filter(Boolean);
    const keys = Object.keys(dayMap).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      if (tokens.includes(k)) {
        const v = dayMap[k];
        if (v === 'today') return todayIndex();
        if (v === 'tomorrow') return (todayIndex() + 1) % 7;
        return v;
      }
    }
    for (const k of keys) {
      if (k.length < 2) continue;
      const re = new RegExp('(?:^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)');
      if (re.test(t)) {
        const v = dayMap[k];
        if (v === 'today') return todayIndex();
        if (v === 'tomorrow') return (todayIndex() + 1) % 7;
        return v;
      }
    }
    return null;
  }

  function parseValidTime(str) {
    const s = String(str || '').trim();
    let h, mi;
    let m = s.match(/^(\d{1,2})[:.\s](\d{2})$/);
    if (m) { h = +m[1]; mi = +m[2]; }
    else if (/^(\d{3,4})$/.test(s)) {
      if (s.length === 3) { h = +s[0]; mi = +s.slice(1); }
      else { h = +s.slice(0, 2); mi = +s.slice(2); }
    } else {
      m = s.match(/(\d{1,2})[:.\s](\d{2})/);
      if (!m) return null;
      h = +m[1]; mi = +m[2];
    }
    if (h > 23 || mi > 59 || h < 0 || mi < 0 || isNaN(h) || isNaN(mi)) return null;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }


  function tryCalculate(raw) {
    let s = (raw || '').trim().replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
    s = s.replace(/^(посчитай|вычисли|сколько будет|калькулятор)\s+/i, '');
    s = s.replace(/=\s*$/, '').trim();
    if (!s || !/\d/.test(s)) return null;
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if ('+-*/^()'.includes(ch)) { tokens.push(ch); i++; continue; }
      if (/\d|\./.test(ch)) {
        let j = i + 1;
        while (j < s.length && /[\d.]/.test(s[j])) j++;
        const num = s.slice(i, j);
        if (!/^\d+(\.\d+)?$/.test(num)) return null;
        tokens.push(num);
        i = j;
        continue;
      }
      return null;
    }
    if (!tokens.length) return null;
    const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
    const rightAssoc = { '^': true };
    const output = [];
    const ops = [];
    let prevWasOp = true;
    for (const t of tokens) {
      if (/^\d/.test(t)) { output.push(parseFloat(t)); prevWasOp = false; continue; }
      if (t === '(') { ops.push(t); prevWasOp = true; continue; }
      if (t === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop());
        if (!ops.length) return null;
        ops.pop();
        prevWasOp = false;
        continue;
      }
      if ('+-*/^'.includes(t)) {
        if (t === '-' && prevWasOp) output.push(0);
        while (ops.length && ops[ops.length - 1] !== '(') {
          const top = ops[ops.length - 1];
          const pTop = prec[top] || 0, pT = prec[t] || 0;
          if (pTop > pT || (pTop === pT && !rightAssoc[t])) output.push(ops.pop());
          else break;
        }
        ops.push(t);
        prevWasOp = true;
      }
    }
    while (ops.length) {
      const op = ops.pop();
      if (op === '(' || op === ')') return null;
      output.push(op);
    }
    const stack = [];
    for (const t of output) {
      if (typeof t === 'number') { stack.push(t); continue; }
      if (stack.length < 2) return null;
      const b = stack.pop(), a = stack.pop();
      let r;
      if (t === '+') r = a + b;
      else if (t === '-') r = a - b;
      else if (t === '*') r = a * b;
      else if (t === '/') { if (b === 0) return null; r = a / b; }
      else if (t === '^') r = Math.pow(a, b);
      else return null;
      if (!isFinite(r)) return null;
      stack.push(r);
    }
    if (stack.length !== 1) return null;
    const rounded = Math.round(stack[0] * 1e10) / 1e10;
    return { expr: s, result: rounded, steps: 'Выражение: ' + s + '\nРезультат: ' + rounded };
  }

  // ─── Agent usage presets ───
  const USAGE_KEY = 'orbit-agent-usage-v1';
  let agentUsage = {};
  function loadAgentUsage() {
    try { agentUsage = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}') || {}; } catch (e) { agentUsage = {}; }
  }
  const AGENT_LOG_KEY = 'orbit-agent-debug-log';
  let agentDebugLog = [];
  function loadAgentDebugLog() {
    try { agentDebugLog = JSON.parse(localStorage.getItem(AGENT_LOG_KEY) || '[]') || []; } catch (e) { agentDebugLog = []; }
  }
  function agentLog(event, detail) {
    const entry = {
      ts: new Date().toISOString(),
      event: event,
      detail: detail || '',
      pending: agentPending ? (agentPending.type + '/' + (agentPending.step || '')) : null
    };
    agentDebugLog.push(entry);
    if (agentDebugLog.length > 200) agentDebugLog = agentDebugLog.slice(-150);
    try { localStorage.setItem(AGENT_LOG_KEY, JSON.stringify(agentDebugLog)); } catch (e) {}
  }
  function getAgentDebugLogText() {
    if (!agentDebugLog.length) return 'Лог агента пуст.';
    return agentDebugLog.slice(-80).map(e => {
      return '[' + e.ts + '] ' + e.event + (e.pending ? ' (pending: ' + e.pending + ')' : '') + (e.detail ? '\n  ' + e.detail : '');
    }).join('\n\n');
  }

  function trackUsage(id) {
    if (!id) return;
    agentUsage[id] = (agentUsage[id] || 0) + 1;
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(agentUsage)); } catch (e) {}
  }
  function topPresets(n) {
    return Object.entries(agentUsage).sort((a, b) => b[1] - a[1]).filter(x => x[1] >= 2).slice(0, n || 6);
  }

  // Catalog of agent actions (категории — UX, не «колхоз»)
  const AGENT_CATALOG = {
    schedule: {
      title: 'Расписание',
      items: [
        { id: 'add_lesson', label: 'Добавить урок', cmd: 'добавь урок' },
        { id: 'del_day', label: 'Удалить день', cmd: 'удали день' },
        { id: 'clear_sch', label: 'Очистить расписание', cmd: 'очисти расписание' },
        { id: 'move_lesson', label: 'Перенести урок', cmd: 'перенеси урок' },
        { id: 'show_mon', label: 'Расписание на пн', cmd: 'расписание на понедельник' },
        { id: 'show_today', label: 'Уроки сегодня', cmd: 'уроки сегодня' },
        { id: 'free_time', label: 'Свободное время', cmd: 'свободное время' },
        { id: 'load_week', label: 'Нагрузка недели', cmd: 'нагрузка' },
        { id: 'next_lesson', label: 'Сейчас / далее', cmd: 'сейчас' },
        { id: 'subjects', label: 'Список предметов', cmd: 'предметы' }
      ]
    },
    buses: {
      title: 'Автобусы',
      items: [
        { id: 'bus_now', label: 'Автобусы сейчас', cmd: 'автобусы сейчас' },
        { id: 'bus_home', label: 'Автобусы домой', cmd: 'автобусы домой' },
        { id: 'bus_school', label: 'Автобусы в школу', cmd: 'автобусы в школу' },
        { id: 'going_home', label: 'Еду домой', cmd: 'еду домой' },
        { id: 'at_home', label: 'Я дома', cmd: 'я дома' },
        { id: 'clear_bus', label: 'Очистить автобусы', cmd: 'очисти автобусы' }
      ]
    },
    pack: {
      title: 'Рюкзак и ДЗ',
      items: [
        { id: 'pack_today', label: 'Что взять сегодня', cmd: 'что взять сегодня' },
        { id: 'pack_tom', label: 'Что взять завтра', cmd: 'что взять завтра' },
        { id: 'pack_check', label: 'Проверить рюкзак', cmd: 'проверь рюкзак' },
        { id: 'hw_list', label: 'Домашка', cmd: 'домашка' },
        { id: 'hw_clear', label: 'Очистить ДЗ', cmd: 'очисти дз' },
        { id: 'daily_check', label: 'Проверка дня', cmd: 'проверка дня' }
      ]
    },
    people: {
      title: 'Люди и каникулы',
      items: [
        { id: 'bday', label: 'Дни рождения', cmd: 'дни рождения' },
        { id: 'holidays', label: 'Каникулы', cmd: 'каникулы' },
        { id: 'hol_tasks', label: 'Задания на каникулы', cmd: 'задания на каникулы' }
      ]
    },
    data: {
      title: 'Данные',
      items: [
        { id: 'undo', label: 'Отменить шаг', cmd: 'отмена' },
        { id: 'export', label: 'Экспорт JSON', cmd: 'экспорт' },
        { id: 'stats', label: 'Статистика', cmd: 'статистика' },
        { id: 'attention', label: 'Лог внимания', cmd: 'лог внимания' },
        { id: 'agent_log', label: 'Лог агента (копировать)', cmd: 'лог агента' },
        { id: 'help', label: 'Помощь', cmd: 'помощь' }
      ]
    },
    calc: {
      title: 'Калькулятор',
      items: [
        { id: 'calc_hint', label: 'Как считать?', cmd: 'калькулятор' }
      ]
    },
    files: {
      title: 'Файлы',
      items: [
        { id: 'import_help', label: 'Как импортировать', cmd: 'импорт файл' },
        { id: 'export', label: 'Экспорт JSON', cmd: 'экспорт' },
        { id: 'example', label: 'Загрузить пример', cmd: 'загрузи пример' },
        { id: 'template', label: 'Скачать шаблон Excel', cmd: 'скачать шаблон' }
      ]
    },
    control: {
      title: 'Управление',
      items: [
        { id: 'tab_today', label: 'Открыть Сегодня', cmd: 'открой сегодня' },
        { id: 'tab_lessons', label: 'Открыть Уроки', cmd: 'открой уроки' },
        { id: 'tab_buses', label: 'Открыть Автобусы', cmd: 'открой автобусы' },
        { id: 'tab_pack', label: 'Открыть Рюкзак', cmd: 'открой рюкзак' },
        { id: 'tab_tasks', label: 'Открыть Задачи', cmd: 'открой задачи' },
        { id: 'theme', label: 'Сменить тему', cmd: 'смени тему' },
        { id: 'undo', label: 'Отменить', cmd: 'отмена' },
        { id: 'agent_log', label: 'Лог агента', cmd: 'лог агента' },
        { id: 'daily', label: 'Проверка дня', cmd: 'проверка дня' }
      ]
    }
  };


  function allSubjectsList() {
    const custom = (state.settings && state.settings.customSubjects) || [];
    const fromLessons = state.lessons.map(l => l.subject).filter(Boolean);
    return [...new Set([...SUBJECTS, ...custom, ...fromLessons])];
  }
  function rememberSubject(name) {
    if (!name) return;
    if (!state.settings.customSubjects) state.settings.customSubjects = [];
    if (!SUBJECTS.includes(name) && !state.settings.customSubjects.includes(name)) {
      state.settings.customSubjects.push(name);
      save();
    }
  }
  function dayChoiceButtons() {
    return DAYS.map((label, i) => ({ label: label, cmd: DAYS_NA[i] }));
  }
  function timeChoiceButtons(day) {
    const base = ['08:30', '09:20', '10:20', '11:15', '12:05', '13:00', '14:00', '15:00'];
    let sug = null;
    try { sug = suggestNextStart(day); } catch (e) {}
    const times = sug ? [sug].concat(base.filter(t => t !== sug)) : base;
    return times.slice(0, 8).map(t => ({ label: t, cmd: t }));
  }
  function subjectChoiceButtons() {
    return allSubjectsList().slice(0, 24).map(s => ({ label: s, cmd: s }));
  }


  async function runAgentScript(steps) {
    const results = [];
    const max = Math.min(steps.length, 30);
    for (let i = 0; i < max; i++) {
      const step = (steps[i] || '').trim();
      if (!step) continue;
      try {
        // Lightweight direct actions without double-pushing user msgs
        const lower = normalizeAgentText(step);
        if (/проверка дня/.test(lower)) {
          results.push((i + 1) + '. ' + dailyCheckReport().split('\n')[0]);
        } else if (/автобус/.test(lower)) {
          let mode = /дом|домой/.test(lower) ? 'home' : (/школ/.test(lower) ? 'school' : 'all');
          results.push((i + 1) + '. ' + agentBusesReply(mode).split('\n')[0]);
        } else if (/открой/.test(lower)) {
          agentHistory.pop(); // avoid noise
          // reuse single command path via temporary history
          const before = agentHistory.length;
          agentReply(step);
          const last = agentHistory[agentHistory.length - 1];
          results.push((i + 1) + '. ' + (last && last.role === 'bot' ? last.text.split('\n')[0] : step));
          // keep only one bot summary later
        } else if (/смени.*тем/.test(lower)) {
          toggleTheme();
          results.push((i + 1) + '. Тема: ' + (state.settings.theme || ''));
        } else if (/экспорт/.test(lower)) {
          exportJsonFile();
          results.push((i + 1) + '. Экспорт');
        } else if (/я дома/.test(lower)) {
          atHome = true; goingHome = false;
          results.push((i + 1) + '. Статус: дома');
        } else if (/еду домой|я домой/.test(lower)) {
          goingHome = true; atHome = false;
          results.push((i + 1) + '. Статус: еду домой');
        } else {
          results.push((i + 1) + '. «' + step + '» — выполнено как команда');
          agentReply(step);
        }
      } catch (e) {
        results.push((i + 1) + '. Ошибка: ' + (e.message || e));
      }
    }
    return results;
  }

  function agentReply(text, opts) {
    opts = opts || {};
    const raw = (text || '').trim();
    if (!raw) return;
    agentHistory.push({ role: 'user', text: raw });
    try { agentLog('user', raw); } catch (e) {}
    const lower = normalizeAgentText(raw);
    let reply = '';
    const dayName = d => DAYS_FULL[d] || '?';

    // Калькулятор и быстрые команды (до learned/pending)
    const calc = tryCalculate(raw);
    if (calc) {
      agentHistory.push({ role: 'bot', text: calc.steps });
      trackUsage('calc');
      renderAgent();
      return;
    }
    if (/скрипт\s*помощь|как\s*писать\s*скрипт/.test(lower)) {
      agentHistory.push({ role: 'bot', text: 'Скрипт — несколько команд через «;» (до 30):\nскрипт: проверка дня; автобусы домой; открой сегодня\nГотовые: категория «Скрипты».' });
      renderAgent(); return;
    }
    if (/^калькулятор$/.test(lower)) {
      agentHistory.push({ role: 'bot', text: 'Напиши пример и «=»:\n• 12*8=\n• (3+5)*2=\n• 2^8=\nЧисла и + − * / ( ) ^' });
      renderAgent();
      return;
    }
    if (/проверка дня|проверь день|ежедневн/.test(lower)) {
      agentHistory.push({ role: 'bot', text: dailyCheckReport() });
      trackUsage('daily_check');
      renderAgent();
      return;
    }
    if (/проверь рюкзак|проверка рюкзак|сборк[аи] портфел|всё ли сложен/.test(lower)) {
      agentHistory.push({ role: 'bot', text: dailyCheckReport() });
      trackUsage('pack_check');
      renderAgent();
      return;
    }
    if (/лог внимания|журнал вниман/.test(lower)) {
      agentHistory.push({ role: 'bot', text: getAttentionLogText() });
      renderAgent();
      return;
    }
    if (/лог агента|debug.?log|журнал агента|экспорт.?лог/.test(lower)) {
      const text = getAgentDebugLogText();
      agentHistory.push({
        role: 'bot',
        text: 'Лог агента (последние записи). Можно скопировать и отправить для исправлений:\n\n' + text.slice(0, 3500),
        copyPrompt: text
      });
      renderAgent();
      return;
    }
    if (/очисти лог агента|очистить лог агента/.test(lower)) {
      agentDebugLog = [];
      try { localStorage.removeItem(AGENT_LOG_KEY); } catch (e) {}
      agentHistory.push({ role: 'bot', text: 'Лог агента очищен.' });
      renderAgent();
      return;
    }
    if (/^каникул/.test(lower) || /задания на каникул/.test(lower)) {
      if (!state.holidays.length) {
        agentHistory.push({ role: 'bot', text: 'Каникул нет — добавь в Профиль → Каникулы.' });
      } else {
        const lines = state.holidays.map(h => {
          const tasks = h.tasks || [];
          const done = tasks.filter(t => t.done).length;
          return `• ${h.name}: ${h.start || ''}–${h.end || ''}` + (tasks.length ? ` · ${done}/${tasks.length} заданий` : '');
        });
        agentHistory.push({ role: 'bot', text: 'Каникулы:\n' + lines.join('\n') });
      }
      renderAgent();
      return;
    }
    if (/расписание на |уроки на |что на /.test(lower) || (/^уроки /.test(lower) && parseDayToken(lower) != null)) {
      const d = parseDayToken(lower) ?? todayIndex();
      const list = state.lessons.filter(l => l.day === d).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
      if (!list.length) {
        agentHistory.push({ role: 'bot', text: 'На ' + dayNa(d) + ' уроков нет.' });
      } else {
        agentHistory.push({
          role: 'bot',
          text: '📅 Расписание на ' + dayNa(d) + ':',
          card: {
            type: 'schedule',
            items: list.map(l => ({
              time: (l.start || '?') + '–' + (l.end || '?'),
              title: l.subject || '',
              meta: [l.room, l.teacher].filter(Boolean).join(' · ')
            }))
          }
        });
      }
      try { agentLog('bot', 'schedule ' + dayNa(d)); } catch (e) {}
      trackUsage('show_day');
      renderAgent();
      return;
    }
    if (/удали(ть)?\s+расписание\s+/.test(lower)) {
      const d = parseDayToken(lower);
      if (d != null) {
        const before = state.lessons.length;
        state.lessons = state.lessons.filter(l => l.day !== d);
        save();
        agentHistory.push({ role: 'bot', text: `Удалены уроки ${dayPrep(d)}: ${before - state.lessons.length} шт.` });
      } else {
        agentPending = { type: 'delete_pick' };
        agentHistory.push({ role: 'bot', text: 'Какой день очистить?', choices: DAYS.map((name, i) => ({ label: name, cmd: 'удали расписание на ' + DAYS_NA[i] })) });
      }
      renderAgent();
      return;
    }
    if (/qr\s*приложен|поделиться\s*приложен|ссылка\s*на\s*приложен/.test(lower)) {
      switchTab('profile');
      profileTab = 'qr';
      renderProfile();
      setTimeout(() => document.getElementById('qr-gen-app')?.click(), 200);
      agentHistory.push({ role: 'bot', text: 'Открыл QR приложения — можно отсканировать на другом телефоне.' });
      renderAgent(); return;
    }
    if (/^экспорт$/.test(lower)) {
      try { exportJsonFile(); agentHistory.push({ role: 'bot', text: 'JSON выгружен.' }); }
      catch (e) { agentHistory.push({ role: 'bot', text: 'Не удалось выгрузить.' }); }
      renderAgent();
      return;
    }

    if (/^открой\s+(сегодня|уроки|канбан|рюкзак|автобус|агент|задачи|дневник|заметки|профиль)/.test(lower) || /^вкладка\s+/.test(lower)) {
      const map = {
        сегодня: 'today', уроки: 'schedule', канбан: 'kanban', рюкзак: 'pack',
        автобус: 'buses', автобусы: 'buses', агент: 'agent', задачи: 'tasks',
        дневник: 'diary', заметки: 'notes', профиль: 'profile', ещё: 'profile'
      };
      let tab = null;
      for (const [k, v] of Object.entries(map)) {
        if (lower.includes(k)) { tab = v; break; }
      }
      if (tab) {
        switchTab(tab);
        agentHistory.push({ role: 'bot', text: 'Открыл вкладку.' });
        renderAgent();
        return;
      }
    }
    if (/смени(ть)?\s*тему|переключи\s*тему|тёмн|светл/.test(lower)) {
      toggleTheme();
      agentHistory.push({ role: 'bot', text: 'Тема переключена: ' + (state.settings.theme || 'dark') });
      renderAgent();
      return;
    }
    if (/загрузи(ть)?\s*пример|пример\s*данных/.test(lower)) {
      loadExample();
      agentHistory.push({ role: 'bot', text: 'Пример данных загружен.' });
      renderAgent();
      return;
    }
    if (/скачать\s*шаблон|шаблон\s*excel/.test(lower)) {
      const a = document.createElement('a');
      a.href = 'templates/orbit-import-template.xlsx';
      a.download = 'orbit-import-template.xlsx';
      a.click();
      agentHistory.push({ role: 'bot', text: 'Скачиваю Excel-шаблон. Заполни и перетащи файл в агент.' });
      renderAgent();
      return;
    }
    if (/импорт\s*файл|как\s*импортир|drag/.test(lower)) {
      agentHistory.push({ role: 'bot', text: 'Перетащи файл в зону над чатом или нажми «📎 Файл».\nПоддержка: JSON (база Орбиты), Excel, CSV, TXT.\nМожно несколько файлов сразу.' });
      renderAgent();
      return;
    }

    // Multi-step scripts: "скрипт: проверка дня; автобусы домой; открой сегодня"
    if (/^скрипт\s*:|^macro\s*:|^batch\s*:/i.test(raw) || (raw.includes(';') && raw.split(';').length >= 2 && raw.length < 500)) {
      let body = raw.replace(/^скрипт\s*:|^macro\s*:|^batch\s*:/i, '').trim();
      const steps = body.split(/;|\n|→|->/).map(s => s.trim()).filter(Boolean).slice(0, 30);
      if (steps.length >= 2) {
        agentHistory.push({ role: 'bot', text: 'Запускаю скрипт (' + steps.length + ' шагов)…' });
        renderAgent();
        const results = [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const lower = normalizeAgentText(step);
          try {
            if (/проверка дня/.test(lower)) results.push((i+1) + '. Проверка: OK');
            else if (/автобус/.test(lower)) {
              const mode = /дом|домой/.test(lower) ? 'home' : (/школ/.test(lower) ? 'school' : 'all');
              results.push((i+1) + '. ' + agentBusesReply(mode).split('\n').slice(0, 2).join(' | '));
            } else if (/открой/.test(lower)) {
              const map = { сегодня:'today', уроки:'schedule', автобус:'buses', автобусы:'buses', рюкзак:'pack', задачи:'tasks', агент:'agent', профиль:'profile', канбан:'kanban' };
              let tab = null;
              for (const [k,v] of Object.entries(map)) if (lower.includes(k)) { tab = v; break; }
              if (tab) { switchTab(tab); results.push((i+1) + '. Вкладка ' + tab); }
              else results.push((i+1) + '. ' + step);
            } else if (/смени.*тем|тему/.test(lower)) { toggleTheme(); results.push((i+1) + '. Тема'); }
            else if (/экспорт/.test(lower)) { exportJsonFile(); results.push((i+1) + '. Экспорт'); }
            else if (/я дома/.test(lower)) { atHome = true; goingHome = false; results.push((i+1) + '. Дома'); }
            else if (/еду домой|я домой/.test(lower)) { goingHome = true; atHome = false; results.push((i+1) + '. Еду домой'); }
            else if (/отмен/.test(lower)) { undoLast(1); results.push((i+1) + '. Отмена'); }
            else { results.push((i+1) + '. «' + step + '»'); }
          } catch (e) { results.push((i+1) + '. ошибка'); }
        }
        agentHistory.push({ role: 'bot', text: 'Скрипт готов:\n' + results.join('\n') });
        renderAgent();
        trackUsage('script');
        return;
      }
    }

    // 0) Learned knowledge from IndexedDB
    const learned = (!opts.fromLearned) ? lookupLearned(raw) : null;
    if (learned && !agentPending) {
      // If learned meaning looks like a command, run it
      if (/^(добавь|удали|перенес|очист|покажи|свободн)/i.test(learned)) {
        agentHistory.pop(); // remove this user push; will re-push inside agentReply
        return agentReply(learned, { fromLearned: true });
      }
      reply = learned;
      agentHistory.push({ role: 'bot', text: reply });
      renderAgent();
      return;
    }

    // 1) Pending multi-step dialog — but global commands abort it
    if (agentPending) {
      if (isAbortPendingCommand(lower)) {
        agentPending = null;
        // fall through to normal command handling (re-enter without pending)
        agentHistory.pop(); // remove this user msg; will re-push
        return agentReply(raw);
      }
      const p = agentPending;
      if (/^(отмена|cancel|стоп)([!.\s]*)$/i.test(lower)) {
        agentPending = null;
        reply = 'Отменено.';
      } else if (/^(пропустить|skip|дальше|без)([!.\s]*)$/i.test(lower)) {
        if (p.type === 'add_lesson' && p.step === 'time') {
          // skip room/teacher — finalize not applicable; ask time still required
          reply = 'Время нужно указать — выбери кнопку или напиши ЧЧ:ММ.';
        } else if (p.type === 'learn') {
          agentPending = null;
          reply = 'Пропущено, не запомнил.';
        } else {
          reply = 'Это поле нужно заполнить. Или «отмена».';
        }
      } else if (/^(повтори|ещё раз|еще раз)([!.\s]*)$/i.test(lower)) {
        const last = [...agentHistory].reverse().find(m => m.role === 'bot' && m.text && !m.text.startsWith('🎯'));
        if (last) {
          agentHistory.push({ role: 'bot', text: last.text, choices: last.choices, quickReplies: last.quickReplies, yesNo: last.yesNo, subjects: last.subjects });
          renderAgent(); return;
        }
        reply = 'Нечего повторять.';
      } else if (/^(назад|вернись)([!.\s]*)$/i.test(lower)) {
        if (p.type === 'add_lesson') {
          if (p.step === 'time') { p.step = 'day'; delete p.day;
            agentHistory.push({ role: 'bot', text: 'Ок, снова день для «' + (p.subject||'') + '».', choices: dayChoiceButtons() });
            renderAgent(); return;
          }
          if (p.step === 'day') { p.step = 'subject'; delete p.subject;
            agentHistory.push({ role: 'bot', text: 'Какой предмет?', choices: subjectChoiceButtons() });
            renderAgent(); return;
          }
        }
        if (p.type === 'add_club') {
          if (p.step === 'time') { p.step = 'day';
            agentHistory.push({ role: 'bot', text: 'День для кружка?', choices: dayChoiceButtons() });
            renderAgent(); return;
          }
          if (p.step === 'day') { p.step = 'name';
            agentHistory.push({ role: 'bot', text: 'Как называется кружок?' });
            renderAgent(); return;
          }
        }
        agentPending = null;
        reply = 'Отменено.';
      } else if (p.type === 'add_lesson') {
        if (p.step === 'subject') {
          let subj = resolveSubject(raw);
          if (!subj && raw.trim().length >= 2 && !/^(отмена|нет)$/i.test(raw.trim())) {
            subj = raw.trim().replace(/^./, c => c.toUpperCase());
            rememberSubject(subj);
          }
          if (!subj) {
            agentHistory.push({ role: 'bot', text: 'Какой предмет? Выбери кнопку или напиши свой — запомню.', choices: subjectChoiceButtons() });
            renderAgent();
            return;
          }
          p.subject = subj;
          rememberSubject(subj);
          p.step = 'day';
          agentHistory.push({
            role: 'bot',
            text: '«' + subj + '». На какой день?',
            choices: dayChoiceButtons().concat([{ label: 'Сегодня', cmd: 'сегодня' }, { label: 'Завтра', cmd: 'завтра' }])
          });
          renderAgent();
          return;
        } else if (p.step === 'day') {
          const day = parseDayToken(lower);
          const tm = lower.match(/(\d{1,2})[:\.](\d{2})/);
          if (day != null && tm) {
            const startT = parseValidTime(tm[1] + ':' + tm[2]);
            if (!startT) {
              reply = 'Некорректное время (нужно ЧЧ:ММ, часы 0–23, минуты 0–59).';
            } else {
              const endT = calcEndFromStart(startT);
              const les = { id: uid(), day: day, subject: p.subject, start: startT, end: endT, room: '', teacher: '', items: [] };
              const res = addLessonSafe(les);
              if (!res.ok) {
                agentPending = { type: 'add_conflict', lesson: les, conflicts: res.conflicts };
                reply = res.message;
              } else {
                agentPending = null;
                reply = 'Добавил «' + p.subject + '» ' + dayPrep(day) + ' ' + startT + '–' + endT + '.';
              }
            }
          } else if (day != null) {
            p.day = day;
            p.step = 'time';
            agentHistory.push({
              role: 'bot',
              text: 'Ок, ' + dayPrep(day) + '. Во сколько начало?',
              choices: timeChoiceButtons(day).concat([{ label: 'Своё время', cmd: 'своё время' }])
            });
            renderAgent();
            return;
          } else {
            agentHistory.push({ role: 'bot', text: 'Выбери день:', choices: dayChoiceButtons() });
            renderAgent();
            return;
          }
        } else if (p.step === 'time') {
          if (/своё|другое|сам/.test(lower) && !/\d/.test(lower)) {
            reply = 'Напиши время, например 14:30';
          } else {
            const startT = parseValidTime(raw) || parseValidTime(lower);
            if (!startT) {
              agentHistory.push({ role: 'bot', text: 'Некорректное время. Выбери кнопку или напиши ЧЧ:ММ (часы 0–23).', choices: timeChoiceButtons(p.day) });
              renderAgent();
              return;
            }
            const endT = calcEndFromStart(startT);
            const les = { id: uid(), day: p.day, subject: p.subject, start: startT, end: endT, room: '', teacher: '', items: [] };
            const res = addLessonSafe(les);
            if (!res.ok) {
              agentPending = { type: 'add_conflict', lesson: les, conflicts: res.conflicts };
              reply = res.message;
            } else {
              agentPending = null;
              reply = 'Готово: «' + p.subject + '» ' + dayPrep(p.day) + ' ' + startT + '–' + endT + '.';
            }
          }
        }
      } else if (p.type === 'add_club') {
        if (p.step === 'name') {
          const name = raw.trim();
          if (name.length < 2) {
            reply = 'Как называется кружок?';
          } else {
            p.name = name;
            p.step = 'day';
            agentHistory.push({ role: 'bot', text: '«' + name + '». В какой день?', choices: dayChoiceButtons() });
            renderAgent();
            return;
          }
        } else if (p.step === 'day') {
          const day = parseDayToken(lower);
          if (day == null) {
            agentHistory.push({ role: 'bot', text: 'Выбери день:', choices: dayChoiceButtons() });
            renderAgent();
            return;
          }
          p.day = day;
          p.step = 'time';
          agentHistory.push({ role: 'bot', text: 'Кружок ' + dayPrep(day) + '. Время начала?', choices: timeChoiceButtons(day) });
          renderAgent();
          return;
        } else if (p.step === 'time') {
          const startT = parseValidTime(raw) || parseValidTime(lower);
          if (!startT) {
            agentHistory.push({ role: 'bot', text: 'Некорректное время. Выбери или напиши ЧЧ:ММ:', choices: timeChoiceButtons(p.day) });
            renderAgent();
            return;
          }
          const sMin = parseTime(startT);
          const endClub = sMin != null ? formatTime(sMin + 90) : (typeof calcEndFromStart === 'function' ? calcEndFromStart(startT) : startT);
          state.clubs.push({ id: uid(), day: p.day, name: p.name, start: startT, end: endClub, place: '', teacher: '', items: [], notes: '' });
          save();
          agentPending = null;
          reply = 'Кружок «' + p.name + '» ' + dayPrep(p.day) + ' ' + startT + '–' + endClub + '.';
        }
      } else if (p.type === 'confirm_wipe') {
        if (/^(да|yes|удали|подтверж)/i.test(lower)) {
          const k = p.kind;
          agentPending = null;
          doWipe(k);
          reply = 'Готово.';
        } else {
          agentPending = null;
          reply = 'Отменено.';
        }
      } else if (p.type === 'delete_pick') {
        if (/всю\s*недел|все\s*дни|всё\s*расписан|расписание/.test(lower)) {
          const n = state.lessons.length + state.clubs.length + (state.events||[]).length;
          state.lessons = []; state.clubs = []; state.events = [];
          save(); agentPending = null;
          reply = `Удалено всё расписание (${n}).`;
        } else {
          // parse multiple days
          const days = [];
          const parts = lower.split(/[\s,]+/);
          for (const part of parts) {
            const d = parseDayToken(part);
            if (d != null && !days.includes(d)) days.push(d);
          }
          if (!days.length) {
            reply = 'Укажи день (пн…вс), несколько дней или «всю неделю».';
          } else {
            let removed = 0;
            days.forEach(d => {
              const before = state.lessons.length;
              state.lessons = state.lessons.filter(l => l.day !== d);
              removed += before - state.lessons.length;
            });
            save(); agentPending = null;
            reply = `Удалено уроков: ${removed} (${days.map(dayName).join(', ')}).`;
          }
        }
      } else if (p.type === 'add_conflict') {
        if (/замен/.test(lower)) {
          p.conflicts.forEach(c => { state.lessons = state.lessons.filter(l => l.id !== c.id); });
          const res = addLessonSafe(p.lesson);
          agentPending = null;
          reply = res.ok ? `Заменил. Теперь «${p.lesson.subject}» ${p.lesson.start}–${p.lesson.end}.` : res.message;
        } else if (/другое|изменить время|другое время/.test(lower)) {
          agentPending = { type: 'add_lesson', step: 'time', subject: p.lesson.subject, day: p.lesson.day };
          reply = 'Напиши новое время начала, например 9:20';
        } else {
          reply = 'Напиши «заменить», «другое время» или «отмена».';
        }
      } else if (p.type === 'learn') {
        if (isAbortPendingCommand(lower) || /^(привет|здравств|хай|hello|отмена|нет)$/i.test(lower)) {
          agentPending = null;
          agentHistory.pop();
          return agentReply(raw);
        }
        if (/^(добавь|удали|перенес|очист|покажи|открой|автобус|проверка|лог)/i.test(lower) || resolveSubject(raw)) {
          agentPending = null;
          agentHistory.pop();
          return agentReply(raw);
        }
        if (raw.trim().length < 2) {
          reply = 'Напиши, что означала фраза, или «отмена».';
        } else {
          saveAgentKnowledge(p.phrase, raw);
          agentPending = null;
          reply = 'Запомнил: «' + p.phrase + '» → «' + raw + '». В следующий раз пойму.';
        }
      } else if (p.type === 'ai_apply') {
        // user pastes response from external neural net - try to execute as command or store
        agentPending = null;
        if (/^(добавь|удали|перенес|очист|покажи)/i.test(raw) || resolveSubject(raw)) {
          agentHistory.pop();
          return agentReply(raw);
        }
        reply = 'Принял ответ нейросети. Если это команда — сформулируй её явно («добавь урок…»).';
      } else {
        agentPending = null;
        reply = 'Диалог сброшен. Напиши команду заново.';
      }
      agentHistory.push({ role: 'bot', text: reply });
      if (agentHistory.length > 50) agentHistory = agentHistory.slice(-40);
      renderAgent();
      return;
    }

    // 2a) Greetings & chitchat — never create lessons
    if (/^(привет|здравствуй|здравствуйте|хай|hello|hi|ку|йо)[\s\!\.]*$/i.test(raw.trim()) || /^(спасибо|пока|добрый день|доброе утро|добрый вечер)[\s\!\.]*$/i.test(raw.trim())) {
      reply = `Привет${state.profile.name ? ', ' + state.profile.name : ''}! Я Агент Орбита.\nМогу: уроки, автобусы, ДЗ, дни рождения.\nНапиши «помощь» или «автобусы сейчас».`;
      agentHistory.push({ role: 'bot', text: reply });
      renderAgent();
      return;
    }

    // 2) Short subject-only or "X добавь" after context
    const addOnly = /^(добавь|добавить|добавь урок|\+ урок|\+)$/i.test(raw);
    const subjectOnly = resolveSubject(raw);
    const invertedAdd = lower.match(/^(.*?)\s+(добавь|добавить)$/);
    const shortAdd = lower.match(/^(добавь|добавить)\s+(.+)$/);

    if (addOnly) {
      agentPending = { type: 'add_lesson', step: 'subject' };
      reply = 'Какой предмет добавить?\nНапиши или сокращение: мат, рус, физра, окруж, лит, муз, тех, изо…\nНиже можно выбрать из списка — отправь название.';
      // show subjects as chips via special message
      agentHistory.push({ role: 'bot', text: reply, subjects: true });
      renderAgent();
      return;
    }

    if (invertedAdd) {
      const subj = resolveSubject(invertedAdd[1]);
      if (subj) {
        agentPending = { type: 'add_lesson', step: 'day', subject: subj };
        reply = `«${subj}». На какой день и во сколько?\nПример: «пн 8:30» или «сегодня»`;
        agentHistory.push({ role: 'bot', text: reply });
        renderAgent();
        return;
      }
    }

    if (shortAdd && !/урок|кружок|событие|дз|домашк|заметк|автобус|цель/.test(shortAdd[2])) {
      const subj = resolveSubject(shortAdd[2]);
      if (subj && !parseDayToken(shortAdd[2])) {
        agentPending = { type: 'add_lesson', step: 'day', subject: subj };
        reply = `«${subj}». День и время?\nПример: «пн 8:30» · «завтра 9:00»`;
        agentHistory.push({ role: 'bot', text: reply });
        renderAgent();
        return;
      }
    }

    // bare subject word while not pending - offer to add
    if (subjectOnly && raw.length < 40 && !/удали|очист|убери|перенес|покажи|сколько|что|когда|помощь|добавь|нагрузк|свободн|статистик|я домой|закончил|привет|здравств|хай|hello|спасибо|автобус|маршрут|домашк|др|день рожден/.test(lower)) {
      agentPending = { type: 'add_lesson', step: 'day', subject: subjectOnly };
      reply = `Добавить «${subjectOnly}»?\nНапиши день и время: «пн 8:30» или «отмена»`;
      agentHistory.push({ role: 'bot', text: reply });
      renderAgent();
      return;
    }

    // 3) Structured full commands (existing patterns) — continue with previous logic
    const intent = matchIntent(raw);

    // FULL RESET
    if (/очисти\s*все|полный\s*сброс|удали\s*все\s*данные|сброс\s*приложен|обнули/.test(lower)) {
      state = migrate({}); save(); applyTheme();
      reply = 'Полный сброс выполнен. Все данные удалены.';

    } else if (/очисти\s*расписан|удали\s*все\s*расписан/.test(lower)) {
      const n = state.lessons.length + state.clubs.length + (state.events || []).length;
      state.lessons = []; state.clubs = []; state.events = []; save();
      reply = `Расписание очищено (${n} записей).`;

    } else if (/удали\s*все\s*уроки(?!\s*в)/.test(lower) && parseDayToken(lower) == null) {
      const n = state.lessons.length; state.lessons = []; save();
      reply = `Удалено уроков: ${n}.`;

    } else if (/удали\s*все\s*автобус|очисти\s*автобус|очисти\s*список\s*автобус/.test(lower)) {
      agentPending = { type: 'confirm_wipe', kind: 'buses' };
      agentHistory.push({ role: 'bot', text: 'Удалить все автобусы (' + state.buses.length + ')?', yesNo: true });
      renderAgent(); return;
    } else if (/удали\s*всех\s*людей|очисти\s*людей/.test(lower)) {
      agentPending = { type: 'confirm_wipe', kind: 'people' };
      agentHistory.push({ role: 'bot', text: 'Удалить всех людей (' + state.people.length + ')?', yesNo: true });
      renderAgent(); return;
    } else if (/удали\s*все\s*кружк/.test(lower)) {
      const n = state.clubs.length; state.clubs = []; save();
      reply = `Удалено кружков: ${n}.`;

    } else if (/удали\s*всю\s*домашк|очисти\s*домашк|удали\s*все\s*дз/.test(lower)) {
      const n = state.homework.length; state.homework = []; save();
      reply = `Домашка очищена (${n}).`;

    } else if (/удали\s*все\s*заметк|очисти\s*заметк/.test(lower)) {
      const n = state.notes.length; state.notes = []; save();
      reply = `Заметки удалены (${n}).`;

    } else if (/^удали\s*день$|^удалить\s*день$|удали\s*(все\s*)?уроки\s*в\s*|очисти\s*день/.test(lower)) {
      const d = parseDayToken(lower);
      if (d != null) {
        const before = state.lessons.length;
        state.lessons = state.lessons.filter(l => l.day !== d);
        const clubsN = state.clubs.filter(c => c.day === d).length;
        if (/и\s*кружк|все/.test(lower)) state.clubs = state.clubs.filter(c => c.day !== d);
        save();
        reply = `С ${dayName(d)} удалено уроков: ${before - state.lessons.length}.`;
      } else {
        agentPending = { type: 'delete_pick' };
        agentHistory.push({
          role: 'bot',
          text: 'Что удалить?',
          choices: dayChoiceButtons().concat([
            { label: 'Всю неделю', cmd: 'всю неделю' },
            { label: 'Всё расписание', cmd: 'расписание' },
            { label: 'Отмена', cmd: 'отмена' }
          ])
        });
        renderAgent();
        return;
      }

    } else if (/удали\s*(все\s*)?уроки?\s+/.test(lower)) {
      const m = lower.match(/удали\s*(?:все\s*)?уроки?\s+(.+)/);
      let subject = m ? m[1].trim() : '';
      const d = parseDayToken(subject);
      subject = subject.replace(/в\s+(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|сегодня|завтра).*$/i, '').trim();
      const resolved = resolveSubject(subject) || subject;
      if (resolved) {
        const before = state.lessons.length;
        const key = resolved.toLowerCase();
        state.lessons = state.lessons.filter(l => {
          if (!(l.subject || '').toLowerCase().includes(key) && resolveSubject(l.subject) !== resolved) return true;
          if (d != null && l.day !== d) return true;
          return false;
        });
        const removed = before - state.lessons.length;
        save();
        reply = removed ? `Удалено «${resolved}»: ${removed}.` : `Уроков «${resolved}» не найдено.`;
      } else reply = 'Формат: «удали урок математика»';

    } else if (/перенес|перемест|перекинь|сдвинь/.test(lower)) {
      const fromM = lower.match(/с\s+(\S+)/);
      const toM = lower.match(/на\s+(\S+)/);
      const fromD = fromM ? parseDayToken(fromM[1]) : null;
      const toD = toM ? parseDayToken(toM[1]) : null;
      let subject = '';
      const sm = lower.match(/(?:перенес\w*|перемест\w*|перекинь|сдвинь)\s+(?:все\s+уроки\s+)?(.+?)\s+с\s+/);
      if (sm) {
        subject = sm[1].replace(/все\s+уроки\s*/g, '').trim();
        if (subject === 'все' || subject === 'уроки') subject = '';
      }
      const resolved = subject ? (resolveSubject(subject) || subject) : '';
      if (fromD != null && toD != null) {
        let moved = 0;
        state.lessons.forEach(l => {
          if (l.day !== fromD) return;
          if (resolved && !(l.subject || '').toLowerCase().includes(resolved.toLowerCase()) && resolveSubject(l.subject) !== resolved) return;
          l.day = toD; moved++;
        });
        if (!resolved) state.clubs.forEach(c => { if (c.day === fromD) { c.day = toD; moved++; } });
        save();
        reply = moved ? `Перенесено ${moved} с ${dayName(fromD)} → ${dayName(toD)}.` : `Нечего переносить с ${dayName(fromD)}.`;
      } else reply = 'Формат: «перенеси математику с пн на вт»';

    } else if (/добавь?\s+урок|добавить\s+урок|новый\s+урок|создай\s+урок/.test(lower)) {
      const m = lower.match(/(?:добавь?|добавить|создай|новый)\s+урок\s+(.+?)\s+(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|сегодня|завтра)\s+(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?/i);
      if (m) {
        const day = parseDayToken(m[2]);
        let start = m[3].length === 4 ? '0' + m[3] : m[3];
        let end = m[4] ? (m[4].length === 4 ? '0' + m[4] : m[4]) : calcEndFromStart(start);
        let subj = resolveSubject(m[1].trim()) || m[1].trim().replace(/^./, c => c.toUpperCase());
        const les = { id: uid(), day, subject: subj, start, end, room: '', teacher: '', items: [] };
        const res = addLessonSafe(les);
        if (!res.ok) {
          agentPending = { type: 'add_conflict', lesson: les, conflicts: res.conflicts };
          reply = res.message;
        } else {
          reply = `Добавил «${subj}» на ${dayName(day)} ${start}–${end}.`;
        }
      } else {
        // partial "добавь урок X" without day
        const m2 = lower.match(/(?:добавь?|добавить)\s+урок\s+(.+)/i);
        if (m2) {
          const subj = resolveSubject(m2[1]);
          if (subj) {
            agentPending = { type: 'add_lesson', step: 'day', subject: subj };
            reply = `«${subj}». День и время? Пример: «пн 8:30»`;
          } else {
            agentPending = { type: 'add_lesson', step: 'subject' };
            reply = 'Какой предмет? (мат, рус, физра…)';
          }
        } else {
          agentPending = { type: 'add_lesson', step: 'subject' };
          reply = `Выбери предмет (мат, физра, рус…) или напиши полностью.\nКонец урока = +${getLessonDuration()} мин.`;
        }
      }

    } else if (/добавь?\s+кружок|добавить\s+кружок/.test(lower)) {
      const m = lower.match(/добавь?\s+кружок\s+(.+?)\s+(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\s+(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?/i);
      if (m) {
        const day = parseDayToken(m[2]);
        let start = m[3].length === 4 ? '0' + m[3] : m[3];
        let end = m[4] ? (m[4].length === 4 ? '0' + m[4] : m[4]) : addMinutesToTime(start, 90);
        state.clubs.push({ id: uid(), day: day, name: m[1].trim(), start: start, end: end, place: '', teacher: '', items: [], notes: '' });
        save();
        reply = 'Кружок «' + m[1].trim() + '» ' + dayPrep(day) + ' ' + start + '–' + end + '.';
      } else {
        agentPending = { type: 'add_club', step: 'name' };
        agentHistory.push({ role: 'bot', text: 'Как называется кружок?' });
        renderAgent();
        return;
      }

    } else if (/добавь?\s+событие|добавить\s+событие/.test(lower)) {
      const m = lower.match(/добавь?\s+событие\s+(.+?)\s+(пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\s+(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?/i);
      if (m) {
        const day = parseDayToken(m[2]);
        let start = m[3].length === 4 ? '0' + m[3] : m[3];
        let end = m[4] ? (m[4].length === 4 ? '0' + m[4] : m[4]) : calcEndFromStart(start);
        if (!state.events) state.events = [];
        state.events.push({ id: uid(), day, title: m[1].trim().replace(/^./, c => c.toUpperCase()), start, end, place: '', notes: '' });
        save();
        reply = `Событие на ${dayName(day)} ${start}–${end}.`;
      } else reply = 'Формат: «добавь событие Собрание пт 14:00»';

    } else if (/свободн|окна|когда свободен/.test(lower)) {
      const day = parseDayToken(lower) ?? todayIndex();
      const free = calcFreeMinutes(day);
      const gap = Number(state.settings.afterSchoolGapMin) || 30;
      reply = `${dayName(day)}: ≈ ${Math.floor(free / 60)}ч ${free % 60}м свободно между уроками.\nОкно после уроков до продлёнки (настройка): ~${gap} мин.`;

    } else if (/нагрузк|сколько часов|занятость/.test(lower)) {
      let lines = [], total = 0;
      for (let d = 0; d < 7; d++) {
        let min = 0;
        [...state.lessons.filter(l => l.day === d), ...state.clubs.filter(c => c.day === d)].forEach(x => {
          const s = parseTime(x.start), e = parseTime(x.end);
          if (s != null && e != null) min += e - s;
        });
        total += min; lines.push(`${DAYS[d]}: ${(min / 60).toFixed(1)}ч`);
      }
      reply = `Нагрузка (всего ${(total / 60).toFixed(1)} ч):\n` + lines.join('\n');

    } else if (/что взять|рюкзак|собрать|вещи на/.test(lower)) {
      let day = todayIndex();
      if (/завтра/.test(lower)) day = (day + 1) % 7;
      else { const d = parseDayToken(lower); if (d != null) day = d; }
      const items = new Set();
      state.lessons.filter(l => l.day === day).forEach(l => (l.items || []).forEach(i => items.add(i)));
      state.clubs.filter(c => c.day === day).forEach(c => (c.items || []).forEach(i => items.add(i)));
      reply = items.size ? `На ${dayName(day).toLowerCase()}:\n` + [...items].map(i => '• ' + i).join('\n') : `Список вещей пуст.`;

    } else if (/покажи\s*уроки|какие\s*уроки|расписание\s*на|уроки\s*в|что\s*сегодня|что\s*завтра/.test(lower)) {
      const d = parseDayToken(lower) ?? todayIndex();
      const list = state.lessons.filter(l => l.day === d).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      if (!list.length) reply = 'На ' + dayName(d) + ' уроков нет.';
      else {
        agentHistory.push({
          role: 'bot',
          text: '📅 Расписание на ' + dayNa(d) + ':',
          card: {
            type: 'schedule',
            items: list.map(l => ({
              time: (l.start || '?') + '–' + (l.end || '?'),
              title: l.subject || '',
              meta: [l.room, l.teacher].filter(Boolean).join(' · ')
            }))
          }
        });
        renderAgent();
        return;
      }

    } else if (/^(сейчас|далее)([!.\s]*)$/i.test(lower) || /следующий урок|какой сейчас|сейчас урок|что дальше|ближайший урок|что сейчас/.test(lower)) {
      const day = todayIndex();
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const all = state.lessons.filter(l => l.day === day).map(x => ({ ...x, title: x.subject, s: parseTime(x.start), e: parseTime(x.end) }))
        .filter(x => x.s != null).sort((a, b) => a.s - b.s);
      const cur = all.find(x => x.s <= nowMin && (x.e == null || x.e > nowMin));
      const next = all.find(x => x.s > nowMin);
      if (cur) reply = `Сейчас: ${cur.title} (до ${formatTime(cur.e)}).` + (next ? `\nДальше: ${next.title} в ${formatTime(next.s)}.` : '');
      else if (next) reply = `Дальше: ${next.title} в ${formatTime(next.s)}.`;
      else reply = 'На сегодня больше уроков нет.';

    } else if (/домашк|дз|задания/.test(lower) && !/удали|очисти|добавь/.test(lower)) {
      const pending = state.homework.filter(h => !h.done);
      reply = pending.length ? 'Открытая домашка:\n' + pending.map(h => `• ${h.title}`).join('\n') : 'Домашки нет.';

    } else if (/статистика|сколько уроков|сводка/.test(lower)) {
      reply = `Уроков: ${state.lessons.length}, кружков: ${state.clubs.length}, автобусов: ${state.buses.length}, ДЗ: ${state.homework.filter(h=>!h.done).length}`;

    } else if (/список предметов|какие предметы|предметы|сокращения/.test(lower)) {
      reply = 'Предметы и сокращения:\n' + Object.entries(SUBJECT_ALIASES)
        .reduce((acc, [a, f]) => { if (!acc.find(x => x.f === f)) acc.push({ a, f }); return acc; }, [])
        .map(({ a, f }) => `• ${f} — ${a}`).slice(0, 25).join('\n');

    } else if (/заполни день|типовой день|стандартное расписание/.test(lower)) {
      const d = parseDayToken(lower) ?? todayIndex();
      const base = state.settings.dayStart || '08:30';
      const template = ['Разговоры о важном','Русский язык','Математика','Окружающий мир','Литературное чтение','Физкультура'];
      let t = base, added = 0;
      template.forEach((subj, i) => {
        if (subj === 'Разговоры о важном' && d !== 0) return;
        const start = t, end = calcEndFromStart(start);
        state.lessons.push({ id: uid(), day: d, subject: subj, start, end, room: '', teacher: '', items: [] });
        t = addMinutesToTime(end, getBreakDuration(i + 1));
        added++;
      });
      save();
      reply = `Добавлено ${added} уроков на ${dayName(d)} с ${base}.`;

    } else if (/тёмн(ая|ую)\s*тем|темн(ая|ую)\s*тем/.test(lower)) {
      state.settings.theme = 'dark'; applyTheme(); save(); reply = 'Тёмная тема.';
    } else if (/светл(ая|ую)\s*тем/.test(lower)) {
      state.settings.theme = 'light'; applyTheme(); save(); reply = 'Светлая тема.';

    } else if (/длительность урока|уроки по\s*\d+|минуты урока/.test(lower)) {
      const m = lower.match(/(\d{2,3})\s*мин/);
      if (m) { state.settings.lessonDuration = +m[1]; save(); reply = `Урок = ${m[1]} мин.`; }
      else reply = `Сейчас урок = ${getLessonDuration()} мин. Скажи: «длительность урока 45 мин»`;

    } else if (/помощь|help|что умеешь|команды|справка|функции/.test(lower)) {
      reply = `Пиши коротко: «добавь», «физра», «мат», «русский добавь».\nПолностью: «добавь урок Математика пн 8:30»\nУдалить / перенести / очистить — как раньше.\n«сокращения» — список предметов.\nЕсли не пойму — дам текст для нейросети.`;

    } else if (/очистить историю|сброс чата|очисти чат/.test(lower)) {
      agentHistory = []; agentPending = null; reply = 'Чат очищен.';

    } else if (/^удали$|^удалить$|^удали\s*уроки$/.test(lower)) {
      agentPending = { type: 'delete_pick' };
      reply = 'Что удалить?\n• день: «пн»\n• несколько: «пн вт ср»\n• «всю неделю»\n• «расписание» — всё\n• «отмена»';
    } else if (/^отмен|undo|назад\s*\d*|верн[иу]\s*шаг/.test(lower)) {
      const m = lower.match(/(\d+)/);
      const steps = m ? Math.min(5, Math.max(1, +m[1])) : 1;
      undoLast(steps);
      reply = undoStack.length ? `Готово. Ещё можно отменить шагов: ${undoStack.length}.` : 'Отменено. История пуста.';
    } else if (/я дома|уже дома|приехал домой/.test(lower)) {
      atHome = true; goingHome = false;
      const now = new Date();
      const time = formatTime(now.getHours() * 60 + now.getMinutes());
      homeLogs.push({ ts: Date.now(), time, date: now.toISOString().slice(0, 10) });
      try { localStorage.setItem('orbit-home-logs', JSON.stringify(homeLogs)); } catch (e) {}
      reply = `Отметил: дома в ${time}. Автобусы скрыты.`;
    } else if (/я домой|я поехал|закончил|я закончил|поехал домой|еду домой/.test(lower)) {
      goingHome = true; atHome = false;
      const buses = getRelevantBuses(new Date().getHours()*60+new Date().getMinutes(), 'home', 3);
      reply = 'Режим «еду домой». Ближайшие:\n' + (buses.map(b => `• №${b.number} в ${b.time}`).join('\n') || '• нет рейсов на 2 ч');
    } else if (/вернуть день|вернуть расписание|не домой|сброс дома/.test(lower)) {
      goingHome = false; atHome = false;
      reply = 'Снова обычный день.';
    } else if (/автобус|рейс|маршрут/.test(lower)) {
      let mode = 'all';
      if (/дом|домой|рейзин|из школы/.test(lower)) mode = 'home';
      else if (/школ|в школу|на учёбу/.test(lower)) mode = 'school';
      const numM = lower.match(/№?\s*(\d{2,4})/);
      if (numM) {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        let buses = state.buses.filter(b => (b.number || '') === numM[1] && (parseTime(b.time) || 0) >= nowMin - 2)
          .sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 8);
        reply = buses.length ? ('№' + numM[1] + ':\n' + formatBusAgentList(buses, nowMin)) : ('Рейсов №' + numM[1] + ' на сегодня больше нет.');
      } else {
        {
        const busText = agentBusesReply(mode);
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const modeKey = mode === 'school' || mode === 'morning' ? 'school' : (mode === 'home' ? 'home' : 'all');
        let buses = getRelevantBuses(nowMin, modeKey, 8);
        if (!buses.length && (modeKey === 'school' || modeKey === 'home')) {
          buses = getRelevantBuses(0, modeKey, 8, { allowPast: true, horizon: 24 * 60 });
        }
        if (buses.length) {
          agentHistory.push({
            role: 'bot',
            text: modeKey === 'school' ? '🚌 Автобусы в школу:' : modeKey === 'home' ? '🚌 Автобусы домой:' : '🚌 Автобусы:',
            card: {
              type: 'buses',
              items: buses.map(b => {
                const t = parseTime(b.time);
                const walk = Number(b.walkMin) || 0;
                const leave = t != null ? t - walk - nowMin : null;
                const route = (b.from && b.to) ? (b.from + ' → ' + b.to) : (b.to || b.from || '');
                return {
                  time: b.time || '?',
                  title: '№' + (b.number || '?'),
                  meta: (leave != null ? 'выйти через ' + formatDurationMin(leave) + ' · ' : '') + route
                };
              })
            }
          });
          renderAgent();
          return;
        }
        reply = busText;
      }
      }
    } else if (/день\s*рожден|\bдр\b|именин/.test(lower)) {
      const upcoming = (state.people || []).filter(p => p.birthday).map(p => {
        const delta = daysUntilBirthday(p.birthday);
        return { name: p.name, birthday: p.birthday, delta: delta == null ? 9999 : delta };
      }).filter(u => u.delta < 9999).sort((a, b) => a.delta - b.delta);
      if (!upcoming.length) reply = 'Нет дней рождения в списке «Люди».';
      else {
        const soon = upcoming.filter(u => u.delta <= 30);
        const list = (soon.length ? soon : upcoming.slice(0, 5));
        reply = (soon.length ? 'Скоро ДР:\n' : 'Ближайшие ДР:\n') + list.map(u => {
          const when = u.delta === 0 ? ' (сегодня!)' : u.delta === 1 ? ' (завтра)' : ' через ' + u.delta + ' дн.';
          return '• ' + u.name + ' — ' + String(u.birthday).slice(0, 10) + when;
        }).join('\n');
      }
    } else if (/привет|здравств|хай|hello/.test(lower)) {
      reply = `Привет${state.profile.name ? ', ' + state.profile.name : ''}! Напиши «добавь» или «мат» — помогу.`;

    } else {
      // Known short commands that must not open learn
      if (/^(сейчас|далее|нагрузка|помощь|help|лог|статистика|домашка|дз|автобусы?|уроки?)$/i.test(lower.trim())) {
        reply = 'Попробуй точнее: «сейчас урок», «нагрузка недели», «автобусы домой», «помощь».';
        agentLog('bot', reply);
        agentHistory.push({ role: 'bot', text: reply });
        renderAgent();
        return;
      }
      // FALLBACK: offer learn + copy for external AI
      agentPending = { type: 'learn', phrase: raw };
      const aiPrompt = 'Ты помогаешь школьному планеру «Орбита». Пользователь написал: «' + raw + '».\nПерефразируй в одну чёткую команду на русском.\nОтветь ТОЛЬКО текстом команды.';
      reply = 'Не понял «' + raw + '».\n\n1) Напиши, что это значит — запомню.\n2) Или скопируй промпт в нейросеть:\n\n---\n' + aiPrompt + '\n---';
      agentLog('bot', reply.slice(0, 300));
      agentHistory.push({ role: 'bot', text: reply, copyPrompt: aiPrompt });
      renderAgent();
      return;
    }

    if (reply) agentLog('bot', reply.slice(0, 300));
    agentHistory.push({ role: 'bot', text: reply });
    if (agentHistory.length > 50) agentHistory = agentHistory.slice(-40);
    try {
      if (agentPending) localStorage.setItem('orbit-agent-pending', JSON.stringify(agentPending));
      else localStorage.removeItem('orbit-agent-pending');
    } catch (e) {}
    renderAgent();
  }

  function safeAgentReply(text) {
    try { agentReply(text); }
    catch (err) {
      try { agentLog('error', String(err && err.message || err)); } catch (e) {}
      agentHistory.push({ role: 'bot', text: 'Ошибка агента: ' + (err && err.message ? err.message : String(err)) + '\nНапиши «лог агента» и скопируй для отладки.' });
      renderAgent();
    }
  }
  document.getElementById('agent-send').addEventListener('click', () => {
    const input = document.getElementById('agent-input');
    const t = input.value.trim(); if (!t) return;
    input.value = '';
    renderLiveChips([]);
    agentReply(t);
  });

  // ─── Agent file import (drag & drop + picker) ───
  function agentImportJsonText(text, fileName) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('Не объект');
      // Merge or replace?
      const keys = ['lessons','clubs','buses','homework','goals','notes','people','holidays','events','dayLogs','packChecks'];
      let added = [];
      if (data.profile) {
        state.profile = Object.assign({}, state.profile, data.profile);
        added.push('профиль');
      }
      if (data.settings) {
        state.settings = Object.assign({}, state.settings, data.settings);
        added.push('настройки');
      }
      keys.forEach(k => {
        if (Array.isArray(data[k]) && data[k].length) {
          // merge by id if possible, else append
          const existing = state[k] || [];
          const ids = new Set(existing.map(x => x.id).filter(Boolean));
          const fresh = data[k].map(item => {
            const copy = Object.assign({}, item);
            if (!copy.id) copy.id = uid();
            if (ids.has(copy.id)) copy.id = uid();
            return copy;
          });
          state[k] = existing.concat(fresh);
          added.push(k + ' +' + fresh.length);
        }
      });
      if (data.version && !added.length) {
        // full state-like file
        state = migrate(data);
        added.push('полная база');
      }
      save();
      applyTheme();
      render();
      return 'Импорт «' + (fileName || 'JSON') + '»: ' + (added.join(', ') || 'данных не найдено') + '.';
    } catch (e) {
      return 'Не удалось разобрать JSON: ' + (e.message || e);
    }
  }

  async function agentHandleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    agentHistory.push({ role: 'user', text: '📎 ' + files.map(f => f.name).join(', ') });
    agentHistory.push({ role: 'bot', text: '⏳ Обрабатываю ' + files.length + ' файл(ов)…' });
    renderAgent();
    agentLog('import_start', files.map(f => f.name).join(', '));
    const results = [];
    for (const file of files) {
      const name = file.name || 'file';
      const lower = name.toLowerCase();
      try {
        if (/\.json$/i.test(lower) || file.type === 'application/json') {
          const text = await file.text();
          results.push(agentImportJsonText(text, name));
        } else if (/\.txt$/i.test(lower) || file.type === 'text/plain') {
          const text = await file.text();
          // try JSON first
          if (text.trim().startsWith('{')) {
            results.push(agentImportJsonText(text, name));
          } else {
            // treat as homework lines or notes
            const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
            lines.forEach(line => {
              state.notes.push({ id: uid(), title: 'Импорт ' + name, body: line, created: Date.now(), updated: Date.now() });
            });
            save();
            results.push('Текст «' + name + '»: ' + lines.length + ' заметок.');
          }
        } else if (/\.csv$/i.test(lower) || file.type === 'text/csv') {
          if (typeof XLSX === 'undefined') {
            results.push('CSV: нужен модуль XLSX');
            continue;
          }
          const text = await file.text();
          const wb = XLSX.read(text, { type: 'string' });
          wb.SheetNames.forEach(sn => applySheetRows(sn, sheetToObjects(wb.Sheets[sn])));
          save(); render();
          results.push('CSV «' + name + '» импортирован (' + wb.SheetNames.join(', ') + ').');
        } else if (/\.xlsx?$/i.test(lower)) {
          if (typeof XLSX === 'undefined') {
            results.push('Excel: нужен модуль XLSX');
            continue;
          }
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          wb.SheetNames.forEach(sn => applySheetRows(sn, sheetToObjects(wb.Sheets[sn])));
          save(); render();
          results.push('Excel «' + name + '» импортирован: ' + wb.SheetNames.join(', '));
        } else {
          results.push('«' + name + '»: формат не поддерживается. Нужны JSON, CSV, Excel, TXT.');
        }
      } catch (e) {
        results.push('«' + name + '»: ошибка — ' + (e.message || e));
      }
    }
    // remove loading placeholder
    if (agentHistory.length && agentHistory[agentHistory.length - 1].text && agentHistory[agentHistory.length - 1].text.indexOf('⏳') === 0) {
      agentHistory.pop();
    }
    agentHistory.push({
      role: 'bot',
      text: results.join('\n'),
      choices: [
        { label: 'Проверка дня', cmd: 'проверка дня' },
        { label: 'Уроки сегодня', cmd: 'уроки сегодня' },
        { label: 'Автобусы', cmd: 'автобусы сейчас' }
      ]
    });
    agentLog('import_done', results.join(' | ').slice(0, 200));
    trackUsage('import_file');
    renderAgent();
  }

  function setupAgentDrop() {
    const zone = document.getElementById('agent-drop');
    const input = document.getElementById('agent-file-input');
    const btn = document.getElementById('agent-file-btn');
    if (!zone || zone.dataset.ready) return;
    zone.dataset.ready = '1';
    btn?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      if (input.files?.length) agentHandleFiles(input.files);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev => {
      zone.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(ev => {
      zone.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
      });
    });
    zone.addEventListener('drop', e => {
      const files = e.dataTransfer?.files;
      if (files?.length) agentHandleFiles(files);
    });
    // whole agent tab as secondary drop target
    const tab = document.getElementById('tab-agent');
    tab?.addEventListener('dragover', e => { e.preventDefault(); });
    tab?.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) agentHandleFiles(e.dataTransfer.files);
    });
  }


  document.getElementById('agent-input')?.addEventListener('input', onAgentInputLive);
  document.getElementById('agent-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      renderLiveChips([]);
      e.target.value = '';
    }

    if (e.key === 'Enter') document.getElementById('agent-send').click();
  });
  document.getElementById('agent-suggestions')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (chip) agentReply(chip.dataset.cmd);
  });
  document.getElementById('agent-cats')?.addEventListener('click', e => {
    const cat = e.target.closest('.agent-cat');
    if (!cat) return;
    document.querySelectorAll('#agent-cats .agent-cat').forEach(c => c.classList.toggle('active', c === cat));
    const key = cat.dataset.cat;
    document.querySelectorAll('#agent-suggestions .chip').forEach(chip => {
      chip.style.display = (key === 'all' || chip.dataset.cat === key) ? '' : 'none';
    });
  });

  // ─── TASKS ───
  function renderTasks() {
    document.querySelectorAll('#tab-tasks .type-btn[data-task]').forEach(b => {
      b.classList.toggle('active', b.dataset.task === taskType);
      b.onclick = () => { taskType = b.dataset.task; renderTasks(); };
    });
    const list = document.getElementById('tasks-list');
    if (taskType === 'hw') {
      const items = state.homework.slice().sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
      if (!items.length) { list.innerHTML = `<div class="empty"><p>Нет домашки. Нажми +</p></div>`; return; }
      list.innerHTML = items.map(h => `
        <div class="hw-item priority-${h.priority || 'medium'}${h.done ? ' done' : ''}" data-id="${h.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div><div class="fw-600">${escapeHtml(h.subject || '')}</div>
            <div class="text-muted" style="font-size:0.85rem">${escapeHtml(h.title || '')}</div>
            ${h.due ? `<div class="text-muted" style="font-size:0.75rem;margin-top:4px">до ${escapeHtml(h.due)}</div>` : ''}</div>
            <button class="btn btn-sm btn-secondary hw-toggle" data-id="${h.id}">${h.done ? '↩' : '✓'}</button>
          </div>
        </div>`).join('');
      list.querySelectorAll('.hw-toggle').forEach(b => {
        b.onclick = e => { e.stopPropagation(); const hw = state.homework.find(x => x.id === b.dataset.id); if (hw) { hw.done = !hw.done; save(); renderTasks(); } };
      });
      list.querySelectorAll('.hw-item').forEach(el => {
        el.onclick = e => { if (!e.target.closest('.hw-toggle')) openHwModal(el.dataset.id); };
      });
    } else {
      if (!state.goals.length) { list.innerHTML = `<div class="empty"><p>Нет целей. Нажми +</p></div>`; return; }
      list.innerHTML = state.goals.map(g => `
        <div class="goal-item" data-id="${g.id}" style="cursor:pointer">
          <div class="fw-600">${escapeHtml(g.title || '')}</div>
          ${g.deadline ? `<div class="text-muted" style="font-size:0.8rem">до ${escapeHtml(g.deadline)}</div>` : ''}
          <div class="progress-bar"><div class="progress-fill" style="width:${g.progress || 0}%"></div></div>
          <div class="text-muted" style="font-size:0.75rem;margin-top:4px">${g.progress || 0}%</div>
        </div>`).join('');
      list.querySelectorAll('.goal-item').forEach(el => { el.onclick = () => openGoalModal(el.dataset.id); });
    }
  }

  function openHwModal(id) {
    const item = id ? state.homework.find(h => h.id === id) : null;
    const isNew = !item;
    openModal(isNew ? 'Новая домашка' : 'Домашка', `
      <div class="form-group"><label>Предмет</label><input class="input" id="f-subject" value="${escapeAttr(item?.subject || '')}"></div>
      <div class="form-group"><label>Задание</label><input class="input" id="f-title" value="${escapeAttr(item?.title || '')}"></div>
      <div class="form-row"><div class="form-group"><label>Срок</label><input class="input" id="f-due" type="date" value="${escapeAttr(item?.due || '')}"></div>
      <div class="form-group"><label>Приоритет</label><select class="input" id="f-priority">
        <option value="high"${item?.priority === 'high' ? ' selected' : ''}>Высокий</option>
        <option value="medium"${!item || item.priority === 'medium' ? ' selected' : ''}>Средний</option>
        <option value="low"${item?.priority === 'low' ? ' selected' : ''}>Низкий</option>
      </select></div></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);
    document.getElementById('modal-save').onclick = () => {
      const data = { id: item?.id || uid(), subject: document.getElementById('f-subject').value.trim(), title: document.getElementById('f-title').value.trim(), due: document.getElementById('f-due').value, priority: document.getElementById('f-priority').value, done: item?.done || false };
      if (!data.title) return toast('Укажи задание');
      if (isNew) state.homework.push(data); else { const idx = state.homework.findIndex(h => h.id === id); if (idx >= 0) state.homework[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => { state.homework = state.homework.filter(h => h.id !== id); save(); closeModal(); render(); toast('Удалено'); };
  }

  function openGoalModal(id) {
    const item = id ? state.goals.find(g => g.id === id) : null;
    const isNew = !item;
    openModal(isNew ? 'Новая цель' : 'Цель', `
      <div class="form-group"><label>Название</label><input class="input" id="f-title" value="${escapeAttr(item?.title || '')}"></div>
      <div class="form-group"><label>Дедлайн</label><input class="input" id="f-deadline" type="date" value="${escapeAttr(item?.deadline || '')}"></div>
      <div class="form-group"><label>Прогресс: <span id="prog-val">${item?.progress || 0}</span>%</label>
        <input type="range" id="f-progress" min="0" max="100" value="${item?.progress || 0}" style="width:100%"></div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="f-notes">${escapeHtml(item?.notes || '')}</textarea></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);
    document.getElementById('f-progress').oninput = e => { document.getElementById('prog-val').textContent = e.target.value; };
    document.getElementById('modal-save').onclick = () => {
      const data = { id: item?.id || uid(), title: document.getElementById('f-title').value.trim(), deadline: document.getElementById('f-deadline').value, progress: +document.getElementById('f-progress').value, notes: document.getElementById('f-notes').value.trim() };
      if (!data.title) return toast('Укажи название');
      if (isNew) state.goals.push(data); else { const idx = state.goals.findIndex(g => g.id === id); if (idx >= 0) state.goals[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => { state.goals = state.goals.filter(g => g.id !== id); save(); closeModal(); render(); toast('Удалено'); };
  }


  // ─── DIARY ───
  function renderDiary() {
    const dateInput = document.getElementById('diary-date');
    if (!dateInput.value) dateInput.value = todayDateStr();
    const dateStr = dateInput.value;
    const log = state.dayLogs.find(l => l.date === dateStr);
    diaryMood = log && log.mood ? log.mood : 3;
    document.querySelectorAll('#diary-mood .mood-btn').forEach(b => {
      b.classList.toggle('active', +b.dataset.mood === diaryMood);
    });
    document.getElementById('diary-stayed').value = log ? (log.stayedAt || '') : '';
    document.getElementById('diary-stayed-other').value = log ? (log.stayedOther || '') : '';
    document.getElementById('diary-stayed-other-wrap').classList.toggle('hidden', document.getElementById('diary-stayed').value !== 'other');
    document.getElementById('diary-remarks').value = log ? (log.remarks || '') : '';
    document.getElementById('diary-incidents').value = log ? (log.incidents || '') : '';
    document.getElementById('diary-notes').value = log ? (log.notes || '') : '';

    const months = new Set(state.dayLogs.map(l => (l.date || '').slice(0, 7)).filter(Boolean));
    const curMonth = (dateStr || todayDateStr()).slice(0, 7);
    const sel = document.getElementById('diary-month');
    const monthList = [...months].sort().reverse();
    if (!monthList.includes(curMonth)) monthList.unshift(curMonth);
    sel.innerHTML = monthList.map(m => `<option value="${m}"${m === (sel.value || curMonth) ? ' selected' : ''}>${m}</option>`).join('');
    renderDiaryHistory(sel.value || curMonth);
  }

  function renderDiaryHistory(monthKey) {
    const list = document.getElementById('diary-history');
    const logs = state.dayLogs.filter(l => (l.date || '').startsWith(monthKey)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!logs.length) { list.innerHTML = `<div class="empty" style="padding:16px"><p>Нет записей за этот месяц</p></div>`; return; }
    const moods = ['', '😫', '😕', '😐', '🙂', '😄'];
    list.innerHTML = logs.map(log => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><div class="fw-600">${escapeHtml(log.date)} ${moods[log.mood] || ''}</div>
          <div class="text-muted" style="font-size:0.8rem">${escapeHtml(log.stayedAt || '')}${log.remarks ? ' · ' + escapeHtml(log.remarks.slice(0, 40)) : ''}</div></div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-secondary diary-edit" data-date="${log.date}">✎</button>
            <button class="btn btn-sm btn-danger diary-del" data-id="${log.id}">×</button>
          </div>
        </div>
      </div>`).join('');
    list.querySelectorAll('.diary-edit').forEach(b => {
      b.onclick = () => { document.getElementById('diary-date').value = b.dataset.date; renderDiary(); };
    });
    list.querySelectorAll('.diary-del').forEach(b => {
      b.onclick = () => {
        if (!confirm('Удалить запись?')) return;
        state.dayLogs = state.dayLogs.filter(l => l.id !== b.dataset.id);
        save(); renderDiary(); toast('Удалено');
      };
    });
  }

  document.getElementById('diary-mood')?.addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn'); if (!btn) return;
    diaryMood = +btn.dataset.mood;
    document.querySelectorAll('#diary-mood .mood-btn').forEach(b => b.classList.toggle('active', +b.dataset.mood === diaryMood));
  });
  document.getElementById('diary-stayed')?.addEventListener('change', () => {
    document.getElementById('diary-stayed-other-wrap').classList.toggle('hidden', document.getElementById('diary-stayed').value !== 'other');
  });
  document.getElementById('diary-date')?.addEventListener('change', () => renderDiary());
  document.getElementById('diary-month')?.addEventListener('change', e => renderDiaryHistory(e.target.value));
  document.getElementById('diary-save-btn')?.addEventListener('click', () => {
    const dateStr = document.getElementById('diary-date').value || todayDateStr();
    const data = {
      id: uid(), date: dateStr, mood: diaryMood,
      stayedAt: document.getElementById('diary-stayed').value,
      stayedOther: document.getElementById('diary-stayed-other').value.trim(),
      remarks: document.getElementById('diary-remarks').value.trim(),
      incidents: document.getElementById('diary-incidents').value.trim(),
      notes: document.getElementById('diary-notes').value.trim()
    };
    const idx = state.dayLogs.findIndex(l => l.date === dateStr);
    if (idx >= 0) { data.id = state.dayLogs[idx].id; state.dayLogs[idx] = data; }
    else state.dayLogs.push(data);
    save(); renderDiary(); toast('Итог сохранён');
  });

  // ─── NOTES ───
  function renderNotes() {
    const list = document.getElementById('notes-list');
    const items = state.notes.slice().sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
    if (!items.length) { list.innerHTML = `<div class="empty"><p>Нет заметок. Нажми +</p></div>`; return; }
    list.innerHTML = items.map(n => `
      <div class="card" data-id="${n.id}" style="cursor:pointer">
        <div class="card-title">${escapeHtml(n.title || 'Без названия')}${n.audio ? ' 🎤' : ''}${n.pinned ? ' 📌' : ''}</div>
        <div class="card-meta" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(n.body || '')}</div>
        ${n.audioId || n.audio ? `<audio controls data-audio-id="${escapeAttr(n.audioId || '')}" class="note-audio" style="width:100%;margin-top:8px;max-height:36px"></audio>` : ''}
      </div>`).join('');
    list.querySelectorAll('.card').forEach(c => { c.onclick = e => { if (!e.target.closest('audio')) openNoteModal(c.dataset.id); }; });
    list.querySelectorAll('audio.note-audio').forEach(async el => {
      const aid = el.dataset.audioId;
      if (!aid) return;
      const row = await loadAudioBlob(aid);
      if (row && row.blob) el.src = URL.createObjectURL(row.blob);
    });
  }

  function openNoteModal(id) {
    const item = id ? state.notes.find(n => n.id === id) : null;
    const isNew = !item;
    openModal(isNew ? 'Новая заметка' : 'Заметка', `
      <div class="form-group"><label>Заголовок</label><input class="input" id="f-title" value="${escapeAttr(item?.title || '')}"></div>
      <div class="form-group"><label>Текст</label><textarea class="textarea" id="f-body" rows="5">${escapeHtml(item?.body || '')}</textarea></div>
      <div class="form-group">
        <label>Голосовая заметка</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="btn btn-secondary btn-sm" id="rec-btn">${(item?.audioId || item?.audio) ? 'Перезаписать' : '🎤 Записать'}</button>
          <span id="rec-status" class="text-muted" style="font-size:0.8rem"></span>
        </div>
        ${item?.audioId || item?.audio ? `<audio controls style="width:100%;margin-top:8px" id="note-edit-audio"></audio>` : ''}
      </div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);

    let newAudio = item?.audio || null;
    let newAudioBlob = null;
    let newMime = item?.audioMime || 'audio/webm';
    let audioId = item?.audioId || null;
    (async () => {
      if (audioId) {
        const row = await loadAudioBlob(audioId);
        if (row && row.blob) {
          const el = document.querySelector('#modal-overlay audio, .modal audio');
          if (el) el.src = URL.createObjectURL(row.blob);
        }
      }
    })();

    document.getElementById('rec-btn').onclick = async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        document.getElementById('rec-btn').textContent = '🎤 Записать';
        document.getElementById('rec-status').textContent = 'Обработка…';
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          newMime = blob.type || 'audio/webm';
          newAudioBlob = blob;
            newMime = blob.type || 'audio/webm';
            document.getElementById('rec-status').textContent = 'Записано ✓';
            const url = URL.createObjectURL(blob);
            let preview = document.getElementById('rec-preview');
            if (!preview) {
              preview = document.createElement('audio');
              preview.id = 'rec-preview';
              preview.controls = true;
              preview.style.cssText = 'width:100%;margin-top:8px';
              document.getElementById('rec-status').parentNode.parentNode.appendChild(preview);
            }
            preview.src = url;
        };
        mediaRecorder.start();
        document.getElementById('rec-btn').textContent = '⏹ Стоп';
        document.getElementById('rec-status').textContent = 'Идёт запись…';
      } catch (err) { toast('Нет доступа к микрофону'); }
    };

    document.getElementById('modal-save').onclick = () => {
      const now = Date.now();
      const data = {
        id: item?.id || uid(),
        title: document.getElementById('f-title').value.trim(),
        body: document.getElementById('f-body').value.trim(),
        created: item?.created || now, updated: now,
        pinned: item?.pinned || false,
        audio: null, audioMime: newMime, audioId: audioId
      };
      if (isNew) state.notes.push(data);
      else { const idx = state.notes.findIndex(n => n.id === id); if (idx >= 0) state.notes[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = async () => {
      const n = state.notes.find(x => x.id === id);
      if (n && n.audioId) await deleteAudioBlob(n.audioId);
      state.notes = state.notes.filter(n => n.id !== id); save(); closeModal(); render(); toast('Удалено');
    };
  }


  // ─── PROFILE ───
  function renderProfile() {
    document.querySelectorAll('.ptab').forEach(t => {
      t.classList.toggle('active', t.dataset.ptab === profileTab);
      t.onclick = () => { profileTab = t.dataset.ptab; if (profileTab !== 'qr') stopQrScan(); renderProfile(); };
    });
    const content = document.getElementById('profile-content');

    if (profileTab === 'info') {
      content.innerHTML = `
        <div class="form-group"><label>Имя</label><input class="input" id="p-name" value="${escapeAttr(state.profile.name)}"></div>
        <div class="form-group"><label>Класс</label><input class="input" id="p-class" value="${escapeAttr(state.profile.className)}"></div>
        <div class="form-group"><label>Школа</label><input class="input" id="p-school" value="${escapeAttr(state.profile.school)}"></div>
        <div class="form-group"><label>О себе</label><textarea class="textarea" id="p-notes">${escapeHtml(state.profile.notes)}</textarea></div>
        <button class="btn btn-primary btn-block" id="p-save">Сохранить</button>`;
      document.getElementById('p-save').onclick = () => {
        state.profile.name = document.getElementById('p-name').value.trim();
        state.profile.className = document.getElementById('p-class').value.trim();
        state.profile.school = document.getElementById('p-school').value.trim();
        state.profile.notes = document.getElementById('p-notes').value.trim();
        save(); toast('Профиль сохранён');
      };
    } else if (profileTab === 'people') {
      content.innerHTML = `<div id="people-list"></div>
        <button class="btn btn-secondary btn-block mt-12" id="add-person">+ Человек</button>
        <p class="hint mt-8">Нажми карточку — изменить или удалить одного. Удалить всех: вкладка «Очистка».</p>`;
      renderPeopleList();
      document.getElementById('add-person').onclick = () => openPersonModal(null);
    } else if (profileTab === 'holidays') {
      content.innerHTML = `<div id="holidays-list"></div><button class="btn btn-secondary btn-block mt-12" id="add-holiday">+ Каникулы</button>`;
      renderHolidaysList();
      document.getElementById('add-holiday').onclick = () => openHolidayModal(null);
    } else if (profileTab === 'data') {
      content.innerHTML = `
        <h3 style="font-size:0.85rem;margin-bottom:8px;color:var(--text-muted)">ЭКСПОРТ</h3>
        <button class="btn btn-primary btn-block mb-8" id="btn-export">Экспорт JSON (файл)</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-copy">Копировать JSON</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-share">Поделиться / выборочно</button>
        <h3 style="font-size:0.85rem;margin:16px 0 8px;color:var(--text-muted)">ИМПОРТ / ЗАПОЛНЕНИЕ</h3>
        <button class="btn btn-secondary btn-block mb-8" id="btn-import">Импорт JSON</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-import-xlsx">Импорт Excel (.xlsx)</button>
        <input type="file" id="import-xlsx-input" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
        <button class="btn btn-secondary btn-block mb-8" id="btn-import-csv">Импорт CSV</button>
        <input type="file" id="import-csv-input" accept=".csv,text/csv" hidden>
        <h3 style="font-size:0.85rem;margin:16px 0 8px;color:var(--text-muted)">ШАБЛОНЫ</h3>
        <button class="btn btn-secondary btn-block mb-8" id="btn-dl-xlsx">Скачать Excel-шаблон</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-dl-docx">Скачать Word-шаблон</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-example">Загрузить пример в приложение</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-refresh-app">Обновить приложение (сброс кэша)</button>
        <p class="hint mt-12">Удаление данных — во вкладке <strong>Очистка</strong> (с подтверждением). Excel-шаблон заполняет уроки, кружки, автобусы, ДЗ и профиль.</p>`;
      document.getElementById('btn-export').onclick = exportJsonFile;
      document.getElementById('btn-copy').onclick = copyJson;
      document.getElementById('btn-share').onclick = openShareModal;
      document.getElementById('btn-import').onclick = openImportModal;
      document.getElementById('btn-import-xlsx').onclick = () => document.getElementById('import-xlsx-input').click();
      document.getElementById('import-xlsx-input').onchange = onImportXlsx;
      document.getElementById('btn-import-csv').onclick = () => document.getElementById('import-csv-input').click();
      document.getElementById('import-csv-input').onchange = onImportCsv;
      document.getElementById('btn-dl-xlsx').onclick = () => { const a = document.createElement('a'); a.href = 'templates/orbit-import-template.xlsx'; a.download = 'orbit-import-template.xlsx'; a.click(); };
      document.getElementById('btn-dl-docx').onclick = () => { const a = document.createElement('a'); a.href = 'templates/orbit-import-template.docx'; a.download = 'orbit-import-template.docx'; a.click(); };
      document.getElementById('btn-example').onclick = loadExample;
      const bip = document.getElementById('btn-install-profile');
      if (bip) bip.onclick = () => {
        if (window.__orbitDeferredInstall) {
          window.__orbitDeferredInstall.prompt();
        } else {
          toast('В меню браузера: «Установить приложение» или «На экран Домой»');
        }
      };
      document.getElementById('btn-refresh-app').onclick = async () => {
        try {
          if (navigator.serviceWorker) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
          }
          if (window.caches) {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
          }
        } catch (e) {}
        location.replace(location.href.split('?')[0] + '?v=' + Date.now());
      };
    } else if (profileTab === 'danger') {
      const counts = {
        lessons: state.lessons.length,
        clubs: state.clubs.length,
        buses: state.buses.length,
        events: (state.events || []).length,
        hw: state.homework.length,
        notes: state.notes.length,
        people: state.people.length,
        holidays: state.holidays.length,
        goals: state.goals.length,
        dayLogs: (state.dayLogs || []).length
      };
      content.innerHTML = `
        <div class="danger-zone">
          <p class="danger-warn">⚠️ Зона удаления. Каждое действие только после подтверждения. Сначала сделай экспорт во вкладке «Данные».</p>

          <h3 class="settings-cat">Расписание</h3>
          <button class="btn btn-danger btn-block mb-8" data-wipe="lessons">Удалить все уроки (${counts.lessons})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="clubs">Удалить все кружки (${counts.clubs})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="events">Удалить все события (${counts.events})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="schedule">Очистить всё расписание (уроки+кружки+события)</button>

          <h3 class="settings-cat">Автобусы</h3>
          <button class="btn btn-danger btn-block mb-8" data-wipe="buses">Очистить список автобусов (${counts.buses})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="buses-dup">Убрать только дубли рейсов</button>

          <h3 class="settings-cat">Задачи и заметки</h3>
          <button class="btn btn-danger btn-block mb-8" data-wipe="homework">Очистить домашку (${counts.hw})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="goals">Очистить цели (${counts.goals})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="notes">Очистить заметки (${counts.notes})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="dayLogs">Очистить дневник (${counts.dayLogs})</button>

          <h3 class="settings-cat">Люди и каникулы</h3>
          <button class="btn btn-danger btn-block mb-8" data-wipe="people">Удалить всех людей (${counts.people})</button>
          <button class="btn btn-danger btn-block mb-8" data-wipe="holidays">Удалить все каникулы (${counts.holidays})</button>

          <h3 class="settings-cat">Агент</h3>
          <button class="btn btn-danger btn-block mb-8" data-wipe="agent">Очистить память агента + чат</button>

          <h3 class="settings-cat">Полный сброс</h3>
          <button class="btn btn-danger btn-block mb-8" data-wipe="all">Удалить ВСЁ под ноль</button>
          <p class="hint">Полный сброс: профиль, расписание, автобусы, люди, дневник, настройки по умолчанию, память агента.</p>
        </div>`;

      content.querySelectorAll('[data-wipe]').forEach(btn => {
        btn.onclick = () => confirmWipe(btn.dataset.wipe, counts);
      });
    } else if (profileTab === 'qr') {
      content.innerHTML = `
        <p class="hint mb-8"><strong>Обмен через QR</strong> — ссылка на приложение или данные (уроки, кружки…).</p>
        <div class="qr-actions">
          <button class="btn btn-primary" id="qr-gen-app">QR: открыть приложение</button>
          <button class="btn btn-secondary" id="qr-gen-lessons">QR: только уроки</button>
          <button class="btn btn-secondary" id="qr-gen-clubs">QR: кружки</button>
          <button class="btn btn-secondary" id="qr-gen-people">QR: люди и ДР</button>
          <button class="btn btn-secondary" id="qr-gen-holidays">QR: каникулы</button>
          <button class="btn btn-secondary" id="qr-gen-buses">QR: автобусы</button>
          <button class="btn btn-secondary" id="qr-gen-hw">QR: домашка</button>
          <button class="btn btn-primary" id="qr-gen-full">QR: вся база</button>
        </div>
        <div id="qr-result" class="card hidden" style="text-align:center">
          <div class="fw-600" id="qr-result-title">QR</div>
          <div id="qr-canvas-wrap" style="margin:12px 0"></div>
          <p class="hint" id="qr-result-hint"></p>
          <button class="btn btn-secondary btn-sm mt-8" id="qr-copy-payload">Копировать данные</button>
        </div>
        <h3 style="font-size:0.9rem;margin:16px 0 8px">Считать QR</h3>
        <div class="qr-actions">
          <button class="btn btn-secondary" id="qr-scan-start">📷 Камера</button>
          <button class="btn btn-secondary hidden" id="qr-scan-stop">Стоп камера</button>
          <button class="btn btn-secondary" id="qr-file-btn">Файл с QR</button>
          <input type="file" id="qr-file-input" accept="image/*" hidden>
        </div>
        <video id="qr-video" class="hidden" playsinline></video>
        <div class="form-group mt-12">
          <label>Или вставь текст / payload</label>
          <textarea class="textarea" id="qr-paste" rows="3" placeholder="OR3|... или JSON"></textarea>
          <button class="btn btn-primary btn-block mt-8" id="qr-import-paste">Импортировать</button>
        </div>`;
      bindQrHandlers();
    } else if (profileTab === 'json') {
      content.innerHTML = `
        <p class="hint mb-8">Шаблоны для файла и для текста (нейросеть).</p>
        <h3 style="font-size:0.9rem;margin-bottom:8px">Пример JSON</h3>
        <div class="code-box" id="json-example-preview"></div>
        <button class="btn btn-secondary btn-block mt-8 mb-16" id="btn-dl-example">Скачать schema-example.json</button>
        <h3 style="font-size:0.9rem;margin-bottom:8px">Промпт для нейросети</h3>
        <div class="code-box" id="prompt-preview" style="max-height:140px"></div>
        <button class="btn btn-secondary btn-block mt-8" id="btn-copy-prompt">Копировать промпт</button>`;
      const example = { version: '3.1.0', profile: { name: 'Имя', className: '8Б', school: 'Школа' }, lessons: [{ day: 0, subject: 'Математика', start: '08:30', end: '09:15', room: '301', items: ['учебник'] }], clubs: [], buses: [], homework: [], goals: [], notes: [], people: [], holidays: [], settings: { theme: 'dark' } };
      document.getElementById('json-example-preview').textContent = JSON.stringify(example, null, 2);
      document.getElementById('prompt-preview').textContent = `Ты — помощник планера «Орбита». Верни ТОЛЬКО валидный JSON.
Структура: profile, lessons[{day,subject,start,end,room,teacher,items}], clubs, buses, homework, goals, notes, people, holidays, settings.
day: 0=Пн … 6=Вс. Время HH:MM.
Данные от пользователя:
[опиши расписание]`;
      document.getElementById('btn-dl-example').onclick = () => {
        const a = document.createElement('a'); a.href = 'templates/schema-example.json'; a.download = 'orbit-schema-example.json'; a.click();
      };
      document.getElementById('btn-copy-prompt').onclick = async () => {
        try { await navigator.clipboard.writeText(document.getElementById('prompt-preview').textContent); toast('Промпт скопирован'); }
        catch { toast('Не удалось скопировать'); }
      };
    } else if (profileTab === 'settings') {
      const s = state.settings;
      content.innerHTML = `
        <h3 class="settings-cat">1. Внешний вид</h3>
        <div class="form-group"><label>Тема</label>
          <select class="input" id="s-theme">
            <option value="dark"${s.theme === 'dark' ? ' selected' : ''}>Тёмная</option>
            <option value="light"${s.theme === 'light' ? ' selected' : ''}>Светлая</option>
          </select>
        </div>
        <div class="form-group"><label>Акцент</label>
          <select class="input" id="s-accent">
            <option value="violet"${s.accent === 'violet' ? ' selected' : ''}>Фиолетовый</option>
            <option value="cyan"${s.accent === 'cyan' ? ' selected' : ''}>Бирюзовый</option>
            <option value="orange"${s.accent === 'orange' ? ' selected' : ''}>Оранжевый</option>
            <option value="emerald"${s.accent === 'emerald' ? ' selected' : ''}>Изумрудный</option>
            <option value="rose"${s.accent === 'rose' ? ' selected' : ''}>Розовый</option>
          </select>
        </div>
        <div class="form-group"><label>Шрифт: <span id="fs-val">${s.fontSize || 16}</span>px</label>
          <input type="range" id="s-font" min="14" max="20" value="${s.fontSize || 16}" style="width:100%"></div>
        <div class="form-group"><label>Скругление: <span id="r-val">${s.radius || 14}</span>px</label>
          <input type="range" id="s-radius" min="6" max="24" value="${s.radius || 14}" style="width:100%"></div>
        <div class="form-group"><label>Плотность</label>
          <select class="input" id="s-density">
            <option value="comfortable"${(s.density||'comfortable')==='comfortable'?' selected':''}>Комфортная</option>
            <option value="compact"${s.density==='compact'?' selected':''}>Компактная</option>
          </select>
        </div>
        <div class="form-group"><label><input type="checkbox" id="s-shadows" ${s.shadows!==false?'checked':''}> Тени карточек</label></div>

        <h3 class="settings-cat">2. Уроки и переменки</h3>
        <div class="form-row">
          <div class="form-group"><label>Длительность урока</label><input class="input" id="s-lesson-dur" type="number" min="20" max="90" value="${s.lessonDuration||40}"></div>
          <div class="form-group"><label>Начало дня</label><input class="input" id="s-day-start" type="time" value="${escapeAttr(s.dayStart||'08:30')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Перемена 10 мин</label><input class="input" id="s-break-dur" type="number" min="5" max="30" value="${s.breakDuration||10}"></div>
          <div class="form-group"><label>Перемена 15 мин</label><input class="input" id="s-break15" type="number" min="10" max="30" value="${s.break15||15}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Перемена 20 мин</label><input class="input" id="s-long-break" type="number" min="10" max="45" value="${s.longBreakDuration||20}"></div>
          <div class="form-group"><label>Большая после урока №</label><input class="input" id="s-long-after" type="number" min="1" max="8" value="${s.longBreakAfter||3}"></div>
        </div>
        <div class="form-group"><label>Окно до продлёнки (мин)</label><input class="input" id="s-after-gap" type="number" min="0" max="90" value="${s.afterSchoolGapMin||30}">
          <p class="hint">Свободное время после уроков до продлёнки (20–50 мин)</p>
        </div>
        <div class="form-group"><label><input type="checkbox" id="s-block-overlap" ${s.blockOverlap!==false?'checked':''}> Запрещать пересечение уроков</label></div>
        <div class="form-group"><label><input type="checkbox" id="s-block-dup-bus" ${s.blockDupBus!==false?'checked':''}> Запрещать дубли рейсов автобусов</label></div>

        <h3 class="settings-cat">3. Дашборд и автобусы</h3>
        <div class="form-group"><label><input type="checkbox" id="s-hide-bus-lessons" ${s.hideBusDuringLessons!==false?'checked':''}> Скрывать автобусы во время уроков</label></div>
        <div class="form-group"><label><input type="checkbox" id="s-show-home-btn" ${s.showHomeBtn!==false?'checked':''}> Кнопки «Я домой» / «Закончил»</label></div>
        <div class="form-group"><label>Запас до урока для выхода (мин)</label><input class="input" id="s-leave-buffer" type="number" min="0" max="30" value="${s.leaveBuffer||5}"></div>

        <h3 class="settings-cat">4. Агент</h3>
        <div class="form-group"><label><input type="checkbox" id="s-agent-learn" ${s.agentLearn!==false?'checked':''}> Обучение (IndexedDB)</label></div>
        <div class="form-group"><label><input type="checkbox" id="s-agent-ai-prompt" ${s.agentAiPrompt!==false?'checked':''}> Промпт для нейросети при непонимании</label></div>
        <div class="form-group"><label>Язык подсказок</label>
          <select class="input" id="s-agent-lang"><option value="ru" ${s.agentLang!=='en'?'selected':''}>Русский</option><option value="en" ${s.agentLang==='en'?'selected':''}>English</option></select>
        </div>
        <p class="hint mb-8">Нейросеть по API — опционально. Без ключа агент работает локально как раньше.</p>
        <div class="form-group"><label>API Endpoint</label><input class="input" id="s-llm-endpoint" placeholder="https://api.openai.com/v1/chat/completions" value="${escapeAttr(s.llmEndpoint||'')}"></div>
        <div class="form-group"><label>API Key</label><input class="input" id="s-llm-key" type="password" placeholder="sk-…" value="${escapeAttr(s.llmKey||'')}" autocomplete="off"></div>
        <div class="form-group"><label>Модель</label><input class="input" id="s-llm-model" placeholder="gpt-4o-mini" value="${escapeAttr(s.llmModel||'gpt-4o-mini')}"></div>
        <div class="form-group"><label><input type="checkbox" id="s-llm-enabled" ${s.llmEnabled?'checked':''}> Включить запросы к нейросети</label></div>
        <h3 class="settings-cat">5. Данные и приватность</h3>
        <div class="form-group"><label><input type="checkbox" id="s-autosave" ${s.autosave!==false?'checked':''}> Автосохранение</label></div>
        <div class="form-group"><label><input type="checkbox" id="s-backup" ${s.backup!==false?'checked':''}> Локальный бэкап</label></div>
        <p class="hint">Все данные только на устройстве. Нет облака и трекинга.</p>

        <h3 class="settings-cat">6. Уведомления (локально)</h3>
        <div class="form-group"><label><input type="checkbox" id="s-remind-bus" ${s.remindBus?'checked':''}> Напоминать выйти на автобус</label></div>
        <div class="form-group"><label><input type="checkbox" id="s-remind-lesson" ${s.remindLesson?'checked':''}> Напоминать о следующем уроке</label></div>
        <div class="form-group"><label>За сколько минут</label><input class="input" id="s-remind-min" type="number" min="1" max="30" value="${s.remindMin||10}"></div>

        <button class="btn btn-primary btn-block mt-12" id="s-save">Сохранить настройки</button>`;
      document.getElementById('s-font').oninput = e => { document.getElementById('fs-val').textContent = e.target.value; };
      document.getElementById('s-radius').oninput = e => { document.getElementById('r-val').textContent = e.target.value; };
      document.getElementById('s-save').onclick = () => {
        state.settings.theme = document.getElementById('s-theme').value;
        state.settings.accent = document.getElementById('s-accent').value;
        state.settings.fontSize = +document.getElementById('s-font').value;
        state.settings.radius = +document.getElementById('s-radius').value;
        state.settings.density = document.getElementById('s-density').value;
        state.settings.shadows = document.getElementById('s-shadows').checked;
        state.settings.lessonDuration = +document.getElementById('s-lesson-dur').value || 40;
        state.settings.breakDuration = +document.getElementById('s-break-dur').value || 10;
        state.settings.break15 = +document.getElementById('s-break15').value || 15;
        state.settings.longBreakDuration = +document.getElementById('s-long-break').value || 20;
        state.settings.longBreakAfter = +document.getElementById('s-long-after').value || 3;
        state.settings.dayStart = document.getElementById('s-day-start').value || '08:30';
        state.settings.afterSchoolGapMin = +document.getElementById('s-after-gap').value || 30;
        state.settings.blockOverlap = document.getElementById('s-block-overlap').checked;
        state.settings.blockDupBus = document.getElementById('s-block-dup-bus').checked;
        state.settings.hideBusDuringLessons = document.getElementById('s-hide-bus-lessons').checked;
        state.settings.showHomeBtn = document.getElementById('s-show-home-btn').checked;
        state.settings.leaveBuffer = +document.getElementById('s-leave-buffer').value || 5;
        state.settings.agentLearn = document.getElementById('s-agent-learn').checked;
        state.settings.agentAiPrompt = document.getElementById('s-agent-ai-prompt').checked;
        const lep = document.getElementById('s-llm-endpoint');
        if (lep) {
          state.settings.llmEndpoint = lep.value.trim();
          state.settings.llmKey = document.getElementById('s-llm-key').value.trim();
          state.settings.llmModel = document.getElementById('s-llm-model').value.trim() || 'gpt-4o-mini';
          state.settings.llmEnabled = document.getElementById('s-llm-enabled').checked;
        }
        state.settings.autosave = document.getElementById('s-autosave').checked;
        state.settings.backup = document.getElementById('s-backup').checked;
        state.settings.remindBus = document.getElementById('s-remind-bus').checked;
        state.settings.remindLesson = document.getElementById('s-remind-lesson').checked;
        state.settings.remindMin = +document.getElementById('s-remind-min').value || 10;
        applyTheme(); save(); toast('Настройки сохранены');
      };
    } else {
      content.innerHTML = `<div class="card">
        <div class="fw-600" style="font-size:1.1rem">Орбита</div>
        <div class="text-muted" style="margin-top:4px">Версия ${APP_VERSION}</div>
        <button type="button" class="btn btn-secondary btn-block mt-12" id="btn-install-profile">📲 Установить на домашний экран</button>
        <p class="hint mt-8" id="install-hint">В Safari: Поделиться → На экран «Домой». В Chrome появится кнопка установки.</p>
        <p class="hint mt-12">Умный школьный планер: расписание, QR-обмен, агент, графики, дневник, автобусы, домашка, цели.\nДанные только на устройстве. Работает офлайн.</p>
      </div>`;
    }
  }

  function renderPeopleList() {
    const list = document.getElementById('people-list');
    if (!state.people.length) { list.innerHTML = `<div class="empty"><p>Нет людей. Добавь родственников и друзей с ДР</p></div>`; return; }
    list.innerHTML = state.people.map(p => `
      <div class="card" data-id="${p.id}" style="cursor:pointer">
        <div class="card-title">${escapeHtml(p.name)}</div>
        <div class="card-meta">${escapeHtml(p.relation || '')}${p.birthday ? ' · ДР ' + escapeHtml(p.birthday) : ''}</div>
      </div>`).join('');
    list.querySelectorAll('.card').forEach(c => { c.onclick = () => openPersonModal(c.dataset.id); });
  }

  function openPersonModal(id) {
    const p = id ? state.people.find(x => x.id === id) : null;
    const isNew = !p;
    openModal(isNew ? 'Новый человек' : 'Человек', `
      <div class="form-group"><label>Имя</label><input class="input" id="f-name" value="${escapeAttr(p?.name || '')}"></div>
      <div class="form-group"><label>Кем приходится</label><input class="input" id="f-relation" value="${escapeAttr(p?.relation || '')}" placeholder="мама, друг…"></div>
      <div class="form-group"><label>День рождения (ММ-ДД или ГГГГ-ММ-ДД)</label><input class="input" id="f-bday" value="${escapeAttr(p?.birthday || '')}" placeholder="03-15"></div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="f-notes">${escapeHtml(p?.notes || '')}</textarea></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);
    document.getElementById('modal-save').onclick = () => {
      const data = { id: p?.id || uid(), name: document.getElementById('f-name').value.trim(), relation: document.getElementById('f-relation').value.trim(), birthday: document.getElementById('f-bday').value.trim(), notes: document.getElementById('f-notes').value.trim() };
      if (!data.name) return toast('Укажи имя');
      if (isNew) state.people.push(data); else { const idx = state.people.findIndex(x => x.id === id); if (idx >= 0) state.people[idx] = data; }
      save(); closeModal(); renderProfile(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => { state.people = state.people.filter(x => x.id !== id); save(); closeModal(); renderProfile(); toast('Удалено'); };
  }

  function renderHolidaysList() {
    const list = document.getElementById('holidays-list');
    if (!list) return;
    if (!state.holidays.length) {
      list.innerHTML = `<div class="empty"><p>Нет каникул. Добавь период и задания на каникулы.</p></div>`;
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    list.innerHTML = state.holidays.map(h => {
      const tasks = Array.isArray(h.tasks) ? h.tasks : [];
      const done = tasks.filter(t => t.done).length;
      const total = tasks.length;
      const pct = total ? Math.round(done / total * 100) : 0;
      const active = h.start && h.end && today >= h.start && today <= h.end;
      const hwText = h.homework ? escapeHtml(h.homework).slice(0, 80) : '';
      return `<div class="card holiday-card" data-id="${h.id}">
        <div class="card-title">${escapeHtml(h.name || 'Каникулы')}${active ? ' <span class="card-badge">сейчас</span>' : ''}</div>
        <div class="card-meta">${escapeHtml(h.start || '')} — ${escapeHtml(h.end || '')}</div>
        ${total ? `<div class="holiday-progress"><div class="holiday-progress-bar" style="width:${pct}%"></div></div>
          <div class="card-meta">${done}/${total} заданий · ${pct}%</div>` : (hwText ? `<div class="card-meta">${hwText}</div>` : '')}
        <button type="button" class="btn btn-secondary btn-block mt-8" data-expand="${h.id}" style="font-size:0.8rem">Раскрыть задания</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.holiday-card').forEach(c => {
      c.addEventListener('click', e => {
        if (e.target.closest('[data-expand]')) return;
        openHolidayModal(c.dataset.id);
      });
    });
    list.querySelectorAll('[data-expand]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openHolidayTasks(btn.dataset.expand);
      });
    });
  }

  function openHolidayTasks(id) {
    const h = state.holidays.find(x => x.id === id);
    if (!h) return;
    if (!Array.isArray(h.tasks)) h.tasks = [];
    // migrate old homework text into tasks once
    if (!h.tasks.length && h.homework) {
      h.homework.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(title => {
        h.tasks.push({ id: uid(), title, done: false });
      });
    }
    const tasks = h.tasks;
    const done = tasks.filter(t => t.done).length;
    openModal(h.name || 'Задания на каникулы', `
      <p class="hint mb-8">${escapeHtml(h.start || '')} — ${escapeHtml(h.end || '')} · выполнено ${done}/${tasks.length}</p>
      <div id="holiday-tasks-list">
        ${tasks.map(t => `
          <label class="pack-item" style="margin-bottom:8px">
            <input type="checkbox" data-tid="${t.id}" ${t.done ? 'checked' : ''}>
            <span class="pack-label">${escapeHtml(t.title)}</span>
          </label>`).join('') || '<p class="text-muted">Пока нет заданий</p>'}
      </div>
      <div class="form-group mt-12"><label>Новое задание</label>
        <input class="input" id="f-new-task" placeholder="Например: прочитать гл. 1–3">
      </div>
    `, `<button class="btn btn-secondary" id="modal-cancel">Закрыть</button><button class="btn btn-primary" id="modal-add-task">+ Задание</button>`);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('holiday-tasks-list')?.addEventListener('change', e => {
      const cb = e.target.closest('input[data-tid]');
      if (!cb) return;
      const t = h.tasks.find(x => x.id === cb.dataset.tid);
      if (t) { t.done = cb.checked; save(); }
      const d = h.tasks.filter(x => x.done).length;
      toast(`Прогресс: ${d}/${h.tasks.length}`);
    });
    document.getElementById('modal-add-task').onclick = () => {
      const title = document.getElementById('f-new-task').value.trim();
      if (!title) return toast('Введи текст задания');
      h.tasks.push({ id: uid(), title, done: false });
      save();
      openHolidayTasks(id);
      toast('Задание добавлено');
    };
  }

  function openHolidayModal(id) {
    const h = id ? state.holidays.find(x => x.id === id) : null;
    const isNew = !h;
    const tasks = Array.isArray(h?.tasks) ? h.tasks : [];
    openModal(isNew ? 'Новые каникулы' : 'Каникулы', `
      <div class="form-group"><label>Название</label><input class="input" id="f-name" value="${escapeAttr(h?.name || '')}" placeholder="Осенние каникулы"></div>
      <div class="form-row">
        <div class="form-group"><label>Начало</label><input class="input" id="f-start" type="date" value="${escapeAttr(h?.start || '')}"></div>
        <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="date" value="${escapeAttr(h?.end || '')}"></div>
      </div>
      <div class="form-group"><label>Задания (по одному в строке)</label>
        <textarea class="textarea" id="f-tasks" rows="5" placeholder="Прочитать рассказ&#10;Математика: стр. 40–45&#10;Проект по окружающему миру">${escapeHtml(tasks.map(t => t.title).join('\n') || h?.homework || '')}</textarea>
        <p class="hint">После сохранения можно отмечать выполнение в «Раскрыть задания»</p>
      </div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="f-notes">${escapeHtml(h?.notes || '')}</textarea></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);

    document.getElementById('modal-save').onclick = () => {
      const lines = document.getElementById('f-tasks').value.split(/\n+/).map(s => s.trim()).filter(Boolean);
      const oldTasks = Array.isArray(h?.tasks) ? h.tasks : [];
      const newTasks = lines.map(title => {
        const prev = oldTasks.find(t => t.title === title);
        return prev ? { ...prev } : { id: uid(), title, done: false };
      });
      const data = {
        id: h?.id || uid(),
        name: document.getElementById('f-name').value.trim(),
        start: document.getElementById('f-start').value,
        end: document.getElementById('f-end').value,
        homework: lines.join('\n'),
        tasks: newTasks,
        notes: document.getElementById('f-notes').value.trim()
      };
      if (!data.name) return toast('Укажи название');
      if (isNew) state.holidays.push(data);
      else {
        const idx = state.holidays.findIndex(x => x.id === id);
        if (idx >= 0) state.holidays[idx] = data;
      }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
      state.holidays = state.holidays.filter(x => x.id !== id);
      save(); closeModal(); render(); toast('Удалено');
    };
  }


  function openShareModal() {
    openModal('Поделиться данными', `
      <p class="hint mb-8">Выбери, что включить:</p>
      <label class="pack-item"><input type="checkbox" id="sh-profile" checked> <span class="pack-label">Профиль</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-lessons" checked> <span class="pack-label">Уроки</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-clubs" checked> <span class="pack-label">Кружки</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-buses" checked> <span class="pack-label">Автобусы</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-notes" checked> <span class="pack-label">Заметки (без аудио)</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-people" checked> <span class="pack-label">Люди / ДР</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-holidays" checked> <span class="pack-label">Каникулы</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-homework" checked> <span class="pack-label">Домашка</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-goals" checked> <span class="pack-label">Цели</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-events" checked> <span class="pack-label">События</span></label>
      <label class="pack-item"><input type="checkbox" id="sh-daylogs"> <span class="pack-label">Дневник</span></label>
    `, `<button class="btn btn-secondary" id="modal-copy-sel">Копировать</button>
       <button class="btn btn-primary" id="modal-download-sel">Скачать</button>`);

    function buildSelected() {
      const out = { version: APP_VERSION };
      if (document.getElementById('sh-profile').checked) out.profile = { ...state.profile, photo: '' };
      if (document.getElementById('sh-lessons').checked) out.lessons = state.lessons;
      if (document.getElementById('sh-clubs').checked) out.clubs = state.clubs;
      if (document.getElementById('sh-buses').checked) out.buses = state.buses;
      if (document.getElementById('sh-notes').checked) out.notes = state.notes.map(n => { const { audio, audioMime, ...r } = n; return r; });
      if (document.getElementById('sh-people').checked) out.people = state.people;
      if (document.getElementById('sh-holidays').checked) out.holidays = state.holidays;
      if (document.getElementById('sh-homework').checked) out.homework = state.homework;
      if (document.getElementById('sh-goals').checked) out.goals = state.goals;
      if (document.getElementById('sh-events')?.checked) out.events = state.events || [];
      if (document.getElementById('sh-daylogs').checked) out.dayLogs = state.dayLogs;
      return out;
    }
    document.getElementById('modal-download-sel').onclick = () => {
      const data = JSON.stringify(buildSelected(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `orbit-share-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(a.href); toast('Скачано');
    };
    document.getElementById('modal-copy-sel').onclick = async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(buildSelected(), null, 2)); toast('Скопировано'); }
      catch { toast('Не удалось'); }
    };
  }

  // ─── QR ───
  function showUrlQr(url, title) {
    const wrap = document.getElementById('qr-canvas-wrap') || document.getElementById('qr-result');
    const titleEl = document.getElementById('qr-result-title');
    const hint = document.getElementById('qr-result-hint');
    if (titleEl) titleEl.textContent = title || 'QR';
    if (!wrap || typeof qrcode === 'undefined') { toast('QR недоступен'); return; }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      wrap.innerHTML = qr.createImgTag(5, 8);
      if (hint) hint.textContent = 'Сканируй камерой телефона — откроется Орбита. ' + url;
      toast('QR приложения готов');
    } catch (e) { toast('Не удалось создать QR'); }
  }


  async function encodePayload(obj) {
    const json = JSON.stringify(obj);
    try {
      if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const buf = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'OR3G|' + btoa(bin);
      }
    } catch (_) {}
    return 'OR3|' + btoa(unescape(encodeURIComponent(json)));
  }

  async function decodePayload(str) {
    str = (str || '').trim();
    try {
      if (str.includes('import=')) {
        const u = new URL(str, location.href);
        str = u.searchParams.get('import') || str;
      }
    } catch (_) {}
    if (str.startsWith('OR3G|') || str.startsWith('SP2G|')) {
      const bin = atob(str.slice(str.indexOf('|') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text());
      }
      throw new Error('Нужен браузер с gzip');
    }
    if (str.startsWith('OR3|') || str.startsWith('SP2|')) {
      const json = decodeURIComponent(escape(atob(str.slice(str.indexOf('|') + 1))));
      return JSON.parse(json);
    }
    if (str.startsWith('{')) return JSON.parse(str);
    throw new Error('Неизвестный формат');
  }

  async function showDataQr(dataObj, title) {
    const payload = await encodePayload(dataObj);
    lastQrPayload = payload;
    const wrap = document.getElementById('qr-canvas-wrap');
    const box = document.getElementById('qr-result');
    const titleEl = document.getElementById('qr-result-title');
    const hint = document.getElementById('qr-result-hint');
    if (!wrap || typeof qrcode === 'undefined') { toast('Генератор QR не загрузился'); return; }
    let level = 'M';
    if (payload.length > 1200) level = 'L';
    if (payload.length > 2500) {
      hint.textContent = 'Слишком много данных (' + payload.length + ' симв.). Используй экспорт JSON или меньший блок.';
      box.classList.remove('hidden'); titleEl.textContent = title;
      wrap.innerHTML = '<p class="hint">QR не поместился. Скачай JSON.</p>';
      toast('Данные слишком большие для QR'); return;
    }
    try {
      const qr = qrcode(0, level);
      qr.addData(payload); qr.make();
      wrap.innerHTML = qr.createSvgTag(4, 6);
      const svg = wrap.querySelector('svg');
      if (svg) { svg.style.maxWidth = '280px'; svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.background = '#fff'; svg.style.borderRadius = '12px'; }
      titleEl.textContent = title;
      hint.textContent = 'Открой в другом планере: Профиль → QR-обмен → Считать. Размер: ' + payload.length + ' симв.';
      box.classList.remove('hidden');
      toast('QR готов');
    } catch (err) { toast('Не удалось создать QR'); }
  }

  function bindQrHandlers() {
    document.getElementById('qr-gen-app')?.addEventListener('click', () => {
      const url = location.href.split('#')[0].split('?')[0];
      showUrlQr(url, 'QR: приложение Орбита');
    });
    document.getElementById('qr-gen-lessons')?.addEventListener('click', () => showDataQr({ lessons: state.lessons }, 'QR: уроки (' + state.lessons.length + ')'));
    document.getElementById('qr-gen-clubs')?.addEventListener('click', () => showDataQr({ clubs: state.clubs }, 'QR: кружки'));
    document.getElementById('qr-gen-people')?.addEventListener('click', () => showDataQr({ people: state.people }, 'QR: люди'));
    document.getElementById('qr-gen-holidays')?.addEventListener('click', () => showDataQr({ holidays: state.holidays }, 'QR: каникулы'));
    document.getElementById('qr-gen-buses')?.addEventListener('click', () => showDataQr({ buses: state.buses }, 'QR: автобусы'));
    document.getElementById('qr-gen-hw')?.addEventListener('click', () => showDataQr({ homework: state.homework }, 'QR: домашка'));
    document.getElementById('qr-gen-full')?.addEventListener('click', () => {
      showDataQr({
        profile: { ...state.profile, photo: '' },
        lessons: state.lessons, clubs: state.clubs, buses: state.buses,
        notes: state.notes.map(n => { const { audio, audioMime, ...r } = n; return r; }),
        people: state.people, holidays: state.holidays,
        homework: state.homework, goals: state.goals,
        packChecks: state.packChecks, settings: state.settings
      }, 'QR: вся база (без фото/аудио)');
    });
    document.getElementById('qr-copy-payload')?.addEventListener('click', async () => {
      if (!lastQrPayload) return;
      try { await navigator.clipboard.writeText(lastQrPayload); toast('Скопировано'); } catch { toast('Не удалось'); }
    });
    document.getElementById('qr-import-paste')?.addEventListener('click', () => {
      const t = document.getElementById('qr-paste')?.value || '';
      if (!t.trim()) { toast('Вставь текст'); return; }
      importFromPayloadString(t);
    });
    document.getElementById('qr-scan-start')?.addEventListener('click', startQrScan);
    document.getElementById('qr-scan-stop')?.addEventListener('click', stopQrScan);
    document.getElementById('qr-file-btn')?.addEventListener('click', () => document.getElementById('qr-file-input').click());
    document.getElementById('qr-file-input')?.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file) return;
      try {
        const bmp = await createImageBitmap(file);
        if ('BarcodeDetector' in window) {
          try {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(bmp);
            if (codes && codes[0] && codes[0].rawValue) { importFromPayloadString(codes[0].rawValue); return; }
          } catch (_) {}
        }
        if (typeof jsQR === 'function') {
          const canvas = document.createElement('canvas');
          canvas.width = bmp.width; canvas.height = bmp.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bmp, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) { importFromPayloadString(code.data); return; }
        }
        toast('QR на фото не найден');
      } catch (err) { toast('Не удалось разобрать фото'); }
    });
  }

  async function startQrScan() {
    try {
      qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = document.getElementById('qr-video');
      v.srcObject = qrStream; v.classList.remove('hidden');
      await v.play();
      document.getElementById('qr-scan-stop')?.classList.remove('hidden');
      document.getElementById('qr-scan-start')?.classList.add('hidden');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      qrScanTimer = setInterval(async () => {
        if (v.readyState !== v.HAVE_ENOUGH_DATA) return;
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        if ('BarcodeDetector' in window) {
          try {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(canvas);
            if (codes && codes[0] && codes[0].rawValue) { importFromPayloadString(codes[0].rawValue); return; }
          } catch (_) {}
        }
        if (typeof jsQR === 'function') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) { importFromPayloadString(code.data); return; }
        }
      }, 400);
    } catch (err) { toast('Нет доступа к камере'); }
  }

  function stopQrScan() {
    if (qrScanTimer) { clearInterval(qrScanTimer); qrScanTimer = null; }
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    const v = document.getElementById('qr-video');
    if (v) { v.classList.add('hidden'); v.srcObject = null; }
    document.getElementById('qr-scan-stop')?.classList.add('hidden');
    document.getElementById('qr-scan-start')?.classList.remove('hidden');
  }

  async function importFromPayloadString(str) {
    try {
      const data = await decodePayload(str);
      if (applyImportedData(data)) {
        toast('Данные из QR импортированы');
        stopQrScan();
      }
    } catch (err) {
      toast('Не удалось прочитать: ' + (err.message || 'ошибка'));
    }
  }

  function applyImportedData(data) {
    if (!data || typeof data !== 'object') { toast('Неверный формат'); return false; }
    const keys = ['profile', 'lessons', 'clubs', 'buses', 'notes', 'people', 'holidays', 'homework', 'goals', 'dayLogs', 'events', 'packChecks', 'settings'];
    let any = false;
    for (const k of keys) {
      if (data[k] !== undefined) {
        if (k === 'profile' || k === 'settings' || k === 'packChecks') {
          state[k] = { ...(state[k] || {}), ...data[k] };
        } else if (Array.isArray(data[k])) {
          if (data[k].length && data[k][0] && data[k][0].id && Array.isArray(state[k])) {
            const map = new Map(state[k].map(x => [x.id, x]));
            data[k].forEach(x => map.set(x.id || uid(), x));
            state[k] = [...map.values()];
          } else {
            state[k] = data[k];
          }
        }
        any = true;
      }
    }
    if (!any) { toast('JSON не похож на данные планера'); return false; }
    state = migrate(state);
    save(); applyTheme(); render();
    return true;
  }

  function exportJsonFile() {
    const data = JSON.stringify({ ...state, version: APP_VERSION, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href); toast('Файл скачан');
  }
  async function copyJson() {
    try { await navigator.clipboard.writeText(JSON.stringify({ ...state, version: APP_VERSION }, null, 2)); toast('JSON скопирован'); }
    catch { toast('Не удалось'); }
  }
  function openImportModal() {
    try {
      localStorage.setItem('orbit-pre-import-backup', JSON.stringify(stateForStorage()));
    } catch (e) {}

    openModal('Импорт JSON', `
      <p class="hint mb-8">Файл или текст (из мессенджера / нейросети / QR payload).</p>
      <button class="btn btn-secondary btn-block mb-8" id="import-file-btn">Выбрать файл .json</button>
      <input type="file" id="import-file-input" accept=".json,application/json" hidden>
      <label>Или вставь JSON / payload</label>
      <textarea class="textarea" id="import-text" rows="10" placeholder='{"profile":{...}}'></textarea>
    `, `<button class="btn btn-primary" id="modal-import">Импортировать</button>`);
    document.getElementById('import-file-btn').onclick = () => document.getElementById('import-file-input').click();
    document.getElementById('import-file-input').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { applyImportedData(JSON.parse(r.result)); closeModal(); } catch { toast('Ошибка файла'); } };
      r.readAsText(f);
    };
    document.getElementById('modal-import').onclick = async () => {
      let text = document.getElementById('import-text').value.trim();
      if (!text) return toast('Вставь JSON');
      text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
      try {
        if (text.startsWith('OR3') || text.startsWith('SP2')) await importFromPayloadString(text);
        else applyImportedData(JSON.parse(text));
        closeModal();
      } catch (err) { toast('Ошибка: ' + (err.message || '')); }
    };
  }

  function loadExample() {
    if ((state.lessons && state.lessons.length) || (state.buses && state.buses.length)) {
      if (!confirm('Загрузить пример? Текущие уроки/автобусы будут заменены. Сначала сделай экспорт, если нужны данные.')) return;
    }

    const example = {
      profile: { name: 'Алексей', className: '8Б', school: 'Лицей №1', notes: 'Люблю физику' },
      lessons: [
        { id: uid(), day: 0, subject: 'Математика', start: '08:30', end: '09:15', room: '301', teacher: 'Иванова А.П.', items: ['учебник', 'тетрадь', 'калькулятор'] },
        { id: uid(), day: 0, subject: 'Русский язык', start: '09:25', end: '10:10', room: '215', teacher: 'Петрова М.С.', items: ['учебник', 'тетрадь'] },
        { id: uid(), day: 0, subject: 'Физика', start: '10:30', end: '11:15', room: '405', teacher: 'Сидоров В.И.', items: ['учебник', 'тетрадь'] },
        { id: uid(), day: 0, subject: 'История', start: '11:25', end: '12:10', room: '108', teacher: '', items: ['учебник'] },
        { id: uid(), day: 1, subject: 'Английский', start: '08:30', end: '09:15', room: '220', teacher: '', items: ['учебник', 'словарь'] },
        { id: uid(), day: 1, subject: 'Математика', start: '09:25', end: '10:10', room: '301', teacher: '', items: ['учебник', 'тетрадь'] },
        { id: uid(), day: 2, subject: 'Химия', start: '08:30', end: '09:15', room: '401', teacher: '', items: ['учебник'] },
        { id: uid(), day: 2, subject: 'Литература', start: '09:25', end: '10:10', room: '215', teacher: '', items: ['хрестоматия'] },
        { id: uid(), day: 3, subject: 'Физкультура', start: '08:30', end: '09:15', room: 'Спортзал', teacher: '', items: ['форма', 'кроссовки'] },
        { id: uid(), day: 4, subject: 'Информатика', start: '08:30', end: '09:15', room: '310', teacher: '', items: ['тетрадь'] }
      ],
      clubs: [{ id: uid(), day: 2, name: 'Робототехника', start: '15:00', end: '16:30', place: 'Каб. 112', teacher: 'Козлов Д.А.', items: ['ноутбук'], notes: '' }],
      buses: [
        { id: uid(), number: '42', time: '07:40', from: 'Дом / Парк', to: 'Школа', destination: 'Школа', walkMin: 7, notes: '' },
        { id: uid(), number: '42', time: '16:50', from: 'Школа', to: 'Дом / Парк', destination: 'Дом', walkMin: 5, notes: '' }
      ],
      homework: [
        { id: uid(), subject: 'Математика', title: '§12 упр. 3–7', due: new Date(Date.now() + 86400000).toISOString().slice(0, 10), done: false, priority: 'high' },
        { id: uid(), subject: 'Физика', title: 'Лабораторная №3', due: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), done: false, priority: 'medium' }
      ],
      goals: [{ id: uid(), title: 'Сдать проект по робототехнике', deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), progress: 40, notes: '' }],
      notes: [{ id: uid(), title: 'Напоминание', body: 'Не забыть форму на физру', created: Date.now(), updated: Date.now() }],
      people: [{ id: uid(), name: 'Мама', relation: 'мама', birthday: '05-12', notes: '' }],
      holidays: [{ id: uid(), name: 'Осенние каникулы', start: '2026-10-26', end: '2026-11-03', homework: '', notes: '' }],
      settings: { theme: 'dark', accent: 'violet', radius: 14, fontSize: 16 }
    };
    state = migrate(example); save(); applyTheme(); render(); toast('Пример загружен');
  }


  // ─── Excel / CSV import ───
  function dayFromCell(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Math.max(0, Math.min(6, v | 0));
    const s = String(v).toLowerCase().trim();
    const map = { '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,
      пн:0, понедельник:0, вт:1, вторник:1, ср:2, среда:2, чт:3, четверг:3,
      пт:4, пятница:4, сб:5, суббота:5, вс:6, воскресенье:6 };
    if (s in map) return map[s];
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(6, n));
  }
  function timeFromCell(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      // Excel fraction of day
      const total = Math.round(v * 24 * 60);
      const h = Math.floor(total / 60) % 24, m = total % 60;
      return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    const s = String(v).trim();
    const m = s.match(/(\d{1,2})[:\.](\d{2})/);
    if (m) return String(+m[1]).padStart(2,'0') + ':' + m[2];
    return s;
  }
  function sheetToObjects(sheet) {
    if (typeof XLSX === 'undefined') return [];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return rows;
  }
  function applySheetRows(name, rows) {
    const n = (name || '').toLowerCase();
    if (/профиль|profile/.test(n)) {
      rows.forEach(r => {
        const field = String(r['Поле'] || r.field || r.Field || Object.keys(r)[0] || '').trim();
        const val = r['Значение'] !== undefined ? r['Значение'] : r.value;
        if (!field || val === undefined || val === '') return;
        if (/name|имя/i.test(field)) state.profile.name = String(val);
        else if (/class|класс/i.test(field)) state.profile.className = String(val);
        else if (/school|школ/i.test(field)) state.profile.school = String(val);
        else if (/note|замет/i.test(field)) state.profile.notes = String(val);
      });
      // also key-value where first col is key
      rows.forEach(r => {
        const keys = Object.keys(r);
        if (keys.length >= 2 && ['name','className','school','notes'].includes(keys[0])) {
          state.profile[keys[0]] = String(r[keys[0]] || state.profile[keys[0]] || '');
        }
      });
    } else if (/урок|lesson/.test(n)) {
      rows.forEach(r => {
        const subject = String(r.subject || r['Предмет'] || r.Subject || '').trim();
        if (!subject || /инструкц|day:/i.test(subject)) return;
        const start = timeFromCell(r.start || r['Начало'] || r.Start);
        const end = timeFromCell(r.end || r['Конец'] || r.End) || (start ? calcEndFromStart(start) : '');
        const itemsRaw = r.items || r['Что взять'] || r.Items || '';
        state.lessons.push({
          id: uid(),
          day: dayFromCell(r.day || r['День'] || r.Day),
          subject, start, end,
          room: String(r.room || r['Кабинет'] || '').trim(),
          teacher: String(r.teacher || r['Учитель'] || '').trim(),
          items: String(itemsRaw).split(/[,;]/).map(s => s.trim()).filter(Boolean)
        });
      });
    } else if (/кружк|club/.test(n)) {
      rows.forEach(r => {
        const name = String(r.name || r['Название'] || '').trim();
        if (!name || /инструкц/i.test(name)) return;
        const start = timeFromCell(r.start || r['Начало']);
        const end = timeFromCell(r.end || r['Конец']) || (start ? addMinutesToTime(start, 90) : '');
        state.clubs.push({
          id: uid(), day: dayFromCell(r.day || r['День']),
          name, start, end,
          place: String(r.place || r['Место'] || '').trim(),
          teacher: String(r.teacher || r['Преподаватель'] || '').trim(),
          items: String(r.items || r['Что взять'] || '').split(/[,;]/).map(s => s.trim()).filter(Boolean),
          notes: String(r.notes || r['Заметки'] || '').trim()
        });
      });
    } else if (/автобус|bus/.test(n)) {
      rows.forEach(r => {
        const number = String(r.number || r['№'] || r.Number || '').trim();
        const time = timeFromCell(r.time || r['Время'] || r.Time);
        if (!number && !time) return;
        if (/инструкц|from\/to/i.test(number)) return;
        state.buses.push({
          id: uid(),
          number, time,
          from: String(r.from || r['Откуда'] || r.From || '').trim(),
          to: String(r.to || r['Куда'] || r.destination || r.To || '').trim(),
          destination: String(r.to || r['Куда'] || r.destination || '').trim(),
          walkMin: Number(r.walkMin || r['Идти мин'] || r.walk || 0) || 0,
          transferNumber: String(r.transferNumber || r['Пересадка №'] || '').trim(),
          transferTime: timeFromCell(r.transferTime || r['Время 2'] || ''),
          transferFrom: String(r.transferFrom || r['Пересадка откуда'] || '').trim(),
          transferTo: String(r.transferTo || r['Куда 2'] || r['Пересадка куда'] || '').trim(),
          notes: String(r.notes || r['Заметки'] || '').trim()
        });
      });
    } else if (/домашк|homework|дз/.test(n)) {
      rows.forEach(r => {
        const title = String(r.title || r['Задание'] || r.Title || '').trim();
        if (!title || /priority:/i.test(title)) return;
        state.homework.push({
          id: uid(),
          subject: String(r.subject || r['Предмет'] || '').trim(),
          title,
          due: String(r.due || r['Срок'] || '').trim().slice(0, 10),
          priority: String(r.priority || r['Приоритет'] || 'medium').toLowerCase(),
          done: String(r.done || '').toLowerCase() === 'true'
        });
      });
    } else if (/событ|event/.test(n)) {
      rows.forEach(r => {
        const title = String(r.title || r['Название'] || r.Title || '').trim();
        if (!title) return;
        if (!state.events) state.events = [];
        const start = timeFromCell(r.start || r['Начало']);
        state.events.push({
          id: uid(),
          day: dayFromCell(r.day || r['День']),
          title, start,
          end: timeFromCell(r.end || r['Конец']) || (start ? calcEndFromStart(start) : ''),
          place: String(r.place || r['Место'] || '').trim(),
          notes: String(r.notes || '').trim()
        });
      });
    }
  }

  function onImportXlsx(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      toast('Библиотека Excel не загрузилась');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        let total = 0;
        wb.SheetNames.forEach(name => {
          if (/читай|readme|instruction/i.test(name)) return;
          const rows = sheetToObjects(wb.Sheets[name]);
          const before = state.lessons.length + state.clubs.length + state.buses.length + state.homework.length;
          applySheetRows(name, rows);
          const after = state.lessons.length + state.clubs.length + state.buses.length + state.homework.length;
          total += Math.max(0, after - before);
        });
        save(); render();
        toast('Excel импортирован');
      } catch (err) {
        console.warn(err);
        toast('Ошибка Excel: ' + (err.message || ''));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onImportCsv(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        // Detect sheet type from filename
        const name = file.name || 'уроки';
        if (typeof XLSX !== 'undefined') {
          const wb = XLSX.read(text, { type: 'string', FS: ';' });
          // try comma if one sheet empty
          let sheet = wb.Sheets[wb.SheetNames[0]];
          let rows = sheetToObjects(sheet);
          if (!rows.length) {
            const wb2 = XLSX.read(text, { type: 'string', FS: ',' });
            sheet = wb2.Sheets[wb2.SheetNames[0]];
            rows = sheetToObjects(sheet);
          }
          applySheetRows(name, rows);
        } else {
          toast('Нужен XLSX для CSV');
          return;
        }
        save(); render();
        toast('CSV импортирован');
      } catch (err) {
        toast('Ошибка CSV');
      }
    };
    reader.readAsText(file);
  }

  // ─── FAB ───
  document.getElementById('fab').addEventListener('click', () => {
    if (currentTab === 'schedule') scheduleType === 'lessons' ? openLessonModal(null) : openClubModal(null);
    else if (currentTab === 'kanban') openKanbanAddMenu(todayIndex());
    else if (currentTab === 'tasks') taskType === 'hw' ? openHwModal(null) : openGoalModal(null);
    else if (currentTab === 'notes') openNoteModal(null);
    else if (currentTab === 'buses') openBusModal(null);
  });

  // ─── Init ───
  load();
  loadUndoStack();
  loadAgentUsage();
  loadAgentDebugLog();
  loadAgentKnowledge();
  try {
    const hl = localStorage.getItem('orbit-home-logs');
    if (hl) homeLogs = JSON.parse(hl) || [];
  } catch (e) {}
  applyTheme();
  function applyHashRoute() {
    const h = (location.hash || '').replace('#', '');
    const map = { today: 'today', schedule: 'schedule', lessons: 'schedule', agent: 'agent', buses: 'buses', pack: 'pack', tasks: 'tasks', profile: 'profile' };
    if (h && map[h]) switchTab(map[h]);
  }
  window.addEventListener('hashchange', applyHashRoute);
  applyHashRoute();
  render();
  // hide splash
  setTimeout(() => {
    const sp = document.getElementById('orbit-splash');
    if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 400); }
  }, 200);


  // E2: version banner
  fetch('./version.json?t=' + Date.now()).then(r => r.json()).then(v => {
    if (v && v.version && v.version !== APP_VERSION) {
      const bar = document.createElement('div');
      bar.className = 'update-banner';
      bar.innerHTML = 'Доступна v' + escapeHtml(v.version) + ' (сейчас ' + APP_VERSION + ') <button type="button" class="btn btn-primary btn-sm" id="btn-force-update">Обновить</button>';
      document.querySelector('.app')?.prepend(bar);
      document.getElementById('btn-force-update')?.addEventListener('click', async () => {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        location.reload();
      });
    }
  }).catch(() => {});

  // Offline indicator
  function syncOnlineUi() {
    let el = document.getElementById('offline-badge');
    if (!el) {
      el = document.createElement('span');
      el.id = 'offline-badge';
      el.className = 'offline-badge';
      el.textContent = 'Офлайн';
      document.querySelector('.header-actions')?.prepend(el);
    }
    el.style.display = navigator.onLine ? 'none' : 'inline-flex';
    const strip = document.getElementById('offline-strip');
    if (strip) {
      if (navigator.onLine) strip.setAttribute('hidden', '');
      else strip.removeAttribute('hidden');
    }
  }
  window.addEventListener('online', syncOnlineUi);
  window.addEventListener('offline', syncOnlineUi);
  syncOnlineUi();

  // PWA install
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e; window.__orbitDeferredInstall = e;
    let btn = document.getElementById('btn-install-pwa');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'btn-install-pwa';
      btn.className = 'btn btn-secondary btn-block mb-8';
      btn.textContent = '📲 Установить приложение';
      btn.onclick = async () => {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        await deferredInstall.userChoice;
        deferredInstall = null;
        btn.remove();
      };
    }
    // attach when profile about/data shown — also put in header once
    const ha = document.querySelector('.header-actions');
    if (ha && !document.getElementById('btn-install-pwa-icon')) {
      const b = document.createElement('button');
      b.id = 'btn-install-pwa-icon';
      b.className = 'icon-btn';
      b.title = 'Установить';
      b.textContent = '⬇';
      b.onclick = () => btn.onclick();
      ha.appendChild(b);
    }
  });

  // migrate legacy base64 audio
  setTimeout(() => { migrateBase64AudioToIdb().catch(() => {}); }, 800);

  setInterval(() => {
    if (document.querySelector('.modal-overlay:not(.hidden), .modal.show, #modal:not(.hidden)')) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.modal, .modal-overlay, input, textarea')) return;
    if (currentTab === 'buses') renderBuses();
    if (currentTab === 'today') renderToday();
  }, 30000);

  try {
    const old = localStorage.getItem('school-planner-v1');
    if (old && !localStorage.getItem(STORAGE_KEY)) {
      state = migrate(JSON.parse(old));
      save(); toast('Данные из старого планера перенесены'); render();
    }
  } catch (e) {}
})();
