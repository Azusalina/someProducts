//! Drag files out of the window (into a browser upload field, a chat, a file
//! manager). winit cannot be a drag source, so this speaks the Wayland
//! data-device protocol on winit's own connection, with a private event queue:
//! a second wl_pointer supplies the button serial `start_drag` requires, and
//! the data source answers `text/uri-list` / `text/plain` requests.
use std::{io::Write, os::fd::OwnedFd, path::PathBuf};
use wayland_backend::client::{Backend, ObjectId};
use wayland_client::{
    Connection, Dispatch, EventQueue, Proxy, QueueHandle, WEnum, event_created_child,
    protocol::{
        wl_data_device::{self, WlDataDevice},
        wl_data_device_manager::{DndAction, WlDataDeviceManager},
        wl_data_offer::WlDataOffer,
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
        let id = unsafe { ObjectId::from_ptr(WlSurface::interface(), handle.surface.as_ptr().cast()) }.ok()?;
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
    /// Begin a drag of `paths` from the button press that is still held.
    pub fn start(&mut self, paths: &[PathBuf]) -> Result<(), String> {
        self.pump();
        let serial = self.state.serial.ok_or("Drag needs a pointer press")?;
        let manager = self.state.manager.as_ref().ok_or("No data-device manager")?;
        let device = self.state.device.as_ref().ok_or("No data device")?;
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
    fn event(state: &mut Self, registry: &WlRegistry, event: wl_registry::Event, _: &(), _: &Connection, qh: &QueueHandle<Self>) {
        if let wl_registry::Event::Global { name, interface, version } = event {
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
    fn event(state: &mut Self, seat: &WlSeat, event: wl_seat::Event, _: &(), _: &Connection, qh: &QueueHandle<Self>) {
        if let wl_seat::Event::Capabilities { capabilities: WEnum::Value(caps) } = event
            && caps.contains(wl_seat::Capability::Pointer)
            && state.pointer.is_none()
        {
            state.pointer = Some(seat.get_pointer(qh, ()));
        }
    }
}

impl Dispatch<WlPointer, ()> for State {
    fn event(state: &mut Self, _: &WlPointer, event: wl_pointer::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {
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
    fn event(_: &mut Self, _: &WlDataDeviceManager, _: <WlDataDeviceManager as Proxy>::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
}

impl Dispatch<WlDataDevice, ()> for State {
    fn event(state: &mut Self, _: &WlDataDevice, event: wl_data_device::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {
        // Offers from other clients (clipboard, drags over us) are not used here;
        // release them so they do not accumulate.
        match event {
            wl_data_device::Event::Selection { id: Some(offer) } => offer.destroy(),
            wl_data_device::Event::Enter { id, .. } => {
                if let Some(old) = std::mem::replace(&mut state.hovering, id) {
                    old.destroy();
                }
            }
            wl_data_device::Event::Leave | wl_data_device::Event::Drop => {
                if let Some(old) = state.hovering.take() {
                    old.destroy();
                }
            }
            _ => {}
        }
    }
    event_created_child!(State, WlDataDevice, [
        wl_data_device::EVT_DATA_OFFER_OPCODE => (WlDataOffer, ()),
    ]);
}

impl Dispatch<WlDataOffer, ()> for State {
    fn event(_: &mut Self, _: &WlDataOffer, _: <WlDataOffer as Proxy>::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {}
}

impl Dispatch<WlDataSource, ()> for State {
    fn event(state: &mut Self, source: &WlDataSource, event: wl_data_source::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {
        match event {
            wl_data_source::Event::Send { mime_type, fd } => {
                let data = if mime_type == URI_LIST { &state.uris } else { &state.text };
                let mut file = std::fs::File::from(OwnedFd::from(fd));
                let _ = file.write_all(data);
            }
            wl_data_source::Event::Cancelled | wl_data_source::Event::DndFinished => source.destroy(),
            _ => {}
        }
    }
}
