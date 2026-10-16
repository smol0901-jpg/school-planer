/* Орбита 4 · ГЛАВНЫЙ ЭКРАН — информативный дашборд из настраиваемых виджетов + общий диспетчер действий */
(function () {
  const O = window.Orbit = window.Orbit || {}, E = O.engine, ic = O.ic, esc = O.esc;
  const C = () => O.core(), S = () => C().state;
  O.ui = O.ui || { free: null };
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const DAYF = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'], DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  O.WIDGETS = [
    { id: 'hero', name: 'Сейчас и дальше', on: true }, { id: 'transport', name: 'Автобус под расписание', on: true },
    { id: 'quick', name: 'Быстрые действия', on: true }, { id: 'suggest', name: 'Подсказки по привычкам', on: true },
    { id: 'insights', name: 'Орбита заметила', on: true }, { id: 'daybar', name: 'Лента дня', on: true },
    { id: 'timeline', name: 'План дня', on: true }, { id: 'tasks', name: 'Домашка', on: true },
    { id: 'pack', name: 'Что взять', on: true }, { id: 'people', name: 'Близкие и звонки', on: true },
    { id: 'reminders', name: 'Напоминания', on: true }, { id: 'week', name: 'Нагрузка недели', on: true }, { id: 'goals', name: 'Цели', on: true }
  ];
  O.widgetList = () => {
    const saved = S().settings.widgets, base = O.WIDGETS.map(w => ({ ...w }));
    if (!Array.isArray(saved)) return base;
    const out = []; saved.forEach(w => { const b = base.find(x => x.id === w.id); if (b) out.push({ ...b, on: w.on !== false }); });
    base.forEach(b => { if (!out.find(x => x.id === b.id)) out.push(b); }); return out;
  };

  const type = { lesson: 'Урок', club: 'Кружок', event: 'Событие' };
  const dueChip = (h, now) => {
    if (!h.due) return ''; const t = E.dateStr(now), tm = E.dateStr(E.addDays(now, 1));
    const cls = h.due < t ? 'bad' : h.due === t ? 'warn' : h.due === tm ? 'info' : '';
    const txt = h.due < t ? 'просрочено' : h.due === t ? 'сегодня' : h.due === tm ? 'завтра' : h.due.slice(8) + '.' + h.due.slice(5, 7);
    return `<span class="o-tag ${cls}">${txt}</span>`;
  };
  const left = m => m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60 ? (m % 60) + ' мин' : ''}`.trim();

  /* ───────── виджеты ───────── */
  const W = {};

  W.hero = now => {
    const s = S(), ev = E.eventsOn(s, now), nm = E.nowMin(now), nn = E.nowNext(s, now);
    if (ev.holiday) { const days = Math.max(0, Math.round((new Date(ev.holiday.end + 'T00:00:00') - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5)); return `<div class="o-hero o-hero-free"><div class="o-hero-main"><div class="o-label">Каникулы</div><div class="o-hero-title">${esc(ev.holiday.name)}</div><div class="o-hero-sub">${days ? `Ещё ${days} ${O.plural(days, 'день', 'дня', 'дней')} отдыха` : 'Последний день каникул'}${ev.holiday.homework ? ' · есть задание' : ''}</div></div>${O.ring(0, 92, 8, `<b>${days}</b><small>дн.</small>`)}</div>`; }
    if (!ev.list.length) {
      let nxt = null; for (let i = 1; i <= 7 && !nxt; i++) { const d = E.addDays(now, i), e = E.eventsOn(s, d); if (e.list.length) nxt = { d, first: e.list[0], i }; }
      return `<div class="o-hero o-hero-free"><div class="o-hero-main"><div class="o-label">Свободный день</div><div class="o-hero-title">Занятий нет</div><div class="o-hero-sub">${nxt ? `Дальше: ${nxt.i === 1 ? 'завтра' : DAYF[E.dayIdx(nxt.d)].toLowerCase()} в ${nxt.first.start} — ${esc(nxt.first.title)}` : 'Добавьте расписание, чтобы я мог подсказывать'}</div></div><div class="o-hero-ic">${ic('sparkle', 40, 1.4)}</div></div>`;
    }
    if (nn.current) {
      const c = nn.current; const ringIn = `<b>${nn.left}</b><small>мин</small>`;
      return `<div class="o-hero o-hero-now" data-act="open:${c.type}:${c.id}"><div class="o-hero-main"><div class="o-label"><i class="o-live"></i>Сейчас · ${type[c.type]}</div><div class="o-hero-title">${esc(c.title)}</div><div class="o-hero-sub">${c.start}–${c.end}${c.place ? ' · ' + esc(c.place) : ''}${c.teacher ? ' · ' + esc(c.teacher) : ''}</div>${nn.next ? `<div class="o-hero-next">${ic('arrow', 14)}<span>Далее <b>${esc(nn.next.title)}</b> в ${nn.next.start}${nn.next.place ? ', ' + esc(nn.next.place) : ''}</span></div>` : '<div class="o-hero-next">Это последнее занятие на сегодня</div>'}</div>${O.ring(nn.progress, 96, 8, ringIn)}</div>`;
    }
    if (nn.next) {
      const n = nn.next, first = ev.list[0] === n, ringIn = `<b>${nn.wait < 100 ? nn.wait : Math.floor(nn.wait / 60) + 'ч'}</b><small>${nn.wait < 100 ? 'мин' : ''}</small>`;
      return `<div class="o-hero" data-act="open:${n.type}:${n.id}"><div class="o-hero-main"><div class="o-label">${first ? 'Первое занятие' : 'Перемена · дальше'}</div><div class="o-hero-title">${esc(n.title)}</div><div class="o-hero-sub">В ${n.start}${n.place ? ' · ' + esc(n.place) : ''}${n.teacher ? ' · ' + esc(n.teacher) : ''}</div><div class="o-hero-next">Через ${left(nn.wait)}</div></div>${O.ring(first ? 0 : Math.max(0, 1 - nn.wait / 20), 92, 8, ringIn)}</div>`;
    }
    const total = ev.list.reduce((a, e) => a + (e.e - e.s), 0);
    return `<div class="o-hero o-hero-done"><div class="o-hero-main"><div class="o-label">День завершён</div><div class="o-hero-title">Занятия закончились</div><div class="o-hero-sub">Сегодня: ${ev.list.length} ${O.plural(ev.list.length, 'занятие', 'занятия', 'занятий')} · ${E.dur(total)}</div></div><div class="o-hero-ic">${ic('check', 44, 1.6)}</div></div>`;
  };

  const optPill = (o, i) => `<span class="o-opt${i === 0 ? ' best' : ''}"><b>${esc(o.time)}</b>${o.number ? ' №' + esc(o.number) : ''}<small>выйти ${E.fmt(o.leaveBy)}</small></span>`;

  W.transport = now => {
    const s = S(), nm = E.nowMin(now), cfg = E.cfg(s);
    if (!s.buses.length) return `<div class="o-card o-tr"><div class="o-card-h">${ic('bus', 18)}<h3>Автобус под расписание</h3></div><p class="o-muted">Добавьте рейсы — и я скажу, когда выходить, чтобы успеть к первому уроку и домой после занятий.</p><button class="o-btn" data-act="tab:buses">${ic('plus', 16)} Добавить автобус</button></div>`;
    const ev = E.eventsOn(s, now), les = (ev.list.filter(e => e.type === 'lesson').length ? ev.list.filter(e => e.type === 'lesson') : ev.list.filter(e => e.type !== 'event')), firstS = les.length ? les[0].s : null, lastE = les.length ? Math.max(...les.map(e => e.e)) : null;
    const later = ev.list.filter(e => e.type !== 'lesson' && e.e > Math.max(nm, lastE || 0)), laterEnd = later.length ? Math.max(...later.map(e => e.e)) : null;
    let ovr = O.ui.free; if (ovr && Date.now() - ovr.at > 40 * 60000) ovr = O.ui.free = null;
    let title, body = '', mode;
    const chips = `<div class="o-row-chips"><button class="o-chip hot" data-act="free:0">${ic('check', 14)} Я освободился</button><button class="o-chip" data-act="free:10">Через 10 мин</button><button class="o-chip" data-act="free:20">Через 20 мин</button><button class="o-chip" data-act="tab:buses">Все рейсы</button></div>`;
    if (ovr || (!ev.holiday && les.length && nm >= firstS - 2) || !les.length || ev.holiday) mode = 'home'; else mode = 'school';
    if (mode === 'school') {
      const p = E.planSchool(s, now), b = p.options.find(o => o.min >= nm) || null;
      title = `В школу · к ${les[0].start}`;
      if (b) {
        const li = b.leaveBy - nm, urgent = li <= 5, past = li < 0 && nm <= b.min;
        body = `<div class="o-tr-main ${urgent ? 'urgent' : ''}"><div class="o-bus-no">№${esc(b.number || '—')}</div><div><div class="o-tr-big">${past ? 'Выходи сейчас!' : li <= 0 ? 'Выходи!' : `Выйти через ${left(li)}`}</div><div class="o-tr-sub">Автобус в <b>${b.time}</b> · выход в ${E.fmt(b.leaveBy)} · в школе в ${E.fmt(b.arrive)} · запас ${left(Math.max(0, b.slack))}</div></div></div><div class="o-opts">${p.options.map(optPill).join('')}</div>`;
      } else { const nb = E.nextBuses(s, now, { dir: 'school', limit: 3 }); body = `<div class="o-tr-main urgent"><div class="o-bus-no">!</div><div><div class="o-tr-big">К ${les[0].start} уже не успеть</div><div class="o-tr-sub">${nb.length ? 'Ближайший рейс в ' + nb[0].time + ' — предупредите учителя' : 'Подходящих рейсов не найдено'}</div></div></div>${nb.length ? `<div class="o-opts">${nb.map(optPill).join('')}</div>` : ''}`; }
    } else {
      let freeAt;
      let what = 'после уроков';
      if (ovr) freeAt = ovr.freeAt; else if (lastE != null && nm < lastE) freeAt = lastE; else if (laterEnd != null) { freeAt = laterEnd; what = 'после кружка'; } else freeAt = nm;
      const future = freeAt > nm, p = E.planHome(s, now, { freeAt });
      title = ovr ? `Домой · освобожусь в ${E.fmt(freeAt)}` : future ? `Домой · ${what} (${E.fmt(freeAt)})` : 'Домой · прямо сейчас';
      const b = p.options[0];
      if (b) {
        const li = b.leaveBy - nm, urgent = li <= 5 && li > -3;
        body = `<div class="o-tr-main ${urgent ? 'urgent' : ''}"><div class="o-bus-no">№${esc(b.number || '—')}</div><div><div class="o-tr-big">Автобус в ${b.time}</div><div class="o-tr-sub">${li > 0 ? `Выйти в <b>${E.fmt(b.leaveBy)}</b> (через ${left(li)})` : `<b>Выходить сейчас</b>`} · запас ${left(b.slack)} · дома ≈ ${E.fmt(b.arrive)}</div></div></div><div class="o-opts">${p.options.map(optPill).join('')}</div>${p.missed ? `<div class="o-note">Рейс ${p.missed.time} уже не успеть — не хватает ${p.missed.short} мин.</div>` : ''}${b.slack > 40 ? `<div class="o-note">Ждать автобус ${left(b.slack)} — можно задержаться на кружок или добавить рейс.</div>` : ''}${!ovr && what === 'после уроков' && laterEnd != null ? (() => { const q = E.planHome(s, now, { freeAt: laterEnd }).options[0]; return q ? `<div class="o-note">${ic('clock', 13)} Если остаётесь на кружок (до ${E.fmt(laterEnd)}): автобус №${esc(q.number)} в ${q.time}.</div>` : ''; })() : ''}`;
      } else if (p.nextDay) body = `<div class="o-tr-main"><div class="o-bus-no">${ic('clock', 20)}</div><div><div class="o-tr-big">Сегодня рейсов больше нет</div><div class="o-tr-sub">Ближайший: ${DAYF[p.nextDay.dayIdx].toLowerCase()} в ${p.nextDay.option.time} (№${esc(p.nextDay.option.number)})</div></div></div>`;
      else body = `<p class="o-muted">Для этого направления нет рейсов. Проверьте расписание автобусов.</p>`;
      if (ovr) body += `<button class="o-link" data-act="free:reset">Сбросить «освобожусь в ${E.fmt(freeAt)}»</button>`;
    }
    return `<div class="o-card o-tr"><div class="o-card-h">${ic('bus', 18)}<h3>${title}</h3></div>${body}${chips}</div>`;
  };

  W.quick = () => {
    const tiles = [['free:0', 'bus', 'Я освободился', 'hot'], ['hw:new', 'plus', 'Добавить ДЗ'], ['tab:contacts', 'phone', 'Позвонить'], ['note-new', 'note', 'Заметка'], ['tab:share', 'share', 'Поделиться'], ['sos', 'sos', 'SOS', 'sos']];
    const sos = S().settings.sosEnabled !== false;
    return `<div class="o-quick">${tiles.filter(t => t[0] !== 'sos' || sos).map(t => `<button class="o-qk ${t[3] || ''}" data-act="${t[0]}">${ic(t[1], 22)}<span>${t[2]}</span></button>`).join('')}</div>`;
  };

  W.suggest = now => {
    if (S().settings.agentSuggest === false) return null;
    let items = O.habits.top(now, { prefix: 'cmd:', limit: 4 }).map(m => ({ label: m.label.replace(/^cmd:/, ''), act: 'cmd:' + m.label.replace(/^cmd:/, '') }));
    const learned = items.length;
    if (items.length < 3) {
      const h = now.getHours(), dflt = h < 9 ? [['Когда выходить в школу', 'когда выходить в школу']] : h < 18 ? [['Что дальше', 'что дальше'], ['Когда автобус домой', 'когда автобус домой']] : [['Что взять завтра', 'что взять завтра'], ['Домашка на завтра', 'домашка на завтра']];
      dflt.forEach(d => { if (items.length < 4 && !items.find(i => i.label.toLowerCase() === d[0].toLowerCase())) items.push({ label: d[0], act: 'cmd:' + d[1] }); });
    }
    return `<div class="o-sug"><span class="o-sug-l">${ic('sparkle', 14)} ${learned ? 'Часто в это время' : 'Попробуйте'}</span>${items.map(i => `<button class="o-chip" data-act="${esc(i.act)}">${esc(i.label)}</button>`).join('')}</div>`;
  };

  W.insights = now => {
    const list = E.insights(S(), now); if (!list.length) return null;
    return `<div class="o-card"><div class="o-card-h">${ic('sparkle', 18)}<h3>Орбита заметила</h3></div><ul class="o-ins">${list.map(i => `<li class="${i.level}"><i></i><span>${esc(i.text)}</span>${i.act ? (i.act.tel ? `<a class="o-mini" href="tel:${esc(O.digits(i.act.tel))}">${esc(i.act.label)}</a>` : `<button class="o-mini" data-act="${i.act.tab ? 'tab:' + i.act.tab : 'cmd:' + esc(i.act.cmd)}">${esc(i.act.label)}</button>`) : ''}</li>`).join('')}</ul></div>`;
  };

  W.daybar = now => {
    const s = S(), ev = E.eventsOn(s, now); if (!ev.list.length) return null;
    const nm = E.nowMin(now), first = ev.list[0].s, last = Math.max(...ev.list.map(e => e.e));
    let lo = Math.floor((first - 50) / 60) * 60, hi = Math.ceil((last + 60) / 60) * 60; if (hi - lo < 360) hi = lo + 360;
    const pos = m => Math.max(0, Math.min(100, (m - lo) / (hi - lo) * 100));
    const segs = ev.list.map(e => `<div class="o-seg ${e.type}" style="left:${pos(e.s)}%;width:${Math.max(1.2, pos(e.e) - pos(e.s))}%" title="${esc(e.title)} ${e.start}–${e.end}"><span>${esc(e.title)}</span></div>`).join('');
    const buses = E.departures(S(), now).filter(d => d.min >= lo && d.min <= hi && (d.dir === 'school' ? d.min < first : d.dir === 'home' ? d.min >= first : true)).map(d => `<i class="o-bm ${d.dir}" style="left:${pos(d.min)}%" title="№${esc(d.bus.number)} ${d.time}"></i>`).join('');
    let ticks = ''; for (let m = lo; m <= hi; m += 60) ticks += `<i class="o-tick" style="left:${pos(m)}%"><span>${Math.floor(m / 60)}</span></i>`;
    const nowLine = nm >= lo && nm <= hi ? `<i class="o-now" style="left:${pos(nm)}%"></i>` : '';
    return `<div class="o-card"><div class="o-card-h">${ic('clock', 18)}<h3>Лента дня</h3><span class="o-legend"><i class="lesson"></i>урок<i class="club"></i>кружок<i class="bus"></i>автобус</span></div><div class="o-daybar"><div class="o-track">${segs}${buses}${nowLine}</div><div class="o-ticks">${ticks}</div></div></div>`;
  };

  W.timeline = now => {
    const s = S(), ev = E.eventsOn(s, now), nm = E.nowMin(now); if (!ev.list.length) return null;
    let html = '';
    ev.list.forEach((e, i) => {
      const st = nm >= e.e ? 'past' : nm >= e.s ? 'now' : 'next';
      html += `<div class="o-tl ${st} ${e.type}" data-act="open:${e.type}:${e.id}"><div class="o-tl-t"><b>${e.start}</b><small>${e.end}</small></div><i class="o-tl-dot"></i><div class="o-tl-b"><div class="o-tl-title">${esc(e.title)} <span class="o-tag">${type[e.type]}</span></div><div class="o-tl-m">${esc([e.place, e.teacher].filter(Boolean).join(' · '))}</div></div></div>`;
      const nx = ev.list[i + 1];
      if (nx) { const gap = nx.s - e.e; if (gap >= 5) html += `<div class="o-gap ${gap >= 45 ? 'long' : ''}">${gap >= 45 ? 'Окно' : 'Перемена'} ${left(gap)}</div>`; }
    });
    return `<div class="o-card"><div class="o-card-h">${ic('calendar', 18)}<h3>План дня</h3><button class="o-link" data-act="tab:schedule">Расписание</button></div><div class="o-tls">${html}</div></div>`;
  };

  W.tasks = now => {
    const s = S(), g = E.hwGroups(s, now), rows = [...g.overdue, ...g.today, ...g.tomorrow, ...g.week].slice(0, 6), total = s.homework.length;
    if (!total) return `<div class="o-card"><div class="o-card-h">${ic('check', 18)}<h3>Домашка</h3></div><p class="o-muted">Заданий нет. Скажите агенту: «дз мат §12 до пятницы».</p><button class="o-btn ghost" data-act="hw:new">${ic('plus', 16)} Добавить</button></div>`;
    const pct = total ? g.done / total : 0;
    return `<div class="o-card"><div class="o-card-h">${ic('check', 18)}<h3>Домашка</h3><span class="o-count">${g.done}/${total}</span><button class="o-link" data-act="tab:tasks">Все</button></div><div class="o-bar"><i style="width:${Math.round(pct * 100)}%"></i></div>${rows.length ? `<ul class="o-hw">${rows.map(h => `<li class="p-${h.priority || 'medium'}"><button class="o-chk" data-act="hw:toggle:${h.id}" aria-label="Выполнено">${ic('check', 14, 3)}</button><div class="o-hw-b"><b>${esc(h.subject || 'Без предмета')}</b><span>${esc(h.title)}</span></div>${dueChip(h, now)}</li>`).join('')}</ul>` : '<p class="o-muted">Всё сдано в срок. Отличная работа!</p>'}<button class="o-btn ghost" data-act="hw:new">${ic('plus', 16)} Добавить ДЗ</button></div>`;
  };

  W.pack = now => {
    const s = S(), nm = E.nowMin(now), todayEv = E.eventsOn(s, now).list;
    const useToday = todayEv.length && nm < Math.max(...todayEv.map(e => e.e)) && nm < 15 * 60;
    const date = useToday ? now : E.addDays(now, 1), di = E.dayIdx(date), map = new Map();
    [...s.lessons, ...s.clubs].filter(x => x.day === di).forEach(x => (x.items || []).forEach(it => { const k = it.toLowerCase(); if (!map.has(k)) map.set(k, it); }));
    if (!map.size) return null;
    const items = [...map.entries()], done = items.filter(([k]) => s.packChecks[di + ':' + k]).length;
    return `<div class="o-card"><div class="o-card-h">${ic('bag', 18)}<h3>Рюкзак на ${useToday ? 'сегодня' : 'завтра'}</h3><span class="o-count">${done}/${items.length}</span></div><div class="o-bar"><i style="width:${Math.round(done / items.length * 100)}%"></i></div><div class="o-packs">${items.map(([k, v]) => `<button class="o-pk${s.packChecks[di + ':' + k] ? ' on' : ''}" data-act="pack:${di}:${esc(k)}">${ic('check', 13, 3)}${esc(v)}</button>`).join('')}</div></div>`;
  };

  W.people = now => {
    const s = S(), withPhone = s.people.filter(p => p.phone || p.phone2);
    const sorted = [...withPhone].sort((a, b) => (b.emergency ? 2 : 0) + (b.fav ? 1 : 0) - ((a.emergency ? 2 : 0) + (a.fav ? 1 : 0)));
    const bd = E.birthdays(s, now, 14);
    if (!withPhone.length && !bd.length) return `<div class="o-card"><div class="o-card-h">${ic('users', 18)}<h3>Близкие</h3></div><p class="o-muted">Добавьте телефоны родных — звонок будет в одно касание.</p><button class="o-btn ghost" data-act="tab:contacts">${ic('plus', 16)} Добавить контакт</button></div>`;
    return `<div class="o-card"><div class="o-card-h">${ic('users', 18)}<h3>Близкие</h3><button class="o-link" data-act="tab:contacts">Все</button></div>${sorted.length ? `<div class="o-callrow">${sorted.slice(0, 5).map(p => `<a class="o-callbtn" href="tel:${esc(O.digits(p.phone || p.phone2))}" data-call="${p.id}">${O.avatar(p, 46)}<span>${esc(p.name.split(' ')[0])}</span><em>${ic('phone', 12, 2.4)}</em></a>`).join('')}</div>` : ''}${bd.length ? `<ul class="o-bd">${bd.slice(0, 3).map(b => `<li>${ic('gift', 16)}<span>${esc(b.person.name)}${b.age ? ' · ' + b.age : ''}</span><b>${b.days === 0 ? 'сегодня' : b.days === 1 ? 'завтра' : 'через ' + b.days + ' дн.'}</b></li>`).join('')}</ul>` : ''}</div>`;
  };

  W.reminders = now => {
    const list = (S().reminders || []).filter(r => !r.done).sort((a, b) => (a.at || '').localeCompare(b.at || '')).slice(0, 4); if (!list.length) return null;
    return `<div class="o-card"><div class="o-card-h">${ic('bell', 18)}<h3>Напоминания</h3></div><ul class="o-rem">${list.map(r => `<li><button class="o-chk" data-act="rem-done:${r.id}" aria-label="Готово">${ic('check', 14, 3)}</button><span>${esc(r.text)}</span><b>${r.at ? new Date(r.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</b></li>`).join('')}</ul></div>`;
  };

  W.week = now => {
    const s = S(), ld = E.weekLoad(s), max = Math.max(...ld.map(x => x.min), 1), today = E.dayIdx(now), tot = ld.reduce((a, x) => a + x.min, 0);
    if (!tot) return null; const peak = ld.reduce((a, x) => x.min > a.min ? x : a, ld[0]);
    return `<div class="o-card"><div class="o-card-h">${ic('kanban', 18)}<h3>Нагрузка недели</h3><span class="o-count">${(tot / 60).toFixed(1)} ч</span></div><div class="o-wk">${ld.map(x => `<button class="o-wkc${x.d === today ? ' today' : ''}" data-act="sched:day:${x.d}"><div class="o-wkb"><i style="height:${Math.max(4, Math.round(x.min / max * 100))}%"></i></div><span>${DAYS[x.d]}</span><small>${x.min ? (x.min / 60).toFixed(1) : '—'}</small></button>`).join('')}</div><div class="o-note">Самый плотный день — ${DAYF[peak.d].toLowerCase()} (${(peak.min / 60).toFixed(1)} ч, ${peak.les} ${O.plural(peak.les, 'урок', 'урока', 'уроков')}).</div></div>`;
  };

  W.goals = now => {
    const g = [...S().goals].filter(x => (x.progress || 0) < 100).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9')).slice(0, 3); if (!g.length) return null;
    return `<div class="o-card"><div class="o-card-h">${ic('target', 18)}<h3>Цели</h3><button class="o-link" data-act="tab:tasks">Все</button></div><ul class="o-goals">${g.map(x => { const d = x.deadline ? Math.round((new Date(x.deadline + 'T00:00:00') - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5) : null; return `<li><div><b>${esc(x.title)}</b><small>${d == null ? '' : d < 0 ? 'срок прошёл' : d === 0 ? 'сегодня' : 'ещё ' + d + ' дн.'}</small></div><div class="o-bar"><i style="width:${x.progress || 0}%"></i></div></li>`; }).join('')}</ul></div>`;
  };

  /* ───────── сборка экрана ───────── */
  function greeting(now) {
    const h = now.getHours(), part = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер', s = S(), ev = E.eventsOn(s, now), br = O.brand();
    const chips = []; if (s.profile.className) chips.push(`${ic('school', 14)} ${esc(s.profile.className)}`);
    if (ev.list.length) chips.push(`${ic('book', 14)} ${ev.list.length} ${O.plural(ev.list.length, 'занятие', 'занятия', 'занятий')}`);
    const hol = E.nextHoliday(s, now); if (hol && !hol.active && hol.days <= 21) chips.push(`${ic('sun', 14)} каникулы через ${hol.days} дн.`);
    return `<div class="o-greet"><div><div class="o-hello">${part}${s.profile.name ? ', ' + esc(s.profile.name) : ''}</div><div class="o-date">${DAYF[E.dayIdx(now)]}, ${now.getDate()} ${MONTHS[now.getMonth()]}</div></div><div class="o-gchips">${chips.map(c => `<span>${c}</span>`).join('')}</div></div>`;
  }
  let last = '';
  O.renderDash = function () {
    const root = document.getElementById('dash'); if (!root) return;
    const now = new Date(), parts = O.widgetList().filter(w => w.on).map(w => { try { const h = W[w.id](now); return h ? `<section class="o-w o-w-${w.id}" data-w="${w.id}">${h}</section>` : ''; } catch (e) { console.error('widget', w.id, e); return ''; } }).join('');
    const html = greeting(now) + `<div class="o-grid">${parts}</div>`;
    if (html !== last) { last = html; root.innerHTML = html; }
  };

  /* ───────── диспетчер действий (кнопки везде в приложении) ───────── */
  O.dispatch = function (act) {
    const [a, ...r] = String(act).split(':'), core = C(), s = S();
    O.vibrate(8);
    switch (a) {
      case 'tab': core.switchTab(r[0]); window.scrollTo({ top: 0 }); break;
      case 'cmd': O.assistant.ask(r.join(':')); break;
      case 'free': if (r[0] === 'reset') O.ui.free = null; else { const m = +r[0] || 0, now = new Date(); O.ui.free = { freeAt: E.nowMin(now) + m, at: Date.now() }; O.habits.rec('cmd:я освободился', 'Я освободился'); } O.renderDash(); break;
      case 'hw': if (r[0] === 'toggle') { const h = s.homework.find(x => x.id === r[1]); if (h) { h.done = !h.done; core.save(); core.render(); } } else core.openHwModal(null); break;
      case 'pack': { const k = r[0] + ':' + r.slice(1).join(':'); s.packChecks[k] = !s.packChecks[k]; core.save(); core.render(); break; }
      case 'open': { const [t, id] = r; if (t === 'lesson') core.openLessonModal(id); else if (t === 'club') core.openClubModal(id); else core.openEventModal(id); break; }
      case 'person': O.openPerson(r[0]); break;
      case 'sos': O.openSOS(); break;
      case 'sched': core.setScheduleDay(+r[1]); core.switchTab('schedule'); break;
      case 'note-new': core.openNoteModal(null); break;
      case 'rem-done': { const x = (s.reminders || []).find(v => v.id === r[0]); if (x) { x.done = true; core.save(); core.render(); } break; }
      case 'install': O.install && O.install(); break;
      case 'share': core.switchTab('share'); if (r[0]) O.share.preset(r[0]); break;
      case 'brand': { s.settings.brand = r[0]; core.save(); core.applyTheme(); core.render(); break; }
    }
  };
  document.addEventListener('click', e => {
    const call = e.target.closest('[data-call]'); if (call) { O.habits.rec('call:' + call.dataset.call, 'Звонок'); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.tagName === 'A' && el.getAttribute('href')) return;
    e.preventDefault(); O.dispatch(el.dataset.act);
  });
})();
