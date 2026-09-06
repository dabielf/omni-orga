# Redesign verification matrix

Inventory baseline: `45e3b040ccb0a5cf6cef91b03953820cedba3aa7`. Scope: [approved 90-case specification](../design-proposal-previews/README.md), [screens](../design-proposal-previews/views/export.pdf), [states](../design-proposal-previews/states/export.pdf).

**Every case is pending.** This is a coverage inventory from inspected source and test assertions, not a record of a combined test run. Feature checks from isolated branches do not prove the merged app. #40 (Today/Tasks) and #44 (shared states) were still in progress when this was prepared.

Gate **V** applies to every row: compare the final rendered desktop and phone state to its Pen/PDF example; record screenshot paths and checked commit. Tests that assert HTML, data, or overflow do not prove visual fidelity. Record exact commands/results for the final build, full suite and smoke run separately.

Evidence IDs below point to existing test names. They cover only the assertions actually present. A listed test plus a remaining check is partial coverage, never automatic sign-off. `P40`/`P44` also require those ticket merges. Blank evidence means no focused automated check was found.

| Case | Approved state | Status | Existing evidence | Remaining check, plus V |
| --- | --- | --- | --- | --- |
| T01 | Nothing planned | P40 | [TS6](#evidence-ts6) | Verify empty layout and only the Tasks return action after #40. |
| T02 | All planned tasks completed | P40 | [TS1](#evidence-ts1) | Seed only completed-today rows; activate each undo control and confirm no open-work hint. |
| T03 | Open work with no completions | P40 | None | Seed one open task and zero completions; ensure no reorder hint or empty Done decoration. |
| T04 | Coverage without priority goals | P40 | None | Seed no priority goals; no automatic choice; check both coverage groups. |
| T05 | Partial and full coverage | P40 | [TS4](#evidence-ts4), [TV1](#evidence-tv1) | Also seed all priorities covered; second group says None; follow each available-task link. |
| T06 | Long-press reorder | P40 | [TD2](#evidence-td2), [TD1](#evidence-td1) | Browser hold 350 ms, drop, Escape/pointercancel; insertion line and original order on cancel. |
| T07 | Task leaves Today | P40 | [TS2](#evidence-ts2), [DM7](#evidence-dm7) | Browser refresh after blocking/unplanning and crossing day boundary; no replacement task. |
| T08 | Complete or reorder failed | P40 | None | Abort complete/reorder writes; inspect confirmed state/order and absence of success notice. |
| L01 | First use | P40 | None | Empty database Tasks layout, New task path and no fabricated content. |
| L02 | Filters have no matches | P40 | [LS9](#evidence-ls9), [LS5](#evidence-ls5) | Browser filter-empty Available and All; selected filters stay visible; return action works. |
| L03 | Available tasks with ancestry | P40 | [LS3](#evidence-ls3), [LV5](#evidence-lv5) | Check wrapped ancestry and blocked exclusion in combined phone layout. |
| L04 | Collapsed and expanded task trees | P40 | [LS1](#evidence-ls1), [LV7](#evidence-lv7) | Expand/collapse in browser without losing filters; blocked complete stays disabled. |
| L05 | Completed tasks | P40 | [LS5](#evidence-ls5) | Reopen completed row through UI; verify scheduling controls absent from history. |
| L06 | Archived tasks | P40 | [DM8](#evidence-dm8), [LS5](#evidence-ls5) | Restore archived task tree through list; activate Undo; verify original archived state. |
| L07 | Empty history | P40 | None | Empty Completed history and empty Archived history must use their own factual labels. |
| L08 | Views menu | P40 | None | Phone Views menu: switch goal/view and keep current scope visible above rows. |
| L09 | Ideal date filter | P40 | [LV6](#evidence-lv6), [UR1](#evidence-ur1) | Switch goal with ideal-date and availability filters both set; preserve both. |
| L10 | Long titles and several goals | P40 | None | Long title and many goal links: wrap, reachable actions, goal overflow opens full links. |
| L11 | No archived tasks | P40 | None | Empty Archived list: No archived tasks, with correct selected history view. |
| L12 | Goal-scoped task list | P40 | [LS2](#evidence-ls2), [LV1](#evidence-lv1) | Selected goal is heading; verify Priority goals union and No goal scope after #40. |
| F01 | New task, more options open | Pending | [TB3](#evidence-tb3) | Expand new-task options; inspect date/repeatable/notes/links and unchecked Add to Today. |
| F02 | Missing task name | Pending | [TB1](#evidence-tb1) | Empty-name error and focus; Cancel, Close, Escape all bypass invalid form. |
| F03 | Invalid URL | Pending | [TB1](#evidence-tb1) | Test unfinished URL survives More options collapse and close/reopen; fix was requested under #44. |
| F04 | Goal picker and linked goals | Pending | None | Active-only picker; inactive targets unavailable; subtask inherited links cannot change. |
| F05 | Task notes and links | Pending | [TB1](#evidence-tb1) | Open/remove saved raw URL; add exactly one valid URL; notes save after editing. |
| F06 | Draft recovered after closing | Pending | [TB1](#evidence-tb1), [FR5](#evidence-fr5) | Test all draft fields across Close/Escape/outside; Cancel and successful create clear full draft. |
| F07 | Blocked parent and nested subtasks | Pending | [TB2](#evidence-tb2), [DM1](#evidence-dm1) | Deep tree beyond three levels; finishing final child enables but does not complete parent. |
| F08 | Add or rename a subtask | Pending | [TB2](#evidence-tb2) | Existing test adds/escapes; additionally rename child via Enter and retain parent context. |
| F09 | Read a completed task | Pending | [DM11](#evidence-dm11) | Completed detail read-only, no scheduling; Reopen retains same ID, links and dates. |
| F10 | Read an archived task | Pending | [TB2](#evidence-tb2) | Archived detail has no completion/new-child control; inspect existing child tree. |
| F11 | Repeatable task completed | Pending | [DM5](#evidence-dm5), [TS5](#evidence-ts5) | Complete repeatable through UI; verify fresh unplanned copy, old completion and feedback. |
| F12 | Earlier repeatable undo blocked | Pending | [DM5](#evidence-dm5) | Reject earlier-repeatable undo via UI; preserve history and follow Open latest copy. |
| F13 | Delete subtask warning | Pending | [TB2](#evidence-tb2), [DM13](#evidence-dm13) | Confirm warning for nested tree and top-level tree; Cancel does not delete. |
| F14 | Task name or notes save failed | Pending | [TB1](#evidence-tb1), [FR4](#evidence-fr4) | Saving/Saved/failure states, retry and close/reopen buffer; rapid edits during request. |
| F15 | Fresh repeatable copy | Pending | [DM5](#evidence-dm5) | Inspect fresh copy availability, reset descendants, retained notes/links and cleared dates. |
| F16 | Task completed with undo | Pending | [DM11](#evidence-dm11) | Ordinary completion/undo same task through UI; Restore notification and Undo path. |
| D01 | Schedule an available task | Pending | [TB3](#evidence-tb3) | Choose platform date for an available task; confirmed day persists on revisit. |
| D02 | Reschedule or remove a day | Pending | [DM11](#evidence-dm11) | Reschedule then remove day through Tasks and Calendar; only one day ever remains. |
| D03 | Blocked task scheduling | Pending | [DM7](#evidence-dm7), [CV7](#evidence-cv7) | Browser future-plan blocked task; Today disabled; arrival removes still-blocked plan. |
| D04 | After deadline disabled | Pending | [CV4](#evidence-cv4), [CV5](#evidence-cv5) | Actual dialog has 14 choices with forbidden days disabled and explained; dates relative to fixture. |
| D05 | Overdue task remains actionable | Pending | [CV6](#evidence-cv6) | Overdue icon/text and future planning; distinguish own overdue date from ancestor constraint. |
| D06 | Soft date passed | Pending | [LS1](#evidence-ls1) | Passed ideal date alone must have no warning/icon/urgency color in list, sheet or calendar. |
| D07 | Date type replaced with undo | Pending | [DM6](#evidence-dm6) | Replace date type in create and edit forms; trigger Undo and verify former type/date restored. |
| D08 | Date conflicts with parent | Pending | [DM10](#evidence-dm10), [TB3](#evidence-tb3) | Calendar and Tasks must match upcoming AND expired ancestor limits; preserve other edits. Fix requested #44. |
| G01 | First use | Pending | [GS10](#evidence-gs10) | First-use layout and create-first-goal action in both widths. |
| G02 | Archived goals | Pending | [GS11](#evidence-gs11), [GB3](#evidence-gb3) | Archived list hierarchy, Restore and retained history after full combined run. |
| G03 | No archived goals | Pending | None | Empty Archived goals label and selected Archived control. |
| G04 | Ongoing goal detail | Pending | [GS4](#evidence-gs4) | Assert ongoing detail has no Complete and keeps Delete in danger actions. |
| G05 | One-shot goal with no linked tasks | Pending | [GS6](#evidence-gs6) | Existing no-task fixture is ongoing; add one-shot zero-task check: no bar, deliberate Complete. |
| G06 | Priority limit reached | Pending | [GV2](#evidence-gv2), [GS8](#evidence-gs8), [DM3](#evidence-dm3) | Cap counts subgoals too; turn one off, choose another; priority not inherited. |
| G07 | Move goal | Pending | [GB4](#evidence-gb4), [GD6](#evidence-gd6) | Inspect all valid destination choices and focus return after successful move. |
| G08 | Invalid goal parent or type | Pending | [GV10](#evidence-gv10), [GD7](#evidence-gd7), [GD9](#evidence-gd9), [GD8](#evidence-gd8) | Browser invalid parent/type feedback; exclude self/descendants/third level without changing hierarchy. |
| G09 | Missing goal name | Pending | [GB1](#evidence-gb1) | Inline empty-name message and reachable Cancel/Close at phone width. |
| G10 | Goal reordered | Pending | [GD1](#evidence-gd1), [GB4](#evidence-gb4) | Browser successful and failed goal drag; insertion/end marker with final inactive sibling; 350 ms hold. |
| G11 | Goal completion blocked | Pending | [DM14](#evidence-dm14) | Browser parent Complete disabled with active child; complete/archive child then enable. |
| G12 | Completed and archived detail | Pending | [GS9](#evidence-gs9), [GB3](#evidence-gb3) | Completed Reopen versus archived Restore; no inactive priority; verify archived-parent restore guidance. |
| G13 | Archived goal detail | Pending | [GB3](#evidence-gb3) | Archived detail has no priority/completion/new-child; inspect delete and parent-return path. |
| G14 | Goal type choices | Pending | [GV10](#evidence-gv10), [GB1](#evidence-gb1) | Switch ongoing/one-shot with selected incompatible parent; reason visible and creation blocked until valid. |
| G15 | Collapsed goal hierarchy | Pending | [GS1](#evidence-gs1) | Browser collapse/expand with correct chevron; child remains non-priority when parent is priority. |
| R01 | Complete a goal, keep tasks | Pending | [GB2](#evidence-gb2), [DM12](#evidence-dm12) | Default Keep active for each task; completed history remains linked. |
| R02 | Archive goal and handle tasks | Pending | [GB3](#evidence-gb3), [DM12](#evidence-dm12) | Every archive entry point opens same task review; whole goal tree, no indirect task deletion. |
| R03 | Delete a goal tree | Pending | [GB5](#evidence-gb5) | Permanent warning names tree/history; no Undo offered; linked tasks retained. |
| R04 | Choose a task outcome | Pending | [GB2](#evidence-gb2) | Change each disposition independently; sibling choices stay unchanged. |
| R05 | Relink before goal removal | Pending | [GV11](#evidence-gv11), [GB2](#evidence-gb2) | Replacement UI excludes inactive goals/removed tree; already-linked outside goal survives Undo. |
| R06 | Goal completed, undo | Pending | [GB2](#evidence-gb2), [DM12](#evidence-dm12) | Undo restores affected links and archived task subtree from confirmed completion. |
| R07 | Goal archived, restore | Pending | [GB3](#evidence-gb3), [DM12](#evidence-dm12) | Restore archived tree/history through list, detail and notice paths. |
| R08 | Removal failed | Pending | [GB2](#evidence-gb2), [DM16](#evidence-dm16) | Repeat failure retention for archive/delete too; rollback leaves no partial result. |
| C01 | No day selected | Pending | [CV1](#evidence-cv1), [CS1](#evidence-cs1) | No selected day; Today outline distinct from mint selected date; no month controls. |
| C02 | Selected day with no tasks | Pending | [CS6](#evidence-cs6) | Empty selected day: use Not planned; no task-creation control in Calendar. |
| C03 | Selected day, full list | Pending | [CS4](#evidence-cs4) | Phone View tasks opens full list and each task can move; close returns to same day. |
| C04 | Busy day | Pending | [CS10](#evidence-cs10), [CS3](#evidence-cs3) | Actual scrolling with many/long rows; reach last task and confirm counts match. |
| C05 | No unplanned tasks | Pending | [CV8](#evidence-cv8) | Empty pool rendered with calendar and selected day retained. |
| C06 | Blocked plan returns to pool | Pending | [CS9](#evidence-cs9), [CS8](#evidence-cs8) | Browser blocked pool status, Today disabled and valid future selection retained. |
| S01 | No goals | Pending | [SS7](#evidence-ss7) | Empty goals keeps usable period links; no empty charts/streaks/celebration. |
| S02 | No completions in period | Pending | [SS4](#evidence-ss4), [SV6](#evidence-sv6) | Zero period totals with nonzero all-time goal totals visible together. |
| S03 | 90 days and 12 months | Pending | [SS6](#evidence-ss6), [SV6](#evidence-sv6), [SV4](#evidence-sv4) | Switch 30/90/365 in browser; only period metrics change; active top-level sections only. |
| S04 | Repeatable with zero or one completion | Pending | [SV2](#evidence-sv2), [SS2](#evidence-ss2) | Render zero and one completion with correct singular/rate and one renamed history group. |
| S05 | One-shot zero and full progress | Pending | [SS3](#evidence-ss3), [DM4](#evidence-dm4) | One-shot 0% and 100%, full-width dark bar; no automatic completion. Stats bar fix awaits combined check. |
| X01 | Initial loading | P44 | None | Throttle first load: stable shell, delayed pending, no shimmer; verify every route after #44. |
| X02 | Initial load failed | P44 | [FR2](#evidence-fr2) | Initial load error across all data routes, retry, no fabricated empty list. |
| X03 | Refresh failed with old data | P44 | [FR3](#evidence-fr3) | Failed refresh retains content AND filters on Tasks/Today/Goals/Calendar/Stats; task-only test is partial. |
| X04 | Task or goal missing | P44 | [SH2](#evidence-sh2), [LS8](#evidence-ls8), [GS7](#evidence-gs7) | Missing task/goal UI return links and browser behavior; old text assertions may need current labels. |
| X05 | Unknown route | P44 | [SH2](#evidence-sh2) | Unknown-route 404 and browser Back retains previous valid page. |
| X06 | Saving, saved and retry | P44 | [TB1](#evidence-tb1), [GB2](#evidence-gb2), [FR5](#evidence-fr5) | Hold pending requests: prevent duplicate writes, keep Close; no success before confirmation across mutations. |
| X07 | Button and focus states | P44 | [GB1](#evidence-gb1) | Contrast, 2 px/3 px focus ring, disabled reasons and pointer/keyboard states across control families. |
| X08 | Undo and archive feedback | P44 | None | Notice placement above phone nav, hover/focus dismissal pause, Undo/restore and failed Undo; after #44. |
| X09 | Small screen and long content | P44 | [GB6](#evidence-gb6), [TB3](#evidence-tb3) | All routes: long titles, many goals/tasks/links, 1280 and 390 px, scrolling/reachable actions; two-suite checks partial. |
| X10 | Sheet keyboard and close states | P44 | [GB1](#evidence-gb1), [TB2](#evidence-tb2) | All sheets/popovers: focus trap/return, Escape/outside close; reduced-motion rendering. Calendar remains manual. |
| X11 | Goal not found | P44 | [GS7](#evidence-gs7), [SH2](#evidence-sh2) | Goal not found copy and Open Goals action after combined shell merge. |
| X12 | Creation succeeded | P44 | [GB1](#evidence-gb1), [TB1](#evidence-tb1) | Creation closes only after confirmation, new row appears, exact task/goal notice; failures keep draft. |

## Existing evidence catalog

These tests must be run against the final combined build. Names and line numbers describe the inventory baseline; update links if later edits move them.

- <a id="evidence-ts1"></a>**TS1** — [test/ui-today-ssr.test.mjs:135](../test/ui-today-ssr.test.mjs#L135): “today renders exactly the available tasks scheduled today”.
- <a id="evidence-ts2"></a>**TS2** — [test/ui-today-ssr.test.mjs:165](../test/ui-today-ssr.test.mjs#L165): “a Today task that becomes blocked mid-day leaves the page”.
- <a id="evidence-ts4"></a>**TS4** — [test/ui-today-ssr.test.mjs:196](../test/ui-today-ssr.test.mjs#L196): “coverage splits active goals into covered and not covered today”.
- <a id="evidence-ts5"></a>**TS5** — [test/ui-today-ssr.test.mjs:212](../test/ui-today-ssr.test.mjs#L212): “completed repeatable leaves a fresh copy with no scheduled day”.
- <a id="evidence-ts6"></a>**TS6** — [test/ui-today-ssr.test.mjs:229](../test/ui-today-ssr.test.mjs#L229): “empty today shows the message and one link to Tasks”.
- <a id="evidence-tv1"></a>**TV1** — [test/ui-today.test.mjs:44](../test/ui-today.test.mjs#L44): “coverage counts a subgoal link for its parent goal too”.
- <a id="evidence-td1"></a>**TD1** — [test/domain/today-reorder.test.mjs:33](../test/domain/today-reorder.test.mjs#L33): “reorderToday moves an open task within its scheduled day open list”.
- <a id="evidence-td2"></a>**TD2** — [test/domain/today-reorder.test.mjs:50](../test/domain/today-reorder.test.mjs#L50): “reorderToday persists the order and returns the day view”.
- <a id="evidence-ls1"></a>**LS1** — [test/ui-tasks-ssr.test.mjs:117](../test/ui-tasks-ssr.test.mjs#L117): “all tasks view shows active trees, states, counts and meta”.
- <a id="evidence-ls2"></a>**LS2** — [test/ui-tasks-ssr.test.mjs:155](../test/ui-tasks-ssr.test.mjs#L155): “goal views show exactly their set”.
- <a id="evidence-ls3"></a>**LS3** — [test/ui-tasks-ssr.test.mjs:171](../test/ui-tasks-ssr.test.mjs#L171): “available view lists flat rows with paths and inherited chips”.
- <a id="evidence-ls5"></a>**LS5** — [test/ui-tasks-ssr.test.mjs:202](../test/ui-tasks-ssr.test.mjs#L202): “history views list completions and archived items with restore”.
- <a id="evidence-ls8"></a>**LS8** — [test/ui-tasks-ssr.test.mjs:240](../test/ui-tasks-ssr.test.mjs#L240): “unknown tasks keep the factual not-found state”.
- <a id="evidence-ls9"></a>**LS9** — [test/ui-tasks-ssr.test.mjs:246](../test/ui-tasks-ssr.test.mjs#L246): “unknown goal ids simply yield the filtered empty state”.
- <a id="evidence-lv1"></a>**LV1** — [test/ui-tasks.test.mjs:77](../test/ui-tasks.test.mjs#L77): “goal scope matches direct links, subgoal links and their parent goals”.
- <a id="evidence-lv5"></a>**LV5** — [test/ui-tasks.test.mjs:121](../test/ui-tasks.test.mjs#L121): “availableRows list every available task and subtask in normal order”.
- <a id="evidence-lv6"></a>**LV6** — [test/ui-tasks.test.mjs:136](../test/ui-tasks.test.mjs#L136): “availableRows composes with goal and ideal date filters”.
- <a id="evidence-lv7"></a>**LV7** — [test/ui-tasks.test.mjs:151](../test/ui-tasks.test.mjs#L151): “treeRows render full active trees in normal order”.
- <a id="evidence-tb1"></a>**TB1** — [test/ui-task-sheets.test.mjs:39](../test/ui-task-sheets.test.mjs#L39): “task sheets retain failed edits, validate links, and keep close available”.
- <a id="evidence-tb2"></a>**TB2** — [test/ui-task-sheets.test.mjs:88](../test/ui-task-sheets.test.mjs#L88): “nested task controls warn before deletion and archived sheets stay read-only”.
- <a id="evidence-tb3"></a>**TB3** — [test/ui-task-sheets.test.mjs:135](../test/ui-task-sheets.test.mjs#L135): “task dates constrain planning and sheets fit both viewport sizes”.
- <a id="evidence-fr2"></a>**FR2** — [test/ui-freshness.test.mjs:118](../test/ui-freshness.test.mjs#L118): “failed fresh loads offer retry without a page reload”.
- <a id="evidence-fr3"></a>**FR3** — [test/ui-freshness.test.mjs:128](../test/ui-freshness.test.mjs#L128): “a failed refresh preserves a task form and its unsaved input”.
- <a id="evidence-fr4"></a>**FR4** — [test/ui-freshness.test.mjs:147](../test/ui-freshness.test.mjs#L147): “an older loader response cannot undo a newer saved change”.
- <a id="evidence-fr5"></a>**FR5** — [test/ui-freshness.test.mjs:183](../test/ui-freshness.test.mjs#L183): “a failed save keeps the creation draft and does not create a task”.
- <a id="evidence-dm1"></a>**DM1** — [test/domain/domain.test.mjs:21](../test/domain/domain.test.mjs#L21): “a task becomes completable only after its unfinished subtasks are complete”.
- <a id="evidence-dm3"></a>**DM3** — [test/domain/domain.test.mjs:72](../test/domain/domain.test.mjs#L72): “only three active goals can be priority and inactive goals free their slots”.
- <a id="evidence-dm4"></a>**DM4** — [test/domain/domain.test.mjs:93](../test/domain/domain.test.mjs#L93): “repeatable completions raise one-shot progress while the fresh copy keeps it below 100%”.
- <a id="evidence-dm5"></a>**DM5** — [test/domain/domain.test.mjs:119](../test/domain/domain.test.mjs#L119): “repeatable completion resets the fresh tree, keeps history, and can be undone”.
- <a id="evidence-dm6"></a>**DM6** — [test/domain/domain.test.mjs:172](../test/domain/domain.test.mjs#L172): “ideal completion date and deadline replace each other”.
- <a id="evidence-dm7"></a>**DM7** — [test/domain/domain.test.mjs:193](../test/domain/domain.test.mjs#L193): “blocked future plans clear quietly on arrival but not before”.
- <a id="evidence-dm8"></a>**DM8** — [test/domain/domain.test.mjs:215](../test/domain/domain.test.mjs#L215): “archive and restore keep history while deleting a goal leaves tasks active”.
- <a id="evidence-dm10"></a>**DM10** — [test/domain/domain.test.mjs:281](../test/domain/domain.test.mjs#L281): “dates obey exclusivity and deadline constraints”.
- <a id="evidence-dm11"></a>**DM11** — [test/domain/domain.test.mjs:338](../test/domain/domain.test.mjs#L338): “today clears a blocked schedule and supports undo and unschedule”.
- <a id="evidence-dm12"></a>**DM12** — [test/domain/domain.test.mjs:387](../test/domain/domain.test.mjs#L387): “goal removal dispositions round-trip through archive, completion, and delete”.
- <a id="evidence-dm13"></a>**DM13** — [test/domain/domain.test.mjs:439](../test/domain/domain.test.mjs#L439): “delete removes the whole task tree and the whole repeatable history”.
- <a id="evidence-dm14"></a>**DM14** — [test/domain/domain.test.mjs:460](../test/domain/domain.test.mjs#L460): “goals and tasks expose the CRUD and filter surface”.
- <a id="evidence-dm16"></a>**DM16** — [test/domain/domain.test.mjs:626](../test/domain/domain.test.mjs#L626): “invalid goal-removal replacements roll back every earlier task choice”.
- <a id="evidence-gb1"></a>**GB1** — [test/ui-goals-browser.test.mjs:44](../test/ui-goals-browser.test.mjs#L44): “goal creation validates inline, traps focus, and safely closes an invalid form”.
- <a id="evidence-gb2"></a>**GB2** — [test/ui-goals-browser.test.mjs:61](../test/ui-goals-browser.test.mjs#L61): “completion keeps independent task choices after failure and undo restores all changed states”.
- <a id="evidence-gb3"></a>**GB3** — [test/ui-goals-browser.test.mjs:95](../test/ui-goals-browser.test.mjs#L95): “row archive reviews the whole tree and archived detail restores its history”.
- <a id="evidence-gb4"></a>**GB4** — [test/ui-goals-browser.test.mjs:119](../test/ui-goals-browser.test.mjs#L119): “move options enforce hierarchy and canceled drag keeps sibling order”.
- <a id="evidence-gb5"></a>**GB5** — [test/ui-goals-browser.test.mjs:151](../test/ui-goals-browser.test.mjs#L151): “deleting an active goal tree applies separate task choices without deleting tasks”.
- <a id="evidence-gb6"></a>**GB6** — [test/ui-goals-browser.test.mjs:174](../test/ui-goals-browser.test.mjs#L174): “desktop and phone goal pages and creation sheets do not overflow”.
- <a id="evidence-gs1"></a>**GS1** — [test/ui-goals-ssr.test.mjs:133](../test/ui-goals-ssr.test.mjs#L133): “tree renders two levels with subgoals nested under their parent”.
- <a id="evidence-gs4"></a>**GS4** — [test/ui-goals-ssr.test.mjs:187](../test/ui-goals-ssr.test.mjs#L187): “goal page shows type label, progress, subgoals, and linked tasks”.
- <a id="evidence-gs6"></a>**GS6** — [test/ui-goals-ssr.test.mjs:211](../test/ui-goals-ssr.test.mjs#L211): “goal page without linked tasks stays factual”.
- <a id="evidence-gs7"></a>**GS7** — [test/ui-goals-ssr.test.mjs:219](../test/ui-goals-ssr.test.mjs#L219): “unknown goals keep the factual not-found state”.
- <a id="evidence-gs8"></a>**GS8** — [test/ui-goals-ssr.test.mjs:227](../test/ui-goals-ssr.test.mjs#L227): “full priority cap disables further toggles with the factual message”.
- <a id="evidence-gs9"></a>**GS9** — [test/ui-goals-ssr.test.mjs:240](../test/ui-goals-ssr.test.mjs#L240): “completing a one-shot goal keeps unfinished tasks active and undo restores them”.
- <a id="evidence-gs10"></a>**GS10** — [test/ui-goals-ssr.test.mjs:274](../test/ui-goals-ssr.test.mjs#L274): “a fresh database renders the single create-first-goal action”.
- <a id="evidence-gs11"></a>**GS11** — [test/ui-goals-ssr.test.mjs:310](../test/ui-goals-ssr.test.mjs#L310): “archiving a priority goal frees its slot and lands the row in Archived”.
- <a id="evidence-gv2"></a>**GV2** — [test/ui-goals.test.mjs:96](../test/ui-goals.test.mjs#L96): “priorityInUse counts only active priority goals”.
- <a id="evidence-gv10"></a>**GV10** — [test/ui-goals.test.mjs:209](../test/ui-goals.test.mjs#L209): “parent choices explain inactive, incompatible and third-level destinations”.
- <a id="evidence-gv11"></a>**GV11** — [test/ui-goals.test.mjs:220](../test/ui-goals.test.mjs#L220): “removal input accepts independent dispositions and rejects malformed payloads”.
- <a id="evidence-gd1"></a>**GD1** — [test/domain/goals-reorder.test.mjs:21](../test/domain/goals-reorder.test.mjs#L21): “reorderGoals moves a top-level goal to the top and persists the order”.
- <a id="evidence-gd6"></a>**GD6** — [test/domain/goals-reorder.test.mjs:139](../test/domain/goals-reorder.test.mjs#L139): “moveGoal re-parents between the top level and top-level goals”.
- <a id="evidence-gd7"></a>**GD7** — [test/domain/goals-reorder.test.mjs:160](../test/domain/goals-reorder.test.mjs#L160): “moveGoal keeps the two-level tree and kind rules”.
- <a id="evidence-gd8"></a>**GD8** — [test/domain/goals-reorder.test.mjs:188](../test/domain/goals-reorder.test.mjs#L188): “moveGoal rejects inactive goals and inactive targets”.
- <a id="evidence-gd9"></a>**GD9** — [test/domain/goals-reorder.test.mjs:214](../test/domain/goals-reorder.test.mjs#L214): “moveGoal rejects self-parenting before it can create a cycle”.
- <a id="evidence-cs1"></a>**CS1** — [test/ui-calendar-ssr.test.mjs:164](../test/ui-calendar-ssr.test.mjs#L164): “the grid shows five whole weeks starting Monday, past days dimmed”.
- <a id="evidence-cs3"></a>**CS3** — [test/ui-calendar-ssr.test.mjs:183](../test/ui-calendar-ssr.test.mjs#L183): “the grid uses counts and each day has a readable navigation label”.
- <a id="evidence-cs4"></a>**CS4** — [test/ui-calendar-ssr.test.mjs:190](../test/ui-calendar-ssr.test.mjs#L190): “a day panel lists exactly the tasks scheduled that day”.
- <a id="evidence-cs6"></a>**CS6** — [test/ui-calendar-ssr.test.mjs:210](../test/ui-calendar-ssr.test.mjs#L210): “an empty day panel states the fact without a call to action”.
- <a id="evidence-cs8"></a>**CS8** — [test/ui-calendar-ssr.test.mjs:225](../test/ui-calendar-ssr.test.mjs#L225): “a blocked task stays on its future day and shows as blocked”.
- <a id="evidence-cs9"></a>**CS9** — [test/ui-calendar-ssr.test.mjs:235](../test/ui-calendar-ssr.test.mjs#L235): “a blocked task whose day arrived waits in the pool, visibly blocked”.
- <a id="evidence-cs10"></a>**CS10** — [test/ui-calendar-ssr.test.mjs:248](../test/ui-calendar-ssr.test.mjs#L248): “busy days keep every task reachable through the day panel”.
- <a id="evidence-cv1"></a>**CV1** — [test/ui-calendar.test.mjs:38](../test/ui-calendar.test.mjs#L38): “the window is five whole weeks starting Monday of the current week”.
- <a id="evidence-cv4"></a>**CV4** — [test/ui-calendar.test.mjs:104](../test/ui-calendar.test.mjs#L104): “the move popover offers 14 days from today including today”.
- <a id="evidence-cv5"></a>**CV5** — [test/ui-calendar.test.mjs:117](../test/ui-calendar.test.mjs#L117): “days after an unpassed deadline are disabled with a stated reason”.
- <a id="evidence-cv6"></a>**CV6** — [test/ui-calendar.test.mjs:129](../test/ui-calendar.test.mjs#L129): “an overdue task may be planned to any future day”.
- <a id="evidence-cv7"></a>**CV7** — [test/ui-calendar.test.mjs:137](../test/ui-calendar.test.mjs#L137): “today is not offered to a blocked task”.
- <a id="evidence-cv8"></a>**CV8** — [test/ui-calendar.test.mjs:144](../test/ui-calendar.test.mjs#L144): “the pool keeps open tasks without a day”.
- <a id="evidence-ss2"></a>**SS2** — [test/ui-stats-ssr.test.mjs:164](../test/ui-stats-ssr.test.mjs#L164): “renamed repeatable copies count under one history with the weekly rate”.
- <a id="evidence-ss3"></a>**SS3** — [test/ui-stats-ssr.test.mjs:172](../test/ui-stats-ssr.test.mjs#L172): “one-shot sections show n of m with bar and percentage”.
- <a id="evidence-ss4"></a>**SS4** — [test/ui-stats-ssr.test.mjs:180](../test/ui-stats-ssr.test.mjs#L180): “quiet goals and periods read as zeros without failure language”.
- <a id="evidence-ss6"></a>**SS6** — [test/ui-stats-ssr.test.mjs:197](../test/ui-stats-ssr.test.mjs#L197): “period choices live in the URL and change the aggregation”.
- <a id="evidence-ss7"></a>**SS7** — [test/ui-stats-ssr.test.mjs:212](../test/ui-stats-ssr.test.mjs#L212): “a fresh database renders zeros with no call to action”.
- <a id="evidence-sv2"></a>**SV2** — [test/stats-view.test.mjs:66](../test/stats-view.test.mjs#L66): “repeatable rows read "n times in <period> days · ≈x a week"”.
- <a id="evidence-sv4"></a>**SV4** — [test/stats-view.test.mjs:194](../test/stats-view.test.mjs#L194): “sections split ongoing and one-shot goals with the right math”.
- <a id="evidence-sv6"></a>**SV6** — [test/stats-view.test.mjs:238](../test/stats-view.test.mjs#L238): “wider periods pull older completions back in”.
- <a id="evidence-sh2"></a>**SH2** — [test/ui-shell.test.mjs:76](../test/ui-shell.test.mjs#L76): “unknown records and pages give factual return paths”.
- <a id="evidence-ur1"></a>**UR1** — [test/url-state.test.mjs:14](../test/url-state.test.mjs#L14): “task URLs keep valid filters and omit defaults”.

## Final evidence record

- Combined commit: pending.
- `pnpm build`: pending.
- `pnpm test`: pending.
- `pnpm smoke`: pending.
- Browser state checks and screenshots: pending; attach per-case IDs and paths.
- Standards and specification reviews: pending; resolve findings or record explicit limits.
- Main merge, push, GitHub verification and ticket closure: pending.
- User completion message and Sendkit delivery: pending.
