/**
 * What the die is doing per conversational state.
 *
 * These are the prototype's five modes, verbatim — the same numbers that were
 * behind its idle/listening/thinking/rolling/talking buttons, with `talking`
 * renamed to `speaking` to match the vocabulary the session speaks. Nothing
 * about the motion changed on the way into this app; what changed is who
 * presses the buttons. The call does.
 *
 *   `jitter`     tremor amplitude — how badly it is holding still
 *   `lean`       fore/aft tilt; negative leans in, positive leans back
 *   `rock`       how far it rocks side to side
 *   `rockSpeed`  how fast
 *   `tumble`     a lazy free tumble, with no throw behind it
 *   `spinIdle`   a slow drift about the vertical, so a resting die still lives
 */
export const MOODS = {
  // Sitting on the table between turns.
  idle: { jitter: 0.06, lean: 0.0, rock: 0.05, rockSpeed: 1.0, tumble: 0, spinIdle: 0.10 },
  // Leaning in, held still, waiting for the player to finish.
  listening: { jitter: 0.03, lean: -0.13, rock: 0.11, rockSpeed: 1.6, tumble: 0, spinIdle: 0.04 },
  // Weighing the odds. Entering this state also throws the die — see index.js.
  thinking: { jitter: 0.12, lean: 0.08, rock: 0.02, rockSpeed: 1.0, tumble: 0.55, spinIdle: 0 },
  // Narrating, with the result of the last throw still face up.
  speaking: { jitter: 0.16, lean: 0.04, rock: 0.04, rockSpeed: 1.5, tumble: 0.22, spinIdle: 0.06 },

  /* --- the one nobody selects ---------------------------------------------- */

  // Mid-throw: full tumble, no idle drift, nothing else competing for the
  // rotation. Held from the moment it leaves the table until it settles.
  rolling: { jitter: 0.20, lean: 0.10, rock: 0.02, rockSpeed: 1.0, tumble: 1, spinIdle: 0 },
};

/**
 * How far a full-energy voice pushes each channel past its state baseline.
 *
 * Additive, and zero when nothing is making sound — with the mic off, every
 * mood is exactly the mood above.
 */
export const ENERGY_GAIN = { jitter: 0.5, rock: 0.045, rockSpeed: 0.8 };
