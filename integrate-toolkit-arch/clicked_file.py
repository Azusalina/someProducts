"""Resolve the item at a KWin click through AT-SPI; never guess from selection.

Dolphin exposes the view's directory as the final part of its accessible
description and each item's exact filename as its name. Split views are resolved
by the hit item's own parent. Remote/search views and ambiguous paths fail closed.
"""
import re
from pathlib import Path
from urllib.parse import unquote, urlparse


def local_directory(description):
    candidates = set()
    # The directory is the final substitution in Dolphin's localized description.
    # Try only absolute-path suffixes; spaces and translated prose are preserved.
    for match in re.finditer(r'file://|(?<!\S)/', description):
        value = description[match.start():].strip()
        if value.startswith('file://'):
            parsed = urlparse(value)
            if parsed.netloc not in {'', 'localhost'}: continue
            value = unquote(parsed.path)
        candidate = Path(value)
        if candidate.is_absolute() and candidate.is_dir(): candidates.add(candidate.resolve())
    if len(candidates) != 1:
        raise ValueError('The clicked view does not expose one exact local directory. Use Dolphin’s Toolkit context action.')
    return candidates.pop()


def resolve_clicked(x, y, pid, frame=None, title=None):
    import gi
    gi.require_version('Atspi', '2.0')
    from gi.repository import Atspi
    Atspi.set_timeout(1200, 2000)
    desktop = Atspi.get_desktop(0)
    apps = [app for app in desktop if app.get_process_id() == pid]
    if len(apps) != 1:
        raise ValueError('The file manager is not exposing accessibility data. Enable accessibility and reopen Dolphin, or use its Toolkit context action.')
    windows = [window for window in apps[0] if window.get_name() == title] if title else list(apps[0])
    if len(windows) != 1:
        raise ValueError('The clicked window cannot be identified unambiguously. Use the file’s Toolkit context action.')
    window = windows[0]
    if frame:
        # Wayland clients cannot discover global placement themselves. Map the
        # compositor's client rectangle into this window's AT-SPI coordinate space.
        bounds = window.get_component_iface().get_extents(Atspi.CoordType.SCREEN)
        fx, fy, fw, fh = frame
        if min(fw, fh, bounds.width, bounds.height) <= 0: raise ValueError('The clicked window has no usable bounds.')
        x = round(bounds.x + (x - fx) * bounds.width / fw)
        y = round(bounds.y + (y - fy) * bounds.height / fh)
    candidates = []
    visited = 0

    def descend(node, depth=0):
        nonlocal visited
        visited += 1
        if depth > 35 or visited > 5000: return
        try:
            component = node.get_component_iface()
            inside = component and component.contains(x, y, Atspi.CoordType.SCREEN)
            if not inside and depth > 1: return
            role = node.get_role()
            if role in {Atspi.Role.LIST_ITEM, Atspi.Role.TABLE_CELL, Atspi.Role.ICON} and inside:
                name = node.get_name()
                if name and '/' not in name and name not in {'.', '..'}:
                    parent = node.get_parent()
                    for _ in range(5):
                        if parent is None: break
                        try:
                            directory = local_directory(parent.get_description() or '')
                            # Dolphin's expanded details rows still report the
                            # model-root list as their parent. Without a per-row
                            # URL, root/name could silently identify another file.
                            if parent.get_child_count() > 5000: break
                            expanded = any(child.get_state_set().contains(Atspi.StateType.EXPANDED) for child in parent)
                            if expanded: break
                            result = directory / name
                            if result.is_file(): candidates.append(result.resolve())
                            break
                        except ValueError: parent = parent.get_parent()
            # Point hit testing avoids enumerating a directory's thousands of items.
            hit = component.get_accessible_at_point(x, y, Atspi.CoordType.SCREEN) if component else None
            if hit and hit != node:
                descend(hit, depth + 1)
            else:
                for child in node: descend(child, depth + 1)
        except Exception:
            return

    descend(window)
    results = set(candidates)
    if len(results) != 1:
        raise ValueError('No unambiguous local file was exposed at the click. Try the file’s Toolkit context action. Search results, remote files and some desktop views need that action.')
    return str(results.pop())
