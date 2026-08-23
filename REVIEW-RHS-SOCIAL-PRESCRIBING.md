# NEXUS (Individuals) — review from a Regional Health System

**Reviewer's framing:** written in the voice of an RHS lead whose portfolio is weighted
toward social prescribing, as requested. Everything under *"What I found"* is grounded
in the actual code and is reproducible; the opinions are opinions.

---

## Headline

You have built a good **screening instrument**. You have not yet built a **social
prescribing platform**, and the gap between those two things is not features — it is one
architectural decision you have already made, possibly without meaning to.

I would pilot this. I would not pilot it as it stands.

---

## What works, and I want to be specific because most tools in this space do not

**You screen the social, not just the physical.** Almost every activity tool I am shown
is PAVS and a leaflet. You instrument financial strain, social connection, food
security, psychological distress and housing type, and you let those *outrank* activity
in the routing ladder. A person who is isolated and inactive is routed on the isolation.
That is the correct instinct and it is rare.

**The tiering is clinically ordered.** Symptoms → conditions → age → SDOH → activity. I
have seen national tools get this backwards.

**Free-first exists as a tier.** `FREE_FIRST` for someone who flagged cost is the single
most social-prescribing-literate thing in the product. You understood that a $48
programme is not a referral for someone who told you cost is their barrier.

**Four languages, including the resource copy.** Not a translation of the chrome with an
English body — the actual programme descriptions are in all four. That is real work.

**Two doors to the same assessment.** Chat for those who want to be walked through,
a form for those who want to get on with it, converging on one score. Good.

---

## What I found while using it

I ran both pathways several times and then read the code. Five things.

### 1. Your geographic data is not geographic ⚠️

This is the one that matters most to me, because geography is how I plan.

The **form** asks for the first two digits of the person's postal code. The **chat** does
not — it offers region chips, and the parser extracts the first two digits it finds in
the label:

```
"North (e.g. 73, 75)"      → recorded as sector 73
"East (e.g. 46, 52)"       → recorded as sector 46
"West (e.g. 60, 64)"       → recorded as sector 60
"North-East (e.g. 53, 82)" → recorded as sector 53
```

Every chat respondent in the north is stored as sector 73. Not their sector — the
*example's*. So the postal data you are collecting "for population-level resource
planning" is, from the chat pathway, four constants. It also decides which RHS the person
is shown, so my region's resources appear or do not appear based on which example number
happened to be printed on a chip.

The two pathways are therefore not comparable, and the chat pathway cannot support
planning at all.

### 2. Your evidence grounding claims more instrument than you administer

Page 2 of the PDF cites the **Lubben Social Network Scale (LSNS-6)** and a **PHQ-2
aligned** wellbeing domain. LSNS-6 is six items; PHQ-2 is two. You ask **one** question
each.

I am not objecting to a one-item screen — brevity is a virtue here and I would rather
have one honest question than six abandoned ones. I am objecting to citing a validated
multi-item instrument beside a single item, in a document handed to the public with an
alpha coefficient attached. If my research office reviewed this for a pilot, that page
would stop it.

Either administer the instrument or cite it as *"adapted from"* and say how.

### 3. The wellbeing question conflates two different referrals

> *"Overwhelmed — caregiving or financial pressure"*

Caregiver strain and financial strain lead to completely different places in my system.
Merging them into one chip means the highest-value entry point in social prescribing —
the unpaid family carer who has not yet identified as one — is invisible to you.

### 4. For the 60+ cohort you are screening the wrong thing

PAVS is an activity screen. For an older adult being considered for an Active Ageing
Centre, what I need is falls history, functional mobility and frailty. You can route a
75-year-old to "150 minutes a week" without ever asking whether they have fallen in the
past year.

### 5. The urgent tier hands off to nobody

Chest pain on exertion produces *"see your GP or visit a polyclinic."* That is correct
advice and it is where the product stops. No booking, no warm handover, no way for
anyone to know it was said.

---

## The architectural fork — and this is the real review

**Social prescribing is a referral with a human on the other end.** The defining
mechanic is not the assessment; it is the link worker who receives it and walks
alongside the person. Everything else is a leaflet with better arithmetic.

Your product currently ends at *"download the Healthy 365 app"* or *"visit your nearest
AAC."* Nobody at that AAC knows the person is coming. Nobody follows up when they do not
go. And structurally, **nobody can** — because you have chosen de-identification.

That choice is defensible and you have made it consistently. But it means:

- you can never make a referral, only a recommendation;
- you can never close a loop, so you cannot report uptake;
- you cannot re-contact anyone, so `previousId` depends on a member of the public
  keeping a nine-character code and typing it in months later.

You cannot have anonymity and social prescribing. **Pick.** My advice, unsurprisingly:
offer both, and let the person choose at the point of consent — *"keep this anonymous"*
or *"connect me to someone."* The second path is the one my system can fund.

---

## Enhanced features I would want, in the order I would want them

| | Feature | Why it is on this list |
|---|---|---|
| **1** | **Consent-to-refer, with an identified path** | Without it, everything below is impossible. A screen at the end: *keep it anonymous*, or *have someone contact me*. |
| **2** | **Assisted / proxy mode** | The people who most need social prescribing complete self-service web forms least. Give an AAC staff member or an SGO ambassador a mode to complete it *with* someone, marked as proxy-completed so the data stays honest. |
| **3** | **Partner-facing queue** | An AAC or a link worker logs in and sees who was routed to them, with the SDOH flags and nothing more. This is the single feature that turns your tool into a service. |
| **4** | **Closed-loop status** | Referred → contacted → attended → declined. Uptake rate is the number I am asked for, and no screening tool I am offered can produce it. |
| **5** | **Population dashboard by sector** | You are already collecting the data and reading none of it. Unmet need by sector, by domain, over time — that is what justifies my budget line. Fix finding 1 first or it is noise. |
| **6** | **Caregiver strain as its own domain** | Split it out of the wellbeing chip. Two questions. |
| **7** | **Frailty and falls for 60+** | A conditional branch: one falls question, one functional question. Gates the AAC and rehab routes properly. |
| **8** | **Healthier SG enrolment as a field** | You reference Healthier SG throughout but cannot tell whether the person is enrolled — which changes every recommendation you make. |
| **9** | **Re-assessment cadence** | A prompt at 3 or 6 months. Requires (1). |
| **10** | **Print-and-hand-over output** | Not everyone leaves with a phone. A one-page printable referral slip an AAC will accept. |

---

## What I would need before piloting

1. Finding 1 fixed, and the two pathways producing comparable geography.
2. The evidence page corrected to describe what is actually administered.
3. A consent model that lets a person opt into being contacted.
4. A named partner willing to receive referrals, and a way for them to receive them.
5. Your own data-retention position in writing — how long assessments are kept, and who
   may read them.

Items 1 and 2 are yours to fix. Items 3 to 5 are decisions, not code, and they are the
ones I would want to sit down about.

---

## Closing

The instinct behind this is right, and the parts that are hard to get right — the
tiering, the SDOH weighting, the free-first tier, the four languages — you have got
right. What is missing is the half that makes it a service rather than an assessment,
and that half starts with a consent screen and a person on the other end.

Build that, and I am interested.
