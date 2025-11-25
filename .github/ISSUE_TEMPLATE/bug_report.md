---
name: Bug report
about: Something in kotef is broken or behaving strangely
labels: bug
---

### Summary

A clear, concise description of the bug.

### Environment

- kotef version / commit:
- Node.js version:
- OS:

### How were you running kotef?

- Command used (copy‑paste):
  ```bash
  # example
  node bin/kotef run --root /path/to/repo --goal "..."
  ```
- Was this against a real project or a test fixture?
- Did the repo already have a `.sdd/` folder?

### What happened?

What did you expect to happen, and what actually happened instead?

If there was an error, paste the relevant part of the log or run report (redacting any secrets):

```text
<logs / stack trace>
```

### Minimal reproduction

If possible, link to:

- a public repo, or
- a minimal sample that reproduces the issue.

If that’s not possible, describe the smallest scenario you tried that still shows the bug.

### Extra context

Anything else that might be relevant:

- `.sdd/` contents (high‑level),
- tickets involved,
- execution profile (`strict/fast/smoke/yolo`),
- anything unusual in your environment.


