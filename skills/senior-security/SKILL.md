---
name: senior-security
description: "Security engineering: appsec review, threat modeling, penetration testing, security architecture, crypto implementation, compliance auditing. Use when designing or reviewing security architecture, conducting a pentest, implementing cryptography, or performing a security audit."
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
