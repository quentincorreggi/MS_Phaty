# Marble Sorter — AI Prototyping Tool

## Session Behavior

When a user starts a session, greet them warmly and explain that this is the
Marble Sorter prototyping environment. Ask them to describe the game mechanic
they'd like to try. If they're unsure, suggest some ideas:

- A box type that teleports marbles to a random position
- A "bomb" box that destroys adjacent boxes when tapped
- Marbles that split into two when they hit the funnel wall
- A "magnet" sort column that attracts matching marbles faster
- A time-pressure mode where the belt speeds up over time

Always use plain language. The user may not know programming terms.

## Quick Start for Team Members

Just describe your mechanic idea in plain language. For example:
- "I want boxes that explode and destroy adjacent boxes when tapped"
- "Add a power-up marble that clears all marbles of the same color from the belt"
- "Make a box type where marbles bounce back up into the funnel"

Claude will handle the rest: create a branch, write the code, push, and give
you a playable URL.

You can also use these commands:
- `/prototype` — Start a new mechanic prototype from scratch
- `/iterate` — Refine an existing prototype

## Project Architecture

### Tech Stack
- Vanilla JavaScript, HTML5 Canvas, Web Audio API
- No dependencies, no build step — runs directly in browser via `index.html`
- ~3300 lines across 17 JS files

### File Map

| File | Purpose | Lines |
|------|---------|-------|
| `index.html` | Entry point, loads all JS in order, CSS + HTML | 269 |
| `js/config.js` | Global state, constants, COLORS, physics params | 108 |
| `js/registry.js` | Box type registration, `getNeighbors()`, `applyBoxTypeDefaults()` | 60 |
| `js/mechanics.js` | Game-wide mechanic registration (`registerMechanic`) | 33 |
| `js/box_default.js` | Default box — drawClosed, drawReveal, editor hooks | 65 |
| `js/box_hidden.js` | Hidden "?" box — color unknown until revealed | 73 |
| `js/box_ice.js` | Ice box — requires 2 adjacent taps to shatter ice first | 160 |
| `js/box_blocker.js` | Blocker box — spawns neutral gray marbles that jam the belt | 127 |
| `js/game.js` | Game loop, init, update, input handling, win check | 585 |
| `js/physics.js` | Marble physics — gravity, collision, funnel walls, belt entry | 136 |
| `js/rendering.js` | Core drawing — boxes, marbles, funnel, belt, sort area | 469 |
| `js/layout.js` | Layout computation — stock grid, funnel, belt path, sort area | 128 |
| `js/belt.js` | Belt slot init, position helpers (`getSlotPos`, `getSlotT`) | 37 |
| `js/tunnel.js` | Tunnel mechanic — hidden box queue, spawns into adjacent cell | 219 |
| `js/wall.js` | Wall cell — inert structural blocker | 96 |
| `js/editor.js` | Level editor UI — grid painting, toolbar, import/export JSON | 653 |
| `js/particles.js` | Particle effects (bursts, confetti) | 42 |
| `js/audio.js` | Sound effects via Web Audio API | 62 |
| `js/calibration.js` | Dev calibration panel (slider offsets) | 47 |

### Script Load Order (matters!)

Scripts load in `index.html` in this exact order. New files must go in the
correct position:

1. `config.js` — globals and constants (must be first)
2. `registry.js` — box type registration + `getNeighbors()` helper
3. `mechanics.js` — game-wide mechanic registration (`registerMechanic`)
4. `box_*.js` — box type implementations (register themselves on load)
5. `calibration.js`, `audio.js`, `particles.js` — utilities
5. `layout.js` — layout computation
6. `belt.js` — belt helpers
7. `physics.js` — marble physics
8. `tunnel.js` — tunnel mechanic
9. `wall.js` — wall mechanic
10. `rendering.js` — all drawing code
11. `editor.js` — level editor
12. `game.js` — game loop, init, boot (must be last)

**Rule: New box type files go AFTER `mechanics.js` and BEFORE `calibration.js`.**
**Rule: New mechanic files go AFTER `belt.js` and BEFORE `rendering.js`.**

### Key Patterns

#### Global State

All game state lives in global variables declared in `config.js`:
- `stock[]` — the 7x7 grid of box objects
- `physMarbles[]` — active physics marbles in the funnel
- `beltSlots[]` — marbles on the conveyor belt (30 slots)
- `sortCols[]` — the 4 sorting columns at the bottom
- `jumpers[]` — marbles animating from belt to sort
- `particles[]` — visual effects
- `L` — layout measurements (computed by `computeLayout()`)
- `S` — global scale factor (`H / 850`)
- `W, H` — canvas width/height
- `tick` — frame counter

#### The Registry Pattern

Box types register via `registerBoxType(id, definition)` in `registry.js`.
Each box type must implement the required methods, and can optionally
implement lifecycle hooks for game logic:

```js
registerBoxType('yourtype', {
  // ── Required ──
  label: 'Display Name',
  editorColor: '#hexcolor',
  drawClosed: function(ctx, x, y, w, h, ci, S, tick, idlePhase) { ... },
  drawReveal: function(ctx, x, y, w, h, ci, S, phase, remaining, tick) { ... },
  editorCellStyle: function(ci) { return { background: '...', borderColor: '...' }; },
  editorCellHTML: function(ci) { return '<span>...</span>'; },

  // ── Optional lifecycle hooks ──
  defaultState: function() { return { myHP: 2 }; },           // merged onto stock objects
  initBox: function(box, ci) { ... },                          // called per box at game init
  isBoxTappable: function(idx, box) { return true; },          // return false to block tap
  onTap: function(idx, box) { ... },                           // return false to skip default spawn
  onAdjacentTap: function(idx, box, tappedIdx) { ... },       // called when neighbor is tapped
  updateBox: function(idx, box, tick) { ... },                 // per-frame update
  drawOverlay: function(ctx, x, y, w, h, box, S, tick) { },   // drawn on top of box
  drawOpenBox: function(ctx, x, y, w, h, box, S, tick) { },   // custom revealed-state rendering
  getMarbleCi: function(box, spawnIdx) { return box.ci; },    // color per spawned marble
  countMarbles: function(box) { return { regular: 9 }; }      // for editor stats
});
```

Parameters:
- `ci` = color index (0-7, maps to `COLORS` array)
- `S` = scale factor
- `phase` = 0..1 animation progress for reveal
- `remaining` = marbles left in box
- `tick` = global frame counter

Drawing helpers available: `drawBox()`, `drawMarble()`, `drawBoxMarbles()`,
`drawBoxLip()`, `rRect()` (from `rendering.js`)

#### The Mechanic Registration Pattern

For game-wide mechanics not tied to a single box type, use
`registerMechanic(id, definition)` in `mechanics.js`:

```js
registerMechanic('yourMechanic', {
  init:    function() { ... },           // called once at game start
  update:  function(tick) { ... },       // called each frame
  render:  function(ctx, phase) { ... }, // 'pre-stock', 'post-belt', 'post-sort'
  onTap:   function(idx, box) { ... }    // return false to consume tap
});
```

#### Game Flow

1. Player sees 7x7 grid of boxes (some revealed, some hidden)
2. Tap a revealed box → marbles spawn with physics into funnel
3. Marbles fall through funnel onto conveyor belt
4. Belt carries marbles around; when a marble passes its matching sort column, it jumps in
5. Fill a sort column → it clears. Clear all → win

#### How a Box Tap Works

`handleTap()` in game.js → lifecycle hooks → `spawnPhysMarbles()`:
1. Checks `isBoxTappable(i)` — calls `bt.isBoxTappable()` hook if present
2. Calls `mech.onTap()` for each registered mechanic (can consume tap)
3. Calls `bt.onTap()` on the box type (return false to skip default spawn)
4. Calls `spawnPhysMarbles(box)` — uses `bt.getMarbleCi()` per marble
5. Calls `nbt.onAdjacentTap()` on each neighbor's box type
6. Box becomes `used=true` after all marbles spawn
7. `revealAroundEmptyCell()` reveals adjacent hidden boxes

#### Level Data Format

Levels are created via the level editor and played via "Test Play". There are
no pre-built levels — the `LEVELS` array is empty at startup. Each cell in a
level's `grid` array (49 = 7x7) is:
- `null` — empty slot
- `{ ci: 0-7, type: 'default'|'hidden'|'ice'|'blocker' }` — box
- `{ tunnel: true, dir: 'top'|'bottom'|'left'|'right', contents: [{ci, type}...] }` — tunnel
- `{ wall: true }` — wall

## How to Add a New Box Type

1. Create `js/box_<name>.js`
2. Call `registerBoxType('<name>', { ... })` with required + optional lifecycle hooks
3. Add `<script src="js/box_<name>.js"></script>` to `index.html` AFTER the other `box_*.js` and BEFORE `calibration.js`
4. That's it! No changes needed to game.js, rendering.js, config.js, etc.

Use lifecycle hooks for all game logic:
- `defaultState()` for custom state (replaces editing `initGame()`)
- `initBox()` for per-box initialization
- `isBoxTappable()` to block tapping (replaces editing `isBoxTappable()`)
- `onTap()` for custom tap behavior
- `onAdjacentTap()` for neighbor interactions (like ice cracking)
- `updateBox()` for per-frame logic (replaces editing `update()`)
- `drawOverlay()` / `drawOpenBox()` for custom rendering
- `getMarbleCi()` for custom marble colors (like blocker's stone marbles)
- `countMarbles()` for editor stat counting

Reference implementations:
- Simple box type: `js/box_default.js`
- Complex box type with state + interactions: `js/box_ice.js`
- Box type + game-wide mechanic: `js/box_blocker.js`

## How to Add an Entirely New Mechanic

For mechanics beyond box types (power-up marbles, new belt behaviors, grid effects):

1. Create a new JS file (e.g., `js/yourmechanic.js`)
2. Add the `<script>` tag in `index.html` AFTER `belt.js` and BEFORE `rendering.js`
3. Call `registerMechanic('name', { init, update, render, onTap })` — no need to edit game.js

Use mechanic hooks:
- `init()` — called at game start (count state from stock, set up globals)
- `update(tick)` — called each frame
- `render(ctx, phase)` — draw at 'pre-stock', 'post-belt', or 'post-sort'
- `onTap(idx, box)` — intercept taps (return false to consume)

Reference: `js/box_blocker.js` registers both a box type and a mechanic.

## Coding Conventions

- Vanilla JS only. No frameworks, no npm, no modules, no classes.
- All functions and variables are global (no module system).
- Use `var` (not `let`/`const`) to match existing code style.
- Canvas drawing uses the global `ctx` and scale factor `S`.
- Colors reference `COLORS[ci]` which has `.fill`, `.light`, `.dark`, `.glow`.
- Animations use timer fields on objects (e.g., `popT`, `shakeT`) that count down each frame.
- Use `function` declarations, not arrow functions.

## Prototyping Workflow

### For Claude: Step-by-step process

1. Understand the mechanic the user wants to prototype
2. Align on the design: present a plain-language design brief covering how
   the mechanic works, how the player interacts with it, what it looks/sounds
   like, and how it appears in the level editor. Propose concrete defaults
   and let the user confirm or adjust before coding. (See `/prototype` command
   for the detailed prompt.)
3. Create a branch: `git checkout main && git checkout -b prototype/<slug>`
4. Implement the mechanic following the patterns above
5. Validate syntax: run `node --check` on each modified/new JS file
6. Commit all changes with a descriptive message
7. Push: `git push -u origin prototype/<slug>`
8. Construct the GitHub Pages preview URL (see below)
9. Share the URL with the user
10. Tell the user to open the Level Editor, place boxes using the new mechanic,
   and hit "Test Play" to try it out

### Getting the Preview URL

Each push is auto-deployed to GitHub Pages via a GitHub Actions workflow.
The URL includes the short commit SHA so it is always unique — no caching issues.

**URL pattern:**
`https://quentincorreggi.github.io/MS_Phaty/<branch-name>--<short-sha>/`

Branch names containing slashes are converted: `/` becomes `--`.
Get the short SHA with: `git rev-parse --short=8 HEAD`

Examples:
- `prototype/magnet-box` at commit `abc12345` → `https://quentincorreggi.github.io/MS_Phaty/prototype--magnet-box--abc12345/`

After pushing, the deploy takes 30-60 seconds. You can construct the URL
immediately without waiting.

Each new push to a branch **replaces** the previous versioned folder, so only
the latest deployment is kept on gh-pages per branch.

To verify the deploy completed, you can optionally check:
```bash
gh run list --workflow=deploy-branch.yml --limit=3
```

**IMPORTANT:** Always replace `/` with `--` in branch names when constructing
the URL.

### Prototype Library Landing Page

All prototypes are automatically listed on the landing page at:

`https://quentincorreggi.github.io/MS_Phaty/`

The landing page reads a `manifest.json` (auto-generated by the deploy
workflow) and displays clickable cards for each prototype. Users can browse
and search all available prototypes from this page.

Any branch whose name contains the word `prototype` will appear on the
landing page. This includes both `prototype/<slug>` branches and
platform-prefixed branches like `claude/prototype-<slug>-<id>`.

### Safety Rules

- **NEVER** commit directly to `main`
- Each prototype is isolated on its own branch
- Keep prototypes self-contained (don't depend on other prototype branches)
- The game must remain playable — always verify `index.html` loads without errors

### Alignment Phase

Before coding any prototype or iteration, confirm alignment with the user on
four dimensions:

1. **Design** — Core rules, behavior, edge cases, interactions with existing
   mechanics (ice, blockers, tunnels, walls)
2. **Interaction** — How the player triggers or uses the feature (tap, timing,
   multiple taps, etc.)
3. **Visuals & Feedback** — Colors, shapes, animations, particles, sound
   effects
4. **Level Editor** — Toolbar appearance, configuration options, placement
   behavior

Always propose specific defaults rather than asking open-ended questions.
The user should be able to approve with a single "go for it" response. Keep
the language plain and non-technical.
