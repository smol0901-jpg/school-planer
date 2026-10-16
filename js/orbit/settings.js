/* Орбита 4 · НАСТРОЙКИ, РЕЗЕРВНЫЕ КОПИИ, УВЕДОМЛЕНИЯ */
(function () {
  const O = window.Orbit = window.Orbit || {}, E = O.engine, ic = O.ic, esc = O.esc;
  const C = () => O.core(), S = () => C().state, $ = id => document.getElementById(id);

  /* ───── резервные копии (локально, последние 5) ───── */
  const SK = 'orbit-snapshots-v1';
  const readSnaps = () => { try { return JSON.parse(localStorage.getItem(SK) || '[]'); } catch (e) { return []; } };
  O.backup = {
    list: readSnaps,
    snapshot(label) {
      try {
        const s = JSON.parse(JSON.stringify(S())); (s.notes || []).forEach(n => { delete n.audio; });
        if (s.profile) s.profile.photo = '';
        const list = readSnaps(); list.unshift({ at: Date.now(), label: label || 'вручную', data: s }); list.length = Math.min(list.length, 5);
        localStorage.setItem(SK, JSON.stringify(list)); return true;
      } catch (e) { const l = readSnaps(); l.length = Math.min(l.length, 2); try { localStorage.setItem(SK, JSON.stringify(l)); } catch (_) {} return false; }
    },
    restore(i) { const x = readSnaps()[i]; if (!x) return; O.backup.snapshot('перед восстановлением'); C().setState(x.data); C().toast('Копия восстановлена'); },
    auto() { const st = S().settings; if (st.autoBackup === false) return; const l = readSnaps(); if (!l.length || Date.now() - l[0].at > 864e5) O.backup.snapshot('авто'); }
  };
  let bt = null; O.onSave = () => { clearTimeout(bt); bt = setTimeout(() => O.backup.auto(), 2500); };

  /* ───── уведомления ───── */
  const NK = 'orbit-notified-v1';
  const done = () => { try { return new Set(JSON.parse(localStorage.getItem(NK) || '[]')); } catch (e) { return new Set(); } };
  const mark = k => { const d = done(); d.add(k); try { localStorage.setItem(NK, JSON.stringify([...d].slice(-200))); } catch (e) {} };
  O.notify = {
    ok: () => 'Notification' in window && Notification.permission === 'granted',
    async ask() { if (!('Notification' in window)) return false; if (Notification.permission === 'default') await Notification.requestPermission(); return Notification.permission === 'granted'; },
    async show(title, body, tag) {
      C().toast(title + (body ? ': ' + body : ''), 6000); O.vibrate([60, 40, 60]);
      if (!O.notify.ok()) return;
      try { const reg = await navigator.serviceWorker?.getRegistration(); const o = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }; if (reg) reg.showNotification(title, o); else new Notification(title, o); } catch (e) {}
    }
  };
  const quiet = (st, nm) => { const a = E.toMin(st.quietFrom || '22:00'), b = E.toMin(st.quietTo || '07:00'); return a > b ? (nm >= a || nm < b) : (nm >= a && nm < b); };
  O.tick = function () {
    const s = S(), st = s.settings, now = new Date(), nm = E.nowMin(now), ds = E.dateStr(now);
    (s.reminders || []).forEach(r => { if (!r.done && r.at && new Date(r.at) <= now && !done().has('r' + r.id)) { mark('r' + r.id); O.notify.show('Напоминание', r.text, 'r' + r.id); } });
    if (st.notifyLeave) {
      const lead = +st.notifyLead || 10, ev = E.eventsOn(s, now);
      if (ev.list.length && !ev.holiday && !quiet(st, nm)) {
        const les = ev.list.filter(e => e.type !== 'event'), first = les[0], p = E.planSchool(s, now);
        if (p.options[0] && nm < first.s) { const t = p.options[0].leaveBy - lead, k = 'L' + ds + 's'; if (nm >= t && nm <= t + 3 && !done().has(k)) { mark(k); O.notify.show('Пора собираться', `Автобус №${p.options[0].number} в ${p.options[0].time}, выйти в ${E.fmt(p.options[0].leaveBy)}`, k); } }
        const lastE = Math.max(...les.map(e => e.e)), h = E.planHome(s, now, { freeAt: lastE });
        if (h.options[0]) { const t = lastE - lead, k = 'L' + ds + 'h'; if (nm >= t && nm <= t + 3 && !done().has(k)) { mark(k); O.notify.show('Скоро домой', `После занятий (${E.fmt(lastE)}) лучший автобус №${h.options[0].number} в ${h.options[0].time}`, k); } }
      }
    }
    if (st.notifyHw && nm >= 18 * 60 && nm < 18 * 60 + 4) { const g = E.hwGroups(s, now), n = g.today.length + g.tomorrow.length + g.overdue.length, k = 'H' + ds; if (n && !done().has(k)) { mark(k); O.notify.show('Домашка', `Невыполнено на ближайшие дни: ${n}`, k); } }
    if (O.ui.free && Date.now() - O.ui.free.at > 40 * 60000) O.ui.free = null;
  };

  /* ───── схема настроек ───── */
  const seg = (k, opts) => ({ t: 'seg', k, opts });
  const SECTIONS = [
    { id: 'look', title: 'Бренд и стиль', icon: 'palette', items: [
      { t: 'brand' },
      { t: 'seg', k: 'theme', label: 'Тема', opts: [['dark', 'Тёмная'], ['light', 'Светлая'], ['amoled', 'AMOLED'], ['auto', 'Как в системе']] },
      { t: 'accent', label: 'Цвет акцента', hint: 'Перекрашивает выбранный бренд' },
      { t: 'seg', k: 'font', label: 'Шрифт', opts: [['system', 'Как у бренда'], ['sans', 'Обычный'], ['rounded', 'Округлый'], ['serif', 'С засечками'], ['mono', 'Моно'], ['readable', 'Читаемый']] },
      { t: 'range', k: 'textScale', label: 'Размер текста', min: 85, max: 140, step: 5, unit: '%' },
      { t: 'range', k: 'radius', label: 'Скругление углов', min: 4, max: 28, step: 1, unit: 'px', hint: '14 — как задумал бренд' },
      { t: 'toggle', k: 'glass', label: 'Эффект стекла и свечения' },
      { t: 'seg', k: 'motion', label: 'Анимации', opts: [['full', 'Все'], ['auto', 'Как в системе'], ['reduced', 'Меньше'], ['off', 'Выкл']] },
      { t: 'toggle', k: 'contrast', label: 'Высокий контраст', on: 'high', off: 'normal' }] },
    { id: 'dash', title: 'Главный экран', icon: 'home', items: [{ t: 'widgets' }] },
    { id: 'school', title: 'Школа и время', icon: 'school', items: [
      { t: 'num', k: 'lessonDuration', label: 'Длина урока, мин', min: 20, max: 120 }, { t: 'num', k: 'breakDuration', label: 'Перемена, мин', min: 0, max: 60 },
      { t: 'time', k: 'dayStart', label: 'Начало первого урока' },
      { t: 'num', k: 'exitMin', label: 'На выход из школы после урока, мин', min: 0, max: 40, hint: 'Одежда, гардероб, выход — учитывается при расчёте автобуса' },
      { t: 'num', k: 'arriveBefore', label: 'Быть в школе заранее, мин', min: 0, max: 30 }] },
    { id: 'bus', title: 'Автобусы', icon: 'bus', items: [
      { t: 'num', k: 'rideDefault', label: 'Время в пути по умолчанию, мин', min: 1, max: 120 }, { t: 'num', k: 'showBuses', label: 'Сколько рейсов показывать', min: 1, max: 8 }] },
    { id: 'agent', title: 'Агент', icon: 'sparkle', items: [
      { t: 'toggle', k: 'agentSuggest', label: 'Учиться на привычках и подсказывать' },
      { t: 'seg', k: 'agentAutonomy', label: 'Изменения данных', opts: [['smart', 'Делать сразу + «Отменить»'], ['ask', 'Спрашивать «Да/Нет»']] },
      { t: 'toggle', k: 'voice', label: 'Голосовой ввод (если поддерживается)' },
      { t: 'toggle', k: 'agentAiPrompt', label: 'Промпт для нейросети при непонимании' },
      { t: 'toggle', k: 'llmEnabled', label: 'Запросы к нейросети по API' },
      { t: 'llmwizard' },
      { t: 'llmprov' },
      { t: 'text', k: 'llmEndpoint', label: 'API Endpoint', hint: 'Для custom / правка URL. Grok/DeepSeek/OpenAI подставляются пресетом' },
      { t: 'pass', k: 'llmKey', label: 'API Key (Grok / DeepSeek / Claude / OpenAI)' },
      { t: 'text', k: 'llmModel', label: 'Модель', hint: 'GigaChat, grok-2-latest, deepseek-chat, claude-…' },
      { t: 'text', k: 'llmClientId', label: 'GigaChat Client ID' },
      { t: 'pass', k: 'llmClientSecret', label: 'GigaChat Client Secret' },
      { t: 'pass', k: 'llmAuthKey', label: 'GigaChat Authorization Key (base64, опционально)' },
      { t: 'text', k: 'llmScope', label: 'GigaChat Scope', hint: 'GIGACHAT_API_PERS' },
      { t: 'text', k: 'llmProxy', label: 'Proxy URL (CORS)', hint: 'Оставьте ПУСТО. Только если есть свой сервер: https://your-proxy.example.com  (НЕ api.giga.chat)' },
      { t: 'agentmem' }] },
    { id: 'sos', title: 'Контакты и SOS', icon: 'sos', items: [
      { t: 'toggle', k: 'sosEnabled', label: 'Показывать кнопку SOS' }, { t: 'text', k: 'sosNumber', label: 'Номер экстренной службы', hint: '112 работает по всей России и с телефона без SIM' }] },
    { id: 'notify', title: 'Уведомления', icon: 'bell', items: [
      { t: 'toggle', k: 'notifyLeave', label: 'Напоминать, когда выходить на автобус', perm: true },
      { t: 'num', k: 'notifyLead', label: 'За сколько минут напомнить', min: 1, max: 60 },
      { t: 'toggle', k: 'notifyHw', label: 'Вечером напомнить про домашку (18:00)', perm: true },
      { t: 'time', k: 'quietFrom', label: 'Тихие часы с' }, { t: 'time', k: 'quietTo', label: 'до' },
      { t: 'note', text: 'Уведомления приходят, пока приложение открыто или установлено и не выгружено из памяти. Для гарантированных push нужен сервер.' },
      { t: 'btn', id: 'test-notify', label: 'Проверить уведомление' }] },
    { id: 'data', title: 'Данные и копии', icon: 'refresh', items: [{ t: 'toggle', k: 'autoBackup', label: 'Автокопия раз в сутки (последние 5)' }, { t: 'snaps' }] },
    { id: 'about', title: 'О приложении', icon: 'info', items: [{ t: 'about' }] }
  ];
  const open = new Set(['look']);

  const item = (it, st) => {
    const v = st[it.k];
    switch (it.t) {
      case 'brand': return `<div class="o-brands">${Object.values(O.brands).map(b => `<button class="o-brand${(st.brand || 'orbit') === b.id ? ' on' : ''}" data-sact="brand:${b.id}"><span class="o-brand-logo">${O.logo(b.id, 40)}</span><b>${esc(b.name)}</b><small>${esc(b.style)}</small><em>Агент: ${esc(b.agent)}</em></button>`).join('')}</div>`;
      case 'seg': return `<div class="o-set"><label>${it.label}</label><div class="o-segs">${it.opts.map(([x, l]) => `<button class="o-chip${(v === undefined ? it.opts[0][0] : v) === x ? ' on' : ''}" data-sk="${it.k}" data-sv="${x}">${l}</button>`).join('')}</div></div>`;
      case 'accent': return `<div class="o-set"><label>${it.label}</label>${it.hint ? `<small>${it.hint}</small>` : ''}<div class="o-sw-row">${O.ACCENTS.map(([n, c]) => `<button class="o-dot${(st.accentCustom || '').toLowerCase() === c ? ' on' : ''}" style="--c:${c}" data-sk="accentCustom" data-sv="${c}" aria-label="${n}"></button>`).join('')}<input type="color" class="o-colorin" data-sk="accentCustom" value="${/^#[0-9a-f]{6}$/i.test(st.accentCustom || '') ? st.accentCustom : '#8b5cf6'}" aria-label="Свой цвет"><button class="o-chip" data-sk="accentCustom" data-sv="">Как у бренда</button></div></div>`;
      case 'range': return `<div class="o-set"><label>${it.label} <b>${v ?? ''}${it.unit || ''}</b></label>${it.hint ? `<small>${it.hint}</small>` : ''}<input type="range" data-sk="${it.k}" min="${it.min}" max="${it.max}" step="${it.step || 1}" value="${v ?? it.min}"></div>`;
      case 'toggle': { const on = it.on !== undefined ? v === it.on : v !== false && !!(v === undefined ? true : v); return `<label class="o-sw"><input type="checkbox" data-sk="${it.k}" data-on="${it.on ?? ''}" data-off="${it.off ?? ''}" ${it.perm ? 'data-perm="1"' : ''}${on ? ' checked' : ''}><i></i><span>${it.label}</span></label>`; }
      case 'num': return `<div class="o-set row"><label>${it.label}</label><input class="input o-num" type="number" inputmode="numeric" data-sk="${it.k}" min="${it.min}" max="${it.max}" value="${v ?? ''}">${it.hint ? `<small>${it.hint}</small>` : ''}</div>`;
      case 'time': return `<div class="o-set row"><label>${it.label}</label><input class="input o-num" type="time" data-sk="${it.k}" value="${esc(v || '')}"></div>`;
      case 'text': return `<div class="o-set row"><label>${it.label}</label><input class="input o-num" data-sk="${it.k}" value="${esc(v ?? '')}">${it.hint ? `<small>${it.hint}</small>` : ''}</div>`;
      case 'llmwizard': {
        const st = S().settings || {};
        const on = !!st.llmEnabled;
        const prov = st.llmProvider || 'custom';
        const pname = (O.llmProviders && O.llmProviders[prov] && O.llmProviders[prov].name) || prov;
        return `<div class="o-set o-llm-wizard">
          <label>Мастер нейросети</label>
          <small>По шагам: включить → провайдер → ключи → проверка. Подскажет, что именно не так.</small>
          <div class="o-wiz-steps" id="llm-wiz-steps">
            <div class="o-wiz-s"><span>1</span> Включите API сверху</div>
            <div class="o-wiz-s"><span>2</span> Выберите провайдер (сейчас: <b>${esc(pname)}</b>)</div>
            <div class="o-wiz-s"><span>3</span> Заполните ключи ниже (для GigaChat — Client ID и Secret; Proxy оставьте пустым)</div>
            <div class="o-wiz-s"><span>4</span> Нажмите «Проверить подключение»</div>
          </div>
          <div class="o-wiz-actions">
            <button type="button" class="o-btn" data-sact="llm-test">${ic('sparkle',16)} Проверить подключение</button>
            <button type="button" class="o-btn ghost" data-sact="llm-wiz-giga">Быстро: GigaChat</button>
          </div>
          <div id="llm-test-result" class="o-llm-test-result hidden" aria-live="polite"></div>
        </div>`;
      }
      case 'llmprov': {
        const prov = st.llmProvider || 'custom';
        const list = (O.llmProviders && Object.values(O.llmProviders)) || [];
        return `<div class="o-set"><label>Провайдер нейросети</label><div class="o-segs">${list.map(p => `<button type="button" class="o-chip${prov === p.id ? ' on' : ''}" data-sact="llmprov:${p.id}">${p.name}</button>`).join('')}</div>
          <small>${(O.llmProviders && O.llmProviders[prov] && O.llmProviders[prov].hint) || ''}</small></div>`;
      }
      case 'pass': return `<div class="o-set row"><label>${it.label}</label><input class="input o-num" type="password" data-sk="${it.k}" value="${esc(v ?? '')}" autocomplete="off" placeholder="sk-…">${it.hint ? `<small>${it.hint}</small>` : ''}</div>`;
      case 'note': return `<p class="o-note">${ic('info', 13)} ${it.text}</p>`;
      case 'btn': return `<button class="o-btn ghost" data-sact="${it.id}">${it.label}</button>`;
      case 'widgets': return `<div class="o-set"><label>Блоки главного экрана</label><small>Включайте нужные и меняйте порядок стрелками</small><ul class="o-wl">${O.widgetList().map((w, i, a) => `<li class="${w.on ? '' : 'off'}"><label class="o-sw"><input type="checkbox" data-sw="toggle:${w.id}"${w.on ? ' checked' : ''}><i></i><span>${esc(w.name)}</span></label><button class="o-ib" data-sw="up:${w.id}" ${i === 0 ? 'disabled' : ''} aria-label="Выше">${ic('chevD', 16)}</button><button class="o-ib" data-sw="down:${w.id}" ${i === a.length - 1 ? 'disabled' : ''} aria-label="Ниже">${ic('chevD', 16)}</button></li>`).join('')}</ul><button class="o-chip" data-sact="widgets-reset">Сбросить порядок</button></div>`;
      case 'agentmem': { const hb = O.habits.size(); return `<div class="o-set"><small>Привычек записано: ${hb}. Данные хранятся только на этом устройстве.</small><div class="o-segs"><button class="o-chip" data-sact="habits-clear">Забыть привычки</button><button class="o-chip" data-sact="agent-mem">Что помнит агент</button></div></div>`; }
      case 'snaps': { const l = O.backup.list(); return `<div class="o-set"><div class="o-segs"><button class="o-btn ghost sm" data-sact="snap-now">Сделать копию</button><button class="o-btn ghost sm" data-sact="export-all">Скачать всё (JSON)</button><button class="o-btn ghost sm" data-sact="import-all">Импорт</button></div><ul class="o-snaps">${l.map((x, i) => `<li><span>${new Date(x.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${esc(x.label)}</span><button class="o-chip" data-sact="snap-restore:${i}">Вернуть</button></li>`).join('') || '<li class="o-muted">Копий пока нет</li>'}</ul><button class="o-link danger" data-sact="reset">Сбросить все данные…</button></div>`; }
      case 'about': { const b = O.brand(); return `<div class="o-about"><span data-brand-logo="54"></span><div><b>${esc(b.name)}</b> <em>v${C().version}</em><div class="o-muted">${esc(b.tag)}</div></div></div><div class="o-segs">${O.canInstall && O.canInstall() ? `<button class="o-btn" data-sact="install">${ic('download', 16)} Установить</button>` : ''}<button class="o-btn ghost" data-sact="update">${ic('refresh', 16)} Проверить обновление</button></div><p class="o-muted">Горячие клавиши: <kbd>Ctrl</kbd>+<kbd>K</kbd> — агент, <kbd>1</kbd>–<kbd>5</kbd> — разделы (на ПК).</p>`; }
    }
    return '';
  };

  O.renderSettings = function () {
    const root = $('settings-root'); if (!root) return; const st = S().settings;
    root.innerHTML = SECTIONS.map(sec => `<details class="o-sec" data-sec="${sec.id}"${open.has(sec.id) ? ' open' : ''}><summary>${ic(sec.icon, 20)}<b>${sec.title}</b>${ic('chevD', 16)}</summary><div class="o-sec-b">${sec.items.map(i => item(i, st)).join('')}</div></details>`).join('');
    O.look(st); document.querySelectorAll('#settings-root [data-brand-logo]').forEach(e => e.innerHTML = O.logo(O.brand().id, +e.dataset.brandLogo || 28));
  };

  function set(k, v) { const s = S(); s.settings[k] = v; C().save(); C().applyTheme(); }
  async function sact(a, p) {
    const core = C(), s = S();
    if (a === 'brand') { set('brand', p); O.renderSettings(); core.toast('Бренд: ' + O.brands[p].name); }
    else if (a === 'widgets-reset') { set('widgets', null); O.renderSettings(); }
    else if (a === 'habits-clear') { O.habits.clear(); core.toast('Привычки очищены'); O.renderSettings(); }
    else if (a === 'agent-mem') O.assistant.ask('что ты помнишь');
    else if (a === 'llmprov') {
      if (O.llmApplyProvider) O.llmApplyProvider(p);
      else set('llmProvider', p);
      O.renderSettings();
      const names = { giga: 'GigaChat', grok: 'Grok', deepseek: 'DeepSeek', claude: 'Claude', openai: 'OpenAI', custom: 'Другая' };
      C().toast('Провайдер: ' + (names[p] || p) + (p === 'giga' ? ' · Proxy оставьте пустым' : ''));
    }
    else if (a === 'llm-wiz-giga') {
      set('llmEnabled', true);
      if (O.llmApplyProvider) O.llmApplyProvider('giga');
      else { set('llmProvider', 'giga'); set('llmEndpoint', 'https://api.giga.chat/v1/chat/completions'); set('llmModel', 'GigaChat'); }
      set('llmScope', 'GIGACHAT_API_PERS');
      const px = S().settings.llmProxy || '';
      if (px && /giga\.chat|sberbank/i.test(px)) set('llmProxy', '');
      O.renderSettings();
      C().toast('GigaChat: вставьте Client ID и Secret → «Проверить подключение»');
    }
    else if (a === 'llm-test') {
      const box = document.getElementById('llm-test-result');
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = '<p class="o-muted">Проверка по шагам…</p>';
      }
      if (!O.llmTest) { C().toast('Модуль llm.js не загружен — обновите страницу'); return; }
      try {
        const r = await O.llmTest();
        if (!box) { C().toast(r.summary); return; }
        const rows = (r.steps || []).map(s => {
          const icon = s.ok === true ? '✓' : (s.ok === false ? '✗' : '…');
          const cls = s.ok === true ? 'ok' : (s.ok === false ? 'bad' : '');
          return '<div class="o-test-step ' + cls + '"><b>' + icon + ' ' + esc(s.title) + '</b><span>' + esc(s.detail) + '</span></div>';
        }).join('');
        box.innerHTML = '<div class="o-test-sum ' + (r.ok ? 'ok' : 'bad') + '">' + (r.ok ? '✓ ' : '✗ ') + esc(r.summary) + '</div>' + rows;
        C().toast(r.ok ? 'Нейросеть работает' : 'Смотрите, какой шаг красный');
      } catch (e) {
        if (box) box.innerHTML = '<div class="o-test-sum bad">Сбой: ' + esc(e.message || e) + '</div>';
        C().toast('Сбой проверки');
      }
    }
    else if (a === 'snap-now') { O.backup.snapshot('вручную'); core.toast('Копия создана'); O.renderSettings(); }
    else if (a === 'snap-restore') { if (confirm('Вернуть эту копию? Текущие данные сохранятся отдельной копией.')) O.backup.restore(+p); }
    else if (a === 'export-all') O.download(new Blob([JSON.stringify(s)], { type: 'application/json' }), `orbit-backup-${E.dateStr(new Date())}.json`);
    else if (a === 'import-all') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,.orbit,application/json'; i.onchange = async () => { if (i.files[0]) O.share.importText(await i.files[0].text()); }; i.click(); }
    else if (a === 'reset') { if (confirm('Удалить ВСЕ данные приложения? Перед этим будет сделана копия.')) { O.backup.snapshot('перед сбросом'); core.setState({}); core.toast('Данные сброшены'); } }
    else if (a === 'install') O.install();
    else if (a === 'update') { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.update(); core.toast(reg.waiting ? 'Обновление готово — перезапустите' : 'У вас последняя версия'); if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); } else core.toast('Обновления проверяются, когда приложение открыто по адресу сайта'); }
    else if (a === 'test-notify') { const ok = await O.notify.ask(); O.notify.show('Орбита', ok ? 'Уведомления работают' : 'Разрешите уведомления в браузере', 'test'); }
  }
  document.addEventListener('click', e => {
    const r = e.target.closest('#settings-root'); if (!r) return;
    const sa = e.target.closest('[data-sact]'); if (sa) { const [a, ...p] = sa.dataset.sact.split(':'); sact(a, p.join(':')); return; }
    const sk = e.target.closest('button[data-sk]'); if (sk) { set(sk.dataset.sk, sk.dataset.sv === '' ? '' : (isNaN(+sk.dataset.sv) || /^#/.test(sk.dataset.sv) ? sk.dataset.sv : +sk.dataset.sv)); O.vibrate(6); O.renderSettings(); return; }
    const sw = e.target.closest('button[data-sw]'); if (sw) { const [a, id] = sw.dataset.sw.split(':'), l = O.widgetList(), i = l.findIndex(w => w.id === id), j = a === 'up' ? i - 1 : i + 1; if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; set('widgets', l.map(({ id, on }) => ({ id, on }))); O.renderSettings(); } }
  });
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('#settings-root details')) { d.open ? open.add(d.dataset.sec) : open.delete(d.dataset.sec); } }, true);
  document.addEventListener('change', async e => {
    const el = e.target; if (!el.closest || !el.closest('#settings-root')) return;
    if (el.dataset.sw) { const [, id] = el.dataset.sw.split(':'), l = O.widgetList(); l.find(w => w.id === id).on = el.checked; set('widgets', l.map(({ id, on }) => ({ id, on }))); O.renderSettings(); return; }
    const k = el.dataset.sk; if (!k) return;
    if (el.type === 'checkbox') { if (el.dataset.perm && el.checked) { const ok = await O.notify.ask(); if (!ok) C().toast('Разрешите уведомления в браузере, иначе они не появятся', 4000); } const on = el.dataset.on, off = el.dataset.off; set(k, on ? (el.checked ? on : off) : el.checked); }
    else if (el.type === 'range') set(k, +el.value);
    else if (el.type === 'number') set(k, +el.value);
    else set(k, el.value);
    if (el.type === 'range') O.renderSettings();
  });
  document.addEventListener('input', e => { const el = e.target; if (el.type === 'range' && el.closest && el.closest('#settings-root')) { const lab = el.parentElement.querySelector('label b'); if (lab) lab.textContent = el.value + (el.parentElement.querySelector('label b').textContent.replace(/[\d.-]/g, '') || ''); set(el.dataset.sk, +el.value); } if (el.type === 'color' && el.closest && el.closest('#settings-root')) set('accentCustom', el.value); });
})();
