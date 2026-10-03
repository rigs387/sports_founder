# Development fieldbook

Open [index.html](index.html) directly in a browser. It works offline, without a server, build step, account, or external assets. The dashboard tracks implementation against the GDD and shows the next recommended milestone.

## Keeping it current

`data.js` is the single maintained progress snapshot. `index.html`, `styles.css`, and `dashboard.js` are its presentation. There is no automatic inference from commits or GDD prose, and the browser does not edit project files.

When a feature lands or its scope changes:

1. Update the relevant system's `items` in `data.js`. Each entry is `[status, description]`:
   - `built`: the described behavior is implemented and verified.
   - `partial`: some described behavior exists, but the entry names what remains.
   - `planned`: design intent; not implemented.
2. Update its `summary`, `next`, dependencies, and evidence links if needed. A design-only commit never marks a feature built.
3. Update the `updated` review date and `design` version. Change `verification` only after the corresponding checks actually run; preserve separate dates for unit checks and UI smoke.
4. Add a dated `history` entry, explicitly labeled Built, Design, Review, or Milestone. Keep newest entries first.
5. Revisit `priorities`, the milestone, event count and balance watch items as appropriate. Keep historical measurements dated until replaced by new evidence.
6. Open the dashboard, inspect the changed card, and check filters, details and source links. Refresh the page after editing data.

Each system's status and all checklist counters/bars are derived from its items. A system is Built only when all its listed deliverables are built; Partial if any item is built or partial; otherwise Planned. Checklists have unequal effort, so the board deliberately does not calculate a game-completion percentage. Adding planned scope can increase the denominator without undoing completed work.

The group selector describes roadmap areas, not completion gates. Some later GDD systems have lightweight versions pulled into the core game. The phase strip is an explicitly maintained milestone assessment, not inferred from checklist totals.

Keep stable system IDs: priorities, watch items and dependency buttons refer to them. Source paths are relative to this directory. The original detailed baseline is [the October 2 review](../progress-review-2026-10-02.md).

## Use

- Filter by system status and roadmap area, or search titles and checklist contents.
- Open a card for its concrete implementation checklist, next action, dependencies and sources.
- Follow dependency buttons to related systems. Escape or the close button returns to the board.
- Use the sidebar links and normal page scrolling to browse the roadmap, priorities and journal.
- Print / save PDF prints the currently filtered view. Select All systems, Every area and clear search for the full roadmap.

The board starts with the October 2, 2026 repository review. It is a maintained snapshot, not a live test monitor or release schedule.
