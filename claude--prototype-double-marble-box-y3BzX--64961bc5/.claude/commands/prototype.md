# Prototype a New Mechanic

Guide the user through creating a new game mechanic prototype for Marble Sorter.

## Steps

1. **Understand the mechanic.** Ask the user to describe what they want. If they
   already described it (in $ARGUMENTS), proceed with that description.

2. **Propose a design brief.** Before writing any code, present the user with
   a short plain-language description of what you plan to build. Cover these
   four areas naturally (don't use a rigid numbered checklist — weave them
   into a readable narrative):

   - **How it works** — The core rules and behavior. What happens when the
     player encounters this mechanic? What are the edge cases (e.g., what
     happens if it interacts with ice boxes, blockers, tunnels, or walls)?
     Propose sensible defaults for anything the user didn't specify.

   - **How the player uses it** — The interaction model. Is it tap-based
     like regular boxes? Does it require timing, multiple taps, dragging, or
     something else? If it changes how existing interactions work (e.g.,
     marbles behave differently on the belt), explain that.

   - **What it looks and sounds like** — Visual appearance on the grid (color,
     shape, icon, animation). What happens visually when the mechanic
     activates (particles, glow, shake, etc.)? Any sound effects? Propose
     specific colors and effects — the user can adjust these later.

   - **How it appears in the level editor** — What toolbar button or mode is
     added? What color/icon represents it? Can the user configure it (e.g.,
     set a timer duration, choose a target color)? If the mechanic uses the
     existing box type registry, it auto-appears in the toolbar — mention
     this so the user knows.

   End by asking: "Does this match what you had in mind? Feel free to change
   anything — or just say 'go for it' and I'll start building."

   **Important:** Propose concrete defaults for every dimension rather than
   asking open-ended questions. The user should be able to approve the whole
   design with a single response.

3. **Create a prototype branch:**
   - Generate a short slug from the mechanic name (lowercase, hyphenated, max 40 chars)
   - Run: `git checkout main && git checkout -b prototype/<slug>`
   - **IMPORTANT:** The branch MUST use the `prototype/` prefix. This is required
     for the prototype to appear on the Prototype Library landing page at the
     GitHub Pages root. Do NOT use `claude/` or any other prefix.

4. **Implement the mechanic** following the patterns in CLAUDE.md:
   - For new box types: create `js/box_<name>.js` with `registerBoxType()` and all
     needed lifecycle hooks (`defaultState`, `onTap`, `onAdjacentTap`, `updateBox`,
     `drawOverlay`, etc.). Add a `<script>` tag to `index.html` AFTER `mechanics.js`
     and BEFORE `calibration.js`. **Do NOT edit game.js, config.js, or rendering.js**
     — the hook system handles dispatch automatically.
   - For game-wide mechanics (belt effects, grid-wide events): use
     `registerMechanic()` with `init`, `update`, `render`, and/or `onTap` hooks.
     See `js/box_blocker.js` for a reference that registers both a box type and a mechanic.
   - Follow all conventions: `var` not `const`, global functions, vanilla JS only
   - The new box type auto-appears in the level editor toolbar — no editor changes needed

5. **Validate the code:**
   - Run `node --check` on each new or modified JS file to catch syntax errors
   - Verify all `<script>` tags are in the correct order in `index.html`

6. **Commit and push:**
   - `git add` all changed/new files
   - `git commit` with a descriptive message
   - `git push -u origin prototype/<slug>`

7. **Share the result:**
   - Construct the GitHub Pages preview URL (see CLAUDE.md for the pattern)
   - Tell the user to open the Level Editor, place boxes using the new type, and
     hit "Test Play" to try it out
   - Use plain, non-technical language

8. **Offer next steps:** Ask if they want to refine anything or try a different mechanic.
