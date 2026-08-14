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
    playbackRequested: params.get('play') === '1',
    playbackActive: false,
    playbackStarted: false,
    playbackPhase: 0,
    playbackTimer: null,
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
    flowState: document.getElementById('demo-flow-state'),
    flowNodes: Array.prototype.slice.call(document.querySelectorAll('[data-flow-node]')),
    workflowStatus: document.getElementById('workflow-status'),
    workflowToolbar: document.getElementById('workflow-toolbar'),
    workflowExpand: document.getElementById('workflow-expand'),
    workflowCollapse: document.getElementById('workflow-collapse'),
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

  var NODE_DESCRIPTIONS = {
    'lead-created': 'Система получила данные из Telegram и создала событие для запуска автоматизации.',
    'check-budget': 'Бюджет сравнивается с условием сценария, чтобы выбрать дальнейшие действия.',
    'create-client': 'Для подходящей заявки автоматически создаётся карточка клиента без ручного переноса данных.',
    'send-telegram': 'Ответственный получает уведомление о новой заявке и может быстро подключиться к работе.',
    'update-lead': 'Финальный статус сохраняется, чтобы заявка не потерялась и была видна в системе.',
  };

  var NODE_PROGRESS_LABELS = {
    'lead-created': 'Получаем данные заявки…',
    'check-budget': 'Проверяем бюджет и условия…',
    'create-client': 'Создаём карточку клиента…',
    'send-telegram': 'Отправляем уведомление…',
    'update-lead': 'Сохраняем итоговый статус…',
  };

  var STATUS_LABELS = {
    ACTIVE: 'Активна',
    EXPIRED: 'Истекла',
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

  var SOURCE_LABELS = {
    TELEGRAM: 'Telegram',
    FORM: 'Форма на сайте',
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
      startedAt: new Date(Date.now() - 5200).toISOString(),
      finishedAt: new Date(Date.now() - 400).toISOString(),
      steps: [
        { id: 's1', nodeId: 'lead-created', position: 0, status: 'SUCCESS', input: { source: 'Telegram' }, output: { received: true }, error: null, startedAt: new Date(Date.now() - 5200).toISOString(), finishedAt: new Date(Date.now() - 4700).toISOString() },
        { id: 's2', nodeId: 'check-budget', position: 1, status: 'SUCCESS', input: { budgetAmount: 150000 }, output: { passed: true, expected: 50000, actual: 150000 }, error: null, startedAt: new Date(Date.now() - 4400).toISOString(), finishedAt: new Date(Date.now() - 3700).toISOString() },
        { id: 's3', nodeId: 'create-client', position: 2, status: 'SUCCESS', input: { name: 'Марина' }, output: { clientId: 'example-client', created: true }, error: null, startedAt: new Date(Date.now() - 3400).toISOString(), finishedAt: new Date(Date.now() - 2600).toISOString() },
        { id: 's4', nodeId: 'send-telegram', position: 3, status: 'SKIPPED', input: { channel: 'Telegram' }, output: { delivered: false, reason: 'Пример без внешней доставки' }, error: null, startedAt: new Date(Date.now() - 2300).toISOString(), finishedAt: new Date(Date.now() - 1600).toISOString() },
        { id: 's5', nodeId: 'update-lead', position: 4, status: 'SUCCESS', input: { status: 'PROCESSING' }, output: { status: 'COMPLETED' }, error: null, startedAt: new Date(Date.now() - 1300).toISOString(), finishedAt: new Date(Date.now() - 400).toISOString() },
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

  function formatDuration(startedAt, finishedAt) {
    if (!startedAt || !finishedAt) return '—';
    var started = new Date(startedAt).getTime();
    var finished = new Date(finishedAt).getTime();
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return '—';
    var milliseconds = finished - started;
    if (milliseconds < 1000) return milliseconds + ' мс';
    return (milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0).replace('.', ',') + ' с';
  }

  function formatJson(value) {
    if (value === null || value === undefined) return 'Нет данных';
    try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
  }

  function isTerminalStatus(status) {
    return ['SUCCESS', 'FAILED', 'SKIPPED'].indexOf(status) !== -1;
  }

  function primaryExecution(result) {
    return result && result.executions && result.executions.length ? result.executions[0] : null;
  }

  function displayStepStatus(step, index) {
    if (!state.playbackActive) return step.status;
    var runningPhase = index * 2 + 1;
    if (state.playbackPhase < runningPhase) return 'PENDING';
    if (state.playbackPhase === runningPhase) return 'RUNNING';
    return step.status;
  }

  function displayExecutionStatus(execution) {
    if (!execution) return 'PENDING';
    if (!state.playbackActive) return execution.status;
    var total = execution.steps ? execution.steps.length : 0;
    return state.playbackPhase >= total * 2 ? execution.status : 'RUNNING';
  }

  function displayLeadStatus(lead, execution) {
    if (!lead) return 'PENDING';
    if (state.playbackActive && displayExecutionStatus(execution) === 'RUNNING') return 'PROCESSING';
    return lead.status;
  }

  function stepOutcome(step) {
    if (step.error) return 'Этап остановлен с ошибкой: ' + step.error;
    var output = step.output && typeof step.output === 'object' ? step.output : {};
    if (step.nodeId === 'lead-created') return 'Заявка зарегистрирована, событие для автоматизации создано.';
    if (step.nodeId === 'check-budget') {
      if (output.passed) return 'Условие выполнено: бюджет подходит для создания карточки клиента.';
      return 'Условие не выполнено: дополнительные действия для высокого бюджета пропущены.';
    }
    if (step.nodeId === 'create-client') {
      return output.created === false
        ? 'Карточка клиента уже существовала, повторное создание безопасно пропущено.'
        : 'Карточка клиента создана автоматически из данных заявки.';
    }
    if (step.nodeId === 'send-telegram') {
      return output.delivered === false
        ? 'Внешнее уведомление не доставлено, но заявка продолжила обработку и сохранилась.'
        : 'Уведомление отправлено ответственному в Telegram.';
    }
    if (step.nodeId === 'update-lead') return 'Заявке присвоен финальный статус «Готово».';
    return NODE_DESCRIPTIONS[step.nodeId] || 'Этап выполнен и записан в журнал.';
  }

  function setFlowState(text) {
    clear(nodes.flowState);
    var dot = create('i');
    dot.setAttribute('aria-hidden', 'true');
    nodes.flowState.appendChild(dot);
    nodes.flowState.appendChild(document.createTextNode(' ' + text));
  }

  function renderFlow(result) {
    var execution = primaryExecution(result);
    var steps = execution && execution.steps ? execution.steps : [];
    var statuses = {};
    steps.forEach(function (step, index) {
      statuses[step.nodeId] = displayStepStatus(step, index);
    });

    var activeIndex = -1;
    nodes.flowNodes.forEach(function (node, index) {
      var status = statuses[node.dataset.flowNode] || 'PENDING';
      node.classList.remove('is-active', 'is-complete', 'is-failed', 'is-skipped');
      if (status === 'RUNNING') {
        node.classList.add('is-active');
        activeIndex = index;
      } else if (status === 'FAILED') {
        node.classList.add('is-failed');
      } else if (status === 'SKIPPED') {
        node.classList.add('is-skipped');
      } else if (status === 'SUCCESS') {
        node.classList.add('is-complete');
      }
    });

    if (!steps.length) {
      if (nodes.flowNodes[0]) nodes.flowNodes[0].classList.add('is-active');
      setFlowState('5 ЭТАПОВ');
      return;
    }

    if (activeIndex >= 0) {
      setFlowState('ЭТАП ' + (activeIndex + 1) + ' ИЗ ' + nodes.flowNodes.length);
    } else if (steps.every(function (step, index) { return isTerminalStatus(displayStepStatus(step, index)); })) {
      setFlowState('ВСЕ ЭТАПЫ СОХРАНЕНЫ');
    } else {
      setFlowState('ОБРАБОТКА ЗАЯВКИ');
    }
  }

  function request(path, options) {
    options = options || {};
    return fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: { accept: 'application/json', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        if (text) {
          try { body = JSON.parse(text); } catch (e) {
            throw new Error('Сервер вернул некорректный ответ. Попробуйте ещё раз.');
          }
        }
        if (!response.ok) {
          var message = body && body.message ? body.message : 'Ошибка сервера: ' + response.status;
          if (Array.isArray(message)) message = message.join(' ');
          if (response.status === 410) message = 'Демо-сессия истекла. Запустите новую.';
          if (response.status === 429) message = 'Слишком много запросов. Подождите минуту и попробуйте снова.';
          if (response.status >= 500) {
            message = 'Сервер временно недоступен. Попробуйте ещё раз через несколько секунд.';
          }
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
    var execution = primaryExecution(result);
    setBadge(nodes.leadStatus, displayLeadStatus(lead, execution));
    if (!lead) {
      nodes.leadView.appendChild(create('p', 'demo-empty', 'Ответьте боту в Telegram — заявка появится здесь автоматически.'));
      return;
    }

    var facts = create('div', 'lead-facts');
    [
      ['Имя', lead.name],
      ['Задача', lead.serviceType],
      ['Бюджет', lead.budgetLabel],
      ['Источник', SOURCE_LABELS[lead.source] || lead.source],
      ['Получена', formatDate(lead.createdAt)],
      ['Клиент', lead.client ? 'Карточка создана' : 'Ещё не создан'],
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
    var openIds = Array.prototype.slice.call(nodes.workflowView.querySelectorAll('details[open]'))
      .map(function (details) { return details.dataset.stepId; });
    clear(nodes.workflowView);
    var execution = result && result.executions && result.executions[0];
    var steps = execution && execution.steps ? execution.steps : [];
    setBadge(nodes.workflowStatus, displayExecutionStatus(execution));
    nodes.workflowToolbar.hidden = !steps.length;
    if (!steps.length) {
      var empty = create('li', 'demo-empty', 'Сценарий появится после отправки заявки.');
      nodes.workflowView.appendChild(empty);
      return;
    }

    steps.forEach(function (step, index) {
      var displayStatus = displayStepStatus(step, index);
      var item = create('li', 'workflow-step is-' + String(displayStatus || '').toLowerCase());
      var details = create('details', 'workflow-step-card');
      details.dataset.stepId = step.id || step.nodeId;
      details.open = openIds.indexOf(details.dataset.stepId) !== -1 || displayStatus === 'RUNNING';

      var summary = create('summary', 'workflow-step-summary');
      summary.appendChild(create('span', 'workflow-step-marker', String(index + 1).padStart(2, '0')));
      var summaryCopy = create('span', 'workflow-step-copy');
      var label = NODE_LABELS[step.nodeId] || step.nodeId;
      if (!state.playbackActive && step.nodeId === 'check-budget' && step.output && typeof step.output === 'object') {
        label += step.output.passed ? ' · условие выполнено' : ' · условие не выполнено';
      }
      summaryCopy.appendChild(create('strong', 'workflow-step-name', label));
      summaryCopy.appendChild(create('small', 'workflow-step-summary-text',
        displayStatus === 'RUNNING' ? (NODE_PROGRESS_LABELS[step.nodeId] || 'Выполняем этап…') : (NODE_DESCRIPTIONS[step.nodeId] || 'Этап сценария')));
      summary.appendChild(summaryCopy);
      summary.appendChild(create('span', 'workflow-step-state', statusLabel(displayStatus)));
      summary.appendChild(create('span', 'workflow-step-chevron', '⌄'));
      details.appendChild(summary);

      var detailView = create('div', 'workflow-step-details');
      if (displayStatus === 'PENDING') {
        detailView.appendChild(create('p', 'workflow-step-waiting', 'Этот этап появится после завершения предыдущего.'));
      } else if (displayStatus === 'RUNNING') {
        detailView.appendChild(create('p', 'workflow-step-running', NODE_PROGRESS_LABELS[step.nodeId] || 'Этап выполняется…'));
      } else {
        detailView.appendChild(create('p', 'workflow-step-outcome', stepOutcome(step)));
        var meta = create('div', 'workflow-step-meta');
        meta.appendChild(create('span', '', 'Начало: ' + formatDate(step.startedAt)));
        meta.appendChild(create('span', '', 'Длительность: ' + formatDuration(step.startedAt, step.finishedAt)));
        meta.appendChild(create('span', '', 'Статус: ' + statusLabel(step.status)));
        detailView.appendChild(meta);

        var data = create('div', 'workflow-step-data');
        [['Входные данные', step.input], ['Результат', step.output]].forEach(function (pair) {
          var dataBlock = create('div', 'workflow-data-block');
          dataBlock.appendChild(create('span', 'workflow-data-label', pair[0]));
          dataBlock.appendChild(create('pre', 'workflow-data-value', formatJson(pair[1])));
          data.appendChild(dataBlock);
        });
        detailView.appendChild(data);
        if (step.error) detailView.appendChild(create('p', 'workflow-step-error', step.error));
      }
      details.appendChild(detailView);
      item.appendChild(details);
      nodes.workflowView.appendChild(item);
    });
  }

  function renderExecutions(result) {
    clear(nodes.executionView);
    var executions = result && result.executions ? result.executions : [];
    var currentExecution = executions.length ? executions[executions.length - 1] : null;
    var currentStatus = displayExecutionStatus(currentExecution);
    setBadge(nodes.executionStatus, currentStatus);
    if (!executions.length) {
      nodes.executionView.appendChild(create('p', 'demo-empty', 'Выполнение ещё не создано. Ожидаем новую заявку.'));
      return;
    }

    executions.forEach(function (execution) {
      var executionStatus = displayExecutionStatus(execution);
      var row = create('div', 'execution-row');
      var meta = create('div', 'execution-meta');
      meta.appendChild(create('span', 'execution-id', 'Операция #' + String(execution.id).slice(-8)));
      var badge = create('span');
      setBadge(badge, executionStatus);
      meta.appendChild(badge);
      row.appendChild(meta);
      var total = execution.steps ? execution.steps.length : 0;
      var displayStatuses = execution.steps ? execution.steps.map(function (step, index) {
        return displayStepStatus(step, index);
      }) : [];
      var completed = displayStatuses.filter(function (status) {
        return isTerminalStatus(status);
      }).length;
      var running = displayStatuses.some(function (status) { return status === 'RUNNING'; });
      var percent = total ? Math.round((completed + (running ? 0.45 : 0)) / total * 100) : (executionStatus === 'SUCCESS' ? 100 : 12);
      var progress = create('div', 'demo-progress');
      var bar = create('div', 'demo-progress-bar');
      bar.style.width = percent + '%';
      progress.appendChild(bar);
      row.appendChild(progress);
      var summary = total ? completed + ' из ' + total + ' этапов завершено' : 'Ожидание этапов';
      if (executionStatus === 'RUNNING') summary += ' · обработка продолжается';
      if (executionStatus === 'FAILED') summary += ' · подробность ошибки сохранена ниже';
      row.appendChild(create('p', 'execution-summary', summary));
      row.appendChild(create('p', 'execution-timing',
        'Начало: ' + formatDate(execution.startedAt) + ' · Завершение: ' + formatDate(execution.finishedAt)));
      nodes.executionView.appendChild(row);
    });
  }

  function renderResult(result) {
    clear(nodes.resultView);
    var lead = result && result.lead;
    var executions = result && result.executions ? result.executions : [];
    var failed = !state.playbackActive && executions.some(function (execution) { return execution.status === 'FAILED'; });
    var complete = Boolean(!state.playbackActive && lead && lead.status === 'COMPLETED' && executions.length && executions.every(function (execution) {
      return ['SUCCESS', 'SKIPPED'].indexOf(execution.status) !== -1;
    }));
    var resultState = failed ? 'FAILED' : (complete ? 'SUCCESS' : (state.playbackActive ? 'RUNNING' : 'PENDING'));
    setBadge(nodes.resultStatus, resultState);

    var heading = failed
      ? 'Сценарий завершился с ошибкой.'
      : (complete ? 'Заявка обработана.' : (state.playbackActive ? 'Показываем обработку по этапам.' : 'Ждём результат обработки.'));
    nodes.resultView.appendChild(create('p', 'demo-result-copy', heading));
    if (state.playbackActive) {
      var execution = primaryExecution(result);
      var currentIndex = execution && execution.steps ? Math.min(Math.floor(state.playbackPhase / 2), execution.steps.length - 1) : -1;
      var currentNode = currentIndex >= 0 && execution.steps[currentIndex] ? execution.steps[currentIndex].nodeId : null;
      nodes.resultView.appendChild(create('p', 'demo-result-copy',
        currentNode ? (NODE_PROGRESS_LABELS[currentNode] || 'Сохраняем результат этапа…') : 'Запускаем сценарий…'));
      nodes.resultView.appendChild(create('p', 'demo-result-note', 'Этапы можно раскрыть выше и посмотреть, что именно произошло внутри процесса.'));
    } else if (complete) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'В демо виден не только итог, но и каждый сохранённый шаг: условие, создание клиента, уведомление и обновление заявки.'));
    } else if (!lead) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'После ответа боту здесь появится результат сценария.'));
    } else if (failed) {
      var error = executions.find(function (execution) { return execution.error; });
      nodes.resultView.appendChild(create('p', 'demo-result-copy', error ? error.error : 'Откройте журнал выполнения для подробностей.'));
    }
  }

  function render(result) {
    state.result = result;
    state.session = result && result.session ? result.session : state.session;
    renderSession();
    renderFlow(result);
    renderLead(result);
    renderWorkflow(result);
    renderExecutions(result);
    renderResult(result);
  }

  function showError(error) {
    nodes.error.hidden = false;
    var message = error && error.message ? error.message : 'Сервер не ответил.';
    if (message === 'Failed to fetch') message = 'Не удалось подключиться к серверу. Проверьте, запущен ли он и правильно ли указан его адрес.';
    nodes.errorText.textContent = message;
    nodes.status.className = 'demo-status is-error';
    setStatus('Можно посмотреть пример или повторить подключение.');
  }

  function isFinished(result) {
    return Boolean(result && result.lead && result.executions && result.executions.length && result.executions.every(function (execution) {
      return ['SUCCESS', 'FAILED', 'SKIPPED'].indexOf(execution.status) !== -1;
    }));
  }

  function stopPolling() {
    if (!state.pollingTimer) return;
    window.clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }

  function stopPlayback() {
    if (state.playbackTimer) window.clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
    state.playbackActive = false;
  }

  function startPlayback(result, force) {
    var execution = primaryExecution(result);
    var steps = execution && execution.steps ? execution.steps : [];
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ((!force && !state.playbackRequested) || state.playbackStarted || !steps.length || !isFinished(result) || reducedMotion) {
      return false;
    }

    stopPolling();
    stopPlayback();
    state.playbackStarted = true;
    state.playbackRequested = false;
    state.playbackActive = true;
    state.playbackPhase = 0;
    history.replaceState({}, '', state.example ? '?example=1' : '?token=' + encodeURIComponent(state.token));
    render(result);
    setStatus('Заявка получена. Показываем, как система обрабатывает её по этапам…', 'loading');

    var dashboard = document.querySelector('.demo-dashboard');
    if (dashboard) dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    function advance() {
      state.playbackPhase += 1;
      render(result);
      if (state.playbackPhase >= steps.length * 2) {
        state.playbackTimer = window.setTimeout(function () {
          state.playbackActive = false;
          state.playbackTimer = null;
          render(result);
          var failed = result.executions.some(function (item) { return item.status === 'FAILED'; });
          setStatus(
            failed ? 'Обработка завершилась с ошибкой. Откройте этапы для подробностей.' : 'Заявка обработана. Все этапы сохранены и доступны для просмотра.',
            failed ? 'error' : 'success'
          );
        }, 420);
        return;
      }

      var currentIndex = Math.min(Math.floor((state.playbackPhase - 1) / 2), steps.length - 1);
      var currentStep = steps[currentIndex];
      setStatus(NODE_PROGRESS_LABELS[currentStep.nodeId] || 'Выполняем следующий этап…', 'loading');
      state.playbackTimer = window.setTimeout(advance, 420);
    }

    state.playbackTimer = window.setTimeout(advance, 500);
    return true;
  }

  function refreshResult(initial) {
    if (!state.token || state.example || state.pollingBusy) return Promise.resolve();
    state.pollingBusy = true;
    return request('/demo/result/' + encodeURIComponent(state.token)).then(function (result) {
      nodes.error.hidden = true;
      if (initial && startPlayback(result, false)) return;
      if (initial) state.playbackRequested = false;
      render(result);
      setStatus(
        isFinished(result) ? 'Сценарий завершён. Все этапы сохранены.' : (result.lead ? 'Заявка получена. Следим за обработкой…' : 'Ожидаем ответы в Telegram…'),
        isFinished(result) ? 'success' : 'loading'
      );
      if (isFinished(result)) stopPolling();
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
    if (state.pollingTimer || !state.token || state.example || state.playbackActive) return;
    state.pollingTimer = window.setInterval(function () { refreshResult(false); }, 1600);
  }

  function showExample(event) {
    if (event) event.preventDefault();
    stopPolling();
    stopPlayback();
    state.example = true;
    state.playbackStarted = false;
    state.playbackRequested = false;
    history.replaceState({}, '', '?example=1');
    nodes.error.hidden = true;
    nodes.actions.hidden = true;
    if (!startPlayback(SAMPLE_RESULT, true)) {
      render(SAMPLE_RESULT);
      setStatus('Демонстрационный пример без подключения к серверу и Telegram.', 'success');
    }
  }

  function startNewSession() {
    stopPolling();
    stopPlayback();
    window.location.href = window.location.pathname;
  }

  function setWorkflowExpanded(expanded) {
    Array.prototype.slice.call(nodes.workflowView.querySelectorAll('details')).forEach(function (details) {
      details.open = expanded;
    });
  }

  function load() {
    if (state.example) {
      showExample();
      return;
    }

    if (state.token) {
      setStatus('Загружаем демо-сессию…');
      refreshResult(true).then(function (ok) { if (ok && !state.playbackStarted) startPolling(); });
      return;
    }

    setStatus('Создаём изолированную демо-сессию…');
    request('/demo/session', { method: 'POST' }).then(function (session) {
      var token = extractToken(session.telegramUrl);
      if (!token) throw new Error('Сервер не вернул токен демо-сессии.');
      state.token = token;
      state.session = session;
      history.replaceState({}, '', '?token=' + encodeURIComponent(token));
      render({ session: session, lead: null, executions: [] });
      setStatus('Сессия создана. Откройте Telegram и ответьте на вопросы бота.');
      startPolling();
    }).catch(showError);
  }

  nodes.example.addEventListener('click', showExample);
  nodes.fallback.addEventListener('click', showExample);
  nodes.retry.addEventListener('click', startNewSession);
  nodes.workflowExpand.addEventListener('click', function () { setWorkflowExpanded(true); });
  nodes.workflowCollapse.addEventListener('click', function () { setWorkflowExpanded(false); });
  load();
})();
