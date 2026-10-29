from pathlib import Path

p = Path("game/src/map/port/anime-flower-tree.js")
s = p.read_text(encoding="utf-8")

# --- 1. flower palette parameter -------------------------------------------
s = s.replace(
    "function createSingle5PetalFlowerGeometry() {",
    "function createSingle5PetalFlowerGeometry(flowerPalette) {",
)
s = s.replace(
    """  const cStamen = new THREE.Color(0xffe066);
  const cThroat = new THREE.Color(0x9b5de5);
  const cMid = new THREE.Color(0xc996ff);
  const cTip = new THREE.Color(0xe6ccff);""",
    """  const fp = flowerPalette || {};
  const cStamen = new THREE.Color(fp.stamen ?? 0xffe066);
  const cThroat = new THREE.Color(fp.throat ?? 0x9b5de5);
  const cMid = new THREE.Color(fp.mid ?? 0xc996ff);
  const cTip = new THREE.Color(fp.tip ?? 0xe6ccff);""",
)
s = s.replace(
    "const singleFlowerGeo = createSingle5PetalFlowerGeometry();",
    "const singleFlowerGeo = createSingle5PetalFlowerGeometry(options.flowerPalette);",
)

# --- 2. leaf palette uniforms ----------------------------------------------
s = s.replace(
    """    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
    },
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aClusterNormal;""",
    """    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uLeafShadow: { value: new THREE.Color(0x477d40) },
      uLeafMid: { value: new THREE.Color(0x73b04d) },
      uLeafSunlit: { value: new THREE.Color(0xabd65c) },
      uLeafTip: { value: new THREE.Color(0xc4e673) },
    },
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aClusterNormal;""",
)
s = s.replace(
    """      uniform vec3 uSunDir;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vColorVar;
      varying float vLocalY;
      void main() {
        vec3 blendedNormal = normalize(mix(vFaceNormal, vClusterNormal, 0.74));
        float ndl = dot(blendedNormal, uSunDir) * 0.5 + 0.5;
        // Height gradient uses the instance's local Y, so a scaled tree shades
        // the same as the authored one.
        float heightGrad = clamp((vLocalY - 2.2) / 6.0, 0.0, 1.0);

        vec3 deepShadowGreen = vec3(0.28, 0.49, 0.25);
        vec3 midLeafGreen = vec3(0.45, 0.69, 0.30);
        vec3 sunlitGreen = vec3(0.67, 0.84, 0.36);
        vec3 tipHighlight = vec3(0.77, 0.90, 0.45);

        float lightBand = smoothstep(0.28, 0.68, ndl + heightGrad * 0.15 + (vColorVar - 0.5) * 0.12);
        vec3 col = mix(deepShadowGreen, midLeafGreen, smoothstep(0.15, 0.48, ndl));
        col = mix(col, sunlitGreen, lightBand);

        float tipBright = smoothstep(0.5, 1.0, vUv.y) * 0.18;
        float centerVein = (1.0 - smoothstep(0.0, 0.08, abs(vUv.x - 0.5))) * 0.06;
        col = mix(col, tipHighlight, tipBright + centerVein);
        gl_FragColor = vec4(col, 1.0);
      }""",
    """      uniform vec3 uSunDir;
      uniform vec3 uLeafShadow;
      uniform vec3 uLeafMid;
      uniform vec3 uLeafSunlit;
      uniform vec3 uLeafTip;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vColorVar;
      varying float vLocalY;
      void main() {
        vec3 blendedNormal = normalize(mix(vFaceNormal, vClusterNormal, 0.74));
        float ndl = dot(blendedNormal, uSunDir) * 0.5 + 0.5;
        float heightGrad = clamp((vLocalY - 2.2) / 6.0, 0.0, 1.0);

        float lightBand = smoothstep(0.28, 0.68, ndl + heightGrad * 0.15 + (vColorVar - 0.5) * 0.12);
        vec3 col = mix(uLeafShadow, uLeafMid, smoothstep(0.15, 0.48, ndl));
        col = mix(col, uLeafSunlit, lightBand);

        float tipBright = smoothstep(0.5, 1.0, vUv.y) * 0.18;
        float centerVein = (1.0 - smoothstep(0.0, 0.08, abs(vUv.x - 0.5))) * 0.06;
        col = mix(col, uLeafTip, tipBright + centerVein);
        // Authored colours are display-referred; output linear so the single
        // ACES pass (renderer or composer) tone-maps them exactly once.
        gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);
      }""",
)

# --- 3. accept palettes in the factory + apply leaf uniforms ----------------
s = s.replace(
    """    natural = false, // true = keep the source page's authored scale
    leafScale = 1, // per-leaf size multiplier (LOD: fewer, bigger leaves)
    barkDetail = 1, // multiplier on branch ring/segment counts (LOD)
  } = options;""",
    """    natural = false, // true = keep the source page's authored scale
    leafScale = 1, // per-leaf size multiplier (LOD: fewer, bigger leaves)
    barkDetail = 1, // multiplier on branch ring/segment counts (LOD)
    flowerPalette = null, // { stamen, throat, mid, tip } hex colours
    leafPalette = null, // { shadow, mid, sunlit, tip } hex colours
  } = options;""",
)
s = s.replace(
    "  const singleFlowerGeo = createSingle5PetalFlowerGeometry(options.flowerPalette);",
    "  const singleFlowerGeo = createSingle5PetalFlowerGeometry(flowerPalette);",
)

# apply leaf palette right after the leaf material is created
s = s.replace(
    "  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);",
    """  if (leafPalette) {
    if (leafPalette.shadow) leafMat.uniforms.uLeafShadow.value.set(leafPalette.shadow);
    if (leafPalette.mid) leafMat.uniforms.uLeafMid.value.set(leafPalette.mid);
    if (leafPalette.sunlit) leafMat.uniforms.uLeafSunlit.value.set(leafPalette.sunlit);
    if (leafPalette.tip) leafMat.uniforms.uLeafTip.value.set(leafPalette.tip);
  }

  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);""",
)

# bark: output linear too
s = s.replace(
    "        gl_FragColor = vec4(col, 1.0);\n      }\n    `,\n  });\n  const trunkMesh",
    "        gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);\n      }\n    `,\n  });\n  const trunkMesh",
)

# flower fragment: output linear
s = s.replace(
    "        gl_FragColor = vec4(finalCol, 1.0);",
    "        gl_FragColor = vec4(pow(clamp(finalCol, 0.0, 1.0), vec3(2.2)), 1.0);",
)

p.write_text(s, encoding="utf-8")
print("tree: palette options + linear output")
