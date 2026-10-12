# V3 — Fractional points

SurveyPointsV3 lets a survey award fractions of a point, e.g. **0.25**,
**0.5**, **0.75** or **1.5**. Values are stored with two decimals
("centipoints", 1 point = 100), from 0.01 up to 255 points.

V3 is a UUPS upgrade of the existing V2 proxy. The proxy address, all
surveys, balances, claims, roles and wallet submissions stay as they are.

## Design

| Concern                | Whole-point surveys (0 decimals)                          | Fractional surveys                                                  |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Register               | `registerSurvey` or `registerSurveyCenti(…, n×100, …)`    | `registerSurveyCenti(…, centi, …)`                                  |
| Survey value stored in | `Survey.points` (uint8, as in V2)                         | `_surveyCenti[id]` (new), `Survey.points = 0`                       |
| Award stored in        | `_surveyPoints`, `_totalPoints` (V2)                      | `_surveyCentiOf`, `_totalCenti` (new)                               |
| Events                 | `SurveyRegistered`, `PointsAwarded`, `PointsRevoked` (V2) | `SurveyRegisteredCenti`, `PointsAwardedCenti`, `PointsRevokedCenti` |

Whole-point surveys behave **bit for bit like V2** — same storage writes,
same events, same view results. Nothing that already exists is migrated or
rewritten. The three new mappings take the first three slots of the former
40-slot `__gap` (now 37), so the storage layout is compatible; the
OpenZeppelin Upgrades plugin re-checks this before it sends the upgrade.

### Reading values

New exact views, all in centipoints:

- `getSurveyInfoCenti(id)` — like `getSurveyInfo`, first field is the value
  in centipoints; `0` means the survey does not exist.
- `totalPointsCenti(wallet)` — whole and fractional awards combined.
- `surveyPointsCenti(wallet, id)`

The V2 views keep working but **round fractional values down**:
`totalPoints` returns whole points (3.75 → 3), and `getSurveyInfo` /
`surveyPoints` return `0` for a 0.5-point survey. Tools that need exact
values must use the `*Centi` views.

### Backend and frontend

- The API now uses decimal numbers for every `points` / `totalPoints`
  field. `POST /api/v1/surveys` accepts up to two decimals.
- The backend detects the contract version at runtime
  (`supportsFractionalPoints()`), so it works against V2 **and** V3. While
  the proxy still runs V2, whole points work as before and fractional
  registrations are refused with `409 FRACTIONAL_POINTS_UNSUPPORTED`.
  After the upgrade the backend switches to the exact views within five
  minutes, without a restart.
- The event store reads the new `*Centi` events as well and stores points
  as decimals. Existing `data/events.json` files stay valid.
- The admin dashboard accepts "0,25" or "0.25" and all point displays show
  up to two decimals in the UI language.

## Upgrade runbook

Requires the key that holds **`DEFAULT_ADMIN_ROLE`** on the proxy
(`DEPLOYER_PRIVATE_KEY`). Deploying the new backend/frontend and upgrading
the proxy are independent and can happen in either order.

1. **Tests.** `pnpm --filter @vpp/contracts test` must be green
   (`test/SurveyPointsV3.test.ts` upgrades a populated V2 proxy and checks
   that every balance survives).
2. **Rehearse on Base Sepolia.**

   ```bash
   cd packages/contracts
   PROXY_ADDRESS=<sepolia proxy> pnpm upgrade:v3:sepolia
   ```

   Register a 0.25-point survey on staging, claim it, check that the
   points page shows 0,25.

3. **Upgrade Base mainnet.**

   ```bash
   PROXY_ADDRESS=0x8b8Ed86CEC6f886EC5AE208C1Ef3B084d91a86Dd pnpm upgrade:v3:mainnet
   ```

   The script deploys the V3 implementation, validates the storage layout
   against `.openzeppelin/base.json`, upgrades the proxy and verifies the
   implementation on BaseScan. Cost: one implementation deployment plus
   one upgrade transaction (a few cents on Base).

4. **Commit the updated `.openzeppelin/base.json`** — the plugin records
   the new implementation there; future upgrades validate against it.
5. **Check.** The admin status panel shows contract version `3.0.0`.
   Within five minutes the dashboard accepts fractional points.

### Rollback

There is no downgrade path back to V2: the OpenZeppelin plugin refuses an
upgrade that removes state variables, and V2 could not see fractional
surveys or awards anyway. If something is wrong after the upgrade, fix it
forward with a V3.x implementation. This is why step 2 (Sepolia rehearsal)
matters.
