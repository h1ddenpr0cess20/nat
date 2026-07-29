export const UP = { x: 0, y: 1, z: 0 };

export function createDie(THREE) {
  const group = new THREE.Group();
  group.name = 'nat_character';

  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);

  const dieGeo = new THREE.IcosahedronGeometry(1, 0);
  dieGeo.computeVertexNormals();

  const dieMat = new THREE.MeshPhysicalMaterial({
    name: 'resin',
    color: new THREE.Color('#3a3350'),
    roughness: 0.28,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
    flatShading: true,
  });
  const die = new THREE.Mesh(dieGeo, dieMat);
  die.name = 'die';
  body.add(die);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.004, 0), 1),
    new THREE.LineBasicMaterial({
      color: new THREE.Color('#8d80b8'), transparent: true, opacity: 0.55,
    }));
  edges.name = 'edge_ink';
  body.add(edges);

  const faces = [];
  {
    const p = dieGeo.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
      faces.push({ centroid, normal: centroid.clone().normalize() });
    }
  }

  const numbers = new Array(faces.length).fill(0);
  {
    let next = 1;
    for (let i = 0; i < faces.length; i++) {
      if (numbers[i]) continue;
      let opp = -1, best = 1;
      for (let j = 0; j < faces.length; j++) {
        const d = faces[i].normal.dot(faces[j].normal);
        if (d < best) { best = d; opp = j; }
      }
      numbers[i] = next;
      numbers[opp] = 21 - next;
      next++;
    }
  }

  const glyphTex = (n) => {
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, s, s);
    g.fillStyle = n === 20 ? '#ffd479' : '#e7e0f7';
    g.font = `600 ${n === 20 ? 120 : 132}px ui-monospace, "SF Mono", Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), s / 2, s / 2 + 6);
    if (n === 6 || n === 9) g.fillRect(s / 2 - 44, s / 2 + 76, 88, 11);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  const glyphGeo = new THREE.PlaneGeometry(0.62, 0.62);
  const upY = new THREE.Vector3(UP.x, UP.y, UP.z);
  faces.forEach((f, i) => {
    const mat = new THREE.MeshBasicMaterial({
      map: glyphTex(numbers[i]),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.name = 'glyph_' + numbers[i];
    const q = new THREE.Mesh(glyphGeo, mat);
    q.name = 'face_' + numbers[i];
    q.position.copy(f.centroid).multiplyScalar(1.006);

    const ref = Math.abs(f.normal.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : upY;
    const upDir = ref.clone().projectOnPlane(f.normal).normalize();
    const right = new THREE.Vector3().crossVectors(upDir, f.normal).normalize();
    q.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upDir, f.normal));

    body.add(q);
    f.mesh = q;
    f.number = numbers[i];
  });

  return { group, body, die, dieMat, edges, faces, numbers };
}
