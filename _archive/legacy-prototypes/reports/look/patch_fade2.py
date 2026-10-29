from pathlib import Path

p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

old = '''    shader.fragmentShader =
      "varying float vFade;\\nvarying vec2 vPetalUv;\\n" +
      "float petalHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\\n" +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        // Dissolve: below 1.0 the card erodes in patches, from the tips inward.
        float dissolve = petalHash(floor(vPetalUv * 16.0));
        if (vFade < 0.999 && dissolve > vFade) discard;
        gl_FragColor.a *= smoothstep(0.0, 0.18, vFade);`
      );'''

new = '''    shader.fragmentShader =
      "varying float vFade;\\nvarying vec2 vPetalUv;\\n" +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        // Smooth front-to-back fade, not holes. A soft edge travels along the
        // petal's length: the tip goes first, then the body recedes toward the
        // stem as the petal fades. No discard, no speckle — pure alpha, so it
        // reads as the petal thinning away rather than breaking up.
        float cut = mix(-0.45, 1.45, vFade);
        float wipe = 1.0 - smoothstep(cut - 0.30, cut, vPetalUv.y);
        gl_FragColor.a *= wipe * smoothstep(0.0, 0.08, vFade);`
      );'''

if old not in s:
    raise SystemExit("patch anchor not found")

s = s.replace(old, new, 1)
p.write_text(s, encoding="utf-8")
print("petal fade: smooth front-to-back wipe")
