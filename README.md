# Nat

A tabletop voice agent rendered as a twenty-sided die. It runs the game:
describes the room, plays everyone in it, and rolls itself when something is
uncertain. It runs on an xAI Grok speech-to-speech session, and the tumble, hop
and squash are driven by the live audio, so it moves with whichever of you is
talking.

The rolls are real, and they are for you rather than for it. The die tumbles
freely, whatever lands nearest the ceiling is the result, and it is turned flat
to the top rather than picked first and animated to — so the number you can see
is the number that came up.

The model never learns that number. Nothing reads the settled face back to it,
which is why the persona is told never to state one: it narrates around a roll
you are reading yourself. Handing the result to the model is
[not implemented](docs/design.md#natresult-has-no-consumer-yet).

It can search the web and X, and call remote MCP servers. It also remembers
what you tell it to, between calls.

![Nat in a desktop browser](docs/screenshots/desktop.png)

<p align="center">
  <img src="docs/screenshots/mobile.png" alt="Nat on a phone" width="300">
</p>

## Run

```sh
npm install
cp .env.example .env      # add your XAI_API_KEY
npm run dev               # → http://localhost:5173
```

Click the mic, allow the browser's microphone prompt, and say what you do. Talk
over it and it stops — and hops.

Drag the die and you're holding it; let go while it's still moving and you've
thrown it, and it lands on a real face. Dragging anywhere else orbits the
camera.

Tapping the mic is the microphone switch: turning it off stops what you send and
leaves the answer playing, and the conversation is still there when you turn it
back on. It also switches itself off after a minute of silence, and the call
survives that too. Holding the mic down is the hang-up — a ring closes around it
while you hold, and the call ends when it lands.

`tools` has a switch for each tool it can reach for — web search, X search, and
any MCP server the environment gave it. Switching one off takes it out of the
call already in progress, and it stays off in that browser until you switch it
back on. Nothing there can add a tool the server was not started with.

The log keeps every conversation. `continue` on one picks it back up: the call is
dialled again with those turns handed over as context, and what you say from
there lands in the same entry rather than a new one.

| Script | |
|---|---|
| `npm run dev` | Vite, with the proxy mounted as middleware — one process |
| `npm run dev:lan` | The same, over HTTPS on the network — for a phone |
| `npm run build` | Bundles the client to `dist/` |
| `npm start` | Serves `dist/` with the same proxy in front |
| `npm run preview` | `build` then `start` |
| `npm run preview:lan` | `build` then `start`, over HTTPS on the network |
| `npm test` | `node:test`, against a stub xAI socket |
| `npm run lint` | ESLint |

CI runs the lint, the tests on Node 22.12 and 24, and a build that then has to
boot and serve itself over both HTTP and HTTPS. CodeQL scans the same source on
every push and again weekly, since its queries change faster than this does.

To run it on a phone, or in Docker, see
[configuration](docs/configuration.md#on-a-phone).

## Docs

- [**Configuration**](docs/configuration.md) — every environment variable, the
  HTTPS setup a phone needs for microphone access, Docker, and the tools.
- [**Design notes**](docs/design.md) — how the call is wired, the audio path,
  what's in `localStorage`, the moods and the throw, the source layout, and the
  seam another provider would have to implement.
- [**AI Output Disclaimer**](docs/ai-output-disclaimer.md) — what the model says
  is the model's, not the author's, plus the risks that are specific to a live
  microphone and speech you hear before anyone can check it.
- [**Not a Companion**](docs/not-a-companion.md) — Nat is a toy and a demo.
  It is not a friend, a therapist, or a partner, and the project will not grow in
  that direction.
