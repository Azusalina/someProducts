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
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
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
    assert_eq!(
        fs::read_to_string(f.0.join("branch0/alpha.txt")).unwrap(),
        "alpha"
    );
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
    assert_eq!(
        fs::read_to_string(f.0.join("branch0/file0.txt")).unwrap(),
        "test"
    );
    assert!(ui.pending.is_some());
    keys(&mut ui, &["enter", "enter"]);
    assert_eq!(
        fs::read_to_string(f.0.join("branch0/file0.txt")).unwrap(),
        "new"
    );
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
        .map(|n| {
            n.borrow()
                .path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    assert_eq!(&names[..2], &["branch1", "branch0"]);
    select(&mut ui, &f.0.join("branch2"));
    keys(&mut ui, &["z"]);
    assert!(
        !ui.browser
            .visible()
            .iter()
            .any(|n| n.borrow().path.ends_with("branch2"))
    );
    keys(&mut ui, &["Z"]);
    assert!(matches!(ui.modal, Some(Modal::Choose { .. })));
    keys(&mut ui, &["enter"]);
    assert!(
        ui.browser
            .visible()
            .iter()
            .any(|n| n.borrow().path.ends_with("branch2"))
    );
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
    assert!(ui.modal.is_none() && !ui.dashboard);
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
    assert_eq!(
        name(translate(&ch("N"), None, ctrl | ModifiersState::SHIFT)),
        "ctrl+shift+n"
    );
    assert_eq!(
        name(translate(&ch("c"), None, ctrl | ModifiersState::ALT)),
        "ctrl+alt+c"
    );
    assert_eq!(
        name(translate(&ch("?"), Some("?"), ModifiersState::SHIFT)),
        "?"
    );
    assert_eq!(
        name(translate(&Key::Named(NamedKey::F5), None, ctrl)),
        "ctrl+f5"
    );
    assert_eq!(
        name(translate(
            &Key::Named(NamedKey::Space),
            None,
            ModifiersState::empty()
        )),
        " "
    );
    assert!(matches!(
        translate(&ch("="), None, ctrl),
        Some(Input::Zoom(1))
    ));
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
    let list = crate::dnd::uri_list(&[
        PathBuf::from("/tmp/a b/经济.md"),
        PathBuf::from("/x/100%.txt"),
    ]);
    assert_eq!(
        String::from_utf8(list).unwrap(),
        "file:///tmp/a%20b/%E7%BB%8F%E6%B5%8E.md\r\nfile:///x/100%25.txt\r\n"
    );
}

#[test]
fn drops_move_batches_and_reuse_collision_and_recursive_safety() {
    let f = Fixture::new();
    let mut ui = app(&f.0);
    let source = f.0.join("branch0/file0.txt");
    let dest = f.0.join("branch1");
    ui.drop_paths(vec![source.clone()], &dest, true).unwrap();
    assert!(source.exists()); // existing destination must be reviewed first
    assert!(matches!(ui.modal, Some(Modal::Confirm { .. })));
    keys(&mut ui, &["escape"]);
    assert!(source.exists());
    keys(&mut ui, &["escape"]); // cancel pending transfer
    let target = f.0.join("branch2");
    fs::remove_file(target.join("file0.txt")).unwrap();
    ui.drop_paths(vec![source.clone(), source.clone()], &target, true)
        .unwrap();
    assert!(!source.exists() && target.join("file0.txt").exists());
    let folder = f.0.join("branch3");
    let nested = folder.join("nested");
    fs::create_dir(&nested).unwrap();
    assert!(ui.drop_paths(vec![folder.clone()], &nested, true).is_err());
    assert!(folder.exists() && ui.pending.is_none());
    assert!(ui.drop_paths(vec![f.0.clone()], &dest, true).is_err());
}

#[test]
fn uri_import_preserves_bytes_and_rejects_remote_and_malformed_urls() {
    use std::os::unix::ffi::OsStringExt;
    let paths = [PathBuf::from(std::ffi::OsString::from_vec(
        b"/tmp/a \xff#?.txt".to_vec(),
    ))];
    assert_eq!(
        crate::dnd::parse_uri_list(&crate::dnd::uri_list(&paths)).unwrap(),
        paths
    );
    assert_eq!(
        crate::dnd::parse_uri_list(b"# comment\r\nfile://localhost/tmp/a%20b\r\n").unwrap(),
        [PathBuf::from("/tmp/a b")]
    );
    for invalid in [
        b"https://example.com/file".as_slice(),
        b"file://remote/tmp/a",
        b"file:///tmp/%ZZ",
        b"file:///tmp/%",
        b"file:///tmp/%00",
        b"file:///tmp/a?query",
    ] {
        assert!(crate::dnd::parse_uri_list(invalid).is_err());
    }
}

#[test]
fn terminal_key_sequences_keep_editor_controls_and_unicode() {
    use crate::terminal::key_bytes;
    let ctrl = ModifiersState::CONTROL;
    assert_eq!(
        key_bytes(&Key::Character("s".into()), None, ctrl, false),
        b"\x13"
    );
    assert_eq!(
        key_bytes(
            &Key::Named(NamedKey::Escape),
            None,
            ModifiersState::empty(),
            false
        ),
        b"\x1b"
    );
    assert_eq!(
        key_bytes(
            &Key::Named(NamedKey::ArrowUp),
            None,
            ModifiersState::empty(),
            true
        ),
        b"\x1bOA"
    );
    assert_eq!(
        key_bytes(&Key::Named(NamedKey::ArrowLeft), None, ctrl, false),
        b"\x1b[1;5D"
    );
    assert_eq!(
        key_bytes(
            &Key::Character("日".into()),
            Some("日"),
            ModifiersState::empty(),
            false
        ),
        "日".as_bytes()
    );
}

#[test]
fn embedded_pty_is_interactive_resizes_and_restores_after_exit() {
    use crate::{app::UserEvent, terminal::Terminal};
    use std::{
        ffi::OsStr,
        sync::mpsc,
        time::{Duration, Instant},
    };
    let f = Fixture::new();
    let (tx, rx) = mpsc::channel();
    let mut t=Terminal::spawn_with_sink(&f.0,OsStr::new("test -t 0 && test -t 1 && printf 'TTY_OK\\n'; read -r answer; printf 'ANSWER=%s\\n' \"$answer\"; stty size"),false,"test".into(),Box::new(move |event| { let _=tx.send(event); })).unwrap();
    t.resize(31, 91);
    t.write(b"hello world\r");
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(UserEvent::TerminalOutput(_, bytes)) => t.process(&bytes),
            Ok(UserEvent::TerminalEnded(_)) => {
                t.exited = true;
                break;
            }
            _ => {}
        }
    }
    let contents = t.parser.screen().contents();
    assert!(
        contents.contains("TTY_OK")
            && contents.contains("ANSWER=hello world")
            && contents.contains("31 91"),
        "{contents}"
    );
    assert!(t.exited);
}

#[test]
fn photo_preview_decodes_pixels_and_hover_does_not_change_selection() {
    let f = Fixture::new();
    let photo = f.0.join("sample.PNG");
    image::RgbaImage::from_pixel(30, 20, image::Rgba([255, 20, 40, 255]))
        .save(&photo)
        .unwrap();
    let preview = crate::preview::load(&photo, 1).unwrap();
    assert_eq!(preview.image.dimensions(), (30, 20));
    assert_eq!(preview.image.get_pixel(2, 2).0, [255, 20, 40, 255]);
    let mut ui = app(&f.0);
    let selected = ui.selection_path();
    ui.info_path = Some(photo.clone());
    ui.update_dash();
    assert_eq!(ui.selection_path(), selected);
    assert_eq!(ui.preview.path, Some(photo));
    assert!(ui.meta.preview.is_empty());
    keys(&mut ui, &["right"]);
    ui.update_dash();
    assert!(ui.info_path.is_none());
}

fn write_test_pdf(path: &Path) {
    let mut bytes = b"%PDF-1.4\n".to_vec();
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>".into(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 5 0 R >>"
            .into(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 6 0 R >>"
            .into(),
        {
            let body = "1 0 0 rg 0 0 200 200 re f";
            format!("<< /Length {} >>\nstream\n{body}\nendstream", body.len())
        },
        {
            let body = "0 0 1 rg 0 0 200 200 re f";
            format!("<< /Length {} >>\nstream\n{body}\nendstream", body.len())
        },
    ];
    let mut offsets = vec![0];
    for (i, obj) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n{obj}\nendobj\n", i + 1).as_bytes());
    }
    let xref = bytes.len();
    bytes.extend_from_slice(b"xref\n0 7\n0000000000 65535 f \n");
    for offset in &offsets[1..] {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!("trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n").as_bytes(),
    );
    fs::write(path, bytes).unwrap();
}

#[test]
fn pdf_preview_renders_and_browses_distinct_pages() {
    if !crate::files::available("pdftoppm") || !crate::files::available("pdfinfo") {
        eprintln!("PDF rendering test skipped: install poppler");
        return;
    }
    let f = Fixture::new();
    let pdf = f.0.join("two pages.pdf");
    write_test_pdf(&pdf);
    let first = crate::preview::load(&pdf, 1).unwrap();
    let second = crate::preview::load(&pdf, 2).unwrap();
    assert_eq!(first.pages, 2);
    assert_eq!(first.image.get_pixel(100, 100).0, [255, 0, 0, 255]);
    assert_eq!(second.image.get_pixel(100, 100).0, [0, 0, 255, 255]);
    let mut state = crate::preview::State::default();
    state.request(&pdf);
    state.pages = 2;
    state.turn(1);
    assert_eq!(state.page, 2);
    state.turn(1);
    assert_eq!(state.page, 2);
    state.turn(-1);
    assert_eq!(state.page, 1);
}

#[test]
fn gui_fullscreen_default_and_windowed_config() {
    let f = Fixture::new();
    let path = f.0.join("gui.conf");
    assert!(GuiConfig::load(&path).unwrap().fullscreen);
    fs::write(&path, "[gui]\nfullscreen=false\n").unwrap();
    assert!(!GuiConfig::load(&path).unwrap().fullscreen);
}

#[test]
fn vim_and_nano_can_edit_and_save_inside_the_embedded_pty() {
    use crate::{app::UserEvent, terminal::Terminal};
    use std::{
        ffi::OsStr,
        sync::mpsc,
        time::{Duration, Instant},
    };
    let f = Fixture::new();
    for (editor, ready, input) in [
        ("vim", "[New File]", b"iembedded vim\x1b:wq\r".as_slice()),
        ("nano", "GNU nano", b"embedded nano\x0f\r\x18".as_slice()),
    ] {
        if !crate::files::available(editor) {
            eprintln!("{editor} integration skipped: not installed");
            continue;
        }
        let path = f.0.join(format!("{editor}.txt"));
        let script = if editor == "vim" {
            "vim -u NONE -i NONE -n vim.txt"
        } else {
            "nano --ignorercfiles nano.txt"
        };
        let (tx, rx) = mpsc::channel();
        let mut t = Terminal::spawn_with_sink(
            &f.0,
            OsStr::new(script),
            false,
            editor.into(),
            Box::new(move |e| {
                let _ = tx.send(e);
            }),
        )
        .unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut sent = false;
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(UserEvent::TerminalOutput(_, bytes)) => {
                    t.process(&bytes);
                    if !sent && t.parser.screen().contents().contains(ready) {
                        t.write(input);
                        sent = true;
                    }
                }
                Ok(UserEvent::TerminalEnded(_)) => {
                    t.exited = true;
                    break;
                }
                _ => {}
            }
        }
        assert!(
            t.exited,
            "{editor} did not exit: {}",
            t.parser.screen().contents()
        );
        assert_eq!(
            fs::read_to_string(path).unwrap().trim(),
            format!("embedded {editor}")
        );
    }
}

#[test]
fn dashboard_renders_photo_below_metadata_and_pdf_page_controls() {
    let f = Fixture::new();
    let photo = f.0.join("solid.png");
    image::RgbaImage::from_pixel(100, 100, image::Rgba([0, 255, 0, 255]))
        .save(&photo)
        .unwrap();
    let mut ui = app(&f.0);
    ui.gui.animations = false;
    ui.info_path = Some(photo.clone());
    ui.update_dash();
    ui.preview.image = Some(crate::preview::load(&photo, 1).unwrap().image);
    let mut pixels = vec![0; 1360 * 1080];
    let mut canvas = crate::paint::Canvas::new(&mut pixels, 1360, 1080);
    let mut fonts = Fonts::new();
    let mut state = crate::view::ViewState::new(true);
    crate::view::draw(
        &mut canvas,
        &mut ui,
        &mut fonts,
        crate::theme::DARK,
        1.0,
        &mut state,
    );
    assert!(
        canvas
            .px
            .chunks(1360)
            .skip(350)
            .any(|row| row[1000..].contains(&0x00ff00))
    );
    let pdf = f.0.join("two.pdf");
    write_test_pdf(&pdf);
    ui.info_path = Some(pdf);
    ui.meta_path = None;
    ui.update_dash();
    let (hits, _) = crate::view::draw(
        &mut canvas,
        &mut ui,
        &mut fonts,
        crate::theme::DARK,
        1.0,
        &mut state,
    );
    assert_eq!(hits.preview_buttons.len(), 2);
}
