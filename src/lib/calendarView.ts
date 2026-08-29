import type { Task } from '../domain/store'
import { addDays, formatDay, formatShortDate } from './tasksView.ts'

/** Monday of the week containing `day` (UTC arithmetic on `YYYY-MM-DD`). */
export function mondayOf(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

/** The "Coming weeks" window: five whole weeks from Monday of the current week. */
export function calendarDays(today: string): string[] {
  const monday = mondayOf(today)
  return Array.from({ length: 35 }, (_, index) => addDays(monday, index))
}

export type CalendarCell = {
  day: string
  past: boolean
  isToday: boolean
  tasks: Task[]
}

/**
 * One grid cell per day of the window. A blocked task whose scheduled day
 * has arrived is left out of its day (ruling 8: the domain clears the day
 * and the task returns to the pool, visibly blocked); a blocked task
 * scheduled for a future day stays on its day until then.
 */
export function calendarGrid(tasks: Task[], today: string): CalendarCell[] {
  return calendarDays(today).map((day) => ({
    day,
    past: day < today,
    isToday: day === today,
    tasks: tasks.filter(
      (task) =>
        task.scheduledDay === day &&
        !task.completedAt &&
        !task.archivedAt &&
        !(task.blocked && day <= today),
    ),
  }))
}

/**
 * The "Not planned" pool: open tasks without a day, plus blocked tasks
 * whose scheduled day has arrived and quietly cleared.
 */
export function poolTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter(
    (task) =>
      !task.completedAt &&
      !task.archivedAt &&
      (!task.scheduledDay || (task.blocked && task.scheduledDay <= today)),
  )
}

export type MoveDay = {
  day: string
  label: string
  disabled: boolean
  reason: string | null
}

/**
 * The move popover's days: the next 14 days from today, today included
 * (ruling 6). Days the domain would refuse are disabled with the reason:
 * today is not offered to a blocked task, and days after an unpassed
 * deadline are not offered. An overdue task may use any day.
 */
export function moveDays(
  today: string,
  task: Pick<Task, 'blocked' | 'deadline'>,
): MoveDay[] {
  return Array.from({ length: 14 }, (_, index) => {
    const day = addDays(today, index)
    let disabled = false
    let reason: string | null = null
    if (task.blocked && index === 0) {
      disabled = true
      reason = 'Blocked tasks cannot be planned for today.'
    } else if (
      task.deadline &&
      task.deadline >= today &&
      day > task.deadline
    ) {
      disabled = true
      reason = `After the ${formatShortDate(task.deadline)} deadline`
    }
    return { day, label: formatDay(day, today), disabled, reason }
  })
}
