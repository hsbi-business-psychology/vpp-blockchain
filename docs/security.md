# Security Architecture

This document describes the security model of VPP Blockchain, including threat mitigation, access control, and key management.

## Layers of Protection

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Survey Secret                                  │
│ → Only participants who complete the survey know the    │
│   secret (received via redirect URL)                    │
│ → Secret is stored as a keccak256 hash on-chain         │
│ → Without the correct secret → claim rejected           │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Wallet Signature (EIP-191)                     │
│ → Claim request must be signed by the wallet owner      │
│ → Backend verifies signature via ecrecover              │
│ → Nobody can claim on behalf of another wallet          │
├─────────────────────────────────────────────────────────┤
│ Layer 3: On-Chain Double-Claim Protection               │
│ → mapping(address => mapping(uint256 => bool))          │
│ → Smart contract prevents duplicate claims              │
│ → Even if backend has a bug: blockchain is truth        │
├─────────────────────────────────────────────────────────┤
│ Layer 4: Access Control (MINTER_ROLE)                   │
│ → Only the backend wallet can call awardPoints()        │
│ → Direct contract calls without MINTER_ROLE → revert   │
├─────────────────────────────────────────────────────────┤
│ Layer 5: Rate Limiting                                  │
│ → API limits requests per IP / time window              │
│ → Protects against brute-force secret guessing          │
├─────────────────────────────────────────────────────────┤
│ Layer 6: HTTP Security Headers (Helmet)                 │
│ → Standard security headers (CSP, HSTS, etc.)          │
│ → CORS restricted to configured frontend URL            │
└─────────────────────────────────────────────────────────┘
```

## Private Key Management

### Student Keys (Frontend)

- Private keys are **never** sent to the server
- Signing happens entirely in the browser using ethers.js (browser wallet) or MetaMask (if connected)
- **Browser wallet:** Keys are stored in `localStorage` (client-side only). Students can export and back up their key. **Key loss = permanent loss of access** (no recovery mechanism by design)
- **MetaMask:** Keys are managed by the MetaMask extension with password protection and optional seed phrase recovery. No private key is stored in `localStorage` — only the wallet address and type

### Backend Key (Server)

- Server wallet holds `MINTER_ROLE` on the contract
- Private key stored in `.env` (never committed to the repository)
- This wallet pays gas for all transactions
- Must be funded with ETH on Base (~$10 for thousands of transactions)
- Compromise of this key allows unauthorized point distribution — protect it

### Admin Keys

- Admin wallets are verified on-chain via `ADMIN_ROLE` on the smart contract
- Admin actions require EIP-191 signature verification
- Admins can register surveys and manage the system
- Admin role can be granted/revoked via the contract's `AccessControl`

## Threat Model

| Threat | Mitigation |
|---|---|
| Fake claims (no survey completed) | Survey secret is required; only known to actual participants |
| Duplicate claims | On-chain `_claimed` mapping prevents re-claiming |
| Impersonation (claiming for another wallet) | EIP-191 signature verification proves wallet ownership |
| Secret brute-forcing | Rate limiting (5 claims per minute per IP); secrets should be long/random |
| Unauthorized point distribution | `MINTER_ROLE` access control on `awardPoints()` |
| Backend key compromise | Damage limited to point distribution; can revoke `MINTER_ROLE` and redeploy |
| Replay attacks | Signed messages include a timestamp; expired messages are rejected |
| XSS / injection | Helmet security headers; React's built-in XSS protection; Zod input validation |
| CSRF | No cookies used; authentication via signed messages |
| DDoS | Rate limiting on all API endpoints |

## Pseudonymity

- Wallet addresses are not linked to real identities
- The backend only knows wallet addresses, not student names
- On-chain data contains only addresses, survey IDs, and points
- No personal data is stored anywhere in the system

## Reporting Vulnerabilities

Please report security vulnerabilities responsibly. See [SECURITY.md](../SECURITY.md) for the disclosure process.
