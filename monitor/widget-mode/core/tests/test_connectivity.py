import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))
import connectivity as c


class ConnectivityTests(unittest.TestCase):
    def test_escaped_wifi_and_proton_detection(self):
        text = 'Office\\: room\\\\2:PRIVATE_UUID:802-11-wireless:wlan0\nProtonVPN TW#32:OTHER_UUID:vpn:tun0'
        proton, wifi = c.parse_active(text)
        self.assertEqual(proton, {'connected': True, 'server': 'TW#32'})
        self.assertEqual(wifi['network'], 'Office: room\\2')
        self.assertNotIn('UUID', json.dumps([proton, wifi]))

    def test_unrelated_vpn_and_ipv6_protection_are_not_proton_connection(self):
        proton, wifi = c.parse_active('pvpn-killswitch-ipv6:1:dummy:pvpnksintrf0\nWork VPN:2:vpn:tun0')
        self.assertFalse(proton['connected'])
        self.assertFalse(wifi['connected'])

    def test_kill_switch_is_configured_mode_not_interface_inference(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'XDG_CONFIG_HOME': temp}):
            path = Path(temp)/'Proton/VPN/settings.json'
            path.parent.mkdir(parents=True)
            for value, label in [(0, 'Off'), (1, 'Standard'), (2, 'Advanced'), (99, None)]:
                path.write_text(json.dumps({'killswitch': value, 'private': 'SECRET'}))
                self.assertEqual(c.proton_settings(), label)

    def test_bluetooth_only_connected_device_names(self):
        state = c.parse_bluetooth({
            '/org/bluez/hci0': {'org.bluez.Adapter1': {'Powered': True, 'Address': 'PRIVATE_MAC'}},
            '/org/bluez/hci0/dev_1': {'org.bluez.Device1': {'Connected': True, 'Alias': 'Headphones', 'Address': 'PRIVATE_MAC'}},
            '/org/bluez/hci0/dev_2': {'org.bluez.Device1': {'Connected': False, 'Alias': 'Other'}}})
        self.assertEqual(state['devices'], ['Headphones'])
        self.assertTrue(state['enabled'])
        self.assertNotIn('PRIVATE', json.dumps(state))
        self.assertIsNone(c.parse_bluetooth({})['enabled'])

    def test_fixed_native_destinations_and_reject_commands(self):
        with patch.object(c.shutil, 'which', return_value='/usr/bin/native'), patch.object(c.subprocess, 'Popen') as launch:
            for target, expected in c.SETTINGS_COMMANDS.items():
                c.open_settings(target)
                self.assertEqual(launch.call_args.args[0], expected)
            with self.assertRaises(ValueError):
                c.open_settings('wifi; nmcli radio wifi off')
            self.assertEqual(launch.call_count, 3)
        with patch.object(c.shutil, 'which', return_value=None):
            with self.assertRaises(RuntimeError):
                c.open_settings('wifi')


if __name__ == '__main__':
    unittest.main()
