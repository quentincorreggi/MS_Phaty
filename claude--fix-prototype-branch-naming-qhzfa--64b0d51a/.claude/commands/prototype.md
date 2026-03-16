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
   - Check if you are already on a platform-assigned branch (e.g., `claude/...`):
     - **If yes (platform-controlled branch):** You cannot freely name branches.
       Stay on the current branch. Check that the branch name contains the word
       "prototype". If it does NOT, stop and tell the user:
       > "The platform assigned a branch name that doesn't include 'prototype',
       > so this build won't appear on the Prototype Library landing page.
       > To fix this, start a new session and include the word 'prototype' in
       > your request (e.g., 'prototype a magnet box')."
     - **If no (free to create branches):** Run:
       `git checkout main && git checkout -b prototype/<slug>`
   - **WHY THIS MATTERS:** The Prototype Library landing page filters branches
     by checking if the branch name contains the word "prototype". Branches
     without it (like `claude/magnet-box-abc123`) will deploy but won't appear
     on the landing page. Branches like `claude/prototype-magnet-box-abc123`
     or `prototype/magnet-box` will both work.

4. **Implement the mechanic** following the patterns in CLAUDE.md:
   - For new box types: create `js/box_<name>.js`, register it, add `<script>` tag to `index.html`
   - For other mechanics: create new JS file or modify existing ones as needed
   - Follow all conventions: `var` not `const`, global functions, vanilla JS only
   - Add at least one showcase level to the `LEVELS` array in `config.js` that demonstrates the mechanic

5. **Validate the code:**
   - Run `node --check` on each new or modified JS file to catch syntax errors
   - Verify all `<script>` tags are in the correct order in `index.html`

6. **Commit and push:**
   - `git add` all changed/new files
   - `git commit` with a descriptive message
   - `git push -u origin <current-branch-name>` (use the actual branch you're on)

7. **Share the result:**
   - Provide the Netlify preview URL (see CLAUDE.md for the pattern)
   - Explain what was built, which level to select, and how to test the mechanic
   - Use plain, non-technical language

8. **Offer next steps:** Ask if they want to refine anything or try a different mechanic.
