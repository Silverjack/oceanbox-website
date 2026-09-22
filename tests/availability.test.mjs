import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../lib/inventory-location.js', import.meta.url), 'utf8');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const {findLocation, extractLocations} = await import(moduleUrl);
const handlerText = fs.readFileSync(new URL('../functions/api/check-availability.js', import.meta.url), 'utf8').replace('../../lib/inventory-location.js', moduleUrl);
const {onRequestGet} = await import('data:text/javascript;base64,' + Buffer.from(handlerText).toString('base64'));
const cities = [{key:'chicago',location:'Chicago',region:'IL',country:'US'}, {key:'portland',location:'Portland',region:'OR',country:'US'}];
const html = `const INVENTORY_LOCATIONS = ${JSON.stringify(cities)};`;
test('city/state matching never discards supplied state', () => {
 assert.equal(findLocation('Chicago, IL', cities)?.key, 'chicago');
 assert.equal(findLocation('Chicago, Illinois, USA', cities)?.key, 'chicago');
 assert.equal(findLocation('Chicago, CA', cities), null);
 assert.equal(findLocation('Portland, ME', cities), null);
 assert.equal(findLocation('Portland', cities), null);
 assert.equal(findLocation('Portland, OR', cities), null); // raw source lacks explicit state
});
test('ambiguous duplicate cities do not become confirmed matches', () => assert.equal(findLocation('Chicago', [...cities,cities[0]]), null));
test('catalog also retains unmapped places from legacy HTML', () => {
 const locations = extractLocations('const INVENTORY_CITIES = [];\n<select data-column="location"><option value="all">All</option><option value="test city">Test City</option></select>');
 assert.equal(locations[0].location, 'Test City');
});
test('lookup success returns exact filter and only on published match', async () => {
 global.fetch = async () => new Response(html);
 const r = await onRequestGet({request:new Request('https://www.oceanbox.cn/api/check-availability?location=Chicago%2C%20IL')});
 const data = await r.json(); assert.equal(data.available,true); assert.equal(new URL(data.url).searchParams.get('location'),'chicago');
 const no = await onRequestGet({request:new Request('https://www.oceanbox.cn/api/check-availability?location=Chicago%2C%20CA')});
 assert.equal((await no.json()).available,false);
});
test('ZIP uses resolved place and cannot treat unrelated ZIP as stock', async () => {
 global.fetch = async url => String(url).includes('zippopotam') ? new Response(JSON.stringify({places:[{'place name':'Chicago','state abbreviation':'IL'}]})) : new Response(html);
 let r = await onRequestGet({request:new Request('https://www.oceanbox.cn/api/check-availability?zip=60601')}); assert.equal((await r.json()).available,true);
 global.fetch = async url => String(url).includes('zippopotam') ? new Response('',{status:404}) : new Response(html);
 r = await onRequestGet({request:new Request('https://www.oceanbox.cn/api/check-availability?zip=00000')}); assert.equal((await r.json()).available,false);
});
test('unavailable source gives a recoverable response, never false stock', async () => {
 global.fetch = async () => {throw new Error('offline')};
 const r = await onRequestGet({request:new Request('https://www.oceanbox.cn/api/check-availability?location=Chicago')}); assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
});
