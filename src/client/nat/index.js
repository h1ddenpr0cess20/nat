import { buildEnvironment } from './environment.js';
import { createDie } from './geometry.js';
import { createGrab } from './grab.js';
import { ENERGY_GAIN, MOODS } from './moods.js';

function spring(s, k, c, dt, to = 0) {
  s.v += (to - s.p) * k * dt - s.v * c * dt;
  s.p += s.v * dt;
}

const FUMBLED = { jitter: 0.01, lean: 0, rock: 0.005, rockSpeed: 0.6, tumble: 0, spinIdle: 0 };

const FRAME = { y: 0.06, halfW: 1.4, halfH: 1.4 };
const MARGIN = 1.3;

const RESIN = '#3a3350';
const DEAD = '#241f2c';

export function createNat({ stage, THREE }) {
  buildEnvironment({ stage, THREE });

  const { group, body, die, dieMat, edges, faces } = createDie(THREE);

  let state = 'idle';
  let broken = false;
  const target = { ...MOODS.idle };
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let lastEnergy = 0;

  const clock = new THREE.Clock();
  let t = 0;

  const sq = { p: 0, v: 0 };
  const tz = { p: 0, v: 0 };
  const tx = { p: 0, v: 0 };

  let y = 0, yV = 0, airborne = false;
  let x = 0, z = 0, heading = 0.7;
  let evtT = 2.2;

  let vx = 0, vz = 0;

  const spinAxis = new THREE.Vector3(0.4, 1, 0.2).normalize();
  const rollAxis = new THREE.Vector3();
  const here = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  const upY = new THREE.Vector3(0, 1, 0);
  let spinRate = 0;
  let settleQ = null, settling = 0;
  let thrown = false;
  let result = 0;
  let dead = 0;

  const resin = new THREE.Color(RESIN);
  const deadResin = new THREE.Color(DEAD);
  const fumbleInk = new THREE.Color('#ff7a5c');

  const land = (force) => {
    sq.v += force;
    tz.v += (Math.random() - 0.5) * force * 0.7;
    tx.v += (Math.random() - 0.5) * force * 0.45;
  };

  const chooseResult = () => {
    let best = -2, bi = 0;
    for (let i = 0; i < faces.length; i++) {
      const d = faces[i].normal.clone().applyQuaternion(body.quaternion).dot(upY);
      if (d > best) { best = d; bi = i; }
    }
    result = faces[bi].number;
    const cur = faces[bi].normal.clone().applyQuaternion(body.quaternion);
    settleQ = new THREE.Quaternion().setFromUnitVectors(cur, upY).multiply(body.quaternion);
    settling = 1;
  };

  const turnUp = (number) => {
    const f = faces.find((face) => face.number === number);
    if (!f) return;
    const cur = f.normal.clone().applyQuaternion(body.quaternion);
    settleQ = new THREE.Quaternion().setFromUnitVectors(cur, upY).multiply(body.quaternion);
    settling = 1;
    spinRate = 0;
    result = number;
  };

  let hand = null;

  const throwDie = () => {
    if (hand?.held) { thrown = true; return; }
    spinAxis.set(Math.random() - 0.5, Math.random() * 0.6 + 0.4, Math.random() - 0.5).normalize();
    spinRate = 15 + Math.random() * 9;
    yV = 2.4 + Math.random() * 0.6;
    airborne = true;
    thrown = true;
    settleQ = null; settling = 0;
    sq.v -= 2.4;
    heading = Math.random() * Math.PI * 2;
  };

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    const held = Boolean(hand?.held);

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    lastEnergy = energy;
    energy += (Math.min(1, sustain + impulse) - energy) * Math.min(1, dt * 6);
    dead += ((broken ? 1 : 0) - dead) * Math.min(1, dt * 2.2);

    const throwing = airborne || thrown || settling > 0;
    const mood = broken ? FUMBLED : (throwing ? MOODS.rolling : (MOODS[state] ?? MOODS.idle));
    for (const k in target) {
      target[k] = mood[k];
      m[k] += (mood[k] - m[k]) * Math.min(1, dt * 3.4);
    }

    const gain = ENERGY_GAIN;

    if (!held) {
      if (airborne) {
        yV -= 13 * dt; y += yV * dt;
        if (y <= 0) {
          y = 0;
          if (Math.abs(yV) > 0.9) {
            yV = -yV * 0.42;
            land(4.5 + Math.abs(yV));
            spinRate *= 0.55;
            x += Math.cos(heading) * 0.16; z += Math.sin(heading) * 0.16;
          } else {
            airborne = false; yV = 0;
            land(5.5);
          }
        }
      } else {
        y += (0 - y) * Math.min(1, dt * 8);
      }
    }

    if (!held) {
      x += vx * dt; z += vz * dt;
      const friction = Math.min(1, dt * (airborne ? 0.5 : 3.0));
      vx -= vx * friction; vz -= vz * friction;

      here.set(x, y, z);
      if (hand?.contain(here)) {
        x = here.x; z = here.z;
        if (airborne) y = Math.max(0, here.y);
        vx *= 0.4; vz *= 0.4;
      }
    }

    const travel = Math.hypot(vx, vz);
    if (thrown && !held && !airborne && travel < 0.12) { thrown = false; chooseResult(); }

    if (settling > 0 && settleQ) {
      body.quaternion.slerp(settleQ, Math.min(1, dt * 7));
      settling = Math.max(0, settling - dt * 0.8);
      spinRate = 0;
    } else {
      if ((held || !airborne) && travel > 0.02) {
        rollAxis.set(-vz, 0, vx).normalize();
        spinAxis.lerp(rollAxis, Math.min(1, dt * 6));
        if (spinAxis.lengthSq() < 1e-6) spinAxis.copy(rollAxis);
        spinAxis.normalize();
        spinRate = Math.max(spinRate, travel / (held ? 0.33 : 0.8));
      }
      const rate = spinRate + m.tumble * 2.6;
      if (rate > 0.001) {
        dq.setFromAxisAngle(spinAxis, rate * dt);
        body.quaternion.premultiply(dq);
      }
      spinRate = Math.max(0, spinRate - dt * (airborne ? 1.2 : 9));
      if (m.spinIdle > 0.001) {
        dq.setFromAxisAngle(upY, m.spinIdle * dt);
        body.quaternion.premultiply(dq);
      }
    }

    if (!airborne && !throwing && !broken && !held) {
      evtT -= dt;
      if (evtT <= 0) {
        const r = Math.random();
        if (r < 0.4) sq.v += 1.8;
        else if (r < 0.7) { tz.v += (Math.random() - 0.5) * 4; tx.v += 1.2; }
        else { yV = 1.1 + Math.random() * 0.5; airborne = true; spinRate = 3.5; sq.v -= 1.6; }
        evtT = 2.8 + Math.random() * 4.5;
      }
    }

    if (state === 'speaking' && !broken) {
      const onset = Math.max(0, energy - lastEnergy);
      if (onset > 0.008) {
        sq.v += onset * 24;
        tz.v += (Math.random() - 0.5) * onset * 26;
      }
    }

    spring(sq, 185, 11, dt);
    const rockAmt = Math.sin(t * (m.rockSpeed + energy * gain.rockSpeed) * 2.0)
      * (m.rock + energy * gain.rock);
    spring(tz, 68, 6.2, dt, rockAmt);
    spring(tx, 68, 6.2, dt, m.lean * 0.2);

    const tremor = (m.jitter + energy * gain.jitter) * 0.014;
    const breathe = Math.sin(t * 1.3) * 0.007;

    group.position.set(
      x + (Math.random() - 0.5) * tremor,
      y + breathe * 0.5 + Math.abs(rockAmt) * 0.34,
      z + (Math.random() - 0.5) * tremor);
    group.rotation.set(
      tx.p + (Math.random() - 0.5) * tremor,
      0,
      tz.p + (Math.random() - 0.5) * tremor * 1.3);

    const s = sq.p * 0.075 + breathe;
    body.scale.set(1 + s * 0.45, 1 - s * 0.8, 1 + s * 0.45);

    for (const f of faces) {
      if (f.number !== 20 && f.number !== 1) continue;
      const lit = Math.max(0, f.normal.clone().applyQuaternion(body.quaternion).dot(upY));
      if (f.number === 20) {
        f.mesh.material.color.setRGB(1, 1 - lit * 0.06, 1 - lit * 0.28).multiplyScalar(1 + lit * 1.9);
        f.mesh.scale.setScalar(1 + lit * 0.1);
      } else {
        f.mesh.material.color.setRGB(1, 1, 1).lerp(fumbleInk, dead * lit).multiplyScalar(1 + dead * lit * 1.4);
        f.mesh.scale.setScalar(1 + dead * lit * 0.12);
      }
    }

    dieMat.color.copy(resin).lerp(deadResin, dead);
    dieMat.clearcoat = 0.9 - dead * 0.75;
    edges.material.opacity = 0.55 * (1 - dead * 0.65);
  };

  stage.setObject(group);

  let dir = new THREE.Vector3(0.85, 0.55, 1.2).normalize();
  stage._controls.addEventListener('start', () => { dir = null; });

  stage._controls.target.set(0, FRAME.y, 0);

  const reframe = () => {
    const camera = stage._camera;
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    const aspect = w / h;

    const dist = (Math.max(FRAME.halfH, FRAME.halfW / aspect)
      / Math.tan((camera.fov * Math.PI) / 360)) * MARGIN;

    const focus = stage._controls.target;
    const view = dir ? dir.clone() : camera.position.clone().sub(focus).normalize();
    if (view.lengthSq() === 0) view.set(0.85, 0.55, 1.2).normalize();
    camera.position.copy(focus).addScaledVector(view, dist);
    camera.near = Math.max(dist / 100, 0.01);
    camera.far = dist * 100;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    stage._controls.update();
  };

  reframe();
  new ResizeObserver(reframe).observe(stage);

  const CARRY = 5;

  hand = createGrab({
    stage, THREE, mesh: die,
    at: () => here.set(x, y, z),

    onGrab() {
      settleQ = null; settling = 0;
      thrown = false;
      airborne = false; yV = 0;
      vx = 0; vz = 0;
      evtT = 2.8;
    },

    onDrag(p, dt) {
      const clamp = (v) => Math.max(-CARRY, Math.min(CARRY, v));
      vx += (clamp((p.x - x) / dt) - vx) * 0.35;
      vz += (clamp((p.z - z) / dt) - vz) * 0.35;
      yV = clamp((p.y - y) / dt);
      x = p.x; z = p.z; y = Math.max(0, p.y);
    },

    onDrop() {
      if (broken) { vx = vz = yV = 0; turnUp(1); return; }
      thrown = true;
      if (y > 0.02 || yV > 0.4) airborne = true;
      spinRate = Math.max(spinRate, Math.hypot(vx, vz) * 2.2 + Math.max(0, yV) * 1.5);
    },
  });

  stage._ground.visible = false;
  stage._key.castShadow = false;
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  (function loop() {
    requestAnimationFrame(loop);
    frame();
  })();

  return {
    get state() {
      return state;
    },

    get result() {
      return result;
    },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
      if (next === 'thinking' && !broken) throwDie();
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    pulse(weight = 0.3) {
      impulse = Math.min(1, impulse + Math.min(1, Math.max(0, weight)));
    },

    roll() {
      if (broken) return;
      throwDie();
    },

    jolt(weight = 1) {
      if (broken || airborne || hand?.held) return;
      yV = 1.3 + Math.random() * 0.6 * weight;
      airborne = true;
      spinRate = 4.5 * weight;
      sq.v -= 2.2 * weight;
      impulse = Math.min(1, impulse + 0.5 * weight);
    },

    fumble(on = true) {
      const next = Boolean(on);
      if (next === broken) return;
      broken = next;
      if (broken) {
        sustain = 0;
        airborne = false;
        thrown = false;
        yV = 0;
        vx = vz = 0;
        turnUp(1);
      }
    },
  };
}
