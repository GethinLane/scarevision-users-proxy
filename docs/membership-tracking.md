# Squarespace membership reporting

SCA Auth v3 records the last membership observed while a member visits the site.
The existing Squarespace SiteUserInfo and HttpOnly authentication cookies are not
modified. Browser requests to /account/frame include the native login cookie;
the JSON bootstrap supplies userProfile.id and pricingPlans.activePricingPlans.
Only plans explicitly marked active are accepted, and the bootstrap user must
match the current SiteUserInfo account before anything is stored or sent.

## Classification

- Premium: an active Premium plan, or active Standard plus video add-on.
- Standard: active Standard without video add-on or an unrecognised extra plan.
- Inactive: an authenticated account explicitly returning an empty active-plan list.
- Unrecognised plans, malformed responses, account mismatches and failed requests
  preserve the previous snapshot. A new, unrecognised account stays blank.

Known monthly Standard and video add-on plan IDs are recognised, as are plan
names containing Standard/Premium or Video(s) Add-On. If plan naming changes,
update classifyMembership in public/sca-auth.js and lib/membership.js together.
This internal Squarespace response is not a supported public API.

## Storage and refresh

- Cookie `sca_membership`: userId, tier, checkedAt; Secure, SameSite=Lax,
  host-only, path /, 14-day lifetime. No credential or email is copied into it.
- localStorage `sca_member_membership`: the same information plus plan IDs/names
  and syncedAt. A failed request leaves the original checkedAt unchanged.
- `SCAAuth.readMembership()` reads this account's snapshot synchronously and
  includes a stale boolean. It returns null when the native account cookie is
  missing or identifies another account.
- `SCAAuth.getMembership()` refreshes snapshots older than six hours and retries
  unsynced snapshots. `{ force: true }` requests a new Squarespace check.
- Membership refresh starts automatically on each page load, including when
  getToken resolves from its existing fast path. It does not block page auth.
- Refresh happens on visits, not while the member is away. Local data may be
  stale; checkedAt must accompany any interpretation of current membership.

## Storage (Supabase, through the AI platform)

Membership is no longer written to Airtable. /api/membership-sync sends the
validated snapshot to the AI platform's /api/main-site/report, which stores it in
Supabase (`public.main_site_members`). /api/session-start-v2 also reports each
main-site sign-in there (Squarespace ID, email, name), so the AI site can link
accounts by email without reading Airtable. session-start-v2 still keeps its
existing Airtable user record for this proxy's progress, exam-date and room
features.

Configuration on this Vercel project: `AI_PLATFORM_URL` (the AI site's address)
and `MAIN_SITE_REPORT_SECRET` (the same value as on the AI site's project).
membership-sync requires a valid existing SCA Bearer token, restricts the origin,
binds the snapshot to that token's user and recalculates the tier. The platform
ignores snapshots older than the stored one and stores a time ahead of its clock
as now. A membership report for someone who has not signed in through
session-start-v2 yet returns 409 and is retried on a later page load.

This is browser-reported tracking, not independent server verification of a
Squarespace subscription. Do not use it to grant paid access.
The existing custom session issuance is unchanged.

## Validation and rollout

Run `node --test tests/membership.test.mjs` and `git diff --check`.
Apply the AI platform's `main_site_members` migration and set both environment
variables before deploying the proxy.
The live Squarespace pages already load the proxy's /sca-auth.js, so no page
injection changes are needed. Verify a real member visit updates both browser
storage and the member's row in `main_site_members`. Other members populate on their next
visit; this does not backfill inactive visitors.

Rollback: restore the previous public/sca-auth.js. Membership reporting stops;
the additive Airtable columns and last-known data can safely remain.
