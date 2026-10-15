#[cfg(unix)]
#[path = "tmux_unix.rs"]
mod implementation;
#[cfg(unix)]
pub use implementation::*;
#[cfg(windows)]
pub fn open_in_right_pane(_: &std::process::Command) -> Option<String> {
    None
}
