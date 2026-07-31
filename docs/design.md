# Design notes

How Nat is put together. The [README](../README.md) covers running it;
[configuration](configuration.md) covers the knobs.

## How the call is wired

Every frame of audio goes through the Node process:

```
browser  ──ws──▶  /realtime  ──ws──▶  wss://api.x.ai/v1/realtime
```

Unlike OpenAI's Realtime API, the browser can't dial xAI directly.
`/v1/realtime/client_secrets` takes no `session` field, so a page dialling xAI
itself would have to send its own `session.update` — putting the persona, the
tool list and any MCP `authorization` header in client code. The token also
lasts five minutes, and conversations routinely outlive that.

So the socket lives here and the page holds no credential. On connect the proxy
sends `session.update` — persona, voice, turn detection, audio format, tools —
before forwarding anything the page queued.

What the page may send upstream is an allowlist: audio frames, a typed message,
a request to respond, a cancel, and the output of a function call it ran itself.
Two things are dropped as persona overrides — a `session.update` from the
browser, and the `instructions` field on a `response.create`.
`test/server/realtime.test.js` covers that.

One frame type never reaches xAI: `session.memory`, which the page sends with
what it has stored. The proxy folds those lines into the instructions and
re-sends its own `session.update`, so the persona stays here and the memories
stay in the browser.

## Audio

A WebSocket carrying base64 PCM leaves both directions to the client.

**Up:** an `AudioWorklet` (`public/pcm-worklet.js`) takes the mic at whatever
rate the hardware gives, resamples to 24 kHz with linear interpolation, and
posts 20 ms PCM16 frames. The `sampleRate` option on `AudioContext` is only a
hint, so the conversion is done rather than requested.

**Down:** chunks arrive faster than real time, so each is booked against a
cursor running ahead of the clock rather than played as it lands. That cursor is
also what makes barge-in work — interrupting drops everything booked but not yet
heard.

Turn-taking is server-side VAD. `input_audio_buffer.speech_started` tells the
page to drop its queue; a `response.created` arriving while audio is still
playing flushes it too, as a backstop. `Escape` cancels for the typed path.

The worklet lives in `public/` rather than being imported, because Vite inlines
small assets as `data:text/javascript` URLs and `addModule()` rejects those on
Safari and under any CSP that disallows `data:`.

## Storage

The log is one record per call under `nat.history.v1`; memory is a list of lines
under `nat.memory.v1`. Neither is uploaded — the proxy holds no copy of either.

The last 40 conversations are kept, and the oldest are shed to stay inside a
300 KB budget, since that space belongs to the whole origin. Private-mode Safari
hands back a store that throws on write, so the log falls back to memory for the
life of the page rather than failing the call.

Old turns are not replayed into a new call. That would make the log a memory
rather than a record, and `session.tools` has no path for it that doesn't also
let the page rewrite the persona.

Memory is capped at 25 lines, each flattened to one line and cut at 600
characters; past the cap the oldest goes. `remember` and `forget` run in the
page against browser storage, and the result goes back up as a
`function_call_output`. Editing the list during a call re-sends
`session.memory`, so a memory added mid-conversation is live in it; switching
memory off empties the block on the next `session.update` without deleting
anything.

Memories are text the person typed or dictated, so they land inside the prompt.
Flattening and capping them in `persona.js` keeps a memory from opening a new
instruction paragraph, and the persona is always first in the string.

## States

`idle` · `listening` · `thinking` · `speaking` — each a set of targets for
tremor, lean, rock, rock speed, free tumble and idle drift. It eases between
them, so transitions read as a change of mood rather than a cut.

The call maps onto them directly: `listening` from `speech_started` and between
turns, `thinking` from `speech_stopped` until the first audio frame, `speaking`
while there is audio booked, `idle` when there is no call.

**Entering `thinking` throws the die.** That's the conceit: the player stops
talking, the table goes quiet, the die goes up, and by the time the answer starts
it is sitting on a number the player can read. `rolling` owns the mood for as
long as it is in the air, whatever the conversation is doing.

`fumbled` is what a broken API looks like — a failed dial, a proxy that isn't
running, a missing key, an error mid-call. The die turns up 1, the resin goes
dead and loses its shine, the edge ink fades, and it stops fidgeting until
something works again. The caption says what broke; nothing else in the app
turns up a 1 on purpose.

The hop is ballistic — real gravity, real bounces, each one bleeding off angular
velocity — and everything else is a damped spring reacting to a landing.

## Picking it up

Drag the die and you're holding it. It follows the cursor anywhere in frame and
spins about the axis across its own direction of travel, so one drag across the
stage turns it a full revolution and a bit. Where it stops is where it stays;
the only thing it can't do is leave the frame.

Let go while it's still moving and you've thrown it. It flies, bounces, rolls
out, and lands on a real face — the same honest roll it makes for itself, so
`nat.result` is whatever you actually threw. Let go of it standing still and it
turns flat onto the nearest face. A throw arriving from the conversation while
you're holding it waits in your hand and resolves when you release. While it's
fumbled you can move it about, but it comes back up 1.

Dragging anywhere *other* than the die orbits the camera, unchanged. That
distinction is the point of `nat/grab.js`: OrbitControls swings the camera around
a fixed point, which isn't the same as touching the die.

## Layout

```
Dockerfile              Build the client, then serve it from src/server
index.html              Markup only — Vite's entry
prototype/              Where the character came from, as single-file pages
public/
  pcm-worklet.js        Mic → 24 kHz PCM16, on the audio thread
src/
  client/
    main.js             The wiring, and nothing else
    styles.css          The HUD around the die
    api.js              /api/config, as a function
    history.js          Past conversations, in localStorage
    memory.js           What it remembers between calls, in localStorage
    nat/                Geometry and animation. Knows nothing about transports
      index.js            The controller, the throw, and the per-frame loop
      geometry.js         The solid, the edge ink, and twenty numbered faces
      grab.js             The pointer: pick it up, spin it, throw it
      moods.js            Targets per conversational state
      environment.js      Cool studio env map
    session/            The call. Emits transport-agnostic events
      index.js            Lifecycle: mic, socket, meter, tear down
      socket.js           The WebSocket to our own proxy
      audio.js            Capture and playback over Web Audio
      codec.js            PCM16 ↔ base64
      events.js           xAI server events → this vocabulary
      tools.js            remember/forget, run in the page
      metering.js         An analyser → one 0..1 number per frame
      emitter.js
      constants.js        The wire format, shared with the server
    ui/
      hud.js              Status chip, transcript, caption, tool label
      history.js          The log panel behind the `log` button
      memory.js           The memory panel behind the `memory` button
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
docs/                   These notes, configuration, policies, screenshots
test/                   node:test, against a stub xAI socket
.github/workflows/      CI (lint, tests, build smoke test) and the Docker publish
```

`src/client/nat/` is the single-file prototype at `prototype/d20-buddy.html`
split into modules, with its numbers kept verbatim — the moods, the springs, the
ballistics and the settle are unchanged. What the app adds is who chooses the
mood, plus the `fumbled` mood. `src/client/vendor/three-d-stage.js` is a copied
starter component with two local changes, listed at the top of the file —
re-copying it drops them.

The camera is the other thing the split changed. The framing is measured against
everything the die can do, hop included, rather than where it happens to be
sitting, and it refits on resize — which the starter component's one-shot
vertical framing doesn't do.

## The transport seam

`session/index.js` exposes `on`, `start`, `stop`, `send`, `cancel`, `syncMemory`,
`messages`, `connected`, `busy`, `stale`, `state`, `muted`, `model`, `voice` —
and emits:

```
'state'        listening | thinking | speaking | idle
'caption'      the assistant transcript for this turn, in full
'user'         what the person said, in full
'level'        0..1 sustained amplitude, per frame
'pulse'        0..1 transient, one per discrete event
'interrupted'  the person talked over Nat
'tool'         a label while a tool works, or null
'message'      a completed turn, { role, content } — what the log stores
'busy'         whether a response is in flight
'ready'        { model, voice } the proxy actually used
'memory'       the result of a remember/forget the model just called
'done'         { usage }
'error'        { message }
```

Both transcript events carry the whole turn rather than an increment. xAI
renames OpenAI's `input_audio_transcription.delta` to `.updated` and makes it
cumulative, so appending it gives you "hello hello there hello there nat".
`events.js` handles the two shapes apart — `.delta` appends, `.updated`
replaces.

Nat takes audio-shaped input:

```js
nat.setState('speaking')  // idle | listening | thinking | speaking
nat.setLevel(0.62)        // sustained amplitude 0..1, sampled per frame
nat.pulse(0.4)            // transient impulse 0..1, one per discrete event
nat.roll()                // throw it; `nat.result` is what came up
nat.jolt(0.9)             // talked over: it hops, and keeps its face
nat.fumble(true)          // the API is unreachable — or, with false, it's back
```

Swapping providers means writing a different `createVoiceSession()` with that
surface. `main.js` and Nat don't change.
