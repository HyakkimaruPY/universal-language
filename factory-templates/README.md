# Factory templates — v0.7.7

`runtime.template.js` is the **authoritative executable template** used by
`scripts/factory_server.py` to generate every LNReader Master and child plugin.

`runtime.template.ts` is retained as a legacy/reference typed mirror. It is not
used by the generator and intentionally must not be treated as the current build
source. This distinction prevents an older TypeScript mirror from silently
reintroducing pre-v0.7.7 behavior.
