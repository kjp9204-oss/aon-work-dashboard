/** Shared, authenticated AON workspace API. No runtime DDL or demonstration seed. */
export const TASK_STATUSES = Object.freeze(['접수', '진행 중', '확인 대기', '보류', '완료']);
export const TASK_CATEGORIES = Object.freeze(['운영·시설', '직원·교육', '회의·행사', '블로그·홍보']);
export const MAX_BODY_BYTES = 8192;

const definitions = {
  tasks: { table: 'aon_tasks', singular: 'task', fields: ['title', 'category', 'owner', 'due', 'status', 'next'], order: 'updated_at DESC, id DESC' },
  events: { table: 'aon_events', singular: 'event', fields: ['title', 'owner', 'date', 'time'], order: 'date ASC, time ASC, id ASC' },
};

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/** @param {number} status @param {string} code @param {string} message @returns {never} */
function fail(status, code, message) { throw new ApiError(status, code, message); }
function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
}

function validId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    fail(400, 'INVALID_ID', '새 항목 ID가 올바르지 않습니다. 화면을 새로 열어 주세요.');
  }
  return value.toLowerCase();
}

function textValue(value, label, min, max, multiline = false) {
  if (typeof value !== 'string') fail(400, 'INVALID_FIELD', `${label} 형식을 확인해 주세요.`);
  const normalized = multiline ? value.replace(/\r\n?/g, '\n') : value;
  const controls = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u : /[\u0000-\u001f\u007f-\u009f]/u;
  if (controls.test(normalized)) fail(400, 'INVALID_FIELD', `${label} 형식을 확인해 주세요.`);
  const clean = normalized.trim();
  if (clean.length < min || clean.length > max) fail(400, 'INVALID_FIELD', `${label}은(는) ${min}~${max}자까지 입력할 수 있습니다.`);
  return clean;
}

function dateValue(value, label, optional = false) {
  const clean = textValue(value, label, optional ? 0 : 10, 10);
  if (optional && clean === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || clean.startsWith('0000')) fail(400, 'INVALID_DATE', `${label} 날짜를 확인해 주세요.`);
  const parsed = new Date(`${clean}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== clean) fail(400, 'INVALID_DATE', `${label} 날짜가 실제 달력과 맞지 않습니다.`);
  return clean;
}

function validateField(key, value) {
  switch (key) {
    case 'title': return textValue(value, '제목', 1, 100);
    case 'owner': return textValue(value, '담당자', 1, 40);
    case 'next': return textValue(value, '다음 행동', 0, 300, true);
    case 'due': return dateValue(value, '마감일', true);
    case 'date': return dateValue(value, '일정');
    case 'time': {
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(400, 'INVALID_TIME', '시간은 00:00~23:59 형식으로 입력해 주세요.');
      return value;
    }
    case 'category':
      if (!TASK_CATEGORIES.includes(value)) fail(400, 'INVALID_CATEGORY', '업무 분류를 선택해 주세요.');
      return value;
    case 'status':
      if (!TASK_STATUSES.includes(value)) fail(400, 'INVALID_STATUS', '업무 상태를 선택해 주세요.');
      return value;
    default: fail(400, 'INVALID_FIELD', '허용되지 않은 입력 항목입니다.');
  }
}

function validatePayload(body, definition, updating) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_BODY', '입력 내용을 확인해 주세요.');
  const allowed = [...definition.fields, updating ? 'revision' : 'id'];
  if (Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'UNKNOWN_FIELD', '변경할 수 없는 항목이 포함되어 있습니다.');
  const result = {};
  for (const field of definition.fields) {
    if (updating && !Object.hasOwn(body, field)) continue;
    result[field] = validateField(field, body[field]);
  }
  if (updating) {
    if (!Number.isSafeInteger(body.revision) || body.revision < 1) fail(400, 'INVALID_REVISION', '항목 버전을 확인한 뒤 다시 저장해 주세요.');
    if (Object.keys(result).length === 0) fail(400, 'EMPTY_UPDATE', '변경할 항목이 없습니다.');
    result.revision = body.revision;
  } else result.id = validId(body.id);
  return result;
}

async function readMutation(request) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin) fail(403, 'INVALID_ORIGIN', '이 대시보드 화면에서 다시 저장해 주세요.');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') fail(403, 'INVALID_ORIGIN', '다른 사이트의 저장 요청은 허용되지 않습니다.');
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail(415, 'JSON_REQUIRED', 'JSON 형식으로 저장해야 합니다.');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) fail(413, 'BODY_TOO_LARGE', '입력 내용이 너무 큽니다.');
  if (!request.body) fail(400, 'INVALID_BODY', '입력 내용이 비어 있습니다.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); fail(413, 'BODY_TOO_LARGE', '입력 내용이 너무 큽니다.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'INVALID_JSON', '입력 내용을 읽을 수 없습니다. 다시 저장해 주세요.'); }
}

function publicRow(row, definition) {
  const result = { id: row.id };
  for (const field of definition.fields) result[field] = row[field];
  return { ...result, createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision };
}

/** Dependency injection keeps production authorization and persistence testable.
 * @param {Request} request
 * @param {{user: {userId:string, displayName:string}|null, getDatabase:Function, now?:Function}} dependencies
 * @returns {Promise<Response>}
 */
export async function handleAonRequest(request, { user, getDatabase, now = () => new Date().toISOString() }) {
  try {
    // Deliberately before route dispatch and before touching the database binding.
    if (!user || typeof user.userId !== 'string' || !user.userId.trim()) fail(401, 'AUTH_REQUIRED', '로그인한 뒤 이용해 주세요.');
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (path === '/api/session' && request.method === 'GET') return json({ user: { id: user.userId, displayName: user.displayName }, storage: 'server' });
    const match = /^\/api\/(tasks|events)(?:\/([^/]+))?$/.exec(path);
    if (!match) fail(404, 'NOT_FOUND', '요청한 항목을 찾을 수 없습니다.');
    const collection = match[1];
    const definition = definitions[collection];
    const routeId = match[2] ? validId(match[2]) : null;
    const isList = request.method === 'GET' && !routeId;
    const isCreate = request.method === 'POST' && !routeId;
    const isUpdate = request.method === 'PATCH' && !!routeId;
    if (!isList && !isCreate && !isUpdate) fail(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 작업입니다.');
    const payload = isList ? null : validatePayload(await readMutation(request), definition, isUpdate);
    const db = await getDatabase();
    if (!db) fail(503, 'STORAGE_UNAVAILABLE', '저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.');

    if (isList) {
      const result = await db.prepare(`SELECT * FROM ${definition.table} ORDER BY ${definition.order}`).all();
      return json({ [collection]: result.results.map(row => publicRow(row, definition)), serverTime: now() });
    }

    if (isCreate) {
      const time = now();
      const creationPayload = JSON.stringify([user.userId, ...definition.fields.map(field => payload[field])]);
      const columns = ['id', ...definition.fields, 'created_by', 'updated_by', 'created_at', 'updated_at', 'revision', 'creation_payload'];
      const values = [payload.id, ...definition.fields.map(field => payload[field]), user.userId, user.userId, time, time, 1, creationPayload];
      const row = await db.prepare(`INSERT INTO ${definition.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO NOTHING RETURNING *`).bind(...values).first();
      if (row) return json({ [definition.singular]: publicRow(row, definition) }, 201);
      const existing = await db.prepare(`SELECT * FROM ${definition.table} WHERE id = ?`).bind(payload.id).first();
      if (!existing || existing.creation_payload !== creationPayload) fail(409, 'IDEMPOTENCY_CONFLICT', '같은 ID로 다른 내용이 이미 저장되어 있습니다. 목록을 확인해 주세요.');
      return json({ [definition.singular]: publicRow(existing, definition) });
    }

    const fields = definition.fields.filter(field => Object.hasOwn(payload, field));
    const values = [...fields.map(field => payload[field]), user.userId, now(), routeId, payload.revision];
    const changed = await db.prepare(`UPDATE ${definition.table} SET ${fields.map(field => `${field} = ?`).join(',')}, updated_by = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? RETURNING *`).bind(...values).first();
    if (changed) return json({ [definition.singular]: publicRow(changed, definition) });
    const existing = await db.prepare(`SELECT id FROM ${definition.table} WHERE id = ?`).bind(routeId).first();
    if (!existing) fail(404, 'NOT_FOUND', '항목을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
    fail(409, 'REVISION_CONFLICT', '다른 사람이 먼저 수정했습니다. 입력 내용은 유지하고 최신 항목을 확인해 주세요.');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
    // Do not return database details, request contents, IDs or visitor data.
    return json({ error: { code: 'INTERNAL_ERROR', message: '저장 처리 중 오류가 발생했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.' } }, 500);
  }
}
