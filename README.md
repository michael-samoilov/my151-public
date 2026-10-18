# my151

[my151.app](https://my151.app) helps Pokémon fans build a personal Pokédex, design a League, and choose their favorites.
The tools save edits in the browser and export PNG images.

| Tool | Purpose | Live page |
| --- | --- | --- |
| Dex Builder | Arrange Pokémon into regional roles and inspect the resulting statistics. | [Pokédex builder](https://my151.app/pokedex-builder) |
| League Builder | Create trainer cards and teams that change through badge progression. | [League builder](https://my151.app/custom-gym-leader) |
| Favorite Picker | Choose favorites by type and generation, then compare their statistics. | [Favorite Pokémon Picker](https://my151.app/favorite-pokemon-picker) |

## Start development

Use a Node.js version supported by Vite 8, such as Node.js 24.
Use npm with the committed lockfile.
The browser tools run without production credentials.

```bash
npm ci
npm run dev
```

Open the Vite URL and select a tool.
Vite does not run the Vercel functions in `api/`.
Authenticated admin reports need the configured backend.
The browser suite uses API fixtures.

## Verify a change

```bash
npm run ci:fast
```

For the final candidate, run `npm run ci:affected -- --base REF` with the intended production base.
Use `npm run ci:full` for broad release risk.
[Build Verification in CLAUDE.md](CLAUDE.md#build-verification) owns check selection, exceptions, receipts, and deployment requirements.

## Understand the project

- [Documentation index](docs/README.md) identifies the authoritative record for each topic.
- [Architecture](docs/architecture.md) explains state, shared components, APIs, and exports.
- [Product and engineering examples](docs/showcase.md) presents selected work and its evidence.
- [Evidence retention](docs/evidence-retention.md) distinguishes durable records from temporary verification output.

This repository contains private implementation code.
[Published license source](CLAUDE.md#published-license-source) defines the limited third-party source disclosures.
[Third-party notices](THIRD_PARTY_NOTICES.md) record dependencies and asset obligations.
