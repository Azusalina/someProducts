//! A minimal software painter over a 0RGB framebuffer. Only the primitives the
//! interface needs: crisp rectangles, anti-aliased rounded rectangles, lines,
//! circles and alpha masks for glyphs.

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}
impl Rect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }
    pub fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.w && y < self.y + self.h
    }
    pub fn right(&self) -> f32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f32 {
        self.y + self.h
    }
    pub fn inset(&self, d: f32) -> Self {
        Self::new(self.x + d, self.y + d, self.w - 2.0 * d, self.h - 2.0 * d)
    }
    pub fn lerp(&self, other: &Self, t: f32) -> Self {
        let m = |a: f32, b: f32| a + (b - a) * t;
        Self::new(
            m(self.x, other.x),
            m(self.y, other.y),
            m(self.w, other.w),
            m(self.h, other.h),
        )
    }
}

pub struct Canvas<'a> {
    pub px: &'a mut [u32],
    pub w: i32,
    pub h: i32,
    clip: (i32, i32, i32, i32),
}

#[inline]
pub fn mix(dst: u32, src: u32, a: u32) -> u32 {
    // a: 0..=255
    let inv = 255 - a;
    let ch = |shift: u32| {
        let d = (dst >> shift) & 0xff;
        let s = (src >> shift) & 0xff;
        ((s * a + d * inv + 127) / 255) << shift
    };
    ch(16) | ch(8) | ch(0)
}

impl<'a> Canvas<'a> {
    pub fn new(px: &'a mut [u32], w: u32, h: u32) -> Self {
        let (w, h) = (w as i32, h as i32);
        Self {
            px,
            w,
            h,
            clip: (0, 0, w, h),
        }
    }
    pub fn set_clip(&mut self, r: Rect) {
        let x0 = (r.x.round() as i32).clamp(0, self.w);
        let y0 = (r.y.round() as i32).clamp(0, self.h);
        let x1 = (r.right().round() as i32).clamp(0, self.w);
        let y1 = (r.bottom().round() as i32).clamp(0, self.h);
        self.clip = (x0, y0, x1.max(x0), y1.max(y0));
    }
    pub fn reset_clip(&mut self) {
        self.clip = (0, 0, self.w, self.h);
    }
    pub fn clear(&mut self, color: u32) {
        self.px.fill(color);
    }
    #[inline]
    pub(crate) fn put(&mut self, x: i32, y: i32, color: u32, a: u32) {
        let (cx0, cy0, cx1, cy1) = self.clip;
        if x < cx0 || y < cy0 || x >= cx1 || y >= cy1 || a == 0 {
            return;
        }
        let i = (y * self.w + x) as usize;
        self.px[i] = if a >= 255 {
            color
        } else {
            mix(self.px[i], color, a)
        };
    }
    /// Pixel-snapped rectangle. Edges are rounded so hairlines stay crisp.
    pub fn fill(&mut self, r: Rect, color: u32, alpha: u8) {
        let (cx0, cy0, cx1, cy1) = self.clip;
        let x0 = (r.x.round() as i32).max(cx0);
        let y0 = (r.y.round() as i32).max(cy0);
        let x1 = (r.right().round() as i32).min(cx1);
        let y1 = (r.bottom().round() as i32).min(cy1);
        if x0 >= x1 || y0 >= y1 || alpha == 0 {
            return;
        }
        for y in y0..y1 {
            let row = (y * self.w) as usize;
            let span = &mut self.px[row + x0 as usize..row + x1 as usize];
            if alpha == 255 {
                span.fill(color);
            } else {
                for p in span {
                    *p = mix(*p, color, alpha as u32);
                }
            }
        }
    }
    /// Horizontal or vertical stroke of integer thickness, centred on the coordinate.
    pub fn hline(&mut self, x0: f32, x1: f32, y: f32, t: f32, color: u32, alpha: u8) {
        let (a, b) = if x0 <= x1 { (x0, x1) } else { (x1, x0) };
        let t = t.max(1.0).round();
        let top = (y - t / 2.0).round();
        self.fill(Rect::new(a.round(), top, (b - a).round().max(0.0) + t.min(1.0), t), color, alpha);
    }
    pub fn vline(&mut self, x: f32, y0: f32, y1: f32, t: f32, color: u32, alpha: u8) {
        let (a, b) = if y0 <= y1 { (y0, y1) } else { (y1, y0) };
        let t = t.max(1.0).round();
        let left = (x - t / 2.0).round();
        self.fill(Rect::new(left, a.round(), t, (b - a).round().max(0.0) + t.min(1.0)), color, alpha);
    }
    pub fn stroke(&mut self, r: Rect, t: f32, color: u32, alpha: u8) {
        let t = t.max(1.0).round();
        let r = Rect::new(r.x.round(), r.y.round(), r.w.round(), r.h.round());
        self.fill(Rect::new(r.x, r.y, r.w, t), color, alpha);
        self.fill(Rect::new(r.x, r.bottom() - t, r.w, t), color, alpha);
        self.fill(Rect::new(r.x, r.y + t, t, r.h - 2.0 * t), color, alpha);
        self.fill(Rect::new(r.right() - t, r.y + t, t, r.h - 2.0 * t), color, alpha);
    }
    /// Anti-aliased rounded rectangle via a signed distance per edge pixel.
    pub fn rrect(&mut self, r: Rect, radius: f32, color: u32, alpha: u8) {
        let radius = radius.min(r.w / 2.0).min(r.h / 2.0).max(0.0);
        if radius < 0.5 {
            return self.fill(r, color, alpha);
        }
        let (cx0, cy0, cx1, cy1) = self.clip;
        let x0 = (r.x.floor() as i32).max(cx0);
        let y0 = (r.y.floor() as i32).max(cy0);
        let x1 = (r.right().ceil() as i32).min(cx1);
        let y1 = (r.bottom().ceil() as i32).min(cy1);
        let (hx, hy) = (r.w / 2.0, r.h / 2.0);
        let (mx, my) = (r.x + hx, r.y + hy);
        for y in y0..y1 {
            let py = y as f32 + 0.5 - my;
            let qy = py.abs() - (hy - radius);
            // Rows away from the corners are solid apart from their two edge pixels.
            if qy <= -1.0 {
                let left = r.x;
                let right = r.right();
                for x in x0..x1 {
                    let fx = x as f32 + 0.5;
                    let cover = ((fx - left + 0.5).min(right - fx + 0.5)).clamp(0.0, 1.0);
                    self.put(x, y, color, (cover * alpha as f32) as u32);
                }
                continue;
            }
            for x in x0..x1 {
                let px = x as f32 + 0.5 - mx;
                let qx = px.abs() - (hx - radius);
                let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
                let d = outside + qx.max(qy).min(0.0) - radius;
                let cover = (0.5 - d).clamp(0.0, 1.0);
                if cover > 0.0 {
                    self.put(x, y, color, (cover * alpha as f32) as u32);
                }
            }
        }
    }
    /// Soft drop shadow made from a few expanding translucent rounded rectangles.
    pub fn shadow(&mut self, r: Rect, radius: f32, spread: f32, color: u32, alpha: u8) {
        let steps = 6;
        for i in (1..=steps).rev() {
            let d = spread * i as f32 / steps as f32;
            let a = (alpha as f32 * (1.0 - i as f32 / (steps as f32 + 1.0)) / steps as f32 * 2.2) as u8;
            self.rrect(
                Rect::new(r.x - d, r.y - d + spread * 0.35, r.w + 2.0 * d, r.h + 2.0 * d),
                radius + d,
                color,
                a,
            );
        }
    }
    pub fn circle(&mut self, cx: f32, cy: f32, radius: f32, color: u32, alpha: u8) {
        self.rrect(
            Rect::new(cx - radius, cy - radius, radius * 2.0, radius * 2.0),
            radius,
            color,
            alpha,
        );
    }
    /// Anti-aliased line segment of a given width (used for small icons).
    pub fn line(&mut self, a: (f32, f32), b: (f32, f32), width: f32, color: u32, alpha: u8) {
        let (cx0, cy0, cx1, cy1) = self.clip;
        let pad = width + 1.0;
        let x0 = ((a.0.min(b.0) - pad).floor() as i32).max(cx0);
        let x1 = ((a.0.max(b.0) + pad).ceil() as i32).min(cx1);
        let y0 = ((a.1.min(b.1) - pad).floor() as i32).max(cy0);
        let y1 = ((a.1.max(b.1) + pad).ceil() as i32).min(cy1);
        let (dx, dy) = (b.0 - a.0, b.1 - a.1);
        let len2 = (dx * dx + dy * dy).max(1e-6);
        for y in y0..y1 {
            for x in x0..x1 {
                let (px, py) = (x as f32 + 0.5 - a.0, y as f32 + 0.5 - a.1);
                let t = ((px * dx + py * dy) / len2).clamp(0.0, 1.0);
                let (ex, ey) = (px - dx * t, py - dy * t);
                let d = (ex * ex + ey * ey).sqrt() - width / 2.0;
                let cover = (0.5 - d).clamp(0.0, 1.0);
                if cover > 0.0 {
                    self.put(x, y, color, (cover * alpha as f32) as u32);
                }
            }
        }
    }
    /// Blit an 8-bit coverage mask.
    pub fn mask(&mut self, x: i32, y: i32, w: i32, h: i32, data: &[u8], color: u32, alpha: u8) {
        let (cx0, cy0, cx1, cy1) = self.clip;
        let ys = y.max(cy0);
        let ye = (y + h).min(cy1);
        let xs = x.max(cx0);
        let xe = (x + w).min(cx1);
        if xs >= xe || ys >= ye {
            return;
        }
        let a = alpha as u32;
        for py in ys..ye {
            let src = ((py - y) * w) as usize;
            let dst = (py * self.w) as usize;
            for px in xs..xe {
                let c = data[src + (px - x) as usize] as u32;
                if c == 0 {
                    continue;
                }
                let k = c * a / 255;
                let i = dst + px as usize;
                self.px[i] = if k >= 255 { color } else { mix(self.px[i], color, k) };
            }
        }
    }
}
