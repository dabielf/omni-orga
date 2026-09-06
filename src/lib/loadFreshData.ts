import type { AnyRouter } from '@tanstack/react-router'

export type ViewContext = { getRouter: () => AnyRouter }

/** Keep the current form mounted if a refresh fails; the router owns the data. */
export async function loadFreshData<T extends object>(
  load: () => Promise<T>,
  { context, route }: { context: ViewContext; route: { id: string } },
): Promise<T & { refreshError?: boolean }> {
  try {
    return await load()
  } catch (error) {
    const previous = context.getRouter().state.matches.find(
      match => match.routeId === route.id,
    )?.loaderData as T | undefined
    if (!previous) throw error
    return { ...previous, refreshError: true }
  }
}
