# Architecture Decision Records (ADRs)

We record significant architectural decisions using [ADRs](https://adr.github.io/) following the format proposed by Michael Nygard.

## Format

Each ADR is a short Markdown file with these sections:

- **Title** — A short noun phrase describing the decision
- **Status** — `proposed`, `accepted`, `deprecated`, or `superseded`
- **Context** — The forces at play and the problem being addressed
- **Decision** — The chosen approach
- **Consequences** — Trade-offs and implications of the decision

## Index

| ADR                                                        | Title                                          | Status   |
| ---------------------------------------------------------- | ---------------------------------------------- | -------- |
| [0001](0001-base-l2-als-blockchain.md)                     | Use Base L2 as the target blockchain           | Accepted |
| [0002](0002-mappings-statt-erc721.md)                      | Use simple mappings instead of token standards | Accepted |
| [0003](0003-stateless-backend-relayer.md)                  | Stateless backend as transaction relayer       | Accepted |
| [0004](0004-hmac-claim-tokens-and-upgradeable-contract.md) | HMAC claim tokens & upgradeable SurveyPointsV2 | Accepted |
