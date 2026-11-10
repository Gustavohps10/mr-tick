---
"@mr-tick/application": minor
"@mr-tick/sdk": minor
"@mr-tick/desktop": minor
"@mr-tick/ui": minor
"@mr-tick/datasource-fake": minor
---

Add analytics batch metadata separating traversal completion from remote snapshot coverage. Validate untrusted analytical queries at IPC and expose explicit next-batch previews, loading state and provider errors. A failed continuation preserves the previous preview for retry; successful navigation replaces the preview rather than accumulating the dataset in the renderer.

Dataset selection metadata explicitly declares built-in date/project support. The renderer applies only declared selections and keeps catalog/cache ownership scoped to workspace and connection.

Exercise continuation and scope isolation with the development fixture. Global analytical storage, complete snapshot publication and reconciliation remain subsequent phases.
