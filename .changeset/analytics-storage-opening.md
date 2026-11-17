---
'@mr-tick/desktop': patch
'@mr-tick/ui': patch
---

Block analytical editing until workspace storage and saved spaces load successfully, expose original hydration error details with explicit retry, and preserve invalid saved state instead of replacing it with a blank canvas. Report incompatible storage file/version details without migrating or deleting databases, and register the missing root desktop debug task.
