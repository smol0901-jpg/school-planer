/* Орбита 4 · ПРИВЫЧКИ — локальная «интуиция»: запоминает, что и когда вы делаете чаще всего,
   и подсказывает это в нужный час и день недели. Данные только на устройстве. */
(function () {
  const O = window.Orbit = window.Orbit || {};
  const KEY = 'orbit-habits-v1', CAP = 600;
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && Array.isArray(d.log) ? d : { log: [] }; } catch (e) { return { log: [] }; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const wk = d => d === 0 || d === 6;

  O.habits = {
    /* kind:key — например cmd:я освободился, tab:buses, call:<id> */
    rec(key, label, at) {
      if (O.settings().agentSuggest === false) return;
      const d = load(), t = at || new Date();
      d.log.push({ k: norm(key), l: label || key, t: t.getTime(), h: t.getHours(), w: t.getDay() });
      if (d.log.length > CAP) d.log.splice(0, d.log.length - CAP);
      save(d);
    },
    /* Что вероятнее всего понадобится сейчас: вес = свежесть × близость по часу × тот же день недели */
    top(now, o = {}) {
      const d = load(), prefix = o.prefix || '', lim = o.limit || 4, ex = new Set((o.exclude || []).map(norm));
      const nh = now.getHours(), nw = now.getDay(), map = new Map();
      for (const e of d.log) {
        if (prefix && !e.k.startsWith(prefix)) continue; if (ex.has(e.k)) continue;
        const age = (now.getTime() - e.t) / 864e5, w = Math.pow(.5, age / 21);
        const dh = Math.min(Math.abs(e.h - nh), 24 - Math.abs(e.h - nh));
        const tw = dh <= 1 ? 2.4 : dh <= 3 ? 1.3 : .35, dw = e.w === nw ? 1.5 : (wk(e.w) === wk(nw) ? 1 : .6);
        const m = map.get(e.k) || { key: e.k, label: e.l, score: 0, count: 0 };
        m.score += w * tw * dw; m.count++; m.label = e.l; map.set(e.k, m);
      }
      return [...map.values()].filter(m => m.count >= 2 || m.score >= 1.6).sort((a, b) => b.score - a.score).slice(0, lim);
    },
    all() { const d = load(), m = new Map(); d.log.forEach(e => { const x = m.get(e.k) || { key: e.k, label: e.l, count: 0 }; x.count++; m.set(e.k, x); }); return [...m.values()].sort((a, b) => b.count - a.count); },
    size() { return load().log.length; },
    clear() { save({ log: [] }); }
  };
})();
