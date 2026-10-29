from pathlib import Path

p = Path("game/src/map/petal-field.js")
s = p.read_text(encoding="utf-8")

# Bigger petals (the package's geometry is ~1 unit, scaled by type.scale ~0.42,
# so scale 1 = ~0.4 m). These read as leaves at gameplay distance.
s = s.replace('buildLayer({ id: "near", count: counts.near, mode: "near", size: [0.5, 1.0]', 'buildLayer({ id: "near", count: counts.near, mode: "near", size: [1.6, 2.6]')
s = s.replace('buildLayer({ id: "ground", count: counts.ground, mode: "ground", size: [0.35, 0.7]', 'buildLayer({ id: "ground", count: counts.ground, mode: "ground", size: [0.9, 1.5]')
s = s.replace('buildLayer({ id: "mid", count: counts.mid, mode: "fall", size: [0.35, 0.75]', 'buildLayer({ id: "mid", count: counts.mid, mode: "fall", size: [0.7, 1.2]')
s = s.replace('buildLayer({ id: "far", count: counts.far, mode: "fall", size: [0.2, 0.45]', 'buildLayer({ id: "far", count: counts.far, mode: "fall", size: [0.45, 0.85]')
s = s.replace('buildLayer({ id: "carpet", count: counts.carpet, mode: "carpet", size: [0.3, 0.6]', 'buildLayer({ id: "carpet", count: counts.carpet, mode: "carpet", size: [0.6, 1.0]')

# Denser field, focused on the playable meadow.
s = s.replace('counts = { near: 40, ground: 130, mid: 320, far: 420, carpet: 600, bokeh: 600 },', 'counts = { near: 60, ground: 200, mid: 450, far: 650, carpet: 500, bokeh: 600 },')
s = s.replace('    area = 44,', '    area = 30,')

p.write_text(s, encoding="utf-8")
print("petal sizes + density tuned")

p = Path("game/src/map/index.js")
s = p.read_text(encoding="utf-8")
s = s.replace("      area: 44,", "      area: 30,")
p.write_text(s, encoding="utf-8")
print("index area 30")
