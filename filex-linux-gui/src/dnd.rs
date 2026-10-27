//! Native Wayland file drops and drags out (into a browser upload field, a chat, a file
//! manager). winit cannot be a drag source, so this speaks the Wayland
//! data-device protocol on winit's own connection, with a private event queue:
//! a second wl_pointer supplies the button serial `start_drag` requires, and
//! the data source answers `text/uri-list` / `text/plain` requests.
use std::{
    io::{Read, Write},
    os::fd::{AsFd, OwnedFd},
    os::unix::net::UnixStream,
    path::PathBuf,
    sync::{Mutex, mpsc},
};
use wayland_backend::client::{Backend, ObjectId};
use wayland_client::{
    Connection, Dispatch, EventQueue, Proxy, QueueHandle, WEnum, event_created_child,
    protocol::{
        wl_data_device::{self, WlDataDevice},
        wl_data_device_manager::{DndAction, WlDataDeviceManager},
        wl_data_offer::{self, WlDataOffer},
        wl_data_source::{self, WlDataSource},
        wl_pointer::{self, WlPointer},
        wl_registry::{self, WlRegistry},
        wl_seat::{self, WlSeat},
        wl_surface::WlSurface,
    },
};
use winit::{
    raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle},
    window::Window,
};

const URI_LIST: &str = "text/uri-list";
const TEXT: &str = "text/plain;charset=utf-8";

#[derive(Default)]
struct State {
    seat: Option<WlSeat>,
    manager: Option<WlDataDeviceManager>,
    pointer: Option<WlPointer>,
    device: Option<WlDataDevice>,
    serial: Option<u32>,
    uris: Vec<u8>,
    text: Vec<u8>,
    hovering: Option<WlDataOffer>,
    position: (f64, f64),
    active: bool,
    own_drag: bool,
    copy_modifier: bool,
    receiving: Option<(
        WlDataOffer,
        mpsc::Receiver<Result<Vec<PathBuf>, String>>,
        (f64, f64),
        bool,
    )>,
}

pub struct Dnd {
    connection: Connection,
    queue: EventQueue<State>,
    state: State,
    surface: WlSurface,
}

impl Dnd {
    /// None on X11 or when the compositor lacks a data-device manager.
    pub fn new(window: &Window) -> Option<Self> {
        let RawDisplayHandle::Wayland(display) = window.display_handle().ok()?.as_raw() else {
            return None;
        };
        let RawWindowHandle::Wayland(handle) = window.window_handle().ok()?.as_raw() else {
            return None;
        };
        // SAFETY: winit keeps the wl_display alive for the window's lifetime, and
        // this struct is dropped before the window (see Shell field order).
        let backend = unsafe { Backend::from_foreign_display(display.display.as_ptr().cast()) };
        let connection = Connection::from_backend(backend);
        let mut queue = connection.new_event_queue();
        let qh = queue.handle();
        connection.display().get_registry(&qh, ());
        let mut state = State::default();
        queue.roundtrip(&mut state).ok()?;
        queue.roundtrip(&mut state).ok()?;
        let (seat, manager) = (state.seat.clone()?, state.manager.clone()?);
        state.device = Some(manager.get_data_device(&seat, &qh, ()));
        // SAFETY: the pointer is winit's live wl_surface for this window.
        let id =
            unsafe { ObjectId::from_ptr(WlSurface::interface(), handle.surface.as_ptr().cast()) }
                .ok()?;
        let surface = WlSurface::from_id(&connection, id).ok()?;
        connection.flush().ok()?;
        Some(Self {
            connection,
            queue,
            state,
            surface,
        })
    }
    /// Handle queued protocol events; cheap and non-blocking.
    pub fn pump(&mut self) {
        let _ = self.queue.dispatch_pending(&mut self.state);
        let _ = self.connection.flush();
    }
    pub fn active(&self) -> bool {
        self.state.active || self.state.own_drag || self.state.receiving.is_some()
    }
    pub fn position(&self) -> Option<(f64, f64)> {
        self.state.hovering.as_ref().map(|_| self.state.position)
    }
    pub fn set_copy_modifier(&mut self, copy: bool) {
        self.state.copy_modifier = copy;
    }
    pub fn take_drop(&mut self) -> Option<(Result<Vec<PathBuf>, String>, (f64, f64), bool)> {
        let (_, receiver, _, _) = self.state.receiving.as_ref()?;
        let result = match receiver.try_recv() {
            Ok(result) => result,
            Err(mpsc::TryRecvError::Empty) => return None,
            Err(_) => Err("Drop reader stopped".into()),
        };
        let (offer, _, position, moving) = self.state.receiving.take()?;
        if offer.version() >= 3 && result.is_ok() {
            offer.finish();
        }
        offer.destroy();
        Some((result, position, moving))
    }
    /// Begin a drag of `paths` from the button press that is still held.
    pub fn start(&mut self, paths: &[PathBuf]) -> Result<(), String> {
        self.pump();
        let serial = self.state.serial.ok_or("Drag needs a pointer press")?;
        let manager = self
            .state
            .manager
            .as_ref()
            .ok_or("No data-device manager")?;
        let device = self.state.device.as_ref().ok_or("No data device")?;
        self.state.own_drag = true;
        self.state.uris = uri_list(paths);
        self.state.text = paths
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("\n")
            .into_bytes();
        let source = manager.create_data_source(&self.queue.handle(), ());
        source.offer(URI_LIST.into());
        source.offer(TEXT.into());
        if source.version() >= 3 {
            source.set_actions(DndAction::Copy);
        }
        device.start_drag(Some(&source), &self.surface, None, serial);
        self.connection.flush().map_err(|e| e.to_string())
    }
}

/// RFC 8089 file URIs, percent-encoding every byte outside the unreserved set.
pub fn uri_list(paths: &[PathBuf]) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;
    let mut out = Vec::new();
    for path in paths {
        out.extend_from_slice(b"file://");
        for &b in path.as_os_str().as_bytes() {
            if b.is_ascii_alphanumeric() || b"-._~/".contains(&b) {
                out.push(b);
            } else {
                out.extend_from_slice(format!("%{b:02X}").as_bytes());
            }
        }
        out.extend_from_slice(b"\r\n");
    }
    out
}

impl Dispatch<WlRegistry, ()> for State {
    fn event(
        state: &mut Self,
        registry: &WlRegistry,
        event: wl_registry::Event,
        _: &(),
        _: &Connection,
        qh: &QueueHandle<Self>,
    ) {
        if let wl_registry::Event::Global {
            name,
            interface,
            version,
        } = event
        {
            match interface.as_str() {
                "wl_seat" if state.seat.is_none() => {
                    state.seat = Some(registry.bind(name, version.min(5), qh, ()));
                }
                "wl_data_device_manager" if state.manager.is_none() => {
                    state.manager = Some(registry.bind(name, version.min(3), qh, ()));
                }
                _ => {}
            }
        }
    }
}

impl Dispatch<WlSeat, ()> for State {
    fn event(
        state: &mut Self,
        seat: &WlSeat,
        event: wl_seat::Event,
        _: &(),
        _: &Connection,
        qh: &QueueHandle<Self>,
    ) {
        if let wl_seat::Event::Capabilities {
            capabilities: WEnum::Value(caps),
        } = event
            && caps.contains(wl_seat::Capability::Pointer)
            && state.pointer.is_none()
        {
            state.pointer = Some(seat.get_pointer(qh, ()));
        }
    }
}

impl Dispatch<WlPointer, ()> for State {
    fn event(
        state: &mut Self,
        _: &WlPointer,
        event: wl_pointer::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        if let wl_pointer::Event::Button {
            serial,
            state: WEnum::Value(wl_pointer::ButtonState::Pressed),
            ..
        } = event
        {
            state.serial = Some(serial);
        }
    }
}

impl Dispatch<WlDataDeviceManager, ()> for State {
    fn event(
        _: &mut Self,
        _: &WlDataDeviceManager,
        _: <WlDataDeviceManager as Proxy>::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
    }
}

#[derive(Default)]
struct Offer {
    uri: Mutex<bool>,
}
impl Dispatch<WlDataDevice, ()> for State {
    fn event(
        state: &mut Self,
        _: &WlDataDevice,
        event: wl_data_device::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        match event {
            wl_data_device::Event::Selection { id: Some(offer) } => offer.destroy(),
            wl_data_device::Event::Enter {
                serial, id, x, y, ..
            } => {
                state.active = true;
                state.position = (x, y);
                if let Some(old) = std::mem::replace(&mut state.hovering, id) {
                    old.destroy();
                }
                if let Some(offer) = &state.hovering {
                    let supported = *offer.data::<Offer>().unwrap().uri.lock().unwrap();
                    offer.accept(serial, supported.then(|| URI_LIST.to_string()));
                    if offer.version() >= 3 {
                        offer.set_actions(
                            if supported {
                                DndAction::Copy
                            } else {
                                DndAction::None
                            },
                            if supported {
                                DndAction::Copy
                            } else {
                                DndAction::None
                            },
                        );
                    }
                }
            }
            wl_data_device::Event::Motion { x, y, .. } => state.position = (x, y),
            wl_data_device::Event::Leave => {
                state.active = false;
                if let Some(old) = state.hovering.take() {
                    old.destroy();
                }
            }
            wl_data_device::Event::Drop => {
                state.active = false;
                if let Some(offer) = state.hovering.take() {
                    if !*offer.data::<Offer>().unwrap().uri.lock().unwrap() {
                        offer.destroy();
                        return;
                    }
                    let Ok((read, write)) = UnixStream::pair() else {
                        offer.destroy();
                        return;
                    };
                    let _ = read.set_read_timeout(Some(std::time::Duration::from_secs(10)));
                    offer.receive(URI_LIST.into(), write.as_fd());
                    drop(write);
                    let (tx, rx) = mpsc::channel();
                    std::thread::spawn(move || {
                        let mut bytes = Vec::new();
                        let result = read
                            .take(8 * 1024 * 1024 + 1)
                            .read_to_end(&mut bytes)
                            .map_err(|e| e.to_string())
                            .and_then(|_| {
                                if bytes.len() > 8 * 1024 * 1024 {
                                    Err("Drop data is too large".into())
                                } else {
                                    parse_uri_list(&bytes)
                                }
                            });
                        let _ = tx.send(result);
                    });
                    // A second drop cannot displace an unfinished data transfer.
                    if let Some((old, _, _, _)) = state.receiving.take() {
                        old.destroy();
                    }
                    state.receiving = Some((
                        offer,
                        rx,
                        state.position,
                        state.own_drag && !state.copy_modifier,
                    ));
                }
            }
            _ => {}
        }
    }
    event_created_child!(State, WlDataDevice, [
        wl_data_device::EVT_DATA_OFFER_OPCODE => (WlDataOffer, Offer::default()),
    ]);
}
impl Dispatch<WlDataOffer, Offer> for State {
    fn event(
        _: &mut Self,
        _: &WlDataOffer,
        event: wl_data_offer::Event,
        data: &Offer,
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        if let wl_data_offer::Event::Offer { mime_type } = event
            && mime_type == URI_LIST
        {
            *data.uri.lock().unwrap() = true;
        }
    }
}

/// Accept local file URIs only, preserving arbitrary Unix filename bytes.
pub fn parse_uri_list(bytes: &[u8]) -> Result<Vec<PathBuf>, String> {
    use std::os::unix::ffi::OsStringExt;
    let mut paths = vec![];
    for line in bytes.split(|&b| b == b'\n') {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.is_empty() || line.starts_with(b"#") {
            continue;
        }
        let rest = line
            .strip_prefix(b"file://")
            .ok_or("Only local file URLs can be dropped")?;
        let path = if rest.starts_with(b"/") {
            rest
        } else {
            rest.strip_prefix(b"localhost/")
                .map(|p| &rest[rest.len() - p.len() - 1..])
                .ok_or("Remote file hosts are not supported")?
        };
        let mut out = vec![];
        let mut i = 0;
        while i < path.len() {
            if path[i] == b'%' {
                if i + 2 >= path.len() {
                    return Err("Invalid file URL escape".into());
                }
                let hex = |b: u8| (b as char).to_digit(16).map(|v| v as u8);
                out.push(
                    hex(path[i + 1]).ok_or("Invalid URL escape")? * 16
                        + hex(path[i + 2]).ok_or("Invalid URL escape")?,
                );
                i += 3;
            } else {
                if b"?#".contains(&path[i]) {
                    return Err("File URL must escape ? and #".into());
                }
                out.push(path[i]);
                i += 1;
            }
        }
        if out.contains(&0) {
            return Err("NUL in filename".into());
        }
        paths.push(PathBuf::from(std::ffi::OsString::from_vec(out)));
    }
    if paths.is_empty() {
        return Err("No local files in drop".into());
    }
    Ok(paths)
}

impl Dispatch<WlDataSource, ()> for State {
    fn event(
        state: &mut Self,
        source: &WlDataSource,
        event: wl_data_source::Event,
        _: &(),
        _: &Connection,
        _: &QueueHandle<Self>,
    ) {
        match event {
            wl_data_source::Event::Send { mime_type, fd } => {
                let data = if mime_type == URI_LIST {
                    &state.uris
                } else {
                    &state.text
                };
                let data = data.clone();
                std::thread::spawn(move || {
                    let mut file = std::fs::File::from(OwnedFd::from(fd));
                    let _ = file.write_all(&data);
                });
            }
            wl_data_source::Event::Cancelled | wl_data_source::Event::DndFinished => {
                state.own_drag = false;
                source.destroy();
            }
            _ => {}
        }
    }
}
