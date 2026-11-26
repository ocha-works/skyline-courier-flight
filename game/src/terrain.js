// Skyline Courier — terrain: the valley's heightfield, river, runways,
// town, trees and clouds. Everything is procedural and deterministic.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The river winds north through the valley; its centreline x at height z.
function riverX(z) {
  return 380 + 260 * Math.sin(z * 0.0009) + 90 * Math.sin(z * 0.0027 + 1.3);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Distance from (x, z) to a runway's centreline segment, and the
// along-strip coordinate (0 at the strip centre, +-length/2 at the ends).
function runwayFrame(rw, x, z) {
  const a = (rw.angle * Math.PI) / 180;
  const dx = x - rw.x, dz = z - rw.z;
  const along = dx * Math.sin(a) + dz * Math.cos(a);
  const across = dx * Math.cos(a) - dz * Math.sin(a);
  return { along, across };
}

function groundHeight(x, z) {
  // The valley floor sits well above sea level; only the river channel
  // dips below the waterline.
  let h = 18
        + 15 * Math.sin(x * 0.0035 + 1.2) * Math.cos(z * 0.0028)
        + 9 * Math.sin(x * 0.009 + 4.0) * Math.sin(z * 0.007 + 2.0)
        + 6 * Math.sin((x + z) * 0.0021)
        + 4 * Math.sin(x * 0.021) * Math.sin(z * 0.017 + 0.8);
  // River valley carved along the river centreline.
  const dRiver = Math.abs(x - riverX(z));
  h -= 21 * Math.exp(-(dRiver * dRiver) / (2 * 95 * 95));
  // Flatten the ground under each runway strip, with a funnel that widens
  // past both ends so the approach path is clear of hills too.
  for (const rw of RUNWAYS) {
    const f = runwayFrame(rw, x, z);
    const beyond = Math.max(0, Math.abs(f.along) - rw.length / 2);
    const halfWidth = rw.width / 2 + 90 + beyond * 0.5;
    const inside = smoothstep(halfWidth, rw.width / 2 + 10, Math.abs(f.across))
                 * smoothstep(rw.length / 2 + 300, rw.length / 2 + 10, Math.abs(f.along));
    h = lerp(h, rw.ground, inside);
  }
  // Flatten the market town so its streets sit level.
  const dTown = Math.hypot(x - 330, z - 430);
  h = lerp(h, 18, smoothstep(260, 120, dTown));
  return h;
}

// The town: a market square and a grid of little houses with coloured roofs.
const TOWN = { x: 330, z: 430 };
const BUILDINGS = (function () {
  const rnd = mulberry32(20261126);
  const list = [];
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      if (gx === 0 && gz === 0) continue; // the market square stays open
      if (rnd() < 0.22) continue;
      const bx = TOWN.x + gx * 42 + (rnd() - 0.5) * 10;
      const bz = TOWN.z + gz * 42 + (rnd() - 0.5) * 10;
      list.push({
        x: bx, z: bz,
        w: 18 + rnd() * 10, d: 16 + rnd() * 10,
        h: 10 + rnd() * 14,
        roof: [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC][Math.floor(rnd() * 3)],
      });
    }
  }
  return list;
})();

// Scattered pines, kept off the runways, the town and the river.
const TREES = (function () {
  const rnd = mulberry32(777);
  const list = [];
  for (let i = 0; i < 900; i++) {
    const x = (rnd() - 0.5) * 5200 - 400;
    const z = (rnd() - 0.5) * 5200 + 1300;
    const h = groundHeight(x, z);
    if (h < 3) continue; // not in the river
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < 190) continue;
    let onStrip = false;
    for (const rw of RUNWAYS) {
      const f = runwayFrame(rw, x, z);
      if (Math.abs(f.across) < rw.width / 2 + 30 && Math.abs(f.along) < rw.length / 2 + 30) onStrip = true;
    }
    if (onStrip) continue;
    list.push({ x, z, y: h, s: 9 + rnd() * 9 });
  }
  return list;
})();

// A few slow clouds drifting high above the valley.
const CLOUDS = (function () {
  const rnd = mulberry32(4242);
  const list = [];
  for (let i = 0; i < 14; i++) {
    list.push({
      x: (rnd() - 0.5) * 4200, z: (rnd() - 0.5) * 4200 + 1300,
      y: 420 + rnd() * 160, r: 90 + rnd() * 130, a: 0.55 + rnd() * 0.3,
    });
  }
  return list;
})();

// The far field colours itself from a smooth height (the big hills and the
// river only): the fine bumps would flip its broad bands between classes.
function farHeight(x, z) {
  let h = 18
        + 15 * Math.sin(x * 0.0035 + 1.2) * Math.cos(z * 0.0028)
        + 9 * Math.sin(x * 0.009 + 4.0) * Math.sin(z * 0.007 + 2.0)
        + 6 * Math.sin((x + z) * 0.0021);
  const dRiver = Math.abs(x - riverX(z));
  h -= 21 * Math.exp(-(dRiver * dRiver) / (2 * 95 * 95));
  const dTown = Math.hypot(x - TOWN.x, z - TOWN.z);
  h = lerp(h, 18, smoothstep(260, 120, dTown));
  return h;
}

function farColor(x, z, h) {
  const dRiver = Math.abs(x - riverX(z));
  if (dRiver < 70) {
    const deep = clamp01((70 - dRiver) / 70);
    return mixRgb(hexRgb(PALETTE.water), hexRgb(PALETTE.waterDeep), deep * 0.6);
  }
  if (dRiver < 150) return hexRgb(PALETTE.sand);
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < 170) return hexRgb(PALETTE.town);
  // Far grass stays almost one tone: a strong tint range would stripe the
  // bands into a quilt. Height only nudges it.
  const t = clamp01((h - 2) / 42);
  const c = mixRgb(hexRgb(PALETTE.grassLow), hexRgb(PALETTE.grassHigh), t * 0.35);
  return c;
}

// Terrain class at a point: what colour the ground is there. Water and sand
// follow the river channel itself, never a random low hollow: the valley's
// big hills dip low in places, and those hollows stay grass.
function groundClass(x, z) {
  const h = groundHeight(x, z);
  const dRiver = Math.abs(x - riverX(z));
  if (dRiver < 70) return 'water';
  if (dRiver < 150) return 'sand';
  let onStrip = false;
  for (const rw of RUNWAYS) {
    const f = runwayFrame(rw, x, z);
    if (Math.abs(f.across) <= rw.width / 2 && Math.abs(f.along) <= rw.length / 2) onStrip = true;
  }
  if (onStrip) return 'runway';
  if (Math.hypot(x - TOWN.x, z - TOWN.z) < 170) return 'town';
  return 'grass';
}
