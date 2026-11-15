---
paths:
  - "package.json"
  - "package-lock.json"
  - "public/licenses/**"
  - "scripts/published-source.json"
  - "scripts/check-published-source.mjs"
  - "THIRD_PARTY_NOTICES.md"
---

## Published license source

Michael set these rules on 2026-10-12. On 2026-11-11, he decided to publish a source-available copy.

1. Never release our own code under an open-source license. The public copy at `github.com/michael-samoilov/my151-public` is source-available, with all rights reserved.
2. Keep code whose license makes us publish its source, such as MPL-2.0, in files of its own. Put none of our code in those files. Our code imports from them.
3. Publish each such file unchanged as `public/licenses/source/<project>/<file>.txt`. The site serves it at `https://my151.app/licenses/source/<project>/<file>.txt`.
4. Link each published file from the project's Acknowledgements entry and from its section in `THIRD_PARTY_NOTICES.md`.
5. List each file in `scripts/published-source.json`. `node scripts/check-published-source.mjs` enforces the list, and `scripts/ci-local.sh` runs it.

Do not copy code under a license that covers the whole work, such as GPL-3.0. Fencing does not help there: rewrite the feature without that code.
