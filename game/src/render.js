// Skyline Courier — renderer: sky, sun, ridges, a projected terrain mesh,
// runways, town, rings and the chase-view aircraft. Canvas 2D only.

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRgb(a, b, t) {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}
function css(rgb, alpha) {
  return alpha === undefined
    ? 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'
    : 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
}
function shade(rgb, f) {
  return [Math.max(0, Math.min(255, Math.round(rgb[0] * f))),
          Math.max(0, Math.min(255, Math.round(rgb[1] * f))),
          Math.max(0, Math.min(255, Math.round(rgb[2] * f)))];
}

function makeCamera(p) {
  const fwd = planeForward(p);
  const back = 26, up = 7.5;
  return {
    x: p.x - fwd.x * back,
    y: p.y + up,
    z: p.z - fwd.z * back,
    heading: p.heading,
    // Negative pitch looks down: the horizon sits in the upper third and
    // the valley fills the frame. Nose-up eases it back toward level.
    pitch: -0.12 + p.pitch * 0.35,
  };
}

// Project a world point into screen space. Null when behind the camera.
function project(cam, p, W, H, f) {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const sinH = Math.sin(cam.heading), cosH = Math.cos(cam.heading);
  const zc = dx * sinH + dz * cosH;
  const xc = dx * cosH - dz * sinH;
  const sinP = Math.sin(cam.pitch), cosP = Math.cos(cam.pitch);
  const y2 = dy * cosP - zc * sinP;
  const z2 = dy * sinP + zc * cosP;
  if (z2 < 1.5) return null;
  return { x: W / 2 + (xc / z2) * f, y: H / 2 - (y2 / z2) * f, d: z2, s: f / z2 };
}

function drawSky(ctx, cam, W, H, f, time) {
  const horizonY = H / 2 + Math.tan(cam.pitch) * f;
  const g = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 1));
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.55, PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, Math.max(horizonY, 0));
  ctx.fillStyle = '#b8c9b4';
  ctx.fillRect(0, Math.max(horizonY, 0), W, H - Math.max(horizonY, 0));

  // Sun, fixed in the west, so it swings across the sky as you turn.
  const sunDir = { x: Math.sin(4.4), z: Math.cos(4.4) };
  const sunP = project(cam, { x: cam.x + sunDir.x * 4000, y: cam.y + 1300, z: cam.z + sunDir.z * 4000 }, W, H, f);
  if (sunP) {
    const glow = ctx.createRadialGradient(sunP.x, sunP.y, 4, sunP.x, sunP.y, 90);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,240,180,0.55)');
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sunP.x, sunP.y, 90, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath(); ctx.arc(sunP.x, sunP.y, 22, 0, Math.PI * 2); ctx.fill();
  }

  // Two hazy ridge layers sitting on the horizon for depth.
  for (let layer = 0; layer < 2; layer++) {
    const base = horizonY + layer * 14;
    const amp = 26 - layer * 8;
    ctx.fillStyle = layer === 0 ? 'rgba(122,148,178,0.75)' : 'rgba(96,124,158,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, base);
    for (let x = 0; x <= W; x += 16) {
      const y = base - amp * Math.abs(Math.sin(x * 0.004 + layer * 2.1 + cam.heading * 2.4))
              - (layer === 1 ? 10 * Math.sin(x * 0.011 + 5) : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
  return horizonY;
}

function triangleColor(x, z, h) {
  const cls = groundClass(x, z);
  if (cls === 'water') {
    const deep = clamp01((CFG.waterLevel - h) / 6);
    return mixRgb(hexRgb(PALETTE.water), hexRgb(PALETTE.waterDeep), deep);
  }
  if (cls === 'sand') return hexRgb(PALETTE.sand);
  if (cls === 'runway') return hexRgb(PALETTE.runway);
  if (cls === 'town') return hexRgb(PALETTE.town);
  // Grass: greener in the valleys, paler on the high meadow.
  const t = clamp01((h - 2) / 42);
  let c = mixRgb(hexRgb(PALETTE.grassLow), hexRgb(PALETTE.grassHigh), t);
  if (h > 30) c = mixRgb(c, hexRgb(PALETTE.meadow), clamp01((h - 30) / 14));
  return c;
}

// Far field: horizontal bands of ground from the mesh edge out to the
// horizon, so the valley does not end in a flat backdrop colour.
function drawFarField(ctx, cam, plane, W, H, f) {
  const rows = [4200, 3200, 2400, 1800, 1400, 1050];
  const sinH = Math.sin(cam.heading), cosH = Math.cos(cam.heading);
  const fwd = { x: sinH, z: cosH };
  const right = { x: cosH, z: -sinH };
  const SEG = 64;
  const smoothH = (x, z) => farHeight(x, z);
  const bandPts = [];
  for (const d of rows) {
    const spread = (W / 2) * (d / f) * 1.05;
    const pts = [];
    for (let j = 0; j <= SEG; j++) {
      const lat = -spread + (2 * spread * j) / SEG;
      const x = cam.x + fwd.x * d + right.x * lat;
      const z = cam.z + fwd.z * d + right.z * lat;
      const y = groundHeight(x, z);
      const s = project(cam, { x, y, z }, W, H, f);
      pts.push({ s, x, z, y });
    }
    bandPts.push(pts);
  }
  for (let r = 0; r < rows.length - 1; r++) {
    const near = bandPts[r + 1], far = bandPts[r];
    for (let j = 0; j < SEG; j++) {
      const a = far[j], b = far[j + 1], c = near[j + 1], d2 = near[j];
      if (!a.s || !b.s || !c.s || !d2.s) continue;
      const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
      const my = smoothH(mx, mz);
      const haze = 0.38 + 0.42 * (1 - r / rows.length);
      const col = shade(farColor(mx, mz, my), 0.9);
      ctx.fillStyle = css(mixRgb(col, hexRgb(PALETTE.skyHorizon), 1 - haze));
      ctx.beginPath();
      ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(b.s.x, b.s.y);
      ctx.lineTo(c.s.x, c.s.y); ctx.lineTo(d2.s.x, d2.s.y);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawTerrain(ctx, cam, plane, W, H, f) {
  const cell = CFG.cell, half = CFG.meshHalf;
  const snapX = Math.round(plane.x / cell) * cell;
  const snapZ = Math.round(plane.z / cell) * cell;
  const n = half * 2 + 1;
  // Project the grid vertices once.
  const verts = new Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = snapX + (i - half) * cell;
      const z = snapZ + (j - half) * cell;
      const y = groundHeight(x, z);
      verts[j * n + i] = { x, y, z, s: project(cam, { x, y, z }, W, H, f) };
    }
  }
  const tris = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = verts[j * n + i], b = verts[j * n + i + 1];
      const c = verts[(j + 1) * n + i], d = verts[(j + 1) * n + i + 1];
      if (a.s && b.s && c.s) tris.push([a, b, c]);
      if (b.s && d.s && c.s) tris.push([b, d, c]);
    }
  }
  // Drop triangles too close to the camera: their projection explodes and
  // one huge triangle can paint the whole screen. Also cull off-screen.
  const kept = [];
  for (const t of tris) {
    if (t[0].s.d < 14 || t[1].s.d < 14 || t[2].s.d < 14) continue;
    const xs = [t[0].s.x, t[1].s.x, t[2].s.x];
    const ys = [t[0].s.y, t[1].s.y, t[2].s.y];
    if (Math.max(...xs) < -40 || Math.min(...xs) > W + 40) continue;
    if (Math.max(...ys) < -40 || Math.min(...ys) > H + 40) continue;
    kept.push(t);
  }
  const tris2 = kept;
  tris2.sort((t1, t2) => {
    const d1 = (t1[0].s.d + t1[1].s.d + t1[2].s.d) / 3;
    const d2 = (t2[0].s.d + t2[1].s.d + t2[2].s.d) / 3;
    return d2 - d1;
  });
  for (const t of tris2) {
    const cx = (t[0].x + t[1].x + t[2].x) / 3;
    const cz = (t[0].z + t[1].z + t[2].z) / 3;
    const cy = (t[0].y + t[1].y + t[2].y) / 3;
    // Slope shading from the height samples around the triangle centre.
    const slope = Math.abs(groundHeight(cx + 24, cz) - groundHeight(cx - 24, cz))
                + Math.abs(groundHeight(cx, cz + 24) - groundHeight(cx, cz - 24));
    const bright = 1 - Math.min(0.28, slope * 0.006);
    const col = shade(triangleColor(cx, cz, cy), bright);
    ctx.fillStyle = css(col);
    ctx.beginPath();
    ctx.moveTo(t[0].s.x, t[0].s.y);
    ctx.lineTo(t[1].s.x, t[1].s.y);
    ctx.lineTo(t[2].s.x, t[2].s.y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRunwayMarkings(ctx, cam, W, H, f) {
  for (const rw of RUNWAYS) {
    const a = (rw.angle * Math.PI) / 180;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const perp = { x: Math.cos(a), z: -Math.sin(a) };
    // Centreline dashes.
    for (let along = -rw.length / 2 + 40; along < rw.length / 2 - 20; along += 56) {
      const p1 = { x: rw.x + dir.x * along - perp.x * 1.6, y: rw.ground + 0.4, z: rw.z + dir.z * along - perp.z * 1.6 };
      const p2 = { x: rw.x + dir.x * along + perp.x * 1.6, y: rw.ground + 0.4, z: rw.z + dir.z * along + perp.z * 1.6 };
      const p3 = { x: rw.x + dir.x * (along + 26) + perp.x * 1.6, y: rw.ground + 0.4, z: rw.z + dir.z * (along + 26) + perp.z * 1.6 };
      const p4 = { x: rw.x + dir.x * (along + 26) - perp.x * 1.6, y: rw.ground + 0.4, z: rw.z + dir.z * (along + 26) - perp.z * 1.6 };
      const s1 = project(cam, p1, W, H, f), s2 = project(cam, p2, W, H, f);
      const s3 = project(cam, p3, W, H, f), s4 = project(cam, p4, W, H, f);
      if (!s1 || !s2 || !s3 || !s4) continue;
      ctx.fillStyle = PALETTE.runwayMark;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
      ctx.lineTo(s3.x, s3.y); ctx.lineTo(s4.x, s4.y);
      ctx.closePath(); ctx.fill();
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const along = end * (rw.length / 2 - 14);
      for (let k = -2; k <= 2; k++) {
        const off = k * (rw.width / 5);
        const q1 = { x: rw.x + dir.x * (along - 6) + perp.x * (off - 2.4), y: rw.ground + 0.4, z: rw.z + dir.z * (along - 6) + perp.z * (off - 2.4) };
        const q2 = { x: rw.x + dir.x * (along - 6) + perp.x * (off + 2.4), y: rw.ground + 0.4, z: rw.z + dir.z * (along - 6) + perp.z * (off + 2.4) };
        const q3 = { x: rw.x + dir.x * (along + 6) + perp.x * (off + 2.4), y: rw.ground + 0.4, z: rw.z + dir.z * (along + 6) + perp.z * (off + 2.4) };
        const q4 = { x: rw.x + dir.x * (along + 6) + perp.x * (off - 2.4), y: rw.ground + 0.4, z: rw.z + dir.z * (along + 6) + perp.z * (off - 2.4) };
        const t1 = project(cam, q1, W, H, f), t2 = project(cam, q2, W, H, f);
        const t3 = project(cam, q3, W, H, f), t4 = project(cam, q4, W, H, f);
        if (!t1 || !t2 || !t3 || !t4) continue;
        ctx.fillStyle = PALETTE.runwayMark;
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

function drawBuildings(ctx, cam, plane, W, H, f) {
  const items = [];
  for (const b of BUILDINGS) {
    const d = Math.hypot(b.x - plane.x, b.z - plane.z);
    if (d > 1300) continue;
    items.push({ d, b });
  }
  items.sort((a, b2) => b2.d - a.d);
  for (const { b } of items) {
    const gy = groundHeight(b.x, b.z);
    const hw = b.w / 2, hd = b.d / 2;
    const corners = [
      { x: b.x - hw, y: gy, z: b.z - hd }, { x: b.x + hw, y: gy, z: b.z - hd },
      { x: b.x + hw, y: gy, z: b.z + hd }, { x: b.x - hw, y: gy, z: b.z + hd },
      { x: b.x - hw, y: gy + b.h, z: b.z - hd }, { x: b.x + hw, y: gy + b.h, z: b.z - hd },
      { x: b.x + hw, y: gy + b.h, z: b.z + hd }, { x: b.x - hw, y: gy + b.h, z: b.z + hd },
    ];
    const s = corners.map((c) => project(cam, c, W, H, f));
    if (s.some((v) => v === null)) continue;
    const quad = (i0, i1, i2, i3, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(s[i0].x, s[i0].y); ctx.lineTo(s[i1].x, s[i1].y);
      ctx.lineTo(s[i2].x, s[i2].y); ctx.lineTo(s[i3].x, s[i3].y);
      ctx.closePath(); ctx.fill();
    };
    // Two walls facing the camera side, then the roof.
    const facingZ = cam.z > b.z;
    quad(facingZ ? 0 : 2, facingZ ? 1 : 3, facingZ ? 5 : 7, facingZ ? 4 : 6, '#d8cdb8');
    quad(1, 2, 6, 5, '#c4b89e');
    quad(4, 5, 6, 7, b.roof);
  }
}

function drawTrees(ctx, cam, plane, W, H, f, time) {
  for (const t of TREES) {
    const dx = t.x - plane.x, dz = t.z - plane.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 900 * 900) continue;
    const s = project(cam, { x: t.x, y: t.y, z: t.z }, W, H, f);
    if (!s) continue;
    const h = t.s * s.s;
    const w = h * 0.55;
    if (h < 2 || s.x < -20 || s.x > W + 20 || s.y > H + 20) continue;
    ctx.fillStyle = PALETTE.treeDark;
    ctx.fillRect(s.x - 1, s.y - h * 0.25, 2, h * 0.25);
    ctx.fillStyle = PALETTE.tree;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - h);
    ctx.lineTo(s.x - w / 2, s.y - h * 0.15);
    ctx.lineTo(s.x + w / 2, s.y - h * 0.15);
    ctx.closePath(); ctx.fill();
  }
}

function drawRings(ctx, cam, mission, W, H, f, time) {
  const rings = mission.rings;
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const isNext = mission.def.id === 'ring-run' && i === mission.ringIndex;
    const face = mission.def.id === 'ring-run' ? ringFacing(mission, i) : { x: 0, z: 1 };
    const right = { x: -face.z, z: face.x };
    const pts = [];
    let ok = true;
    for (let k = 0; k <= 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const p = {
        x: r.x + right.x * Math.cos(a) * r.r,
        y: r.y + Math.sin(a) * r.r,
        z: r.z + right.z * Math.cos(a) * r.r,
      };
      const s = project(cam, p, W, H, f);
      if (!s) { ok = false; break; }
      pts.push(s);
    }
    if (!ok || pts.length < 3) continue;
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 4) : 0.45;
    const base = r.passed ? [120, 200, 120] : hexRgb(PALETTE.ring);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css(base, pulse * 0.35);
    ctx.lineWidth = Math.max(3, r.r * pts[0].s * 0.16);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = css(base, pulse);
    ctx.lineWidth = Math.max(1.5, r.r * pts[0].s * 0.05);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath(); ctx.stroke();
    if (isNext) {
      const c = project(cam, r, W, H, f);
      if (c && c.x > 0 && c.x < W && c.y > 40 && c.y < H) {
        ctx.fillStyle = 'rgba(20,26,34,0.75)';
        ctx.font = 'bold 15px sans-serif';
        const label = 'RING ' + (i + 1);
        const tw = ctx.measureText(label).width;
        const ly = Math.max(74, c.y - r.r * c.s - 34);
        ctx.fillRect(c.x - tw / 2 - 8, ly - 17, tw + 16, 24);
        ctx.fillStyle = PALETTE.ringGlow;
        ctx.textAlign = 'center';
        ctx.fillText(label, c.x, ly);
        ctx.textAlign = 'left';
      }
    }
  }
}

function drawDropZone(ctx, cam, mission, W, H, f, time) {
  if (mission.def.id !== 'parcel-drop' || mission.dropped) return;
  const dz = mission.def.dropZone;
  const gy = groundHeight(dz.x, dz.z);
  const pulse = 0.6 + 0.4 * Math.sin(time * 3);
  const pts = [];
  for (let k = 0; k <= 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const s = project(cam, { x: dz.x + Math.cos(a) * dz.r, y: gy + 1, z: dz.z + Math.sin(a) * dz.r }, W, H, f);
    if (!s) return;
    pts.push(s);
  }
  ctx.strokeStyle = 'rgba(255,181,46,' + pulse + ')';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.closePath(); ctx.stroke();
  const top = project(cam, { x: dz.x, y: gy + 130, z: dz.z }, W, H, f);
  const bot = project(cam, { x: dz.x, y: gy + 1, z: dz.z }, W, H, f);
  if (top && bot) {
    ctx.strokeStyle = 'rgba(255,181,46,' + (pulse * 0.5) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,233,168,' + pulse + ')';
    ctx.beginPath(); ctx.arc(top.x, top.y, 8, 0, Math.PI * 2); ctx.fill();
  }
}

function drawClouds(ctx, cam, W, H, f) {
  for (const c of CLOUDS) {
    const s = project(cam, c, W, H, f);
    if (!s || s.d < 60) continue;
    const r = c.r * s.s;
    if (r < 4 || s.x < -r || s.x > W + r || s.y < -r || s.y > H + r) continue;
    ctx.fillStyle = 'rgba(255,255,255,' + c.a + ')';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(s.x - r * 0.55, s.y + r * 0.1, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(s.x + r * 0.55, s.y + r * 0.08, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The courier plane herself, seen from the chase camera: cream fuselage,
// courier-orange stripe, wide wings, blinking nav lights.
function drawAircraft(ctx, plane, W, H, time) {
  const cx = W / 2, cy = H * 0.60 + Math.sin(time * 1.8) * 2;
  const scale = 1.0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll * 0.9);
  ctx.scale(scale, scale);
  const blink = (Math.floor(time * 1.4) % 2) === 0;
  // Main wings.
  ctx.fillStyle = '#e9e2d2';
  ctx.beginPath();
  ctx.moveTo(-118, 10); ctx.lineTo(-14, -2); ctx.lineTo(14, -2); ctx.lineTo(118, 10);
  ctx.lineTo(112, 22); ctx.lineTo(0, 14); ctx.lineTo(-112, 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d98a2b';
  ctx.fillRect(-118, 12, 236, 5);
  // Fuselage, seen from behind: tail cone at the top, wide at the wings.
  const body = ctx.createLinearGradient(-14, -52, 14, 34);
  body.addColorStop(0, '#f4ead6');
  body.addColorStop(1, '#cbb98f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-9, -52);
  ctx.quadraticCurveTo(-16, -20, -15, 8);
  ctx.quadraticCurveTo(-14, 30, -8, 34);
  ctx.lineTo(8, 34);
  ctx.quadraticCurveTo(14, 30, 15, 8);
  ctx.quadraticCurveTo(16, -20, 9, -52);
  ctx.closePath(); ctx.fill();
  // Courier stripe down the fuselage.
  ctx.fillStyle = '#d9622b';
  ctx.beginPath();
  ctx.moveTo(-5, -50); ctx.lineTo(5, -50); ctx.lineTo(6, 32); ctx.lineTo(-6, 32);
  ctx.closePath(); ctx.fill();
  // Vertical fin and tailplane.
  ctx.fillStyle = '#d9622b';
  ctx.beginPath();
  ctx.moveTo(-3, -50); ctx.lineTo(0, -78); ctx.lineTo(4, -50);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e9e2d2';
  ctx.beginPath();
  ctx.moveTo(-52, -40); ctx.lineTo(52, -40); ctx.lineTo(46, -30); ctx.lineTo(-46, -30);
  ctx.closePath(); ctx.fill();
  // Tail light strobe and wingtip nav lights.
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -78, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ff4040';
  ctx.beginPath(); ctx.arc(-118, 15, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#37d67a';
  ctx.beginPath(); ctx.arc(118, 15, 4, 0, Math.PI * 2); ctx.fill();
  // Gear legs when down.
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 30); ctx.lineTo(-12, 44); ctx.moveTo(10, 30); ctx.lineTo(12, 44);
    ctx.stroke();
    ctx.fillStyle = '#22262b';
    ctx.beginPath(); ctx.arc(-12, 46, 4, 0, Math.PI * 2); ctx.arc(12, 46, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawGroundShadow(ctx, cam, plane, W, H, f) {
  const ground = groundHeight(plane.x, plane.z);
  const agl = plane.y - ground;
  if (agl > 400 || agl < 0.5) return;
  const s = project(cam, { x: plane.x, y: ground + 0.5, z: plane.z }, W, H, f);
  if (!s) return;
  const r = Math.max(4, 26 * s.s * (1 - agl / 420));
  ctx.fillStyle = 'rgba(10,16,24,' + (0.30 * (1 - agl / 420)) + ')';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawScene(ctx, plane, mission, time, W, H) {
  const f = CFG.focal;
  const cam = makeCamera(plane);
  drawSky(ctx, cam, W, H, f, time);
  drawClouds(ctx, cam, W, H, f);
  drawFarField(ctx, cam, plane, W, H, f);
  drawTerrain(ctx, cam, plane, W, H, f);
  drawRunwayMarkings(ctx, cam, W, H, f);
  drawBuildings(ctx, cam, plane, W, H, f);
  drawTrees(ctx, cam, plane, W, H, f, time);
  drawRings(ctx, cam, mission, W, H, f, time);
  drawDropZone(ctx, cam, mission, W, H, f, time);
  drawGroundShadow(ctx, cam, plane, W, H, f);
  if (!plane.crashed) drawAircraft(ctx, plane, W, H, time);
}
