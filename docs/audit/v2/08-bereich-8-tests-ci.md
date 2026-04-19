# Bereich 8 — Test-Coverage & CI-Qualität

Auditor: Senior Test/CI-Auditor (Mock-Hygiene, Pipeline-Robustheit, Detection-vs-Theatre).
Datum: 2026-04-18.
Vorarbeit: `docs/audit/v2/00-07-*` (alle), 27 Test-Files (5.158 Zeilen), `.github/workflows/ci.yml` (197 Zeilen, line-by-line), `vitest.config.*` × 3, `.lighthouserc.json`, `commitlint.config.ts`, `.husky/*`, `package.json` (lint-staged).

Wichtigste Frage dieses Bereichs: **„Welcher der 84 bisherigen Findings hätte durch einen Test gefangen werden können — und welcher Test fehlt heute?"**

---

## Executive Summary

12 Findings. Severity-Verteilung:

- 🔴 **Blocker (3):** Coverage-Schwellen sind außer Frontend nicht enforced (Codecov-Theatre), der Production-Rate-Limiter ist ungetestet, alle in Bereich 1–7 als „Risk-Verstärker = ungetestet" markierten kritischen Pfade (`config.ts` Boot-Validation, `blockchain.ts`-Helpers, `event-store.ts`, NonceManager, Auth-Middleware) sind komplett ungetestet.
- 🟠 **Major (3):** Frontend-Coverage 40 % ist Production-untauglich + AdminPage-Sign-Flows + Template-Dialoge ungetestet; i18n-Mock verschleiert fehlende Übersetzungen vollständig; Integration-Suite zu dünn (kein Reorg, kein Failover, kein Cold-Sync).
- 🟡 **Minor (3):** Mock-Setup macht Boot-Failures unprüfbar (`getMinterAddress` hardcoded), `/health/diag` ungetestet, V1-Test-File läuft ohne Mehrwert (~30 s CI-Zeit/Run).
- ⚪ **Nit (3):** Kein expliziter `tsc --noEmit`-Step, Lighthouse crawlt nur die Home-Page, `eslint --fix` im Pre-Commit ist destructive.

Plus: **dedizierte Cross-Reference-Tabelle** mit allen 84 Findings aus Bereich 1–7 ↔ Test-Lücke + Severity-Verstärker. Plus: priorisiertes **Test-Backlog** „fängt einen bekannten Bereich-X-Finding".

**Realistische HSBI-Coverage-Schwellen** (statt „aim for 100 %"):

| Package   | Statements | Branches | Functions | Lines | Begründung                                                  |
| --------- | ---------: | -------: | --------: | ----: | ----------------------------------------------------------- |
| Contracts |         95 |       90 |        95 |    95 | Frozen Code, 100 % Test-Pflicht für Custom-Errors           |
| Backend   |         75 |       70 |        75 |    75 | Realistisch für Express-Routes mit ~55 Routes               |
| Frontend  |         65 |       55 |        60 |    65 | hochzustellen von 40, einzige UI-Defense vor XSS-Regression |

Alle drei: `fail_ci_if_error: true` in Codecov, plus `vitest`/`hardhat`-Schwellen lokal hard. Aktuelle Lage ist „Reporting ohne Konsequenz" → siehe F8.1.

---

## Findings

### 🔴 F8.1 — Coverage-Schwellen sind nur im Frontend enforced; Backend + Contracts laufen als Codecov-Theatre

**Ort:**

- `packages/backend/vitest.config.ts:1–10` — kein `coverage`-Block
- `packages/contracts/package.json:15` — `hardhat coverage` ohne `.solcover.js`
- `.github/workflows/ci.yml:62–70, 129–138, 161–170` — alle drei Codecov-Uploads mit `fail_ci_if_error: false`
- `packages/frontend/vitest.config.ts:31–36` — einzige Schwellen, aber `40/35/30/40`
- Repo-Root: `codecov.yml` **existiert nicht**

**Code-Zitat:**

```yaml
# .github/workflows/ci.yml:62–70 (identisch in Backend + Frontend Job)
- name: Upload coverage to Codecov
  if: ${{ always() && env.CODECOV_TOKEN != '' }}
  uses: codecov/codecov-action@v5
  ...
  with:
    fail_ci_if_error: false
```

```typescript
// packages/frontend/vitest.config.ts:31–36
thresholds: {
  statements: 40,
  branches: 35,
  functions: 30,
  lines: 40,
},
```

**Konsequenz:** Coverage-Drop ist **per Konstruktion folgenlos**. Entwickler kann Tests löschen, Coverage fällt auf 20 %, CI bleibt grün. Codecov zeigt einen Trend-Pfeil nach unten in einem Dashboard, das niemand öffnet (kein Codecov-Comment-Bot konfiguriert, weil `CODECOV_TOKEN` für die HSBI-Realität wahrscheinlich nicht gesetzt ist — der ganze Step skipt mit `if: ... && env.CODECOV_TOKEN != ''`).

**Cluster-Effekt:** Alle anderen Bereich-8-Findings („XYZ ungetestet") werden durch F8.1 dauerhaft. Selbst wenn ein neuer Test geschrieben wird, kann er beim nächsten Refactor stillschweigend gelöscht werden.

**Repro-Szenario:**

1. Lokal: `pnpm --filter @vpp/backend test:coverage` → erzeugt Coverage-Report ohne Schwellen-Check.
2. Lösche `packages/backend/test/hmac.test.ts` (16 Tests).
3. Re-run `pnpm test:coverage` → grün, weil keine Schwelle definiert.
4. Push → CI grün (Codecov-Upload skippt oder `fail_ci_if_error: false`).
5. Bug in `hmac.ts` slipt durch → Production-Incident.

**Fix (HSBI-realistisch, ~30 min Aufwand):**

1. **Backend** `vitest.config.ts` erweitern:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'html'],
  reportsDirectory: './coverage',
  include: ['src/**/*.ts'],
  exclude: [
    'src/index.ts',           // Bootstrap
    'src/types/**',
    '**/*.d.ts',
  ],
  thresholds: {
    statements: 75,
    branches: 70,
    functions: 75,
    lines: 75,
    perFile: false,           // Aggregat-Schwelle, nicht pro Datei
  },
},
```

2. **Frontend** `vitest.config.ts:31–36` von `40/35/30/40` auf `65/55/60/65` ziehen (siehe F8.3 für Begründung). Nicht in einem Sprung — staged: erst auf 50, neue Tests schreiben, dann auf 65.

3. **Contracts** `.solcover.js` neu anlegen:

```javascript
module.exports = {
  skipFiles: ['SurveyPoints.sol'], // V1, frozen on mainnet, see F8.10
  istanbulReporter: ['text', 'lcov', 'html'],
  // Hardhat coverage hat keine native threshold-Option;
  // wir setzen einen Post-Step in CI:
}
```

und CI-Step ergänzen:

```yaml
# ci.yml unter "Check coverage" für Contracts
- name: Enforce coverage threshold
  working-directory: packages/contracts
  run: |
    node -e "
      const cov = require('./coverage/coverage-summary.json').total;
      const min = { statements: 95, branches: 90, functions: 95, lines: 95 };
      let ok = true;
      for (const k of Object.keys(min)) {
        if (cov[k].pct < min[k]) {
          console.error('FAIL: ' + k + ' = ' + cov[k].pct + '% < ' + min[k] + '%');
          ok = false;
        }
      }
      process.exit(ok ? 0 : 1);
    "
```

4. **Codecov** in allen drei Jobs auf `fail_ci_if_error: true`. Plus optional `codecov.yml` an Repo-Root mit Per-Component-Schwellen.

**2-Jahre-Begründung:** Ohne enforced Schwellen ist alles, was in diesem Audit-Bereich folgt, eine Empfehlung ohne Mechanismus. Mit ihnen wird jeder PR, der ungetesteten Code einführt, automatisch geblockt — der einzige Mechanismus, der über 2 Jahre und Maintainer-Wechsel überlebt.

---

### 🔴 F8.2 — Production-Rate-Limiter ist ungetestet (`rate-limit.test.ts` ist Theatre)

**Ort:**

- `packages/backend/test/rate-limit.test.ts:11–28` — testet eine **eigens erstellte** Express-App mit eigenem Limiter
- `packages/backend/src/index.ts` (Production-Limiter mit `skip: () => isTest`) — **nirgendwo getestet**

**Code-Zitat:**

```typescript
// packages/backend/test/rate-limit.test.ts:11–28
function createRateLimitedApp(max: number) {
  const app = express()
  app.use(
    rateLimit({
      windowMs: 60_000,
      max,
      ...
    }),
  )
  app.get('/test', (_req, res) => res.json({ ok: true }))
  return app
}

describe('rate limiting behaviour', () => {
  it('should return 429 when limit is exceeded', async () => {
    const app = createRateLimitedApp(2)
    ...
  })
})
```

**Konsequenz:** Der Test verifiziert, dass `express-rate-limit` als npm-Package funktioniert. Das tut es. Was er **nicht** verifiziert:

- ob die Production-App `app.use(rateLimit(...))` überhaupt aufruft
- ob das Window/Max-Setting für `/api/v1/claim` realistisch ist (z. B. 5/Minute vs. 100/Minute)
- ob `/api/v1/admin/*`-Endpunkte gegen Brute-Force-Sig-Validation geschützt sind (Bereich 6 F6.6)
- ob der Limiter Wallet- oder IP-basiert ist (entscheidend für Klassen-Run mit 30 Studis hinter einer NAT)

**Repro-Szenario:** Entferne `app.use(rateLimit(...))` komplett aus `index.ts`. Re-run alle Tests. **Alles grün.** Production: jeder kann `POST /api/v1/admin/login` mit 1000 Sigs/Sek brute-forcen.

**Cluster mit Bereich 6 F6.6:** Rate-Limiting wurde dort als ungetestet markiert. Confirmed.

**Fix:**

1. Lösche `rate-limit.test.ts` (Theatre, irreführend).
2. Schreibe einen neuen Integration-ähnlichen Test, der `createApp()` aus `server.js` verwendet und gegen den **echten** Limiter testet:

```typescript
// packages/backend/test/integration-rate-limit.test.ts (neu)
// Läuft im Vitest-Standard-Run, nicht im Integration-Run.
// Override NODE_ENV temporär, damit Limiter NICHT skipt.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

describe('production rate limiter — real wiring', () => {
  let app: Express
  const originalEnv = process.env.NODE_ENV

  beforeAll(async () => {
    process.env.NODE_ENV = 'production' // skip:false
    // Re-import after env change so isTest evaluates falsely
    const mod = await import('../src/server.js?reload=' + Date.now())
    app = mod.createApp()
  })

  afterAll(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('blocks 6th /claim within 1 minute from same IP', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/claim').send({})
      expect([400, 401]).toContain(res.status) // limiter doesn't fire
    }
    const blocked = await request(app).post('/api/v1/claim').send({})
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toBe('RATE_LIMITED')
  })

  it('limits /admin/login to 10/min for brute-force protection', async () => {
    // Same pattern
  })
})
```

3. Dokumentiere in `docs/runbooks/incident-response.md` (Bereich 7) den Pfad „429 storm = Klassen-Run hinter NAT" mit Workaround (kurz Limiter erhöhen via Plesk Env, z. B. `RATE_LIMIT_MAX=200`).

**2-Jahre-Begründung:** Ein Klassen-Run mit 30 Studis hinter einer HSBI-NAT-IP wird je nach `max`-Wert legitim als „Brute-Force" eingestuft → mehrere Studis kriegen 429, Hirschfeld-E-Mail-Storm. Ein realer Test fängt das vor der Lehrveranstaltung.

---

### 🔴 F8.3 — Kritische Code-Pfade aus Bereich 2/3/4/6 sind komplett ungetestet (Mock-Maskierung)

**Ort:** Konkrete Liste, alle aus Audit-Vorarbeit als „ungetestet = Severity-Verstärker" markiert:

| Source-File                         | Funktion                    | Bereich-X-Finding                                                  | Test-Datei für `vi.fn()`-Mock  | Echter Unit-Test? |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------ | ------------------------------ | ----------------- |
| `services/blockchain.ts`            | `queryFilterChunked`        | F3.4 (off-by-one)                                                  | `test/setup.ts:50`             | ❌                |
| `services/blockchain.ts`            | `getEffectiveRpcUrls`       | F3.2 (Reihenfolge)                                                 | n/a                            | ❌                |
| `services/blockchain.ts`            | `isAlchemyFreeUrl`          | F3.3 (Heuristik bricht)                                            | n/a                            | ❌                |
| `services/blockchain.ts`            | `withRpcRetry`              | F3.5 (endless loop)                                                | n/a                            | ❌                |
| `services/blockchain.ts`            | `assertSufficientBalance`   | F2.4 (Balance-Race)                                                | n/a                            | ❌                |
| `services/blockchain.ts`            | NonceManager                | F2.3 (`nonce too low`)                                             | n/a                            | ❌                |
| `services/json-file-event-store.ts` | komplett                    | F4.4 (Reorg), F4.5 (corrupt JSON), F4.6 (`lastSyncedBlock>latest`) | `test/setup.ts:73` (factory)   | ❌                |
| `services/admin-labels.ts`          | atomic write                | F4.1 (atomic-rename)                                               | `test/setup.ts:81` (in-memory) | ❌                |
| `config.ts`                         | Boot-Validation             | F2.7 (key-format), Bereich 3 H3.7 (RPC-URL-Validation)             | n/a                            | ❌                |
| `middleware/auth.ts`                | 5-min-Window, isAdmin-Cache | F6.1 (Replay-Window), F6.5 (RPC-Failure-Lockout)                   | nur indirekt via Routes        | ❌                |
| `routes/health.ts`                  | `/health/diag`              | Bereich 7 F7.1 (Monitoring)                                        | n/a                            | ❌                |

**Code-Zitat (Beispiel: Mock maskiert Boot-Failure):**

```typescript
// packages/backend/test/setup.ts:39
getMinterAddress: vi.fn(() => '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
```

Das ist ein hardcoded Hardhat-Account-0. Wenn die echte `getMinterAddress()` bei fehlendem `MINTER_PRIVATE_KEY` (Bereich 2 F2.7) `null` returnt oder crasht, **schlägt kein einziger Test fehl** — das Mock liefert immer eine valide Adresse.

**Konsequenz:** Die 11 oben aufgelisteten Funktionen tragen zusammen die kritischsten Risiken des Systems (Replay-Schutz, Wallet-Submission, Reorg-Robustheit, Boot-Validation). Sie sind in `setup.ts` durch `vi.fn()`-Stubs **nicht nur ungetestet, sondern systematisch unprüfbar gemacht**. Die Mock-Hygiene ist invertiert: statt enge Stubs zu setzen und reale Pfade zu testen, sind die kritischsten Pfade pauschal weggemockt.

**Repro-Szenario (für `queryFilterChunked` Off-by-one, F3.4):**

```typescript
// packages/backend/test/blockchain-helpers.test.ts (NEU, schreiben für F8.3)
import { queryFilterChunked } from '../src/services/blockchain.js'

describe('queryFilterChunked off-by-one', () => {
  it('does not skip blocks at chunk boundaries', async () => {
    const calls: Array<[number, number]> = []
    const fakeQuery = (filter: unknown, from: number, to: number) => {
      calls.push([from, to])
      return Promise.resolve([])
    }
    const fakeContract = { queryFilter: fakeQuery, filters: { foo: () => 'foo' } }
    await queryFilterChunked(fakeContract as any, 'foo' as any, 100, 18100, 9000)
    // Hypothesis: ranges should be [100..9099], [9100..18099], [18100..18100]
    // OR [100..9100], [9101..18100] — what does the code actually do?
    // Verify: union covers exactly [100..18100], no overlap, no gap
    const covered = new Set<number>()
    for (const [from, to] of calls) {
      for (let b = from; b <= to; b++) {
        if (covered.has(b)) {
          throw new Error(`Block ${b} queried twice (chunks overlap)`)
        }
        covered.add(b)
      }
    }
    for (let b = 100; b <= 18100; b++) {
      if (!covered.has(b)) {
        throw new Error(`Block ${b} not queried (chunks have gap)`)
      }
    }
  })
})
```

**Fix:** 11 dedizierte Test-Files schreiben (siehe Test-Backlog am Ende dieses Dokuments). Geschätzter Aufwand: **3–4 Personentage** für alle 11 zusammen.

**2-Jahre-Begründung:** Jeder dieser Pfade wurde von einem Vor-Bereich-Auditor explizit als „Risiko mit ungetesteter Konsequenz" markiert. Das ist die definitive Bug-Bait-Liste für die nächsten 2 Jahre. Wenn auch nur einer dieser Pfade in Production failt, ist die Konsequenz: Replay-Schutz weg / Survey-Keys weg / Boot-Crash mit Klartext-Log / Klassen-Run dead.

---

### 🟠 F8.4 — Frontend-Coverage `40/35/30/40` ist Production-untauglich; AdminPage-Sign-Flows ungetestet

**Ort:**

- `packages/frontend/vitest.config.ts:31–36` — Schwellen `40/35/30/40`
- `packages/frontend/test/routing.test.tsx` — 9 Pages getestet **nur als „rendert"**
- `packages/frontend/test/claim.test.tsx:218 Zeilen, 8 Tests` — **einziger** echter User-Flow-Test
- Komplett ungetestet: `pages/admin.tsx`, alle Admin-Komponenten unter `components/admin/*`, `pages/points.tsx` (echte Flows), `components/wallet/*`

**Konsequenz:** Die AdminPage ist die XSS-Schadens-Maximierungsfläche (Bereich 5: Admin-Labels werden im Backend gerendert, Survey-Titles werden überall gerendert). Sie ist **nicht** durch Tests abgesichert. Eine Refactor-Welle, die versehentlich `dangerouslySetInnerHTML` in eine Admin-Komponente einführt, würde keinen Test brechen.

**Sub-Lücken:**

1. **Wallet-Connect → Claim → Points-Flow** als End-to-End-Test fehlt. Heute: drei separate Tests in drei Dateien, alle gemockt. Ein Studi, der durch den ganzen Flow geht, wird **nirgendwo simuliert**.

2. **RoleManagement-Komponente** (Add-Admin, Remove-Admin) — UI-Pfade für Sig-Flow, Bestätigungs-Dialog, Error-Toasts: **0 Tests**.

3. **TemplateDownloadDialog + RegenerateTemplateDialog** — kürzlich umgebaut (Audit-Plan-Vorarbeit erwähnt: HMAC-Texte entfernt), keine Regression-Tests.

4. **AdminLabelDialog** — Bereich 5 (XSS) markierte Admin-Labels als Render-Pfad. UI-Test: 0.

5. **PointsPage** — nur „rendert" (`routing.test.tsx:130`), kein Test für den echten Refresh-Flow, Loading-State, Error-State.

**Repro-Szenario:**

1. Refactor `pages/admin.tsx` so, dass `<div dangerouslySetInnerHTML={{ __html: adminLabel }} />` für eine Tooltip-Erweiterung eingeführt wird.
2. Re-run alle Frontend-Tests.
3. **Alles grün** (kein Test prüft `pages/admin.tsx` über Render-Smoke hinaus).
4. Bösartiger Admin setzt sein Label auf `<img src=x onerror=alert(document.cookie)>` → XSS bei jedem Admin, der die Liste ansieht.

**Fix:**

1. **Coverage-Schwellen** staged hochziehen:
   - Sprint 1: `vitest.config.ts` → `45/40/40/45`, neue Tests schreiben für AdminPage Sign-Flows + RoleManagement (~1 Personentag).
   - Sprint 2: `55/50/50/55`, weitere Tests für Template-Dialoge + AdminLabelDialog.
   - Sprint 3: `65/55/60/65` (Ziel-Schwelle).

2. **End-to-End-Test** als neue Datei `packages/frontend/test/e2e-claim-flow.test.tsx`:

```tsx
// Simuliert den ganzen User-Flow: keine Wallet → create → /claim?s=1&n=...&t=... → submit → success → /points
describe('e2e: claim flow', () => {
  it('completes from no-wallet state to seeing the +2 points on /points', async () => {
    // ... mock useApi.claimPoints + useApi.getPointsData
    // ... navigate via MemoryRouter
    // ... assert sequence: HomePage → /claim shows "create wallet" → click → "submit" → success toast → /points shows 2
  })
})
```

3. **Empfehlung Playwright/Cypress nicht** für die HSBI-Realität — zu aufwändig zu warten, kein dedizierter QA. Vitest+RTL+MemoryRouter reicht für den User-Flow auf Komponenten-Ebene.

**2-Jahre-Begründung:** AdminPage hat den höchsten Schadens-Hebel (Bereich 5: 1 erfolgreicher XSS × Admin-Sessions). Frontend-Coverage von 40 % heißt: 60 % der UI ist reine Render-Smoke. Die nächsten 2 Jahre werden mehrere UI-Refactors und Komponenten-Updates haben. Ohne Sign-Flow- und XSS-Regression-Tests werden Bugs spät bemerkt — frühestens beim ersten Klassen-Run.

---

### 🟠 F8.5 — i18n-Mock verschleiert fehlende Übersetzungen vollständig (Tests können sie nicht detektieren)

**Ort:**

- `packages/frontend/test/routing.test.tsx:6–16` und `claim.test.tsx` etc. mocken `useTranslation` mit `t: (key) => key`
- `packages/frontend/src/locales/{de,en}.json` + `docs-{de,en}.json` — keine parallel-Key-Validation

**Code-Zitat:**

```tsx
// packages/frontend/test/routing.test.tsx:6–16
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { returnObjects?: boolean }) => {
      if (opts?.returnObjects) return []
      return key                              // <-- IDENTITY FUNCTION
    },
    ...
  }),
  Trans: ({ children }) => children,
}))
```

**Konsequenz:** In jedem Frontend-Test rendert `t('claim.error.alreadyClaimed')` als String `"claim.error.alreadyClaimed"`. Tests prüfen mit `screen.getByText('claim.error.alreadyClaimed')`, dass dieser Key-String in der DOM-Tree erscheint. **Beide Seiten der Assertion sind identisch dem Mock-Output** — der Test prüft nichts über Übersetzungen.

In Production passiert genau dasselbe wenn der Key in `de.json` fehlt: i18next gibt den Key-String zurück. Der Studi sieht `"claim.error.alreadyClaimed"` auf seinem Bildschirm.

**Repro-Szenario:**

1. Lösche den Schlüssel `claim.error.alreadyClaimed` aus `packages/frontend/src/locales/de.json`.
2. Re-run alle Tests. **Alles grün.**
3. Push, Production-Build.
4. Studi versucht zu claimen, hat schon, sieht Toast: `claim.error.alreadyClaimed` (Key-String, nicht Übersetzung) → User-Verwirrung, Hirschfeld-E-Mail.

**Fix:**

1. **Neuer Test-File** `packages/frontend/test/i18n.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import de from '@/locales/de.json'
import en from '@/locales/en.json'
import docsDe from '@/locales/docs-de.json'
import docsEn from '@/locales/docs-en.json'

function flatKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  )
}

describe('i18n parity', () => {
  it('de.json and en.json have identical key trees', () => {
    const deKeys = new Set(flatKeys(de))
    const enKeys = new Set(flatKeys(en))
    const onlyDe = [...deKeys].filter((k) => !enKeys.has(k))
    const onlyEn = [...enKeys].filter((k) => !deKeys.has(k))
    expect(onlyDe).toEqual([])
    expect(onlyEn).toEqual([])
  })

  it('docs-de.json and docs-en.json have identical key trees', () => {
    // same pattern
  })
})
```

2. **Plus** ein Code-Scanner-Test, der Source-Code grept und prüft ob alle `t('foo.bar')`-Aufrufe in `de.json` existieren:

```typescript
// packages/frontend/test/i18n-coverage.test.ts (NEU)
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import de from '@/locales/de.json'

describe('i18n coverage in source', () => {
  it('every t("...") call in src/ has a matching de.json key', () => {
    const grep = execSync(`grep -rEho "t\\(['\\"][a-zA-Z][a-zA-Z0-9._]+['\\"]" src/ || true`, {
      cwd: __dirname + '/..',
      encoding: 'utf-8',
    })
    const usedKeys = new Set(
      grep
        .split('\n')
        .map((l) => l.match(/['\"]([\w.]+)['\"]/)?.[1])
        .filter(Boolean) as string[],
    )

    const deKeys = new Set(flatKeys(de))
    const orphans = [...usedKeys].filter((k) => !deKeys.has(k))

    // Tolerate prefix usage like t(`status.${type}`) — those won't be exact-matched
    const realOrphans = orphans.filter((k) => !k.includes('${'))
    expect(realOrphans).toEqual([])
  })
})
```

(Optional: alternativ `i18next-parser` als Build-Step.)

3. **Bonus:** Git-Pre-Commit-Hook der bei Änderungen an `locales/de.json` automatisch parallele Änderung an `en.json` verlangt (über `lint-staged`-Custom-Step).

**2-Jahre-Begründung:** Bei jeder Code-Änderung kommt die Wahrscheinlichkeit für ein „neuer Toast-Text vergessen in en.json" dazu. Über 2 Jahre summiert sich das auf >50 fehlende Übersetzungen, alle in Tests grün. Das ist genau die UX-Erosion, die ein 2-Jahre-Hochschul-Tool verbietet.

---

### 🟠 F8.6 — Integration-Test-Suite zu dünn (kein Reorg, kein Failover, kein Cold-Sync)

**Ort:** `packages/backend/test/integration/hardhat.test.ts` — 200 Zeilen, 8 Tests, alle Happy-Path + 1× Replay.

**Was getestet wird:**

- `/health/live`, `/health/ready` (gegen lokal Hardhat)
- Survey-Listing (seeded surveys)
- Survey-Register + HMAC-Token-Issuance + Claim
- Replay-Schutz (NONCE_USED bei Wiederholung)
- `/api/v1/points/:wallet` Cumulative
- `/api/v1/status` mit Admin-Auth

**Was komplett fehlt:**

1. **Reorg-Robustheit** (Bereich 4 H4.4 → F8.6.a-T)
   - Hardhat unterstützt `evm_revert` + `evm_snapshot`. Test schreiben:

```typescript
it('survives a 2-block reorg without duplicating PointsAwarded', async () => {
  const snapshot = await provider.send('evm_snapshot', [])
  // Awarded points → events.json updated
  await contract.connect(minter).awardPoints(student.address, 100)
  await provider.send('evm_revert', [snapshot]) // reorg
  await provider.send('evm_mine', []) // alternative chain
  await contract.connect(minter).awardPoints(student.address, 100)
  // After reorg, JsonFileEventStore should reconcile, not duplicate
  const events = await store.getPointsAwardedByWallet(student.address)
  expect(events.length).toBe(1)
})
```

2. **RPC-Failover** (Bereich 3 H3.5 → F8.6.b-T)
   - Mock-FallbackProvider mit 2 Endpoints, einer wirft 5xx → assert 2. übernimmt + assert kein endless retry-loop.

3. **Cold-Sync from Block 0** (Bereich 7 OPS6 → F8.6.c-T)
   - Backend-Boot mit leerem `events.json` gegen frische Hardhat-Chain mit 100 vorgenerierten Events. Assert: Sync vollendet in <30 s, alle Events korrekt deserialisiert, `lastSyncedBlock` korrekt.

4. **`nonce too low` Race** (Bereich 2 H2.3 → F8.6.d-T)
   - Backend führt 5 parallele `awardPoints` aus, eine kriegt `nonce too low` (manuell injiziert). Assert: Backend retried automatisch, kein Studi sieht Fehler, Final-State korrekt.

5. **Wallet-Submission-Flow** (`isWalletSubmitted` / `markWalletSubmitted`) — nicht im Integration-Test.

**Fix:** Schritt-für-Schritt 5 neue `it`-Blöcke ergänzen (~1 Personentag). Plus optional: Integration-Suite splittenin `integration/contract.test.ts` (was da ist) + `integration/reorg.test.ts` + `integration/failover.test.ts` + `integration/cold-sync.test.ts`. Erlaubt parallele Ausführung in CI.

**Repro-Szenario für F8.6.a (Reorg):**

1. Hardhat-Node starten, `awardPoints` ausführen, Backend syncht Event in `events.json`.
2. `evm_snapshot` + `evm_revert` simulieren 2-Block-Reorg.
3. Re-`awardPoints` mit selben Parametern auf neuer Chain.
4. **Heute:** Backend hat zwei Einträge im `events.json` (Original + neuer), `getTotalPoints` returnt 4 statt 2.

**2-Jahre-Begründung:** Base hat in 2 Jahren mehrere Reorgs, mehrere RPC-Outages, mindestens einen Plesk-Server-Tausch (Cold-Sync). Jedes Szenario, das nicht vor dem Klassen-Run getestet ist, ist ein Sonntag-23-Uhr-Incident.

---

### 🟡 F8.7 — Mock-Setup macht Boot-Failures unprüfbar (`getMinterAddress` hardcoded, `getContractAddress` hardcoded)

**Ort:** `packages/backend/test/setup.ts:39, 43, 44, 51`

**Code-Zitat:**

```typescript
// packages/backend/test/setup.ts:39–51
getMinterAddress: vi.fn(() => '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
getMinterBalance: vi.fn(),
getBlockNumber: vi.fn(),
getNetwork: vi.fn(),
getContractAddress: vi.fn(() => '0x5FbDB2315678afecb367f032d93F642f64180aa3'),
getContractVersion: vi.fn(() => Promise.resolve('2.0.0')),
provider: {
  getFeeData: vi.fn(() => Promise.resolve({ gasPrice: 1000000n })),
},
contract: {},
readOnlyContract: {},
queryFilterChunked: vi.fn(),
validateChainId: vi.fn(() => Promise.resolve()),
```

**Konsequenz:**

- **Boot-Validation ungetestet** (Bereich 2 F2.7): wenn `MINTER_PRIVATE_KEY` fehlt, sollte Backend mit klarer Fehlermeldung crashen. Aktuelle Tests können das nicht verifizieren, weil `getMinterAddress` immer eine valide Adresse returnt.

- **Falsche Adress-Annahme propagiert:** `admin.test.ts:17` referenziert `MINTER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'`. Das ist nicht der echte Production-Minter, sondern Hardhat-Account-0. Wenn `getMinterAddress()` in Production aufgrund Config-Bug einen anderen Wert returnt, fängt kein Test es. Die F2.6-Logging-Hygiene-Tests können nicht prüfen ob die wahre Adresse je geloggt wird.

- **Gas-Estimation hardcoded auf `1000000n`** Wei. Status-Test (`status.test.ts:32`) rechnet damit `gasPrice * 55_000n * 200n`. Bereich 2 F2.4 (fehlende `maxFeePerGas`-Strategie für Base-Spikes) ist **unprüfbar** weil nie eine echte ethers-Provider-Antwort getestet wird.

- **`contract: {}` und `readOnlyContract: {}`** — jeder Test der versucht `contract.someMethod()` zu callen würde sofort crashen. Nichts tut das, weil alle Routes ihre Methoden über die exportierten Helfer aufrufen, die wiederum gemockt sind. Aber: jeder zukünftige Refactor, der direkt auf `contract.foo()` zugreift, wird in Tests unbemerkt crashen.

**Fix:**

1. **Reduzierte Mock-Surface** in `setup.ts` — nur die Methoden mocken, die jeder Test braucht. Pro-Test-Override für spezielle Szenarien.

2. **Neuer Test-File** `packages/backend/test/config-boot.test.ts`:

```typescript
// Importiert config.ts in einer fresh Modul-Sandbox mit verschiedenen ENV-Setups
import { describe, expect, it } from 'vitest'

describe('config boot validation', () => {
  it('crashes with clear message when MINTER_PRIVATE_KEY is missing', async () => {
    const oldKey = process.env.MINTER_PRIVATE_KEY
    delete process.env.MINTER_PRIVATE_KEY
    try {
      await expect(import('../src/config.js?reload=' + Date.now())).rejects.toThrow(
        /MINTER_PRIVATE_KEY/,
      )
    } finally {
      process.env.MINTER_PRIVATE_KEY = oldKey
    }
  })

  it('crashes when MINTER_PRIVATE_KEY has invalid hex format', async () => {
    process.env.MINTER_PRIVATE_KEY = 'not-a-hex-key'
    await expect(import('../src/config.js?reload=' + Date.now())).rejects.toThrow(/invalid/i)
  })

  it('crashes when CONTRACT_ADDRESS is malformed', async () => {
    // ... same pattern
  })
})
```

3. **`provider.getFeeData`-Mock** in einen Helper extrahieren mit Default + Override-Variante:

```typescript
// test/setup.ts (refactored)
export function mockGasPrice(gasPriceGwei: number) {
  vi.mocked(blockchain.provider.getFeeData).mockResolvedValueOnce({
    gasPrice: BigInt(gasPriceGwei) * 1_000_000_000n,
  } as ethers.FeeData)
}

// status.test.ts könnte dann mockGasPrice(50) für realistische Mainnet-Werte aufrufen
```

**2-Jahre-Begründung:** Boot-Failures sind die häufigste Production-Incident-Klasse (vergessenes ENV nach Plesk-Migration, falsche Key-Formatierung). Wenn Tests sie nicht fangen, fängt Hirschfeld sie um 23 Uhr.

---

### 🟡 F8.8 — `/health/diag` ist ungetestet (Monitoring-relevant aus Bereich 7)

**Ort:**

- `packages/backend/src/routes/health.ts` — enthält `/health/diag`-Endpoint mit RPC-Probes
- `packages/backend/test/health.test.ts` — testet nur `/health`, `/health/live`, `/health/ready`

**Konsequenz:** Bereich 7 F7.1 (Monitoring) empfiehlt UptimeRobot/Healthchecks.io gegen `/health/diag`. Wenn der Endpoint je broken ist (z. B. nach RPC-Refactor), merkt es das Monitoring **eher** als die Tests. Reverse, wie es sein sollte.

**Fix:** 3 zusätzliche Tests in `health.test.ts`:

```typescript
describe('GET /api/v1/health/diag', () => {
  it('returns RPC probe results for all configured endpoints', async () => {
    // Mock multiple probe responses
    const res = await request(app).get('/api/v1/health/diag')
    expect(res.status).toBe(200)
    expect(res.body.rpcProbes).toBeInstanceOf(Array)
    expect(res.body.rpcProbes.length).toBeGreaterThanOrEqual(2)
    expect(res.body.minterBalance).toBeDefined()
  })

  it('marks an unreachable RPC endpoint as failed', async () => {
    // Mock one probe rejecting
    // assert: response status still 200, but probe[i].ok === false
  })

  it('flags low minter balance prominently', async () => {
    vi.mocked(blockchain.getMinterBalance).mockResolvedValue(1n) // basically nothing
    const res = await request(app).get('/api/v1/health/diag')
    expect(res.body.warnings).toContain('LOW_BALANCE')
  })
})
```

**2-Jahre-Begründung:** UptimeRobot wird auf `/health/diag` zeigen. Wenn der Endpoint nach Refactor 500 returnt, springt UptimeRobot an, Hirschfeld bekommt Mail — aber CI war grün. Test deckt die Schnittstelle, die fast jede Operations-Tool-Integration nutzt.

---

### 🟡 F8.9 — V1-Test-File (`SurveyPoints.test.ts`, 563 Zeilen, ~50 Tests) läuft ohne Mehrwert

**Ort:** `packages/contracts/test/SurveyPoints.test.ts`

**Konsequenz:** V1-Contract ist auf Mainnet als gefrorene Implementierung obsolet (siehe Bereich 1 V1→V2-Cutover). Die V1-Tests laufen bei jedem CI-Run mit (~30 s zusätzliche Compile + Test-Zeit). Über 2 Jahre und schätzungsweise 200 PRs sind das ~100 Min CI-Wartezeit, die nichts validiert. Plus: Fehler in V1-Contract-Refactor (extrem unwahrscheinlich, aber theoretisch) werden gefangen — das ist der einzige Mehrwert.

**Fix-Optionen:**

1. **Empfohlen:** V1-Tests in einen separaten `test/legacy/`-Ordner verschieben und nur on-demand laufen lassen:

```typescript
// packages/contracts/hardhat.config.ts
mocha: {
  // V1 tests are kept for archive/regression-on-demand. Run with:
  //   pnpm test:legacy
  ignore: process.env.RUN_LEGACY ? [] : ['test/legacy/**'],
}
```

2. **Alternativ:** V1-Tests komplett löschen mit Hinweis im Commit `[archive] remove SurveyPoints V1 tests after Mainnet cutover, see git history at <commit>`.

3. **Nicht-Fix:** drinlassen — über 2 Jahre 100 Min CI-Zeit ist verschmerzbar, falls jemand emotionale Bindung zum V1-Code hat.

**2-Jahre-Begründung:** Wartung von obsoletem Code ist Tech-Debt. Hirschfeld in 18 Monaten weiß nicht, ob V1-Tests irgendeine Bedeutung haben — er traut sich nicht sie zu löschen, weil kein Marker im Repo. Klare Kennzeichnung („legacy, frozen") spart kognitive Last.

---

### ⚪ F8.10 — Kein expliziter `tsc --noEmit`-Step in CI (TypeScript-Check kommt nur indirekt durchs Build)

**Ort:** `.github/workflows/ci.yml:91, 156` — `pnpm --filter @vpp/backend run build` und `pnpm --filter @vpp/frontend run build`

**Konsequenz:** Wenn `tsconfig.json` mal `noEmit: false` hat oder ein `build`-Script die TypeScript-Strictness lockert (z. B. `tsc --skipLibCheck`), kann ein Type-Bug durchschlüpfen. Heutige Lage ist OK weil Vite und tsc-build beide strict laufen, aber kein expliziter Schutz.

**Fix:** Eigenen CI-Step ergänzen (im `lint`-Job, neben `format:check` und `lint`):

```yaml
- name: TypeScript check (no emit)
  run: |
    pnpm --filter @vpp/backend exec tsc --noEmit
    pnpm --filter @vpp/frontend exec tsc --noEmit
    pnpm --filter @vpp/contracts exec tsc --noEmit
```

**2-Jahre-Begründung:** ~30 s pro CI-Run, fängt jede `any`-Erosion oder vergessene Type-Guard. Kostet 0 Wartung.

---

### ⚪ F8.11 — Lighthouse CI crawlt nur die Home-Page

**Ort:** `.lighthouserc.json:5` — `"url": ["/"]`

**Konsequenz:** Accessibility-Score 0.9 wird nur für die statische Landing-Page validiert. ClaimPage, AdminPage, PointsPage, Imprint/Privacy: nicht geprüft. Bereich 5 (XSS) und Bereich 6 (Auth-UI) profitieren nicht von Lighthouse.

**Fix:**

```json
// .lighthouserc.json
"url": [
  "/",
  "/claim?s=1&n=AAAAAAAAAAAAAAAA&t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "/points",
  "/admin",
  "/datenschutz",
  "/impressum"
]
```

Plus: `numberOfRuns` von 3 auf 1 reduzieren falls CI-Zeit eng wird (6 URLs × 3 Runs = 18 Lighthouse-Runs, momentan 3).

**2-Jahre-Begründung:** Das HSBI-BITV-Audit (Barrierefreiheit) prüft alle nutzerseitigen Pages, nicht nur Landing. Lighthouse-Erweiterung kostet 0 Aufwand und liefert konkrete BITV-Vor-Validation.

---

### ⚪ F8.12 — `eslint --fix` im Pre-Commit ist destructive

**Ort:** `package.json:36–40`

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx}": [
    "prettier --write",
    "eslint --fix"
  ],
}
```

**Konsequenz:** `eslint --fix` kann automatisch Code-Stil ändern, der über reine Whitespace-Fixes hinausgeht (z. B. `prefer-const`, `no-unused-vars`-Auto-Removal, Import-Sortierung). Das committed sich in den Pre-Commit-Hook, ohne dass der Author es explizit reviewed. In Edge-Cases kann `--fix` Code semantisch ändern (sehr selten, aber möglich bei `no-implicit-globals`-Style-Rules).

**Fix:** Statt `--fix` nur Errors ohne Auto-Fix anzeigen:

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx}": [
    "prettier --write",
    "eslint --max-warnings=0"
  ],
}
```

Oder `eslint --fix` nur für Auto-Fix-sichere Rules whitelisten. Für HSBI-Realität ist die einfache Variante (Lint-Errors anzeigen, Author muss selbst fixen) klarer.

**2-Jahre-Begründung:** Niedrige Wahrscheinlichkeit, aber falls passiert, debuggt Hirschfeld 1 h einen Bug, der vom Pre-Commit-Hook eingeführt wurde. Sehr verwirrend.

---

## Cross-Reference-Tabelle: Findings F1–F7 ↔ Test-Lücken

Diese Tabelle ist der Hauptoutput dieses Bereichs. Spalten:

- **Finding:** ID aus Vor-Bereichen.
- **Severity:** original.
- **Test, der es fangen würde:** konkrete Test-Beschreibung.
- **Existiert?:** ✅/❌/⚠️.
- **Severity-Verstärker:** ist „ungetestet" der Hauptgrund warum es ein Risk ist?

### Bereich 1 — Smart Contract V2

| Finding                                                              | Sev | Test, der es fangen würde                                                                                                   | Existiert?     | Verstärker                                                   |
| -------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| F1.1 ADMIN_ROLE-Manager-Konstruktion (`_setRoleAdmin(ADMIN, ADMIN)`) | 🟠  | Test: DEFAULT_ADMIN versucht `revokeRole(ADMIN_ROLE, x)` → revert mit `AccessControl: account is missing role <ADMIN_ROLE>` | ❌             | Ja — Bereich 1 markierte das als „nicht-testbar im V2-Suite" |
| F1.5 ADR fehlt für Recovery-Modell                                   | 🟠  | n/a (Doku-Finding)                                                                                                          | n/a            | Nein                                                         |
| F1-V2-Tests Custom-Errors                                            | n/a | Alle 13 Custom Errors via `revertedWithCustomError`                                                                         | ✅ Vollständig | Nein                                                         |
| F1-UUPS-Upgrade-Self-Lockout                                         | n/a | Test: `revokeRole(DEFAULT_ADMIN_ROLE, self)` → assert: kein Upgrade mehr möglich                                            | ❌             | Major-Lücke                                                  |

### Bereich 2 — Backend Key Management & Minter

| Finding                                 | Sev | Test, der es fangen würde                                                                                              | Existiert? | Verstärker                                        |
| --------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- |
| F2.1 `probe.mjs` mit Live-Key           | 🔴  | CI-Step: `git ls-files -o --exclude-standard \| xargs grep -lE '^0x[a-fA-F0-9]{64}$' \|\| true` failed wenn was findet | ❌         | Ja — Bereich 2-Empfehlung                         |
| F2.2 Recovery-Plan fehlt                | 🔴  | n/a (Doku, jetzt in `runbooks/key-rotation.md`)                                                                        | n/a        | Nein                                              |
| F2.3 NonceManager `nonce too low`       | 🟠  | Test: 5 parallel awardPoints → 1 erhält nonce too low → Backend retried → alle erfolgreich                             | ❌         | Ja                                                |
| F2.4 Gas-Strategie + Balance-Race       | 🟠  | Test: gasPrice spike (mock returnt 100 Gwei) → assert maxFeePerGas-Cap greift                                          | ❌         | Ja                                                |
| F2.5 Logger-Redact (PII/Key)            | 🟠  | Test: log call mit `{ minterKey: '0xabc...' }` → assert log line enthält `[Redacted]` statt key                        | ❌         | Ja                                                |
| F2.6 docs/security.md 8-fach Lüge       | 🟠  | n/a (Doku)                                                                                                             | n/a        | Nein                                              |
| F2.7 Boot-Validation MINTER_PRIVATE_KEY | 🟠  | Test in `config-boot.test.ts` (siehe F8.7-Fix)                                                                         | ❌         | Ja — F8.7                                         |
| F2.8 Error-Mapping `INSUFFICIENT_FUNDS` | 🟡  | ✅ in `error-handler.test.ts:173–189`                                                                                  | ✅         | Nein                                              |
| F2.9 ETH-Refill-Plan                    | 🟡  | n/a (Doku, jetzt in `runbooks/eth-refill.md`)                                                                          | n/a        | Nein                                              |
| F2.10 .env-Datei-Option                 | 🟡  | Test: `app.js` startet mit `.env`-Datei → assert: process.exit(1) mit klarer Meldung                                   | ❌         | Ja — Bereich 7 F7.6 hat den Code, aber Test fehlt |
| OD-2.A Minter ADMIN_ROLE                | OD  | n/a                                                                                                                    | n/a        | Nein                                              |
| OD-2.B Plaintext Minter-Key             | OD  | n/a                                                                                                                    | n/a        | Nein                                              |

### Bereich 3 — RPC & Connectivity

| Finding                                     | Sev | Test, der es fangen würde                                                                                              | Existiert? | Verstärker                                 |
| ------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| F3.1 FallbackProvider-Settings inkonsistent | 🟠  | Test: `buildReadProvider` vs `buildWriteProvider` → assert beide haben `quorum:1, batchMaxCount:1`                     | ❌         | Ja                                         |
| F3.2 RPC-URL-Reihenfolge                    | 🟡  | Test: `getEffectiveRpcUrls` mit verschiedenen ENV → assert sorted nach Health                                          | ❌         | Ja                                         |
| F3.3 Alchemy-Heuristik bricht               | 🟡  | Test: `isAlchemyFreeUrl('https://base-mainnet.g.alchemy.com/v2/<key>')` → true; `https://eth.alchemyapi.io/...` → true | ❌         | Ja                                         |
| F3.4 `queryFilterChunked` off-by-one        | 🟠  | Test: chunk-coverage union/no-overlap (siehe F8.3-Repro)                                                               | ❌         | Ja — Bereich 3 markierte als Hauptverdacht |
| F3.5 RPCs alle 429 = endless loop           | 🟠  | Test: alle Provider werfen 429 → `withRpcRetry` bricht nach N Retries mit klarem Error                                 | ❌         | Ja                                         |
| F3.6 Stale-Block-Detection                  | 🟡  | Test: Provider returnt Block 30 hinter latest → FallbackProvider switched                                              | ❌         | Ja                                         |
| F3.7 RPC-URL-Validation beim Boot           | 🟡  | Test in `config-boot.test.ts`: tippfehlerhafte RPC-URL → fail-fast                                                     | ❌         | Ja                                         |

### Bereich 4 — Stateful Stores & Data Integrity

| Finding                            | Sev | Test, der es fangen würde                                                                                      | Existiert? | Verstärker                         |
| ---------------------------------- | --- | -------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- |
| F4.1 Atomic-Write tmp+rename       | 🟠  | ✅ teilweise (`survey-keys.test.ts:98`) — aber **nicht** für `admin-labels`, `events.json`, `used-nonces.json` | ⚠️         | Ja für 3 von 4 Stores              |
| F4.2 Multi-Worker File-Korruption  | 🔴  | Test: 2 Node-Prozesse parallel `markUsed(1, 'x')` → assert nur einer erfolgreich, andere kriegt Lock-Wait      | ❌         | Ja — Bereich 4 Hauptrisiko         |
| F4.3 used-nonces wächst unbegrenzt | 🟡  | Test: 5000 markUsed → assert lookup-time < 50ms                                                                | ❌         | Nein (Performance-Test, nicht Bug) |
| F4.4 Reorg-Robustheit events.json  | 🟠  | Integration-Test mit `evm_revert` (siehe F8.6.a)                                                               | ❌         | Ja                                 |
| F4.5 JSON.parse-Failure beim Boot  | 🟠  | ✅ teilweise (`nonce-store.test.ts:65–70` korrupt JSON → throw) — fehlt für `events.json`, `admin-labels.json` | ⚠️         | Ja für 2 Stores                    |
| F4.6 lastSyncedBlock > latestBlock | 🟠  | Test: store.lastSyncedBlock=200, latestBlock=100 → runSync should skip+warn, nicht silent                      | ❌         | Ja                                 |
| F4.7 survey-keys File-Permissions  | 🟡  | n/a (Plesk-Operations, Bereich 7)                                                                              | n/a        | Nein                               |
| F4.8 Backup-Konzept fehlt          | 🟠  | Restore-Test als monatlicher CI-Job (siehe F8-Test-Backlog T8.4)                                               | ❌         | Ja                                 |

### Bereich 5 — Frontend Wallet & XSS

| Finding                                      | Sev | Test, der es fangen würde                                                                              | Existiert? | Verstärker          |
| -------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| F5.1 localStorage Klartext                   | 🟡  | n/a (akzeptierte Architektur)                                                                          | n/a        | Nein                |
| F5.2 ethers Wallet.createRandom() Entropie   | 🟡  | Test: 1000× createRandom → assert keine Duplikate                                                      | ❌         | Nein (Niedrig-Risk) |
| F5.3 downloadKeyFile Klartext                | 🟡  | Test: `downloadKeyFile` → assert WARNT vor Speicherrisiko in UI                                        | ❌         | Nein                |
| F5.4 Safari iOS ITP 7-Tage-localStorage      | 🟡  | n/a (Browser-Constraint, Doku)                                                                         | n/a        | Nein                |
| F5.5.a XSS Survey-Titles                     | 🟠  | Test: `surveyTitle = "<img src=x onerror=alert(1)>"` → render in Liste → assert kein Script ausgeführt | ❌         | Ja                  |
| F5.5.b XSS Admin-Labels                      | 🟠  | Test: `adminLabel = "<script>x</script>"` → render in AdminPage → assert escaped                       | ❌         | Ja                  |
| F5.5.c XSS URL-Parameter /claim              | 🟠  | Test: `?s=<script>...` → ClaimPage → assert no script execution                                        | ❌         | Ja                  |
| F5.5.d XSS Toast-Messages mit Backend-Errors | 🟠  | Test: API returnt `error.message = "<img onerror=...>"` → toast → assert escaped                       | ❌         | Ja                  |
| F5.6 CSP fehlt                               | 🔴  | Test: GET / → assert `content-security-policy`-Header gesetzt mit `script-src 'self'`                  | ❌         | Ja                  |
| F5.7 MetaMask-Race                           | 🟡  | Test: 2× signMessageMetaMask parallel → assert Toast-Race korrekt resolved                             | ❌         | Nein                |

### Bereich 6 — Auth, Replay & Sign-Flows

| Finding                                            | Sev | Test, der es fangen würde                                                                                                                     | Existiert?                                                           | Verstärker          |
| -------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- |
| F6.1 5-Min-Window ohne Server-Nonce                | 🔴  | Test: gleiche Sig 2× innerhalb 5 min senden → assert 2. Mal: 409 NONCE_USED (Server-Nonce)                                                    | ❌                                                                   | Ja                  |
| F6.2 timing-safe HMAC-Compare                      | 🟠  | Test: `verifyToken` mit similar-but-wrong token, statistische Timing-Messung — pragmatischer: `crypto.timingSafeEqual` Mock und assert called | ⚠️ teilweise (HMAC-Tests sind gut, aber kein expliziter Timing-Test) | Nein (low-priority) |
| F6.3 Cross-Operation-Replay                        | 🔴  | Test: Sig für `Add admin X` → versuche damit `Remove admin X` → assert 401                                                                    | ❌                                                                   | Ja                  |
| F6.4 Message-Format Frontend↔Backend Drift         | 🟠  | Test: shared `messageFormat`-Constant in `@vpp/shared` mit Test in beiden Paketen                                                             | ❌                                                                   | Ja                  |
| F6.5 isAdmin RPC-Failure-Lockout                   | 🟠  | Test: `isAdmin` rejects → admin route → assert 503 statt 403 (mit Cache-fallback)                                                             | ❌                                                                   | Ja                  |
| F6.6 Rate-Limiting                                 | 🔴  | Production-Limiter-Test (siehe F8.2)                                                                                                          | ❌                                                                   | Ja — F8.2           |
| F6.7 Frontend Admin-Session-State                  | 🟡  | Test: AdminPage refresh → assert Re-Sign benötigt (kein localStorage-Persist)                                                                 | ❌                                                                   | Ja                  |
| F6.8 nonce-store Backend-Kill zw. Verbrauch und Tx | 🟠  | Test: markUsed → simulate process.exit → restart → assert nonce noch verbraucht (persist before tx send)                                      | ❌                                                                   | Ja                  |
| F6.9 HMAC-Key-Rotation Cutoff                      | 🟠  | Test: alter Key + neuer Key beide → assert nur neuer akzeptiert                                                                               | ❌                                                                   | Ja                  |

### Bereich 7 — Deployment, Hosting & Operations

| Finding                                 | Sev | Test, der es fangen würde                                                                     | Existiert? | Verstärker               |
| --------------------------------------- | --- | --------------------------------------------------------------------------------------------- | ---------- | ------------------------ |
| F7.1 Kein externes Monitoring           | 🔴  | n/a (Operations, kein Code-Test)                                                              | n/a        | Nein                     |
| F7.2 docs/runbooks/ fehlt               | 🔴  | n/a (Doku)                                                                                    | n/a        | Nein                     |
| F7.3 Kein data/-Backup                  | 🟠  | CI-Test: nach `backup.yml`-Run → restore aus letztem Asset → assert files match               | ❌         | Ja                       |
| F7.4 Kein Post-Deploy-Health-Check      | 🟠  | Pipeline-Test: kaputte `dist/server.js` deployen → assert Pipeline detektiert + auto-rollback | ❌         | Ja — Bereich 7 cross-cut |
| F7.5 TLS-Pinning silent fallback        | 🟠  | Test in `deploy.yml`: TLS-Pinning-Variable nicht gesetzt → assert hard-fail                   | ❌         | Ja                       |
| F7.6 app.js dotenv-Konflikt             | 🟠  | Test: deploy mit `.env`-Datei → app.js wirft → assert log-message                             | ❌         | Ja — F2.10 cross         |
| F7.7 Bus-Factor (operators-Doku)        | 🟡  | n/a (Doku)                                                                                    | n/a        | Nein                     |
| F7.8 cancel-in-progress = halb-deployed | 🟡  | n/a (Workflow-Setting, kein Test)                                                             | n/a        | Nein                     |
| F7.9 .deploy-meta-Skip silent FTP-Fail  | 🟡  | Test: FTP read fail → assert clear log statement (statt silent skip)                          | ❌         | Nein                     |
| F7.10 Plesk-Log-Pfad undokumentiert     | 🟡  | n/a (Operations)                                                                              | n/a        | Nein                     |
| F7.11 docs/deployment.md veraltet       | ⚪  | n/a (Doku)                                                                                    | n/a        | Nein                     |
| F7.12 workflow_dispatch ohne Approval   | ⚪  | n/a (Setting)                                                                                 | n/a        | Nein                     |

**Zusammenfassung Cross-Reference:**

- **84 Findings** in Bereichen 1–7.
- **52 davon** wären durch Tests fangbar (Code-Findings, nicht Doku/Operations).
- **9 davon** haben heute einen ✅ oder ⚠️ Test-Coverage. → **17 % Defection-Rate**.
- **43 davon** haben **keinen Test** der sie gefangen hätte. → **83 % Test-Lücke**.
- **27 davon** sind „Severity-Verstärker = ungetestet" — also Findings, die ein präsenter Test direkt zur Resolution treiben würde.

---

## Test-Backlog (priorisiert nach „fängt einen bekannten Bereich-X-Finding")

Sortierung: **fängt Blocker > fängt Major > fängt Minor**, innerhalb je nach Aufwand.

### Sprint 1 (1 Personentag) — Catch-Block-Findings

| Tag  | Test                                                                                                       | Fängt       | Datei                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| T8.1 | CI-Step: grep für 64-hex Klartext-Keys in untrackeden Files                                                | F2.1        | `.github/workflows/ci.yml`                             |
| T8.2 | `config-boot.test.ts` (5 Tests: missing/invalid MINTER_KEY, malformed CONTRACT_ADDRESS, malformed RPC_URL) | F2.7, F3.7  | `packages/backend/test/config-boot.test.ts`            |
| T8.3 | `app.js`-Defensive-Refuse-Test (legacy `.env` → process.exit(1) mit Message)                               | F7.6, F2.10 | `packages/backend/test/app-js-refuse.test.ts`          |
| T8.4 | Production-Rate-Limiter-Test (echter `createApp()` mit `NODE_ENV=production`)                              | F6.6, F8.2  | `packages/backend/test/integration-rate-limit.test.ts` |
| T8.5 | Cross-Operation-Replay-Test (Add-Admin-Sig vs Remove-Admin)                                                | F6.3        | `packages/backend/test/auth-cross-replay.test.ts`      |
| T8.6 | F1.1-Test: DEFAULT_ADMIN versucht ADMIN_ROLE-revoke → revert                                               | F1.1        | `packages/contracts/test/SurveyPointsV2.test.ts`       |
| T8.7 | UUPS-Self-Lockout-Test: revoke own DEFAULT_ADMIN → assert kein weiteres Upgrade möglich                    | F1.5        | `packages/contracts/test/SurveyPointsV2.test.ts`       |
| T8.8 | CSP-Header-Test (Frontend prod build → assert csp-meta oder Backend-Header)                                | F5.6        | `packages/frontend/test/csp.test.ts`                   |

### Sprint 2 (1 Personentag) — XSS-Regression-Tests

| Tag   | Test                                                                                       | Fängt      | Datei                                              |
| ----- | ------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------- |
| T8.9  | XSS-Test SurveyTitle (Liste + Detail)                                                      | F5.5.a     | `packages/frontend/test/xss-survey-title.test.tsx` |
| T8.10 | XSS-Test Admin-Label (AdminPage Render)                                                    | F5.5.b     | `packages/frontend/test/xss-admin-label.test.tsx`  |
| T8.11 | XSS-Test URL-Parameter `/claim?s=<script>`                                                 | F5.5.c     | erweitert `packages/frontend/test/claim.test.tsx`  |
| T8.12 | XSS-Test Toast-Messages mit Backend-Errors                                                 | F5.5.d     | `packages/frontend/test/xss-toast.test.tsx`        |
| T8.13 | i18n-Parity-Test (`de.json` ↔ `en.json` Key-Tree) + i18n-Coverage (grep `t("...")` in src) | F8.5       | `packages/frontend/test/i18n.test.ts`              |
| T8.14 | AdminPage RoleManagement Sign-Flow-Test                                                    | F8.4, F6.7 | `packages/frontend/test/admin-role-mgmt.test.tsx`  |

### Sprint 3 (1 Personentag) — Stateful-Store-Robustheit

| Tag   | Test                                                                      | Fängt      | Datei                                                                                  |
| ----- | ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| T8.15 | `events.json` JSON-corrupt-on-boot Test (analog `nonce-store.test.ts:65`) | F4.5       | `packages/backend/test/event-store.test.ts`                                            |
| T8.16 | `admin-labels.json` JSON-corrupt + atomic-write Test                      | F4.5, F4.1 | `packages/backend/test/admin-labels-store.test.ts`                                     |
| T8.17 | `lastSyncedBlock > latestBlock` Skip+Warn-Test                            | F4.6       | `packages/backend/test/event-store-stale.test.ts`                                      |
| T8.18 | Reorg-Test (Hardhat `evm_revert`) Integration                             | F4.4       | `packages/backend/test/integration/reorg.test.ts`                                      |
| T8.19 | Multi-Worker-Konkurrenz-Test (2 Node-Prozesse parallel `markUsed`)        | F4.2       | `packages/backend/test/multi-worker.test.ts` (komplex; alternativ als `experimental/`) |
| T8.20 | nonce-store Backend-Kill-zw-Verbrauch-Test                                | F6.8       | `packages/backend/test/nonce-store-restart.test.ts`                                    |

### Sprint 4 (1 Personentag) — Blockchain-Helper-Tests

| Tag   | Test                                                                   | Fängt        | Datei                                                  |
| ----- | ---------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| T8.21 | `queryFilterChunked` Coverage-Union-Test (off-by-one)                  | F3.4         | `packages/backend/test/query-filter-chunked.test.ts`   |
| T8.22 | `getEffectiveRpcUrls` Reihenfolge-Test (verschiedene ENV-Setups)       | F3.2         | `packages/backend/test/rpc-config.test.ts`             |
| T8.23 | `isAlchemyFreeUrl` Heuristik-Test (5 URL-Varianten)                    | F3.3         | `packages/backend/test/rpc-config.test.ts`             |
| T8.24 | `withRpcRetry` Endless-Loop-Schutz (alle Provider 429)                 | F3.5         | `packages/backend/test/rpc-retry.test.ts`              |
| T8.25 | RPC-Failover Integration (FallbackProvider mit 2 Endpoints, einer 5xx) | F8.6.b       | `packages/backend/test/integration/failover.test.ts`   |
| T8.26 | Cold-Sync from Block 0 Integration                                     | F8.6.c, OPS6 | `packages/backend/test/integration/cold-sync.test.ts`  |
| T8.27 | NonceManager `nonce too low` Race                                      | F2.3, F8.6.d | `packages/backend/test/integration/nonce-race.test.ts` |
| T8.28 | `assertSufficientBalance` Race-Test                                    | F2.4         | `packages/backend/test/balance-assert.test.ts`         |
| T8.29 | Logger-Redact-Test (mock-pino, log call mit key → assert `[Redacted]`) | F2.5         | `packages/backend/test/logger-redact.test.ts`          |

### Sprint 5 (~2 h) — Operations & Polishing

| Tag   | Test                                                                                | Fängt          | Datei                                              |
| ----- | ----------------------------------------------------------------------------------- | -------------- | -------------------------------------------------- |
| T8.30 | `/health/diag` 3 Tests                                                              | F8.8, F7.1     | `packages/backend/test/health.test.ts` (erweitern) |
| T8.31 | `tsc --noEmit` als CI-Step                                                          | F8.10          | `.github/workflows/ci.yml`                         |
| T8.32 | Lighthouse erweitert auf 6 URLs                                                     | F8.11          | `.lighthouserc.json`                               |
| T8.33 | V1-Test in `test/legacy/` verschieben + hardhat.config skip-Logik                   | F8.9           | `packages/contracts/`                              |
| T8.34 | Backup-Restore-Test als monatlicher GHA-Cron                                        | F4.8, F8-cross | `.github/workflows/backup-restore-monthly.yml`     |
| T8.35 | F6.4 Message-Format-Constant in `@vpp/shared` extrahieren + Tests in beiden Paketen | F6.4           | `packages/shared/src/messages.ts` + Tests          |
| T8.36 | Coverage-Schwellen aktivieren (siehe F8.1)                                          | F8.1           | drei Vitest-Configs + `.solcover.js` + `ci.yml`    |

**Gesamtaufwand Sprint 1–5:** ~5 Personentage. **Reduziert die Test-Lücke von 83 % auf ~30 %.**

Resterledigung (T8.37+) wäre Edge-Case-Coverage und Ausbau auf 100 % — nicht empfohlen für HSBI-Realität (Diminishing Returns).

---

## Empfohlener Fix-Pfad (priorisiert)

### Phase 1 — Sofort vor nächstem Klassen-Run (~1 h Owner-Zeit)

1. **T8.1** CI-Step: 64-hex-grep — verhindert nächste `probe.mjs`-Wiederholung. `.github/workflows/ci.yml` 5 Zeilen.
2. **T8.36** Coverage-Schwellen aktivieren — Backend `vitest.config.ts` + `.solcover.js` + Codecov `fail_ci_if_error: true`. ~30 min, blockiert ab dann jeden Drop.
3. **F8.5/T8.13** i18n-Parity-Test — kostet 30 min, fängt jede künftige fehlende Übersetzung.

### Phase 2 — Vor V3-Upgrade (~1 Personentag)

4. **Sprint 1 T8.2-T8.8** komplett — alle Block-Findings haben Tests.
5. **T8.30** `/health/diag`-Test — Voraussetzung für sicheres UptimeRobot-Setup.

### Phase 3 — Vor Übergabe an Hirschfeld (~2 Personentage)

6. **Sprint 2** XSS-Regression-Tests (T8.9-T8.14).
7. **Sprint 3** Stateful-Store-Tests (T8.15-T8.20).
8. **F8.4** AdminPage-Coverage staged auf 65 % hochziehen.

### Phase 4 — Operations-Hardening (1 Personentag verteilt)

9. **Sprint 4** Blockchain-Helper-Tests.
10. **Sprint 5** Polishing (V1-Test-Move, Lighthouse, tsc-Step).

---

## Meta-Empfehlungen für Bereich 9 (Synthese)

- **Coverage-Theatre** ist der Querschnitts-Befund: Bereich 8 zeigt, dass die meisten Vor-Bereich-Findings keinen Test-Mechanismus haben, der sie über 2 Jahre absichert. Synthese sollte „Test-Mechanismus" als Erfolgskriterium für jeden anderen Fix mitlaufen lassen — nicht „Bug gefixt", sondern „Bug gefixt UND Test schreibt der Regression verhindert".

- **Mock-Hygiene-Inversion** in `setup.ts:20–97`: die kritischsten Pfade sind pauschal gemockt, die unkritischsten haben echte Tests. Empfehlung: Mock-Surface auf das absolute Minimum reduzieren, pro-Test gezielt überschreiben. Saubere Test-Architektur reduziert Bug-Maskierung.

- **Frontend-Dünnheit** ist die niedrig-hängende Frucht mit höchstem Schaden. AdminPage und PointsPage sind heute 0-Tested in Real-Flows. 2 Personentage Frontend-Test-Investition reduziert das größte UX-Regression-Risiko.

- **Integration-Suite** als „Test-Suite, die das tut, was die Audit-Hypothesen testen" massiv ausbauen: Reorg, Failover, Cold-Sync, Multi-Worker. Ohne diese Tests sind Bereiche 3 + 4 weiter Black Box.

- **Realistische Schwellen statt 100 %:** HSBI hat keine QA-Resourcen für umfassende E2E. Die hier vorgeschlagenen `75/70/75/75` für Backend und `65/55/60/65` für Frontend sind erreichbar in 5 Personentagen Sprint-Arbeit und liefern den Großteil der Risiko-Reduktion.

---

**Ergebnis Bereich 8:**

- **84 Findings aus Bereich 1–7** wurden gegen die Test-Suite gemappt.
- **43 Test-Lücken** identifiziert, davon **27 als Severity-Verstärker** (Test würde Finding direkt zur Resolution treiben).
- **12 neue Bereich-8-Findings** (3 🔴 / 4 🟠 / 3 🟡 / 2 ⚪).
- **36 priorisierte Test-Backlog-Items** mit konkreten Code-Skizzen, Aufwand-Schätzung pro Sprint.
- **Realistische Coverage-Schwellen** für HSBI-Stand definiert.

Größtes Bereich-übergreifendes Risiko: **Coverage ist Reporting ohne Konsequenz.** Solange Schwellen nicht enforced sind (F8.1), ist jeder Test, der hier vorgeschlagen wird, eine Empfehlung ohne dauerhaften Schutz. F8.1 ist der einzige Fix, der die anderen 11 Findings mechanisch absichert.
