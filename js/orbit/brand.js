/* Орбита 4 · БРЕНДЫ — четыре полноценные айдентики: название, логотип, палитра, форма, голос агента.
   Переключаются в Настройках → «Бренд и стиль» мгновенно, без перезагрузки. */
(function () {
  const O = window.Orbit = window.Orbit || {};
  const BRANDS = {
    orbit: { id: 'orbit', name: 'Орбита', tag: 'Школьный планер', agent: 'Орби', radius: 18, font: 'system', swatch: ['#8b5cf6', '#22d3ee'],
      hello: 'Привет', style: 'Аврора · стекло',
      d: { '--bg': '#090c17', '--bg-elevated': '#101528', '--bg-card': '#141a30', '--bg-card-hover': '#1a2240', '--text': '#eaf0ff', '--text-muted': '#93a1c4', '--text-dim': '#5d6c90', '--accent': '#8b5cf6', '--accent-2': '#22d3ee', '--accent-3': '#f59e0b', '--on-accent': '#ffffff' },
      l: { '--bg': '#eef1fb', '--bg-elevated': '#ffffff', '--bg-card': '#ffffff', '--bg-card-hover': '#f6f8ff', '--text': '#0f1530', '--text-muted': '#4a5578', '--text-dim': '#8d97b5', '--accent': '#6d4ae0', '--accent-2': '#0891b2', '--accent-3': '#d97706', '--on-accent': '#ffffff' } },
    ritm: { id: 'ritm', name: 'Ритм', tag: 'Твой день по минутам', agent: 'Бит', radius: 24, font: 'rounded', swatch: ['#14b8a6', '#a3e635'],
      hello: 'Хей', style: 'Мята · мягкие формы',
      d: { '--bg': '#06191a', '--bg-elevated': '#0b2426', '--bg-card': '#0f2b2d', '--bg-card-hover': '#143538', '--text': '#e6fbf6', '--text-muted': '#89b9b2', '--text-dim': '#587c78', '--accent': '#2dd4bf', '--accent-2': '#a3e635', '--accent-3': '#fb923c', '--on-accent': '#052524' },
      l: { '--bg': '#eefaf6', '--bg-elevated': '#ffffff', '--bg-card': '#ffffff', '--bg-card-hover': '#f3fcf9', '--text': '#0a2a29', '--text-muted': '#3f6b66', '--text-dim': '#86aaa4', '--accent': '#0d9488', '--accent-2': '#65a30d', '--accent-3': '#ea580c', '--on-accent': '#ffffff' } },
    vektor: { id: 'vektor', name: 'Вектор', tag: 'Расписание под контролем', agent: 'Вектор', radius: 7, font: 'tech', swatch: ['#c6f432', '#38bdf8'],
      hello: 'Статус', style: 'Графит · чёткие линии',
      d: { '--bg': '#0b0c0e', '--bg-elevated': '#131417', '--bg-card': '#17191d', '--bg-card-hover': '#1e2126', '--text': '#f1f3f5', '--text-muted': '#9aa1ab', '--text-dim': '#636a75', '--accent': '#c6f432', '--accent-2': '#38bdf8', '--accent-3': '#fb923c', '--on-accent': '#10130a' },
      l: { '--bg': '#f3f4f6', '--bg-elevated': '#ffffff', '--bg-card': '#ffffff', '--bg-card-hover': '#f8f9fa', '--text': '#111317', '--text-muted': '#555c66', '--text-dim': '#9aa1ab', '--accent': '#4d7c0f', '--accent-2': '#0284c7', '--accent-3': '#ea580c', '--on-accent': '#ffffff' } },
    zakat: { id: 'zakat', name: 'Закат', tag: 'Спокойный планер', agent: 'Лучик', radius: 22, font: 'soft', swatch: ['#fb7185', '#fbbf24'],
      hello: 'Здравствуй', style: 'Тёплый градиент',
      d: { '--bg': '#160c12', '--bg-elevated': '#20121b', '--bg-card': '#27161f', '--bg-card-hover': '#311c28', '--text': '#fff0ee', '--text-muted': '#c79aa3', '--text-dim': '#8a6670', '--accent': '#fb7185', '--accent-2': '#fbbf24', '--accent-3': '#c084fc', '--on-accent': '#2a0a12' },
      l: { '--bg': '#fff5f0', '--bg-elevated': '#ffffff', '--bg-card': '#ffffff', '--bg-card-hover': '#fff9f6', '--text': '#3a1620', '--text-muted': '#7d4b57', '--text-dim': '#b99099', '--accent': '#e11d48', '--accent-2': '#d97706', '--accent-3': '#9333ea', '--on-accent': '#ffffff' } }
  };
  O.brands = BRANDS;
  O.ACCENTS = [['violet', '#8b5cf6'], ['cyan', '#06b6d4'], ['emerald', '#10b981'], ['lime', '#84cc16'], ['amber', '#f59e0b'], ['orange', '#f97316'], ['rose', '#f43f5e'], ['pink', '#ec4899'], ['blue', '#3b82f6'], ['teal', '#14b8a6']];

  let uidn = 0;
  O.logo = (id, size = 32, c1, c2) => {
    const b = BRANDS[id] || BRANDS.orbit, a = c1 || b.swatch[0], z = c2 || b.swatch[1], g = 'lg' + (++uidn);
    const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${z}"/></linearGradient></defs>`;
    const body = {
      orbit: `<circle cx="24" cy="24" r="7.5" fill="url(#${g})"/><ellipse cx="24" cy="24" rx="19" ry="7.5" transform="rotate(-28 24 24)" fill="none" stroke="url(#${g})" stroke-width="2.6"/><circle cx="40.8" cy="15.1" r="3.3" fill="${z}"/>`,
      ritm: `<rect x="8" y="17" width="7" height="14" rx="3.5" fill="url(#${g})"/><rect x="20.5" y="8" width="7" height="32" rx="3.5" fill="url(#${g})"/><rect x="33" y="14" width="7" height="20" rx="3.5" fill="url(#${g})"/>`,
      vektor: `<path d="M9 13l15 24 15-24" fill="none" stroke="url(#${g})" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="8" r="3.2" fill="${z}"/>`,
      zakat: `<path d="M8 30a16 16 0 0 1 32 0z" fill="url(#${g})"/><path d="M24 7v4M10 13l3 3M38 13l-3 3M4 24h4M40 24h4" stroke="${z}" stroke-width="2.6" stroke-linecap="round"/><path d="M6 36h36M13 42h22" stroke="url(#${g})" stroke-width="2.8" stroke-linecap="round"/>`
    }[b.id];
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${body}</svg>`;
  };
  O.brand = () => BRANDS[(O.settings().brand)] || BRANDS.orbit;

  /* CSS брендов: генерируем из таблицы выше */
  (function inject() {
    const css = Object.values(BRANDS).map(b => {
      const dec = o => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');
      return `html[data-brand="${b.id}"]{${dec(b.d)}}html[data-brand="${b.id}"][data-theme="light"]{${dec(b.l)}}`;
    }).join('\n');
    const s = document.createElement('style'); s.id = 'o-brand-css'; s.textContent = css; document.head.appendChild(s);
  })();

  const hex2hsl = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; } return [hh, s * 100, l * 100]; };
  const lum = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return 0; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

  /* Применить внешний вид: бренд, тема, акцент, шрифт, движение, контраст… */
  O.look = function (st) {
    st = st || O.settings(); const R = document.documentElement, b = BRANDS[st.brand] || BRANDS.orbit;
    let theme = st.theme || 'dark', skin = '';
    if (theme === 'auto') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    if (theme === 'amoled') { theme = 'dark'; skin = 'amoled'; }
    R.setAttribute('data-theme', theme); R.setAttribute('data-skin', skin); R.setAttribute('data-brand', b.id);
    R.setAttribute('data-font', st.font && st.font !== 'system' ? st.font : b.font);
    const reduced = st.motion === 'reduced' || (st.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    R.setAttribute('data-motion', st.motion === 'off' ? 'off' : reduced ? 'reduced' : 'full');
    R.setAttribute('data-contrast', st.contrast === 'high' ? 'high' : 'normal');
    R.setAttribute('data-glass', st.glass === false ? 'off' : 'on');
    R.style.setProperty('--radius', ((st.radius && +st.radius !== 14) ? +st.radius : b.radius) + 'px');
    R.style.setProperty('--app-font-size', ((+st.fontSize || 16) * (+st.textScale || 100) / 100).toFixed(2) + 'px');
    // свой акцент: перекрашивает бренд
    const hs = hex2hsl(st.accentCustom);
    if (hs) {
      const [h, s, l] = hs, a2 = `hsl(${(h + 42) % 360} ${Math.min(90, s)}% ${Math.max(48, l)}%)`;
      R.style.setProperty('--accent', st.accentCustom); R.style.setProperty('--accent-2', a2);
      R.style.setProperty('--on-accent', lum(st.accentCustom) > .6 ? '#10130a' : '#ffffff');
    } else ['--accent', '--accent-2', '--on-accent'].forEach(k => R.style.removeProperty(k));
    // шапка, название, логотип
    document.title = `${b.name} — ${b.tag}`;
    document.querySelectorAll('[data-brand-name]').forEach(e => e.textContent = b.name);
    document.querySelectorAll('[data-brand-tag]').forEach(e => e.textContent = b.tag);
    const cs = getComputedStyle(R), a1 = cs.getPropertyValue('--accent').trim() || b.swatch[0], a2 = cs.getPropertyValue('--accent-2').trim() || b.swatch[1];
    document.querySelectorAll('[data-brand-logo]').forEach(e => e.innerHTML = O.logo(b.id, +e.dataset.brandLogo || 28, a1, a2));
    const fav = document.getElementById('o-favicon');
    if (fav) fav.href = 'data:image/svg+xml,' + encodeURIComponent(O.logo(b.id, 64, a1, a2).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = cs.getPropertyValue('--bg').trim() || '#0b0f1a';
    document.dispatchEvent(new CustomEvent('orbit:look', { detail: { brand: b } }));
  };
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (O.settings().theme === 'auto') O.look(); });
})();
