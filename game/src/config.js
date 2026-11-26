// Skyline Courier — configuration: world constants, missions and tuning.
// All numbers are in metres, metres per second, degrees or percent unless noted.

const CFG = {
  canvasW: 1280,
  canvasH: 720,
  focal: 760,            // perspective focal length (px) for the chase camera
  cell: 50,              // terrain mesh cell size (m)
  meshHalf: 20,          // mesh extends +-meshHalf cells around the aircraft
  waterLevel: 1.5,       // terrain below this is river water
  gravityTurn: 9.81,     // used for banked-turn rate
  maxSpeed: 105,         // m/s at full throttle (~204 kt)
  cruiseSpeed: 62,       // m/s, comfortable cruise
  minSpeed: 26,          // m/s, below this the wing stops flying
  stallSpeed: 38,        // m/s, below this the nose drops
  fuelDrainBase: 0.055,  // %/s at idle
  fuelDrainThrottle: 0.30, // extra %/s at full throttle
  fuelPerRing: 14,       // % refuelled by flying a ring
  startFuel: 100,
};

// The two runways of the valley. `angle` is the runway heading in degrees
// (0 = due north, +z). The main strip is where every sortie starts.
const RUNWAYS = [
  { name: 'Harborfield', x: 0, z: 120, angle: 0, length: 640, width: 38, ground: 14 },
  { name: 'Isle of Gulls', x: 980, z: 1560, angle: 28, length: 520, width: 32, ground: 19 },
];

// Mission catalogue. Each mission is a different job for the same courier
// plane, with its own goal, scoring and end condition.
const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Thread all 8 sky rings over the valley. Each ring refuels you.',
    rings: [
      { x: 120, y: 150, z: 900, r: 30 },
      { x: -260, y: 170, z: 1500, r: 30 },
      { x: -120, y: 140, z: 2150, r: 28 },
      { x: 420, y: 190, z: 2600, r: 30 },
      { x: 900, y: 160, z: 2350, r: 28 },
      { x: 1180, y: 180, z: 1750, r: 30 },
      { x: 760, y: 150, z: 1150, r: 28 },
      { x: 240, y: 130, z: 620, r: 30 },
    ],
    parSeconds: 240,
  },
  {
    id: 'parcel-drop',
    name: 'Parcel Drop',
    blurb: 'Carry the parcel to the market square, slow down, drop it on the mark, then land at Harborfield.',
    dropZone: { x: 330, y: 0, z: 430, r: 55 },
    dropMaxSpeed: 55,
    dropMaxAlt: 150,
    parSeconds: 300,
  },
  {
    id: 'island-landing',
    name: 'Island Landing',
    blurb: 'Cross the river and put her down on the Isle of Gulls strip. Gear down, gentle descent, on the centreline.',
    runway: 1,
    parSeconds: 300,
  },
];

// Colours for the valley, one palette for the whole game.
const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7db3dd',
  skyHorizon: '#cfe4f2',
  sun: '#fff3c4',
  grassLow: '#5d8a48',
  grassHigh: '#7fae5f',
  meadow: '#8fb96a',
  sand: '#d9c48f',
  water: '#3f7fb8',
  waterDeep: '#2c5f8f',
  rock: '#8d8578',
  town: '#b9ac93',
  roofA: '#b0563f',
  roofB: '#4f6d8f',
  roofC: '#7a5a8f',
  runway: '#3a3f45',
  runwayMark: '#f2f2e8',
  tree: '#3f6d33',
  treeDark: '#2e5226',
  ring: '#ffb52e',
  ringGlow: '#ffe9a8',
  panel: '#10161f',
  panelEdge: '#2c3846',
  gaugeFace: '#e8eef2',
  warn: '#ff5340',
  ok: '#7ddb6a',
};
