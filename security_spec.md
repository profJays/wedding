# Firestore Security Specification — Mary & Joseph (#mjay2026)

## 1. Data Invariants
1. **Admin Isolation**: Only verified administrators (bootstrapped owner email `joepreserve@gmail.com` with `email_verified == true`, or a verified UID present in `/admins/{uid}`) may read RSVP records, list unapproved gallery media, edit site content, or manage admins.
2. **Public Content Integrity**: `/siteContent/{contentId}` is readable by all visitors so the wedding website loads cleanly, but strictly writable only by verified administrators with bounded schema validation.
3. **RSVP PII Protection & Anti-Overwrite**: Public guests may create a new RSVP document at `/rsvps/{rsvpId}` when `rsvpOpen == true` and `guestCount` respects `maxGuestsPerRsvp`, with server-validated `submittedAt == request.time`. Public guests cannot `get`, `list`, `update`, or `delete` any RSVP records.
4. **Wedding-Day Gallery Lock & Media Type Bounds**: Non-admin guests cannot create `/galleryItems/{itemId}` records prior to the gallery unlock timestamp (`1797030000000` = `2026-12-12T00:00:00+01:00` Africa/Lagos, or admin-updated `galleryUnlockEpochMs`), may only submit `image` (<= 50 MB) or `video` (<= 100 MB) items, and public guest submissions must always enter with `status == 'pending'`. Only verified administrators may upload `audio` tracks (<= 50 MB, stored with `status == 'hidden'`) or update `/siteContent/main` music and puzzle configuration. Public list queries must filter `status == 'approved'`.
5. **Strict Keys, Expression Budget & Timestamp Integrity**: Every write enforces `keys().hasOnly(...)` with exact schema checks, string `.size()` bounds, regex-checked document IDs, and `request.time` timestamp matching, while staying well within Firestore's 1,000-expression-per-request evaluation ceiling.
6. **Safe Partial Slideshow Updates**: Updating gallery slideshow settings on `/siteContent/main` uses an explicit action-based partial update (`affectedKeys().hasOnly(['slideshowAutoplay', 'slideshowIntervalMs', 'slideshowItems', 'updatedAt', 'updatedByUid'])`) restricted exclusively to verified administrators so unrelated site content fields can never be overwritten or polluted.

## 2. Adversarial "Dirty Dozen+" Attack Payloads
1. Unauthenticated `list` on `/rsvps` -> `PERMISSION_DENIED`
2. Unauthenticated `get` on `/rsvps/rsvp_john_doe` -> `PERMISSION_DENIED`
3. Unauthenticated RSVP `create` with `guestCount: 99` exceeding `maxGuestsPerRsvp` -> `PERMISSION_DENIED`
4. Unauthenticated RSVP `create` with spoofed shadow field `{ isVip: true }` -> `PERMISSION_DENIED`
5. Unauthenticated RSVP `create` with backdated `submittedAt` (`!= request.time`) -> `PERMISSION_DENIED`
6. Unauthenticated RSVP `update` attempting to overwrite an existing guest's submission -> `PERMISSION_DENIED`
7. Unauthenticated or non-admin partial `update` to `/siteContent/main` (e.g. modifying `slideshowItems`, `musicEnabled`, or `puzzleEnabled`) -> `PERMISSION_DENIED`
8. Unauthenticated self-promotion write to `/admins/attacker_uid` -> `PERMISSION_DENIED`
9. Admin login spoof (`email == 'joepreserve@gmail.com'`, `email_verified == false`) writing `/siteContent/main` -> `PERMISSION_DENIED`
10. Public guest `create` on `/galleryItems/g1` before 12 Dec 2026 00:00 WAT -> `PERMISSION_DENIED`
11. Public guest `create` on `/galleryItems/g2` with `mediaType: 'audio'` or `sizeBytes > 52428800` for an image -> `PERMISSION_DENIED`
12. Unauthenticated `list` on `/galleryItems` without `where('status', '==', 'approved')` (exposing `pending`/`hidden` items) -> `PERMISSION_DENIED`
13. Verified admin slideshow partial `update` with shadow field `{ injectedFlag: true }` or out-of-range `slideshowIntervalMs: 500` or `slideshowItems.size() > 30` -> `PERMISSION_DENIED`
