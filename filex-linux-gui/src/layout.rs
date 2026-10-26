//! Pixel version of fileX's horizontal tree layout (classic and grouped).
//! Same structure as `model::Layout`: columns per depth, a parent sharing the
//! row of its first child, and one branch line per group of children.
use crate::{
    font::{Face, Fonts},
    model::{Browser, NodeRef, clean},
};
use std::{collections::HashMap, rc::Rc};

pub struct Metrics {
    pub size: f32,
    pub small: f32,
    pub row: f32,
    pub gap: f32,
    pub pad: f32,
    pub icon: f32,
    pub max_name: f32,
    pub dash: f32,
}
impl Metrics {
    pub fn new(scale: f32, font_size: f32, conf: &crate::config::Config) -> Self {
        let size = font_size * scale;
        let row = (size * 1.95).round();
        Self {
            size,
            small: (size * 0.8).round(),
            row: row * conf.row_spacing as f32,
            gap: (conf.gap as f32 * size * 0.52).round().max(18.0 * scale),
            pad: (size * 0.62).round(),
            icon: (size * 1.15).round(),
            max_name: conf.label_width as f32 * size * 0.56,
            dash: (size * 1.6).round(),
        }
    }
}

pub struct Label {
    pub name: String,
    pub name_w: f32,
    pub target: Option<String>,
    pub target_w: f32,
    pub git: String,
    pub git_w: f32,
    pub suffix: String,
    pub suffix_w: f32,
}

pub struct Item {
    pub node: NodeRef,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub label: Label,
    pub parent: Option<usize>,
    /// Vertical branch line this item hangs from.
    pub branch: f32,
}

pub struct TreeLayout {
    pub items: Vec<Item>,
    pub lines: Vec<(f32, f32, f32, f32)>,
    pub width: f32,
    pub height: f32,
    index: HashMap<usize, usize>,
}

fn id(node: &NodeRef) -> usize {
    Rc::as_ptr(node) as usize
}

fn label(fonts: &mut Fonts, m: &Metrics, node: &NodeRef) -> (Label, f32) {
    let n = node.borrow();
    let mut l = Label {
        name: String::new(),
        name_w: 0.0,
        target: None,
        target_w: 0.0,
        git: String::new(),
        git_w: 0.0,
        suffix: String::new(),
        suffix_w: 0.0,
    };
    if n.create_entry {
        return (l, m.pad * 2.0 + m.icon);
    }
    let raw = clean(&n.path.file_name().unwrap_or(n.path.as_os_str()).to_string_lossy());
    let face = if n.dir { Face::Medium } else { Face::Sans };
    let mut budget = m.max_name;
    if n.link
        && let Ok(target) = std::fs::read_link(&n.path)
    {
        let target = clean(&target.file_name().unwrap_or(target.as_os_str()).to_string_lossy());
        let t = fonts.clip(&target, Face::Sans, m.size, budget * 0.5);
        l.target_w = fonts.measure(&t, Face::Sans, m.size, 0.0);
        budget = (budget - l.target_w).max(budget * 0.5);
        l.target = Some(t);
    }
    l.name = fonts.clip(&raw, face, m.size, budget);
    l.name_w = fonts.measure(&l.name, face, m.size, 0.0);
    if n.git != crate::git_status::State::None {
        l.git = n.git.marker(false).into();
        l.git_w = fonts.measure(&l.git, Face::Mono, m.small, 0.0);
    }
    if !n.dir && n.links > 1 {
        l.suffix = format!("H×{}", n.links);
    }
    if n.dir && n.expanded && n.omitted > 0 {
        l.suffix = format!("+{}", n.omitted);
    }
    if !l.suffix.is_empty() {
        l.suffix_w = fonts.measure(&l.suffix, Face::Mono, m.small, 0.0);
    }
    let mut w = m.pad + m.icon + l.name_w + m.pad;
    if l.target.is_some() {
        w += m.dash + m.pad * 1.4 + l.target_w;
    }
    if l.git_w > 0.0 {
        w += l.git_w + m.pad * 0.8;
    }
    if l.suffix_w > 0.0 {
        w += l.suffix_w + m.pad * 0.8;
    }
    (l, w.ceil())
}

impl TreeLayout {
    pub fn find(&self, node: &NodeRef) -> Option<&Item> {
        self.index.get(&id(node)).map(|&i| &self.items[i])
    }
    pub fn new(browser: &Browser, fonts: &mut Fonts, m: &Metrics) -> Self {
        if browser.conf.grouped {
            Self::grouped(browser, fonts, m)
        } else {
            Self::classic(browser, fonts, m)
        }
    }
    fn finish(mut items: Vec<Item>, lines: Vec<(f32, f32, f32, f32)>, width: f32, height: f32) -> Self {
        let mut index = HashMap::new();
        for (i, item) in items.iter().enumerate() {
            index.insert(id(&item.node), i);
        }
        // Parent indices were recorded as node ids; translate them now.
        for item in &mut items {
            item.parent = item.parent.and_then(|pid| index.get(&pid).copied());
        }
        Self {
            items,
            lines,
            width,
            height,
            index,
        }
    }
    fn classic(browser: &Browser, fonts: &mut Fonts, m: &Metrics) -> Self {
        let nodes = browser.visible();
        let children: HashMap<usize, Vec<NodeRef>> =
            nodes.iter().map(|n| (id(n), browser.visible_children(n))).collect();
        let mut depths: HashMap<usize, usize> = HashMap::new();
        let mut widths: Vec<f32> = vec![];
        let mut labels = HashMap::new();
        for node in &nodes {
            let parent = node.borrow().parent.upgrade();
            let depth = parent
                .and_then(|p| depths.get(&id(&p)).copied())
                .map_or(0, |d| d + 1);
            depths.insert(id(node), depth);
            let (l, w) = label(fonts, m, node);
            if widths.len() <= depth {
                widths.resize(depth + 1, 0.0);
            }
            widths[depth] = widths[depth].max(w);
            labels.insert(id(node), (l, w));
        }
        let mut columns = vec![0.0; widths.len()];
        for d in 1..columns.len() {
            columns[d] = columns[d - 1] + widths[d - 1] + m.gap;
        }
        let mut heights: HashMap<usize, f32> = HashMap::new();
        for node in nodes.iter().rev() {
            let kids = &children[&id(node)];
            let h = if node.borrow().expanded && !kids.is_empty() {
                kids.iter().map(|c| heights[&id(c)]).sum()
            } else {
                m.row
            };
            heights.insert(id(node), h);
        }
        let mut rows: HashMap<usize, f32> = HashMap::new();
        rows.insert(id(&browser.root), 0.0);
        let mut branches: HashMap<usize, f32> = HashMap::new();
        let mut items = vec![];
        let mut lines = vec![];
        let (mut width, mut height) = (0.0f32, 0.0f32);
        for node in nodes {
            let nid = id(&node);
            let x = columns[depths[&nid]];
            let y = rows[&nid];
            let (l, w) = labels.remove(&nid).unwrap();
            width = width.max(x + w);
            height = height.max(y + m.row);
            let kids = &children[&nid];
            if node.borrow().expanded && !kids.is_empty() {
                let cx = columns[depths[&nid] + 1];
                let branch = (cx - m.gap * 0.5).round();
                let mut row = y;
                let mut last = y;
                for child in kids {
                    rows.insert(id(child), row);
                    branches.insert(id(child), branch);
                    last = row;
                    lines.push((branch, row + m.row / 2.0, cx, row + m.row / 2.0));
                    row += heights[&id(child)];
                }
                lines.push((x + w, y + m.row / 2.0, branch, y + m.row / 2.0));
                lines.push((branch, y + m.row / 2.0, branch, last + m.row / 2.0));
            }
            let parent = node.borrow().parent.upgrade().map(|p| id(&p));
            items.push(Item {
                branch: branches.get(&nid).copied().unwrap_or(x),
                node,
                x,
                y,
                w,
                label: l,
                parent,
            });
        }
        Self::finish(items, lines, width, height)
    }
    fn grouped(browser: &Browser, fonts: &mut Fonts, m: &Metrics) -> Self {
        let nodes = browser.visible();
        let children: HashMap<usize, Vec<NodeRef>> =
            nodes.iter().map(|n| (id(n), browser.visible_children(n))).collect();
        let gap = m.gap.max(m.size * 2.0);
        let folderish = |n: &NodeRef| n.borrow().dir || n.borrow().create_entry;
        let mut labels = HashMap::new();
        let mut sizes: HashMap<usize, (f32, f32)> = HashMap::new();
        for node in nodes.iter().rev() {
            let nid = id(node);
            let (l, own) = label(fonts, m, node);
            let (mut dw, mut dh, mut fw, mut fh) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
            if node.borrow().expanded {
                for child in &children[&nid] {
                    let (w, h) = sizes[&id(child)];
                    if folderish(child) {
                        dw = dw.max(w);
                        dh += h;
                    } else {
                        fw = fw.max(w);
                        fh += h;
                    }
                }
            }
            let width = if dh + fh == 0.0 {
                own
            } else {
                own + gap + dw + if dh > 0.0 && fh > 0.0 { gap } else { 0.0 } + fw
            };
            sizes.insert(nid, (width, m.row + dh.max(fh)));
            labels.insert(nid, (l, own));
        }
        let root = id(&browser.root);
        let mut positions: HashMap<usize, (f32, f32, f32)> = HashMap::new();
        positions.insert(root, (0.0, 0.0, 0.0));
        let mut items = Vec::new();
        let mut lines = Vec::new();
        for node in nodes {
            let nid = id(&node);
            let (x, y, branch) = positions[&nid];
            let (l, w) = labels.remove(&nid).unwrap();
            let kids = &children[&nid];
            if node.borrow().expanded && !kids.is_empty() {
                let dw = kids
                    .iter()
                    .filter(|c| folderish(c))
                    .map(|c| sizes[&id(c)].0)
                    .fold(0.0, f32::max);
                for directories in [true, false] {
                    let group: Vec<_> = kids.iter().filter(|c| folderish(c) == directories).collect();
                    if group.is_empty() {
                        continue;
                    }
                    let cx = x + w + gap + if !directories && dw > 0.0 { dw + gap } else { 0.0 };
                    let b = (cx - gap * 0.45).round();
                    let mut cy = y + m.row;
                    let mut last = cy;
                    lines.push((x + w, y + m.row / 2.0, b, y + m.row / 2.0));
                    for child in group {
                        positions.insert(id(child), (cx, cy, b));
                        lines.push((b, cy + m.row / 2.0, cx, cy + m.row / 2.0));
                        last = cy;
                        cy += sizes[&id(child)].1;
                    }
                    lines.push((b, y + m.row / 2.0, b, last + m.row / 2.0));
                }
            }
            let parent = node.borrow().parent.upgrade().map(|p| id(&p));
            items.push(Item {
                node,
                x,
                y,
                w,
                label: l,
                parent,
                branch,
            });
        }
        let (width, height) = sizes[&root];
        Self::finish(items, lines, width, height)
    }
    /// Connector segments from the root down to `selected` (ancestor route).
    pub fn route(&self, selected: &NodeRef, m: &Metrics) -> Vec<(f32, f32, f32, f32)> {
        let mut segments = vec![];
        let Some(mut index) = self.index.get(&id(selected)).copied() else {
            return segments;
        };
        while let Some(p) = self.items[index].parent {
            let (c, p) = (&self.items[index], &self.items[p]);
            let (py, cy) = (p.y + m.row / 2.0, c.y + m.row / 2.0);
            segments.push((p.x + p.w, py, c.branch, py));
            segments.push((c.branch, py, c.branch, cy));
            segments.push((c.branch, cy, c.x, cy));
            index = self.index[&id(&p.node)];
        }
        segments
    }
}
