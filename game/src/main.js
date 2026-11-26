// Skyline Courier — main: game loop, states, shot mode (autopilot presets
// for screenshots) and the debug handle the play-test reads.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = CFG.canvasW, H = CFG.canvasH;

const input = makeInput(canvas);
const audio = makeAudio();

let plane = makePlane();
let mission = makeMission(MISSIONS[0]);
let state = 'menu'; // menu | flying | paused | over
let time = 0;
let overTimer = 0;
let autopilot = false;
let shotMode = false; // screenshot presets: no opening blurb on the HUD

function startMission(index) {
  plane = makePlane();
  mission = makeMission(MISSIONS[index]);
  state = 'flying';
  autopilot = false;
  audio.start();
  if (!shotMode) pushMessage(plane, MISSIONS[index].name.toUpperCase() + ' — ' + MISSIONS[index].blurb);
}

// Screenshot presets: put the plane somewhere photogenic, flying itself,
// so a still frame shows the game at its best. ?shot=cover|rings|landing|drop
function applyShotMode() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return false;
  shotMode = true;
  if (shot === 'cover' || shot === 'rings') {
    const idx = shot === 'cover' ? 0 : 2;
    startMission(0);
    const ring = MISSIONS[0].rings[idx];
    const prev = idx > 0 ? MISSIONS[0].rings[idx - 1] : { x: 0, z: -40 };
    const dx = ring.x - prev.x, dz = ring.z - prev.z;
    const len = Math.hypot(dx, dz);
    const dist = shot === 'cover' ? 420 : 200;
    plane.x = ring.x - (dx / len) * dist;
    plane.z = ring.z - (dz / len) * dist;
    plane.y = ring.y + 6;
    plane.heading = Math.atan2(dx, dz);
    plane.speed = 62;
    plane.throttle = 0.65;
    plane.airborne = true;
    plane.onGround = false;
    mission.ringIndex = idx;
    mission.prevRingSide = -1;
  } else if (shot === 'landing') {
    startMission(2);
    const rw = RUNWAYS[1];
    const a = (rw.angle * Math.PI) / 180;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    plane.x = rw.x - dir.x * 620;
    plane.z = rw.z - dir.z * 620;
    plane.y = rw.ground + 78;
    plane.heading = a;
    plane.speed = 56;
    plane.throttle = 0.32;
    plane.gearDown = true;
    plane.airborne = true;
    plane.onGround = false;
  } else if (shot === 'drop') {
    startMission(1);
    plane.x = 330;
    plane.z = 60;
    plane.y = 128;
    plane.heading = 0;
    plane.speed = 54;
    plane.throttle = 0.55;
    plane.airborne = true;
    plane.onGround = false;
  } else {
    return false;
  }
  autopilot = true;
  return true;
}

// Autopilot: banks toward the mission target, holds altitude and speed.
function autopilotInput(p, m) {
  const target = missionTarget(m);
  const out = { throttle: 0, turn: 0, pitch: 0 };
  if (!target) return out;
  const dx = target.x - p.x, dz = target.z - p.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - p.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  out.turn = Math.max(-1, Math.min(1, diff * 1.6));
  // Altitude: rings and the drop zone are held directly; a landing aims at
  // the threshold and follows a shallow slope down to the strip.
  let wantAlt = target.y || 130;
  let wantSpeed = 60;
  const landing = m.def.id === 'island-landing' || (m.def.id === 'parcel-drop' && m.dropped);
  if (landing) {
    const rw = m.def.id === 'island-landing' ? RUNWAYS[1] : RUNWAYS[0];
    const a = (rw.angle * Math.PI) / 180;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const frame = runwayFrame(rw, p.x, p.z);
    const thresholdAlong = -(rw.length / 2 - 60);
    if (frame.along > thresholdAlong - 30 && Math.abs(frame.across) < rw.width) {
      // On final over the strip: flare down to the pavement, hold the
      // centreline, and let the wheels find the ground. The target sits
      // just under the pavement so the plane keeps settling until it touches.
      wantAlt = rw.ground - 0.5;
      wantSpeed = 42;
      let d3 = a - p.heading;
      while (d3 > Math.PI) d3 -= Math.PI * 2;
      while (d3 < -Math.PI) d3 += Math.PI * 2;
      out.turn = Math.max(-1, Math.min(1, d3 * 1.6));
    } else {
      // Steer at the threshold, not the strip centre, or the plane overflies it.
      const tx = rw.x - dir.x * (rw.length / 2 - 60);
      const tz = rw.z - dir.z * (rw.length / 2 - 60);
      const distT = Math.hypot(tx - p.x, tz - p.z);
      wantAlt = rw.ground + Math.max(1.2, distT * 0.05);
      wantSpeed = distT < 250 ? 44 : 55;
      const wantH = Math.atan2(tx - p.x, tz - p.z);
      let d2 = wantH - p.heading;
      while (d2 > Math.PI) d2 -= Math.PI * 2;
      while (d2 < -Math.PI) d2 += Math.PI * 2;
      out.turn = Math.max(-1, Math.min(1, d2 * 1.6));
    }
  }
  const altErr = wantAlt - p.y;
  // Note: the flight model scales the pitch command by 0.34, so the
  // autopilot speaks in command units (-1..1), not radians.
  out.pitch = Math.max(-1, Math.min(1, altErr * 0.05));
  const speedErr = wantSpeed - p.speed;
  out.throttle = Math.max(-1, Math.min(1, speedErr * 0.06));
  return out;
}

function step(dt) {
  time += dt;
  if (state === 'menu') {
    if (input.consume('Digit1')) startMission(0);
    else if (input.consume('Digit2')) startMission(1);
    else if (input.consume('Digit3')) startMission(2);
    else if (input.consume('Enter')) startMission(0);
    return;
  }
  if (state === 'paused') {
    if (input.consume('KeyP') || input.consume('Escape')) state = 'flying';
    return;
  }
  if (state === 'over') {
    if (input.consume('KeyR')) startMission(MISSIONS.indexOf(mission.def));
    else if (input.consume('KeyM')) { state = 'menu'; plane = makePlane(); mission = makeMission(MISSIONS[0]); }
    return;
  }
  // Flying.
  if (input.consume('KeyP') || input.consume('Escape')) { state = 'paused'; return; }
  if (input.consume('KeyG')) {
    plane.gearDown = !plane.gearDown;
    pushMessage(plane, plane.gearDown ? 'GEAR DOWN' : 'GEAR UP');
    audio.beep(660, 0.12, 0.08);
  }
  if (input.consume('KeyF')) {
    plane.flaps = !plane.flaps;
    pushMessage(plane, plane.flaps ? 'FLAPS DOWN' : 'FLAPS UP');
  }
  plane.throttle = Math.max(0, Math.min(1, plane.throttle + input.consumeWheel()));
  const eff = autopilot ? autopilotInput(plane, mission) : input;
  updatePlane(plane, eff, dt);
  updateMission(mission, plane, dt, audio);
  audio.setEngine(plane.throttle, plane.speed);
  if (mission.done) {
    overTimer += dt;
    if (overTimer > 1.4) { state = 'over'; overTimer = 0; }
  } else {
    overTimer = 0;
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  if (state === 'menu') {
    drawScene(ctx, plane, mission, time, W, H);
    drawMenu(ctx, W, H, time);
    return;
  }
  drawScene(ctx, plane, mission, time, W, H);
  drawHud(ctx, plane, mission, W, H, time);
  drawPanel(ctx, plane, mission, W, H);
  if (state === 'paused') drawPaused(ctx, W, H);
  if (state === 'over') drawEndScreen(ctx, plane, mission, W, H, time);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  draw();
  requestAnimationFrame(frame);
}

// Exposed for play-testing: window.__game = {plane, mission, state, ...}
window.__game = {
  get plane() { return plane; },
  get mission() { return mission; },
  get state() { return state; },
  get time() { return time; },
  start: startMission,
};

if (!applyShotMode()) {
  // Menu backdrop: park the plane on the strip, engine off, valley ahead.
  plane.y = groundHeight(plane.x, plane.z);
}
requestAnimationFrame(frame);
