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
| `js/registry.js` | Box type registration system (`registerBoxType`/`getBoxType`) | 32 |
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
| `js/scroller.js` | Scrolling Board special level — tall board, pressure line, gravity-up | 900 |
| `js/editor.js` | Level editor UI — grid painting, toolbar, import/export JSON | 653 |
| `js/particles.js` | Particle effects (bursts, confetti) | 42 |
| `js/audio.js` | Sound effects via Web Audio API | 62 |
| `js/calibration.js` | Dev calibration panel (slider offsets) | 47 |

### Script Load Order (matters!)

Scripts load in `index.html` in this exact order. New files must go in the
correct position:

1. `config.js` — globals and constants (must be first)
2. `registry.js` — box type registration system
3. `box_*.js` — box type implementations (register themselves on load)
4. `calibration.js`, `audio.js`, `particles.js` — utilities
5. `layout.js` — layout computation
6. `belt.js` — belt helpers
7. `physics.js` — marble physics
8. `tunnel.js` — tunnel mechanic
9. `wall.js` — wall mechanic
10. `scroller.js` — scrolling board special level
11. `rendering.js` — all drawing code
12. `editor.js` — level editor
13. `game.js` — game loop, init, boot (must be last)

**Rule: New box type files go AFTER `registry.js` and BEFORE `calibration.js`.**
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
Each box type must implement:

```js
registerBoxType('yourtype', {
  label: 'Display Name',        // shown in editor toolbar
  editorColor: '#hexcolor',     // button color in editor
  drawClosed: function(ctx, x, y, w, h, ci, S, tick, idlePhase) { ... },
  drawReveal: function(ctx, x, y, w, h, ci, S, phase, remaining, tick) { ... },
  editorCellStyle: function(ci) { return { background: '...', borderColor: '...' }; },
  editorCellHTML: function(ci) { return '<span>...</span>'; }
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

#### Game Flow

1. Player sees 7x7 grid of boxes (some revealed, some hidden)
2. Tap a revealed box → marbles spawn with physics into funnel
3. Marbles fall through funnel onto conveyor belt
4. Belt carries marbles around; when a marble passes its matching sort column, it jumps in
5. Fill a sort column → it clears. Clear all → win

#### How a Box Tap Works

`handleTap()` in game.js → `spawnPhysMarbles()` in physics.js:
1. Checks `isBoxTappable(i)` — revealed, not ice-locked, not already spawning
2. Calls `spawnPhysMarbles(box)` — spawns `MRB_PER_BOX` marbles with physics
3. Calls `damageAdjacentIce(i)` — ice mechanic interaction
4. Box becomes `used=true` after all marbles spawn
5. `updateBoxReveals(true)` re-evaluates every box's revealed state — a box is
   open iff there is a path of passable cells (empty slots or used-up
   boxes) from its position to below the bottom edge of the grid. Walls,
   active boxes, and tunnels (including depleted ones) all block the path.
   Boxes whose path just opened become revealed; boxes whose path just
   closed (e.g. from a tunnel spawning a new box into a previously-empty
   cell) close themselves.

#### Level Data Format

Levels are created via the level editor and played via "Test Play". There are
no pre-built levels — the `LEVELS` array is empty at startup. A level's `grid`
is `cols * rows` cells (default 7x7; `cols`/`rows` on the level override it).
Each cell is:
- `null` — empty slot
- `{ ci: 0-7, type: 'default'|'hidden'|'ice'|'blocker' }` — box
- `{ tunnel: true, dir: 'top'|'bottom'|'left'|'right', contents: [{ci, type}...] }` — tunnel
- `{ wall: true }` — wall

## Special Level: Scrolling Board

A level with a `scroller` block plays as a tall board that slides down through
a fixed window toward a *pressure line* just above the funnel. See
`js/scroller.js` for the full contract. In short:

- The grid is authored top-to-bottom: **row 0 is the END of the board**
  (arrives last), the **last row is the START** (nearest the line at kickoff).
- Tapping a box releases **only that box** (`release: 'single'`, the
  default). `'adjacent'` also takes its same-coloured neighbours and
  `'group'` the whole connected blob — note that colour adjacency, and so
  the whole "free chain" idea, only means anything under those two.
- Cleared cells become holes and the boxes below **rise** into them
  (`gravity: 'column'` or `'group'`), pulling the stack away from the line.
  Under per-column gravity every vertical gap collapses at load, so an empty
  cell doesn't make a hole — it just makes that column one box shorter, and
  uneven columns start the stack ragged and floating. Author dense.
- A box that sinks past the line **crumbles** and dumps its marbles
  uncontrolled.
- **Win**: the end of the board crosses the line. **Lose**: the conveyor
  overflows — `loadCap` (belt slots + marbles backed up in the funnel)
  exceeded for `jamFuse` frames. That is the single fail state.
- Two scroll variants share one board: `mode: 'tap'` and `mode: 'auto'`. The
  HUD pill swaps them mid-run. In the tap variant `idleDrift` is **0**: the
  board moves only when the player taps, and stopping tapping stops the
  level dead. That is the freeze risk the design brief flagged, accepted
  deliberately in exchange for a board that never moves behind your back;
  raise `idleDrift` to trade back. The one thing that still moves the board
  on its own is the soft-lock breaker, which fires only when there is no
  box the player could tap at all (the stack has compacted above the
  window), because otherwise nothing could ever start it again.

### Why this mode needs its own plumbing

Boxes still hold a full 9 marbles, and the conveyor only sorts about six a
second — so a single tap is already 1.5 seconds of conveyor, and a group
release under `'adjacent'` or `'group'` is 20-45 marbles. Everything below exists because
of that ratio, and all of it is off by default on normal levels:

- **The line refuses what it can't take.** A release that would push the
  projected load past `tapBlockLoad` is turned away and the boxes rattle
  instead of opening. Without it a player buries themselves in three taps
  with no warning. Keep `tapBlockLoad` at least one full group
  (5 x `mrbPerBox`) below `loadCap`, so a legal tap can never breach the cap
  on its own and crumbling rows stay the real threat.
- **Customers take orders as they go** (`scrollerAssignCustomers`). A tapped
  group is monochrome, so one tap drops 27 marbles of a single colour. With
  fixed pre-dealt queues only the one column holding that colour could drain
  them. Columns are therefore dealt empty and each head picks a colour when
  it becomes the head, weighted by what is actually **on the belt** — funnel
  marbles count far less, because a colour stuck behind a full belt can never
  be served and every column waiting on it deadlocks. A part-filled head
  keeps its order; if that ever starves the whole line, the least-served
  customer gives up and leaves.
- **The conveyor is faster and more forgiving**: `beltSpeed` scales
  `BELT_SPEED`, `sortWindow` widens the customer hand-off, `funnelWiden`
  opens the funnel mouth (a hole under two marbles wide arches over and jams
  under a 30-marble dump).
- `scrollerFlushDeadCustomers` retires customers whose colour has run out, so
  a generated board doesn't need each colour to divide evenly by the sort cap.

Two general physics fixes came out of this and apply to every level: marbles
squeezed through a funnel wall used to fall out of the world and stay in the
simulation forever, and the corner where the funnel wall meets the floor is a
wedge a marble cannot roll out of. `physicsStep` now rescues both.

**Board length is capped by marble count, not taste.** 7x16 boxes at 9 marbles
each is ~1000 marbles, which is about three minutes of conveyor no matter how
it is played. Want a longer board, use fewer marbles per box.

Everything above is exposed in the level editor under **Special: Scrolling
Board**, including a generator for the middle of a board.

## How to Add a New Box Type

1. Create `js/box_<name>.js`
2. Call `registerBoxType('<name>', { ... })` with all required methods + label + editorColor
3. Add `<script src="js/box_<name>.js"></script>` to `index.html` AFTER the other `box_*.js` and BEFORE `calibration.js`
4. If the box needs special game logic (like ice needs `damageAdjacentIce`), add that to `game.js`
5. If the box needs custom state on stock objects, initialize it in `initGame()` where stock objects are created
6. The registry auto-adds new types to the editor toolbar

Reference implementation for complex box types: `js/box_ice.js`

## How to Add an Entirely New Mechanic

For mechanics beyond box types (power-up marbles, new belt behaviors, grid effects):

1. Create a new JS file (e.g., `js/yourmechanic.js`)
2. Add the `<script>` tag in `index.html` AFTER `belt.js` and BEFORE `rendering.js`
3. Hook into the game loop: add update logic in `game.js` `update()` function
4. Hook into rendering: add draw calls in `game.js` `frame()` or extend `rendering.js`
5. Hook into input if needed: extend `handleTap()` in `game.js`
6. Add any new global state variables to `config.js`

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

**IMPORTANT:** The SHA MUST be exactly 8 characters. Using 7 characters (the
git default) will produce a 404. Always use `--short=8` — never omit the
length argument.

Examples:
- `prototype/magnet-box` at commit `abc12345` → `https://quentincorreggi.github.io/MS_Phaty/prototype--magnet-box--abc12345/`
- `claude/my-feature-abc123` at commit `deadbeef` → `https://quentincorreggi.github.io/MS_Phaty/claude--my-feature-abc123--deadbeef/`

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

All branches (except `main`) will appear on the landing page.

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
