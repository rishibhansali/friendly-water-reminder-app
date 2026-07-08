# Friendly Water Reminder — Project Detailed Report

A complete walkthrough of what this project is, why it's built the way it is, how every piece
wires together, what broke along the way, and how it was all verified — written so you can
explain any part of it cold, the way an interviewer might probe it.

---

## Table of Contents

1. [The elevator pitch](#1-the-elevator-pitch)
2. [Electron fundamentals — the concepts everything else rests on](#2-electron-fundamentals)
3. [Why each piece of the tech stack was chosen](#3-why-each-piece-of-the-tech-stack-was-chosen)
4. [Project structure — the map](#4-project-structure--the-map)
5. [How the pieces are wired together (IPC architecture)](#5-how-the-pieces-are-wired-together-ipc-architecture)
6. [Walking through one full reminder cycle, start to finish](#6-walking-through-one-full-reminder-cycle-start-to-finish)
7. [Component deep dives](#7-component-deep-dives)
8. [Packaging & the code-signing world](#8-packaging--the-code-signing-world)
9. [Real bugs found and fixed — case studies](#9-real-bugs-found-and-fixed--case-studies)
10. [How this was tested without a UI test framework](#10-how-this-was-tested-without-a-ui-test-framework)
11. [How the project was actually built — the workflow](#11-how-the-project-was-actually-built--the-workflow)
12. [Known limitations and why they exist](#12-known-limitations-and-why-they-exist)
13. [What's left / natural next steps](#13-whats-left--natural-next-steps)
14. [Cheat sheet — quick facts for recall](#14-cheat-sheet--quick-facts-for-recall)

---

## 1. The elevator pitch

**Friendly Water Reminder** is a personal macOS menu bar utility. It lives in the menu bar (near
Control Center) as a 💧 icon. On a configurable timer (default 60 minutes), it pops up a small
animated character in the bottom-right corner of the screen — the character visibly *walks in*,
you click **Drink Water** or **Snooze**, and it *walks back out*. It tracks how many drinks you've
logged today against a goal, and all of this is configurable from a Settings window. It's not
distributed on the App Store or to other users — it's a single-person tool, packaged as a
standalone `.app` you run on your own Mac.

It's built with **Electron** (lets you build a desktop app using web technology — HTML/CSS/JS —
instead of native macOS APIs), **React + TypeScript** for the UI, and a handful of small
supporting libraries. The whole thing was built incrementally, one feature at a time, with every
feature actually run and verified on the real, running app before being called done — not just
"the code compiles."

---

## 2. Electron fundamentals

You cannot explain this project without explaining Electron's core mental model first, because
almost every architectural decision downstream comes from it.

### 2.1 Two kinds of process, always

Every Electron app has exactly **one main process** and **zero or more renderer processes**:

- **The main process** runs Node.js. It has full access to the operating system — file system,
  native OS APIs (tray icons, menus, windows, login items, notifications), `npm` packages, etc.
  There is exactly one main process per app, and it's the one that starts when the app launches.
  In this project, that's everything under `src/main/`.
- **A renderer process** is basically a Chrome browser tab. It runs your HTML/CSS/React code. It
  does **not** have access to Node.js or the file system by default — it's sandboxed like a
  normal web page, for security. Each `BrowserWindow` you create runs its own renderer process.
  In this project, that's everything under `src/renderer/` — the character overlay window's UI
  and the Settings window's UI are two *separate* renderer processes.

**Why does this split exist?** Security and stability. If your UI code could freely touch the
file system or run OS commands, then any bug (or malicious content, if you ever loaded a remote
URL) could compromise the user's whole machine. Chromium's renderer sandbox is a hardened,
battle-tested boundary; Electron reuses it and asks you to explicitly poke small, controlled holes
through it when you actually need the renderer to trigger something in the main process.

### 2.2 How a renderer talks to the main process: IPC

Since the renderer can't directly call Node/OS APIs, it has to *ask* the main process to do things
on its behalf. This is done via **IPC (Inter-Process Communication)** — essentially structured
message-passing between the two processes, similar in spirit to how a web page talks to a server
via `fetch()`, except both "ends" are on the same machine.

Electron's IPC has two primitives you'll see everywhere in this codebase:

- `ipcRenderer.send(channel, ...args)` / `ipcMain.on(channel, handler)` — **fire-and-forget**.
  The renderer sends a message; main handles it; nothing comes back. Used for actions like
  "the user clicked Drink Water."
- `ipcRenderer.invoke(channel, ...args)` / `ipcMain.handle(channel, handler)` — **request/response**,
  like an async function call across the process boundary. Used when the renderer needs a value
  *back* — e.g. "give me the current settings so I can populate this form."

### 2.3 The preload script and `contextBridge` — the security boundary

Here's the subtlety that trips people up: even though a renderer *can't* directly call
`ipcRenderer.send(...)` from your React component's code by default (modern Electron disables
`nodeIntegration` for security), it needs *some* way to trigger IPC. The answer is a **preload
script**.

A preload script is a special file that runs in a privileged bridge context — it *can* see
Node.js APIs (including `ipcRenderer`), but it runs *before* your web page's JavaScript and is the
only place allowed to use `contextBridge.exposeInMainWorld(...)`. That call takes whatever
function you give it and exposes it on `window` inside the renderer's normal, sandboxed JS
context — but *only* the specific functions you chose to expose, nothing else.

**Concretely, in this project:** `src/main/preload.ts` runs once when the overlay window loads,
and does this:

```ts
contextBridge.exposeInMainWorld('overlayBridge', {
  drinkWater: () => ipcRenderer.send('overlay:drink-water'),
  snooze: () => ipcRenderer.send('overlay:snooze'),
  setInteractive: (interactive) => ipcRenderer.send('overlay:set-interactive', interactive),
  onShown: (callback) => { /* subscribes to a push from main */ },
});
```

Now, inside `Overlay.tsx` (plain React code, running in the sandboxed renderer), you can call
`window.overlayBridge.drinkWater()` — and *only* that. The React code can never call
`ipcRenderer.send` directly, can never read arbitrary files, can never run shell commands. This
is the whole point: **the renderer only gets exactly the capabilities you explicitly hand it.**

This project has **two** preload scripts — `preload.ts` for the overlay window, `settingsPreload.ts`
for the Settings window — each exposing a *different* bridge object (`window.overlayBridge` vs
`window.settingsBridge`). One bridge per window, matching that window's actual concerns, rather
than one giant bridge with everything mixed together.

---

## 3. Why each piece of the tech stack was chosen

| Piece | What it does | Why this one |
|---|---|---|
| **Electron** | Desktop app shell | Only realistic way to get a native-feeling tray icon, a transparent/frameless always-on-top window, and OS login-item registration, using web tech instead of native Swift/Cocoa |
| **React + TypeScript** | Renderer UI | TypeScript catches whole classes of bugs (wrong types crossing the IPC boundary, typos in prop names) at compile time; React's component model made the overlay's small amount of state (settled/exiting/facing direction) easy to reason about |
| **Vite** | Bundles the renderer code | Fast dev server with hot reload; used here as a **multi-page build** — `index.html` (overlay) and `settings.html` (Settings) are two separate entry points in one Vite config |
| **electron-store** | Local JSON persistence (settings, progress) | Zero-setup key-value store backed by a JSON file in the OS's app-data directory — no need to stand up a real database for a single-user desktop tool. **Pinned to v8**, not the newer v9+, because v9+ is ESM-only (a newer JS module format) and can't be `require()`'d from this project's CommonJS-compiled main process — a real compatibility gotcha hit during development |
| **lottie-react** | Renders the character animation | Wraps `lottie-web`, the standard way to play **Lottie** animations (a JSON-based vector animation format, exported from Adobe After Effects) in a web/React context. The actual animation used is "Groovy Walk Cycle" by David Probst Jr, sourced from LottieFiles.com |
| **electron-builder** | Packages the app into a real `.app` | The standard, most widely used tool for turning an Electron project into a distributable macOS `.app` (or Windows/Linux equivalents). Configured here with no code signing certificate or notarization, since this is a personal tool, not something distributed to others |
| **ESLint + Prettier** | Linting / formatting | Flat config (ESLint 9's newer config format), standard code-quality tooling |
| **Vitest** | Unit tests | Fast, Vite-native test runner. Used narrowly — for pure logic in `src/shared/` — since most of this app's actual behavior lives in Electron's main process, which needs a very different testing approach (see section 10) |

---

## 4. Project structure — the map

```
src/
  main/            ← the ONE main process. Compiled by tsc (plain TypeScript
                      compiler, no bundler needed for this side) to dist/main/.
    index.ts          entry point — wires everything together on app startup
    tray.ts           the 💧 menu bar icon and its dropdown menu
    timer.ts          the reminder countdown/scheduler (fires on an interval)
    overlay.ts        the animated character popup window
    settings.ts       the Settings window
    progress.ts       daily drink-count tracking + midnight rollover
    launch-at-login.ts   the one function that touches app.setLoginItemSettings
    notify.ts         shared native-notification helper
    store.ts          the electron-store instance + its schema/defaults
    preload.ts            IPC bridge for the overlay window
    settingsPreload.ts    IPC bridge for the Settings window

  renderer/         ← TWO separate renderer processes, built by Vite.
    index.html + main.tsx + Overlay.tsx + overlay.css     → the character popup
    settings.html + settings-main.tsx + Settings.tsx + settings.css → Settings window
    assets/groovy-walk-cycle.json    → the Lottie animation data

  shared/           ← plain TypeScript, no Electron/DOM APIs. Imported by
                      BOTH main and renderer (e.g. the AppSettings type, and
                      small constants like the default reminder interval).
                      Kept environment-agnostic specifically so it's easy to
                      unit-test with Vitest.

electron-builder.yml   packaging config (separate file, not inlined in package.json)
CLAUDE.md              the full internal engineering log/reference for this project
README.md              public-facing overview
```

**Why is `src/main` compiled with plain `tsc` while `src/renderer` is bundled with Vite?** The
main process is a modest amount of Node-targeted code — it doesn't need bundling, code-splitting,
or browser-target transforms, so a plain TypeScript compile is simpler and faster. The renderer
is real browser-facing UI code (JSX, CSS imports, needs to run inside Chromium), which is exactly
what Vite is built for.

---

## 5. How the pieces are wired together (IPC architecture)

Here's the full map of every IPC channel in the app, and which direction it flows:

| Channel | Direction | Style | Purpose |
|---|---|---|---|
| `overlay:set-interactive` | renderer → main | `send` | Toggles whether the overlay window is click-through or not, based on mouse hover |
| `overlay:drink-water` | renderer → main | `send` | "Drink Water" button clicked |
| `overlay:snooze` | renderer → main | `send` | "Snooze" button clicked |
| `overlay:shown` | **main → renderer** | `send` | The one message that flows the *other* direction — tells the (persistent, reused) overlay window "you're visible again," so it can replay its entrance animation |
| `settings:get` | renderer → main | `invoke` (request/response) | Settings window asks for current values on load |
| `settings:get-progress` | renderer → main | `invoke` | Settings window asks for today's drink count |
| `settings:set-reminder-interval` | renderer → main | `send` | Field changed |
| `settings:set-daily-goal` | renderer → main | `send` | Field changed |
| `settings:set-launch-at-login` | renderer → main | `send` | Checkbox changed |

**Design rule followed throughout:** every distinct action gets its **own** IPC channel with its
**own** handler function — never one shared "generic action" channel that branches internally on
a payload (like `{type: 'drink-water'}` vs `{type: 'snooze'}` going through one handler). This
matters in practice: when a Settings button was later removed from the overlay, only the one
`overlay:settings` handler needed deleting — nothing else was entangled with it.

**Design rule for validation:** all IPC handlers in `settings.ts` validate their input (e.g.
rejecting a negative or NaN reminder interval) **in the main process**, not just in the React
form. The renderer's `<input type="number" min="1">` is only a *hint* to the user — the real
enforcement is server-side (main-process-side), because the renderer is the untrusted boundary,
the same way you'd never trust client-side validation alone in a web app.

---

## 6. Walking through one full reminder cycle, start to finish

This is the sequence an interviewer would want you to be able to narrate:

1. **App launch** (`index.ts`): hides the dock icon (`app.dock?.hide()` — this is a menu-bar-only
   app, no dock presence), then in order: `initSettings()` (registers Settings' IPC handlers),
   `createTray()` (builds the 💧 icon), `initOverlay()` (registers the overlay's IPC handlers and
   its fire-handler subscription), `startScheduler()` (starts the countdown).

2. **The countdown runs** entirely inside `timer.ts`, using a single `setTimeout` handle. It reads
   `reminderIntervalMinutes` from the store and schedules a fire that far in the future.

3. **The timer fires** (`fireReminder()` inside `timer.ts`): logs to console, fires a native OS
   notification (`notify()`) as a fallback/backup signal, then calls every function that has
   registered itself via `registerFireHandler(...)` — which right now is just `overlay.ts`'s
   `showOverlay`. **Crucially, `timer.ts` has no idea the overlay window exists.** It just knows
   "some function wants to be called when I fire." This is a deliberate decoupling — see section 7.

4. **`showOverlay()` runs** (`overlay.ts`): if the window has never been created, creates it (a
   `BrowserWindow` with `transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true`);
   resets click-through state; recomputes its bottom-right position from the current screen size;
   calls `showInactive()` (shows it *without* stealing keyboard focus from whatever app you're
   using); sends the `overlay:shown` IPC message; and starts a 30-second auto-hide fallback timer.

5. **The renderer receives `overlay:shown`** (`Overlay.tsx`): sets `facingLeft = true` (character
   mirrors to face the direction it's about to travel) and `settled = false` (starts the CSS
   transition from off-screen-right toward its resting position), then — one animation frame
   later — flips `settled` to `true`, which is what actually kicks off the 2.5-second `linear`
   CSS `transform: translateX(...)` transition. The Lottie walk-cycle animation loops
   continuously underneath this, independent of the position transition — two separate visual
   effects (position moving + legs animating) that combine to read as "walking."

6. **You hover the character/buttons** → `mouseenter` fires → `window.overlayBridge.setInteractive(true)`
   → IPC to main → main calls `setIgnoreMouseEvents(false)`, making the whole window click-able.
   Move away → `mouseleave` → the reverse, back to click-through. (See section 7.3 for why this
   only works because the hover listeners are on the *right* DOM element.)

7. **You click "Drink Water"**: `walkAwayThen(() => window.overlayBridge.drinkWater())` runs —
   flips `facingLeft` to `false` (character now shows its native right-facing orientation, correct
   for walking right, back off-screen) and `settled` to `false` (the same CSS transition,
   reversed), then **waits 2.5 seconds** (matching the CSS duration) before actually calling
   `window.overlayBridge.drinkWater()`. This delay is what makes the walk-away visually complete
   *before* the window disappears.

8. **Main receives `overlay:drink-water`**: calls `recordDrink()` (increments today's count in the
   store, with a day-rollover check first), then `timer.drinkWater()` (reschedules a fresh full
   countdown), then `hideOverlay()` (hides the window, clears the 30s auto-hide timer so it can't
   double-fire).

9. **Next time you open the tray or Settings**, they both read the updated `drinksToday` from the
   same store — no direct coupling between any of these modules, just the shared store file.

---

## 7. Component deep dives

### 7.1 The Tray (`tray.ts`)

A native macOS status-bar item. No icon image file is used — `tray.setTitle('💧')` on an empty
`nativeImage` renders as text in the menu bar, which is a completely standard, supported pattern
for menu-bar apps (think of any app that just shows a number or short text up there).

The dropdown is a native `Menu`, built fresh **every single time you click the tray icon**
(`tray.on('click', () => tray.popUpContextMenu(buildMenu()))`) rather than built once and reused.
This was a deliberate fix for a real bug (see section 9.1).

### 7.2 The Timer/Scheduler (`timer.ts`)

Owns exactly one `NodeJS.Timeout` handle (`pendingFire`). Three exported functions:
`startScheduler()` (called once at boot), `drinkWater()` (reschedule a full interval),
`snooze()` (reschedule a short interval). It subscribes to `settingsStore.onDidChange('remindersEnabled', ...)`
so toggling the tray's on/off checkbox starts/stops the countdown *without* `tray.ts` and
`timer.ts` ever directly referencing each other — **the store is the only thing they share.**
This same pattern repeats everywhere in the app: modules don't call each other directly; they
either go through the shared store, or (for the overlay/timer relationship) through an explicit,
one-directional callback registration (`registerFireHandler`), never a two-way dependency.

Design decisions made explicit and intentional (not oversights):
- Turning reminders back on after being off always starts a **fresh full interval** — it doesn't
  try to remember and resume "however much time was left" before it was turned off.
- If you change the reminder interval while a countdown is already in flight, that countdown
  finishes on the *old* value; the new value only takes effect on the next cycle.

### 7.3 The Character Overlay Window (`overlay.ts` + `Overlay.tsx`)

The trickiest component, both visually and technically. Key ideas:

- **Lazily created once, then hidden and reused forever** — never destroyed and recreated on each
  fire. This means the React component inside it only ever *mounts* one time, which is why the
  entrance animation needed a dedicated `overlay:shown` IPC push to replay on subsequent fires
  (a CSS animation that only triggers "on mount" would otherwise only ever play once, ever).

- **Click-through, except over the character/buttons.** By default the window is fully
  click-through (`setIgnoreMouseEvents(true, { forward: true })`) so it never blocks whatever
  you're doing on the desktop underneath it. The `{ forward: true }` part is what still lets
  *mouse-move* events reach the renderer (so it can detect hover) even while clicks pass through.
  The hover listeners that toggle this live specifically on the `.interactive-cluster` wrapper
  (character + buttons together) — **not** on the full window's container div, because the
  container fills the *entire* (mostly empty/transparent) window; if the listeners were on it,
  hovering empty padding space would also make the window stop being click-through, which defeats
  the whole point. (This was an actual bug caught during testing — see section 9.3.)

- **Visible across every Space/app, not just the desktop.** `alwaysOnTop: true` alone doesn't
  make a window float above *other apps'* windows or follow you across virtual desktops
  ("Spaces") — by default it only really shows itself clearly over the bare desktop. Two explicit
  calls fix this: `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` (follow
  across every Space, including fullscreen ones) and `win.setAlwaysOnTop(true, 'screen-saver')`
  (the highest standard macOS window level). `showInactive()` (not `show()`) is used so appearing
  doesn't steal keyboard focus from whatever app you're using.

- **The walking animation itself** is two independent visual effects layered together:
  1. **Position**: `.interactive-cluster`'s CSS `transform: translateX(...)` moves the whole
     character+buttons group horizontally, transitioning over **2.5 seconds, `linear`** (constant
     speed — deliberately *not* eased, since a real walk doesn't speed up and slow down the way
     `ease-in-out` does).
  2. **Leg animation**: the Lottie `<Lottie loop autoplay>` component plays its ~1-second walk
     cycle on repeat, independent of the position transition.
  3. **Facing direction**: the source animation faces/walks right by default. Moving
     right-to-left (walking *in*) needed a horizontal mirror (`transform: scaleX(-1)`, a
     `.mirrored` CSS class) so the character visually faces the direction it's travelling; walking
     back *out* (left-to-right) uses the animation's native unmirrored orientation, since that
     already faces right. This flip is instant (a discrete facing change), not animated.

- **Buttons**: two, not three. Drink Water and Snooze. There used to be a third — Settings — but
  it was removed as redundant once the tray already had its own "Settings…" item, along with its
  now-unused IPC channel and bridge method (dead code was deleted, not left behind).

### 7.4 The Settings Window (`settings.ts` + `Settings.tsx`)

A genuinely different kind of window from the overlay — normal title bar, not transparent, not
always-on-top, since it's a form you actively interact with, not a passing notification.
`openSettingsWindow()` uses a **create-or-focus** pattern: if one is already open, it just calls
`.focus()` on the existing one instead of opening a duplicate. It's destroyed (not hidden) when
closed, since a normal window with a close button is expected to actually go away when closed —
unlike the overlay, which is deliberately hide-and-reuse.

Reads/writes three fields: reminder interval, daily goal (in ml), and launch-at-login. The
"Launch at Login" checkbox here calls the **exact same** `applyLaunchAtLogin()` function the
tray's own checkbox uses (extracted into `launch-at-login.ts` specifically so there's only ever
one code path that touches `app.setLoginItemSettings`, instead of two that could drift apart).

### 7.5 Daily Progress (`progress.ts`)

Stores just two things: a raw integer count (`drinksToday`) and a date string (`lastDrinkDate`,
e.g. `"2026-07-08"`). No per-drink timestamps, no multi-day history — deliberately minimal, since
the scope was "today's count against a goal," not analytics.

**Midnight rollover with no scheduled job.** Instead of running a timer at midnight to reset the
counter (which would fail entirely if the app wasn't running exactly at midnight), a small
function `ensureCurrentDay()` runs at the *top* of both `recordDrink()` and `getTodaysProgress()`:
it compares the stored date to today's actual date, and if they differ, resets the count to zero
and updates the date — right then, whenever next accessed. This is a simple, robust pattern:
correctness is checked opportunistically on access, not on a clock.

The daily goal is stored in **milliliters** (e.g. 2000ml), but progress is tracked as a **drink
count**. To show something like "3 / 8" in the UI, a "goal in drinks" number is *derived* on the
fly — `Math.ceil(dailyGoalMl / 250)` — using `Math.ceil`, not `floor` or `round`, because e.g.
1800ml ÷ 250 = 7.2, and 7 servings (1750ml) wouldn't actually reach the 1800ml goal — you need 8.
This derived number is never stored; it's recomputed from the live goal value every time it's
displayed.

### 7.6 The Store (`store.ts`)

A single typed `electron-store` instance, wrapping a plain JSON file in the OS's app-data
directory (`~/Library/Application Support/friendly-water-reminder-app/config.json`). Its schema
(`AppSettings`) is the one source of truth for every persisted field — every module that needs to
read or write settings imports this same instance rather than creating its own.

---

## 8. Packaging & the code-signing world

This section covers concepts that come up constantly in any "how do you ship a Mac app" question.

**The build pipeline:** `npm run package` runs `npm run build` (compiles `dist/main/` via `tsc`,
bundles `dist/renderer/` via Vite) and then `electron-builder`, which wraps all of that plus a
copy of the Electron runtime itself into `Friendly Water Reminder.app` — a real, double-clickable
macOS application bundle. Config lives in `electron-builder.yml` (kept as a separate file rather
than inlined in `package.json`, matching this project's pattern of one config file per tool).
`mac.target: dir` produces a plain `.app` with no `.dmg` installer, since that's all a personal
local-use tool needs — faster to produce, and there's no one else to hand a polished installer to.

**Three distinct, commonly-confused concepts:**

1. **Ad-hoc signing** — the *minimum* signature macOS requires just for a binary to run at all on
   Apple Silicon (arm64). It has no real identity behind it — no certificate authority vouches for
   it — it's essentially "a signature exists" rather than "someone verified who made this."
   `electron-builder` didn't apply this itself (it logged "skipped macOS application code
   signing" because there's no real certificate installed), but the underlying Electron runtime
   it packages already carries its own ad-hoc signature, which turned out to be sufficient for the
   app to actually launch — confirmed with `codesign -dv`, which showed `Signature=adhoc`.

2. **Developer ID signing** — a *real* certificate ($99/year, requires an Apple Developer Program
   membership) that cryptographically ties the app to a specific, Apple-verified developer
   identity. This is what lets Gatekeeper (macOS's "is this app trustworthy" gatekeeping system)
   show a user a real developer name instead of "unidentified developer."

3. **Notarization** — a separate step (`xcrun notarytool`) where you *upload* your signed app to
   Apple, who scan it and give back a ticket confirming it's not known malware. Since macOS 10.15,
   Developer ID signing and notarization are effectively a package deal: a Developer ID-signed app
   that *isn't* notarized still gets Gatekeeper warnings. You need both, or neither buys you full
   trust.

This project deliberately stays at level 1 (ad-hoc only) since it's a personal tool for one
person, not something being handed to anyone else — but this is exactly why **Launch at Login
doesn't work silently** (see section 12).

---

## 9. Real bugs found and fixed — case studies

These are the best material for "tell me about a bug you found" style questions, because each one
has a clear root cause, a clear fix, and was caught *before* being reported by a user — through
deliberate verification, not luck.

### 9.1 The stale tray-menu bug

**Symptom (hypothetical, caught before shipping):** if you toggled "Launch at Login" from the new
Settings window, the tray's own "Launch at Login" checkbox wouldn't reflect the change — it would
still show whatever state it was in when the tray was first built.

**Root cause:** `tray.setContextMenu(buildMenu())` was called exactly **once**, when the tray was
created at app launch. A native `Menu`'s checkbox items snapshot their `checked` value at the
moment the menu is *built* — they don't re-read the store live every time you open the dropdown.
So the very first menu built at launch became permanently stale the instant any setting changed
from anywhere else (like the new Settings window).

**Fix:** stop calling `setContextMenu()` at all. Instead, rebuild the menu **fresh, from the
current store values, every single time the tray icon is clicked**:
`tray.on('click', () => tray.popUpContextMenu(buildMenu()))`. Now there's no "stale snapshot" to
go wrong — every click gets an up-to-the-millisecond menu.

**How it was verified** (can't literally click a real menu from an automated test — see section
10): monkey-patched `Tray.prototype.popUpContextMenu` to intercept and capture whatever `Menu`
object got passed in (without actually displaying it, which would hang a headless script), then
called `tray.emit('click')` directly (since `Tray` is a Node `EventEmitter`, this fires the exact
same handler a real click would) and inspected the captured menu's checkbox state.

### 9.2 The silent-quit bug (`window-all-closed`)

**Symptom (caught during the daily-progress feature's own verification, unrelated to progress
tracking):** if a user opened Settings from the tray *before* any reminder had ever fired (so the
overlay window had never been lazily created yet), and then closed the Settings window with its
normal close button — the **entire app would quit**, tray icon and all.

**Root cause:** Electron's default behavior, if you never register a `window-all-closed` handler,
is to quit the whole app once the count of open windows hits zero. This app never had that handler
(it was removed early on, back when there were no real windows at all yet, and nobody re-added it
once real windows existed). If Settings is the *only* window that's ever been created, closing it
brings the open-window count to zero — and the app quits.

**Fix:** a deliberately empty handler — `app.on('window-all-closed', () => {})` — since a menu-bar
utility's actual "lifetime" is the tray icon, not any particular window. Only the tray's own Quit
item should ever exit the app.

### 9.3 The hover-listener-on-the-wrong-element bug

**Symptom:** during the overlay window's own initial build-out, hovering the empty transparent
padding *around* the character (not the character itself) also disabled click-through — meaning
you couldn't click things underneath the window even in areas where visually nothing was there.

**Root cause:** the `mouseenter`/`mouseleave` handlers that toggle click-through were originally
attached to the full-window container `<div>`, which fills the entire window — including all the
empty transparent space, not just the visible character/button area.

**Fix:** move the listeners onto the actual visible cluster (`.interactive-cluster`, sized to just
the character + buttons), not the full-window wrapper.

**How it was verified:** synthetic mouse-move events (see section 10) were sent to a point that
was inside the window's bounds but *outside* the visible character — confirming (before the fix)
that click-through incorrectly disabled there, then (after the fix) that it correctly stayed
click-through.

---

## 10. How this was tested without a UI test framework

There is no Playwright/Cypress/Selenium in this project. Electron's main-process logic (timers,
windows, tray, IPC) doesn't fit neatly into a standard web-testing framework, and clicking a
native macOS Tray dropdown from an automated script turns out to be **genuinely unscriptable** on
modern macOS — `System Events`/AppleScript reliably throws "Invalid index" trying to reach a
third-party app's status-bar menu, even with every relevant permission granted. So a different,
more hands-on verification approach was used throughout, consistently:

1. **Require the compiled output directly, drive it with real (shortened) timers.** Instead of
   mocking `setTimeout`, a throwaway script would set the reminder interval to a fraction of a
   minute, `require()` the actual compiled `dist/main/index.js` (the real entry point, not a
   hand-rolled reassembly of individual functions — see the `window-all-closed` bug above for why
   that distinction mattered), and just... wait the few real seconds for it to fire, then inspect
   what happened.

2. **Real synthetic mouse input**, not simulated events. A small Swift script, compiled on the fly
   with `swiftc`, posts genuine `CGEvent`s (`.mouseMoved`, `.leftMouseDown`/`.leftMouseUp`) at
   exact screen coordinates — the same low-level API real mouse hardware uses. Coordinates were
   computed precisely from the window's actual position plus the real DOM's
   `getBoundingClientRect()`, not guessed.

3. **Chrome DevTools Protocol, for testing the packaged app.** Once the app is bundled into a real
   `.app`, you can no longer `require()` its internals into a controlling script — it's a separate
   OS process. Launching it with `--remote-debugging-port=9222` and talking to it over a
   `WebSocket` (using `Runtime.evaluate` to run arbitrary JS inside its actual renderer) gave the
   same level of introspection as the dev-mode approach, for the real packaged binary.

4. **Monkey-patching one Electron method at a time** to make otherwise-unautomatable native UI
   (like the Tray dropdown) inspectable — see section 9.1.

Several of the mistakes made *while building these test scripts* are documented (in `CLAUDE.md`)
as lessons, because they're genuinely non-obvious and easy to repeat:

- Checking a CSS class name right after a React state change proves the state changed, but *not*
  that a multi-second CSS transition has visually finished — the class flips almost instantly;
  only the actual computed `transform` value lags behind for real.
- `getBoundingClientRect()` reflects wherever an element is *right now*, including mid-flight
  during a CSS animation — querying it too early gives you a coordinate the element is about to
  move away from.
- A throwaway script run via `electron some-script.js` (instead of `electron .` from the real
  project) resolves the app's identity differently, pointing `electron-store` at a completely
  different data file than the real app uses.

---

## 11. How the project was actually built — the workflow

This app was built **incrementally, one clearly-scoped feature at a time**, always in the same
rhythm:

1. **Scope the feature.** For anything with real design ambiguity, a short back-and-forth first —
   propose a concrete approach (not open-ended options), flag any real trade-offs, get a quick
   go/no-go before writing code.
2. **Implement it.**
3. **Actually run it and verify it** on the real, running application — not just "it compiles" or
   "the types check." This is where sections 9 and 10 come from: verification wasn't optional or
   an afterthought, it was the definition of "done."
4. **Update the living engineering doc** (`CLAUDE.md`) with what was built, why, and anything
   learned — including bugs found, false starts, and things that turned out *not* to work — before
   moving to the next feature. This is why that document, and this report, can be written with
   this level of confident detail: nothing here is reconstructed after the fact.
5. **Commit, and push when asked.**

The order features were built in followed the natural dependency chain: scaffold the project →
Tray (the app's one permanent UI surface) → the reminder scheduler (needs nothing but the store)
→ the Character Overlay Window (needs the scheduler to have something to react to) → Drink
Water/Snooze/Settings wiring on the overlay → the Settings window itself → daily progress
tracking (deliberately saved for *after* Settings existed, since a goal you can't view or edit
isn't very useful) → packaging → visual polish (real animation, real styling) last, since
placeholder visuals didn't block any of the functional work.

---

## 12. Known limitations and why they exist

**Launch at Login registers correctly, but doesn't silently fire at a real login.** Toggling it
correctly tells macOS's Background Task Management system to launch the app at login (confirmed
directly with `sfltool dumpbtm`, and it shows up properly in System Settings → Login Items).
But a real logout/login test showed the app never actually starts — no process, no crash log,
nothing. The reason: opening an app manually (double-click, or right-click → Open) gets an
*interactive* Gatekeeper trust override from the user. The background login-item launch path has
**no interactive prompt available** — if the OS's underlying trust check on the app's signature
doesn't pass, it just silently declines. An ad-hoc signature doesn't clear that bar; only a real
Developer ID certificate plus notarization does. This was confirmed to be a structural constraint
(not a fixable bug) by checking that the installed app doesn't even carry the classic
`com.apple.quarantine` flag that some documentation suggested might be the real blocker — there
was genuinely nothing left to try for free.

**No live sync between windows.** If you toggle something in the tray while Settings happens to
also be open (or vice versa), the one you didn't just touch won't visually update until reopened.
Deliberately left out to keep scope small — would need main to actively push updates to whichever
window didn't originate a change.

**The Lottie animation has no distinct "idle" pose.** The specific walk-cycle animation used is a
single ~1-second loop with no separate "standing still, facing camera" segment baked into the
source file — so "settled" in this app means "keeps walking in place," not a distinct idle stance.

---

## 13. What's left / natural next steps

- **A real tray icon** — still a 💧 emoji title, no actual image asset.
- **Code signing + notarization**, if Launch at Login is ever worth the $99/year + setup effort.
- **Historical/multi-day progress tracking** — currently only today's count exists at all.

---

## 14. Cheat sheet — quick facts for recall

- **Main process** = Node.js, full OS access, one per app. **Renderer process** = sandboxed
  Chromium tab, one per window, no direct Node/OS access.
- **Preload script + `contextBridge`** = the only sanctioned way for a renderer to trigger
  main-process behavior — expose *specific* functions on `window`, never blanket Node access.
- **`ipcRenderer.send`/`ipcMain.on`** = fire-and-forget. **`invoke`/`handle`** = request/response.
- Two renderer windows in this app: the **overlay** (transparent, frameless, always-on-top,
  click-through except over the character/buttons) and **Settings** (a normal window).
- `electron-store` pinned to **v8** because v9+ is ESM-only and this project's main process
  compiles to CommonJS.
- Tray menu is **rebuilt on every click**, never cached — a real bug (stale checkbox state) was
  found and fixed here.
- `app.on('window-all-closed', () => {})` is **required**, not decorative — without it, closing
  the only open window quits the whole app, including the tray icon.
- Progress tracking: raw **drink count**, not milliliters; goal is stored in ml, converted to a
  "goal in drinks" only for *display*, using `Math.ceil` (not floor/round).
- Day rollover: checked **on every access** (`ensureCurrentDay()`), not via a scheduled midnight
  job — correct even if the app wasn't running at midnight.
- Packaging: **ad-hoc signing** (minimum needed to run on Apple Silicon) ≠ **Developer ID signing**
  (real, paid, verified identity) ≠ **notarization** (Apple scans and tickets your signed app) —
  since 10.15, Developer ID + notarization are a package deal.
- Launch-at-Login doesn't silently work here because it's unsigned/unnotarized — confirmed to be
  a structural Gatekeeper limitation, not a code bug, and not fixable for free.
- Testing approach: no Playwright/Selenium — real synthetic `CGEvent` mouse input, requiring
  compiled output directly, and Chrome DevTools Protocol for the packaged binary, since native
  macOS Tray menus are not reliably scriptable via AppleScript on modern macOS.
