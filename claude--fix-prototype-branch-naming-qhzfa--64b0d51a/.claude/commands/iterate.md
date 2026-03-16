# Iterate on an Existing Prototype

Help the user refine or extend an existing mechanic prototype.

## Steps

1. **Find the prototype.** Check if you're already on a prototype branch:
   - If the current branch name contains "prototype", you're already on it —
     skip to step 3.
   - Otherwise, list existing prototype branches:
     `git branch -r | grep prototype`
     If the user specified one (in $ARGUMENTS), use that. Otherwise, show the
     list and ask which one to work on.

2. **Check out the branch:**
   - If you're on a platform-assigned branch (e.g., `claude/...`) that contains
     "prototype" in its name, stay on it.
   - Otherwise: `git checkout prototype/<name>` or the full branch name as
     listed by `git branch -r`.
   - **IMPORTANT:** The branch name must contain the word "prototype" for it
     to appear on the Prototype Library landing page. Both `prototype/<slug>`
     and `claude/prototype-<slug>-<id>` formats work.

3. **Understand the current state.** Read the relevant files to understand what
   was already implemented. Summarize the current mechanic for the user.

4. **Ask what changes they want.** Let the user describe their refinements in
   plain language. Ask follow-up questions if anything is unclear.

5. **Confirm the changes before coding.** Summarize what you'll change in
   plain language. For each change, briefly touch on whichever of these are
   relevant (skip any that don't apply — not every change affects all areas):

   - **Behavior** — How the rules or logic will change
   - **Interaction** — Any changes to how the player taps or interacts
   - **Visuals/sound** — Any appearance, animation, or sound adjustments
   - **Level editor** — Any changes to how the feature appears or is
     configured in the editor

   Keep this short — it's a confirmation, not a full design brief. If the
   user's request is simple and obvious (e.g., "make it faster" or "change
   the color to blue"), you can condense the confirmation to one or two
   sentences. End with: "Sound right?"

6. **Implement the changes** following the same conventions as the original
   prototype (see CLAUDE.md).

7. **Validate:** Run `node --check` on modified JS files.

8. **Commit and push:**
   - `git add` changed files
   - `git commit` with a descriptive message
   - `git push -u origin <current-branch-name>` (use the actual branch you're on)

9. **Share the updated URL** and explain what changed.
