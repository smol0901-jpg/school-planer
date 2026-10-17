/* Орбита 4.2 · ACTIONS — единый каталог действий (этап A: полный CRUD) */
(function () {
  const O = window.Orbit = window.Orbit || {}, E = O.engine;
  const C = () => O.core(), S = () => C().state;
  const A = O.actions = {};

  const DAYN = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const dayLabel = i => DAYN[((i % 7) + 7) % 7] || '';
  const uid = () => C().uid();
  const saveRender = () => { C().save(); C().render(); };

  /* история правок для вкладки «Правки» и undo */
  const HIST = 'orbit-action-log-v1';
  A.history = [];
  try { A.history = JSON.parse(sessionStorage.getItem(HIST) || '[]'); } catch (e) { A.history = []; }
  function logChange(label, undoFn, meta) {
    const entry = { id: uid(), at: Date.now(), label: label || 'Изменение', meta: meta || {} };
    if (typeof undoFn === 'function') {
      const wrapped = () => { try { undoFn(); } catch (e) { console.error(e); } };
      entry.undo = wrapped;
      try { const stack = O.assistant && O.assistant._undoPush; if (stack) stack(wrapped); } catch (e) {}
    }
    A.history.unshift(entry);
    A.history = A.history.slice(0, 40);
    try {
      sessionStorage.setItem(HIST, JSON.stringify(A.history.map(({ id, at, label, meta }) => ({ id, at, label, meta }))));
    } catch (e) {}
    return entry;
  }
  A.undoLast = function () {
    const e = A.history.find(x => x.undo);
    if (!e) return { ok: false, msg: 'Нечего отменять.' };
    e.undo();
    e.undo = null;
    e.label = '↩ ' + e.label;
    saveRender();
    return { ok: true, msg: 'Отменено: ' + e.label.replace(/^↩ /, '') };
  };
  A.recent = function (n) { return A.history.slice(0, n || 12); };

  /* ───── парсеры ───── */
  A.parseDay = function (text, now) {
    const n = E.N(text || '');
    now = now || new Date();
    if (/послезавтра/.test(n)) return { idx: E.dayIdx(E.addDays(now, 2)), label: 'послезавтра' };
    if (/завтра/.test(n)) return { idx: E.dayIdx(E.addDays(now, 1)), label: 'завтра' };
    if (/сегодня/.test(n)) return { idx: E.dayIdx(now), label: 'сегодня' };
    const map = [[/понедельник|(?:^|\s)пн(?:\s|$)/, 0], [/вторник|(?:^|\s)вт(?:\s|$)/, 1], [/сред[ауые]|(?:^|\s)ср(?:\s|$)/, 2], [/четверг|(?:^|\s)чт(?:\s|$)/, 3], [/пятниц|(?:^|\s)пт(?:\s|$)/, 4], [/суббот|(?:^|\s)сб(?:\s|$)/, 5], [/воскресен|(?:^|\s)вс(?:\s|$)/, 6]];
    for (const [re, i] of map) if (re.test(n)) return { idx: i, label: dayLabel(i) };
    return null;
  };
  A.parseTime = function (text) {
    const m = String(text || '').match(/(\d{1,2})[:.\s](\d{2})/);
    if (m) { const h = +m[1], mi = +m[2]; if (h < 24 && mi < 60) return E.fmt(h * 60 + mi); }
    const m2 = String(text || '').match(/(?:^|\s)(\d{1,2})\s*(?:час[а-яёa-z0-9_]*|ч)(?:\s|$)/);
    if (m2) return E.fmt(+m2[1] * 60);
    return null;
  };
  A.parseDate = function (text) {
    const t = String(text || '').trim();
    let m = t.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
    if (m) {
      const d = +m[1], mo = +m[2]; let y = m[3] ? +m[3] : new Date().getFullYear();
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
  };

  /* ───── навигация ───── */
  A.go = function (tab) {
    const map = {
      today: 'today', home: 'today', schedule: 'schedule', lessons: 'schedule', buses: 'buses',
      agent: 'agent', tasks: 'tasks', hw: 'tasks', diary: 'diary', notes: 'notes',
      contacts: 'contacts', people: 'contacts', share: 'share', settings: 'settings',
      more: 'more', pack: 'pack', kanban: 'kanban', profile: 'profile'
    };
    C().switchTab(map[tab] || tab);
    return { ok: true, msg: 'Открыл раздел.' };
  };
  A.openCard = function (kind, id) {
    const core = C();
    if (kind === 'lesson' && core.openLessonModal) core.openLessonModal(id);
    else if (kind === 'club' && core.openClubModal) core.openClubModal(id);
    else if (kind === 'hw' && core.openHwModal) core.openHwModal(id);
    else if (kind === 'goal' && core.openGoalModal) core.openGoalModal(id);
    else if (kind === 'note' && core.openNoteModal) core.openNoteModal(id);
    else if (kind === 'person' && O.openPerson) O.openPerson(id);
    else if (kind === 'bus' && core.openBusModal) core.openBusModal(id);
    else return { ok: false, msg: 'Не могу открыть карточку.' };
    return { ok: true, msg: 'Карточка открыта.' };
  };

  /* ───── уроки ───── */
  A.addLesson = function ({ day, subject, start, end, room, teacher, items }) {
    const s = S();
    if (day == null || !subject || !start) return { ok: false, msg: 'Нужны день, предмет и время.' };
    const lesson = {
      id: uid(), day: +day, subject, start, end: end || E.fmt(E.toMin(start) + (+S().settings.lessonDuration || 40)),
      room: room || '', teacher: teacher || '', items: items || []
    };
    s.lessons.push(lesson); saveRender();
    const undo = () => { s.lessons = s.lessons.filter(x => x.id !== lesson.id); saveRender(); };
    logChange(`Урок «${subject}» ${dayLabel(+day)} ${start}`, undo, { type: 'lesson', id: lesson.id });
    return { ok: true, msg: `Урок «${subject}» ${dayLabel(+day)} в ${start}.`, id: lesson.id, undo };
  };
  A.moveLesson = function (idOrQuery, newDay, newStart, fromDay) {
    const s = S();
    let les = (s.lessons || []).find(l => l.id === idOrQuery);
    if (!les && idOrQuery) {
      const q = E.N(idOrQuery), stem = q.length > 5 ? q.slice(0, -2) : q;
      let list = s.lessons.filter(l => { const n = E.N(l.subject); return n.includes(q) || q.includes(n) || n.includes(stem); });
      if (fromDay != null) list = list.filter(l => l.day === +fromDay);
      if (list.length === 1) les = list[0];
      else if (list.length > 1) return { ok: false, msg: 'Какой урок?', candidates: list.slice(0, 6) };
    }
    if (!les) return { ok: false, msg: 'Урок не найден.' };
    const prev = { day: les.day, start: les.start, end: les.end };
    if (newDay != null) les.day = +newDay;
    if (newStart) {
      const dur = (E.toMin(les.end) ?? 0) - (E.toMin(les.start) ?? 0) || 40;
      les.start = newStart;
      les.end = E.fmt((E.toMin(newStart) || 0) + Math.max(dur, 30));
    }
    saveRender();
    const undo = () => { les.day = prev.day; les.start = prev.start; les.end = prev.end; saveRender(); };
    logChange(`Перенос «${les.subject}» → ${dayLabel(les.day)} ${les.start}`, undo, { type: 'lesson', id: les.id });
    return { ok: true, msg: `«${les.subject}» теперь ${dayLabel(les.day)} в ${les.start}.`, undo };
  };
  A.updateLesson = function (id, patch) {
    const s = S();
    const les = (s.lessons || []).find(l => l.id === id);
    if (!les) return { ok: false, msg: 'Урок не найден.' };
    const prev = { room: les.room, teacher: les.teacher, items: (les.items || []).slice(), subject: les.subject, end: les.end };
    Object.assign(les, patch || {});
    saveRender();
    const undo = () => { Object.assign(les, prev); saveRender(); };
    logChange(`Изменён урок «${les.subject}»`, undo, { type: 'lesson', id });
    return { ok: true, msg: 'Урок обновлён.', undo };
  };
  A.removeLesson = function (id) {
    const s = S();
    const les = (s.lessons || []).find(l => l.id === id);
    if (!les) return { ok: false, msg: 'Урок не найден.' };
    s.lessons = s.lessons.filter(l => l.id !== id); saveRender();
    const undo = () => { s.lessons.push(les); saveRender(); };
    logChange(`Удалён урок «${les.subject}»`, undo, { type: 'lesson', id });
    return { ok: true, msg: `Удалён «${les.subject}».`, undo };
  };
  A.removeLessonsDay = function (day) {
    const s = S();
    const gone = s.lessons.filter(l => l.day === day);
    if (!gone.length) return { ok: false, msg: 'На этот день уроков нет.' };
    s.lessons = s.lessons.filter(l => l.day !== day); saveRender();
    const undo = () => { s.lessons = s.lessons.concat(gone); saveRender(); };
    logChange(`Удалены уроки (${dayLabel(day)}): ${gone.length}`, undo, { type: 'lessons-day', day });
    return { ok: true, msg: `Удалено уроков: ${gone.length} (${dayLabel(day)}).`, undo };
  };
  A.listDay = function (day, now) {
    const d = day != null ? day : E.dayIdx(now || new Date());
    const base = now || new Date();
    const cur = E.dayIdx(base);
    const date = E.addDays(base, (d - cur + 7) % 7);
    const list = E.eventsOn(S(), date).list;
    return { ok: true, day: d, list, msg: list.length ? `На ${dayLabel(d)}: ${list.length}` : `На ${dayLabel(d)} пусто.` };
  };

  /* ───── кружки ───── */
  A.addClub = function ({ day, name, start, end, place }) {
    const s = S();
    if (day == null || !name || !start) return { ok: false, msg: 'Нужны день, название и время.' };
    s.clubs = s.clubs || [];
    const c = { id: uid(), day: +day, name, start, end: end || start, place: place || '', teacher: '', items: [] };
    s.clubs.push(c); saveRender();
    const undo = () => { s.clubs = s.clubs.filter(x => x.id !== c.id); saveRender(); };
    logChange(`Кружок «${name}» ${dayLabel(+day)}`, undo, { type: 'club', id: c.id });
    return { ok: true, msg: `Кружок «${name}» ${dayLabel(+day)} в ${start}.`, id: c.id, undo };
  };
  A.removeClub = function (id) {
    const s = S();
    const c = (s.clubs || []).find(x => x.id === id);
    if (!c) return { ok: false, msg: 'Кружок не найден.' };
    s.clubs = s.clubs.filter(x => x.id !== id); saveRender();
    const undo = () => { s.clubs.push(c); saveRender(); };
    logChange(`Удалён кружок «${c.name}»`, undo, { type: 'club', id });
    return { ok: true, msg: `Удалён «${c.name}».`, undo };
  };

  /* ───── автобусы ───── */
  A.addBus = function ({ number, dir, times, walkMin, rideMin, from, to, days }) {
    const s = S();
    s.buses = s.buses || [];
    const list = (Array.isArray(times) ? times : (times ? [times] : [])).map(x => { const m = String(x).match(/(\d{1,2})[:.](\d{2})/); return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : null; }).filter(Boolean);
    if (!list.length) return { ok: false, msg: 'Укажите хотя бы одно время рейса.' };
    const dirName = d => d === 'school' ? 'в школу' : 'домой';
    const ex = s.buses.find(x => String(x.number) === String(number) && ((E.busDir ? E.busDir(x) : (x.dir || 'home')) === (dir || 'home')));
    if (ex) {   // тот же номер и направление — дополняем рейсы, а не плодим дубли
      const prevTimes = (ex.times || []).slice();
      ex.times = [...new Set(prevTimes.concat(list))].sort();
      saveRender();
      const undoEx = () => { ex.times = prevTimes; saveRender(); };
      logChange(`Автобус №${ex.number}: рейсы`, undoEx, { type: 'bus', id: ex.id });
      return { ok: true, msg: `Автобус №${ex.number} (${dirName(dir || 'home')}): рейсы ${ex.times.join(', ')}.`, id: ex.id, undo: undoEx };
    }
    const b = {
      id: uid(), number: String(number || ''), dir: dir || 'home',
      times: [...new Set(list)].sort(), time: list.slice().sort()[0],
      walkMin: walkMin != null ? +walkMin : 5, rideMin: rideMin != null ? +rideMin : 15,
      from: from || '', to: to || '', days: Array.isArray(days) ? days : []
    };
    s.buses.push(b); saveRender();
    const undo = () => { s.buses = s.buses.filter(x => x.id !== b.id); saveRender(); };
    logChange(`Автобус №${b.number}`, undo, { type: 'bus', id: b.id });
    const dn = b.days.length ? ', дни: ' + b.days.map(i => ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][i]).join(' ') : '';
    return { ok: true, msg: `Автобус №${b.number} (${dirName(b.dir)}), рейсы: ${b.times.join(', ')}${dn}.`, id: b.id, undo };
  };
  A.removeBus = function (idOrNum) {
    const s = S();
    let b = (s.buses || []).find(x => x.id === idOrNum);
    if (!b) b = (s.buses || []).find(x => String(x.number) === String(idOrNum));
    if (!b) return { ok: false, msg: 'Автобус не найден.' };
    s.buses = s.buses.filter(x => x.id !== b.id); saveRender();
    const undo = () => { s.buses.push(b); saveRender(); };
    logChange(`Удалён автобус №${b.number}`, undo, { type: 'bus', id: b.id });
    return { ok: true, msg: `Удалён №${b.number}.`, undo };
  };

  /* ───── ДЗ ───── */
  A.addHw = function ({ subject, title, due }) {
    const s = S();
    if (!title && !subject) return { ok: false, msg: 'Что задано?' };
    s.homework = s.homework || [];
    const h = { id: uid(), subject: subject || '', title: title || subject || 'ДЗ', due: due || '', done: false, created: E.dateStr(new Date()) };
    s.homework.push(h); saveRender();
    const undo = () => { s.homework = s.homework.filter(x => x.id !== h.id); saveRender(); };
    logChange(`ДЗ: ${h.title}`, undo, { type: 'hw', id: h.id });
    return { ok: true, msg: `ДЗ: ${h.title}${h.due ? ' до ' + h.due : ''}.`, id: h.id, undo };
  };
  A.doneHw = function (idOrQuery) {
    const s = S();
    const open = (s.homework || []).filter(h => !h.done);
    let h = open.find(x => x.id === idOrQuery);
    if (!h && idOrQuery) {
      const q = E.N(idOrQuery);
      h = open.find(x => E.N(x.subject).includes(q) || E.N(x.title).includes(q));
    }
    if (!h) return { ok: false, msg: open.length ? 'Уточните, какое ДЗ.' : 'Невыполненной домашки нет.', candidates: open.slice(0, 5) };
    h.done = true; saveRender();
    const undo = () => { h.done = false; saveRender(); };
    logChange(`ДЗ сделано: ${h.title}`, undo, { type: 'hw', id: h.id });
    return { ok: true, msg: `Отметил: ${h.title}.`, undo };
  };
  A.listHw = function () {
    const open = (S().homework || []).filter(h => !h.done);
    return { ok: true, list: open, msg: open.length ? `Открытых ДЗ: ${open.length}` : 'Невыполненной домашки нет.' };
  };

  /* ───── люди / ДР ───── */
  A.addPerson = function ({ name, relation, phone, birthday, emergency }) {
    const s = S();
    if (!name) return { ok: false, msg: 'Как зовут?' };
    s.people = s.people || [];
    const p = { id: uid(), name, relation: relation || '', phone: phone || '', birthday: birthday || '', emergency: !!emergency, fav: false };
    s.people.push(p); saveRender();
    const undo = () => { s.people = s.people.filter(x => x.id !== p.id); saveRender(); };
    logChange(`Контакт «${name}»`, undo, { type: 'person', id: p.id });
    return { ok: true, msg: `Контакт «${name}» добавлен.`, id: p.id, undo };
  };
  A.setBirthday = function (query, dateStr) {
    const s = S();
    const q = E.N(typeof query === 'object' && query ? query.name : query || '');
    const list = (query && typeof query === 'object') ? [query] : (s.people || []).filter(p => E.N(p.name).includes(q) || E.N(p.relation).includes(q));
    if (!list.length) return { ok: false, msg: `Не нашёл «${query}».` };
    if (list.length > 1) return { ok: false, msg: 'Кому именно?', candidates: list.slice(0, 5) };
    const p = list[0], prev = p.birthday;
    p.birthday = dateStr; saveRender();
    const undo = () => { p.birthday = prev; saveRender(); };
    logChange(`ДР ${p.name}: ${dateStr}`, undo, { type: 'person', id: p.id });
    return { ok: true, msg: `ДР ${p.name}: ${dateStr}.`, undo };
  };
  A.upcomingBirthdays = function (within) {
    const days = within || 30;
    const list = (S().people || []).filter(p => p.birthday).map(p => {
      const bd = String(p.birthday);
      const mmdd = bd.length >= 10 ? bd.slice(5, 10) : bd.slice(0, 5);
      const now = new Date();
      let next = new Date(now.getFullYear() + '-' + mmdd + 'T12:00:00');
      if (isNaN(+next)) return null;
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
        next = new Date((now.getFullYear() + 1) + '-' + mmdd + 'T12:00:00');
      const delta = Math.round((next - now) / 864e5);
      return { name: p.name, birthday: p.birthday, delta, id: p.id };
    }).filter(Boolean).filter(u => u.delta <= days).sort((a, b) => a.delta - b.delta);
    return { ok: true, list, msg: list.length ? `Скоро ДР: ${list.length}` : 'Ближайших ДР нет.' };
  };

  /* ───── напоминания / цели / заметки / дневник ───── */
  A.addReminder = function ({ text, at }) {
    const s = S();
    s.reminders = s.reminders || [];
    const r = { id: uid(), text: text || 'Напоминание', at: at || null, done: false, created: Date.now() };
    s.reminders.push(r); saveRender();
    const undo = () => { s.reminders = s.reminders.filter(x => x.id !== r.id); saveRender(); };
    logChange(`Напоминание: ${r.text}`, undo, { type: 'reminder', id: r.id });
    return { ok: true, msg: `Напомню: ${r.text}${r.at ? ' (' + r.at + ')' : ''}.`, id: r.id, undo };
  };
  A.addGoal = function (title) {
    const s = S();
    if (!title) return { ok: false, msg: 'Какая цель?' };
    s.goals = s.goals || [];
    const g = { id: uid(), title, progress: 0, done: false };
    s.goals.push(g); saveRender();
    const undo = () => { s.goals = s.goals.filter(x => x.id !== g.id); saveRender(); };
    logChange(`Цель: ${title}`, undo, { type: 'goal', id: g.id });
    return { ok: true, msg: `Цель: ${title}.`, undo };
  };
  A.addNote = function (text) {
    const s = S();
    if (!text) return { ok: false, msg: 'Что записать?' };
    s.notes = s.notes || [];
    const n = { id: uid(), text, at: Date.now() };
    s.notes.unshift(n); saveRender();
    const undo = () => { s.notes = s.notes.filter(x => x.id !== n.id); saveRender(); };
    logChange('Заметка', undo, { type: 'note', id: n.id });
    return { ok: true, msg: 'Заметка сохранена.', undo };
  };
  A.addDiary = function (text, mood) {
    const s = S();
    s.dayLogs = s.dayLogs || [];
    const ds = E.dateStr(new Date());
    const row = { id: uid(), date: ds, text: text || '', mood: mood || '', at: Date.now() };
    s.dayLogs.unshift(row); saveRender();
    const undo = () => { s.dayLogs = s.dayLogs.filter(x => x.id !== row.id); saveRender(); };
    logChange('Запись в дневник', undo, { type: 'diary', id: row.id });
    return { ok: true, msg: 'Записал в дневник.', undo };
  };

  /* ───── рюкзак ───── */
  A.packFor = function (day) {
    const s = S();
    const d = day != null ? day : E.dayIdx(new Date());
    const lessons = (s.lessons || []).filter(l => l.day === d);
    const items = new Set();
    lessons.forEach(l => (l.items || []).forEach(i => items.add(i)));
    const list = [...items];
    const checks = s.packChecks || {};
    const rows = list.map(i => ({ name: i, done: !!(checks[d + ':' + i] || checks[d + ':' + String(i).toLowerCase()]) }));
    return {
      ok: true, day: d, list, rows,
      msg: list.length ? `Взять ${dayLabel(d)}: ${list.join(', ')}` : `На ${dayLabel(d)} вещи не указаны.`
    };
  };
  A.togglePack = function (day, item) {
    const s = S();
    s.packChecks = s.packChecks || {};
    const k = day + ':' + item;
    const prev = !!s.packChecks[k];
    s.packChecks[k] = !prev; saveRender();
    const undo = () => { s.packChecks[k] = prev; saveRender(); };
    logChange((prev ? 'Снято: ' : 'Взято: ') + item, undo, { type: 'pack' });
    return { ok: true, msg: (prev ? 'Снял галочку: ' : 'Отметил: ') + item, undo };
  };

  /* ───── настройки (безопасные) ───── */
  A.setTheme = function (theme) {
    const s = S();
    const prev = s.settings.theme;
    s.settings.theme = theme === 'light' ? 'light' : 'dark';
    C().applyTheme(); C().save();
    const undo = () => { s.settings.theme = prev; C().applyTheme(); C().save(); };
    logChange('Тема: ' + s.settings.theme, undo, { type: 'settings' });
    return { ok: true, msg: 'Тема: ' + (s.settings.theme === 'light' ? 'светлая' : 'тёмная') + '.', undo };
  };
  A.setExitMin = function (n) {
    const s = S();
    const prev = s.settings.exitMin;
    s.settings.exitMin = Math.max(0, Math.min(30, +n || 7));
    C().save();
    const undo = () => { s.settings.exitMin = prev; C().save(); };
    logChange('Выходить за ' + s.settings.exitMin + ' мин', undo, { type: 'settings' });
    return { ok: true, msg: `Выходить к остановке за ${s.settings.exitMin} мин.`, undo };
  };

  /* ───── каталог навыков (этап A+E) ───── */
  A.SKILLS = [
    { id: 'now', label: 'Что сейчас / дальше', examples: ['что дальше', 'сейчас урок'], cat: 'day', phrases: ['что дальше', 'сейчас'] },
    { id: 'day', label: 'Расписание на день', examples: ['расписание на завтра', 'уроки в пятницу'], cat: 'day' },
    { id: 'bus-home', label: 'Автобус домой (сейчас)', examples: ['я освободился', 'автобусы домой'], cat: 'day' },
    { id: 'bus-school', label: 'Когда выходить в школу', examples: ['когда выходить в школу'], cat: 'day' },
    { id: 'pack', label: 'Рюкзак / что взять', examples: ['что взять сегодня', 'рюкзак на завтра'], cat: 'day' },
    { id: 'hw-list', label: 'Список ДЗ', examples: ['что задано', 'домашка'], cat: 'tasks' },
    { id: 'hw-add', label: 'Добавить ДЗ', examples: ['добавь дз мат §12', 'дз русский до пятницы'], cat: 'tasks' },
    { id: 'hw-done', label: 'Отметить ДЗ', examples: ['сделал дз по математике'], cat: 'tasks' },
    { id: 'lesson-add', label: 'Добавить урок', examples: ['добавь урок физика пн 9:00'], cat: 'schedule' },
    { id: 'lesson-move', label: 'Перенести урок', examples: ['перенеси математику на среду', 'перенеси мат на пт 10:00'], cat: 'schedule' },
    { id: 'lesson-del', label: 'Удалить уроки дня', examples: ['удали расписание на среду'], cat: 'schedule' },
    { id: 'club-add', label: 'Добавить кружок', examples: ['добавь кружок шахмат ср 15:00'], cat: 'schedule' },
    { id: 'bus-add', label: 'Добавить автобус', examples: ['добавь автобус 537 домой 12:52 13:40'], cat: 'schedule' },
    { id: 'person', label: 'Звонок / контакт', examples: ['позвони маме', 'добавь контакт'], cat: 'people' },
    { id: 'bday', label: 'Дни рождения', examples: ['дни рождения', 'др мамы 12.03'], cat: 'people' },
    { id: 'remind', label: 'Напоминание', examples: ['напомни через 30 мин'], cat: 'tasks' },
    { id: 'note', label: 'Заметка', examples: ['заметка купить тетрадь'], cat: 'tasks' },
    { id: 'diary', label: 'Дневник', examples: ['дневник сегодня был контрольный'], cat: 'tasks' },
    { id: 'goal', label: 'Цель', examples: ['цель выучить английский'], cat: 'tasks' },
    { id: 'go', label: 'Открыть раздел', examples: ['открой уроки', 'открой настройки'], cat: 'nav' },
    { id: 'theme', label: 'Тема', examples: ['тема светлая', 'тема тёмная'], cat: 'nav' },
    { id: 'undo', label: 'Отменить', examples: ['отмена', 'отмени'], cat: 'nav' },
    { id: 'sos', label: 'SOS', examples: ['sos', 'помощь'], cat: 'sos' },
    { id: 'help', label: 'Справка', examples: ['помощь', 'что умеешь'], cat: 'nav' }
  ];

  A.suggestFromCatalog = function (raw) {
    const t = E.N(raw || '');
    if (!t) return [];
    const out = [];
    for (const sk of A.SKILLS) {
      const pool = [].concat(sk.examples || [], sk.phrases || [], [sk.label]);
      if (pool.some(p => E.N(p).includes(t) || t.length >= 2 && E.N(p).startsWith(t.slice(0, 3)))) {
        out.push({ label: sk.label, cmd: (sk.examples && sk.examples[0]) || sk.label, kind: 'skill', id: sk.id });
      }
      if (out.length >= 8) break;
    }
    return out;
  };
})();
