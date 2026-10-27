# ICT Unit C study pages: description

## Purpose

The source `../notes/c.pdf` is a dense set of exam notes. These pages restate it in plain words, group facts into tables, and animate the processes that are hard to picture from text alone.

## File inventory

| File | Content |
|---|---|
| `index.html` | Unit overview, a "follow one click" walkthrough linking all chapters, and a table of mistakes found in the notes |
| `ch16-networking.html` | LAN/WAN, peer-to-peer vs client/server, network services, wireless, links, Internet access methods, hardware, cables |
| `ch17-protocols.html` | Protocols and ports, OSI model, TCP/IP, IP addresses, DNS, URL |
| `ch18-services.html` | Search engines, evaluating information, file types, Internet services, streaming, e-commerce and other applications |
| `ch19-html.html` | HTML basics, HTTP, tag reference, colour codes, anchors, frames |
| `ch20-web-authoring.html` | Planning and building a site, relative and absolute paths, site structures, Dreamweaver |
| `assets/style.css` | Shared styles: Apple-inspired design system (see Design), light and dark themes |
| `assets/app.js` | Shared script: glass navigation and section sub-nav, tonal sections, scroll reveal, hero animations, previous/next tiles, animation and quiz helpers |

Each chapter page keeps its own demo scripts inline at the bottom of the file.

## Design

Redesigned (2026-10-16) with an Apple-product-page language. This is an approximation of that style, not Apple code or assets.

- System font stack (`-apple-system`, SF Pro where the device has it), large tight headlines, generous spacing.
- Glass navigation bar, plus a sub-nav of section links that slides in after the hero is scrolled past.
- Each chapter opens with a hero: kicker, title, short subtitle, and a live animation of the chapter's core idea.
- Content grouped into full-width sections that alternate two background tones; cards and tables use soft tinted shadows.
- One blue accent. Shape rule: controls are pills, cards are 24px, inner elements are 12px.
- Scroll reveal and a reading-progress bar. Everything honours `prefers-reduced-motion` (heroes and reveals become static) and `prefers-color-scheme` (dark theme).
- Content, file names, anchor ids and chapter order are unchanged from the first version.

## Interactive features

- Ch16: request path in peer-to-peer vs client/server, file transfer time calculator, hub vs switch, modem wave drawing.
- Ch17: step-by-step OSI wrapping and unwrapping, packets arriving out of order and being sorted by TCP, IPv4 address explorer (class, network and host bits), DNS lookup, clickable URL anatomy.
- Ch18: Boolean search tester, bitmap vs vector zoom, e-mail delivery path, download-first vs streaming race.
- Ch19: HTTP request and response walkthrough, live HTML editor with preview, RGB hex colour mixer, frame `target` demo.
- Ch20: relative path calculator over a sample folder tree, four site structures with a visitor walk.
- Index: a visual "follow one click" journey (browser, router, DNS server, web server) and a chapter pipeline that lights up in order.
- Hero animations: Ch16 packets crossing a switch, Ch17 headers wrapping data into a frame, Ch18 a Boolean search filtering results, Ch19 tags typed with a live preview, Ch20 a site tree drawing itself.
- New quizzes: Ch16 "Which device is it?" (hub, switch, bridge, router, modem, repeater) and Ch18 "Judge the page" (six information checks), both with instant feedback and a score.

## Method and assumptions

- The PDF was read both as text (`pdftotext`) and as page images, because tables and diagrams did not extract cleanly. The `markitdown` tool was tried first but its PDF dependency is not installed here, so `pdftotext` was used instead.
- Content follows the notes. Where the notes are wrong or unclear, the page says so in an orange "Notes unclear" box and the index lists all of them:
  - FTP port: notes say 20; port 20 is data and port 21 is control.
  - The data link layer unit is a frame, not a packet.
  - OSI layer numbers in the notes run top to bottom; the official numbering is reversed.
  - "1/number is proportional to security level" is not a real rule.
  - DNS is Domain Name System, not "Server".
  - "ETF" should be EFT.
  - The `../` path symbol is written `.../` in the notes.
  - In the notes, the font face appears under the BODY `text` attribute; it is set by `<FONT face>`.
- A few short "Extra explanation" lines (POP vs IMAP, port 21, why satellite uses microwaves) go slightly beyond the notes and are labelled as such or kept in the correction boxes.
- Numbers in the demos (animation timings, example file sizes, the example IP address 203.0.113.25) are illustrative. The transfer-time calculator shows the theoretical best case.

## Limitations

- The search tester is a simplified model: AND, OR and NOT must be capital letters and there is no ranking.
- The frame demo is a drawn diagram, not real HTML frames, because modern browsers no longer support them.
- The pages use only plain HTML, CSS and JavaScript, with no external libraries, fonts or images, so they work offline.
- The other units (`a.pdf`, `b.pdf`, `d.pdf`, `e.pdf`) are not covered yet.

## Development and maintenance

- To add a chapter, copy an existing chapter page, add its entry to the `chapters` list in `assets/app.js`, and link it from `index.html`.
- Visible text uses plain hyphens only (no long dashes). Keep new content in the same register: short sentences, tables for exam facts, and an animation only when it explains a process.
- Demo helpers: `U.move` (animate an SVG element between two points), `U.sleep`, `U.svg`, `U.$`, `U.$$`.

## Validation

- All six pages load in headless Chromium with no console errors, with animations running and with reduced motion forced.
- Screenshots reviewed in light mode (desktop), dark mode (desktop, tokens forced) and phone width (index).
- Both new quizzes were exercised by simulated clicks (correct and incorrect answers).
- Long code in tables wraps.
- Search of all files confirms no em-dash or en-dash characters.

## History

- 2026-10-16: first version, Unit C only (Ch16 to Ch20).
- 2026-10-16: visual redesign in an Apple-inspired style; added hero animations, a visual journey demo and two quizzes.
