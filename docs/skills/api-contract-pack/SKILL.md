---
name: deprecation-window
description: Flag a breaking contract change that ships without a deprecation window.
type: convention
---

# Deprecation window

A breaking change is not just a change that breaks callers — it is a change that
breaks callers **with no path off the old shape**. Flag a diff that removes or
renames part of a published contract without one of these:

- **Dual accept.** The route takes the old and the new field for a release, with
  the old one marked deprecated.
- **A version.** The old shape stays reachable at the old version or path.
- **A stated window.** The PR says when the old shape goes away and who was told.

Cite the exact line that drops the old shape, and say which of the three is
missing. If the diff provides any of them, this is not a finding.

## Not a finding

- Adding an optional field, a new route, or a wider accepted type.
- Removing something that was never released.
- Internal helpers with no external caller.
