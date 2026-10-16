(() => {
  'use strict';

  const STORAGE_KEY = 'orbit-planner-v3';
  const BACKUP_KEY = 'orbit-planner-backup-v3';
  const APP_VERSION = '4.3.3';
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
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
    'физра': 'Физкультура', 'физру': 'Физкультура', 'физ-ра': 'Физкультура', 'физкультура': 'Физкультура', 'физ': 'Физкультура',
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
  function resolveSubject(raw) {
    if (!raw) return null;
    const t = normalizeAgentText(raw);
    if (SUBJECT_ALIASES[t]) return SUBJECT_ALIASES[t];
    // longest alias match
    let best = null, bestLen = 0;
    for (const [alias, full] of Object.entries(SUBJECT_ALIASES)) {
      if (t.includes(alias) && alias.length > bestLen) { best = full; bestLen = alias.length; }
    }
    if (best) return best;
    const found = SUBJECTS.find(s => s.toLowerCase() === t || s.toLowerCase().includes(t) || t.includes(s.toLowerCase().slice(0, 4)));
    return found || (raw.trim() ? raw.trim().replace(/^./, c => c.toUpperCase()) : null);
  }

  let state = {
    profile: { name: '', className: '', school: '', notes: '', photo: '' },
    lessons: [], clubs: [], buses: [], notes: [],
    homework: [], goals: [], people: [], holidays: [], dayLogs: [], events: [], reminders: [],
    packChecks: {},
    settings: {
      llmEnabled: false,
      llmProvider: 'giga',
      llmEndpoint: 'https://api.giga.chat/v1/chat/completions',
      llmKey: '',
      llmModel: 'GigaChat',
      llmClientId: '',
      llmClientSecret: '',
      llmAuthKey: '',
      llmScope: 'GIGACHAT_API_PERS',
      llmProxy: '',
      agentAiPrompt: true,
      theme: 'dark', accent: 'violet', radius: 14, density: 'comfortable', fontSize: 16, shadows: true,
      lessonDuration: 40, breakDuration: 10, break15: 15, longBreakDuration: 20, longBreakAfter: 3, breakAfter: [1, 2, 3], dayStart: '08:30', afterSchoolGapMin: 30, brand: 'orbit', accentCustom: '', font: 'system', textScale: 100, glass: true, motion: 'full', contrast: 'normal', exitMin: 7, arriveBefore: 5, rideDefault: 15, showBuses: 4, notifyLeave: false, notifyLead: 10, notifyHw: false, sosEnabled: true, sosNumber: '112', agentSuggest: true, agentAutonomy: 'smart', voice: true, autoBackup: true, widgets: null
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
  let agentKnowledge = {}; // learned phrases -> meaning (from IndexedDB)
  let diaryMood = 3;
  let lastQrPayload = '';
  let qrScanTimer = null;
  let qrStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function save() {
    try {
      const raw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(BACKUP_KEY, raw);
      if (window.Orbit && Orbit.onSave) Orbit.onSave(state);
    } catch (e) { toast('Не удалось сохранить'); }
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
      homework: [], goals: [], people: [], holidays: [], dayLogs: [], events: [], reminders: [],
      packChecks: {},
      settings: {
        theme: 'dark', accent: 'violet', radius: 14, density: 'comfortable', fontSize: 16, shadows: true,
        lessonDuration: 40, breakDuration: 10, break15: 15, longBreakDuration: 20, longBreakAfter: 3, breakAfter: [1, 2, 3], dayStart: '08:30', afterSchoolGapMin: 30, brand: 'orbit', accentCustom: '', font: 'system', textScale: 100, glass: true, motion: 'full', contrast: 'normal', exitMin: 7, arriveBefore: 5, rideDefault: 15, showBuses: 4, notifyLeave: false, notifyLead: 10, notifyHw: false, sosEnabled: true, sosNumber: '112', agentSuggest: true, agentAutonomy: 'smart', voice: true, autoBackup: true, widgets: null
      }
    };
    const s = { ...base, ...(p || {}) };
    s.profile = { ...base.profile, ...(s.profile || {}) };
    s.settings = { ...base.settings, ...(s.settings || {}) };
    for (const k of ['lessons','clubs','buses','notes','homework','goals','people','holidays','dayLogs','events','reminders']) {
      s[k] = Array.isArray(s[k]) ? s[k] : [];
    }
    // автобусы: одна запись = маршрут с расписанием рейсов (times), направлением (dir) и днями (days)
    s.buses = s.buses.map(b => { const t = Array.isArray(b.times) && b.times.length ? b.times : (b.time ? [b.time] : []); return { ...b, times: t, time: b.time || t[0] || '' }; });
    s.packChecks = s.packChecks || {};
    return s;
  }

  function todayIndex() {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  }
  function todayDateStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); } // локальная дата, а не UTC
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
  function toast(msg, ms = 2400) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'dark');
    document.documentElement.setAttribute('data-accent', state.settings.accent || 'violet');
    document.documentElement.style.setProperty('--radius', (state.settings.radius || 14) + 'px');
    document.documentElement.style.setProperty('--app-font-size', (state.settings.fontSize || 16) + 'px');
    document.documentElement.setAttribute('data-density', state.settings.density || 'comfortable');
    document.documentElement.setAttribute('data-shadows', state.settings.shadows === false ? 'off' : 'on');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.settings.theme === 'light' ? '#f1f5f9' : '#0b0f1a';
    if (window.Orbit && Orbit.look) Orbit.look(state.settings);
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
  function closeModal() { overlay.classList.add('hidden'); }
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.getElementById('modal-close').addEventListener('click', closeModal);

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const sec = document.getElementById('tab-' + tab);
    if (sec) sec.classList.add('active');
    document.querySelectorAll(`.nav-btn[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));
    if (window.Orbit && Orbit.onTab) Orbit.onTab(tab);
    const fab = document.getElementById('fab');
    fab.classList.toggle('hidden', !['schedule', 'tasks', 'notes', 'buses', 'kanban', 'contacts'].includes(tab));
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
    if (window.Orbit && Orbit.render && Orbit.render(currentTab)) return;
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

    const morningBuses = state.buses.filter(b => {
      const t = parseTime(b.time); if (t == null) return false;
      const dest = (b.destination || '').toLowerCase();
      const to = (b.to || b.destination || '').toLowerCase();
      return t < 12 * 60 && !/дом|домой|home/.test(to || dest);
    }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    let bestMorningBus = null;
    const firstEvent = all[0] || null;
    if (firstEvent) {
      const firstStart = parseTime(firstEvent.start);
      if (firstStart != null) {
        let best = null;
        for (const b of (morningBuses.length ? morningBuses : state.buses)) {
          const bt = parseTime(b.time); if (bt == null) continue;
          const walk = Number(b.walkMin) || 0;
          const arriveApprox = bt + 5;
          if (arriveApprox <= firstStart - 5) {
            const spare = firstStart - arriveApprox;
            if (!best || spare < best.spare) best = { bus: b, spare, leaveAt: bt - walk };
          }
        }
        if (!best && state.buses.length) {
          const sorted = [...state.buses].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          const b = sorted[0]; const bt = parseTime(b.time); const walk = Number(b.walkMin) || 0;
          if (bt != null) best = { bus: b, spare: null, leaveAt: bt - walk };
        }
        bestMorningBus = best;
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

    if (bestMorningBus && firstEvent) {
      const bus = bestMorningBus.bus;
      const untilLeave = bestMorningBus.leaveAt != null ? bestMorningBus.leaveAt - nowMin : null;
      if (untilLeave != null && untilLeave > 0 && untilLeave <= 90 && !current) {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Выходи из дома</div><div class="hero-title">Через ${untilLeave} мин</div><div class="hero-sub">Автобус № ${escapeHtml(bus.number)} в ${formatTime(bus.time)}${(bus.from || bus.to || bus.destination) ? ' · ' + escapeHtml((bus.from ? bus.from + ' → ' : '') + (bus.to || bus.destination || '')) : ''}</div><div class="hero-sub">До остановки ~${Number(bus.walkMin) || 0} мин · первый урок ${formatTime(firstEvent.start)}</div></div>`;
      } else if (untilLeave != null && untilLeave <= 0 && nowMin < (parseTime(bus.time) || 0) + 5 && !current) {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Срочно</div><div class="hero-title">Выходи на автобус № ${escapeHtml(bus.number)}</div><div class="hero-sub">Отправление ${formatTime(bus.time)}</div></div>`;
      } else if (current) {
        const left = parseTime(current.end) != null ? parseTime(current.end) - nowMin : null;
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Сейчас</div><div class="hero-title">${escapeHtml(current._title)}</div><div class="hero-sub">${current.start || ''} – ${current.end || ''} · ${escapeHtml(current._place || '—')}</div>${left != null ? `<div class="hero-time">${left} мин</div><div class="hero-sub">до конца</div>` : ''}</div>`;
      } else if (next) {
        const wait = parseTime(next.start) - nowMin;
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Следующее</div><div class="hero-title">${escapeHtml(next._title)}</div><div class="hero-sub">${next.start || ''} · ${escapeHtml(next._place || '')}</div><div class="hero-time">${wait} мин</div><div class="hero-sub">до начала</div></div>`;
      } else if (all.length) {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">День завершён</div><div class="hero-title">Все занятия прошли</div></div>`;
      } else {
        hero.innerHTML = `<div class="hero-card"><div class="hero-label">Свободный день</div><div class="hero-title">Нет занятий</div></div>`;
      }
    } else if (current) {
      const left = parseTime(current.end) != null ? parseTime(current.end) - nowMin : null;
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Сейчас</div><div class="hero-title">${escapeHtml(current._title)}</div><div class="hero-sub">${current.start || ''} – ${current.end || ''} · ${escapeHtml(current._place || '—')}</div>${left != null ? `<div class="hero-time">${left} мин</div><div class="hero-sub">до конца</div>` : ''}</div>`;
    } else if (next) {
      const wait = parseTime(next.start) - nowMin;
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Следующее</div><div class="hero-title">${escapeHtml(next._title)}</div><div class="hero-sub">${next.start || ''} · ${escapeHtml(next._place || '')}</div><div class="hero-time">${wait} мин</div><div class="hero-sub">до начала</div></div>`;
    } else if (all.length) {
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">День завершён</div><div class="hero-title">Все занятия прошли</div></div>`;
    } else {
      hero.innerHTML = `<div class="hero-card"><div class="hero-label">Свободный день</div><div class="hero-title">Нет занятий</div></div>`;
    }

    const freeMin = calcFreeMinutes(day);
    document.getElementById('dash-status').innerHTML = `<div class="card" style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="text-muted" style="font-size:0.75rem">Занятий</div><div class="fw-600">${all.length}</div></div><div><div class="text-muted" style="font-size:0.75rem">Свободно</div><div class="fw-600">${Math.floor(freeMin / 60)}ч ${freeMin % 60}м</div></div><div><div class="text-muted" style="font-size:0.75rem">Домашка</div><div class="fw-600">${state.homework.filter(h => !h.done).length}</div></div></div>`;

    renderDayTimeline(day, all, nowMin);
    renderWeekCharts();
    renderWeekGrid();

    const list = document.getElementById('today-lessons');
    if (!all.length) {
      list.innerHTML = `<div class="empty"><p>Нет уроков и кружков на сегодня</p></div>`;
    } else {
      let html = '';
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        const badge = e._type === 'club' ? '<span class="card-badge badge-club">Кружок</span>' : '<span class="card-badge">Урок</span>';
        html += `<div class="card"><div class="card-row"><div class="card-time">${escapeHtml(e.start || '—')}<br><span style="font-weight:400;color:var(--text-dim)">${escapeHtml(e.end || '')}</span></div><div class="card-body"><div class="card-title">${escapeHtml(e._title)} ${badge}</div><div class="card-meta">${escapeHtml(e._place || '')}${e.teacher ? ' · ' + escapeHtml(e.teacher) : ''}</div></div></div></div>`;
        if (i < all.length - 1) {
          const end = parseTime(e.end), nextS = parseTime(all[i + 1].start);
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
    const items = [];
    state.buses.forEach(b => {
      const t = parseTime(b.time); if (t == null) return;
      items.push({ time: b.time, min: t, type: 'bus', title: `Автобус ${b.number || ''}`, meta: (b.from && b.to) ? (b.from + ' → ' + b.to) : (b.to || b.destination || b.from || '') });
    });
    all.forEach(e => {
      const t = parseTime(e.start); if (t == null) return;
      items.push({ time: e.start, min: t, type: e._type, title: e._title, meta: (e.start || '') + (e.end ? ' – ' + e.end : '') + (e._place ? ' · ' + e._place : '') });
    });
    items.sort((a, b) => a.min - b.min);
    if (!items.length) { el.innerHTML = `<div class="empty" style="padding:16px"><p>Пустой день</p></div>`; return; }
    el.innerHTML = items.map(it => {
      const isNow = Math.abs(it.min - nowMin) < 20;
      return `<div class="tl-item tl-${it.type}${isNow ? ' tl-now' : ''}"><div class="tl-time">${escapeHtml(it.time)}</div><div class="tl-title">${escapeHtml(it.title)}</div><div class="tl-meta">${escapeHtml(it.meta)}</div></div>`;
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
        <input class="input" id="f-subject" list="subj-datalist" value="${escapeHtml(item?.subject || '')}" placeholder="Название предмета">
        <datalist id="subj-datalist">${SUBJECTS.map(s => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Начало</label><input class="input" id="f-start" type="time" value="${escapeHtml(startDef)}"></div>
        <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="time" value="${escapeHtml(endDef)}"></div>
      </div>
      <div class="form-group"><label>День</label>
        <select class="input" id="f-day">${DAYS_FULL.map((d, i) => `<option value="${i}"${dayForSuggest === i ? ' selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Кабинет</label><input class="input" id="f-room" value="${escapeHtml(item?.room || '')}"></div>
        <div class="form-group"><label>Учитель</label><input class="input" id="f-teacher" value="${escapeHtml(item?.teacher || '')}"></div>
      </div>
      <div class="form-group"><label>Что взять (через запятую)</label><input class="input" id="f-items" value="${escapeHtml((item?.items || []).join(', '))}"></div>
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
      if (isNew) state.lessons.push(data);
      else { const idx = state.lessons.findIndex(l => l.id === id); if (idx >= 0) state.lessons[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
      state.lessons = state.lessons.filter(l => l.id !== id); save(); closeModal(); render(); toast('Удалено');
    };
  }

  function openClubModal(id) {
    const item = id ? state.clubs.find(c => c.id === id) : null;
    const isNew = !item;
    openModal(isNew ? 'Новый кружок' : 'Кружок', `
      <div class="form-group"><label>Название</label><input class="input" id="f-name" value="${escapeHtml(item?.name || '')}"></div>
      <div class="form-row"><div class="form-group"><label>Начало</label><input class="input" id="f-start" type="time" value="${escapeHtml(item?.start || '15:00')}"></div>
      <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="time" value="${escapeHtml(item?.end || '16:30')}"></div></div>
      <div class="form-group"><label>День</label><select class="input" id="f-day">${DAYS_FULL.map((d, i) => `<option value="${i}"${(item ? item.day : currentScheduleDay) === i ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="form-row"><div class="form-group"><label>Место</label><input class="input" id="f-place" value="${escapeHtml(item?.place || '')}"></div>
      <div class="form-group"><label>Преподаватель</label><input class="input" id="f-teacher" value="${escapeHtml(item?.teacher || '')}"></div></div>
      <div class="form-group"><label>Что взять</label><input class="input" id="f-items" value="${escapeHtml((item?.items || []).join(', '))}"></div>
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
      <div class="form-group"><label>Название</label><input class="input" id="f-title" value="${escapeHtml(item?.title || item?.name || '')}" placeholder="Замена, собрание…"></div>
      <div class="form-row">
        <div class="form-group"><label>Начало</label><input class="input" id="f-start" type="time" value="${escapeHtml(item?.start || suggestNextStart(dayVal))}"></div>
        <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="time" value="${escapeHtml(item?.end || calcEndFromStart(item?.start || suggestNextStart(dayVal)))}"></div>
      </div>
      <div class="form-group"><label>День</label>
        <select class="input" id="f-day">${DAYS_FULL.map((d, i) => `<option value="${i}"${dayVal === i ? ' selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Место</label><input class="input" id="f-place" value="${escapeHtml(item?.place || '')}"></div>
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
  function renderBuses() {
    const list = document.getElementById('buses-list');
    if (!state.buses.length) {
      list.innerHTML = `<div class="empty">
        <p>Маршрутов пока нет — добавь свои.</p>
        <p class="hint" style="margin-top:8px">Укажи откуда → куда, время и сколько идти до остановки. Можно несколько рейсов и пересадки.</p>
      </div>`;
      return;
    }
    const sorted = [...state.buses].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    list.innerHTML = sorted.map(b => {
      const until = minutesUntil(b.time);
      const walk = Number(b.walkMin) || 0;
      const leaveIn = until !== null ? until - walk : null;
      let countdown = '';
      if (until !== null) {
        if (until < -5) countdown = `<span class="bus-countdown past">ушёл</span>`;
        else if (leaveIn !== null && leaveIn <= 0 && until >= 0) countdown = `<span class="bus-countdown urgent">выходи сейчас</span>`;
        else if (leaveIn !== null && leaveIn > 0) countdown = `<span class="bus-countdown ${leaveIn <= 10 ? 'urgent' : ''}">выйти через ${leaveIn} мин</span>`;
        else if (until >= 0) countdown = `<span class="bus-countdown">через ${until} мин</span>`;
        else countdown = `<span class="bus-countdown past">ушёл</span>`;
      }
      const from = b.from || b.fromStop || '';
      const to = b.to || b.destination || '';
      const route = from && to ? `${escapeHtml(from)} → ${escapeHtml(to)}` : escapeHtml(to || from || '');
      let transfer = '';
      if (b.transferNumber || b.transferTime) {
        const tf = b.transferFrom || '';
        const tt = b.transferTo || '';
        transfer = `<div class="card-meta" style="margin-top:4px">↔ Пересадка: № ${escapeHtml(b.transferNumber || '?')} в ${escapeHtml(b.transferTime || '?')}${tf || tt ? ' · ' + escapeHtml(tf) + ' → ' + escapeHtml(tt) : ''}</div>`;
      }
      const leaveAt = (until != null && walk) ? formatTime((parseTime(b.time) || 0) - walk) : '';
      return `<div class="card" data-id="${b.id}" style="cursor:pointer">
        <div class="card-row">
          <div class="card-time">${escapeHtml(b.time || '—')}${leaveAt ? '<br><span style="font-weight:400;color:var(--text-dim);font-size:0.7rem">выход ' + leaveAt + '</span>' : ''}</div>
          <div class="card-body">
            <div class="card-title">№ ${escapeHtml(b.number || '—')} ${countdown}</div>
            <div class="card-meta">${route}${walk ? ' · до остановки ' + walk + ' мин' : ''}</div>
            ${transfer}
            ${b.notes ? `<div class="card-meta">${escapeHtml(b.notes)}</div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.card[data-id]').forEach(c => { c.onclick = () => openBusModal(c.dataset.id); });
  }

  function openBusModal(id) {
    if (window.Orbit && Orbit.openBus) return Orbit.openBus(id);
    const bus = id ? state.buses.find(b => b.id === id) : null;
    const isNew = !bus;
    openModal(isNew ? 'Новый маршрут' : 'Автобус', `
      <div class="form-row">
        <div class="form-group"><label>Номер маршрута</label><input class="input" id="f-number" value="${escapeHtml(bus?.number || '')}" placeholder="42"></div>
        <div class="form-group"><label>Время отправления</label><input class="input" id="f-time" type="time" value="${escapeHtml(bus?.time || '')}"></div>
      </div>
      <div class="form-group"><label>Откуда</label><input class="input" id="f-from" value="${escapeHtml(bus?.from || bus?.fromStop || '')}" placeholder="Дом, остановка «Парк»"></div>
      <div class="form-group"><label>Куда</label><input class="input" id="f-to" value="${escapeHtml(bus?.to || bus?.destination || '')}" placeholder="Школа / Дом"></div>
      <div class="form-group"><label>Идти до остановки (мин)</label>
        <input class="input" id="f-walk" type="number" min="0" max="60" value="${bus?.walkMin ?? 5}">
        <p class="hint" style="margin-top:4px">Программа вычтет это из времени автобуса → «выйти через N мин»</p>
      </div>
      <h3 style="font-size:0.85rem;margin:12px 0 8px;color:var(--text-muted)">ПЕРЕСАДКА (необязательно)</h3>
      <div class="form-row">
        <div class="form-group"><label>№ 2-го автобуса</label><input class="input" id="f-tnum" value="${escapeHtml(bus?.transferNumber || '')}" placeholder="15"></div>
        <div class="form-group"><label>Время 2-го</label><input class="input" id="f-ttime" type="time" value="${escapeHtml(bus?.transferTime || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Пересадка откуда</label><input class="input" id="f-tfrom" value="${escapeHtml(bus?.transferFrom || '')}"></div>
        <div class="form-group"><label>Пересадка куда</label><input class="input" id="f-tto" value="${escapeHtml(bus?.transferTo || '')}"></div>
      </div>
      <div class="form-group"><label>Заметки</label><input class="input" id="f-notes" value="${escapeHtml(bus?.notes || '')}" placeholder="Только по будням…"></div>
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
      if (isNew) state.buses.push(data);
      else { const idx = state.buses.findIndex(b => b.id === id); if (idx >= 0) state.buses[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
      state.buses = state.buses.filter(b => b.id !== id); save(); closeModal(); render(); toast('Удалено');
    };
  }

  // ─── AGENT ───
  function renderAgent() {
    const chat = document.getElementById('agent-chat');
    if (!agentHistory.length) {
      agentHistory.push({ role: 'bot', text: 'Привет! Напиши «добавь» — выберу предмет.\nСокращения: мат, рус, физра, окруж, лит…\n«помощь» — команды.' });
    }
    chat.innerHTML = agentHistory.map((m, idx) => {
      let body = `<div class="agent-msg ${m.role}">${escapeHtml(m.text).replace(/\n/g, '<br>')}`;
      if (m.copyPrompt) {
        body += `<button type="button" class="btn btn-secondary btn-block mt-8 agent-copy-btn" data-idx="${idx}">📋 Копировать промпт для нейросети</button>`;
      }
      if (m.subjects) {
        body += `<div class="subject-chips mt-8" data-agent-subj="1">${SUBJECTS.map(s => `<button type="button" class="subject-chip" data-subj="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}</div>`;
      }
      body += `</div>`;
      return body;
    }).join('');
    chat.scrollTop = chat.scrollHeight;
    chat.querySelectorAll('.agent-copy-btn').forEach(btn => {
      btn.onclick = async () => {
        const msg = agentHistory[+btn.dataset.idx];
        if (!msg || !msg.copyPrompt) return;
        try { await navigator.clipboard.writeText(msg.copyPrompt); toast('Промпт скопирован — вставь в нейросеть'); }
        catch { toast('Не удалось скопировать'); }
      };
    });
    chat.querySelectorAll('[data-agent-subj] .subject-chip').forEach(chip => {
      chip.onclick = () => agentReply(chip.dataset.subj);
    });
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
    if (agentKnowledge[t]) return agentKnowledge[t];
    for (const [phrase, meaning] of Object.entries(agentKnowledge)) {
      if (t.includes(phrase) || phrase.includes(t)) return meaning;
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

  function normalizeAgentText(t) {
    return (t || '').toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»""]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

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
      пн: 0, понедельник: 0, понед: 0,
      вт: 1, вторник: 1,
      ср: 2, среда: 2,
      чт: 3, четверг: 3,
      пт: 4, пятница: 4,
      сб: 5, суббота: 5,
      вс: 6, воскресенье: 6, воскр: 6,
      сегодня: todayIndex(),
      завтра: (todayIndex() + 1) % 7
    };
    const t = normalizeAgentText(str);
    for (const [k, v] of Object.entries(dayMap)) {
      if (t.includes(k)) return typeof v === 'function' ? v : v;
    }
    return null;
  }

  function agentReply(text) {
    const raw = (text || '').trim();
    if (!raw) return;
    agentHistory.push({ role: 'user', text: raw });
    const lower = normalizeAgentText(raw);
    let reply = '';
    const dayName = d => DAYS_FULL[d] || '?';

    // 0) Learned knowledge from IndexedDB
    const learned = lookupLearned(raw);
    if (learned && !agentPending) {
      // If learned meaning looks like a command, run it
      if (/^(добавь|удали|перенес|очист|покажи|свободн)/i.test(learned)) {
        agentHistory.pop(); // remove duplicate user push - will re-push in recursive
        agentHistory.pop();
        return agentReply(learned);
      }
      reply = learned;
      agentHistory.push({ role: 'bot', text: reply });
      renderAgent();
      return;
    }

    // 1) Pending multi-step dialog
    if (agentPending) {
      const p = agentPending;
      if (/отмена|cancel|стоп/.test(lower)) {
        agentPending = null;
        reply = 'Отменено.';
      } else if (p.type === 'add_lesson') {
        if (p.step === 'subject') {
          const subj = resolveSubject(raw);
          if (!subj) { reply = 'Не понял предмет. Напиши название или сокращение (мат, физра, рус…).'; }
          else {
            p.subject = subj;
            p.step = 'day';
            reply = `«${subj}». На какой день? (пн…вс / сегодня / завтра)\nИли сразу: «пн 8:30»`;
          }
        } else if (p.step === 'day') {
          // try "пн 8:30" or just day
          const day = parseDayToken(lower);
          const tm = lower.match(/(\d{1,2})[:\.](\d{2})/);
          if (day != null && tm) {
            const startT = String(+tm[1]).padStart(2,'0') + ':' + tm[2];
            const endT = calcEndFromStart(startT);
            state.lessons.push({ id: uid(), day, subject: p.subject, start: startT, end: endT, room: '', teacher: '', items: [] });
            save(); agentPending = null;
            reply = `Добавил «${p.subject}» на ${dayName(day)} ${startT}–${endT}.`;
          } else if (day != null) {
            p.day = day; p.step = 'time';
            const sug = suggestNextStart(day);
            reply = `День: ${dayName(day)}. Во сколько начало? (например ${sug})\nМожно просто нажать время или написать «${sug}»`;
          } else if (tm && p.day != null) {
            const startT = String(+tm[1]).padStart(2,'0') + ':' + tm[2];
            const endT = calcEndFromStart(startT);
            state.lessons.push({ id: uid(), day: p.day, subject: p.subject, start: startT, end: endT, room: '', teacher: '', items: [] });
            save(); agentPending = null;
            reply = `Добавил «${p.subject}» на ${dayName(p.day)} ${startT}–${endT}.`;
          } else {
            reply = 'Укажи день: пн, вт, ср… или «сегодня». Можно сразу «пн 8:30».';
          }
        } else if (p.step === 'time') {
          const tm = lower.match(/(\d{1,2})[:\.](\d{2})/);
          if (tm) {
            const startT = String(+tm[1]).padStart(2,'0') + ':' + tm[2];
            const endT = calcEndFromStart(startT);
            state.lessons.push({ id: uid(), day: p.day, subject: p.subject, start: startT, end: endT, room: '', teacher: '', items: [] });
            save(); agentPending = null;
            reply = `Добавил «${p.subject}» на ${dayName(p.day)} ${startT}–${endT}.`;
          } else {
            reply = 'Напиши время начала, например 8:30';
          }
        }
      } else if (p.type === 'learn') {
        // user explains what previous phrase meant
        saveAgentKnowledge(p.phrase, raw);
        agentPending = null;
        reply = `Запомнил: «${p.phrase}» → «${raw}». В следующий раз пойму. Можно сразу выполнить — напиши эту команду.`;
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
    if (subjectOnly && raw.length < 40 && !/удали|перенес|покажи|сколько|что|когда|помощь/.test(lower)) {
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

    } else if (/удали\s*все\s*кружк/.test(lower)) {
      const n = state.clubs.length; state.clubs = []; save();
      reply = `Удалено кружков: ${n}.`;

    } else if (/удали\s*всю\s*домашк|очисти\s*домашк|удали\s*все\s*дз/.test(lower)) {
      const n = state.homework.length; state.homework = []; save();
      reply = `Домашка очищена (${n}).`;

    } else if (/удали\s*все\s*заметк|очисти\s*заметк/.test(lower)) {
      const n = state.notes.length; state.notes = []; save();
      reply = `Заметки удалены (${n}).`;

    } else if (/удали\s*(все\s*)?уроки\s*в\s*|очисти\s*день/.test(lower)) {
      const d = parseDayToken(lower);
      if (d != null) {
        const before = state.lessons.length;
        state.lessons = state.lessons.filter(l => l.day !== d);
        save();
        reply = `С ${dayName(d)} удалено уроков: ${before - state.lessons.length}.`;
      } else reply = 'Укажи день: «удали все уроки в понедельник»';

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
        state.lessons.push({ id: uid(), day, subject: subj, start, end, room: '', teacher: '', items: [] });
        save();
        reply = `Добавил «${subj}» на ${dayName(day)} ${start}–${end}.`;
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
        state.clubs.push({ id: uid(), day, name: m[1].trim().replace(/^./, c => c.toUpperCase()), start, end, place: '', teacher: '', items: [], notes: '' });
        save();
        reply = `Кружок добавлен на ${dayName(day)} ${start}–${end}.`;
      } else reply = 'Формат: «добавь кружок Робототехника ср 15:00-16:30»';

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
      if (!list.length) reply = `На ${dayName(d)} уроков нет.`;
      else reply = `${dayName(d)}:\n` + list.map(l => `• ${l.start || '?'}–${l.end || '?'} ${l.subject}`).join('\n');

    } else if (/следующий урок|какой сейчас|сейчас урок|что дальше|ближайший/.test(lower)) {
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

    } else if (/привет|здравств|хай|hello/.test(lower)) {
      reply = `Привет${state.profile.name ? ', ' + state.profile.name : ''}! Напиши «добавь» или «мат» — помогу.`;

    } else {
      // FALLBACK: offer learn + copy for external AI
      agentPending = { type: 'learn', phrase: raw };
      const aiPrompt = `Ты помогаешь школьному планеру «Орбита». Пользователь написал: «${raw}».\nПерефразируй в одну чёткую команду на русском из списка:\n- добавь урок [предмет] [день] [время]\n- удали урок [предмет]\n- удали все уроки в [день]\n- перенеси [предмет] с [день] на [день]\n- очисти расписание\n- свободное время\n- что взять завтра\nОтветь ТОЛЬКО текстом команды, без пояснений.`;
      reply = `Не понял «${raw}».\n\n1) Напиши, что это значит — запомню.\n2) Или скопируй промпт в нейросеть, а ответ вставь мне:\n\n---\n${aiPrompt}\n---`;
      agentHistory.push({ role: 'bot', text: reply, copyPrompt: aiPrompt });
      renderAgent();
      return;
    }

    agentHistory.push({ role: 'bot', text: reply });
    if (agentHistory.length > 50) agentHistory = agentHistory.slice(-40);
    renderAgent();
  }

  document.getElementById('agent-send').addEventListener('click', () => {
    const input = document.getElementById('agent-input');
    const t = input.value.trim(); if (!t) return;
    input.value = ''; agentReply(t);
  });
  document.getElementById('agent-input').addEventListener('keydown', e => {
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
      <div class="form-group"><label>Предмет</label><input class="input" id="f-subject" value="${escapeHtml(item?.subject || '')}"></div>
      <div class="form-group"><label>Задание</label><input class="input" id="f-title" value="${escapeHtml(item?.title || '')}"></div>
      <div class="form-row"><div class="form-group"><label>Срок</label><input class="input" id="f-due" type="date" value="${escapeHtml(item?.due || '')}"></div>
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
      <div class="form-group"><label>Название</label><input class="input" id="f-title" value="${escapeHtml(item?.title || '')}"></div>
      <div class="form-group"><label>Дедлайн</label><input class="input" id="f-deadline" type="date" value="${escapeHtml(item?.deadline || '')}"></div>
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
        ${n.audio ? `<audio controls src="data:${n.audioMime || 'audio/webm'};base64,${n.audio}" style="width:100%;margin-top:8px;max-height:36px"></audio>` : ''}
      </div>`).join('');
    list.querySelectorAll('.card').forEach(c => { c.onclick = e => { if (!e.target.closest('audio')) openNoteModal(c.dataset.id); }; });
  }

  function openNoteModal(id) {
    const item = id ? state.notes.find(n => n.id === id) : null;
    const isNew = !item;
    openModal(isNew ? 'Новая заметка' : 'Заметка', `
      <div class="form-group"><label>Заголовок</label><input class="input" id="f-title" value="${escapeHtml(item?.title || '')}"></div>
      <div class="form-group"><label>Текст</label><textarea class="textarea" id="f-body" rows="5">${escapeHtml(item?.body || '')}</textarea></div>
      <div class="form-group">
        <label>Голосовая заметка</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="btn btn-secondary btn-sm" id="rec-btn">${item?.audio ? 'Перезаписать' : '🎤 Записать'}</button>
          <span id="rec-status" class="text-muted" style="font-size:0.8rem"></span>
        </div>
        ${item?.audio ? `<audio controls src="data:${item.audioMime || 'audio/webm'};base64,${item.audio}" style="width:100%;margin-top:8px"></audio>` : ''}
      </div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);

    let newAudio = item?.audio || null;
    let newMime = item?.audioMime || 'audio/webm';

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
          const reader = new FileReader();
          reader.onload = () => {
            newAudio = reader.result.split(',')[1];
            document.getElementById('rec-status').textContent = 'Записано ✓';
          };
          reader.readAsDataURL(blob);
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
        audio: newAudio, audioMime: newMime
      };
      if (isNew) state.notes.push(data);
      else { const idx = state.notes.findIndex(n => n.id === id); if (idx >= 0) state.notes[idx] = data; }
      save(); closeModal(); render(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => {
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
        <div class="form-group"><label>Имя</label><input class="input" id="p-name" value="${escapeHtml(state.profile.name)}"></div>
        <div class="form-group"><label>Класс</label><input class="input" id="p-class" value="${escapeHtml(state.profile.className)}"></div>
        <div class="form-group"><label>Школа</label><input class="input" id="p-school" value="${escapeHtml(state.profile.school)}"></div>
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
      content.innerHTML = `<div id="people-list"></div><button class="btn btn-secondary btn-block mt-12" id="add-person">+ Человек</button>`;
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
        <button class="btn btn-secondary btn-block mb-8" id="btn-clear-knowledge">Очистить память агента (IndexedDB)</button>
        <button class="btn btn-secondary btn-block mb-8" id="btn-refresh-app">Обновить приложение</button>
        <button class="btn btn-danger btn-block mt-12" id="btn-clear">Очистить все данные</button>
        <p class="hint mt-12">Автобусы изначально пустые — добавь свои маршруты (откуда → куда, пересадки, время до остановки). Excel-шаблон заполняет уроки, кружки, автобусы, ДЗ и профиль сразу.</p>`;
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
      document.getElementById('btn-clear-knowledge').onclick = async () => {
        await clearAgentKnowledge(); toast('Память агента очищена');
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
        location.reload(true);
      };
      document.getElementById('btn-clear').onclick = () => {
        if (confirm('Удалить ВСЕ данные?')) { state = migrate({}); save(); render(); toast('Очищено'); }
      };
    } else if (profileTab === 'qr') {
      content.innerHTML = `
        <p class="hint mb-8"><strong>Обмен через QR</strong> — каждый блок отдельно: уроки, кружки, люди, каникулы, автобусы, домашка или вся база.</p>
        <div class="qr-actions">
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
      content.innerHTML = `
        <div class="form-group"><label>Тема</label>
          <select class="input" id="s-theme">
            <option value="dark"${state.settings.theme === 'dark' ? ' selected' : ''}>Тёмная</option>
            <option value="light"${state.settings.theme === 'light' ? ' selected' : ''}>Светлая</option>
          </select>
        </div>
        <div class="form-group"><label>Акцент</label>
          <select class="input" id="s-accent">
            <option value="violet"${state.settings.accent === 'violet' ? ' selected' : ''}>Фиолетовый</option>
            <option value="cyan"${state.settings.accent === 'cyan' ? ' selected' : ''}>Бирюзовый</option>
            <option value="orange"${state.settings.accent === 'orange' ? ' selected' : ''}>Оранжевый</option>
            <option value="emerald"${state.settings.accent === 'emerald' ? ' selected' : ''}>Изумрудный</option>
            <option value="rose"${state.settings.accent === 'rose' ? ' selected' : ''}>Розовый</option>
          </select>
        </div>
        <div class="form-group"><label>Шрифт: <span id="fs-val">${state.settings.fontSize || 16}</span>px</label>
          <input type="range" id="s-font" min="14" max="20" value="${state.settings.fontSize || 16}" style="width:100%"></div>
        <div class="form-group"><label>Скругление: <span id="r-val">${state.settings.radius || 14}</span>px</label>
          <input type="range" id="s-radius" min="6" max="24" value="${state.settings.radius || 14}" style="width:100%"></div>
        <h3 style="font-size:0.85rem;margin:16px 0 8px;color:var(--text-muted)">УРОКИ И ПЕРЕМЕНЫ</h3>
        <div class="form-row">
          <div class="form-group"><label>Урок (мин)</label><input class="input" id="s-lesson-dur" type="number" min="20" max="90" value="${state.settings.lessonDuration || 40}"></div>
          <div class="form-group"><label>Перемена 10 мин</label><input class="input" id="s-break-dur" type="number" min="5" max="30" value="${state.settings.breakDuration || 10}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Перемена 15 мин</label><input class="input" id="s-break15" type="number" min="10" max="30" value="${state.settings.break15 || 15}"></div>
          <div class="form-group"><label>Перемена 20 мин</label><input class="input" id="s-long-break" type="number" min="10" max="45" value="${state.settings.longBreakDuration || 20}"></div>
        </div>
        <div class="form-group"><label>Большая (20 мин) после урока №</label><input class="input" id="s-long-after" type="number" min="1" max="8" value="${state.settings.longBreakAfter || 3}"></div>
        <div class="form-group"><label>Начало первого урока</label><input class="input" id="s-day-start" type="time" value="${escapeHtml(state.settings.dayStart || '08:30')}"></div>
        <div class="form-group"><label>Окно после уроков до продлёнки (мин)</label><input class="input" id="s-after-gap" type="number" min="0" max="90" value="${state.settings.afterSchoolGapMin || 30}">
          <p class="hint">Свободное время между окончанием занятий и продлёнкой (обычно 20–50 мин)</p>
        </div>
        <button class="btn btn-primary btn-block" id="s-save">Применить</button>`;
      document.getElementById('s-font').oninput = e => { document.getElementById('fs-val').textContent = e.target.value; };
      document.getElementById('s-radius').oninput = e => { document.getElementById('r-val').textContent = e.target.value; };
      document.getElementById('s-save').onclick = () => {
        state.settings.theme = document.getElementById('s-theme').value;
        state.settings.accent = document.getElementById('s-accent').value;
        state.settings.fontSize = +document.getElementById('s-font').value;
        state.settings.radius = +document.getElementById('s-radius').value;
        state.settings.lessonDuration = +document.getElementById('s-lesson-dur').value || 40;
        state.settings.breakDuration = +document.getElementById('s-break-dur').value || 10;
        state.settings.break15 = +document.getElementById('s-break15').value || 15;
        state.settings.longBreakDuration = +document.getElementById('s-long-break').value || 20;
        state.settings.longBreakAfter = +document.getElementById('s-long-after').value || 3;
        state.settings.dayStart = document.getElementById('s-day-start').value || '08:30';
        state.settings.afterSchoolGapMin = +document.getElementById('s-after-gap').value || 30;
        applyTheme(); save(); toast('Применено');
      };
    } else {
      content.innerHTML = `<div class="card">
        <div class="fw-600" style="font-size:1.1rem">Орбита</div>
        <div class="text-muted" style="margin-top:4px">Версия ${APP_VERSION}</div>
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
    if (window.Orbit && Orbit.openPerson) return Orbit.openPerson(id);
    const p = id ? state.people.find(x => x.id === id) : null;
    const isNew = !p;
    openModal(isNew ? 'Новый человек' : 'Человек', `
      <div class="form-group"><label>Имя</label><input class="input" id="f-name" value="${escapeHtml(p?.name || '')}"></div>
      <div class="form-group"><label>Кем приходится</label><input class="input" id="f-relation" value="${escapeHtml(p?.relation || '')}" placeholder="мама, друг…"></div>
      <div class="form-group"><label>День рождения (ММ-ДД или ГГГГ-ММ-ДД)</label><input class="input" id="f-bday" value="${escapeHtml(p?.birthday || '')}" placeholder="03-15"></div>
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
    if (!state.holidays.length) { list.innerHTML = `<div class="empty"><p>Нет каникул</p></div>`; return; }
    list.innerHTML = state.holidays.map(h => `
      <div class="card" data-id="${h.id}" style="cursor:pointer">
        <div class="card-title">${escapeHtml(h.name)}</div>
        <div class="card-meta">${escapeHtml(h.start || '')} – ${escapeHtml(h.end || '')}</div>
      </div>`).join('');
    list.querySelectorAll('.card').forEach(c => { c.onclick = () => openHolidayModal(c.dataset.id); });
  }

  function openHolidayModal(id) {
    const h = id ? state.holidays.find(x => x.id === id) : null;
    const isNew = !h;
    openModal(isNew ? 'Новые каникулы' : 'Каникулы', `
      <div class="form-group"><label>Название</label><input class="input" id="f-name" value="${escapeHtml(h?.name || '')}" placeholder="Осенние каникулы"></div>
      <div class="form-row"><div class="form-group"><label>Начало</label><input class="input" id="f-start" type="date" value="${escapeHtml(h?.start || '')}"></div>
      <div class="form-group"><label>Конец</label><input class="input" id="f-end" type="date" value="${escapeHtml(h?.end || '')}"></div></div>
      <div class="form-group"><label>Домашка на каникулы</label><textarea class="textarea" id="f-hw">${escapeHtml(h?.homework || '')}</textarea></div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="f-notes">${escapeHtml(h?.notes || '')}</textarea></div>
    `, `${!isNew ? `<button class="btn btn-danger" id="modal-del">Удалить</button>` : ''}<button class="btn btn-primary" id="modal-save">Сохранить</button>`);
    document.getElementById('modal-save').onclick = () => {
      const data = { id: h?.id || uid(), name: document.getElementById('f-name').value.trim(), start: document.getElementById('f-start').value, end: document.getElementById('f-end').value, homework: document.getElementById('f-hw').value.trim(), notes: document.getElementById('f-notes').value.trim() };
      if (!data.name) return toast('Укажи название');
      if (isNew) state.holidays.push(data); else { const idx = state.holidays.findIndex(x => x.id === id); if (idx >= 0) state.holidays[idx] = data; }
      save(); closeModal(); renderProfile(); toast('Сохранено');
    };
    if (!isNew) document.getElementById('modal-del').onclick = () => { state.holidays = state.holidays.filter(x => x.id !== id); save(); closeModal(); renderProfile(); toast('Удалено'); };
  }

  // ─── Share selective ───
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
    else if (currentTab === 'contacts' && window.Orbit) Orbit.openPerson(null);
  });

  // ─── Мост для Орбиты 4 (js/orbit/*) ───
  window.OrbitCore = {
    version: APP_VERSION, DAYS, DAYS_FULL, SUBJECTS, uid, escapeHtml, toast, openModal, closeModal, save, render, switchTab, applyTheme,
    get state() { return state; },
    setState(next) { state = migrate(next); save(); applyTheme(); render(); },
    get tab() { return currentTab; },
    resolveSubject, applyImportedData, encodePayload, decodePayload, importFromPayloadString, loadExample,
    openLessonModal, openClubModal, openEventModal, openHwModal, openGoalModal, openNoteModal, openHolidayModal,
    setPackDay(d) { packDay = d; }, setScheduleDay(d) { currentScheduleDay = d; },
    get legacyPending() { return !!agentPending; },
    legacyCancel() { agentPending = null; },
    legacyAgent(text) {            // старый агент (добавить/удалить/перенести уроки): возвращает его ответы
      const n = agentHistory.length;
      agentReply(text);
      return agentHistory.slice(n + 1).filter(m => m.role === 'bot');
    },
    clearAgentMemory: clearAgentKnowledge
  };

  // ─── Init ───
  load();
  loadAgentKnowledge();
  applyTheme();
  render();
  setInterval(() => {
    if (currentTab === 'buses' || currentTab === 'today') render();
    if (window.Orbit && Orbit.tick) Orbit.tick();
  }, 30000);

  try {
    const old = localStorage.getItem('school-planner-v1');
    if (old && !localStorage.getItem(STORAGE_KEY)) {
      state = migrate(JSON.parse(old));
      save(); toast('Данные из старого планера перенесены'); render();
    }
  } catch (e) {}
})();
