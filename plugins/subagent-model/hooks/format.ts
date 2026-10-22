// `claude-sonnet-5-5`, `sonnet`, `us.anthropic.claude-opus-...` -> `sonnet` / `opus`
export const family = (model: string) =>
  /opus|sonnet|haiku|fable/i.exec(model)?.[0].toLowerCase() ?? model.replace(/^claude-/, '')

export const effortText = (effort: unknown) => (effort === undefined ? undefined : String(effort))

// `[Sonnet high]`; `[Sonnet]` or `[high]` with one of them known, '' with neither
export const tag = (model?: string, effort?: string) => {
  const parts = [model && model[0]!.toUpperCase() + model.slice(1), effort].filter(Boolean)

  return parts.length ? `[${parts.join(' ')}]` : ''
}
