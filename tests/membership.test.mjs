import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { classifyMembership, normalizeMembership } from '../lib/membership.js';
import handler from '../api/membership-sync.js';

const source = readFileSync(new URL('../public/sca-auth.js', import.meta.url), 'utf8');
const plan = name => ({ id: name, name });
const cases = [
  [['Standard Monthly Subscription'], 'Standard'],
  [['Standard Monthly Subscription', 'SCA Case Videos Add-On'], 'Premium'],
  [['Premium Monthly Subscription'], 'Premium'],
  [['SCA Premium 3 months'], 'Premium'],
  [[], 'Inactive'],
  [['SCA Case Videos Add-On'], null],
  [['Unrecognised plan'], null],
  [['Standard Monthly Subscription', 'Future bundle'], null],
];
const secret = 'test-secret';
function token(uid = 'user-a', exp = Date.now() + 86400000) {
  const payload = JSON.stringify({ uid, exp });
  return Buffer.from(payload).toString('base64url') + '.' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function snapshot(plans = ['Standard Monthly Subscription'], extra = {}) {
  return { userId: 'user-a', plans: plans.map(plan), tier: 'Standard', checkedAt: new Date().toISOString(), ...extra };
}
function browser({ cached = null, plans = ['Standard Monthly Subscription'], accountUid = 'user-a', failAccount = false, failSync = false, noStorage = false, slowPath = false, onAccount } = {}) {
  const cookies = new Map([['SiteUserInfo', encodeURIComponent(JSON.stringify({ authenticated: true, siteUserId: 'user-a' }))], ['crumb','x'], ['siteUserCrumb','y']]);
  const storage = new Map(slowPath ? [] : [['sca_session_token', token()]]);
  storage.set('sca_member_identity_ts', String(Date.now()));
  if (cached) storage.set('sca_member_membership', JSON.stringify(cached));
  const calls = [];
  const boot = { userProfile: { id: accountUid }, pricingPlans: { activePricingPlans: plans.map(name => ({ pricingPlanId: name, pricingPlanName: name, isActive: true })) } };
  const document = {
    get cookie() { return [...cookies].map(([k,v]) => `${k}=${v}`).join('; '); },
    set cookie(value) { const pair=value.split(';')[0], at=pair.indexOf('='); cookies.set(pair.slice(0,at),pair.slice(at+1)); },
  };
  const context = { window: {}, document, console: {log(){},warn(){}}, Date, AbortSignal,
    localStorage: { getItem:k=>{if(noStorage)throw Error('blocked');return storage.get(k)||null;}, setItem:(k,v)=>{if(noStorage)throw Error('blocked');storage.set(k,v);}, removeItem:k=>storage.delete(k) },
    atob:s=>Buffer.from(s,'base64').toString('utf8'),
    DOMParser: class { parseFromString() { return {querySelector:()=>({textContent:JSON.stringify(boot)})}; } },
    fetch: async (url, opts) => {
      calls.push({url, opts});
      if (url==='/account/frame') { if(onAccount)onAccount(cookies,boot); if(failAccount)throw Error('expired'); return {ok:true,text:async()=>'<html></html>'}; }
      if (url.endsWith('/membership-sync')) return {ok:!failSync,json:async()=>({ok:!failSync})};
      if (url==='/api/site-users/account/profile') return {ok:true,json:async()=>({id:'user-a',email:'test@example.com',name:{}})};
      if (url.endsWith('/session-start-v2')) return {ok:true,json:async()=>({ok:true,token:token()})};
      throw Error('Unexpected URL '+url);
    },
  };
  vm.runInNewContext(source, context);
  return {api:context.window.SCAAuth, calls, cookies, storage, boot};
}

test('classification covers standard, video add-on, premium, inactive and unknown', async () => {
  for (const [names, tier] of cases) {
    assert.equal(classifyMembership(names.map(plan)), tier);
    const b=browser({plans:names});
    const result=await b.api.getMembership();
    assert.equal(result?.tier||null,tier);
  }
});
test('backend validates account, date, shape and independently calculates tier', () => {
  assert.equal(normalizeMembership(snapshot(), 'other'),null);
  assert.equal(normalizeMembership(snapshot([], {checkedAt:'invalid'}), 'user-a'),null);
  assert.equal(normalizeMembership(snapshot([], {checkedAt:new Date(Date.now()+3600000).toISOString()}), 'user-a'),null);
  assert.equal(normalizeMembership(snapshot([], {plans:[{id:'p',name:123}]}), 'user-a'),null);
  assert.equal(normalizeMembership(snapshot(['Standard Monthly Subscription'], {tier:'Premium'}), 'user-a').tier,'Standard');
});
test('returning token fast path still checks membership and writes our cookie', async () => {
  const b=browser({plans:['Standard Monthly Subscription','SCA Case Videos Add-On']});
  const result=await b.api.getMembership();
  assert.equal(result.tier,'Premium'); assert.ok(result.syncedAt);
  assert.equal(b.calls.filter(c=>c.url==='/account/frame').length,1);
  assert.equal(b.calls.filter(c=>c.url.endsWith('/membership-sync')).length,1);
  assert.equal(b.calls.filter(c=>c.url.endsWith('/session-start-v2')).length,0);
  assert.equal(JSON.parse(decodeURIComponent(b.cookies.get('sca_membership'))).tier,'Premium');
  assert.deepEqual(JSON.parse(decodeURIComponent(b.cookies.get('SiteUserInfo'))),{authenticated:true,siteUserId:'user-a'});
});
test('new session is created before membership is synchronised', async () => {
  const b=browser({slowPath:true}); await b.api.getMembership();
  assert.ok(b.calls.findIndex(c=>c.url.endsWith('/session-start-v2')) < b.calls.findIndex(c=>c.url.endsWith('/membership-sync')));
});
test('fresh synced cache avoids requests and stale cache refreshes upgrade', async () => {
  const cached=snapshot(undefined,{syncedAt:new Date().toISOString()});
  const b=browser({cached}); assert.equal((await b.api.getMembership()).tier,'Standard'); assert.equal(b.calls.length,0);
  const c=browser({cached:{...cached,checkedAt:new Date(Date.now()-7*3600000).toISOString()},plans:['Premium']});
  assert.equal((await c.api.getMembership()).tier,'Premium');
});
test('expired Squarespace session preserves last confirmed tier and check time', async () => {
  const cached=snapshot(['Premium'],{tier:'Premium',checkedAt:new Date(Date.now()-7*3600000).toISOString(),syncedAt:new Date().toISOString()});
  const b=browser({cached,failAccount:true}); const result=await b.api.getMembership();
  assert.equal(result.tier,'Premium'); assert.equal(result.checkedAt,cached.checkedAt); assert.equal(result.stale,true);
  assert.equal(b.calls.filter(c=>c.url.endsWith('/membership-sync')).length,0);
});
test('unknown plans and mismatched account responses do not overwrite a known membership', async () => {
  const cached=snapshot(['Premium'],{tier:'Premium',checkedAt:new Date(Date.now()-7*3600000).toISOString(),syncedAt:'yes'});
  for (const options of [{plans:['Unknown']},{accountUid:'user-b'}]) {
    const b=browser({cached,...options}); assert.equal((await b.api.getMembership()).tier,'Premium');
    assert.equal(b.calls.filter(c=>c.url.endsWith('/membership-sync')).length,0);
  }
});
test('account switching during request cannot store or send the old account snapshot', async () => {
  const b=browser({onAccount:cookies=>cookies.set('SiteUserInfo',encodeURIComponent(JSON.stringify({authenticated:true,siteUserId:'user-b'})))});
  assert.equal(await b.api.getMembership(),null); assert.equal(b.storage.has('sca_member_membership'),false);
  assert.equal(b.calls.filter(c=>c.url.endsWith('/membership-sync')).length,0);
});
test('failed Airtable sync leaves a retryable local snapshot', async () => {
  const b=browser({failSync:true}); const result=await b.api.getMembership();
  assert.equal(result.tier,'Standard'); assert.equal(result.syncedAt,null);
  const c=browser({cached:JSON.parse(b.storage.get('sca_member_membership'))}); await c.api.getMembership();
  assert.equal(c.calls.filter(c=>c.url==='/account/frame').length,0);
  assert.equal(c.calls.filter(c=>c.url.endsWith('/membership-sync')).length,1);
});
test('storage failure still allows cookie storage and sync', async () => {
  const b=browser({noStorage:true}); const result=await b.api.getMembership();
  assert.equal(result.tier,'Standard'); assert.ok(b.cookies.has('sca_membership'));
});

process.env.SCA_SESSION_SECRET=secret;
process.env.AIRTABLE_USERS_TOKEN='test-airtable-token';
process.env.AIRTABLE_USERS_BASE_ID='app-test';
process.env.AIRTABLE_USERS_TABLE='tbl-test';
async function request({membership=snapshot(),auth=token(),origin='https://www.scarevision.co.uk',method='POST',previous,fail=false}={}) {
  const requests=[];
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    requests.push({url,options});
    return {ok:!fail,json:async()=> options.method==='GET'?{records:[{id:'rec-test',fields:{MembershipCheckedAt:previous}}]}:{id:'rec-test'}};
  };
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){return this;}};
  try { await handler({method,headers:{origin,authorization:`Bearer ${auth}`},body:{membership}},res); }
  finally {globalThis.fetch=oldFetch;}
  return {res,requests};
}
test('endpoint requires signed current session, allowed origin and matching user',async()=>{
  for(const opts of [{auth:'bad'},{auth:token('user-a',1)},{origin:'https://evil.example'},{membership:snapshot(undefined,{userId:'user-b'})}]) {
    const {res,requests}=await request(opts); assert.ok([401,403,422].includes(res.code)); assert.equal(requests.length,0);
  }
});
test('endpoint only updates three membership fields on an existing account',async()=>{
  const {res,requests}=await request({membership:snapshot(['Premium'],{tier:'Standard'})});
  assert.equal(res.code,200); const fields=JSON.parse(requests[1].options.body).fields;
  assert.deepEqual(Object.keys(fields).sort(),['MembershipCheckedAt','MembershipPlansJson','MembershipTier']);
  assert.equal(fields.MembershipTier,'Premium');
});
test('old snapshots never replace a newer Airtable check',async()=>{
  const {res,requests}=await request({previous:new Date(Date.now()+60000).toISOString()});
  assert.equal(res.code,200);assert.equal(requests.length,1);
});
test('storage outage returns failure rather than acknowledging a lost write',async()=>{
  const {res}=await request({fail:true});assert.equal(res.code,502);assert.equal(res.body.ok,false);
});
test('CORS preflight accepts bearer header without touching Airtable',async()=>{
  const {res,requests}=await request({method:'OPTIONS',auth:''});assert.equal(res.code,204);assert.equal(requests.length,0);
  assert.match(res.headers['Access-Control-Allow-Headers'],/Authorization/);
});
