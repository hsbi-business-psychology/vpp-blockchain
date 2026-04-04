# ADR 0002: Use Simple Mappings Instead of Token Standards

## Status

Accepted

## Context

Survey participation points need to be recorded on-chain. Two main approaches were considered:

1. **Token standards (ERC-721 or ERC-1155)** — Mint an NFT or semi-fungible token for each claim. This would make points visible in wallets like MetaMask and on NFT marketplaces.
2. **Simple storage mappings** — Use `mapping(address => uint256)` for total points and `mapping(address => mapping(uint256 => bool))` for claim tracking. Custom view functions expose the data.

Key considerations:

- Points are not meant to be traded or transferred between students.
- Gas cost is critical since the university covers all fees.
- The system needs double-claim prevention per survey per wallet.
- No marketplace visibility is needed; points are only meaningful within the university context.

## Decision

Use **simple Solidity mappings** (`_totalPoints`, `_surveyPoints`, `_claimed`) instead of ERC-721 or ERC-1155 token standards.

## Consequences

- **Lower gas costs** — `registerSurvey` costs ~80,000 gas, `awardPoints` costs ~45,000–65,000 gas. An ERC-721 mint would cost ~120,000+ gas.
- **No transferability** — Points cannot be sent to other wallets, which is the desired behavior for academic credits.
- **Simpler contract** — No need for `safeTransferFrom`, approval mechanisms, or metadata URIs, reducing the attack surface.
- **No wallet/marketplace visibility** — Points do not show up as tokens in MetaMask or OpenSea, but this is acceptable since the VPP frontend provides a dedicated point dashboard.
- **Custom read functions** — The frontend must use `totalPoints()` and `surveyPoints()` instead of standard `balanceOf()`.
