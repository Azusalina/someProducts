//! One full frame: header, tree canvas, dashboard, status line and modals.
use crate::{
    app::{App, Modal},
    font::{Face, Fonts},
    layout::{Metrics, TreeLayout},
    model::{NodeRef, clean},
    paint::{Canvas, Rect},
    theme::Theme,
};
use std::{
    path::PathBuf,
    rc::Rc,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Control {
    Minimize,
    Maximize,
    Close,
}

#[derive(Default)]
pub struct Hits {
    pub nodes: Vec<(Rect, NodeRef)>,
    pub header: Rect,
    pub controls: Vec<(Rect, Control)>,
    pub crumbs: Vec<(Rect, PathBuf)>,
    pub modal: Option<Rect>,
    pub rows: Vec<(Rect, usize)>,
    pub tree: Rect,
    pub caret: Option<Rect>,
}

pub struct ViewState {
    pub layout: Option<TreeLayout>,
    pub dirty: bool,
    pub cam: (f32, f32),
    sel_ptr: usize,
    sel_from: Rect,
    sel_now: Rect,
    sel_t0: Instant,
    last: Instant,
    pub hover: Option<usize>,
    pub hover_control: Option<Control>,
    pub client_decorations: bool,
}

impl ViewState {
    pub fn new(client_decorations: bool) -> Self {
        Self {
            layout: None,
            dirty: true,
            cam: (0.0, 0.0),
            sel_ptr: 0,
            sel_from: Rect::default(),
            sel_now: Rect::default(),
            sel_t0: Instant::now(),
            last: Instant::now(),
            hover: None,
            hover_control: None,
            client_decorations,
        }
    }
}

fn ease(t: f32) -> f32 {
    1.0 - (1.0 - t.clamp(0.0, 1.0)).powi(3)
}

struct Ctx<'f> {
    fonts: &'f mut Fonts,
    t: Theme,
    s: f32,
}

impl Ctx<'_> {
    #[allow(clippy::too_many_arguments)]
    fn text(&mut self, c: &mut Canvas, x: f32, top: f32, h: f32, text: &str, face: Face, size: f32, color: u32) -> f32 {
        let base = self.fonts.baseline(face, size, top, h);
        self.fonts.draw(c, x, base, text, face, size, 0.0, color, 255)
    }
    /// Uppercase, letter-spaced micro label.
    fn caps(&mut self, c: &mut Canvas, x: f32, top: f32, h: f32, text: &str, color: u32) -> f32 {
        let size = 9.5 * self.s;
        let base = self.fonts.baseline(Face::Medium, size, top, h);
        self.fonts
            .draw(c, x, base, &text.to_uppercase(), Face::Medium, size, 1.4 * self.s, color, 255)
    }
    fn caps_width(&mut self, text: &str) -> f32 {
        self.fonts
            .measure(&text.to_uppercase(), Face::Medium, 9.5 * self.s, 1.4 * self.s)
    }
    /// Key cap followed by its action, e.g. [⏎] place.
    fn hint(&mut self, c: &mut Canvas, x: f32, top: f32, h: f32, key: &str, what: &str) -> f32 {
        let s = self.s;
        let size = 10.5 * s;
        let kw = self.fonts.measure(key, Face::Mono, size, 0.0) + 10.0 * s;
        let kh = 17.0 * s;
        let ky = (top + (h - kh) / 2.0).round();
        c.rrect(Rect::new(x, ky, kw, kh), 3.0 * s, self.t.hair, 255);
        let base = self.fonts.baseline(Face::Mono, size, ky, kh);
        self.fonts.draw(c, x + 5.0 * s, base, key, Face::Mono, size, 0.0, self.t.text, 255);
        let w = self.caps(c, x + kw + 6.0 * s, top, h, what, self.t.dim);
        kw + 6.0 * s + w + 16.0 * s
    }
    fn hint_width(&mut self, key: &str, what: &str) -> f32 {
        let s = self.s;
        self.fonts.measure(key, Face::Mono, 10.5 * s, 0.0) + 10.0 * s + 6.0 * s + self.caps_width(what) + 16.0 * s
    }
}

pub fn draw(
    canvas: &mut Canvas,
    app: &mut App,
    fonts: &mut Fonts,
    theme: Theme,
    scale: f32,
    vs: &mut ViewState,
) -> (Hits, bool) {
    let now = Instant::now();
    let dt = now.duration_since(vs.last).as_secs_f32().min(0.1);
    vs.last = now;
    let s = scale;
    let (w, h) = (canvas.w as f32, canvas.h as f32);
    let mut hits = Hits::default();
    let mut animating = false;
    let mut cx = Ctx { fonts, t: theme, s };
    canvas.clear(theme.bg);
    app.prepare();

    let header_h = (46.0 * s).round();
    let status_h = (30.0 * s).round();
    app.column = cx.fonts.measure("0", Face::Mono, 12.0 * s, 0.0);
    app.window_columns = (w / app.column) as usize;
    let panel_w = if app.dashboard && app.window_columns >= 70 {
        (app.browser.conf.dashboard_columns(app.window_columns) as f32 * app.column).round()
    } else {
        0.0
    };
    let tree = Rect::new(0.0, header_h, w - panel_w, h - header_h - status_h);
    hits.tree = tree;
    let m = Metrics::new(s, app.gui.font_size, &app.browser.conf);
    app.view_rows = (tree.h / m.row).max(1.0) as usize;

    // ---- tree ------------------------------------------------------------------
    if vs.dirty || vs.layout.is_none() {
        vs.layout = Some(TreeLayout::new(&app.browser, cx.fonts, &m));
        vs.dirty = false;
    }
    let layout = vs.layout.take().unwrap();
    let (pad_x, pad_y) = ((30.0 * s).round(), (22.0 * s).round());
    let view_w = tree.w - pad_x * 2.0;
    let view_h = tree.h - pad_y * 2.0;
    let selected = app.browser.selected.clone();
    let sel_item = layout.find(&selected);
    if app.focus {
        if let Some(item) = sel_item {
            let (mx, my) = (48.0 * s, m.row * 1.5);
            if item.y - my < app.top {
                app.top = item.y - my;
            }
            if item.y + m.row + my > app.top + view_h {
                app.top = item.y + m.row + my - view_h;
            }
            let right = item.x + item.w + if app.link_target.is_some() { 0.0 } else { 0.0 };
            if item.x - mx < app.left {
                app.left = item.x - mx;
            }
            if right + mx > app.left + view_w {
                app.left = (right + mx - view_w).min(item.x - mx);
            }
        }
        app.focus = false;
    }
    app.left = app.left.min((layout.width - view_w + 40.0 * s).max(0.0)).max(0.0);
    app.top = app.top.min((layout.height - view_h + m.row).max(0.0)).max(0.0);
    if app.gui.animations {
        let k = 1.0 - (-dt / 0.065).exp();
        for (cur, target) in [(&mut vs.cam.0, app.left), (&mut vs.cam.1, app.top)] {
            let d = target - *cur;
            if d.abs() < 0.5 {
                *cur = target;
            } else {
                *cur += d * k;
                animating = true;
            }
        }
    } else {
        vs.cam = (app.left, app.top);
    }
    let ox = (tree.x + pad_x - vs.cam.0).round();
    let oy = (tree.y + pad_y - vs.cam.1).round();
    let lh = (m.size * 1.78).round();
    let label_rect = |x: f32, y: f32, w: f32| Rect::new(ox + x, oy + y + ((m.row - lh) / 2.0).round(), w, lh);

    canvas.set_clip(tree);
    let thin = s.round().max(1.0);
    let conf = &app.browser.conf;
    for &(x1, y1, x2, y2) in &layout.lines {
        if y1 == y2 {
            canvas.hline(ox + x1, ox + x2, oy + y1, thin, theme.line, 255);
        } else {
            canvas.vline(ox + x1, oy + y1, oy + y2, thin, theme.line, 255);
        }
    }
    let mut ancestors = std::collections::HashSet::new();
    let mut ancestor = Some(selected.clone());
    while let Some(node) = ancestor {
        ancestors.insert(Rc::as_ptr(&node) as usize);
        ancestor = node.borrow().parent.upgrade();
    }
    if conf.highlight_path {
        let bold = (1.6 * s).round().max(2.0);
        for (x1, y1, x2, y2) in layout.route(&selected, &m) {
            if y1 == y2 {
                canvas.hline(ox + x1, ox + x2, oy + y1, bold, theme.accent, 255);
            } else {
                canvas.vline(ox + x1, oy + y1, oy + y2, bold, theme.accent, 255);
            }
        }
    }
    // Selection block, eased between positions.
    let sel_ptr = Rc::as_ptr(&selected) as usize;
    if let Some(item) = sel_item {
        let mut target = Rect::new(item.x, item.y + ((m.row - lh) / 2.0).round(), item.w, lh);
        if app.link_target.is_some() {
            let l = &item.label;
            let tx = m.pad + m.icon + l.name_w + m.pad * 0.7 + m.dash + m.pad * 0.7;
            target = Rect::new(item.x + tx - m.pad * 0.45, target.y, l.target_w + m.pad * 0.9, lh);
        }
        if sel_ptr != vs.sel_ptr {
            vs.sel_from = if vs.sel_ptr == 0 { target } else { vs.sel_now };
            vs.sel_t0 = now;
            vs.sel_ptr = sel_ptr;
        }
        let t = if app.gui.animations {
            now.duration_since(vs.sel_t0).as_secs_f32() / 0.14
        } else {
            1.0
        };
        if t < 1.0 {
            animating = true;
        }
        vs.sel_now = vs.sel_from.lerp(&target, ease(t));
        let r = Rect::new(ox + vs.sel_now.x, oy + vs.sel_now.y, vs.sel_now.w, vs.sel_now.h);
        canvas.rrect(r, 4.0 * s, theme.accent, 255);
    }
    let visible = Rect::new(tree.x - 400.0 * s, tree.y - m.row, tree.w + 800.0 * s, tree.h + m.row * 2.0);
    let selected_box = sel_item.map(|i| Rc::as_ptr(&i.node) as usize);
    for item in &layout.items {
        let r = label_rect(item.x, item.y, item.w);
        if r.bottom() < visible.y || r.y > visible.bottom() || r.right() < tree.x || r.x > tree.right() {
            continue;
        }
        let ptr = Rc::as_ptr(&item.node) as usize;
        hits.nodes.push((r, item.node.clone()));
        let n = item.node.borrow();
        let is_sel = Some(ptr) == selected_box && app.link_target.is_none();
        let on_path = ancestors.contains(&ptr);
        if !is_sel && vs.hover == Some(ptr) && Some(ptr) != selected_box {
            canvas.rrect(r, 4.0 * s, theme.hover, 255);
        }
        if n.marked {
            let mark = theme.tone(&conf.mark_color).unwrap_or(theme.accent);
            canvas.stroke(r, thin, mark, 255);
            canvas.fill(Rect::new(r.x, r.y, (4.0 * s).round(), (4.0 * s).round()), mark, 255);
        }
        let ink = if is_sel {
            theme.on_accent
        } else {
            theme.text
        };
        let alpha = if is_sel || on_path || !conf.highlight_path { 255 } else { 168 };
        let icx = r.x + m.pad + m.icon * 0.42;
        let icy = r.y + r.h / 2.0;
        if n.create_entry {
            let c = if is_sel { theme.on_accent } else { theme.accent };
            let a = 4.5 * s;
            canvas.line((icx - a, icy), (icx + a, icy), 1.6 * s, c, 255);
            canvas.line((icx, icy - a), (icx, icy + a), 1.6 * s, c, 255);
            continue;
        }
        let icon = if is_sel {
            theme.on_accent
        } else if n.dir {
            n.path
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(|name| conf.folder_colors.get(name))
                .and_then(|c| theme.tone(c))
                .unwrap_or(theme.text)
        } else {
            conf.rule(&n.path, &conf.extension_colors, false)
                .and_then(|c| theme.tone(c))
                .unwrap_or(theme.faint)
        };
        let ia = if is_sel || on_path || !conf.highlight_path { 255 } else { 190 };
        if n.dir {
            let q = (3.6 * s).round();
            let sq = Rect::new((icx - q).round(), (icy - q).round(), q * 2.0, q * 2.0);
            if n.expanded {
                canvas.stroke(sq, (1.3 * s).round().max(1.0), icon, ia);
            } else {
                canvas.fill(sq, icon, ia);
            }
        } else {
            canvas.circle(icx, icy, 3.1 * s, icon, ia);
        }
        if !n.error.is_empty() {
            canvas.circle(icx + 4.5 * s, icy - 4.5 * s, 1.8 * s, theme.accent, 255);
        }
        let l = &item.label;
        let face = if n.dir { Face::Medium } else { Face::Sans };
        let mut x = r.x + m.pad + m.icon;
        let base = cx.fonts.baseline(face, m.size, r.y, r.h);
        cx.fonts.draw(canvas, x, base, &l.name, face, m.size, 0.0, ink, alpha);
        x += l.name_w;
        if let Some(target) = &l.target {
            let link = theme.tone(&conf.link_color).unwrap_or(theme.dim);
            let lc = if is_sel { theme.on_accent } else { link };
            x += m.pad * 0.7;
            canvas.hline(x, x + m.dash, icy, thin, lc, 255);
            canvas.line((x + m.dash - 3.0 * s, icy - 3.0 * s), (x + m.dash, icy), 1.1 * s, lc, 255);
            canvas.line((x + m.dash - 3.0 * s, icy + 3.0 * s), (x + m.dash, icy), 1.1 * s, lc, 255);
            x += m.dash + m.pad * 0.7;
            let target_ink = if Some(ptr) == selected_box && app.link_target.is_some() {
                theme.on_accent
            } else {
                lc
            };
            cx.fonts.draw(canvas, x, base, target, Face::Medium, m.size, 0.0, target_ink, alpha);
            x += l.target_w;
        }
        if !l.git.is_empty() {
            x += m.pad * 0.8;
            // Clean states recede; only states that need attention carry colour.
            let quiet = matches!(n.git, crate::git_status::State::Synced | crate::git_status::State::Committed);
            let gc = if is_sel {
                theme.on_accent
            } else if quiet {
                theme.faint
            } else {
                theme.tone(n.git.color()).unwrap_or(theme.dim)
            };
            let gb = cx.fonts.baseline(Face::Mono, m.small, r.y, r.h);
            cx.fonts.draw(canvas, x, gb, &l.git, Face::Mono, m.small, 0.0, gc, 255);
            x += l.git_w;
        }
        if !l.suffix.is_empty() {
            x += m.pad * 0.8;
            let sc = if is_sel { theme.on_accent } else { theme.faint };
            let sb = cx.fonts.baseline(Face::Mono, m.small, r.y, r.h);
            cx.fonts.draw(canvas, x, sb, &l.suffix, Face::Mono, m.small, 0.0, sc, 255);
        }
    }
    canvas.reset_clip();
    vs.layout = Some(layout);

    // ---- dashboard -------------------------------------------------------------
    if panel_w > 0.0 {
        let p = Rect::new(w - panel_w, header_h, panel_w, tree.h);
        canvas.fill(p, theme.surface, 255);
        canvas.vline(p.x, p.y, p.bottom(), thin, theme.hair, 255);
        app.update_dash();
        canvas.set_clip(p);
        draw_dash(canvas, &mut cx, app, p);
        canvas.reset_clip();
    }

    // ---- header ----------------------------------------------------------------
    let head = Rect::new(0.0, 0.0, w, header_h);
    hits.header = head;
    canvas.hline(0.0, w, header_h - thin / 2.0, thin, theme.hair, 255);
    let mut x = (20.0 * s).round();
    let q = (9.0 * s).round();
    canvas.fill(Rect::new(x, ((header_h - q) / 2.0).round(), q, q), theme.accent, 255);
    x += q + 10.0 * s;
    x += cx.caps(canvas, x, 0.0, header_h, "filex", theme.text);
    x += 14.0 * s;
    canvas.vline(x, header_h * 0.34, header_h * 0.66, thin, theme.line, 255);
    x += 14.0 * s;
    let mut right = w - 12.0 * s;
    if vs.client_decorations {
        let bw = (40.0 * s).round();
        for control in [Control::Close, Control::Maximize, Control::Minimize] {
            let b = Rect::new(right - bw, 0.0, bw, header_h - thin);
            right -= bw;
            let hover = vs.hover_control == Some(control);
            let (bg, ink) = match (control, hover) {
                (Control::Close, true) => (Some(theme.accent), theme.on_accent),
                (_, true) => (Some(theme.hover), theme.text),
                _ => (None, theme.dim),
            };
            if let Some(bg) = bg {
                canvas.fill(b, bg, 255);
            }
            let (mx, my) = (b.x + b.w / 2.0, b.y + b.h / 2.0);
            let a = 4.5 * s;
            match control {
                Control::Close => {
                    canvas.line((mx - a, my - a), (mx + a, my + a), 1.2 * s, ink, 255);
                    canvas.line((mx - a, my + a), (mx + a, my - a), 1.2 * s, ink, 255);
                }
                Control::Maximize => canvas.stroke(
                    Rect::new((mx - a).round(), (my - a).round(), (2.0 * a).round(), (2.0 * a).round()),
                    thin,
                    ink,
                    255,
                ),
                Control::Minimize => canvas.hline(mx - a, mx + a, my, thin, ink, 255),
            }
            hits.controls.push((b, control));
        }
        right -= 8.0 * s;
    }
    // Mode chips, right-aligned.
    let mut chips: Vec<(String, bool, u32)> = vec![];
    if let Some(p) = &app.pending {
        chips.push((format!("{} {}", if p.moving { "move" } else { "copy" }, p.sources.len()), true, theme.accent));
    }
    if !app.query.is_empty() {
        chips.push((format!("find {}", app.browser.results.len()), false, theme.text));
    }
    if !app.browser.temporary_focus.is_empty() {
        chips.push(("focus".into(), false, theme.text));
    }
    if !app.marked.is_empty() {
        let mark = theme.tone(&app.browser.conf.mark_color).unwrap_or(theme.accent);
        chips.push((format!("{} marked", app.marked.len()), false, mark));
    }
    if app.browser.conf.grouped {
        chips.push(("grouped".into(), false, theme.dim));
    }
    if app.browser.conf.hidden {
        chips.push(("dotfiles".into(), false, theme.dim));
    }
    for (label, filled, color) in &chips {
        let cw = cx.caps_width(label) + 16.0 * s;
        let ch = (21.0 * s).round();
        let r = Rect::new((right - cw).round(), ((header_h - ch) / 2.0).round(), cw.round(), ch);
        if *filled {
            canvas.fill(r, *color, 255);
            cx.caps(canvas, r.x + 8.0 * s, r.y, r.h, label, theme.on_accent);
        } else {
            canvas.stroke(r, thin, theme.line, 255);
            cx.caps(canvas, r.x + 8.0 * s, r.y, r.h, label, *color);
        }
        right = r.x - 8.0 * s;
    }
    // Breadcrumb of the root; each segment re-roots on click.
    let root = app.browser.root.borrow().path.clone();
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut segments: Vec<(String, PathBuf)> = vec![];
    let mut acc = PathBuf::from("/");
    let mut skip = 0;
    if let Some(home) = &home
        && root.starts_with(home)
    {
        segments.push(("~".into(), home.clone()));
        acc = home.clone();
        skip = home.components().count();
    } else {
        segments.push(("/".into(), acc.clone()));
        skip = skip.max(1);
    }
    for part in root.components().skip(skip) {
        acc.push(part);
        segments.push((clean(&part.as_os_str().to_string_lossy()), acc.clone()));
    }
    let size = 13.0 * s;
    let sep = cx.fonts.measure("/", Face::Sans, size, 0.0) + 12.0 * s;
    let avail = right - x - 12.0 * s;
    let widths: Vec<f32> = segments
        .iter()
        .enumerate()
        .map(|(i, (name, _))| {
            let face = if i + 1 == segments.len() { Face::Medium } else { Face::Sans };
            cx.fonts.measure(name, face, size, 0.0)
        })
        .collect();
    let mut first = 0;
    let total = |from: usize| widths[from..].iter().sum::<f32>() + sep * (widths.len() - from) as f32;
    while first + 1 < segments.len() && total(first) > avail {
        first += 1;
    }
    if first > 0 {
        x += cx.text(canvas, x, 0.0, header_h, "…", Face::Sans, size, theme.faint);
        x += cx.text(canvas, x + 6.0 * s, 0.0, header_h, "/", Face::Sans, size, theme.faint) + 12.0 * s;
    }
    for (i, (name, path)) in segments.iter().enumerate().skip(first) {
        let last = i + 1 == segments.len();
        let face = if last { Face::Medium } else { Face::Sans };
        let name = if last { cx.fonts.clip(name, face, size, (right - x).max(0.0)) } else { name.clone() };
        let color = if last { theme.text } else { theme.dim };
        let nw = cx.text(canvas, x, 0.0, header_h, &name, face, size, color);
        hits.crumbs.push((Rect::new(x - 4.0 * s, 8.0 * s, nw + 8.0 * s, header_h - 16.0 * s), path.clone()));
        x += nw;
        if !last && i > 0 || !last && name != "/" {
            x += 6.0 * s;
            x += cx.text(canvas, x, 0.0, header_h, "/", Face::Sans, size, theme.faint);
            x += 6.0 * s;
        }
    }

    // ---- status line -----------------------------------------------------------
    let st = Rect::new(0.0, h - status_h, w, status_h);
    canvas.fill(st, theme.bg, 255);
    canvas.hline(0.0, w, st.y + thin / 2.0, thin, theme.hair, 255);
    let mut hints: Vec<(&str, &str)> = vec![];
    if app.pending.is_some() {
        hints = vec![("enter", "place"), ("+", "here"), ("t", "path"), ("A", "folder"), ("esc", "cancel")];
    } else if !app.query.is_empty() {
        hints = vec![("↑↓", "matches"), ("esc", "exit")];
    } else if app.link_target.is_some() {
        hints = vec![("←", "link"), ("x", "exit there"), ("f", "root")];
    }
    let mut hx = w - 14.0 * s;
    for (key, what) in hints.iter().rev() {
        hx -= cx.hint_width(key, what);
    }
    let hint_left = hx;
    for (key, what) in &hints {
        hx += cx.hint(canvas, hx, st.y, st.h, key, what);
    }
    let detail = {
        let n = app.browser.selected.borrow();
        if let Some(target) = &app.link_target {
            format!("→ {}", clean(&target.to_string_lossy()))
        } else if !n.error.is_empty() {
            n.error.clone()
        } else if n.omitted > 0 {
            format!("{} entries omitted (max_entries / max_loaded_nodes)", n.omitted)
        } else if n.git == crate::git_status::State::None {
            clean(&n.path.to_string_lossy())
        } else {
            format!("{}   git: {}", clean(&n.path.to_string_lossy()), n.git.label())
        }
    };
    let (line, face, color) = if app.message.is_empty() {
        (detail, Face::Mono, theme.dim)
    } else {
        (app.message.clone(), Face::Sans, theme.text)
    };
    let size = if face == Face::Mono { 11.5 * s } else { 12.5 * s };
    let x0 = 20.0 * s;
    let line = cx.fonts.clip_start(&line, face, size, (hint_left - x0 - 16.0 * s).max(0.0));
    if !app.message.is_empty() {
        canvas.fill(Rect::new(x0 - 8.0 * s, st.y + st.h * 0.3, 2.0 * s, st.h * 0.4), theme.accent, 255);
    }
    cx.text(canvas, x0, st.y, st.h, &line, face, size, color);

    // ---- modal -----------------------------------------------------------------
    if app.modal.is_some() {
        canvas.fill(Rect::new(0.0, 0.0, w, h), theme.bg, if theme.dark { 150 } else { 120 });
        draw_modal(canvas, &mut cx, app, &mut hits, w, h, header_h);
    }
    if !app.gui.animations {
        animating = false;
    }
    let _ = Duration::ZERO;
    (hits, animating)
}

fn draw_dash(canvas: &mut Canvas, cx: &mut Ctx, app: &App, p: Rect) {
    let (s, t) = (cx.s, cx.t);
    let x = p.x + 24.0 * s;
    let inner = p.w - 48.0 * s;
    let mut y = p.y + 24.0 * s;
    let d = &app.meta;
    cx.caps(canvas, x, y, 14.0 * s, &d.kind, t.faint);
    y += 22.0 * s;
    let name = cx.fonts.clip(&d.name, Face::Medium, 17.0 * s, inner);
    cx.text(canvas, x, y, 26.0 * s, &name, Face::Medium, 17.0 * s, t.text);
    y += 34.0 * s;
    canvas.fill(Rect::new(x, y, 22.0 * s, (2.0 * s).round()), t.accent, 255);
    y += 22.0 * s;
    for (key, value) in &d.rows {
        if y > p.bottom() - 48.0 * s {
            break;
        }
        cx.caps(canvas, x, y, 14.0 * s, key, t.faint);
        y += 16.0 * s;
        let v = if value.starts_with('/') {
            cx.fonts.clip_start(value, Face::Mono, 12.0 * s, inner)
        } else {
            cx.fonts.clip(value, Face::Mono, 12.0 * s, inner)
        };
        cx.text(canvas, x, y, 18.0 * s, &v, Face::Mono, 12.0 * s, t.text);
        y += 30.0 * s;
    }
    if !d.preview.is_empty() {
        let lh = 18.0 * s;
        let rows = d.preview.len().min(((p.bottom() - y - 160.0 * s) / lh).max(0.0) as usize);
        if rows > 0 {
            let block = Rect::new(x - 10.0 * s, y, inner + 20.0 * s, rows as f32 * lh + 20.0 * s);
            canvas.rrect(block, 6.0 * s, t.raised, 255);
            canvas.fill(Rect::new(block.x, block.y, (2.0 * s).round(), block.h), t.line, 255);
            let mut ly = y + 10.0 * s;
            for line in d.preview.iter().take(rows) {
                let l = cx.fonts.clip(&line.replace('\t', "    "), Face::Mono, 11.5 * s, inner);
                cx.text(canvas, x, ly, lh, &l, Face::Mono, 11.5 * s, t.dim);
                ly += lh;
            }
            y = block.bottom() + 20.0 * s;
        }
    }
    for line in &d.extra {
        if y > p.bottom() - 24.0 * s {
            break;
        }
        let l = cx.fonts.clip_start(line, Face::Mono, 11.0 * s, inner);
        cx.text(canvas, x, y, 17.0 * s, &l, Face::Mono, 11.0 * s, t.faint);
        y += 17.0 * s;
    }
}

fn sheet(canvas: &mut Canvas, cx: &mut Ctx, r: Rect) {
    let (s, t) = (cx.s, cx.t);
    canvas.shadow(r, 10.0 * s, 26.0 * s, t.shadow, if t.dark { 150 } else { 60 });
    canvas.rrect(r.inset(-1.0), 10.0 * s + 1.0, t.hair, 255);
    canvas.rrect(r, 10.0 * s, t.raised, 255);
}

#[allow(clippy::too_many_arguments)]
fn draw_modal(canvas: &mut Canvas, cx: &mut Ctx, app: &mut App, hits: &mut Hits, w: f32, h: f32, header_h: f32) {
    let (s, t) = (cx.s, cx.t);
    let pad = 22.0 * s;
    match app.modal.as_ref().unwrap() {
        Modal::Prompt {
            title,
            edit,
            preedit,
            ..
        } => {
            let mw = (600.0 * s).min(w - 48.0 * s);
            let r = Rect::new(((w - mw) / 2.0).round(), (header_h + 70.0 * s).round(), mw.round(), (96.0 * s).round());
            sheet(canvas, cx, r);
            hits.modal = Some(r);
            cx.caps(canvas, r.x + pad, r.y + 16.0 * s, 14.0 * s, title, t.faint);
            let size = 17.0 * s;
            let field = Rect::new(r.x + pad, r.y + 40.0 * s, r.w - pad * 2.0, 36.0 * s);
            canvas.fill(Rect::new(field.x, field.bottom() - 2.0 * s, field.w, (2.0 * s).round()), t.accent, 255);
            let before = &edit.text[..edit.cursor];
            let bw = cx.fonts.measure(before, Face::Sans, size, 0.0);
            let pw = cx.fonts.measure(preedit, Face::Sans, size, 0.0);
            let shift = (bw + pw - field.w + 8.0 * s).max(0.0);
            canvas.set_clip(field);
            let base = cx.fonts.baseline(Face::Sans, size, field.y, field.h - 4.0 * s);
            let x = field.x - shift;
            cx.fonts.draw(canvas, x, base, before, Face::Sans, size, 0.0, t.text, 255);
            let mut caret = x + bw;
            if !preedit.is_empty() {
                cx.fonts.draw(canvas, caret, base, preedit, Face::Sans, size, 0.0, t.dim, 255);
                canvas.hline(caret, caret + pw, base + 3.0 * s, s.max(1.0), t.dim, 255);
                caret += pw;
            }
            cx.fonts.draw(canvas, caret, base, &edit.text[edit.cursor..], Face::Sans, size, 0.0, t.text, 255);
            let ch = size * 1.25;
            let cr = Rect::new(caret.round(), (base - size * 0.95).round(), (2.0 * s).round().max(1.0), ch.round());
            canvas.fill(cr, t.accent, 255);
            canvas.reset_clip();
            hits.caret = Some(cr);
        }
        Modal::Choose {
            title,
            options,
            selected,
            ..
        } => {
            let row = (36.0 * s).round();
            let mw = (540.0 * s).min(w - 48.0 * s);
            let max_rows = (((h - header_h - 160.0 * s) / row).max(3.0)) as usize;
            let shown = options.len().min(max_rows);
            let first = selected.saturating_sub(shown - 1);
            let mh = 52.0 * s + row * shown as f32 + 14.0 * s;
            let r = Rect::new(((w - mw) / 2.0).round(), (header_h + 60.0 * s).round(), mw.round(), mh.round());
            sheet(canvas, cx, r);
            hits.modal = Some(r);
            let title = cx.fonts.clip_start(&title.to_uppercase(), Face::Medium, 9.5 * s, r.w - pad * 2.0 - 60.0 * s);
            cx.caps(canvas, r.x + pad, r.y + 16.0 * s, 14.0 * s, &title, t.faint);
            let mut y = r.y + 44.0 * s;
            for (i, option) in options.iter().enumerate().skip(first).take(shown) {
                let rr = Rect::new(r.x + 8.0 * s, y, r.w - 16.0 * s, row);
                if i == *selected {
                    canvas.rrect(rr, 6.0 * s, t.hover, 255);
                    canvas.fill(Rect::new(rr.x, rr.y + 9.0 * s, (3.0 * s).round(), rr.h - 18.0 * s), t.accent, 255);
                }
                let color = if option.off { t.faint } else { t.text };
                let nw = if option.note.is_empty() { 0.0 } else { cx.caps_width(&option.note) + 16.0 * s };
                let label = cx.fonts.clip(&option.label, Face::Sans, 13.5 * s, rr.w - 28.0 * s - nw);
                cx.text(canvas, rr.x + 16.0 * s, rr.y, rr.h, &label, Face::Sans, 13.5 * s, color);
                if nw > 0.0 {
                    let note_color = if option.note == "default" { t.accent } else { t.faint };
                    cx.caps(canvas, rr.right() - nw, rr.y, rr.h, &option.note, note_color);
                }
                hits.rows.push((rr, i));
                y += row;
            }
        }
        Modal::Confirm { title, .. } => {
            let mw = (520.0 * s).min(w - 48.0 * s);
            let r = Rect::new(((w - mw) / 2.0).round(), (header_h + 80.0 * s).round(), mw.round(), (112.0 * s).round());
            sheet(canvas, cx, r);
            hits.modal = Some(r);
            canvas.fill(Rect::new(r.x + pad, r.y + 22.0 * s, 16.0 * s, (2.0 * s).round()), t.accent, 255);
            let text = cx.fonts.clip_start(title, Face::Medium, 14.0 * s, r.w - pad * 2.0);
            cx.text(canvas, r.x + pad, r.y + 32.0 * s, 26.0 * s, &text, Face::Medium, 14.0 * s, t.text);
            let mut x = r.x + pad;
            x += cx.hint(canvas, x, r.y + 70.0 * s, 26.0 * s, "enter", "confirm");
            cx.hint(canvas, x, r.y + 70.0 * s, 26.0 * s, "esc", "cancel");
        }
        Modal::Pager { title, rows, top, left } => {
            let r = Rect::new(
                (32.0 * s).max((w - 980.0 * s) / 2.0).round(),
                (header_h + 24.0 * s).round(),
                (w - 64.0 * s).min(980.0 * s).round(),
                (h - header_h - 56.0 * s).round(),
            );
            sheet(canvas, cx, r);
            hits.modal = Some(r);
            let title = cx.fonts.clip_start(&title.to_uppercase(), Face::Medium, 9.5 * s, r.w - pad * 2.0);
            cx.caps(canvas, r.x + pad, r.y + 16.0 * s, 14.0 * s, &title, t.faint);
            let lh = (19.0 * s).round();
            let body = Rect::new(r.x + pad, r.y + 44.0 * s, r.w - pad * 2.0, r.h - 60.0 * s);
            let fit = (body.h / lh) as usize;
            app.view_rows = app.view_rows.max(fit + 4);
            canvas.set_clip(body);
            let shift = *left as f32 * cx.fonts.measure("0", Face::Mono, 12.0 * s, 0.0);
            for (i, line) in rows.iter().skip(*top).take(fit).enumerate() {
                cx.text(canvas, body.x - shift, body.y + i as f32 * lh, lh, line, Face::Mono, 12.0 * s, t.text);
            }
            canvas.reset_clip();
            scrollbar(canvas, cx, r, body, *top, fit, rows.len());
        }
        Modal::Help { rows, top } => {
            let r = Rect::new(
                (32.0 * s).max((w - 760.0 * s) / 2.0).round(),
                (header_h + 24.0 * s).round(),
                (w - 64.0 * s).min(760.0 * s).round(),
                (h - header_h - 56.0 * s).round(),
            );
            sheet(canvas, cx, r);
            hits.modal = Some(r);
            cx.caps(canvas, r.x + pad, r.y + 16.0 * s, 14.0 * s, "keys", t.faint);
            let lh = (26.0 * s).round();
            let body = Rect::new(r.x + pad, r.y + 44.0 * s, r.w - pad * 2.0, r.h - 60.0 * s);
            let fit = (body.h / lh) as usize;
            app.view_rows = app.view_rows.max(fit + 4);
            canvas.set_clip(body);
            let key_w = 190.0 * s;
            for (i, (key, action)) in rows.iter().skip(*top).take(fit).enumerate() {
                let y = body.y + i as f32 * lh;
                let kw = cx.fonts.measure(key, Face::Mono, 11.5 * s, 0.0) + 12.0 * s;
                let kr = Rect::new(body.x, (y + 4.0 * s).round(), kw.round(), (lh - 8.0 * s).round());
                canvas.rrect(kr, 3.0 * s, t.hair, 255);
                let kb = cx.fonts.baseline(Face::Mono, 11.5 * s, kr.y, kr.h);
                cx.fonts.draw(canvas, kr.x + 6.0 * s, kb, key, Face::Mono, 11.5 * s, 0.0, t.text, 255);
                cx.text(canvas, body.x + key_w, y, lh, action, Face::Sans, 13.0 * s, t.dim);
            }
            canvas.reset_clip();
            scrollbar(canvas, cx, r, body, *top, fit, rows.len());
        }
        Modal::Reorder { directory, names, cursor } => {
            let row = (32.0 * s).round();
            let mw = (540.0 * s).min(w - 48.0 * s);
            let max_rows = (((h - header_h - 200.0 * s) / row).max(3.0)) as usize;
            let shown = names.len().min(max_rows);
            let first = cursor.saturating_sub(shown - 1);
            let mh = 52.0 * s + row * shown as f32 + 54.0 * s;
            let r = Rect::new(((w - mw) / 2.0).round(), (header_h + 50.0 * s).round(), mw.round(), mh.round());
            sheet(canvas, cx, r);
            hits.modal = Some(r);
            let title = cx.fonts.clip_start(
                &clean(&directory.to_string_lossy()).to_uppercase(),
                Face::Medium,
                9.5 * s,
                r.w - pad * 2.0,
            );
            cx.caps(canvas, r.x + pad, r.y + 16.0 * s, 14.0 * s, &title, t.faint);
            let mut y = r.y + 44.0 * s;
            for (i, name) in names.iter().enumerate().skip(first).take(shown) {
                let rr = Rect::new(r.x + 8.0 * s, y, r.w - 16.0 * s, row);
                if i == *cursor {
                    canvas.rrect(rr, 6.0 * s, t.accent, 255);
                }
                let ink = if i == *cursor { t.on_accent } else { t.text };
                let num = format!("{:>2}", i + 1);
                cx.text(canvas, rr.x + 14.0 * s, rr.y, rr.h, &num, Face::Mono, 11.5 * s, if i == *cursor { t.on_accent } else { t.faint });
                cx.text(canvas, rr.x + 48.0 * s, rr.y, rr.h, &clean(name), Face::Sans, 13.5 * s, ink);
                hits.rows.push((rr, i));
                y += row;
            }
            let mut x = r.x + pad;
            let hy = r.bottom() - 42.0 * s;
            x += cx.hint(canvas, x, hy, 26.0 * s, "K J", "move");
            x += cx.hint(canvas, x, hy, 26.0 * s, "enter", "save");
            cx.hint(canvas, x, hy, 26.0 * s, "esc", "cancel");
        }
    }
}

fn scrollbar(canvas: &mut Canvas, cx: &Ctx, r: Rect, body: Rect, top: usize, fit: usize, total: usize) {
    if total <= fit {
        return;
    }
    let s = cx.s;
    let track = Rect::new(r.right() - 9.0 * s, body.y, 3.0 * s, body.h);
    let th = (body.h * fit as f32 / total as f32).max(24.0 * s);
    let ty = body.y + (body.h - th) * top as f32 / (total - fit) as f32;
    canvas.rrect(Rect::new(track.x, ty, track.w, th), 1.5 * s, cx.t.line, 255);
}
