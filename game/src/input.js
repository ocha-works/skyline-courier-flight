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
  canvas.addEventListener('mousemove', (e) => {
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
