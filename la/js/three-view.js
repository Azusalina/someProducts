import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const colors = { v:0x5282a0, u:0xc77d9e, result:0x47724a };
export function createThreeView(container, mode, state) {
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor(0xefeee5);
  renderer.domElement.setAttribute('aria-label','Interactive 3D coordinate space / 互動三維座標空間');
  renderer.domElement.setAttribute('role','img');
  container.append(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38,1,0.1,150);
  camera.up.set(0,0,1); camera.position.set(10,-13,10);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.target.set(0.5,0.5,0.5); controls.minDistance=3; controls.maxDistance=65;
  const fixed = new THREE.Group(); scene.add(fixed);
  for(let i=-6;i<=6;i++) {
    line(fixed, [[i,-6,0],[i,6,0]],0xd3d5c8);
    line(fixed, [[-6,i,0],[6,i,0]],0xd3d5c8);
  }
  arrow(fixed,[6,0,0],0x627d92); arrow(fixed,[0,6,0],0xb77692); arrow(fixed,[0,0,6],0x657c4a);
  line(fixed,[[-6,0,0],[0,0,0]],0xa5afa2); line(fixed,[[0,-6,0],[0,0,0]],0xa5afa2);
  let dynamic = new THREE.Group(); scene.add(dynamic);
  let labels=[];
  function label(name,position) { const el=document.createElement('span'); el.className='three-label'; el.textContent=name; container.append(el); labels.push({el,position:new THREE.Vector3(...position)}); }
  function render() {
    renderer.render(scene,camera);
    for(const {el,position} of labels) {
      const p=position.clone().project(camera);
      el.style.left=`${(p.x+1)/2*container.clientWidth}px`; el.style.top=`${(1-p.y)/2*container.clientHeight}px`;
      el.hidden=p.z>1||p.z< -1;
    }
  }
  function resize() { const w=container.clientWidth,h=container.clientHeight; if(!w||!h)return; renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render(); }
  const observer = new ResizeObserver(resize); observer.observe(container); controls.addEventListener('change',render);
  function update(s) {
    dispose(dynamic); scene.remove(dynamic); dynamic=new THREE.Group(); scene.add(dynamic);
    labels.forEach(({el})=>el.remove());labels=[];
    label('x',[6.35,0,0]); label('y',[0,6.35,0]);label('z',[0,0,6.35]);
    if(mode==='matrix'||mode==='determinant') {
      const A=s.A3, t=s.t;
      const map=p=>p.map((_,r)=>p.reduce((sum,x,c)=>sum+((r===c?1-t:0)+t*A[3*r+c])*x,0));
      const original=Array.from({length:8},(_,i)=>[i&1,(i>>1)&1,(i>>2)&1]);
      const vertices=original.map(map);
      const edges=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
      for(const [a,b] of edges) {line(dynamic,[original[a],original[b]],0xaaa99b);line(dynamic,[vertices[a],vertices[b]],colors.result);}
      const faces=[0,1,3,0,3,2,4,6,7,4,7,5,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(i=>vertices[i]),3));
      dynamic.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xa6bd77,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false})));
      const vp=map(s.v);arrow(dynamic,vp,colors.v);label('Av',vp);
      [[1,0,0],[0,1,0],[0,0,1]].forEach((p,i)=>{const q=map(p);arrow(dynamic,q,[colors.v,colors.u,colors.result][i]);label(`Ae${i+1}`,q);});
    } else {
      const v=s.v,u=s.u, result=mode==='span'?v.map((x,i)=>s.c1*u[i]+s.c2*x):v.map(x=>x*s.scale);
      arrow(dynamic,v,colors.v);label('v',v);
      if(mode==='span') {
        arrow(dynamic,u,colors.u);label('u',u);
        const verts=[u.map(x=>x*3),v.map(x=>x*3),u.map(x=>-x*3),v.map(x=>-x*3)];
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,1,2,0,2,3].flatMap(i=>verts[i]),3));
        dynamic.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xa6bd77,transparent:true,opacity:.19,side:THREE.DoubleSide,depthWrite:false})));
        line(dynamic,[u.map(x=>x*s.c1),result],colors.v);
        label('c₁u + c₂v',result);
      } else label('s·v',result);
      arrow(dynamic,result,colors.result);
    }
    resize();render();
  }
  update(state);
  return { update, resetCamera(){camera.position.set(10,-13,10);controls.target.set(.5,.5,.5);controls.update();render();}, dispose(){observer.disconnect();controls.dispose();dispose(scene);renderer.dispose();renderer.forceContextLoss();labels.forEach(({el})=>el.remove());renderer.domElement.remove();} };
}
function line(group,points,color) { const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));group.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color}))); }
function arrow(group,p,color) {
  const vector=new THREE.Vector3(...p),length=vector.length();
  if(length<1e-8) {const m=new THREE.Mesh(new THREE.SphereGeometry(.07,12,8),new THREE.MeshBasicMaterial({color}));group.add(m);return;}
  group.add(new THREE.ArrowHelper(vector.clone().normalize(),new THREE.Vector3(),length,color,Math.min(.3,length*.25),Math.min(.17,length*.13)));
}
function dispose(object) { const geometries=new Set(),materials=new Set();object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose()); }
