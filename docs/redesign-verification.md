# Redesign verification matrix

Scope: [approved 90-case specification](../design-proposal-previews/README.md), [screens](../design-proposal-previews/views/export.pdf), [states](../design-proposal-previews/states/export.pdf).

Final code checked: `cbb9c7a`. **Build, all 197 tests, and smoke passed** on 2026-09-06. This document maps assertions and inspected source; it does not claim each of the 90 states received a separate visual comparison.

**Automated + source** means focused domain/helper/SSR/browser evidence, complemented by the named shared UI path. **Source** identifies simple branches inspected directly, without a dedicated fixture assertion. These distinguish the checks actually performed. Catalog names identify exact tests; assertions cover only the behavior described below.

Manual checks covered of Today, Tasks, Goals, Calendar and Stats at **320×720** with no horizontal overflow, and earlier **1280×800 / 390×844** checks of the main views, Goal detail, New goal and Task detail. Shared component coverage applies to variants; it is not a claim that every state was visually reviewed. Saved and visually inspected the five main views at **1280×720 / 390×844**; screenshot paths are recorded below. The running app was restarted and all five main routes were checked without changing user data.

| Case | Approved state | Evidence type | Tests | Verified behavior / limit |
| --- | --- | --- | --- | --- |
| T01 | Nothing planned | Automated + source | [TS6](#evidence-ts6) | Empty Today has one Tasks action. |
| T02 | All planned tasks completed | Automated + source | [RT4](#evidence-rt4) | All planned rows complete; Undo restores a row and removes empty-state hint. |
| T03 | Open work with no completions | Automated + source | [RT4](#evidence-rt4) | Single-open state has no hold hint; no-completions branch inspected in TodayPage. |
| T04 | Coverage without priority goals | Automated + source | [RT4](#evidence-rt4) | No priorities renders None in both groups without choosing goals. |
| T05 | Partial and full coverage | Automated + source | [TS4](#evidence-ts4) [TV1](#evidence-tv1) [RT4](#evidence-rt4) [TS7](#evidence-ts7) | Partial/full coverage; inherited grandchild links tested with ancestors absent; available-task href inspected. |
| T06 | Long-press reorder | Automated + source | [TD1](#evidence-td1) [TD2](#evidence-td2) [RT1](#evidence-rt1) | 400 ms browser hold, preview, Escape and rejected-save rollback; pointercancel handler inspected in TodayPage. |
| T07 | Task leaves Today | Automated + source | [TS2](#evidence-ts2) [DM7](#evidence-dm7) | Real-store blocking/day-boundary reconciliation removes task without replacement. |
| T08 | Complete or reorder failed | Automated + source | [RT1](#evidence-rt1) | Rejected reorder restores confirmed order; failed completion uses guarded shared taskActions path (source inspection). |
| L01 | First use | Source | Source | TaskList first-use branch supplies Create a task; creation control exercised by TB1. |
| L02 | Filters have no matches | Automated + source | [LS9](#evidence-ls9) [LV6](#evidence-lv6) | TaskList distinguishes All/Available empty filters and keeps filter controls outside the list; return href inspected. |
| L03 | Available tasks with ancestry | Automated + source | [LS3](#evidence-ls3) [LV5](#evidence-lv5) | SSR ancestry/inherited chips and available-only exclusion; long row wrapping covered by RT6. |
| L04 | Collapsed and expanded task trees | Automated + source | [LS1](#evidence-ls1) [LV7](#evidence-lv7) [TB3](#evidence-tb3) | Tree helpers/SSR and browser expand; collapse toggles same expansion state in TaskList. |
| L05 | Completed tasks | Automated + source | [LS5](#evidence-ls5) [RT2](#evidence-rt2) | History rows have no schedule/overdue controls; shared reopen uses taskActions and DM11. |
| L06 | Archived tasks | Automated + source | [DM8](#evidence-dm8) [RT6](#evidence-rt6) | Archive-list Restore followed by Undo returns archived row. |
| L07 | Empty history | Source | Source | TaskList history branches render distinct No completed tasks / No archived tasks labels. |
| L08 | Views menu | Automated + source | [RT5](#evidence-rt5) | Phone Views closes after goal selection and summary shows current scope. |
| L09 | Ideal date filter | Automated + source | [LV6](#evidence-lv6) [UR1](#evidence-ur1) [RT5](#evidence-rt5) | Goal navigation and reload preserve available and ideal filters together. |
| L10 | Long titles and several goals | Automated + source | [RT6](#evidence-rt6) | Long name fits 390 px; goal-overflow link opens both linked goals in sheet. |
| L11 | No archived tasks | Source | Source | TaskList archived-empty branch and selected view derive from search.view. |
| L12 | Goal-scoped task list | Automated + source | [LS2](#evidence-ls2) [LV1](#evidence-lv1) [RT2](#evidence-rt2) | Goal/priority/no-goal membership plus heading and reload checks. |
| F01 | New task, more options open | Automated + source | [TB3](#evidence-tb3) | Expanded creation fields; loadCreateDraft explicitly defaults Add to Today false. |
| F02 | Missing task name | Automated + source | [TB1](#evidence-tb1) | Empty-name error; explicit Close/Cancel and native Escape bypass form validation (source inspected). |
| F03 | Invalid URL | Automated + source | [TB1](#evidence-tb1) | Invalid URL text/error survives Escape/reopen and repeated options collapse. |
| F04 | Goal picker and linked goals | Automated + source | [TB3](#evidence-tb3) | Inherited-link explanation in child sheet; GoalChips filters active targets and omits child mutation callbacks. |
| F05 | Task notes and links | Automated + source | [TB1](#evidence-tb1) [RC2](#evidence-rc2) | Notes retry persists; retained raw URL renders as link; LinkEditor add-one/remove handlers inspected. |
| F06 | Draft recovered after closing | Automated + source | [TB1](#evidence-tb1) [FR5](#evidence-fr5) | Failed save/Escape retain draft, Cancel clears, successful creation clears; shared draft stores all fields. |
| F07 | Blocked parent and nested subtasks | Automated + source | [TB2](#evidence-tb2) [DM1](#evidence-dm1) [RC5](#evidence-rc5) | Blocked child plus six-level reset tree; final-child completion rule verified in domain. |
| F08 | Add or rename a subtask | Automated + source | [TB2](#evidence-tb2) | Nested add/Enter/Escape exercised; SubtaskRow Enter blurs into the same tested buffered save hook. |
| F09 | Read a completed task | Automated + source | [DM11](#evidence-dm11) [RC2](#evidence-rc2) | Completed detail/reopen path; TaskSheet active guard makes notes/name/dates/children read-only and hides scheduling. |
| F10 | Read an archived task | Automated + source | [TB2](#evidence-tb2) | Archived child inputs read-only, add/complete absent, tree retained. |
| F11 | Repeatable task completed | Automated + source | [DM5](#evidence-dm5) [TS5](#evidence-ts5) [RC2](#evidence-rc2) [RC5](#evidence-rc5) | UI completion creates fresh unplanned copy, preserves notes/links, resets descendants. |
| F12 | Earlier repeatable undo blocked | Automated + source | [DM5](#evidence-dm5) [RC2](#evidence-rc2) | Earlier reopen rejected with exact message, history unchanged, Open latest copy followed. |
| F13 | Delete subtask warning | Automated + source | [TB2](#evidence-tb2) [DM13](#evidence-dm13) | Nested warning Cancel retains tree; confirm deletes subtree; same DeleteWarning used for root. |
| F14 | Task name or notes save failed | Automated + source | [TB1](#evidence-tb1) [FR4](#evidence-fr4) | Failed title/notes buffers survive reopen, retry persists, stale response cannot overwrite newer state. |
| F15 | Fresh repeatable copy | Automated + source | [DM5](#evidence-dm5) [RC2](#evidence-rc2) [RC5](#evidence-rc5) | Fresh leaf available with cleared dates; six-level fresh parent remains blocked by reset children per CONTEXT. |
| F16 | Task completed with undo | Automated + source | [DM11](#evidence-dm11) [RT4](#evidence-rt4) [RT6](#evidence-rt6) | Ordinary Today completion/Undo and archived Restore/Undo browser paths. |
| D01 | Schedule an available task | Automated + source | [TB3](#evidence-tb3) | Native picker deadline bound checked; shared ScheduleMenu date-change persistence path inspected. |
| D02 | Reschedule or remove a day | Automated + source | [DM11](#evidence-dm11) [XS3](#evidence-xs3) | Calendar move persists after retry; shared Remove day action delegates to tested unplan transaction. |
| D03 | Blocked task scheduling | Automated + source | [DM7](#evidence-dm7) [CV7](#evidence-cv7) [TB3](#evidence-tb3) | Blocked Today disabled; future allowance and arrival-time clearing checked in helper/domain. |
| D04 | After deadline disabled | Automated + source | [CV4](#evidence-cv4) [CV5](#evidence-cv5) [TB3](#evidence-tb3) | 14-day helper and disabled own-deadline choices; native picker max checked in browser. |
| D05 | Overdue task remains actionable | Automated + source | [CV6](#evidence-cv6) | Overdue own deadline remains plannable; explicit Overdue rendering inspected in TaskSheet/TaskList/CalendarPage. |
| D06 | Soft date passed | Automated + source | [LS1](#evidence-ls1) | Ideal-date metadata remains neutral; urgency branches in list/sheet/calendar test deadline only. |
| D07 | Date type replaced with undo | Automated + source | [DM6](#evidence-dm6) [XS9](#evidence-xs9) [XS11](#evidence-xs11) | Date Undo restores former type/date in saved task and recovered creation draft; later notes remain intact. |
| D08 | Date conflicts with parent | Automated + source | [DM10](#evidence-dm10) [TB3](#evidence-tb3) [XS4](#evidence-xs4) | Upcoming ancestor limits in Tasks; expired ancestor disables all 14 Calendar choices with explanation. |
| G01 | First use | Automated + source | [GS10](#evidence-gs10) | Real empty database gives single create-first-goal action; creation dialog layout shared with GB6. |
| G02 | Archived goals | Automated + source | [GS11](#evidence-gs11) [GB3](#evidence-gb3) | Row archive, archived tree/detail and history restoration checked. |
| G03 | No archived goals | Source | Source | ArchivedGoalList empty branch renders No archived goals; route keeps Archived selected. |
| G04 | Ongoing goal detail | Automated + source | [GS4](#evidence-gs4) | GoalDetail kind guard hides Complete for ongoing goals; danger Delete remains. |
| G05 | One-shot goal with no linked tasks | Automated + source | [GS6](#evidence-gs6) [RC3](#evidence-rc3) | Zero-task one-shot has no bar and enabled deliberate Complete. |
| G06 | Priority limit reached | Automated + source | [GV2](#evidence-gv2) [GS8](#evidence-gs8) [DM3](#evidence-dm3) [RC3](#evidence-rc3) | Cap includes active subgoals; inactive slots free; child does not inherit parent priority. |
| G07 | Move goal | Automated + source | [GB4](#evidence-gb4) [GD6](#evidence-gd6) | Browser move to/from top level; valid-parent helper and shared dialog focus return. |
| G08 | Invalid goal parent or type | Automated + source | [GV10](#evidence-gv10) [GD7](#evidence-gd7) [GD8](#evidence-gd8) [GD9](#evidence-gd9) [GB4](#evidence-gb4) | Invalid/self/inactive/third-level parents rejected; forbidden move options disabled with reasons. |
| G09 | Missing goal name | Automated + source | [GB1](#evidence-gb1) | Empty goal name error focuses name; native dialog traps and returns focus on Escape. |
| G10 | Goal reordered | Automated + source | [GD1](#evidence-gd1) [GB4](#evidence-gb4) [RC4](#evidence-rc4) | Successful/rejected 400 ms sibling drag, persistence, insertion marker and cancel cleanup. |
| G11 | Goal completion blocked | Automated + source | [DM14](#evidence-dm14) [RC3](#evidence-rc3) | Active child disables Complete with reason; child completion enables parent. |
| G12 | Completed and archived detail | Automated + source | [GS9](#evidence-gs9) [GB3](#evidence-gb3) | Complete/Reopen and archive/Restore retain history; GoalDetail guards inactive actions and archived-parent restore. |
| G13 | Archived goal detail | Automated + source | [GB3](#evidence-gb3) | Archived tree detail restored; GoalDetail hides priority/complete, preserves Delete and parent path. |
| G14 | Goal type choices | Automated + source | [GV10](#evidence-gv10) [GB1](#evidence-gb1) | Parent-choice rules tested; GoalSheet recomputes reason and blocks submit for incompatible selected parent. |
| G15 | Collapsed goal hierarchy | Automated + source | [GS1](#evidence-gs1) [RC3](#evidence-rc3) | Collapse/expand at 1280/390 preserves noninherited child priority. |
| R01 | Complete a goal, keep tasks | Automated + source | [GB2](#evidence-gb2) [DM12](#evidence-dm12) | Keep-active default preserves other links; completed history keeps goal link. |
| R02 | Archive goal and handle tasks | Automated + source | [GB3](#evidence-gb3) [DM12](#evidence-dm12) | Row archive reviews whole tree; shared GoalRemovalDialog used by detail/archive entry points. |
| R03 | Delete a goal tree | Automated + source | [GB5](#evidence-gb5) | Tree deletion retains/relinks tasks; shared dialog warns permanent and delete notice has no Undo. |
| R04 | Choose a task outcome | Automated + source | [GB2](#evidence-gb2) | Independent keep/relink/archive choices survive failure and persist separately. |
| R05 | Relink before goal removal | Automated + source | [GV11](#evidence-gv11) [GB2](#evidence-gb2) | Replacement selected and existing outside link retained; dialog excludes inactive/removed scope in source. |
| R06 | Goal completed, undo | Automated + source | [GB2](#evidence-gb2) [DM12](#evidence-dm12) | Undo restores original links and archived task descendants. |
| R07 | Goal archived, restore | Automated + source | [GB3](#evidence-gb3) [DM12](#evidence-dm12) | Archived detail restores tree/history; list/notice use same restore action (source inspected). |
| R08 | Removal failed | Automated + source | [GB2](#evidence-gb2) [DM16](#evidence-dm16) | Failure keeps choices; transactional invalid replacement rolls back all; archive/delete share submit/error path. |
| C01 | No day selected | Automated + source | [CV1](#evidence-cv1) [CS1](#evidence-cs1) | Five-week fixed grid and no selected day; CalendarPage has separate Today/selected classes and no month control. |
| C02 | Selected day with no tasks | Automated + source | [CS6](#evidence-cs6) | Empty selected-day message and Not planned pool; no creation action in CalendarPage. |
| C03 | Selected day, full list | Automated + source | [CS4](#evidence-cs4) [XS3](#evidence-xs3) | Phone View 8 tasks exposes all rows; nested Move/Close returns focus; Close stays visible while scrolling at 390×420. |
| C04 | Busy day | Automated + source | [CS10](#evidence-cs10) [CS3](#evidence-cs3) [XS3](#evidence-xs3) | Busy-day counts and all eight rows; last row reached and moved; sheet has no horizontal overflow. |
| C05 | No unplanned tasks | Automated + source | [CV8](#evidence-cv8) | Pool membership tested; CalendarPage empty-pool branch leaves grid/selection intact. |
| C06 | Blocked plan returns to pool | Automated + source | [CS9](#evidence-cs9) [CS8](#evidence-cs8) [CV7](#evidence-cv7) | Future blocked plan retained; arrival returns to pool; Move Today disabled with reason. |
| S01 | No goals | Automated + source | [SS7](#evidence-ss7) [RC1](#evidence-rc1) | No goals shows zero counters and usable periods, no chart/bar sections. |
| S02 | No completions in period | Automated + source | [SS4](#evidence-ss4) [SV6](#evidence-sv6) [RC1](#evidence-rc1) | Zero recent count coexists with nonzero all-time progress. |
| S03 | 90 days and 12 months | Automated + source | [SS6](#evidence-ss6) [SV6](#evidence-sv6) [SV4](#evidence-sv4) [RC1](#evidence-rc1) | Browser 30/90/365 selection changes period counts, not all-time progress; no subgoal sections. |
| S04 | Repeatable with zero or one completion | Automated + source | [SV2](#evidence-sv2) [SS2](#evidence-ss2) [RC1](#evidence-rc1) | Zero/one singular counts, rate helper, renamed repeatable grouped once. |
| S05 | One-shot zero and full progress | Automated + source | [SS3](#evidence-ss3) [DM4](#evidence-dm4) [RC1](#evidence-rc1) | 0/100 percent; full-width 6 px dark fill measured at 1280/390; no automatic completion. |
| X01 | Initial loading | Automated + source | [XS2](#evidence-xs2) | Delayed navigation loading retains one shell; router pending defaults apply to all data routes. |
| X02 | Initial load failed | Automated + source | [FR2](#evidence-fr2) | Initial failure/retry browser path; root LoadErrorPage shared across route loaders. |
| X03 | Refresh failed with old data | Automated + source | [FR3](#evidence-fr3) [XS1](#evidence-xs1) [XS7](#evidence-xs7) | Task draft/confirmed Stats period retained; all five routes use loadFreshData fallback and retry notices. |
| X04 | Task or goal missing | Automated + source | [SH2](#evidence-sh2) [LS8](#evidence-ls8) [GS7](#evidence-gs7) [XS6](#evidence-xs6) | Missing task/goal return links followed in browser. |
| X05 | Unknown route | Automated + source | [SH2](#evidence-sh2) [XS6](#evidence-xs6) | Unknown path returns 404 and working Today link; ordinary browser-history freshness covered by ui-freshness. |
| X06 | Saving, saved and retry | Automated + source | [TB1](#evidence-tb1) [GB2](#evidence-gb2) [FR5](#evidence-fr5) [XS3](#evidence-xs3) [XS10](#evidence-xs10) | Calendar and archived-list double-clicks issue one write; restore failure re-enables retry. Creation/edit/removal guards inspected. |
| X07 | Button and focus states | Automated + source + visual | [GB1](#evidence-gb1) [TB2](#evidence-tb2) [XS3](#evidence-xs3) | Keyboard focus tested across dialog families; styles.css defines focus/hover/disabled states. Visual focus ring: 2 px with 3 px offset. Text contrast 12.25:1; muted 5.31:1 (4.88:1 on navigation); action 7.89:1; danger 6.78:1; input border 3.77:1. |
| X08 | Undo and archive feedback | Automated + source | [XS8](#evidence-xs8) [XS9](#evidence-xs9) [RT6](#evidence-rt6) [RC2](#evidence-rc2) | Stacked notices do not overlap, hover/focus pauses timer, phone tabs/footer stay clear; archive Undo and rejected repeatable Undo. |
| X09 | Small screen and long content | Automated + source | [GB6](#evidence-gb6) [TB3](#evidence-tb3) [RT3](#evidence-rt3) [RT6](#evidence-rt6) [RC1](#evidence-rc1) [RC3](#evidence-rc3) [RC5](#evidence-rc5) [XS3](#evidence-xs3) [XS5](#evidence-xs5) | 1280/390 geometry, long titles/goals, busy day and deep/long sheets; parent checked five main views at 320×720. |
| X10 | Sheet keyboard and close states | Automated + source | [GB1](#evidence-gb1) [TB2](#evidence-tb2) [TB1](#evidence-tb1) [XS3](#evidence-xs3) [XS5](#evidence-xs5) | Task/goal/Calendar dialog trap, Escape, focus return; outside Task close and reduced-motion styles tested. Shared native handlers cover variants. |
| X11 | Goal not found | Automated + source | [GS7](#evidence-gs7) [SH2](#evidence-sh2) [XS6](#evidence-xs6) | Goal not found text plus working Open Goals link. |
| X12 | Creation succeeded | Automated + source | [GB1](#evidence-gb1) [TB1](#evidence-tb1) [FR5](#evidence-fr5) [XS8](#evidence-xs8) | Confirmed rows/Goal created notice; failure keeps draft; source success branch clears/closes only after ok. |

## Evidence catalog

Exact test names below were checked against the current files. Links point to files because line numbers change during integration.

- <a id="evidence-ts1"></a>**TS1** — [test/ui-today-ssr.test.mjs](../test/ui-today-ssr.test.mjs): “today renders exactly the available tasks scheduled today”.
- <a id="evidence-ts2"></a>**TS2** — [test/ui-today-ssr.test.mjs](../test/ui-today-ssr.test.mjs): “a Today task that becomes blocked mid-day leaves the page”.
- <a id="evidence-ts4"></a>**TS4** — [test/ui-today-ssr.test.mjs](../test/ui-today-ssr.test.mjs): “coverage splits active goals into covered and not covered today”.
- <a id="evidence-ts5"></a>**TS5** — [test/ui-today-ssr.test.mjs](../test/ui-today-ssr.test.mjs): “completed repeatable leaves a fresh copy with no scheduled day”.
- <a id="evidence-ts6"></a>**TS6** — [test/ui-today-ssr.test.mjs](../test/ui-today-ssr.test.mjs): “empty today shows the message and one link to Tasks”.
- <a id="evidence-tv1"></a>**TV1** — [test/ui-today.test.mjs](../test/ui-today.test.mjs): “coverage counts a subgoal link for its parent goal too”.
- <a id="evidence-td1"></a>**TD1** — [test/domain/today-reorder.test.mjs](../test/domain/today-reorder.test.mjs): “reorderToday moves an open task within its scheduled day open list”.
- <a id="evidence-td2"></a>**TD2** — [test/domain/today-reorder.test.mjs](../test/domain/today-reorder.test.mjs): “reorderToday persists the order and returns the day view”.
- <a id="evidence-ls1"></a>**LS1** — [test/ui-tasks-ssr.test.mjs](../test/ui-tasks-ssr.test.mjs): “all tasks view shows active trees, states, counts and meta”.
- <a id="evidence-ls2"></a>**LS2** — [test/ui-tasks-ssr.test.mjs](../test/ui-tasks-ssr.test.mjs): “goal views show exactly their set”.
- <a id="evidence-ls3"></a>**LS3** — [test/ui-tasks-ssr.test.mjs](../test/ui-tasks-ssr.test.mjs): “available view lists flat rows with paths and inherited chips”.
- <a id="evidence-ls5"></a>**LS5** — [test/ui-tasks-ssr.test.mjs](../test/ui-tasks-ssr.test.mjs): “history views list completions and archived items with restore”.
- <a id="evidence-ls8"></a>**LS8** — [test/ui-tasks-ssr.test.mjs](../test/ui-tasks-ssr.test.mjs): “unknown tasks keep the factual not-found state”.
- <a id="evidence-ls9"></a>**LS9** — [test/ui-tasks-ssr.test.mjs](../test/ui-tasks-ssr.test.mjs): “unknown goal ids simply yield the filtered empty state”.
- <a id="evidence-lv1"></a>**LV1** — [test/ui-tasks.test.mjs](../test/ui-tasks.test.mjs): “goal scope matches direct links, subgoal links and their parent goals”.
- <a id="evidence-lv5"></a>**LV5** — [test/ui-tasks.test.mjs](../test/ui-tasks.test.mjs): “availableRows list every available task and subtask in normal order”.
- <a id="evidence-lv6"></a>**LV6** — [test/ui-tasks.test.mjs](../test/ui-tasks.test.mjs): “availableRows composes with goal and ideal date filters”.
- <a id="evidence-lv7"></a>**LV7** — [test/ui-tasks.test.mjs](../test/ui-tasks.test.mjs): “treeRows render full active trees in normal order”.
- <a id="evidence-tb1"></a>**TB1** — [test/ui-task-sheets.test.mjs](../test/ui-task-sheets.test.mjs): “task sheets retain failed edits, validate links, and keep close available”.
- <a id="evidence-tb2"></a>**TB2** — [test/ui-task-sheets.test.mjs](../test/ui-task-sheets.test.mjs): “nested task controls warn before deletion and archived sheets stay read-only”.
- <a id="evidence-tb3"></a>**TB3** — [test/ui-task-sheets.test.mjs](../test/ui-task-sheets.test.mjs): “task dates constrain planning and sheets fit both viewport sizes”.
- <a id="evidence-fr2"></a>**FR2** — [test/ui-freshness.test.mjs](../test/ui-freshness.test.mjs): “failed fresh loads offer retry without a page reload”.
- <a id="evidence-fr3"></a>**FR3** — [test/ui-freshness.test.mjs](../test/ui-freshness.test.mjs): “a failed refresh preserves a task form and its unsaved input”.
- <a id="evidence-fr4"></a>**FR4** — [test/ui-freshness.test.mjs](../test/ui-freshness.test.mjs): “an older loader response cannot undo a newer saved change”.
- <a id="evidence-fr5"></a>**FR5** — [test/ui-freshness.test.mjs](../test/ui-freshness.test.mjs): “a failed save keeps the creation draft and does not create a task”.
- <a id="evidence-dm1"></a>**DM1** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “a task becomes completable only after its unfinished subtasks are complete”.
- <a id="evidence-dm3"></a>**DM3** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “only three active goals can be priority and inactive goals free their slots”.
- <a id="evidence-dm4"></a>**DM4** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “repeatable completions raise one-shot progress while the fresh copy keeps it below 100%”.
- <a id="evidence-dm5"></a>**DM5** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “repeatable completion resets the fresh tree, keeps history, and can be undone”.
- <a id="evidence-dm6"></a>**DM6** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “ideal completion date and deadline replace each other”.
- <a id="evidence-dm7"></a>**DM7** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “blocked future plans clear quietly on arrival but not before”.
- <a id="evidence-dm8"></a>**DM8** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “archive and restore keep history while deleting a goal leaves tasks active”.
- <a id="evidence-dm10"></a>**DM10** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “dates obey exclusivity and deadline constraints”.
- <a id="evidence-dm11"></a>**DM11** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “today clears a blocked schedule and supports undo and unschedule”.
- <a id="evidence-dm12"></a>**DM12** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “goal removal dispositions round-trip through archive, completion, and delete”.
- <a id="evidence-dm13"></a>**DM13** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “delete removes the whole task tree and the whole repeatable history”.
- <a id="evidence-dm14"></a>**DM14** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “goals and tasks expose the CRUD and filter surface”.
- <a id="evidence-dm16"></a>**DM16** — [test/domain/domain.test.mjs](../test/domain/domain.test.mjs): “invalid goal-removal replacements roll back every earlier task choice”.
- <a id="evidence-gb1"></a>**GB1** — [test/ui-goals-browser.test.mjs](../test/ui-goals-browser.test.mjs): “goal creation validates inline, traps focus, and safely closes an invalid form”.
- <a id="evidence-gb2"></a>**GB2** — [test/ui-goals-browser.test.mjs](../test/ui-goals-browser.test.mjs): “completion keeps independent task choices after failure and undo restores all changed states”.
- <a id="evidence-gb3"></a>**GB3** — [test/ui-goals-browser.test.mjs](../test/ui-goals-browser.test.mjs): “row archive reviews the whole tree and archived detail restores its history”.
- <a id="evidence-gb4"></a>**GB4** — [test/ui-goals-browser.test.mjs](../test/ui-goals-browser.test.mjs): “move options enforce hierarchy and canceled drag keeps sibling order”.
- <a id="evidence-gb5"></a>**GB5** — [test/ui-goals-browser.test.mjs](../test/ui-goals-browser.test.mjs): “deleting an active goal tree applies separate task choices without deleting tasks”.
- <a id="evidence-gb6"></a>**GB6** — [test/ui-goals-browser.test.mjs](../test/ui-goals-browser.test.mjs): “desktop and phone goal pages and creation sheets do not overflow”.
- <a id="evidence-gs1"></a>**GS1** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “tree renders two levels with subgoals nested under their parent”.
- <a id="evidence-gs4"></a>**GS4** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “goal page shows type label, progress, subgoals, and linked tasks”.
- <a id="evidence-gs6"></a>**GS6** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “goal page without linked tasks stays factual”.
- <a id="evidence-gs7"></a>**GS7** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “unknown goals keep the factual not-found state”.
- <a id="evidence-gs8"></a>**GS8** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “full priority cap disables further toggles with the factual message”.
- <a id="evidence-gs9"></a>**GS9** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “completing a one-shot goal keeps unfinished tasks active and undo restores them”.
- <a id="evidence-gs10"></a>**GS10** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “a fresh database renders the single create-first-goal action”.
- <a id="evidence-gs11"></a>**GS11** — [test/ui-goals-ssr.test.mjs](../test/ui-goals-ssr.test.mjs): “archiving a priority goal frees its slot and lands the row in Archived”.
- <a id="evidence-gv2"></a>**GV2** — [test/ui-goals.test.mjs](../test/ui-goals.test.mjs): “priorityInUse counts only active priority goals”.
- <a id="evidence-gv10"></a>**GV10** — [test/ui-goals.test.mjs](../test/ui-goals.test.mjs): “parent choices explain inactive, incompatible and third-level destinations”.
- <a id="evidence-gv11"></a>**GV11** — [test/ui-goals.test.mjs](../test/ui-goals.test.mjs): “removal input accepts independent dispositions and rejects malformed payloads”.
- <a id="evidence-gd1"></a>**GD1** — [test/domain/goals-reorder.test.mjs](../test/domain/goals-reorder.test.mjs): “reorderGoals moves a top-level goal to the top and persists the order”.
- <a id="evidence-gd6"></a>**GD6** — [test/domain/goals-reorder.test.mjs](../test/domain/goals-reorder.test.mjs): “moveGoal re-parents between the top level and top-level goals”.
- <a id="evidence-gd7"></a>**GD7** — [test/domain/goals-reorder.test.mjs](../test/domain/goals-reorder.test.mjs): “moveGoal keeps the two-level tree and kind rules”.
- <a id="evidence-gd8"></a>**GD8** — [test/domain/goals-reorder.test.mjs](../test/domain/goals-reorder.test.mjs): “moveGoal rejects inactive goals and inactive targets”.
- <a id="evidence-gd9"></a>**GD9** — [test/domain/goals-reorder.test.mjs](../test/domain/goals-reorder.test.mjs): “moveGoal rejects self-parenting before it can create a cycle”.
- <a id="evidence-cs1"></a>**CS1** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “the grid shows five whole weeks starting Monday, past days dimmed”.
- <a id="evidence-cs3"></a>**CS3** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “the grid uses counts and each day has a readable navigation label”.
- <a id="evidence-cs4"></a>**CS4** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “a day panel lists exactly the tasks scheduled that day”.
- <a id="evidence-cs6"></a>**CS6** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “an empty day panel states the fact without a call to action”.
- <a id="evidence-cs8"></a>**CS8** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “a blocked task stays on its future day and shows as blocked”.
- <a id="evidence-cs9"></a>**CS9** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “a blocked task whose day arrived waits in the pool, visibly blocked”.
- <a id="evidence-cs10"></a>**CS10** — [test/ui-calendar-ssr.test.mjs](../test/ui-calendar-ssr.test.mjs): “busy days keep every task reachable through the day panel”.
- <a id="evidence-cv1"></a>**CV1** — [test/ui-calendar.test.mjs](../test/ui-calendar.test.mjs): “the window is five whole weeks starting Monday of the current week”.
- <a id="evidence-cv4"></a>**CV4** — [test/ui-calendar.test.mjs](../test/ui-calendar.test.mjs): “the move popover offers 14 days from today including today”.
- <a id="evidence-cv5"></a>**CV5** — [test/ui-calendar.test.mjs](../test/ui-calendar.test.mjs): “days after an unpassed deadline are disabled with a stated reason”.
- <a id="evidence-cv6"></a>**CV6** — [test/ui-calendar.test.mjs](../test/ui-calendar.test.mjs): “an overdue task may be planned to any future day”.
- <a id="evidence-cv7"></a>**CV7** — [test/ui-calendar.test.mjs](../test/ui-calendar.test.mjs): “today is not offered to a blocked task”.
- <a id="evidence-cv8"></a>**CV8** — [test/ui-calendar.test.mjs](../test/ui-calendar.test.mjs): “the pool keeps open tasks without a day”.
- <a id="evidence-ss2"></a>**SS2** — [test/ui-stats-ssr.test.mjs](../test/ui-stats-ssr.test.mjs): “renamed repeatable copies count under one history with the weekly rate”.
- <a id="evidence-ss3"></a>**SS3** — [test/ui-stats-ssr.test.mjs](../test/ui-stats-ssr.test.mjs): “one-shot sections show n of m with bar and percentage”.
- <a id="evidence-ss4"></a>**SS4** — [test/ui-stats-ssr.test.mjs](../test/ui-stats-ssr.test.mjs): “quiet goals and periods read as zeros without failure language”.
- <a id="evidence-ss6"></a>**SS6** — [test/ui-stats-ssr.test.mjs](../test/ui-stats-ssr.test.mjs): “period choices live in the URL and change the aggregation”.
- <a id="evidence-ss7"></a>**SS7** — [test/ui-stats-ssr.test.mjs](../test/ui-stats-ssr.test.mjs): “a fresh database renders zeros with no call to action”.
- <a id="evidence-sv2"></a>**SV2** — [test/stats-view.test.mjs](../test/stats-view.test.mjs): “repeatable rows read "n times in <period> days · ≈x a week"”.
- <a id="evidence-sv4"></a>**SV4** — [test/stats-view.test.mjs](../test/stats-view.test.mjs): “sections split ongoing and one-shot goals with the right math”.
- <a id="evidence-sv6"></a>**SV6** — [test/stats-view.test.mjs](../test/stats-view.test.mjs): “wider periods pull older completions back in”.
- <a id="evidence-sh2"></a>**SH2** — [test/ui-shell.test.mjs](../test/ui-shell.test.mjs): “unknown records and pages give factual return paths”.
- <a id="evidence-ur1"></a>**UR1** — [test/url-state.test.mjs](../test/url-state.test.mjs): “task URLs keep valid filters and omit defaults”.

- <a id="evidence-rt1"></a>**RT1** — [test/ui-redesign-tasks-browser.test.mjs](../test/ui-redesign-tasks-browser.test.mjs): “Today cancels drag previews and restores a rejected save”.
- <a id="evidence-rt2"></a>**RT2** — [test/ui-redesign-tasks-browser.test.mjs](../test/ui-redesign-tasks-browser.test.mjs): “No goal and selected-goal headings survive navigation and reload”.
- <a id="evidence-rt3"></a>**RT3** — [test/ui-redesign-tasks-browser.test.mjs](../test/ui-redesign-tasks-browser.test.mjs): “Phone list controls and inherited form font fit the viewport”.
- <a id="evidence-rt4"></a>**RT4** — [test/ui-redesign-tasks-browser.test.mjs](../test/ui-redesign-tasks-browser.test.mjs): “Today covers no-priority, full-coverage, all-completed and single-open states”.
- <a id="evidence-rt5"></a>**RT5** — [test/ui-redesign-tasks-browser.test.mjs](../test/ui-redesign-tasks-browser.test.mjs): “Phone Views closes after selection and keeps combined filters”.
- <a id="evidence-rt6"></a>**RT6** — [test/ui-redesign-tasks-browser.test.mjs](../test/ui-redesign-tasks-browser.test.mjs): “Long names wrap, goal overflow opens the sheet, and archive restoration has Undo”.
- <a id="evidence-rc1"></a>**RC1** — [test/ui-redesign-coverage.test.mjs](../test/ui-redesign-coverage.test.mjs): “S01–S05 Stats keeps period counts separate from all-time zero and full progress”.
- <a id="evidence-rc2"></a>**RC2** — [test/ui-redesign-coverage.test.mjs](../test/ui-redesign-coverage.test.mjs): “F11/F12/F15 repeatable UI creates a clean copy and refuses earlier undo without losing history”.
- <a id="evidence-rc3"></a>**RC3** — [test/ui-redesign-coverage.test.mjs](../test/ui-redesign-coverage.test.mjs): “G05/G11/G15 goal emptiness, active-child blocking and priority survive collapse correctly”.
- <a id="evidence-rc4"></a>**RC4** — [test/ui-redesign-coverage.test.mjs](../test/ui-redesign-coverage.test.mjs): “G10 goal drag persists a successful move and leaves confirmed order on a rejected write”.
- <a id="evidence-rc5"></a>**RC5** — [test/ui-redesign-coverage.test.mjs](../test/ui-redesign-coverage.test.mjs): “F07/F11/F15 deep repeatable task trees reset and remain reachable on phone and desktop”.
- <a id="evidence-xs1"></a>**XS1** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “refresh retry stays usable inside a task dialog”.
- <a id="evidence-xs2"></a>**XS2** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “slow initial navigation keeps the shell and shows a delayed loading state”.
- <a id="evidence-xs3"></a>**XS3** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “phone day list exposes every task and nested Move restores focus and retries safely”.
- <a id="evidence-xs4"></a>**XS4** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “expired ancestor deadlines remain hard limits in Calendar”.
- <a id="evidence-xs5"></a>**XS5** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “long task sheets scroll without overlapping fields and respect reduced motion”.
- <a id="evidence-xs6"></a>**XS6** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “missing tasks, missing goals and unknown pages have working return links”.
- <a id="evidence-xs7"></a>**XS7** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “failed Stats period refresh preserves confirmed period until retry”.
- <a id="evidence-xs8"></a>**XS8** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “success and failed-refresh notices stay distinct and pause dismissal while read”.
- <a id="evidence-xs9"></a>**XS9** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “task Undo stays usable in the phone sheet, pauses on focus, then clears phone tabs”.
- <a id="evidence-ts7"></a>**TS7** — [test/ui-today-ssr.test.mjs](../test/ui-today-ssr.test.mjs): “Today inherits root goal coverage for a scheduled grandchild without its ancestors”.

- <a id="evidence-xs10"></a>**XS10** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “archived task restoration blocks duplicate submits and retries after failure”.

- <a id="evidence-xs11"></a>**XS11** — [test/ui-shared-states.test.mjs](../test/ui-shared-states.test.mjs): “creation date Undo updates the recovered draft after close and reopen”.

## Final evidence record

- Code: `cbb9c7a`. Runtime: Node 24.19.0 and pnpm 10.33.0, as checked locally.
- `pnpm build`: passed, including TypeScript checking.
- `pnpm test`: **197 passed, 0 failed, 0 skipped** (17.94 seconds).
- `pnpm smoke`: passed; built app started, served the expected page and stopped cleanly using a temporary database.
- Screenshots: [implemented/README.md](../design-proposal-previews/implemented/README.md), main views plus New task, Task detail, New goal and Goal detail at 1280×720 and 390×844. Each saved screenshot was opened for visual inspection. Main views also checked at 320×720: no horizontal overflow. Captures span `69e3f2c` through `cbb9c7a`; main-view CSS did not change in that interval. The New task and Task detail captures include the final shared fixes.
- Focus and contrast: computed New goal input outline is dark green, 2 px solid, 3 px offset. Ratios calculated from the actual CSS colours: ink/paper 12.25:1; muted/paper 5.31:1; muted/navigation 4.88:1; white/action 7.89:1; danger/paper 6.78:1; input border/paper 3.77:1.
- Standards review: two confirmed findings fixed (recovered-draft date Undo; Calendar Close scrolling away). Reviewer independently ran three regressions: 3 passed. No remaining findings.
- Spec review: two confirmed findings fixed (Today inherited goal coverage; duplicate archived Restore requests). No remaining substantive findings. See [review record](redesign-review.md).
- Running app: restarted in normal mode at `http://127.0.0.1:4310`; healthy. Browser navigation checked Today, Goals, Tasks, Calendar and Stats, with the new Outfit font and no horizontal overflow. No user-data writes were made during these checks.
- Main merge, remote commit verification and ticket closure are recorded on [delivery issue #45](https://github.com/dabielf/omni-orga/issues/45).
- SendKit completion message needs the recipient's Telegram chat ID. This is separate from the completed app checks; no message delivery is claimed.
