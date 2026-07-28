/**
 * Cool studio environment: resin wants a crisp highlight and a soft fill.
 *
 * A 64×32 canvas gradient with two sources — one hard and white, one wide and
 * cold — run through PMREM so roughness blur stays physically sane. The die is
 * a clearcoated solid with twenty flat faces, and the whole reason it reads as
 * cast resin rather than painted cardboard is that each face catches a
 * different part of this as it turns.
 *
 * A nicety in the sense that a failure here must not take the page down.
 */

export function buildEnvironment({ stage, THREE }) {
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#eef0fb');     // cold ceiling
    g.addColorStop(0.48, '#7f8496');
    g.addColorStop(0.55, '#302c36');  // horizon, into the table's dark
    g.addColorStop(1, '#100e13');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 32);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';   // the key, hard and small
    ctx.beginPath(); ctx.ellipse(17, 6, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,170,225,0.5)';    // a cold fill opposite it
    ctx.beginPath(); ctx.ellipse(47, 12, 8, 4, 0, 0, Math.PI * 2); ctx.fill();

    const tex = new THREE.Texture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(stage._renderer);
    stage._scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  } catch {
    /* environment is a nicety, not a requirement */
  }
}
