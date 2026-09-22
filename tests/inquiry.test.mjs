import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../functions/api/submit-inquiry.js',import.meta.url),'utf8');
const {onRequestPost}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const request = (token='valid') => {
 const form=new FormData();for(const [k,v] of Object.entries({company:'Test Company',email:'test@example.com',requirement:'Chicago 20GP request','cf-turnstile-response':token,landing_page:'https://www.oceanbox.cn/?utm_source=test&token=private#secret',source_referrer:'https://example.com/?secret=private'}))form.set(k,v);
 return new Request('https://www.oceanbox.cn/api/submit-inquiry',{method:'POST',body:form,headers:{Referer:'https://www.oceanbox.cn/?token=private'}});
};
test('valid form preserves requirement and appends traceable bounded source context',async()=>{
 let payload;global.fetch=async(url,options)=>{
  if(String(url).includes('siteverify'))return new Response(JSON.stringify({success:true}));
  payload=JSON.parse(options.body);return new Response('{}');
 };
 const response=await onRequestPost({request:request(),env:{TURNSTILE_SECRET_KEY:'mock',HUBSPOT_PORTAL_ID:'mock',HUBSPOT_FORM_ID:'mock'}});
 assert.equal(response.status,200);assert.ok((await response.json()).inquiry_id);
 const message=payload.fields.find(f=>f.name==='message').value;
 assert.ok(message.startsWith('Chicago 20GP request'));assert.ok(message.includes('utm_source=test'));assert.ok(!JSON.stringify(payload).includes('private'));
});
test('verification is still required before forwarding inquiry',async()=>{
 let called=false;global.fetch=async()=>{called=true;throw Error('must not forward')};
 const r=await onRequestPost({request:request(''),env:{}});assert.equal(r.status,422);assert.equal(called,false);
});
test('HubSpot failure cannot return a success message',async()=>{
 global.fetch=async url=>String(url).includes('siteverify')?new Response(JSON.stringify({success:true})):new Response('{}',{status:503});
 const r=await onRequestPost({request:request(),env:{TURNSTILE_SECRET_KEY:'mock',HUBSPOT_PORTAL_ID:'mock',HUBSPOT_FORM_ID:'mock'}});assert.equal(r.status,500);assert.equal((await r.json()).ok,false);
});
