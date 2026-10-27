macro_rules! ui_format {
    ($zh:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if crate::terminal_profile::get().ascii { format!($en $(, $arg)*) }
        else { format!($zh $(, $arg)*) }
    };
}
// The tree model, file operations, ordering and Git logic are compiled from
// ../fileX itself, so the GUI follows the TUI's behaviour and configuration.
#[allow(dead_code)]
#[path = "../../fileX/src/config.rs"]
mod config;
#[allow(dead_code)]
#[path = "../../fileX/src/edit.rs"]
mod edit;
#[allow(dead_code)]
#[path = "../../fileX/src/files.rs"]
mod files;
#[allow(dead_code)]
#[path = "../../fileX/src/git_actions.rs"]
mod git_actions;
#[allow(dead_code)]
#[path = "../../fileX/src/git_status.rs"]
mod git_status;
#[allow(dead_code)]
#[path = "../../fileX/src/jobs.rs"]
mod jobs;
#[allow(dead_code)]
#[path = "../../fileX/src/links.rs"]
mod links;
#[allow(dead_code)]
#[path = "../../fileX/src/model.rs"]
mod model;
#[allow(dead_code)]
#[path = "../../fileX/src/ordering.rs"]
mod ordering;
#[allow(dead_code)]
#[path = "../../fileX/src/transfer.rs"]
mod transfer;

mod app;
mod dnd;
mod font;
mod gui_config;
mod keys;
mod launch;
mod layout;
mod paint;
mod preview;
mod terminal;
mod terminal_profile;
#[cfg(test)]
mod tests;
mod theme;
mod view;

use app::{App, Modal, UserEvent};
use std::{
    env,
    io::IsTerminal,
    num::NonZeroU32,
    os::unix::process::CommandExt,
    path::PathBuf,
    rc::Rc,
    time::{Duration, Instant},
};
use view::{Control, Hits, ViewState};
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalSize, PhysicalPosition, PhysicalSize},
    event::{ElementState, Ime, MouseButton, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop, EventLoopProxy},
    keyboard::ModifiersState,
    window::{CursorIcon, Fullscreen, ResizeDirection, Window, WindowId},
};

const HELP: &str = "filex-gui [DIRECTORY] [--config PATH]\n\
Graphical filex: the same horizontal tree, keys and filex.conf as the TUI.";

fn main() {
    if let Err(error) = run() {
        eprintln!("filex-gui: {error}");
        std::process::exit(1)
    }
}

fn run() -> Result<(), String> {
    if env::var_os("FILEX_ROOT").is_none() {
        // {filex} in opener commands refers to the TUI's product folder.
        let sibling = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../fileX"));
        if let Ok(path) = std::fs::canonicalize(sibling) {
            // SAFETY: single-threaded at this point; no other thread reads the environment.
            unsafe { env::set_var("FILEX_ROOT", path) };
        }
    }
    let mut path = PathBuf::from(".");
    let mut conf_path = config::config_path();
    let mut explicit = false;
    let mut positional = false;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--version" => {
                println!("filex-gui {}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            "--help" | "-h" => {
                println!("{HELP}");
                return Ok(());
            }
            "--config" => {
                conf_path = config::expand_home(&args.next().ok_or("--config needs a path")?);
                explicit = true;
            }
            "--" => {
                path = PathBuf::from(args.next().ok_or("missing directory")?);
                break;
            }
            _ if arg.starts_with('-') => return Err(format!("unknown option: {arg}")),
            _ => {
                if positional {
                    return Err("only one root directory is accepted".into());
                }
                path = config::expand_home(&arg);
                positional = true;
            }
        }
    }
    if explicit && !conf_path.exists() {
        return Err(format!("config not found: {}", conf_path.display()));
    }
    let gui = gui_config::GuiConfig::load(&conf_path)?;
    terminal_profile::init(gui.language == "en");
    let conf = config::Config::load(&conf_path)?;
    let browser = model::Browser::new(&path, conf)?;
    let event_loop = EventLoop::<UserEvent>::with_user_event()
        .build()
        .map_err(|e| e.to_string())?;
    event_loop.set_control_flow(ControlFlow::Wait);
    let mut app = App::new(browser, conf_path, gui);
    app.proxy = Some(event_loop.create_proxy());
    let mut shell = Shell::new(app, event_loop.create_proxy());
    event_loop.run_app(&mut shell).map_err(|e| e.to_string())?;
    let app = shell.app;
    if let Some(directory) = app.exit_directory
        && env::var_os("FILEX_CWD_FILE").is_none()
    {
        if std::io::stdin().is_terminal() {
            // Same as the TUI: continue in an interactive shell in that folder.
            let shell = env::var_os("SHELL").unwrap_or_else(|| "/bin/bash".into());
            let error = std::process::Command::new(shell)
                .arg("-i")
                .current_dir(directory)
                .exec();
            return Err(format!("cannot start shell: {error}"));
        }
        launch::open_shell(&app.gui.terminal, &directory)?;
    }
    Ok(())
}

struct Shell {
    app: App,
    _proxy: EventLoopProxy<UserEvent>,
    // Declared before the window so the foreign Wayland proxies drop first.
    dnd: Option<dnd::Dnd>,
    press: Option<(f32, f32, model::NodeRef)>,
    window: Option<Rc<Window>>,
    context: Option<softbuffer::Context<Rc<Window>>>,
    surface: Option<softbuffer::Surface<Rc<Window>, Rc<Window>>>,
    fonts: font::Fonts,
    vs: ViewState,
    hits: Hits,
    mods: ModifiersState,
    cursor: (f32, f32),
    last_click: Option<(Instant, f32, f32)>,
    dark: bool,
    ime: bool,
    animating: bool,
    last_fullscreen: Option<bool>,
}

impl Shell {
    fn new(app: App, proxy: EventLoopProxy<UserEvent>) -> Self {
        let client = app.gui.decorations == "client";
        Self {
            app,
            _proxy: proxy,
            dnd: None,
            press: None,
            window: None,
            context: None,
            surface: None,
            fonts: font::Fonts::new(),
            vs: ViewState::new(client),
            hits: Hits::default(),
            mods: ModifiersState::empty(),
            cursor: (0.0, 0.0),
            last_click: None,
            dark: true,
            ime: false,
            animating: false,
            last_fullscreen: None,
        }
    }
    fn scale(&self) -> f32 {
        self.window
            .as_ref()
            .map_or(1.0, |w| w.scale_factor() as f32)
            * self.app.gui.zoom
    }
    fn redraw(&self) {
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }
    fn changed(&mut self) {
        self.vs.dirty = true;
        if let Some(window) = &self.window {
            let title = if self.app.terminal_visible {
                self.app
                    .terminal_page
                    .as_ref()
                    .map(|t| format!("filex · {}", t.title))
            } else {
                None
            };
            window.set_title(title.as_deref().unwrap_or("filex"));
        }
        let prompt =
            self.app.terminal_visible || matches!(self.app.modal, Some(Modal::Prompt { .. }));
        if prompt != self.ime
            && let Some(window) = &self.window
        {
            // Hotkeys bypass the input method; prompts accept composed text.
            window.set_ime_allowed(prompt);
            self.ime = prompt;
        }
        self.redraw();
    }
    fn render(&mut self) {
        let (Some(window), Some(surface)) = (self.window.clone(), self.surface.as_mut()) else {
            return;
        };
        let fullscreen = window.fullscreen().is_some();
        if self.last_fullscreen != Some(fullscreen) {
            self.app.dashboard = fullscreen;
            self.app.meta_path = None;
            self.last_fullscreen = Some(fullscreen);
        }
        let size = window.inner_size();
        let (Some(w), Some(h)) = (NonZeroU32::new(size.width), NonZeroU32::new(size.height)) else {
            return;
        };
        if surface.resize(w, h).is_err() {
            return;
        }
        let Ok(mut buffer) = surface.buffer_mut() else {
            return;
        };
        let scale = window.scale_factor() as f32 * self.app.gui.zoom;
        let palette = if self.dark { theme::DARK } else { theme::LIGHT };
        let started = Instant::now();
        let mut canvas = paint::Canvas::new(&mut buffer, size.width, size.height);
        let (mut hits, animating) = view::draw(
            &mut canvas,
            &mut self.app,
            &mut self.fonts,
            palette,
            scale,
            &mut self.vs,
        );
        if self.app.terminal_visible
            && let Some(t) = &mut self.app.terminal_page
        {
            t.draw(
                &mut canvas,
                &mut self.fonts,
                palette,
                scale,
                self.app.gui.font_size,
            );
            hits.nodes.clear();
            hits.crumbs.clear();
        }
        let _ = buffer.present();
        if env::var_os("FILEX_GUI_TRACE").is_some() {
            eprintln!(
                "frame {:.2} ms  {}x{}",
                started.elapsed().as_secs_f64() * 1e3,
                size.width,
                size.height
            );
        }
        if let Some(caret) = hits.caret {
            window.set_ime_cursor_area(
                PhysicalPosition::new(caret.x as f64, caret.y as f64),
                PhysicalSize::new(caret.w as f64, caret.h as f64),
            );
        }
        self.hits = hits;
        self.animating = animating;
    }
    fn edge(&self, window: &Window) -> Option<ResizeDirection> {
        if !self.vs.client_decorations || (window.is_maximized() || window.fullscreen().is_some()) {
            return None;
        }
        let size = window.inner_size();
        let (w, h) = (size.width as f32, size.height as f32);
        let d = 6.0 * window.scale_factor() as f32;
        let (x, y) = self.cursor;
        let (l, r, t, b) = (x < d, x > w - d, y < d, y > h - d);
        Some(match (l, r, t, b) {
            (true, _, true, _) => ResizeDirection::NorthWest,
            (_, true, true, _) => ResizeDirection::NorthEast,
            (true, _, _, true) => ResizeDirection::SouthWest,
            (_, true, _, true) => ResizeDirection::SouthEast,
            (true, ..) => ResizeDirection::West,
            (_, true, ..) => ResizeDirection::East,
            (_, _, true, _) => ResizeDirection::North,
            (_, _, _, true) => ResizeDirection::South,
            _ => return None,
        })
    }
    fn double(&mut self) -> bool {
        let now = Instant::now();
        let (x, y) = self.cursor;
        let double = self.last_click.is_some_and(|(t, px, py)| {
            now.duration_since(t) < Duration::from_millis(420)
                && (px - x).abs() < 6.0
                && (py - y).abs() < 6.0
        });
        self.last_click = if double { None } else { Some((now, x, y)) };
        double
    }
    fn click(&mut self, event_loop: &ActiveEventLoop, button: MouseButton) {
        let Some(window) = self.window.clone() else {
            return;
        };
        let (x, y) = self.cursor;
        if button == MouseButton::Left
            && let Some(direction) = self.edge(&window)
        {
            let _ = window.drag_resize_window(direction);
            return;
        }
        let double = self.double();
        if let Some(modal) = self.hits.modal {
            if !modal.contains(x, y) {
                self.app.handle_key("escape");
            } else if let Some(&(_, index)) = self.hits.rows.iter().find(|(r, _)| r.contains(x, y))
            {
                let activate = matches!(self.app.modal, Some(Modal::Choose { .. }));
                self.app.modal_pick(index, activate);
            }
            return self.changed();
        }
        if let Some(&(_, control)) = self.hits.controls.iter().find(|(r, _)| r.contains(x, y)) {
            match control {
                Control::Close => event_loop.exit(),
                Control::Maximize => {
                    if window.fullscreen().is_some() {
                        window.set_fullscreen(None);
                    } else {
                        window.set_maximized(!window.is_maximized());
                    }
                }
                Control::Minimize => window.set_minimized(true),
            }
            return;
        }
        if self.app.terminal_visible {
            return;
        }
        if let Some((_, step)) = self
            .hits
            .preview_buttons
            .iter()
            .find(|(r, _)| r.contains(x, y))
        {
            self.app.preview.turn(*step);
            return self.changed();
        }
        if let Some((_, path)) = self
            .hits
            .crumbs
            .iter()
            .find(|(r, _)| r.contains(x, y))
            .cloned()
        {
            if button == MouseButton::Left {
                match self.app.browser.set_root(&path.to_string_lossy()) {
                    Ok(()) => {
                        self.app.left = 0.0;
                        self.app.top = 0.0;
                        self.app.link_target = None;
                        self.app.query.clear();
                    }
                    Err(e) => self.app.message = e,
                }
                return self.changed();
            }
        }
        if self.hits.header.contains(x, y) {
            if button == MouseButton::Left {
                if double {
                    window.set_maximized(!window.is_maximized());
                } else if self.vs.client_decorations {
                    let _ = window.drag_window();
                }
            }
            return;
        }
        let node = self
            .hits
            .nodes
            .iter()
            .find(|(r, _)| r.contains(x, y))
            .map(|(_, n)| n.clone());
        if let Some(node) = node {
            match button {
                MouseButton::Left => {
                    self.app.select(&node);
                    if double {
                        self.app.handle_key("enter");
                    }
                }
                MouseButton::Right => {
                    self.app.select(&node);
                    self.app.handle_action("open_with");
                }
                MouseButton::Middle => {
                    self.app.select(&node);
                    self.app.handle_key(" ");
                }
                _ => {}
            }
            self.changed();
        }
    }
    /// A press on a node that travels a few pixels becomes an outbound drag
    /// carrying that node, or every marked item when the node is marked.
    fn drag(&mut self) {
        if self.app.terminal_visible || self.app.modal.is_some() {
            self.press = None;
            return;
        }
        let Some((x, y, node)) = &self.press else {
            return;
        };
        let threshold = 8.0 * self.scale();
        if (self.cursor.0 - x).abs() < threshold && (self.cursor.1 - y).abs() < threshold {
            return;
        }
        let node = node.clone();
        self.press = None;
        let path = node.borrow().path.clone();
        if node.borrow().create_entry {
            return;
        }
        let paths: Vec<PathBuf> = if self.app.marked.contains(&path) {
            self.app.marked.iter().cloned().collect()
        } else {
            vec![path]
        };
        self.app.message = match self.dnd.as_mut().map(|d| d.start(&paths)) {
            Some(Ok(())) => format!(
                "Dragging {} item{}",
                paths.len(),
                if paths.len() == 1 { "" } else { "s" }
            ),
            Some(Err(e)) => format!("Drag failed: {e}"),
            None => "Dragging out needs a Wayland session".into(),
        };
        self.last_click = None;
        self.changed();
    }
    fn drop_target(&self, x: f32, y: f32) -> Option<PathBuf> {
        if self.app.modal.is_some() || self.app.terminal_visible {
            return None;
        }
        if let Some((_, path)) = self.hits.crumbs.iter().find(|(r, _)| r.contains(x, y)) {
            return Some(path.clone());
        }
        let (_, node) = self
            .hits
            .nodes
            .iter()
            .find(|(r, n)| r.contains(x, y) && n.borrow().dir)?;
        Some(node.borrow().path.clone())
    }
    fn receive_drops(&mut self) {
        let scale = self
            .window
            .as_ref()
            .map_or(1.0, |w| w.scale_factor() as f32);
        let (drop, hover) = if let Some(dnd) = &mut self.dnd {
            dnd.set_copy_modifier(self.mods.control_key());
            dnd.pump();
            (dnd.take_drop(), dnd.position())
        } else {
            (None, None)
        };
        if let Some((x, y)) = hover {
            self.cursor = (x as f32 * scale, y as f32 * scale);
            self.hover();
        }
        if let Some((result, (x, y), moving)) = drop {
            let target = self.drop_target(x as f32 * scale, y as f32 * scale);
            let result = result.and_then(|paths| {
                self.app.drop_paths(
                    paths,
                    &target.ok_or("Drop onto a folder or a breadcrumb")?,
                    moving,
                )
            });
            if let Err(e) = result {
                self.app.message = format!("Drop failed: {e}");
            }
            self.changed();
        }
    }
    fn hover(&mut self) {
        let (x, y) = self.cursor;
        let hovered = self
            .hits
            .nodes
            .iter()
            .find(|(r, _)| r.contains(x, y))
            .map(|(_, n)| n.clone());
        if self.hits.modal.is_none() && !self.app.terminal_visible {
            if let Some(n) = &hovered {
                let path = n.borrow().path.clone();
                if self.app.info_path.as_ref() != Some(&path) {
                    self.app.info_path = Some(path);
                    self.app.meta_path = None;
                    self.redraw();
                }
            }
        }
        let node = hovered.as_ref().map(|n| Rc::as_ptr(n) as usize);
        let control = self
            .hits
            .controls
            .iter()
            .find(|(r, _)| r.contains(x, y))
            .map(|(_, c)| *c);
        let node = if self.hits.modal.is_some() {
            None
        } else {
            node
        };
        if node != self.vs.hover || control != self.vs.hover_control {
            self.vs.hover = node;
            self.vs.hover_control = control;
            self.redraw();
        }
        if let Some(window) = &self.window {
            let icon = match self.edge(window) {
                Some(ResizeDirection::East | ResizeDirection::West) => CursorIcon::EwResize,
                Some(ResizeDirection::North | ResizeDirection::South) => CursorIcon::NsResize,
                Some(ResizeDirection::NorthEast | ResizeDirection::SouthWest) => {
                    CursorIcon::NeswResize
                }
                Some(ResizeDirection::NorthWest | ResizeDirection::SouthEast) => {
                    CursorIcon::NwseResize
                }
                None if node.is_some()
                    || self.hits.crumbs.iter().any(|(r, _)| r.contains(x, y)) =>
                {
                    CursorIcon::Pointer
                }
                None => CursorIcon::Default,
            };
            window.set_cursor(icon);
        }
    }
    fn scroll(&mut self, dx: f32, dy: f32) {
        if self.hits.modal.is_some() {
            let rows = (dy / (19.0 * self.scale())).round() as isize;
            self.app.modal_scroll(-rows);
            return self.redraw();
        }
        let (dx, dy) = if self.mods.shift_key() {
            (dy, dx)
        } else {
            (dx, dy)
        };
        self.app.left = (self.app.left - dx).max(0.0);
        self.app.top = (self.app.top - dy).max(0.0);
        self.app.focus = false;
        self.vs.cam = (self.app.left, self.app.top);
        self.redraw();
    }
    fn toggle_theme(&mut self) {
        self.dark = !self.dark;
        let value = if self.dark { "dark" } else { "light" };
        self.app.gui.theme = value.into();
        if let Err(e) = gui_config::save(&self.app.config_path, "theme", toml_edit::value(value)) {
            self.app.message = format!("Theme not saved: {e}");
        }
        self.changed();
    }
    fn zoom(&mut self, step: i32) {
        let zoom = &mut self.app.gui.zoom;
        *zoom = if step == 0 {
            1.0
        } else {
            (*zoom + 0.1 * step as f32).clamp(0.6, 2.5)
        };
        *zoom = (*zoom * 10.0).round() / 10.0;
        let value = *zoom as f64;
        let _ = gui_config::save(&self.app.config_path, "zoom", toml_edit::value(value));
        self.app.message = format!("Zoom {}%", (value * 100.0).round());
        self.app.focus = true;
        self.changed();
    }
}

impl ApplicationHandler<UserEvent> for Shell {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let gui = &self.app.gui;
        let mut attributes = Window::default_attributes()
            .with_title("filex")
            .with_inner_size(LogicalSize::new(gui.width, gui.height))
            .with_fullscreen(gui.fullscreen.then_some(Fullscreen::Borderless(None)))
            .with_min_inner_size(LogicalSize::new(560.0, 360.0))
            .with_decorations(gui.decorations == "system");
        attributes = winit::platform::wayland::WindowAttributesExtWayland::with_name(
            attributes,
            "filex-gui",
            "filex-gui",
        );
        attributes = winit::platform::x11::WindowAttributesExtX11::with_name(
            attributes,
            "filex-gui",
            "filex-gui",
        );
        let window = match event_loop.create_window(attributes) {
            Ok(window) => Rc::new(window),
            Err(error) => {
                eprintln!("filex-gui: cannot create window: {error}");
                return event_loop.exit();
            }
        };
        self.dark = match gui.theme.as_str() {
            "dark" => true,
            "light" => false,
            _ => window
                .theme()
                .map(|t| t == winit::window::Theme::Dark)
                .or_else(gui_config::desktop_prefers_dark)
                .unwrap_or(true),
        };
        let context = softbuffer::Context::new(window.clone()).expect("display connection");
        let surface = softbuffer::Surface::new(&context, window.clone()).expect("window surface");
        window.set_ime_allowed(false);
        self.window = Some(window);
        self.context = Some(context);
        self.surface = Some(surface);
        self.dnd = self.window.as_deref().and_then(dnd::Dnd::new);
        if env::var_os("FILEX_GUI_TRACE").is_some() {
            eprintln!(
                "drag source: {}",
                if self.dnd.is_some() {
                    "ready"
                } else {
                    "unavailable"
                }
            );
        }
        // Development aid: replay space-separated key names ("space" = Space).
        if let Ok(script) = env::var("FILEX_GUI_KEYS") {
            for key in script.split(' ').filter(|k| !k.is_empty()) {
                let key = match key {
                    "space" => " ",
                    "ctrl+f" => "\x06",
                    other => other,
                };
                self.app.handle_key(key);
                self.vs.dirty = true;
            }
        }
        self.changed();
    }
    fn user_event(&mut self, _: &ActiveEventLoop, event: UserEvent) {
        match event {
            UserEvent::Message(message) => self.app.message = message,
            UserEvent::PreviewReady(generation, result) => {
                self.app.preview.busy = false;
                if self.app.preview.generation == generation {
                    match result {
                        Ok(p) => {
                            self.app.preview.image = Some(p.image);
                            self.app.preview.pages = p.pages;
                        }
                        Err(e) => self.app.preview.error = e,
                    }
                }
            }
            UserEvent::TerminalOutput(id, bytes) => {
                if let Some(terminal) = &mut self.app.terminal_page
                    && terminal.id == id
                {
                    terminal.process(&bytes);
                }
            }
            UserEvent::TerminalEnded(id) => {
                if let Some(terminal) = &mut self.app.terminal_page
                    && terminal.id == id
                {
                    terminal.exited = true;
                }
            }
        }
        self.changed();
    }
    fn window_event(&mut self, event_loop: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::RedrawRequested => self.render(),
            WindowEvent::Resized(_) => self.redraw(),
            WindowEvent::ScaleFactorChanged { .. } => self.changed(),
            WindowEvent::ThemeChanged(theme) if self.app.gui.theme == "auto" => {
                self.dark = theme == winit::window::Theme::Dark;
                self.changed();
            }
            WindowEvent::ModifiersChanged(mods) => self.mods = mods.state(),
            WindowEvent::KeyboardInput { event, .. } if event.state == ElementState::Pressed => {
                use winit::keyboard::{Key, NamedKey};
                if event.logical_key == Key::Named(NamedKey::F11) {
                    if let Some(w) = &self.window {
                        w.set_fullscreen(if w.fullscreen().is_some() {
                            None
                        } else {
                            Some(Fullscreen::Borderless(None))
                        });
                    }
                    return;
                }
                if self.mods.control_key()
                    && self.mods.shift_key()
                    && event.logical_key == Key::Named(NamedKey::Tab)
                {
                    if self.app.terminal_page.is_some() {
                        self.app.terminal_visible = !self.app.terminal_visible;
                        self.changed();
                    }
                    return;
                }
                let text = event.text.as_ref().map(|t| t.as_str());
                if self.app.terminal_visible {
                    if let Some(t) = &mut self.app.terminal_page {
                        let bytes = terminal::key_bytes(
                            &event.logical_key,
                            text,
                            self.mods,
                            t.parser.screen().application_cursor(),
                        );
                        t.write(&bytes);
                    }
                    return;
                }
                let prompt = matches!(self.app.modal, Some(Modal::Prompt { .. }));
                if prompt
                    && !self.mods.control_key()
                    && let Some(t) = text
                    && t.chars().count() > 1
                {
                    self.app.ime_commit(t);
                    return self.changed();
                }
                match keys::translate(&event.logical_key, text, self.mods) {
                    Some(keys::Input::Key(key)) => {
                        self.app.info_path = None;
                        self.app.handle_key(&key);
                        if self.app.quit {
                            return event_loop.exit();
                        }
                        self.changed();
                    }
                    Some(keys::Input::Zoom(step)) => self.zoom(step),
                    Some(keys::Input::Theme) => self.toggle_theme(),
                    None => {}
                }
            }
            WindowEvent::Ime(Ime::Commit(text)) => {
                if self.app.terminal_visible {
                    if let Some(t) = &mut self.app.terminal_page {
                        t.write(text.as_bytes());
                    }
                } else {
                    self.app.ime_commit(&text);
                }
                self.changed();
            }
            WindowEvent::Ime(Ime::Preedit(text, _)) => {
                self.app.ime_preedit(&text);
                self.changed();
            }
            WindowEvent::CursorMoved { position, .. } => {
                self.cursor = (position.x as f32, position.y as f32);
                self.drag();
                self.hover();
            }
            WindowEvent::CursorLeft { .. } => {
                self.cursor = (-1.0, -1.0);
                self.hover();
            }
            WindowEvent::MouseInput {
                state: ElementState::Pressed,
                button,
                ..
            } => {
                if let Some(dnd) = &mut self.dnd {
                    dnd.pump();
                }
                self.click(event_loop, button);
                self.press = (button == MouseButton::Left && self.hits.modal.is_none())
                    .then(|| {
                        self.hits
                            .nodes
                            .iter()
                            .find(|(r, _)| r.contains(self.cursor.0, self.cursor.1))
                    })
                    .flatten()
                    .map(|(_, node)| (self.cursor.0, self.cursor.1, node.clone()));
            }
            WindowEvent::MouseInput {
                state: ElementState::Released,
                ..
            } => self.press = None,
            WindowEvent::DroppedFile(path) if self.dnd.is_none() => {
                let result = self
                    .drop_target(self.cursor.0, self.cursor.1)
                    .ok_or("Drop onto a folder or a breadcrumb".to_string())
                    .and_then(|target| self.app.drop_paths(vec![path], &target, false));
                if let Err(e) = result {
                    self.app.message = format!("Drop failed: {e}");
                }
                self.changed();
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let line = 3.0 * 29.0 * self.scale();
                match delta {
                    MouseScrollDelta::LineDelta(x, y) => self.scroll(x * line, y * line),
                    MouseScrollDelta::PixelDelta(p) => self.scroll(p.x as f32, p.y as f32),
                }
            }
            _ => {}
        }
    }
    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if self.app.quit {
            return event_loop.exit();
        }
        self.receive_drops();
        self.app.pump_preview();
        if self
            .app
            .terminal_page
            .as_mut()
            .is_some_and(|t| t.finished())
        {
            self.app.terminal_page = None;
            self.app.terminal_visible = false;
            self.app.refresh_panes();
            self.app.message = "Terminal closed".into();
            self.changed();
        }
        if git_status::ready() {
            self.changed();
        }
        if self.animating {
            self.redraw();
            event_loop.set_control_flow(ControlFlow::Wait);
        } else if self.dnd.as_ref().is_some_and(|d| d.active()) {
            event_loop.set_control_flow(ControlFlow::WaitUntil(
                Instant::now() + Duration::from_millis(16),
            ));
        } else if self.app.preview.path.is_some()
            && !self.app.preview.busy
            && self.app.preview.image.is_none()
            && self.app.preview.error.is_empty()
            && self.app.dashboard
        {
            event_loop.set_control_flow(ControlFlow::WaitUntil(
                Instant::now() + Duration::from_millis(50),
            ));
        } else if self.app.terminal_page.is_some() {
            event_loop.set_control_flow(ControlFlow::WaitUntil(
                Instant::now() + Duration::from_millis(100),
            ));
        } else if let Some(until) = self.app.git_poll_until
            && until > Instant::now()
        {
            // Background Git snapshots report through a flag; check briefly.
            event_loop.set_control_flow(ControlFlow::WaitUntil(
                Instant::now() + Duration::from_millis(200),
            ));
        } else {
            self.app.git_poll_until = None;
            event_loop.set_control_flow(ControlFlow::Wait);
        }
    }
}
