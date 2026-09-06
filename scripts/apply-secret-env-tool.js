#!/usr/bin/env node
const fs = require('fs');
const path = require.resolve('playwright-core/lib/coreBundle');
let source = fs.readFileSync(path, 'utf8');

if (source.includes('name: "browser_type_secret_from_env"')) {
  console.log('browser_type_secret_from_env already present');
  process.exit(0);
}

const declRe = /var (z\d+), press, pressSequentially, typeSchema, type, keydown, keyup, keyboard_default;/;
const decl = source.match(declRe);
if (!decl)
  throw new Error('Unsupported playwright-core keyboard bundle: declaration anchor not found');
const z = decl[1];
source = source.replace(declRe, `var ${z}, press, pressSequentially, typeSchema, type, secretTypeFromEnvSchema, typeSecretFromEnv, keydown, keyup, keyboard_default;`);

const keydownAnchor = '    keydown = defineTabTool({';
if (!source.includes(keydownAnchor))
  throw new Error('Unsupported playwright-core keyboard bundle: keydown anchor not found');

const tool = `    secretTypeFromEnvSchema = elementSchema.extend({\n      env_var_name: ${z}.string().describe("Environment-variable name only, for example PREFERRED_ACCOUNT_PASSWORD. The server resolves the value locally; never pass the secret value.")\n    });\n    typeSecretFromEnv = defineTabTool({\n      capability: "core-input",\n      schema: {\n        name: "browser_type_secret_from_env",\n        title: "Type secret from environment",\n        description: "Fill an editable web element with a secret resolved locally from a named environment variable. Pass only the environment-variable name; the secret value is never returned or placed in MCP arguments.",\n        inputSchema: secretTypeFromEnvSchema,\n        type: "input"\n      },\n      handle: async (tab2, params2, response2) => {\n        if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(params2.env_var_name)) {\n          response2.addError("Invalid environment variable name. Use ^[A-Z][A-Z0-9_]{0,127}$.");\n          return;\n        }\n        const secretValue = process.env[params2.env_var_name];\n        if (!secretValue) {\n          response2.addError("Environment variable is unset or empty.");\n          return;\n        }\n        if (Buffer.byteLength(secretValue, "utf8") > 4096) {\n          response2.addError("Environment variable value exceeds the maximum allowed secret length.");\n          return;\n        }\n        if (/\\p{Cc}/u.test(secretValue)) {\n          response2.addError("Environment variable contains characters unsupported for secret entry.");\n          return;\n        }\n        const { locator: locator2, selector } = await tab2.targetLocator(params2);\n        tab2.context.config.secrets ??= {};\n        tab2.context.config.secrets[params2.env_var_name] = secretValue;\n        await locator2.fill(secretValue, tab2.actionTimeoutOptions);\n        response2.addAction({ name: "fill", selector, text: \`SECRET_ENV_\${params2.env_var_name}\` });\n        response2.addTextResult("Secret entered into the target element from the configured environment variable.");\n      }\n    });\n`;
source = source.replace(keydownAnchor, tool + keydownAnchor);

const listRe = /    keyboard_default = \[\n      press,\n      type,\n      pressSequentially,\n      keydown,\n      keyup\n    \];/;
if (!listRe.test(source))
  throw new Error('Unsupported playwright-core keyboard bundle: tool-list anchor not found');
source = source.replace(listRe, `    keyboard_default = [\n      press,\n      type,\n      typeSecretFromEnv,\n      pressSequentially,\n      keydown,\n      keyup\n    ];`);

fs.writeFileSync(path, source);
console.log(`patched ${path} with browser_type_secret_from_env`);
