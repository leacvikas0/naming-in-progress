// Survey helpers for judging the Sunpetal Vale layout from the real game scene.
// Injected via Playwright evaluate. These move the existing camera only for a
// screenshot and restore it afterwards; nothing here is used by gameplay.
window.__survey = function survey(opts = {}) {
  const g = window.__game;
  const THREE = g.player ? null : null;
  const camera = g.renderer ? null : null;
  return g;
};

// Aerial overview: place the game camera high above a point and look down.
// Returns the previous camera transform so the caller can restore it.
window.__aerial = function aerial(x = 0, z = 0, height = 120, lookY = 0) {
  const g = window.__game;
  const scene = g.scene;
  // The gameplay camera is not exported; find it through the renderer's last
  // render call by walking scene children is unreliable, so main.js exposes it.
  const cam = g.camera;
  if (!cam) return { error: "camera not exposed" };
  const prev = {
    pos: cam.position.toArray(),
    quat: cam.quaternion.toArray(),
    fov: cam.fov,
  };
  cam.position.set(x, height, z + 0.001);
  cam.lookAt(x, lookY, z);
  cam.updateMatrixWorld(true);
  g.renderer.render(scene, cam);
  return prev;
};

window.__restoreCamera = function restoreCamera(prev) {
  const g = window.__game;
  const cam = g.camera;
  if (!cam || !prev) return false;
  cam.position.fromArray(prev.pos);
  cam.quaternion.fromArray(prev.quat);
  cam.fov = prev.fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return true;
};

// Free-fly inspection camera at an arbitrary eye point, looking at a target.
window.__lookFrom = function lookFrom(eye, target, fov = 55) {
  const g = window.__game;
  const cam = g.camera;
  if (!cam) return { error: "camera not exposed" };
  const prev = { pos: cam.position.toArray(), quat: cam.quaternion.toArray(), fov: cam.fov };
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.lookAt(target[0], target[1], target[2]);
  if (fov !== cam.fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld(true);
  g.renderer.render(g.scene, cam);
  return prev;
};

"survey helpers installed";
