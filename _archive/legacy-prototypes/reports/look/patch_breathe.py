from pathlib import Path

# ------------------------------------------------------------ index: petal counts
p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")
s = s.replace(
    "petalCounts = { near: 90, ground: 320, mid: 700, far: 1000, carpet: 600, bokeh: 800 },",
    "petalCounts = { near: 10, mid: 70, far: 180, carpet: 260 },",
)
p.write_text(s, encoding="utf-8")
print("index: petal counts reduced")

# ------------------------------------------------------------ palette: softer + lavender air
p = Path("game/src/map/palette.js")
s = p.read_text(encoding="utf-8")
s = s.replace("fog: 0xd6ecea,", "fog: 0xd9e2f2,")
s = s.replace("skyHorizon: 0xe9f7ee,", "skyHorizon: 0xeef2fb,")
s = s.replace("grassBase: 0xa2c66d,", "grassBase: 0xa9c97c,")
s = s.replace("grassWarm: 0xc1dc79,", "grassWarm: 0xc6df8c,")
s = s.replace("grassCool: 0x86b276,", "grassCool: 0x8fb98a,")
p.write_text(s, encoding="utf-8")
print("palette: softer greens, lavender-blue air")

# ------------------------------------------------------------ post: no warm filter, selective glow
p = Path("game/src/map/post.js")
s = p.read_text(encoding="utf-8")
s = s.replace("uSaturation: { value: 1.18 },", "uSaturation: { value: 1.1 },")
s = s.replace("uLift: { value: 0.02 },", "uLift: { value: 0.015 },")
s = s.replace(
    "uWarmHigh: { value: new THREE.Vector3(1.035, 1.012, 0.965) },",
    "uWarmHigh: { value: new THREE.Vector3(1.012, 1.006, 1.0) },",
)
s = s.replace(
    "uCoolShadow: { value: new THREE.Vector3(0.972, 0.992, 1.030) },",
    "uCoolShadow: { value: new THREE.Vector3(0.955, 0.975, 1.045) },",
)
s = s.replace("c = mix(c, vec3(1.0, 0.965, 0.90), haze * 0.022);", "c = mix(c, vec3(0.94, 0.95, 1.0), haze * 0.03);")
s = s.replace("bloomStrength = 0.55,", "bloomStrength = 0.42,")
s = s.replace("bloomRadius = 0.92,", "bloomRadius = 0.88,")
s = s.replace("bloomThreshold = 0.8,", "bloomThreshold = 0.86,")
p.write_text(s, encoding="utf-8")
print("post: neutral highlights, lavender haze, selective bloom")
