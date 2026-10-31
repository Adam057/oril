# ORIL

**Know what you're signing.** ORIL is a Web3 signature inspector that decodes wallet requests, maps recognizable permissions, and explains risk signals before a user approves a signature. It presents decoded facts, interpretations, and unknowns separately. Decoding a request does **not** prove that signing it is safe.

## What it does

- Inspects EIP-712 typed data, EIP-191 `personal_sign` requests, and Sign-In with Ethereum (SIWE) messages, including common JSON-RPC wrappers.
- Recognizes ERC-2612 permits, Permit2 AllowanceTransfer, and Permit2 SignatureTransfer when their typed-data schemas match the expected structures.
- Builds an interactive authorization map from evidenced relationships. Node details link back to the exact source fields.
- Reports deterministic findings for broad amounts, expired or long-lived deadlines, chain mismatches, and unknown semantics, with supporting evidence and a recommended verification step.
- Checks public contract bytecode and optional token metadata through bounded server-side RPC calls. Token metadata is displayed as untrusted.
- Generates text and JSON reports locally, including a redacted JSON export.

ORIL supports **BNB Smart Chain (56)**, **Base (8453)**, and **Robinhood Chain (4663)**. BNB Chain is selected by default. EVM typed-data decoding itself is independent of network selection; ORIL flags a declared chain that differs from the selected network.

## Technology

Next.js App Router, React, TypeScript, Tailwind CSS, viem, Motion, Lucide icons, Vitest, and Playwright. The application uses public RPC endpoints and no paid API or database.

## Run locally

Use a supported Node.js version for the installed Next.js release. From the project root:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. On Windows PowerShell with script execution disabled, use `npm.cmd` in place of `npm`.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Parser, report, and RPC route tests |
| `npm run test:e2e` | Playwright browser journey and responsive checks (requires Chrome) |
| `npm run build` | Production build |
| `npm run start` | Start the production server after building |
| `npm audit` | Dependency advisory check |

No environment variables are currently required. Never add private RPC credentials, wallet keys, or raw signing payloads to the repository.

## Architecture

| Area | Responsibility |
| --- | --- |
| `src/lib/inspect.ts` | Client-side input validation, viem typed-data validation, deterministic decoding, permission interpretation, findings, and map evidence |
| `src/app/page.tsx` | Input, inspection workspace, map controls, contract lookup display, documentation, and report UI |
| `src/lib/report.ts` | Client-side text/JSON exports and redaction |
| `src/app/api/lookup/route.ts` | Public RPC chain-ID, bytecode, and optional token metadata lookup |
| `src/lib/*.test.ts`, `src/app/api/lookup/*.test.ts`, `tests/` | Unit and browser tests |

The browser validates requests up to **100 KB** and a nesting depth of **24**. Recognized standards receive specific permission summaries only when expected typed-data fields and types match. Unknown EIP-712 structures receive a field breakdown without invented authorization semantics. The map and findings cite source paths and preserve original values in the local inspection. No raw request is sent to the lookup route.

The lookup route accepts only a supported chain ID and valid EVM address. It checks the RPC chain ID before returning bytecode presence, uses public endpoint fallback and 4.5-second per-call timeouts, caches results for 60 seconds, and caps requests per process. Failed lookups do not block local inspection.

## Security and privacy

- ORIL never asks for a seed phrase or private key, signs on the user's behalf, or executes inspected requests.
- Raw requests remain in the browser. Only selected chain IDs and public contract addresses are sent to `/api/lookup`.
- Report downloads are generated in the browser. Redacted exports omit raw payloads, domain values, addresses, field values, and evidence values; they still disclose the request type, network, finding titles, and relationship labels. Review a redacted report before sharing it.
- Input and RPC data are validated and rendered as text. ORIL does not treat successful decoding, deployed bytecode, or token metadata as proof of contract safety.

## Known limitations

ORIL does not cryptographically verify a signature, identify the actual signer from an unsigned request, audit contracts, establish contract source verification or reputation, or prove how an application will use a signature. SIWE inspection validates recognizable message structure; it does not authenticate a session. Token amounts are raw integer units unless token decimals are independently confirmed. Public RPC endpoints may be unavailable or rate limited. The lookup route's process-local request cap is not a distributed rate limiter; add an edge rate limit for substantial public traffic. **No warnings does not guarantee safety.**

## Public RPC verification

On 2026-10-31, the production `/api/lookup` route returned chain 56 with bytecode for WBNB (`0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`) and no bytecode for `0x0000000000000000000000000000000000000001`. It returned chain 8453 with bytecode for Base WETH (`0x4200000000000000000000000000000000000006`) and chain 4663 with no bytecode for that low address. These are point-in-time observations, not safety or reputation claims. Returned token names, symbols, and decimals are untrusted contract responses.

To repeat the BNB check after `npm run build` and `npm run start`, request `/api/lookup?chain=56&address=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` and compare it with `/api/lookup?chain=56&address=0x0000000000000000000000000000000000000001`.

## Deployment

ORIL is designed for a Next.js deployment on Vercel with the project root as the root directory, `main` as the production branch, and the standard `npm run build` command. No environment variables are needed for the current public RPC configuration. Connect the repository through Vercel's GitHub integration for automatic production and preview deployments. Validate the live URL, inspection flow, reports, and RPC behavior after deployment; a successful local build alone is not production verification.
