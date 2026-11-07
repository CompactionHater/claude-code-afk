import type { EngineInterface, Register } from 'claude-code'

// One engine process per session, so this is per-session state.
// shortcut: AFK is forgotten on restart or /resume; keep it in $.store if that bites.
let away: { since: string; log: string } | undefined

// The person themself: Enter at the terminal, or Remote Control. Agent results, peers, schedules and plugins are not.
const PERSON = new Set(['composer', 'bridge'])

const rules = (log: string) => `The user has gone AFK and cannot answer until they return.
- Do not ask questions, wait for input, or end a turn with things for the user to do.
- Where you would ask, take the safest reasonable choice and carry on. Anything destructive, irreversible or outward-facing (deleting, sending, publishing, spending): don't do it; log it as a question.
- Log as you go to ${log} (create it with Write, then add to it with Edit), one line per item under these headings:
  ## Heads up - a result that may be off, a risk, or something you did that the user would want flagged
  ## Questions - what you would have asked, and the choice you went with
  ## Tasks for the user - things only they can do
  ## Decisions - what you chose and why
  ## Improvements - things worth fixing or doing next that you noticed
- Write each line for someone who saw none of this session: name the exact file, command, PR or result it is about; never "the fix", "this approach" or "the experiment" without saying which; plain words before identifiers; say what is true now, not the story of getting there.
- When nothing is left that you can do, end the turn.`

// After cc-plugin-you-should-know's observer: a second look the main agent cannot give its own work.
const observer = (since: string) => `The user went AFK at ${since} and is back now. As an observer, look over what happened in this session since then and find what they should really know that they would likely miss in a skim: a decision made on their behalf, something not highlighted, a result that may be off, or a concept that matters for their work. Give at most 3 items, most important first, each one or two sentences in plain words (no code names unless the user used them) that make sense to someone who saw none of the session (name the exact file, command or result; never "this approach" or "the change" without saying which), each starting "Heads up:" (this session's work, with a cost if missed) or "You should know:" (how something works that matters for their work). If nothing qualifies, answer exactly: none`

async function comeBack($: EngineInterface) {
  const a = away!
  away = undefined
  $.ui.status('Welcome back: preparing your brief...')
  const [log, seen] = await Promise.all([
    $.fs.exists(a.log).then(ok => (ok ? $.fs.read(a.log) : '')),
    $.model.fork({ prompt: observer(a.since), effort: 'low' }),
  ])
  const notes = seen.isAnswered && seen.text.trim().toLowerCase() !== 'none' ? `## You should know (side check)\n${seen.text.trim()}\n\n` : ''
  const brief = `${notes}${log.trim() || 'Nothing was logged.'}`
  await $.fs.write(a.log, brief + '\n').catch(() => undefined) // keep the whole brief on file
  $.ui.status(undefined)
  return { since: a.since, log: a.log, brief }
}

const WAKE = 'I am going AFK now. Carry on under the AFK rules: if you were waiting on me, take the safest choice, log it, and continue.'

const REASK =
  'Ask the user every item under ## Questions again with AskUserQuestion, the choice you took as the first option marked (Recommended), and act on any answer that differs from your choice.'

const backNote = (b: { since: string; brief: string }) =>
  `The user is back from AFK (away since ${b.since}); the AFK rules no longer apply. Open your reply with this brief, kept short, then answer their message. ${REASK}\n\n${b.brief}`

const hasQuestions = (brief: string) => /^## Questions\s*\n\s*- /m.test(brief)

async function goAway($: EngineInterface) {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
  const now = new Date()
  const since = now.toTimeString().slice(0, 5)
  away = { since, log: `${dir}/afk/${await $.session.id()}-${now.toISOString().replace(/[:.]/g, '-')}.md` }
  $.ui.status(`AFK since ${since}: Claude logs instead of asking. Type afk when back`)
  return away.log
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const name of ['afk', 'brb'])
      await $.command.register({ name, description: 'Toggle AFK: Claude logs questions, tasks and decisions instead of asking, and briefs you when you are back' })
    return next(e)
  })

  for (const command of ['afk', 'brb'])
    on('command.run', { command }, async $ => {
      if (away) {
        const b = await comeBack($)
        // The brief is shown as is; a turn is only spent when there are questions to put to the user again.
        if (hasQuestions(b.brief)) $.clock.after(0, () => $.prompt.submit({ text: `I am back. ${REASK}` }).catch(err => $.ui.log(`re-ask failed: ${err}`)))
        return { text: `Back (away since ${b.since}). Brief, also in ${b.log}:\n\n${b.brief}`, context: ['The user is back; the AFK rules no longer apply.'] }
      }
      const log = await goAway($)
      // Wakes a Claude that is waiting on the user. Deferred: the engine refuses a submit made inside command.run.
      $.clock.after(0, () =>
        $.prompt
          .submit({ text: WAKE })
          .then(r => r.drop && $.ui.log(`wake message dropped: ${r.drop}`))
          .catch(err => $.ui.log(`wake message failed: ${err}`)),
      )
      return { text: `AFK on. Log: ${log}`, context: [rules(log)] }
    })

  on('prompt.submit', async ($, e, next) => {
    if (e.command) return next(e)
    const person = PERSON.has(e.origin.kind) && !e.isMeta
    // A plain "afk" message works mid-turn: it reaches the running turn at its next step, where /afk waits for the turn to end.
    if (person && /^(afk|brb)$/i.test(e.text.trim())) {
      if (!away) return next({ ...e, text: WAKE, context: [...(e.context ?? []), rules(await goAway($))] })
      return next({ ...e, text: 'I am back.', context: [...(e.context ?? []), backNote(await comeBack($))] })
    }
    if (!away) return next(e)
    if (person) return next({ ...e, context: [...(e.context ?? []), backNote(await comeBack($))] })
    if (e.origin.kind === 'plugin') return next(e)
    return next({ ...e, context: [...(e.context ?? []), `The user is still AFK: don't ask or wait; log to ${away.log}.`] })
  })

  on('tool.check', { tool: 'AskUserQuestion' }, (_$, e, next) =>
    away
      ? { decision: 'deny', reason: `The user is AFK. Log this under ## Questions in ${away.log} with the option you chose, and carry on with it.` }
      : next(e),
  )
}
