(() => {
  'use strict';

  const STORAGE_KEY = 'school-planner-v1';
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  // ---------- State ----------
  let state = {
    profile: { name: '', className: '', school: '', notes: '' },
    lessons: [],      // { id, day (0-6), subject, start, end, room, teacher, items: [] }
    clubs: [],        // { id, day (0-6), name, start, end, place, teacher, items: [], notes }
    buses: [],        // { id, number, time, destination, walkMin, notes }
    notes: [],        // { id, title, body, created, updated, audio?, audioMime? }
    packChecks: {},   // { "itemKey": true }
    settings: { theme: 'light', activeDay: null }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Не удалось сохранить данные');
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
        if (!state.packChecks) state.packChecks = {};
        if (!state.settings) state.settings = { theme: 'light', activeDay: null };
        if (!Array.isArray(state.clubs)) state.clubs = [];
        if (!Array.isArray(state.notes)) state.notes = [];
        if (!Array.isArray(state.lessons)) state.lessons = [];
        if (!Array.isArray(state.buses)) state.buses = [];
      }
    } catch (e) {
      console.warn('Load error', e);
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

    const list = document.getElementById('today-lessons');
    const empty = document.getElementById('today-empty');

    // Find current / next lesson
    let statusHtml = '';
    if (lessons.length) {
      let current = null;
      let next = null;
      for (const l of lessons) {
        const start = parseTime(l.start);
        const end = parseTime(l.end) || (start !== null ? start + 45 : null);
        if (start === null) continue;
        if (nowMin >= start && (end === null || nowMin < end)) {
          current = l;
          break;
        }
        if (nowMin < start && !next) {
          next = l;
        }
      }
      if (current) {
        const endMin = parseTime(current.end);
        const left = endMin !== null ? endMin - nowMin : null;
        statusHtml = `<div class="today-status current">Сейчас: <strong>${escapeHtml(current.subject)}</strong>${left !== null ? ` · ещё ${left} мин` : ''}${current.room ? ' · каб. ' + escapeHtml(current.room) : ''}</div>`;
      } else if (next) {
        const until = parseTime(next.start) - nowMin;
        statusHtml = `<div class="today-status next">Следующий: <strong>${escapeHtml(next.subject)}</strong> через ${until} мин (${formatTime(next.start)})${next.room ? ' · каб. ' + escapeHtml(next.room) : ''}</div>`;
      } else if (lessons.length) {
        statusHtml = `<div class="today-status done">Уроки на сегодня закончились</div>`;
      }
    }

    if (!lessons.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = statusHtml + lessons.map(l => {
        const start = parseTime(l.start);
        const end = parseTime(l.end) || (start !== null ? start + 45 : null);
        let cls = '';
        if (start !== null) {
          if (nowMin >= start && (end === null || nowMin < end)) cls = ' lesson-current';
          else if (end !== null && nowMin >= end) cls = ' lesson-past';
        }
        return `
        <div class="card${cls}">
          <div class="card-header">
            <div>
              <div class="card-title">${escapeHtml(l.subject)}</div>
              <div class="card-meta">
                <span class="time-badge">${formatTime(l.start)}${l.end ? ' – ' + formatTime(l.end) : ''}</span>
                ${l.room ? ' · каб. ' + escapeHtml(l.room) : ''}
                ${l.teacher ? ' · ' + escapeHtml(l.teacher) : ''}
              </div>
            </div>
          </div>
          ${l.items && l.items.length ? `
            <div class="card-tags">
              ${l.items.map(i => `<span class="tag">${escapeHtml(i)}</span>`).join('')}
            </div>` : ''}
        </div>
      `;
      }).join('');
    }


    // Clubs today
    const clubsToday = state.clubs
      .filter(c => c.day === day)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    if (clubsToday.length) {
      list.innerHTML += `<h3 style="margin:20px 0 10px;font-size:1rem;color:var(--text-secondary)">Кружки сегодня</h3>` +
        clubsToday.map(c => `
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">${escapeHtml(c.name)}</div>
                <div class="card-meta">
                  <span class="time-badge">${formatTime(c.start)}${c.end ? ' – ' + formatTime(c.end) : ''}</span>
                  ${c.place ? ' · ' + escapeHtml(c.place) : ''}
                </div>
              </div>
            </div>
          </div>
        `).join('');
    }

    // Quick pack
    const packEl = document.getElementById('today-pack-list');
    const itemsMap = collectItemsForDay(day);
    if (!Object.keys(itemsMap).length) {
      packEl.innerHTML = '<p class="hint">Вещей на сегодня не указано</p>';
    } else {
      packEl.innerHTML = Object.entries(itemsMap).map(([key, info]) => {
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
        <label>Куда
          <input type="text" id="bf-dest" class="input" value="${bus ? escapeHtml(bus.destination || '') : ''}" placeholder="Школа / Дом / Остановка">
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
          ${n.audio ? `<div style="margin-top:10px"><audio controls src="data:${n.audioMime || 'audio/webm'};base64,${n.audio}" style="width:100%;max-height:40px"></audio></div>` : ''}
        </div>
      `).join('');

      list.querySelectorAll('.edit-note').forEach(b => b.addEventListener('click', () => openNoteModal(b.dataset.id)));
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
    av.textContent = p.name ? p.name.trim().charAt(0).toUpperCase() : '?';

    document.getElementById('pf-name').value = p.name || '';
    document.getElementById('pf-class').value = p.className || '';
    document.getElementById('pf-school').value = p.school || '';
    document.getElementById('pf-notes').value = p.notes || '';
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


  // ----- VOICE -----
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
    if (!(parsed.lessons || parsed.clubs || parsed.profile || parsed.buses || parsed.notes || parsed.packChecks || parsed.settings)) {
      toast('JSON не похож на данные планера');
      return false;
    }
    state = {
      profile: { ...state.profile, ...(parsed.profile || {}) },
      lessons: Array.isArray(parsed.lessons) ? parsed.lessons : state.lessons,
      clubs: Array.isArray(parsed.clubs) ? parsed.clubs : (state.clubs || []),
      buses: Array.isArray(parsed.buses) ? parsed.buses : state.buses,
      notes: Array.isArray(parsed.notes) ? parsed.notes : state.notes,
      packChecks: parsed.packChecks && typeof parsed.packChecks === 'object' ? parsed.packChecks : (state.packChecks || {}),
      settings: { ...state.settings, ...(parsed.settings || {}) }
    };
    if (!Array.isArray(state.lessons)) state.lessons = [];
    if (!Array.isArray(state.clubs)) state.clubs = [];
    if (!Array.isArray(state.buses)) state.buses = [];
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
        profile: { name: '', className: '', school: '', notes: '' },
        lessons: [],
        clubs: [],
        buses: [],
        notes: [],
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

  // ---------- Init ----------
  load();
  applyTheme();
  // Refresh buses countdown and today status every 30s
  setInterval(() => {
    if (currentTab === 'buses') renderBuses();
    if (currentTab === 'today') renderToday();
  }, 30000);
  render();
})();
