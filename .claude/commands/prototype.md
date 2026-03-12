# Prototype a New Mechanic

Guide the user through creating a new game mechanic prototype for Marble Sorter.

## Steps

1. **Understand the mechanic.** Ask the user to describe what they want. If they
   already described it (in $ARGUMENTS), proceed with that description.

2. **Confirm the design.** Before coding, briefly explain back what you'll build
   and how it fits into the game (which files you'll create/modify). Keep the
   explanation non-technical. Ask for confirmation before proceeding.

3. **Create a prototype branch:**
   - Generate a short slug from the mechanic name (lowercase, hyphenated, max 40 chars)
   - Run: `git checkout main && git checkout -b prototype/<slug>`

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
   - `git push -u origin prototype/<slug>`

7. **Share the result:**
   - Provide the Netlify preview URL (see CLAUDE.md for the pattern)
   - Explain what was built, which level to select, and how to test the mechanic
   - Use plain, non-technical language

8. **Offer next steps:** Ask if they want to refine anything or try a different mechanic.
