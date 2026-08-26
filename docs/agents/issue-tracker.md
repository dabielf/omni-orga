# Issue tracker: GitHub

Issues and project plans live in GitHub Issues. Use the `gh` command.

## Main commands

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Add a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`
- Reopen: `gh issue reopen <number>`

Use the GitHub repo from `git remote -v`.

## Pull requests as requests

PRs as a request surface: no.

## Skill wording

When a skill says "publish to the issue tracker", create a GitHub issue.

When a skill says "fetch the relevant ticket", run:

`gh issue view <number> --comments`
