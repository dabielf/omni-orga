# Omni-orga design set

Design only. No app code changes.

The editable file is [omni-orga-design-proposal.pen](../omni-orga-design-proposal.pen). Start with **Start here / Design coverage** in Pen.

- 28 full screens: 14 desktop/phone pairs.
- 90 distinct state cases, each rendered at desktop and phone widths, across 24 state boards.
- [Full-screen PDF](views/export.pdf)
- [State-library PDF](states/export.pdf)

## Reading the canvas

Full-screen pairs are on the left. State boards are on the right, grouped by area. State labels and behavior notes sit outside the product examples. The examples are static, not clickable prototypes. Long-content scrolling and keyboard behavior are specified rather than simulated.

## Design decisions beyond the current UI

Visible phone navigation; inline validation and save feedback; per-task keep/relink/archive choices during goal removal; a warning before deleting any subtask tree; calendar cells show task counts with a full day list. These are proposed UI changes, not claims about current app behavior.

The current app permits future scheduling for blocked tasks, but not Today. This is retained and called out in D03 and C06. Stats keep period totals separate from all-time goal progress. Only active top-level goals get individual Stats sections.

## Full screens

1. Today (jJ2Nh, Kijmr)
2. Tasks (AmukE, F59B5Q)
3. Goals active (V6HjU, egrcz)
4. Goal detail (m9mvCU, wOskm)
5. Ongoing goal (Gms4X, PwnoB)
6. Calendar (LtOeI, HfmJC)
7. Stats (hufq0, KAfpG)
8. New task (sIKvV, XEPhh)
9. Task detail (i1RFT, akJHk)
10. New goal (k9e1EW, l4yxs)
11. Tasks Completed (BbhNe, Sxwds)
12. Tasks Archived (r7NHoj, fA9s6)
13. Goals Archived (Yyjx3, x6v4oY)
14. Calendar move (T34CU, hq1QU)

## State coverage

### Today

Source: src/components/TodayPage.tsx

| Case | State | Behavior |
| --- | --- | --- |
| T01 | Nothing planned | Creation stays in Tasks. No automatic suggestions or carry-over. |
| T02 | All planned tasks completed | Completed rows remain visible. Their check controls undo completion. |
| T03 | Open work with no completions | A single open task has no reorder hint. |
| T04 | Coverage without priority goals | No new priority goals are chosen automatically. |
| T05 | Partial and full coverage | Names link to available tasks for that goal. With all covered, the second group says None. |
| T06 | Long-press reorder | Hold for 350 ms. A visible insertion line marks the drop. Cancel restores the original order. No reorder buttons. |
| T07 | Task leaves Today | A newly blocked or unplanned task leaves without replacement. A new day clears stale plans quietly. |
| T08 | Complete or reorder failed | Keep the last confirmed order and completion state. No success feedback on failure. |

### Task lists

Source: src/components/TaskList.tsx; src/components/TasksRail.tsx; src/components/TasksFilters.tsx

| Case | State | Behavior |
| --- | --- | --- |
| L01 | First use | No tasks yet. |
| L02 | Filters have no matches | Also use for All with no matching tasks. Keep the chosen filters visible. |
| L03 | Available tasks with ancestry | Blocked parents are excluded. Show the parent path for available subtasks. |
| L04 | Collapsed and expanded task trees | Expand and collapse without losing list filters. A blocked task has no active complete control. |
| L05 | Completed tasks | Click the completion control to reopen. No scheduling controls in history. |
| L06 | Archived tasks | Restore returns the task tree. Offer Undo after restoration. |
| L07 | Empty history | Archived uses the same empty layout with No archived tasks. |
| L08 | Views menu | Use on phone. The chosen goal or view stays visible above the list. |
| L09 | Ideal date filter | Available is an independent filter. Switching a goal keeps the date and availability filters. |
| L10 | Long titles and several goals | Wrap the name. Keep the action reachable. Goal overflow opens the full links in the task sheet. |
| L11 | No archived tasks | No archived tasks. |
| L12 | Goal-scoped task list | The selected goal is the heading. Priority goals can combine several goals; No goal shows unlinked tasks. |

### Task forms

Source: src/components/TaskSheet.tsx

| Case | State | Behavior |
| --- | --- | --- |
| F01 | New task, more options open | More options contains dates, repeatable, notes and links. Add to Today starts unchecked. |
| F02 | Missing task name | Focus the name. Close and Cancel work even while the form is invalid. |
| F03 | Invalid URL | Keep the entered text. Add one URL at a time. |
| F04 | Goal picker and linked goals | Offer active goals only. Inherited goal links in a subtask cannot be changed here. |
| F05 | Task notes and links | Notes save after editing. Existing raw URLs can be opened or removed. |
| F06 | Draft recovered after closing | Close, Escape and outside click keep the draft in this session. Cancel or successful creation clears it. |
| F07 | Blocked parent and nested subtasks | Subtask trees can continue at any depth. A completed child does not complete its parent. |
| F08 | Add or rename a subtask | Enter adds or finishes renaming. Escape cancels adding. Keep the parent context visible. |
| F09 | Read a completed task | Scheduling is absent. Reopen restores the same task and links. |
| F10 | Read an archived task | Do not offer completion or new subtasks while archived. |
| F11 | Repeatable task completed | The fresh copy is unplanned, has no dates, and keeps the task tree. Previous completion stays in history. |
| F12 | Earlier repeatable undo blocked | Keep history unchanged. Link to the latest copy if available. |
| F13 | Delete subtask warning | Required before deleting a task tree, including nested subtasks. |
| F14 | Task name or notes save failed | Show Saving, Saved and failed states. Retain edits until retry succeeds; closing keeps the failed edit recoverable. |
| F15 | Fresh repeatable copy | The new copy is available immediately. Subtasks are reset. Notes and links are kept. |
| F16 | Task completed with undo | Ordinary completion reopens the same task on undo. Successful restoration uses Task restored with Undo. |

### Dates and scheduling

Source: src/components/ScheduleMenu.tsx; src/components/CalendarPage.tsx; CONTEXT.md

| Case | State | Behavior |
| --- | --- | --- |
| D01 | Schedule an available task | Use the platform date picker. Choosing a day saves it. |
| D02 | Reschedule or remove a day | Moving replaces the existing day. Removing returns the task to Not planned. |
| D03 | Blocked task scheduling | Current app allows a future day for a blocked task. It leaves the plan if still blocked when that day arrives. |
| D04 | After deadline disabled | Show 14 choices, 6–19 September. Dates after 10 September cannot be chosen. |
| D05 | Overdue task remains actionable | Use text and a warning icon. An overdue task may be planned for a future day. |
| D06 | Soft date passed | No overdue warning or urgency colour for a passed ideal date. |
| D07 | Date type replaced with undo | A task has an ideal date or a deadline, never both. Undo restores the previous date. |
| D08 | Date conflicts with parent | Apply the same limit to scheduling a subtask. Preserve all other edits. |

### Goal states

Source: src/components/GoalList.tsx; src/components/GoalDetail.tsx; src/components/GoalSheet.tsx

| Case | State | Behavior |
| --- | --- | --- |
| G01 | First use | No goals yet. |
| G02 | Archived goals | Restore keeps the goal tree and history. |
| G03 | No archived goals | No archived goals. |
| G04 | Ongoing goal detail | Ongoing goals have no Complete action. Delete remains in the danger actions. |
| G05 | One-shot goal with no linked tasks | No empty progress bar. Completing the goal is still a deliberate action. |
| G06 | Priority limit reached | Count active goals and subgoals together. Priority does not pass to children. |
| G07 | Move goal | Only valid parents are offered. A subgoal can return to top level. |
| G08 | Invalid goal parent or type | No third level, inactive parent, self-parent or move into descendants. |
| G09 | Missing goal name | Shown in the state example. |
| G10 | Goal reordered | Long-press reorders siblings. Reparenting happens through Move, not an ambiguous drop. |
| G11 | Goal completion blocked | Complete or archive active subgoals first. |
| G12 | Completed and archived detail | Archived detail shows Restore in place of Reopen. Priority is unavailable while inactive. |
| G13 | Archived goal detail | Do not offer priority, completion or new subgoals while archived. |
| G14 | Goal type choices | Parent choices include Top level and eligible top-level goals. Incompatible parents are unavailable with a reason. |
| G15 | Collapsed goal hierarchy | Expand Writing to show Publish the guide. Priority on the parent does not apply to the subgoal. |

### Goal lifecycle

Source: CONTEXT.md; src/domain/store.ts; src/components/GoalDetail.tsx

| Case | State | Behavior |
| --- | --- | --- |
| R01 | Complete a goal, keep tasks | Each task defaults to Keep active. Completed history keeps its goal link. |
| R02 | Archive goal and handle tasks | Archiving is reversible. Never delete linked tasks as a side effect. |
| R03 | Delete a goal tree | Deletes this goal, its subgoal and their goal history. Linked tasks are not deleted. This cannot be undone. |
| R04 | Choose a task outcome | This choice applies to this task only. Other linked tasks keep their own choice. |
| R05 | Relink before goal removal | Show active replacement goals outside the removed goal tree. |
| R06 | Goal completed, undo | Undo restores the goal and task states changed by completion. |
| R07 | Goal archived, restore | Restoration returns the goal tree and preserves history. |
| R08 | Removal failed | Keep all per-task choices. Do not show partial success. |

### Calendar states

Source: src/components/CalendarPage.tsx; src/lib/calendarView.ts

| Case | State | Behavior |
| --- | --- | --- |
| C01 | No day selected | Five complete weeks start on Monday. Today has an outline; selected day has mint fill. |
| C02 | Selected day with no tasks | Choose from Not planned. Creating a task stays in Tasks. |
| C03 | Selected day, full list | Phone opens the full day list from View tasks. Show all tasks, not just the cell preview. |
| C04 | Busy day | The grid shows a task count. The day panel lists every task in a scrollable region. |
| C05 | No unplanned tasks | Keep the calendar and selected day visible. |
| C06 | Blocked plan returns to pool | Do not present a blocked pool task as available. Today is disabled; future planning remains possible. |

### Stats states

Source: src/routes/stats.tsx; src/lib/statsView.ts

| Case | State | Behavior |
| --- | --- | --- |
| S01 | No goals | Period controls remain usable. No charts, streaks or empty celebrations. |
| S02 | No completions in period | Period totals may be zero while all-time goal progress remains visible. |
| S03 | 90 days and 12 months | 12 months means 365 days. Only period metrics change; goal totals remain all-time. |
| S04 | Repeatable with zero or one completion | Group earlier names under the same repeatable history. No separate rename count. |
| S05 | One-shot zero and full progress | 100% does not complete a goal. Only the user's Complete goal action does. |

### Shared interaction states

Source: src/routes/__root.tsx; src/components/AppShell.tsx; shared design specification

| Case | State | Behavior |
| --- | --- | --- |
| X01 | Initial loading | Stable shell and content space. No shimmer. Use after a short delay, only while data is unavailable. |
| X02 | Initial load failed | No fabricated empty list when data could not load. |
| X03 | Refresh failed with old data | Keep previously loaded content and current filters visible. |
| X04 | Task or goal missing | Goal variant uses Goal not found and Open Goals. Keep the parent list link. |
| X05 | Unknown route | Minimal page. Browser Back still works. |
| X06 | Saving, saved and retry | Show success only after confirmation. Prevent duplicate submits while saving; keep close available. |
| X07 | Button and focus states | Focus has a 2 px green ring with a 3 px offset. Disabled controls include a reason nearby. |
| X08 | Undo and archive feedback | Notices stay clear of bottom navigation. Pause dismissal while focused or hovered. |
| X09 | Small screen and long content | Wrap text, never the whole page. Sheets scroll within the viewport, with actions and Close reachable. |
| X10 | Sheet keyboard and close states | Focus enters the sheet and stays inside. Escape closes. Return focus to the trigger. Reduced motion removes decorative transitions. |
| X11 | Goal not found | This goal does not exist. |
| X12 | Creation succeeded | Close the form and show the item in its list. Goal creation uses Goal created. No success message before the save succeeds. |

## Review status

Checked all 54 root frames: no clipped layers or overlapping frames. All 90 state cases are present, with no unfinished placeholders. Reviewed screen and state screenshots, text and control contrast, and coverage against the current product rules and source. Darkened 78 input borders to meet 3:1 contrast. Saved the Pen file and exported PDFs with 28 screen pages and 24 state-board pages; rendered sample pages from both exports and checked them visually. No app source files changed. No browser or app interaction tests are implied by these static designs.
