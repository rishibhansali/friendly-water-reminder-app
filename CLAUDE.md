# Friendly Water Reminder App — Claude Code Context

## What This Project Is

A personal-use (not App Store distributed) macOS menu bar utility that reminds the user to
drink water on a configurable timer. A tray icon controls on/off state, goal, snoozing, and
opens Settings. When the timer fires, a small transparent/frameless/always-on-top window slides
an animated 2D character in from the bottom-right of the screen, loops its walk cycle, then
offers "Drink Water" and "Snooze" — clicking either walks the character back off-screen before
the window hides. ("Settings" was originally a third overlay button too, but was removed as
redundant once the tray already had its own "Settings…" item.) Progress and settings persist
locally.

**Status:** The full original core loop is complete, packages into a real standalone `.app` via
`electron-builder`, and both renderer UIs (the character overlay and the Settings window) now
have real visual polish instead of placeholder styling. Remaining work: a real tray icon (still
a 💧 emoji placeholder) — see "Current Status" below.

## Tech Stack

- **Electron** — cross-platform desktop shell; gives us a tray icon, always-on-top frameless
  windows, and auto-launch-at-login, none of which exist in a plain browser.
- **React + TypeScript** — renderer UI (the character overlay and the Settings window).
  TypeScript is used in both main and renderer processes for shared types and safety.
- **Vite** — dev server + build for the renderer only (fast HMR, minimal config), as a
  **multi-page build**: `index.html` (overlay) and `settings.html` (Settings window) are both
  listed in `build.rollupOptions.input`. The main process is compiled separately with plain `tsc`
  (see Build Pipeline below) since it's a small amount of Node-targeted code that doesn't benefit
  from bundling.
- **electron-store** — simple local JSON persistence for settings and daily drink log; avoids
  standing up a real database for a single-user desktop tool. **Pinned to v8** (`^8.2.0`), not
  the current v11 — v9+ is ESM-only and cannot be `require()`'d from the CommonJS-compiled main
  process (see Build Pipeline). Re-evaluate the pin only if the main process is ever migrated
  to ESM output.
- **lottie-react** — renders the overlay's character animation: "Groovy Walk Cycle" by David
  Probst Jr (LottieFiles, free license, ID `PgEaXAFsPH`), bundled as
  `src/renderer/assets/groovy-walk-cycle.json`. LottieFiles' site is behind Cloudflare bot
  protection (`WebFetch`/`curl` both get a "Just a moment…" challenge page, not the asset) — the
  file had to be downloaded manually in a browser and handed over, not fetched programmatically.
- **ESLint + Prettier** — linting/formatting, flat ESLint config (`eslint.config.mjs`, ESLint 9).
- **Vitest** — unit tests for shared/pure logic (main and renderer are thin by design; most
  test coverage should target `src/shared`).
- **electron-builder** — packages `dist/` into a real standalone `.app` (see "Packaging" below).
  No code signing certificate or notarization — this is a personal, local-use tool, not
  App Store/Gatekeeper-distributed.

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
- Package a real standalone `.app`: `npm run package` (builds first, then runs
  `electron-builder`) — see "Packaging" below.
- NEVER install packages globally — all dependencies live in `node_modules/`.

### Known environment gotcha

If you run `npm start` or `npm run dev` from a terminal spawned **inside another Electron app**
(e.g. Claude Code's own terminal, VS Code's integrated terminal), the `ELECTRON_RUN_AS_NODE=1`
env var may be inherited from the parent process. This makes `electron .` run as plain Node
instead of launching the real Electron runtime, so `require('electron')` returns a path string
instead of the API object, and `app`/`BrowserWindow` will be `undefined`. Fix: run with
`env -u ELECTRON_RUN_AS_NODE npm start` (or unset it in the shell) when testing from such a
terminal. A real user's Terminal.app/iTerm session does not have this var set.

### Launch-at-login: known constraint of staying unsigned

`app.setLoginItemSettings` / the "Launch at Login" toggle correctly registers/unregisters the app
with macOS's Background Task Management (verified directly with `sfltool dumpbtm` — toggling
flips the entry's `Disposition` between `enabled` and `disabled`, and it shows up correctly in
System Settings → Login Items & Extensions). In **dev mode** (`npm start`/`npm run dev`), the
registered login item points at the raw `node_modules/electron/dist/Electron.app` binary with no
argument telling it to load this project — `getLoginItemSettings()` confirms this via
`executableWillLaunchAtLogin: false`. That part was always expected, not a bug.

**With the packaged, ad-hoc-signed `.app` installed to `/Applications`, a real logout/login was
tested and the app does _not_ auto-launch** — registration succeeds and shows correctly in Login
Items, but nothing starts silently: no process (`ps aux`), no crash log, no entry in Console.app
at all around the login timestamp. Manually opening the app works fine (after the one-time
right-click-Open Gatekeeper override). Stripping the `com.apple.provenance` extended attribute
(a newer, Sequoia-era origin-tracking flag, distinct from classic `com.apple.quarantine`) did not
fix it.

This matches a widely-reported pattern, not just this project: Electron's own issue tracker has
multiple reports of `setLoginItemSettings({ openAtLogin: true })` silently failing to auto-launch
for unsigned/ad-hoc/improperly-signed builds, with the item still showing as "enabled." The likely
mechanism: manually opening an app via Finder gets an _interactive_ Gatekeeper override (the
right-click bypass); the login-item/launchd auto-launch path has no interactive prompt available,
so if the OS's trust check doesn't pass, it just silently declines — no crash, no log, exactly
what was observed. Apple's own policy since macOS 10.15 also ties Developer ID signing and
notarization together for Gatekeeper trust (a cert alone, unnotarized, still isn't fully trusted).

**Conclusion: treat this as a known constraint of staying unsigned, not an open bug — confirmed,
no free workaround exists.** `xattr -l` on the `.app` after a fresh copy into `/Applications`
shows only `com.apple.provenance`, no `com.apple.quarantine` at all — a locally `electron-builder`
-built app that's only ever been moved within the same Mac (never downloaded from the internet)
never picks up the classic quarantine flag in the first place, so there's nothing there to strip.
This rules out the one cheap thing that was worth trying. The blocker isn't an extended
attribute — it's that the login-item/launchd auto-launch path checks code-signing trust with no
interactive override available, and an ad-hoc signature doesn't pass that check.

The well-established fix, per both Apple's policy and community reports, is a real Developer ID
certificate ($99/year Apple Developer Program) **plus notarization** (`xcrun notarytool`,
scriptable via an `electron-builder` `afterSign` hook) — signing alone isn't sufficient on its own
since 10.15. This project deliberately stays unsigned/unnotarized per its original scope (personal
tool, not App Store/Gatekeeper-distributed), so **silent auto-launch-at-login is accepted as not
working** unless that scope changes — a cost/effort decision, not something left to keep chasing
in code.

## Packaging

`npm run package` (`electron-builder`, config in `electron-builder.yml` at the project root, not
inlined in `package.json` — consistent with this project's one-config-file-per-tool pattern)
produces a real standalone `Friendly Water Reminder.app` at
`release/mac-arm64/Friendly Water Reminder.app`. No code signing certificate, no notarization —
`mac.target: dir` outputs the raw `.app` directly (no DMG), which is all a personal local-use
tool needs. `files: [dist/**/*, package.json]` keeps `src/` and everything else out of the
package. No custom app icon yet (electron-builder's placeholder) — that's the separate tray/
character-art polish task.

**Apple Silicon still requires _ad-hoc_ signing just to launch at all** (unrelated to the
Developer ID signing/notarization this project deliberately skips) — arm64 binaries won't run
unsigned. electron-builder logs "skipped macOS application code signing" (no Developer ID
certificate found, expected), but the app still launches fine: the prebuilt Electron.app
framework it wraps already carries its own ad-hoc linker signature
(`codesign -dv` shows `Signature=adhoc`), which is sufficient. Don't try to set `mac.identity:
null` or otherwise disable this — that would strip even the ad-hoc signature and the app
wouldn't open.

Verified end-to-end by launching the packaged binary directly (not `electron .`) and driving it
with the same synthetic-input technique used throughout this project: tray/timer/overlay/
settings/progress all initialize and function identically to `npm start` — a real reminder fire,
a real Drink Water click (incrementing the store and hiding the window), Snooze, and the Settings
window opening and showing live progress, all inside the packaged `app.asar`. This is exactly the
kind of thing that can silently break when moving from dev to packaged (preload script paths,
asar-relative resource paths) and didn't.

## Folder Structure

- `src/main/` — Electron main process (app lifecycle, tray, windows, IPC handlers, timers).
  Compiled with `tsc` (CommonJS) to `dist/main/`. Currently: `index.ts` (entry, hides dock icon,
  initializes settings, creates the tray, initializes the overlay, starts the scheduler),
  `tray.ts` (Tray + Menu + handlers), `timer.ts` (reminder scheduler — see Architectural
  Decisions), `overlay.ts` (Character Overlay Window — see Architectural Decisions), `settings.ts`
  (Settings window — see Architectural Decisions), `progress.ts` (daily drink-count persistence
  and day-rollover — see Architectural Decisions), `launch-at-login.ts` (the one function that
  calls `app.setLoginItemSettings`, shared by `tray.ts` and `settings.ts` so there's exactly one
  place that touches the OS-level login item registration), `notify.ts` (shared console log +
  native `Notification` helper, used by `tray.ts`'s remaining stub and `timer.ts`), `store.ts`
  (typed electron-store wrapper), `preload.ts` (bridge for the overlay window), `settingsPreload.ts`
  (separate bridge for the Settings window — one preload/bridge per window, not one shared bridge).
- `src/renderer/` — React UI, built with Vite to `dist/renderer/` as two pages: `main.tsx` mounts
  `Overlay.tsx` (`index.html`), `settings-main.tsx` mounts `Settings.tsx` (`settings.html`),
  styled by `overlay.css`/`settings.css` respectively. `vite-env.d.ts` pulls in Vite's client
  types (needed for CSS side-effect imports to typecheck). `assets/groovy-walk-cycle.json` is the
  overlay's Lottie animation (see Tech Stack).
- `src/shared/` — Code and types used by both processes (constants, `AppSettings` shape, etc.).
  No Electron or DOM APIs here — keep it environment-agnostic so it's easy to unit test.
- `dist/` — build output (gitignored).

## Key Architectural Decisions

- **Main vs. renderer responsibilities:** All OS-level integration (tray, global timer,
  auto-launch registration, electron-store reads/writes, window creation) lives in the main
  process. The renderer is presentation-only — it receives state via IPC/preload and sends
  user actions (Drink Water, Snooze, settings changes) back. Do not read/write electron-store
  directly from the renderer.
- **IPC boundary:** only preload scripts may use `contextBridge`. Renderer code must go through
  the bridge exposed to it — never enable `nodeIntegration` in a `BrowserWindow` to shortcut this.
  One bridge object per window's concerns, one preload script per window: `preload.ts` exposes
  `window.overlayBridge` (`setInteractive`, `drinkWater`, `snooze`, `onShown`) to the overlay
  window; `settingsPreload.ts` exposes `window.settingsBridge` (`getSettings`,
  `setReminderInterval`, `setDailyGoal`, `setLaunchAtLogin`) to the Settings window. Each action
  method is its own IPC channel with its own `ipcMain.on`/`ipcMain.handle` handler, never one
  shared channel branching on a payload. (There used to be a third overlay action,
  `overlay:settings`/`openSettings`, opening the Settings window from the overlay — removed along
  with its button since the tray already has its own "Settings…" item; see the Character Overlay
  Window entry below.) `overlay:shown` is the one main→renderer push (`webContents.send`, not a
  reply to an `invoke`) — it tells the persistent, reused overlay window "you're visible again"
  so it can replay its entrance animation on every show, not just the first.
- **`settings:get` and `settings:get-progress` use `ipcMain.handle`/`invoke`, not `send`/`on`** —
  they're the only places a renderer needs a value _back_ from main (current settings to populate
  the form; today's drink count to show alongside it), so they're the app's only `invoke`-style
  channels; everything else is fire-and-forget `send`. `Settings.tsx` renders a "Loading…" state
  until the settings promise resolves, rather than rendering inputs bound to `undefined` for a
  frame.
- **Tray behavior:** One tray icon for the app's lifetime, built and owned by the main process
  (`src/main/tray.ts`). No icon asset file — `tray.setTitle('💧')` on an empty `nativeImage` is
  used as the placeholder icon (text-only menu bar items are a standard macOS pattern; swap for
  a real image later via `nativeImage.createFromPath`). The dropdown is a native
  `Menu.buildFromTemplate`, not a BrowserWindow: two checkbox items ("Reminders On",
  "Launch at Login"), a "Settings…" item (opens the Settings window), "Remind me in 10 min" (still
  a stub — independent of the real scheduler's `snooze()`, not wired since there's no UI reason to
  trigger it from the tray specifically), then Quit. A non-clickable info line ("3 / 8 today",
  `enabled: false`) sits above everything else, sourced from `progress.ts`. All settings
  reads/writes for the tray go through `settingsStore` in `store.ts` — don't instantiate a second
  `electron-store` elsewhere.
  **The menu is rebuilt fresh on every click** (`tray.on('click', () => tray.popUpContextMenu(buildMenu()))`)
  rather than built once via `setContextMenu()` at creation time — checkbox items snapshot their
  `checked` state at build time, so a menu built once would go stale the instant a setting changes
  from anywhere else (this was a real latent bug, caught and fixed while building the Settings
  window, before it ever shipped — see Testing below for how it was verified).
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
  - **Visible regardless of which app/Space has focus, not just on bare desktop.** The declarative
    `alwaysOnTop: true` constructor option alone isn't enough for a window to float above other
    apps' windows or follow across virtual desktops/fullscreen Spaces — that needs two explicit
    calls in `createOverlayWindow()`: `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen:
true })` (follows the user across every Space, including fullscreen ones) and
    `win.setAlwaysOnTop(true, 'screen-saver')` (the highest standard Cocoa window level, above
    ordinary app windows). `showOverlay()` also calls `showInactive()` rather than `show()` — this
    shouldn't steal keyboard focus from whatever app the user is actively using when it appears.
    Verified programmatically (`isVisibleOnAllWorkspaces()`/`isAlwaysOnTop()`/`isFocused()` all
    return the expected values) — the actual visual behavior of floating over a real fullscreen
    app or another Space needs your own eyes to confirm, not something safely testable from here
    (would mean creating Spaces / launching fullscreen apps on the real desktop).
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
  - **Two buttons, two IPC channels, two handlers:** Drink Water calls `recordDrink()` +
    `timer.drinkWater()` then `hideOverlay()`; Snooze calls `timer.snooze()` then `hideOverlay()`.
    (A third, Settings, existed briefly — it called `openSettingsWindow()` directly since
    `overlay.ts`/`settings.ts` are both main process, no IPC needed for that hop — but was removed
    along with its button as redundant once the tray already has its own "Settings…" item; don't
    re-add an `overlay:settings` channel without a reason, since this was a deliberate removal,
    not an oversight.)
  - **Hiding:** a real 30s auto-hide fallback (`AUTO_HIDE_MS`) covers the case where the overlay is
    ignored entirely — the only way it hides now besides clicking a button. All hide paths go
    through the same `hideOverlay()`, which also clears the auto-hide timer so it can't fire again
    after an already-hidden window.
  - **Real character animation, not a placeholder:** `lottie-react`'s `<Lottie>` renders
    `groovy-walk-cycle.json` (see Tech Stack) inside `.character-animation`
    (`pointer-events: none`, so hover/click still passes through to its `.interactive-cluster`
    parent — verified directly, see Testing below), `loop autoplay` so the walk cycle repeats
    continuously once settled rather than freezing on one frame (the source animation is a single
    ~1s walk-cycle loop with no separate named "idle" or "facing camera" segment — `data.markers`
    has generic numbered markers, not named ones — so "settled" here means "keeps walking in
    place," not a distinct standing pose; that would need a different/additional source
    animation).
  - **Entrance replays on every show, not just the first — this needed one new IPC message.**
    The window is hidden/reused, never reloaded, so the renderer only ever mounts once; a CSS
    mount-triggered animation (the original placeholder's approach) only ever plays that one time.
    `showOverlay()` now also does `overlayWindow.webContents.send('overlay:shown')` after
    `.show()`; `Overlay.tsx` subscribes via `overlayBridge.onShown()` in an effect and replays the
    entrance (see below) on every event, not just on mount.
  - **Entrance/exit is one CSS transition, driven by one boolean (`settled`), not two separate
    animations.** `.interactive-cluster` transitions `transform` between `translateX(220%)`
    (off-screen right) and `translateX(0)` (settled) over **2.5s, `linear`** — deliberately slow
    and constant-speed so it reads as the character actually walking a visible distance (synced
    with the Lottie walk-cycle looping underneath), not a quick eased slide. (An earlier version
    used `0.5s ease-in-out`, which read as sliding into place rather than walking — flagged and
    fixed.) Entrance: on mount and on every `overlay:shown`, set `settled=false` then flip to
    `true` inside a double `requestAnimationFrame` (lets the browser paint the off-screen state
    first, so the class change is a transition, not an instant jump). Exit: clicking Drink
    Water/Snooze sets `settled=false` (the same transition, reversed — the character visibly
    walks away) and delays the actual `drinkWater()`/`snooze()` bridge call by
    `EXIT_ANIMATION_MS` — **must be kept equal to the CSS duration** (currently `2500`ms matching
    `2.5s`; if one changes, change the other) — so the window doesn't hide out from under the
    animation. This is a renderer-only delay — it changes _when_ the existing bridge methods get
    called, not what they do, and doesn't touch `overlay.ts`'s hide timing at all. Verified by
    sampling the actual computed `transform` matrix (not just the `settled` class — the class
    flips almost immediately on state change, only the CSS-driven visual transform is slow, so
    checking the class name alone gives a false read on animation speed) at several timestamps:
    moves a roughly constant ~145-155px/second, arriving at 0 by ~2.8s; a real Drink Water click
    kept the window visible for ~2.9s before hiding, matching the slow walk-away, not an instant
    disappearance.
  - **The character mirrors depending on travel direction** — a second, independent piece of
    state (`facingLeft`), not tied to `settled`. The source animation faces/walks right by
    default; moving right-to-left (entrance) needs `transform: scaleX(-1)` (the `.mirrored` class
    on `.character-animation`, a _different_ element than `.interactive-cluster` — the mirror and
    the position transition don't conflict since they're on separate elements) so the character
    actually faces the direction it's travelling, while moving left-to-right (exit, back
    off-screen) uses the unmirrored default, which already faces right. Set alongside (not
    animated together with) the `settled` transition: `setFacingLeft(true)` at the start of
    entrance, `setFacingLeft(false)` at the start of exit — an instant flip, not a smooth one,
    since it's a discrete facing change, not a continuous motion.
  - **Buttons are real styled buttons** (`.btn`, `.btn-primary`/`.btn-secondary` in `overlay.css`)
    — a blue/water color theme, not default unstyled `<button>` elements — but the same two
    `onClick` handlers as before, just wrapped in the walk-away delay above.

- **Settings window (`src/main/settings.ts` + `src/renderer/Settings.tsx`):** a real, separate
  `BrowserWindow` — normal frame/title bar, not transparent or always-on-top, unlike the overlay —
  since it's a form the user actively edits, not a transient notification. `openSettingsWindow()`
  creates it on demand and `.focus()`es the existing one instead of opening a duplicate if it's
  already open; it's destroyed (not hidden) on close via the window's own `'closed'` event
  resetting the module's reference to `null`, which is the simpler/more idiomatic choice for a
  window with normal close-button chrome (vs. the overlay's hide-and-reuse, which fits its
  frameless/no-close-button nature better).
  - **Reads/writes `reminderIntervalMinutes`, `dailyGoalMl`, `launchAtLogin`** (the
    `EditableSettings` type in `src/shared/types.ts` — a `Pick` of `AppSettings`, not the whole
    thing; `snoozeMinutes`/`remindersEnabled` aren't edited here). Loads them once via
    `settings:get` on mount; each field writes back on change, not via a Save button.
  - **Validation lives in the main-process IPC handlers** (`isPositiveNumber()` in `settings.ts`),
    not just the form — main is the trust boundary, and the renderer's `type="number" min="1"` is
    only a UX hint. Invalid values (`<= 0`, `NaN`) are logged and silently ignored, leaving the
    store untouched, rather than writing garbage.
  - **Launch at Login here calls the exact same `applyLaunchAtLogin()`** the tray's own checkbox
    uses (`src/main/launch-at-login.ts`) — there is exactly one place that calls
    `app.setLoginItemSettings`, not two independent call sites that could drift.
  - **No live sync between windows while both are open**: if the tray's checkbox is toggled while
    Settings is also open (or vice versa), the one not just-clicked won't visually update until
    reopened. Deliberately out of scope for this task ("keep it simple") — would need
    `webContents.send` pushing updates to whichever window didn't originate the change.
  - **Visual structure is wrapper `<div>`s only** (`.field-group`, `.field`, `.progress-card`,
    etc., in `settings.css`) — a real styling/layout pass (title, card-style progress display,
    consistent label/input spacing, a blue/water theme matching the overlay), with every
    `onChange` handler and its validation left untouched. Adding wrapper elements for layout is
    the only structural change; nothing here altered behavior.

- **Daily progress (`src/main/progress.ts`):** stores a raw drink **count** (`drinksToday`), not
  ml and not per-drink timestamps — no historical/multi-day tracking, just today's count against
  a goal, per scope. `lastDrinkDate` (local `YYYY-MM-DD`) is the only other field.
  - **Day rollover has no scheduled job.** `ensureCurrentDay()` runs at the top of both
    `recordDrink()` and `getTodaysProgress()` — if `lastDrinkDate` isn't today, it resets
    `drinksToday` to `0` and updates the date before doing anything else. This is correct even if
    the app wasn't running at midnight, since the check happens whenever next accessed, not on a
    timer — exactly the "simplest correct approach" this was scoped to.
  - **`drinksToday` is a raw count; the ml-based `dailyGoalMl` is converted to a comparable
    "goal in drinks" only for display**, never stored: `goalDrinks = Math.ceil(dailyGoalMl /
DEFAULT_SERVING_SIZE_ML)` (`DEFAULT_SERVING_SIZE_ML = 250`, in `shared/constants.ts` — chosen
    so the default 2000ml goal reads as a clean "8"). **`Math.ceil`, not `floor`/`round`** — e.g.
    1800ml/250 = 7.2 rounds up to 8, since 7 servings (1750ml) wouldn't actually reach an 1800ml
    goal; flooring or rounding down would under-count how many servings are actually needed.
    `Settings.tsx` recomputes `goalDrinks` client-side from the live `dailyGoalMl` field (not a
    value fetched once from main), so editing the goal updates the displayed ratio immediately
    without another IPC round-trip.
  - **`timer.ts` stays scheduling-only** — `recordDrink()` is called from `overlay.ts`'s
    `overlay:drink-water` handler alongside `timer.drinkWater()`, not folded into
    `timer.drinkWater()` itself, keeping the same one-concern-per-module split already used
    between `tray.ts`/`timer.ts` and `overlay.ts`/`timer.ts`.

- **`app.on('window-all-closed', () => {})` in `index.ts` is required, not decorative.** Without
  it, Electron's default behavior quits the whole app once zero `BrowserWindow`s remain open —
  which would happen for real the first time a user opens Settings (from the tray, before any
  reminder has ever fired so the overlay hasn't been lazily created yet) and then closes it with
  the window's native close button: zero windows open, no handler, app quits, tray icon included.
  This surfaced during this task's own verification (see Testing below) and predates it — a menu-
  bar-only app must never quit just because its last visible window closed; only the tray's own
  Quit item should exit.

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
- **Verifying a native `Menu` reflects current state without a real click**: monkey-patch
  `Tray.prototype.popUpContextMenu` (before `createTray()` is called) to capture whatever `Menu`
  gets passed in and skip actually calling the original (which would try to show a real native
  menu and hang a headless script waiting for it to close). Then call `tray.emit('click')`
  directly — `Tray` is a Node `EventEmitter`, so this fires the exact same handler a real click
  would, rebuilding the menu fresh — and inspect `capturedMenu.items` for the checkbox's `checked`
  value. This is how the tray-menu staleness fix was confirmed: change a setting via the Settings
  window's bridge, then emit a synthetic tray click and check the freshly-built menu reflects it.
- **Waiting on an async React render inside `executeJavaScript`**: don't assume a component has
  finished its first render/effect by the time `executeJavaScript` runs — poll inside the injected
  script itself (a small `resolve`-when-ready loop checking the DOM) rather than adding a fixed
  `sleep` in the outer Node script and hoping it's long enough.
- **For integration-level verification, `require()` the real compiled `dist/main/index.js`
  directly instead of manually re-calling `createTray()`/`initOverlay()`/`startScheduler()` etc.
  in a throwaway script.** Manually reassembling the startup sequence only tests those functions in
  isolation and can silently skip whatever `index.ts` itself does between them (this is exactly
  how the `window-all-closed` bug was caught: a harness that called the individual `init*()`
  functions itself wouldn't have exercised — or caught the absence of — the app-lifecycle handler
  that only lives in `index.ts`). Set any store state needed _before_ requiring `index.js`, then
  `await app.whenReady()` again in the harness (safe — it's the same already-resolving promise) to
  wait for its own `.then()` callback to finish before proceeding.
- **Verifying a _packaged_ app (not `electron .`) needs a different approach**, since you can no
  longer `require()` its compiled files into a controlling script — it's a separate OS process
  running from an asar. Launch the actual binary directly
  (`MyApp.app/Contents/MacOS/<ProductName>`, works fine from a terminal, stdout/stderr included)
  with `--remote-debugging-port=9222`, then drive it over the Chrome DevTools Protocol: `GET
http://localhost:9222/json` lists open pages/windows (each `BrowserWindow`'s loaded URL shows up
  here, including its real `app.asar`-relative path — useful on its own to confirm packaging
  resolved paths correctly), then open a `WebSocket` to a target's `webSocketDebuggerUrl` and send
  `{method: "Runtime.evaluate", params: {expression, returnByValue: true}}` to run arbitrary JS in
  it — e.g. reading `window.screenX/screenY` plus `getBoundingClientRect()` to compute exact
  synthetic-click coordinates, the same way `executeJavaScript` was used for the dev-mode app.
  Node 22+'s global `WebSocket`/`fetch` are enough; no extra dependency needed. Remember to strip
  `ELECTRON_RUN_AS_NODE` from the spawned child's env too, same as every other launch in this
  project.
- **A multi-tool-call gap between "the overlay fired" and "click it" can be long enough for the
  real 30s auto-hide to fire first**, especially when a step in between (like a DevTools Protocol
  round-trip) takes real wall-clock thinking/writing time between separate tool invocations —
  the result looks identical to a bug (window hides with no preceding button-click log) but isn't
  one. Fix: do the whole launch → wait-for-fire → measure-coordinates → click sequence inside a
  single self-contained script (one process, no inter-tool-call latency) rather than spreading it
  across multiple back-and-forth tool calls.
- **Confirming a Lottie/SVG animation is actually progressing (not frozen on one frame) needs the
  _right_ element sampled, not just _an_ element.** Reading one specific nested `<g>`'s `transform`
  attribute twice and finding no change looked like a bug at first, but that particular group
  simply wasn't one of the elements this animation moves — Lottie animates via whichever nested
  elements the source file's layers happen to use (`d` path data, opacity, deeper transforms),
  which varies per asset. Diff the _entire_ `outerHTML` of the animation's root SVG between two
  timestamps instead of guessing which child element changes — if the strings differ at all, it's
  playing.
- **LottieFiles.com is behind Cloudflare bot protection** — both `WebFetch` and a direct `curl`
  (even with a browser `User-Agent`) get a "Just a moment…" challenge page, not the animation JSON
  or its download link. There's no way to script around this; ask the user to download the file
  through their own browser and hand it over (path or the file itself) rather than guessing at a
  substitute animation.
- **A CSS class toggling on a React state change is not proof an animation is slow (or fast).**
  Checking `element.className` right after a state flip will show the new class almost
  immediately (that's just React committing the DOM update) even when the CSS `transition` that
  class triggers takes several seconds to visually complete — this produced a false "the class is
  already there, so the animation must be instant" failure. To verify actual animation _speed_,
  sample `getComputedStyle(el).transform` (or whichever property is transitioning) at several
  timestamps and check the interpolated values, not just whether the target class is present.

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
      enabled/disabled in both directions) and in System Settings → Login Items & Extensions.
      **Registration works; silent auto-launch at a real login does not** — tested with the
      packaged, ad-hoc-signed `.app` via a real logout/login: the item shows enabled, but nothing
      starts (no process, no crash log, no Console.app entry). This is a known constraint of
      staying unsigned/unnotarized, not an open bug — see "Launch-at-login: known constraint of
      staying unsigned" above for the reasoning, sources, and the Developer ID + notarization
      fix (a cost/scope decision, not something to keep chasing in code).
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
- [x] Settings window (`src/main/settings.ts` + `src/renderer/Settings.tsx`) — a real separate
      `BrowserWindow`, create-or-focus (no duplicates), reads/writes `reminderIntervalMinutes`,
      `dailyGoalMl`, `launchAtLogin` via a dedicated `settingsBridge`/`settingsPreload.ts`.
      Validation lives in the main-process handlers. Launch at Login shares the exact same
      `applyLaunchAtLogin()` the tray checkbox uses (extracted to `src/main/launch-at-login.ts`).
      The overlay's Settings button and the tray's renamed "Settings…" item (formerly
      "Set Goal…") both now open this window instead of their old stubs. Verified end-to-end on
      the real running app: form loads current store values, writes persist, invalid
      (`<=0`/`NaN`) values are rejected and leave the store untouched, opening twice doesn't
      duplicate the window, and — the specific concern raised before building this — toggling
      Launch at Login from Settings is correctly reflected in the tray's own checkbox next time
      the dropdown opens. That last check surfaced a real bug that predated this task: the tray
      menu was only ever built once at startup (`setContextMenu()`), so it would have gone stale
      the instant any setting changed from elsewhere. Fixed by rebuilding the menu on every click
      instead (see Architectural Decisions and Testing above) — caught and fixed before shipping,
      not a regression.
- [x] Daily progress / drink-log persistence (`src/main/progress.ts`) — `drinksToday` (raw count) + `lastDrinkDate` in the store, day rollover via `ensureCurrentDay()` checked at every
      read/write rather than a scheduled midnight job. Surfaced in both the tray dropdown (a
      non-clickable "N / M today" line) and the Settings window (a read-only line above the
      form, live-recomputed from the goal field). `recordDrink()` is called from `overlay.ts`'s
      Drink Water handler alongside (not inside) `timer.drinkWater()`, keeping `timer.ts`
      scheduling-only. Verified end-to-end, including a real Drink Water click through the actual
      running overlay incrementing the store and the tray reflecting it, plus specifically the
      `Math.ceil` rounding behavior you flagged (1800ml goal → displays as a goal of 8 servings,
      not 7) and that `electron-store` correctly migrates an existing config file to add the two
      new fields on next launch (no manual migration needed).

      **This surfaced a real, previously-shipped bug**, unrelated to progress tracking itself:
                                  `index.ts` had no `window-all-closed` handler, so Electron's default behavior would quit the
                                  entire app the first time a user closed the Settings window before the overlay had ever
                                  been created (e.g. opening Settings from the tray before any reminder had fired) — zero
                                  windows open, no handler, app (and tray icon) gone. Fixed with a no-op handler; see
                                  Architectural Decisions and Testing above for how it was caught and confirmed fixed.

                                  **This completes the original core loop end-to-end**: tray → timer fires → overlay shows →
                                  Drink Water/Snooze act on the real scheduler and now persist progress → Settings configures
                                  everything, including viewing that same progress.

- [x] `electron-builder` packaging (`electron-builder.yml`, `npm run package`) — produces a real
      standalone `Friendly Water Reminder.app` (no signing/notarization, `mac.target: dir`, no
      DMG). Verified end-to-end by launching the packaged binary directly and driving it with the
      same synthetic-input technique used throughout: tray/timer/overlay/settings/progress all
      initialize and function identically to `npm start`, inside the packaged `app.asar` — a real
      concern for a first packaging pass (preload paths, asar-relative resource paths), and
      nothing broke. **Real logout/login test completed** (by the user, not this agent — see
      "Launch-at-login: known constraint of staying unsigned" above): Launch at Login registers
      correctly but does not silently auto-launch with this unsigned/ad-hoc-signed build. Resolved
      as a documented, accepted constraint rather than an open bug.
- [x] Real Lottie character animation + full visual polish on both renderer UIs — the overlay's
      placeholder box is now the real "Groovy Walk Cycle" animation (`lottie-react`, looping
      continuously once settled — the source file has no separate named idle/facing-camera
      segment, see Architectural Decisions), its two remaining buttons (Settings was removed as
      redundant with the tray's own item) are properly styled, and it now walks in fresh on every
      show and walks away before hiding when Drink Water/Snooze is clicked (needed one new
      `overlay:shown` IPC push from main, since the reused window only ever mounts its React tree
      once). The Settings window got a real layout pass (title, card-style progress display,
      consistent spacing) with zero logic changes. Verified end-to-end: the Lottie SVG genuinely
      animates (diffed full markup across two timestamps, not just one — see Testing above for
      why that mattered), hovering the character graphic itself (not just the buttons) still
      correctly enables click-through interactivity (`pointer-events: none` pass-through), the
      walk-away delay actually delays hiding rather than being instant, and the entrance
      replays correctly on a second show, not just the first.
- [x] Follow-up polish pass on the same feature, after eyeballing it: the walk-in/walk-away was
      too fast to read as walking (0.5s `ease-in-out`) — slowed to **2.5s `linear`**, confirmed by
      sampling the actual computed `transform` value over time (see Testing above — checking the
      `settled` class alone was misleading, since the class flips almost instantly while the CSS
      transition itself takes seconds). Also fixed the overlay only appearing on the bare desktop
      and disappearing when switching apps: added `setVisibleOnAllWorkspaces(true, {
visibleOnFullScreen: true })` and bumped to the `'screen-saver'` always-on-top level, plus
      switched `show()` to `showInactive()` so it doesn't steal keyboard focus from whatever app
      is active. Verified programmatically that the window reports the correct
      workspace/always-on-top/focus state; **the actual "floats above a real fullscreen app /
      follows across Spaces" visual behavior needs your own confirmation** — not something safely
      testable from here without creating Spaces or launching fullscreen apps on the real desktop.
- [x] Second follow-up: the character now mirrors to face the direction it's actually travelling
      — walking in (right-to-left) is mirrored, walking away (left-to-right, back off-screen) uses
      the source animation's native right-facing orientation. Without this, the character's legs
      animated as if walking right while the whole cluster moved left, reading as wrong/unnaturally
      fast rather than as a convincing walk. Verified the `.mirrored` class is present during
      entrance and absent during exit at the right moments.
- [ ] Real tray icon — not started; current placeholder is a 💧 emoji title, no image asset.
      Explicitly out of scope for this task at your request.

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
