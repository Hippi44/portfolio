/* ===========================================================================
   Hippilokkery, лендинг. Чистый JavaScript, без зависимостей.

   Модули: тема, мобильное меню, аккордеон, появление при скролле,
   лента стека, форма с отправкой в Telegram, копирование в буфер.

   Отправка формы: собираем текст заявки, открываем
   https://t.me/Hippilokkery?text=<urlencoded> с уже готовым сообщением
   и параллельно копируем текст в буфер как запасной путь.
   Официальная схема глубоких ссылок: core.telegram.org/api/links.
   Telegram намеренно не отправляет сообщение сам, он только подставляет
   его в поле ввода, поэтому последнее нажатие всегда за клиентом.

   Заметка про прокрутку: слушателей scroll на странице нет.
   Состояние шапки и анимации построены на IntersectionObserver.
   =========================================================================== */

(function () {
  'use strict';

  var TG_USER = 'Hippilokkery';
  var TG_CHAT_URL = 'https://t.me/' + TG_USER;
  var MAX_URL_LENGTH = 1800;      // глубокая ссылка не резиновая, длину держим сами
  var THEME_KEY = 'hl-theme';

  var root = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function $(id) { return document.getElementById(id); }

  /* -------------------------------------------------------------------------
     1. ТЕМА. Переключатель меняет атрибут на <html> и запоминает выбор.
        Без сохранённого выбора сайт следует за системой (см. скрипт в <head>).
  ------------------------------------------------------------------------- */

  var themeToggle = $('theme-toggle');

  function describeThemeButton() {
    // подпись обещает результат клика, а не описывает текущее состояние
    themeToggle.setAttribute(
      'aria-label',
      root.dataset.theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'
    );
  }

  if (themeToggle) {
    describeThemeButton();
    themeToggle.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch (e) { /* приватный режим */ }
      describeThemeButton();
    });
  }

  /* -------------------------------------------------------------------------
     2. МОБИЛЬНОЕ МЕНЮ. Панель на весь экран, скролл страницы блокируется.
        Esc и клик по ссылке закрывают, на десктопе закрывается само.
  ------------------------------------------------------------------------- */

  var navToggle = $('nav-toggle');
  var mobileNav = $('mobile-nav');
  var lastFocused = null;

  function setNav(open, restoreFocus) {
    if (!mobileNav) return;
    mobileNav.hidden = !open;
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);

    if (open) {
      lastFocused = document.activeElement;
      var first = mobileNav.querySelector('a');
      if (first) first.focus();
      return;
    }
    // после клика по ссылке фокус возвращать не нужно: человек уходит в секцию
    if (restoreFocus && lastFocused && lastFocused.isConnected) lastFocused.focus();
    lastFocused = null;
  }

  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      setNav(mobileNav.hidden, true);
    });

    mobileNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false, false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !mobileNav.hidden) setNav(false, true);
    });

    // меню открыли на телефоне, потом развернули окно: панель уже не нужна
    var desktopQuery = window.matchMedia('(min-width: 1024px)');
    var onWidthChange = function () { if (desktopQuery.matches) setNav(false, false); };
    if (typeof desktopQuery.addEventListener === 'function') {
      desktopQuery.addEventListener('change', onWidthChange);
    } else if (typeof desktopQuery.addListener === 'function') {
      desktopQuery.addListener(onWidthChange);   // Safari до 14
    }
  }

  /* -------------------------------------------------------------------------
     3. АККОРДЕОН. Раскрыт всегда ровно один пункт.
        Панели скрыты атрибутом hidden, поэтому без JS текст остаётся в DOM.
  ------------------------------------------------------------------------- */

  var accordion = $('accordion');
  if (accordion) {
    var triggers = Array.prototype.slice.call(accordion.querySelectorAll('.acc-trigger'));

    triggers.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = $(btn.getAttribute('aria-controls'));
        var willOpen = panel.hidden;

        triggers.forEach(function (other) {
          other.setAttribute('aria-expanded', 'false');
          $(other.getAttribute('aria-controls')).hidden = true;
        });

        if (willOpen) {
          btn.setAttribute('aria-expanded', 'true');
          panel.hidden = false;
        }
      });
    });
  }

  /* -------------------------------------------------------------------------
     4. ПОЯВЛЕНИЕ ПРИ СКРОЛЛЕ. .reveal получает .is-in и остаётся видимым.
        Без JS класс .js не выставлен и всё видно сразу, скрытого контента нет.
  ------------------------------------------------------------------------- */

  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (!('IntersectionObserver' in window) || reducedMotion.matches) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    // Шаги таймлайна тоже помечены .reveal, поэтому их маркеры
    // загораются этим же наблюдателем, отдельный не нужен.
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  /* -------------------------------------------------------------------------
     5. ШАПКА. Стеклянное состояние включается, когда маячок #top ушёл вверх.
  ------------------------------------------------------------------------- */

  var header = $('site-header');
  var topSentinel = $('top');

  if (header && topSentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(topSentinel);
  }

  /* -------------------------------------------------------------------------
     6. ЛЕНТА СТЕКА. Список повторяется дважды, поэтому шов не виден:
        трек уезжает ровно на половину своей ширины и начинается заново.
  ------------------------------------------------------------------------- */

  var STACK = [
    ['react', 'React'], ['typescript', 'TypeScript'], ['tailwindcss', 'Tailwind CSS'],
    ['nodedotjs', 'Node.js'], ['python', 'Python'], ['telegram', 'Telegram'],
    ['n8n', 'n8n'], ['supabase', 'Supabase'], ['postgresql', 'PostgreSQL'],
    ['docker', 'Docker'], ['figma', 'Figma'], ['vercel', 'Vercel'],
  ];

  var stackTrack = $('stack-track');

  if (stackTrack && STACK.length) {
    var makeLogo = function (pair, isCopy) {
      var img = document.createElement('img');
      img.src = 'assets/logos/' + pair[0] + '.svg';
      img.className = 'stack-logo';
      img.width = 26;               // Simple Icons квадратные, 24x24
      img.height = 26;
      img.loading = 'lazy';
      img.decoding = 'async';
      // вторая копия ряда нужна только глазам, скринридер читает первую
      img.alt = isCopy ? '' : pair[1];
      if (isCopy) img.setAttribute('aria-hidden', 'true');
      // отсутствующий логотип не должен разрывать ряд
      img.addEventListener('error', function () { img.remove(); }, { once: true });
      return img;
    };

    [false, true].forEach(function (isCopy) {
      STACK.forEach(function (pair) { stackTrack.appendChild(makeLogo(pair, isCopy)); });
    });
  }

  /* -------------------------------------------------------------------------
     7. ФОРМА. Валидация своими сообщениями, сборка текста, ссылка в Telegram.
  ------------------------------------------------------------------------- */

  var form = $('lead-form');
  if (!form) return;

  var submitBtn = $('submit-btn');
  var submitLabel = $('submit-label');
  var formResult = $('form-result');
  var formResultText = $('form-result-text');
  var formError = $('form-error');
  var formErrorText = $('form-error-text');
  var resultOpen = $('result-open');
  var resultCopyBtn = $('result-copy');
  var resultCopyLabel = $('result-copy-label');

  var LABEL_IDLE = 'Отправить в Telegram';
  var LABEL_BUSY = 'Готовлю сообщение';
  var LABEL_COPY = 'Скопировать текст';

  var FIELDS = {
    name: { el: $('f-name'), error: $('f-name-error') },
    link: { el: $('f-link'), error: $('f-link-error') },
    message: { el: $('f-message'), error: $('f-message-error') },
  };

  /* --- валидация ----------------------------------------------------------- */

  function normalizeUrl(raw) {
    var value = raw.trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    try {
      var parsed = new URL(value);
      // URL() принимает и «сайт» без точки, для ссылки этого мало
      return parsed.hostname.indexOf('.') > 0 ? parsed.href : null;
    } catch (e) {
      return null;
    }
  }

  function showError(key, text) {
    var f = FIELDS[key];
    f.error.textContent = text;
    f.error.hidden = false;
    f.el.closest('.field').classList.add('has-error');
    f.el.setAttribute('aria-invalid', 'true');

    var described = f.el.getAttribute('aria-describedby') || '';
    if (described.indexOf(f.error.id) === -1) {
      f.el.dataset.described = described;                       // запомнили исходное
      f.el.setAttribute('aria-describedby', (described + ' ' + f.error.id).trim());
    }
  }

  function clearError(key) {
    var f = FIELDS[key];
    f.error.hidden = true;
    f.el.closest('.field').classList.remove('has-error');
    f.el.removeAttribute('aria-invalid');

    var base = f.el.dataset.described || '';
    if (base) f.el.setAttribute('aria-describedby', base);
    else f.el.removeAttribute('aria-describedby');
  }

  Object.keys(FIELDS).forEach(function (key) {
    // ошибка снимается с первым же исправлением, а не только по повторной отправке
    FIELDS[key].el.addEventListener('input', function () {
      if (!FIELDS[key].error.hidden) clearError(key);
    });
  });

  function readForm() {
    return {
      name: FIELDS.name.el.value.trim(),
      kind: (form.elements.kind && form.elements.kind.value) || 'Пока не определился',
      budget: form.elements.budget.value,
      term: form.elements.term.value,
      rawLink: FIELDS.link.el.value.trim(),
      link: normalizeUrl(FIELDS.link.el.value) || '',
      message: FIELDS.message.el.value.trim(),
    };
  }

  function validate(data) {
    Object.keys(FIELDS).forEach(clearError);

    var problems = [];
    if (data.name.length < 2) problems.push(['name', 'Напишите, как к вам обращаться']);
    if (data.rawLink && !data.link) problems.push(['link', 'Проверьте адрес, похоже на опечатку']);
    if (data.message.length < 10) problems.push(['message', 'Опишите задачу хотя бы парой предложений']);

    problems.forEach(function (pair) { showError(pair[0], pair[1]); });

    if (problems.length) {
      FIELDS[problems[0][0]].el.focus();
      return false;
    }
    return true;
  }

  /* --- сборка сообщения ----------------------------------------------------- */

  function siteName() {
    var host = location.hostname;
    return host && host !== 'localhost' ? host : 'сайта-портфолио';
  }

  function buildMessage(data) {
    var lines = [
      'Заявка с ' + siteName(),
      '',
      'Имя: ' + data.name,
      'Задача: ' + data.kind,
      'Бюджет: ' + data.budget,
      'Сроки: ' + data.term,
    ];
    if (data.link) lines.push('Ссылка: ' + data.link);
    lines.push('', data.message);
    return lines.join('\n');
  }

  function telegramLink(text) {
    var link = TG_CHAT_URL + '?text=' + encodeURIComponent(text);
    if (link.length <= MAX_URL_LENGTH) return link;

    // длинную заявку ужимаем, но честно помечаем, что текст обрезан
    var note = '\n\n[текст сокращён, продолжу в чате]';
    var body = text;
    while (body.length > 40) {
      body = body.slice(0, Math.floor(body.length * 0.8));
      var attempt = TG_CHAT_URL + '?text=' + encodeURIComponent(body + note);
      if (attempt.length <= MAX_URL_LENGTH) return attempt;
    }
    return TG_CHAT_URL;
  }

  /* --- буфер обмена ---------------------------------------------------------- */

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      // clipboard API живёт только в защищённом контексте, по file:// его нет
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { resolve(true); },
          function () { resolve(legacyCopy(text)); }
        );
      } else {
        resolve(legacyCopy(text));
      }
    });
  }

  /* --- отправка -------------------------------------------------------------- */

  function setBusy(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle('is-busy', on);
    submitLabel.textContent = on ? LABEL_BUSY : LABEL_IDLE;
  }

  function report(opened, copied) {
    formResult.hidden = false;

    if (!opened) {
      formResultText.textContent = copied
        ? 'Браузер заблокировал новое окно. Текст уже в буфере, откройте чат кнопкой ниже и вставьте его.'
        : 'Браузер заблокировал новое окно. Откройте чат кнопкой ниже, текст можно скопировать рядом.';
      resultOpen.focus();
      return;
    }

    formResultText.textContent = copied
      ? 'Telegram открыт, сообщение уже в поле ввода. Копия текста на всякий случай в буфере.'
      : 'Telegram открыт, сообщение уже в поле ввода. Осталось нажать отправку.';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formError.hidden = true;
    formResult.hidden = true;   // прошлый успешный ответ не должен спорить с новой ошибкой

    var data = readForm();
    if (!validate(data)) {
      formErrorText.textContent = 'Проверьте отмеченные поля';
      formError.hidden = false;
      return;
    }

    var message = buildMessage(data);
    var link = telegramLink(message);

    // Запасной путь всегда ведёт в чат с тем же текстом
    resultOpen.href = link;

    setBusy(true);

    // Окно открываем синхронно внутри жеста, иначе Safari сочтёт это попапом.
    // Фича noopener здесь не годится: с ней window.open всегда вернёт null
    // и мы не отличим блокировку от успеха.
    var win = window.open(link, '_blank');
    if (win) win.opener = null;

    var startedAt = Date.now();

    copyText(message).then(function (copied) {
      // короткая пауза, чтобы состояние кнопки успело прочитаться, а не мигнуло
      var wait = Math.max(0, 420 - (Date.now() - startedAt));
      window.setTimeout(function () {
        setBusy(false);
        report(Boolean(win), copied);
      }, wait);
    });
  });

  if (resultCopyBtn) {
    resultCopyBtn.addEventListener('click', function () {
      copyText(buildMessage(readForm())).then(function (ok) {
        resultCopyLabel.textContent = ok ? 'Скопировано' : 'Скопировать не вышло';
        window.setTimeout(function () { resultCopyLabel.textContent = LABEL_COPY; }, 2000);
      });
    });
  }
})();
