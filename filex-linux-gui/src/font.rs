//! Text: three embedded Geist faces plus system fallbacks found through
//! fontconfig on demand. Fallback files are memory-mapped, so only the glyph
//! tables actually touched become resident.
use crate::paint::Canvas;
use ab_glyph::{Font, FontRef, GlyphId, PxScale, ScaleFont, point};
use std::{collections::HashMap, process::Command};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Face {
    Sans,
    Medium,
    Mono,
}

struct Bitmap {
    left: i32,
    top: i32,
    w: i32,
    h: i32,
    data: Vec<u8>,
}

pub struct Fonts {
    faces: Vec<FontRef<'static>>,
    /// Font index in `faces` that covers a character missing from the primary face.
    fallback_for: HashMap<char, Option<usize>>,
    loaded_files: HashMap<String, usize>,
    cache: HashMap<(u8, u16, u16, u8), Option<Bitmap>>,
}

const SANS: &[u8] = include_bytes!("../assets/fonts/Geist-Regular.ttf");
const MEDIUM: &[u8] = include_bytes!("../assets/fonts/Geist-Medium.ttf");
const MONO: &[u8] = include_bytes!("../assets/fonts/GeistMono-Regular.ttf");
const CACHE_LIMIT: usize = 6000;

impl Fonts {
    pub fn new() -> Self {
        let faces = [SANS, MEDIUM, MONO]
            .into_iter()
            .map(|bytes| FontRef::try_from_slice(bytes).expect("embedded font"))
            .collect();
        Self {
            faces,
            fallback_for: HashMap::new(),
            loaded_files: HashMap::new(),
            cache: HashMap::new(),
        }
    }
    fn primary(face: Face) -> usize {
        match face {
            Face::Sans => 0,
            Face::Medium => 1,
            Face::Mono => 2,
        }
    }
    fn scale(&self, index: usize, size: f32) -> PxScale {
        let font = &self.faces[index];
        let em = font.units_per_em().unwrap_or(1000.0);
        PxScale::from(size * font.height_unscaled() / em)
    }
    /// Find (and memoise) a font that has a glyph for `c`.
    fn resolve(&mut self, face: Face, c: char) -> (usize, GlyphId) {
        let primary = Self::primary(face);
        let id = self.faces[primary].glyph_id(c);
        if id.0 != 0 || c.is_control() {
            return (primary, id);
        }
        // The other embedded faces share coverage; try loaded fallbacks next.
        if let Some(found) = self.fallback_for.get(&c) {
            return match found {
                Some(i) => (*i, self.faces[*i].glyph_id(c)),
                None => (primary, id),
            };
        }
        for i in 3..self.faces.len() {
            let gid = self.faces[i].glyph_id(c);
            if gid.0 != 0 {
                self.fallback_for.insert(c, Some(i));
                return (i, gid);
            }
        }
        let found = self.load_fallback(c);
        self.fallback_for.insert(c, found);
        match found {
            Some(i) => (i, self.faces[i].glyph_id(c)),
            None => (primary, id),
        }
    }
    fn load_fallback(&mut self, c: char) -> Option<usize> {
        let pattern = if is_cjk(c) {
            // Prefer a CJK face with the full ideograph set over the first match.
            "Noto Sans CJK SC:lang=zh-cn".to_string()
        } else {
            format!("sans-serif:charset={:x}", c as u32)
        };
        let output = Command::new("fc-match")
            .args(["-f", "%{file}|%{index}", &pattern])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout).into_owned();
        let (file, index) = text.rsplit_once('|')?;
        let index: u32 = index.trim().parse().unwrap_or(0);
        let key = format!("{file}|{index}");
        if let Some(&i) = self.loaded_files.get(&key) {
            return (self.faces[i].glyph_id(c).0 != 0).then_some(i);
        }
        let handle = std::fs::File::open(file).ok()?;
        // SAFETY: font files are read-only system data; a concurrent rewrite would
        // only corrupt rendering of this process, as with any mmap-based renderer.
        let map = unsafe { memmap2::Mmap::map(&handle) }.ok()?;
        let bytes: &'static [u8] = Box::leak(Box::new(map));
        let font = FontRef::try_from_slice_and_index(bytes, index).ok()?;
        let has = font.glyph_id(c).0 != 0;
        self.faces.push(font);
        let i = self.faces.len() - 1;
        self.loaded_files.insert(key, i);
        has.then_some(i)
    }
    /// Baseline that vertically centres the face's cap height within a box.
    pub fn baseline(&self, _face: Face, size: f32, top: f32, height: f32) -> f32 {
        let cap = size * 0.70;
        (top + (height + cap) / 2.0).round()
    }
    pub fn measure(&mut self, text: &str, face: Face, size: f32, tracking: f32) -> f32 {
        let mut x = 0.0;
        let mut prev: Option<(usize, GlyphId)> = None;
        for c in text.chars() {
            let c = if c == '\t' { ' ' } else { c };
            let (fi, gid) = self.resolve(face, c);
            let scale = self.scale(fi, size);
            let font = self.faces[fi].as_scaled(scale);
            if let Some((pf, pg)) = prev
                && pf == fi
            {
                x += font.kern(pg, gid);
            }
            x += font.h_advance(gid) + tracking;
            prev = Some((fi, gid));
        }
        x
    }
    /// Largest prefix (with an ellipsis) that fits `max` pixels.
    pub fn clip(&mut self, text: &str, face: Face, size: f32, max: f32) -> String {
        if self.measure(text, face, size, 0.0) <= max {
            return text.to_owned();
        }
        let ellipsis = self.measure("…", face, size, 0.0);
        let mut out = String::new();
        let mut used = 0.0;
        for c in text.chars() {
            let w = self.measure(c.encode_utf8(&mut [0; 4]), face, size, 0.0);
            if used + w + ellipsis > max {
                break;
            }
            used += w;
            out.push(c);
        }
        out.push('…');
        out
    }
    /// Keep the end of a long path visible: "…/parent/name".
    pub fn clip_start(&mut self, text: &str, face: Face, size: f32, max: f32) -> String {
        if self.measure(text, face, size, 0.0) <= max {
            return text.to_owned();
        }
        let ellipsis = self.measure("…", face, size, 0.0);
        let chars: Vec<char> = text.chars().collect();
        let mut used = 0.0;
        let mut start = chars.len();
        while start > 0 {
            let w = self.measure(chars[start - 1].encode_utf8(&mut [0; 4]), face, size, 0.0);
            if used + w + ellipsis > max {
                break;
            }
            used += w;
            start -= 1;
        }
        format!("…{}", chars[start..].iter().collect::<String>())
    }
    #[allow(clippy::too_many_arguments)]
    pub fn draw(
        &mut self,
        canvas: &mut Canvas,
        x: f32,
        baseline: f32,
        text: &str,
        face: Face,
        size: f32,
        tracking: f32,
        color: u32,
        alpha: u8,
    ) -> f32 {
        let mut pen = x;
        let mut prev: Option<(usize, GlyphId)> = None;
        if self.cache.len() > CACHE_LIMIT {
            self.cache.clear();
        }
        for c in text.chars() {
            let c = if c == '\t' { ' ' } else { c };
            let (fi, gid) = self.resolve(face, c);
            let scale = self.scale(fi, size);
            let font = self.faces[fi].as_scaled(scale);
            if let Some((pf, pg)) = prev
                && pf == fi
            {
                pen += font.kern(pg, gid);
            }
            let advance = font.h_advance(gid);
            if !c.is_whitespace() {
                let sub = ((pen.fract() + 1.0).fract() * 4.0) as u8 % 4;
                let key = (fi as u8, gid.0, (size * 8.0) as u16, sub);
                let entry = self.cache.entry(key).or_insert_with(|| {
                    let glyph = gid.with_scale_and_position(scale, point(sub as f32 / 4.0, 0.0));
                    let outline = self.faces[fi].outline_glyph(glyph)?;
                    let b = outline.px_bounds();
                    let (w, h) = (b.width() as i32, b.height() as i32);
                    let mut data = vec![0u8; (w * h).max(0) as usize];
                    outline.draw(|gx, gy, cov| {
                        let i = gy as i32 * w + gx as i32;
                        if i >= 0 && (i as usize) < data.len() {
                            // Mild gamma lift keeps thin strokes from washing out.
                            data[i as usize] = (cov.clamp(0.0, 1.0).powf(0.85) * 255.0) as u8;
                        }
                    });
                    Some(Bitmap {
                        left: b.min.x as i32,
                        top: b.min.y as i32,
                        w,
                        h,
                        data,
                    })
                });
                if let Some(bitmap) = entry {
                    canvas.mask(
                        pen.floor() as i32 + bitmap.left,
                        baseline.round() as i32 + bitmap.top,
                        bitmap.w,
                        bitmap.h,
                        &bitmap.data,
                        color,
                        alpha,
                    );
                }
            }
            pen += advance + tracking;
            prev = Some((fi, gid));
        }
        pen - x
    }
}

fn is_cjk(c: char) -> bool {
    matches!(c as u32,
        0x2E80..=0x9FFF | 0xA960..=0xA97F | 0xAC00..=0xD7FF | 0xF900..=0xFAFF |
        0xFE30..=0xFE4F | 0xFF00..=0xFFEF | 0x20000..=0x3FFFF)
}
