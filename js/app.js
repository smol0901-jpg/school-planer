(() => {
  'use strict';

  const STORAGE_KEY = 'school-planner-v1';
  const BACKUP_KEY = 'school-planner-backup-v1';
  const APP_VERSION = '2.4.1';
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  // ---------- State ----------
  let state = {
    profile: { name: '', className: '', school: '', notes: '', photo: '' },
    lessons: [],      // { id, day (0-6), subject, start, end, room, teacher, items: [] }
    clubs: [],        // { id, day (0-6), name, start, end, place, teacher, items: [], notes }
    buses: [],        // { id, number, time, destination, walkMin, notes }
    notes: [],        // { id, title, body, created, updated, audio?, audioMime? }
    people: [],       // { id, name, relation, birthday (MM-DD or YYYY-MM-DD), age?, likes, dislikes, notes }
    holidays: [],     // { id, name, start (YYYY-MM-DD), end (YYYY-MM-DD), homework, notes }
    packChecks: {},   // { "itemKey": true }
    settings: { theme: 'light', activeDay: null, radius: 12, density: 'comfortable', fontSize: 16, shadows: true }
  };

  let currentTab = 'today';
  let currentScheduleDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1; // Mon=0
  let scheduleType = 'lessons'; // 'lessons' | 'clubs'
  let mediaRecorder = null;
  let recordedChunks = [];
  let recTimer = null;
  let recStart = 0;

  // ---------- Utils ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function save() {
    try {
      const raw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(BACKUP_KEY, raw);
    } catch (e) {
      toast('Не удалось сохранить данные');
    }
  }

  function migrateState(parsed) {
    const base = {
      profile: { name: '', className: '', school: '', notes: '', photo: '' },
      lessons: [],
      clubs: [],
      buses: [],
      notes: [],
      people: [],
      holidays: [],
      packChecks: {},
      settings: { theme: 'light', activeDay: null, radius: 12, density: 'comfortable', fontSize: 16, shadows: true }
    };
    const s = { ...base, ...(parsed || {}) };
    s.profile = { ...base.profile, ...(s.profile || {}) };
    s.settings = { ...base.settings, ...(s.settings || {}) };
    for (const k of ['lessons', 'clubs', 'buses', 'notes', 'people', 'holidays']) {
      if (!Array.isArray(s[k])) s[k] = [];
    }
    if (!s.packChecks || typeof s.packChecks !== 'object') s.packChecks = {};
    return s;
  }

  function backupData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(BACKUP_KEY, raw);
    } catch (e) { console.warn('backup failed', e); }
  }

  function load() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      // If main data missing after update, try backup
      if (!raw) {
        const bak = localStorage.getItem(BACKUP_KEY);
        if (bak) {
          raw = bak;
          localStorage.setItem(STORAGE_KEY, bak);
          console.info('Restored data from backup after update');
        }
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        state = migrateState(parsed);
        // Keep a fresh backup of migrated data
        backupData();
      }
    } catch (e) {
      console.warn('Load error', e);
      try {
        const bak = localStorage.getItem(BACKUP_KEY);
        if (bak) state = migrateState(JSON.parse(bak));
      } catch (_) {}
    }
  }

  function toast(msg, ms = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function todayIndex() {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1; // Mon=0 ... Sun=6
  }

  function formatTime(t) {
    if (!t) return '';
    return t;
  }

  function parseTime(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesUntil(timeStr) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const target = parseTime(timeStr);
    if (target === null) return null;
    let diff = target - nowMin;
    if (diff < -12 * 60) diff += 24 * 60; // next day-ish
    return diff;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'light');
    applyAppearance();
  }

  function applyAppearance() {
    const s = state.settings || {};
    const r = Number(s.radius) || 12;
    document.documentElement.style.setProperty('--radius', r + 'px');
    document.documentElement.style.setProperty('--radius-sm', Math.max(4, r - 4) + 'px');
    document.documentElement.style.setProperty('--app-font-size', (Number(s.fontSize) || 16) + 'px');
    document.documentElement.setAttribute('data-density', s.density || 'comfortable');
    document.documentElement.setAttribute('data-shadows', s.shadows === false ? 'off' : 'on');
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
  }

  // ---------- Modal ----------
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalFooter = document.getElementById('modal-footer');

  function openModal(title, bodyHtml, footerHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = footerHtml || '';
    overlay.classList.remove('hidden');
  }

  function closeModal() {
    overlay.classList.add('hidden');
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.querySelector('.modal-close').addEventListener('click', closeModal);

  // ---------- Tabs ----------
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.querySelector(`.nav-btn[data-tab="${tab}"]`).classList.add('active');
    render();
  }

  document.getElementById('main-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.dataset.goto) switchTab(e.target.dataset.goto);
  });

  // ---------- Render helpers ----------
  function render() {
    if (currentTab === 'today') renderToday();
    else if (currentTab === 'schedule') renderSchedule();
    else if (currentTab === 'pack') renderPack();
    else if (currentTab === 'buses') renderBuses();
    else if (currentTab === 'notes') renderNotes();
    else if (currentTab === 'profile') renderProfile();
  }

  // ----- TODAY -----
  function renderToday() {
    const day = todayIndex();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    document.getElementById('today-date').textContent =
      now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    document.getElementById('today-weekday').textContent = DAYS_FULL[day];

    const lessons = state.lessons
      .filter(l => l.day === day)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const clubsToday = state.clubs
      .filter(c => c.day === day)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    const allToday = [
      ...lessons.map(l => ({ ...l, _type: 'lesson', _title: l.subject, _place: l.room || '' })),
      ...clubsToday.map(c => ({ ...c, _type: 'club', _title: c.name, _place: c.place || '' }))
    ].sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    // Buses: guess direction by destination keywords
    const morningBuses = state.buses.filter(b => {
      const t = parseTime(b.time);
      if (t === null) return false;
      const dest = (b.destination || '').toLowerCase();
      const looksHome = /дом|домой|home/.test(dest);
      return t < 12 * 60 && !looksHome;
    }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const eveningBuses = state.buses.filter(b => {
      const t = parseTime(b.time);
      if (t === null) return false;
      const dest = (b.destination || '').toLowerCase();
      const looksSchool = /школ|school|лицей|гимназ/.test(dest);
      return t >= 12 * 60 || /дом|домой|home/.test(dest);
    }).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const firstEvent = allToday[0] || null;
    const lastEvent = allToday.length ? allToday[allToday.length - 1] : null;

    // Best morning bus: arrives (bus time + small buffer) before first lesson, maximize spare
    let bestMorningBus = null;
    if (firstEvent) {
      const firstStart = parseTime(firstEvent.start);
      if (firstStart !== null) {
        let best = null;
        for (const b of morningBuses.length ? morningBuses : state.buses) {
          const bt = parseTime(b.time);
          if (bt === null) continue;
          const walk = Number(b.walkMin) || 0;
          // leave home at bus_time - walk; arrive school ~ bus_time + 5
          const arriveApprox = bt + 5;
          if (arriveApprox <= firstStart - 5) {
            const spare = firstStart - arriveApprox;
            if (!best || spare < best.spare) best = { bus: b, spare, leaveAt: bt - walk };
          }
        }
        // fallback: earliest bus of the day
        if (!best && state.buses.length) {
          const sorted = [...state.buses].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          const b = sorted[0];
          const bt = parseTime(b.time);
          const walk = Number(b.walkMin) || 0;
          if (bt !== null) best = { bus: b, spare: null, leaveAt: bt - walk };
        }
        bestMorningBus = best;
      }
    }

    // Best evening bus after last event
    let bestEveningBus = null;
    if (lastEvent) {
      const lastEnd = parseTime(lastEvent.end) || (parseTime(lastEvent.start) !== null ? parseTime(lastEvent.start) + 45 : null);
      if (lastEnd !== null) {
        const candidates = (eveningBuses.length ? eveningBuses : state.buses)
          .map(b => ({ b, t: parseTime(b.time) }))
          .filter(x => x.t !== null && x.t >= lastEnd - 5)
          .sort((a, b) => a.t - b.t);
        if (candidates.length) {
          const c = candidates[0];
          const walk = Number(c.b.walkMin) || 0;
          bestEveningBus = { bus: c.b, leaveSchoolAt: c.t - walk, busTime: c.t };
        }
      }
    }

    // ---- HERO: what to do right now ----
    let heroHtml = '';
    let current = null, next = null;
    for (const item of allToday) {
      const start = parseTime(item.start);
      const end = parseTime(item.end) || (start !== null ? start + 45 : null);
      if (start === null) continue;
      if (nowMin >= start && (end === null || nowMin < end)) { current = item; break; }
      if (nowMin < start && !next) next = item;
    }

    // Morning leave guidance (before first event)
    if (!current && firstEvent && bestMorningBus && nowMin < parseTime(firstEvent.start)) {
      const leaveAt = bestMorningBus.leaveAt;
      const bus = bestMorningBus.bus;
      const untilLeave = leaveAt - nowMin;
      if (untilLeave > 0 && untilLeave <= 90) {
        heroHtml = `
          <div class="hero-card urgent">
            <div class="hero-label">Пора собираться</div>
            <div class="hero-title">Выходи из дома через ${untilLeave} мин</div>
            <div class="hero-meta">Автобус № ${escapeHtml(bus.number)} в ${formatTime(bus.time)}${bus.destination ? ' → ' + escapeHtml(bus.destination) : ''}</div>
            <div class="hero-meta">До остановки ~${Number(bus.walkMin) || 0} мин · первый урок ${formatTime(firstEvent.start)} (${escapeHtml(firstEvent._title)})</div>
          </div>`;
      } else if (untilLeave <= 0 && nowMin < parseTime(bus.time) + 5) {
        heroHtml = `
          <div class="hero-card urgent">
            <div class="hero-label">Срочно</div>
            <div class="hero-title">Выходи сейчас на автобус № ${escapeHtml(bus.number)}</div>
            <div class="hero-meta">Отправление ${formatTime(bus.time)} · до остановки ~${Number(bus.walkMin) || 0} мин</div>
          </div>`;
      } else if (untilLeave > 90) {
        heroHtml = `
          <div class="hero-card">
            <div class="hero-label">Утром</div>
            <div class="hero-title">Выйти из дома в ${formatMinutes(Math.max(0, leaveAt))}</div>
            <div class="hero-meta">Автобус № ${escapeHtml(bus.number)} в ${formatTime(bus.time)} → к ${formatTime(firstEvent.start)} на ${escapeHtml(firstEvent._title)}</div>
          </div>`;
      }
    }

    if (!heroHtml && current) {
      const endMin = parseTime(current.end) || (parseTime(current.start) + 45);
      const left = endMin - nowMin;
      const place = current._place;
      heroHtml = `
        <div class="hero-card current">
          <div class="hero-label">Сейчас</div>
          <div class="hero-title">${current._type === 'club' ? '🎯 ' : ''}${escapeHtml(current._title)}</div>
          <div class="hero-meta">${place ? 'Иди в: <strong>' + escapeHtml(place) + '</strong> · ' : ''}ещё ${left > 0 ? left : 0} мин${current.teacher ? ' · ' + escapeHtml(current.teacher) : ''}</div>
          ${current.items && current.items.length ? `<div class="hero-items">Возьми: ${current.items.map(i => escapeHtml(i)).join(', ')}</div>` : ''}
        </div>`;
    } else if (!heroHtml && next) {
      const until = parseTime(next.start) - nowMin;
      const place = next._place;
      // transition hint
      let transition = '';
      if (current === null && allToday.length) {
        // find previous finished
        const prev = [...allToday].reverse().find(it => {
          const e = parseTime(it.end) || (parseTime(it.start) + 45);
          return e !== null && e <= nowMin;
        });
        if (prev && prev._place && place && prev._place !== place) {
          transition = `Переход: ${escapeHtml(prev._place)} → ${escapeHtml(place)}`;
        }
      }
      heroHtml = `
        <div class="hero-card next">
          <div class="hero-label">Дальше через ${until} мин</div>
          <div class="hero-title">${next._type === 'club' ? '🎯 ' : ''}${escapeHtml(next._title)}</div>
          <div class="hero-meta">${formatTime(next.start)}${next.end ? '–' + formatTime(next.end) : ''}${place ? ' · <strong>' + escapeHtml(place) + '</strong>' : ''}</div>
          ${transition ? `<div class="hero-meta">${transition}</div>` : ''}
          ${next.items && next.items.length ? `<div class="hero-items">Возьми: ${next.items.map(i => escapeHtml(i)).join(', ')}</div>` : ''}
        </div>`;
    } else if (!heroHtml && bestEveningBus && lastEvent) {
      const lastEnd = parseTime(lastEvent.end) || (parseTime(lastEvent.start) + 45);
      if (nowMin >= lastEnd - 15) {
        const untilBus = bestEveningBus.busTime - nowMin;
        const leaveIn = bestEveningBus.leaveSchoolAt - nowMin;
        if (leaveIn <= 0) {
          heroHtml = `
            <div class="hero-card urgent">
              <div class="hero-label">Домой</div>
              <div class="hero-title">Выходи на автобус № ${escapeHtml(bestEveningBus.bus.number)}</div>
              <div class="hero-meta">Отправление ${formatTime(bestEveningBus.bus.time)}${bestEveningBus.bus.destination ? ' → ' + escapeHtml(bestEveningBus.bus.destination) : ''}</div>
            </div>`;
        } else if (untilBus > 0) {
          heroHtml = `
            <div class="hero-card next">
              <div class="hero-label">После занятий</div>
              <div class="hero-title">К автобусу через ${leaveIn} мин</div>
              <div class="hero-meta">№ ${escapeHtml(bestEveningBus.bus.number)} в ${formatTime(bestEveningBus.bus.time)} · идти ~${Number(bestEveningBus.bus.walkMin) || 0} мин</div>
            </div>`;
        }
      }
    }

    if (!heroHtml) {
      if (!allToday.length && !state.buses.length) {
        heroHtml = `<div class="hero-card muted"><div class="hero-label">Пока пусто</div><div class="hero-title">Добавь уроки и автобус</div><div class="hero-meta">Тогда здесь появится: когда выходить и куда идти</div></div>`;
      } else if (!allToday.length) {
        heroHtml = `<div class="hero-card muted"><div class="hero-label">Сегодня</div><div class="hero-title">Уроков и кружков нет</div></div>`;
      } else {
        heroHtml = `<div class="hero-card muted"><div class="hero-label">Готово</div><div class="hero-title">На сегодня всё закончилось</div></div>`;
      }
    }
    document.getElementById('dash-hero').innerHTML = heroHtml;

    // ---- Secondary status chips ----
    let statusHtml = '';
    const freeSlots = computeFreeSlots(day, 8 * 60, 18 * 60);
    if (freeSlots.length) {
      const freeText = freeSlots.slice(0, 3).map(s => `${formatMinutes(s.start)}–${formatMinutes(s.end)}`).join(', ');
      statusHtml += `<div class="today-status free-slots">Окна: <strong>${freeText}</strong></div>`;
    }
    if (bestMorningBus && firstEvent && nowMin < parseTime(firstEvent.start)) {
      statusHtml += `<div class="today-status">Утром: выйти ~<strong>${formatMinutes(Math.max(0, bestMorningBus.leaveAt))}</strong> → авт. ${escapeHtml(bestMorningBus.bus.number)}</div>`;
    }
    if (bestEveningBus) {
      statusHtml += `<div class="today-status">Домой: авт. <strong>${escapeHtml(bestEveningBus.bus.number)}</strong> в ${formatTime(bestEveningBus.bus.time)} (выйти с уроков ~${formatMinutes(bestEveningBus.leaveSchoolAt)})</div>`;
    }
    // Birthdays soon
    const bdays = getUpcomingBirthdays(14);
    if (bdays.length) {
      statusHtml += bdays.slice(0, 3).map(b => {
        const when = b.days === 0 ? 'сегодня' : b.days === 1 ? 'завтра' : `через ${b.days} дн.`;
        return `<div class="today-status bday">🎂 <strong>${escapeHtml(b.person.name)}</strong> — ДР ${when}${b.person.likes ? ' · любит: ' + escapeHtml(b.person.likes) : ''}</div>`;
      }).join('');
    }

    // Holidays
    const activeH = getActiveHoliday();
    const nextH = getNextHoliday();
    if (activeH) {
      const endL = activeH.end ? new Date(activeH.end + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
      statusHtml += `<div class="today-status free-slots">🏖️ Сейчас <strong>${escapeHtml(activeH.name)}</strong>${endL ? ' до ' + endL : ''}${activeH.homework ? ' · есть задания' : ''}</div>`;
      if (activeH.homework) {
        statusHtml += `<div class="today-status">📝 Задания: ${escapeHtml(activeH.homework.slice(0, 120))}${activeH.homework.length > 120 ? '…' : ''}</div>`;
      }
    } else if (nextH) {
      const startL = nextH.start ? new Date(nextH.start + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
      statusHtml += `<div class="today-status">🏖️ Ближайшие каникулы: <strong>${escapeHtml(nextH.name)}</strong> с ${startL}</div>`;
    }

    document.getElementById('dash-status').innerHTML = statusHtml;

    // ---- Day timeline ----
    renderDayTimeline(day, allToday, bestMorningBus, bestEveningBus, nowMin);

    // ---- Week grid ----
    renderWeekGrid();

    // ---- Today's detailed list ----
    const list = document.getElementById('today-lessons');
    const empty = document.getElementById('today-empty');

    if (!allToday.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = allToday.map((item, idx) => {
        const start = parseTime(item.start);
        const end = parseTime(item.end) || (start !== null ? start + 45 : null);
        let cls = item._type === 'club' ? ' club-card' : '';
        if (start !== null) {
          if (nowMin >= start && (end === null || nowMin < end)) cls += ' lesson-current';
          else if (end !== null && nowMin >= end) cls += ' lesson-past';
        }
        // gap to next
        let gapHtml = '';
        if (idx < allToday.length - 1) {
          const nextStart = parseTime(allToday[idx + 1].start);
          if (end !== null && nextStart !== null && nextStart - end >= 15) {
            gapHtml = `<div class="gap-hint">Свободно ${nextStart - end} мин до следующего</div>`;
          } else if (end !== null && nextStart !== null && item._place && allToday[idx + 1]._place && item._place !== allToday[idx + 1]._place) {
            gapHtml = `<div class="gap-hint">Потом переход в ${escapeHtml(allToday[idx + 1]._place)}</div>`;
          }
        }
        return `
        <div class="card${cls}">
          <div class="card-header">
            <div>
              <div class="card-title">${item._type === 'club' ? '🎯 ' : ''}${escapeHtml(item._title)}</div>
              <div class="card-meta">
                <span class="time-badge">${formatTime(item.start)}${item.end ? ' – ' + formatTime(item.end) : ''}</span>
                ${item._place ? ' · ' + escapeHtml(item._place) : ''}
                ${item.teacher ? ' · ' + escapeHtml(item.teacher) : ''}
              </div>
            </div>
          </div>
          ${item.items && item.items.length ? `
            <div class="card-tags">
              ${item.items.map(i => `<span class="tag">${escapeHtml(i)}</span>`).join('')}
            </div>` : ''}
          ${gapHtml}
        </div>`;
      }).join('');
    }

    // Quick pack
    const packEl = document.getElementById('today-pack-list');
    const itemsMap = collectItemsForDay(day);
    if (!Object.keys(itemsMap).length) {
      packEl.innerHTML = '<p class="hint">Вещей на сегодня не указано</p>';
    } else {
      const entries = Object.entries(itemsMap);
      const total = entries.length;
      const done = entries.filter(([k]) => state.packChecks[k]).length;
      packEl.innerHTML = `<p class="hint" style="margin-bottom:8px">Собрано ${done} из ${total}</p>` + entries.map(([key, info]) => {
        const checked = !!state.packChecks[key];
        return `
          <label class="pack-item ${checked ? 'checked' : ''}">
            <input type="checkbox" data-key="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
            <span class="pack-label">${escapeHtml(info.name)}</span>
            <span class="pack-source">${escapeHtml(info.subjects.join(', '))}</span>
          </label>
        `;
      }).join('');
      packEl.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', () => {
          state.packChecks[inp.dataset.key] = inp.checked;
          save();
          renderToday();
        });
      });
    }
  }

  function renderDayTimeline(day, allToday, bestMorningBus, bestEveningBus, nowMin) {
    const el = document.getElementById('day-timeline');
    if (!el) return;
    const steps = [];

    if (bestMorningBus) {
      const b = bestMorningBus.bus;
      const leaveAt = bestMorningBus.leaveAt;
      const done = nowMin >= parseTime(b.time);
      const active = !done && nowMin >= leaveAt - 15;
      steps.push({
        time: formatMinutes(Math.max(0, leaveAt)),
        title: 'Выйти из дома',
        meta: `Авт. № ${b.number} в ${formatTime(b.time)}` + (b.destination ? ` → ${b.destination}` : ''),
        done, active, kind: 'bus'
      });
    }

    allToday.forEach((item, idx) => {
      const start = parseTime(item.start);
      const end = parseTime(item.end) || (start !== null ? start + 45 : null);
      const done = end !== null && nowMin >= end;
      const active = start !== null && nowMin >= start && (end === null || nowMin < end);
      steps.push({
        time: formatTime(item.start),
        title: (item._type === 'club' ? '🎯 ' : '') + item._title,
        meta: (item._place ? item._place : '') + (item.end ? ` · до ${formatTime(item.end)}` : ''),
        done, active, kind: item._type
      });
    });

    if (bestEveningBus) {
      const b = bestEveningBus.bus;
      const done = nowMin >= bestEveningBus.busTime;
      const active = !done && nowMin >= bestEveningBus.leaveSchoolAt - 10;
      steps.push({
        time: formatTime(b.time),
        title: 'Автобус домой',
        meta: `№ ${b.number}` + (b.destination ? ` → ${b.destination}` : '') + ` · выйти с уроков ~${formatMinutes(bestEveningBus.leaveSchoolAt)}`,
        done, active, kind: 'bus'
      });
    }

    if (!steps.length) {
      el.innerHTML = '<p class="hint">Добавь уроки и автобусы — здесь появится цепочка дня</p>';
      return;
    }

    el.innerHTML = steps.map((s, i) => `
      <div class="tl-step ${s.done ? 'done' : ''} ${s.active ? 'active' : ''} ${s.kind}">
        <div class="tl-rail">
          <div class="tl-dot"></div>
          ${i < steps.length - 1 ? '<div class="tl-line"></div>' : ''}
        </div>
        <div class="tl-body">
          <div class="tl-time">${escapeHtml(s.time)}</div>
          <div class="tl-title">${escapeHtml(s.title)}</div>
          ${s.meta ? `<div class="tl-meta">${escapeHtml(s.meta)}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  function formatMinutes(m) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }

  function computeFreeSlots(day, fromMin, toMin) {
    const events = [];
    state.lessons.filter(l => l.day === day).forEach(l => {
      const s = parseTime(l.start), e = parseTime(l.end) || (s !== null ? s + 45 : null);
      if (s !== null && e !== null) events.push({ start: s, end: e });
    });
    state.clubs.filter(c => c.day === day).forEach(c => {
      const s = parseTime(c.start), e = parseTime(c.end) || (s !== null ? s + 60 : null);
      if (s !== null && e !== null) events.push({ start: s, end: e });
    });
    events.sort((a, b) => a.start - b.start);
    // merge overlapping
    const merged = [];
    for (const ev of events) {
      if (!merged.length || ev.start > merged[merged.length - 1].end) merged.push({ ...ev });
      else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, ev.end);
    }
    const free = [];
    let cursor = fromMin;
    for (const ev of merged) {
      if (ev.start > cursor) free.push({ start: cursor, end: Math.min(ev.start, toMin) });
      cursor = Math.max(cursor, ev.end);
    }
    if (cursor < toMin) free.push({ start: cursor, end: toMin });
    return free.filter(s => s.end - s.start >= 20); // at least 20 min
  }

  function renderWeekGrid() {
    const grid = document.getElementById('week-grid');
    if (!grid) return;

    // Time range 8:00 – 18:00, 30-min slots for positioning
    const dayStart = 8 * 60;
    const dayEnd = 18 * 60;
    const totalMin = dayEnd - dayStart;
    const hourMarks = [];
    for (let h = 8; h <= 18; h++) hourMarks.push(h);

    // Collect all events for the week
    const byDay = Array.from({ length: 7 }, () => []);
    state.lessons.forEach(l => {
      const s = parseTime(l.start), e = parseTime(l.end) || (s !== null ? s + 45 : null);
      if (s === null || e === null) return;
      byDay[l.day].push({ start: s, end: e, title: l.subject, type: 'lesson', room: l.room || '' });
    });
    state.clubs.forEach(c => {
      const s = parseTime(c.start), e = parseTime(c.end) || (s !== null ? s + 60 : null);
      if (s === null || e === null) return;
      byDay[c.day].push({ start: s, end: e, title: c.name, type: 'club', room: c.place || '' });
    });
    byDay.forEach(arr => arr.sort((a, b) => a.start - b.start));

    const today = todayIndex();
    const colH = 280; // px height of grid body

    let html = `<div class="wg-times">`;
    for (let h = 8; h < 18; h++) {
      html += `<div class="wg-hour" style="height:${colH / 10}px">${String(h).padStart(2,'0')}:00</div>`;
    }
    html += `</div><div class="wg-days">`;

    for (let d = 0; d < 7; d++) {
      const isToday = d === today;
      html += `<div class="wg-day${isToday ? ' is-today' : ''}">`;
      html += `<div class="wg-day-label">${DAYS[d]}</div>`;
      html += `<div class="wg-day-body" style="height:${colH}px">`;
      // free background is default
      for (const ev of byDay[d]) {
        const top = ((Math.max(ev.start, dayStart) - dayStart) / totalMin) * 100;
        const height = ((Math.min(ev.end, dayEnd) - Math.max(ev.start, dayStart)) / totalMin) * 100;
        if (height <= 0) continue;
        const short = ev.title.length > 10 ? ev.title.slice(0, 9) + '…' : ev.title;
        html += `<div class="wg-block ${ev.type}" style="top:${top}%;height:${Math.max(height, 3)}%" title="${escapeHtml(ev.title)} ${formatMinutes(ev.start)}–${formatMinutes(ev.end)}${ev.room ? ' · ' + ev.room : ''}">
          <span class="wg-block-title">${escapeHtml(short)}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    grid.innerHTML = html;
  }

  function collectItemsForDay(day) {
    const map = {};
    state.lessons.filter(l => l.day === day).forEach(l => {
      (l.items || []).forEach(item => {
        const key = item.trim().toLowerCase();
        if (!key) return;
        if (!map[key]) map[key] = { name: item.trim(), subjects: [] };
        if (!map[key].subjects.includes(l.subject)) map[key].subjects.push(l.subject);
      });
    });
    state.clubs.filter(c => c.day === day).forEach(c => {
      (c.items || []).forEach(item => {
        const key = item.trim().toLowerCase();
        if (!key) return;
        if (!map[key]) map[key] = { name: item.trim(), subjects: [] };
        if (!map[key].subjects.includes(c.name)) map[key].subjects.push(c.name);
      });
    });
    return map;
  }

  // ----- SCHEDULE -----
  function renderSchedule() {
    // type switcher
    document.querySelectorAll('#schedule-type .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === scheduleType);
    });

    const tabs = document.getElementById('day-tabs');
    tabs.innerHTML = DAYS.map((d, i) =>
      `<button class="day-tab ${i === currentScheduleDay ? 'active' : ''}" data-day="${i}">${d}</button>`
    ).join('');
    tabs.querySelectorAll('.day-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentScheduleDay = +btn.dataset.day;
        renderSchedule();
      });
    });

    const list = document.getElementById('schedule-list');
    const empty = document.getElementById('schedule-empty');
    const addBtn = document.getElementById('add-schedule-btn');

    if (scheduleType === 'lessons') {
      addBtn.textContent = '+ Урок';
      const items = state.lessons
        .filter(l => l.day === currentScheduleDay)
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

      if (!items.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        empty.querySelector('p').textContent = 'Уроков нет. Добавьте первый урок.';
      } else {
        empty.classList.add('hidden');
        list.innerHTML = items.map(l => `
          <div class="card" data-id="${l.id}">
            <div class="card-header">
              <div>
                <div class="card-title">${escapeHtml(l.subject)}</div>
                <div class="card-meta">
                  <span class="time-badge">${formatTime(l.start)}${l.end ? ' – ' + formatTime(l.end) : ''}</span>
                  ${l.room ? ' · каб. ' + escapeHtml(l.room) : ''}
                  ${l.teacher ? ' · ' + escapeHtml(l.teacher) : ''}
                </div>
              </div>
              <div class="card-actions">
                <button class="btn-icon edit-item" data-id="${l.id}" title="Изменить">✎</button>
                <button class="btn-icon delete-item" data-id="${l.id}" title="Удалить">×</button>
              </div>
            </div>
            ${l.items && l.items.length ? `
              <div class="card-tags">
                ${l.items.map(i => `<span class="tag primary">${escapeHtml(i)}</span>`).join('')}
              </div>` : ''}
          </div>
        `).join('');

        list.querySelectorAll('.edit-item').forEach(b => b.addEventListener('click', () => openLessonModal(b.dataset.id)));
        list.querySelectorAll('.delete-item').forEach(b => b.addEventListener('click', () => {
          if (confirm('Удалить урок?')) {
            state.lessons = state.lessons.filter(l => l.id !== b.dataset.id);
            save();
            renderSchedule();
            toast('Урок удалён');
          }
        }));
      }
    } else {
      // clubs
      addBtn.textContent = '+ Кружок';
      const items = state.clubs
        .filter(c => c.day === currentScheduleDay)
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

      if (!items.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        empty.querySelector('p').textContent = 'Кружков нет. Добавьте первый.';
      } else {
        empty.classList.add('hidden');
        list.innerHTML = items.map(c => `
          <div class="card" data-id="${c.id}">
            <div class="card-header">
              <div>
                <div class="card-title">${escapeHtml(c.name)}</div>
                <div class="card-meta">
                  <span class="time-badge">${formatTime(c.start)}${c.end ? ' – ' + formatTime(c.end) : ''}</span>
                  ${c.place ? ' · ' + escapeHtml(c.place) : ''}
                  ${c.teacher ? ' · ' + escapeHtml(c.teacher) : ''}
                </div>
              </div>
              <div class="card-actions">
                <button class="btn-icon edit-item" data-id="${c.id}" title="Изменить">✎</button>
                <button class="btn-icon delete-item" data-id="${c.id}" title="Удалить">×</button>
              </div>
            </div>
            ${c.notes ? `<div class="card-body" style="font-size:0.85rem;color:var(--text-secondary)">${escapeHtml(c.notes)}</div>` : ''}
            ${c.items && c.items.length ? `
              <div class="card-tags">
                ${c.items.map(i => `<span class="tag primary">${escapeHtml(i)}</span>`).join('')}
              </div>` : ''}
          </div>
        `).join('');

        list.querySelectorAll('.edit-item').forEach(b => b.addEventListener('click', () => openClubModal(b.dataset.id)));
        list.querySelectorAll('.delete-item').forEach(b => b.addEventListener('click', () => {
          if (confirm('Удалить кружок?')) {
            state.clubs = state.clubs.filter(c => c.id !== b.dataset.id);
            save();
            renderSchedule();
            toast('Удалено');
          }
        }));
      }
    }
  }

  function openLessonModal(id) {
    const lesson = id ? state.lessons.find(l => l.id === id) : null;
    const isEdit = !!lesson;

    openModal(isEdit ? 'Редактировать урок' : 'Новый урок', `
      <form id="lesson-form" class="form">
        <label>День
          <select id="lf-day" class="select">
            ${DAYS.map((d, i) => `<option value="${i}" ${(lesson ? lesson.day : currentScheduleDay) === i ? 'selected' : ''}>${DAYS_FULL[i]}</option>`).join('')}
          </select>
        </label>
        <label>Предмет *
          <input type="text" id="lf-subject" class="input" required value="${lesson ? escapeHtml(lesson.subject) : ''}" placeholder="Математика">
        </label>
        <div style="display:flex;gap:10px">
          <label style="flex:1">Начало
            <input type="time" id="lf-start" class="input" value="${lesson ? lesson.start || '' : ''}">
          </label>
          <label style="flex:1">Конец
            <input type="time" id="lf-end" class="input" value="${lesson ? lesson.end || '' : ''}">
          </label>
        </div>
        <label>Кабинет
          <input type="text" id="lf-room" class="input" value="${lesson ? escapeHtml(lesson.room || '') : ''}" placeholder="305">
        </label>
        <label>Учитель
          <input type="text" id="lf-teacher" class="input" value="${lesson ? escapeHtml(lesson.teacher || '') : ''}" placeholder="Иванова А.П.">
        </label>
        <label>Что взять (через запятую)
          <input type="text" id="lf-items" class="input" value="${lesson && lesson.items ? escapeHtml(lesson.items.join(', ')) : ''}" placeholder="тетрадь, учебник, линейка">
        </label>
      </form>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Сохранить' : 'Добавить'}</button>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
      const subject = document.getElementById('lf-subject').value.trim();
      if (!subject) { toast('Укажите предмет'); return; }
      const itemsRaw = document.getElementById('lf-items').value;
      const items = itemsRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean);

      const data = {
        id: lesson ? lesson.id : uid(),
        day: +document.getElementById('lf-day').value,
        subject,
        start: document.getElementById('lf-start').value,
        end: document.getElementById('lf-end').value,
        room: document.getElementById('lf-room').value.trim(),
        teacher: document.getElementById('lf-teacher').value.trim(),
        items
      };

      if (isEdit) {
        const idx = state.lessons.findIndex(l => l.id === id);
        state.lessons[idx] = data;
      } else {
        state.lessons.push(data);
      }
      save();
      closeModal();
      currentScheduleDay = data.day;
      scheduleType = 'lessons';
      renderSchedule();
      toast(isEdit ? 'Урок обновлён' : 'Урок добавлен');
    };
  }

  function openClubModal(id) {
    const club = id ? state.clubs.find(c => c.id === id) : null;
    const isEdit = !!club;

    openModal(isEdit ? 'Редактировать кружок' : 'Новый кружок / доп. занятие', `
      <form class="form">
        <label>День
          <select id="cf-day" class="select">
            ${DAYS.map((d, i) => `<option value="${i}" ${(club ? club.day : currentScheduleDay) === i ? 'selected' : ''}>${DAYS_FULL[i]}</option>`).join('')}
          </select>
        </label>
        <label>Название *
          <input type="text" id="cf-name" class="input" required value="${club ? escapeHtml(club.name) : ''}" placeholder="Робототехника / Футбол / Английский">
        </label>
        <div style="display:flex;gap:10px">
          <label style="flex:1">Начало
            <input type="time" id="cf-start" class="input" value="${club ? club.start || '' : ''}">
          </label>
          <label style="flex:1">Конец
            <input type="time" id="cf-end" class="input" value="${club ? club.end || '' : ''}">
          </label>
        </div>
        <label>Место
          <input type="text" id="cf-place" class="input" value="${club ? escapeHtml(club.place || '') : ''}" placeholder="Спортзал / каб. 12">
        </label>
        <label>Преподаватель / тренер
          <input type="text" id="cf-teacher" class="input" value="${club ? escapeHtml(club.teacher || '') : ''}" placeholder="">
        </label>
        <label>Что взять (через запятую)
          <input type="text" id="cf-items" class="input" value="${club && club.items ? escapeHtml(club.items.join(', ')) : ''}" placeholder="форма, кроссовки">
        </label>
        <label>Заметки
          <input type="text" id="cf-notes" class="input" value="${club ? escapeHtml(club.notes || '') : ''}" placeholder="Не забыть...">
        </label>
      </form>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Сохранить' : 'Добавить'}</button>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
      const name = document.getElementById('cf-name').value.trim();
      if (!name) { toast('Укажите название'); return; }
      const itemsRaw = document.getElementById('cf-items').value;
      const items = itemsRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean);

      const data = {
        id: club ? club.id : uid(),
        day: +document.getElementById('cf-day').value,
        name,
        start: document.getElementById('cf-start').value,
        end: document.getElementById('cf-end').value,
        place: document.getElementById('cf-place').value.trim(),
        teacher: document.getElementById('cf-teacher').value.trim(),
        items,
        notes: document.getElementById('cf-notes').value.trim()
      };

      if (isEdit) {
        const idx = state.clubs.findIndex(c => c.id === id);
        state.clubs[idx] = data;
      } else {
        state.clubs.push(data);
      }
      save();
      closeModal();
      currentScheduleDay = data.day;
      scheduleType = 'clubs';
      renderSchedule();
      toast(isEdit ? 'Сохранено' : 'Кружок добавлен');
    };
  }

  // ----- PACK -----
  function renderPack() {
    const select = document.getElementById('pack-day-select');
    if (!select.options.length) {
      select.innerHTML = DAYS.map((d, i) =>
        `<option value="${i}">${DAYS_FULL[i]}</option>`
      ).join('');
    }
    if (select.value === '') select.value = todayIndex();

    const day = +select.value;
    const itemsMap = collectItemsForDay(day);
    const list = document.getElementById('pack-list');
    const empty = document.getElementById('pack-empty');

    if (!Object.keys(itemsMap).length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = Object.entries(itemsMap).map(([key, info]) => {
        const checked = !!state.packChecks[key];
        return `
          <label class="pack-item ${checked ? 'checked' : ''}">
            <input type="checkbox" data-key="${escapeHtml(key)}" ${checked ? 'checked' : ''}>
            <span class="pack-label">${escapeHtml(info.name)}</span>
            <span class="pack-source">${escapeHtml(info.subjects.join(', '))}</span>
          </label>
        `;
      }).join('');
      list.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', () => {
          state.packChecks[inp.dataset.key] = inp.checked;
          save();
          renderPack();
        });
      });
    }
  }

  document.getElementById('pack-day-select').addEventListener('change', renderPack);
  document.getElementById('reset-pack-checks').addEventListener('click', () => {
    state.packChecks = {};
    save();
    renderPack();
    toast('Галочки сброшены');
  });

  // ----- BUSES -----
  function renderBuses() {
    const list = document.getElementById('buses-list');
    const empty = document.getElementById('buses-empty');

    if (!state.buses.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    const sorted = [...state.buses].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    list.innerHTML = sorted.map(b => {
      const until = minutesUntil(b.time);
      const leaveIn = until !== null && b.walkMin ? until - b.walkMin : null;
      let countdownHtml = '';
      if (until !== null) {
        if (until < 0) {
          countdownHtml = `<span class="bus-countdown past">ушёл</span>`;
        } else if (leaveIn !== null && leaveIn <= 0) {
          countdownHtml = `<span class="bus-countdown urgent">выходи сейчас</span>`;
        } else if (leaveIn !== null) {
          countdownHtml = `<span class="bus-countdown ${leaveIn <= 10 ? 'urgent' : ''}">выходи через ${leaveIn} мин</span>`;
        } else {
          countdownHtml = `<span class="bus-countdown">через ${until} мин</span>`;
        }
      }

      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">№ ${escapeHtml(b.number)} <span class="bus-time">${formatTime(b.time)}</span></div>
              <div class="card-meta">${escapeHtml(b.destination || '')}</div>
            </div>
            <div class="card-actions">
              ${countdownHtml}
              <button class="btn-icon edit-bus" data-id="${b.id}" title="Изменить">✎</button>
              <button class="btn-icon delete-bus" data-id="${b.id}" title="Удалить">×</button>
            </div>
          </div>
          <div class="card-body">
            ${b.walkMin ? `Идти ${b.walkMin} мин` : ''}
            ${b.notes ? (b.walkMin ? ' · ' : '') + escapeHtml(b.notes) : ''}
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.edit-bus').forEach(btn => btn.addEventListener('click', () => openBusModal(btn.dataset.id)));
    list.querySelectorAll('.delete-bus').forEach(btn => btn.addEventListener('click', () => {
      if (confirm('Удалить маршрут?')) {
        state.buses = state.buses.filter(b => b.id !== btn.dataset.id);
        save();
        renderBuses();
        toast('Удалено');
      }
    }));
  }

  function openBusModal(id) {
    const bus = id ? state.buses.find(b => b.id === id) : null;
    const isEdit = !!bus;

    openModal(isEdit ? 'Редактировать маршрут' : 'Новый маршрут', `
      <form class="form">
        <label>Номер автобуса *
          <input type="text" id="bf-number" class="input" required value="${bus ? escapeHtml(bus.number) : ''}" placeholder="42">
        </label>
        <label>Время отправления *
          <input type="time" id="bf-time" class="input" required value="${bus ? bus.time || '' : ''}">
        </label>
        <label>Куда (пиши «Школа» или «Дом» — так планер поймёт направление)
          <input type="text" id="bf-dest" class="input" value="${bus ? escapeHtml(bus.destination || '') : ''}" placeholder="Школа / Дом">
        </label>
        <label>Сколько минут идти до остановки
          <input type="number" id="bf-walk" class="input" min="0" max="120" value="${bus ? bus.walkMin || '' : ''}" placeholder="7">
        </label>
        <label>Заметки
          <input type="text" id="bf-notes" class="input" value="${bus ? escapeHtml(bus.notes || '') : ''}" placeholder="От остановки у парка">
        </label>
      </form>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Сохранить' : 'Добавить'}</button>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
      const number = document.getElementById('bf-number').value.trim();
      const time = document.getElementById('bf-time').value;
      if (!number || !time) { toast('Укажите номер и время'); return; }

      const data = {
        id: bus ? bus.id : uid(),
        number,
        time,
        destination: document.getElementById('bf-dest').value.trim(),
        walkMin: parseInt(document.getElementById('bf-walk').value, 10) || 0,
        notes: document.getElementById('bf-notes').value.trim()
      };

      if (isEdit) {
        const idx = state.buses.findIndex(b => b.id === id);
        state.buses[idx] = data;
      } else {
        state.buses.push(data);
      }
      save();
      closeModal();
      renderBuses();
      toast(isEdit ? 'Обновлено' : 'Добавлено');
    };
  }

  // ----- NOTES -----
  function renderNotes() {
    const q = (document.getElementById('notes-search').value || '').toLowerCase().trim();
    let notes = [...state.notes].sort((a, b) => (b.updated || b.created) - (a.updated || a.created));
    if (q) {
      notes = notes.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q)
      );
    }

    const list = document.getElementById('notes-list');
    const empty = document.getElementById('notes-empty');

    if (!notes.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent = q ? 'Ничего не найдено' : 'Заметок пока нет';
    } else {
      empty.classList.add('hidden');
      list.innerHTML = notes.map(n => `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(n.title || 'Без названия')}${n.audio ? ' 🎤' : ''}</div>
              <div class="card-meta">${new Date(n.updated || n.created).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="card-actions">
              <button class="btn-icon edit-note" data-id="${n.id}" title="Изменить">✎</button>
              <button class="btn-icon delete-note" data-id="${n.id}" title="Удалить">×</button>
            </div>
          </div>
          ${n.body ? `<div class="card-body" style="white-space:pre-wrap;font-size:0.9rem">${escapeHtml(n.body)}</div>` : ''}
          ${n.audio ? `<div style="margin-top:10px"><audio controls src="data:${n.audioMime || 'audio/webm'};base64,${n.audio}" style="width:100%;max-height:40px"></audio>
            <button class="btn btn-secondary btn-sm transcribe-note" data-id="${n.id}" style="margin-top:6px">🎤→ Текст (надиктовать)</button>
            <p class="hint" style="margin-top:4px;font-size:0.75rem">Расшифровка через микрофон браузера (Chrome). Прослушай запись и надиктуй текст.</p>
          </div>` : ''}
        </div>
      `).join('');

      list.querySelectorAll('.edit-note').forEach(b => b.addEventListener('click', () => openNoteModal(b.dataset.id)));
      list.querySelectorAll('.transcribe-note').forEach(b => b.addEventListener('click', () => transcribeWithMicToNote(b.dataset.id)));
      list.querySelectorAll('.delete-note').forEach(b => b.addEventListener('click', () => {
        if (confirm('Удалить заметку?')) {
          state.notes = state.notes.filter(n => n.id !== b.dataset.id);
          save();
          renderNotes();
          toast('Удалено');
        }
      }));
    }
  }

  document.getElementById('notes-search').addEventListener('input', () => renderNotes());

  function openNoteModal(id) {
    const note = id ? state.notes.find(n => n.id === id) : null;
    const isEdit = !!note;

    openModal(isEdit ? 'Редактировать заметку' : 'Новая заметка', `
      <form class="form">
        <label>Заголовок
          <input type="text" id="nf-title" class="input" value="${note ? escapeHtml(note.title || '') : ''}" placeholder="Тема">
        </label>
        <label>Текст
          <textarea id="nf-body" class="input textarea" rows="6" placeholder="Текст заметки...">${note ? escapeHtml(note.body || '') : ''}</textarea>
        </label>
      </form>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Сохранить' : 'Добавить'}</button>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
      const title = document.getElementById('nf-title').value.trim();
      const body = document.getElementById('nf-body').value.trim();
      if (!title && !body) { toast('Заметка пустая'); return; }

      const now = Date.now();
      if (isEdit) {
        const idx = state.notes.findIndex(n => n.id === id);
        state.notes[idx] = { ...state.notes[idx], title, body, updated: now };
      } else {
        state.notes.push({ id: uid(), title, body, created: now, updated: now });
      }
      save();
      closeModal();
      renderNotes();
      toast(isEdit ? 'Сохранено' : 'Добавлено');
    };
  }

  // ----- PROFILE -----
  function renderProfile() {
    const p = state.profile;
    document.getElementById('profile-name').textContent = p.name || 'Имя не указано';
    document.getElementById('profile-class').textContent = p.className ? `Класс: ${p.className}` : '';
    document.getElementById('profile-school').textContent = p.school || '';
    const av = document.getElementById('profile-avatar');
    if (p.photo) {
      av.style.backgroundImage = 'url(' + p.photo + ')';
      av.style.backgroundSize = 'cover';
      av.style.backgroundPosition = 'center';
      av.textContent = '';
    } else {
      av.style.backgroundImage = '';
      av.textContent = p.name ? p.name.trim().charAt(0).toUpperCase() : '?';
    }

    document.getElementById('pf-name').value = p.name || '';
    document.getElementById('pf-class').value = p.className || '';
    document.getElementById('pf-school').value = p.school || '';
    document.getElementById('pf-notes').value = p.notes || '';

    renderPeople();
    renderHolidays();
  }

  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.profile = {
      name: document.getElementById('pf-name').value.trim(),
      className: document.getElementById('pf-class').value.trim(),
      school: document.getElementById('pf-school').value.trim(),
      notes: document.getElementById('pf-notes').value.trim()
    };
    save();
    renderProfile();
    toast('Профиль сохранён');
  });



  // ----- PEOPLE -----
  function renderPeople() {
    const list = document.getElementById('people-list');
    if (!list) return;
    const people = [...(state.people || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
    if (!people.length) {
      list.innerHTML = '<p class="hint">Пока никого нет</p>';
      return;
    }
    const today = new Date();
    list.innerHTML = people.map(p => {
      const bday = nextBirthdayInfo(p.birthday);
      const ageStr = p.age ? `, ${p.age} лет` : (bday && bday.turning ? `, исполнится ${bday.turning}` : '');
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(p.name)}${p.relation ? ' · ' + escapeHtml(p.relation) : ''}</div>
              <div class="card-meta">
                ${bday ? (bday.days === 0 ? '🎂 Сегодня день рождения!' : (bday.days <= 14 ? ('🎂 через ' + bday.days + ' дн. (' + bday.label + ')') : ('ДР: ' + bday.label))) : ''}${ageStr}
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-icon edit-person" data-id="${p.id}" title="Изменить">✎</button>
              <button class="btn-icon delete-person" data-id="${p.id}" title="Удалить">×</button>
            </div>
          </div>
          ${(p.likes || p.dislikes || p.notes) ? `
            <div class="card-body" style="font-size:0.85rem">
              ${p.likes ? `<div>❤ Любит: ${escapeHtml(p.likes)}</div>` : ''}
              ${p.dislikes ? `<div>✖ Не любит: ${escapeHtml(p.dislikes)}</div>` : ''}
              ${p.notes ? `<div style="color:var(--text-secondary)">${escapeHtml(p.notes)}</div>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
    list.querySelectorAll('.edit-person').forEach(b => b.addEventListener('click', () => openPersonModal(b.dataset.id)));
    list.querySelectorAll('.delete-person').forEach(b => b.addEventListener('click', () => {
      if (confirm('Удалить карточку?')) {
        state.people = state.people.filter(x => x.id !== b.dataset.id);
        save();
        renderPeople();
        toast('Удалено');
      }
    }));
  }

  function nextBirthdayInfo(bday) {
    if (!bday) return null;
    // accept YYYY-MM-DD or MM-DD
    let mm, dd, year = null;
    const parts = String(bday).split('-').map(Number);
    if (parts.length === 3) { year = parts[0]; mm = parts[1]; dd = parts[2]; }
    else if (parts.length === 2) { mm = parts[0]; dd = parts[1]; }
    else return null;
    if (!mm || !dd) return null;
    const now = new Date();
    let next = new Date(now.getFullYear(), mm - 1, dd);
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      next = new Date(now.getFullYear() + 1, mm - 1, dd);
    }
    const days = Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const label = next.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    let turning = null;
    if (year) turning = next.getFullYear() - year;
    return { days, label, turning, date: next };
  }

  function openPersonModal(id) {
    const person = id ? state.people.find(x => x.id === id) : null;
    const isEdit = !!person;
    openModal(isEdit ? 'Карточка' : 'Новый человек', `
      <form class="form">
        <label>Имя *
          <input type="text" id="pe-name" class="input" value="${person ? escapeHtml(person.name) : ''}" placeholder="Маша / Бабушка">
        </label>
        <label>Кто это
          <input type="text" id="pe-relation" class="input" value="${person ? escapeHtml(person.relation || '') : ''}" placeholder="друг / одноклассник / мама / брат">
        </label>
        <label>День рождения
          <input type="date" id="pe-bday" class="input" value="${person && person.birthday && person.birthday.length >= 8 ? person.birthday : ''}">
        </label>
        <label>Возраст (примерно)
          <input type="number" id="pe-age" class="input" min="1" max="120" value="${person && person.age ? person.age : ''}" placeholder="14">
        </label>
        <label>Что любит
          <input type="text" id="pe-likes" class="input" value="${person ? escapeHtml(person.likes || '') : ''}" placeholder="футбол, пицца, синий цвет">
        </label>
        <label>Что не любит
          <input type="text" id="pe-dislikes" class="input" value="${person ? escapeHtml(person.dislikes || '') : ''}" placeholder="лук, ранний подъём">
        </label>
        <label>Заметки
          <textarea id="pe-notes" class="input textarea" rows="2" placeholder="Любые детали">${person ? escapeHtml(person.notes || '') : ''}</textarea>
        </label>
      </form>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Сохранить' : 'Добавить'}</button>
    `);
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
      const name = document.getElementById('pe-name').value.trim();
      if (!name) { toast('Укажи имя'); return; }
      const data = {
        id: person ? person.id : uid(),
        name,
        relation: document.getElementById('pe-relation').value.trim(),
        birthday: document.getElementById('pe-bday').value || '',
        age: document.getElementById('pe-age').value ? +document.getElementById('pe-age').value : null,
        likes: document.getElementById('pe-likes').value.trim(),
        dislikes: document.getElementById('pe-dislikes').value.trim(),
        notes: document.getElementById('pe-notes').value.trim()
      };
      if (isEdit) {
        const i = state.people.findIndex(x => x.id === id);
        state.people[i] = data;
      } else {
        state.people.push(data);
      }
      save();
      closeModal();
      renderPeople();
      toast(isEdit ? 'Сохранено' : 'Добавлено');
    };
  }

  // ----- HOLIDAYS -----
  function renderHolidays() {
    const list = document.getElementById('holidays-list');
    if (!list) return;
    const items = [...(state.holidays || [])].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (!items.length) {
      list.innerHTML = '<p class="hint">Каникулы не указаны</p>';
      return;
    }
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    list.innerHTML = items.map(h => {
      let status = '';
      if (h.start && h.end) {
        if (todayStr >= h.start && todayStr <= h.end) status = '<span class="tag primary">Сейчас</span>';
        else if (todayStr < h.start) status = '<span class="tag">Скоро</span>';
        else status = '<span class="tag">Прошли</span>';
      }
      const startL = h.start ? new Date(h.start + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '?';
      const endL = h.end ? new Date(h.end + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '?';
      return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(h.name)} ${status}</div>
              <div class="card-meta">${startL} — ${endL}</div>
            </div>
            <div class="card-actions">
              <button class="btn-icon edit-holiday" data-id="${h.id}">✎</button>
              <button class="btn-icon delete-holiday" data-id="${h.id}">×</button>
            </div>
          </div>
          ${h.homework ? `<div class="card-body" style="font-size:0.85rem"><strong>Задания:</strong> ${escapeHtml(h.homework)}</div>` : ''}
          ${h.notes ? `<div class="card-body" style="font-size:0.85rem;color:var(--text-secondary)">${escapeHtml(h.notes)}</div>` : ''}
        </div>`;
    }).join('');
    list.querySelectorAll('.edit-holiday').forEach(b => b.addEventListener('click', () => openHolidayModal(b.dataset.id)));
    list.querySelectorAll('.delete-holiday').forEach(b => b.addEventListener('click', () => {
      if (confirm('Удалить?')) {
        state.holidays = state.holidays.filter(x => x.id !== b.dataset.id);
        save();
        renderHolidays();
        toast('Удалено');
      }
    }));
  }

  function openHolidayModal(id) {
    const h = id ? state.holidays.find(x => x.id === id) : null;
    const isEdit = !!h;
    openModal(isEdit ? 'Каникулы' : 'Новые каникулы', `
      <form class="form">
        <label>Название *
          <input type="text" id="ho-name" class="input" value="${h ? escapeHtml(h.name) : ''}" placeholder="Осенние / Зимние / Весенние">
        </label>
        <div style="display:flex;gap:10px">
          <label style="flex:1">Начало
            <input type="date" id="ho-start" class="input" value="${h ? h.start || '' : ''}">
          </label>
          <label style="flex:1">Конец
            <input type="date" id="ho-end" class="input" value="${h ? h.end || '' : ''}">
          </label>
        </div>
        <label>Задания на каникулы
          <textarea id="ho-hw" class="input textarea" rows="3" placeholder="Математика: стр. 40–42&#10;Чтение: 2 рассказа">${h ? escapeHtml(h.homework || '') : ''}</textarea>
        </label>
        <label>Заметки
          <input type="text" id="ho-notes" class="input" value="${h ? escapeHtml(h.notes || '') : ''}" placeholder="Поездка к бабушке…">
        </label>
      </form>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Сохранить' : 'Добавить'}</button>
    `);
    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-save').onclick = () => {
      const name = document.getElementById('ho-name').value.trim();
      if (!name) { toast('Укажи название'); return; }
      const data = {
        id: h ? h.id : uid(),
        name,
        start: document.getElementById('ho-start').value,
        end: document.getElementById('ho-end').value,
        homework: document.getElementById('ho-hw').value.trim(),
        notes: document.getElementById('ho-notes').value.trim()
      };
      if (isEdit) {
        const i = state.holidays.findIndex(x => x.id === id);
        state.holidays[i] = data;
      } else state.holidays.push(data);
      save();
      closeModal();
      renderHolidays();
      toast(isEdit ? 'Сохранено' : 'Добавлено');
    };
  }

  function getUpcomingBirthdays(withinDays = 21) {
    return (state.people || [])
      .map(p => {
        const info = nextBirthdayInfo(p.birthday);
        if (!info || info.days > withinDays) return null;
        return { person: p, ...info };
      })
      .filter(Boolean)
      .sort((a, b) => a.days - b.days);
  }

  function getActiveHoliday() {
    const todayStr = new Date().toISOString().slice(0, 10);
    return (state.holidays || []).find(h => h.start && h.end && todayStr >= h.start && todayStr <= h.end) || null;
  }

  function getNextHoliday() {
    const todayStr = new Date().toISOString().slice(0, 10);
    return [...(state.holidays || [])]
      .filter(h => h.start && h.start > todayStr)
      .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  }

  // ----- VOICE -----

  function tryTranscribeVoiceNote(noteId) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // not supported
    // Only prompt if user wants - auto is unreliable for recorded files
    // Web Speech API works with live mic, not easily with saved blob offline.
    // We expose a button on the note instead.
  }

  function transcribeWithMicToNote(noteId) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Расшифровка недоступна в этом браузере (нужен Chrome)');
      return;
    }
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    toast('Слушаю… говори сейчас');
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const note = state.notes.find(n => n.id === noteId);
      if (note) {
        note.body = (note.body ? note.body + '\n' : '') + text;
        note.updated = Date.now();
        if (note.title === 'Голосовая заметка') note.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
        save();
        renderNotes();
        toast('Текст добавлен');
      }
    };
    rec.onerror = () => toast('Не удалось распознать');
    rec.start();
  }

  async function startVoiceRecord() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Запись не поддерживается в этом браузере');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                   MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimer);
        document.getElementById('voice-rec-status').classList.add('hidden');
        if (!recordedChunks.length) { toast('Пустая запись'); return; }
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (blob.size > 2.5 * 1024 * 1024) {
          toast('Слишком длинная запись (макс ~2.5 МБ)');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          const note = {
            id: uid(),
            title: 'Голосовая заметка',
            body: '',
            created: Date.now(),
            updated: Date.now(),
            audio: base64,
            audioMime: blob.type || 'audio/webm'
          };
          state.notes.unshift(note);
          save();
          renderNotes();
          toast('Голосовая заметка сохранена');
          // Try browser speech recognition (optional, online, Chrome)
          tryTranscribeVoiceNote(note.id);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start(200);
      recStart = Date.now();
      document.getElementById('voice-rec-status').classList.remove('hidden');
      document.getElementById('voice-rec-timer').textContent = '00:00';
      recTimer = setInterval(() => {
        const s = Math.floor((Date.now() - recStart) / 1000);
        const m = String(Math.floor(s / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        document.getElementById('voice-rec-timer').textContent = m + ':' + sec;
        if (s >= 120) stopVoiceRecord(); // max 2 min
      }, 250);
    } catch (err) {
      toast('Нет доступа к микрофону');
      console.warn(err);
    }
  }

  function stopVoiceRecord() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  // ----- SHARE -----
  function openShareModal() {
    openModal('Поделиться данными', `
      <p class="hint">Выбери, что включить в экспорт / шаринг:</p>
      <div class="form" style="gap:10px">
        <label class="pack-item"><input type="checkbox" id="sh-profile" checked> <span class="pack-label">Профиль</span></label>
        <label class="pack-item"><input type="checkbox" id="sh-lessons" checked> <span class="pack-label">Уроки</span></label>
        <label class="pack-item"><input type="checkbox" id="sh-clubs" checked> <span class="pack-label">Кружки</span></label>
        <label class="pack-item"><input type="checkbox" id="sh-buses" checked> <span class="pack-label">Автобусы</span></label>
        <label class="pack-item"><input type="checkbox" id="sh-notes" checked> <span class="pack-label">Заметки (без аудио)</span></label>
        <label class="pack-item"><input type="checkbox" id="sh-people" checked> <span class="pack-label">Люди / ДР</span></label>
        <label class="pack-item"><input type="checkbox" id="sh-holidays" checked> <span class="pack-label">Каникулы</span></label>
      </div>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-secondary" id="modal-copy-sel">Копировать JSON</button>
      <button class="btn btn-primary" id="modal-download-sel">Скачать</button>
    `);
    document.getElementById('modal-cancel').onclick = closeModal;

    function buildSelected() {
      const out = {};
      if (document.getElementById('sh-profile').checked) out.profile = state.profile;
      if (document.getElementById('sh-lessons').checked) out.lessons = state.lessons;
      if (document.getElementById('sh-clubs').checked) out.clubs = state.clubs;
      if (document.getElementById('sh-buses').checked) out.buses = state.buses;
      if (document.getElementById('sh-notes').checked) {
        out.notes = state.notes.map(n => {
          const { audio, audioMime, ...rest } = n;
          return rest;
        });
      }
      if (document.getElementById('sh-people')?.checked) out.people = state.people || [];
      if (document.getElementById('sh-holidays')?.checked) out.holidays = state.holidays || [];
      return out;
    }

    document.getElementById('modal-download-sel').onclick = () => {
      const data = JSON.stringify(buildSelected(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `school-planner-partial-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Файл скачан');
      closeModal();
    };

    document.getElementById('modal-copy-sel').onclick = async () => {
      const data = JSON.stringify(buildSelected(), null, 2);
      try {
        await navigator.clipboard.writeText(data);
        toast('JSON скопирован');
      } catch {
        toast('Не удалось скопировать');
      }
    };
  }

  // ----- DEMO -----
  function loadDemoData() {
    if (state.lessons.length || state.clubs.length || state.buses.length) {
      if (!confirm('Заменить текущие данные примером?')) return;
    }
    state = {
      profile: { name: 'Алекс', className: '8Б', school: 'Школа №42', notes: 'Пример данных' },
      lessons: [
        { id: 'd1', day: 0, subject: 'Математика', start: '08:30', end: '09:15', room: '305', teacher: 'Иванова А.П.', items: ['тетрадь', 'учебник', 'линейка'] },
        { id: 'd2', day: 0, subject: 'Русский язык', start: '09:25', end: '10:10', room: '210', teacher: 'Петрова О.В.', items: ['тетрадь', 'учебник'] },
        { id: 'd3', day: 0, subject: 'История', start: '10:30', end: '11:15', room: '112', teacher: '', items: ['контурная карта'] },
        { id: 'd4', day: 1, subject: 'Физика', start: '08:30', end: '09:15', room: '401', teacher: 'Сидоров', items: ['тетрадь', 'калькулятор'] },
        { id: 'd5', day: 2, subject: 'Английский', start: '09:25', end: '10:10', room: '215', teacher: 'Brown', items: ['словарь'] }
      ],
      clubs: [
        { id: 'c1', day: 1, name: 'Робототехника', start: '15:00', end: '16:30', place: 'каб. 12', teacher: 'Козлов', items: ['ноутбук'], notes: 'Принести USB' },
        { id: 'c2', day: 3, name: 'Футбол', start: '16:00', end: '17:30', place: 'Спортзал', teacher: 'Тренер Максим', items: ['форма', 'кроссовки'], notes: '' }
      ],
      buses: [
        { id: 'b1', number: '42', time: '07:40', destination: 'Школа', walkMin: 7, notes: 'Остановка у парка' },
        { id: 'b2', number: '15', time: '14:50', destination: 'Дом', walkMin: 5, notes: '' }
      ],
      notes: [
        { id: 'n1', title: 'ДЗ на завтра', body: 'Математика: стр. 45 №12–15\nИстория: параграф 8', created: Date.now() - 86400000, updated: Date.now() - 86400000 }
      ],
      people: [
        { id: 'p1', name: 'Маша', relation: 'одноклассница', birthday: (function(){ const d=new Date(); d.setDate(d.getDate()+3); return d.toISOString().slice(0,10); })(), age: 14, likes: 'рисование, котики', dislikes: 'контрольные', notes: '' },
        { id: 'p2', name: 'Бабушка', relation: 'бабушка', birthday: '1954-11-12', age: null, likes: 'цветы', dislikes: '', notes: 'Позвонить в выходные' }
      ],
      holidays: [
        { id: 'h1', name: 'Осенние каникулы', start: (function(){ const d=new Date(); d.setDate(d.getDate()+20); return d.toISOString().slice(0,10); })(), end: (function(){ const d=new Date(); d.setDate(d.getDate()+27); return d.toISOString().slice(0,10); })(), homework: 'Чтение: 3 рассказа\nМатематика: повторить таблицу', notes: '' }
      ],
      packChecks: {},
      settings: { theme: state.settings.theme || 'light', activeDay: null }
    };
    save();
    applyTheme();
    render();
    toast('Пример данных загружен');
  }

  // ----- DATA -----
  function applyImportedData(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      toast('Неверный формат JSON');
      return false;
    }
    if (!(parsed.lessons || parsed.clubs || parsed.profile || parsed.buses || parsed.notes || parsed.people || parsed.holidays || parsed.packChecks || parsed.settings)) {
      toast('JSON не похож на данные планера');
      return false;
    }
    state = {
      profile: { ...state.profile, ...(parsed.profile || {}) },
      lessons: Array.isArray(parsed.lessons) ? parsed.lessons : state.lessons,
      clubs: Array.isArray(parsed.clubs) ? parsed.clubs : (state.clubs || []),
      buses: Array.isArray(parsed.buses) ? parsed.buses : state.buses,
      notes: Array.isArray(parsed.notes) ? parsed.notes : state.notes,
      people: Array.isArray(parsed.people) ? parsed.people : (state.people || []),
      holidays: Array.isArray(parsed.holidays) ? parsed.holidays : (state.holidays || []),
      packChecks: parsed.packChecks && typeof parsed.packChecks === 'object' ? parsed.packChecks : (state.packChecks || {}),
      settings: { ...state.settings, ...(parsed.settings || {}) }
    };
    if (!Array.isArray(state.lessons)) state.lessons = [];
    if (!Array.isArray(state.clubs)) state.clubs = [];
    if (!Array.isArray(state.buses)) state.buses = [];
        if (!Array.isArray(state.people)) state.people = [];
        if (!Array.isArray(state.holidays)) state.holidays = [];
    if (!Array.isArray(state.notes)) state.notes = [];
    save();
    applyTheme();
    render();
    toast('Данные импортированы');
    return true;
  }

  function openImportModal() {
    openModal('Импорт JSON', `
      <p class="hint" style="margin-bottom:12px">Можно загрузить файл или вставить JSON текстом (скопировать из мессенджера / нейросети).</p>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <button type="button" class="btn btn-secondary" id="import-choose-file" style="width:100%">Выбрать файл .json</button>
          <input type="file" id="import-file-modal" accept=".json,application/json" hidden>
        </div>
        <div class="divider" style="margin:4px 0"></div>
        <label>Или вставь JSON сюда
          <textarea id="import-json-text" class="input textarea" rows="10" placeholder='{"profile":{...},"lessons":[...], ...}'></textarea>
        </label>
      </div>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Отмена</button>
      <button class="btn btn-primary" id="modal-import-text">Импортировать текст</button>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;

    document.getElementById('import-choose-file').onclick = () => {
      document.getElementById('import-file-modal').click();
    };

    document.getElementById('import-file-modal').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (applyImportedData(parsed)) closeModal();
        } catch {
          toast('Ошибка чтения JSON из файла');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    document.getElementById('modal-import-text').onclick = () => {
      const text = document.getElementById('import-json-text').value.trim();
      if (!text) {
        toast('Вставь JSON в поле');
        return;
      }
      try {
        // Try to clean common AI wrappers (```json ... ```)
        let clean = text;
        const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) clean = fence[1].trim();
        const parsed = JSON.parse(clean);
        if (applyImportedData(parsed)) closeModal();
      } catch (err) {
        toast('Ошибка парсинга JSON: ' + (err.message || 'неверный формат'));
      }
    };
  }

  document.getElementById('export-json').addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school-planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Файл скачан');
  });

  document.getElementById('import-json').addEventListener('click', openImportModal);

  // Keep hidden file input for backward compatibility (if any external refs)
  const hiddenFile = document.getElementById('import-file');
  if (hiddenFile) {
    hiddenFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          applyImportedData(JSON.parse(reader.result));
        } catch {
          toast('Ошибка чтения JSON');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  document.getElementById('generate-prompt').addEventListener('click', () => {
    const box = document.getElementById('prompt-box');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      const prompt = `Ты помогаешь заполнить данные для школьного планера. Верни ТОЛЬКО валидный JSON без пояснений и markdown.

Структура:
{
  "profile": { "name": "", "className": "", "school": "", "notes": "" },
  "lessons": [
    { "id": "уникальный", "day": 0, "subject": "Математика", "start": "08:30", "end": "09:15", "room": "305", "teacher": "", "items": ["тетрадь", "учебник"] }
  ],
  "clubs": [
    { "id": "уникальный", "day": 1, "name": "Робототехника", "start": "15:00", "end": "16:30", "place": "каб. 12", "teacher": "", "items": ["ноутбук"], "notes": "" }
  ],
  "buses": [
    { "id": "уникальный", "number": "42", "time": "07:40", "destination": "Школа", "walkMin": 7, "notes": "" }
  ],
  "notes": [
    { "id": "уникальный", "title": "ДЗ", "body": "текст", "created": 1710000000000, "updated": 1710000000000 }
  ],
  "packChecks": {},
  "settings": { "theme": "light" }
}

Правила:
- day: 0=Понедельник ... 6=Воскресенье
- time в формате HH:MM (24ч)
- items — массив строк (что взять на урок)
- id — любые уникальные строки
- Заполни реалистичными данными для ученика ${state.profile.className || 'средней школы'} (или спроси детали у пользователя и заполни).
- Можно добавить 5–8 уроков на разные дни, 1–2 автобуса, 1–2 заметки.

Верни готовый JSON.`;
      document.getElementById('ai-prompt').value = prompt;
    }
  });

  document.getElementById('copy-prompt').addEventListener('click', async () => {
    const text = document.getElementById('ai-prompt').value;
    try {
      await navigator.clipboard.writeText(text);
      toast('Промпт скопирован');
    } catch {
      document.getElementById('ai-prompt').select();
      toast('Выдели и скопируй вручную');
    }
  });

  document.getElementById('clear-data').addEventListener('click', () => {
    if (confirm('Удалить ВСЕ данные? Это нельзя отменить.')) {
      state = {
        profile: { name: '', className: '', school: '', notes: '', photo: '' },
        lessons: [],
        clubs: [],
        buses: [],
        notes: [],
        people: [],
        holidays: [],
        packChecks: {},
        settings: { theme: state.settings.theme, activeDay: null }
      };
      save();
      render();
      toast('Данные очищены');
    }
  });

  // ---------- Buttons ----------
  document.getElementById('add-schedule-btn').addEventListener('click', () => {
    if (scheduleType === 'clubs') openClubModal(null);
    else openLessonModal(null);
  });
  document.getElementById('add-bus-btn').addEventListener('click', () => openBusModal(null));
  document.getElementById('add-note-btn').addEventListener('click', () => openNoteModal(null));
  document.getElementById('add-person-btn').addEventListener('click', () => openPersonModal(null));
  document.getElementById('add-holiday-btn').addEventListener('click', () => openHolidayModal(null));
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Schedule type switcher
  document.getElementById('schedule-type').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    scheduleType = btn.dataset.type;
    renderSchedule();
  });

  // Voice recording
  document.getElementById('record-voice-btn').addEventListener('click', startVoiceRecord);
  document.getElementById('stop-voice-btn').addEventListener('click', stopVoiceRecord);

  // Share & demo
  document.getElementById('share-data').addEventListener('click', openShareModal);
  document.getElementById('load-demo').addEventListener('click', loadDemoData);
  document.getElementById('check-update').addEventListener('click', () => checkForUpdate(true));
  const fb = document.getElementById('feedback-btn');
  if (fb) fb.addEventListener('click', openFeedback);


  // ---------- App update ----------
  function openFeedback() {
    openModal('Обратная связь', `
      <p class="hint">Напиши ideю, ошибку или вопрос. Выбери удобный способ:</p>
      <div class="data-actions" style="margin-top:12px">
        <a class="btn btn-primary" href="https://t.me/ASV_PROD" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Telegram ASV_PROD</a>
        <a class="btn btn-secondary" href="https://vk.com/smolyaninovchef" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">ВКонтакте smolyAninovchef</a>
        <a class="btn btn-secondary" href="https://dzen.ru/ASV_PROD" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Дзен ASV_PROD</a>
      </div>
      <p class="hint" style="margin-top:14px">Автор: Смолянинов Александр Вячеславович<br>Лейбл: NEURAL_ARCHITECT_PREMIUM++</p>
      <p class="hint">«Школьный планер» работает без интернета. Ссылки откроются, только если сеть есть.</p>
    `, `
      <button class="btn btn-secondary" id="modal-cancel">Закрыть</button>
    `);
    document.getElementById('modal-cancel').onclick = closeModal;
  }

  async function checkForUpdate(manual = true) {
    const btn = document.getElementById('check-update');
    if (btn && manual) {
      btn.disabled = true;
      btn.textContent = 'Проверка…';
    }
    try {
      // 1) Backup data before any reload
      backupData();

      // 2) Fetch remote version (bypass cache)
      const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('version fetch failed');
      const remote = await res.json();
      const remoteVer = String(remote.version || '');

      const label = document.getElementById('app-version-label');
      if (label) {
        label.textContent = 'Версия: ' + APP_VERSION + (remoteVer && remoteVer !== APP_VERSION ? ' → доступна ' + remoteVer : ' (актуальная)');
      }

      if (remoteVer && remoteVer !== APP_VERSION) {
        if (manual) {
          const ok = confirm(
            'Доступна новая версия ' + remoteVer + (remote.notes ? '\\n\\n' + remote.notes : '') +
            '\\n\\nОбновить сейчас? Все твои данные (уроки, автобусы, люди…) сохранятся.'
          );
          if (!ok) {
            if (btn) { btn.disabled = false; btn.textContent = 'Обновить приложение'; }
            return;
          }
        }
        await applyUpdate();
      } else {
        if (manual) toast('У тебя уже последняя версия (' + APP_VERSION + ')');
      }
    } catch (err) {
      console.warn(err);
      if (manual) toast('Не удалось проверить обновление (нужен интернет)');
    } finally {
      if (btn && manual) {
        btn.disabled = false;
        btn.textContent = 'Обновить приложение';
      }
    }
  }

  async function applyUpdate() {
    toast('Обновление… данные сохранены');
    backupData();
    try {
      // Clear all caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // Tell SW to skip waiting / re-register
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          await reg.update();
        }
        // Unregister and re-register for clean slate
        for (const reg of regs) await reg.unregister();
        await navigator.serviceWorker.register('sw.js?v=' + Date.now());
      }
    } catch (e) {
      console.warn('SW update error', e);
    }
    // Hard reload — localStorage (and BACKUP_KEY) survive
    setTimeout(() => {
      location.href = './index.html?updated=' + Date.now();
    }, 400);
  }

  function showVersionLabel() {
    const label = document.getElementById('app-version-label');
    if (label) label.textContent = 'Версия: ' + APP_VERSION;
  }


  // Profile sub-tabs
  let profileTab = 'me';
  document.getElementById('profile-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pnav-btn, .seg-btn');
    if (!btn || !btn.dataset.ptab) return;
    profileTab = btn.dataset.ptab;
    document.querySelectorAll('#profile-tabs .pnav-btn, #profile-tabs .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.ptab === profileTab));
    document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.id === 'ptab-' + profileTab));
    if (profileTab === 'people') renderPeople();
    if (profileTab === 'holidays') renderHolidays();
    if (profileTab === 'settings') fillSettingsForm();
  });

  // Profile photo
  document.getElementById('pf-photo')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      toast('Фото слишком большое (макс ~1.5 МБ)');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // compress via canvas
      const img = new Image();
      img.onload = () => {
        const max = 256;
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = h * max / w; w = max; }
        else if (h > max) { w = w * max / h; h = max; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        state.profile.photo = canvas.toDataURL('image/jpeg', 0.85);
        save();
        renderProfile();
        toast('Фото сохранено');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  document.getElementById('pf-photo-remove')?.addEventListener('click', () => {
    state.profile.photo = '';
    save();
    renderProfile();
    toast('Фото убрано');
  });

  // Templates download
  const TEMPLATES = {
    full: {
      profile: { name: '', className: '', school: '', notes: '', photo: '' },
      lessons: [{ id: 'l1', day: 0, subject: 'Математика', start: '08:30', end: '09:15', room: '305', teacher: '', items: ['тетрадь', 'учебник'] }],
      clubs: [{ id: 'c1', day: 1, name: 'Робототехника', start: '15:00', end: '16:30', place: 'каб. 12', teacher: '', items: [], notes: '' }],
      buses: [
        { id: 'b1', number: '42', time: '07:40', destination: 'Школа', walkMin: 7, notes: '' },
        { id: 'b2', number: '15', time: '15:20', destination: 'Дом', walkMin: 5, notes: '' }
      ],
      notes: [{ id: 'n1', title: 'Пример', body: 'Текст заметки', created: 1710000000000, updated: 1710000000000 }],
      people: [{ id: 'p1', name: 'Маша', relation: 'одноклассница', birthday: '2012-05-14', age: 14, likes: '', dislikes: '', notes: '' }],
      holidays: [{ id: 'h1', name: 'Осенние каникулы', start: '2026-10-26', end: '2026-11-02', homework: '', notes: '' }],
      packChecks: {},
      settings: { theme: 'light' }
    },
    lessons: { lessons: [{ id: 'l1', day: 0, subject: 'Математика', start: '08:30', end: '09:15', room: '305', teacher: '', items: ['тетрадь'] }] },
    clubs: { clubs: [{ id: 'c1', day: 1, name: 'Кружок', start: '15:00', end: '16:30', place: '', teacher: '', items: [], notes: '' }] },
    buses: { buses: [{ id: 'b1', number: '42', time: '07:40', destination: 'Школа', walkMin: 7, notes: '' }] },
    people: { people: [{ id: 'p1', name: 'Имя', relation: 'друг', birthday: '2012-01-15', age: 14, likes: '', dislikes: '', notes: '' }] },
    holidays: { holidays: [{ id: 'h1', name: 'Каникулы', start: '2026-10-26', end: '2026-11-02', homework: 'Задания…', notes: '' }] },
    notes: { notes: [{ id: 'n1', title: 'Заметка', body: 'Текст', created: 1710000000000, updated: 1710000000000 }] }
  };

  document.querySelectorAll('.tpl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tpl;
      const data = TEMPLATES[key];
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'school-planner-template-' + key + '.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Шаблон скачан');
    });
  });


  // ----- Appearance settings form -----
  function fillSettingsForm() {
    const s = state.settings || {};
    const r = document.getElementById('set-radius');
    const d = document.getElementById('set-density');
    const f = document.getElementById('set-font');
    const sh = document.getElementById('set-shadow');
    if (r) r.value = String(s.radius || 12);
    if (d) d.value = s.density || 'comfortable';
    if (f) f.value = String(s.fontSize || 16);
    if (sh) sh.checked = s.shadows !== false;
  }

  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings.radius = +document.getElementById('set-radius').value;
    state.settings.density = document.getElementById('set-density').value;
    state.settings.fontSize = +document.getElementById('set-font').value;
    state.settings.shadows = document.getElementById('set-shadow').checked;
    applyAppearance();
    save();
    toast('Вид сохранён');
  });

  // ----- QR data transfer -----
  let lastQrPayload = '';
  let qrScanTimer = null;
  let qrStream = null;

  async function encodePayload(obj) {
    const json = JSON.stringify(obj);
    try {
      if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const buf = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'SP2G|' + btoa(bin);
      }
    } catch (_) {}
    return 'SP2|' + btoa(unescape(encodeURIComponent(json)));
  }

  async function decodePayload(str) {
    str = (str || '').trim();
    // allow URL with ?import=
    try {
      if (str.includes('import=')) {
        const u = new URL(str, location.href);
        str = u.searchParams.get('import') || str;
      }
    } catch (_) {}
    if (str.startsWith('SP2G|')) {
      const bin = atob(str.slice(5));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(stream).text();
        return JSON.parse(text);
      }
      throw new Error('Нужен браузер с gzip');
    }
    if (str.startsWith('SP2|')) {
      const json = decodeURIComponent(escape(atob(str.slice(4))));
      return JSON.parse(json);
    }
    // plain JSON fallback
    if (str.startsWith('{')) return JSON.parse(str);
    throw new Error('Неизвестный формат QR');
  }

  async function showDataQr(kind, dataObj, title) {
    const payload = await encodePayload(dataObj);
    lastQrPayload = payload;
    const wrap = document.getElementById('qr-canvas-wrap');
    const box = document.getElementById('qr-result');
    const titleEl = document.getElementById('qr-result-title');
    const hint = document.getElementById('qr-result-hint');
    if (!wrap || typeof qrcode === 'undefined') {
      toast('Генератор QR не загрузился');
      return;
    }
    // Pick error correction and type number by size
    let level = 'M';
    if (payload.length > 1200) level = 'L';
    if (payload.length > 2500) {
      hint.textContent = 'Слишком много данных для одного QR (' + payload.length + ' симв.). Используй экспорт JSON или выбери меньший блок.';
      box.classList.remove('hidden');
      titleEl.textContent = title;
      wrap.innerHTML = '<p class="hint">QR не поместился. Скачай JSON в разделе «Данные».</p>';
      toast('Данные слишком большие для QR');
      return;
    }
    try {
      const qr = qrcode(0, level);
      qr.addData(payload);
      qr.make();
      wrap.innerHTML = qr.createSvgTag(4, 6);
      const svg = wrap.querySelector('svg');
      if (svg) {
        svg.style.maxWidth = '280px';
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.background = '#fff';
        svg.style.borderRadius = '12px';
      }
      titleEl.textContent = title;
      hint.textContent = 'Попроси друга открыть Профиль → QR-обмен → Считать QR. Размер: ' + payload.length + ' символов.';
      box.classList.remove('hidden');
      toast('QR готов');
    } catch (err) {
      console.warn(err);
      toast('Не удалось создать QR — попробуй меньший блок');
    }
  }

  document.getElementById('qr-gen-lessons')?.addEventListener('click', () => {
    showDataQr('lessons', { lessons: state.lessons }, 'QR: уроки (' + state.lessons.length + ')');
  });
  document.getElementById('qr-gen-people')?.addEventListener('click', () => {
    showDataQr('people', { people: state.people || [] }, 'QR: люди (' + (state.people || []).length + ')');
  });
  document.getElementById('qr-gen-holidays')?.addEventListener('click', () => {
    showDataQr('holidays', { holidays: state.holidays || [] }, 'QR: каникулы');
  });
  document.getElementById('qr-gen-clubs')?.addEventListener('click', () => {
    showDataQr('clubs', { clubs: state.clubs || [] }, 'QR: кружки');
  });
  document.getElementById('qr-gen-full')?.addEventListener('click', () => {
    const full = {
      profile: { ...state.profile, photo: '' }, // photo too heavy for QR
      lessons: state.lessons,
      clubs: state.clubs,
      buses: state.buses,
      notes: (state.notes || []).map(n => { const { audio, audioMime, ...r } = n; return r; }),
      people: state.people || [],
      holidays: state.holidays || [],
      packChecks: state.packChecks || {},
      settings: state.settings
    };
    showDataQr('full', full, 'QR: вся база (без фото и аудио)');
  });

  document.getElementById('qr-copy-payload')?.addEventListener('click', async () => {
    if (!lastQrPayload) return;
    try {
      await navigator.clipboard.writeText(lastQrPayload);
      toast('Скопировано');
    } catch {
      toast('Не удалось скопировать');
    }
  });

  async function importFromPayloadString(str) {
    try {
      const data = await decodePayload(str);
      if (applyImportedData(data)) {
        toast('Данные из QR импортированы');
        stopQrScan();
      }
    } catch (err) {
      console.warn(err);
      toast('Не удалось прочитать данные: ' + (err.message || 'ошибка'));
    }
  }

  document.getElementById('qr-import-paste')?.addEventListener('click', () => {
    const t = document.getElementById('qr-paste')?.value || '';
    if (!t.trim()) { toast('Вставь текст'); return; }
    importFromPayloadString(t);
  });

  function stopQrScan() {
    if (qrScanTimer) { clearInterval(qrScanTimer); qrScanTimer = null; }
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    const v = document.getElementById('qr-video');
    if (v) { v.classList.add('hidden'); v.srcObject = null; }
    document.getElementById('qr-scan-stop')?.classList.add('hidden');
  }

  document.getElementById('qr-scan-stop')?.addEventListener('click', stopQrScan);

  document.getElementById('qr-scan-btn')?.addEventListener('click', async () => {
    stopQrScan();
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Камера недоступна — вставь текст QR вручную');
      return;
    }
    try {
      qrStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
      const video = document.getElementById('qr-video');
      video.srcObject = qrStream;
      video.classList.remove('hidden');
      document.getElementById('qr-scan-stop').classList.remove('hidden');
      await video.play();

      const canvas = document.getElementById('qr-scan-canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let detector = null;
      if ('BarcodeDetector' in window) {
        try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (_) {}
      }
      toast('Наведи камеру на QR');
      qrScanTimer = setInterval(async () => {
        if (!video.videoWidth) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // 1) BarcodeDetector (Chrome)
        if (detector) {
          try {
            const codes = await detector.detect(canvas);
            if (codes && codes[0] && codes[0].rawValue) {
              stopQrScan();
              importFromPayloadString(codes[0].rawValue);
              return;
            }
          } catch (_) {}
        }
        // 2) jsQR (Safari / iOS / fallback)
        if (typeof jsQR === 'function') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            stopQrScan();
            importFromPayloadString(code.data);
          }
        }
      }, 400);
    } catch (err) {
      toast('Нет доступа к камере');
    }
  });

  document.getElementById('qr-scan-file')?.addEventListener('click', () => {
    document.getElementById('qr-file-input')?.click();
  });

  document.getElementById('qr-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      // Try BarcodeDetector
      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const codes = await detector.detect(bmp);
          if (codes && codes[0] && codes[0].rawValue) {
            importFromPayloadString(codes[0].rawValue);
            return;
          }
        } catch (_) {}
      }
      // jsQR fallback
      if (typeof jsQR === 'function') {
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          importFromPayloadString(code.data);
          return;
        }
      }
      toast('QR на фото не найден — попробуй ближе и ровнее');
    } catch (err) {
      console.warn(err);
      toast('Не удалось разобрать фото');
    }
  });

  // When switching to settings tab — fill form
  const _ptabHandler = document.getElementById('profile-tabs');
  // augment existing click via capture
  // settings form fill handled in main profile-tabs handler

  // ---------- Init ----------
  load();
  applyTheme();
  showVersionLabel();
  // Refresh buses countdown and today status every 30s
  setInterval(() => {
    if (currentTab === 'buses') renderBuses();
    if (currentTab === 'today') renderToday();
  }, 30000);
  render();

  // If opened after update — confirm data still there
  if (location.search.includes('updated=')) {
    toast('Приложение обновлено · данные на месте');
    history.replaceState(null, '', './index.html');
  }

  // Optional silent check once per day when online
  try {
    const last = localStorage.getItem('school-planner-last-update-check');
    const now = Date.now();
    if (!last || now - Number(last) > 7 * 24 * 3600 * 1000) {
      localStorage.setItem('school-planner-last-update-check', String(now));
      if (navigator.onLine) checkForUpdate(false);
    }
  } catch (_) {}
})();
