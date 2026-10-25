# Contributing

Contributions that improve source quality, accessibility, reliability, and neutral presentation are welcome. Please read [DISCLAIMER.md](DISCLAIMER.md) and [docs/architecture.md](docs/architecture.md) first.

## Report issues

Use the repository issue forms for bugs, source corrections, or subject mismatches. Include reproduction steps and public source links where possible. Do not include private personal information, credentials, or screenshots containing sensitive information.

## Development

Requirements: Windows 10/11 x64, Node.js 24, pnpm 11.25.0, and Git. Clone the repository, then run:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Before opening a pull request, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`. For UI changes, run `pnpm test:e2e`; for packaging changes also run `pnpm dist:win` and `pnpm dist:portable` and verify both outputs.

Keep dependencies exactly pinned and update `pnpm-lock.yaml` with intentional dependency changes. Never add secret keys, telemetry, cloud OCR, or runtime model downloads. Keep web content inert, maintain explicit user confirmation before starting a search or opening an external browser, and preserve attribution and uncertainty. Do not add moral scores, rankings, blacklists, or purchasing advice.
