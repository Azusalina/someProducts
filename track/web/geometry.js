export const hkDay = ms => new Date(ms + 8*3600*1000).toISOString().slice(0,10);
export function distance(a,b) {
 const rad = Math.PI/180, dlat=(b.lat-a.lat)*rad, dlon=(b.lon-a.lon)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function buildTrack(points, maxAccuracy = 100) {
 const ordered = [...points].sort((a,b)=>a.ms-b.ms || a.id-b.id);
 const states = new Map(), segments = []; let meters=0, seconds=0, excluded=0, gaps=0;
 for (const p of ordered) {
  const key = `${p.device_key}\0${hkDay(p.ms)}`;
  if (maxAccuracy !== Infinity && (p.accuracy === null || p.accuracy < 0 || p.accuracy > maxAccuracy)) {
   excluded++; if(states.has(key))gaps++; states.delete(key); continue;
  }
  let state = states.get(key);
  if (!state) {
   state={previous:p,segment:[p]}; states.set(key,state);segments.push(state.segment);continue;
  }
  const last = state.previous, elapsed=(p.ms-last.ms)/1000, length=distance(last,p);
  if (elapsed <= 0 || elapsed > 600 || length/elapsed > 80) {
   gaps++; state={previous:p,segment:[p]};states.set(key,state);segments.push(state.segment);continue;
  }
  const jitter=Math.max(5, Math.min(15,((p.accuracy??20)+(last.accuracy??20))/8));
  if (length >= jitter) { meters+=length;seconds+=elapsed;state.segment.push(p);state.previous=p; }
  else if (elapsed >= 120) { state.segment.push(p);state.previous=p; }
 }
 const displayed = segments.flat().sort((a,b)=>a.ms-b.ms || a.id-b.id);
 return {segments,points:displayed,meters,seconds,excluded,gaps};
}
export function geojson(track, note='') {
 return {type:'FeatureCollection',features:track.segments.map(segment=>({type:'Feature',
  geometry:segment.length===1?{type:'Point',coordinates:[segment[0].lon,segment[0].lat]}:
   {type:'LineString',coordinates:segment.map(p=>[p.lon,p.lat])},
  properties:{device:segment[0].device,day:hkDay(segment[0].ms),note,
   timestamps:segment.map(p=>new Date(p.ms).toISOString()),accuracy:segment.map(p=>p.accuracy)},
 }))};
}
const escapeXml = value => String(value).replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function gpx(track,note='') {
 return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Track" xmlns="http://www.topografix.com/GPX/1/1">'+
  track.segments.map(segment=>'<trk><name>'+escapeXml(segment[0].device)+' · '+hkDay(segment[0].ms)+'</name><desc>'+escapeXml(note)+'</desc><trkseg>'+segment.map(p=>
   `<trkpt lat="${p.lat}" lon="${p.lon}">${Number.isFinite(p.altitude)?`<ele>${p.altitude}</ele>`:''}<time>${new Date(p.ms).toISOString()}</time></trkpt>`).join('')+'</trkseg></trk>').join('')+'</gpx>\n';
}
