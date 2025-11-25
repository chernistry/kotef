# Security Policy

We take security seriously. kotef is an autonomous coding agent that can read and edit files, run commands, and talk to external services — if something goes wrong, it can break a lot of things very quickly.

This document explains how to report vulnerabilities and what you can expect in return.

## Supported versions

This is an early‑stage project. We currently treat **the main branch** as the only supported version for security fixes.

If you discover an issue on a fork or a downstream integration, please try to reproduce it against `main` first.

## Reporting a vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead:

1. Email the maintainer listed on the GitHub profile, or  
2. If email is unavailable, open a minimal issue titled “Security issue – please contact me” without details, and we’ll move the conversation to a private channel.

Please include:

- a clear description of the issue,
- minimal steps to reproduce,
- what you think the impact could be,
- any relevant logs or configuration (with secrets removed).

We will:

- acknowledge receipt within **7 days**, and
- aim to provide a triage result (confirm / cannot reproduce / not a security issue) within **14 days**.

## What counts as a security issue here

Examples of things we care about:

- Escaping the intended project root (path traversal) despite `resolvePath` and sandboxing.
- Writing outside the allowed workspace when running in “safe” modes.
- Running arbitrary commands or network calls that bypass the configured policies.
- Leaking secrets or sensitive data through logs, prompts, or external requests.
- Any way the agent can be tricked (e.g., via prompt injection) into violating its own guardrails in a way that causes real harm.

Examples of things that are *not* treated as security issues:

- Misconfigured environments (e.g., giving `rootDir=/`, running as root, disabling permission flags).
- Bugs that only affect local correctness (e.g., a broken patch that fails to apply but does not escape the sandbox).

## Responsible disclosure

If you report a vulnerability, please give us a reasonable amount of time to fix it before sharing details publicly.

We are happy to credit you in the changelog / release notes unless you prefer to remain anonymous.


