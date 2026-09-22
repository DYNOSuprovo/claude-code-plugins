# Research notes: offline storage on field tablets

## Storage quotas measured on the pilot tablets

| Browser | Quota reported by `navigator.storage.estimate()` | Evicted under pressure |
|---|---|---|
| Chrome 140 on Android 15 | 60 % of free disk | Only if not persisted |
| Safari 19 on iPadOS | 1 GB, then a prompt | After 7 days without interaction |

Calling `navigator.storage.persist()` on first save keeps Chrome from evicting the drafts. Safari ignores it.

## Replay ordering

Drafts replay oldest first. Two drafts of the same form replay in `savedAt` order; the second one's `base` is the first one's accepted revision, so the second never conflicts with the first.

> The pilot showed one inspector with 212 queued drafts after a week in a basement archive. The queue must stream, not load everything in memory.
