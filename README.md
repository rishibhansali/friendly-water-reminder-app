# 💧 Friendly Water Reminder

A personal macOS menu bar app that reminds you to drink water — a countdown timer fires an
animated character that walks in from the corner of your screen, waits for you to log a drink or
snooze, then walks back off.

Built for personal use, not App Store distribution.

## Features

- **Menu bar tray icon** with an on/off toggle, quick access to Settings, and today's progress
  ("3 / 8") at a glance
- **Configurable reminder timer** that keeps running in the background regardless of which app
  you're using
- **Animated character overlay** — walks in from the bottom-right of the screen, loops its walk
  cycle, and walks back off when you respond. Click-through everywhere except the character and
  buttons, so it never blocks whatever you're doing underneath
- **Drink Water / Snooze** actions right on the popup
- **Daily progress tracking** — a simple count against your goal, resetting automatically at
  midnight
- **Settings window** for reminder interval, daily water goal, and launch-at-login

## Tech stack

Electron + React + TypeScript, built with Vite, animated with
[lottie-react](https://github.com/Gamote/lottie-react) ("Groovy Walk Cycle" by David Probst Jr,
via [LottieFiles](https://lottiefiles.com/free-animation/groovy-walk-cycle-PgEaXAFsPH)),
persisted locally with [electron-store](https://github.com/sindresorhus/electron-store), and
packaged with [electron-builder](https://www.electron.build/).

## Getting started

```bash
npm install
npm run dev      # hot-reload dev mode
# or
npm start        # run the last production build
```

## Building a standalone app

```bash
npm run package
```

Produces `Friendly Water Reminder.app` in `release/mac-arm64/` — no code signing or notarization,
since this is a personal, local-use tool. Copy it to `/Applications` (or anywhere) and open it —
macOS will ask for a one-time Gatekeeper override on first launch since it's unsigned.

## Known limitation: Launch at Login

The "Launch at Login" toggle correctly registers with macOS, but on this unsigned build the app
doesn't actually auto-start silently at login — Apple's Gatekeeper trust model treats interactive
launches (double-click, right-click-Open) differently from the background login-item launch path,
and only the former gets a bypass for unsigned apps. A real Apple Developer ID certificate plus
notarization is the standard fix; not pursued here since this is a personal tool, not something
distributed to other people.

## Development

Everything about the architecture, conventions, and what's been built so far lives in
[`CLAUDE.md`](./CLAUDE.md).
