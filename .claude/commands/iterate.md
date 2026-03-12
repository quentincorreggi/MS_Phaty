# Iterate on an Existing Prototype

Help the user refine or extend an existing mechanic prototype.

## Steps

1. **Find the prototype.** List existing prototype branches:
   `git branch -r | grep prototype`
   If the user specified one (in $ARGUMENTS), use that. Otherwise, show the
   list and ask which one to work on.

2. **Check out the branch:**
   `git checkout prototype/<name>`

3. **Understand the current state.** Read the relevant files to understand what
   was already implemented. Summarize the current mechanic for the user.

4. **Ask what changes they want.** Let the user describe their refinements in
   plain language.

5. **Implement the changes** following the same conventions as the original
   prototype (see CLAUDE.md).

6. **Validate:** Run `node --check` on modified JS files.

7. **Commit and push:**
   - `git add` changed files
   - `git commit` with a descriptive message
   - `git push -u origin prototype/<name>`

8. **Share the updated URL** and explain what changed.
