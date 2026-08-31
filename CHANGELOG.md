# Changelog

All notable changes to **NEXUS** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Single source of truth for the app version is `package.json` `version`.** The
`README.md` title line, the shields.io badges and the *Supported Versions* table are
downstream of it and must be kept aligned.

The **AURA engine version** (currently `v2.3`) is a *separate* internal version
tracking the agent's capability tier. It moves independently of the app version and is
not changed by this release.

> ### How to read this file
>
> This changelog was created at **v1.6.0**; the repository had none before. Two things
> follow from that, and both are stated explicitly rather than papered over:
>
> 1. Everything under **[1.6.0]** was classified by reading commit **diffs**, because
>    this repository's commit subjects (`Update RosterView.jsx`, `Update index.js`, …)
>    carry no intent. The classification covers the **last ~30 commits** — the
>    roster-relevant recent history — not all 616 commits in the repository. It is
>    therefore accurate for the recent window and **incomplete before it**.
> 2. Everything under **[Reconstructed history]** was transcribed from the existing
>    *Release History* section of `README.md`. It was **not** derived from git history
>    and has **not** been verified against the code. Treat it as the historical record
>    the README asserts, not as an audited one.
>
> No git tag existed for any version at the time of writing (616 commits, 0 tags), so the
> entries below were not written against tags. *(Corrected 2026-08-15: the repository is tagged
> now — every release from `v1.6.0` to `v1.14.0` sits on the commit whose `package.json` already
> reads that version, so `git checkout v1.13.0` works. The one exception is
> `v1.5.0-pre-remediation`, which marks the state before this work began and reads `1.0.0`.)*
> `git checkout vX.Y.Z` still does not work for the reconstructed versions below `v1.6.0`, and
> never will.
>
> ### Ids — `D`n and `Q`n are two different series
>
> `D`n in this file is a **defect**, from `ROSTER_QC_AUDIT*.md` or the post-mortem — and the same
> number can mean *different* defects in different audits, so a cell names its source where it
> can. `Q`n is an **open decision for the owner**, listed in `ROSTER_HANDOFF.md` §5. Those were
> `D`n until 2026-08-14 and kept their numbers when renamed, so anything said in conversation
> still maps; there is no `Q9`. Released entries below were written before the rename and are
> corrected in place rather than rewritten.

---

## [Unreleased]

---

## [2.6.0] - 2026-08-31

A roster master who carries *some* of the department's duties, and an acronym short
enough to read in a calendar on a phone.

### Added

- **`onlyTasks` on a membership — "this person takes these duties, not all of them".**
  The department lead who reported this is on the roster for two of nine duties. The
  engine could already express it: a cohort window with a `tasks` list and no dates
  narrows *which* duties somebody is eligible for without narrowing *when*. What did
  not exist was any way to say so about a real colleague.

  A lead now sets it per person in **Admin → Team**, comma-separated. Blank means every
  duty. `staffRowsFromMembers` turns a non-empty list into exactly one window with
  **blank date bounds**, which the wizard mapper then drops entirely — so the engine
  receives `{ tasks: [...] }` and reads it as "these duties, always".

  ⚠️ **An empty list must reach the engine as no `windows` key at all**, and that is
  the property most worth its test. Note where the omission happens: the wizard *row*
  always carries a `windows` array (`createStaffRow` normalises it, empty when
  unrestricted), and it is `buildDemoRosterV2ConfigFromTables` that omits the key from
  the engine config — `...(windows.windows.length === 0 ? {} : { windows })`. The engine
  switches time-bounded eligibility on for the *whole* configuration the moment any
  staff entry carries a `windows` key, so an unasked-for empty list would start judging
  a department that has never heard of rotations — and the symptom would be `unfilled`
  reasons about cohort windows shown to a roster master who set none.

  ⚠️ **It is a limit, not an addition**, and both the editor and the roster drawer say
  so. Naming duties means the person is rostered for *only* those; leave one out and
  they silently stop being rostered for it.

- **`shortName` on a membership — the acronym the calendar and the `.ics` use.**
  `[Exercise Test] Lead: Muhammad Alif, Co: Brandon Feng` spends most of an Outlook
  event title on names, and on a phone the title is most of what you can see. A lead
  can now record up to eight characters per person, used in the roster calendar chips
  and in the VEVENT `SUMMARY`: `[Exercise Test] Lead: MA, Co: BF`.

  **The full names move rather than disappear** — they are appended to the event
  `DESCRIPTION` whenever the title was shortened, because an acronym only helps if
  opening the event still answers "who is that?", and a colleague reading somebody
  else's roster has no reason to know the department's initials.

  **The `.csv` deliberately keeps full names throughout.** A spreadsheet column has no
  width to run out of, and `MA` under a heading of `Lead` is strictly worse for the
  analysis a CSV export exists for.

  ⚠️ Commas, semicolons and backslashes are **refused** rather than escaped. Those are
  RFC 5545 delimiters, and one of them in a `SUMMARY` either truncates the title or
  splits it into properties the calendar misreads. Refusing at the input is cheaper
  than escaping at every exporter and hoping none is added later. A newline is
  collapsed to a space rather than refused.

### Fixed

- **The staff table's "More" drawer offered controls that could not work, and had for a
  release.** A lead trying to limit themselves to some duties opened the drawer in live
  mode, pressed **Add availability window**, and nothing happened — so they reasonably
  concluded the feature was broken. It was not broken; it was unreachable, and the
  press was a no-op *twice over*:

  1. live rows are `liveStaffRows`, a `useMemo` over the team's membership, while
     `onStaffChange` is `patchStaffRow`, which calls `setDemoStaffRows` — the table
     rendered one array and the handler updated a different one; and
  2. `patchStaffRow` matches on `row.id`, and a live row's id comes from a member uid,
     so the lookup found nothing in the sandbox array anyway.

  `StaffTable` already *took* a `readOnly` prop and honoured it for **Add row** and
  **Remove** — it simply never passed it to `StaffRowDetail`. The drawer is now
  read-only in live mode, **shows** the values, and names **Admin → Team** as where they
  are set, the same way the table's footnote already did for grade and profession.

  ⚠️ **The guard is behavioural, not just the `readOnly` attribute.** A test proved
  `fireEvent.change` fires straight through that attribute, because it is enforced by
  the browser and not by the DOM — so a keystroke that got through would have patched
  the sandbox array again. Every write in the drawer now passes through a function that
  is a no-op in live mode; the attribute stays as well, because it is what stops a real
  browser accepting the keystroke and what tells a screen reader the field is not for
  editing.

  Hiding the values instead would have been the other wrong answer: a lead looking at
  somebody limited to two duties needs to see that from the roster screen, even though
  it is changed elsewhere.

- **The sandbox's own short-name cell was a second dead control, with no consumer at
  all.** Found by an audit one step after the drawer fix above — which is the point
  worth recording: the same class of defect (a control that renders, accepts typing and
  reaches nothing) existed twice in the feature, and fixing the reported instance did
  not find the unreported one. In demo mode the short-name map was not built from the
  sandbox rows, so an acronym typed into the sandbox table changed no chip and no
  export. The map is now built from `demoStaffRows` in demo mode, and from membership in
  live mode.

- **The unknown-duty error told the reader to edit a field they cannot reach.** It read
  "an availability window names X, which is not a task in the table below … or leave the
  task list blank", but a limit can now arrive from a *membership* (`onlyTasks`), and in
  live mode the staff table is read-only — so the instruction was impossible, and the
  person who typed the duty name is usually not the person pressing Generate. It now
  names the duty, lists the duties that *do* exist (the check is case-sensitive and
  exact, so the correct spelling is the one thing the reader needs), and names **both**
  places the limit could have come from.

- **`memberProfile.js` imported `./rosterEngineV2` and `../data/mockData` without the
  `.js` extension.** Harmless under Vite, but `rosterWizard.js` documents that it must
  resolve under plain Node ESM as well — and it now imports `memberProfile.js`, so the
  extensionless imports would have broken that guarantee for anything importing the
  wizard from a script. Both are explicit now, matching the convention the file it
  imports already follows.

- **A stale comment in `RosterView.jsx` claimed `firestore.rules` is never deployed.**
  Untrue since v2.0.0, when decision `Q6` was closed and the rules began deploying — a
  comment that would have talked a future reader out of relying on the rules for exactly
  the access control they do enforce.

- **The member-editor button's `aria-label` did not mention roster limits**, so a screen
  reader user opening it was told it edited profession and grade and then found two more
  fields. It now reads "Edit profession, grade and roster limits for …".

### Verified

- **Four mutations had survived the entire suite, and one more was a JSX-escape.** The
  `shortNames` memo, the calendar chip, the ICS button and `downloadICS` dropping its
  options could each be broken without a single test failing — meaning **nothing proved
  that a typed short name reached a chip or a file**. The feature was tested at its ends
  (the pure helpers, and the Firestore write) and nowhere across the middle. End-to-end
  tests in `RosterView.reach.test.jsx` now drive the path a lead actually takes, and all
  five mutations are caught.
- **`TeamMembersPanel.test.jsx` had zero references to either field**, despite the panel
  being where both are set; it now covers the write.
- **9 assertions added to `scripts/firestore-rules-verify.mjs`** — 149 passed, 0 failed
  on the emulator, including that a member cannot set either field on themselves.
- Full suite: **3373 passing**, lint clean.

### Security

- **`firestore.rules`: `shortName` and `onlyTasks` added to the *lead's*
  `changedKeys().hasOnly` list on a membership update, and deliberately **not** to the
  member's own.** `shortName` is how colleagues identify somebody on a shared calendar,
  which is the same argument that keeps `displayName` off the self list. `onlyTasks` is
  which duties somebody carries: a person who could edit their own could opt out of a
  duty without telling anybody — the roster would still generate, and nobody would be
  short until the day itself.

  Neither field grants a lead anything they did not already have; they already control
  `role`, `rostered`, `fte` and `skills` on the same document.

- **A short name never enters an identity field.** `shift.lead`, `shift.coLead` and
  `shift.staff` keep full names, and the substitution happens only in text on its way
  out. Four separate things compare a name by equality — `findAppliedSwapShift`
  verifies an applied swap with `shift.staff === buildShiftStaffLabel(...)`, the
  calendar decides "my shift" with `s.lead === user?.name`, and `rosterPersonView`
  builds somebody's own week the same way — and stored Firestore documents already hold
  the full-name form. Substituting upstream would have quietly stopped people
  recognising their own shifts. `buildShiftStaffLabel`'s output format is unchanged, and
  an export with no short names is byte-identical to the previous release.

### Known limitations

- **A hand-corrected `shift.staff` string is discarded once anybody on that shift has an
  acronym.** `auraEngine.exports.test.js` pins, on purpose, that a two-person `SUMMARY`
  uses `staff` verbatim even where it disagrees with `lead`/`coLead` — "a live document
  whose display string was hand-corrected must keep exporting the hand-corrected
  string". That pin still holds for the no-short-names path. But the moment anybody on a
  shift has a short name the label is rebuilt from `lead` and `coLead`, and anything in
  `staff` not derivable from those two is lost — `(acting)`, for instance. It has to be
  that way round: the stored string is a full-name sentence, so trusting it would mean
  ignoring the acronym for exactly the common two-person case. A deliberate trade-off —
  and as of this release **asserted by a test rather than only stated in a comment**,
  which is how it was found: stated in a code comment and checked nowhere.

- ⚠️ **An old cached PWA bundle silently ignores `onlyTasks` — backwards-compatible in
  shape, not in behaviour.** This is the one to watch on rollout. A second lead whose
  browser still holds a pre-2.6.0 bundle from the service-worker cache presses
  **Generate**, and their bundle does not know the field exists: it writes a roster that
  puts the restricted person on **every** duty, and reports success. Nothing errors,
  nothing warns, and the roster looks legitimate to everyone including the person who
  generated it. The document shape is additive and no old client fails to *read* it,
  which is why this release is a minor and not a major — but "the old client ignores the
  field safely" is true of the data and false of the outcome. Until every lead's bundle
  has refreshed, a lead who sets `onlyTasks` should confirm the generated roster
  themselves rather than trust that a colleague's Generate honoured it.

---

## [2.5.0] - 2026-08-31

Roster a colleague who has not registered yet — because four months of roster should
not wait on a registration relay.

### Added

- **`scripts/add-pending-member.cjs` — placeholder members.** `inviteMember` resolves an
  address to a Firebase uid and refuses when there is none, because a membership is
  *keyed* by uid, and `firestore.rules` has `allow create: if false` on the members
  subcollection — a lead who could mint a membership for an arbitrary uid could sign in
  as it. All correct, and it meant a department could not build next month's roster until
  every colleague had registered.

  **But the roster does not need a uid.** `rosteredMembers` is
  `members.filter(p => p.rostered !== false)` and the engine rosters `displayName`. A uid
  is needed for exactly two things: signing in, and being the target of a coverage swap.
  So a member record with no real uid is **rosterable and cannot be signed in as** — that
  asymmetry is the whole safety argument, not a convenience.

  The script writes a member keyed `pending-<slugged-email>` plus their grade, following
  the established conventions: dry run by default, the project named before anything is
  read, an address that already has a real account **left alone and reported**. The id is
  derived from the email so adding twice is one row, and `email:Name:Grade` is a single
  argument because parallel flags silently mis-pair when one list is shorter — and
  mis-pairing here writes somebody else's grade against a colleague's name.

  **What a placeholder cannot do is stated in the script**: sign in, see their own roster,
  request cover, be swapped with, or log wellbeing. It is a name and a grade in the staff
  pool. Everything else waits for the real account.

- **`inviteMember` now replaces a placeholder rather than duplicating the person.** This is
  the half that makes the other half safe. When somebody finally registers and a lead adds
  them, a membership is created under their real uid — and without this the placeholder
  would still be in the staff pool. The department would then have **two of one
  colleague**, both rostered, and the engine would give one person two duties at once
  believing they were two people. A double-booking a roster master would have to catch by
  eye.

  Matched on the `pendingEmail` field rather than the id — the id is for humans reading a
  console, the field is the contract — and the delete is **in the same batch** as the
  membership write, with the placeholder's orphan grade document. A separate delete could
  succeed while the membership write failed, or fail after it succeeded, and either order
  leaves the department in exactly the state this prevents.

  Nine tests. One of them failed on its first draft for a reason unrelated to the code: it
  matched the *first* `db.batch()` in `functions/index.js`, which belongs to a different
  handler. It is anchored on the query now.

### For the roster owner, right now

```bash
npm i --no-save firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
  node scripts/add-pending-member.cjs --team <teamId> \
    --person brandon.feng.gq@kkh.com.sg:Brandon:AH11 \
    --person fadzlynn.mohamad.fadzully@kkh.com.sg:Fadzlynn:AH13
```

Dry run first — it prints the project and every document it would write. Add `--write`
once that reads correctly. Both appear in the staff pool immediately, with grades, and
the four-month roster can be generated tonight. When they register, adding them through
the app replaces the placeholder automatically.

---

## [2.4.1] - 2026-08-31

v2.4.0 put the new options in the dropdowns and left the validators behind them
unchanged. Reported on the first member the owner tried to edit.

### Fixed

- **"Admin is not on the MOH profession list."** `isValidProfession` built its set from
  `MOH_PROFESSION_LEAVES` alone, so `Administrator` rendered as an option, was chosen,
  and was refused on save. There is now one exported list —
  `SELECTABLE_PROFESSION_LEAVES` — that decides both what the picker offers and what the
  validator accepts. Two places answering "what is a valid profession" from two different
  sources is the shape of this bug, and the same shape as the two domain checks and the
  two grade parsers this repository has already been caught by.

- **`NN8` would have been refused next, and nobody had hit it yet.** `isValidGrade` and
  the wizard's `gradeCellReason` both matched `GRADE_SCALE.includes(...)`, which is
  exactly `AH7`…`AH17`. The Non-Nursing spelling added in v2.4.0 was offered in two
  dropdowns and rejected by both validators.

  **Fixed as an exact match over both label sets, deliberately NOT `parseRank`.** The
  first attempt used the scale's parser and a test caught it: `parseRank` is a *lexer* —
  it accepts `ah13`, `AH 13`, `AH07`. Those are right to read and wrong to store. A
  validator deciding "may this be written to the member document" has to insist on the
  canonical spelling, or the same grade ends up written two ways and every comparison
  downstream has to know it.

- `professionLabel` looked up MOH leaves only, so a support role would have rendered as
  the raw id `administrator` on the member row.

### Changed

- `NON_NURSING_GRADE_ALIASES` moved to `rosterEngineV2.js`, beside the scale. Both grade
  validators need it, and keeping it in one of them would make the other import its
  sibling for a fact about the scale. Still derived from the `nonExempt` band, never four
  written-down strings.

### Notes — Brandon still cannot be added, and that is correct

The refusal changed from the domain gate to `NO_ACCOUNT`, which is the v2.4.0 own-domain
fix working: the address now clears the allowlist and stops at the next check. NEXUS
adds people who already have an account — it does not pre-authorise an address. There is
no invitation flow, and the panel's own copy says so. That is a real gap and a feature,
not a bug: a lead cannot currently reserve a seat for somebody who has not registered.

---

## [2.4.0] - 2026-08-31

Three things the roster owner said, all of which were right.

### Fixed

- **"Why do I need to register my organisation when I'm the one building it?"** It did
  not make sense, and the answer was not "read the runbook". `config/domains` is
  unwritable by any client, so a freshly deployed NEXUS refused the first lead the right
  to add the first colleague **at their own hospital** — the base case, and the one that
  has to work before anything else can.

  **A verified lead may now always add a colleague on their own domain**, with no
  allowlist at all. Four things hold at once, which is what makes it narrower than it
  sounds: the caller is a **lead of that team**; their email is **verified** by Firebase,
  so the domain is one they demonstrably receive mail at; the invitee **already has a
  NEXUS account**, so they passed registration themselves; and the exemption is exactly
  **one domain wide — the caller's own**. Placing an arbitrary address, or one at another
  institution, still needs `config/domains`, which is what it was always for.

  Deliberately **not** a fallback to `DEFAULT_ALLOWED_DOMAINS`: that would hardcode two
  hospitals into the server and rebuild the coupling the config document removed. This
  derives the answer from who is calling.

  The caller's email now reaches the gate from `request.auth.token`, and **only when
  `email_verified` is true** — never from `request.data`, which would be a claim.

  Six tests. A mutation replacing the exact domain comparison with `endsWith` **survived
  the first five**: the lookalike case put the attacker in the *caller's* address, where a
  suffix check still refuses. The hole is the other direction — a legitimate lead and an
  invitee at `evil-kkh.com.sg`. That case is now pinned, and it is the exact trap
  `accessPolicy.js` names.

### Added

- **`NN7`–`NN10`, the Non-Nursing spelling of the support grades.** The owner: AH7–AH10
  are *"sometimes known as NN7-NN10 ie Non-Nursing"*. The parser accepted only `AH`, so a
  correctly-typed grade was rejected and the roster master was told their own vocabulary
  was invalid. `NN8` now parses to rank 8 exactly as `AH8` does — same band, same gating,
  byte-identical rosters — and the grade dropdown offers them under *"Non-Nursing — the
  same grades, the other name"*. **Derived from the scale's own `nonExempt` band**, never
  written down as four strings, so they move if that boundary moves again as it did on
  2026-08-13. Display stays `AH`: the app accepts both spellings and speaks one.

- **Administrators, assistants, associates, technologists and service managers.** The
  owner: *"there are no Administrators, Assistants and Associate Roles which AHP
  departments and services may have — and they are the ones who are the roster masters."*
  They were unable to name themselves in a form that asks them to configure the roster.

  **Kept in their own group, appended after MOH's 28 and labelled "not an MOH
  profession".** An administrator is not an allied health profession, and merging them in
  would make the claim "MOH's own 28" — which this repository repeats in the picker's own
  copy — false. The two tests that pin that claim were made **more** precise rather than
  relaxed: they now assert 28 MOH entries *excluding* the new group, that the group is
  labelled as non-MOH, and that it is **last**.

  Same omission as the grade bands had, one layer up: `nonExempt` (AH7–AH10, NN7–NN10) is
  exactly where these roles sit, and the app spent a fortnight unable to express that a
  support-grade colleague may not *lead* a clinician's duty. Here it could not name them
  at all.

### Notes

A mutation that changed the appended group's `sortName` passed every test — because that
field is never read: the group's position comes from `.concat()` after the sort, not from
a sort key. Removed rather than left in place. Dead data that looks live is how the next
reader concludes ordering is handled somewhere it is not.

---

## [2.3.1] - 2026-08-31

The setup notice, cut down — and the reason it was needed at all, fixed properly.

### Fixed

- **Two banners were making one point, and the longer one was mine.** The new setup
  notice sat directly above the server's refusal, which says the same thing in more
  words. Seeing both at once, the owner's verdict was that it *"feels vulgar"*, and that
  was fair. It is now **one line** — *"Setup outstanding: no organisation is registered
  yet, so adding anybody will be refused. Whoever installed NEXUS needs to register your
  email domain."* — and it **hides once the server has spoken**, so the two can never
  stack again. Pinned by a test that drives an add, gets the refusal, and asserts the
  notice is gone.

### Added

- **`scripts/bootstrap-config.cjs` — NEXUS could not be initialised from NEXUS.** This
  is the actual cause of the owner being unable to add a valid colleague, and it is
  larger than the message that reported it. Two documents govern everything:

  | | gates | written by |
  |---|---|---|
  | `config/domains` | which institutions may be added to a team | **nothing** |
  | `config/superAdmins` | who may approve a lead's request for a team | **nothing** |

  Both are read by Cloud Functions. Neither is client-writable — `allow write: if false`
  on `config/{docId}`, correctly, since a client that can edit the login allowlist can
  admit itself. So a freshly deployed NEXUS refused every invitation *and* left every
  lead request unapprovable. Each refusal is right on its own; together they are a
  product that cannot be started.

  The script runs on the Admin SDK, which is the only thing that legitimately bypasses
  those rules, and follows `migrate-to-teams.cjs`'s conventions because they were paid
  for: **dry run is the default**, the **project is named before anything is read** (a
  key for the wrong project is otherwise indistinguishable from an empty database), and
  **an existing allowlist is never replaced** — adding needs `--merge-domains`, which is
  a union. Replacing it could remove an already-onboarded institution and lock out
  everyone there, producing the exact wrong message this release set out to stop.

  It **will not invent a super-admin**: an address must be passed explicitly, because a
  script that grants approval rights to whoever ran it is a privilege escalation with a
  helpful tone of voice.

  Six tests, source-read rather than imported (the script initialises firebase-admin on
  load). The load-bearing one asserts its built-in default is **exactly**
  `accessPolicy.js`'s `DEFAULT_ALLOWED_DOMAINS` — two copies of one fact, and if they
  drift the bootstrap "succeeds" while changing nothing anyone can use.

### Notes

The first draft of the script used `admin.firestore()`. **firebase-admin v14 removed the
service namespaces from the root export**, so that is `undefined` and fails with a
message that reads like a credential problem — a trap `migrate-to-teams.cjs` had already
hit and documented at length. Rewritten to the `firebase-admin/app` and
`firebase-admin/firestore` subpath imports, which work on v10 through v14. Caught before
shipping only because the repo had written the lesson down.

---

## [2.3.0] - 2026-08-31

Reported from the field: a lead could not add a colleague, and the refusal blamed their
hospital.

### Fixed

- **"NEXUS is not open to kkh.com.sg. Registered organisations: none configured."** One
  sentence served two situations that need opposite responses, and it chose the wrong
  words for the more common one. There are now two:
  - **Nothing configured at all** — *"NEXUS has not been set up with any organisations
    yet, so nobody can be added to a team — including {domain}. This is a setup step
    that is still outstanding, not a decision about your institution."* Nobody can be
    added anywhere, at any institution; it says nothing about the address in the form.
  - **Configured, but not that one** — the registered organisations are listed, so the
    lead can see what NEXUS does serve.

  **Neither names `config/domains` any more.** A Firestore path was the first thing the
  old message asked of a clinical lead, and it is not an action they can take. The path
  lives in the code, the runbook and this file, where the person who *can* act on it is
  looking.

- **The panel now says so BEFORE the lead presses Add.** Until `config/domains` exists,
  `inviteMember` refuses every address — correctly, because a gate that opens when its
  configuration is missing is not a gate. But nothing announced it, so the first anyone
  knew was a refusal naming their own hospital. A lead now sees a setup notice above the
  add form, gated on the read having completed so it cannot flash, and shown only to a
  lead — a staff member can do nothing about it.

  `useDomainAllowlist` gained a `configured` flag to make this possible. It is **not**
  `domains.length > 0`, which can never be false: it reports whether the *document*
  yielded a list, or whether the built-in fallback is in play. The login screen still
  says nothing — that reasoning in the hook's header stands, and a visitor can do nothing
  about it either.

  Four component tests, mutation-checked four ways, all caught: the notice never
  rendering, the loaded-gate dropped so it flashes, the lead-gate dropped so staff see
  it, and the "not a judgement about your institution" sentence removed.

### Notes — why this was not a code bug, and the operator fix

`config/domains` does not exist in the deployed project. `allow write: if false` on
`config/{docId}` means no client can create it, so it is a Firebase console or CLI step:
collection `config`, document `domains`, one **array** field named `allowed` holding
`kkh.com.sg` and `singhealth.com.sg`. The field name matters — `parseDomainAllowlist`
reads `data.allowed` and ignores anything else.

The client/server asymmetry is deliberate and documented on both sides: the login screen
falls back to a built-in list so existing users can always get in, and the invite
function refuses when its configuration is missing because it is what stands between a
lead and placing an arbitrary address inside a team. What was missing was any account of
the state *between* them — register successfully, then be un-addable — which is what the
notice and the reworded refusal now cover.

### Also — the local verify harness was testing a subset

`verify.sh` ran `vitest run src`, but `npm test` is `vitest run` with no path and
`vitest.config.js` includes `functions/**` and `scripts/**` as well. The harness was
reporting a **src-only** figure as the whole suite, so a Cloud Function or
migration-manifest regression could have passed it and failed CI — and the change in this
very release is in `functions/`. Fixed, along with the root files those suites read
(`firebase.json`, `AURA-GUARDRAILS.md`). **True baseline: 92 files, 3274 tests** — the
2727 quoted in recent entries was src only.

---

## [2.2.1] - 2026-08-31

> **Correction to the [2.2.0] entry below.** Its release also claimed the README title,
> the shields badge and both *Supported Versions* tables were realigned. They were not —
> the substitutions targeted string shapes from the v1.14 era that do not exist on this
> branch, and nothing verified the result, so the README kept saying `v2.1.3` through a
> v2.2.0 release. Fixed here, and the lesson is the boring one: a version bump is not
> done because a script reported success, it is done when the surfaces are read back.

### Fixed

- **The banner now says the department's setup was saved.** The configuration has been
  written on every Generate since `R1` — the roster master just had no way to know it.
  The failure case had a sentence (*"could not be saved, so you may have to set it up
  again"*) and the success case had none, which is the wrong way round: the quiet
  outcome is the one nobody can verify for themselves. So a successful generation now
  reads *"Roster saved: 24 days, 2 Feb → 27 Feb. Your department's setup is saved, so
  you will not have to enter it again."*

  **And it only says so when a write actually happened.** `settingsChanged` means a
  second Generate that altered nothing writes nothing, and a banner announcing a save
  anyway would be claiming an action that did not occur — the failure this subsystem's
  post-mortem is named for. One boolean could not express that: `settingsSaved` was
  `true` both when a write succeeded and when there was nothing to write. There are now
  three outcomes — written, unchanged, failed — and three sentences.

  Two component tests, mutation-checked three ways, all caught: reverting to the single
  boolean, never setting the written flag, and changing the copy out from under the
  assertion.

### Notes — the feature this started as was already built

Asked to build "save your team's tasks", the honest answer was that it exists:
`src/utils/rosterSettings.js` writing `teams/{teamId}/settings/roster` after a
successful generation, restored by an `onSnapshot` listener with its own error
callback, 24 unit tests, lead-only by rule, plus an `R4` migration bridge that seeds
the wizard from a department's legacy `config.tasks` the first time. Proved rather than
assumed: `['EFT','IPT+SKG','NC','FSG+WI']` saves, comes back intact with its days and
co-lead flags, and does not re-write on an unchanged generate.

**A parallel implementation was written and then reverted** — a `rosterTeamTasks.js`
module and a widening of the `teams/{teamId}` update allowlist to admit a new
`rosterTasks` field. Both were unnecessary: `teams/{teamId}/settings/roster` already
carries `allow create, update: if isLead(teamId)`. The rules half mattered most —
`firestore.rules` is deployed by CI on this branch, so it would have loosened a live
security boundary to enable something already permitted, and left two competing sources
of truth for one team's configuration.

Also corrects a comment the 2026-08-15 rename had corrupted: the `R4` bridge exists to
explain a department whose tasks are the *legacy acronyms*, and a blanket substitution
had it illustrating that with the names introduced the same day.

---

## [2.2.0] - 2026-08-31

The clinical exercise physiology duty names, spelled out — and an honest note about a
structure this repository has been describing wrongly.

### Changed

- **The duty acronyms are retired.** `EFT`, `IPT+SKG`, `NC` and `FSG+WI` meant nothing
  outside the one service that invented them, and NEXUS is now offered to departments
  who cannot read them. Two were **compounds carrying two duties in a single string**,
  which is why four names became nine:

  | Was | Now |
  |---|---|
  | `EFT` | Exercise Test |
  | `IPT+SKG` | Inpatient Exercise **+** Paediatrics Group Session |
  | `NC` | New Case |
  | `FSG+WI` | Adolescent Group Session **+** Walk-in |
  | `VC (PM)`, `VC (AM)` | Video Consultation Individual |
  | — | Physical Activity Counseling, Individual Session, Video Consultation Group |

- **The group sessions are named by age band, not by programme name.** The department
  calls them *Super Kids* (12 and under) and *Fitness Superstars* (13 and above). The
  roster owner asked for `Paediatrics Group Session` and `Adolescent Group Session`
  instead, in their words *"because other institutions may not be aware of customised
  names as we are now scaling"*. The programme names are recorded in the code comment
  rather than on the roster.

- **The video consultation moved from Tuesday afternoon to Thursday morning.** The
  service changed and the code had not caught up. Both consult slots are now the
  *individual* consultation, and that follows from the department's own constraint
  rather than a preference: every group session runs in the afternoon, because the
  children are at school in the morning, so a morning slot cannot be a group one.

### Notes — a structure this repository was describing wrongly

The roster owner, 2026-08-15: *"for my team of CEP each task lasts for a week and then
we rotate, not daily."*

The **live V1 engine already does exactly that** — `rotate(staff, w)` picks a lead per
task per WEEK and writes that one person across all five days
(`auraEngine.js:129-135`). Measured after the rename: Ying Xian holds Exercise Test for
all of week 1, Derlinder for all of week 2.

**The sandbox shape does not.** V2 assigns per DAY, so a duty changes hands mid-week —
measured before this note was written, `EFT` ran Atalanta / Penelope / Penelope /
Penelope / Hector inside one week. That shape was attributed as *"the one shape here
that is reported rather than modelled"*, and for its assignment pattern that was false.
The attribution now says so: its **duties** are reported, its **assignment pattern is
the engine's, not the department's**.

**V2 cannot express a weekly rotation today.** `continuity: true` is the nearest
primitive and is the wrong shape — it asks for the same lead on every occurrence
*forever*, which is the opposite of rotating. Cohort windows could simulate it only by
enumerating every person × task × week, which is the "data-entry accident waiting to
happen" their own comment warns against. Recorded as a gap, unbuilt.

Also unmodellable, and now written down rather than smuggled into a label: **the engine
has no concept of time of day at all.** Afternoon-only group sessions cannot be
expressed; the old names encoded it as `(AM)` / `(PM)`, which is exactly the
information-in-a-string pattern this rename removes.

### Verified

Live V1: 9 duties, 24 days, 188 shifts, weekly rotation intact. Sandbox V2: 140 shifts
(up from 88), unfilled 0, warnings 0, still filling at the department's own
`maxConcurrentPerDay: 3`. **2228 tests, lint clean.** Six pinned suites updated — the
byte-compat pins existed to catch an *unintended* change to live output, and every one
of them fired on an intended one, which is the pins working.

*(Versioned 2.2.0 as the next minor after main's `2.1.3`. An earlier draft of this entry
called `v2.1.1` a dangling tag from another line — that was measured against a stale local
`main` and was wrong: `v2.1.0`–`v2.1.3` are real releases, and this branch had simply not
seen them yet.)*

## [2.1.3] - 2026-08-25

A patch release: the public answering surfaces now speak lay language, and the word
"clinical" is gone from public-facing copy. **No new features, no Firestore shape
change, no data migration.** The AURA engine stays at `v2.3` — it is not touched by
this release.

*Two commits since `v2.1.2`, merged as `2ba1c15`, classified by reading the diffs.
Their subjects are conventional (`fix(...)`, `ci:`) rather than this repository's
historical `Update <file>.jsx`, and the diffs agree with them: every hunk in the app
change is a display string or a presentation-only key. The CI commit adds a workflow
file and touches nothing the app ships.*

### Fixed

- **People answering the assessment were shown instrument acronyms mid-question.**
  The chat's domain badges and the form's step titles, progress subtitles, section
  badges and footnotes carried `ACSM PAVS`, `SPAG`, `SDOH`, `PHQ-2`, `LSNS-6` and
  `BPS-RS II` — vocabulary that means nothing outside a health system, shown to a
  member of the public at the moment they are trying to answer. They now read as plain
  words: *Physical Activity*, *Strength Training*, *Health & Safety Check*, *Cost &
  Access*, *Social Support*, *Food Security*, *Mood & Wellbeing*. Footnotes describe
  the question instead of citing it — "Based on a standard two-week mood question used
  in health screening" rather than "Aligned with BPS-RS II P22 (PHQ-2 based…)".
  **The precise instrument citations are not lost**: they remain, expanded on first
  use, on the PDF report's governance page, which is where an auditor looks for them.
- **The word "clinical" appeared throughout public-facing copy**, in a portal that
  must not present itself as a clinical service. Removed from every public surface in
  all four languages, including the Malay *klinikal* and Chinese *临床* wordings —
  "Clinical Safety Screen" is now "Health & Safety Check", and the Demo Mode card
  offers analytics "without processing live health data". The result page's
  `pavsTitle` reads "Your Physical Activity Check" instead of "ACSM Physical Activity
  Vital Sign", `pavsLabel` reads "Activity Score" instead of "PAVS Score", and SPAG
  thresholds read "National guideline".

  Staff-side surfaces are deliberately untouched — *Clinical Exercise Physiologist* is
  a real job title, not portal copy.

### Changed

- **The chat's internal domain group key `clinical` is renamed `safety`** in
  `AuraChat.jsx` (`DOMAIN_CONFIG`, `GROUP_COLOURS` and the badge `colourMap`).
  **This is not a data change.** The `group` field never leaves the browser — it
  selects a progress-bar colour and a badge palette, and is read only through
  `GROUP_COLOURS[domain?.group]` and `colourMap[domain.group]`. The identifiers that
  *are* persisted are the `key` fields (`pavs_days`, `medical`, `falls`, …), and every
  one of them is unchanged, so a client already in someone's service-worker cache
  parses stored responses exactly as before.
- **Release tags can now be created from a `workflow_dispatch`**
  (`.github/workflows/tag-release.yml`). Build tooling only; nothing the app ships.
  It exists because a cloud session's git credentials can push branches but not tags,
  so the tag is created inside Actions where `GITHUB_TOKEN` carries `contents:write`.
  The workflow refuses any tag name that is not `vX.Y.Z`, and it takes an explicit
  SHA — the release commit's — so the repo's rule that **a tag points at a commit
  whose tree already carries its own version** is preserved through the new path.

## [2.1.2] - 2026-08-25

A patch release: three rendering fixes in the exported two-page report, and nothing
else. **No new features, no Firestore shape change, no data migration.** The AURA
engine stays at `v2.3` — it is not touched by this release.

*One commit since `v2.1.1` (`a4c126c`, merged as `eef154d`), classified by reading the
diff. Its subject is conventional (`fix(...)`) rather than this repository's historical
`Update <file>.jsx`, and the diff agrees with it: every hunk is presentation — flex
styling, paddings, an image import and a column width. No props are read from stored
data that were not read before, so nothing here can change what a deployed client can
parse.*

### Fixed

- **Page 1's header strip printed at ~57px while page 2's kept 130px.** The page
  wrapper is a fixed-height flex column, and **a fixed height does not stop a flex item
  shrinking** — when page 1's content ran long the browser compressed the header and
  footer strips to make room, so the two pages of one report carried visibly different
  headers. Both strips are now `flexShrink: 0`; the content area takes `minHeight: 0`
  and `overflow: hidden` so it absorbs the excess instead, and page paddings and gaps
  are tightened so the fullest report (Red tier, previous ID, three SDOH bullets, six
  resources) fits without overflowing. Measured after the fix: both pages exactly
  794×1123, 130px headers, 44px footers, zero content overflow.

  ⚠️ This is the same defect class the v2.1.1 entry below claimed to have closed. That
  release gave both strips *fixed heights* and clamped the wrappers, which is necessary
  but not sufficient: a fixed height is still shrinkable under flex. The strips only
  stop moving once they are also unshrinkable.

- **The header logo printed with a dark N.** The N strokes in `nexus.png` are
  transparent cut-outs, so against the dark header strip the background showed through
  and the wordmark inverted. On a light page the same file looks white, **which is why
  it passed review** — the artwork is only wrong on the one background the PDF uses.
  The header now draws a bundled copy (`src/assets/nexus-logo.png`) with white baked
  into the interior transparency and the exterior corners still transparent, imported
  through Vite so it ships content-hashed. That also closes a second hole: the previous
  code fetched `/nexus.png` by URL, so a browser holding an older cached copy drew
  **whatever the cache held** into the export rather than what the repo ships.

- **"Psychological Wellbeing" broke the evidence column's alignment.** The label was
  wider than the column's `minWidth: 110`, so that row widened and its description
  started at a different x from every other row. The label column is now an exact
  `width`, so a long label wraps to a second line instead of pushing its description
  out. Also on page 2: partner-site lines no longer break mid-word (`break-all` →
  `overflowWrap: break-word`, so URLs still split when they must and prose never does),
  and the last evidence row no longer draws a stray border below itself.

## [2.1.1] - 2026-08-24

A patch release: four fixes and one documentation correction. **No new features, no
Firestore shape change, no data migration.** The AURA engine stays at `v2.3` — it is
not touched by this release.

*Classified by reading the diffs. These commit subjects are conventional (`fix(...)`)
rather than this repository's historical `Update <file>.jsx`, so intent was legible
for once; the file deletions listed below still had to be attributed by diff, because
no subject line mentions them.*

### Fixed

- **Hosting never re-served `index.html`, so every deploy was invisible.**
  `firebase.json` declared no `headers` block at all, leaving Firebase Hosting's
  default cache policy on the one file that must never be cached. Vite fingerprints
  every asset; `index.html` is the map naming the current fingerprint, so a stale map
  points returning browsers at the previous bundle. Three rules now ship: `no-store`
  on `/index.html` and on `/firebase-messaging-sw.js` (a cached service worker keeps
  re-registering an old script, which is how a push fix ships and never arrives), and
  a one-year `immutable` on `/assets/**`, which is safe precisely because the content
  hash is in the filename.

  ⚠️ **This was true of every deploy this project has ever made.** It surfaced at
  v2.1.0 only because that was the first release where somebody went looking for a
  specific new control and could not find it. Covered by
  `scripts/hosting-headers.test.mjs`.

- **The dashboard showed one department's staff to every team, and every bar read
  zero.** The *Individual Clinical Load* panel rendered `TEAM_DIRECTORY` in live mode
  — ten people from Sport & Exercise Medicine at KKH — so a respiratory therapy lead
  at SGH opened their dashboard onto somebody else's colleagues. This was the sixth
  hardcoded copy of that one department and the last one standing.

  ⚠️ **And it was not cosmetic.** The multi-team rewire re-keyed `activeStaffLoads`
  by uid, while this panel still supplied a directory id (`'brandon'`, `'alif'`), so
  every lookup missed and fell back to `Array(12).fill(0)`. Twelve months of zero bars
  per clinician, rendered confidently, on the first screen anybody sees — nothing
  errored and nothing was empty, which is the failure mode that survives a demo. The
  people now come from `members`, keyed by the uid the loads are already stored under;
  `rostered !== false` matches the roster's own pool, so the roster master who holds no
  clinical duties no longer appears as a row of zeros indistinguishable from a bug.

- **"Enterprise / Scale Unit" routed a department head into a disabled button.** The
  sign-in screen's second option read as *for setting up a department* and opened a
  panel about multi-tenant architecture whose only button was disabled and said
  *"Registration Restricted — Contact Admin for whitelisting"*. The path that person
  wanted sat behind the **first** button, one unmarked role dropdown down.

  That panel was honest when written — multi-tenancy did not exist — and became false
  at v2.0.0 without anything failing, because a disabled button is not a bug; it is a
  button doing what it says. No test could have caught it. **The fix is a repoint, not
  a delete:** the signpost is well aimed, so it now opens registration with the lead
  role preselected and says so in the words a department head uses.

- **The exported two-page traffic light report (`ResultPage.jsx`).** Three faults in
  the jsPDF + html2canvas export: the header and footer strips could differ between
  pages (heights followed their content, page 2 hardcoded its own subtitle, the two
  footers carried different labels) — both strips now have fixed heights and shared
  styles, and each page wrapper is clamped to exactly 794×1123 so jsPDF rasterises
  both canvases at the same scale and the strips print at the same physical size.
  Nothing in the rasterised pages was clickable — elements tagged `data-pdf-link` (the
  NEXUS logo and wordmark, resource logos and printed URLs, the primary-action URL, the
  QR block, the Healthier SG partner logos) now carry real PDF link annotations stamped
  over their footprint. Em-dashes in the English report copy are replaced with plain
  punctuation; the UK English spellings are retained.

### Removed

- **Dead modules, no remaining consumers:** `Aura.utils.js`, `KpiChart.jsx`,
  `ScrollToTop.jsx`, `StaffLoadChart.jsx`, `StatusBarChart.jsx`,
  `TaskProjectBarChart.jsx` and `hooks/useWindowSize.js`. Removed alongside the
  dashboard fix above. Internal cleanup only — nothing in `src/` imported them, and
  no rendered surface changes. `TEAM_DIRECTORY` itself still exists in
  `src/utils/index.js` but now has **no consumers in `src/`**.

### Documentation

- `firestore.rules.README.md` cited 91 emulator checks; it is 119. The banner
  correctly points readers at `scripts/firestore-rules-verify.mjs` as the current
  record, but the number it quoted was two releases stale — which is the specific way
  a "read this instead" pointer stops being trustworthy. The 28 added since cover
  pay-grade privacy and the team's roster configuration.

---

## [2.1.0] - 2026-08-23

**ONE CONFIGURE SCREEN, ONE ENGINE.** The live roster had never used the AURA v2
engine. Every capability the sandbox has demonstrated for months — grade bands,
skill matching, part-time fairness, working-hours ceilings, consecutive-day limits,
the grade floor shipped in v1.18.0 — existed only there.

> ### ⚠️ NOTHING IS REGENERATED BY THIS RELEASE
>
> The deploy changes no roster. v2 runs the first time a lead presses **Generate**
> and confirms. The existing roster renders unchanged: v2's shift object is a
> superset of v1's — same `task`, `lead`, `coLead`, `staff`, `category`, `week`,
> plus `assignees` — so the calendar, the swap picker and the ICS export are
> unaffected either way.
>
> **When it does run, the allocation will differ.** v2 respects constraints v1
> ignored. That is the point of the change rather than a regression, and the
> confirmation modal is what makes it a decision.

### Why the two screens differed

Not a UI preference. Live mode ran `generateRoster` — a round-robin rotating a list
of NAMES, assigning `staff[taskIdx % staff.length]` as lead, Mon–Fri — which could
not see a grade, an FTE, a skill, a leave date or a rule, because its input was two
comma-separated strings. Two textareas were the honest UI for it. The sandbox ran
`generateRosterV2`, which needs all of it. The `isDemo` gate was a symptom.

### Added

- **Profession and job grade on Edit Profile.** Profession from the 37 MOH allied
  health professions; grade from `AH7`–`AH17`, the engine's own scale. Both
  self-set. Selecting a grade shows what it means for duties beside the control
  that sets it — somebody choosing a principal grade reads "leads shifts" as they
  choose it.
- **A department's configuration persists** — `teams/{id}/settings/roster`, read by
  the team, written by a lead, saved when a lead generates. Tasks, band boundaries,
  hours policy and scheduling rules survived only as long as the browser tab did.
- **The staff table is the team.** Rows come from the member list and carry uid,
  ending the comma-separated staff pool — the last place display-name keying
  survived. Read-only: somebody leaves the roster by leaving the team.
- **A bridge for departments that already roster.** No stored configuration and
  nothing typed ⇒ the wizard opens on the tasks the department is already running,
  rather than on blank rows with Generate refusing.

### Changed — pay grade is now private

`grade` moved off the membership document, which every member of the team can read,
into `teams/{id}/grades/{uid}`, which only the person and a lead can.

**Firestore rules cannot hide a field.** Access is granted per document; there is no
field-level read. A member who may `get` the membership reads every field on it, so
a grade stored there was a grade every colleague could read, and hiding it in the UI
would have changed nothing.

`list` is denied on the new collection to everybody including a lead: a lead reads
one document per member by uid from the member list they already hold, so denying it
costs nothing and removes the artefact the split exists to prevent — one query
returning every salary band in the department.

**The protection is partial, and that is stated rather than implied.** The engine
gives lead shifts to senior and principal bands, so a published roster still tells
an attentive reader roughly which band somebody is in. What this withholds is the
number.

### Known limitations

- **The wizard's staff attributes are read-only in live mode by design**, and the
  places to edit each one are named under the table. Grade and profession on the
  person's own profile; membership fields in Admin → Team.
- **Self-set grade has no review step.** Nothing flags a staff member who selects a
  senior grade and begins receiving lead shifts. The mitigations are the
  consequence sentence beside the control and a lead seeing grades in the Configure
  staff table. The rejected alternative — lead-set-only, which the rules still
  support — is recorded in `firestore.rules` so the decision can be revisited on
  the facts.
- **`rules.forbidPairs` stores two colleagues' names** in a team-readable document.
  It cannot live elsewhere — the engine reads it with the rest of the configuration
  — and the rule's effect is observable in any roster it produces.

---

## [2.0.0] - 2026-08-23

**MULTI-TEAM.** NEXUS was built for one ten-person department, with every collection at
the root of the database and the team itself hardcoded in *six* separate places. It now
serves a team per department per institution — Respiratory Therapy at KKH and
Respiratory Therapy at SGH are different teams, rostering differently, unable to see
each other.

> ### ⚠️ THIS IS A BREAKING DATA CHANGE, AND THE CUTOVER HAS AN ORDER
>
> Every collection moved beneath `teams/{teamId}/`. The deployed app reads the new
> paths and **nothing else**. So:
>
> 1. **Run `scripts/migrate-to-teams.cjs --write` FIRST.**
> 2. **Then** merge to `main`, which auto-deploys.
>
> Deploy first and the department sees empty everything until the migration catches
> up. The migration **copies and never moves**, so the pre-migration documents survive
> untouched — that is the rollback: restore the previous rules from console history,
> redeploy the previous bundle, and the old app reads its own data as if nothing had
> happened.

### The six hardcoded copies of one department, all removed

Each was found while rewiring the thing that used it, and each is recorded because
"the code says four" looked like evidence at least once:

| Where | What it held |
|---|---|
| `TEAM_DIRECTORY` (`src/utils/index.js`) | 10 people, 9 consumers |
| `ADMIN_EMAILS` (`App.jsx`) | 2 addresses |
| `directory()` + `directoryNames()` + `adminEmails()` (`firestore.rules`) | the same 10 again, plus 2 |
| `LIVE_ROSTER_DEFAULTS.staff` (`auraEngine.js`) | 4 clinicians — **and it was stale** |
| `AdminPanel.jsx` top of file | 5 names excluded to leave "the CEPs" |
| `AdminPanel.jsx` render | **the same 5 again**, so the table and the save could disagree |

The stale one is the argument for the whole change: nobody edited the array when the
department changed, and it quietly stopped describing it. Onboarding a clinician now
means a lead adding a member document — **zero code edits, zero deploys, zero rules
changes**.

### Added

- **`teams/{teamId}` and `teams/{teamId}/members/{uid}`.** A team is a *department at an
  institution*, not a profession. Membership is data, and `firestore.rules` asks the
  database — `exists(/teams/$(teamId)/members/$(uid))` — instead of consulting a list.

- **`src/utils/teamPaths.js`,** the one place a Firestore path is composed. Two guards
  **throw** rather than returning null, because the failures are silent corruption:
  `teams/a/../../b/rosters/2026` is a real path, and `assertUid` refuses strings with
  spaces to catch the display-name habit surviving a copy-paste.

- **A domain allowlist held as data** (`config/domains`), replacing a hardcoded
  `@kkh.com.sg` test that **permanently locked out two colleagues** on
  `@singhealth.com.sg` — they passed the directory check and failed the domain test one
  line above it.

- **Lead declaration at registration, and an approval Cloud Function.** A declaration is
  a *claim*; only `approveLeadRequest` on the Admin SDK may create a team. It is
  idempotent, writes in one batch, and refuses an account whose email is unverified —
  the check `firestore.rules` deliberately cannot make, because the declaration is
  written seconds after registration.

- **`AccessGate`** — the state the old app had no answer for. An authenticated user with
  no team used to get the full shell over empty collections, which looks exactly like
  broken software. Each waiting state now names **who moves next**.

- **`rostered`, separate from `role`.** Two questions that coincided in a ten-person
  department and do not in general: the roster master is a `lead` who holds no duties;
  the service lead is a `lead` who does. Every single-field rule gets one of them wrong.

- **Team context and a switcher**, plus `canActOn` — the guard anything that writes must
  consult. The active team is always one the user is actually in, however the id
  arrived; `localStorage` is user-editable and is not evidence of membership.

- **Cross-team isolation in `firestore.rules`,** asserted by 16 cases whose outsider is
  a real **lead of a real second team** — the case that breaks if a rule ever asks "are
  you a lead" without asking "of which team".

### Changed

- **Every collection is team-scoped.** `system_data/roster_2026` → `teams/{id}/rosters/{year}`;
  `shift_swaps`, `wellbeing_history`, `staff_loads`, `system_data/daily_pulse`,
  `monthly_attendance`, `reports_{year}`, `feed_posts`, `notifications`, `monthly_workload`
  all likewise.

- **`cep_team` and `archive_{year}` were the same thing** — one shape in two
  differently-named collections, chosen between by `dataYear === '2026' ? … : …`. Both
  are `projects/{year}/staff/{uid}`, so the current year stopped being special and the
  year selector became a value rather than a branch.

- **Coverage requests and notifications route by `uid`.** `where('targetStaff','==',user.name)`
  meant that editing your display name silently stopped every request from reaching you
  — and a query matching nothing is indistinguishable from nobody having asked.

- **The staff pool is the team's own member list**, and while it is still loading the
  pool is **empty rather than the hardcoded four**. Generate is disabled with "staff
  pool is empty", which is true; falling back would have produced a four-person roster
  for a five-clinician department, and it would have looked entirely plausible.

### Fixed

- **The dual-keyed user write.** `AuraPulseBot` wrote the profile to `users/{user.id}` —
  the *directory* id — while `App.jsx` read `users/{uid}`. Two documents for one person,
  one never read, and a profile edit that appeared to do nothing.

- **A fuzzy lookup on the burnout monitor.** `AdminWellbeingPanel` slugified a display
  name and took the first key that `.includes()` it, so "Sarah" would pick up
  "sarah_lim"'s record, and a renamed clinician showed a flat row reading as *no logs*
  rather than *looked in the wrong place*.

- **The sandbox wrote into clinical data.** Demo mode appended to the production
  `wellbeing_history/_anonymous_logs` and painted a demo name onto the real pulse board,
  so every walkthrough with a visiting department left a trace. A sandbox visitor has no
  team, so there is now no path to write to.

- **A language model was choosing a Firestore path.** AURA's `DATA_ENTRY` took *both*
  the collection name and the document id from Gemini's output. The collection is now an
  allowlist of two and the person is resolved through the member list, so an invented
  name is refused rather than creating a document for a colleague who does not exist.

- **`.replace(' ', '_')` replaces only the FIRST space,** so "Mary Anne Tan" silently
  missed. Used in two places in `AdminPanel`, both gone with the slugs themselves.

- **`teamIdFrom('', 'Physiotherapy')` returned `'physiotherapy'`** — an id with no
  institution in it, making Physiotherapy at KKH and at SGH the same team. Found by the
  drift test comparing the client slug against the server's copy, which also caught the
  accent handling: NFKD alone turns 'Thérapie' into `the-rapie`.

### Security

- **`firestore.rules` rewritten around membership-as-data.** 91 emulator checks, up from
  50. `directory()`, `directoryNames()` and `adminEmails()` are deleted.

- **No client may author a membership document — including a lead.** Every rule trusts
  it, so it is the one document a client must never write. Inviting is a Cloud Function,
  which can check the uid belongs to a real verified account; rules cannot see that.

- **`users.teamIds` is not client-writable.** It is the membership graph; a user who
  could append to it would hand themselves a team in the switcher.

- **The pre-migration collections are explicitly unreachable,** asserted by five cases —
  so a stale path left anywhere in the app fails loudly instead of quietly continuing to
  work against data the new model has moved on from.

- **One deliberate loosening, recorded rather than buried:** feed comments no longer pin
  `author` to the caller's name. The old rule compared it against the hardcoded
  directory, so a member who renamed themselves was denied their own comment, silently.
  The durable fix is an `authorUid` field the app does not yet write. Bounded cost: a
  member can comment under a colleague's name inside their own team's feed.

### Known limitations, stated rather than discovered

- **The roster's day arrays, the pulse heatmap keys and swap `targetStaff` are still
  display names.** Team scoping removed the collision that mattered — a Sarah at KKH and
  a Sarah at SGH are in different subcollections. Two in *one* department would still
  collide, which a lead fixes by editing a name. Converting them means changing the
  engine, the wizard, the demo fixtures and most of 1,837 tests: its own risk budget,
  not a rider on this one.

- **`D11` is untouched.** Generation is synchronous in the Draft click handler; ~23s for
  100 staff over a year. Per-team partitioning keeps most departments at 20–40 people
  where it is comfortable, but a large department rostering a year ahead will still
  freeze the tab.

- **The public screening flags a contradictory free-text answer.** "yes I always have
  enough food" answers a different question from the yes/no one that was asked, and the
  matcher reads the leading "yes". Left alone deliberately: the chips are the primary
  input path, and a sufficiency check on the word "enough" would suppress "yes, I don't
  always have enough" — a false negative on a social-determinant screen is the worse
  direction. Documented in `clinicalFlags.test.js` and printed by
  `npm run stress:community` on every run.

### Added after the first draft of this entry — the launch blocker, and two doors

The entry above was written on 2026-08-21 and described a system that could not
actually be launched. Three things were found by asking what a colleague meets on
their first morning, rather than by testing what had been built.

- **`inviteMember` and `removeMember`.** `approveLeadRequest` created a team with
  exactly ONE person in it and there was no second step: `firestore.rules` denies
  membership `create` and `delete` outright, and its own comments deferred both to a
  Cloud Function that had never been written. **A department approved on launch day
  could never add anybody**, and nothing errored — the system simply had no second
  step. Adding is by email, because a lead knows their colleague's address and nobody
  knows a Firebase uid; the server resolves one to the other, which is where it
  establishes the account is real. Removal refuses two cases outright — the lead the
  team was created for, and the last remaining lead — because both leave a team with
  no administrator and no repair path inside the app.

- **A sixth hardcoded copy of the team, and the one that mattered.** `hasAdminAccess`
  was two email addresses in an array, so a lead whose team was approved that morning
  could not open the admin panel — `inviteMember` existing would not have helped,
  because there was no door to the room it lives in. The rules had already assumed
  otherwise: every write that panel makes is `allow … if isLead(teamId)`.

- **`AccessGate` was a dead end.** An authenticated user with no team saw one sentence.
  It now offers the sandbox, and lets somebody who registered as staff declare
  themselves a lead — the rules already permitted a later declaration, so this was a
  missing form rather than a missing permission. That door is also what makes the
  invite ordering survivable: somebody who registers before their lead is ready gets a
  screen that explains the wait.

- **The sandbox could overwrite a real year-end report.** Demo mode returns a
  fabricated analysis, and `SmartAnalysis.handlePublish` had no `isDemo` guard — so
  PUBLISH wrote it into `teams/{id}/reports/{year}` and overwrote every
  `projects/{year}/staff/{uid}` document with demo data, then alerted SUCCESS. Any
  lead who flipped the Live/Demo toggle to show a colleague the tool could reach it.

- **The public AI endpoint is rate limited.** `communityAck` is reachable without an
  account by design; nothing bounded how often. Two ceilings an hour — 300 per caller
  (600 once attested) and 6,000 across the endpoint as a circuit breaker. The
  per-caller number is deliberately generous: one assessment is thirteen calls, and a
  roadshow puts thirty people behind one address, so a limit tight enough to stop a
  script is tight enough to break the event the portal is for. **App Check ships
  inert** — enforcing it before the client sends tokens would take the screening
  offline nationally — with the four ordered console steps in `COMMUNITY_TODO.md`.

- **`functions/index.js` has zero firebase-admin v13 namespace calls.** On v14
  `admin.auth` is undefined, the TypeError lands in a `catch` that only warns, and a
  real colleague applying to lead a team is told their account does not exist, with
  nothing red anywhere. The pin stays at `^13`; the conversion is what makes moving it
  later safe rather than dangerous.


Nothing yet.

---

## [1.18.0] - 2026-08-19

A grade floor the engine can actually say — queue item 5(b), closing `D10`.

### Added

- **`minGrade` — a fourth eligibility requirement kind.** A task can now state the lowest grade
  anybody covering it may hold: `{ name: 'NICU', minGrade: 'AH12' }`. Respiratory therapy's very
  first requirement was *"minimum job grade AH12"*, and until now it had **no expressible form**:
  eligibility had exactly three kinds — skill, region (a *set of bands*), cohort window — and
  none of them is a threshold. `junior` is AH11–AH12, so every sayable band gate admitted AH11
  too, one grade below what she said.

  **A floor is not a narrow band gate, and the difference is not arithmetic.** A band gate asks
  *"is your band in this SET"* and gates the **lead alone** — any grade may co-lead, which is what
  makes a senior-supervising-junior pairing expressible. A floor asks *"is your grade AT OR ABOVE
  this RANK"* and gates **every assignee**, lead and co-lead and slot alike, exactly as
  `requiresSkill` does. They compose by AND; a task may carry both.

  **It removes a workaround rather than adding a feature.** Before this, the only honest way to
  express a floor was `coLeads: 0` — one gated person and nobody beside them — because a second
  body was a body the gate could not reach. A task can now state its floor *and* have two people
  on it.

  An unrecorded grade fails the floor without a special case: `person.gradeRank` puts it strictly
  below the scale's bottom rank, which is section 0b's *"absent is not zero"* holding for free.

- **A minimum-grade control in the Sandbox wizard's task table**, and a refusal at configure time
  when nobody in the pool meets the floor — naming the highest grade there actually is, the same
  way an unsatisfiable skill and an empty band already refuse.

### Changed

- **The respiratory shape now says what she said.** `leadBands: ['junior','senior','principal']`
  → `minGrade: 'AH12'`. Its roster is **byte-identical** — that cast has no AH11, so the two
  gates coincided *for this cast*, which is exactly what the fixture's comment warned was the
  only reason it was safe. `coLeads: 0` stays, but now for the one remaining reason: she never
  said how many people an area takes.

### Notes

- **The stress harness's `D10` probe was rewritten, and that is the point of having probes.** It
  used to ask *"does a band gate of junior+ admit an AH11?"* — which it always will, because
  `junior` **is** AH11–AH12 and that is correct band behaviour, not a defect. Left alone it would
  have printed `REPRODUCED` forever and quietly become a liar. It now asks the **capability**
  question, and reports `GAP CLOSED` — flipping back to a defect the moment anybody breaks it.
- **`minGrade` joined the fuzz generator**, and the harness gained its own floor check.
  Deliberately verified to fail: wiring the floor to the lead only — the old bug wearing a new
  field name — is caught in **334 of 529** generated rosters.
- **Four mobile tests caught the new control on its first draft.** It used `text-[11px]`, which
  iOS Safari zooms on, and missed the 44px tap-target floor. It uses the shared `CELL_INPUT` now.
- 1667 tests across 29 files (was 1655), lint clean.

---

## [1.17.1] - 2026-08-19

### Fixed

- **`D2/D3/D9` — a colleague who is never rostered is now named on screen.** An amber panel sits
  between *"could not be staffed"* and the load table: it names them, and names the four things
  that cause it (a grade outside every task's band gate, a missing required skill, unavailable
  dates covering the run, an availability window falling outside it). It also reports the two
  other figures `measureRosterLoad` returns and nothing read — the heaviest single day and its
  duty count. **This is the first UI caller that function has ever had.**

  ⚠️ **The defect's own description was wrong, and correcting it is most of the value.** The
  ledger said the engine *"computes this and discards it — there is no UI caller at all"*, which
  reads as *the information is unavailable*. It was not: `result.load` is built
  `for (const person of staff)`, so a never-rostered colleague has **always** had a row in the
  load table reading `0`. Nothing was hidden. The real gap is that a `0` among nine rows does not
  announce itself — and `D2/D3/D9`'s own scenario, a mistyped availability window quietly removing
  somebody, is precisely when nobody thinks to look. **So the fix is a callout, not a data pipe**,
  and a test pins the pre-existing `0` row so a later change cannot "fix" the callout by deleting
  the thing it points at.

  **Amber rather than red, deliberately.** An unstaffed slot is a failure — work nobody can do.
  Nobody rostered is a *question*: correct when somebody genuinely is not on this rota (the
  respiratory shape's three below-floor staff are exactly that), and a silent disaster when it is
  a typo. The panel cannot tell which, so it does not pretend to.

  3 tests, each verified to fail when the panel is removed.

---

## [1.17.0] - 2026-08-19

The authorization boundary stops living in a console, and the engine gets stress-tested.

### 🔒 Security — decision `Q6`, open since before v1.6.0, is closed

- **`firestore.rules` is deployed.** `firebase.json` declares it and
  `.github/workflows/deploy.yml` deploys `--only functions,firestore:rules` on every merge to
  `main`. Authorization is now versioned, reviewable and diffable like everything else.
  **Deployed 2026-08-19 00:26:54 SGT**, CI run `32201046521`.

  ⚠️ **BOTH WIRING HALVES WERE REQUIRED AND ONLY ONE IS DOCUMENTED ANYWHERE.** Declaring
  `firestore` in `firebase.json` deploys nothing on its own — the workflow ran `--only
  functions`, which **excludes rules**. With the section added and the args untouched, CI goes
  green, the runbook says "wired", and the boundary is unchanged. If rules ever appear not to
  take effect, check that flag first.

- **What was live until this release, and why it mattered.** The owner supplied the console's
  rules on 2026-08-18 — the first time anybody in this repository could see them. The operative
  clause was `match /{document=**} { allow read, write: if isVerifiedStaff(); }`, and
  `isVerifiedStaff()` was **any verified `@kkh.com.sg` address, not the ten-person directory**.
  The Firebase API key ships in the public bundle, so any KKH employee who registered an account
  could read `wellbeing_history` — the longitudinal burnout record per named clinician —
  overwrite `system_data/roster_2026`, and approve any `shift_swaps` entry. Whole-hospital
  exposure, not internet-wide, and it was live the entire time. Four emulator checks now prove
  that same identity gets nothing.

- **Roster generation is admin-only.** Generation overwrites the whole roster (post-mortem
  **C2**); a one-day in-place edit — accepting a swap — stays open to every directory member.
  ⚠️ **Behaviour change:** any of the ten could press Generate yesterday. A non-admin now gets
  `permission-denied`, which `RosterView.jsx:592` already renders as "The roster was NOT saved"
  while keeping their configuration.

- **Two live pathways were saved by asking for the console rules rather than deploying on
  trust.** The proposal as written required `isMember()` on `community_assessments` (public
  screening telemetry) and `beta_feedback` (the sandbox widget) — both unauthenticated by
  nature. Deploying it unchanged would have stopped public telemetry **silently**, because
  `recordTelemetry` swallows its own error and the member of the public still reaches their
  result page. Both now ship **anonymous but shape-pinned** — key allowlists, size caps and a
  server clock — which is strictly tighter than the console's unpinned `if true`. The residual
  risk (an unmetered write endpoint that rules cannot rate-limit) is written into each block
  rather than left to be discovered.

- **Two of the console's five hand-written blocks governed nothing**, measured by grepping every
  collection name across `src/` and `functions/`: `community_resources` has **zero** references
  anywhere, and `feeds` is a **UI view name**, not a collection — the real one is `feed_posts`,
  which was therefore covered only by the catch-all. Both recorded as deliberate omissions so
  nobody transcribes them back in.

- **Verified, not asserted:** `scripts/firestore-rules-verify.mjs` — **31 checks, 31 as
  specified** against the Firestore emulator, committed as a runnable script rather than recorded
  as prose. It lives in `scripts/` because `vitest.config.js` collects `src/**/*.{test,spec}.*`
  and CI has no emulator. The pre-existing "139 checks" record in
  `firestore.rules.README.md` §5 is now explicitly scoped to the blocks it actually exercised,
  rather than being allowed to vouch for blocks written after it ran.

### Added

- **A stress-tester agent** (`.claude/agents/stress-tester.md`) and its harness
  (`npm run stress`). Every one of the ~1655 tests is a hand-authored fixture — a good property,
  but it meant the engine had **never been run on a configuration nobody wrote by hand**, and
  never above 20 staff. First run, seed `20260818`: **2,525 random rosters, zero broken
  invariants, zero audit disagreements, zero non-determinism.** The harness self-tests first —
  it corrupts a known-good roster five ways and requires every one to be caught — because a fuzz
  harness that cannot fail is worse than none.

### Known issues

- **`D11` — generation blocks the browser** — is recorded in the table under `[1.16.0]`, where it
  was filed on the day it was found. *Ordering artefact, stated rather than tidied: it was found
  by the harness that ships in THIS release, so it reads as pre-existing there. It is still open,
  and `[1.16.0]`'s shipped entry is not rewritten to move it.*
- Nothing in the standing list under `[1.13.0]` was fixed, and `D10` (the grade floor) is
  unchanged.

### Notes

- **No application source changed in this release.** `git diff` covers rules, wiring, scripts,
  agent definitions and documentation only. The behaviour change for users comes entirely from
  the rules now being enforced.

---

## [1.16.0] - 2026-08-18

A sixth roster structure, and the correction that a shape is one team — not a profession.

### Added

- **A sixth shape: "A grade floor, and a rotation across fixed areas"**, from respiratory
  therapy. Their therapist lead watched the Sandbox demo on 2026-08-17, walked through the
  configuration, and described four things: a **minimum job grade of AH12**, three areas
  (`NICU`, `CICU`, `Ward 65 HiD`), **rotation** across them, and Monday–Friday office hours.
  Respiratory *lost* an invented fixture in v1.13.0 for claiming a service nobody had described;
  `mockData.js` has carried the rule for getting one back ever since — *"add a SHAPE (a structure,
  sourced from a team who told us) or add nothing"* — and this is its first use in the direction
  it was written for.
  - **Measured, not asserted** (`generateRosterV2`, 2026-09-07, 4 weeks): `ok = true`,
    `hardViolations = 0`, an independent `auditHardConstraints` read-back of 0, `unfilled = 0`,
    `warnings = 0`, 20 days, 60 shifts, exactly **6 distinct leads** — every AH12-and-above person
    and nobody else — 10 duties each, split 3–4 per area.
  - **Falsified, the way the physiotherapy gates are:** removing `leadBands` puts three
    below-floor staff into the lead list (9 leads instead of 6), so the gate does the work rather
    than agreeing with what fairness would have done anyway.
  - `coLeads: 0` on all three areas is **forced, not a staffing choice**: a band gates the lead
    only — *"any grade may co-lead"* — so a second body is a body the floor does not reach.
  - **Rotation is measured in the output, not enforced by a rule.** She said they rotate; she did
    not say everybody must cover every area. Encoding a quota floor would be inventing a policy
    from a description.

- **`sourceScope` on every interviewed shape** — `{ teams, institutions, describedOn }`, required
  and asserted. See *Changed* for why it exists.

### Changed

- **A shape is ONE TEAM AT ONE INSTITUTION, and the app now says so.** Until this release the
  picker told a visitor *"this is the shape your own profession described to us"*. Every shape here
  came from one team at one site, so a respiratory therapist at any other SingHealth institution
  was told their **profession** had described a structure **one team at one hospital** described —
  and there are 27 other allied health professions with the same exposure. The copy now reads
  *"came from ONE team in your profession, at one institution … one team is not a profession,
  colleagues elsewhere roster differently"*, with a test asserting the old sentence is absent from
  the DOM. This was a pre-existing defect affecting all five prior shapes, not something the sixth
  introduced.
- **Scope is DATA, not prose**, and that is the future-proofing: when a second team from the same
  profession describes something different, `teams: 2` is a field that changes, where a
  hand-written sentence is something somebody must remember to rewrite and will not.
  `describedOn` is `null` for five of the six — four were interviewed before any date was
  recorded and the owner's own service was never described on a day — which is the measurement,
  not an oversight.
- **Attribution and suggestion were one field doing two jobs, and are now two.**
  `sourceProfession` + `sourceScope` **attribute** (mandatory for every interviewed shape);
  `sourceProfessionId` is the **auto-suggestion key alone** and is now nullable. **Respiratory
  declines it**: the shape is fully attributed and offered to nobody, because RTs work across every
  institution in the cluster and rotate differently. Profession coverage returns to **32 of 37
  leaves** (measured), and `suggestedShapeFor('respiratory-therapist')` is `null`.
- **The shape-signature test gained a `bandFloor` dimension.** Respiratory is the first shape to
  reach an engine field another shape already reaches — it and physiotherapy both use `leadBands` —
  and on the seven fields previously compared their signatures were identical, so the assertion
  failed correctly. They are still different structures: physiotherapy gates the **lead** and lets
  any grade co-lead (a supervision shape), respiratory uses the same field as a **floor on
  everybody**. The tuple is now stricter, not looser.

### Notes

- **The five shapes that keep an auto-suggestion keep it on borrowed time.** Each is also one team
  at one institution. The written trigger to remove suggestion-by-profession entirely: the first
  time two teams in one profession describe two different structures.
- **Audiology deliberately has no shape.** Their roster master asked for a feature (half-day AM/PM
  sessions, decision `Q13`); he did not describe his week. A conversation is not a structure.
- **An expressiveness ledger** now lives at the foot of `ROSTER_TODO.md` — every rule a real team
  has stated and whether the engine can say it. Four `No`s so far. Every `No` is a team that cannot
  use the tool, and that list rather than the fixture count is the measure of whether this serves
  the cluster.
- **Nothing in `functions/` changed, and `firestore.rules` is still undeployed** (`Q6`), so the
  authorization posture is exactly as it was.
- 1655 tests across 29 files, lint clean.

### Known issues — new in this release

| Id | Severity | Defect |
|---|---|---|
| **D11** | Medium | **Generation blocks the browser, and the cost grows with both headcount and run length.** Found 2026-08-18 by the new stress harness — the first time anything measured this; no performance figure existed anywhere in the repo before. `generateRosterV2` is called **synchronously inside the Draft click handler** (`RosterView.jsx`), with no worker and nothing yielding, so the tab is frozen for the whole run. Measured on this machine, isolated one variable at a time: with the roster fixed at 2,600 shifts, **25 staff → 0.98s and 200 staff → 5.9s** (roughly linear in headcount); with staff fixed at 100, **650 shifts → 0.38s and 10,400 shifts → 22.6s** — 16× the shifts for **60×** the time, so the per-shift cost itself grows 3.7×. Worst case measured: **200 staff × 40 tasks × 52 weeks = 51s**. Sandbox path only — live mode still uses the V1 `generateRoster` — but the sandbox is the surface every visiting department is shown, and V2 is the engine intended to replace V1. No threshold is asserted because none has been agreed; these are the numbers. Reproduce: `npm run stress`. |
| ~~**D10**~~ | ~~Medium~~ | ✅ **FIXED in 1.18.0** by the `minGrade` requirement kind. *(Original text, kept because a known-issues row that vanishes leaves no record that it was ever true:)* ~~**A grade floor cannot be stated, so the respiratory shape gates one grade too wide.** `leadBands` gates by BAND and `junior` is AH11–AH12, so *"minimum AH12"* has no expressible form — the nearest gate admits AH11. The shipped fixture is safe **only because its cast contains no AH11**.~~ |

*(The `### Known issues` table under `[1.13.0]` remains the standing list — **none** of `D2/D3/D9`,
`D5`, `D6`, `D7`, `D8` or the live-mode iOS zoom was fixed in this release.)*

---

## [1.15.0] - 2026-08-15

The roster owner's category palette, carried everywhere a shift goes.

### Added

- **Four standard categories with the owner's exact colours** — Clinical **brown**, Education
  **orange**, Research **lime green**, Management **yellow** — in `src/utils/rosterCategories.js`,
  the ONE map three surfaces read: the calendar chips, the wizard's per-task category label
  (now a coloured chip instead of summary text), and the ICS export. One map because three
  copies is how the app ends up disagreeing with the file a colleague imported into Outlook.
- **The `.ics` carries `CATEGORIES:` on every event** (RFC 5545 §3.8.1.2) — Outlook colours by
  category after a one-time assignment, and every later import follows. Escaping is
  load-bearing here more than anywhere else in the exporter: in CATEGORIES a bare comma means
  TWO categories, so `Clinic, Ward` travels escaped. Emitted only when a category exists.
- **…and RFC 7986 `COLOR:` for the standard four.** COLOR's value must be a CSS3 colour *name*,
  and the owner's palette is four literal CSS names — `brown`, `orange`, `limegreen`, `yellow` —
  so the palette ships in the file verbatim. A team's own category (`WEEKEND`, `VC`, a word of
  their choosing) gets `CATEGORIES` alone: no colour nobody chose.
- **The category box offers the standard four** via a datalist — free text deliberately
  preserved, because some categories are *quota handles*, not work types: the lab's `WEEKEND`
  floor pools over whatever word its tasks carry, and a closed dropdown would break a shape
  that already ships.
- **A deterministic, explainable suggestion.** A keyword table reads the task name and offers a
  chip — *looks like Research — "Journal" · tap to apply* — that names the word that earned it,
  applies only on a tap, and withdraws once anything is typed. Explicitly **not** AI: category
  changes quota pooling, so an unexplainable inference here is a claim the roster master cannot
  check — the exact failure class this project's post-mortem exists to prevent. The rule
  follows `suggestedShapeFor`: *a suggestion that loads without being chosen is a claim.*

### Changed

- The calendar's category colouring stops being one hardcoded special case. It was literally
  `s.category === 'VC' ? orange : blue` — the live team's video clinic and nothing else. The
  palette map now runs first; `VC` keeps its exact orange; everything unrecognised keeps the
  default blue.

### Notes

- Category is still an **opaque string to the engine**, deliberately. The engine gaining an
  opinion about what "Clinical" means is the day `WEEKEND` quotas stop being expressible.
  Styling and suggestion live entirely at the edge.
- Verified in the browser against the worked example: Clinical chips brown, Education orange,
  `Diagnostics` and `On Call` neutral; the calendar shows Inpatient Rounds brown, Student
  Supervision orange, Sleep Study Review default. 15 new tests (palette contract, CATEGORIES
  escaping, COLOR for the four and only the four, suggestion offered-not-applied), 1654 total.

---

## [1.14.1] - 2026-08-15

A wizard-row tidy asked for from a screenshot, and the documentation audit finished.

### Changed

- **The day chips are one letter each — `M T W T F S S` — on a single row.** Seven three-letter
  chips wrapped onto two lines on a phone and read as a wall of words. `short` is **ambiguous by
  construction** (Tue/Thu are both `T`, Sat/Sun both `S`), which sighted readers resolve by
  position; so the chips render the letter and *announce* the full day name, in both the tooltip
  and the accessible name. The `aria-label` keeps its three-letter form, so nothing addressing
  these chips by label had to change.
- **Co-lead is a checkbox** rather than a `Yes`/`No` lozenge. `role="checkbox"` on a button, not
  `<input type="checkbox">`: the wizard's phone rule is that every control declares a 44px height
  floor and `RosterView.mobile.test.jsx` enforces it over every `input` on the page, so a native
  checkbox would have to *be* 44px — an enormous system box. This draws a checkbox-sized mark
  inside a thumb-sized target and announces itself correctly regardless.

### Fixed

Nineteen documentation defects, from an audit of all twelve markdown files plus three
cross-document sweeps. **Six were introduced by the previous two commits** — the audit's main
value was catching those rather than the older drift.

- **`ROSTER_QC_AUDIT_PRIMITIVES.md` contained a committed NUL byte**, so `file` reported it as
  `data` and plain `grep` skipped the whole file **silently** — no warning, no match, exit 1. It
  had been invisible to every search in the repository for a week, including two audits looking
  for the defect ids it defines. The byte sat *inside the finding that documents the NUL-byte
  defect*, so the document reproduced the defect it was reporting.
- **The v1.14.0 CHANGELOG entry both answered and reopened Q12**, fifteen lines apart — a
  duplicated block, the second copy tracking it as `D12`, which resolves to nothing.
- **`README.md` published v1.13.0's release notes under a `v1.14.0` heading**, with the real
  v1.14.0 absent and v1.13.0 having no heading at all.
- **`README.md`'s Supported Versions table refuted itself** — `1.12.x` listed as supported on one
  row and deprecated on the next — and disagreed with `SECURITY.md`, which both files promise to
  match.
- **The post-mortem's status banner claimed M4 fixed.** Only half shipped: the false notification
  claim is gone, but nobody notifies the requester and there is no mechanism — the code says so
  at `RosterView.jsx:1614`. This was the only place in the document set where a still-open HIGH
  defect was called closed.
- **`ROSTER_HANDOFF.md` told the owner to type into a Skills column that does not exist.** The
  staff table has none (`RosterDemoWizardTables.jsx:1640`), so Q12's documented workaround is
  demo-only — defect `D5`. That instruction would have failed in front of an audience.
- **README overstated three capabilities:** a "Backend Firewall" that is a browser-side check (no
  Cloud Function checks the caller — `grep -c 'request.auth' functions/index.js` → 0); "strictly
  isolated Firebase collections" that do not exist, with one demo write that does reach
  production `feed_posts`; and an Auto-Healer `ROSTER_ALERT` chat surface deleted in v1.10.0,
  including a beta-tester smoke test that could not pass.
- **`firestore.rules.README.md`'s deploy smoke test would have triggered a false rollback** — it
  tested a surface that moved in v1.10.0, and §8.3 ends "if step 4 fails, roll back".
- **`.claude/agents/qc-steward.md` would have misdirected a verifier**: it said there is no
  `firestore.rules` (so live writes would be reported as guarded), no test script (so the whole
  verification phase would be skipped), granted permission to edit the now-frozen audit
  snapshots, told the agent to run gates that cannot finish in-repo, and cited a fixed precedent
  that would manufacture a false accusation.
- **The `D` → `Q` renumbering had 13 leftovers** across five files including six source comments,
  each colliding with a live defect of the same number. Both `CHANGELOG.md` and `qc-steward.md`
  now carry an explicit note on the two series, and the `Q` series' missing `Q9` is documented.
- Test counts aligned to 1639/28 across five files; the zero-tags claim corrected; §4 of the
  handoff retitled and its five omitted open items added; one table row whose unescaped `||`
  rendered an extra cell.

### Notes

Four things the audit could **not** settle, recorded rather than dropped: `firestore.rules` itself
has audited holes that appear in no ledger — and it is the file `Q6` proposes deploying; the
`_FOUNDATIONS` `D1`–`D10` series has no status anywhere; `C2` is fixed and shipped but named in no
release entry; and nothing here was verified against the deployed bundle.

> ### Bumping the version is part of shipping, not a separate decision
>
> Standing instruction from the roster owner, **2026-08-14**: *"update NEXUS PWA's version
> numbers correctly everytime we move forward with fixes, features."*
>
> - **Edit `package.json` `version` and nothing else.** `src/version.js` carries it to every
>   screen; `src/version.test.js` fails the build if any file types a version by hand.
> - **Which digit:** a stored-shape change an already-cached PWA client cannot read → **major**;
>   a new capability that old clients ignore safely → **minor**; fixes and copy only → **patch**.
> - **Then re-align the downstream copies in the same commit:** this file's top entry,
>   `README.md`'s title line, its `Version-` badge, its *Supported Versions* table and its
>   *Release History*, and `SECURITY.md`'s *Supported Versions* table. Nothing but
>   `package.json` is authoritative. Five copies is four too many, but they are prose for
>   humans, so the fix is to list them here — not to leave them to be found later.
> - **Then tag it:** `git tag -a vX.Y.Z` on the commit that carries the bump, never before it.
>   Every **release** tag in this repo points at a commit whose `package.json` already reads that
>   version, which is what makes `git checkout vX.Y.Z` mean anything.
> - **The AURA engine version is not the app version.** It tracks the agent's capability tier,
>   moves on its own, and is not touched by an app bump.

---

## [1.14.0] - 2026-08-15

The configuration wizard becomes a **numbered sequence** rather than a stack of similar cards,
and a set of documents that had drifted into contradicting each other is reconciled.

### Added

- **The wizard's panels are numbered 1–7 on a connecting spine.** They were seven
  similarly-styled cards in a column: nothing said they were ordered, nothing said Staff comes
  before Tasks for a reason, and nothing told a first-time reader how much was still below the
  fold. The roster owner asked for *"a number and a line … so that it's logical and sequential"*,
  from a reference showing exactly that.

  **The numbers are derived, not written at the call sites.** `WIZARD_STEPS` in
  `rosterWizard.js` is the one ordered list, and a step's number is its index. This matters more
  than it looks: steps 1–2 are rendered by `RosterView.jsx` and steps 3–7 by
  `RosterDemoWizardTables.jsx`, so hand-numbering would be two files that must be kept in
  agreement, and inserting a panel in one would silently make the other's numbers wrong. Same
  reason `BAND_DIVIDERS` derives from `BAND_NAMES` instead of being written down as two.

  `WizardStep` is purely presentational — it takes a number and children, holds no state and
  reads no roster data, so numbering the wizard cannot change what the wizard produces. All
  1630 pre-existing tests passed unchanged, which is the evidence for that claim rather than an
  argument for it.

  Live mode is **not** numbered: its wizard is a different and shorter thing (two textareas), so
  numbering it would count a sequence that does not exist there. It opts out by being handed no
  number, not by a second branch of markup.

- **`RosterView.steps.test.jsx`** — 9 tests. The load-bearing one asserts the badges read
  `1..N` **in DOM order, with no gaps and no repeats, across both files**, compared against a
  range derived from `WIZARD_STEPS` — so adding an eighth step makes the test demand an eighth
  badge instead of quietly accepting seven. Mutation-checked five ways, all caught: a panel
  losing its number (fails with `[1,2,3,5,6,7]` vs `[1,2,3,4,5,6,7]`), a number hard-coded at a
  call site, the registry reordered, `min-w-0` dropped from the content column, and the spine
  trailing past the final panel.

### Fixed

- **Two layout regressions the spine introduced, both found by looking at 375px rather than by
  testing.** The badge gutter costs 32px of a phone's width, and below `sm:` the wizard's rows
  stack rather than scroll, so that width comes out of the content.
  - The grade ruler's tick strip had 25px per cell against the 26px `AH10` needs, so every
    label from AH10 up rendered as `AH…`. The strip is now `text-[8px]` below `sm:`. It is
    `aria-hidden` and the bands are spelled out in full in the legend directly beneath it, so
    shrinking it by a pixel of font loses nothing — where narrowing the badges would have
    compromised the thing being asked for.
  - Giving step 2 a card to match the others then squeezed `<input type="date">` to 151px, and
    at the 16px Sandbox uses to stop iOS zooming it needs ~150px **plus** its picker icon — so
    the year rendered as `202`. Start Date now takes two thirds of the row and Weeks one; Weeks
    holds a one- or two-digit number and never needed half.

  *(A first attempt to measure the tick clipping used a `+1` pixel tolerance and reported no
  problem — the shortfall was exactly one pixel. Noted because the tolerance, not the layout,
  was what hid it.)*

- **The `D`-prefix meant two different things in different documents, and one of them was
  load-bearing.** `ROSTER_HANDOFF.md` used `D`n for *decisions the owner must make*; this file
  and the audits use `D`n for *defects*. They collided at 5, 6, 7 and 8 with unrelated meanings
  — so *"settle D6 before another department's data is involved"* pointed a reader at a linter
  setting rather than at Firestore rules. The **decisions** are now `Q`n, keeping their numbers;
  the **defect** numbers are unchanged because they are cited in already-released entries above,
  and rewriting a shipped release's record to tidy a name is the worse trade.

- **`ROSTER_HANDOFF.md` contradicted itself about `firestore.rules`** — §4 said the file exists
  but is inert, while the decision entry said there is none in the repo. The file exists, is
  tracked, and is **not deployed**: `firebase.json` declares only `hosting` and `functions`.

### Notes — a task can require exactly ONE thing of a person

`requiresSkill` is a single string, not a list. Combined with the fact that **bands are grade
ranges and cannot express a role**, that produces a gap the four-band split did not close and
could not have closed.

The roster owner's observation that opened it, 2026-08-14: *"there might be a technologist with a
junior grade."* So role and grade are orthogonal. A technologist at AH11 sits in the `junior` band
exactly like a junior clinician at AH11, and `leadBands: ['junior']` therefore **admits them as
lead**. Gating on a skill instead does work — a skill is an opaque string, and skill ANDs with the
band gate — but only while the task needs nothing else. Measured against the engine:

| Task gate | Who may lead |
|---|---|
| `requiresSkill: 'CPET'` | registered+CPET **and technologist-with-CPET** — registration ignored |
| `requiresSkill: 'registered'` | registered+CPET **and registered-without-CPET** — competency ignored |
| `requiresSkill: ['CPET', 'registered']` | refused — *"must be a skill name"* |
| `requiresSkill: 'CPET+registered'` | refused — *"nobody holds that skill"* |

So *"a registered clinician who is also CPET-competent"* — which is what Paediatric CPET actually
requires — **cannot be expressed today.** One requirement wins and the other is waived. The only
workaround is a fabricated compound skill (`CPET+registered`) typed into a person's skills column,
which is the class of special case the v1.11.0 primitives work existed to remove.

**Not fixed, deliberately.** The fix is a third eligibility axis — one more column on the person,
checked alongside band and skill rather than instead of them — and it changes the staff table,
which is the screen the respiratory and psychology teams are about to be shown. **Two professions
have now asked for it independently:** cardiology's roster master described competency sign-off per
modality *with levels* (supervised vs independent), which also answers the open question of shape
— it is an **ordered list**, not a boolean. Tracked as **Q12** in `ROSTER_HANDOFF.md`.

Two consequences that are not optional:

- **Registration gating must not be claimed** for this version. Band gating is real and
  demonstrable; registration gating is not, yet.
- **Do not name the new field `role` — that name is taken and it is load-bearing.** A slot's
  `role` is both the human-readable slot label (`unfilled[].role` carries
  `'Junior embryologist'`) *and* the identity key for two primitives: affinity is **scoped to the
  role**, so "the same practitioner at each clinic" pins the lead without also concentrating the
  co-lead slots on one person, and `COMPOSE_PAIRING` groups a shift by matching
  `fill.position.role === anchorRoleOf(task)`. It constrains nothing about *who* is eligible, but
  reusing the word would collide with the field that makes continuity and pairing work.
  `registration` or `staffCategory` avoids it.

---

## [1.13.0] - 2026-08-14

Two changes, and the second is what makes the first repeatable. The arrangement picker
becomes **profession + shape**: MOH's own 28 allied health professions as vocabulary, and
**five structures** — not one fabricated department per profession. And the app stops
hand-typing its own version, because by v1.12.0 it was rendering three different wrong
answers to "which version is this?" on the deployed site.

⚠️ **THIS SECTION REPLACES AN EARLIER UNRELEASED ENTRY, AND THE REPLACEMENT IS THE POINT.**
That entry announced *twelve* arrangements, one per department, with 23 more to come so
that every MOH profession had one. Seven of the twelve were guesses: plausible services
nobody had described, offered under a real profession's name with a `correction` checklist
attached. The checklist was the tell — a fixture that has to apologise for itself is
making a claim it cannot support. Nothing of that entry shipped, and the retraction is
recorded here rather than deleted, because "we nearly wrote 28 fictional services" is the
useful half of the story.

The roster owner stopped it with the observation that made the whole thing unnecessary:
*"other professions can also ride on the configurations of the 5. That's the purpose of
this roster's new version — so roster masters can configure for their team regardless of
their profession."*

### Added

- **Five shapes, each named by its STRUCTURE and attributed on screen to the profession
  that described it.** A shape says *"this is how the physiotherapists do it — adapt it"*,
  which is true. A per-department fixture said *"this is how art therapists do it"*, which
  was invented. Every shape is one of the five configurations that already existed and had
  an interview behind it, re-presented by what it demonstrates rather than by the
  department it came from. Every one re-verified by **running the engine**, with an
  independent `auditHardConstraints` read-back of each finished roster:

  | Shape | From | `ok` | Hard violations | Audit read-back | Days | Shifts | Unfilled | Warnings |
  |---|---|---|---|---|---|---|---|---|
  | Graded duty split | Physiotherapist | true | **0** | **0** | 28 | 56 | **0** | 0 |
  | Periodic specialist clinic, same practitioner each time | Psychologist | true | **0** | **0** | 60 | 159 | **0** | 0 |
  | Team-based rotation | Embryologist | true | **0** | **0** | 252 | 360 | **0** | 0 |
  | Weekend quota inside an hours ceiling | Medical Laboratory Technologist / Scientist | true | **0** | **0** | 54 | 171 | **0** | 1 † |
  | Fixed weekday sessions plus out-of-hours slots | Clinical Exercise Physiologist | true | **0** | **0** | 24 | 88 | **0** | 0 |
  | The Marvel Team *(fictional)* | — | true | **0** | **0** | 10 | 24 | **0** | 0 |
  | The Marvel Team — full worked example *(fictional)* | — | true | **0** | **0** | 12 | 32 | **1** ‡ | 0 |

  † The one warning is the engine being honest about its own horizon: the run covers only
  2027-04-01 to 2027-04-04 of April, so the Saturday floor is *not judged* there. It is
  deliberately not trimmed away.
  ‡ The one unfilled slot is the deliberate one, and its reason is the argument for
  trusting the tool: *"no available staff hold skill CPET for Paediatric CPET coLead on
  2026-09-16 (2 qualified, 1 on leave, 1 already on this task)"*.

- **The five feature signatures are asserted DISTINCT**, which is why five is the right
  number: `leadBands` both directions; `recurrence` + `leadBands` + `continuity` +
  `weeklyHours`; `slots` + cohort `windows`; a `quota` floor + `slots` + `weeklyHours`;
  plain days-based sessions. No two shapes reach the same set of engine fields, so choosing
  between them is choosing between structures rather than between casts of fictional names.
- **All 28 MOH professions as the picker's first control** — 37 selectable leaves, with
  `<optgroup>` for the two professions MOH nests (12, Medical Technologist / Physiologist,
  five sub-disciplines; 24, Psychologist, six). Sorted **in code** by the name a visitor
  reads, `localeCompare(…, 'en')`, never hand-ordered — asserted as a *property* (the list
  equals its own sort) so it cannot be satisfied by re-ordering the array. A group heading
  is not selectable, which is correct: a roster belongs to a cardiac lab or a sleep lab,
  never to "medical technology" in general.
- **The chosen profession labels the configuration and nothing else.** An Art Therapist who
  loads the physiotherapy shape sees *"Art Therapist — Graded duty split"* on their roster,
  with the shape's attribution beside it. Verified by generating the same shape under three
  different professions and comparing the **rendered calendar cell by cell**: identical,
  and identical to `generateRosterV2`'s own answer for the fixture. The profession reaches
  no engine field by construction — it is not an argument to the loader.
- **A non-binding suggestion of which shape tends to suit which profession** — the roster
  owner's own pairings, covering 32 of the 37 leaves. It is rendered as a suggestion, says
  out loud that nobody in that profession has described their week, and **never applies
  itself**: a suggestion that loads without being chosen is a claim. The five professions
  who *did* describe a shape are told that instead. Five leaves have no suggestion and are
  told why — three of those five had a hand-built fixture before this change, which is the
  clearest measure of what was wrong with it.
- **"Start blank" is a real first option**, not the dead placeholder it replaces: it empties
  the tables so a team can type their own, and **keeps the chosen profession**, because
  emptying a form is no reason to make somebody say who they are again.
- **`rosterWizard.ruler.test.js` — the band ruler's safety property, proved by exhaustion.**
  The ruler is the one control in the wizard that silently corrects its input: it *clamps* a
  drag rather than refusing it, because a pointer position is not a number somebody typed
  and can re-read. That clamp is the only thing between a drag and a `rules.bands` object
  that is not a partition of the grade scale.

  The four-band repair leaned on *reasoning* about that clamp — "a divider cannot cross its
  neighbour, because its floor is one grade above the divider below it". The reasoning was
  correct, but it was reasoning. This walks every legal partition of AH7–AH17 into the
  scale's bands (**120** today) × every divider × every requested grade from well below the
  scale to well above it — **10,800 moves** — and asserts after each that the result is
  still contiguous, gapless, non-empty and reaching AH17.

  It also covers the path the sweep alone cannot see. From a *legal* partition every divider
  already sits inside its travel, so the clamp never binds and a loosened ceiling is
  invisible — verified, by mutation: removing the ceiling's reservation for the bands stacked
  above it **survived** the sweep. So the test also feeds `bandRulerModel` input that is not
  a partition at all (blank cells, `AH nine`, inverted ranges, every band demanding AH17 at
  once) and asserts it still draws a legal partition *and* reports `representsInputs: false`
  rather than quietly rewriting what the user chose.

  Mutation table — seven mutations of `rosterWizard.js`, each caught: divider may touch its
  neighbour **3 failed** · top band loses its reserved grade **3** · clamp removed **2** ·
  ceiling forgets the bands above it **1** · ceiling off by one the other way **1** · floor
  ignores the divider below **1** · honesty flag hard-wired true **1**. Every bound is
  derived from `BAND_NAMES`, so it re-measures itself for free when a fifth band arrives.

- **`src/version.js` — the one place the app learns its own version**, exporting
  `APP_VERSION` (`1.13.0`) and `APP_VERSION_LABEL` (`v1.13.0`) from `package.json`'s
  `version`. This file has asserted since v1.6.0 that `package.json` is the single source of
  truth for the app version. Nothing enforced it, and the drift was not hypothetical: the
  deployed site was rendering **three** hand-typed literals **simultaneously**, all stale,
  none agreeing with each other or with `package.json`'s `1.12.0` — see *Changed* below.
  Nothing would ever have updated them, because nothing referenced them.

  **An import, not a Vite `define`.** This repo has **no `vite.config.js` at all**; the build
  runs on Vite's defaults and esbuild transforms `.jsx` natively. Adding a build config purely
  to inject a string would newly place the app's build under a file that did not exist before,
  and a `define` is invisible to `vitest.config.js`, so every test rendering these components
  would have to learn about it too. A plain import needs no config and behaves identically in
  the build and under test.

- **`src/version.test.js` (3 tests) — the standing instruction, enforced by the suite rather
  than by memory.** It strips comments from every non-test `.js`/`.jsx` under `src/` and then
  FAILS if a version-shaped literal appears in code that renders. Comments are exempt on
  purpose: this codebase annotates changes with the release that made them (`shipped v1.9.0`,
  `RFC 5545 §3.3.11`), which is legitimate history and must stay writable — and that exemption
  is the test's honest limit, stated in the file rather than discovered later. Two non-app
  versions are named in an `ALLOWED` list so that adding a third is a deliberate act: the
  **AURA engine's** `v2.3` capability tier, and RFC references.

  Mutation-verified, **three mutations, all three caught**: re-adding the `v1.4` literal to
  `AdminPanel.jsx`; hard-coding the current version *inside `version.js`* (which passed until
  `version.js` was itself brought into the scan — the literal and the truth coincided at
  `1.12.0`, so nothing noticed); and pointing the scan at a directory that does not exist —
  the vacuous pass, which is the dangerous one, now caught by asserting the scan read files at
  all.

### Changed

- **AH7–AH10 is its own band, `nonExempt`. The grade scale has FOUR bands, not three.**
  A correctness fix from the department's roster owner, in their words: *"AH7 to AH10 are
  non-exempt staff like associates, assistants, technologists. AH11, AH12 are junior AHP."*

  `junior` shipped as `[7, 12]`, which put an AH8 assistant and an AH12 junior clinician in
  the same band. Any task gated `leadBands: ['junior']` therefore let a non-exempt
  assistant **lead** it — the exact substitution the gate exists to prevent. The bands are
  now `nonExempt [7,10] · junior [11,12] · senior [13,14] · principal [15,17]`.

  Nothing was hard-coded to three, so the surfaces followed on their own: the ruler grew a
  third divider (`bands - 1`), task rows grew a fourth chip, and every prose label came
  from the same list. Cost of the split, measured rather than estimated: **121 tests
  failed**, of which **120 were assertions that had the old cut written into them** — the
  boundary as fact, a two-slider count, `Junior AH7–AH12` as text. **One was a real
  fixture defect**: the embryology trio graded its two junior embryologists AH8 and AH9,
  which is now non-exempt, so a `{band: 'junior'}` slot had nobody eligible. Re-graded to
  AH11/AH12 — the grades the interview actually described.

  One demo assertion was found to be **measuring nothing**: it moved divider `0` to AH10 to
  watch a task's grade caption follow, and divider 0 now *starts* at AH10, so the move was
  a silent no-op that would have passed forever. It now drives the junior|senior divider
  and watches two gated captions move in opposite directions on one keystroke.

  Every divider query in the component tests is now addressed **by `aria-label`**
  (`Boundary between the Junior and Senior bands`) rather than by index. Index-based
  queries were the single largest cause of breakage here — 13 of the 21 component failures
  were a `const [lower, upper] = dividers()` silently grabbing a different pair — and a
  label cannot go stale that way when a fifth band arrives.

- **`inferred` and `correction` are gone — the constant and every block.** They existed to
  disclaim a claim; nothing in the picker now makes that claim, so a disclaimer would be
  theatre. Two provenance kinds remain: `interviewed` for the five shapes and `fictional`
  for the two Marvel demos. If a future entry seems to need `inferred` again, that is the
  signal somebody is about to describe a service nobody has described.
- **The amber warning panel is now a neutral attribution panel**, in the wizard *and* beside
  the finished roster. Same reason it existed in the first place — the wizard is a modal and
  it closes the moment the roster is drafted — but it now states two facts instead of
  apologising: whose profession this roster is, and whose structure it borrowed.
- **Six invented arrangements deleted**: `respiratory`, `audiology`, `cardiology`,
  `clinical-counselling`, `medical-social-work` and `pulmonary`, with their fixtures and
  their `correction` blocks.
- **`DEMO_EXAMPLE_DEPARTMENT` was KEPT, and stripped of its profession claim.** It was the
  `respiratory` arrangement's config. It is now the openly fictional *"The Marvel Team —
  full worked example"*: same twelve people, six duties, two band gates, CPET skill gate,
  0.6 FTE contract, one day of leave and one honestly unstaffed slot, **byte-identical
  except its `label`**, and attributed to nobody. It was kept because it is the only fixture
  here that exercises all of that at once — and because ~40 assertions in
  `RosterView.demo.test.jsx` describe it, held by reference (`toBe`) and not by copy, so
  they still describe the fixture the app actually loads. Its cast was already Marvel, so it
  reads as the quick demo's bigger sibling rather than as a stray profession.
- **`DEMO_ARRANGEMENTS` is `DEMO_SHAPES`.** The word "arrangement" is what carried the error
  — one arrangement per department — so the correction is encoded in the name.
- **The shape list is in a deliberate order, and that is a decision.** The owner's "make the
  dropdown alphabetical" applied to a list of *professions*, where a reader arrives knowing
  the word they are looking for; that list still exists and is still sorted in code. Nobody
  arrives looking for the letter G in a list of five structures, so the shapes are ordered
  by kind — the five with an interview behind them first, the two fictional demos last —
  with an `<optgroup>` on each group so the ordering reads as structure rather than as
  somebody having forgotten to sort.
- **Both controls get the mobile treatment already established in that file**: native
  `<select>`, `text-base sm:text-sm` (iOS Safari zooms the page on any input under 16px) and
  `min-h-11` touch targets, from **one shared pair of class constants** so two controls
  cannot drift into two different touch targets.

- **Three hand-typed version literals replaced by `APP_VERSION_LABEL`.** All three were live
  on the deployed site at once, and all three were wrong:

  | File | Was on screen | Where a clinician saw it |
  |---|---|---|
  | `src/App.jsx` | `v1.41-OFFICIAL` | sandbox banner |
  | `src/components/WelcomeScreen.jsx` | `System v1.52` | landing footer |
  | `src/components/AdminPanel.jsx` | `System Database v1.4` | admin header |

  `package.json` said `1.12.0`. None of the three had any relationship to it, or to each
  other. All three now render `v1.13.0` and will follow every future bump without anybody
  remembering to look.

  **A judgment call the owner can reverse.** `AdminPanel.jsx` said "System **Database** v1.4",
  which could have meant a *schema* version rather than the app version. It is wired to the
  app version, because there is **no schema-version constant anywhere in this codebase** —
  so nothing would ever have moved a schema version either, and a second stale number is not
  an improvement on one. If the intent was a schema version, the fix is a real schema
  constant with something that maintains it, not a literal; say so and it changes.

### Notes

- **Why this is `minor` and not `major`, established by reading the write path rather than by
  reasoning about it.** The four-band split changed a *default* — `junior [7,12]` became
  `nonExempt [7,10]` + `junior [11,12]` — and a stored three-band `rules.bands` object would
  no longer validate as a partition. That is the fact that would have forced `2.0.0`, so it
  was checked directly: **`rules.bands` is never persisted.**

  - The only roster write in the app is `setDoc(doc(db, 'system_data', 'roster_2026'),
    prepared.data, { merge: true })` in `RosterView.jsx`, and `prepared.data` is
    `prepareRosterWrite`'s `generate(config)` **output** — dates mapped to shifts. The
    `config` itself, `rules.bands` included, never leaves the browser. `prepareRosterWrite`
    defaults to `generateRoster`, the V1 engine, which has no concept of bands.
  - The matching read, the `onSnapshot` on the same document, sets `rosterData` from
    `snap.data()` and reconstitutes no configuration.
  - Every band-carrying identifier in `RosterView.jsx` is `demo`-prefixed
    (`demoBandInputs`, `demoWizard.config`, `demoResult`), and `generateRosterV2` is called
    in exactly one place — inside the demo path, which is latched three times against ever
    reaching `setDoc`.
  - Nothing persists the wizard's config client-side either: the only `localStorage` keys in
    the app are theme, language and the AURA greeting date. No `sessionStorage`, no
    `indexedDB`.
  - Belt and braces regardless: `bandsOf(rules)` falls back to `DEFAULT_GRADE_BANDS` whenever
    `rules.bands` is absent or not a plain object.

  So no client already sitting in somebody's service-worker cache can be handed a document it
  cannot read. **This says nothing about Q8** (whether the 6 May shift-shape change should
  itself have been `2.0.0`), which remains open in `ROSTER_HANDOFF.md` and is not reopened here.

- **`mockData.js` stayed append-only where it had to.** `MOCK_STAFF`, `MOCK_STAFF_NAMES`,
  `MOCK_ROSTER`, `MOCK_PULSE_TRENDS` and `MOCK_TEAM_DATA` are byte-identical.
- **`mohAlliedHealth.js` was not edited.** The picker imports it read-only, and the tests
  check the dropdown against MOH's published list rather than against a count typed into a
  test file.
- **The engines were not touched.** `rosterEngineV2.js` and `auraEngine.js` are
  byte-identical, as is the pure mapper `rosterWizard.js`; live mode's wizard is unchanged
  and still pinned byte-for-byte by `RosterView.wizard.test.jsx`.
- **What the five deleted arrangements took with them, stated rather than discovered later:**
  they were the only *fixtures* reaching `requiresSkill` on a monthly recurrence,
  `forbidPairs`, task-scoped `windows` and a stated `maxHoursPerDay`. Every one of those
  engine fields still has its own unit tests in `src/utils/rosterEngineV2.*.test.js` and its
  own control in the wizard tables; the skill gate is still exercised through the worked
  example's CPET duty. What is gone is five inventions, not five capabilities.
- **What no test here can tell you:** whether five structures are enough for 28 professions.
  They are honestly attributed and adaptable, which is a different and much weaker claim
  than "they fit" — and it is the strongest claim available until somebody from a sixth
  profession describes their week.

### Known issues — documented, NOT fixed

These defects are diagnosed in writing and are **still present in the shipped code**.
They are listed here so that the existence of `ROSTER_POSTMORTEM.md` and
`ROSTER_QC_AUDIT.md` cannot be mistaken for the defects having been repaired. Ids are
traceable to those documents.

| Id | Severity | Defect |
|---|---|---|
| **D2/D3/D9** | High | **A mistyped availability window silently deletes a person from the roster.** A window whose dates fall outside the run makes that person eligible on zero dates — no error, no warning, no unfilled slot, because colleagues absorb the work. The engine already computes `neverRostered` and discards it: `measureRosterLoad` has no UI caller at all. One warning closes all three. `ROSTER_QC_AUDIT_PRIMITIVES.md`. |
| **D5** | Medium | The slot "needs skill" input is reachable but unusable for a typed-in team. |
| **D6** | Medium | The ESLint config disables `no-unused-vars` for the whole 6,824-line engine — the "passes by disabling things" failure. Two real findings sit behind it. |
| **D7** | Low | `compileQuota`'s comment contradicts the validator on `max: 0`. |
| **D8** | Low | The impossible-floor refusal ignores the hours model. |
| **Live iOS zoom** | Low | The live-mode wizard's two textareas are still `text-xs`, so live mode still zooms on iOS. Their class strings are pinned byte-for-byte by a test; four clinicians, desktop. |

*(**P0.7 is fixed** as of v1.11.0 — `npm run lint` runs, 76 files, 0 messages, and is a CI
gate after the test step. It had never worked before: no ESLint config had ever existed.)*

Additional lower-severity findings (C1/C3/C4 persistence and configuration drift,
D-series verification gaps, E1/E4 documentation overstatement, the swap modal's
unlabelled `<select>`s — an accessibility gap noted during P8.3) are recorded in
`ROSTER_QC_AUDIT.md`, `ROSTER_POSTMORTEM.md` and `ROSTER_TODO.md` and are likewise
**not** fixed. M12's session-level guard is client-side only; the durable guard is a
Firestore rule, blocked on decision **Q6** *(a decision; renamed from `D6` on 2026-08-14 — `D6` is now only the ESLint defect)*.

---

## [1.12.0] - 2026-08-12

Built for the phone, because that is where visiting colleagues will actually open it.

### Changed

- **The arrangement picker is one dropdown.** It was five stacked cards, each with its own
  Load button, description and warning block — a menu on a desktop and a wall of text on a
  phone, which pushed the form itself off the first screen. A native `<select>` is the right
  control precisely *because* it is native: iOS and Android render it as a full-height
  wheel, so five options cost one tap and no vertical space, and it is keyboard- and
  screen-reader-operable without any work. Only the chosen arrangement's description and
  caveat render, so the panel is a fixed three lines regardless of how many professions we
  support.
- **One behavioural consequence, stated rather than buried:** the respiratory arrangement's
  "this is not your service" caveat used to be readable *before* pressing anything, because
  all five options were expanded. It now arrives *with* the choice. The property that
  matters is unchanged and pinned by test — it is on screen from the moment the fixture
  loads, before anyone can read, draft or act on the roster it produced.
- **The staff-name placeholder is `e.g. Peter Parker`**, tying it to the Marvel names.

### Added

- **The Marvel Team, as the first option and deliberately the smallest thing here.** Every
  other arrangement demonstrates a constraint a real profession described. This one
  demonstrates only that the thing runs: five people, four ordinary weekday duties, no
  skills, quotas, windows or hours overrides. Verified by running the engine — **10 days, 24
  shifts, 0 unfilled, 0 warnings, nobody unrostered**, confirmed twice through an
  independent audit. Someone who opens the app on a phone in a corridor picks it, taps
  Draft, and sees a filled calendar on one screen.
- **A third provenance kind, `fictional`.** "Inferred" means *our best guess at your
  service, please correct it*; a Marvel team means no such thing. Folding it into `inferred`
  would have attached a correction checklist to a department that does not exist.

### Fixed — the mobile layout, against measured defects rather than guesswork

Measured by rendering the wizard and walking every element, before and after:

| | Before | After |
|---|---|---|
| Unconditional `overflow-x-auto` (wizard + result panel) | 3 | **0** |
| Focusable fields under 16px | 42–48 | **0** |
| Interactive elements with no minimum height | 111–114 | **0** |
| Band-ruler divider hit area | 24×40px | **44×44px** |

- **The tables no longer scroll sideways.** Below `sm:` each row becomes a stacked card —
  column name above the field, full width — and reverts to a table from `sm:` up. **CSS
  only, one DOM tree**: the `<table>` becomes `display:block`, `<thead>` hides, and column
  headings come from one frozen object read by both the `<th>`s and the in-card labels. A
  test asserts no `aria-label` in the wizard appears twice, which is what turns red if
  someone later "fixes" mobile by forking the row into a second card list that drifts.
- **iOS Safari no longer zooms the page on focus.** It does that to any input under 16px,
  stranding the user at 1.4× with the modal off-screen. Every focusable field is now
  `text-base sm:text-xs` via shared constants.
- **44px touch targets** on buttons, chips, toggles and fields, relaxed at `sm:` where
  density is wanted.
- **The wizard is full-screen below `sm:`** with safe-area padding for notches and a
  **sticky footer**, so Draft and Cancel are reachable without scrolling.
- **The month becomes a one-column list on a phone**, each row naming its own weekday.
  Seven columns at 375px is 48px per day — "EFT / Lead: Fadzlynn, Co: Derlinder" does not
  fit at any legible size, and shrinking further is the same unreadable grid in smaller
  type. Same shifts, same "not staffed" markers, same days.

### Notes

- **A dead-class discovery, flagged because it changes the desktop.** The drawers' `w-40`,
  `w-36` and `w-48` never applied: `CELL_INPUT` carries `w-full`, which Tailwind emits
  after the numeric widths. They are now `sm:w-40` etc., so mobile is unambiguously
  full-width **and those desktop widths work for the first time** — a change nobody asked
  for, which restores evident intent.
- **Recommendation, not shipped:** "my week" is the right *default* on a phone; the
  seven-column grid is a roster-builder's desktop affordance. Changing which view opens is a
  behaviour change, not a layout one, so the grid stays the default.
- **The live-mode wizard still has two `text-xs` textareas** and so still zooms on iOS.
  Their class strings are pinned byte-for-byte by a test; four clinicians on desktop, out of
  scope for this pass, stated rather than hidden.
- **What no test here can tell you:** jsdom paints nothing. Spacing at 375px, tap feel,
  whether the sticky footer seats flush, contrast of the new in-card labels, and dark mode at
  every breakpoint all need a human with a phone.

1554 tests (was 1525), **zero existing assertions changed** — the aria-label query idiom
held through a full layout rewrite, which is the point of it. Lint exit 0. Both engines, the
mapper and all five compatibility gates byte-identical.

## [1.11.0] - 2026-08-12

The engine stops being a museum of special cases. Six professions in, each new team was
costing a new flag; this release refactors those flags into **orthogonal primitives** they
are all instances of, adds the two that were genuinely missing, and gives every one of them
a surface. Four real department arrangements ship with it, and `npm run lint` runs for the
first time in this repository's history.

### Added

- **A primitive constraint layer.** `days`, `recurrence`, `continuity`, `leadBands`,
  `requiresSkill`, `slots`, `hours`, `forbidPairs` and the caps are now **sugar** compiled
  down to six orthogonal primitives — **temporal, eligibility, capacity, affinity,
  structure, quota** — and nothing past the compiler reads a feature name. Combinations no
  sugar exposes yet (1st *and* 3rd Wednesday, alternate weeks, explicit date lists) already
  work through the general path. **Faithfulness is the whole claim, and it was verified
  adversarially:** an independent audit built its own harness and compared **22,000
  generated configs** against the previous engine — 0 substantive divergences, with 233
  distinct `unfilled` reason templates and 22 validation-refusal templates reproduced
  character for character, in two timezones.
- **A profession-agnostic scale.** AH7–AH17 with three fixed bands was KKH allied health.
  A scale is now an ordered list of ranks plus any number of named regions, so nursing
  bands, MO/Registrar/Consultant, or a two-tier team all work. The AH/three-band exports
  are retained as one instance of the general thing.
- **Quotas — the first *floor* in an engine that had only ever had ceilings.** The medical
  lab scientists' "at least 2 Saturdays a month" is now expressible. Floors invert the
  logic: a cap is checked when filling a slot, but a floor can only be judged once a period
  is filled, so a `min` is **preferred during selection, then warned about** — never hard,
  because capacity cannot be invented. A `max` is hard. An arithmetically impossible floor
  is refused at configure time **with the arithmetic shown** ("4 × 3 = 12 duties — but only
  8 exist there").
- **Cohort windows.** A person can be eligible only within date ranges, optionally only for
  named tasks — the embryologists' A/B/C four-month block rotation, and equally rotations,
  secondments, placements and locums.
- **Every stranded capability now has a UI.** `continuity`, monthly recurrence,
  `forbidPairs`, the daily/consecutive caps, `maxPerDay`, `category`, quotas and windows
  were all engine-only. Reachability was proven the way the previous audit demanded — by
  feeding **mapper-built** configs to the engine and observing the roster change, not by
  asserting a field is emitted.
- **Four department arrangements**, selectable from a picker, each demonstrating what that
  team cares about and each verified by running the engine: **Respiratory & Rehab**,
  **Psychology** (3rd-Wednesday principal-only clinic with continuity), **Embryology**
  (weekend principal+senior+junior trios on four-month blocks), **Medical Laboratory**
  (42-hour weeks with a 2-Saturdays-a-month floor). The respiratory one is **labelled in
  the UI as inferred, not interviewed** — that team has not been consulted, and an example
  offered for correction is worth more than a mock-up presented as their service.
- **`npm run lint` works, for the first time ever.** No ESLint config had existed, so the
  `--max-warnings 0` gate had never run. Now 76 files, 0 messages, wired into CI after the
  test step. Genuine findings were fixed in source, including two dead declarations in
  `functions/index.js` and the service worker — both verified unused at `HEAD` and
  re-parsed, since neither file has any test coverage.

### Fixed

- **A raw NUL byte made `rosterWizard.js` invisible to `grep`.** Introduced by this batch
  and caught by audit. `file` reported "data", and `grep -c export` printed *nothing* while
  exiting 0 — so `grep -rln "forbidPairs" src/` omitted the very module that parses and
  validates it. That is the exact mechanism of this project's founding defect, re-armed.
  **The obvious fix was wrong and is worth recording:** deleting the byte turned
  `join('\u0000')` into `join('')`, so `['An','nBob']` and `['Ann','Bob']` would collide
  into one key — and all 1522 tests still passed, because nothing exercised it. The NUL is
  deliberate; only the *literal byte* was the bug. It is now written as an escape, and a
  mutation-checked collision test guards the separator.

### Notes — known issues from the audit, listed rather than implied fixed

`ROSTER_QC_AUDIT_PRIMITIVES.md` records nine defects. D1 is fixed above; the rest are open:

- **D2/D3 — a mistyped availability window silently deletes a person from the roster.** A
  window whose dates fall outside the run makes that person eligible on zero dates, with no
  error, no warning and no unfilled slot, because colleagues absorb the work. The engine
  *already computes* `neverRostered` and throws it away — **D9**: `measureRosterLoad` has no
  UI caller at all. One warning closes all three; it is the next fix.
- **D4** — "all stranded capability closed" is not quite true; the wizard file itself lists
  the remainder. **D5** — the slot "needs skill" input is unusable for a typed-in team.
  **D6** — the ESLint config disables `no-unused-vars` for the whole engine, which is the
  "passes by disabling things" failure. **D7** — a comment contradicts the validator on
  `max: 0`. **D8** — the impossible-floor refusal ignores the hours model.

1524 tests (was 1213), green under both timezones, lint exit 0. Live-mode generation is
still the original V1 engine, byte-identical.

## [1.10.0] - 2026-08-12

The engine capability from v1.9.0 becomes reachable, the roster starts telling the truth
in the calendar rather than in a list underneath it, and coverage requests move out of the
AI chat panel into the roster itself.

### Added

- **Hours and multi-slot shifts are now reachable.** v1.9.0 shipped 1,722 engine lines and
  178 tests that no user could invoke — the audit caught it and the changelog said so. The
  sandbox wizard now has an **Hours** column per task, a **department working week**
  control, and a **slot editor** for tasks that need several people together (the
  embryologists' principal+senior+junior weekend trios), all behind a per-row expander so
  the common case stays legible. Verified by feeding mapper-built configs — not
  hand-written ones — straight into the engine and observing the roster change.
- **Unfilled slots render inside the day cell.** The engine's honesty used to live in a
  list below the grid. A day where *every* slot failed produces no roster key at all, so
  it was indistinguishable from a day with nothing scheduled; those cells are now drawn
  from `unfilled`, with the reason reachable as text and as an accessible attribute.
- **"My week" — a person view.** A toggle between the department grid and one person's
  duties: date, task, their role, hours. Read-only rendering of the same data; the grid
  stays the default.
- **Language pass.** "Draft roster" rather than "Generate Sandbox Roster"; an FTE of 0.6
  reads as the days it means; "not staffed" rather than "unfilled". Internal vocabulary
  no longer reaches the screen.
- **One-tap cover.** Coverage requests are answered on the shift itself, in the roster,
  with the badge and the request card where the week is visible. `AuraPulseBot` no longer
  reads `shift_swaps` at all — the chat detour is gone. Every guarantee from v1.6.1 is
  preserved and independently re-verified: read-back before `APPROVED`, mechanical
  substitution, `swapRole` recorded at request time, legacy shift shapes tolerated, admin
  on-behalf requests, and the duplicate-request guard.
- **`CoverageWatcher` — an always-mounted notifier.** See the fix below; this is the
  component that keeps the one-tap move from costing the notification.

### Fixed

- **A coverage request could reach nobody.** Moving the listener into `RosterView` was
  right for *answering* but wrong for *noticing*: `RosterView` is mounted only when the
  Roster tab is open (`App.jsx`), whereas the chat panel it replaced was mounted always
  and force-opened itself. A colleague on Dashboard, Pulse or Feeds would never learn a
  request existed — ROSTER_QC_AUDIT.md **M5 returning by a different route**, found by
  audit and not by the change that caused it. There is now exactly one surface that
  **notices** (`CoverageWatcher`, always mounted, live mode only, no mutation logic, and
  silent while the roster is on screen so there is never a second banner over the real
  thing) and exactly one that **answers** (the roster, which owns the verified sequence).
  Nine regression tests, including that a listener error still surfaces when the roster
  is visible — because a broken listener means the roster is showing nothing either.
- **The wizard printed a false claim about the feature it configures.** With the hours
  boxes blank it read *"Hours are not being counted … AURA will not apply the 42h week
  unless you type it."* That is false: the engine applies its defaults regardless.
  Measured — one person, ten 8h tasks in a day, no rules at all: nine unfilled slots
  reasoning *"over their 8.4h daily limit"*. Both branches now say hours **are** counted
  and differ only in whose limits apply. There is no way to switch hours off, and the
  screen that configures them no longer implies there is.

### Notes

- **Additivity re-checked directly**, because the hours defaults raised a fair doubt: a
  config naming no hours at all produces byte-identical output against the v1.8.1 engine.
  The reason is worth recording — the pre-existing **duty** cap (2/day) binds before the
  hours cap, since two default 4h sessions is 8h against an 8.4h ceiling. Hours become
  the binding constraint only if a task is longer than ~4.2h or the duty cap is raised.
- **Still unreachable from any surface** (audit-enumerated, honestly listed rather than
  implied fixed): `continuity`, `recurrence`, `forbidPairs`, `maxConsecutiveDays`,
  `maxConcurrentPerDay`, `staff.maxPerDay`, `task.category`. Cohort windows and quotas do
  not exist in the engine yet — they are the two genuinely missing primitives.
- **`npm run lint` still exits 2.** No ESLint config has ever existed in this repo, so the
  `--max-warnings 0` gate has never run. A trial run reports 362 problems, almost all
  `process is not defined` in test files (an environment misconfiguration, not defects).
  Open as P0.7.
- Live-mode generation remains the original V1 engine, byte-identical.

1213 tests (was 1053). Independent audits: `ROSTER_QC_AUDIT_FOUNDATIONS.md`,
`ROSTER_QC_AUDIT_SURFACES.md`.

## [1.9.0] - 2026-08-09

Engine capability for the remaining two interviewed teams, plus the band ruler. **Read
the reachability note below before assuming any of this is usable from the app yet.**

### Added

- **Hours model.** Per-task `hours` (default **4** — the teams' duties are sessions, not
  days), per-staff/rules `weeklyHours` (default 42) and `maxHoursPerDay` (default 8.4).
  Same-day durations **sum** against a per-person daily cap scaled by FTE, and a weekly
  cap per ISO week — both **hard**, so a breach is an `unfilled` slot naming the hours,
  never a quiet overload. A rolling four-week total is reported and warned on (the
  Singapore Medical Council 320h pattern from the field research; enforcing the rolling
  window is deferred). `load` gains `hours`, `hoursPerWeek`, `weeklyCap`;
  `auditHardConstraints` catches an hours breach on read-back. 89 tests.
- **Multi-slot shifts.** A task can declare `slots: [{ band, requiresSkill, role }, …]` —
  one entry per person, each with its own gate — which is how the embryologists actually
  staff weekend service (principal + senior + junior *together*). The **highest-graded
  assignee becomes the accountable `lead`**, `coLead` is the second, and `assignees`
  carries everybody lead-first, so the calendar, the swap flow and the exports keep
  working unchanged. 89 tests.
- **Multi-assignee exports.** CSV gains a seventh `Assignees` column (the first six are
  byte-identical to before); ICS `SUMMARY` keeps its exact one- and two-person form and
  gains `Lead: A, Co: B, Also: C` at three or more. Closes the documented limit that a
  third assignee vanished silently from both files.
- **The band boundary editor is now a ruler.** Two draggable dividers over AH7–AH17,
  fully keyboard-operable (`role="slider"`, arrows, Home/End) with the numeric ranges
  rendered as text alongside. A gap, an overlap, an inverted band and an empty box are no
  longer *expressible* — the dividers constrain each other — so the class of error the old
  six number boxes validated after the fact cannot occur. The validation call is kept as a
  backstop.
- **`firestore.rules` — a complete proposal, deliberately INERT.** The repo has never had
  a rules file. This one is derived from an actual sweep of every Firestore path the code
  touches, with a runbook (`firestore.rules.README.md`) covering Rules Playground cases,
  deploy, and immediate rollback. It is **not** referenced from `firebase.json` and the
  deploy workflow is untouched, so nothing changes until a human wires it up. It also
  documents which current behaviours it would break — chiefly that any of the ten
  directory members can rewrite the master roster today (`RosterView.jsx:813`), which the
  proposal restricts to admins.

### Notes — reachability, stated plainly

**The hours model and multi-slot shifts are not reachable from any surface of the app.**
`generateRosterV2` has one non-test caller — the *sandbox* branch — and the sandbox mapper
emits no `hours`, `weeklyHours`, `maxHoursPerDay` or `slots` field. That is 1,722 engine
lines and 178 tests of capability that no user can currently invoke. It was found by an
independent audit, not by the agents that built it, and the wiring is the next task.
Logged here rather than quietly deferred, because a changelog that implies otherwise is
the failure mode this project keeps a post-mortem about.

Live-mode generation is still the original V1 engine, whose output remains byte-identical
(verified 36/36 comparisons by the auditor, independently of the build agents' claims).

1053 tests (was 835). Independent audit: `ROSTER_QC_AUDIT_FOUNDATIONS.md`.

## [1.8.1] - 2026-08-08

### Fixed

- **The app header rendered on top of the open Configuration Wizard** (user
  screenshot). Mechanism, not symptom: `RosterView`'s root carries `relative z-10`,
  which caps every descendant — so the wizard's `z-[100]`, the swap modal's
  `z-[120]` and the confirmation dialog could never out-stack the header's sibling
  `z-50` context, no matter the number. Latent since the modals were written; it
  became visible only when the v1.8.0 wizard grew tall enough to extend under the
  header. All three overlays now render through a **React portal** to
  `document.body`, escaping the trapped stacking context. Three structural
  regression tests pin the portal (direct child of `body`, absent from the card's
  own tree, no orphans on unmount) — jsdom cannot see painting, so the structure is
  what gets tested.

835 tests.

## [1.8.0] - 2026-08-08

The roster master release: job grades, band-gated tasks, monthly clinics and
continuity of care — built from field interviews with four allied-health teams
(medical lab scientists, embryologists, psychologists, physiotherapists). All of it
is Sandbox-first; the live-mode wizard is untouched.

### Added

- **Job-grade bands in the engine (AH7–AH17).** Per-staff `grade`, per-task
  `leadBands` (junior / senior / principal), and editable band boundaries defaulting
  to Junior AH7–12 / Senior AH13–14 / Principal AH15–17. Decided semantics: bands are
  **eligibility, not exclusion-with-fallback** (a juniors-only task reports an
  unfilled slot rather than drafting a senior); the gate applies to the **lead only**,
  so senior-leads/junior-shadows is expressible; a person with no recorded grade
  fails every band gate and is named in a warning — the engine does not invent data.
  Slot scarcity ordering counts the band gate, and a new hard-audit rule catches an
  out-of-band lead on read-back. 149 tests, mutation-checked.
- **Monthly recurrence.** A task can run on the nth (or last) named weekday of each
  month — `recurrence: { ordinal: 3, weekday: 3 }` is the psychologists' 3rd-Wednesday
  specialised clinic. `'last'` and `4` differ exactly in five-week months, and that
  difference is pinned by test.
- **Continuity of care.** `continuity: true` prefers the incumbent lead across a
  task's occurrences — ahead of fairness, never ahead of a hard constraint. Every
  break is counted (`score.breakdown.continuityBreaks`) and **named in a warning**
  with the dates and, where knowable, why the incumbent was unavailable — because
  knowing continuity broke is the clinical point of the rule. Continuity tasks are
  exempt from the task-repetition penalty, which otherwise charges the roster for
  doing as it was told. 133 tests, mutation-checked (16 mutations; one survivor
  proven equivalent, one exposed and fixed a duplicate definition of "did continuity
  hold").
- **The grade-aware sandbox wizard.** The demo Configure dialog's two free-text boxes
  are now structured tables: staff (Name / Grade / FTE / Away, five rows default,
  add/remove) and tasks (name, who-may-lead band chips with the **implied grade range
  rendered live**, a 7-day strip, co-lead toggle), plus a band-boundary editor that
  revalidates on every change. Generate is disabled with the engine's verbatim reason
  while the configuration is invalid — the engine's own validation runs *before* the
  click. The example department is regraded across all three bands and band-gates two
  tasks, still yielding exactly one deliberately unstaffable slot. One line of copy
  carries the top surprise from the limits ledger: *"Ticking two bands makes both
  equally eligible — it is not a preference order."*
- **A composed validation refusal.** A task whose `requiresSkill` and `leadBands`
  pools do not intersect (enough principals, enough skill-holders, nobody who is
  both) is now refused at configure time with both constraints named — previously it
  generated an all-unfilled roster with only a warning.

### Changed

- `SOFT_PENALTY_WEIGHTS` gains `continuityBreaks: 2` (uncalibrated, like the other
  four — the number to read is the plain count in `score.breakdown`). A transitional
  `ALL_SOFT_PENALTY_WEIGHTS` overlay existed for one commit and is gone.
- `softPenalty` is now additionally **not comparable across the `continuity` flag**
  on otherwise-identical configs (the exemption changes what is counted). It was
  already documented as non-comparable across differently-shaped teams.

### Notes — the honest limits that matter most

- **Continuity cannot see across generation runs.** A department generating
  month-by-month can get a different incumbent most months, with zero warnings —
  measured, not guessed. Border data between runs is the standing deferred item.
- **`continuity: true` on a weekly task means one person, every day, all year** —
  measured: 260 of 260 duties to one name, reported as flawless. Use it for monthly
  clinics, not daily duties, until a ceiling exists.
- A part-timer can become the permanent incumbent (first occurrence goes by
  FTE-weighted fairness, which favours low-FTE staff early).
- The wizard's tables scroll horizontally on narrow screens and **nobody has seen
  them rendered** — layout verification needs a human with a browser.
- Engine capabilities still pending from the field interviews, in the user's chosen
  order: true per-task hour durations (42-hour weeks), multi-slot shifts
  (embryology's principal+senior+junior trios), pinned self-scheduling, minimum
  Saturday floors (lab scientists).

832 tests (was 499 at v1.7.1). Live mode still writes with the original engine,
whose output is unchanged — verified byte-identical across 77 comparisons.

## [1.7.1] - 2026-08-06

Every item is a fix. Live-mode generation now lands on the weekdays it claims, the
exports are standards-compliant, and no native browser dialog remains in the roster view.

### Fixed

- **B1 (High) — Sunday-start weekday misalignment.** `generateRoster` commented its core
  loop "Mon–Fri" but filled whatever five days followed the start date; the shipped
  default `2026-02-01` is a Sunday, so every default generation produced Sun–Thu with the
  "Tuesday" VC on Monday and the "Saturday" VC on Friday. The engine now **snaps the start
  date to the Monday of its week** (matching `rosterEngineV2`) and parses/derives all dates
  **locally**, which also fixes audit **M2**: the old UTC-parse/local-arithmetic mix slid
  every key one day early across a DST spring-forward (measured, `TZ=America/New_York`,
  start `2026-03-02`). Verified identical output across six timezones, and **byte-identical
  output for a Monday start** against the pre-change engine — nothing stored in
  `system_data/roster_2026` goes stale. The two `CURRENT BUG:` characterization tests
  planted in v1.6.0 were inverted, exactly as their comments instructed.
- **B3/B4 — the calendar opened on a hardcoded February 2026** and month navigation
  mutated state in place. It now opens on the current month, with non-mutating navigation.
- **M6 (High) — the ICS export was malformed.** `SUMMARY` contained an unescaped comma
  (RFC 5545 reads that as a multi-valued property — the likely cause if Outlook truncated
  titles at "Lead: X"), and events carried no `UID` or `DTSTAMP` (both required; without
  `UID` every re-import duplicates all events). Now: full TEXT escaping, deterministic
  content-derived `UID`s (a re-export of the same roster updates rather than duplicates),
  `DTSTAMP`, and 75-octet line folding.
- **M10 — CSV injection and quoting.** Fields containing commas, quotes or newlines are
  quoted per RFC 4180; fields starting with `=`, `+`, `-` or `@` are neutralised (the file
  is explicitly designed to be opened in Excel); rows are CRLF-joined and the file opens
  with a UTF-8 BOM so Excel on Windows decodes non-ASCII staff names.
- **M7 (residue) — no more `undefined` in exports.** A shift lacking `coLead` or `week`
  (legacy shapes, the deliberately-unstaffed demo slot) renders as empty in both formats.
- **E2 — all 8 native `alert()` dialogs in the roster view replaced** with branded,
  dismissible status banners that mount inside whichever modal is open (an error raised in
  the swap modal appears in the swap modal, not hidden behind it). Three messages were also
  corrected, not just restyled: the success message no longer claims "conflict-free" (the
  generator cannot know that — post-mortem E1), and the sandbox no longer claims AURA
  "notified" a colleague when nothing was sent. The v1.5 release note's claim is now true
  for the roster view; `window.confirm` remains in AuraPulseBot and AdminPanel.
- **M12 (partial) — duplicate swap requests.** Submitting the same request twice
  (same shift, same task, same target) is now blocked for the session, so a double-click no
  longer creates two independently-acceptable PENDING documents. Client-side only — it does
  not survive a reload or a second device; the real guard is a Firestore rule, blocked on
  decision **Q6** *(renamed from `D6` on 2026-08-14; `D6` now means only the ESLint defect)*.

### Notes

- 499 tests, up from 434. The exporters were refactored into pure `buildICS`/`buildCSV`
  (new exports) with the download wrappers unchanged.
- **UID caveat:** UIDs are content-derived (date + task). Renaming a task changes its UID,
  so a re-import after a rename leaves an orphan of the old event. A stable per-shift id
  would need to be persisted at generation time — future work.

## [1.7.0] - 2026-08-06

A constraint-aware rostering engine, available in Sandbox mode. **Live mode is unchanged** and
still uses the original `generateRoster`, whose output was verified byte-identical across 720
configurations — no existing roster can be affected by this release.

### Added

- **`src/utils/rosterEngineV2.js` — a constraint-aware roster engine.** The original engine is a
  cyclic rotation for a team where staff count happens to equal task count. Measured at other
  sizes it fails two ways, and both are now fixed:

  | staff / tasks | Old: max duties one person holds in a day | Old: never rostered | New: max/day | New: never rostered | New: unfilled, each with a reason |
  |---|---|---|---|---|---|
  | 4 / 4 | 3 | 0 of 4 | 2 | 0 of 4 | 0 |
  | 12 / 8 | 3 | 0 of 12 | 2 | 0 of 12 | 0 |
  | 6 / 10 | **5** | 0 of 6 | **2** | 0 of 6 | **160** |
  | 20 / 4 | 3 | **12 of 20** | 1 | **0 of 20** | 0 |

  Reproduce with `node scripts/roster-scaling.mjs`. The old engine reached five concurrent duties
  by wrapping the task index back around the staff list, and said nothing; and left 12 of 20
  people entirely unrostered because the rotation never passed the end of the task list.

  Inputs it accepts — per staff member: `fte`, `skills`, `unavailable` dates, `maxPerDay`. Per
  task: `requiresSkill`, `days` of the week, `leads`, `coLeads`, `category`. Plus rules:
  `maxConcurrentPerDay`, `maxConsecutiveDays`, `forbidPairs`.

  Design properties: hard constraints are **never** violated — an unstaffable slot is reported in
  `unfilled` with the binding constraint named, never filled by an unqualified or over-committed
  person. Slots are filled most-constrained-first (minimum-remaining-values) so a scarce
  qualification is not spent on a slot anyone could have covered. Fairness is FTE-weighted, so a
  0.6 FTE colleague receives roughly 60% of a full-timer's load. Output is deterministic — no
  `Math.random`, no `Date.now` — so the same inputs always give the same roster. `hardViolations`
  is **measured** by re-auditing the finished roster, not asserted.
- **Sandbox mode now really generates a roster.** Previously, clicking Generate in Sandbox showed
  two `alert()` boxes on a timer — *"AURA is simulating roster conflict resolution…"* then
  *"Zero conflicts found in multiverse timeline"* — and computed nothing; the calendar kept showing
  13 hardcoded events from February 2026. It now runs the real engine, in component state only,
  and renders the result.
- **The Sandbox staff field is editable.** It was `readOnly` with a "Simulation Locked" caption, so
  a visitor could not enter their own team. Names and task names alone now produce a working
  roster; skills, FTE and leave are optional extras.
- **Sandbox result panel** showing the effective start date, per-person load with a `duties ÷ FTE`
  column, any warnings, and the `unfilled` list with each slot's reason.
- **`DEMO_EXAMPLE_DEPARTMENT`** in `src/data/mockData.js` — a 12-person, 8-task fictional
  department with three skills, one 0.6 FTE colleague and one person on leave, loadable from the
  wizard. It generates 40 shifts over 12 days with zero hard violations and **exactly one
  deliberately unstaffable slot**, so the honest-reporting behaviour is visible rather than
  described. Appended only; `MOCK_STAFF`, `MOCK_STAFF_NAMES`, `MOCK_ROSTER`, `MOCK_PULSE_TRENDS`
  and `MOCK_TEAM_DATA` are untouched.

### Fixed

- **Sandbox CSV and ICS exports were incomplete.** The demo data set only four fields, so `Week`
  and `Co-Lead` came out as `undefined` on every row. A generated Sandbox roster now exports
  complete data (partial fix for audit **M7**; the demo path is fixed, the `MOCK_ROSTER` fallback
  path is not).

### Notes

- **Demo mode still writes nothing to Firestore, and this is now enforced three ways** — the early
  return in `handleGenerateClick`, a guard at the top of `executeRosterGeneration` (a no-op in live
  mode), and a component test asserting `setDoc`, `addDoc`, `onSnapshot`, `doc` and `collection`
  are never called on the demo path.
- 434 tests, up from 254. Includes `RosterView.demo.test.jsx`, the project's first component test.
- **`softPenalty` is deliberately not displayed.** It is unnormalised and not comparable between
  differently-shaped configurations, so showing it would mislead.
- **Known rough edge:** one CSV cell reads `undefined` for the deliberately unstaffed co-lead in
  the example department, because the shift genuinely has no `coLead` key and the exporter
  interpolates it directly. Cosmetic, and confined to that one unstaffable slot.
- The engine's 15 documented limits are in its file header. The ones that matter most: it is greedy
  rather than optimal and has no repair pass; `maxConsecutiveDays` cannot see across separate
  generation runs; a skill requirement gates the co-lead too, so "senior supervising a trainee" is
  not expressible; `forbidPairs` is same-task-only; and FTE sets relative share, not an absolute cap.
- Not wired into **live** mode. The Configure wizard has no fields for skills, FTE or leave in live
  mode yet, and multi-team support (per-team documents, a per-team login list) does not exist.

## [1.6.1] - 2026-08-06

The shift-swap flow — the "Auto-Healer" — now actually works. Every item here is a fix to
behaviour that already shipped, hence a patch rather than a feature release.

### Fixed

- **A1 (Critical) — accepting a shift swap did not change the roster.** The mutator compared
  `shift.staff` against `swapData.requestedBy`. Since the 6 May 2026 lead/co-lead refactor
  `staff` holds a *display string* (`"Lead: Brandon, Co: Ying Xian"`) while `requestedBy` is a
  bare name, so `.map()` matched nothing, `updateDoc` wrote byte-identical data, nothing threw,
  and AURA still reported *"I have updated the master roster."* The swap flow now:
  - records `swapRole` (`'lead' | 'coLead'`) at request time — the missing field that made the
    mutation impossible even in principle;
  - applies **mechanical substitution**: the covering colleague takes exactly the role the
    requester held. No promotion, and no third person's duty changes;
  - tolerates **both** shift shapes — modern (`lead`/`coLead`) and pre-refactor (`staff` as a
    bare identity), upgrading legacy shifts to the modern shape on write — so it is correct
    regardless of when the live document was last generated;
  - refuses rather than guesses when the requester no longer holds the recorded role.
- **A-RC4 (Critical) — success was printed, never observed.** The confirmation was a hardcoded
  literal emitted down every path, including silent no-ops. AURA now writes, **reads the
  document back, locates the substitution in it**, and only then reports — quoting the shift as
  it actually reads. A no-match is a visible failure that leaves the request `PENDING`.
- **M9 (High) — the ledger recorded approvals that never happened.** `status: 'APPROVED'` was
  written *before* the roster was even read, with no rollback. It is now written only after a
  verified roster write.
- **M5 (High) — the coverage alert never surfaced.** `App.jsx` never passed `onOpen`, so the
  force-open was a no-op; and `startSession`/`handleClearChat` discarded queued alerts by
  resetting `messages`. `onOpen` is now passed, pending alerts survive session resets, and they
  are de-duplicated by document id so a re-subscribe cannot stack duplicate Accept buttons.
- **M11 — admin-initiated swaps were structurally guaranteed to fail.** An admin who is not on
  the roster resolved to `swapRole: null`, so the request could never be applied. An admin
  acting on a shift they do not hold now arranges cover **on behalf of** the clinician who does:
  `requestedBy` is that clinician, `swapRole` their duty, and `initiatedBy` records who arranged
  it. The modal states plainly whose shift is being reassigned.
- **M8 (Medium) — Firestore listener failures were silent.** Both `onSnapshot` calls now have
  error callbacks; a `permission-denied` surfaces a readable message instead of the feature
  quietly ceasing to exist.
- **A4 — the swap-candidate filter used a substring test** (`staff.includes(name)`), which would
  silently drop any colleague whose name is a substring of another's. Now an identity comparison.
- **M4 (partial)** — removed the false claim that a declining colleague's requester "will be
  notified". No such mechanism exists; the copy now says to tell them directly.

### Notes

- `generateRoster` is untouched: verified byte-identical output against the previous release
  across three configurations, including a year-boundary run.
- Requester and roster-owner notification remain unbuilt (see Known issues).
- 254 tests (was 163). The 23 `generateRoster` characterization tests are unmodified.

## [1.6.0] - 2026-08-05

This release does two things: it establishes verification and version infrastructure
that did not previously exist, and it reconciles the app version with reality.
`package.json` had read `1.0.0` since the beginning while the README documented v1.5 as
the current beta; feature work through v1.5 plus the un-released work catalogued below
is now accounted for at `1.6.0`.

### Added

- **Test harness — the project's first working one.** `vitest` (`^2.1.9`) with
  `@testing-library/react` (`^16.3.2`), `@testing-library/jest-dom` (`^7.0.0`) and
  `jsdom` (`^29.1.1`); `vitest.config.js` configured to mirror the app's build pipeline
  (same `@vitejs/plugin-react`, `environment: 'jsdom'`, `globals: false` on purpose so
  new tests cannot silently depend on implicit globals); `npm test` → `vitest run` and
  `npm run test:watch` → `vitest`.
- **23 characterization tests for `generateRoster`** (`src/utils/auraEngine.test.js`).
  These pin down what the roster generator *currently does*, including the known-wrong
  behaviour, so that the Block A/B repairs can be made without silent regressions. They
  are a baseline, not a correctness proof.
- **`npm test` wired into CI.** `.github/workflows/deploy.yml` now runs the suite
  between dependency install and build, so a red suite blocks the Firebase Hosting
  deploy. Previously nothing verified a deploy.
- **Remediation documentation set:**
  - `ROSTER_POSTMORTEM.md` — the roster subsystem post-mortem, Blocks A–E, revision 2
    after independent audit.
  - `ROSTER_QC_AUDIT.md` — independent audit of that post-mortem; corrected one
    overstated and four wrong claims, and raised new critical findings (M1, M3) that
    the post-mortem had missed.
  - `ROSTER_TODO.md` — the sequenced remediation plan (P0–P8) with an evidence ledger.
  - `ROSTER_HANDOFF.md` — handoff state.
- **Two agent role definitions** under `.claude/agents/`: `version-steward.md` (release
  versioning, this file's owner) and `qc-steward.md` (independent verification of
  claims made in remediation documents).
- **`CHANGELOG.md`** — this file. The repository has never had one; Block E, root cause
  E-RC2, identified the absence of any release ritual as the reason version drift went
  unnoticed.
- **Roster lead/co-lead pairing.** `generateRoster` now emits one unified shift object
  per task carrying explicit `lead` and `coLead` fields, replacing the previous
  one-object-per-person model. VC (PM)/VC (AM) shifts are likewise a single paired
  object instead of two separate "VC Lead"/"VC Co-Lead" entries.
- **Custom generate-confirmation modal in the roster view.** The destructive
  4-week-roster generation now routes through the existing `ConfirmationModal`
  component instead of `window.confirm`, and the generation call is wrapped in
  `try/catch`. *(Note: this replaced the `window.confirm` only. Seven `alert()` calls
  remain in `RosterView.jsx` — see E2 in the post-mortem and plan P8.3.)*
- **National resource registry seed** — `scripts/firestore_seed.cjs`, 22 resources
  across 5 regions.
- **New AURA care-tier CTA `senior_isolated`** — routes 60+ users with a social-SDOH
  flag to tele-befriending and Active Ageing Centre resources ahead of the
  chronic-metabolic tier.
- **Dedicated Lead / Co-Lead columns in the CSV export**, replacing the single `Staff`
  column, for cleaner spreadsheet filtering.

### Changed

- **`@google/generative-ai` is now pinned** to `^0.24.1` (the version actually
  installed) instead of `"latest"`. An unpinned dependency lets a deploy change
  behaviour with no commit to attribute it to — flagged in Block E and now closed
  (plan P8.1). This pin is deliberately the installed version, so it changes no
  behaviour.
- **`package.json` `version`: `1.0.0` → `1.6.0`** (see *Notes on this bump* below).
- **README version metadata realigned** to `v1.6`: title line, *Supported Versions*
  table, and a Release History heading for this version. The AURA badge stays at
  **v2.3** — the engine tier did not move.
- Roster shift-ownership checks now recognise `lead`, `coLead` *and* the legacy `staff`
  field, so the new client can still read roster documents written by the old one.
- Swap-target dropdown now excludes everyone currently on the selected shift rather
  than only the single previous `staff` value.
- Export filenames changed to `AURA_Roster_Merged.ics` / `AURA_Roster_Merged.csv`.
- Substantial rewrites of `functions/index.js` and `src/components/ResultPage.jsx`
  during this window. **Not confidently classified** — the diffs are large, mixed
  feature/refactor changes with no commit-message intent, and they were outside the
  roster scope of this review. Assume nothing about them from this entry.

### Fixed

- **M1 (Critical) — demo configuration leaked into live mode and one click could replace
  the real duty roster with demo data.** The `RosterView` effect overwrote
  `config.staff`/`config.tasks` with the Marvel demo dataset in its `isDemo` branch, while
  its `else` branch restored only `rosterData`. Leaving demo mode with the component still
  mounted therefore kept the demo staff pool, and a single **Generate Roster** click
  replaced four clinicians' real duty roster with demo names — reporting *"AURA has
  generated a conflict-free roster."* `LIVE_ROSTER_DEFAULTS` / `restoreLiveRosterConfig`
  now restore the live pool on leaving demo mode, and seed the initial state from the same
  constant so the two cannot drift.
- **M3 (Critical) — clearing the "Weeks" field wiped the entire roster and reported
  success.** `parseInt("")` is `NaN`, so the generation loop never ran, `generateRoster`
  returned `{}`, and `setDoc` **without merge** committed that empty object over the whole
  document. Now guarded three ways: `validateRosterConfig` rejects the value and disables
  the button with a visible reason, `handleGenerateClick` refuses to open the confirmation
  as a second latch, and `prepareRosterWrite` refuses to write an empty roster from *any*
  cause.
- **Destructive whole-document write.** `setDoc` now passes `{ merge: true }`, so
  generating one period can no longer erase periods already stored in the document.
- **The confirmation modal was untruthful.** It claimed to overwrite "the currently
  displayed schedule" — false in both directions. It now names the actual date range and
  the staff pool that will be used, so a demo pool is visible *before* the click. The range
  is derived from the keys `generateRoster` really returns, so it reports a Sunday start as
  Sunday rather than implying the not-yet-landed weekday fix.
- **Import-case bug in `src/components/Aura.hooks.test.js`.** The file imported from
  `'./aura.hooks'` (lowercase) where the module is `Aura.hooks`. This resolves on
  case-insensitive macOS but fails on a case-sensitive CI filesystem — a latent CI
  break, fixed to `'./Aura.hooks'`.

### Removed

- **`src/components/Aura.utils.test.js`** — a byte-identical duplicate of
  `Aura.hooks.test.js` (both 12,323 bytes). It doubled every reported test count while
  covering nothing additional.

### Breaking

- **Firestore document shape changed at `system_data/roster_2026`.** The shift objects
  stored in that document changed from one-object-per-person to one-object-per-task:

  ```
  before:  { staff: "Brandon", task: "EFT", category: "CORE", week: 1 }
  after:   { task: "EFT", lead: "Brandon", coLead: "Ying Xian",
             staff: "Lead: Brandon, Co: Ying Xian", category: "CORE", week: 1 }
  ```

  `lead` and `coLead` are additive, but **the meaning of `staff` changed** — it was an
  identity, and is now a display string. A client that is already in a user's browser
  reads `shift.staff` and compares it to the signed-in user's name; against a
  newly-generated roster that comparison can no longer match, so shift-ownership
  detection — and therefore the swap flow — silently stops working for that client.
  NEXUS is a PWA, so **old clients persist in the service-worker cache** and this is a
  real user-visible regression, not a theoretical one.

  This change shipped un-versioned, before this changelog existed; it is recorded here
  rather than announced. It is also the direct cause of **M6** (the display string's
  comma is emitted unescaped into the ICS `SUMMARY`).

  Affected Firestore path: **`system_data/roster_2026`**.

### Notes on this bump

- **Bump kind: `minor` (1.0.0 → 1.6.0).** Reasoning: `package.json` `1.0.0` was stale
  bookkeeping, not a claim — it never tracked anything. The README's Release History is
  the de facto version record, and it documents v1.0 through v1.5 as shipped, so the
  effective pre-release baseline is **1.5.x**. The un-released work since that v1.5
  description is predominantly feature work (lead/co-lead pairing, resource registry,
  new CTA tier, confirmation modal) plus this release's test and documentation
  infrastructure — a `minor`. The README's own roadmap already named the next release
  v1.6.
- **A strict reading of the versioning rules argues for `2.0.0`**, because the
  `system_data/roster_2026` shape change above degrades an already-deployed client.
  That was **not** taken unilaterally: the change already shipped to production
  un-versioned, so a major bump today would be retroactive labelling rather than a
  release signal to anyone, and the call belongs to the project owner. If a major is
  preferred, this entry becomes `[2.0.0]` unchanged apart from the number.

---

## Reconstructed history

> **Provenance warning.** Everything below this line was transcribed from the
> *Release History* section of `README.md`. It was **not** derived from git history,
> **not** verified against the code, and there are **no tags** for any of these
> versions. Dates are unknown and are deliberately omitted rather than invented.
> `ROSTER_POSTMORTEM.md` Block E documents that at least one claim in this history is
> false (see the v1.5 note below), so read it as an assertion, not a record.

### [1.5.0] — reconstructed from README

- **NEXUS Feeds Integration:** the Digital Watercooler for PDPA-compliant clinical
  knowledge sharing and Community of Practice updates.
- **Immersive Lightbox UI:** distraction-free reading with nested real-time discussion
  threads.
- **Smart Routing Architecture:** URL-parameter detection for secure deep-linking and
  cross-platform post sharing.
- **Security Enhancements:** logout flush to kill lingering Firebase database
  connections; native browser alerts replaced with custom-branded confirmation modals.
  > **This last claim is false as written.** Post-mortem E2: `RosterView.jsx` still
  > contains seven `alert()` calls, including both the success and failure paths of
  > live roster generation and of swap submission. Plan P8.3 tracks the repair.

### [1.4.0] — reconstructed from README *(AURA engine v2.3)*

- **AURA Engine upgrade to v2.3:** from reactive conversational bot to proactive
  database-middleware agent.
- **Autonomous Roster Mediation:** AURA listens to Firebase collections via live
  snapshots and executes peer-to-peer shift-swap matrix rewrites.
  > Post-mortem Block A finds that this rewrite **never actually happens** — see **A1**
  > under *Known issues*.
- **Native File Export:** direct Microsoft Word document downloads from parsed text,
  working around mobile browser limitations.
- **Data Entry Payload Expansion:** LLM schema extended to extract operational
  parameters from natural language and generate database commit interfaces.
- **Technical Debt Resolution:** iOS Safari phantom-click UI bug resolved via dynamic
  z-index management; Sandbox Cloud Function schema-mismatch crashes patched.

### [1.0.0] – [1.3.0] — reconstructed from README *(Legacy IDC App; AURA v1.0–v2.2)*

- **Foundational Architecture:** core React + Firebase dual-environment infrastructure
  separating Live production data from the local Sandbox.
- **Wellbeing Analytics:** Pulse tracking system and the daily Social Battery heatmap.
- **Auto-Rostering Framework:** initial "zero-conflict" scheduling logic and unified
  calendar interfaces.
  > Post-mortem E1: "zero-conflict" truthfully means "cannot double-book by
  > construction" — a property of the cyclic rotation, not a safety guarantee. The
  > generator consumes no case volumes, skill-mix, leave or ward data.
- **Early AURA Integration:** baseline conversational agent focused on Motivational
  Interviewing (OARS) and basic administrative query routing.
