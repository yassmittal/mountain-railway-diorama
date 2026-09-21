import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFile,readdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
register('./module-loader.mjs',import.meta.url);
const root=new URL('../',import.meta.url),THREE=await import('three');
assert.equal(THREE.REVISION,'185');
const visited=new Set();let importCount=0;
async function imports(url){
  if(visited.has(url.href))return;visited.add(url.href);await access(url);
  const source=await readFile(url,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    const name=match[1];let dependency;
    if(name==='three')dependency=new URL('vendor/three.module.js',root);
    else if(name.startsWith('three/addons/'))dependency=new URL('vendor/addons/'+name.slice(13),root);
    else if(name.startsWith('.'))dependency=new URL(name,url);
    else throw Error('Unbundled import '+name);
    importCount++;await imports(dependency);
  }
}
await imports(new URL('main.js',root));
for(const f of await readdir(root))if(f.endsWith('.js')){const r=spawnSync(process.execPath,['--check',fileURLToPath(new URL(f,root))],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
const ctx={fillRect(){},strokeRect(){},fillText(){}};
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>ctx})};
const {createWorld}=await import('../world.js'),{createArchitecture}=await import('../architecture.js'),{createGeology}=await import('../geology.js'),{createTrain}=await import('../train.js'),{createVegetation}=await import('../vegetation.js');
const shared={time:{value:0},wind:{value:.5},wetness:{value:0},night:{value:0}},scene=new THREE.Scene(),world=createWorld(scene,shared);
const architecture=createArchitecture(scene,world,shared),geology=createGeology(scene,world,shared),train=createTrain(scene,world.curve,shared),vegetation=createVegetation(scene,world,shared);
scene.updateMatrixWorld(true);let meshes=0;
scene.traverse(o=>{if(!o.isMesh)return;meshes++;for(const a of Object.values(o.geometry.attributes))for(const value of a.array)assert(Number.isFinite(value),'Nonfinite geometry: '+o.name);});
// Clearance through both actual excavated terrain throats and masonry portals.
let rays=0;
for(const [u,sign] of [[world.tunnelStart,1],[world.tunnelEnd,-1]]){
  const p=world.curve.getPointAt(u),t=world.curve.getTangentAt(u).multiplyScalar(sign),n=new THREE.Vector3(t.z,0,-t.x);
  const portal=world.group.children.find(o=>o.isGroup&&o.position.distanceTo(p)<.01);
  for(const side of [-.8,0,.8])for(const h of [.9,1.8,2.9])for(const object of [world.group.children[0],portal]){
    const origin=p.clone().addScaledVector(t,-3).addScaledVector(n,side);origin.y+=h;
    assert.equal(new THREE.Raycaster(origin,t,0,6).intersectObject(object,true).length,0,'Blocked portal');rays++;
  }
}
// Gorge rock must stay below the loading envelope wherever it crosses the track.
for(const m of geology.group.children){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){
 const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(world.railDistance(x,z)<2.8){const trackY=world.railHeight(x,z);assert(y<trackY-.35||y>trackY+4.1,'Rock in train clearance');}
}}
// Existing courtyard support heights must survive changes to the mountain.
const origin=world.curve.getPointAt(world.stationU),tangent=world.curve.getTangentAt(world.stationU),frame=new THREE.Object3D();frame.position.copy(origin);frame.rotation.y=-Math.atan2(tangent.z,tangent.x);frame.updateMatrixWorld();
const surfaces=[];scene.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)surfaces.push(o);});
for(const [name,x,z,y,expected] of [['barrel',2.78,8.67,.731,.73],['planter',6.5,5.54,.641,.64],['watering can',5.82,6.65,.621,.62],['bicycle rear',7.69,6.01,.614,.61],['bicycle front',9.09,6.01,.614,.61],['fence',9.6,8.7,.66,.61]]){
 const ray=new THREE.Raycaster(new THREE.Vector3(x,y,z).applyMatrix4(frame.matrixWorld),new THREE.Vector3(0,-1,0),0,2),hit=ray.intersectObjects(surfaces)[0];assert(hit&&Math.abs(hit.point.y-origin.y-expected)<.01,'Unsupported '+name);
}
let stops=0,stopping=false;
for(let i=0;i<15000;i++){
 train.update(1/60,i/60,{speed:1,night:1,rain:.6});const stop=train.status.includes('station stop');if(stop&&!stopping)stops++;stopping=stop;
 assert(Number.isFinite(train.speed)&&train.speed>=0);for(const car of train.cars)assert(car.position.toArray().every(Number.isFinite));
}
assert(stops>=3,'Train did not complete repeated station service');
const before=train.progress;train.update(.1,251,{paused:true,night:1});assert.equal(train.progress,before,'Pause moved the service');
// Brainrot Express: manual driving obeys throttle and brake, and the rules grade stops.
const {gradeStop,curveLimit,stopAura,TUNING}=await import('../rules.js');
train.place(train.length*3,0);const start=train.distance;
for(let i=0;i<300;i++)train.update(1/60,0,{manual:true,throttle:1,maxSpeed:TUNING.maxSpeed});
assert(train.speed>4&&train.distance>start+10,'Throttle did not move the train');
for(let i=0;i<600&&train.speed>0;i++)train.update(1/60,0,{manual:true,brake:1,brakeDecel:TUNING.brake});
assert.equal(train.speed,0,'Brake did not stop the train');const parked=train.distance;
train.update(1/60,0,{manual:true});assert.equal(train.distance,parked,'Parked train crept');
for(let i=0;i<60;i++)train.update(1/60,0,{manual:true,brake:1,lean:.6});for(const car of train.cars)assert(car.position.toArray().every(Number.isFinite));
assert.equal(gradeStop(.3).name,'PERFECT');assert.equal(gradeStop(-2).name,'OK');assert.equal(gradeStop(TUNING.stopWindow+.01),null);
assert(curveLimit(0)>curveLimit(.9),'Sharper curves must be slower');assert(stopAura(gradeStop(0),4)>stopAura(gradeStop(0),0),'Combo must multiply aura');
const camera=new THREE.PerspectiveCamera();camera.position.set(110,85,130);world.updateLOD(camera);vegetation.update(0,camera);const wide=vegetation.stats();camera.position.copy(architecture.stationTarget);world.updateLOD(camera);vegetation.update(1,camera);const close=vegetation.stats();assert(close.nearTrees>wide.nearTrees,'Vegetation LOD not responding');
assert(world.waterLevel(4.5)-world.waterLevel(8.5)>17,'Cascade lost its drop');
console.log(JSON.stringify({three:THREE.REVISION,modules:visited.size,imports:importCount,finiteMeshes:meshes,tunnelRays:rays,groundedProps:6,stationStops:stops,simulatedSeconds:250,manualDriving:'ok',wideTrees:wide.nearTrees,closeTrees:close.nearTrees},null,2));
