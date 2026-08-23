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
| **`P`**n | plan phase | A **phase** of work. `P0`–`P8` were the roster remediation; `P9` is the multi-team stress findings; the community ledger has its own `P0`–`P7`. **Not "protocol".** | `ROSTER_TODO.md`, `COMMUNITY_TODO.md` |
| **`Q`**n | decision | A **question for the owner**. Renamed from the old `D`n-for-decisions precisely to end the collision below. The series runs `Q1`–`Q8` and `Q10`–`Q13` — **there is no `Q9`** | `ROSTER_HANDOFF.md` §5 |
| **`A`**–**`E`**n | defect | A defect inside a post-mortem **block**: **A** schema split-brain · **B** time and dates · **C** persistence and configuration · **D** verification infrastructure · **E** documentation | `ROSTER_POSTMORTEM.md` |
| **`A-RC`**n | *neither* | A **root cause** of Block A — an explanation, not a work item | `ROSTER_POSTMORTEM.md` |
| **`M`**n | defect | A defect the post-mortem **missed**, found by the independent QC audit | `ROSTER_QC_AUDIT.md` |
| **`CP`**n | defect | **C**ommunity **P**ortal defect. Numbers track the community post-mortem's `§3.x` one-for-one, so `CP9` is `§3.9` | `COMMUNITY_TODO.md` |
| **`CD`**n | decision | **C**ommunity **D**ecision — the owner's | `COMMUNITY_TODO.md` |
| **`T`**n | defect | Multi-**T**eam rebuild defect, opened by the pre-merge stress test | `ROSTER_TODO.md` §P9 |
| **`AU`**n | defect | **AU**RA defect — the AI surfaces and what they are trusted to write. Opened 2026-08-23. **`AU`, not `AI`**: `A` already means three things in this set and a fourth reading of the same letter is exactly the failure the rules below exist to prevent | `POSTMORTEM-AURA.md` |

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
