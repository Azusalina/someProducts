//! Interaction state: a non-blocking port of fileX's TUI `Ui`. Every key the
//! TUI understands is dispatched the same way; the TUI's blocking prompt /
//! choose / confirm / pager loops become modals with continuations.
use crate::{
    config::Config,
    edit::Edit,
    files,
    git_actions::{self, Action},
    gui_config::GuiConfig,
    launch,
    model::{Browser, NodeRef, clean},
    terminal_profile::label,
};
use std::{
    collections::BTreeSet,
    ffi::OsString,
    os::unix::ffi::OsStrExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    rc::Rc,
    time::{Duration, Instant},
};
use winit::event_loop::EventLoopProxy;

pub enum UserEvent {
    Message(String),
    TerminalOutput(u64, Vec<u8>),
    TerminalEnded(u64),
    PreviewReady(u64, Result<crate::preview::Preview, String>),
}

pub struct Pending {
    pub sources: Vec<PathBuf>,
    pub moving: bool,
}

pub enum PromptKind {
    NewFile,
    NewFolder,
    Rename,
    Destination,
    TransferPath,
    Foreground,
    Background,
    Goto,
    Search,
    GitMessage {
        root: PathBuf,
        selected: PathBuf,
        action: usize,
    },
}

pub enum ChooseKind {
    OpenWith,
    Hidden(Vec<PathBuf>),
    Git { root: PathBuf, selected: PathBuf },
}

pub enum ConfirmKind {
    Trash(PathBuf),
    TrashMany(Vec<PathBuf>),
    Replace {
        plan: Vec<(PathBuf, PathBuf)>,
        replacements: Vec<bool>,
        next: usize,
        directory: PathBuf,
    },
    Git {
        commands: Vec<Command>,
        root: PathBuf,
    },
}

pub struct Choice {
    pub id: Option<String>,
    pub label: String,
    pub note: String,
    pub off: bool,
}

pub enum Modal {
    Prompt {
        title: String,
        edit: Edit,
        kind: PromptKind,
        preedit: String,
    },
    Choose {
        title: String,
        options: Vec<Choice>,
        selected: usize,
        kind: ChooseKind,
    },
    Pager {
        title: String,
        rows: Vec<String>,
        top: usize,
        left: usize,
    },
    Confirm {
        title: String,
        kind: ConfirmKind,
    },
    Reorder {
        directory: PathBuf,
        names: Vec<String>,
        cursor: usize,
    },
    Help {
        rows: Vec<(String, String)>,
        top: usize,
    },
}

#[derive(Default)]
pub struct Dash {
    pub name: String,
    pub kind: String,
    pub rows: Vec<(String, String)>,
    pub extra: Vec<String>,
    pub preview: Vec<String>,
}

pub struct App {
    pub browser: Browser,
    pub left: f32,
    pub top: f32,
    pub focus: bool,
    pub query: String,
    pub link_target: Option<PathBuf>,
    pub clipboard: String,
    pub marked: BTreeSet<PathBuf>,
    pub pending: Option<Pending>,
    node_budget: usize,
    pub config_path: PathBuf,
    pub dashboard: bool,
    pub terminal_page: Option<crate::terminal::Terminal>,
    pub terminal_visible: bool,
    pub meta_path: Option<PathBuf>,
    pub meta: Dash,
    pub info_path: Option<PathBuf>,
    pub preview: crate::preview::State,
    pub message: String,
    pub exit_directory: Option<PathBuf>,
    pub modal: Option<Modal>,
    pub gui: GuiConfig,
    pub proxy: Option<EventLoopProxy<UserEvent>>,
    /// Filled by the view each frame: rows that fit, and one column in pixels.
    pub view_rows: usize,
    pub column: f32,
    pub window_columns: usize,
    pub git_poll_until: Option<Instant>,
    pub quit: bool,
}

fn ioerr(e: impl std::fmt::Display) -> String {
    e.to_string()
}

impl App {
    pub fn new(browser: Browser, config_path: PathBuf, gui: GuiConfig) -> Self {
        let budget = browser.conf.max_loaded;
        Self {
            browser,
            left: 0.0,
            top: 0.0,
            focus: true,
            query: String::new(),
            link_target: None,
            clipboard: String::new(),
            marked: Default::default(),
            pending: None,
            node_budget: budget,
            config_path,
            dashboard: true,
            terminal_page: None,
            terminal_visible: false,
            meta_path: None,
            meta: Dash::default(),
            info_path: None,
            preview: Default::default(),
            message: String::new(),
            exit_directory: None,
            modal: None,
            gui,
            proxy: None,
            view_rows: 20,
            column: 8.0,
            window_columns: 160,
            git_poll_until: None,
            quit: false,
        }
    }

    // ---- shared helpers (ported) ------------------------------------------------
    pub fn selection_path(&self) -> PathBuf {
        self.link_target
            .clone()
            .unwrap_or_else(|| self.browser.selected.borrow().path.clone())
    }
    fn sources(&self) -> Result<Vec<PathBuf>, String> {
        if self.link_target.is_some() {
            return Err("Select the link itself before operating".into());
        }
        let mut paths: Vec<PathBuf> = if self.marked.is_empty() {
            vec![self.selection_path()]
        } else {
            self.marked.iter().cloned().collect()
        };
        paths.sort_by_key(|p| p.components().count());
        let mut sources: Vec<PathBuf> = Vec::new();
        for path in paths {
            std::fs::symlink_metadata(&path).map_err(ioerr)?;
            if !sources.iter().any(|parent| path.starts_with(parent)) {
                sources.push(path);
            }
        }
        Ok(sources)
    }
    fn protected_root(&self, path: &Path) -> bool {
        self.browser.root.borrow().path == path
    }
    pub fn refresh_panes(&mut self) {
        self.preview.invalidate();
        self.info_path = None;
        self.browser.refresh();
        self.link_target = None;
        self.meta_path = None;
        self.poll_git();
    }
    fn poll_git(&mut self) {
        if self.browser.conf.git_enabled {
            self.git_poll_until = Some(Instant::now() + Duration::from_secs(8));
        }
    }
    fn rebudget(&mut self) {
        self.browser.conf.max_loaded = self.node_budget;
    }
    fn reload_preferences(&mut self) -> Result<(), String> {
        let grouped = self.browser.conf.grouped;
        let dotfiles = self.browser.conf.hidden;
        let mut conf = Config::load(&self.config_path)?;
        conf.grouped = grouped;
        conf.hidden = dotfiles;
        self.node_budget = conf.max_loaded;
        self.browser.conf = conf;
        Ok(())
    }
    fn prompt(&mut self, title: &str, initial: &str, kind: PromptKind) {
        self.modal = Some(Modal::Prompt {
            title: title.into(),
            edit: Edit::new(initial),
            kind,
            preedit: String::new(),
        });
    }
    fn confirm(&mut self, title: String, kind: ConfirmKind) {
        self.modal = Some(Modal::Confirm { title, kind });
    }
    fn pager(&mut self, title: &str, content: &str) {
        self.modal = Some(Modal::Pager {
            title: title.into(),
            rows: content.lines().map(str::to_owned).collect(),
            top: 0,
            left: 0,
        });
    }
    /// Per frame: Git snapshots, transient `+` entries and mark flags.
    pub fn prepare(&mut self) {
        self.browser.update_git();
        if self.pending.is_some() && !self.browser.destination_mode {
            self.browser.set_destination_mode(true);
        }
        for node in self.browser.visible() {
            let marked = self.marked.contains(&node.borrow().path) && !node.borrow().create_entry;
            node.borrow_mut().marked = marked;
        }
    }

    // ---- copy / move -------------------------------------------------------------
    /// Drops use exactly the keyboard transfer planner and replacement prompts.
    pub fn drop_paths(
        &mut self,
        mut sources: Vec<PathBuf>,
        directory: &Path,
        moving: bool,
    ) -> Result<(), String> {
        if self.modal.is_some() || self.pending.is_some() || self.terminal_visible {
            return Err("Finish or cancel the current operation before dropping files".into());
        }
        if sources.is_empty() {
            return Err("No local files in drop".into());
        }
        sources.sort_by_key(|p| p.components().count());
        let mut unique = Vec::<PathBuf>::new();
        for path in sources {
            std::fs::symlink_metadata(&path).map_err(ioerr)?;
            if moving && self.protected_root(&path) {
                return Err("Cannot move the displayed root".into());
            }
            if !unique.iter().any(|p| path.starts_with(p)) {
                unique.push(path);
            }
        }
        let total = unique.len();
        self.pending = Some(Pending {
            sources: unique,
            moving,
        });
        let result = self.transfer_to(directory);
        if result.is_err() && self.pending.as_ref().is_some_and(|p| p.sources.len() == total) {
            self.cancel_transfer();
        }
        result
    }
    fn start_terminal(
        &mut self,
        cwd: &Path,
        script: &std::ffi::OsStr,
        pause: bool,
        title: String,
    ) -> Result<(), String> {
        if self.terminal_page.is_some() {
            self.terminal_visible = true;
            return Err("A terminal is already running; exit it before starting another".into());
        }
        let proxy = self.proxy.clone().ok_or("Window event loop is not ready")?;
        self.terminal_page = Some(crate::terminal::Terminal::spawn(
            cwd, script, pause, title, proxy,
        )?);
        self.terminal_visible = true;
        self.message = "Terminal · Ctrl+Shift+Tab switches to the tree".into();
        Ok(())
    }
    fn begin_transfer(&mut self, moving: bool) -> Result<(), String> {
        let sources = self.sources()?;
        if moving && sources.iter().any(|p| self.protected_root(p)) {
            return Err("Cannot move the displayed root; first navigate to its parent".into());
        }
        self.pending = Some(Pending { sources, moving });
        self.browser.set_destination_mode(true);
        Ok(())
    }
    fn cancel_transfer(&mut self) {
        self.pending = None;
        self.browser.set_destination_mode(false);
        self.meta_path = None;
    }
    fn create_destination(&mut self, name: &str) -> Result<(), String> {
        let directory = self.browser.target();
        let created = files::create(&directory, name, true)?;
        let parent = self
            .browser
            .visible()
            .into_iter()
            .find(|n| n.borrow().path == directory && !n.borrow().create_entry);
        if let Some(parent) = parent {
            self.browser.expand(&parent, Some(&created));
        }
        if let Some(node) = self
            .browser
            .visible()
            .into_iter()
            .find(|n| n.borrow().path == created)
        {
            self.browser.selected = node;
        }
        self.meta_path = None;
        Ok(())
    }
    fn transfer_path(&mut self, value: &str) -> Result<(), String> {
        if value.is_empty() {
            return Ok(());
        }
        let source = self
            .pending
            .as_ref()
            .ok_or("No pending operation")?
            .sources
            .first()
            .ok_or("No pending items")?;
        let target = files::destination(source, value);
        self.transfer_to(&target)
    }
    fn transfer_to(&mut self, directory: &Path) -> Result<(), String> {
        let pending = self.pending.as_ref().ok_or("No pending operation")?;
        let plan = crate::transfer::plan_to(&pending.sources, directory)?;
        let replacements: Vec<bool> = plan
            .iter()
            .map(|(source, dest)| crate::transfer::validate_target(source, dest))
            .collect::<Result<_, _>>()?;
        self.confirm_replacements(plan, replacements, 0, directory.to_path_buf())
    }
    fn confirm_replacements(
        &mut self,
        plan: Vec<(PathBuf, PathBuf)>,
        replacements: Vec<bool>,
        start: usize,
        directory: PathBuf,
    ) -> Result<(), String> {
        if let Some(i) = (start..plan.len()).find(|&i| replacements[i]) {
            let title = format!("Replace {}", clean(&plan[i].1.to_string_lossy()));
            self.confirm(
                title,
                ConfirmKind::Replace {
                    plan,
                    replacements,
                    next: i + 1,
                    directory,
                },
            );
            return Ok(());
        }
        self.execute_transfer(plan, replacements, &directory)
    }
    fn execute_transfer(
        &mut self,
        plan: Vec<(PathBuf, PathBuf)>,
        replacements: Vec<bool>,
        directory: &Path,
    ) -> Result<(), String> {
        let moving = self.pending.as_ref().ok_or("No pending operation")?.moving;
        let total = plan.len();
        for (index, ((source, destination), replace)) in
            plan.into_iter().zip(replacements).enumerate()
        {
            if let Err(error) = crate::transfer::execute(&source, &destination, moving, replace) {
                self.refresh_panes();
                return Err(format!(
                    "Completed {index}/{total}; remaining items kept pending: {error}"
                ));
            }
            self.marked.retain(|p| !p.starts_with(&source));
            if let Some(pending) = self.pending.as_mut() {
                pending.sources.retain(|p| p != &source);
            }
        }
        self.cancel_transfer();
        self.refresh_panes();
        let selected = self.browser.selected.clone();
        self.browser.expand(&selected, None);
        self.message = format!(
            "{} {total} items to {}",
            if moving { "Moved" } else { "Copied" },
            directory.display()
        );
        Ok(())
    }

    // ---- preferences -------------------------------------------------------------
    fn toggle_grouped(&mut self) {
        self.browser.conf.grouped = !self.browser.conf.grouped;
        self.focus = true;
        self.left = 0.0;
        self.top = 0.0;
        self.message = if self.browser.conf.grouped {
            "Grouped tree: folders / direct files"
        } else {
            "Classic horizontal tree"
        }
        .into();
    }
    fn reorder(&mut self) -> Result<(), String> {
        let selected = self.browser.selected.clone();
        let folder = selected
            .borrow()
            .parent
            .upgrade()
            .unwrap_or_else(|| selected.clone());
        self.browser.expand(&folder, None);
        let directory = folder.borrow().path.clone();
        let names = folder
            .borrow()
            .children
            .iter()
            .filter(|n| !n.borrow().create_entry)
            .map(|n| {
                n.borrow()
                    .path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(str::to_owned)
                    .ok_or_else(|| "Cannot save a non-UTF8 filename in TOML".to_string())
            })
            .collect::<Result<Vec<_>, String>>()?;
        if names.is_empty() {
            return Err("No visible children to reorder".into());
        }
        let cursor = names
            .iter()
            .position(|n| {
                selected
                    .borrow()
                    .path
                    .file_name()
                    .is_some_and(|s| s == n.as_str())
            })
            .unwrap_or(0);
        self.modal = Some(Modal::Reorder {
            directory,
            names,
            cursor,
        });
        Ok(())
    }
    fn hide_item(&mut self) -> Result<(), String> {
        let selected = self.browser.selected.clone();
        let Some(parent) = selected.borrow().parent.upgrade() else {
            return Err("Select an item below the root to hide".into());
        };
        if selected.borrow().create_entry {
            return Ok(());
        }
        let path = selected.borrow().path.clone();
        let mut paths = self.browser.conf.excluded_paths.clone();
        if !paths.contains(&path) {
            paths.push(path.clone());
        }
        crate::ordering::save_hidden(&self.config_path, &paths)?;
        self.reload_preferences()?;
        self.browser.selected = parent;
        self.marked.retain(|p| !p.starts_with(&path));
        self.refresh_panes();
        self.message = "Hidden in filex; Z manages/restores excluded items".into();
        Ok(())
    }
    fn hidden_items(&mut self) {
        let paths = self.browser.conf.excluded_paths.clone();
        if paths.is_empty() {
            self.message = "No filex exclusions saved".into();
            return;
        }
        let options = paths
            .iter()
            .map(|p| Choice {
                id: None,
                label: clean(&p.to_string_lossy()),
                note: String::new(),
                off: false,
            })
            .collect();
        self.modal = Some(Modal::Choose {
            title: label("隐藏项目", "Hidden").into(),
            options,
            selected: 0,
            kind: ChooseKind::Hidden(paths),
        });
    }

    // ---- external programs -------------------------------------------------------
    fn run_foreground(&mut self, text: &str) -> Result<(), String> {
        let directory = self.selection_path();
        if text.trim().is_empty() {
            return Ok(());
        }
        let command = crate::jobs::foreground_command(&directory, text)?;
        let mut script = OsString::from("printf '%s\\n> %s\\n\\n' ");
        script.push(launch::quote(directory.as_os_str()));
        script.push(" ");
        script.push(launch::quote(std::ffi::OsStr::new(&clean(text))));
        script.push("\n");
        script.push(launch::command_line(&command));
        self.start_terminal(&directory, &script, true, clean(text))?;
        Ok(())
    }
    fn git_menu(&mut self) -> Result<(), String> {
        let selected = self.selection_path();
        let root = git_actions::repository(&selected)?;
        let options = [
            "Add ALL + commit + push",
            "Add selected file/folder",
            "Commit staged changes",
            "Push",
        ]
        .into_iter()
        .map(|name| Choice {
            id: None,
            label: name.into(),
            note: String::new(),
            off: false,
        })
        .collect();
        self.modal = Some(Modal::Choose {
            title: format!("Git  {}", clean(&root.to_string_lossy())),
            options,
            selected: 0,
            kind: ChooseKind::Git { root, selected },
        });
        Ok(())
    }
    fn git_confirm(
        &mut self,
        root: PathBuf,
        selected: PathBuf,
        action: usize,
        message: &str,
    ) -> Result<(), String> {
        let action = git_action(action);
        let commands = git_actions::commands(&root, &selected, action, message)?;
        let title = format!(
            "{}  {}",
            action.description(),
            clean(&root.to_string_lossy())
        );
        self.confirm(title, ConfirmKind::Git { commands, root });
        Ok(())
    }
    fn git_run(&mut self, commands: Vec<Command>, root: &Path) -> Result<(), String> {
        let mut script = OsString::new();
        for command in &commands {
            let line = launch::command_line(command);
            script.push("printf '> %s\\n' ");
            script.push(launch::quote(&line));
            script.push("\n");
            script.push(&line);
            script.push(
                " || { s=$?; printf '\\nGit stopped (%s); completed steps are kept\\n' \"$s\"; exit \"$s\"; }\n",
            );
        }
        script.push("printf '\\nGit operation completed\\n'");
        self.start_terminal(root, &script, true, "Git".into())?;
        Ok(())
    }
    fn open(&mut self, method: &str) -> Result<(), String> {
        let path = self.selection_path();
        if method == "@preview" {
            let text = files::preview(&path, self.browser.conf.preview_bytes);
            self.pager(label("文件预览", "Preview"), &text);
            return Ok(());
        }
        let opener = self
            .browser
            .conf
            .openers
            .get(method)
            .ok_or("Opener not defined")?
            .clone();
        if opener.copy_path {
            self.clipboard = std::path::absolute(&path)
                .map_err(ioerr)?
                .to_string_lossy()
                .into_owned();
        }
        let (mut command, terminal) = files::open_command(&path, &self.browser.conf, method)?;
        if terminal {
            let cwd = command
                .get_current_dir()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| path.parent().unwrap_or(Path::new("/")).to_path_buf());
            let script = launch::command_line(&command);
            self.start_terminal(&cwd, &script, opener.pause_on_exit, opener.label.clone())?;
        } else if command
            .get_args()
            .any(|arg| arg.as_bytes().ends_with(b"/scripts/open_markdown.mjs"))
        {
            let proxy = self.proxy.clone();
            std::thread::spawn(move || {
                let message = match files::start_markdown(&mut command) {
                    Ok(url) => format!("Markdown preview ready: {url}"),
                    Err(error) => format!("Operation failed: {}", clean(&error)),
                };
                if let Some(proxy) = proxy {
                    let _ = proxy.send_event(UserEvent::Message(message));
                }
            });
            self.message = "Starting Markdown preview...".into();
            self.meta_path = None;
            return Ok(());
        } else {
            command.stdin(Stdio::null()).spawn().map_err(ioerr)?;
        }
        self.meta_path = None;
        self.message = ui_format!("已用 {} 打开", "Opened with {}", opener.label);
        Ok(())
    }
    fn choose_open(&mut self) -> Result<(), String> {
        let node = self.browser.selected.clone();
        let path = self.selection_path();
        let dir = if self.link_target.is_some() {
            path.is_dir()
        } else {
            node.borrow().dir
        };
        let conf = &self.browser.conf;
        let mut default = conf
            .rule(&path, &conf.defaults, dir)
            .cloned()
            .unwrap_or("system".into());
        if !conf
            .openers
            .get(&default)
            .is_some_and(|o| o.supports(&path))
        {
            default = "system".into();
        }
        if !conf
            .openers
            .get(&default)
            .is_some_and(|o| o.supports(&path))
        {
            default = "@preview".into();
        }
        let mut ids = vec![default.clone()];
        ids.extend(
            conf.openers
                .keys()
                .filter(|id| **id != default && conf.openers[*id].supports(&path))
                .cloned(),
        );
        let mut options: Vec<Choice> = ids
            .iter()
            .map(|id| {
                if id == "@preview" {
                    return Choice {
                        id: Some(id.clone()),
                        label: "Preview".into(),
                        note: "default".into(),
                        off: false,
                    };
                }
                let opener = &conf.openers[id];
                let installed = files::available(&opener.command[0]);
                Choice {
                    id: Some(id.clone()),
                    label: opener.label.clone(),
                    note: if id == &default {
                        "default".into()
                    } else if !installed {
                        "not installed".into()
                    } else if opener.terminal {
                        "terminal".into()
                    } else {
                        String::new()
                    },
                    off: !installed,
                }
            })
            .collect();
        if dir && self.link_target.is_none() {
            options.insert(
                0,
                Choice {
                    id: None,
                    label: label("展开 / 收起目录", "Expand / collapse").into(),
                    note: String::new(),
                    off: false,
                },
            );
        }
        self.modal = Some(Modal::Choose {
            title: clean(&path.to_string_lossy()),
            options,
            selected: 0,
            kind: ChooseKind::OpenWith,
        });
        Ok(())
    }

    // ---- create / rename / trash -------------------------------------------------
    fn operation(&mut self, action: &str) -> Result<(), String> {
        if matches!(action, "copy" | "move") {
            return self.begin_transfer(action == "move");
        }
        if action == "trash" && !self.marked.is_empty() {
            let sources = self.sources()?;
            if sources.iter().any(|p| self.protected_root(p)) {
                return Err("Cannot trash the displayed root".into());
            }
            let title = format!("Trash {} selected items", sources.len());
            self.confirm(title, ConfirmKind::TrashMany(sources));
            return Ok(());
        }
        if self.link_target.is_some() {
            return Err(ui_format!(
                "请按 {} 选回链接，或按 f 进入目标目录后操作文件",
                "{} returns to link; f enters target folder for file operations",
                "←"
            ));
        }
        let source = self.browser.selected.borrow().path.clone();
        if Rc::ptr_eq(&self.browser.selected, &self.browser.root)
            && ["rename", "move", "trash"].contains(&action)
        {
            return Err(ui_format!(
                "不能操作当前根目录；先按 {} 引入其父目录",
                "Cannot modify root; use {} to introduce its parent",
                "←"
            ));
        }
        match action {
            "trash" => {
                let title = ui_format!(
                    "送入回收站 {}",
                    "Trash {}",
                    clean(&source.to_string_lossy())
                );
                self.confirm(title, ConfirmKind::Trash(source));
            }
            "new_file" => self.prompt(label("新文件", "New file"), "", PromptKind::NewFile),
            "new_folder" => self.prompt(label("新目录", "New folder"), "", PromptKind::NewFolder),
            "rename" => {
                let initial = source
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                self.prompt(label("重命名", "Rename"), &initial, PromptKind::Rename)
            }
            _ => {}
        }
        Ok(())
    }
    fn finish_operation(&mut self, action: &str, value: &str) -> Result<(), String> {
        if value.is_empty() {
            return Ok(());
        }
        let source = self.browser.selected.borrow().path.clone();
        let dest = match action {
            "new_file" | "new_folder" => {
                let target = self.browser.target();
                let path = files::create(&target, value, action == "new_folder")?;
                let parent = if self.browser.selected.borrow().dir {
                    self.browser.selected.clone()
                } else {
                    self.browser
                        .selected
                        .borrow()
                        .parent
                        .upgrade()
                        .unwrap_or_else(|| self.browser.root.clone())
                };
                self.browser.expand(&parent, Some(&path));
                path
            }
            "rename" => {
                files::name_valid(value)?;
                let dest = source.parent().ok_or("No parent")?.join(value);
                files::rename(&source, &dest)?;
                dest
            }
            _ => return Ok(()),
        };
        self.finished(dest);
        Ok(())
    }
    fn finished(&mut self, dest: PathBuf) {
        self.browser.refresh();
        self.poll_git();
        if let Some(node) = self
            .browser
            .visible()
            .into_iter()
            .find(|n| n.borrow().path == dest)
        {
            self.browser.selected = node
        }
        self.meta_path = None;
        self.message = ui_format!("完成: {}", "Done: {}", dest.display());
    }
    fn exit_search(&mut self) {
        self.query.clear();
        self.browser.results.clear();
        self.browser.search_key = None;
        self.link_target = None;
        self.meta_path = None;
        self.message = "Find mode closed; arrows navigate tree".into();
    }
    fn copy_path(&mut self) -> Result<(), String> {
        let path = self.selection_path();
        self.clipboard = std::path::absolute(&path)
            .map_err(ioerr)?
            .to_string_lossy()
            .into_owned();
        if crate::terminal_profile::get().desktop {
            files::copy_path(&path)?;
            self.message = label("已复制绝对路径", "Absolute path copied").into();
        } else {
            self.message = format!(
                "Path copied (Ctrl+V in prompts): {}",
                clean(&self.clipboard)
            );
        }
        Ok(())
    }
    fn help(&mut self) {
        let mut rows: Vec<(String, String)> = self
            .browser
            .conf
            .keys
            .iter()
            .map(|(action, key)| (key.clone(), action.replace('_', " ")))
            .collect();
        rows.sort_by(|a, b| a.1.cmp(&b.1));
        let fixed = [
            ("↑ ↓", "peers at the same depth"),
            ("← →", "parent / expand, child"),
            ("Enter", "expand folder / open file with"),
            ("Space", "mark"),
            ("Esc", "clear marks / leave mode"),
            ("Delete", "trash"),
            ("Shift+R", "rename"),
            ("Ctrl+N", "new file"),
            ("Ctrl+Shift+N", "new folder"),
            ("Ctrl+F  /", "search"),
            ("Ctrl+L", "go to"),
            ("F5  Ctrl+F5", "refresh"),
            ("H  L", "pan"),
            ("PgUp  PgDn", "page peers"),
            ("Home  End", "first / last node"),
            ("y", "copy path"),
            ("+", "place here (copy / move)"),
            ("t", "type destination (copy / move)"),
            ("Ctrl+V  Ctrl+U", "paste / clear input"),
            ("Ctrl+=  Ctrl+-  Ctrl+0", "zoom"),
            ("F12", "light / dark"),
        ];
        rows.splice(
            0..0,
            fixed.iter().map(|(k, a)| (k.to_string(), a.to_string())),
        );
        self.modal = Some(Modal::Help { rows, top: 0 });
    }
    fn toolkit(&mut self) -> Result<(), String> {
        let path = self.selection_path();
        if !path.is_file() {
            return Err("Toolkit: select a local file first".into());
        }
        let root = crate::config::product_root();
        let launcher = std::env::var_os("FILEX_TOOLKIT_DESKTOP")
            .map(PathBuf::from)
            .unwrap_or_else(|| root.join("../integrate-toolkit-arch/toolkit-desktop"));
        let mut child = Command::new(&launcher)
            .arg("--list")
            .arg("--")
            .arg(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Toolkit: {}: {e}", launcher.display()))?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        self.message = "Toolkit: choose a method, then the result path and filename".into();
        Ok(())
    }

    // ---- input -------------------------------------------------------------------
    /// The TUI main loop body: focus follows the cursor, messages clear, errors report.
    pub fn handle_key(&mut self, key: &str) {
        self.info_path = None;
        self.focus = true;
        if !["H", "L"].contains(&key) {
            self.message.clear()
        }
        let result = if let Some(modal) = self.modal.take() {
            self.modal_key(modal, key)
        } else {
            self.action(key)
        };
        if let Err(e) = result {
            self.message = ui_format!("操作失败: {}", "Operation failed: {}", clean(&e));
        }
        self.poll_git();
    }
    pub fn handle_action(&mut self, action: &str) {
        self.focus = true;
        self.message.clear();
        if let Err(e) = self.dispatch(action, "") {
            self.message = ui_format!("操作失败: {}", "Operation failed: {}", clean(&e));
        }
    }
    pub fn ime_commit(&mut self, text: &str) {
        if let Some(Modal::Prompt { edit, preedit, .. }) = &mut self.modal {
            preedit.clear();
            let text: String = text.chars().filter(|c| !c.is_control()).collect();
            edit.text.insert_str(edit.cursor, &text);
            edit.cursor += text.len();
        }
    }
    pub fn ime_preedit(&mut self, text: &str) {
        if let Some(Modal::Prompt { preedit, .. }) = &mut self.modal {
            *preedit = text.into();
        }
    }
    pub fn select(&mut self, node: &NodeRef) {
        self.info_path = None;
        self.browser.selected = node.clone();
        self.link_target = None;
        self.meta_path = None;
        self.focus = true;
    }
    fn paste_source(&self) -> String {
        if !self.clipboard.is_empty() {
            return self.clipboard.clone();
        }
        Command::new("wl-paste")
            .args(["--no-newline", "--type", "text"])
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_owned()
            })
            .unwrap_or_default()
    }
    fn modal_key(&mut self, modal: Modal, key: &str) -> Result<(), String> {
        match modal {
            Modal::Prompt {
                title,
                mut edit,
                kind,
                preedit,
            } => match key {
                "enter" => self.submit(kind, edit.text),
                "escape" | "\x03" => {
                    if matches!(kind, PromptKind::Search) {
                        self.exit_search();
                    }
                    Ok(())
                }
                _ => {
                    let clip = if key == "\x16" {
                        self.paste_source()
                    } else {
                        String::new()
                    };
                    edit.key(key, &clip);
                    self.modal = Some(Modal::Prompt {
                        title,
                        edit,
                        kind,
                        preedit,
                    });
                    Ok(())
                }
            },
            Modal::Choose {
                title,
                options,
                mut selected,
                kind,
            } => {
                match key {
                    "escape" | "\x03" => return Ok(()),
                    "enter" => return self.chosen(kind, &options, selected),
                    "down" | "j" => selected = (selected + 1) % options.len(),
                    "up" | "k" => selected = (selected + options.len() - 1) % options.len(),
                    _ => {}
                }
                self.modal = Some(Modal::Choose {
                    title,
                    options,
                    selected,
                    kind,
                });
                Ok(())
            }
            Modal::Pager {
                title,
                rows,
                mut top,
                mut left,
            } => {
                let body = self.view_rows.saturating_sub(4).max(1);
                match key {
                    "escape" | "q" | "enter" | "\x03" => return Ok(()),
                    "down" | "j" => top = (top + 1).min(rows.len().saturating_sub(body)),
                    "up" | "k" => top = top.saturating_sub(1),
                    "pagedown" | " " => top = (top + body).min(rows.len().saturating_sub(body)),
                    "pageup" => top = top.saturating_sub(body),
                    "home" => top = 0,
                    "end" => top = rows.len().saturating_sub(body),
                    "right" => left += 8,
                    "left" => left = left.saturating_sub(8),
                    _ => {}
                }
                self.modal = Some(Modal::Pager {
                    title,
                    rows,
                    top,
                    left,
                });
                Ok(())
            }
            Modal::Help { rows, mut top } => {
                let body = self.view_rows.saturating_sub(4).max(1);
                match key {
                    "escape" | "q" | "enter" | "\x03" | "?" => return Ok(()),
                    "down" | "j" => top = (top + 1).min(rows.len().saturating_sub(body)),
                    "up" | "k" => top = top.saturating_sub(1),
                    "pagedown" | " " => top = (top + body).min(rows.len().saturating_sub(body)),
                    "pageup" => top = top.saturating_sub(body),
                    _ => {}
                }
                self.modal = Some(Modal::Help { rows, top });
                Ok(())
            }
            Modal::Confirm { title, kind } => match key {
                "enter" => self.confirmed(kind),
                "escape" | "\x03" => {
                    if matches!(kind, ConfirmKind::Replace { .. }) {
                        self.message =
                            "Replacement cancelled; choose destination or press Esc".into();
                    }
                    Ok(())
                }
                _ => {
                    self.modal = Some(Modal::Confirm { title, kind });
                    Ok(())
                }
            },
            Modal::Reorder {
                directory,
                mut names,
                mut cursor,
            } => {
                match key {
                    "up" | "k" => cursor = cursor.saturating_sub(1),
                    "down" | "j" => cursor = (cursor + 1).min(names.len() - 1),
                    "K" if cursor > 0 => {
                        names.swap(cursor, cursor - 1);
                        cursor -= 1;
                    }
                    "J" if cursor + 1 < names.len() => {
                        names.swap(cursor, cursor + 1);
                        cursor += 1;
                    }
                    "escape" | "\x03" => return Ok(()),
                    "enter" => {
                        crate::ordering::save_sequence(&self.config_path, &directory, &names)?;
                        self.reload_preferences()?;
                        self.refresh_panes();
                        self.message = "Directory order saved to config".into();
                        return Ok(());
                    }
                    _ => {}
                }
                self.modal = Some(Modal::Reorder {
                    directory,
                    names,
                    cursor,
                });
                Ok(())
            }
        }
    }
    /// Pointer selection inside list modals.
    pub fn modal_pick(&mut self, index: usize, activate: bool) {
        match &mut self.modal {
            Some(Modal::Choose {
                selected, options, ..
            }) if index < options.len() => {
                *selected = index;
                if activate {
                    self.handle_key("enter");
                }
            }
            Some(Modal::Reorder { cursor, names, .. }) if index < names.len() => *cursor = index,
            _ => {}
        }
    }
    pub fn modal_scroll(&mut self, rows: isize) {
        let body = self.view_rows.saturating_sub(4).max(1);
        match &mut self.modal {
            Some(Modal::Pager {
                rows: lines, top, ..
            }) => {
                *top = (*top as isize + rows).clamp(0, lines.len().saturating_sub(body) as isize)
                    as usize
            }
            Some(Modal::Help { rows: lines, top }) => {
                *top = (*top as isize + rows).clamp(0, lines.len().saturating_sub(body) as isize)
                    as usize
            }
            _ => {}
        }
    }
    fn submit(&mut self, kind: PromptKind, value: String) -> Result<(), String> {
        match kind {
            PromptKind::NewFile => self.finish_operation("new_file", &value),
            PromptKind::NewFolder => self.finish_operation("new_folder", &value),
            PromptKind::Rename => self.finish_operation("rename", &value),
            PromptKind::Destination => {
                if value.is_empty() {
                    return Ok(());
                }
                self.create_destination(&value)
            }
            PromptKind::TransferPath => self.transfer_path(&value),
            PromptKind::Foreground => self.run_foreground(&value),
            PromptKind::Background => {
                if value.trim().is_empty() {
                    return Ok(());
                }
                let job = crate::jobs::start(&self.selection_path(), &value)?;
                self.message = format!(
                    "Started PID {} | log: {}",
                    job.pid,
                    clean(&job.log.to_string_lossy())
                );
                Ok(())
            }
            PromptKind::Goto => {
                if !value.is_empty() {
                    self.browser.set_root(&value)?;
                    self.left = 0.0;
                    self.top = 0.0;
                }
                Ok(())
            }
            PromptKind::Search => {
                self.query = value;
                if !self.query.is_empty() {
                    self.browser.search_key = None;
                    self.message = self.browser.find_next(&self.query, 1)?;
                } else {
                    self.exit_search();
                }
                Ok(())
            }
            PromptKind::GitMessage {
                root,
                selected,
                action,
            } => {
                if value.trim().is_empty() {
                    return Ok(());
                }
                self.git_confirm(root, selected, action, &value)
            }
        }
    }
    fn chosen(&mut self, kind: ChooseKind, options: &[Choice], index: usize) -> Result<(), String> {
        match kind {
            ChooseKind::OpenWith => {
                if let Some(method) = &options[index].id {
                    self.open(method)
                } else {
                    let node = self.browser.selected.clone();
                    if node.borrow().expanded {
                        node.borrow_mut().expanded = false
                    } else {
                        self.browser.expand(&node, None)
                    }
                    Ok(())
                }
            }
            ChooseKind::Hidden(mut paths) => {
                paths.remove(index);
                crate::ordering::save_hidden(&self.config_path, &paths)?;
                self.reload_preferences()?;
                self.refresh_panes();
                self.message = "Item restored in filex".into();
                Ok(())
            }
            ChooseKind::Git { root, selected } => {
                if git_action(index).needs_message() {
                    self.prompt(
                        label("提交信息", "Commit message"),
                        "",
                        PromptKind::GitMessage {
                            root,
                            selected,
                            action: index,
                        },
                    );
                    Ok(())
                } else {
                    self.git_confirm(root, selected, index, "")
                }
            }
        }
    }
    fn confirmed(&mut self, kind: ConfirmKind) -> Result<(), String> {
        match kind {
            ConfirmKind::Trash(source) => {
                files::trash(&source)?;
                self.finished(source.parent().unwrap_or(Path::new("/")).to_path_buf());
                Ok(())
            }
            ConfirmKind::TrashMany(sources) => {
                for path in sources {
                    if let Err(error) = files::trash(&path) {
                        self.refresh_panes();
                        return Err(error);
                    }
                    self.marked.retain(|p| !p.starts_with(&path));
                }
                self.refresh_panes();
                Ok(())
            }
            ConfirmKind::Replace {
                plan,
                replacements,
                next,
                directory,
            } => self.confirm_replacements(plan, replacements, next, directory),
            ConfirmKind::Git { commands, root } => self.git_run(commands, &root),
        }
    }

    /// Key → action exactly as the TUI resolves it.
    fn action(&mut self, key: &str) -> Result<(), String> {
        self.rebudget();
        if !self.query.is_empty() {
            if key == "escape" {
                self.exit_search();
                return Ok(());
            }
            if matches!(key, "up" | "down") {
                self.link_target = None;
                self.message = self
                    .browser
                    .find_next(&self.query, if key == "up" { -1 } else { 1 })?;
                self.focus = true;
                self.meta_path = None;
                return Ok(());
            }
        }
        if self.pending.is_some() {
            match key {
                "escape" => {
                    self.cancel_transfer();
                    return Ok(());
                }
                "enter" => {
                    // The virtual + entry carries its containing folder's path.
                    let target = self.selection_path();
                    return self.transfer_to(&target);
                }
                "t" => {
                    let initial = self.browser.target().to_string_lossy().into_owned();
                    self.prompt(
                        label("目标路径", "Destination"),
                        &initial,
                        PromptKind::TransferPath,
                    );
                    return Ok(());
                }
                "+" => {
                    let target = self.browser.target();
                    return self.transfer_to(&target);
                }
                _ => {}
            }
        }
        if key == " " && self.pending.is_none() {
            let node = self.browser.selected.borrow();
            if !Rc::ptr_eq(&self.browser.selected, &self.browser.root) && !node.create_entry {
                let path = node.path.clone();
                drop(node);
                if !self.marked.remove(&path) {
                    if self.marked.len() >= self.node_budget {
                        return Err("Selection limit reached (max_loaded_nodes)".into());
                    }
                    self.marked.insert(path);
                }
            }
            return Ok(());
        }
        if key == "escape" {
            self.marked.clear();
            return Ok(());
        }
        let action = self
            .browser
            .conf
            .arrow_action(key)
            .unwrap_or_else(|| match key {
                "enter" if self.link_target.is_none() && self.browser.selected.borrow().dir => {
                    "expand_folder"
                }
                "enter" => "open_with",
                "delete" => "trash",
                "f5" | "ctrl+f5" => "refresh",
                "\x06" | "/" => "search",
                "\x0c" => "goto",
                _ => self.browser.conf.action(key).unwrap_or(if key == "y" {
                    "copy_path"
                } else if key == "\x03" {
                    "quit"
                } else {
                    ""
                }),
            })
            .to_string();
        if self.pending.is_some() && action == "new_folder" {
            self.prompt(
                label("新目标目录", "New folder"),
                "",
                PromptKind::Destination,
            );
            return Ok(());
        }
        if self.pending.is_some()
            && ![
                "up",
                "down",
                "expand",
                "collapse",
                "parent",
                "expand_all",
                "collapse_all",
                "hidden",
                "temporary_focus",
                "refresh",
                "goto",
                "search",
                "next_match",
                "previous_match",
                "quit",
            ]
            .contains(&action.as_str())
            && !["home", "end", "pageup", "pagedown", "H", "L"].contains(&key)
        {
            return Ok(());
        }
        if matches!(
            action.as_str(),
            "up" | "down"
                | "collapse"
                | "expand_all"
                | "collapse_all"
                | "hidden"
                | "refresh"
                | "config"
                | "goto"
                | "search"
                | "next_match"
                | "previous_match"
        ) || matches!(key, "home" | "end" | "pageup" | "pagedown" | "escape")
        {
            self.link_target = None;
        }
        self.dispatch(&action, key)
    }
    fn dispatch(&mut self, action: &str, key: &str) -> Result<(), String> {
        match action {
            "temporary_focus" => {
                self.message = self.browser.toggle_temporary_focus()?;
                self.focus = true;
                self.link_target = None;
                self.meta_path = None;
            }
            "toggle_grouped" => self.toggle_grouped(),
            "reorder" => self.reorder()?,
            "hide_item" => self.hide_item()?,
            "hidden_items" => self.hidden_items(),
            "quit" => self.quit = true,
            "exit_here" => {
                self.exit_directory = Some(files::exit_directory(&self.selection_path())?);
                self.quit = true;
            }
            "dashboard" => {
                self.dashboard = !self.dashboard;
                self.meta_path = None;
                if self.dashboard && self.window_columns < 70 {
                    self.message = "Dashboard needs a wider window".into();
                }
            }
            "dashboard_narrow" | "dashboard_widen" => {
                let width = self.window_columns;
                if width < 70 {
                    self.message = "Dashboard needs a wider window".into();
                } else {
                    let current = self.browser.conf.dashboard_columns(width);
                    let desired = if action == "dashboard_narrow" {
                        current.saturating_sub(4)
                    } else {
                        current + 4
                    };
                    self.browser.conf.dashboard_width = desired.clamp(20, (width - 38).min(240));
                    self.dashboard = true;
                }
            }
            "up" => self.browser.step(-1),
            "down" => self.browser.step(1),
            "expand_folder" => {
                let node = self.browser.selected.clone();
                if !node.borrow().expanded {
                    self.browser.expand(&node, None);
                }
            }
            "expand" => {
                if self.link_target.is_none() {
                    if self.browser.selected.borrow().link {
                        let target = files::link_target(&self.browser.selected.borrow().path)?;
                        self.link_target = Some(target);
                        self.meta_path = None;
                    } else {
                        self.browser.right();
                    }
                }
            }
            "collapse" => self.browser.left(),
            "expand_all" => self.message = self.browser.expand_all()?,
            "collapse_all" => self.message = self.browser.collapse_all()?,
            "parent" => {
                if self.link_target.take().is_none() {
                    self.message = self.browser.back()?;
                    self.left = 0.0;
                    self.top = 0.0;
                }
            }
            "focus_root" => {
                if let Some(target) = &self.link_target {
                    let folder = files::exit_directory_path(target)?;
                    self.browser.set_root(&folder.to_string_lossy())?;
                    self.link_target = None;
                    self.message = ui_format!("根目录: {}", "Root: {}", folder.display());
                } else {
                    self.message = self.browser.focus_root();
                }
                self.query.clear();
                self.meta_path = None;
                self.left = 0.0;
                self.top = 0.0;
            }
            "hidden" => {
                self.browser.conf.hidden = !self.browser.conf.hidden;
                self.browser.refresh()
            }
            "git_menu" => self.git_menu()?,
            "toolkit" => self.toolkit()?,
            "run_foreground" => {
                if !self.selection_path().is_dir() {
                    return Err("Select a folder to run a foreground command".into());
                }
                self.prompt(label("终端执行", "Run"), "", PromptKind::Foreground)
            }
            "run_background" => {
                if !self.selection_path().is_dir() {
                    return Err("Select a folder to run a background command".into());
                }
                self.prompt(
                    label("后台执行", "Run in background"),
                    "",
                    PromptKind::Background,
                )
            }
            "copy_path" => self.copy_path()?,
            "refresh" => {
                self.browser.refresh();
                self.meta_path = None
            }
            "config" => {
                self.browser.conf = Config::load(&self.config_path)?;
                self.node_budget = self.browser.conf.max_loaded;
                self.rebudget();
                self.browser.refresh();
                self.meta_path = None;
                self.message = label("配置已重新读取", "Config reloaded").into()
            }
            "goto" => {
                let path = self
                    .browser
                    .root
                    .borrow()
                    .path
                    .to_string_lossy()
                    .into_owned();
                self.prompt(label("进入目录", "Go to"), &path, PromptKind::Goto)
            }
            "search" => {
                let query = self.query.clone();
                self.prompt(label("搜索", "Search"), &query, PromptKind::Search)
            }
            "next_match" | "previous_match" => {
                if !self.query.is_empty() {
                    self.message = self
                        .browser
                        .find_next(&self.query, if action == "next_match" { 1 } else { -1 })?
                }
            }
            "open_with" => self.choose_open()?,
            "open" => {
                let path = self.selection_path();
                let dir = if self.link_target.is_some() {
                    path.is_dir()
                } else {
                    self.browser.selected.borrow().dir
                };
                let method = self
                    .browser
                    .conf
                    .rule(&path, &self.browser.conf.defaults, dir)
                    .cloned()
                    .unwrap_or("system".into());
                self.open(&method)?
            }
            "link_info" => {
                let path = self.selection_path();
                let text =
                    files::dashboard(&path, &self.browser.root.borrow().path, &self.browser.conf);
                self.pager(label("文件 / 链接信息", "Information"), &text);
            }
            "preview" => {
                let path = self.selection_path();
                let text = files::preview(&path, self.browser.conf.preview_bytes);
                self.pager(&clean(&path.to_string_lossy()), &text)
            }
            "new_file" | "new_folder" | "rename" | "copy" | "move" | "trash" => {
                self.operation(action)?
            }
            "help" => self.help(),
            _ => match key {
                "escape" => {
                    self.query.clear();
                    self.message.clear()
                }
                "\x03" => self.quit = true,
                "H" => {
                    self.left = (self.left - 12.0 * self.column).max(0.0);
                    self.focus = false
                }
                "L" => {
                    self.left += 12.0 * self.column;
                    self.focus = false
                }
                "home" => self.browser.selected = self.browser.root.clone(),
                "end" => {
                    if let Some(last) = self.browser.visible().last() {
                        self.browser.selected = last.clone()
                    }
                }
                "pageup" => self.browser.step(-(self.view_rows.max(1) as isize)),
                "pagedown" => self.browser.step(self.view_rows.max(1) as isize),
                _ => {}
            },
        }
        Ok(())
    }

    /// Structured dashboard for the selected path (q).
    pub fn pump_preview(&mut self) {
        if !self.dashboard
            || self.terminal_visible
            || self.preview.busy
            || self.preview.image.is_some()
            || !self.preview.error.is_empty()
            || Instant::now() < self.preview.due
        {
            return;
        }
        let (Some(path), Some(proxy)) = (self.preview.path.clone(), self.proxy.clone()) else {
            return;
        };
        let page = self.preview.page;
        let generation = self.preview.generation;
        self.preview.busy = true;
        std::thread::spawn(move || {
            let result = crate::preview::load(&path, page);
            let _ = proxy.send_event(UserEvent::PreviewReady(generation, result));
        });
    }
    pub fn update_dash(&mut self) {
        let path = self
            .info_path
            .clone()
            .unwrap_or_else(|| self.selection_path());
        if self.meta_path.as_ref() == Some(&path) {
            return;
        }
        self.preview.request(&path);
        self.meta = dash(&path, &self.browser.root.borrow().path, &self.browser.conf);
        self.meta_path = Some(path);
    }
}

fn git_action(index: usize) -> Action {
    [Action::Publish, Action::Add, Action::Commit, Action::Push][index.min(3)]
}

fn date(seconds: i64) -> String {
    let time = seconds as libc::time_t;
    let mut tm = unsafe { std::mem::zeroed::<libc::tm>() };
    if unsafe { libc::localtime_r(&time, &mut tm) }.is_null() {
        return "-".into();
    }
    let mut buffer = [0u8; 64];
    let length = unsafe {
        libc::strftime(
            buffer.as_mut_ptr().cast(),
            buffer.len(),
            c"%Y-%m-%d  %H:%M".as_ptr(),
            &tm,
        )
    };
    String::from_utf8_lossy(&buffer[..length]).into_owned()
}

fn birth(path: &Path) -> Option<i64> {
    let name = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut extended = unsafe { std::mem::zeroed::<libc::statx>() };
    let result = unsafe {
        libc::statx(
            libc::AT_FDCWD,
            name.as_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
            libc::STATX_BTIME,
            &mut extended,
        )
    };
    (result == 0 && extended.stx_mask & libc::STATX_BTIME != 0).then_some(extended.stx_btime.tv_sec)
}

pub fn human(bytes: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < units.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", units[unit])
    }
}

fn dash(path: &Path, root: &Path, conf: &Config) -> Dash {
    use std::os::unix::fs::MetadataExt;
    let mut d = Dash {
        name: clean(
            &path
                .file_name()
                .unwrap_or(path.as_os_str())
                .to_string_lossy(),
        ),
        ..Default::default()
    };
    let info = match std::fs::symlink_metadata(path) {
        Ok(info) => info,
        Err(error) => {
            d.kind = error.to_string();
            return d;
        }
    };
    d.kind = if info.is_dir() {
        "Folder"
    } else if info.file_type().is_symlink() {
        "Link"
    } else if info.is_file() {
        "File"
    } else {
        "Special"
    }
    .into();
    d.rows.push(("Modified".into(), date(info.mtime())));
    d.rows
        .push(("Created".into(), birth(path).map_or("-".into(), date)));
    d.rows.push((
        "Size".into(),
        if info.is_dir() {
            "-".into()
        } else {
            format!("{}  ·  {} bytes", human(info.len()), info.len())
        },
    ));
    d.rows
        .push(("Mode".into(), format!("{:o}", info.mode() & 0o7777)));
    // "Key: value" lines from the shared link report become rows; the rest
    // (hard-link peers, scan notes) stay as plain lines. The directory note
    // explaining link counts is dropped.
    for line in crate::links::details(path, root, &info, conf).lines() {
        let line = line.trim();
        if line.is_empty() || info.is_dir() && !line.contains(": ") {
            continue;
        }
        match line.split_once(": ") {
            Some((key, value)) if key.len() < 32 => {
                d.rows.push((key.trim().into(), value.trim().into()))
            }
            _ => d.extra.push(line.into()),
        }
    }
    d.rows.push(("Path".into(), clean(&path.to_string_lossy())));
    if conf.preview_lines > 0 && info.is_file() && !crate::preview::supported(path) {
        let preview = files::preview(path, conf.preview_bytes);
        let body = preview
            .split_once("\n\n")
            .map_or(preview.as_str(), |(_, b)| b);
        d.preview = body
            .lines()
            .take(conf.preview_lines)
            .map(str::to_owned)
            .collect();
    }
    d
}
