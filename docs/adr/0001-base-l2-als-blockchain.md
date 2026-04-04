# ADR 0001: Use Base L2 as the Target Blockchain

## Status

Accepted

## Context

VPP needs a public, permissionless blockchain to record survey participation points. Key requirements:

- **Low transaction costs** — The system must be free for students; the university covers gas fees. With potentially thousands of claims per semester, per-transaction costs must be negligible.
- **EVM compatibility** — The team has Solidity expertise and wants to leverage the mature EVM tooling ecosystem (Hardhat, ethers.js, OpenZeppelin).
- **Sufficient decentralization** — Points must be publicly verifiable and tamper-resistant, but the system does not require the security guarantees of L1 Ethereum.
- **Ecosystem maturity** — Reliable RPC providers, block explorers, and faucets must be available.

Alternatives considered: Ethereum L1 (too expensive at ~$2–5 per transaction), Polygon PoS (viable but less institutional backing), Arbitrum (comparable but Base had better faucet availability at the time), and Solana (non-EVM, would require rewriting the contract layer).

## Decision

Use **Base L2** (Coinbase's OP Stack rollup on Ethereum) as the target chain, deploying on Base Sepolia for testing and Base Mainnet for production.

## Consequences

- Transaction costs are ~$0.002–0.005, making it feasible to cover all gas fees from a small university budget (~$10 covers thousands of claims).
- The project inherits Ethereum's security guarantees via the OP Stack rollup mechanism.
- Base has a well-maintained block explorer (BaseScan), reliable RPC endpoints, and good faucet availability for testnet development.
- Vendor lock-in is minimal: the contract is standard Solidity and can be redeployed on any EVM-compatible chain.
