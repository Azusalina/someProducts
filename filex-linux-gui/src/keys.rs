//! Translate window key events into the key names fileX's TUI dispatches on,
//! so `[keys]` bindings from filex.conf apply unchanged.
use crate::config::key_code;
use winit::keyboard::{Key, ModifiersState, NamedKey};

pub enum Input {
    /// A fileX key name: "up", "enter", "\x06", "ctrl+shift+n", "A", ...
    Key(String),
    Zoom(i32),
    Theme,
}

pub fn translate(key: &Key, text: Option<&str>, mods: ModifiersState) -> Option<Input> {
    let ctrl = mods.control_key();
    let alt = mods.alt_key();
    let shift = mods.shift_key();
    let name = match key {
        Key::Named(named) => match named {
            NamedKey::Enter => "enter",
            NamedKey::Escape => "escape",
            NamedKey::Backspace => "backspace",
            NamedKey::Delete => "delete",
            NamedKey::Tab => "\t",
            NamedKey::ArrowUp => "up",
            NamedKey::ArrowDown => "down",
            NamedKey::ArrowLeft => "left",
            NamedKey::ArrowRight => "right",
            NamedKey::PageUp => "pageup",
            NamedKey::PageDown => "pagedown",
            NamedKey::Home => "home",
            NamedKey::End => "end",
            NamedKey::Space => " ",
            NamedKey::F5 if ctrl => "ctrl+f5",
            NamedKey::F5 => "f5",
            NamedKey::F12 => return Some(Input::Theme),
            _ => return None,
        }
        .to_owned(),
        Key::Character(chars) => {
            let c = chars.chars().next()?;
            if ctrl && !alt {
                match c {
                    '=' | '+' => return Some(Input::Zoom(1)),
                    '-' | '_' => return Some(Input::Zoom(-1)),
                    '0' | ')' => return Some(Input::Zoom(0)),
                    _ => {}
                }
            }
            if ctrl && c.is_ascii_alphabetic() {
                let mut prefix = "Ctrl".to_owned();
                if alt {
                    prefix.push_str("+Alt");
                }
                if shift {
                    prefix.push_str("+Shift");
                }
                key_code(&format!("{prefix}+{}", c.to_ascii_lowercase()))
            } else {
                // Shifted symbols and capitals arrive already composed ("?", "A").
                match text {
                    Some(t) if !t.is_empty() && !t.chars().any(char::is_control) => t.to_owned(),
                    _ => chars.to_string(),
                }
            }
        }
        _ => return None,
    };
    Some(Input::Key(name))
}
