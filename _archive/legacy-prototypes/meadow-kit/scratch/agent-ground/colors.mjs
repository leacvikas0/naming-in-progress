import * as THREE from "three";
import { resolveConfig } from "../../src/core/config.js";
import { createTerrain } from "../../src/ground/terrain.js";
import { createPath } from "../../src/ground/path.js";
const config = resolveConfig({});
const materials = { get: () => new THREE.MeshLambertMaterial({ vertexColors: true }) };
const terrain = createTerrain(config, materials);
const paths = createPath(config, terrain.heightAt, materials);
const s = (c) => "#" + new THREE.Color().setRGB(c.r, c.g, c.b).getHexString(); // linear -> sRGB hex
const mean = (mesh) => {
  const a = mesh.geometry.attributes.color; let r=0,g=0,b=0;
  for (let i=0;i<a.count;i++){r+=a.getX(i);g+=a.getY(i);b+=a.getZ(i);}
  return new THREE.Color(r/a.count, g/a.count, b/a.count);
};
const P = config.palette.ground;
console.log("palette  pathMid", P.pathMid, " pathLit", P.pathLit, " pathDeep", P.pathDeep, " grassMid", P.grassMid);
for (const m of paths.meshes) { const c = mean(m); console.log(m.name.padEnd(20), "mean linear", [c.r,c.g,c.b].map(v=>v.toFixed(3)).join(","), " sRGB", s(c)); }
const tc = mean(terrain.mesh); console.log("terrain".padEnd(20), "mean linear", [tc.r,tc.g,tc.b].map(v=>v.toFixed(3)).join(","), " sRGB", s(tc));
// percentiles of path luminance
const a = paths.meshes[0].geometry.attributes.color; const lum=[];
for (let i=0;i<a.count;i++) lum.push(0.2126*a.getX(i)+0.7152*a.getY(i)+0.0722*a.getZ(i));
lum.sort((x,y)=>x-y);
console.log("path luminance p05/p50/p95:", [0.05,0.5,0.95].map(p=>lum[Math.floor(p*(lum.length-1))].toFixed(3)).join(" / "));
