export const EPS = 1e-9;
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const scale = (a, s) => a.map(x => x * s);
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = a => Math.sqrt(dot(a, a));
export const det = ([a, b, c, d]) => a * d - b * c;
export const transform = ([a, b, c, d], [x, y]) => [a * x + b * y, c * x + d * y];
export const multiply = (A, B) => [A[0]*B[0]+A[1]*B[2], A[0]*B[1]+A[1]*B[3], A[2]*B[0]+A[3]*B[2], A[2]*B[1]+A[3]*B[3]];
export function projection(v, u) { return dot(u, u) < EPS ? null : scale(u, dot(v, u) / dot(u, u)); }
export function solve(A, b) {
  const D = det(A);
  if (Math.abs(D) > EPS) return { kind: 'unique', x: [(b[0]*A[3]-A[1]*b[1])/D, (A[0]*b[1]-b[0]*A[2])/D] };
  const zero = A.every(x => Math.abs(x) < EPS);
  if (zero) return { kind: b.every(x => Math.abs(x) < EPS) ? 'infinite' : 'none' };
  const inconsistent = Math.abs(A[0]*b[1]-A[2]*b[0]) > EPS || Math.abs(A[1]*b[1]-A[3]*b[0]) > EPS;
  return { kind: inconsistent ? 'none' : 'infinite' };
}
export function eigenvalues(A) {
  const t = A[0] + A[3], disc = t*t - 4*det(A);
  return disc < -EPS ? null : [(t + Math.sqrt(Math.max(0, disc)))/2, (t - Math.sqrt(Math.max(0, disc)))/2];
}
export const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
export function median(xs) { const s = [...xs].sort((a,b) => a-b), m = Math.floor(s.length/2); return s.length % 2 ? s[m] : (s[m-1]+s[m])/2; }
export function variance(xs, sample = true) { if (xs.length <= (sample ? 1 : 0)) return NaN; const m = mean(xs); return xs.reduce((s,x)=>s+(x-m)**2,0)/(xs.length-(sample?1:0)); }
export function regression(points) {
  const mx = mean(points.map(p=>p[0])), my = mean(points.map(p=>p[1]));
  const xx = points.reduce((s,p)=>s+(p[0]-mx)**2,0);
  if (xx < EPS) return null;
  const slope = points.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/xx, intercept = my-slope*mx;
  const residuals = points.map(([x,y])=>y-intercept-slope*x), sse = dot(residuals,residuals);
  const syy = points.reduce((s,p)=>s+(p[1]-my)**2,0);
  return { slope, intercept, sse, residuals, r2: syy < EPS ? null : 1-sse/syy };
}
export const normalPDF = (x, mu = 0, sigma = 1) => Math.exp(-0.5*((x-mu)/sigma)**2)/(sigma*Math.sqrt(2*Math.PI));
export function normalCDF(x, mu=0, sigma=1) {
  const z = (x-mu)/(sigma*Math.sqrt(2)), sign = z < 0 ? -1 : 1, a = Math.abs(z), t = 1/(1+0.3275911*a);
  const erf = 1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-a*a);
  return (1+sign*erf)/2;
}
export function seededRandom(seed=42) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15,1|seed); t = t + Math.imul(t ^ t >>> 7,61|t) ^ t; return ((t ^ t >>> 14)>>>0)/4294967296; }; }
export function randomNormal(random=Math.random) { return Math.sqrt(-2*Math.log(Math.max(random(),1e-15)))*Math.cos(2*Math.PI*random()); }
export function binomialPMF(n, p) {
  if(p===0) return Array.from({length:n+1},(_,k)=>k===0?1:0);
  if(p===1) return Array.from({length:n+1},(_,k)=>k===n?1:0);
  let comb = 1;
  return Array.from({length:n+1},(_,k)=>{ if(k) comb *= (n-k+1)/k; return comb*p**k*(1-p)**(n-k); });
}
export function bootstrap(xs, count, random=Math.random) { return Array.from({length:count},()=>mean(Array.from({length:xs.length},()=>xs[Math.floor(random()*xs.length)]))); }
export function quantile(xs, p) { const s=[...xs].sort((a,b)=>a-b), pos=(s.length-1)*p, i=Math.floor(pos); return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(pos-i); }
export function histogram(xs, bins=20, lo=Math.min(...xs), hi=Math.max(...xs)) {
  if(hi===lo) { lo-=0.5; hi+=0.5; }
  const counts=Array(bins).fill(0), width=(hi-lo)/bins;
  for(const x of xs) if(x>=lo&&x<=hi) counts[Math.min(bins-1,Math.floor((x-lo)/width))]++;
  return {counts,lo,hi,width};
}
export const fmt = (x, digits=2) => Number.isFinite(x) ? String(Number(x.toFixed(digits))) : 'undefined';
