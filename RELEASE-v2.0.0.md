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
2. **`NO AUTH ACCOUNT` errors.** ⚠️ Benny's address carries a trailing dot in its local
   part (`benny.loo.k.g.@singhealth.com.sg`), which is not a valid RFC 5321 address —
   Firebase Auth may never have created it. If he is missing, he registers once and you
   re-run. The script is idempotent, so re-running costs nothing.
3. **`matches nobody in the manifest` warnings.** Each one is a document that will be
   left behind. A former colleague is fine; a current one is not.
4. **The roster line** — does the day count look like a year of rostering?

---

## Step 2 — the migration

```
NODE_PATH=~/nexus-migrate-deps/node_modules \
GOOGLE_APPLICATION_CREDENTIALS=~/path/to/key.json \
  node scripts/migrate-to-teams.cjs --write
```

**It copies and never moves.** Not one pre-migration document is modified or deleted.
`system_data/roster_2026` is left byte-identical.

**It is idempotent.** Every write is a merge or an array union, so if it fails halfway,
the fix is to run it again — not to repair anything by hand.

---

## Step 3 — the merge

```
git checkout main
git merge claude/nexus-aura-rostering-session-duo1q5
git push origin main
```

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

- **`D11`** — generation is synchronous; ~23s for 100 staff over a year. Per-team
  partitioning keeps most departments comfortable, but a large one rostering a year
  ahead will still freeze the tab.
- **Removing a member** cannot be done from the app yet. It needs a Cloud Function,
  because the membership document and `users.teamIds` must change together.
- **The roster still stores display names** in its day arrays. Team scoping removed the
  collision that mattered; two identical names inside *one* department would still
  collide, which a lead fixes by editing one of them.
