export function buildEnvironment({ stage, THREE }) {
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#eef0fb');
    g.addColorStop(0.48, '#7f8496');
    g.addColorStop(0.55, '#302c36');
    g.addColorStop(1, '#100e13');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 32);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.ellipse(17, 6, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,170,225,0.5)';
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
  }
}
