(function () {
  'use strict';

  var apiMeta = document.querySelector('meta[name="automation-api-base"]');
  var API_BASE = ((window.AUTOMATION_API_BASE || (apiMeta && apiMeta.content) || 'http://localhost:3000/api')).replace(/\/$/, '');
  var params = new URLSearchParams(window.location.search);
  var state = {
    token: params.get('token') || '',
    session: null,
    result: null,
    example: params.get('example') === '1',
    pollingTimer: null,
    pollingBusy: false,
  };

  var nodes = {
    actions: document.getElementById('demo-actions'),
    telegramOpen: document.getElementById('telegram-open'),
    example: document.getElementById('demo-example'),
    fallback: document.getElementById('demo-fallback'),
    retry: document.getElementById('demo-retry'),
    status: document.getElementById('demo-status'),
    error: document.getElementById('demo-error'),
    errorText: document.getElementById('demo-error-text'),
    leadStatus: document.getElementById('lead-status'),
    leadView: document.getElementById('lead-view'),
    workflowView: document.getElementById('workflow-view'),
    executionStatus: document.getElementById('execution-status'),
    executionView: document.getElementById('execution-view'),
    resultStatus: document.getElementById('result-status'),
    resultView: document.getElementById('demo-result-view'),
  };

  var NODE_LABELS = {
    'lead-created': 'Новая заявка',
    'check-budget': 'Проверка бюджета',
    'create-client': 'Создание клиента',
    'send-telegram': 'Уведомление в Telegram',
    'update-lead': 'Обновление заявки',
  };

  var STATUS_LABELS = {
    ACTIVE: 'Активна',
    NEW: 'Новая',
    PROCESSING: 'В работе',
    VALIDATED: 'Проверена',
    COMPLETED: 'Готово',
    PENDING: 'Ожидание',
    RUNNING: 'Выполняется',
    SUCCESS: 'Успешно',
    FAILED: 'Ошибка',
    SKIPPED: 'Пропущено',
  };

  var SAMPLE_RESULT = {
    session: {
      id: 'example-session',
      status: 'COMPLETED',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      telegramUrl: '',
    },
    lead: {
      id: 'example-lead',
      name: 'Марина',
      serviceType: 'Автоматизация',
      budgetLabel: 'Более 100 000 ₽',
      budgetAmount: 150000,
      description: 'Собирать заявки с сайта и уведомлять менеджера в Telegram.',
      source: 'TELEGRAM',
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      client: { id: 'example-client', name: 'Марина', createdAt: new Date().toISOString() },
    },
    executions: [{
      id: 'example-execution',
      status: 'SUCCESS',
      error: null,
      retryCount: 0,
      steps: [
        { id: 's1', nodeId: 'lead-created', position: 0, status: 'SUCCESS', input: null, output: null, error: null },
        { id: 's2', nodeId: 'check-budget', position: 1, status: 'SUCCESS', input: null, output: { passed: true }, error: null },
        { id: 's3', nodeId: 'create-client', position: 2, status: 'SUCCESS', input: null, output: null, error: null },
        { id: 's4', nodeId: 'send-telegram', position: 3, status: 'SKIPPED', input: null, output: { reason: 'Пример без внешней доставки' }, error: null },
        { id: 's5', nodeId: 'update-lead', position: 4, status: 'SUCCESS', input: null, output: null, error: null },
      ],
    }],
  };

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status || 'Ожидание';
  }

  function setBadge(node, status) {
    node.className = 'demo-badge demo-badge-' + String(status || 'neutral').toLowerCase();
    node.textContent = statusLabel(status);
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
  }

  function request(path, options) {
    options = options || {};
    return fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: { accept: 'application/json', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = text ? JSON.parse(text) : null;
        if (!response.ok) {
          var message = body && body.message ? body.message : 'HTTP ' + response.status;
          throw new Error(message);
        }
        return body;
      });
    });
  }

  function extractToken(telegramUrl) {
    try { return new URL(telegramUrl).searchParams.get('start') || ''; } catch (e) { return ''; }
  }

  function setStatus(text, stateName) {
    nodes.status.textContent = text;
    nodes.status.className = 'demo-status' + (stateName ? ' is-' + stateName : (nodes.error && !nodes.error.hidden ? ' is-error' : ''));
  }

  function renderSession() {
    if (!state.session || state.example || !state.session.telegramUrl) {
      nodes.actions.hidden = true;
      return;
    }
    nodes.actions.hidden = false;
    nodes.telegramOpen.href = state.session.telegramUrl;
  }

  function renderLead(result) {
    clear(nodes.leadView);
    var lead = result && result.lead;
    setBadge(nodes.leadStatus, lead ? lead.status : 'PENDING');
    if (!lead) {
      nodes.leadView.appendChild(create('p', 'demo-empty', 'Ответьте боту в Telegram — заявка появится здесь автоматически.'));
      return;
    }

    var facts = create('div', 'lead-facts');
    [
      ['Имя', lead.name],
      ['Задача', lead.serviceType],
      ['Бюджет', lead.budgetLabel],
      ['Источник', lead.source],
    ].forEach(function (pair) {
      var fact = create('div', 'lead-fact');
      fact.appendChild(create('span', 'lead-fact-label', pair[0]));
      fact.appendChild(create('span', 'lead-fact-value', pair[1]));
      facts.appendChild(fact);
    });
    nodes.leadView.appendChild(facts);
    nodes.leadView.appendChild(create('p', 'lead-description', lead.description));
  }

  function renderWorkflow(result) {
    clear(nodes.workflowView);
    var execution = result && result.executions && result.executions[0];
    var steps = execution && execution.steps ? execution.steps : [];
    if (!steps.length) {
      var empty = create('li', 'demo-empty', 'Workflow появится после отправки заявки.');
      nodes.workflowView.appendChild(empty);
      return;
    }

    steps.forEach(function (step, index) {
      var item = create('li', 'workflow-step is-' + String(step.status || '').toLowerCase());
      item.appendChild(create('span', 'workflow-step-marker', String(index + 1).padStart(2, '0')));
      var label = NODE_LABELS[step.nodeId] || step.nodeId;
      if (step.nodeId === 'check-budget' && step.output && typeof step.output === 'object') {
        label += step.output.passed ? ' · условие выполнено' : ' · условие не выполнено';
      }
      item.appendChild(create('span', 'workflow-step-name', label));
      item.appendChild(create('span', 'workflow-step-state', statusLabel(step.status)));
      nodes.workflowView.appendChild(item);
    });
  }

  function renderExecutions(result) {
    clear(nodes.executionView);
    var executions = result && result.executions ? result.executions : [];
    var currentStatus = executions.length ? executions[executions.length - 1].status : 'PENDING';
    setBadge(nodes.executionStatus, currentStatus);
    if (!executions.length) {
      nodes.executionView.appendChild(create('p', 'demo-empty', 'Execution ещё не создан. Ожидаем lead.created.'));
      return;
    }

    executions.forEach(function (execution) {
      var row = create('div', 'execution-row');
      var meta = create('div', 'execution-meta');
      meta.appendChild(create('span', 'execution-id', execution.id));
      var badge = create('span');
      setBadge(badge, execution.status);
      meta.appendChild(badge);
      row.appendChild(meta);
      var total = execution.steps ? execution.steps.length : 0;
      var completed = execution.steps ? execution.steps.filter(function (step) {
        return ['SUCCESS', 'FAILED', 'SKIPPED'].indexOf(step.status) !== -1;
      }).length : 0;
      var percent = total ? Math.round(completed / total * 100) : (execution.status === 'SUCCESS' ? 100 : 12);
      var progress = create('div', 'demo-progress');
      var bar = create('div', 'demo-progress-bar');
      bar.style.width = percent + '%';
      progress.appendChild(bar);
      row.appendChild(progress);
      row.appendChild(create('p', 'execution-summary', total ? completed + ' из ' + total + ' шагов записано' : 'Ожидание шагов'));
      nodes.executionView.appendChild(row);
    });
  }

  function renderResult(result) {
    clear(nodes.resultView);
    var lead = result && result.lead;
    var executions = result && result.executions ? result.executions : [];
    var failed = executions.some(function (execution) { return execution.status === 'FAILED'; });
    var complete = Boolean(lead && lead.status === 'COMPLETED' && executions.length && executions.every(function (execution) {
      return ['SUCCESS', 'SKIPPED'].indexOf(execution.status) !== -1;
    }));
    var resultState = failed ? 'FAILED' : (complete ? 'SUCCESS' : 'PENDING');
    setBadge(nodes.resultStatus, resultState);

    var heading = failed ? 'Workflow завершился с ошибкой.' : (complete ? 'Заявка обработана.' : 'Ждём результат обработки.');
    nodes.resultView.appendChild(create('p', 'demo-result-copy', heading));
    if (complete) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'В demo видно не только итог, но и каждый persisted шаг: условие, создание клиента, уведомление и обновление lead.'));
    } else if (!lead) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'После ответа боту здесь появится результат workflow.'));
    } else if (failed) {
      var error = executions.find(function (execution) { return execution.error; });
      nodes.resultView.appendChild(create('p', 'demo-result-copy', error ? error.error : 'Откройте execution progress для деталей.'));
    }
  }

  function render(result) {
    state.result = result;
    state.session = result && result.session ? result.session : state.session;
    renderSession();
    renderLead(result);
    renderWorkflow(result);
    renderExecutions(result);
    renderResult(result);
  }

  function showError(error) {
    nodes.error.hidden = false;
    var message = error && error.message ? error.message : 'Backend не ответил.';
    if (message === 'Failed to fetch') message = 'Backend не ответил. Проверьте адрес API и CORS.';
    nodes.errorText.textContent = message;
    nodes.status.className = 'demo-status is-error';
    setStatus('Можно посмотреть пример или повторить подключение.');
  }

  function isFinished(result) {
    return Boolean(result && result.lead && result.executions && result.executions.length && result.executions.every(function (execution) {
      return ['SUCCESS', 'FAILED', 'SKIPPED'].indexOf(execution.status) !== -1;
    }));
  }

  function refreshResult(initial) {
    if (!state.token || state.example || state.pollingBusy) return Promise.resolve();
    state.pollingBusy = true;
    return request('/demo/result/' + encodeURIComponent(state.token)).then(function (result) {
      nodes.error.hidden = true;
      render(result);
      setStatus(isFinished(result) ? 'Execution завершён. Результат сохранён в demo-сессии.' : 'Ожидаем ответ Telegram и выполнение workflow…');
      nodes.status.className = 'demo-status ' + (isFinished(result) ? 'is-success' : 'is-loading');
      if (isFinished(result) && state.pollingTimer) {
        window.clearInterval(state.pollingTimer);
        state.pollingTimer = null;
      }
    }).then(function () {
      return true;
    }).catch(function (error) {
      if (initial) showError(error);
      return false;
    }).finally(function () {
      state.pollingBusy = false;
    });
  }

  function startPolling() {
    if (state.pollingTimer || !state.token || state.example) return;
    state.pollingTimer = window.setInterval(function () { refreshResult(false); }, 1600);
  }

  function showExample(event) {
    if (event) event.preventDefault();
    if (state.pollingTimer) window.clearInterval(state.pollingTimer);
    state.pollingTimer = null;
    state.example = true;
    history.replaceState({}, '', '?example=1');
    nodes.error.hidden = true;
    render(SAMPLE_RESULT);
    nodes.actions.hidden = true;
    setStatus('Демонстрационный пример без подключения к backend и Telegram.');
  }

  function startNewSession() {
    if (state.pollingTimer) window.clearInterval(state.pollingTimer);
    window.location.href = window.location.pathname;
  }

  function load() {
    if (state.example) {
      showExample();
      return;
    }

    if (state.token) {
      setStatus('Загружаем demo-сессию…');
      refreshResult(true).then(function (ok) { if (ok) startPolling(); });
      return;
    }

    setStatus('Создаём изолированную demo-сессию…');
    request('/demo/session', { method: 'POST' }).then(function (session) {
      var token = extractToken(session.telegramUrl);
      if (!token) throw new Error('Backend не вернул demo token.');
      state.token = token;
      state.session = session;
      history.replaceState({}, '', '?token=' + encodeURIComponent(token));
      render({ session: session, lead: null, executions: [] });
      setStatus('Сессия создана. Откройте Telegram и пройдите questionnaire.');
      startPolling();
    }).catch(showError);
  }

  nodes.example.addEventListener('click', showExample);
  nodes.fallback.addEventListener('click', showExample);
  nodes.retry.addEventListener('click', startNewSession);
  load();
})();
