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

## Wayfinding operations

- A map is one issue labelled `wayfinder:map`.
- Tickets are child issues of that map, labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Add a child with `gh api --method POST repos/<owner>/<repo>/issues/<map>/sub_issues -F sub_issue_id=<child-database-id>`.
- Add a blocker with `gh api --method POST repos/<owner>/<repo>/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker-database-id>`.
- Get an issue's database ID with `gh api repos/<owner>/<repo>/issues/<number> --jq .id`.
- Claim a ticket before work with `gh issue edit <number> --add-assignee @me`.
- The frontier is the map's open, unassigned child tickets with no open blockers.
- Resolve a ticket by commenting with its answer, closing it, then linking its title and one-line answer under the map's `Decisions so far` section.
