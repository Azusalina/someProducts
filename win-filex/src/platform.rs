use std::{fs, path::Path, time::UNIX_EPOCH};
pub fn modified_seconds(info: &fs::Metadata) -> i64 {
    info.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs().min(i64::MAX as u64) as i64)
}
pub fn hidden(path: &Path, name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return fs::symlink_metadata(path).is_ok_and(|m| m.file_attributes() & 2 != 0);
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        false
    }
}
pub fn reparse(info: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        info.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        let _ = info;
        false
    }
}
#[cfg(unix)]
pub fn identity(path: &Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    fs::symlink_metadata(path).ok().map(|m| (m.dev(), m.ino()))
}
#[cfg(unix)]
pub fn link_count(path: &Path) -> u64 {
    use std::os::unix::fs::MetadataExt;
    fs::symlink_metadata(path).map_or(1, |m| m.nlink())
}
#[cfg(windows)]
fn information(
    path: &Path,
) -> Option<windows_sys::Win32::Storage::FileSystem::BY_HANDLE_FILE_INFORMATION> {
    use std::os::windows::{fs::OpenOptionsExt, io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, GetFileInformationByHandle,
    };
    let file = fs::OpenOptions::new()
        .access_mode(0)
        .share_mode(7)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .ok()?;
    let mut info = unsafe { std::mem::zeroed() };
    (unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } != 0).then_some(info)
}
#[cfg(windows)]
pub fn identity(path: &Path) -> Option<(u64, u64)> {
    information(path).map(|i| {
        (
            i.dwVolumeSerialNumber as u64,
            ((i.nFileIndexHigh as u64) << 32) | i.nFileIndexLow as u64,
        )
    })
}
#[cfg(windows)]
pub fn link_count(path: &Path) -> u64 {
    information(path).map_or(1, |i| i.nNumberOfLinks as u64)
}

/// Keep extended paths internally; shell interfaces expect ordinary drive/UNC paths.
#[cfg(windows)]
pub fn shell_path(path: &Path) -> std::path::PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut components = path.components();
        if let Some(Component::Prefix(prefix)) = components.next() {
            let mut out = match prefix.kind() {
                Prefix::VerbatimDisk(drive) => {
                    std::path::PathBuf::from(format!("{}:", drive as char))
                }
                Prefix::VerbatimUNC(server, share) => {
                    let mut out = std::ffi::OsString::from(r"\\");
                    out.push(server);
                    out.push(r"\");
                    out.push(share);
                    std::path::PathBuf::from(out)
                }
                _ => return path.to_owned(),
            };
            for part in components {
                out.push(part.as_os_str());
            }
            return out;
        }
    }
    path.to_owned()
}
