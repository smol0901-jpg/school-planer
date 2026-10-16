/* Орбита 4 · ДВИЖОК — чистая логика без DOM: время, расписание дня, автобусы «под уроки», подсказки.
   Работает и в браузере (window.Orbit.engine), и в Node (для тестов). */
(function (root) {
  const E = {};
  const pad = n => String(n).padStart(2, '0');
  const N = s => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е');
  E.N = N;
  E.toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  E.fmt = m => { if (m == null || isNaN(m)) return '—'; const x = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); };
  E.dayIdx = d => (d.getDay() + 6) % 7;                       // 0 = Пн
  E.dateStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); // локальная дата (не UTC!)
  E.nowMin = d => d.getHours() * 60 + d.getMinutes();
  E.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  E.dur = m => m == null ? '' : m >= 60 ? Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '') : m + ' мин';

  E.cfg = s => {
    const st = (s && s.settings) || {};
    const n = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v)) ? d : +v;
    return { exitMin: n(st.exitMin, 7), arriveBefore: n(st.arriveBefore, 5), rideDefault: n(st.rideDefault, 15), showBuses: n(st.showBuses, 4), slackWarn: n(st.slackWarn, 3), dayStart: E.toMin(st.dayStart) ?? 8 * 60 + 30 };
  };

  E.holidayOn = (s, ds) => (s.holidays || []).find(h => h.start && h.end && h.start <= ds && ds <= h.end) || null;

  /* События дня: уроки + кружки + события из канбана, с учётом каникул */
  E.eventsOn = (s, date) => {
    const di = E.dayIdx(date), ds = E.dateStr(date), hol = E.holidayOn(s, ds);
    const mk = (x, type, title, place) => {
      const st = E.toMin(x.start); let en = E.toMin(x.end);
      if (st != null && (en == null || en <= st)) en = st + 40;
      return { id: x.id, type, title: title || '', place: place || '', teacher: x.teacher || '', start: x.start, end: E.fmt(en), s: st, e: en, items: x.items || [], color: x.color || null };
    };
    const list = [
      ...(s.lessons || []).filter(l => l.day === di).map(l => mk(l, 'lesson', l.subject, l.room)),
      ...(s.clubs || []).filter(c => c.day === di).map(c => mk(c, 'club', c.name, c.place)),
      ...(s.events || []).filter(e => e.day === di).map(e => mk(e, 'event', e.title, e.place))
    ].filter(x => x.s != null).sort((a, b) => a.s - b.s);
    return { list: hol ? [] : list, holiday: hol, all: list, date: ds, dayIdx: di };
  };

  /* ───────── Автобусы ───────── */
  E.busTimes = b => (Array.isArray(b.times) && b.times.length ? b.times : (b.time ? [b.time] : [])).filter(t => E.toMin(t) != null);
  E.busDir = b => {
    if (b.dir === 'home' || b.dir === 'school' || b.dir === 'other') return b.dir;
    const to = N(b.to || b.destination), from = N(b.from || b.fromStop);
    if (/дом|home/.test(to)) return 'home';
    if (/школ|лице|гимн|колледж|универ|класс/.test(to)) return 'school';
    if (/школ|лице|гимн/.test(from)) return 'home';
    if (/дом/.test(from)) return 'school';
    const t = E.toMin(E.busTimes(b)[0]);
    return t != null ? (t < 12 * 60 ? 'school' : 'home') : 'other';   // старые записи: утром — в школу, днём — домой
  };
  E.departures = (s, date, dir) => {
    const di = E.dayIdx(date), out = [];
    for (const b of (s.buses || [])) {
      const days = Array.isArray(b.days) && b.days.length ? b.days : [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(di)) continue;
      const d = E.busDir(b); if (dir && d !== dir) continue;
      for (const t of E.busTimes(b)) out.push({ bus: b, time: t, min: E.toMin(t), dir: d });
    }
    return out.sort((a, b) => a.min - b.min);
  };
  const opt = (c, dep, ready, walk) => ({
    bus: dep.bus, number: dep.bus.number || '', time: dep.time, min: dep.min, walk, slack: dep.min - ready,
    leaveBy: dep.min - walk, ride: Number(dep.bus.rideMin) || c.rideDefault, arrive: dep.min + (Number(dep.bus.rideMin) || c.rideDefault),
    stop: dep.bus.stop || dep.bus.from || dep.bus.fromStop || '', to: dep.bus.to || dep.bus.destination || ''
  });

  /* Домой: «я освободился в freeAt» → ближайшие автобусы, на которые реально успеть */
  E.planHome = (s, now, o = {}) => {
    const c = E.cfg(s), nm = E.nowMin(now);
    let freeAt = o.freeAt;
    if (freeAt == null) {
      const ev = E.eventsOn(s, now).list;
      const cur = ev.find(e => e.s <= nm && nm < e.e);
      freeAt = cur ? cur.e : nm;                      // «свободен после текущего занятия, иначе — сейчас»
    }
    const res = { freeAt, exit: c.exitMin, options: [], missed: null, nextDay: null, noBuses: !(s.buses || []).length };
    const build = (date, from) => {
      const deps = E.departures(s, date, 'home'), pool = deps.length ? deps : E.departures(s, date, 'other');
      const ok = [];
      for (const d of pool) {
        const walk = Number(d.bus.walkMin) || 0, ready = from + c.exitMin + walk;
        if (d.min >= ready) ok.push(opt(c, d, ready, walk)); else if (!res.missed && d.min >= from) res.missed = { number: d.bus.number, time: d.time, short: ready - d.min };
      }
      return ok;
    };
    res.options = build(now, freeAt).slice(0, c.showBuses);
    if (!res.options.length) for (let i = 1; i <= 7 && !res.nextDay; i++) {
      const d = E.addDays(now, i), deps = E.departures(s, d, 'home').concat(E.departures(s, d, 'other'));
      if (deps.length) { const f = deps[0]; res.nextDay = { date: E.dateStr(d), dayIdx: E.dayIdx(d), option: opt(c, f, f.min, Number(f.bus.walkMin) || 0) }; }
    }
    return res;
  };

  /* В школу: к первому уроку (минус «быть заранее») — самый поздний автобус, который успевает */
  E.planSchool = (s, date) => {
    const c = E.cfg(s), ev = E.eventsOn(s, date), first = ev.list.find(e => e.type !== 'club') || ev.list[0];
    if (!first) return { first: null, options: [], holiday: ev.holiday };
    const target = first.s - c.arriveBefore, deps = E.departures(s, date, 'school').concat(E.departures(s, date, 'other'));
    const feasible = deps.filter(d => d.min + (Number(d.bus.rideMin) || c.rideDefault) <= target).sort((a, b) => b.min - a.min);
    const options = feasible.slice(0, 3).map(d => { const w = Number(d.bus.walkMin) || 0; const o = opt(c, d, d.min, w); o.slack = target - o.arrive; return o; });
    return { first, target, options, late: !options.length && deps.length > 0, noBuses: !deps.length };
  };

  /* Любые ближайшие рейсы (для «когда автобус») */
  E.nextBuses = (s, now, o = {}) => {
    const c = E.cfg(s), nm = E.nowMin(now), out = [];
    const want = o.number ? N(o.number) : null;
    for (const d of E.departures(s, now, o.dir)) {
      if (want && N(d.bus.number) !== want) continue;
      if (d.min < nm) continue;
      const walk = Number(d.bus.walkMin) || 0;
      out.push({ ...opt(c, d, nm, walk), in: d.min - nm, leaveIn: d.min - walk - nm });
    }
    return out.slice(0, o.limit || c.showBuses);
  };

  /* ───────── Домашка, неделя, дни рождения ───────── */
  E.hwGroups = (s, now) => {
    const t = E.dateStr(now), tm = E.dateStr(E.addDays(now, 1)), wk = E.dateStr(E.addDays(now, 7));
    const g = { overdue: [], today: [], tomorrow: [], week: [], later: [], done: 0 };
    for (const h of (s.homework || [])) {
      if (h.done) { g.done++; continue; }
      if (!h.due) g.later.push(h); else if (h.due < t) g.overdue.push(h); else if (h.due === t) g.today.push(h); else if (h.due === tm) g.tomorrow.push(h); else if (h.due <= wk) g.week.push(h); else g.later.push(h);
    }
    return g;
  };
  E.weekLoad = s => {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const parts = [...(s.lessons || []).filter(x => x.day === d), ...(s.clubs || []).filter(x => x.day === d), ...(s.events || []).filter(x => x.day === d)];
      let min = 0, les = 0, club = 0;
      for (const x of parts) { const a = E.toMin(x.start), b = E.toMin(x.end); if (a != null && b != null && b > a) min += b - a; }
      les = (s.lessons || []).filter(x => x.day === d).length; club = (s.clubs || []).filter(x => x.day === d).length;
      days.push({ d, min, les, club });
    }
    return days;
  };
  E.birthdays = (s, now, within = 30) => {
    const out = [], base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (const p of (s.people || [])) {
      const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec((p.birthday || '').trim()); if (!m) continue;
      let dt = new Date(base.getFullYear(), +m[2] - 1, +m[3]); if (dt < base) dt = new Date(base.getFullYear() + 1, +m[2] - 1, +m[3]);
      const days = Math.round((dt - base) / 864e5);
      if (days <= within) out.push({ person: p, days, age: m[1] ? dt.getFullYear() - +m[1] : null });
    }
    return out.sort((a, b) => a.days - b.days);
  };
  E.nextHoliday = (s, now) => {
    const t = E.dateStr(now), list = (s.holidays || []).filter(h => h.start && h.end && h.end >= t).sort((a, b) => a.start.localeCompare(b.start));
    const h = list[0]; if (!h) return null;
    const startD = new Date(h.start + 'T00:00:00'), base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { h, active: h.start <= t, days: Math.max(0, Math.round((startD - base) / 864e5)) };
  };

  /* ───────── Подсказки «Орбита заметила» ───────── */
  E.insights = (s, now) => {
    const out = [], c = E.cfg(s), nm = E.nowMin(now), ev = E.eventsOn(s, now), L = ev.list;
    const push = (level, text, act) => out.push({ level, text, act: act || null });
    if (!(s.lessons || []).length && !(s.clubs || []).length) push('tip', 'Расписание пустое. Загрузите пример, импортируйте файл или попросите агента: «добавь урок мат пн 8:30».', { label: 'Импорт / обмен', tab: 'share' });
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], b = L[i + 1];
      if (a.e > b.s) push('warn', `Наложение: «${a.title}» (до ${a.end}) и «${b.title}» (с ${b.start}).`, { label: 'Открыть канбан', tab: 'kanban' });
      else if (b.s - a.e >= 60 && a.type === 'lesson' && b.type === 'lesson') push('info', `Окно ${E.dur(b.s - a.e)} между «${a.title}» и «${b.title}» — можно сделать домашку.`);
    }
    const g = E.hwGroups(s, now);
    if (g.overdue.length) push('warn', `Просрочено домашек: ${g.overdue.length}. Самая старая: «${g.overdue[0].subject || g.overdue[0].title}».`, { label: 'К задачам', tab: 'tasks' });
    if (g.today.length) push('warn', `На сегодня задано: ${g.today.length} ДЗ.`, { label: 'К задачам', tab: 'tasks' });
    else if (g.tomorrow.length && nm > 15 * 60) push('info', `К завтрашнему дню не сделано: ${g.tomorrow.length} ДЗ.`, { label: 'К задачам', tab: 'tasks' });
    const tm = E.eventsOn(s, E.addDays(now, 1));
    const tmMin = tm.list.reduce((a, e) => a + (e.e - e.s), 0), tmLes = tm.list.filter(e => e.type === 'lesson').length;
    if (!tm.holiday && (tmLes >= 7 || tmMin >= 6.5 * 60)) push('info', `Завтра тяжёлый день: ${tmLes} уроков, ${E.dur(tmMin)} занятий. Соберите рюкзак заранее.`, { label: 'Что взять завтра', cmd: 'что взять завтра' });
    else if (nm >= 18 * 60 && tm.list.length) push('tip', 'Вечер — самое время собрать рюкзак на завтра.', { label: 'Что взять завтра', cmd: 'что взять завтра' });
    for (const b of E.birthdays(s, now, 7)) push('tip', b.days === 0 ? `Сегодня день рождения: ${b.person.name}!` : `Через ${b.days} дн. день рождения: ${b.person.name}.`, b.person.phone ? { label: 'Позвонить', tel: b.person.phone } : null);
    const hol = E.nextHoliday(s, now); if (hol && !hol.active && hol.days <= 14) push('info', `До каникул «${hol.h.name}» ${hol.days} дн.`);
    if (!(s.buses || []).length) push('tip', 'Добавьте автобусы — Орбита подскажет, когда выходить и на какой успеть после уроков.', { label: 'Добавить', tab: 'buses' });
    else if (L.length && !ev.holiday) {
      const LS = L.filter(e => e.type === 'lesson'), p = E.planHome(s, now, { freeAt: Math.max(...(LS.length ? LS : L.filter(e => e.type !== 'event')).map(e => e.e), 0) || undefined });
      if (p.options[0] && p.options[0].slack > 40) push('info', `После занятий автобус ждать ${E.dur(p.options[0].slack)} (рейс ${p.options[0].time}). Возможно, есть смысл остаться на кружок или добавить рейс.`, { label: 'Автобусы', tab: 'buses' });
      if (!p.options.length && !p.nextDay) push('warn', 'После занятий нет подходящего автобуса домой. Проверьте расписание рейсов.', { label: 'Автобусы', tab: 'buses' });
    }
    if (!(s.people || []).some(p => p.phone)) push('tip', 'Добавьте телефоны близких: звонок в одно касание — из контактов и с главного экрана.', { label: 'Контакты', tab: 'contacts' });
    return out.slice(0, 8);
  };

  /* Какое занятие идёт сейчас / следующее */
  E.nowNext = (s, now) => {
    const nm = E.nowMin(now), L = E.eventsOn(s, now).list;
    const current = L.find(e => e.s <= nm && nm < e.e) || null;
    const next = L.find(e => e.s > nm) || null;
    return { current, next, left: current ? current.e - nm : null, wait: next ? next.s - nm : null, progress: current ? (nm - current.s) / (current.e - current.s) : null, list: L, done: L.length > 0 && !current && !next };
  };

  root.Orbit = root.Orbit || {}; root.Orbit.engine = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
