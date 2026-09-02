// ============================================================
// config.js — Global state, constants, colors, calibration
// ============================================================

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var W = 0, H = 0, S = 1;
var L = {};
var beltPath = [];
var stock = [], sortCols = [], particles = [], physMarbles = [], jumpers = [];
var score = 0, won = false, lost = false, tick = 0, hoverIdx = -1;
// Bumped by initGame(). Deferred callbacks capture it so timers left over
// from an abandoned or restarted level can't touch the new one.
var gameGen = 0;

// === BOARD DIMENSIONS ===
// boardCols x boardRows is the logical grid. boardViewRows is how many
// rows of it fit on screen at once — equal to boardRows for normal
// levels, smaller for scrolling-board levels where the grid is a tall
// strip that slides through a fixed window.
var boardCols = 7, boardRows = 7, boardViewRows = 7;
var audioCtx = null;

// === LEVEL SYSTEM ===
var currentLevel = 0;
var LEVELS = [];
var levelStars = [];
var unlockedLevels = 0;
var gameActive = false;

// === PHYSICS ===
var PHYS_GRAVITY = 0.67, PHYS_DAMPING = 0.997, PHYS_BOUNCE = 0.45, PHYS_FRICTION = 0.995;
var MARBLE_R_BASE = 7;
var funnelWalls = [];
// BELT_SPEED_BASE is the calibrated speed; BELT_SPEED is what the game
// runs at, which special levels may scale (see scroller.js).
var BELT_SLOTS = 30, beltSlots = [], beltOffset = 0, BELT_SPEED_BASE = 0.0031, BELT_SPEED = 0.0031;
var LIP_PCT = 0.28;
var MRB_GAP_FACTOR = 0.75;

// === 8 COLORS ===
var CLR_NAMES = ['pink', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal', 'crimson'];
var COLORS = [
  { fill: '#FF4E8C', light: '#FF85B5', dark: '#C73068', glow: 'rgba(255,78,140,0.5)' },
  { fill: '#4A9FFF', light: '#80C0FF', dark: '#2B6FCC', glow: 'rgba(74,159,255,0.5)' },
  { fill: '#4EE68C', light: '#82F0B2', dark: '#2DB866', glow: 'rgba(78,230,140,0.5)' },
  { fill: '#FFB545', light: '#FFD080', dark: '#CC8A1F', glow: 'rgba(255,181,69,0.5)' },
  { fill: '#A66DD4', light: '#C89CF2', dark: '#7B4FA8', glow: 'rgba(166,109,212,0.5)' },
  { fill: '#FF7F50', light: '#FFA885', dark: '#CC5A30', glow: 'rgba(255,127,80,0.5)' },
  { fill: '#4ECDC4', light: '#7EDDD6', dark: '#35A89F', glow: 'rgba(78,205,196,0.5)' },
  { fill: '#E84393', light: '#F28CB1', dark: '#B8326F', glow: 'rgba(232,67,147,0.5)' }
];
var NUM_COLORS = COLORS.length;

// Blocker marble color — index 8, NOT included in NUM_COLORS
var BLOCKER_CI = COLORS.length;
COLORS.push({ fill: '#7A7068', light: '#A89E94', dark: '#4A4440', glow: 'rgba(122,112,104,0.5)' });
var BLOCKER_PER_BOX = 3;

// Blocker tracking state
var totalBlockerMarbles = 0;
var blockersOnBelt = 0;
var blockerCollecting = false;
var blockerCollectT = 0;
var blockerCollectSlots = [];
var blockerCollectCleared = false;

var MRB_PER_BOX = 9, SORT_CAP = 3;
// How close (in belt-loop units) a marble must be to a customer column
// before it jumps in. Special levels widen this to raise throughput.
var SORT_WINDOW_BASE = 0.015, SORT_WINDOW = 0.015;
// How many customers of each column's queue are shown. Special levels
// raise it so the player can read what is coming and plan taps.
var SORT_VISIBLE_ROWS_BASE = 4, SORT_VISIBLE_ROWS = 4;
// How long a served customer stays on screen before the next steps up.
// It is dead time for the column, so levels that need throughput cut it.
var SORT_CLEAR_MS_BASE = 600, SORT_CLEAR_MS = 600;

// Snake order for 3x3 grid
var SNAKE_ORDER = [
  { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 },
  { r: 1, c: 2 }, { r: 1, c: 1 }, { r: 1, c: 0 },
  { r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }
];

// === CALIBRATION ===
var cal = {
  stock:  { dx: -1, dy: 93, s: 0.89 },
  funnel: { dx: 0, dy: -54, sw: 1.03, sh: 0.65 },
  belt:   { dx: 0, dy: 24, sw: 0.80, sh: 1.33 },
  sort:   { dx: 0, dy: -7, s: 0.96 },
  marble: { s: 1.37 },
  back:   { dx: -23, dy: 85, s: 1.0 }
};

// Where marble #i sits inside a box. The snake fills a 3x3 grid, but a
// box holding one or two marbles should read centred rather than
// stranded in a corner.
function getMrbSlot(i) {
  if (MRB_PER_BOX === 1) return SNAKE_ORDER[4];
  if (MRB_PER_BOX === 2) return i === 0 ? SNAKE_ORDER[3] : SNAKE_ORDER[5];
  if (MRB_PER_BOX === 3) return SNAKE_ORDER[3 + Math.min(i, 2)];
  // The snake only has nine cells; boxes holding more wrap around it.
  return SNAKE_ORDER[((i % SNAKE_ORDER.length) + SNAKE_ORDER.length) % SNAKE_ORDER.length];
}

// === HELPERS ===
function getMR() { return MARBLE_R_BASE * S * cal.marble.s; }
function shuffle(arr) { for (var i = arr.length - 1; i > 0; i--) { var j = ~~(Math.random() * (i + 1)); var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; } }
