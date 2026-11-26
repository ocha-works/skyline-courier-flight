// Skyline Courier — flight model: throttle, banked turns, pitch, lift,
// stall, fuel burn and damage. Units: metres, m/s, radians, percent.

function makePlane() {
  return {
    x: 0, z: -40, y: 0,          // position; y is altitude above sea level
    heading: 0,                  // radians, 0 = north (+z)
    pitch: 0, roll: 0,           // radians
    speed: 0,                    // m/s
    throttle: 0,                 // 0..1
    fuel: CFG.startFuel,         // percent
    damage: 0,                   // percent; 100 = wrecked
    gearDown: false,
    flaps: false,
    vspeed: 0,                   // m/s, + = climbing
    onGround: true,
    airborne: false,
    crashed: false,
    landed: false,
    messages: [],                // transient HUD messages {text, t}
  };
}

function planeForward(p) {
  return { x: Math.sin(p.heading), z: Math.cos(p.heading) };
}

// True if (x, z) lies on runway `rw`'s paved strip.
function onRunway(rw, x, z) {
  const f = runwayFrame(rw, x, z);
  return Math.abs(f.across) <= rw.width / 2 && Math.abs(f.along) <= rw.length / 2;
}

function nearestRunway(x, z) {
  let best = null, bestD = Infinity;
  for (const rw of RUNWAYS) {
    const f = runwayFrame(rw, x, z);
    const d = Math.hypot(f.across, Math.max(0, Math.abs(f.along) - rw.length / 2));
    if (d < bestD) { bestD = d; best = rw; }
  }
  return { runway: best, dist: bestD };
}

function pushMessage(p, text) {
  p.messages.push({ text, t: 0 });
  if (p.messages.length > 4) p.messages.shift();
}

function updatePlane(p, input, dt) {
  if (p.crashed || p.landed) return;
  const ground = groundHeight(p.x, p.z);
  const agl = p.y - ground;

  // Throttle: W/S or ArrowUp/ArrowDown on the throttle axis, mouse wheel too.
  p.throttle = Math.max(0, Math.min(1, p.throttle + input.throttle * dt * 0.8));
  if (p.fuel <= 0) p.throttle = 0; // out of fuel: the engine quits

  // Bank: A/D or arrows roll the wings; the turn follows the bank.
  const bankTarget = input.turn * 0.62;
  p.roll += (bankTarget - p.roll) * Math.min(1, dt * 3.2);
  const turnRate = (CFG.gravityTurn * Math.tan(p.roll)) / Math.max(30, p.speed);
  p.heading += turnRate * dt;

  // Pitch: mouse or arrow keys; nose up costs speed, nose down gains it.
  const pitchTarget = input.pitch * 0.34;
  p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 2.6);

  // Speed chases the throttle, with drag from flaps and from climbing.
  let targetSpeed = 28 + p.throttle * (CFG.maxSpeed - 28);
  if (p.flaps) targetSpeed *= 0.82;
  targetSpeed -= Math.sin(p.pitch) * 22;
  p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 0.45);
  if (p.speed < 0) p.speed = 0;

  // Vertical speed: lift from speed and pitch, sink when slow.
  let vy = p.speed * Math.sin(p.pitch);
  if (p.speed < CFG.stallSpeed) vy -= (CFG.stallSpeed - p.speed) * 0.35;
  if (p.onGround) vy = Math.max(0, vy);
  p.vspeed = vy;
  p.y += vy * dt;

  // Move forward.
  const fwd = planeForward(p);
  const horizontal = p.speed * Math.cos(p.pitch);
  p.x += fwd.x * horizontal * dt;
  p.z += fwd.z * horizontal * dt;

  // Fuel burn grows with throttle; the tank is the sortie's clock.
  p.fuel -= (CFG.fuelDrainBase + CFG.fuelDrainThrottle * p.throttle) * dt;
  if (p.fuel < 0) p.fuel = 0;

  // Ground contact.
  const groundNow = groundHeight(p.x, p.z);
  const aglNow = p.y - groundNow;
  p.onGround = aglNow <= 0.05 && vy <= 0.5;
  if (p.onGround) {
    p.y = groundNow;
    p.pitch = 0;
    const strip = nearestRunway(p.x, p.z);
    const stripOk = strip.runway && onRunway(strip.runway, p.x, p.z);
    const gentle = vy > -5.5 && p.speed < 58;
    if (p.airborne) {
      // A touchdown: judge it.
      if (stripOk && gentle && p.gearDown) {
        p.landed = true;
        p.airborne = false;
        p.speed = Math.max(0, p.speed - 12);
        pushMessage(p, 'TOUCHDOWN — ' + strip.runway.name);
      } else if (stripOk && gentle && !p.gearDown) {
        p.damage += 45;
        p.y = groundNow + 1.2;
        p.vspeed = 2.5;
        p.pitch = 0.06;
        pushMessage(p, 'BELLY LANDING! GEAR WAS UP — hull -45%');
      } else {
        // Hard arrival or rough ground: damage and a bounce, or a wreck.
        const hit = stripOk ? 35 : 70;
        p.damage += hit;
        if (p.damage >= 100 || !stripOk) {
          p.crashed = true;
          pushMessage(p, stripOk ? 'CRASH — too hard on the strip' : 'CRASH — terrain strike');
        } else {
          p.y = groundNow + 1.5;
          p.vspeed = 3;
          pushMessage(p, 'HARD TOUCHDOWN — hull -' + hit + '%');
        }
      }
    }
    if (!p.crashed && !p.landed) {
      // Rolling on the ground: friction slows the plane.
      p.speed = Math.max(0, p.speed - 26 * dt);
      if (p.speed > 46 && p.throttle > 0.55) p.airborne = true; // rotation speed
    }
  } else if (aglNow > 2) {
    p.airborne = true;
  }

  if (p.fuel <= 0 && !p.airborne) {
    // Ran dry on the ground: the sortie is over, gently.
    p.landed = true;
    p.airborne = false;
    pushMessage(p, 'OUT OF FUEL — rolled to a stop');
  }

  // Age the HUD messages.
  for (const m of p.messages) m.t += dt;
  p.messages = p.messages.filter((m) => m.t < 4);
}
