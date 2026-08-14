# Security Policy

## Supported Versions

We take the security and data privacy of the NEXUS platform very seriously. Currently, only the following versions of NEXUS are actively supported with security patches and updates.

| Version | Support Status |
| ------- | -------------- |
| 1.14.x  | Supported (Active Beta) |
| 1.13.x  | Supported (Legacy Stable) |
| < 1.13  | Unsupported |

> This table must match the *Supported Versions* table in [`README.md`](README.md); both are
> downstream of `package.json` `version`, which is the single authoritative copy. It had
> drifted eight minor versions behind (it still named 1.5.x as the Active Beta at v1.13.0) —
> the support boundary moves with each release and is not an independent policy.

## Reporting a Vulnerability

Given the internal operational nature of this application within the Sport and Exercise Medicine Centre, any potential security vulnerabilities must be reported and escalated immediately.

Please do not report security vulnerabilities through public GitHub issues or public discussion boards.

If you discover a security vulnerability within NEXUS, please send a direct email to the Lead Developer, Muhammad Alif, at muhammad.alif@kkh.com.sg. 

All security reports will be treated with the highest priority. You can expect an acknowledgement of your report within 24 hours, followed by a remediation timeline and an immediate hotfix deployment if the live environment is compromised.

## Data Governance Reminder

As a strict operational policy, live production data is strictly segregated from the Demo Sandbox environment. At no point should Protected Health Information (PHI) or specific patient identifiers be entered into the NEXUS system or processed by the AURA intelligence engine. Please utilise anonymous placeholders for all clinical logging.
