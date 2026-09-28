---
name: senior-security
description: "Use when designing or reviewing security architecture, threat modeling, running a pentest or appsec review, implementing cryptography, or performing a security or compliance audit."
---

# Senior Security

Three automated scripts:

```bash
python scripts/threat_modeler.py <project-path> [options]
python scripts/security_auditor.py <target-path> [--verbose]
python scripts/pentest_automator.py [arguments] [options]
```

References:
- `references/security_architecture_patterns.md` — patterns, anti-patterns
- `references/penetration_testing_guide.md` — workflow, tooling
- `references/cryptography_implementation.md` — implementation, troubleshooting

Baseline practices: validate all inputs, parameterized queries, proper authentication, keep dependencies updated.
