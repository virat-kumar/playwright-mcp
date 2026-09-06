# Virat fork customizations

This fork adds one production extension to Playwright MCP: `browser_type_secret_from_env`.

## Why

The tool fills an editable browser element with a secret that is already present in the Playwright MCP server process environment. The MCP caller sends only an environment-variable name, never the secret value. This is intended for password fields and similar credential inputs where the model/client must not receive the credential.

## Interface

`browser_type_secret_from_env` accepts:

- `target`: the normal Playwright MCP target/ref or unique selector.
- `element`: optional human-readable target description.
- `env_var_name`: an uppercase environment variable name such as `PREFERRED_ACCOUNT_PASSWORD`.

The server rejects invalid variable names, empty values, values over 4096 bytes, and control characters. The resolved value is registered with Playwright's secret-redaction map before the action result is produced, and MCP responses use a symbolic `SECRET_ENV_<NAME>` marker rather than the value.

## Implementation

The MCP package delegates its tool implementation to `playwright-core`. `scripts/apply-secret-env-tool.js` is therefore an idempotent post-install patch against `playwright-core/lib/coreBundle.js`. `npm ci` automatically applies it through the package `postinstall` hook.

Run the focused smoke test with:

```sh
npm run test:secret-env
```

The test generates a random dummy secret, verifies tool discovery, fills an actual `type=password` input, verifies the field received a value, and fails if the dummy secret is returned in an MCP response.

## Production deployment

The production host currently runs `@playwright/mcp` 0.0.79. The same tool implementation was tested there before promotion. The production systemd service receives its existing secret file via an `EnvironmentFile=` drop-in; secret files and values are intentionally not committed to Git.
