import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleAonRequest, MAX_BODY_BYTES } from '../lib/aon-api.mjs';

const ORIGIN = 'https://aon-work-dashboard.example.test';
const FIRST_ID = '418d5270-21ef-4a4a-b666-a7947be62333';
const SECOND_ID = '518d5270-21ef-4a4a-b666-a7947be62333';
const USER = { userId: 'test-site-user-1', displayName: '담당자' };
const OTHER = { userId: 'test-site-user-2', displayName: '다른 담당자' };
const TIME = '2026-11-18T12:00:00.000Z';
const baseTask = () => ({ id: FIRST_ID, title: '테스트 회의 준비', category: '회의·행사', owner: '담당자', due: '2026-11-20', status: '접수', next: '의제 작성' });
const baseEvent = () => ({ id: SECOND_ID, title: '테스트 직원 교육', owner: '교육 담당', date: '2026-11-21', time: '09:30' });

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  const files = readdirSync(migrations).filter(name => name.endsWith('.sql')).sort();
  assert.ok(files.length > 0, 'Generated production migration is required');
  for (const file of files) sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  t.after(() => sqlite.close());
  const queries = [];
  let accesses = 0;
  const database = {
    prepare(sql) {
      queries.push(sql);
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
      };
      return statement;
    },
  };
  async function request(path, method = 'GET', body, options = {}) {
    const headers = { ...(method === 'GET' ? {} : { 'content-type': 'application/json', origin: ORIGIN }), ...options.headers };
    for (const key of Object.keys(headers)) if (headers[key] === null) delete headers[key];
    const req = new Request(ORIGIN + path, { method, headers, ...(body !== undefined ? { body: options.raw ? body : JSON.stringify(body) } : {}) });
    const response = await handleAonRequest(req, {
      user: Object.hasOwn(options, 'user') ? options.user : USER,
      getDatabase() { accesses++; return options.noDb ? undefined : database; },
      now: () => TIME,
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { request, sqlite, queries, accesses: () => accesses };
}

test('all routes reject missing authenticated identity before any database access', async t => {
  const f = fixture(t);
  for (const [path, method, body] of [['/api/session', 'GET'], ['/api/tasks', 'GET'], ['/api/events', 'POST', baseEvent()], [`/api/tasks/${FIRST_ID}`, 'PATCH', { revision: 1, title: '수정' }]]) {
    const result = await f.request(path, method, body, { user: null });
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'AUTH_REQUIRED');
  }
  assert.equal(f.accesses(), 0);
});

test('session returns only public identity and real empty lists stay empty', async t => {
  const f = fixture(t);
  const session = await f.request('/api/session');
  assert.deepEqual(session.body, { user: { id: USER.userId, displayName: USER.displayName }, storage: 'server' });
  assert.equal(f.accesses(), 0);
  assert.deepEqual((await f.request('/api/tasks')).body, { tasks: [], serverTime: TIME });
  assert.deepEqual((await f.request('/api/events')).body, { events: [], serverTime: TIME });
  assert.match(session.headers.get('cache-control'), /no-store/);
});

test('mutations reject missing, cross-site and mismatched Origin before DB access', async t => {
  const f = fixture(t);
  for (const headers of [{ origin: null }, { origin: 'https://evil.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    const result = await f.request('/api/tasks', 'POST', baseTask(), { headers });
    assert.equal(result.status, 403);
  }
  assert.equal((await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { title: '수정', revision: 1 }, { headers: { origin: null } })).status, 403);
  assert.equal(f.accesses(), 0);
});

test('body validation requires JSON and rejects malformed, oversized and metadata input', async t => {
  const f = fixture(t);
  assert.equal((await f.request('/api/tasks', 'POST', baseTask(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('/api/tasks', 'POST', '{', { raw: true })).status, 400);
  assert.equal((await f.request('/api/tasks', 'POST', 'a'.repeat(MAX_BODY_BYTES + 1), { raw: true })).status, 413);
  assert.equal((await f.request('/api/tasks', 'POST', baseTask(), { headers: { 'content-length': '99999' } })).status, 413);
  for (const body of [null, [], { ...baseTask(), createdBy: 'attacker' }, { ...baseTask(), revision: 22 }, JSON.parse('{"__proto__":{},"id":"x"}')]) {
    assert.equal((await f.request('/api/tasks', 'POST', body)).status, 400);
  }
  assert.equal(f.accesses(), 0);
});

test('task fields enforce real dates, limits, enums and control character rules', async t => {
  const f = fixture(t);
  const invalid = [
    { title: ' ' }, { title: 'a'.repeat(101) }, { title: 23 },
    { owner: '' }, { owner: 'a'.repeat(41) }, { owner: '담당\u0000자' },
    { next: 'a'.repeat(301) }, { due: '2026-02-29' }, { due: '2026-04-31' }, { due: '0000-01-01' },
    { due: '2026-1-01' }, { status: '임의 상태' }, { category: '임의 분류' }, { id: 'AON-101' },
  ];
  for (const override of invalid) {
    assert.equal((await f.request('/api/tasks', 'POST', { ...baseTask(), ...override })).status, 400, JSON.stringify(override));
  }
  assert.equal(f.accesses(), 0);
  assert.equal((await f.request('/api/tasks', 'POST', { ...baseTask(), due: '2028-02-29' })).status, 201);
});

test('create is idempotent, metadata is server-owned, and original retry survives an edit', async t => {
  const f = fixture(t);
  const first = await f.request('/api/tasks', 'POST', baseTask());
  assert.equal(first.status, 201);
  assert.equal(first.body.task.createdBy, USER.userId);
  assert.equal(first.body.task.updatedBy, USER.userId);
  assert.equal(first.body.task.revision, 1);
  assert.equal(first.body.task.createdAt, TIME);
  assert.equal(Object.hasOwn(first.body.task, 'creation_payload'), false);
  assert.equal((await f.request('/api/tasks', 'POST', baseTask())).status, 200);
  assert.equal((await f.request('/api/tasks', 'POST', { ...baseTask(), title: '다른 내용' })).status, 409);
  assert.equal((await f.request('/api/tasks', 'POST', baseTask(), { user: OTHER })).status, 409);
  assert.equal((await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { title: '최신 제목', revision: 1 })).status, 200);
  const retry = await f.request('/api/tasks', 'POST', baseTask());
  assert.equal(retry.status, 200);
  assert.equal(retry.body.task.title, '최신 제목');
  assert.equal(retry.body.task.revision, 2);
  assert.equal((await f.request('/api/tasks')).body.tasks.length, 1);
});

test('next action supports multiline notes with normalized CRLF, while other controls remain invalid', async t => {
  const f = fixture(t);
  const result = await f.request('/api/tasks', 'POST', { ...baseTask(), next: '첫 번째 행동\r\n두 번째 행동\r세 번째 행동' });
  assert.equal(result.status, 201);
  assert.equal(result.body.task.next, '첫 번째 행동\n두 번째 행동\n세 번째 행동');
  assert.equal((await f.request('/api/tasks', 'POST', { ...baseTask(), next: '첫 번째 행동\n두 번째 행동\n세 번째 행동' })).status, 200);
  const updated = await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { next: '다음\n행동', revision: 1 });
  assert.equal(updated.body.task.next, '다음\n행동');
  assert.equal((await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { next: '메모\u0000내용', revision: 2 })).status, 400);
  assert.equal((await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { owner: '담당\n자', revision: 2 })).status, 400);
});

test('shared workspace edits preserve creator and use atomic revision comparison', async t => {
  const f = fixture(t);
  await f.request('/api/tasks', 'POST', baseTask());
  const results = await Promise.all([
    f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { status: '진행 중', revision: 1 }, { user: OTHER }),
    f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { status: '완료', revision: 1 }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const saved = (await f.request('/api/tasks', 'GET', undefined, { user: OTHER })).body.tasks[0];
  assert.equal(saved.revision, 2);
  assert.equal(saved.createdBy, USER.userId);
  assert.equal(saved.updatedBy, OTHER.userId);
  assert.equal(saved.status, '진행 중');
  const stale = await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', { title: '덮어쓰기', revision: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'REVISION_CONFLICT');
  assert.equal((await f.request(`/api/tasks/${SECOND_ID}`, 'PATCH', { title: '없는 항목', revision: 1 })).status, 404);
});

test('partial updates require revision and reject metadata, empty updates and unknown keys', async t => {
  const f = fixture(t);
  for (const body of [{ title: '수정' }, { title: '수정', revision: 0 }, { title: '수정', revision: '1' }, { title: '수정', revision: 1, id: FIRST_ID }, { revision: 1 }, { revision: 1, updatedAt: TIME }]) {
    assert.equal((await f.request(`/api/tasks/${FIRST_ID}`, 'PATCH', body)).status, 400);
  }
  assert.equal(f.accesses(), 0);
});

test('untrusted text is bound as data, never executed or echoed as HTML', async t => {
  const f = fixture(t);
  const title = `<img src=x onerror=alert(1)>'); DROP TABLE aon_tasks; --`;
  const result = await f.request('/api/tasks', 'POST', { ...baseTask(), title, due: '' });
  assert.equal(result.status, 201);
  assert.equal(result.body.task.title, title);
  assert.match(result.headers.get('content-type'), /application\/json/);
  assert.equal((await f.request('/api/tasks')).body.tasks[0].title, title);
  assert.equal(f.queries.some(query => query.includes(title)), false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM aon_tasks').get().count, 1);
});

test('events persist, validate dates/time, reject lost updates and support idempotent create', async t => {
  const f = fixture(t);
  for (const override of [{ date: '' }, { date: '2026-02-30' }, { time: '24:00' }, { time: '9:30' }, { time: '09:60' }, { owner: '' }]) {
    assert.equal((await f.request('/api/events', 'POST', { ...baseEvent(), ...override })).status, 400);
  }
  const first = await f.request('/api/events', 'POST', baseEvent());
  assert.equal(first.status, 201);
  assert.equal(first.body.event.createdBy, USER.userId);
  assert.equal((await f.request('/api/events', 'POST', baseEvent())).status, 200);
  assert.equal((await f.request('/api/events', 'POST', { ...baseEvent(), time: '10:30' })).status, 409);
  const updated = await f.request(`/api/events/${SECOND_ID}`, 'PATCH', { time: '10:30', revision: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.event.revision, 2);
  assert.equal((await f.request(`/api/events/${SECOND_ID}`, 'PATCH', { time: '11:30', revision: 1 })).status, 409);
  assert.equal((await f.request('/api/events')).body.events[0].time, '10:30');
});

test('no deletion/reset path exists and storage failures return bounded errors', async t => {
  const f = fixture(t);
  assert.equal((await f.request(`/api/tasks/${FIRST_ID}`, 'DELETE')).status, 405);
  assert.equal((await f.request('/api/reset', 'POST', {})).status, 404);
  assert.equal(f.accesses(), 0);
  assert.equal((await f.request('/api/tasks', 'GET', undefined, { noDb: true })).status, 503);
  const response = await handleAonRequest(new Request(ORIGIN + '/api/tasks'), {
    user: USER, getDatabase: () => { throw new Error('private database credentials'); },
  });
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('credentials'), false);
});
