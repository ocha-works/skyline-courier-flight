// Skyline Courier — missions: rings, the parcel drop and the island
// landing. Each mission tracks its own progress and score.

function makeMission(missionDef) {
  return {
    def: missionDef,
    ringIndex: 0,
    ringsPassed: 0,
    rings: (missionDef.rings || []).map((r) => ({ ...r, passed: false })),
    dropped: false,
    dropScore: 0,
    landedOk: false,
    score: 0,
    time: 0,
    done: false,
    doneText: '',
    prevRingSide: null, // sign of (plane - ring centre) dot ring facing
  };
}

function missionTarget(m) {
  if (m.def.id === 'ring-run') {
    return m.ringIndex < m.rings.length ? m.rings[m.ringIndex] : null;
  }
  if (m.def.id === 'parcel-drop') {
    if (!m.dropped) return { x: m.def.dropZone.x, y: 120, z: m.def.dropZone.z, r: m.def.dropZone.r, label: 'DROP ZONE' };
    return { x: RUNWAYS[0].x, y: 60, z: RUNWAYS[0].z, r: 60, label: 'HARBORFIELD' };
  }
  if (m.def.id === 'island-landing') {
    const rw = RUNWAYS[m.def.runway];
    return { x: rw.x, y: 80, z: rw.z, r: 60, label: rw.name.toUpperCase() };
  }
  return null;
}

function missionObjectiveText(m) {
  if (m.def.id === 'ring-run') return 'Ring ' + Math.min(m.ringIndex + 1, m.rings.length) + ' of ' + m.rings.length;
  if (m.def.id === 'parcel-drop') {
    if (!m.dropped) return 'Drop the parcel on the market square (slow, below 150 m)';
    return 'Parcel delivered — land at Harborfield';
  }
  return 'Land on the Isle of Gulls strip';
}

// A ring faces along the course: from the previous ring (or the start)
// toward the next one, so the pilot flies through it, not past it.
function ringFacing(m, i) {
  const cur = m.rings[i];
  const prev = i > 0 ? m.rings[i - 1] : { x: 0, z: -40 };
  const dx = cur.x - prev.x, dz = cur.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function updateMission(m, p, dt, audio) {
  if (m.done) return;
  m.time += dt;

  if (m.def.id === 'ring-run') {
    const ring = m.rings[m.ringIndex];
    if (ring) {
      const f = ringFacing(m, m.ringIndex);
      const side = (p.x - ring.x) * f.x + (p.z - ring.z) * f.z;
      const sideSign = side >= 0 ? 1 : -1;
      if (m.prevRingSide !== null && sideSign !== m.prevRingSide && side > 0) {
        // Crossed the ring plane: how close to the centre?
        const dist = Math.hypot(p.x - ring.x, p.y - ring.y, p.z - ring.z);
        if (dist < ring.r) {
          ring.passed = true;
          m.ringsPassed++;
          m.ringIndex++;
          m.score += 100;
          p.fuel = Math.min(100, p.fuel + CFG.fuelPerRing);
          pushMessage(p, 'RING ' + m.ringsPassed + '/' + m.rings.length + '  +100  fuel +' + CFG.fuelPerRing + '%');
          if (audio) audio.ring();
        } else {
          pushMessage(p, 'MISSED THE RING — turn back!');
          if (audio) audio.miss();
        }
      }
      m.prevRingSide = sideSign;
    }
    if (m.ringIndex >= m.rings.length) {
      m.done = true;
      const timeBonus = Math.max(0, Math.round((m.def.parSeconds - m.time) * 2));
      m.score += timeBonus;
      m.doneText = 'All rings flown! Time bonus +' + timeBonus;
      if (audio) audio.win();
    }
  }

  if (m.def.id === 'parcel-drop') {
    if (!m.dropped) {
      const dz = m.def.dropZone;
      const d = Math.hypot(p.x - dz.x, p.z - dz.z);
      const agl = p.y - groundHeight(p.x, p.z);
      if (d < dz.r && p.speed < m.def.dropMaxSpeed && agl < m.def.dropMaxAlt) {
        m.dropped = true;
        const accuracy = Math.max(0, 100 - Math.round((d / dz.r) * 60));
        m.dropScore = 150 + accuracy;
        m.score += m.dropScore;
        pushMessage(p, 'PARCEL AWAY! Accuracy ' + accuracy + '%  +' + m.dropScore);
        if (audio) audio.ring();
      }
    }
    if (m.dropped && p.landed) {
      m.done = true;
      const timeBonus = Math.max(0, Math.round((m.def.parSeconds - m.time) * 2));
      m.score += timeBonus;
      m.doneText = 'Parcel delivered and landed. Time bonus +' + timeBonus;
      if (audio) audio.win();
    }
  }

  if (m.def.id === 'island-landing') {
    if (p.landed) {
      const rw = RUNWAYS[m.def.runway];
      const good = onRunway(rw, p.x, p.z);
      m.done = true;
      m.landedOk = good;
      const quality = good ? 300 : 120;
      const timeBonus = Math.max(0, Math.round((m.def.parSeconds - m.time) * 2));
      m.score += quality + timeBonus;
      m.doneText = good
        ? 'Down safe on the Isle of Gulls! Landing +' + quality + ', time +' + timeBonus
        : 'Down, but off the strip. Landing +' + quality;
      if (audio) audio.win();
    }
  }

  // A crash or a fuel-out stop ends the mission where it stands.
  if ((p.crashed || p.landed) && !m.done) {
    if (p.crashed) {
      m.done = true;
      m.doneText = 'Sortie lost. Score kept: ' + m.score;
      if (audio) audio.crash();
    } else if (m.def.id === 'ring-run') {
      m.done = true;
      m.doneText = 'Landed early — rings flown: ' + m.ringsPassed + '/' + m.rings.length;
    }
  }
}
