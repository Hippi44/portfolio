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
    start: document.getElementById('demo-start'),
    telegramOpen: document.getElementById('telegram-open'),
    example: document.getElementById('demo-example'),
    retry: document.getElementById('demo-retry'),
    status: document.getElementById('demo-status'),
    stepGuide: document.getElementById('demo-step-guide'),
    stepLabel: document.getElementById('demo-step-label'),
    steps: document.getElementById('demo-steps'),
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
    branch: document.getElementById('demo-branch'),
    branchQuestion: document.getElementById('branch-question'),
    branchRule: document.getElementById('branch-rule'),
    branchYes: document.getElementById('branch-yes'),
    branchNo: document.getElementById('branch-no'),
    branchYesNote: document.getElementById('branch-yes-note'),
    branchNoNote: document.getElementById('branch-no-note'),
    branchReason: document.getElementById('branch-reason'),
  };

  var NODE_LABELS = {
    'lead-created': 'Заявка получена',
    'check-budget': 'Проверка бюджета',
    'create-client': 'Создание клиента',
    'send-telegram': 'Уведомление в Telegram',
    'update-lead': 'Обновление заявки',
  };

  var NODE_KINDS = {
    'lead-created': 'Приём заявки',
    'check-budget': 'Проверка условий',
    'create-client': 'CRM',
    'send-telegram': 'Telegram',
    'update-lead': 'CRM',
  };

  var NODE_ACTIONS = {
    'lead-created': 'lead.created',
    'check-budget': 'check budget',
    'create-client': 'client.create',
    'send-telegram': 'telegram.send',
    'update-lead': 'lead.update',
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

  var SAMPLE_LEAD = {
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
  };

  var SAMPLE_EVENT = {
    event: 'lead.created',
    leadId: 'example-lead',
    demoSessionId: 'example-session',
  };

  var SAMPLE_RESULT = {
    session: {
      id: 'example-session',
      status: 'COMPLETED',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      telegramUrl: '',
    },
    lead: SAMPLE_LEAD,
    executions: [{
      id: 'example-execution',
      status: 'SUCCESS',
      error: null,
      retryCount: 0,
      startedAt: new Date(Date.now() - 5200).toISOString(),
      finishedAt: new Date(Date.now() - 400).toISOString(),
      steps: [
        { id: 's1', nodeId: 'lead-created', position: 0, status: 'SUCCESS', input: { nodeId: 'lead-created', event: SAMPLE_EVENT, lead: SAMPLE_LEAD }, output: { received: true, event: SAMPLE_EVENT }, error: null, startedAt: new Date(Date.now() - 5200).toISOString(), finishedAt: new Date(Date.now() - 4700).toISOString() },
        { id: 's2', nodeId: 'check-budget', position: 1, status: 'SUCCESS', input: { nodeId: 'check-budget', event: SAMPLE_EVENT, lead: SAMPLE_LEAD }, output: { passed: true, field: 'budgetAmount', operator: 'greater than', expected: 50000, actual: 150000 }, error: null, startedAt: new Date(Date.now() - 4400).toISOString(), finishedAt: new Date(Date.now() - 3700).toISOString() },
        { id: 's3', nodeId: 'create-client', position: 2, status: 'SUCCESS', input: { nodeId: 'create-client', event: SAMPLE_EVENT, lead: SAMPLE_LEAD }, output: { clientId: 'example-client', created: true }, error: null, startedAt: new Date(Date.now() - 3400).toISOString(), finishedAt: new Date(Date.now() - 2600).toISOString() },
        { id: 's4', nodeId: 'send-telegram', position: 3, status: 'SUCCESS', input: { nodeId: 'send-telegram', event: SAMPLE_EVENT, lead: SAMPLE_LEAD }, output: { delivered: true, messageId: 4821 }, error: null, startedAt: new Date(Date.now() - 2300).toISOString(), finishedAt: new Date(Date.now() - 1600).toISOString() },
        { id: 's5', nodeId: 'update-lead', position: 4, status: 'SUCCESS', input: { nodeId: 'update-lead', event: SAMPLE_EVENT, lead: SAMPLE_LEAD }, output: { leadId: 'example-lead', status: 'COMPLETED' }, error: null, startedAt: new Date(Date.now() - 1300).toISOString(), finishedAt: new Date(Date.now() - 400).toISOString() },
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

  function money(value) {
    if (value === null || value === undefined || value === '') return '—';
    var number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return number.toLocaleString('ru-RU') + ' ₽';
  }

  function isTerminalStatus(status) {
    return ['SUCCESS', 'FAILED', 'SKIPPED'].indexOf(status) !== -1;
  }

  function primaryExecution(result) {
    return result && result.executions && result.executions.length ? result.executions[0] : null;
  }

  function findStep(execution, nodeId) {
    if (!execution || !execution.steps) return null;
    for (var i = 0; i < execution.steps.length; i++) {
      if (execution.steps[i].nodeId === nodeId) return execution.steps[i];
    }
    return null;
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
    if (step.nodeId === 'lead-created') return 'Заявка получена из Telegram и зарегистрирована в системе.';
    if (step.nodeId === 'check-budget') {
      if (output.passed) return 'Условие выполнено — сценарий пойдёт по ветке «Да».';
      return 'Условие не выполнено — сценарий пойдёт по ветке «Нет».';
    }
    if (step.nodeId === 'create-client') {
      return output.created === false
        ? 'Карточка клиента уже была в базе — повторное создание не требуется.'
        : 'Карточка клиента создана автоматически.';
    }
    if (step.nodeId === 'send-telegram') {
      if (output.delivered === false) {
        return 'Уведомление не отправлено: ' + (output.error || output.reason || 'неизвестная причина');
      }
      return 'Уведомление отправлено ответственному в Telegram.';
    }
    if (step.nodeId === 'update-lead') return 'Заявке присвоен финальный статус «Готово».';
    return NODE_DESCRIPTIONS[step.nodeId] || 'Этап выполнен и записан в журнал.';
  }

  function formatValue(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'да' : 'нет';
    if (typeof value === 'number') return value.toLocaleString('ru-RU');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function inputFacts(step, fallbackLead) {
    var raw = step.input && typeof step.input === 'object' ? step.input : {};
    var lead = raw.lead && typeof raw.lead === 'object' ? raw.lead : fallbackLead;
    var facts = [];
    if (lead && typeof lead === 'object' && lead.id) {
      if (lead.name) facts.push(['Имя', lead.name]);
      if (lead.serviceType) facts.push(['Услуга', lead.serviceType]);
      if (lead.budgetLabel) facts.push(['Бюджет', lead.budgetLabel]);
      if (lead.description) facts.push(['Задача', lead.description]);
    }
    if (raw.event) {
      facts.push(['Событие', typeof raw.event === 'object' ? (raw.event.event || JSON.stringify(raw.event)) : String(raw.event)]);
    }
    return facts;
  }

  function outputRows(step) {
    var output = step.output && typeof step.output === 'object' ? step.output : {};
    var rows = [];
    Object.keys(output).forEach(function (key) {
      if (key === 'event' || key === 'received') return;
      rows.push([key, output[key]]);
    });
    return rows;
  }

  function priorityLabel(lead) {
    if (!lead) return 'Стандартный';
    if (lead.budgetAmount >= 100000) return 'Высокий';
    if (lead.budgetAmount >= 50000) return 'Средний';
    return 'Стандартный';
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

    var track = document.getElementById('demo-flow-track');
    if (track) {
      track.classList.toggle('is-finished', Boolean(
        !state.playbackActive &&
        result && result.executions && result.executions.length &&
        result.executions.every(function (execution) {
          return ['SUCCESS', 'FAILED', 'SKIPPED'].indexOf(execution.status) !== -1;
        })
      ));
    }

    if (!steps.length) {
      nodes.flowNodes.forEach(function (node) {
        node.classList.remove('is-active', 'is-complete', 'is-failed', 'is-skipped');
      });
      setFlowState('5 ЭТАПОВ · ОЖИДАНИЕ');
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

  function renderBranch(result) {
    var execution = primaryExecution(result);
    var condition = findStep(execution, 'check-budget');
    var clientStep = findStep(execution, 'create-client');
    if (!condition) {
      nodes.branch.hidden = true;
      return;
    }
    var output = condition.output && typeof condition.output === 'object' ? condition.output : {};
    if (!('passed' in output)) {
      nodes.branch.hidden = true;
      return;
    }
    var index = Array.prototype.indexOf.call(execution.steps, condition);
    if (state.playbackActive && displayStepStatus(condition, index) !== 'SUCCESS') {
      nodes.branch.hidden = true;
      return;
    }

    var passed = output.passed === true;
    var operator = output.operator === 'less than' ? '<' : '>';
    var expected = output.expected;
    var actual = output.actual;
    var expectedText = Number.isFinite(Number(expected)) ? money(Number(expected)) : String(expected !== null && expected !== undefined ? expected : '—');
    var actualText = Number.isFinite(Number(actual)) ? money(Number(actual)) : String(actual !== null && actual !== undefined ? actual : '—');

    nodes.branch.hidden = false;
    nodes.branchQuestion.textContent = 'Бюджет ' + operator + ' ' + expectedText + '?';
    nodes.branchRule.textContent = (output.field || 'budgetAmount') + ' ' + operator + ' ' + (expected !== null && expected !== undefined ? String(expected) : '—');

    var created = Boolean(clientStep && clientStep.output && clientStep.output.created === true);
    nodes.branchYes.classList.toggle('is-taken', passed);
    nodes.branchNo.classList.toggle('is-taken', !passed);
    nodes.branchYesNote.textContent = passed
      ? 'client.create · ' + (created ? 'выполнен' : 'status: ' + (clientStep ? clientStep.status : 'pending').toLowerCase())
      : 'client.create · не запускался';
    nodes.branchNoNote.textContent = passed
      ? 'client.create · не запускался'
      : 'client.create · ' + (clientStep && clientStep.status === 'SKIPPED' ? 'пропущен' : 'не запускался');

    nodes.branchReason.textContent = passed
      ? 'Получено: ' + actualText + ' — условие выполнено, выбрана ветка «Да», карточка клиента создана.'
      : 'Получено: ' + actualText + ' — условие не выполнено, выбрана ветка «Нет», создание клиента пропущено.';
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

  function setStep(step) {
    if (state.example) {
      nodes.stepGuide.hidden = true;
      return;
    }
    nodes.stepGuide.hidden = false;
    nodes.stepLabel.textContent = 'Шаг ' + step + ' из 3';
    var items = Array.prototype.slice.call(nodes.steps.querySelectorAll('li'));
    items.forEach(function (li, index) {
      var number = index + 1;
      li.classList.toggle('is-current', number === step);
      li.classList.toggle('is-done', number < step);
    });
  }

  function setStepFinished() {
    if (state.example) return;
    var items = Array.prototype.slice.call(nodes.steps.querySelectorAll('li'));
    items.forEach(function (li) {
      li.classList.remove('is-current');
      li.classList.add('is-done');
    });
    nodes.stepLabel.textContent = 'Готово';
  }

  function renderSession() {
    if (state.example) {
      nodes.actions.hidden = true;
      return;
    }
    nodes.actions.hidden = false;
    var hasSession = Boolean(state.session && state.session.telegramUrl);
    nodes.start.hidden = hasSession;
    nodes.telegramOpen.hidden = !hasSession;
    if (hasSession) nodes.telegramOpen.href = state.session.telegramUrl;
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

  function kvBlock(className, rows) {
    var block = create('div', 'exec-block ' + className);
    var label = create('p', 'exec-block-label', rows[0]);
    var list = create('dl', 'exec-kv');
    for (var i = 1; i < rows.length; i++) {
      var row = create('div');
      row.appendChild(create('dt', '', rows[i][0]));
      row.appendChild(create('dd', rows[i][2] || '', rows[i][1]));
      list.appendChild(row);
    }
    block.appendChild(label);
    block.appendChild(list);
    return block;
  }

  function conditionBlock(step) {
    var output = step.output && typeof step.output === 'object' ? step.output : {};
    var operator = output.operator === 'less than' ? '<' : '>';
    var condition = (output.field || 'budgetAmount') + ' ' + operator + ' ' +
      (output.expected !== null && output.expected !== undefined ? String(output.expected) : '—');
    var actualText = Number.isFinite(Number(output.actual)) ? money(Number(output.actual)) : String(output.actual !== null && output.actual !== undefined ? output.actual : '—');
    var passed = output.passed === true;
    return kvBlock('exec-condition', [
      'Проверка условия',
      ['Условие', condition],
      ['Получено', actualText],
      ['Результат', passed ? '✓ Условие выполнено' : '✕ Условие не выполнено', passed ? 'is-ok' : 'is-no'],
    ]);
  }

  function telegramBlock(step, lead) {
    var output = step.output && typeof step.output === 'object' ? step.output : {};
    var block = create('div', 'exec-block exec-telegram');
    block.appendChild(create('p', 'exec-block-label', 'Превью уведомления'));

    var bubble = create('div', 'tg-preview');
    bubble.appendChild(create('p', 'tg-preview-title', '🔔 Новая заявка'));
    var lines = [];
    if (lead && lead.name) lines.push(lead.name);
    if (lead && lead.serviceType) lines.push(lead.serviceType);
    if (lead && lead.budgetLabel) lines.push('Бюджет: ' + lead.budgetLabel);
    lines.push('Приоритет: ' + priorityLabel(lead));
    lines.forEach(function (line) { bubble.appendChild(create('p', '', line)); });
    bubble.appendChild(create('p', 'tg-preview-action', '[ Открыть заявку ]'));
    block.appendChild(bubble);

    var delivered = output.delivered === true;
    var note = delivered
      ? 'Уведомление отправлено успешно — менеджер увидел заявку в Telegram.'
      : 'Уведомление не отправлено: ' + (output.error || output.reason || 'неизвестная причина');
    block.appendChild(create('p', 'telegram-send-note' + (delivered ? ' is-sent' : ' is-failed'), note));
    return block;
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
      summaryCopy.appendChild(create('strong', 'workflow-step-name', NODE_LABELS[step.nodeId] || step.nodeId));
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
        var kindRow = create('p', 'exec-kind');
        kindRow.appendChild(create('span', 'exec-kind-name', NODE_KINDS[step.nodeId] || 'Этап'));
        kindRow.appendChild(create('span', 'exec-kind-status is-' + String(step.status || '').toLowerCase(), statusLabel(step.status)));
        detailView.appendChild(kindRow);

        detailView.appendChild(create('p', 'workflow-step-outcome', stepOutcome(step)));

        if (step.nodeId === 'check-budget') {
          var condition = conditionBlock(step);
          detailView.appendChild(condition);
        }

        if (step.nodeId === 'send-telegram') {
          var telegram = telegramBlock(step, result && result.lead);
          detailView.appendChild(telegram);
        }

        var inputRows = inputFacts(step, result && result.lead);
        if (inputRows.length) {
          var inputRowsBlock = [('INPUT')].concat(inputRows);
          var inputBlock = kvBlock('exec-input', inputRowsBlock);
          detailView.appendChild(inputBlock);
        }

        var actionBlock = create('div', 'exec-block exec-action');
        actionBlock.appendChild(create('p', 'exec-block-label', 'ACTION'));
        actionBlock.appendChild(create('code', 'exec-code', NODE_ACTIONS[step.nodeId] || step.nodeId));
        detailView.appendChild(actionBlock);

        if (step.nodeId !== 'check-budget' && step.nodeId !== 'send-telegram') {
          var rows = outputRows(step);
          if (rows.length) {
            var outputBlockRows = [('OUTPUT')].concat(rows);
            detailView.appendChild(kvBlock('exec-output', outputBlockRows));
          }
        }

        if (step.error) detailView.appendChild(create('p', 'workflow-step-error', step.error));

        var meta = create('div', 'workflow-step-meta');
        meta.appendChild(create('span', '', 'Started: ' + formatDate(step.startedAt)));
        meta.appendChild(create('span', '', 'Duration: ' + formatDuration(step.startedAt, step.finishedAt)));
        meta.appendChild(create('span', '', 'Status: ' + statusLabel(step.status)));
        detailView.appendChild(meta);
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

    executions.forEach(function (execution, index) {
      var executionStatus = displayExecutionStatus(execution);
      var row = create('div', 'execution-row');
      var meta = create('div', 'execution-meta');
      meta.appendChild(create('span', 'execution-id', executions.length > 1 ? 'Обработка #' + (index + 1) : 'Обработка заявки'));
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

    if (state.playbackActive) {
      var execution = primaryExecution(result);
      var currentIndex = execution && execution.steps ? Math.min(Math.floor(state.playbackPhase / 2), execution.steps.length - 1) : -1;
      var currentNode = currentIndex >= 0 && execution.steps[currentIndex] ? execution.steps[currentIndex].nodeId : null;
      nodes.resultView.appendChild(create('p', 'demo-result-copy',
        currentNode ? (NODE_PROGRESS_LABELS[currentNode] || 'Сохраняем результат этапа…') : 'Запускаем сценарий…'));
      nodes.resultView.appendChild(create('p', 'demo-result-note', 'Этапы можно раскрыть выше и посмотреть, что именно произошло внутри процесса.'));
      return;
    }

    if (!lead) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'Ждём результат обработки.'));
      nodes.resultView.appendChild(create('p', 'demo-result-note', 'После ответов боту здесь появится сводка: время выполнения, количество этапов и созданная карточка клиента.'));
      return;
    }

    if (failed) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'Сценарий завершился с ошибкой.'));
      var error = executions.find(function (execution) { return execution.error; });
      nodes.resultView.appendChild(create('p', 'demo-result-copy', error ? error.error : 'Откройте журнал выполнения для подробностей.'));
      return;
    }

    if (!complete) {
      nodes.resultView.appendChild(create('p', 'demo-result-copy', 'Заявка получена. Обрабатываем…'));
      nodes.resultView.appendChild(create('p', 'demo-result-note', 'Система проверяет условия и выполняет сценарий по этапам — сводка появится здесь автоматически.'));
      return;
    }

    var current = primaryExecution(result);
    var duration = formatDuration(current && current.startedAt, current && current.finishedAt);
    var steps = current && current.steps ? current.steps : [];
    var total = steps.length;
    var terminalCount = steps.filter(function (step) { return isTerminalStatus(step.status); }).length;
    var clientStep = findStep(current, 'create-client');
    var telegramStep = findStep(current, 'send-telegram');
    var clientCreated = Boolean(clientStep && clientStep.output && clientStep.output.created === true);
    var delivered = Boolean(telegramStep && telegramStep.output && telegramStep.output.delivered === true);

    var heading = create('p', 'demo-result-copy demo-result-heading');
    heading.appendChild(document.createTextNode('Готово — система обработала заявку за '));
    heading.appendChild(create('strong', '', duration));
    heading.appendChild(document.createTextNode('.'));
    nodes.resultView.appendChild(heading);

    var metrics = create('div', 'demo-result-metrics');
    [
      [terminalCount + ' / ' + total, 'этапов завершено'],
      [duration, 'обработка'],
      ['0', 'ручных действий'],
      [clientCreated ? '1' : '0', 'клиент создан'],
    ].forEach(function (metric) {
      var cell = create('div', 'demo-result-metric');
      cell.appendChild(create('b', '', metric[0]));
      cell.appendChild(create('span', '', metric[1]));
      metrics.appendChild(cell);
    });
    nodes.resultView.appendChild(metrics);

    var subhead = create('p', 'demo-result-subhead', 'Что получила система');
    nodes.resultView.appendChild(subhead);

    var checklist = create('ul', 'demo-result-check');
    [
      ['Заявка сохранена', true, ''],
      ['Клиент создан автоматически', clientCreated, clientCreated ? '' : '— ветка «Нет»: создание пропущено'],
      ['Менеджер уведомлён', delivered, delivered ? '' : '— уведомление не было доставлено'],
      ['История выполнения сохранена', true, ''],
    ].forEach(function (check) {
      var item = create('li', check[1] ? 'is-ok' : 'is-off');
      item.appendChild(create('span', '', check[0]));
      if (check[2]) item.appendChild(create('small', '', check[2]));
      checklist.appendChild(item);
    });
    nodes.resultView.appendChild(checklist);

    nodes.resultView.appendChild(create('p', 'demo-result-note', 'Реальные входные и выходные данные каждого шага доступны в журнале выше.'));
  }

  function render(result) {
    state.result = result;
    state.session = result && result.session ? result.session : state.session;
    renderSession();
    renderFlow(result);
    renderBranch(result);
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
    setStep(3);
    render(result);
    setStatus('Заявка получена. Обрабатываем…', 'loading');

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
      var finished = isFinished(result);
      if (finished) {
        setStepFinished();
        setStatus('Готово — система обработала заявку. Все этапы сохранены.', 'success');
      } else if (result.lead) {
        setStep(3);
        setStatus('Заявка получена. Обрабатываем…', 'loading');
      } else {
        setStatus('Ожидаем ответы в Telegram…', 'loading');
      }
      if (finished) stopPolling();
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

  function startDemoSession() {
    stopPolling();
    stopPlayback();
    setStatus('Создаём изолированную демо-сессию…', 'loading');
    request('/demo/session', { method: 'POST' }).then(function (session) {
      var token = extractToken(session.telegramUrl);
      if (!token) throw new Error('Сервер не вернул токен демо-сессии.');
      state.token = token;
      state.session = session;
      history.replaceState({}, '', '?token=' + encodeURIComponent(token));
      render({ session: session, lead: null, executions: [] });
      setStep(2);
      setStatus('Сессия создана. Ответьте на вопросы бота, затем вернитесь на сайт — заявка появится здесь.', 'loading');
      startPolling();
    }).catch(showError);
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
      setStatus('Готовый пример без подключения к серверу и Telegram.', 'success');
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
      setStep(2);
      setStatus('Загружаем демо-сессию…');
      refreshResult(true).then(function (ok) { if (ok && !state.playbackStarted) startPolling(); });
      return;
    }

    setStep(1);
    renderSession();
    setStatus('Выберите способ запуска демо.');
  }

  nodes.start.addEventListener('click', startDemoSession);
  nodes.example.addEventListener('click', showExample);
  nodes.retry.addEventListener('click', startNewSession);
  nodes.workflowExpand.addEventListener('click', function () { setWorkflowExpanded(true); });
  nodes.workflowCollapse.addEventListener('click', function () { setWorkflowExpanded(false); });
  load();
})();