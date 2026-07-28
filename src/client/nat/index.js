/**
 * Nat, as a controller.
 *
 * Everything visual lives under this directory; nothing in it knows where its
 * input comes from. The controller surface is deliberately audio-shaped so a
 * voice pipeline drops in without touching the geometry:
 *
 *   nat.setState('speaking')  idle | listening | thinking | speaking
 *   nat.setLevel(0.62)        sustained amplitude 0..1, sampled per frame
 *   nat.pulse(0.4)            transient impulse 0..1, one per discrete event
 *   nat.roll()                throw it; it lands on a number and stays there
 *   nat.jolt(0.9)             it has been talked over and it hops
 *   nat.fumble(true)          the API is broken; it comes up 1 and goes dead
 *
 * Nothing here is a sine wave dressed up as motion. The hop is ballistic — real
 * gravity, real bounces that bleed off angular velocity — and everything else
 * is a damped spring reacting to a landing. Stiff springs and heavy damping are
 * what make a two-centimetre lump of resin read as heavy.
 *
 * The throw is honest. The die tumbles freely, whatever face happens to be
 * nearest up when it stops is the result, and it is rotated flat to the top
 * rather than picked first and animated to. `nat.result` is therefore a real
 * roll, and the number the player can see is the number that came up.
 *
 * Two things are not conversational states. Being cut off is a hop. An API
 * failure holds `fumbled` — the 1 face turned up, the resin gone dead, no
 * fidget and no drift — until something works again. That is the one mood not
 * inherited from the prototype, and it means exactly one thing.
 */

import { buildEnvironment } from './environment.js';
import { createDie } from './geometry.js';
import { ENERGY_GAIN, MOODS } from './moods.js';

/** One step of a damped spring toward `to`. */
function spring(s, k, c, dt, to = 0) {
  s.v += (to - s.p) * k * dt - s.v * c * dt;
  s.p += s.v * dt;
}

/* The dead-API mood. Everything else in MOODS came off the prototype; this one
   has to be invented, because a die has no "packed away" pose to borrow. */
const FUMBLED = { jitter: 0.01, lean: 0, rock: 0.005, rockSpeed: 0.6, tumble: 0, spinIdle: 0 };

/* Framing: half-extents of everything the die can do, not of where it is
   sitting — it hops, and a box measured at rest would clip the apex. */
const FRAME = { y: 0.06, halfW: 1.4, halfH: 1.4 };
const MARGIN = 1.3;

const RESIN = '#3a3350';
const DEAD = '#241f2c';

export function createNat({ stage, THREE }) {
  buildEnvironment({ stage, THREE });

  const { group, body, dieMat, edges, faces } = createDie(THREE);

  let state = 'idle';
  let broken = false;
  const target = { ...MOODS.idle };
  const m = { ...MOODS.idle };

  /* `energy` is what the die reads. `sustain` is where it settles (the live
     audio level); `impulse` decays on top of it (discrete events). */
  let sustain = 0;
  let impulse = 0;
  let energy = 0;
  let lastEnergy = 0;

  const clock = new THREE.Clock();
  let t = 0;

  /* Springs: squash, side rock, fore/aft lean. */
  const sq = { p: 0, v: 0 };
  const tz = { p: 0, v: 0 };
  const tx = { p: 0, v: 0 };

  let y = 0, yV = 0, airborne = false;
  let x = 0, z = 0, heading = 0.7;
  let evtT = 2.2;

  /* Free tumbling: an angular velocity bled off by each bounce. */
  const spinAxis = new THREE.Vector3(0.4, 1, 0.2).normalize();
  const dq = new THREE.Quaternion();
  const upY = new THREE.Vector3(0, 1, 0);
  let spinRate = 0;
  let settleQ = null, settling = 0;
  let thrown = false;           // a real roll, as opposed to an impatient hop
  let result = 0;
  let dead = 0;                 // eased 0..1, how far gone the resin looks

  const resin = new THREE.Color(RESIN);
  const deadResin = new THREE.Color(DEAD);
  const fumbleInk = new THREE.Color('#ff7a5c');

  /** A landing shoves the whole thing, with a little skew so no two match. */
  const land = (force) => {
    sq.v += force;
    tz.v += (Math.random() - 0.5) * force * 0.7;
    tx.v += (Math.random() - 0.5) * force * 0.45;
  };

  /** Whichever face is nearest up when it stops is the roll. Rotate it flat. */
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

  /** Turn a chosen face to the top without a throw — how the 1 comes up. */
  const turnUp = (number) => {
    const f = faces.find((face) => face.number === number);
    if (!f) return;
    const cur = f.normal.clone().applyQuaternion(body.quaternion);
    settleQ = new THREE.Quaternion().setFromUnitVectors(cur, upY).multiply(body.quaternion);
    settling = 1;
    spinRate = 0;
    result = number;
  };

  const throwDie = () => {
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

    /* --- energy ----------------------------------------------------------- */
    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    lastEnergy = energy;
    energy += (Math.min(1, sustain + impulse) - energy) * Math.min(1, dt * 6);
    dead += ((broken ? 1 : 0) - dead) * Math.min(1, dt * 2.2);

    /* --- mood --------------------------------------------------------------
       Mid-throw the roll owns the mood, whatever the conversation is doing; a
       broken API owns it outright. Everything is eased into, so nothing snaps. */
    const throwing = airborne || settling > 0;
    const mood = broken ? FUMBLED : (throwing ? MOODS.rolling : (MOODS[state] ?? MOODS.idle));
    for (const k in target) {
      target[k] = mood[k];
      m[k] += (mood[k] - m[k]) * Math.min(1, dt * 3.4);
    }

    const gain = ENERGY_GAIN;

    /* --- ballistic hop, and hard landings ---------------------------------- */
    if (airborne) {
      yV -= 13 * dt; y += yV * dt;
      if (y <= 0) {
        y = 0;
        if (Math.abs(yV) > 0.9) {              // still enough left to bounce
          yV = -yV * 0.42;
          land(4.5 + Math.abs(yV));
          spinRate *= 0.55;
          x += Math.cos(heading) * 0.16; z += Math.sin(heading) * 0.16;
        } else {
          airborne = false; yV = 0;
          land(5.5);
          if (thrown) { thrown = false; chooseResult(); }
        }
      }
    } else {
      y += (0 - y) * Math.min(1, dt * 8);
      x += (0 - x) * Math.min(1, dt * 1.4);
      z += (0 - z) * Math.min(1, dt * 1.4);
    }

    /* --- tumble, then settle onto the face that won ------------------------- */
    if (settling > 0 && settleQ) {
      body.quaternion.slerp(settleQ, Math.min(1, dt * 7));
      settling = Math.max(0, settling - dt * 0.8);
      spinRate = 0;
    } else {
      // thinking and speaking keep a lazy tumble going with no throw behind it
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

    /* --- idle: nudges, and the occasional impatient hop --------------------- */
    if (!airborne && !throwing && !broken) {
      evtT -= dt;
      if (evtT <= 0) {
        const r = Math.random();
        if (r < 0.4) sq.v += 1.8;
        else if (r < 0.7) { tz.v += (Math.random() - 0.5) * 4; tx.v += 1.2; }
        else { yV = 1.1 + Math.random() * 0.5; airborne = true; spinRate = 3.5; sq.v -= 1.6; }
        evtT = 2.8 + Math.random() * 4.5;
      }
    }

    /* --- speaking: one shove per syllable, taken from the audio -------------
       The prototype guessed at syllables on a timer. This reads them off the
       waveform instead: a rising edge in the envelope is an onset, and its
       steepness is how hard the die gets shoved. Consonants land harder than
       vowels, which is what makes it look like it is forming words. */
    if (state === 'speaking' && !broken) {
      const onset = Math.max(0, energy - lastEnergy);
      if (onset > 0.008) {
        sq.v += onset * 24;
        tz.v += (Math.random() - 0.5) * onset * 26;
      }
    }

    /* --- integrate ---------------------------------------------------------- */
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

    /* --- the two faces that mean something ----------------------------------
       The 20 lights as it comes up, and the 1 lights red while the API is down.
       Both are driven by how squarely the face is turned at the ceiling, so
       they fade in as the die rolls rather than switching on. */
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
    dieMat.clearcoat = 0.9 - dead * 0.75;      // the shine goes out of it
    edges.material.opacity = 0.55 * (1 - dead * 0.65);
  };

  stage.setObject(group);

  /* --- framing --------------------------------------------------------------
     setObject() frames an object once, against the camera's *vertical* field of
     view. A phone held upright is much narrower than it is tall, so that
     framing crops at the sides. Fit whichever axis is tighter instead, and
     re-run it whenever the viewport changes, so a rotation or the keyboard
     opening reframes rather than clips. Orbiting is preserved: the user's own
     view direction is kept the moment they drag. */
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

  /* setObject() turns shadows on for everything it traverses. There is no
     table here — the die hangs in the void — so nothing has anything to cast
     onto, and the shadow pass is wasted work. */
  stage._ground.visible = false;
  stage._key.castShadow = false;
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });

  /* Its own rAF loop rather than an onBeforeRender hook: the hook belongs to a
     mesh, and a mesh that is hidden — or skipped by a render pass — stops
     ticking, which would freeze the character rather than pause it. */
  (function loop() {
    requestAnimationFrame(loop);
    frame();
  })();

  return {
    get state() {
      return state;
    },

    /** The last number rolled, or 0 if it hasn't been thrown yet. */
    get result() {
      return result;
    },

    /** idle | listening | thinking | speaking. Unknown names are ignored —
     *  hasOwn, not a truth test: `MOODS.constructor` is truthy and NaNs every
     *  channel it touches.
     *
     *  Entering `thinking` throws the die: the player asks, the die goes up,
     *  and it is on a number before the answer starts. */
    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
      if (next === 'thinking' && !broken) throwDie();
    },

    /** Sustained amplitude, 0..1. Call per frame. */
    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    /** Transient impulse, 0..1. Call once per discrete event. */
    pulse(weight = 0.3) {
      impulse = Math.min(1, impulse + Math.min(1, Math.max(0, weight)));
    },

    /** Throw it. Lands on a real number; read it off `result`. */
    roll() {
      if (broken) return;
      throwDie();
    },

    /** Talk over it and it jumps — an impatient hop, harder than the idle one,
     *  and not a roll: whatever it was showing it keeps. */
    jolt(weight = 1) {
      if (broken || airborne) return;
      yV = 1.3 + Math.random() * 0.6 * weight;
      airborne = true;
      spinRate = 4.5 * weight;
      sq.v -= 2.2 * weight;
      impulse = Math.min(1, impulse + 0.5 * weight);
    },

    /** The API is unreachable, or it is back. Held either way: this is the one
     *  thing on screen that says the call is broken rather than quiet. */
    fumble(on = true) {
      const next = Boolean(on);
      if (next === broken) return;
      broken = next;
      if (broken) {
        sustain = 0;
        airborne = false;
        yV = 0;
        turnUp(1);   // it comes up 1, which is the only honest thing to show
      }
    },
  };
}
