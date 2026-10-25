import QtQuick
import QtTest
import "../plasmoid/contents/ui"
Item {
    width: 400; height: 80
    MediaCard { id: media; anchors.fill: parent; players: [] }
    TestCase {
        name: "PlaybackAudioVisual"
        when: windowShown
        function test_01_quietGainAndSilence() {
            media.audioBars = [0, 0.001, 0.01, 0.1, 1, NaN, -1]
            compare(media.audioLevels[0], 0)
            compare(media.audioLevels[1], 0)
            verify(media.audioLevels[2] > 0.1)
            verify(media.audioLevels[3] > 0.5)
            compare(media.audioLevels[4], 1)
            compare(media.audioLevels[5], 0)
            compare(media.audioLevels[6], 0)
        }
        function test_02_playbackWithoutMprisAndDisable() {
            compare(media.players.length, 0)
            tryVerify(() => media.audioBars.length === 32, 7000)
            verify(findChild(media, "cavaBackground").visible)
            media.cavaEnabled = false
            compare(media.audioBars.length, 0)
            compare(media.audioRequest, null)
            verify(!findChild(media, "cavaBackground").visible)
            media.cavaEnabled = true
            tryVerify(() => media.audioBars.length === 32, 5000)
            media.cavaEnabled = false
        }
    }
}
