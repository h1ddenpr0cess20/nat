/**
 * Everything the proxy reads from the environment, resolved once.
 *
 * A function rather than module-level constants so the Vite dev server, the
 * production server and the tests can each build their own — the tests in
 * particular need to point `realtimeUrl` at a stub without mutating
 * `process.env`.
 */

import { readFileSync } from 'node:fs';

/* Every voice xAI publishes — the original five plus 21 flagship ones.

   An earlier cut of this list kept only the low, heavy end of the roster,
   which in practice meant the picker offered no female voices at all. Casting
   is the operator's call and not this file's, so the whole roster is here now
   and the only opinion left is which one leads: `leo`, which sounds like
   somebody telling you a story across a table — the entire job.

   xAI does have a voices endpoint (`GET /v1/tts/voices`), but a static list
   keeps the picker populated before the proxy has a key to ask with. An
   unrecognised XAI_VOICE is honoured too, and shows up at the front. */
export const KNOWN_VOICES = Object.freeze([
  'leo', 'rex', 'sal', 'atlas', 'zagan', 'orion', 'perseus',
  'helix', 'zenith', 'rigel', 'castor', 'ursa', 'naksh', 'kepler',
  'ara', 'eve', 'carina', 'luna', 'iris', 'celeste', 'lumen',
  'lux', 'cosmo', 'sirius', 'altair', 'helios',
]);

/* grok-voice-latest tracks the newest release. There is no models endpoint that
   reports voice-capable models, so the picker is a static list too. */
export const KNOWN_MODELS = Object.freeze(['grok-voice-latest', 'grok-voice-think-fast-1.0']);

/** Boolean env vars: unset means the default, anything falsy-looking means off. */
function flag(value, fallback) {
  if (value == null || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(value);
}

/**
 * Remote MCP servers, from `XAI_MCP_SERVERS` or ./mcp.json.
 *
 * These carry credentials, which is exactly why they are read here and never
 * sent to the page. A malformed list is a misconfiguration worth shouting
 * about, but not worth refusing to boot over — Nat still talks without them.
 */
function loadMcpServers(env) {
  const raw = env.XAI_MCP_SERVERS || readMcpFile(env.XAI_MCP_FILE || 'mcp.json');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((s) => {
      const ok = s && typeof s.server_url === 'string' && typeof s.server_label === 'string';
      if (!ok) console.warn('mcp: dropping an entry without server_url + server_label');
      return ok;
    });
  } catch (err) {
    console.warn(`mcp: could not parse the server list — ${err.message}`);
    return [];
  }
}

function readMcpFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null; // not having one is the normal case
  }
}

export function loadConfig(env = process.env) {
  const defaultVoice = env.XAI_VOICE || KNOWN_VOICES[0];
  const defaultModel = env.XAI_MODEL || KNOWN_MODELS[0];

  return {
    port: Number(env.PORT) || 5173,
    apiKey: env.XAI_API_KEY,
    realtimeUrl: env.XAI_REALTIME_URL || 'wss://api.x.ai/v1/realtime',
    defaultModel,
    defaultVoice,
    // An overridden voice or model we don't know about still belongs in the
    // picker, at the front, since it's the one the operator asked for.
    voices: KNOWN_VOICES.includes(defaultVoice)
      ? [...KNOWN_VOICES]
      : [defaultVoice, ...KNOWN_VOICES],
    models: KNOWN_MODELS.includes(defaultModel)
      ? [...KNOWN_MODELS]
      : [defaultModel, ...KNOWN_MODELS],
    tools: {
      webSearch: flag(env.XAI_WEB_SEARCH, true),
      xSearch: flag(env.XAI_X_SEARCH, true),
      mcpServers: loadMcpServers(env),
    },
  };
}
