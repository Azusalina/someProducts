#!/usr/bin/env python3
"""Isolated MPRIS player for integration tests; does not play actual media."""
import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

DBusGMainLoop(set_as_default=True)
PLAYER = 'org.mpris.MediaPlayer2.Player'
PROPS = 'org.freedesktop.DBus.Properties'


class TestPlayer(dbus.service.Object):
    def __init__(self, bus):
        self.status = 'Playing'
        super().__init__(bus, '/org/mpris/MediaPlayer2')

    def properties(self):
        return {'PlaybackStatus': dbus.String(self.status),
                'CanControl': dbus.Boolean(True), 'CanPause': dbus.Boolean(True),
                'CanPlay': dbus.Boolean(True),
                'Metadata': dbus.Dictionary({'xesam:title': dbus.String('Monitor integration test video'),
                                             'xesam:artist': dbus.Array(['Test fixture'], signature='s')}, signature='sv')}

    @dbus.service.method(PROPS, in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        return self.properties() if interface == PLAYER else {'Identity': dbus.String('Monitor test player')}

    @dbus.service.method(PROPS, in_signature='ss', out_signature='v')
    def Get(self, interface, property):
        return self.GetAll(interface)[property]

    @dbus.service.signal(PROPS, signature='sa{sv}as')
    def PropertiesChanged(self, interface, changed, invalidated):
        pass

    @dbus.service.method(PLAYER)
    def PlayPause(self):
        self.status = 'Paused' if self.status == 'Playing' else 'Playing'
        self.PropertiesChanged(PLAYER, {'PlaybackStatus': dbus.String(self.status)}, [])


bus = dbus.SessionBus()
name = dbus.service.BusName('org.mpris.MediaPlayer2.MonitorTest', bus)
player = TestPlayer(bus)
print('READY', flush=True)
GLib.MainLoop().run()
