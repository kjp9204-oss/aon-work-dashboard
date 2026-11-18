import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Explicitly restricted to the loopback development server. Never run against production.
const base = new URL(process.argv[2] || 'http://127.0.0.1:18743');
assert.equal(base.hostname, '127.0.0.1');
assert.equal(base.protocol, 'http:');
const anonymous = await fetch(new URL('/api/tasks', base));
assert.equal(anonymous.status, 401);
const signin = await fetch(new URL('/signin-with-chatgpt?return_to=/', base), {redirect:'manual'});
const cookie = signin.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
assert.ok(cookie);
async function request(path, method='GET', body, origin=base.origin) {
  const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
  const response=await fetch(new URL(path,base),{method,headers,body:body?JSON.stringify(body):undefined});
  const raw = await response.text();
  return {status:response.status,body:response.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : raw};
}
assert.equal((await request('/api/session')).body.storage,'server');
const input={id:randomUUID(),title:'[API 검증] 임시 운영 업무',owner:'자동 검증',category:'운영·시설',status:'접수',due:'2026-11-24',next:'첫 줄\n둘째 줄'};
assert.equal((await request('/api/tasks','POST',input,'https://different.example')).status,403);
const created=await request('/api/tasks','POST',input);
assert.equal(created.status,201);
const repeated=await request('/api/tasks','POST',input);
assert.equal(repeated.status,200);
assert.equal(repeated.body.task.id,created.body.task.id);
const changes=await Promise.all([
  request('/api/tasks/'+input.id,'PATCH',{status:'진행 중',revision:1}),
  request('/api/tasks/'+input.id,'PATCH',{status:'완료',revision:1})
]);
assert.deepEqual(changes.map(x=>x.status).sort(),[200,409]);
const fresh=await request('/api/tasks');
assert.equal(fresh.body.tasks.filter(t=>t.id===input.id).length,1);
assert.equal(fresh.body.tasks.find(t=>t.id===input.id).revision,2);
console.log('PASS: actual HTTP/D1 authentication, cross-origin rejection, multiline create, duplicate retry, competing edits, fresh session list. Local test record only.');
