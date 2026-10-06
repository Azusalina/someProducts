import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrack,hkDay,distance,geojson,gpx} from '../web/geometry.js';
const time=Date.parse('2026-10-06T09:00:00Z');
const p=(ms=0,lon=114.16,extra={})=>({id:ms+1,ms:time+ms,lon,lat:22.28,accuracy:8,device:'Phone',device_key:'A',...extra});
test('Hong Kong midnight is independent of PC timezone',()=>assert.equal(hkDay(Date.parse('2026-10-05T16:00:00Z')),'2026-10-06'));
test('late uploads are sorted and walking distance stays plausible',()=>{
 const a=p(),b=p(60000,114.161),track=buildTrack([b,a]);
 assert.equal(track.segments.length,1);assert.ok(track.meters>100&&track.meters<110);assert.equal(track.seconds,60);
 assert.equal(track.points[0],a);
});
test('time gaps and impossible jumps do not become long false roads',()=>{
 const track=buildTrack([p(),p(700000,114.17),p(701000,115.0)]);
 assert.equal(track.segments.length,3);assert.equal(track.meters,0);assert.equal(track.gaps,2);
});
test('GPS drift is suppressed without changing original data',()=>{
 const raw=[p(),p(60000,114.16001),p(120000,114.16002)];const before=JSON.stringify(raw);
 const track=buildTrack(raw);assert.equal(track.meters,0);assert.equal(JSON.stringify(raw),before);
});
test('poor accuracy breaks the trace; include-all still retains it',()=>{
 const points=[p(),p(60000,114.161,{accuracy:500}),p(120000,114.162)];
 const track=buildTrack(points);assert.equal(track.excluded,1);assert.equal(track.meters,0);assert.equal(track.segments.length,2);
 assert.equal(buildTrack(points,Infinity).points.length,3);
});
test('separate phones and separate Hong Kong days never connect',()=>{
 const points=[p(),p(60000,114.17,{device_key:'B'}),p(24*3600*1000,114.2)];
 assert.equal(buildTrack(points).segments.length,3);assert.equal(buildTrack(points).meters,0);
});
test('exports retain gaps, timestamps, isolated points and escaped notes',()=>{
 const track=buildTrack([p(),p(60000,114.161),p(800000,114.17)]),json=geojson(track,'hello');
 assert.equal(json.features.length,2);assert.equal(json.features[0].geometry.type,'LineString');assert.equal(json.features[1].geometry.type,'Point');
 const xml=gpx(track,'<note> & "hello"');assert.equal((xml.match(/<trkseg>/g)||[]).length,2);assert.ok(xml.includes('&lt;note&gt; &amp; &quot;hello&quot;'));
 assert.ok(xml.includes(new Date(time).toISOString()));
});
