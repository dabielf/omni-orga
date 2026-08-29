import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main data-omni-orga="app">
      <h1>Omni-orga</h1>
      <p>The local app is ready.</p>
    </main>
  )
}
