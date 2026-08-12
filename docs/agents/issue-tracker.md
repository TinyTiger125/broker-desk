# Issue Tracker: GitHub

> Historical integration note. GitHub Issues are optional mirrors and
> collaboration surfaces, not the task authority or active progress source.
> Use BACKLOG.md and docs/tasks/ for current local scope, status, acceptance,
> and completion evidence.

Issues, PRDs, triage notes, and agent-ready work items may be mirrored in
GitHub Issues.

Repository remote:

`https://github.com/TinyTiger125/broker-desk.git`

Use the `gh` CLI from the repo root for issue operations.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

When a skill says "publish to the issue tracker", create a GitHub issue.

When a skill says "fetch the relevant ticket", read the GitHub issue and
comments as supplemental context, then reconcile it against the local task
card before acting.

Do not create local markdown issues unless the user explicitly asks to switch away from GitHub Issues.
