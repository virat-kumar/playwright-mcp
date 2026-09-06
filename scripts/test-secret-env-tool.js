#!/usr/bin/env node
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const name = 'PW_SECRET_SMOKE';
const dummy = 'Dummy_' + crypto.randomBytes(12).toString('hex');
const child = spawn(process.execPath, [path.join(__dirname, '..', 'cli.js'), '--browser', 'chrome', '--headless', '--output-dir', '/tmp/playwright-mcp-secret-smoke'], {
  env: { ...process.env, [name]: dummy },
  stdio: ['pipe', 'pipe', 'pipe']
});
let nextId = 1;
const pending = new Map();
let buffer = '';
child.stdout.on('data', chunk => {
  buffer += chunk.toString();
  while (true) {
    const nl = buffer.indexOf('\n');
    if (nl < 0) break;
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (JSON.stringify(msg).includes(dummy)) {
      for (const { reject } of pending.values()) reject(new Error('secret leaked into MCP response'));
      pending.clear();
      child.kill();
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      waiter.resolve(msg);
    }
  }
});
function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`timeout waiting for ${method}`));
    }, 25000);
  });
}
function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}
(async () => {
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'secret-smoke', version: '1' } });
    notify('notifications/initialized');
    const tools = (await request('tools/list')).result.tools;
    if (!tools.some(t => t.name === 'browser_type_secret_from_env')) throw new Error('tool missing from tools/list');
    const url = 'data:text/html,<input id="x" type="password"><div id="s">empty</div><script>x.oninput=()=>s.textContent=x.value?"received":"empty"</script>';
    const nav = await request('tools/call', { name: 'browser_navigate', arguments: { url } });
    if (nav.result.isError) throw new Error('navigation failed');
    const fill = await request('tools/call', { name: 'browser_type_secret_from_env', arguments: { target: '#x', element: 'Secret smoke field', env_var_name: name } });
    if (fill.result.isError) throw new Error('secret fill failed');
    const check = await request('tools/call', { name: 'browser_evaluate', arguments: { function: '() => ({status:s.textContent,filled:x.value.length>0,type:x.type})' } });
    const text = JSON.stringify(check);
    if (!text.includes('received') || !text.includes('true') || !text.includes('password')) throw new Error('field verification failed');
    console.log('PASS browser_type_secret_from_env smoke test');
  } finally {
    child.kill();
  }
})().catch(err => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
