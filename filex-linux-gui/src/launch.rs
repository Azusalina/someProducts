//! Programs that need a terminal (editors, scripts, `@` commands, Git) run in
//! the embedded terminal page. External shells still use an emulator.
use std::{
    ffi::{OsStr, OsString},
    os::unix::ffi::{OsStrExt, OsStringExt},
    path::Path,
    process::{Command, Stdio},
};

const KNOWN: &[(&str, &[&str])] = &[
    ("konsole", &["-e"]),
    ("kitty", &[]),
    ("alacritty", &["-e"]),
    ("foot", &[]),
    ("wezterm", &["start", "--"]),
    ("ghostty", &["-e"]),
    ("gnome-terminal", &["--"]),
    ("kgx", &["--"]),
    ("xfce4-terminal", &["-x"]),
    ("tilix", &["-e"]),
    ("xterm", &["-e"]),
];

/// Configured `[gui] terminal`, then $TERMINAL, then the first installed emulator.
pub fn terminal(configured: &[String]) -> Result<Vec<OsString>, String> {
    if !configured.is_empty() {
        return Ok(configured.iter().map(OsString::from).collect());
    }
    let mut candidates: Vec<String> = vec![];
    if let Ok(value) = std::env::var("TERMINAL")
        && !value.trim().is_empty()
    {
        candidates.push(value);
    }
    candidates.extend(KNOWN.iter().map(|(name, _)| name.to_string()));
    for name in candidates {
        if crate::files::available(&name) {
            let base = Path::new(&name)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned());
            let flags = KNOWN
                .iter()
                .find(|(known, _)| Some(*known) == base.as_deref())
                .map_or(&["-e"][..], |(_, flags)| *flags);
            let mut argv = vec![OsString::from(&name)];
            argv.extend(flags.iter().map(OsString::from));
            return Ok(argv);
        }
    }
    Err("No terminal emulator found; set [gui] terminal = [\"konsole\", \"-e\"]".into())
}

/// Single-quote for POSIX sh, byte-exact (non-UTF-8 names stay intact).
pub fn quote(value: &OsStr) -> OsString {
    let mut out = b"'".to_vec();
    for &b in value.as_bytes() {
        if b == b'\'' {
            out.extend_from_slice(b"'\\''");
        } else {
            out.push(b);
        }
    }
    out.push(b'\'');
    OsString::from_vec(out)
}

/// Render a prepared `Command` (program, arguments, removed variables) as sh.
pub fn command_line(command: &Command) -> OsString {
    let mut out = OsString::new();
    let removed: Vec<_> = command.get_envs().filter(|(_, v)| v.is_none()).collect();
    if !removed.is_empty() {
        out.push("env");
        for (key, _) in removed {
            out.push(" -u ");
            out.push(quote(key));
        }
        out.push(" ");
    }
    out.push(quote(command.get_program()));
    for arg in command.get_args() {
        out.push(" ");
        out.push(quote(arg));
    }
    out
}

/// Open a plain interactive terminal in a directory.
pub fn open_shell(configured: &[String], cwd: &Path) -> Result<(), String> {
    let argv = terminal(configured)?;
    let program = &argv[0];
    let mut command = Command::new(program);
    if Path::new(program).file_name() == Some(OsStr::new("konsole")) {
        command.arg("--workdir").arg(cwd);
    }
    command
        .current_dir(cwd)
        .env_remove("FILEX_CWD_FILE")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(drop)
        .map_err(|e| format!("{}: {e}", program.to_string_lossy()))
}
