// Skyline Courier — input: keyboard and mouse, one shared state object.
// W/S throttle, A/D or arrows bank, mouse vertical steers pitch,
// mouse horizontal nudges the bank, wheel trims the throttle.

function makeInput(canvas) {
  const input = {
    throttle: 0,   // -1..1 per second of key hold
    turn: 0,       // -1..1 bank command
    pitch: 0,      // -1..1 pitch command
    keys: {},
    mouseX: 0.5, mouseY: 0.5, mouseActive: false,
    pressed: {},   // keys pressed since last consume
  };

  function keyDir() {
    input.throttle = 0;
    if (input.keys['KeyW'] || input.keys['ArrowUp']) input.throttle += 1;
    if (input.keys['KeyS'] || input.keys['ArrowDown']) input.throttle -= 1;
    input.turn = 0;
    if (input.keys['KeyA'] || input.keys['ArrowLeft']) input.turn -= 1;
    if (input.keys['KeyD'] || input.keys['ArrowRight']) input.turn += 1;
    // Mouse steers pitch: pointer above centre pulls the nose up.
    if (input.mouseActive) {
      input.pitch = clamp01(1 - (input.mouseY - 0.5) * 2) * 2 - 1;
      input.pitch = Math.max(-1, Math.min(1, (0.5 - input.mouseY) * 2.4));
      input.turn += Math.max(-0.6, Math.min(0.6, (input.mouseX - 0.5) * 1.4));
      input.turn = Math.max(-1, Math.min(1, input.turn));
    } else {
      input.pitch = 0;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed[e.code] = true;
    input.keys[e.code] = true;
    keyDir();
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
    keyDir();
  });
  let lastTouchEnd = 0;
  canvas.addEventListener('mousemove', (e) => {
    if (Date.now() - lastTouchEnd < 700) return; // ignore synthetic mouse events after a touch
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) / r.width;
    input.mouseY = (e.clientY - r.top) / r.height;
    input.mouseActive = true;
    keyDir();
  });
  canvas.addEventListener('mouseleave', () => {
    input.mouseActive = false;
    keyDir();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheelDelta = (input.wheelDelta || 0) + (e.deltaY < 0 ? 0.06 : -0.06);
  }, { passive: false });
  canvas.addEventListener('mousedown', () => {
    input.mouseDown = true;
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  // ---- Touch controls (play-copy addition) ----
  // Dragging on the canvas steers like the mouse (pitch + bank nudge).
  // On-screen buttons dispatch the same keyboard events the game already
  // listens for, so no game logic changes are needed.
  let steerTouchId = null;
  function touchPos(t) {
    const r = canvas.getBoundingClientRect();
    input.mouseX = (t.clientX - r.left) / r.width;
    input.mouseY = (t.clientY - r.top) / r.height;
  }
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    steerTouchId = t.identifier;
    touchPos(t);
    input.mouseActive = true;
    keyDir();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === steerTouchId) { touchPos(t); keyDir(); }
    }
  }, { passive: false });
  function endTouch(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === steerTouchId) {
        steerTouchId = null;
        input.mouseActive = false;
        lastTouchEnd = Date.now();
        keyDir();
      }
    }
  }
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;' +
      'font-family:system-ui,sans-serif;-webkit-user-select:none;user-select:none;';
    function fireKey(code, type) {
      window.dispatchEvent(new KeyboardEvent(type, { code: code, bubbles: true }));
    }
    function makeBtn(label, style, onDown, onUp) {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = 'position:absolute;pointer-events:auto;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(10,25,45,0.55);color:#fff;border:1.5px solid ' +
        'rgba(255,255,255,0.65);border-radius:14px;font-size:15px;font-weight:600;' +
        'min-width:60px;min-height:52px;padding:6px 10px;touch-action:none;' + style;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); onDown(); }, { passive: false });
      const release = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } if (onUp) onUp(); };
      b.addEventListener('touchend', release, { passive: false });
      b.addEventListener('touchcancel', () => { if (onUp) onUp(); });
      layer.appendChild(b);
      return b;
    }
    function holdBtn(label, style, code) {
      makeBtn(label, style,
        () => fireKey(code, 'keydown'),
        () => fireKey(code, 'keyup'));
    }
    function tapBtn(label, style, code) {
      makeBtn(label, style, () => {
        fireKey(code, 'keydown');
        setTimeout(() => fireKey(code, 'keyup'), 70);
      });
    }
    // Throttle (hold), bottom-left.
    holdBtn('THR +', 'left:14px;bottom:86px;', 'KeyW');
    holdBtn('THR −', 'left:14px;bottom:20px;', 'KeyS');
    // Gear / flaps / pause, bottom-right.
    tapBtn('GEAR', 'right:14px;bottom:20px;', 'KeyG');
    tapBtn('FLAPS', 'right:96px;bottom:20px;', 'KeyF');
    tapBtn('II', 'right:14px;top:14px;', 'KeyP');
    // Mission select + end-screen helpers, top-left.
    tapBtn('1', 'left:14px;top:14px;min-width:46px;', 'Digit1');
    tapBtn('2', 'left:76px;top:14px;min-width:46px;', 'Digit2');
    tapBtn('3', 'left:138px;top:14px;min-width:46px;', 'Digit3');
    tapBtn('RETRY', 'left:200px;top:14px;', 'KeyR');
    tapBtn('MENU', 'left:286px;top:14px;', 'KeyM');
    document.body.appendChild(layer);
  }

  input.consume = function (code) {
    const hit = !!input.pressed[code];
    input.pressed[code] = false;
    return hit;
  };
  input.consumeWheel = function () {
    const d = input.wheelDelta || 0;
    input.wheelDelta = 0;
    return d;
  };
  return input;
}
