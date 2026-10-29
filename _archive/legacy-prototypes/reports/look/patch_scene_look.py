from pathlib import Path

# ---------------------------------------------------------------- camera + fog
p = Path("game/handoff/map-bg/preview.html")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "  gameplay: { pos: [0, 7.6, 10.6], target: [0, 1.1, -0.5] },",
    "  gameplay: { pos: [0, 2.35, 9.0], target: [0, 3.4, -30.0], fov: 52 },",
)
s = s.replace(
    "  eye:      { pos: [3.2, 1.75, 8.6], target: [0.5, 1.2, -2] },",
    "  eye:      { pos: [3.2, 1.75, 8.6], target: [0.5, 2.2, -20] },",
)
s = s.replace(
    "function applyView(name) {\n  const v = VIEWS[name] || VIEWS.gameplay;\n  camera.position.set(...v.pos);\n  controls.target.set(...v.target);\n  controls.update();\n}",
    "function applyView(name) {\n  const v = VIEWS[name] || VIEWS.gameplay;\n  camera.position.set(...v.pos);\n  controls.target.set(...v.target);\n  if (v.fov) { camera.fov = v.fov; camera.updateProjectionMatrix(); }\n  controls.update();\n}",
)
p.write_text(s, encoding="utf-8")
print("camera: eye level gameplay view")

# ---------------------------------------------------------------- fog depth
p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "  const fogNear = MEADOW_LIGHT.fogNear;\n  const fogFar = MEADOW_LIGHT.fogFar;\n  scene.fog = new THREE.Fog(palette.fog, fogNear, fogFar);",
    "  // Aerial perspective: the meadow is only 96 m across, so the palette's\n"
    "  // 95/360 fog never reaches it. Pull it in so distance actually desaturates.\n"
    "  const fogNear = 28;\n  const fogFar = 165;\n  scene.fog = new THREE.Fog(palette.fog, fogNear, fogFar);",
)
p.write_text(s, encoding="utf-8")
print("fog: real depth")

# ---------------------------------------------------------------- contact shadows
p = Path("game/src/map/kit.js")
s = p.read_text(encoding="utf-8")
if "treeContactShadows" not in s:
    s = s.replace(
        "  const treeAnchors = treeObjects.map((t) => ({\n    x: t.group.position.x,\n    z: t.group.position.z,\n  }));",
        """  const treeAnchors = treeObjects.map((t) => ({
    x: t.group.position.x,
    z: t.group.position.z,
  }));

  // Contact shadows: a soft dark disc under each tree. The tree materials are
  // custom shaders with no shadow support, so without this the trunks float.
  if (treeAnchors.length) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const cx = c.getContext("2d");
    const g = cx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(24,38,26,0.5)");
    g.addColorStop(0.55, "rgba(24,38,26,0.22)");
    g.addColorStop(1, "rgba(24,38,26,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CircleGeometry(1, 20);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const shadows = new THREE.InstancedMesh(geo, mat, treeAnchors.length);
    shadows.name = "treeContactShadows";
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (let i = 0; i < treeAnchors.length; i++) {
      const a = treeAnchors[i];
      const r = 4.2 + random() * 1.6;
      pos.set(a.x, GROUND_Y + 0.03, a.z);
      scl.set(r, r, 1);
      m.compose(pos, q, scl);
      shadows.setMatrixAt(i, m);
    }
    shadows.instanceMatrix.needsUpdate = true;
    shadows.frustumCulled = false;
    group.add(shadows);
    stats.drawCalls += 1;
  }""",
    )
p.write_text(s, encoding="utf-8")
print("kit: contact shadows under trees")

# ---------------------------------------------------------------- post: less milk
p = Path("game/src/map/post.js")
s = p.read_text(encoding="utf-8")
s = s.replace("c = mix(c, vec3(1.0, 0.965, 0.90), haze * 0.045);", "c = mix(c, vec3(1.0, 0.965, 0.90), haze * 0.022);")
s = s.replace("uContrast: { value: 0.99 },", "uContrast: { value: 1.06 },")
s = s.replace("bloomThreshold = 0.72,", "bloomThreshold = 0.8,")
p.write_text(s, encoding="utf-8")
print("post: less haze, more contrast")
