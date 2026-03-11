# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in VPP Blockchain, please report it
responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to **vpp-security@hsbi.de** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fixes (if applicable)

## Scope

The following are in scope for security reports:

- Smart contract vulnerabilities (reentrancy, access control bypass, etc.)
- Backend API vulnerabilities (authentication bypass, injection, etc.)
- SDK vulnerabilities (key exposure, signature forgery, etc.)
- Frontend vulnerabilities (XSS, CSRF, etc.)

## Out of Scope

- Issues in third-party dependencies (report these to the respective projects)
- Denial of service via rate limiting (this is expected behavior)
- Social engineering attacks

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix and disclosure**: Coordinated with the reporter

## Smart Contract Security

The `SurveyPoints` smart contract has been designed with multiple layers of
protection:

- **AccessControl**: Role-based permissions (ADMIN_ROLE, MINTER_ROLE)
- **On-chain secret verification**: Survey secrets are stored as keccak256 hashes
- **Double-claim prevention**: Each wallet can only claim once per survey
- **Rate limiting**: API-level protection against brute-force attacks

## Supported Versions

| Version | Supported |
|---|---|
| Latest on `main` | Yes |
| Previous releases | Best effort |
