"""Hold a Plasma sleep/screen inhibition on a persistent session-bus connection."""
import asyncio
import signal
import os
import sys
from dbus_next import Message, MessageType
from dbus_next.aio import MessageBus

DEST = 'org.kde.Solid.PowerManagement.PolicyAgent'
PATH = '/org/kde/Solid/PowerManagement/PolicyAgent'
REASON = 'Keep awake: automatic sleep and screen off'

async def main():
    bus = await MessageBus().connect()
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stopped.set)
    # EOF also ends the lease if the bridge crashes or is killed.
    def parent_input():
        if not os.read(sys.stdin.fileno(), 1):
            loop.remove_reader(sys.stdin.fileno())
            stopped.set()
    loop.add_reader(sys.stdin.fileno(), parent_input)
    cookie = None
    screensaver_cookie = None
    try:
        # InterruptSession (1) | ChangeScreenSettings (4).
        reply = await asyncio.wait_for(bus.call(Message(destination=DEST, path=PATH,
            interface=DEST, member='AddInhibition', signature='uss',
            body=[5, 'someProducts-monitor', REASON])), 2)
        if reply.message_type == MessageType.ERROR or not reply.body:
            raise RuntimeError('Plasma refused the inhibition')
        cookie = reply.body[0]
        # Idle locking otherwise overrides PowerDevil's screen inhibition.
        idle = await asyncio.wait_for(bus.call(Message(destination='org.freedesktop.ScreenSaver',
            path='/ScreenSaver', interface='org.freedesktop.ScreenSaver', member='Inhibit',
            signature='ss', body=['someProducts-monitor', REASON])), 2)
        if idle.message_type == MessageType.ERROR or not idle.body:
            raise RuntimeError('Idle screen inhibition unavailable')
        screensaver_cookie = idle.body[0]
        # PowerDevil deliberately delays enforcement by five seconds. Wait
        # for an allowed, active sleep+idle request before acknowledging On.
        try:
            await asyncio.wait_for(stopped.wait(), 5.2)
            return
        except asyncio.TimeoutError:
            pass
        deadline = loop.time() + 2
        confirmed = False
        while loop.time() < deadline and not stopped.is_set():
            status = await asyncio.wait_for(bus.call(Message(destination=DEST, path=PATH,
                interface='org.freedesktop.DBus.Properties', member='Get', signature='ss',
                body=[DEST, 'ActiveInhibitions'])), 1)
            if status.message_type != MessageType.ERROR and status.body:
                confirmed = any(row[1] == 'someProducts-monitor' and row[2] == REASON
                    and {'sleep', 'idle'} <= set(row[0].split(':')) and row[4] & 2
                    for row in status.body[0].value)
                if confirmed:
                    break
            try:
                await asyncio.wait_for(stopped.wait(), 0.25)
            except asyncio.TimeoutError:
                pass
        if not confirmed:
            raise RuntimeError('Plasma did not activate the inhibition')
        print('ready', flush=True)
        disconnect = asyncio.create_task(bus.wait_for_disconnect())
        stop = asyncio.create_task(stopped.wait())
        await asyncio.wait([disconnect, stop], return_when=asyncio.FIRST_COMPLETED)
        for task in (disconnect, stop):
            if not task.done():
                task.cancel()
    finally:
        if cookie is not None and bus.connected:
            try:
                await asyncio.wait_for(bus.call(Message(destination=DEST, path=PATH,
                    interface=DEST, member='ReleaseInhibition', signature='u', body=[cookie])), 1)
            except Exception:
                pass
        if screensaver_cookie is not None and bus.connected:
            try:
                await asyncio.wait_for(bus.call(Message(destination='org.freedesktop.ScreenSaver',
                    path='/ScreenSaver', interface='org.freedesktop.ScreenSaver', member='UnInhibit',
                    signature='u', body=[screensaver_cookie])), 1)
            except Exception:
                pass
        loop.remove_reader(sys.stdin.fileno())
        bus.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
