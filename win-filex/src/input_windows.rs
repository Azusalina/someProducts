//! Request English for the foreground terminal, restoring the original HKL.
//! Best effort: Windows Terminal/IME policies may refuse the request.
use std::sync::atomic::{AtomicIsize, Ordering};
use windows_sys::Win32::UI::{
    Input::KeyboardAndMouse::{GetKeyboardLayout, LoadKeyboardLayoutW},
    WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, WM_INPUTLANGCHANGEREQUEST,
    },
};
static ENGLISH: AtomicIsize = AtomicIsize::new(0);
pub struct EnglishGuard {
    window: isize,
    previous: isize,
}
impl EnglishGuard {
    pub fn new(enabled: bool) -> Self {
        let mut guard = Self {
            window: 0,
            previous: 0,
        };
        if enabled {
            unsafe {
                let window = GetForegroundWindow();
                let thread = GetWindowThreadProcessId(window, std::ptr::null_mut());
                let name: Vec<u16> = "00000409\0".encode_utf16().collect();
                let english = LoadKeyboardLayoutW(name.as_ptr(), 0);
                if !window.is_null() && !english.is_null() {
                    guard.window = window as isize;
                    guard.previous = GetKeyboardLayout(thread) as isize;
                    ENGLISH.store(english as isize, Ordering::Relaxed);
                    ensure_english(true);
                }
            }
        }
        guard
    }
}
pub fn ensure_english(enabled: bool) {
    let english = ENGLISH.load(Ordering::Relaxed);
    if enabled && english != 0 {
        unsafe {
            PostMessageW(GetForegroundWindow(), WM_INPUTLANGCHANGEREQUEST, 0, english);
        }
    }
}
impl Drop for EnglishGuard {
    fn drop(&mut self) {
        if self.window != 0 && self.previous != 0 {
            unsafe {
                PostMessageW(
                    self.window as _,
                    WM_INPUTLANGCHANGEREQUEST,
                    0,
                    self.previous,
                );
            }
        }
        ENGLISH.store(0, Ordering::Relaxed);
    }
}
