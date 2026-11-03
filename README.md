# Bug Squasher · GDGoC VinUni

A mobile arcade game built with Vite, React and TypeScript. No installation or player accounts required. Google colors, animated GDGoC bugs, synthesized arcade audio, touch feedback and a live TV leaderboard.

## Run locally

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the URL printed by Vite. On a phone on the same network, use your computer's LAN address instead of `localhost`.

- Player: `/`
- TV: `/#/tv` (also linked on the registration screen)

Without Firebase configuration the app runs in **local demo mode**. Open the player and TV in two tabs of the same browser and origin to see leaderboard updates and celebration overlays. Local demo scores do not sync between devices. The QR code must use a reachable LAN or public URL; a phone cannot open the TV computer's `localhost`.

## Gameplay

Enter a name/handle and a `@vinuni.edu.vn` email, then tap Start debugging. After the countdown, you have 30 active seconds:

| Target | Points |
| --- | ---: |
| Blue syntax bug | +100 |
| Red null pointer | +150 |
| Green race condition | +200 |
| Golden GDGoC bug | +300 |
| Clean code or coffee | −150 |

Scores floor at zero. Bugs move faster and dodge more as your score rises. In the last five seconds, the arena changes color, spawn frequency doubles and bugs award double points. Hazards remain −150. Switching away from the page pauses active play. Sound can be muted; vibration depends on device support (iOS may ignore it).

The results screen shows your score, personal best, accuracy, streak and bug breakdown. Submissions are queued locally before sending. Retry and reconnect use the same run ID so a timed-out submission cannot become two scores. If browser storage is blocked or cleared, unsent scores cannot be retained after closing the page.

## Connect phones and the TV with Firebase

1. Create a Firebase project and register a Web app in Project settings.
2. Create a Cloud Firestore database. Do not enable unrestricted test-mode access.
3. Copy `.env.example` to `.env.local` and fill in the Web app configuration. Set `VITE_PUBLIC_GAME_URL` to the player page's public HTTPS URL or reachable LAN URL.
4. Publish `firestore.rules` through the Firebase console's Firestore Rules tab, or use the Firebase CLI:

   ```sh
   firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
   ```

5. Restart Vite (or rebuild for hosting). Launch `/#/tv` on the TV and the player URL on phones.

The app stores public run statistics in `scores`, one best run per player in `leaderboard`, and emails in `entries`. The provided rules deny browser reads of `entries` and require validated, atomic public/private writes. The leaderboard uses a transaction, so many attempts by one player cannot crowd out everyone else. Each arriving submission triggers a TV celebration, including runs below a personal best.

Email entry is self-reported, not proof of student identity. This account-free client game does not provide tamper-proof competition scores or prevent automated submissions. For prize-bearing competition, add trusted server-side validation and abuse controls. Public player IDs are deterministic email hashes, not cryptographic anonymization. Tell players about event data collection and set a retention policy appropriate for your event.

Firebase configuration values identify the Web app; they are shipped to browsers. Firestore rules enforce access. Never put service-account credentials in `VITE_*` variables or commit `.env.local`.

## Build and host

```sh
npm run build
npm run preview -- --host 0.0.0.0
```

Deploy the generated `dist/` directory to a static host. A Firebase Hosting configuration is included:

```sh
firebase deploy --only hosting,firestore:rules --project YOUR_PROJECT_ID
```

The deployment machine needs the Firebase CLI installed and authenticated. Environment values are compiled into the build, so set them **before** running `npm run build`. Hash routes work on static hosts without a special server. Prefer HTTPS on public hosting for browser API support.

Override the TV QR destination for a single event display with `/?play=https%3A%2F%2Fyour-game.example%2F#/tv`.

## Checks

```sh
npm test
npm run lint
npm run build
```

The Node test suite uses Vite's module loader without starting an HTTP server. It checks identity validation, scoring, penalties, frenzy, pause input, leaderboard deduplication, retry idempotency, email exclusion from public local rows and offline queue recovery. Canvas and browser APIs are stubbed; these checks do not replace testing touch, audio, real Firebase rules or cross-device synchronization in browsers.
