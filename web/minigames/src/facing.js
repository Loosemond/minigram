// Joints drawn facing the camera. A joint whose geo layout command 0x1D has
// flag 2 (docs/fragments.md) is drawn by the game at the camera's turn: its
// matrix (0x8003B858, 0x80037184 / 0x800367F4) is the camera's own (camera
// +0x64, transposed), scaled by its parent's scale along each axis, then the
// joint's own rotation and scale, at the place its parent puts it. So a flat
// picture on one is always seen square on, however its model turns: the gifts
// and fruit, the dizzy stars, the Electrode lamp's face, a Poke Ball's glint,
// bits of Hitmontop, Swinub, Pineco and the effects. The extractor marks such
// a joint's node (glTF extras {"facing": true}: tools/ps2tool/gltf.py), which
// three.js keeps in its userData.
//
// faceOnRender(scene) turns them for whatever camera draws the scene, as it's
// drawn (each view its own): after the scene's matrices are worked out and
// before its skinned meshes take their bones'. faceCamera(root, cam) does one
// model now, for a game that needs it before then (to read a joint's place).
import * as THREE from "three";

const qParent = new THREE.Quaternion(), qCam = new THREE.Quaternion();
const pos = new THREE.Vector3(), scale = new THREE.Vector3();
const own = new WeakMap(); // a joint -> { q: its own rotation (its clip's), set: what was last put on it }

// joint o at the camera's turn, after its own: its rotation in its parent's
// space is the parent's turn undone, the camera's, then its own. (A parent
// scaled the same each way, as the models are: the game's scale along the
// camera's axes isn't a turn three.js can hold otherwise.)
function face(o, cam) {
  let k = own.get(o);
  if (!k) own.set(o, (k = { q: o.quaternion.clone(), set: new THREE.Quaternion(NaN, NaN, NaN, NaN) }));
  else if (!o.quaternion.equals(k.set)) k.q.copy(o.quaternion); // (its clip's posed it since)
  o.parent.matrixWorld.decompose(pos, qParent, scale);
  o.quaternion.copy(qParent.invert()).multiply(cam).multiply(k.q);
  k.set.copy(o.quaternion);
  o.updateMatrixWorld(true); // (it and what hangs from it: a facing joint under it comes after)
}

// root's marked joints (if it's in the scene, or the parents' matrices are
// already worked out) turned to cam
export function faceCamera(root, cam) {
  cam.updateMatrixWorld();
  cam.getWorldQuaternion(qCam);
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => { if (o.userData.facing && o.parent) face(o, qCam); });
}

// every marked joint in scene, turned to each camera that draws it (chained
// to an onBeforeRender the scene had)
export function faceOnRender(scene) {
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (renderer, s, cam, ...rest) => {
    before.call(scene, renderer, s, cam, ...rest);
    cam.getWorldQuaternion(qCam);
    scene.traverseVisible((o) => { if (o.userData.facing && o.parent) face(o, qCam); });
  };
}
