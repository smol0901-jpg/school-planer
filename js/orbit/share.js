/* Орбита 4 · ОБМЕН — QR, файл .orbit, системное меню «Отправить» (Bluetooth / Nearby Share / AirDrop / мессенджеры),
   код, ссылка. Приём: камера, файл, вставка кода, ссылка, «Поделиться в Орбиту» из системы. */
(function () {
  const O = window.Orbit = window.Orbit || {}, ic = O.ic, esc = O.esc;
  const C = () => O.core(), S = () => C().state, $ = id => document.getElementById(id);
  const GROUPS = [['lessons', 'Уроки', 'book'], ['clubs', 'Кружки', 'star'], ['events', 'События', 'calendar'], ['buses', 'Автобусы', 'bus'], ['homework', 'Домашка', 'check'], ['goals', 'Цели', 'target'], ['notes', 'Заметки', 'note'], ['holidays', 'Каникулы', 'sun'], ['people', 'Контакты (с номерами)', 'phone'], ['profile', 'Профиль', 'users'], ['dayLogs', 'Дневник', 'edit']];
  const PRESETS = { schedule: ['lessons', 'clubs', 'events', 'buses', 'holidays'], all: GROUPS.map(g => g[0]), contacts: ['people'], school: ['lessons', 'clubs', 'buses', 'holidays', 'profile'] };
  const sh = O.ui.sh = O.ui.sh || { sel: Object.fromEntries(PRESETS.schedule.map(k => [k, true])), mode: 'send', out: null };
  let stream = null, timer = null;

  const build = () => {
    const s = S(), d = { app: 'orbit', version: C().version, exportedAt: new Date().toISOString() };
    for (const k in sh.sel) if (sh.sel[k] && s[k] !== undefined) d[k] = k === 'profile' ? { ...s.profile, photo: '' } : k === 'notes' ? s.notes.map(({ audio, audioMime, ...r }) => r) : s[k];
    return d;
  };
  const count = k => { const v = S()[k]; return Array.isArray(v) ? v.length : v ? 1 : 0; };
  O.share = {
    preset(name) { sh.sel = Object.fromEntries((PRESETS[name] || PRESETS.schedule).map(k => [k, true])); sh.out = null; sh.mode = 'send'; O.share.render(); },
    render() {
      const root = $('share-root'); if (!root) return; const total = Object.keys(sh.sel).filter(k => sh.sel[k]).length;
      const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'a.orbit', { type: 'application/json' })] }));
      const send = `<div class="o-card"><div class="o-card-h">${ic('share', 18)}<h3>Что отправить</h3><span class="o-count">${total}</span></div>
        <div class="o-presets">${[['schedule', 'Расписание + автобусы'], ['school', 'Для нового устройства'], ['all', 'Всё'], ['contacts', 'Только контакты']].map(([k, l]) => `<button class="o-chip" data-sh="preset:${k}">${l}</button>`).join('')}</div>
        <div class="o-sel">${GROUPS.map(([k, l, i]) => `<label class="o-selrow${sh.sel[k] ? ' on' : ''}"><input type="checkbox" data-shk="${k}"${sh.sel[k] ? ' checked' : ''}>${ic(i, 16)}<span>${l}</span><em>${count(k)}</em></label>`).join('')}</div>
        ${sh.sel.people ? `<div class="o-note warn">${ic('alert', 13)} В отправку попадут телефоны контактов. Отправляйте только тем, кому доверяете.</div>` : ''}</div>
        <div class="o-card"><div class="o-card-h">${ic('send', 18)}<h3>Чем поделиться</h3></div><div class="o-chan">
        <button class="o-ch" data-sh="qr" ${total ? '' : 'disabled'}>${ic('qr', 26)}<b>QR-код</b><small>Покажите экран</small></button>
        <button class="o-ch" data-sh="file" ${total ? '' : 'disabled'}>${ic('file', 26)}<b>Файл .orbit</b><small>JSON-файл</small></button>
        <button class="o-ch hot" data-sh="native" ${total ? '' : 'disabled'}>${ic('bluetooth', 26)}<b>Отправить…</b><small>${canShareFiles ? 'Bluetooth, Nearby, AirDrop' : 'Системное меню'}</small></button>
        <button class="o-ch" data-sh="code" ${total ? '' : 'disabled'}>${ic('copy', 26)}<b>Код</b><small>В мессенджер</small></button>
        <button class="o-ch" data-sh="link" ${total ? '' : 'disabled'}>${ic('link', 26)}<b>Ссылка</b><small>Откроется в Орбите</small></button>
        <button class="o-ch" data-sh="mode:receive">${ic('download', 26)}<b>Принять</b><small>Скан, файл, код</small></button></div>
        <div class="o-note">${ic('info', 13)} Bluetooth: браузер не умеет слать файлы по Bluetooth напрямую. Нажмите «Отправить…» и в системном меню выберите Bluetooth (Android), AirDrop (iPhone/Mac) или Nearby Share.</div>
        <div id="sh-out">${sh.out || ''}</div></div>`;
      const recv = `<div class="o-card"><div class="o-card-h">${ic('download', 18)}<h3>Принять данные</h3><button class="o-link" data-sh="mode:send">К отправке</button></div><div class="o-chan">
        <button class="o-ch hot" data-sh="scan">${ic('qr', 26)}<b>Сканировать QR</b><small>Камера</small></button>
        <button class="o-ch" data-sh="pick">${ic('file', 26)}<b>Открыть файл</b><small>.orbit или .json</small></button>
        <button class="o-ch" data-sh="paste">${ic('copy', 26)}<b>Вставить код</b><small>Из буфера</small></button></div>
        <video id="sh-video" class="o-video hidden" playsinline muted></video><div id="sh-scan-ctl"></div>
        <textarea class="textarea hidden" id="sh-paste" rows="4" placeholder="Вставьте код OR3G|… или JSON"></textarea><button class="o-btn hidden" id="sh-paste-go">Проверить и импортировать</button>
        <input type="file" id="sh-file" accept=".orbit,.json,application/json" class="hidden"></div>`;
      root.innerHTML = sh.mode === 'receive' ? recv : send;
      const f = $('sh-file'); if (f) f.onchange = async () => { const file = f.files[0]; if (file) O.share.importText(await file.text()); f.value = ''; };
      const go = $('sh-paste-go'); if (go) go.onclick = () => O.share.importText($('sh-paste').value);
    },
    async payload() { return C().encodePayload(build()); },
    async importText(text) {
      try { const data = await C().decodePayload(String(text || '').trim()); O.share.preview(data); }
      catch (e) { C().toast('Не удалось прочитать: ' + e.message, 3500); }
    },
    preview(data) {
      if (!data || typeof data !== 'object') return C().toast('Неверный формат');
      const keys = GROUPS.filter(g => data[g[0]] !== undefined), core = C();
      if (!keys.length) return core.toast('Это не данные Орбиты');
      core.openModal('Импорт данных', `<p class="o-muted">В файле найдено:</p><ul class="o-imp">${keys.map(([k, l, i]) => `<li>${ic(i, 16)}<span>${l}</span><b>${Array.isArray(data[k]) ? data[k].length : 1}</b></li>`).join('')}</ul>
        <label class="o-sw"><input type="radio" name="imp" value="merge" checked><i></i><span><b>Объединить</b> — добавить к моим данным</span></label>
        <label class="o-sw"><input type="radio" name="imp" value="replace"><i></i><span><b>Заменить</b> выбранные разделы</span></label>
        <p class="o-note">${ic('info', 13)} Перед импортом автоматически сохраняется резервная копия — её можно вернуть в Настройки → Данные.</p>`, `<button class="btn btn-secondary" onclick="OrbitCore.closeModal()">Отмена</button><button class="btn btn-primary" id="imp-go">Импортировать</button>`);
      $('imp-go').onclick = () => {
        O.backup && O.backup.snapshot('перед импортом');
        const mode = document.querySelector('input[name=imp]:checked').value;
        if (mode === 'merge') core.applyImportedData(data);
        else { const next = { ...S() }; keys.forEach(([k]) => { next[k] = data[k]; }); core.setState(next); }
        core.closeModal(); core.toast('Данные импортированы'); core.switchTab('today');
      };
    },
    stopScan() { if (timer) clearInterval(timer); timer = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; const v = $('sh-video'); if (v) { v.classList.add('hidden'); v.srcObject = null; } },
    async scan() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = $('sh-video'); v.srcObject = stream; v.classList.remove('hidden'); await v.play();
        $('sh-scan-ctl').innerHTML = `<button class="o-btn ghost" data-sh="stop">Остановить</button>`;
        const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }), det = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
        timer = setInterval(async () => {
          if (v.readyState !== v.HAVE_ENOUGH_DATA) return; cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0);
          let val = null;
          if (det) { try { const r = await det.detect(cv); if (r[0]) val = r[0].rawValue; } catch (e) {} }
          if (!val && typeof jsQR === 'function') { const im = cx.getImageData(0, 0, cv.width, cv.height), c = jsQR(im.data, im.width, im.height, { inversionAttempts: 'dontInvert' }); if (c) val = c.data; }
          if (val) { O.vibrate(40); O.share.stopScan(); O.share.importText(val); }
        }, 350);
      } catch (e) { C().toast('Нет доступа к камере. Откройте файл или вставьте код.', 3500); }
    }
  };

  const outBox = html => { sh.out = html; const o = $('sh-out'); if (o) o.innerHTML = html; };
  async function act(a, v) {
    const core = C();
    if (a === 'preset') return O.share.preset(v);
    if (a === 'mode') { O.share.stopScan(); sh.mode = v; sh.out = null; return O.share.render(); }
    if (a === 'scan') return O.share.scan();
    if (a === 'stop') { O.share.stopScan(); return O.share.render(); }
    if (a === 'pick') return $('sh-file').click();
    if (a === 'paste') { $('sh-paste').classList.remove('hidden'); $('sh-paste-go').classList.remove('hidden'); try { const t = await navigator.clipboard.readText(); if (t) $('sh-paste').value = t; } catch (e) {} return; }
    const data = build(), stamp = new Date().toISOString().slice(0, 10), json = JSON.stringify(data);
    if (a === 'file') { O.download(new Blob([json], { type: 'application/json' }), `orbit-${stamp}.orbit`); return core.toast('Файл сохранён'); }
    if (a === 'native') {
      const file = new File([json], `orbit-${stamp}.orbit`, { type: 'application/json' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Данные ' + O.brand().name, text: 'Файл для импорта в ' + O.brand().name }); return; }
        if (navigator.share) { await navigator.share({ title: 'Данные ' + O.brand().name, text: await O.share.payload() }); return; }
      } catch (e) { if (e.name === 'AbortError') return; }
      O.download(new Blob([json], { type: 'application/json' }), `orbit-${stamp}.orbit`); return core.toast('Системное меню недоступно — сохранил файл');
    }
    if (a === 'code') { const p = await O.share.payload(); try { await navigator.clipboard.writeText(p); core.toast('Код скопирован — вставьте в мессенджер'); } catch (e) { outBox(`<textarea class="textarea" rows="4" readonly>${esc(p)}</textarea>`); } return; }
    if (a === 'link') { const p = await O.share.payload(); if (!/^https?:/.test(location.protocol)) return core.toast('Ссылки работают, когда приложение открыто по адресу сайта'); const url = location.origin + location.pathname + '#import=' + encodeURIComponent(p); if (url.length > 7000) return core.toast('Данных слишком много для ссылки — используйте файл'); try { await navigator.clipboard.writeText(url); core.toast('Ссылка скопирована'); } catch (e) { outBox(`<textarea class="textarea" rows="3" readonly>${esc(url)}</textarea>`); } return; }
    if (a === 'qr') {
      const p = await O.share.payload(); if (typeof qrcode === 'undefined') return core.toast('Генератор QR не загрузился');
      if (p.length > 2500) return outBox(`<div class="o-note warn">${ic('alert', 13)} Данных слишком много для одного QR (${p.length} символов). Выберите меньше разделов или отправьте файлом.</div>`);
      const qr = qrcode(0, p.length > 1200 ? 'L' : 'M'); qr.addData(p); qr.make();
      outBox(`<div class="o-qr">${qr.createSvgTag(4, 6)}<small>Другое устройство: Обмен → Принять → Сканировать QR · ${p.length} симв.</small></div>`);
    }
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-sh]'); if (b && b.closest('#share-root')) { O.vibrate(8); const [a, ...r] = b.dataset.sh.split(':'); act(a, r.join(':')); } });
  document.addEventListener('change', e => { const c = e.target.closest('[data-shk]'); if (c) { sh.sel[c.dataset.shk] = c.checked; sh.out = null; O.share.render(); } });
})();
