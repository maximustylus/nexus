# Ids — what every prefix in this document set means

One page, because reconstructing this from three files is what prompted it.

> **The question this answers.** The prefixes do **not** encode *to-do / protocol /
> decision*. They encode two different things at once, inconsistently, for historical
> reasons: mostly **where an id came from** — which document, or which surface of the
> product — and only sometimes **what kind of thing it is**.
>
> That inconsistency is not worth a renumber. Ids are cited in released CHANGELOG
> entries and in commit messages that cannot be edited, and the worst defect in this
> document set was caused by an id quietly coming to mean something else. So the
> scheme is written down rather than tidied up.

---

## The three kinds of thing an id can be

| Kind | What it means | Who closes it |
|---|---|---|
| **Defect** | something is wrong and I should fix it | me |
| **Decision** | a choice that is not mine to make — clinical wording, disclosure thresholds, what a question asks | Alif |
| **Plan phase** | a section of work, not an item. Sub-items hang off it (`P9.1`) | — |

---

## Every prefix in use

| Prefix | Kind | Means | Lives in |
|---|---|---|---|
| **`P`**n | plan phase | A **phase** of work, **scoped to its own file** — see the warning below. **Not "protocol".** | `ROSTER_TODO.md`, `COMMUNITY_TODO.md`, `AURA-TODO.md` |
| **`Q`**n | decision | A **question for the owner**. Renamed from the old `D`n-for-decisions precisely to end the collision below. The series runs `Q1`–`Q8` and `Q10`–`Q13` — **there is no `Q9`** | `ROSTER_HANDOFF.md` §5 |
| **`A`**–**`E`**n | defect | A defect inside a post-mortem **block**: **A** schema split-brain · **B** time and dates · **C** persistence and configuration · **D** verification infrastructure · **E** documentation | `ROSTER_POSTMORTEM.md` |
| **`A-RC`**n | *neither* | A **root cause** of Block A — an explanation, not a work item | `ROSTER_POSTMORTEM.md` |
| **`M`**n | defect | A defect the post-mortem **missed**, found by the independent QC audit | `ROSTER_QC_AUDIT.md` |
| **`CP`**n | defect | **C**ommunity **P**ortal defect. Numbers track the community post-mortem's `§3.x` one-for-one, so `CP9` is `§3.9` | `COMMUNITY_TODO.md` |
| **`CD`**n | decision | **C**ommunity **D**ecision — the owner's | `COMMUNITY_TODO.md` |
| **`T`**n | defect | Multi-**T**eam rebuild defect, opened by the pre-merge stress test | `ROSTER_TODO.md` §P9 |
| **`AN`**n | defect | **AN**alytics defect — the derived-insight layer: the year-end analysis, the population rollup, the coverage watcher, the nudge, the PDPA guard. Opened 2026-08-23 | `AURA-POSTMORTEM.md` |
| **`AC`**n | defect | **A**URA **C**hat defect — the public conversational screening (`AuraChat.jsx`) and the parser behind it. Opened 2026-08-23. Distinct from `CP`n, which covers the portal around it; `AC` is the chat component itself | `AURA-POSTMORTEM.md` |
| **`AU`**n | defect | **AU**RA defect — the AI surfaces and what they are trusted to write. Opened 2026-08-23. **`AU`, not `AI`**: `A` already means three things in this set and a fourth reading of the same letter is exactly the failure the rules below exist to prevent | `AURA-POSTMORTEM.md` |

---

## ⚠️ `P`n is FILE-SCOPED, and `P7` now means three different things

`P` numbers phases, and each ledger numbers its own from zero. That was already true of two
files; a third opened on 2026-08-23. **Always check which file a `P`n came from before acting
on it.**

| File | Range | `P7` there means |
|---|---|---|
| [`ROSTER_TODO.md`](ROSTER_TODO.md) | `P0`–`P9` | *Persistence, config source, security rules* — Block C |
| [`COMMUNITY_TODO.md`](COMMUNITY_TODO.md) | `P0`–`P7` | *Found by the pre-merge stress test* — `CP22`–`CP26` |
| [`AURA-TODO.md`](AURA-TODO.md) | `P0`–`P7` | *The prompts themselves* — `AU7` `AU19` `AU20` `AU28` `AN5` `AN7` `AN12` `AU8` |

⚠️ **The `AURA-TODO.md` series was opened without a row here, which rule 2 below requires in
the same commit.** Recorded on 2026-08-23 after somebody asked *"what's P7?"* and the answer
turned out to be three answers. Writing it down is the whole of the fix — the numbers stay,
because renumbering is what rule 1 forbids — but it is the second time this document set has
grown an ambiguous prefix, and the first one (`D`) is the reason this file exists.

The unambiguous way to cite one is **file-first**: *"`AURA-TODO.md` P7"*, never a bare `P7`.

---

## ⚠️ `D` means three different things, and always will

This is the one genuine ambiguity, and `ROSTER_TODO.md` carries its own banner about
it. Repeated here because that banner is 200 lines into a file nobody reads top to
bottom:

| As written | Means | What happened to it |
|---|---|---|
| "Awaiting decisions **D1–D3**", "deferred to **D3**" | a **decision for the owner** | **renamed `Q`n**, same numbers |
| "post-mortem **D3**" | a **defect** in Block D | unchanged — released CHANGELOG entries cite it |
| "Block **D1**" (a heading) | a **work-block label**, not an id at all | unchanged |

So `D3` appears in one file meaning *a decision* in one place and *a defect* in
another. When you meet a bare `D`n, check which document it came from before acting
on it.

---

## ⚠️ `AU`, `AC` and `AN` were merged, and NOT renumbered

The three AURA post-mortems written on 2026-08-23 — `POSTMORTEM-AURA.md`,
`POSTMORTEM-AURA-CHAT.md` and `POSTMORTEM-AURA-INTELLIGENCE.md` — are now one document,
[`AURA-POSTMORTEM.md`](AURA-POSTMORTEM.md). **Every id survived the merge unchanged.**
`AU2` means today exactly what it meant when it was written, and the three series stay
distinct because they name three different surfaces:

| Series | Surface |
|---|---|
| `AU`n | the staff assistant and the AI plumbing |
| `AC`n | the public screening chat |
| `AN`n | the intelligence layer — analysis, rollup, nudge, PDPA guard |

⚠️ **The roster engine was deliberately NOT merged in.** `ROSTER_POSTMORTEM.md`'s `A`–`E`,
`A-RC` and `M` ids are cited **by number in released CHANGELOG entries** — *"post-mortem
D3"*, *"audit M6"*, *"A-RC1"* — so absorbing that corpus would mean renumbering it, which
is what rule 1 below forbids. `AURA-POSTMORTEM.md` §7 is the bridge instead.

---

## The two rules that are applied consistently

**1. A number is never reused.** Not across a renumber, not after an item closes.
`CP9` will mean `§3.9` for as long as the file exists. The alternative is the `D`
problem above, and one instance of it in a document set is enough.

**2. A new series gets a new letter, and says so on the day it opens.** `CP`/`CD`
were chosen as *"deliberately distinct from the roster's `D`n / `Q`n so a reference is
never ambiguous across files"*. `T` was chosen because `D` was taken three times over.
If you open a series, add a row to the table above in the same commit.

---

## Reading an id you have never seen

1. **What letter?** Look it up above. If it is `D`, work out which of the three senses
   from the document it appears in.
2. **Defect or decision?** Defects are mine and have evidence attached — a
   `file:line`, a measurement, a failing test. Decisions are yours and are marked
   `OWNER`; they are never blocked on engineering time.
3. **Is it closed?** The ledgers are the record of what was decided; the **live**
   status is the `### Known issues` table in [CHANGELOG.md](CHANGELOG.md) for the
   roster, and the Status table in [COMMUNITY_TODO.md](COMMUNITY_TODO.md) for the
   public portal.
