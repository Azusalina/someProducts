use crate::{config::Config, files, model::Browser, platform};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "win-filex-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn rejects_windows_device_names_and_separators() {
    for name in [
        "",
        ".",
        "..",
        "NUL",
        "CON.txt",
        "com1.py",
        "LPT9",
        "COM¹.txt",
        "a:b",
        "a/b",
        "a\\b",
        "a?b",
        "end.",
        "end ",
        "a\n",
    ] {
        assert!(files::name_valid(name).is_err(), "{name:?}");
    }
    for name in ["中文.py", "hello world.md", "a&b!.txt", "COM10", ".git"] {
        assert!(files::name_valid(name).is_ok(), "{name:?}");
    }
}
#[test]
fn unicode_create_copy_move_and_no_overwrite() {
    let f = Fixture::new();
    let source = files::create(&f.0, "中文 & space.txt", false).unwrap();
    fs::write(&source, "hello\nworld").unwrap();
    let copied = f.0.join("copy.txt");
    files::transfer(&source, &copied, false).unwrap();
    assert_eq!(fs::read_to_string(&copied).unwrap(), "hello\nworld");
    assert!(files::transfer(&source, &copied, false).is_err());
    assert!(files::rename(&source, &copied).is_err());
    assert!(source.exists());
    let moved = f.0.join("moved.txt");
    files::transfer(&copied, &moved, true).unwrap();
    assert!(!copied.exists());
    assert!(moved.exists());
    assert!(files::transfer(&source, &f.0.join("NUL"), true).is_err());
    assert!(source.exists());
}
#[test]
fn directory_self_copy_is_rejected_and_metadata_preview_work() {
    let f = Fixture::new();
    let d = files::create(&f.0, "folder", true).unwrap();
    assert!(files::transfer(&d, &d.join("child"), false).is_err());
    let p = files::create(&d, "text.txt", false).unwrap();
    fs::write(&p, "alpha\nbeta\ngamma").unwrap();
    let conf = Config {
        preview_lines: 2,
        ..Config::default()
    };
    let text = files::dashboard(&p, &f.0, &conf);
    assert!(text.contains("alpha\nbeta"));
    assert!(!text.contains("gamma"));
    assert!(text.contains("UTC"));
}
#[test]
fn ntfs_hard_links_share_native_identity() {
    let f = Fixture::new();
    let a = files::create(&f.0, "a", false).unwrap();
    let b = f.0.join("b");
    fs::hard_link(&a, &b).unwrap();
    assert_eq!(platform::link_count(&a), 2);
    assert_eq!(platform::identity(&a), platform::identity(&b));
    let info = fs::symlink_metadata(&a).unwrap();
    assert_eq!(crate::links::peers(&a, &f.0, &info, 100, 10).paths, vec![b]);
}
#[test]
fn hidden_attribute_and_dotfiles_are_hidden() {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{FILE_ATTRIBUTE_HIDDEN, SetFileAttributesW};
    let f = Fixture::new();
    let p = files::create(&f.0, "hidden.txt", false).unwrap();
    let wide: Vec<u16> = p.as_os_str().encode_wide().chain(Some(0)).collect();
    assert_ne!(
        unsafe { SetFileAttributesW(wide.as_ptr(), FILE_ATTRIBUTE_HIDDEN) },
        0
    );
    assert!(platform::hidden(&p, "hidden.txt"));
    assert!(platform::hidden(&p, ".git"));
    let mut browser = Browser::new(&f.0, Config::default()).unwrap();
    assert!(browser.root.borrow().children.is_empty());
    browser.search("hidden");
    assert!(browser.results.is_empty());
    browser.conf.hidden = true;
    browser.search("hidden");
    assert_eq!(browser.results.len(), 1);
}
#[test]
fn config_has_native_openers_and_loads_windows_example() {
    let conf = Config::default();
    assert_eq!(conf.defaults[".py"], "notepad");
    assert_eq!(conf.defaults[".md"], "system");
    assert!(
        conf.openers["system"]
            .command
            .contains(&"--open-system".into())
    );
    assert!(files::available("notepad.exe"));
    let conf = Config::load(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fileX.example.conf"))
        .unwrap();
    assert_eq!(conf.color_mode, "truecolor");
    assert!(!conf.tmux_right);
}
#[test]
fn shell_paths_remove_only_verbatim_prefixes() {
    assert_eq!(
        platform::shell_path(std::path::Path::new(r"\\?\C:\a\中文")),
        PathBuf::from(r"C:\a\中文")
    );
    assert_eq!(
        platform::shell_path(std::path::Path::new(r"\\?\UNC\server\share\a")),
        PathBuf::from(r"\\server\share\a")
    );
}
