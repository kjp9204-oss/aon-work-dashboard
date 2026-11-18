(() => {
  'use strict';
  const TODAY = '2026-11-18';
  const STORE = 'aon-dashboard-preview-20261118-v2';
  const STATUSES = ['접수', '진행 중', '확인 대기', '보류', '완료'];
  const OWNERS = ['운영담당', '교육담당', '콘텐츠담당'];
  const CATEGORIES = ['운영·시설', '직원·교육', '회의·행사', '블로그·홍보'];
  const seed = [
    { id: 'AON-101', title: '이번 주 운영회의 자료 정리', category: '회의·행사', owner: '운영담당', due: '2026-11-18', status: '진행 중', next: '회의 안건과 담당별 진행 상황 모으기' },
    { id: 'AON-102', title: '운동은 꼭 30분씩 해야 할까요?', category: '블로그·홍보', owner: '콘텐츠담당', due: '2026-11-18', status: '확인 대기', next: '원고·이미지·검수 결과를 최종 확인하기', result: 'blog.html' },
    { id: 'AON-103', title: '운동 소도구 점검 목록 작성', category: '운영·시설', owner: '운영담당', due: '2026-11-17', status: '진행 중', next: '점검 항목을 확인하고 다음 조치 정하기' },
    { id: 'AON-104', title: '직원 교육 실습 자료 준비', category: '직원·교육', owner: '교육담당', due: '2026-11-19', status: '진행 중', next: '실습 순서와 준비물 확인하기' },
    { id: 'AON-105', title: '주말 센터 운영 일정 확인', category: '운영·시설', owner: '운영담당', due: '2026-11-18', status: '접수', next: '토요일 운영 담당과 일정 확인하기' },
    { id: 'AON-106', title: '센터 안내문 문구 검토', category: '블로그·홍보', owner: '콘텐츠담당', due: '2026-11-20', status: '확인 대기', next: '확인된 운영 정보와 문구 대조하기' },
    { id: 'AON-107', title: '이번 주 교육 참석 안내', category: '직원·교육', owner: '교육담당', due: '2026-11-17', status: '완료', next: '가상 예시: 안내문 작성과 확인 완료' }
  ];
  const events = [
    { date: '2026-11-16', time: '09:30', title: '주간 운영 점검', owner: '운영담당' },
    { date: TODAY, time: '10:00', title: '센터 운영 브리핑', owner: '운영담당 · 회의 공간' },
    { date: TODAY, time: '14:00', title: '직원 교육 준비 미팅', owner: '교육담당 · 교육 공간' },
    { date: TODAY, time: '16:30', title: '블로그 최종본 확인', owner: '콘텐츠담당 · 온라인' },
    { date: '2026-11-20', time: '15:00', title: '직원 실습 교육', owner: '교육담당' }
  ];
  const $ = id => document.getElementById(id);
  const copySeed = () => seed.map(task => ({ ...task }));
  let tasks = copySeed();
  let storageNotice = '';
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(isValidTask) || new Set(parsed.map(t => t.id)).size !== parsed.length) throw new Error('invalid');
      tasks = parsed;
    }
  } catch (_) { storageNotice = '시안 저장값을 읽지 못해 기본 예시를 표시합니다.'; }
  let page = 'overview';
  let quickFilter = '';
  let mine = false;
  let editId = null;
  let toastTimer;
  function isValidTask(t) {
    return t && typeof t.id === 'string' && t.id.length < 80 && typeof t.title === 'string' && t.title.length > 0 && t.title.length <= 100 && OWNERS.includes(t.owner) && STATUSES.includes(t.status) && CATEGORIES.includes(t.category) && typeof t.next === 'string' && t.next.length <= 300 && typeof t.due === 'string' && (!t.due || /^\d{4}-\d{2}-\d{2}$/.test(t.due)) && (!t.result || t.result === 'blog.html');
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(tasks)); return true; } catch (_) { toast('저장 공간을 사용할 수 없어 이 화면에서만 변경됩니다.'); return false; } }
  function active(t) { return t.status !== '완료' && t.status !== '보류'; }
  function badgeClass(status) { return ({ '진행 중': 'progress', '확인 대기': 'waiting', '완료': 'done', '보류': 'hold' })[status] || ''; }
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function resetFilters() { mine = false; quickFilter = ''; $('searchTasks').value = ''; $('ownerFilter').value = ''; $('statusFilter').value = ''; }
  function render() {
    $('todayCount').textContent = tasks.filter(t => active(t) && t.due === TODAY).length;
    $('overdueCount').textContent = tasks.filter(t => active(t) && t.due && t.due < TODAY).length;
    $('waitingCount').textContent = tasks.filter(t => t.status === '확인 대기').length;
    $('weekCount').textContent = events.filter(e => e.date >= '2026-11-16' && e.date <= '2026-11-22').length;
    const query = $('searchTasks').value.trim().toLowerCase();
    const owner = $('ownerFilter').value;
    const status = $('statusFilter').value;
    const visible = tasks.filter(t => (!mine || t.owner === '운영담당') && (!owner || t.owner === owner) && (!status || t.status === status) && (!query || `${t.title} ${t.next} ${t.category}`.toLowerCase().includes(query)) && (!quickFilter || (quickFilter === 'today' && active(t) && t.due === TODAY) || (quickFilter === 'overdue' && active(t) && t.due && t.due < TODAY) || (quickFilter === 'waiting' && t.status === '확인 대기')));
    $('taskCount').textContent = visible.length;
    $('taskRows').replaceChildren();
    visible.forEach(t => {
      const tr = node('tr');
      const main = node('td', 'task-main');
      const meta = node('div', 'task-meta'); meta.append(node('span', '', t.id), node('span', 'category-label', t.category));
      const title = node('button', 'task-title', t.title); title.type = 'button'; title.addEventListener('click', () => openTask(t.id));
      main.append(meta, title, node('p', 'task-next', t.next || '다음 행동을 정해 주세요.'));
      const date = node('td', `date-cell${active(t) && t.due && t.due < TODAY ? ' overdue' : ''}`, t.due ? `${t.due.slice(5).replace('-', '. ')}${active(t) && t.due < TODAY ? ' · 지남' : ''}` : '미정');
      const statusCell = node('td'); statusCell.append(node('span', `pill ${badgeClass(t.status)}`, t.status));
      tr.append(main, node('td', 'owner-cell', t.owner), date, statusCell); $('taskRows').append(tr);
    });
    $('emptyTasks').hidden = visible.length !== 0;
    $('allTasks').classList.toggle('selected', !mine); $('myTasks').classList.toggle('selected', mine);
    $('allTasks').setAttribute('aria-pressed', String(!mine)); $('myTasks').setAttribute('aria-pressed', String(mine));
    $('filterDescription').textContent = ({ today: '오늘 마감 · 미완료', overdue: '마감 지난 업무', waiting: '확인 대기' })[quickFilter] || (mine ? '운영담당의 업무' : '전체 업무');
    $('overviewLayout').hidden = page === 'calendar'; $('calendarView').hidden = page !== 'calendar';
    $('overviewLayout').classList.toggle('tasks-only', page === 'tasks');
    document.querySelectorAll('[data-page]').forEach(b => { const selected = b.dataset.page === page; b.classList.toggle('active', selected); if (selected) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('pageTitle').textContent = ({ overview: '오늘의 센터', tasks: '업무 · 전달 메모', calendar: '센터 일정' })[page];
    $('breadcrumbCurrent').textContent = ({ overview: '오늘의 센터', tasks: '업무 · 전달 메모', calendar: '센터 일정' })[page];
    $('pageDescription').textContent = ({ overview: '오늘 할 일과 센터 일정, 블로그 진행 상황을 확인하세요.', tasks: '담당자와 마감, 다음 행동을 한곳에서 확인하세요.', calendar: '회의와 교육 일정을 미리 확인하고 준비하세요.' })[page];
  }
  function renderEvents() {
    const today = events.filter(e => e.date === TODAY).sort((a,b) => a.time.localeCompare(b.time));
    $('todayEvents').replaceChildren(); today.forEach(e => { const item = node('div', 'event'); const detail = node('div'); detail.append(node('b', '', e.title), node('small', '', e.owner)); item.append(node('time', '', e.time), detail); $('todayEvents').append(item); });
    const days = ['월', '화', '수', '목', '금', '토', '일'];
    days.forEach((label, index) => { const day = 16 + index; const date = `2026-11-${day}`; const cell = node('div', `calendar-day${date === TODAY ? ' today' : ''}`); cell.append(node('span', '', `${label}요일${date === TODAY ? ' · 오늘' : ''}`), node('strong', '', String(day))); events.filter(e => e.date === date).forEach(e => { const ev = node('article', 'calendar-event'); ev.append(node('time', '', e.time), node('b', '', e.title), node('small', '', e.owner)); cell.append(ev); }); $('calendarDays').append(cell); });
  }
  function setPage(next) { page = next; render(); }
  function openTask(id) {
    const task = id ? tasks.find(t => t.id === id) : null;
    editId = task ? task.id : null;
    $('taskIdLabel').textContent = task ? task.id : 'NEW TASK';
    $('dialogTitle').textContent = task ? '업무 상세' : '업무 등록';
    $('taskTitle').value = task ? task.title : '';
    $('taskOwner').value = task ? task.owner : '운영담당';
    $('taskStatus').value = task ? task.status : '접수';
    $('taskCategory').value = task ? task.category : '운영·시설';
    $('taskDue').value = task ? task.due : TODAY;
    $('taskNext').value = task ? task.next : '';
    $('taskResult').hidden = !(task && task.result);
    $('formError').textContent = '';
    $('taskDialog').showModal();
  }
  document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => setPage(b.dataset.page)));
  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { if (b.dataset.filter === 'week') { setPage('calendar'); return; } resetFilters(); quickFilter = b.dataset.filter; setPage('tasks'); }));
  $('openCalendar').addEventListener('click', () => setPage('calendar'));
  $('allTasks').addEventListener('click', () => { mine = false; render(); });
  $('myTasks').addEventListener('click', () => { mine = true; $('ownerFilter').value = ''; render(); });
  ['searchTasks', 'ownerFilter', 'statusFilter'].forEach(id => $(id).addEventListener(id === 'searchTasks' ? 'input' : 'change', render));
  $('clearFilters').addEventListener('click', () => { resetFilters(); render(); });
  $('addTask').addEventListener('click', () => openTask(null));
  $('refreshPreview').addEventListener('click', () => window.location.reload());
  ['closeDialog', 'cancelDialog'].forEach(id => $(id).addEventListener('click', () => $('taskDialog').close()));
  $('taskDialog').addEventListener('click', event => { if (event.target === $('taskDialog')) { const bounds = $('taskDialog').getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('taskDialog').close(); } });
  $('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('taskTitle').value.trim();
    if (!title) { $('formError').textContent = '업무 제목을 입력해 주세요.'; return; }
    if (!editId && tasks.some(t => t.title === title && t.status !== '완료')) { $('formError').textContent = '같은 제목의 미완료 업무가 있습니다. 기존 업무를 확인해 주세요.'; return; }
    const previous = editId ? tasks.find(t => t.id === editId) : null;
    const task = { id: editId || `AON-${Date.now().toString(36).toUpperCase()}`, title, owner: $('taskOwner').value, status: $('taskStatus').value, category: $('taskCategory').value, due: $('taskDue').value, next: $('taskNext').value.trim() };
    if (previous && previous.result) task.result = previous.result;
    if (!isValidTask(task)) { $('formError').textContent = '입력한 항목을 다시 확인해 주세요.'; return; }
    if (editId) tasks = tasks.map(t => t.id === editId ? task : t); else tasks.unshift(task);
    const persisted = save(); $('taskDialog').close(); render(); if (persisted) toast('시안에 저장했습니다. 실제 센터 업무에는 반영되지 않습니다.');
  });
  $('resetDemo').addEventListener('click', () => $('resetDialog').showModal());
  ['closeResetDialog', 'cancelResetDialog'].forEach(id => $(id).addEventListener('click', () => $('resetDialog').close()));
  $('confirmResetDialog').addEventListener('click', () => {
    tasks = copySeed();
    const persisted = save();
    resetFilters();
    render();
    $('resetDialog').close();
    toast(persisted ? '처음 예시로 되돌렸습니다.' : '화면의 예시를 초기화했습니다. 저장 공간은 사용할 수 없습니다.');
  });
  renderEvents(); render(); if (storageNotice) toast(storageNotice);
})();
