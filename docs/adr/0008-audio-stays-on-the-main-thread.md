# Audio stays on the main thread, and owns the clock

Despite ADR 0003 putting the engine in a worker, audio playback and mixing run on the main thread through the Web Audio API, and the export mix is produced by an `OfflineAudioContext` there too. The worker decodes audio samples and renders video; it does not play sound. `AudioContext` is only exposed to Window, so this is not entirely a preference — the alternative is mixing Float32 by hand and pushing it through an AudioWorklet, which means implementing every fade, pan, EQ and compressor ourselves.

The audio clock is therefore the master clock: `audioContext.currentTime` on the main thread is converted to a Frame and posted to the worker, which renders that Frame and drops any it cannot reach in time. Video follows audio; audio never waits for video.

## Consequences

- The engine is split across two threads by domain, not one: video in the worker, audio in the window. "One engine" (ADR 0003) holds for the picture, and separately for the sound.
- Playback and Export share the same audio graph construction, so the mix cannot diverge between what you hear and what you get.
- A main thread stalled by React work will stutter audio. Heavy UI work has to stay off the critical path, which is a constraint the worker was supposed to buy us and only buys us for video.
