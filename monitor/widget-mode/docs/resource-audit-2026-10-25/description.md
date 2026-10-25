# Monitor 1.19.0 resource audit — 2026-10-25

Significant feature-preserving optimization is feasible. The current configuration
is inexpensive in disk space but is not an exceptionally low-CPU desktop widget.
The leading cost is GPU process-counter discovery; the current Canvas rendering
path also warrants optimization. This audit changes neither installed code nor
saved widget configuration. Prototypes exist only in this audit directory.

## Measured workload and resource use

The observed configuration was one 624×1168 desktop instance, 100ms statistics
requests, 100ms audio requests, a 15-second visible history window, one Ping
target, and eight enabled modules: CPU, RAM, Ping, GPU, media, note, battery,
and timers. Terminal, VPN and radio panels were not enabled in this observation.
Keep-awake and CAVA helper processes were present.

| Quantity | Result | Meaning |
| --- | ---: | --- |
| Backend + live helper CPU | 82.03% of one logical CPU | 4.10% of the machine's 20 logical CPUs; a single 30.06s observation |
| Backend + helper mean PSS | 42.63 MiB | Observed range 41.45–42.80 MiB |
| Backend PSS at end | 22.34 MiB | Python service |
| Keep-awake helper PSS at end | 14.13 MiB | Separate Python/D-Bus helper |
| CAVA PSS at end | 6.01 MiB | Shared playback spectrum process |
| Standalone UI incremental PSS | 60.32 MiB | Full preview minus a blank Qt window; software/offscreen proxy |
| Standalone UI CPU | 51.35% of one logical CPU | Software renderer; cannot be attributed directly to native Plasma |
| Combined proxy memory estimate | 102.95 MiB | 42.63 + 60.32; not a native per-applet measurement |
| Installed backend footprint | about 16 MiB | Includes its local Python dependencies |
| Installed Plasma package | 448 KiB | Excludes KDE/Qt libraries already installed on this desktop |

For the current workload, budget around **100 MiB**, with **80–120 MiB** a
planning range rather than a measured confidence interval or hard cap. Additional
detached views, longer-lived histories, terminal scrollback and programs launched
inside terminals can increase consumption. The earlier approximately 69 MiB
estimate used a smaller, differently populated preview and different helper state;
it should not be reused as an exact figure for this configuration.

The backend's persistent sampling thread alone consumed 56.15% of one logical CPU
in the passive observation. Its process recorded about 74,387 read syscalls/s and
10.85 MiB/s of reads including procfs. These are virtual-file reads, not equivalent
to disk throughput. CPU sampling and RAM sampling are much cheaper than GPU
process-counter discovery.

The whole Plasma process was also observed, but its memory and CPU include the
entire desktop and other components. They are deliberately not charged to Monitor.

## Collector evidence and temporary prototype

The final seven-trial microbenchmark produced:

| Operation | Median wall time | Median CPU time |
| --- | ---: | ---: |
| Existing GPU client scan | 65.12ms | 63.49ms |
| Scandir/open scan | 54.75ms | 51.86ms |
| Scandir + definite non-device FD filter | 42.17ms | 40.87ms |
| Complete existing GPU sample | 90.02ms | 65.25ms, excluding waited subprocess CPU |
| CPU sample | 1.50ms | 1.12ms |
| RAM sample | 0.05ms | 0.05ms |

An earlier trial observed approximately 110ms client scans. Process populations,
open descriptors, caching and desktop activity change these costs; comparisons
should use the paired trials, not treat the absolute times as fixed constants.
The profiled GPU sample performed thousands of fdinfo reads. The live machine
exposed Intel i915 counters without a direct gpu_busy_percent sysfs counter.
The NVIDIA query executable was installed, but this observation's GPU sample
returned only Intel graphics; per-sample NVIDIA command attempts should be reviewed.

The temporary FD-filter prototype reduced scan CPU time by **35.6%** in its paired
trial. It still scans all same-user processes at the existing cadence, reads
device/unknown FD types, and falls back to fdinfo when metadata is inaccessible.
Stable DRM-client keys were checked against baseline scans before and after each
trial and matched. This does **not** establish full production equivalence: new
processes, FD reuse, permission failures, hot-plug and other supported drivers
need explicit regression checks. The result is a per-scan improvement, not an
already achieved 35.6% reduction in total widget CPU. Nothing was installed.

## Feature-preserving optimization order

1. **Reduce GPU discovery work first.** Apply and validate the complete-scan
   FD-filter approach, remove avoidable Path/text allocations, and avoid repeated
   unsuccessful NVIDIA CLI probes after capability discovery. Retain hot-plug and
   recovery behavior; use persistent library queries for a real NVIDIA device
   rather than launching a command per sample. Keep the configured sampling rate,
   new-client coverage and unknown/unavailable states intact.
2. **Cache curve geometry and animate its transform.** Sparkline currently
   generates timestamped points and calls Canvas drawing functions on animated
   window-end changes. Rebuild geometry on new samples or appearance/window
   changes, then use scene-graph translation/clipping for intermediate frames.
   Preserve timestamp-based speed, peak heights, missing-data gaps, colors and
   transparency. Skip drawing genuinely clipped regions while continuing their
   required sampling/history. This needs resource A/B tests; no saving percentage
   is established yet.
3. **Keep audio delegates and feeds stable.** MediaCard and FocusAmbient assign
   new amplitude arrays as Repeater models. Use fixed frequency-bin delegates
   bound to indexed values, and share one audio feed across views. This reduces
   model/delegate churn and duplicate HTTP work while retaining the same bars,
   FFT source, sensitivity and playback controls. Retain CAVA initially; its live
   CPU contribution was small compared with GPU discovery.
4. **Consolidate ownership and IPC.** Share snapshot/config/audio subscriptions
   across detached views, retain one monotonic timer owner and one presentation
   ticker, and use file-change/DBus notifications with existing correctness and
   recovery semantics. The 14 MiB keep-awake helper is a useful consolidation
   candidate, provided token ownership, expiry and crash cleanup remain intact.
5. **For the lowest memory footprint, evaluate a native core.** The existing C++
   integration provides a starting point for native sampling/DBus operations and
   rendering. Keep terminal parsing available on demand and retain standalone
   preview/service compatibility. A substantial native rewrite has higher
   maintenance and regression cost; it should follow the measured low-risk wins,
   not carry an unverified promise of a minimum RAM or CPU number.

These steps preserve capabilities and the selected sampling/history behavior.
They are not a proposal to remove modules, flatten trajectories, ignore newly
created GPU clients or reduce sampling simply to improve a benchmark. Feature
parity should be checked with the existing backend/QML/native split-merge tests,
plus collector lifecycle tests and resource comparisons at identical settings.

## Method and limitations

- `live_probe.py` sampled the service tree for 30 seconds without changing live
  configuration. CPU includes waited children and live descendants; PSS apportions
  shared pages. Persistent thread counters identify the sampling hotspot.
- `gui_probe.py` compared a blank Qt window and a same-size/rate/module preview.
  The widget received 35s warm-up and 15s CPU measurement; the blank window received
  3s warm-up and 10s measurement. The preview used empty notes/tasks and default
  appearance/layout heights rather than copying private content. Its config pages
  are also instantiated differently from the native applet. Consequently its
  memory increment and software-render CPU are proxies, not native per-applet
  accounting. The history retention buffer had not necessarily reached its full
  130-second steady-state lifetime.
- The standalone fullscreen probe failed in the PySide/Shiboken binding layer.
  No fullscreen resource result is claimed. This is an audit harness failure, not
  evidence that the installed fullscreen feature failed.
- No VRAM, battery watts, actual external network throughput or long-running
  embedded-terminal workload was measured. Ping's nominal successful-probe ceiling
  at 100ms is 10 probes/s/target; timeouts and worker limits can lower it.
- Measurements are environment-dependent. No production optimization, service
  restart, playback command, saved-settings change or Git action was performed.
  Preview tests used isolated settings and private transient timer sessions.

Evidence: [summary](summary.json), [live counters](live.json),
[collector trials](collectors.json), [collector profile](collector-cprofile.txt),
[GUI proxy](gui.json), [fullscreen probe limitation](gui-focus.json).
