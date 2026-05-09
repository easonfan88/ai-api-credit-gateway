module.exports = {
  packages: {
    starter: { id: "starter", name: "Starter", priceCents: 999, credits: 1000 },
    builder: { id: "builder", name: "Builder", priceCents: 2499, credits: 3000 },
    studio: { id: "studio", name: "Studio", priceCents: 7999, credits: 12000 }
  },
  models: {
    "mock-fast": { provider: "mock", displayName: "Mock Fast", creditsPer1kInput: 1, creditsPer1kOutput: 2, minCredits: 1 },
    "gpt-4o-mini": { provider: "openai", displayName: "GPT-4o mini", creditsPer1kInput: 2, creditsPer1kOutput: 8, minCredits: 1 },
    "gpt-4.1-mini": { provider: "openai", displayName: "GPT-4.1 mini", creditsPer1kInput: 3, creditsPer1kOutput: 12, minCredits: 2 }
  }
};
