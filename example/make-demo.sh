#!/usr/bin/env bash
# Builds a small demo project with a 10x roadmap and a git history of three milestones,
# so roadmap-preview has something to show (closed milestones come from git history).
#
#   bash example/make-demo.sh [folder]     # default: /tmp/roadmap-demo
#   herdr-app do roadmap-preview.open:/tmp/roadmap-demo
set -euo pipefail
DIR="${1:-/tmp/roadmap-demo}"
rm -rf "$DIR" && mkdir -p "$DIR/context/foundation" && cd "$DIR"
git init -q
git config user.name "Demo" && git config user.email "demo@example.com"
F=context/foundation/roadmap.md

head() { # seq status name id
cat <<EOF
---
project: "Pantry"
version: $1
status: active
created: 2026-09-01
updated: 2026-11-10
prd_version: 2
main_goal: speed
top_blocker: none
milestone_id: $4
milestone_seq: $1
milestone_status: $2
---

# Roadmap: Pantry

## Milestone

**M-$1: $3** — Status: $2

EOF
}

item() { # id title pre status
cat <<EOF
### $1: $2

- **Outcome:** $2.
- **Change ID:** $(echo "$2" | tr 'A-Z ' 'a-z-' | tr -cd 'a-z-')
- **Prerequisites:** $3
- **Status:** $4

EOF
}

# --- M-1 ------------------------------------------------------------------------------------
{
head 1 open "A list the whole household trusts" first-list
cat <<'EOF'
## At a glance

| ID   | Change ID | Outcome (user can …)              | Prerequisites | PRD refs | Status      |
| ---- | --------- | --------------------------------- | ------------- | -------- | ----------- |
| F-01 | accounts  | (foundation) sign in with a link  | —             | NFR-01   | done        |
| F-02 | list-api  | (foundation) store one list       | —             | NFR-02   | done        |
| S-01 | add-item  | add an item                       | F-01, F-02    | FR-001   | done        |
| S-02 | check-off | check an item off                 | S-01          | FR-002   | done        |
| S-03 | quantity  | set a quantity                    | S-01          | FR-003   | done        |
| S-04 | sort      | sort by aisle                     | S-02          | FR-004   | in-progress |
| S-05 | history   | see what was bought last week     | S-02          | FR-005   | done        |
| S-06 | share     | invite a second person            | F-01          | FR-006   | done        |

## Foundations

EOF
item F-01 "Sign in with a magic link" "—" done
item F-02 "One list stored on the server" "—" done
echo "## Slices"; echo
item S-01 "Add an item" "F-01, F-02" done
item S-02 "Check an item off" "S-01" done
item S-03 "Set a quantity" "S-01" done
item S-04 "Sort by aisle" "S-02" in-progress
item S-05 "See what was bought last week" "S-02" done
item S-06 "Invite a second person" "F-01" done
printf '## Milestone History\n\n(Append-only.)\n'
} > $F
git add -A && git commit -qm "Roadmap: M-1"

# --- M-2 ------------------------------------------------------------------------------------
M1='- **M-1: A list the whole household trusts** (`first-list`) — closed 2026-10-04. F-01, F-02 and S-01…S-06 built.'
{
head 2 open "Recipes that fill the list" recipes
cat <<'EOF'
## At a glance

| ID   | Change ID     | Outcome (user can …)              | Prerequisites | PRD refs | Status |
| ---- | ------------- | --------------------------------- | ------------- | -------- | ------ |
| F-03 | recipe-store  | (foundation) store recipes        | —             | NFR-03   | done   |
| S-07 | paste-recipe  | paste a recipe link               | F-03          | FR-010   | done   |
| S-08 | to-list       | send a recipe to the list         | S-07          | FR-011   | done   |
| S-09 | scale         | scale a recipe for more people    | S-08          | FR-012   | done   |
| S-10 | merge         | merge duplicates on the list      | S-08          | FR-013   | done   |
| S-11 | week-plan     | plan the week's dinners           | S-08          | FR-014   | parked |
| S-12 | pantry-check  | skip what is already at home      | S-10          | FR-015   | done   |

## Foundations

EOF
item F-03 "Recipes stored with their ingredients" "—" done
echo "## Slices"; echo
item S-07 "Paste a recipe link" "F-03" done
item S-08 "Send a recipe to the list" "S-07" done
item S-09 "Scale a recipe for more people" "S-08" done
item S-10 "Merge duplicates on the list" "S-08" done
item S-11 "Plan the week's dinners" "S-08" parked
item S-12 "Skip what is already at home" "S-10" done
printf '## Milestone History\n\n%s\n' "$M1"
} > $F
git add -A && git commit -qm "Roadmap: M-2"

# --- M-3 (open) and M-4 (queued) -------------------------------------------------------------
M2='- **M-2: Recipes that fill the list** (`recipes`) — closed 2026-10-28. F-03 and S-07…S-12 built; S-11 parked.'
{
head 3 open "Shopping together in the shop" shop-together
cat <<'EOF'
## At a glance

| ID   | Change ID      | Outcome (user can …)                    | Prerequisites | PRD refs | Status      |
| ---- | -------------- | --------------------------------------- | ------------- | -------- | ----------- |
| F-04 | live-sync      | (foundation) sync the list live         | —             | NFR-04   | done        |
| S-13 | live-list      | see the list change on every phone      | F-04          | FR-020   | done        |
| S-14 | offline        | check items off without signal          | S-13          | FR-021   | in-progress |
| S-15 | undo           | undo a checked item                     | S-14          | FR-022   | proposed    |
| S-16 | split          | split the list between two people       | S-14, S-17    | FR-023   | proposed    |
| S-17 | who-took-it    | see who took an item                    | F-04          | FR-024   | ready       |
| S-18 | barcode        | add an item by scanning its barcode     | —             | FR-025   | in-progress |
| S-19 | receipt        | snap the receipt when done              | —             | FR-026   | ready       |

## Foundations

EOF
item F-04 "Live sync between phones" "—" done
echo "## Slices"; echo
item S-13 "See the list change on every phone" "F-04" done
item S-14 "Check items off without signal" "S-13" "in-progress (claude, phase 2 of 3)"
item S-15 "Undo a checked item" "S-14" proposed
item S-16 "Split the list between two people" "S-14, S-17" proposed
item S-17 "See who took an item" "F-04" ready
item S-18 "Add an item by scanning its barcode" "—" "done (archived 2026-11-09)"
item S-19 "Snap the receipt when done" "—" ready
cat <<'EOF'
## Slices of M-4 (queued)

EOF
item S-20 "Prices per shop" "—" proposed
item S-21 "Monthly spend" "S-20" proposed
item S-22 "Cheapest shop for this list" "S-20" proposed
printf '## Milestone History\n\n%s\n%s\n' "$M1" "$M2"
} > $F
git add -A && git commit -qm "Roadmap: M-3"
echo "Demo project: $DIR"
