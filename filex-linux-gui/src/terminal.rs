//! A real PTY and VT screen hosted by the existing software-rendered window.
use crate::app::UserEvent;
use std::{
    ffi::OsStr,
    fs::File,
    io::{Read, Write},
    os::fd::{AsRawFd, FromRawFd},
    os::unix::process::CommandExt,
    path::Path,
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
};
use winit::{
    event_loop::EventLoopProxy,
    keyboard::{Key, ModifiersState, NamedKey},
};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
pub struct Terminal {
    pub id: u64,
    pub parser: vt100::Parser<Responses>,
    master: File,
    child: Child,
    pub exited: bool,
    pub title: String,
}
impl Terminal {
    pub fn spawn(
        cwd: &Path,
        script: &OsStr,
        pause: bool,
        title: String,
        proxy: EventLoopProxy<UserEvent>,
    ) -> Result<Self, String> {
        Self::spawn_with_sink(
            cwd,
            script,
            pause,
            title,
            Box::new(move |event| {
                let _ = proxy.send_event(event);
            }),
        )
    }
    pub(crate) fn spawn_with_sink(
        cwd: &Path,
        script: &OsStr,
        pause: bool,
        title: String,
        sink: Box<dyn Fn(UserEvent) + Send>,
    ) -> Result<Self, String> {
        let size = libc::winsize {
            ws_row: 24,
            ws_col: 80,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        let (mut master, mut slave) = (-1, -1);
        // SAFETY: valid output pointers, default terminal settings, fixed initial size.
        if unsafe {
            libc::openpty(
                &mut master,
                &mut slave,
                std::ptr::null_mut(),
                std::ptr::null(),
                &size,
            )
        } != 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
        // SAFETY: openpty returned two owned descriptors.
        let master = unsafe { File::from_raw_fd(master) };
        let slave = unsafe { File::from_raw_fd(slave) };
        let mut body = script.to_os_string();
        if pause {
            body.push("\nstatus=$?; printf '\\n[exit %s] Enter returns ' \"$status\"; read -r _\n");
        }
        let mut command = Command::new("sh");
        command
            .arg("-c")
            .arg(body)
            .current_dir(cwd)
            .env("TERM", "xterm-256color")
            .env_remove("FILEX_CWD_FILE")
            .stdin(Stdio::from(slave.try_clone().map_err(|e| e.to_string())?))
            .stdout(Stdio::from(slave.try_clone().map_err(|e| e.to_string())?))
            .stderr(Stdio::from(slave));
        // SAFETY: only async-signal-safe libc calls between fork and exec. Stdio
        // has already been mapped to the PTY slave by Command.
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() < 0 || libc::ioctl(0, libc::TIOCSCTTY, 0) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let child = command.spawn().map_err(|e| e.to_string())?;
        drop(command); // close parent copies of slave, allowing EOF
        let mut reader = master.try_clone().map_err(|e| e.to_string())?;
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        std::thread::spawn(move || {
            let mut bytes = [0; 8192];
            loop {
                match reader.read(&mut bytes) {
                    Ok(0) => break,
                    Ok(n) => sink(UserEvent::TerminalOutput(id, bytes[..n].to_vec())),
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => break,
                }
            }
            sink(UserEvent::TerminalEnded(id));
        });
        Ok(Self {
            id,
            parser: vt100::Parser::new_with_callbacks(
                std::num::NonZeroU16::new(24).unwrap(),
                std::num::NonZeroU16::new(80).unwrap(),
                2000,
                Responses::default(),
            ),
            master,
            child,
            exited: false,
            title,
        })
    }
    pub fn resize(&mut self, rows: u16, cols: u16) {
        let (nr, nc) = (
            std::num::NonZeroU16::new(rows.max(1)).unwrap(),
            std::num::NonZeroU16::new(cols.max(1)).unwrap(),
        );
        if self.parser.screen().size() == (nr, nc) {
            return;
        }
        self.parser.screen_mut().set_size(nr, nc);
        let size = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        // SAFETY: master is an open PTY and size is a valid winsize.
        unsafe {
            libc::ioctl(self.master.as_raw_fd(), libc::TIOCSWINSZ, &size);
        }
    }
    pub fn process(&mut self, bytes: &[u8]) {
        self.parser.process(bytes);
        let response = std::mem::take(&mut self.parser.callbacks_mut().0);
        if !response.is_empty() {
            self.write(&response);
        }
    }
    pub fn write(&mut self, bytes: &[u8]) {
        let _ = self.master.write_all(bytes);
    }
    pub fn finished(&mut self) -> bool {
        self.exited && self.child.try_wait().ok().flatten().is_some()
    }
}
impl Drop for Terminal {
    fn drop(&mut self) {
        if self.child.try_wait().ok().flatten().is_none() {
            // PTY session owns this process group; no unrelated shell is signalled.
            unsafe {
                libc::kill(-(self.child.id() as i32), libc::SIGHUP);
            }
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
    }
}

pub fn key_bytes(
    key: &Key,
    text: Option<&str>,
    mods: ModifiersState,
    application: bool,
) -> Vec<u8> {
    let mut bytes = match key {
        Key::Named(k) => match k {
            NamedKey::Enter => b"\r".to_vec(),
            NamedKey::Escape => b"\x1b".to_vec(),
            NamedKey::Backspace => b"\x7f".to_vec(),
            NamedKey::Tab if mods.shift_key() => b"\x1b[Z".to_vec(),
            NamedKey::Tab => b"\t".to_vec(),
            NamedKey::Space if mods.control_key() => vec![0],
            NamedKey::Space => b" ".to_vec(),
            NamedKey::ArrowUp
            | NamedKey::ArrowDown
            | NamedKey::ArrowRight
            | NamedKey::ArrowLeft => {
                let last = match k {
                    NamedKey::ArrowUp => 'A',
                    NamedKey::ArrowDown => 'B',
                    NamedKey::ArrowRight => 'C',
                    _ => 'D',
                };
                let modifier = 1
                    + u8::from(mods.shift_key())
                    + 2 * u8::from(mods.alt_key())
                    + 4 * u8::from(mods.control_key());
                if modifier > 1 {
                    format!("\x1b[1;{modifier}{last}").into_bytes()
                } else {
                    format!("\x1b{}{last}", if application { 'O' } else { '[' }).into_bytes()
                }
            }
            NamedKey::Home => b"\x1b[H".to_vec(),
            NamedKey::End => b"\x1b[F".to_vec(),
            NamedKey::Insert => b"\x1b[2~".to_vec(),
            NamedKey::Delete => b"\x1b[3~".to_vec(),
            NamedKey::PageUp => b"\x1b[5~".to_vec(),
            NamedKey::PageDown => b"\x1b[6~".to_vec(),
            NamedKey::F1 => b"\x1bOP".to_vec(),
            NamedKey::F2 => b"\x1bOQ".to_vec(),
            NamedKey::F3 => b"\x1bOR".to_vec(),
            NamedKey::F4 => b"\x1bOS".to_vec(),
            NamedKey::F5 => b"\x1b[15~".to_vec(),
            NamedKey::F6 => b"\x1b[17~".to_vec(),
            NamedKey::F7 => b"\x1b[18~".to_vec(),
            NamedKey::F8 => b"\x1b[19~".to_vec(),
            NamedKey::F9 => b"\x1b[20~".to_vec(),
            NamedKey::F10 => b"\x1b[21~".to_vec(),
            NamedKey::F11 => b"\x1b[23~".to_vec(),
            NamedKey::F12 => b"\x1b[24~".to_vec(),
            _ => vec![],
        },
        Key::Character(s) if mods.control_key() => {
            let c = s.chars().next().unwrap_or('\0');
            if c.is_ascii_alphabetic() {
                vec![(c.to_ascii_uppercase() as u8) & 31]
            } else {
                match c {
                    '@' | ' ' | '2' => vec![0],
                    '[' => vec![27],
                    '\\' => vec![28],
                    ']' => vec![29],
                    '^' => vec![30],
                    '_' => vec![31],
                    _ => vec![],
                }
            }
        }
        Key::Character(s) => text.unwrap_or(s.as_str()).as_bytes().to_vec(),
        _ => vec![],
    };
    if mods.alt_key()
        && !matches!(
            key,
            Key::Named(
                NamedKey::ArrowUp
                    | NamedKey::ArrowDown
                    | NamedKey::ArrowLeft
                    | NamedKey::ArrowRight
            )
        )
    {
        bytes.insert(0, 27);
    }
    bytes
}

fn color(value: vt100::Color, default: u32) -> u32 {
    match value {
        vt100::Color::Default => default,
        vt100::Color::Rgb(r, g, b) => (u32::from(r) << 16) | (u32::from(g) << 8) | u32::from(b),
        vt100::Color::Idx(i) => {
            const ANSI: [u32; 16] = [
                0x000000, 0xcd0000, 0x00cd00, 0xcdcd00, 0x0000ee, 0xcd00cd, 0x00cdcd, 0xe5e5e5,
                0x7f7f7f, 0xff0000, 0x00ff00, 0xffff00, 0x5c5cff, 0xff00ff, 0x00ffff, 0xffffff,
            ];
            if i < 16 {
                ANSI[i as usize]
            } else if i >= 232 {
                let v = 8 + (i as u32 - 232) * 10;
                v * 0x010101
            } else {
                let n = i as u32 - 16;
                let c = |v| if v == 0 { 0 } else { 55 + 40 * v };
                (c(n / 36) << 16) | (c(n / 6 % 6) << 8) | c(n % 6)
            }
        }
    }
}
impl Terminal {
    pub fn draw(
        &mut self,
        canvas: &mut crate::paint::Canvas,
        fonts: &mut crate::font::Fonts,
        theme: crate::theme::Theme,
        scale: f32,
        font_size: f32,
    ) {
        use crate::{font::Face, paint::Rect};
        let rect = Rect::new(
            0.0,
            46.0 * scale,
            canvas.w as f32,
            canvas.h as f32 - 76.0 * scale,
        );
        canvas.set_clip(rect);
        canvas.fill(rect, theme.bg, 255);
        let size = font_size * scale;
        let cw = fonts.measure("0", Face::Mono, size, 0.0);
        let ch = (size * 1.4).ceil();
        let pad = 8.0 * scale;
        let rows = ((rect.h - pad * 2.0) / ch).clamp(1.0, 1000.0) as u16;
        let cols = ((rect.w - pad * 2.0) / cw).clamp(1.0, 2000.0) as u16;
        self.resize(rows, cols);
        let screen = self.parser.screen();
        for row in 0..rows {
            for col in 0..cols {
                let Some(cell) = screen.cell(row, col) else {
                    continue;
                };
                if cell.is_wide_continuation() {
                    continue;
                }
                let (mut fg, mut bg) = (
                    color(cell.fgcolor(), theme.text),
                    color(cell.bgcolor(), theme.bg),
                );
                if cell.inverse() {
                    std::mem::swap(&mut fg, &mut bg);
                }
                let x = pad + col as f32 * cw;
                let y = rect.y + pad + row as f32 * ch;
                let width = cw * if cell.is_wide() { 2.0 } else { 1.0 };
                canvas.fill(Rect::new(x, y, width, ch), bg, 255);
                let base = fonts.baseline(Face::Mono, size, y, ch);
                fonts.draw(
                    canvas,
                    x,
                    base,
                    &cell.contents(),
                    Face::Mono,
                    size,
                    0.0,
                    fg,
                    255,
                );
                if cell.underline() {
                    canvas.hline(x, x + width, y + ch - 2.0, scale, fg, 255);
                }
            }
        }
        if !screen.hide_cursor() {
            let (row, col) = screen.cursor_position();
            canvas.stroke(
                Rect::new(
                    pad + col as f32 * cw,
                    rect.y + pad + row as f32 * ch,
                    cw,
                    ch,
                ),
                scale,
                theme.text,
                255,
            );
        }
        canvas.reset_clip();
    }
}

#[derive(Default)]
pub struct Responses(Vec<u8>);
impl vt100::Callbacks for Responses {
    fn unhandled_csi(
        &mut self,
        screen: &mut vt100::Screen,
        _: Option<u8>,
        _: Option<u8>,
        params: &[&[u16]],
        command: char,
    ) {
        if command == 'n' && params.first().is_some_and(|v| *v == [6]) {
            let (row, col) = screen.cursor_position();
            self.0
                .extend_from_slice(format!("\x1b[{};{}R", row + 1, col + 1).as_bytes());
        } else if command == 'c' {
            self.0.extend_from_slice(b"\x1b[?1;2c");
        }
    }
}
