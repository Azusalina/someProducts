//! One background preview at a time; no exported files or persistent cache.
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub struct Preview {
    pub image: image::RgbaImage,
    pub pages: u32,
}
pub struct State {
    pub path: Option<PathBuf>,
    pub generation: u64,
    pub page: u32,
    pub pages: u32,
    pub image: Option<image::RgbaImage>,
    pub error: String,
    pub busy: bool,
    pub due: Instant,
}
impl Default for State {
    fn default() -> Self {
        Self {
            path: None,
            generation: 0,
            page: 1,
            pages: 1,
            image: None,
            error: String::new(),
            busy: false,
            due: Instant::now(),
        }
    }
}
impl State {
    pub fn request(&mut self, path: &Path) {
        let path = supported(path).then(|| path.to_path_buf());
        if self.path == path {
            return;
        }
        self.generation = self.generation.wrapping_add(1);
        self.path = path;
        self.page = 1;
        self.pages = 1;
        self.image = None;
        self.error.clear();
        self.due = Instant::now() + Duration::from_millis(150);
    }
    pub fn invalidate(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.path = None;
        self.image = None;
        self.error.clear();
    }
    pub fn turn(&mut self, delta: i32) {
        let page = (self.page as i64 + delta as i64).clamp(1, self.pages as i64) as u32;
        if page != self.page {
            self.generation = self.generation.wrapping_add(1);
            self.page = page;
            self.image = None;
            self.error.clear();
            self.due = Instant::now();
        }
    }
}
pub fn is_pdf(path: &Path) -> bool {
    path.extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("pdf"))
}
pub fn supported(path: &Path) -> bool {
    path.extension().is_some_and(|s| {
        [
            "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "pdf",
        ]
        .iter()
        .any(|e| s.eq_ignore_ascii_case(e))
    }) && path.is_file()
}
fn output(mut command: Command, limit: u64) -> Result<Vec<u8>, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("Install poppler (pdfinfo / pdftoppm): {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let reader = std::thread::spawn(move || {
        let mut bytes = vec![];
        stdout
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(20);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break Err("PDF preview timed out".to_string());
            }
        }
    };
    let bytes = reader
        .join()
        .map_err(|_| "Preview reader stopped")?
        .map_err(|e| e.to_string())?;
    if !status?.success() {
        return Err("Cannot render PDF (damaged, password protected, or unsupported)".into());
    }
    if bytes.len() as u64 > limit {
        return Err("Preview exceeds size limit".into());
    }
    Ok(bytes)
}
pub fn load(path: &Path, page: u32) -> Result<Preview, String> {
    let (mut reader, pages) = if is_pdf(path) {
        let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        let mut info = Command::new("pdfinfo");
        info.env("LC_ALL", "C").arg(&path);
        let info = output(info, 128 * 1024)?;
        let pages = String::from_utf8_lossy(&info)
            .lines()
            .find_map(|s| {
                s.strip_prefix("Pages:")
                    .and_then(|n| n.trim().parse::<u32>().ok())
            })
            .ok_or("PDF page count unavailable")?;
        let page = page.clamp(1, pages.max(1)).to_string();
        let mut command = Command::new("pdftoppm");
        command
            .args([
                "-f",
                &page,
                "-l",
                &page,
                "-scale-to",
                "1400",
                "-singlefile",
                "-png",
            ])
            .arg(path);
        let bytes = output(command, 32 * 1024 * 1024)?;
        (
            image::ImageReader::new(std::io::Cursor::new(bytes))
                .with_guessed_format()
                .map_err(|e| e.to_string())?,
            pages,
        )
    } else {
        if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 128 * 1024 * 1024 {
            return Err("Photo exceeds 128 MiB preview limit".into());
        }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        (
            image::ImageReader::new(std::io::Cursor::new(bytes))
                .with_guessed_format()
                .map_err(|e| e.to_string())?,
            1,
        )
    };
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(256 * 1024 * 1024);
    limits.max_image_width = Some(24000);
    limits.max_image_height = Some(24000);
    reader.limits(limits);
    use image::ImageDecoder;
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut decoded = image::DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    decoded.apply_orientation(orientation);
    let decoded = if decoded.width() > 1400 || decoded.height() > 1400 {
        decoded.thumbnail(1400, 1400)
    } else {
        decoded
    };
    Ok(Preview {
        image: decoded.into_rgba8(),
        pages,
    })
}

pub fn draw(canvas: &mut crate::paint::Canvas, image: &image::RgbaImage, rect: crate::paint::Rect) {
    if rect.w < 1.0 || rect.h < 1.0 {
        return;
    }
    let scale = (rect.w / image.width() as f32).min(rect.h / image.height() as f32);
    let w = (image.width() as f32 * scale).max(1.0) as i32;
    let h = (image.height() as f32 * scale).max(1.0) as i32;
    let x = (rect.x + (rect.w - w as f32) / 2.0) as i32;
    let y = rect.y as i32;
    for py in 0..h {
        for px in 0..w {
            let p = image
                .get_pixel(
                    ((px as f32 / scale) as u32).min(image.width() - 1),
                    ((py as f32 / scale) as u32).min(image.height() - 1),
                )
                .0;
            canvas.put(
                x + px,
                y + py,
                (p[0] as u32) << 16 | (p[1] as u32) << 8 | p[2] as u32,
                p[3] as u32,
            );
        }
    }
}
