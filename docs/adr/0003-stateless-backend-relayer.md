# ADR 0003: Stateless Backend as Transaction Relayer

## Status

Accepted

## Context

Students need to claim survey points by submitting a transaction to the smart contract. Two approaches were considered:

1. **Direct client transactions** — The frontend sends transactions directly from the student's wallet. This requires students to hold ETH for gas fees and understand transaction signing.
2. **Backend relayer** — The frontend sends a signed claim request to a backend API, which verays the signature and submits the on-chain transaction using a funded "minter" wallet.

Key requirements:

- Students should not need to acquire or hold cryptocurrency.
- The system must be free for participants.
- Claim authenticity must be verifiable (prevent impersonation).
- The backend should be stateless to simplify deployment and scaling.

## Decision

Use a **stateless Node.js/Express backend** as a transaction relayer. The backend holds a funded wallet with `MINTER_ROLE` and submits transactions on behalf of students after verifying their EIP-191 signatures.

## Consequences

- **Free for students** — All gas fees are paid by the university-funded minter wallet. Students never need ETH.
- **Signature-based authentication** — Students prove wallet ownership by signing a message with their private key. The backend recovers the signer address and verifies it matches the claim.
- **Stateless design** — The backend does not maintain a database. All state lives on-chain or is derived from blockchain events (via the in-memory event store). This simplifies deployment to a single Node.js process.
- **Single point of reliance** — If the backend is down, claims cannot be processed. However, points already awarded remain on-chain and are unaffected.
- **Minter wallet management** — The minter wallet must be kept funded. The `/api/v1/status` endpoint monitors the balance and estimates remaining capacity.
- **Replay protection** — Signed messages include a Unix timestamp; the backend rejects messages older than 5 minutes.
