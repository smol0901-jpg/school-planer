/* Орбита 4 · АВТОБУСЫ, КОНТАКТЫ, SOS, «ЕЩЁ» */
(function () {
  const O = window.Orbit = window.Orbit || {}, E = O.engine, ic = O.ic, esc = O.esc;
  const C = () => O.core(), S = () => C().state, $ = id => document.getElementById(id);
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], DAYF = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
  const pad = n => String(n).padStart(2, '0');
  const left = m => m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60 ? (m % 60) + ' мин' : ''}`.trim();

  /* ═════════ АВТОБУСЫ ═════════ */
  O.ui.bp = O.ui.bp || { mode: 'home', off: 0, at: '', day: 0, filter: 'all' };
  const DIRS = { school: 'В школу', home: 'Домой', other: 'Другое' };

  function optCard(o, i, mode) {
    return `<div class="o-bopt${i === 0 ? ' best' : ''}"><div class="o-bus-no">№${esc(o.number || '—')}</div><div class="o-bopt-b"><div class="o-bopt-t">${esc(o.time)}${i === 0 ? '<em>лучший</em>' : ''}</div><div class="o-bopt-m">Выйти в <b>${E.fmt(o.leaveBy)}</b> · идти ${o.walk} мин · запас ${left(Math.max(0, o.slack))} · ${mode === 'school' ? 'в школе' : 'дома'} ≈ ${E.fmt(o.arrive)}</div>${o.stop ? `<div class="o-bopt-m">${ic('pin', 12)} ${esc(o.stop)}</div>` : ''}</div></div>`;
  }

  O.renderBuses = function () {
    const root = $('buses-root'); if (!root) return; const s = S(), b = O.ui.bp, now = new Date(), nm = E.nowMin(now);
    let plan = '';
    if (b.mode === 'home') {
      const freeAt = b.at ? E.toMin(b.at) : nm + b.off, p = E.planHome(s, now, { freeAt });
      plan = `<div class="o-seg-row"><span class="o-lbl">Освобожусь</span>${[['0', 'Сейчас'], ['10', '+10'], ['20', '+20'], ['30', '+30']].map(([v, l]) => `<button class="o-chip${!b.at && b.off === +v ? ' on' : ''}" data-bp="off:${v}">${l}</button>`).join('')}<input class="o-time" type="time" id="bp-at" value="${esc(b.at)}" aria-label="Время"></div>
      <div class="o-plan-h">Освобожусь в <b>${E.fmt(freeAt)}</b> · на выход ${p.exit} мин</div>
      ${p.options.length ? p.options.map((o, i) => optCard(o, i, 'home')).join('') : p.nextDay ? `<div class="o-note">Сегодня рейсов домой больше нет. Ближайший — ${DAYF[p.nextDay.dayIdx]} в ${p.nextDay.option.time}.</div>` : `<div class="o-note">Нет рейсов домой. Добавьте их кнопкой «+».</div>`}${p.missed ? `<div class="o-note">Рейс ${p.missed.time} не успеть — не хватает ${p.missed.short} мин.</div>` : ''}`;
    } else {
      const date = E.addDays(now, b.day), p = E.planSchool(s, date);
      plan = `<div class="o-seg-row"><span class="o-lbl">День</span><button class="o-chip${b.day === 0 ? ' on' : ''}" data-bp="day:0">Сегодня</button><button class="o-chip${b.day === 1 ? ' on' : ''}" data-bp="day:1">Завтра</button></div>
      ${!p.first ? `<div class="o-note">${p.holiday ? 'Каникулы — в школу не нужно.' : 'На этот день нет занятий.'}</div>` : `<div class="o-plan-h">Первое занятие в <b>${p.first.start}</b> (${esc(p.first.title)}) · быть на месте за ${E.cfg(s).arriveBefore} мин</div>${p.options.length ? p.options.map((o, i) => optCard(o, i, 'school')).join('') : `<div class="o-note">${p.noBuses ? 'Нет рейсов в школу.' : 'К этому времени ни один рейс не успевает.'}</div>`}`}`;
    }
    const fl = b.filter, routes = s.buses.filter(x => fl === 'all' || E.busDir(x) === fl).sort((a, c) => (E.busTimes(a)[0] || '').localeCompare(E.busTimes(c)[0] || ''));
    const list = routes.map(x => {
      const times = E.busTimes(x), today = E.dayIdx(now), days = Array.isArray(x.days) && x.days.length ? x.days : [0, 1, 2, 3, 4, 5, 6], nextI = days.includes(today) ? times.findIndex(t => E.toMin(t) >= nm) : -1;
      const nxt = nextI >= 0 ? E.toMin(times[nextI]) - nm : null;
      return `<div class="o-route" data-bus="${x.id}"><div class="o-route-h"><div class="o-bus-no">№${esc(x.number || '—')}</div><div class="o-route-t"><b>${esc(x.from || x.fromStop || '—')} → ${esc(x.to || x.destination || '—')}</b><span>${DIRS[E.busDir(x)]}${x.walkMin ? ' · идти ' + x.walkMin + ' мин' : ''}${x.rideMin ? ' · в пути ' + x.rideMin + ' мин' : ''}</span></div>${nxt != null ? `<div class="o-route-n"><b>${left(nxt)}</b><small>до ${times[nextI]}</small></div>` : ''}</div>
      <div class="o-times">${times.map((t, i) => `<span class="${days.includes(today) && E.toMin(t) < nm ? 'past' : i === nextI ? 'next' : ''}">${t}</span>`).join('') || '<em>нет рейсов</em>'}</div>
      <div class="o-days">${DAYS.map((d, i) => `<span class="${days.includes(i) ? 'on' : ''}">${d}</span>`).join('')}</div>${x.transferNumber ? `<div class="o-note">${ic('arrow', 12)} Пересадка: №${esc(x.transferNumber)} в ${esc(x.transferTime || '?')}</div>` : ''}${x.notes ? `<div class="o-muted">${esc(x.notes)}</div>` : ''}</div>`;
    }).join('');
    root.innerHTML = `<div class="o-card o-planner"><div class="o-card-h">${ic('sparkle', 18)}<h3>Когда выходить</h3></div><div class="o-seg-row big"><button class="o-chip${b.mode === 'home' ? ' on' : ''}" data-bp="mode:home">${ic('home2', 15)} Домой</button><button class="o-chip${b.mode === 'school' ? ' on' : ''}" data-bp="mode:school">${ic('school', 15)} В школу</button></div>${plan}</div>
    <div class="o-seg-row f"><span class="o-lbl">Рейсы</span>${[['all', 'Все'], ['school', 'В школу'], ['home', 'Домой'], ['other', 'Другое']].map(([v, l]) => `<button class="o-chip${fl === v ? ' on' : ''}" data-bp="filter:${v}">${l}</button>`).join('')}</div>
    ${list || `<div class="o-empty">${ic('bus', 34, 1.4)}<p>Рейсов пока нет</p><button class="o-btn" data-bp="new">${ic('plus', 16)} Добавить маршрут</button></div>`}`;
    const at = $('bp-at'); if (at) at.onchange = () => { O.ui.bp.at = at.value; O.renderBuses(); };
  };
  document.addEventListener('click', e => {
    const bp = e.target.closest('[data-bp]'); if (bp) { const [k, v] = bp.dataset.bp.split(':'); if (k === 'new') return O.openBus(null); const b = O.ui.bp; if (k === 'off') { b.off = +v; b.at = ''; } else if (k === 'day') b.day = +v; else b[k] = v; O.vibrate(6); O.renderBuses(); return; }
    const rt = e.target.closest('[data-bus]'); if (rt && rt.closest('#buses-root')) O.openBus(rt.dataset.bus);
  });

  const parseTimes = txt => [...new Set((String(txt || '').match(/\d{1,2}[:.]\d{2}/g) || []).map(t => { const [h, m] = t.replace('.', ':').split(':'); return pad(+h) + ':' + m; }).filter(t => { const x = E.toMin(t); return x != null && x < 1440 && +t.slice(3) < 60; }))].sort();

  O.openBus = function (id) {
    const core = C(), s = S(), bus = id ? s.buses.find(b => b.id === id) : null, isNew = !bus, dir = bus ? E.busDir(bus) : (O.ui.bp.mode === 'school' ? 'school' : 'home'), days = bus && Array.isArray(bus.days) && bus.days.length ? bus.days : [0, 1, 2, 3, 4];
    core.openModal(isNew ? 'Новый маршрут' : 'Маршрут №' + (bus.number || ''), `
      <div class="o-form">
      <div class="form-row"><div class="form-group"><label>№ маршрута</label><input class="input" id="bm-number" value="${esc(bus?.number || '')}" placeholder="42"></div>
      <div class="form-group"><label>Направление</label><select class="input" id="bm-dir">${Object.entries(DIRS).map(([k, v]) => `<option value="${k}"${k === dir ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="form-row"><div class="form-group"><label>Откуда</label><input class="input" id="bm-from" value="${esc(bus?.from || bus?.fromStop || '')}" placeholder="Остановка «Парк»"></div>
      <div class="form-group"><label>Куда</label><input class="input" id="bm-to" value="${esc(bus?.to || bus?.destination || '')}" placeholder="Школа"></div></div>
      <div class="form-row"><div class="form-group"><label>Идти до остановки, мин</label><input class="input" id="bm-walk" type="number" min="0" max="90" value="${bus?.walkMin ?? 5}"></div>
      <div class="form-group"><label>В пути, мин</label><input class="input" id="bm-ride" type="number" min="0" max="180" value="${bus?.rideMin ?? ''}" placeholder="${E.cfg(s).rideDefault}"></div></div>
      <div class="form-group"><label>Дни недели</label><div class="o-days edit" id="bm-days">${DAYS.map((d, i) => `<button type="button" class="${days.includes(i) ? 'on' : ''}" data-d="${i}">${d}</button>`).join('')}</div></div>
      <div class="form-group"><label>Время отправления (через пробел или запятую)</label><textarea class="textarea" id="bm-times" rows="3" placeholder="07:10 07:40 08:05">${esc(E.busTimes(bus || {}).join(' '))}</textarea>
      <div class="o-gen"><span>Каждые</span><input class="input" id="bm-every" type="number" min="2" max="120" value="20"><span>мин с</span><input class="input" id="bm-gf" type="time" value="06:00"><span>до</span><input class="input" id="bm-gt" type="time" value="22:00"><button type="button" class="o-btn ghost sm" id="bm-gen">Заполнить</button></div></div>
      <div class="form-group"><label>Заметки</label><input class="input" id="bm-notes" value="${esc(bus?.notes || '')}" placeholder="Остановка у парка, ходит по будням…"></div>
      <details class="o-det"><summary>Пересадка (необязательно)</summary>
      <div class="form-row"><div class="form-group"><label>№ 2-го автобуса</label><input class="input" id="bm-tn" value="${esc(bus?.transferNumber || '')}"></div><div class="form-group"><label>Время</label><input class="input" id="bm-tt" type="time" value="${esc(bus?.transferTime || '')}"></div></div></details></div>`,
      `${!isNew ? `<button class="btn btn-danger" id="bm-del">Удалить</button>` : ''}<button class="btn btn-primary" id="bm-save">Сохранить</button>`);
    let dirTouched = !isNew; $('bm-dir').onchange = () => { dirTouched = true; };
    $('bm-to').oninput = () => { if (!dirTouched) { const d = E.busDir({ to: $('bm-to').value }); if (d === 'school' || d === 'home') $('bm-dir').value = d; } };
    $('bm-days').onclick = e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); };
    $('bm-gen').onclick = () => { const ev = +$('bm-every').value, a = E.toMin($('bm-gf').value), z = E.toMin($('bm-gt').value); if (!ev || a == null || z == null || z < a) return core.toast('Проверьте интервал'); const out = []; for (let m = a; m <= z; m += ev) out.push(E.fmt(m)); $('bm-times').value = parseTimes($('bm-times').value + ' ' + out.join(' ')).join(' '); };
    $('bm-save').onclick = () => {
      const times = parseTimes($('bm-times').value); if (!times.length) return core.toast('Добавьте хотя бы один рейс (например 07:40)');
      const d = [...document.querySelectorAll('#bm-days button.on')].map(b => +b.dataset.d), to = $('bm-to').value.trim(), from = $('bm-from').value.trim();
      const data = { ...(bus || {}), id: bus?.id || core.uid(), number: $('bm-number').value.trim(), dir: $('bm-dir').value, from, to, destination: to, walkMin: +$('bm-walk').value || 0, rideMin: +$('bm-ride').value || 0, days: d.length === 7 ? [] : d, times, time: times[0], notes: $('bm-notes').value.trim(), transferNumber: $('bm-tn').value.trim(), transferTime: $('bm-tt').value };
      if (isNew) s.buses.push(data); else { const i = s.buses.findIndex(b => b.id === id); if (i >= 0) s.buses[i] = data; }
      core.save(); core.closeModal(); core.render(); core.toast('Маршрут сохранён');
    };
    if (!isNew) $('bm-del').onclick = () => { s.buses = s.buses.filter(b => b.id !== id); core.save(); core.closeModal(); core.render(); core.toast('Удалено'); };
  };

  /* ═════════ КОНТАКТЫ ═════════ */
  O.ui.cf = O.ui.cf || { q: '', g: 'all' };
  const GROUPS = { family: /мам|пап|бабуш|дед|брат|сестр|тет|дяд|родн|семь|отец|мать|сын|дочь/i, school: /учител|классн|тренер|школ|куратор|директор|завуч/i, friends: /друг|подруг|одноклас|товарищ/i };
  const groupOf = p => { const r = (p.relation || '') + ' ' + (p.group || ''); return GROUPS.family.test(r) ? 'family' : GROUPS.school.test(r) ? 'school' : GROUPS.friends.test(r) ? 'friends' : 'other'; };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  O.renderContacts = function () {
    const root = $('contacts-root'); if (!root) return; const s = S(), f = O.ui.cf, q = f.q.toLowerCase().trim();
    let list = s.people.filter(p => !q || (p.name + ' ' + (p.relation || '') + ' ' + (p.phone || '')).toLowerCase().includes(q));
    if (f.g === 'sos') list = list.filter(p => p.emergency); else if (f.g !== 'all') list = list.filter(p => groupOf(p) === f.g);
    list.sort((a, b) => (b.emergency ? 2 : 0) + (b.fav ? 1 : 0) - ((a.emergency ? 2 : 0) + (a.fav ? 1 : 0)) || a.name.localeCompare(b.name, 'ru'));
    const card = p => {
      const ph = O.digits(p.phone), ph2 = O.digits(p.phone2), wa = ph.replace('+', '');
      return `<div class="o-person" data-pid="${p.id}"><div class="o-person-h">${O.avatar(p, 52)}<div class="o-person-t"><b>${esc(p.name)}${p.fav ? `<span class="o-star">${ic('star', 13)}</span>` : ''}${p.emergency ? `<span class="o-tag bad">SOS</span>` : ''}</b><span>${esc(p.relation || 'Контакт')}${p.phone ? ' · ' + esc(p.phone) : ''}</span></div><button class="o-ib" data-edit="${p.id}" aria-label="Изменить">${ic('edit', 18)}</button></div>
      <div class="o-person-a">${ph ? `<a class="o-act call" href="tel:${esc(ph)}" data-call="${p.id}">${ic('phone', 18)}<span>Позвонить</span></a>` : ''}${ph ? `<a class="o-act" href="sms:${esc(ph)}" data-call="${p.id}">${ic('message', 18)}<span>SMS</span></a>` : ''}${p.tg ? `<a class="o-act" target="_blank" rel="noopener" href="https://t.me/${esc(String(p.tg).replace(/^@/, ''))}">${ic('send', 18)}<span>Telegram</span></a>` : ''}${wa ? `<a class="o-act" target="_blank" rel="noopener" href="https://wa.me/${esc(wa)}">${ic('message', 18)}<span>WhatsApp</span></a>` : ''}${ph2 ? `<a class="o-act" href="tel:${esc(ph2)}" data-call="${p.id}">${ic('phone', 18)}<span>Доп. номер</span></a>` : ''}${p.email ? `<a class="o-act" href="mailto:${esc(p.email)}">${ic('mail', 18)}<span>Почта</span></a>` : ''}</div>${p.address ? `<div class="o-muted">${ic('pin', 12)} ${esc(p.address)}</div>` : ''}${p.birthday ? `<div class="o-muted">${ic('gift', 12)} ${esc(p.birthday)}</div>` : ''}</div>`;
    };
    root.innerHTML = `<div class="o-search">${ic('users', 18)}<input class="input" id="cq" placeholder="Поиск по имени или номеру" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="o-seg-row f">${[['all', 'Все'], ['sos', 'SOS'], ['family', 'Семья'], ['friends', 'Друзья'], ['school', 'Школа']].map(([v, l]) => `<button class="o-chip${f.g === v ? ' on' : ''}" data-cf="${v}">${l}</button>`).join('')}</div>
    ${s.settings.sosEnabled !== false ? `<button class="o-sosbar" data-act="sos">${ic('sos', 20)}<span>Экстренный вызов и геопозиция</span>${ic('chevR', 18)}</button>` : ''}
    <div class="o-people">${list.map(card).join('') || `<div class="o-empty">${ic('users', 34, 1.4)}<p>${q ? 'Никого не найдено' : 'Контактов пока нет'}</p><button class="o-btn" data-act="person:new">${ic('plus', 16)} Добавить</button></div>`}</div>`;
    const cq = $('cq'); if (cq) cq.oninput = () => { f.q = cq.value; const pos = cq.selectionStart; O.renderContacts(); const n = $('cq'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-cf]'); if (g) { O.ui.cf.g = g.dataset.cf; O.renderContacts(); return; }
    const ed = e.target.closest('[data-edit]'); if (ed) O.openPerson(ed.dataset.edit);
  });

  O.openPerson = function (id) {
    if (id === 'new') id = null;
    const core = C(), s = S(), p = id ? s.people.find(x => x.id === id) : null, isNew = !p;
    core.openModal(isNew ? 'Новый контакт' : 'Контакт', `<div class="o-form">
      <div class="form-group"><label>Имя</label><input class="input" id="pm-name" value="${esc(p?.name || '')}" autocomplete="off"></div>
      <div class="form-row"><div class="form-group"><label>Кем приходится</label><input class="input" id="pm-rel" list="pm-rels" value="${esc(p?.relation || '')}" placeholder="мама, папа, друг…"><datalist id="pm-rels">${['Мама', 'Папа', 'Бабушка', 'Дедушка', 'Брат', 'Сестра', 'Тётя', 'Дядя', 'Друг', 'Классный руководитель', 'Учитель', 'Тренер'].map(x => `<option value="${x}">`).join('')}</datalist></div>
      <div class="form-group"><label>День рождения</label><input class="input" id="pm-bd" value="${esc(p?.birthday || '')}" placeholder="03-15 или 2012-03-15"></div></div>
      <div class="form-row"><div class="form-group"><label>Телефон</label><input class="input" id="pm-ph" type="tel" inputmode="tel" value="${esc(p?.phone || '')}" placeholder="+7 900 000-00-00"></div>
      <div class="form-group"><label>Доп. телефон</label><input class="input" id="pm-ph2" type="tel" inputmode="tel" value="${esc(p?.phone2 || '')}"></div></div>
      <div class="form-row"><div class="form-group"><label>Telegram</label><input class="input" id="pm-tg" value="${esc(p?.tg || '')}" placeholder="@username"></div>
      <div class="form-group"><label>Почта</label><input class="input" id="pm-em" type="email" value="${esc(p?.email || '')}"></div></div>
      <div class="form-group"><label>Адрес / место работы</label><input class="input" id="pm-ad" value="${esc(p?.address || '')}"></div>
      <div class="form-group"><label>Заметки</label><textarea class="textarea" id="pm-nt" rows="2">${esc(p?.notes || '')}</textarea></div>
      <label class="o-sw"><input type="checkbox" id="pm-fav"${p?.fav ? ' checked' : ''}><i></i><span>Избранный — показывать на главном экране</span></label>
      <label class="o-sw"><input type="checkbox" id="pm-sos"${p?.emergency ? ' checked' : ''}><i></i><span>Экстренный контакт (SOS)</span></label></div>`,
      `${!isNew ? `<button class="btn btn-danger" id="pm-del">Удалить</button><button class="btn btn-secondary" id="pm-vcf">В контакты телефона</button>` : ''}<button class="btn btn-primary" id="pm-save">Сохранить</button>`);
    $('pm-save').onclick = () => {
      const name = $('pm-name').value.trim(); if (!name) return core.toast('Укажите имя');
      const data = { ...(p || {}), id: p?.id || core.uid(), name, relation: $('pm-rel').value.trim(), birthday: $('pm-bd').value.trim(), phone: $('pm-ph').value.trim(), phone2: $('pm-ph2').value.trim(), tg: $('pm-tg').value.trim(), email: $('pm-em').value.trim(), address: $('pm-ad').value.trim(), notes: $('pm-nt').value.trim(), fav: $('pm-fav').checked, emergency: $('pm-sos').checked };
      if (isNew) s.people.push(data); else { const i = s.people.findIndex(x => x.id === id); if (i >= 0) s.people[i] = data; }
      core.save(); core.closeModal(); core.render(); core.toast('Контакт сохранён');
    };
    if (!isNew) {
      $('pm-del').onclick = () => { s.people = s.people.filter(x => x.id !== id); core.save(); core.closeModal(); core.render(); core.toast('Удалено'); };
      $('pm-vcf').onclick = () => { const v = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + p.name, p.phone ? 'TEL;TYPE=CELL:' + O.digits(p.phone) : '', p.phone2 ? 'TEL;TYPE=CELL:' + O.digits(p.phone2) : '', p.email ? 'EMAIL:' + p.email : '', p.birthday && /^\d{4}-\d{2}-\d{2}$/.test(p.birthday) ? 'BDAY:' + p.birthday : '', 'END:VCARD'].filter(Boolean).join('\r\n'); O.download(new Blob([v], { type: 'text/vcard' }), (p.name || 'contact') + '.vcf'); };
    }
  };

  O.download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };

  /* ═════════ SOS ═════════ */
  O.openSOS = function () {
    const s = S(), st = s.settings, num = st.sosNumber || '112';
    const pool = s.people.filter(p => p.phone), em = pool.filter(p => p.emergency), show = (em.length ? em : pool.filter(p => p.fav).concat(pool)).filter((p, i, a) => a.indexOf(p) === i).slice(0, 4);
    /* Защита от случайного вызова 112: кнопка сначала, tel: только после подтверждения */
    C().openModal('Экстренная помощь', `<div class="o-sos">
      <button type="button" class="o-sos-big" id="sos-call-112" data-num="${esc(num)}">${ic('phone', 28)}<div><b>Позвонить ${esc(num)}</b><small>Нажмите дважды — защита от случайного вызова</small></div></button>
      <div id="sos-112-confirm" class="o-sos-confirm hidden">
        <p class="o-sos-warn">Вызов службы спасения <b>${esc(num)}</b>. Продолжить только если нужна реальная помощь.</p>
        <div class="o-sos-confirm-row">
          <button type="button" class="o-btn danger" id="sos-112-yes">Да, позвонить ${esc(num)}</button>
          <button type="button" class="o-btn ghost" id="sos-112-no">Отмена</button>
        </div>
      </div>
      ${show.map(p => `<a class="o-sos-p" href="tel:${esc(O.digits(p.phone))}" data-call="${p.id}">${O.avatar(p, 44)}<div><b>${esc(p.name)}</b><small>${esc(p.relation || '')} · ${esc(p.phone)}</small></div>${ic('phone', 20)}</a>`).join('') || `<p class="o-muted">Добавьте экстренные контакты в разделе «Контакты» — они появятся здесь.</p>`}
      <button class="o-btn" id="sos-loc">${ic('pin', 16)} Отправить мою геопозицию</button>
      <p class="o-muted">Случайное нажатие не наберёт ${esc(num)}: нужен второй шаг «Да, позвонить». Геопозиция — только выбранному контакту.</p></div>`);
    const conf = $('sos-112-confirm');
    $('sos-call-112').onclick = () => { conf.classList.remove('hidden'); $('sos-call-112').classList.add('armed'); };
    $('sos-112-no').onclick = () => { conf.classList.add('hidden'); $('sos-call-112').classList.remove('armed'); };
    $('sos-112-yes').onclick = () => { conf.classList.add('hidden'); location.href = 'tel:' + num; };
    $('sos-loc').onclick = () => {
      if (!navigator.geolocation) return C().toast('Геолокация недоступна');
      C().toast('Определяю место…', 4000);
      navigator.geolocation.getCurrentPosition(pos => {
        const url = `https://maps.google.com/?q=${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`, text = 'Мне нужна помощь. Я здесь: ' + url, to = show[0] ? O.digits(show[0].phone) : '';
        if (to) location.href = `sms:${to}${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`;
        else if (navigator.share) navigator.share({ text }).catch(() => {}); else navigator.clipboard?.writeText(text).then(() => C().toast('Ссылка скопирована'));
      }, () => C().toast('Не удалось получить геопозицию. Проверьте разрешение.'), { enableHighAccuracy: true, timeout: 12000 });
    };
  };

  /* ═════════ «ЕЩЁ» ═════════ */
  O.renderMore = function () {
    const root = $('more-root'); if (!root) return;
    const tiles = [['kanban', 'kanban', 'Канбан', 'Замены и переносы'], ['pack', 'bag', 'Рюкзак', 'Что взять'], ['tasks', 'check', 'Задачи', 'Домашка и цели'], ['diary', 'book', 'Дневник', 'Итог дня'], ['notes', 'note', 'Заметки', 'Текст и голос'], ['contacts', 'phone', 'Контакты', 'Позвонить в одно касание'], ['share', 'share', 'Обмен', 'QR · файл · Bluetooth'], ['settings', 'sliders', 'Настройки', 'Бренд, экран, агент'], ['profile', 'users', 'Профиль', 'Данные и каникулы']];
    root.innerHTML = `<div class="o-tiles">${tiles.map(t => `<button class="o-tile" data-act="tab:${t[0]}">${ic(t[1], 26)}<b>${t[2]}</b><small>${t[3]}</small></button>`).join('')}${O.canInstall && O.canInstall() ? `<button class="o-tile hot" data-act="install">${ic('download', 26)}<b>Установить</b><small>Как приложение</small></button>` : ''}</div>`;
  };
})();
