# v2.0.0 — the multi-team cutover

**Read this in order. The order is the point.**

This is the only release in NEXUS's history where a deploy alone breaks the app. Every
other release could be pushed and judged afterwards; this one changes where the data
lives, and the deployed bundle reads the new place and **nothing else**.

---

## The one thing to get right

```
1.  MIGRATE      scripts/migrate-to-teams.cjs --write
2.  THEN MERGE   git push origin main   →   auto-deploys
```

**Not the other way round.** Pushing to `main` triggers
`.github/workflows/deploy.yml`, which builds and deploys immediately. The new bundle
reads `teams/{teamId}/…`. If it lands before the migration, five practising clinicians
open NEXUS to an empty roster, an empty wellbeing panel and a blank feed — and nothing
on screen explains why, because from the app's point of view the team simply has no
data yet.

The window between the two steps is the only moment of real risk in this release, and
it is entirely within your control: make it short, and make it quiet.

---

## Before the day

| | |
|---|---|
| ☐ | **`config/superAdmins` exists** in Firestore — document ID typed exactly, field `emails` (array) containing your address. Without it the approval function fails closed and **nobody can create a team, including you**. |
| ☐ | **`config/domains` exists** (optional). Without it the code falls back to `kkh.com.sg` and `singhealth.com.sg`, which is correct today. |
| ☐ | **Tell Evelyn, Ashik and Mini.** They lose access the moment the deploy lands — see *Who loses access* below. Better heard from you than from the screen. |
| ☐ | **Pick a quiet moment.** Not mid-week, not while somebody is arranging cover. The live roster belongs to five clinicians. |
| ☐ | **Service account key** downloaded (Console → Project settings → Service accounts → Generate new private key), stored **outside the repo**. |
| ☐ | **`firebase-admin` installed where the script can find it** — see Step 0. It is not a dependency of the app, only of this script. |
| ☐ | **Back up the pre-migration documents.** `node scripts/backup-legacy.cjs` — read only, same key as the migration, writes one JSON file next to you. It needs no Cloud Storage bucket, no `gcloud` and no extra IAM role, which a real Firestore export does. The migration copies rather than moves, so the legacy documents ARE the rollback; this covers the case the design does not — somebody using the app between the migration and the deploy. A proper export (`gcloud firestore export gs://…`) is still better if you have a bucket to hand. |
| ☐ | **Capture the current rules.** Console → Firestore → Rules → History; save the deployed text somewhere outside the repo. Rolling back the bundle without rolling back the rules leaves the old app locked out of its own paths. |
| ☐ | **Note the current hosting release** (Console → Hosting → Release history). Rollback is one click from that list, and finding it under pressure is not the moment to learn where it lives. |

---

## Step 0 — the one dependency

`scripts/migrate-to-teams.cjs` needs `firebase-admin`. The app does not, so the root
`package.json` does not list it, and the script cannot run until you put it somewhere
Node can resolve.

**Install it outside the repo**, so the working tree stays clean:

```
mkdir -p ~/nexus-migrate-deps && cd ~/nexus-migrate-deps
npm init -y >/dev/null && npm install firebase-admin
```

Then prefix every command below with `NODE_PATH=~/nexus-migrate-deps/node_modules`.

**Why not just `npm install firebase-admin` in the repo?** It works, but it rewrites
`package.json` and `package-lock.json`, and `git checkout main` then refuses to
switch branches — *"Your local changes to the following files would be overwritten
by checkout"*. If you have already done it, `git checkout -- package.json
package-lock.json` undoes it; `node_modules` is untracked, so the module stays
installed and you can drop the `NODE_PATH` prefix.

**Any version works.** The script imports `firebase-admin/firestore` and
`firebase-admin/auth` — the subpath form, which behaves the same on v13 and v14.
An earlier version of the script used `admin.firestore()`, which v14 removed from
the root export, and it died with `TypeError: admin.firestore is not a function` on
the line that opened the database. That is fixed; the note is here so a future
version bump does not look like a broken script.

---

## Step 1 — the dry run

> **Two checks now run in CI that did not exist when this was written.**
> `scripts/migrate-to-teams.test.mjs` drives this script against a fake Firestore and
> asserts the three properties this whole runbook rests on — it copies rather than
> moves, it is idempotent, and it refuses to overwrite. `npm run stress:teams` fuzzes
> the team-id derivation and the approval decision. Both are green on the release
> candidate; neither replaces reading the dry-run output below, because neither can
> know which seven people are supposed to be in the team.

Writes nothing. This is the default; `--write` is the only thing that changes it.

```
NODE_PATH=~/nexus-migrate-deps/node_modules \
GOOGLE_APPLICATION_CREDENTIALS=~/path/to/key.json \
  node scripts/migrate-to-teams.cjs
```

**Read the output before going further.** Four things to check:

1. **The reconciliation line** should read
   `✓ 7 of 7 members resolved to a Firebase Auth account.`
   Anything else starts with `❌` and names who is missing. It used to print a
   third clause — *"10 of 10 accounted for"* — built from manifest constants, which
   appeared even on a run where nothing resolved at all; it is now a separate
   `MANIFEST INCONSISTENT` warning that stays silent unless the manifest itself has
   drifted. See `scripts/reconcile.cjs` and its tests.
2. **The project id on the first screen.** The run now prints `Project:` and the
   service-account address before it reads anything. **Check it against the Firebase
   console.** A key for a different project authenticates fine, finds none of your
   colleagues, and reports that none of them have registered — which is true of that
   project and says nothing about this one.

3. **`NO AUTH ACCOUNT` errors.** ⚠️ Benny's address carries a trailing dot in its local
   part (`benny.loo.k.g.@singhealth.com.sg`), which is not a valid RFC 5321 address —
   Firebase Auth may never have created it. If he is missing, he registers once and you
   re-run. The script is idempotent, so re-running costs nothing.
4. **`matches nobody in the manifest` warnings.** Each one is a document that will be
   left behind. A former colleague is fine; a current one is not.
5. **The roster line** — does the day count look like a year of rostering?

---

## Step 2 — the migration

```
NODE_PATH=~/nexus-migrate-deps/node_modules \
GOOGLE_APPLICATION_CREDENTIALS=~/path/to/key.json \
  node scripts/migrate-to-teams.cjs --write
```

**It copies and never moves.** Not one pre-migration document is modified or deleted.
`system_data/roster_2026` is left byte-identical.

**It is idempotent, by refusing to overwrite.** A destination that already exists is
left alone and reported with `=`, so a second run writes only what the first did not.
If it fails halfway, run it again.

⚠️ **This changed, and the old behaviour could lose data.** It used to
`set(…, {merge: true})` over whatever was there, on the reasoning that a merge is
idempotent. It is not: `merge` replaces any field it is given, and while maps survive
(their keys are separate field paths) **arrays do not**. The team's wellbeing document
is an array — `AuraPulseBot` appends check-ins to `logs`. So migrating, going live, and
then re-running once a colleague finally registers would have replaced the live `logs`
with the stale legacy one and destroyed every check-in written in between, silently.
Re-running is now safe in the way this file always claimed it was.

---

## Step 3 — the merge

⚠️ **THERE ARE TWO BRANCHES IN v2.0, AND THEY SHOULD LAND AS ONE DEPLOY.** This
section originally described the roster branch alone, because the community portal
rebuild did not exist when it was written. Merging them separately means two
deploys, two windows, and a period where the public portal is live with `CP1` —
the risk score that never measured physical activity — still in it.

The community branch is a descendant of an older point on the roster branch, so it
does not yet contain the migration fixes. Bring them together on the community
branch first, verify once, then merge that:

```
# 1. the roster work into the community branch
git checkout claude/nexus-community-portal
git merge claude/nexus-aura-rostering-session-duo1q5
npm test && npm run lint && npm run build

# 2. the combined result to main — this is the deploy
git checkout main
git merge claude/nexus-community-portal
git push origin main
```

### The one conflict, and its resolution

⚠️ **The first merge conflicts on `package.json`, in exactly one place.** Both
branches added an npm script to the same block, so git sees two insertions sharing
one anchor line. It is not a disagreement — **both entries must survive**:

```
<<<<<<< HEAD
    "stress:community": "vite-node scripts/community-stress.mjs",
    "test:watch": "vitest"
=======
    "test:watch": "vitest",
    "stress:teams": "vite-node scripts/teams-stress.mjs"
>>>>>>> claude/nexus-aura-rostering-session-duo1q5
```

Resolve to all three lines, minding the trailing commas:

```json
    "stress:community": "vite-node scripts/community-stress.mjs",
    "stress:teams": "vite-node scripts/teams-stress.mjs",
    "test:watch": "vitest"
```

Then `git add package.json && git commit`. Nothing else conflicts, and the second
merge — the combined branch into `main` — is a clean fast-forward.

*(This section originally claimed both merges were conflict-free. That was written
from having rehearsed community → `main` and roster → `main`, never roster →
community, which is the direction that actually collides. Rehearsing it is what
found this, and moving the script to a different line in the block does not help:
JSON's trailing comma means any insertion at either end rewrites its neighbour.)*

CI runs `npm test`, `npm run lint`, builds, then deploys functions, **firestore rules**
and hosting. The rules deploy is part of this step — that is what seals the old paths.

---

## Step 4 — check it worked

In this order, because each depends on the last:

1. **Sign in.** You should land on the roster, not the holding screen.
2. **The roster renders**, with the same weeks it had before.
3. **The staff pool is five** — open Configure. It was four; you are now in it.
4. **The burnout monitor lists your team** and nobody else's.
5. **`/admin/teams`** loads the approval queue. Empty is correct.
6. **Ask a colleague to sign in.** They should see the same roster.

---

## Who loses access, and why it is not a bug

**Evelyn, Ashik and Mini are not in team #1.** That decision is recorded in
`scripts/team-one-manifest.cjs` with its reasoning.

They can still sign in — the domain allowlist admits both their domains — and they will
see *"nobody has added you to a team yet"*. They will see no roster, no wellbeing data
and no feed. **Today they can read all three.**

**Their records are not deleted.** Nothing is: the migration copies. If any of them
should be invited back, their history is still there to attach.

---

## If it goes wrong

The rollback is real because the migration copies:

1. **Firebase Console → Firestore → Rules → history → restore the pre-v2 rules → Publish.**
   This is first: the v2 rules seal the old collections, so a v1 bundle cannot read its
   own data until they are back.
2. **Redeploy the previous bundle** — revert the merge commit on `main` and push, or
   roll back in Firebase Hosting's release history.

The old app then reads the old documents as if nothing had happened. The `teams/…`
documents the migration created are simply ignored; they cost storage and nothing else,
and a second migration run will bring them back up to date whenever you retry.

**What is NOT recoverable this way:** anything written *through the new app* between the
deploy and the rollback — a swap answered, a wellbeing log, a roster edit. Those land in
`teams/…` and the old app will not see them. That is the real reason to keep the window
short and quiet.

---

## What this release does not fix

Stated here so it is not discovered on the day:

- **`D11`** — generation is synchronous. Re-measured by `npm run stress` on the
  release candidate: **17s for 100 staff over 52 weeks, 35s for 200**. (This section
  previously said ~23s, from an earlier run on different hardware; the shape of the
  problem is unchanged.) Per-team partitioning keeps most departments at 20–40 people
  where it is comfortable — it does not make that number smaller, and a large
  department rostering a year ahead will still freeze the tab.
- **Removing a member** cannot be done from the app yet. It needs a Cloud Function,
  because the membership document and `users.teamIds` must change together.
- **The roster still stores display names** in its day arrays. Team scoping removed the
  collision that mattered; two identical names inside *one* department would still
  collide, which a lead fixes by editing one of them.
