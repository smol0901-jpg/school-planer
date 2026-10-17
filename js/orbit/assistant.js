/* Орбита 4.2.0 · АГЕНТ — вкладки (чат/быстрые/день/навыки), полный CRUD через Orbit.actions,
   live-подсказки, LLM API, защита SOS. Legacy-команды уроков — через мост. */
(function () {
  const O = window.Orbit = window.Orbit || {}, E = O.engine, ic = O.ic, esc = O.esc, N = E.N;
  const C = () => O.core(), S = () => C().state, $ = id => document.getElementById(id);
  const MKEY = 'orbit-memory-v4';
  const DAYF = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const left = m => m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60 ? (m % 60) + ' мин' : ''}`.trim();
  const MEM_MAX = 200;
  const loadMem = () => { try { return Object.assign({ aliases: {}, notes: [], msgs: [], ctx: null, ttl: 24 }, JSON.parse(localStorage.getItem(MKEY) || '{}')); } catch (e) { return { aliases: {}, notes: [], msgs: [], ctx: null, ttl: 24 }; } };
  let mem = loadMem(), undoStack = [], pending = {}, legacy = false, busy = false;
  /* срок памяти разговора: часы; 0 — не сохранять между сессиями; ≥9999 — не стирать */
  const memHours = () => { let v; try { v = S().settings.agentMemHours; } catch (e) {} if (v == null || v === '') v = mem.ttl; v = +v; return isNaN(v) ? 24 : v; };
  const alive = (m, h) => h >= 9999 || !m.at || Date.now() - m.at <= h * 3600e3;
  const nowTs = Date.now();
  mem.msgs = (mem.msgs || []).map(m => Object.assign({}, m, { at: m.at || nowTs })).filter(m => alive(m, memHours() || 24));
  if (mem.ctx && !alive(mem.ctx, memHours() || 24)) mem.ctx = null;
  if (memHours() <= 0) { mem.msgs = []; mem.ctx = null; }   // «Не помнить»: между запусками ничего не храним
  const saveMem = () => {
    try {
      const h = memHours();
      localStorage.setItem(MKEY, JSON.stringify({ aliases: mem.aliases, notes: mem.notes.slice(-40), ttl: h,
        msgs: h > 0 ? mem.msgs.slice(-MEM_MAX) : [], ctx: h > 0 ? mem.ctx : null }));
    } catch (e) {}
  };
  const A = O.assistant = { msgs: mem.msgs.map(m => ({ role: m.role, text: m.text, at: m.at })), panel: 'chat' };
  A._undoPush = fn => { if (typeof fn === 'function') undoStack.push(fn); };
  const MEM_LABEL = h => h <= 0 ? 'не сохраняю' : h >= 9999 ? 'не стираю' : h < 24 ? (h === 1 ? 'час' : h + ' ч') : h === 24 ? 'сутки' : h === 72 ? '3 суток' : h === 168 ? 'неделя' : h === 720 ? 'месяц' : Math.round(h / 24) + ' сут.';
  A.memLabel = () => MEM_LABEL(memHours());
  /* убрать просроченное из чата и контекста (в сессии при «не помнить» ничего не трогаем) */
  A.prune = () => {
    const h = memHours();
    if (h > 0 && h < 9999) {
      const n = A.msgs.length;
      A.msgs = A.msgs.filter(m => alive(m, h));
      if (mem.ctx && !alive(mem.ctx, h)) mem.ctx = null;
      if (A.msgs.length !== n) { mem.msgs = A.msgs.slice(-MEM_MAX).map(x => ({ role: x.role, text: x.text, at: x.at })); saveMem(); return true; }
    }
    return false;
  };
  A.clearChat = () => { A.msgs = []; mem.msgs = []; mem.ctx = null; saveMem(); try { A.render(true); } catch (e) {} };
  A.setMemHours = h => { try { S().settings.agentMemHours = String(h); C().save(); } catch (e) {} A.prune(); saveMem(); };
  const name = () => O.brand().agent;

  /* ───── разбор времени и дат ───── */
  const pad = n => String(n).padStart(2, '0');
  function timeIn(n) {
    let m;
    if ((m = n.match(/(?:^|\s)(?:в|к|после|до|около)\s*(\d{1,2})[:.\s](\d{2})(?!\d)/))) return { at: +m[1] * 60 + +m[2] };
    if ((m = n.match(/(?:^|\s)(?:в|к|после|около)\s*(\d{1,2})\s*(?:час[а-яёa-z0-9_]*|ч)(?:\s|$)/))) return { at: +m[1] * 60 };
    if (/через\s+полчаса/.test(n)) return { off: 30 };
    if (/через\s+(?:час|1 час)(?:\s|$)/.test(n)) return { off: 60 };
    if ((m = n.match(/через\s+(\d{1,3})\s*(мин[а-яёa-z0-9_]*|м(?![а-яёa-z0-9_]))/))) return { off: +m[1] };
    if ((m = n.match(/через\s+(\d{1,2})\s*(час[а-яёa-z0-9_]*|ч(?![а-яёa-z0-9_]))/))) return { off: +m[1] * 60 };
    return null;
  }
  function dayIn(n, now) {
    const idx = E.dayIdx(now);
    if (/послезавтра/.test(n)) return { d: E.addDays(now, 2), label: 'послезавтра' };
    if (/завтра/.test(n)) return { d: E.addDays(now, 1), label: 'завтра' };
    if (/сегодня|сейчас/.test(n)) return { d: now, label: 'сегодня' };
    const map = [['понедельник|(?:^|\\s)пн(?:\\s|$)', 0], ['вторник|(?:^|\\s)вт(?:\\s|$)', 1], ['сред[ауые]|(?:^|\\s)ср(?:\\s|$)', 2], ['четверг|(?:^|\\s)чт(?:\\s|$)', 3], ['пятниц|(?:^|\\s)пт(?:\\s|$)', 4], ['суббот|(?:^|\\s)сб(?:\\s|$)', 5], ['воскресен|(?:^|\\s)вс(?:\\s|$)', 6]];
    for (const [re, i] of map) if (new RegExp(re).test(n)) { const diff = (i - idx + 7) % 7; return { d: E.addDays(now, diff), label: DAYF[i] }; }
    return null;
  }

  /* ───── контакты ───── */
  const REL = [[/мам/, 'мам'], [/пап/, 'пап'], [/бабуш/, 'бабуш'], [/дедуш|(?:^|\s)деда/, 'дед'], [/брат/, 'брат'], [/сестр/, 'сестр'], [/тет[яеюи]/, 'тет'], [/дяд/, 'дяд'], [/учител/, 'учител'], [/классн/, 'классн'], [/тренер/, 'тренер'], [/друг|подруг/, 'друг']];
  function findPeople(q) {
    const s = S(), nq = N(q).trim(); if (!nq) return [];
    const key = nq.replace(/[^а-яa-z0-9 ]/g, '').trim();
    const al = mem.aliases[key]; if (al) { const p = s.people.find(x => x.id === al); if (p) return [p]; }
    for (const [re, stem] of REL) if (re.test(nq)) { const r = s.people.filter(p => N(p.relation).includes(stem) || N(p.name).includes(stem)); if (r.length) return r; }
    return s.people.filter(p => N(p.name).split(/\s+/).some(w => w.length > 2 && nq.includes(w.slice(0, Math.max(3, w.length - 2)))));
  }
  const phoneOf = p => O.digits(p.phone || p.phone2 || '');
  const smsHref = (p, text) => `sms:${phoneOf(p)}${/iPad|iPhone|iPod/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`;

  /* ───── карточки ───── */
  const busCard = (o, i, mode) => `<div class="o-bopt${i === 0 ? ' best' : ''}"><div class="o-bus-no">№${esc(o.number || '—')}</div><div class="o-bopt-b"><div class="o-bopt-t">${esc(o.time)}${i === 0 ? '<em>лучший</em>' : ''}</div><div class="o-bopt-m">Выйти в <b>${E.fmt(o.leaveBy)}</b> · запас ${left(Math.max(0, o.slack))} · ${mode === 'school' ? 'в школе' : 'дома'} ≈ ${E.fmt(o.arrive)}</div></div></div>`;
  const personCard = (p, text) => { const ph = phoneOf(p); return `<div class="o-pcard">${O.avatar(p, 46)}<div class="o-pcard-t"><b>${esc(p.name)}</b><span>${esc(p.relation || '')}${p.phone ? ' · ' + esc(p.phone) : ''}</span></div>${ph ? `<a class="o-act call" href="tel:${esc(ph)}" data-call="${p.id}">${ic('phone', 18)}<span>Позвонить</span></a><a class="o-act" href="${esc(smsHref(p, text || ''))}" data-call="${p.id}">${ic('message', 18)}<span>SMS</span></a>` : `<button class="o-btn ghost sm" data-act="person:${p.id}">Добавить номер</button>`}</div>`; };
  const evList = list => `<div class="o-mini-list">${list.map(e => `<div><b>${e.start}–${e.end}</b><span>${esc(e.title)}${e.place ? ' · ' + esc(e.place) : ''}</span></div>`).join('')}</div>`;

  /* ───── ответ: единый формат ───── */
  const R = (text, extra = {}) => Object.assign({ role: 'bot', text, cards: [], buttons: [] }, extra);
  const btn = (label, act) => ({ label, act });
  const sug = () => [btn('Что дальше', 'cmd:что дальше'), btn('Когда автобус домой', 'cmd:когда автобус домой'), btn('Позвонить', 'cmd:позвони маме')];

  /* изменение с подтверждением/отменой */
  function change(text, doFn, undoFn, extra) {
    const auto = (S().settings.agentAutonomy || 'smart') !== 'ask';
    if (auto) { doFn(); C().save(); C().render(); undoStack.push(undoFn); return R(text, { buttons: [btn('Отменить', 'ag:undo'), ...(extra || [])] }); }
    const id = Date.now().toString(36); pending[id] = { doFn, undoFn };
    return R('Выполнить? ' + text, { buttons: [btn('Да', 'ag:yes:' + id), btn('Нет', 'ag:no:' + id)] });
  }

  /* ───── интенты ───── */
  const INT = [];
  A._INT = INT;   // для тестов
  const on = (re, fn, name) => INT.push({ re, fn, name });

  // 00) сценарии пользователя (фраза-триггер или «запусти …»)
  on(/./, (t) => { const sc = O.scripts && O.scripts.match(t); if (!sc) return null; O.scripts.run(sc); return R('Запускаю сценарий «' + sc.name + '».'); }, 'script');

  // 0) экстренное
  on(/(^|\s)(sos|опасн|экстренн|скорую|полици[юя]|заблудил|потерял(ся|ась)|мне страшно|на помощь)/, () => {
    const s = S(), num = s.settings.sosNumber || '112', em = s.people.filter(p => p.phone && p.emergency);
    return R('Сохраняйте спокойствие. Для вызова ' + num + ' откройте SOS — там защита от случайного набора (два шага).', {
      cards: em.slice(0, 3).map(p => personCard(p, 'Мне нужна помощь')),
      buttons: [btn('Открыть SOS', 'sos'), btn('Экстренные контакты', 'tab:contacts')]
    });
  }, 'sos');

  // 1) «я освободился» → ближайший автобус ОТ СЕЙЧАС (или от указанного времени), не от конца уроков
  on(/(освобо[дж][а-яёa-z0-9_]*|закончил[а-яёa-z0-9_]*|заканчива[а-яёa-z0-9_]*|закончу|кончил|кончаю|отпустил[а-яёa-z0-9_]*|отпустят|выхожу из школы|выхожу со школы|иду домой|пора домой|свободен|свободна|уроки (всё|все))/, (t, n, now) => {
    const ti = timeIn(n), s = S(), nm = E.nowMin(now);
    // всегда от «сейчас», если не сказали «в 12:00» / «через 10 минут»
    const freeAt = ti ? (ti.at != null ? ti.at : nm + (ti.off || 0)) : nm;
    return homePlan(s, now, freeAt, !!ti);
  }, 'free');
  function familyContacts() {
    const s = S(), out = [], seen = new Set();
    const add = p => { if (p && p.id && !seen.has(p.id) && phoneOf(p)) { seen.add(p.id); out.push(p); } };
    for (const key of ['мама', 'папа', 'бабушка', 'дедушка']) {
      if (mem.aliases[key]) add(s.people.find(x => x.id === mem.aliases[key]));
      findPeople(key).forEach(add);
    }
    // по relation
    (s.people || []).forEach(p => {
      const r = E.N(p.relation || ''), nm = E.N(p.name || '');
      if (/мам|пап|бабуш|дедуш|родн/.test(r) || /мам|пап|бабуш|дедуш/.test(nm)) add(p);
    });
    // избранные / SOS
    (s.people || []).filter(p => p.fav || p.emergency).forEach(add);
    return out.slice(0, 4);
  }
  function homePlan(s, now, freeAt, explicit) {
    const nm = E.nowMin(now);
    const p = E.planHome(s, now, { freeAt });
    if (!(s.buses || []).length) return R('Автобусов пока нет. Добавьте маршрут — и я буду подбирать рейс под ваши уроки.', { buttons: [btn('Добавить автобус', 'tab:buses')] });
    O.lastPlan = { kind: 'home', freeAt, options: p.options };
    if (!p.options.length) return p.nextDay ? R(`С ${E.fmt(freeAt)} сегодня рейсов домой больше нет. Ближайший — ${DAYF[p.nextDay.dayIdx]} в ${p.nextDay.option.time} (№${p.nextDay.option.number}).`, { buttons: [btn('Все рейсы', 'tab:buses')] }) : R('Не нашёл рейсов домой после вашего времени. Проверьте направление «домой» и время рейсов.', { buttons: [btn('Открыть автобусы', 'tab:buses')] });
    const b = p.options[0], li = b.leaveBy - nm, waitBus = b.min - freeAt;
    const eta = `Я освободился, еду домой на №${b.number}, буду около ${E.fmt(b.arrive)}`;
    let txt = explicit ? `Освобождаешься в ${E.fmt(freeAt)}. ` : `Сейчас ${E.fmt(nm)}. `;
    txt += `Ближайший автобус домой — №${b.number} в ${b.time}. `;
    if (li > 0) txt += `Выйти к остановке в ${E.fmt(b.leaveBy)} — через ${left(li)}. `;
    else txt += 'Выходить нужно прямо сейчас! ';
    if (waitBus > 60) txt += `Раньше рейсов нет — ждать около ${left(waitBus)}. `;
    else txt += `Запас на сборы ${left(Math.max(0, b.slack))}. `;
    if (p.missed) txt += `Рейс ${p.missed.time} уже не успеть. `;
    txt += 'Предупредить родных?';
    const cards = p.options.slice(0, 3).map((o, i) => busCard(o, i, 'home'));
    const fam = familyContacts();
    fam.forEach(who => {
      const short = (who.name || '').split(' ')[0] || who.relation || 'контакт';
      cards.push(personCard(who, eta));
    });
    const btns = [btn('Следующий рейс', 'ag:next'), btn('Через 10 мин', 'cmd:я освобожусь через 10 минут')];
    if (fam[0]) btns.unshift(btn('Позвонить ' + ((fam[0].name || '').split(' ')[0] || 'родным'), 'cmd:позвони ' + (fam[0].name || fam[0].relation || 'маме')));
    if (!fam.length) btns.push(btn('Добавить контакт', 'tab:contacts'));
    return R(txt.trim(), { cards, buttons: btns });
  }

  // 2) автобусы
  on(/(автобус|маршрут|рейс|когда (ехать|выходить|выезжать)|во сколько (ехать|выходить)|успею ли|успею на)/, (t, n, now) => {
    const s = S(), nm = E.nowMin(now);
    if (!(s.buses || []).length) return R('Автобусов пока нет. Добавьте маршрут, и я посчитаю, когда выходить.', { buttons: [btn('Добавить автобус', 'tab:buses')] });
    const num = (n.match(/(?:№|номер|автобус)\s*(\d{1,3})/) || [])[1];
    if (num) { const l = E.nextBuses(s, now, { number: num, limit: 4 }); return l.length ? R(`Автобус №${num}: ближайшие рейсы ${l.map(x => x.time).join(', ')}. До остановки идти ${l[0].walk} мин — выйти в ${E.fmt(l[0].leaveBy)}.`, { cards: l.map((o, i) => busCard(o, i, 'home')) }) : R(`На сегодня рейсов №${num} больше нет.`, { buttons: [btn('Все рейсы', 'tab:buses')] }); }
    const ti = timeIn(n);
    const toSchool = /(в школу|на урок|к уроку|к первому|утром|на занят|на учёб)/.test(n), toHome = /(домой|из школы|после уроков|после школы)/.test(n);
    const ev = E.eventsOn(s, now).list, lastE = ev.length ? Math.max(...ev.map(e => e.e)) : null;
    if (/успею/.test(n) && ti && ti.at != null) {
      const deps = E.departures(s, now).filter(d => Math.abs(d.min - ti.at) <= 1); const d = deps[0];
      if (!d) return R(`Рейса в ${E.fmt(ti.at)} не нашёл. Ближайшие: ${E.nextBuses(s, now, { limit: 3 }).map(x => x.time).join(', ') || 'нет'}.`);
      const walk = Number(d.bus.walkMin) || 0, ready = nm + (toSchool ? 0 : E.cfg(s).exitMin) + walk, slack = d.min - ready;
      return R(slack >= 0 ? `Да, успеваешь на ${d.time} (№${d.bus.number}): запас ${left(slack)}. Выйти до ${E.fmt(d.min - walk)}.` : `Не успеть на ${d.time}: не хватает ${left(-slack)}. Следующий — ${(E.nextBuses(s, now, { limit: 5 }).find(x => x.min > d.min) || {}).time || 'нет'}.`);
    }
    if (toSchool || (!toHome && ev.length && nm < ev[0].s)) {
      let date = (lastE != null && nm > lastE) || !ev.length ? E.addDays(now, 1) : now, p = E.planSchool(s, date);
      for (let k = 2; !p.first && k <= 8; k++) { date = E.addDays(now, k); p = E.planSchool(s, date); }   // ближайший день с уроками
      if (!p.first) return R('В ближайшие дни занятий нет — в школу ехать не нужно.');
      if (!p.options.length) return R(`К ${p.first.start} ни один рейс не успевает${p.noBuses ? ' (нет рейсов в школу)' : ''}.`, { buttons: [btn('Открыть автобусы', 'tab:buses')] });
      const b = p.options[0]; O.lastPlan = { kind: 'school', options: p.options };
      const li = b.leaveBy - nm, dd = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5), day = dd <= 0 ? '' : dd === 1 ? 'Завтра ' : ['В понедельник ', 'Во вторник ', 'В среду ', 'В четверг ', 'В пятницу ', 'В субботу ', 'В воскресенье '][E.dayIdx(date)];
      return R(`${day}Первое занятие в ${p.first.start}. Лучший автобус — №${b.number} в ${b.time}: ${dd <= 0 && li > 0 ? `выйти в ${E.fmt(b.leaveBy)} (через ${left(li)})` : `выйти в ${E.fmt(b.leaveBy)}`}, в школе в ${E.fmt(b.arrive)}, запас ${left(b.slack)}.`, { cards: p.options.map((o, i) => busCard(o, i, 'school')), buttons: [btn('Следующий рейс', 'ag:next')] });
    }
    if (ti && ti.at != null) return homePlan(s, now, ti.at, true);
    return homePlan(s, now, lastE != null && nm < lastE ? lastE : nm, lastE != null && nm < lastE);
  }, 'bus');

  // 3) что сейчас / дальше
  on(/^(сейчас|дальше|потом|следующий|что там|сейчас урок|урок)$|(что (сейчас|дальше|следующ|потом|за урок)|какой (сейчас |следующий )?урок|следующий урок|где (я|мне) (сейчас|должен)|что у меня сейчас)/, (t, n, now) => {
    const nn = E.nowNext(S(), now), ev = E.eventsOn(S(), now);
    if (ev.holiday) return R(`Сейчас каникулы «${ev.holiday.name}». Занятий нет.`);
    if (!ev.list.length) return R('Сегодня занятий нет. Хорошего отдыха!');
    if (nn.current) return R(`Сейчас: ${nn.current.title}${nn.current.place ? ' (' + nn.current.place + ')' : ''} до ${nn.current.end}, осталось ${left(nn.left)}.${nn.next ? ` Дальше — ${nn.next.title} в ${nn.next.start}.` : ' Это последнее занятие на сегодня.'}`, { buttons: nn.next ? [] : [btn('Я освободился', 'cmd:я освободился')] });
    if (nn.next) return R(`Следующее: ${nn.next.title} в ${nn.next.start}${nn.next.place ? ', ' + nn.next.place : ''} — через ${left(nn.wait)}.`);
    return R('Занятия на сегодня закончились.', { buttons: [btn('Автобус домой', 'cmd:я освободился')] });
  }, 'now');

  // 4) расписание дня / окончание уроков
  on(/(когда|во сколько)\s+(закан|конч)[а-яёa-z0-9_]*\s+(уроки|занят[а-яёa-z0-9_]*|школа|день)|расписание\s+(на\s+)?(сегодня|завтра|послезавтра|\S+)|(что|какие)\s+(уроки\s+)?(сегодня|завтра|послезавтра|в (понедельник|вторник|среду|четверг|пятницу|субботу))|^уроки\s+(на\s+|в\s+)?(сегодня|завтра|послезавтра|понедельник|вторник|среду|четверг|пятницу|субботу)/, (t, n, now) => {
    const day = dayIn(n, now) || { d: now, label: 'сегодня' }, ev = E.eventsOn(S(), day.d);
    if (ev.holiday) return R(`На ${day.label} — каникулы «${ev.holiday.name}».`);
    if (!ev.list.length) return R(`На ${day.label} занятий нет.`);
    const les = ev.list.filter(e => e.type !== 'event'), end = Math.max(...(les.length ? les : ev.list).map(e => e.e));
    if (/(закан|конч)/.test(n)) return R(`${day.label[0].toUpperCase() + day.label.slice(1)} уроки заканчиваются в ${E.fmt(end)}.`, { cards: [evList(ev.list)], buttons: [btn('Автобус после уроков', 'cmd:я освобожусь в ' + E.fmt(end))] });
    return R(`Расписание на ${day.label}: ${ev.list.length} ${O.plural(ev.list.length, 'занятие', 'занятия', 'занятий')}, с ${ev.list[0].start} до ${E.fmt(end)}.`, { cards: [evList(ev.list)], buttons: [btn('Что взять', 'cmd:что взять ' + day.label)] });
  }, 'day');

  // 5) звонок / SMS
  on(/(позвони|позвонить|набери|дозвон[а-яёa-z0-9_]*|вызови|звонок)\s*(.*)/, (t, n) => { const q = n.replace(/^.*?(позвони|позвонить|набери|дозвон[а-яёa-z0-9_]*|вызови|звонок)\s*/, '').replace(/^(мне|пожалуйста)\s+/, ''); return contact(q, 'call'); }, 'call');
  on(/(напиши|отправь смс|смс|сообщи|напишу)\s+(.*)/, (t, n) => { const m = t.match(/(?:напиши|смс|сообщи)\s+(\S+)\s*[,:]?\s*(?:что\s+)?(.*)$/i); return contact(m ? m[1] : '', 'sms', m ? m[2] : ''); }, 'sms');
  function contact(q, verb, text) {
    const s = S(), list = findPeople(q);
    if (!q.trim()) { const withP = s.people.filter(p => p.phone); return withP.length ? R('Кому позвонить?', { buttons: withP.slice(0, 6).map(p => btn(p.name.split(' ')[0] + (p.relation ? ' (' + p.relation + ')' : ''), 'ag:pick:' + p.id + ':' + verb)) }) : R('Контактов с номерами нет. Добавьте близких.', { buttons: [btn('Добавить контакт', 'person:new')] }); }
    if (!list.length) return R(`Не нашёл «${q.trim()}» в контактах.`, { buttons: [btn('Добавить контакт', 'person:new'), btn('Все контакты', 'tab:contacts')] });
    if (list.length > 1) { pending.pickKey = N(q).replace(/[^а-яa-z0-9 ]/g, '').trim(); return R('Кому именно?', { buttons: list.slice(0, 6).map(p => btn(p.name + (p.relation ? ' · ' + p.relation : ''), 'ag:pick:' + p.id + ':' + verb)) }); }
    const p = list[0], eta = O.lastPlan && O.lastPlan.kind === 'home' && O.lastPlan.options[0] ? `Выехал домой на автобусе №${O.lastPlan.options[0].number}, буду примерно в ${E.fmt(O.lastPlan.options[0].arrive)}` : '';
    if (!phoneOf(p)) return R(`У контакта «${p.name}» нет номера.`, { buttons: [btn('Добавить номер', 'person:' + p.id)] });
    return R(verb === 'sms' ? `Сообщение для ${p.name}. Нажмите «SMS», чтобы отправить.` : `Нажмите, чтобы позвонить: ${p.name}.`, { cards: [personCard(p, text || eta)] });
  }

  // 6) домашка
  on(/^(добавь |запиши |новое |новая |задай |задать )?(дз|домашк[а-яёa-z0-9_]*|домашнее задание|задание)\s+(.+)/, (t, n, now) => {
    const bare = !/^(добавь |запиши |новое |новая |задай |задать )/i.test(t);
    const body0 = t.replace(/^(добавь |запиши |новое |новая |задай |задать )?(дз|домашк[а-яёa-z0-9_]*|домашнее задание|задание)\s+/i, '');
    if (bare && /^(на|до|к)\s+(завтра|послезавтра|сегодня|понедельник|вторник|сред|четверг|пятниц|суббот|воскресень|пн|вт|ср|чт|пт|сб|вс)/i.test(body0)) return null;   // «домашка на завтра» — это вопрос, а не добавление
    const body = body0.replace(/^по\s+/i, '');
    const words = body.split(/\s+/); let subj = null, used = 0;
    const first = C().resolveSubject(words[0]);
    if (first && C().SUBJECTS.includes(first)) {
      subj = first; used = 1; const sw = first.toLowerCase().split(' ');
      if (sw.length > 1 && words[1] && sw[1].startsWith(N(words[1]).slice(0, 3))) used = 2;   // «русский язык», «окружающий мир»
    }
    let rest = words.slice(used).join(' ');
    const due = dayIn(N(rest), now), pr = /срочно|важно/.test(N(rest)) ? 'high' : 'medium';
    rest = rest.replace(/(?:^|\s)(?:до|на|к)\s+(?:послезавтра|завтра|сегодня|понедельник\S*|вторник\S*|сред\S*|четверг\S*|пятниц\S*|суббот\S*|воскресень\S*|пн|вт|ср|чт|пт|сб|вс)(?=\s|$|[.,;])/i, ' ').replace(/(?:^|\s)(срочно|важно)(?=\s|$|[.,;!])/ig, ' ').replace(/\s+/g, ' ').trim();
    if (!rest) return R('Что именно задано? Например: «дз мат §12 до пятницы».');
    const h = { id: C().uid(), subject: subj || '', title: rest, due: due ? E.dateStr(due.d) : '', done: false, priority: pr };
    return change(`ДЗ${subj ? ' по предмету «' + subj + '»' : ''}: ${rest}${due ? ', на ' + due.label : ''}${pr === 'high' ? ', важное' : ''}.`, () => S().homework.push(h), () => { const s = S(); s.homework = s.homework.filter(x => x.id !== h.id); });
  }, 'hw-add');
  on(/^(дз|домашк[а-яёa-z0-9_]*|домашнее задание|задания?|что делать)$/, (t, n, now) => { const g = E.hwGroups(S(), now), list = [...g.overdue, ...g.today, ...g.tomorrow, ...g.week]; if (!list.length) return R('Невыполненной домашки нет.'); return R(`Нужно сделать: ${list.length}.`, { cards: [`<div class="o-mini-list">${list.slice(0, 8).map(h => `<div><b>${esc(h.subject || '—')}</b><span>${esc(h.title)}${h.due ? ' · до ' + h.due.slice(8) + '.' + h.due.slice(5, 7) : ''}</span></div>`).join('')}</div>`], buttons: [btn('Открыть задачи', 'tab:tasks')] }); }, 'hw-list');
  on(/(что задано|домашк[а-яёa-z0-9_]* на|дз на|какое дз|какая домашка)/, (t, n, now) => {
    const g = E.hwGroups(S(), now), day = dayIn(n, now); let list;
    if (day) { const ds = E.dateStr(day.d); list = S().homework.filter(h => !h.done && h.due === ds); } else list = [...g.overdue, ...g.today, ...g.tomorrow, ...g.week];
    if (!list.length) return R(day ? `На ${day.label} ничего не задано.` : 'Невыполненной домашки нет.');
    return R(`Нужно сделать: ${list.length}.`, { cards: [`<div class="o-mini-list">${list.slice(0, 8).map(h => `<div><b>${esc(h.subject || '—')}</b><span>${esc(h.title)}${h.due ? ' · до ' + h.due.slice(8) + '.' + h.due.slice(5, 7) : ''}</span></div>`).join('')}</div>`], buttons: [btn('Открыть задачи', 'tab:tasks')] });
  }, 'hw-list');
  on(/(сделал|сделала|выполнил[а-яёa-z0-9_]*|сдал[а-яёa-z0-9_]*)\s+(дз|домашк[а-яёa-z0-9_]*|задание)?\s*(по\s+)?(.*)/, (t, n) => {
    const q = n.replace(/^.*?(сделал[а-яёa-z0-9_]*|выполнил[а-яёa-z0-9_]*|сдал[а-яёa-z0-9_]*)\s+(дз|домашк[а-яёa-z0-9_]*|задание)?\s*(по\s+)?/, '').trim(), s = S();
    const pend = s.homework.filter(h => !h.done), subj = q ? C().resolveSubject(q) : null;
    const m = q ? pend.filter(h => N(h.subject) === N(subj) || N(h.title).includes(q)) : pend;
    if (!m.length) return R(q ? `Не нашёл невыполненную домашку по «${q}».` : 'Невыполненной домашки нет.');
    if (m.length > 1) return R('Какую отметить?', { buttons: m.slice(0, 5).map(h => btn(`${h.subject || ''} ${h.title}`.trim().slice(0, 36), 'ag:done:' + h.id)) });
    const h = m[0]; return change(`Отмечу выполненным: ${h.subject ? h.subject + ' — ' : ''}${h.title}.`, () => { h.done = true; }, () => { h.done = false; });
  }, 'hw-done');

  // 7) напоминания
  on(/^напомни[а-яёa-z0-9_]*\s*(?:мне)?\s*(.*)/, (t, n, now) => {
    let rest = t.replace(/^напомни[а-яёa-z0-9_]*\s*(?:мне)?\s*/i, ''); const ti = timeIn(N(rest)), day = dayIn(N(rest), now);
    if (!ti && !day) return R('Когда напомнить? Например: «напомни через 30 минут позвонить маме» или «напомни завтра в 8:00 взять форму».');
    let at = new Date(now);
    if (day) at = new Date(day.d);
    if (ti && ti.off != null) at = new Date(now.getTime() + ti.off * 60000); else if (ti && ti.at != null) { at.setHours(Math.floor(ti.at / 60), ti.at % 60, 0, 0); if (!day && at <= now) at = E.addDays(at, 1); } else { at.setHours(8, 0, 0, 0); }
    rest = rest.replace(/через\s+(?:полчаса|час|\d+\s*\S+)/i, '').replace(/(?:^|\s)(?:в|к)\s*\d{1,2}[:.]\d{2}/i, '').replace(/(?:^|[^а-яёa-z0-9_])(послезавтра|завтра|сегодня)(?![а-яёa-z0-9_])/i, '').replace(/\s+/g, ' ').trim() || 'Напоминание';
    const r = { id: C().uid(), text: rest[0].toUpperCase() + rest.slice(1), at: at.toISOString(), done: false };
    return change(`Напомню «${r.text}» ${at.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`, () => { (S().reminders = S().reminders || []).push(r); O.notify && O.notify.ask(); }, () => { S().reminders = S().reminders.filter(x => x.id !== r.id); });
  }, 'remind');

  // 8) рюкзак
  on(/(что взять|что брать|рюкзак|собрать (портфель|рюкзак))/, (t, n, now) => {
    const day = dayIn(n, now) || ((E.nowMin(now) >= 15 * 60) ? { d: E.addDays(now, 1), label: 'завтра' } : { d: now, label: 'сегодня' });
    const di = E.dayIdx(day.d);
    const r = (O.actions && O.actions.packFor) ? O.actions.packFor(di) : { msg: '—', rows: [] };
    const rows = r.rows || [];
    if (!rows.length) return R(`На ${day.label} вещей в списке нет. Укажите «что взять» в карточке урока.`, { buttons: [btn('Уроки', 'tab:schedule')] });
    const card = `<div class="o-packs">${rows.map(row => `<button type="button" class="o-pk${row.done ? ' on' : ''}" data-ag="ag:pack:${di}:${encodeURIComponent(row.name)}">${ic('check', 13, 3)}${esc(row.name)}</button>`).join('')}</div>`;
    return R(`На ${day.label}: отметьте, что уже положили.`, { cards: [card], buttons: [btn('Открыть рюкзак', 'tab:pack')] });
  }, 'pack');

  // 9) настройки словами
  on(/(?:тем[ауы]?|режим)\s+(темн[а-яёa-z0-9_]*|светл[а-яёa-z0-9_]*|авто[а-яёa-z0-9_]*|amoled|амолед[а-яёa-z0-9_]*)|(?:темн[а-яёa-z0-9_]*|светл[а-яёa-z0-9_]*)\s+(?:тем[ауы]|режим)/, (t, n) => { const v = /светл/.test(n) ? 'light' : /авто/.test(n) ? 'auto' : /amoled|амол/.test(n) ? 'amoled' : 'dark'; return setting(`Тема: ${({ light: 'светлая', dark: 'тёмная', auto: 'как в системе', amoled: 'AMOLED' })[v]}.`, { theme: v }); }, 'theme');
  on(/(бренд|стиль|оформление|оболочк[а-яёa-z0-9_]*)\s+(орбит[а-яёa-z0-9_]*|ритм|вектор|закат)/, (t, n) => { const id = /орбит/.test(n) ? 'orbit' : /ритм/.test(n) ? 'ritm' : /вектор/.test(n) ? 'vektor' : 'zakat'; return setting(`Оформление: «${O.brands[id].name}». Теперь меня зовут ${O.brands[id].agent}.`, { brand: id }); }, 'brand');
  on(/(крупн[а-яёa-z0-9_]*|больше|увелич[а-яёa-z0-9_]*)\s*(шрифт|текст)|шрифт\s*(крупн|больше)/, () => setting('Увеличил текст.', { textScale: Math.min(140, (+S().settings.textScale || 100) + 10) }), 'font+');
  on(/(мельч[а-яёa-z0-9_]*|меньше|уменьш[а-яёa-z0-9_]*)\s*(шрифт|текст)|шрифт\s*(мельч|меньше)/, () => setting('Уменьшил текст.', { textScale: Math.max(85, (+S().settings.textScale || 100) - 10) }), 'font-');
  on(/(?:до остановки|идти до остановки|иду до остановки)\s*(\d{1,2})\s*мин|(\d{1,2})\s*мин[а-яёa-z0-9_]*\s*(?:до остановки|иду до остановки)/, (t, n, now, m) => { const v = +(m[1] || m[2]), s = S(); if (!s.buses.length) return R('Сначала добавьте автобус.'); const prev = s.buses.map(b => b.walkMin); return change(`Время до остановки для всех маршрутов: ${v} мин.`, () => s.buses.forEach(b => b.walkMin = v), () => s.buses.forEach((b, i) => b.walkMin = prev[i])); }, 'walk');
  on(/(?:на выход|на сборы|собираюсь)\s*(\d{1,2})\s*мин|(\d{1,2})\s*мин[а-яёa-z0-9_]*\s*(?:на выход|на сборы)/, (t, n, now, m) => { const v = +(m[1] || m[2]); return setting(`Время на выход из школы: ${v} мин. Учту при расчёте автобусов.`, { exitMin: v }); }, 'exit');
  on(/^(настройки|открой настройки|параметры)$/, () => R('Открываю настройки.', { buttons: [btn('Настройки', 'tab:settings')] }), 'settings');
  function setting(text, patch) { const s = S(), prev = {}; Object.keys(patch).forEach(k => prev[k] = s.settings[k]); return change(text, () => { Object.assign(s.settings, patch); C().applyTheme(); }, () => { Object.assign(s.settings, prev); C().applyTheme(); }); }

  // 10) обмен и навигация
  on(/(поделись|поделиться|отправь (расписание|данные|план)|экспорт|qr|кюар|блютуз|bluetooth|передай (расписание|данные))/, () => R('Открываю обмен: можно по QR, файлом, через системное меню «Отправить» (Bluetooth, Nearby Share, AirDrop, мессенджеры) или кодом.', { buttons: [btn('Открыть обмен', 'tab:share'), btn('Только расписание', 'share:schedule')] }), 'share');
  on(/^(открой|покажи|перейди|перейти)\s+(на\s+)?(.+)/, (t, n) => {
    const map = [[/автобус/, 'buses'], [/расписан|урок/, 'schedule'], [/контакт|телефон/, 'contacts'], [/задач|домашк|дз/, 'tasks'], [/заметк/, 'notes'], [/дневник/, 'diary'], [/рюкзак/, 'pack'], [/канбан/, 'kanban'], [/настройк/, 'settings'], [/профил/, 'profile'], [/главн|сегодня|дашборд/, 'today'], [/обмен|поделит/, 'share']];
    const m = map.find(([re]) => re.test(n)); return m ? (C().switchTab(m[1]), R('Готово.')) : null;
  }, 'nav');

  // 11) память
  on(/^запомни[:,]?\s+(.+)/, (t) => { const f = t.replace(/^запомни[:,]?\s+/i, '').trim(); mem.notes.push({ t: f, at: Date.now() }); saveMem(); return R(`Запомнил: «${f}».`, { buttons: [btn('Что ты помнишь', 'cmd:что ты помнишь')] }); }, 'remember');
  on(/^(.+?)\s+(?:это|—|-)\s+(.+)$/, (t, n) => {
    const m = t.match(/^(мама|папа|бабушка|дедушка|брат|сестра)\s+(?:это|—|-)\s+(.+)$/i); if (!m) return null;
    const p = S().people.find(x => N(x.name).includes(N(m[2]).slice(0, 4))); if (!p) return R(`Не нашёл «${m[2]}» в контактах.`, { buttons: [btn('Добавить контакт', 'person:new')] });
    mem.aliases[N(m[1])] = p.id; saveMem(); return R(`Хорошо: «${m[1]}» — это ${p.name}. Теперь «позвони ${m[1].replace(/а$/, 'е')}» набирает её/его номер.`);
  }, 'alias');
  on(/(что ты помнишь|что ты знаешь обо мне|твоя память|покажи память)/, () => {
    const hab = O.habits.all().slice(0, 5), al = Object.entries(mem.aliases);
    const parts = []; if (al.length) parts.push('Контакты: ' + al.map(([k, v]) => { const p = S().people.find(x => x.id === v); return `«${k}» → ${p ? p.name : '?'}`; }).join('; ')); if (mem.notes.length) parts.push('Заметки: ' + mem.notes.slice(-5).map(x => x.t).join('; ')); if (hab.length) parts.push('Часто просите: ' + hab.map(h => `${h.label} (${h.count})`).join(', '));
    return R(parts.length ? parts.join('\n') : 'Пока почти ничего: я учусь на ваших частых действиях. Скажите «запомни…» или «мама — это Ирина».', { buttons: [btn('Забыть всё', 'ag:forget')] });
  }, 'memory');
  on(/^(забудь все|забудь всё|очисти память)/, () => R('Стереть память агента (привычки, заметки, связи контактов)?', { buttons: [btn('Да, забыть', 'ag:forget'), btn('Нет', 'ag:no:x')] }), 'forget');
  on(/^(отмени|отмена|верни назад)$/, () => { const u = undoStack.pop(); if (!u) return R('Нечего отменять.'); u(); C().save(); C().render(); return R('Отменено.'); }, 'undo');
  on(/^(алло|алё|але|ало|ау|эй|прив|привет|приветик|здравствуй[а-яёa-z0-9_]*|здорово|хай|hi|hello|ку|добрый (день|вечер)|доброе утро|доброй ночи)( (алло|алё|але|ало|орби|орбита))*$/, () => {
    const h = new Date().getHours();
    const hi = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    return R(hi + '! Я на связи. Скажи «я освободился» — подберу автобус, или «что дальше» — покажу день.', { buttons: sug() });
  }, 'hello');
  on(/^(как дела|как ты|спасибо|благодарю|пока|до свидания|ок|окей|ладно|хорошо)$/, (t, n) => {
    if (/^(пока|до свидания)/.test(n)) return R('Пока! Если что — я тут.');
    if (/^(спасибо|благодарю)/.test(n)) return R('Пожалуйста!');
    if (/^как/.test(n)) return R('Всё хорошо, работаю. Чем помочь?', { buttons: sug() });
    return R('Хорошо.', { buttons: sug() });
  }, 'smalltalk');
  on(/^(помощь|помоги мне|что (ты )?(умеешь|можешь)|команды)$/, () => {
    const skills = (O.actions && O.actions.SKILLS) || [];
    const byCat = {};
    skills.forEach(sk => { (byCat[sk.cat] || (byCat[sk.cat] = [])).push(sk); });
    const catTitle = { day: 'День', tasks: 'Задачи', schedule: 'Расписание', people: 'Люди', nav: 'Навигация', sos: 'SOS' };
    const blocks = Object.keys(catTitle).map(c => {
      const list = byCat[c] || [];
      if (!list.length) return '';
      return '<li><b>' + catTitle[c] + '</b>: ' + list.slice(0, 4).map(s => '«' + esc((s.examples && s.examples[0]) || s.label) + '»').join(', ') + '</li>';
    }).filter(Boolean).join('');
    return R(`Я ${name()}. Команды из каталога навыков:`, {
      cards: [`<ul class="o-help">${blocks}<li>Вкладки сверху: <b>Быстрые</b>, <b>День</b>, <b>Правки</b>, <b>Навыки</b></li><li>«отмена» — откатить последнее изменение</li></ul>`],
      buttons: [btn('Навыки', 'ag:panel:skills'), btn('Быстрые', 'ag:panel:quick'), ...sug()]
    });
  }, 'help');

  // порядок: сначала сценарии/SOS и ТОЧНЫЕ команды-изменения, потом общие «справочные» правила, последним — обучение алиасам
  const PRI = ['script', 'sos', 'clear-chat', 'mem-set', 'mem-info', 'recall', 'undo', 'remind', 'hw-add', 'hw-done', 'forget', 'remember', 'lesson-del', 'lesson-rm', 'lesson-move', 'lesson-add', 'club-del', 'club-add', 'bus-del', 'bus-add', 'person-add', 'diary', 'note', 'goal', 'theme', 'memory', 'help', 'day', 'now', 'pack'];
  const sortInt = () => { if (INT._s) return; INT._s = 1; const w = n => { const i = PRI.indexOf(n); return i < 0 ? (n === 'alias' ? 999 : 500) : i; }; INT.sort((a, b) => w(a.name) - w(b.name)); };


  /* ───── горизонтальная прокрутка подсказок на ПК: колесо, перетаскивание, стрелки ───── */
  (function () {
    const SEL = '.o-chips-row, .o-live-chips, .o-agent-tabs';
    const host = e => (e.target && e.target.closest) ? e.target.closest(SEL) : null;
    document.addEventListener('wheel', e => {
      const el = host(e); if (!el || el.scrollWidth <= el.clientWidth + 1) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    let drag = null, moved = false, justDragged = false;
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const el = host(e); if (!el || el.scrollWidth <= el.clientWidth + 1) return;
      drag = { el, x: e.clientX, left: el.scrollLeft }; moved = false;
    });
    document.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!moved && Math.abs(dx) > 5) { moved = true; drag.el.classList.add('dragging'); }
      if (moved) drag.el.scrollLeft = drag.left - dx;
    });
    const end = () => { if (!drag) return; drag.el.classList.remove('dragging'); justDragged = moved; drag = null; setTimeout(() => { justDragged = false; }, 60); };
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
    document.addEventListener('click', e => { if (justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);
  })();


  /* ───── контекст разговора: «а завтра?», «а в пятницу?», «ещё» ───── */
  const CTX_INTENTS = ['day', 'pack', 'hw-list', 'now', 'bus', 'free'];
  function followUp(text) {
    const c = mem.ctx; if (!c || !c.at || !alive(c, memHours() || 24)) return null;
    const n = N(text).trim().replace(/[?!.…]+$/, '').trim();
    const dw = n.match(/^(?:а|и|ну а|а ещё|а еще)?\s*(?:на\s+|в\s+|во\s+|у\s+)?(сегодня|завтра|послезавтра|понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс)$/);
    if (dw) {
      const pre = { day: 'расписание на ', pack: 'что взять ', 'hw-list': 'что задано на ' }[c.name] || (['now', 'bus', 'free'].includes(c.name) ? 'расписание на ' : null);
      if (pre) return pre + dw[1];
    }
    if (/^(?:а\s+|и\s+)?(?:ещё|еще|дальше|следующий|другой|потом|а потом)(?:\s+рейс)?$/.test(n) && (c.name === 'bus' || c.name === 'free') && O.lastPlan) return '\u0000next';
    if (/^(повтори|ещё раз|еще раз|что ты сказал[аи]?)$/.test(n) && c.text) return c.text;
    return null;
  }
  const dayTitle = ts => {
    const d = new Date(ts), n = new Date(), k = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((k(n) - k(d)) / 864e5);
    return diff === 0 ? 'Сегодня' : diff === 1 ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };
  const hhmm = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const chatHistory = () => {
    const h = memHours(); if (h <= 0 && !A.msgs.length) return '';
    const list = A.msgs.filter(m => m.text && alive(m, h <= 0 ? 24 : h)).slice(0, -1).slice(-10);
    return list.map(m => (m.role === 'user' ? 'Пользователь: ' : 'Орби: ') + String(m.text).replace(/\s+/g, ' ').slice(0, 220)).join('\n');
  };

  on(/(?:о чём|что)\s+(?:мы\s+)?(?:говорили|обсуждали|болтали)|что\s+(?:я\s+)?(?:спрашивал[а-яё]*|просил[а-яё]*|говорил[а-яё]*)|вспомни\s+(?:разговор|переписк[а-яё]*)|(?:покажи|моя)\s+(?:истори[а-яё]*|переписк[а-яё]*)/, () => {
    if (memHours() <= 0) return R('Память разговора выключена — переписка не сохраняется. Включить: Настройки → Агент → «Память разговора».', { buttons: [btn('Настройки', 'tab:settings')] });
    const mine = A.msgs.filter(m => m.role === 'user' && m.text).slice(0, -1).slice(-8);
    if (!mine.length) return R('Пока мы ничего не обсуждали.');
    return R('Вот что ты писал последним (помню: ' + A.memLabel() + '):\n' + mine.map(m => (m.at ? dayTitle(m.at) + ' ' + hhmm(m.at) + ' — ' : '') + m.text).join('\n'), { buttons: [btn('Очистить переписку', 'cmd:очисти переписку')] });
  }, 'recall');
  on(/(?:как долго|сколько)\s+(?:ты\s+)?(?:помнишь|хранишь|запоминаешь)|память разговора|помнишь ли (?:ты )?(?:разговор|переписк)/, () =>
    R(memHours() <= 0 ? 'Сейчас я не сохраняю переписку между запусками.' : `Помню переписку: ${A.memLabel()}. Сообщений в памяти: ${A.msgs.length}. Изменить срок:`, { buttons: [btn('Час', 'cmd:помни переписку час'), btn('Сутки', 'cmd:помни переписку сутки'), btn('Неделя', 'cmd:помни переписку неделю'), btn('Месяц', 'cmd:помни переписку месяц')] }), 'mem-info');
  on(/^(?:помни|храни|запоминай)\s+(?:переписк[а-яё]*|разговор[а-яё]*)?\s*(не стирай|навсегда|час|сутки|день|3 дня|три дня|неделю|месяц|не надо|не помни|выключи)$/, (t, n, now, m) => {
    const w = m[1], h = /не стирай|навсегда/.test(w) ? 9999 : /не надо|не помни|выключи/.test(w) ? 0 : w === 'час' ? 1 : /сутки|день/.test(w) ? 24 : /3 дня|три дня/.test(w) ? 72 : w === 'неделю' ? 168 : 720;
    A.setMemHours(h);
    return R(h <= 0 ? 'Хорошо, переписку между запусками не сохраняю.' : `Хорошо, помню переписку: ${MEM_LABEL(h)}.`, { buttons: [btn('Что мы обсуждали', 'cmd:что мы обсуждали')] });
  }, 'mem-set');
  on(/^(?:очисти|сотри|удали|забудь)\s+(?:чат|переписк[а-яё]*|историю|разговор)$/, () => { A.clearChat(); return R('Переписка очищена. Привычки и заметки остались — их можно стереть командой «очисти память».'); }, 'clear-chat');

  /* ───── главный обработчик ───── */

  // ─── 4.2: навигация, ДР, заметки, цели, уроки через actions ───
  on(/^(открой|открыть|перейди|перейти|покажи раздел|раздел)\s+(.+)/, (t, n) => {
    const q = n.replace(/^(открой|открыть|перейди|перейти|покажи раздел|раздел)\s+/, '').trim();
    const map = { урок: 'schedule', уроки: 'schedule', расписан: 'schedule', автобус: 'buses', контакт: 'contacts', людей: 'contacts', задач: 'tasks', домашк: 'tasks', дневник: 'diary', заметк: 'notes', настройк: 'settings', обмен: 'share', рюкзак: 'pack', сегодня: 'today', канбан: 'kanban', профил: 'profile' };
    let tab = null;
    for (const [k, v] of Object.entries(map)) if (q.includes(k)) { tab = v; break; }
    if (!tab) return R('Куда открыть?', { buttons: [btn('Уроки', 'tab:schedule'), btn('Задачи', 'tab:tasks'), btn('Контакты', 'tab:contacts'), btn('Настройки', 'tab:settings')] });
    O.actions.go(tab);
    return R('Открыл раздел.', { buttons: [btn('Ещё разделы', 'tab:more')] });
  }, 'go');

  on(/((?:ден[ьи]|дни)\s*рожден|ближайшие\s*др|(?:^|[^а-яёa-z0-9_])др(?![а-яёa-z0-9_])|именин)/, (t, n) => {
    if (/добав|поставь|запиш|у\s+\S+\s+\d|\d{1,2}[./-]\d{1,2}/.test(n)) {
      const m = t.match(/(?:др|день рождения|др\.?)\s+(.+?)\s+(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)/i) || t.match(/у\s+(\S+)\s+(\d{1,2}[./-]\d{1,2})/i);
      if (m) {
        const date = O.actions.parseDate(m[2]);
        if (!date) return R('Дата в формате ДД.ММ или ДД.ММ.ГГГГ.');
        const who = findPeople(m[1].replace(/^у\s+/i, ''));
        if (!who.length) return R(`Не нашёл «${m[1].replace(/^у\s+/i, '')}» в контактах.`, { buttons: [btn('Добавить контакт', 'person:new'), btn('Контакты', 'tab:contacts')] });
        if (who.length > 1) return R('Кому именно?', { buttons: who.slice(0, 6).map(p => btn(p.name, 'cmd:др ' + p.name + ' ' + m[2])) });
        const r = O.actions.setBirthday(who[0], date);
        if (r.candidates) return R(r.msg, { buttons: r.candidates.map(p => btn(p.name, 'cmd:др ' + p.name + ' ' + m[2])) });
        if (r.ok && r.undo) { undoStack.push(r.undo); return R(r.msg, { buttons: [btn('Отменить', 'ag:undo')] }); }
        return R(r.msg || 'Не вышло.');
      }
      return R('Например: «др мамы 12.03» или «день рождения у Ивана 01.05».');
    }
    const r = O.actions.upcomingBirthdays(45);
    if (!r.list.length) return R('Ближайших дней рождения нет. Добавьте ДР в контактах или скажите «др мамы 12.03».', { buttons: [btn('Контакты', 'tab:contacts')] });
    const lines = r.list.slice(0, 8).map(u => `• ${u.name} — ${u.delta === 0 ? 'сегодня' : u.delta === 1 ? 'завтра' : 'через ' + u.delta + ' дн.'}`);
    return R('Ближайшие ДР:\n' + lines.join('\n'), { buttons: [btn('Контакты', 'tab:contacts')] });
  }, 'bday');

  on(/^(?:добавь\s+)?(заметка|заметку|запиши|запиши заметку|note)\s+(.+)/i, (t, n, now, m) => {
    const text = (m && m[2]) || t.replace(/^(?:добавь\s+)?(заметка|заметку|запиши|запиши заметку|note)\s+/i, '');
    const r = O.actions.addNote(text.trim());
    if (r.ok && r.undo) { undoStack.push(r.undo); return R(r.msg, { buttons: [btn('Отменить', 'ag:undo'), btn('Заметки', 'tab:notes')] }); }
    return R(r.msg);
  }, 'note');

  on(/^(?:добавь\s+)?(цель|новая цель)\s+(.+)/i, (t, n, now, m) => {
    const title = (m && m[2]) || '';
    const r = O.actions.addGoal(title.trim());
    if (r.ok && r.undo) { undoStack.push(r.undo); return R(r.msg, { buttons: [btn('Отменить', 'ag:undo'), btn('Задачи', 'tab:tasks')] }); }
    return R(r.msg);
  }, 'goal');

  // «добавь урок физика пн вт 9:00-9:40» — несколько дней, диапазон времени, предлоги (в JS (?![а-яёa-z0-9_]) не работает с кириллицей)
  const DW = { пн: 0, пон: 0, понедельник: 0, вт: 1, вторник: 1, ср: 2, среда: 2, среду: 2, чт: 3, четверг: 3, пт: 4, пятница: 4, пятницу: 4, сб: 5, суббота: 5, субботу: 5, вс: 6, воскресенье: 6 };
  on(/^(добавь|добавить|новый)\s+урок\s+(.+)/i, (t, n) => {
    const rest = N(t).replace(/^(добавь|добавить|новый)\s+урок\s+/, '');
    const times = (rest.match(/\d{1,2}[:.]\d{2}/g) || []).map(x => x.replace('.', ':').replace(/^(\d):/, '0$1:'));
    const days = [];
    const words = rest.replace(/\d{1,2}[:.]\d{2}/g, ' ').replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
    const subj = [];
    words.forEach(w => { const r = w.match(/^([а-я]+)[-–]([а-я]+)$/); if (r && DW[r[1]] != null && DW[r[2]] != null) { for (let d = DW[r[1]], k = 0; k < 7; k++, d = (d + 1) % 7) { if (!days.includes(d)) days.push(d); if (d === DW[r[2]]) break; } } else if (DW[w] != null) { if (!days.includes(DW[w])) days.push(DW[w]); } else if (!/^(в|во|на|по|и|с|до|-|–)$/.test(w)) subj.push(w); });
    if (!days.length) { const d = O.actions.parseDay(rest, new Date()); if (d) { days.push(d.idx); const i = subj.indexOf(d.label); if (i >= 0) subj.splice(i, 1); } }
    let subject = subj.join(' ').trim();
    try { const rs = C().resolveSubject && C().resolveSubject(subject); if (rs) subject = rs; } catch (e) {}
    if (!subject || !days.length || !times.length) {
      return R('Формат: «добавь урок Математика пн вт 8:30» или «… пн 8:30-9:10». Не хватает: ' + [!subject && 'предмета', !days.length && 'дня', !times.length && 'времени'].filter(Boolean).join(', ') + '.', { buttons: [btn('Добавить урок', 'cmd:добавь урок'), btn('Уроки', 'tab:schedule')] });
    }
    const msgs = [], undos = [];
    days.forEach(d => { const r = O.actions.addLesson({ day: d, subject, start: times[0], end: times[1] }); msgs.push(r.msg); if (r.undo) undos.push(r.undo); });
    if (undos.length) { undoStack.push(() => undos.forEach(u => u())); return R(msgs.join('\n'), { buttons: [btn('Отменить', 'ag:undo'), btn('Расписание', 'tab:schedule')] }); }
    return R(msgs.join('\n'));
  }, 'lesson-add');
  on(/^добавь\s+(автобус|кружок|контакт)\s*$/, (t, n, now, m) => R({ 'автобус': 'Какой автобус? Скажи номер, направление и время: «добавь автобус 537 домой 12:52 13:40».', 'кружок': 'Скажи: «добавь кружок шахмат ср 15:00».', 'контакт': 'Скажи: «добавь контакт Мама +79001234567».' }[m[1]], { buttons: [btn('Автобусы', 'tab:buses')] }), 'bus-add');

  on(/^(удали|удалить|очисти)\s+(расписание|уроки)\s+(на\s+)?(.+)/i, (t, n) => {
    const day = O.actions.parseDay(t, new Date());
    if (day == null) return R('Укажите день: «удали расписание на среду».');
    const auto = (S().settings.agentAutonomy || 'smart') !== 'ask';
    if (!auto) return R(`Удалить все уроки на ${day.label}?`, { buttons: [btn('Да, удалить', 'cmd:удали расписание на ' + day.label + ' !confirm'), btn('Нет', 'ag:noop')] });
    if (!/!confirm/.test(t) && !auto) { /* handled above */ }
    const r = O.actions.removeLessonsDay(day.idx);
    if (r.ok && r.undo) { undoStack.push(r.undo); return R(r.msg, { buttons: [btn('Отменить', 'ag:undo')] }); }
    return R(r.msg);
  }, 'lesson-del');

  on(/что\s+взять|рюкзак|собрать\s+портфель|проверка\s+дня/, (t, n) => {
    const day = O.actions.parseDay(t, new Date());
    const d = day ? day.idx : E.dayIdx(new Date());
    const r = O.actions.packFor(d);
    const rows = r.rows || [];
    const card = rows.length
      ? `<div class="o-packs">${rows.map(row => `<button type="button" class="o-pk${row.done ? ' on' : ''}" data-ag="ag:pack:${d}:${encodeURIComponent(row.name)}">${ic('check', 13, 3)}${esc(row.name)}</button>`).join('')}</div>`
      : '';
    return R(r.msg, {
      cards: card ? [card] : [],
      buttons: [btn('Открыть рюкзак', 'tab:pack'), btn('Уроки', 'tab:schedule'), btn('Что дальше', 'cmd:что дальше')]
    });
  }, 'pack');



  // ─── этап A: перенос, кружок, автобус, дневник, тема, отмена ───




  /* ───── разбор «день / время / кабинет» в командах (кириллица-безопасно) ───── */
  const CYR = '[\\wа-яёА-ЯЁ]';
  const DAYWORD = '(?:понедельник' + CYR + '*|вторник' + CYR + '*|сред' + CYR + '*|четверг' + CYR + '*|пятниц' + CYR + '*|суббот' + CYR + '*|воскресень' + CYR + '*|пн|вт|ср|чт|пт|сб|вс|сегодня|завтра|послезавтра)';
  const DAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const RE_DAYPHRASE = new RegExp('(?:^|\\s)(?:(?:на|в|во|к|по)\\s+)?' + DAYWORD + '(?=\\s|$|[.,;])', 'gi');
  const RE_TIMEPHRASE = /(?:^|\s)(?:(?:в|к|с|до|на)\s+)?\d{1,2}[:.]\d{2}(?=\s|$|[.,;])/g;
  function splitCmd(rest) {
    let txt = String(rest || '').trim(), room = '';
    const rm = txt.match(/(?:^|\s|,)(?:каб(?:инет)?\.?|ауд(?:итория)?\.?)\s*№?\s*([0-9a-zа-я\/-]+)/i);
    if (rm) { room = rm[1]; txt = txt.replace(rm[0], ' '); }
    txt = txt.replace(/\s[-—–]\s.*$/, ' ').replace(/\s*[-—–]\s*$/, ' ');
    const day = O.actions.parseDay(txt, new Date()), time = O.actions.parseTime(txt);
    txt = txt.replace(RE_DAYPHRASE, ' ').replace(RE_TIMEPHRASE, ' ').replace(/(?:^|\s)(?:на|в|к|с)(?=\s*$)/gi, ' ')
      .replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '');
    return { day, time, room, text: txt };
  }
  const addMin = (t, m) => E.fmt((E.toMin(t) || 0) + m);
  const askOrDo = (t, q, doFn) => {
    const auto = (S().settings.agentAutonomy || 'smart') !== 'ask';
    if (auto || /!confirm\s*$/.test(t)) return doFn();
    return R(q, { buttons: [btn('Да, удалить', 'cmd:' + t.replace(/\s*!confirm\s*$/, '') + ' !confirm'), btn('Нет', 'ag:noop')] });
  };
  const undoReply = (r, extra) => {
    if (r.ok && r.undo) { undoStack.push(r.undo); return R(r.msg, { buttons: [btn('Отменить', 'ag:undo'), ...(extra || [])] }); }
    return R(r.msg || 'Не вышло.');
  };
  const subjOf = txt => { let x = String(txt || '').trim(); try { const rs = x && C().resolveSubject && C().resolveSubject(x); if (rs) x = rs; } catch (e) {} return x; };
  const stemOf = q => { const x = N(q).trim(); return x.length > 5 ? x.slice(0, -2) : x; };
  const sameSubj = (name, q) => { const a = N(name), b = N(q); return !!b && (a.includes(b) || b.includes(a) || a.includes(stemOf(b))); };

  on(/^(удали|удалить|убери|сотри)\s+урок(?![\wа-яё])\s*(.*)$/i, (t) => {
    const sp = splitCmd(t.replace(/^\S+\s+урок\s*/i, '').replace(/\s*!confirm\s*$/, ''));
    const q = subjOf(sp.text);
    if (!q) return R('Какой урок удалить? Например: «удали урок физика пн».');
    let list = (S().lessons || []).filter(l => sameSubj(l.subject, q));
    if (sp.day) list = list.filter(l => l.day === sp.day.idx);
    if (sp.time) list = list.filter(l => l.start === sp.time);
    if (!list.length) return R(`Не нашёл урок «${q}»${sp.day ? ' на ' + sp.day.label : ''}.`, { buttons: [btn('Уроки', 'tab:schedule')] });
    if (list.length > 1) return R('Какой именно?', { buttons: list.slice(0, 6).map(l => btn(`${l.subject} ${DAYS_SHORT[l.day]} ${l.start}`, `cmd:удали урок ${l.subject} ${DAYS_SHORT[l.day]} ${l.start}`)) });
    const l = list[0];
    return askOrDo(t, `Удалить «${l.subject}» (${DAYS_SHORT[l.day]} ${l.start})?`, () => undoReply(O.actions.removeLesson(l.id)));
  }, 'lesson-rm');

  on(/^(перенес[\wа-яё]*|перемест[\wа-яё]*|сдвин[\wа-яё]*|перекин[\wа-яё]*)\s+(.+)/i, (t) => {
    let rest = t.replace(/^\S+\s+/, '').replace(/^(?:все\s+)?урок[\wа-яё]*\s+/i, '').trim();
    let from = null;
    const fm = rest.match(new RegExp('(?:^|\\s)с\\s+(' + DAYWORD + ')(?=\\s|$)', 'i'));
    if (fm) { from = O.actions.parseDay(fm[1], new Date()); rest = rest.replace(fm[0], ' '); }
    const sp = splitCmd(rest);
    const subj = subjOf(sp.text.replace(/(?:^|\s)урок[\wа-яё]*(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim());
    if (!subj || (!sp.day && !sp.time)) return R('Формат: «перенеси математику на среду», «перенеси мат на пт 10:00» или «перенеси мат с пн на ср».');
    const r = O.actions.moveLesson(subj, sp.day ? sp.day.idx : null, sp.time || undefined, from ? from.idx : null);
    if (r.candidates) {
      const tail = (sp.day ? ' на ' + DAYS_SHORT[sp.day.idx] : '') + (sp.time ? ' ' + sp.time : '');
      return R(r.msg + ' Выбери:', { buttons: r.candidates.map(l => btn(`${l.subject} ${DAYS_SHORT[l.day]} ${l.start || ''}`, `cmd:перенеси ${l.subject} с ${DAYS_SHORT[l.day]}${tail}`)) });
    }
    return undoReply(r, [btn('Уроки', 'tab:schedule')]);
  }, 'lesson-move');

  on(/^(добавь|добавить|новый|создай|сделай|заведи)\s+кружок\s+(.+)/i, (t) => {
    const sp = splitCmd(t.replace(/^\S+\s+кружок\s+/i, ''));
    const name = sp.text.replace(/^[«"]|[»"]$/g, '');
    const miss = [!name && 'название', !sp.day && 'день', !sp.time && 'время'].filter(Boolean);
    if (miss.length) return R('Не хватает: ' + miss.join(', ') + '. Скажи так: «добавь кружок шахматы ср 15:00».');
    return undoReply(O.actions.addClub({ day: sp.day.idx, name: name[0].toUpperCase() + name.slice(1), start: sp.time, end: addMin(sp.time, 60), place: sp.room }), [btn('Расписание', 'tab:schedule')]);
  }, 'club-add');

  on(/^(удали|удалить|убери|сотри)\s+кружок\s+(.+)/i, (t) => {
    const q = t.replace(/^\S+\s+кружок\s+/i, '').replace(/\s*!confirm\s*$/, '').trim();
    const list = (S().clubs || []).filter(c => sameSubj(c.name, q));
    if (!list.length) return R(`Не нашёл кружок «${q}».`, { buttons: [btn('Расписание', 'tab:schedule')] });
    if (list.length > 1) return R('Какой именно?', { buttons: list.slice(0, 6).map(c => btn(`${c.name} ${DAYS_SHORT[c.day]} ${c.start}`, `cmd:удали кружок ${c.name}`)) });
    const c = list[0];
    return askOrDo(t, `Удалить кружок «${c.name}»?`, () => undoReply(O.actions.removeClub(c.id)));
  }, 'club-del');

  on(/^(добавь|добавить|новый|создай|сделай|заведи)\s+(автобус|маршрут|рейс)(?![\wа-яё])\s+(.+)$/i, (t) => {
    const rest = t.replace(/^\S+\s+\S+\s*/, '').trim();
    const times = (rest.match(/\d{1,2}[:.]\d{2}/g) || []).map(x => { const [h, m] = x.split(/[:.]/); return String(h).padStart(2, '0') + ':' + m; });
    let r2 = rest.replace(/\d{1,2}[:.]\d{2}/g, ' ');
    const grab = re => { const m = r2.match(re); if (m) r2 = r2.replace(m[0], ' '); return m ? +m[1] : null; };
    const walkMin = grab(/(?:идти|пешком|до остановки)\s*(\d{1,2})\s*мин[\wа-яё]*/i);
    const rideMin = grab(/(?:в пути|ехать|едет|еду|езды)\s*(\d{1,3})\s*мин[\wа-яё]*/i);
    let days = [];
    if (/по\s+будн|будни/i.test(r2)) { days = [0, 1, 2, 3, 4]; r2 = r2.replace(/по\s+будн[\wа-яё]*|будни/ig, ' '); }
    else if (/выходн/i.test(r2)) { days = [5, 6]; r2 = r2.replace(/по\s+выходн[\wа-яё]*|выходные/ig, ' '); }
    else {
      const dre = new RegExp('(?:^|\\s)(пн|вт|ср|чт|пт|сб|вс|понедельник' + CYR + '*|вторник' + CYR + '*|сред' + CYR + '*|четверг' + CYR + '*|пятниц' + CYR + '*|суббот' + CYR + '*|воскресень' + CYR + '*)(?=\\s|$|[.,;])', 'gi');
      (r2.match(dre) || []).forEach(w => { const d = O.actions.parseDay(w.trim(), new Date()); if (d && !days.includes(d.idx)) days.push(d.idx); });
      r2 = r2.replace(dre, ' ');
    }
    r2 = r2.replace(/каждый день/i, ' ');
    const dir = /школ|учёб|учеб|на урок/i.test(r2) ? 'school' : /дом/i.test(r2) ? 'home' : null;
    const nm = r2.match(/(?:^|[\s№])(\d{1,3}[а-яa-z]?)(?![\wа-яё])/i);
    const number = nm ? nm[1] : '';
    if (!number) return R('Какой номер у автобуса? Например: «добавь автобус 537 домой 12:52 13:40».');
    if (!times.length) return R(`Во сколько ходит №${number}? Например: «добавь автобус ${number} ${dir === 'school' ? 'в школу' : 'домой'} 12:52 13:40».`);
    const r = O.actions.addBus({ number, dir: dir || 'home', times, walkMin, rideMin, days: days.sort() });
    return undoReply(r, [btn('Автобусы', 'tab:buses'), btn('Когда автобус домой', 'cmd:когда автобус домой')]);
  }, 'bus-add');

  on(/^(удали|удалить|убери|сотри)\s+(автобус|маршрут)(?![\wа-яё])\s*(.*)$/i, (t) => {
    const q = t.replace(/^\S+\s+\S+\s*/, '').replace(/\s*!confirm\s*$/, '').trim();
    const buses = S().buses || [];
    if (!buses.length) return R('Автобусов нет.', { buttons: [btn('Автобусы', 'tab:buses')] });
    const lab = b => `№${b.number} ${E.busDir(b) === 'school' ? 'в школу' : 'домой'}`;
    const num = (q.match(/(\d{1,3}[а-яa-z]?)/i) || [])[1];
    let list = num ? buses.filter(b => String(b.number).toLowerCase() === num.toLowerCase()) : [];
    if (/школ/i.test(q)) list = list.filter(b => E.busDir(b) === 'school'); else if (/дом/i.test(q)) list = list.filter(b => E.busDir(b) === 'home');
    if (!list.length) return R(num ? `Автобус №${num} не нашёл.` : 'Какой автобус удалить?', { buttons: buses.slice(0, 6).map(b => btn(lab(b), 'cmd:удали автобус ' + lab(b).slice(1))) });
    if (list.length > 1) return R('Какой именно?', { buttons: list.slice(0, 6).map(b => btn(lab(b), 'cmd:удали автобус ' + lab(b).slice(1))) });
    const b = list[0];
    return askOrDo(t, `Удалить автобус №${b.number}?`, () => undoReply(O.actions.removeBus(b.id)));
  }, 'bus-del');

  on(/^(добавь|добавить|новый|создай|сделай|заведи)\s+(контакт|человека)(?![\wа-яё])\s+(.+)$/i, (t) => {
    let rest = t.replace(/^\S+\s+\S+\s*/, '').trim();
    const pm = rest.match(/\+?\d[\d\s()\-]{5,}\d/); let phone = '';
    if (pm) { phone = pm[0].trim(); rest = rest.replace(pm[0], ' '); }
    const name = rest.replace(/\s+/g, ' ').trim();
    if (!name) return R('Как зовут? Например: «добавь контакт Бабушка +7 999 123-45-67».', { buttons: [btn('Открыть форму', 'person:new')] });
    const REL_W = ['мама', 'папа', 'бабушка', 'дедушка', 'брат', 'сестра', 'тётя', 'дядя', 'тетя'];
    const relation = REL_W.includes(N(name)) ? name[0].toUpperCase() + name.slice(1).toLowerCase() : '';
    return undoReply(O.actions.addPerson({ name: name[0].toUpperCase() + name.slice(1), relation, phone }), [btn('Контакты', 'tab:contacts')]);
  }, 'person-add');

  on(/^(дневник|в дневник)\s+(.+)/i, (t, n, now, m) => {
    const text = (m && m[2]) || t.replace(/^(дневник|в дневник)\s+/i, '');
    const r = O.actions.addDiary(text.trim());
    if (r.ok && r.undo) { undoStack.push(r.undo); return R(r.msg, { buttons: [btn('Отменить', 'ag:undo'), btn('Дневник', 'tab:diary')] }); }
    return R(r.msg);
  }, 'diary');

  on(/тема\s*(светл[а-яёa-z0-9_]*|т[её]мн[а-яёa-z0-9_]*|dark|light)/i, (t, n) => {
    const light = /светл|light/.test(n);
    const r = O.actions.setTheme(light ? 'light' : 'dark');
    if (r.undo) undoStack.push(r.undo);
    return R(r.msg, { buttons: [btn('Отменить', 'ag:undo')] });
  }, 'theme');

  on(/^(отмена|отмени|undo)(\s+\d+)?$/i, () => {
    const r = O.actions.undoLast();
    if (!r.ok) {
      const u = undoStack.pop();
      if (u) { u(); C().save(); C().render(); return R('Отменено.', { buttons: sug() }); }
      return R(r.msg);
    }
    return R(r.msg, { buttons: sug() });
  }, 'undo');

  // синонимы глаголов: «создай/сделай/заведи автобус» = «добавь автобус», «убери/сотри» = «удали»
  function canon(t) {
    return t.replace(/^(?:хочу|надо|нужно|можешь|пожалуйста)?\s*(?:создай|создать|сделай|сделать|делай|заведи|завести|поставь|внеси|новый|новая|новое|\+)\s+(?=(?:автобус|урок|кружок|контакт|человека|дз|заметк|цель))/i, 'добавь ')
      .replace(/^(?:хочу|надо|нужно)?\s*добавить\s+(?=(?:автобус|урок|кружок|контакт))/i, 'добавь ')
      .replace(/^запиши\s+(?=(?:автобус|урок|кружок|контакт))/i, 'добавь ')
      .replace(/^(?:убери|сотри|вычеркни|удалить)\s+/i, 'удали ');
  }
  function understand(text) {
    sortInt();
    text = canon(text.trim());
    const t = text.trim(), n = N(t), now = new Date();
    for (const it of INT) { const m = n.match(it.re) || t.match(it.re); if (!m) continue; let r = null; try { r = it.fn(t, n, now, m); } catch (e) { console.error('agent', it.name, e); } if (r) { r.intent = it.name; return r; } }
    return null;
  }

  /* ───── карточки расписания / автобусов (из 3.23) ───── */
  function cardSchedule(items, header) {
    if (!items || !items.length) return '';
    const rows = items.map(it => `<div class="o-acard-row"><div class="o-acard-time">${esc(it.time || it.left || '')}</div><div class="o-acard-body"><div class="o-acard-title">${esc(it.title || it.name || '')}</div>${it.meta ? `<div class="o-acard-meta">${esc(it.meta)}</div>` : ''}</div></div>`).join('');
    return `<div class="o-acard" data-type="schedule">${header ? `<div class="o-acard-h">${esc(header)}</div>` : ''}${rows}</div>`;
  }
  function cardBuses(items, header) {
    if (!items || !items.length) return '';
    const rows = items.map(it => `<div class="o-acard-row"><div class="o-acard-time">${esc(it.time || it.left || '')}</div><div class="o-acard-body"><div class="o-acard-title">${esc(it.title || it.name || it.number || '')}</div>${it.meta ? `<div class="o-acard-meta">${esc(it.meta)}</div>` : ''}</div></div>`).join('');
    return `<div class="o-acard" data-type="buses">${header ? `<div class="o-acard-h">${esc(header)}</div>` : ''}${rows}</div>`;
  }

  /* ───── live-подсказки при наборе (из 3.23) ───── */
  let _liveTimer = null, _lastLive = '';
  function buildLiveSuggestions(raw) {
    const t = N(String(raw || ''));
    if (!t || t.length < 1 || legacy) return [];
    const out = [], seen = new Set();
    const push = (label, cmd, kind) => {
      const k = (cmd || '').toLowerCase();
      if (!k || seen.has(k) || out.length >= 8) return;
      seen.add(k); out.push({ label, cmd, kind: kind || 'catalog' });
    };
    // префиксы с 1–2 букв
    if (/^д/.test(t)) { push('Что задано', 'что задано', 'intent'); push('Добавить ДЗ', 'добавь дз', 'intent'); push('Дни рождения', 'дни рождения', 'intent'); }
    if (/^а|^ав/.test(t)) { push('Автобусы домой', 'автобусы домой', 'intent'); push('Автобусы сейчас', 'автобусы сейчас', 'intent'); }
    if (/^у|^ур/.test(t)) { push('Расписание сегодня', 'расписание на сегодня', 'intent'); push('Добавить урок', 'добавь урок', 'intent'); }
    if (/^п|^по/.test(t)) { push('Позвонить', 'позвони', 'intent'); push('Помощь', 'помощь', 'intent'); }
    if (/^я|^ос|^св/.test(t)) { push('Я освободился', 'я освободился', 'intent'); }
    if (/^ч|^чт/.test(t)) { push('Что дальше', 'что дальше', 'intent'); push('Что взять сегодня', 'что взять сегодня', 'intent'); push('Что задано', 'что задано', 'intent'); }
    if (/^н|^на/.test(t)) { push('Напомни', 'напомни через 30 минут', 'intent'); push('Настройки', 'открой настройки', 'intent'); }
    if (/^з|^за/.test(t)) { push('Заметка', 'заметка ', 'intent'); push('Что задано', 'что задано', 'intent'); }
    try {
      const subj = (C().resolveSubject && t.length >= 2) ? C().resolveSubject(t) : null;
      if (subj && C().SUBJECTS && C().SUBJECTS.includes(subj)) {
        push('+ ' + subj, 'добавь урок ' + subj, 'subject');
        push(subj + ' сегодня', 'расписание на сегодня', 'subject');
        push('Что взять', 'что взять сегодня', 'subject');
      }
    } catch (e) {}
    const day = dayIn(t, new Date());
    if (day) {
      push('Расписание на ' + day.label, 'расписание на ' + day.label, 'day');
      push('Автобусы ' + day.label, 'автобусы ' + day.label, 'day');
    }
    if (/^доб|^добав|\+/.test(t)) {
      push('Добавить урок', 'добавь урок', 'intent');
      push('Добавить ДЗ', 'добавь дз', 'intent');
      push('Добавить кружок', 'добавь кружок', 'intent');
    }
    if (/^удал|^очист|^убер/.test(t)) {
      push('Удалить день', 'удали день', 'intent');
      push('Очистить расписание', 'очисти расписание', 'intent');
    }
    if (/^авт|^рейс|^марш|^когда/.test(t)) {
      push('Автобусы сейчас', 'автобусы сейчас', 'intent');
      push('Автобусы домой', 'автобусы домой', 'intent');
      push('Автобусы в школу', 'автобусы в школу', 'intent');
      push('Когда выходить', 'когда выходить в школу', 'intent');
    }
    if (/^пров|^рюк|^что\s*вз/.test(t)) {
      push('Проверка дня', 'проверка дня', 'intent');
      push('Что взять сегодня', 'что взять сегодня', 'intent');
    }
    if (/^дз|^домаш|^задан/.test(t)) {
      push('Что задано', 'что задано', 'intent');
      push('Добавить ДЗ', 'добавь дз', 'intent');
    }
    if (/^позв|^звон|^смс|^напиш|^маме|^папе/.test(t)) {
      push('Позвонить', 'позвони', 'intent');
      push('SMS', 'напиши смс', 'intent');
    }
    if (/^помо|^help|^как|^что\s*уме/.test(t)) push('Помощь', 'помощь', 'info');
    if (/\d+\s*[+\-*/]\s*\d+/.test(t) || /посчит|вычисл/.test(t)) {
      push('Посчитать', (t.endsWith('=') ? t : t + '='), 'calc');
    }
    // каталог навыков + привычки
    try {
      if (O.actions && O.actions.suggestFromCatalog) {
        O.actions.suggestFromCatalog(t).forEach(s => push(s.label, s.cmd, 'skill'));
      }
    } catch (e) {}
    try {
      A.chips().forEach(c => {
        const lab = (c.label || '').toLowerCase();
        if (lab.includes(t.slice(0, 4)) || t.split(/\s+/).some(w => w.length > 2 && lab.includes(w)))
          push(c.label, (c.act || '').replace(/^cmd:/, ''), 'preset');
      });
    } catch (e) {}
    return out;
  }
  function renderLiveChips(chips) {
    const el = $('ag-live');
    if (!el) return;
    const j = JSON.stringify(chips || []);
    if (j === _lastLive) return;
    _lastLive = j;
    if (!chips || !chips.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = chips.map(c => `<button type="button" class="o-live-chip" data-kind="${esc(c.kind || '')}" data-ag="cmd:${esc(c.cmd)}">${esc(c.label)}</button>`).join('');
  }
  function onAgentInputLive(e) {
    clearTimeout(_liveTimer);
    const val = (e.target.value || '').trim();
    if (val.length < 1 || legacy) { renderLiveChips([]); return; }
    _liveTimer = setTimeout(() => renderLiveChips(buildLiveSuggestions(val)), 120);
  }

  /* ───── LLM API (OpenAI-совместимый, любая нейросеть) ───── */
  let llmDownUntil = 0;           // после сбоя нейросеть не дёргаем 5 минут
  A.llmLastError = '';
  async function callLlm(userText) {
    if (!O.llmReady || !O.llmReady()) return null;
    if (Date.now() < llmDownUntil) return null;
    let result;
    let hist = ''; try { hist = chatHistory(); } catch (e) {}
    try { result = await O.llmChat(userText, { history: hist }); } catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
    if (!result) return null;
    if (!result.ok) {
      // Нейросеть — запасной вариант: ошибку не показываем в чате, агент отвечает сам.
      A.llmLastError = result.error || 'ошибка';
      llmDownUntil = Date.now() + 5 * 60 * 1000;
      try { console.warn('[Орбита] нейросеть недоступна:', A.llmLastError); } catch (e) {}
      return null;
    }
    llmDownUntil = 0; A.llmLastError = '';
    let content = String(result.text || '').trim();
    let parsed = null;
    try {
      const j = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(j);
    } catch (e) {
      if (/^(добавь|удали|перенес|очист|позвони|напомни|дз |открой|тема )/i.test(content) && content.length < 160) {
        return R('[' + (result.provider || 'llm') + '] «' + content + '»', { buttons: [btn('Выполнить', 'cmd:' + content), btn('Отмена', 'ag:noop'), ...sug().slice(0, 2)] });
      }
      return R(content || 'Пустой ответ.', { buttons: sug() });
    }
    if (parsed && parsed.command && String(parsed.command).trim()) {
      const cmd = String(parsed.command).trim();
      return R((parsed.reply ? parsed.reply + '\n' : '') + 'Команда: «' + cmd + '»', {
        buttons: [btn('Выполнить', 'cmd:' + cmd), btn('Отмена', 'ag:noop'), ...sug().slice(0, 2)]
      });
    }
    if (parsed && parsed.reply) return R(String(parsed.reply), { buttons: sug() });
    return R('Нейросеть не предложила команду. Уточните.', { buttons: sug() });
  }

  A.process = function (text) {
    const c = C(), r = understand(text);
    if (r) { if (c.legacyPending) c.legacyCancel(); legacy = false; return [r]; }
    // старый агент — только для команд про уроки/кружки/заметки или когда он ждёт ответ
    const n = N(text), LEG = /(добав|удал|убер|перенес|перемест|замен|измен|поменя|сдвин|созда|запиш|переимен|урок|кружок|заметк|окно|нагрузк|сколько|каникул|свободн[а-яёa-z0-9_]* врем|отмена|отмени)/;
    const words = n.split(/\s+/).slice(0, 2), subjHit = words.some(w => w.length > 2 && C().SUBJECTS.includes(C().resolveSubject(w))) && (dayIn(n, new Date()) || timeIn(n));
    if (!(c.legacyPending || LEG.test(n) || subjHit)) {
      // mark for possible LLM in send()
      return [{ role: 'bot', text: '', _needLlm: true, _raw: text }];
    }
    const out = c.legacyAgent(text), res = [];
    legacy = c.legacyPending;
    out.forEach(m => {
      const extra = { legacySubjects: !!m.subjects, copyPrompt: m.copyPrompt };
      if (m.card) extra.cards = [m.card];
      res.push(R(m.text, extra));
    });
    if (!res.length) res.push({ role: 'bot', text: '', _needLlm: true, _raw: text });
    else if (/(не понял|не знаю|не распознал)/i.test(res[res.length - 1].text) && !legacy) {
      res[res.length - 1]._needLlm = true;
      res[res.length - 1]._raw = text;
    }
    return res;
  };
  function push(m) { m.at = m.at || Date.now(); A.msgs.push(m); A.prune(); mem.msgs = A.msgs.slice(-MEM_MAX).map(x => ({ role: x.role, text: x.text, at: x.at })); saveMem(); }
  A.send = async function (text) {
    text = String(text || '').trim(); if (!text || busy) return; busy = true;
    push({ role: 'user', text }); renderLiveChips([]); A.render(true);
    if (O.motion() !== 'off') await new Promise(r => setTimeout(r, 160));
    let replies;
    let procText = text;
    try { const fu = followUp(text); if (fu) procText = fu; } catch (e) {}
    if (procText === '\u0000next') { busy = false; agAct('ag:next'); return; }
    try { replies = A.process(procText); } catch (e) { console.error(e); replies = [R('Что-то пошло не так. Попробуйте ещё раз.')]; }
    try {
      const hit = replies[0] && replies[0].intent;
      if (hit && CTX_INTENTS.includes(hit)) { mem.ctx = { name: hit, text: procText, at: Date.now() }; saveMem(); }
    } catch (e) {}
    // LLM fallback for unknown
    if (replies.length === 1 && replies[0]._needLlm) {
      const s = S().settings || {};
      if (O.llmReady && O.llmReady()) {
        A.render(true); // show typing via busy
        const llmR = await callLlm(replies[0]._raw || text);
        replies = [llmR || R('Не совсем понял «' + text + '». Я умею автобусы, звонки, ДЗ, напоминания и уроки — выбери:', { buttons: sug() })];
      } else {
        const aiPrompt = 'Ты помогаешь школьному планеру «Орбита». Пользователь написал: «' + text + '».\nПерефразируй в одну чёткую команду на русском.\nОтветь ТОЛЬКО текстом команды.';
        const showPrompt = s.agentAiPrompt !== false;
        replies = [R('Не понял «' + text + '». Я умею автобусы, звонки, ДЗ, напоминания и уроки.' + (showPrompt ? '\n\nМожно включить нейросеть в Настройках → Агент (любой OpenAI-совместимый API) или скопировать промпт:' : ''), {
          buttons: sug(),
          copyPrompt: showPrompt ? aiPrompt : undefined
        })];
      }
    }
    if (replies[0] && ['free', 'bus', 'now', 'day', 'call', 'sms', 'hw-list', 'pack'].includes(replies[0].intent)) O.habits.rec('cmd:' + text.toLowerCase().slice(0, 60), text.slice(0, 40));
    replies.forEach(m => { if (m && m.text !== undefined) push(m); });
    busy = false; A.render(true);
  };
  A.ask = text => { C().switchTab('agent'); setTimeout(() => A.send(text), 60); };

  /* кнопки внутри чата */
  function agAct(act) {
    const parts = String(act || '').split(':');
    const a = parts[1], x = parts[2], y = parts.slice(3).join(':');
    if (a === 'undo') { const u = undoStack.pop(); if (u) { u(); C().save(); C().render(); push(R('Отменено.')); } else push(R('Нечего отменять.')); }
    else if (a === 'yes') { const p = pending[x]; if (p) { p.doFn(); C().save(); C().render(); undoStack.push(p.undoFn); delete pending[x]; push(R('Готово.', { buttons: [btn('Отменить', 'ag:undo')] })); } }
    else if (a === 'noop') { /* ignore */ }
    else if (a === 'panel') { A.panel = x || 'chat'; A.render(false); return; }
    else if (a === 'pack') {
      const day = +x, item = y;
      if (O.actions && O.actions.togglePack) {
        const r = O.actions.togglePack(day, decodeURIComponent(item || ''));
        if (r.undo) undoStack.push(r.undo);
        push(R(r.msg || 'Готово.', { buttons: [btn('Рюкзак ещё', 'cmd:что взять сегодня'), btn('Отменить', 'ag:undo')] }));
      }
    }
    else if (a === 'no') { delete pending[x]; push(R('Хорошо, не делаю.')); }
    else if (a === 'next') { const lp = O.lastPlan; if (lp && lp.options.length > 1) { lp.options.shift(); const b = lp.options[0]; push(R(`Следующий: №${b.number} в ${b.time}. Выйти в ${E.fmt(b.leaveBy)}, запас ${left(Math.max(0, b.slack))}.`, { cards: lp.options.slice(0, 3).map((o, i) => busCard(o, i, lp.kind)), buttons: lp.options.length > 1 ? [btn('Ещё следующий', 'ag:next')] : [] })); } else push(R('Больше подходящих рейсов нет.', { buttons: [btn('Все рейсы', 'tab:buses')] })); }
    else if (a === 'pick') { const p = S().people.find(v => v.id === x); if (p) { if (pending.pickKey) { mem.aliases[pending.pickKey] = p.id; saveMem(); } push(R(y === 'sms' ? `Сообщение для ${p.name}.` : `Нажмите, чтобы позвонить: ${p.name}.`, { cards: [personCard(p, '')] })); } }
    else if (a === 'done') { const h = S().homework.find(v => v.id === x); if (h) { h.done = true; C().save(); C().render(); undoStack.push(() => { h.done = false; }); push(R(`Отметил: ${h.title}.`, { buttons: [btn('Отменить', 'ag:undo')] })); } }
    else if (a === 'forget') { mem = { aliases: {}, notes: [], msgs: [] }; A.msgs = []; O.habits.clear(); C().clearAgentMemory && C().clearAgentMemory(); saveMem(); push(R('Память очищена.')); }
    A.render(true);
  }

  /* ───── интерфейс ───── */
  A.chips = function () {
    const now = new Date(), nm = E.nowMin(now), ev = E.eventsOn(S(), now).list, out = [], seen = new Set();
    const add = (l, c) => { const k = l.toLowerCase(); if (!seen.has(k) && out.length < 6) { seen.add(k); out.push(btn(l, 'cmd:' + c)); } };
    if (S().settings.agentSuggest !== false) O.habits.top(now, { prefix: 'cmd:', limit: 3 }).forEach(m => add(m.label, m.label));
    if (ev.length && nm < ev[0].s) add('Когда выходить в школу', 'когда выходить в школу');
    else if (ev.length && nm >= Math.max(...ev.map(e => e.e)) - 40) { add('Я освободился', 'я освободился'); add('Когда автобус домой', 'когда автобус домой'); }
    else add('Что дальше', 'что дальше');
    if (nm >= 17 * 60) add('Что взять завтра', 'что взять завтра');
    if (S().people.some(p => p.phone)) add('Позвонить маме', 'позвони маме');
    add('Домашка', 'что задано'); add('Помощь', 'помощь');
    try {
      if (O.actions && O.actions.SKILLS) {
        O.actions.SKILLS.slice(0, 8).forEach(sk => {
          const ex = (sk.examples && sk.examples[0]) || sk.label;
          add(sk.label, ex);
        });
      }
    } catch (e) {}
    return out;
  };

  function renderAgentPanel() {
    const body = $('ag-body'); if (!body) return;
    const b = O.brand();
    if (A.panel === 'quick') {
      const tiles = [
        ['cmd:что дальше', 'sparkle', 'Что дальше'],
        ['cmd:я освободился', 'bus', 'Я освободился'],
        ['cmd:что задано', 'check', 'Домашка'],
        ['cmd:что взять сегодня', 'bag', 'Рюкзак'],
        ['cmd:дни рождения', 'users', 'Дни рождения'],
        ['cmd:добавь урок', 'plus', 'Урок'],
        ['cmd:перенеси ', 'calendar', 'Перенести'],
        ['cmd:добавь дз', 'plus', 'ДЗ'],
        ['cmd:добавь кружок', 'plus', 'Кружок'],
        ['cmd:добавь автобус', 'bus', 'Автобус'],
        ['cmd:напомни', 'clock', 'Напомнить'],
        ['cmd:заметка', 'file', 'Заметка'],
        ['cmd:дневник ', 'note', 'Дневник'],
        ['cmd:позвони', 'phone', 'Позвонить'],
        ['tab:schedule', 'calendar', 'Уроки'],
        ['tab:contacts', 'users', 'Контакты'],
        ['tab:tasks', 'check', 'Задачи'],
        ['tab:settings', 'sliders', 'Настройки'],
        ['sos', 'phone', 'SOS']
      ];
      body.innerHTML = `<div class="o-agent-quick">${tiles.map(([act, icon, lab]) => `<button type="button" class="o-aq" data-ag="${esc(act)}">${ic(icon, 22)}<span>${esc(lab)}</span></button>`).join('')}</div>`;
      return;
    }
    if (A.panel === 'day') {
      const now = new Date(), nm = E.nowMin(now);
      const ev = E.eventsOn(S(), now).list;
      const cur = ev.find(x => x.s <= nm && x.e > nm);
      const next = ev.find(x => x.s > nm);
      const act = O.actions || {};
      const hw = act.listHw ? act.listHw() : { msg: '—' };
      const pack = act.packFor ? act.packFor(E.dayIdx(now)) : { msg: '—' };
      const bday = act.upcomingBirthdays ? act.upcomingBirthdays(14) : { list: [] };
      body.innerHTML = `<div class="o-agent-day">
        <div class="o-ad-card"><h4>Сейчас</h4><p>${cur ? esc(cur.title) + ' до ' + esc(cur.end) : 'Окна / нет урока'}</p>
          <p class="muted">${next ? 'Дальше: ' + esc(next.title) + ' в ' + esc(next.start) : 'На сегодня больше нет'}</p>
          <div class="o-m-b"><button class="o-chip" data-ag="cmd:что дальше">Обновить</button><button class="o-chip" data-ag="cmd:я освободился">Автобус домой</button></div></div>
        <div class="o-ad-card"><h4>Домашка</h4><p>${esc(hw.msg)}</p>
          <div class="o-m-b"><button class="o-chip" data-ag="cmd:что задано">Список</button><button class="o-chip" data-ag="cmd:добавь дз">+ ДЗ</button></div></div>
        <div class="o-ad-card"><h4>Рюкзак</h4><p>${esc(pack.msg)}</p>
          <div class="o-m-b"><button class="o-chip" data-ag="tab:pack">Открыть</button></div></div>
        <div class="o-ad-card"><h4>Дни рождения (14 дн.)</h4><p>${bday.list.length ? bday.list.slice(0,4).map(u => esc(u.name) + ' · ' + (u.delta===0?'сегодня':u.delta===1?'завтра':'+'+u.delta+'д')).join('<br>') : 'Нет'}</p>
          <div class="o-m-b"><button class="o-chip" data-ag="cmd:дни рождения">Все</button></div></div>
      </div>`;
      return;
    }
    if (A.panel === 'edits') {
      const hist = (O.actions && O.actions.recent) ? O.actions.recent(15) : [];
      const fmt = ts => { try { const d = new Date(ts); return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
      body.innerHTML = `<div class="o-agent-edits">
        <div class="o-ad-card"><h4>Последние изменения</h4>
          ${hist.length ? hist.map(h => `<div class="o-edit-row"><div><b>${esc(h.label)}</b><small>${fmt(h.at)}</small></div></div>`).join('') : '<p class="muted">Пока нет изменений через агента. Добавьте урок, ДЗ или контакт.</p>'}
          <div class="o-m-b" style="margin-top:10px"><button class="o-chip" data-ag="cmd:отмена">Отменить последнее</button><button class="o-chip" data-ag="cmd:помощь">Что умею</button></div>
        </div>
        <div class="o-ad-card"><h4>Быстро изменить</h4>
          <div class="o-agent-quick" style="padding:8px 0;grid-template-columns:repeat(2,1fr)">
            <button type="button" class="o-aq" data-ag="cmd:добавь урок">${ic('plus',20)}<span>Урок</span></button>
            <button type="button" class="o-aq" data-ag="cmd:добавь дз">${ic('plus',20)}<span>ДЗ</span></button>
            <button type="button" class="o-aq" data-ag="cmd:добавь кружок">${ic('plus',20)}<span>Кружок</span></button>
            <button type="button" class="o-aq" data-ag="cmd:добавь автобус">${ic('bus',20)}<span>Автобус</span></button>
            <button type="button" class="o-aq" data-ag="tab:contacts">${ic('users',20)}<span>Контакты</span></button>
            <button type="button" class="o-aq" data-ag="tab:schedule">${ic('calendar',20)}<span>Расписание</span></button>
          </div>
        </div>
      </div>`;
      return;
    }
    if (A.panel === 'scripts') { if (O.scripts) O.scripts.panel(body); else body.innerHTML = '<p style="padding:16px">Модуль сценариев не загружен.</p>'; return; }
    if (A.panel === 'skills') {
      const cats = { day: 'День', tasks: 'Задачи', schedule: 'Расписание', people: 'Люди', nav: 'Навигация', sos: 'SOS' };
      const skills = (O.actions && O.actions.SKILLS) || [];
      body.innerHTML = `<div class="o-agent-skills">${Object.entries(cats).map(([cid, title]) => {
        const items = skills.filter(s => s.cat === cid);
        if (!items.length) return '';
        return `<div class="o-ad-card"><h4>${esc(title)}</h4>${items.map(s => `<button type="button" class="o-skill" data-ag="cmd:${esc(s.examples[0] || s.label)}"><b>${esc(s.label)}</b><small>${esc((s.examples || []).slice(0,2).join(' · '))}</small></button>`).join('')}</div>`;
      }).join('')}</div>`;
      return;
    }
    // chat (default)
    body.innerHTML = `<div class="o-chat"><div class="o-chat-h"><span class="o-chat-av" data-brand-logo="30"></span><div><b data-agent-name>${esc(b.agent)}</b><small id="ag-status">Офлайн · помнит привычки</small></div><button class="o-ib" id="ag-mem" aria-label="Память">${ic('sparkle', 18)}</button></div><div class="o-msgs" id="ag-msgs" aria-live="polite"></div><div class="o-chips-row" id="ag-chips"></div><div id="ag-live" class="o-live-chips hidden" aria-live="polite"></div><form class="o-composer" id="ag-form"><input class="input" id="ag-in" placeholder="Начни писать — подскажу…" autocomplete="off" enterkeyhint="send"><button type="button" class="o-ib" id="ag-mic" aria-label="Голос" hidden>${ic('mic', 20)}</button><button class="o-send" aria-label="Отправить">${ic('send', 20)}</button></form></div>`;
    const form = $('ag-form'), inp = $('ag-in'), memBtn = $('ag-mem');
    if (form) form.onsubmit = e => { e.preventDefault(); const i = $('ag-in'); if (!i) return; const v = i.value; i.value = ''; try { renderLiveChips([]); } catch (err) {} A.send(v); };
    if (inp) {
      inp.oninput = onAgentInputLive; // одно свойство — не копятся слушатели
      inp.setAttribute('autocomplete', 'off');
    }
    if (memBtn) memBtn.onclick = () => A.send('что ты помнишь');
    // клики по data-ag обрабатывает root (A.render)
    try { voice(); } catch (err) {}
    try { O.look && O.look(S().settings); } catch (err) {}
    try { const st = $('ag-status'); if (st) { const s = S().settings || {}; st.textContent = 'Помощник · память: ' + A.memLabel() + ((O.llmReady && O.llmReady()) ? ' · ИИ в запасе' : ''); } } catch (e) {}
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden && A.prune()) { try { A.render(true); } catch (e) {} } });
  A.render = function (scroll) {
    const root = $('agent-root'); if (!root) return;
    const b = O.brand();
    if (!A.msgs.length) A.msgs.push(R(`${b.hello || 'Привет'}! Я ${b.agent}. Скажи «я освободился» — подберу автобус, «позвони маме» — звонок. Вкладки сверху: быстрые действия, день, навыки.`, { buttons: sug() }));
    if (!root.querySelector('.o-agent')) {
      root.innerHTML = `<div class="o-agent">
      <div class="o-agent-tabs" id="ag-tabs" role="tablist">
        <button type="button" class="o-agent-tab" data-apanel="chat" role="tab">${ic('sparkle',18)}<span>Чат</span></button>
        <button type="button" class="o-agent-tab" data-apanel="quick" role="tab">${ic('plus',18)}<span>Быстрые</span></button>
        <button type="button" class="o-agent-tab" data-apanel="day" role="tab">${ic('calendar',18)}<span>День</span></button>
        <button type="button" class="o-agent-tab" data-apanel="edits" role="tab">${ic('file',18)}<span>Правки</span></button>
        <button type="button" class="o-agent-tab" data-apanel="skills" role="tab">${ic('check',18)}<span>Навыки</span></button>
        <button type="button" class="o-agent-tab" data-apanel="scripts" role="tab">${ic('sparkle',18)}<span>Сценарии</span></button>
      </div>
      <div class="o-agent-body" id="ag-body"></div>
    </div>`;
      root.addEventListener('click', e => {
        const tab = e.target.closest('[data-apanel]');
        if (tab && root.contains(tab)) {
          e.preventDefault(); e.stopPropagation();
          A.panel = tab.dataset.apanel || 'chat';
          A.render(false);
          return;
        }
        const a = e.target.closest('[data-ag]');
        if (!a || !root.contains(a)) return;
        e.preventDefault(); e.stopPropagation();
        const act = a.dataset.ag;
        if (act.startsWith('ag:')) agAct(act);
        else if (act.startsWith('cmd:')) { A.panel = 'chat'; try { renderLiveChips([]); } catch (err) {} A.send(act.slice(4)); }
        else if (O.dispatch) O.dispatch(act);
      });
    }
    root.querySelectorAll('[data-apanel]').forEach(btn => btn.classList.toggle('on', btn.dataset.apanel === (A.panel || 'chat')));
    try { renderAgentPanel(); } catch (err) {
      console.error('agent panel', err);
      const body = $('ag-body');
      if (body) body.innerHTML = '<p style="padding:16px;color:var(--text-muted)">Ошибка панели. Обновите страницу.</p>';
    }
    if ((A.panel || 'chat') !== 'chat') return;
    const last = A.msgs.length - 1, ms = $('ag-msgs');
    if (!ms) return;
    let _pk = null;
    const daySep = (m, i) => { if (!m.at) return ''; const d = new Date(m.at), k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(), same = k === _pk, firstToday = _pk === null && dayTitle(m.at) === 'Сегодня'; _pk = k; return (same || firstToday) ? '' : `<div class="o-day-sep"><span>${esc(dayTitle(m.at))}</span></div>`; };
    ms.innerHTML = A.msgs.map((m, i) => daySep(m, i) + (() => {
      if (m.role === 'user') return `<div class="o-m me">${esc(m.text)}</div>`;
      const isLast = i === last, btns = (isLast ? (m.buttons || []) : []).map(x => `<button class="o-chip" data-ag="${esc(x.act)}">${esc(x.label)}</button>`).join('');
      const subj = m.legacySubjects && isLast ? `<div class="o-subj">${(C().SUBJECTS || []).map(x => `<button class="o-chip" data-ag="cmd:${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
      return `<div class="o-m bot"><div class="o-m-t">${esc(m.text).replace(/\n/g, '<br>')}</div>${(m.cards || []).join('')}${subj}${btns ? `<div class="o-m-b">${btns}</div>` : ''}${m.copyPrompt && isLast ? `<div class="o-m-b"><button class="o-chip" data-ag="ag:copy">Копировать промпт для нейросети</button></div>` : ''}</div>`;
    })()).join('') + (busy ? '<div class="o-m bot typing"><i></i><i></i><i></i></div>' : '');
    const chips = $('ag-chips');
    if (chips) {
      try { chips.innerHTML = A.chips().map(x => `<button class="o-chip" data-ag="${esc(x.act)}">${esc(x.label)}</button>`).join(''); }
      catch (err) { chips.innerHTML = ''; }
    }
    if (scroll !== false) ms.scrollTop = ms.scrollHeight;
  };
  document.addEventListener('click', e => { const a = e.target.closest('[data-ag="ag:copy"]'); if (a) { const m = [...A.msgs].reverse().find(x => x.copyPrompt); if (m) navigator.clipboard.writeText(m.copyPrompt).then(() => C().toast('Промпт скопирован')); } });
  function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $('ag-mic'); if (!SR || S().settings.voice === false || !mic) return;
    mic.hidden = false; let rec = null;
    mic.onclick = () => { if (rec) { rec.stop(); return; } rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = false; mic.classList.add('on'); rec.onresult = e => { const v = e.results[0][0].transcript; $('ag-in').value = ''; A.send(v); }; rec.onend = rec.onerror = () => { mic.classList.remove('on'); rec = null; }; try { rec.start(); } catch (e) { mic.classList.remove('on'); rec = null; } };
  }
  O.motion = () => document.documentElement.getAttribute('data-motion') || 'full';
})();
