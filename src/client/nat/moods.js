export const MOODS = {
  idle: { jitter: 0.06, lean: 0.0, rock: 0.05, rockSpeed: 1.0, tumble: 0, spinIdle: 0.10 },
  listening: { jitter: 0.03, lean: -0.13, rock: 0.11, rockSpeed: 1.6, tumble: 0, spinIdle: 0.04 },
  thinking: { jitter: 0.12, lean: 0.08, rock: 0.02, rockSpeed: 1.0, tumble: 0.55, spinIdle: 0 },
  speaking: { jitter: 0.16, lean: 0.04, rock: 0.04, rockSpeed: 1.5, tumble: 0.22, spinIdle: 0.06 },

  rolling: { jitter: 0.20, lean: 0.10, rock: 0.02, rockSpeed: 1.0, tumble: 1, spinIdle: 0 },
};

export const ENERGY_GAIN = { jitter: 0.5, rock: 0.045, rockSpeed: 0.8 };
