# Share a Prototype

Package the current prototype for sharing with the team via the Prototype
Library landing page.

## Steps

1. **Check the branch.** Verify you're on a `prototype/` branch. If not, warn
   the user — only `prototype/` branches appear on the landing page.

2. **Ask for the showcase level.** Ask the user to paste their showcase level
   JSON. They can get this from the level editor's **Export** button (which
   copies the level JSON to their clipboard). If $ARGUMENTS contains JSON,
   use that directly.

3. **Read the codebase.** Look at the current branch's code to understand
   what mechanic was implemented (check `js/box_*.js`, `js/*.js`, and recent
   commits).

4. **Propose sharing metadata.** Present the user with:
   - **Author** — Ask who should be credited. Use their name or GitHub
     username. If they don't specify, use the current git user name
     (`git config user.name`).
   - **Name** — A short, human-friendly name for the mechanic (2-4 words)
   - **Description** — One or two plain-language sentences explaining what
     this mechanic does
   - **How to play** — Brief instructions: how to place it in the editor and
     how to interact with it during gameplay

   Keep it non-technical and concise. Ask: "Does this look right, or would
   you like to adjust anything?"

5. **Generate `prototype.json`.** Create (or update) the file at the repo root:
   ```json
   {
     "name": "Mechanic Name",
     "author": "Author Name",
     "description": "What this mechanic does.",
     "howToPlay": "How to use it in the editor and during gameplay.",
     "showcaseLevel": { ...the pasted level JSON object... }
   }
   ```

6. **Validate:** Run `node --check` on any modified JS files.

7. **Commit and push:**
   - `git add prototype.json` (and any other changed files)
   - `git commit` with message like "Add sharing metadata for <mechanic>"
   - `git push -u origin prototype/<slug>`

8. **Share the result.** Provide the user with:
   - The **Prototype Library** URL: `https://quentincorreggi.github.io/MS_Phaty/`
     — their prototype will appear as a card with the name, description, and
     a "Play Showcase" button once the deploy completes (30-60 seconds).
   - The **direct showcase URL**: the GitHub Pages preview URL with
     `?showcase=1` appended — this opens the game and auto-loads the showcase
     level so anyone can play it in one click.
   - Remind them: "Share either link with the team — the landing page shows
     your description and lets anyone play the showcase level directly."
