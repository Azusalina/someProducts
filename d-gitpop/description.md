# Gitpop — Description

## What it does

- Pop a random repository with the button or Space (when not focused on another control).
- Filter by 3D & WebGL, animation, creative coding, or UI experiments.
- Explore a collection of 12 real repositories, each with an original build prompt.
- Shuffle bags visit every repo in a topic before repeating and prevent consecutive repeats.
- Bookmark discoveries in browser local storage; browse or remove them in Saved.
- Original canvas visual studies react to the pointer; animations can be paused and respect reduced motion.
- Works on narrow mobile screens and supports keyboard navigation and screen reader announcements.

The collection is curated, not a live GitHub search. No credentials or GitHub API requests are required. Each card links to its source repository. Descriptions were checked against those sources on October 2, 2026. The visual studies are original conceptual sketches, not embedded demos or screenshots of the repositories. External Google Fonts are optional; system fonts work offline.

## Build and verify

```sh
npm test
npm run build
```

Deploy `dist/` to any static host. The development server binds to loopback by default.

## Add a discovery

Add an entry in `src/repos.js`: a real `owner/repository` ID, title, description, category, language, tags, inspiration prompt (`spark`), color, caption, and one of the visual types (`brain`, `fluid`, `orbit`, `wave`, `type`, `flow`, or `burst`). Check the repository README first. Counts and filters update automatically.
