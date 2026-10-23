---
"@mr-tick/sdk": minor
"@mr-tick/shared": minor
"@mr-tick/domain": major
"@mr-tick/application": major
"@mr-tick/ui": minor
"@mr-tick/desktop": minor
"@mr-tick/datasource-fake": patch
---

Make authentication an explicit `auth` capability, independent of data providers. All addons register connection profiles and authenticators through `contributions.connections`, whose registration methods return `Either` and reject missing capabilities, invalid profiles and unsupported methods.

Remove connection profiles from `IDataSource` and `IDataSourceResolver`, the datasource fallback and the separately injected OAuth authenticator. OAuth resolves the authenticator declared for the requested connection profile and authorization role instead of choosing another registered authenticator.

Remove `method: 'none'`, anonymous authentication results and `Workspace.connectNone`. Addons without authentication omit `auth` and use addon or workspace settings. Authenticated connection results always include identity; the core retains credential storage, OAuth attempts, renewal and lifecycle coordination.

Show authentication settings only for addons declaring `auth`, update the development addon and document the SDK 0.11 contract in English and Portuguese. Distribute updated authenticated addons only after publishing the compatible SDK and desktop; update their npm dependency and lockfile before release.

Allow unreleased SDK testing in an unpackaged desktop only when the addon and its SDK dependency are development links pointing to the host's local SDK. Preserve production API version checks and surface connection profile loading errors in the settings screen.
