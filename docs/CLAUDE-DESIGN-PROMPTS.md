# Claude Design prompt pack — NEXUS walkthrough, restyled

Prompts to rebuild the 12-slide AHP walkthrough as a Claude Design canvas in the
owner's visual language: **pastel · minimalist · liquid glass · rounded · extruded
depth · soft drop shadows**, light mode.

**How to use**

1. Start a canvas (`/design` or the Design entry point) and paste **Prompt 0** first —
   it is the style system every artboard inherits. Attach the screenshots from
   `walkthrough-shots.zip` when a slide prompt calls for them.
2. Then paste the slide prompts one at a time (or in batches of 3–4). Each names its
   artboard, its screenshots, and its content verbatim.
3. Use the **iteration prompts** at the end to push any artboard further in one
   direction without re-describing everything.

---

## Prompt 0 — the style system (paste first)

```
You are designing a 12-artboard walkthrough deck. Before any artboard, lock in this
design system and apply it to every artboard that follows.

CANVAS
- Artboards 1920×1080, generous margins (min 80px), lots of air. Minimalist: every
  element earns its place; if it can be removed without losing meaning, remove it.

PALETTE — pastel, light mode only
- Page background: a very soft radial wash from lilac #F4F1FB through #FAF9FF to
  white, with one large, blurred pastel blob per artboard (lavender #DDD3F9 or mint
  #CFF3E4, 40% opacity, 200px blur) placed asymmetrically behind the content.
- Ink: soft slate #3B4256 for headings, #6B7280 for body. Never pure black.
- Accents, used sparingly (one per artboard): pastel violet #B9A7F2, pastel mint
  #9FE3C6, pastel sky #B7DBF7, pastel blush #F7C8D3. The violet is the brand lead;
  the others support.

LIQUID GLASS — the container language
- Cards are frosted glass: fill rgba(255,255,255,0.55), backdrop blur 24px,
  a 1px inner border of rgba(255,255,255,0.75), and a faint specular highlight —
  a soft white gradient streak across the top 20% of the card at ~35% opacity.
- Glass sits ON the pastel blobs, so the blur visibly bends colour behind it.

ROUNDED + EXTRUDED
- Corner radius 28px on cards, 20px on nested tiles, 999px on pills and chips.
- Depth is soft neumorphic extrusion, not hard lines: every card carries TWO
  shadows — a light lift top-left (rgba(255,255,255,0.9), -6px -6px 18px) and a
  soft drop bottom-right (rgba(109,94,190,0.16), 10px 14px 34px). Buttons and
  step badges get a slightly deeper version so they read as pressed-out of the page.
- Screenshots float in glass device frames: rounded 24px, the dual shadow, and a
  thin frosted bezel. Label each frame beneath in 11px letterspaced caps,
  #9AA1B4: DESKTOP or MOBILE.

TYPE
- One geometric sans throughout (Inter or similar). Artboard titles 56–64px
  semibold in #3B4256; section labels 13px caps letterspaced; body 20–22px,
  line-height 1.5. No italics except one closing aside. Never center body text.

MOTIFS
- Step numbers live in extruded glass coins: a 72px circle of frosted glass with
  the number in pastel violet, dual-shadowed so it pops off the page.
- "Worth knowing" tips sit in a full-width glass strip along the artboard's foot,
  with a small pastel violet dot before the label.
- No hard rules, no accent bars, no gradients on text, no dark backgrounds
  anywhere — the first and last artboards are the SAME light pastel language,
  differentiated by scale, not by darkness.

Acknowledge the system, then wait for the artboard prompts.
```

---

## The artboard prompts

> Text in quotes is content to place verbatim. Screenshot filenames refer to
> `walkthrough-shots.zip`.

### 1 · Title

```
Artboard 1, "Title". A hero artboard in the locked style. Left two-thirds: the
word "NEXUS" very large (140px+) in soft slate, above the line "Try the roster
for your team" in pastel violet, above two calm sentences: "A ten-minute,
hands-on walkthrough for Allied Health leads." and "Everything happens in a
sandbox — nothing you do is saved, and no sign-in is needed." Small footer:
"v2.1.0 · August 2026". Right third: 09-drafted-mobile.png floating in a glass
phone frame, tilted 3°, with the deepest extrusion on the page. One large mint
blob behind the phone, one lavender blob behind the title.
```

### 2 · What you are about to try

```
Artboard 2, "What you are about to try". Title, then one intro sentence:
"NEXUS builds a duty roster from the rules you give it — grades, hours
ceilings, duty needs — and shows the result as a calendar your team can read,
swap on, and export." Below: four glass stat tiles in a row, each with a big
pastel-violet figure and a small caption — "10 min / is all the tryout takes",
"0 saved / the sandbox stores nothing", "AH7–AH17 / the allied-health grade
scale is built in", "Yours to keep / register as a lead when it fits". Under
the tiles, a route pill-chain: eight rounded glass chips joined by soft arrows
reading: open the site → Demo → dashboard → Roster → Configure → your team →
your duties → Draft. Foot strip: "Every name you will see — Frodo, Samwise,
Steve — is fiction shipped with the sandbox."
```

### 3 · Step 1 — the Demo door

```
Artboard 3, "Open the site and pick the Demo door", step coin "1".
Left: 02-demo-tab-desktop.png in a glass laptop frame. Centre:
02-demo-tab-mobile.png in a glass phone frame. Right: three short bullets —
"Three doors on the front page: Individuals, Professionals, Demo." /
"Pick Demo, then INITIALISE DEMO." (bold) / "No account, no email, nothing
stored." Foot strip: "The moon icon toggles dark mode; this walkthrough stays
in light."
```

### 4 · Step 2 — guide and dashboard

```
Artboard 4, "The guide greets you; the dashboard is behind it", step coin "2".
Screenshots: 03-demo-guide-desktop.png (laptop frame) and 04-dashboard-mobile.png
(phone frame). Bullets: "A short tour opens first — Next through it, or close
it and explore." / "The dashboard shows a simulated team: capacity, check-ins,
a daily briefing." / "The green SANDBOX MODE ACTIVE banner stays on screen the
whole time." (bold). Foot strip: "The Guide tab reopens the tour any time."
```

### 5 · Step 3 — the roster calendar

```
Artboard 5, "Open Roster — the calendar your team would live in", step coin "3".
Screenshots: 05-roster-desktop.png and 05-roster-mobile.png. Bullets:
"Department shows everyone; My week shows one person." / "CSV and ICS export to
spreadsheet or calendar." / "Configure is where you describe YOUR service."
(bold) / "On the phone the calendar stacks vertically — rosters are read at the
bedside, not at a desk."
```

### 6 · Step 4 — pick a shape

```
Artboard 6, "Configure: pick a shape to start from", step coin "4".
Screenshots: 06-wizard-top-desktop.png and 06-wizard-top-mobile.png. Bullets:
"Choose your profession (optional)." / "Pick a starting shape: graded duty
split, specialist clinics, team rotation, weekend quotas — or start blank."
(bold) / "Set the start date and the weeks to plan." / "Each shape is a worked
example you edit, not a rule you inherit." Foot strip: "The grade-band slider
cuts AH7–AH17 into Non-exempt / Junior / Senior / Principal wherever YOUR
department draws those lines."
```

### 7 · Step 5 — your people

```
Artboard 7, "Your people: grades, availability, leave", step coin "5".
Screenshots: 07-wizard-team-desktop.png and 07-wizard-team-mobile.png. Bullets:
"One row per person: name, grade (AH7–AH17 or not recorded), FTE, leave dates."
/ "The template seeds ten fictional staff — rename, delete, add your own." /
"Grades stay private in the live app: only a lead sees them, and they never
appear on the roster." (bold)
```

### 8 · Step 6 — your duties

```
Artboard 8, "Your duties: who, when, and how senior", step coin "6".
Screenshots: 08-wizard-duties-desktop.png and 08-wizard-duties-mobile.png.
Bullets: "One row per duty: name it, tick its weekdays, set its headcount." /
"A minimum grade per duty — e.g. AH11 and above may lead." (bold) / "Hours
ceilings are enforced: a duty that would breach them is reported as unstaffed
with the hours named, never quietly assigned."
```

### 9 · Step 7 — draft and read

```
Artboard 9, "Draft roster — and read what came back", step coin "7".
Screenshots: 09-drafted-desktop.png and 09-drafted-mobile.png — give the
desktop calendar the widest frame on the canvas; this is the money shot.
Bullets: "One click drafts the whole period: every duty, every day, lead and
co named." / "The engine is deterministic — the same inputs always produce the
same roster. No AI decides who works." (bold) / "Check the weekends, the grade
gates, and runs of consecutive days." / "Not right? Adjust and draft again —
it costs nothing." Foot strip: "In the live app staff request swaps here and a
lead approves; the engine re-verifies the day before anything is written."
```

### 10 · Step 8 — AURA

```
Artboard 10, "Meet AURA — the assistant beside the roster", step coin "8".
Screenshots: 11-aura-desktop.png and 11-aura-mobile.png. Bullets: "AURA chats
about wellbeing, drafts documents, can log workload numbers." / "It proposes;
you click. AURA never writes anything without a confirmation card." (bold) /
"In the sandbox AURA answers locally — your typing goes nowhere." / "The
roster engine is separate: AURA explains it but does not decide it."
```

### 11 · Does it fit?

```
Artboard 11, "Does it fit your service? Judge it on these". No screenshots —
this is the one purely typographic artboard, so let the glass do the work:
a 2×2 grid of glass cards, each with a pastel-mint heading and two lines —
"Your duties / Can every duty you run be written as a row — days, headcount,
minimum grade?" · "Your people / Do grades, FTEs and leave cover how your team
really varies?" · "Your rules / Do the ceilings match your award and your
norms?" · "Your month / Read the drafted calendar as next month. Would you
publish it after your usual edits?" Below, one sentence: "If something cannot
be expressed, that is exactly the feedback we need — note the duty or rule
that did not fit and send it back with your profession attached."
```

### 12 · Closing — the real thing

```
Artboard 12, "Ready to try it with your real team?". Left:
01-professionals-desktop.png in a glass frame. Right: four numbered glass
coins (pastel mint) with one line each — "Register on the Professionals tab
and declare your team." / "The declaration is approved once, centrally — you
are then the team's lead." / "Invite your own staff; no administrator needed
after day one." / "Your team's data is scoped to your team. No other
department can read it." Foot strip, italic: "Sandbox first, always: the Demo
door stays open, and nothing you tried today touched live data."
```

---

## Iteration prompts (paste any, alone, after the canvas exists)

- **More liquid:** "Across all artboards, raise the glass: increase backdrop blur
  to 32px, drop card fills to rgba(255,255,255,0.45), and strengthen the specular
  streak so every card visibly refracts the pastel blobs behind it."
- **More extruded:** "Deepen the neumorphic pop on step coins and buttons only:
  widen both shadows ~40% and add a 1px inner top highlight. Cards stay as they are."
- **Softer:** "Shift the whole palette two steps paler — blobs to 25% opacity, ink
  to #4A5268, accents desaturated 20%. Nothing should reach full saturation."
- **Tighter:** "Reduce each artboard to its three strongest elements. If a bullet
  restates the screenshot, cut it."
- **Warmer:** "Swap the sky accent for blush #F7C8D3 throughout, and warm the page
  wash toward #FBF7F4."
- **Screenshot emphasis:** "On artboards 3–10, enlarge the desktop frame 15% and
  let it overlap the artboard edge on the left, cropped clean, so the UI feels
  life-size."
- **Per-element:** "On artboard <N>, <the one change> — leave everything else."

---

*Screenshots: `walkthrough-shots.zip` (22 PNGs, light mode, 2× resolution,
captured 2026-08-24 from the v2.1.0 build on branch `aura`). Content text mirrors
`docs/NEXUS-roster-walkthrough.pptx`; if the deck's wording changes, change it here too.*
