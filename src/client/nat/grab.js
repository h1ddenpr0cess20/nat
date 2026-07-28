/**
 * The die, in your hand.
 *
 * OrbitControls does not move the object — it swings the camera around a point
 * that never moves, so however far you drag, the thing on screen is going round
 * one spot and the die itself never turns. This picks the die up instead.
 *
 * A press that lands on the die takes it off the camera: it follows the pointer
 * on a plane square to the view, so it goes wherever the cursor goes — sideways,
 * up, off into a corner — rather than sliding along a table that runs away to
 * the horizon. A press anywhere else on the canvas still orbits, unchanged.
 *
 * Two details that are not obvious:
 *
 *   The listener is on the host element in the capture phase, not on the
 *   canvas. OrbitControls registered its own `pointerdown` on the canvas first,
 *   and at the target both listeners fire in registration order regardless of
 *   phase — so a handler on the canvas, capturing or not, would run second and
 *   the camera would already be rotating. An ancestor in the capture phase is
 *   ahead of it, which is what makes `stopPropagation()` here actually work.
 *
 *   `contain()` is exported because the die can be thrown as well as placed,
 *   and neither is allowed to put it somewhere you cannot reach. It clamps in
 *   the camera's own plane, scaled to how big the die looks from that far away,
 *   so the limit is the edge of the frame rather than a fixed radius. The inset
 *   is well under the die's own radius on purpose: it can be shoved most of the
 *   way off the edge, because a drag that stops dead against an invisible wall
 *   is the thing this was written to get rid of. What it can't do is leave.
 *
 * Nothing here knows what a roll is. It reads the pointer and reports where the
 * die should be; index.js decides what that does to it.
 */
export function createGrab({ stage, THREE, mesh, at, onGrab, onDrag, onDrop, inset = 0.6 }) {
  const canvas = stage._renderer.domElement;
  const camera = stage._camera;

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const local = new THREE.Vector3();
  const before = new THREE.Vector3();

  let id = null;
  let last = 0;

  const aim = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };

  /** Clamp a point into the frustum. True if it had to move. */
  const contain = (p) => {
    before.copy(p);
    local.copy(p).applyMatrix4(camera.matrixWorldInverse);
    const half = Math.tan((camera.fov * Math.PI) / 360) * Math.max(0.001, -local.z);
    const lx = Math.max(0, half * camera.aspect - inset);
    const ly = Math.max(0, half - inset);
    local.x = Math.max(-lx, Math.min(lx, local.x));
    local.y = Math.max(-ly, Math.min(ly, local.y));
    p.copy(local).applyMatrix4(camera.matrixWorld);
    return p.distanceToSquared(before) > 1e-6;   // slack for the round trip
  };

  stage.addEventListener('pointerdown', (e) => {
    if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    aim(e);
    if (ray.intersectObject(mesh, false).length === 0) return;   // missed it: orbit

    id = e.pointerId;
    stage._controls.enabled = false;    // the camera lets go while you hold it
    e.stopPropagation();                // ahead of OrbitControls, so it never starts

    /* Capture keeps the drag alive off the edge of the canvas, but it is not
       load-bearing: a pointer the element can't capture would otherwise throw
       here and leave the die stuck in a hand that isn't there. The move and
       release listeners are on the window for the same reason. */
    try { stage.setPointerCapture(id); } catch { /* it drags without it */ }

    /* A plane through the die, square to the camera. The pointer maps onto it
       one for one, which is what makes the die land under the cursor and not
       somewhere along a ground plane behind it. */
    camera.getWorldDirection(forward);
    plane.setFromNormalAndCoplanarPoint(forward, at());
    offset.set(0, 0, 0);
    if (ray.ray.intersectPlane(plane, hit)) offset.copy(at()).sub(hit);

    last = e.timeStamp;
    onGrab?.();
  }, { capture: true });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    aim(e);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    hit.add(offset);
    contain(hit);
    const dt = Math.min(0.1, Math.max(0.008, (e.timeStamp - last) / 1000));
    last = e.timeStamp;
    onDrag?.(hit, dt);
  }, { capture: true });

  const drop = (e) => {
    if (e.pointerId !== id) return;
    if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
    id = null;
    stage._controls.enabled = true;
    onDrop?.();
  };
  window.addEventListener('pointerup', drop, { capture: true });
  window.addEventListener('pointercancel', drop, { capture: true });

  return {
    get held() {
      return id !== null;
    },
    contain,
  };
}
