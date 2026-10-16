/* Орбита 4.3 · LLM-провайдеры: GigaChat, Grok, DeepSeek, Claude, OpenAI / custom */
(function () {
  const O = window.Orbit = window.Orbit || {};
  const C = () => O.core();
  const S = () => C().state;

  const PROVIDERS = {
    giga: {
      id: 'giga',
      name: 'GigaChat (Сбер)',
      hint: 'OAuth Client ID + Secret → Access token (30 мин). Scope: GIGACHAT_API_PERS',
      oauthUrl: 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
      chatUrl: 'https://api.giga.chat/v1/chat/completions',
      models: ['GigaChat', 'GigaChat-Pro', 'GigaChat-Max', 'GigaChat-3-Ultra'],
      defaultModel: 'GigaChat',
      needsOAuth: true,
      corsNote: 'Браузер может блокировать запросы к api.giga.chat (CORS). Тогда укажите прокси в «Proxy URL».'
    },
    grok: {
      id: 'grok',
      name: 'Grok (xAI)',
      hint: 'OpenAI-совместимый API xAI',
      chatUrl: 'https://api.x.ai/v1/chat/completions',
      models: ['grok-2', 'grok-2-latest', 'grok-3', 'grok-3-mini'],
      defaultModel: 'grok-2-latest',
      needsOAuth: false
    },
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek',
      hint: 'OpenAI-совместимый API',
      chatUrl: 'https://api.deepseek.com/chat/completions',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      needsOAuth: false
    },
    claude: {
      id: 'claude',
      name: 'Claude (Anthropic)',
      hint: 'Messages API, заголовок x-api-key',
      chatUrl: 'https://api.anthropic.com/v1/messages',
      models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
      defaultModel: 'claude-sonnet-4-20250514',
      needsOAuth: false,
      format: 'anthropic'
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      hint: 'api.openai.com',
      chatUrl: 'https://api.openai.com/v1/chat/completions',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
      defaultModel: 'gpt-4o-mini',
      needsOAuth: false
    },
    custom: {
      id: 'custom',
      name: 'Другая (OpenAI-совместимая)',
      hint: 'Любой endpoint …/chat/completions + Bearer key',
      chatUrl: '',
      models: [],
      defaultModel: 'gpt-4o-mini',
      needsOAuth: false
    }
  };
  O.llmProviders = PROVIDERS;

  function cfg() {
    const s = (S().settings || {});
    let provider = s.llmProvider || 'custom';
    let proxy = (s.llmProxy || '').trim();
    // Proxy только полный URL; «api.giga.chat» без схемы — ошибка пользователя, игнор
    if (proxy && !/^https?:\/\//i.test(proxy)) proxy = '';
    const clientId = (s.llmClientId || '').trim();
    const clientSecret = (s.llmClientSecret || '').trim();
    const authKey = (s.llmAuthKey || '').trim();
    return {
      provider,
      enabled: !!s.llmEnabled,
      endpoint: (s.llmEndpoint || '').trim(),
      key: (s.llmKey || '').trim(),
      model: (s.llmModel || '').trim(),
      clientId,
      clientSecret,
      scope: (s.llmScope || 'GIGACHAT_API_PERS').trim() || 'GIGACHAT_API_PERS',
      proxy,
      authKey,
      proxyRaw: (s.llmProxy || '').trim()
    };
  }

  function applyProviderDefaults(id) {
    const p = PROVIDERS[id] || PROVIDERS.custom;
    const s = S().settings;
    const prev = s.llmProvider || 'custom';
    if (prev !== p.id) {
      // у каждого провайдера свой ключ (чтобы ключ OpenAI не уходил в DeepSeek и т. п.)
      s.llmKeys = s.llmKeys || {};
      s.llmKeys[prev] = s.llmKey || '';
      s.llmKey = s.llmKeys[p.id] || '';
      if (prev === 'custom') s.llmEndpointCustom = s.llmEndpoint || '';
      if (p.id === 'custom') s.llmEndpoint = s.llmEndpointCustom || '';
    }
    s.llmProvider = p.id;
    if (p.chatUrl) s.llmEndpoint = p.chatUrl;
    if (p.defaultModel) s.llmModel = p.defaultModel;
    if (p.id === 'giga') {
      s.llmScope = s.llmScope || 'GIGACHAT_API_PERS';
      // Proxy не должен быть доменом API
      if (s.llmProxy && /giga\.chat|sberbank/i.test(s.llmProxy) && !/^https?:\/\/.+\/proxy/i.test(s.llmProxy))
        s.llmProxy = '';
    }
    C().save();
  }
  O.llmApplyProvider = applyProviderDefaults;

  /* GigaChat OAuth token cache */
  let gigaTok = { token: '', exp: 0 };
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function basicAuth(c) {
    if (c.authKey) return c.authKey.replace(/^Basic\s+/i, '');
    const pair = c.clientId + ':' + c.clientSecret;
    try { return btoa(pair); } catch (e) {
      return btoa(unescape(encodeURIComponent(pair)));
    }
  }
  async function gigaAccessToken(c) {
    if (gigaTok.token && Date.now() < gigaTok.exp - 60000) return gigaTok.token;
    const oauth = c.proxy
      ? (c.proxy.replace(/\/$/, '') + '/oauth')
      : PROVIDERS.giga.oauthUrl;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': uuid(),
      'Authorization': 'Basic ' + basicAuth(c)
    };
    const body = 'scope=' + encodeURIComponent(c.scope || 'GIGACHAT_API_PERS');
    const res = await fetch(oauth, { method: 'POST', headers, body });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('GigaChat OAuth ' + res.status + (t ? ': ' + t.slice(0, 200) : ''));
    }
    const data = await res.json();
    gigaTok = {
      token: data.access_token,
      exp: data.expires_at ? Number(data.expires_at) : (Date.now() + 25 * 60 * 1000)
    };
    if (gigaTok.exp < 1e12) gigaTok.exp = gigaTok.exp * 1000; // seconds → ms if needed
    return gigaTok.token;
  }

  function chatUrl(c) {
    if (c.proxy) {
      const base = c.proxy.replace(/\/$/, '');
      if (c.provider === 'giga') return base + '/chat/completions';
      return base;
    }
    if (c.endpoint) return c.endpoint;
    const p = PROVIDERS[c.provider];
    return (p && p.chatUrl) || '';
  }

  function systemPrompt(userExtra) {
    const skillList = ((O.actions && O.actions.SKILLS) || [])
      .map(sk => sk.id + ': ' + ((sk.examples && sk.examples[0]) || sk.label)).join('\n');
    return `Ты маршрутизатор школьного планера «Орбита». Пользователь пишет на русском.
Ответь ТОЛЬКО JSON без markdown:
{"skill":"<id>","slots":{},"command":"<готовая команда на русском или пусто>","reply":"<краткий текст если не команда>"}
Доступные skill id:
${skillList}
Если это управление планером — заполни command (пример: "добавь урок Математика пн 8:30").
Если обычный вопрос — skill:"help" и reply.
${userExtra || ''}`;
  }

  async function chatOpenAI(url, token, model, system, user) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: String(user).slice(0, 800) }
        ],
        temperature: 0.2,
        max_tokens: 400
      })
    });
    return res;
  }

  async function chatClaude(url, key, model, system, user) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: String(user).slice(0, 800) }]
      })
    });
    return res;
  }

  function extractText(data, format) {
    if (!data) return '';
    if (format === 'anthropic') {
      const parts = data.content || [];
      return parts.map(p => p.text || '').join('').trim();
    }
    return (
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      data.content || data.output_text || ''
    );
  }

  /**
   * @returns {Promise<{ok:boolean, text?:string, error?:string, provider?:string}>}
   */
  O.llmChat = async function (userText, opts) {
    const c = cfg();
    if (!c.enabled) return { ok: false, error: 'disabled' };
    const p = PROVIDERS[c.provider] || PROVIDERS.custom;
    const model = c.model || p.defaultModel || 'gpt-4o-mini';
    const system = systemPrompt(opts && opts.systemExtra);
    const url = chatUrl(c);
    if (!url && c.provider !== 'giga') return { ok: false, error: 'Не указан API Endpoint.' };

    try {
      let res;
      if (c.provider === 'giga') {
        if (!c.clientId && !c.authKey) return { ok: false, error: 'Для GigaChat нужны Client ID и Client Secret (или Authorization Key) в Настройках → Агент.' };
        const token = await gigaAccessToken(c);
        const u = url || PROVIDERS.giga.chatUrl;
        res = await chatOpenAI(u, token, model, system, userText);
      } else if (c.provider === 'claude' || p.format === 'anthropic') {
        if (!c.key) return { ok: false, error: 'Нужен API Key Anthropic.' };
        res = await chatClaude(url, c.key, model, system, userText);
      } else {
        if (!c.key) return { ok: false, error: 'Нужен API Key.' };
        if (!url) return { ok: false, error: 'Не указан endpoint.' };
        res = await chatOpenAI(url, c.key, model, system, userText);
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        let msg = 'Ошибка ' + res.status;
        if (res.status === 0 || res.type === 'opaque') msg = 'Сеть/CORS. Для GigaChat часто нужен прокси.';
        else if (t) msg += ': ' + t.slice(0, 180);
        if (p.corsNote && (res.status === 0 || res.status === 403 || res.status === 401)) msg += ' ' + p.corsNote;
        return { ok: false, error: msg, provider: c.provider };
      }
      const data = await res.json();
      const text = String(extractText(data, p.format) || '').trim();
      return { ok: true, text, provider: c.provider, raw: data };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      const cors = /Failed to fetch|NetworkError|CORS/i.test(msg);
      return {
        ok: false,
        error: cors
          ? ('Сеть или CORS: ' + msg + (p.corsNote ? ' — ' + p.corsNote : ' Попробуйте Proxy URL или расширение без CORS для разработки.'))
          : msg,
        provider: c.provider
      };
    }
  };

  O.llmReady = function () {
    const c = cfg();
    if (!c.enabled) return false;
    if (c.provider === 'giga') return !!(c.authKey || (c.clientId && c.clientSecret));
    if (c.provider === 'custom') return !!(c.endpoint && c.key);
    return !!c.key;
  };


  O.llmDiagnose = function () {
    const c = cfg();
    const tips = [];
    if (!c.enabled) tips.push('Включите «Запросы к нейросети по API».');
    if (c.proxyRaw && !c.proxy)
      tips.push('Proxy URL должен начинаться с https://. Оставьте пустым, если прокси нет. Не пишите api.giga.chat.');
    if (c.provider === 'giga') {
      if (!c.authKey && !(c.clientId && c.clientSecret))
        tips.push('Для GigaChat нужны Client ID и Client Secret (или Authorization Key).');
      if (!c.proxy)
        tips.push('Без Proxy URL браузер часто блокирует GigaChat (CORS). Ключи могут быть верными.');
    }
    return tips;
  };

  /**
   * Пошаговая проверка. Возвращает { ok, steps:[{id,title,ok,detail}], summary }
   */
  O.llmTest = async function () {
    const c = cfg();
    const steps = [];
    const add = (id, title, ok, detail) => steps.push({ id, title, ok: !!ok, detail: String(detail || '') });

    // 1. Включено
    if (!c.enabled) {
      add('enable', 'API включён', false, 'Выключите выключатель «Запросы к нейросети по API» → включите.');
      return { ok: false, steps, summary: 'Сначала включите запросы к нейросети.' };
    }
    add('enable', 'API включён', true, 'Ок');

    // 2. Провайдер
    const p = PROVIDERS[c.provider] || PROVIDERS.custom;
    add('provider', 'Провайдер', true, p.name + ' (' + c.provider + ')');

    // 3. Учётные данные
    if (c.provider === 'giga') {
      if (c.authKey) add('creds', 'Учётные данные GigaChat', true, 'Authorization Key задан');
      else if (c.clientId && c.clientSecret) add('creds', 'Учётные данные GigaChat', true, 'Client ID и Secret заданы');
      else {
        add('creds', 'Учётные данные GigaChat', false, 'Нет Client ID+Secret и нет Authorization Key. Вставьте из Sber Studio → Настройки API.');
        return { ok: false, steps, summary: 'Не хватает ключей GigaChat.' };
      }
      if (c.proxyRaw && !c.proxy) {
        add('proxy', 'Proxy URL', false, '«' + c.proxyRaw + '» — неверный формат. Нужен https://… или пусто. api.giga.chat — это не прокси.');
        return { ok: false, steps, summary: 'Исправьте Proxy URL.' };
      }
      if (c.proxy) add('proxy', 'Proxy URL', true, c.proxy);
      else add('proxy', 'Proxy URL', true, 'Пусто (прямые запросы). На iPhone/Safari часто нужен свой прокси из‑за CORS.');
    } else if (c.provider === 'custom') {
      if (!c.endpoint) {
        add('endpoint', 'Endpoint', false, 'Укажите полный URL …/chat/completions');
        return { ok: false, steps, summary: 'Нет endpoint.' };
      }
      add('endpoint', 'Endpoint', true, c.endpoint);
      if (!c.key) {
        add('creds', 'API Key', false, 'Вставьте ключ API');
        return { ok: false, steps, summary: 'Нет API Key.' };
      }
      add('creds', 'API Key', true, 'Задан');
    } else {
      if (!c.key) {
        add('creds', 'API Key', false, 'Вставьте ключ для ' + p.name);
        return { ok: false, steps, summary: 'Нет API Key.' };
      }
      add('creds', 'API Key', true, 'Задан (' + p.name + ')');
      const url = chatUrl(c);
      if (!url) {
        add('endpoint', 'Endpoint', false, 'Нет URL. Выберите пресет ещё раз.');
        return { ok: false, steps, summary: 'Нет endpoint.' };
      }
      add('endpoint', 'Endpoint', true, url);
    }

    // 4. Модель
    const model = c.model || p.defaultModel || '—';
    add('model', 'Модель', !!model && model !== '—', model || 'Не указана');

    // 5. Сеть: OAuth для giga или короткий chat
    try {
      if (c.provider === 'giga') {
        add('oauth', 'OAuth Access token', null, 'Запрос…');
        try {
          const token = await gigaAccessToken(c);
          // replace last oauth step
          steps[steps.length - 1] = { id: 'oauth', title: 'OAuth Access token', ok: true, detail: 'Токен получен (действует ~30 мин)' };
        } catch (e) {
          const msg = (e && e.message) || String(e);
          let detail = msg;
          if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg))
            detail = 'Сеть/CORS: браузер заблокировал запрос к ngw.devices.sberbank.ru. Ключи могут быть верными. Нужен Proxy URL на вашем сервере или другой браузер/окружение.';
          else if (/401|403|credentials/i.test(msg))
            detail = 'Отказ авторизации: проверьте Client ID, Secret или Authorization Key. При утечке перевыпустите ключ в Studio.';
          else if (/400|422/i.test(msg))
            detail = 'Неверный запрос OAuth: Scope должен быть GIGACHAT_API_PERS. ' + msg;
          steps[steps.length - 1] = { id: 'oauth', title: 'OAuth Access token', ok: false, detail };
          return { ok: false, steps, summary: 'OAuth не прошёл — см. шаг выше.' };
        }
      }

      // 6. Короткий chat
      const t0 = Date.now();
      const result = await O.llmChat('ответь одним словом: ок', {
        systemExtra: 'Ответь ТОЛЬКО JSON: {"skill":"help","command":"","reply":"ок"}'
      });
      const ms = Date.now() - t0;
      if (!result.ok) {
        let detail = result.error || 'ошибка';
        if (/Failed to fetch|Load failed|NetworkError|CORS/i.test(detail))
          detail = 'Сеть/CORS при chat/completions. Для GigaChat без своего https-прокси из Safari это ожидаемо. Endpoint: ' + (chatUrl(c) || '—');
        else if (/401|Unauthorized|Token/i.test(detail))
          detail = 'Ключ или токен отклонён (401). Проверьте API Key / переполучите OAuth. ' + detail;
        else if (/404/i.test(detail))
          detail = 'Неверный URL endpoint (404). Выберите пресет заново. ' + detail;
        else if (/429/i.test(detail))
          detail = 'Слишком много запросов (429). Подождите минуту.';
        add('chat', 'Пробный запрос к модели', false, detail);
        return { ok: false, steps, summary: 'Модель не ответила — см. шаг «Пробный запрос».' };
      }
      add('chat', 'Пробный запрос к модели', true, 'Ответ за ' + ms + ' мс: «' + String(result.text || '').slice(0, 80) + '»');
      return { ok: true, steps, summary: 'Всё работает. Агент может вызывать нейросеть.' };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      add('chat', 'Пробный запрос к модели', false, /fetch|Load failed|CORS/i.test(msg)
        ? 'Сеть/CORS: ' + msg
        : msg);
      return { ok: false, steps, summary: 'Сбой проверки.' };
    }
  };
})();
