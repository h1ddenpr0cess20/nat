# Nat

A tabletop voice agent rendered as a twenty-sided die. It runs the game:
describes the room, plays everyone in it, and rolls itself when something is
uncertain. Driven by an xAI Grok speech-to-speech session; the tumble, hop and
squash are read off the live audio, so it moves with whichever of you is
talking.

The rolls are real. The die tumbles freely, whatever lands nearest the ceiling
is the result, and it is turned flat to the top rather than picked first and
animated to. The number you can see is the number that came up — which is why
the persona is told never to say one out loud.

It can search the web and X, and call remote MCP servers.

## Run

```sh
npm install
cp .env.example .env      # add your XAI_API_KEY
npm run dev               # → http://localhost:5173
```

Click the mic, allow the browser's microphone prompt, and say what you do.
Talk over it and it'll stop — and hop.

| Script | |
|---|---|
| `npm run dev` | Vite, with the proxy mounted as middleware — one process |
| `npm run dev:lan` | The same, over HTTPS on the network — for a phone |
| `npm run build` | Bundles the client to `dist/` |
| `npm start` | Serves `dist/` with the same proxy in front |
| `npm run preview` | `build` then `start` |
| `npm run preview:lan` | `build` then `start`, over HTTPS on the network |
| `npm test` | `node:test`, against a stub xAI socket |
| `npm run lint` | |

CI runs the lint, the tests on Node 22.12 and 24, and a build that then has to
boot and serve itself over both HTTP and HTTPS.

### On a phone

```sh
npm run dev:lan           # → https://192.168.x.x:5173, printed on start
```

Microphone access needs a secure context. `localhost` is one; a LAN address
over plain HTTP is not — `navigator.mediaDevices` isn't just refused there, it
doesn't exist, so the page can't even raise the mic prompt. The `:lan` scripts
serve HTTPS with a self-signed certificate, which is a secure context. The
realtime socket follows the page onto `wss:` by itself.

No browser trusts that certificate, so the phone shows a warning the first time
("Advanced" → proceed on Chrome, "Show details" → "visit this website" on
Safari). Tap through it once per device and the mic works from then on. The
certificate is generated on first use and cached in `node_modules/.vite/`, and
both `:lan` scripts share it, so one warning covers both.

To skip the warning entirely, bring a certificate the device already trusts —
[mkcert](https://github.com/FiloSottile/mkcert) issues one for a LAN IP in a
line — and point `SSL_KEY` and `SSL_CERT` at it. `npm start` then serves HTTPS
with it and the `--https` flag is unnecessary. Same for anything public-facing.

| Variable | Default | Role |
|---|---|---|
| `XAI_API_KEY` | — | Required. Stays in the Node process. |
| `XAI_VOICE` | `leo` | Any of the 26 voices xAI publishes — the full list is in `.env.example` — or any other voice id, which is honoured and added to the picker |
| `XAI_MODEL` | `grok-voice-latest` | Also `grok-voice-think-fast-1.0` |
| `XAI_REALTIME_URL` | xAI | Points the proxy at a gateway or a stub |
| `XAI_WEB_SEARCH` | `true` | |
| `XAI_X_SEARCH` | `true` | |
| `XAI_MCP_SERVERS` | — | JSON array of remote MCP servers, or put it in `mcp.json` |
| `PORT` | `5173` | |
| `SSL_KEY`, `SSL_CERT` | — | Paths to a real certificate; `npm start` then serves HTTPS |

Both `npm run dev` and `npm start` read `.env`.

## How the call is wired

Every frame of audio goes through the Node process:

```
browser  ──ws──▶  /realtime  ──ws──▶  wss://api.x.ai/v1/realtime
```

That is a deliberate cost, and it is the main way this differs from an
equivalent app on OpenAI's Realtime API. There, the browser dials the provider
directly with an ephemeral secret and audio never touches your server. Here it
can't:

- **xAI's `/v1/realtime/client_secrets` takes no `session` field.** The token it
  mints carries no configuration, so a page that dialled xAI directly would have
  to send its own `session.update` — putting the persona, the tool list and any
  MCP `authorization` header in client code, where they are readable and
  editable.
- **The token lasts five minutes.** Conversations routinely outlive that.

So the socket lives here, and the page holds no credential of any kind. On
connect, the proxy is the one that sends `session.update`: persona, voice,
turn detection, audio format, tools. Only then does it forward anything the
page queued.

What the page may say upstream is an allowlist, not a filter — audio frames, a
typed message, a request to respond, a cancel. Two frames are treated as
persona overrides and dropped: a `session.update` from the browser, and the
`instructions` field on a `response.create`, which replaces the system prompt
for one turn. `test/server/realtime.test.js` is the file that fails if that
stops being true.

## Audio

WebRTC would have handled this. A WebSocket carrying base64 PCM does not, so
both directions are the client's problem.

**Up:** an `AudioWorklet` (`public/pcm-worklet.js`) takes the mic at whatever
rate the hardware felt like, resamples to 24 kHz with linear interpolation, and
posts 20 ms PCM16 frames. The `sampleRate` option on `AudioContext` is a hint —
some browsers hand back the device rate, and a session that declares 24 kHz
while sending 48 sounds like a chipmunk — so the conversion is done rather than
requested.

**Down:** chunks arrive *faster than real time* — the model produces ten seconds
of speech in two — so playback can't be "play each as it lands" without
overlapping. Each chunk is booked against a cursor running ahead of the clock.
That cursor is also what makes barge-in work: interrupting means dropping
everything booked but not yet heard, which is most of the answer.

Turn-taking is server-side VAD, so speaking over Nat stops him generating;
`input_audio_buffer.speech_started` is what tells the page to drop its queue. A
new `response.created` arriving while audio is still playing flushes it too, as
a backstop for a turn cut short without notice. `Escape` cancels for the typed
path.

The worklet lives in `public/` rather than being imported. Vite inlines assets
under its size limit as `data:text/javascript` URLs, and `addModule()` rejects
those on Safari and under any CSP that doesn't allow `data:` — it works in dev
and breaks in production, silently.

## Tools

`web_search` and `x_search` are on by default. Both execute inside xAI, so
there is nothing to implement here and no second credential to hold — they cost
a flag in `.env`. Nat is told not to narrate a search, so the only sign one is
running is the label under the status chip.

Remote **MCP** servers go in `XAI_MCP_SERVERS` as a JSON array, or in `mcp.json`
(gitignored), and are executed by xAI as well:

```json
[
  {
    "server_label": "orders",
    "server_url": "https://mcp.example.com/mcp",
    "server_description": "Order lookup",
    "allowed_tools": ["lookup_order"],
    "authorization": "Bearer ..."
  }
]
```

Credentials in that file never leave the Node process. `/api/config` reports
tool *labels* only, which is what the strip under the composer renders.

Client-side function tools are the one kind not wired up: `session.tools` would
take them, but they need a `function_call_output` path back through the proxy's
allowlist, and nothing here has wanted one yet.

## Layout

```
index.html              Markup only — Vite's entry
prototype/              Where the character came from, as single-file pages
public/
  pcm-worklet.js        Mic → 24 kHz PCM16, on the audio thread
src/
  client/
    main.js             The wiring, and nothing else
    styles.css          The HUD around the die
    api.js              /api/config, as a function
    nat/                Geometry and animation. Knows nothing about transports
      index.js            The controller, the throw, and the per-frame loop
      geometry.js         The solid, the edge ink, and twenty numbered faces
      moods.js            Targets per conversational state
      environment.js      Cool studio env map
    session/            The call. Emits transport-agnostic events
      index.js            Lifecycle: mic, socket, meter, tear down
      socket.js           The WebSocket to our own proxy
      audio.js            Capture and playback over Web Audio
      codec.js            PCM16 ↔ base64
      events.js           xAI server events → this vocabulary
      metering.js         An analyser → one 0..1 number per frame
      emitter.js
      constants.js        The wire format, shared with the server
    ui/                 What you read and what you press
      hud.js              Status chip, transcript, caption, tool label
      controls.js         Mic, text field, send, pickers
      viewport.js         Keeps the composer above the on-screen keyboard
      stage.js            Strips the starter component's own chrome
    vendor/
      three-d-stage.js    Starter component (renderer, lighting, camera, controls)
  server/
    index.js            Entry point
    app.js              Middleware chain + the upgrade handler
    api.js              /api/config
    realtime.js         The socket proxy, and the allowlist
    persona.js          Who Nat is, and the session config
    config.js           The environment, resolved once
    static.js           Hosting for dist/ — production only
test/                   node:test, against a stub xAI socket
.github/workflows/      Lint, tests on two Node versions, and a build that has
                        to come up and serve itself
```

`src/client/nat/` is a single-file prototype split into modules — the original
is kept at `prototype/d20-buddy.html` if you want to see where it started. The
split changed none of the prototype's numbers: the moods, the springs, the
ballistics and the settle are the prototype's, verbatim. What the app adds is
who chooses the mood, and one mood the prototype had no need for — see below.
`src/client/vendor/three-d-stage.js` is a copied starter component with two
local changes, listed at the top of the file — re-copying it drops them.

The camera is the other thing the split changed. The framing is measured
against everything the die can do, hop included, rather than against where it
happens to be sitting, and it refits on resize — which the starter component's
one-shot vertical framing doesn't do.

## States

`idle` · `listening` · `thinking` · `speaking` — each a set of targets for
tremor, lean, rock, rock speed, free tumble and idle drift. It eases between
them, so transitions read as the same object changing mood rather than a cut.

The call maps onto them directly: `listening` from `speech_started` and between
turns, `thinking` from `speech_stopped` until the first audio frame, `speaking`
while there is audio booked, `idle` when there is no call.

**Entering `thinking` throws the die.** That is the whole conceit: the player
stops talking, the table goes quiet, the die goes up, and by the time the answer
starts it is sitting on a number the player can read. `rolling` owns the mood
for as long as it is in the air, whatever the conversation is doing.

There is one mood the prototype had no need for. `fumbled` is **what a broken
API looks like** — a failed dial, a proxy that isn't running, a missing key, an
error mid-call. The die turns up 1, the resin goes dead and loses its shine, the
edge ink fades, and it stops fidgeting entirely. It holds there until something
works again. The caption says what broke; a natural 1 is the part you can see
from across the room, and nothing else in the app turns one up on purpose.

Nothing here is a sine wave dressed up as motion. The hop is ballistic — real
gravity, real bounces, each one bleeding off angular velocity — and everything
else is a damped spring reacting to a landing. Stiff springs and heavy damping
are what make a small lump of resin read as heavy. While it talks, the shoves
come from onsets in the audio envelope, so the squash lands on consonants and it
looks like it is forming words.

## The transport seam

`session/index.js` exposes `on`, `start`, `stop`, `send`, `cancel`, `messages`,
`connected`, `busy`, `stale`, `state`, `model`, `voice` — and emits:

```
'state'        listening | thinking | speaking | idle
'caption'      the assistant transcript for this turn, in full
'user'         what the person said, in full
'level'        0..1 sustained amplitude, per frame
'pulse'        0..1 transient, one per discrete event
'interrupted'  the person talked over Nat
'tool'         a label while a server-side tool works, or null
'busy'         whether a response is in flight
'ready'        { model, voice } the proxy actually used
'done'         { usage }
'error'        { message }
```

Both transcript events carry the whole turn rather than an increment. That is
an xAI divergence worth knowing about: it renames OpenAI's
`input_audio_transcription.delta` to `.updated` and makes it *cumulative*, so
appending it gives you "hello hello there hello there nat". `events.js`
handles the two shapes apart — `.delta` appends, `.updated` replaces.

Nat takes audio-shaped input, which is the whole point of the split:

```js
nat.setState('speaking')  // idle | listening | thinking | speaking
nat.setLevel(0.62)        // sustained amplitude 0..1, sampled per frame
nat.pulse(0.4)            // transient impulse 0..1, one per discrete event
nat.roll()                // throw it; `nat.result` is what came up
nat.jolt(0.9)             // talked over: it hops, and keeps its face
nat.fumble(true)          // the API is unreachable — or, with false, it's back
```

Swapping providers means writing a different `createVoiceSession()` with that
surface. `main.js` and Nat do not change.
