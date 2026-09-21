import * as THREE from 'three';

// The Brainrot Express cast. Every passenger is built from primitives so the
// cast shares the diorama's toy-like finish and adds no runtime assets. Each
// figure stands with its feet at the origin, faces +Z and is about 2.2 units tall.

const cache = new Map();
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: 0, ...extra }));
  return cache.get(key);
}
function add(parent, geometry, material, [x = 0, y = 0, z = 0] = [], [rx = 0, ry = 0, rz = 0] = [], scale) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m); return m;
}
const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, n = 18) => new THREE.CylinderGeometry(a, b, h, n);

function eyes(parent, y, z, spread, r = .13, angry = false) {
  const white = mat('#fbfbf6', { roughness: .25 }), black = mat('#111214', { roughness: .2 });
  for (const s of [-1, 1]) {
    add(parent, sphere(r), white, [s * spread, y, z], [], [1, 1, .55]);
    add(parent, sphere(r * .55, 14, 10), black, [s * spread, y - r * .05, z + r * .42], [], [1, 1, .5]);
    add(parent, sphere(r * .16, 8, 6), white, [s * spread + r * .18, y + r * .2, z + r * .62]);
    if (angry) add(parent, box(r * 2.4, r * .45, r * .5), black, [s * spread, y + r * 1.15, z + r * .2], [0, 0, -s * .35]);
  }
}
function smile(parent, y, z, r = .16, color = '#2a1c1c') {
  add(parent, new THREE.TorusGeometry(r, r * .22, 8, 16, Math.PI), mat(color), [0, y, z], [0, 0, Math.PI]);
}
function legs(parent, color, shoe, spread = .22, height = .55, shoeSize = [.26, .16, .38]) {
  const out = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * spread, height, 0); parent.add(leg);
    add(leg, cyl(.06, .06, height, 10), mat(color), [0, -height / 2, 0]);
    add(leg, box(...shoeSize), mat(shoe), [0, -height + shoeSize[1] / 2, shoeSize[2] * .18]);
    out.push(leg);
  }
  return out;
}
function arms(parent, color, y, spread, length = .55) {
  const out = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * spread, y, 0); arm.rotation.z = s * .5; parent.add(arm);
    add(arm, cyl(.055, .055, length, 10), mat(color), [0, -length / 2, 0]);
    add(arm, sphere(.09, 12, 8), mat(color), [0, -length, 0]);
    out.push(arm);
  }
  return out;
}

// --- The cast --------------------------------------------------------------

function tofu() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const l = legs(g, '#e8e2cf', '#2b2f36');
  add(body, box(1.25, 1.25, 1.1), mat('#f6f2e4', { roughness: .8 }), [0, 1.2, 0]);
  const shade = mat('#0d0f12', { roughness: .1, metalness: .4 });
  add(body, box(1.05, .07, .06), shade, [0, 1.47, .58]);
  for (const s of [-1, 1]) add(body, box(.42, .26, .06), shade, [s * .27, 1.38, .6]);
  smile(body, 1.02, .56, .14);
  const a = arms(body, '#e8e2cf', 1.1, .66);
  return { group: g, anim(t) { body.position.y = Math.abs(Math.sin(t * 6)) * .18; body.rotation.y = Math.sin(t * 3) * .25; a.forEach((arm, i) => arm.rotation.z = (i ? 1 : -1) * (1.2 + Math.sin(t * 12) * .6)); l.forEach((leg, i) => leg.rotation.x = Math.sin(t * 12 + i * Math.PI) * .4); } };
}

function sushi() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const l = legs(g, '#f3efe6', '#d8282f', .3, .5, [.36, .24, .56]);
  for (const s of [-1, 1]) add(l[s > 0 ? 1 : 0], box(.37, .05, .57), mat('#ffffff'), [0, -.47, .1]);
  add(body, new THREE.CapsuleGeometry(.5, .75, 6, 16), mat('#f7f5ee', { roughness: .9 }), [0, 1.0, 0], [0, 0, Math.PI / 2]);
  add(body, box(1.9, .3, 1.05), mat('#ff7a4d', { roughness: .35 }), [0, 1.56, 0], [0, 0, .04]);
  for (const x of [-.6, -.15, .3, .75]) add(body, box(.07, .31, 1.07), mat('#ffd9c4'), [x, 1.56, 0], [0, 0, .5]);
  add(body, box(.34, 1.25, 1.12), mat('#10261c', { roughness: .7 }), [0, 1.2, 0]);
  eyes(body, 1.02, .46, .52, .14);
  smile(body, .78, .5, .12);
  return { group: g, anim(t) { body.rotation.z = Math.sin(t * 4) * .15; body.position.y = Math.abs(Math.sin(t * 8)) * .12; l.forEach((leg, i) => leg.rotation.x = Math.sin(t * 8 + i * Math.PI) * .55); } };
}

function banana() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  legs(g, '#e8c93a', '#3a2a1c', .2, .45);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(.35, .45, 0), new THREE.Vector3(0, 1.1, .1), new THREE.Vector3(.05, 1.8, 0), new THREE.Vector3(.4, 2.35, -.1)]);
  add(body, new THREE.TubeGeometry(curve, 24, .34, 14), mat('#f5d23b', { roughness: .45 }));
  add(body, sphere(.2, 10, 8), mat('#4d3b20'), [.4, 2.4, -.1]);
  add(body, sphere(.34, 16, 10), mat('#f5d23b', { roughness: .45 }), [.35, .45, 0]);
  // Kabuto helmet with a gilt crest.
  add(body, new THREE.SphereGeometry(.46, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8e1f1f', { roughness: .35, metalness: .3 }), [.07, 1.95, 0]);
  add(body, new THREE.TorusGeometry(.32, .04, 8, 20, Math.PI), mat('#d9a93a', { metalness: .8, roughness: .25 }), [.07, 2.3, .22]);
  eyes(body, 1.55, .4, .15, .11, true);
  const sword = new THREE.Group(); sword.position.set(-.45, 1.2, .25); body.add(sword);
  add(sword, box(.06, 1.5, .02), mat('#d9dde2', { metalness: .9, roughness: .15 }), [0, .85, 0]);
  add(sword, box(.26, .05, .1), mat('#d9a93a', { metalness: .8, roughness: .25 }), [0, .08, 0]);
  add(sword, cyl(.045, .045, .35, 8), mat('#222'), [0, -.12, 0]);
  return { group: g, anim(t) { sword.rotation.z = Math.sin(t * 5) * .9 + .4; body.rotation.y = Math.sin(t * 1.3) * .5; body.position.y = Math.abs(Math.sin(t * 5)) * .1; } };
}

function daruma() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  add(body, sphere(.85, 28, 20), mat('#c9231d', { roughness: .3 }), [0, .95, 0], [], [1, 1.12, .95]);
  add(body, new THREE.CircleGeometry(.52, 28), mat('#f7ecd6'), [0, 1.15, .78], [-.1, 0, 0]);
  add(body, sphere(.14, 14, 10), mat('#0e0e0e'), [-.2, 1.25, .8], [], [1, 1, .4]);
  add(body, new THREE.TorusGeometry(.14, .03, 6, 16), mat('#0e0e0e'), [.2, 1.25, .8]);
  for (const s of [-1, 1]) {
    add(body, box(.28, .07, .05), mat('#1a1a1a'), [s * .2, 1.45, .8], [0, 0, s * -.25]);
    add(body, box(.22, .06, .05), mat('#1a1a1a'), [s * .14, .95, .82], [0, 0, s * .4]);
  }
  add(body, new THREE.TorusGeometry(.2, .04, 8, 20), mat('#d9a93a', { metalness: .8, roughness: .3 }), [0, .55, .7], [.3, 0, 0]);
  return { group: g, anim(t) { body.rotation.z = Math.sin(t * 3.4) * .35; body.rotation.x = Math.sin(t * 2.1) * .1; } };
}

function kappa() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const l = legs(g, '#4fa35a', '#2d5f35', .22, .5);
  add(body, new THREE.CapsuleGeometry(.5, .7, 6, 16), mat('#58b565', { roughness: .45 }), [0, 1.25, 0]);
  add(body, new THREE.SphereGeometry(.55, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#6b4b2a', { roughness: .6 }), [0, 1.2, -.3], [-Math.PI / 2, 0, 0], [1, 1.2, .8]);
  add(body, new THREE.ConeGeometry(.16, .4, 12), mat('#f2c230'), [0, 1.35, .6], [Math.PI / 2, 0, 0]);
  eyes(body, 1.62, .48, .2, .12);
  // The cappuccino takes the place of the kappa's head dish. Do not spill it.
  const cup = new THREE.Group(); cup.position.set(0, 2.0, 0); body.add(cup);
  add(cup, cyl(.36, .26, .42, 22), mat('#fbfaf6', { roughness: .2 }), [0, .2, 0]);
  add(cup, cyl(.33, .33, .03, 22), mat('#c9955b', { roughness: .8 }), [0, .41, 0]);
  add(cup, new THREE.TorusGeometry(.12, .035, 8, 16), mat('#fbfaf6', { roughness: .2 }), [.38, .2, 0], [0, 0, 0]);
  add(cup, sphere(.06, 8, 6), mat('#f4e2c8'), [-.05, .44, .05], [], [1.4, .3, 1]);
  add(cup, sphere(.06, 8, 6), mat('#f4e2c8'), [.05, .44, .05], [], [1.4, .3, 1]);
  const a = arms(body, '#4fa35a', 1.35, .5);
  return { group: g, anim(t) { cup.rotation.y = t * 2; body.rotation.y = Math.sin(t * 2.5) * .4; a.forEach((arm, i) => arm.rotation.z = (i ? 1 : -1) * (.6 + Math.sin(t * 7 + i) * .4)); l.forEach((leg, i) => leg.rotation.x = Math.sin(t * 7 + i * Math.PI) * .35); } };
}

function onigiri() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  legs(g, '#f1e3cc', '#141414', .3, .78);
  add(body, cyl(1.0, 1.0, .75, 3), mat('#fbf9f3', { roughness: .9 }), [0, 1.25, 0], [Math.PI / 2, 0, Math.PI]);
  add(body, box(1.1, .5, .8), mat('#10221a', { roughness: .7 }), [0, .95, 0]);
  eyes(body, 1.35, .4, .22, .1, true);
  add(body, box(.62, .08, .06), mat('#141414'), [0, 1.52, .4]);
  add(body, box(.5, .16, .08), mat('#e2c9a6'), [0, 1.0, .42]);
  // The gigachad arm: biceps first, context later.
  const a = arms(body, '#e2c9a6', 1.25, .78, .6);
  for (const arm of a) add(arm, sphere(.17, 12, 10), mat('#e2c9a6'), [0, -.25, .05]);
  return { group: g, anim(t) { const flex = Math.sin(t * 4) > 0 ? 2.5 : 1.2; a.forEach((arm, i) => arm.rotation.z += ((i ? 1 : -1) * flex - arm.rotation.z) * .2); body.rotation.y = Math.sin(t * 1.7) * .3; } };
}

function tanuki() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  legs(g, '#6b4a2e', '#3a2616', .25, .4);
  add(body, sphere(.7, 22, 16), mat('#8a6440', { roughness: .8 }), [0, 1.05, 0], [], [1, 1.05, .9]);
  add(body, sphere(.48, 18, 12), mat('#d9c4a0', { roughness: .8 }), [0, .95, .35], [], [1, 1.1, .5]);
  add(body, sphere(.46, 20, 14), mat('#8a6440', { roughness: .8 }), [0, 1.95, 0]);
  add(body, sphere(.3, 14, 10), mat('#2b2018'), [0, 1.95, .2], [], [1.4, .55, .8]);
  for (const s of [-1, 1]) add(body, new THREE.ConeGeometry(.13, .25, 10), mat('#6b4a2e'), [s * .3, 2.35, 0], [0, 0, -s * .3]);
  eyes(body, 1.98, .44, .15, .09);
  add(body, sphere(.06, 8, 6), mat('#111'), [0, 1.86, .47]);
  // Tung tung tung: a taiko drum with two sticks.
  const drum = new THREE.Group(); drum.position.set(0, .85, .75); body.add(drum);
  add(drum, cyl(.42, .42, .38, 24), mat('#9b3b22', { roughness: .45 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(drum, cyl(.43, .43, .02, 24), mat('#f1e6cf'), [0, 0, .2], [Math.PI / 2, 0, 0]);
  const sticks = [-1, 1].map(s => { const st = new THREE.Group(); st.position.set(s * .38, 1.2, .5); body.add(st); add(st, cyl(.035, .035, .7, 8), mat('#d6b07a'), [0, .15, .2], [.9, 0, 0]); return st; });
  return { group: g, anim(t) { sticks.forEach((st, i) => st.rotation.x = Math.max(0, Math.sin(t * 14 + i * Math.PI)) * -.9); body.position.y = Math.abs(Math.sin(t * 7)) * .05; } };
}

export const ROSTER = [
  { id: 'tofu', name: 'Tofu Tofuini', emoji: '🧊', line: 'tofu tofu tofuini!!', build: tofu },
  { id: 'sushi', name: 'Sushirino Sneakerino', emoji: '🍣', line: 'fresh fit, fresher fish', build: sushi },
  { id: 'banana', name: 'Bananashi Samurai', emoji: '🍌', line: 'the blade is also the snack', build: banana },
  { id: 'daruma', name: 'Darumaru Dramarama', emoji: '🔴', line: 'one eye open. manifesting.', build: daruma },
  { id: 'kappa', name: 'Kappuccino Kappa', emoji: '☕', line: 'extra foam, no spilling', build: kappa },
  { id: 'onigiri', name: 'Onigiri Gigachadini', emoji: '🍙', line: 'rice. nori. mogging.', build: onigiri },
  { id: 'tanuki', name: 'Tanuki Tung Tung Taiko', emoji: '🥁', line: 'tung tung tung tung', build: tanuki }
];

function labelTexture(text, emoji) {
  const c = document.createElement('canvas'); c.width = 768; c.height = 160;
  const x = c.getContext('2d');
  x.font = '900 64px Impact, "Arial Black", sans-serif';
  const label = `${emoji} ${text}`, w = Math.min(740, x.measureText(label).width + 70);
  x.fillStyle = '#111111e0'; x.beginPath(); x.roundRect((768 - w) / 2, 20, w, 110, 55); x.fill();
  x.lineWidth = 6; x.strokeStyle = '#ffe14a'; x.stroke();
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 384, 78, 700);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

// A passenger: the figure, a waypoint label, and its own animation clock.
export function createPassenger(def) {
  const { group, anim } = def.build();
  const root = new THREE.Group(); root.add(group); root.scale.setScalar(1.05);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(def.name, def.emoji), depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
  label.scale.set(4.8, 1, 1); label.position.y = 3.6; label.renderOrder = 10; label.visible = false; root.add(label);
  return { def, root, figure: group, label, anim };
}
