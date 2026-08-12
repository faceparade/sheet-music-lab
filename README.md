# Sheet Music Lab

A free, local-first learning portal for rhythm reading, drum notation, sight-reading fluency, and a bridge into piano pitch reading. It is designed around short daily sessions and the Roland TD-07 Coach modes.

## What is included

- Eight-week, 16-lesson curriculum
- Daily 22-minute practice planner
- Rhythm exercise generator and count guides
- TD-07 Coach-mode prompts and practice log
- Spaced-retrieval symbol deck
- Piano landmark-note bridge
- Curated supplies and evidence links
- Browser-local progress; no account or analytics
- Responsive static interface suitable for GitHub Pages

## Run locally

Requirements: Node.js for tests and Python (or any static server) for the site.

```bash
npm test
npm run check
npm run serve
```

Then open <http://localhost:4173>.

> Fetching the JSON curriculum requires a local web server. Opening `index.html` directly with `file://` will not work in most browsers.

## Project structure

```text
sheet-music-lab/
├── data/
│   ├── cards.json          # retrieval-practice cards
│   ├── curriculum.json     # modules, lessons, and exercises
│   └── resources.json      # external references and supplies
├── docs/
│   └── COURSE-GUIDE.md
├── src/
│   ├── app.js              # browser interface
│   └── portal-core.mjs     # tested learning/progress logic
├── tests/
│   └── portal-core.test.mjs
├── index.html
└── styles.css
```

## Deploy

### GitHub Pages

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`.
4. Choose `main` and `/ (root)`.

No build step is needed.

### Netlify or Vercel

Import the repository and use the repository root as the publish directory. No framework preset or build command is required.

## Curriculum design

The course uses active retrieval, distributed review, interleaved rhythm sets, genuinely unfamiliar examples, immediate timing feedback, and deliberate transfer from rhythm reading to pitch reading. Claims are kept conservative: these methods support learning, but the portal does not promise fixed percentage improvements.

## License

MIT
