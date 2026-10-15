//! Linux terminal integrations have no native Windows equivalent.
//! Crossterm owns console modes; do not probe tmux or KDE on Windows.
pub struct KonsoleGuard;
impl KonsoleGuard {
    pub fn new(_: bool) -> Self {
        Self
    }
}
pub struct TmuxKeys;
impl TmuxKeys {
    pub fn new(_: bool) -> Self {
        Self
    }
}
pub struct TmuxFocus;
impl TmuxFocus {
    pub fn new(_: bool) -> Self {
        Self
    }
}
