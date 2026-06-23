# AGENTS.md

## Cursor Cloud specific instructions

This is a **zero-dependency static website** — pure HTML/CSS/JS with no build system, no package manager, and no framework.

### Running the dev server

```bash
python3 -m http.server 8080 --directory /workspace
```

Then open `http://localhost:8080/`. There is no build step.

### Project structure

- `index.html` — homepage with section grid and service-request modals
- `assets/site.css`, `assets/site.js` — shared styles and scripts
- Section pages: `disegni/`, `vasi/`, `coltivazione/`, `installazioni/`, `luci/`, `blog/`, `ricerca/`, `drone/`, `nft/` — each has its own `index.html`
- `tools/` — internal generative tools (Cuore_Statico audio tool, Barene_Frame biomorphic generator); protected by Cloudflare Access in production but accessible locally without auth

### Linting / testing

There is no configured linter, test runner, or build pipeline. Validation is manual: serve the site and check pages in a browser. For markup validation, use an external HTML validator or browser DevTools.

### Deployment

Cloudflare Pages auto-deploys on push to `main`. No build command; output directory is `/`.
