/* Орбита 4.4 · СЦЕНАРИИ: визуальный редактор блок-схем для агента.
   Блоки: команда агента · сообщение · напоминание · «Если → Да/Нет». Триггеры: фраза, время, вручную. */
(function () {
  'use strict';
  const O = window.Orbit = window.Orbit || {}, KEY = 'orbit-scripts-v1';
  const esc = s => (O.esc ? O.esc(s) : String(s == null ? '' : s)).replace(/"/g, '&quot;');
  const N = s => (O.engine && O.engine.N ? O.engine.N(s) : String(s || '').toLowerCase().replace(/ё/g, 'е'));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const TEMPLATES = [
    { name: 'Утро', trigger: { kind: 'phrase', text: 'доброе утро орби' }, steps: [
      { t: 'if', cond: { k: 'weekday', v: 'work' }, then: [{ t: 'cmd', text: 'что дальше' }, { t: 'cmd', text: 'что взять сегодня' }, { t: 'cmd', text: 'когда выходить в школу' }], else: [{ t: 'say', text: 'Выходной — отдыхай!' }] }] },
    { name: 'После школы', trigger: { kind: 'phrase', text: 'я в автобусе' }, steps: [
      { t: 'cmd', text: 'я освободился' }, { t: 'if', cond: { k: 'hw', v: '' }, then: [{ t: 'cmd', text: 'что задано' }, { t: 'remind', min: 60, text: 'сделать домашку' }], else: [{ t: 'say', text: 'ДЗ нет — свободный вечер.' }] }] },
    { name: 'Вечер', trigger: { kind: 'time', at: '20:30', days: [0, 1, 2, 3, 4, 6] }, steps: [{ t: 'cmd', text: 'что взять завтра' }, { t: 'cmd', text: 'расписание на завтра' }] }
  ];
  let list = [], ed = null, lastTick = '', adding = '';
  const load = () => { try { list = JSON.parse(localStorage.getItem(KEY) || 'null') || []; } catch (e) { list = []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} };
  load();
  const st = () => (O.core ? O.core().state : {}) || {};

  /* ── условия ── */
  function cond(c) {
    const now = new Date(), di = (now.getDay() + 6) % 7, mins = now.getHours() * 60 + now.getMinutes();
    if (c.k === 'weekday') return (c.v === 'off') ? di > 4 : di <= 4;
    if (c.k === 'hw') return (st().homework || []).some(h => !h.done);
    if (c.k === 'time') { const [h, m] = String(c.at || '12:00').split(':'); const x = +h * 60 + +m; return c.v === 'after' ? mins >= x : mins < x; }
    return true;
  }
  /* ── запуск ── */
  async function runSteps(steps, A) {
    for (const s of steps || []) {
      if (s.t === 'say') A.msgs.push({ role: 'bot', text: s.text || '', cards: [], buttons: [] });
      else if (s.t === 'cmd') { if (s.text) await A.send(s.text); }
      else if (s.t === 'remind') await A.send('напомни через ' + (+s.min || 30) + ' мин ' + (s.text || ''));
      else if (s.t === 'if') {
        const yes = cond(s.cond || {}), c = s.cond || {};
        const label = c.k === 'weekday' ? (c.v === 'off' ? 'сегодня выходной' : 'сегодня будний день') : c.k === 'hw' ? 'есть невыполненное ДЗ' : c.k === 'time' ? ((c.v === 'after' ? 'сейчас после ' : 'сейчас до ') + (c.at || '12:00')) : 'условие';
        A.msgs.push({ role: 'bot', text: '↳ Если ' + label + ' — ' + (yes ? 'Да' : 'Нет'), cards: [], buttons: [] });
        await runSteps(yes ? s.then : s.else, A);
      }
    }
  }
  async function run(sc) {
    const A = O.assistant; if (!A || !sc) return;
    A.panel = 'chat';
    A.msgs.push({ role: 'bot', text: '▶ Сценарий «' + sc.name + '»', cards: [], buttons: [] });
    try { await runSteps(sc.steps, A); } catch (e) { A.msgs.push({ role: 'bot', text: 'Сценарий остановлен: ' + (e.message || e), cards: [], buttons: [] }); }
    A.render(true);
  }
  function match(text) {
    const n = N(text).trim(), m = n.match(/^(?:запусти|выполни|сценарий|включи сценарий)\s+(.+)$/);
    const q = m ? m[1] : n;
    return list.find(s => s.trigger && s.trigger.kind === 'phrase' && N(s.trigger.text) === n) ||
      (m ? list.find(s => N(s.name) === q || N(s.name).startsWith(q)) : null) || null;
  }
  setInterval(() => {
    const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), di = (d.getDay() + 6) % 7;
    const key = d.toDateString() + hm; if (key === lastTick) return; lastTick = key;
    list.filter(s => s.trigger && s.trigger.kind === 'time' && s.trigger.at === hm && (s.trigger.days || []).includes(di)).forEach(run);
  }, 20000);

  /* ── редактор ── */
  const get = (p) => p.reduce((o, k) => o[k], ed);
  const enc = p => encodeURIComponent(JSON.stringify(p)), dec = s => JSON.parse(decodeURIComponent(s));
  const TYPES = { cmd: ['Команда агента', 'Любая фраза, как в чате'], say: ['Сообщение', 'Агент напишет текст'], remind: ['Напоминание', 'Через N минут'], if: ['Если…', 'Ветвление Да / Нет'] };
  function skillsList() { const s = (O.actions && O.actions.SKILLS) || []; return '<datalist id="sc-dl">' + s.flatMap(k => k.examples || []).map(e => '<option value="' + esc(e) + '">').join('') + '</datalist>'; }

  function card(s, p, i) {
    const P = enc(p), tt = TYPES[s.t] ? TYPES[s.t][0] : s.t;
    const head = `<div class="sc-h"><b>${esc(tt)}</b><span><button data-sc="up" data-p="${P}" aria-label="Вверх">↑</button><button data-sc="dn" data-p="${P}" aria-label="Вниз">↓</button><button data-sc="del" data-p="${P}" aria-label="Удалить">✕</button></span></div>`;
    const inp = (f, ph, extra) => `<input class="sc-in" data-sc="f" data-f="${f}" data-p="${P}" value="${esc(s[f] || '')}" placeholder="${ph}" ${extra || ''}>`;
    let body = '';
    if (s.t === 'cmd') body = inp('text', 'например: что дальше', 'list="sc-dl"');
    else if (s.t === 'say') body = inp('text', 'Текст сообщения');
    else if (s.t === 'remind') body = `<div class="sc-row">через ${inp('min', 'мин', 'type="number" min="1" style="width:70px"')} мин ${inp('text', 'о чём напомнить')}</div>`;
    else if (s.t === 'if') {
      const c = s.cond || (s.cond = { k: 'weekday', v: 'work' });
      const opts = (arr, cur) => arr.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
      body = `<div class="sc-row"><select class="sc-in" data-sc="cond" data-p="${P}" data-c="k">${opts([['weekday', 'день недели'], ['hw', 'есть невыполненное ДЗ'], ['time', 'время']], c.k)}</select>` +
        (c.k === 'weekday' ? `<select class="sc-in" data-sc="cond" data-p="${P}" data-c="v">${opts([['work', 'будний'], ['off', 'выходной']], c.v)}</select>` : '') +
        (c.k === 'time' ? `<select class="sc-in" data-sc="cond" data-p="${P}" data-c="v">${opts([['before', 'до'], ['after', 'после']], c.v)}</select><input class="sc-in" type="time" data-sc="cond" data-p="${P}" data-c="at" value="${esc(c.at || '12:00')}">` : '') + '</div>' +
        `<div class="sc-branches"><div class="sc-br yes"><i>Да</i>${flow(s.then || (s.then = []), p.concat('then'))}</div><div class="sc-br no"><i>Нет</i>${flow(s.else || (s.else = []), p.concat('else'))}</div></div>`;
    }
    return `<div class="sc-b sc-${s.t}">${head}${body}</div>` + (s.t === 'if' ? '<div class="sc-merge" title="Обе ветки продолжаются здесь"><span>⤓ Обе ветки (Да и Нет) сходятся здесь</span></div>' : '');
  }
  function flow(steps, path) {
    const P = enc(path);
    return '<div class="sc-flow">' + steps.map((s, i) => card(s, path.concat(i), i) + '<div class="sc-arr">↓</div>').join('') +
      (adding === P ? '<div class="sc-pal">' + Object.keys(TYPES).map(k => `<button data-sc="pick" data-k="${k}" data-p="${P}"><b>${TYPES[k][0]}</b><small>${TYPES[k][1]}</small></button>`).join('') + '</div>' : `<button class="sc-add" data-sc="add" data-p="${P}">＋ Добавить блок</button>`) + '</div>';
  }
  function trigHtml(t) {
    t = ed.trigger || (ed.trigger = { kind: 'manual' });
    const sel = `<select class="sc-in" data-sc="trig" data-c="kind">${[['manual', 'Вручную (кнопка)'], ['phrase', 'Фраза в чате'], ['time', 'По времени']].map(([v, l]) => `<option value="${v}"${v === t.kind ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    if (t.kind === 'phrase') return sel + `<input class="sc-in" data-sc="trig" data-c="text" value="${esc(t.text || '')}" placeholder="например: я в автобусе">`;
    if (t.kind === 'time') return sel + `<input class="sc-in" type="time" data-sc="trig" data-c="at" value="${esc(t.at || '07:30')}"><div class="sc-days">${DAYS.map((d, i) => `<button type="button" class="${(t.days || []).includes(i) ? 'on' : ''}" data-sc="day" data-d="${i}">${d}</button>`).join('')}</div><small>Сработает, пока приложение открыто.</small>`;
    return sel;
  }
  function panel(body) {
    const draw = () => {
      if (!ed) {
        body.innerHTML = `<div class="sc-wrap">${skillsList()}<p class="sc-hint">Сценарий — блок-схема из команд агента. Запускается кнопкой, фразой или по времени.</p>` +
          (list.length ? list.map(s => `<div class="sc-item"><div><b>${esc(s.name)}</b><small>${s.trigger && s.trigger.kind === 'phrase' ? '«' + esc(s.trigger.text) + '»' : s.trigger && s.trigger.kind === 'time' ? '⏰ ' + esc(s.trigger.at) : 'вручную'} · ${s.steps.length} бл.</small></div><span><button data-sc="run" data-id="${s.id}">▶</button><button data-sc="edit" data-id="${s.id}">✎</button><button data-sc="rm" data-id="${s.id}">✕</button></span></div>`).join('') : '<p class="sc-hint">Пока пусто — создай свой или возьми шаблон.</p>') +
          `<button class="sc-add" data-sc="new">＋ Новый сценарий</button><h4>Шаблоны</h4>` + TEMPLATES.map((t, i) => `<button class="sc-tpl" data-sc="tpl" data-i="${i}">${esc(t.name)}</button>`).join('') + '</div>';
      } else {
        body.innerHTML = `<div class="sc-wrap">${skillsList()}<div class="sc-top"><button data-sc="back">← Назад</button><button class="pri" data-sc="save">Сохранить</button><button data-sc="test">▶ Тест</button></div>` +
          `<input class="sc-in sc-name" data-sc="name" value="${esc(ed.name)}" placeholder="Название сценария"><div class="sc-trig">${trigHtml()}</div><div class="sc-start">● Старт</div><div class="sc-arr">↓</div>${flow(ed.steps, ['steps'])}<div class="sc-end">■ Конец</div></div>`;
      }
    };
    if (!body._sc) {
      body._sc = true;
      body.addEventListener('input', e => {
        const el = e.target, a = el.dataset.sc; if (!a) return;
        if (a === 'f') { const s = get(dec(el.dataset.p)); s[el.dataset.f] = el.type === 'number' ? +el.value : el.value; }
        else if (a === 'name') ed.name = el.value;
        else if (a === 'trig' && el.dataset.c !== 'kind') ed.trigger[el.dataset.c] = el.value;
        else if (a === 'cond' && el.tagName === 'INPUT') get(dec(el.dataset.p)).cond[el.dataset.c] = el.value;
      });
      body.addEventListener('change', e => {
        const el = e.target, a = el.dataset.sc;
        if (a === 'cond' && el.tagName === 'SELECT') { const s = get(dec(el.dataset.p)); s.cond[el.dataset.c] = el.value; if (el.dataset.c === 'k') s.cond.v = el.value === 'time' ? 'before' : el.value === 'weekday' ? 'work' : ''; draw(); }
        else if (a === 'trig' && el.dataset.c === 'kind') { ed.trigger = { kind: el.value, text: '', at: '07:30', days: [0, 1, 2, 3, 4] }; draw(); }
      });
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-sc]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
        const a = b.dataset.sc, id = b.dataset.id;
        if (a === 'new') ed = { id: uid(), name: 'Новый сценарий', trigger: { kind: 'manual' }, steps: [] };
        else if (a === 'tpl') { const t = JSON.parse(JSON.stringify(TEMPLATES[+b.dataset.i])); ed = Object.assign({ id: uid() }, t); }
        else if (a === 'edit') ed = JSON.parse(JSON.stringify(list.find(s => s.id === id)));
        else if (a === 'run') { run(list.find(s => s.id === id)); return; }
        else if (a === 'rm') { if (confirm('Удалить сценарий?')) { list = list.filter(s => s.id !== id); save(); } }
        else if (a === 'back') ed = null;
        else if (a === 'save') { const i = list.findIndex(s => s.id === ed.id); if (i < 0) list.push(ed); else list[i] = ed; save(); ed = null; }
        else if (a === 'test') { run(JSON.parse(JSON.stringify(ed))); return; }
        else if (a === 'day') { const d = +b.dataset.d, t = ed.trigger; t.days = t.days || []; t.days = t.days.includes(d) ? t.days.filter(x => x !== d) : t.days.concat(d); }
        else if (a === 'add') adding = b.dataset.p;
        else if (a === 'pick') {
          const p = dec(b.dataset.p), k = b.dataset.k; adding = '';
          get(p).push(k === 'if' ? { t: 'if', cond: { k: 'weekday', v: 'work' }, then: [], else: [] } : k === 'remind' ? { t: 'remind', min: 30, text: '' } : { t: k, text: '' });
        } else if (['up', 'dn', 'del'].includes(a)) {
          const p = dec(b.dataset.p), i = p.pop(), arr = get(p);
          if (a === 'del') arr.splice(i, 1);
          else { const j = a === 'up' ? i - 1 : i + 1; if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; }
        } else return;
        draw();
      });
    }
    draw();
  }
  O.scripts = { panel, match, run, list: () => list, templates: TEMPLATES };
})();
