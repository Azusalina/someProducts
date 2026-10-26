//! Two restrained palettes: graphite and paper, one constructivist red.
//! Configured filex colours (bright 16-colour slots) are harmonised into the
//! palette so file categories stay distinguishable without shouting.

#[derive(Clone, Copy)]
pub struct Theme {
    pub dark: bool,
    pub bg: u32,
    pub surface: u32,
    pub raised: u32,
    pub hair: u32,
    pub line: u32,
    pub text: u32,
    pub dim: u32,
    pub faint: u32,
    pub accent: u32,
    pub on_accent: u32,
    pub hover: u32,
    pub shadow: u32,
}

pub const DARK: Theme = Theme {
    dark: true,
    bg: 0x0c0c0e,
    surface: 0x121215,
    raised: 0x18181c,
    hair: 0x232327,
    line: 0x34343a,
    text: 0xecebe6,
    dim: 0x9a9893,
    faint: 0x5f5e5a,
    accent: 0xe0442b,
    on_accent: 0xfffaf5,
    hover: 0x1c1c20,
    shadow: 0x000000,
};

pub const LIGHT: Theme = Theme {
    dark: false,
    bg: 0xf3f1ec,
    surface: 0xebe8e2,
    raised: 0xfbfaf7,
    hair: 0xdcd8d0,
    line: 0xc4bfb5,
    text: 0x161616,
    dim: 0x5e5c58,
    faint: 0x9b978f,
    accent: 0xcf3a22,
    on_accent: 0xfffaf5,
    hover: 0xe6e2da,
    shadow: 0x2a2620,
};

pub fn parse_hex(value: &str) -> Option<u32> {
    let v = value.trim().strip_prefix('#')?;
    (v.len() == 6).then(|| u32::from_str_radix(v, 16).ok())?
}

fn to_hsl(c: u32) -> (f32, f32, f32) {
    let r = ((c >> 16) & 0xff) as f32 / 255.0;
    let g = ((c >> 8) & 0xff) as f32 / 255.0;
    let b = (c & 0xff) as f32 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < 1e-6 {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h / 6.0, s, l)
}

fn from_hsl(h: f32, s: f32, l: f32) -> u32 {
    let f = |n: f32| {
        let k = (n + h * 12.0) % 12.0;
        let a = s * l.min(1.0 - l);
        let v = l - a * (k - 3.0).min(9.0 - k).clamp(-1.0, 1.0);
        (v.clamp(0.0, 1.0) * 255.0).round() as u32
    };
    (f(0.0) << 16) | (f(8.0) << 8) | f(4.0)
}

impl Theme {
    /// Map any configured colour into this palette's lightness / saturation band.
    pub fn tone(&self, value: &str) -> Option<u32> {
        let (h, s, l) = to_hsl(parse_hex(value)?);
        if s < 0.12 {
            // Greys follow the text ramp.
            return Some(if l < 0.45 { self.faint } else { self.dim });
        }
        let s = s.min(0.52) * 0.92;
        let l = if self.dark { l.clamp(0.60, 0.70) } else { l.clamp(0.36, 0.44) };
        Some(from_hsl(h, s, l))
    }
}
