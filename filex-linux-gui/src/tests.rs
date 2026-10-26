//! Key-for-key parity with the TUI's interaction tests, driven through the
//! GUI's non-blocking state machine, plus GUI-only modal and layout checks.
use crate::{
    app::{App, Modal},
    config::Config,
    font::Fonts,
    gui_config::GuiConfig,
    keys::{Input, translate},
    layout::{Metrics, TreeLayout},
    model::Browser,
};
use std::{
    fs,
    path::{Path, PathBuf},
    rc::Rc,
    time::{SystemTime, UNIX_EPOCH},
};
use winit::keyboard::{Key, ModifiersState, NamedKey, SmolStr};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "filex-gui-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        for i in 0..4 {
            let folder = root.join(format!("branch{i}"));
            fs::create_dir_all(&folder).unwrap();
            for j in 0..5 {
                fs::write(folder.join(format!("file{j}.txt")), "test").unwrap();
            }
        }
        Self(fs::canonicalize(root).unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn app(root: &Path) -> App {
    let conf = Config {
        max_loaded: 200,
        git_enabled: false,
        ..Config::default()
    };
    App::new(
        Browser::new(root, conf).unwrap(),
        root.join("settings.conf"),
        GuiConfig::default(),
    )
}
fn keys(app: &mut App, sequence: &[&str]) {
    for key in sequence {
        app.handle_key(key);
    }
}
fn select(app: &mut App, path: &Path) {
    let node = app
        .browser
        .visible()
        .into_iter()
        .find(|n| n.borrow().path == path && !n.borrow().create_entry)
        .unwrap();
    app.select(&node);
}
fn typed(app: &mut App, text: &str) {
    for c in text.chars() {
        app.handle_key(&c.to_string());
    }
}

#[test]
fn enter_expands_folders_without_moving_and_v_keeps_branches() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    keys(&mut ui, &["right"]);
    let first = ui.browser.selected.clone();
    keys(&mut ui, &["enter"]);
    assert!(first.borrow().expanded && Rc::ptr_eq(&ui.browser.selected, &first));
    keys(&mut ui, &["enter", "down", "enter"]);
    let second = ui.browser.selected.clone();
    assert!(first.borrow().expanded && second.borrow().expanded);
    keys(&mut ui, &["v"]);
    assert!(ui.browser.conf.grouped);
    assert!(first.borrow().expanded && second.borrow().expanded);
}

#[test]
fn marked_batch_copy_then_move_through_cursor_destination() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    let (a, b) = (f.0.join("alpha.txt"), f.0.join("beta.txt"));
    fs::write(&a, "alpha").unwrap();
    fs::write(&b, "beta").unwrap();
    ui.browser.refresh();
    for p in [&a, &b] {
        select(&mut ui, p);
        keys(&mut ui, &[" "]);
    }
    assert_eq!(ui.marked.len(), 2);
    keys(&mut ui, &["c"]);
    ui.prepare();
    assert!(ui.browser.root.borrow().children[0].borrow().create_entry);
    select(&mut ui, &f.0.join("branch0"));
    keys(&mut ui, &["enter"]);
    assert_eq!(fs::read_to_string(f.0.join("branch0/alpha.txt")).unwrap(), "alpha");
    assert!(a.exists() && ui.pending.is_none() && ui.marked.is_empty());
    assert!(!ui.browser.visible().iter().any(|n| n.borrow().create_entry));
    select(&mut ui, &a);
    keys(&mut ui, &["m"]);
    select(&mut ui, &f.0.join("branch1"));
    keys(&mut ui, &["+"]);
    assert!(!a.exists() && f.0.join("branch1/alpha.txt").exists());
}

#[test]
fn collision_preflight_reports_and_escape_cancels_then_clears() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    let (a, b) = (f.0.join("alpha"), f.0.join("beta"));
    fs::write(&a, "a").unwrap();
    fs::write(&b, "b").unwrap();
    let dest = f.0.join("branch0");
    fs::create_dir(dest.join("beta")).unwrap();
    ui.marked.extend([a.clone(), b.clone()]);
    keys(&mut ui, &["c"]);
    select(&mut ui, &dest);
    keys(&mut ui, &["enter"]);
    assert!(ui.message.starts_with("Operation failed"));
    assert!(!dest.join("alpha").exists());
    keys(&mut ui, &["escape"]);
    assert!(ui.pending.is_none() && ui.marked.len() == 2);
    keys(&mut ui, &["escape"]);
    assert!(ui.marked.is_empty());
}

#[test]
fn replacing_a_regular_file_asks_then_replaces_on_enter() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    let source = f.0.join("file0.txt");
    fs::write(&source, "new").unwrap();
    ui.browser.refresh();
    select(&mut ui, &source);
    keys(&mut ui, &["c"]);
    select(&mut ui, &f.0.join("branch0"));
    keys(&mut ui, &["enter"]);
    assert!(matches!(ui.modal, Some(Modal::Confirm { .. })));
    keys(&mut ui, &["escape"]);
    assert_eq!(fs::read_to_string(f.0.join("branch0/file0.txt")).unwrap(), "test");
    assert!(ui.pending.is_some());
    keys(&mut ui, &["enter", "enter"]);
    assert_eq!(fs::read_to_string(f.0.join("branch0/file0.txt")).unwrap(), "new");
    assert!(ui.pending.is_none());
}

#[test]
fn prompts_create_and_rename_with_cursor_editing() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    keys(&mut ui, &["a"]);
    assert!(matches!(ui.modal, Some(Modal::Prompt { .. })));
    typed(&mut ui, "note.md");
    keys(&mut ui, &["enter"]);
    let note = f.0.join("note.md");
    assert!(note.is_file());
    assert_eq!(ui.selection_path(), note);
    keys(&mut ui, &["r", "\x15"]);
    typed(&mut ui, "日记.md");
    keys(&mut ui, &["home", "delete", "enter"]);
    assert!(f.0.join("记.md").is_file() && !note.exists());
    keys(&mut ui, &["A"]);
    typed(&mut ui, "made");
    keys(&mut ui, &["escape"]);
    assert!(!f.0.join("made").exists() && ui.modal.is_none());
    keys(&mut ui, &["ctrl+shift+n"]);
    typed(&mut ui, "made");
    keys(&mut ui, &["enter"]);
    assert!(f.0.join("made").is_dir());
}

#[test]
fn search_wraps_across_parents_and_escape_keeps_selection() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    let a = f.0.join("branch0/match-a.txt");
    let b = f.0.join("branch1/match-b.txt");
    fs::write(&a, "a").unwrap();
    fs::write(&b, "b").unwrap();
    keys(&mut ui, &["\x06"]);
    typed(&mut ui, "match-");
    keys(&mut ui, &["enter"]);
    assert_eq!(ui.selection_path(), a);
    keys(&mut ui, &["down"]);
    assert_eq!(ui.selection_path(), b);
    keys(&mut ui, &["down"]);
    assert_eq!(ui.selection_path(), a);
    keys(&mut ui, &["n"]);
    assert_eq!(ui.selection_path(), b);
    keys(&mut ui, &["escape"]);
    assert!(ui.query.is_empty() && ui.browser.results.is_empty());
    assert_eq!(ui.selection_path(), b);
}

#[test]
fn trash_asks_first_and_escape_keeps_the_file() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    let target = f.0.join("branch0");
    select(&mut ui, &target);
    keys(&mut ui, &["delete"]);
    assert!(matches!(ui.modal, Some(Modal::Confirm { .. })));
    keys(&mut ui, &["escape"]);
    assert!(target.exists() && ui.modal.is_none());
    keys(&mut ui, &["home", "D"]);
    assert!(ui.modal.is_none() && ui.message.contains("Cannot modify root"));
}

#[test]
fn reorder_saves_sequence_and_hide_restore_round_trip() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    select(&mut ui, &f.0.join("branch1"));
    keys(&mut ui, &["O", "K", "enter"]);
    let names: Vec<_> = ui
        .browser
        .root
        .borrow()
        .children
        .iter()
        .map(|n| n.borrow().path.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(&names[..2], &["branch1", "branch0"]);
    select(&mut ui, &f.0.join("branch2"));
    keys(&mut ui, &["z"]);
    assert!(!ui.browser.visible().iter().any(|n| n.borrow().path.ends_with("branch2")));
    keys(&mut ui, &["Z"]);
    assert!(matches!(ui.modal, Some(Modal::Choose { .. })));
    keys(&mut ui, &["enter"]);
    assert!(ui.browser.visible().iter().any(|n| n.borrow().path.ends_with("branch2")));
}

#[test]
fn symlink_right_selects_target_and_left_returns() {
    let f = Fixture::new();
    std::os::unix::fs::symlink(f.0.join("branch3"), f.0.join("link")).unwrap();
    let mut ui = app(&f.0);
    ui.browser.refresh();
    select(&mut ui, &f.0.join("link"));
    keys(&mut ui, &["right"]);
    assert_eq!(ui.selection_path(), f.0.join("branch3"));
    keys(&mut ui, &["left"]);
    assert_eq!(ui.selection_path(), f.0.join("link"));
}

#[test]
fn modal_keys_help_pager_and_dashboard() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    keys(&mut ui, &["?"]);
    assert!(matches!(ui.modal, Some(Modal::Help { .. })));
    keys(&mut ui, &["escape", "right", "p"]);
    assert!(matches!(ui.modal, Some(Modal::Pager { .. })));
    keys(&mut ui, &["q", "q"]);
    assert!(ui.modal.is_none() && ui.dashboard);
    keys(&mut ui, &["]"]);
    assert_eq!(ui.browser.conf.dashboard_width, 40);
    keys(&mut ui, &["F", "F", "E", "C", ".", "Q"]);
    assert!(ui.quit);
}

#[test]
fn window_keys_translate_to_tui_names() {
    let ch = |c: &str| Key::Character(SmolStr::new(c));
    let name = |input: Option<Input>| match input {
        Some(Input::Key(k)) => k,
        _ => String::from("<none>"),
    };
    let ctrl = ModifiersState::CONTROL;
    assert_eq!(name(translate(&ch("f"), None, ctrl)), "\x06");
    assert_eq!(name(translate(&ch("N"), None, ctrl | ModifiersState::SHIFT)), "ctrl+shift+n");
    assert_eq!(name(translate(&ch("c"), None, ctrl | ModifiersState::ALT)), "ctrl+alt+c");
    assert_eq!(name(translate(&ch("?"), Some("?"), ModifiersState::SHIFT)), "?");
    assert_eq!(name(translate(&Key::Named(NamedKey::F5), None, ctrl)), "ctrl+f5");
    assert_eq!(name(translate(&Key::Named(NamedKey::Space), None, ModifiersState::empty())), " ");
    assert!(matches!(translate(&ch("="), None, ctrl), Some(Input::Zoom(1))));
}

#[test]
fn pixel_layout_matches_tree_structure_in_both_modes() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    keys(&mut ui, &["right", "enter", "c"]);
    ui.prepare();
    let mut fonts = Fonts::new();
    for grouped in [false, true] {
        ui.browser.conf.grouped = grouped;
        let m = Metrics::new(1.0, 13.5, &ui.browser.conf);
        let layout = TreeLayout::new(&ui.browser, &mut fonts, &m);
        let branch = ui.browser.selected.clone();
        let parent = layout.find(&branch).unwrap();
        let children = branch.borrow().children.clone();
        let plus = layout.find(&children[0]).unwrap();
        assert!(children[0].borrow().create_entry);
        for child in &children {
            let item = layout.find(child).unwrap();
            assert!(item.x > parent.x + parent.w && item.y >= plus.y);
        }
        assert_eq!(layout.route(&children[1], &m).len(), 6);
    }
}

#[test]
fn dragged_paths_become_percent_encoded_file_uris() {
    let list = crate::dnd::uri_list(&[PathBuf::from("/tmp/a b/经济.md"), PathBuf::from("/x/100%.txt")]);
    assert_eq!(
        String::from_utf8(list).unwrap(),
        "file:///tmp/a%20b/%E7%BB%8F%E6%B5%8E.md\r\nfile:///x/100%25.txt\r\n"
    );
}
