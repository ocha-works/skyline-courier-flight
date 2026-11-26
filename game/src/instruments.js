// Skyline Courier — instruments: the HUD (altitude, speed, heading),
// the lit cockpit panel (artificial horizon, dials, fuel, throttle),
// messages, menus and end screens. All drawn on the same canvas.

function fmt(n, digits) {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits || 0 });
}

function drawCompass(ctx, headingDeg, W) {
  const cx = W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,24,0.72)';
  ctx.fillRect(cx - 190, 10, 380, 34);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 190, 10, 380, 34);
  ctx.fillStyle = '#e8eef2';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (let off = -90; off <= 90; off += 15) {
    let d = Math.round(headingDeg + off);
    d = ((d % 360) + 360) % 360;
    const x = cx + off * 2;
    const major = d % 90 === 0;
    ctx.fillRect(x, major ? 14 : 20, 1, major ? 12 : 6);
    if (major) {
      const label = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d);
      ctx.fillText(label, x, 40);
    }
  }
  // Centre caret and digital heading.
  ctx.fillStyle = PALETTE.ring;
  ctx.beginPath();
  ctx.moveTo(cx, 12); ctx.lineTo(cx - 6, 4); ctx.lineTo(cx + 6, 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.ring;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, 62);
  ctx.restore();
}

function drawHud(ctx, plane, mission, W, H, time) {
  const headingDeg = ((plane.heading * 180 / Math.PI) % 360 + 360) % 360;
  const speedKt = Math.round(plane.speed * 1.944);
  const altFt = Math.round(plane.y * 3.281);
  const aglFt = Math.round((plane.y - groundHeight(plane.x, plane.z)) * 3.281);
  drawCompass(ctx, headingDeg, W);

  ctx.textAlign = 'left';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.85)';
  ctx.fillText('ALT', 18, 30);
  ctx.fillText('SPD', 18, 62);
  ctx.fillText('V/S', 18, 94);
  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fmt(altFt) + ' ft', 62, 32);
  ctx.fillText(speedKt + ' kt', 62, 64);
  ctx.fillText((plane.vspeed >= 0 ? '+' : '') + Math.round(plane.vspeed * 196.85) + ' fpm', 62, 96);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.7)';
  ctx.fillText('AGL ' + fmt(aglFt) + ' ft', 62, 112);

  // Top right: mission, score, clock.
  ctx.textAlign = 'right';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(mission.def.name.toUpperCase(), W - 18, 30);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.85)';
  ctx.fillText(missionObjectiveText(mission), W - 18, 50);
  ctx.fillText('SCORE ' + mission.score, W - 18, 70);
  const mm = Math.floor(mission.time / 60), ss = Math.floor(mission.time % 60);
  ctx.fillText('TIME ' + mm + ':' + String(ss).padStart(2, '0'), W - 18, 90);
  ctx.textAlign = 'left';

  // Centre messages (ring calls, warnings).
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px sans-serif';
  let my = 92;
  for (const m of plane.messages) {
    const a = Math.max(0, 1 - m.t / 4);
    ctx.fillStyle = 'rgba(255,233,168,' + a + ')';
    ctx.fillText(m.text, W / 2, my);
    my += 28;
  }
  ctx.textAlign = 'left';

  // Warnings.
  let wy = 132;
  ctx.font = 'bold 14px sans-serif';
  if (plane.fuel < 25 && plane.fuel > 0) {
    ctx.fillStyle = (Math.floor(time * 2) % 2 === 0) ? PALETTE.warn : '#ffb0a6';
    ctx.fillText('⚠ LOW FUEL ' + Math.round(plane.fuel) + '%', 18, wy); wy += 22;
  }
  if (plane.speed < CFG.stallSpeed && plane.airborne) {
    ctx.fillStyle = (Math.floor(time * 2) % 2 === 0) ? PALETTE.warn : '#ffb0a6';
    ctx.fillText('⚠ STALL — LOWER THE NOSE', 18, wy); wy += 22;
  }
  if (plane.damage > 50) {
    ctx.fillStyle = PALETTE.warn;
    ctx.fillText('⚠ HULL ' + Math.round(plane.damage) + '% DAMAGED', 18, wy); wy += 22;
  }
  if (mission.def.id === 'parcel-drop' && !mission.dropped) {
    const dz = mission.def.dropZone;
    const d = Math.hypot(plane.x - dz.x, plane.z - dz.z);
    const agl = plane.y - groundHeight(plane.x, plane.z);
    if (d < dz.r * 1.6) {
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('SLOW BELOW 55 m/s AND UNDER 150 m — THEN THE PARCEL DROPS ITSELF', 18, wy);
    }
  }
}

function drawGauge(ctx, cx, cy, r, label, value, min, max, unit, warnBelow) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = PALETTE.gaugeFace;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#22262b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  const frac = clamp01((value - min) / (max - min));
  const angle = -Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = '#22262b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * (r - 8), Math.sin(angle) * (r - 8)); ctx.stroke();
  ctx.fillStyle = '#22262b';
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#22262b';
  ctx.fillText(label, 0, -r + 16);
  ctx.font = 'bold 13px monospace';
  ctx.fillText(fmt(value) + (unit ? ' ' + unit : ''), 0, r - 8);
  if (warnBelow !== undefined && value < warnBelow) {
    ctx.fillStyle = PALETTE.warn;
    ctx.beginPath(); ctx.arc(r - 6, -r + 6, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawArtificialHorizon(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
  ctx.rotate(-roll);
  const pitchPx = pitch * r * 1.6;
  ctx.fillStyle = '#5fa8dd';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r - pitchPx);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r, pitchPx, r * 2, r - pitchPx + r);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-r, pitchPx); ctx.lineTo(r, pitchPx); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#22262b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  // Fixed wings.
  ctx.fillStyle = PALETTE.ring;
  ctx.fillRect(-r + 4, -2, 14, 4);
  ctx.fillRect(r - 18, -2, 14, 4);
  ctx.fillStyle = '#22262b';
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8eef2';
  ctx.fillText('ATTITUDE', 0, r + 14);
  ctx.restore();
}

function drawPanel(ctx, plane, mission, W, H) {
  const panelH = 118;
  const top = H - panelH;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, top, W, panelH);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, top, W, 2);
  const cx = W / 2;
  drawArtificialHorizon(ctx, cx - 430, top + 48, 40, plane.pitch, plane.roll);
  drawGauge(ctx, cx - 300, top + 48, 40, 'ALT', Math.round(plane.y * 3.281), 0, 6000, 'ft');
  drawGauge(ctx, cx - 170, top + 48, 40, 'SPD', Math.round(plane.speed * 1.944), 0, 220, 'kt');
  drawGauge(ctx, cx - 40, top + 48, 40, 'V/S', Math.round(plane.vspeed * 196.85), -2000, 2000, 'fpm');
  // Fuel gauge.
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#e8eef2';
  ctx.fillText('FUEL', cx + 90, top + 18);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(cx + 30, top + 26, 120, 16);
  const fuelCol = plane.fuel < 25 ? PALETTE.warn : plane.fuel < 50 ? PALETTE.ring : PALETTE.ok;
  ctx.fillStyle = fuelCol;
  ctx.fillRect(cx + 32, top + 28, 116 * clamp01(plane.fuel / 100), 12);
  ctx.fillStyle = '#e8eef2';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(Math.round(plane.fuel) + '%', cx + 90, top + 58);
  // Throttle lever.
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('THROTTLE', cx + 210, top + 18);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(cx + 206, top + 26, 10, 64);
  ctx.fillStyle = '#7db3dd';
  ctx.fillRect(cx + 206, top + 26 + 64 * (1 - plane.throttle), 10, 64 * plane.throttle);
  ctx.fillStyle = '#e8eef2';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(Math.round(plane.throttle * 100) + '%', cx + 210, top + 104);
  // Hull bar.
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('HULL', cx + 320, top + 18);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(cx + 270, top + 26, 100, 16);
  ctx.fillStyle = plane.damage > 50 ? PALETTE.warn : PALETTE.ok;
  ctx.fillRect(cx + 272, top + 28, 96 * clamp01(1 - plane.damage / 100), 12);
  ctx.fillStyle = '#e8eef2';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(Math.round(100 - plane.damage) + '%', cx + 320, top + 58);
  // Gear and flaps lamps, lit when active.
  const lamps = [
    { label: 'GEAR', on: plane.gearDown, color: PALETTE.ok },
    { label: 'FLAPS', on: plane.flaps, color: '#7db3dd' },
    { label: 'STALL', on: plane.speed < CFG.stallSpeed && plane.airborne, color: PALETTE.warn },
  ];
  let lx = cx + 400;
  for (const lamp of lamps) {
    ctx.fillStyle = lamp.on ? lamp.color : '#2c3846';
    ctx.beginPath(); ctx.arc(lx, top + 34, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8eef2';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(lamp.label, lx, top + 54);
    lx += 52;
  }
  // Controls reminder, bottom right.
  ctx.textAlign = 'right';
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.6)';
  ctx.fillText('W/S throttle · A/D bank · mouse pitch · G gear · F flaps · P pause', W - 14, top + 104);
  ctx.textAlign = 'left';
}

function drawMenu(ctx, W, H, time) {
  ctx.fillStyle = 'rgba(8,14,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SKYLINE COURIER', W / 2, 150);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText('A courier pilot, a valley, and three jobs that pay in nerve.', W / 2, 190);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('CHOOSE YOUR SORTIE — press 1, 2 or 3', W / 2, 250);
  const rows = [
    ['1', 'RING RUN', 'Thread 8 sky rings over the valley. Each ring refuels you.'],
    ['2', 'PARCEL DROP', 'Drop the parcel on the market square, then land at Harborfield.'],
    ['3', 'ISLAND LANDING', 'Cross the river and put her down on the Isle of Gulls strip.'],
  ];
  let y = 300;
  for (const [key, name, blurb] of rows) {
    ctx.fillStyle = 'rgba(16,22,31,0.85)';
    ctx.fillRect(W / 2 - 340, y - 26, 680, 52);
    ctx.strokeStyle = PALETTE.ring;
    ctx.lineWidth = 1;
    ctx.strokeRect(W / 2 - 340, y - 26, 680, 52);
    ctx.fillStyle = PALETTE.ring;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(key, W / 2 - 310, y + 8);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(name, W / 2 - 280, y - 2);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(232,238,242,0.85)';
    ctx.fillText(blurb, W / 2 - 280, y + 18);
    ctx.textAlign = 'center';
    y += 68;
  }
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.85)';
  ctx.fillText('W/S throttle · A/D or ←/→ bank · mouse steers pitch · G gear · F flaps · P pause', W / 2, y + 30);
  ctx.fillText('Fly with discipline: speed, fuel and hull are the whole job.', W / 2, y + 56);
  if (Math.floor(time * 1.5) % 2 === 0) {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('— press 1, 2 or 3 to fly —', W / 2, y + 92);
  }
  ctx.textAlign = 'left';
}

function drawEndScreen(ctx, plane, mission, W, H, time) {
  ctx.fillStyle = 'rgba(8,14,24,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  const crashed = plane.crashed;
  ctx.fillStyle = crashed ? PALETTE.warn : '#ffffff';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(crashed ? 'SORTIE LOST' : 'SORTIE COMPLETE', W / 2, 180);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '20px sans-serif';
  ctx.fillText(mission.doneText || mission.def.name, W / 2, 224);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('SCORE  ' + mission.score, W / 2, 290);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.9)';
  const mm = Math.floor(mission.time / 60), ss = Math.floor(mission.time % 60);
  ctx.fillText('Mission: ' + mission.def.name + '   ·   Time ' + mm + ':' + String(ss).padStart(2, '0')
    + '   ·   Fuel ' + Math.round(plane.fuel) + '%   ·   Hull ' + Math.round(100 - plane.damage) + '%',
    W / 2, 330);
  if (Math.floor(time * 1.5) % 2 === 0) {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('Press R to fly again, or M for the menu', W / 2, 400);
  }
  ctx.textAlign = 'left';
}

function drawPaused(ctx, W, H) {
  ctx.fillStyle = 'rgba(8,14,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = 'rgba(232,238,242,0.9)';
  ctx.fillText('Press P to resume', W / 2, H / 2 + 30);
  ctx.textAlign = 'left';
}
