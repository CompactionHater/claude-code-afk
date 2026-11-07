# afk: a Claude Code plugin for when you step away

Type `afk` before you leave the keyboard. Until you come back, Claude does not stop to ask you anything. It makes the safest reasonable choice, keeps working, and writes down what you need to know. When you return, you get a short brief, and Claude asks you its open questions again so you can confirm or change each choice.

## Install

```
/plugin marketplace add CompactionHater/claude-code-afk
/plugin install afk@claude-code-afk
```

Tested on Claude Code 2.1.319. The plugin is a hooks module (`hooks/register.ts`), so it needs a Claude Code version that loads plugin modules.

## Use

| You type | What happens |
|---|---|
| `afk` or `brb` as a message | AFK turns on. This works while Claude is working: the message reaches the running turn at its next step. |
| `/afk` or `/brb` | The same, but the engine runs slash commands only between turns, so a `/afk` typed mid-turn waits for the turn to end. |
| Your next message, whatever it says | You are back: Claude opens its reply with the brief. |
| `/afk` again | You are back: the brief is shown as it is, and Claude replies only to ask its logged questions again. |

While AFK is on:

- The status line under the prompt shows `afk: AFK since HH:MM`.
- Claude logs one line per item under five headings: **Heads up** (results that may be off, risks), **Questions** (what it would have asked and the choice it took), **Tasks for the user**, **Decisions**, and **Improvements**.
- The question dialog (`AskUserQuestion`) is refused. Claude logs the question with the option it chose and carries on.
- Anything destructive, irreversible or outward-facing (deleting, sending, publishing, spending) is not done. It is logged as a question instead.
- Background task results and messages from other agents do not end AFK. Only your own messages, typed at the terminal or through Remote Control, do.

## The brief

When you come back, one extra model call reviews the session since you left. It looks for what you would likely miss in a skim: a decision made for you, something not highlighted, or a result that may be off. Its findings go first in the brief, under **You should know (side check)**. The idea comes from the `cc-plugin-you-should-know` plugin that ships inside Claude Code.

Each away period has its own log file: `$CLAUDE_CONFIG_DIR/afk/<session id>-<start time>.md` (`~/.claude/afk/` by default). The file keeps the full brief after you return.

If the log has questions, Claude asks each one again in the question dialog, with the choice it took as the first option, and changes its work for any answer that differs.

## Limits

- AFK state lives in the session's process. A restart or `/resume` turns it off; the log file stays.
- Claude follows the AFK rules as instructions. Only the question dialog is blocked outright; other tools run under your usual permission settings.
- The plugin sends nothing anywhere. The side check is one call to the model your session already uses.

## License

Apache License 2.0, see [LICENSE](LICENSE).
