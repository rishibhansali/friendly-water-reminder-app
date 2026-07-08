# Friendly Water Reminder App — Claude Code Context

## What This Project Is

A personal-use (not App Store distributed) macOS menu bar utility that reminds the user to
drink water on a configurable timer. A tray icon controls on/off state, goal, and snoozing.
When the timer fires, a small transparent/frameless/always-on-top window slides an animated
2D character in from the bottom-right of the screen, settles into an idle loop, then offers
"Drink Water," "Snooze," and "Settings." Progress and settings persist locally.

**Status:** Tray, the reminder scheduler, and the Character Overlay Window (placeholder visual,
real Drink Water / Snooze / Settings-stub buttons) are all working. No Settings UI or daily
progress persistence yet — see "Current Status" below.

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
  creates the tray, initializes the overlay, starts the scheduler), `tray.ts` (Tray + Menu +
  handlers), `timer.ts` (reminder scheduler — see Architectural Decisions), `overlay.ts`
  (Character Overlay Window — see Architectural Decisions), `notify.ts` (shared console log +
  native `Notification` helper, used by `tray.ts` stubs and `timer.ts`), `store.ts` (typed
  electron-store wrapper), `preload.ts` (`contextBridge` bridge for the overlay window — first
  real IPC channel in the app; see IPC boundary below).
- `src/renderer/` — React UI, built with Vite to `dist/renderer/`. `main.tsx` (React entry) mounts
  `Overlay.tsx` (the Character Overlay Window's content — currently the only renderer entry
  point; a future Settings panel will need its own window/entry, decide multi-entry-point Vite
  config vs. a second window at that point), styled by `overlay.css`. `vite-env.d.ts` pulls in
  Vite's client types (needed for CSS side-effect imports to typecheck).
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
  `BrowserWindow` to shortcut this. It currently exposes `window.overlayBridge` (`setInteractive`,
  `drinkWater`, `snooze`, `openSettings`) for the Character Overlay Window — one bridge object per
  window's concerns is the pattern; a future Settings window would get its own
  `window.settingsBridge`-style object rather than everything piling onto one global bridge. Each
  of the three action methods is its own IPC channel (`overlay:drink-water`, `overlay:snooze`,
  `overlay:settings`) with its own `ipcMain.on` handler — deliberately not one shared
  `overlay:action` channel branching on a payload, so wiring up the real Settings window later
  only touches the `overlay:settings` handler, not a shared one all three actions run through.
- **Tray behavior:** One tray icon for the app's lifetime, built and owned by the main process
  (`src/main/tray.ts`). No icon asset file — `tray.setTitle('💧')` on an empty `nativeImage` is
  used as the placeholder icon (text-only menu bar items are a standard macOS pattern; swap for
  a real image later via `nativeImage.createFromPath`). The dropdown is a native
  `Menu.buildFromTemplate`, not a BrowserWindow: two checkbox items ("Reminders On",
  "Launch at Login") that write straight through to `store.ts` on click, then Set Goal / Remind
  me in 10 min (stubs — call `notify()` from `notify.ts`, intentionally non-blocking, no
  `dialog.showMessageBox`), then Quit. All settings reads/writes for the tray go through
  `settingsStore` in `store.ts` — don't instantiate a second `electron-store` elsewhere. The
  tray's "Remind me in 10 min" stub is independent of the real scheduler's `snooze()` — it isn't
  wired to `timer.ts` yet (no UI wiring until the Character Overlay Window exists to trigger it).
- **Timer / reminder scheduler (`src/main/timer.ts`):** A single countdown lives in the main
  process (not per-window, and not owned by the tray), since it must keep running regardless of
  whether any window exists. It holds one `NodeJS.Timeout` reference (`pendingFire`) and exposes
  three functions:
  - `startScheduler()` — called once from `index.ts` on app launch. Schedules the first
    countdown from `reminderIntervalMinutes` (if `remindersEnabled`), then subscribes to
    `settingsStore.onDidChange('remindersEnabled', ...)` so toggling the tray checkbox
    starts/stops the scheduler live, without `tray.ts` and `timer.ts` needing to know about each
    other directly — the store is the only coupling between them.
  - `drinkWater()` — clears any pending timer and reschedules a fresh full interval.
  - `snooze()` — clears any pending timer and reschedules using `snoozeMinutes` instead.

  These are the exact two functions the Character Overlay Window's "Drink Water" and "Snooze"
  buttons call — that turned out to be pure wiring (IPC → these functions), no new scheduling
  logic needed, exactly as planned. A fired reminder calls `notify()` (kept as a fallback even
  now that the overlay exists) and then sits idle until `drinkWater()`/`snooze()` is invoked
  (via the overlay's buttons, or a test) — there's no auto-repeat.

  Re-enabling after being toggled off always starts a **fresh full interval**, never resumes
  remaining time from before it was disabled (deliberate simplicity — no need to persist/track
  elapsed time across the off period). Likewise, if `reminderIntervalMinutes` is ever changed
  (once Settings exists) while a countdown is already running, that countdown finishes on
  whatever value was in effect when it was scheduled; the new value only applies to the next
  cycle. Both of these are intentional, not gaps to revisit.

  `clearPending()` runs unconditionally at the top of every reschedule path (including when
  `remindersEnabled` is false), so there's no scenario where a timer keeps running silently after
  being disabled — verified directly (see Testing below).

- **Character Overlay Window (`src/main/overlay.ts` + `src/renderer/Overlay.tsx`):** Lazily
  created on the _first_ reminder fire, then reused for the app's lifetime — hidden (`win.hide()`)
  after each interaction/timeout, never destroyed, so re-showing is instant. `initOverlay()` is
  called once from `index.ts` and registers `showOverlay` with `timer.ts` via
  `registerFireHandler` — this is the one and only link between the two modules, and it's
  one-directional (`overlay.ts` depends on `timer.ts`, never the reverse), so `timer.ts` stays
  usable/testable with zero UI code.
  - **Window flags:** `transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
resizable: false, movable: false`. Size `320×260` (bumped from an initial `320×220` to fit the
    button row), positioned so the window's right/bottom edges sit `20px` inset from the screen's
    work-area right/bottom edges (`bottomRightPosition()`, computed from
    `screen.getPrimaryDisplay().workArea` — recomputed on every `showOverlay()` call, not cached,
    so it stays correct if the display config changes between fires).
  - **Click-through:** defaults to `setIgnoreMouseEvents(true, { forward: true })` (fully
    click-through, but mouse-move events still forwarded to the renderer so it can detect hover).
    The renderer's `mouseenter`/`mouseleave` handlers send `overlay:set-interactive` over IPC;
    main flips `setIgnoreMouseEvents` accordingly. **These listeners live on the `.interactive-
cluster` wrapper div** (the placeholder box + button row together), not the outer full-window
    container — the container fills the whole (mostly transparent) `320×260` window, so binding
    hover there would make the empty padding block clicks too, defeating the point of
    click-through. (Caught and fixed during the Character Overlay Window task's own verification
    — see Testing below.)
  - **Show resets click-through state unconditionally** (`showOverlay()` always calls
    `setIgnoreMouseEvents(true, { forward: true })` before `show()`), so a window re-shown while
    the cursor happens to already be sitting over where the box will render doesn't inherit
    whatever interactive state it was left in.
  - **Three buttons, three IPC channels, three handlers:** Drink Water calls `timer.drinkWater()`
    then `hideOverlay()`; Snooze calls `timer.snooze()` then `hideOverlay()`; Settings — no
    Settings window exists yet — logs and calls `notify()` as a stub (same pattern as the tray's
    existing "Set Goal…" stub), then `hideOverlay()`. Drink Water intentionally does **not**
    persist anything yet beyond a console log — daily drink-log persistence is its own later task
    (holding off until Settings exists, so there's a UI to view/set the goal against).
  - **Hiding:** a real 30s auto-hide fallback (`AUTO_HIDE_MS`) covers the case where the overlay is
    ignored entirely — the only way it hides now besides clicking one of the three buttons. The
    earlier "click anywhere hides" stand-in from the previous task is gone; it would have
    conflicted with clicking a specific button. All hide paths go through the same `hideOverlay()`,
    which also clears the auto-hide timer so it can't fire again after an already-hidden window.
  - **Placeholder visual:** a plain rounded box plus a row of three plain buttons below it
    (`overlay.css`), both inside `.interactive-cluster`, which as a whole slides in via CSS
    `transform: translateX(150%) → translateX(0)` on mount — from the window's right edge, which
    sits at the screen's right edge, so it reads as sliding in from off-screen. Buttons appear
    immediately alongside the box rather than after a separate "settle" animation — the original
    concept describes them appearing once the character settles, but sequencing that is an
    animation-timing detail out of scope for this task, not attempted here. No idle loop, no
    Lottie — separate future task.

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
  For timing-sensitive main-process logic (the scheduler), a throwaway script requiring the
  compiled `dist/main/*.js` directly, driven with real (short) delays via `setTimeout`/`await
sleep(...)`, is the way to verify async behavior for real rather than reasoning about it —
  this caught nothing wrong here, but it's how `electron-store`'s `onDidChange` was confirmed to
  fire synchronously within `.set()` (see `conf`'s source: the `store` setter calls
  `this.events.emit('change')` synchronously after writing), so there's no race between `tray.ts`
  writing a setting and `timer.ts` reacting to it.
- **Electron's exported classes (`Notification`, etc.) are not configurable** —
  `Object.defineProperty(electron, 'Notification', ...)` throws `TypeError: Cannot redefine
property`. Don't try to monkey-patch them directly in a test harness; instead intercept at a
  layer you control (e.g. wrap `console.log` to count the log line your own code emits before
  calling the Electron API).
- **Driving real mouse input for window/click-through testing, without Screen Recording
  permission:** `screencapture` and any pixel-capture approach may be blocked for whichever host
  process is running the shell, even with Accessibility access granted — that's a separate macOS
  permission. Injecting _synthetic mouse events_ only needs Accessibility, though, and doesn't
  need a screenshot to verify: compile a tiny Swift script with `swiftc` that posts
  `CGEvent(mouseEventSource:mouseType:mouseCursorPosition:mouseButton:)` (`.mouseMoved`,
  `.leftMouseDown`/`.leftMouseUp`) via `.post(tap: .cghidEventTap)`, `swift` is preinstalled on
  macOS via Xcode command line tools. Confirm it's actually moving the real cursor by reading
  `CGEvent(source: nil)?.location` before/after. Combined with computing the target window's
  on-screen rect from the same constants the main-process code uses (window position + CSS
  layout), this is how the overlay's click-through region was verified for real — moving the
  synthetic cursor into empty (padding) space produced no log output (correctly ignored), moving
  it onto the visible box triggered `set-interactive: true` (and this is exactly what caught the
  hover-listener-on-the-wrong-element bug above — the first version logged `set-interactive: true`
  even when hovering empty padding, since the listener was on the full-window container).
- **A throwaway script run as `electron <script>.js` does not share the real app's electron-store
  file.** Electron resolves `app.getName()` (which determines the `userData` path electron-store
  writes to) from the nearest `package.json` to the entry point — running `electron .` from the
  project root resolves to `friendly-water-reminder-app`, but running a standalone verification
  script elsewhere (e.g. in a scratchpad dir with no `package.json`) resolves to the generic
  `"Electron"`, pointing at a completely different `userData` dir. Pre-editing the real app's
  `config.json` before launching a scratch script will silently have no effect. Fix: have the
  script call `settingsStore.set({...})` itself at the top, same as every other exercise script
  in this project's history — hermetic and immune to this, rather than trying to make the paths
  match.
- **`getBoundingClientRect()` reflects in-flight CSS `transform` animations.** Querying a button's
  screen position for a synthetic click immediately after a window becomes visible can capture a
  mid-animation (moving) coordinate rather than its final resting position, if anything animates
  via `transform` on mount (as the overlay's slide-in does) — the position at click-time then
  differs from the position computed earlier, and the click misses. Wait for the animation
  duration to elapse before computing click targets from `getBoundingClientRect()`.
- **Hovering back into an already-`:hover`ed element after hide/show doesn't refire `mouseenter`.**
  Hiding and re-showing the same (not reloaded) `BrowserWindow` doesn't reset the renderer's DOM
  hover state — if the synthetic cursor lands back on/near an element it was already considered
  "inside" from before the hide, no new `mouseenter` fires, so `overlay:set-interactive` never
  gets resent and the window can stay click-through despite `showOverlay()` having reset it. Move
  the synthetic cursor to a neutral point outside the interactive area first (forcing a real
  `mouseleave`), then into the target — mirroring how a real user's cursor naturally arrives from
  outside the window anyway.

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
- [x] Main-process reminder scheduler (`src/main/timer.ts`) — `startScheduler()` /
      `drinkWater()` / `snooze()` implemented and verified with a real (short-interval) exercise
      script requiring the compiled module directly: fires on interval when enabled, `snooze()`
      and `drinkWater()` correctly reschedule, disabling mid-countdown clears the pending timer
      with no leak, re-enabling starts a fresh full interval, and `onDidChange` fires exactly
      once per `.set()` call with no double-fire. Not yet wired to any UI — `drinkWater()`/
      `snooze()` are only called manually/by tests right now; the Character Overlay Window will
      call them for real.
- [x] Character Overlay Window (`src/main/overlay.ts` + `src/renderer/Overlay.tsx`) — transparent/
      frameless/always-on-top/skipTaskbar window, lazily created on first fire and reused
      thereafter, positioned bottom-right (20px inset from work-area edges), placeholder box
      slides in via CSS. Click-through everywhere except the visible box. Verified end-to-end on
      the real running app: fire → window shows at the exact computed screen coordinates,
      hovering the box enables interaction, hovering empty window padding correctly stays
      click-through (a bug where the hover listener was on the wrong element was caught and
      fixed during this verification — see Testing above). Not independently confirmed by eye
      that the slide-in CSS animation _visually_ plays (no Screen Recording permission for a
      screenshot) — the mechanism is a standard unconditional CSS transition on mount, low risk.
      You said you'd eyeball this yourself; update this line once confirmed.
- [x] Drink Water / Snooze / Settings actions and real IPC wiring — three buttons, each its own
      IPC channel and its own `ipcMain.on` handler (no shared branching handler, so wiring the
      real Settings window later only touches the `overlay:settings` handler). Drink Water calls
      `timer.drinkWater()`, Snooze calls `timer.snooze()`, Settings logs + stub-notifies (no
      Settings window yet) — all three then hide the window. The 30s auto-hide is now a real
      permanent fallback (re-labeled from "temporary stand-in"); the old "click anywhere hides"
      behavior is gone, since it would've conflicted with clicking a specific button. Verified
      end-to-end on the real running app for all three buttons plus the auto-hide fallback, via
      the same synthetic-input technique as the Character Overlay Window task — this surfaced two
      more test-harness gotchas (in-flight CSS transform coordinates, and stale DOM hover state
      surviving hide/show) now documented in Testing above; no bugs in the shipped code itself
      this time.
- [ ] Lottie character animation (real character art, idle loop) — not started; current
      placeholder is a plain colored box plus plain buttons.
- [ ] Settings panel UI — not started.
- [ ] electron-store schema for daily drink-log progress — not started; deliberately held off
      until Settings exists (a UI to view/set the goal against makes progress tracking more
      meaningful). Drink Water currently only console-logs, doesn't persist a count.
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
