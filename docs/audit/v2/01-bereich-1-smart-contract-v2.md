# Bereich 1 — Smart Contract V2 (`SurveyPointsV2.sol`)

**Auditor:** Senior Auditor (extern, second pass)
**Stand:** 2026-04-18
**Scope:** `packages/contracts/contracts/SurveyPointsV2.sol`, Deploy-Skripte (`deploy-v2.ts`, `finish-cutover.ts`, `deploy-v2-local.ts`), Tests (`test/SurveyPointsV2.test.ts`), Storage-Manifest (`.openzeppelin/base.json`), Hardhat-Konfig, Doku (`docs/smart-contract.md`, `docs/adr/0004-...`), PHP-Snippet (`packages/backend/src/services/template.ts`).
**Methodik:** Manuelle Code-Review, Hypothesen-getrieben (siehe `00-audit-plan-v2.md` H1.1–H1.9), Cross-Reference Code/Tests/Doku, Migration-Skript-Walkthrough, Storage-Layout-Plausibilität.

## Zusammenfassung

V2 ist ein architektonischer Sprung gegenüber V1: vier kritische V1-Findings sind durch das neue Design (UUPS, HMAC off-chain, `revokePoints`/`reactivateSurvey`, `_adminCount`-Invariante) eliminiert. Die Implementierung des V2-Contracts selbst ist sauber: gute Custom-Errors, konsistente `onlyRole`-Auth, durchgängige Events, sinnvolles Storage-Layout mit `__gap`. **Die Findings in diesem Bereich liegen primär an den Schnittstellen** — zwischen Contract und Deploy-Skript, zwischen Code und Doku, zwischen Contract und Backend-Operator, zwischen `removeAdmin` und den OZ-Standardpfaden `revokeRole`/`renounceRole`. Genau die Stellen, wo der „brutale Re-Audit" relevant ist.

Severity-Tally Bereich 1: 🔴 1 / 🟠 4 / 🟡 4 / ⚪ 2.

---

## F1.1 — Minter-Wallet hat ADMIN_ROLE auf V2 (außerhalb des Deploy-Scripts manuell gegranted)

Nicht mehr Relevant war so gewollt

---

## 🟠 F1.2 — `LastAdmin()`-Schutz umgehbar via `revokeRole` / `renounceRole`

### Belege

- `SurveyPointsV2.sol:276-286` (`removeAdmin`) checkt `_adminCount <= 1` BEFORE `_revokeRole`.
- `SurveyPointsV2.sol:311-321` (`_revokeRole`-Override) dekrementiert `_adminCount`, **macht aber selbst keinen LastAdmin-Check.**
- OpenZeppelin `AccessControlUpgradeable.revokeRole` und `renounceRole` rufen direkt `_revokeRole(role, account)` auf — beide Pfade umgehen `removeAdmin`.
- Test `test/SurveyPointsV2.test.ts:329-333` deckt nur `removeAdmin(self)` als letzter Admin, **nicht** `revokeRole` oder `renounceRole`.

### Problem

Der einzige verbleibende ADMIN_ROLE-Holder kann sich auf zwei Wegen unbemerkt selber entfernen:

```solidity
// Pfad 1: ADMIN_ROLE ist sein eigener Role-Admin → Self-Revoke erlaubt
contract.revokeRole(ADMIN_ROLE, msg.sender);

// Pfad 2: jeder darf sich selbst renouncen
contract.renounceRole(ADMIN_ROLE, msg.sender);
```

Beide laufen am `removeAdmin`-Check vorbei. `_adminCount` geht auf 0. Da `_setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE)` (`:143`) gilt, kann **niemand** die Rolle danach noch granten — auch nicht der DEFAULT_ADMIN_ROLE-Holder direkt. Recovery nur via `_authorizeUpgrade` mit DEFAULT_ADMIN_ROLE → neue Implementierung. Das ist nicht eine 30-Min-Operation während laufender Klassen-Runs.

### Trigger-Szenarien

1. Admin probiert auf BaseScan eine Action aus und tippt `revokeRole` statt `removeAdmin`.
2. Angreifer mit ADMIN_ROLE (siehe F1.1) entfernt N-1 Admins via `removeAdmin`, dann den letzten via `revokeRole`.
3. Frontend-Refaktorierung in 18 Monaten ruft fälschlich `revokeRole` statt `removeAdmin`.

### Fix (UUPS-Upgrade)

```solidity
function _revokeRole(bytes32 role, address account)
    internal
    override
    returns (bool)
{
    // Enforce LastAdmin invariant on EVERY revoke path, not only removeAdmin().
    if (role == ADMIN_ROLE && _adminCount <= 1 && hasRole(ADMIN_ROLE, account)) {
        revert LastAdmin();
    }
    bool revoked = super._revokeRole(role, account);
    if (revoked && role == ADMIN_ROLE) {
        _adminCount -= 1;
    }
    return revoked;
}
```

Plus Tests:

```typescript
it('refuses revokeRole(ADMIN_ROLE, self) when only one admin remains', async () => {
  const ADMIN_ROLE = await contract.ADMIN_ROLE()
  await expect(
    contract.connect(admin).revokeRole(ADMIN_ROLE, admin.address),
  ).to.be.revertedWithCustomError(contract, 'LastAdmin')
})

it('refuses renounceRole(ADMIN_ROLE, self) when only one admin remains', async () => {
  const ADMIN_ROLE = await contract.ADMIN_ROLE()
  await expect(
    contract.connect(admin).renounceRole(ADMIN_ROLE, admin.address),
  ).to.be.revertedWithCustomError(contract, 'LastAdmin')
})
```

**Beim Upgrade beachten:** der `deploy-v2.ts:471-485` Renounce-Pfad ruft `removeAdmin(deployer)` und `renounceRole(DEFAULT_ADMIN_ROLE, deployer)`. Mit dem Fix bleibt das funktional, weil `addAdmin(adminAddress)` davor läuft — `_adminCount >= 2` zum Zeitpunkt des deployer-Removes.

**Migration:** UUPS-Upgrade. Storage-Layout unverändert. ~50k Gas, ~$0.01.

### 2-Jahre-Begründung

Über 2 Jahre Forschungsphase wird mehrfach Personal wechseln. Admin-Rotation ist Routine. Ein Vertipper-Klick beim BaseScan-Direktaufruf, der alle Admins entfernt, ist über 24 Monate praktisch unvermeidlich — und führt zu einem Incident, der nur durch einen kompletten Contract-Upgrade lösbar ist.

---

## 🟠 F1.3 — Doku-Inkonsistenzen, die im Incident-Fall zu falschen Annahmen führen

### Belege

| Inkonsistenz               | Code (Source of Truth)                                        | Doku (falsch)                                                                                                               |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `_authorizeUpgrade`-Rolle  | `SurveyPointsV2.sol:158-162` → `onlyRole(DEFAULT_ADMIN_ROLE)` | `docs/smart-contract.md:130` → "`onlyRole(ADMIN_ROLE)`"                                                                     |
| Zuständigkeit für Upgrades | DEFAULT_ADMIN_ROLE                                            | `docs/smart-contract.md:25` → "Admin: ADMIN_ROLE — Surveys, admin/minter management, **contract upgrades**"                 |
| `revokePoints`-Rolle       | `SurveyPointsV2.sol:227-229` → `onlyRole(ADMIN_ROLE)`         | `docs/smart-contract.md:91` → "Requires `MINTER_ROLE`"                                                                      |
| `version()`-String         | `SurveyPointsV2.sol:166-168` → `"2.0.0"`                      | `docs/smart-contract.md:135` → `"v2.0.0"`; `docs/adr/0004-...:104` → `"v2.0.0"`                                             |
| Env-Var-Namen Deploy       | `deploy-v2.ts:259-260` → `ADMIN_ADDRESS`, `MINTER_ADDRESS`    | `docs/smart-contract.md:193` → `TARGET_ADMIN`, `TARGET_MINTER`; `adr-0004-...:88` analog falsch                             |
| Upgrade-Skript             | `scripts/upgrade-v2.ts` **existiert nicht im Repo**           | `docs/smart-contract.md:217-220`, `adr-0004-...:106,151` referenzieren `pnpm run upgrade:v2:mainnet` als laufende Procedure |

### Problem

Bei Sicherheits-Incidents liest der Operator die Doku, nicht den Code. Konkret gefährlich:

1. **DEFAULT_ADMIN_ROLE vs. ADMIN_ROLE-Verwechslung:** Falsche Recovery-Pläne („wenn ADMIN_ROLE compromittiert ist, können sie den Contract umschreiben" — falsch). Falsche Multi-Sig-Migrationsstrategie.
2. **`revokePoints` braucht MINTER:** Compliance-Argument basiert auf falscher Annahme („nur Minter kann revoken, also sind die Echt-Admins safe" — falsch).
3. **`version()`-String-Mismatch:** Backend liefert `2.0.0`, Doku verspricht `v2.0.0`. Monitoring auf `expectedVersion === "v2.0.0"` alarmiert sofort. Klein, peinlich.
4. **Fehlendes `upgrade-v2.ts`:** Future-Upgrades laufen aktuell ohne dokumentierte Pipeline → manuell via Hardhat-Console, ohne Storage-Layout-Validierung-Garantie (siehe F1.5), ohne Verify-Pipeline.

### Fix

Doku-Edits in `docs/smart-contract.md` und `docs/adr/0004-...`:

- `:25` → "Default Admin: contract upgrades", "Admin: Surveys + admin/minter management"
- `:130` → `onlyRole(DEFAULT_ADMIN_ROLE)`
- `:91` → "Requires `ADMIN_ROLE`"
- `:135`, ADR `:104` → `"2.0.0"`
- `:193`, ADR `:88` → `ADMIN_ADDRESS`, `MINTER_ADDRESS`

`scripts/upgrade-v2.ts` schreiben:

```typescript
import { ethers, upgrades, network, run } from 'hardhat'

async function main() {
  const proxyAddress = process.env.V2_PROXY
  if (!proxyAddress) throw new Error('V2_PROXY required')

  const factory = await ethers.getContractFactory('SurveyPointsV2')

  console.log('Validating storage layout against existing implementation...')
  await upgrades.validateUpgrade(proxyAddress, factory, { kind: 'uups' })

  console.log('Deploying new implementation + upgrading proxy...')
  const upgraded = await upgrades.upgradeProxy(proxyAddress, factory, { kind: 'uups' })
  await upgraded.waitForDeployment()
  const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress)

  const v = await (upgraded as any).version()
  console.log(`New implementation: ${newImpl}`)
  console.log(`Reported version:   ${v}`)
  if (process.env.EXPECTED_VERSION && v !== process.env.EXPECTED_VERSION) {
    throw new Error(`Version mismatch! Expected ${process.env.EXPECTED_VERSION}, got ${v}`)
  }

  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    await run('verify:verify', { address: newImpl, constructorArguments: [] })
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
```

Plus `package.json`-Skripte für `upgrade:v2:mainnet`, `upgrade:v2:sepolia`.

### 2-Jahre-Begründung

Doku verrottet schneller als Code. In 18 Monaten kommt jemand Neues, liest die Doku, baut darauf eine Annahme, macht eine Designentscheidung, die das Threat-Model bricht. Bei Incidents ist die Doku unter Stress die einzige Quelle.

---

## 🟠 F1.4 — HMAC-Key im PHP-Snippet leakt an SoSci-Operator-Trust-Boundary

### Belege

- `packages/backend/src/services/template.ts:53-101` (`buildPhpSnippet`) — `$VPP_KEY_B64 = '${surveyKey}';` als String-Literal im PHP-Code, der auf SoSci-Server liegt.
- `template.ts:42-45` (Comment): „SoSci users with access to the survey code can read it; that is acceptable, because they are the operator anyway."
- ADR-0004 (`adr-0004-...:124-128`): "Per-survey key isolation. Compromising one key compromises exactly one survey's pool." — Trust-Boundary zu SoSci nicht erwähnt.

### Problem

Der Threat-Model-Hinweis im Code-Comment setzt voraus, dass „SoSci-Admin == VPP-Admin". In der HSBI-Realität ist das typischerweise **nicht** der Fall:

- SoSci wird in Hochschulen oft zentral betrieben (HSBI-IT oder externer Hoster wie soscisurvey.de).
- Lehrende sind „Survey-Owner" auf SoSci, nicht „SoSci-Admins".
- Andere Lehrende oder Hoster haben je nach Config Lese-Zugriff auf Survey-Templates anderer User.

### Reale Bedrohung

Wer den HMAC-Key einer Survey hat, kann gültige `(nonce, token)`-Paare für **beliebige** Wallet-Adressen produzieren. Das umgeht den gesamten Anti-Sharing-Schutz, der mit V2 aufgebaut wurde:

```php
// Angreifer-Skript, läuft mit dem geleakten HMAC-Key
foreach ($attacker_wallets as $w) {
    $nonce = random_bytes(16);
    $token = hash_hmac('sha256', "v1|$surveyId|$nonce", base64_decode($leaked_key), true);
    // → claim auf Wallet $w
}
```

Pseudonymität macht forensische Unterscheidung von echten Studierenden praktisch unmöglich.

### Fix-Optionen

| Option                                                                                                                           | Aufwand            | Was es löst                                           | Kommentar                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| **A) HMAC-Key als Server-side-Include vom HSBI-Server**                                                                          | Mittel             | SoSci-Admin sieht den Key nicht                       | Bricht Pseudonymität (SoSci ↔ HSBI-Verbindung loggable), Network-Hop-Latenz |
| **B) Backend mintet Tokens via separater `/api/v1/mint-token`-Route**                                                            | Hoch               | Kein Key beim SoSci, Backend ist einzige Token-Quelle | Backend wird Single-Point-of-Pseudonymity-Failure                           |
| **C) Threat-Model dokumentieren + organisatorisch absichern** (dedicated SoSci-Instanz, Zugriffsbeschränkung auf VPP-Operatoren) | Niedrig            | Bewusstes Trade-off                                   | Risiko nicht eliminiert, aber transparent                                   |
| **D) Aktive Key-Rotation pro Survey-Zyklus** (`POST /:id/key/rotate` als Standard-Workflow)                                      | Niedrig (operativ) | Begrenzt Zeitfenster eines Leaks                      | Eliminiert nicht                                                            |

**Empfehlung:** **C + D** als Minimum für die Forschungsphase. **A** als langfristige Architekturentscheidung. **Plus expliziter Threat-Model-Eintrag in `docs/security.md` oder ADR-0004**.

### 2-Jahre-Begründung

Über 2 Jahre wechselt SoSci-IT-Personal, neue Lehrende werden VPP nutzen, mehrere Surveys auf zentralen HSBI-SoSci-Instances. Die Annahme „SoSci-Admin == VPP-Admin" wird mit jeder Erweiterung falscher. Ein Token-Massenmissbrauch (auch unabsichtlich) wäre in einem pseudonymen System forensisch kaum aufzuklären.

---

## 🟠 F1.5 — OpenZeppelin-Storage-Manifest unter ungewöhnlichem Filename — Upgrade-Validierung möglicherweise inaktiv

### Belege

- `packages/contracts/.openzeppelin/base.json` (existiert)
- Erwartete OZ-Plugin-Konvention für Custom-Networks: `unknown-<chainId>.json` (also `unknown-8453.json` für Base Mainnet).
- `packages/contracts/hardhat.config.ts:33-37` — Network-Name ist `baseMainnet`, chainId `8453`.
- Commit `982ac68` „chore(contracts): commit openzeppelin upgrades manifest for base mainnet" — manuell ins Repo gecheckt.

### Problem

Das OZ-Hardhat-Upgrades-Plugin liest das Storage-Layout-Manifest, um Layout-Kompatibilität zwischen Implementations zu prüfen. Konvention:

- `<network-name>.json` für built-in Networks (mainnet, sepolia, …).
- `unknown-<chainId>.json` für Custom-Networks.

`baseMainnet` ist kein Built-in. Base Mainnet wird erst ab OZ-Upgrades v3.5+ als Built-in unter dem Namen `base` erkannt. Der Filename `base.json` deutet darauf, dass die Plugin-Version Base als Built-in kennt.

**Risiken die nicht zu 100% widerlegbar sind ohne lokales Reproduzieren:**

1. Falls `base.json` mit der laufenden Plugin-Version matched → alles OK.
2. Falls die Plugin-Version anders ermittelt (z.B. `unknown-8453.json` erwartet wird) → Plugin findet kein Manifest → behandelt nächsten `upgradeProxy`-Aufruf als Fresh-Deploy → **Storage-Layout-Check übersprungen** → potentielle Storage-Korruption beim Upgrade.

Erschwerend:

- CI hat **keinen Test, der einen V3-Upgrade gegen das gespeicherte V2-Layout simuliert**.
- `scripts/upgrade-v2.ts` existiert nicht (siehe F1.3) → keine systematische Pipeline, in der das Plugin das Manifest lesen muss.
- Manifest enthält nur **eine** Implementation (slot-Hash `855a02955e...`). Wenn zur Upgrade-Zeit nicht gefunden, kein Vergleichspunkt.

### Fix

1. **Verifizieren (15 min):**

   ```bash
   cd packages/contracts
   pnpm hardhat console --network baseMainnet
   > const { Manifest } = require('@openzeppelin/upgrades-core')
   > const m = await Manifest.forNetwork(ethers.provider)
   > await m.read()
   ```

   Wenn das die Daten aus `base.json` ausliest → OK. Sonst → Datei umbenennen oder Plugin updaten.

2. **CI-Schutz:**

   ```typescript
   it('storage layout from manifest is recognised by the upgrades plugin', async () => {
     const factory = await ethers.getContractFactory('SurveyPointsV2')
     // Should not throw if the manifest is correctly recognised
     await upgrades.validateUpgrade(deployedProxyAddress, factory, { kind: 'uups' })
   })
   ```

3. **`upgrade-v2.ts` (siehe F1.3) MUSS `await upgrades.validateUpgrade(...)` vor dem eigentlichen Upgrade aufrufen.**

### 2-Jahre-Begründung

Über 2 Jahre kommt mindestens ein Upgrade. Wenn es ohne Storage-Layout-Validierung läuft und ein neues State-Var an die falsche Stelle gesetzt wird, korrumpiert es alle bisherigen `_surveys`/`_totalPoints`/`_claimed`-Mappings. Nicht erkennbar bis ein Studierender claimed → bekommt 0 Punkte oder Punkte einer fremden Wallet. Recovery: Re-Deploy + Migration aller On-Chain-Daten — was V2 explizit vermeiden wollte.

---

## 🟡 F1.6 — Test-Lücke: ADMIN_ROLE-only-Holder ohne DEFAULT_ADMIN_ROLE wird nicht explizit gegen Upgrade getestet

### Belege

- `test/SurveyPointsV2.test.ts:401-405`:
  ```typescript
  it('rejects upgrades initiated by non-DEFAULT_ADMIN_ROLE accounts', async () => {
    const proxyAddress = await contract.getAddress()
    const factory = await ethers.getContractFactory('SurveyPointsV2', outsider)
    await expect(upgrades.upgradeProxy(proxyAddress, factory)).to.be.reverted
  })
  ```

### Problem

Der Test prüft nur `outsider` (ohne Rolle). Er prüft **nicht**, dass:

- ein Account mit nur ADMIN_ROLE aber ohne DEFAULT_ADMIN_ROLE den Upgrade-Pfad **nicht** triggern kann.
- ein Account mit nur MINTER_ROLE den Upgrade-Pfad **nicht** triggern kann.

Wenn jemand in V3 die Auth-Logik mal von `DEFAULT_ADMIN_ROLE` auf `ADMIN_ROLE` ändert (z.B. weil die Doku das so sagt — siehe F1.3), würde dieser Test still bestehen bleiben.

### Fix

```typescript
it('rejects upgrades initiated by ADMIN_ROLE-only accounts', async () => {
  await contract.connect(admin).addAdmin(admin2.address)
  const ADMIN_ROLE = await contract.ADMIN_ROLE()
  const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE()
  expect(await contract.hasRole(ADMIN_ROLE, admin2.address)).to.equal(true)
  expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, admin2.address)).to.equal(false)

  const proxyAddress = await contract.getAddress()
  const factory = await ethers.getContractFactory('SurveyPointsV2', admin2)
  await expect(upgrades.upgradeProxy(proxyAddress, factory)).to.be.reverted
})

it('rejects upgrades initiated by MINTER_ROLE-only accounts', async () => {
  const proxyAddress = await contract.getAddress()
  const factory = await ethers.getContractFactory('SurveyPointsV2', minter)
  await expect(upgrades.upgradeProxy(proxyAddress, factory)).to.be.reverted
})
```

### 2-Jahre-Begründung

Bei einer Refaktorierung in 18 Monaten könnte jemand „aufräumen". Ohne diesen Test bleibt der Schutz unbemerkt aufgehoben.

---

## 🟡 F1.7 — Deploy- und Cutover-Skripte ohne automatisierte Tests

### Belege

- `packages/contracts/scripts/deploy-v2.ts` — 551 Zeilen, kein Test.
- `packages/contracts/scripts/finish-cutover.ts` — 235 Zeilen, kein Test.
- `packages/contracts/test/` enthält nur Contract-Tests.
- `deploy-v2.ts:74-77` referenziert ein nicht-existierendes `upgrade-v2.ts`.

### Problem

Die Migration ist **eine** kritische TX-Sequenz, die einmal pro Major-Version live auf Base Mainnet läuft: deployer bekommt drei Rollen, transferiert sie, renounced, migriert Admins, deaktiviert V1-Surveys. Jeder Bug → irreversible On-Chain-Konsequenzen oder hängende Cutover-Stati (dafür wurde `finish-cutover.ts` gebaut).

Konkrete Test-Lücken:

1. **Deployer = TARGET_ADMIN-Edge-Case** (`deploy-v2.ts:296-301`): Step-5-Renounce komplett übersprungen. Kein Test.
2. **Deployer war V1-Admin + ist nicht TARGET_ADMIN:** in Migration-Step 3 als „= deployer" übersprungen, in Step 5 renounced — landet **nicht** in der V2-Adminliste. Per Design, ungetestet.
3. **`EXCLUDE_FROM_ADMIN_MIGRATION`-Logik:** keine Tests für Minter-Filter, invalide Adressen, case-insensitive Set-Logik.
4. **`finish-cutover.ts`-Idempotenz:** by-design idempotent, ungetestet.
5. **`enumerateActiveSurveys`-Stop-Logik:** `MISS_LIMIT = 10` — Was wenn V1 Survey 1, 2, 3, lange Pause, dann 50? Skript stoppt bei ID 13, übersieht 50.

### Fix

Hauptlogik in importierbare Funktionen extrahieren, dann Hardhat-Tests gegen V1-Mocks:

```typescript
describe('deploy-v2.ts (against V1 mock)', () => {
  it('migrates only verified V1 admins, excludes minter unconditionally', async () => {
    /* … */
  })
  it('handles deployer-is-target-admin edge case correctly', async () => {
    /* … */
  })
  it('handles deployer-was-V1-admin-but-not-target edge case', async () => {
    /* … */
  })
  it('skips V1 surveys past consecutive miss limit but warns', async () => {
    /* … */
  })
})

describe('finish-cutover.ts', () => {
  it('is fully idempotent across multiple runs', async () => {
    /* … */
  })
  it('correctly resumes from a partial state where only proxy is deployed', async () => {
    /* … */
  })
})
```

### 2-Jahre-Begründung

1–2 Migrations-Events pro Jahr realistisch. Skripte werden zwischen Events nicht angefasst → bei jedem Use bleiben Bugs unentdeckt bis live.

---

## 🟡 F1.8 — `revokePoints`-Event-Stream macht Off-Chain-Indexer leicht inkonsistent (Cross-Cutting in Bereich 4)

### Belege

- `SurveyPointsV2.sol:227-240` (`revokePoints`) emittiert `PointsRevoked(wallet, surveyId, points, revokedBy)`.
- `SurveyPointsV2.sol:201-221` (`awardPoints`) emittiert `PointsAwarded(wallet, surveyId, points)`.
- Bereich-0-Inventur: `packages/backend/src/services/json-file-event-store.ts` sammelt `SurveyRegistered`, `PointsAwarded`, `RoleGranted`, `RoleRevoked` — `PointsRevoked`, `SurveyReactivated`, `WalletUnsubmitted` nicht erwähnt. Wird in Bereich 4 final auditiert.

### Problem

Wenn der Backend-Event-Store nur `PointsAwarded` summiert und `PointsRevoked` ignoriert:

- Cache-Total = N
- On-Chain `_totalPoints[wallet]` = N - revoked
- Frontend zeigt N, BaseScan zeigt N - revoked → Vertrauensverlust.

Plus: `revokePoints` setzt `_claimed[student][surveyId] = false`. Wenn der Backend-Cache `_claimed=true` cached und nach `revokePoints` nicht invalidiert, blockiert der Doppel-Replay-Check in `routes/claim.ts:200-210` den Re-Claim, den `revokePoints` ja gerade ermöglichen will (Test `:238-242` „allows re-claiming after revocation").

### Fix

Contract-Side ist sauber. Bereich 4 muss prüfen, dass der Event-Store `PointsRevoked` UND `SurveyReactivated` UND `SurveyDeactivated` UND `WalletUnsubmitted` als Inverse der jeweiligen positiven Events verarbeitet.

### 2-Jahre-Begründung

Wenn `revokePoints` jemals real eingesetzt wird (Operator-Korrektur, Bug-Workaround), und der Cache driftet, gibt es eine sichtbare Inkonsistenz zwischen Frontend und BaseScan. Der erste „warum stimmen die Zahlen nicht überein"-Support-Ticket — und in einem System, das mit „on-chain-Verifizierbarkeit" wirbt, brutaler Vertrauensbruch.

---

## 🟡 F1.9 — `version()` ist hard-coded String-Literal — Auto-Bump-Mechanismus fehlt

### Belege

- `SurveyPointsV2.sol:166-168`:
  ```solidity
  function version() external pure returns (string memory) {
      return "2.0.0";
  }
  ```

### Problem

Bei jedem Upgrade muss der Entwickler manuell den String editieren. Vergessen → Backend (`/api/v1/status`) und Monitoring sehen weiterhin `2.0.0`, obwohl die Implementation-Adresse sich geändert hat. Der Audit-Trail ist hinfällig.

Kein Test prüft, dass der String mit `package.json`-Version oder einer erwarteten Konstanten übereinstimmt.

### Fix

| Option                                                                       | Aufwand                                 | Was es löst           |
| ---------------------------------------------------------------------------- | --------------------------------------- | --------------------- |
| **A) `assert(version() === EXPECTED_VERSION)` in `upgrade-v2.ts`**           | Niedrig                                 | Pipeline-Schutz       |
| **B) `version` als state-Variable, gesetzt via `reinitializer(N)`-modifier** | Mittel (1 Storage-Slot weg vom `__gap`) | Auto-bump per Upgrade |
| **C) CI-Lint vergleicht `package.json`-Version mit Contract-Konstante**      | Niedrig                                 | Compile-time Schutz   |

**Empfehlung:** **A + C**.

### 2-Jahre-Begründung

Bei mehreren Upgrades wird mindestens einmal vergessen, den String zu bumpen — und genau bei dem Upgrade wäre das relevant gewesen.

---

## ⚪ F1.10 — `awardPoints`-Validierung von `surveyId == 0` indirekt via `SurveyNotFound`

### Belege

- `SurveyPointsV2.sol:201-221` (`awardPoints`): kein expliziter `surveyId == 0`-Check.
- `SurveyPointsV2.sol:177-197` (`registerSurvey`): expliziter Check `if (surveyId == 0) revert InvalidSurveyId();`.

### Problem

Inkonsistente Fehlersemantik. `awardPoints(student, 0)` → `SurveyNotFound(0)`. Backend mappt das auf `SURVEY_NOT_FOUND` → Frontend zeigt „Survey existiert nicht", obwohl der eigentliche Bug ein leerer URL-Param `s=0` war.

### Fix

```solidity
function awardPoints(address student, uint256 surveyId)
    external
    onlyRole(MINTER_ROLE)
    nonReentrant
{
    if (student == address(0)) revert ZeroAddress();
    if (surveyId == 0) revert InvalidSurveyId();
    // …
}
```

Plus Test:

```typescript
it('reverts on surveyId == 0 with InvalidSurveyId (not SurveyNotFound)', async () => {
  await expect(
    contract.connect(minter).awardPoints(student1.address, 0),
  ).to.be.revertedWithCustomError(contract, 'InvalidSurveyId')
})
```

UUPS-Upgrade. Trivial.

### 2-Jahre-Begründung

Bessere Errors sparen Debug-Zeit bei Support.

---

## ⚪ F1.11 — `addAdmin`-Idempotenz emittiert kein Event bei No-Op

### Belege

- `SurveyPointsV2.sol:267-274`:
  ```solidity
  function addAdmin(address account) external onlyRole(ADMIN_ROLE) {
      if (account == address(0)) revert ZeroAddress();
      if (!hasRole(ADMIN_ROLE, account)) {
          _grantRole(ADMIN_ROLE, account);
      }
  }
  ```

### Problem

Idempotenter Aufruf für schon-existierenden Admin → kein Event, kein on-chain-Audit-Trail. Frontend zeigt „Erfolg".

### Fix

Akzeptieren und in `docs/smart-contract.md` dokumentieren ODER `AdminAlreadyExists`-Custom-Error im strict-Mode + optional `addAdminLenient`. Aktuell Bikeshedding.

### 2-Jahre-Begründung

Geringer Impact. Erwähnt für Vollständigkeit.

---

## Aus V1 obsolet geworden

Folgende V1-Findings (`docs/audit/02-bereich-1-smart-contract.md`) sind durch den V2-Umbau **eliminiert** und werden in V2 nicht erneut bewertet:

| V1-ID | V1-Titel                               | Warum obsolet                                                            |
| ----- | -------------------------------------- | ------------------------------------------------------------------------ |
| 1.1   | Kein Upgrade-Mechanismus               | UUPS-Proxy, `_authorizeUpgrade` (`SurveyPointsV2.sol:158-162`)           |
| 1.3   | Klartext-Secret in Calldata (Critical) | `awardPoints(address,uint256)` (`:201`), kein `secret` mehr              |
| 1.5   | Monotoner Punkte-Counter               | `revokePoints` (`:227-240`) inkl. `claimCount`-Decrement                 |
| 1.6   | `getSurveyInfo` exposed `secretHash`   | `SurveySnapshot` enthält keinen `secretHash` mehr (`:48-55`, `:377-398`) |
| 1.7   | Link-Sharing-Catastrophe (Critical)    | Per-Teilnehmer Nonce + HMAC-Token, Single-Use via Backend-Nonce-Store    |

Folgende V1-Findings sind **teilweise adressiert** und in F1.2 / F1.3 dieses Dokuments neu bewertet:

| V1-ID | V1-Titel                                | V2-Status                                                                                                                                                                    |
| ----- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2   | Admin-Lockout-Risiko                    | `LastAdmin()`-Check in `removeAdmin`, **umgangen** via `revokeRole`/`renounceRole` → **F1.2**                                                                                |
| 1.4   | Keine Secret-Rotation / Survey-Löschung | `reactivateSurvey` (`:254`) heilt Deaktivierungen. Off-chain Key-Rotation in Bereich 4. Kein `deleteSurvey` — alte Entries bleiben on-chain (akzeptiert für Forschungsphase) |

---

## Severity-Tally Bereich 1

🟠 Major: **4** (F1.2, F1.3, F1.4, F1.5)
🟡 Minor: **4** (F1.6, F1.7, F1.8, F1.9)
⚪ Nit: **2** (F1.10, F1.11)

---

## Empfohlene Reihenfolge der Fixes

1. **Sofort (manuell, ohne Upgrade):** F1.1 — `revokeRole(ADMIN_ROLE, minter)` via BaseScan, sobald Frontend angepasst ist (oder akzeptierter Trade-off in einer separaten ADR dokumentieren mit Multi-Sig-Plan für DEFAULT_ADMIN).
2. **UUPS-Upgrade V2.1 (eine Implementation für mehrere Findings):** F1.2 (`_revokeRole`-Check), F1.10 (`surveyId==0`), optional F1.9 (`version → "2.1.0"`).
3. **Doku- und Skript-Edits (kein Code-Risiko):** F1.3 (Doku-Korrekturen + `upgrade-v2.ts` schreiben).
4. **Test-Erweiterung (CI-Hardening):** F1.6 (Auth-Tests), F1.7 (Deploy-Skript-Tests), Manifest-Recognition-Test (F1.5).
5. **Architektur-/Threat-Model-Entscheidung:** F1.4 (HMAC-Key-Boundary). Erwartet eine Diskussion mit HSBI-IT über SoSci-Hosting.
6. **Cross-Cutting in Bereich 4:** F1.8 — Event-Store muss `PointsRevoked`, `SurveyReactivated`, `SurveyDeactivated`, `WalletUnsubmitted` korrekt verarbeiten.

## Cross-Cutting-Notes für andere Bereiche

- **Bereich 2 (Key Management):** F1.1 verschlimmert das Minter-Compromise-Szenario massiv. V1-Findings 2.1, 2.4, 2.6 sind unverändert relevant und kombinieren mit F1.1 zu einem deutlich höheren Gesamtrisiko.
- **Bereich 4 (Stores):** F1.8 — Event-Store-Coverage prüfen.
- **Bereich 6 (Auth, Replay):** F1.4 — die HMAC-Key-Trust-Boundary verschiebt das Auth-Modell. Bereich 6 muss prüfen, ob `routes/claim.ts` zusätzliche Schutzmaßnahmen hat (Rate-Limit pro Survey, Anomalie-Detection).
- **Bereich 7 (Operations):** F1.3 (fehlendes Skript), F1.5 (Manifest-Filename), F1.7 (Skript-Tests). Plus: kein dokumentierter Recovery-Pfad für „LastAdmin via revokeRole entfernt" — das wäre nach F1.2-Fix obsolet, vorher kritisch.
