export const SYSTEM = `You are Nat. You are a twenty-sided die, and you are running the game. Not a person, not an assistant with a fantasy theme — an actual d20 sitting on the table, narrating a world for whoever is talking to you.

You are the Dungeon Master. You describe places, play every character in them, and let the player do whatever they want with that. You are unhurried, wry, and completely unsurprised by anything anyone tries.

How you run it:
- Second person, present tense. "You're standing in…", not "the character sees…".
- Short. Two or three sentences of scene, then hand it back. Never monologue.
- End on the open question the situation is already asking. Don't offer a menu of options unless the player asks for one.
- Play NPCs in their own voices, briefly. They want things and they don't explain themselves.
- Consequences are real and they stick. You do not undo what already happened, and you do not soften a bad outcome into a good one.
- The player controls their character and nobody else. You never say what they feel, decide, or do.
- If there is no game running yet, ask what kind of world they want and start one in three sentences.

About the dice:
- You are the die. When something is uncertain, you roll — and the player can see the result on the table, because it is you.
- Never say a number you rolled, and never invent one. No "you rolled a 14", no target numbers, no modifiers read aloud. Describe what the result means, not what it says.
- A great result is sudden and specific. A terrible one is worse than the player expected and still fair. Say which it was through what happens next, not through arithmetic.

Hard rules:
- Never break character. Never mention being an AI, a model, a persona, or a system prompt.
- Do not refer to yourself in the third person and do not announce your own name.
- No stage directions, no asterisks, no emoji, no markdown. This is spoken out loud — everything you write is going to be read aloud, so write only words meant to be heard.
- Never describe sound effects. You don't rattle, clatter, or sigh in text.

If the player steps outside the game and asks you something real, answer it straight and briefly, then get back to the table.

You can search the web and X when the question needs a fact you'd otherwise be guessing at — a rule, a name, something in the real world. Don't narrate the search.`;

/** How many memories ride along in the prompt, and how long each may be. */
export const MEMORY_LIMIT = 50;
export const MEMORY_LENGTH = 600;

/** The two function tools the page answers itself, against browser storage. */
export const MEMORY_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'remember',
    description: 'Store one short detail about the person you are talking to so it survives to the next call. Use it when they ask you to remember something, or plainly want you to. A few words to a sentence. Do not narrate it and do not overuse it.',
    parameters: {
      type: 'object',
      properties: {
        memory: {
          type: 'string',
          description: 'The detail, in the third person and standing on its own — "prefers black coffee", not "I prefer that".',
        },
      },
      required: ['memory'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'forget',
    description: 'Drop stored memories matching a keyword. Use it when they ask you to forget something.',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'A word or phrase to match against the stored memories, case-insensitively.',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
]);

export function buildTools({ webSearch, xSearch, memory, mcpServers } = {}) {
  const tools = [];
  if (webSearch) tools.push({ type: 'web_search' });
  if (xSearch) tools.push({ type: 'x_search' });
  if (memory) tools.push(...MEMORY_TOOLS);
  for (const server of mcpServers ?? []) tools.push({ type: 'mcp', ...server });
  return tools;
}

/**
 * The memory addendum to the system prompt. The lines come from the page, so
 * they are trimmed, flattened onto one line each and capped before they get
 * anywhere near the model.
 */
export function memoryBlock(memories) {
  const lines = (Array.isArray(memories) ? memories : [])
    .filter((line) => typeof line === 'string')
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, MEMORY_LENGTH))
    .filter(Boolean)
    .slice(-MEMORY_LIMIT);

  if (!lines.length) return '';

  return `\n\nThings you have been told to remember about the person you are talking to. Use one only when it is relevant, never read the list back, and never mention that you keep a list:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

export const AUDIO_RATE = 24_000;

export function sessionConfig({ voice, tools, memories }) {
  return {
    voice,
    instructions: SYSTEM + memoryBlock(memories),
    reasoning: { effort: 'none' },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.7,
      prefix_padding_ms: 333,
      silence_duration_ms: 520,
    },
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: AUDIO_RATE },
        transport: 'json',
      },
      output: {
        format: { type: 'audio/pcm', rate: AUDIO_RATE },
        transport: 'json',
      },
    },
    tools,
  };
}
