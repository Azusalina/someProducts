//! `[gui]` lives in the shared filex.conf; the TUI already skips that section.
use std::{fs, path::Path};
use toml::Value;

#[derive(Clone, Debug)]
pub struct GuiConfig {
    pub theme: String,
    pub zoom: f32,
    pub decorations: String,
    pub language: String,
    pub terminal: Vec<String>,
    pub animations: bool,
    pub font_size: f32,
    pub fullscreen: bool,
    pub width: f64,
    pub height: f64,
}

impl Default for GuiConfig {
    fn default() -> Self {
        Self {
            theme: "auto".into(),
            zoom: 1.0,
            decorations: "client".into(),
            language: "en".into(),
            terminal: vec![],
            animations: true,
            font_size: 13.5,
            fullscreen: true,
            width: 1360.0,
            height: 860.0,
        }
    }
}

impl GuiConfig {
    pub fn load(path: &Path) -> Result<Self, String> {
        let mut conf = Self::default();
        let Ok(text) = fs::read_to_string(path) else {
            return Ok(conf);
        };
        let data: Value = toml::from_str(&text).map_err(|e| e.to_string())?;
        let Some(table) = data.get("gui").and_then(Value::as_table) else {
            return Ok(conf);
        };
        for (key, value) in table {
            let bad = || format!("gui.{key}: invalid value");
            match key.as_str() {
                "theme" => {
                    conf.theme = value.as_str().ok_or_else(bad)?.into();
                    if !["auto", "dark", "light"].contains(&conf.theme.as_str()) {
                        return Err("gui.theme: auto / dark / light".into());
                    }
                }
                "zoom" => {
                    conf.zoom = number(value).ok_or_else(bad)?.clamp(0.6, 2.5) as f32;
                }
                "decorations" => {
                    conf.decorations = value.as_str().ok_or_else(bad)?.into();
                    if !["client", "system"].contains(&conf.decorations.as_str()) {
                        return Err("gui.decorations: client / system".into());
                    }
                }
                "language" => {
                    conf.language = value.as_str().ok_or_else(bad)?.into();
                    if !["en", "zh"].contains(&conf.language.as_str()) {
                        return Err("gui.language: en / zh".into());
                    }
                }
                "terminal" => {
                    conf.terminal = value
                        .as_array()
                        .ok_or_else(bad)?
                        .iter()
                        .map(|v| v.as_str().map(str::to_owned).ok_or_else(bad))
                        .collect::<Result<_, _>>()?;
                }
                "fullscreen" => conf.fullscreen = value.as_bool().ok_or_else(bad)?,
                "animations" => conf.animations = value.as_bool().ok_or_else(bad)?,
                "font_size" => {
                    conf.font_size = number(value).ok_or_else(bad)?.clamp(9.0, 24.0) as f32
                }
                "width" => conf.width = number(value).ok_or_else(bad)?.clamp(480.0, 8000.0),
                "height" => conf.height = number(value).ok_or_else(bad)?.clamp(320.0, 8000.0),
                _ => return Err(format!("Unknown option: gui.{key}")),
            }
        }
        Ok(conf)
    }
}

fn number(value: &Value) -> Option<f64> {
    value
        .as_float()
        .or_else(|| value.as_integer().map(|v| v as f64))
}

/// Persist one `[gui]` value, keeping the rest of the file and its comments.
pub fn save(path: &Path, key: &str, item: toml_edit::Item) -> Result<(), String> {
    let text = fs::read_to_string(path).unwrap_or_default();
    let mut doc: toml_edit::DocumentMut = text.parse().map_err(|e| format!("{e}"))?;
    if !doc.contains_key("gui") {
        doc["gui"] = toml_edit::table();
    }
    doc["gui"][key] = item;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write through a symlinked config (the product keeps filex.conf as a link).
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let temp = target.with_extension(format!("gui-{}.tmp", std::process::id()));
    fs::write(&temp, doc.to_string()).map_err(|e| e.to_string())?;
    fs::rename(&temp, &target).map_err(|e| e.to_string())
}

/// KDE / GTK hint for `theme = "auto"` when the compositor reports nothing.
pub fn desktop_prefers_dark() -> Option<bool> {
    let home = std::env::var_os("HOME")?;
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| Path::new(&home).join(".config"));
    if let Ok(text) = fs::read_to_string(config.join("kdeglobals")) {
        let mut section = "";
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                section = line;
            } else if section == "[Colors:Window]"
                && let Some(value) = line.strip_prefix("BackgroundNormal=")
            {
                let parts: Vec<f32> = value
                    .split(',')
                    .filter_map(|v| v.trim().parse().ok())
                    .collect();
                if parts.len() >= 3 {
                    let luma = 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
                    return Some(luma < 128.0);
                }
            }
        }
    }
    if let Ok(text) = fs::read_to_string(config.join("gtk-3.0/settings.ini")) {
        for line in text.lines() {
            if let Some(v) = line
                .trim()
                .strip_prefix("gtk-application-prefer-dark-theme")
            {
                return Some(v.contains('1') || v.contains("true"));
            }
        }
    }
    None
}
