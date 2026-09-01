# The Firestore backend

The project (`teamcheck-6ea23`) already holds real production data written by an
earlier single-file version of this app. This document records what is in there
and how it maps onto the model the UI uses. The translation lives in exactly one
module: `src/data/adapters.ts`.

## Collection path

Every collection is nested under one fixed document path:

```
artifacts/{APP_ID}/public/data/{collectionName}
```

```ts
const col = (name: string) =>
  collection(db, 'artifacts', APP_ID, 'public', 'data', name);
```

Reading a top-level `/reports` collection returns nothing.

Document ids must not contain Firestore path characters, and ids matching
`__.*__` are rejected outright — hence the reserved targets key is
`team_default`, not `__default__`. The sanitiser is kept identical to the legacy
one so both apps address the same documents:

```ts
const keySanitize = (s: string) => String(s).replace(/[/.\s#$[\]]/g, '_');
```

## Collections

| Collection | Doc id | Holds |
|---|---|---|
| `reports` | auto | one daily report per submission |
| `ideas` | auto | improvement ideas, including anonymous ones |
| `feedbacks` | auto | the whole messaging layer, discriminated by `type` |
| `users` | `emp_*` | `{id, name, pass (SHA-256 hex), role, team}` + `authUid`, `email` after migration |
| `task_schemas` | `global` | legacy task definitions, keyed by Hebrew task name |
| `team_configs` | team name | `{tasks: string[], tasksV2: Task[], alerts}` |
| `employee_targets` | `team_default` or user id | hourly targets |
| `dashboard_checks` | composite | manager "reviewed" marks and range summaries |
| `read_marks` | composite | read state, `{at, userId}` |
| `manual_counts` | auto | **new** — manual counts over an arbitrary date range |
| `monthly_outputs` / `weekly_outputs` | month / week key | legacy manual quantities, untouched |
| `nr_dismissed` | sanitised key | dismissed "not reset" alerts |
| `teams` | — | team list |

## `reports`

The legacy document:

```js
{
  id: 'rep_...', userId, employeeName,
  dateString,        // 'DD/MM/YYYY', he-IL, slash separated
  timestamp,         // ISO string — every range query uses this field
  mood, moodScale: 10,
  workLocation,      // 'משרד' | 'בית'
  totalHours, totalCalls, totalCallsNote, hoursExplanation,
  tasks: [ ... ],    // an ARRAY of task rows, not a map
  ventingText
}
```

Mapping to the domain model:

| Legacy | Domain | Note |
|---|---|---|
| `dateString` | `date` | this app also writes `date` in `YYYY-MM-DD` and keeps `dateString` |
| `workLocation` | `place` | |
| `totalHours` | `hours` | |
| `totalCalls` | `calls` | |
| `hoursExplanation` | `hoursNote` | |
| `ventingText` | `moodText` | mandatory when mood ≤ 7 |
| `tasks[]` | `tasks{}` | array → map keyed by task id |

A task row:

```js
{
  id, type,            // `type` is the Hebrew task NAME
  customTitle, notes, timeSpent,
  numValues: { 'question label': number },
  cbValues:  { 'question label': boolean },
  txtValues: { ... }
}
```

The domain model keys values by **index** into `Task.nums` / `Task.resets`, not
by label, so a renamed question does not orphan its data. Matching on read is by
`taskId` when present (rows this app wrote), then by name, then positionally.
Rows belonging to the ad-hoc "זמן צוותי" schema have no configured task and are
skipped.

Range queries stay on `timestamp`, which is what the existing data is indexed
on. The reports subscription is windowed (`timestamp >= windowStart`) rather
than loading everything, and widens when a longer range is picked.

## `ideas`

```js
{ id, timestamp, dateString, isAnonymous, authorName, authorId,
  improvementText, isCompleted, managerReply?, reportId? }
```

`authorId` is the literal string `'anonymous'` when anonymous. Ideas are joined
back onto their report by `reportId` (documents this app wrote) or by
`authorId` + date. An anonymous idea cannot be joined, so it is surfaced on its
own — and the manager's reply to it is stored but never delivered to an inbox,
because there is no addressee.

## `feedbacks`

One collection, discriminated by `type`:

| Shape | Meaning |
|---|---|
| `type: 'general'`, `userId: <empId>` | private manager note to one employee |
| `type: 'general'`, `userId: 'all'` | team broadcast; this app adds `title` and `mustRead` |
| `type: 'reply'`, `parentId` | reply to a broadcast; this app adds `onlyMgr` |
| `type: 'vent'` | manager's reply to an idea |
| `type: 'task'` | manager's reply to a note written on a task |

`onlyMgr` replies are visible to the manager and the author only. That is
enforced in `firestore.rules`, not just in the UI.

Legacy broadcasts have no `title`, so the first line of `replyText` is used as
one. New broadcasts write both: `title` for this app and `title\nbody` in
`replyText` so the legacy app still renders something sensible.

## `employee_targets`

Legacy shape is `{ tasks: { taskName: rate }, manual: {...}, resetPct }`. This
app writes an `hourly` block holding the domain shape
(`{patel, bot, calls, teams}`) and mirrors the rates back into `tasks` by task
name, so both apps read consistent numbers. Resolution: a personal override doc
(keyed by user id) wins over `team_default`; clearing it falls back to the team
row.

## `read_marks`

The legacy app marks an item read by writing a document whose id is the item's
`id` **field**. This app keeps that for manager notes, and namespaces its own
kinds:

```
read_marks/{kind}__{key}      kind ∈ ideas | taskNotes | replies | messages
```

with `taskNotes` keyed `reportId:taskId` and `replies` keyed `messageId:index`,
sanitised. Both sides default to an unread-only view.

## Security

The legacy app is not securely authenticated: passwords are hashed in the
browser and stored in `users`, and every client can read and write everything.
`firestore.rules` in the repo root fixes that, but it assumes Firebase Auth with
`role` and `empId` custom claims — deploy it only after the migration described
in the README, or the team is locked out.
