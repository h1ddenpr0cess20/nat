/**
 * The die: an icosahedron, its twenty numbers, and the ink along its edges.
 *
 * Three parts, and the second is the one that took the thought:
 *
 *   body    a flat-shaded icosahedron in clearcoated resin. Flat shading is
 *           the point — one normal per face is what makes twenty distinct
 *           planes instead of a knobbly ball
 *   glyphs  a numbered quad floating a thousandth of a unit off each face,
 *           rather than a texture atlas. Twenty small canvases cost nothing
 *           and stay crisp at any zoom, and each one can be lit on its own
 *   ink     the edges again as line segments, slightly proud, so the
 *           silhouette reads even when a face is edge-on to the light
 *
 * Opposite faces sum to twenty-one, the way they do on a real die. That is not
 * decoration: it means the 1 is always on the underside of the 20, so a throw
 * that lands well reads as a throw that landed well.
 */

/** Faces are found by walking the geometry, so this stays true if it changes. */
export const UP = { x: 0, y: 1, z: 0 };

export function createDie(THREE) {
  const group = new THREE.Group();
  group.name = 'nat_character';

  /* The body carries the tumble; the outer group carries tilt and position, so
     a lean doesn't get wound into whatever face is currently up. */
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

  /* ---- faces ------------------------------------------------------------- */

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

  /* Number them the way a real die is numbered: each face and the one facing
     the other way sum to 21. Found by dot product rather than a hardcoded
     table, so it survives a change of primitive. */
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

  /** One number, drawn once, as a texture. The 20 gets its own colour. */
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
    // 6 and 9 get an underline, same as a real die.
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
      toneMapped: false,   // the numbers are ink, not a lit surface
    });
    mat.name = 'glyph_' + numbers[i];
    const q = new THREE.Mesh(glyphGeo, mat);
    q.name = 'face_' + numbers[i];
    q.position.copy(f.centroid).multiplyScalar(1.006);

    /* Orient every glyph against one global reference. An equilateral face has
       no non-arbitrary "apex", so choosing one of its vertices to point at is
       three-fold ambiguous and the numbers end up at random rotations. */
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
