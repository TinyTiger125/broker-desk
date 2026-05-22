# Triage Labels

The engineering skills speak in canonical triage roles. This repo uses the default label strings.

| Skill role | GitHub label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate the issue |
| `needs-info` | `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation or judgment |
| `wontfix` | `wontfix` | Will not be actioned |

Every triaged issue should have exactly one category label and one state label.

Default category labels:

| Skill category | GitHub label | Meaning |
| --- | --- | --- |
| `bug` | `bug` | Something is broken |
| `enhancement` | `enhancement` | New feature or improvement |

If the repo later adopts different GitHub label names, update this file before using `triage`, `to-issues`, or `to-prd`.
