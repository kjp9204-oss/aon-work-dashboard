(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STATUSES = ['접수', '진행 중', '확인 대기', '보류', '완료'];
  const CATEGORIES = ['운영·시설', '직원·교육', '회의·행사', '블로그·홍보'];
  let tasks = [], events = [], user = null;
  let loaded = false, loading = false, saving = false, page = 'overview', quickFilter = '', mine = false;
  let taskEdit = null, eventEdit = null, toastTimer;
  const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const isDialogOpen = () => $('taskDialog').open || $('eventDialog').open;
  function todayISO() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function offsetDate(date, days) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function weekDates(today) { const day = new Date(`${today}T00:00:00Z`).getUTCDay(); const start = offsetDate(today, -((day + 6) % 7)); return Array.from({ length: 7 }, (_, i) => offsetDate(start, i)); }
  function dateText(date, long = false) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', ...(long ? { year: 'numeric' } : {}), month: 'long', day: 'numeric', ...(long ? { weekday: 'long' } : {}) }).format(new Date(`${date}T00:00:00Z`)); }
  function timeText(date) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date); }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000); }
  function setStatus(text, state = '') { $('serverStatus').textContent = text; $('serverStatus').dataset.state = state; }
  function errorText(error) {
    if (error.status === 401) return '로그인 시간이 만료되었습니다. 다시 로그인해 주세요. 작성 중인 내용은 이 창에 남아 있습니다.';
    if (error.name === 'AbortError') return '서버 응답이 늦어 완료 여부를 확인하지 못했습니다. 입력은 남겨 두었습니다. 잠시 후 다시 시도해 주세요.';
    return error.message || '서버와 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  }
  function showConnectionError(error) {
    setStatus('연결 오류', 'error'); $('connectionMessage').textContent = errorText(error); $('connectionError').hidden = false;
    $('signInLink').hidden = error.status !== 401;
    if (error.status === 401) {
      user = null; $('accountName').textContent = '다시 로그인 필요';
      $('signInLink').target = isDialogOpen() ? '_blank' : '_self'; $('signInLink').rel = 'noopener noreferrer';
      $('taskAuthRecovery').hidden = !$('taskDialog').open; $('eventAuthRecovery').hidden = !$('eventDialog').open;
    }
    updateControls();
  }
  function clearConnectionError() { $('connectionError').hidden = true; $('signInLink').hidden = true; }
  function updateControls() {
    const disabled = !user || !loaded || loading || saving;
    $('addTask').disabled = disabled; $('addEvent').disabled = disabled; $('downloadBackup').disabled = !loaded || saving;
    $('refreshData').disabled = loading || saving;
    $('saveTask').disabled = saving || !user; $('saveEvent').disabled = saving || !user;
    document.querySelectorAll('#taskForm input, #taskForm select, #taskForm textarea, #eventForm input').forEach(input => { input.disabled = saving; });
    for (const id of ['closeDialog', 'cancelDialog', 'closeEventDialog', 'cancelEventDialog', 'reloadTask', 'reloadEvent', 'taskResumeSession', 'eventResumeSession']) $(id).disabled = saving;
  }
  async function api(path, options = {}) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: controller.signal });
      let body;
      try { body = await response.json(); } catch (_) { body = null; }
      if (!response.ok) { const err = new Error(body?.error?.message || `서버 요청을 완료하지 못했습니다. (${response.status})`); err.status = response.status; err.code = body?.error?.code; throw err; }
      if (!body) throw new Error('서버 응답 형식을 확인하지 못했습니다. 새로고침해 주세요.');
      return body;
    } finally { clearTimeout(timeout); }
  }
  async function refresh({ silent = false } = {}) {
    if (loading || saving) return;
    if (isDialogOpen()) { if (!silent) toast('작성 중인 내용을 저장하거나 창을 닫은 뒤 새로고침해 주세요.'); return; }
    loading = true; updateControls(); if (!silent) setStatus('불러오는 중');
    try {
      if (!user) {
        const session = await api('/api/session');
        if (!session.user || typeof session.user.id !== 'string') throw new Error('로그인 계정을 확인하지 못했습니다. 다시 로그인해 주세요.');
        user = session.user; $('accountName').textContent = user.displayName || '연결된 계정';
      }
      const [taskData, eventData] = await Promise.all([api('/api/tasks'), api('/api/events')]);
      if (!Array.isArray(taskData.tasks) || !Array.isArray(eventData.events)) throw new Error('업무 목록 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
      tasks = taskData.tasks; events = eventData.events; loaded = true; clearConnectionError();
      setStatus('서버 저장'); $('lastUpdated').textContent = `${timeText(new Date())}에 서버 내용 확인 · 한국 시간`;
      renderOwners(); render();
    } catch (error) {
      showConnectionError(error);
      if (!loaded) { $('emptyTasks').textContent = '업무를 불러오지 못했습니다. 위 안내를 확인한 뒤 새로고침해 주세요.'; $('emptyTasks').hidden = false; }
    } finally { loading = false; updateControls(); }
  }
  async function resumeSession() {
    if (saving || loading) return;
    saving = true; updateControls(); setStatus('로그인 확인 중');
    const errorElement = $($('taskDialog').open ? 'formError' : 'eventFormError');
    try {
      const session = await api('/api/session');
      if (!session.user || typeof session.user.id !== 'string') throw new Error('로그인 계정을 확인하지 못했습니다. 새 창에서 로그인을 마친 뒤 다시 눌러 주세요.');
      user = session.user; $('accountName').textContent = user.displayName || '연결된 계정';
      clearConnectionError(); $('taskAuthRecovery').hidden = true; $('eventAuthRecovery').hidden = true;
      errorElement.textContent = ''; setStatus('로그인 확인 · 작성 내용 유지');
      toast('로그인을 확인했습니다. 작성한 내용을 그대로 저장할 수 있습니다.');
    } catch (error) { errorElement.textContent = errorText(error); showConnectionError(error); }
    finally { saving = false; updateControls(); }
  }
  function active(task) { return task.status !== '완료' && task.status !== '보류'; }
  function badgeClass(status) { return ({ '진행 중': 'progress', '확인 대기': 'waiting', '완료': 'done', '보류': 'hold' })[status] || ''; }
  function resetFilters() { mine = false; quickFilter = ''; $('searchTasks').value = ''; $('ownerFilter').value = ''; $('statusFilter').value = ''; }
  function renderOwners() {
    const chosen = $('ownerFilter').value;
    const taskOwners = [...new Set(tasks.map(t => t.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    $('ownerFilter').replaceChildren(new Option('모든 담당자', ''));
    for (const owner of taskOwners) $('ownerFilter').add(new Option(owner, owner));
    if (taskOwners.includes(chosen)) $('ownerFilter').value = chosen;
    const suggestions = [...new Set([...taskOwners, ...events.map(e => e.owner), user?.displayName].filter(Boolean))];
    $('ownerSuggestions').replaceChildren(...suggestions.map(owner => new Option(owner, owner)));
  }
  function render() {
    const today = todayISO(), dates = weekDates(today);
    $('todayLabel').textContent = dateText(today, true);
    $('weekLabel').textContent = `${dateText(dates[0])} — ${dateText(dates[6])}`;
    $('calendarRange').textContent = `${dateText(dates[0], true)} — ${dateText(dates[6], true)}`;
    if (loaded) {
      $('todayCount').textContent = tasks.filter(t => active(t) && t.due === today).length;
      $('overdueCount').textContent = tasks.filter(t => active(t) && t.due && t.due < today).length;
      $('waitingCount').textContent = tasks.filter(t => t.status === '확인 대기').length;
      $('weekCount').textContent = events.filter(e => dates.includes(e.date)).length;
    }
    const query = $('searchTasks').value.trim().toLowerCase(), owner = $('ownerFilter').value, status = $('statusFilter').value;
    const visible = tasks.filter(t => (!mine || t.createdBy === user?.id) && (!owner || t.owner === owner) && (!status || t.status === status) && (!query || `${t.title} ${t.next} ${t.category} ${t.owner}`.toLowerCase().includes(query)) && (!quickFilter || (quickFilter === 'today' && active(t) && t.due === today) || (quickFilter === 'overdue' && active(t) && t.due && t.due < today) || (quickFilter === 'waiting' && t.status === '확인 대기')));
    if (loaded) $('taskCount').textContent = visible.length;
    $('taskRows').replaceChildren();
    visible.forEach(task => {
      const tr = node('tr'), main = node('td', 'task-main'), meta = node('div', 'task-meta');
      meta.append(node('span', 'category-label', task.category));
      const title = node('button', 'task-title', task.title); title.type = 'button'; title.addEventListener('click', () => openTask(task.id));
      main.append(meta, title, node('p', 'task-next', task.next || '다음 행동을 정해 주세요.'));
      const overdue = active(task) && task.due && task.due < today;
      const due = node('td', `date-cell${overdue ? ' overdue' : ''}`, task.due ? `${task.due.slice(5).replace('-', '. ')}${overdue ? ' · 지남' : ''}` : '미정');
      const statusCell = node('td'); statusCell.append(node('span', `pill ${badgeClass(task.status)}`, task.status));
      tr.append(main, node('td', 'owner-cell', task.owner), due, statusCell); $('taskRows').append(tr);
    });
    if (loaded) { $('emptyTasks').textContent = tasks.length ? '조건에 맞는 업무가 없습니다.' : '등록된 업무가 없습니다. ‘업무 등록’으로 첫 업무를 추가하세요.'; $('emptyTasks').hidden = visible.length !== 0; }
    $('allTasks').classList.toggle('selected', !mine); $('myTasks').classList.toggle('selected', mine);
    $('allTasks').setAttribute('aria-pressed', String(!mine)); $('myTasks').setAttribute('aria-pressed', String(mine));
    $('filterDescription').textContent = ({ today: '오늘 마감 · 미완료', overdue: '마감 지난 업무', waiting: '확인 대기' })[quickFilter] || (mine ? '내가 등록한 업무' : '전체 업무');
    $('overviewLayout').hidden = page === 'calendar'; $('calendarView').hidden = page !== 'calendar';
    $('overviewLayout').classList.toggle('tasks-only', page === 'tasks');
    document.querySelectorAll('[data-page]').forEach(button => { const selected = button.dataset.page === page; button.classList.toggle('active', selected); if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    const title = ({ overview: '오늘의 센터', tasks: '업무 · 전달 메모', calendar: '센터 일정' })[page];
    $('pageTitle').textContent = title; $('breadcrumbCurrent').textContent = title;
    $('pageDescription').textContent = ({ overview: '오늘 할 일과 센터 일정, 다음 행동을 확인하세요.', tasks: '담당자와 마감, 다음 행동을 한곳에서 확인하세요.', calendar: '회의와 교육 일정을 미리 확인하고 준비하세요.' })[page];
    renderEvents(today, dates);
  }
  function renderEvents(today, dates) {
    const sorted = [...events].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const daily = sorted.filter(event => event.date === today); $('todayEvents').replaceChildren();
    daily.forEach(event => {
      const item = node('button', 'event event-button'); item.type = 'button'; item.addEventListener('click', () => openEvent(event.id));
      const detail = node('span'); detail.append(node('b', '', event.title), node('small', '', event.owner)); item.append(node('time', '', event.time), detail); $('todayEvents').append(item);
    });
    if (!daily.length) $('todayEvents').append(node('p', 'empty-events', loaded ? '오늘 등록된 일정이 없습니다.' : '일정을 불러오는 중입니다.'));
    $('calendarDays').replaceChildren();
    dates.forEach((date, index) => {
      const label = ['월', '화', '수', '목', '금', '토', '일'][index], cell = node('div', `calendar-day${date === today ? ' today' : ''}`);
      cell.append(node('span', '', `${label}요일${date === today ? ' · 오늘' : ''}`), node('strong', '', String(Number(date.slice(8)))));
      const dayEvents = sorted.filter(event => event.date === date);
      dayEvents.forEach(event => {
        const item = node('button', 'calendar-event'); item.type = 'button'; item.append(node('time', '', event.time), node('b', '', event.title), node('small', '', event.owner)); item.addEventListener('click', () => openEvent(event.id)); cell.append(item);
      });
      if (loaded && !dayEvents.length) cell.append(node('p', 'empty-calendar', '일정 없음'));
      $('calendarDays').append(cell);
    });
    $('allEvents').replaceChildren();
    sorted.forEach(event => {
      const item = node('button', 'all-event-button'); item.type = 'button';
      item.append(node('time', '', `${event.date.replaceAll('-', '. ')} · ${event.time}`), node('b', '', event.title), node('small', '', event.owner));
      item.addEventListener('click', () => openEvent(event.id)); $('allEvents').append(item);
    });
    if (!sorted.length) $('allEvents').append(node('p', 'empty-events', loaded ? '등록된 일정이 없습니다. ‘일정 등록’으로 추가하세요.' : '일정을 불러오는 중입니다.'));
  }
  function openTask(id) {
    if (!user || !loaded || loading || saving) return;
    const task = id ? tasks.find(item => item.id === id) : null;
    taskEdit = { id: task?.id || crypto.randomUUID(), revision: task?.revision, isNew: !task };
    $('taskIdLabel').textContent = task ? '업무 상세' : '새 업무'; $('dialogTitle').textContent = task ? '업무 상세' : '업무 등록';
    $('taskTitle').value = task?.title || ''; $('taskOwner').value = task?.owner || (user.displayName || '').slice(0, 40);
    $('taskStatus').value = task?.status || '접수'; $('taskCategory').value = task?.category || '운영·시설';
    $('taskDue').value = task?.due ?? todayISO(); $('taskNext').value = task?.next || '';
    $('taskResult').hidden = task?.result !== 'blog.html'; $('formError').textContent = ''; $('reloadTask').hidden = true; $('taskAuthRecovery').hidden = true;
    if (!$('taskDialog').open) $('taskDialog').showModal(); $('taskTitle').focus();
  }
  function openEvent(id) {
    if (!user || !loaded || loading || saving) return;
    const event = id ? events.find(item => item.id === id) : null;
    eventEdit = { id: event?.id || crypto.randomUUID(), revision: event?.revision, isNew: !event };
    $('eventDialogTitle').textContent = event ? '일정 상세' : '일정 등록';
    $('eventTitle').value = event?.title || ''; $('eventOwner').value = event?.owner || (user.displayName || '').slice(0, 40);
    $('eventDate').value = event?.date || todayISO(); $('eventTime').value = event?.time || '09:00';
    $('eventFormError').textContent = ''; $('reloadEvent').hidden = true; $('eventAuthRecovery').hidden = true;
    if (!$('eventDialog').open) $('eventDialog').showModal(); $('eventTitle').focus();
  }
  async function persist(kind, input) {
    if (saving || !user || !loaded) return;
    const isTask = kind === 'task', edit = isTask ? taskEdit : eventEdit;
    const errorElement = $(isTask ? 'formError' : 'eventFormError'), reloadButton = $(isTask ? 'reloadTask' : 'reloadEvent');
    errorElement.textContent = ''; reloadButton.hidden = true;
    if (!input.title || !input.owner) { errorElement.textContent = '제목과 담당자를 입력해 주세요.'; return; }
    if (isTask && (!STATUSES.includes(input.status) || !CATEGORIES.includes(input.category))) { errorElement.textContent = '상태와 분야를 다시 확인해 주세요.'; return; }
    saving = true; updateControls(); setStatus('서버에 저장 중');
    try {
      const path = `/api/${isTask ? 'tasks' : 'events'}${edit.isNew ? '' : `/${encodeURIComponent(edit.id)}`}`;
      const body = edit.isNew ? { id: edit.id, ...input } : { ...input, revision: edit.revision };
      const result = await api(path, { method: edit.isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      const item = result[kind];
      if (!item || item.id !== edit.id) throw new Error('저장 결과를 확인하지 못했습니다. 입력 내용을 유지합니다.');
      if (isTask) tasks = [item, ...tasks.filter(task => task.id !== item.id)]; else events = [item, ...events.filter(event => event.id !== item.id)];
      $(isTask ? 'taskDialog' : 'eventDialog').close(); clearConnectionError(); renderOwners(); render();
      setStatus('서버 저장'); $('lastUpdated').textContent = `${timeText(new Date())}에 변경 사항 저장 · 한국 시간`; toast(`${isTask ? '업무를' : '일정을'} 서버에 저장했습니다.`);
    } catch (error) {
      if (error.status === 409) {
        errorElement.textContent = '서버의 내용이 변경되어 저장하지 않았습니다. 현재 입력은 유지됩니다. 아래 버튼으로 최신 내용을 확인한 뒤 다시 수정해 주세요.';
        reloadButton.hidden = false; setStatus('저장 충돌 · 입력 유지', 'error');
      } else {
        errorElement.textContent = errorText(error); setStatus('저장 확인 실패 · 입력 유지', 'error');
        if (error.status === 401) showConnectionError(error);
      }
    } finally { saving = false; updateControls(); }
  }
  async function reloadConflicted(kind) {
    if (saving || !window.confirm('지금 작성한 내용을 버리고 서버의 최신 내용을 불러올까요?')) return;
    const isTask = kind === 'task', edit = isTask ? taskEdit : eventEdit, errorElement = $(isTask ? 'formError' : 'eventFormError');
    saving = true; updateControls();
    try {
      const result = await api(`/api/${isTask ? 'tasks' : 'events'}`), list = isTask ? result.tasks : result.events;
      if (!Array.isArray(list) || !list.some(item => item.id === edit.id)) throw new Error('서버에서 해당 항목을 찾지 못했습니다. 현재 입력은 남겨 두었습니다.');
      if (isTask) tasks = list; else events = list;
      saving = false; clearConnectionError(); renderOwners(); render();
      if (isTask) openTask(edit.id); else openEvent(edit.id);
      setStatus('최신 내용 불러옴'); toast('서버의 최신 내용을 불러왔습니다. 내용을 확인하고 수정해 주세요.');
    } catch (error) { errorElement.textContent = errorText(error); if (error.status === 401) showConnectionError(error); }
    finally { saving = false; updateControls(); }
  }
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => { page = button.dataset.page; render(); }));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { if (button.dataset.filter === 'week') { page = 'calendar'; render(); return; } resetFilters(); quickFilter = button.dataset.filter; page = 'tasks'; render(); }));
  $('openCalendar').addEventListener('click', () => { page = 'calendar'; render(); });
  $('allTasks').addEventListener('click', () => { mine = false; render(); });
  $('myTasks').addEventListener('click', () => { mine = true; $('ownerFilter').value = ''; render(); });
  ['searchTasks', 'ownerFilter', 'statusFilter'].forEach(id => $(id).addEventListener(id === 'searchTasks' ? 'input' : 'change', render));
  $('clearFilters').addEventListener('click', () => { resetFilters(); render(); });
  $('addTask').addEventListener('click', () => openTask()); $('addEvent').addEventListener('click', () => openEvent());
  $('refreshData').addEventListener('click', () => refresh());
  for (const id of ['closeDialog', 'cancelDialog']) $(id).addEventListener('click', () => { if (!saving) $('taskDialog').close(); });
  for (const id of ['closeEventDialog', 'cancelEventDialog']) $(id).addEventListener('click', () => { if (!saving) $('eventDialog').close(); });
  for (const id of ['taskDialog', 'eventDialog']) $(id).addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('reloadTask').addEventListener('click', () => reloadConflicted('task')); $('reloadEvent').addEventListener('click', () => reloadConflicted('event'));
  $('taskResumeSession').addEventListener('click', resumeSession); $('eventResumeSession').addEventListener('click', resumeSession);
  $('taskForm').addEventListener('submit', event => { event.preventDefault(); persist('task', { title: $('taskTitle').value.trim(), owner: $('taskOwner').value.trim(), category: $('taskCategory').value, due: $('taskDue').value, status: $('taskStatus').value, next: $('taskNext').value.trim() }); });
  $('eventForm').addEventListener('submit', event => { event.preventDefault(); persist('event', { title: $('eventTitle').value.trim(), owner: $('eventOwner').value.trim(), date: $('eventDate').value, time: $('eventTime').value }); });
  $('downloadBackup').addEventListener('click', () => {
    if (!loaded) return;
    const backup = { format: 'aon-work-backup-v1', exportedAt: new Date().toISOString(), timeZone: 'Asia/Seoul', tasks, events };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = `AON_업무일정_${todayISO()}_${timeText(new Date()).replaceAll(':', '')}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('현재 불러온 업무·일정을 백업했습니다. 로그인 정보는 포함하지 않습니다.');
  });
  window.addEventListener('focus', () => { if (!document.hidden && !isDialogOpen()) refresh({ silent: true }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !isDialogOpen()) refresh({ silent: true }); });
  setInterval(() => { if (!document.hidden && !isDialogOpen()) refresh({ silent: true }); }, 25000);
  window.addEventListener('beforeunload', event => { if (saving || isDialogOpen()) { event.preventDefault(); event.returnValue = ''; } });
  render(); updateControls(); refresh();
})();
