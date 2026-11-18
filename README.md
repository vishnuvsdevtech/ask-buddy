# Ask Buddy

**Live:** https://vishnuvsdevtech.github.io/ask-buddy/

A portfolio assistant that runs entirely in the browser and wears a cartoon
creature instead of a chat widget. Thirty-five factual entries, BM25 retrieval,
zero network calls, zero API keys.

## Why it is built this way

A portfolio assistant has one job: tell a visitor what this person actually did,
without lying. That rules out a general model with your CV pasted into the
prompt — it will confidently embroider a metric. So the knowledge base stores
**finished answers**, each written the way you would say it out loud, and
retrieval chooses one. The assistant can quote a measured number because a human
wrote that number; when nothing scores highly enough it says "I don't know",
which is the only trustworthy failure mode.

## How retrieval works

1. **Tokenise** the question, strip stopwords, light-stem.
2. **Resolve pronouns** — "he", "him", "his" map to the subject's name, because
   they are stopwords and "who is he" would otherwise match nothing at all.
3. **Expand** with a small synonym table (cv ↔ computer vision, e-paper ↔ eink,
   nvr ↔ storage).
4. **Score** every entry with BM25 (k1 = 1.45, b = 0.72). Tags are repeated
   three times and example questions twice, so the author's own labels dominate
   over prose that happens to share a word.
5. **Threshold at 2.8.** Below that, refuse and offer the nearest topic.

No embeddings, no vector store, no model download — thirty-five entries do not
need any of it. Adding them would make the demo slower to start and no more
correct.

## The buddy

The creature is the interface, not decoration:

- **idle** — breathing bob, blinking on an irregular 2.2–5.8 s timer, eyes
  tracking the pointer with clamped pupils
- **thinking** — three orbiting dots, antenna pulsing, body rocking
- **talking** — mouth scaling while the answer types out
- **happy** — sparks on a good answer
- **shrug** — the honest "I don't know", followed by the closest thing it has

All states are CSS animations keyed off a single `data-state` attribute, so the
whole character is inspectable and none of it needs a canvas.

## What it is not

- Not a language model. It cannot paraphrase, so answers read like prose someone
  wrote — because someone did.
- Not connected to the portfolio yet; this is the standalone prototype.
- Not private in the cryptographic sense — it simply never sends anything
  anywhere, which you can verify in the network tab.

## Extending it

Add an entry to `assets/kb.js` with `tags`, example `q` strings, an `a` answer
and an optional `link`. Re-run nothing — retrieval rebuilds at load. The rule
that matters: only write facts you would defend in an interview, and never leave
a placeholder in an answer, because the assistant will repeat it verbatim.
