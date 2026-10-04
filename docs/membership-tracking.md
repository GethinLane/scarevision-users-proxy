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

## Airtable

The existing Users base app27dTDdpc1GoBHO / Table 1 tblx3kkRrg37FnLSJ has:
MembershipTier (Standard, Premium, Inactive), MembershipPlansJson, and
MembershipCheckedAt. /api/membership-sync uses the existing AIRTABLE_USERS_*
configuration and SCA_SESSION_SECRET; no new environment variables are needed.
It requires a valid existing SCA Bearer token, restricts the origin, binds the
snapshot to that token's user, recalculates the tier, and only patches those
three fields on exactly one existing user record. It never creates a partial
user or modifies progress. Snapshots older than the stored timestamp are ignored.
Failed writes remain unsynced locally and are retried on a later page load.

This is browser-reported tracking, not independent server verification of a
Squarespace subscription. Do not use these fields/cookies to grant paid access.
The existing custom session issuance is unchanged.

## Validation and rollout

Run `node --test tests/membership.test.mjs` and `git diff --check`.
Create/verify the three Airtable fields before deploying the proxy.
The live Squarespace pages already load the proxy's /sca-auth.js, so no page
injection changes are needed. Verify a real member visit updates both browser
storage and the matching Airtable row. Other members populate on their next
visit; this does not backfill inactive visitors.

Rollback: restore the previous public/sca-auth.js. Membership reporting stops;
the additive Airtable columns and last-known data can safely remain.
