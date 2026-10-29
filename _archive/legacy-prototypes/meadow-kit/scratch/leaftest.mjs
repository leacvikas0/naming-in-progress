import { taperedPlane, transform } from "../src/core/geom.js";
for (const angle of [0.4, 2.09, 4.19]) {
  const g = taperedPlane({ length: 0.2, widthBase: 0.05, widthCurve: "leaf", segments: 5, crossSegments: 5, bend: -0.2, cup: 0.34 });
  g.applyMatrix4(transform({ position: [0, 0.1, 0], rotation: [1.05, angle, 0], order: "YXZ" }));
  g.computeBoundingBox();
  const bb = g.boundingBox;
  console.log("angle", angle.toFixed(2), " y:", bb.min.y.toFixed(3), "->", bb.max.y.toFixed(3), " x:", bb.min.x.toFixed(3), "->", bb.max.x.toFixed(3), " z:", bb.min.z.toFixed(3), "->", bb.max.z.toFixed(3));
}
