# Ballade IV Waterfall — description

## Method
- The PDF is a Sibelius vector export (Opus fonts, no images). `omr/` reads glyphs and paths with PyMuPDF: staves, clefs, key signature, accidentals, noteheads, stems, beams, flags, dots, rests, ties, 8va lines. Pages are analysed in parallel on all CPU cores (about 1 s for 21 pages).
- **Pitch/hand/position/ties** come from the PDF. **Rhythm** comes from the Mutopia MIDI (Joseffy edition), matched head-by-head by pitch and order within the bar. The RH track drifts a constant −30 ticks against the LH, which is corrected per bar from columns the PDF shows as simultaneous. Onsets are snapped to 1/24 beat.
- `web/` is a static app: Canvas waterfall, pre-rendered pages with percentage-positioned highlights, and WebAudio. Microphone audio goes AudioWorklet → MessagePort → Web Worker. The worker does FFT calibration (f0, inharmonicity, partial amplitudes per note), joint non-negative fitting of expected notes, iterative cancellation for unexpected ones, and spectral-flux/amplitude-rise onset detection.

## Piano sound
- Display mode plays recorded grand-piano samples, not a synthesizer. `web/assets/piano/` holds 30 MP3s (A0, then C, D#, F# and A of each octave, up to C8, about 2 MB). `web/js/synth.js` decodes them once at page load and plays each note by resampling the nearest sample (at most a minor third away, so at most ±1.5 semitones of stretch).
- Each note is held for its notated length, then damped with an exponential release (slower in the bass, faster in the treble). Velocity scales both the gain and a low-pass filter, so softer notes sound duller. Pausing, seeking or muting fades out anything still ringing.
- There is one velocity layer and no pedal, so sustained passages are as long as the score says, not as long as a pedalled performance. If the samples fail to load, `synth.js` falls back to the old additive oscillator voice.
- Samples: Salamander Grand Piano V3 by Alexander Holm, licensed CC BY 3.0 (<https://creativecommons.org/licenses/by/3.0/>), in the MP3 conversion distributed with Tone.js (<https://tonejs.github.io/audio/salamander/>). Changes: none to the audio; pitches between samples are produced by playback-rate resampling.

## Validation (coda m.168–239, 2146 notes)
- Pitch vs the independent MIDI: 2090 of 2143 PDF notes are identical (97.5%). 44 of 72 bars are identical.
- Remaining differences were inspected visually for m.172–226 and m.234. They are edition differences (the printed sheet contains notes, octaves or accidentals the MIDI lacks) or ornament placement at barlines. The PDF is treated as authoritative.
- Bugs found and fixed through this audit: tie detection (dots, cross-system, wrong chord tone), 8va line owned by the wrong staff, bass notes shifted −12.
- Microphone, synthetic piano audio (different timbre, +6 cent tuning): calibration recovers the tuning exactly; sparse steps 24/24 with no false onsets; dense 5–9 note chords about 85% (octave doubles are inferred from the lower note).
- `tests/browser.mjs`: 16/16 checks including piano-sample loading, note triggering, pause silencing and a live fake-microphone session (22 steps advanced). The tests confirm the audio graph runs; they do not judge how the piano sounds.

## Limitations / not done
- **Timing is not independently verified.** 63 notes (about 3%) have no MIDI partner and use interpolated timing. Notated durations are from the PDF with a 1 or 2/3 tuplet scale guessed from beam groups; tied notes are merged.
- m.172, 173, 188–193, 200–214, 218–225 and the m.163–167 cadenza were not all reviewed visually. Only m.168–239 is exported. The solver in `omr/timing.py` (PDF-only rhythm) is incomplete and unused by the build.
- Grace notes and ornaments (trills, arpeggio marks) are shown as plain notes. Only 3 grace notes are flagged in the coda.
- Tested only with synthetic audio, not a real piano. GPU: this machine has no usable GPU driver, so the processing is CPU-parallel only and the waterfall uses Canvas 2D (browser-accelerated).
- The MIDI and any third-party material are used under their own licences; licensing is left to the owner.

## Files
`omr/` extractor and score builder · `tools/` build, export and audit scripts · `web/` the app, data and piano samples (`web/assets/piano/`) · `tests/` browser, offline-audio and synthetic-audio tests · `sheet-pdf/` source PDF.
