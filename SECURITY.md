# Security Policy

## Supported Versions

We take the security and data privacy of the NEXUS platform very seriously. Currently, only the following versions of NEXUS are actively supported with security patches and updates.

| Version | Support Status |
| ------- | -------------- |
| 2.7.x   | Supported (Active Beta — multi-team) |
| 2.6.x   | Supported (superseded — upgrade to 2.7.x) |
| 2.4.x   | Supported (superseded — upgrade to 2.5.x) |
| 2.3.x   | Supported (superseded — upgrade to 2.4.x) |
| 2.2.x   | Supported (superseded — upgrade to 2.3.x) |
| 2.1.x   | Supported (superseded — upgrade to 2.2.x) |
| 2.0.x   | Supported (superseded — upgrade to 2.2.x) |
| 1.18.x  | Supported (rollback target for the v2.0.0 migration) |
| < 1.18  | Unsupported |

> This table must match the *Supported Versions* table in [`README.md`](README.md); both are
> downstream of `package.json` `version`, which is the single authoritative copy. It had
> drifted eight minor versions behind (it still named 1.5.x as the Active Beta at v1.13.0) —
> the support boundary moves with each release and is not an independent policy.

## Reporting a Vulnerability

As of **v2.0.0** this application serves more than one department, so a vulnerability here may expose data belonging to a team other than the reporter's. Any potential security vulnerability must be reported and escalated immediately.

**The property to report against:** a member of one team must be able to read and write nothing belonging to another — not the roster, not swaps, not wellbeing records, not the member list, not even the team's name. If you can reach another department's data, that is the highest-severity report this project can receive.

Please do not report security vulnerabilities through public GitHub issues or public discussion boards.

If you discover a security vulnerability within NEXUS, please send a direct email to the Lead Developer, Muhammad Alif, at muhammad.alif@kkh.com.sg. 

All security reports will be treated with the highest priority. You can expect an acknowledgement of your report within 24 hours, followed by a remediation timeline and an immediate hotfix deployment if the live environment is compromised.

## Transparency

NEXUS will align with the IMDA *Transparency Guidelines for Generative AI Chatbots*
(Infocomm Media Development Authority, Singapore, published 20 July 2026) for its
generative AI surfaces. The chatbot info card the guidelines describe is
[`docs/AURA-CHATBOT-INFO-CARD.md`](docs/AURA-CHATBOT-INFO-CARD.md) — what AURA can and
cannot do, how it is kept safe, how data is handled (including what reaches Google's
Gemini API), and how to report issues. The card was signed off by the owner on 2026-08-28
(v1.0, in effect); the remaining refinement — a dedicated public support address — is
tracked in [`AURA-TODO.md`](AURA-TODO.md) §P9 (9.5).

## Data Governance Reminder

As a strict operational policy, live production data is strictly segregated from the Demo Sandbox environment. **As of v2.0.0 that segregation is structural rather than procedural:** a sandbox visitor belongs to no team, so there is no path for the sandbox to write to. Before v2.0.0 demo sessions appended to the production anonymous wellbeing log and painted names onto the production pulse board. At no point should Protected Health Information (PHI) or specific patient identifiers be entered into the NEXUS system or processed by the AURA intelligence engine. Please utilise anonymous placeholders for all clinical logging.
