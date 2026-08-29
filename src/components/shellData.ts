export const shellGoals = [
  { id: 'g_focus_01', name: 'Steady work', priority: true },
  { id: 'g_home_02', name: 'Home basics', priority: false },
] as const

export const shellTasks = [
  {
    id: 't_prepare_01',
    name: 'Prepare Friday plan',
    goalId: 'g_focus_01',
    available: true,
  },
  {
    id: 't_kitchen_02',
    name: 'Clear the kitchen table',
    goalId: 'g_home_02',
    available: true,
  },
  {
    id: 't_reply_03',
    name: 'Reply after the notes arrive',
    goalId: 'g_focus_01',
    available: false,
  },
] as const
