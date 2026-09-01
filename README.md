# סיכום יום — Midrag Tuv daily report

Internal web app for the **טיוב** support team at Midrag. Each employee files one
short daily report at the end of their shift; the manager gets an aggregated
view, per-task analysis, per-employee cards, a two-way message channel and a
copy-pasteable report for upper management.

- Hebrew only, **RTL everywhere**
- Desktop web only (the design is authored at a fixed 1280px min-width)
- React + TypeScript + Vite, Firebase (Auth + Firestore)
- Talks to the **existing** `teamcheck-6ea23` Firestore project — the same
  collections the previous single-file app wrote, so no history is lost

---

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the Firebase values
npm run dev
```

The app refuses to start without `.env`: every Firebase identifier comes from
environment variables so none of them are committed. Get the values from the
Firebase console → Project settings → General → Your apps → SDK setup.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src` |
| `npm run migrate:auth` | One-time Firebase Auth migration (see below) |

---

## Authentication

Auth sits behind one interface with two implementations, chosen by
`VITE_AUTH_MODE` in `.env`:

| Mode | What it does | Use it when |
|---|---|---|
| `legacy` (default) | Signs in against the `users` collection using the client-side SHA-256 hash the previous app stored. | Right now — it works against the live data, so the team keeps working. |
| `firebase` | Firebase Authentication (email/password). Profiles are linked by their `authUid` field; `role` and `empId` custom claims drive the security rules. | After the accounts exist. |

**`legacy` mode cannot be secured.** It requires the whole database to be
world-readable, and the password hash is computed in the browser. It is a
bridge, not a destination.

### Migrating to Firebase Auth

```bash
npm i -D firebase-admin
SERVICE_ACCOUNT_FILE=./serviceAccountKey.json APP_ID=teamcheck-6ea23 \
  node scripts/migrate-auth.mjs --dry-run
```

Drop `--dry-run` to actually create the accounts. The script creates one
email/password account per profile, sets the `role` / `empId` custom claims,
writes `authUid` and `email` back onto the profile document, and prints a
temporary password for each new account **once**. Hand those out in person.

Then, in order:

1. set `VITE_AUTH_MODE=firebase` in `.env` and verify that everyone can sign in;
2. deploy the security rules: `firebase deploy --only firestore:rules`;
3. retire `midrag-app-legacy.html` — it is unauthenticated and the rules will
   lock it out;
4. once everyone has signed in, run the script again with `--clear-pass` to drop
   the legacy password hashes.

Doing step 2 before step 1 locks the team out of their own data.

---

## Firestore

Everything lives under one fixed document path:

```
artifacts/{APP_ID}/public/data/{collection}
```

Reading a top-level `/reports` collection returns nothing. See
[docs/BACKEND.md](docs/BACKEND.md) for the collections, the legacy document
shapes and exactly how they map onto the domain model.

Two rules the code holds to:

- **Existing documents are never rewritten.** New writes keep every legacy field
  and only *add* what the new model needs (`date`, per-task `taskId`, `window`).
- **All translation happens in one place** — `src/data/adapters.ts`. Nothing
  else in the app knows a legacy field name.

Manual counts go in a **new** `manual_counts` collection; the existing
`monthly_outputs` / `weekly_outputs` documents are left untouched pending the
client's answer on whether they may be changed.

---

## Project layout

```
src/
  auth/          AuthContext — legacy and Firebase Auth behind one interface
  data/
    adapters.ts  the only module that knows both the legacy and domain shapes
    repo.ts      every Firestore write
  domain/        the numbers: expected calls, aggregates, ranges, summaries
  screens/       one file per screen, employee/ and manager/
  state/
    store.tsx    live Firestore subscriptions, assembled into the domain model
    ui.tsx       screen, range and selection state
  ui/            design primitives (Card, Pill, Toggle, RangeBar, charts)
  types/         the domain model
```

### The productivity model

The one calculation everything else leans on, in `src/domain/calc.ts`:

```
expected = Σ over reported tasks:
  task has numeric questions ? quantity[0] * weight : hoursSpent * weight
```

Window-based tasks always count as 2 hours. Both roles and the management report
read this same module, so the numbers can never disagree between screens. It is
a modelling estimate and is never presented as an authoritative target.

### Tasks

The task list is configuration, not markup: the employee form renders from
`team_configs/{team}.tasksV2`, which the manager edits in
"ניהול משימות ויעדים". Saving also regenerates the legacy `task_schemas/global`
map and the `tasks` name array, so the old app keeps rendering the same form.

Different tasks are measured in completely different ways, and that distinction
is the core of the product: a queue-clearing task asks only "did you clear it,
yes or no" and never a quantity; some tasks are pure quantities; בוט has both.

---

## Design

Tokens live in `src/ui/tokens.ts` and match the handoff exactly: brand magenta
`#BD1854`, square cards with 1px `#E5E3E8` borders, fully rounded pills and
inputs, Heebo from Google Fonts, charts as CSS bars rather than a charting
library. Two rules the layout keeps:

1. Meaningful questions are loud, technical fields are quiet. Shift place, hours
   and the hours note are one thin row; "how was your day" gets a full-width
   block with a 46px scale.
2. The manager reads prose before numbers. Every manager screen opens with a
   generated Hebrew sentence summarising the range, then the figures. Employee
   comparison is deliberately last.

There is no settings tab and no gear icon — settings live inside
"ניהול משימות ויעדים".

---

## Still open

Carried over from the handoff, needs the client's answer:

1. Should a second manual-count entry for the same range **add** (current
   behaviour) or **replace**?
2. Who may edit a report after submission, and how many days back?
3. Where should alerts go — email, Slack, or in-app only? The toggles are stored
   in `team_configs/{team}.alerts`; the Cloud Function that acts on them is not
   written yet.
4. Should the manager's private notes be exportable?
5. May the existing `monthly_outputs` / `weekly_outputs` documents be changed, or
   do manual counts stay in their own collection?
6. Is a mobile or tablet layout needed later? The current design is desktop-only.
