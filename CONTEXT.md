# Omni-orga

Omni-orga helps one person organize goals and choose tasks they can do now without seeing their whole workload.

## Language

**Goal**:
A direction or outcome that helps the user organize tasks. It is either a top-level goal or a subgoal.

**Subgoal**:
A goal directly inside a top-level goal that cannot contain another subgoal. An ongoing goal may contain either kind of subgoal, but a one-shot goal may contain only one-shot subgoals.

**Priority goal**:
A goal chosen for steady focus; at most three active top-level goals and subgoals combined may be priority, and completed or archived goals free their slot. Priority does not flow through the goal tree, and tasks use Today instead of priority.

**Goal link**:
A link from a top-level task to zero or more goals that also applies to every subtask below it. Subtasks cannot add links; a subgoal link also counts once for its parent goal, even when more than one link path exists.

**One-shot goal**:
A goal with a clear end state. Only the user decides when it is complete; finishing its tasks does not complete it automatically, and an active subgoal blocks completion.

**Goal completion**:
When a one-shot goal completes, each unfinished linked task is kept active without that goal by default, linked to another goal, or archived. Completed task history keeps its goal link; reopening the goal restores the task states changed during completion.

**Ongoing goal**:
A goal with no final end. It stays active until the user archives it and can never be completed.

**One-shot goal progress**:
The number of completed linked tasks and subtasks out of all linked tasks and subtasks. Completed repeatable copies stay in the count, and each fresh incomplete copy keeps the progress below 100 percent until the user completes the goal.

**Ongoing goal progress**:
The total number of completed linked tasks and subtasks, including tasks linked through subgoals and every completed repeatable copy.

**Task**:
An action with a clear end that the user completes, optionally with working notes and zero or more external URL links; completing its subtasks never completes it. Completion can be undone, reopening the same task with its goal links, subtasks, and dates.

**Subtask**:
A task that blocks one parent task. It may have its own subtasks, with no fixed depth; completing every subtask makes the parent task available but does not complete it.

**Blocked task**:
An active incomplete task with at least one active incomplete subtask. Only subtasks can block a task; separate task-to-task blocker links do not exist.

**Available task**:
An active incomplete task with no active incomplete subtasks. It is ready for the user to choose or complete.

**Today**:
The current local calendar day's ordered plan of available tasks and tasks completed that day. An open task leaves Today if it becomes blocked or its scheduled day clears.

**Archive**:
A reversible removal from active use that hides the item, keeps its history, and allows restoration. Archiving a task includes its whole subtask tree; archiving a top-level goal includes its subgoals.

**Goal removal**:
Before a goal tree is archived or deleted, each active linked task is handled separately: remove the affected goal links and keep the task active by default, link it to another goal, or archive its task tree. Removing a goal never deletes a task automatically.

**Delete**:
A permanent removal offered only after a clear warning. Deleting a parent task or top-level goal deletes its whole tree and history; linked tasks are handled first and never deleted automatically.

**Ideal completion date**:
An optional soft date when the user would like to finish a task. Passing it does not change the task or show a warning.
_Avoid_: Due date

**Deadline**:
An optional hard date by which a task must be complete; an incomplete task past it is overdue and shows a factual warning. A task cannot also have an ideal completion date, and no subtask completion date may fall after a deadline above it.
_Avoid_: Hard completion date, due date

**Scheduled day**:
The optional single day when the user plans to see and do an open task; it may exist beside a completion date, and moving it replaces the old day. It cannot fall after an unpassed deadline, but an overdue task may use a future day; it clears quietly if that day passes unfinished or the task becomes blocked.

**Repeatable task**:
A top-level task whose completion creates a fresh incomplete copy that is available right away. It cannot be a subtask, and a change in meaning starts a new repeatable task.
_Avoid_: Recurring task

**Repeatable task copy**:
A fresh copy keeps the current task tree but resets every task to incomplete and clears all scheduled days, ideal completion dates, and deadlines. It shows the previous completion date.

**Repeatable task history**:
Completed copies stay in one history, including after a rename, so completions can be counted over a chosen period. Undoing a completion removes the fresh copy and reopens the completed one.
