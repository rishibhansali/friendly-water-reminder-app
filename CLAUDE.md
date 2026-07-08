# Friendly Water Reminder App — Claude Code Context

## What This Project Is

A personal-use (not App Store distributed) macOS menu bar utility that reminds the user to
drink water on a configurable timer. A tray icon controls on/off state, goal, and snoozing.
When the timer fires, a small transparent/frameless/always-on-top window slides an animated
2D character in from the bottom-right of the screen, settles into an idle loop, then offers
"Drink Water," "Snooze," and "Settings." Progress and settings persist locally.

**Status:** Tray icon with on/off + launch-at-login toggles is working. No timer, character
animation, or settings UI yet — see "Current Status" below.

## Tech Stack

- **Electron** — cross-platform desktop shell; gives us a tray icon, always-on-top frameless
  windows, and auto-launch-at-login, none of which exist in a plain browser.
- **React + TypeScript** — renderer UI (the character popup and future settings panel).
  TypeScript is used in both main and renderer processes for shared types and safety.
- **Vite** — dev server + build for the renderer only (fast HMR, minimal config). The main
  process is compiled separately with plain `tsc` (see Build Pipeline below) since it's a
  small amount of Node-targeted code that doesn't benefit from bundling.
- **electron-store** — simple local JSON persistence for settings and daily drink log; avoids
  standing up a real database for a single-user desktop tool. **Pinned to v8** (`^8.2.0`), not
  the current v11 — v9+ is ESM-only and cannot be `require()`'d from the CommonJS-compiled main
  process (see Build Pipeline). Re-evaluate the pin only if the main process is ever migrated
  to ESM output.
- **lottie-react** — planned for rendering the "Groovy Walk Cycle" character animation as a
  Lottie JSON file. Installed now (per the agreed tech stack) but not wired into any component
  yet — that happens when the character popup feature is built.
- **ESLint + Prettier** — linting/formatting, flat ESLint config (`eslint.config.mjs`, ESLint 9).
- **Vitest** — unit tests for shared/pure logic (main and renderer are thin by design; most
  test coverage should target `src/shared`).

## Dev Environment — Use These Exact Commands (verified 2026-07-07)

- Env setup: `npm install` — all dependencies are project-local in `node_modules/`.
- Run tests: `npm test` (`vitest run`)
- Build: `npm run build` (runs `build:renderer` then `build:main`, outputs to `dist/`)
- Typecheck: `npm run typecheck` (checks renderer/shared config, then main config)
- Lint: `npm run lint`
- Format: `npm run format`
- Dev mode (hot reload): `npm run dev` — runs Vite dev server + `tsc --watch` for main +
  Electron concurrently; Electron loads `http://localhost:5173` via `ELECTRON_RENDERER_URL`.
- Run built app: `npm start` (loads the built `dist/renderer/index.html` via `loadFile`)
- NEVER install packages globally — all dependencies live in `node_modules/`.

### Known environment gotcha

If you run `npm start` or `npm run dev` from a terminal spawned **inside another Electron app**
(e.g. Claude Code's own terminal, VS Code's integrated terminal), the `ELECTRON_RUN_AS_NODE=1`
env var may be inherited from the parent process. This makes `electron .` run as plain Node
instead of launching the real Electron runtime, so `require('electron')` returns a path string
instead of the API object, and `app`/`BrowserWindow` will be `undefined`. Fix: run with
`env -u ELECTRON_RUN_AS_NODE npm start` (or unset it in the shell) when testing from such a
terminal. A real user's Terminal.app/iTerm session does not have this var set.

### Launch-at-login only fully works once packaged

`app.setLoginItemSettings` / the "Launch at Login" tray toggle correctly registers/unregisters
the app with macOS's Background Task Management (verified directly with `sfltool dumpbtm` —
toggling flips the entry's `Disposition` between `enabled` and `disabled`). **However**, in dev
mode the registered login item points at the raw `node_modules/electron/dist/Electron.app`
binary with no argument telling it to load this project — `getLoginItemSettings()` confirms this
via `executableWillLaunchAtLogin: false`. A real login would launch bare Electron, not this app.
This is expected and not a bug: full end-to-end verification ("restart the Mac, see the app
come up") only becomes meaningful once the app is packaged into its own `.app` bundle (e.g. via
`electron-builder`), which is not set up yet.

## Folder Structure

- `src/main/` — Electron main process (app lifecycle, tray, windows, IPC handlers, timers).
  Compiled with `tsc` (CommonJS) to `dist/main/`. Currently: `index.ts` (entry, hides dock icon,
  creates the tray), `tray.ts` (Tray + Menu + handlers), `store.ts` (typed electron-store
  wrapper), `preload.ts` (empty stub, reserved for future IPC bridge).
- `src/renderer/` — React UI, built with Vite to `dist/renderer/`. Contains `index.html`,
  `main.tsx` (React entry), and components.
- `src/shared/` — Code and types used by both processes (constants, `AppSettings` shape, etc.).
  No Electron or DOM APIs here — keep it environment-agnostic so it's easy to unit test.
- `dist/` — build output (gitignored).

## Key Architectural Decisions

- **Main vs. renderer responsibilities:** All OS-level integration (tray, global timer,
  auto-launch registration, electron-store reads/writes, window creation) lives in the main
  process. The renderer is presentation-only — it receives state via IPC/preload and sends
  user actions (Drink Water, Snooze, settings changes) back. Do not read/write electron-store
  directly from the renderer.
- **IPC boundary:** `src/main/preload.ts` is the only file allowed to use `contextBridge`.
  Renderer code must go through the bridge it exposes — never enable `nodeIntegration` in a
  `BrowserWindow` to shortcut this. (Preload currently exposes nothing; channels get added as
  each feature needs them.)
- **Tray behavior:** One tray icon for the app's lifetime, built and owned by the main process
  (`src/main/tray.ts`). No icon asset file — `tray.setTitle('💧')` on an empty `nativeImage` is
  used as the placeholder icon (text-only menu bar items are a standard macOS pattern; swap for
  a real image later via `nativeImage.createFromPath`). The dropdown is a native
  `Menu.buildFromTemplate`, not a BrowserWindow: two checkbox items ("Reminders On",
  "Launch at Login") that write straight through to `store.ts` on click, then Set Goal / Remind
  me in 10 min (stubs — `console.log` + a native `Notification`, intentionally non-blocking, no
  `dialog.showMessageBox`), then Quit. All settings reads/writes for the tray go through
  `settingsStore` in `store.ts` — don't instantiate a second `electron-store` elsewhere.
- **Timer:** A single countdown timer lives in the main process (not per-window), since it must
  keep running whether or not the character popup window exists. Default interval: 60 min,
  configurable in Settings, persisted via electron-store.
- **Character popup window lifecycle:** Created (or shown) only when the timer fires; it is
  transparent, frameless, always-on-top, and positioned at the bottom-right of the screen. It
  should be hidden (not destroyed) after Drink Water/Snooze so re-showing it is cheap — destroy
  only on app quit. The slide-in-then-idle-loop animation state lives entirely in the renderer.

## Conventions

- **Naming:** camelCase for variables/functions, PascalCase for React components and TS
  types/interfaces, SCREAMING_SNAKE_CASE for shared constants (see `src/shared/constants.ts`).
- **Commits:** short imperative subject line (e.g. "Add tray icon and on/off toggle"), no strict
  format enforced beyond that.
- **New features:** add main-process logic under `src/main/`, UI under `src/renderer/`, and any
  types/constants shared by both under `src/shared/`. Prefer small, focused modules (e.g. a
  `tray.ts`, a `timer.ts`) over growing `src/main/index.ts` indefinitely.
- **Testing:** favor unit tests for `src/shared` logic; Electron main/renderer integration is
  currently verified by manual smoke test (`npm run dev` / `npm start`), not automated.
  NSStatusItem (Tray) menus are **not** reliably scriptable via System Events/AppleScript on
  this macOS version even with Accessibility + Screen Recording permissions granted — `menu bar
2 of process "<name>"` reliably throws "Invalid index" for this app's tray menu, and
  `screencapture`/`osascript` may be blocked entirely depending on which host process holds the
  permission. The approach that _does_ work for exercising tray/menu logic without clicking:
  monkey-patch `Menu.buildFromTemplate` in a throwaway script to capture the built `Menu`
  instance, then call each `MenuItem`'s own `.click()` (not a manual `.checked` flip — `.click()`
  already auto-toggles checkbox/radio items, so also flipping `.checked` yourself double-toggles
  and silently cancels out). See git history around the Tray feature commit for a worked example.

## Current Status

- [x] Project scaffolded: Electron + React + TS + Vite, folder structure in place.
- [x] Baseline tooling: ESLint (flat config), Prettier, Vitest, `.gitignore`.
- [x] Git repo initialized, GitHub repo created and pushed.
- [x] Tray icon + dropdown menu (Reminders On, Launch at Login, Set Goal…, Remind me in 10 min,
      Quit) — built in `src/main/tray.ts`, verified end-to-end: menu structure, checkbox
      persistence to electron-store, and stub notifications all confirmed by both a manual
      click-through and a direct exercise of the shipped menu handlers. The earlier placeholder
      `BrowserWindow` from initial scaffolding has been removed — the tray is now the app's only
      surface (dock icon hidden via `app.dock?.hide()`).
- [x] Auto-launch at login — `launchAtLogin` toggle wired to `app.setLoginItemSettings`,
      persisted via electron-store, and the underlying OS registration verified directly with
      `sfltool dumpbtm` (toggling flips Background Task Management's disposition between
      enabled/disabled in both directions). **Not yet verified via a real logout/restart** — see
      "Launch-at-login only fully works once packaged" above; that end-to-end test is only
      meaningful after `electron-builder` packaging exists.
- [ ] Main-process countdown timer — not started.
- [ ] Transparent/frameless/always-on-top character popup window — not started.
- [ ] Lottie character animation (slide-in + idle loop) — not started.
- [ ] Drink Water / Snooze / Settings actions and IPC wiring — not started.
- [ ] Settings panel UI — not started.
- [ ] electron-store schema for daily drink-log progress (settings schema exists; progress
      tracking doesn't yet) — not started.
- [ ] `electron-builder` packaging — not started (needed to fully verify launch-at-login).

## Definition of Done

- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes
- `npm run build` succeeds
- For changes touching main-process/window/tray behavior: manually smoke-test with
  `npm run dev` (see the `ELECTRON_RUN_AS_NODE` gotcha above if testing from an Electron-hosted
  terminal)

## External Services / Environment Variables

None yet. All persistence is local via electron-store (a JSON file under the OS app-data dir) —
no network calls, accounts, or API keys.
