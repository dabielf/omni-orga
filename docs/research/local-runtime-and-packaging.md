# Local runtime and packaging research

Checked on 2026-08-26. This note compares supported paths. It does not choose the project's architecture.

## Short answer

The smallest current path is one Node.js package:

- TanStack Start runs on a local Node server.
- A file-backed SQLite database stays on that Mac.
- Plain TypeScript domain functions are imported by both thin TanStack server-function wrappers and a thin CLI.
- Development uses `npm run dev -- --open`.
- A production-like local install builds with Nitro, then a small executable wrapper starts `.output/server/index.mjs` and opens the browser.

This uses no monorepo, local HTTP API for the CLI, desktop shell, ORM, or custom installer. Those are not required by the stated needs.

## Current support baseline

- TanStack's supported new-project path is its CLI or an official example. Its basic example uses `npm install` and `npm run dev`.[^start-getting-started]
- `@tanstack/react-start` currently requires Node `>=22.12.0` and Vite `>=7.0.0`.[^start-package]
- Node 24 is the current LTS line. Node says production apps should use an Active or Maintenance LTS release.[^node-releases]
- If the built-in SQLite driver is used, Node 24.15 or newer is the clean baseline. `node:sqlite` became a release candidate in Node 24.15 and is still marked **release candidate**, not stable, in the current Node 24 docs.[^node-sqlite]
- TanStack documents Vite plus Nitro for a production Node build: `vite build`, then `node .output/server/index.mjs`. It also warns that `nitro/vite` is under active development.[^start-hosting]

That yields these supported developer commands once the project exists:

```sh
npm ci
npm run dev -- --open

npm run build
npm start
```

The first pair is the development path. `--open` is Vite's supported browser-opening option.[^vite-open] The second pair exercises the built Node output. It does not open a browser by itself.

## SQLite options

### Option A: Node's built-in `node:sqlite`

This has the fewest moving parts: no database package, native add-on, or separate SQLite install. `DatabaseSync` opens a file directly, supports prepared statements, enables foreign-key checks by default, offers a lock timeout, and exposes the SQLite online backup API.[^node-sqlite]

Constraints:

- The API is synchronous, so a slow query blocks that Node process while it runs.
- The module is still a release candidate.
- Selecting it makes Node 24.15+ the practical minimum even though TanStack Start itself supports older Node versions.

For a single-user local task app, synchronous calls may be sufficient. That is a workload hypothesis, not a measured result.

### Option B: `better-sqlite3`

This is a mature synchronous driver with prebuilt binaries for major platforms and architectures. Its current package requires Node 22+.[^better-sqlite3]

Constraints:

- It adds a native dependency and its release/platform matrix to installation and packaging.
- A missing prebuilt binary can require local build tools.
- A future single-file executable must extract and load the native add-on; Node documents that extra step for native add-ons in single executable applications.[^node-sea]

This option removes the release-candidate concern around the Node API, but adds install and release work.

### Rules shared by both options

The web server and CLI may open the same database from separate processes. SQLite supports many readers but only one writer at a time. WAL mode lets readers and a writer overlap, but all processes must be on the same host, and `SQLITE_BUSY` can still occur.[^sqlite-wal][^sqlite-transactions]

Whichever driver is selected should therefore use:

- one canonical database path;
- WAL mode;
- short write transactions;
- a non-zero busy timeout;
- one shared, transactional migration function;
- bound parameters for values;
- the SQLite online backup API for live backups, not a plain copy of only the main database file.[^sqlite-backup]

On macOS, the normal persistent location is a private subdirectory of `~/Library/Application Support`, such as `~/Library/Application Support/omni-orga/omni-orga.sqlite`. Apple assigns that directory to app-managed user data.[^apple-app-support] The database should not live inside the checkout or installed npm package, because either may be replaced during an update. WAL databases should also not be placed on a network filesystem.[^sqlite-wal]

## Sharing logic between the web app and CLI

Keep one package until a real second package needs independent publication. A small dependency direction is enough:

```text
plain domain rules
        ↓
Node-only use cases + SQLite access
        ↓                    ↓
TanStack server wrappers     CLI argument/output adapter
```

In concrete terms:

- Plain `.ts` modules hold task, goal, date, blocking, and progress rules. They import no React, TanStack, browser API, or SQLite driver.
- Node-only modules open SQLite and implement the use cases. TanStack recommends `.server.ts` for server-only helpers.[^start-server-functions]
- `createServerFn` handlers validate web input, call those use cases, and return serializable data.
- The CLI validates arguments, calls the same use cases directly, and formats text or JSON.

TanStack says all application code is isomorphic by default, while database and filesystem access belong on the server side.[^start-execution-model] It also says server functions are for calls from the Start application; outside callers should use server routes.[^start-server-functions] Therefore, the CLI should not import a `createServerFn` wrapper as if it were ordinary domain logic.

Two CLI access shapes remain viable:

1. **Direct database access:** both adapters call the same Node-only use cases. This works when the browser app is stopped and avoids a local API. Concurrent writes still need the SQLite rules above.
2. **Local server route:** the CLI calls an explicit HTTP route. This centralizes database access, but requires the app server to be running and adds port/process/error handling.

The first has fewer moving parts. The second is useful only if one owning process becomes a real requirement.

## Install and start options

### 1. Git checkout and npm scripts

An agent clones the GitHub repo, installs the declared Node LTS line, runs `npm ci`, and builds once. Later it runs one project command such as `npm start` or a wrapper script.

Benefits: smallest release setup; developer commands are already present. Cost: the user keeps a checkout and Node installation.

### 2. npm executable package

A package can expose an `omni-orga` command through `package.json`'s `bin` field. npm links that command into the executable path for global installs and makes it available to `npm exec`.[^npm-bin][^npm-exec]

The intended shape could be:

```sh
npm install --global omni-orga
omni-orga start
```

The same package can keep agent commands such as `omni-orga task list --json`.

Packaging constraints:

- Publish compiled JavaScript for the CLI. Node refuses to run TypeScript files inside `node_modules`, and its built-in TypeScript mode ignores `tsconfig.json` path aliases.[^node-typescript]
- Include the compiled CLI, Nitro server output, client assets, migrations, and runtime dependencies. Verify the exact tarball with `npm pack --dry-run` before every release.[^npm-pack]
- Resolve packaged assets relative to the executable module, not the current working directory.
- Make `omni-orga start` spawn the built server, wait until it is ready, print the URL, then use macOS `/usr/bin/open` to open it. It must forward shutdown signals to the server.
- Bind to loopback only. A local personal app should not become reachable from the LAN by default.
- Store the database under Application Support, never under the global npm directory.

The package may be published to npm or installed from a versioned release tarball. `npm exec --yes omni-orga start` is also possible when a one-shot, cache-backed run is wanted instead of a permanent global command.[^npm-exec]

### 3. Self-contained macOS executable later

Node can build a single executable and embed assets, but that feature is still marked active development.[^node-sea] The TanStack client assets and server bundle would need explicit embedding/extraction, plus separate Apple Silicon and Intel builds, signing, update handling, and release tests.

This removes the user's Node prerequisite. It is not the smallest first release path.

## Checks the chosen path must pass

Before calling packaging solved, test these facts on a clean macOS account:

1. Install without a pre-existing checkout.
2. Start with one command and open the right URL only after the server is ready.
3. Run a CLI write while the browser server is open; confirm lock handling and immediate visibility.
4. Restart from a different current directory; confirm the same database is used.
5. Upgrade the installed code; confirm the database remains untouched and migrations run once.
6. Create and restore a live backup.
7. Stop the command; confirm no child server remains.
8. Run `npm pack --dry-run`; confirm all server, client, CLI, and migration files are present and `prompt.md` is absent.

## Open uncertainty

- TanStack's Node/Vite production path currently depends on `nitro/vite`, which its own docs call under active development. Pin exact versions and smoke-test the emitted `.output` layout before each release.[^start-hosting]
- `node:sqlite` is a release candidate. The project still needs to decide whether fewer dependencies or a fully stable database-driver API matters more.[^node-sqlite]
- No application exists yet, so package contents, process shutdown, browser timing, and dual-process locking have not been tested.
- npm package-name availability is not ownership. Reserve a name only if npm publishing becomes the chosen release path.

[^start-getting-started]: [TanStack Start: Getting Started](https://tanstack.com/start/latest/docs/framework/react/getting-started)
[^start-package]: [TanStack Router source: `@tanstack/react-start` package manifest](https://github.com/TanStack/router/blob/main/packages/react-start/package.json)
[^node-releases]: [Node.js release policy and current release lines](https://nodejs.org/en/about/previous-releases)
[^node-sqlite]: [Node.js 24 LTS: SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
[^start-hosting]: [TanStack Start: Hosting, Nitro, and Node.js](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
[^vite-open]: [Vite: `server.open`](https://vite.dev/config/server-options#server-open)
[^better-sqlite3]: [`better-sqlite3` official repository and install notes](https://github.com/WiseLibs/better-sqlite3)
[^node-sea]: [Node.js: Single executable applications](https://nodejs.org/api/single-executable-applications.html)
[^sqlite-wal]: [SQLite: Write-Ahead Logging](https://www.sqlite.org/wal.html)
[^sqlite-transactions]: [SQLite: Transactions](https://www.sqlite.org/lang_transaction.html)
[^sqlite-backup]: [SQLite: Online Backup API](https://www.sqlite.org/backup.html)
[^apple-app-support]: [Apple: `applicationSupportDirectory`](https://developer.apple.com/documentation/foundation/url/applicationsupportdirectory)
[^start-server-functions]: [TanStack Start: Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
[^start-execution-model]: [TanStack Start: Execution Model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)
[^npm-bin]: [npm: `package.json` `bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin)
[^npm-exec]: [npm: `npm exec`](https://docs.npmjs.com/cli/v11/commands/npm-exec/)
[^node-typescript]: [Node.js 24 LTS: TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
[^npm-pack]: [npm: package contents and `npm pack --dry-run`](https://docs.npmjs.com/cli/v11/commands/npm-publish/#files-included-in-package)
