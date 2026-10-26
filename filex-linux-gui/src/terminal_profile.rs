//! Stand-in for fileX's terminal profile. The shared modules only ask whether
//! messages are English (`ascii`) and whether a desktop session is present.
use std::sync::OnceLock;

#[derive(Clone, Copy, Debug)]
pub struct Profile {
    pub desktop: bool,
    pub ascii: bool,
}
static PROFILE: OnceLock<Profile> = OnceLock::new();

pub fn init(english: bool) {
    let desktop = ["WAYLAND_DISPLAY", "DISPLAY"]
        .iter()
        .any(|key| std::env::var_os(key).is_some_and(|v| !v.is_empty()));
    let _ = PROFILE.set(Profile {
        desktop,
        ascii: english,
    });
}
pub fn get() -> Profile {
    *PROFILE.get_or_init(|| Profile {
        desktop: true,
        ascii: true,
    })
}
pub fn glyph(c: char) -> char {
    c
}
pub fn label<'a>(zh: &'a str, en: &'a str) -> &'a str {
    if get().ascii { en } else { zh }
}
