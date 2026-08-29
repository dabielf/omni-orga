import { Link, useNavigate } from '@tanstack/react-router'

import {
  idealDatePresets,
  type IdealDatePreset,
  type TasksSearch,
} from '../lib/urlState'
import { useTasksUi } from './tasksContext'

const IDEAL_LABELS: Record<string, string> = {
  any: 'Any date',
  today: 'Ideal today',
  passed: 'Ideal date passed',
  none: 'No ideal date',
}

const IDEAL_OPTIONS = ['any', ...idealDatePresets] as const

export function TasksFilters() {
  const { search, openCreate } = useTasksUi()
  const navigate = useNavigate()
  const available = search.available === '1'

  return (
    <div className="filters-bar">
      <label className="filters-field">
        <span className="filters-label">Ideal completion date</span>
        <select
          value={search.ideal ?? 'any'}
          onChange={(event) => {
            const value = event.target.value
            navigate({
              to: '/tasks',
              search: {
                ...search,
                ideal:
                  value === 'any' ? undefined : (value as IdealDatePreset),
              },
            })
          }}
        >
          {IDEAL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {IDEAL_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <div className="segmented" role="group" aria-label="Availability">
        <Link
          className={available ? 'segment-link' : 'segment-link is-current'}
          aria-current={available ? undefined : 'true'}
          to="/tasks"
          search={{ ...search, available: undefined } satisfies TasksSearch}
        >
          All
        </Link>
        <Link
          className={available ? 'segment-link is-current' : 'segment-link'}
          aria-current={available ? 'true' : undefined}
          to="/tasks"
          search={{ ...search, available: '1' } satisfies TasksSearch}
        >
          Available
        </Link>
      </div>
      <button
        type="button"
        className="primary-btn"
        onClick={openCreate}
      >
        New task
      </button>
    </div>
  )
}
