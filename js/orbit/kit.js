/* Орбита 4 · КИТ — иконки и мелкие помощники интерфейса */
(function () {
  const O = window.Orbit = window.Orbit || {};
  const P = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    bus: '<path d="M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 11h16M7 18v2.5M17 18v2.5"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/>',
    sparkle: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.7c2.4.5 4 2.3 4 5.3"/>',
    phone: '<path d="M5 4h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 5 5l1.4-2.3L19 14.5V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    share: '<circle cx="18" cy="5.5" r="2.8"/><circle cx="6" cy="12" r="2.8"/><circle cx="18" cy="18.5" r="2.8"/><path d="M8.5 10.7l7-3.9M8.5 13.3l7 3.9"/>',
    qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h2.5v2.5H14zM19 14h1.5M14 19h1.5M18 18h2.5v2.5"/>',
    file: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8zM14 3v5h5"/>',
    bluetooth: '<path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bag: '<path d="M8.5 7.5V6a3.5 3.5 0 0 1 7 0v1.5M5.5 7.5h13a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1zM9 14h6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevR: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    chevD: '<path d="M5.5 9l6.5 6.5L18.5 9"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    alert: '<path d="M12 4l9.5 16.5h-19zM12 10v4.5M12 17.5h.01"/>',
    send: '<path d="M4 12l16-8-6 16-2.6-6.4z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    kanban: '<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="16.5" y="4" width="4" height="6" rx="1.5"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10"/>',
    edit: '<path d="M4 20l4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16z"/>',
    note: '<path d="M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5zM8 9h8M8 13h8M8 17h5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    sos: '<path d="M12 3l8 3.5V12c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6.5z"/><path d="M12 8v5M12 16h.01"/>',
    message: '<path d="M4 5.5h16v11H9.5L5 20.5v-4H4z"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7.5l8.5 6 8.5-6"/>',
    pin: '<path d="M12 21s7-5.7 7-11.5a7 7 0 1 0-14 0C5 15.300 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
    star: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>',
    trash: '<path d="M5 7h14M10 4h4M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
    gift: '<path d="M4 11h16v9.5H4zM3 7.5h18V11H3zM12 7.5v13M12 7.5C9.5 7.500 8 6.500 8 5.200a2 2 0 0 1 4 0 2 2 0 0 1 4 0c0 1.300-1.500 2.300-4 2.300z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.400 0 2-.900 2-1.800 0-1.500-1.200-1.600-1.200-2.800 0-1 .8-1.600 1.800-1.600H17a4 4 0 0 0 4-4C21 6.500 17 3 12 3z"/><circle cx="7.500" cy="11.500" r="1"/><circle cx="10" cy="7.500" r="1"/><circle cx="14.500" cy="7.500" r="1"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.500"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.500-3.500L4 9M4 4v5h5M4 13a8 8 0 0 0 14.500 3.500L20 15M20 20v-5h-5"/>',
    school: '<path d="M2.500 9.500L12 5l9.500 4.500L12 14zM6.500 11.800V16c0 1.700 2.500 3 5.500 3s5.500-1.300 5.500-3v-4.200M21.500 9.500V15"/>',
    undo: '<path d="M4 8.500h10a5.500 5.500 0 0 1 0 11H8M4 8.500L8 4.500M4 8.500l4 4"/>',
    walk: '<circle cx="13" cy="4.500" r="1.800"/><path d="M9.500 21l2.200-6-2.700-2.800 1.200-4.700 3.300 2.300 2.800.9M11.700 15l3.300 2.300.8 3.700"/>',
    home2: '<path d="M4 20V10l8-6 8 6v10zM10 20v-5h4v5"/>',
    wifi: '<path d="M2.500 9a14 14 0 0 1 19 0M5.500 12.500a9.500 9.500 0 0 1 13 0M8.800 16a5 5 0 0 1 6.400 0"/><circle cx="12" cy="19" r=".8"/>',
    print: '<path d="M7 9V3.500h10V9M7 17H5a1.500 1.500 0 0 1-1.500-1.500v-5A1.500 1.500 0 0 1 5 9h14a1.500 1.500 0 0 1 1.500 1.500v5A1.500 1.500 0 0 1 19 17h-2M7 14h10v6.500H7z"/>',
    flame: '<path d="M12 3c1 3.500 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.500 1 2 1.800 2C10.500 8 11 5.500 12 3z"/>',
    eye: '<path d="M2 12s3.600-6.500 10-6.500S22 12 22 12s-3.600 6.500-10 6.500S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  const fix = s => s;
  O.ic = (name, size = 20, sw = 1.8) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${fix(P[name] || P.info)}</svg>`;
  O.icons = Object.keys(P);

  O.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  O.digits = p => { const t = String(p || '').trim(); const plus = t.startsWith('+') ? '+' : ''; return plus + t.replace(/[^\d]/g, ''); };
  const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
  O.colorFor = s => { let h = 0; for (const ch of String(s || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  O.initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  O.avatar = (p, size = 44) => `<span class="o-av" style="--c:${O.esc(p.color || O.colorFor(p.name))};width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px">${O.esc(O.initials(p.name))}</span>`;
  O.ring = (pct, size = 96, sw = 8, inner = '') => {
    const r = (size - sw) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct || 0));
    return `<div class="o-ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="o-ring-bg" stroke-width="${sw}" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="o-ring-fg" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><div class="o-ring-in">${inner}</div></div>`;
  };
  O.vibrate = ms => { try { if (O.settings && O.settings().haptics !== false && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  O.settings = () => (window.OrbitCore ? window.OrbitCore.state.settings : {});
  O.core = () => window.OrbitCore;
  O.plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return (n > 10 && n < 20) ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
})();
